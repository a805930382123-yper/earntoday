"""Arrange actual formal-component screenshots at 1:1 CSS pixels; no character edits."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'docs/autonomous-integration'
approved = json.loads((root / 'src/autonomous/approved.json').read_text())
placements = []
for column, (action, data) in enumerate(approved['actions'].items()):
    placements.append((action, 'full', column * 272 + 8, 24, data))
    if action != 'mibao-tail':
        placements.append((action, 'mini', column * 272 + 8, 328, data))
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 12)
timeline = {0}
for _, _, _, _, data in placements:
    elapsed = 360
    timeline.add(elapsed)
    for duration in data['timing']:
        elapsed += duration
        timeline.add(elapsed)
timeline = sorted(timeline)
frames = []
for now in timeline:
    canvas = Image.new('RGB', (1088, 448), '#f3f6fa')
    draw = ImageDraw.Draw(canvas)
    for action, mode, x, y, data in placements:
        starts, elapsed = [0], 360
        starts.append(elapsed)
        for duration in data['timing']:
            elapsed += duration
            starts.append(elapsed)
        step = max(i for i, at in enumerate(starts) if at <= now)
        capture = Image.open(out / f'frames/{action}-{mode}-{step}.png').convert('RGBA')
        assert capture.size == (260, 108 if mode == 'mini' else 276)
        canvas.paste(capture, (x, y), capture)
        draw.text((x, y - 20), f'{action} / {mode} / 1:1', fill='#24384e', font=font)
    frames.append(canvas)
durations = [b-a for a,b in zip(timeline, timeline[1:])] + [1800]
frames[0].save(out / 'formal-components-static.png')
frames[0].save(out / 'formal-components-playback.gif', save_all=True, append_images=frames[1:], duration=durations, loop=0)
print(f'7 formal components; {len(frames)} captured frame states; native sizes retained; GIF timing={durations}')
