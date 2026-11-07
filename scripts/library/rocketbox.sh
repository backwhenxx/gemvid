#!/usr/bin/env bash
# Rocketbox (MIT): аватары + анимации → GLB в out/library/rb/
set -e
OUT=out/library/rb; mkdir -p $OUT/avatars $OUT/anims
git clone -q --filter=blob:none --no-checkout https://github.com/microsoft/Microsoft-Rocketbox rb
cd rb
git sparse-checkout init --no-cone
printf '%s\n' '/Assets/Avatars/*/*/Export/*.fbx' '!/Assets/Avatars/*/*/Export/*_facial.fbx' '/Assets/Avatars/*/*/Textures/*' '!/Assets/Avatars/*/*/Textures/*_specular*' \
  '/Assets/Animations/all_animations_max_motextr_static/' > .git/info/sparse-checkout
git checkout -q HEAD
cd ..
du -sh rb; df -h / | tail -1
B=blender/blender
for f in rb/Assets/Avatars/*/*/Export/*.fbx; do
  n=$(basename "$f" .fbx); [ -f "$OUT/avatars/$n.glb" ] && continue
  $B -b -P scripts/library/rb_convert.py -- avatar "$f" "/tmp/$n.glb" > /tmp/bl.log 2>&1 || { echo "ОШИБКА $n"; tail -5 /tmp/bl.log; continue; }
  npx gltf-transform resize "/tmp/$n.glb" "$OUT/avatars/$n.glb" --width 1024 --height 1024 > /dev/null 2>&1 || cp "/tmp/$n.glb" "$OUT/avatars/$n.glb"
  echo "$n $(du -k "$OUT/avatars/$n.glb" | cut -f1)K"
done
for f in rb/Assets/Animations/all_animations_max_motextr_static/*.fbx; do
  n=$(basename "$f" | cut -d. -f1)
  $B -b -P scripts/library/rb_convert.py -- anim "$f" "$OUT/anims/$n.glb" > /tmp/bl.log 2>&1 || { echo "ОШИБКА $n"; tail -5 /tmp/bl.log; }
done
ls $OUT/anims | wc -l
