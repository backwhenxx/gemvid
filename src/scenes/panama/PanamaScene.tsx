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
import {LOOKS, LookGrade, LookLights, followSky, shadowAll} from '../../lib/look';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «Панамский канал»: шлюзы Гатун в разрезе. 1 единица = 1 м.
// Ось канала — x: слева море (уровень 0), три камеры по 320 м, справа озеро Гатун (+26 м).
// Плоскость разреза z=0 — ближняя стенка камер срезана, видно воду «как в аквариуме», корабль, дно и водоводы под дном.
// Дальняя стенка z∈[-46,-33.5], по её верху ездят «мулы».
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const LV = [0, 8.67, 17.33, 26];
const GX = [0, 320, 640, 960];
const CZ = -33.5; // внутренняя грань дальней стенки
const WZ = -46; // внешняя грань стенки
const FL = [LV[0] - 12.5, LV[1] - 12.5, LV[2] - 12.5]; // дно камер
const YC = FL.map((f) => f - 5.5); // ось водовода под камерой
const CR = 2.8; // полувысота водовода
const SEA_BED = -14;
const LAKE_BED = 2;
const BOTTOM = -2500;
const SHIP_Z = -16.75;
const DRAFT = 11;
const CENTERS = [160, 480, 800];
const RISERS = (i: number) => Array.from({length: 11}, (_, k) => GX[i] + 30 + k * 26);

const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
// верх дальней стенки: ступени по камерам, пандусы для мулов перед воротами
const wallTop = (x: number) => {
  let y = LV[0] + 2.5;
  for (let g = 0; g < 3; g++) y = lerp(y, LV[g + 1] + 2.5, smooth(GX[g] - 50, GX[g] - 6, x));
  return y;
};
// профиль разреза: верх твёрдого (дно моря, бетонные днища камер со ступенями, дно озера)
const wv = (x: number, a: number, s: number) => a * Math.sin(x * 0.05 + s) + a * 0.5 * Math.sin(x * 0.13 + s * 2);
const cutTop = (x: number) => {
  if (x < -24) return SEA_BED + wv(x, 0.5, 1);
  if (x < GX[1] - 1.2) return FL[0];
  if (x < GX[2] - 1.2) return FL[1];
  if (x < 1000) return FL[2];
  return lerp(FL[2], LAKE_BED, smooth(1000, 1030, x)) + wv(x, 0.5, 2) * smooth(1000, 1060, x);
};
const concBot = (x: number) => (x > -24 && x < 1000 ? cutTop(x) - 12 : cutTop(x) - 0.01);
const sedBot = (x: number) => (x > -24 && x < 1000 ? concBot(x) : cutTop(x) - 7 + wv(x, 0.8, 3));
const rock1Bot = (x: number) => -48 + wv(x, 2.5, 4);

// высота земли за стенкой и вдаль
const hn = (x: number, z: number) =>
  Math.sin(x * 0.0041 + 1.3) * Math.cos(z * 0.0037 - 0.4) * 0.6 + Math.sin(x * 0.011 + z * 0.008) * 0.25 + Math.sin(x * 0.027 - z * 0.021 + 2) * 0.1;
const landH = (x: number, z: number) => {
  const d = -z; // удаление от разреза
  const near = wallTop(Math.max(-200, Math.min(1100, x))) - 0.5;
  // суша вдоль канала: x∈[-250,1060]
  const shoreL = smooth(-320, -230, x);
  const shoreR = 1 - smooth(1040, 1110, x);
  let h = lerp(SEA_BED - 1, near, shoreL * shoreR);
  // холмы джунглей растут с удалением
  const amp = smooth(70, 420, d);
  h += hn(x, z) * 40 * amp * shoreL * shoreR;
  // острова на озере
  const isl = (cx: number, cz: number, r: number, hh: number) => hh * smooth(r, r * 0.35, Math.hypot(x - cx, z - cz));
  h = Math.max(h, isl(1500, -700, 160, 62), isl(1950, -420, 110, 44), isl(2400, -1100, 230, 80), isl(1250, -1300, 180, 58));
  // дальний берег: гряда холмов к горизонту
  const ridge = smooth(1300, 2300, d) * (70 + hn(x * 0.6, z * 0.6) * 60);
  h = Math.max(h, SEA_BED - 1 + ridge);
  return h;
};

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  hook: {pos: [-470, 16, 120], look: [-270, 16, -30], fov: 45},
  hook2: {pos: [-430, 26, 170], look: [-180, 20, -40], fov: 45},
  overview: {pos: [-420, 95, 230], look: [480, 18, -60], fov: 45},
  enter: {pos: [-40, 34, 105], look: [150, 4, -20], fov: 45},
  gate: {pos: [-26, -1, 46], look: [4, -2, -14], fov: 45},
  culvert: {pos: [262, -6, 62], look: [290, -11, -6], fov: 45},
  rise: {pos: [40, 24, 115], look: [190, 6, -20], fov: 45},
  mules: {pos: [1005, 44, 30], look: [1070, 29, -40], fov: 45},
  drain: {pos: [-330, 140, 380], look: [460, -2, -30], fov: 45},
  lake: {pos: [980, 90, 220], look: [1500, 40, -600], fov: 45},
  queue: {pos: [-180, 95, 300], look: [-640, 4, -300], fov: 45},
  final: {pos: [-760, 95, 330], look: [80, 12, -140], fov: 45},
  final2: {pos: [-720, 110, 300], look: [120, 16, -150], fov: 45},
  cover: {pos: [300, 38, 150], look: [520, 14, -30], fov: 45},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.overview : c);
const range = (v: any, p: number, dur = 1, delay = 0, ease = false): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  const k = clamp01((p - delay) / dur);
  return lerp(v[0], v[1], ease ? easeInOut(k) : k);
};

