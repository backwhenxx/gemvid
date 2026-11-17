// @ts-nocheck
// Набор деталей фирменного стиля: гранёные формы, деревья, ели, облака, дым, дом, забор, разрез из слоёв.
// Новый мир = новый файл в worlds/, собранный из этих деталей (не писать с нуля).
import * as THREE from 'three';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {PAL, mat} from './look';

export function hash3(x, y, z) { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); }
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
export const rnd = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
export const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// Конструктор: всё, что строит мир, идёт через него (материалы кэшируются, окна и лампы собираются для света суток)
export function makeKit(scene, pal = {}) {
  const P = Object.assign({}, PAL, pal);
  const cache = new Map();
  const wins = [], lamps = [];
  const M = (role, o = {}) => {
    const k = role + JSON.stringify(o);
    if (!cache.has(k)) { const m = mat(role, P[role] || role, o); if (o.emissive) { m.userData.base = o.ei ?? 1; if (o.win) wins.push(m); } cache.set(k, m); }
    return cache.get(k);
  };
  const add = (geo, role, x = 0, y = 0, z = 0, o = {}) => {
    const m = new THREE.Mesh(geo, o.material || M(role, o.mat || {})); m.position.set(x, y, z);
    if (o.rot) m.rotation.set(...o.rot);
    m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
    if (o.ro !== undefined) m.renderOrder = o.ro;
    (o.parent || scene).add(m); return m;
  };
  const rbox = (w, h, d, r = 0.03) => {
    r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(THREE.MathUtils.clamp(v.x, -w / 2 + r, w / 2 - r), THREE.MathUtils.clamp(v.y, -h / 2 + r, h / 2 - r), THREE.MathUtils.clamp(v.z, -d / 2 + r, d / 2 - r));
      const dl = v.clone().sub(c); if (dl.lengthSq() > 1e-12) { dl.normalize(); v.copy(c).addScaledVector(dl, r); }
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  };
  // гранёный ком (кроны, облака, камни, сугробы)
  const blob = (r, seed, a = 0.22, f = 1.3, sx = 1, sy = 1, sz = 1, detail = 1) => {
    let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + a * 2 * (vnoise(x * f / r + seed, y * f / r + seed * 1.7, z * f / r) - 0.5);
      p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
    }
    g.computeVertexNormals(); return g;
  };
  const box = (w, h, d, role, x, y, z, o = {}) => add(rbox(w, h, d, o.r ?? 0.03), role, x, y, z, o);
  const cyl = (rt, rb, h, role, x, y, z, o = {}) => add(new THREE.CylinderGeometry(rt, rb, h, o.seg || 8, 1, !!o.open, o.ts || 0, o.tl || Math.PI * 2), role, x, y, z, o);
  const tube = (pts, r, role, o = {}) => add(new THREE.TubeGeometry(o.curve || new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', o.tension ?? 0.5), o.n || 32, r, o.rs || 6), role, 0, 0, 0, o);
  // ломаная со скруглёнными углами (трубы)
  const pipeCurve = (pts, rad = 0.25) => {
    const V = pts.map((p) => new THREE.Vector3(...p)), path = new THREE.CurvePath();
    let cur = V[0].clone();
    for (let i = 1; i < V.length; i++) {
      const a = V[i - 1], b = V[i], c = V[i + 1];
      if (!c) { path.add(new THREE.LineCurve3(cur, b.clone())); break; }
      const d1 = b.clone().sub(a).normalize(), d2 = c.clone().sub(b).normalize();
      const r = Math.min(rad, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
      const p1 = b.clone().addScaledVector(d1, -r), p2 = b.clone().addScaledVector(d2, r);
      path.add(new THREE.LineCurve3(cur, p1)); path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2)); cur = p2;
    }
    return path;
  };
  const pipe = (pts, r, role, o = {}) => { const c = pipeCurve(pts, o.bend ?? 0.25); const m = add(new THREE.TubeGeometry(c, o.n || Math.max(40, pts.length * 24), r, o.rs || 8), role, 0, 0, 0, o); m.userData.curve = c; return m; };

  // ── деревья и кусты
  const tree = (x, y0, z, h, cr, seed, o = {}) => {
    const g = new THREE.Group(); g.position.set(x, y0, z); scene.add(g);
    cyl(0.16 * cr, 0.3 * cr, h, 'trunk', 0, h / 2, 0, {parent: g, seg: 9, rot: [0, 0, 0.05]});
    cyl(0.07 * cr, 0.13 * cr, h * 0.5, 'trunk', 0.45 * cr, h * 0.8, 0, {parent: g, seg: 7, rot: [0, 0, -0.75]});
    const crown = new THREE.Group(); crown.position.set(0, h, 0); g.add(crown);
    if (o.bare) {
      // голое зимнее дерево: ветви ломаными трубками, на развилках — снег
      const r = rnd(seed);
      const branch = (p0, dir, len, rad, depth) => {
        const p1 = p0.clone().addScaledVector(dir, len);
        tube([[p0.x, p0.y, p0.z], [lerp(p0.x, p1.x, 0.5) + (r() - 0.5) * 0.2, lerp(p0.y, p1.y, 0.5), lerp(p0.z, p1.z, 0.5)], [p1.x, p1.y, p1.z]], rad, 'trunk', {parent: crown, n: 6, rs: 5, cast: true});
        if (depth > 0) for (let k = 0; k < 2; k++) {
          const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), (k ? 1 : -1) * (0.35 + r() * 0.35)).applyAxisAngle(new THREE.Vector3(0, 1, 0), (r() - 0.5) * 1.2).normalize();
          branch(p1, d, len * 0.72, rad * 0.65, depth - 1);
        }
        if (o.snow && depth >= 1) add(blob(rad * 1.6, seed + p1.x * 7, 0.2, 1.5, 1.4, 0.55, 1.1, 0), 'snow', p1.x, p1.y + rad * 1.05, p1.z, {parent: crown, cast: false});
      };
      branch(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.05, 1, 0).normalize(), 1.1 * cr, 0.12 * cr, 3);
      return {g, crown};
    }
    const P_ = [[0, 0.9, 0, 1.25], [-0.95, 0.3, 0.2, 1.0], [0.95, 0.45, 0.1, 1.05], [0.1, 0.25, 0.8, 0.95], [-0.2, 1.55, -0.2, 0.85], [0.6, 1.3, 0.4, 0.7]];
    const r = rnd(seed);
    P_.forEach((p, i) => add(blob(p[3] * cr, seed + i * 5.3, 0.18, 1.6), i > 3 || i === 0 ? (o.leafB || 'leaf2') : (o.leafA || 'leaf'), p[0] * cr, p[1] * cr, p[2] * cr, {parent: crown, rot: [r() * 3, r() * 3, 0]}));
    return {g, crown};
  };
  // ель; snow — белые шапки на ярусах (выше и меньше, без касания граней)
  const fir = (x, y0, z, s, snow = false) => {
    cyl(0.1 * s, 0.14 * s, 0.9 * s, 'trunk', x, y0 + 0.4 * s, z, {seg: 6});
    for (let i = 0; i < 4; i++) {
      const rr = (1.15 - i * 0.24) * s, y = y0 + (1.2 + i * 0.75) * s;
      add(new THREE.ConeGeometry(rr, 1.3 * s, 7, 1), 'leafDark', x, y, z, {rot: [0, i * 0.7, 0]});
      if (snow) add(new THREE.ConeGeometry(rr * 0.62, 0.62 * s, 7, 1), 'snow', x, y + 0.42 * s, z, {rot: [0, i * 0.7 + 0.2, 0], cast: false});
    }
  };
  const cloud = (parent, x, y, z, s, seed) => {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const P_ = [[0, 0, 0, 1.5], [-1.6, -0.25, 0.1, 1.05], [1.6, -0.2, -0.1, 1.15], [0.7, 0.75, 0, 0.95], [-0.7, 0.6, 0.1, 0.85], [2.7, -0.45, 0, 0.7], [-2.6, -0.5, 0, 0.65]];
    P_.forEach((p, i) => add(blob(p[3] * s, seed + i, 0.12, 1.4, 1.1, 0.85, 0.8), 'cloud', p[0] * s, p[1] * s, p[2] * s, {parent: g, cast: false, recv: false}));
    return g;
  };
  // дым из трубы: комья поднимаются, растут и тают (t — секунды)
  const smoke = (x, y, z, n = 6, s = 1) => {
    const L = []; for (let i = 0; i < n; i++) L.push(add(blob(0.34 * s, 60 + i, 0.2, 1.6), 'smoke', 0, 0, 0, {cast: false, recv: false}));
    return (t, on = 1) => L.forEach((m, i) => {
      const u = ((t * 0.2 + i / n) % 1 + 1) % 1;
      m.position.set(x + u * u * 1.8 * s + 0.12 * Math.sin(i * 2.1 + t), y + u * 3.4 * s, z);
      m.scale.setScalar((0.45 + u * 1.3) * Math.min(1, on * 1.5)); m.visible = on > 0.02 && u < 0.95; m.rotation.set(u * 2 + i, i, u);
    });
  };

  return {P, M, add, box, cyl, tube, pipe, pipeCurve, blob, tree, fir, cloud, smoke, wins, lamps, rbox};
}

