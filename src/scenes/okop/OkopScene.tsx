import React, {useLayoutEffect, useMemo, useRef} from 'react';
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

// ===== Мир «Окоп» (Первая мировая, Фландрия, утро после дождя). Пересборка по новым правилам, без людей.
// Окоп идёт вдаль по −z зигзагом (бруствер к врагу — x<0). Разрез мира по z = 0: к зрителю открыт срез земли.
// Под первым коленом — блиндаж на глубине 9 м (лестница из окопа вниз, к +x). 1 единица = 1 м.
type P2 = [number, number];
const W = 0.85; // полуширина окопа
const DEPTH = 2.3;
const LEN = 100;
const XW = 150;
const ZB = -300;
const YB = -40;
const FAR = 6000;
const SUN = new THREE.Vector3(-0.55, 0.42, 0.72).normalize(); // слева-сзади камер: солнце не в кадре, срез освещён
const SKY = {top: '#4f7fbe', mid: '#a8c3df', horizon: '#f2d6ae', glow: '#fff0d4', glowSize: 6};
const LOOK = {fog: '#d6cbb6', fogNear: 140, fogFar: 1500, grade: {shadow: '#1d3048', shadowAmt: 0.04, high: '#ffe2bd', highAmt: 0.05, vignette: 0.32, grain: 0.035}};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
// число или [от, до, начало, конец] (доли видимой длины сцены)
const range = (v: any, p: number): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  const [a, b, t0 = 0, t1 = 1] = v as number[];
  return lerp(a, b, easeInOut(clamp01((p - t0) / Math.max(1e-6, t1 - t0))));
};

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  hook0: {pos: [9, 30, 10], look: [1.5, -1, -24], fov: 50},
  hook1: {pos: [7, 24, 6], look: [1.5, -1.5, -18], fov: 50},
  cut: {pos: [0.6, 0.9, 7.2], look: [0, -1.3, -5]},
  cutLow: {pos: [0.3, -0.7, 4.8], look: [0, -1.9, -5]},
  boards: {pos: [1.0, 0.1, 3.4], look: [0, -1.95, -3.5]},
  walls: {pos: [0.9, -0.5, 3.0], look: [-0.3, -1.1, -4.5]},
  bags: {pos: [2.4, 1.3, 4.0], look: [-1.0, 0.2, -3.0]},
  step: {pos: [1.4, -0.2, 3.0], look: [-0.6, -1.3, -2.5]},
  peri: {pos: [1.5, 0.2, 2.0], look: [-0.6, -0.2, -2.5]},
  deep: {pos: [4.6, -4.6, 27], look: [4.6, -4.9, -2]},
  aerialBay: {pos: [7, 17, -13], look: [0.5, -1.5, -26]},
  aerialFire: {pos: [9, 15, -6], look: [2.5, -1.5, -15.5]},
  deepHigh: {pos: [-1, -1.5, 40], look: [0, -4, -4]},
  final: {pos: [-0.5, 0.5, 46], look: [1, -3.5, -4]},
  cover: {pos: [8, 20, 8], look: [1.5, -1.5, -16], fov: 50},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.cut : c);

// ---------- путь окопа: колено 8 м, поворот на 3 м вбок ----------
const PATH: P2[] = (() => {
  const p: P2[] = [
    [0, 0],
    [0, -8],
  ];
  let z = -8;
  let x = 0;
  while (z > -LEN) {
    x = x === 0 ? 3 : 0;
    z -= 3;
    p.push([x, z]);
    z -= 8;
    p.push([x, z]);
  }
  return p;
})();
const Z_END = PATH[PATH.length - 1][1];
type Seg = {a: P2; b: P2; len: number; s0: number; d: P2};
const SEGS: Seg[] = (() => {
  const out: Seg[] = [];
  let s = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push({a, b, len, s0: s, d: [(b[0] - a[0]) / len, (b[1] - a[1]) / len]});
    s += len;
  }
  return out;
})();
const PATH_LEN = SEGS[SEGS.length - 1].s0 + SEGS[SEGS.length - 1].len;
const pathAt = (s: number): P2 => {
  for (const g of SEGS) if (s <= g.s0 + g.len) return [g.a[0] + g.d[0] * (s - g.s0), g.a[1] + g.d[1] * (s - g.s0)];
  return PATH[PATH.length - 1];
};
// смещение ломаной вбок с правильной «митрой» на углах: side +1 — к врагу (x<0 при движении к −z)
const offsetLine = (pts: P2[], side: number, w: number): P2[] => {
  const dir = (a: P2, b: P2): P2 => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const nrm = (d: P2): P2 => [d[1] * side, -d[0] * side];
  return pts.map((p, i) => {
    const n1 = nrm(i > 0 ? dir(pts[i - 1], p) : dir(p, pts[i + 1]));
    const n2 = nrm(i < pts.length - 1 ? dir(p, pts[i + 1]) : dir(pts[i - 1], p));
    const c = n1[0] * n2[0] + n1[1] * n2[1];
    const k = w / (1 + c);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k] as P2;
  });
};
const WL = offsetLine(PATH, 1, W);
const WR = offsetLine(PATH, -1, W);
// луч в плоскости x-z до стенок окопа
const rayWall = (c: P2, d: P2) => {
  let best = 60;
  for (const L of [WL, WR])
    for (let i = 0; i < L.length - 1; i++) {
      const p = L[i];
      const e: P2 = [L[i + 1][0] - p[0], L[i + 1][1] - p[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-9) continue;
      const wx = p[0] - c[0];
      const wz = p[1] - c[1];
      const t = (wx * e[1] - wz * e[0]) / den;
      const u = (wx * d[1] - wz * d[0]) / den;
      if (t > 0.01 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
  return best;
};

// ---------- блиндаж: лестница вниз к +x, комната на 9 м ----------
const F = (y: number) => 0.35 + 0.55 * (-DEPTH - y); // пол лестницы
const C = (y: number) => 1.35 + 0.55 * (-DEPTH - y); // потолок лестницы
const R_CEIL = -9.0;
const R_FLOOR = -11.2;
const R_X1 = 9.5;
const CORR: P2[] = [
  [F(-DEPTH), -DEPTH],
  [C(-DEPTH), -DEPTH],
  [C(R_CEIL), R_CEIL],
  [F(R_CEIL), R_CEIL],
];
const ROOM: P2[] = [
  [F(R_CEIL), R_CEIL],
  [R_X1, R_CEIL],
  [R_X1, R_FLOOR],
  [F(R_FLOOR), R_FLOOR],
];
const clipPoly = (poly: P2[], f: (p: P2) => number): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
};
const polyArea = (p: P2[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s / 2);
};

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
const speckle = (g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, n: number, cols: string[], seed: number, size = [1, 3]) => {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    g.beginPath();
    g.ellipse(x0 + r() * w, y0 + r() * h, s, s * (0.5 + r() * 0.5), r() * 3, 0, 6.3);
    g.fill();
  }
};
// срез земли: v = 1 + y/14 (верх холста — поверхность), u = 8 м на тайл
const layersTex = () => {
  const [c, g] = cv(512, 1024);
  const ppm = 1024 / 14;
  const r = rng(5);
  const bands: [number, string][] = [
    [0, '#3f2c1e'],
    [0.38, '#8a5a35'],
    [3.3, '#a77d4b'],
    [5.6, '#5f6b72'],
    [14.1, '#5f6b72'],
  ];
  for (let i = 0; i < bands.length - 1; i++) {
    const [d0, col] = bands[i];
    const d1 = bands[i + 1][0];
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, d0 * ppm);
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, d0 * ppm + (i ? Math.sin(x * 0.03 + i) * 5 + Math.sin(x * 0.011 + i * 2) * 7 : 0));
    g.lineTo(512, d1 * ppm + 12);
    g.lineTo(0, d1 * ppm + 12);
    g.closePath();
    g.fill();
  }
  // прожилки и камешки
  speckle(g, 0, 0, 512, 1024, 9000, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.05)', 'rgba(60,40,25,0.07)'], 11, [1, 4]);
  speckle(g, 0, 0.4 * ppm, 512, 5 * ppm, 160, ['rgba(190,170,140,0.5)', 'rgba(120,110,100,0.5)'], 12, [2, 6]);
  for (let i = 0; i < 40; i++) {
    const y = 5.8 * ppm + r() * 8 * ppm;
    g.strokeStyle = `rgba(${r() > 0.5 ? '40,50,58' : '120,132,140'},${0.15 + r() * 0.15})`;
    g.lineWidth = 2 + r() * 4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    g.stroke();
  }
  // корни у поверхности
  g.strokeStyle = 'rgba(30,22,14,0.5)';
  for (let i = 0; i < 70; i++) {
    let x = r() * 512;
    let y = r() * 10;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (r() - 0.5) * 10;
      y += 4 + r() * 8;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};
const grassTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#62703c';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 0, 0, 512, 512, 140, ['rgba(110,90,55,0.35)', 'rgba(80,95,45,0.4)', 'rgba(140,150,80,0.25)'], 21, [14, 40]);
  speckle(g, 0, 0, 512, 512, 9000, ['rgba(40,55,25,0.25)', 'rgba(160,170,90,0.2)', 'rgba(90,70,45,0.2)'], 22, [1, 3]);
  return tex(c);
};
const mudTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#4f3c2b';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 0, 0, 512, 512, 120, ['rgba(70,58,46,0.6)', 'rgba(40,30,22,0.5)', 'rgba(95,80,62,0.35)'], 31, [10, 34]);
  speckle(g, 0, 0, 512, 512, 7000, ['rgba(0,0,0,0.12)', 'rgba(150,125,95,0.12)'], 32, [1, 3]);
  return tex(c);
};
const plankTex = (base: string, seed: number, vertical = false) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  const r = rng(seed);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const y = (i * 512) / n;
    g.fillStyle = `rgba(${r() > 0.5 ? '255,235,200' : '40,25,10'},${0.05 + r() * 0.08})`;
    if (vertical) g.fillRect(y, 0, 512 / n, 512);
    else g.fillRect(0, y, 512, 512 / n);
    g.fillStyle = 'rgba(35,22,10,0.55)';
    if (vertical) g.fillRect(y, 0, 3, 512);
    else g.fillRect(0, y, 512, 3);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(60,38,18,${0.08 + r() * 0.1})`;
      g.lineWidth = 1;
      g.beginPath();
      const o = y + 4 + r() * (512 / n - 8);
      if (vertical) {
        g.moveTo(o, 0);
        g.bezierCurveTo(o + 3, 170, o - 3, 340, o + 2, 512);
      } else {
        g.moveTo(0, o);
        g.bezierCurveTo(170, o + 3, 340, o - 3, 512, o + 2);
      }
      g.stroke();
    }
  }
  speckle(g, 0, 0, 512, 512, 30, ['rgba(40,25,12,0.6)'], seed + 1, [2, 5]);
  return tex(c);
};
// обшивка стенки: горизонтальные доски + столбики
const revetTex = () => {
  const [c, g] = cv(512, 512);
  const t0 = plankTex('#8c6a45', 41).image as HTMLCanvasElement;
  g.drawImage(t0, 0, 0);
  for (const x of [0, 256]) {
    const gr = g.createLinearGradient(x, 0, x + 34, 0);
    gr.addColorStop(0, '#4c3520');
    gr.addColorStop(0.5, '#6e4f30');
    gr.addColorStop(1, '#4c3520');
    g.fillStyle = gr;
    g.fillRect(x, 0, 34, 512);
  }
  return tex(c);
};
const burlapTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#a99067';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) {
    g.fillStyle = 'rgba(70,52,30,0.12)';
    g.fillRect(i, 0, 1, 256);
    g.fillRect(0, i, 256, 1);
  }
  speckle(g, 0, 0, 256, 256, 260, ['rgba(80,60,40,0.18)', 'rgba(200,180,140,0.15)', 'rgba(90,70,50,0.12)'], 51, [6, 22]);
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
const smokeTex = (seed: number) => {
  const [c, g] = cv(256, 256);
  const r = rng(seed);
  for (let i = 0; i < 16; i++) {
    const x = 70 + r() * 116;
    const y = 70 + r() * 116;
    const s = 36 + r() * 52;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, s, 0, 6.3);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const craterTex = () => {
  const [c, g] = cv(256, 256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(45,34,24,0.95)');
  gr.addColorStop(0.45, 'rgba(70,52,36,0.85)');
  gr.addColorStop(0.62, 'rgba(120,92,62,0.75)');
  gr.addColorStop(0.8, 'rgba(95,78,52,0.35)');
  gr.addColorStop(1, 'rgba(95,78,52,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
// перегруппировка по нормали: верх (группа 0) / бока (группа 1) + мировые UV (верх — x,z; бока — слои по y)
const prep = (g0: THREE.BufferGeometry, topRep = 8) => {
  const g = g0.index ? g0.toNonIndexed() : g0;
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const nf = pos.count / 3;
  const top: number[] = [];
  const side: number[] = [];
  for (let f = 0; f < nf; f++) (nor.getY(f * 3) > 0.6 ? top : side).push(f);
  const order = [...top, ...side];
  const P = new Float32Array(pos.count * 3);
  const N = new Float32Array(pos.count * 3);
  const U = new Float32Array(pos.count * 2);
  order.forEach((f, k) => {
    for (let j = 0; j < 3; j++) {
      const i = f * 3 + j;
      const o = k * 3 + j;
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      P.set([x, y, z], o * 3);
      N.set([nor.getX(i), nor.getY(i), nor.getZ(i)], o * 3);
      if (k < top.length) U.set([x / topRep, z / topRep], o * 2);
      else {
        const ax = Math.abs(nor.getX(i));
        const az = Math.abs(nor.getZ(i));
        U.set([(az >= ax ? x : z) / 8, 1 + y / 14], o * 2);
      }
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.addGroup(0, top.length * 3, 0);
  out.addGroup(top.length * 3, side.length * 3, 1);
  return out;
};
// плита земли по контуру в плане (x, z), от y = 0 вниз на depth
const slabXZ = (poly: P2[], depth: number) => {
  const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: false, curveSegments: 1});
  g.rotateX(Math.PI / 2);
  return g;
};
// тело по контуру в разрезе (x, y), от z = z0 до z1
const slabXY = (poly: P2[], z0: number, z1: number) => {
  const sh = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, {depth: z1 - z0, bevelEnabled: false, curveSegments: 1});
  g.translate(0, 0, z0);
  return g;
};
const channelPoly = (s: number): P2[] => {
  const pts: P2[] = [pathAt(s)];
  for (const g of SEGS) if (g.s0 + g.len > s + 0.05) pts.push(g.b);
  if (pts.length < 2) return [];
  const L = offsetLine(pts, 1, W);
  const R = offsetLine(pts, -1, W);
  return [...L, ...R.reverse()];
};
// вертикальная лента вдоль ломаной (обшивка): от y = 0 до h, u — по длине
const ribbon = (pts: P2[], h: number) => {
  const P: number[] = [];
  const U: number[] = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u0 = s / 3.2;
    const u1 = (s + l) / 3.2;
    P.push(a[0], 0, a[1], b[0], 0, b[1], b[0], h, b[1], a[0], 0, a[1], b[0], h, b[1], a[0], h, a[1]);
    U.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    s += l;
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
  return new THREE.ShapeGeometry(s);
};
const clodGeo = (seed: number, rad: number) => {
  const g = new THREE.IcosahedronGeometry(rad, 1);
  const r = rng(seed);
  const p = g.attributes.position;
  const cache = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let f = cache.get(key);
    if (f === undefined) {
      f = 0.7 + r() * 0.5;
      cache.set(key, f);
    }
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f);
  }
  g.computeVertexNormals();
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

// ---------- взрыв: вспышка + дым (спрайты с текстурой) + неровные комья ----------
type Blast = {g: THREE.Group; flash: THREE.Sprite; smoke: THREE.Sprite[]; clods: THREE.Mesh[]; seed: number};
const makeBlast = (m: Record<string, any>, seed: number): Blast => {
  const g = new THREE.Group();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({map: m.glowT, color: '#ffd9a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false}));
  g.add(flash);
  const smoke = Array.from({length: 9}, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: m.smokeT[i % 3], color: i % 2 ? '#6a6055' : '#544b42', transparent: true, depthWrite: false}));
    s.renderOrder = 6;
    g.add(s);
    return s;
  });
  const clods = Array.from({length: 10}, (_, i) => {
    const c = new THREE.Mesh(m.clodG[i % m.clodG.length], m.clod);
    g.add(c);
    return c;
  });
  return {g, flash, smoke, clods, seed};
};
const updBlast = (b: Blast, dt: number, c: THREE.Vector3, s: number) => {
  const on = dt >= 0 && dt < 3.6;
  b.g.visible = on;
  if (!on) return;
  const r = rng(b.seed);
  const fl = clamp01(1 - dt / 0.22);
  b.flash.visible = fl > 0;
  b.flash.position.set(c.x, c.y + 0.6 * s, c.z);
  b.flash.scale.setScalar(6 * s * (0.6 + 0.4 * fl));
  (b.flash.material as THREE.SpriteMaterial).opacity = fl;
  b.smoke.forEach((sp, i) => {
    const a = (i / b.smoke.length) * Math.PI * 2 + r();
    const sp0 = 0.5 + r() * 0.8;
    const up = 1.2 + r() * 1.6;
    const k = 1 - Math.exp(-dt * 1.6);
    sp.position.set(c.x + Math.cos(a) * sp0 * k * s, c.y + (0.4 + up * k + dt * 0.35) * s, c.z + Math.sin(a) * sp0 * k * s);
    sp.scale.setScalar(s * (1.0 + 3.2 * k));
    (sp.material as THREE.SpriteMaterial).opacity = 0.85 * Math.min(1, dt * 10) * (1 - smooth(0.9, 3.6, dt));
    (sp.material as THREE.SpriteMaterial).rotation = a + dt * 0.2;
  });
  b.clods.forEach((cl, i) => {
    const a = r() * Math.PI * 2;
    const vh = (1.2 + r() * 2.2) * s;
    const vy = (5 + r() * 4) * Math.sqrt(s);
    const tl = (2 * vy) / 9.8;
    const t = Math.min(dt, tl);
    cl.position.set(c.x + Math.cos(a) * vh * t, c.y + vy * t - 4.9 * t * t + 0.1, c.z + Math.sin(a) * vh * t);
    cl.rotation.set(dt * 4 + i, dt * 3, 0);
    cl.scale.setScalar(Math.max(0, 1 - clamp01((dt - tl) / 0.5)) * Math.min(1, dt * 12) * Math.sqrt(s));
  });
};

const useWorld = () =>
  useMemo(() => {
    const r = rng(29);
    const glowT = glowTex();
    const m: Record<string, any> = {
      grass: new THREE.MeshStandardMaterial({map: grassTex(), roughness: 1}),
      earth: new THREE.MeshStandardMaterial({map: layersTex(), roughness: 0.95}),
      mud: new THREE.MeshStandardMaterial({map: mudTex(), roughness: 0.75}),
      far: new THREE.MeshStandardMaterial({color: '#7b8656', roughness: 1}),
      water: new THREE.MeshStandardMaterial({color: '#6b5f48', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.84, side: THREE.DoubleSide, depthWrite: false}),
      wood: new THREE.MeshStandardMaterial({map: plankTex('#9a754c', 61), roughness: 0.85}),
      woodDark: new THREE.MeshStandardMaterial({map: plankTex('#6a4a2e', 62, true), roughness: 0.9}),
      revet: new THREE.MeshStandardMaterial({map: revetTex(), roughness: 0.85, side: THREE.DoubleSide}),
      bag: new THREE.MeshStandardMaterial({map: burlapTex(), roughness: 1}),
      steel: new THREE.MeshStandardMaterial({color: '#5d6466', roughness: 0.5, metalness: 0.6}),
      mirror: new THREE.MeshStandardMaterial({color: '#dfe9f0', roughness: 0.05, metalness: 0.9, emissive: '#9fb8c8', emissiveIntensity: 0.35}),
      ray: new THREE.MeshBasicMaterial({color: '#FFD54A', toneMapped: false, transparent: true, opacity: 0.95, depthTest: false}),
      tracer: new THREE.MeshBasicMaterial({color: '#ffcf6a', toneMapped: false, transparent: true, opacity: 0.95}),
      ruler: new THREE.MeshBasicMaterial({color: '#FFD54A', toneMapped: false, transparent: true, opacity: 0.95}),
      arrowUs: new THREE.MeshBasicMaterial({color: '#FFD54A', toneMapped: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthTest: false}),
      arrowThem: new THREE.MeshBasicMaterial({color: '#ff9f43', toneMapped: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthTest: false}),
      lampGlass: new THREE.MeshStandardMaterial({color: '#ffe0a0', emissive: '#ffb050', emissiveIntensity: 2.2}),
      clod: new THREE.MeshStandardMaterial({map: mudTex(), roughness: 0.9}),
      trees: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, flatShading: true}),
      crater: new THREE.MeshBasicMaterial({map: craterTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}),
      glowT,
      smokeT: [smokeTex(3), smokeTex(4), smokeTex(5)],
      clodG: [clodGeo(1, 0.18), clodGeo(2, 0.24), clodGeo(3, 0.14)],
    };
    m.grass.map.repeat.set(1, 1);
    const world = new THREE.Group();
    const terr = (g: THREE.BufferGeometry, top: THREE.Material, rep = 8) => new THREE.Mesh(prep(g, rep), [top, m.earth]);

    // --- земля вокруг окопа: левая и правая плиты по стенкам, плита за концом окопа
    world.add(terr(slabXZ([[-XW, 0], ...WL, [-XW, Z_END]], DEPTH), m.grass));
    world.add(terr(slabXZ([...WR, [XW, Z_END], [XW, 0]], DEPTH), m.grass));
    world.add(terr(slabXZ([[-XW, Z_END], [XW, Z_END], [XW, ZB], [-XW, ZB]], DEPTH), m.grass));
    // --- под окопом: передний кусок с вырезом блиндажа и задний сплошной
    const front: P2[] = [[-XW, -DEPTH], CORR[0], ROOM[3], ROOM[2], ROOM[1], CORR[2], CORR[1], [XW, -DEPTH], [XW, YB], [-XW, YB]];
    world.add(terr(slabXY(front, -4, 0), m.mud));
    world.add(terr(box(-XW, XW, YB, -DEPTH, ZB, -4), m.mud));
    // --- поле вокруг (без наложений на плиты)
    const flat = (x0: number, x1: number, z0: number, z1: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const uv = g.attributes.uv;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8);
      return new THREE.Mesh(g, m.grass);
    };
    world.add(flat(-1500, -XW, -1500, 0), flat(XW, 1500, -1500, 0), flat(-XW, XW, -1500, ZB));
    // --- дальние холмы
    {
      const g = new THREE.PlaneGeometry(5000, 5000, 120, 120);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, -2550);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const d = Math.hypot(x, z + 250);
        const h = d < 650 ? -3 : -3 + smooth(650, 1600, d) * (28 + 22 * Math.sin(x * 0.004 + 1) * Math.sin(z * 0.003));
        p.setY(i, h);
      }
      g.computeVertexNormals();
      world.add(new THREE.Mesh(g, m.far));
    }
    // --- воронки на ничейной земле
    for (let i = 0; i < 16; i++) {
      const sz = 2.5 + r() * 3.5;
      const c = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), m.crater);
      c.rotation.x = -Math.PI / 2;
      c.position.set(-9 - r() * 70, 0.04, -6 - r() * 90);
      c.renderOrder = 1;
      world.add(c);
    }
    // --- деревья: в тылу живые рощи, у врага — редкие голые стволы
    {
      const parts: THREE.BufferGeometry[] = [];
      const cc = [new THREE.Color('#3b5226'), new THREE.Color('#4a6230'), new THREE.Color('#566d36')];
      const addCol = (t: THREE.BufferGeometry, col: THREE.Color) => {
        const ca = new Float32Array(t.attributes.position.count * 3);
        for (let k = 0; k < t.attributes.position.count; k++) ca.set([col.r, col.g, col.b], k * 3);
        t.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        t.deleteAttribute('uv');
        parts.push(t.index ? t.toNonIndexed() : t);
      };
      let n = 0;
      for (let i = 0; i < 3000 && n < 240; i++) {
        const x = 30 + r() * 600;
        const z = -40 - r() * 700;
        const clump = 0.5 + 0.5 * Math.sin(x * 0.02) * Math.sin(z * 0.017 + 1);
        if (r() > clump) continue;
        const sz = 3 + r() * 3;
        const t = new THREE.IcosahedronGeometry(sz, 1);
        const p = t.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const f = 1 + (r() - 0.5) * 0.25;
          p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.85, p.getZ(k) * f);
        }
        t.translate(x, sz * 0.9 + 1.8, z);
        addCol(t, cc[n % 3]);
        const tr = new THREE.CylinderGeometry(0.3, 0.45, 2.6, 6);
        tr.translate(x, 1.2, z);
        addCol(tr, new THREE.Color('#4a3a2a'));
        n++;
      }
      // голые стволы у врага
      for (let i = 0; i < 22; i++) {
        const x = -25 - r() * 120;
        const z = -10 - r() * 160;
        const h = 2 + r() * 5;
        const tr = new THREE.CylinderGeometry(0.12, 0.28, h, 6);
        tr.rotateZ((r() - 0.5) * 0.3);
        tr.translate(x, h / 2 - 0.1, z);
        addCol(tr, new THREE.Color('#4b3e33'));
      }
      parts.forEach((g) => g.deleteAttribute('normal'));
      const tg = mergeGeometries(parts);
      tg.computeVertexNormals();
      world.add(new THREE.Mesh(tg, m.trees));
    }
    // --- облака
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(300 + (i % 12)), color: '#fff4e6', transparent: true, opacity: 0.85, depthWrite: false, fog: false}));
      const sc = 400 + r() * 800;
      s.scale.set(sc, sc * (0.3 + r() * 0.1), 1);
      const a = -Math.PI * 0.95 + r() * Math.PI * 0.9;
      const d = 1200 + r() * 500;
      s.position.set(Math.cos(a) * d, 220 + r() * 420, Math.sin(a) * d);
      world.add(s);
    }

    // ===== динамика =====
    const dyn = new THREE.Group();
    world.add(dyn);
    // заглушка ещё не выкопанной части окопа
    const cap = new THREE.Mesh(new THREE.BufferGeometry(), [m.grass, m.earth]);
    dyn.add(cap);
    // земля в ещё не выкопанном блиндаже
    const plug = new THREE.Mesh(new THREE.BufferGeometry(), [m.mud, m.earth]);
    dyn.add(plug);
    // вода
    const waterTop = new THREE.Mesh(
      (() => {
        const g = new THREE.ShapeGeometry(new THREE.Shape([...WL, ...[...WR].reverse()].map(([x, z]) => new THREE.Vector2(x, z))));
        g.rotateX(Math.PI / 2);
        return g;
      })(),
      m.water,
    );
    waterTop.renderOrder = 3;
    const waterFront = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 1), m.water);
    waterFront.renderOrder = 4;
    dyn.add(waterTop, waterFront);
    // решётки на ножках
    const boardGeo = (len: number) => {
      const ps: THREE.BufferGeometry[] = [];
      for (const sx of [-0.22, 0.22]) ps.push(box(sx - 0.04, sx + 0.04, -0.135, -0.035, -len / 2, len / 2));
      for (let z = -len / 2 + 0.06; z <= len / 2 - 0.05; z += 0.17) ps.push(box(-0.3, 0.3, -0.035, 0, z - 0.045, z + 0.045));
      for (const sx of [-0.22, 0.22]) for (const z of [-len / 2 + 0.15, len / 2 - 0.15]) ps.push(box(sx - 0.03, sx + 0.03, -0.44, -0.135, z - 0.03, z + 0.03));
      return mergeGeometries(ps);
    };
    const bGeo = boardGeo(1.4);
    const boards: {mesh: THREE.Mesh; s: number}[] = [];
    for (const g of SEGS) {
      const n = Math.floor((g.len - 0.4) / 1.46);
      const off = (g.len - n * 1.46) / 2;
      for (let i = 0; i < n; i++) {
        const s = off + 0.73 + i * 1.46;
        const mesh = new THREE.Mesh(bGeo, m.wood);
        mesh.position.set(g.a[0] + g.d[0] * s, -1.85, g.a[1] + g.d[1] * s);
        mesh.rotation.y = Math.atan2(g.d[0], g.d[1]);
        mesh.userData.y0 = -1.85;
        dyn.add(mesh);
        boards.push({mesh, s: g.s0 + s});
      }
    }
    // обшивка стенок (растёт снизу вверх)
    const revets = [1, -1].map((side) => {
      const mesh = new THREE.Mesh(ribbon(offsetLine(PATH, side, W - 0.05), DEPTH), m.revet);
      mesh.position.y = -DEPTH;
      dyn.add(mesh);
      return mesh;
    });
    // мешки: 3 ряда бруствера (к врагу) + 2 ряда тыльного вала
    const bagGeo = new RoundedBoxGeometry(0.58, 0.27, 0.42, 2, 0.08);
    type Row = {mesh: THREE.InstancedMesh; items: {x: number; z: number; ry: number; y: number; s: number}[]};
    const rows: Row[] = [];
    const mkRow = (side: number, row: number) => {
      const line = offsetLine(PATH, side, W + 0.3);
      const items: Row['items'] = [];
      let acc = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const d: P2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
        const st = row % 2 ? 0.3 : 0;
        for (let t = 0.45 + st; t < l - 0.4; t += 0.6) {
          const x = a[0] + d[0] * t;
          const z = a[1] + d[1] * t;
          if (z > -0.45) continue;
          items.push({x, z, ry: Math.atan2(d[0], d[1]) + Math.PI / 2, y: 0.145 + row * 0.25, s: acc + t});
        }
        acc += l;
      }
      const mesh = new THREE.InstancedMesh(bagGeo, m.bag, items.length);
      mesh.frustumCulled = false;
      dyn.add(mesh);
      rows.push({mesh, items});
    };
    mkRow(1, 0);
    mkRow(-1, 0);
    mkRow(1, 1);
    mkRow(-1, 1);
    mkRow(1, 2);
    // стрелковая ступень вдоль бруствера на каждом прямом колене
    const steps: THREE.Mesh[] = [];
    for (const g of SEGS) {
      if (Math.abs(g.d[0]) > 0.01) continue;
      const x = g.a[0];
      const st = new THREE.Mesh(box(x - W + 0.03, x - 0.4, 0, 0.9, Math.min(g.a[1], g.b[1]) + 0.5, Math.max(g.a[1], g.b[1]) - (g.s0 === 0 ? 0.0 : 0.5)), m.wood);
      st.position.y = -DEPTH;
      dyn.add(st);
      steps.push(st);
    }
    // перископ (вскрыт сбоку — видно два зеркала)
    const peri = new THREE.Group();
    {
      const w = 0.24;
      const h = 2.6;
      const parts = [
        box(-w / 2, w / 2, 0, h, -w / 2 - 0.02, -w / 2), // задняя стенка
        box(-w / 2 - 0.02, -w / 2, 0, h - 0.34, -w / 2, w / 2), // к врагу: окно сверху
        box(w / 2, w / 2 + 0.02, 0.34, h, -w / 2, w / 2), // к нам: окно снизу
        box(-w / 2 - 0.02, w / 2 + 0.02, h, h + 0.02, -w / 2 - 0.02, w / 2), // крышка
        box(-w / 2 - 0.02, w / 2 + 0.02, -0.02, 0, -w / 2 - 0.02, w / 2), // дно
      ];
      peri.add(new THREE.Mesh(mergeGeometries(parts), m.woodDark));
      const mir = (y: number) => {
        const mm = new THREE.Mesh(new THREE.BoxGeometry(w * 1.36, 0.015, w * 0.92), m.mirror);
        mm.rotation.z = -Math.PI / 4;
        mm.position.set(0, y, 0);
        return mm;
      };
      peri.add(mir(h - 0.17), mir(0.17));
      // столб-подставка
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), m.steel);
      post.position.set(0, 0.6, -w / 2 - 0.08);
      peri.add(post);
    }
    peri.position.set(-0.6, -DEPTH + 0.9, -2.5);
    dyn.add(peri);
    // ход луча: от врага → верхнее зеркало → вниз → нижнее зеркало → к нам
    const rayPath = new THREE.CurvePath<THREE.Vector3>();
    {
      const yT = -DEPTH + 0.9 + 2.6 - 0.17;
      const yB = -DEPTH + 0.9 + 0.17;
      const pts = [new THREE.Vector3(-7, yT, -2.5), new THREE.Vector3(-0.6, yT, -2.5), new THREE.Vector3(-0.6, yB, -2.5), new THREE.Vector3(0.7, yB, -2.5)];
      for (let i = 0; i < 3; i++) rayPath.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    }
    const rayGeo = new THREE.TubeGeometry(rayPath as any, 120, 0.035, 8, false);
    const ray = new THREE.Mesh(rayGeo, m.ray);
    ray.renderOrder = 12;
    const rayHead = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 12), m.ray);
    rayHead.renderOrder = 12;
    dyn.add(ray, rayHead);
    // блиндаж: обстановка
    const furn: THREE.Object3D[] = [];
    {
      const add = (o: THREE.Object3D) => {
        dyn.add(o);
        furn.push(o);
        return o;
      };
      // ступени лестницы
      const st: THREE.BufferGeometry[] = [];
      for (let y = -DEPTH - 0.35; y > R_FLOOR + 0.1; y -= 0.38) st.push(box(F(y) - 0.05, F(y) + 0.3, y - 0.06, y, -3.8, -0.15));
      add(new THREE.Mesh(mergeGeometries(st), m.wood));
      // пол, задняя стенка, правая стенка
      add(new THREE.Mesh(box(F(R_FLOOR) + 0.05, R_X1 - 0.05, R_FLOOR + 0.01, R_FLOOR + 0.08, -3.9, -0.1), m.wood));
      add(new THREE.Mesh(box(F(R_CEIL), R_X1, R_FLOOR, R_CEIL, -3.95, -3.86), m.woodDark));
      // балки потолка и стойки
      const logs: THREE.BufferGeometry[] = [];
      for (const z of [-0.5, -1.5, -2.5, -3.5]) {
        const lg = new THREE.CylinderGeometry(0.13, 0.13, R_X1 - C(R_CEIL) - 0.1, 10);
        lg.rotateZ(Math.PI / 2);
        lg.translate((R_X1 + C(R_CEIL)) / 2, R_CEIL - 0.14, z);
        logs.push(lg);
        for (const x of [C(R_CEIL) + 0.35, R_X1 - 0.2]) {
          const ps = new THREE.CylinderGeometry(0.1, 0.11, R_CEIL - R_FLOOR - 0.28, 8);
          ps.translate(x, (R_CEIL + R_FLOOR) / 2 - 0.14, z);
          logs.push(ps);
        }
      }
      add(new THREE.Mesh(mergeGeometries(logs.map((g) => g.toNonIndexed())), m.woodDark));
      // нары в два яруса
      const bunk: THREE.BufferGeometry[] = [];
      for (const y of [R_FLOOR + 0.5, R_FLOOR + 1.35]) bunk.push(box(8.1, 9.3, y, y + 0.08, -3.6, -0.7));
      add(new THREE.Mesh(mergeGeometries(bunk), m.wood));
      // стол, ящики
      const tb = [box(6.1, 7.3, R_FLOOR + 0.75, R_FLOOR + 0.82, -2.6, -1.5)];
      for (const x of [6.2, 7.2]) for (const z of [-2.5, -1.6]) tb.push(box(x - 0.04, x + 0.04, R_FLOOR + 0.08, R_FLOOR + 0.75, z - 0.04, z + 0.04));
      add(new THREE.Mesh(mergeGeometries(tb), m.wood));
      add(new THREE.Mesh(mergeGeometries([box(5.8, 6.4, R_FLOOR + 0.08, R_FLOOR + 0.5, -3.7, -3.2), box(5.9, 6.3, R_FLOOR + 0.5, R_FLOOR + 0.82, -3.65, -3.3)]), m.woodDark));
    }
    // лампа (качается после взрыва)
    const lamp = new THREE.Group();
    {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), m.steel);
      wire.position.y = -0.25;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 12), m.lampGlass);
      body.position.y = -0.6;
      const cap2 = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 12), m.steel);
      cap2.position.y = -0.47;
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({map: glowT, color: '#ffb760', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false}));
      gl.scale.setScalar(1.6);
      gl.position.y = -0.6;
      lamp.add(wire, body, cap2, gl);
      lamp.userData.glow = gl;
    }
    lamp.position.set(6.7, R_CEIL - 0.28, -2.0);
    dyn.add(lamp);
    furn.push(lamp);
    const lampL = new THREE.PointLight('#ffb766', 0, 7, 1.5);
    lampL.position.set(6.7, R_CEIL - 0.9, -1.6);
    dyn.add(lampL);
    // линейки-размеры на срезе
    const r2 = new THREE.Mesh(box(-0.06, 0.06, -1, 0, 0, 0.02), m.ruler);
    r2.position.set(-1.05, 0, 0.03);
    const r9 = new THREE.Mesh(box(-0.12, 0.12, -1, 0, 0, 0.02), m.ruler);
    r9.position.set(10.3, 0, 0.05);
    dyn.add(r2, r9);
    // взрывы, трассеры, осколки
    const blasts = [makeBlast(m, 71), makeBlast(m, 72)];
    blasts.forEach((b) => dyn.add(b.g));
    const streakGeo = box(-0.04, 0.04, -0.04, 0.04, -1, 0); // вытянут вдоль −z, голова в 0
    const streaks = Array.from({length: 20}, () => {
      const s = new THREE.Mesh(streakGeo, m.tracer);
      s.renderOrder = 8;
      dyn.add(s);
      return s;
    });
    const puffs = Array.from({length: 20}, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: m.smokeT[i % 3], color: '#8a7a66', transparent: true, depthWrite: false}));
      s.renderOrder = 7;
      dyn.add(s);
      return s;
    });
    // стрелки «гонки»: враг бежит к окопу, ты — вверх по лестнице
    const arrowThem = new THREE.Mesh(flatArrow(3.2, 0.7, 1.5, 1.1), m.arrowThem);
    const arrowUs = new THREE.Mesh(flatArrow(1.8, 0.45, 1.0, 0.7), m.arrowUs);
    const arrowFire = new THREE.Mesh(flatArrow(1, 0.5, 1.1, 0.9), m.arrowThem);
    arrowThem.renderOrder = arrowUs.renderOrder = arrowFire.renderOrder = 14;
    dyn.add(arrowThem, arrowUs, arrowFire);
    return {m, world, cap, plug, waterTop, waterFront, boards, revets, rows, steps, peri, ray, rayGeo, rayPath, rayHead, furn, lamp, lampL, r2, r9, blasts, streaks, puffs, arrowThem, arrowUs, arrowFire};
  }, []);

const useSkyLights = () =>
  useMemo(() => {
    const sky = makeSky(SUN);
    sky.renderOrder = -10;
    const sun = new THREE.DirectionalLight('#ffe0b8', 2.6);
    sun.position.copy(SUN).multiplyScalar(300);
    const fill = new THREE.DirectionalLight('#aec4e6', 0.55);
    fill.position.set(0.7, 0.5, 0.4).multiplyScalar(300);
    const hemi = new THREE.HemisphereLight('#c8d8ee', '#5e5a44', 0.85);
    return {sky, sun, fill, hemi};
  }, []);

// путь стрелки по лестнице (в плоскости среза)
const STAIR: P2[] = [
  [8.2, -10.5],
  [(F(R_FLOOR + 0.6) + C(R_FLOOR + 0.6)) / 2 + 0.3, R_FLOOR + 0.6],
  [(F(-DEPTH - 0.6) + C(-DEPTH - 0.6)) / 2, -DEPTH - 0.6],
  [0.2, -1.2],
];
const polyAt = (pts: P2[], k: number) => {
  const ls = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let s = k * ls.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ls.length; i++) {
    if (s <= ls[i] || i === ls.length - 1) {
      const t = Math.min(1, s / ls[i]);
      const a = pts[i];
      const b = pts[i + 1];
      return {x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0])};
    }
    s -= ls[i];
  }
  return {x: pts[0][0], y: pts[0][1], ang: 0};
};

// события по именам (время — из props.at сцен): взрывы, выстрелы, осколки
const EV_BLAST: Record<string, {pos: [number, number, number]; s: number}> = {
  b0: {pos: [-16, 0, -22], s: 1.6},
  b1: {pos: [6.5, 0, -1.5], s: 1.4},
  b2: {pos: [0, -1.9, -26], s: 1.1},
};
const EV_SHOT: Record<string, {from: number[]; to: number[]; v: number; puff?: boolean}> = {
  bu1: {from: [-9, 0.42, -2.2], to: [-1.38, 0.4, -2.2], v: 80, puff: true},
  bu2: {from: [-10, 1.05, -2.0], to: [8, 1.25, -2.0], v: 90},
};
const EV_SHRAP = {c: [0, -26] as P2, y: -1.2};
const EV_FIRE = {c: [3, -11.6] as P2, y: -1.0};

const OkopWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const W0 = useWorld();
  const SL = useSkyLights();
  const last = useRef<{dig: number; dug: number}>({dig: -1, dug: -1});
  const p = clamp01(frame / Math.max(1, dur));
  const sec = frame / fps;

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
    (scene as any).environmentIntensity = 0.6;
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
    const near = Math.min(2, Math.max(0.2, cp.dist * 0.05));
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== cp.fov || pc.far !== FAR || Math.abs(pc.near - near) > 1e-4) {
      pc.fov = cp.fov;
      pc.near = near;
      pc.far = FAR;
      pc.updateProjectionMatrix();
    }
    SL.sky.position.copy(camera.position);

    // --- копка окопа: заглушка закрывает невыкопанную часть
    const dig = range(P.dig ?? 1, p);
    const sDig = Math.round(dig * PATH_LEN * 20) / 20;
    if (sDig !== last.current.dig) {
      last.current.dig = sDig;
      W0.cap.geometry.dispose();
      const poly = sDig < PATH_LEN - 0.1 ? channelPoly(sDig) : [];
      W0.cap.geometry = poly.length > 2 ? prep(slabXZ(poly, DEPTH)) : new THREE.BufferGeometry();
    }
    // --- блиндаж: земля уходит по лестнице, потом из комнаты
    const dug = range(P.dug ?? 0, p);
    const qd = Math.round(dug * 200) / 200;
    if (qd !== last.current.dug) {
      last.current.dug = qd;
      W0.plug.geometry.dispose();
      const ps: THREE.BufferGeometry[] = [];
      const A: P2 = [(CORR[0][0] + CORR[1][0]) / 2, -DEPTH];
      const B: P2 = [(CORR[2][0] + CORR[3][0]) / 2, R_CEIL];
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const d: P2 = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
      const t = clamp01(qd / 0.55) * 1.2;
      const fr: P2 = [A[0] + d[0] * L * t, A[1] + d[1] * L * t];
      const c1 = qd >= 0.55 ? [] : clipPoly(CORR, (q) => (q[0] - fr[0]) * d[0] + (q[1] - fr[1]) * d[1]);
      const xf = F(R_CEIL) - 0.3 + (R_X1 - F(R_CEIL) + 0.3) * clamp01((qd - 0.55) / 0.45);
      const c2 = clipPoly(ROOM, (q) => q[0] - xf);
      for (const c of [c1, c2]) if (c.length > 2 && polyArea(c) > 1e-3) ps.push(slabXY(c, -4, 0));
      W0.plug.geometry = ps.length ? prep(mergeGeometries(ps.map((g) => (g.index ? g.toNonIndexed() : g)))) : new THREE.BufferGeometry();
    }

    // --- вода
    const wl = range(P.water ?? 0, p);
    const wy = -DEPTH + 0.02 + 0.36 * wl;
    W0.waterTop.visible = W0.waterFront.visible = wl > 0.03;
    W0.waterTop.position.y = wy;
    W0.waterFront.scale.y = wy + DEPTH;
    W0.waterFront.position.set(0, (wy - DEPTH) / 2, 0.006);
    // --- решётки: падают по очереди от среза вглубь
    const bk = range(P.boards ?? 0, p);
    W0.boards.forEach(({mesh, s}) => {
      const t0 = (s / PATH_LEN) * 0.75;
      const e = clamp01((bk - t0) / 0.06);
      mesh.visible = e > 0;
      mesh.position.y = mesh.userData.y0 + (1 - e) * (1 - e) * 0.9;
    });
    // --- обшивка
    const rv = range(P.revet ?? 0, p);
    W0.revets.forEach((r) => {
      r.visible = rv > 0.01;
      r.scale.y = Math.max(0.001, rv);
    });
    // --- мешки: ряд за рядом, волной от среза
    const bg = range(P.bags ?? 0, p);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const zero = new THREE.Vector3(0, 0, 0);
    const v = new THREE.Vector3();
    const order = [0, 1, 2, 3, 4];
    W0.rows.forEach((row, ri) => {
      const w0 = order[ri] / 5;
      row.items.forEach((it, j) => {
        const t0 = w0 + (it.s / PATH_LEN) * 0.14;
        const e = clamp01((bg - t0) / 0.05);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry);
        v.set(it.x, it.y + (1 - e) * (1 - e) * 0.8, it.z);
        mtx.compose(v, q, e > 0 ? one : zero);
        row.mesh.setMatrixAt(j, mtx);
      });
      row.mesh.instanceMatrix.needsUpdate = true;
    });
    // --- ступень
    const st = range(P.step ?? 0, p);
    W0.steps.forEach((s) => {
      s.visible = st > 0.01;
      s.scale.y = Math.max(0.001, st);
    });
    // --- перископ поднимается, луч бежит
    const pr = range(P.peri ?? 0, p);
    W0.peri.visible = pr > 0.01;
    W0.peri.position.y = -DEPTH + 0.9 - (1 - pr) * 1.2;
    W0.peri.scale.y = 0.55 + 0.45 * pr;
    const rk = range(P.ray ?? 0, p);
    W0.ray.visible = W0.rayHead.visible = rk > 0.01;
    const segs = 120;
    W0.rayGeo.setDrawRange(0, Math.round(rk * segs) * 8 * 6);
    const hp = W0.rayPath.getPointAt(Math.min(0.999, rk));
    const ht = W0.rayPath.getTangentAt(Math.min(0.999, rk));
    W0.rayHead.position.copy(hp);
    W0.rayHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ht);
    // --- обстановка блиндажа и лампа
    const fu = range(P.furn ?? 0, p);
    W0.furn.forEach((o, i) => {
      const e = clamp01((fu - (i / W0.furn.length) * 0.7) / 0.3);
      o.visible = e > 0;
      o.scale.setScalar(0.85 + 0.15 * easeInOut(e));
    });
    W0.lampL.intensity = 6 * clamp01((fu - 0.75) / 0.25);
    (W0.lamp.userData.glow as THREE.Sprite).visible = fu > 0.8;
    // --- линейки
    const r2 = range(P.r2 ?? 0, p);
    W0.r2.visible = r2 > 0.01;
    W0.r2.scale.y = Math.max(0.001, r2 * DEPTH);
    const r9 = range(P.r9 ?? 0, p);
    W0.r9.visible = r9 > 0.01;
    W0.r9.scale.y = Math.max(0.001, r9 * -R_CEIL);
    // --- события (абсолютные секунды из props.at → props.events): взрывы, трассеры, осколки — без обрыва на склейках
    const ev: Record<string, number> = P.events ?? {};
    const T = t0 + sec;
    const act = Object.entries(EV_BLAST)
      .filter(([k]) => ev[k] !== undefined && T - ev[k] >= 0 && T - ev[k] < 3.6)
      .sort((a, b) => ev[b[0]] - ev[a[0]])
      .slice(0, W0.blasts.length);
    let sway = 0;
    W0.blasts.forEach((b, i) => {
      const o = act[i];
      if (!o) {
        b.g.visible = false;
        return;
      }
      b.seed = 71 + Object.keys(EV_BLAST).indexOf(o[0]);
      updBlast(b, T - ev[o[0]], new THREE.Vector3(...o[1].pos), o[1].s);
    });
    if (ev.b1 !== undefined && T > ev.b1) {
      const dt = T - ev.b1;
      sway = Math.sin(dt * 5) * 0.32 * Math.exp(-dt * 0.7);
    }
    W0.lamp.rotation.z = sway;
    const tr: any[] = [];
    for (const [k, o] of Object.entries(EV_SHOT)) if (ev[k] !== undefined) tr.push({...o, T: ev[k]});
    if (ev.sh !== undefined) {
      const {c, y} = EV_SHRAP;
      for (let i = 0; i < 14; i++) {
        const back = i % 2;
        const a = ((i >> 1) / 6 - 0.5) * 1.1 + (back ? Math.PI : 0);
        const d: P2 = [Math.sin(a), -Math.cos(a)];
        tr.push({T: ev.sh, from: [c[0], y, c[1]], dir: d, len: rayWall(c, d), v: 34 + (i % 3) * 5, puff: true});
      }
    }
    if (ev.fi !== undefined) {
      const {c, y} = EV_FIRE;
      for (let i = 0; i < 2; i++) {
        const d: P2 = [0, -1];
        tr.push({T: ev.fi + i * 0.25, from: [c[0] + (i - 0.5) * 0.25, y, c[1]], dir: d, len: rayWall(c, d), v: 30, puff: true});
      }
    }
    W0.streaks.forEach((s, i) => {
      const o = tr[i];
      const pf = W0.puffs[i];
      if (!o) {
        s.visible = false;
        pf.visible = false;
        return;
      }
      const dt = T - o.T;
      const [fx, fy, fz] = o.from;
      let dx: number;
      let dy: number;
      let dz: number;
      let len: number;
      if (o.to) {
        dx = o.to[0] - fx;
        dy = o.to[1] - fy;
        dz = o.to[2] - fz;
        len = Math.hypot(dx, dy, dz);
        dx /= len;
        dy /= len;
        dz /= len;
      } else {
        dx = o.dir[0];
        dy = 0;
        dz = o.dir[1];
        len = o.len;
      }
      const vel = o.v ?? 60;
      const travel = dt * vel;
      const tEnd = len / vel;
      s.visible = dt > 0 && dt < tEnd + 0.05;
      if (s.visible) {
        const hd = Math.min(travel, len);
        const tail = Math.min(hd, 1.1);
        s.position.set(fx + dx * hd, fy + dy * hd, fz + dz * hd);
        s.lookAt(fx + dx * (hd + 1), fy + dy * (hd + 1), fz + dz * (hd + 1));
        s.scale.set(1, 1, Math.max(0.01, tail));
      }
      const pd = dt - tEnd;
      pf.visible = !!o.puff && pd > 0 && pd < 1.2;
      if (pf.visible) {
        pf.position.set(fx + dx * len, fy + dy * len + pd * 0.3, fz + dz * len);
        pf.scale.setScalar(0.4 + pd * 0.9);
        (pf.material as THREE.SpriteMaterial).opacity = 0.8 * (1 - pd / 1.2);
      }
    });
    // --- стрелка «огонь вдоль колена»
    const fa = range(P.fireArrow ?? 0, p);
    W0.arrowFire.visible = fa > 0.01;
    {
      const {c, y} = EV_FIRE;
      const len = rayWall(c, [0, -1]) - 0.4;
      if (W0.arrowFire.userData.len !== len) {
        W0.arrowFire.userData.len = len;
        W0.arrowFire.geometry.dispose();
        W0.arrowFire.geometry = flatArrow(len, 0.5, 1.1, 0.9);
      }
      W0.arrowFire.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      W0.arrowFire.position.set(c[0], y + 0.05, c[1]);
    }
    (W0.arrowFire.material as THREE.MeshBasicMaterial).opacity = 0.9 * fa;
    // --- гонка: враг бежит по полю, ты лезешь по лестнице
    const rc = P.race ? clamp01((p - P.race[0]) / (P.race[1] - P.race[0])) : -1;
    W0.arrowThem.visible = W0.arrowUs.visible = rc >= 0;
    if (rc >= 0) {
      W0.arrowThem.position.set(lerp(-17, -5.3, rc), 1.0, 0.3);
      const a = polyAt(STAIR, rc * 0.97);
      W0.arrowUs.position.set(a.x, a.y, 0.3);
      W0.arrowUs.rotation.z = a.ang;
      const fi = clamp01(rc * 8) * range(P.raceOp ?? 1, p);
      (W0.arrowThem.material as THREE.MeshBasicMaterial).opacity = 0.92 * fi;
      (W0.arrowUs.material as THREE.MeshBasicMaterial).opacity = 0.92 * fi;
    }
  }, [frame]);

  return null;
};

const Grade: React.FC<{rain: number}> = ({rain}) => {
  const frame = useCurrentFrame();
  const A = LOOK.grade;
  const r = rng(7);
  const drops = rain > 0.01 ? Array.from({length: 140}, () => [r() * 1200 - 60, r() * 2100, 40 + r() * 60, 0.25 + r() * 0.35]) : [];
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {rain > 0.01 ? (
        <>
          <AbsoluteFill style={{background: '#3c4656', mixBlendMode: 'multiply', opacity: 0.22 * rain}} />
          <svg width={SW} height={SH} style={{position: 'absolute', opacity: rain}}>
            {drops.map(([x, y, l, o], i) => {
              const yy = ((y + frame * 62) % 2100) - 90;
              const xx = x - ((frame * 62) % 2100) * 0.12;
              return <line key={i} x1={xx} y1={yy} x2={xx - l * 0.12} y2={yy + l} stroke="#dfe7ef" strokeWidth={2.4} strokeOpacity={o} strokeLinecap="round" />;
            })}
          </svg>
        </>
      ) : null}
      <AbsoluteFill style={{background: A.shadow, mixBlendMode: 'screen', opacity: A.shadowAmt}} />
      <AbsoluteFill style={{background: A.high, mixBlendMode: 'multiply', opacity: A.highAmt}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(14,20,30,${A.vignette}) 100%)`}} />
      <AbsoluteFill style={{mixBlendMode: 'overlay', opacity: A.grain, backgroundImage: `url(${grainTile()})`, backgroundSize: '256px 256px', backgroundPosition: `${(frame * 97) % 256}px ${(frame * 61) % 256}px`}} />
    </AbsoluteFill>
  );
};

export const OkopScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = lifeIn ?? Math.max(1, durationInFrames - 10);
  const p = clamp01(frame / life);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const bOut = 1 - clamp01((frame - (P.bannerEnd ?? 1) * life + 8) / 8);
  const rain = range(P.rain ?? 0, p);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 1, 8], near: 0.5, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <OkopWorld P={P} dur={life} t0={scene.start ?? 0} />
        <Post opt={P.post} />
      </ThreeCanvas>
      <Grade rain={rain} />
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
