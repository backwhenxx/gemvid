#!/usr/bin/env python3
"""Заменяет «пустые» чёрные кадры (сбой рендера: нет ни 3D, ни плашек) предыдущим кадром.
Без numpy: тёмные кадры ищет ffmpeg signalstats (резкий провал яркости), подмена — через сырой поток.
Использование: fixdark.py video.mp4  (перезаписывает файл, если что-то нашлось)."""
import os, re, subprocess, sys

src = sys.argv[1]
probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                        '-of', 'csv=p=0', src], capture_output=True, text=True).stdout.strip().split(',')
W, H, R = int(probe[0]), int(probe[1]), probe[2]
log = subprocess.run(['ffmpeg', '-v', 'info', '-i', src, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
vals = [float(v) for v in re.findall(r'lavfi\.signalstats\.YAVG=([\d.]+)', log)]
# кадр-сбой: резко темнее обоих соседей (меньше 45 % от каждого) — плавные затемнения не трогаем
bad = {i for i, v in enumerate(vals) if i > 0 and v < 0.45 * vals[i - 1] and (i + 1 >= len(vals) or v < 0.45 * vals[i + 1])}
print(f'кадров {len(vals)}, тёмных (сбой рендера): {sorted(bad)}')
if not bad:
    sys.exit(0)
tmp = src + '.fix.mp4'
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', f'{W}x{H}', '-r', R, '-i', '-', '-i', src,
                        '-map', '0:v', '-map', '1:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p',
                        '-c:a', 'copy', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
size = W * H * 3 // 2
prev, n = None, 0
while True:
    b = dec.stdout.read(size)
    if len(b) < size:
        break
    if n in bad and prev is not None:
        b = prev
    enc.stdin.write(b)
    prev, n = b, n + 1
enc.stdin.close()
enc.wait()
os.replace(tmp, src)
print(f'заменено {len(bad)} кадров')
