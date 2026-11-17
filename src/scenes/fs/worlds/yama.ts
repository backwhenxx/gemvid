// @ts-nocheck
// Мир «Откуда берутся ямы на дорогах» (17.11): загородная дорога вдоль x, срез z=0 показывает слои дороги
// (асфальт, щебень, песок, грунт). Яма — у края среза под ближней колеёй: трещина, вода, лёд-клин, пустота, провал.
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const AS = 0.3; // толщина асфальта (условно толще, чтобы читалась)
const RZ = -7.4; // дальний край дороги
export function S(x, z) {
  if (z > RZ) return 0;
  const d = RZ - z; // от края дороги вглубь
  return -0.3 * sm(d / 1.2) + 0.3 * sm((d - 1.2) / 6) + 2.2 * sm((d - 12) / 14) + 0.25 * Math.sin(x * 0.3 + z * 0.4) * sm((d - 3) / 4);
}
const B = [
  () => 0,
  () => -AS,
  (x) => -0.9 + 0.03 * Math.sin(x * 2.1),
  (x) => -1.6 + 0.05 * Math.sin(x * 1.3 + 1),
  (x) => -6.0 + 0.3 * Math.sin(x * 0.4 + 2),
  () => -14,
];
const LAYERS = ['asphalt', 'gravel', 'sand', 'soil', 'clay'];
const PX0 = -0.8, PX1 = 0.8, PZ = -1.3; // заплатка, которая станет ямой

