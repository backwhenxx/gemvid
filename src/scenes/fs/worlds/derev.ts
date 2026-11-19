// @ts-nocheck
// Мир «Топ-5 самых высоких деревьев» (19.11): пять великанов в ряд (масштаб 1:5 — 1 ед. = 5 м), рядом 30-этажный дом и обычные ели.
// Каждое место: с макушки спускается жёлтая мерная лента до земли. Срез земли спереди — фирменный.
import * as THREE from 'three';
import {makeKit, cutFace, ground, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const K5 = 0.2; // м → ед.
export function S(x, z) { return 0.6 * Math.sin(x * 0.08 + 0.5) * sm((-z - 1) / 4) + 1.4 * sm((-z - 14) / 10) + 0.08 * Math.sin(x * 0.9 + z * 0.7) * sm((-z - 1.5) / 3); }
const B = [(x) => S(x, 0), (x) => S(x, 0) - 0.3, (x) => S(x, 0) - 1.4 - 0.1 * Math.sin(x * 0.7), (x) => -4.2 + 0.3 * Math.sin(x * 0.3), (x) => -14 + 0.5 * Math.sin(x * 0.2), () => -40];
const LAYERS = ['grass', 'soil', 'clay', 'rock', 'deep'];
const Z = -5;
export const TREES = [
  {key: 't5', x: -18, h: 99.7 * K5},  // пихта Дугласа
  {key: 't4', x: -9, h: 100.5 * K5},  // эвкалипт Центурион
  {key: 't3', x: 0, h: 100.8 * K5},   // Менара
  {key: 't2', x: 9, h: 102.3 * K5},   // кипарис в Тибете
  {key: 't1', x: 19, h: 115.9 * K5},  // Гиперион
];
const TW = {x: -26, h: 90 * K5}; // 30-этажный дом ≈ 90 м
const top = (t) => [t.x, S(t.x, Z) + t.h, Z + 0.6];
export const T = {t5: top(TREES[0]), t4: top(TREES[1]), t3: top(TREES[2]), t2: top(TREES[3]), t1: top(TREES[4]), tower: [TW.x, S(TW.x, Z) + TW.h, Z + 2]};
const cam = (x, y, d) => ({pos: [x + 5, y + 1.5, d], look: [x, y, Z], fov: 40});
export const CAMS = {
  hook: {pos: [-15, 9.5, 42], look: [-21, 10, Z], fov: 40},
  t5: cam(-18, 10.5, 34), t4: cam(-9, 10.5, 34), t3: cam(0, 10.5, 34), t2: cam(9, 10.8, 34), t1: cam(19, 12, 38),
  wide: {pos: [16, 12, 56], look: [10, 12, Z], fov: 40},
  cover: {pos: [10, 9, 52], look: [6, 11, Z], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {grass: '#8fc35c', soil: '#7d5a44', clay: '#c98a5c', rock: '#8a8fa6'});
  const {add, box, cyl, blob, tree, fir, cloud, smoke} = K;
  cutFace(K, LAYERS, (k, x) => B[k](x), -60, 60, []);
  ground(K, S, 'grass', -60, 60, -40, 1.2);
  hills(K, 'hillMid', -39.5, -80, (x, z) => S(x, -40) - 0.3 + 9 * sm((-z - 40) / 30) * (0.55 + 0.45 * Math.sin(x * 0.06 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -76, -170, (x, z) => 4 + 20 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0; i < 26; i++) { const x = lerp(-50, 50, r()), y = lerp(-8.5, -1.6, r()), rr = 0.25 + r() * 0.4; add(blob(rr, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); } }

  // ── пять великанов
  const y0 = (x) => S(x, Z) - 0.1;
  { // 5. пихта Дугласа: ствол + ярусы конусов
    const t = TREES[0], b = y0(t.x); cyl(0.35, 0.6, t.h * 0.55, 'trunk', t.x, b + t.h * 0.275, Z, {seg: 9});
    for (let i = 0; i < 9; i++) { const u = i / 8, r = lerp(2.4, 0.5, u), y = b + t.h * (0.35 + 0.6 * u); add(new THREE.ConeGeometry(r, 2.6, 8), 'leafDark', t.x, y, Z, {rot: [0, i * 0.7, 0]}); }
  }
  { // 4. эвкалипт: светлый высокий ствол, рыхлая крона наверху
    const t = TREES[1], b = y0(t.x); cyl(0.3, 0.55, t.h * 0.78, 'birch', t.x, b + t.h * 0.39, Z, {seg: 9});
    const r = rnd(4); for (let i = 0; i < 9; i++) add(blob(1.0 + r() * 0.6, i + 10, 0.22, 1.5), i % 2 ? 'leaf2' : 'leaf', t.x + (r() - 0.5) * 3.4, b + t.h * (0.72 + 0.26 * r()), Z + (r() - 0.5) * 2, {});
  }
  { // 3. Менара: прямой ствол, широкая плоская крона-зонт
    const t = TREES[2], b = y0(t.x); cyl(0.32, 0.6, t.h * 0.82, 'trunk', t.x, b + t.h * 0.41, Z, {seg: 9});
    const r = rnd(5); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(blob(1.3, i + 20, 0.2, 1.4, 1.2, 0.55, 1.1), 'leaf', t.x + Math.cos(a) * 1.9, b + t.h * 0.85 + r() * 0.4, Z + Math.sin(a) * 1.2, {}); }
    add(blob(1.5, 29, 0.2, 1.4, 1.2, 0.6, 1.1), 'leaf2', t.x, b + t.h * 0.93, Z, {});
  }
  { // 2. тибетский кипарис: узкая колонна
    const t = TREES[3], b = y0(t.x); cyl(0.3, 0.55, t.h * 0.4, 'trunk', t.x, b + t.h * 0.2, Z, {seg: 9});
    for (let i = 0; i < 12; i++) { const u = i / 11, r = lerp(1.4, 0.35, u ** 1.5), y = b + t.h * (0.22 + 0.74 * u); add(new THREE.ConeGeometry(r, 2.2, 7), 'leafDark', t.x, y, Z, {rot: [0, i * 0.9, 0]}); }
  }
  { // 1. Гиперион: толстый рыжий ствол, узкий конус хвои
    const t = TREES[4], b = y0(t.x); cyl(0.5, 1.0, t.h * 0.6, 'redwood', t.x, b + t.h * 0.3, Z, {seg: 10});
    for (let i = 0; i < 11; i++) { const u = i / 10, r = lerp(2.6, 0.55, u), y = b + t.h * (0.4 + 0.57 * u); add(new THREE.ConeGeometry(r, 2.8, 8), i % 2 ? 'leafDark' : 'leaf', t.x, y, Z, {rot: [0, i * 0.6, 0]}); }
    // табличка «закрыто» у подножия
  }
  const sign = new THREE.Group(); sign.position.set(TREES[4].x + 3.2, y0(TREES[4].x + 3.2), Z + 3); scene.add(sign);
  cyl(0.06, 0.06, 1.6, 'wood', 0, 0.8, 0, {parent: sign, seg: 6}); box(1.6, 0.9, 0.08, 'red', 0, 1.6, 0, {parent: sign, r: 0.04}); box(1.3, 0.6, 0.04, 'white', 0, 1.6, 0.06, {parent: sign, r: 0.03, cast: false});
  for (const dx of [-0.25, 0.25]) { const m = box(0.5, 0.1, 0.03, 'red', dx * 0, 1.6, 0.09, {parent: sign, r: 0.01, cast: false}); m.rotation.z = dx > 0 ? 0.7 : -0.7; }

  // ── 30-этажный дом (≈90 м) — растёт из земли в хуке
  const tower = new THREE.Group(); tower.position.set(TW.x, y0(TW.x), Z); scene.add(tower);
  box(4, TW.h, 4, 'concrete', 0, TW.h / 2, 0, {parent: tower, r: 0.08});
  for (let f = 0; f < 30; f++) for (let k = 0; k < 4; k++) box(0.5, 0.32, 0.05, 'glass', -1.35 + k * 0.9, 0.5 + f * (TW.h - 0.8) / 30, 2.03, {parent: tower, r: 0.02, cast: false, mat: {emissive: 1, win: 1, ei: 0.5}});
  box(4.3, 0.3, 4.3, 'dark', 0, TW.h + 0.15, 0, {parent: tower, r: 0.05});

  // обычные ели и домики у подножия — для масштаба
  for (let i = 0; i < 26; i++) { const x = -40 + i * 3.3 + hash3(i, 1, 1) * 1.5, z = Z - 2 - hash3(i, 2, 1) * 10; if (TREES.some((t) => Math.abs(t.x - x) < 3.2) || Math.abs(x - TW.x) < 3.4) continue; fir(x, S(x, z) - 0.05, z, 0.9 + hash3(i, 3, 1) * 0.5, false); }
  for (const [x, z] of [[-13.5, -1.8], [4.5, -2.4], [14, -1.6]]) { const y = S(x, z); box(2.0, 1.3, 1.6, 'wall', x, y + 0.65, z, {r: 0.04}); const sh = new THREE.Shape(); sh.moveTo(-1.15, 0); sh.lineTo(1.15, 0); sh.lineTo(0, 0.9); sh.closePath(); add(new THREE.ExtrudeGeometry(sh, {depth: 1.8, bevelEnabled: false}), 'roof', x, y + 1.3, z - 0.9, {}); box(0.5, 0.45, 0.05, 'glass', x + 0.4, y + 0.75, z + 0.82, {r: 0.02, cast: false, mat: {emissive: 1, win: 1, ei: 0.8}}); }
  const clouds = [cloud(sky, -20, 30, -40, 3.0, 51), cloud(sky, 12, 34, -50, 3.5, 52), cloud(sky, 30, 26, -36, 2.0, 53), cloud(sky, -36, 36, -60, 4.0, 54)];

  // ── мерные ленты (жёлтые), по одной на дерево
  const tapes = {};
  for (const t of TREES) {
    const g = new THREE.PlaneGeometry(0.18, 1); g.translate(0, -0.5, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#ffd23a'})); const yt = S(t.x, Z) + t.h;
    m.position.set(t.x + (t.key === 't1' ? 1.4 : 1.1) + 0.9, yt, Z + 3.0); m.renderOrder = 6; scene.add(m);
    const cap = box(0.5, 0.12, 0.1, 'dark', m.position.x, yt + 0.06, Z + 3.0, {r: 0.02, cast: false});
    tapes[t.key] = (p) => { const L = Math.max(0.001, t.h * p); m.scale.y = L; m.visible = cap.visible = p > 0.005; };
  }

  // q: t5..t1 — лента опущена (0..1); tower 0..1 — дом вырос; sign 0..1 — табличка
  const animate = (q) => {
    const t = q.t;
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    for (const tr of TREES) tapes[tr.key](q[tr.key] ?? 0);
    const tw = q.tower ?? 1; tower.scale.set(1, Math.max(0.001, tw), 1); tower.visible = tw > 0.005;
    const sg = sm(q.sign ?? 0); sign.scale.setScalar(Math.max(0.001, sg)); sign.visible = sg > 0.01;
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}
