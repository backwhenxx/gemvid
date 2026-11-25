// @ts-nocheck
// Мир «Топ-5 самолётов по размаху крыла» (25.11): аэродром (1 ед. = 10 м), перрон, ВПП, ангары, вышка.
// Самолёты носом к камере, в ряд. Каждое место: самолёт выкатывается на отметку, потом жёлтая лента от законцовки до законцовки.
// Ан-124 (73,3), A380 (79,8), Ан-225 (88,4), Hughes H-4 «Геркулес» (97,5, на воде), Stratolaunch (117).
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const ZP = -7;
export function S(x, z) { const air = sm((Math.abs(z + 14) - 16) / 6); return air * (0.3 * Math.sin(x * 0.12 + z * 0.1) + 0.3 * vnoise(x * 0.1, 1, z * 0.1)) + 1.2 * sm((-z - 34) / 10); }
const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.5, (x) => -1.6 - 0.1 * Math.sin(x * 0.7), (x) => -4.5 + 0.3 * Math.sin(x * 0.3), (x) => -11, () => -30];
const LAYERS = ['concreteA', 'gravel', 'clay', 'sand', 'rock'];
export const PLANES = [
  {key: 'p5', x: -58, span: 7.33, len: 6.9, r: 0.42, high: true, eng: 4, col: 'white', stripe: 'blue', tail: 'blue'},
  {key: 'p4', x: -42, span: 7.98, len: 7.27, r: 0.42, high: false, eng: 4, col: 'white', stripe: 'blue', tail: 'blue', deck2: true},
  {key: 'p3', x: -25, span: 8.84, len: 8.4, r: 0.45, high: true, eng: 6, col: 'white', stripe: 'yellowCar', tail: 'blue', twin: true},
  {key: 'p2', x: -7, span: 9.75, len: 6.68, r: 0.5, high: true, eng: 8, col: 'woodP', stripe: 'woodD', tail: 'woodP', boat: true},
  {key: 'p1', x: 14, span: 11.7, len: 7.3, r: 0.36, high: false, eng: 6, col: 'white', stripe: 'red', tail: 'white', duo: true},
];
const tip = (p) => [p.x + p.span / 2, 0.9, ZP + 0.6];
export const T = Object.assign(Object.fromEntries(PLANES.map((p) => [p.key, [p.x, 0.25, ZP + p.len / 2 + 1.3]])),
  {duo: [14 + 1.8, 1.1, ZP + 2.4], h4: [-7, 1.2, ZP + 2.5], six: [-25 - 2.2, 0.8, ZP + 0.2], deck2: [-42, 1.3, ZP + 3.3], rocket: [14, 0.3, ZP - 0.4], tower: [36, 7, -24]});
