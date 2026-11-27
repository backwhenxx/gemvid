// @ts-nocheck
// Мир «Топ-5 самых глубоких карьеров» (28.11): пять карьеров в ряд, 1 ед. = 100 м (по вертикали и горизонтали честно).
// Каждый карьер — уступы (бермы) по кольцам u = rho / r(θ); срез земли по z = 0 через центр карьера показывает профиль
// и пласты породы. Карьер «копается» по q[l*] (дно опускается до полной глубины), рулетка m*, Бурдж-Халифа в Бингеме,
// оползень 2013 г. (slide) — сектор задней стены сползает в осыпь.
import * as THREE from 'three';
import {makeKit, rnd, sm, lerp, hash3, vnoise} from '../kit';

const DEEP = -80, TW = 30, TZ = -70;
export const PITS = [
  {key: 'l5', cx: -120, d: 6.0, r: 16, e: 0.1, ph: 0.4, gnd: '#e1c491', lay: ['#d8ae76', '#ba8c5c', '#968777', '#76707a', '#5d5b6a'], hill: '#cfae80'},  // Мурунтау
  {key: 'l4', cx: -60, d: 6.3, r: 10, e: 0.12, ph: 1.1, gnd: '#eef2f8', lay: ['#a99d8c', '#8f9a9c', '#738591', '#5d6e7c', '#4e5768'], hill: '#5f7f72', snow: 1}, // Удачный
  {key: 'l3', cx: 0, d: 6.45, r: 16, e: 0.14, ph: 2.0, gnd: '#d9a678', lay: ['#cb8a5c', '#b0704e', '#966459', '#7b6a6f', '#5f5a67'], hill: '#b98a6e'},   // Эскондида
  {key: 'l2', cx: 60, d: 8.5, r: 18, e: 0.12, ph: 0.2, gnd: '#cfbb9b', lay: ['#bca78a', '#a58c72', '#8f8a86', '#707a80', '#5a5f6c'], hill: '#a8977e'},   // Чукикамата
  {key: 'l1', cx: 120, d: 12.0, r: 20, e: 0.08, ph: 1.6, gnd: '#b9a57c', lay: ['#c47b4f', '#a9664a', '#8f8a76', '#6d7468', '#575a60'], hill: '#8e8a6c'},  // Бингем-Каньон
];
const LT = [0, -1.6, -4.4, -7.8, -12.6, -17.5, -23, -31, DEEP], NL = 8;
for (const P of PITS) P.lay.push('#8a7c6e', '#737284', '#85725f');   // кровли пластов (волнистые)
const layTop = (k, x) => (k === 0 ? 1e9 : k >= NL ? DEEP : LT[k] + 0.45 * Math.sin(0.09 * x + k * 1.7) + 0.25 * Math.sin(0.23 * x + k));
const rr = (P, th) => P.r * (1 + P.e * Math.cos(2 * (th - P.ph)) + 0.04 * Math.sin(3 * th + P.ph));
const UB = 0.17, NB = 13;
// профиль карьера полной глубины (u = 0 центр, 1 — бровка)
function prof(P, u) {
  if (u >= 1) return 0;
  const t = Math.min(1, (1 - u) / (1 - UB)), db = t ** 0.92, s = db * NB, fl = Math.floor(s), fr = s - fl;
  return -Math.min(1, (fl + sm((fr - 0.55) / 0.45)) / NB) * P.d;
}
// высота с учётом «докопано на g» и оползня
const SL0 = 1.22 * Math.PI, SL1 = 1.46 * Math.PI;
function hgt(P, u, th, x, z, g, slide) {
  let y = Math.max(prof(P, u), -g * P.d);
  if (u > 1) y += 0.14 * (vnoise(x * 0.12, 3, z * 0.12) - 0.5) * sm((u - 1) / 0.12) * sm((TW - Math.abs(x - P.cx)) / 4) * sm((z - TZ) / 4);
  if (slide > 0 && P.key === 'l1') {
    const w = sm((th - SL0) / 0.08) * sm((SL1 - th) / 0.08);
    if (w > 0 && u > 0.08 && u < 1.12) {
      const ys = u > 1 ? lerp(-1.1, 0, (u - 1) / 0.12) : u > 0.32 ? lerp(-P.d * 0.84, -1.1, (u - 0.32) / 0.68) : lerp(-P.d, -P.d * 0.84, sm((u - 0.08) / 0.24));
      y = lerp(y, Math.min(0, ys), w * sm(slide));
    }
  }
  return y;
}
// цвет точки стены: пласт по высоте, поверхность — свой грунт
const cTmp = new THREE.Color(), cG = new THREE.Color(), cGn = new THREE.Color();
function colAt(P, x, y, out) {
  let k = 0; while (k < NL - 1 && y < layTop(k + 1, x)) k++;
  out.set(P.lay[k]); const n = 0.92 + 0.16 * hash3(Math.round(x * 2), Math.round(y * 3), 7); out.multiplyScalar(n);
  return out.lerp(cGn.set(P.gnd), 1 - sm((-y - 0.04) / 0.7));
}

