// Тестовый мир «дом, погреб и колодец в разрезе» — один и тот же для всех стилей.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const PAL = {
  grass: '#74a83c', soil: '#4b3526', clay: '#b9723c', sand: '#dcc07c', aquifer: '#6f93a3', rock: '#50545f',
  water: '#3d8fc6', wall: '#efe3c8', roof: '#b84a30', wood: '#8d5c34', woodDark: '#5f3c23', brick: '#a04e39',
  stone: '#9b968d', concrete: '#bdbab1', trunk: '#5d4231', leaf: '#4f9038', leaf2: '#6fae42', leafDark: '#2f6e3c',
  metal: '#7f8a96', glass: '#ffd98a', cloud: '#ffffff', pipe: '#2f6fd0', barrel: '#7c4c2b', jarA: '#d9902f',
  jarB: '#b33a2e', jarC: '#6f9a3a', rope: '#c9b38a', hillFar: '#9db9c4', hillMid: '#7da583', white: '#f6f2ea',
  shutter: '#2f7f86', door: '#6b3f26', pebble: '#a9b7bd', smoke: '#e9e6e0', lamp: '#ffe2a0', sack: '#b89b6a',
  table: '#a9794c', mat: '#3f7d63', board: '#bfdcee',
};

function hash3(x, y, z) { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); }
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function S(x, z) {
  return 1.4 * sm((x - 3.4) / 5.5) + 1.3 * sm((-z - 7) / 9) + 0.9 * sm((-x - 7.5) / 8) * sm((-z - 1.5) / 6)
    + 0.07 * Math.sin(x * 1.3 + z * 0.7) * sm((-z - 1.2) / 3);
}
const B = [
  (x) => S(x, 0),
  (x) => S(x, 0) - 0.14,
  (x) => S(x, 0) * 0.8 - 0.62 - 0.06 * Math.sin(x * 1.3),
  (x) => -4.0 + 0.3 * Math.sin(x * 0.42 + 1) + 0.12 * Math.sin(x * 1.1),
  (x) => -7.0 + 0.32 * Math.sin(x * 0.33 + 2.2),
  (x) => -10.3 + 0.26 * Math.sin(x * 0.45 + 0.5),
  () => BOT,
];
let BOT = -12.5;
const LAYERS = ['grass', 'soil', 'clay', 'sand', 'aquifer', 'rock'];

