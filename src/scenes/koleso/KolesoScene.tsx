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

const windowsTex = (base: string, band: string) => {
  const [c, g] = cv(256, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = band;
  for (let x = 6; x < 256; x += 16) g.fillRect(x, 50, 11, 22);
  return tex(c, 1 / 20, 1 / 8);
};

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

// ===== Мир «Колесо Фолкерка»: вращающийся лифт для лодок (Шотландия). Вид снаружи, вечернее солнце.
// Ось колеса — z (вдоль канала). Колесо крутится в плоскости x-y вокруг (0, AX, 0). Нижний бассейн: вода y = 0, z < 17.
// Верхний акведук: вода y = 2·AX, z > 15. Гондола «A» в θ = 0 внизу, «B» — наверху. 1 единица = 1 м.
const FAR = 9000;
const R = 12.2; // радиус подвеса гондол = 4 (шестерня) + 2·2.1 (паразитная) + 4
const AX = R; // высота оси
const UP = 2 * R; // уровень воды наверху (24,4 м)
const ARMZ = 13.6;
const GZ = -14.7; // плоскость шестерён (со стороны бассейна)
const SUN = new THREE.Vector3(-0.55, 0.3, -0.78).normalize();
const SKY = {top: '#3567b0', mid: '#8fb8e0', horizon: '#ffd7a8', glow: '#fff0d2', glowSize: 6};
const LOOK = {fog: '#d9d2c4', fogNear: 500, fogFar: 4200, grade: {shadow: '#1d3456', shadowAmt: 0.03, high: '#ffe6c4', highAmt: 0.05, vignette: 0.3, grain: 0.035}};

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  hook0: {pos: [-20, 2.5, -34], look: [0, 12, 0], fov: 50},
  hook1: {pos: [-26, 4, -40], look: [0, 12.5, 0], fov: 50},
  kettle: {pos: [-34, 9, -50], look: [0, 12.5, 2]},
  wide: {pos: [-75, 34, -105], look: [0, 13, 25]},
  canals: {pos: [62, 40, -70], look: [0, 12, 40]},
  locks: {pos: [70, 16, -48], look: [0, 12, 8]},
  turn: {pos: [-38, 9, -56], look: [0, 12.5, 0]},
  gond: {pos: [-13, UP + 6.5, -24], look: [0, UP - 0.5, -3]},
  hub: {pos: [-12, 15, -30], look: [0, 12.2, -12]},
  arch0: {pos: [-15, 6.5, -40], look: [0, 0, -10]},
  arch1: {pos: [-11, 8.5, -30], look: [0, 0, -4]},
  weigh: {pos: [-42, 14, -62], look: [0, 12.2, 0]},
  gears: {pos: [-7, 15, -31], look: [0, 12.2, -14.7]},
  counter: {pos: [-30, 13, -50], look: [0, 12.2, -2]},
  question: {pos: [-17, 7, -42], look: [0, 5, 0]},
  final: {pos: [-95, 30, -125], look: [0, 14, 10]},
  cover: {pos: [-24, 3.5, -38], look: [0, 12.5, 0], fov: 50},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.hook0 : c);

// угол колеса от общего времени ролика: ключи [t, θ°, ease], ease: 'lin' | 'io' | 'out' | 'in'
const angleAt = (keys: [number, number, string?][] | undefined, t: number) => {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [ta, a] = keys[i];
    const [tb, b, e] = keys[i + 1];
    if (t <= tb) {
      const k = (t - ta) / Math.max(1e-6, tb - ta);
      const kk = e === 'lin' ? k : e === 'out' ? 1 - (1 - k) * (1 - k) : e === 'in' ? k * k : k * k * (3 - 2 * k);
      return a + (b - a) * kk;
    }
  }
  return keys[keys.length - 1][1];
};

