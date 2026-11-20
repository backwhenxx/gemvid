// @ts-nocheck
// Мир «Топ-5 самых высоких мостов» (20.11): горное плато, срез спереди, пять ущелий в ряд (глубина 1:25 — 1 ед. = 25 м,
// ширина условная). В каждом ущелье — река на дне и мост на высоте. Хук: две «Эйфелевы башни» в самом глубоком ущелье.
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const K = 1 / 25, W = 6, ZB = -4;
export const GORGES = [
  {key: 'b5', x: -34, d: 461 * K, type: 'susp'},   // Цзиньань
  {key: 'b4', x: -17, d: 485 * K, type: 'susp'},   // Пули
  {key: 'b3', x: 0, d: 496 * K, type: 'susp'},     // Сыду
  {key: 'b2', x: 17, d: 565 * K, type: 'stay'},    // Дугэ (вантовый)
  {key: 'b1', x: 34, d: 625 * K, type: 'susp'},    // Хуацзян
];
const prof = (u) => (u < 0.3 ? 1 : 1 - sm((u - 0.3) / 0.7));
const flat = (z) => sm((Math.abs(z - ZB) - 2.6) / 2.5);
export function S(x, z) {
  let h = (0.25 * Math.sin(x * 0.21 + z * 0.17) + 0.2 * vnoise(x * 0.15, 1, z * 0.15)) * flat(z) * sm(-z / 1.5);
  for (const g of GORGES) h -= g.d * prof(Math.abs(x - g.x) / W);
  return h;
}
const LV = [null, -0.35, -1.6, -6, -12.5, -19, -45];
const LAYERS = ['grass', 'soil', 'sandst', 'lime', 'rock', 'deep'];
const COL = {grass: '#86b85a', soil: '#7d5a44', sandst: '#c79a6a', lime: '#cdbf9c', rock: '#9b8e84', deep: '#77707c'};
const bound = (k, x) => (k === 0 ? S(x, 0) : Math.min(S(x, 0), LV[k]));
const DY = 0.6; // верх полотна
export const T = Object.fromEntries([
  ...GORGES.map((g) => [g.key, [g.x - 3.2, DY + 0.1, ZB + 1]]),
  ...GORGES.map((g) => ['r' + g.key.slice(1), [g.x, -g.d + 0.4, -1.5]]),
  ['eif', [33.1, -9, -1.8]], ['stay', [17 + 4.2, 8.5, ZB]], ['cars', [36, DY + 0.5, ZB]], ['cloud', [31, -10, -9]],
]);
const cam = (x) => ({pos: [x + 4, -4, 52], look: [x, -9, ZB], fov: 40});
export const CAMS = {
  hook: {pos: [40, -8, 44], look: [34, -9.5, ZB], fov: 40},
  hook2: {pos: [39, -5, 49], look: [34, -9, ZB], fov: 40},
  b5: cam(-34), b4: cam(-17), b3: cam(0), b2: cam(17), b1: cam(34),
  top1: {pos: [44, 7, 20], look: [33, -2, ZB], fov: 40},
  wide: {pos: [26, -3, 72], look: [22, -8, ZB], fov: 40},
  cover: {pos: [41, 1, 50], look: [34, -5, ZB], fov: 40},
};