export function buildWorld(st) {
  const G = Object.assign({ r: 0.03, smooth: false, wobble: 0, detail: 3, flat: false, finite: false }, st.geo || {});
  BOT = G.finite ? -12.5 : -17.5;
  const scene = new THREE.Scene();
  const sky = new THREE.Group(); sky.name = 'sky'; scene.add(sky);
  const cache = new Map();
  const M = (role, o = {}) => {
    const k = role + JSON.stringify(o);
    if (!cache.has(k)) cache.set(k, st.mat(role, (st.pal && st.pal[role]) || PAL[role], o));
    return cache.get(k);
  };
  const wob = (g, ox = 0, oy = 0, oz = 0, amp = G.wobble, f = 1.1) => {
    if (!amp) return g;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x + amp * 2 * (vnoise((x + ox) * f, (y + oy) * f, (z + oz) * f) - 0.5),
        y + amp * 2 * (vnoise((x + ox) * f + 31, (y + oy) * f + 17, (z + oz) * f) - 0.5),
        z + amp * 2 * (vnoise((x + ox) * f + 7, (y + oy) * f + 53, (z + oz) * f + 11) - 0.5));
    }
    g.computeVertexNormals(); return g;
  };
  const rbox = (w, h, d, r = G.r) => {
    r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const sg = (s) => Math.max(1, Math.min(8, Math.round(s / (G.wobble ? 0.35 : 4)))) + 2;
    const g = new THREE.BoxGeometry(w, h, d, sg(w), sg(h), sg(d)), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    // сетку стягиваем к краям, чтобы скругление было узким
    const sq = (x, half) => { const a = Math.abs(x) / half; return Math.sign(x) * half * (a > 0.999 ? 1 : Math.min(a * 1.0, 1)); };
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); v.set(sq(v.x, w / 2), sq(v.y, h / 2), sq(v.z, d / 2));
      c.set(THREE.MathUtils.clamp(v.x, -w / 2 + r, w / 2 - r), THREE.MathUtils.clamp(v.y, -h / 2 + r, h / 2 - r), THREE.MathUtils.clamp(v.z, -d / 2 + r, d / 2 - r));
      const dl = v.clone().sub(c); if (dl.lengthSq() > 1e-12) { dl.normalize(); v.copy(c).addScaledVector(dl, r); }
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  };
  const blob = (r, seed, a = 0.22, f = 1.3, sx = 1, sy = 1, sz = 1) => {
    let g = new THREE.IcosahedronGeometry(r, G.detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + a * 2 * (vnoise(x * f / r + seed, y * f / r + seed * 1.7, z * f / r) - 0.5);
      x *= k * sx; y *= k * sy; z *= k * sz; p.setXYZ(i, x, y, z);
      uv[i * 2] = Math.atan2(x, z) / (Math.PI * 2) + 0.5; uv[i * 2 + 1] = y / (r * 2) + 0.5;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
  };
  const add = (geo, role, x = 0, y = 0, z = 0, o = {}) => {
    if (G.wobble && !o.noWob) wob(geo, x, y, z);
    const m = new THREE.Mesh(geo, M(role, o.mat || {})); m.position.set(x, y, z);
    if (o.rot) m.rotation.set(...o.rot);
    m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
    (o.parent || scene).add(m); return m;
  };
  const box = (w, h, d, role, x, y, z, o = {}) => add(rbox(w, h, d, o.r), role, x, y, z, o);
  const cyl = (rt, rb, h, role, x, y, z, o = {}) => add(new THREE.CylinderGeometry(rt, rb, h, o.seg || (G.flat ? 8 : 20), G.wobble ? 4 : 1, !!o.open, o.ts || 0, o.tl || Math.PI * 2), role, x, y, z, o);
  const tube = (pts, r, role, o = {}) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), o.n || 24, r, G.flat ? 5 : 8), role, 0, 0, 0, o);

  // ── размеры мира
  const X0 = G.finite ? -7.75 : -40, X1 = G.finite ? 7.75 : 40, Z0 = G.finite ? -8.5 : -30;
  const HOLES = [{ x0: -6.0, x1: -1.5, y0: -3.75, y1: -0.65 }, { x0: 2.0, x1: 3.0, y0: -8.6, y1: 5 }];

  // ── срез по слоям
  const DX = 0.25;
  const faceGeo = (bound, k, u0, u1, holes, place) => {
    const P = [], U = [], N = [];
    for (let ua = u0; ua < u1 - 1e-6; ua += DX) {
      const ub = ua + DX, um = (ua + ub) / 2;
      let spans = [[bound(k + 1, ua), bound(k, ua), bound(k + 1, ub), bound(k, ub)]];
      for (const h of holes) {
        if (um < h.x0 || um > h.x1) continue; const nx = [];
        for (const s of spans) {
          const l = [s[0], Math.min(s[1], h.y0), s[2], Math.min(s[3], h.y0)], u = [Math.max(s[0], h.y1), s[1], Math.max(s[2], h.y1), s[3]];
          if (l[1] - l[0] > 1e-4 || l[3] - l[2] > 1e-4) nx.push([l[0], Math.max(l[0], l[1]), l[2], Math.max(l[2], l[3])]);
          if (u[1] - u[0] > 1e-4 || u[3] - u[2] > 1e-4) nx.push([Math.min(u[0], u[1]), u[1], Math.min(u[2], u[3]), u[3]]);
        }
        spans = nx;
      }
      for (const s of spans) {
        // делим по высоте, чтобы у слоя были вершины (для лепных и низкополигональных стилей)
        const n = 1;
        for (let j = 0; j < n; j++) {
          const a0 = lerp(s[0], s[1], j / n), a1 = lerp(s[0], s[1], (j + 1) / n), b0 = lerp(s[2], s[3], j / n), b1 = lerp(s[2], s[3], (j + 1) / n);
          for (const [u, y] of [[ua, a0], [ub, b0], [ub, b1], [ua, a0], [ub, b1], [ua, a1]]) { const q = place(u, y); P.push(...q.p); N.push(...q.n); U.push(u / 4, y / 4); }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return g;
  };
  const bFront = (k, x) => B[k](x);
  LAYERS.forEach((role, k) => {
    // «бумажный» режим: каждый слой — отдельный лист, нижние листы уходят вглубь и заходят под верхние
    const st_ = G.layerStep || 0, bnd = st_ ? ((kk, x) => B[kk](x) + (kk === k && k > 0 ? 0.4 : 0)) : bFront;
    const g = faceGeo(bnd, k, X0, X1, HOLES, (x, y) => ({ p: [x, y, -k * st_], n: [0, 0, 1] }));
    add(g, role, 0, 0, 0, { noWob: true, cast: !!st_ });
  });
  if (G.finite) {
    for (const [xs, sgn] of [[X0, -1], [X1, 1]]) {
      const bs = (k, z) => (k === 0 ? S(xs, z) : k === 1 ? S(xs, z) - 0.14 : k === 2 ? S(xs, z) * 0.8 - 0.62 : B[k](xs));
      LAYERS.forEach((role, k) => {
        const g = faceGeo(bs, k, Z0, 0, [], (z, y) => ({ p: [xs, y, z], n: [sgn, 0, 0] }));
        if (sgn < 0) g.index || g.scale(1, 1, 1);
        const m = add(g, role, 0, 0, 0, { noWob: true, cast: false, mat: { side: THREE.DoubleSide } });
        m.userData.side = true;
      });
    }
    box(X1 - X0 + 0.6, 0.6, -Z0 + 0.6, 'woodDark', 0, -12.8, Z0 / 2, { r: 0.08 });
    box(60, 0.4, 44, 'table', 0, -13.3, -2, { r: 0.05, cast: false });
    box(30, 0.05, 22, 'mat', 0, -13.07, 0, { r: 0.02, cast: false });
  }

  // ── поверхность земли
  {
    const nx = Math.round((X1 - X0) / (G.flat ? 0.9 : 0.5)), nz = Math.round(-Z0 / (G.flat ? 0.9 : 0.5));
    const P = [], U = [], I = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      let x = lerp(X0, X1, i / nx), z = lerp(0, Z0, j / nz);
      if (G.flat && j > 0 && j < nz && i > 0 && i < nx) { x += (hash3(i, j, 1) - 0.5) * 0.5; z += (hash3(i, j, 2) - 0.5) * 0.5; }
      const jit = G.flat && j > 0 ? (hash3(i, j, 3) - 0.5) * 0.22 : 0;
      P.push(x, S(x, z) + jit, z); U.push(x / 4, z / 4);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
    add(g, 'grass', 0, 0, 0, { noWob: true, cast: false });
  }
  // дальние холмы (только у «бесконечного» мира)
  if (!G.finite) {
    const hills = (role, z0, z1, hf, step) => {
      const nx = Math.round(240 / step), nz = Math.round((z0 - z1) / step), P = [], I = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = lerp(-120, 120, i / nx), z = lerp(z0, z1, j / nz); P.push(x, hf(x, z) + (G.flat ? (hash3(i, j, 9) - 0.5) * 1.2 : 0), z); }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
      add(g, role, 0, 0, 0, { noWob: true, cast: false, recv: false });
    };
    hills('hillMid', -29.5, -60, (x, z) => S(x, -30) - 0.3 + 6.5 * sm((-z - 30) / 24) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + 0.8 * vnoise(x * 0.15, 0, z * 0.15), 3);
    hills('hillFar', -56, -150, (x, z) => 3 + 13 * sm((-z - 56) / 50) * (0.55 + 0.45 * Math.sin(x * 0.045 + 2.5)) + 1.6 * vnoise(x * 0.08, 3, z * 0.08), 5);
  }

  // ── дом
  const HX = -3.6, HW = 5.2, HZ0 = -6.0, HZ1 = -1.0, HD = HZ1 - HZ0, HZ = (HZ0 + HZ1) / 2;
  box(HW + 0.25, 0.45, HD + 0.25, 'stone', HX, 0.2, HZ, { r: 0.05 });
  box(HW, 2.8, HD, 'wall', HX, 1.8, HZ);
  {
    const sh = new THREE.Shape(); sh.moveTo(-HW / 2, 0); sh.lineTo(HW / 2, 0); sh.lineTo(0, 2.1); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: HD, bevelEnabled: false, steps: G.wobble ? 6 : 1 });
    add(g, 'wall', HX, 3.2, HZ0);
    const ang = Math.atan2(2.1, HW / 2), len = Math.hypot(HW / 2, 2.1) + 0.6;
    for (const s of [-1, 1]) {
      const m = box(len, 0.2, HD + 0.7, 'roof', 0, 0, HZ, { r: 0.05 });
      const dx = Math.cos(ang) * s, dy = -Math.sin(ang);
      m.position.set(HX + dx * (len / 2 - 0.08) - Math.sin(ang) * s * -0.1, 5.3 + 0.12 + dy * (len / 2 - 0.08), HZ);
      m.rotation.z = -ang * s;
    }
    cyl(0.14, 0.14, HD + 0.8, 'roof', HX, 5.46, HZ, { rot: [Math.PI / 2, 0, 0], seg: 10 });
  }
  box(0.62, 1.5, 0.62, 'brick', HX + 1.35, 5.0, -4.2, { r: 0.04 }); box(0.8, 0.14, 0.8, 'stone', HX + 1.35, 5.8, -4.2, { r: 0.04 });
  // дверь, окно, ставни
  box(1.12, 2.05, 0.1, 'white', HX - 1.25, 1.42, HZ1 + 0.03); box(0.94, 1.9, 0.1, 'door', HX - 1.25, 1.38, HZ1 + 0.07);
  add(new THREE.SphereGeometry(0.06, 10, 8), 'metal', HX - 0.95, 1.35, HZ1 + 0.16);
  box(1.5, 0.22, 0.7, 'stone', HX - 1.25, 0.11, HZ1 + 0.4, { r: 0.05 });
  box(1.36, 1.3, 0.1, 'white', HX + 1.0, 1.95, HZ1 + 0.03);
  box(1.14, 1.08, 0.06, 'glass', HX + 1.0, 1.95, HZ1 + 0.07, { mat: { emissive: 1 }, cast: false });
  box(0.07, 1.1, 0.05, 'white', HX + 1.0, 1.95, HZ1 + 0.12); box(1.16, 0.07, 0.05, 'white', HX + 1.0, 1.95, HZ1 + 0.12);
  for (const s of [-1, 1]) box(0.5, 1.3, 0.07, 'shutter', HX + 1.0 + s * 0.96, 1.95, HZ1 + 0.06);
  box(1.5, 0.1, 0.24, 'wood', HX + 1.0, 1.25, HZ1 + 0.14);
  cyl(0.42, 0.42, 0.08, 'white', HX, 4.05, HZ1 + 0.03, { rot: [Math.PI / 2, 0, 0], seg: 20 });
  cyl(0.33, 0.33, 0.06, 'glass', HX, 4.05, HZ1 + 0.07, { rot: [Math.PI / 2, 0, 0], seg: 20, mat: { emissive: 1 }, cast: false });

  // ── погреб
  {
    const x0 = -6.0, x1 = -1.5, xi0 = -5.75, xi1 = -1.75, yf = -3.5, yc = -0.9, zb = -3.6, f = 0.03;
    box(0.25, 3.1, 3.88, 'brick', x0 + 0.125, -2.2, (zb - 0.25 + f) / 2, { r: 0.02 });
    box(0.25, 3.1, 3.88, 'brick', x1 - 0.125, -2.2, (zb - 0.25 + f) / 2, { r: 0.02 });
    box(4.5, 0.25, 3.88, 'stone', (x0 + x1) / 2, yf - 0.125, (zb - 0.25 + f) / 2, { r: 0.02 });
    box(4.5, 0.25, 3.88, 'woodDark', (x0 + x1) / 2, yc + 0.125, (zb - 0.25 + f) / 2, { r: 0.02 });
    box(4.0, 2.6, 0.25, 'brick', (xi0 + xi1) / 2, (yf + yc) / 2, zb - 0.125, { r: 0.02 });
    for (const y of [-2.55, -1.85]) box(2.5, 0.09, 0.55, 'wood', -4.35, y, zb + 0.3);
    for (const x of [-5.5, -3.2]) box(0.09, 1.7, 0.5, 'wood', x, -2.65, zb + 0.3);
    const jars = ['jarA', 'jarB', 'jarC'];
    for (let s = 0; s < 2; s++) for (let i = 0; i < 6; i++) {
      const x = -5.25 + i * 0.36, y = (s ? -1.85 : -2.55) + 0.045;
      cyl(0.13, 0.13, 0.3, jars[(i + s) % 3], x, y + 0.15, zb + 0.3, { seg: 12 }); cyl(0.1, 0.1, 0.05, 'metal', x, y + 0.325, zb + 0.3, { seg: 12 });
    }
    // бочки
    for (const [bx, bz] of [[-2.45, -2.6], [-3.5, -2.9]]) {
      const pts = [[0.36, 0], [0.47, 0.25], [0.5, 0.5], [0.47, 0.75], [0.36, 1.0]].map((p) => new THREE.Vector2(p[0], p[1]));
      add(new THREE.LatheGeometry(pts, G.flat ? 8 : 20), 'barrel', bx, yf, bz);
      cyl(0.36, 0.36, 0.04, 'woodDark', bx, yf + 0.99, bz, { seg: 16 });
      for (const hy of [0.22, 0.78]) add(new THREE.TorusGeometry(0.475, 0.03, 6, 20), 'metal', bx, yf + hy, bz, { rot: [Math.PI / 2, 0, 0] });
    }
    for (const [cx, cz, w, h] of [[-5.15, -1.5, 0.95, 0.7], [-4.2, -0.95, 0.75, 0.55]]) {
      box(w, h, w * 0.85, 'wood', cx, yf + h / 2, cz, { r: 0.02 });
      for (const dy of [-0.3, 0.3]) box(w + 0.04, 0.09, w * 0.85 + 0.04, 'woodDark', cx, yf + h / 2 + dy * h * 0.75, cz, { r: 0.01 });
    }
    // лестница
    const la = new THREE.Group(); la.position.set(-2.35, yf, -0.75); la.rotation.z = 0.2; scene.add(la);
    for (const s of [-1, 1]) box(0.08, 2.85, 0.08, 'wood', 0, 1.42, s * 0.28, { parent: la });
    for (let i = 0; i < 6; i++) box(0.06, 0.06, 0.6, 'wood', 0, 0.35 + i * 0.44, 0, { parent: la });
    // лампа
    cyl(0.012, 0.012, 0.5, 'woodDark', -4.1, yc - 0.25, -1.6, { seg: 5, cast: false });
    cyl(0.06, 0.24, 0.2, 'metal', -4.1, yc - 0.56, -1.6, { seg: 14, cast: false });
    add(new THREE.SphereGeometry(0.09, 12, 10), 'lamp', -4.1, yc - 0.68, -1.6, { mat: { emissive: 1 }, cast: false });
    const pl = new THREE.PointLight(0xffc070, (st.lampI ?? 14), 7, 2); pl.position.set(-4.1, yc - 0.8, -1.6); scene.add(pl);
  }

  // ── колодец
  const WX = 2.5;
  const dyn = {};
  {
    const top = 0.85, bot = -8.6, H = top - bot;
    cyl(0.4, 0.4, H, 'concrete', WX, (top + bot) / 2, 0, { open: true, ts: Math.PI / 2, tl: Math.PI, mat: { side: THREE.DoubleSide }, noWob: true });
    for (const s of [-1, 1]) box(0.1, H, 0.1, 'concrete', WX + s * 0.45, (top + bot) / 2, -0.02, { r: 0.01 });
    for (let y = -7.8; y < 0; y += 0.9) for (const s of [-1, 1]) box(0.12, 0.035, 0.12, 'stone', WX + s * 0.45, y, -0.01, { r: 0.005, cast: false });
    cyl(0.64, 0.64, top, 'stone', WX, top / 2, 0, { open: true, ts: Math.PI / 2, tl: Math.PI, noWob: true });
    for (const s of [-1, 1]) box(0.14, top, 0.08, 'stone', WX + s * 0.57, top / 2, -0.01, { r: 0.01 });
    cyl(0.39, 0.39, 0.9, 'water', WX, bot + 0.45, -0.001, { ts: Math.PI / 2, tl: Math.PI, mat: { water: 1 }, cast: false, noWob: true, seg: 20 });
    for (const s of [-1, 1]) box(0.14, 2.3, 0.14, 'wood', WX + s * 0.86, 1.15, -0.45);
    const ang = 0.62, len = 1.55;
    for (const s of [-1, 1]) {
      const m = box(len, 0.1, 1.5, 'roof', 0, 0, -0.45, { r: 0.03 });
      m.position.set(WX + Math.cos(ang) * s * (len / 2 - 0.05), 3.02 - Math.sin(ang) * (len / 2 - 0.05), -0.45); m.rotation.z = -ang * s;
    }
    cyl(0.11, 0.11, 1.6, 'wood', WX, 1.85, -0.45, { rot: [0, 0, Math.PI / 2], seg: 12 });
    box(0.05, 0.4, 0.05, 'metal', WX + 0.98, 1.68, -0.45); box(0.3, 0.05, 0.05, 'metal', WX + 1.1, 1.5, -0.45);
    dyn.rope = cyl(0.018, 0.018, 1, 'rope', WX, 0, -0.42, { seg: 6, cast: false, noWob: true });
    const bk = new THREE.Group(); scene.add(bk); dyn.bucket = bk;
    cyl(0.17, 0.13, 0.3, 'metal', 0, 0, 0, { parent: bk, seg: 14, noWob: true });
    add(new THREE.TorusGeometry(0.15, 0.014, 5, 14, Math.PI), 'metal', 0, 0.15, 0, { parent: bk, noWob: true });
    bk.position.set(WX, -1.2, -0.42);
  }
  // труба от колодца к дому
  {
    cyl(0.085, 0.085, 3.5, 'pipe', 0.25, -1.9, 0.0, { rot: [0, 0, Math.PI / 2], seg: 14, noWob: true });
    for (const x of [1.92, -1.42]) cyl(0.13, 0.13, 0.1, 'pipe', x, -1.9, 0.0, { rot: [0, 0, Math.PI / 2], seg: 14, noWob: true });
    cyl(0.07, 0.07, 1.0, 'pipe', -1.9, -1.4, -0.35, { seg: 12, noWob: true });
    cyl(0.07, 0.07, 0.32, 'pipe', -1.9, -1.9, -0.2, { rot: [Math.PI / 2, 0, 0], seg: 12, noWob: true });
  }

  // ── камни и галька на срезе
  {
    const r = rnd(7), inHole = (x, y, m) => HOLES.some((h) => x > h.x0 - m && x < h.x1 + m && y > h.y0 - m && y < h.y1 + m);
    let n = 0, guard = 0;
    while (n < 20 && guard++ < 400) {
      const x = lerp(-7.4, 7.4, r()), y = lerp(-6.8, -1.0, r()), rr = 0.16 + r() * 0.3;
      if (inHole(x, y, rr + 0.1) || y > B[2](x) - rr || (y < B[4](x) + 0.2) || Math.abs(y + 1.9) < 0.5) continue;
      add(blob(rr, n * 3.1 + 1, 0.25, 1.3, 1.25, 0.8, 0.55), 'stone', x, y, 0, { rot: [0, 0, r() * 3], cast: false }); n++;
    }
    n = 0; guard = 0;
    while (n < 46 && guard++ < 900) {
      const x = lerp(-7.6, 7.6, r()), y = lerp(-10.3, -6.8, r()), rr = 0.07 + r() * 0.12;
      if (inHole(x, y, rr + 0.05) || y > B[4](x) - rr || y < B[5](x) + rr) continue;
      add(blob(rr, n * 1.7 + 40, 0.2, 1.2, 1.2, 0.85, 0.5), 'pebble', x, y, 0, { cast: false }); n++;
    }
  }

  // ── деревья
  const tree = (x, z, h, cr, leafA, leafB, seed, roots) => {
    const y0 = S(x, z) - 0.05, g = new THREE.Group(); g.position.set(x, y0, z); scene.add(g);
    cyl(0.16 * cr, 0.3 * cr, h, 'trunk', 0, h / 2, 0, { parent: g, seg: 9, rot: [0, 0, 0.05] });
    cyl(0.07 * cr, 0.13 * cr, h * 0.5, 'trunk', 0.45 * cr, h * 0.8, 0, { parent: g, seg: 7, rot: [0, 0, -0.75] });
    const r = rnd(seed), crown = new THREE.Group(); crown.position.set(0, h, 0); g.add(crown);
    const P = [[0, 0.9, 0, 1.25], [-0.95, 0.3, 0.2, 1.0], [0.95, 0.45, 0.1, 1.05], [0.1, 0.25, 0.8, 0.95], [-0.2, 1.55, -0.2, 0.85], [0.6, 1.3, 0.4, 0.7]];
    P.forEach((p, i) => add(blob(p[3] * cr, seed + i * 5.3, 0.18, 1.6), i > 3 || i === 0 ? leafB : leafA, p[0] * cr, p[1] * cr, p[2] * cr, { parent: crown, rot: [r() * 3, r() * 3, 0] }));
    if (roots) {
      for (const [dx, dy, bend] of [[-1.5, -2.2, 0.4], [-0.5, -3.0, -0.3], [0.7, -2.7, 0.35], [1.7, -1.8, -0.4]]) {
        tube([[x, y0 - 0.0, 0.02], [x + dx * 0.35 + bend * 0.3, y0 + dy * 0.35, 0.02], [x + dx * 0.75 - bend * 0.25, y0 + dy * 0.75, 0.02], [x + dx, y0 + dy, 0.02]], 0.055, 'trunk', { cast: false, noWob: true });
      }
      cyl(0.3 * cr, 0.36 * cr, 0.5, 'trunk', x, y0 - 0.2, z * 0.5, { seg: 9 });
    }
    return crown;
  };
  dyn.crown = tree(5.5, -0.9, 3.4, 1.5, 'leaf', 'leaf2', 11, true);
  const backTrees = G.finite ? [[-7.0, -6.6, 2.4, 1.0, 21], [0.4, -7.4, 2.6, 1.1, 22], [6.6, -6.9, 2.2, 1.0, 24]]
    : [[-8.6, -7.5, 2.6, 1.15, 21], [0.6, -9.5, 2.8, 1.25, 22], [4.4, -12, 3.0, 1.3, 23], [9.5, -8.5, 2.5, 1.15, 24], [-13, -12, 3, 1.4, 25], [13.5, -14, 3, 1.4, 26], [-3, -15, 3, 1.3, 27]];
  backTrees.forEach((t) => tree(t[0], t[1], t[2], t[3], 'leafDark', 'leaf', t[4], false));
  // ели
  const fir = (x, z, s) => {
    const y0 = S(x, z); cyl(0.1 * s, 0.14 * s, 0.9 * s, 'trunk', x, y0 + 0.4 * s, z, { seg: 7 });
    for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry((1.15 - i * 0.24) * s, 1.3 * s, G.flat ? 7 : 12, G.wobble ? 3 : 1), 'leafDark', x, y0 + (1.2 + i * 0.75) * s, z);
  };
  fir(-7.15, -3.0, 1.25); if (!G.finite) { fir(-10.2, -4.6, 1.5); fir(8.6, -5.5, 1.3); fir(-11.5, -9, 1.6); fir(11.8, -10.5, 1.5); }
  // кусты, тропинка, забор, трава
  for (const [x, z, r, s] of [[-0.55, -1.3, 0.55, 31], [-6.55, -0.9, 0.5, 32], [0.3, -1.9, 0.4, 33], [3.9, -2.2, 0.55, 34], [6.9, -2.6, 0.6, 35]])
    add(blob(r, s, 0.2, 1.7, 1.2, 0.85, 1), s % 2 ? 'leaf2' : 'leaf', x, S(x, z) + r * 0.55, z);
  for (const [x, z] of [[-4.6, 0.0 - 0.45], [-3.5, -0.42], [-2.3, -0.5], [-1.1, -0.4], [0.1, -0.5], [1.2, -0.42]])
    add(blob(0.3, x * 3, 0.15, 1.5, 1.2, 0.22, 0.9), 'stone', x, S(x, z) + 0.03, z, { cast: false });
  for (let x = -0.4; x <= 7.3; x += 1.1) box(0.11, 1.05, 0.11, 'wood', x, S(x, -5.2) + 0.5, -5.2, { r: 0.02 });
  for (const y of [0.4, 0.8]) {
    for (let x = -0.4; x < 7.2; x += 1.1) {
      const ya = S(x, -5.2), yb = S(x + 1.1, -5.2), m = box(Math.hypot(1.1, yb - ya) + 0.05, 0.09, 0.05, 'wood', x + 0.55, (ya + yb) / 2 + y, -5.14, { r: 0.015 });
      m.rotation.z = Math.atan2(yb - ya, 1.1);
    }
  }
  {
    const r = rnd(99);
    for (let i = 0; i < 70; i++) {
      const x = lerp(-7.6, 7.6, r()), z = -0.06 - r() * 0.9;
      if ((x > -6.4 && x < -0.8 && z < -0.75) || Math.abs(x - WX) < 0.8) continue;
      const h = 0.16 + r() * 0.2;
      add(new THREE.ConeGeometry(0.05, h, 4), i % 3 ? 'leaf2' : 'leaf', x, S(x, z) + h / 2 - 0.02, z, { rot: [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5], cast: false, noWob: true });
    }
  }

  // ── облака и дым
  dyn.clouds = [];
  const cloud = (x, y, z, s, seed) => {
    const g = new THREE.Group(); g.position.set(x, y, z); (st.cloudsInScene ? scene : sky).add(g);
    const P = [[0, 0, 0, 1.5], [-1.6, -0.25, 0.1, 1.05], [1.6, -0.2, -0.1, 1.15], [0.7, 0.75, 0, 0.95], [-0.7, 0.6, 0.1, 0.85], [2.7, -0.45, 0, 0.7], [-2.6, -0.5, 0, 0.65]];
    P.forEach((p, i) => add(blob(p[3] * s, seed + i, 0.12, 1.4, 1.1, 0.85, st.flatClouds ? 0.06 : 0.8), 'cloud', p[0] * s, p[1] * s, p[2] * s, { parent: g, cast: false, recv: false, noWob: !G.wobble }));
    dyn.clouds.push(g); return g;
  };
  if (st.noClouds) { /* облака нарисованы на заднике */ }
  else if (G.finite) { cloud(-4.2, 9.6, -5, 0.85, 51); cloud(3.6, 11.4, -6.5, 0.7, 52); cloud(6.2, 8.2, -3.5, 0.5, 53); }
  else { cloud(-5.2, 11.4, -16, 1.5, 51); cloud(6.0, 14.6, -24, 1.8, 52); cloud(8.8, 9.4, -14, 0.9, 53); cloud(-10, 15.5, -34, 2.2, 54); cloud(-0.5, 9.0, -40, 1.4, 55); }
  if (st.strings) dyn.clouds.forEach((g) => { for (const dx of [-0.6, 0.7]) cyl(0.012, 0.012, 14, 'rope', dx, 7, 0, { parent: g, seg: 4, cast: false, noWob: true }); });
  dyn.smoke = [];
  for (let i = 0; i < 5; i++) dyn.smoke.push(add(blob(0.34, 60 + i, 0.2, 1.6), 'smoke', 0, 0, 0, { cast: false, recv: false }));

  st.setup(scene, sky);
  if (st.extra) st.extra({ scene, sky, add, box, cyl, blob, M, G, S });

  // ── камера и движение
  const camera = new THREE.PerspectiveCamera(st.fov || 40, 1080 / 1920, 3, 600);
  const C = st.cam || { a: [[7.6, 6.4, 33], [-0.15, -0.4, 0]], b: [[4.4, 5.0, 28.5], [-0.25, -0.9, 0]] };
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  const update = (t, T = 4) => {
    const p = sm(t / T), e = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t / T));
    camera.position.copy(va.set(...C.a[0]).lerp(vb.set(...C.b[0]), e));
    camera.lookAt(va.set(...C.a[1]).lerp(vb.set(...C.b[1]), e));
    const by = lerp(-0.6, -7.45, sm(t / (T * 0.85)));
    dyn.bucket.position.y = by; dyn.bucket.rotation.z = 0.05 * Math.sin(t * 3);
    const topY = 1.85; dyn.rope.scale.y = topY - (by + 0.15); dyn.rope.position.y = (topY + by + 0.15) / 2;
    dyn.clouds.forEach((g, i) => { g.position.x += 0; g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.08 * i); });
    dyn.crown.rotation.z = 0.02 * Math.sin(t * 1.3); dyn.crown.rotation.x = 0.015 * Math.sin(t * 0.9 + 1);
    dyn.smoke.forEach((m, i) => {
      const u = ((t * 0.22 + i / 5) % 1 + 1) % 1;
      m.position.set(HX + 1.35 + u * u * 1.6 + 0.12 * Math.sin(i * 2.1 + t), 5.95 + u * 3.2, -4.2);
      m.scale.setScalar(0.45 + u * 1.2); m.visible = u < 0.96; m.rotation.set(u * 2 + i, i, u);
      if (m.material.transparent) m.material.opacity = 1;
    });
    void p;
  };
  update(0);
  return { scene, camera, sky, update };
}