// ---------- рельеф ----------
const hn = (x: number, z: number) => Math.sin(x * 0.013 + z * 0.009) * 2.2 + Math.sin(x * 0.031 - z * 0.021 + 1.3) * 0.9 + Math.sin(x * 0.0051 + z * 0.0043) * 4;
const BASIN_X = 16;
const inBasin = (x: number, z: number) => Math.abs(x) < BASIN_X + 0.8 && z < 17;
const ground = (x: number, z: number) => {
  if (inBasin(x, z)) return Math.abs(x) < 10.5 && z > -19 ? -7 : -4.5;
  const ax = Math.abs(x);
  const flat = smooth(30, 120, ax) + smooth(60, 160, z) * 0.0;
  let h = 1.0 + hn(x, z) * 0.25 * flat + 6 * flat * (0.5 + 0.5 * Math.sin(x * 0.006 + z * 0.004));
  // холм, на который выходит акведук
  const hill = smooth(45, 260, z);
  h += 23 * hill * (1 - smooth(60, 260, ax) * 0.4);
  // под акведуком земля ниже лотка
  if (ax < 8 && z > 15 && z < 230) h = Math.min(h, UP - 4.5 - 0.2);
  // берег бассейна — ровная бровка
  if (ax < BASIN_X + 6 && z < 20) h = Math.min(h, 1.2 + Math.max(0, ax - BASIN_X - 2) * 0.4);
  return h;
};

