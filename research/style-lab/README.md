# Лаборатория стиля (17.11)

Один тестовый мир («дом, погреб и колодец в разрезе») в 10 манерах — чтобы выбрать фирменный стиль канала.
Работает без сборки: чистый three.js r170 в безголовом Chromium (Playwright), как и рендер в Actions.

## Запуск
```
git clone --depth 1 --branch r170 --filter=blob:none --sparse https://github.com/mrdoob/three.js lib/threerepo
git -C lib/threerepo sparse-checkout set build examples/jsm/postprocessing examples/jsm/shaders examples/jsm/utils examples/jsm/math
node render.cjs still paint,atlas 1080      # кадры → out/<стиль>.png
node render.cjs clip paint 720 4 24         # 4 секунды кадрами → out/f_paint/
node render.cjs bench base,paint 1080       # время кадра
```

## Файлы
- `world.js` — мир. Материалы не задаёт: спрашивает у стиля `st.mat(роль, цвет)`. Роли: grass, clay, sand, wall, roof…
- `styles.js` — стили: палитра, материалы, свет, небо, цепочка постобработки.
- `post.js` — проходы: tonemap, fxaa, kuwahara (мазок), ink (обводка), finish (цвет/холст/рельеф), tilt (макро),
  halftone, engrave (гравюра), watercolor, riso, paper. Общие буферы: цвет, глубина, нормали.
- `samples/` — готовые образцы.

## Стили
0 base «как сейчас» · 1 paint «Живопись» · 2 dusk «Живопись, вечер» · 3 atlas «Атлас» · 4 clay «Пластилин» ·
5 sketch «Скетчбук» · 6 riso «Плакат» · 7 comic «Комикс» · 8 paper «Бумага» · 9 lowpoly «Грани» · 10 diorama «Макет»

## Замер (1080×1920, программный GL, 2 ядра), секунд на кадр
base 1.0 · riso 0.8 · atlas 1.0 · clay 2.2 · paint 2.65 (мазок в половинном размере)

## В конвейере
`src/lib/post.tsx` — опция `"post": {"paint": 1}` (мазок + цвет + холст поверх готового кадра, без смены материалов).
Проба на готовых мирах: `episodes/style-plotina`, `episodes/style-okop2` (режим `styleTest` в `scripts/build.mjs`).
