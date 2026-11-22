// @ts-nocheck
// Мир «Топ-5 самых высоких зданий» (22.11): город на плато (масштаб 1:25 — 1 ед. = 25 м), пять небоскрёбов в ряд,
// вокруг кварталы с окнами, дороги, машины, деревья. Каждое место: башня вырастает, потом жёлтая лента от шпиля до земли.
// Пинъань (599), часовая башня Мекки (601, циферблат 43 м), Шанхайская башня (632, спираль), Мердека 118 (679), Бурдж-Халифа (828).
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const K = 1 / 25, Z = -6;
export function S(x, z) { return 0.05 * Math.sin(x * 0.3 + z * 0.2) * sm((-z - 2) / 4) + 1.5 * sm((-z - 26) / 12); }
const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.4, (x) => -1.6 - 0.1 * Math.sin(x * 0.7), (x) => -4.4 + 0.3 * Math.sin(x * 0.3), (x) => -11 + 0.4 * Math.sin(x * 0.2), () => -32];
const LAYERS = ['asphalt', 'gravel', 'clay', 'rock', 'deep'];
export const TOWERS = [
  {key: 'b5', x: -28, h: 599 * K},
  {key: 'b4', x: -14, h: 601 * K},
  {key: 'b3', x: 0, h: 632 * K},
  {key: 'b2', x: 14, h: 679 * K},
  {key: 'b1', x: 28, h: 828 * K},
];
const tip = (t) => [t.x, t.h - 0.3, Z + 0.4];
export const T = {b5: tip(TOWERS[0]), b4: tip(TOWERS[1]), b3: tip(TOWERS[2]), b2: tip(TOWERS[3]), b1: tip(TOWERS[4]),
  clock: [-14, 601 * K * 0.67, Z + 1.9], twist: [1.6, 12, Z + 1.2], deck: [28.8, 555 * K, Z + 1.2], jed: [44, 16, -42], spire: [14, 25, Z]};
const cam = (x, y, d) => ({pos: [x + 5, y + 1.5, d], look: [x, y, Z], fov: 40});
export const CAMS = {
  hook: {pos: [33, 17, 46], look: [28, 17.5, Z], fov: 40},
  hook2: {pos: [34, 16, 52], look: [28, 16.5, Z], fov: 40},
  b5: cam(-28, 12.5, 40), b4: cam(-14, 12.5, 40), b3: cam(0, 13, 41), b2: cam(14, 14, 44), b1: cam(28, 16.5, 50),
  jed: {pos: [36, 16, 52], look: [32, 15, -14], fov: 40},
  wide: {pos: [10, 15, 74], look: [6, 14, Z], fov: 40},
  cover: {pos: [26, 13, 58], look: [18, 15, Z], fov: 40},
};

