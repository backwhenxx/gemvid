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

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «Маяк»: скалистый мыс у моря, сумерки → ночь. 1 единица = 1 м.
// Земля и море целые (360°); в разрезе только башня маяка: оставлена задняя половина (z ≤ 0),
// видно винтовую лестницу, трубу с гирей, часовой механизм, чашу с ртутью. Линза — целая и вращается.
// Свет: солнце только что село справа-сзади (оранжевая полоса над морем), дальше ночь с луной;
// единственный тёплый акцент — огонь маяка, окна и фонарь смотрителя.
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const FAR = 7000;

// башня
const GY = 20; // плато мыса
const TY0 = GY + 0.35; // низ стены (на цоколе)
const TOPY = 42; // верх башни = низ галереи
const TH = TOPY - GY;
const RB = 3.6;
const RT = 2.6;
const roT = (y: number) => lerp(RB, RT, clamp01((y - GY) / TH));
const riT = (y: number) => roT(y) - lerp(0.9, 0.55, clamp01((y - GY) / TH));
const ROOM = 38.3; // пол механизма (низ плиты)
const ROOMF = ROOM + 0.3; // верх пола
const LC = 44.3; // центр линзы
const LR = 0.62; // радиус линзы
const PERIOD = 20; // оборот линзы, с (2 панели → вспышка раз в 10 с)
const STEP_H = 0.21;
const DTH = (Math.PI * 2) / 16;
const NSTEPS = Math.floor((ROOM - TY0) / STEP_H);
const TH0 = Math.PI - (NSTEPS - 1) * DTH; // последняя ступень — у люка сзади (θ = π)
// гиря
const W_TOP = 37.0;
const W_BOT = TY0 + 0.75;
const W_H = 1.1;
// дом смотрителя
const HX0 = -22;
const HX1 = -12;
const HZ0 = -19;
const HZ1 = -13;
const HWALL = 3.4;
// корабль
const shipPos = (t: number): [number, number] => [165, -150 - 3 * t];

// ---------- рельеф: мыс, обрыв, море ----------
const n2 = (x: number, z: number) => Math.sin(x * 0.013 + 1.3) * Math.cos(z * 0.011 - 0.4) + 0.5 * Math.sin(x * 0.031 + z * 0.023) + 0.25 * Math.sin(x * 0.071 - z * 0.057 + 2);
const coastX = (z: number) => {
  const a = Math.abs(z);
  const base = a < 250 ? 46 - 0.00092 * a * a : -11.5 - 0.42 * (a - 250);
  return base + 7 * Math.sin(z * 0.021 + 1) + 4 * Math.sin(z * 0.057 + 2) + 18 * Math.sin(z * 0.0043);
};
const landH = (x: number, z: number) => {
  const r = Math.hypot(x, z);
  const flat = smooth(55, 28, r);
  const ang = Math.atan2(z, x);
  const hills = 3 * n2(x, z) + 30 * smooth(-100, -1500, x) + 22 * (0.5 + 0.5 * Math.sin(x * 0.004 + z * 0.003)) * smooth(-200, -1200, x) + 90 * smooth(1800, 4500, r) * (0.6 + 0.4 * Math.sin(ang * 5 + 1));
  return GY + hills * (1 - flat);
};
const ground = (x: number, z: number) => {
  const d = coastX(z) - x;
  if (d >= 0) return lerp(-3, landH(x, z), smooth(0, 11, d)) + 1.1 * Math.sin(z * 0.37 + x * 0.21) * smooth(0, 4, d) * (1 - smooth(6, 11, d));
  return -3 - 22 * smooth(0, 260, -d) + 0.8 * n2(x * 2, z * 2);
};

