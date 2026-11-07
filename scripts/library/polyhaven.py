"""Каталог Poly Haven (CC0): модели, HDRI-небо, текстуры → library/polyhaven.json + листы превью.
Сами модели не храним: build качает нужные по id через API в момент рендера."""
import json, os, sys, io, requests
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/library'
os.makedirs(OUT, exist_ok=True)
S = requests.Session(); S.headers['User-Agent'] = 'gemvid-library/1.0'
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)

def sheet(items, name, kind):
    T, COLS, PER = 200, 8, 48
    for p in range(0, len(items), PER):
        part = items[p:p + PER]
        rows = (len(part) + COLS - 1) // COLS
        im = Image.new('RGB', (COLS * T, rows * (T + 18)), (30, 30, 34))
        d = ImageDraw.Draw(im)
        for i, (aid, a) in enumerate(part):
            x, y = (i % COLS) * T, (i // COLS) * (T + 18)
            try:
                r = S.get(f'https://cdn.polyhaven.com/asset_img/thumbs/{aid}.png?width={T}&height={T}', timeout=30)
                th = Image.open(io.BytesIO(r.content)).convert('RGB'); th.thumbnail((T, T))
                im.paste(th, (x + (T - th.width) // 2, y))
            except Exception as e:
                print('нет превью', aid, e)
            d.text((x + 3, y + T + 1), f'{p + i + 1}. {aid}'[:26], fill=(230, 230, 230), font=FONT)
        im.save(f'{OUT}/ph_{name}_{p // PER + 1:02d}.jpg', quality=82)

cat = {}
for t, name in [('models', 'models'), ('hdris', 'hdris'), ('textures', 'textures')]:
    a = S.get(f'https://api.polyhaven.com/assets?t={t}', timeout=60).json()
    items = sorted(a.items(), key=lambda kv: (sorted(kv[1].get('categories', [''])) or [''])[0] + kv[0])
    cat[name] = {k: {'name': v.get('name'), 'categories': v.get('categories'), 'tags': v.get('tags'),
                     'polycount': v.get('polycount'), 'dimensions': v.get('dimensions')} for k, v in items}
    print(name, len(items))
    sheet(items, name, t)
json.dump(cat, open(f'{OUT}/polyhaven.json', 'w'), ensure_ascii=False, indent=0)