export function build(scene, sky) {
  const Kc = makeKit(scene, {asphalt: '#6f7177', gravel: '#9a948c', clay: '#c98a5c', rock: '#8a8fa6', deep: '#77707c', grass: '#8fbf62',
    glassA: '#7fa3c4', glassB: '#9cb7cf', glassC: '#6e93b5', pier: '#d9d4cb', stoneW: '#e2d6bf', greenR: '#4f8f6a', gold: '#d8b04a', clockF: '#f4efe2', crane: '#e0a83a', core: '#a8a49c', bldA: '#d8c7ad', bldB: '#c4ccd4', bldC: '#e6d9c3'});
  const {add, box, cyl, blob, tree, cloud} = Kc;
  cutFace(Kc, LAYERS, (k, x) => B[k](x), -60, 60, []);
  ground(Kc, S, 'grass', -60, 60, -40, 1.2);
  hills(Kc, 'hillMid', -39.5, -80, (x, z) => S(x, -40) - 0.3 + 6 * sm((-z - 40) / 30) * (0.55 + 0.45 * Math.sin(x * 0.06 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(Kc, 'hillFar', -76, -170, (x, z) => 4 + 16 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0; i < 22; i++) { const x = lerp(-56, 56, r()), y = lerp(-9, -1.8, r()), rr = 0.2 + r() * 0.35; add(blob(rr, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); } }
  // проспект и поперечные улицы (поверх травы на 0.12)
  box(120, 0.12, 3.2, 'asphalt', 0, 0.08, -1.8, {r: 0.02, cast: false}); for (let x = -58; x < 58; x += 2.4) box(1.1, 0.03, 0.14, 'white', x, 0.155, -1.8, {cast: false});
  for (const x of [-35, -21, -7, 7, 21, 35]) box(2.4, 0.1, 30, 'asphalt', x, 0.07, -18, {r: 0.02, cast: false});
  const cars = []; for (let i = 0; i < 10; i++) { const c = new THREE.Group(); scene.add(c); box(0.9, 0.38, 0.5, ['red', 'white', 'blue', 'yellowCar', 'dark'][i % 5], 0, 0.33, 0, {parent: c, r: 0.08}); box(0.5, 0.26, 0.45, 'glassDark', -0.05, 0.6, 0, {parent: c, r: 0.06}); cars.push(c); }

  // кварталы с окнами (не ближе 3 к башням)
  const winsMat = {emissive: 1, win: 1, ei: 0.7};
  { const r = rnd(21); let n = 0;
    for (let i = 0; i < 1500 && n < 110; i++) {
      const x = lerp(-56, 56, r()), z = lerp(-36, -3.6, r()), w = 1.8 + r() * 1.6, d = 1.8 + r() * 1.4, h = 1.5 + r() * 5.5 * (1 - 0.3 * sm(-z / 30));
      if (TOWERS.some((t) => Math.abs(t.x - x) < 4.6 + w / 2 && Math.abs(Z - z) < 4.2 + d / 2)) continue;
      if ([-35, -21, -7, 7, 21, 35].some((sx) => Math.abs(sx - x) < 1.3 + w / 2)) continue;
      if (Math.abs(z + 1.8) < 1.7 + d / 2) continue;
      const y0 = S(x, z); box(w, h, d, ['bldA', 'bldB', 'bldC'][n % 3], x, y0 + h / 2, z, {r: 0.05}); box(w + 0.1, 0.18, d + 0.1, 'stone', x, y0 + h + 0.05, z, {r: 0.03});
      const fl = Math.floor((h - 0.6) / 0.8), cols = Math.max(1, Math.floor((w - 0.4) / 0.6));
      for (let f = 0; f < fl; f++) for (let c = 0; c < cols; c++) if (hash3(n, f, c) > 0.25) box(0.32, 0.4, 0.06, 'glass', x - (cols - 1) * 0.3 + c * 0.6, y0 + 0.8 + f * 0.8, z + d / 2 + 0.03, {r: 0.01, cast: false, mat: winsMat});
      n++;
    } }
  { const r = rnd(31); for (let i = 0, n = 0; i < 300 && n < 34; i++) { const x = lerp(-56, 56, r()), z = lerp(-4.2, -0.6, r()); if (Math.abs(z + 1.8) < 1.9) continue; tree(x, S(x, z) - 0.03, z, 0.6 + r() * 0.3, 0.45 + r() * 0.2, n + 300); n++; } }

  // ── пять башен; у каждой группа растёт снизу вверх
  const towers = {};
  const band = (grp, w, y, d) => box(w + 0.16, 0.14, d + 0.16, 'pier', 0, y, 0, {parent: grp, r: 0.02, cast: false});
  const mk = (t) => { const g = new THREE.Group(); g.position.set(t.x, S(t.x, Z), Z); scene.add(g); towers[t.key] = g; return g; };
  { // 5. Пинъань: квадрат со срезанными углами, сужается, пирамида и шпиль
    const t = TOWERS[0], g = mk(t), H = t.h;
    add(new THREE.CylinderGeometry(1.75, 2.35, H * 0.86, 8, 6), 'glassA', 0, H * 0.43, 0, {parent: g, rot: [0, Math.PI / 8, 0]});
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, m = box(0.32, H * 0.86, 0.32, 'pier', Math.cos(a) * 2.05, H * 0.43, Math.sin(a) * 2.05, {parent: g, r: 0.03}); m.rotation.z = Math.cos(a) * 0.012; m.rotation.x = -Math.sin(a) * 0.012; }
    add(new THREE.ConeGeometry(1.6, H * 0.08, 4), 'pier', 0, H * 0.9, 0, {parent: g, rot: [0, Math.PI / 4, 0]}); cyl(0.05, 0.14, H * 0.07, 'pier', 0, H * 0.965, 0, {parent: g, seg: 5});
  }
  { // 4. Часовая башня Мекки: подиум, башня, куб с циферблатами (Ø 43 м = 1,7 ед.), зелёный шпиль
    const t = TOWERS[1], g = mk(t), H = t.h;
    box(9, 3.2, 5.5, 'stoneW', 0, 1.6, 0, {parent: g, r: 0.08}); for (const dx of [-3.2, 3.2]) box(2.2, 6.5, 2.4, 'stoneW', dx, 3.25, 0, {parent: g, r: 0.06});
    box(3.4, H * 0.62, 3.4, 'stoneW', 0, H * 0.31, 0, {parent: g, r: 0.05});
    box(3.9, H * 0.11, 3.9, 'stoneW', 0, H * 0.675, 0, {parent: g, r: 0.05});
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, f = new THREE.Group(); f.position.set(Math.sin(a) * 1.97, H * 0.675, Math.cos(a) * 1.97); f.rotation.y = a; g.add(f);
      add(new THREE.CircleGeometry(0.86, 24), 'clockF', 0, 0, 0.02, {parent: f, cast: false}); add(new THREE.RingGeometry(0.86, 0.98, 24), 'greenR', 0, 0, 0.03, {parent: f, cast: false});
      box(0.07, 0.6, 0.03, 'dark', 0, 0.26, 0.05, {parent: f, cast: false}); const mh = box(0.07, 0.45, 0.03, 'dark', 0.17, -0.1, 0.06, {parent: f, cast: false}); mh.rotation.z = 2.2; }
    add(new THREE.CylinderGeometry(1.2, 1.7, H * 0.08, 8), 'greenR', 0, H * 0.77, 0, {parent: g}); add(new THREE.ConeGeometry(1.0, H * 0.15, 8), 'greenR', 0, H * 0.885, 0, {parent: g});
    cyl(0.05, 0.12, H * 0.04, 'gold', 0, H * 0.98, 0, {parent: g, seg: 5}); add(new THREE.SphereGeometry(0.22, 10, 8), 'gold', 0, H * 0.95, 0, {parent: g});
  }
  { // 3. Шанхайская башня: скруглённый треугольник, каждый ярус повёрнут — спираль
    const t = TOWERS[2], g = mk(t), H = t.h, N = 22;
    for (let i = 0; i < N; i++) { const u = i / N, r = lerp(2.5, 1.35, u ** 0.9), hh = H * 0.93 / N; add(new THREE.CylinderGeometry(r * 0.985, r, hh * 0.97, 6), i % 2 ? 'glassB' : 'glassC', 0, hh * (i + 0.5), 0, {parent: g, rot: [0, i * 0.095, 0]}); }
    add(new THREE.CylinderGeometry(1.1, 1.3, H * 0.06, 6, 1, true), 'pier', 0, H * 0.96, 0, {parent: g, rot: [0, N * 0.095, 0]});
  }
  { // 2. Мердека 118: гранёный стебель + длинный шпиль (≈160 м)
    const t = TOWERS[3], g = mk(t), H = t.h, Hb = H * 0.76, N = 12;
    for (let i = 0; i < N; i++) { const u = i / N, r = lerp(2.4, 1.0, u ** 1.3), hh = Hb / N; add(new THREE.CylinderGeometry(lerp(2.4, 1.0, ((i + 1) / N) ** 1.3), r, hh, 5), i % 2 ? 'glassA' : 'glassB', 0, hh * (i + 0.5), 0, {parent: g, rot: [0, (i % 2) * 0.63, 0]}); }
    add(new THREE.ConeGeometry(0.95, H - Hb, 5), 'glassB', 0, Hb + (H - Hb) / 2, 0, {parent: g});
  }
  { // 1. Бурдж-Халифа: ядро + три крыла, ступенями вниз наружу, шпиль
    const t = TOWERS[4], g = mk(t), H = t.h;
    add(new THREE.CylinderGeometry(0.35, 1.25, H * 0.82, 6), 'glassA', 0, H * 0.41, 0, {parent: g});
    for (let w = 0; w < 3; w++) { const a = w * Math.PI * 2 / 3 + 0.3;
      for (let k = 0; k < 6; k++) { const L = 2.6 * (1 - k / 6.4), hk = H * (0.22 + 0.105 * k) * (1 - 0.02 * w), m = box(L, hk, 1.15, k % 2 ? 'glassB' : 'glassA', Math.cos(a) * L / 2, hk / 2, -Math.sin(a) * L / 2, {parent: g, r: 0.05}); m.rotation.y = a; } }
    add(new THREE.ConeGeometry(0.32, H * 0.2, 6), 'pier', 0, H * 0.9, 0, {parent: g});
    box(1.6, 0.18, 1.6, 'pier', 0, 555 * K, 0, {parent: g, r: 0.03});
  }
  // Джидда: стройка далеко — ядро и кран
  const jed = new THREE.Group(); jed.position.set(46, S(46, -44), -44); scene.add(jed);
  { cyl(1.4, 2.2, 16, 'core', 0, 8, 0, {parent: jed, seg: 6}); for (let k = 0; k < 6; k++) box(4.4, 0.18, 4.4, 'pier', 0, 1.5 + k * 2.6, 0, {parent: jed, r: 0.02});
    box(0.4, 21, 0.4, 'crane', 2.4, 10.5, 0, {parent: jed}); box(9, 0.35, 0.35, 'crane', 4.6, 20.8, 0, {parent: jed}); box(1.2, 0.6, 0.6, 'dark', 0.6, 20.8, 0, {parent: jed}); }

  // жёлтые ленты: от вершины до земли, справа от башни
  const tapes = {};
  for (const t of TOWERS) {
    const g = new THREE.PlaneGeometry(0.22, 1); g.translate(0, -0.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#ffd23a'})); const yt = S(t.x, Z) + t.h;
    m.position.set(t.x + (t.key === 'b4' ? 5.2 : 3.4), yt, Z + 3.2); m.renderOrder = 6; scene.add(m);
    const cap = box(0.55, 0.12, 0.1, 'dark', m.position.x, yt + 0.06, Z + 3.2, {r: 0.02, cast: false});
    const lead = box(m.position.x - t.x - 0.4, 0.06, 0.06, 'dark', (t.x + m.position.x) / 2 + 0.2, yt, Z + 3.2, {cast: false});
    tapes[t.key] = (p) => { m.scale.y = Math.max(0.001, t.h * p); m.visible = cap.visible = lead.visible = p > 0.005; };
  }
  const clouds = [cloud(sky, -20, 34, -50, 3.0, 51), cloud(sky, 12, 38, -60, 3.5, 52), cloud(sky, 34, 30, -46, 2.2, 53), cloud(sky, -40, 40, -70, 4.0, 54)];

  // q: b5..b1 — 0..0.55 башня растёт, 0.55..1 лента; jed 0..1
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const tw of TOWERS) { const p = q[tw.key] ?? 0, gr = sm(p / 0.55), tp = sm((p - 0.55) / 0.45); const g = towers[tw.key]; g.visible = gr > 0.003; g.scale.set(1, Math.max(0.001, gr), 1); tapes[tw.key](tp); }
    const j = q.jed ?? 0.35; jed.scale.set(1, Math.max(0.05, j), 1);
    cars.forEach((c, i) => { const dir = i % 2 ? -1 : 1, u = ((t * 0.035 + i * 0.13) % 1 + 1) % 1; c.position.set(dir * lerp(-58, 58, u), 0.08, -1.8 + dir * 0.75); c.rotation.y = dir > 0 ? 0 : Math.PI; });
  };
  animate({t: 0});
  return {animate, T, wins: Kc.wins, lamps: Kc.lamps};
}
