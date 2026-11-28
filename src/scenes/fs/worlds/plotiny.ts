// @ts-nocheck
// Мир «Топ-5 самых высоких плотин» (28.11): шесть ущелий в ряд, 1 ед. = 25 м (честно по высоте).
// Срез по z = 0 поперёк ущелья: скала слоями + река. Плотина поперёк ущелья на z = dz.
// q[f*] 0..1: 0–0.45 плотина растёт со дна, 0.4–0.85 водохранилище наполняется. r* — жёлтая рулетка.
// f5 Байхэтань (арка, машинный зал: tb — 16 окон-турбин), f4 Сяовань (арка, jet — струи из стены),
// f3 Лянхэкоу (каменная насыпь, самосвалы), f2 Нурек (насыпь камень+глина, сухие склоны),
// f1 Цзиньпин-1 (тонкая арка 63→16 м, eif — Эйфелева башня 300 м), f0 Рогун (стройка 190 м, gh — контур 335 м, кран).
import * as THREE from 'three';
import {makeKit, rnd, sm, lerp, hash3, vnoise, hills} from '../kit';

const K = 1 / 25;
export const F = [
  {key: 'f5', cx: -80, h: 289 * K, kind: 'arch', hw: 1.3, sl: 2.3, dz: -12, dry: false},
  {key: 'f4', cx: -48, h: 292 * K, kind: 'arch', hw: 1.3, sl: 2.3, dz: -12, dry: false},
  {key: 'f3', cx: -16, h: 295 * K, kind: 'fill', hw: 2, sl: 1.6, dz: -18, dry: false},
  {key: 'f2', cx: 16, h: 300 * K, kind: 'fill', hw: 2, sl: 1.6, dz: -18, dry: true},
  {key: 'f1', cx: 48, h: 305 * K, kind: 'arch', hw: 2.9, sl: 2.3, dz: -14, dry: false},
  {key: 'f0', cx: 80, h: 335 * K, kind: 'fill', hw: 2, sl: 1.6, dz: -18, dry: true},
];
const FL = -0.6, RIDGE = 17.5, ZE = -46, SAG = 2.4, FS = 1.3, FC = 0.8;
const smin = (a, b, k = 1.4) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));
const fi = (x) => Math.max(0, Math.min(5, Math.round((x + 80) / 32)));
const floorY = (z) => FL + 14 * sm((-z - 30) / 14);
export function S(x, z) {
  const i = fi(x), f = F[i], u = x - f.cx, a = Math.max(0, Math.abs(u) - f.hw), fl = floorY(z);
  let y = fl + smin(f.sl * a, RIDGE - fl);
  y += sm((a - 5) / 4) * (1.4 * vnoise(x * 0.13, 1.3, z * 0.13) + 1.6 * Math.max(0, Math.sin(x * 0.31 + z * 0.23 + i)));
  return y;
}
const AW = (f) => f.hw + 6.4;                 // полуширина арки (концы в скале)
const zArch = (f, x) => { const t = Math.min(1, Math.abs(x) / AW(f)); return f.dz - SAG * (1 - t * t); };   // низовая грань
const thick = (f, v) => (f.key === 'f1' ? lerp(63, 16, v) : lerp(55, 14, v)) * K;
const crestY = (f) => FL + f.h;
const rx = (f) => f.cx - f.hw * 0.55, rz = (f) => (f.kind === 'arch' ? f.dz + 1.2 : -1.2);
export const T = {
  ...Object.fromEntries(F.map((f) => [f.key, [rx(f), crestY(f), rz(f)]])),
  tb: [-80 + 0.9, 1.5, -12 + 3.4], jet: [-48 + 1.2, 5.2, -9.5], tr: [-16 + 2, crestY(F[2]) + 0.5, -18],
  core: [16, crestY(F[3]), -18], ef: [48 + 1.2, FL + 12, -6], thin: [48, crestY(F[4]), -14 - SAG],
  rg: [80 - 1, crestY(F[5]), -18], now: [80 + 2, FL + 190 * K, -12], crane: [80 + 5, 13, -19],
};
const cw = (f) => ({pos: [f.cx + 2.5, 20, f.dz + 38], look: [f.cx, 6, f.dz - 4], fov: 40});
const cc = (f) => ({pos: [f.cx + 4, 13, f.dz + 25], look: [f.cx, 5.5, f.dz - 2], fov: 40});
export const CAMS = {
  ...Object.fromEntries(F.map((f) => [f.key, cw(f)])),
  ...Object.fromEntries(F.map((f) => [f.key + 'c', cc(f)])),
  f5t: {pos: [-78, 5.5, 9], look: [-79.5, 3, -9], fov: 40},
  f4j: {pos: [-44.5, 8, 14], look: [-47.5, 4.5, -11], fov: 40},
  f3t: {pos: [-12.5, 15, 8], look: [-15.5, 9.5, -18], fov: 40},
  hook: {pos: [51.5, 9, 13], look: [48.5, 8, -10], fov: 40},
  hook2: {pos: [52, 16, 22], look: [48.3, 7, -12], fov: 40},
  f2b: {pos: [12, 17, -10 + 22], look: [16, 6, -22], fov: 40},
  f1t: {pos: [54, 19, 8], look: [48, 8, -16], fov: 40},
  end: {pos: [83, 15, 24], look: [80, 7, -18], fov: 40},
  end2: {pos: [83.5, 17, 30], look: [80.2, 7.5, -18], fov: 40},
  cover: {pos: [52, 14, 20], look: [48.3, 7, -12], fov: 40},
};