// ---------- состояние шлюзования по «стадии» st ----------
// 0→1 корабль входит в 1-ю камеру; 1→1.15 ворота 0 закрываются; 1.15→2 камера 1 наполняется;
// 2→2.15 ворота 1 открываются; 2.15→3 переход во 2-ю; ... 6.15→7 выход в озеро; 7→7.15 ворота 3 закрываются;
// 7.15→8 все камеры сливают воду в океан.
const seg = (st: number, a: number, b: number) => clamp01((st - a) / (b - a));
const lockState = (st: number) => {
  const lv = [0, 1, 2].map((i) => {
    const fill = seg(st, 2 * i + 1.15, 2 * i + 2);
    const drain = seg(st, 7.15, 8);
    return lerp(lerp(LV[i], LV[i + 1], fill), LV[i], drain);
  });
  const gate = [0, 1, 2, 3].map((g) => {
    if (g === 0) return 1 - seg(st, 1, 1.15); // 1 = открыты
    const op = seg(st, 2 * g, 2 * g + 0.15);
    const cl = seg(st, 2 * g + 1, 2 * g + 1.15);
    return op * (1 - cl);
  });
  // корабль
  let x: number;
  let y: number;
  if (st < 1) {
    x = lerp(-300, CENTERS[0], easeInOut(st));
    y = 0;
  } else {
    let i = 0;
    for (let k = 1; k < 3; k++) if (st >= 2 * k + 0.15) i = k;
    x = CENTERS[i];
    y = lv[i];
    for (let k = 1; k <= 3; k++) {
      const u = seg(st, 2 * k + 0.15, 2 * k + 1);
      if (st >= 2 * k + 0.15 && st < 2 * k + 1) {
        x = lerp(CENTERS[k - 1], k < 3 ? CENTERS[k] : 1320, easeInOut(u));
        y = k < 3 ? lv[k] : LV[3];
      }
    }
    if (st >= 7) {
      x = 1320;
      y = LV[3];
    }
  }
  // поток в водоводах: какая камера наполняется (0..2), сила 0..1; слив — drain
  const env = (a: number, b: number) => smooth(a, a + 0.08, st) * (1 - smooth(b - 0.08, b, st));
  const fill = [0, 1, 2].map((i) => env(2 * i + 1.15, 2 * i + 2));
  const drain = env(7.15, 8);
  return {lv, gate, x, y, fill, drain};
};

// ---------- текстуры ----------
const cv = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
};
const tex = (c: HTMLCanvasElement, rx = 1, ry = 1, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
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
// бетон шлюзов: тёплый светло-серый, швы опалубки, потёки
const concreteTex = (base = '#b9b2a4', rep = 1 / 12) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 5000, ['rgba(255,250,235,0.18)', 'rgba(60,55,45,0.14)'], 5, [0.8, 2]);
  const r = rng(6);
  g.strokeStyle = 'rgba(70,64,54,0.35)';
  g.lineWidth = 2;
  for (let y = 0; y < 512; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * 512;
    const y = r() * 512;
    const gr = g.createLinearGradient(x, y, x, y + 60 + r() * 90);
    gr.addColorStop(0, 'rgba(70,72,60,0.22)');
    gr.addColorStop(1, 'rgba(70,72,60,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 3 + r() * 5, 150);
  }
  return tex(c, rep, rep);
};
// базальт/скала: тёмно-серо-синяя с трещинами
const rockTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#4e5459';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 4000, ['rgba(120,128,130,0.35)', 'rgba(25,28,32,0.35)'], 11, [1, 3]);
  const r = rng(12);
  g.strokeStyle = 'rgba(20,22,26,0.55)';
  for (let i = 0; i < 30; i++) {
    g.lineWidth = 1 + r() * 2;
    let x = r() * 512;
    let y = r() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 70;
      y += (r() - 0.3) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return tex(c, 1 / 30, 1 / 30);
};
// красная тропическая глина (латерит) — верхняя скала
const lateriteTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#8a4b2e';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 6000, ['rgba(190,110,70,0.35)', 'rgba(60,28,16,0.3)', 'rgba(210,160,90,0.25)'], 13, [1, 2.5]);
  speckle(g, 512, 512, 120, ['#6e6a62', '#9a8f80', '#5b3a28'], 14, [3, 8]);
  return tex(c, 1 / 24, 1 / 24);
};
// ил и песок дна
const siltTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#7a6f4e';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 8000, ['rgba(200,180,130,0.35)', 'rgba(50,45,30,0.3)'], 15, [0.8, 2]);
  speckle(g, 512, 512, 160, ['#d8cfb8', '#e6dccb'], 16, [1.5, 3]); // ракушки
  return tex(c, 1 / 14, 1 / 14);
};
// срез воды: светлее у поверхности, глубже — темнее
const waterCutTex = (top: string, bot: string) => {
  const [c, g] = cv(16, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bot);
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// борт корабля: листы обшивки и потёки ржавчины
const hullTex = (base: string, seed: number) => {
  const [c, g] = cv(512, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1.5;
  for (let x = 0; x < 512; x += 48) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  for (let y = 0; y < 256; y += 40) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  const r = rng(seed);
  for (let i = 0; i < 40; i++) {
    const x = r() * 512;
    const y = r() * 200;
    const gr = g.createLinearGradient(x, y, x, y + 50);
    gr.addColorStop(0, 'rgba(130,70,40,0.35)');
    gr.addColorStop(1, 'rgba(130,70,40,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 2 + r() * 3, 50);
  }
  return tex(c, 1 / 40, 1 / 20);
};
// обшивка ворот: панели, пояса, заклёпки
const gateTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#434b4f';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, y, 256, 4);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, y + 4, 256, 2);
    for (let x = 4; x < 256; x += 10) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x, y + 8, 2, 2);
    }
  }
  for (let x = 0; x < 256; x += 64) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x, 0, 3, 256);
  }
  const r = rng(33);
  for (let i = 0; i < 30; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const gr = g.createLinearGradient(x, y, x, y + 40);
    gr.addColorStop(0, 'rgba(140,80,45,0.3)');
    gr.addColorStop(1, 'rgba(140,80,45,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 2, 40);
  }
  return tex(c, 1 / 8, 1 / 8);
};
// гофра контейнеров
const corrTex = () => {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(x, 0, 3, 64);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(x + 4, 0, 1, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 256, 3);
  g.fillRect(0, 61, 256, 3);
  return tex(c, 1, 1);
};
// окна надстройки
const bridgeTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#ece9e1';
  g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = '#2f3b44';
      g.fillRect(i * 32 + 8, j * 32 + 10, 16, 12);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, j * 32 + 30, 256, 2);
  }
  return tex(c, 1 / 18, 1 / 18);
};
// полотно дождя
const rainTex = () => {
  const [c, g] = cv(256, 512);
  const r = rng(71);
  for (let i = 0; i < 260; i++) {
    const x = r() * 256;
    const y = r() * 512;
    const gr = g.createLinearGradient(x, y, x - 6, y + 50);
    gr.addColorStop(0, 'rgba(220,230,240,0)');
    gr.addColorStop(0.5, 'rgba(220,230,240,0.55)');
    gr.addColorStop(1, 'rgba(220,230,240,0)');
    g.strokeStyle = gr;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 6, y + 50);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// ---------- геометрия ----------
const xsamples = (() => {
  const xs: number[] = [];
  for (let x = -4000; x < -400; x += 80) xs.push(x);
  for (let x = -400; x <= 1200; x += 2) xs.push(x);
  for (let x = 1240; x <= 4000; x += 80) xs.push(x);
  [-24, GX[1] - 1.2, GX[2] - 1.2, 1000].forEach((v) => {
    xs.push(v - 0.01);
    xs.push(v + 0.01);
  });
  return xs.sort((a, b) => a - b);
})();
const layer = (top: (x: number) => number, bot: (x: number) => number, depth: number, x0 = -4000, x1 = 4000) => {
  const xs = xsamples.filter((x) => x >= x0 && x <= x1);
  const s = new THREE.Shape();
  s.moveTo(xs[0], bot(xs[0]));
  xs.forEach((x) => s.lineTo(x, bot(x)));
  for (let i = xs.length - 1; i >= 0; i--) s.lineTo(xs[i], Math.max(top(xs[i]), bot(xs[i]) + 0.001));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: false, curveSegments: 1});
  g.translate(0, 0, -depth);
  return g;
};
// плоская текстурная развёртка для экструдированного профиля (uv = мировые x,y)
const planarUV = (g: THREE.BufferGeometry) => {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ny = Math.abs(nor.getY(i));
    const nx = Math.abs(nor.getX(i));
    uv[i * 2] = ny > 0.6 ? pos.getX(i) : nx > 0.6 ? pos.getZ(i) : pos.getX(i);
    uv[i * 2 + 1] = ny > 0.6 ? pos.getZ(i) : pos.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};

