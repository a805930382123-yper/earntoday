"""Deterministic local compositing over read-only production PNGs.

The user explicitly requires extraction/compositing and exact non-action pixels.
AI output supplies only hand-painted eye/mouth inserts. Ear/tip motion resamples
the original textured local region, with a zero-displacement connection boundary.
"""
from pathlib import Path
from collections import deque
from io import BytesIO
import time
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs/action-repair"
OUT = ROOT / "src/dev/repaired"
LOSSLESS = DOC / "lossless"
DIFFS = DOC / "diffs"
for directory in (OUT, LOSSLESS, DIFFS):
    directory.mkdir(parents=True, exist_ok=True)


def save_png(image, path, **kwargs):
    # Avoid partially-written images and transient Windows/Vite read locks.
    buffer = BytesIO(); image.save(buffer, format="PNG", **kwargs)
    temp = path.with_name(path.name + ".writing")
    temp.write_bytes(buffer.getvalue())
    for attempt in range(6):
        try:
            temp.replace(path)
            return
        except OSError:
            if attempt == 5: raise
            time.sleep(.1)

BASES = {"blue": "src/assets/chibi-girl-top.png", "mibao": "src/assets/mibao/working.png"}
base = {key: Image.open(ROOT / path).convert("RGBA") for key, path in BASES.items()}
hashes = {key: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for key, path in BASES.items()}
FACE = (440, 300, 870, 510)
EYES = [
    [(471, 324), (515, 327), (567, 339), (607, 350), (614, 361), (608, 377),
     (597, 416), (577, 432), (544, 433), (511, 423), (488, 405), (476, 378), (470, 347)],
    [(690, 375), (726, 379), (767, 393), (809, 409), (849, 426), (859, 435),
     (847, 456), (825, 477), (796, 483), (767, 490), (735, 490), (710, 478), (694, 460), (684, 435), (683, 409)],
]
MOUTH = [(609, 450), (655, 450), (658, 475), (650, 498), (637, 494),
         (620, 488), (612, 486), (609, 480)]


def polygon_mask(size, polygons):
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(polygon, fill=255)
    return mask


eye_mask = polygon_mask(base["blue"].size, EYES)
mouth_mask = polygon_mask(base["blue"].size, [MOUTH])
# Exclude the blue hair connected to the original hair mass, including pixels
# inside the loose eye polygon corners. Irises are separate connected islands.
blue_pixels = np.array(base["blue"])
hair_candidate = ((blue_pixels[:, :, 2].astype(int) - blue_pixels[:, :, 0]) > 12) & (blue_pixels[:, :, 3] > 200)
iris_pixels = np.zeros(hair_candidate.shape, dtype=bool)
for point in [(550, 380), (750, 440)]:
    # copy() is essential: Pillow's array-backed L image has read-only pixels.
    binary = Image.fromarray(np.where(hair_candidate, 255, 0).astype("uint8")).copy()
    assert binary.getpixel(point) == 255
    ImageDraw.floodfill(binary, point, 128, thresh=0)
    component = np.array(binary) == 128
    assert 3000 < int(component.sum()) < 7000
    iris_pixels |= component
iris_neighborhood = np.array(Image.fromarray(iris_pixels.astype("uint8")*255).filter(ImageFilter.MaxFilter(17))) > 0
# The iris highlights split tiny blue islands from the main iris. Include their
# neighborhood so they are not mistaken for protected hair. Brown eyelashes
# remain editable; blue-tinted original hair/outline pixels remain exact.
hair_guard = hair_candidate & ~iris_neighborhood
# Existing lash tips cross the blue hair by a few antialiased pixels. Those
# pixels belong to the eyelid edit, otherwise an old lash leaves a hollow loop.
lash_envelope = polygon_mask(base["blue"].size, [
    [(471, 323), (522, 327), (570, 341), (613, 352), (617, 369), (566, 357), (517, 343), (470, 341)],
    [(687, 373), (737, 385), (790, 402), (855, 428), (861, 443), (844, 447), (789, 419), (735, 401), (687, 389)],
])
hair_guard &= np.array(lash_envelope) == 0
mask_arr = np.array(eye_mask)
mask_arr[hair_guard] = 0
eye_mask = Image.fromarray(mask_arr)


