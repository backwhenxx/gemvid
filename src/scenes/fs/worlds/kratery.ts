// @ts-nocheck
// Мир «Топ-5 самых больших ударных кратеров» (28.11, копия karery): пять кратеров в ряд, 1 ед. = 8 км по горизонтали,
// глубина преувеличена. Профиль сложного кратера: центральная горка, плоское дно, террасы стены, вал, выброс вокруг.
// q: a* — падение камня (0..1, удар в 1), k* — рост кратера, m* — жёлтая рулетка-диаметр,
// lake (Маникуаган: кольцевое озеро), dia (Попигай: алмазы в срезе), ore (Садбери: слой расплава + шахты),
// bur (Чиксулуб: засыпан известняком, сверху джунгли), er (Вредефорт: размыт до дуги холмов).
import * as THREE from 'three';
import {makeKit, rnd, sm, lerp, hash3, vnoise} from '../kit';

const DEEP = -20, TW = 40, TZ = -70;
export const PITS = [
  {key: 'k5', n: '5', cx: -160, r: 5.3, d: 1.4, e: 0.05, ph: 0.4, gnd: '#7f9a68', lay: ['#a08a6a', '#8c7a66', '#7a7468', '#6a6a70', '#5c5c66'], hill: '#5d7a5c'},   // Маникуаган
  {key: 'k4', n: '4', cx: -80, r: 6.25, d: 1.6, e: 0.06, ph: 1.1, gnd: '#b4ad84', lay: ['#a69a7c', '#958a74', '#80796f', '#6c6a6e', '#5a5a64'], hill: '#8a8a70'},  // Попигай
  {key: 'k3', n: '3', cx: 0, r: 8.1, d: 2.0, e: 0.14, ph: 2.0, gnd: '#8c9e6c', lay: ['#9a8a70', '#857866', '#757070', '#626470', '#555764'], hill: '#6c8062'},     // Садбери (вытянут)
  {key: 'k2', n: '2', cx: 80, r: 11.25, d: 2.6, e: 0.04, ph: 0.2, gnd: '#6f9a50', lay: ['#d8cba6', '#c4b48e', '#a89c84', '#857f7a', '#66666e'], hill: '#5f8a4c'},  // Чиксулуб
  {key: 'k1', n: '1', cx: 160, r: 18.75, d: 3.6, e: 0.05, ph: 1.6, gnd: '#c6ad76', lay: ['#b98e62', '#a07a58', '#8a7a6a', '#6f6c6e', '#5a5a62'], hill: '#a8946a'}, // Вредефорт
];
const LT = [0, -0.7, -1.6, -2.7, -4.0, -5.6, -8, -12, DEEP], NL = 8;
for (const P of PITS) P.lay.push('#7d7468', '#6c6a78', '#77685a');
const layTop = (k, x) => (k === 0 ? 1e9 : k >= NL ? DEEP : LT[k] + 0.14 * Math.sin(0.09 * x + k * 1.7) + 0.08 * Math.sin(0.23 * x + k));
const rr = (P, th) => P.r * (1 + P.e * Math.cos(2 * (th - P.ph)) + 0.03 * Math.sin(3 * th + P.ph));
// профиль полного кратера (u = 0 центр, 1 — вал)
function prof(P, u) {
  const d = P.d;
  if (u < 0.2) { const c = Math.cos(u / 0.2 * Math.PI / 2); return -d + 0.4 * d * c * c; }
  if (u < 0.5) return -d;
  if (u < 1) { const s = (u - 0.5) / 0.5 * 4, fl = Math.floor(s), fr = s - fl; return lerp(-d, 0.25 * d, (fl + sm((fr - 0.45) / 0.55)) / 4); }
  if (u < 1.6) { const t = 1 - (u - 1) / 0.6; return 0.25 * d * t * t; }
  return 0;
}
const AR0 = 1.08 * Math.PI, AR1 = 1.72 * Math.PI;
function hgt(P, u, th, x, z, g, s) {
  let y = prof(P, u) * sm(g);
  if (u > 1) y += 0.1 * (vnoise(x * 0.15, 3, z * 0.15) - 0.5) * sm((u - 1) / 0.2) * sm((TW - Math.abs(x - P.cx)) / 4) * sm((z - TZ) / 4);
  if (s.bur > 0) y = lerp(y, 0.02 * (vnoise(x * 0.3, 5, z * 0.3) - 0.5), sm(s.bur) * (1 - sm((u - 1.6) / 0.1)));
  if (s.er > 0) {
    const arc = sm((th - AR0) / 0.12) * sm((AR1 - th) / 0.12), ye = 0.5 * Math.exp(-(((u - 0.45) / 0.09) ** 2)) * arc + 0.06 * (vnoise(x * 0.2, 7, z * 0.2) - 0.5) * sm((u - 0.05) / 0.1);
    y = lerp(y, ye, sm(s.er));
  }
  return y;
}
const cTmp = new THREE.Color(), cG = new THREE.Color(), cGn = new THREE.Color();
function colAt(P, x, y, out) {
  let k = 0; while (k < NL - 1 && y < layTop(k + 1, x)) k++;
  out.set(P.lay[k]); const n = 0.93 + 0.14 * hash3(Math.round(x * 2), Math.round(y * 3), 7); out.multiplyScalar(n);
  return out.lerp(cGn.set(P.gnd), 1 - sm((-y - 0.03) / 0.35));
}
const LK = (P) => -P.d + 0.24;   // уровень озера Маникуагана

