// @ts-nocheck
// Мир «Колодец: почему копают в конце лета» (18.11): летний участок, дом, яблоня, колодец из бетонных колец с домиком и воротом.
// Разрез: дёрн, почва, водоносный песок (в нём «зеркало» грунтовых вод ходит вверх-вниз по сезонам), глина-водоупор, камень.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, house, fence, rnd, sm, lerp, hash3, vnoise} from '../kit';

export function S(x, z) {
  return 1.1 * sm((x - 5) / 6) + 1.2 * sm((-z - 8) / 9) + 0.8 * sm((-x - 8) / 8) * sm((-z - 2) / 6) + 0.06 * Math.sin(x * 1.3 + z * 0.7) * sm((-z - 1.2) / 3);
}
const BOT = -16;
const B = [
  (x) => S(x, 0),
  (x) => S(x, 0) - 0.25,
  (x) => S(x, 0) * 0.7 - 0.85 - 0.05 * Math.sin(x * 1.4),
  (x) => -5.6 + 0.25 * Math.sin(x * 0.4 + 1) + 0.1 * Math.sin(x * 1.2),
  (x) => -9.5 + 0.3 * Math.sin(x * 0.33 + 2),
  () => BOT,
];
const LAYERS = ['grass', 'soil', 'sand', 'clay', 'rock'];
export const WX = 1.75; // края выреза (WX ± RO) — на сетке разреза 0.25 м, иначе щель
const RI = 0.58, RO = 0.75, RING = 0.9, TOP = 0.75; // кольца: внутр./наружн. радиус, высота; верх колодца над землёй
const MAXB = -5.25; // самое глубокое дно (после докопки)