def insert(state, mask):
    candidate = Image.open(DOC / "generated" / f"blue-{state}-candidate.png").convert("RGBA")
    candidate = candidate.resize((FACE[2]-FACE[0], FACE[3]-FACE[1]), Image.Resampling.LANCZOS)
    patch = base["blue"].copy()
    patch.paste(candidate, FACE[:2])
    # Feather inward only; the binary allowed region remains a hard invariant.
    inner = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.65))
    blend = np.minimum(np.array(inner), np.array(mask))
    result = Image.composite(patch, base["blue"], Image.fromarray(blend))
    # Preserve source alpha exactly for the internal eye/mouth edits.
    result.putalpha(base["blue"].getchannel("A"))
    return result


half = insert("half", eye_mask)
closed = insert("closed", eye_mask)
yawn = insert("yawn", eye_mask)
transition_mouth = insert("transition", mouth_mask)
yawn_mouth = insert("yawn", mouth_mask)
transition = half.copy()
transition.paste(transition_mouth, (0, 0), mouth_mask)
yawn.paste(yawn_mouth, (0, 0), mouth_mask)


def sample_rgba(original, sx, sy):
    """Bilinear interpolation in premultiplied alpha avoids pale fringe pixels."""
    arr = np.array(original).astype(np.float64)
    arr[:, :, :3] *= arr[:, :, 3:4] / 255
    x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int)
    fx = (sx-x0)[..., None]; fy = (sy-y0)[..., None]
    x0 = np.clip(x0, 0, original.width-2); y0 = np.clip(y0, 0, original.height-2)
    sampled = ((1-fx)*(1-fy)*arr[y0, x0] + fx*(1-fy)*arr[y0, x0+1]
               + (1-fx)*fy*arr[y0+1, x0] + fx*fy*arr[y0+1, x0+1])
    a = sampled[:, :, 3:4]
    sampled[:, :, :3] = np.divide(sampled[:, :, :3]*255, a, out=np.zeros_like(sampled[:, :, :3]), where=a>0)
    return np.clip(np.rint(sampled), 0, 255).astype("uint8")


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t*t*(3-2*t)


def repair_alpha_pinholes(frame, original, rect):
    """Fix only subpixel resampling pinholes enclosed in existing opaque fur.

    Use 8-connected transparency so diagonal gaps between fur strands remain
    open. The original silhouette's exterior is never filled or expanded.
    """
    rgba = np.array(frame)
    old = np.array(original)
    x0, y0, x1, y1 = rect
    transparent = rgba[y0:y1, x0:x1, 3] < 16
    reached = np.zeros(transparent.shape, bool)
    queue = deque()
    for y, x in zip(*np.where(transparent)):
        if y in (0, transparent.shape[0]-1) or x in (0, transparent.shape[1]-1):
            reached[y, x] = True; queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = y+dy, x+dx
                if 0 <= yy < reached.shape[0] and 0 <= xx < reached.shape[1] and transparent[yy, xx] and not reached[yy, xx]:
                    reached[yy, xx] = True; queue.append((yy, xx))
    holes = transparent & ~reached & (old[y0:y1, x0:x1, 3] >= 200)
    assert int(holes.sum()) <= 16, "Larger defect requires a new asset"
    for y, x in zip(*np.where(holes)):
        yy, xx = y+y0, x+x0
        neighbors = rgba[yy-1:yy+2, xx-1:xx+2].reshape(-1, 4).astype(float)
        neighbors = neighbors[neighbors[:, 3] >= 16]
        assert len(neighbors)
        color = np.average(neighbors[:, :3], axis=0, weights=neighbors[:, 3])
        rgba[yy, xx] = np.rint([*color, neighbors[:, 3].mean()]).astype("uint8")
    return Image.fromarray(rgba), int(holes.sum())


