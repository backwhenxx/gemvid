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

// ===== Мир «Самолёт над облаками»: лайнер на 11 км в золотой час, фюзеляж в разрезе (осталась дальняя половина, z ≤ 0).
// Самолёт стоит в начале координат носом в +x, облака текут мимо. 1 единица = 1 м.
// Свет: низкое солнце за самолётом (контровой, тёплые кромки облаков), тени холодные; в салоне тёплые лампы;
// единственный холодный акцент — поток воздуха и синяя жидкость в баке.
const FAR = 20000;
const XN = 18;
const XT = -19.6;
const WALL = 0.12;
const FLOOR = -0.5;
const TX = -9.3; // унитаз
const R = (x: number) => {
  if (x > 13) return 2 * Math.pow(Math.max(0, 1 - Math.pow((x - 13) / 5, 2)), 0.55);
  if (x >= -8) return 2;
  const s = Math.min(1, (-8 - x) / 11.6);
  return 2 - 1.65 * Math.pow(s, 1.4);
};
const TANK = {cx: -11.0, cy: -1.1, r: 0.42, hl: 0.18};
const V_CLOUD = 140;

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  bowl: {pos: [-8.55, 0.05, 2.3], look: [-9.35, -0.32, 0]},
  bowl2: {pos: [-8.75, -0.05, 1.9], look: [-9.4, -0.38, 0]},
  lav: {pos: [-8.2, 0.1, 4.6], look: [-10.0, -0.6, 0]},
  lavB: {pos: [-7.7, 0.5, 6.6], look: [-10.1, -0.5, 0]},
  diag: {pos: [8, 13, 23], look: [-4, -0.3, 0]},
  diag2: {pos: [5, 10.5, 19], look: [-4.5, -0.3, 0]},
  mid: {pos: [-3, 3, 13], look: [-6.5, -0.2, 0]},
  under: {pos: [-9.95, -0.75, 3.0], look: [-10.5, -1.0, 0]},
  tank: {pos: [-10.95, -0.8, 2.7], look: [-11.5, -1.05, 0]},
  hatch: {pos: [-9.8, -2.4, 4.2], look: [-11.2, -1.4, 0]},
  tail: {pos: [-26, 5, 9], look: [-12, 0, 0]},
  ext: {pos: [-36, 7, -27], look: [-2, 0.3, 0]},
  cover: {pos: [-7.4, 0.5, 5.6], look: [-10.0, -0.6, 0]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.diag : c);

const SUN = new THREE.Vector3(-0.3, 0.085, -0.95).normalize();
const SKY = {top: '#17408f', mid: '#5f97de', horizon: '#ffc079', glow: '#fff2d2', glowSize: 6};
const LOOK = {
  fog: '#f0cfa6',
  fogNear: 2600,
  fogFar: 17000,
  grade: {shadow: '#22305e', shadowAmt: 0.03, high: '#ffe3bd', highAmt: 0.06, vignette: 0.36, grain: 0.045},
};