export const T = Object.fromEntries([
  ...PITS.map((P) => [P.key, [P.cx + 0.6, -P.d + 0.1, 0.4]]),
  ...PITS.map((P) => [P.key + 'top', [P.cx, 0.2, 0.4]]),
  ['burj', [120, -12 + 8.4, -2]], ['gap', [120.3, -1.8, -2]], ['slide', [120 + 15 * Math.cos(1.34 * Math.PI), -3.5, 15 * Math.sin(1.34 * Math.PI)]],
  ['snow', [-60 - 14, 0.3, -6]], ['desert', [-12, 0.3, -24]],
]);
const camP = (P, D, lx = 0) => { const ly = -P.d * 0.22, lz = -P.r * 0.5; return {pos: [P.cx + lx + 0.07 * D, ly + 0.38 * D, lz + 0.92 * D], look: [P.cx + lx, ly, lz], fov: 40}; };
export const CAMS = {
  hook: {pos: [124, 9, 44], look: [120, -3.5, -5], fov: 40},
  hook2: {pos: [127, 24, 66], look: [120, -4, -8], fov: 40},
  l5: camP(PITS[0], 68), l4: camP(PITS[1], 46), l3: camP(PITS[2], 68), l2: camP(PITS[3], 76), l1: camP(PITS[4], 84),
  l5a: camP(PITS[0], 78, -3), l1a: camP(PITS[4], 92, 2),
  
  slide: {pos: [126, 24, 62], look: [114, -4.5, -11], fov: 40},
  end: {pos: [130, 42, 96], look: [116, -4, -12], fov: 40},
  cover: {pos: [127, 22, 64], look: [120, -4.2, -8], fov: 40},
};