// ---------- камеры ----------
type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number; rel?: boolean};
const CAMS: Record<string, Cam> = {
  lensHook: {pos: [2.3, 44.5, 2.9], look: [0, 44.25, 0]},
  lensHook2: {pos: [3.1, 45.0, 4.1], look: [0, 44.1, 0]},
  top: {pos: [10, 47, 16], look: [0, 41.5, -1]},
  wide: {pos: [80, 36, 125], look: [8, 30, -20]},
  wide2: {pos: [70, 40, 110], look: [5, 31, -18]},
  bath: {pos: [0.95, 43.34, 1.65], look: [0.55, 43.2, -0.1]},
  bath2: {pos: [0.72, 43.3, 1.05], look: [0.56, 43.22, -0.1]},
  lensSide: {pos: [2.0, 44.6, 2.5], look: [0, 44.3, 0]},
  rays: {pos: [0.9, 44.3, 3.6], look: [1.0, 44.3, 0]},
  far: {pos: [-30, 60, 22], look: [260, 22, -140]},
  sweep: {pos: [-70, 120, 110], look: [70, 10, -70]},
  seaLow: {pos: [170, 42, 70], look: [0, 29, -6]},
  shipView: {pos: [-8, 48.5, 14], look: [165, 4, -265]},
  shipView2: {pos: [-6, 48, 10], look: [165, 6, -272]},
  lensBack: {pos: [2.6, 44.9, 3.3], look: [0, 44.0, 0]},
  wTop: {pos: [2.6, 37.4, 6.5], look: [0, 36.6, -0.4]},
  wMid: {pos: [2.9, 29.5, 8.0], look: [0, 28.8, -0.4]},
  clock: {pos: [1.25, 39.35, 2.45], look: [0.05, 39.2, -0.3]},
  clock2: {pos: [1.6, 39.55, 2.9], look: [0.0, 39.15, -0.3]},
  cut: {pos: [11, 31, 30], look: [0, 30.5, -1]},
  cutLow: {pos: [8, 24, 22], look: [0, 25, -1]},
  hatch: {pos: [1.8, 39.6, 3.4], look: [0.2, 38.9, -0.6]},
  night: {pos: [60, 42, 105], look: [2, 33, -18]},
  final: {pos: [120, 62, 215], look: [10, 32, -40]},
  final2: {pos: [135, 70, 240], look: [10, 33, -45]},
  cover: {pos: [6.5, 43.5, 11], look: [0, 41.2, -1]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.wide : c);
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

// ---------- свет: сумерки ↔ ночь ----------
const SUN = new THREE.Vector3(0.62, -0.03, -0.78).normalize(); // солнце за горизонтом справа-сзади
const RIM = new THREE.Vector3(0.75, 0.25, -0.62).normalize();
const MOON_SKY = new THREE.Vector3(-0.38, 0.36, -0.85).normalize();
const MOON_L = new THREE.Vector3(-0.35, 0.65, 0.68).normalize();
const DUSK = {
  sky: {top: '#1c2a58', mid: '#56699a', horizon: '#eea46e', glow: '#ffcf8c', glowSize: 5},
  fog: '#55618a',
  fogNear: 320,
  fogFar: 4200,
  hemiSky: '#8494c4',
  hemiGround: '#433a30',
  hemiI: 0.95,
  rimI: 0.95,
  grade: {shadow: '#1c2448', shadowAmt: 0.1, high: '#ffe2c4', highAmt: 0.07, vignette: 0.38, grain: 0.05},
};
const NIGHT = {
  sky: {top: '#040819', mid: '#0f1a3c', horizon: '#2f3a66', glow: '#56638f', glowSize: 5},
  fog: '#1b2242',
  fogNear: 260,
  fogFar: 3200,
  hemiSky: '#43528a',
  hemiGround: '#211e1b',
  hemiI: 0.7,
  moonI: 1.0,
  grade: {shadow: '#0b1030', shadowAmt: 0.14, high: '#d6e2ff', highAmt: 0.1, vignette: 0.46, grain: 0.06},
};
const col = (c: string) => new THREE.Color(c);
const makeSky = (S: typeof DUSK.sky, dir: THREE.Vector3, opacity = 1) => {
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
    if (e <= 0.0) c.copy(hor).lerp(mid, 0.35);
    else if (e < 0.16) c.copy(hor).lerp(mid, e / 0.16);
    else c.copy(mid).lerp(top, Math.min(1, (e - 0.16) / 0.5));
    const d = Math.max(0, v.dot(dir));
    c.lerp(glow, Math.min(0.85, Math.pow(d, S.glowSize) * 0.85 * (1 - Math.min(1, Math.max(0, e) * 2.5))));
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
// штукатурка (512 px = 4 м), мягкие потёки от дождя
const plasterTex = (base: string, seed: number) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 2500, ['rgba(0,0,0,0.035)', 'rgba(255,255,255,0.05)'], seed, [2, 9]);
  const r = rng(seed + 1);
  for (let i = 0; i < 26; i++) {
    const x = r() * 512;
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(60,55,50,0)');
    gr.addColorStop(0.5, `rgba(60,55,50,${0.04 + r() * 0.05})`);
    gr.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 3 + r() * 10, 512);
  }
  return tex(c);
};
// кладка на срезе стены: гранитные блоки (512 px = 3 м)
const masonryTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#8c8780';
  g.fillRect(0, 0, 512, 512);
  const r = rng(5);
  const bh = 512 / 10;
  for (let row = 0; row < 10; row++) {
    let x = row % 2 ? -50 : 0;
    while (x < 512) {
      const w = 80 + r() * 60;
      const v = 0.85 + r() * 0.25;
      g.fillStyle = `rgb(${Math.round(168 * v)},${Math.round(160 * v)},${Math.round(150 * v)})`;
      g.fillRect(x + 2, row * bh + 2, w - 4, bh - 4);
      x += w;
    }
  }
  speckle(g, 512, 512, 5000, ['rgba(40,35,30,0.18)', 'rgba(255,255,255,0.12)', 'rgba(120,100,90,0.15)'], 7, [0.6, 1.6]);
  return tex(c);
};
const stoneTex = (base: string, seed: number) => {
  const [c, g] = cv(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 2400, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)', 'rgba(90,80,70,0.15)'], seed, [0.6, 2.2]);
  return tex(c);
};
const grassTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 3500, ['rgba(40,60,20,0.16)', 'rgba(255,255,220,0.12)', 'rgba(90,60,70,0.12)'], 13, [0.6, 2]);
  return tex(c);
};
const ironTex = () => {
  const [c, g] = cv(128, 128);
  g.fillStyle = '#3a3c40';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 700, ['rgba(0,0,0,0.25)', 'rgba(120,90,70,0.2)', 'rgba(255,255,255,0.06)'], 21, [0.5, 1.6]);
  return tex(c);
};
// гиря: чугунные диски с бороздками
const discsTex = () => {
  const [c, g] = cv(64, 256);
  g.fillStyle = '#7a7d83';
  g.fillRect(0, 0, 64, 256);
  for (let k = 0; k < 6; k++) {
    const gr = g.createLinearGradient(0, k * 42 + 30, 0, k * 42 + 48);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, k * 42 + 30, 64, 18);
  }
  speckle(g, 64, 256, 200, ['rgba(0,0,0,0.2)', 'rgba(140,100,70,0.2)'], 3, [0.5, 1.4]);
  return tex(c);
};
// барабан с намотанным тросом
const drumTex = () => {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#7d7468';
  g.fillRect(0, 0, 256, 64);
  for (let x = -64; x < 256; x += 9) {
    g.strokeStyle = 'rgba(40,35,30,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 12, 64);
    g.stroke();
  }
  return tex(c);
};
// вал с полосой — видно, что крутится
const shaftTex = () => {
  const [c, g] = cv(64, 16);
  g.fillStyle = '#b8893a';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#5a3f16';
  g.fillRect(0, 0, 14, 16);
  return tex(c);
};
// концентрические кольца «бычьего глаза»
const ringsTex = () => {
  const [c, g] = cv(256, 256);
  g.clearRect(0, 0, 256, 256);
  for (let k = 12; k >= 0; k--) {
    const r = 8 + k * 9.6;
    const gr = g.createRadialGradient(128, 128, Math.max(0, r - 9.6), 128, 128, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(0.85, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0.95)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(128, 128, r, 0, 6.3);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const glowTex = (inner = 'rgba(255,240,205,1)', mid = 'rgba(255,200,120,0.45)') => {
  const [c, g] = cv(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.25, mid);
  gr.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const foamTex = () => {
  const [c, g] = cv(256, 128);
  const r = rng(31);
  for (let i = 0; i < 70; i++) {
    const x = 20 + r() * 216;
    const y = 30 + r() * 68;
    const s = 6 + r() * 16;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const tileTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#7a3b2d';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 21) {
    g.fillStyle = 'rgba(30,10,5,0.45)';
    g.fillRect(0, y, 256, 3);
    for (let x = (y / 21) % 2 ? 0 : 16; x < 256; x += 32) {
      g.fillStyle = 'rgba(30,10,5,0.25)';
      g.fillRect(x, y, 2, 21);
    }
  }
  speckle(g, 256, 256, 900, ['rgba(0,0,0,0.12)', 'rgba(255,200,170,0.1)'], 41, [0.6, 2]);
  return tex(c);
};
// иллюминаторы корабля (ряд огоньков)
const portTex = () => {
  const [c, g] = cv(256, 16);
  g.fillStyle = '#2a2b30';
  g.fillRect(0, 0, 256, 16);
  for (let x = 8; x < 256; x += 21) {
    g.fillStyle = '#ffd38a';
    g.beginPath();
    g.arc(x, 8, 4, 0, 6.3);
    g.fill();
  }
  return tex(c);
};
const moonTex = () => {
  const [c, g] = cv(256, 256);
  const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  gr.addColorStop(0, 'rgba(230,236,255,0.35)');
  gr.addColorStop(1, 'rgba(230,236,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#eef1fa';
  g.beginPath();
  g.arc(128, 128, 34, 0, 6.3);
  g.fill();
  speckle(g, 256, 256, 0, [], 1);
  g.fillStyle = 'rgba(150,160,185,0.35)';
  [[118, 120, 9], [140, 136, 6], [126, 146, 5], [142, 114, 4]].forEach(([x, y, s]) => {
    g.beginPath();
    g.arc(x, y, s, 0, 6.3);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// ---------- геометрия ----------
// полигон в плоскости XY на глубине z, uv = мировые x,y (метры)
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
// полу-тело вращения (z ≤ 0), uv в метрах: u — дуга, v — высота
const halfLathe = (pts: [number, number][], seg = 48, full = false) => {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, full ? 0 : Math.PI / 2, full ? Math.PI * 2 : Math.PI);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    uv[i * 2] = Math.atan2(x, z) * Math.max(r, 0.5);
    uv[i * 2 + 1] = p.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
// кольцевой сектор (вид сверху) от y0 до y1; θ: x = r·sinθ, z = r·cosθ (задняя половина: θ ∈ [π/2, 3π/2])
const annSector = (r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, seg = 24) => {
  const s = new THREE.Shape();
  const P = (r: number, a: number) => new THREE.Vector2(r * Math.sin(a), -r * Math.cos(a));
  const n = Math.max(2, Math.ceil(seg * ((a1 - a0) / Math.PI)));
  s.moveTo(P(r1, a0).x, P(r1, a0).y);
  for (let i = 1; i <= n; i++) {
    const v = P(r1, a0 + ((a1 - a0) * i) / n);
    s.lineTo(v.x, v.y);
  }
  if (r0 > 0.001) {
    for (let i = n; i >= 0; i--) {
      const v = P(r0, a0 + ((a1 - a0) * i) / n);
      s.lineTo(v.x, v.y);
    }
  } else s.lineTo(0, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth: y1 - y0, bevelEnabled: false, curveSegments: 1});
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  // uv в метрах: верх/низ — по xz, бока — по длине/высоте
  const p = g.attributes.position;
  const nn = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const up = Math.abs(nn.getY(i)) > 0.5;
    uv[i * 2] = up ? p.getX(i) : p.getX(i) + p.getZ(i);
    uv[i * 2 + 1] = up ? p.getZ(i) : p.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
// шестерня в плоскости XY (ось — z), толщина th
const gearGeo = (r: number, teeth: number, th: number, holes = 0) => {
  const s = new THREE.Shape();
  const depth = Math.min(0.03, r * 0.22);
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const da = (Math.PI * 2) / teeth;
    const pts: [number, number][] = [
      [r - depth, a0],
      [r - depth, a0 + da * 0.12],
      [r, a0 + da * 0.3],
      [r, a0 + da * 0.55],
      [r - depth, a0 + da * 0.72],
    ];
    pts.forEach(([rr, a], k) => {
      const x = rr * Math.cos(a);
      const y = rr * Math.sin(a);
      if (i === 0 && k === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  for (let h = 0; h < holes; h++) {
    const a = (h / holes) * Math.PI * 2 + 0.4;
    const hp = new THREE.Path();
    hp.absarc((r * 0.55) * Math.cos(a), (r * 0.55) * Math.sin(a), r * 0.2, 0, Math.PI * 2, true);
    s.holes.push(hp);
  }
  const g = new THREE.ExtrudeGeometry(s, {depth: th, bevelEnabled: false, curveSegments: 8});
  g.translate(0, 0, -th / 2);
  return g;
};
// неровный камень
const rockGeo = (seed: number) => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const r = rng(seed);
  const map = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = 0.75 + r() * 0.45;
      map.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
};

// линза Френеля: пояс с рёбрами, кольца призм сверху и снизу, два «бычьих глаза», латунный каркас
const makeLens = (m: Record<string, any>) => {
  const g = new THREE.Group();
  const belt: [number, number][] = [];
  for (let y = -0.32; y <= 0.32 + 1e-6; y += 0.04) {
    belt.push([LR - 0.02, y]);
    belt.push([LR + 0.01, y + 0.02]);
  }
  const glass: THREE.BufferGeometry[] = [new THREE.LatheGeometry(belt.map(([r, y]) => new THREE.Vector2(r, y)), 48)];
  const prism = (y: number, r: number) => {
    const pr = new THREE.LatheGeometry([new THREE.Vector2(r, y - 0.02), new THREE.Vector2(r + 0.04, y), new THREE.Vector2(r, y + 0.02), new THREE.Vector2(r - 0.01, y), new THREE.Vector2(r, y - 0.02)], 40);
    glass.push(pr);
  };
  for (let k = 0; k < 9; k++) {
    const y = 0.38 + k * 0.052;
    prism(y, LR * Math.sqrt(Math.max(0.05, 1 - Math.pow(y / 0.95, 2))));
  }
  for (let k = 0; k < 6; k++) {
    const y = -0.38 - k * 0.055;
    prism(y, LR * Math.sqrt(Math.max(0.05, 1 - Math.pow(y / 0.85, 2))));
  }
  const gm = new THREE.Mesh(mergeGeometries(glass), m.glass);
  gm.renderOrder = 8;
  g.add(gm);
  [1, -1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.27, 40), m.eye);
    e.position.set(s * (LR + 0.045), 0, 0);
    e.rotation.y = (s * Math.PI) / 2;
    e.renderOrder = 9;
    g.add(e);
  });
  // каркас: кольца и стойки (тонкие — гаснут вдали, см. fade)
  const frame = new THREE.Group();
  [0.35, -0.35, 0.84, -0.7].forEach((y) => {
    const rr = y > 0.5 ? 0.2 : y < -0.5 ? 0.33 : LR + 0.02;
    const t = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.016, 6, 40), m.brass);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    frame.add(t);
  });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), m.brass);
    bar.position.set((LR + 0.03) * Math.cos(a), 0, (LR + 0.03) * Math.sin(a));
    frame.add(bar);
  }
  g.add(frame);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.1, 16), m.brass);
  cap.position.y = 0.9;
  g.add(cap);
  return {g, frame};
};

