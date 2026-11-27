// @ts-nocheck
// Мир «Как устроен лёд хоккейной арены» (27.11): открытая хоккейная коробка в зимнем парке, срез спереди (z=0).
// В разрезе (слои увеличены): лёд (прозрачный) с белой краской и разметкой внутри, бетонная плита с трубами рассола,
// утеплитель, подогреваемый бетон с тёплыми трубами, песок/щебень. Слева холодильная установка, справа — котёл.
// q: paint 0..1 (белая краска проходом машины), lines 0..1 (разметка), ice 0..1 (толщина льда), brine 0..1 (рассол),
// heat 0..1 (подогрев), heave 0..1 (грунт промёрз и вздыбил плиту — «что будет, если не греть»).
import * as THREE from 'three';
import {makeKit, cutFace, hills, fence, house, rnd, sm, lerp, vnoise} from '../kit';

const RX = 8, RZ = -8, ZC = -4;
const Y = {iceB: -0.22, iceT: 0.05, slabT: -0.25, slabB: -0.85, insT: -0.88, insB: -1.15, heatT: -1.18, heatB: -1.65, sandT: -1.68, sandB: -2.25};
const PAINT = [-0.17, -0.13], LINE = [-0.14, -0.105];
const YB = -0.62, YH = -1.42, PX = 9.6; // трубы-коллекторы рассола и подогрева
export function S(x, z) { const f = sm((Math.max(Math.abs(x) - 14, -z - 13, 0)) / 6); return f * (0.35 * Math.sin(x * 0.25 + z * 0.2) + 0.25 * vnoise(x * 0.2, 1, z * 0.2)) + 1.2 * sm((-z - 24) / 14); }
const LV = [null, -0.12, -0.9, -2.6, -4.5, -30];
const LAYERS = ['snow', 'soil', 'clay', 'sand', 'rock'];
const bound = (k, x) => (k === 0 ? S(x, 0) : Math.min(S(x, 0) - 0.1 * k, LV[k] + 0.08 * Math.sin(x * 0.9 + k)));
export const T = {
  rink: [-2, 0.1, -5], ice: [-1.8, -0.02, 0.0], paint: [-2.4, -0.15, 0.02], lines: [0, -0.1, -2.5], slab: [-1.2, -0.38, 0.02],
  brine: [-7.5, YB, 0.12], chiller: [-10.2, 1.25, -0.3], ins: [0.6, -1.0, 0.02], heat: [1.2, YH, 0.12], heater: [10.6, 1.25, -1.0],
  sand: [-1.5, -2.0, 0.02], lens: [0, -1.98, 0.06], bulge: [0, 0.3, -0.2], goal: [-6.8, 0.4, ZC],
};
export const CAMS = {
  hook: {pos: [-3.2, 3.4, 8.5], look: [-1.6, -0.25, -3.5], fov: 40},
  wide: {pos: [0, 12, 25], look: [0, -0.6, -4], fov: 40},
  cut: {pos: [-1.2, 0.6, 10], look: [-0.8, -0.6, 0], fov: 40},
  ice: {pos: [-2.6, 0.9, 6.2], look: [-2.4, -0.15, -0.5], fov: 40},
  top: {pos: [0.5, 5.5, 13], look: [0, -0.2, -3.5], fov: 40},
  brine: {pos: [-8.6, 0.9, 10.5], look: [-8.8, -0.2, 0], fov: 40},
  deep: {pos: [0.5, 0.0, 11], look: [0.4, -1.0, 0], fov: 40},
  heave: {pos: [0, 0.6, 14.5], look: [0, -0.9, 0], fov: 40},
  end: {pos: [3, 10, 30], look: [0, -1.0, -5], fov: 40},
  cover: {pos: [-2.6, 1.6, 10.5], look: [-1.4, -0.7, -1], fov: 40},
};

const off = (x, hv) => (Math.abs(x) <= RX + 1e-6 ? 0.45 * hv * Math.exp(-((x / 2.8) ** 2)) : 0);