export const NEAR = 1;
export const T = {
  asphalt: [2.6, -0.15, 0.05], gravel: [3.2, -0.6, 0.05], sand: [2.0, -1.25, 0.05], soil: [3.4, -3.0, 0.05],
  crack: [0.05, -0.12, 0.05], ice: [0.0, -0.5, 0.05], void: [0.0, -0.5, 0.05], hole: [0.0, 0.0, -0.6], sign: [-4.0, 1.9, -8.2],
};
export const CAMS = {
  hook: {pos: [4.6, 1.7, 8.6], look: [-0.8, 0.2, -1.4], fov: 40},
  hook2: {pos: [2.6, 1.3, 6.4], look: [-0.2, -0.1, -0.9], fov: 40},
  pit: {pos: [1.2, 1.1, 3.6], look: [0.0, -0.3, -0.5], fov: 40},
  layers: {pos: [2.8, 0.6, 9.5], look: [0.4, -1.4, 0], fov: 40},
  crack: {pos: [0.6, 0.0, 2.6], look: [0.0, -0.45, 0], fov: 40},
  crack2: {pos: [-0.6, 0.3, 2.9], look: [0.0, -0.5, 0], fov: 40},
  side: {pos: [5.5, 1.4, 9.5], look: [-0.2, 0.0, -1.4], fov: 40},
  wide: {pos: [9.5, 4.2, 19], look: [0.0, 0.2, -4], fov: 40},
  final: {pos: [11, 6.5, 24], look: [-1.5, 0.8, -6], fov: 40},
  cover: {pos: [3.0, 1.5, 7.6], look: [-0.2, -0.25, -0.9], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {asphalt: '#5d6170', gravel: '#9a968e', sand: '#e8cf98', soil: '#8a6a50', clay: '#c98a5c', grass: '#8fbf5e', leafDark: '#3f8a6c'});
  const {add, box, cyl, blob, tree, fir, cloud, smoke} = K;
  const X0 = -40, X1 = 40;
  cutFace(K, LAYERS, (k, x) => B[k](x), X0, X1, [{x0: PX0, x1: PX1, y0: -AS - 0.001, y1: 1}]);
  // камни в щебне и песке на срезе
  { const r = rnd(3); for (let i = 0; i < 90; i++) { const x = lerp(-14, 14, r()), y = lerp(-0.85, -0.38, r()), rr = 0.05 + r() * 0.06; if (Math.abs(x) < 1.0) continue; add(blob(rr, i, 0.25, 1.3, 1.2, 0.8, 0.5, 0), 'stone', x, y, 0.0, {cast: false}); }
    for (let i = 0; i < 26; i++) { const x = lerp(-14, 14, r()), y = lerp(-5.5, -2.0, r()), rr = 0.15 + r() * 0.25; add(blob(rr, i + 50, 0.25, 1.3, 1.25, 0.8, 0.5), 'stone', x, y, 0.0, {cast: false, rot: [0, 0, r() * 3]}); } }

  // ── дорога: верх асфальта сеткой с вырезом под заплатку; разметка; обочина
  {
    const P = [], I = []; const xs = [], zs = [];
    for (let x = X0; x <= X1 + 1e-6; x += 0.8) xs.push(x); for (const x of [PX0, PX1]) xs.push(x); xs.sort((a, b) => a - b);
    for (let z = 0; z >= RZ - 1e-6; z -= 0.6) zs.push(z); zs.push(PZ); zs.sort((a, b) => b - a);
    const ux = [...new Set(xs.map((v) => +v.toFixed(4)))], uz = [...new Set(zs.map((v) => +v.toFixed(4)))];
    for (let j = 0; j < uz.length; j++) for (let i = 0; i < ux.length; i++) P.push(ux[i], 0, uz[j]);
    for (let j = 0; j < uz.length - 1; j++) for (let i = 0; i < ux.length - 1; i++) {
      const xm = (ux[i] + ux[i + 1]) / 2, zm = (uz[j] + uz[j + 1]) / 2; if (xm > PX0 && xm < PX1 && zm > PZ) continue;
      const a = j * ux.length + i, b = a + 1, c = a + ux.length, d = c + 1; I.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    add(g, 'asphalt', 0, 0, 0, {cast: false});
    // боковая грань асфальта у дальнего края и бордюр-обочина
    box(80, AS, 0.2, 'asphalt', 0, -AS / 2, RZ - 0.1 + 0.001, {r: 0.01, cast: false});
    for (let x = -38; x < 38; x += 3) box(1.5, 0.03, 0.13, 'white', x + 0.75, 0.03, -3.7, {r: 0.01, cast: false});
    box(80, 0.03, 0.12, 'white', 0, 0.03, RZ + 0.25, {r: 0.01, cast: false});
  }
  // поле/обочина: материал с меняющимся цветом (трава → снег)
  const fieldMat = new THREE.MeshStandardMaterial({color: '#8fbf5e', flatShading: true, roughness: 1});
  {
    const nx = 90, nz = 36, P = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { let x = lerp(X0, X1, i / nx), z = lerp(RZ - 0.2, -34, j / nz); if (j > 0 && i > 0 && i < nx) { x += (hash3(i, j, 1) - 0.5) * 0.5; z += (hash3(i, j, 2) - 0.5) * 0.4; } P.push(x, S(x, z) + (j > 1 ? (hash3(i, j, 3) - 0.5) * 0.15 : 0), z); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, fieldMat); m.receiveShadow = true; scene.add(m);
  }
  const hillMat = new THREE.MeshStandardMaterial({color: '#93b79a', flatShading: true, roughness: 1});
  {
    const nx = 80, nz = 20, P = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = lerp(-120, 120, i / nx), z = lerp(-33, -110, j / nz); P.push(x, S(x, -33) - 0.2 + 9 * sm((-z - 33) / 50) * (0.5 + 0.5 * Math.sin(x * 0.05 + 1)) + 1.2 * vnoise(x * 0.1, 1, z * 0.1) + (hash3(i, j, 8) - 0.5) * 1.0, z); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, hillMat));
  }
  hills(K, 'hillFar', -100, -170, (x, z) => 6 + 16 * sm((-z - 100) / 50) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)), 6);

  // ── заплатка из 4 кусков асфальта (трещины между ними), кусками и провалится
  const pieces = [];
  {
    const cx = 0.03, cz = -0.62;
    const jag = (a, b, n, amp, seed) => { const o = []; for (let i = 1; i < n; i++) { const t = i / n; o.push([lerp(a[0], b[0], t) + (hash3(i, seed, 1) - 0.5) * amp, lerp(a[1], b[1], t) + (hash3(i, seed, 2) - 0.5) * amp]); } return o; };
    // точки на краях: верх/низ по z (0 и PZ), лево/право по x; линии трещин: (cx,0)→(cx,PZ) и (PX0,cz)→(PX1,cz)
    const C0 = [cx, 0], C1 = [cx, PZ], L0 = [PX0, cz], L1 = [PX1, cz], M = [cx + 0.02, cz + 0.03];
    const v1 = jag(C0, M, 3, 0.08, 1), v2 = jag(M, C1, 3, 0.08, 2), h1 = jag(L0, M, 3, 0.08, 3), h2 = jag(M, L1, 3, 0.08, 4);
    const quads = [
      [[PX0, 0], C0, ...v1, M, ...h1.slice().reverse(), L0],
      [C0, [PX1, 0], L1, ...h2.slice().reverse(), M, ...v1.slice().reverse()],
      [L0, ...h1, M, ...v2, C1, [PX0, PZ]],
      [M, ...h2, L1, [PX1, PZ], C1, ...v2.slice().reverse()],
    ];
    quads.forEach((q, i) => {
      const sh = new THREE.Shape(q.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ExtrudeGeometry(sh, {depth: AS - 0.004, bevelEnabled: false}); g.computeVertexNormals();
      const m = add(g, 'asphalt', 0, -AS, 0, {rot: [-Math.PI / 2, 0, 0], cast: true});
      // центр куска (для падения)
      let sx = 0, sz = 0; q.forEach(([x, z]) => { sx += x; sz += z; }); m.userData.c = [sx / q.length, sz / q.length]; m.userData.i = i;
      pieces.push(m);
    });
  }
  // яма: тёмная чаша под заплаткой (видна, когда куски провалились), лужа в ней
  const PB = -0.62; // дно ямы
  const liner = [];
  liner.push(box(PX1 - PX0, 0.3, 0.06, 'asphalt', 0, -0.155, PZ - 0.03, {r: 0.005, cast: false}));
  liner.push(box(PX1 - PX0, -AS - PB, 0.06, 'gravel', 0, (PB - AS) / 2, PZ - 0.03, {r: 0.005, cast: false}));
  for (const sx of [PX0 - 0.03, PX1 + 0.03]) { liner.push(box(0.06, 0.3, -PZ, 'asphalt', sx, -0.155, PZ / 2 - 0.005, {r: 0.005, cast: false})); liner.push(box(0.06, -AS - PB, -PZ, 'gravel', sx, (PB - AS) / 2, PZ / 2 - 0.005, {r: 0.005, cast: false})); }
  liner.push(box(PX1 - PX0, 0.06, -PZ, 'dark', 0, PB - 0.03, PZ / 2 - 0.005, {r: 0.005, cast: false}));
  const bowl = {set visible(v) { liner.forEach((m) => (m.visible = v)); }};
  const puddle = add(new THREE.BoxGeometry(PX1 - PX0 - 0.04, 0.02, -PZ - 0.06), 'water', 0, PB + 0.22, PZ / 2 - 0.03, {mat: {water: 1, opacity: 0.8, smooth: true}, cast: false, ro: 3});

  // ── на срезе: трещина, вода в ней, линза льда, пустота (плоские фигуры чуть перед срезом)
  const shapeMesh = (pts, color, z, ro, op = 1) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({color, transparent: op < 1, opacity: op, depthWrite: false}));
    m.position.z = z; m.renderOrder = ro; scene.add(m); return m;
  };
  // трещина: клин от поверхности вниз (масштаб по y — глубина, по x — ширина)
  const crackPts = [[-0.5, 0], [0.5, 0], [0.12, -0.35], [0.22, -0.55], [0.02, -1.0], [-0.1, -0.6], [-0.25, -0.4]];
  const crack = shapeMesh(crackPts, '#2a2622', 0.02, 5); crack.position.set(0.03, 0, 0.02);
  const water = shapeMesh(crackPts, '#3d8fd8', 0.025, 6); water.position.set(0.03, 0, 0.025);
  const ice = shapeMesh(crackPts, '#e6f4ff', 0.03, 7); ice.position.set(0.03, 0, 0.03);
  // линза льда под асфальтом в щебне
  const lensPts = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; lensPts.push([Math.cos(a) * 0.75 * (1 + 0.06 * Math.sin(a * 5)), Math.sin(a) * 0.2 * (1 + 0.1 * Math.cos(a * 3))]); }
  const lens = shapeMesh(lensPts, '#d8eefc', 0.035, 8); lens.position.set(0, -AS - 0.18, 0.035);
  const lensRim = shapeMesh(lensPts, '#9cc8ea', 0.032, 7); lensRim.position.set(0, -AS - 0.18, 0.032);
  const voidM = shapeMesh(lensPts, '#2c2420', 0.034, 8); voidM.position.set(0, -AS - 0.16, 0.034);

  // ── машина
  const car = new THREE.Group(); scene.add(car);
  const body = new THREE.Group(); car.add(body);
  const CZ = -1.8;
  box(3.9, 0.62, 1.72, 'carBody', 0, 0.62, 0, {parent: body, r: 0.16});
  box(2.2, 0.6, 1.56, 'carBody', -0.25, 1.18, 0, {parent: body, r: 0.18});
  for (const s of [-1, 1]) {
    box(0.95, 0.42, 0.04, 'glassDark', 0.28, 1.2, s * 0.79, {parent: body, r: 0.06, cast: false});
    box(0.85, 0.42, 0.04, 'glassDark', -0.78, 1.2, s * 0.79, {parent: body, r: 0.06, cast: false});
  }
  box(0.04, 0.44, 1.32, 'glassDark', 0.86, 1.18, 0, {parent: body, r: 0.04, cast: false, rot: [0, 0, 0.5]});
  for (const s of [-1, 1]) box(0.05, 0.16, 0.36, 'lamp', 1.96, 0.72, s * 0.6, {parent: body, r: 0.04, cast: false, mat: {emissive: 1, ei: 1.0, win: 1}});
  for (const s of [-1, 1]) box(0.05, 0.14, 0.3, 'red', -1.96, 0.72, s * 0.62, {parent: body, r: 0.04, cast: false, mat: {emissive: 1, ei: 0.6}});
  box(4.0, 0.12, 1.76, 'dark', 0, 0.36, 0, {parent: body, r: 0.05, cast: false});
  const wheels = [];
  for (const [wx, wz] of [[1.25, 0.82], [-1.25, 0.82], [1.25, -0.82], [-1.25, -0.82]]) {
    const w = new THREE.Group(); w.position.set(wx, 0.34, wz); car.add(w);
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), 'tyre', 0, 0, 0, {parent: w, rot: [Math.PI / 2, 0, 0]});
    add(new THREE.CylinderGeometry(0.18, 0.18, 0.26, 8), 'metal', 0, 0, 0, {parent: w, rot: [Math.PI / 2, 0, 0], cast: false});
    wheels.push(w);
  }
  car.position.set(-30, 0, CZ);
  // фары ночью
  const carLight = new THREE.PointLight(0xffe6b0, 0, 9, 2); carLight.userData.base = 6; carLight.position.set(2.4, 0.8, 0); car.add(carLight); K.lamps.push(carLight);

  // ── обочина: фонари, знак, деревья, деревня вдали
  for (const x of [-14, 2.2, 18]) {
    const z = RZ - 0.9, y = S(x, z);
    cyl(0.07, 0.09, 4.6, 'metal', x, y + 2.3, z, {seg: 8});
    box(0.9, 0.08, 0.12, 'metal', x + 0.4, y + 4.55, z, {r: 0.02});
    box(0.42, 0.12, 0.26, 'dark', x + 0.82, y + 4.48, z, {r: 0.04});
    box(0.32, 0.04, 0.18, 'lamp', x + 0.82, y + 4.41, z, {r: 0.01, cast: false, mat: {emissive: 1, ei: 1, win: 1}});
    const pl = new THREE.PointLight(0xffd59a, 0, 14, 1.6); pl.userData.base = 9; pl.position.set(x + 0.82, y + 4.2, z); scene.add(pl); K.lamps.push(pl);
  }
  { // знак «Неровная дорога»: треугольник с красной каймой
    const x = -4.0, z = RZ - 1.0, y = S(x, z);
    cyl(0.04, 0.04, 2.2, 'metal', x, y + 1.1, z, {seg: 6});
    const tri = (r, role, dz) => { const sh = new THREE.Shape(); for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + i * Math.PI * 2 / 3; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } sh.closePath(); return add(new THREE.ExtrudeGeometry(sh, {depth: 0.03, bevelEnabled: false}), role, x, y + 2.15, z + dz, {cast: false}); };
    tri(0.5, 'red', 0.0); tri(0.34, 'white', 0.035);
    for (const dx of [-0.12, 0.12]) box(0.12, 0.05, 0.02, 'dark', x + dx, y + 2.07 + (dx > 0 ? 0.03 : 0), z + 0.085, {r: 0.01, cast: false});
  }
  const birch = (x, z, h, seed) => {
    const y0 = S(x, z) - 0.05; const t = tree(x, y0, z, h, 0.9, seed, {bare: true}); t.g.children[0].material = K.M('birch'); return t;
  };
  for (const [x, z, h, s] of [[-9, -10, 3.4, 3], [7.5, -9.5, 3.0, 4], [13, -12, 3.6, 5], [-17, -13, 3.2, 6], [3, -15, 3.8, 7]]) birch(x, z, h, s);
  for (const [x, z, s] of [[-12, -11.5, 1.4], [-20, -16, 1.8], [10, -17, 1.6], [19, -14, 1.5], [-5, -19, 1.7], [24, -22, 2.0], [-28, -22, 2.0]]) fir(x, S(x, z) - 0.05, z, s, false);
  // деревня вдали: домики с трубами
  const village = [];
  for (const [x, z, c] of [[-24, -27, 'wall'], [-18, -29, 'brick'], [16, -28, 'wall'], [23, -30, 'wall']]) {
    const y = S(x, z), g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    box(3.2, 2.0, 2.6, c, 0, 1.0, 0, {parent: g, r: 0.04});
    const sh = new THREE.Shape(); sh.moveTo(-1.85, 0); sh.lineTo(1.85, 0); sh.lineTo(0, 1.4); sh.closePath();
    add(new THREE.ExtrudeGeometry(sh, {depth: 3.0, bevelEnabled: false}), 'roof', 0, 2.0, -1.5, {parent: g});
    box(0.8, 0.7, 0.05, 'glass', 0.6, 1.1, 1.33, {parent: g, r: 0.02, cast: false, mat: {emissive: 1, ei: 0.9, win: 1}});
    box(0.4, 1.0, 0.4, 'brick', 0.8, 2.9, -0.4, {parent: g, r: 0.03});
    village.push(smoke(x + 0.8, y + 3.45, z - 0.4, 5, 0.9));
  }
  // сугробы на обочине (растут зимой)
  const drifts = [];
  { const r = rnd(9); for (let i = 0; i < 26; i++) { const x = lerp(-30, 30, r()), z = RZ - 0.5 - r() * 1.2; const m = add(blob(0.6 + r() * 0.5, i, 0.2, 1.5, 1.6, 0.45, 1.0), 'snow', x, S(x, z) - 0.05, z, {cast: false}); m.userData.s = 1; drifts.push(m); } }
  const clouds = [cloud(sky, -6, 12, -18, 1.6, 51), cloud(sky, 7, 15, -26, 1.9, 52), cloud(sky, 12, 10, -15, 1.0, 53), cloud(sky, -13, 16, -36, 2.3, 54)];
  const cloudMat = K.M('cloud');

  // ── осадки: дождь (вытянутые капли) и снег
  const rain = [], flakes = [];
  { const rg = new THREE.BoxGeometry(0.035, 0.45, 0.035), rm = new THREE.MeshBasicMaterial({color: '#cfe0f0', transparent: true, opacity: 0.55, depthWrite: false}); const r = rnd(41);
    for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(rg, rm); m.userData.p = [lerp(-8, 8, r()), r(), lerp(-9, 3, r())]; m.rotation.z = 0.12; m.renderOrder = 9; scene.add(m); rain.push(m); }
    const fg = new THREE.IcosahedronGeometry(0.05, 0), fm = K.M('white', {emissive: 1, ei: 0.35});
    for (let i = 0; i < 180; i++) { const m = new THREE.Mesh(fg, fm); m.userData.p = [lerp(-12, 12, r()), r(), lerp(-12, 3, r()), r() * 6.28]; scene.add(m); flakes.push(m); } }

  const cGrass = new THREE.Color('#8fbf5e'), cSnow = new THREE.Color('#f2f5fa'), cHill = new THREE.Color('#93b79a'), cHillS = new THREE.Color('#e3eaf2');
  const crackGeoY = 1; // глубина трещины в м на единицу параметра
  // q: car — x машины; hole 0..1 — куски провалились; crack 0..2 — глубина трещины (1 — асфальт, 2 — в щебень);
  // water/ice 0..1 — заполнение трещины; lens 0..1 — линза льда; heave 0..1 — подъём заплатки; voidA 0..1 — пустота;
  // winter 0..1 — снег вокруг; rain/snow 0..1; puddle 0..1
  const v = new THREE.Vector3();
  const animate = (q) => {
    const t = q.t;
    village.forEach((f) => f(t, 1));
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.2 + 0.05 * i); });
    const w = q.winter ?? 0;
    fieldMat.color.copy(cGrass).lerp(cSnow, w); hillMat.color.copy(cHill).lerp(cHillS, w);
    drifts.forEach((m) => { m.scale.setScalar(Math.max(0.001, w)); m.visible = w > 0.02; });
    // машина
    const cx = q.car ?? -30; car.position.x = cx; car.visible = cx > -28 && cx < 28;
    wheels.forEach((wh) => { wh.rotation.z = -cx / 0.34; });
    const h = q.hole ?? 0;
    const near = Math.max(0, 1 - Math.abs(cx + 1.25) / 0.5) + Math.max(0, 1 - Math.abs(cx - 1.25) / 0.5);
    body.position.y = -0.1 * near * sm(h * 2 - 1); body.rotation.x = 0.04 * near * sm(h * 2 - 1);
    // куски заплатки: подъём (лёд) и провал
    const hv = (q.heave ?? 0) * 0.09;
    pieces.forEach((m) => {
      const [px, pz] = m.userData.c, i = m.userData.i, f = sm((h - i * 0.08) / 0.6);
      m.position.set(px * 0.12 * f, -AS + hv - f * (0.2 + 0.04 * i), pz * 0.08 * f);
      m.rotation.set(-Math.PI / 2 + (hash3(i, 1, 1) - 0.5) * 0.7 * f, (hash3(i, 2, 1) - 0.5) * 0.5 * f, (hash3(i, 3, 1) - 0.5) * 0.6 * f);
    });
    bowl.visible = h > 0.02; puddle.visible = (q.puddle ?? 0) > 0.02 && h > 0.5; puddle.material.opacity = 0.8 * (q.puddle ?? 0);
    // трещина
    const cr = q.crack ?? 0, depth = Math.min(cr, 1) * AS + Math.max(0, cr - 1) * 0.45, wid = 0.12 + 0.14 * Math.max(0, cr - 1) + 0.06 * (q.lens ?? 0);
    crack.visible = cr > 0.01 && h < 0.3; crack.scale.set(wid, Math.max(0.001, depth), 1); crack.position.y = hv;
    const wa = q.water ?? 0, ic = q.ice ?? 0;
    water.visible = crack.visible && wa > 0.01; water.scale.set(wid * 0.7, Math.max(0.001, depth * wa), 1); water.position.y = hv;
    ice.visible = crack.visible && ic > 0.01; ice.scale.set(wid * 0.8, Math.max(0.001, depth * ic * Math.min(1, wa + 0.2)), 1); ice.position.y = hv;
    const ln = q.lens ?? 0; lens.visible = lensRim.visible = ln > 0.01 && h < 0.3;
    lens.scale.set(Math.max(0.001, ln), Math.max(0.001, ln), 1); lensRim.scale.set(Math.max(0.001, ln * 1.06), Math.max(0.001, ln * 1.25), 1);
    const vd = q.voidA ?? 0; voidM.visible = vd > 0.01 && h < 0.5; voidM.scale.set(Math.max(0.001, vd * 0.95), Math.max(0.001, vd * 0.9), 1);
    // осадки
    const rn = q.rain ?? 0;
    rain.forEach((m, i) => { const [x, ph, z] = m.userData.p, y = 9 - (((ph * 10 + t * 9) % 10 + 10) % 10); m.position.set(x + (9 - y) * 0.12, y, z); m.visible = i / rain.length < rn && y > (z > RZ ? 0.3 : S(x, z) + 0.2); });
    const sn = q.snow ?? 0;
    flakes.forEach((m, i) => { const [x0, ph, z, a] = m.userData.p, y = 11 - (((ph * 12 + t * 0.9) % 12 + 12) % 12), x = x0 + 0.4 * Math.sin(t * 0.7 + a); m.position.set(x, y, z); m.visible = i / flakes.length < sn && y > (z > RZ ? 0.3 : S(x, z) + 0.1); });
    void v; void crackGeoY; void cloudMat;
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