// Разрез: передняя грань земли полосами слоёв. bound(k, x) — верх слоя k (k=0 — поверхность), holes — вырезы.
export function cutFace(K, layers, bound, X0, X1, holes, z = 0, DX = 0.25) {
  layers.forEach((role, k) => {
    const P = [], N = [];
    for (let ua = X0; ua < X1 - 1e-6; ua += DX) {
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
      for (const s of spans) for (const [u, y] of [[ua, s[0]], [ub, s[2]], [ub, s[3]], [ua, s[0]], [ub, s[3]], [ua, s[1]]]) { P.push(u, y, z); N.push(0, 0, 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    K.add(g, role, 0, 0, 0, {cast: false, mat: {smooth: true}});
  });
}

// Поверхность земли: гранёная сетка по функции высоты S(x, z), от среза z=0 вглубь до Z0
export function ground(K, S, role, X0, X1, Z0, step = 0.9) {
  const nx = Math.round((X1 - X0) / step), nz = Math.round(-Z0 / step), P = [], I = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    let x = lerp(X0, X1, i / nx), z = lerp(0, Z0, j / nz);
    if (j > 0 && j < nz && i > 0 && i < nx) { x += (hash3(i, j, 1) - 0.5) * 0.5; z += (hash3(i, j, 2) - 0.5) * 0.5; }
    const jit = j > 0 ? (hash3(i, j, 3) - 0.5) * 0.18 : 0;
    P.push(x, S(x, z) + jit, z);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  return K.add(g, role, 0, 0, 0, {cast: false});
}
export function hills(K, role, z0, z1, hf, step) {
  const nx = Math.round(240 / step), nz = Math.round((z0 - z1) / step), P = [], I = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = lerp(-120, 120, i / nx), z = lerp(z0, z1, j / nz); P.push(x, hf(x, z) + (hash3(i, j, 9) - 0.5) * 1.2, z); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  K.add(g, role, 0, 0, 0, {cast: false, recv: false});
}

// Дом с двускатной крышей. Возвращает точки для подписей. snow — снег на крыше, сосульки.
export function house(K, HX, HZ0, HZ1, o = {}) {
  const {box, cyl, add} = K, HW = o.w ?? 5.2, HD = HZ1 - HZ0, HZ = (HZ0 + HZ1) / 2;
  const P = (o2) => Object.assign({parent: o.parent}, o2);
  box(HW + 0.25, 0.45, HD + 0.25, 'stone', HX, 0.2, HZ, P({r: 0.05}));
  box(HW, 2.8, HD, o.wall ?? 'wall', HX, 1.8, HZ, P({}));
  const sh = new THREE.Shape(); sh.moveTo(-HW / 2, 0); sh.lineTo(HW / 2, 0); sh.lineTo(0, 2.1); sh.closePath();
  add(new THREE.ExtrudeGeometry(sh, {depth: HD, bevelEnabled: false}), o.wall ?? 'wall', HX, 3.2, HZ0, P({}));
  const ang = Math.atan2(2.1, HW / 2), len = Math.hypot(HW / 2, 2.1) + 0.6;
  for (const s of [-1, 1]) {
    const dx = Math.cos(ang) * s, dy = -Math.sin(ang), cx = HX + dx * (len / 2 - 0.08) + Math.sin(ang) * s * 0.1, cy = 5.42 + dy * (len / 2 - 0.08);
    const m = box(len, 0.2, HD + 0.7, 'roof', cx, cy, HZ, P({r: 0.05})); m.rotation.z = -ang * s;
    if (o.snow) {
      // снег — отдельный пласт над скатом (зазор 3 см), немного короче ската
      const nx = Math.sin(ang) * s, ny = Math.cos(ang);
      const sn = box(len - 0.35, 0.16, HD + 0.55, 'snow', cx + nx * 0.21 - dx * 0.1, cy + ny * 0.21 - dy * 0.1, HZ, P({r: 0.07, cast: false})); sn.rotation.z = -ang * s;
      // сосульки вдоль свеса
      const ex = HX + s * (HW / 2 + 0.42), ey = 5.42 - Math.sin(ang) * (len - 0.16) - 0.05;
      for (let i = 0; i < 9; i++) {
        const zz = HZ0 - 0.2 + (HD + 0.4) * (i + 0.5) / 9, L = 0.25 + 0.25 * hash3(i, s, 4);
        add(new THREE.ConeGeometry(0.055, L, 5), 'ice', ex, ey - L / 2, zz, P({rot: [Math.PI, 0, 0], cast: false}));
      }
    }
  }
  cyl(0.14, 0.14, HD + 0.8, 'roof', HX, 5.46, HZ, P({rot: [Math.PI / 2, 0, 0], seg: 8}));
  if (o.snow) cyl(0.17, 0.17, HD + 0.6, 'snow', HX, 5.58, HZ, P({rot: [Math.PI / 2, 0, 0], seg: 8, cast: false}));
  // труба
  const chX = HX + 1.35, chZ = HZ0 + 1.8;
  box(0.62, 1.5, 0.62, 'brick', chX, 5.0, chZ, P({r: 0.04})); box(0.8, 0.14, 0.8, 'stone', chX, 5.8, chZ, P({r: 0.04}));
  if (o.snow) box(0.66, 0.1, 0.66, 'snow', chX, 5.93, chZ, P({r: 0.04, cast: false}));
  // дверь, окно, ставни, круглое окно
  box(1.12, 2.05, 0.1, 'white', HX - 1.25, 1.42, HZ1 + 0.03, P({})); box(0.94, 1.9, 0.1, 'door', HX - 1.25, 1.38, HZ1 + 0.08, P({}));
  add(new THREE.SphereGeometry(0.06, 8, 6), 'metal', HX - 0.95, 1.35, HZ1 + 0.17, P({}));
  box(1.5, 0.22, 0.7, 'stone', HX - 1.25, 0.11, HZ1 + 0.4, P({r: 0.05}));
  if (o.snow) box(1.3, 0.08, 0.5, 'snow', HX - 1.25, 0.27, HZ1 + 0.42, P({r: 0.03, cast: false}));
  box(1.36, 1.3, 0.1, 'white', HX + 1.0, 1.95, HZ1 + 0.03, P({}));
  box(1.14, 1.08, 0.06, 'glass', HX + 1.0, 1.95, HZ1 + 0.08, P({mat: {emissive: 1, win: 1, ei: 0.9}, cast: false}));
  box(0.07, 1.1, 0.05, 'white', HX + 1.0, 1.95, HZ1 + 0.14, P({})); box(1.16, 0.07, 0.05, 'white', HX + 1.0, 1.95, HZ1 + 0.14, P({}));
  for (const s of [-1, 1]) box(0.5, 1.3, 0.07, 'shutter', HX + 1.0 + s * 0.96, 1.95, HZ1 + 0.07, P({}));
  box(1.5, 0.1, 0.24, 'wood', HX + 1.0, 1.25, HZ1 + 0.15, P({}));
  if (o.snow) box(1.4, 0.07, 0.2, 'snow', HX + 1.0, 1.335, HZ1 + 0.15, P({r: 0.02, cast: false}));
  cyl(0.42, 0.42, 0.08, 'white', HX, 4.05, HZ1 + 0.03, P({rot: [Math.PI / 2, 0, 0], seg: 16}));
  cyl(0.33, 0.33, 0.06, 'glass', HX, 4.05, HZ1 + 0.08, P({rot: [Math.PI / 2, 0, 0], seg: 16, mat: {emissive: 1, win: 1, ei: 0.9}, cast: false}));
  return {chimney: [chX, 5.95, chZ], door: [HX - 1.25, 1.4, HZ1], window: [HX + 1.0, 1.95, HZ1]};
}

// Забор вдоль z = const по рельефу S
export function fence(K, S, x0, x1, z, snow = false) {
  const {box} = K;
  for (let x = x0; x <= x1 + 1e-6; x += 1.1) { box(0.11, 1.05, 0.11, 'wood', x, S(x, z) + 0.5, z, {r: 0.02}); if (snow) box(0.15, 0.07, 0.15, 'snow', x, S(x, z) + 1.07, z, {r: 0.03, cast: false}); }
  for (const y of [0.4, 0.8]) for (let x = x0; x < x1 - 1e-6; x += 1.1) {
    const ya = S(x, z), yb = S(x + 1.1, z), ang = Math.atan2(yb - ya, 1.1), L = Math.hypot(1.1, yb - ya) + 0.05;
    const m = box(L, 0.09, 0.05, 'wood', x + 0.55, (ya + yb) / 2 + y, z + 0.06, {r: 0.015}); m.rotation.z = ang;
    if (snow) { const s = box(L - 0.1, 0.05, 0.08, 'snow', x + 0.55 - Math.sin(ang) * 0.075, (ya + yb) / 2 + y + Math.cos(ang) * 0.075, z + 0.06, {r: 0.02, cast: false}); s.rotation.z = ang; }
  }
}