def ear_motion(level):
    """Both complete ears move with their roots, blending below the attachment.

    The previous vertical tip-only falloff stopped above the ear root, making
    it look rubbery. Each ear now has a rigid moving plate through the root;
    only the small connecting fur below that oblique root line tapers to zero.
    """
    original = base["mibao"]
    rect = (300, 0, 1080, 435)
    x0, y0, x1, y1 = rect
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
    sx, sy = xx.copy(), yy.copy()
    combined = np.zeros(xx.shape)
    specs = [
        # pivot, peak angle, root translation, lateral support, root line
        (505, 395, -4.8, -1, 1, 300, 335, 605, 660, 405-.72*(xx-415), 22),
        (900, 305, 4.0, 1.2, .5, 735, 770, 1010, 1070, 245+.1*(xx-890), 28),
    ]
    for px, py, angle, dx, dy, lo, start, end, hi, root, feather in specs:
        # Keep the upper ear motion; reduce the root to 60% and finish the
        # attachment blend sooner so it cannot pull the forehead/head shape.
        root_gain = 1-.4*smoothstep((yy-root+60)/60)
        weight = (1-smoothstep((yy-root)/feather)) * root_gain
        weight *= smoothstep((xx-lo)/(start-lo)) * (1-smoothstep((xx-end)/(hi-end)))
        weight *= 1-smoothstep((yy-410)/20)
        theta = np.deg2rad(angle*level)*weight
        tx = xx-px-dx*level*weight
        ty = yy-py-dy*level*weight
        moving = weight > 0
        sx[moving] = (px+np.cos(theta)*tx+np.sin(theta)*ty)[moving]
        sy[moving] = (py-np.sin(theta)*tx+np.cos(theta)*ty)[moving]
        combined = np.maximum(combined, weight)
    sampled = sample_rgba(original, sx, sy)
    old = np.array(original.crop(rect))
    sampled[combined == 0] = old[combined == 0]
    result = original.copy(); result.paste(Image.fromarray(sampled), (x0, y0))
    result, fixed = repair_alpha_pinholes(result, original, rect)
    print(f"Both ears {level:.2f}: root-aware local motion, {fixed} alpha pinholes repaired.")
    allowed = Image.new("L", original.size)
    allowed.paste(Image.fromarray(np.where(combined > 0, 255, 0).astype("uint8")), (x0, y0))
    return result, allowed


def tail_motion(amount):
    original = base["mibao"]
    rect = (1290, 60, 1840, 335)
    x0, y0, x1, y1 = rect
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
    weight = 1-smoothstep((yy-135)/190)
    weight *= smoothstep((xx-x0)/50) * (1-smoothstep((xx-1780)/60))
    # Only the distal cap moves. y>=325 and the tail root are untouched.
    sx = xx - amount*weight
    sy = yy
    sampled = sample_rgba(original, sx, sy)
    old = np.array(original.crop(rect))
    sampled[weight == 0] = old[weight == 0]
    result = original.copy()
    result.paste(Image.fromarray(sampled), (x0, y0))
    allowed = Image.new("L", original.size)
    allowed.paste(Image.fromarray(np.where(weight > 0, 255, 0).astype("uint8")), (x0, y0))
    result, fixed = repair_alpha_pinholes(result, original, rect)
    print(f"Tail {amount:+}: repaired {fixed} enclosed source-pixel alpha pinholes; exterior fur gaps retained.")
    return result, allowed


ear_ease, ear_allowed = ear_motion(.25)
ear_near, _ = ear_motion(.6)
ear_tilt, _ = ear_motion(1)
tail_right, tail_allowed = tail_motion(20)
tail_left, _ = tail_motion(-20)
yawn_allowed = Image.fromarray(np.maximum(np.array(eye_mask), np.array(mouth_mask)))
configs = {
    "blue-blink": ("blue", eye_mask, {"half": half, "closed": closed}, ["static", "half", "closed", "half", "static"], [200, 300, 200]),
    "blue-yawn": ("blue", yawn_allowed, {"transition": transition, "yawn": yawn}, ["static", "transition", "yawn", "transition", "static"], [250, 460, 280]),
    "mibao-ear": ("mibao", ear_allowed, {"ease": ear_ease, "near": ear_near, "tilt": ear_tilt}, ["static", "ease", "near", "tilt", "near", "ease", "static"], [90, 110, 150, 120, 130]),
    "mibao-tail": ("mibao", tail_allowed, {"right": tail_right, "left": tail_left}, ["static", "right", "static", "left", "static"], [240, 200, 240]),
}

report = {"bases": {}, "actions": {}}
for name, path in BASES.items():
    report["bases"][name] = {"path": path, "size": list(base[name].size), "sha256": hashes[name]}


