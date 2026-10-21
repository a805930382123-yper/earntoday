"""Reproducible crops/composites of the supplied art; no generated replacement art."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/fun-accumulation'
DEST = ROOT / 'src/assets/themes'

def clean(im):
    # Keep the main connected opaque silhouette, then preserve its antialiased edge.
    a = np.array(im.getchannel('A'))
    solid = a >= 190
    seen = np.zeros(solid.shape, dtype=bool)
    largest = []
    for y, x in zip(*np.where(solid)):
        if seen[y, x]: continue
        stack = [(int(y), int(x))]; seen[y, x] = True; component = []
        while stack:
            yy, xx = stack.pop(); component.append((yy, xx))
            for ny, nx in [(yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)]:
                if 0 <= ny < a.shape[0] and 0 <= nx < a.shape[1] and solid[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx] = True; stack.append((ny,nx))
        if len(component) > len(largest): largest = component
    mask = np.zeros(a.shape, dtype=np.uint8)
    for y, x in largest: mask[y,x] = 255
    edge = np.array(Image.fromarray(mask).filter(ImageFilter.MaxFilter(5)))
    im.putalpha(Image.fromarray(np.where(edge > 0, a, 0).astype('uint8')))
    return im

def crop(sheet, box):
    im = clean(sheet.crop(box).convert('RGBA'))
    return im.crop(im.getbbox())

def save(im, directory, name):
    directory.mkdir(parents=True, exist_ok=True)
    im.save(directory / (name + '.webp'), lossless=True)

report = []
for p in SOURCE.glob('*.png'):
    im = Image.open(p)
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None
    report.append(dict(file=p.name, size=im.size, mode=im.mode,
                       alphaExtrema=alpha.getextrema() if alpha else None,
                       bounds=alpha.getbbox() if alpha else (0,0,*im.size),format=im.format))

blue = DEST / 'blue-whale-girl/collection'
cat = DEST / 'mibao/collection'
sheet = Image.open(SOURCE / '可爱鲸鱼饭团素材贴纸集.png')
empty = crop(sheet, (10,280,500,610))
full = crop(sheet, (960,185,1440,610))
half = crop(sheet, (500,280,955,610))
spoon = crop(sheet, (30,645,560,985))
save(empty,blue,'bowl-empty'); save(full,blue,'bowl-full'); save(half,blue,'bowl-half')
save(spoon,blue,'rice-spoon')
save(crop(sheet,(560,640,990,990)),blue,'whale')
save(crop(sheet,(1280,680,1395,805)),blue,'star')

# Registered layers share a 500×440 canvas. Bowl stays fixed; only the mound moves.
base = Image.new('RGBA',(500,440)); empty.thumbnail((476,320)); base.alpha_composite(empty,(12,440-empty.height-18))
rice = sheet.crop((960,185,1440,610)).convert('RGBA')
mask = Image.new('L',rice.size); d=ImageDraw.Draw(mask)
d.polygon([(28,188),(70,120),(150,30),(230,0),(300,10),(370,70),(440,145),(460,190),
           (438,220),(380,242),(260,258),(150,250),(70,229),(30,210)],fill=255)
rice.putalpha(Image.fromarray(np.minimum(np.array(rice.getchannel('A')),np.array(mask))))
rice = clean(rice); save(rice,blue,'rice-fill')
# Foreground porcelain follows the curved inner edge of the front rim.
front = base.copy(); a=np.array(front.getchannel('A')); yy,xx=np.indices(a.shape)
edge = 272 - 52 * ((xx-250)/238)**2
front.putalpha(Image.fromarray(np.where(yy>=edge,a,0).astype('uint8')))
save(base,blue,'bowl-back');save(front,blue,'bowl-front')
for stage in range(11):
    result=base.copy()
    if stage:
        layer=Image.new('RGBA',base.size);layer.alpha_composite(rice,(10,44+(10-stage)*17))
        # Keep all filling inside the bowl silhouette/opening.
        la=np.array(layer.getchannel('A')); inside=((xx-250)/231)**2+((yy-227)/76)**2 <= 1
        region=inside | ((yy<227)&(xx>20)&(xx<480))
        layer.putalpha(Image.fromarray(np.where(region,la,0).astype('uint8')))
        result.alpha_composite(layer);result.alpha_composite(front)
    save(result,blue,f'stage-{stage}')

sheet=Image.open(SOURCE / '猫咪鱼干罐与闪耀贴纸素材集.png')
jar=crop(sheet,(20,125,465,610)); save(jar,cat,'jar-empty')
save(crop(sheet,(970,65,1445,610)),cat,'jar-full-reference')
fish=crop(sheet,(45,640,325,790)); save(fish,cat,'dried-fish')
save(crop(sheet,(960,845,1090,978)),cat,'paw')
save(crop(sheet,(1200,610,1303,754)),cat,'star')
base=Image.new('RGBA',(500,560));jar.thumbnail((440,480));base.alpha_composite(jar,((500-jar.width)//2,70))
# Trace the COMPLETE supplied face (including forehead and ear tips). The old
# mask started below the forehead, so upper fish appeared to cut into the logo.
# Supersampling keeps this exterior sticker smooth at both desktop sizes.
scale=4
mask=Image.new('L',(base.width*scale,base.height*scale));d=ImageDraw.Draw(mask)
d.ellipse(tuple(v*scale for v in (164,273,332,367)),fill=255)
d.polygon([(x*scale,y*scale) for x,y in [(183,294),(182,278),(185,259),(189,250),
             (194,248),(201,252),(223,277),(273,277),(291,257),(299,249),
             (305,248),(309,255),(313,271),(315,295)]],fill=255)
mask=mask.resize(base.size,Image.Resampling.LANCZOS)
label=base.copy()
label.putalpha(mask)  # Paper is opaque; source glass alpha must not tint the logo with fish.
# A quiet warm edge and contact shadow read as paper attached to the glass,
# rather than a face floating among the fish. Apply this foreground LAST.
edge=Image.new('RGBA',base.size,(171,122,77,0))
edge.putalpha(mask.filter(ImageFilter.MaxFilter(3)).point(lambda a: round(a*.35)))
shadow=Image.new('RGBA',base.size,(103,62,29,0))
shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(1.5)).point(lambda a: round(a*.22)))
sticker=Image.new('RGBA',base.size)
sticker.alpha_composite(shadow,(0,2));sticker.alpha_composite(edge);sticker.alpha_composite(label)
placements=[(175,470,-12),(305,456,15),(230,420,-7),(320,378,-25),(150,370,20),
            (255,330,-20),(160,288,12),(320,270,30),(205,232,-22),(285,192,15)]
mask=Image.new('L',base.size);ImageDraw.Draw(mask).rounded_rectangle((74,162,426,510),radius=44,fill=255)
for stage in range(11):
    result=base.copy()
    for x,y,angle in placements[:stage]:
        f=fish.copy();f.thumbnail((205,102));f=f.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
        layer=Image.new('RGBA',base.size);layer.alpha_composite(f,(x-f.width//2,y-f.height//2))
        layer.putalpha(Image.fromarray(np.minimum(np.array(layer.getchannel('A')),np.array(mask))))
        result.alpha_composite(layer)
    result.alpha_composite(sticker)
    save(result,cat,f'stage-{stage}')
(SOURCE/'asset-inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
runtime=[]
for p in sorted(DEST.glob('*/collection/*.webp')):
    im=Image.open(p)
    runtime.append(dict(file=p.relative_to(ROOT).as_posix(),size=im.size,mode=im.mode,
                        alphaExtrema=im.getchannel('A').getextrema(),bounds=im.getchannel('A').getbbox(),bytes=p.stat().st_size,format=im.format))
(SOURCE/'runtime-assets.json').write_text(json.dumps(runtime,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Prepared {len(list(DEST.glob("*/collection/*.webp")))} lossless WebP resources; originals untouched.')
