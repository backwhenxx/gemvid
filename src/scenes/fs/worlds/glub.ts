// @ts-nocheck
// Мир «Топ-5 самых глубоких мест, куда добрался человек» (19.11): один большой разрез земли, пять «скважин» рядом слева направо
// и всё глубже: метро Чунцина (116 м), пещера Верёвкина (2 212 м), рудник Мпоненг (~4 км), скважина Шэньди Такэ-1 (10 910 м),
// Кольская сверхглубокая (12 262 м). Глубины в кадре условные (по порядку), настоящие — на подписях.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, house, rnd, sm, lerp, hash3, vnoise} from '../kit';

export function S(x, z) {
  return 1.6 * Math.exp(-(((x + 2.8) / 2.2) ** 2)) * sm((-z + 0.5) / 2) + 1.2 * sm((-z - 8) / 9) + 0.06 * Math.sin(x * 1.1 + z * 0.7) * sm((-z - 1.2) / 3);
}
const BOT = -42;
const B = [
  (x) => S(x, 0),
  (x) => S(x, 0) - 0.3,
  (x) => S(x, 0) * 0.6 - 1.4 - 0.1 * Math.sin(x * 0.9),
  (x) => -4.8 + 0.3 * Math.sin(x * 0.4 + 1),
  (x) => -9.5 + 0.4 * Math.sin(x * 0.3 + 2),
  (x) => -15.5 + 0.5 * Math.sin(x * 0.25),
  (x) => -23 + 0.6 * Math.sin(x * 0.2 + 1),
  (x) => -31 + 0.6 * Math.sin(x * 0.22 + 2),
  () => BOT,
];
const LAYERS = ['grass', 'soil', 'clay', 'sandstone', 'limestone', 'granite', 'basalt', 'hotRock'];
// места: x, условная глубина в кадре
export const P5 = {x: -7.5, y: -3.6};   // метро
export const P4 = {x: -2.8, y: -12};    // пещера
export const P3 = {x: 2.0, y: -18};     // рудник
export const P2 = {x: 6.4, y: -28};     // Шэньди Такэ-1
export const P1 = {x: 10.6, y: -33};    // Кольская

