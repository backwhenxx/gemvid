"""Sketchfab: поиск (листы превью) и скачивание моделей с разрешённой лицензией (CC0, CC-BY).
  python sketchfab.py search out/library  'запрос|animated' ...
  python sketchfab.py get out/library uid1 uid2 ...      (нужен SKETCHFAB_TOKEN)"""
import io, json, os, sys, zipfile, subprocess, requests
from PIL import Image, ImageDraw, ImageFont

API = 'https://api.sketchfab.com/v3'
mode, OUT, *args = sys.argv[1:]
os.makedirs(OUT, exist_ok=True)
S = requests.Session(); S.headers['User-Agent'] = 'gemvid-library/1.0'
TOK = os.environ.get('SKETCHFAB_TOKEN', '').strip()
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
OK = {'cc0', 'by'}

def search(q, animated):
    res, url = [], f'{API}/search'
    params = {'type': 'models', 'q': q, 'downloadable': 'true', 'sort_by': '-likeCount', 'count': 24, 'archives_flavours': 'false'}
    if animated: params['animated'] = 'true'
    for lic in ['cc0', 'by']:
        r = S.get(url, params={**params, 'license': lic}, timeout=60).json()
        res += r.get('results', [])
    res.sort(key=lambda m: -m.get('likeCount', 0))
    return res[:32]

if mode == 'search':
    allm = {}
    for qi, spec in enumerate(args):
        q, _, flag = spec.partition('|')
        ms = search(q, flag == 'animated')
        T, COLS = 220, 8
        rows = max(1, (len(ms) + COLS - 1) // COLS)
        im = Image.new('RGB', (COLS * T, rows * (T + 34)), (30, 30, 34)); d = ImageDraw.Draw(im)
        for i, m in enumerate(ms):
            x, y = (i % COLS) * T, (i // COLS) * (T + 34)
            imgs = sorted(m['thumbnails']['images'], key=lambda t: abs(t['width'] - 256))
            try:
                th = Image.open(io.BytesIO(S.get(imgs[0]['url'], timeout=30).content)).convert('RGB')
                th = th.resize((T, int(T * th.height / th.width))).crop((0, 0, T, T)); im.paste(th, (x, y))
            except Exception as e: print('нет превью', m['uid'], e)
            lic = m['license']['slug'] if m.get('license') else '?'
            d.text((x + 3, y + T + 1), f"{i+1}. {m['name']}"[:30], fill=(235, 235, 235), font=FONT)
            d.text((x + 3, y + T + 16), f"{lic} a{m.get('animationCount',0)} {m.get('faceCount',0)//1000}k", fill=(170, 200, 160), font=FONT)
            allm[m['uid']] = {'q': q, 'n': i + 1, 'name': m['name'], 'license': lic, 'author': m['user']['username'],
                              'url': m['viewerUrl'], 'anims': m.get('animationCount', 0), 'faces': m.get('faceCount', 0)}
        im.save(f'{OUT}/sf_{qi+1:02d}_{q.replace(" ", "_")[:30]}.jpg', quality=82)
        print(q, len(ms))
    json.dump(allm, open(f'{OUT}/sf_search.json', 'w'), ensure_ascii=False, indent=0)

elif mode == 'get':
    assert TOK, 'нет SKETCHFAB_TOKEN'
    H = {'Authorization': f'Token {TOK}'}
    credits = []
    for uid in args:
        info = S.get(f'{API}/models/{uid}', timeout=60).json()
        lic = (info.get('license') or {}).get('slug')
        if lic not in OK:
            print('пропуск, лицензия', lic, uid); continue
        dl = S.get(f'{API}/models/{uid}/download', headers=H, timeout=60).json()
        if 'glb' in dl:
            raw = S.get(dl['glb']['url'], timeout=600).content
            open(f'/tmp/{uid}.glb', 'wb').write(raw)
        else:
            z = zipfile.ZipFile(io.BytesIO(S.get(dl['gltf']['url'], timeout=600).content))
            dd = f'/tmp/sf_{uid}'; z.extractall(dd)
            src = next(os.path.join(r, f) for r, _, fs in os.walk(dd) for f in fs if f.endswith('.gltf'))
            subprocess.run(['npx', 'gltf-transform', 'copy', src, f'/tmp/{uid}.glb'], check=True)
        dst = f'{OUT}/sf_{uid}.glb'
        r = subprocess.run(['npx', 'gltf-transform', 'resize', f'/tmp/{uid}.glb', dst, '--width', '2048', '--height', '2048'])
        if r.returncode: os.replace(f'/tmp/{uid}.glb', dst)
        print(uid, info['name'], lic, os.path.getsize(dst) // 1024, 'КБ')
        credits.append({'uid': uid, 'name': info['name'], 'author': info['user']['username'], 'license': info['license']['label'],
                        'url': info['viewerUrl']})
    old = json.load(open('library/sketchfab_credits.json')) if os.path.exists('library/sketchfab_credits.json') else []
    keep = {c['uid']: c for c in old + credits}
    json.dump(list(keep.values()), open(f'{OUT}/sketchfab_credits.json', 'w'), ensure_ascii=False, indent=1)
