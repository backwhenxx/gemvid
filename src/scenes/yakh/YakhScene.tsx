import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {box} from '../trench/parts';
import {cloudTexture, waterTexture} from '../dam/textures';
import {shadowAll} from '../../lib/look';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «Яхчал»: персидский ледник в пустыне, разрез по плоскости z=0. 1 единица = 1 м.
// Купол в начале координат (видна половина z≤0 и срез стен), под ним яма со льдом.
// Справа — стена тени (x 39..41) и мелкий бассейн (x 43..53), оба уходят от разреза вглубь (z 0..-100).
// Под землёй на срезе — канат (подземный канал): идёт от гор справа (x≈1650) к выходу у бассейна (x=60),
// над ним цепочка колодцев с кольцами отвала. Слева вдали — глинобитный городок, по горизонту — горы.
// Свет: золотой час (солнце низко слева) ↔ ночь (луна, звёзды) — параметр night 0..1 плавно, без скачков.
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const NEAR = 3;
const FAR = 8000;
// купол и яма
const PR = 8.4; // радиус ямы
const LIN = 0.6; // облицовка ямы
const R0 = PR + LIN; // внутренний радиус купола у земли = край земли
const RO = 11; // внешний радиус купола у земли (стена 2 м)
const DH = 18; // высота купола
const PD = 10; // глубина ямы
const ICE_L = 1.1; // слой льда в яме
const STRAW = 0.2; // солома между слоями
const ICE_MAX = 7;
// стена тени и бассейн
const WX0 = 39;
const WX1 = 41.4;
const WALL_H = 10;
const PX0 = 43;
const PX1 = 53;
const PZ = -100;
const PFLOOR = 0.3;
const PLAYER = 0.5 / 6; // один ночной слой льда (6 слоёв = полметра)
// канат
const QX0 = 60;
const QX1 = 1650;
const QH = 1.6;
const qY = (x: number) => -1.9 + (x - QX0) * 0.004; // низ тоннеля (вода течёт к выходу, x=60)
const SHAFTS = Array.from({length: 36}, (_, k) => 95 + k * 44).filter((x) => x < QX1);
// слои на срезе: лицо земли в z=0, выступающие детали (тоннель, шахты) — с зазором ≥0.3 м
const ZRIM = 0.35;
const ZQ = 0.7;
const ZQW = 1.0;
const ZARR = 1.4;

// выпуклый «улей», а не пирамида
const ri = (y: number) => 0.55 + (R0 - 0.55) * Math.pow(clamp01(1 - Math.pow(y / (DH - 0.6), 1.35)), 0.68);
const ro = (y: number) => 0.85 + (RO - 0.85) * Math.pow(clamp01(1 - Math.pow(y / DH, 1.35)), 0.68);

// ---------- рельеф ----------
const n2 = (x: number, z: number) => Math.sin(x * 0.013 + 1.3) * Math.cos(z * 0.011 - 0.4) + 0.5 * Math.sin(x * 0.031 + z * 0.023) + 0.25 * Math.sin(x * 0.071 - z * 0.057 + 2);
const fan = (x: number, z: number) => 62 * smooth(180, 2100, x) * (1 - 0.5 * smooth(400, 2200, -z));
const ground = (x: number, z: number) => {
  const r = Math.hypot(x, z);
  // плоская площадка у ледника, бассейна и сада (плавно, без ступенек)
  const flat = Math.max(smooth(150, 60, r), smooth(-60, -30, x) * (1 - smooth(190, 240, x)) * (1 - smooth(230, 270, -z)));
  // барханы и рябь, подъём к горам
  let h = (fan(x, z) + n2(x, z) * lerp(0.6, 6, smooth(150, 900, r))) * (1 - flat);
  // горы по горизонту
  const ang = Math.atan2(z, x);
  const ridge = smooth(1500, 3300, r) * (230 + 140 * Math.sin(ang * 7 + 1) + 90 * Math.sin(ang * 17 + 2) + 40 * n2(x * 0.3, z * 0.3));
  h = Math.max(h, ridge);
  return h;
};
// верх среза земли (z=0): с выемкой под яму
const cutTop = (x: number) => (Math.abs(x) < R0 ? -PD - LIN : ground(x, 0));
const wt = (x: number) => -25 + 0.022 * x; // уровень грунтовых вод (выше к горам)
const wob = (x: number, a: number, s: number) => a * Math.sin(x * 0.05 + s) + a * 0.5 * Math.sin(x * 0.17 + s * 2);
const sandBot = (x: number) => cutTop(x) - 2.6 + wob(x, 0.5, 1);
const allBot = (x: number) => Math.min(sandBot(x) - 0.4, wt(x) + wob(x, 0.8, 2));
const aqBot = (x: number) => allBot(x) - 9 + wob(x, 1.2, 3);
const BOTTOM = -160;

// ---------- камеры ----------
type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  hookA: {pos: [-40, 4.5, 64], look: [0, 8, -4]},
  hookB: {pos: [10, -0.5, 27], look: [0, -4.8, -1]},
  yakh: {pos: [30, 11, 58], look: [2, 7.5, -4]},
  wallC: {pos: [-17.5, 3.2, 11.5], look: [-10.4, 2.4, -1]},
  pool: {pos: [104, 26, 54], look: [46, 2, -42]},
  qanat: {pos: [124, 11, 74], look: [94, -3, -10]},
  sky: {pos: [124, 14, 80], look: [62, 12, -36]},
  poolCut: {pos: [44.6, 1.45, 5.0], look: [51, 0.45, -1.6]},
  pit: {pos: [22, 2.5, 41], look: [0, -4, -2]},
  air: {pos: [0, 8, 51], look: [0, 6.8, -3]},
  pit2: {pos: [7, 0.5, 28], look: [0, -4.2, -1]},
  wide: {pos: [30, 30, 152], look: [24, 4, -30]},
  final: {pos: [34, 42, 192], look: [24, 6, -40]},
  cover: {pos: [27, 7, 47], look: [4, 4.5, -4]},
  hookA2: {pos: [-30, 4.5, 54], look: [0, 7.5, -4]},
  wallC2: {pos: [-16, 2.2, 9.8], look: [-10.2, 1.6, -1]},
  pool2: {pos: [96, 16, 38], look: [44, 1.5, -40]},
  pit3: {pos: [17, 0.5, 33], look: [0, -4.5, -2]},
  air2: {pos: [0, 7, 46], look: [0, 6.2, -3]},
  yakh2: {pos: [34, 13, 62], look: [4, 7, -6]},
  final2: {pos: [36, 46, 204], look: [24, 6, -42]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.yakh : c);
const range = (v: any, p: number, dur = 1, delay = 0, ease = false): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  if (Array.isArray(v[0])) {
    const ks = v as [number, number][];
    if (p <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) if (p <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], (p - ks[i - 1][0]) / Math.max(1e-6, ks[i][0] - ks[i - 1][0]));
    return ks[ks.length - 1][1];
  }
  const k = clamp01((p - delay) / dur);
  return lerp(v[0], v[1], ease ? easeInOut(k) : k);
};

