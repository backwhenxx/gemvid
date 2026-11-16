#!/bin/bash
cd "$(dirname "$0")"
for st in "$@"; do
  node render.cjs clip $st 720 4 24 2>&1 | grep -v "GPU stall"
  ffmpeg -v error -y -framerate 24 -i out/f_$st/%04d.png -c:v libx264 -crf 16 -pix_fmt yuv420p out/clip_$st.mp4 && rm -rf out/f_$st
  echo "готов $st $(date +%H:%M:%S)"
done
