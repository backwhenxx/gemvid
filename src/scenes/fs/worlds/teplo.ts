// @ts-nocheck
// Мир «Тепловой насос из-под земли» (17.11): зимний участок, дом без дыма, соседский дом с дымящей трубой,
// разрез: снег, почва, глина, песок, водоносный слой, скала; скважина 100 м с петлёй, подвал с тепловым насосом и баком.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, house, fence, rnd, sm, lerp, hash3, vnoise} from '../kit';

export function S(x, z) {
  return 1.4 * sm((x - 3.4) / 5.5) + 1.3 * sm((-z - 7) / 9) + 0.9 * sm((-x - 7.5) / 8) * sm((-z - 1.5) / 6)
    + 0.07 * Math.sin(x * 1.3 + z * 0.7) * sm((-z - 1.2) / 3);
}
const BOT = -40;
const B = [
  (x) => S(x, 0),
  (x) => S(x, 0) - 0.3,
  (x) => S(x, 0) * 0.8 - 0.85 - 0.06 * Math.sin(x * 1.3),
  (x) => -4.0 + 0.3 * Math.sin(x * 0.42 + 1) + 0.12 * Math.sin(x * 1.1),
  (x) => -7.0 + 0.32 * Math.sin(x * 0.33 + 2.2),
  (x) => -10.3 + 0.26 * Math.sin(x * 0.45 + 0.5),
  (x) => -18.0 + 0.5 * Math.sin(x * 0.3 + 1.4),
  () => BOT,
];
const LAYERS = ['snow', 'soil', 'clay', 'sand', 'aquifer', 'rock', 'deep'];
export const WX = 2.5; // скважина
const LA = 2.27, LB = 2.73; // ветви петли: холодная вниз, тёплая вверх
const YA = -1.75, YB = -2.15; // горизонтальные трубы к подвалу
const YBOT = -28.2;


// точки для подписей (статичны — подписи считаются до постройки мира)
const nbChim = (() => { const v = new THREE.Vector3(1.35 * 0.85, 5.95 * 0.85, -0.7 * 0.85).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35); return [v.x - 12.5, v.y + S(-12.5, -12) - 0.05, v.z - 12]; })();
export const T = {
  therm: [-3.6 + 2.1, 2.0, -0.9], chimney: [-2.25, 5.95, -4.2], nbChim,
  frost: [-9, -1.0, 0.1], ten: [WX, -4.5, 0.1], loopBot: [WX, YBOT, 0.1], pump: [-2.75, -2.6, -1.05], tank: [-4.75, -2.2, -0.95], floor: [-3.6, -0.53, 0.1],
  borehole: [WX, -8, 0.1], house: [-3.6, 3.2, -1.0],
};

