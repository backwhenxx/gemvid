// @ts-nocheck
// Мир «Пруд на песке и глиняный замок» (18.11): дачный участок, пруд-чаша у края разреза (срез проходит через середину пруда),
// под газоном толстый песок, ниже — грунтовая вода, глина, камень. Вода уходит каплями вниз; глиняный слой на дне её держит.
import * as THREE from 'three';
import {makeKit, cutFace, hills, house, fence, rnd, sm, lerp, hash3, vnoise} from '../kit';

const PA = 3.2, PB = 2.6, PD = 1.3; // полуоси пруда по x и z, глубина
export const pondR2 = (x, z) => (x / PA) ** 2 + (z / PB) ** 2;
const base = (x, z) => 0.9 * sm((x - 6) / 6) + 1.2 * sm((-z - 8) / 9) + 0.8 * sm((-x - 9) / 8) * sm((-z - 2) / 6) + 0.05 * Math.sin(x * 1.3 + z * 0.7) * sm((-z - 3.2) / 3);
export function S(x, z) { const r2 = pondR2(x, z); return base(x, z) - (r2 < 1 ? PD * (1 - r2) ** 0.8 : 0) + (r2 >= 1 && r2 < 1.25 ? 0.08 * Math.sin((r2 - 1) / 0.25 * Math.PI) : 0); }
const inPond = (x) => (x / PA) ** 2 < 1;
const BOT = -14;
const B = [
  (x) => S(x, 0),
  (x) => S(x, 0) - (inPond(x) ? 0.0 : 0.22),
  (x) => S(x, 0) - (inPond(x) ? 0.0 : 0.55),
  (x) => -3.6 + 0.12 * Math.sin(x * 0.6 + 1),
  (x) => -5.6 + 0.25 * Math.sin(x * 0.4 + 2),
  (x) => -9.5 + 0.3 * Math.sin(x * 0.33 + 1),
  () => BOT,
];
const LAYERS = ['grass', 'soil', 'sand', 'wetSand', 'clay', 'rock'];
const LINE = 0.3; // толщина глиняного замка (условно)

