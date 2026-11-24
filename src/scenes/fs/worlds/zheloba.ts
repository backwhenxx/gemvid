// @ts-nocheck
// Мир «Топ-5 самых глубоких мест океана» (24.11): океан в разрезе (1 ед. = 400 м по вертикали, ширина условная).
// Дно на −4 км, пять желобов; слои коры изгибаются вниз в желоб. Вода на срезе — градиент голубой → тёмно-синий.
// Каждое место: с корабля опускается зонд на тросе до дна. Хук: в Марианскую впадину опускается Эверест.
import * as THREE from 'three';
import {makeKit, cutFace, rnd, sm, lerp, hash3, vnoise} from '../kit';

const K = 1 / 400, ZB = -3, FLOOR = -4000 * K;
export const TR = [
  {key: 'l5', x: -40, d: 10047 * K, w: 7.5},   // Кермадек
  {key: 'l4', x: -20, d: 10500 * K, w: 7.5},   // Курило-Камчатский
  {key: 'l3', x: 0, d: 10540 * K, w: 5.0},     // Филиппинский — крутые стены
  {key: 'l2', x: 20, d: 10800 * K, w: 7.5},    // Тонга
  {key: 'l1', x: 40, d: 10935 * K, w: 7.5},    // Марианская
];
const prof = (u) => (u < 0.12 ? 1 : u > 1 ? 0 : (1 - (u - 0.12) / 0.88) ** 1.6);
const zf = (z) => Math.min(1, Math.max(0, (z + 60) / 10));
export function S(x, z) {
  let h = FLOOR + 0.6 * Math.sin(x * 0.13 + z * 0.09) + 0.5 * vnoise(x * 0.1, 1, z * 0.1);
  for (const g of TR) h -= (g.d + FLOOR) * prof(Math.abs(x - g.x) / g.w) * zf(z);
  return h;
}
const OFF = [0, 0.6, 2.5, 7, 40];
const LAYERS = ['sed', 'basalt', 'gabbro', 'mantle'];
const bound = (k, x) => S(x, 0) - OFF[k];
const EV = 8849 * K;
export const T = Object.fromEntries([
  ...TR.map((g) => [g.key, [g.x + 1.6, -g.d + 0.8, -1]]),
  ['ever', [38.6, -g1top(), -3.8]], ['isl', [-24, 1.0, -30]], ['plates', [20, -18, 0.02]], ['wall', [-3.2, -16, -1]], ['press', [41.5, -26.5, -1]],
]);
function g1top() { return 10935 * K - EV + 0.3; }
const cam = (x, d) => ({pos: [x + 4, -d * 0.5 + 3, 66], look: [x, -d * 0.5 - 0.5, ZB], fov: 40});
export const CAMS = {
  hook: {pos: [45, -8, 58], look: [40, -11, ZB], fov: 40},
  hook2: {pos: [44, -10, 64], look: [40, -13.5, ZB], fov: 40},
  l5: cam(-40, 25.1), l4: cam(-20, 26.2), l3: cam(0, 26.4), l2: cam(20, 27), l1: cam(40, 27.3),
  end: {pos: [34, -8, 82], look: [28, -13, ZB], fov: 40},
  cover: {pos: [44, -9, 60], look: [40, -12.5, ZB], fov: 40},
};