// ---------- текстуры ----------
const steelTex = (base: string, seed: number) => {
  const [c, g] = cv(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(0, r() * 256, 256, 1 + r() * 2);
  }
  return tex(c);
};
const carpetTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#3b4a66';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 2600, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.06)', 'rgba(120,150,200,0.1)'], 5, [0.6, 1.8]);
  return tex(c, 0.5, 0.5);
};
// облачное поле сверху: мягкие белые клубы на тёплой основе, бесшовно
const deckTex = () => {
  const S = 512;
  const [c, g] = cv(S, S);
  const im = g.createImageData(S, S);
  const r = rng(77);
  const octs = [4, 8, 16, 32, 64].map((n) => {
    const a = new Float32Array(n * n);
    for (let i = 0; i < a.length; i++) a[i] = r();
    return {n, a};
  });
  const sample = (o: {n: number; a: Float32Array}, x: number, y: number) => {
    const fx = (x * o.n) / S;
    const fy = (y * o.n) / S;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const A = (i: number, j: number) => o.a[(((j % o.n) + o.n) % o.n) * o.n + (((i % o.n) + o.n) % o.n)];
    return lerp(lerp(A(x0, y0), A(x0 + 1, y0), sx), lerp(A(x0, y0 + 1), A(x0 + 1, y0 + 1), sx), sy);
  };
  const Hn = (x: number, y: number) => {
    let v = 0;
    let w = 1;
    let tot = 0;
    octs.forEach((o) => {
      v += sample(o, x, y) * w;
      tot += w;
      w *= 0.55;
    });
    return v / tot;
  };
  const sh = new THREE.Color('#8687b4');
  const mid = new THREE.Color('#e6c9b0');
  const li = new THREE.Color('#fff4e0');
  const cc = new THREE.Color();
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const h = Hn(x, y);
      const d = smooth(0.38, 0.62, h);
      const lit = clamp01(0.5 + (h - Hn(x, y + 4)) * 16);
      cc.copy(sh).lerp(mid, d).lerp(li, d * lit);
      const i = (y * S + x) * 4;
      im.data[i] = cc.r * 255;
      im.data[i + 1] = cc.g * 255;
      im.data[i + 2] = cc.b * 255;
      im.data[i + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  const t = tex(c, 9, 9);
  t.colorSpace = THREE.NoColorSpace;
  return t;
};
// шпангоуты под полом
const ribTex = () => {
  const [c, g] = cv(16, 64);
  g.fillStyle = '#3a4252';
  g.fillRect(0, 0, 16, 64);
  g.fillStyle = '#566074';
  g.fillRect(0, 0, 16, 7);
  g.fillStyle = '#2a303c';
  g.fillRect(0, 7, 16, 3);
  return tex(c, 1, 54);
};
const fanTex = () => {
  const [c, g] = cv(128, 128);
  g.fillStyle = '#20242a';
  g.beginPath();
  g.arc(64, 64, 62, 0, 6.3);
  g.fill();
  g.fillStyle = '#c9d2dc';
  for (let k = 0; k < 6; k++) {
    g.save();
    g.translate(64, 64);
    g.rotate((k / 6) * Math.PI * 2);
    g.beginPath();
    g.moveTo(6, -4);
    g.quadraticCurveTo(40, -22, 58, -6);
    g.lineTo(58, 6);
    g.quadraticCurveTo(36, 2, 6, 6);
    g.fill();
    g.restore();
  }
  g.fillStyle = '#8b96a3';
  g.beginPath();
  g.arc(64, 64, 11, 0, 6.3);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const trailTex = () => {
  const [c, g] = cv(512, 32);
  const gr = g.createLinearGradient(0, 0, 512, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.08, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 32);
  const gv = g.createLinearGradient(0, 0, 0, 32);
  gv.addColorStop(0, 'rgba(0,0,0,1)');
  gv.addColorStop(0.5, 'rgba(0,0,0,0)');
  gv.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = gv;
  g.fillRect(0, 0, 512, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// ---------- геометрия ----------
const toX = <T extends THREE.BufferGeometry>(g: T) => {
  g.rotateZ(-Math.PI / 2);
  return g;
};
const rrect = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, h / 2 - r);
  s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w / 2 + r, h / 2);
  s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -h / 2 + r);
  s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  return new THREE.ShapeGeometry(s, 6);
};
// «стадион» (сечение бака): точки по контуру
const stadium = (cx: number, cy: number, r: number, hl: number, n = 20) => {
  const p: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    p.push([cx + hl + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / n;
    p.push([cx - hl + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
};
// стрелка-шеврон, смотрит в +x, размер 1
const chevGeo = () => {
  const s = new THREE.Shape([new THREE.Vector2(-0.55, 0.5), new THREE.Vector2(0.3, 0), new THREE.Vector2(-0.55, -0.5), new THREE.Vector2(-0.2, 0)]);
  return new THREE.ShapeGeometry(s);
};
type Path = {pts: [number, number][]; cum: number[]; len: number};
const mkPath = (pts: [number, number][]): Path => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return {pts, cum, len: cum[cum.length - 1]};
};
const at = (P: Path, u: number) => {
  const d = clamp01(u) * P.len;
  let i = 1;
  while (i < P.pts.length - 1 && P.cum[i] < d) i++;
  const k = (d - P.cum[i - 1]) / Math.max(1e-6, P.cum[i] - P.cum[i - 1]);
  const a = P.pts[i - 1];
  const b = P.pts[i];
  return {x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), ang: Math.atan2(b[1] - a[1], b[0] - a[0])};
};
// пути потока (в плоскости разреза)
const P_MAIN = mkPath([[TX, 0.35], [TX, -0.1], [TX, -0.62], [TX, -0.82], [TX - 0.07, -0.9], [TX - 0.22, -0.93], [-9.9, -0.93], [-10.45, -0.93], [-10.75, -1.0]]);
const P_FEED = [
  mkPath([[TX + 1.0, 0.95], [TX + 0.55, 0.6], [TX + 0.12, 0.2], [TX, -0.02]]),
  mkPath([[TX - 0.75, 1.05], [TX - 0.45, 0.65], [TX - 0.1, 0.22], [TX, -0.02]]),
  mkPath([[TX + 0.45, 1.3], [TX + 0.25, 0.8], [TX + 0.05, 0.3], [TX, -0.02]]),
];
const P_VENT = mkPath([[-11.42, -0.74], [-11.75, -0.73], [-11.95, -0.78], [-12.15, -0.95], [-12.38, -1.35], [-12.45, -1.72], [-12.7, -2.0], [-14.2, -2.25], [-17, -2.4]]);
const curveOf = (pts: [number, number][]) => new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'catmullrom', 0.25);

const useWorld = () =>
  useMemo(() => {
    const clipZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // оставляет z ≤ 0
    const clipY = new THREE.Plane(new THREE.Vector3(0, -1, 0), -1.2); // оставляет y ≤ уровень (меняется по кадрам)
    const m: Record<string, any> = {
      skin: new THREE.MeshStandardMaterial({map: plasterTex('#f3f2ee', 2), roughness: 0.38, metalness: 0.15, side: THREE.DoubleSide}),
      skinCut: new THREE.MeshStandardMaterial({color: '#c9c3b6', roughness: 0.9}),
      cabin: new THREE.MeshStandardMaterial({map: plasterTex('#ebe4d6', 3), roughness: 0.9, side: THREE.DoubleSide}),
      hold: new THREE.MeshStandardMaterial({color: '#59616f', roughness: 0.9, side: THREE.DoubleSide}),
      ribs: new THREE.MeshStandardMaterial({map: ribTex(), roughness: 0.85, side: THREE.DoubleSide}),
      body: new THREE.MeshStandardMaterial({color: '#eef0f2', roughness: 0.35}),
      bowlIn: new THREE.MeshStandardMaterial({map: steelTex('#8d98a4', 21), roughness: 0.3, metalness: 0.7}),
      lavWall: new THREE.MeshStandardMaterial({color: '#c9d3da', roughness: 0.8, side: THREE.DoubleSide}),
      carpet: new THREE.MeshStandardMaterial({map: carpetTex(), roughness: 1}),
      wall: new THREE.MeshStandardMaterial({color: '#ded7c9', roughness: 0.85, side: THREE.DoubleSide}),
      seat: new THREE.MeshStandardMaterial({color: '#31476b', roughness: 0.9}),
      head: new THREE.MeshStandardMaterial({color: '#d9d2c2', roughness: 0.9}),
      bin: new THREE.MeshStandardMaterial({color: '#e7e2d8', roughness: 0.6}),
      strip: new THREE.MeshBasicMaterial({color: '#ffe2b0'}),
      winIn: new THREE.MeshBasicMaterial({color: '#ffd5a0'}),
      winOut: new THREE.MeshStandardMaterial({color: '#1c2632', roughness: 0.15, metalness: 0.3, emissive: '#ffc98a', emissiveIntensity: 0.3}),
      glass: new THREE.MeshStandardMaterial({color: '#141c26', roughness: 0.1, metalness: 0.4}),
      steel: new THREE.MeshStandardMaterial({map: steelTex('#b9c0c8', 9), roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide}),
      steelCut: new THREE.MeshStandardMaterial({color: '#7f8891', roughness: 0.6, metalness: 0.4}),
      white: new THREE.MeshStandardMaterial({color: '#f4f2ec', roughness: 0.5}),
      pipe: new THREE.MeshStandardMaterial({map: steelTex('#aab3bd', 11), roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide, clippingPlanes: [clipZ], emissive: '#ffcf7a', emissiveIntensity: 0}),
      vent: new THREE.MeshStandardMaterial({color: '#9aa4af', roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide, clippingPlanes: [clipZ], emissive: '#ffcf7a', emissiveIntensity: 0}),
      tank: new THREE.MeshStandardMaterial({map: steelTex('#a8b0b8', 13), roughness: 0.45, metalness: 0.65, side: THREE.DoubleSide, clippingPlanes: [clipZ], emissive: '#ffcf7a', emissiveIntensity: 0}),
      tankCut: new THREE.MeshStandardMaterial({color: '#6f7780', roughness: 0.6, metalness: 0.4}),
      liquid: new THREE.MeshStandardMaterial({color: '#2b86b8', roughness: 0.25, metalness: 0.1, emissive: '#1a5f8a', emissiveIntensity: 0.35, side: THREE.DoubleSide, clippingPlanes: [clipZ, clipY]}),
      liquidCut: new THREE.MeshStandardMaterial({color: '#3a9bd0', roughness: 0.3, emissive: '#1f6f9e', emissiveIntensity: 0.4, clippingPlanes: [clipY]}),
      pump: new THREE.MeshStandardMaterial({color: '#4c5560', roughness: 0.5, metalness: 0.6, clippingPlanes: [clipZ], emissive: '#ffcf7a', emissiveIntensity: 0}),
      fan: new THREE.MeshBasicMaterial({map: fanTex(), transparent: true}),
      hatch: new THREE.MeshStandardMaterial({color: '#c9ccd0', roughness: 0.4, metalness: 0.5, emissive: '#ffcf7a', emissiveIntensity: 0}),
      valve: new THREE.MeshStandardMaterial({color: '#e0a23a', roughness: 0.4, metalness: 0.6, emissive: '#ffb23a', emissiveIntensity: 0.25}),
      button: new THREE.MeshStandardMaterial({color: '#9fd4ff', roughness: 0.3, emissive: '#7cc4ff', emissiveIntensity: 0.3}),
      panel: new THREE.MeshStandardMaterial({color: '#c7ccd2', roughness: 0.4, metalness: 0.5}),
      mirror: new THREE.MeshBasicMaterial({color: '#fff0d6'}),
      water: new THREE.MeshStandardMaterial({color: '#5ab6e6', roughness: 0.1, emissive: '#2b86b8', emissiveIntensity: 0.5, transparent: true, opacity: 0}),
      slug: new THREE.MeshStandardMaterial({color: '#3a9bd0', roughness: 0.2, emissive: '#1f6f9e', emissiveIntensity: 0.5}),
      wing: new THREE.MeshStandardMaterial({color: '#e6e7e9', roughness: 0.4, metalness: 0.25, side: THREE.DoubleSide}),
      tail: new THREE.MeshStandardMaterial({color: '#1f6b78', roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide}),
      nacelle: new THREE.MeshStandardMaterial({color: '#dfe1e4', roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide}),
      dark: new THREE.MeshStandardMaterial({color: '#1d2128', roughness: 0.6}),
      trail: new THREE.MeshBasicMaterial({map: trailTex(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, color: '#fff4e4'}),
      deck: new THREE.MeshStandardMaterial({map: deckTex(), roughness: 1, color: '#fff6ec'}),
      flow: new THREE.MeshBasicMaterial({color: '#d8f1ff', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false}),
      flowWarm: new THREE.MeshBasicMaterial({color: '#ffe9c2', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false}),
      push: new THREE.MeshBasicMaterial({color: '#ffd27a', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false}),
    };
    const world = new THREE.Group();
    const r = rng(41);

    // --- фюзеляж: обшивка (дальняя половина), внутренняя стенка, срез обшивки
    const xs: number[] = [];
    for (let x = XT; x < XN; x += 0.4) xs.push(x);
    xs.push(XN);
    world.add(new THREE.Mesh(toX(halfLathe(xs.map((x) => [Math.max(0.03, R(x)), x] as [number, number]), 48)), m.skin));
    const seg = (x0: number, x1: number, mat: THREE.Material) => {
      const q = xs.filter((x) => x >= x0 - 1e-6 && x <= x1 + 1e-6);
      world.add(new THREE.Mesh(toX(halfLathe(q.map((x) => [Math.max(0.02, R(x) - WALL), x] as [number, number]), 48)), mat));
    };
    seg(-13.6, 13.2, m.cabin);
    seg(XT, -13.6, m.hold);
    seg(13.2, XN, m.hold);
    [1, -1].forEach((s) => {
      const band: [number, number][] = xs.map((x) => [x, s * Math.max(0.03, R(x))] as [number, number]);
      const inner: [number, number][] = xs
        .slice()
        .reverse()
        .map((x) => [x, s * Math.max(0.0, R(x) - WALL)] as [number, number]);
      world.add(new THREE.Mesh(polyFace(band.concat(inner), 0), m.skinCut));
    });
    // пол (ковёр) по форме фюзеляжа
    {
      const q = xs.filter((x) => x >= -13.6 && x <= 12.8);
      const sh = new THREE.Shape();
      sh.moveTo(q[0], 0);
      q.forEach((x) => sh.lineTo(x, Math.sqrt(Math.max(0.02, Math.pow(R(x) - 0.08, 2) - 0.56 * 0.56))));
      sh.lineTo(q[q.length - 1], 0);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, {depth: 0.12, bevelEnabled: false});
      g.rotateX(-Math.PI / 2);
      g.translate(0, FLOOR - 0.12, 0);
      world.add(new THREE.Mesh(g, [m.carpet, m.skinCut]));
    }
    // перегородки: поперечная пластина от пола до потолка (full — на всё сечение)
    const plate = (x: number, d: number, full: boolean, mat: THREE.Material) => {
      const Rin = R(x) - WALL - 0.01;
      const y0 = full ? -Rin : FLOOR;
      const aEnd = Math.acos(Math.max(-1, y0 / Rin));
      const sh = new THREE.Shape();
      sh.moveTo(0, y0);
      sh.lineTo(0, Rin);
      for (let i = 1; i <= 28; i++) {
        const a = (aEnd * i) / 28;
        sh.lineTo(-Rin * Math.sin(a), Rin * Math.cos(a));
      }
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false});
      g.rotateY(-Math.PI / 2);
      g.translate(x, 0, 0);
      world.add(new THREE.Mesh(g, mat));
    };
    plate(13.1, 0.08, true, m.wall); // кабина пилотов
    plate(-13.5, 0.1, true, m.hold); // гермошпангоут
    plate(-8.45, 0.05, false, m.lavWall); // стенки туалета
    plate(-10.15, 0.05, false, m.lavWall);
    // обшивка трюма под полом со шпангоутами
    {
      const q = xs.filter((x) => x >= -13.4 && x <= 13);
      const hg = new THREE.LatheGeometry(q.map((x) => new THREE.Vector2(Math.max(0.02, R(x) - WALL - 0.03), x)), 24, Math.PI / 2, Math.PI / 2 - 0.29);
      world.add(new THREE.Mesh(toX(hg), m.ribs));
    }

    // --- кресла: три в ряд на дальней стороне, проход по линии разреза
    {
      const fab: THREE.BufferGeometry[] = [];
      const hd: THREE.BufferGeometry[] = [];
      for (let x = 11.6; x > -7.9; x -= 0.82)
        for (const z of [-0.72, -1.18, -1.64]) {
          if (Math.abs(z) + 0.24 > Math.sqrt(Math.pow(R(x) - WALL, 2) - 0.01)) continue;
          const c = new RoundedBoxGeometry(0.46, 0.13, 0.44, 3, 0.05);
          c.translate(x, FLOOR + 0.42, z);
          fab.push(c);
          const b = new RoundedBoxGeometry(0.12, 0.64, 0.44, 3, 0.05);
          b.rotateZ(0.14);
          b.translate(x - 0.24, FLOOR + 0.76, z);
          fab.push(b);
          const base = new RoundedBoxGeometry(0.3, 0.32, 0.36, 2, 0.04);
          base.translate(x, FLOOR + 0.2, z);
          fab.push(base);
          const h = new RoundedBoxGeometry(0.1, 0.2, 0.32, 3, 0.04);
          h.rotateZ(0.14);
          h.translate(x - 0.31, FLOOR + 1.12, z);
          hd.push(h);
        }
      world.add(new THREE.Mesh(mergeGeometries(fab), m.seat));
      world.add(new THREE.Mesh(mergeGeometries(hd), m.head));
      const bin = new THREE.Mesh(new RoundedBoxGeometry(19.6, 0.42, 0.5, 3, 0.12), m.bin);
      bin.position.set(1.9, 1.2, -1.18);
      world.add(bin);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(19.6, 0.03, 0.14), m.strip);
      strip.position.set(1.9, 1.56, -0.7);
      world.add(strip);
    }
    // --- окна: внутри светятся закатом, снаружи тёмное стекло
    {
      const g = rrect(0.24, 0.34, 0.09);
      const list: number[] = [];
      for (let x = 12.2; x > -12.6; x -= 0.53) if (!(x < -8.4 && x > -10.2)) list.push(x);
      const wi = new THREE.InstancedMesh(g, m.winIn, list.length);
      const wo = new THREE.InstancedMesh(g, m.winOut, list.length);
      const d = new THREE.Object3D();
      list.forEach((x, i) => {
        d.position.set(x, 0.35, -(Math.sqrt(Math.pow(R(x) - WALL, 2) - 0.1225) - 0.05));
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        wi.setMatrixAt(i, d.matrix);
        d.position.set(x, 0.35, -(Math.sqrt(Math.pow(R(x), 2) - 0.1225) + 0.04));
        d.rotation.set(0, Math.PI, 0);
        d.updateMatrix();
        wo.setMatrixAt(i, d.matrix);
      });
      world.add(wi, wo);
      // лобовое стекло
      const ws = xs.filter((x) => x >= 15.0 && x <= 16.4);
      const wsg = new THREE.LatheGeometry(ws.map((x) => new THREE.Vector2(R(x) + 0.04, x)), 12, Math.PI + 0.12, Math.PI / 2 - 0.12);
      world.add(new THREE.Mesh(toX(wsg), m.glass));
    }
    // --- туалет: чаша в разрезе, кнопка, раковина, зеркало
    {
      // силуэт сбоку (перёд смотрит в нос): тумба, чаша с выступом вперёд, кожух сзади
      const F = FLOOR;
      const sil: [number, number][] = [[-0.3, 0], [0.17, 0], [0.2, 0.14], [0.34, 0.3], [0.37, 0.43], [-0.3, 0.43]];
      const bsh = new THREE.Shape(sil.map(([x, y]) => new THREE.Vector2(TX + x, F + y)));
      const bg = new THREE.ExtrudeGeometry(bsh, {depth: 0.23, bevelEnabled: false});
      bg.translate(0, 0, -0.23);
      world.add(new THREE.Mesh(bg, m.body));
      const cav: [number, number][] = [[-0.2, 0.43], [0.31, 0.43], [0.25, 0.31], [0.1, 0.11], [0.075, 0.0], [-0.075, 0.0], [-0.1, 0.11], [-0.18, 0.31]];
      world.add(new THREE.Mesh(polyFace(cav.map(([x, y]) => [TX + x, F + y] as [number, number]), 0.004), m.bowlIn));
      const seat = new THREE.Mesh(new RoundedBoxGeometry(0.64, 0.04, 0.25, 2, 0.015), m.wall);
      seat.position.set(TX + 0.04, F + 0.452, -0.125);
      world.add(seat);
      const lid = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.52, 0.25, 2, 0.02), m.body);
      lid.position.set(TX - 0.27, F + 0.72, -0.125);
      lid.rotation.z = 0.1;
      world.add(lid);
      const shr = new THREE.Mesh(new RoundedBoxGeometry(0.2, 1.0, 0.5, 2, 0.03), m.lavWall);
      shr.position.set(TX - 0.42, F + 0.5, -0.25);
      world.add(shr);
      const zb0 = -(Math.sqrt(Math.pow(R(TX) - WALL, 2) - 0.16) - 0.06);
      const disp = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.22, 0.1, 2, 0.02), m.steel);
      disp.position.set(TX + 0.0, 1.0, zb0 + 0.02);
      world.add(disp);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.1), m.strip);
      lamp.position.set(TX, 1.42, zb0 + 0.45);
      world.add(lamp);
      const zb = -(Math.sqrt(Math.pow(R(TX) - WALL, 2) - 0.16) - 0.06);
      const pan = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.24, 0.05, 2, 0.02), m.panel);
      pan.position.set(TX - 0.45, 0.4, zb);
      world.add(pan);
      const sink = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.1, 0.46, 3, 0.04), m.white);
      sink.position.set(TX + 0.48, 0.02, zb + 0.24);
      world.add(sink);
      const mir = new THREE.Mesh(rrect(0.5, 0.62, 0.04), m.mirror);
      mir.position.set(TX + 0.48, 0.78, zb + 0.02);
      world.add(mir);
    }
    // --- труба от чаши к баку, бак, вентиляция за борт, насос, слив
    world.add(new THREE.Mesh(new THREE.TubeGeometry(curveOf([[TX, -0.6], [TX, -0.8], [TX - 0.07, -0.89], [TX - 0.24, -0.93], [-9.9, -0.93], [-10.5, -0.93]]), 60, 0.078, 14), m.pipe));
    {
      const cap = new THREE.CapsuleGeometry(TANK.r, TANK.hl * 2, 10, 28);
      cap.rotateZ(Math.PI / 2);
      cap.translate(TANK.cx, TANK.cy, 0);
      world.add(new THREE.Mesh(cap, m.tank));
      const so = new THREE.Shape(stadium(TANK.cx, TANK.cy, TANK.r, TANK.hl).map(([x, y]) => new THREE.Vector2(x, y)));
      so.holes.push(new THREE.Path(stadium(TANK.cx, TANK.cy, TANK.r - 0.035, TANK.hl).map(([x, y]) => new THREE.Vector2(x, y))));
      world.add(new THREE.Mesh(new THREE.ShapeGeometry(so), m.tankCut));
      const liq = new THREE.CapsuleGeometry(TANK.r - 0.04, TANK.hl * 2, 10, 28);
      liq.rotateZ(Math.PI / 2);
      liq.translate(TANK.cx, TANK.cy, 0);
      world.add(new THREE.Mesh(liq, m.liquid));
      world.add(new THREE.Mesh(polyFace(stadium(TANK.cx, TANK.cy, TANK.r - 0.04, TANK.hl), 0.004), m.liquidCut));
    }
    world.add(new THREE.Mesh(new THREE.TubeGeometry(curveOf([[-11.5, -0.74], [-11.75, -0.73], [-11.95, -0.78], [-12.15, -0.95], [-12.38, -1.35], [-12.45, -1.72]]), 40, 0.045, 12), m.vent));
    {
      const pg = new THREE.CylinderGeometry(0.15, 0.15, 0.34, 20);
      pg.rotateZ(Math.PI / 2);
      pg.translate(-11.95, -0.78, 0);
      world.add(new THREE.Mesh(pg, m.pump));
      world.add(new THREE.Mesh(polyFace([[-12.12, -0.93], [-11.78, -0.93], [-11.78, -0.63], [-12.12, -0.63]], 0), m.steelCut));
      const yo = -R(-12.45);
      const stub = new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12);
      stub.translate(-12.45, yo - 0.05, -0.02);
      world.add(new THREE.Mesh(stub, m.steelCut));
      world.add(new THREE.Mesh(new THREE.TubeGeometry(curveOf([[TANK.cx, TANK.cy - TANK.r + 0.03], [TANK.cx, -R(TANK.cx) + 0.02]]), 8, 0.05, 12), m.vent));
      const hp = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.07, 0.46, 2, 0.02), m.hatch);
      hp.position.set(TANK.cx, -R(TANK.cx) - 0.02, -0.26);
      world.add(hp);
    }
    // --- крылья, двигатели, оперение (целые, с обеих сторон)
    {
      const wingGeo = (pts: [number, number][], th: number) => {
        const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
        const g = new THREE.ExtrudeGeometry(sh, {depth: th, bevelEnabled: true, bevelSize: th * 0.45, bevelThickness: th * 0.45, bevelSegments: 3});
        g.rotateX(Math.PI / 2); // (X,Y,Z) → (X,−Z,Y): размах уходит в +z
        const p = g.attributes.position;
        const z0 = pts[0][1];
        const z1 = pts[1][1];
        for (let i = 0; i < p.count; i++) {
          const k = clamp01((p.getZ(i) - z0) / (z1 - z0));
          p.setY(i, p.getY(i) * lerp(1, 0.3, k) + k * (z1 - z0) * 0.09);
        }
        g.computeVertexNormals();
        return g;
      };
      const wingPts: [number, number][] = [[3.6, 1.5], [-4.6, 17.2], [-6.3, 17.2], [-3.4, 6.2], [-3.2, 1.5]];
      const stabPts: [number, number][] = [[-15.4, 0.4], [-18.3, 6.3], [-19.5, 6.3], [-18.7, 0.4]];
      [1, -1].forEach((s) => {
        const w = wingGeo(wingPts, 0.52);
        w.scale(1, 1, s);
        w.translate(0, -1.0, 0);
        world.add(new THREE.Mesh(w, m.wing));
        const st = wingGeo(stabPts, 0.24);
        st.scale(1, 1, s);
        st.translate(0, 0.75, 0);
        world.add(new THREE.Mesh(st, m.wing));
        // законцовка
        const wl = new THREE.Shape([new THREE.Vector2(-4.7, 0), new THREE.Vector2(-6.3, 0), new THREE.Vector2(-7.1, 2.3), new THREE.Vector2(-6.5, 2.3)]);
        const wg = new THREE.ExtrudeGeometry(wl, {depth: 0.12, bevelEnabled: false});
        wg.translate(0, -1.0 + 15.7 * 0.09 + 0.05, s * 17.2 - 0.06);
        world.add(new THREE.Mesh(wg, m.tail));
        // двигатель
        const eng = new THREE.Group();
        const nac = new THREE.LatheGeometry([[0.78, 1.75], [0.98, 1.45], [1.06, 0.6], [1.04, -0.4], [0.9, -1.2], [0.66, -1.75]].map(([rr, x]) => new THREE.Vector2(rr, x)), 28);
        eng.add(new THREE.Mesh(toX(nac), m.nacelle));
        const inl = new THREE.LatheGeometry([[0.78, 1.75], [0.74, 1.3], [0.74, 0.9]].map(([rr, x]) => new THREE.Vector2(rr, x)), 28);
        eng.add(new THREE.Mesh(toX(inl), m.dark));
        const cone = new THREE.ConeGeometry(0.34, 1.1, 16);
        cone.rotateZ(Math.PI / 2);
        cone.translate(-2.1, 0, 0);
        eng.add(new THREE.Mesh(cone, m.steelCut));
        const pyl = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.9, 0.22, 2, 0.08), m.nacelle);
        pyl.position.set(-0.3, 1.1, 0);
        eng.add(pyl);
        eng.position.set(2.4, -2.45, s * 5.7);
        eng.userData.fanAt = [2.4 + 1.25, -2.45, s * 5.7];
        world.add(eng);
      });
      const fin = new THREE.Shape([new THREE.Vector2(-12.4, 1.2), new THREE.Vector2(-17.5, 7.4), new THREE.Vector2(-19.7, 7.4), new THREE.Vector2(-19.2, 0.4), new THREE.Vector2(-14.5, 0.8)]);
      const fg = new THREE.ExtrudeGeometry(fin, {depth: 0.26, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 2});
      fg.translate(0, 0, -0.13);
      world.add(new THREE.Mesh(fg, m.tail));
      // следы за двигателями
      [1, -1].forEach((s) => {
        for (const rot of [0, Math.PI / 2]) {
          const tr = new THREE.Mesh(new THREE.PlaneGeometry(900, 3.2), m.trail);
          tr.rotation.set(rot, Math.PI, 0);
          tr.position.set(-30 - 450, -2.45, s * 5.7);
          tr.renderOrder = 6;
          world.add(tr);
        }
      });
    }
    world.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });

    // --- облака: поле внизу + клубы над ним + дальние облака на высоте полёта
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), m.deck);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = -1500;
    const puffs: {s: THREE.Sprite; x0: number; span: number}[] = [];
    for (let i = 0; i < 80; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(300 + (i % 14)), color: '#fff3e2', transparent: true, opacity: 0.7, depthWrite: false}));
      const near = i < 50;
      const sc = near ? 700 + r() * 1300 : 1500 + r() * 2500;
      s.scale.set(sc, sc * (0.32 + r() * 0.12), 1);
      const x0 = -9000 + r() * 18000;
      s.position.set(x0, near ? -1420 + r() * 380 : -700 + r() * 1300, near ? -9000 + r() * 10500 : -14000 + r() * 6000);
      s.renderOrder = 1;
      puffs.push({s, x0, span: 18000});
    }
    // --- частицы воздуха: в салоне густо, за бортом редко
    const dotsIn = new Float32Array(1100 * 3);
    for (let i = 0; i < 1100; i++) {
      const x = -13.3 + r() * 26.2;
      const rr = (R(x) - 0.25) * Math.sqrt(r());
      const a = Math.PI / 2 + r() * Math.PI;
      dotsIn.set([x, -rr * Math.sin(a), rr * Math.cos(a) * 0.98], i * 3);
    }
    const gIn = new THREE.BufferGeometry();
    gIn.setAttribute('position', new THREE.BufferAttribute(dotsIn, 3));
    const ptsIn = new THREE.Points(gIn, new THREE.PointsMaterial({color: '#fff1d0', size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false}));
    ptsIn.renderOrder = 12;
    const NOUT = 330;
    const outBase = new Float32Array(NOUT * 3);
    for (let i = 0; i < NOUT; i++) {
      let y = -11 + r() * 22;
      const z = -16 + r() * 15.5;
      if (Math.hypot(y, z) < 2.6) y += y >= 0 ? 3 : -3;
      outBase.set([r() * 70, y, z], i * 3);
    }
    const gOut = new THREE.BufferGeometry();
    gOut.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NOUT * 3), 3));
    const ptsOut = new THREE.Points(gOut, new THREE.PointsMaterial({color: '#cfe2ff', size: 5, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false}));
    ptsOut.renderOrder = 12;
    ptsOut.frustumCulled = false;
    return {m, world, deck, puffs, ptsIn, ptsOut, outBase, clipY, chev: chevGeo(), cache: new Map<string, THREE.Object3D>()};
  }, []);