const C3 = (h) => new THREE.Color(h);
export function build(scene, sky) {
  const Kt = makeKit(scene, {rock: '#8c8a96', deep: '#6b6c80', soil: '#8a6a50', stone: '#b9b3aa', concrete: '#d6d1c6', foam: '#e8f6fc', fillA: '#a9a196', fillB: '#b39a7c', eiffel: '#8a5f45', truck: '#e8b23a', crane: '#e8a43a'});
  const {add, box, cyl, blob, cloud, M} = Kt;
  const VM = new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1});

  // ── земля: цвет по высоте и ущелью (Китай — лес, Таджикистан — сухие охристые склоны)
  const cForest = C3('#4f8f5c'), cGrass = C3('#7fae5e'), cRock = C3('#8f8f9c'), cDry = C3('#c2a275'), cDryR = C3('#a08068'), cShore = C3('#a49a88'), cSnow = C3('#eef2f8'), tmp = new THREE.Color();
  const colAt = (x, y, z) => {
    const f = F[fi(x)], n = vnoise(x * 0.4, y * 0.4, z * 0.4) - 0.5;
    if (y < 0.25) return cShore;
    if (f.dry) { if (y > 16.5 + n * 2) return cSnow; return tmp.copy(cDry).lerp(cDryR, sm((y - 3) / 10) * 0.7 + n * 0.4); }
    if (y > 14.5 + n * 2) return tmp.copy(cRock).lerp(cGrass, 0.2);
    return tmp.copy(cForest).lerp(cGrass, 0.3 + n);
  };
  {
    const X0 = -98, X1 = 98, st = 0.5, nx = Math.round((X1 - X0) / st), nz = Math.round(-ZE / st), P = [], Cl = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = X0 + i * st, z = -j * st, y = S(x, z); P.push(x, y, z); const c = colAt(x, y, z); Cl.push(c.r, c.g, c.b); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3)); g.setIndex(I); g = g.toNonIndexed(); g.computeVertexNormals();
    const m = new THREE.Mesh(g, VM); m.receiveShadow = true; scene.add(m);
  }
  // срез по z = 0
  {
    const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.45, (x) => Math.min(S(x, 0) - 3, -5 + 0.6 * Math.sin(x * 0.21)), () => -14];
    ['soil', 'rock', 'deep'].forEach((role, k) => {
      const P = [], N = [];
      for (let x = -98; x < 98 - 1e-6; x += 0.25) { const xb = x + 0.25, a0 = B[k + 1](x), a1 = B[k](x), b0 = B[k + 1](xb), b1 = B[k](xb); for (const [u, y] of [[x, a0], [xb, b0], [xb, b1], [x, a0], [xb, b1], [x, a1]]) { P.push(u, y, 0); N.push(0, 0, 1); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      add(g, role, 0, 0, 0, {cast: false, mat: {smooth: true}});
    });
    const r = rnd(5); for (let i = 0; i < 36; i++) { const x = lerp(-96, 96, r()), y = lerp(-13, -2, r()); if (y > S(x, 0) - 1) continue; add(blob(0.25 + r() * 0.35, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); }
  }
  hills(Kt, 'hillMid', -45.5, -90, (x, z) => 13 + 8 * sm((-z - 45) / 25) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + 2.5 * vnoise(x * 0.1, 0, z * 0.1), 3);
  hills(Kt, 'hillFar', -86, -180, (x, z) => 16 + 26 * sm((-z - 86) / 60) * (0.55 + 0.45 * Math.sin(x * 0.045 + 2.5)) + 3 * vnoise(x * 0.05, 3, z * 0.05), 6);

  // ── деревья: кроны-комья (Китай), редкие кусты (Таджикистан); не под водой и не под насыпью
  const crownG = [0, 1, 2].map((k) => { const g = blob(0.45 + k * 0.08, 500 + k, 0.22, 1.3, 1, 1.15, 1); g.translate(0, 0.55, 0); return g; });
  const trunkG = new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5).translate(0, 0.2, 0);
  F.forEach((f, i) => {
    const r = rnd(40 + i), n = f.dry ? 26 : 200;
    for (let k = 0; k < n; k++) {
      const z = lerp(-0.8, -40, r() ** 0.8), side = r() < 0.5 ? 1 : -1, u = side * lerp(f.hw + 0.8, 11, r()), x = f.cx + u, y = S(x, z);
      if (y < 0.5 || y > 14.5 + (hash3(k, i, 3) - 0.5) * 1.5) continue;
      const up = f.kind === 'arch' ? z < f.dz + 1.5 : z < -1;
      if (up && y < crestY(f) + 0.6) continue;
      if (f.key === 'f1' && z > -9 && z < -2 && Math.abs(u) < 5) continue;
      const s = f.dry ? 0.55 : 0.8 + 0.4 * r();
      const g = new THREE.Group(); g.position.set(x, y - 0.05, z); g.scale.setScalar(s); g.rotation.y = r() * 3; scene.add(g);
      add(trunkG, 'trunk', 0, 0, 0, {parent: g}); add(crownG[k % 3], f.dry ? 'leafDark' : (k % 4 ? 'leafDark' : 'leaf'), 0, 0, 0, {parent: g});
    }
  });

  // ── река (одна плоскость на ущелье, y = 0, выше дна на 0.6) и её срез
  const WM = M('water', {water: 1, opacity: 0.88, smooth: true}), WF = M('water', {water: 1, opacity: 0.93, smooth: true, side: THREE.DoubleSide});
  F.forEach((f) => {
    const g = new THREE.PlaneGeometry(2 * f.hw + 3, -ZE, 4, 20); g.rotateX(-Math.PI / 2); g.translate(f.cx, 0, ZE / 2);
    const m = new THREE.Mesh(g, WM); m.renderOrder = 5; m.receiveShadow = true; scene.add(m);
    const P = []; const w = f.hw + 0.6 / f.sl;
    for (let k = 0; k < 16; k++) { const u0 = lerp(-w, w, k / 16), u1 = lerp(-w, w, (k + 1) / 16), b0 = Math.min(S(f.cx + u0, 0), 0), b1 = Math.min(S(f.cx + u1, 0), 0);
      for (const [u, y] of [[u0, b0], [u1, b1], [u1, 0], [u0, b0], [u1, 0], [u0, 0]]) P.push(f.cx + u, y, 0.012); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); fg.computeVertexNormals();
    const fm = new THREE.Mesh(fg, WF); fm.renderOrder = 6; scene.add(fm);
  });

  // ── плотины
  const archGeo = (f) => {
    const NV = 10, NX = 28, W = AW(f), y0 = 0, H = f.h + 0.6, P = [];
    const q = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
    const pd = (x, v) => [x, y0 + v * H, zArch(f, x)], pu = (x, v) => [x, y0 + v * H, zArch(f, x) - thick(f, v)];
    for (let j = 0; j < NV; j++) for (let i = 0; i < NX; i++) {
      const x0 = lerp(-W, W, i / NX), x1 = lerp(-W, W, (i + 1) / NX), v0 = j / NV, v1 = (j + 1) / NV;
      q(pd(x0, v0), pd(x1, v0), pd(x1, v1), pd(x0, v1));
      q(pu(x1, v0), pu(x0, v0), pu(x0, v1), pu(x1, v1));
    }
    for (let i = 0; i < NX; i++) { const x0 = lerp(-W, W, i / NX), x1 = lerp(-W, W, (i + 1) / NX); q(pd(x0, 1), pd(x1, 1), pu(x1, 1), pu(x0, 1)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
  };
  const fillGeo = (f, h) => {
    const sh = new THREE.Shape(), b = -0.6, hh = h + 0.6, L = FC / 2 + hh * FS;
    sh.moveTo(-L, b); sh.lineTo(L, b); sh.lineTo(FC / 2, b + hh); sh.lineTo(-FC / 2, b + hh); sh.closePath();
    const XW = f.hw + (h + 1) / f.sl + 3;
    const g = new THREE.ExtrudeGeometry(sh, {depth: 2 * XW, bevelEnabled: false}); g.rotateY(Math.PI / 2); g.translate(-XW, 0, 0); return g;
  };
  const D = F.map((f) => {
    const g = new THREE.Group(); scene.add(g);
    if (f.kind === 'arch') {
      g.position.set(f.cx, FL - 0.6, 0); add(archGeo(f), 'concrete', 0, 0, 0, {parent: g});
      // гребень: дорога, парапет и фонари по дуге
      const H = f.h + 0.6, W = AW(f) - 1.2, tt = thick(f, 1), n = 14;
      for (let k = 0; k < n; k++) { const x0 = lerp(-W, W, k / n), x1 = lerp(-W, W, (k + 1) / n), xm = (x0 + x1) / 2, z = zArch(f, xm), a = Math.atan2(zArch(f, x1) - zArch(f, x0), x1 - x0);
        box(x1 - x0 + 0.06, 0.14, 0.12, 'stone', xm, H + 0.07, z - 0.04, {parent: g, r: 0.02, rot: [0, -a, 0]});
        box(x1 - x0 + 0.06, 0.14, 0.12, 'stone', xm, H + 0.07, z - tt + 0.04, {parent: g, r: 0.02, rot: [0, -a, 0]});
        if (k % 2) { cyl(0.03, 0.03, 0.55, 'dark', xm, H + 0.28, z - 0.05, {parent: g, seg: 5}); box(0.12, 0.06, 0.12, 'lamp', xm, H + 0.57, z - 0.05, {parent: g, r: 0.02}); } }
    } else {
      g.position.set(f.cx, FL, f.dz); add(fillGeo(f, f.h), f.dry ? 'fillB' : 'fillA', 0, 0, 0, {parent: g});
      // бермы-дороги на низовом откосе
      for (let k = 1; k <= 4; k++) { const y = (f.h * k) / 5, z = FC / 2 + (f.h - y) * FS; box(2 * (f.hw + (y + 1) / f.sl + 2), 0.1, 0.5, 'gravel', 0, y, z + 0.08, {parent: g, r: 0.02}); }
      // валуны на откосах
      const r = rnd(60 + f.cx); for (let k = 0; k < 26; k++) { const y = r() * f.h * 0.92, side = r() < 0.6 ? 1 : -1, z = side * (FC / 2 + (f.h - y) * FS) + side * 0.12, x = (r() - 0.5) * 2 * (f.hw + y / f.sl - 0.4); add(blob(0.18 + r() * 0.16, 700 + k, 0.3, 1.3, 1.2, 0.7, 1), 'stone', x, y, z, {parent: g}); }
    }
    return g;
  });
  // водохранилища: плоская сетка, передний край внутри тела плотины
  const RES = F.map((f) => {
    const NU = 24, NZ = 12, W = 13, P = [], I = [];
    for (let j = 0; j <= NZ; j++) for (let k = 0; k <= NU; k++) {
      const u = lerp(-W, W, k / NU), z0 = f.kind === 'arch' ? zArch(f, u) - thick(f, 0.5) * 0.5 : f.dz; P.push(f.cx + u, 0, lerp(z0, ZE, j / NZ));
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NU; i++) { const p = j * (NU + 1) + i; I.push(p, p + 1, p + NU + 1, p + 1, p + NU + 2, p + NU + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M('water', {water: 1, opacity: 0.9, smooth: true})); m.renderOrder = 6; m.receiveShadow = true; scene.add(m); return m;
  });
  // рулетки
  const tapeM = new THREE.MeshBasicMaterial({color: '#ffd23a'});
  const TAPE = F.map((f) => {
    const tape = new THREE.Group(); scene.add(tape);
    const pg = new THREE.PlaneGeometry(0.24, 1); pg.translate(0, 0.5, 0); const band = new THREE.Mesh(pg, tapeM); band.renderOrder = 8; band.scale.y = f.h; tape.add(band);
    for (let k = 1; k * 2 <= f.h; k++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.09), tapeM); t.position.set(-0.2, k * 2, 0.01); t.renderOrder = 8; tape.add(t); }
    for (const y of [0, f.h]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.14), tapeM); c.position.set(-0.45, y, 0.01); c.renderOrder = 8; tape.add(c); }
    tape.position.set(rx(f), FL, rz(f)); return tape;
  });

  // ── Байхэтань: машинный зал у подножия, 16 окон-турбин зажигаются
  const tbWin = []; const litM = new THREE.MeshBasicMaterial({color: '#ffd56a'}), offM = M('glassDark');
  {
    const f = F[0], z = f.dz + 3.4, w = 3.9;
    box(w, 2.0, 1.6, 'wall', f.cx, FL + 1.0, z, {r: 0.04}); box(w + 0.2, 0.18, 1.8, 'roof', f.cx, FL + 2.08, z, {r: 0.03});
    for (let k = 0; k < 16; k++) { const row = k < 8 ? 1 : 0, c = k % 8; const m = box(0.3, 0.32, 0.06, 'glassDark', f.cx - 1.47 + c * 0.42, FL + 0.75 + row * 0.6, z + 0.82, {r: 0.01, cast: false}); tbWin.push(m); }
    for (const s of [-1, 1]) box(0.14, 0.1, 1.2, 'dark', f.cx + s * 1.2, FL + 2.25, z, {r: 0.02});
  }
  // ── Сяовань: 4 водовыпуска в стене и струи по параболе
  const jets = []; const JM = new THREE.MeshStandardMaterial({color: '#f4fbff', emissive: '#bfe4f5', emissiveIntensity: 0.45, roughness: 1});
  {
    const f = F[1];
    [-1.6, -0.55, 0.55, 1.6].forEach((u, k) => {
      const z0 = zArch(f, u), y0 = FL + 5.4;
      box(0.42, 0.42, 0.24, 'dark', f.cx + u, y0, z0 + 0.06, {r: 0.02, cast: false});
      const pts = []; for (let s = 0; s <= 16; s++) { const t = s / 16; pts.push(new THREE.Vector3(f.cx + u * (1 + 0.15 * t), y0 + 1.6 * t - (y0 + 1.6) * t * t, z0 + 0.2 + 8.5 * t)); }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.17, 6, false);
      const m = new THREE.Mesh(g, JM); m.renderOrder = 7; scene.add(m);
      const spray = []; for (let n = 0; n < 3; n++) spray.push(add(blob(0.55, 800 + k * 3 + n, 0.2, 1.4), 'cloud', pts[16].x + (n - 1) * 0.4, 0.35, pts[16].z - n * 0.3, {cast: false, recv: false}));
      jets.push({m, n: g.index.count, spray});
    });
  }
  // ── самосвалы
  const truck = (parent) => {
    const g = new THREE.Group(); (parent || scene).add(g);
    box(0.9, 0.34, 0.5, 'truck', -0.12, 0.33, 0, {parent: g, r: 0.04}); box(0.3, 0.36, 0.46, 'red', 0.5, 0.33, 0, {parent: g, r: 0.04});
    box(0.06, 0.16, 0.36, 'glassDark', 0.66, 0.38, 0, {parent: g, r: 0.01});
    for (const [x, z] of [[-0.35, 0.24], [-0.35, -0.24], [0.48, 0.24], [0.48, -0.24]]) cyl(0.12, 0.12, 0.1, 'tyre', x, 0.12, z, {parent: g, rot: [Math.PI / 2, 0, 0], seg: 10});
    return g;
  };
  const trucks = [0, 1, 2].map(() => truck());
  // ── Эйфелева башня (300 м без антенн) в ущелье Цзиньпина, ниже по течению
  const eif = (() => {
    const g = new THREE.Group(); g.position.set(48, FL, -5.5); scene.add(g);
    const seg = (a, b, r0, r1) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B); const c = new THREE.CylinderGeometry(r1, r0, L, 5); c.translate(0, L / 2, 0); const m = add(c, 'eiffel', A.x, A.y, A.z, {parent: g}); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); };
    const lv = [[0, 2.2], [2.3, 0.95], [4.6, 0.55], [11.2, 0.13]];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) seg([sx * lv[k][1], lv[k][0], sz * lv[k][1]], [sx * lv[k + 1][1], lv[k + 1][0], sz * lv[k + 1][1]], k ? 0.12 - k * 0.03 : 0.2, 0.12 - k * 0.03);
    box(2.3, 0.18, 2.3, 'eiffel', 0, 2.3, 0, {parent: g, r: 0.02}); box(1.3, 0.14, 1.3, 'eiffel', 0, 4.6, 0, {parent: g, r: 0.02});
    box(0.4, 0.3, 0.4, 'eiffel', 0, 11.25, 0, {parent: g, r: 0.03}); cyl(0.04, 0.08, 0.5, 'eiffel', 0, 11.65, 0, {parent: g, seg: 6});
    // арки нижнего яруса
    for (const r of [0, Math.PI / 2]) { const a = new THREE.TorusGeometry(1.25, 0.08, 4, 12, Math.PI); const m = add(a, 'eiffel', 0, 0.95, 0, {parent: g}); m.rotation.y = r; }
    return g;
  })();
  // ── Рогун: насыпь сейчас (~190 м), контур будущих 335 м, башенный кран, самосвалы
  const rg = F[5];
  const ghost = new THREE.Mesh(fillGeo(rg, rg.h), new THREE.MeshStandardMaterial({color: '#fff6e0', transparent: true, opacity: 0.45, depthWrite: false, roughness: 1}));
  ghost.position.set(rg.cx, FL + 0.01, rg.dz + 0.01); ghost.renderOrder = 9; scene.add(ghost);
  const crane = new THREE.Group(); crane.position.set(rg.cx + 5, 0, rg.dz - 1); scene.add(crane);
  {
    box(0.3, 15, 0.3, 'crane', 0, 7.5, 0, {parent: crane, r: 0.02}); box(7, 0.26, 0.26, 'crane', -2.2, 15, 0, {parent: crane, r: 0.02});
    box(0.9, 0.5, 0.5, 'dark', 1.4, 14.7, 0, {parent: crane, r: 0.03}); box(0.4, 0.5, 0.4, 'glassDark', 0.1, 14.65, 0.2, {parent: crane, r: 0.02});
  }
  const hook = box(0.25, 0.25, 0.25, 'dark', 0, 0, 0, {parent: crane, r: 0.03}); hook.visible = false;
  const rgTr = [0, 1].map(() => truck());

  const clouds = [cloud(sky, -80, 32, -62, 3.5, 51), cloud(sky, -40, 35, -70, 4.0, 52), cloud(sky, 0, 30, -56, 3.0, 53), cloud(sky, 40, 34, -66, 4.0, 54), cloud(sky, 82, 31, -60, 3.4, 55)];

  // ── анимация
  const animate = (q) => {
    const t = q.t ?? 0;
    clouds.forEach((g, k) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * k); });
    F.forEach((f, i) => {
      const p = q[f.key] ?? 1, rog = f.key === 'f0';
      const grow = rog ? (190 / 335) * Math.max(0.02, sm(p / 0.6)) : Math.max(0.02, sm(p / 0.45));
      D[i].scale.set(1, grow, 1);
      const fill = rog ? 0.4 * sm((p - 0.4) / 0.5) : sm((p - 0.4) / 0.45);
      const lv = FL + 0.5 + (f.h - 0.95) * fill; RES[i].visible = fill > 0.01; RES[i].position.y = lv + 0.03 * Math.sin(t * 0.8 + i);
      const r = sm(q['r' + f.key.slice(1)] ?? 0); TAPE[i].visible = r > 0.01; TAPE[i].scale.set(1, Math.max(0.001, r), 1);
    });
    { const n = Math.round(16 * Math.min(1, Math.max(0, q.tb ?? 1))); tbWin.forEach((m, k) => { m.material = k < n ? litM : offM; }); }
    { const e = Math.min(1, Math.max(0, q.jet ?? 0)); jets.forEach((j, k) => { const ek = sm((e - k * 0.06) / 0.5); j.m.visible = ek > 0.01; j.m.geometry.setDrawRange(0, Math.floor(j.n * ek / 6) * 6); j.spray.forEach((s, n) => { const v = sm((ek - 0.85) / 0.15); s.visible = v > 0.01; s.scale.setScalar(Math.max(0.001, v * (0.8 + 0.15 * Math.sin(t * 3 + n + k)))); }); }); }
    { // самосвалы ездят по гребню растущей насыпи Лянхэкоу
      const f = F[2], p = q.f3 ?? 1, g = Math.max(0.02, sm(p / 0.45)), y = FL + (f.h + 0.6) * g - 0.6, half = f.hw + (y - FL) / f.sl - 1.4, on = (q.trk ?? 0) > 0.01;
      trucks.forEach((m, k) => { m.visible = on && half > 0.8; const s = ((t * 0.12 + k / 3) % 1), dir = s < 0.5 ? 1 : -1, u = lerp(-half, half, s < 0.5 ? s * 2 : 2 - s * 2); m.position.set(f.cx + u, y + 0.005, f.dz + (k - 1) * 0.12); m.rotation.y = dir > 0 ? 0 : Math.PI; });
    }
    { const e = sm(q.eif ?? 0); eif.visible = e > 0.01; eif.scale.set(1, Math.max(0.001, e), 1); }
    { const gh = sm(q.gh ?? 0); ghost.visible = gh > 0.01; ghost.material.opacity = 0.45 * gh; ghost.scale.set(1, Math.max(0.001, gh), 1);
      crane.rotation.y = 0.4 * Math.sin(t * 0.25); hook.position.set(-4, 15 - 4 - Math.sin(t * 0.5), 0);
      const y = FL + (rg.h + 0.6) * (190 / 335) - 0.6, half = rg.hw + (y - FL) / rg.sl - 1.5;
      rgTr.forEach((m, k) => { const s = ((t * 0.1 + k / 2) % 1), u = lerp(-half, half, s < 0.5 ? s * 2 : 2 - s * 2); m.position.set(rg.cx + u, y + 0.005, rg.dz + (k ? 0.15 : -0.15)); m.rotation.y = s < 0.5 ? 0 : Math.PI; }); }
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
