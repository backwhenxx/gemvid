// @ts-nocheck
// Мир «Как устроен погреб» (24.11): огород у дома, под землёй погреб в разрезе (дыра в срезе z=0).
// Внутри: полки с банками, закрома с картошкой, ящики с яблоками, лестница к люку. Две трубы: приточная — до пола,
// вытяжная — от потолка. Воздух ходит по кругу (синие и серые бусины). Сезон: лето → зима (снег поверх земли).
import * as THREE from 'three';
import {makeKit, cutFace, hills, fence, rnd, sm, lerp, hash3, vnoise} from '../kit';

const CX0 = -2.75, CX1 = 2.75, CY0 = -3.25, CY1 = -0.75, CZ = -3.2; // погреб
export function S(x, z) { return 0.12 * Math.sin(x * 0.4 + z * 0.3) * sm((-z - 1) / 3) + 0.9 * sm((-z - 16) / 10) + 0.1 * vnoise(x * 0.3, 2, z * 0.3) * sm((-z - 1) / 3); }
const LV = [null, -0.3, -1.2, -2.6, -4.2, -7, -30];
const LAYERS = ['soil', 'soil', 'loam', 'clay', 'sand', 'rock'];
const COL = {grass: '#86b85a', soil: '#6e4e3a', loam: '#8a6346', clay: '#b9805a', sand: '#d1b27e', rock: '#8a8fa6'};
const bound = (k, x) => (k === 0 ? S(x, 0) : Math.min(S(x, 0), LV[k] + 0.08 * Math.sin(x * 0.9 + k)));
const PI_X = -2.0, PO_X = 1.6, PZ = -0.55; // трубы: приток (до пола), вытяжка (от потолка)
export const T = {
  cellar: [0, -1.4, -1], top: [-4.5, 1.4, -1], deep: [-4.2, -2.6, 0.02], inPipe: [PI_X, 0.9, PZ], outPipe: [PO_X, 1.2, PZ],
  floor: [PI_X + 0.3, -2.9, PZ], ceil: [PO_X, -1.05, PZ], apples: [1.6, -2.75, -0.9], potato: [-0.4, -2.7, -0.9], jars: [-0.6, -1.6, -2.6],
};
export const CAMS = {
  hook: {pos: [0.6, -1.3, 6.2], look: [0.2, -1.8, -1.6], fov: 40},
  wide: {pos: [0.8, 0.6, 14.5], look: [0, -0.9, -2], fov: 40},
  surf: {pos: [1.5, 2.6, 15], look: [0.2, 0.4, -2.5], fov: 40},
  deep: {pos: [-2.0, -1.4, 11], look: [-1.6, -1.8, -1], fov: 40},
  pipeIn: {pos: [-1.6, -0.6, 7.5], look: [-1.6, -1.2, -0.8], fov: 40},
  pipeOut: {pos: [1.3, -0.2, 7.5], look: [1.2, -0.7, -0.8], fov: 40},
  apples: {pos: [1.0, -2.0, 4.8], look: [0.8, -2.5, -1.2], fov: 40},
  end: {pos: [2.0, 1.4, 17], look: [0.4, -0.4, -2.5], fov: 40},
  cover: {pos: [0.5, -1.2, 7.4], look: [0.2, -1.7, -1.6], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {...COL, plank: '#a77a4c', jarG: '#7fb36a', jarR: '#c2553f', jarY: '#e0b84a', potatoC: '#b8935e', appleR: '#c64a3a', appleY: '#d9c04a', paper: '#efe6d2', pipeC: '#6d7078', brickC: '#a9735c', concreteC: '#b9b3a8'});
  const {add, box, cyl, blob, tree, fir, cloud, smoke} = K;
  cutFace(K, LAYERS, bound, -40, 40, [{x0: CX0, x1: CX1, y0: CY0, y1: CY1}], 0, 0.25);
  // земля: сетка + снежный покров поверх (прозрачность = зима)
  const X0 = -40, X1 = 40, Z0 = -34;
  const grid = (dy) => { const xs = [], zs = []; for (let x = X0; x <= X1 + 1e-6; x += 0.5) xs.push(x); for (let z = 0; z >= Z0 - 1e-6; z -= z > -6 ? 0.5 : 1.0) zs.push(z);
    const P = [], I = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) P.push(xs[i], S(xs[i], zs[j]) + dy, zs[j]);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng; };
  { const m = new THREE.Mesh(grid(0), K.M('grass')); m.receiveShadow = true; scene.add(m); }
  const snowM = new THREE.MeshStandardMaterial({color: '#f2f5f8', flatShading: true, roughness: 1, transparent: true, opacity: 0, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.08});
  const snowG = new THREE.Mesh(grid(0.06), snowM); snowG.renderOrder = 3; scene.add(snowG);
  const grassM = K.M('grass'), grassC = grassM.color.clone(), snowC = new THREE.Color('#eef2f6');
  hills(K, 'hillMid', Z0 + 0.5, -80, (x, z) => S(x, Z0) + 6 * sm((-z + Z0) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -76, -170, (x, z) => 3 + 16 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0, n = 0; i < 300 && n < 18; i++) { const x = lerp(-38, 38, r()), y = lerp(-7, -1.2, r()), rr = 0.15 + r() * 0.25; if (x > CX0 - 0.8 && x < CX1 + 0.8 && y > CY0 - 0.8) continue; add(blob(rr, n, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++; } }

  // ── погреб: стены, пол, потолок (плита), задняя стена — всё за плоскостью разреза
  const zc = (CZ - 0.02) / 2;
  box(CX1 - CX0 + 0.5, 0.25, -CZ, 'concreteC', 0, CY0 - 0.125, CZ / 2 - 0.02, {});
  box(CX1 - CX0 + 0.5, 0.3, -CZ, 'concreteC', 0, CY1 + 0.15, CZ / 2 - 0.02, {});
  for (const s of [-1, 1]) box(0.25, CY1 - CY0, -CZ, 'brickC', s * (CX1 + 0.125 - 0.25), (CY0 + CY1) / 2, CZ / 2 - 0.02, {});
  box(CX1 - CX0, CY1 - CY0, 0.25, 'brickC', 0, (CY0 + CY1) / 2, CZ - 0.12, {});
  for (let k = 0; k < 8; k++) box(CX1 - CX0 - 0.6, 0.02, 0.02, 'soil', 0, CY0 + 0.3 + k * 0.3, CZ + 0.02, {cast: false});
  // полки с банками у задней стены
  const jarC = ['jarG', 'jarR', 'jarY'];
  for (let sh = 0; sh < 3; sh++) { const y = CY0 + 0.9 + sh * 0.55; box(3.6, 0.06, 0.45, 'plank', -0.4, y, CZ + 0.35, {}); for (let i = 0; i < 9; i++) { const c = jarC[(i + sh) % 3]; cyl(0.12, 0.12, 0.3, c, -2.0 + i * 0.4, y + 0.18, CZ + 0.35, {seg: 8}); cyl(0.13, 0.13, 0.05, 'pipeC', -2.0 + i * 0.4, y + 0.355, CZ + 0.35, {seg: 8}); } }
  for (const x of [-2.2, 1.4]) box(0.08, 1.8, 0.4, 'plank', x, CY0 + 1.0, CZ + 0.35, {});
  // закром с картошкой (левее центра) и ящики с яблоками (справа)
  box(1.6, 0.6, 0.06, 'plank', -0.4, CY0 + 0.3, -0.35, {}); box(1.6, 0.6, 0.06, 'plank', -0.4, CY0 + 0.3, -1.45, {}); for (const dx of [-0.8, 0.8]) box(0.06, 0.6, 1.1, 'plank', -0.4 + dx, CY0 + 0.3, -0.9, {});
  { const r = rnd(5); for (let i = 0; i < 26; i++) add(blob(0.11 + r() * 0.05, i, 0.25, 1.2, 1.3, 0.85, 1.0), 'potatoC', -0.4 + (r() - 0.5) * 1.4, CY0 + 0.15 + r() * 0.42, -0.9 + (r() - 0.5) * 0.9, {cast: false}); }
  const apples = [], papers = [];
  for (let b = 0; b < 2; b++) { const bx = 1.55, by = CY0 + 0.22 + b * 0.46; box(1.0, 0.05, 0.8, 'plank', bx, by - 0.2, -0.9, {}); for (const dz of [-0.4, 0.4]) box(1.0, 0.3, 0.04, 'plank', bx, by - 0.05, -0.9 + dz, {}); for (const dx of [-0.5, 0.5]) box(0.04, 0.3, 0.8, 'plank', bx + dx, by - 0.05, -0.9, {});
    for (let i = 0; i < 8; i++) { const x = bx - 0.33 + (i % 4) * 0.22, z = -1.12 + Math.floor(i / 4) * 0.38; apples.push(add(new THREE.SphereGeometry(0.09, 10, 8), i % 3 ? 'appleR' : 'appleY', x, by + 0.02, z, {cast: false})); papers.push(add(new THREE.IcosahedronGeometry(0.11, 0), 'paper', x, by + 0.02, z, {cast: false})); } }
  // лестница к люку справа
  for (let k = 0; k < 6; k++) { box(0.6, 0.06, 0.25, 'plank', 2.2, CY0 + 0.35 + k * 0.4, -2.4 + k * 0.12, {}); } for (const dx of [-0.32, 0.32]) { const m = box(0.06, 2.6, 0.08, 'plank', 2.2 + dx, CY0 + 1.3, -2.1, {}); m.rotation.x = -0.28; }
  // люк и погребица на поверхности, трубы с колпаками
  { const y = S(2.2, -2.3); box(1.2, 0.12, 1.2, 'plank', 2.2, y + 0.08, -2.3, {r: 0.02}); box(1.3, 0.9, 1.3, 'plank', 2.2, y + 0.55, -3.3, {r: 0.03}); }
  const pipe = (x, y0, y1) => { cyl(0.11, 0.11, y1 - y0, 'pipeC', x, (y0 + y1) / 2, PZ, {seg: 10}); add(new THREE.ConeGeometry(0.24, 0.18, 10), 'pipeC', x, y1 + 0.18, PZ, {}); box(0.05, 0.12, 0.05, 'pipeC', x, y1 + 0.05, PZ, {}); };
  pipe(PI_X, CY0 + 0.22, 0.9); pipe(PO_X, CY1 - 0.32, 1.25);
  // грядки, яблоня, ели, забор, лейка, дом вдали
  for (let i = 0; i < 4; i++) box(4.2, 0.18, 0.9, 'soil', -6.5 + 0, S(-6.5, -3 - i * 1.4) + 0.09, -3 - i * 1.4, {r: 0.05, cast: false});
  const crown = new THREE.Group(); scene.add(crown);
  { const x = 6.5, z = -4.5; cyl(0.15, 0.22, 2.0, 'trunk', x, S(x, z) + 1.0, z, {seg: 7}); add(blob(1.4, 41, 0.2, 1.4), 'leaf', x, S(x, z) + 2.6, z, {parent: crown}); for (let i = 0; i < 7; i++) add(new THREE.SphereGeometry(0.1, 8, 6), 'appleR', x + Math.cos(i) * 1.1, S(x, z) + 2.3 + Math.sin(i * 2.3) * 0.5, z + Math.sin(i) * 0.8, {parent: crown, cast: false}); }
  { const r = rnd(9); for (let i = 0, n = 0; i < 200 && n < 18; i++) { const x = lerp(-36, 36, r()), z = lerp(-30, -11, r()); if (Math.abs(x) < 6 && z > -14) continue; fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.6, false); n++; } }
  fence(K, S, -12, 12, -9.5, true);
  { const x = -9.5, z = -12.5; box(4, 2.4, 3, 'wall', x, S(x, z) + 1.2, z, {r: 0.04}); const sh = new THREE.Shape(); sh.moveTo(-2.3, 0); sh.lineTo(2.3, 0); sh.lineTo(0, 1.5); sh.closePath(); add(new THREE.ExtrudeGeometry(sh, {depth: 3.4, bevelEnabled: false}), 'roof', x, S(x, z) + 2.4, z - 1.7, {}); box(0.8, 0.6, 0.05, 'glass', x + 0.8, S(x, z) + 1.4, z + 1.52, {r: 0.02, cast: false, mat: {emissive: 1, win: 1, ei: 0.8}}); box(0.4, 1.0, 0.4, 'brick', x - 1.0, S(x, z) + 3.4, z, {r: 0.03}); }
  const hsmoke = smoke(-10.5, S(-10.5, -12.5) + 3.9, -12.5, 6, 0.8);
  // воздух: холод вниз по приточной, по полу; тёплый вверх под потолок и в вытяжку
  const pIn = [[PI_X, 1.2], [PI_X, CY0 + 0.25], [PI_X + 1.0, CY0 + 0.3], [0.6, CY0 + 0.9], [0.9, CY1 - 0.5], [PO_X, CY1 - 0.35], [PO_X, 1.5]];
  const segs = []; let L = 0; for (let i = 0; i < pIn.length - 1; i++) { const a = pIn[i], b = pIn[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({a, b, l, s: L}); L += l; }
  const at = (u) => { const d = u * L; for (const s of segs) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return [lerp(s.a[0], s.b[0], k), lerp(s.a[1], s.b[1], k)]; } return pIn[pIn.length - 1]; };
  const cold = new THREE.Color('#5c9fe0'), warm = new THREE.Color('#b9a99a');
  const air = []; for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({color: '#5c9fe0'})); m.renderOrder = 8; scene.add(m); air.push(m); }
  // этилен: зеленоватые завитки от яблок к картошке
  const gasM = new THREE.MeshBasicMaterial({color: '#b6d26a', transparent: true, opacity: 0, depthWrite: false});
  const eth = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), gasM); m.renderOrder = 8; scene.add(m); eth.push(m); }
  const clouds = [cloud(sky, -14, 20, -40, 2.6, 51), cloud(sky, 10, 23, -48, 3.0, 52), cloud(sky, 26, 19, -36, 2.0, 53)];

  // q: winter 0..1, air 0..1, eth 0..1, wrap 0..1
  const animate = (q) => {
    const t = q.t, wn = sm(q.winter ?? 0), ar = sm(q.air ?? 0), et = sm(q.eth ?? 0), wr = sm(q.wrap ?? 0);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.06 * i); });
    snowG.visible = false; grassM.color.copy(grassC).lerp(snowC, wn); crown.scale.setScalar(Math.max(0.001, 1 - wn)); crown.visible = wn < 0.99;
    hsmoke(t, 1);
    air.forEach((m, i) => { const u = ((t * 0.07 + i / air.length) % 1 + 1) % 1, [x, y] = at(u); m.position.set(x, y, PZ + 0.18); m.material.color.copy(cold).lerp(warm, sm((u - 0.3) / 0.4)); m.visible = ar > 0.05; m.scale.setScalar(Math.max(0.01, ar)); });
    gasM.opacity = 0.75 * et * (1 - wr);
    eth.forEach((m, i) => { const u = ((t * 0.12 + i / eth.length) % 1 + 1) % 1; m.position.set(lerp(1.4, -0.2, u), CY0 + 0.6 + 0.4 * Math.sin(u * 3 + i) + u * 0.2, -0.9 + 0.2 * Math.sin(i * 2 + t)); m.visible = et * (1 - wr) > 0.02; });
    papers.forEach((m) => { m.visible = wr > 0.02; m.scale.setScalar(Math.max(0.01, wr)); }); apples.forEach((m) => (m.visible = wr < 0.95));
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