const useSkyLights = () =>
  useMemo(() => {
    const sky = makeSky(SKY, SUN);
    sky.renderOrder = -10;
    const sunS = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex('rgba(255,250,235,1)', 'rgba(255,214,150,0.5)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false}));
    sunS.scale.set(420, 420, 1);
    sunS.renderOrder = -9;
    const sun = new THREE.DirectionalLight('#ffd6a6', 3.3);
    sun.position.copy(SUN).multiplyScalar(300);
    const fill = new THREE.DirectionalLight('#bcd0ff', 0.3);
    fill.position.set(0.3, 0.5, 1).multiplyScalar(300);
    const hemi = new THREE.HemisphereLight('#a9bfe8', '#d9bb98', 0.6);
    const cabL = [-6, 2, 9].map((x) => {
      const l = new THREE.PointLight('#ffd9a8', 9, 10, 1.6);
      l.position.set(x, 1.1, -0.5);
      return l;
    });
    const lavL = new THREE.PointLight('#fff1dc', 7, 5, 1.5);
    lavL.position.set(TX + 0.1, 1.0, -0.6);
    const holdL = new THREE.PointLight('#dfe9ff', 5, 5, 1.5);
    holdL.position.set(-10.9, -0.75, -0.3);
    const nav = [0, 1, 2, 3].map((k) => {
      const c = [
        ['rgba(255,90,70,1)', 'rgba(255,60,40,0.35)'],
        ['rgba(90,255,140,1)', 'rgba(60,220,110,0.35)'],
        ['rgba(255,255,255,1)', 'rgba(255,255,255,0.4)'],
        ['rgba(255,80,60,1)', 'rgba(255,60,40,0.4)'],
      ][k];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex(c[0], c[1]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
      s.renderOrder = 20;
      return s;
    });
    const btnGlow = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex('rgba(210,238,255,1)', 'rgba(120,196,255,0.45)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
    btnGlow.renderOrder = 20;
    return {sky, sunS, sun, fill, hemi, cabL, lavL, holdL, nav, btnGlow};
  }, []);

const AviaWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const W0 = useWorld();
  const SL = useSkyLights();
  const {m} = W0;
  const p = clamp01(frame / Math.max(1, dur));
  const t = t0 + frame / fps;
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
    const all = [W0.world, W0.deck, ...W0.puffs.map((q) => q.s), W0.ptsIn, W0.ptsOut, dyn, L.sky, L.sunS, L.sun, L.fill, L.hemi, ...L.cabL, L.lavL, L.holdL, ...L.nav, L.btnGlow];
    scene.add(...all);
    scene.fog = new THREE.Fog(LOOK.fog, LOOK.fogNear, LOOK.fogFar);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.95;
    gl.shadowMap.enabled = false;
    gl.localClippingEnabled = true;
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const sk = makeSky(SKY, SUN);
    sk.scale.setScalar(0.05);
    envScene.add(sk);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    (scene as any).environmentIntensity = 0.55;
    pm.dispose();
    return () => {
      scene.remove(...all);
      scene.environment = null;
    };
  }, []);

  useLayoutEffect(() => {
    dyn.children.slice().forEach((c: any) => dyn.remove(c));
    const add = (o: THREE.Object3D) => dyn.add(o);

    // --- камера: плавный перелёт без рывка у предмета
    const cs = (P.cam ?? ['diag', 'diag']).map((c: string | Cam) => cam(c));
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
    const near = Math.min(3, Math.max(0.12, cp.dist * 0.08));
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== cp.fov || pc.far !== FAR || Math.abs(pc.near - near) > 1e-4) {
      pc.fov = cp.fov;
      pc.near = near;
      pc.far = FAR;
      pc.updateProjectionMatrix();
    }
    SL.sky.position.copy(camera.position);
    SL.sunS.position.copy(camera.position).addScaledVector(SUN, 1500);
    const camV = cp.pos;

    // --- облака текут назад (мир движется, самолёт стоит)
    (m.deck.map as THREE.Texture).offset.set((t * V_CLOUD) / (60000 / 9), 0);
    W0.puffs.forEach((q) => {
      q.s.position.x = ((((q.x0 - t * V_CLOUD + 9000) % q.span) + q.span) % q.span) - 9000;
    });

    // --- частицы воздуха (давление)
    const dots = range(P.dots ?? 0, p);
    (W0.ptsIn.material as THREE.PointsMaterial).opacity = 0.85 * dots;
    (W0.ptsOut.material as THREE.PointsMaterial).opacity = 0.85 * dots;
    W0.ptsIn.visible = W0.ptsOut.visible = dots > 0.01;
    if (dots > 0.01) {
      const a = W0.ptsOut.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        const x = ((((W0.outBase[i * 3] - t * 9) % 70) + 70) % 70) - 35;
        a.setXYZ(i, x, W0.outBase[i * 3 + 1], W0.outBase[i * 3 + 2]);
      }
      a.needsUpdate = true;
    }
    // «салон надут»: стрелки давят на обшивку изнутри
    const bal = range(P.balloon ?? 0, p);
    if (bal > 0.01) {
      let k = 0;
      for (let x = -12; x <= 12.01; x += 1.6) {
        for (const s of [1, -1]) {
          const c = cached(`push_${k++}`, () => new THREE.Mesh(W0.chev, m.push));
          const pulse = 0.5 + 0.5 * Math.sin(t * 4 + x * 0.6);
          c.position.set(x, s * (R(x) - 0.42 + 0.14 * pulse), 0.03);
          c.rotation.set(0, 0, (s * Math.PI) / 2);
          c.scale.setScalar(0.34 * bal);
          c.renderOrder = 14;
          add(c);
        }
      }
    }

    // --- смыв: клапан, кнопка, поток воздуха из салона через чашу в бак и за борт
    const flush = range(P.flush ?? 0, p);
    const valve = range(P.valve ?? 0, p);
    const btn = range(P.btn ?? 0, p);
    const vp = cached('valve', () => new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.15), m.valve));
    vp.position.set(TX, FLOOR + 0.03, -0.06);
    vp.rotation.set(0, 0, (valve * Math.PI) / 2);
    add(vp);
    const zb = -(Math.sqrt(Math.pow(R(TX) - WALL, 2) - 0.16) - 0.06);
    const bt = cached('button', () => {
      const g = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 20);
      g.rotateX(Math.PI / 2);
      return new THREE.Mesh(g, m.button);
    });
    bt.position.set(TX - 0.45, 0.4, zb + 0.045 - 0.015 * btn);
    add(bt);
    m.button.emissiveIntensity = 0.35 + 1.6 * btn;
    SL.btnGlow.position.set(TX - 0.45, 0.4, zb + 0.09);
    SL.btnGlow.scale.setScalar(0.5);
    (SL.btnGlow.material as THREE.SpriteMaterial).opacity = 0.75 * btn;

    const stream = (key: string, P0: Path, n: number, speed: number, size: number, mat: THREE.Material, amt: number, z = 0.02) => {
      if (amt < 0.01) return;
      for (let k = 0; k < n; k++) {
        const u = (((t * speed) / P0.len + k / n) % 1 + 1) % 1;
        const a = at(P0, u);
        const c = cached(`${key}_${k}`, () => new THREE.Mesh(W0.chev, mat));
        const edge = Math.min(1, u * 6, (1 - u) * 6);
        c.position.set(a.x, a.y, z);
        c.rotation.set(0, 0, a.ang);
        c.scale.setScalar(size * amt * edge);
        c.renderOrder = 15;
        add(c);
      }
    };
    P_FEED.forEach((F, i) => stream(`feed${i}`, F, 5, 2.6, 0.2, m.flowWarm, flush));
    stream('main', P_MAIN, 13, 3.4, 0.15, m.flow, flush);
    stream('vent', P_VENT, 16, 3.4, 0.14, m.flow, range(P.ventFlow ?? P.flush ?? 0, p));

    // синяя жидкость уходит по трубе в бак
    const slug = range(P.slug ?? -1, p);
    if (slug > -0.5 && slug < 1.2)
      for (let k = 0; k < 6; k++) {
        const u = slug - k * 0.035;
        if (u < 0.12 || u > 1) continue;
        const a = at(P_MAIN, u);
        const s = cached(`slug_${k}`, () => new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), m.slug));
        s.position.set(a.x, a.y, -0.01);
        s.scale.setScalar(1 - k * 0.1);
        add(s);
      }
    // ополаскивание чаши
    const rinse = range(P.rinse ?? 0, p);
    m.water.opacity = 0.9 * rinse;
    if (rinse > 0.01) {
      const wr = cached('rinse', () => {
        const g = new THREE.TorusGeometry(0.2, 0.018, 8, 40, Math.PI * 1.5);
        g.rotateX(-Math.PI / 2);
        return new THREE.Mesh(g, m.water);
      });
      wr.position.set(TX + 0.04, FLOOR + 0.36 - 0.12 * ((t * 0.9) % 1), 0);
      wr.rotation.set(0, t * 7, 0);
      const sc = 1 - 0.45 * ((t * 0.9) % 1);
      wr.scale.set(sc, 1, sc);
      wr.renderOrder = 9;
      add(wr);
    }
    // уровень в баке
    const lvl = range(P.level ?? 0.35, p);
    W0.clipY.constant = TANK.cy - TANK.r + 0.04 + (TANK.r * 2 - 0.08) * lvl;

    // насос (вертушка на срезе)
    const pump = range(P.pump ?? 0, p);
    const fan = cached('fan', () => new THREE.Mesh(new THREE.CircleGeometry(0.115, 28), m.fan));
    fan.position.set(-11.95, -0.78, 0.012);
    fan.rotation.set(0, 0, -t * 22 * pump);
    add(fan);

    // подсветка названных деталей
    const hl = P.hl ?? {};
    m.pipe.emissiveIntensity = 0.55 * range(hl.pipe, p);
    m.tank.emissiveIntensity = 0.5 * range(hl.tank, p);
    m.vent.emissiveIntensity = 0.7 * range(hl.vent, p);
    m.pump.emissiveIntensity = 0.8 * range(hl.pump, p);
    m.hatch.emissiveIntensity = 0.9 * range(hl.hatch, p) * (0.6 + 0.4 * Math.sin(t * 5));

    // двигатели (вентилятор) и огни
    let ei = 0;
    W0.world.children.forEach((o: any) => {
      if (!o.userData.fanAt) return;
      const f = cached(`efan_${ei++}`, () => {
        const g = new THREE.CircleGeometry(0.74, 28);
        g.rotateY(Math.PI / 2);
        return new THREE.Mesh(g, m.fan);
      });
      f.position.set(o.userData.fanAt[0], o.userData.fanAt[1], o.userData.fanAt[2]);
      f.rotation.set(t * 9, 0, 0);
      add(f);
    });
    const yTip = -1.0 + 15.7 * 0.09 + 1.2;
    const navP: [number, number, number][] = [[-6.6, yTip, -17.2], [-6.6, yTip, 17.2], [-19.7, 0.6, 0], [-2, 2.15, 0]];
    SL.nav.forEach((s, k) => {
      s.position.set(navP[k][0], navP[k][1], navP[k][2]);
      const d = camV.distanceTo(s.position);
      s.scale.setScalar(Math.max(0.5, d * 0.02));
      const blink = k < 2 ? 1 : k === 2 ? (((t * 1.0) % 1) < 0.08 ? 1 : 0) : ((t * 0.9 + 0.5) % 1) < 0.12 ? 1 : 0;
      (s.material as THREE.SpriteMaterial).opacity = 0.85 * blink;
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
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(20,16,30,${A.vignette}) 100%)`}} />
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

export const AviaScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const bOut = P.bannerEnd ? 1 - clamp01((frame - P.bannerEnd * life) / 8) : 1;
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [17, 5.5, 31], near: 1, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <AviaWorld P={P} dur={durationInFrames} t0={scene.start ?? 0} />
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
              background: 'rgba(14,18,40,0.5)',
            }}
          >
            {P.banner}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