def display(im, size):
    im = im.copy(); im.thumbnail(size, Image.Resampling.LANCZOS)
    result = Image.new("RGBA", size, "#eef2f6")
    result.alpha_composite(im, ((size[0]-im.width)//2, (size[1]-im.height)//2))
    return result.convert("RGB")


for action, (name, allowed, states, sequence, timing) in configs.items():
    original = np.array(base[name]); allowed_arr = np.array(allowed) > 0
    allowed.save(LOSSLESS / f"{action}-allowed.png")
    tint_mask = Image.new("RGBA", allowed.size, (180, 40, 140, 0))
    tint_mask.putalpha(allowed.point(lambda a: 110 if a else 0))
    tint_mask.save(OUT / f"{action}-allowed.png", optimize=True)
    state_reports = []
    board = Image.new("RGB", (900, 210+190*len(states)), "#fff")
    draw = ImageDraw.Draw(board)
    board.paste(display(base[name], (440, 180)), (0, 25))
    overlay = base[name].copy()
    tint = Image.new("RGBA", base[name].size, (190, 50, 150, 0))
    tint.putalpha(allowed.point(lambda a: 80 if a else 0))
    overlay.alpha_composite(tint)
    board.paste(display(overlay, (440, 180)), (460, 25))
    draw.text((12, 6), f"{action}: exact production base", fill="#273d50")
    draw.text((470, 6), "Magenta: only allowed pixels", fill="#96337c")
    for row, (state, frame) in enumerate(states.items()):
        rgba = np.array(frame)
        delta = np.any(rgba != original, axis=2)
        outside = int(np.count_nonzero(delta & ~allowed_arr))
        assert outside == 0, (action, state, outside)
        if name == "blue":
            assert np.array_equal(rgba[:, :, 3], original[:, :, 3])
            assert np.array_equal(rgba[hair_guard], original[hair_guard]), "hair pixels moved"
            for x0, y0, x1, y1 in [(380, 440, 606, 561), (800, 486, 945, 561), (0, 435, 430, 561)]:
                assert np.array_equal(rgba[y0:y1, x0:x1], original[y0:y1, x0:x1]), "cuff/companion moved"
            assert np.array_equal(rgba[500:], original[500:]), "hands moved"
        if action == "mibao-tail":
            assert np.array_equal(rgba[335:], original[335:]), "tail root moved"
        if action == "mibao-ear":
            assert np.array_equal(rgba[435:], original[435:]), "lower face/body moved"
            for x0, y0, x1, y1 in [(540, 395, 730, 535), (810, 325, 980, 440)]:
                assert np.array_equal(rgba[y0:y1, x0:x1], original[y0:y1, x0:x1]), "eyes moved"
        # All original bottom contact rows are exact. Eye/mouth masks cannot
        # touch the hands/cuffs; independent guard regions checked below.
        assert np.array_equal(rgba[-20:], original[-20:])
        filename = f"{action}-{state}.png"
        frame.save(LOSSLESS / filename, optimize=True)
        save_png(frame, OUT / filename, optimize=True)
        delta_rgba = np.zeros_like(rgba)
        delta_rgba[delta] = [20, 190, 205, 255]
        diff = Image.fromarray(delta_rgba)
        diff.save(DIFFS / f"{action}-{state}-delta.png")
        state_reports.append({"state": state, "file": f"src/dev/repaired/{filename}",
            "changedPixels": int(delta.sum()), "outsideAllowedPixels": outside,
            "changedBounds": Image.fromarray(delta.astype("uint8")*255).getbbox(),
            "alphaChangedPixels": int(np.count_nonzero(rgba[:, :, 3] != original[:, :, 3]))})
        y = 210 + row*190
        board.paste(display(frame, (440, 165)), (0, y+20))
        diff_view = overlay.copy(); diff_view.alpha_composite(diff)
        board.paste(display(diff_view, (440, 165)), (460, y+20))
        draw.text((12, y+2), f"{state}: fixed canvas {frame.width}x{frame.height}", fill="#273d50")
        draw.text((470, y+2), f"Cyan: {int(delta.sum())} changed pixels; outside allowed = {outside}", fill="#14606c")
    board.save(DIFFS / f"{action}-comparison.png")
    report["actions"][action] = {"base": name, "allowedMask": f"lossless/{action}-allowed.png",
        "sequence": sequence, "timing": timing, "states": state_reports,
        "size": list(base[name].size), "outsideAllowedPixels": 0, "status": "candidate"}

# Enlarged local check is supplemental; browser evidence remains actual-size.
detail = Image.new("RGB", (860, 420), "white")
for i, frame in enumerate([half, closed, transition, yawn]):
    detail.paste(frame.crop(FACE).convert("RGB"), ((i % 2)*430, (i // 2)*210))
detail.save(DOC / "composite-face-check.png")

# Source hashes must be unchanged even after exporting all assets.
for key, path in BASES.items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == hashes[key]
(DOC / "pixel-checks.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
# A browser-consumable manifest carries the exact playback states and masks.
(OUT / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print("Saved 9 lossless local-edit frames. All non-action pixels exactly equal production originals.")
