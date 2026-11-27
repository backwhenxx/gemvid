// @ts-nocheck
// Мир «Как устроен лифт» (27.11): кирпичный дом в Нью-Йорке, шахта лифта открыта спереди (разрез z=0).
// Кабина и противовес на тросах через шкив в машинном отделении на крыше, направляющие рельсы,
// ограничитель скорости (колесо наверху + натяжное в приямке, свой трос), клинья-ловители под кабиной, буферы в приямке.
// Вокруг: соседние дома, боковые улицы с жёлтыми такси, бак для воды на крыше, пожарные лестницы, город до горизонта.
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

export const NEAR = 1.2;
export function S(x, z) { return 0; }
const LAYERS = ['soil', 'clay', 'rock', 'deep'];
const BND = [(x) => 0, (x) => -0.6 - 0.1 * Math.sin(x * 0.7), (x) => -2.9 + 0.3 * Math.sin(x * 0.3), (x) => -6.5 + 0.4 * Math.sin(x * 0.2), () => -30];
const FL = 3.2, G0 = 0.4, NF = 9, ROOF = G0 + NF * FL; // 29.2
const XC = -0.55, CW = 1.25, RZ = -1.35, SHV = [0.35, 31.2, RZ], SR = 0.9; // кабина, противовес, шкив
const GX = -1.53, GZ0 = -0.7, GZ1 = -2.1, GY = 31.0, PY = -1.0, GR = 0.7; // ограничитель скорости
const TRAVEL = (NF - 1) * FL; // 25.6
export const cabY = (car, drop = 0) => G0 + TRAVEL * car - drop;
export const T = {
  cabin: [XC, cabY(0.45) + 1.3, -0.4], cw: [CW, 26.6 - TRAVEL * 0.45 + 1.1, -1.1], sheave: [SHV[0], SHV[1] + 0.6, -0.9], motor: [SHV[0] + 1.3, 31.4, -2.3],
  gov: [GX, GY + 0.6, -1.4], rail: [-1.5, cabY(0.3) - 0.6, -1.3], wedge: [-1.5, cabY(0.3) - 0.25, -1.1], buf: [XC - 0.4, -1.0, -1.0], pit: [0, -1.4, -1.3],
  tank: [5, ROOF + 6.2, -7], ropes: [XC, 22, RZ], cwTop: [CW, 27.7, -1.1], otis: [XC, cabY(0.3) + 3.4, RZ],
};
const cl = (x, y, z, d, ox = 2.4, oy = 1.0) => ({pos: [x + ox, y + oy, d], look: [x, y, RZ]});
export const CAMS = {
  hook: {pos: [2.6, 16.4, 8.6], look: [-0.4, 14.6, RZ], fov: 40},
  hook2: {pos: [2.4, 15.0, 9.4], look: [-0.4, 13.2, RZ], fov: 40},
  wide: {pos: [4, 15.5, 50], look: [0.5, 15, RZ], fov: 40},
  mid: {pos: [4.5, 16, 26], look: [0.3, 15, RZ], fov: 40},
  top: {pos: [3.6, 33.4, 9.5], look: [0.4, 30.9, RZ], fov: 40},
  ropes: {pos: [4.6, 27.5, 8.5], look: [0.2, 26.5, RZ], fov: 40},
  gov: {pos: [1.9, 32.6, 4.4], look: [-1.3, 30.8, -1.4], fov: 40},
  govDown: {pos: [1.2, 15.2, 5.2], look: [-1.3, 13.6, -1.2], fov: 40},
  brake: {pos: [0.2, cabY(0.3) - 0.9, 2.4], look: [-1.45, cabY(0.3) - 0.05, -1.3], fov: 40},
  pit: {pos: [3.2, 1.6, 8.5], look: [0, -0.9, RZ], fov: 40},
  otis: {pos: [2.6, cabY(0.3) + 3.4, 9.5], look: [-0.4, cabY(0.3) + 1.8, RZ], fov: 40},
  end: {pos: [7, 18, 56], look: [1, 16, RZ], fov: 40},
  cover: {pos: [3.6, 15.4, 12.5], look: [-0.3, 12.8, RZ], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {soil: '#6e4e3a', clay: '#b9805a', rock: '#7f8597', deep: '#6d6775', pave: '#bdb6aa', asphalt: '#66686e', brickR: '#a65a43', brickB: '#c98e62', brickC: '#d7b48a', trim: '#efe6d6',
    concreteC: '#b9b3a8', shaftC: '#e3dccd', railC: '#4d5560', cabC: '#c79a5c', cabF: '#3c4049', ropeC: '#9aa1aa', doorM: '#b7c0c9', cwC: '#6f7a86', govC: '#3a3d44', govW: '#d06a3a', wedgeC: '#e0a53a', bufC: '#c24a3a',
    motorC: '#5f8a76', sheaveC: '#707a86', ironC: '#2f3238', taxi: '#f2c230', tankW: '#8a5a3a', tankH: '#3a3d44', bldA: '#c9b49a', bldB: '#b8c2cc', bldC: '#d9c7a8', bldD: '#a8735e'});
  const {add, box, cyl, blob, tree, cloud} = K;
  // земля: срез и мостовая
  cutFace(K, LAYERS, (k, x) => BND[k](x), -90, 90, [{x0: -8, x1: 8, y0: -2.6, y1: 0.01}], 0, 0.5);
  for (const [x0, x1, z0] of [[-90, -8, 0], [8, 90, 0], [-8, 8, -14.2]]) { const g = new THREE.PlaneGeometry(x1 - x0, 90 + z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 - 90) / 2); K.add(g, 'pave', 0, 0, 0, {cast: false}); }
  { const r = rnd(3); for (let i = 0; i < 30; i++) { const x = lerp(-80, 80, r()), y = lerp(-7, -1.0, r()), rr = 0.2 + r() * 0.35; if (Math.abs(x) < 9.5) continue; add(blob(rr, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); } }
  // фундамент с приямком
  box(6.3, 2.6, 6, 'concreteC', -4.85, -1.3, -3.0, {r: 0.02}); box(6.2, 2.6, 6, 'concreteC', 4.9, -1.3, -3.0, {r: 0.02});
  box(3.5, 0.8, 6, 'concreteC', 0.05, -2.2, -3.0, {r: 0.02}); box(3.5, 2.6, 3.4, 'concreteC', 0.05, -1.3, -4.4, {r: 0.02});
  // боковые улицы, тротуары
  for (const s of [-1, 1]) { box(4, 0.12, 90, 'asphalt', s * 11, 0.06, -45, {r: 0.02, cast: false}); for (let z = -2; z > -88; z -= 3) box(0.16, 0.03, 1.4, 'white', s * 11, 0.135, z, {cast: false}); }

  // ── главный дом: две кирпичные части + задняя часть, шахта посередине открыта
  const winM = {emissive: 1, win: 1, ei: 0.75};
  const facade = (x0, x1, h, role, seed, fire) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    box(w, h, 14, role, cx, h / 2, -7, {r: 0.04});
    box(w + 0.3, 0.5, 0.5, 'trim', cx, h - 0.1, 0.05, {r: 0.05}); box(w + 0.1, 0.25, 0.35, 'trim', cx, 3.4, 0.05, {r: 0.04});
    const cols = Math.max(1, Math.floor((w - 0.8) / 1.6));
    for (let f = 0; f * FL + G0 + 2.6 < h - 0.6; f++) for (let c = 0; c < cols; c++) {
      const x = x0 + (w - (cols - 1) * 1.6) / 2 + c * 1.6, y = G0 + f * FL + 1.6;
      if (f === 0) { box(1.3, 2.2, 0.3, 'glass', x, G0 + 1.3, 0, {r: 0.02, cast: false, mat: winM}); continue; }
      box(1.15, 1.75, 0.24, 'trim', x, y, 0.0, {r: 0.02, cast: false}); box(0.9, 1.5, 0.3, 'glass', x, y, 0.0, {r: 0.02, cast: false, mat: hash3(seed, f, c) > 0.35 ? winM : {}});
      box(1.3, 0.14, 0.42, 'trim', x, y - 0.95, 0.05, {r: 0.02, cast: false});
    }
    if (fire) for (let f = 1; f * FL + G0 + 2 < h; f++) { // пожарная лестница
      const y = G0 + f * FL; box(w - 1.0, 0.1, 1.1, 'ironC', cx, y, 0.6, {r: 0.01});
      box(w - 1.0, 0.07, 0.07, 'ironC', cx, y + 0.95, 1.12, {r: 0.01}); for (const dx of [-1, 1]) box(0.07, 0.95, 0.07, 'ironC', cx + dx * (w - 1.04) / 2, y + 0.48, 1.12, {r: 0.01});
      if (f > 1) { const L = Math.hypot(FL, w - 2.2), m = box(L, 0.1, 0.5, 'ironC', cx, y - FL / 2, 0.42, {r: 0.01}); m.rotation.z = (f % 2 ? 1 : -1) * Math.atan2(FL, w - 2.2); }
    }
  };
  facade(-8, -1.7, ROOF, 'brickR', 1, false); facade(1.8, 8, ROOF, 'brickR', 2, true);
  box(3.5, ROOF, 11.4, 'brickR', 0.05, ROOF / 2, -8.3, {r: 0.04});
  box(16.6, 0.5, 14.4, 'trim', 0, ROOF + 0.25, -7, {r: 0.04});
  // шахта: облицовка, пороги этажей, двери на задней стене
  for (const x of [-1.66, 1.80]) box(0.12, ROOF + 1.8, 2.5, 'shaftC', x, (ROOF - 1.8) / 2, -1.35, {r: 0.01});
  box(3.7, ROOF + 1.8, 0.15, 'shaftC', 0.05, (ROOF - 1.8) / 2, -2.6, {r: 0.01});
  for (let f = 0; f < NF; f++) { const y = G0 + f * FL; box(1.4, 2.2, 0.12, 'railC', XC, y + 1.1, -2.49, {r: 0.01, cast: false}); box(0.04, 2.1, 0.1, 'ironC', XC, y + 1.1, -2.42, {cast: false}); box(3.3, 0.2, 0.2, 'concreteC', 0.07, y - 0.1, -2.45, {r: 0.01, cast: false}); }
  // рельсы
  for (const x of [-1.5, 0.4, 0.85, 1.65]) box(0.12, ROOF + 0.25, 0.16, 'railC', x, (ROOF - 0.25) / 2, RZ, {r: 0.01});

  // ── машинное отделение на крыше (открыто спереди)
  box(5.2, 0.3, 3.2, 'concreteC', 0.1, ROOF + 0.65, -1.5, {r: 0.02});
  box(5.2, 3.4, 0.25, 'brickC', 0.1, ROOF + 2.5, -3.0, {r: 0.02}); for (const x of [-2.4, 2.6]) box(0.25, 3.4, 3.2, 'brickC', x, ROOF + 2.5, -1.5, {r: 0.02});
  box(5.6, 0.3, 3.5, 'trim', 0.1, ROOF + 4.35, -1.5, {r: 0.03});
  const sheave = new THREE.Group(); sheave.position.set(...SHV); scene.add(sheave);
  cyl(SR, SR, 0.62, 'sheaveC', 0, 0, 0, {parent: sheave, seg: 24, rot: [Math.PI / 2, 0, 0]});
  for (let i = -1; i <= 1; i += 2) cyl(SR + 0.08, SR + 0.08, 0.08, 'sheaveC', 0, 0, i * 0.33, {parent: sheave, seg: 24, rot: [Math.PI / 2, 0, 0]});
  for (let i = 0; i < 4; i++) { const m = box(SR * 1.7, 0.16, 0.12, 'ironC', 0, 0, 0.36, {parent: sheave, r: 0.02, cast: false}); m.rotation.z = i * Math.PI / 4; }
  cyl(0.18, 0.18, 0.9, 'ironC', 0, 0, -0.2, {parent: sheave, seg: 12, rot: [Math.PI / 2, 0, 0]});
  cyl(0.6, 0.6, 1.1, 'motorC', SHV[0] + 1.3, SHV[1] - 0.35, -2.25, {seg: 16, rot: [Math.PI / 2, 0, 0]}); box(1.0, 1.0, 0.9, 'motorC', SHV[0], SHV[1] - 0.5, -2.35, {r: 0.06});
  box(1.6, 0.4, 1.0, 'motorC', SHV[0] + 1.3, ROOF + 1.0, -2.25, {r: 0.05}); box(0.7, 1.6, 0.4, 'cabF', -0.6, ROOF + 1.6, -2.6, {r: 0.04});
  // бак для воды на крыше (Нью-Йорк)
  const waterTank = (x, y, z, s) => { for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.16 * s, 2.0 * s, 0.16 * s, 'ironC', x + dx * 1.0 * s, y + 1.0 * s, z + dz * 1.0 * s, {r: 0.01});
    box(2.6 * s, 0.14 * s, 2.6 * s, 'ironC', x, y + 2.05 * s, z, {r: 0.01}); cyl(1.4 * s, 1.45 * s, 3.0 * s, 'tankW', x, y + 3.6 * s, z, {seg: 14});
    for (let k = 0; k < 4; k++) cyl(1.47 * s, 1.47 * s, 0.08 * s, 'tankH', x, y + (2.4 + k * 0.8) * s, z, {seg: 14, cast: false});
    add(new THREE.ConeGeometry(1.6 * s, 1.2 * s, 14), 'tankW', x, y + 5.7 * s, z, {}); };
  waterTank(5, ROOF + 0.5, -7, 1);

  // ── соседи и город до горизонта
  const blk = (x, z, w, d, h, role, seed) => { box(w, h, d, role, x, h / 2, z, {r: 0.05}); box(w + 0.3, 0.35, d + 0.3, 'trim', x, h + 0.1, z, {r: 0.04});
    const fl = Math.floor((h - 1.2) / FL), cols = Math.max(1, Math.floor((w - 0.6) / 1.6));
    for (let f = 0; f < fl; f++) for (let c = 0; c < cols; c++) if (hash3(seed, f, c) > 0.15) box(0.95, 1.5, 0.3, 'glass', x - (cols - 1) * 0.8 + c * 1.6, 1.8 + f * FL, z + d / 2, {r: 0.02, cast: false, mat: hash3(seed, c, f) > 0.4 ? winM : {}}); };
  blk(-21.5, -7, 15, 14, 22.6, 'bldD', 11); blk(21.5, -7, 15, 14, 19.4, 'brickB', 12);
  waterTank(-18, 22.8, -8, 0.85); waterTank(24, 19.6, -9, 0.8);
  blk(-38, -7, 16, 14, 35, 'bldB', 13); blk(38, -7, 16, 14, 28, 'bldC', 14);
  { const r = rnd(21); let n = 0; for (let i = 0; i < 900 && n < 70; i++) {
    const x = lerp(-110, 110, r()), z = lerp(-24, -110, r()), w = 9 + r() * 8, d = 9 + r() * 6, h = 18 + r() * (z < -60 ? 90 : 45);
    if (Math.abs(Math.abs(x) - 11) < 2.2 + w / 2) continue;
    blk(x, z, w, d, h, ['bldA', 'bldB', 'bldC', 'bldD', 'brickB'][n % 5], 40 + n); if (h < 40 && r() > 0.5) waterTank(x + w * 0.2, h + 0.2, z, 0.8); n++; } }
  hills(K, 'hillFar', -110, -200, (x, z) => 2 + 10 * sm((-z - 110) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  // такси и деревья на боковых улицах
  const car = (x, z, role, ry) => { const c = new THREE.Group(); c.position.set(x, 0.12, z); c.rotation.y = ry; scene.add(c); box(2.0, 0.6, 1.0, role, 0, 0.45, 0, {parent: c, r: 0.12}); box(1.1, 0.45, 0.92, 'glassDark', -0.1, 0.95, 0, {parent: c, r: 0.08}); if (role === 'taxi') box(0.4, 0.15, 0.2, 'white', -0.1, 1.25, 0, {parent: c, r: 0.04}); for (const dx of [-0.65, 0.65]) for (const dz of [-0.5, 0.5]) cyl(0.25, 0.25, 0.16, 'dark', dx, 0.25, dz, {parent: c, rot: [Math.PI / 2, 0, 0], seg: 10}); };
  car(9.7, -4.5, 'taxi', Math.PI / 2); car(9.7, -10, 'taxi', Math.PI / 2); car(12.3, -7.5, 'blue', -Math.PI / 2); car(-9.7, -6, 'taxi', Math.PI / 2); car(-12.3, -13, 'red', -Math.PI / 2); car(-9.7, -18, 'taxi', Math.PI / 2);
  for (const [x, z, s] of [[8.6, -3.2, 21], [-8.6, -3.4, 22], [8.6, -15, 23], [-8.6, -12, 24], [13.6, -3.4, 25], [-13.6, -4, 26]]) tree(x, 0, z, 1.6, 0.5, s);
  for (const x of [-8.8, 8.8]) { cyl(0.07, 0.09, 4.2, 'ironC', x, 2.1, -1.0, {seg: 6}); box(0.5, 0.25, 0.3, 'ironC', x, 4.3, -1.0, {r: 0.03}); }

  // ── кабина (группа) и противовес
  const cab = new THREE.Group(); scene.add(cab);
  box(1.7, 2.5, 1.9, 'cabC', XC, 1.25, RZ, {parent: cab, r: 0.05});
  box(1.42, 2.2, 0.06, 'cabF', XC, 1.15, RZ + 0.96, {parent: cab, r: 0.01, cast: false}); for (const s of [-1, 1]) box(0.66, 2.08, 0.1, 'doorM', XC + s * 0.35, 1.12, RZ + 0.98, {parent: cab, r: 0.015, cast: false});
  box(1.0, 0.1, 0.08, 'glass', XC, 2.33, RZ + 0.98, {parent: cab, r: 0.01, cast: false, mat: winM});
  box(1.7, 0.18, 0.5, 'cabF', XC, 2.62, RZ, {parent: cab, r: 0.03}); box(1.7, 0.24, 0.3, 'cabF', XC, -0.12, RZ - 0.3, {parent: cab, r: 0.03});
  box(0.16, 0.12, 0.1, 'cabF', -1.48, 2.4, GZ0, {parent: cab, r: 0.01}); box(0.06, 0.2, 0.08, 'govW', GX, 2.4, GZ0, {parent: cab, r: 0.01});
  for (const rx of [-1.5, 0.4]) box(0.3, 0.5, 0.06, 'cabF', rx, -0.12, RZ - 0.36, {parent: cab, r: 0.01});
  const wedges = []; for (const rx of [-1.5, 0.4]) for (const s of [-1, 1]) wedges.push({m: box(0.22, 0.5, 0.16, 'wedgeC', rx, -0.12, RZ + s * 0.22, {parent: cab, r: 0.01, cast: false}), s});
  const cwG = new THREE.Group(); scene.add(cwG);
  box(0.62, 2.2, 0.5, 'cwC', CW, 1.1, RZ, {parent: cwG, r: 0.03}); for (let k = 1; k < 7; k++) box(0.64, 0.04, 0.52, 'ironC', CW, k * 0.31, RZ, {parent: cwG, cast: false});
  box(0.86, 0.14, 0.3, 'cabF', CW, 2.25, RZ, {parent: cwG, r: 0.02});
  // тросы: 4 шт., раздвинуты по z
  const RZS = [-0.21, -0.07, 0.07, 0.21];
  const unit = new THREE.CylinderGeometry(0.04, 0.04, 1, 6); unit.translate(0, 0.5, 0);
  const rope = (x, z, role) => { const m = new THREE.Mesh(unit, K.M(role)); m.position.set(x, 0, z); scene.add(m); return m; };
  const rC = RZS.map((dz) => rope(XC, RZ + dz, 'ropeC')), rCu = RZS.map((dz) => rope(XC, RZ + dz, 'ropeC')), rW = RZS.map((dz) => rope(CW, RZ + dz, 'ropeC'));
  const rG = rope(GX, GZ0, 'govC'), rGb = rope(GX, GZ1, 'govC'); 
  const govWheel = (y) => { const g = new THREE.Group(); g.position.set(GX, y, (GZ0 + GZ1) / 2); scene.add(g); cyl(GR, GR, 0.1, 'govC', 0, 0, 0, {parent: g, seg: 20, rot: [0, 0, Math.PI / 2]});
    for (let i = 0; i < 3; i++) { const m = box(0.18, GR * 1.8, 0.08, 'govW', 0.1, 0, 0, {parent: g, r: 0.01, cast: false}); m.rotation.x = i * Math.PI / 3; } return g; };
  const gW = govWheel(GY), pW = govWheel(PY);
  box(0.3, 0.9, 0.3, 'ironC', GX, GY - 0.75, (GZ0 + GZ1) / 2 - 0.9, {r: 0.02});
  // буферы в приямке
  const bufs = []; for (const [x, s] of [[XC - 0.4, 1], [XC + 0.4, 1], [CW, 0.8]]) { cyl(0.2, 0.24, 0.12, 'ironC', x, -1.74, RZ, {seg: 10}); for (let k = 0; k < 6; k++) bufs.push(add(new THREE.TorusGeometry(0.17 * s, 0.045, 6, 12), 'bufC', x, -1.58 + k * 0.13, RZ, {rot: [Math.PI / 2, 0, 0], cast: false})); box(0.4 * s, 0.08, 0.4 * s, 'ironC', x, -0.86, RZ, {r: 0.02}); }

  const clouds = [cloud(sky, -30, 60, -90, 4.5, 51), cloud(sky, 20, 66, -100, 5, 52), cloud(sky, 50, 56, -80, 3.5, 53), cloud(sky, -60, 64, -110, 5, 54)];
  const ropeM = K.M('ropeC'), govM = K.M('govC'), cwM = K.M('cwC'), bufM = K.M('bufC'), wedM = K.M('wedgeC');
  const base = {r: ropeM.color.clone(), g: govM.color.clone(), w: cwM.color.clone(), b: bufM.color.clone(), e: wedM.color.clone()};
  const Y = new THREE.Color('#ffd23a'), O = new THREE.Color('#ff7a2a');
  const seg = (m, y0, y1) => { m.position.y = y0; m.scale.y = Math.max(0.001, y1 - y0); m.visible = y1 - y0 > 0.01; };

  // q: car 0..1 (этаж), drop (м вниз после обрыва), cut 0/1, snapAt (высота верха кабины в момент обрыва), clamp 0..1,
  //    hlR/hlG/hlW/hlB/hlE 0..1 — жёлтая подсветка тросов/ограничителя/противовеса/буферов/клиньев
  const animate = (q) => {
    const t = q.t, car = q.car ?? 0.45, drop = q.drop ?? 0, cut = (q.cut ?? 0) > 0.5, cpl = sm(q.clamp ?? 0);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    const yc = cabY(car, drop); cab.position.y = yc;
    const top = yc + 2.7, yw = 26.6 - TRAVEL * car; cwG.position.y = yw;
    if (!cut) { rC.forEach((m) => seg(m, top, SHV[1])); rCu.forEach((m) => (m.visible = false)); }
    else { const sa = q.snapAt ?? top + drop; rC.forEach((m, i) => seg(m, top, Math.min(SHV[1], top + 1.2 + 0.3 * i))); rCu.forEach((m, i) => seg(m, sa + 2.2 + 0.4 * i, SHV[1])); }
    rW.forEach((m) => seg(m, yw + 2.3, SHV[1]));
    sheave.rotation.z = -(cabY(car)) / SR;
    seg(rG, PY, GY); seg(rGb, PY, GY);
    const ga = -yc / GR + (q.gspin ?? 0) * t * 6; gW.rotation.x = ga; pW.rotation.x = ga;
    wedges.forEach(({m, s}) => (m.position.z = RZ + s * lerp(0.24, 0.16, cpl)));
    ropeM.color.copy(base.r).lerp(Y, sm(q.hlR ?? 0)); govM.color.copy(base.g).lerp(Y, sm(q.hlG ?? 0)); cwM.color.copy(base.w).lerp(Y, sm(q.hlW ?? 0));
    bufM.color.copy(base.b).lerp(Y, sm(q.hlB ?? 0)); wedM.color.copy(base.e).lerp(O, sm(q.hlE ?? 0) * 0.7);
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
