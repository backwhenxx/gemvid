# Лаборатория стиля (17.11)

Один тестовый мир (дом, деревья, погреб, колодец, слои земли) в 10 манерах: paint, dusk, atlas, clay, sketch, riso, comic, paper, lowpoly, diorama (+ base).
Локальный рендер: three.js (build/three.module.js из репо mrdoob/three.js положить в lib/threerepo) + Playwright Chromium, `node render.cjs`.
Листы: styles_1.jpg, styles_2.jpg. В конвейере: проход «живопись» в src/lib/post.tsx, сцена `lab`, эпизод episodes/style-lab.
Вывод: фильтр поверх старых миров почти ничего не даёт (проверено на «Плотине» и «Окопе 2»); стиль = набор деталей мира + манера.
