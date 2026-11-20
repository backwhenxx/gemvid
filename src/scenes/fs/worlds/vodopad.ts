// @ts-nocheck
// Мир «Топ-5 самых высоких водопадов» (20.11): пять скал-столовых гор в ряд (масштаб 1:50 — 1 ед. = 50 м), с каждой падает лента воды.
// Юмбилья 896, Олоупена 900 (у океана), Трес-Эрманас 914 (три ступени), Тугела 948 (верх обледеневает), Анхель 979 (внизу — туман) + Ниагара для сравнения.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const K = 1 / 50;
export function S(x, z) { return 0.5 * Math.sin(x * 0.07 + 1) * sm((-z - 1) / 4) + 0.06 * Math.sin(x * 0.9 + z * 0.7) * sm((-z - 1.5) / 3); }
const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.3, (x) => S(x, 0) - 1.4 - 0.1 * Math.sin(x * 0.7), (x) => -4.2 + 0.3 * Math.sin(x * 0.3), (x) => -14, () => -40];
const LAYERS = ['grass', 'soil', 'clay', 'rock', 'deep'];
const Z = -7;
export const FALLS = [
  {key: 'w5', x: -24, h: 896 * K},
  {key: 'w4', x: -12, h: 900 * K, sea: true},
  {key: 'w3', x: 0, h: 914 * K, tiers: 3},
  {key: 'w2', x: 12, h: 948 * K, ice: true},
  {key: 'w1', x: 24, h: 979 * K, mist: true},
];
const lip = (f) => [f.x, f.h + 0.2, Z + 3.1];
export const T = {w5: lip(FALLS[0]), w4: lip(FALLS[1]), w3: lip(FALLS[2]), w2: lip(FALLS[3]), w1: lip(FALLS[4]), mist: [24, 2.5, Z + 3.4], niagara: [31, 1.4, Z + 4.5], sea: [-12, 0.2, Z + 5]};
const cam = (x, y, d) => ({pos: [x + 5, y + 1.5, d], look: [x, y, Z], fov: 40});
export const CAMS = {
  hook: {pos: [29, 6, 30], look: [24, 7.5, Z], fov: 40},
  hook2: {pos: [27.5, 7.5, 25], look: [24, 8.5, Z], fov: 40},
  w5: cam(-24, 9.6, 36), w4: cam(-12, 9.6, 36), w3: cam(0, 9.8, 36), w2: cam(12, 10, 36), w1: cam(24, 10.2, 38),
  niag: {pos: [33, 7, 34], look: [26, 6.5, Z], fov: 40},
  wide: {pos: [8, 5, 60], look: [4, 13.5, Z], fov: 40},
  cover: {pos: [27, 9, 46], look: [18, 10, Z], fov: 40},
};

