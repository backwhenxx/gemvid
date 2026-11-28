// @ts-nocheck
// Мир «Топ-5 самых высоких волн» (28.11): пять фьордов в ряд, 1 ед. = 50 м (честно по высоте заплеска).
// Срез по z = 0 поперёк фьорда: скалы слоями + вода. В каждом фьорде событие q[f*] 0..1:
// 0–0.3 обвал с левой стены, 0.27–0.45 горб волны через фьорд, 0.42–0.66 заплеск по правой стене (лес срезает),
// 0.66–0.92 вода откатывается, остаётся голая полоса. r* — жёлтая рулетка до высоты заплеска.
// Диксон (сейша sei), Вайонт (плотина, вода через гребень, городок внизу), Сент-Хеленс (вулкан, plume),
// Трейси-Арм (ледник, ship — лайнер), Литуя (лодки, es — Эмпайр-стейт-билдинг 443 м).
import * as THREE from 'three';
import {makeKit, rnd, sm, lerp, hash3, vnoise, hills} from '../kit';

const K = 1 / 50;
export const F = [
  {key: 'f5', cx: -64, h: 200 * K, kind: 'grl'},
  {key: 'f4', cx: -32, h: 250 * K, kind: 'dam'},
  {key: 'f3', cx: 0, h: 260 * K, kind: 'volc'},
  {key: 'f2', cx: 32, h: 481 * K, kind: 'glac'},
  {key: 'f1', cx: 64, h: 524 * K, kind: 'lit'},
];
const SL = 1.6, RIDGE = 13.3, FL = -3.2, ZE = -32;
const smin = (a, b, k = 1.4) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));
const fi = (x) => Math.max(0, Math.min(4, Math.round((x + 64) / 32)));
const hw = (i, z) => (i === 1 ? lerp(1.2, 2.6, sm((-z - 16) / 4)) : 1.2);
const floorY = (i, z) => (i === 1 ? lerp(FL, -1.0, sm((-z - 14.6) / 1.2)) : FL) + 14 * sm((-z - 30) / 14);
export function S(x, z) {
  const i = fi(x), u = x - F[i].cx, a = Math.max(0, Math.abs(u) - hw(i, z)), fl = floorY(i, z);
  let y = fl + smin(SL * a, RIDGE - fl);
  y += sm((a - 6.5) / 5) * (1.6 * vnoise(x * 0.13, 1.3, z * 0.13) + 1.8 * Math.max(0, Math.sin(x * 0.33 + z * 0.21 + i)));
  return y;
}
// правая стена: u, где высота поверхности = y (биссекция)
function uAt(i, z, y) {
  let lo = hw(i, z), hi = 15;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (S(F[i].cx + m, z) < y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const TOPZ = (f) => [f.cx + uAt(F.indexOf(f), 0, f.h), f.h, 0.3];
export const T = {
  f5: TOPZ(F[0]), f4: TOPZ(F[1]), f3: TOPZ(F[2]), f2: TOPZ(F[3]), f1: TOPZ(F[4]),
  sei: [-64, 0.4, 0.3], dam: [-32 - 2.5, 1.4, -14.4], town: [-32, -0.6, -24], volc: [0, 29.5, -58], glac: [32, 3.6, -25],
  ship: [32, 1.2, -13], es: [64 - 0.4, 8.86, -2.5], slide1: [64 - 6, 7, -6], trees: [64 + 6.5, S(70.5, -3) + 0.3, -3],
};
const cw = (f) => ({pos: [f.cx + 2, 14, 46], look: [f.cx + 1.5, 6.3, -6], fov: 40});
const ca = (f) => ({pos: [f.cx - 2.5, 13, 36], look: [f.cx - 2.5, 5.5, -6], fov: 40});
export const CAMS = {
  f5: cw(F[0]), f4: cw(F[1]), f3: cw(F[2]), f2: cw(F[3]), f1: cw(F[4]),
  f5a: ca(F[0]), f4a: ca(F[1]), f3a: ca(F[2]), f2a: ca(F[3]), f1a: ca(F[4]),
  f4d: {pos: [-29, 15, 34], look: [-31.5, 1, -16], fov: 40},
  f3v: {pos: [2, 13, 44], look: [0.8, 8, -20], fov: 40},
  f1es: {pos: [66.5, 9, 40], look: [65, 5.2, -4], fov: 40},
  hook: {pos: [67, 7.5, 34], look: [65.2, 5.2, -4], fov: 40},
  hook2: {pos: [66.4, 9.5, 42], look: [65.2, 5.6, -4], fov: 40},
  end: {pos: [34.5, 7, 30], look: [32.5, 2.5, -14], fov: 40},
  end2: {pos: [35, 9, 40], look: [33, 4, -14], fov: 40},
  cover: {pos: [66.5, 9.5, 44], look: [65, 5.6, -4], fov: 40},
};

const C3 = (h) => new THREE.Color(h);
export function build(scene, sky) {
  const Kt = makeKit(scene, {rock: '#868ba0', deep: '#676c84', soil: '#8a6a50', stone: '#b9b3aa', foam: '#e2f3fb', hull: '#f4f1ea', boat: '#c8483a'});
  const {add, box, cyl, blob, cloud, smoke, M} = Kt;
  const VM = new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1});

  // ── земля: своя сетка без дрожания (чтобы плёнки воды ложились точно), цвет по высоте и фьорду
  const cGrass = C3('#5f9a5a'), cForest = C3('#4a8a5e'), cRock = C3('#8d90a2'), cRockG = C3('#8f7c6e'), cSnow = C3('#f2f5fa'), cShore = C3('#a49d90'), cMead = C3('#8fbf62'), cIce = C3('#cfe6f2'), tmp = new THREE.Color();
  const colAt = (x, y, z) => {
    const i = fi(x), n = vnoise(x * 0.4, y * 0.4, z * 0.4) - 0.5, kind = F[i].kind;
    if (kind === 'grl') { if (y > 10.8 + n * 2.5) return cSnow; if (y < 0.35) return cShore; return tmp.copy(cRockG).lerp(cRock, sm((y - 2) / 6) * 0.6 + n * 0.3); }
    if (y > 12.2 + n * 2) return cSnow;
    if (kind === 'glac' && z < -26.5 - n * 2 && y < 10) return cIce;
    if (y < 0.3) return kind === 'dam' && z < -15 ? cMead : cShore;
    if (y > 10.6 + n * 1.5) return tmp.copy(cRock).lerp(cSnow, 0.15);
    if (kind === 'dam' && z < -15 && y < 1.2) return cMead;
    return tmp.copy(cForest).lerp(cGrass, 0.35 + n);
  };
  {
    const X0 = -82, X1 = 82, Z0 = -46, st = 0.5, nx = Math.round((X1 - X0) / st), nz = Math.round(-Z0 / st), P = [], Cl = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = X0 + i * st, z = -j * st, y = S(x, z); P.push(x, y, z); const c = colAt(x, y, z); Cl.push(c.r, c.g, c.b); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3)); g.setIndex(I); g = g.toNonIndexed(); g.computeVertexNormals();
    const m = new THREE.Mesh(g, VM); m.receiveShadow = true; scene.add(m);
  }
  // срез по z = 0: почва, скала, глубинная порода
  {
    const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.45, (x) => Math.min(S(x, 0) - 3, -6 + 0.6 * Math.sin(x * 0.21)), () => -16];
    ['soil', 'rock', 'deep'].forEach((role, k) => {
      const P = [], N = [];
      for (let x = -82; x < 82 - 1e-6; x += 0.25) { const xb = x + 0.25, a0 = B[k + 1](x), a1 = B[k](x), b0 = B[k + 1](xb), b1 = B[k](xb); for (const [u, y] of [[x, a0], [xb, b0], [xb, b1], [x, a0], [xb, b1], [x, a1]]) { P.push(u, y, 0); N.push(0, 0, 1); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      add(g, role, 0, 0, 0, {cast: false, mat: {smooth: true}});
    });
    const r = rnd(5); for (let i = 0; i < 30; i++) { const x = lerp(-80, 80, r()), y = lerp(-15, -2, r()); if (y > S(x, 0) - 1) continue; add(blob(0.25 + r() * 0.35, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); }
  }
  // дальние горы
  hills(Kt, 'hillMid', -45.5, -90, (x, z) => 11 + 8 * sm((-z - 45) / 25) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + 2.5 * vnoise(x * 0.1, 0, z * 0.1), 3);
  hills(Kt, 'hillFar', -86, -180, (x, z) => 14 + 26 * sm((-z - 86) / 60) * (0.55 + 0.45 * Math.sin(x * 0.045 + 2.5)) + 3 * vnoise(x * 0.05, 3, z * 0.05), 6);

  // ── деревья: одна сетка на ель (два конуса + ствол), три варианта
  const firG = [0.8, 1.0, 1.2].map((s) => {
    const parts = [new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.4 * s, 5).translate(0, 0.2 * s, 0), new THREE.ConeGeometry(0.42 * s, 0.8 * s, 6).translate(0, 0.7 * s, 0), new THREE.ConeGeometry(0.3 * s, 0.62 * s, 6).translate(0, 1.08 * s, 0)];
    const P = []; for (const p of parts) { const q = p.toNonIndexed(); P.push(...q.attributes.position.array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
  });
  const trees = [[], [], [], [], []];
  F.forEach((f, i) => {
    if (f.kind === 'grl') return;
    const r = rnd(40 + i), n = f.kind === 'glac' ? 120 : 220;
    for (let k = 0; k < n; k++) {
      const z = lerp(-0.7, -26, r() ** 0.8), side = r() < 0.55 ? 1 : -1, u = side * lerp(hw(i, z) + 0.6, 10.5, r()), x = f.cx + u, y = S(x, z);
      if (y < 0.45 || y > 10.4 + (hash3(k, i, 3) - 0.5) * 1.5) continue;
      if (f.kind === 'dam' && z < -13.5 && z > -17) continue;
      const m = add(firG[k % 3], 'leafDark', x, y - 0.05, z, {rot: [0, r() * 3, 0]});
      trees[i].push({m, y, side, x, z});
    }
  });

  // ── вода: поверхность (сетка), лицевой срез, плёнка заплеска, голая полоса
  const WM = M('water', {water: 1, opacity: 0.86, smooth: true}), WF = M('water', {water: 1, opacity: 0.93, smooth: true, side: THREE.DoubleSide});
  const FM = new THREE.MeshStandardMaterial({color: '#b8e0f4', transparent: true, opacity: 0.92, depthWrite: false, roughness: 1, side: THREE.DoubleSide});
  const UW = 5.2, NU = 40, NZ = 30, NR = 16, NC = 34;
  const zEnd = (i, u) => (i === 1 ? -21 + 7 * Math.cos(Math.asin(Math.max(-1, Math.min(1, u / 7)))) - 0.08 : ZE);
  const mk = (n, mat, ro) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); { const nn = new Float32Array(n * 3); for (let k = 0; k < n; k++) nn[k * 3 + 2] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); } const m = new THREE.Mesh(g, mat); m.renderOrder = ro; m.frustumCulled = false; scene.add(m); return m; };
  const gridIdx = (a, b) => { const I = []; for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) { const p = j * (a + 1) + i; I.push(p, p + 1, p + a + 1, p + 1, p + a + 2, p + a + 1); } return I; };
  const W = F.map((f, i) => {
    const surf = mk((NU + 1) * (NZ + 1), WM, 5); surf.geometry.setIndex(gridIdx(NU, NZ)); surf.receiveShadow = true;
    const front = mk(NU * 6, WF, 6);
    const tongue = mk((NR + 1) * (NC + 1), FM, 7); tongue.geometry.setIndex(gridIdx(NR, NC));
    const tfront = mk(NR * 6, FM, 7);
    const bare = mk((NR + 1) * (NC + 1), M('soil', {}), 0); bare.geometry.setIndex(gridIdx(NR, NC)); bare.receiveShadow = true;
    const zs = i === 1 ? -13.8 : -26;
    // обвал: глыба на левой стене
    const rock = new THREE.Group(); scene.add(rock);
    [[0, 0, 0, 1.3], [0.4, 0.3, 1.4, 1.0], [-0.3, 0.2, -1.5, 1.1], [0.2, 0.6, 0.2, 0.8]].forEach((p, k) => add(blob(p[3], i * 9 + k, 0.25, 1.3, 1.1, 0.8, 1.4), k % 2 ? 'stone' : 'rock', p[0], p[1], p[2], {parent: rock}));
    const dust = []; for (let k = 0; k < 7; k++) dust.push(add(blob(0.9, 70 + k + i, 0.2, 1.5), 'smoke', 0, 0, 0, {cast: false, recv: false}));
    const splash = []; for (let k = 0; k < 8; k++) splash.push(add(blob(0.8, 90 + k + i, 0.18, 1.4), 'cloud', 0, 0, 0, {cast: false, recv: false}));
    // рулетка
    const tape = new THREE.Group(); scene.add(tape); const tapeM = new THREE.MeshBasicMaterial({color: '#ffd23a'});
    { const pg = new THREE.PlaneGeometry(0.22, 1); pg.translate(0, 0.5, 0); const band = new THREE.Mesh(pg, tapeM); band.renderOrder = 8; band.scale.y = f.h; tape.add(band);
      for (let k = 1; k * 2 <= f.h; k++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.09), tapeM); t.position.set(-0.2, k * 2, 0.01); t.renderOrder = 8; tape.add(t); }
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.14), tapeM); cap.position.set(-0.45, f.h, 0.01); cap.renderOrder = 8; tape.add(cap);
      const ft = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.14), tapeM); ft.position.set(-0.45, 0, 0.01); ft.renderOrder = 8; tape.add(ft); }
    tape.position.set(T[f.key][0] + 0.15, 0, 0.35);
    return {f, i, surf, front, tongue, tfront, bare, rock, dust, splash, tape, zs};
  });

  // ── Вайонт: арочная плотина, вода через гребень, городок ниже
  const dam = (() => {
    const f = F[1], sh = new THREE.Shape(), Ro = 7, Ri = 6.4, th0 = -0.8, th1 = 0.8, n = 18;
    for (let k = 0; k <= n; k++) { const t = lerp(th0, th1, k / n); const x = Ro * Math.sin(t), sy = 21 - Ro * Math.cos(t); k ? sh.lineTo(x, sy) : sh.moveTo(x, sy); }
    for (let k = n; k >= 0; k--) { const t = lerp(th0, th1, k / n); sh.lineTo(Ri * Math.sin(t), 21 - Ri * Math.cos(t)); }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {depth: 4.75, bevelEnabled: false, steps: 1}); g.rotateX(-Math.PI / 2);
    add(g, 'concrete', f.cx, -3.4, 0, {});
    const FO = new THREE.MeshStandardMaterial({color: '#b8e0f4', roughness: 1, side: THREE.DoubleSide});
    const over = mk(24 * 2, FO, 0); over.geometry.setIndex(gridIdx(23, 1));
    const flood = mk(9 * 21, FO, 0); flood.geometry.setIndex(gridIdx(8, 20));
    const houses = []; const r = rnd(77);
    for (let k = 0; k < 9; k++) {
      const z = -19.5 - k * 1.25 - r() * 0.4, u = (k % 3 - 1) * 0.95 + (r() - 0.5) * 0.3, x = f.cx + u, y = S(x, z), g = new THREE.Group(); g.position.set(x, y - 0.02, z); g.rotation.y = r() * 0.6 - 0.3; scene.add(g);
      box(0.55, 0.42, 0.45, 'wall', 0, 0.21, 0, {parent: g, r: 0.02});
      add(new THREE.CylinderGeometry(0.02, 0.38, 0.3, 4, 1).rotateY(Math.PI / 4).scale(1.05, 1, 0.85), 'roof', 0, 0.57, 0, {parent: g});
      houses.push({g, z});
    }
    const church = new THREE.Group(); church.position.set(f.cx + 0.6, S(f.cx + 0.6, -31) - 0.02, -31); scene.add(church);
    box(0.4, 1.3, 0.4, 'wall', 0, 0.65, 0, {parent: church}); add(new THREE.ConeGeometry(0.32, 0.6, 4).rotateY(Math.PI / 4), 'roof', 0, 1.6, 0, {parent: church}); houses.push({g: church, z: -31});
    return {over, flood, houses};
  })();
  // ── Сент-Хеленс: вулкан с кратером и столбом пепла
  const plumeF = (() => {
    const pts = [[11, 0], [8.5, 4], [5.5, 10], [3.6, 14.5], [2.6, 15.6], [2.2, 15.2], [1.4, 13.2], [0, 12.8]].map(([r, y]) => new THREE.Vector2(r, y));
    add(new THREE.LatheGeometry(pts, 14), 'stone', 0, 10, -58, {}).scale.setScalar(1.2);
    const cap = new THREE.LatheGeometry([[5.9, 9.4], [3.6, 14.5], [2.6, 15.6], [2.3, 15.3]].map(([r, y]) => new THREE.Vector2(r + 0.12, y + 0.06)), 14); add(cap, 'snow', 0, 10, -58, {cast: false}).scale.setScalar(1.2);
    return smoke(0, 29, -58, 9, 3.2);
  })();
  // ── Трейси-Арм: ледник в вершине фьорда + льдины; лайнер
  {
    const f = F[3];
    add(blob(1, 300, 0.12, 1.3, 5.2, 1.1, 0.9, 1), 'ice', f.cx, 0.15, -27.6, {});
  }
  const floes = []; { const r = rnd(12); for (let k = 0; k < 6; k++) floes.push({m: add(blob(0.25 + r() * 0.25, 310 + k, 0.25, 1.3, 1.4, 0.6, 1.1), 'ice', 0, 0, 0, {}), u: (r() - 0.5) * 2.6, z: -10 - r() * 16, i: 3}); }
  const ship = (() => {
    const g = new THREE.Group(); scene.add(g);
    const sh = new THREE.Shape(); sh.moveTo(-0.55, 3); sh.lineTo(0.55, 3); sh.lineTo(0.62, -1.6); sh.quadraticCurveTo(0.5, -2.7, 0, -3.3); sh.quadraticCurveTo(-0.5, -2.7, -0.62, -1.6); sh.closePath();
    const hull = new THREE.ExtrudeGeometry(sh, {depth: 0.7, bevelEnabled: false}); hull.rotateX(-Math.PI / 2); add(hull, 'dark', 0, -0.35, 0, {parent: g});
    const deck = (w, l, y, h, z0) => { const s2 = new THREE.Shape(); s2.moveTo(-w, l); s2.lineTo(w, l); s2.lineTo(w, z0); s2.quadraticCurveTo(0, z0 - 0.7, -w, z0); s2.closePath(); const dg = new THREE.ExtrudeGeometry(s2, {depth: h, bevelEnabled: false}); dg.rotateX(-Math.PI / 2); add(dg, 'hull', 0, y, 0, {parent: g}); };
    deck(0.6, 2.9, 0.37, 0.34, -1.6); deck(0.5, 2.5, 0.73, 0.28, -1.1); deck(0.38, 1.9, 1.03, 0.24, -0.5);
    for (const [y, w, l0, l1] of [[0.53, 0.62, -1.55, 2.85], [0.86, 0.52, -1.05, 2.45]]) for (const s of [-1, 1]) box(0.04, 0.08, l1 - l0, 'glassDark', s * w, y, -(l0 + l1) / 2 * 1 + 0, {parent: g, r: 0.01});
    cyl(0.18, 0.22, 0.6, 'red', 0, 1.55, -1.3, {parent: g, seg: 10});
    return g;
  })();
  // ── Литуя: три лодки, Эмпайр-стейт-билдинг (381 м до крыши, 443 со шпилем)
  const boats = []; { const f = F[4]; [[-1.2, -7], [0.6, -10.5], [1.4, -15]].forEach(([u, z], k) => { const g = new THREE.Group(); scene.add(g); box(0.2, 0.12, 0.6, 'boat', 0, 0, 0, {parent: g, r: 0.04}); box(0.14, 0.12, 0.18, 'white', 0, 0.12, 0.08, {parent: g, r: 0.02}); g.rotation.y = k * 0.9; boats.push({g, u, z, i: 4}); }); }
  const es = (() => {
    const g = new THREE.Group(); g.position.set(64 - 0.4, 0, -2.5); scene.add(g);
    const tiers = [[1.5, 1.0, 0, 1.2], [1.15, 0.85, 1.2, 1.1], [0.8, 0.62, 1.2, 6.3], [0.62, 0.48, 6.3, 6.9], [0.44, 0.36, 6.9, 7.62]];
    for (const [w, d, y0, y1] of tiers) box(w, y1 - y0, d, 'stone', 0, (y0 + y1) / 2, 0, {parent: g, r: 0.02});
    for (let k = 0; k < 9; k++) box(0.05, 4.9, 0.03, 'glassDark', -0.3 + k * 0.075, 3.8, 0.33, {parent: g, r: 0.005});
    cyl(0.12, 0.16, 0.35, 'stone', 0, 7.78, 0, {parent: g, seg: 8}); cyl(0.02, 0.05, 0.9, 'metal', 0, 8.4, 0, {parent: g, seg: 6});
    return g;
  })();
  const clouds = [cloud(sky, -60, 30, -60, 3.5, 51), cloud(sky, -20, 34, -70, 4.0, 52), cloud(sky, 20, 28, -55, 3.0, 53), cloud(sky, 52, 33, -65, 4.0, 54), cloud(sky, 80, 29, -58, 3.2, 55)];

  // ── анимация
  const surfY = (w, u, z, hump, hu, sei, t) => {
    let y = 0.02 + hump * Math.exp(-(((u - hu) / 1.1) ** 2));
    if (sei) y += sei * 0.55 * Math.sin(t * 2.3) * (u / 2.8);
    return y + 0.04 * Math.sin(u * 2.1 + t * 1.5 + z * 0.4);
  };
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, k) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * k); });
    for (const w of W) {
      const {f, i} = w, p = q[f.key] ?? 0, sei = f.kind === 'grl' ? (q.sei ?? 0) : 0;
      // фазы
      const pS = sm(p / 0.3), pH = (p - 0.27) / 0.18, hump = p > 0.27 && p < 0.5 ? 1.25 * Math.sin(Math.PI * Math.min(1, Math.max(0, pH)) * 0.5 + 0.0) * (1 - sm((p - 0.43) / 0.07)) : 0, hu = lerp(-2.6, 2.8, Math.min(1, Math.max(0, pH)));
      const up = sm((p - 0.42) / 0.24), down = sm((p - 0.66) / 0.26), top = f.h * up * (1 - down), bareTop = f.h * up;
      const ripple = p > 0.3 ? 0.25 * (1 - sm((p - 0.5) / 0.4)) : 0;
      // поверхность
      { const a = w.surf.geometry.attributes.position; let n = 0;
        for (let j = 0; j <= NZ; j++) for (let k = 0; k <= NU; k++) { const u = lerp(-UW, UW, k / NU), z = lerp(0, zEnd(i, u), j / NZ); a.setXYZ(n++, f.cx + u, surfY(w, u, z, hump, hu, sei, t) + ripple * Math.sin(u * 1.7 - t * 3 + z * 0.3), z); }
        a.needsUpdate = true; w.surf.geometry.computeVertexNormals(); w.surf.geometry.computeBoundingSphere(); }
      // лицевой срез воды
      { const a = w.front.geometry.attributes.position; let n = 0;
        for (let k = 0; k < NU; k++) { const u0 = lerp(-UW, UW, k / NU), u1 = lerp(-UW, UW, (k + 1) / NU);
          const t0 = surfY(w, u0, 0, hump, hu, sei, t) + ripple * Math.sin(u0 * 1.7 - t * 3), t1 = surfY(w, u1, 0, hump, hu, sei, t) + ripple * Math.sin(u1 * 1.7 - t * 3);
          const b0 = Math.min(S(f.cx + u0, 0), t0), b1 = Math.min(S(f.cx + u1, 0), t1);
          for (const [u, y] of [[u0, b0], [u1, b1], [u1, t1], [u0, b0], [u1, t1], [u0, t0]]) a.setXYZ(n++, f.cx + u, y, 0.012); }
        a.needsUpdate = true; }
      // плёнка заплеска и голая полоса по правой стене
      const sheet = (mesh, ht, off, thick) => {
        const a = mesh.geometry.attributes.position; let n = 0; mesh.visible = ht > 0.03;
        if (!mesh.visible) return;
        for (let c = 0; c <= NC; c++) { const z = lerp(0, w.zs, c / NC), u0 = uAt(i, z, -0.25), u1 = uAt(i, z, ht);
          for (let r = 0; r <= NR; r++) { const v = r / NR, u = lerp(u0, u1, v), x = f.cx + u; a.setXYZ(n++, x, S(x, z) + off + (thick ? thick * (1 - v) : 0), z); } }
        a.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
      };
      const amp = (1 - down) * up;
      sheet(w.tongue, top, 0.22, 0.75 * amp + 0.05);
      sheet(w.bare, f.kind === 'grl' ? 0 : bareTop, 0.15, 0);
      { const a = w.tfront.geometry.attributes.position; let n = 0; w.tfront.visible = top > 0.03;
        if (w.tfront.visible) { const u0 = uAt(i, 0, -0.25), u1 = uAt(i, 0, top);
          for (let r = 0; r < NR; r++) { const va = r / NR, vb = (r + 1) / NR, ua = lerp(u0, u1, va), ub = lerp(u0, u1, vb), ya = S(f.cx + ua, 0), yb = S(f.cx + ub, 0), ta = ya + 0.22 + (0.75 * amp + 0.05) * (1 - va), tb = yb + 0.22 + (0.75 * amp + 0.05) * (1 - vb);
            for (const [u, y] of [[ua, ya + 0.01], [ub, yb + 0.01], [ub, tb], [ua, ya + 0.01], [ub, tb], [ua, ta]]) a.setXYZ(n++, f.cx + u, y, 0.02); }
          a.needsUpdate = true; } }
      // деревья: срезаны там, где вода прошла (правая сторона, ниже bareTop)
      for (const tr of trees[i]) {
        if (tr.side < 0 || tr.z < w.zs) { tr.m.visible = true; tr.m.rotation.z = 0; tr.m.scale.setScalar(1); continue; }
        const k = bareTop > 0 ? sm((bareTop - tr.y) / 0.6) : 0; tr.m.visible = k < 0.98; tr.m.rotation.z = k * 1.3; tr.m.scale.setScalar(Math.max(0.001, 1 - k));
      }
      // обвал
      { const on = p > 0.002 && p < 0.33; w.rock.visible = on; const z = -6, ua = -9, ub = -1.6, u = lerp(ua, ub, pS), x = f.cx + u;
        const yS = S(x, z), y = Math.max(yS + 0.6, -1.5 + 0) - sm((p - 0.26) / 0.06) * 2.2; w.rock.position.set(x, y, z); w.rock.rotation.set(pS * 2.5, 0, pS * 1.8); w.rock.scale.setScalar(1 - 0.4 * sm((p - 0.24) / 0.08));
        w.dust.forEach((m, k) => { const e = (p - 0.05 - k * 0.025) / 0.4; const vis = e > 0 && e < 1; m.visible = vis; if (!vis) return; const uu = lerp(ua + 1.5, ub, Math.min(1, (k + 0.5) / 7)); m.position.set(f.cx + uu, S(f.cx + uu, z - 1) + 0.6 + e * 2.2, z - 1 + (k % 2) * 1.5); m.scale.setScalar(Math.max(0.001, 0.4 + 0.9 * Math.sin(Math.PI * e))); });
        w.splash.forEach((m, k) => { const e = (p - 0.27 - k * 0.01) / 0.2; const vis = e > 0 && e < 1; m.visible = vis; if (!vis) return; const a = k / 8 * Math.PI * 2; m.position.set(f.cx - 1.6 + Math.cos(a) * 1.2 * e, Math.sin(Math.PI * e) * (2.4 + (k % 3) * 0.8), z + Math.sin(a) * 1.4 * e); m.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * e) * (0.8 + 0.2 * (k % 3)))); }); }
      // рулетка
      { const r = sm(q['r' + f.key.slice(1)] ?? 0); w.tape.visible = r > 0.01; w.tape.scale.set(1, Math.max(0.001, r), 1); }
    }
    // Вайонт: вода через гребень и вниз по долине
    { const p = q.f4 ?? 0, f = F[1], ov = sm((p - 0.42) / 0.12) * (1 - sm((p - 0.72) / 0.15)), fl = sm((p - 0.48) / 0.3);
      const a = dam.over.geometry.attributes.position; dam.over.visible = ov > 0.01; let n = 0;
      if (dam.over.visible) { for (let r = 0; r <= 1; r++) for (let k = 0; k <= 23; k++) { const u = lerp(-4.6, 4.6, k / 23), th = Math.asin(u / 7), zc = -21 + 7 * Math.cos(th); const crest = 1.35 + 1.2 * ov, z = r ? zc - 0.6 - 1.6 * ov : zc + 0.1, y = r ? -0.9 : crest; a.setXYZ(n++, f.cx + u, y, z); } a.needsUpdate = true; dam.over.geometry.computeVertexNormals(); dam.over.geometry.computeBoundingSphere(); }
      const b = dam.flood.geometry.attributes.position; dam.flood.visible = fl > 0.01; n = 0; const L = 19 * fl;
      if (dam.flood.visible) { for (let j = 0; j <= 20; j++) for (let k = 0; k <= 8; k++) { const u = lerp(-4.2, 4.2, k / 8), z = -14.6 - L * j / 20; b.setXYZ(n++, f.cx + u, -0.82 + 0.25 * (1 - j / 20) * (1 - sm((p - 0.8) / 0.2)), z); } b.needsUpdate = true; dam.flood.geometry.computeVertexNormals(); dam.flood.geometry.computeBoundingSphere(); }
      for (const h of dam.houses) { const k = sm((L - (-14.6 - h.z)) / 1.2); h.g.visible = k < 0.98; h.g.scale.set(1, Math.max(0.001, 1 - k), 1); h.g.rotation.z = k * 0.8; } }
    plumeF(t, q.plume ?? 1);
    // льдины, лодки качаются на горбе
    const bob = (o, k) => { const w = W[o.i], p = q[w.f.key] ?? 0, pH = (p - 0.27) / 0.18, hu = lerp(-2.6, 2.8, Math.min(1, Math.max(0, pH))), hump = p > 0.27 && p < 0.5 ? 1.25 * Math.sin(Math.PI * Math.min(1, Math.max(0, pH)) * 0.5) * (1 - sm((p - 0.43) / 0.07)) : 0;
      return surfY(w, o.u, o.z, hump, hu, 0, t) + 0.05 * Math.sin(t * 1.3 + k); };
    floes.forEach((o, k) => { o.m.position.set(F[3].cx + o.u, bob(o, k) - 0.05, o.z); o.m.rotation.y = k + t * 0.03; });
    boats.forEach((o, k) => { o.g.position.set(F[4].cx + o.u, bob(o, k) + 0.04, o.z); o.g.rotation.x = 0.06 * Math.sin(t * 1.7 + k); });
    { const s = q.ship ?? 0; ship.visible = s > 0.001; ship.position.set(F[3].cx + 0.2, -0.02 + 0.02 * Math.sin(t), lerp(-29, -13, s)); }
    { const e = sm(q.es ?? 0); es.visible = e > 0.01; es.scale.set(1, Math.max(0.001, e), 1); }
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