// корабль: пароход, нос в −z
const makeShip = (m: Record<string, any>) => {
  const g = new THREE.Group();
  const s = new THREE.Shape([new THREE.Vector2(-4.5, -28), new THREE.Vector2(4.5, -28), new THREE.Vector2(4.6, 16), new THREE.Vector2(0, 30), new THREE.Vector2(-4.6, 16)]);
  const hg = new THREE.ExtrudeGeometry(s, {depth: 6.5, bevelEnabled: false});
  hg.rotateX(-Math.PI / 2);
  hg.translate(0, -3, 0);
  g.add(new THREE.Mesh(hg, [m.deck, m.hull]));
  [-1, 1].forEach((sd) => {
    const pt = new THREE.Mesh(new THREE.PlaneGeometry(36, 0.6), m.ports);
    pt.position.set(sd * 4.72, 1.6, 6);
    pt.rotation.y = (sd * Math.PI) / 2;
    g.add(pt);
  });
  g.add(new THREE.Mesh(box(-3.2, 3.2, 3.5, 6.3, -8, 9), m.house));
  g.add(new THREE.Mesh(box(-3.6, 3.6, 6.3, 8.4, -8, -3.5), m.house));
  [-1, 1].forEach((sd) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.5), m.ports);
    w.position.set(sd * 3.25, 4.9, 0.5);
    w.rotation.y = (sd * Math.PI) / 2;
    g.add(w);
  });
  const fun = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 6, 16), m.funnel);
  fun.position.set(0, 9.3, 3);
  g.add(fun);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1, 16), m.funnelBand);
  band.position.set(0, 11.0, 3);
  g.add(band);
  [-18, 17].forEach((z) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 18, 6), m.hull);
    mast.position.set(0, 12.5, z);
    g.add(mast);
  });
  return g;
};