// корабль-контейнеровоз: длина ~205 м, ширина 28 м, осадка 11 м. Начало координат — киль по центру.
const HW = 14;
const halfW = (x: number) => {
  let w = HW;
  if (x > 70) w *= 1 - 0.92 * Math.pow(clamp01((x - 70) / 34), 1.6);
  if (x < -92) w *= 1 - 0.18 * clamp01((-92 - x) / 9);
  return w;
};
// корпус с частыми вершинами по длине (для сужения носа и кормы)
const hullSlab = (y0: number, y1: number, xAt: (y: number) => [number, number]) => {
  const N = 48;
  const pos: number[] = [];
  const idx: number[] = [];
  const uv: number[] = [];
  // кольца по x, в каждом 4 точки сечения (низ-лев, верх-лев, верх-прав, низ-прав)
  const [xa0, xb0] = xAt(y0);
  const [xa1, xb1] = xAt(y1);
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const xl = lerp(xa0, xb0, k);
    const xu = lerp(xa1, xb1, k);
    const wl = halfW(xl);
    const wu = halfW(xu);
    pos.push(xl, y0, -wl, xu, y1, -wu, xu, y1, wu, xl, y0, wl);
    uv.push(xl, y0, xu, y1, xu, y1, xl, y0);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4;
    const b = a + 4;
    // борт -z, верх, борт +z, низ
    for (let s = 0; s < 4; s++) {
      const s1 = (s + 1) % 4;
      idx.push(a + s, a + s1, b + s, b + s, a + s1, b + s1);
    }
  }
  // торцы
  idx.push(0, 2, 1, 0, 3, 2);
  const e = N * 4;
  idx.push(e, e + 1, e + 2, e, e + 2, e + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
};

const makeShip = (m: Record<string, any>, seed: number) => {
  const sh = new THREE.Group();
  // корма x=-101 (с подрезом снизу), нос — наклонный форштевень до x=104 на палубе
  const ends = (y: number): [number, number] => [y < 6 ? lerp(-96, -101, y / 6) : -101, y < 8 ? lerp(88, 98, y / 8) : lerp(98, 104, (y - 8) / 14)];
  sh.add(new THREE.Mesh(hullSlab(0, 4, ends), m.hullRed));
  sh.add(new THREE.Mesh(hullSlab(4, 10.6, ends), m.hullRed));
  sh.add(new THREE.Mesh(hullSlab(10.6, 11.4, ends), m.hullStripe));
  sh.add(new THREE.Mesh(hullSlab(11.4, 22, ends), m.hullBlue));
  // палуба
  const ds = new THREE.Shape();
  const xs: number[] = [];
  for (let x = -101; x <= 104; x += 2) xs.push(x);
  ds.moveTo(-101, -halfW(-101));
  xs.forEach((x) => ds.lineTo(x, -halfW(x) + 0.05));
  for (let i = xs.length - 1; i >= 0; i--) ds.lineTo(xs[i], halfW(xs[i]) - 0.05);
  const dg = new THREE.ShapeGeometry(ds);
  dg.rotateX(Math.PI / 2);
  dg.translate(0, 22.04, 0);
  sh.add(new THREE.Mesh(dg, m.deck));
  // фальшборт на баке
  sh.add(new THREE.Mesh(box(84, 103, 22, 24.2, -0.4, 0.4), m.hullBlue));
  // надстройка, крылья мостика, труба
  sh.add(new THREE.Mesh(box(-96, -80, 22, 40, -11, 11), m.bridge));
  sh.add(new THREE.Mesh(box(-84, -80, 38, 40.2, -14.6, 14.6), m.bridge));
  sh.add(new THREE.Mesh(box(-96.3, -79.7, 40.2, 41, -11.3, 11.3), m.dark));
  sh.add(new THREE.Mesh(box(-100, -94, 22, 44, -3.2, 3.2), m.funnel));
  sh.add(new THREE.Mesh(box(-100.2, -93.8, 39, 41.5, -3.4, 3.4), m.funnelBand));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 12, 8), m.dark);
  mast.position.set(96, 30, 0);
  sh.add(mast);
  // контейнеры: одна общая геометрия с цветами вершин
  const cols = ['#9a3a2c', '#2e5a78', '#3f6b4c', '#b3832f', '#7d8286', '#c8c1b2', '#6d3f30', '#255055'].map((c) => new THREE.Color(c));
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let bx = -76; bx < 84; bx += 12.9) {
    const tiers = 3 + Math.floor(r() * 4);
    for (let row = 0; row < 10; row++) {
      const z = -12.2 + row * 2.44 + 1.22;
      if (Math.abs(z) + 1.3 > Math.min(halfW(bx), halfW(bx + 12.2))) continue;
      const tr = Math.max(1, tiers - (r() < 0.25 ? 1 : 0) - (Math.abs(z) > 10 ? 1 : 0));
      for (let t = 0; t < tr; t++) {
        const g = new THREE.BoxGeometry(12.1, 2.5, 2.36);
        g.translate(bx + 6.1, 22.1 + 1.25 + t * 2.59, z);
        const cc = cols[Math.floor(r() * cols.length)];
        const ca = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < g.attributes.position.count; i++) ca.set([cc.r, cc.g, cc.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        parts.push(g);
      }
    }
  }
  sh.add(new THREE.Mesh(mergeGeometries(parts), m.boxes));
  parts.forEach((g) => g.dispose());
  shadowAll(sh);
  return sh;
};

