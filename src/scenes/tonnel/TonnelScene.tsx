import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {cloudTexture} from '../dam/textures';
import {camBetween} from '../../lib/camPath';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ---------- общие помощники (как в «Маяке») ----------
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
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

const col = (c: string) => new THREE.Color(c);
const makeSky = (S: {top: string; mid: string; horizon: string; glow: string; glowSize: number}, dir: THREE.Vector3, opacity = 1) => {
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

// ===== Мир «Подводный тоннель» (Фемарн-Бельт): бетонная секция плывёт, тонет в траншею и стыкуется через резиновое кольцо.
// Ось тоннеля — x. Разрез по z = 0: остаётся дальняя половина (z ≤ 0). Море: поверхность y = 0, дно −28, траншея −40.
// Новая секция E: x ∈ [ex, ex+217]; готовая цепочка P: x ∈ [−217·12, 0]. 1 единица = 1 м.
// Снимки «снаружи» — с дальней стороны (z < 0), «аквариум» в разрезе — с ближней (z > 0); ближнее море тогда прозрачно.
const FAR = 16000;
const L = 217;
const H = 9;
const HW = 21; // половина ширины
const GS = 1.6; // кольцо в кадре крупнее натуры, чтобы читалось
const GINA = 0.6 * GS; // вылет резинового кольца
const FLOAT_YB = -8.5; // низ секции на плаву (верх +0,5)
const REST_YB = -39.2; // низ секции на дне (на щебёночной постели)
const TRENCH = -40;
const SEABED = -28;
const NP = 12; // готовых секций
const XL = -L * NP;
const COAST_L = XL - 300;
const COAST_R = 3300;
const WZ = 0.35; // плоскость «стекла» воды на срезе
const SUN = new THREE.Vector3(-0.42, 0.22, 0.88).normalize();
const SKY = {top: '#2a5aa6', mid: '#7fb0e2', horizon: '#ffd2a0', glow: '#fff1d4', glowSize: 7};
const LOOK = {fog: '#e6d2b8', fogNear: 1400, fogFar: 11000, grade: {shadow: '#1d3456', shadowAmt: 0.03, high: '#ffe6c4', highAmt: 0.05, vignette: 0.32, grain: 0.04}};

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  hero0: {pos: [-34, -1.5, 30], look: [40, -3, -12]},
  hero1: {pos: [-24, -0.8, 22], look: [40, -3, -12]},
  waterline: {pos: [-12, 1.2, 22], look: [8, -2, -8]},
  top: {pos: [30, 55, 95], look: [110, -4, -12]},
  front: {pos: [120, 14, 80], look: [100, -14, -12]},
  trench: {pos: [60, -26, 45], look: [40, -34, -25]},
  secWide: {pos: [-30, -2, 40], look: [80, -6, -12]},
  bulk: {pos: [-8, -3.5, 20], look: [6.6, -4.6, -6]},
  secMid: {pos: [-26, -1, 45], look: [70, -7, -12]},
  tow: {pos: [-50, 30, 100], look: [150, -1, -22]},
  tank: {pos: [36, -1.5, 44], look: [56, -6, -6]},
  sink: {pos: [-45, -16, 80], look: [80, -20, -12]},
  sink2: {pos: [-55, -22, 88], look: [80, -27, -12]},
  gina: {pos: [5.1, -30.9, 6.5], look: [5.1, -30.9, 0]},
  joint: {pos: [2.6, -31.4, 8.5], look: [2.6, -31.4, 0]},
  gina2: {pos: [0.4, -30.9, 4.5], look: [0.4, -30.9, 0]},
  press: {pos: [280, -24, 70], look: [170, -30, -12]},
  chain: {pos: [-40, -31, 30], look: [-300, -34.5, -14]},
  ferry: {pos: [-200, 12, 120], look: [-195, -4, -520]},
  inside0: {pos: [-150, -36.2, 3.4], look: [-260, -36.4, -42], fov: 55},
  inside1: {pos: [-205, -36.0, 3.2], look: [-320, -35.4, -44], fov: 55},
  final: {pos: [-700, 90, 420], look: [-150, -10, -250]},
  cover: {pos: [-30, -1.2, 27], look: [40, -3, -12]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.hero0 : c);

// ---------- рельеф ----------
const hn = (x: number, z: number) => Math.sin(x * 0.011 + z * 0.007) * 0.6 + Math.sin(x * 0.031 - z * 0.023 + 1.3) * 0.35 + Math.sin(x * 0.0021 + z * 0.0033) * 1.6;
const coastAt = (side: number, z: number) => (side < 0 ? COAST_L + 70 * Math.sin(z * 0.0021) + 40 * Math.sin(z * 0.0057 + 1) : COAST_R + 90 * Math.sin(z * 0.0017 + 2) + 35 * Math.sin(z * 0.0061));
const ground = (x: number, z: number) => {
  // открытое дно
  let h = SEABED + hn(x, z) * 0.8;
  // берега: дно поднимается к суше
  const cl = coastAt(-1, z);
  const cr = coastAt(1, z);
  const land = Math.max(smooth(cl + 450, cl - 120, x), smooth(cr - 450, cr + 120, x));
  if (land > 0) h = lerp(h, 2.2 + hn(x * 0.7, z * 0.7) * 1.4, land);
  // траншея вдоль трассы (между берегами)
  const inT = smooth(cl + 120, cl + 420, x) * smooth(cr - 120, cr - 420, x);
  if (inT > 0) {
    const az = Math.abs(z);
    let tr = az <= 25 ? TRENCH : TRENCH + (az - 25) * 0.5;
    if (x < 0 && az > HW && az < 46) tr = Math.max(tr, -30.6); // засыпка вдоль готовых секций
    if (tr < h) h = lerp(h, tr, inT);
  }
  return h;
};
const groundCol = (x: number, z: number, h: number, c: THREE.Color) => {
  const n = 0.5 + 0.5 * Math.sin(x * 0.07 + z * 0.05) * Math.sin(x * 0.013 - z * 0.03);
  if (h > 1.2) return c.set('#6f8a48').lerp(new THREE.Color('#9a9a5a'), n * 0.6);
  if (h > -1.0) return c.set('#d6c39a');
  if (h < -33) return c.set(x < 0 && Math.abs(z) < 46 ? '#8a877f' : '#6e604c').lerp(new THREE.Color('#5c5244'), n * 0.3);
  return c.set('#8f7d5e').lerp(new THREE.Color('#a28f6c'), n * 0.5);
};

// ---------- текстуры ----------
const concreteTex = (base: string, seed: number, rep: number) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 5000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.06)', 'rgba(90,80,70,0.05)'], seed, [1, 4]);
  // швы опалубки — редкие и мягкие (без муара)
  g.strokeStyle = 'rgba(60,55,50,0.10)';
  g.lineWidth = 3;
  for (let x = 0; x <= 512; x += 256) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  const r = rng(seed + 3);
  for (let i = 0; i < 18; i++) {
    const x = r() * 512;
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(70,64,56,0)');
    gr.addColorStop(0.6, `rgba(70,64,56,${0.04 + r() * 0.05})`);
    gr.addColorStop(1, 'rgba(70,64,56,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 4 + r() * 14, 512);
  }
  return tex(c, 1 / rep, 1 / rep);
};
const cutTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#c9c0b0';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 9000, ['rgba(120,110,95,0.35)', 'rgba(80,74,66,0.25)', 'rgba(235,228,214,0.4)'], 7, [1, 3.5]);
  return tex(c, 1 / 6, 1 / 6);
};
const asphaltTex = () => {
  const [c, g] = cv(512, 256);
  g.fillStyle = '#3d3f42';
  g.fillRect(0, 0, 512, 256);
  speckle(g, 512, 256, 6000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.12)'], 11, [1, 2.5]);
  // разметка: 24 м по x на 11,5 м по z; штрих 6 м, разделитель на z = −5,75, края сплошные
  g.fillStyle = 'rgba(236,232,220,0.9)';
  const zp = (z: number) => ((z + 11.5) / 11.5) * 256;
  g.fillRect(0, 256 - zp(-5.75) - 4, (6 / 24) * 512, 8);
  g.fillRect(0, 256 - zp(-10.9) - 4, 512, 8);
  g.fillRect(0, 256 - zp(-0.6) - 4, 512, 8);
  return tex(c, 1 / 24, 1 / 11.5);
};
const panelTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#e4ddcf';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 900, ['rgba(0,0,0,0.04)'], 5, [1, 3]);
  g.fillStyle = 'rgba(70,64,56,0.18)';
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 0, 3, 256);
  // полоса над дорогой
  g.fillStyle = 'rgba(52,96,130,0.55)';
  g.fillRect(0, 170, 256, 16);
  return tex(c, 1 / 4, 1 / 4);
};
const steelTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#7d3a26';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1400, ['rgba(0,0,0,0.08)', 'rgba(255,200,170,0.06)'], 9, [1, 4]);
  // рёбра жёсткости
  for (let x = 16; x < 256; x += 64) {
    const gr = g.createLinearGradient(x, 0, x + 20, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.28)');
    gr.addColorStop(0.5, 'rgba(255,220,200,0.12)');
    gr.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 20, 256);
  }
  const r = rng(4);
  for (let i = 0; i < 20; i++) {
    const x = r() * 256;
    const y = r() * 200;
    const gr = g.createLinearGradient(x, y, x, y + 60);
    gr.addColorStop(0, 'rgba(150,80,40,0.3)');
    gr.addColorStop(1, 'rgba(150,80,40,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 2 + r() * 2, 60);
  }
  return tex(c, 1 / 4, 1 / 4);
};
const waterGrad = () => {
  // «стекло» воды на срезе: по мировой высоте (v = (y+60)/62)
  const [c, g] = cv(8, 512);
  const gr = g.createLinearGradient(0, 512, 0, 0);
  gr.addColorStop(0, '#071f2a');
  gr.addColorStop(0.45, '#0f3f4e');
  gr.addColorStop(0.85, '#1f6670');
  gr.addColorStop(0.97, '#3f8c8c');
  gr.addColorStop(1, '#6fb0a6');
  g.fillStyle = gr;
  g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const raysTex = () => {
  const [c, g] = cv(512, 256);
  const r = rng(13);
  for (let i = 0; i < 26; i++) {
    const x = r() * 512;
    const w = 6 + r() * 26;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    const a = 0.25 + r() * 0.35;
    gr.addColorStop(0, `rgba(210,240,230,${a})`);
    gr.addColorStop(0.5, `rgba(180,225,215,${a * 0.25})`);
    gr.addColorStop(1, 'rgba(180,225,215,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + w, 0);
    g.lineTo(x + w + 60, 256);
    g.lineTo(x + 60, 256);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  // v: 0,97 (поверхность) → 0,55 (глубже лучей нет)
  t.repeat.set(1, 1 / 0.45);
  t.offset.set(0, -0.52 / 0.45);
  return t;
};
const seaNormal = () => {
  // карта нормалей волн: сумма синусов → градиент. Плавная, без резких полос.
  const N = 256;
  const [c, g] = cv(N, N);
  const im = g.createImageData(N, N);
  const r = rng(77);
  const waves = Array.from({length: 7}, () => ({kx: Math.round(1 + r() * 5) * (r() < 0.5 ? -1 : 1), ky: Math.round(1 + r() * 5), a: 0.3 + r() * 0.7, ph: r() * 6.28}));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const ph = ((w.kx * x + w.ky * y) / N) * 6.283 + w.ph;
        dx += w.a * w.kx * Math.cos(ph);
        dy += w.a * w.ky * Math.cos(ph);
      }
      const i = (y * N + x) * 4;
      im.data[i] = 128 + dx * 9;
      im.data[i + 1] = 128 + dy * 9;
      im.data[i + 2] = 255;
      im.data[i + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};
const foamTex = () => {
  const [c, g] = cv(256, 64);
  const r = rng(21);
  for (let i = 0; i < 500; i++) {
    const x = r() * 256;
    const y = 32 + (r() - 0.5) * 52 * Math.pow(r(), 0.6);
    g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.4})`;
    g.beginPath();
    g.ellipse(x, y, 2 + r() * 7, 1 + r() * 2, 0, 0, 6.3);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const windowsTex = (base: string, band: string) => {
  const [c, g] = cv(256, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = band;
  for (let x = 6; x < 256; x += 16) g.fillRect(x, 50, 11, 22);
  return tex(c, 1 / 20, 1 / 8);
};

// ---------- геометрия ----------
// коробка в мировых координатах с плоскими UV по метрам (текстура не растягивается)
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
};
// сечение секции (половина): дно, крыша, наружная стена, стенка между автотрубой и ж/д трубой
const elementParts = (x0: number, x1: number) => ({
  conc: [box(x0, x1, 0, 1.1, -HW, 0), box(x0, x1, 7.7, H, -HW, 0), box(x0, x1, 1.1, 7.7, -HW, -19.8), box(x0, x1, 1.1, 7.7, -12.3, -11.5)],
  road: box(x0, x1, 1.1, 1.4, -11.5, 0),
  rail: box(x0, x1, 1.1, 1.4, -19.8, -12.3),
});
// профиль резинового кольца (u — вылет вдоль −x, v — поперёк)
const GINA_PTS: [number, number][] = [
  [0, -0.26], [0.1, -0.26], [0.16, -0.2], [0.3, -0.17], [0.46, -0.12], [0.57, -0.06], [0.6, 0], [0.57, 0.06], [0.46, 0.12], [0.3, 0.17], [0.16, 0.2], [0.1, 0.26], [0, 0.26],
];
const ginaRun = (len: number) => {
  const s = new THREE.Shape(GINA_PTS.map(([u, v]) => new THREE.Vector2(-u * GS, v * GS)));
  return new THREE.ExtrudeGeometry(s, {depth: len, bevelEnabled: false, curveSegments: 4});
};
const makeGina = (mat: THREE.Material, clamp: THREE.Material) => {
  const g = new THREE.Group();
  const yb = 0.75;
  const yt = H - 0.75;
  const zs = -HW + 0.75;
  const bot = ginaRun(-zs);
  bot.translate(0, yb, zs);
  const top = ginaRun(-zs);
  top.translate(0, yt, zs);
  const side = ginaRun(yt - yb);
  side.rotateX(-Math.PI / 2);
  side.translate(0, yb, zs);
  g.add(new THREE.Mesh(mergeGeometries([bot, top, side]), mat));
  // стальной прижимной фланец
  const fl = [box(-0.12, 0, yb - 0.38, yb + 0.38, zs - 0.38, 0), box(-0.12, 0, yt - 0.38, yt + 0.38, zs - 0.38, 0), box(-0.12, 0, yb - 0.38, yt + 0.38, zs - 0.38, zs + 0.38)];
  const clampMesh = new THREE.Mesh(mergeGeometries(fl), clamp);
  clampMesh.userData.noScale = true;
  g.add(clampMesh);
  return g;
};
// корпус судна: контур сверху (x — вдоль, z — поперёк), выдавлен по высоте
const hullGeo = (len: number, beam: number, depth: number, bow = 0.22) => {
  const s = new THREE.Shape();
  const hl = len / 2;
  const hb = beam / 2;
  s.moveTo(-hl, -hb * 0.9);
  s.lineTo(hl * (1 - bow), -hb);
  s.quadraticCurveTo(hl, -hb * 0.6, hl, 0);
  s.quadraticCurveTo(hl, hb * 0.6, hl * (1 - bow), hb);
  s.lineTo(-hl, hb * 0.9);
  s.quadraticCurveTo(-hl - hb * 0.15, 0, -hl, -hb * 0.9);
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2, curveSegments: 10});
  g.rotateX(-Math.PI / 2); // выдавливание вверх (по y), контур в x-z
  return g;
};
const makeTug = (m: Record<string, any>) => {
  const g = new THREE.Group();
  const lo = hullGeo(30, 11, 3.2);
  lo.translate(0, -2.6, 0);
  g.add(new THREE.Mesh(lo, m.tugRed));
  const hi = hullGeo(29.4, 10.6, 1.4);
  hi.translate(0, 0.6, 0);
  g.add(new THREE.Mesh(hi, m.tugDark));
  // фальшборт с отбойником
  const fend = hullGeo(30.6, 11.6, 0.7);
  fend.translate(0, 1.6, 0);
  g.add(new THREE.Mesh(fend, m.tire));
  g.add(new THREE.Mesh(box(-1, 9, 2.0, 5.2, -3.6, 3.6), m.tugWhite));
  g.add(new THREE.Mesh(box(1.5, 8.5, 5.2, 8.3, -3.2, 3.2), m.tugCab));
  g.add(new THREE.Mesh(box(1.2, 8.8, 8.3, 8.7, -3.5, 3.5), m.tugDark));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 6, 8), m.tugWhite);
  mast.position.set(5, 11.5, 0);
  g.add(mast);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 4.5, 14), m.tugYellow);
    f.position.set(-1.5, 5.6, s * 2.4);
    g.add(f);
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.6, 14), m.tugDark);
    fb.position.set(-1.5, 7.6, s * 2.4);
    g.add(fb);
  }
  // буксирный гак на корме
  g.add(new THREE.Mesh(box(-13, -11.5, 2.0, 3.2, -0.6, 0.6), m.tugDark));
  return g;
};
const makeFerry = (m: Record<string, any>) => {
  const g = new THREE.Group();
  const lo = hullGeo(142, 25, 6, 0.12);
  lo.translate(0, -5, 0);
  g.add(new THREE.Mesh(lo, m.ferryHull));
  const mid = hullGeo(140, 24.4, 4, 0.12);
  mid.translate(0, 1.2, 0);
  g.add(new THREE.Mesh(mid, m.ferryWhite));
  g.add(new THREE.Mesh(box(-58, 52, 5.6, 12.5, -11.6, 11.6), m.ferryDecks));
  g.add(new THREE.Mesh(box(-30, 34, 12.5, 18, -10.5, 10.5), m.ferryDecks));
  g.add(new THREE.Mesh(box(16, 30, 18, 22, -11.5, 11.5), m.ferryBridge));
  g.add(new THREE.Mesh(box(-20, -10, 18, 25, -3.5, 3.5), m.ferryWhite));
  g.add(new THREE.Mesh(box(-20.2, -9.8, 23, 25.2, -3.7, 3.7), m.ferryHull));
  return g;
};
const makeTurbine = (m: Record<string, any>) => {
  const g = new THREE.Group();
  const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 92, 12), m.white);
  tw.position.y = 46;
  g.add(tw);
  g.add(new THREE.Mesh(box(-3, 9, 90.5, 94.5, -1.8, 1.8), m.white));
  const rot = new THREE.Group();
  rot.position.set(-3.6, 92.5, 0);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), m.white);
  hub.scale.set(1.4, 1, 1);
  rot.add(hub);
  const bl = new THREE.Shape([new THREE.Vector2(-1.4, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(0.4, 52), new THREE.Vector2(-0.2, 52)]);
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(new THREE.ShapeGeometry(bl), m.whiteDS);
    b.rotation.set(0, Math.PI / 2, (k * Math.PI * 2) / 3);
    rot.add(b);
  }
  g.add(rot);
  g.userData.rot = rot;
  return g;
};
const makeCar = (m: Record<string, any>, color: THREE.Material) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(4.5, 0.85, 1.85, 2, 0.25), color);
  body.position.y = 0.72;
  g.add(body);
  const cab = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.7, 1.6, 2, 0.25), m.glass);
  cab.position.set(-0.3, 1.38, 0);
  g.add(cab);
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(box(2.2, 2.3, 0.6, 0.85, s * 0.75 - 0.2, s * 0.75 + 0.2), m.headL);
    g.add(hl);
    const tl = new THREE.Mesh(box(-2.3, -2.2, 0.65, 0.85, s * 0.75 - 0.2, s * 0.75 + 0.2), m.tailL);
    g.add(tl);
  }
  return g;
};
// поверхность «стекла» воды на срезе: контур от поверхности до дна, вырезы под секции
const SAMP = (() => {
  const xs: number[] = [];
  for (let x = -4200; x <= 4200; x += 30) xs.push(x);
  return xs;
})();
const waterFace = (ex: number, yb: number, joined: boolean) => {
  const top = Math.min(0, yb + H);
  const s = new THREE.Shape();
  const bed = (x: number) => (x > XL - 2 && x < 900 ? Math.max(ground(x, 0), REST_YB) : ground(x, 0));
  const pts: [number, number][] = [];
  // нижняя кромка — по дну (слева направо), верхняя — по поверхности (справа налево)
  SAMP.forEach((x) => {
    const b = bed(x);
    if (b < -0.3) pts.push([x, b]);
  });
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  pts.push([x1, 0]);
  const floating = yb + H > 0;
  if (floating) pts.push([ex + L - 1, 0], [ex + L - 1, yb], [ex + 1, yb], [ex + 1, 0]);
  pts.push([x0, 0]);
  s.setFromPoints(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  // вырезы: готовая цепочка; новая секция (если под водой); при стыковке — одна общая прорезь
  const hole = (a: number, b: number, c: number, d: number) => {
    const h = new THREE.Path();
    h.moveTo(a, c);
    h.lineTo(a, d);
    h.lineTo(b, d);
    h.lineTo(b, c);
    h.closePath();
    s.holes.push(h);
  };
  if (joined) hole(XL, ex + L - 1, REST_YB + 0.05, REST_YB + H);
  else {
    hole(XL, -1, REST_YB + 0.05, REST_YB + H);
    if (!floating) hole(ex + 1, ex + L - 1, Math.max(yb, REST_YB + 0.05), Math.min(top, -0.05));
  }
  const g = new THREE.ShapeGeometry(s);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) uv.set([p.getX(i) / 60, (p.getY(i) + 60) / 62], i * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.translate(0, 0, WZ);
  return g;
};
// срез грунта под дном (z = 0): слои
const soilLayer = (topOff: number, botOff: number, mat: THREE.Material, floor = -200) => {
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  SAMP.forEach((x) => {
    const g0 = ground(x, 0);
    top.push([x, Math.max(floor, g0 - topOff)]);
    bot.push([x, Math.max(floor, g0 - botOff)]);
  });
  const pts = [...top, ...bot.reverse()];
  const me = new THREE.Mesh(polyFace(pts, 0), mat);
  return me;
};

const useWorld = () =>
  useMemo(() => {
    const r = rng(41);
    const m: Record<string, any> = {
      conc: new THREE.MeshStandardMaterial({map: concreteTex('#b8b1a3', 3, 9), roughness: 0.9}),
      concOld: new THREE.MeshStandardMaterial({map: concreteTex('#a29d92', 5, 9), roughness: 0.95}),
      cut: new THREE.MeshStandardMaterial({map: cutTex(), roughness: 0.95}),
      road: new THREE.MeshStandardMaterial({map: asphaltTex(), roughness: 0.85}),
      rail: new THREE.MeshStandardMaterial({color: '#8d877c', roughness: 1}),
      panel: new THREE.MeshStandardMaterial({map: panelTex(), roughness: 0.7}),
      steel: new THREE.MeshStandardMaterial({map: steelTex(), roughness: 0.6, metalness: 0.35, emissive: '#ff9a50', emissiveIntensity: 0}),
      rubber: new THREE.MeshStandardMaterial({color: '#141516', roughness: 0.3, metalness: 0, emissive: '#ffb347', emissiveIntensity: 0}),
      clampSteel: new THREE.MeshStandardMaterial({color: '#5d6266', roughness: 0.45, metalness: 0.7}),
      tankWall: new THREE.MeshStandardMaterial({color: '#8f969a', roughness: 0.5, metalness: 0.5, emissive: '#5ab4ff', emissiveIntensity: 0}),
      tankWater: new THREE.MeshStandardMaterial({color: '#2f86b6', roughness: 0.15, transparent: true, opacity: 0.82, depthWrite: false}),
      wface: new THREE.MeshBasicMaterial({map: waterGrad(), transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide}),
      rays: new THREE.MeshBasicMaterial({map: raysTex(), transparent: true, opacity: 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending}),
      chamber: new THREE.MeshBasicMaterial({map: waterGrad(), transparent: true, opacity: 0.5, depthWrite: false, fog: false}),
      backWall: new THREE.MeshBasicMaterial({color: '#0f3b4a', fog: false}),
      sea: new THREE.MeshPhysicalMaterial({color: '#24576c', roughness: 0.42, metalness: 0, normalMap: seaNormal(), normalScale: new THREE.Vector2(0.16, 0.16), specularIntensity: 0.55, envMapIntensity: 0.55}),
      seaFront: null as any,
      ground: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1}),
      groundFront: null as any,
      soil1: new THREE.MeshStandardMaterial({color: '#7b6d58', roughness: 1, map: cutTex()}),
      soil2: new THREE.MeshStandardMaterial({color: '#665848', roughness: 1, map: cutTex()}),
      soil3: new THREE.MeshStandardMaterial({color: '#4b4540', roughness: 1, map: cutTex()}),
      soil4: new THREE.MeshStandardMaterial({color: '#363331', roughness: 1, map: cutTex()}),
      gravel: new THREE.MeshStandardMaterial({color: '#6f6b64', roughness: 1, map: cutTex()}),
      foam: new THREE.MeshBasicMaterial({map: foamTex(), transparent: true, opacity: 0, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -4}),
      rope: new THREE.MeshStandardMaterial({color: '#2b2a28', roughness: 0.8, transparent: true}),
      ponton: new THREE.MeshStandardMaterial({color: '#d99a26', roughness: 0.6, metalness: 0.2}),
      pontonFront: null as any,
      dark: new THREE.MeshStandardMaterial({color: '#33383d', roughness: 0.6, metalness: 0.3}),
      tugRed: new THREE.MeshStandardMaterial({color: '#9e2f22', roughness: 0.6}),
      tugDark: new THREE.MeshStandardMaterial({color: '#2b3036', roughness: 0.6}),
      tugWhite: new THREE.MeshStandardMaterial({color: '#e9e6df', roughness: 0.55}),
      tugCab: new THREE.MeshStandardMaterial({map: windowsTex('#e9e6df', '#25313b'), roughness: 0.5}),
      tugYellow: new THREE.MeshStandardMaterial({color: '#d9a52b', roughness: 0.5}),
      tire: new THREE.MeshStandardMaterial({color: '#1f1f1f', roughness: 0.9}),
      ferryHull: new THREE.MeshStandardMaterial({color: '#1f3550', roughness: 0.55}),
      ferryWhite: new THREE.MeshStandardMaterial({color: '#f0eee8', roughness: 0.5}),
      ferryDecks: new THREE.MeshStandardMaterial({map: windowsTex('#f0eee8', '#2a3a4a'), roughness: 0.5}),
      ferryBridge: new THREE.MeshStandardMaterial({map: windowsTex('#f0eee8', '#1c2630'), roughness: 0.5}),
      white: new THREE.MeshStandardMaterial({color: '#f2f1ec', roughness: 0.5}),
      whiteDS: new THREE.MeshStandardMaterial({color: '#f2f1ec', roughness: 0.5, side: THREE.DoubleSide}),
      glass: new THREE.MeshStandardMaterial({color: '#222c34', roughness: 0.2, metalness: 0.5}),
      headL: new THREE.MeshBasicMaterial({color: '#fff6dc'}),
      tailL: new THREE.MeshBasicMaterial({color: '#ff3a2a'}),
      lamp: new THREE.MeshBasicMaterial({color: '#ffe9c2'}),
      mark: new THREE.MeshBasicMaterial({color: '#FFD54A', transparent: true, opacity: 0, depthWrite: false, fog: false}),
      specks: new THREE.PointsMaterial({color: '#cfe8e0', size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.35, depthWrite: false, fog: false}),
      arrow: new THREE.MeshBasicMaterial({color: '#f4fbff', transparent: true, opacity: 0, depthWrite: false, fog: false}),
    };
    // ближние (z > 0) море, суша и поплавок понтона прячутся, когда смотрим в разрез
    m.seaFront = (m.sea as THREE.MeshPhysicalMaterial).clone();
    m.seaFront.transparent = true;
    const clipLand = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.0);
    m.groundFront = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, clippingPlanes: [clipLand]});
    const clipFront = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
    m.pontonFront = new THREE.MeshStandardMaterial({color: '#d99a26', roughness: 0.6, metalness: 0.2, clippingPlanes: [clipFront]});
    (m.sea.normalMap as THREE.Texture).repeat.set(70, 35);
    const seaN2 = (m.sea.normalMap as THREE.Texture).clone();
    seaN2.needsUpdate = true;
    m.seaFront.normalMap = seaN2;
    seaN2.repeat.set(70, 35);

    const world = new THREE.Group();
    // --- рельеф: дальняя половина целиком, ближняя — только суша (ниже −1 отрезано)
    const terr = (z0: number, z1: number, mat: THREE.Material) => {
      const xs: number[] = [];
      for (let x = -6000; x <= 6000; x += x > -900 && x < 600 ? 12 : 40) xs.push(x);
      const zs: number[] = [];
      const za = Math.abs(z0) > Math.abs(z1) ? z0 : z1;
      const sg = Math.sign(za);
      for (let k = 0; ; k++) {
        const d = k < 22 ? k * 3 : k < 40 ? 66 + (k - 22) * 12 : 282 + (k - 40) * 80;
        if (d > Math.abs(za)) {
          zs.push(za);
          break;
        }
        zs.push(sg * d);
      }
      const pos = new Float32Array(xs.length * zs.length * 3);
      const colr = new Float32Array(xs.length * zs.length * 3);
      const c = new THREE.Color();
      zs.forEach((z, j) =>
        xs.forEach((x, i) => {
          const h = ground(x, z);
          const k = j * xs.length + i;
          pos.set([x, h, z], k * 3);
          groundCol(x, z, h, c);
          // под водой — темнее и холоднее с глубиной
          if (h < -1) c.lerp(new THREE.Color('#3f5a62'), clamp01((-h - 2) / 60) * 0.35);
          colr.set([c.r, c.g, c.b], k * 3);
        }),
      );
      const idx: number[] = [];
      for (let j = 0; j < zs.length - 1; j++)
        for (let i = 0; i < xs.length - 1; i++) {
          const a = j * xs.length + i;
          const b = a + xs.length;
          if (sg < 0) idx.push(a, a + 1, b, a + 1, b + 1, b);
          else idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      world.add(new THREE.Mesh(g, mat));
    };
    terr(0, -5000, m.ground);
    terr(0, 5000, m.groundFront);

    // --- срез грунта (z = 0): песок, морена, глина, коренная порода
    world.add(soilLayer(0, 2.5, m.soil1), soilLayer(2.5, 14, m.soil2), soilLayer(14, 40, m.soil3), soilLayer(40, 700, m.soil4, -900));
    // щебёночная постель под секциями (−40…−39,2)
    world.add(new THREE.Mesh(box(XL, 900, TRENCH, REST_YB, -26, 0), m.gravel));
    // задняя «стенка» аквариума
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(12000, 60), m.backWall);
    bw.position.set(0, -30.5, -700);
    world.add(bw);

    // --- готовая цепочка секций (под водой, на дне), внутри дорога, свет, машины
    const pc: THREE.BufferGeometry[] = [];
    const pr: THREE.BufferGeometry[] = [];
    const prl: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    const joints: THREE.BufferGeometry[] = [];
    for (let k = 0; k < NP; k++) {
      const x1 = -k * L;
      const x0 = x1 - L + 0.3;
      const E = elementParts(x0, x1);
      E.conc.forEach((g) => pc.push(g));
      pr.push(E.road);
      prl.push(E.rail);
      for (let x = x0 + 4; x < x1 - 2; x += 8) lamps.push(box(x, x + 4.5, 7.42, 7.6, -6.4, -6.0));
      // резиновый шов между секциями — только по контуру сечения (труба внутри открыта)
      joints.push(box(x0 - 0.3, x0, 0.1, 1.4, -HW + 0.1, -0.05), box(x0 - 0.3, x0, 7.7, H - 0.1, -HW + 0.1, -0.05), box(x0 - 0.3, x0, 1.4, 7.7, -HW + 0.1, -19.8), box(x0 - 0.3, x0, 1.4, 7.7, -12.3, -11.5));
    }
    const pY = REST_YB;
    const chain = new THREE.Group();
    chain.position.y = pY;
    chain.add(new THREE.Mesh(mergeGeometries(pc), m.concOld));
    chain.add(new THREE.Mesh(mergeGeometries(pr), m.road));
    chain.add(new THREE.Mesh(mergeGeometries(prl), m.rail));
    chain.add(new THREE.Mesh(mergeGeometries(lamps), m.lamp));
    chain.add(new THREE.Mesh(mergeGeometries(joints), m.tire));
    // внутренняя стена автотрубы — светлые панели
    chain.add(new THREE.Mesh(box(XL, 0, 1.4, 7.7, -11.5, -11.45), m.panel));
    // заглушка готовой секции со стороны новой
    chain.add(new THREE.Mesh(box(-1.25, -1.0, 1.4, 7.7, -11.5, -0.02), m.steel));
    world.add(chain);

    // --- новая секция E (своя группа: плывёт, тонет, подтягивается)
    const E = new THREE.Group();
    const EP = elementParts(0, L);
    E.add(new THREE.Mesh(mergeGeometries(EP.conc), m.conc));
    E.add(new THREE.Mesh(box(0, L, 1.1, 1.4, -19.8, 0), m.conc));
    // торцевые стальные заглушки (утоплены на 1 м)
    E.add(new THREE.Mesh(box(1.0, 1.25, 1.4, 7.7, -19.8, -0.02), m.steel));
    E.add(new THREE.Mesh(box(L - 1.25, L - 1.0, 1.4, 7.7, -19.8, -0.02), m.steel));
    // балластные баки (стенки) — внутри автотрубы
    const TANKS = [30, 95, 160];
    TANKS.forEach((x) => {
      E.add(new THREE.Mesh(mergeGeometries([box(x, x + 40, 1.4, 5.6, -9.6, -9.3), box(x, x + 0.3, 1.4, 5.6, -9.3, -0.02), box(x + 39.7, x + 40, 1.4, 5.6, -9.3, -0.02)]), m.tankWall));
    });
    // проушины под тросы на крыше
    [40, 50, 167, 177].forEach((x) => E.add(new THREE.Mesh(box(x - 0.6, x + 0.6, H, H + 0.8, -10.4, -9.6), m.dark)));
    const gina = makeGina(m.rubber, m.clampSteel);
    E.add(gina);
    world.add(E);

    // --- понтоны (стоят на поверхности над секцией)
    const pontons = [45, 172].map((x) => {
      const p = new THREE.Group();
      p.position.x = x;
      p.add(new THREE.Mesh(box(-7, 7, -1.6, 1.6, -31, -24), m.ponton));
      p.add(new THREE.Mesh(box(-7, 7, -1.6, 1.6, 22, 29), m.pontonFront));
      [-27.5, 25.5].forEach((z) => {
        p.add(new THREE.Mesh(box(-5, -3.6, 1.6, 9, z - 0.7, z + 0.7), m.ponton));
        p.add(new THREE.Mesh(box(3.6, 5, 1.6, 9, z - 0.7, z + 0.7), m.ponton));
      });
      p.add(new THREE.Mesh(box(-5.5, 5.5, 9, 11, -29, 27), m.ponton));
      p.add(new THREE.Mesh(box(-3, 3, 11, 14.5, -16, -6), m.dark));
      p.add(new THREE.Mesh(box(-3.2, 3.2, 14.5, 15, -16.3, -5.7), m.ponton));
      return p;
    });
    pontons.forEach((p) => world.add(p));

    // --- буксиры
    const TUGS: {x: number; z: number; ry: number; line: [number, number, number]}[] = [
      {x: 300, z: -46, ry: 0.12, line: [L, 3, -18]},
      {x: 292, z: -6, ry: -0.1, line: [L, 3, -3]},
      {x: -55, z: -30, ry: 0.0, line: [0, 3, -16]},
      {x: 120, z: -60, ry: Math.PI / 2, line: [120, 3, -21]},
    ];
    const tugs = TUGS.map((d) => {
      const t = makeTug(m);
      t.position.set(d.x, 0, d.z);
      t.rotation.y = d.ry;
      world.add(t);
      return t;
    });

    // --- паром, ветряки, облака
    const ferry = makeFerry(m);
    world.add(ferry);
    const turbines: THREE.Group[] = [];
    for (let k = 0; k < 14; k++) {
      const side = k < 8 ? -1 : 1;
      const z = -1600 + (k % 8) * 380 + r() * 120;
      const x = coastAt(side, z) + side * (260 + r() * 500);
      const t = makeTurbine(m);
      t.position.set(x, ground(x, z), z);
      t.rotation.y = 0.4;
      t.scale.setScalar(1);
      world.add(t);
      turbines.push(t);
    }
    const puffs: THREE.Sprite[] = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(400 + (i % 12)), color: '#fff2e0', transparent: true, opacity: 0.75, depthWrite: false}));
      const sc = 1200 + r() * 2000;
      s.scale.set(sc, sc * (0.3 + r() * 0.1), 1);
      const a = r() * Math.PI * 2;
      const d = 5500 + r() * 4500;
      s.position.set(Math.cos(a) * d, 500 + r() * 1100, Math.sin(a) * d);
      s.renderOrder = 1;
      world.add(s);
      puffs.push(s);
    }

    // --- море: дальняя половина (с вырезом под плавающую секцию и без), ближняя
    const seaBack = (withHole: boolean) => {
      const s = new THREE.Shape();
      s.moveTo(-8000, 0);
      s.lineTo(8000, 0);
      s.lineTo(8000, 8000);
      s.lineTo(-8000, 8000);
      s.closePath();
      if (withHole) {
        // контур секции + поплавки понтонов (в плане, z → −y шейпа)
        const h = new THREE.Path();
        const e0 = GINA + 5;
        h.moveTo(e0, 0.01);
        h.lineTo(e0 + L, 0.01);
        h.lineTo(e0 + L, HW);
        h.lineTo(e0, HW);
        h.closePath();
        s.holes.push(h);
      }
      const g = new THREE.ShapeGeometry(s);
      g.rotateX(-Math.PI / 2); // y шейпа → −z мира
      const p = g.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) uv.set([p.getX(i) / 16000, p.getZ(i) / 16000], i * 2);
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    };
    const seaA = new THREE.Mesh(seaBack(true), m.sea);
    const seaB = new THREE.Mesh(seaBack(false), m.sea);
    const fg = new THREE.PlaneGeometry(16000, 8000);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, 0, 4000);
    const seaF = new THREE.Mesh(fg, m.seaFront);
    seaF.renderOrder = 3;
    world.add(seaA, seaB, seaF);
    // пена у борта плавающей секции
    const foamRing = new THREE.Mesh(mergeGeometries([box(-1.5, L + 1.5, 0.12, 0.13, -HW - 1.6, -HW - 0.05), box(-1.6, -0.05, 0.12, 0.13, -HW, -0.05), box(L + 0.05, L + 1.6, 0.12, 0.13, -HW, -0.05)]), m.foam);
    foamRing.renderOrder = 4;
    world.add(foamRing);
    // кильватер буксиров
    const wakes = tugs.slice(0, 2).map((t) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(160, 16), m.foam);
      w.rotation.x = -Math.PI / 2;
      w.position.set(t.position.x - 95, 0.15, t.position.z);
      w.renderOrder = 4;
      world.add(w);
      return w;
    });

    // стрелки давления (форма — мягкая стрелка)
    const as = new THREE.Shape();
    as.moveTo(0, 0);
    as.lineTo(2.6, 1.9);
    as.lineTo(2.6, 0.8);
    as.lineTo(6.5, 0.8);
    as.lineTo(6.5, -0.8);
    as.lineTo(2.6, -0.8);
    as.lineTo(2.6, -1.9);
    as.closePath();
    const arrowG = new THREE.ShapeGeometry(as);

    // взвесь в воде у места стройки
    const sp = new Float32Array(2400 * 3);
    for (let i = 0; i < 2400; i++) sp.set([-260 + r() * 560, -39 + r() * 38, WZ + 0.2], i * 3);
    const spG = new THREE.BufferGeometry();
    spG.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const specks = new THREE.Points(spG, m.specks);
    specks.renderOrder = 8;
    world.add(specks);
    const markRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 48), m.mark);
    markRing.renderOrder = 13;
    world.add(markRing);
    // машины
    const carCols = ['#c9ccd0', '#2a3440', '#8a2c22', '#e8e6e0', '#3b5d7a', '#545a60'].map((c) => new THREE.MeshStandardMaterial({color: c, roughness: 0.35, metalness: 0.5}));
    const cars = Array.from({length: 46}, (_, i) => {
      const c = makeCar(m, carCols[i % carCols.length]);
      c.userData.x0 = r() * -XL;
      c.userData.lane = i % 2 ? -9.0 : -4.2;
      c.userData.v = 22 + r() * 8;
      world.add(c);
      return c;
    });

    return {m, world, specks, markRing, E, gina, pontons, tugs, ferry, turbines, seaA, seaB, seaF, foamRing, wakes, arrowG, cars, clipFront, cache: new Map<string, THREE.Object3D>()};
  }, []);

const useSkyLights = () =>
  useMemo(() => {
    const sky = makeSky(SKY, SUN);
    sky.renderOrder = -10;
    const sunS = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex('rgba(255,250,235,1)', 'rgba(255,214,150,0.45)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false}));
    sunS.scale.set(380, 380, 1);
    sunS.renderOrder = -9;
    const sun = new THREE.DirectionalLight('#ffd9ad', 2.9);
    sun.position.copy(SUN).multiplyScalar(500);
    const fill = new THREE.DirectionalLight('#a9c2ea', 0.75);
    fill.position.set(0.35, 0.6, -1).multiplyScalar(500);
    const hemi = new THREE.HemisphereLight('#bcd2f0', '#5b6a6c', 0.75);
    return {sky, sunS, sun, fill, hemi};
  }, []);

const TonnelWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const W0 = useWorld();
  const SL = useSkyLights();
  const {m} = W0;
  const p = clamp01(frame / Math.max(1, dur));
  const t = t0 + frame / fps;
  const dyn = useMemo(() => new THREE.Group(), []);
  const wf = useMemo(() => {
    const me = new THREE.Mesh(new THREE.BufferGeometry(), m.wface);
    me.renderOrder = 6;
    me.frustumCulled = false;
    const ry = new THREE.Mesh(me.geometry, m.rays);
    ry.position.z = 0.05;
    ry.renderOrder = 7;
    ry.frustumCulled = false;
    me.add(ry);
    return me;
  }, []);
  const cached = <T extends THREE.Object3D>(key: string, make: () => T): T => {
    let o = W0.cache.get(key) as T | undefined;
    if (!o) {
      o = make();
      W0.cache.set(key, o);
    }
    return o;
  };

  useLayoutEffect(() => {
    const L2 = SL;
    const all = [W0.world, dyn, wf, L2.sky, L2.sunS, L2.sun, L2.fill, L2.hemi];
    scene.add(...all);
    scene.fog = new THREE.Fog(LOOK.fog, LOOK.fogNear, LOOK.fogFar);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.98;
    gl.shadowMap.enabled = false;
    gl.localClippingEnabled = true;
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const sk = makeSky(SKY, SUN);
    sk.scale.setScalar(0.05);
    envScene.add(sk);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    (scene as any).environmentIntensity = 0.6;
    pm.dispose();
    return () => {
      scene.remove(...all);
      scene.environment = null;
    };
  }, []);

  useLayoutEffect(() => {
    dyn.children.slice().forEach((c: any) => dyn.remove(c));
    const add = (o: THREE.Object3D) => dyn.add(o);

    // --- камера: плавный перелёт (slerp + логарифм расстояния), по видимой длине сцены
    const cs = (P.cam ?? ['hero0', 'hero0']).map((c: string | Cam) => cam(c));
    const q0 = clamp01((p - (P.camDelay ?? 0)) / (P.camDur ?? 1));
    let ca = cs[0];
    let cb = cs[cs.length - 1];
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
    const cp = camBetween(ca, cb, kc);
    camera.position.copy(cp.pos);
    camera.quaternion.copy(cp.q);
    const near = Math.min(3, Math.max(0.15, cp.dist * 0.06));
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== cp.fov || pc.far !== FAR || Math.abs(pc.near - near) > 1e-4) {
      pc.fov = cp.fov;
      pc.near = near;
      pc.far = FAR;
      pc.updateProjectionMatrix();
    }
    SL.sky.position.copy(camera.position);
    SL.sunS.position.copy(camera.position).addScaledVector(SUN, 1500);

    // --- состояние процесса
    const fill = range(P.fill ?? 0, p);
    const sink = easeInOut(range(P.sink ?? 0, p));
    const pull = easeInOut(range(P.pull ?? 0, p));
    const comp = easeInOut(range(P.comp ?? 0, p));
    const drain = range(P.drain ?? 0, p);
    const press = range(P.press ?? 0, p);
    const flow = range(P.flow ?? 0, p);
    const front = range(P.front ?? 1, p);
    const traffic = range(P.traffic ?? 0, p);

    // вода течёт мимо (буксировка) — смещение волн; плюс лёгкая собственная рябь
    const nm = m.sea.normalMap as THREE.Texture;
    const drift = t * 0.0009 + (P.flowBase ?? 0) + flow * p * 0.004;
    nm.offset.set(drift, t * 0.0004);
    (m.seaFront.normalMap as THREE.Texture).offset.copy(nm.offset);
    m.seaFront.opacity = front;
    W0.seaF.visible = front > 0.01;
    W0.clipFront.constant = front > 0.5 ? 1e4 : 0.0; // подводная часть ближнего поплавка — только когда видно ближнее море

    const gscale = 1 - 0.42 * comp;
    const gin = GINA * gscale;
    const ex = gin + 5 * (1 - pull);
    const yb = lerp(FLOAT_YB, REST_YB, sink);
    W0.E.position.set(ex, yb, 0);
    W0.gina.scale.set(gscale, 1, 1);
    const floating = yb + H > 0.02;
    W0.seaA.visible = floating;
    W0.seaB.visible = !floating;
    // пена у борта и кильватер
    m.foam.opacity = 0.75 * clamp01(1 - sink * 30) * (0.55 + 0.45 * flow);
    W0.foamRing.position.x = ex;
    W0.foamRing.visible = floating;
    (m.foam.map as THREE.Texture).offset.x = -t * 0.08 * (0.2 + flow);
    W0.wakes.forEach((w) => (w.visible = flow > 0.02));

    // понтоны стоят над секцией, тросы к проушинам
    W0.pontons.forEach((pp, i) => {
      pp.position.x = ex + (i ? 172 : 45);
      pp.position.y = Math.sin(t * 0.7 + i) * 0.08;
    });
    const ropeTop = 14.5;
    const roofY = yb + H + 0.8;
    [40, 50, 167, 177].forEach((x, k) => {
      const len = ropeTop - roofY;
      const rp = cached(`rope_${k}`, () => new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 6), m.rope));
      rp.position.set(ex + x, roofY + len / 2, -10);
      rp.scale.set(1, len, 1);
      add(rp);
    });
    // буксиры покачиваются; тросы буксировки — пока идёт буксировка и до спуска
    const tow = range(P.towLines ?? 0, p);
    W0.tugs.forEach((tg, i) => {
      tg.position.y = Math.sin(t * 0.9 + i * 1.7) * 0.15;
      tg.rotation.z = Math.sin(t * 0.6 + i) * 0.015;
    });
    if (tow > 0.01)
      [0, 1, 2].forEach((i) => {
        const tg = W0.tugs[i];
        const a = new THREE.Vector3(tg.position.x + (i < 2 ? -12.5 : 12.5) * Math.cos(tg.rotation.y), 2.6, tg.position.z + (i < 2 ? 12.5 : -12.5) * Math.sin(tg.rotation.y));
        const tl = [[ex + L, 1.2, -16], [ex + L, 1.2, -4], [ex, 1.2, -16]][i];
        const b = new THREE.Vector3(tl[0], tl[1], tl[2]);
        const d = b.clone().sub(a);
        const ln = cached(`tow_${i}`, () => {
          const g = new THREE.CylinderGeometry(0.22, 0.22, 1, 6);
          g.rotateX(Math.PI / 2);
          return new THREE.Mesh(g, m.rope);
        });
        ln.position.copy(a).addScaledVector(d, 0.5);
        ln.position.y -= 0.6;
        ln.lookAt(b);
        ln.scale.set(tow, tow, d.length());
        add(ln);
      });
    (m.rope as THREE.MeshStandardMaterial).opacity = 1;

    // вода в балластных баках (растёт уровень)
    [30, 95, 160].forEach((x, k) => {
      const hgt = 0.05 + 3.9 * fill;
      const w = cached(`tw_${k}`, () => new THREE.Mesh(box(0, 39.4, 0, 1, -9.28, -0.04), m.tankWater));
      w.position.set(ex + x + 0.3, yb + 1.42, 0);
      w.scale.set(1, hgt, 1);
      w.renderOrder = 7;
      add(w);
    });

    // «стекло» воды на срезе
    const joined = pull > 0.999;
    wf.geometry.dispose();
    wf.geometry = waterFace(ex, yb, joined);
    (wf.children[0] as THREE.Mesh).geometry = wf.geometry;
    (m.rays.map as THREE.Texture).offset.x = t * 0.006;
    // камера между заглушками: вода уходит
    if (joined && drain < 0.999) {
      const ch = cached('chamber', () => {
        // одна плоскость на срезе, как «стекло» воды (коробка давала двойной тон и скачок при стыковке)
        const g = new THREE.PlaneGeometry(1, 1);
        g.translate(0.5, 0.5, WZ);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.4);
        return new THREE.Mesh(g, m.chamber);
      });
      const top = REST_YB + 1.4 + 6.3 * (1 - drain);
      ch.position.set(-1.0, REST_YB + 1.4, 0);
      ch.scale.set(ex + 2.0, Math.max(0.001, top - (REST_YB + 1.4)), 1);
      ch.renderOrder = 7;
      add(ch);
    }

    // стрелки: море давит на свободный конец
    m.arrow.opacity = 0.78 * press;
    if (press > 0.01)
      [0.25, 0.5, 0.75].forEach((f, k) => {
        const a = cached(`arr_${k}`, () => new THREE.Mesh(W0.arrowG, m.arrow));
        const ph = ((t * 0.35 + k * 0.33) % 1);
        a.position.set(ex + L + 3.5 + 3 * (1 - ph), yb + H * f, WZ + 0.3);
        a.scale.setScalar(0.9 * Math.sin(ph * Math.PI));
        a.renderOrder = 12;
        add(a);
      });

    // метка вокруг кольца (верхняя ветка, срез)
    const mk = range(P.mark ?? 0, p);
    m.mark.opacity = 0.95 * mk;
    W0.markRing.visible = mk > 0.01;
    W0.markRing.position.set(ex - gin / 2, yb + H - 0.75, WZ + 0.3);
    W0.markRing.scale.set(0.95 * (0.6 + 0.4 * gscale), 0.95, 1);
    W0.specks.position.set(Math.sin(t * 0.15) * 1.5, Math.sin(t * 0.21) * 0.6, 0);
    // подсветка названных частей
    const hl = P.hl ?? {};
    m.steel.emissiveIntensity = 0.45 * range(hl.bulk, p);
    m.rubber.emissiveIntensity = 0.35 * range(hl.gina, p);
    m.tankWall.emissiveIntensity = 0.5 * range(hl.tanks, p);

    // паром идёт между берегами, ветряки крутятся
    W0.ferry.position.set(-700 + t * 9, 0.4 + Math.sin(t * 0.5) * 0.1, -520);
    W0.turbines.forEach((tb, i) => ((tb.userData.rot as THREE.Group).rotation.x = t * 1.1 + i));
    // машины в готовом тоннеле
    W0.cars.forEach((c) => {
      c.visible = traffic > 0.01;
      if (!c.visible) return;
      const span = -XL - 40;
      const x = XL + 20 + ((((c.userData.x0 + t * c.userData.v) % span) + span) % span);
      c.position.set(x, REST_YB + 1.4, c.userData.lane);
    });
  }, [frame]);

  return null;
};

const Grade: React.FC = () => {
  const frame = useCurrentFrame();
  const A = LOOK.grade;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: A.shadow, mixBlendMode: 'screen', opacity: A.shadowAmt}} />
      <AbsoluteFill style={{background: A.high, mixBlendMode: 'multiply', opacity: A.highAmt}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(14,20,30,${A.vignette}) 100%)`}} />
      <AbsoluteFill
        style={{
          mixBlendMode: 'overlay',
          opacity: A.grain,
          backgroundImage: `url(${grainTile()})`,
          backgroundSize: '256px 256px',
          backgroundPosition: `${(frame * 97) % 256}px ${(frame * 61) % 256}px`,
        }}
      />
    </AbsoluteFill>
  );
};

export const TonnelScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = lifeIn ?? Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  // плашка гаснет до конца сцены — иначе на склейке она пропадает за один кадр (скачок картинки)
  const bOut = 1 - clamp01((frame - (P.bannerEnd ?? 1) * life + 8) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [300, 8, -110], near: 1, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <TonnelWorld P={P} dur={life} t0={scene.start ?? 0} />
      </ThreeCanvas>
      <Grade />
      {P.banner ? (
        <div style={{position: 'absolute', left: 50, right: 50, top: P.bannerY ?? 300, display: 'flex', justifyContent: 'center', opacity: bIn * bOut, transform: `scale(${0.85 + 0.15 * bIn})`}}>
          <div
            style={{
              textAlign: 'center',
              fontFamily: ROUND,
              fontWeight: 700,
              fontSize: P.bannerSize ?? 62,
              lineHeight: 1.15,
              whiteSpace: 'pre-line',
              color: '#FFD54A',
              WebkitTextStroke: '8px #2a1f00',
              paintOrder: 'stroke fill',
              textTransform: 'uppercase',
              padding: '14px 30px',
              borderRadius: 28,
              background: 'rgba(10,22,34,0.55)',
            }}
          >
            {P.banner}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
