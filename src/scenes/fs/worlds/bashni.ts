// @ts-nocheck
// Мир «Топ-5 самых высоких телебашен» (23.11): город на плато (1 ед. = 25 м), пять башен в ряд — каждая вырастает, потом лента.
// Восточная жемчужина (468), Останкино (540), Си-Эн Тауэр (553, молнии), Кантонская (600, сетка + колесо), Скайтри (634, центральная колонна).
// Пинъань (599), часовая башня Мекки (601, циферблат 43 м), Шанхайская башня (632, спираль), Мердека 118 (679), Бурдж-Халифа (828).
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const K = 1 / 25, Z = -6;
export function S(x, z) { return 0.05 * Math.sin(x * 0.3 + z * 0.2) * sm((-z - 2) / 4) + 1.5 * sm((-z - 26) / 12); }
const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.4, (x) => -1.6 - 0.1 * Math.sin(x * 0.7), (x) => -4.4 + 0.3 * Math.sin(x * 0.3), (x) => -11 + 0.4 * Math.sin(x * 0.2), () => -32];
const LAYERS = ['asphalt', 'gravel', 'clay', 'rock', 'deep'];
export const TOWERS = [
  {key: 'b5', x: -28, h: 468 * K},
  {key: 'b4', x: -14, h: 540 * K},
  {key: 'b3', x: 0, h: 553 * K},
  {key: 'b2', x: 14, h: 600 * K},
  {key: 'b1', x: 28, h: 634 * K},
];
const tip = (t) => [t.x, t.h - 0.3, Z + 0.4];
export const T = {b5: tip(TOWERS[0]), b4: tip(TOWERS[1]), b3: tip(TOWERS[2]), b2: tip(TOWERS[3]), b1: tip(TOWERS[4]),
  rest: [-28, 267 * K, Z + 1.4], cables: [-14, 8, Z + 1], bolt: [0.3, 553 * K - 1, Z], wheel: [14, 450 * K + 0.5, Z + 1.6], column: [28, 9, Z + 1.3]};
const cam = (x, y, d) => ({pos: [x + 5, y + 1.5, d], look: [x, y, Z], fov: 40});
export const CAMS = {
  hook: {pos: [4.5, 18, 34], look: [0, 20, Z], fov: 40},
  hook2: {pos: [4.5, 15, 42], look: [0, 16.5, Z], fov: 40},
  b5: cam(-28, 10.5, 36), b4: cam(-14, 11.5, 39), b3: cam(0, 12, 40), b2: cam(14, 12.5, 42), b1: cam(28, 13, 44),
  top1: {pos: [31, 19, 26], look: [28, 16, Z], fov: 40},
  wide: {pos: [8, 13, 72], look: [4, 12, Z], fov: 40},
  cover: {pos: [6, 13, 56], look: [4, 13, Z], fov: 40},
};