// ---------- мир ----------
const useWorld = () =>
  useMemo(() => {
    const m: Record<string, any> = {
      white: new THREE.MeshStandardMaterial({map: plasterTex('#ece6da', 3), roughness: 0.9, side: THREE.DoubleSide}),
      red: new THREE.MeshStandardMaterial({map: plasterTex('#a2362c', 4), roughness: 0.85, side: THREE.DoubleSide}),
      inner: new THREE.MeshStandardMaterial({map: plasterTex('#cfc6b6', 5), roughness: 0.95, side: THREE.DoubleSide}),
      mason: new THREE.MeshStandardMaterial({map: masonryTex(), roughness: 0.95}),
      granite: new THREE.MeshStandardMaterial({map: stoneTex('#8f8a84', 9), roughness: 0.95}),
      step: new THREE.MeshStandardMaterial({map: stoneTex('#a59f95', 11), roughness: 0.9}),
      land: new THREE.MeshStandardMaterial({map: grassTex(), vertexColors: true, roughness: 1}),
      rock: new THREE.MeshStandardMaterial({map: stoneTex('#76726d', 15), roughness: 1, flatShading: true}),
      sea: new THREE.MeshPhysicalMaterial({map: waterTexture(), color: '#22506e', roughness: 0.28, metalness: 0, specularIntensity: 0.18, envMapIntensity: 0.3}),
      iron: new THREE.MeshStandardMaterial({map: ironTex(), roughness: 0.6, metalness: 0.55, side: THREE.DoubleSide}),
      ironDark: new THREE.MeshStandardMaterial({color: '#4a4c50', roughness: 0.8, side: THREE.DoubleSide}),
      lanternIron: new THREE.MeshStandardMaterial({color: '#2b2f2c', roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide}),
      roof: new THREE.MeshStandardMaterial({color: '#2f4a40', roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide}),
      brass: new THREE.MeshStandardMaterial({color: '#c39340', roughness: 0.32, metalness: 0.9}),
      bronze: new THREE.MeshStandardMaterial({color: '#7a5a34', roughness: 0.4, metalness: 0.8}),
      mercury: new THREE.MeshStandardMaterial({color: '#cdd3dc', roughness: 0.12, metalness: 0.9, envMapIntensity: 1.6, emissive: '#7d8796', emissiveIntensity: 0.15}),
      weight: new THREE.MeshStandardMaterial({map: discsTex(), color: '#a7adb5', roughness: 0.55, metalness: 0.25, emissive: '#ffb050', emissiveIntensity: 0}),
      drum: new THREE.MeshStandardMaterial({map: drumTex(), roughness: 0.6, metalness: 0.4}),
      shaft: new THREE.MeshStandardMaterial({map: shaftTex(), roughness: 0.35, metalness: 0.8}),
      cable: new THREE.MeshStandardMaterial({color: '#6d655a', roughness: 0.6, metalness: 0.4, transparent: true}),
      glass: new THREE.MeshStandardMaterial({color: '#d4efe9', emissive: '#ffcf7a', emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.04, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.8}),
      eye: new THREE.MeshStandardMaterial({map: ringsTex(), color: '#e2f6f2', emissive: '#ffd890', emissiveIntensity: 0.6, transparent: true, opacity: 0.85, roughness: 0.04, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide}),
      pane: new THREE.MeshStandardMaterial({color: '#bcd3dc', transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5}),
      mullion: new THREE.MeshStandardMaterial({color: '#25292a', roughness: 0.5, metalness: 0.5, transparent: true}),
      win: new THREE.MeshStandardMaterial({color: '#1d2333', emissive: '#ffc77a', emissiveIntensity: 0.4, roughness: 0.3}),
      frameW: new THREE.MeshStandardMaterial({color: '#e8e2d6', roughness: 0.8}),
      door: new THREE.MeshStandardMaterial({color: '#3b4a52', roughness: 0.7}),
      house: new THREE.MeshStandardMaterial({map: plasterTex('#e3ddd0', 8), roughness: 0.95}),
      tile: new THREE.MeshStandardMaterial({map: tileTex(), roughness: 0.85, side: THREE.DoubleSide}),
      wallStone: new THREE.MeshStandardMaterial({map: stoneTex('#77736c', 17), roughness: 1}),
      hull: new THREE.MeshStandardMaterial({color: '#25272c', roughness: 0.7}),
      deck: new THREE.MeshStandardMaterial({color: '#7d6448', roughness: 0.9}),
      funnel: new THREE.MeshStandardMaterial({color: '#1e1f22', roughness: 0.6}),
      funnelBand: new THREE.MeshStandardMaterial({color: '#9c2f26', roughness: 0.6}),
      ports: new THREE.MeshStandardMaterial({map: portTex(), emissive: '#ffd38a', emissiveMap: portTex(), emissiveIntensity: 0.9, roughness: 0.6}),
      foamA: new THREE.MeshBasicMaterial({map: foamTex(), transparent: true, opacity: 0.6, depthWrite: false, color: '#dfe8f2'}),
      foamB: new THREE.MeshBasicMaterial({map: foamTex(), transparent: true, opacity: 0.3, depthWrite: false, color: '#dfe8f2'}),
      smoke: new THREE.SpriteMaterial({map: glowTex('rgba(200,205,215,0.6)', 'rgba(170,175,190,0.3)'), transparent: true, opacity: 0.35, depthWrite: false, color: '#9aa0ae'}),
      ray: new THREE.MeshBasicMaterial({color: '#ffd36b', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false, toneMapped: false}),
    };
    const world = new THREE.Group();
    const r = rng(23);

    // --- земля: полная полярная сетка вокруг башни (центр 0,0), от края цоколя
    const radii: number[] = [];
    for (let rr = RB + 0.55; rr < 70; rr += 0.5) radii.push(rr);
    for (let rr = 70; rr < 7000; rr *= 1.025) radii.push(rr);
    const NA = 720;
    const pos: number[] = [];
    const colors: number[] = [];
    const uv: number[] = [];
    const cGrassA = new THREE.Color('#4d7a3c');
    const cGrassB = new THREE.Color('#6c9146');
    const cHeath = new THREE.Color('#6a5358');
    const cRock = new THREE.Color('#77716b');
    const cSand = new THREE.Color('#6d6650');
    const cFar = new THREE.Color('#4f5a46');
    const cc = new THREE.Color();
    radii.forEach((rad) => {
      for (let a = 0; a <= NA; a++) {
        const th = (a / NA) * Math.PI * 2;
        const x = rad * Math.cos(th);
        const z = rad * Math.sin(th);
        const h = ground(x, z);
        pos.push(x, h, z);
        uv.push(x / 3, z / 3);
        const nn = 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.03) * Math.cos(x * 0.021 - z * 0.04);
        const slope = Math.abs(ground(x + 0.7, z) - h) + Math.abs(ground(x, z + 0.7) - h);
        cc.copy(cGrassA).lerp(cGrassB, nn);
        cc.lerp(cHeath, smooth(0.6, 0.95, nn) * 0.3);
        cc.lerp(cFar, smooth(400, 2500, rad) * 0.6);
        cc.lerp(cRock, smooth(0.25, 0.8, slope));
        if (h < 1) cc.copy(cSand);
        colors.push(cc.r, cc.g, cc.b);
      }
    });
    const idx: number[] = [];
    for (let i = 0; i < radii.length - 1; i++)
      for (let a = 0; a < NA; a++) {
        const p0 = i * (NA + 1) + a;
        const p1 = p0 + NA + 1;
        idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
      }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const land = new THREE.Mesh(tg, m.land);
    land.material.side = THREE.DoubleSide;
    world.add(land);

    // --- море: одна непрозрачная плоскость (дно всегда ≥1.5 м ниже)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), m.sea);
    sea.rotation.x = -Math.PI / 2;
    (m.sea.map as THREE.Texture).repeat.set(900, 900);
    world.add(sea);

    // --- пена у подножия обрыва (на 0.45 м над водой) — два слоя, мерцают по очереди
    const foamG = new THREE.PlaneGeometry(9, 3.2);
    foamG.rotateX(-Math.PI / 2);
    const fA = new THREE.InstancedMesh(foamG, m.foamA, 220);
    const fB = new THREE.InstancedMesh(foamG, m.foamB, 220);
    {
      const dm = new THREE.Object3D();
      let ia = 0;
      let ib = 0;
      for (let z = -700; z <= 700; z += 6.5) {
        const x0 = coastX(z) + 1.2;
        const tang = Math.atan2(coastX(z + 1) - coastX(z - 1), 2);
        dm.position.set(x0 + (r() - 0.3) * 2.5, 0.45, z);
        dm.rotation.set(0, Math.PI / 2 - tang, 0);
        dm.scale.set(0.8 + r() * 0.6, 1, 0.8 + r() * 0.5);
        dm.updateMatrix();
        if ((ia + ib) % 2 === 0 && ia < 220) fA.setMatrixAt(ia++, dm.matrix);
        else if (ib < 220) fB.setMatrixAt(ib++, dm.matrix);
      }
      fA.count = ia;
      fB.count = ib;
      fA.renderOrder = 2;
      fB.renderOrder = 2;
      world.add(fA, fB);
    }
    // --- камни у подножия и на плато
    {
      const rocks: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 34; k++) {
        const z = -360 + r() * 720;
        const sea = k < 24;
        const x = sea ? coastX(z) + 2 + r() * 26 : -40 + r() * 70;
        const zz = sea ? z : -60 + r() * 50;
        if (!sea && Math.hypot(x, zz) < 9) continue;
        if (!sea && x > HX0 - 3 && x < HX1 + 3 && zz > HZ0 - 3 && zz < HZ1 + 3) continue;
        const s = sea ? 1.6 + r() * 4 : 0.5 + r() * 0.9;
        const g = rockGeo(100 + k);
        g.scale(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5));
        g.rotateY(r() * 6);
        g.translate(x, sea ? -0.6 * s : ground(x, zz) + 0.2 * s, zz);
        rocks.push(g);
      }
      world.add(new THREE.Mesh(mergeGeometries(rocks), m.rock));
    }

    // --- цоколь (целый круг) и пол первого этажа
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(RB + 0.5, RB + 0.6, 0.85, 56), m.granite);
    plinth.position.y = GY - 0.075;
    world.add(plinth);

    // --- стена башни: задняя половина, белая с красным поясом; срез стены — кладка
    const segs: [number, number, THREE.Material][] = [
      [TY0, 31, m.white],
      [31, 34, m.red],
      [34, TOPY, m.white],
    ];
    segs.forEach(([y0, y1, mat]) => {
      world.add(new THREE.Mesh(halfLathe([[roT(y0), y0], [roT(y1), y1]], 56), mat));
      world.add(new THREE.Mesh(halfLathe([[riT(y1), y1], [riT(y0), y0]], 56), m.inner));
    });
    [1, -1].forEach((s) => world.add(new THREE.Mesh(polyFace([[s * riT(TY0), TY0], [s * roT(TY0), TY0], [s * roT(TOPY), TOPY], [s * riT(TOPY), TOPY]], 0), m.mason)));
    // окна (рамы выступают на 0.2 м, стекло — на 0.1 м над стеной) и дверь
    const winAt = (th: number, y: number, w = 0.55, h = 0.9, door = false) => {
      const rr = roT(y + h / 2);
      const g = new THREE.Group();
      const fr = 0.08;
      g.add(new THREE.Mesh(box(-w / 2 - fr, w / 2 + fr, -fr, 0, -0.3, 0.2), m.frameW));
      g.add(new THREE.Mesh(box(-w / 2 - fr, w / 2 + fr, h, h + fr, -0.3, 0.2), m.frameW));
      g.add(new THREE.Mesh(box(-w / 2 - fr, -w / 2, 0, h, -0.3, 0.2), m.frameW));
      g.add(new THREE.Mesh(box(w / 2, w / 2 + fr, 0, h, -0.3, 0.2), m.frameW));
      g.add(new THREE.Mesh(box(-w / 2, w / 2, 0, h, -0.3, 0.1), door ? m.door : m.win));
      g.position.set(rr * Math.sin(th), y, rr * Math.cos(th));
      g.rotation.y = th;
      world.add(g);
    };
    winAt(Math.PI * 1.32, TY0, 1.1, 2.1, true);
    winAt(Math.PI * 0.86, 25.5);
    winAt(Math.PI * 1.15, 29.5);
    winAt(Math.PI * 0.9, 35.6);
    winAt(Math.PI * 1.1, 39.4, 0.6, 1.0);

    // --- труба для гири (по центру), половина, срез
    world.add(new THREE.Mesh(halfLathe([[0.35, TY0], [0.35, ROOM]], 24), m.iron));
    world.add(new THREE.Mesh(halfLathe([[0.31, ROOM], [0.31, TY0]], 24), m.ironDark));
    [1, -1].forEach((s) => world.add(new THREE.Mesh(polyFace([[s * 0.31, TY0], [s * 0.35, TY0], [s * 0.35, ROOM], [s * 0.31, ROOM]], 0), m.iron)));

    // --- винтовая лестница: каменные ступени вдоль стены (только целиком в задней половине)
    {
      const st: THREE.BufferGeometry[] = [];
      for (let k = 0; k < NSTEPS; k++) {
        const th = TH0 + k * DTH;
        const a0 = th - DTH / 2;
        const a1 = th + DTH / 2;
        const wrap = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const c0 = wrap(a0);
        const c1 = wrap(a1);
        if (!(c0 >= Math.PI / 2 - 1e-6 && c1 <= (Math.PI * 3) / 2 + 1e-6 && c1 > c0)) continue;
        const y = TY0 + (k + 1) * STEP_H;
        st.push(annSector(0.45, riT(y) + 0.12, c0 + 0.015, c1, y - 0.12, y, 4));
      }
      world.add(new THREE.Mesh(mergeGeometries(st), m.step));
    }
    // --- пол механизма с люком над последними ступенями и отверстием для троса
    {
      const hatch0 = TH0 + (NSTEPS - 3.5) * DTH;
      const hatch1 = TH0 + (NSTEPS - 0.5) * DTH;
      const w = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const h0 = w(hatch0);
      const h1 = w(hatch1);
      const ro = riT(ROOMF) + 0.06;
      world.add(new THREE.Mesh(annSector(0.36, ro, Math.PI / 2, h0, ROOM, ROOMF, 24), m.granite));
      world.add(new THREE.Mesh(annSector(0.36, ro, h1, (Math.PI * 3) / 2, ROOM, ROOMF, 24), m.granite));
      world.add(new THREE.Mesh(annSector(0.36, 0.95, h0, h1, ROOM, ROOMF, 6), m.granite));
    }
    // --- галерея, перила-парапет, фонарь (низкая стенка, стекло, переплёт), купол-крыша
    world.add(new THREE.Mesh(annSector(0, 3.5, Math.PI / 2, (Math.PI * 3) / 2, TOPY, TOPY + 0.35, 40), m.granite));
    world.add(new THREE.Mesh(annSector(3.36, 3.48, Math.PI / 2, (Math.PI * 3) / 2, TOPY + 0.35, TOPY + 1.35, 40), m.lanternIron));
    world.add(new THREE.Mesh(annSector(1.72, 1.84, Math.PI / 2, (Math.PI * 3) / 2, TOPY + 0.35, 43.2, 32), m.lanternIron));
    const paneM = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.78, 2.4, 40, 1, true, Math.PI / 2, Math.PI), m.pane);
    paneM.position.y = 44.4;
    paneM.renderOrder = 10;
    world.add(paneM);
    const mull = new THREE.Group();
    for (let k = 1; k < 6; k++) {
      const th = Math.PI / 2 + (k * Math.PI) / 6;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), m.mullion);
      b.position.set(1.78 * Math.sin(th), 44.4, 1.78 * Math.cos(th));
      mull.add(b);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.025, 5, 40, Math.PI), m.mullion);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = Math.PI;
    ring.position.y = 44.4;
    mull.add(ring);
    world.add(mull);
    const roofProf: [number, number][] = [[1.98, 45.6], [1.98, 45.78], [1.25, 46.35], [0.32, 46.9], [0.0, 46.96]];
    world.add(new THREE.Mesh(halfLathe(roofProf, 40), m.roof));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10, Math.PI, Math.PI), m.roof);
    ball.position.y = 47.2;
    world.add(ball);
    const ballCap = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), m.roof);
    ballCap.position.y = 47.2;
    world.add(ballCap);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), m.mullion);
    rod.position.y = 48.1;
    mull.add(rod);

    // --- пьедестал, чаша с ртутью, поплавок (половина, срез)
    world.add(new THREE.Mesh(halfLathe([[0.32, TOPY + 0.35], [0.26, 43.0]], 24), m.iron));
    world.add(new THREE.Mesh(polyFace([[-0.32, TOPY + 0.35], [0.32, TOPY + 0.35], [0.26, 43.0], [-0.26, 43.0]], 0), m.iron));
    const trough: [number, number][] = [[0.3, 43.38], [0.3, 43.0], [0.8, 43.0], [0.8, 43.38], [0.74, 43.38], [0.74, 43.06], [0.36, 43.06], [0.36, 43.38], [0.3, 43.38]];
    world.add(new THREE.Mesh(halfLathe(trough, 32), m.iron));
    [1, -1].forEach((s) => world.add(new THREE.Mesh(polyFace(trough.slice(0, -1).map(([x, y]) => [s * x, y] as [number, number]), 0), m.iron)));
    const merc: [number, number][] = [[0.36, 43.06], [0.74, 43.06], [0.74, 43.3], [0.68, 43.3], [0.68, 43.12], [0.42, 43.12], [0.42, 43.3], [0.36, 43.3]];
    world.add(new THREE.Mesh(halfLathe([[0.74, 43.3], [0.68, 43.3]], 32), m.mercury));
    world.add(new THREE.Mesh(halfLathe([[0.42, 43.3], [0.36, 43.3]], 32), m.mercury));
    [1, -1].forEach((s) => world.add(new THREE.Mesh(polyFace(merc.map(([x, y]) => [s * x, y] as [number, number]), 0), m.mercury)));
    const flt: [number, number][] = [[0.42, 43.12], [0.68, 43.12], [0.68, 43.42], [0.42, 43.42], [0.42, 43.12]];
    world.add(new THREE.Mesh(halfLathe(flt, 32), m.bronze));
    [1, -1].forEach((s) => world.add(new THREE.Mesh(polyFace(flt.slice(0, -1).map(([x, y]) => [s * x, y] as [number, number]), 0), m.bronze)));

    // --- дом смотрителя: беленый камень, черепичная крыша, труба, окна
    {
      const h = new THREE.Group();
      h.add(new THREE.Mesh(box(HX0, HX1, GY - 0.3, GY + HWALL, HZ0, HZ1), m.house));
      const gab = new THREE.Shape([new THREE.Vector2(HZ0, 0), new THREE.Vector2(HZ1, 0), new THREE.Vector2((HZ0 + HZ1) / 2, 2.3)]);
      [HX0, HX1].forEach((x) => {
        const gg = new THREE.ExtrudeGeometry(gab, {depth: 0.01, bevelEnabled: false});
        gg.rotateY(-Math.PI / 2);
        gg.translate(x + (x === HX0 ? 0.005 : 0.005), GY + HWALL, 0);
        h.add(new THREE.Mesh(gg, m.house));
      });
      const half = (HZ1 - HZ0) / 2 + 0.5;
      const slope = Math.hypot(half, 2.5);
      [1, -1].forEach((s) => {
        const rf = new THREE.Mesh(new THREE.BoxGeometry(HX1 - HX0 + 1, 0.18, slope), m.tile);
        rf.position.set((HX0 + HX1) / 2, GY + HWALL + 1.15, (HZ0 + HZ1) / 2 + s * half * 0.5);
        rf.rotation.x = s * Math.atan2(2.5, half);
        h.add(rf);
      });
      h.add(new THREE.Mesh(box(HX0 + 1.5, HX0 + 2.5, GY + HWALL + 1.2, GY + HWALL + 4.0, -16.6, -15.4), m.house));
      const hw = (x: number, w: number, hh: number, y0: number, door = false) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(box(x - w / 2 - 0.1, x + w / 2 + 0.1, y0 - 0.1, y0 + hh + 0.1, HZ1, HZ1 + 0.2), m.frameW));
        g.add(new THREE.Mesh(box(x - w / 2, x + w / 2, y0, y0 + hh, HZ1 + 0.05, HZ1 + 0.26), door ? m.door : m.win));
        h.add(g);
      };
      hw(-19.6, 1.1, 1.2, GY + 1.0);
      hw(-14.4, 1.1, 1.2, GY + 1.0);
      hw(-17, 1.0, 2.1, GY, true);
      world.add(h);
    }
    // --- низкая каменная ограда
    {
      const ws: THREE.BufferGeometry[] = [];
      const seg = (x0: number, z0: number, x1: number, z1: number) => {
        const L = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.ceil(L / 2);
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n;
          const x = lerp(x0, x1, k);
          const z = lerp(z0, z1, k);
          const g = new THREE.BoxGeometry(L / n + 0.05, 1.0, 0.6);
          g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
          g.translate(x, ground(x, z) + 0.3, z);
          ws.push(g);
        }
      };
      seg(-27, -27, 14, -27);
      seg(-27, -27, -27, 14);
      world.add(new THREE.Mesh(mergeGeometries(ws), m.wallStone));
    }
    // --- второй маяк далеко на мысу (у него свой ритм)
    const far2 = new THREE.Group();
    {
      const x = -720;
      const z = -2200;
      const gy = ground(x, z);
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.2, 26, 16), m.white);
      tw.position.y = 13;
      far2.add(tw);
      const tp = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3, 12), m.lanternIron);
      tp.position.y = 27.5;
      far2.add(tp);
      far2.position.set(x, gy, z);
      world.add(far2);
    }
    // --- облака у горизонта
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 11; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(700 + i), color: '#f1c3a8', transparent: true, opacity: 0.6, depthWrite: false, fog: false}));
      s.scale.set(520 + r() * 340, 90 + r() * 50, 1);
      const a = -0.2 - r() * 2.2;
      s.position.set(Math.cos(a) * 3000, 240 + r() * 260, Math.sin(a) * 3000);
      world.add(s);
      clouds.push(s);
    }
    world.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    const lens = makeLens(m);
    const ship = makeShip(m);
    return {m, world, clouds, lens, ship, far2, mull, cache: new Map<string, THREE.Object3D>()};
  }, []);