export const T = {
  pond: [0, -0.6, -1.0], sand: [-6, -2.2, 0.05], table: [-6, -3.6, 0.05], lining: [1.6, -1.05, 0.05], bottom: [0, -1.3, 0.05], wet: [0, -2.6, 0.05],
};
export const CAMS = {
  hook: {pos: [5.2, 3.2, 10.5], look: [0.0, -0.5, -1.2], fov: 40},
  hook2: {pos: [3.8, 1.6, 9.5], look: [0.0, -1.2, -0.4], fov: 40},
  cut: {pos: [3.0, 0.4, 15.5], look: [-0.4, -2.2, 0], fov: 40},
  sand: {pos: [1.4, -1.0, 8.6], look: [0.2, -2.0, 0], fov: 40},
  clay: {pos: [4.2, 2.4, 9.0], look: [0.4, -0.8, -1.0], fov: 40},
  close: {pos: [2.4, -0.2, 7.0], look: [1.2, -1.0, 0], fov: 40},
  wide: {pos: [7.5, 5.0, 22], look: [-0.5, -0.6, -2], fov: 40},
  final: {pos: [9, 6.2, 27], look: [-1.0, 0.0, -3], fov: 40},
  cover: {pos: [4.6, 2.2, 10.5], look: [0.0, -0.9, -0.8], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {grass: '#8fc35c', soil: '#7d5a44', sand: '#f0d496', wetSand: '#b9b6a6', clay: '#c26e48', rock: '#8a8fa6', leaf: '#5aa456', leaf2: '#8cc762'});
  const {add, box, cyl, blob, tree, fir, cloud} = K;
  const X0 = -40, X1 = 40, Z0 = -30;
  cutFace(K, LAYERS, (k, x) => B[k](x), X0, X1, [], 0, 0.1);

  // земля: сетка с цветами вершин (трава снаружи, песок/глина в чаше пруда)
  const cGrass = new THREE.Color('#8fc35c'), cSand = new THREE.Color('#e9c98a'), cClay = new THREE.Color('#b8653f'), tmp = new THREE.Color();
  const gnd = (() => {
    const P = [], I = [], inside = [];
    const xs = [], zs = [];
    for (let x = X0; x <= X1 + 1e-6; x += x > -5 && x < 5 ? 0.3 : 0.9) xs.push(x);
    for (let z = 0; z >= Z0 - 1e-6; z -= z > -4 ? 0.3 : 0.9) zs.push(z);
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) {
      let x = xs[i], z = zs[j];
      if (j > 0 && i > 0 && i < xs.length - 1) { x += (hash3(i, j, 1) - 0.5) * 0.12; z += (hash3(i, j, 2) - 0.5) * 0.12; }
      P.push(x, S(x, z), z); inside.push(pondR2(x, z) < 1.02);
    }
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
    const col = new Float32Array(P.length); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1})); m.receiveShadow = true; scene.add(m);
    let last = -1;
    const paint = (c) => { if (Math.abs(c - last) < 0.004) return; last = c; for (let i = 0; i < inside.length; i++) { (inside[i] ? tmp.copy(cSand).lerp(cClay, c) : tmp.copy(cGrass)).toArray(col, i * 3); } g.attributes.color.needsUpdate = true; };
    paint(0);
    return {paint};
  })();
  hills(K, 'hillMid', -29.5, -60, (x, z) => base(x, -30) - 0.3 + 6 * sm((-z - 30) / 24) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + 0.8 * vnoise(x * 0.15, 0, z * 0.15), 3);
  hills(K, 'hillFar', -56, -150, (x, z) => 3 + 13 * sm((-z - 56) / 50) * (0.55 + 0.45 * Math.sin(x * 0.045 + 2.5)) + 1.6 * vnoise(x * 0.08, 3, z * 0.08), 5);

  // галька в песке, камни в глине
  {
    const r = rnd(13);
    for (let i = 0, n = 0; i < 1500 && n < 90; i++) { const x = lerp(-14, 14, r()), y = lerp(-3.5, -0.7, r()), rr = 0.05 + r() * 0.07; if (y > B[2](x) - rr - 0.05 || (inPond(x) && y > S(x, 0) - LINE - 0.1)) continue; add(blob(rr, n * 1.7 + 40, 0.22, 1.2, 1.2, 0.85, 0.5, 0), n % 3 ? 'pebble' : 'stone', x, y, 0, {cast: false}); n++; }
    for (let i = 0, n = 0; i < 600 && n < 22; i++) { const x = lerp(-14, 14, r()), y = lerp(-9, -6.2, r()), rr = 0.2 + r() * 0.3; add(blob(rr, n * 3 + 1, 0.25, 1.3, 1.25, 0.8, 0.5), 'stone', x, y, 0, {cast: false, rot: [0, 0, r() * 3]}); n++; }
  }

  // ── вода в пруду: поверхность (полуэллипс) + профиль на срезе; глиняный слой на срезе; мокрый песок под прудом
  const xsP = []; for (let x = -PA; x <= PA + 1e-6; x += 0.1) xsP.push(x);
  const strip = (color, op, ro, z) => {
    const P = new Float32Array(xsP.length * 6), I = [];
    for (let i = 0; i < xsP.length - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color, transparent: op < 1, opacity: op, depthWrite: false})); m.renderOrder = ro; m.frustumCulled = false; scene.add(m);
    const set = (top, bot) => { xsP.forEach((x, i) => { const t = top(x), b = bot(x); P.set([x, Math.max(t, b), z, x, b, z], i * 6); }); g.attributes.position.needsUpdate = true; };
    return {m, set};
  };
  const waterCut = strip('#3f95dd', 0.85, 6, 0.04);
  const liningCut = strip('#a8583a', 1, 5, 0.03);
  const wetCut = (() => { // мокрый «язык» под прудом
    const P = new Float32Array(41 * 6), I = []; for (let i = 0; i < 40; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#5d8fc0', transparent: true, opacity: 0.4, depthWrite: false})); m.renderOrder = 4; m.frustumCulled = false; scene.add(m);
    const set = (w) => { for (let i = 0; i <= 40; i++) { const x = lerp(-PA * 0.85, PA * 0.85, i / 40), top = S(x, 0) - 0.02, depth = top - (top - B[3](x)) * w * (0.7 + 0.3 * Math.cos((i / 40 - 0.5) * Math.PI)); P.set([x, top, 0.035, x, Math.min(top, depth), 0.035], i * 6); } g.attributes.position.needsUpdate = true; m.visible = w > 0.01; };
    return {set};
  })();
  const wMat = new THREE.MeshStandardMaterial({color: '#4a9fe0', transparent: true, opacity: 0.85, roughness: 0.25, depthWrite: false});
  const wTop = new THREE.Mesh(new THREE.CircleGeometry(1, 40, 0, Math.PI), wMat); wTop.geometry.rotateX(-Math.PI / 2); wTop.renderOrder = 6; scene.add(wTop);
  // кувшинки и камыш
  const lilies = []; { const r = rnd(21); for (let i = 0; i < 7; i++) { const a = r() * Math.PI, rr = 0.25 + r() * 0.5; const g = new THREE.Group(); scene.add(g);
    add(new THREE.CylinderGeometry(0.22 + r() * 0.08, 0.22, 0.02, 9, 1, false, 0.3, Math.PI * 1.8), 'leafDark', 0, 0, 0, {parent: g, cast: false});
    if (i % 3 === 0) add(new THREE.ConeGeometry(0.08, 0.12, 6), 'white', 0.04, 0.06, 0.02, {parent: g, cast: false});
    g.userData.p = [Math.cos(a) * rr, -Math.sin(a) * rr * 0.9 - 0.15]; lilies.push(g); } }
  { const r = rnd(33); for (let i = 0; i < 16; i++) { const a = Math.PI * (0.05 + 0.9 * r()), x = Math.cos(a) * PA * 1.03, z = -Math.sin(a) * PB * 1.03; if (z > -0.4) continue; add(new THREE.ConeGeometry(0.045, 0.9 + r() * 0.5, 4), 'leaf', x, S(x, z) + 0.45, z, {cast: false, rot: [(r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.25]}); } }
  // камни по краю
  { const r = rnd(44); for (let i = 0; i < 18; i++) { const a = Math.PI * (i + 0.5) / 18, x = Math.cos(a) * PA * 1.12, z = -Math.sin(a) * PB * 1.12; if (z > -0.25) continue; add(blob(0.16 + r() * 0.1, i + 70, 0.25, 1.3, 1.3, 0.6, 1.0, 0), 'stone', x, S(x, z) + 0.05, z, {cast: false}); } }
  // капли, уходящие вниз сквозь песок
  const drops = []; { const dg = new THREE.IcosahedronGeometry(0.07, 0), dm = K.M('water', {emissive: 1, ei: 0.25}); const r = rnd(55); for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(dg, dm); m.userData.p = [lerp(-PA * 0.8, PA * 0.8, r()), r(), r()]; scene.add(m); drops.push(m); } }

  // шланг от дома к пруду (наливают), струя
  const hose = K.tube([[-5.2, base(-5.2, -2.6) + 0.06, -2.6], [-4.2, base(-4.2, -2.9) + 0.06, -2.9], [-3.4, base(-3.4, -2.4) + 0.06, -2.4], [-2.6, base(-2.6, -1.4) + 0.3, -1.4]], 0.045, 'hose', {cast: false, n: 30});
  const jet = K.tube([[-2.6, base(-2.6, -1.4) + 0.3, -1.4], [-2.2, 0.1, -1.2], [-1.7, -0.6, -1.0]], 0.05, 'water', {cast: false, n: 16, mat: {water: 1, opacity: 0.75, smooth: true}, ro: 7});
  // тачка с глиной и лопата
  const barrow = new THREE.Group(); barrow.position.set(4.2, base(4.2, -1.6), -1.6); barrow.rotation.y = -0.5; scene.add(barrow);
  box(1.0, 0.35, 0.7, 'metal', 0, 0.55, 0, {parent: barrow, r: 0.06}); add(blob(0.36, 5, 0.25, 1.4, 1.2, 0.6, 0.9), 'clay', 0, 0.78, 0, {parent: barrow});
  for (const s of [-1, 1]) box(0.9, 0.05, 0.05, 'wood', -0.75, 0.5, s * 0.25, {parent: barrow, r: 0.02});
  cyl(0.2, 0.2, 0.08, 'tyre', 0.6, 0.2, 0, {parent: barrow, rot: [Math.PI / 2, 0, 0], seg: 12});
  for (const s of [-1, 1]) box(0.05, 0.4, 0.05, 'wood', -0.4, 0.2, s * 0.22, {parent: barrow, r: 0.01});
  const shovel = new THREE.Group(); shovel.position.set(3.3, base(3.3, -2.6), -2.6); shovel.rotation.set(0.15, 0.3, -0.25); scene.add(shovel);
  cyl(0.03, 0.03, 1.4, 'wood', 0, 0.9, 0, {parent: shovel, seg: 6}); box(0.26, 0.32, 0.03, 'metal', 0, 0.12, 0, {parent: shovel, r: 0.03});

  // ── дом, деревья, грядки, забор, скамейка, облака
  house(K, -7.6, -8.4, -3.6, {});
  tree(-4.6, base(-4.6, -4.6) - 0.05, -4.6, 2.6, 1.1, 31);
  tree(6.8, base(6.8, -4.0) - 0.05, -4.0, 2.4, 1.0, 41);
  for (const [x, z, s] of [[9, -7, 1.4], [-12, -6, 1.5], [11.5, -11, 1.6], [-14, -12, 1.7], [4, -12, 1.5], [-2, -14, 1.6], [14, -15, 1.7], [-19, -18, 1.9]]) fir(x, base(x, z) - 0.05, z, s, false);
  for (let i = 0; i < 3; i++) { const x = 2.0, z = -5.0 - i * 0.9; box(2.4, 0.22, 0.6, 'soil', x, base(x, z) + 0.06, z, {r: 0.04}); for (let k = 0; k < 6; k++) add(blob(0.14, i * 10 + k, 0.2, 1.5, 1, 0.8, 1, 0), 'leaf2', x - 1.0 + k * 0.4, base(x, z) + 0.26, z, {cast: false}); }
  fence(K, base, -2.5, 8.5, -7.6, false);
  { const bx = -3.4, bz = -3.6, y = base(bx, bz); box(1.2, 0.07, 0.35, 'wood', bx, y + 0.45, bz, {r: 0.02}); for (const s of [-1, 1]) box(0.07, 0.44, 0.3, 'woodDark', bx + s * 0.5, y + 0.22, bz, {r: 0.01}); }
  { const wx = 5.3, wz = -2.6, y = base(wx, wz); cyl(0.16, 0.18, 0.32, 'carBody', wx, y + 0.16, wz, {seg: 12}); K.tube([[wx + 0.12, y + 0.12, wz], [wx + 0.35, y + 0.3, wz], [wx + 0.48, y + 0.42, wz]], 0.025, 'carBody', {n: 8}); }
  const clouds = [cloud(sky, -5, 11, -16, 1.5, 51), cloud(sky, 6, 14, -24, 1.8, 52), cloud(sky, 9, 9.5, -14, 0.9, 53), cloud(sky, -11, 15, -34, 2.2, 54)];

  // q: level — уровень воды в пруду (м, ≤ 0; ниже дна — сухо); clay 0..1 — глиняный замок; seep 0..1 — капли вниз; wet 0..1 — мокрый песок;
  // hose 0..1 — шланг и струя; lilies 0..1; pack 0..1 — глина уплотнилась (тоньше и темнее)
  const bottomY = S(0, 0);
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.2 + 0.05 * i); });
    const c = q.clay ?? 0, pk = q.pack ?? 0, th = c * LINE * (1 - 0.3 * pk);
    gnd.paint(c);
    liningCut.m.visible = c > 0.01; liningCut.m.material.color.set(pk > 0.5 ? '#9a4e33' : '#a8583a');
    liningCut.set((x) => S(x, 0) + 0.005, (x) => S(x, 0) - th);
    // вода: уровень L, поверхность — эллипс, где дно ниже L
    const L = Math.min(q.level ?? bottomY - 0.1, 0.02), wet = L > bottomY + 0.02;
    wTop.visible = waterCut.m.visible = wet;
    if (wet) {
      const k = Math.sqrt(Math.max(1e-4, 1 - Math.pow(Math.max(0, -L / PD), 1.25)));
      wTop.scale.set(PA * k, 1, PB * k); wTop.position.set(0, L, 0);
      waterCut.set(() => L, (x) => S(x, 0));
    }
    lilies.forEach((g, i) => { const [x, z] = g.userData.p, kk = wTop.scale.x / PA; g.position.set(x * PA * kk * 0.8, L + 0.03, z * PB * kk * 0.8); g.visible = wet && (q.lilies ?? 0) > i / lilies.length; g.rotation.y = i + t * 0.05; });
    wetCut.set(q.wet ?? 0);
    const sp = q.seep ?? 0;
    drops.forEach((m, i) => { const [x, ph, sp2] = m.userData.p, top = S(x, 0) - th - 0.1, bot = B[3](x) + 0.05, u = ((ph + t * (0.18 + 0.1 * sp2)) % 1 + 1) % 1; m.position.set(x + 0.08 * Math.sin(u * 9 + i), lerp(top, bot, u), 0.06); m.visible = i / drops.length < sp && top > bot; });
    const hs = q.hose ?? 0; hose.visible = hs > 0.01; jet.visible = hs > 0.5;
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
