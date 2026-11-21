// @ts-nocheck
// Мир «Топ-5 самых глубоких озёр» (21.11): плато со срезом спереди, пять озёрных котловин в ряд (глубина 1:50 — 1 ед. = 50 м,
// ширина условная). Каждое место: котловина наполняется водой (на срезе — синий градиент), потом мерная лента до дна.
// Вьедма — с ледником, Восток — под ледяным щитом, Каспий — вышка и лодка, Танганьика — пальмы и лодки, Байкал — две Бурдж-Халифы.
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const K = 1 / 50, W = 8, ZB = -3, WL = -0.4;
export const LAKES = [
  {key: 'l5', x: -40, d: 900 * K, top: '#7fc0de', bot: '#2a5a86'},             // Вьедма
  {key: 'l4', x: -20, d: 900 * K, top: '#5f8fb0', bot: '#1c3550', ice: true},  // Восток
  {key: 'l3', x: 0, d: 1025 * K, top: '#6db7ae', bot: '#24525a'},              // Каспий
  {key: 'l2', x: 20, d: 1470 * K, top: '#62aed6', bot: '#1d3f6e'},             // Танганьика
  {key: 'l1', x: 40, d: 1642 * K, top: '#5aa6d6', bot: '#152f5c'},             // Байкал
];
const prof = (u) => (u < 0.3 ? 1 : u > 1 ? 0 : 1 - ((u - 0.3) / 0.7) ** 2);
const zf = (z) => Math.min(1, Math.max(0, (z + 42) / 5));
export function S(x, z) {
  let h = (0.25 * Math.sin(x * 0.19 + z * 0.15) + 0.25 * vnoise(x * 0.13, 1, z * 0.13)) * sm(-z / 1.5);
  for (const g of LAKES) { const p = prof(Math.abs(x - g.x) / W); h = h * (1 - p) - g.d * p * zf(z) + (0.6) * p * (1 - zf(z)); }
  return h;
}
const LV = [null, -0.35, -1.6, -6, -14, -24, -50];
const LAYERS = ['grass', 'soil', 'sandst', 'lime', 'rock', 'deep'];
const COL = {grass: '#86b85a', soil: '#7d5a44', sandst: '#c79a6a', lime: '#cdbf9c', rock: '#9b8e84', deep: '#77707c'};
const bound = (k, x) => (k === 0 ? S(x, 0) : Math.min(S(x, 0), LV[k]));
const BH = 828 * K; // Бурдж-Халифа
export const T = Object.fromEntries([
  ...LAKES.map((g) => [g.key, [g.x + W * 0.25, -g.d + 1.2, -1.2]]),
  ...LAKES.map((g) => ['s' + g.key.slice(1), [g.x - 3, WL + 0.2, -1]]),
  ['glacier', [-40 + 2, 2.2, -22]], ['ice', [-20, 4, -1]], ['rig', [3.5, 3.2, -6]], ['burj', [39.2, -12, -3]], ['boat', [44, 0.4, -5]],
]);
const cam = (x, d) => ({pos: [x + 5, -d * 0.45 + 5, 70], look: [x, -d * 0.45 - 1, ZB], fov: 40});
export const CAMS = {
  hook: {pos: [46, -9, 60], look: [40, -13, ZB], fov: 40},
  hook2: {pos: [45, -6, 70], look: [40, -12.5, ZB], fov: 40},
  l5: cam(-40, 18), l4: cam(-20, 18), l3: cam(0, 20.5), l2: cam(20, 29.4), l1: cam(40, 32.8),
  top1: {pos: [44, 2, 82], look: [32, -12, ZB], fov: 40},
  cover: {pos: [47, -4, 60], look: [40, -9, ZB], fov: 40},
};