export const T = Object.fromEntries([
  ...PITS.map((P) => [P.key + 'c', [P.cx - P.r * 0.3, -P.d + 0.15, -P.r * 0.35]]),
  ...PITS.map((P) => [P.key + 'rim', [P.cx + P.r * 0.98, 0.25 * P.d + 0.1, 0.3]]),
  ['lake', [-160 - 5.3 * 0.35, LK(PITS[0]), -5.3 * 0.25]], ['dia', [-80 - 6.25 * 0.2, -1.6 - 0.7, 0.2]], ['ore', [8.1 * 0.2, -2.0 - 0.3, 0.2]],
  ['bur', [80 - 2, -1.3, 0.2]], ['jungle', [80 + 3, 0.2, -6]], ['arc', [160 + 18.75 * 0.45 * Math.cos(1.4 * Math.PI), 0.4, 18.75 * 0.45 * Math.sin(1.4 * Math.PI)]],
  ['stack', [8.1 * 1.9 * Math.cos(1.62 * Math.PI), 2.2, 8.1 * 1.9 * Math.sin(1.62 * Math.PI)]],
]);
const camP = (P, D, lx = 0) => { const ly = -P.d * 0.3, lz = -P.r * 0.4; return {pos: [P.cx + lx + 0.05 * D, ly + 0.5 * D, lz + 0.86 * D], look: [P.cx + lx, ly, lz], fov: 40}; };
export const CAMS = {
  hook: camP(PITS[4], 92), hook2: camP(PITS[4], 112, 2),
  k5: camP(PITS[0], 30), k4: camP(PITS[1], 34), k3: camP(PITS[2], 44), k2: camP(PITS[3], 58), k1: camP(PITS[4], 96),
  k5a: camP(PITS[0], 36, -1), k2a: camP(PITS[3], 50, 1),
  end: {pos: [196, 44, 74], look: [120, -2, -14], fov: 40},
  cover: {pos: [190, 38, 70], look: [150, -2, -10], fov: 40},
};