// ---------- геометрия ----------
const gearGeo = (r: number, teeth: number, depth: number, hole = 0) => {
  const s = new THREE.Shape();
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ph = i % 4;
    const rr = ph === 0 || ph === 1 ? r + 0.28 : r - 0.12;
    const p = new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr);
    if (i === 0) s.moveTo(p.x, p.y);
    else s.lineTo(p.x, p.y);
  }
  if (hole > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, hole, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: false, curveSegments: 4});
  g.translate(0, 0, -depth / 2);
  return g;
};
const ringGeo = (ro: number, ri: number, depth: number) => {
  const s = new THREE.Shape();
  s.absarc(0, 0, ro, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, ri, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 40});
  g.translate(0, 0, -depth / 2);
  return g;
};
// лопасть «кельтского топора»: изогнутая полоса от ступицы к кольцу (верхняя; нижняя — поворот на 180°)
const bladeGeo = (depth: number) => {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const s = i / 24;
    const y = 1.5 + s * (R - 4.6);
    const cx = 4.8 * Math.sin(Math.PI * s) * (1 - 0.3 * s);
    const w = lerp(1.9, 1.5, Math.sin(Math.PI * s)) + s * 0.6;
    left.push(new THREE.Vector2(cx - w, y));
    right.push(new THREE.Vector2(cx + w, y));
  }
  const sh = new THREE.Shape([...left, ...right.reverse()]);
  const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 4});
  g.translate(0, 0, -depth / 2);
  return g;
};
// корыто гондолы: U-сечение (x-y), вытянуто по z
const tubShape = (shrink = 0) => {
  const ax = 3.4 - shrink;
  const ay = 3.6 - shrink;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI + (i / 32) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * ax, Math.sin(a) * ay));
  }
  return pts;
};
const tubGeo = () => {
  const o = tubShape(0);
  const n = tubShape(0.32);
  const s = new THREE.Shape([new THREE.Vector2(-3.4, 0.8), ...o, new THREE.Vector2(3.4, 0.8), new THREE.Vector2(3.08, 0.8), ...n.slice().reverse(), new THREE.Vector2(-3.08, 0.8)]);
  const g = new THREE.ExtrudeGeometry(s, {depth: 26.8, bevelEnabled: false, curveSegments: 4});
  g.translate(0, 0, -13.4);
  return g;
};
const tubEnd = (z: number) => {
  // торцевой щит до уровня −0,6 (вода видна через край — ворота открыты под воду)
  const o = tubShape(0).filter((p) => p.y <= -0.6);
  const s = new THREE.Shape([new THREE.Vector2(o[0].x, -0.6), ...o, new THREE.Vector2(o[o.length - 1].x, -0.6)]);
  const g = new THREE.ExtrudeGeometry(s, {depth: 0.3, bevelEnabled: false});
  g.translate(0, 0, z - 0.15);
  return g;
};
const narrowboat = (m: Record<string, any>, hullCol: THREE.Material, len = 18, beam = 2.1) => {
  const g = new THREE.Group();
  const hull = hullGeo(len, beam, 1.0, 0.16);
  hull.translate(0, -0.55, 0);
  g.add(new THREE.Mesh(hull, hullCol));
  const band = hullGeo(len - 0.2, beam - 0.05, 0.22, 0.16);
  band.translate(0, 0.42, 0);
  g.add(new THREE.Mesh(band, m.boatRed));
  g.add(new THREE.Mesh(box(-len / 2 + 2.2, len / 2 - 3.2, 0.64, 1.75, -beam / 2 + 0.12, beam / 2 - 0.12), m.boatCabin));
  g.add(new THREE.Mesh(box(-len / 2 + 2.0, len / 2 - 3.0, 1.75, 1.9, -beam / 2 + 0.05, beam / 2 - 0.05), m.boatRoof));
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), m.dark);
  chim.position.set(len / 2 - 4.5, 2.2, 0.4);
  g.add(chim);
  g.rotation.y = -Math.PI / 2; // нос к +z
  return g;
};
const bargeBoat = (m: Record<string, any>) => {
  const g = new THREE.Group();
  const hull = hullGeo(21.5, 5.2, 1.9, 0.18);
  hull.translate(0, -1.15, 0);
  g.add(new THREE.Mesh(hull, m.bargeHull));
  const deck = hullGeo(21.2, 5.0, 0.25, 0.18);
  deck.translate(0, 0.75, 0);
  g.add(new THREE.Mesh(deck, m.bargeDeck));
  g.add(new THREE.Mesh(box(-9.5, -5.5, 1.0, 3.6, -1.9, 1.9), m.bargeHouse));
  g.add(new THREE.Mesh(box(-9.7, -5.3, 3.6, 3.8, -2.1, 2.1), m.dark));
  g.add(new THREE.Mesh(box(-3, 8, 1.0, 2.0, -2.2, 2.2), m.bargeCargo));
  g.rotation.y = -Math.PI / 2;
  return g;
};
const softArrow = () => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(-1.6, 1.4);
  s.lineTo(-1.6, 0.55);
  s.lineTo(-4.2, 0.55);
  s.lineTo(-4.2, -0.55);
  s.lineTo(-1.6, -0.55);
  s.lineTo(-1.6, -1.4);
  s.closePath();
  return new THREE.ShapeGeometry(s);
};
const arcArrow = (radius: number, a0: number, a1: number, tube: number) => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = lerp(a0, a1, i / 40);
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  const body = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, tube, 8, false);
  const head = new THREE.ConeGeometry(tube * 3, tube * 7, 12);
  const end = pts[pts.length - 1];
  const dir = end.clone().sub(pts[pts.length - 2]).normalize();
  head.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  head.translate(end.x + dir.x * tube * 3, end.y + dir.y * tube * 3, 0);
  return mergeGeometries([body.toNonIndexed(), head.toNonIndexed()]);
};

