// @ts-nocheck
// Мир «Водонапорная башня» (27.11): слева насосная со скважиной, в центре башня в разрезе (кирпичный ствол, стальной бак с водой),
// справа посёлок → пятиэтажка → кирпичные дома Нью-Йорка с деревянными баками на крышах. Под землёй в срезе — трубы с «бусинами» воды.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, house, fence, rnd, sm, lerp, vnoise} from '../kit';

export function S(x, z) {
  return 0.9 * sm((-z - 14) / 10) * (0.6 + 0.4 * Math.sin(x * 0.11)) + 0.04 * Math.sin(x * 0.9 + z * 0.6) * sm((-z - 1) / 3);
}
const BOT = -9;
const B = [
  (x) => S(x, 0),
  (x) => S(x, 0) - 0.3,
  (x) => -1.1 - 0.12 * Math.sin(x * 0.3),
  (x) => -3.4 + 0.3 * Math.sin(x * 0.17 + 1),
  (x) => -5.0 + 0.25 * Math.sin(x * 0.21 + 2),
  (x) => -7.4 + 0.2 * Math.sin(x * 0.13),
  () => BOT,
];
const LAYERS = ['grass', 'soil', 'sand', 'clay', 'aquifer', 'rock'];
const TX = -8, SR = 1.6, SH = 24.5, TR = 4.2, TB = 26, TT = 32; // башня: ось, радиус ствола, верх ствола, бак
const PX = -20; // насосная
const NY = {x0: 19, x1: 28, z0: -12, z1: -4, fl: 12}; // кирпичный дом Нью-Йорка (12 этажей по 3 м)
const RT = {x: 23.6, y: 38.6, z: -7, r: 2, h: 3.8}; // деревянный бак на крыше