export function build(scene, sky) {
  scene.fog.near = 150; scene.fog.far = 480;
  scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) { const c = o.shadow.camera; c.left = -230; c.right = 230; c.top = 230; c.bottom = -230; c.near = -260; c.far = 360; c.updateProjectionMatrix(); o.shadow.mapSize.set(4096, 4096); o.shadow.normalBias = 0.12; } });
  const pal = {smoke: '#cfc6b8', rockA: '#4f4640', trailA: '#e8b478', water: '#4f86a6', diaW: '#eef9ff', diaB: '#8fc6e6', tower: '#6b5a4a', leafJ: '#4f7f3a'};
  for (const P of PITS) { pal['hillM' + P.key] = P.hill; pal['ej' + P.key] = P.lay[2]; }
  const Kt = makeKit(scene, pal);
  const {add, box, cyl, blob, cloud, fir, tree} = Kt;
  const VM = new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1});
  const CM = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1});

  // ── кратеры: полярная сетка, внешнее кольцо до краёв плитки
  const US = []; for (let u = 0; u < 1 - 1e-9; u += 0.0055) US.push(u); for (let u = 1; u < 1.7 + 1e-9; u += 0.025) US.push(u);
  const pits = PITS.map((P) => {
    const ths = []; for (let i = 0; i <= 128; i++) ths.push(Math.PI + Math.PI * i / 128);
    const ca = Math.atan2(TZ, -TW) + 2 * Math.PI, cb = Math.atan2(TZ, TW) + 2 * Math.PI; ths.push(ca, cb); ths.sort((a, b) => a - b);
    const R = (th) => { const c = Math.cos(th), s = Math.sin(th); let m = 1e9; if (c < -1e-9) m = Math.min(m, TW / -c); if (c > 1e-9) m = Math.min(m, TW / c); if (s < -1e-9) m = Math.min(m, -TZ / -s); return m; };
    const NO = 7, nr = US.length + NO, V = [];
    for (const th of ths) {
      const r0 = rr(P, th), c = Math.cos(th), s = Math.sin(th);
      for (const u of US) V.push([P.cx + c * u * r0, s * u * r0, u, th]);
      const a = 1.75 * r0, b = R(th); for (let j = 1; j <= NO; j++) { const rho = lerp(a, b, j / NO); V.push([P.cx + c * rho, Math.min(0, s * rho), rho / r0, th]); }
    }
    for (const v of V) if (Math.abs(v[1]) < 1e-6) v[1] = 0;
    const tri = []; for (let i = 0; i < ths.length - 1; i++) for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, b = a + 1, c2 = a + nr, d = c2 + 1; tri.push(a, c2, b, b, c2, d); }
    const pos = new Float32Array(tri.length * 3), col = new Float32Array(tri.length * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, VM); m.receiveShadow = true; m.castShadow = true; scene.add(m);
    const XS = []; { const left = V.slice(0, nr).map((v) => v[0]), right = V.slice((ths.length - 1) * nr).map((v) => v[0]); XS.push(...left.reverse(), ...right.slice(1)); }
    const cpos = new Float32Array((XS.length - 1) * (NL + 2) * 18), ccol = new Float32Array(cpos.length);
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cg.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
    const nrm = new Float32Array(cpos.length); for (let i = 0; i < nrm.length; i += 3) nrm[i + 2] = 1; cg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    const cm = new THREE.Mesh(cg, CM); scene.add(cm);
    const Hc = XS.map((x) => { const th = x < P.cx ? Math.PI : 2 * Math.PI; return [x, Math.abs(x - P.cx) / rr(P, th), th]; });
    return {P, V, tri, g, pos, col, cg, cpos, ccol, Hc, last: null};
  });
  const cFill = new THREE.Color('#e3d6b2'), cOre = new THREE.Color('#3f3b44'), cWat = new THREE.Color(pal.water);
  const upd = (pt, gq, s) => {
    const key = [gq, s.bur, s.er, s.ore, s.lk].map((v) => v.toFixed(4)).join('_'); if (pt.last === key) return; pt.last = key;
    const {P, V, tri, pos, col} = pt, Y = V.map((v) => hgt(P, v[2], v[3], v[0], v[1], gq, s));
    for (let i = 0; i < tri.length; i += 3) {
      const ids = [tri[i], tri[i + 1], tri[i + 2]], ym = (Y[ids[0]] + Y[ids[1]] + Y[ids[2]]) / 3, xm = (V[ids[0]][0] + V[ids[1]][0] + V[ids[2]][0]) / 3;
      colAt(P, xm, ym, cG);
      for (let k = 0; k < 3; k++) { const o = (i + k) * 3, v = V[ids[k]]; pos[o] = v[0]; pos[o + 1] = Y[ids[k]]; pos[o + 2] = v[1]; col[o] = cG.r; col[o + 1] = cG.g; col[o + 2] = cG.b; }
    }
    pt.g.attributes.position.needsUpdate = true; pt.g.attributes.color.needsUpdate = true; pt.g.computeVertexNormals(); pt.g.computeBoundingSphere();
    // срез: пласты до min(исходный, текущий), засыпка известняком, слой расплава, вода озера
    const s0 = {bur: 0, er: s.er}, S0 = pt.Hc.map(([x, u, th]) => hgt(P, u, th, x, 0, gq, s0)), S = pt.Hc.map(([x, u, th]) => hgt(P, u, th, x, 0, gq, s));
    let o = 0; const q6 = (xa, xb, ba, bb, ta, tb, c) => { for (const [x, y] of [[xa, ba], [xb, bb], [xb, tb], [xa, ba], [xb, tb], [xa, ta]]) { pt.cpos[o] = x; pt.cpos[o + 1] = y; pt.cpos[o + 2] = 0; pt.ccol[o] = c.r; pt.ccol[o + 1] = c.g; pt.ccol[o + 2] = c.b; o += 3; } };
    const lv = lerp(-P.d - 0.3, LK(P), sm(s.lk));
    for (let i = 0; i < pt.Hc.length - 1; i++) {
      const xa = pt.Hc[i][0], xb = pt.Hc[i + 1][0], sa = Math.min(S0[i], S[i]), sb = Math.min(S0[i + 1], S[i + 1]);
      for (let k = 0; k < NL; k++) {
        const ta = Math.min(sa, layTop(k, xa)), tb = Math.min(sb, layTop(k, xb)), ba = Math.min(ta, layTop(k + 1, xa)), bb = Math.min(tb, layTop(k + 1, xb));
        q6(xa, xb, ba, bb, ta, tb, cTmp.set(P.lay[k]).multiplyScalar(0.97));
      }
      // доп. слой: засыпка (Чиксулуб) / расплав (Садбери) / вода (Маникуаган) — иначе пустой треугольник
      if (s.bur > 0) q6(xa, xb, sa, sb, Math.max(sa, S[i]), Math.max(sb, S[i + 1]), cFill);
      else if (s.ore > 0 && pt.Hc[i][1] < 0.85 && pt.Hc[i + 1][1] < 0.85) { const h = 0.55 * sm(s.ore); q6(xa, xb, sa - h, sb - h, sa - 0.02, sb - 0.02, cOre); }
      else if (s.lk > 0 && sa < lv && sb < lv) q6(xa, xb, sa, sb, lv, lv, cWat);
      else q6(xa, xb, sa, sb, sa, sb, cFill);
    }
    pt.cg.attributes.position.needsUpdate = true; pt.cg.attributes.color.needsUpdate = true; pt.cg.computeBoundingSphere();
  };

  // ── земля вокруг ряда, цвет плавно между регионами
  const gcol = (x) => { let a = PITS[0], b = PITS[0]; for (let i = 0; i < 4; i++) if (x >= PITS[i].cx) { a = PITS[i]; b = PITS[i + 1]; } if (x >= PITS[4].cx) a = b = PITS[4]; const t = a === b ? 0 : sm((x - a.cx - 28) / 24); return cTmp.set(a.gnd).lerp(cG.set(b.gnd), t).clone(); };
  { const P = [], C = [], rows = [[TZ, -110], [-110, -460]];
    const quad = (x0, x1, z0, z1) => { const c0 = gcol(x0), c1 = gcol(x1); for (const [x, z, c] of [[x0, z0, c0], [x1, z0, c1], [x1, z1, c1], [x0, z0, c0], [x1, z1, c1], [x0, z1, c0]]) { P.push(x, 0, z); C.push(c.r, c.g, c.b); } };
    for (let x = -460; x < 460; x += 6) { for (const [z0, z1] of rows) quad(x, x + 6, z0, z1); if (x < -200 || x >= 200) quad(x, x + 6, 0, TZ); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, VM); m.receiveShadow = true; scene.add(m); }
  for (const [x0, x1, P] of [[-460, -200, PITS[0]], [200, 460, PITS[4]]]) {
    const pos = [], cc = []; for (let x = x0; x < x1; x += 3) for (let k = 0; k < NL; k++) { cTmp.set(P.lay[k]); const ta = Math.min(0, layTop(k, x)), tb = Math.min(0, layTop(k, x + 3)), ba = layTop(k + 1, x), bb = layTop(k + 1, x + 3); for (const [xx, y] of [[x, ba], [x + 3, bb], [x + 3, tb], [x, ba], [x + 3, tb], [x, ta]]) { pos.push(xx, y, 0); cc.push(cTmp.r, cTmp.g, cTmp.b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, CM));
  }
  // пологие холмы на горизонте (без снежных шапок — регионы равнинные)
  { const r = rnd(11); let n = 0;
    for (const P of PITS) for (let i = 0; i < 7; i++) { const s = 16 + r() * 14, x = P.cx + (i - 3) * 13 + (r() - 0.5) * 8, z = -170 - r() * 100;
      add(blob(s, 30 + n, 0.28, 1.1, 1.4, 0.22 + r() * 0.12, 1, 1), 'hillM' + P.key, x, -1, z, {cast: false, recv: false, mat: {}}); n++; } }
  // растительность по регионам (только вне кратера и выброса)
  const outside = (P, x, z, k = 1.85) => Math.hypot(x - P.cx, z) / rr(P, Math.atan2(z, x - P.cx) + 2 * Math.PI) > k;
  const jungle = [];
  { const r = rnd(5);
    for (const [pi, cnt, kind] of [[0, 120, 'fir'], [1, 40, 'firs'], [2, 70, 'mix'], [3, 90, 'tree'], [4, 22, 'acacia']]) {
      const P = PITS[pi];
      for (let i = 0, n = 0; i < 3000 && n < cnt; i++) {
        const x = P.cx + (r() - 0.5) * 78, z = -2 - r() * 66; if (!outside(P, x, z)) continue;
        if (kind === 'fir' || kind === 'firs' || (kind === 'mix' && r() < 0.6)) fir(x, 0, z, (kind === 'firs' ? 0.2 : 0.28) + r() * 0.12, false);
        else if (kind === 'acacia') tree(x, 0, z, 0.9 + r() * 0.3, 0.75, 200 + n);
        else tree(x, 0, z, 0.8 + r() * 0.4, 0.45 + r() * 0.15, 100 + n);
        n++;
      }
    }
    // джунгли на засыпанном Чиксулубе — растут вместе с засыпкой
    const P = PITS[3];
    for (let i = 0, n = 0; i < 3000 && n < 60; i++) { const x = P.cx + (r() - 0.5) * 2 * P.r * 1.7, z = -0.6 - r() * P.r * 1.7; const u = Math.hypot(x - P.cx, z) / P.r; if (u > 1.65 || u < 0.05) continue;
      const t = tree(x, 0, z, 0.8 + r() * 0.4, 0.45 + r() * 0.15, 300 + n); jungle.push(t.g ?? t); n++; }
    // озёра у Садбери (над землёй на 0,05)
    for (let i = 0, n = 0; i < 400 && n < 7; i++) { const P3 = PITS[2], x = P3.cx + (r() - 0.5) * 74, z = -6 - r() * 58; if (!outside(P3, x, z, 2.05)) continue;
      add(new THREE.CircleGeometry(1.2 + r() * 1.6, 12), 'water', x, 0.05, z, {cast: false, rot: [-Math.PI / 2, 0, r() * 3], mat: {smooth: true}}); n++; }
  }
  // Садбери: шахтные копры у вала и труба-«суперстек» с дымом
  const sud = new THREE.Group(); scene.add(sud);
  { const P = PITS[2];
    for (const th of [1.3 * Math.PI, 1.8 * Math.PI]) { const rho = rr(P, th) * 1.25, x = P.cx + Math.cos(th) * rho, z = Math.sin(th) * rho, y0 = prof(P, 1.25) + 0.02;
      box(0.7, 0.5, 0.6, 'concrete', x + 0.6, y0 + 0.25, z, {parent: sud, r: 0.04}); box(0.12, 1.5, 0.12, 'tower', x - 0.2, y0 + 0.75, z - 0.2, {parent: sud});
      box(0.12, 1.5, 0.12, 'tower', x + 0.2, y0 + 0.75, z - 0.2, {parent: sud}); box(0.12, 1.5, 0.12, 'tower', x, y0 + 0.75, z + 0.2, {parent: sud});
      cyl(0.22, 0.22, 0.06, 'tower', x, y0 + 1.55, z, {parent: sud, seg: 12, rot: [Math.PI / 2, 0, 0]}); }
    const [sx, , sz] = T.stack; cyl(0.14, 0.22, 3.2, 'concrete', sx, 1.6, sz, {parent: sud, seg: 10}); box(1.6, 0.6, 1.0, 'wall', sx + 1.1, 0.32, sz + 0.3, {parent: sud, r: 0.04}); box(1.7, 0.1, 1.1, 'roof', sx + 1.1, 0.67, sz + 0.3, {parent: sud, r: 0.03}); }
  const sudSmoke = Kt.smoke(T.stack[0], 3.25, T.stack[2], 6, 0.5);
  // алмазы Попигая: ромбики в срезе под дном
  const dias = []; { const P = PITS[1], r = rnd(17), gW = new THREE.CircleGeometry(0.16, 4), gB = new THREE.CircleGeometry(0.08, 4);
    const mW = new THREE.MeshBasicMaterial({color: pal.diaW}), mB = new THREE.MeshBasicMaterial({color: pal.diaB});
    for (let i = 0; i < 34; i++) { const u = (r() * 2 - 1) * 0.85, x = P.cx + u * P.r, y = prof(P, Math.abs(u)) - 0.25 - r() * 1.3;
      const g = new THREE.Group(); g.position.set(x, y, 0.12); const a = new THREE.Mesh(gW, mW), b = new THREE.Mesh(gB, mB); b.position.z = 0.02; a.renderOrder = 7; b.renderOrder = 8; g.add(a, b); g.scale.set(0.7, 1, 1); scene.add(g); dias.push({g, ph: r() * 6.28, d0: r() * 0.5}); } }
  // озеро Маникуагана: кольцо вокруг центральной горки (только за срезом)
  const lake = (() => { const P = PITS[0], NA = 64, U0 = 0.1, U1 = 0.66, pos = [];
    for (let i = 0; i < NA; i++) { const a0 = Math.PI + Math.PI * i / NA, a1 = Math.PI + Math.PI * (i + 1) / NA; const p = (a, u) => [P.cx + Math.cos(a) * u * rr(P, a), 0, Math.min(-0.01, Math.sin(a) * u * rr(P, a))];
      pos.push(...p(a0, U0), ...p(a0, U1), ...p(a1, U1), ...p(a0, U0), ...p(a1, U1), ...p(a1, U0)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color: pal.water, roughness: 0.35, side: THREE.DoubleSide})); m.receiveShadow = true; scene.add(m); return m; })();
  // камни-болиды со шлейфом пыли
  const bolides = PITS.map((P, i) => { const g = new THREE.Group(); scene.add(g); const s = 0.35 + P.r * 0.035;
    add(blob(s, 400 + i, 0.3, 1.3), 'rockA', 0, 0, 0, {parent: g, cast: true});
    const trail = []; for (let j = 1; j <= 7; j++) trail.push(add(blob(s * (1 - j * 0.09), 410 + j, 0.2, 1.4), j < 2 ? 'trailA' : 'smoke', 0, 0, 0, {parent: g, cast: false, recv: false}));
    const dir = new THREE.Vector3(0.55, 0.78, -0.3).normalize(); trail.forEach((m, j) => m.position.copy(dir).multiplyScalar(s * 1.5 * (j + 1)));
    return {g, dir, L: 34 + P.r * 2.2, P}; });
  // выброс: камни разлетаются дугами от центра и остаются на выбросе
  const ejecta = PITS.map((P, pi) => { const r = rnd(30 + pi), L = []; for (let i = 0; i < 14; i++) { const a = Math.PI + 0.08 + r() * (Math.PI - 0.16), u = 1.08 + r() * 0.45;
    L.push({m: add(blob(0.12 + P.r * 0.012 + r() * 0.1, 500 + pi * 20 + i, 0.3, 1.3), 'ej' + P.key, 0, 0, 0, {cast: true}), a, u, h: P.r * (0.5 + r() * 0.4), d0: r() * 0.25}); } return L; });
  // рулетки-диаметр: жёлтая лента по валу в плоскости среза
  const tapeM = new THREE.MeshBasicMaterial({color: '#ffd23a'});
  const tapes = PITS.map((P) => { const g = new THREE.Group(); g.position.set(P.cx, 0.25 * P.d + 0.35, 0.4); scene.add(g);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), tapeM); band.renderOrder = 8; g.add(band);
    const ends = [-1, 1].map(() => { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.9), tapeM); e.renderOrder = 8; g.add(e); return e; });
    const ticks = []; for (let k = 6.25; k < 2 * P.r - 0.5; k += 6.25) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.45), tapeM); t.position.set(-P.r + k, 0, 0.01); t.renderOrder = 8; g.add(t); ticks.push(t); }
    return {g, band, ends, ticks, P}; });
  const clouds = [cloud(sky, -150, 34, -190, 5, 51), cloud(sky, -60, 38, -210, 6, 52), cloud(sky, 30, 34, -180, 4.5, 53), cloud(sky, 120, 40, -220, 6.5, 54), cloud(sky, 210, 32, -170, 4, 55)];

  const c01 = (v) => Math.max(0, Math.min(1, v ?? 0));
  const animate = (q) => {
    const t = q.t ?? 0, bur = c01(q.bur), er = c01(q.er), ore = c01(q.ore), lk = c01(q.lake), dia = c01(q.dia);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.4 + 0.1 * i); });
    pits.forEach((pt) => { const k = pt.P.key; upd(pt, c01(q[k]), {bur: k === 'k2' ? bur : 0, er: k === 'k1' ? er : 0, ore: k === 'k3' ? ore : 0, lk: k === 'k5' ? lk : 0}); });
    for (const B of bolides) { const a = c01(q['a' + B.P.n]); B.g.visible = a > 0.001 && a < 0.999; const L = (1 - a) * B.L; B.g.position.set(B.P.cx + B.dir.x * L, 0.3 + B.dir.y * L, -1 + B.dir.z * L); B.g.rotation.set(a * 6, a * 3, 0); }
    PITS.forEach((P, pi) => { const g = c01(q[P.key]), fade = P.key === 'k1' ? 1 - sm(er) : P.key === 'k2' ? 1 - sm(bur) : 1;
      for (const E of ejecta[pi]) { const e = sm((g - E.d0) / 0.75), r0 = rr(P, E.a), x = P.cx + Math.cos(E.a) * E.u * r0 * e, z = Math.sin(E.a) * E.u * r0 * e;
        E.m.visible = g > E.d0 + 0.002 && fade > 0.01; E.m.scale.setScalar(Math.max(0.001, fade));
        E.m.position.set(x, lerp(-P.d * 0.6, hgt(P, E.u, E.a, x, z, 1, {bur: 0, er: 0}) + 0.1, e) + 4 * e * (1 - e) * E.h, z); E.m.rotation.set(e * 8, e * 5, 0); } });
    const lv = lerp(-PITS[0].d - 0.3, LK(PITS[0]), sm(lk)); lake.visible = lk > 0.001; lake.position.y = lv;
    sud.visible = c01(q.k3) > 0.999; sud.scale.set(1, Math.max(0.001, sm(ore)), 1); sudSmoke(t, sud.visible ? sm(ore) : 0);
    for (const D of dias) { const v = sm((dia - D.d0) / 0.5); D.g.visible = v > 0.01; D.g.scale.set(0.7 * v * (1 + 0.12 * Math.sin(t * 2 + D.ph)), v * (1 + 0.12 * Math.sin(t * 2 + D.ph)), 1); }
    jungle.forEach((g, i) => { const v = sm((bur - 0.6 - (i % 5) * 0.05) / 0.2); g.visible = v > 0.01; g.scale.setScalar(Math.max(0.001, v)); });
    for (const T_ of tapes) { const m = c01(q['m' + T_.P.n]), L = sm(m) * T_.P.r; T_.g.visible = m > 0.002;
      T_.band.scale.x = Math.max(0.001, 2 * L); T_.ends[0].position.x = -L; T_.ends[1].position.x = L; T_.ends.forEach((e) => (e.visible = m > 0.98));
      T_.ticks.forEach((tk) => { tk.visible = Math.abs(tk.position.x) <= L + 1e-3; }); }
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