// ---------- свет: день (золотой час) ↔ ночь ----------
const DAY = {
  sun: new THREE.Vector3(-1, 0.42, 0.55).normalize(),
  sunCol: '#ffc58a',
  sunI: 3.0,
  hemiSky: '#9fb3d6',
  hemiGround: '#8a6a4a',
  hemiI: 0.95,
  bounceI: 0.6,
  sky: {top: '#3e6aa8', mid: '#9fb9d2', horizon: '#f3dcb4', glow: '#ffe2a8', glowSize: 10},
  fog: '#e9d3b4',
  fogNear: 420,
  fogFar: 3600,
  grade: {shadow: '#26304e', shadowAmt: 0.08, high: '#fff0dc', highAmt: 0.08, vignette: 0.34, grain: 0.05},
};
const NIGHT = {
  moon: new THREE.Vector3(0.55, 0.75, 0.6).normalize(),
  moonCol: '#c8d3ec',
  moonI: 1.1,
  hemiSky: '#4b5a7e',
  hemiGround: '#3a3127',
  hemiI: 0.75,
  sky: {top: '#050919', mid: '#141f44', horizon: '#39406a', glow: '#7584b0', glowSize: 8},
  fog: '#2c3149',
  fogNear: 220,
  fogFar: 2500,
  grade: {shadow: '#0e1430', shadowAmt: 0.14, high: '#d6e2ff', highAmt: 0.14, vignette: 0.46, grain: 0.06},
};
// луна на небе — сзади над горами (видна в кадре); свет луны — спереди-сбоку, чтобы срез читался
const MOON_SKY = new THREE.Vector3(0.3, 0.42, -0.86).normalize();
const col = (c: string) => new THREE.Color(c);
const makeSky = (S: typeof DAY.sky, dir: THREE.Vector3, opacity = 1) => {
  const g = new THREE.SphereGeometry(1800, 48, 24);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = col(S.top);
  const mid = col(S.mid);
  const hor = col(S.horizon);
  const glow = col(S.glow);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const e = v.y;
    if (e <= 0.02) c.copy(hor);
    else if (e < 0.22) c.copy(hor).lerp(mid, (e - 0.02) / 0.2);
    else c.copy(mid).lerp(top, Math.min(1, (e - 0.22) / 0.55));
    const d = Math.max(0, v.dot(dir));
    c.lerp(glow, Math.min(0.85, Math.pow(d, S.glowSize) * 0.9 + Math.pow(d, 2) * 0.12 * (1 - Math.min(1, Math.max(0, e) * 2))));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false, transparent: opacity < 1, opacity});
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
};