export function build(scene, sky) {
  const Kc = makeKit(scene, {asphalt: '#6f7177', gravel: '#9a948c', clay: '#c98a5c', rock: '#8a8fa6', deep: '#77707c', grass: '#8fbf62',
    pearl: '#b8635a', skyW: '#dfe3e6', concrete: '#cfc8bc', cloudDark: '#7d8290', glassA: '#7fa3c4', glassB: '#9cb7cf', glassC: '#6e93b5', pier: '#d9d4cb', stoneW: '#e2d6bf', greenR: '#4f8f6a', gold: '#d8b04a', clockF: '#f4efe2', crane: '#e0a83a', core: '#a8a49c', bldA: '#d8c7ad', bldB: '#c4ccd4', bldC: '#e6d9c3'});
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
  const mk = (t) => { const g = new THREE.Group(); g.position.set(t.x, S(t.x, Z), Z); scene.add(g); towers[t.key] = g; return g; };
  const sph = (r, role, y, g) => add(new THREE.SphereGeometry(r, 16, 10), role, 0, y, 0, {parent: g});
  const restRing = [];
  { // 5. Восточная жемчужина: три наклонные опоры, три колонны, шары; кольцо ресторана крутится
    const t = TOWERS[0], g = mk(t), H = t.h;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, m = cyl(0.28, 0.4, 7.5, 'pier', Math.cos(a) * 2.2, 3.3, Math.sin(a) * 2.2, {parent: g, seg: 7}); m.rotation.z = -Math.cos(a) * 0.45; m.rotation.x = Math.sin(a) * 0.45; }
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 1.05; cyl(0.32, 0.32, H * 0.6, 'pier', Math.cos(a) * 0.7, H * 0.3, Math.sin(a) * 0.7, {parent: g, seg: 7}); }
    sph(2.0, 'pearl', H * 0.25, g); for (const y of [0.36, 0.42, 0.48]) sph(0.55, 'pearl', H * y, g); sph(1.3, 'pearl', H * 0.6, g);
    const ring = new THREE.Group(); ring.position.y = H * 0.6; g.add(ring); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; box(0.22, 0.2, 0.06, 'glass', Math.cos(a) * 1.29, 0, Math.sin(a) * 1.29, {parent: ring, rot: [0, -a + Math.PI / 2, 0], cast: false, mat: {emissive: 1, win: 1, ei: 0.8}}); } restRing.push(ring);
    cyl(0.3, 0.4, H * 0.12, 'pier', 0, H * 0.71, 0, {parent: g, seg: 8}); sph(0.6, 'pearl', H * 0.78, g); cyl(0.06, 0.2, H * 0.2, 'pier', 0, H * 0.9, 0, {parent: g, seg: 6});
  }
  { // 4. Останкино: «перевёрнутая лилия» внизу, конусный ствол, корзины-площадки, мачта с полосами
    const t = TOWERS[1], g = mk(t), H = t.h;
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, m = box(0.4, 3.4, 0.7, 'concrete', Math.cos(a) * 2.2, 1.6, Math.sin(a) * 2.2, {parent: g, r: 0.08}); m.rotation.y = -a; m.rotation.z = Math.cos(a) * 0.3; m.rotation.x = -Math.sin(a) * 0.3; }
    add(new THREE.CylinderGeometry(0.55, 1.6, H * 0.72, 12), 'concrete', 0, H * 0.36 + 0.4, 0, {parent: g});
    for (const [y, r] of [[0.6, 1.9], [0.66, 1.6]]) add(new THREE.CylinderGeometry(r, r * 0.9, 0.7, 14), 'glassA', 0, H * y, 0, {parent: g});
    for (let k = 0; k < 8; k++) cyl(0.22 - k * 0.015, 0.25 - k * 0.015, H * 0.04, k % 2 ? 'white' : 'red', 0, H * (0.72 + k * 0.035), 0, {parent: g, seg: 8});
  }
  const bolt = new THREE.Group(); scene.add(bolt);
  { // 3. Си-Эн Тауэр: шестигранный ствол с тремя рёбрами, главный «бублик», маленькая площадка, мачта
    const t = TOWERS[2], g = mk(t), H = t.h;
    add(new THREE.CylinderGeometry(0.6, 1.3, H * 0.83, 6), 'concrete', 0, H * 0.415, 0, {parent: g});
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, m = box(2.6, H * 0.5, 0.45, 'concrete', Math.cos(a) * 1.1, H * 0.25, -Math.sin(a) * 1.1, {parent: g, r: 0.06}); m.rotation.y = a; m.scale.set(1, 1, 1); }
    add(new THREE.CylinderGeometry(2.2, 1.6, 0.9, 16), 'concrete', 0, H * 0.62, 0, {parent: g}); add(new THREE.CylinderGeometry(2.25, 2.25, 0.35, 16), 'glassA', 0, H * 0.62 + 0.3, 0, {parent: g});
    add(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 12), 'concrete', 0, H * 0.8, 0, {parent: g});
    for (let k = 0; k < 6; k++) cyl(0.2 - k * 0.02, 0.24 - k * 0.02, H * 0.035, k % 2 ? 'white' : 'red', 0, H * (0.82 + k * 0.03), 0, {parent: g, seg: 8});
    // молния — ломаная из облака в мачту (без вспышки на весь кадр)
    const pts = [[0.2, 553 * K + 9], [-0.8, 553 * K + 6.5], [0.6, 553 * K + 4.2], [-0.4, 553 * K + 2.2], [0, 553 * K + 0.1]];
    for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, l, 0.16), new THREE.MeshBasicMaterial({color: '#fff6c8'})); m.position.set(t.x + (a[0] + b[0]) / 2, S(t.x, Z) + (a[1] + b[1]) / 2, Z); m.rotation.z = Math.atan2(-(b[0] - a[0]), b[1] - a[1]); bolt.add(m); }
    const cl = blob(2.2, 77, 0.2, 1.4, 1.6, 0.7, 1.2); add(cl, 'cloudDark', t.x + 0.5, S(t.x, Z) + 553 * K + 10, Z - 1, {parent: bolt, cast: false});
  }
  const wheelCabs = [];
  { // 2. Кантонская: сетка из прямых стоек (гиперболоид, «тонкая талия»), ядро, колесо на крыше, мачта
    const t = TOWERS[3], g = mk(t), H = t.h, Hb = 450 * K, N = 22;
    add(new THREE.CylinderGeometry(0.7, 0.9, Hb, 10), 'concrete', 0, Hb / 2, 0, {parent: g});
    for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = a0 + 2.3, p0 = new THREE.Vector3(Math.cos(a0) * 2.6, 0, Math.sin(a0) * 1.9), p1 = new THREE.Vector3(Math.cos(a1) * 1.5, Hb, Math.sin(a1) * 1.1), d = p1.clone().sub(p0), L = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, L, 5), Kc.M('pier')); m.position.copy(p0.clone().add(p1).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; g.add(m); }
    for (let k = 1; k < 9; k++) { const y = Hb * k / 9, u = y / Hb, rx = Math.abs(Math.cos(Math.PI * u * 0.5)) * 0 + lerp(2.6, 1.5, u), rr = Math.max(0.95, Math.sqrt((1 - u) ** 2 * 2.6 ** 2 + u ** 2 * 1.5 ** 2 + 2 * u * (1 - u) * 2.6 * 1.5 * Math.cos(2.3))); const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.06, 4, 24), Kc.M('pier')); ring.rotation.x = Math.PI / 2; ring.scale.set(1, 0.73, 1); ring.position.y = y; g.add(ring); }
    const wh = new THREE.Group(); wh.position.y = Hb + 0.3; g.add(wh); add(new THREE.TorusGeometry(1.25, 0.05, 4, 24), 'pier', 0, 0, 0, {parent: wh, rot: [Math.PI / 2, 0, 0]});
    for (let i = 0; i < 12; i++) { const c = add(new THREE.SphereGeometry(0.16, 8, 6), 'glassB', 0, 0.1, 0, {parent: wh, cast: false}); wheelCabs.push(c); }
    cyl(0.12, 0.35, H - Hb - 0.3, 'pier', 0, Hb + (H - Hb) / 2, 0, {parent: g, seg: 6});
  }
  { // 1. Скайтри: треугольная «тренога» переходит в круглый ствол, две площадки, мачта; центральная колонна видна в прорези
    const t = TOWERS[4], g = mk(t), H = t.h;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5, m = cyl(0.25, 0.5, H * 0.35, 'skyW', Math.cos(a) * 1.6, H * 0.17, Math.sin(a) * 1.6, {parent: g, seg: 6}); m.rotation.z = -Math.cos(a) * 0.11; m.rotation.x = Math.sin(a) * 0.11; }
    add(new THREE.CylinderGeometry(0.85, 1.35, H * 0.55, 12), 'skyW', 0, H * 0.33, 0, {parent: g});
    for (let k = 0; k < 14; k++) add(new THREE.TorusGeometry(lerp(1.37, 0.86, k / 14), 0.04, 4, 20), 'pier', 0, H * (0.07 + k * 0.038), 0, {parent: g, rot: [Math.PI / 2, 0, 0], cast: false});
    box(0.42, H * 0.5, 0.06, 'concrete', 0, H * 0.32, 1.3, {parent: g, r: 0.03}); // «прорезь» — центральная колонна
    for (const [y, r] of [[350 / 634, 1.5], [450 / 634, 1.05]]) add(new THREE.CylinderGeometry(r, r * 0.9, 0.8, 16), 'glassA', 0, H * y, 0, {parent: g});
    add(new THREE.CylinderGeometry(0.6, 0.85, H * 0.15, 12), 'skyW', 0, H * 0.63, 0, {parent: g});
    cyl(0.1, 0.4, H * 0.24, 'skyW', 0, H * 0.86, 0, {parent: g, seg: 8});
  }
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

  // q: b5..b1 — 0..0.55 башня растёт, 0.55..1 лента; bolt 0/1 — молния
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const tw of TOWERS) { const p = q[tw.key] ?? 0, gr = sm(p / 0.55), tp = sm((p - 0.55) / 0.45); const g = towers[tw.key]; g.visible = gr > 0.003; g.scale.set(1, Math.max(0.001, gr), 1); tapes[tw.key](tp); }
    restRing.forEach((r) => (r.rotation.y = t * 0.15));
    wheelCabs.forEach((c, i) => { const a = i / wheelCabs.length * Math.PI * 2 + t * 0.12; c.position.set(Math.cos(a) * 1.25, 0.12, Math.sin(a) * 1.25 * 0.73); });
    const bv = q.bolt ?? 0; bolt.visible = bv > 0.5 && Math.sin(t * 40) > -0.3;
    cars.forEach((c, i) => { const dir = i % 2 ? -1 : 1, u = ((t * 0.035 + i * 0.13) % 1 + 1) % 1; c.position.set(dir * lerp(-58, 58, u), 0.08, -1.8 + dir * 0.75); c.rotation.y = dir > 0 ? 0 : Math.PI; });
  };
  animate({t: 0});
  return {animate, T, wins: Kc.wins, lamps: Kc.lamps};
}