export const CAMS = {
  hook: {pos: [1.0, 3.2, 17.5], look: [-6.2, 2.6, -5], fov: 40},
  hook2: {pos: [2.4, 2.6, 15.5], look: [-3.4, 2.2, -3], fov: 40},
  wide: {pos: [7.6, 6.4, 33], look: [-0.15, -0.6, 0], fov: 40},
  mid: {pos: [4.4, 3.4, 27], look: [-0.2, -2.6, 0], fov: 40},
  frost: {pos: [3.6, 0.6, 22], look: [0.2, -3.2, 0], fov: 40},
  deep1: {pos: [6.2, -6, 19], look: [2.5, -9, 0], fov: 40},
  deep2: {pos: [6.0, -20, 18], look: [2.5, -22.5, 0], fov: 40},
  bottom: {pos: [5.4, -23.5, 14], look: [2.5, -26.2, 0], fov: 40},
  loop: {pos: [3.6, -1.4, 15], look: [0.2, -2.6, 0], fov: 40},
  cellar: {pos: [-1.2, -0.6, 12.5], look: [-3.4, -2.1, -1], fov: 40},
  pump: {pos: [-1.6, -1.4, 9.5], look: [-3.0, -2.2, -1.3], fov: 40},
  floor: {pos: [-0.2, 0.6, 15], look: [-3.4, -0.4, -1.5], fov: 40},
  house: {pos: [1.6, 2.4, 18], look: [-3.4, 0.9, -2], fov: 40},
  arrow: {pos: [6.5, -2.0, 30], look: [0.0, -6.0, 0], fov: 40},
  final: {pos: [8.8, 7.6, 36], look: [-1.0, 0.0, -2], fov: 40},
  cover: {pos: [5.2, 3.2, 24.5], look: [-1.2, -0.8, 0], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {grass: '#f4f6fa', hillMid: '#e6ecf3', hillFar: '#c9d6e6', soil: '#86634d', leafDark: '#3f8a6c'});
  const {add, box, cyl, blob, pipe, tree, fir, cloud, smoke} = K;
  const X0 = -40, X1 = 40, Z0 = -30;
  const HOLES = [{x0: -6.0, x1: -1.5, y0: -3.75, y1: -0.65}, {x0: 2.0, x1: 3.0, y0: YBOT - 0.5, y1: 5}];
  cutFace(K, LAYERS, (k, x) => B[k](x), X0, X1, HOLES);
  ground(K, S, 'snow', X0, X1, Z0);
  hills(K, 'hillMid', -29.5, -60, (x, z) => S(x, -30) - 0.3 + 6.5 * sm((-z - 30) / 24) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + 0.8 * vnoise(x * 0.15, 0, z * 0.15), 3);
  hills(K, 'hillFar', -56, -150, (x, z) => 3 + 13 * sm((-z - 56) / 50) * (0.55 + 0.45 * Math.sin(x * 0.045 + 2.5)) + 1.6 * vnoise(x * 0.08, 3, z * 0.08), 5);
  // дальний лес на холмах
  { const r = rnd(5); for (let i = 0; i < 46; i++) { const x = lerp(-60, 60, r()), z = lerp(-34, -52, r()); if (Math.abs(x + 15) < 6 && z > -38) continue; const y = S(x, -30) - 0.3 + 6.5 * sm((-z - 30) / 24) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)); fir(x, y - 0.3, z, 1.3 + r() * 0.9, true); } }

  // камни и галька на срезе (не в вырезах)
  {
    const r = rnd(7), inHole = (x, y, m) => HOLES.some((h) => x > h.x0 - m && x < h.x1 + m && y > h.y0 - m && y < h.y1 + m);
    let n = 0, g = 0;
    while (n < 30 && g++ < 800) { const x = lerp(-14, 14, r()), y = lerp(-6.8, -1.0, r()), rr = 0.16 + r() * 0.3; if (inHole(x, y, rr + 0.15) || y > B[2](x) - rr || y < B[4](x) + 0.2 || Math.abs(y - (YA + YB) / 2) < 0.6) continue; add(blob(rr, n * 3.1 + 1, 0.25, 1.3, 1.25, 0.8, 0.55), 'stone', x, y, 0, {rot: [0, 0, r() * 3], cast: false}); n++; }
    n = 0; g = 0;
    while (n < 70 && g++ < 1500) { const x = lerp(-14, 14, r()), y = lerp(-10.3, -6.8, r()), rr = 0.08 + r() * 0.12; if (inHole(x, y, rr + 0.08) || y > B[4](x) - rr || y < B[5](x) + rr) continue; add(blob(rr, n * 1.7 + 40, 0.2, 1.2, 1.2, 0.85, 0.5), 'pebble', x, y, 0, {cast: false}); n++; }
    // трещины и глыбы в скале
    n = 0; g = 0;
    while (n < 26 && g++ < 900) { const x = lerp(-12, 12, r()), y = lerp(-27.5, -11, r()), rr = 0.3 + r() * 0.5; if (inHole(x, y, rr + 0.2)) continue; add(blob(rr, n * 2.3 + 90, 0.3, 1.2, 1.5, 0.7, 0.4), n % 2 ? 'rock' : 'deep', x, y, 0.02, {rot: [0, 0, r() * 3], cast: false, mat: {}}); n++; }
  }

  // ── дом (тепловой насос — дыма нет) и соседний дом с дымом
  const HX = -3.6, HZ0 = -6.0, HZ1 = -1.0;
  const H = house(K, HX, HZ0, HZ1, {snow: true});
  // уличный термометр у окна
  box(0.2, 0.62, 0.05, 'white', HX + 2.1, 2.0, HZ1 + 0.05, {r: 0.02}); box(0.05, 0.42, 0.03, 'red', HX + 2.1, 1.92, HZ1 + 0.1, {r: 0.01, cast: false});
  const nb = new THREE.Group(); nb.position.set(-12.5, S(-12.5, -12) - 0.05, -12); nb.rotation.y = 0.35; nb.scale.setScalar(0.85); scene.add(nb);
  const H2 = house({...K, box: (...a) => K.box(...a.slice(0, 7), {...(a[7] || {}), parent: nb}), cyl: (...a) => K.cyl(...a.slice(0, 7), {...(a[7] || {}), parent: nb}), add: (g, r, x, y, z, o = {}) => K.add(g, r, x, y, z, {...o, parent: nb})}, 0, -2.5, 2.5, {snow: true, wall: 'brick'});
  const chim = new THREE.Vector3(...H2.chimney); nb.localToWorld(chim);
  const smokeN = smoke(chim.x, chim.y + 0.1, chim.z, 7, 1.1);
  const smokeOwn = smoke(H.chimney[0], H.chimney[1] + 0.1, H.chimney[2], 6, 1.0);

  // ── подвал: стены, полки с банками, бак, тепловой насос, лестница, лампа
  const cel = {};
  {
    const x0 = -6.0, x1 = -1.5, yf = -3.5, yc = -0.9, zb = -3.6, f = 0.03;
    box(0.25, 3.1, 3.88, 'brick', x0 + 0.125, -2.2, (zb - 0.25 + f) / 2, {r: 0.02});
    box(0.25, 3.1, 3.88, 'brick', x1 - 0.125, -2.2, (zb - 0.25 + f) / 2, {r: 0.02});
    box(4.5, 0.25, 3.88, 'stone', (x0 + x1) / 2, yf - 0.125, (zb - 0.25 + f) / 2, {r: 0.02});
    box(4.5, 0.25, 3.88, 'concrete', (x0 + x1) / 2, yc + 0.125, (zb - 0.25 + f) / 2, {r: 0.02});
    // тёплый пол: стяжка над потолком подвала с рядом труб в разрезе
    box(4.5, 0.18, 3.88, 'concrete', (x0 + x1) / 2, yc + 0.25 + 0.03 + 0.09, (zb - 0.25 + f) / 2, {r: 0.02});
    cel.floorPipes = [];
    for (let x = -5.6; x <= -1.9; x += 0.37) cel.floorPipes.push(cyl(0.045, 0.045, 3.6, 'cold', x, yc + 0.37, -1.75, {rot: [Math.PI / 2, 0, 0], seg: 8, cast: false, mat: {emissive: 1, ei: 0.0}}));
    box(4.0, 2.6, 0.25, 'brick', (x0 + x1) / 2 - 0.0, (yf + yc) / 2, zb - 0.125, {r: 0.02});
    for (const y of [-2.45, -1.75]) box(2.2, 0.09, 0.5, 'wood', -4.6, y, zb + 0.3);
    for (const x of [-5.6, -3.6]) box(0.09, 1.6, 0.45, 'wood', x, -2.55, zb + 0.3);
    const jars = ['jarA', 'jarB', 'jarC'];
    for (let s = 0; s < 2; s++) for (let i = 0; i < 5; i++) { const x = -5.3 + i * 0.36, y = (s ? -1.75 : -2.45) + 0.045; cyl(0.13, 0.13, 0.3, jars[(i + s) % 3], x, y + 0.15, zb + 0.3, {seg: 10}); cyl(0.1, 0.1, 0.05, 'metal', x, y + 0.325, zb + 0.3, {seg: 10}); }
    // бак горячей воды
    cyl(0.4, 0.4, 1.7, 'white', -4.75, yf + 0.88, -1.35, {seg: 12});
    cyl(0.41, 0.41, 0.12, 'red', -4.75, yf + 1.5, -1.35, {seg: 12});
    cyl(0.3, 0.38, 0.12, 'white', -4.75, yf + 1.78, -1.35, {seg: 12});
    // тепловой насос: шкаф с экраном и решёткой
    const pX = -2.75, pZ = -1.4, pW = 0.95, pH = 1.5, pD = 0.7;
    box(pW, pH, pD, 'white', pX, yf + pH / 2 + 0.02, pZ, {r: 0.05});
    box(pW + 0.04, 0.08, pD + 0.04, 'dark', pX, yf + 0.06, pZ, {r: 0.02});
    cel.screen = box(0.36, 0.2, 0.04, 'cold', pX + 0.15, yf + 1.22, pZ + pD / 2 + 0.03, {r: 0.02, cast: false, mat: {emissive: 1, ei: 1.1}});
    cel.heart = box(0.56, 0.5, 0.04, 'dark', pX, yf + 0.62, pZ + pD / 2 + 0.03, {r: 0.04, cast: false});
    cel.glow = box(0.44, 0.38, 0.03, 'hot', pX, yf + 0.62, pZ + pD / 2 + 0.065, {r: 0.04, cast: false, mat: {emissive: 1, ei: 1.4}});
    cel.glow.visible = false;
    for (let i = 0; i < 3; i++) box(0.5, 0.035, 0.03, 'metal', pX, yf + 0.95 + i * 0.07, pZ + pD / 2 + 0.03, {r: 0.01, cast: false});
    cel.pump = [pX, yf + 0.9, pZ + pD / 2];
    // трубы: петля из скважины → насос; насос → бак; бак → тёплый пол
    cel.loopA = pipe([[LA, YA, 0], [-1.3, YA, 0], [-2.0, YA, 0], [-2.0, YA, pZ + 0.1], [pX + pW / 2 + 0.02, YA, pZ + 0.1]], 0.075, 'cold', {bend: 0.2, cast: false});
    cel.loopB = pipe([[LB, YB, 0], [-1.3, YB, 0], [-2.15, YB, 0], [-2.15, YB, pZ - 0.15], [pX + pW / 2 + 0.02, YB, pZ - 0.15]], 0.075, 'warm', {bend: 0.2, cast: false});
    cel.hotPipe = pipe([[pX - pW / 2 - 0.02, yf + 1.1, pZ], [-4.2, yf + 1.1, pZ], [-4.2, yf + 1.1, -1.35], [-4.36, yf + 1.1, -1.35]], 0.06, 'metal', {bend: 0.15, cast: false, mat: {emissive: 1, ei: 0}});
    cel.upPipe = pipe([[-4.75, yf + 1.84, -1.35], [-4.75, yc - 0.05, -1.35], [-4.75, yc + 0.37, -1.35]], 0.06, 'metal', {bend: 0.1, cast: false, mat: {emissive: 1, ei: 0}});
    // ящики и лестница
    for (const [cx, cz, w, h] of [[-3.75, -0.55, 0.7, 0.5]]) { box(w, h, w * 0.85, 'wood', cx, yf + h / 2, cz, {r: 0.02}); box(w + 0.04, 0.08, w * 0.85 + 0.04, 'woodDark', cx, yf + h * 0.72, cz, {r: 0.01}); }
    const la = new THREE.Group(); la.position.set(-5.55, yf, -0.7); la.rotation.z = -0.18; scene.add(la);
    for (const s of [-1, 1]) box(0.08, 2.85, 0.08, 'wood', 0, 1.42, s * 0.28, {parent: la});
    for (let i = 0; i < 6; i++) box(0.06, 0.06, 0.6, 'wood', 0, 0.35 + i * 0.44, 0, {parent: la});
    cyl(0.012, 0.012, 0.45, 'woodDark', -3.6, yc - 0.22, -1.9, {seg: 4, cast: false});
    cyl(0.06, 0.24, 0.2, 'metal', -3.6, yc - 0.52, -1.9, {seg: 10, cast: false});
    add(new THREE.SphereGeometry(0.09, 8, 6), 'lamp', -3.6, yc - 0.64, -1.9, {mat: {emissive: 1, ei: 1.2}, cast: false});
    const pl = new THREE.PointLight(0xffc070, 1, 7, 2); pl.userData.base = 9; pl.position.set(-3.6, yc - 0.8, -1.9); scene.add(pl); K.lamps.push(pl);
  }

  // ── скважина: обсадная труба (половина, открыта к зрителю), петля, оголовок
  const wl = {};
  {
    const top = S(WX, 0) - 0.05, H_ = top - (YBOT - 0.3);
    cyl(0.5, 0.5, H_, 'casing', WX, (top + YBOT - 0.3) / 2, 0, {open: true, ts: Math.PI / 2, tl: Math.PI, mat: {side: THREE.DoubleSide, smooth: true}, seg: 12});
    box(1.0, 0.12, 0.6, 'dark', WX, YBOT - 0.42, -0.25, {r: 0.02});
    // оголовок над землёй со снежной шапкой
    cyl(0.34, 0.34, 0.45, 'metal', WX, S(WX, -0.4) + 0.2, -0.45, {seg: 12});
    cyl(0.36, 0.33, 0.12, 'snow', WX, S(WX, -0.4) + 0.5, -0.45, {seg: 12, cast: false});
    // ветви петли в стволе (тянутся вниз — dyn: «опускаем петлю»)
    wl.legA = cyl(0.1, 0.1, 1, 'cold', LA, 0, -0.08, {seg: 8, cast: false});
    wl.legB = cyl(0.1, 0.1, 1, 'warm', LB, 0, -0.08, {seg: 8, cast: false});
    wl.u = add(new THREE.TorusGeometry((LB - LA) / 2, 0.1, 6, 12, Math.PI), 'cold', WX, 0, -0.08, {rot: [0, 0, Math.PI], cast: false});
    for (let y = -2; y > YBOT; y -= 2) box(y % 10 === 0 ? 0.5 : 0.28, 0.07, 0.06, 'white', WX + 0.68 + (y % 10 === 0 ? 0.11 : 0), y, 0.05, {r: 0.02, cast: false});
    wl.weight = box(0.34, 0.5, 0.2, 'metal', WX, 0, -0.08, {r: 0.03, cast: false});
  }

  // ── бусины «незамерзайки»: бегут по петле (холодные синие → тёплые оранжевые)
  const beadPath = new THREE.CurvePath();
  {
    const V = (x, y, z = 0.03) => new THREE.Vector3(x, y, z);
    const seg = (a, b) => beadPath.add(new THREE.LineCurve3(a, b));
    seg(V(-1.5, YA), V(LA - 0.2, YA)); beadPath.add(new THREE.QuadraticBezierCurve3(V(LA - 0.2, YA), V(LA, YA), V(LA, YA - 0.2)));
    seg(V(LA, YA - 0.2), V(LA, YBOT)); beadPath.add(new THREE.QuadraticBezierCurve3(V(LA, YBOT), V(WX, YBOT - 0.28), V(LB, YBOT)));
    seg(V(LB, YBOT), V(LB, YB - 0.2)); beadPath.add(new THREE.QuadraticBezierCurve3(V(LB, YB - 0.2), V(LB, YB), V(LB - 0.2, YB)));
    seg(V(LB - 0.2, YB), V(-1.5, YB));
  }
  const BL = beadPath.getLength(), NB = 110;
  const beadMatC = K.M('cold', {emissive: 1, ei: 0.5}), beadMatW = K.M('warm', {emissive: 1, ei: 0.5});
  const beads = []; const bg = new THREE.IcosahedronGeometry(0.085, 0);
  for (let i = 0; i < NB; i++) { const m = new THREE.Mesh(bg, beadMatC); m.castShadow = false; m.visible = false; scene.add(m); beads.push(m); }
  const iBot = (() => { let acc = 0; for (let i = 0; i < beadPath.curves.length; i++) { const L = beadPath.curves[i].getLength(); if (i === 3) return (acc + L / 2) / BL; acc += L; } return 0.5; })();

  // ── морозный слой у поверхности (полупрозрачный, перед срезом)
  const frost = (() => {
    const P = [], I = []; let n = 0;
    for (let x = -14; x <= 14.001; x += 0.5) { P.push(x, B[1](x) + 0.02, 0.06, x, -1.6 + 0.12 * Math.sin(x * 0.8), 0.06); }
    n = P.length / 6; for (let i = 0; i < n - 1; i++) { const xm = -14 + i * 0.5 + 0.25; if ((xm > -6.1 && xm < -1.4) || (xm > 1.9 && xm < 3.1)) continue; const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({color: '#cfe6ff', transparent: true, opacity: 0, depthWrite: false}); const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 3; scene.add(mesh); return mesh;
  })();
  // тёплая глубина: мягкая тёплая вуаль ниже 4 м
  const warmZone = (() => {
    const g = new THREE.PlaneGeometry(28, 24); const m = new THREE.MeshBasicMaterial({color: '#ffcf8a', transparent: true, opacity: 0, depthWrite: false});
    const mesh = new THREE.Mesh(g, m); mesh.position.set(0, -16, 0.05); mesh.renderOrder = 2; scene.add(mesh); return mesh;
  })();

  // ── большая тёплая стрелка: из глубины по петле в дом
  const arrow = (() => {
    const c = new THREE.CatmullRomCurve3([[3.6, -24, 0.6], [3.8, -12, 0.6], [3.4, -4, 0.6], [1.4, -1.0, 0.7], [-1.6, -0.4, 0.8], [-3.2, 1.2, 0.9]].map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(c, 120, 0.22, 8); const m = K.M('warm', {emissive: 1, ei: 0.6, water: 1, opacity: 0.9});
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 4; scene.add(mesh);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 10), m); head.renderOrder = 4; scene.add(head);
    return {mesh, head, c, n: g.index.count};
  })();

  // ── снаружи: большое голое дерево с корнями, ели, кусты-сугробы, забор, санки, почтовый ящик
  const big = tree(5.6, S(5.6, -0.9) - 0.05, -0.9, 3.4, 1.4, 11, {bare: true, snow: true});
  for (const [dx, dy, bend] of [[-1.5, -2.2, 0.4], [-0.5, -3.0, -0.3], [0.7, -2.7, 0.35], [1.7, -1.8, -0.4]]) {
    const x = 5.6, y0 = S(5.6, 0);
    K.tube([[x, y0, 0.02], [x + dx * 0.35 + bend * 0.3, y0 + dy * 0.35, 0.02], [x + dx * 0.75 - bend * 0.25, y0 + dy * 0.75, 0.02], [x + dx, y0 + dy, 0.02]], 0.055, 'trunk', {cast: false, rs: 5, n: 12});
  }
  cyl(0.42, 0.5, 0.5, 'trunk', 5.6, S(5.6, -0.45) - 0.2, -0.45, {seg: 9});
  for (const [x, z, s] of [[-7.2, -3.0, 1.25], [-10.2, -4.6, 1.5], [8.6, -5.5, 1.3], [-10.6, -7.6, 1.5], [11.8, -10.5, 1.5], [0.6, -9.5, 1.4], [4.4, -12, 1.6], [-3, -14.5, 1.5], [9.5, -8.2, 1.2], [-17, -10, 1.7], [13.5, -14, 1.6], [-22, -20, 1.9], [-12.5, -18, 1.4]]) fir(x, S(x, z) - 0.05, z, s, true);
  tree(-8.2, S(-8.2, -7.6) - 0.05, -7.6, 2.6, 1.0, 21, {bare: true, snow: true});
  for (const [x, z, r, s] of [[-0.55, -1.3, 0.55, 31], [-6.55, -0.9, 0.5, 32], [0.3, -1.9, 0.4, 33], [3.9, -2.2, 0.55, 34], [6.9, -2.6, 0.6, 35], [-1.9, -0.55, 0.45, 36]])
    add(blob(r, s, 0.18, 1.7, 1.3, 0.62, 1), 'snow', x, S(x, z) + r * 0.25, z, {cast: false});
  fence(K, S, -0.4, 7.3, -5.2, true);
  // санки у крыльца
  { const sx = -0.4, sz = -0.35, y = S(sx, sz) + 0.12; box(0.95, 0.06, 0.48, 'red', sx, y + 0.18, sz, {r: 0.02}); for (const s of [-1, 1]) box(1.05, 0.05, 0.05, 'metal', sx, y + 0.02, sz + s * 0.2, {r: 0.02}); for (const s of [-1, 1]) for (const d of [-0.32, 0.32]) box(0.04, 0.16, 0.04, 'metal', sx + d, y + 0.1, sz + s * 0.2, {r: 0.01}); }
  // почтовый ящик
  { const mx = 1.1, mz = -0.55; box(0.08, 1.1, 0.08, 'woodDark', mx, S(mx, mz) + 0.55, mz, {r: 0.02}); box(0.36, 0.3, 0.5, 'shutter', mx, S(mx, mz) + 1.2, mz, {r: 0.05}); box(0.38, 0.06, 0.52, 'snow', mx, S(mx, mz) + 1.38, mz, {r: 0.03, cast: false}); }
  // дорожка из следов-плит к двери
  for (const [x, z] of [[-4.6, -0.45], [-3.5, -0.42], [-2.3, -0.5], [-1.1, -0.4], [0.1, -0.5]]) add(blob(0.3, x * 3, 0.15, 1.5, 1.2, 0.18, 0.9), 'snowShade', x, S(x, z) + 0.05, z, {cast: false});

  // облака (в небе) и снегопад
  const clouds = [cloud(sky, -5.2, 11.4, -16, 1.5, 51), cloud(sky, 6.0, 14.6, -24, 1.8, 52), cloud(sky, 8.8, 9.4, -14, 0.9, 53), cloud(sky, -10, 15.5, -34, 2.2, 54), cloud(sky, -0.5, 9.0, -40, 1.4, 55)];
  const flakes = []; { const fg = new THREE.IcosahedronGeometry(0.055, 0), fm = K.M('white', {emissive: 1, ei: 0.35}); const r = rnd(77); for (let i = 0; i < 220; i++) { const m = new THREE.Mesh(fg, fm); m.userData.p = [lerp(-13, 13, r()), r(), lerp(-12, 4, r()), r() * 6.28]; m.castShadow = false; scene.add(m); flakes.push(m); } }

  const v = new THREE.Vector3();
  // q — параметры кадра (из сцены): t — секунды; loop 0..1 — петля опускается; flow 0..1 — течёт; frost, warm 0..1; pump 0..1 — насос сжимает;
  // floor 0..1 — тёплый пол; arrow 0..1 — стрелка растёт; snow 0..1 — снегопад; smoke 0..1 — дым соседа; own 0..1 — дым из своей трубы
  const animate = (q) => {
    const t = q.t;
    smokeN(t, q.smoke ?? 1); smokeOwn(t, q.own ?? 0);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.2 + 0.06 * i); });
    // петля: нижняя точка опускается от поверхности до дна
    const lp = q.loop ?? 1, yb = lerp(YA - 0.3, YBOT, lp);
    for (const [m, y0] of [[wl.legA, YA], [wl.legB, YB]]) { const h = Math.max(0.01, y0 - yb); m.scale.y = h; m.position.y = (y0 + yb) / 2; }
    wl.u.position.y = yb; wl.weight.position.y = yb - 0.42;
    // бусины
    const fl = q.flow ?? 0;
    beads.forEach((m, i) => {
      if (fl <= 0.001 || lp < 0.999) { m.visible = false; return; }
      const u = ((i / NB + t * 0.012) % 1 + 1) % 1; beadPath.getPointAt(u, v); m.position.copy(v);
      m.material = u > iBot ? beadMatW : beadMatC; m.visible = i / NB < fl; m.rotation.set(t * 2 + i, i, 0);
    });
    frost.material.opacity = 0.42 * (q.frost ?? 0);
    warmZone.material.opacity = 0.16 * (q.warm ?? 0);
    // насос: сердце светится, горячая труба и тёплый пол краснеют
    const pu = q.pump ?? 0; cel.glow.visible = pu > 0.01; cel.glow.scale.setScalar(0.6 + 0.4 * pu * (0.85 + 0.15 * Math.sin(t * 6)));
    cel.hotPipe.material.emissive.set('#ff7a30'); cel.hotPipe.material.emissiveIntensity = 0.9 * pu; cel.upPipe.material.emissive.set('#ff7a30'); cel.upPipe.material.emissiveIntensity = 0.9 * (q.floor ?? 0);
    cel.floorPipes.forEach((m) => { m.material.emissive.set('#ff8a3c'); m.material.emissiveIntensity = 1.2 * (q.floor ?? 0); });
    // стрелка
    const ar = q.arrow ?? 0; arrow.mesh.visible = arrow.head.visible = ar > 0.01;
    arrow.mesh.geometry.setDrawRange(0, Math.floor(arrow.n * ar / 6) * 6);
    if (ar > 0.01) { const u = Math.min(0.999, ar); arrow.c.getPointAt(u, v); arrow.head.position.copy(v); const tg = arrow.c.getTangentAt(u); arrow.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg); }
    // снег
    const sn = q.snow ?? 0;
    flakes.forEach((m, i) => {
      const [x0, ph, z, a] = m.userData.p, top = 12, y = top - (((ph * 13 + t * 0.9) % 13 + 13) % 13);
      const x = x0 + 0.4 * Math.sin(t * 0.7 + a), floor = z > 0 ? S(x, 0) + 0.3 : S(x, z);
      m.position.set(x, y, z); m.visible = i / flakes.length < sn && y > floor + 0.05;
    });
  };
  animate({t: 0});

  return {animate, T, wins: K.wins, lamps: K.lamps};
}