export function build(scene, sky) {
  const Kt = makeKit(scene, {sed: '#8b8470', basalt: '#4f5058', gabbro: '#655a64', mantle: '#9a5e3c', seabed: '#6d6a5a', probeY: '#e8b93a', shipH: '#c0543c', everS: '#5a5560', everW: '#f1f4f7', islandC: '#5f6e4c'});
  const {add, box, cyl, blob, cloud} = Kt;
  const X0 = -66, X1 = 66;
  cutFace(Kt, LAYERS, bound, X0, X1, [], 0, 0.5);
  // дно: сетка
  { const xs = [], zs = []; for (let x = X0; x <= X1 + 1e-6; x += 0.5) xs.push(x); for (let z = 0; z >= -70 - 1e-6; z -= z > -8 ? 0.5 : 1.5) zs.push(z);
    const P = [], I = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) P.push(xs[i], S(xs[i], zs[j]), zs[j]);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); const ng = g.toNonIndexed(); ng.computeVertexNormals(); add(ng, 'seabed', 0, 0, 0, {cast: false}); }
  // вода: срез (градиент по глубине) + гладь сверху до горизонта
  { const ct = new THREE.Color('#6fb3dd'), cb = new THREE.Color('#0f2448'), c = new THREE.Color(), P = [], C = [];
    const col = (y) => c.copy(cb).lerp(ct, Math.max(0, Math.min(1, 1 + y / 28)) ** 1.4);
    for (let x = X0; x < X1 - 1e-6; x += 0.5) { const x2 = x + 0.5, b1 = S(x, 0), b2 = S(x2, 0); for (const [xx, yy] of [[x, b1], [x2, b2], [x2, 0], [x, b1], [x2, 0], [x, 0]]) { P.push(xx, yy, 0); col(yy); C.push(c.r, c.g, c.b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0.86, depthWrite: false})); m.renderOrder = 6; scene.add(m);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(260, 220), Kt.M('water', {water: 1, opacity: 0.92, smooth: true})); top.geometry.rotateX(-Math.PI / 2); top.position.set(0, 0, -110.05); top.renderOrder = 5; scene.add(top); }
  { const r = rnd(3); for (let i = 0, n = 0; i < 600 && n < 40; i++) { const x = lerp(X0 + 2, X1 - 2, r()), y = lerp(-40, -6, r()), rr = 0.25 + r() * 0.4; if (y > S(x, 0) - rr - 0.6) continue; add(blob(rr, n, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++; } }
  // Курильские острова: вулканы со дна выше воды (за желобом)
  // (острова убраны — читались как призрачные пирамиды)
  // корабли на поверхности, зонды на тросах
  const ship = (x, z) => { const g = new THREE.Group(); g.position.set(x, 0.12, z); scene.add(g); box(4.0, 0.7, 1.2, 'shipH', 0, 0.2, 0, {parent: g, r: 0.15}); box(1.3, 0.8, 0.9, 'white', -0.8, 0.9, 0, {parent: g, r: 0.06}); box(0.12, 1.6, 0.12, 'dark', 1.2, 1.2, 0, {parent: g}); box(1.4, 0.1, 0.1, 'dark', 1.8, 1.95, 0, {parent: g}); return g; };
  const probes = {};
  for (const g of TR) {
    const sx = g.x + 1.6; ship(sx - 1.0, -1.2);
    const cg = new THREE.PlaneGeometry(0.16, 1); cg.translate(0, -0.5, 0);
    const cable = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({color: '#ffd23a'})); cable.position.set(sx + 1.0, 0.0, -1.2); cable.renderOrder = 4; scene.add(cable);
    const pr = new THREE.Group(); scene.add(pr); add(new THREE.SphereGeometry(0.55, 14, 10), 'probeY', 0, 0, 0, {parent: pr}); add(new THREE.CircleGeometry(0.22, 12), 'glass', 0, 0, 0.56, {parent: pr, cast: false, mat: {emissive: 1, win: 1, ei: 1}}); box(0.9, 0.12, 0.5, 'dark', 0, -0.55, 0, {parent: pr});
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.6, 12, 1, true), new THREE.MeshBasicMaterial({color: '#ffe9a8', transparent: true, opacity: 0.18, depthWrite: false})); lamp.position.set(0, -1.8, 0); lamp.renderOrder = 5; pr.add(lamp);
    probes[g.key] = {g, cable, pr, sx: sx + 1.0};
  }
  // Эверест (8849 м) — падает в Марианскую впадину
  const ever = new THREE.Group(); scene.add(ever);
  { add(new THREE.ConeGeometry(3.2, EV, 7), 'everS', 0, EV / 2, 0, {parent: ever}); add(new THREE.ConeGeometry(1.25, EV * 0.36, 7), 'everW', 0, EV * 0.82, 0, {parent: ever}); }
  // стрелки «плиты сходятся» у Тонги (на срезе)
  const arrM = new THREE.MeshBasicMaterial({color: '#ffd23a', transparent: true, opacity: 0, depthWrite: false});
  const arrows = [];
  { const sh = new THREE.Shape(); sh.moveTo(0, -0.35); sh.lineTo(2.2, -0.35); sh.lineTo(2.2, -0.8); sh.lineTo(3.4, 0); sh.lineTo(2.2, 0.8); sh.lineTo(2.2, 0.35); sh.lineTo(0, 0.35); sh.closePath(); const g = new THREE.ShapeGeometry(sh);
    for (const s of [-1, 1]) { const m = new THREE.Mesh(g, arrM); m.position.set(20 + s * 9.5, -16, 0.06); m.rotation.z = s > 0 ? Math.PI : 0; m.scale.setScalar(1.8); m.renderOrder = 9; scene.add(m); arrows.push({m, s}); } }
  const clouds = [cloud(sky, -24, 16, -60, 3.0, 51), cloud(sky, 10, 18, -70, 3.5, 52), cloud(sky, 36, 15, -55, 2.4, 53), cloud(sky, -48, 20, -80, 4.0, 54)];

  // q: l5..l1 — зонд опускается до дна (0..1); ever 0..1 — Эверест опускается; plates 0..1
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const k in probes) { const P = probes[k], p = sm(q[k] ?? 0), yb = S(P.sx, -1.2) + 1.3, y = lerp(-0.8, yb, p);
      P.pr.position.set(P.sx, y, -1.2); P.pr.visible = (q[k] ?? 0) > 0.002; P.cable.visible = P.pr.visible; P.cable.scale.y = Math.max(0.001, -y - 0.55); }
    const e = sm(q.ever ?? 0), yT = -10935 * K + 0.3; ever.position.set(38.6, lerp(2, yT, e), -3.8); ever.visible = (q.ever ?? 0) > 0.002;
    const pl = sm(q.plates ?? 0); arrM.opacity = 0.85 * pl; arrows.forEach(({m, s}) => { m.position.x = 20 + s * (9.5 - 0.8 * Math.sin(t * 2) * pl); m.visible = pl > 0.01; });
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