// ---------- текстуры ----------
const cv = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
};
const tex = (c: HTMLCanvasElement, rx = 1, ry = 1) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
const speckle = (g: CanvasRenderingContext2D, w: number, h: number, n: number, cols: string[], seed: number, size = [1, 3]) => {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.beginPath();
    g.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.5), r() * 3, 0, 6.3);
    g.fill();
  }
};
// глиняная штукатурка купола: тёплая охра, соломинки, мягкие потёки (512 px = 4 м)
const adobeTex = (base = '#c58d58', seed = 3) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 5000, ['rgba(255,225,175,0.16)', 'rgba(90,55,30,0.13)'], seed, [0.8, 2.2]);
  const r = rng(seed + 1);
  g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '235,200,120' : '120,85,45'},0.35)`;
    const x = r() * 512;
    const y = r() * 512;
    const a = r() * 6.3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
    g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const gr = g.createLinearGradient(x, y, x, y + 90);
    gr.addColorStop(0, 'rgba(95,60,35,0.16)');
    gr.addColorStop(1, 'rgba(95,60,35,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 4 + r() * 8, 90);
  }
  return tex(c, 1 / 4, 1 / 4);
};
// срез стены: сырцовый кирпич на растворе-саруджe (светлый раствор с волокнами шерсти), 512 px = 4 м
const brickCutTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#d4c6ad';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 2500, ['rgba(120,110,95,0.25)', 'rgba(250,245,230,0.3)'], 41, [0.6, 1.4]);
  const r = rng(42);
  const bh = 34;
  const bw = 62;
  for (let row = 0; row < 512 / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 512; x += bw) {
      const v = Math.floor(r() * 18);
      g.fillStyle = `rgb(${172 + v},${118 + v},${78 + v * 0.6})`;
      g.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
    }
  }
  speckle(g, 512, 512, 3000, ['rgba(255,220,160,0.18)', 'rgba(80,50,25,0.18)'], 43, [0.6, 1.8]);
  // волокна козьей шерсти в швах
  g.strokeStyle = 'rgba(70,58,46,0.5)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 500; i++) {
    const x = r() * 512;
    const y = Math.floor(r() * (512 / bh)) * bh + (r() < 0.5 ? 1 : bh - 2);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 3 + r() * 6, y + (r() - 0.5) * 3);
    g.stroke();
  }
  return tex(c, 1 / 4, 1 / 4);
};
// разрезы грунта (512 px = 24 м)
const soilTex = (base: string, dots: string[], pebbles: string[], seed: number, rep = 1 / 24) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 7000, dots, seed, [0.8, 2.2]);
  if (pebbles.length) speckle(g, 512, 512, 260, pebbles, seed + 1, [2, 6]);
  const r = rng(seed + 2);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,240,210,0.08)' : 'rgba(40,25,10,0.08)';
    g.fillRect(0, r() * 512, 512, 3 + r() * 10);
  }
  return tex(c, rep, rep);
};
// поверхность песка: светлая, с мягкой рябью (цвет даёт вершинная окраска)
const sandTopTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  const r = rng(51);
  for (let i = 0; i < 46; i++) {
    const y0 = r() * 512;
    g.strokeStyle = `rgba(150,110,70,${0.05 + r() * 0.05})`;
    g.lineWidth = 5 + r() * 6;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.02 + i) * 9);
    g.stroke();
  }
  speckle(g, 512, 512, 6000, ['rgba(120,90,60,0.12)', 'rgba(255,250,240,0.25)'], 52, [0.6, 1.6]);
  return tex(c, 1 / 14, 1 / 14);
};
// лёд в яме: блоки с голубыми швами (текстура = 6 м × 1.1 м)
const iceTex = () => {
  const [c, g] = cv(512, 96);
  const gr = g.createLinearGradient(0, 0, 0, 96);
  gr.addColorStop(0, '#e6f4f8');
  gr.addColorStop(1, '#bcdce8');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 96);
  const r = rng(61);
  g.fillStyle = 'rgba(120,170,195,0.55)';
  let x = 0;
  while (x < 512) {
    g.fillRect(x, 0, 3, 96);
    x += 90 + r() * 60;
  }
  g.fillRect(0, 0, 512, 3);
  speckle(g, 512, 96, 300, ['rgba(255,255,255,0.7)', 'rgba(150,195,215,0.4)'], 62, [0.6, 2]);
  for (let i = 0; i < 25; i++) {
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 1;
    const x0 = r() * 512;
    const y0 = r() * 96;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + (r() - 0.5) * 30, y0 + (r() - 0.5) * 30);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
const strawTex = () => {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#c49a48';
  g.fillRect(0, 0, 256, 64);
  const r = rng(71);
  for (let i = 0; i < 500; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(240,210,130,0.7)' : 'rgba(120,85,35,0.5)';
    g.lineWidth = 1;
    const x = r() * 256;
    const y = r() * 64;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 6 + r() * 10, y + (r() - 0.5) * 4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// лёд в бассейне сверху: изморозь
const frostTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1500, ['rgba(170,205,225,0.35)', 'rgba(255,255,255,0.9)'], 81, [0.6, 2.5]);
  const r = rng(82);
  g.strokeStyle = 'rgba(150,190,210,0.35)';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = 0.8;
    let x = r() * 256;
    let y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (r() - 0.5) * 40;
      y += (r() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return tex(c, 1 / 8, 1 / 8);
};
// разметка блоков на льду бассейна (прозрачная сетка 2.5 × 2.5 м)
const gridTex = () => {
  const [c, g] = cv(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(60,110,140,0.75)';
  g.fillRect(0, 0, 128, 5);
  g.fillRect(0, 0, 5, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10 / 2.5, 100 / 2.5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// глинобитный дом: стены с дверью и окнами-нишами, 256 px = 8 м
const houseTex = (seed: number) => {
  const [c, g] = cv(256, 128);
  g.fillStyle = '#c99a66';
  g.fillRect(0, 0, 256, 128);
  speckle(g, 256, 128, 1200, ['rgba(255,225,180,0.2)', 'rgba(90,60,35,0.18)'], seed, [0.6, 1.8]);
  const r = rng(seed + 1);
  g.fillStyle = '#3c2a1e';
  // дверь-арка
  const dx = 40 + r() * 150;
  g.fillRect(dx, 70, 22, 58);
  g.beginPath();
  g.arc(dx + 11, 70, 11, Math.PI, 0);
  g.fill();
  for (let i = 0; i < 3; i++) {
    const x = 20 + i * 80 + r() * 20;
    if (Math.abs(x - dx) < 30) continue;
    g.fillRect(x, 50, 12, 18);
    g.beginPath();
    g.arc(x + 6, 50, 6, Math.PI, 0);
    g.fill();
  }
  g.fillStyle = 'rgba(90,60,35,0.35)';
  g.fillRect(0, 0, 256, 6);
  return tex(c, 1, 1);
};
const moonTex = () => {
  const [c, g] = cv(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(250,250,240,1)');
  gr.addColorStop(0.32, 'rgba(240,242,235,1)');
  gr.addColorStop(0.36, 'rgba(200,215,240,0.35)');
  gr.addColorStop(1, 'rgba(160,180,230,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(180,185,190,0.4)';
  [[56, 58, 6], [72, 70, 4], [62, 76, 3]].forEach(([x, y, s]) => {
    g.beginPath();
    g.arc(x, y, s, 0, 6.3);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// ---------- геометрия ----------
const xsamples = (() => {
  const xs: number[] = [];
  for (let x = -4000; x < -300; x += 40) xs.push(x);
  for (let x = -300; x < -40; x += 2) xs.push(x);
  for (let x = -40; x <= 200; x += 0.5) xs.push(x);
  for (let x = 202; x <= 1800; x += 2) xs.push(x);
  for (let x = 1840; x <= 4000; x += 40) xs.push(x);
  [-R0, R0].forEach((v) => {
    xs.push(v - 0.001);
    xs.push(v + 0.001);
  });
  return [...new Set(xs)].sort((a, b) => a - b);
})();
// плоский профиль на плоскости разреза (z=0), uv = мировые x,y
const face = (top: (x: number) => number, bot: (x: number) => number, x0 = -4000, x1 = 4000, z = 0) => {
  const xs = xsamples.filter((x) => x >= x0 && x <= x1);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  xs.forEach((x, i) => {
    const t = top(x);
    const b = Math.min(bot(x), t - 0.001);
    pos.push(x, b, z, x, t, z);
    uv.push(x, b, x, t);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};
// полигон в плоскости XY на глубине z (лицевая сторона к камере), uv = мировые x,y
const polyFace = (pts: [number, number][], z: number) => {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(s);
  g.translate(0, 0, z);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = p.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
// полу-тело вращения (z≤0), uv в метрах: u — дуга, v — высота
const halfLathe = (pts: [number, number][], seg = 48) => {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, Math.PI / 2, Math.PI);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    uv[i * 2] = Math.atan2(-z, x) * Math.max(r, 2);
    uv[i * 2 + 1] = p.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
// профиль стены купола (r, y): ступенчатый снаружи, гладкий изнутри, отверстие наверху
const outerProfile = (): [number, number][] => {
  const out: [number, number][] = [[R0, 0], [RO, 0]];
  const STEP = 1.0;
  for (let y = 0; y < DH - 0.01; y += STEP) {
    const y1 = Math.min(DH, y + STEP);
    out.push([ro(y), y1 - 0.18]);
    out.push([ro(y1) + 0.07, y1]);
  }
  out.push([0.85, DH]);
  out.push([0.6, DH]);
  return out;
};
const innerProfile = (): [number, number][] => {
  const out: [number, number][] = [[0.6, DH]];
  for (let y = DH - 0.6; y >= 0; y -= 0.4) out.push([ri(y), y]);
  out.push([ri(0), 0]);
  out.push([R0, 0]);
  return out;
};
const domeProfile = (): [number, number][] => [...outerProfile(), ...innerProfile().slice(1)];

// дерево сада: шар кроны (инстансы)
// дом городка: кубик с текстурой, купол-крыша, иногда ветряная башня
const makeHouse = (m: Record<string, any>, w: number, d: number, h: number, wind: boolean, seed: number) => {
  const g = new THREE.Group();
  const mat = m.houses[seed % m.houses.length];
  g.add(new THREE.Mesh(box(-w / 2, w / 2, 0, h, -d / 2, d / 2), mat));
  const dm = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.42, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), m.adobeDark);
  dm.position.y = h;
  g.add(dm);
  if (wind) {
    g.add(new THREE.Mesh(box(-1.2, 1.2, h, h + 6.5, -1.2, 1.2), m.adobe));
    // вентиляционные щели башни
    [-0.6, 0, 0.6].forEach((x) => g.add(new THREE.Mesh(box(x - 0.15, x + 0.15, h + 4.2, h + 6, 1.15, 1.3), m.slot)));
    [-0.6, 0, 0.6].forEach((x) => g.add(new THREE.Mesh(box(x - 0.15, x + 0.15, h + 4.2, h + 6, -1.3, -1.15), m.slot)));
    g.add(new THREE.Mesh(box(-1.4, 1.4, h + 6.5, h + 6.9, -1.4, 1.4), m.adobeDark));
  }
  return g;
};

// ---------- мир ----------
const useWorld = () =>
  useMemo(() => {
    const m: Record<string, any> = {
      adobe: new THREE.MeshStandardMaterial({map: adobeTex(), roughness: 0.95}),
      domeMat: new THREE.MeshStandardMaterial({map: adobeTex('#b4744a', 4), roughness: 0.95, flatShading: true, side: THREE.DoubleSide}),
      domeIn: new THREE.MeshStandardMaterial({map: adobeTex('#7c5034', 5), roughness: 1, side: THREE.DoubleSide}),
      adobeDark: new THREE.MeshStandardMaterial({map: adobeTex('#b07c4c', 9), roughness: 0.95}),
      brick: new THREE.MeshStandardMaterial({map: brickCutTex(), roughness: 0.95}),
      lining: new THREE.MeshStandardMaterial({map: brickCutTex(), roughness: 0.95, color: '#d9cfc2'}),
      sand: new THREE.MeshStandardMaterial({map: sandTopTex(), vertexColors: true, roughness: 1}),
      cSand: new THREE.MeshStandardMaterial({map: soilTex('#d2ab73', ['rgba(255,235,195,0.3)', 'rgba(120,85,50,0.25)'], [], 11), roughness: 1, fog: false}),
      cAll: new THREE.MeshStandardMaterial({map: soilTex('#98724f', ['rgba(220,190,150,0.3)', 'rgba(70,50,30,0.3)'], ['#6d6258', '#c9b9a0', '#86684c', '#5b5048'], 13), roughness: 1, fog: false}),
      cAq: new THREE.MeshStandardMaterial({map: soilTex('#5d7180', ['rgba(150,175,185,0.35)', 'rgba(30,40,45,0.3)'], ['#4f5b60', '#9aa6aa', '#3c4448'], 15), roughness: 0.7, fog: false}),
      cRock: new THREE.MeshStandardMaterial({map: soilTex('#7a4630', ['rgba(190,130,90,0.3)', 'rgba(60,30,18,0.3)'], ['#5e3a28', '#a8775a'], 17, 1 / 30), roughness: 1, fog: false}),
      ice: new THREE.MeshStandardMaterial({map: iceTex(), color: '#dbeef7', roughness: 0.3, metalness: 0}),
      iceTop: new THREE.MeshStandardMaterial({map: frostTex(), color: '#dff0f6', roughness: 0.35}),
      poolIce: new THREE.MeshStandardMaterial({color: '#d3eaf2', roughness: 0.25}),
      poolIce2: new THREE.MeshStandardMaterial({color: '#b3d4e2', roughness: 0.25}),
      straw: new THREE.MeshStandardMaterial({map: strawTex(), roughness: 1}),
      film: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#5f9fb0', roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.85, depthWrite: false}),
      grid: new THREE.MeshBasicMaterial({map: gridTex(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4}),
      mud: new THREE.MeshStandardMaterial({color: '#8d6a48', roughness: 1}),
      dryMud: new THREE.MeshStandardMaterial({map: adobeTex('#a98058', 21), roughness: 1}),
      qDark: new THREE.MeshStandardMaterial({color: '#2c211a', roughness: 1}),
      qRim: new THREE.MeshStandardMaterial({color: '#d8c7a6', roughness: 1, transparent: true}),
      qWater: new THREE.MeshStandardMaterial({color: '#4e9fb3', roughness: 0.2, emissive: '#1d4652', emissiveIntensity: 0.3}),
      slot: new THREE.MeshStandardMaterial({color: '#2e2219', roughness: 1}),
      canopy: new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.95}),
      trunk: new THREE.MeshStandardMaterial({color: '#5c4532', roughness: 1}),
      warm: new THREE.MeshBasicMaterial({color: '#ff8a3d', transparent: true, opacity: 0.95, fog: false, depthWrite: false}),
      cold: new THREE.MeshBasicMaterial({color: '#8fd6f2', transparent: true, opacity: 0.95, fog: false, depthWrite: false}),
      heat: new THREE.MeshBasicMaterial({color: '#cfe0ff', transparent: true, opacity: 0.8, fog: false, depthWrite: false}),
      flow: new THREE.MeshBasicMaterial({color: '#e6fbff', transparent: true, opacity: 0.9, fog: false, depthWrite: false}),
      flume: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#5f9fb0', roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.85, depthWrite: false}),
      houses: [0, 1, 2, 3].map((s) => new THREE.MeshStandardMaterial({map: houseTex(200 + s * 7), roughness: 0.95})),
    };
    // отдельные копии для стены тени — чтобы подсвечивать её независимо от купола
    m.wBrick = m.brick.clone();
    m.wAdobe = m.adobe.clone();
    const world = new THREE.Group();
    const r = rng(23);

    // --- срез земли (лицо в z=0): песок, аллювий, водоносный гравий, коренная порода
    const L = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const me = new THREE.Mesh(g, mat);
      me.receiveShadow = true;
      world.add(me);
      return me;
    };
    L(face(cutTop, sandBot), m.cSand);
    L(face(sandBot, allBot), m.cAll);
    L(face(allBot, aqBot), m.cAq);
    L(face(aqBot, () => BOTTOM), m.cRock);

    // --- земля: полярная сетка вокруг ледника (половина z≤0), край r=R0 — граница ямы
    const radii: number[] = [];
    for (let rr = R0; rr < 80; rr += 1) radii.push(rr);
    for (let rr = 80; rr < 6000; rr *= 1.03) radii.push(rr);
    const NA = 300;
    const pos: number[] = [];
    const colors: number[] = [];
    const uv: number[] = [];
    const cSandA = new THREE.Color('#ead0a0');
    const cSandB = new THREE.Color('#dcb582');
    const cGravel = new THREE.Color('#a98a68');
    const cMount = new THREE.Color('#8f6b52');
    const cSnow = new THREE.Color('#efe6dc');
    const cc = new THREE.Color();
    radii.forEach((rad) => {
      for (let a = 0; a <= NA; a++) {
        const th = Math.PI + (a / NA) * Math.PI;
        const x = a === 0 ? -rad : a === NA ? rad : rad * Math.cos(th);
        const z = a === 0 || a === NA ? 0 : rad * Math.sin(th);
        const h = ground(x, z);
        pos.push(x, h, z);
        uv.push(x, z);
        const nn = 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.03) * Math.cos(x * 0.021 - z * 0.04);
        cc.copy(cSandA).lerp(cSandB, nn);
        cc.lerp(cGravel, smooth(25, 70, h) * 0.8);
        cc.lerp(cMount, smooth(90, 200, h));
        cc.lerp(cSnow, smooth(330, 400, h + 30 * nn));
        colors.push(cc.r, cc.g, cc.b);
      }
    });
    const idx: number[] = [];
    for (let i = 0; i < radii.length - 1; i++)
      for (let a = 0; a < NA; a++) {
        const p0 = i * (NA + 1) + a;
        const p1 = p0 + NA + 1;
        idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
      }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const land = new THREE.Mesh(tg, m.sand);
    land.receiveShadow = true;
    world.add(land);

    // --- купол: стены (половина) и срез стены в z=0
    const prof = domeProfile();
    const dome = new THREE.Mesh(halfLathe(outerProfile(), 64), m.domeMat);
    world.add(dome);
    // изнанка купола темнее: внутри тень и прохлада
    world.add(new THREE.Mesh(halfLathe(innerProfile(), 64), m.domeIn));
    const capPts = prof.slice(0, -1);
    const capR = polyFace(capPts.map(([x, y]) => [x, y]), 0);
    const capL = polyFace(capPts.map(([x, y]) => [-x, y]), 0);
    world.add(new THREE.Mesh(capR, m.brick), new THREE.Mesh(capL, m.brick));
    // арка входа с юго-запада (тёмная ниша на куполе)
    const door = new THREE.Mesh(box(-1.1, 1.1, 0, 2.8, -0.5, 0.5), m.slot);
    door.position.set(-RO * Math.cos(0.6) + 0.35, 0, -RO * Math.sin(0.6) + 0.2);
    door.rotation.y = 0.6 + Math.PI / 2;
    world.add(door);
    const porch = new THREE.Mesh(box(-1.8, 1.8, 0, 3.6, -1.6, 0.4), m.domeMat);
    porch.position.copy(door.position);
    porch.rotation.y = door.rotation.y;
    porch.position.x -= Math.cos(0.6) * 0.9;
    porch.position.z -= Math.sin(0.6) * 0.9;
    world.add(porch);

    // --- яма: облицовка стен и дна (половина) + их срезы
    world.add(new THREE.Mesh(halfLathe([[PR, 0], [PR, -PD], [R0, -PD], [R0, 0], [PR, 0]], 48), m.lining));
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0, LIN, 40, 1, false, Math.PI / 2, Math.PI), m.lining);
    floor.position.y = -PD - LIN / 2;
    world.add(floor);
    [1, -1].forEach((s) => world.add(new THREE.Mesh(polyFace([[s * PR, 0], [s * PR, -PD], [s * R0, -PD], [s * R0, 0]], 0), m.lining)));
    world.add(new THREE.Mesh(polyFace([[-R0, -PD], [R0, -PD], [R0, -PD - LIN], [-R0, -PD - LIN]], 0), m.lining));

    // --- стена тени: трапеция в сечении, уходит вглубь; контрфорсы с западной стороны
    const ws = new THREE.Shape([new THREE.Vector2(WX0, 0), new THREE.Vector2(WX1, 0), new THREE.Vector2(WX1, WALL_H), new THREE.Vector2(WX0 + 1.3, WALL_H)]);
    const wg = new THREE.ExtrudeGeometry(ws, {depth: -PZ + 4, bevelEnabled: false});
    wg.translate(0, 0, PZ - 4);
    {
      const p = wg.attributes.position;
      const nn = wg.attributes.normal;
      const u = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const front = Math.abs(nn.getZ(i)) > 0.5;
        u[i * 2] = front ? p.getX(i) : p.getZ(i);
        u[i * 2 + 1] = p.getY(i);
      }
      wg.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    }
    const wallMesh = new THREE.Mesh(wg, [m.wBrick, m.wAdobe]);
    world.add(wallMesh);
    for (let z = -8; z > PZ; z -= 13) {
      const b = new THREE.Shape([new THREE.Vector2(WX0 - 3, 0), new THREE.Vector2(WX0 + 0.2, 0), new THREE.Vector2(WX0 + 0.2, 7.5)]);
      const bg = new THREE.ExtrudeGeometry(b, {depth: 1.4, bevelEnabled: false});
      bg.translate(0, 0, z - 0.7);
      world.add(new THREE.Mesh(bg, m.wAdobe));
    }

    // --- бассейн: дно, бортики (бортик у среза — срезан в z=0)
    world.add(new THREE.Mesh(box(PX0 - 0.6, PX1 + 0.6, 0, PFLOOR, PZ - 0.6, 0), m.mud));
    world.add(new THREE.Mesh(box(PX0 - 0.6, PX0, PFLOOR, 1.0, PZ - 0.6, 0), m.adobeDark));
    world.add(new THREE.Mesh(box(PX1, PX1 + 0.6, PFLOOR, 1.0, PZ - 0.6, 0), m.adobeDark));
    world.add(new THREE.Mesh(box(PX0, PX1, PFLOOR, 1.0, PZ - 0.6, PZ), m.adobeDark));
    // жёлоб от выхода каната к бассейну
    world.add(new THREE.Mesh(box(PX1 + 0.6, QX0 + 1, 0, 0.7, -3.4, -1.4), m.adobeDark));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(QX0 + 1 - PX1 - 0.6, 1.2), m.flume);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set((PX1 + 0.6 + QX0 + 1) / 2, 0.75, -2.4);
    fl.renderOrder = 2;
    world.add(fl);
    // голова каната: глинобитная будка с аркой
    world.add(new THREE.Mesh(box(QX0 - 0.5, QX0 + 4, 0, 2.6, -7, -3.4), m.adobeDark));
    const hd = new THREE.Mesh(new THREE.SphereGeometry(2, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), m.adobe);
    hd.position.set(QX0 + 1.75, 2.6, -5.2);
    world.add(hd);

    // --- канат на срезе: тоннель (тёмный) с водой по дну, обводка, шахты к поверхности
    {
      const top = (x: number) => qY(x) + QH;
      const pts: [number, number][] = [];
      const X = [QX0, QX1];
      pts.push([X[0], qY(X[0])], [X[1], qY(X[1])], [X[1], top(X[1])], [X[0], top(X[0])]);
      const rim: [number, number][] = [[X[0] - 0.3, qY(X[0]) - 0.3], [X[1] + 0.3, qY(X[1]) - 0.3], [X[1] + 0.3, top(X[1]) + 0.3], [X[0] - 0.3, top(X[0]) + 0.3]];
      const g = new THREE.Group();
      g.add(new THREE.Mesh(polyFace(rim, ZRIM), m.qRim));
      g.add(new THREE.Mesh(polyFace(pts, ZQ), m.qDark));
      const wpts: [number, number][] = [[X[0], qY(X[0]) + 0.08], [X[1], qY(X[1]) + 0.08], [X[1], qY(X[1]) + 0.45], [X[0], qY(X[0]) + 0.45]];
      g.add(new THREE.Mesh(polyFace(wpts, ZQW), m.qWater));
      // шахты и кольца отвала
      const mounds: THREE.BufferGeometry[] = [];
      SHAFTS.forEach((xs, k) => {
        const gt = ground(xs, 0);
        const yb = qY(xs) + QH;
        g.add(new THREE.Mesh(polyFace([[xs - 0.85, yb], [xs + 0.85, yb], [xs + 0.85, gt], [xs - 0.85, gt]], ZRIM), m.qRim));
        g.add(new THREE.Mesh(polyFace([[xs - 0.55, yb - 0.05], [xs + 0.55, yb - 0.05], [xs + 0.55, gt + 0.4], [xs - 0.55, gt + 0.4]], ZQ), m.qDark));
        const rh = 1.3 + (k % 3) * 0.25;
        const rr2 = 3.2 + (k % 2) * 0.6;
        const mp: [number, number][] = [[0.7, gt + 0.4], [0.9, gt + rh], [1.6, gt + rh * 1.05], [rr2 * 0.7, gt + rh * 0.6], [rr2, gt - 0.4], [0.7, gt - 0.4], [0.7, gt + 0.4]];
        const mg = halfLathe(mp.map(([rad, y]) => [rad, y]) as [number, number][], 20);
        mg.translate(xs, 0, 0);
        mounds.push(mg);
        // срез кольца отвала в z=0: низ строго по рельефу (без наложения на лицо земли)
        const bump = (x: number) => {
          const d = Math.abs(x - xs);
          if (d < 0.9 || d > rr2) return 0;
          return d < 1.6 ? lerp(rh, rh * 1.05, (d - 0.9) / 0.7) : d < rr2 * 0.7 ? lerp(rh * 1.05, rh * 0.6, (d - 1.6) / (rr2 * 0.7 - 1.6)) : lerp(rh * 0.6, 0, (d - rr2 * 0.7) / (rr2 * 0.3));
        };
        [-1, 1].forEach((s) => {
          const a = Math.min(xs + s * 0.9, xs + s * rr2);
          const b = Math.max(xs + s * 0.9, xs + s * rr2);
          const ptsC: [number, number][] = [];
          for (let x = a; x <= b + 1e-6; x += 0.1) ptsC.push([x, ground(x, 0) + bump(x)]);
          for (let x = b; x >= a - 1e-6; x -= 0.1) ptsC.push([x, ground(x, 0)]);
          g.add(new THREE.Mesh(polyFace(ptsC, 0), m.cSand));
        });
      });
      g.add(new THREE.Mesh(mergeGeometries(mounds), m.adobeDark));
      world.add(g);
    }

    // --- сад у выхода каната (зелень там, где вода) — низкая ограда и кроны
    {
      const gx0 = 70;
      const gx1 = 170;
      const gz0 = -120;
      const gz1 = -205;
      [[gx0, gx1, gz0, gz0 + 0.8], [gx0, gx1, gz1 - 0.8, gz1], [gx0, gx0 + 0.8, gz1, gz0], [gx1 - 0.8, gx1, gz1, gz0]].forEach(([a, b, c, d]) =>
        world.add(new THREE.Mesh(box(a, b, 0, 2.2, c, d), m.adobeDark)),
      );
      const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), m.canopy, 120);
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 6), m.trunk, 120);
      const dm = new THREE.Object3D();
      let ci = 0;
      const cA = new THREE.Color('#3d5a2a');
      const cB = new THREE.Color('#5d7a34');
      for (let x = gx0 + 6; x < gx1 - 4; x += 8)
        for (let z = gz0 - 6; z > gz1 + 4; z -= 8) {
          const s = 2.4 + r() * 1.2;
          const xx = x + (r() - 0.5) * 2;
          const zz = z + (r() - 0.5) * 2;
          dm.position.set(xx, 2.2 + s * 0.6, zz);
          dm.scale.set(s, s * 0.85, s);
          dm.updateMatrix();
          crowns.setMatrixAt(ci, dm.matrix);
          crowns.setColorAt(ci, cc.copy(cA).lerp(cB, r()));
          dm.position.set(xx, 1.3, zz);
          dm.scale.set(1, 2.6, 1);
          dm.updateMatrix();
          trunks.setMatrixAt(ci, dm.matrix);
          ci++;
        }
      crowns.count = ci;
      trunks.count = ci;
      world.add(crowns, trunks);
    }

    // --- городок слева вдали: глинобитные дома с куполами и ветряными башнями
    {
      const town = new THREE.Group();
      const placed: [number, number, number][] = [];
      for (let k = 0; k < 400 && placed.length < 46; k++) {
        const x = -420 + r() * 300;
        const z = -140 - r() * 340;
        const w = 8 + r() * 8;
        const d = 8 + r() * 7;
        const rad = Math.hypot(w, d) / 2 + 2.5;
        if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + rad)) continue;
        placed.push([x, z, rad]);
        const h0 = ground(x, z);
        const hs = makeHouse(m, w, d, 4 + r() * 3, r() < 0.3, placed.length);
        hs.position.set(x, h0 - 0.3, z);
        hs.rotation.y = (r() - 0.5) * 0.3;
        town.add(hs);
      }
      world.add(town);
    }

    // --- облака (редкие, высоко) и ночное небо: звёзды и луна
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(500 + i), color: '#fff3e4', transparent: true, opacity: 0.7, depthWrite: false, fog: false}));
      s.scale.set(520 + r() * 300, 120 + r() * 60, 1);
      s.position.set(-2800 + i * 760 + r() * 200, 420 + r() * 300, -2900 - r() * 500);
      world.add(s);
      clouds.push(s);
    }

    shadowAll(world);
    land.castShadow = false;
    return {m, world, clouds, wallMesh, dome, cache: new Map<string, THREE.Object3D>()};
  }, []);

// небо, звёзды, луна, свет — вокруг камеры
const useSkyLights = () =>
  useMemo(() => {
    const skyDay = makeSky(DAY.sky, DAY.sun);
    skyDay.renderOrder = -10;
    const skyNight = makeSky(NIGHT.sky, MOON_SKY, 0.999);
    skyNight.renderOrder = -9;
    const skyG = new THREE.Group();
    skyG.add(skyDay, skyNight);
    // звёзды
    const r = rng(99);
    const sp: number[] = [];
    for (let i = 0; i < 1400; i++) {
      const u = r() * Math.PI * 2;
      const e = Math.asin(0.04 + r() * 0.96);
      sp.push(Math.cos(u) * Math.cos(e) * 1500, Math.sin(e) * 1500, Math.sin(u) * Math.cos(e) * 1500);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({color: '#f4f6ff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false});
    const stars = new THREE.Points(sg, starMat);
    stars.renderOrder = -8;
    stars.frustumCulled = false;
    skyG.add(stars);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({map: moonTex(), transparent: true, opacity: 0, fog: false, depthWrite: false}));
    moon.position.copy(MOON_SKY).multiplyScalar(1400);
    moon.scale.set(150, 150, 1);
    moon.renderOrder = -7;
    skyG.add(moon);
    const center = new THREE.Vector3(30, 0, -40);
    const sun = new THREE.DirectionalLight(DAY.sunCol, DAY.sunI);
    sun.position.copy(center).addScaledVector(DAY.sun, 400);
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -150;
    sc.right = 150;
    sc.top = 150;
    sc.bottom = -150;
    sc.near = 10;
    sc.far = 900;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.3;
    const moonL = new THREE.DirectionalLight(NIGHT.moonCol, 0);
    moonL.position.copy(center).addScaledVector(NIGHT.moon, 400);
    moonL.target.position.copy(center);
    const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiI);
    const bounce = new THREE.DirectionalLight('#ffb98a', DAY.bounceI);
    bounce.position.set(center.x + 60, center.y + 45, center.z + 300);
    bounce.target.position.copy(center);
    return {skyG, skyNight, starMat, moon, sun, moonL, hemi, bounce};
  }, []);

// ---------- сцена ----------
const YakhWorld: React.FC<{P: Record<string, any>; dur: number}> = ({P, dur}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const W0 = useWorld();
  const SL = useSkyLights();
  const {m} = W0;
  const p = clamp01(frame / Math.max(1, dur));
  const t = frame / fps;
  const dyn = useMemo(() => new THREE.Group(), []);
  const cached = <T extends THREE.Object3D>(key: string, make: () => T): T => {
    let o = W0.cache.get(key) as T | undefined;
    if (!o) {
      o = make();
      o.traverse((c) => (c.userData.cached = true));
      W0.cache.set(key, o);
    }
    return o;
  };

  useLayoutEffect(() => {
    scene.add(W0.world, dyn, SL.skyG, SL.sun, SL.sun.target, SL.moonL, SL.moonL.target, SL.hemi, SL.bounce, SL.bounce.target);
    scene.fog = new THREE.Fog(DAY.fog, DAY.fogNear, DAY.fogFar);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const sk = makeSky(DAY.sky, DAY.sun);
    sk.scale.setScalar(0.05);
    envScene.add(sk);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    return () => {
      scene.remove(W0.world, dyn, SL.skyG, SL.sun, SL.sun.target, SL.moonL, SL.moonL.target, SL.hemi, SL.bounce, SL.bounce.target);
      scene.environment = null;
    };
  }, []);

  useLayoutEffect(() => {
    dyn.children.slice().forEach((c: any) => {
      dyn.remove(c);
      if (!c.userData.cached) c.geometry?.dispose?.();
    });
    const add = (o: THREE.Object3D) => dyn.add(o);
    const q = (v: number, s = 20) => Math.round(v * s) / s;

    // --- день/ночь
    const n = clamp01(range(P.night, p));
    SL.sun.intensity = DAY.sunI * (1 - n);
    SL.sun.castShadow = n < 0.97;
    SL.moonL.intensity = NIGHT.moonI * n;
    SL.hemi.color.set(DAY.hemiSky).lerp(col(NIGHT.hemiSky), n);
    SL.hemi.groundColor.set(DAY.hemiGround).lerp(col(NIGHT.hemiGround), n);
    SL.hemi.intensity = lerp(DAY.hemiI, NIGHT.hemiI, n);
    SL.bounce.intensity = DAY.bounceI * (1 - n) + 0.12 * n;
    (SL.skyNight.material as THREE.MeshBasicMaterial).opacity = n;
    SL.skyNight.visible = n > 0.003;
    SL.starMat.opacity = smooth(0.45, 0.95, n);
    (SL.moon.material as THREE.SpriteMaterial).opacity = smooth(0.3, 0.9, n);
    const fog = scene.fog as THREE.Fog;
    fog.color.set(DAY.fog).lerp(col(NIGHT.fog), n);
    fog.near = lerp(DAY.fogNear, NIGHT.fogNear, n);
    fog.far = lerp(DAY.fogFar, NIGHT.fogFar, n);
    (scene as any).environmentIntensity = lerp(1, 0.2, n);
    W0.clouds.forEach((c, i) => {
      c.position.x = -2800 + i * 760 + t * 3;
      (c.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - n * 0.85);
      (c.material as THREE.SpriteMaterial).color.set('#fff3e4').lerp(col('#59607e'), n);
    });

    // --- лёд в яме: слои блоков, между ними солома
    const ice = clamp01(range(P.ice, p) / ICE_MAX) * ICE_MAX;
    const iceR = PR - 0.04;
    for (let k = 0; k < Math.ceil(ice - 1e-4); k++) {
      const f = clamp01(ice - k);
      const y0 = -PD + k * (ICE_L + STRAW);
      const hgt = q(ICE_L * f, 10);
      if (hgt < 0.05) continue;
      add(
        cached(`ice${k}_${hgt}`, () => {
          const g = new THREE.Group();
          const cyl = new THREE.Mesh(new THREE.CylinderGeometry(iceR, iceR, hgt, 40, 1, false, Math.PI / 2, Math.PI), [m.iceTop, m.iceTop, m.iceTop]);
          cyl.position.y = y0 + hgt / 2;
          g.add(cyl);
          const fg = new THREE.PlaneGeometry(iceR * 2, hgt);
          const uv = fg.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * iceR * 2) / 6 + k * 0.37, (uv.getY(i) * hgt) / ICE_L + (1 - hgt / ICE_L));
          const fr = new THREE.Mesh(fg, m.ice);
          fr.position.set(0, y0 + hgt / 2, 0);
          g.add(fr);
          if (f >= 0.999 && k < ICE_MAX - 1) {
            // солома поверх готового слоя
            const st = new THREE.Mesh(new THREE.CylinderGeometry(iceR, iceR, STRAW, 40, 1, false, Math.PI / 2, Math.PI), m.straw);
            st.position.y = y0 + ICE_L + STRAW / 2;
            g.add(st);
            const sf = new THREE.Mesh(new THREE.PlaneGeometry(iceR * 2, STRAW), m.straw);
            sf.position.set(0, y0 + ICE_L + STRAW / 2, 0);
            g.add(sf);
          }
          shadowAll(g);
          return g;
        }),
      );
    }
    const iceTopY = -PD + Math.floor(ice) * (ICE_L + STRAW) + clamp01(ice - Math.floor(ice)) * ICE_L;

    // --- бассейн: намороженные слои + текущий слой воды (растекается → замерзает); летом — сухое дно
    const dry = range(P.dry, p) > 0.5;
    const pv = dry ? 0 : Math.max(0, range(P.pool, p));
    const nl = Math.floor(pv + 1e-6);
    const fr = pv - nl;
    for (let k = 0; k < nl; k++) {
      add(
        cached(`pl${k}`, () => {
          const g = new THREE.Mesh(box(PX0, PX1, PFLOOR + k * PLAYER, PFLOOR + (k + 1) * PLAYER, PZ, 0), k % 2 ? m.poolIce2 : m.poolIce);
          g.receiveShadow = true;
          g.renderOrder = 1;
          return g;
        }),
      );
    }
    if (fr > 0.01) {
      // вода: тонкий слой; к утру мутнеет и белеет — лёд
      const spread = q(clamp01(fr / 0.35), 20);
      const len = Math.max(0.5, -PZ * spread);
      const frz = smooth(0.45, 0.95, fr);
      m.film.color.set('#5f9fb0').lerp(col('#d4ebf2'), frz);
      m.film.opacity = lerp(0.85, 0.95, frz);
      m.film.roughness = lerp(0.08, 0.3, frz);
      const y0 = PFLOOR + nl * PLAYER;
      add(
        cached(`film${nl}_${spread}`, () => {
          const g = new THREE.Mesh(box(PX0, PX1, y0, y0 + PLAYER - 0.004, -len, 0), m.film);
          g.renderOrder = 2;
          return g;
        }),
      );
    }
    if (dry) {
      add(cached('dryPool', () => new THREE.Mesh(box(PX0, PX1, PFLOOR, PFLOOR + 0.04, PZ, 0), m.dryMud)));
    }
    // разметка блоков на льду
    const gridA = dry ? 0 : range(P.grid, p);
    m.grid.opacity = 0.8 * gridA;
    if (gridA > 0.01 && nl > 0) {
      const y = PFLOOR + nl * PLAYER + 0.02;
      add(
        cached(`grid${nl}`, () => {
          const g = new THREE.Mesh(new THREE.PlaneGeometry(PX1 - PX0, -PZ), m.grid);
          g.rotation.x = -Math.PI / 2;
          g.position.set((PX0 + PX1) / 2, y, PZ / 2);
          g.renderOrder = 3;
          return g;
        }),
      );
    }
    // вода в жёлобе течёт, когда открыт канат
    const flow = range(P.flow, p);
    (m.film.map as THREE.Texture).offset.set(-t * 0.02, t * 0.01);
    (m.flume.map as THREE.Texture).offset.set(-t * 0.25 * Math.max(0.15, flow), 0);

    // --- стрелки: шеврон
    const chevG = cached('chev', () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0.7);
      s.lineTo(0.7, 0);
      s.lineTo(0, -0.7);
      s.lineTo(-0.35, -0.7);
      s.lineTo(0.35, 0);
      s.lineTo(-0.35, 0.7);
      s.closePath();
      return new THREE.Mesh(new THREE.ShapeGeometry(s), m.flow);
    }).geometry;
    const chev = (mat: THREE.Material, x: number, y: number, z: number, dir: number, sc: number, ro = 6) => {
      const c = new THREE.Mesh(chevG, mat);
      c.userData.cached = true;
      c.position.set(x, y, z);
      c.scale.setScalar(sc);
      c.rotation.z = dir;
      c.renderOrder = ro;
      add(c);
    };
    // поток в канате — к выходу (−x)
    if (flow > 0.02) {
      for (let k = 0; k < 14; k++) {
        const x = 560 - ((k * 36 + t * 14) % 500);
        if (x < QX0 + 2) continue;
        chev(m.flow, x, qY(x) + 0.75, ZARR, Math.PI, 0.9 * flow);
      }
    }
    // ночью тепло воды уходит в небо: волны вверх над бассейном
    const heat = range(P.heat, p);
    if (heat > 0.02) {
      const rr = rng(7);
      for (let k = 0; k < 26; k++) {
        const x = PX0 + 1 + rr() * (PX1 - PX0 - 2);
        const z = -6 - rr() * 80;
        const u = (rr() + t * 0.22) % 1;
        const y = 1.2 + u * 26;
        const s = 1.1 * heat * (1 - smooth(0.6, 1, u)) * smooth(0, 0.12, u);
        if (s < 0.05) continue;
        chev(m.heat, x + Math.sin(t * 3 + k) * 0.4, y, z, Math.PI / 2, s, 7);
      }
    }
    // «купол — труба»: тёплый воздух вверх и наружу, холод опускается к льду
    const air = range(P.air, p);
    if (air > 0.02) {
      const pathPt = (pts: [number, number][], u: number): [number, number, number] => {
        let Ltot = 0;
        const ls = pts.slice(1).map((b, k) => {
          const l = Math.hypot(b[0] - pts[k][0], b[1] - pts[k][1]);
          Ltot += l;
          return l;
        });
        let d = u * Ltot;
        for (let k = 0; k < ls.length; k++) {
          if (d <= ls[k]) {
            const kk = d / ls[k];
            const a = pts[k];
            const b = pts[k + 1];
            return [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk), Math.atan2(b[1] - a[1], b[0] - a[0])];
          }
          d -= ls[k];
        }
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        return [b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0])];
      };
      [-1, 1].forEach((s) => {
        const warmP: [number, number][] = [[s * 5.5, 0.6], [s * 4.2, 7], [s * 1.8, 13.5], [0, 16.8], [0, 25]];
        for (let k = 0; k < 7; k++) {
          const u = (k / 7 + t * 0.12) % 1;
          const [x, y, a] = pathPt(warmP, u);
          chev(m.warm, x, y, -1.6, a, 1.4 * air * (1 - smooth(0.88, 1, u)) * smooth(0, 0.06, u));
        }
        const coldP: [number, number][] = [[s * 6.4, 8], [s * 6.2, 3], [s * 4.5, iceTopY + 0.6]];
        for (let k = 0; k < 4; k++) {
          const u = (k / 4 + t * 0.08) % 1;
          const [x, y, a] = pathPt(coldP, u);
          chev(m.cold, x, y, -1.6, a, 1.3 * air * (1 - smooth(0.85, 1, u)) * smooth(0, 0.1, u));
        }
      });
    }

    // --- подсветка частей для вопроса в финале
    const hl = P.hl ?? {};
    const pulse = (k: string) => (hl[k] ? smooth(hl[k][0], hl[k][0] + 0.06, p) * (1 - smooth(hl[k][1] - 0.06, hl[k][1], p)) : 0);
    const hw = pulse('wall');
    const hdm = pulse('dome');
    const hq = pulse('qanat');
    [m.domeMat, m.brick, m.wBrick, m.wAdobe].forEach((mt: THREE.MeshStandardMaterial) => mt.emissive.set('#ffb070'));
    m.domeMat.emissiveIntensity = 0.32 * hdm;
    m.brick.emissiveIntensity = 0.32 * hdm;
    m.wBrick.emissiveIntensity = 0.32 * hw;
    m.wAdobe.emissiveIntensity = 0.32 * hw;
    m.qWater.emissiveIntensity = 0.3 + 1.2 * hq;
    m.qRim.emissive.set('#ffd9a0');
    m.qRim.emissiveIntensity = 0.5 * hq;

    // --- камера (с промежуточной точкой via)
    const cs = (P.cam ?? ['yakh', 'yakh']).map((c: string | Cam) => cam(c));
    const c0 = cs[0];
    const c1 = cs[cs.length - 1];
    const q0 = clamp01((p - (P.camDelay ?? 0)) / (P.camDur ?? 1));
    let ca = c0;
    let cb = c1;
    let kc = easeInOut(q0);
    if (P.via) {
      const v = cam(P.via);
      const va = P.viaAt ?? 0.5;
      if (q0 < va) {
        cb = v;
        kc = easeInOut(q0 / va);
      } else {
        ca = v;
        kc = easeInOut((q0 - va) / (1 - va));
      }
    }
    const pos = ca.pos.map((v, i) => lerp(v, cb.pos[i], kc));
    const look = ca.look.map((v, i) => lerp(v, cb.look[i], kc));
    const fov = lerp(ca.fov ?? 45, cb.fov ?? 45, kc);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== fov || pc.far !== FAR || pc.near !== NEAR) {
      pc.fov = fov;
      pc.near = NEAR;
      pc.far = FAR;
      pc.updateProjectionMatrix();
    }
    SL.skyG.position.copy(camera.position);
    // мелочь тоньше пикселя вдали (обводка каната, шахты) — гасим по расстоянию
    const dCut = Math.hypot(pos[1], pos[2]);
    m.qRim.opacity = 1 - smooth(260, 420, dCut);
    m.qRim.visible = m.qRim.opacity > 0.01;
  }, [frame]);

  return null;
};

// цветокор поверх кадра: смешивание дневного и ночного рецептов
const mixHex = (a: string, b: string, k: number) => '#' + col(a).lerp(col(b), k).getHexString();
let grainUrl = '';
const grainTile = () => {
  if (grainUrl) return grainUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const im = g.createImageData(256, 256);
  let s = 12345;
  for (let i = 0; i < im.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 8) & 255;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  grainUrl = c.toDataURL('image/png');
  return grainUrl;
};
const Grade: React.FC<{n: number}> = ({n}) => {
  const frame = useCurrentFrame();
  const A = DAY.grade;
  const B = NIGHT.grade;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: mixHex(A.shadow, B.shadow, n), mixBlendMode: 'screen', opacity: lerp(A.shadowAmt, B.shadowAmt, n)}} />
      <AbsoluteFill style={{background: mixHex(A.high, B.high, n), mixBlendMode: 'multiply', opacity: lerp(A.highAmt, B.highAmt, n)}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(10,6,20,${lerp(A.vignette, B.vignette, n)}) 100%)`}} />
      <AbsoluteFill
        style={{
          mixBlendMode: 'overlay',
          opacity: lerp(A.grain, B.grain, n),
          backgroundImage: `url(${grainTile()})`,
          backgroundSize: '256px 256px',
          backgroundPosition: `${(frame * 97) % 256}px ${(frame * 61) % 256}px`,
        }}
      />
    </AbsoluteFill>
  );
};

export const YakhScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const n = clamp01(range(P.night, clamp01(frame / Math.max(1, durationInFrames))));
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} shadows camera={{fov: 45, position: [0, 30, 150], near: NEAR, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <YakhWorld P={P} dur={durationInFrames} />
      </ThreeCanvas>
      <Grade n={n} />
      {P.banner ? (
        <div
          style={{
            position: 'absolute',
            left: 50,
            right: 50,
            top: P.bannerY ?? 300,
            textAlign: 'center',
            fontFamily: ROUND,
            fontWeight: 700,
            fontSize: P.bannerSize ?? 64,
            lineHeight: 1.15,
            whiteSpace: 'pre-line',
            color: '#FFD54A',
            WebkitTextStroke: '8px #3a2a00',
            paintOrder: 'stroke fill',
            textTransform: 'uppercase',
            opacity: bIn,
            transform: `scale(${0.85 + 0.15 * bIn})`,
          }}
        >
          {P.banner}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
