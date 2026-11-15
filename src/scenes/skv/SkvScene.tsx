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
import {Post} from '../../lib/post';
import {camBetween} from '../../lib/camPath';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «Артезианская скважина». Летнее утро, поле, вдали холмы (там водоносный песок выходит наружу).
// Разрез по z = 0: к зрителю (+z) открыт срез земли. Скважина Б (x=0) бьёт фонтаном с хука,
// скважина А (x=6) пробивается в кульминации, колодец-сруб (x=−6) берёт верховодку. 1 единица = 1 м.
type P2 = [number, number];
const YB = -160;
const FAR = 6000;
const SUN = new THREE.Vector3(-0.6, 0.45, 0.66).normalize();
const SKY = {top: '#4a7cc0', mid: '#9fc0e2', horizon: '#eedcbc', glow: '#fff1d6', glowSize: 6};
const LOOK = {fog: '#cdd6dc', fogNear: 260, fogFar: 2400, grade: {shadow: '#1b3352', shadowAmt: 0.05, high: '#ffe4bf', highAmt: 0.05, vignette: 0.3, grain: 0.03}};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const range = (v: any, p: number): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  const [a, b, t0 = 0, t1 = 1] = v as number[];
  return lerp(a, b, easeInOut(clamp01((p - t0) / Math.max(1e-6, t1 - t0))));
};

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  hook0: {pos: [2.5, 2.2, 13], look: [0, 2.2, 0], fov: 50},
  hook1: {pos: [3.5, 3.6, 17], look: [0, 3.4, 0], fov: 50},
  cut: {pos: [-1.5, 0.5, 20], look: [-1.5, -3.6, 0], fov: 50},
  upper: {pos: [-4.2, 0.6, 8.5], look: [-5, -1.0, 0], fov: 50},
  clay: {pos: [-2, -2.6, 10], look: [-2.5, -4.6, 0], fov: 50},
  aqua: {pos: [1.5, -6.5, 10.5], look: [1.0, -8.6, 0], fov: 50},
  wide: {pos: [-40, 28, 75], look: [150, 2, -10], fov: 50},
  hills: {pos: [210, 48, 85], look: [300, 14, -15], fov: 50},
  hose: {pos: [-55, 22, 48], look: [110, 4, -5], fov: 50},
  drillA: {pos: [7.5, -0.5, 15], look: [6, -2.6, 0], fov: 50},
  burstA: {pos: [8.5, 3.2, 19], look: [5, 3.4, 0], fov: 50},
  orbit: {pos: [-6, 4.5, 21], look: [2.5, 2.5, 0], fov: 50},
  deep0: {pos: [4, -4, 30], look: [0, -10, 0], fov: 50},
  deep1: {pos: [10, -30, 75], look: [0, -45, 0], fov: 50},
  flow: {pos: [30, 2, 48], look: [55, -5, 0], fov: 50},
  aus: {pos: [-30, 20, 70], look: [130, 0, -10], fov: 50},
  dacha: {pos: [-2.5, 1.8, 15], look: [-3, 0.2, 0], fov: 50},
  final: {pos: [-12, 9, 36], look: [1, 2.5, -2], fov: 50},
  cover: {pos: [-3, 2.0, 17], look: [-1, 0.6, 0], fov: 50},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.cut : c);

// ---------- рельеф и слои ----------
// поверхность вдоль разреза: ровное поле, к x≈330 — гряда холмов 22 м
const S = (x: number) => {
  const hill = 22 * smooth(110, 330, x) + 3 * Math.sin(x * 0.045) * smooth(200, 330, x);
  const bump = 0.6 * Math.sin(x * 0.11) * Math.sin(x * 0.037 + 1) * smooth(25, 60, Math.abs(x));
  return hill + bump;
};
const Hgt = (x: number, z: number) => {
  const far = smooth(120, 900, -z) * (14 + 10 * Math.sin(x * 0.006 + 1) * Math.sin(z * 0.004));
  const bump = 0.5 * Math.sin(x * 0.07 + z * 0.05) * smooth(20, 60, Math.hypot(x, z));
  return S(x) + far * smooth(0, 40, -z) + bump * smooth(0, 20, -z);
};
// подъём слоёв к холмам (пласт выходит на поверхность)
const L = (x: number) => 40 * smooth(150, 360, x);
// подошвы слоёв (до подъёма): почва, сухой песок, мокрый песок (верховодка), глина, водоносный песок, нижняя глина, известняк
const D = [-0.6, -1.8, -2.4, -7, -11, -70];
const bound = (k: number, x: number) => (k === 0 ? S(x) : k === 7 ? YB : Math.min(S(x), D[k - 1] + (k <= 6 ? L(x) : 0)));
// k-й слой: от bound(k) до bound(k+1); k: 0 почва, 1 сухой песок, 2 верховодка, 3 глина, 4 водоносный, 5 нижняя глина, 6 известняк
const NL = 7;
// вырезы скважин и колодца: [x0, x1, сколько верхних слоёв режет]
const SLOTS: [number, number, number][] = [
  [-0.35, 0.35, 5],
  [5.65, 6.35, 5],
  [-6.6, -5.4, 3],
];
const WELLS = [0, 6];
const AQ_TOP = -7;

// узлы разреза по x (плотно у скважин, редко вдали)
const XS: number[] = (() => {
  const s = new Set<number>();
  for (let x = -1500; x < -200; x += 25) s.add(x);
  for (let x = -200; x < -20; x += 2) s.add(x);
  for (let x = -20; x <= 20; x += 0.5) s.add(Math.round(x * 100) / 100);
  for (let x = 22; x <= 600; x += 2) s.add(x);
  for (let x = 625; x <= 2500; x += 25) s.add(x);
  for (const [a, b] of SLOTS) {
    s.add(a);
    s.add(b);
  }
  return [...s].sort((a, b) => a - b);
})();
const ZS: number[] = (() => {
  const z: number[] = [];
  z.push(0, -1.4);
  for (let v = -2; v > -60; v -= 2) z.push(v);
  for (let v = -60; v > -400; v -= 10) z.push(v);
  for (let v = -400; v >= -2500; v -= 50) z.push(v);
  return z;
})();