const cam = (x, w) => ({pos: [x + 2, w * 1.9 + 3, ZP + w * 1.7 + 6], look: [x, 0, ZP - 0.6], fov: 40});
export const CAMS = {
  hook: {pos: [16, 9, 12], look: [14, 0.6, ZP], fov: 40},
  hook2: {pos: [15.5, 17, 18], look: [14, 0.3, ZP - 0.5], fov: 40},
  p5: cam(-58, 7.3), p4: cam(-42, 8.0), p3: cam(-25, 8.8), p2: cam(-7, 9.75), p1: cam(14, 11.7),
  wide: {pos: [-12, 30, 52], look: [-16, 0, ZP - 4], fov: 40},
  cover: {pos: [15.5, 12, 18], look: [14, 0.6, ZP], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {concreteA: '#b9b4a8', apron: '#a9a69e', runway: '#55575d', woodP: '#b98a5a', woodD: '#7c5737', hangar: '#c3c7cc', hangarR: '#8a929c', towerC: '#d9d4c8', grassA: '#8cb85f', rocketC: '#e8e8e8'});
  const {add, box, cyl, blob, tree, fir, cloud} = K;
  cutFace(K, LAYERS, (k, x) => B[k](x), -80, 60, []);
  // земля: трава вокруг, плоский перрон и ВПП (поверх травы на 0.06 и 0.1)
  { const xs = [], zs = []; for (let x = -80; x <= 60 + 1e-6; x += 1) xs.push(x); for (let z = 0; z >= -48 - 1e-6; z -= 1) zs.push(z);
    const P = [], I = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) P.push(xs[i], S(xs[i], zs[j]), zs[j]);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); const ng = g.toNonIndexed(); ng.computeVertexNormals(); add(ng, 'grassA', 0, 0, 0, {cast: false}); }
  box(140, 0.12, 13.5, 'apron', -10, 0.06, -7.2, {cast: false});
  box(140, 0.1, 6.0, 'runway', -10, 0.06, -19, {cast: false}); for (let x = -78; x < 58; x += 4) box(2.0, 0.02, 0.18, 'white', x, 0.12, -19, {cast: false});
  for (const z of [-16.3, -21.7]) box(140, 0.02, 0.12, 'white', -10, 0.12, z, {cast: false});
  // отметки стоянок
  for (const p of PLANES) { box(0.12, 0.02, 3.0, 'yellowCar', p.x, 0.125, ZP + 2.0, {cast: false}); box(1.8, 0.02, 0.12, 'yellowCar', p.x, 0.125, ZP + 3.5, {cast: false}); }
  // вода у «Геркулеса»
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(13, 11), K.M('water', {water: 1, opacity: 0.92, smooth: true})); m.geometry.rotateX(-Math.PI / 2); m.position.set(-7, 0.16, ZP - 0.5); m.renderOrder = 5; scene.add(m); box(13.6, 0.22, 0.3, 'concreteA', -7, 0.11, ZP + 5.15, {}); box(13.6, 0.22, 0.3, 'concreteA', -7, 0.11, ZP - 6.15, {}); }
  hills(K, 'hillMid', -47.5, -100, (x, z) => S(x, -48) + 6 * sm((-z - 48) / 30) * (0.55 + 0.45 * Math.sin(x * 0.06 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -96, -180, (x, z) => 4 + 16 * sm((-z - 96) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  // ангары, вышка, ветроуказатель, огни
  for (const [x, w] of [[-60, 10], [-36, 12], [-12, 10], [16, 14]]) { const z = -30; box(w, 2.5, 7, 'hangar', x, 1.25, z, {r: 0.05}); const g = new THREE.CylinderGeometry(w / 2, w / 2, 7, 16, 1, false, Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); add(g, 'hangarR', x, 2.5, z, {}); box(w * 0.99, 0.05, 0.05, 'dark', x, 2.5, z + 3.5, {cast: false}); box(w * 0.7, 2.0, 0.08, 'dark', x, 1.0, z + 3.52, {cast: false}); }
  { const x = 36, z = -24; cyl(0.8, 1.0, 6, 'towerC', x, 3, z, {seg: 10}); add(new THREE.CylinderGeometry(1.7, 1.3, 1.4, 10), 'glass', x, 6.7, z, {mat: {emissive: 1, win: 1, ei: 0.6}}); add(new THREE.CylinderGeometry(1.8, 1.8, 0.25, 10), 'dark', x, 7.5, z, {}); }
  { const x = 30, z = -15; cyl(0.04, 0.05, 2.0, 'dark', x, 1.0, z, {seg: 5}); const m = add(new THREE.ConeGeometry(0.25, 1.1, 8, 1, true), 'red', x + 0.55, 1.9, z, {rot: [0, 0, Math.PI / 2]}); }
  for (let x = -78; x < 58; x += 3) for (const z of [-15.7, -22.3]) add(new THREE.SphereGeometry(0.08, 6, 4), 'lamp', x, 0.18, z, {mat: {emissive: 1, ei: 1.3}, cast: false});
  { const r = rnd(9); for (let i = 0, n = 0; i < 300 && n < 30; i++) { const x = lerp(-78, 58, r()), z = lerp(-46, -36, r()); n % 2 ? fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.5, false) : tree(x, S(x, z) - 0.05, z, 0.9 + r() * 0.5, 0.6 + r() * 0.3, n + 300); n++; } }

  // ── самолёты
  const planes = {};
  const mk = (p) => {
    const g = new THREE.Group(); scene.add(g); const inner = new THREE.Group(); g.add(inner);
    const fus = (fx) => {
      const L = p.len, r = p.r, yc = (p.boat ? 0.75 : 0.62);
      const body = add(new THREE.CylinderGeometry(r, r, L * 0.72, 12), p.col, fx, yc, 0, {parent: inner, rot: [Math.PI / 2, 0, 0]}); if (p.deck2) body.scale.set(1, 1, 1.35);
      if (p.boat) { add(new THREE.BoxGeometry(r * 1.7, r * 0.9, L * 0.7), p.stripe, fx, yc - r * 0.6, 0, {parent: inner}); }
      add(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), p.col, fx, yc, L * 0.36, {parent: inner, rot: [Math.PI / 2, 0, 0]}).scale.set(1, 1.5, p.deck2 ? 1.35 : 1);
      add(new THREE.ConeGeometry(r, L * 0.26, 12), p.col, fx, yc + r * 0.25, -L * 0.49, {parent: inner, rot: [-Math.PI / 2, 0, 0]});
      box(0.06, r * 0.5, L * 0.5, p.stripe, fx + r * 0.99, yc, 0.1, {parent: inner, cast: false}); box(0.06, r * 0.5, L * 0.5, p.stripe, fx - r * 0.99, yc, 0.1, {parent: inner, cast: false});
      if (!p.boat) for (const s of [-1, 1]) cyl(0.07, 0.07, 0.5, 'dark', fx + s * r * 0.6, 0.25, -0.3, {parent: inner, seg: 8, rot: [0, 0, Math.PI / 2]});
      cyl(0.06, 0.06, 0.4, 'dark', fx, 0.25, L * 0.3, {parent: inner, seg: 8, rot: [0, 0, Math.PI / 2]});
      // хвост
      const tz = -L * 0.5, fh = r * 2.4;
      if (!p.twin) { const fin = box(0.12, fh, 1.0, p.tail, fx, yc + r + fh / 2 - 0.1, tz + 0.2, {parent: inner, r: 0.03}); fin.rotation.x = -0.35; }
      const st = box(p.span * 0.3, 0.08, 0.7, p.col, fx, yc + (p.twin ? r * 0.8 : r * 0.3), tz + 0.25, {parent: inner, r: 0.02});
      if (p.twin) for (const s of [-1, 1]) { const fin = box(0.1, fh * 0.8, 0.8, p.tail, fx + s * p.span * 0.15, yc + r * 0.8 + fh * 0.4, tz + 0.25, {parent: inner, r: 0.03}); fin.rotation.x = -0.3; }
      return yc;
    };
    let yc = 0;
    if (p.duo) { yc = fus(-1.8); fus(1.8); } else yc = fus(0);
    // крыло: трапеция со стреловидностью
    const wy = p.high ? yc + p.r * 0.85 : yc - p.r * 0.55, half = p.span / 2, c0 = p.duo ? 1.4 : 1.6, c1 = 0.55, sw = p.duo ? 0.1 : 1.3;
    const sh = new THREE.Shape(); sh.moveTo(-half, -sw - c1 / 2); sh.lineTo(0, c0 / 2); sh.lineTo(half, -sw - c1 / 2); sh.lineTo(half, -sw + c1 / 2 - c1); sh.lineTo(0, -c0 / 2); sh.lineTo(-half, -sw - c1 / 2 - c1 + c1); sh.closePath();
    const wg = new THREE.Shape(); wg.moveTo(-half, -sw + c1 / 2); wg.lineTo(0, c0 / 2); wg.lineTo(half, -sw + c1 / 2); wg.lineTo(half, -sw - c1 / 2); wg.lineTo(0, -c0 / 2); wg.lineTo(-half, -sw - c1 / 2); wg.closePath();
    const wgeo = new THREE.ExtrudeGeometry(wg, {depth: 0.12, bevelEnabled: false}); wgeo.rotateX(Math.PI / 2);
    add(wgeo, p.col, 0, wy + 0.06, 0.2, {parent: inner});
    // двигатели
    const n = p.eng, list = []; for (let i = 0; i < n / 2; i++) { const u = (i + 1) / (n / 2 + 0.8); list.push(u, -u); }
    if (p.duo) { list.length = 0; for (const u of [0.0, 0.62, 0.82]) list.push(u === 0 ? 0.02 : u, u === 0 ? -0.02 : -u); }
    list.forEach((u, i) => { const x = p.duo && Math.abs(u) < 0.1 ? (u > 0 ? 0.6 : -0.6) : u * half * 0.85, z = 0.2 + 0.55 - Math.abs(x / half) * sw; cyl(0.18, 0.2, 0.9, 'hangarR', x, wy - 0.25, z, {parent: inner, rot: [Math.PI / 2, 0, 0], seg: 10}); add(new THREE.CircleGeometry(0.16, 10), 'dark', x, wy - 0.25, z + 0.46, {parent: inner, cast: false}); });
    if (p.duo) { // ракета под центроплан
      cyl(0.22, 0.22, 3.2, 'rocketC', 0, wy - 0.5, -0.3, {parent: inner, rot: [Math.PI / 2, 0, 0], seg: 10}); add(new THREE.ConeGeometry(0.22, 0.6, 10), 'rocketC', 0, wy - 0.5, 1.6, {parent: inner, rot: [Math.PI / 2, 0, 0]}); }
    planes[p.key] = {g, p};
  };
  PLANES.forEach(mk);
  // жёлтые ленты размаха на земле перед носом
  const tapes = {};
  for (const p of PLANES) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.22), new THREE.MeshBasicMaterial({color: '#ffd23a'})); m.position.set(p.x, 0.2, ZP + p.len / 2 + 1.3); scene.add(m);
    const caps = [-1, 1].map((s) => { const c = box(0.12, 0.6, 0.12, 'dark', p.x + s * p.span / 2, 0.42, ZP + p.len / 2 + 1.3, {cast: false}); return c; });
    tapes[p.key] = (u) => { m.scale.x = Math.max(0.001, p.span * u); m.visible = u > 0.005; caps.forEach((c) => (c.visible = u > 0.95)); };
  }
  const clouds = [cloud(sky, -30, 22, -60, 3.0, 51), cloud(sky, 0, 25, -70, 3.5, 52), cloud(sky, 26, 20, -55, 2.4, 53), cloud(sky, -60, 26, -80, 4.0, 54)];

  // q: p5..p1 — 0..0.55 выкатывается из-за ангаров на отметку, 0.55..1 лента
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const k in planes) { const {g, p} = planes[k], v = q[k] ?? 0, a = sm(v / 0.55), tp = sm((v - 0.55) / 0.45);
      g.visible = v > 0.002; g.position.set(p.x, p.boat ? -0.05 : 0, lerp(-19, ZP, a)); tapes[k](tp); }
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
