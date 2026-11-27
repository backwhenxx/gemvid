// @ts-nocheck
// Мир «Топ-5 самых больших айсбергов» (28.11): Южный океан в разрезе (из zheloba).
// 1 ед. = 4 км по горизонтали, толщина условная (над водой ~1/8). Айсберги длинной осью вдаль (по −z), чтобы влезать в вертикальный кадр.
// Каждое место: айсберг подплывает (q[key] 0..1), жёлтая рулетка по длине (q[key+'R']).
// b9hit — обломок бьёт ледник, кусок откалывается; a68s — раскол на 3 части; a38L — 4 «Лондона» на льду; man — Манхэттен на B-15; keel — подводная часть.
import * as THREE from 'three';
import {makeKit, cutFace, rnd, sm, lerp, vnoise} from '../kit';

const FLOOR = -9, TOP = 0.5, KEEL = -3.6;
export const BERGS = [
  {key: 'b9', x: -64, W: 9, L: 38.5, cuts: []},
  {key: 'c19', x: -32, W: 8, L: 50, cuts: []},
  {key: 'a68', x: 0, W: 12.5, L: 44, cuts: [0.34, 0.68]},
  {key: 'a38', x: 32, W: 12.4, L: 36, cuts: []},
  {key: 'b15', x: 64, W: 9.2, L: 74, cuts: []},
];
const B = Object.fromEntries(BERGS.map((b) => [b.key, b]));
export function S(x, z) { return FLOOR + 0.5 * Math.sin(x * 0.11 + z * 0.07) + 0.6 * vnoise(x * 0.08, 2, z * 0.08); }
const OFF = [0, 0.8, 3, 40];
const LAYERS = ['sed', 'basalt', 'gabbro'];
const bound = (k, x) => S(x, 0) - OFF[k];

const camOf = (b, k = 1) => ({pos: [b.x + b.W * 0.95 * k, 8.5 * k + 1.5, 15 * k + 3], look: [b.x, -0.6, -b.L * 0.32], fov: 40});
export const CAMS = {
  hook: {pos: [74, 5.5, 9], look: [64, 0.2, -6], fov: 40},
  hook2: {pos: [71, 9, 16], look: [64, -0.4, -16], fov: 40},
  ...Object.fromEntries(BERGS.flatMap((b) => [[b.key, camOf(b)], [b.key + 'A', camOf(b, 1.35)]])),
  b9hit: {pos: [-52, 9, 17], look: [-58, -0.6, -12], fov: 40},
  b15far: {pos: [76, 15, 26], look: [64, -1, -26], fov: 40},
  keel: {pos: [71, 3, 20], look: [64, -2.2, -3], fov: 40},
  end: {pos: [36, 34, 62], look: [16, -2, -28], fov: 40},
  cover: {pos: [73, 6.5, 11], look: [64, -0.3, -8], fov: 40},
};
export const T = {
  ...Object.fromEntries(BERGS.flatMap((b) => [[b.key, [b.x, TOP + 0.2, -b.L * 0.25]], [b.key + 'R', [b.x - b.W / 2 - 1.0, TOP + 0.3, -b.L * 0.6]], [b.key + 'K', [b.x, -2.4, -0.6]]])),
  kus: [-46.5, TOP + 0.2, -5], man: [64.4, TOP + 0.5, -4.5], keel: [64, -2.6, -0.5], lon: [32, TOP + 0.2, -14],
};