// ---------- текстуры ----------
const cv = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
};
const tex = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
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
// слой породы: основа + зерно + камешки + мягкие прожилки
const rockTex = (base: string, grain: string[], stones: string[], seed: number, nStones: number, streaks = 0) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 90, [grain[0].replace(/[\d.]+\)$/, '0.25)')], seed, [18, 50]);
  speckle(g, 512, 512, 9000, grain, seed + 1, [0.8, 2.2]);
  const r = rng(seed + 2);
  for (let i = 0; i < streaks; i++) {
    const y = r() * 512;
    g.strokeStyle = `rgba(${r() > 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.05})`;
    g.lineWidth = 3 + r() * 6;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 6);
    g.stroke();
  }
  speckle(g, 512, 512, nStones, stones, seed + 3, [3, 9]);
  return tex(c);
};
const grassTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#6a7d3c';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 140, ['rgba(120,100,55,0.3)', 'rgba(80,100,45,0.4)', 'rgba(150,165,80,0.25)'], 21, [14, 40]);
  speckle(g, 512, 512, 9000, ['rgba(40,60,25,0.25)', 'rgba(170,180,95,0.2)', 'rgba(95,80,45,0.15)'], 22, [1, 3]);
  return tex(c);
};
const plankTex = (base: string, seed: number) => {
  const [c, g] = cv(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,235,200' : '40,25,10'},${0.05 + r() * 0.07})`;
    g.fillRect(0, i * 64, 256, 64);
    g.fillStyle = 'rgba(40,25,10,0.22)';
    g.fillRect(0, i * 64, 256, 3);
  }
  speckle(g, 256, 256, 1500, ['rgba(60,38,18,0.08)', 'rgba(255,230,190,0.05)'], seed + 1, [1, 2]);
  return tex(c);
};
const dotTex = () => {
  const [c, g] = cv(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
};
const rodTex = () => {
  const [c, g] = cv(64, 16);
  g.fillStyle = '#9aa3a8';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#4c5458';
  g.fillRect(0, 0, 16, 16);
  g.fillRect(32, 0, 16, 16);
  return tex(c);
};
// срез «передней половины» земли (для хука): полосы слоёв на 20 м
const blockTex = () => {
  const [c, g] = cv(256, 1024);
  const ppm = 1024 / 20;
  const bands: [number, string][] = [
    [0, '#46301f'],
    [0.6, '#c49a5c'],
    [1.8, '#8a7a5e'],
    [2.4, '#9b5d3f'],
    [7, '#7d97a3'],
    [11, '#6b5a52'],
    [20.5, '#6b5a52'],
  ];
  for (let i = 0; i < bands.length - 1; i++) {
    g.fillStyle = bands[i][1];
    g.fillRect(0, bands[i][0] * ppm, 256, (bands[i + 1][0] - bands[i][0]) * ppm + 1);
  }
  speckle(g, 256, 1024, 5000, ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.06)'], 41, [1, 3]);
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
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

// ---------- геометрия ----------
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};
const cyl = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8) => {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
};
// поле-рельеф по узлам XS × ZS (передний ряд совпадает с верхом разреза)
const terrainGeo = () => {
  const nx = XS.length;
  const nz = ZS.length;
  const P = new Float32Array(nx * nz * 3);
  const U = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = XS[i];
      const z = ZS[j];
      const o = j * nx + i;
      P.set([x, j === 0 ? S(x) : Hgt(x, z), z], o * 3);
      U.set([x / 8, -z / 8], o * 2);
    }
  const I: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // дыра под срубом колодца
      if (XS[i] >= -6.6 && XS[i + 1] <= -5.4 && ZS[j] === 0) continue;
      I.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
};
// лента одного слоя на срезе z=0 (без вырезов)
const layerGeo = (k: number) => {
  const P: number[] = [];
  const U: number[] = [];
  for (let i = 0; i < XS.length - 1; i++) {
    const x0 = XS[i];
    const x1 = XS[i + 1];
    const xm = (x0 + x1) / 2;
    if (SLOTS.some(([a, b, n]) => k < n && xm > a && xm < b)) continue;
    const t0 = bound(k, x0);
    const b0 = bound(k + 1, x0);
    const t1 = bound(k, x1);
    const b1 = bound(k + 1, x1);
    if (t0 - b0 < 1e-3 && t1 - b1 < 1e-3) continue;
    P.push(x0, b0, 0, x1, b1, 0, x1, t1, 0, x0, b0, 0, x1, t1, 0, x0, t0, 0);
    const sc = k >= 5 ? 12 : 6;
    U.push(x0 / sc, b0 / sc, x1 / sc, b1 / sc, x1 / sc, t1 / sc, x0 / sc, b0 / sc, x1 / sc, t1 / sc, x0 / sc, t0 / sc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
};
const flatArrow = (len: number, sw: number, hw: number, hl: number) => {
  const s = new THREE.Shape();
  s.moveTo(0, -sw / 2);
  s.lineTo(len - hl, -sw / 2);
  s.lineTo(len - hl, -hw / 2);
  s.lineTo(len, 0);
  s.lineTo(len - hl, hw / 2);
  s.lineTo(len - hl, sw / 2);
  s.lineTo(0, sw / 2);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.translate(-len / 2, 0, 0);
  return g;
};
const makeSky = (dir: THREE.Vector3) => {
  const g = new THREE.SphereGeometry(1800, 48, 24);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(SKY.top);
  const mid = new THREE.Color(SKY.mid);
  const hor = new THREE.Color(SKY.horizon);
  const glow = new THREE.Color(SKY.glow);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const e = v.y;
    if (e <= 0.0) c.copy(hor).lerp(mid, 0.35);
    else if (e < 0.16) c.copy(hor).lerp(mid, e / 0.16);
    else c.copy(mid).lerp(top, Math.min(1, (e - 0.16) / 0.5));
    const d = Math.max(0, v.dot(dir));
    c.lerp(glow, Math.min(0.85, Math.pow(d, SKY.glowSize) * 0.85 * (1 - Math.min(1, Math.max(0, e) * 2.5))));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false});
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
};

