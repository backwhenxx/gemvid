// @ts-nocheck
// Мир «Почему растут сосульки» (21.11): зимняя улица, два дома в разрезе (срез по z=0, как аквариум).
// Слева — тёплый чердак: тепло из комнат → кровля выше нуля → снег тает снизу → вода к свесу → сосульки и ледяной вал.
// Справа — «холодная крыша» соседа: толстый утеплитель на полу чердака, продухи, снег лежит, сосулек нет.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, fence, rnd, sm, lerp, hash3, vnoise} from '../kit';

export function S(x, z) {
  const flat = sm((Math.abs(z + 4) - 6) / 3);
  return (0.5 * sm((-z - 14) / 10) + 0.12 * Math.sin(x * 0.4 + z * 0.3)) * Math.max(flat, sm((-z - 12) / 4));
}
const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.3, (x) => S(x, 0) - 1.2 - 0.06 * Math.sin(x * 1.3), (x) => -3.6 + 0.25 * Math.sin(x * 0.4 + 1), (x) => -8 + 0.3 * Math.sin(x * 0.3), () => -30];
const LAYERS = ['snow', 'soil', 'clay', 'sand', 'rock'];
const HA = 3.0, OV = 1.0, KS = 0.85, YR = 6.0, TH = 0.25, ZF = -0.06, DEP = 8; // полуширина стен, свес, уклон, конёк, толщина кровли
const roofBot = (x) => YR - KS * Math.abs(x);
const roofTop = (x) => roofBot(x) + TH;
const XN = 14; // сосед
export const T = {
  attic: [0, 4.4, ZF], roof: [-1.6, roofTop(-1.6) + 0.3, ZF], out: [-6.5, 4.5, -2], eave: [-HA - OV + 0.2, roofBot(-HA - OV) - 0.6, -1],
  dam: [-HA - 0.6, roofTop(-HA - 0.6) + 0.45, ZF], stain: [-1.8, 3.15, -0.6], water: [-2.2, roofTop(-2.2) + 0.1, ZF],
  insul: [XN, 3.75, ZF], vent: [XN + HA + OV * 0.5, roofBot(HA + OV * 0.5) - 0.1, -1], nsnow: [XN + 1.6, roofTop(1.6) + 0.5, ZF],
  room: [0, 1.6, -4],
};
export const CAMS = {
  hook: {pos: [-8.2, 2.4, 6.5], look: [-4.3, 2.6, -2.2], fov: 40},
  hook2: {pos: [-7.4, 3.2, 9.5], look: [-3.6, 2.9, -2.4], fov: 40},
  house: {pos: [1.5, 3.8, 17], look: [0, 3.2, -2.5], fov: 40},
  attic: {pos: [0.8, 4.8, 10.5], look: [-0.4, 4.0, -2.5], fov: 40},
  slope: {pos: [-3.4, 5.0, 8.5], look: [-2.4, 4.2, -1.5], fov: 40},
  eave: {pos: [-7.0, 3.6, 8.2], look: [-3.9, 3.2, -1.8], fov: 40},
  stain: {pos: [-3.0, 2.2, 9.0], look: [-2.0, 3.0, -2.5], fov: 40},
  neigh: {pos: [XN + 1.5, 3.8, 17], look: [XN, 3.2, -2.5], fov: 40},
  both: {pos: [7, 5, 31], look: [7, 3.0, -3], fov: 40},
  cover: {pos: [-5.5, 3.6, 13], look: [-2.6, 3.3, -2.5], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {insul: '#e8c25a', iceWater: '#8fc4e6', stain: '#9a8a6e', shingle: '#6e4a3a', attic: '#c9b28e', inner: '#efe2cc', floorW: '#b48a5a'});
  const {add, box, cyl, blob, fir, cloud, smoke} = K;
  cutFace(K, LAYERS, (k, x) => B[k](x), -40, 40, []);
  ground(K, S, 'snow', -40, 40, -34, 0.9);
  hills(K, 'snow', -33.5, -80, (x, z) => S(x, -34) + 7 * sm((-z - 34) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -76, -170, (x, z) => 3 + 18 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0; i < 16; i++) { const x = lerp(-38, 38, r()), y = lerp(-7, -1.2, r()), rr = 0.2 + r() * 0.3; add(blob(rr, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); } }

  const ext = (pts, role, z0, depth, o = {}) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: false}); return add(g, role, o.x ?? 0, 0, z0, o); };
  const chevron = (y0, th, xa, xb) => [[-xa, y0(-xa)], [0, y0(0)], [xa, y0(xa)], [xa, y0(xa) + th], [0, y0(0) + th], [-xa, y0(-xa) + th]].map(([x, y]) => [x, y]);

  // дом в разрезе: всё вытянуто от z = ZF-DEP до ZF (срез чуть отодвинут от плоскости разреза земли)
  const mkHouse = (X, cold) => {
    const z0 = ZF - DEP, o = {x: X};
    box(2 * HA + 0.2, 0.42, DEP, 'stone', X, 0.23, ZF - DEP / 2, {r: 0.03});
    box(2 * HA - 0.5, 0.12, DEP - 0.3, 'floorW', X, 0.5, ZF - DEP / 2 - 0.15, {r: 0.01});
    for (const s of [-1, 1]) box(0.25, 2.8, DEP, 'wall', X + s * (HA - 0.125), 1.84, ZF - DEP / 2, {});
    box(2 * HA - 0.5, 2.8, 0.25, 'inner', X, 1.84, z0 + 0.125, {});
    box(2 * HA + 0.05, 0.25, DEP, 'wall', X, 3.33, ZF - DEP / 2, {});
    // фронтон сзади (закрывает чердак)
    ext([[-HA, 3.46], [HA, 3.46], [0, roofBot(0) - 0.02]], 'attic', z0, 0.2, o);
    // кровля и снег
    ext(chevron(roofBot, TH, HA + OV, 0), 'shingle', z0 - 0.3, DEP + 0.3, o);
    const snowY = (x) => roofTop(x) + (cold ? 0.03 : 0.12);
    ext(chevron(snowY, 0.42, HA + OV - 0.15, 0), 'snow', z0 - 0.25, DEP + 0.25, o);
    // свесы снизу — подшивка; у соседа — с продухами
    for (const s of [-1, 1]) { const m = box(OV, 0.06, DEP + 0.3, 'wood', X + s * (HA + OV / 2), roofBot(HA + OV / 2) - 0.32, ZF - DEP / 2 - 0.15, {}); if (cold) for (let k = 0; k < 6; k++) box(0.45, 0.04, 0.5, 'dark', X + s * (HA + OV / 2), roofBot(HA + OV / 2) - 0.36, ZF - 0.8 - k * 1.3, {r: 0.01, cast: false}); }
    if (cold) { box(0.5, 0.18, DEP + 0.2, 'dark', X, roofTop(0) + 0.5, ZF - DEP / 2 - 0.1, {r: 0.04}); box(2 * HA - 0.3, 0.5, DEP - 0.25, 'insul', X, 3.72, ZF - DEP / 2 - 0.1, {r: 0.05}); }
    for (const s of [-1, 1]) for (const z of [ZF - 2.4, ZF - 5.6]) { box(0.08, 1.25, 1.35, 'white', X + s * (HA + 0.03), 2.0, z, {}); box(0.06, 1.05, 1.15, 'glass', X + s * (HA + 0.07), 2.0, z, {mat: {emissive: 1, win: 1, ei: 0.9}, cast: false}); box(0.3, 0.07, 1.5, 'wood', X + s * (HA + 0.15), 1.36, z, {}); box(0.28, 0.06, 1.4, 'snow', X + s * (HA + 0.15), 1.42, z, {cast: false}); }
    // окно в задней стене, батарея, лампа, стол
    box(1.4, 1.2, 0.08, 'white', X - 0.6, 2.0, z0 + 0.3, {}); box(1.2, 1.0, 0.06, 'glass', X - 0.6, 2.0, z0 + 0.35, {mat: {emissive: 1, win: 1, ei: 0.9}, cast: false});
    for (let k = 0; k < 7; k++) box(0.12, 0.6, 0.14, 'white', X - 1.0 + k * 0.14, 0.95, z0 + 0.4, {r: 0.03});
    cyl(0.02, 0.02, 0.8, 'dark', X + 0.8, 2.82, ZF - 3.5, {seg: 4}); add(new THREE.SphereGeometry(0.2, 12, 8), 'lamp', X + 0.8, 2.35, ZF - 3.5, {mat: {emissive: 1, ei: 1.4}, cast: false});
    box(1.4, 0.08, 0.8, 'wood', X + 0.8, 1.25, ZF - 3.5, {}); for (const dx of [-0.6, 0.6]) box(0.08, 0.72, 0.6, 'wood', X + 0.8 + dx, 0.86, ZF - 3.5, {});
    // труба с дымом
    box(0.6, 2.6, 0.6, 'brick', X + 1.4, roofBot(1.4) + 0.9, ZF - 5.5, {r: 0.04}); box(0.75, 0.12, 0.75, 'stone', X + 1.4, roofBot(1.4) + 2.25, ZF - 5.5, {r: 0.04});
    return smoke(X + 1.4, roofBot(1.4) + 2.3, ZF - 5.5, 6, 0.9);
  };
  const smk = [mkHouse(0, false), mkHouse(XN, true)];

  // тёплый воздух на чердаке (только у левого дома)
  const warmMat = new THREE.MeshBasicMaterial({color: '#f0a35a', transparent: true, opacity: 0, depthWrite: false});
  { const sh = new THREE.Shape(); sh.moveTo(-HA + 0.25, 3.5); sh.lineTo(HA - 0.25, 3.5); sh.lineTo(HA - 0.25, roofBot(HA - 0.25) - 0.06); sh.lineTo(0, roofBot(0) - 0.08); sh.lineTo(-HA + 0.25, roofBot(-HA + 0.25) - 0.06); sh.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, {depth: DEP - 0.6, bevelEnabled: false}), warmMat); m.position.z = ZF - DEP + 0.25; m.renderOrder = 4; scene.add(m); }
  // стрелки тепла: три мягкие стрелки вверх
  const arrows = [];
  { const sh = new THREE.Shape(); sh.moveTo(-0.16, 0); sh.lineTo(0.16, 0); sh.lineTo(0.16, 0.7); sh.lineTo(0.38, 0.7); sh.lineTo(0, 1.15); sh.lineTo(-0.38, 0.7); sh.lineTo(-0.16, 0.7); sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    for (const x of [-1.6, 0, 1.6]) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#e8853f', transparent: true, opacity: 0, depthWrite: false})); m.position.set(x, 0, 0.05); m.renderOrder = 8; scene.add(m); arrows.push(m); } }
  // талая вода: синяя прослойка между кровлей и снегом слева + капли, бегущие к свесу
  const melt = [];
  for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(0, 0, 0); scene.add(g);
    const sh = new THREE.Shape(); const xa = s * 0.3, xb = s * (HA + OV - 0.2); sh.moveTo(xa, roofTop(xa) + 0.025); sh.lineTo(xb, roofTop(xb) + 0.025); sh.lineTo(xb, roofTop(xb) + 0.095); sh.lineTo(xa, roofTop(xa) + 0.095); sh.closePath();
    const m = add(new THREE.ExtrudeGeometry(sh, {depth: DEP, bevelEnabled: false}), 'iceWater', 0, 0, ZF - DEP, {parent: g, cast: false}); melt.push(g); }
  const drops = []; for (let i = 0; i < 10; i++) drops.push(add(new THREE.SphereGeometry(0.075, 8, 6), 'iceWater', 0, 0, 0.04, {cast: false}));
  // сосульки по обоим свесам левого дома
  const icicles = [];
  for (const s of [-1, 1]) for (let i = 0; i < 11; i++) {
    const z = ZF - 0.25 - i * 0.72, L = 0.7 + 0.9 * hash3(i, s, 7), x = s * (HA + OV - 0.12) + (hash3(i, s, 3) - 0.5) * 0.12;
    const g = new THREE.ConeGeometry(0.1 + 0.05 * hash3(i, s, 9), 1, 6); g.translate(0, -0.5, 0);
    const m = add(g, 'ice', x, roofBot(HA + OV) - 0.02, z, {rot: [0, 0, 0], cast: false}); m.userData.L = L; icicles.push(m);
  }
  const tipDrops = []; for (let i = 0; i < 4; i++) tipDrops.push(add(new THREE.SphereGeometry(0.06, 8, 6), 'iceWater', 0, 0, 0, {cast: false}));
  // ледяной вал у левого свеса + лужа за ним + пятно на потолке
  const dam = new THREE.Group(); scene.add(dam);
  { const xs = -HA - 0.55; for (let i = 0; i < 9; i++) add(blob(0.28, i + 30, 0.15, 1.3, 1.2, 0.7, 2.2), 'ice', xs, roofTop(xs) + 0.2, ZF - 0.5 - i * 0.9, {parent: dam, cast: false, rot: [Math.PI / 2, 0, 0]}); }
  const pool = new THREE.Group(); scene.add(pool);
  { const sh = new THREE.Shape(), xa = -HA - 0.35, xb = -HA + 0.9; sh.moveTo(xa, roofTop(xa) + 0.03); sh.lineTo(xb, roofTop(xb) + 0.03); sh.lineTo(xb, roofTop(xb) + 0.08); sh.lineTo(xa, roofTop(xa) + 0.4); sh.closePath();
    add(new THREE.ExtrudeGeometry(sh, {depth: DEP - 0.4, bevelEnabled: false}), 'iceWater', 0, 0, ZF - DEP + 0.2, {parent: pool, cast: false}); }
  const stain = box(1.4, 0.06, 1.0, 'stain', -1.8, 3.18, ZF - 0.55, {r: 0.02, cast: false});
  const leak = add(new THREE.SphereGeometry(0.07, 8, 6), 'iceWater', 0, 0, -3, {cast: false});

  // улица: ели в снегу, забор, фонарь, санки, сугробы
  { const r = rnd(9); for (let i = 0, n = 0; i < 200 && n < 26; i++) { const x = lerp(-36, 36, r()), z = lerp(-30, -11, r()); if (Math.abs(x) < 5 && z > -14 || Math.abs(x - XN) < 5 && z > -14) continue; fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.6, true); n++; } }
  fence(K, S, -12, -6.2, -9.5, true); fence(K, S, 6.5, 7.6, -9.5, true); fence(K, S, 20.3, 26, -9.5, true);
  { const x = 7, z = -1.8; cyl(0.06, 0.08, 3.6, 'dark', x, 1.8, z, {seg: 6}); box(0.5, 0.1, 0.12, 'dark', x - 0.2, 3.6, z, {}); add(new THREE.SphereGeometry(0.16, 10, 8), 'lamp', x - 0.42, 3.45, z, {mat: {emissive: 1, ei: 1.6}, cast: false}); }
  { const x = -7.2, z = -2.4; box(1.1, 0.06, 0.45, 'red', x, 0.32, z, {r: 0.02}); for (const dz of [-0.2, 0.2]) box(1.2, 0.05, 0.05, 'dark', x, 0.18, z + dz, {}); }
  for (const [x, z, r] of [[-5.6, -1.2, 0.7], [5.0, -1.4, 0.6], [9.5, -2.2, 0.8], [19, -1.5, 0.7]]) add(blob(r, x * 3, 0.15, 1.2, 1.6, 0.5, 1.0), 'snow', x, S(x, z) + 0.05, z, {cast: false});
  const clouds = [cloud(sky, -14, 20, -40, 2.6, 51), cloud(sky, 10, 23, -48, 3.0, 52), cloud(sky, 26, 19, -36, 2.0, 53)];

  // q: heat 0..1 тепло на чердак; melt 0..1 талая вода; ice 0..1 сосульки; dam 0..1 вал+лужа; leak 0..1 пятно
  const animate = (q) => {
    const t = q.t, heat = sm(q.heat ?? 0), mlt = sm(q.melt ?? 0), ic = q.ice ?? 0, dm = sm(q.dam ?? 0), lk = sm(q.leak ?? 0);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.06 * i); });
    smk.forEach((f) => f(t, 1));
    warmMat.opacity = 0.32 * heat;
    arrows.forEach((m, i) => { const u = ((t * 0.35 + i * 0.33) % 1 + 1) % 1; m.position.y = 1.4 + u * 2.6; m.material.opacity = 0.75 * heat * Math.sin(Math.PI * u); m.visible = heat > 0.01; });
    melt.forEach((g, i) => { g.visible = mlt > 0.01; g.scale.set(Math.max(0.001, mlt), 1, 1); });
    drops.forEach((m, i) => { const s = i % 2 ? 1 : -1, u = ((t * 0.22 + i * 0.19) % 1 + 1) % 1, x = s * lerp(0.5, HA + OV - 0.25, u); m.position.set(x, roofTop(x) + 0.06, 0.03); m.visible = mlt > 0.3; });
    icicles.forEach((m) => { const L = m.userData.L * sm(ic) + 0.001; m.scale.set(Math.max(0.2, sm(ic)), L, Math.max(0.2, sm(ic))); m.visible = ic > 0.01; });
    tipDrops.forEach((m, i) => { const s = i % 2 ? 1 : -1, u = ((t * 0.6 + i * 0.25) % 1 + 1) % 1, x = s * (HA + OV - 0.12), y0 = roofBot(HA + OV) - 1.4 * sm(ic); m.position.set(x, y0 - u * (y0 - 0.2), ZF - 0.25 - (i >> 1) * 1.44); m.visible = ic > 0.2 && mlt > 0.3 && u < 0.97; });
    dam.visible = dm > 0.01; dam.children.forEach((c) => c.scale.setScalar(Math.max(0.001, dm)));
    pool.visible = dm > 0.5;
    stain.visible = lk > 0.01; stain.scale.setScalar(Math.max(0.001, lk));
    { const u = ((t * 0.5) % 1 + 1) % 1, x = -HA + 0.4; leak.position.set(-1.8, lerp(3.1, 0.6, u), ZF - 0.55); leak.visible = lk > 0.05 && lk < 0.99 || (lk >= 0.99 && u < 0.9); }
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
