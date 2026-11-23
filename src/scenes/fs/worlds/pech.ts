// @ts-nocheck
// Мир «Как устроена кирпичная печь» (23.11): зимняя деревня, бревенчатый дом в разрезе (срез z=ZF), внутри печь тоже
// в разрезе: топка, три канала-«лабиринт» (вверх-вниз-вверх), труба с заслонкой. Газы бегут по каналам и остывают,
// кирпич нагревается, потом отдаёт тепло комнате; часы на стене крутятся.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, fence, rnd, sm, lerp, hash3, vnoise} from '../kit';

export function S(x, z) {
  const flat = sm((Math.abs(z + 4) - 6) / 3);
  return (0.5 * sm((-z - 14) / 10) + 0.12 * Math.sin(x * 0.4 + z * 0.3)) * Math.max(flat, sm((-z - 12) / 4));
}
const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.3, (x) => S(x, 0) - 1.2 - 0.06 * Math.sin(x * 1.3), (x) => -3.6 + 0.25 * Math.sin(x * 0.4 + 1), (x) => -8 + 0.3 * Math.sin(x * 0.3), () => -30];
const LAYERS = ['snow', 'soil', 'clay', 'sand', 'rock'];
const HA = 3.0, OV = 1.0, KS = 0.85, YR = 6.0, TH = 0.25, ZF = -0.06, DEP = 8;
const roofBot = (x) => YR - KS * Math.abs(x);
const roofTop = (x) => roofBot(x) + TH;
const F0 = 0.56; // пол
const CX = 1.82, CH = roofBot(1.82) + 1.5; // ось трубы и её верх
const PATH = [[1.25, 0.95], [0.78, 1.15], [0.78, 2.52], [1.3, 2.52], [1.3, 1.53], [CX, 1.53], [CX, 2.9], [CX, CH]];
export const T = {
  stove: [0.6, 2.2, ZF], fire: [1.1, 0.95, ZF], maze: [1.3, 2.2, ZF], hot: [0.9, 1.6, ZF], chim: [CX, roofBot(CX) + 0.8, ZF],
  mass: [0.5, 1.2, ZF], damper: [CX, 3.35, ZF], room: [-1.2, 1.8, -1.2], clock: [-1.6, 2.5, ZF - DEP + 0.3], out: [-6, 4.2, -2],
};
export const CAMS = {
  hook: {pos: [2.2, 1.55, 4.6], look: [1.3, 1.5, -0.6], fov: 40},
  hook2: {pos: [2.0, 1.9, 6.4], look: [1.3, 1.75, -0.6], fov: 40},
  stove: {pos: [1.7, 2.0, 7.4], look: [1.3, 1.85, -0.6], fov: 40},
  chim: {pos: [2.6, 4.0, 8.6], look: [1.8, 3.6, -0.6], fov: 40},
  stoveB: {pos: [1.5, 1.85, 6.6], look: [1.3, 1.8, -0.6], fov: 40},
  chimB: {pos: [2.5, 3.5, 6.8], look: [1.9, 3.25, -0.6], fov: 40},
  room: {pos: [0.4, 2.3, 9.5], look: [0.2, 1.9, -1.8], fov: 40},
  house: {pos: [1.2, 3.6, 16], look: [0.4, 3.0, -2.5], fov: 40},
  night: {pos: [4.5, 4.5, 21], look: [0.6, 3.2, -3], fov: 40},
  cover: {pos: [1.9, 2.1, 6.8], look: [1.1, 1.9, -0.6], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {shingle: '#6e4a3a', attic: '#b88e62', inner: '#c9955f', floorW: '#a87a4a', logW: '#9a6a42', soot: '#3a2f2c', iron: '#3b3d42', fireC: '#ffb03a', fireC2: '#ff7a2a', logs: '#7a4f30', rug: '#b5543c', rug2: '#d8b45a'});
  const {add, box, cyl, blob, fir, cloud, smoke} = K;
  cutFace(K, LAYERS, (k, x) => B[k](x), -40, 40, []);
  ground(K, S, 'snow', -40, 40, -34, 0.9);
  hills(K, 'snow', -33.5, -80, (x, z) => S(x, -34) + 7 * sm((-z - 34) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -76, -170, (x, z) => 3 + 18 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0; i < 16; i++) { const x = lerp(-38, 38, r()), y = lerp(-7, -1.2, r()), rr = 0.2 + r() * 0.3; add(blob(rr, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); } }

  const ext = (pts, role, z0, depth, o = {}) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath(); return add(new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: false}), role, o.x ?? 0, 0, z0, o); };
  const chevron = (y0, th, xa) => [[-xa, y0(-xa)], [0, y0(0)], [xa, y0(xa)], [xa, y0(xa) + th], [0, y0(0) + th], [-xa, y0(-xa) + th]];

  // ── бревенчатый дом в разрезе
  const z0 = ZF - DEP;
  box(2 * HA + 0.2, 0.42, DEP, 'stone', 0, 0.23, ZF - DEP / 2, {r: 0.03});
  box(2 * HA - 0.5, 0.12, DEP - 0.3, 'floorW', 0, 0.5, ZF - DEP / 2 - 0.15, {r: 0.01});
  for (const s of [-1, 1]) { box(0.3, 2.8, DEP, 'logW', s * (HA - 0.15), 1.84, ZF - DEP / 2, {}); for (let k = 0; k < 9; k++) cyl(0.17, 0.17, DEP + 0.3, 'logW', s * (HA - 0.02), 0.62 + k * 0.31, ZF - DEP / 2 - 0.15, {rot: [Math.PI / 2, 0, 0], seg: 7}); }
  box(2 * HA - 0.6, 2.8, 0.25, 'inner', 0, 1.84, z0 + 0.125, {});
  box(2 * HA + 0.05, 0.25, DEP, 'logW', 0, 3.33, ZF - DEP / 2, {});
  ext([[-HA, 3.46], [HA, 3.46], [0, roofBot(0) - 0.02]], 'attic', z0, 0.2, {});
  ext(chevron(roofBot, TH, HA + OV), 'shingle', z0 - 0.3, DEP + 0.3, {});
  ext(chevron((x) => roofTop(x) + 0.03, 0.42, HA + OV - 0.15), 'snow', z0 - 0.25, DEP + 0.25, {});
  for (const s of [-1, 1]) for (const z of [ZF - 2.4, ZF - 5.6]) { box(0.08, 1.15, 1.25, 'white', s * (HA + 0.2), 2.0, z, {}); box(0.06, 0.95, 1.05, 'glass', s * (HA + 0.24), 2.0, z, {mat: {emissive: 1, win: 1, ei: 0.9}, cast: false}); box(0.3, 0.07, 1.4, 'wood', s * (HA + 0.3), 1.42, z, {}); box(0.28, 0.06, 1.3, 'snow', s * (HA + 0.3), 1.48, z, {cast: false}); }
  // комната: окно сзади, лавка, стол, коврик, часы
  box(1.3, 1.1, 0.08, 'white', -1.2, 2.0, z0 + 0.3, {}); box(1.1, 0.9, 0.06, 'glass', -1.2, 2.0, z0 + 0.35, {mat: {emissive: 1, win: 1, ei: 0.9}, cast: false});
  box(2.4, 0.1, 0.5, 'wood', -1.4, 1.05, z0 + 0.6, {}); for (const dx of [-1.0, 1.0]) box(0.1, 0.45, 0.4, 'wood', -1.4 + dx, 0.78, z0 + 0.6, {});
  box(1.4, 0.08, 0.9, 'wood', -1.3, 1.3, ZF - 3.2, {}); for (const dx of [-0.6, 0.6]) box(0.08, 0.72, 0.7, 'wood', -1.3 + dx, 0.92, ZF - 3.2, {});
  box(2.2, 0.03, 1.4, 'rug', -1.0, F0 + 0.03, ZF - 1.8, {cast: false}); box(1.8, 0.035, 1.0, 'rug2', -1.0, F0 + 0.04, ZF - 1.8, {cast: false});
  const clock = new THREE.Group(); clock.position.set(-1.6, 2.6, z0 + 0.3); scene.add(clock);
  add(new THREE.CircleGeometry(0.32, 20), 'white', 0, 0, 0.01, {parent: clock, cast: false}); add(new THREE.RingGeometry(0.32, 0.38, 20), 'wood', 0, 0, 0.012, {parent: clock, cast: false});
  const hh = new THREE.Group(), mh = new THREE.Group(); hh.position.z = mh.position.z = 0.03; clock.add(hh, mh);
  box(0.04, 0.16, 0.01, 'dark', 0, 0.08, 0, {parent: hh, cast: false}); box(0.03, 0.26, 0.01, 'dark', 0, 0.13, 0.005, {parent: mh, cast: false});

  // ── печь в разрезе
  const brickM = new THREE.MeshStandardMaterial({color: '#9a6e60', flatShading: true, roughness: 0.9, emissive: new THREE.Color('#ff5a1a'), emissiveIntensity: 0});
  const bk = (x0, x1, y0, y1, d = 0.3, z1 = ZF) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, d), brickM); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z1 - d / 2); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  bk(0.4, 2.2, F0, 0.76); bk(0.4, 0.6, 0.76, 2.7); bk(2.0, 2.2, 0.76, 2.7); // основание, бока
  bk(0.4, 1.64, 2.7, 2.96); bk(2.0, 2.2, 2.7, 2.96); // верх с проходом в трубу над каналом C
  bk(0.96, 2.0, 1.3, 1.45); bk(0.96, 1.12, 1.45, 2.35); bk(1.48, 1.64, 1.6, 2.7); // свод топки, стенки лабиринта
  box(1.8, 2.4, 1.3, 'soot', 1.3, F0 + 1.2, ZF - 0.3 - 0.65, {}); // тело печи за каналами (тёмный задник)
  // кирпичные швы на боковой стороне (декор)
  for (let k = 0; k < 8; k++) box(0.02, 0.03, 1.5, 'soot', 2.215, 0.8 + k * 0.28, ZF - 0.85, {cast: false});
  // труба: через потолок и крышу, срезана; внутри — тёмный канал
  bk(1.6, 1.7, 2.96, CH, 0.6); bk(1.94, 2.04, 2.96, CH, 0.6); box(0.44, CH - 2.96, 0.3, 'soot', CX, (2.96 + CH) / 2, ZF - 0.45, {});
  box(0.6, 0.12, 0.7, 'stone', CX, CH + 0.06, ZF - 0.3, {r: 0.03});
  // заслонка: железная пластина въезжает в трубу
  const damper = box(0.34, 0.04, 0.05, 'iron', CX + 0.4, 3.35, ZF + 0.03, {cast: false});
  box(0.08, 0.08, 0.06, 'iron', CX + 0.62, 3.35, ZF + 0.03, {cast: false});
  // топка: поленья и огонь
  for (let i = 0; i < 3; i++) cyl(0.07, 0.07, 1.0, 'logs', 1.25, 0.84 + (i === 2 ? 0.1 : 0), ZF - 0.12 - (i % 2) * 0.12, {rot: [0, 0, Math.PI / 2 + (i - 1) * 0.12], seg: 7});
  const flames = []; for (let i = 0; i < 7; i++) flames.push(add(new THREE.ConeGeometry(0.07 + 0.03 * hash3(i, 1, 1), 0.34, 6), i % 2 ? 'fireC' : 'fireC2', 0.75 + i * 0.17, 1.02, ZF - 0.12, {mat: {emissive: 1, ei: 1.8}, cast: false}));
  // газы по лабиринту
  const segs = []; let L = 0; for (let i = 0; i < PATH.length - 1; i++) { const [a, b] = [PATH[i], PATH[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({a, b, l, s: L}); L += l; }
  const at = (u) => { const d = u * L; for (const s of segs) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return [lerp(s.a[0], s.b[0], k), lerp(s.a[1], s.b[1], k)]; } return PATH[PATH.length - 1]; };
  const hotC = new THREE.Color('#ff8a2a'), coolC = new THREE.Color('#8f8a86');
  const gas = []; for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({color: '#ff8a2a'})); m.renderOrder = 8; scene.add(m); gas.push(m); }
  // путь-подсказка «лабиринт»: жёлтая линия
  const mazeM = new THREE.MeshBasicMaterial({color: '#ffd23a', transparent: true, opacity: 0, depthWrite: false});
  { const pts = PATH.slice(0, PATH.length - 1).map(([x, y]) => new THREE.Vector3(x, y, ZF - 0.08)); pts.push(new THREE.Vector3(CX, 3.3, ZF - 0.08)); const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 80, 0.035, 5, false), mazeM); m.renderOrder = 9; scene.add(m); }
  // тепло в комнату: три мягкие стрелки влево
  const arrows = [];
  { const sh = new THREE.Shape(); sh.moveTo(-0.14, 0); sh.lineTo(0.14, 0); sh.lineTo(0.14, 0.55); sh.lineTo(0.32, 0.55); sh.lineTo(0, 0.92); sh.lineTo(-0.32, 0.55); sh.lineTo(-0.14, 0.55); sh.closePath(); const g = new THREE.ShapeGeometry(sh);
    for (const y of [1.2, 1.85, 2.5]) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#e8853f', transparent: true, opacity: 0, depthWrite: false})); m.rotation.z = Math.PI / 2; m.position.set(0, y, 0.05); m.renderOrder = 8; scene.add(m); arrows.push(m); } }
  const chimSmoke = smoke(CX, CH + 0.15, ZF - 0.3, 7, 0.9);

  // ── двор: поленница, колода с топором, санки, забор, баня, ели
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9 - r; i++) cyl(0.12, 0.12, 1.1, 'logs', -5.4 + i * 0.25 + r * 0.12, 0.13 + r * 0.22, -3.0, {rot: [Math.PI / 2, 0, 0], seg: 7});
  box(2.6, 0.08, 1.4, 'shingle', -4.4, 1.2, -3.0, {r: 0.02}); box(2.5, 0.1, 1.3, 'snow', -4.4, 1.3, -3.0, {r: 0.04, cast: false});
  cyl(0.28, 0.3, 0.5, 'logs', -6.6, 0.25, -1.6, {seg: 9}); { const m = box(0.06, 0.7, 0.06, 'wood', -6.5, 0.75, -1.6, {}); m.rotation.z = -0.5; box(0.25, 0.14, 0.03, 'iron', -6.35, 1.02, -1.6, {cast: false}); }
  { const x = 5.8, z = -2.3; box(1.1, 0.06, 0.45, 'red', x, 0.32, z, {r: 0.02}); for (const dz of [-0.2, 0.2]) box(1.2, 0.05, 0.05, 'dark', x, 0.18, z + dz, {}); }
  fence(K, S, -12, -6.4, -9.5, true); fence(K, S, 6.6, 12, -9.5, true);
  { const x = 9.5, z = -13; box(3, 2.2, 2.6, 'logW', x, 1.1, z, {}); ext([[-1.8, 2.2], [1.8, 2.2], [0, 3.4]], 'shingle', z - 1.5, 3.0, {x}); box(0.3, 0.9, 0.3, 'brick', x + 0.8, 3.1, z, {r: 0.03}); }
  { const r = rnd(9); for (let i = 0, n = 0; i < 200 && n < 22; i++) { const x = lerp(-36, 36, r()), z = lerp(-30, -11, r()); if (Math.abs(x) < 5 && z > -14 || Math.abs(x - 9.5) < 3 && Math.abs(z + 13) < 3) continue; fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.6, true); n++; } }
  for (const [x, z, rr] of [[-5.8, -1.2, 0.7], [5.0, -1.4, 0.6], [8.5, -2.2, 0.8]]) add(blob(rr, x * 3, 0.15, 1.2, 1.6, 0.5, 1.0), 'snow', x, S(x, z) + 0.05, z, {cast: false});
  const clouds = [cloud(sky, -14, 20, -40, 2.6, 51), cloud(sky, 10, 23, -48, 3.0, 52), cloud(sky, 26, 19, -36, 2.0, 53)];

  // q: fire 0..1, gas 0..1, heat 0..1, maze 0..1, damper 0..1, warm 0..1, clock 0..1 (≈ 16 ч)
  const animate = (q) => {
    const t = q.t, fr = sm(q.fire ?? 0), gs = sm(q.gas ?? 0), ht = sm(q.heat ?? 0), mz = sm(q.maze ?? 0), dp = sm(q.damper ?? 0), wm = sm(q.warm ?? 0), ck = q.clock ?? 0;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.06 * i); });
    flames.forEach((f, i) => { const s = fr * (0.8 + 0.25 * Math.sin(t * 8 + i * 1.9)); f.visible = fr > 0.02; f.scale.set(1, Math.max(0.01, s), 1); });
    brickM.emissiveIntensity = 0.3 * ht; brickM.color.set('#9a6e60').lerp(new THREE.Color('#c0603e'), ht);
    gas.forEach((m, i) => { const u = ((t * 0.16 + i / gas.length) % 1 + 1) % 1, [x, y] = at(u); m.position.set(x, y, ZF - 0.13); m.material.color.copy(hotC).lerp(coolC, Math.min(1, u * 1.25)); m.visible = gs * fr > 0.05 && !(dp > 0.5 && y > 3.3); });
    mazeM.opacity = 0.85 * mz;
    damper.position.x = CX + 0.4 - 0.4 * dp;
    arrows.forEach((m, i) => { const u = ((t * 0.3 + i * 0.33) % 1 + 1) % 1; m.position.x = 0.3 - u * 1.6; m.material.opacity = 0.75 * wm * Math.sin(Math.PI * u); m.visible = wm > 0.01; });
    hh.rotation.z = -ck * Math.PI * 2 * (16 / 12) - 1.0; mh.rotation.z = -ck * Math.PI * 2 * 16;
    chimSmoke(t, fr > 0.1 ? 1 : 0);
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