// створка ворот: полая стальная коробка (обшивка + горизонтальные ригели), шарнир у дальней стенки
const LEAF_T = 2.2;
const LEAF_L = -CZ - 0.07; // от шарнира (у дальней стенки) до плоскости разреза
const leafUV = (g: THREE.BufferGeometry) => {
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getZ(i);
    uv[i * 2 + 1] = pos.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
const makeLeaf = (m: Record<string, any>, h: number) => {
  const g = new THREE.Group();
  const th = 0.28;
  // обшивка с двух сторон (по x), вдоль z от шарнира (z=0) до разреза
  g.add(new THREE.Mesh(leafUV(box(-LEAF_T / 2, -LEAF_T / 2 + th, 0, h, 0, LEAF_L)), m.gate));
  g.add(new THREE.Mesh(leafUV(box(LEAF_T / 2 - th, LEAF_T / 2, 0, h, 0, LEAF_L)), m.gate));
  // ригели: горизонтальные перегородки — на срезе видны ячейки
  for (let y = 0; y <= h - 0.2; y += 2.4) g.add(new THREE.Mesh(box(-LEAF_T / 2 + th, LEAF_T / 2 - th, y, y + 0.3, 0, LEAF_L), m.girder));
  g.add(new THREE.Mesh(box(-LEAF_T / 2 + th, LEAF_T / 2 - th, h - 0.3, h, 0, LEAF_L), m.girder));
  // торец у шарнира и тёмная полость внутри
  g.add(new THREE.Mesh(box(-LEAF_T / 2, LEAF_T / 2, 0, h, 0, 0.4), m.gate));
  g.add(new THREE.Mesh(box(-LEAF_T / 2 + th, LEAF_T / 2 - th, 0, h, 0.4, LEAF_L - 0.6), m.cavity));
  // мостик по верху створки
  g.add(new THREE.Mesh(box(-1.3, 1.3, h, h + 0.15, 0, LEAF_L), m.girder));
  shadowAll(g);
  return g;
};

const makeMule = (m: Record<string, any>) => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(box(-5.5, 5.5, 0.6, 3.4, -1.6, 1.6), m.mule));
  g.add(new THREE.Mesh(box(-2.2, 2.2, 3.4, 5.6, -1.5, 1.5), m.mule));
  g.add(new THREE.Mesh(box(-2.25, 2.25, 4.2, 5.2, -1.55, 1.55), m.dark)); // окна кабины
  g.add(new THREE.Mesh(box(-5.6, 5.6, 1.6, 2.0, -1.65, 1.65), m.muleStripe));
  g.add(new THREE.Mesh(box(-5, 5, 0, 0.7, -1.3, 1.3), m.dark)); // тележки
  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 12), m.steel);
  winch.rotation.x = Math.PI / 2;
  winch.position.set(3.8, 4.0, 0);
  g.add(winch);
  shadowAll(g);
  return g;
};