export const T = {
  well: [WX, 1.2, -0.3], mirror: [-6, -1.3, 0.05], waterIn: [WX, -2.0, 0.05], dry: [WX, -3.2, 0.05], roots: [-4.2, -1.8, 0.05],
  sand: [-9, -3.0, 0.05], clay: [-9, -7.0, 0.05], bucket: [WX, 1.0, 0.0], bottom: [WX, -4.9, 0.05],
};
export const CAMS = {
  hook: {pos: [4.6, 2.6, 9.5], look: [1.0, 0.0, -0.6], fov: 40},
  hook2: {pos: [3.2, 0.9, 8.8], look: [1.7, -1.6, -0.2], fov: 40},
  cut: {pos: [4.0, 1.2, 19], look: [-1.0, -2.6, 0], fov: 40},
  mirror: {pos: [-2.5, 0.2, 15], look: [-3.5, -2.4, 0], fov: 40},
  roots: {pos: [-2.0, 1.4, 13.5], look: [-3.8, -1.2, -0.5], fov: 40},
  well: {pos: [3.6, -1.0, 9.5], look: [1.8, -2.6, 0], fov: 40},
  wellDeep: {pos: [3.4, -2.6, 9.0], look: [1.8, -3.9, 0], fov: 40},
  wide: {pos: [7.5, 5.5, 27], look: [-0.5, -1.0, -1], fov: 40},
  final: {pos: [9, 6.5, 30], look: [-1.0, 0.0, -3], fov: 40},
  cover: {pos: [4.4, 1.6, 12], look: [0.8, -1.4, -0.3], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {grass: '#8fc35c', soil: '#7d5a44', sand: '#f0d496', clay: '#c9825a', rock: '#8a8fa6', leaf: '#5aa456', leaf2: '#8cc762'});
  const {add, box, cyl, blob, pipe, tree, fir, cloud} = K;
  const X0 = -40, X1 = 40, Z0 = -30;
  const HOLES = [{x0: WX - RO, x1: WX + RO, y0: MAXB - 0.3, y1: 5}];
  cutFace(K, LAYERS, (k, x) => B[k](x), X0, X1, HOLES);
  // трава/поле с меняющимся цветом (весна → август)
  const grassMat = new THREE.MeshStandardMaterial({color: '#8fc35c', flatShading: true, roughness: 1});
  const g0 = ground(K, S, 'grass', X0, X1, Z0); g0.material = grassMat;
  hills(K, 'hillMid', -29.5, -60, (x, z) => S(x, -30) - 0.3 + 6 * sm((-z - 30) / 24) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + 0.8 * vnoise(x * 0.15, 0, z * 0.15), 3);
  hills(K, 'hillFar', -56, -150, (x, z) => 3 + 13 * sm((-z - 56) / 50) * (0.55 + 0.45 * Math.sin(x * 0.045 + 2.5)) + 1.6 * vnoise(x * 0.08, 3, z * 0.08), 5);

  // камни в почве и глине, галька в песке
  {
    const r = rnd(11), inHole = (x, y, m) => x > WX - RO - m && x < WX + RO + m;
    for (let i = 0, n = 0; i < 600 && n < 26; i++) { const x = lerp(-14, 14, r()), y = lerp(-9, -6.0, r()), rr = 0.18 + r() * 0.3; if (inHole(x, y, rr + 0.1) || y > B[3](x) - rr || y < B[4](x) + rr) continue; add(blob(rr, n * 3 + 1, 0.25, 1.3, 1.25, 0.8, 0.5), 'stone', x, y, 0, {cast: false, rot: [0, 0, r() * 3]}); n++; }
    for (let i = 0, n = 0; i < 1200 && n < 70; i++) { const x = lerp(-14, 14, r()), y = lerp(-5.4, -1.0, r()), rr = 0.06 + r() * 0.08; if (inHole(x, y, rr + 0.05) || y > B[2](x) - rr) continue; add(blob(rr, n * 1.7 + 40, 0.2, 1.2, 1.2, 0.85, 0.5, 0), 'pebble', x, y, 0, {cast: false}); n++; }
    for (let i = 0, n = 0; i < 300 && n < 18; i++) { const x = lerp(-14, 14, r()), y = lerp(-14.5, -10.5, r()), rr = 0.3 + r() * 0.5; add(blob(rr, n * 2 + 90, 0.3, 1.2, 1.5, 0.7, 0.4), 'deep', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); n++; }
  }

  // ── зеркало грунтовых вод: синяя вуаль в песке от уровня L до глины (не в колодце)
  const waterTable = (() => {
    const xs = []; for (let x = -16; x <= 16.001; x += 0.25) xs.push(x);
    const P = new Float32Array(xs.length * 2 * 3), I = [];
    for (let i = 0; i < xs.length - 1; i++) { const xm = xs[i] + 0.125; if (xm > WX - RO - 0.01 && xm < WX + RO + 0.01) continue; const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(I);
    const m = new THREE.MeshBasicMaterial({color: '#3d8fe0', transparent: true, opacity: 0.5, depthWrite: false});
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 3; mesh.frustumCulled = false; scene.add(mesh);
    // линия зеркала
    const lg = new THREE.BufferGeometry(); const LP = new Float32Array(xs.length * 2 * 3); lg.setAttribute('position', new THREE.BufferAttribute(LP, 3)); lg.setIndex(I.slice());
    const lm = new THREE.MeshBasicMaterial({color: '#2f7fd0', transparent: true, opacity: 0.9, depthWrite: false}); const line = new THREE.Mesh(lg, lm); line.renderOrder = 4; line.frustumCulled = false; scene.add(line);
    const set = (L, t) => {
      xs.forEach((x, i) => {
        const yt = L + 0.06 * Math.sin(x * 0.9 + t * 0.8) + 0.12 * sm((x + 6) / 4) * 0 , yb = B[3](x);
        P.set([x, Math.max(yt, yb), 0.04, x, yb, 0.04], i * 6);
        LP.set([x, Math.max(yt, yb) + 0.04, 0.045, x, Math.max(yt, yb) - 0.04, 0.045], i * 6);
      });
      g.attributes.position.needsUpdate = true; lg.attributes.position.needsUpdate = true; g.computeBoundingSphere();
    };
    return {set};
  })();

  // ── колодец: кольца (сзади половина, над землёй целиком), срез колец, вода внутри, дно
  const wellG = new THREE.Group(); scene.add(wellG);
  const ringsAll = [];
  const nR = Math.round((TOP - MAXB) / RING);
  for (let i = 0; i < nR; i++) {
    const yTop = TOP - i * RING, yc = yTop - RING / 2, under = yTop <= 0.05;
    const grp = new THREE.Group(); grp.position.y = yc; wellG.add(grp);
    // кольцо в разрезе: задняя половина + срез стенки; над землёй ещё и верхний торец
    cyl(RI, RI, RING - 0.02, 'concrete', WX, 0, 0, {parent: grp, seg: 20, open: true, ts: Math.PI / 2, tl: Math.PI, mat: {side: THREE.DoubleSide}});
    if (!under) cyl(RO, RO, RING - 0.02, 'concrete', WX, 0, 0, {parent: grp, seg: 20, open: true, ts: Math.PI / 2, tl: Math.PI});
    if (!under) { const top = new THREE.RingGeometry(RI, RO, 20, 1, 0, Math.PI); top.rotateX(-Math.PI / 2); add(top, 'concrete', WX, RING / 2 - 0.01, 0, {parent: grp, cast: false}); }
    for (const s2 of [-1, 1]) box(RO - RI, RING - 0.02, 0.04, 'concreteCut', WX + s2 * (RI + RO) / 2, 0, -0.02, {parent: grp, r: 0.005, cast: false});
    // шов между кольцами
    ringsAll.push({grp, yTop, under});
  }
  // дно (щебень) и вода
  const bottom = new THREE.Group(); scene.add(bottom);
  { const r = rnd(5); for (let i = 0; i < 9; i++) { const a = r() * Math.PI, rr = r() * (RI - 0.15); add(blob(0.09 + r() * 0.06, i + 300, 0.25, 1.3, 1.2, 0.7, 1.0, 0), 'pebble', WX + Math.cos(a) * rr, 0.06, -Math.sin(a) * rr * 0.9 - 0.05, {parent: bottom, cast: false}); }
    add(new THREE.CylinderGeometry(RI - 0.005, RI - 0.005, 0.2, 18, 1, false, Math.PI / 2, Math.PI), 'gravel', WX, -0.09, 0, {parent: bottom, cast: false}); }
  const wMat = new THREE.MeshStandardMaterial({color: '#3f95dd', transparent: true, opacity: 0.82, roughness: 0.3, depthWrite: false, flatShading: false});
  const wBody = new THREE.Mesh(new THREE.CylinderGeometry(RI - 0.02, RI - 0.02, 1, 18, 1, true, Math.PI / 2, Math.PI), wMat); wBody.material.side = THREE.DoubleSide; wBody.renderOrder = 5; wBody.position.x = WX; scene.add(wBody);
  const wFront = new THREE.Mesh(new THREE.PlaneGeometry(2 * (RI - 0.02), 1), wMat); wFront.position.set(WX, 0, 0.012); wFront.renderOrder = 5; scene.add(wFront);
  const wTopG = new THREE.CircleGeometry(RI - 0.02, 18, 0, Math.PI); wTopG.rotateX(-Math.PI / 2);
  const wTop = new THREE.Mesh(wTopG, new THREE.MeshStandardMaterial({color: '#6cb6ee', transparent: true, opacity: 0.9, roughness: 0.2, depthWrite: false})); wTop.position.x = WX; wTop.renderOrder = 6; scene.add(wTop);
  // песок под дном до будущей глубины (закрывает вырез, пока не докопали)
  const plug = new THREE.Group(); plug.position.set(0, MAXB - 0.3, 0); scene.add(plug);
  const plugM = box(2 * RO + 0.02, 1, 0.06, 'sand', WX, 0.5, -0.02, {parent: plug, r: 0.005, cast: false});

  // домик над колодцем: стойки, двускатная крыша, ворот с ручкой, цепь и ведро
  const wy = TOP;
  for (const s of [-1, 1]) box(0.1, wy + 1.15, 0.1, 'wood', WX + s * (RO + 0.1), (wy + 1.15) / 2, -0.12, {r: 0.02});
  { const sh = new THREE.Shape(); sh.moveTo(-1.05, 0); sh.lineTo(1.05, 0); sh.lineTo(0, 0.75); sh.closePath();
    add(new THREE.ExtrudeGeometry(sh, {depth: 0.08, bevelEnabled: false}), 'woodDark', WX, wy + 1.1, -0.2, {});
    const ang = Math.atan2(0.75, 1.05), len = Math.hypot(1.05, 0.75) + 0.2;
    for (const s of [-1, 1]) { const m = box(len, 0.07, 1.1, 'roof', WX + s * 0.5, wy + 1.52, -0.62, {r: 0.02}); m.rotation.z = -ang * s; } }
  const drum = cyl(0.13, 0.13, 1.6, 'wood', WX, wy + 0.95, -0.12, {rot: [0, 0, Math.PI / 2], seg: 10});
  const crank = new THREE.Group(); crank.position.set(WX + 0.86, wy + 0.95, -0.12); scene.add(crank);
  box(0.06, 0.38, 0.06, 'metal', 0.0, -0.16, 0, {parent: crank, r: 0.01}); box(0.06, 0.06, 0.26, 'woodDark', 0, -0.33, 0.1, {parent: crank, r: 0.01});
  const chain = cyl(0.02, 0.02, 1, 'metal', WX, 0, -0.12, {seg: 5, cast: false});
  const bucket = new THREE.Group(); scene.add(bucket);
  cyl(0.2, 0.15, 0.32, 'bucket', 0, 0, 0, {parent: bucket, seg: 12}); add(new THREE.TorusGeometry(0.19, 0.012, 4, 14, Math.PI), 'metal', 0, 0.16, 0, {parent: bucket, cast: false});
  // скамейка с ведром воды рядом
  { const bx = 3.6, bz = -0.9, y = S(bx, bz); box(1.2, 0.07, 0.35, 'wood', bx, y + 0.45, bz, {r: 0.02}); for (const s of [-1, 1]) box(0.07, 0.44, 0.3, 'woodDark', bx + s * 0.5, y + 0.22, bz, {r: 0.01});
    cyl(0.17, 0.13, 0.28, 'bucket', bx + 0.3, y + 0.63, bz, {seg: 12}); }

  // ── дом, яблоня с корнями в разрезе, ели, грядки, забор, облака
  const HX = -6.6; house(K, HX, -7.2, -2.4, {});
  const apple = tree(-3.6, S(-3.6, -0.8) - 0.05, -0.8, 2.6, 1.15, 31);
  { const r = rnd(8); for (let i = 0; i < 16; i++) { const a = r() * 6.28, h = 0.2 + r() * 1.4, rr = 0.9 + r() * 0.6; add(new THREE.IcosahedronGeometry(0.11, 0), 'red', Math.cos(a) * rr, h, Math.sin(a) * rr * 0.8, {parent: apple.crown, cast: false}); } }
  const roots = [];
  for (const [dx, dy, bend] of [[-1.6, -2.4, 0.4], [-0.5, -3.0, -0.3], [0.8, -2.8, 0.35], [1.7, -2.0, -0.4], [0.1, -3.4, 0.2]]) {
    const x = -3.6, y0 = S(x, 0);
    roots.push(K.tube([[x, y0, 0.02], [x + dx * 0.35 + bend * 0.3, y0 + dy * 0.35, 0.02], [x + dx * 0.75 - bend * 0.25, y0 + dy * 0.75, 0.02], [x + dx, y0 + dy, 0.02]], 0.06, 'trunk', {cast: false, rs: 5, n: 14}));
  }
  cyl(0.36, 0.42, 0.5, 'trunk', -3.6, S(-3.6, -0.4) - 0.2, -0.4, {seg: 9});
  for (const [x, z, s] of [[8.5, -6, 1.3], [-11, -5, 1.5], [11.5, -10, 1.6], [-14, -11, 1.7], [4, -13, 1.5], [-2, -15, 1.6], [14, -15, 1.7], [-19, -18, 1.9]]) fir(x, S(x, z) - 0.05, z, s, false);
  tree(6.6, S(6.6, -3.2) - 0.05, -3.2, 2.4, 1.0, 41);
  // грядки
  for (let i = 0; i < 3; i++) { const x = -1.2 + i * 0.0, z = -2.6 - i * 0.9; box(2.4, 0.22, 0.6, 'soil', x, S(x, z) + 0.06, z, {r: 0.04}); for (let k = 0; k < 6; k++) add(blob(0.14, i * 10 + k, 0.2, 1.5, 1, 0.8, 1, 0), 'leaf2', x - 1.0 + k * 0.4, S(x, z) + 0.26, z, {cast: false}); }
  fence(K, S, -1.5, 8.3, -5.6, false);
  const clouds = [cloud(sky, -5, 11, -16, 1.5, 51), cloud(sky, 6, 14, -24, 1.8, 52), cloud(sky, 9, 9.5, -14, 0.9, 53), cloud(sky, -11, 15, -34, 2.2, 54)];
  const rain = []; { const rg = new THREE.BoxGeometry(0.03, 0.4, 0.03), rm = new THREE.MeshBasicMaterial({color: '#cfe0f0', transparent: true, opacity: 0.5, depthWrite: false}); const r = rnd(41);
    for (let i = 0; i < 150; i++) { const m = new THREE.Mesh(rg, rm); m.userData.p = [lerp(-9, 9, r()), r(), lerp(-9, 3, r())]; m.rotation.z = 0.1; m.renderOrder = 9; scene.add(m); rain.push(m); } }

  const cG = new THREE.Color('#8fc35c'), cD = new THREE.Color('#c9b76a');
  // q: level — уровень зеркала (м, отрицательный); depth — глубина дна колодца (м, отрицательная); dry 0..1 — выгоревшая трава;
  // rain 0..1; bucket 0..1 — ведро опускается до воды; table 0..1 — видна вуаль зеркала
  const animate = (q) => {
    const t = q.t, L = q.level ?? -1.2, D = q.depth ?? -3.15;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.2 + 0.05 * i); });
    grassMat.color.copy(cG).lerp(cD, q.dry ?? 0);
    waterTable.set(L, t);
    // кольца ниже дна скрыты; кольцо, частично ниже — видно (кольца ставятся целиком: дно = низ последнего кольца)
    // кольцо, через которое проходит дно, видно частично (растёт вниз) — без выскакивания
    ringsAll.forEach(({grp, yTop}) => { const f = Math.min(1, Math.max(0, (yTop - D) / RING)); grp.visible = f > 0.01; grp.scale.y = Math.max(0.01, f); grp.position.y = yTop - RING * f / 2; });
    bottom.position.set(0, D, 0);
    plug.scale.y = Math.max(0.001, (D - (MAXB - 0.3)) / 1); plugM.visible = D > MAXB - 0.25;
    // вода в колодце: от дна до зеркала (если зеркало ниже дна — сухо)
    const hW = L - D, wet = hW > 0.02;
    wBody.visible = wFront.visible = wTop.visible = wet;
    if (wet) { wBody.scale.y = hW; wBody.position.y = D + hW / 2; wFront.scale.y = hW; wFront.position.y = D + hW / 2; wTop.position.y = L + 0.005; }
    // ведро и цепь
    const bY = lerp(TOP + 0.5, Math.max(L, D + 0.25) + 0.1, sm(q.bucket ?? 0));
    bucket.position.set(WX, bY, -0.12); chain.scale.y = Math.max(0.01, TOP + 0.95 - bY - 0.15); chain.position.y = (TOP + 0.95 + bY + 0.15) / 2;
    drum.rotation.x = (q.bucket ?? 0) * 12; crank.rotation.x = (q.bucket ?? 0) * 12;
    const rn = q.rain ?? 0;
    rain.forEach((m, i) => { const [x, ph, z] = m.userData.p, y = 9 - (((ph * 10 + t * 9) % 10 + 10) % 10); m.position.set(x + (9 - y) * 0.1, y, z); m.visible = i / rain.length < rn && y > (z > 0 ? S(x, 0) + 0.3 : S(x, z) + 0.2); });
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
