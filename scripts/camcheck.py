#!/usr/bin/env python3
"""Проверка перелётов камеры ДО рендера (урок «Маяка»): нет ли рывка у предмета.
Использование: python3 -I scripts/camcheck.py src/scenes/<x>/<X>Scene.tsx episodes/<slug>
Камеры читаются из CAMS в сцене (строки `имя: {pos: [..], look: [..]}`), сцены — из episode.json,
длительности — из out/<slug>/timeline.json (если есть, иначе по 3 с). Считается так же, как camPath.ts.
Флаг, если за кадр: поворот > 2° или в 3 раза быстрее среднего по сцене; наезд > 6 % расстояния до предмета."""
import json, os, re, sys
import numpy as np

def nrm(v): return v / np.linalg.norm(v)
def slerp(a, b, k):
    a, b = nrm(a), nrm(b); th = np.arccos(np.clip(a @ b, -1, 1))
    return a if th < 1e-5 else (np.sin((1 - k) * th) * a + np.sin(k * th) * b) / np.sin(th)
def ease(k): return k * k * (3 - 2 * k)
def between(A, B, k):
    pa, la = map(np.array, A); pb, lb = map(np.array, B)
    anc = la if np.linalg.norm(pa - la) < np.linalg.norm(pb - lb) else lb
    va, vb = pa - anc, pb - anc
    r = max(.05, np.linalg.norm(va)) ** (1 - k) * max(.05, np.linalg.norm(vb)) ** k
    return anc + slerp(va, vb, k) * r, slerp(la - pa, lb - pb, k), anc

tsx, epdir = sys.argv[1], sys.argv[2].rstrip('/')
src = open(tsx, encoding='utf-8').read()
cams = {m[0]: ([float(x) for x in m[1].split(',')], [float(x) for x in m[2].split(',')])
        for m in re.findall(r"(\w+): \{pos: \[([^\]]+)\], look: \[([^\]]+)\]", src)}
ep = json.load(open(os.path.join(epdir, 'episode.json'), encoding='utf-8'))
slug = os.path.basename(epdir)
tl = os.path.join('out', slug, 'timeline.json')
durs = None
if os.path.exists(tl):
    t = json.load(open(tl, encoding='utf-8')); durs = [s['end'] - s['start'] for s in t['scenes']]
bad = 0
for i, sc in enumerate(ep['scenes']):
    P = sc.get('props', {}); cs = P.get('cam')
    if not cs or any(isinstance(c, dict) or c not in cams for c in cs): continue
    dur = durs[i] if durs and i < len(durs) else 3.0
    N = max(2, int(dur * 30)); cd, dl = P.get('camDur', 1), P.get('camDelay', 0)
    a, b, via, va = cams[cs[0]], cams[cs[-1]], cams.get(P.get('via')), P.get('viaAt', .5)
    out = []
    for f in range(N + 1):
        q = ease(min(1, max(0, (f / N - dl) / cd)))
        if via: out.append(between(a, via, q / va) if q < va else between(via, b, (q - va) / (1 - va)))
        else: out.append(between(a, b, q))
    ang = np.array([np.degrees(np.arccos(np.clip(nrm(out[f][1]) @ nrm(out[f - 1][1]), -1, 1))) for f in range(1, len(out))])
    rel = np.array([np.linalg.norm(out[f][0] - out[f - 1][0]) / max(.3, np.linalg.norm(out[f][0] - out[f][2])) * 100 for f in range(1, len(out))])
    mov = ang > 0.02
    mean = ang[mov].mean() if mov.any() else 0
    msg = []
    if ang.max() > 2: msg.append(f'поворот {ang.max():.1f}°/кадр')
    if mean > 0 and ang.max() > 3 * mean and ang.max() > 0.6: msg.append(f'поворот в {ang.max() / mean:.1f}× быстрее среднего')
    if rel.max() > 6: msg.append(f'наезд {rel.max():.1f}%/кадр')
    flag = '⚠ ' if msg else 'ok'
    bad += bool(msg)
    print(f"{flag} сцена {i + 1:2d} {cs[0]}→{cs[-1]}{' via ' + P['via'] if P.get('via') else ''} ({dur:.1f} с): "
          f"поворот макс {ang.max():.2f}°/к, наезд макс {rel.max():.1f}%/к {'; '.join(msg)}")
print(f'итого с рывками: {bad}')
sys.exit(1 if bad else 0)