// ---------- мир ----------
const useWorld = () =>
  useMemo(() => {
    const wtop = waterTexture();
    const m: Record<string, any> = {
      conc: new THREE.MeshStandardMaterial({map: concreteTex(), roughness: 0.92, fog: false}),
      concDark: new THREE.MeshStandardMaterial({map: concreteTex('#9a9487', 1 / 10), roughness: 0.95}),
      rock: new THREE.MeshStandardMaterial({map: rockTex(), roughness: 1, fog: false}),
      later: new THREE.MeshStandardMaterial({map: lateriteTex(), roughness: 1, fog: false}),
      silt: new THREE.MeshStandardMaterial({map: siltTex(), roughness: 1, fog: false}),
      land: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1}),
      waterTop: new THREE.MeshStandardMaterial({map: wtop, color: '#4c8a86', transparent: true, opacity: 0.9, roughness: 0.08, metalness: 0.2}),
      waterCut: new THREE.MeshStandardMaterial({map: waterCutTex('#3f8c88', '#123f48'), transparent: true, opacity: 0.58, fog: false, roughness: 0.2, depthWrite: false}),
      lakeCut: new THREE.MeshStandardMaterial({map: waterCutTex('#3f8a78', '#123c38'), transparent: true, opacity: 0.66, fog: false, roughness: 0.2, depthWrite: false}),
      culvert: new THREE.MeshStandardMaterial({map: waterCutTex('#2d6670', '#163a44'), roughness: 0.5}),
      culvertRim: new THREE.MeshStandardMaterial({color: '#cfc8b8', roughness: 0.9}),
      gate: new THREE.MeshStandardMaterial({map: gateTex(), metalness: 0.5, roughness: 0.55}),
      girder: new THREE.MeshStandardMaterial({color: '#8a9089', metalness: 0.45, roughness: 0.55}),
      cavity: new THREE.MeshStandardMaterial({color: '#1b1f22', roughness: 1}),
      steel: new THREE.MeshStandardMaterial({color: '#7f878b', metalness: 0.75, roughness: 0.35}),
      valve: new THREE.MeshStandardMaterial({color: '#a8562f', metalness: 0.4, roughness: 0.5}),
      rail: new THREE.MeshStandardMaterial({color: '#3a3936', metalness: 0.6, roughness: 0.5}),
      hullRed: new THREE.MeshStandardMaterial({map: hullTex('#8b3b2b', 1), roughness: 0.7}),
      hullBlue: new THREE.MeshStandardMaterial({map: hullTex('#24394c', 2), roughness: 0.55, metalness: 0.15}),
      hullStripe: new THREE.MeshStandardMaterial({color: '#e8e4da', roughness: 0.6}),
      deck: new THREE.MeshStandardMaterial({color: '#5a6a5a', roughness: 0.9, side: THREE.DoubleSide}),
      bridge: new THREE.MeshStandardMaterial({map: bridgeTex(), roughness: 0.6}),
      dark: new THREE.MeshStandardMaterial({color: '#2a3036', roughness: 0.6}),
      funnel: new THREE.MeshStandardMaterial({color: '#e2ddd2', roughness: 0.6}),
      funnelBand: new THREE.MeshStandardMaterial({color: '#b0452f', roughness: 0.6}),
      boxes: new THREE.MeshStandardMaterial({map: corrTex(), vertexColors: true, roughness: 0.7, metalness: 0.1}),
      mule: new THREE.MeshStandardMaterial({color: '#c4c8c6', metalness: 0.55, roughness: 0.35}),
      muleStripe: new THREE.MeshStandardMaterial({color: '#2f6f5f', roughness: 0.5}),
      rope: new THREE.MeshBasicMaterial({color: '#2c2a26'}),
      canopy: new THREE.MeshStandardMaterial({color: '#ffffff', vertexColors: false, roughness: 0.95}),
      trunk: new THREE.MeshStandardMaterial({color: '#5a4636', roughness: 1}),
      drop: new THREE.MeshBasicMaterial({color: '#d6f3f6', fog: false}),
      jet: new THREE.MeshBasicMaterial({color: '#e4f6f4', transparent: true, opacity: 0.7, fog: false, depthWrite: false}),
      arrow: new THREE.MeshBasicMaterial({color: '#e9fbff', transparent: true, opacity: 0.9, fog: false, depthWrite: false}),
      rain: new THREE.MeshBasicMaterial({map: rainTex(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}),
      mudBand: new THREE.MeshStandardMaterial({color: '#7d6f4f', roughness: 1}),
    };
    const world = new THREE.Group();
    const r = rng(23);

    // --- срез земли: бетон шлюзов, ил, латерит, базальт
    const L = (g: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[]) => {
      const me = new THREE.Mesh(planarUV(g), mat);
      me.receiveShadow = true;
      world.add(me);
      return me;
    };
    L(layer(cutTop, concBot, 2000, -24.01, 1000.01), m.conc);
    L(layer((x) => (x > -24 && x < 1000 ? -1e4 : cutTop(x)), sedBot, 2000), m.silt);
    L(layer((x) => Math.min(concBot(x), sedBot(x)), rock1Bot, 2000), m.later);
    L(layer(rock1Bot, () => BOTTOM, 2000), m.rock);

    // --- дальняя стенка шлюзов (ступенями) и рельсы мулов
    const wall = new THREE.Mesh(planarUV(layer(wallTop, () => -30, WZ * -1 + CZ, -200, 1100)), m.concDark);
    wall.position.z = CZ;
    world.add(wall);
    [-38.2, -41.8].forEach((z) => {
      const rl = new THREE.Mesh(layer((x) => wallTop(x) + 0.22, (x) => wallTop(x), 0.25, -200, 1100), m.rail);
      rl.position.z = z + 0.125;
      world.add(rl);
    });
    
    // --- земля за стенкой, холмы, острова, дальний берег
    const NX = 220;
    const NZ = 130;
    const tg = new THREE.PlaneGeometry(7000, 4200, NX, NZ);
    tg.rotateX(-Math.PI / 2);
    tg.translate(500, 0, -2100 + WZ - 0.6);
    const tp = tg.attributes.position;
    const colors = new Float32Array(tp.count * 3);
    const cJ = [new THREE.Color('#223d1f'), new THREE.Color('#33552a'), new THREE.Color('#4a6a33')];
    const cSand = new THREE.Color('#b9a77c');
    const cMud = new THREE.Color('#5f5a40');
    const cc = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const z = tp.getZ(i);
      let h = landH(x, z);
      if (z > WZ - 1) h = Math.min(h, wallTop(Math.max(-200, Math.min(1100, x))) - 0.5);
      tp.setY(i, h);
      const water = x > 1000 ? LV[3] : 0;
      const n = 0.5 + 0.5 * Math.sin(x * 0.07 + z * 0.05) * Math.cos(x * 0.031 - z * 0.06);
      if (h < water - (x > 1000 ? 5 : 1.5)) cc.copy(cMud);
      else if (h < water + (x > 1000 ? 3 : 2.5) && !(x > -200 && x < 1100 && z > -120)) cc.copy(cSand);
      else cc.copy(cJ[0]).lerp(cJ[1], n).lerp(cJ[2], clamp01((h - 40) / 120) * 0.6);
      colors.set([cc.r, cc.g, cc.b], i * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    tg.computeVertexNormals();
    const land = new THREE.Mesh(tg, m.land);
    land.receiveShadow = true;
    world.add(land);

    // --- полоса травы и бетонная бровка вдоль стенки (суша у шлюзов аккуратная, без джунглей вплотную)
    // --- джунгли: кроны-шары (инстансы) на суше
    const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), m.canopy, 1500);
    const dm = new THREE.Object3D();
    let ci = 0;
    const cA = new THREE.Color('#1f3a1c');
    const cB = new THREE.Color('#2f5226');
    const cC = new THREE.Color('#47672e');
    for (let k = 0; k < 6000 && ci < 1500; k++) {
      const x = -260 + r() * 1700;
      const z = WZ - 40 - Math.pow(r(), 1.6) * 900;
      const h = landH(x, z);
      const water = x > 1000 ? LV[3] : 0;
      if (h < water + 3) continue;
      const s = 7 + r() * 9;
      dm.position.set(x, h + s * 0.5, z);
      dm.scale.set(s, s * (0.75 + r() * 0.3), s);
      dm.updateMatrix();
      crowns.setMatrixAt(ci, dm.matrix);
      crowns.setColorAt(ci, cc.copy(cA).lerp(r() > 0.5 ? cB : cC, r()));
      ci++;
    }
    crowns.count = ci;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    world.add(crowns);

    // --- вода: море и озеро (верх + срез), уровень озера меняется в засуху — поэтому озеро в dyn
    const seaTop = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), m.waterTop);
    seaTop.rotation.x = -Math.PI / 2;
    seaTop.position.set(-3000 - 1.15, 0, -3000);
    world.add(seaTop);
    const seaCut = new THREE.Mesh(new THREE.PlaneGeometry(4000 - 1.15, -SEA_BED + 1), m.waterCut);
    seaCut.position.set(-2000 - 0.58, (SEA_BED - 1) / 2, 0.02);
    world.add(seaCut);

    // --- облака: кучевые, плотные, у горизонта
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(300 + i), color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, fog: false}));
      s.scale.set(420 + r() * 300, 170 + r() * 90, 1);
      s.position.set(-2600 + i * 420 + r() * 150, 260 + r() * 260, -2600 - r() * 600);
      world.add(s);
      clouds.push(s);
    }
    // тёмная дождевая туча над озером и полотна дождя
    const storm: THREE.Sprite[] = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(900 + i), color: '#6f7a84', transparent: true, opacity: 0, depthWrite: false, fog: false}));
      s.scale.set(700, 260, 1);
      s.position.set(1450 + i * 260, 330 + (i % 2) * 40, -1300 - i * 120);
      world.add(s);
      storm.push(s);
    }
    const rain: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(620, 340), m.rain);
      pl.position.set(1450 + i * 260, 160, -1250 - i * 120);
      world.add(pl);
      rain.push(pl);
    }

    // --- очередь кораблей на рейде (стоят всегда)
    const queue = new THREE.Group();
    [
      [-520, -170, 0.35],
      [-760, -330, -0.25],
      [-560, -520, 0.8],
      [-980, -200, 0.15],
      [-900, -620, -0.5],
      [-1250, -420, 0.45],
      [-700, -860, 1.1],
    ].forEach(([x, z, a], i) => {
      const s = makeShip(m, 100 + i);
      s.position.set(x, -DRAFT, z);
      s.rotation.y = a;
      queue.add(s);
    });
    world.add(queue);

    shadowAll(world);
    land.castShadow = false;
    seaTop.castShadow = false;
    seaCut.castShadow = false;
    seaTop.receiveShadow = true;
    rain.forEach((p) => (p.castShadow = false));

    const ship = makeShip(m, 7);
    const leaves = [0, 1, 2, 3].map((g) => {
      const bot = FL[Math.min(g, 2)];
      const h = LV[Math.min(g + 1, 3)] + 1.5 - bot;
      const lf = makeLeaf(m, h);
      lf.position.set(GX[g], bot, CZ + 0.05);
      return lf;
    });
    const mules = [0, 1].map(() => makeMule(m));
    leaves.forEach((l) => world.add(l));
    mules.forEach((u) => world.add(u));
    world.add(ship);
    return {m, world, ship, leaves, mules, clouds, storm, rain, cache: new Map<string, THREE.Object3D>()};
  }, []);

