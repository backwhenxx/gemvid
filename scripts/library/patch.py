"""Убрать знаки различия с текстур: закрасить области «по соседям» (OpenCV inpaint).
python patch.py patch.json dir   — правит файлы dir/t<номер>.* на месте.
patch.json: [{"tex": 0, "rects": [[x0,y0,x1,y1], ...]}]  (доли 0..1 от размера картинки),
            можно "polys": [[[x,y],...], ...] и "pad": 0.004"""
import json, sys, glob
import cv2, numpy as np
P, D = sys.argv[1], sys.argv[2]
for e in json.load(open(P)):
    if not e.get('rects') and not e.get('polys'): continue
    f = glob.glob(f"{D}/t{e['tex']}.*")[0]
    im = cv2.imread(f, cv2.IMREAD_UNCHANGED)
    h, w = im.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    pad = e.get('pad', 0.004)
    for x0, y0, x1, y1 in e.get('rects', []):
        cv2.rectangle(mask, (int((x0 - pad) * w), int((y0 - pad) * h)), (int((x1 + pad) * w), int((y1 + pad) * h)), 255, -1)
    for poly in e.get('polys', []):
        cv2.fillPoly(mask, [np.array([[int(x * w), int(y * h)] for x, y in poly], np.int32)], 255)
    rgb, a = (im[:, :, :3], im[:, :, 3]) if im.ndim == 3 and im.shape[2] == 4 else (im, None)
    out = cv2.inpaint(rgb, mask, max(3, int(0.006 * w)), cv2.INPAINT_TELEA)
    # мелкое зерно ткани поверх заплатки, чтобы не было «мыла»
    noise = np.random.default_rng(1).normal(0, 3, out.shape).astype(np.int16)
    out = np.where(mask[..., None] > 0, np.clip(out.astype(np.int16) + noise, 0, 255).astype(np.uint8), out)
    if a is not None: out = np.dstack([out, a])
    cv2.imwrite(f, out)
    print('заплатка', f, int(mask.sum() / 255), 'px')