export function build(scene, sky) {
  const Kt = makeKit(scene, {grass: '#7fbf5a', soil: '#7d5a44', clay: '#c98a5c', rock: '#8a8fa6', leaf: '#4f9c4e', leaf2: '#86c25c', cliff: '#b07f62'});
  const {add, box, cyl, blob, tree, fir, cloud, smoke} = Kt;
  cutFace(Kt, LAYERS, (k, x) => B[k](x), -60, 60, []);
  ground(Kt, S, 'grass', -60, 60, -40, 1.2);
  hills(Kt, 'hillMid', -39.5, -80, (x, z) => S(x, -40) - 0.3 + 9 * sm((-z - 40) / 30) * (0.55 + 0.45 * Math.sin(x * 0.06 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(Kt, 'hillFar', -76, -170, (x, z) => 4 + 20 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0; i < 26; i++) { const x = lerp(-50, 50, r()), y = lerp(-9, -1.6, r()), rr = 0.25 + r() * 0.4; add(blob(rr, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); } }

  // ── скалы: столовые горы с неровными боками (призма по неровному контуру), сверху зелень
  const cliff = (f) => {
    const sh = new THREE.Shape(); const r = rnd(f.x * 7 + 100), n = 16, W = 4.4, D = 3.0;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = 1 + (r() - 0.5) * 0.18; const x = Math.cos(a) * W * k, y = Math.sin(a) * D * k; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {depth: f.h, bevelEnabled: false, steps: 6});
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i), u = z / f.h, lv = Math.round(u * 6), k = (1.1 - 0.1 * u) * (lv % 2 ? 1.035 : 1); p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * k); }
    g.computeVertexNormals();
    add(g, 'cliff', f.x, -0.2, Z, {rot: [-Math.PI / 2, 0, 0]});
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.2, 0.25, 14), Kt.M('leaf')); top.scale.set(1, 1, 0.7); top.position.set(f.x, f.h - 0.05, Z); scene.add(top);
    for (let i = 0; i < 5; i++) add(blob(0.55 + r() * 0.3, i + f.x, 0.2, 1.5), i % 2 ? 'leaf2' : 'leaf', f.x + (r() - 0.5) * 6, f.h + 0.3, Z + (r() - 0.5) * 3.2, {});
    if (f.tiers) for (let k = 1; k < f.tiers; k++) { const y = f.h * (1 - k / f.tiers); add(blob(1.0, k + 40, 0.18, 1.3, 2.6, 0.55, 1.3), 'cliff', f.x, y, Z + 3.5, {}); add(blob(0.5, k + 45, 0.2, 1.5), 'leaf', f.x - 1.9, y + 0.45, Z + 3.4, {}); add(blob(0.4, k + 47, 0.2, 1.5), 'leaf2', f.x + 2.0, y + 0.4, Z + 3.3, {}); }
  };
  FALLS.forEach(cliff);

  // ── вода: лента + бегущие вниз белые полосы + брызги внизу
  const water = {};
  for (const f of FALLS) {
    const g = new THREE.Group(); scene.add(g);
    const zf = Z + 3.95, segs = f.tiers ? f.tiers : 1;
    const ribbons = [];
    for (let k = 0; k < segs; k++) {
      const y1 = f.h * (1 - k / segs) + 0.1, y0 = f.h * (1 - (k + 1) / segs) + (k < segs - 1 ? 0.2 : 0); const y0m = f.mist && k === segs - 1 ? 3.2 : y0;
      const pg = new THREE.PlaneGeometry(1.7 - k * 0.15, 1); pg.translate(0, -0.5, 0);
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({color: '#cfeaf8', transparent: true, opacity: 0.88, depthWrite: false})); m.position.set(f.x, y1, zf + k * 0.25); m.renderOrder = 6; g.add(m);
      ribbons.push({m, y1, y0: y0m});
    }
    const streaks = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.6), new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false})); m.renderOrder = 7; g.add(m); streaks.push(m); }
    const spray = []; { const n = f.mist ? 9 : 5, sc = f.mist ? 1.5 : 0.8; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; spray.push(add(blob(0.7 * sc, 80 + i + f.x, 0.15, 1.3), 'cloud', f.x + Math.cos(a) * 1.3 * sc, (f.mist ? 2.2 : 0.3) + (i % 3) * 0.6 * sc, zf + 0.5 + Math.sin(a) * 0.6, {parent: g, cast: false, recv: false})); } }
    // озеро-чаша у подножия
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.8, 18), Kt.M('water', {water: 1, opacity: 0.85, smooth: true})); pool.geometry.rotateX(-Math.PI / 2); pool.position.set(f.x, S(f.x, zf + 1) + 0.04, zf + 1.2); pool.renderOrder = 5; scene.add(pool);
    water[f.key] = {g, ribbons, streaks, spray, f, zf};
  }
  // океан у Олоупены
  { const sea = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), Kt.M('water', {water: 1, opacity: 0.9, smooth: true})); sea.geometry.rotateX(-Math.PI / 2); sea.position.set(-12, 0.12, -2.6); sea.renderOrder = 5; scene.add(sea); }
  // лёд на макушке Тугелы
  const iceG = new THREE.Group(); scene.add(iceG);
  { const f = FALLS[3]; add(new THREE.CylinderGeometry(1.3, 1.5, 0.3, 10), 'ice', f.x, f.h + 0.05, Z + 2.6, {parent: iceG, cast: false}); for (let i = 0; i < 9; i++) add(new THREE.ConeGeometry(0.1, 0.6 + hash3(i, 2, 3) * 0.5, 5), 'ice', f.x - 1.0 + i * 0.25, f.h - 0.35, Z + 3.45, {parent: iceG, rot: [Math.PI, 0, 0], cast: false}); }
  // Ниагара для сравнения: 57 м ≈ 1,1 ед.
  const niag = new THREE.Group(); scene.add(niag);
  { const x = 31, zz = Z + 4.2; box(3.0, 1.15, 0.8, 'cliff', x, 0.55, zz - 0.4, {parent: niag, r: 0.05}); const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({color: '#cfeaf8', transparent: true, opacity: 0.9, depthWrite: false})); m.position.set(x, 0.55, zz + 0.05); m.renderOrder = 6; niag.add(m); }

  // джунгли у подножий
  { const r = rnd(9); for (let i = 0; i < 40; i++) { const x = lerp(-38, 38, r()), z = lerp(Z - 6, -1.5, r()); if (FALLS.some((f) => Math.abs(f.x - x) < 5.5 && z < Z + 4.5 && z > Z - 4)) continue; tree(x, S(x, z) - 0.05, z, 0.9 + r() * 0.6, 0.55 + r() * 0.3, i + 300); } }
  const clouds = [cloud(sky, -20, 28, -40, 3.0, 51), cloud(sky, 12, 32, -50, 3.5, 52), cloud(sky, 30, 25, -36, 2.0, 53), cloud(sky, -36, 34, -60, 4.0, 54)];

  // q: w5..w1 — поток включён (лента дорастает до низа, 0..1); ice 0..1; niagara 0..1
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const key in water) {
      const W = water[key], p = q[key] ?? 0, on = p > 0.005; W.g.visible = on;
      W.ribbons.forEach((rb, k) => { const n = W.ribbons.length, pk = Math.min(1, Math.max(0, p * n - k)); rb.m.visible = pk > 0.005; rb.m.scale.y = Math.max(0.001, (rb.y1 - rb.y0) * pk); });
      const yb = W.ribbons[W.ribbons.length - 1], bottom = on ? lerp(W.f.h, 0, p) : W.f.h;
      W.streaks.forEach((m, i) => { const u = ((i / W.streaks.length + t * 0.35) % 1 + 1) % 1, y = W.f.h - u * W.f.h; m.position.set(W.f.x + (hash3(i, 1, 2) - 0.5) * 1.1, y, W.zf + 0.08 + (W.f.tiers ? Math.floor(u * W.f.tiers) * 0.25 : 0)); m.visible = on && y > bottom && (!W.f.mist || y > 3.2); });
      const sp = sm((p - 0.85) / 0.15); W.spray.forEach((m, i) => { m.visible = sp > 0.01; m.scale.setScalar(Math.max(0.001, sp * (0.9 + 0.12 * Math.sin(t * 1.3 + i * 1.7)))); });
      if (W.f.mist) W.ribbons[0].m.material.opacity = 0.88;
    }
    const ic = sm(q.ice ?? 0); iceG.visible = ic > 0.01; iceG.scale.setScalar(Math.max(0.001, ic));
    const ng = sm(q.niagara ?? 0); niag.visible = ng > 0.01; niag.scale.set(1, Math.max(0.001, ng), 1);
  };
  animate({t: 0});
  return {animate, T, wins: Kt.wins, lamps: Kt.lamps};
}
