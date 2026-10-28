"""Independent pixel/alpha/contact/clip checks against production originals."""
from pathlib import Path
from collections import deque
from PIL import Image, ImageDraw
import numpy as np
import json
import hashlib

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs/action-repair"
manifest = json.loads((DOC / "pixel-checks.json").read_text(encoding="utf-8"))
audit = json.loads((DOC / "base-audit.json").read_text(encoding="utf-8"))
results = {"originalHashesUnchanged": True, "states": [], "samples": []}
source = {}
for key, entry in manifest["bases"].items():
    p = ROOT / entry["path"]
    assert hashlib.sha256(p.read_bytes()).hexdigest() == entry["sha256"]
    assert all(s["sha256"] == entry["sha256"] for s in audit["samples"] if s["source"] == entry["path"])
    source[key] = np.array(Image.open(p).convert("RGBA"))


def blue_count(arr, area):
    arr = arr.astype(int)
    return int(np.count_nonzero((arr[:, :, 2] > arr[:, :, 0]+25) &
        (arr[:, :, 2] > arr[:, :, 1]+5) & (arr[:, :, 2] > 110) & area))


for action, entry in manifest["actions"].items():
    original = source[entry["base"]]
    allowed = np.array(Image.open(DOC / entry["allowedMask"])) > 0
    for item in entry["states"]:
        frame = np.array(Image.open(ROOT / item["file"]).convert("RGBA"))
        lossless = np.array(Image.open(DOC / "lossless" / Path(item["file"]).name).convert("RGBA"))
        assert frame.shape == original.shape
        assert np.array_equal(frame, lossless), "runtime export changed source pixels"
        changed = np.any(frame != original, axis=2)
        assert not np.any(changed & ~allowed)
        contacts = next(s for s in audit["samples"] if s["id"].startswith(action))["contactAnnotationsNative"]
        for x, y in contacts:
            assert np.array_equal(frame[y-12:y+12, x-12:x+12], original[y-12:y+12, x-12:x+12])
        if action.startswith("blue"):
            assert np.array_equal(frame[:, :, 3], original[:, :, 3])
            assert np.array_equal(frame[:300], original[:300]), "upper hair/headpiece changed"
            assert np.array_equal(frame[500:], original[500:]), "hands changed"
            if action == "blue-blink":
                assert np.array_equal(frame[450:500, 600:660], original[450:500, 600:660]), "blink changed mouth"
        if action == "mibao-ear":
            assert np.array_equal(frame[435:], original[435:]), "lower face/paws/fish changed"
            assert np.array_equal(frame[:, 1080:], original[:, 1080:]), "body or tail changed"
            for x0, y0, x1, y1 in [(540, 395, 730, 535), (810, 325, 980, 440)]:
                assert np.array_equal(frame[y0:y1, x0:x1], original[y0:y1, x0:x1]), "eyes/brows moved"
            for x0, y0, x1, y1 in [(435, 345, 495, 390), (860, 230, 950, 270)]:
                assert int(changed[y0:y1, x0:x1].sum()) > 100, "ear root remained pinned"
        if action == "mibao-tail":
            assert np.array_equal(frame[325:], original[325:]), "tail root/lower tail changed"
            assert np.array_equal(frame[:, :1290], original[:, :1290]), "face/body/fish/paws changed"
        # Newly exposed transparency must connect to outside the local region,
        # rather than creating a cutout hole inside previously opaque fur.
        alpha = frame[:, :, 3]
        bounds = Image.fromarray(allowed.astype("uint8")*255).getbbox()
        x0, y0, x1, y1 = bounds
        patch = alpha[y0:y1, x0:x1]
        transparent = patch < 16
        outside = np.zeros(transparent.shape, bool)
        queue = deque()
        for y, x in zip(*np.where(transparent)):
            if y in (0, transparent.shape[0]-1) or x in (0, transparent.shape[1]-1):
                outside[y, x] = True; queue.append((y, x))
        while queue:
            y, x = queue.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y+dy, x+dx
                    if 0 <= yy < outside.shape[0] and 0 <= xx < outside.shape[1] and transparent[yy, xx] and not outside[yy, xx]:
                        outside[yy, xx] = True; queue.append((yy, xx))
        holes = transparent & ~outside & (original[y0:y1, x0:x1, 3] >= 200)
        assert not np.any(holes), (action, item["state"], "new alpha hole")
        results["states"].append({"action": action, "state": item["state"], "outsideAllowedPixels": 0,
            "contactChangedPixels": 0, "newInteriorAlphaHoles": 0, "runtimeEqualsLossless": True})

for sample in audit["samples"]:
    action = sample["id"].removesuffix("-full").removesuffix("-mini")
    entry = manifest["actions"][action]
    original = source[entry["base"]]
    ix, iy, iw, ih = sample["imageRect"]
    combined = np.zeros(original.shape[:2], bool)
    for item in entry["states"]:
        frame = np.array(Image.open(ROOT / item["file"]).convert("RGBA"))
        combined |= np.any(frame != original, axis=2) & (np.maximum(frame[:, :, 3], original[:, :, 3]) > 0)
    yy, xx = np.where(combined)
    bounds = [ix+xx.min()*iw/original.shape[1], iy+yy.min()*ih/original.shape[0],
              ix+(xx.max()+1)*iw/original.shape[1], iy+(yy.max()+1)*ih/original.shape[0]]
    # Include one CSS pixel around the changed extent for sampling edges.
    clip = sample["clip"] or {"left": 0, "top": 0, "width": 260, "height": 276}
    assert bounds[0]-1 >= clip["left"] and bounds[1]-1 >= clip["top"]
    assert bounds[2]+1 <= clip["left"]+clip["width"] and bounds[3]+1 <= clip["top"]+clip["height"]
    results["samples"].append({"id": sample["id"], "visibleChangedBoundsCssPx": [round(float(v), 3) for v in bounds],
                              "motionAreaInsideExistingClip": True})

# Fixed original iris bounds, independent of compositing masks. The broader
# allowed masks include blue hair where the original lash tips crossed it;
# counting those hair pixels would not measure how far the eyes are closed.
iris_area = np.zeros(source["blue"].shape[:2], bool)
iris_area[353:424, 505:588] = True
iris_area[404:480, 699:790] = True
counts = {"original": blue_count(source["blue"], iris_area)}
for state in ["half", "closed"]:
    counts[state] = blue_count(np.array(Image.open(DOC / f"lossless/blue-blink-{state}.png")), iris_area)
assert .2 < counts["half"]/counts["original"] < .75
assert counts["closed"]/counts["original"] < .05
results["blinkBluePixelProxy"] = {**counts, "halfRatio": round(counts["half"]/counts["original"], 4),
                                 "note": "fixed original iris bounds; supplements visual inspection, not a naturalness score"}
results["checks"] = "PASS: original hashes; 9 states exact outside masks; both ear roots move; eyes/hands/fish/paws/tail-root guards; lossless exports; contacts; no new internal alpha holes; 7 motion regions within existing clips; real half-close proxy."
(DOC / "independent-checks.json").write_text(json.dumps(results, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print(results["checks"])