// ---------- сцена ----------
const PanamaWorld: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene} = useThree();
  const W0 = useWorld();
  const {m} = W0;
  const p = clamp01(frame / life);
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
    scene.add(W0.world, dyn);
    return () => {
      scene.remove(W0.world, dyn);
    };
  }, []);

  useLayoutEffect(() => {
    dyn.children.slice().forEach((c: any) => {
      dyn.remove(c);
      if (!c.userData.cached) c.geometry?.dispose?.();
    });
    const add = (o: THREE.Object3D) => dyn.add(o);
    const st = range(P.st, p, P.stDur ?? 1, P.stDelay ?? 0);
    const S = lockState(st);

    // --- вода в камерах (верх отдельно от среза, чтобы срез был полупрозрачным «аквариумом»)
    const waterBox = (key: string, x0: number, x1: number, y0: number, y1: number, cut = m.waterCut) =>
      cached(key, () => {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, CZ * -1 - 0.1), m.waterTop);
        top.rotation.x = -Math.PI / 2;
        top.position.set((x0 + x1) / 2, y1, CZ / 2 - 0.02);
        top.receiveShadow = true;
        g.add(top);
        const front = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), cut);
        front.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.02);
        g.add(front);
        return g;
      });
    const q = (v: number) => Math.round(v * 20) / 20;
    S.lv.forEach((lv, i) => {
      const y = q(lv);
      add(waterBox(`ch${i}_${y}`, GX[i] + LEAF_T / 2 + 0.02, GX[i + 1] - LEAF_T / 2 - 0.02, FL[i], y));
    });
    // проёмы ворот: когда ворота открыты, вода сплошная
    [0, 1, 2, 3].forEach((g) => {
      if (S.gate[g] < 0.02) return;
      const lo = g === 0 ? 0 : S.lv[g - 1];
      const hi = g === 3 ? LV[3] : S.lv[g];
      const y = q(Math.min(lo, hi));
      add(waterBox(`gap${g}_${y}`, GX[g] - LEAF_T / 2 - 0.02, GX[g] + LEAF_T / 2 + 0.02, FL[Math.min(g, 2)], y));
    });
    // озеро: уровень падает в засуху
    const drop = range(P.lakeDrop, p, P.lakeDur ?? 0.5, P.lakeDelay ?? 0, true) * 4;
    const lakeY = q(LV[3] - drop);
    add(
      cached(`lake${lakeY}`, () => {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), m.waterTop);
        top.rotation.x = -Math.PI / 2;
        top.position.set(GX[3] + LEAF_T / 2 + 3000 + 0.02, lakeY, -3000);
        top.receiveShadow = true;
        g.add(top);
        const front = new THREE.Mesh(new THREE.PlaneGeometry(4000, lakeY - LAKE_BED + 1), m.lakeCut);
        front.position.set(GX[3] + LEAF_T / 2 + 2000 + 0.02, (lakeY + LAKE_BED - 1) / 2, 0.02);
        g.add(front);
        return g;
      }),
    );
    // --- водоводы на срезе (под днищем), подъёмные стояки и затворы
    add(
      cached('culverts', () => {
        const g = new THREE.Group();
        const Z0 = -0.5;
        const Z1 = 0.05;
        const seg2 = (x0: number, x1: number, y0: number, y1: number) => {
          g.add(new THREE.Mesh(box(x0 - 0.5, x1 + 0.5, y0 - 0.5, y1 + 0.5, Z0 - 0.1, Z1 - 0.02), m.culvertRim));
          g.add(new THREE.Mesh(box(x0, x1, y0, y1, Z0, Z1), m.culvert));
        };
        // горизонтальные участки под камерами
        seg2(-30, GX[1] - 1.2 + CR, YC[0] - CR, YC[0] + CR);
        seg2(GX[1] - 1.2 - CR, GX[2] - 1.2 + CR, YC[1] - CR, YC[1] + CR);
        seg2(GX[2] - 1.2 - CR, 1012, YC[2] - CR, YC[2] + CR);
        // ступени между камерами
        seg2(GX[1] - 1.2 - CR, GX[1] - 1.2 + CR, YC[0] + CR, YC[1] + CR);
        seg2(GX[2] - 1.2 - CR, GX[2] - 1.2 + CR, YC[1] + CR, YC[2] + CR);
        // выход в море и забор из озера
        seg2(-36, -30 + 0.01, YC[0] - CR, cutTop(-36) - 0.1);
        seg2(1006, 1012, YC[2] - CR, cutTop(1012) - 0.1);
        // стояки к отверстиям в дне
        [0, 1, 2].forEach((i) =>
          RISERS(i).forEach((x) => {
            g.add(new THREE.Mesh(box(x - 0.8, x + 0.8, YC[i] + CR - 0.1, FL[i] - 0.06, Z0, Z1), m.culvert));
          }),
        );
        return g;
      }),
    );
    // затворы: плита в шахте поднимается, открывая водовод
    const valveOpen = [
      Math.max(S.drain, 0), // у моря — слив
      Math.max(S.fill[0], S.drain),
      Math.max(S.fill[1], S.drain),
      Math.max(S.fill[2], S.drain),
    ];
    valveOpen.forEach((o, g) => {
      const x = g === 0 ? -14 : g === 3 ? 990 : GX[g] + 12;
      const i = Math.min(g, 2);
      const yc = g === 0 ? YC[0] : YC[i];
      const lift = Math.round(easeInOut(clamp01(o * 3)) * 2 * CR * 10) / 10;
      add(
        cached(`valve${g}_${lift}`, () => {
          const v = new THREE.Group();
          v.add(new THREE.Mesh(box(x - 1.1, x + 1.1, yc - 3 * CR - 0.4, yc - CR - 0.2, -0.6, 0.06), m.cavity)); // шахта под водоводом
          v.add(new THREE.Mesh(box(x - 0.7, x + 0.7, yc - CR - lift, yc + CR - lift, -0.45, 0.16), m.valve));
          return v;
        }),
      );
    });

    // --- поток: частицы по пути «отверстия верхней камеры → водовод → затвор → водовод → отверстия нижней камеры»
    const path = (pts: [number, number][], u: number): [number, number] => {
      let L = 0;
      const ls = pts.slice(1).map((q2, k) => {
        const l = Math.hypot(q2[0] - pts[k][0], q2[1] - pts[k][1]);
        L += l;
        return l;
      });
      let d = u * L;
      for (let k = 0; k < ls.length; k++) {
        if (ls[k] > 1e-6 && d <= ls[k]) {
          const kk = d / ls[k];
          return [lerp(pts[k][0], pts[k + 1][0], kk), lerp(pts[k][1], pts[k + 1][1], kk)];
        }
        d -= ls[k];
      }
      return pts[pts.length - 1];
    };
    const rr = rng(5);
    const dropGeo = cached('dropGeo', () => new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), m.drop)).geometry;
    const pushDrop = (x: number, y: number, s = 1) => {
      const d = new THREE.Mesh(dropGeo, m.drop);
      d.userData.cached = true;
      d.position.set(x, y, 0.35);
      d.scale.setScalar(s);
      add(d);
    };
    S.fill.forEach((a, i) => {
      if (a < 0.02) return;
      const xg = GX[i + 1] - 1.2;
      for (let k = 0; k < 90; k++) {
        const ups = RISERS(i + 1 < 3 ? i + 1 : 2);
        const xi = ups[Math.floor(rr() * 4)];
        const xr = RISERS(i)[Math.floor(rr() * 11)];
        const pts: [number, number][] =
          i < 2
            ? [[xi, FL[i + 1] + 1], [xi, YC[i + 1]], [xg, YC[i + 1]], [xg, YC[i]], [xr, YC[i]], [xr, FL[i]], [xr, FL[i] + 3.5]]
            : [[1009, cutTop(1009) + 1.5], [1009, YC[2]], [xr, YC[2]], [xr, FL[2]], [xr, FL[2] + 3.5]];
        const u = (k / 90 + t * 0.16 + rr() * 0.01) % 1;
        if (rr() > a) continue;
        const [x, y] = path(pts, u);
        pushDrop(x, y);
      }
      // струи из дна
      RISERS(i).forEach((x, k) => {
        const hgt = (2.2 + 1.4 * Math.abs(Math.sin(t * 7 + k * 1.7))) * a;
        const j = new THREE.Mesh(cached('jetGeo', () => new THREE.Mesh(new THREE.ConeGeometry(1.0, 1, 10, 1, true), m.jet)).geometry, m.jet);
        j.userData.cached = true;
        add(j);
        j.position.set(x, FL[i] + hgt / 2, 0.4);
        j.scale.set(1, hgt, 1);
        j.rotation.z = Math.PI;
      });
    });
    if (S.drain > 0.02) {
      for (let k = 0; k < 160; k++) {
        const i = k % 3;
        const xr = RISERS(i)[Math.floor(rr() * 11)];
        const pts: [number, number][] = [[xr, FL[i] + 2], [xr, YC[i]]];
        for (let j = i; j >= 1; j--) pts.push([GX[j] - 1.2, YC[j]], [GX[j] - 1.2, YC[j - 1]]);
        pts.push([-33, YC[0]], [-33, SEA_BED + 1], [-60, SEA_BED + 6]);
        const u = (k / 160 + t * 0.12) % 1;
        if (rr() > S.drain) continue;
        const [x, y] = path(pts, u);
        pushDrop(x, y);
      }
    }
    // крупные шевроны направления потока (видны и на общем плане)
    const chevron = cached('chev', () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0.7);
      s.lineTo(0.7, 0);
      s.lineTo(0, -0.7);
      s.lineTo(-0.35, -0.7);
      s.lineTo(0.35, 0);
      s.lineTo(-0.35, 0.7);
      s.closePath();
      return new THREE.Mesh(new THREE.ShapeGeometry(s), m.arrow);
    }).geometry;
    const chev = (x: number, y: number, dir: number, sc: number) => {
      const c = new THREE.Mesh(chevron, m.arrow);
      c.userData.cached = true;
      c.position.set(x, y, 0.5);
      c.scale.setScalar(sc);
      c.rotation.z = dir;
      add(c);
    };
    S.fill.forEach((a, i) => {
      if (a < 0.2) return;
      for (let k = 0; k < 5; k++) {
        const x = GX[i + 1] - 20 - ((k * 60 + t * 40) % 300);
        chev(x, YC[i], Math.PI, 2.2);
      }
    });
    if (S.drain > 0.2) {
      for (let k = 0; k < 16; k++) {
        const x = 1000 - ((k * 64 + t * 70) % 1030);
        const i = x > GX[2] ? 2 : x > GX[1] ? 1 : 0;
        chev(x, YC[i], Math.PI, 6 * S.drain);
      }
    }

    // --- ворота
    W0.leaves.forEach((lf, g) => {
      const o = easeInOut(S.gate[g]);
      lf.rotation.y = (o * Math.PI) / 2;
    });

    // --- корабль и мулы
    W0.ship.position.set(S.x, S.y - DRAFT, SHIP_Z);
    W0.ship.rotation.set(0, 0, 0);
    const inLock = S.x > -120 && S.x < 1040;
    const muleX = [S.x + 82, S.x - 82];
    W0.mules.forEach((u, k) => {
      const x = Math.max(-195, Math.min(1095, muleX[k]));
      const y = wallTop(x);
      const sl = Math.atan2(wallTop(x + 2) - wallTop(x - 2), 4);
      u.position.set(x, y + 0.22, -40);
      u.rotation.set(0, 0, sl);
      if (inLock) {
        // трос к борту
        const a = new THREE.Vector3(x + (k ? 3.8 : 3.8), y + 4, -40 + 1.2);
        const b = new THREE.Vector3(S.x + (k ? -70 : 78), S.y - DRAFT + 22.4, SHIP_Z - halfW(k ? -70 : 78) + 0.2);
        const len = a.distanceTo(b);
        const rp = new THREE.Mesh(cached('ropeGeo', () => new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), m.rope)).geometry, m.rope);
        rp.userData.cached = true;
        rp.position.copy(a).add(b).multiplyScalar(0.5);
        rp.scale.set(1, len, 1);
        rp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        add(rp);
      }
    });

    // --- вода, облака, дождь
    m.waterTop.map.offset.set(t * 0.01, -t * 0.015);
    W0.clouds.forEach((c, i) => (c.position.x = -2600 + i * 420 + t * 2));
    const rain = P.rain === 'pulse' ? smooth(P.rainIn ?? 0.05, (P.rainIn ?? 0.05) + 0.12, p) * (1 - smooth(P.rainOut ?? 0.5, (P.rainOut ?? 0.5) + 0.12, p)) : range(P.rain, p, P.rainDur ?? 0.4, P.rainDelay ?? 0);
    W0.storm.forEach((s) => ((s.material as THREE.SpriteMaterial).opacity = 0.9 * rain));
    m.rain.opacity = 0.55 * rain;
    (m.rain.map as THREE.Texture).offset.set(0, t * 1.4);
    W0.rain.forEach((pl) => (pl.visible = rain > 0.01));

    // --- камера (с промежуточной точкой via)
    const cs = (P.cam ?? ['overview', 'overview']).map(cam);
    const c0 = cs[0];
    const c1 = cs[cs.length - 1];
    const kc = easeInOut(clamp01((p - (P.camDelay ?? 0)) / (P.camDur ?? 1)));
    let pos: number[];
    let look: number[];
    let fov: number;
    if (P.via) {
      const v = cam(P.via);
      const va = P.viaAt ?? 0.5;
      const q0 = clamp01((p - (P.camDelay ?? 0)) / (P.camDur ?? 1));
      const [a, b, k] = q0 < va ? [c0, v, easeInOut(q0 / va)] : [v, c1, easeInOut((q0 - va) / (1 - va))];
      pos = a.pos.map((x, i) => lerp(x, b.pos[i], k));
      look = a.look.map((x, i) => lerp(x, b.look[i], k));
      fov = lerp(a.fov ?? 45, b.fov ?? 45, k);
    } else {
      pos = c0.pos.map((v, i) => lerp(v, c1.pos[i], kc));
      look = c0.look.map((v, i) => lerp(v, c1.look[i], kc));
      fov = lerp(c0.fov ?? 45, c1.fov ?? 45, kc);
    }
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== fov || pc.far !== 7000) {
      pc.fov = fov;
      pc.near = 0.5;
      pc.far = 7000;
      pc.updateProjectionMatrix();
    }
    followSky(scene, camera);
  }, [frame]);

  return <LookLights look={LOOKS[P.look ?? 'tropic']} center={[450, 0, -200]} shadowSize={900} shadowMap={1024} far={2600} />;
};

export const PanamaScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const look = LOOKS[P.look ?? 'tropic'];
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} shadows camera={{fov: 45, position: [0, 30, 150], near: 0.5, far: 7000}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <PanamaWorld P={P} life={life} />
      </ThreeCanvas>
      <LookGrade look={look} />
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
