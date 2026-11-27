// @ts-nocheck
// Мир «Как появляются провалы» (27.11): флоридский двор (дом, бассейн, машина, пальмы), под ним разрез:
// почва, песок, глина, известняк. В известняке растёт пещера (cave), в ней вода (уровень lvl: dry 0..1),
// насос качает воду (pump), песок сыплется в пустоту — она ползёт вверх (up), остаётся корка (crack),
// обвал (fall): поверхность проседает воронкой, дом/бассейн/машина уходят вниз. Копия структуры pogreb.ts.
// Срез над воронкой — динамическая «пробка» (plug): столбцы с трапециями по слоям, пересчёт по q каждый кадр.
import * as THREE from 'three';
import {makeKit, cutFace, hills, house, rnd, sm, lerp, vnoise} from '../kit';

const R = 4.6, D = 3.8, XH = 5.5; // воронка: радиус, глубина; полуширина пробки в срезе
export function S(x, z) { return 0.9 * sm((-z - 14) / 10) + 0.12 * vnoise(x * 0.3, 2, z * 0.3) * sm((-z - 12) / 4); }
const LB = [null, -0.4, -2.6, -3.7, -10, -30];
const LAYERS = ['soil', 'sand', 'clay', 'lime', 'lime2'];
const COL = {grass: '#8cc25e', soil: '#7a5a48', sand: '#ecd49c', clay: '#cf8a5e', lime: '#d3cbb3', lime2: '#b9b19b', caveBack: '#5e574b', pool: '#4fb6e6', poolRim: '#efeadf', wallH: '#f6e3c8', carB: '#d9573f', carW: '#3f8fc4', palmLeaf: '#5aa55a', palmTrunk: '#9c7a58'};
const wave = (k, x) => 0.07 * Math.sin(x * 0.8 + k * 1.7);
const base = (k, x) => (k === 0 ? S(x, 0) : LB[k] + wave(k, x));
const bowl = (x, z = 0) => Math.max(0, 1 - (x * x + z * z) / (R * R));
export const T = {
  lawn: [-1.2, 0.05, -0.6], sand: [-4.6, -1.5, 0.02], clay: [-4.6, -3.15, 0.02], lime: [-4.6, -6.2, 0.02], cave: [0, -7.4, 0.02],
  water: [2.6, -5.0, 0.06], well: [-4.3, 0.9, 0.1], crust: [0.4, -0.25, 0.02], house: [1.9, 3.6, -1.1], hole: [1.2, -0.8, -2.5], pump: [-4.3, 0.5, 0.1],
};
export const CAMS = {
  hook: {pos: [0.4, -1.6, 24], look: [0.2, -2.9, -1], fov: 40},
  wide: {pos: [0, 0.4, 25], look: [0, -1.9, -1.5], fov: 40},
  layers: {pos: [-2.6, -2.2, 14], look: [-2.8, -3.0, -0.5], fov: 40},
  layers2: {pos: [-2.2, -2.5, 13.4], look: [-2.6, -3.3, -0.5], fov: 40},
  cave2: {pos: [0.7, -3.4, 20], look: [0.4, -4.7, -0.5], fov: 40},
  rain: {pos: [-1.2, 2.2, 17], look: [-0.8, -1.4, -1.5], fov: 40},
  cave: {pos: [0.2, -3.6, 21.5], look: [0, -4.9, -0.5], fov: 40},
  well: {pos: [-2.4, -2.8, 16.5], look: [-2.2, -4.0, -0.5], fov: 40},
  chim: {pos: [0.2, -3.0, 15], look: [0, -3.8, -0.5], fov: 40},
  crust: {pos: [0.6, 1.6, 16.5], look: [0.5, -1.0, -1.2], fov: 40},
  fall: {pos: [0.6, 2.6, 22], look: [0.4, -1.4, -2.2], fov: 40},
  top: {pos: [0.2, 12.5, 15], look: [0.2, -1.0, -3.0], fov: 40},
  end: {pos: [1.2, 5.0, 26], look: [0.6, -0.6, -4.0], fov: 40},
  cover: {pos: [0.4, -1.2, 22.5], look: [0.2, -2.6, -1], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {...COL, plank: '#a77a4c', pipeC: '#6d7078'});
  const {add, box, cyl, blob, cloud} = K;
  cutFace(K, LAYERS, base, -40, 40, [{x0: -XH, x1: XH, y0: -30.5, y1: 9}], 0, 0.25);

  // ── пробка среза над воронкой: по мешу на слой + песок на дне пещеры
  const NC = 160, MAXV = NC * 3 * 6 * 3;
  const mkDyn = (role) => { const g = new THREE.BufferGeometry(); const pa = new THREE.Float32BufferAttribute(new Float32Array(MAXV), 3); pa.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', pa);
    const na = new Float32Array(MAXV); for (let i = 0; i < MAXV; i += 3) na[i + 2] = 1; g.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -8, 0), 40);
    const m = add(g, role, 0, 0, 0, {cast: false, mat: {smooth: true}}); m.frustumCulled = false; return m; };
  const plug = LAYERS.map(mkDyn), pileM = mkDyn('sand');
  // задняя стенка пещеры (видна только сквозь пустоту)
  const back = add(new THREE.PlaneGeometry(1, 1), 'caveBack', 0, 0, -0.8, {cast: false});
  // вода в известняке: полупрозрачная синяя плоскость перед срезом, верх = уровень
  const wM = new THREE.MeshBasicMaterial({color: '#3f8fe0', transparent: true, opacity: 0.32, depthWrite: false});
  const wPl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wM); wPl.renderOrder = 6; scene.add(wPl);
  const wLineM = new THREE.MeshBasicMaterial({color: '#2f6fc0', transparent: true, opacity: 0.7, depthWrite: false});
  const wLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.07), wLineM); wLine.renderOrder = 7; scene.add(wLine);

  // ── земля: сетка (мельче у воронки), проседает по fall
  const X0 = -40, X1 = 40, Z0 = -34;
  const xs = [], zs = []; for (let x = X0; x <= X1 + 1e-6; x += Math.abs(x) < 7 ? 0.25 : 0.5) xs.push(+x.toFixed(3)); for (let z = 0; z >= Z0 - 1e-6; z -= z > -7 ? 0.25 : 1.0) zs.push(+z.toFixed(3));
  const gP = [], gI = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) gP.push(xs[i], S(xs[i], zs[j]), zs[j]);
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; gI.push(a, b, c, b, d, c); }
  const gg0 = new THREE.BufferGeometry(); gg0.setAttribute('position', new THREE.Float32BufferAttribute(gP, 3)); gg0.setIndex(gI); const gg = gg0.toNonIndexed(); gg.computeVertexNormals();
  const gpos = gg.attributes.position, gBase = Float32Array.from(gpos.array), gIdx = [];
  for (let i = 0; i < gpos.count; i++) { const x = gBase[i * 3], z = gBase[i * 3 + 2]; if (x * x + z * z < R * R + 0.5) gIdx.push(i); }
  { const m = new THREE.Mesh(gg, K.M('grass')); m.receiveShadow = true; scene.add(m); }
  hills(K, 'hillMid', Z0 + 0.5, -80, (x, z) => S(x, Z0) + 4 * sm((-z + Z0) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -76, -170, (x, z) => 2 + 9 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  // камешки в известняке и глине (вне пробки)
  { const r = rnd(4); for (let i = 0, n = 0; i < 300 && n < 16; i++) { const x = lerp(-30, 30, r()), y = lerp(-9.5, -3.0, r()), rr = 0.12 + r() * 0.22; if (Math.abs(x) < XH + 0.6) continue; add(blob(rr, n, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.03, {cast: false, rot: [0, 0, r() * 3]}); n++; } }

  // ── двор: дом, бассейн, машина (всё в группах, чтобы уйти в воронку)
  const HX = 1.9, HZ = -2.75;
  const hG = new THREE.Group(); hG.position.set(HX, 0, HZ); scene.add(hG);
  house(K, 0, -1.5, 1.5, {parent: hG, w: 4.4, wall: 'wallH'});
  const PX = -2.4, PZ = -2.5;
  const pG = new THREE.Group(); pG.position.set(PX, 0, PZ); scene.add(pG);
  for (const s of [-1, 1]) { box(2.9, 0.3, 0.2, 'poolRim', 0, 0.15, s * 0.95, {parent: pG, r: 0.03}); box(0.2, 0.3, 1.7, 'poolRim', s * 1.35, 0.15, 0, {parent: pG, r: 0.03}); }
  box(2.5, 0.12, 1.7, 'pool', 0, 0.12, 0, {parent: pG, r: 0.01, cast: false});
  box(0.5, 0.06, 1.0, 'white', -0.2, 0.06, 1.7, {parent: pG, r: 0.02}); // лежак
  const car = (parent, x, z, col, ry = 0) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g);
    box(2.1, 0.5, 1.0, col, 0, 0.5, 0, {parent: g, r: 0.08}); box(1.1, 0.42, 0.9, 'glassDark', -0.1, 0.95, 0, {parent: g, r: 0.08});
    for (const [dx, dz] of [[-0.65, -0.5], [0.65, -0.5], [-0.65, 0.5], [0.65, 0.5]]) cyl(0.22, 0.22, 0.14, 'tyre', dx, 0.24, dz, {parent: g, rot: [Math.PI / 2, 0, 0], seg: 12});
    return g; };
  const cG = new THREE.Group(); scene.add(cG); car(cG, 0, 0, 'carB', 0.2); cG.position.set(-0.4, 0, -4.4);
  // дорога позади с едущей машиной, тротуар
  box(80, 0.1, 2.6, 'asphalt', 0, 0.05, -9.2, {r: 0.02, cast: false});
  for (let x = -38; x < 38; x += 3) box(1.4, 0.03, 0.14, 'white', x, 0.115, -9.2, {r: 0.01, cast: false});
  box(80, 0.16, 0.9, 'concrete', 0, 0.08, -7.4, {r: 0.03, cast: false});
  const mover = car(scene, 0, -9.7, 'carW', Math.PI);
  // пальмы
  const palm = (x, z, h, lean, seed) => { const g = new THREE.Group(); g.position.set(x, S(x, z), z); scene.add(g); const r = rnd(seed);
    let px = 0, py = 0; for (let i = 0; i < 6; i++) { const nx = px + lean * (i + 1) * 0.06, ny = py + h / 6; const m = cyl(0.13 - i * 0.012, 0.16 - i * 0.012, h / 6 + 0.04, 'palmTrunk', (px + nx) / 2, (py + ny) / 2, 0, {parent: g, seg: 7}); m.rotation.z = -Math.atan2(nx - px, h / 6); px = nx; py = ny; }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + r(); const lf = new THREE.Group(); lf.position.set(px, py, 0); lf.rotation.y = a; g.add(lf);
      const m = box(1.7, 0.05, 0.38, 'palmLeaf', 0.8, -0.25, 0, {parent: lf, r: 0.02}); m.rotation.z = -0.35 - r() * 0.2; }
    add(blob(0.25, seed, 0.2, 1.3), 'palmTrunk', px, py - 0.1, 0, {parent: g}); };
  palm(-6.3, -4.2, 4.6, 1, 11); palm(6.6, -4.6, 5.2, -1, 12); palm(-5.0, -11.5, 5.0, 0.6, 13); palm(7.8, -12.5, 4.4, -0.5, 14); palm(-9.5, -13, 4.8, 1, 15); palm(3.6, -12.8, 5.4, 0.4, 16); palm(11, -6, 4.8, -0.8, 17);
  // кусты у дома
  { const r = rnd(21); for (let i = 0; i < 6; i++) add(blob(0.45 + r() * 0.2, 30 + i, 0.2, 1.4, 1.2, 0.8, 1.1), i % 2 ? 'leaf' : 'leaf2', lerp(-11, 11, r()), 0.25, lerp(-5.5, -6.8, r()), {}); }
  // соседские дома за дорогой
  for (const [x, z] of [[-9, -16], [0.5, -17], [9.5, -16.5]]) { const g = new THREE.Group(); g.position.set(x, S(x, z), z); scene.add(g); house(K, 0, -1.6, 1.6, {parent: g, w: 4.6, wall: 'wallH'}); }
  // скважина с насосом слева
  const WX = -4.3, WZ = 0.1;
  cyl(0.09, 0.09, 10.2, 'pipeC', WX, -4.2, WZ, {seg: 10, cast: false});
  box(0.7, 0.6, 0.55, 'carW', WX, 0.3, -0.25, {r: 0.05}); cyl(0.07, 0.07, 0.9, 'pipeC', WX + 0.5, 0.55, -0.25, {rot: [0, 0, Math.PI / 2], seg: 8});
  const pumpB = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({color: '#4f9be8'})); m.renderOrder = 8; scene.add(m); pumpB.push(m); }
  // трещины на газоне перед обвалом
  const cracks = []; { const r = rnd(31); for (let i = 0; i < 7; i++) { const a = -0.2 - i / 6 * (Math.PI - 0.4), rr = 1.6 + r() * 1.4, L = 0.8 + r() * 0.8; const m = box(L, 0.03, 0.07, 'dark', Math.cos(a) * rr, 0.02, Math.sin(a) * rr - 0.3, {r: 0.005, cast: false}); m.rotation.y = -a; cracks.push(m); } }
  // дождь, капли в грунте, песчинки
  const rainM = new THREE.MeshBasicMaterial({color: '#bcd3ec', transparent: true, opacity: 0.7, depthWrite: false});
  const rain = []; { const r = rnd(41); for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), rainM); m.userData = {x: lerp(-8, 8, r()), z: lerp(-0.5, -12, r()), o: r()}; m.renderOrder = 7; scene.add(m); rain.push(m); } }
  const seepM = new THREE.MeshBasicMaterial({color: '#4f9be8', transparent: true, opacity: 0});
  const seep = []; for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), seepM); m.renderOrder = 8; scene.add(m); seep.push(m); }
  const grainM = new THREE.MeshBasicMaterial({color: '#e3c27f'});
  const grains = []; for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), grainM); m.renderOrder = 8; scene.add(m); grains.push(m); }
  const clouds = [cloud(sky, -14, 20, -40, 2.6, 51), cloud(sky, 10, 23, -48, 3.0, 52), cloud(sky, 26, 19, -36, 2.0, 53)];

  // ── геометрия пробки по состоянию
  let last = '';
  const plugAt = (cv, up, fl, lvl) => {
    const w = lerp(1.8, 3.4, cv), h = lerp(1.6, 3.1, cv) * (1 - sm(fl * 1.3)), upE = up * (1 - fl), wc = 1.8 + 0.6 * upE, ytc = lerp(-6.2, -0.45, upE), hp = 1.5 * up * (1 - sm(fl * 1.3));
    const sag = (x) => fl * D * bowl(x);
    const bnd = (k, x) => (k <= 3 ? base(k, x) - sag(x) * (k === 0 ? 1 : 1 - 0.15 * k) : base(k, x));
    const vd = (x) => { if (Math.abs(x) >= w || (h < 0.02 && upE < 0.003)) return null; const u = x / w, vb = -8.4 + 0.35 * u * u; let vt = vb + h * Math.pow(Math.max(0, 1 - u * u), 0.55);
      if (Math.abs(x) < wc) { const v = x / wc; const ct = vb + (ytc - (1.0 + 0.6 * upE) * v * v - vb) * sm(upE / 0.3), kk = 2.0, hh = Math.max(kk - Math.abs(vt - ct), 0) / kk; vt = Math.max(vt, ct) + hh * hh * kk * 0.25 * sm(upE / 0.3); }
      vt = Math.min(vt, bnd(0, x) - 0.3);
      const pt = Math.min(vt, vb + Math.max(0, hp * (1 - Math.abs(x) / 1.7))); return [vb, pt, vt]; };
    const cols = []; for (let x = -XH; x < XH - 1e-6; x += 0.1) cols.push(+x.toFixed(3)); cols.push(XH);
    for (const e of [-w, w]) if (e > -XH && e < XH) cols.push(e); for (const e of [-1.7, 1.7]) cols.push(e); cols.sort((a, b) => a - b);
    const P = LAYERS.map(() => []), PP = [];
    const quad = (arr, xa, a0, a1, xb, b0, b1) => { if (a1 - a0 < 1e-4 && b1 - b0 < 1e-4) return; arr.push(xa, a0, 0, xb, b0, 0, xb, b1, 0, xa, a0, 0, xb, b1, 0, xa, a1, 0); };
    for (let c = 0; c < cols.length - 1; c++) { const xa = cols[c], xb = cols[c + 1]; if (xb - xa < 1e-5) continue; const xm = (xa + xb) / 2;
      const has = vd(xm) !== null; const va = vd(has ? Math.max(-w + 1e-4, Math.min(w - 1e-4, xa)) : xa), vbq = vd(has ? Math.max(-w + 1e-4, Math.min(w - 1e-4, xb)) : xb);
      const sa = has ? [[-30.2, va[0]], [va[2], 99]] : [[-30.2, 99]], sb = has ? [[-30.2, vbq[0]], [vbq[2], 99]] : [[-30.2, 99]];
      for (let k = 0; k < LAYERS.length; k++) { const la0 = bnd(k + 1, xa), la1 = bnd(k, xa), lb0 = bnd(k + 1, xb), lb1 = bnd(k, xb);
        for (let s = 0; s < sa.length; s++) { const a0 = Math.max(la0, sa[s][0]), a1 = Math.min(la1, sa[s][1]), b0 = Math.max(lb0, sb[s][0]), b1 = Math.min(lb1, sb[s][1]); quad(P[k], xa, a0, Math.max(a0, a1), xb, b0, Math.max(b0, b1)); } }
      if (has) quad(PP, xa, va[0], va[1], xb, vbq[0], vbq[1]); }
    const put = (m, arr) => { const at = m.geometry.attributes.position; at.array.fill(0); at.array.set(arr.slice(0, MAXV)); at.needsUpdate = true; m.geometry.setDrawRange(0, Math.min(arr.length, MAXV) / 3); };
    plug.forEach((m, k) => put(m, P[k])); put(pileM, PP);
    const topMax = Math.max(vd(0)?.[2] ?? -8, -8);
    back.scale.set(2 * w + 1.0, topMax + 0.5 - (-8.9), 1); back.position.set(0, (topMax + 0.5 + -8.9) / 2, -0.8); back.visible = !(h < 0.02 && upE < 0.003);
    // земля
    for (const i of gIdx) { const x = gBase[i * 3], z = gBase[i * 3 + 2]; gpos.array[i * 3 + 1] = gBase[i * 3 + 1] - fl * D * bowl(x, z); }
    gpos.needsUpdate = true; gg.computeVertexNormals();
    return {vd, sag, ytc, upE, hp};
  };
  let st = null;

  // q: cave, dry, pump, up, crack, fall, rain 0..1
  const animate = (q) => {
    const t = q.t, cv = sm(q.cave ?? 0), dr = q.dry ?? 0, up = q.up ?? 0, fl = q.fall ?? 0, rn = q.rain ?? 0, pu = q.pump ?? 0, ck = q.crack ?? 0;
    const lvl = lerp(-3.95, -9.2, sm(dr));
    const key = [cv, up, fl].map((v) => v.toFixed(4)).join('_');
    if (key !== last || !st) { st = plugAt(cv, up, fl, lvl); last = key; }
    wPl.scale.set(80, lvl + 14, 1); wPl.position.set(0, (lvl - 14) / 2, 0.05); wPl.visible = lvl > -9.1;
    wLine.scale.set(80, 1, 1); wLine.position.set(0, lvl, 0.06); wLine.visible = lvl > -9.1;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.06 * i); });
    mover.position.x = ((t * 3.2 + 30) % 64) - 32;
    // провал: дом, бассейн, машина
    const sgH = fl * D * bowl(HX, HZ), sgP = fl * D * bowl(PX, PZ), sgC = fl * D * bowl(-0.4, -4.4);
    hG.position.y = -sgH * 1.35; hG.rotation.z = 0.42 * sm(fl * 1.2); hG.rotation.x = 0.12 * sm(fl);
    pG.position.y = -sgP * 1.3; pG.rotation.z = -0.38 * sm(fl * 1.2);
    cG.position.y = -sgC * 1.6; cG.rotation.x = 0.45 * sm(fl * 1.1); cG.rotation.z = -0.15 * sm(fl);
    cracks.forEach((m, i) => { m.visible = ck > 0.05 && fl < 0.15; m.scale.set(Math.max(0.01, sm(ck * 1.4 - i * 0.06)), 1, 1); });
    // дождь
    rain.forEach((m) => { const u = (m.userData.o + t * 0.9) % 1; m.position.set(m.userData.x - u * 0.6, lerp(10, 0.2, u), m.userData.z); m.visible = rn > 0.05; m.scale.setScalar(Math.max(0.01, rn)); });
    seepM.opacity = 0.9 * sm(rn * 1.5);
    seep.forEach((m, i) => { const x = -4.9 + i * 0.68 + 0.1 * Math.sin(i * 3), u = ((t * 0.16 + i * 0.37) % 1 + 1) % 1, y = lerp(-0.1, lvl, u); m.position.set(x, y + 0.08 * Math.sin(u * 20 + i), 0.08); m.visible = rn > 0.05 && Math.abs(x - -4.3) > 0.25; m.scale.setScalar(Math.max(0.01, sm(rn) * (1 - sm((u - 0.85) / 0.15)))); });
    // насос: вода вверх по трубе
    pumpB.forEach((m, i) => { const u = ((t * 0.5 + i / pumpB.length) % 1 + 1) % 1, y = lerp(-9.0, 0.6, u); m.position.set(WX, y, WZ + 0.12); m.visible = pu > 0.05 && y > lvl - 0.2 - 10 * (1 - pu); m.scale.setScalar(Math.max(0.01, pu)); });
    // песчинки: из свода пещеры на кучу
    const v0 = st.vd(0);
    grains.forEach((m, i) => { const u = ((t * 0.6 + i / grains.length) % 1 + 1) % 1; const x = (((i * 37) % 11) / 11 - 0.5) * 1.4 * (0.4 + 0.6 * (1 - u)); const vv = st.vd(x) || v0;
      const y0 = vv ? vv[2] - 0.1 : -6, y1 = vv ? vv[1] + 0.05 : -8; m.position.set(x, lerp(y0, y1, u * u), -0.25); m.visible = up > 0.02 && fl < 0.3 && !!vv && y0 - y1 > 0.3; m.scale.setScalar(Math.max(0.01, sm(up * 4))); });
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