const useWorld = () =>
  useMemo(() => {
    const r = rng(17);
    const steelCol = '#cfd4d8';
    const m: Record<string, any> = {
      steel: new THREE.MeshStandardMaterial({color: steelCol, roughness: 0.32, metalness: 0.55, envMapIntensity: 1.0}),
      steelDark: new THREE.MeshStandardMaterial({color: '#8e969c', roughness: 0.4, metalness: 0.6}),
      gear: new THREE.MeshStandardMaterial({color: '#6f777d', roughness: 0.35, metalness: 0.75, emissive: '#ffb347', emissiveIntensity: 0}),
      tub: new THREE.MeshStandardMaterial({color: '#e6e8ea', roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide}),
      conc: new THREE.MeshStandardMaterial({map: concreteTex('#c9c3b8', 3, 6), roughness: 0.9}),
      concDark: new THREE.MeshStandardMaterial({map: concreteTex('#a9a397', 5, 6), roughness: 0.95}),
      water: new THREE.MeshPhysicalMaterial({color: '#2f4f4a', roughness: 0.12, metalness: 0, normalMap: seaNormal(), normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 0.9}),
      waterG: null as any,
      ground: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1}),
      trees: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.95, flatShading: true}),
      dark: new THREE.MeshStandardMaterial({color: '#2a2d30', roughness: 0.6}),
      boatGreen: new THREE.MeshStandardMaterial({color: '#1e4a36', roughness: 0.45}),
      boatBlue: new THREE.MeshStandardMaterial({color: '#1d3a5a', roughness: 0.45}),
      boatRed: new THREE.MeshStandardMaterial({color: '#9a2b1f', roughness: 0.5}),
      boatCabin: new THREE.MeshStandardMaterial({map: windowsTex('#e8dcc0', '#2a2f33'), roughness: 0.5}),
      boatRoof: new THREE.MeshStandardMaterial({color: '#6b5a44', roughness: 0.8}),
      bargeHull: new THREE.MeshStandardMaterial({color: '#20262c', roughness: 0.5}),
      bargeDeck: new THREE.MeshStandardMaterial({color: '#8a2c22', roughness: 0.6}),
      bargeHouse: new THREE.MeshStandardMaterial({map: windowsTex('#efece4', '#22303a'), roughness: 0.5}),
      bargeCargo: new THREE.MeshStandardMaterial({color: '#3d5a4a', roughness: 0.7}),
      arrow: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false}),
      arc: new THREE.MeshBasicMaterial({color: '#FFD54A', transparent: true, opacity: 0, depthWrite: false, fog: false}),
    };
    (m.water.normalMap as THREE.Texture).repeat.set(40, 40);
    m.waterG = (m.water as THREE.MeshPhysicalMaterial).clone();
    const nG = (m.water.normalMap as THREE.Texture).clone();
    nG.needsUpdate = true;
    nG.repeat.set(3, 12);
    m.waterG.normalMap = nG;

    const world = new THREE.Group();
    // --- рельеф
    {
      const xs: number[] = [];
      for (let x = -1800; x <= 1800; x += Math.abs(x) < 60 ? 2 : Math.abs(x) < 300 ? 8 : 40) xs.push(x);
      const zs: number[] = [];
      for (let z = -2000; z <= 1600; z += z > -80 && z < 60 ? 2 : Math.abs(z) < 400 ? 8 : 40) zs.push(z);
      const pos = new Float32Array(xs.length * zs.length * 3);
      const colr = new Float32Array(xs.length * zs.length * 3);
      const c = new THREE.Color();
      const g1 = new THREE.Color('#5f7d3a');
      const g2 = new THREE.Color('#87964f');
      const g3 = new THREE.Color('#4a6a33');
      const mud = new THREE.Color('#5b5040');
      zs.forEach((z, j) =>
        xs.forEach((x, i) => {
          const h = ground(x, z);
          const k = j * xs.length + i;
          pos.set([x, h, z], k * 3);
          const n = 0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.03) * Math.sin(x * 0.011 - z * 0.017);
          c.copy(g1).lerp(g2, n * 0.7).lerp(g3, smooth(2, 20, h) * 0.4);
          if (h < 0.5) c.copy(mud);
          colr.set([c.r, c.g, c.b], k * 3);
        }),
      );
      const idx: number[] = [];
      for (let j = 0; j < zs.length - 1; j++)
        for (let i = 0; i < xs.length - 1; i++) {
          const a = j * xs.length + i;
          const b = a + xs.length;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      world.add(new THREE.Mesh(g, m.ground));
    }
    // --- бассейн: бетонные стенки и вода
    world.add(new THREE.Mesh(mergeGeometries([box(-BASIN_X - 0.8, -BASIN_X, -4.6, 1.4, -2000, 17), box(BASIN_X, BASIN_X + 0.8, -4.6, 1.4, -2000, 17), box(-BASIN_X - 0.8, BASIN_X + 0.8, -7.2, 1.4, 17, 18)]), m.conc));
    const basin = new THREE.Mesh(new THREE.PlaneGeometry(2 * BASIN_X, 2017), m.water);
    basin.rotation.x = -Math.PI / 2;
    basin.position.set(0, 0, 17 - 2017 / 2);
    basin.renderOrder = 2;
    world.add(basin);
    // --- опора оси и акведук
    world.add(new THREE.Mesh(box(-5.5, 5.5, -7, UP - 4.4, 16.2, 23), m.conc));
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 31.5, 24), m.steelDark);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, AX, 1.2);
    world.add(axle);
    const AQ0 = 14.4;
    const AQ1 = 1600;
    world.add(new THREE.Mesh(mergeGeometries([box(-4.3, 4.3, UP - 4.4, UP - 3.4, AQ0, AQ1), box(-4.3, -3.6, UP - 3.4, UP + 0.9, AQ0, AQ1), box(3.6, 4.3, UP - 3.4, UP + 0.9, AQ0, AQ1)]), m.conc));
    const aqW = new THREE.Mesh(new THREE.PlaneGeometry(7.2, AQ1 - AQ0), m.waterG);
    aqW.rotation.x = -Math.PI / 2;
    aqW.position.set(0, UP, (AQ0 + AQ1) / 2);
    aqW.renderOrder = 2;
    world.add(aqW);
    // колонны акведука
    const cols: THREE.BufferGeometry[] = [];
    for (let z = 34; z < 260; z += 18) {
      const gy = ground(0, z);
      const hgt = UP - 4.4 - gy + 0.5;
      if (hgt < 1) continue;
      const c = new THREE.CylinderGeometry(1.5, 1.7, hgt, 20);
      c.translate(0, gy - 0.5 + hgt / 2, z);
      cols.push(c);
    }
    world.add(new THREE.Mesh(mergeGeometries(cols), m.concDark));
    // стальная рама-затвор на конце акведука
    world.add(new THREE.Mesh(mergeGeometries([box(-4.6, -3.9, UP - 4.6, UP + 3.2, 14.4, 15.2), box(3.9, 4.6, UP - 4.6, UP + 3.2, 14.4, 15.2), box(-4.6, 4.6, UP + 2.5, UP + 3.2, 14.4, 15.2)]), m.steelDark));

    // --- колесо (крутится): два «топора», ступица, паразитные шестерни
    const wheel = new THREE.Group();
    wheel.position.set(0, AX, 0);
    const armParts: THREE.BufferGeometry[] = [];
    for (const z of [-ARMZ, ARMZ]) {
      const hub = new THREE.CylinderGeometry(3.3, 3.3, 1.2, 32);
      hub.rotateX(Math.PI / 2);
      hub.translate(0, 0, z);
      armParts.push(hub.toNonIndexed());
      for (const s of [1, -1]) {
        const ring = ringGeo(5.0, 4.15, 1.0);
        ring.translate(0, s * R, z);
        armParts.push(ring.toNonIndexed());
        const bl = bladeGeo(1.0);
        if (s < 0) bl.rotateZ(Math.PI);
        bl.translate(0, 0, z);
        armParts.push(bl.toNonIndexed());
      }
    }
    wheel.add(new THREE.Mesh(mergeGeometries(armParts.map((g) => {
      g.deleteAttribute('uv');
      return g;
    })), m.steel));
    const idlers = [1, -1].map((s) => {
      const g = new THREE.Mesh(gearGeo(2.0, 14, 0.7, 0.5), m.gear);
      g.position.set(0, s * 6.1, GZ); // в плоскости шестерён
      wheel.add(g);
      return g;
    });
    // кронштейны паразитных шестерён к лопасти
    world.add(wheel);
    const sun = new THREE.Mesh(gearGeo(3.9, 26, 0.7, 1.8), m.gear);
    sun.position.set(0, AX, GZ);
    world.add(sun);

    // --- гондолы (всегда вертикально)
    const gondola = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(tubGeo(), m.tub));
      g.add(new THREE.Mesh(mergeGeometries([tubEnd(-13.4), tubEnd(13.4)]), m.tub));
      // кромка и рёбра
      g.add(new THREE.Mesh(mergeGeometries([box(-3.5, -3.0, 0.8, 1.05, -13.4, 13.4), box(3.0, 3.5, 0.8, 1.05, -13.4, 13.4)]), m.steelDark));
      const w = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 26.7), m.waterG);
      w.rotation.x = -Math.PI / 2;
      w.position.y = 0.06;
      w.renderOrder = 3;
      g.add(w);
      // шестерня гондолы (8 м) и цапфы в кольцах рук
      const gg = new THREE.Mesh(gearGeo(3.9, 26, 0.7, 1.4), m.gear);
      gg.position.z = GZ;
      g.add(gg);
      for (const z of [-ARMZ, ARMZ]) {
        // подшипник гондолы в кольце руки (кольцо, торец гондолы открыт)
        const tr = new THREE.Mesh(ringGeo(4.0, 3.45, 1.3), m.steelDark);
        tr.position.z = z;
        g.add(tr);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 16), m.steelDark);
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = GZ + 0.7;
      g.add(shaft);
      world.add(g);
      return g;
    };
    const gA = gondola();
    const gB = gondola();

    // --- лодки
    const boat1 = narrowboat(m, m.boatGreen);
    const boat2 = narrowboat(m, m.boatBlue, 17);
    const barge = bargeBoat(m);
    world.add(boat1, boat2, barge);

    // --- деревья (группы на холмах), одна геометрия
    {
      const parts: THREE.BufferGeometry[] = [];
      const cc = [new THREE.Color('#2f4a24'), new THREE.Color('#3d5a2a'), new THREE.Color('#4a6630')];
      let n = 0;
      for (let i = 0; i < 2000 && n < 260; i++) {
        const x = (r() - 0.5) * 900;
        const z = -200 + r() * 900;
        if (Math.abs(x) < BASIN_X + 14 && z < 40) continue;
        if (Math.abs(x) < 16 && z > 0) continue;
        if (Math.abs(x) < 45 && Math.abs(z) < 45) continue;
        const clump = 0.5 + 0.5 * Math.sin(x * 0.02) * Math.sin(z * 0.017 + 1);
        if (r() > clump) continue;
        const sz = 3 + r() * 3.5;
        const t = new THREE.IcosahedronGeometry(sz, 1);
        const p = t.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const f = 1 + (r() - 0.5) * 0.25;
          p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.85, p.getZ(k) * f);
        }
        t.translate(x, ground(x, z) + sz * 0.9 + 1.5, z);
        const col = cc[n % 3];
        const ca = new Float32Array(p.count * 3);
        for (let k = 0; k < p.count; k++) ca.set([col.r, col.g, col.b], k * 3);
        t.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        t.deleteAttribute('uv');
        parts.push(t.toNonIndexed());
        const tr = new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6);
        tr.translate(x, ground(x, z) + 1.2, z);
        const ct = new Float32Array(tr.attributes.position.count * 3);
        for (let k = 0; k < tr.attributes.position.count; k++) ct.set([0.3, 0.24, 0.18], k * 3);
        tr.setAttribute('color', new THREE.BufferAttribute(ct, 3));
        tr.deleteAttribute('uv');
        parts.push(tr.toNonIndexed());
        n++;
      }
      parts.forEach((g) => g.deleteAttribute('normal'));
      const tg = mergeGeometries(parts);
      tg.computeVertexNormals();
      world.add(new THREE.Mesh(tg, m.trees));
    }
    // облака
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(300 + (i % 12)), color: '#fff3e2', transparent: true, opacity: 0.8, depthWrite: false}));
      const sc = 500 + r() * 900;
      s.scale.set(sc, sc * (0.32 + r() * 0.1), 1);
      const a = r() * Math.PI * 2;
      const d = 2600 + r() * 1800;
      s.position.set(Math.cos(a) * d, 300 + r() * 600, Math.sin(a) * d);
      world.add(s);
    }
    // стрелки: вода уходит в канал; дуги вращения
    const flowArrows = [0, 1, 2].map(() => {
      const a = new THREE.Mesh(softArrow(), m.arrow);
      a.rotation.x = -Math.PI / 2;
      a.rotation.z = Math.PI / 2; // остриём к −z
      a.renderOrder = 9;
      world.add(a);
      return a;
    });
    const arcWheel = new THREE.Mesh(arcArrow(18.5, Math.PI * 0.95, Math.PI * 0.55, 0.35), m.arc);
    arcWheel.position.set(0, AX, -17);
    arcWheel.renderOrder = 10;
    world.add(arcWheel);
    const arcG = new THREE.Mesh(arcArrow(6.2, Math.PI * 0.6, Math.PI * 1.0, 0.25), m.arc);
    arcG.renderOrder = 10;
    world.add(arcG);
    return {m, world, wheel, idlers, gA, gB, boat1, boat2, barge, flowArrows, arcWheel, arcG};
  }, []);