// буровая вышка-тренога над скважиной в x0
const rigGeo = (x0: number) => {
  const apex = new THREE.Vector3(x0, 6.2, -0.05);
  const feet = [new THREE.Vector3(x0 - 1.8, -0.15, -0.5), new THREE.Vector3(x0 + 1.8, -0.15, -0.5), new THREE.Vector3(x0, -0.15, -3.2)];
  const frame: THREE.BufferGeometry[] = [];
  feet.forEach((f) => frame.push(cyl(f, apex, 0.09, 8)));
  // распорки на высоте 2 м
  const at = (f: THREE.Vector3, k: number) => f.clone().lerp(apex, k);
  for (let i = 0; i < 3; i++) frame.push(cyl(at(feet[i], 0.33), at(feet[(i + 1) % 3], 0.33), 0.045, 6));
  const top = new THREE.CylinderGeometry(0.32, 0.32, 0.16, 16);
  top.rotateX(Math.PI / 2);
  top.translate(x0, 6.1, -0.05);
  frame.push(top);
  return mergeGeometries(frame.map((g) => (g.index ? g.toNonIndexed() : g)));
};

// фонтан: капли по баллистике
const NDROP = 520;
type Fount = {pts: THREE.Points; jet: THREE.Mesh; col: THREE.Mesh; pud: THREE.Mesh; seeds: Float32Array};
const makeFount = (m: Record<string, any>, seed: number): Fount => {
  const r = rng(seed);
  const seeds = new Float32Array(NDROP * 4);
  for (let i = 0; i < NDROP; i++) seeds.set([r(), r() * Math.PI * 2, 0.25 + r() * 1.3, 0.72 + r() * 0.28], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NDROP * 3), 3));
  const pts = new THREE.Points(g, m.drop);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  const jg = new THREE.CylinderGeometry(0.07, 0.2, 1, 14, 1, true);
  jg.translate(0, 0.5, 0);
  const jet = new THREE.Mesh(jg, m.jet);
  jet.renderOrder = 5;
  // столб воды в трубе (задняя половина — видна в разрезе)
  const cg = new THREE.CylinderGeometry(0.19, 0.19, 1, 14, 1, true, Math.PI / 2, Math.PI);
  cg.translate(0, 0.5, 0);
  const col = new THREE.Mesh(cg, m.waterIn);
  const pg = new THREE.CircleGeometry(1, 40, 0, Math.PI);
  pg.rotateX(-Math.PI / 2);
  const pud = new THREE.Mesh(pg, m.puddle);
  pud.renderOrder = 2;
  return {pts, jet, col, pud, seeds};
};
const updFount = (f: Fount, x0: number, on: number, sec: number, drill: number, rise: number, pud: number) => {
  const H = 8 * on;
  const v0 = Math.sqrt(2 * 9.81 * Math.max(0.01, H));
  const pos = f.pts.geometry.attributes.position as THREE.BufferAttribute;
  f.pts.visible = on > 0.02;
  if (f.pts.visible) {
    for (let i = 0; i < NDROP; i++) {
      const [ph, ang, sp, vf] = [f.seeds[i * 4], f.seeds[i * 4 + 1], f.seeds[i * 4 + 2], f.seeds[i * 4 + 3]];
      const vy = v0 * vf;
      const T = (2 * vy) / 9.81 + 0.12;
      const a = (((sec / T + ph) % 1) + 1) % 1 * T;
      const y = 0.55 + vy * a - 4.905 * a * a;
      const h = sp * a * (0.5 + 0.5 * on);
      const x = x0 + Math.cos(ang) * h;
      const z = Math.sin(ang) * h - 0.05;
      if (y < 0.02 || (z > 0 && y < 0.3)) pos.setXYZ(i, x0, -500, 0);
      else pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }
  f.jet.visible = on > 0.02;
  f.jet.position.set(x0, 0.55, 0);
  f.jet.scale.set(0.6 + 0.4 * on, Math.max(0.01, H * 0.82), 0.6 + 0.4 * on);
  const top = lerp(-drill, 0.55, rise);
  f.col.visible = rise > 0.001;
  f.col.position.set(x0, -drill, 0);
  f.col.scale.set(1, Math.max(0.01, top + drill), 1);
  f.pud.visible = pud > 0.01;
  f.pud.position.set(x0, 0.05, -0.02);
  f.pud.scale.setScalar(0.5 + 2.6 * pud);
};

const useWorld = () =>
  useMemo(() => {
    const r = rng(17);
    const dot = dotTex();
    const lay = [
      rockTex('#4a3322', ['rgba(0,0,0,0.12)', 'rgba(150,120,90,0.12)'], ['rgba(30,20,12,0.5)'], 51, 40, 0),
      rockTex('#c9a062', ['rgba(120,90,50,0.16)', 'rgba(255,240,210,0.16)'], ['rgba(140,120,100,0.5)', 'rgba(90,75,60,0.45)'], 52, 70, 2),
      rockTex('#93806a', ['rgba(60,50,40,0.15)', 'rgba(200,215,225,0.12)'], ['rgba(110,100,95,0.5)'], 53, 60, 2),
      rockTex('#a5603f', ['rgba(80,35,20,0.13)', 'rgba(230,170,130,0.12)'], ['rgba(120,70,50,0.35)'], 54, 18, 8),
      rockTex('#dcc08a', ['rgba(140,110,70,0.16)', 'rgba(255,250,235,0.18)'], ['rgba(160,150,140,0.55)', 'rgba(110,100,95,0.45)'], 55, 120, 3),
      rockTex('#76605a', ['rgba(30,20,20,0.13)', 'rgba(180,160,150,0.1)'], ['rgba(70,60,60,0.35)'], 56, 20, 10),
      rockTex('#a8a396', ['rgba(60,60,55,0.13)', 'rgba(240,240,230,0.12)'], ['rgba(130,125,115,0.5)'], 57, 50, 6),
    ];
    const m: Record<string, any> = {
      grass: new THREE.MeshStandardMaterial({map: grassTex(), roughness: 1}),
      layers: lay.map((t) => new THREE.MeshStandardMaterial({map: t, roughness: 0.95, side: THREE.DoubleSide})),
      block: new THREE.MeshStandardMaterial({map: blockTex(), roughness: 0.95}),
      cavity: new THREE.MeshStandardMaterial({color: '#2c221a', roughness: 1, side: THREE.DoubleSide}),
      steel: new THREE.MeshStandardMaterial({color: '#8a959b', roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide}),
      rig: new THREE.MeshStandardMaterial({color: '#b4603a', roughness: 0.55, metalness: 0.35}),
      head: new THREE.MeshStandardMaterial({color: '#d4a640', roughness: 0.5, metalness: 0.3}),
      motor: new THREE.MeshStandardMaterial({color: '#465f45', roughness: 0.55, metalness: 0.3}),
      rod: new THREE.MeshStandardMaterial({map: rodTex(), roughness: 0.35, metalness: 0.6}),
      bit: new THREE.MeshStandardMaterial({color: '#3d4245', roughness: 0.4, metalness: 0.8}),
      log: new THREE.MeshStandardMaterial({map: plankTex('#8a6440', 61), roughness: 0.85}),
      plank: new THREE.MeshStandardMaterial({map: plankTex('#6e5034', 62), roughness: 0.9, side: THREE.DoubleSide}),
      wellWater: new THREE.MeshStandardMaterial({color: '#4f6f78', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, side: THREE.DoubleSide}),
      waterIn: new THREE.MeshStandardMaterial({color: '#5d9fc4', roughness: 0.1, metalness: 0.1, emissive: '#1d4a66', emissiveIntensity: 0.4, side: THREE.DoubleSide}),
      jet: new THREE.MeshStandardMaterial({color: '#dff1ff', roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide}),
      drop: new THREE.PointsMaterial({color: '#e6f4ff', size: 0.11, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05}),
      dirty: new THREE.PointsMaterial({color: '#8a7350', size: 0.12, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05}),
      seep: new THREE.PointsMaterial({color: '#bfe3ff', size: 1.1, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05}),
      puddle: new THREE.MeshStandardMaterial({color: '#7fa6ba', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}),
      arrow: new THREE.MeshBasicMaterial({color: '#dff3ff', toneMapped: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, fog: false}),
      level: new THREE.MeshBasicMaterial({color: '#FFD54A', toneMapped: false, transparent: true, opacity: 0.95, depthTest: false, fog: false}),
      ruler: new THREE.MeshBasicMaterial({color: '#FFD54A', toneMapped: false, transparent: true, opacity: 0.95, depthTest: false}),
      rain: new THREE.LineBasicMaterial({color: '#c8d4de', transparent: true, opacity: 0.55, fog: true}),
      trees: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, flatShading: true}),
      rope: new THREE.MeshStandardMaterial({color: '#c9b48a', roughness: 1}),
      bucket: new THREE.MeshStandardMaterial({color: '#7f8a8f', roughness: 0.4, metalness: 0.6}),
    };
    const world = new THREE.Group();
    // --- земля
    world.add(new THREE.Mesh(terrainGeo(), m.grass));
    const layerMeshes: THREE.Mesh[] = [];
    for (let k = 0; k < NL; k++) {
      const me = new THREE.Mesh(layerGeo(k), m.layers[k]);
      layerMeshes.push(me);
      world.add(me);
    }
    // --- полости вырезов (задняя стенка + бока), колодец — с обшивкой из досок
    const cavity = (a: number, b: number, depth: number, mat: THREE.Material, zb: number) => {
      const ps = [box(a, b, -depth, 0, zb - 0.02, zb), box(a - 0.02, a, -depth, 0, zb, 0), box(b, b + 0.02, -depth, 0, zb, 0), box(a, b, -depth - 0.02, -depth, zb, 0)];
      return new THREE.Mesh(mergeGeometries(ps), mat);
    };
    // скважины: полость растёт вместе с бурением — масштаб по y (геометрия на 1 м)
    const cavs = WELLS.map((x) => {
      const c = cavity(x - 0.35, x + 0.35, 1, m.cavity, -0.6);
      world.add(c);
      return c;
    });
    world.add(cavity(-6.6, -5.4, 2.4, m.plank, -1.4));
    // вода в колодце: срез + зеркало
    {
      const w1 = new THREE.Mesh(box(-6.58, -5.42, -2.38, -1.8, -1.38, -0.03), m.wellWater);
      w1.renderOrder = 3;
      world.add(w1);
    }
    // сруб колодца + ворот
    {
      const ps: THREE.BufferGeometry[] = [];
      const cx = -6;
      const cz = -0.75;
      const hw = 0.82;
      for (let t = 0; t < 6; t++) {
        const y = 0.09 + t * 0.17;
        if (t % 2 === 0) {
          ps.push(cyl(new THREE.Vector3(cx - hw - 0.12, y, cz - hw), new THREE.Vector3(cx + hw + 0.12, y, cz - hw), 0.09, 8));
          ps.push(cyl(new THREE.Vector3(cx - hw - 0.12, y, cz + hw - 0.1), new THREE.Vector3(cx + hw + 0.12, y, cz + hw - 0.1), 0.09, 8));
        } else {
          ps.push(cyl(new THREE.Vector3(cx - hw, y, cz - hw - 0.12), new THREE.Vector3(cx - hw, y, cz + hw - 0.02), 0.09, 8));
          ps.push(cyl(new THREE.Vector3(cx + hw, y, cz - hw - 0.12), new THREE.Vector3(cx + hw, y, cz + hw - 0.02), 0.09, 8));
        }
      }
      for (const sx of [-1, 1]) ps.push(box(cx + sx * 1.0 - 0.06, cx + sx * 1.0 + 0.06, 0, 1.75, cz - 0.06, cz + 0.06));
      ps.push(cyl(new THREE.Vector3(cx - 1.05, 1.5, cz), new THREE.Vector3(cx + 1.05, 1.5, cz), 0.1, 10));
      ps.push(box(cx + 1.05, cx + 1.1, 1.5, 1.95, cz - 0.03, cz + 0.03));
      world.add(new THREE.Mesh(mergeGeometries(ps.map((g) => (g.index ? g.toNonIndexed() : g))), m.log));
    }
    // --- деревья: рощи в поле и на холмах (не у разреза)
    {
      const parts: THREE.BufferGeometry[] = [];
      const cc = [new THREE.Color('#3f5a28'), new THREE.Color('#4d6a31'), new THREE.Color('#5a7638')];
      const addCol = (t: THREE.BufferGeometry, col: THREE.Color) => {
        const ca = new Float32Array(t.attributes.position.count * 3);
        for (let k = 0; k < t.attributes.position.count; k++) ca.set([col.r, col.g, col.b], k * 3);
        t.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        t.deleteAttribute('uv');
        parts.push(t.index ? t.toNonIndexed() : t);
      };
      let n = 0;
      for (let i = 0; i < 4000 && n < 320; i++) {
        const x = -250 + r() * 750;
        const z = -14 - r() * 500;
        if (Math.abs(x) < 26 && z > -30) continue;
        const clump = 0.5 + 0.5 * Math.sin(x * 0.025) * Math.sin(z * 0.02 + 1);
        if (r() > clump) continue;
        const sz = 2.6 + r() * 2.6;
        const t = new THREE.IcosahedronGeometry(sz, 1);
        const p = t.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const f = 1 + (r() - 0.5) * 0.25;
          p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.9, p.getZ(k) * f);
        }
        const y0 = Hgt(x, z);
        t.translate(x, y0 + sz * 0.9 + 1.6, z);
        addCol(t, cc[n % 3]);
        const tr = new THREE.CylinderGeometry(0.25, 0.4, 2.4, 6);
        tr.translate(x, y0 + 1.0, z);
        addCol(tr, new THREE.Color('#4a3a2a'));
        n++;
      }
      parts.forEach((g) => g.deleteAttribute('normal'));
      const tg = mergeGeometries(parts);
      tg.computeVertexNormals();
      world.add(new THREE.Mesh(tg, m.trees));
    }
    // --- облака
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(300 + (i % 12)), color: '#fff6ea', transparent: true, opacity: 0.85, depthWrite: false, fog: false}));
      const sc = 400 + r() * 800;
      s.scale.set(sc, sc * (0.3 + r() * 0.1), 1);
      const a = -Math.PI * 0.95 + r() * Math.PI * 0.9;
      const d = 1200 + r() * 500;
      s.position.set(Math.cos(a) * d, 240 + r() * 420, Math.sin(a) * d);
      world.add(s);
    }

    // ===== динамика =====
    const dyn = new THREE.Group();
    world.add(dyn);
    // вышки, моторы, штанги, трубы
    const rigs = WELLS.map((x) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(rigGeo(x), m.rig));
      const mot = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.8, 0.9, 3, 0.1), m.motor);
      mot.position.set(x + 1.9, 0.42, -2.0);
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), m.bit);
      ex.position.set(x + 2.3, 1.15, -2.2);
      g.add(mot, ex);
      // труба над землёй (целая) и в разрезе (задняя половина)
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.55, 18, 1, true), m.steel);
      collar.position.set(x, 0.27, 0);
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 18), m.steel);
      fl.position.set(x, 0.55, 0);
      g.add(collar, fl);
      const pg = new THREE.CylinderGeometry(0.25, 0.25, 1, 18, 1, true, Math.PI / 2, Math.PI);
      pg.translate(0, -0.5, 0);
      const pipe = new THREE.Mesh(pg, m.steel);
      pipe.position.set(x, 0, 0);
      const rg = new THREE.CylinderGeometry(0.075, 0.075, 1, 12);
      rg.translate(0, -0.5, 0);
      const rod = new THREE.Mesh(rg, m.rod);
      const bitG = new THREE.ConeGeometry(0.2, 0.45, 12);
      bitG.rotateX(Math.PI);
      const bit = new THREE.Mesh(bitG, m.bit);
      const head = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.42, 0.62, 2, 0.06), m.head);
      g.add(pipe, rod, bit, head);
      dyn.add(g);
      return {g, pipe, rod, bit, head, x};
    });
    const founts = WELLS.map((x, i) => {
      const f = makeFount(m, 70 + i);
      dyn.add(f.pts, f.jet, f.col, f.pud);
      return f;
    });
    // заглушки ещё не пробуренной породы в вырезах: по слою на скважину
    const plugs = WELLS.map((x) =>
      Array.from({length: 5}, (_, k) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
        const me = new THREE.Mesh(g, m.layers[k]);
        dyn.add(me);
        return {me, x, k};
      }),
    );
    // ведро колодца
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.28, 14), m.bucket);
    const ropeG = new THREE.CylinderGeometry(0.015, 0.015, 1, 5);
    ropeG.translate(0, -0.5, 0);
    const rope = new THREE.Mesh(ropeG, m.rope);
    dyn.add(bucket, rope);
    // передняя половина земли (хук): уезжает вниз — «режем землю пополам»
    const block = (() => {
      const g = new THREE.BoxGeometry(30, 20, 10).toNonIndexed();
      g.translate(1, -10, 5);
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const uv = g.attributes.uv;
      const grp: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const top = n.getY(i) > 0.5;
        if (top) uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8);
        else uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) / 6, 1 + p.getY(i) / 20);
        if (i % 3 === 0) grp.push(top ? 0 : 1);
      }
      // сортировка граней: верх — группа 0, бока — 1
      const order = grp.map((gk, f) => [gk, f]).sort((a, b) => a[0] - b[0]);
      const out = new THREE.BufferGeometry();
      const P = new Float32Array(p.count * 3);
      const N = new Float32Array(p.count * 3);
      const U = new Float32Array(p.count * 2);
      order.forEach(([, f], k) => {
        for (let j = 0; j < 3; j++) {
          const i = f * 3 + j;
          const o = k * 3 + j;
          P.set([p.getX(i), p.getY(i), p.getZ(i)], o * 3);
          N.set([n.getX(i), n.getY(i), n.getZ(i)], o * 3);
          U.set([uv.getX(i), uv.getY(i)], o * 2);
        }
      });
      const nTop = grp.filter((v) => v === 0).length;
      out.setAttribute('position', new THREE.BufferAttribute(P, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      out.addGroup(0, nTop * 3, 0);
      out.addGroup(nTop * 3, (grp.length - nTop) * 3, 1);
      return new THREE.Mesh(out, [m.grass, m.block]);
    })();
    dyn.add(block);
    // частицы: грязные капли в верховодке, капли дождя в песок у холмов
    const mkPts = (n: number, mat: THREE.Material) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pt = new THREE.Points(g, mat);
      pt.frustumCulled = false;
      pt.renderOrder = 8;
      dyn.add(pt);
      return pt;
    };
    const dirty = mkPts(160, m.dirty);
    const seep = mkPts(220, m.seep);
    // дождь у холмов (3D-штрихи) и туча
    const NR = 420;
    const rainG = new THREE.BufferGeometry();
    rainG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 6), 3));
    const rain = new THREE.LineSegments(rainG, m.rain);
    rain.frustumCulled = false;
    dyn.add(rain);
    const cloud = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(320 + i), color: '#8d97a3', transparent: true, opacity: 0.95, depthWrite: false}));
      s.scale.set(70 + i * 9, 30 + (i % 3) * 6, 1);
      s.position.set(255 + i * 18, 72 + (i % 2) * 6, -40 + (i % 3) * 8);
      cloud.add(s);
    }
    dyn.add(cloud);
    // стрелки течения по водоносному пласту
    const NA = 48;
    const arrows = Array.from({length: NA}, () => {
      const a = new THREE.Mesh(flatArrow(3.2, 0.9, 2.0, 1.3), m.arrow);
      a.renderOrder = 20;
      dyn.add(a);
      return a;
    });
    // уровень (пьезометрическая линия) — штрихи
    const NLV = 90;
    const level = Array.from({length: NLV}, () => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m.level);
      d.renderOrder = 21;
      dyn.add(d);
      return d;
    });
    // линейка глубины (Париж)
    const ruler = new THREE.Group();
    {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1), m.ruler);
      bar.position.set(-1.2, -0.5, 0.3);
      ruler.add(bar);
      for (let i = 1; i <= 11; i++) {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(i % 5 === 0 ? 2.2 : 1.3, 0.35), m.ruler);
        t.position.set(-1.2 - (i % 5 === 0 ? 1.1 : 0.65), -i * 10, 0.3);
        t.userData.y = i * 10;
        ruler.add(t);
      }
      ruler.renderOrder = 22;
      ruler.children.forEach((c) => (c.renderOrder = 22));
    }
    dyn.add(ruler);
    return {m, world, layerMeshes, cavs, rigs, founts, plugs, bucket, rope, block, dirty, seep, rain, cloud, arrows, level, ruler};
  }, []);