export const T = {
  tank: [TX + 2.4, 29, 0.1], water: [TX - 1.5, 28, 0.1], shaft: [TX + SR, 12, 0], pump: [PX + 0.4, -1.8, 0.45], well: [PX, -6.2, 0.3],
  pipeIn: [TX - 0.6, 8, 0.3], pipeOut: [TX + 0.6, 8, 0.3], main: [6, -2.4, 0.3], house: [1, 3.2, -4.4], tap: [-1.0, 1.0, -2.0],
  r10: [-14, 10, 0], r20: [-14, 20, 0], r30: [-14, 30, 0], panel: [11, 13.5, -3], ny: [NY.x0 + 1, 33, NY.z1], nyTop: [NY.x0 + 2, 34.5, NY.z1],
  roofTank: [RT.x - 1.2, RT.y + 2.6, RT.z + RT.r], nyPump: [21.4, 0.9, -3.3], riser: [21.6, 20, -3.3], line: [15, 31, -2], six: [17.5, 18, -2.2],
};
export const CAMS = {
  hook: {pos: [-3.5, 26.5, 29], look: [-8, 25.5, 0], fov: 40},
  tower: {pos: [-6, 13, 58], look: [-8, 13.5, 0], fov: 40},
  tank: {pos: [-3.5, 28.5, 26], look: [-8, 27.5, 0], fov: 40},
  pump: {pos: [-16.5, 0.6, 15], look: [-19, -2.2, 0], fov: 40},
  under: {pos: [2, 0.4, 17], look: [0, -1.2, -1], fov: 40},
  houses: {pos: [7, 5, 30], look: [4, 3, -3], fov: 40},
  ruler: {pos: [-9, 15, 54], look: [-11, 15.5, 0], fov: 40},
  line: {pos: [10, 22, 76], look: [10, 22, -4], fov: 40},
  ny: {pos: [30, 18, 44], look: [23, 20, -4], fov: 40},
  roof: {pos: [29, 41.5, 12], look: [23.6, 39.6, -7], fov: 40},
  final: {pos: [2, 20, 86], look: [6, 17, -5], fov: 40},
  cover: {pos: [-3.5, 27, 26], look: [-8, 26, 0], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {grass: '#93c160', soil: '#7d5a44', sand: '#f0d496', clay: '#c9825a', aquifer: '#8fcbe0', rock: '#8a8fa6',
    tank: '#6fa9b4', tankIn: '#a9c9cc', drop: '#3f95dd', lvl: '#f2c230', panel: '#efe2c8', nybrick: '#a8553f', cedar: '#b9875a', iron: '#4f565e', pumpB: '#3d77c9', tap: '#3f8a5a', asphalt: '#5d6170'});
  const {add, box, cyl, blob, pipe, tree, fir, cloud} = K;
  const X0 = -60, X1 = 60, Z0 = -40;
  cutFace(K, LAYERS, (k, x) => B[k](x), X0, X1, []);
  ground(K, S, 'grass', X0, X1, Z0);
  hills(K, 'hillMid', -39.5, -75, (x, z) => S(x, -40) - 0.3 + 7 * sm((-z - 40) / 26) * (0.55 + 0.45 * Math.sin(x * 0.06 + 0.8)) + 0.8 * vnoise(x * 0.15, 0, z * 0.15), 3);
  hills(K, 'hillFar', -72, -170, (x, z) => 4 + 16 * sm((-z - 72) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 1.6 * vnoise(x * 0.08, 3, z * 0.08), 5);
  // камни в глине и скале
  { const r = rnd(7);
    for (let i = 0, n = 0; i < 500 && n < 30; i++) { const x = lerp(-30, 40, r()), y = lerp(-4.7, -3.6, r()), rr = 0.15 + r() * 0.2; if (Math.abs(x - PX) < 1 || y > B[3](x) - rr || y < B[4](x) + rr) continue; add(blob(rr, n * 3 + 1, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0, {cast: false, rot: [0, 0, r() * 3]}); n++; }
    for (let i = 0, n = 0; i < 300 && n < 22; i++) { const x = lerp(-30, 40, r()), y = lerp(-8.6, -7.8, r()), rr = 0.3 + r() * 0.4; add(blob(rr, n * 2 + 90, 0.3, 1.2, 1.5, 0.7, 0.4), 'deep', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++; }
    for (let i = 0, n = 0; i < 900 && n < 60; i++) { const x = lerp(-30, 40, r()), y = lerp(-7.1, -5.3, r()), rr = 0.06 + r() * 0.07; if (Math.abs(x - PX) < 0.6) continue; add(blob(rr, n * 1.7 + 40, 0.2, 1.2, 1.2, 0.85, 0.5, 0), 'pebble', x, y, 0, {cast: false}); n++; } }

  // ── трубы: скважина → насос → башня (вход), башня (выход) → магистраль → дома
  const pIn = pipe([[PX, -6.9, 0], [PX, -1.8, 0], [TX - 0.6, -1.8, 0], [TX - 0.6, TB + 0.35, 0]], 0.26, 'metal', {bend: 0.6});
  const pOut = pipe([[TX + 0.6, TB + 0.35, 0], [TX + 0.6, -2.4, 0], [42, -2.4, 0]], 0.3, 'metal', {bend: 0.6});
  const branches = [-1.0, 11, 21.6].map((x) => pipe([[x, -2.4, 0], [x, -0.35, 0]], 0.18, 'metal', {}));
  cyl(0.36, 0.36, 1.2, 'iron', PX, -6.6, 0, {seg: 10}); // фильтр скважины
  for (let i = 0; i < 5; i++) box(0.8, 0.06, 0.1, 'deep', PX, -7.1 + i * 0.2, 0.35, {r: 0.01, cast: false});
  // насос в срезе: корпус, мотор, крыльчатка
  box(1.5, 1.0, 0.9, 'pumpB', PX + 0.9, -1.8, 0, {r: 0.08}); cyl(0.38, 0.38, 1.0, 'iron', PX + 2.2, -1.8, 0, {rot: [0, 0, Math.PI / 2], seg: 12});
  const imp = new THREE.Group(); imp.position.set(PX + 0.9, -1.8, 0.47); scene.add(imp);
  cyl(0.34, 0.34, 0.04, 'white', 0, 0, 0, {parent: imp, rot: [Math.PI / 2, 0, 0], seg: 14, cast: false});
  for (let i = 0; i < 4; i++) box(0.6, 0.09, 0.05, 'pumpB', 0, 0, 0.04, {parent: imp, rot: [0, 0, i * Math.PI / 4], r: 0.01, cast: false});
  house(K, PX, -8.5, -4.2, {w: 4.6, wall: 'brick'});

  // ── башня: ствол (задняя половина + срез), лестница, бак в разрезе, вода
  const halfCyl = (r, h, role, x, y, z, seg = 16) => cyl(r, r, h, role, x, y, z, {open: true, ts: Math.PI / 2, tl: Math.PI, seg, mat: {side: THREE.DoubleSide}});
  halfCyl(SR, SH, 'brick', TX, SH / 2, 0, 16);
  for (const s of [-1, 1]) box(0.36, SH, 0.06, 'concreteCut', TX + s * (SR - 0.15), SH / 2, -0.03, {r: 0.005, cast: false});
  for (let y = 0.9; y < SH - 0.5; y += 0.6) box(0.5, 0.05, 0.05, 'iron', TX, y, -1.05, {r: 0.01, cast: false}); // скобы-лестница по задней стене
  for (const s of [-1, 1]) box(0.05, SH - 0.6, 0.05, 'iron', TX + s * 0.25, SH / 2, -1.05, {r: 0.01, cast: false});
  // окна-бойницы в стволе (снаружи по бокам)
  for (const s of [-1, 1]) for (let y = 5; y < 22; y += 6) box(0.3, 1.0, 0.5, 'glassDark', TX + s * (SR + 0.02), y, -0.5, {r: 0.02, cast: false});
  // переход ствол → бак (половина конуса) и днище бака
  add(new THREE.CylinderGeometry(TR, SR, TB - SH, 18, 1, true, Math.PI / 2, Math.PI), 'tank', TX, (TB + SH) / 2, 0, {mat: {side: THREE.DoubleSide}});
  { const g = new THREE.CircleGeometry(TR - 0.05, 18, 0, Math.PI); g.rotateX(-Math.PI / 2); add(g, 'iron', TX, TB - 0.02, 0, {cast: false}); }
  halfCyl(TR, TT - TB, 'tank', TX, (TB + TT) / 2, 0, 18);
  for (const s of [-1, 1]) box(0.22, TT - TB, 0.05, 'iron', TX + s * (TR - 0.1), (TB + TT) / 2, -0.03, {r: 0.005, cast: false});
  box(2 * TR, 0.2, 0.05, 'iron', TX, TB - 0.1, -0.03, {r: 0.005, cast: false});
  add(new THREE.CylinderGeometry(0.7, TR + 0.35, 2.2, 18, 1, true, Math.PI / 2, Math.PI), 'roof', TX, TT + 1.1, 0, {mat: {side: THREE.DoubleSide}});
  cyl(0.3, 0.3, 0.9, 'roof', TX, TT + 2.5, -0.35, {seg: 8});
  // обходной балкон с перилами под баком (задняя половина)
  add(new THREE.RingGeometry(TR, TR + 0.9, 18, 1, 0, Math.PI).rotateX(-Math.PI / 2), 'iron', TX, TB - 0.25, -0.02, {cast: false});
  for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12; box(0.06, 1.0, 0.06, 'iron', TX + Math.cos(a) * (TR + 0.85), TB + 0.25, -Math.sin(a) * (TR + 0.85), {r: 0.01, cast: false}); }
  add(new THREE.TorusGeometry(TR + 0.85, 0.04, 4, 24, Math.PI).rotateX(-Math.PI / 2), 'iron', TX, TB + 0.75, 0, {cast: false});
  // вода в баке: задняя полуцилиндрическая стенка, передняя плоскость, зеркало
  const wMat = new THREE.MeshStandardMaterial({color: '#3f95dd', transparent: true, opacity: 0.8, roughness: 0.3, depthWrite: false});
  const wBody = new THREE.Mesh(new THREE.CylinderGeometry(TR - 0.2, TR - 0.2, 1, 18, 1, true, Math.PI / 2, Math.PI), wMat); wBody.material.side = THREE.DoubleSide; wBody.renderOrder = 5; wBody.position.x = TX; scene.add(wBody);
  const wFront = new THREE.Mesh(new THREE.PlaneGeometry(2 * (TR - 0.2), 1), wMat); wFront.position.set(TX, 0, 0.02); wFront.renderOrder = 5; scene.add(wFront);
  const wTopG = new THREE.CircleGeometry(TR - 0.2, 18, 0, Math.PI); wTopG.rotateX(-Math.PI / 2);
  const wTop = new THREE.Mesh(wTopG, new THREE.MeshStandardMaterial({color: '#6cb6ee', transparent: true, opacity: 0.9, roughness: 0.2, depthWrite: false})); wTop.position.x = TX; wTop.renderOrder = 6; scene.add(wTop);
  // мерная рейка слева от башни: 10 / 20 / 30 м
  const ruler = new THREE.Group(); ruler.position.set(-14, 0, 0.4); scene.add(ruler);
  box(0.22, 31, 0.22, 'white', 0, 15.5, 0, {parent: ruler, r: 0.03});
  for (let m = 1; m <= 31; m++) box(m % 10 === 0 ? 1.4 : 0.5, m % 10 === 0 ? 0.22 : 0.08, 0.26, m % 10 === 0 ? 'lvl' : 'iron', m % 10 === 0 ? 0.45 : 0.2, m, 0, {parent: ruler, r: 0.01, cast: false});

  // ── посёлок: дом с колонкой, пятиэтажка
  house(K, 1.2, -9.2, -4.4, {});
  const taps = [[-1.0, -2.0], [8.4, -1.6]].map(([x, z]) => { cyl(0.13, 0.15, 1.3, 'tap', x, 0.65, z, {seg: 8}); box(0.5, 0.12, 0.12, 'tap', x + 0.22, 1.15, z, {r: 0.03}); box(0.08, 0.6, 0.08, 'iron', x - 0.1, 1.45, z, {r: 0.02, rot: [0, 0, 0.6]}); return [x + 0.45, 1.1, z]; });
  const building = (x0, x1, z0, z1, fl, role, o = {}) => {
    const W = x1 - x0, D = z1 - z0, H = fl * 3, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(W, H, D, role, cx, H / 2, cz, {r: 0.05});
    box(W + 0.5, 0.5, D + 0.5, o.trim ?? 'stone', cx, H + 0.05, cz, {r: 0.05});
    const nc = Math.round(W / 2.2), ns = Math.round(D / 2.2);
    for (let f = 0; f < fl; f++) { const y = f * 3 + 1.7;
      for (let c = 0; c < nc; c++) box(1.1, 1.5, 0.24, 'glass', x0 + (c + 0.5) * W / nc, y, z1 + 0.04, {r: 0.02, cast: false, mat: {emissive: 1, win: 1, ei: 0.8}});
      for (let c = 0; c < ns; c++) box(0.24, 1.5, 1.1, 'glass', x0 - 0.04, y, z0 + (c + 0.5) * D / ns, {r: 0.02, cast: false, mat: {emissive: 1, win: 1, ei: 0.8}});
      if (o.belt) box(W + 0.16, 0.18, D + 0.16, o.trim ?? 'stone', cx, f * 3 + 0.15, cz, {r: 0.03, cast: false}); }
    box(1.6, 2.4, 0.2, 'door', x0 + W * 0.25, 1.2, z1 + 0.06, {r: 0.02});
  };
  building(7.5, 15.5, -10, -3.6, 5, 'panel', {trim: 'white', belt: true});
  // ── Нью-Йорк: кирпичные дома, пожарные лестницы, баки на крышах
  building(NY.x0, NY.x1, NY.z0, NY.z1, NY.fl, 'nybrick', {belt: true});
  building(31, 41, -19, -9.5, 15, 'nybrick', {belt: true});
  for (let f = 1; f < NY.fl; f++) { const y = f * 3 + 0.05;
    box(3.2, 0.1, 1.1, 'iron', 25.4, y, NY.z1 + 0.75, {r: 0.01, cast: false}); box(3.2, 0.06, 0.06, 'iron', 25.4, y + 0.9, NY.z1 + 1.28, {r: 0.01, cast: false});
    const st = box(3.4, 0.08, 0.5, 'iron', 25.4, y - 1.5, NY.z1 + 0.95, {r: 0.01, cast: false}); st.rotation.z = (f % 2 ? 1 : -1) * Math.atan2(3, 3.0); }
  box(24, 0.16, 7, 'asphalt', 30, 0.04, -1.5, {r: 0.02, cast: false});
  // бак на крыше: опоры, деревянная бочка в разрезе (задняя половина + срез), обручи, конусная крыша
  const H0 = NY.fl * 3 + 0.3;
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.2], [1.4, 1.2]]) box(0.2, RT.y - H0, 0.2, 'iron', RT.x + dx, (RT.y + H0) / 2, RT.z + dz, {r: 0.02});
  box(4.2, 0.2, 4.2, 'woodDark', RT.x, RT.y - 0.1, RT.z, {r: 0.03});
  const cedarM = new THREE.MeshStandardMaterial({color: '#b9875a', flatShading: true, roughness: 1, side: THREE.DoubleSide});
  const stave = new THREE.Mesh(new THREE.CylinderGeometry(RT.r, RT.r, RT.h, 16, 1, true, Math.PI / 2, Math.PI), cedarM); stave.position.set(RT.x, RT.y + RT.h / 2, RT.z); stave.castShadow = stave.receiveShadow = true; scene.add(stave);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(K.rbox(0.14, RT.h, 0.05, 0.005), cedarM); m.position.set(RT.x + s * (RT.r - 0.07), RT.y + RT.h / 2, RT.z - 0.03); scene.add(m); }
  for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(RT.r + 0.05, 0.035, 4, 20, Math.PI).rotateX(-Math.PI / 2), 'iron', RT.x, RT.y + 0.4 + i * 0.75, RT.z, {cast: false});
  add(new THREE.ConeGeometry(RT.r + 0.25, 1.3, 16, 1, true, Math.PI / 2, Math.PI), 'woodDark', RT.x, RT.y + RT.h + 0.65, RT.z, {mat: {side: THREE.DoubleSide}});
  const rwMat = new THREE.MeshStandardMaterial({color: '#3f95dd', transparent: true, opacity: 0.8, roughness: 0.3, depthWrite: false});
  const rwBody = new THREE.Mesh(new THREE.CylinderGeometry(RT.r - 0.12, RT.r - 0.12, 1, 16, 1, true, Math.PI / 2, Math.PI), rwMat); rwBody.material.side = THREE.DoubleSide; rwBody.renderOrder = 5; rwBody.position.set(RT.x, 0, RT.z); scene.add(rwBody);
  const rwFront = new THREE.Mesh(new THREE.PlaneGeometry(2 * (RT.r - 0.12), 1), rwMat); rwFront.position.set(RT.x, 0, RT.z + 0.02); rwFront.renderOrder = 5; scene.add(rwFront);
  // статичный бак на соседнем доме
  { const bx = 36, by = 15 * 3 + 2.6, bz = -13; for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) box(0.2, 2.4, 0.2, 'iron', bx + dx, 45.3 + 1.2, bz + dz, {r: 0.02});
    cyl(1.8, 1.8, 3.4, 'cedar', bx, by + 1.7, bz, {seg: 16}); for (let i = 0; i < 4; i++) cyl(1.85, 1.85, 0.08, 'iron', bx, by + 0.4 + i * 0.85, bz, {seg: 16, cast: false});
    add(new THREE.ConeGeometry(2.0, 1.2, 16), 'woodDark', bx, by + 4.0, bz); }
  // насос и стояк по фасаду
  box(1.2, 1.0, 0.8, 'pumpB', 21.6, 0.55, NY.z1 + 0.6, {r: 0.06});
  const nyImp = new THREE.Group(); nyImp.position.set(21.6, 0.55, NY.z1 + 1.02); scene.add(nyImp);
  cyl(0.3, 0.3, 0.04, 'white', 0, 0, 0, {parent: nyImp, rot: [Math.PI / 2, 0, 0], seg: 12, cast: false});
  for (let i = 0; i < 4; i++) box(0.5, 0.08, 0.05, 'pumpB', 0, 0, 0.03, {parent: nyImp, rot: [0, 0, i * Math.PI / 4], r: 0.01, cast: false});
  const pNy = pipe([[21.6, 1.0, NY.z1 + 0.5], [21.6, H0 + 1.0, NY.z1 + 0.5], [21.6, H0 + 1.0, RT.z], [RT.x - 0.8, H0 + 1.0, RT.z], [RT.x - 0.8, RT.y + 0.5, RT.z]], 0.14, 'iron', {bend: 0.4});

  // ── капли воды в трубах (бусины): точки по кривой со смещением к зрителю
  const dGeo = new THREE.IcosahedronGeometry(0.17, 0), dMat = K.M('drop');
  const stream = (curve, n, dz, scale = 1) => { const L = []; for (let i = 0; i < n; i++) { const m = add(dGeo, 'drop', 0, 0, 0, {material: dMat, cast: false}); m.scale.setScalar(scale); L.push(m); }
    return (t, on, ymax = 1e9) => L.forEach((m, i) => { const u = ((t + i / n) % 1 + 1) % 1, p = curve.getPointAt(u); m.position.set(p.x, p.y, p.z + dz); m.visible = on > 0.02 && i / n < on * 1.2 && p.y <= ymax; }); };
  const sIn = stream(pIn.userData.curve, 70, 0.3), sOut = stream(pOut.userData.curve, 110, 0.34);
  const sBr = branches.map((b) => stream(b.userData.curve, 6, 0.22, 0.8));
  const sNy = stream(pNy.userData.curve, 46, 0.18, 0.8);
  // струи из колонок: дуги
  const jets = taps.map(([x, y, z]) => { const L = []; for (let i = 0; i < 10; i++) L.push(add(dGeo, 'drop', 0, 0, 0, {material: dMat, cast: false}));
    return (t, on) => L.forEach((m, i) => { const u = ((t * 1.4 + i / 10) % 1 + 1) % 1; m.position.set(x + u * 1.3, y + 0.45 * u - 1.4 * u * u, z); m.scale.setScalar(0.8); m.visible = on > 0.05; }); });
  // капли из щелей сухой бочки
  const drips = []; for (let i = 0; i < 7; i++) { const m = add(new THREE.IcosahedronGeometry(0.09, 0), 'drop', 0, 0, 0, {material: dMat, cast: false}); drips.push(m); }
  // жёлтая пунктирная линия «уровень воды в баке»
  const lineG = new THREE.Group(); scene.add(lineG); const dashes = [];
  for (let x = TX + TR + 0.6; x < 31; x += 1.2) dashes.push(box(0.7, 0.18, 0.18, 'lvl', x, 0, -2.2, {r: 0.02, cast: false, parent: lineG}));

  // ── деревья, ели, забор, облака
  for (const [x, z, s] of [[-27, -6, 1.5], [-31, -12, 1.8], [-13, -14, 1.7], [-3, -17, 1.9], [5, -16, 1.6], [-24, -18, 2], [-36, -9, 1.6], [16, -20, 1.8]]) fir(x, S(x, z) - 0.05, z, s, false);
  tree(-3.6, S(-3.6, -6) - 0.05, -6, 2.6, 1.1, 31); tree(5.4, S(5.4, -8.5) - 0.05, -8.5, 2.4, 1.0, 41); tree(-12.5, S(-12.5, -5) - 0.05, -5, 2.3, 1.0, 51);
  fence(K, S, -3.3, 5.5, -3.3, false);
  const clouds = [cloud(sky, -12, 40, -40, 2.4, 51), cloud(sky, 10, 46, -50, 2.8, 52), cloud(sky, 26, 52, -46, 2.0, 53), cloud(sky, -26, 34, -44, 2.2, 54)];

  // q: level — уровень воды в баке (м); pump 0..1 — насос станции; fill 0..1 — бусины «внутрь»; out 0..1 — бусины «к домам»;
  // taps 0..1 — струи колонок; ruler 0..1 — рейка растёт; line 0..1 — пунктир уровня; ny 0..1 — насос небоскрёба (вода до крыши);
  // nyOn 0..1 — видна вода в стояке; roof — уровень воды в бочке (0..1); drip 0..1 — бочка течёт
  const animate = (q) => {
    const t = q.t ?? 0, L = q.level ?? 30;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.06 * i); });
    const hW = Math.max(0.02, L - TB);
    wBody.scale.y = hW; wBody.position.y = TB + hW / 2; wFront.scale.y = hW; wFront.position.y = TB + hW / 2; wTop.position.y = L + 0.01;
    const pr = q.pump ?? 0; imp.rotation.z = -t * 9 * pr; sIn(t * 0.08 * Math.max(pr, 0.0001), q.fill ?? 0);
    const so = q.out ?? 0; sOut(t * 0.06, so); sBr.forEach((f, i) => f(t * 0.5 + i * 0.3, so));
    jets.forEach((f) => f(t, q.taps ?? 0));
    const rl = sm(q.ruler ?? 0); ruler.scale.y = Math.max(0.001, rl); ruler.visible = rl > 0.002;
    const ln = q.line ?? 0; dashes.forEach((d, i) => { d.visible = i / dashes.length < ln; }); const LY = q.lineY ?? L; lineG.position.y = LY;
    const ny = q.ny ?? 0; nyImp.rotation.z = -t * 9 * ny; sNy(t * 0.07, q.nyOn ?? 0, lerp(LY, 99, ny));
    const rf = Math.max(0.02, (q.roof ?? 0.7) * (RT.h - 0.4));
    rwBody.scale.y = rf; rwBody.position.y = RT.y + 0.1 + rf / 2; rwFront.scale.y = rf; rwFront.position.y = RT.y + 0.1 + rf / 2;
    const dr = q.drip ?? 0; cedarM.color.set('#c99a6a').lerp(new THREE.Color('#8a5f3a'), 1 - dr);
      drips.forEach((m, i) => { const sd = i % 2 ? 1 : -1, u = ((t * 0.9 + i * 0.37) % 1 + 1) % 1; m.position.set(RT.x + sd * (RT.r + 0.08), RT.y + 0.6 + 0.9 * (i % 4) - u * u * 2.2, RT.z - 0.35 - 0.2 * (i % 3)); m.visible = dr > 0.05 && i / 7 < dr * 1.1 && m.position.y > RT.y + 0.05; });
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