const useSkyLights = () =>
  useMemo(() => {
    const sky = makeSky(SKY, SUN);
    sky.renderOrder = -10;
    const sunS = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex('rgba(255,250,235,1)', 'rgba(255,214,150,0.45)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false}));
    sunS.scale.set(300, 300, 1);
    sunS.renderOrder = -9;
    const sun = new THREE.DirectionalLight('#ffdcb0', 2.8);
    sun.position.copy(SUN).multiplyScalar(300);
    const fill = new THREE.DirectionalLight('#a9c2ea', 0.6);
    fill.position.set(0.6, 0.5, 0.6).multiplyScalar(300);
    const hemi = new THREE.HemisphereLight('#c3d6f0', '#5a6648', 0.8);
    return {sky, sunS, sun, fill, hemi};
  }, []);

const KolesoWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const W0 = useWorld();
  const SL = useSkyLights();
  const {m} = W0;
  const p = clamp01(frame / Math.max(1, dur));
  const t = t0 + frame / fps;

  useLayoutEffect(() => {
    const all = [W0.world, SL.sky, SL.sunS, SL.sun, SL.fill, SL.hemi];
    scene.add(...all);
    scene.fog = new THREE.Fog(LOOK.fog, LOOK.fogNear, LOOK.fogFar);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.shadowMap.enabled = false;
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const sk = makeSky(SKY, SUN);
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
    const cs = (P.cam ?? ['hook0', 'hook0']).map((c: string | Cam) => cam(c));
    const kc = easeInOut(clamp01(p));
    const cp = camBetween(cs[0], cs[cs.length - 1], kc);
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
    SL.sunS.position.copy(camera.position).addScaledVector(SUN, 1200);

    // --- колесо: угол от общего времени
    const th = (angleAt(P.spin, t) * Math.PI) / 180;
    W0.wheel.rotation.z = -th; // по часовой, если смотреть со стороны бассейна (−z)
    const posG = (a: number) => new THREE.Vector3(R * Math.sin(a), AX - R * Math.cos(a), 0);
    const pa = posG(th);
    const pb = posG(th + Math.PI);
    W0.gA.position.copy(pa);
    W0.gB.position.copy(pb);
    // паразитные шестерни катятся по неподвижной центральной: абсолютный поворот = θ·(Rs+Rp)/Rp
    W0.idlers.forEach((g) => (g.rotation.z = -th * (3.9 / 2.0)));

    // --- лодки: [где, z0, z1] — 'A' | 'B' (внутри гондолы), 'w' (в бассейне), 'aq' (в акведуке)
    const place = (o: THREE.Object3D, spec: any, draft: number) => {
      if (!spec) {
        o.visible = false;
        return;
      }
      o.visible = true;
      const [where, z0, z1] = spec;
      const z = lerp(z0, z1 ?? z0, easeInOut(clamp01(p)));
      const bob = Math.sin(t * 1.3 + z0) * 0.04;
      if (where === 'A' || where === 'B') {
        const g = where === 'A' ? pa : pb;
        o.position.set(g.x, g.y + draft + bob, z);
      } else if (where === 'aq') o.position.set(0, UP + draft + bob, z);
      else o.position.set(0, draft + bob, z);
    };
    place(W0.boat1, P.b1, 0.0);
    place(W0.boat2, P.b2, 0.0);
    place(W0.barge, P.barge, 0.15);

    // --- стрелки: вода уходит обратно в канал
    const fl = range(P.flow ?? 0, p);
    m.arrow.opacity = 0.85 * fl;
    W0.flowArrows.forEach((a, i) => {
      a.visible = fl > 0.01;
      const ph = (t * 0.45 + i / 3) % 1;
      a.position.set((i - 1) * 6, 0.25, -16 - ph * 10);
      a.scale.setScalar(Math.sin(ph * Math.PI) * 1.1);
    });
    // дуги: колесо в одну сторону, гондола — в другую
    const ar = range(P.arcs ?? 0, p);
    m.arc.opacity = 0.9 * ar;
    W0.arcWheel.visible = W0.arcG.visible = ar > 0.01;
    W0.arcG.position.set(pa.x, pa.y, -17);
    // подсветка шестерён
    m.gear.emissiveIntensity = 0.35 * range(P.hlGears ?? 0, p);
    // рябь
    (m.water.normalMap as THREE.Texture).offset.set(t * 0.004, t * 0.002);
    (m.waterG.normalMap as THREE.Texture).offset.set(t * 0.01, t * 0.02);
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

// чайник-иконка (обычный кухонный, без брендов)
const Kettle: React.FC<{s: number}> = ({s}) => (
  <svg width={96} height={96} viewBox="0 0 96 96" style={{transform: `scale(${s})`, opacity: Math.min(1, s * 1.4)}}>
    <path d="M20 78 L76 78 L70 40 Q48 30 26 40 Z" fill="#f2efe8" stroke="#2a1f00" strokeWidth="5" strokeLinejoin="round" />
    <path d="M70 46 Q86 48 84 64 Q82 72 74 72" fill="none" stroke="#2a1f00" strokeWidth="5" strokeLinecap="round" />
    <path d="M24 50 L8 36" stroke="#2a1f00" strokeWidth="7" strokeLinecap="round" />
    <rect x="38" y="26" width="20" height="8" rx="4" fill="#FFD54A" stroke="#2a1f00" strokeWidth="4" />
    <path d="M8 26 Q4 18 10 12" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
  </svg>
);

export const KolesoScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = lifeIn ?? Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const bOut = 1 - clamp01((frame - (P.bannerEnd ?? 1) * life + 8) / 8);
  const kN = P.kettles ? P.kettles : 0;
  const kOut = 1 - clamp01((frame - life + 8) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [-20, 3, -34], near: 0.5, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <KolesoWorld P={P} dur={life} t0={scene.start ?? 0} />
        <Post opt={P.post} />
      </ThreeCanvas>
      <Grade />
      {kN ? (
        <div style={{position: 'absolute', left: 40, right: 40, top: 470, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, opacity: kOut}}>
          {Array.from({length: kN}, (_, i) => {
            const at = (P.kettleAt ?? 0.15) * life + i * (P.kettleStep ?? 4);
            const s = clamp01((frame - at) / 6);
            return <Kettle key={i} s={s < 1 ? s * (1 + 0.25 * Math.sin(s * Math.PI)) : 1} />;
          })}
        </div>
      ) : null}
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