const useSkyLights = () =>
  useMemo(() => {
    const sky = makeSky(SUN);
    sky.renderOrder = -10;
    const sun = new THREE.DirectionalLight('#ffe6c4', 2.5);
    sun.position.copy(SUN).multiplyScalar(300);
    const fill = new THREE.DirectionalLight('#b2c8e8', 0.6);
    fill.position.set(0.7, 0.4, 0.6).multiplyScalar(300);
    const hemi = new THREE.HemisphereLight('#cddcf0', '#6a5e48', 0.85);
    return {sky, sun, fill, hemi};
  }, []);

// линия водоносного пласта (центр) от холмов к скважине
const aqY = (x: number) => Math.min(S(x) - 0.8, -9 + L(x));
// где пласт выходит на поверхность
const OUTCROP = (() => {
  for (let x = 60; x < 400; x += 0.5) if (AQ_TOP + L(x) >= S(x)) return x;
  return 300;
})();
const AQ_X1 = OUTCROP + 14;
const LV0: P2 = [OUTCROP, S(OUTCROP) + 1];
const LV1: P2 = [0, 8.4];

const SkvWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const W0 = useWorld();
  const SL = useSkyLights();
  const p = clamp01(frame / Math.max(1, dur));
  const sec = t0 + frame / fps;

  useLayoutEffect(() => {
    const all = [W0.world, SL.sky, SL.sun, SL.fill, SL.hemi];
    scene.add(...all);
    scene.fog = new THREE.Fog(LOOK.fog, LOOK.fogNear, LOOK.fogFar);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.shadowMap.enabled = false;
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const sk = makeSky(SUN);
    sk.scale.setScalar(0.05);
    envScene.add(sk);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    (scene as any).environmentIntensity = 0.7;
    pm.dispose();
    return () => {
      scene.remove(...all);
      scene.environment = null;
    };
  }, []);

  useLayoutEffect(() => {
    // --- камера (по видимой длине сцены)
    const cs = (P.cam ?? ['cut', 'cut']).map((c: string | Cam) => cam(c));
    const cp = camBetween(cs[0], cs[cs.length - 1], easeInOut(p));
    camera.position.copy(cp.pos);
    camera.quaternion.copy(cp.q);
    camera.userData.focus = cp.dist;
    const near = Math.min(3, Math.max(0.3, cp.dist * 0.04));
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== cp.fov || pc.far !== FAR || Math.abs(pc.near - near) > 1e-4) {
      pc.fov = cp.fov;
      pc.near = near;
      pc.far = FAR;
      pc.updateProjectionMatrix();
    }
    SL.sky.position.copy(camera.position);

    // --- скважины: глубина бурения, вращение, вода
    const drills = [range(P.dB ?? 8.6, p), range(P.dA ?? 4.2, p)];
    const spins = [range(P.spinB ?? 0, p), range(P.spinA ?? 0, p)];
    const ons = [range(P.fB ?? 0, p), range(P.fA ?? 0, p)];
    const rises = [range(P.riseB ?? 0, p), range(P.riseA ?? 0, p)];
    const puds = [range(P.pudB ?? 0, p), range(P.pudA ?? 0, p)];
    W0.rigs.forEach((rg, i) => {
      const d = drills[i];
      const x = rg.x;
      rg.pipe.scale.set(1, Math.max(0.01, d - 0.3), 1);
      W0.cavs[i].scale.set(1, Math.max(0.01, d), 1);
      // штанга: от головки (y=1.2) до долота
      rg.rod.position.set(x, 1.25, 0);
      rg.rod.scale.set(1, d + 1.25 - 0.3, 1);
      rg.rod.rotation.y = spins[i] > 0.01 ? sec * 9 : 0;
      rg.bit.position.set(x, -d + 0.2, 0);
      rg.bit.rotation.y = rg.rod.rotation.y;
      rg.head.position.set(x, 1.35, 0);
      rg.head.rotation.y = spins[i] > 0.01 ? sec * 2.2 : 0;
      const dd = Math.max(0, d - 0.12);
      W0.plugs[i].forEach(({me, k}) => {
        const xa = x - 0.35;
        const xb = x + 0.35;
        const tA = Math.min(bound(k, xa), -dd);
        const tB = Math.min(bound(k, xb), -dd);
        const bA = bound(k + 1, xa);
        const bB = bound(k + 1, xb);
        me.visible = tA > bA + 1e-3 || tB > bB + 1e-3;
        const pa = me.geometry.attributes.position as THREE.BufferAttribute;
        const ua = me.geometry.attributes.uv as THREE.BufferAttribute;
        const tA2 = Math.max(tA, bA);
        const tB2 = Math.max(tB, bB);
        const v = [xa, bA, xb, bB, xb, tB2, xa, bA, xb, tB2, xa, tA2];
        for (let j = 0; j < 6; j++) {
          pa.setXYZ(j, v[j * 2], v[j * 2 + 1], 0);
          ua.setXY(j, v[j * 2] / 6, v[j * 2 + 1] / 6);
        }
        pa.needsUpdate = true;
        ua.needsUpdate = true;
        me.geometry.computeBoundingSphere();
      });
      updFount(W0.founts[i], x, ons[i], sec, d, rises[i], puds[i]);
    });

    // --- срез: передняя половина уезжает вниз
    const cut = range(P.cut ?? 1, p);
    W0.block.visible = cut < 0.999;
    W0.block.position.y = -cut * 30;

    // --- подсветка слоёв (верховодка, глина, водоносный) и намокание пласта
    const hl = [0, range(P.hlUp ?? 0, p), range(P.hlUp ?? 0, p), range(P.hlClay ?? 0, p), range(P.hlAq ?? 0, p), 0, 0];
    const wet = range(P.wet ?? 1, p);
    W0.layerMeshes.forEach((me, k) => {
      const mat = me.material as THREE.MeshStandardMaterial;
      mat.emissive.set(k === 3 ? '#a8502a' : k === 4 ? '#3f86b8' : '#b08a4a');
      mat.emissiveIntensity = 0.35 * hl[k];
    });
    (W0.m.layers[4] as THREE.MeshStandardMaterial).color.setRGB(lerp(1, 0.62, wet), lerp(1, 0.8, wet), lerp(1, 0.98, wet));

    // --- ведро: опускается в колодец и поднимается
    const bk = range(P.bucket ?? 0, p);
    const by = lerp(1.25, -1.95, bk);
    W0.bucket.position.set(-6, by, -0.75);
    W0.rope.position.set(-6, 1.42, -0.75);
    W0.rope.scale.set(1, Math.max(0.01, 1.42 - by - 0.12), 1);

    // --- грязные капли: от поверхности вниз до глины
    {
      const on = range(P.dirty ?? 0, p);
      W0.dirty.visible = on > 0.01;
      const pos = W0.dirty.geometry.attributes.position as THREE.BufferAttribute;
      const rr = rng(5);
      for (let i = 0; i < pos.count; i++) {
        const x = -12 + rr() * 16;
        const ph = rr();
        const sp = 0.25 + rr() * 0.2;
        const yStop = -2.38 + rr() * 0.5;
        const t = (sec * sp + ph * 3) % 3;
        const y = Math.max(yStop, -0.15 - t);
        const inSlot = x > -6.7 && x < -5.3;
        pos.setXYZ(i, inSlot ? x + 2.2 : x, y, 0.08);
      }
      pos.needsUpdate = true;
      (W0.dirty.material as THREE.PointsMaterial).opacity = on;
    }
    // --- дождь у холмов и туча
    {
      const on = range(P.rain ?? 0, p);
      W0.rain.visible = on > 0.01;
      W0.cloud.visible = on > 0.01;
      W0.cloud.children.forEach((s) => (((s as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.95 * on));
      (W0.rain.material as THREE.LineBasicMaterial).opacity = 0.55 * on;
      if (W0.rain.visible) {
        const pos = W0.rain.geometry.attributes.position as THREE.BufferAttribute;
        const rr = rng(9);
        for (let i = 0; i < 420; i++) {
          const x = 250 + rr() * 110;
          const z = -45 + rr() * 44;
          const g = Hgt(x, z);
          const top = 68;
          const span = top - g;
          const y = top - ((sec * 26 + rr() * span) % span);
          pos.setXYZ(i * 2, x, y, z);
          pos.setXYZ(i * 2 + 1, x - 0.3, y - 2.6, z);
        }
        pos.needsUpdate = true;
      }
      const sp = range(P.seep ?? 0, p);
      W0.seep.visible = sp > 0.01;
      (W0.seep.material as THREE.PointsMaterial).opacity = sp;
      const pos = W0.seep.geometry.attributes.position as THREE.BufferAttribute;
      const rr = rng(13);
      for (let i = 0; i < pos.count; i++) {
        const x = OUTCROP - 6 + rr() * 50;
        const top = S(x) - 0.3;
        const bot = Math.max(AQ_TOP - 4 + L(x), top - 9);
        const t = (sec * (0.6 + rr() * 0.5) + rr() * 9) % 9;
        pos.setXYZ(i, x, Math.max(bot, top - t * 1.2), 0.3);
      }
      pos.needsUpdate = true;
    }
    // --- стрелки течения: от холмов к скважине по центру пласта
    {
      const on = range(P.flow ?? 0, p);
      const sp = 8;
      const Lx = AQ_X1 - 2;
      W0.arrows.forEach((a, i) => {
        const s = (i * sp + sec * (P.flowV ?? 2.2)) % (W0.arrows.length * sp);
        const x = AQ_X1 - s;
        a.visible = on > 0.01 && x > 2 && x < Lx;
        if (!a.visible) return;
        const y = aqY(x);
        const y2 = aqY(x - 1);
        a.position.set(x, y, 0.35);
        a.rotation.set(0, 0, Math.PI + Math.atan2(y - y2, 1));
        const fade = smooth(2, 10, x) * (1 - smooth(Lx - 12, Lx, x));
        const sc = clamp01(camera.position.distanceTo(a.position) / 30);
        a.scale.setScalar(0.35 + 0.65 * sc);
        (a.material as THREE.MeshBasicMaterial).opacity = 0.9 * on;
        a.userData.f = fade;
        a.scale.multiplyScalar(0.2 + 0.8 * fade);
      });
    }
    // --- уровень: штрихи от холмов к скважине (растут от холма)
    {
      const lv = range(P.level ?? 0, p);
      const n = W0.level.length;
      const dx = LV1[0] - LV0[0];
      const dy = LV1[1] - LV0[1];
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      W0.level.forEach((d, i) => {
        const k0 = i / n;
        d.visible = lv > k0 + 0.002;
        if (!d.visible) return;
        const k1 = Math.min(lv, k0 + 0.62 / n);
        const km = (k0 + k1) / 2;
        d.position.set(LV0[0] + dx * km, LV0[1] + dy * km, 0.6);
        d.rotation.set(0, 0, ang);
        const th = Math.min(0.9, Math.max(0.07, camera.position.distanceTo(d.position) * 0.0045));
        d.scale.set(Math.max(0.01, (k1 - k0) * len), th, 1);
      });
      (W0.m.level as THREE.MeshBasicMaterial).opacity = 0.95 * range(P.levelOp ?? 1, p);
    }
    // --- линейка глубины
    {
      const rl = range(P.ruler ?? 0, p);
      W0.ruler.visible = rl > 0.01;
      const len = 112 * rl;
      const bar = W0.ruler.children[0];
      bar.scale.set(1, Math.max(0.01, len), 1);
      bar.position.y = -len / 2;
      W0.ruler.children.slice(1).forEach((t) => (t.visible = (t.userData.y as number) <= len));
      W0.ruler.position.set(0, 0, 0);
    }
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
      <AbsoluteFill style={{mixBlendMode: 'overlay', opacity: A.grain, backgroundImage: `url(${grainTile()})`, backgroundSize: '256px 256px', backgroundPosition: `${(frame * 97) % 256}px ${(frame * 61) % 256}px`}} />
    </AbsoluteFill>
  );
};

export const SkvScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = lifeIn ?? Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const bOut = 1 - clamp01((frame - (P.bannerEnd ?? 1) * life + 8) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 1, 8], near: 0.5, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <SkvWorld P={P} dur={life} t0={scene.start ?? 0} />
        <Post opt={P.post} />
      </ThreeCanvas>
      <Grade />
      {P.banner ? (
        <div style={{position: 'absolute', left: 50, right: 50, top: P.bannerY ?? 300, display: 'flex', justifyContent: 'center', opacity: bIn * bOut, transform: `scale(${0.85 + 0.15 * bIn})`}}>
          <div style={{textAlign: 'center', fontFamily: ROUND, fontWeight: 700, fontSize: P.bannerSize ?? 62, lineHeight: 1.15, whiteSpace: 'pre-line', color: '#FFD54A', WebkitTextStroke: '8px #2a1f00', paintOrder: 'stroke fill', textTransform: 'uppercase', padding: '14px 30px', borderRadius: 28, background: 'rgba(10,22,34,0.55)'}}>
            {P.banner}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