export function build(scene, sky) {
  const Kt = makeKit(scene, {sed: '#8a8676', basalt: '#4f5260', gabbro: '#655d68', seabed: '#6f6e62', ice: '#bfe0f2', snow: '#f6f9fc', mtn: '#7d8aa0', island: '#7f9a6a', bldg: '#c9c2b6', bldgD: '#8d8f99'});
  const {add, box, blob, cloud, M} = Kt;
  const X0 = -112, X1 = 112;
  cutFace(Kt, LAYERS, bound, X0, X1, [], 0, 0.5);
  // дно
  { const xs = [], zs = []; for (let x = X0; x <= X1 + 1e-6; x += 1) xs.push(x); for (let z = 0; z >= -160 - 1e-6; z -= z > -12 ? 0.5 : 2) zs.push(z);
    const P = [], I = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) P.push(xs[i], S(xs[i], zs[j]), zs[j]);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); const ng = g.toNonIndexed(); ng.computeVertexNormals(); add(ng, 'seabed', 0, 0, 0, {cast: false}); }
  // вода: срез с градиентом + гладь
  const cutMat = new THREE.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false});
  { const ct = new THREE.Color('#8fd2ea'), cb = new THREE.Color('#163e6e'), c = new THREE.Color(), P = [], C = [];
    const col = (y) => c.copy(cb).lerp(ct, Math.max(0, Math.min(1, 1 + y / 10)) ** 1.3);
    for (let x = X0; x < X1 - 1e-6; x += 0.5) { const x2 = x + 0.5, b1 = S(x, 0), b2 = S(x2, 0); for (const [xx, yy] of [[x, b1], [x2, b2], [x2, 0], [x, b1], [x2, 0], [x, 0]]) { P.push(xx, yy, 0); col(yy); C.push(c.r, c.g, c.b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const m = new THREE.Mesh(g, cutMat); m.renderOrder = 6; scene.add(m);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(340, 320), M('water', {water: 1, opacity: 0.9, smooth: true})); top.geometry.rotateX(-Math.PI / 2); top.position.set(0, 0, -160.05); top.renderOrder = 5; scene.add(top); }

  // ── айсберг: многоугольник с рваным краем, выдавлен от KEEL до TOP; верх — снег, бока — лёд
  const iceMats = [M('snow'), M('ice')];
  const edge = (a, b, n, amp, seed) => { const r = rnd(seed), out = []; for (let i = 1; i < n; i++) { const t = i / n; out.push([lerp(a[0], b[0], t) + (r() - 0.5) * amp, lerp(a[1], b[1], t) + (r() - 0.5) * amp]); } return out; };
  const pieceGeo = (poly) => {
    let cx = 0, cs = 0; poly.forEach(([x, s]) => { cx += x; cs += s; }); cx /= poly.length; cs /= poly.length;
    const sh = new THREE.Shape(); poly.forEach(([x, s], i) => (i ? sh.lineTo(x - cx, s - cs) : sh.moveTo(x - cx, s - cs))); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {depth: TOP - KEEL, bevelEnabled: false}); g.rotateX(-Math.PI / 2); g.translate(0, KEEL, 0);
    return {g, cx, cz: -cs};
  };
  const bergs = {};
  for (const b of BERGS) {
    const seed = b.x * 7 + 300, hw = b.W / 2, n = Math.round(b.L / 2.2);
    const left = [[-hw, 0], ...edge([-hw, 0], [-hw, b.L], n, 0.9, seed), [-hw, b.L]];
    const right = [[hw, 0], ...edge([hw, 0], [hw, b.L], n, 0.9, seed + 1), [hw, b.L]];
    const sAt = (side, s) => { let best = side[0]; for (const p of side) if (Math.abs(p[1] - s) < Math.abs(best[1] - s)) best = p; return best; };
    // границы частей: перед, разломы, зад
    const lines = [[[-hw, 0], ...edge([-hw, 0], [hw, 0], 5, 0.7, seed + 2), [hw, 0]]];
    for (const [i, f] of b.cuts.entries()) { const s = f * b.L, l = sAt(left, s), r = sAt(right, s); lines.push([l, ...edge(l, r, 7, 1.6, seed + 10 + i), r]); }
    lines.push([[-hw, b.L], ...edge([-hw, b.L], [hw, b.L], 5, 0.9, seed + 3), [hw, b.L]]);
    const grp = new THREE.Group(); grp.position.set(b.x, 0, 0); scene.add(grp);
    const pieces = [];
    for (let k = 0; k < lines.length - 1; k++) {
      const a = lines[k], c = lines[k + 1], s0 = a[0][1], s1 = c[0][1];
      const L = left.filter((p) => p[1] > s0 + 0.01 && p[1] < s1 - 0.01), R = right.filter((p) => p[1] > s0 + 0.01 && p[1] < s1 - 0.01);
      const poly = [...a, ...R, ...[...c].reverse(), ...[...L].reverse()];
      const {g, cx, cz} = pieceGeo(poly);
      const pg = new THREE.Group(); pg.position.set(cx, 0, cz); grp.add(pg);
      const m = new THREE.Mesh(g, iceMats); m.castShadow = true; m.receiveShadow = false; pg.add(m);
      pieces.push({pg, x0: cx, z0: cz});
    }
    // рулетка по длине
    const rg = new THREE.Group(); rg.position.set(b.x - hw - 1.0, TOP + 0.25, 0); scene.add(rg);
    const ym = new THREE.MeshBasicMaterial({color: '#ffd23a'});
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 1).translate(0, 0, -0.5), ym); rg.add(bar);
    const t0 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.22), ym); rg.add(t0);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.22), ym); rg.add(t1);
    bergs[b.key] = {b, grp, pieces, rg, bar, t1};
  }
  // ледник Мерц для B-9: язык + кусок, который отламывается
  const tongue = new THREE.Group(); scene.add(tongue);
  const kus = new THREE.Group(); scene.add(kus);
  { const mk = (poly, parent, x, z) => { const {g, cx, cz} = pieceGeo(poly); const m = new THREE.Mesh(g, iceMats); m.castShadow = m.receiveShadow = true; m.position.set(x + cx, 0, z + cz); parent.add(m); return [cx, cz]; };
    const crack = [[-3.5, 9], ...edge([-3.5, 9], [3.5, 9], 6, 1.4, 91), [3.5, 9]];
    mk([[-3.5, 0], ...edge([-3.5, 0], [3.5, 0], 4, 0.6, 92), [3.5, 0], [3.8, 4.5], ...[...crack].reverse(), [-3.2, 4.4]], kus, 0, 0);
    mk([...crack, [3.6, 20], [3.3, 34], [4.0, 60], [-4.0, 60], [-3.4, 40], [-3.8, 22]], tongue, -53.5, -4);
    kus.userData.base = [-53.5, -4]; }
  // Манхэттен на B-15 (1:1 по площади, высоты домов условные)
  const man = new THREE.Group(); man.position.set(64.4, TOP + 0.06, -4.5); man.rotation.y = 0.5; scene.add(man);
  { const isl = new THREE.Shape(); const pts = [[-0.32, -2.7], [0.18, -2.75], [0.5, -1.2], [0.55, 0.8], [0.4, 2.7], [0.0, 2.75], [-0.42, 0.9], [-0.5, -1.3]];
    pts.forEach(([x, z], i) => (i ? isl.lineTo(x, z) : isl.moveTo(x, z))); isl.closePath();
    const g = new THREE.ExtrudeGeometry(isl, {depth: 0.12, bevelEnabled: false}); g.rotateX(Math.PI / 2); g.translate(0, 0.12, 0);
    add(g, 'island', 0, 0, 0, {parent: man});
    add(new THREE.BoxGeometry(0.22, 0.03, 0.9), 'leafDark', 0.02, 0.135, 0.6, {parent: man, cast: false}); // Центральный парк
    const r = rnd(77);
    for (let i = 0; i < 70; i++) { const z = lerp(-2.6, 2.6, r()), w = 0.38 - 0.1 * Math.abs(z) / 2.6, x = (r() - 0.5) * w; if (Math.abs(z - 0.6) < 0.5 && Math.abs(x) < 0.14) continue;
      const down = Math.exp(-((z + 2.3) ** 2) / 0.15), mid = Math.exp(-((z + 0.1) ** 2) / 0.3), h = 0.12 + 0.55 * Math.max(down, mid) * (0.5 + r()) + 0.1 * r();
      add(new THREE.BoxGeometry(0.08 + r() * 0.05, h, 0.08 + r() * 0.05), r() < 0.5 ? 'bldg' : 'bldgD', x, 0.12 + h / 2, z, {parent: man}); } }
  // «4 Лондона» на A-38: рамки по 1572 км²
  const lonM = new THREE.MeshBasicMaterial({color: '#ffd23a', transparent: true, opacity: 0, depthWrite: false});
  const lon = [];
  for (let i = 0; i < 4; i++) { const g = new THREE.Group(); g.position.set(32, TOP + 0.3, -0.2 - 9 * i - 4.5); scene.add(g); const w = 10.6, d = 8.4, t = 0.22;
    for (const [bw, bd, x, z] of [[w, t, 0, d / 2], [w, t, 0, -d / 2], [t, d, w / 2, 0], [t, d, -w / 2, 0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.05, bd), lonM); m.position.set(x, 0, z); m.renderOrder = 8; g.add(m); }
    lon.push(g); }
  // ватерлиния у B-15 (для «9/10 под водой»)
  const wlM = new THREE.MeshBasicMaterial({color: '#ffd23a', transparent: true, opacity: 0, depthWrite: false});
  const wl = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.12, 0.05), wlM); wl.position.set(64, 0.02, 0.15); wl.renderOrder = 9; scene.add(wl);
  // шельф Антарктиды и горы на горизонте
  box(420, 4.2, 30, 'snow', 0, 1.2, -200, {cast: false, r: 0.2});
  { const r = rnd(5); for (let i = 0; i < 26; i++) { const x = lerp(-200, 200, i / 25) + (r() - 0.5) * 10, h = 10 + r() * 16, rr = 9 + r() * 8, z = -232 - r() * 30;
    add(new THREE.ConeGeometry(rr, h, 6), 'mtn', x, h / 2 + 2, z, {cast: false, rot: [0, r() * 3, 0]}); add(new THREE.ConeGeometry(rr * 0.45, h * 0.45, 6), 'snow', x, h * 0.775 + 2.05, z, {cast: false, rot: [0, r() * 3, 0]}); } }
  // мелкие льдины вокруг
  const floes = [];
  { const r = rnd(11); const inside = (x, z) => BERGS.some((b) => Math.abs(x - b.x) < b.W / 2 + 3 && z < 4 && z > -b.L - 34) || (x > -60 && x < -40 && z < 4 && z > -70);
    for (let i = 0, n = 0; i < 900 && n < 70; i++) { const x = lerp(-100, 100, r()), z = lerp(-2.5, -120, r()); if (inside(x, z)) continue; const rr = 0.3 + r() * 0.9;
      floes.push(add(blob(rr, 200 + n, 0.25, 1.3, 1.4, 0.45, 1.2), r() < 0.5 ? 'snow' : 'ice', x, 0.04, z, {cast: false, rot: [0, r() * 3, 0]})); n++; } }
  const clouds = [cloud(sky, -40, 22, -120, 4.0, 51), cloud(sky, 0, 26, -140, 4.5, 52), cloud(sky, 40, 21, -110, 3.4, 53), cloud(sky, 80, 25, -130, 4.2, 54), cloud(sky, -90, 24, -150, 5, 55)];

  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    floes.forEach((m, i) => { m.userData.y0 ??= m.position.y; m.position.y = m.userData.y0 + 0.04 * Math.sin(t * 1.1 + i); });
    for (const k in bergs) {
      const {b, grp, pieces, rg, bar, t1} = bergs[k], v = q[k] ?? 0, p = sm(v);
      grp.visible = v > 0.002; grp.position.set(b.x, 0.03 * Math.sin(t * 0.7 + b.x), lerp(-30, 0, p)); grp.rotation.y = lerp(0.3, 0, p);
      if (k === 'b9') grp.position.x = b.x + 0.7 * sm(q.b9hit ?? 0);
      if (k === 'a68') { const s = sm(q.a68s ?? 0); pieces.forEach((pc, i) => { const d = i - 1; pc.pg.position.set(pc.x0 + d * 3.2 * s + (i === 2 ? 2 * s : 0), 0, pc.z0 - d * 3.5 * s); pc.pg.rotation.y = d * 0.35 * s + (i === 1 ? -0.15 * s : 0); }); }
      const R = sm(q[k + 'R'] ?? 0); rg.visible = R > 0.003; bar.scale.z = Math.max(0.001, b.L * R); t1.position.z = -b.L * R;
    }
    const h = sm(q.b9hit ?? 0); const kb = kus.userData.base; kus.position.set(kb[0] + 5.5 * h, 0, kb[1] + 2.5 * h); kus.rotation.y = -0.55 * h;
    const tv = (q.b9 ?? 0) > 0.002; tongue.visible = tv; kus.visible = tv;
    const mv = q.man ?? 0; man.visible = mv > 0.002 && (q.b15 ?? 0) > 0.5; man.scale.set(1, Math.max(0.01, sm(mv)), 1);
    const L = q.a38L ?? 0; lon.forEach((g, i) => { const a = sm(Math.min(1, Math.max(0, L - i))); g.visible = a > 0.01 && (q.a38 ?? 0) > 0.5; g.scale.setScalar(0.85 + 0.15 * a); }); lonM.opacity = 0.9 * Math.min(1, L);
    const ke = sm(q.keel ?? 0); cutMat.opacity = 0.62 - 0.22 * ke; wlM.opacity = 0.9 * ke; wl.visible = ke > 0.01;
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