export function build(scene, sky) {
  const Kt = makeKit(scene, {...COL, leaf: '#4f9c4e', leaf2: '#86c25c', burj: '#b9c3cc', glacier: '#d8eef7', boatC: '#c0543c', rigC: '#8a8f99'});
  const {add, box, cyl, blob, tree, fir, cloud} = Kt;
  const X0 = -64, X1 = 64, Z0 = -46, DX = 0.5;
  cutFace(Kt, LAYERS, bound, X0, X1, [], 0, DX);
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
  hills(Kt, 'hillMid', Z0 + 0.5, -95, (x, z) => S(x, Z0) * (1 - sm((-z + Z0) / 10)) + 10 * sm((-z + Z0) / 30) * (0.55 + 0.45 * Math.sin(x * 0.06 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 2);
  hills(Kt, 'hillFar', -92, -190, (x, z) => 8 + 28 * sm((-z - 92) / 70) * (0.5 + 0.5 * Math.sin(x * 0.04 + 2.5)) + 3 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0, n = 0; i < 500 && n < 40; i++) { const x = lerp(-62, 62, r()), y = lerp(-34, -1.2, r()), rr = 0.2 + r() * 0.35; if (y > S(x, 0) - rr - 0.3) continue; add(blob(rr, n, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++; } }

  // вода: срез (многоугольник по профилю котловины с градиентом) + гладь сверху; пересчёт при смене уровня
  const lakes = {};
  for (const g of LAKES) {
    const ct = new THREE.Color(g.top), cb = new THREE.Color(g.bot);
    const front = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false}));
    front.position.z = 0.0; front.renderOrder = 6; scene.add(front);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), Kt.M('water', {water: 1, opacity: 0.9, smooth: true})); top.geometry.rotateX(-Math.PI / 2); top.renderOrder = 5; scene.add(top);
    let last = -1;
    const setLevel = (y) => {
      if (Math.abs(y - last) < 1e-4) return; last = y;
      const P = [], C = [], c = new THREE.Color();
      const xs = []; for (let x = g.x - W - 0.5; x <= g.x + W + 0.5; x += 0.25) xs.push(x);
      for (let i = 0; i < xs.length - 1; i++) {
        const x1 = xs[i], x2 = xs[i + 1], b1 = S(x1, 0), b2 = S(x2, 0);
        if (b1 >= y && b2 >= y) continue;
        const qb1 = Math.min(b1, y), qb2 = Math.min(b2, y);
        const col = (yy) => c.copy(cb).lerp(ct, Math.max(0, Math.min(1, (yy + g.d) / g.d)));
        for (const [xx, yy] of [[x1, qb1], [x2, qb2], [x2, y], [x1, qb1], [x2, y], [x1, y]]) { P.push(xx, yy, 0); col(yy); C.push(c.r, c.g, c.b); }
      }
      front.geometry.dispose(); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); front.geometry = geo;
      let xa = g.x, xb = g.x; while (S(xa - 0.1, 0) < y && xa > g.x - W - 1) xa -= 0.1; while (S(xb + 0.1, 0) < y && xb < g.x + W + 1) xb += 0.1;
      top.scale.set(Math.max(0.01, xb - xa + 0.6), 1, 42); top.position.set((xa + xb) / 2, y, -21.05);
    };
    // мерная лента
    const tg = new THREE.PlaneGeometry(0.24, 1); tg.translate(0, -0.5, 0);
    const tape = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({color: '#ffd23a'})); tape.position.set(g.x + W * 0.25, WL - 0.05, -1.2); tape.renderOrder = 7; scene.add(tape);
    lakes[g.key] = {g, front, top, setLevel, tape};
  }

  // Вьедма: ледник сползает в озеро сзади
  { const g = LAKES[0]; add(new THREE.BoxGeometry(9, 1.6, 18), 'glacier', g.x, 2.2, -27, {rot: [0.3, 0, 0]}); for (let i = 0; i < 5; i++) add(blob(0.6 + hash3(i, 1, 1) * 0.4, i + 5, 0.2, 1.3, 1.2, 0.8, 1.2), 'glacier', g.x - 3 + i * 1.5, WL + 0.15, -15 + hash3(i, 2, 1) * 3, {}); }
  // Восток: ледяной щит над озером (не в масштабе)
  const iceSheet = new THREE.Group(); scene.add(iceSheet);
  { const g = LAKES[1]; box(2 * W + 5, 6.5, 42, 'ice', g.x, 3.15, -21.04, {parent: iceSheet, r: 0.3}); box(2 * W + 5.4, 0.5, 42.4, 'snow', g.x, 6.4, -21.04, {parent: iceSheet, r: 0.25}); for (let i = 0; i < 3; i++) box(2 * W + 5.05, 0.08, 0.1, 'white', g.x, 1.5 + i * 2, 0.02, {parent: iceSheet, cast: false}); }
  // Каспий: вышка и лодка
  { const x = 3.5, z = -6; for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) cyl(0.12, 0.12, 4.5, 'rigC', x + dx, 0.0, z + dz, {seg: 6}); box(2.6, 0.3, 2.6, 'rigC', x, 2.3, z, {r: 0.04}); box(1.0, 1.2, 1.0, 'red', x - 0.4, 3.0, z, {r: 0.04}); cyl(0.05, 0.25, 2.6, 'rigC', x + 0.6, 3.7, z, {seg: 5}); }
  const boat = (x, z, rot) => { const g = new THREE.Group(); g.position.set(x, WL + 0.18, z); g.rotation.y = rot; scene.add(g); box(1.8, 0.3, 0.6, 'boatC', 0, 0, 0, {parent: g, r: 0.1}); box(0.6, 0.35, 0.45, 'white', -0.2, 0.3, 0, {parent: g, r: 0.05}); return g; };
  const boats = [boat(-2.5, -12, 0.4), boat(17, -9, -0.3), boat(44, -6, 0.2), boat(37, -15, 2.6)];
  // Танганьика — деревья по берегам; Байкал — ели
  { const r = rnd(9); for (let i = 0, n = 0; i < 400 && n < 60; i++) { const x = lerp(-62, 62, r()), z = lerp(-40, -1.5, r()); if (LAKES.some((g) => Math.abs(g.x - x) < W + 0.8)) continue; if (Math.abs(x + 20) < W + 4) continue; const near = LAKES.reduce((a, g) => (Math.abs(g.x - x) < Math.abs(a.x - x) ? g : a)); (near.key === 'l1' || near.key === 'l5' ? fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.5, false) : tree(x, S(x, z) - 0.05, z, 0.9 + r() * 0.5, 0.6 + r() * 0.3, n + 300)); n++; } }
  // две Бурдж-Халифы в Байкале
  const burj = [];
  { const g = LAKES[4];
    for (let k = 0; k < 2; k++) {
      const grp = new THREE.Group(); grp.position.set(g.x - 0.8, -g.d + 0.05 + k * BH, -3.2); scene.add(grp);
      const secs = [[0, 0.3, 1.6], [0.3, 0.52, 1.25], [0.52, 0.7, 0.95], [0.7, 0.82, 0.7], [0.82, 0.9, 0.45]];
      for (const [a, b, w] of secs) box(w, (b - a) * BH, w, 'burj', 0, (a + b) / 2 * BH, 0, {parent: grp, r: 0.05});
      cyl(0.04, 0.16, 0.1 * BH, 'burj', 0, 0.95 * BH, 0, {parent: grp, seg: 6});
      burj.push(grp);
    } }
  const clouds = [cloud(sky, -24, 24, -60, 3.0, 51), cloud(sky, 10, 28, -70, 3.5, 52), cloud(sky, 36, 22, -55, 2.4, 53), cloud(sky, -48, 30, -80, 4.0, 54)];

  // q: l5..l1 — 0..0.6 наполнение котловины, 0.6..1 лента до дна; burj 0..1
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const key in lakes) {
      const L = lakes[key], p = q[key] ?? 0, f = sm(p / 0.6), tp = sm((p - 0.6) / 0.4);
      const y = lerp(-L.g.d + 0.15, WL, f); L.setLevel(y); L.front.visible = L.top.visible = f > 0.003;
      L.tape.visible = tp > 0.005; L.tape.scale.y = Math.max(0.001, (L.g.d + WL - 0.3) * tp);
    }
    boats.forEach((b, i) => { b.position.y = WL + 0.18 + 0.05 * Math.sin(t * 1.4 + i); const key = ['l3', 'l2', 'l1', 'l1'][i]; b.visible = (q[key] ?? 0) > 0.55; });
    const e = q.burj ?? 0; burj.forEach((g, k) => { const u = sm(e * 2 - k); g.visible = u > 0.005; g.scale.set(1, Math.max(0.001, u), 1); });
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