export function build(scene, sky) {
  const K = makeKit(scene, {slabC: '#75716c', insC: '#e6c75c', heatC: '#c9ad94', gravel: '#cdb68a', paintW: '#fbfcfe', redL: '#d23c34', blueL: '#2f62c8', chill: '#8fa3b5', boiler: '#b0623f', boardW: '#f6f3ec', kick: '#e8b83a', cartR: '#d8452f', fan: '#3a4250', capC: '#2f6fd6', capH: '#e0673a'});
  const {add, box, cyl, blob, fir, cloud, smoke} = K;
  cutFace(K, LAYERS, bound, -40, 40, [{x0: -RX, x1: RX, y0: Y.sandB, y1: 0.5}], 0, 0.25);

  // земля: снежная сетка с вырезом под каток
  { const xs = [], zs = []; for (let x = -40; x <= 40 + 1e-6; x += 0.5) xs.push(x); for (let z = 0; z >= -36 - 1e-6; z -= z > -12 ? 0.5 : 1.0) zs.push(z);
    const P = [], I = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) P.push(xs[i], S(xs[i], zs[j]), zs[j]);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2; if (Math.abs(cx) < 8.6 && cz > -8.6) continue; const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const m = new THREE.Mesh(ng, K.M('snow')); m.receiveShadow = true; scene.add(m); }
  hills(K, 'snowShade', -36.5, -80, (x, z) => S(x, -36) + 5 * sm((-z - 36) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -76, -170, (x, z) => 3 + 16 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(4); for (let i = 0, n = 0; i < 300 && n < 18; i++) { const x = lerp(-38, 38, r()), y = lerp(-4.2, -2.7, r()), rr = 0.15 + r() * 0.22; if (Math.abs(x) < RX + 0.8) continue; add(blob(rr, n, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++; } }

  // ── слои под катком: деформируемые коробки (вздутие от мороза)
  const defs = [];
  const layer = (role, x0, x1, y0, y1, z0, z1, kind, o = {}) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z0 - z1, 64, 1, 1); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const m = new THREE.Mesh(g, o.material || K.M(role)); m.castShadow = !o.material; m.receiveShadow = true; if (o.ro !== undefined) m.renderOrder = o.ro; m.frustumCulled = false; scene.add(m);
    defs.push({m, base: g.attributes.position.array.slice(), kind, y0, y1, z0, z1}); return m;
  };
  layer('gravel', -RX, RX, Y.sandB, Y.sandT, 0, RZ, 'sand');
  layer('heatC', -RX, RX, Y.heatB, Y.heatT, 0, RZ, 'all');
  layer('insC', -RX, RX, Y.insB, Y.insT, 0, RZ, 'all');
  layer('slabC', -RX, RX, Y.slabB, Y.slabT, 0, RZ, 'all');
  const paintM = K.M('paintW', {emissive: 0}); const paint = layer('paintW', -RX + 0.04, RX - 0.04, PAINT[0], PAINT[1], -0.04, RZ + 0.04, 'paint', {material: K.M('paintW', {emissive: 1, ei: 0.55})});
  const lineDefs = [[0, 'redL', 0.16], [-2.2, 'blueL', 0.16], [2.2, 'blueL', 0.16], [-6.8, 'redL', 0.06], [6.8, 'redL', 0.06]];
  for (const [x, c, w] of lineDefs) layer(c, x - w / 2, x + w / 2, LINE[0], LINE[1], -0.05, RZ + 0.05, 'line');
  const iceM = new THREE.MeshStandardMaterial({color: '#a9d6f0', transparent: true, opacity: 0.42, roughness: 0.15, flatShading: true, depthWrite: false});
  const ice = layer('ice', -RX, RX, Y.iceB, Y.iceT, 0, RZ, 'ice', {material: iceM, ro: 5});
  // центральный круг
  const ring = add(new THREE.TorusGeometry(1.0, 0.05, 6, 40), 'blueL', 0, -0.12, ZC, {rot: [Math.PI / 2, 0, 0], cast: false});
  // трещины в плите и подогреваемом слое (видны при вздутии)
  const cracks = [];
  for (const [x, y, a] of [[-1.9, -0.55, 0.5], [1.8, -0.6, -0.45], [-1.6, -1.4, 0.4], [2.0, -1.4, -0.5], [0.2, -0.45, 0.1]]) { const c = box(0.05, 0.5, 0.03, 'fan', x, y, 0.025, {r: 0.01, cast: false}); c.rotation.z = a; c.userData.y0 = y; cracks.push(c); }
  // линза льда в грунте
  const lensM = new THREE.MeshBasicMaterial({color: '#bfe4f7', transparent: true, opacity: 0.0, depthWrite: false});
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 28), lensM); lens.position.set(0, -1.98, 0.04); lens.scale.set(2.2, 0.22, 1); lens.renderOrder = 7; scene.add(lens);
  // торцы поперечных труб в плите (рассол) и в нижнем бетоне (подогрев)
  const caps = [];
  for (let x = -7.6; x <= 7.61; x += 0.55) { caps.push({m: cyl(0.06, 0.06, 0.09, 'capC', x, -0.42, -0.015, {rot: [Math.PI / 2, 0, 0], seg: 10, cast: false}), x, y: -0.42}); caps.push({m: cyl(0.06, 0.06, 0.09, 'capH', x, -1.3, -0.015, {rot: [Math.PI / 2, 0, 0], seg: 10, cast: false}), x, y: -1.3}); }

  // ── прозрачные трубы-коллекторы на срезе (видно, как течёт рассол / тёплая вода)
  const glassM = new THREE.MeshStandardMaterial({color: '#dbe8f2', transparent: true, opacity: 0.32, roughness: 0.25, depthWrite: false});
  const hPipe = (xa, xb, y) => { const g = new THREE.CylinderGeometry(0.12, 0.12, Math.abs(xb - xa), 10, 64, true); g.rotateZ(Math.PI / 2); g.translate((xa + xb) / 2, y, 0.0); const m = new THREE.Mesh(g, glassM); m.renderOrder = 6; m.frustumCulled = false; scene.add(m); defs.push({m, base: g.attributes.position.array.slice(), kind: 'all'}); };
  const vPipe = (x, ya, yb) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, yb - ya, 10, 1, true), glassM); m.position.set(x, (ya + yb) / 2, 0); m.renderOrder = 6; scene.add(m); };
  const elbow = (x, y) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glassM); m.position.set(x, y, 0); m.renderOrder = 6; scene.add(m); };
  hPipe(-PX, RX, YB); vPipe(-PX, YB, 0.55); elbow(-PX, YB); elbow(-PX, 0.55);
  hPipe(-RX, PX, YH); vPipe(PX, YH, 0.55); elbow(PX, YH); elbow(PX, 0.55);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 10, 1, true), glassM); m.rotation.x = Math.PI / 2; m.position.set(s * PX, 0.55, -0.2); m.renderOrder = 6; scene.add(m); }
  const beadSet = (n, col, path) => { const segs = []; let L = 0; for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({a, b, l, s: L}); L += l; }
    const at = (u) => { const d = u * L; for (const s of segs) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return [lerp(s.a[0], s.b[0], k), lerp(s.a[1], s.b[1], k)]; } return path[path.length - 1]; };
    const M = new THREE.MeshBasicMaterial({color: col}); const L_ = []; for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), M); m.renderOrder = 8; scene.add(m); L_.push(m); }
    return (t, on, hv, speed) => L_.forEach((m, i) => { const u = ((t * speed + i / n) % 1 + 1) % 1, [x, y] = at(u); m.position.set(x, y + off(x, hv), 0.04); m.visible = on > 0.05; m.scale.setScalar(Math.max(0.01, on)); }); };
  const brineB = beadSet(30, '#3d7fe6', [[-PX, 0.55], [-PX, YB], [RX - 0.1, YB]]);
  const heatB = beadSet(30, '#f06a36', [[PX, 0.55], [PX, YH], [-RX + 0.1, YH]]);

  // ── холодильная установка (слева) и котёл (справа)
  box(1.6, 1.1, 1.4, 'chill', -10.6, 0.6, -1.0, {r: 0.06}); box(1.7, 0.08, 1.5, 'metal', -10.6, 1.19, -1.0, {r: 0.02});
  const fans = [];
  for (const dx of [-0.38, 0.38]) { cyl(0.3, 0.3, 0.1, 'fan', -10.6 + dx, 1.27, -1.0, {seg: 14}); const f = new THREE.Group(); f.position.set(-10.6 + dx, 1.34, -1.0); scene.add(f); for (let k = 0; k < 3; k++) { const b = box(0.5, 0.02, 0.09, 'metal', 0, 0, 0, {parent: f, r: 0.005, cast: false}); b.rotation.y = k * Math.PI / 1.5; } fans.push(f); }
  for (let k = 0; k < 5; k++) box(1.2, 0.04, 0.02, 'fan', -10.6, 0.3 + k * 0.15, -0.28, {r: 0.005, cast: false});
  box(1.6, 1.1, 1.4, 'boiler', 10.6, 0.6, -1.0, {r: 0.06}); box(1.7, 0.08, 1.5, 'metal', 10.6, 1.19, -1.0, {r: 0.02});
  cyl(0.12, 0.12, 1.2, 'metal', 11.0, 1.8, -1.2, {seg: 10}); const bsmoke = smoke(11.0, 2.4, -1.2, 5, 0.5);
  box(0.5, 0.35, 0.03, 'fan', 10.4, 0.7, -0.29, {r: 0.01, cast: false});
  const dial = box(0.3, 0.3, 0.03, 'capH', 10.4, 0.7, -0.27, {r: 0.04, cast: false, mat: {emissive: 1, ei: 0.6}});

  // ── борта, бортик-фундамент, ворота
  for (const s of [-1, 1]) { box(0.6, 0.34, 8.55, 'concrete', s * 8.28, -0.13, -4.29, {r: 0.02}); box(0.15, 0.48, 8.05, 'boardW', s * 8.12, 0.28, -4.08, {r: 0.02}); box(0.19, 0.11, 8.01, 'kick', s * 8.12, 0.095, -4.07, {r: 0.01}); }
  box(17.15, 0.34, 0.6, 'concrete', 0, -0.13, -8.28, {r: 0.02}); box(16.4, 0.48, 0.15, 'boardW', 0, 0.28, -8.12, {r: 0.02}); box(16.36, 0.11, 0.19, 'kick', 0, 0.095, -8.12, {r: 0.01});
  const goals = [];
  for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(s * 6.8, 0, ZC); scene.add(g);
    for (const dz of [-0.3, 0.3]) cyl(0.025, 0.025, 0.4, 'redL', 0, 0.2, dz, {parent: g, seg: 6});
    cyl(0.025, 0.025, 0.62, 'redL', 0, 0.4, 0, {parent: g, seg: 6, rot: [Math.PI / 2, 0, 0]});
    for (const dz of [-0.3, 0.3]) { const b = cyl(0.02, 0.02, 0.5, 'white', s * 0.2, 0.2, dz, {parent: g, seg: 5}); b.rotation.z = s * 0.9; }
    const net = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshStandardMaterial({color: '#ffffff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false})); net.position.set(s * 0.28, 0.2, 0); net.rotation.set(0, Math.PI / 2, s * 0.6); net.renderOrder = 6; g.add(net);
    goals.push({g, s}); }
  // шайба
  const puck = cyl(0.07, 0.07, 0.03, 'fan', -1.2, 0, ZC + 1.2, {seg: 12});

  // машина с краской: кузов, бак, штанга с форсунками, туман краски
  const cart = new THREE.Group(); scene.add(cart);
  box(0.8, 0.38, 0.55, 'cartR', -0.5, 0.27, 0, {parent: cart, r: 0.05}); cyl(0.2, 0.2, 0.5, 'white', -0.55, 0.62, 0, {parent: cart, seg: 12, rot: [Math.PI / 2, 0, 0]});
  for (const [dx, dz] of [[-0.8, -0.3], [-0.2, -0.3], [-0.8, 0.3], [-0.2, 0.3]]) cyl(0.09, 0.09, 0.06, 'fan', dx, 0.09, dz, {parent: cart, seg: 10, rot: [Math.PI / 2, 0, 0]});
  cyl(0.03, 0.03, 7.2, 'metal', 0.05, 0.3, 0, {parent: cart, seg: 6, rot: [Math.PI / 2, 0, 0]});
  const mistM = new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false});
  const mist = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mistM); m.renderOrder = 9; cart.add(m); mist.push(m); }

  // ── фон: фонари, ели, дома, забор, скамейки
  for (const [x, z] of [[-9.6, -9.4], [0, -9.4], [9.6, -9.4]]) { cyl(0.06, 0.08, 4.2, 'fan', x, S(x, z) + 2.1, z, {seg: 8}); box(0.7, 0.14, 0.4, 'fan', x, S(x, z) + 4.25, z + 0.15, {r: 0.03}); box(0.6, 0.06, 0.3, 'lamp', x, S(x, z) + 4.16, z + 0.15, {r: 0.02, cast: false, mat: {emissive: 1, win: 1, ei: 0.9}}); }
  for (const x of [-4.5, 4.5]) { box(1.6, 0.08, 0.4, 'wood', x, 0.45, -9.6, {r: 0.02}); for (const dx of [-0.7, 0.7]) box(0.08, 0.45, 0.35, 'fan', x + dx, 0.22, -9.6, {r: 0.01}); box(1.6, 0.07, 0.36, 'snow', x, 0.53, -9.6, {r: 0.02, cast: false}); }
  { const r = rnd(9); for (let i = 0, n = 0; i < 300 && n < 24; i++) { const x = lerp(-36, 36, r()), z = lerp(-34, -10.5, r()); if (Math.abs(x) < 11 && z > -13) continue; if (z < -14 && z > -21 && (Math.abs(x + 13) < 4 || Math.abs(x - 12) < 4)) continue; fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.7, true); n++; } }
  for (const s of [-1, 1]) { const x = s < 0 ? -13 : 12; const g = new THREE.Group(); g.position.set(0, S(x, -17.5) - 0.05, 0); scene.add(g); house(K, x, -19.5, -15.5, {snow: true, parent: g}); }
  const hs1 = smoke(-13 + 1.35, S(-13, -17.5) + 5.95, -19.5 + 1.8, 6, 0.8), hs2 = smoke(12 + 1.35, S(12, -17.5) + 5.95, -19.5 + 1.8, 6, 0.8);
  fence(K, S, -30, -16, -12, true); fence(K, S, 16, 30, -12, true);
  const clouds = [cloud(sky, -14, 20, -40, 2.6, 51), cloud(sky, 10, 23, -48, 3.0, 52), cloud(sky, 26, 19, -36, 2.0, 53)];

  const animate = (q) => {
    const t = q.t, pt = THREE.MathUtils.clamp(q.paint ?? 1, 0, 1), ln = sm(q.lines ?? 1), ic = THREE.MathUtils.clamp(q.ice ?? 1, 0, 1), br = sm(q.brine ?? 0), ht = sm(q.heat ?? 0), hv = sm(q.heave ?? 0);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.06 * i); });
    const edge = lerp(-RX + 0.04, RX - 0.04, pt), iceTop = lerp(Y.iceB + 0.1, Y.iceT, ic), lz = lerp(-0.05, RZ + 0.05, ln);
    for (const d of defs) {
      const p = d.m.geometry.attributes.position, a = p.array, b = d.base;
      for (let i = 0; i < a.length; i += 3) {
        let x = b[i], y = b[i + 1], z = b[i + 2];
        if (d.kind === 'paint') x = Math.min(x, edge);
        if (d.kind === 'line') z = Math.max(z, lz);
        if (d.kind === 'ice' && y > Y.iceB + 0.01) y = iceTop;
        const o = off(x, hv);
        a[i] = x; a[i + 1] = d.kind === 'sand' ? y + o * (y - Y.sandB) / (Y.sandT - Y.sandB) : y + o; a[i + 2] = z;
      }
      p.needsUpdate = true; d.m.geometry.computeBoundingSphere();
    }
    paint.visible = pt > 0.005;
    for (const d of defs) if (d.kind === 'line') d.m.visible = ln > 0.01;
    ring.visible = ln > 0.5; ring.scale.setScalar(Math.max(0.01, sm((ln - 0.5) * 2))); ring.position.y = -0.12 + off(0, hv);
    caps.forEach((c) => (c.m.position.y = c.y + off(c.x, hv)));
    cracks.forEach((c) => { c.visible = hv > 0.55; c.scale.y = Math.max(0.01, sm((hv - 0.55) / 0.35)); c.position.y = c.userData.y0 + off(c.position.x, hv); });
    lensM.opacity = 0.85 * hv; lens.visible = hv > 0.02; lens.scale.set(2.4 * Math.max(0.05, hv), 0.25 * Math.max(0.05, hv), 1); lens.position.y = -1.98 + 0.5 * off(0, hv);
    goals.forEach(({g, s}) => (g.position.y = iceTop + 0.01 + off(s * 6.8, hv)));
    puck.position.y = iceTop + 0.025 + off(-1.2, hv);
    brineB(t, br, hv, 0.09); heatB(t, ht, hv, 0.07);
    fans.forEach((f, i) => (f.rotation.y = t * 9 * br + i));
    dial.material.emissiveIntensity = 0.2 + 1.0 * ht;
    bsmoke(t, ht); hs1(t, 1); hs2(t, 1);
    cart.visible = pt > 0.003 && pt < 0.997; cart.position.set(edge, iceTop, ZC);
    mist.forEach((m, i) => { const u = ((t * 1.6 + i / 12) % 1 + 1) % 1; m.position.set(0.05 + 0.05 * Math.sin(i * 3), 0.28 - u * 0.3, -3.4 + (i / 11) * 6.8); m.scale.setScalar(0.6 + u * 1.2); });
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