// луч: конус с мягкими краями, гаснет к концу (аддитивно, без записи глубины)
const BEAM_L = 420;
const beamMat = () =>
  new THREE.ShaderMaterial({
    uniforms: {uI: {value: 0.5}, uC: {value: new THREE.Color('#fff1c8')}, uL: {value: BEAM_L}},
    vertexShader: `uniform float uL; varying float vA; varying vec3 vN; varying vec3 vV;
      void main(){ vA = position.x / uL; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; uniform vec3 uC; varying float vA; varying vec3 vN; varying vec3 vV;
      void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
        float a = uI * pow(f, 1.8) * pow(1.0 - clamp(vA, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.004, vA);
        gl_FragColor = vec4(uC * a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

const useSkyLights = () =>
  useMemo(() => {
    const skyDusk = makeSky(DUSK.sky, SUN);
    skyDusk.renderOrder = -10;
    const skyNight = makeSky(NIGHT.sky, MOON_SKY, 0.999);
    skyNight.renderOrder = -9;
    const skyG = new THREE.Group();
    skyG.add(skyDusk, skyNight);
    const r = rng(99);
    const sp: number[] = [];
    for (let i = 0; i < 1600; i++) {
      const u = r() * Math.PI * 2;
      const e = Math.asin(0.05 + r() * 0.95);
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
    moon.scale.set(140, 140, 1);
    moon.renderOrder = -7;
    skyG.add(moon);
    const center = new THREE.Vector3(0, 30, 0);
    const rim = new THREE.DirectionalLight('#ff9b62', DUSK.rimI);
    rim.position.copy(center).addScaledVector(RIM, 300);
    rim.target.position.copy(center);
    const moonL = new THREE.DirectionalLight('#b8c6ea', 0);
    moonL.position.copy(center).addScaledVector(MOON_L, 300);
    moonL.target.position.copy(center);
    const hemi = new THREE.HemisphereLight(DUSK.hemiSky, DUSK.hemiGround, DUSK.hemiI);
    // тёплый свет внутри: лампа в фонаре, комната механизма, лестница
    const lampL = new THREE.PointLight('#ffcf8a', 14, 9, 1.6);
    lampL.position.set(0, LC, 0);
    const roomL = new THREE.PointLight('#ffc27a', 7, 7, 1.5);
    roomL.position.set(0.6, 40.9, -1.3);
    const stairL = new THREE.PointLight('#ffc98e', 9, 14, 1.4);
    stairL.position.set(0.2, 29, -1.6);
    const stairL2 = new THREE.PointLight('#ffc98e', 6, 10, 1.4);
    stairL2.position.set(-0.4, 23, -1.6);
    const keeperL = new THREE.PointLight('#ffb866', 0, 4, 1.5);
    const bathL = new THREE.PointLight('#ffd9a0', 1.6, 2.5, 1.5);
    bathL.position.set(0.55, 43.28, 0.9);
    const beams = [0, 1].map(() => {
      const g = new THREE.ConeGeometry(BEAM_L * 0.065, BEAM_L, 32, 1, true);
      g.translate(0, -BEAM_L / 2, 0);
      g.rotateZ(Math.PI / 2);
      const b = new THREE.Mesh(g, beamMat());
      b.renderOrder = 20;
      b.frustumCulled = false;
      return b;
    });
    const glowT = glowTex();
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({map: glowT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false}));
    flash.renderOrder = 21;
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({map: glowT, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
    flame.scale.set(0.42, 0.55, 1);
    flame.position.set(0, LC + 0.04, 0);
    flame.renderOrder = 7;
    const far2Flash = new THREE.Sprite(new THREE.SpriteMaterial({map: glowT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false}));
    far2Flash.renderOrder = 21;
    const keeperGlow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
    keeperGlow.renderOrder = 22;
    const shipLights = [0, 1, 2].map((k) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex(k === 0 ? 'rgba(255,250,235,1)' : k === 1 ? 'rgba(255,90,70,1)' : 'rgba(90,255,140,1)', k === 0 ? 'rgba(255,230,190,0.4)' : k === 1 ? 'rgba(255,60,40,0.3)' : 'rgba(60,220,110,0.3)'), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
      s.renderOrder = 21;
      return s;
    });
    return {skyG, skyNight, starMat, moon, rim, moonL, hemi, lampL, roomL, stairL, stairL2, keeperL, bathL, beams, flash, flame, far2Flash, keeperGlow, shipLights};
  }, []);

// ---------- сцена ----------
const MayakWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const W0 = useWorld();
  const SL = useSkyLights();
  const {m} = W0;
  const p = clamp01(frame / Math.max(1, dur));
  const t = t0 + frame / fps; // абсолютное время ролика: линза, корабль, волны идут без скачков между сценами
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
    const L = SL;
    scene.add(W0.world, dyn, L.skyG, L.rim, L.rim.target, L.moonL, L.moonL.target, L.hemi, L.lampL, L.roomL, L.stairL, L.stairL2, L.keeperL, L.bathL, ...L.beams, L.flash, L.flame, L.far2Flash, L.keeperGlow, ...L.shipLights, W0.lens.g, W0.ship);
    scene.fog = new THREE.Fog(DUSK.fog, DUSK.fogNear, DUSK.fogFar);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.shadowMap.enabled = false;
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const sk = makeSky(DUSK.sky, SUN);
    sk.scale.setScalar(0.05);
    envScene.add(sk);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    return () => {
      scene.remove(W0.world, dyn, L.skyG, L.rim, L.rim.target, L.moonL, L.moonL.target, L.hemi, L.lampL, L.roomL, L.stairL, L.stairL2, L.keeperL, L.bathL, ...L.beams, L.flash, L.flame, L.far2Flash, L.keeperGlow, ...L.shipLights, W0.lens.g, W0.ship);
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

    // --- сумерки → ночь
    const n = clamp01(range(P.night ?? 0.5, p));
    SL.rim.intensity = DUSK.rimI * (1 - smooth(0.4, 0.95, n));
    SL.moonL.intensity = NIGHT.moonI * smooth(0.45, 1, n);
    SL.hemi.color.set(DUSK.hemiSky).lerp(col(NIGHT.hemiSky), n);
    SL.hemi.groundColor.set(DUSK.hemiGround).lerp(col(NIGHT.hemiGround), n);
    SL.hemi.intensity = lerp(DUSK.hemiI, NIGHT.hemiI, n);
    (SL.skyNight.material as THREE.MeshBasicMaterial).opacity = n;
    SL.skyNight.visible = n > 0.003;
    SL.starMat.opacity = smooth(0.5, 0.95, n);
    (SL.moon.material as THREE.SpriteMaterial).opacity = smooth(0.35, 0.85, n);
    const fog = scene.fog as THREE.Fog;
    fog.color.set(DUSK.fog).lerp(col(NIGHT.fog), n);
    fog.near = lerp(DUSK.fogNear, NIGHT.fogNear, n);
    fog.far = lerp(DUSK.fogFar, NIGHT.fogFar, n);
    (scene as any).environmentIntensity = lerp(0.9, 0.35, n);
    W0.clouds.forEach((c, i) => {
      (c.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - n * 0.7);
      (c.material as THREE.SpriteMaterial).color.set('#f1c3a8').lerp(col('#48506e'), smooth(0.4, 1, n));
      c.position.y = 240 + (i % 4) * 70 + Math.sin(t * 0.02 + i) * 4;
    });
    m.win.emissiveIntensity = 0.25 + 0.75 * n;
    (m.sea.map as THREE.Texture).offset.set(t * 0.004, t * 0.0025);
    m.foamA.opacity = 0.35 + 0.3 * Math.max(0, Math.sin(t * 1.1));
    m.foamB.opacity = 0.35 + 0.3 * Math.max(0, Math.sin(t * 1.1 + Math.PI));

    // --- линза вращается: оборот 20 с, два «бычьих глаза» → два луча
    const ang = (t / PERIOD) * Math.PI * 2 + (P.phase ?? 0.6);
    W0.lens.g.position.set(0, LC, 0);
    W0.lens.g.rotation.y = ang;
    const beamI = range(P.beam ?? 1, p) * lerp(0.35, 1.25, smooth(0.3, 0.9, n));
    SL.beams.forEach((b, k) => {
      b.position.set(0, LC, 0);
      b.rotation.set(0, ang + k * Math.PI, 0);
      (b.material as THREE.ShaderMaterial).uniforms.uI.value = beamI;
      b.visible = beamI > 0.005;
    });
    m.glass.emissiveIntensity = 0.3 + 0.25 * n;

    // --- камера (с промежуточной точкой via; rel — позиция относительно корабля)
    const [sx, sz] = shipPos(t);
    const ev = (c: Cam): Cam => (c.rel ? {...c, pos: [c.pos[0] + sx, c.pos[1], c.pos[2] + sz]} : c);
    const cs = (P.cam ?? ['wide', 'wide']).map((c: string | Cam) => ev(cam(c)));
    const c0 = cs[0];
    const c1 = cs[cs.length - 1];
    const q0 = clamp01((p - (P.camDelay ?? 0)) / (P.camDur ?? 1));
    let ca = c0;
    let cb = c1;
    let kc = easeInOut(q0);
    if (P.via) {
      const v = ev(cam(P.via));
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
    const dLook = Math.hypot(pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]);
    const near = Math.min(3, Math.max(0.15, dLook * 0.08));
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== fov || pc.far !== FAR || Math.abs(pc.near - near) > 1e-4) {
      pc.fov = fov;
      pc.near = near;
      pc.far = FAR;
      pc.updateProjectionMatrix();
    }
    SL.skyG.position.copy(camera.position);
    const camV = new THREE.Vector3(pos[0], pos[1], pos[2]);

    // вспышка: луч смотрит на камеру (по горизонтали) — свечение на линзе, не на весь экран
    const toCam = new THREE.Vector3(pos[0], 0, pos[2]).normalize();
    let fl = 0;
    [0, 1].forEach((k) => {
      const a = ang + k * Math.PI;
      const d = Math.cos(a) * toCam.x - Math.sin(a) * toCam.z;
      fl = Math.max(fl, Math.pow(Math.max(0, d), 30));
    });
    const dLens = camV.distanceTo(new THREE.Vector3(0, LC, 0));
    SL.flash.position.set(0, LC, 0);
    const fs = Math.min(dLens * 0.16, 60);
    SL.flash.scale.set(fs, fs, 1);
    (SL.flash.material as THREE.SpriteMaterial).opacity = 0.9 * fl * smooth(0.25, 0.7, n) * smooth(8, 30, dLens) * range(P.beam ?? 1, p);
    // свечение лампы в линзе
    (SL.flame.material as THREE.SpriteMaterial).opacity = 0.85;
    SL.flame.scale.set(0.42 + 0.02 * Math.sin(t * 9), 0.55 + 0.03 * Math.sin(t * 7.3), 1);

    // тонкие детали гаснут вдали (иначе рябят)
    const dTop = camV.distanceTo(new THREE.Vector3(0, 44, 0));
    const fade = 1 - smooth(30, 55, dTop);
    m.mullion.opacity = fade;
    W0.mull.visible = fade > 0.01;
    W0.lens.frame.visible = dTop < 40;

    // второй маяк: две быстрые вспышки каждые 8 с
    {
      const ph = ((t + 3) % 8 + 8) % 8;
      const b = Math.max(smooth(0, 0.12, ph) * (1 - smooth(0.25, 0.5, ph)), smooth(0.9, 1.02, ph) * (1 - smooth(1.15, 1.4, ph)));
      const fp = W0.far2.position;
      SL.far2Flash.position.set(fp.x, fp.y + 27.5, fp.z);
      const d2 = camV.distanceTo(SL.far2Flash.position);
      SL.far2Flash.scale.setScalar(d2 * 0.035);
      (SL.far2Flash.material as THREE.SpriteMaterial).opacity = 0.95 * b * smooth(0.35, 0.8, n);
    }

    // корабль идёт ровно, огни: топовый, красный (левый), зелёный (правый)
    W0.ship.position.set(sx, 0, sz);
    {
      const lp: [number, number, number][] = [[0, 21.8, -18], [-3.8, 7.4, -6], [3.8, 7.4, -6]];
      SL.shipLights.forEach((s, k) => {
        s.position.set(sx + lp[k][0], lp[k][1], sz + lp[k][2]);
        const d = camV.distanceTo(s.position);
        s.scale.setScalar(Math.max(1.2, d * 0.012));
        (s.material as THREE.SpriteMaterial).opacity = 0.9 * smooth(0.3, 0.7, n);
      });
      // дым из трубы — уплывает назад
      for (let k = 0; k < 7; k++) {
        const u = ((t * 0.12 + k / 7) % 1 + 1) % 1;
        const sp = new THREE.Sprite(m.smoke);
        sp.userData.cached = true;
        sp.position.set(sx + u * 3, 12.5 + u * 9, sz + 3 + u * 34);
        sp.scale.setScalar(3 + u * 10);
        sp.renderOrder = 4;
        add(sp);
      }
      // дым из трубы дома
      for (let k = 0; k < 5; k++) {
        const u = ((t * 0.1 + k / 5) % 1 + 1) % 1;
        const sp = new THREE.Sprite(m.smoke);
        sp.userData.cached = true;
        sp.position.set(HX0 + 2 + u * 4, GY + HWALL + 4.2 + u * 6, -16 - u * 2);
        sp.scale.setScalar(0.9 + u * 3.5);
        sp.renderOrder = 4;
        add(sp);
      }
    }

    // --- гиря в трубе: w = 0 вверху … 1 на дне
    const w = clamp01(range(P.w ?? 0.15, p));
    const wy = lerp(W_TOP, W_BOT, w);
    const wg = cached('weight', () => {
      const g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, W_H, 24, 1, false, Math.PI / 2, Math.PI), m.weight);
      g.add(c);
      const cap = new THREE.Mesh(polyFace([[-0.24, -W_H / 2], [0.24, -W_H / 2], [0.24, W_H / 2], [-0.24, W_H / 2]], 0), m.weight);
      const uvs = cap.geometry.attributes.uv;
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, (uvs.getX(i) + 0.24) / 0.48, (uvs.getY(i) + W_H / 2) / W_H);
      g.add(cap);
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24, 0, Math.PI), m.iron);
      top.rotation.x = -Math.PI / 2;
      top.position.y = W_H / 2;
      g.add(top);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 16), m.iron);
      hook.position.set(0, W_H / 2 + 0.08, -0.15);
      g.add(hook);
      return g;
    });
    wg.position.set(0, wy, 0);
    add(wg);
    // трос: от гири до барабана (длина квантуется → ключ кэша = длина)
    const cTop = 39.0;
    const cBot = wy + W_H / 2 + 0.12;
    // трос — один цилиндр высотой 1, растягивается по длине (без шагов квантования: конец не дёргается у крюка)
    const cl = Math.max(0.01, cTop - cBot);
    const cable = cached('cable', () => new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), m.cable));
    cable.scale.set(1, cl, 1);
    cable.position.set(0, cTop - cl / 2, -0.15);
    add(cable);
    m.cable.opacity = 1 - smooth(40, 70, camV.distanceTo(new THREE.Vector3(0, 30, 0)));
    m.weight.emissiveIntensity = 0.35 * range(P.hlWeight ?? 0, p);

    // --- часовой механизм: шестерни крутятся (ведущий барабан медленно, регулятор быстро)
    const wind = range(P.wind ?? 0, p); // 0..1 — смотритель заводит: барабан крутится назад быстро
    const base = t * 0.05 - wind * 12;
    const parts = cached('clock', () => {
      const g = new THREE.Group();
      const legs: [number, number][] = [[-0.52, -0.06], [-0.52, -0.34], [0.62, -0.06], [0.62, -0.34]];
      legs.forEach(([x, z]) => g.add(new THREE.Mesh(box(x - 0.03, x + 0.03, ROOMF, 38.75, z - 0.03, z + 0.03), m.lanternIron)));
      [-0.04, -0.36].forEach((z) => {
        g.add(new THREE.Mesh(box(-0.55, 0.65, 38.72, 38.78, z - 0.02, z + 0.02), m.lanternIron));
        g.add(new THREE.Mesh(box(-0.55, 0.65, 39.72, 39.78, z - 0.02, z + 0.02), m.lanternIron));
        g.add(new THREE.Mesh(box(-0.55, -0.49, 38.72, 39.78, z - 0.02, z + 0.02), m.lanternIron));
        g.add(new THREE.Mesh(box(0.59, 0.65, 38.72, 39.78, z - 0.02, z + 0.02), m.lanternIron));
      });
      return g;
    });
    add(parts);
    const gear = (key: string, r: number, T: number, x: number, y: number, z: number, a: number, holes = 0, mat = m.brass) => {
      const o = cached(`g_${key}`, () => new THREE.Mesh(gearGeo(r, T, 0.04, holes), mat));
      o.position.set(x, y, z);
      o.rotation.set(0, 0, a);
      add(o);
      const ax = cached(`ax_${key}`, () => {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), m.iron);
        c.rotation.x = Math.PI / 2;
        return c;
      });
      ax.position.set(x, y, -0.2);
      add(ax);
    };
    const a1 = base;
    const a2 = -a1 * (0.3 / 0.085);
    const a4 = -a2 * (0.22 / 0.07);
    gear('1', 0.3, 36, -0.17, 39.0, 0.02, a1, 4);
    gear('2', 0.085, 10, 0.215, 39.0, 0.02, a2 + 0.16);
    gear('3', 0.22, 26, 0.215, 39.0, -0.1, a2, 3);
    gear('4', 0.07, 9, 0.215, 39.29, -0.1, a4 + 0.2);
    gear('5', 0.17, 22, 0.215, 39.29, 0.02, a4, 3);
    // барабан с тросом (на оси колеса 1)
    const drum = cached('drum', () => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 24), m.drum);
      c.rotation.x = Math.PI / 2;
      return c;
    });
    drum.position.set(-0.17, 39.0, -0.15);
    drum.rotation.set(Math.PI / 2, a1, 0);
    add(drum);
    // ручка завода на оси барабана
    const crank = cached('crank', () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(box(0, 0.26, -0.025, 0.025, 0.0, 0.03), m.iron));
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), m.door);
      k.rotation.x = Math.PI / 2;
      k.position.set(0.26, 0, 0.09);
      g.add(k);
      return g;
    });
    crank.position.set(-0.17, 39.0, 0.06);
    crank.rotation.set(0, 0, -wind * 40);
    add(crank);
    // вертикальный вал к линзе (с меткой) и регулятор-вертушка
    const sh = cached('shaft', () => new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 43.0 - 39.55, 10), m.shaft));
    sh.position.set(0.215, (43.0 + 39.55) / 2, -0.06);
    sh.rotation.set(0, ang, 0);
    add(sh);
    const bev = cached('bevel', () => new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 16), m.brass));
    bev.position.set(0.215, 39.55, -0.06);
    bev.rotation.set(0, ang, 0);
    add(bev);
    const gov = cached('gov', () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6), m.iron));
      [1, -1].forEach((s) => {
        const b = new THREE.Mesh(box(0.04, 0.2, 0.08, 0.17, -0.004, 0.004), m.brass);
        b.rotation.y = s > 0 ? 0 : Math.PI;
        g.add(b);
      });
      return g;
    });
    gov.position.set(-0.36, 39.93, -0.2);
    gov.rotation.set(0, t * 6.5 + wind * 20, 0);
    add(gov);

    // --- стол-поворотник на поплавке (целый, крутится вместе с линзой)
    const table = cached('table', () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 40), m.bronze));
      for (let k = 0; k < 8; k++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), m.brass);
        const a = (k / 8) * Math.PI * 2;
        b.position.set(0.62 * Math.cos(a), 0.05, 0.62 * Math.sin(a));
        g.add(b);
      }
      return g;
    });
    table.position.set(0, 43.46, 0);
    table.rotation.set(0, ang, 0);
    add(table);
    // лампа (горелка) внутри линзы
    const burner = cached('burner', () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.62, 12), m.brass));
      return g;
    });
    burner.position.set(0, LC - 0.32, 0);
    add(burner);

    // --- лучи света через призмы (схема): от огня к стеклу, дальше параллельно
    const rays = range(P.rays ?? 0, p);
    if (rays > 0.01) {
      const angs = [-38, -24, -11, 11, 24, 38];
      angs.forEach((dg, k) => {
        const a = (dg * Math.PI) / 180;
        const x1 = LR + 0.02;
        const y1 = LC + Math.tan(a) * x1;
        const seg1 = Math.hypot(x1, y1 - LC);
        const seg2 = 2.4;
        const tot = seg1 + seg2;
        const dl = rays * tot;
        const l1 = Math.min(dl, seg1);
        const r1 = cached(`ray1_${k}_${q(l1, 50)}`, () => new THREE.Mesh(new THREE.PlaneGeometry(l1, 0.022), m.ray));
        r1.position.set((Math.cos(a) * l1) / 2, LC + (Math.sin(a) * l1) / 2, 0.8);
        r1.rotation.set(0, 0, a);
        r1.renderOrder = 40;
        add(r1);
        if (dl > seg1) {
          const l2 = q(dl - seg1, 50);
          if (l2 > 0.01) {
            const r2 = cached(`ray2_${k}_${l2}`, () => new THREE.Mesh(new THREE.PlaneGeometry(l2, 0.03), m.ray));
            r2.position.set(x1 + l2 / 2, y1, 0.8);
            r2.renderOrder = 40;
            add(r2);
          }
        }
      });
    }

    // --- смотритель: фонарь поднимается из люка и встаёт у механизма
    const kp = range(P.keeper ?? 0, p);
    if (kp > 0.001) {
      const hatchA = TH0 + (NSTEPS - 2) * DTH;
      const hx = 1.25 * Math.sin(hatchA);
      const hz = 1.25 * Math.cos(hatchA);
      const up = smooth(0, 0.6, kp);
      const mv = smooth(0.55, 1, kp);
      const x = lerp(hx, 0.95, mv);
      const z = lerp(hz, -0.75, mv);
      const y = lerp(lerp(37.4, 39.3, up), ROOMF + 0.02, mv);
      const lan = cached('lantern', () => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.04, 12), m.lanternIron));
        const gl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.17, 12), m.glass);
        gl2.position.y = 0.12;
        g.add(gl2);
        const tp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 12), m.lanternIron);
        tp.position.y = 0.25;
        g.add(tp);
        const hd = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 5, 12, Math.PI), m.lanternIron);
        hd.position.y = 0.3;
        g.add(hd);
        return g;
      });
      lan.position.set(x, y, z);
      add(lan);
      SL.keeperGlow.position.set(x, y + 0.12, z);
      SL.keeperGlow.scale.setScalar(0.5);
      (SL.keeperGlow.material as THREE.SpriteMaterial).opacity = 0.9 * smooth(0, 0.15, kp);
      SL.keeperL.position.set(x, y + 0.2, z);
      SL.keeperL.intensity = 4 * smooth(0, 0.15, kp);
    } else {
      (SL.keeperGlow.material as THREE.SpriteMaterial).opacity = 0;
      SL.keeperL.intensity = 0;
    }
  }, [frame]);

  return null;
};

// цветокор поверх кадра: смешивание сумеречного и ночного рецептов
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
  const A = DUSK.grade;
  const B = NIGHT.grade;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: mixHex(A.shadow, B.shadow, n), mixBlendMode: 'screen', opacity: lerp(A.shadowAmt, B.shadowAmt, n)}} />
      <AbsoluteFill style={{background: mixHex(A.high, B.high, n), mixBlendMode: 'multiply', opacity: lerp(A.highAmt, B.highAmt, n)}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(6,8,22,${lerp(A.vignette, B.vignette, n)}) 100%)`}} />
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

export const MayakScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const n = clamp01(range(P.night ?? 0.5, clamp01(frame / Math.max(1, durationInFrames))));
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 30, 150], near: 1, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <MayakWorld P={P} dur={durationInFrames} t0={scene.start ?? 0} />
      </ThreeCanvas>
      <Grade n={n} />
      {P.banner ? (
        <div style={{position: 'absolute', left: 50, right: 50, top: P.bannerY ?? 300, display: 'flex', justifyContent: 'center', opacity: bIn, transform: `scale(${0.85 + 0.15 * bIn})`}}>
          <div
            style={{
              textAlign: 'center',
              fontFamily: ROUND,
              fontWeight: 700,
              fontSize: P.bannerSize ?? 64,
              lineHeight: 1.15,
              whiteSpace: 'pre-line',
              color: '#FFD54A',
              WebkitTextStroke: '8px #2a1f00',
              paintOrder: 'stroke fill',
              textTransform: 'uppercase',
              padding: '14px 30px',
              borderRadius: 28,
              background: 'rgba(8,12,30,0.38)',
            }}
          >
            {P.banner}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