export const T = {
  metro: [P5.x, P5.y + 0.3, 0.05], cave: [P4.x + 0.6, P4.y + 0.2, 0.05], mine: [P3.x + 1.6, P3.y + 0.2, 0.05], sdt: [P2.x, P2.y, 0.05], kola: [P1.x, P1.y, 0.05],
  surface: [0, 0.5, -2],
};
export const CAMS = {
  hook: {pos: [12.6, -30.8, 8.5], look: [10.6, -32.6, 0], fov: 40},
  over: {pos: [2.0, 3.0, 26], look: [1.5, -1.5, -3], fov: 40},
  metro: {pos: [-5.6, -1.2, 14], look: [-7.0, -2.6, 0], fov: 40},
  cave: {pos: [-1.4, -5.2, 24], look: [-2.6, -6.2, 0], fov: 40},
  mine: {pos: [3.6, -9.0, 30], look: [2.8, -9.6, 0], fov: 40},
  sdt: {pos: [7.4, -14.0, 42], look: [6.4, -14.6, 0], fov: 40},
  kola: {pos: [11.4, -16.6, 46], look: [10.6, -17.2, 0], fov: 40},
  wide: {pos: [4.0, -12, 58], look: [2.0, -15, 0], fov: 40},
  cover: {pos: [5.0, -10, 46], look: [2.0, -14, 0], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {grass: '#8fc35c', soil: '#7d5a44', clay: '#c98a5c', sandstone: '#e2c08a', limestone: '#d8d2c0', granite: '#9a98a6', basalt: '#6e6878', hotRock: '#8a4a3c'});
  const {add, box, cyl, blob, tree, fir, cloud, smoke} = K;
  const X0 = -40, X1 = 40, Z0 = -30;
  cutFace(K, LAYERS, (k, x) => B[k](x), X0, X1, []);
  ground(K, S, 'grass', X0, X1, Z0);
  hills(K, 'hillMid', -29.5, -60, (x, z) => S(x, -30) - 0.3 + 6 * sm((-z - 30) / 24) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + 0.8 * vnoise(x * 0.15, 0, z * 0.15), 3);
  hills(K, 'hillFar', -56, -150, (x, z) => 3 + 13 * sm((-z - 56) / 50) * (0.55 + 0.45 * Math.sin(x * 0.045 + 2.5)) + 1.6 * vnoise(x * 0.08, 3, z * 0.08), 5);

  // камни по слоям; глубже — темнее и горячее
  {
    const r = rnd(17), near = (x, y) => [P5, P4, P3, P2, P1].some((p) => Math.abs(x - p.x) < 2.8 && y > p.y - 3.5) || (Math.abs(x - P3.x - 1.6) < 2.6 && Math.abs(y - P3.y) < 2.2) || (Math.abs(x - P5.x - 0.5) < 3.2 && Math.abs(y - P5.y) < 2.4);
    for (let i = 0, n = 0; i < 3000 && n < 90; i++) {
      const x = lerp(-20, 22, r()), y = lerp(-40, -1.6, r()), rr = 0.35 + r() * 0.4 * (1 + -y / 40);
      if (near(x, y)) continue;
      const role = y > -9.5 ? 'stone' : y > -23 ? 'granite' : y > -31 ? 'basalt' : 'deep';
      add(blob(rr, n * 2.3 + 1, 0.28, 1.3, 1.4, 0.75, 0.45), role, x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++;
    }
  }
  // тёплое свечение глубины (растёт с heat)
  const heatM = new THREE.MeshBasicMaterial({color: '#ff7a3c', transparent: true, opacity: 0.0, depthWrite: false});
  const heatP = new THREE.Mesh(new THREE.PlaneGeometry(60, 12), heatM); heatP.position.set(2, -37, 0.04); heatP.renderOrder = 3; scene.add(heatP);

  // ── шахты-стволы: тёмная полоса на срезе, «рисуется» вниз параметром s1..s5
  const shafts = {};
  const shaft = (key, x, yb, w, color = '#3d3430') => {
    const g = new THREE.PlaneGeometry(w, 1); g.translate(0, -0.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color})); const top = S(x, 0) + 0.01;
    m.position.set(x, top, 0.03); m.renderOrder = 4; scene.add(m);
    shafts[key] = (p) => { const d = Math.max(0.001, (top - yb) * p); m.scale.y = d; m.visible = p > 0.005; return top - d; };
  };
  // 5. метро: наклонный эскалаторный ход + станция
  shaft('s5', P5.x - 1.6, P5.y + 0.3, 0.5);
  const st = new THREE.Group(); scene.add(st);
  { const hall = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.5), new THREE.MeshBasicMaterial({color: '#3a3532'})); hall.position.set(P5.x + 0.5, P5.y + 0.75, 0.03); hall.renderOrder = 4; st.add(hall);
    box(4.2, 0.18, 0.4, 'concrete', P5.x + 0.5, P5.y + 0.09, 0.08, {parent: st, cast: false});
    box(1.8, 0.12, 0.3, 'lamp', P5.x + 0.5, P5.y + 1.42, 0.08, {parent: st, cast: false, mat: {emissive: 1, ei: 1.2}}); }
  const train = new THREE.Group(); scene.add(train);
  for (let i = 0; i < 2; i++) { box(1.9, 0.62, 0.36, 'carBody', i * 2.0, 0, 0, {parent: train, r: 0.12, cast: false}); for (let k = 0; k < 4; k++) box(0.3, 0.2, 0.05, 'lamp', i * 2.0 - 0.65 + k * 0.43, 0.08, 0.19, {parent: train, r: 0.03, cast: false, mat: {emissive: 1, ei: 0.9}}); }
  train.position.set(P5.x - 1, P5.y + 0.52, 0.1);
  // павильон метро наверху с буквой М
  { const x = P5.x - 1.6, y = S(x, -1.6); box(2.4, 1.6, 1.6, 'wall', x, y + 0.8, -1.6, {r: 0.05}); box(2.6, 0.18, 1.8, 'roof', x, y + 1.7, -1.6, {r: 0.04});
    for (const [dx, a] of [[-0.28, 0], [0.28, 0], [-0.14, 0.5], [0.14, -0.5]]) { const m = box(0.09, 0.55, 0.05, 'red', x + dx, y + 1.25, -0.77, {r: 0.01, cast: false}); m.rotation.z = a; } }

  // 4. пещера: извилистый ход от склона холма вниз, внизу — озерцо; сталактиты
  const caveG = new THREE.Group(); scene.add(caveG);
  const cavePts = [[P4.x - 0.6, S(P4.x - 0.6, 0) - 0.2], [P4.x + 0.3, -1.5], [P4.x - 0.9, -3.5], [P4.x + 0.6, -5.5], [P4.x - 0.4, -7.5], [P4.x + 0.5, -9.5], [P4.x - 0.2, -11.0], [P4.x + 0.2, P4.y]];
  const caveCurve = new THREE.CatmullRomCurve3(cavePts.map(([x, y]) => new THREE.Vector3(x, y, 0.03)));
  const caveMesh = (() => { // лента переменной ширины вдоль кривой
    const N = 120, P = new Float32Array((N + 1) * 6), I = [];
    for (let i = 0; i <= N; i++) { const u = i / N, p = caveCurve.getPointAt(u), t = caveCurve.getTangentAt(u), nx = -t.y, ny = t.x, w = 0.28 + 0.22 * Math.sin(u * 23) ** 2 + (u > 0.93 ? (u - 0.93) * 9 : 0);
      P.set([p.x + nx * w, p.y + ny * w, 0.03, p.x - nx * w, p.y - ny * w, 0.03], i * 6); if (i < N) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#3d3430', side: THREE.DoubleSide})); m.renderOrder = 4; caveG.add(m); return {m, n: I.length};
  })();
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16, Math.PI, Math.PI), new THREE.MeshBasicMaterial({color: '#3f95dd'})); pool.scale.set(1.2, 0.55, 1); pool.position.set(P4.x + 0.2, P4.y + 0.05, 0.035); pool.renderOrder = 5; caveG.add(pool);
  for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.07, 0.35, 5), 'limestone', P4.x - 0.45 + i * 0.22, P4.y + 0.95, 0.06, {parent: caveG, rot: [Math.PI, 0, 0], cast: false});

  // 3. рудник: копёр с колесом, ствол, клеть, штрек с вагонетками и фонарями
  shaft('s3', P3.x, P3.y, 0.7);
  const drift = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), new THREE.MeshBasicMaterial({color: '#3d3430'})); drift.position.set(P3.x + 1.6, P3.y + 0.55, 0.03); drift.renderOrder = 4; scene.add(drift);
  box(3.4, 0.06, 0.2, 'metal', P3.x + 1.6, P3.y + 0.06, 0.08, {cast: false});
  const carts = []; for (let i = 0; i < 2; i++) { const g = new THREE.Group(); scene.add(g); box(0.6, 0.38, 0.3, 'metal', 0, 0.3, 0, {parent: g, r: 0.05, cast: false}); add(blob(0.22, i + 9, 0.3, 1.3, 1.3, 0.6, 0.9, 0), 'jarA', 0, 0.52, 0, {parent: g, cast: false}); for (const s of [-1, 1]) cyl(0.08, 0.08, 0.06, 'dark', s * 0.2, 0.1, 0.15, {parent: g, rot: [Math.PI / 2, 0, 0], cast: false}); carts.push(g); }
  for (let i = 0; i < 3; i++) box(0.14, 0.14, 0.06, 'lamp', P3.x + 0.7 + i * 1.1, P3.y + 0.95, 0.08, {r: 0.03, cast: false, mat: {emissive: 1, ei: 1.3}});
  const cage = box(0.55, 0.7, 0.3, 'metal', P3.x, 0, 0.08, {r: 0.04, cast: false});
  { const x = P3.x, y = S(x, -0.6); for (const s of [-1, 1]) { const m = box(0.14, 3.2, 0.14, 'metal', x + s * 0.7, y + 1.5, -0.6, {r: 0.03}); m.rotation.z = -s * 0.2; }
    box(1.0, 0.14, 0.3, 'metal', x, y + 3.0, -0.6, {r: 0.03}); add(new THREE.TorusGeometry(0.45, 0.06, 6, 18), 'red', x, y + 3.2, -0.6, {}); }

  // 2. Шэньди Такэ-1 и 1. Кольская: буровые вышки наверху, тонкая скважина, долото внизу
  const rig = (x, color) => { const y = S(x, -0.7); for (const s of [-1, 1]) for (const t of [-1, 1]) { const m = box(0.12, 5.2, 0.12, color, x + s * 0.55, y + 2.6, -0.7 + t * 0.45, {r: 0.02}); m.rotation.z = -s * 0.09; m.rotation.x = t * 0.08; }
    for (let k = 1; k < 5; k++) box(1.1 - k * 0.15, 0.08, 0.08, color, x, y + k * 1.0, -0.25, {r: 0.02}); box(1.6, 0.2, 1.4, 'concrete', x, y + 0.1, -0.7, {r: 0.03}); box(0.5, 0.35, 0.5, color, x, y + 5.3, -0.7, {r: 0.03}); };
  rig(P2.x, 'red'); rig(P1.x, 'shutter');
  shaft('s2', P2.x, P2.y, 0.22); shaft('s1', P1.x, P1.y, 0.24);
  const bit2 = cyl(0.17, 0.05, 0.4, 'metal', P2.x, 0, 0.09, {seg: 8, cast: false, mat: {emissive: 1, ei: 0.2}});
  const bit1 = cyl(0.18, 0.05, 0.42, 'metal', P1.x, 0, 0.09, {seg: 8, cast: false, mat: {emissive: 1, ei: 0.2}});
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 28), new THREE.MeshBasicMaterial({color: '#ff9a4a', transparent: true, opacity: 0, depthWrite: false})); glow.position.set(P1.x, P1.y, 0.05); glow.renderOrder = 6; scene.add(glow);

  // поверхность: деревья, ели, домики, облака
  for (const [x, z, s] of [[-12, -4, 1.4], [-15, -7, 1.6], [13.5, -5, 1.4], [16, -8, 1.7], [-4, -9, 1.5], [8.5, -10, 1.6], [0, -13, 1.7], [-19, -14, 1.9], [20, -15, 1.8]]) fir(x, S(x, z) - 0.05, z, s, false);
  tree(-10.5, S(-10.5, -2.5) - 0.05, -2.5, 2.4, 1.0, 31); tree(14.6, S(14.6, -2.0) - 0.05, -2.0, 2.2, 0.95, 41);
  const smokes = [smoke(P1.x, S(P1.x, -0.7) + 5.6, -0.7, 5, 0.7)];
  const clouds = [cloud(sky, -6, 12, -18, 1.6, 51), cloud(sky, 7, 15, -26, 1.9, 52), cloud(sky, 12, 10, -15, 1.0, 53), cloud(sky, -13, 16, -36, 2.3, 54)];

  // q: s1..s5 — стволы прорисованы (0..1); heat 0..1 — жар у дна Кольской; t — секунды
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.2 + 0.05 * i); });
    smokes.forEach((f) => f(t, 0.6));
    shafts.s5(q.s5 ?? 0); const g5 = sm(((q.s5 ?? 0) - 0.7) / 0.3), sv5 = g5 > 0.01; st.visible = sv5; st.scale.set(Math.max(0.001, g5), 1, 1); st.position.x = (P5.x - 1.6) * (1 - g5);
    train.position.x = P5.x - 1.6 + ((t * 0.9) % 6.0) - 1.2; train.visible = g5 > 0.99 && train.position.x > P5.x - 1.6 && train.position.x < P5.x + 1.2;
    const c4 = q.s4 ?? 0; caveMesh.m.geometry.setDrawRange(0, Math.floor(caveMesh.n * c4 / 6) * 6); caveMesh.m.visible = c4 > 0.005; const g4 = sm((c4 - 0.85) / 0.15); pool.visible = g4 > 0.01; pool.scale.set(1.2 * Math.max(0.001, g4), 0.55 * Math.max(0.001, g4), 1); caveG.children.forEach((m, i) => { if (i > 1) { m.visible = g4 > 0.01; m.scale.setScalar(Math.max(0.001, g4)); } });
    const y3 = shafts.s3(q.s3 ?? 0), g3 = sm(((q.s3 ?? 0) - 0.75) / 0.25), s3d = g3 > 0.99; drift.visible = g3 > 0.01; drift.scale.x = Math.max(0.001, g3); drift.position.x = P3.x + 1.6 * g3; cage.position.y = s3d ? lerp(P3.y + 0.4, -1, 0.5 + 0.5 * Math.cos(t * 0.5)) : y3 + 0.35; cage.visible = (q.s3 ?? 0) > 0.02;
    carts.forEach((g, i) => { g.visible = s3d; g.position.set(P3.x + 0.6 + ((t * 0.35 + i * 1.4) % 2.8), P3.y + 0.08, 0.09); });
    const y2 = shafts.s2(q.s2 ?? 0); bit2.position.y = y2 + 0.2; bit2.rotation.y = t * 6; bit2.visible = (q.s2 ?? 0) > 0.01;
    const y1 = shafts.s1(q.s1 ?? 0); bit1.position.y = y1 + 0.21; bit1.rotation.y = t * 6; bit1.visible = (q.s1 ?? 0) > 0.01;
    const h = q.heat ?? 0; heatM.opacity = 0.22 * h; glow.material.opacity = 0.55 * h * (0.85 + 0.15 * Math.sin(t * 3)); bit1.material.emissive.set('#ff6a2a'); bit1.material.emissiveIntensity = 0.2 + 1.2 * h;
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
