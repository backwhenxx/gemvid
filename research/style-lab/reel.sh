#!/bin/bash
# Сборка общего ролика: все стили по 4 секунды с подписью
cd "$(dirname "$0")/out"
FONT=$(fc-match "Inter:bold" -f "%{file}")
i=0; : > list.txt
while IFS='|' read -r id name; do
  [ -f clip_$id.mp4 ] || { echo "нет clip_$id"; continue; }
  ffmpeg -nostdin -v error -y -i clip_$id.mp4 -vf "drawtext=fontfile=$FONT:text='$name':fontcolor=white:fontsize=46:box=1:boxcolor=black@0.62:boxborderw=18:x=(w-text_w)/2:y=h-150,fps=24,format=yuv420p" -c:v libx264 -crf 17 lab_$id.mp4
  echo "file 'lab_$id.mp4'" >> list.txt
done <<'L'
base|0. Как сейчас
paint|1. Живопись
dusk|2. Живопись, вечер
atlas|3. Атлас
clay|4. Пластилин
sketch|5. Скетчбук
riso|6. Плакат
comic|7. Комикс
paper|8. Бумага
lowpoly|9. Грани
diorama|10. Макет на столе
L
ffmpeg -v error -y -f concat -safe 0 -i list.txt -c copy reel.mp4 && ls -la reel.mp4