export function build(scene, sky) {
  // большой мир: туман дальше, тени на весь ряд карьеров
  scene.fog.near = 130; scene.fog.far = 430;
  scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) { const c = o.shadow.camera; c.left = -175; c.right = 175; c.top = 175; c.bottom = -175; c.near = -220; c.far = 320; c.updateProjectionMatrix(); o.shadow.mapSize.set(4096, 4096); o.shadow.normalBias = 0.12; } });
  const pal = {smoke: '#c9b9a2', burjS: '#a9b8c8', burjG: '#7f93ab', iceP: '#cfe3ee', pondB: '#6f9a8e'};
  for (const P of PITS) { pal['hillM' + P.key] = P.hill; pal['dump' + P.key] = P.lay[1]; }
  const Kt = makeKit(scene, pal);
  const {add, box, cyl, blob, cloud, fir} = Kt;
  const VM = new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1});
  const CM = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1});

  // ── карьеры: полярная сетка по контурам u, внешнее кольцо до краёв плитки (углы плитки — отдельные лучи)
  const US = []; for (let u = 0; u < 1 - 1e-9; u += 0.0055) US.push(u); US.push(1, 1.04, 1.08, 1.12, 1.2);
  const pits = PITS.map((P) => {
    const ths = []; for (let i = 0; i <= 128; i++) ths.push(Math.PI + Math.PI * i / 128);
    const ca = Math.atan2(TZ, -TW) + 2 * Math.PI, cb = Math.atan2(TZ, TW) + 2 * Math.PI; ths.push(ca, cb); ths.sort((a, b) => a - b);
    const R = (th) => { const c = Math.cos(th), s = Math.sin(th); let m = 1e9; if (c < -1e-9) m = Math.min(m, TW / -c); if (c > 1e-9) m = Math.min(m, TW / c); if (s < -1e-9) m = Math.min(m, -TZ / -s); return m; };
    const NO = 7, nr = US.length + NO, V = []; // [x, z, u, th]
    for (const th of ths) {
      const r0 = rr(P, th), c = Math.cos(th), s = Math.sin(th);
      for (const u of US) V.push([P.cx + c * u * r0, s * u * r0, u, th]);
      const a = 1.2 * r0, b = R(th); for (let j = 1; j <= NO; j++) { const rho = lerp(a, b, j / NO); V.push([P.cx + c * rho, Math.min(0, s * rho), rho / r0, th]); }
    }
    for (const v of V) if (Math.abs(v[1]) < 1e-6) v[1] = 0;
    const tri = []; for (let i = 0; i < ths.length - 1; i++) for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, b = a + 1, c2 = a + nr, d = c2 + 1; tri.push(a, c2, b, b, c2, d); }
    const pos = new Float32Array(tri.length * 3), col = new Float32Array(tri.length * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, VM); m.receiveShadow = true; m.castShadow = true; scene.add(m);
    // срез z = 0: x-отсчёты точно по лучам θ = π и 2π
    const XS = []; { const left = V.slice(0, nr).map((v) => v[0]), right = V.slice((ths.length - 1) * nr).map((v) => v[0]); XS.push(...left.reverse(), ...right.slice(1)); }
    const cpos = new Float32Array((XS.length - 1) * NL * 18), ccol = new Float32Array(cpos.length);
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cg.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
    const nrm = new Float32Array(cpos.length); for (let i = 0; i < nrm.length; i += 3) nrm[i + 2] = 1; cg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    const cm = new THREE.Mesh(cg, CM); scene.add(cm);
    const Hc = XS.map((x) => { const u = Math.abs(x - P.cx) / rr(P, x < P.cx ? Math.PI : 2 * Math.PI); return [x, u, x < P.cx ? Math.PI : 2 * Math.PI]; });
    return {P, V, tri, g, pos, col, cg, cpos, ccol, Hc, last: null};
  });
  const upd = (pt, gq, sl) => {
    const key = gq.toFixed(4) + '_' + sl.toFixed(4); if (pt.last === key) return; pt.last = key;
    const {P, V, tri, pos, col} = pt, Y = V.map((v) => hgt(P, v[2], v[3], v[0], v[1], gq, sl));
    for (let i = 0; i < tri.length; i += 3) {
      const ids = [tri[i], tri[i + 1], tri[i + 2]], ym = (Y[ids[0]] + Y[ids[1]] + Y[ids[2]]) / 3, xm = (V[ids[0]][0] + V[ids[1]][0] + V[ids[2]][0]) / 3;
      colAt(P, xm, ym, cG);
      for (let k = 0; k < 3; k++) { const o = (i + k) * 3, v = V[ids[k]]; pos[o] = v[0]; pos[o + 1] = Y[ids[k]]; pos[o + 2] = v[1]; col[o] = cG.r; col[o + 1] = cG.g; col[o + 2] = cG.b; }
    }
    pt.g.attributes.position.needsUpdate = true; pt.g.attributes.color.needsUpdate = true; pt.g.computeVertexNormals(); pt.g.computeBoundingSphere();
    // срез
    const S = pt.Hc.map(([x, u, th]) => hgt(P, u, th, x, 0, gq, 0)); let o = 0;
    for (let i = 0; i < pt.Hc.length - 1; i++) {
      const xa = pt.Hc[i][0], xb = pt.Hc[i + 1][0];
      for (let k = 0; k < NL; k++) {
        const ta = Math.min(S[i], layTop(k, xa)), tb = Math.min(S[i + 1], layTop(k, xb)), ba = Math.min(ta, layTop(k + 1, xa)), bb = Math.min(tb, layTop(k + 1, xb));
        cTmp.set(P.lay[k]).multiplyScalar(0.97);
        for (const [x, y] of [[xa, ba], [xb, bb], [xb, tb], [xa, ba], [xb, tb], [xa, ta]]) { pt.cpos[o] = x; pt.cpos[o + 1] = y; pt.cpos[o + 2] = 0; pt.ccol[o] = cTmp.r; pt.ccol[o + 1] = cTmp.g; pt.ccol[o + 2] = cTmp.b; o += 3; }
      }
    }
    pt.cg.attributes.position.needsUpdate = true; pt.cg.attributes.color.needsUpdate = true; pt.cg.computeBoundingSphere();
  };

  // ── земля вокруг ряда: сзади до горизонта и по бокам, цвет плавно между регионами
  const gcol = (x) => { let a = PITS[0], b = PITS[0]; for (let i = 0; i < 4; i++) if (x >= PITS[i].cx) { a = PITS[i]; b = PITS[i + 1]; } if (x >= PITS[4].cx) a = b = PITS[4]; const t = a === b ? 0 : sm((x - a.cx - 22) / 16); return cTmp.set(a.gnd).lerp(cG.set(b.gnd), t).clone(); };
  { const P = [], C = [], rows = [[TZ, -110], [-110, -420]];
    const quad = (x0, x1, z0, z1) => { const c0 = gcol(x0), c1 = gcol(x1); for (const [x, z, c] of [[x0, z0, c0], [x1, z0, c1], [x1, z1, c1], [x0, z0, c0], [x1, z1, c1], [x0, z1, c0]]) { P.push(x, 0, z); C.push(c.r, c.g, c.b); } };
    for (let x = -420; x < 420; x += 6) { for (const [z0, z1] of rows) quad(x, x + 6, z0, z1); if (x < -150 || x >= 150) quad(x, x + 6, 0, TZ); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, VM); m.receiveShadow = true; scene.add(m); }
  // боковые срезы за краями ряда — те же пласты (на общем плане не видно пустоты)
  for (const [x0, x1, P] of [[-420, -150, PITS[0]], [150, 420, PITS[4]]]) {
    const pos = [], cc = []; for (let x = x0; x < x1; x += 3) for (let k = 0; k < NL; k++) { cTmp.set(P.lay[k]); const ta = Math.min(0, layTop(k, x)), tb = Math.min(0, layTop(k, x + 3)), ba = layTop(k + 1, x), bb = layTop(k + 1, x + 3); for (const [xx, y] of [[x, ba], [x + 3, bb], [x + 3, tb], [x, ba], [x + 3, tb], [x, ta]]) { pos.push(xx, y, 0); cc.push(cTmp.r, cTmp.g, cTmp.b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, CM));
  }
  // горы на горизонте под регион
  { const r = rnd(11); let n = 0;
    for (const P of PITS) for (let i = 0; i < 6; i++) {
      const big = P.key === 'l3' || P.key === 'l2' || P.key === 'l1', s = big ? 22 + r() * 16 : 12 + r() * 8, x = P.cx + (i - 2.5) * 13 + (r() - 0.5) * 8, z = -150 - r() * 90;
      const sy = big ? 0.55 + r() * 0.3 : 0.25 + r() * 0.15; add(blob(s, 30 + n, 0.28, 1.1, 1.3, sy, 1, 1), P.key === 'l4' ? 'leafDark' : 'hillM' + P.key, x, -1, z, {cast: false, recv: false, mat: {}});
      if (big && P.key !== 'l1' && s * sy > 15) add(blob(s * 0.34, 50 + n, 0.25, 1.2, 1.3, sy * 1.1, 1, 1), 'snow', x, s * sy * 0.78 - 1, z + 1.5, {cast: false, recv: false});
      n++;
    }
  }
  // мелочи по регионам: тайга и снег у Удачного, камни-валуны в пустыне, отвалы, посёлки у бровки
  { const r = rnd(5); const P4 = PITS[1];
    for (let i = 0, n = 0; i < 900 && n < 95; i++) { const x = P4.cx + (r() - 0.5) * 58, z = -2 - r() * 64; const u = Math.hypot(x - P4.cx, z) / rr(P4, Math.atan2(z, x - P4.cx) + 2 * Math.PI); if (u < 1.35) continue; fir(x, 0, z, 0.22 + r() * 0.12, true); n++; }
    for (const P of [PITS[0], PITS[2], PITS[3], PITS[4]]) for (let i = 0, n = 0; i < 300 && n < 14; i++) { const x = P.cx + (r() - 0.5) * 56, z = -3 - r() * 60; const u = Math.hypot(x - P.cx, z) / rr(P, Math.atan2(z, x - P.cx) + 2 * Math.PI); if (u < 1.3) continue; add(blob(0.25 + r() * 0.35, 70 + n, 0.3, 1.2, 1, 0.6, 1, 0), 'stone', x, 0.05, z, {cast: true}); n++; }
    // отвалы пустой породы (плоские террасные холмы) за карьерами
    for (const P of PITS) { const th = 1.5 * Math.PI + 0.35, rho = rr(P, th) * 1.75 + 4; const x = P.cx + Math.cos(th) * rho, z = Math.max(TZ + 8, Math.sin(th) * rho);
      for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(5.5 - k * 1.5, 6.3 - k * 1.5, 0.7, 9), 'dump' + P.key, x, 0.33 + k * 0.7, z, {cast: true}); }
    // посёлок / фабрика у бровки: корпуса, трубы с дымом
    for (const P of PITS) { const th = 1.5 * Math.PI - 0.55, rho = rr(P, th) * 1.32 + 2; const bx = P.cx + Math.cos(th) * rho, bz = Math.sin(th) * rho;
      box(2.6, 0.9, 1.4, P.snow ? 'concrete' : 'wall', bx, 0.47, bz, {r: 0.05}); box(2.7, 0.12, 1.5, 'roof', bx, 0.97, bz, {r: 0.03});
      box(1.4, 0.6, 1.1, 'concrete', bx + 2.4, 0.32, bz + 0.6, {r: 0.05}); cyl(0.16, 0.2, 2.2, 'brick', bx - 0.8, 1.1, bz - 0.4, {seg: 8});
      for (let i = 0; i < 4; i++) box(0.5, 0.35 + (i % 2) * 0.2, 0.5, i % 2 ? 'roof' : 'wall', bx - 2.4 + i * 0.75, 0.2 + (i % 2) * 0.1, bz + 1.8, {r: 0.04}); }
  }
  const smokes = PITS.map((P) => { const th = 1.5 * Math.PI - 0.55, rho = rr(P, th) * 1.32 + 2; return Kt.smoke(P.cx + Math.cos(th) * rho - 0.8, 2.3, Math.sin(th) * rho - 0.4, 6, 0.55); });
  // лёд в дне Удачного, вода в дне Бингема (над дном 5 см)
  const pond4 = add(new THREE.CircleGeometry(1.0, 16), 'iceP', 0, 0, 0, {cast: false, rot: [-Math.PI / 2, 0, 0]});
  const pond1 = add(new THREE.CircleGeometry(1.1, 16), 'pondB', 0, 0, 0, {cast: false, rot: [-Math.PI / 2, 0, 0], mat: {smooth: true}});
  // рулетки: жёлтая лента от бровки до дна, засечки через 100 м
  const tapeM = new THREE.MeshBasicMaterial({color: '#ffd23a'});
  const tapes = PITS.map((P) => { const g = new THREE.Group(); g.position.set(P.cx, 0, 0.35); scene.add(g);
    const pg = new THREE.PlaneGeometry(0.2, 1); pg.translate(0, -0.5, 0); const band = new THREE.Mesh(pg, tapeM); band.renderOrder = 8; g.add(band);
    const ticks = []; for (let i = 1; i <= Math.floor(P.d); i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(i % 5 ? 0.55 : 0.9, 0.09), tapeM); t.position.set(0, -i, 0.01); t.renderOrder = 8; g.add(t); ticks.push(t); }
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.14), tapeM); rim.renderOrder = 8; g.add(rim);
    const foot = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.14), tapeM); foot.renderOrder = 8; g.add(foot);
    return {g, band, ticks, rim, foot, P}; });
  // Бурдж-Халифа (828 м): ярусы-призмы, шпиль
  const burj = new THREE.Group(); scene.add(burj);
  { const H = 8.28; let y = 0; const tiers = [[0.62, 1.6], [0.52, 1.5], [0.44, 1.4], [0.36, 1.2], [0.28, 1.0], [0.2, 0.8]];
    tiers.forEach(([rad, h], i) => { add(new THREE.CylinderGeometry(rad * 0.92, rad, h, 6), i % 2 ? 'burjG' : 'burjS', 0, y + h / 2, 0, {parent: burj, rot: [0, i * 0.35, 0]}); y += h; });
    add(new THREE.CylinderGeometry(0.03, 0.12, H - y, 6), 'burjS', 0, y + (H - y) / 2, 0, {parent: burj}); }
  // камни оползня: катятся по сектору от бровки к дну и остаются внизу
  const rocks = []; { const r = rnd(9); for (let i = 0; i < 16; i++) rocks.push({m: add(blob(0.28 + r() * 0.3, 90 + i, 0.3, 1.3), 'dumpl1', 0, 0, 0, {cast: true}), a: SL0 + 0.04 + r() * (SL1 - SL0 - 0.08), d0: r() * 0.35, u1: 0.12 + r() * 0.2}); }
  const clouds = [cloud(sky, -110, 30, -170, 5, 51), cloud(sky, -30, 34, -190, 6, 52), cloud(sky, 50, 30, -160, 4.5, 53), cloud(sky, 130, 36, -200, 6.5, 54), cloud(sky, 190, 28, -150, 4, 55)];

  const animate = (q) => {
    const t = q.t ?? 0, sl = Math.max(0, Math.min(1, q.slide ?? 0));
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.4 + 0.1 * i); });
    pits.forEach((pt) => upd(pt, Math.max(0, Math.min(1, q[pt.P.key] ?? 0)), pt.P.key === 'l1' ? sl : 0));
    smokes.forEach((f) => f(t, 1));
    const g4 = sm(((q.l4 ?? 0) - 0.97) / 0.03); pond4.position.set(-60, -6.3 + 0.05, -0.6); pond4.scale.setScalar(Math.max(0.001, g4)); pond4.visible = g4 > 0.01;
    const g1 = sm(((q.l1 ?? 0) - 0.97) / 0.03) * (1 - sm(sl * 3)); pond1.position.set(122, -12 + 0.05, -1.2); pond1.scale.setScalar(Math.max(0.001, g1)); pond1.visible = g1 > 0.01;
    for (const T_ of tapes) { const m = Math.max(0, Math.min(1, q['m' + T_.P.key.slice(1)] ?? 0)), L = sm(m) * T_.P.d; T_.g.visible = m > 0.002;
      T_.band.scale.y = Math.max(0.001, L); T_.ticks.forEach((tk, i) => { tk.visible = i + 1 <= L + 1e-3; }); T_.foot.position.y = -L; T_.foot.visible = m > 0.98; }
    const b = q.burj ?? 0; burj.visible = b > 0.002; burj.position.set(120, lerp(9, -12 + 0.02, sm(b)), -2);
    for (const R_ of rocks) { const k = sm((sl - R_.d0) / 0.55), r0 = rr(PITS[4], R_.a), u = lerp(0.96, R_.u1, k);
      R_.m.visible = sl > R_.d0 + 0.002; R_.m.position.set(120 + Math.cos(R_.a) * u * r0, hgt(PITS[4], u, R_.a, 0, 0, 1, sl) + 0.25, Math.sin(R_.a) * u * r0); R_.m.rotation.set(k * 9, k * 4, 0); }
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