export function build(scene, sky) {
  const Kt = makeKit(scene, {...COL, leaf: '#4f9c4e', leaf2: '#86c25c', deck: '#5c5f66', girder: '#c9c4ba', pylon: '#d8d2c6', cableC: '#e8e2d4', eiffel: '#8a6a4c', blue: '#4f7fb5', yellowCar: '#e8b93a'});
  const {add, box, cyl, blob, tree, fir, cloud, tube} = Kt;
  const X0 = -60, X1 = 60, Z0 = -46, DX = 0.5;
  cutFace(Kt, LAYERS, bound, X0, X1, [], 0, DX);

  // земля: сетка с цветами вершин — трава сверху, на стенах ущелий те же слои, что в срезе
  const layerCol = (y) => { for (let k = LV.length - 2; k >= 1; k--) if (y < LV[k]) return COL[LAYERS[k]]; return y < -0.5 ? COL.soil : COL.grass; };
  {
    const xs = [], zs = []; for (let x = X0; x <= X1 + 1e-6; x += DX) xs.push(x); for (let z = 0; z >= Z0 - 1e-6; z -= z > -6 ? 0.5 : 1.0) zs.push(z);
    const P = [], I = [], C = [], c = new THREE.Color();
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
      const x = xs[i], z = zs[j] + (j > 0 && j < zs.length - 1 ? (hash3(i, j, 2) - 0.5) * 0.2 : 0), y = S(x, z);
      P.push(x, y, z); c.set(layerCol(y + (j > 0 ? (hash3(i, j, 5) - 0.5) * 0.4 : 0))); C.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, cc = a + xs.length, d = cc + 1; I.push(a, b, cc, b, d, cc); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const m = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1})); m.receiveShadow = true; scene.add(m);
  }
  hills(Kt, 'hillMid', Z0 + 0.5, -95, (x, z) => S(x, Z0) * (1 - sm((-z + Z0) / 14)) + 9 * sm((-z + Z0) / 30) * (0.55 + 0.45 * Math.sin(x * 0.06 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 2);
  hills(Kt, 'hillFar', -92, -190, (x, z) => 8 + 26 * sm((-z - 92) / 70) * (0.5 + 0.5 * Math.sin(x * 0.04 + 2.5)) + 3 * vnoise(x * 0.06, 3, z * 0.06), 6);
  // камни в срезе
  { const r = rnd(3); for (let i = 0, n = 0; i < 400 && n < 34; i++) { const x = lerp(-58, 58, r()), y = lerp(-30, -1.2, r()), rr = 0.2 + r() * 0.35; if (y > S(x, 0) - rr - 0.3) continue; add(blob(rr, n, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++; } }

  // реки на дне
  for (const g of GORGES) {
    const yb = -g.d + 0.3, wR = W * 0.3 * 2 - 0.4;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(wR, 46), Kt.M('water', {water: 1, opacity: 0.9, smooth: true})); top.geometry.rotateX(-Math.PI / 2); top.position.set(g.x, yb, -23); top.renderOrder = 5; scene.add(top);
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(wR, 0.3), Kt.M('water', {water: 1, opacity: 0.95, smooth: true})); fr.position.set(g.x, yb - 0.15, 0); fr.renderOrder = 5; scene.add(fr);
    const r = rnd(g.x * 3 + 200);
    for (let i = 0; i < 6; i++) add(blob(0.35 + r() * 0.3, i + g.x, 0.25, 1.4, 1.2, 0.7, 1), 'stone', g.x + (r() < 0.5 ? -1 : 1) * (wR / 2 + 0.2), yb + 0.05, -3 - r() * 20, {});
    for (let i = 0; i < 8; i++) { const s = r() < 0.5 ? -1 : 1, u = 0.35 + r() * 0.45, x = g.x + s * u * W, z = -2 - r() * 30; add(blob(0.5 + r() * 0.35, i + 60 + g.x, 0.2, 1.5), i % 2 ? 'leaf' : 'leaf2', x, S(x, z) + 0.2, z, {}); }
  }
  // облака в самом глубоком ущелье
  { const g = GORGES[4], r = rnd(77); for (let i = 0; i < 7; i++) add(blob(1.1 + r() * 0.6, i + 90, 0.18, 1.3, 1.8, 0.7, 1.1), 'cloud', g.x + (r() - 0.5) * 3, -11 + r() * 3, -9 - r() * 14, {cast: false, recv: false}); }

  // дорога по плато от моста к мосту
  { const segs = [[-58, GORGES[0].x - W - 2]]; for (let i = 0; i < 4; i++) segs.push([GORGES[i].x + W + 2, GORGES[i + 1].x - W - 2]); segs.push([GORGES[4].x + W + 2, 58]);
    for (const [a, b] of segs) { box(b - a, 0.16, 2.0, 'deck', (a + b) / 2, 0.06, ZB, {r: 0.02, cast: false}); for (let x = a + 1; x < b - 1; x += 2.2) box(1.0, 0.04, 0.12, 'white', x, 0.16, ZB, {r: 0.01, cast: false}); } }
  // ели и деревья на плато
  { const r = rnd(9); for (let i = 0, n = 0; i < 300 && n < 60; i++) { const x = lerp(-58, 58, r()), z = lerp(-40, -1.2, r()); if (GORGES.some((g) => Math.abs(g.x - x) < W * 0.95) || Math.abs(z - ZB) < 2.4) continue; (n % 3 ? fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.5, false) : tree(x, S(x, z) - 0.05, z, 1.0 + r() * 0.5, 0.6 + r() * 0.3, n + 300)); n++; } }

  // мосты
  const bridges = {};
  for (const g of GORGES) {
    const e = W * 0.98 + 1.2, L = e; // полудлина полотна от центра до края
    const halves = [-1, 1].map((s) => {
      const grp = new THREE.Group(); grp.position.set(g.x + s * (L + 1.2), 0, ZB); scene.add(grp);
      box(L + 1.2, 0.4, 2.1, 'deck', -s * (L + 1.2) / 2, DY - 0.2, 0, {parent: grp, r: 0.03});
      box(L + 1.2, 0.45, 1.5, 'girder', -s * (L + 1.2) / 2, DY - 0.55, 0, {parent: grp, r: 0.03});
      for (let x = 0.6; x < L + 1.2; x += 1.9) box(0.7, 0.04, 0.1, 'white', -s * x, DY + 0.02, 0, {parent: grp, r: 0.01, cast: false});
      return grp;
    });
    const fixed = new THREE.Group(); scene.add(fixed);
    if (g.type === 'susp') {
      const tx = W * 0.98 + 0.2, H = 6.5;
      for (const s of [-1, 1]) {
        for (const dz of [-1.15, 1.15]) cyl(0.2, 0.3, H + 0.6, 'pylon', g.x + s * tx, H / 2 + 0.1, ZB + dz, {parent: fixed, seg: 6});
        box(0.35, 0.4, 2.7, 'pylon', g.x + s * tx, H - 0.2, ZB, {parent: fixed, r: 0.04});
        box(0.35, 0.3, 2.7, 'pylon', g.x + s * tx, H * 0.55, ZB, {parent: fixed, r: 0.04});
      }
      for (const dz of [-1.15, 1.15]) {
        const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24, x = lerp(-tx, tx, u); pts.push([g.x + x, DY + 0.5 + (H - 0.5 - DY) * (x / tx) ** 2, ZB + dz]); }
        tube(pts, 0.09, 'cableC', {parent: fixed, n: 48, rs: 5, cast: false});
        for (const s of [-1, 1]) tube([[g.x + s * tx, H, ZB + dz], [g.x + s * (tx + 3.2), 0.2, ZB + dz]], 0.09, 'cableC', {parent: fixed, n: 4, rs: 5, cast: false, tension: 0});
        for (let x = -tx + 1.0; x < tx - 0.9; x += 1.0) { const yc = DY + 0.5 + (H - 0.5 - DY) * (x / tx) ** 2; if (yc - DY < 0.5) continue; box(0.07, yc - DY, 0.07, 'cableC', g.x + x, DY + (yc - DY) / 2, ZB + dz, {parent: fixed, r: 0, cast: false}); }
      }
    } else {
      const tx = 3.6, H = 9.5;
      for (const s of [-1, 1]) {
        // башня — две стойки, сходящиеся вверху, от дна ущелья
        const base = -g.d * prof(tx / W) + 0.1;
        for (const dz of [-1.3, 1.3]) { const len = H - base, m = cyl(0.22, 0.42, len, 'pylon', g.x + s * tx, base + len / 2, ZB + dz * 0.75, {parent: fixed, seg: 6}); m.rotation.x = -dz * 0.035; }
        box(0.4, 0.4, 2.4, 'pylon', g.x + s * tx, DY - 0.9, ZB, {parent: fixed, r: 0.04});
        for (let k = 1; k <= 6; k++) for (const side of [-1, 1]) for (const dz of [-1.0, 1.0]) {
          const xd = g.x + s * tx + side * k * 0.95, yt = H - 0.4 - k * 0.42;
          tube([[g.x + s * tx, yt, ZB + dz * 0.55], [xd, DY + 0.05, ZB + dz]], 0.05, 'cableC', {parent: fixed, n: 2, rs: 4, cast: false, tension: 0});
        }
      }
    }
    // мерная лента от полотна до воды
    const tg = new THREE.PlaneGeometry(0.22, 1); tg.translate(0, -0.5, 0);
    const tape = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({color: '#ffd23a'})); tape.position.set(g.x + 1.6, DY - 0.8, ZB + 2.2); tape.renderOrder = 6; scene.add(tape);
    const cap = box(0.5, 0.12, 0.12, 'dark', g.x + 1.6, DY - 0.74, ZB + 2.2, {r: 0.02, cast: false});
    bridges[g.key] = {halves, tape, cap, g, L};
  }

  // две «Эйфелевы башни» (по 330 м = 13,2 ед.) в ущелье №1, перед мостом
  const eif = [];
  {
    const H = 330 * K, sh = new THREE.Shape(), hw = (y) => 1.5 * (1 - y / H) ** 2.2 + 0.1;
    const N = 18; sh.moveTo(-hw(0), 0); for (let i = 1; i <= N; i++) { const y = H * i / N; sh.lineTo(-hw(y), y); } for (let i = N; i >= 0; i--) { const y = H * i / N; sh.lineTo(hw(y), y); }
    const arch = new THREE.Path(); arch.moveTo(-0.95, 0.05); arch.absarc(0, 0.25, 0.95, Math.PI, 0, true); arch.lineTo(0.95, 0.05); sh.holes.push(arch);
    const geo = new THREE.ExtrudeGeometry(sh, {depth: 0.35, bevelEnabled: false}); geo.translate(0, 0, -0.175);
    const g1 = GORGES[4];
    for (let k = 0; k < 2; k++) {
      const grp = new THREE.Group(); grp.position.set(g1.x - 0.9, -g1.d + 0.32 + k * H, -1.8); scene.add(grp);
      add(geo, 'eiffel', 0, 0, 0, {parent: grp}); add(geo, 'eiffel', 0, 0, 0, {parent: grp, rot: [0, Math.PI / 2, 0]});
      for (const [y, w] of [[57 * K, 1.25], [115 * K, 0.8], [276 * K, 0.35]]) box(w * 2, 0.22, w * 2, 'eiffel', 0, y, 0, {parent: grp, r: 0.03});
      eif.push(grp);
    }
  }
  // машины на мосту №1
  const cars = []; for (let i = 0; i < 4; i++) { const c = new THREE.Group(); scene.add(c); box(1.0, 0.42, 0.6, ['red', 'white', 'yellowCar', 'blue'][i] || 'red', 0, 0.28, 0, {parent: c, r: 0.08}); box(0.55, 0.3, 0.55, 'glassDark', -0.05, 0.6, 0, {parent: c, r: 0.06}); cars.push(c); }
  const clouds = [cloud(sky, -20, 22, -60, 3.0, 51), cloud(sky, 12, 26, -70, 3.5, 52), cloud(sky, 34, 20, -55, 2.4, 53), cloud(sky, -40, 28, -80, 4.0, 54)];

  // q: b5..b1 — 0..0.5 полотно смыкается, 0.5..1 лента до воды; eif 0..1 — две башни; cars 0/1
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const key in bridges) {
      const B = bridges[key], p = q[key] ?? 0, d = sm(p / 0.5), tp = sm((p - 0.5) / 0.5);
      B.halves.forEach((h) => { h.visible = d > 0.005; h.scale.x = Math.max(0.001, 0.25 + 0.75 * d); });
      if (d < 0.005) B.halves.forEach((h) => { h.visible = true; h.scale.x = 0.25; });
      B.tape.visible = B.cap.visible = tp > 0.005; B.tape.scale.y = Math.max(0.001, (B.g.d + DY - 1.1) * tp);
    }
    const e = q.eif ?? 0; eif.forEach((g, k) => { const u = sm(e * 2 - k); g.visible = u > 0.005; g.scale.set(1, Math.max(0.001, u), 1); });
    const cv = q.cars ?? 0, g1 = GORGES[4];
    cars.forEach((c, i) => { const dir = i % 2 ? -1 : 1, u = ((t * 0.09 + i * 0.27) % 1 + 1) % 1, x = g1.x + dir * lerp(-11, 11, u); c.position.set(x, DY, ZB + dir * 0.5); c.rotation.y = dir > 0 ? 0 : Math.PI; c.visible = cv > 0.5; });
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
