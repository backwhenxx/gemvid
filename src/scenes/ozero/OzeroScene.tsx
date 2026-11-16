import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {cloudTexture} from '../dam/textures';
import {Post} from '../../lib/post';
import {camBetween} from '../../lib/camPath';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «Озеро зимой». Круглое озеро R=55 м, глубина 12 м, центр в (0,0,0); разрез по z=0 через середину.
// Еловый лес по берегам. Сезон (P.win): осень → зима (снег на берегах, шапки на елях, снегопад).
// Вода на срезе раскрашена по температуре (вершины), лёд и снег — отдельные полосы над водой. 1 единица = 1 м.
const YB = -60;
const FAR = 6000;
const R = 55;
const DEP = 12;
const SUN = new THREE.Vector3(-0.55, 0.32, 0.77).normalize();
const SKY = {top: '#5d7fae', mid: '#a9bfd6', horizon: '#e9e2d6', glow: '#fff0da', glowSize: 5};
const LOOK = {fog: '#cfd8e0', fogNear: 160, fogFar: 1600, grade: {shadow: '#1b3352', shadowAmt: 0.06, high: '#ffe9cc', highAmt: 0.04, vignette: 0.3, grain: 0.03}};

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
  hook0: {pos: [4, 2.4, 28], look: [0, -0.6, -10], fov: 50},
  hook1: {pos: [4, -0.5, 32], look: [0, -4, 0], fov: 50},
  cut: {pos: [5, -2, 34], look: [0, -5, 0], fov: 50},
  conv: {pos: [-9, -3, 32], look: [-6, -5.5, 0], fov: 50},
  mix: {pos: [6, -4, 34], look: [2, -6, 0], fov: 50},
  dense: {pos: [2, -7, 22], look: [0, -9.5, 0], fov: 50},
  light: {pos: [-5, -1.2, 20], look: [-7, -2.5, 0], fov: 50},
  ice: {pos: [3, 1.6, 17], look: [0, -0.8, 0], fov: 50},
  blanket: {pos: [-8, 5, 34], look: [-4, 0, -8], fov: 50},
  bottom: {pos: [3, -5, 30], look: [0, -8, 0], fov: 50},
  ghost: {pos: [-28, 3, 52], look: [0, -6, 0], fov: 50},
  debate: {pos: [-36, 13, 28], look: [-28, 0, -6], fov: 50},
  final: {pos: [-18, 15, 72], look: [0, -2, -12], fov: 50},
  cover: {pos: [5, -1.5, 33], look: [0, -3.5, 0], fov: 50},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.cut : c);

// ---------- рельеф ----------
// профиль по радиусу: дно чаши → берег 1,5 м → дальние холмы
const G = (r: number) => {
  if (r < R) return -DEP * Math.pow(1 - (r / R) * (r / R), 0.75);
  const bank = 1.5 * smooth(R, R + 14, r);
  return bank + 9 * smooth(140, 600, r);
};
const Hgt = (x: number, z: number) => {
  const r = Math.hypot(x, z);
  const bump = 0.6 * Math.sin(x * 0.08 + z * 0.05) * Math.sin(z * 0.11) * smooth(R + 8, R + 30, r);
  return G(r) + bump;
};
const S = (x: number) => Hgt(x, 0);
// слои под землёй: почва/ил, песок, глина
const NL = 3;
const bound = (k: number, x: number) => (k === 0 ? S(x) : k === 1 ? S(x) - 0.8 : k === 2 ? Math.min(S(x) - 0.8, -15 - 0.02 * Math.abs(x)) : YB);
const XS: number[] = (() => {
  const s = new Set<number>();
  for (let x = -1500; x < -150; x += 25) s.add(x);
  for (let x = -150; x <= 150; x += 1) s.add(x);
  for (let x = 175; x <= 1500; x += 25) s.add(x);
  s.add(-R);
  s.add(R);
  return [...s].sort((a, b) => a - b);
})();
const ZS: number[] = (() => {
  const z: number[] = [];
  for (let v = 0; v > -150; v -= 2) z.push(v);
  for (let v = -150; v > -500; v -= 10) z.push(v);
  for (let v = -500; v >= -1500; v -= 50) z.push(v);
  return z;
})();

// цвет воды по температуре
const C0 = new THREE.Color('#d6f0fb');
const C4 = new THREE.Color('#1c5888');
const C10 = new THREE.Color('#3e8c7c');
const tColor = (t: number, out: THREE.Color) => (t <= 4 ? out.copy(C0).lerp(C4, clamp01(t / 4)) : out.copy(C4).lerp(C10, clamp01((t - 4) / 6)));

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
  speckle(g, 512, 512, 60, [grain[0].replace(/[\d.]+\)$/, '0.06)')], seed, [12, 30]);
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


const snowTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#eef2f6';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 80, ['rgba(170,190,215,0.08)', 'rgba(255,255,255,0.25)'], 81, [16, 40]);
  speckle(g, 512, 512, 6000, ['rgba(150,170,200,0.12)', 'rgba(255,255,255,0.4)'], 82, [0.8, 2]);
  return tex(c);
};
// трава/земля: нейтральная, цвет задаёт материал (осень → снег)
const groundTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#d8d4c8';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 120, ['rgba(120,110,90,0.12)', 'rgba(255,255,255,0.15)'], 83, [14, 36]);
  speckle(g, 512, 512, 8000, ['rgba(90,80,60,0.16)', 'rgba(255,255,250,0.18)'], 84, [0.8, 2.4]);
  return tex(c);
};
const iceTex = () => {
  const [c, g] = cv(512, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#d4ecf5');
  gr.addColorStop(1, '#78b4d2');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 256);
  const r = rng(85);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    let x = r() * 512;
    let y = r() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (r() - 0.5) * 80;
      y += (r() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  speckle(g, 512, 256, 300, ['rgba(255,255,255,0.6)'], 86, [1, 3]);
  return tex(c);
};
const labelTex = (txt: string, col: string) => {
  const [c, g] = cv(512, 256);
  g.font = '700 150px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 22;
  g.strokeStyle = 'rgba(12,24,38,0.85)';
  g.strokeText(txt, 256, 132);
  g.fillStyle = col;
  g.fillText(txt, 256, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const terrainGeo = () => {
  const nx = XS.length;
  const nz = ZS.length;
  const P = new Float32Array(nx * nz * 3);
  const U = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const o = j * nx + i;
      P.set([XS[i], Hgt(XS[i], ZS[j]), ZS[j]], o * 3);
      U.set([XS[i] / 8, -ZS[j] / 8], o * 2);
    }
  const I: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      I.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
};
const layerGeo = (k: number) => {
  const P: number[] = [];
  const U: number[] = [];
  for (let i = 0; i < XS.length - 1; i++) {
    const x0 = XS[i];
    const x1 = XS[i + 1];
    const t0 = bound(k, x0);
    const b0 = bound(k + 1, x0);
    const t1 = bound(k, x1);
    const b1 = bound(k + 1, x1);
    if (t0 - b0 < 1e-3 && t1 - b1 < 1e-3) continue;
    P.push(x0, b0, 0, x1, b1, 0, x1, t1, 0, x0, b0, 0, x1, t1, 0, x0, t0, 0);
    const sc = 6;
    U.push(x0 / sc, b0 / sc, x1 / sc, b1 / sc, x1 / sc, t1 / sc, x0 / sc, b0 / sc, x1 / sc, t1 / sc, x0 / sc, t0 / sc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
};
// сетка воды на срезе: колонки по XS внутри озера, NR строк от дна до верха (верх двигается под лёд)
const NR = 18;
const WX = XS.filter((x) => x >= -R && x <= R);
const waterGeo = () => {
  const nx = WX.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nx * (NR + 1) * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nx * (NR + 1) * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nx * (NR + 1) * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  const I: number[] = [];
  for (let i = 0; i < nx - 1; i++)
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j;
      const b = a + NR + 1;
      I.push(a, b, a + 1, b, b + 1, a + 1);
    }
  g.setIndex(I);
  return g;
};
// полоса (лёд/снег) на срезе между двумя функциями y(x) на отрезке озера
const bandGeo = () => {
  const nx = WX.length;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nx * 2 * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nx * 2 * 2), 2));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nx * 2 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  const I: number[] = [];
  for (let i = 0; i < nx - 1; i++) {
    const a = i * 2;
    I.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
  }
  g.setIndex(I);
  return g;
};
const setBand = (g: THREE.BufferGeometry, lo: (x: number) => number, hi: (x: number) => number, sc: number) => {
  const p = g.attributes.position as THREE.BufferAttribute;
  const u = g.attributes.uv as THREE.BufferAttribute;
  WX.forEach((x, i) => {
    const b = lo(x);
    const t = Math.max(b, hi(x));
    p.setXYZ(i * 2, x, b, 0);
    p.setXYZ(i * 2 + 1, x, t, 0);
    u.setXY(i * 2, x / sc, b / sc);
    u.setXY(i * 2 + 1, x / sc, t / sc);
  });
  p.needsUpdate = true;
  u.needsUpdate = true;
  g.computeBoundingSphere();
};
// диск (задняя половина круга) для поверхности воды/льда/снега, uv по миру
const halfDisc = (r: number, uvs: number) => {
  const g = new THREE.CircleGeometry(r, 96, 0, Math.PI);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const u = g.attributes.uv;
  for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / uvs, p.getZ(i) / uvs);
  return g;
};

const useWorld = () =>
  useMemo(() => {
    const r = rng(23);
    const dot = dotTex();
    const lay = [
      rockTex('#4b3a2b', ['rgba(0,0,0,0.12)', 'rgba(150,130,100,0.12)'], ['rgba(40,30,20,0.5)'], 91, 40, 0),
      rockTex('#bfa678', ['rgba(120,95,60,0.16)', 'rgba(255,245,220,0.15)'], ['rgba(140,125,105,0.5)', 'rgba(95,85,70,0.45)'], 92, 70, 2),
      rockTex('#7d6a5e', ['rgba(40,30,25,0.13)', 'rgba(190,170,160,0.1)'], ['rgba(80,70,65,0.35)'], 93, 25, 8),
    ];
    const snow = snowTex();
    const m: Record<string, any> = {
      ground: new THREE.MeshStandardMaterial({map: groundTex(), roughness: 1, color: '#8a7a48'}),
      layers: lay.map((t) => new THREE.MeshStandardMaterial({map: t, roughness: 0.95})),
      water: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.6, emissive: '#0c2234', emissiveIntensity: 0.25}),
      waterTop: new THREE.MeshStandardMaterial({color: '#50789a', roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.94}),
      ice: new THREE.MeshStandardMaterial({map: iceTex(), roughness: 0.15, metalness: 0.05, transparent: true, opacity: 1, emissive: '#5f9ab8', emissiveIntensity: 0.03}),
      iceTop: new THREE.MeshStandardMaterial({color: '#cfe6f0', roughness: 0.2, transparent: true, opacity: 1}),
      snow: new THREE.MeshStandardMaterial({map: snow, roughness: 0.9}),
      spruce: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, flatShading: true}),
      cap: new THREE.MeshStandardMaterial({color: '#f3f6fa', roughness: 0.9, flatShading: true, transparent: true}),
      flake: new THREE.PointsMaterial({color: '#ffffff', size: 0.16, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05}),
      arrowC: new THREE.MeshBasicMaterial({color: '#a9dcff', toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, fog: false}),
      arrowW: new THREE.MeshBasicMaterial({color: '#ffbf80', toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, fog: false}),
      ghost: new THREE.MeshStandardMaterial({color: '#e2f2fa', roughness: 0.2, transparent: true, opacity: 0.9, emissive: '#3b6f8c', emissiveIntensity: 0.2}),
      path: new THREE.MeshBasicMaterial({color: '#FFD54A', toneMapped: false, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4}),
    };
    const world = new THREE.Group();
    world.add(new THREE.Mesh(terrainGeo(), m.ground));
    for (let k = 0; k < NL; k++) world.add(new THREE.Mesh(layerGeo(k), m.layers[k]));
    // ели: ствол + 3 яруса; снежные шапки — отдельно (растут зимой)
    const caps: THREE.BufferGeometry[] = [];
    {
      const parts: THREE.BufferGeometry[] = [];
      const cc = [new THREE.Color('#25412c'), new THREE.Color('#2d4b31'), new THREE.Color('#1f3a29')];
      const col = (t: THREE.BufferGeometry, c: THREE.Color) => {
        const g = t.index ? t.toNonIndexed() : t;
        const ca = new Float32Array(g.attributes.position.count * 3);
        for (let k = 0; k < g.attributes.position.count; k++) ca.set([c.r, c.g, c.b], k * 3);
        g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        g.deleteAttribute('uv');
        g.deleteAttribute('normal');
        parts.push(g);
      };
      let n = 0;
      for (let i = 0; i < 9000 && n < 700; i++) {
        const a = -Math.PI * 1.02 + r() * Math.PI * 1.04;
        const d = R + 12 + Math.pow(r(), 0.7) * 260;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (z > -3) continue;
        const h = 7 + r() * 9;
        const y0 = Hgt(x, z);
        const tr = new THREE.CylinderGeometry(0.18, 0.3, h * 0.3, 5);
        tr.translate(x, y0 + h * 0.15 - 0.2, z);
        col(tr, new THREE.Color('#3b2c20'));
        for (let t = 0; t < 3; t++) {
          const rr = h * (0.3 - t * 0.07);
          const hh = h * 0.45;
          const yb = y0 + h * 0.18 + t * h * 0.24;
          const cone = new THREE.ConeGeometry(rr, hh, 7);
          cone.translate(x, yb + hh / 2, z);
          col(cone, cc[(n + t) % 3]);
          const cap = new THREE.ConeGeometry(rr * 0.82, hh * 0.32, 7);
          cap.translate(x, yb + hh * 0.84, z);
          caps.push(cap.toNonIndexed());
        }
        n++;
      }
      const g = mergeGeometries(parts);
      g.computeVertexNormals();
      world.add(new THREE.Mesh(g, m.spruce));
    }
    const capMesh = new THREE.Mesh(mergeGeometries(caps.map((c) => {
      c.deleteAttribute('uv');
      return c;
    })), m.cap);
    world.add(capMesh);
    // облака
    for (let i = 0; i < 20; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(400 + (i % 12)), color: '#f6f3ee', transparent: true, opacity: 0.85, depthWrite: false, fog: false}));
      const sc = 450 + r() * 800;
      s.scale.set(sc, sc * 0.32, 1);
      const a = -Math.PI * 0.95 + r() * Math.PI * 0.9;
      const d = 1200 + r() * 400;
      s.position.set(Math.cos(a) * d, 200 + r() * 380, Math.sin(a) * d);
      world.add(s);
    }

    // ===== динамика
    const dyn = new THREE.Group();
    world.add(dyn);
    const water = new THREE.Mesh(waterGeo(), m.water);
    const waterTop = new THREE.Mesh(halfDisc(R + 0.5, 10), m.waterTop);
    const ice = new THREE.Mesh(bandGeo(), m.ice);
    ice.renderOrder = 2;
    const iceTop = new THREE.Mesh(halfDisc(R + 0.5, 10), m.iceTop);
    const snowBand = new THREE.Mesh(bandGeo(), m.snow);
    const snowTop = new THREE.Mesh(halfDisc(R + 0.5, 8), m.snow);
    dyn.add(water, waterTop, ice, iceTop, snowBand, snowTop);
    // передняя половина озера (хук): плита со снегом сверху, уезжает вниз
    const block = new THREE.Mesh(new THREE.BoxGeometry(100, 30, 50), [m.layers[2], m.layers[2], m.snow, m.layers[2], m.layers[2], m.layers[2]]);
    {
      const g = block.geometry;
      const p = g.attributes.position;
      const u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) u.setXY(i, (p.getX(i)) / 8, (p.getZ(i) + 25) / 8);
    }
    dyn.add(block);
    // снегопад
    const NF = 1600;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NF * 3), 3));
    const flakes = new THREE.Points(fg, m.flake);
    flakes.frustumCulled = false;
    flakes.renderOrder = 9;
    dyn.add(flakes);
    // взвесь в воде (на срезе)
    const NM = 500;
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NM * 3), 3));
    const motes = new THREE.Points(mg, new THREE.PointsMaterial({color: '#e6f6ff', size: 0.13, map: dot, transparent: true, opacity: 0.4, depthWrite: false, alphaTest: 0.02}));
    motes.frustumCulled = false;
    motes.renderOrder = 7;
    dyn.add(motes);
    // стрелки перемешивания: колонки, холодные вниз / тёплые вверх
    const arrows: {me: THREE.Mesh; x: number; down: boolean; ph: number}[] = [];
    for (let i = 0; i < 9; i++) {
      const x = -40 + i * 10;
      for (let k = 0; k < 2; k++) {
        const down = i % 2 === 0;
        const me = new THREE.Mesh(flatArrow(2.4, 0.7, 1.6, 1.0), down ? m.arrowC : m.arrowW);
        me.rotation.z = down ? -Math.PI / 2 : Math.PI / 2;
        me.renderOrder = 20;
        dyn.add(me);
        arrows.push({me, x, down, ph: k * 0.5 + i * 0.13});
      }
    }
    // таблички температур
    const label = (txt: string, col: string, x: number, y: number, s: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: labelTex(txt, col), transparent: true, depthTest: false, fog: false, toneMapped: false}));
      sp.position.set(x, y, 0.8);
      sp.scale.set(s * 2, s, 1);
      sp.renderOrder = 30;
      dyn.add(sp);
      return sp;
    };
    const labels: Record<string, THREE.Sprite> = {
      air: label('−30°', '#ffffff', 3, 3.6, 2.4),
      warm: label('+10°', '#ffcf9a', -6, -3.5, 2.2),
      bot: label('+4°', '#9fdcff', 0, -9.2, 2.6),
      top: label('0°', '#e8f7ff', -9, -1.6, 1.8),
    };
    // «если бы лёд тонул»: плиты падают на дно
    const ghosts = [-36, -24, -12, 0, 12, 24, 36].map((x, i) => {
      const me = new THREE.Mesh(new THREE.BoxGeometry(11, 1.5, 3.2), m.ghost);
      me.userData = {x, d: i * 0.07, rot: (i % 2 ? 1 : -1) * 0.12};
      dyn.add(me);
      return me;
    });
    // путь до берега (жёлтые штрихи по снегу)
    const path = Array.from({length: 22}, (_, i) => {
      const me = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), m.path);
      me.rotation.x = -Math.PI / 2;
      me.userData.x = -4 - i * 2.3;
      me.renderOrder = 4;
      dyn.add(me);
      return me;
    });
    return {m, motes, world, water, waterTop, ice, iceTop, snowBand, snowTop, block, flakes, arrows, labels, ghosts, path, capMesh};
  }, []);

const useSkyLights = () =>
  useMemo(() => {
    const sky = makeSky(SUN);
    sky.renderOrder = -10;
    const sun = new THREE.DirectionalLight('#ffe8cc', 2.3);
    sun.position.copy(SUN).multiplyScalar(300);
    const fill = new THREE.DirectionalLight('#b8cbe6', 0.7);
    fill.position.set(0.7, 0.4, 0.6).multiplyScalar(300);
    const hemi = new THREE.HemisphereLight('#d6e2f0', '#6b6458', 0.9);
    return {sky, sun, fill, hemi};
  }, []);

const AUT = new THREE.Color('#8a7a48');
const WIN = new THREE.Color('#f2f5f9');

const OzWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
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

    // --- сезон
    const win = range(P.win ?? 1, p);
    (W0.m.ground as THREE.MeshStandardMaterial).color.copy(AUT).lerp(WIN, win);
    W0.capMesh.visible = win > 0.02;
    W0.capMesh.scale.set(1, 1, 1);
    (W0.m.cap as THREE.MeshStandardMaterial).opacity = win;

    // --- лёд и снег
    const iceK = range(P.ice ?? 1, p);
    const snowK = range(P.snow ?? 1, p);
    const T = 0.3 + 0.9 * iceK; // видимая толщина (условно, для читаемости)
    const iTop = 0.1 * T;
    const iBot = -0.9 * T;
    const iceOn = iceK > 0.01;
    const op = clamp01(iceK / 0.15);
    W0.ice.visible = W0.iceTop.visible = iceOn;
    (W0.m.ice as THREE.MeshStandardMaterial).opacity = op;
    (W0.m.iceTop as THREE.MeshStandardMaterial).opacity = op;
    setBand(W0.ice.geometry, (x) => Math.max(iBot, S(x)), () => iTop, 4);
    W0.iceTop.position.y = iTop;
    W0.waterTop.visible = op < 0.999;
    W0.waterTop.position.y = 0;
    const sT = 0.06 + 0.35 * snowK;
    const snowOn = iceOn && snowK > 0.01;
    W0.snowBand.visible = W0.snowTop.visible = snowOn;
    setBand(W0.snowBand.geometry, (x) => Math.max(iTop, S(x)), (x) => iTop + sT * smooth(R, R - 6, Math.abs(x)) + 0.001, 4);
    W0.snowTop.position.y = iTop + sT;
    W0.snowTop.scale.setScalar(snowK > 0.5 ? 1 : 1);
    W0.snowTop.visible = snowOn && snowK > 0.12;

    // --- вода на срезе: температура по глубине
    const mix = range(P.mix ?? 1, p);
    const strat = range(P.strat ?? 1, p);
    const cool = range(P.cool ?? 0, p);
    const wTop = iceOn ? iBot : 0;
    {
      const g = W0.water.geometry;
      const pa = g.attributes.position as THREE.BufferAttribute;
      const ca = g.attributes.color as THREE.BufferAttribute;
      const c = new THREE.Color();
      WX.forEach((x, i) => {
        const b = Math.min(S(x), wTop);
        for (let j = 0; j <= NR; j++) {
          const y = lerp(b, wTop, j / NR);
          let t = lerp(10, 4, mix);
          t -= cool * 4 * Math.exp(y / 1.8) * (1 - mix);
          t -= strat * 4 * Math.exp(y / 1.6);
          tColor(Math.max(0, t), c);
          pa.setXYZ(i * (NR + 1) + j, x, y, 0);
          ca.setXYZ(i * (NR + 1) + j, c.r, c.g, c.b);
        }
      });
      pa.needsUpdate = true;
      ca.needsUpdate = true;
      g.computeBoundingSphere();
    }

    // --- взвесь
    {
      const pos = W0.motes.geometry.attributes.position as THREE.BufferAttribute;
      const rr = rng(41);
      for (let i = 0; i < pos.count; i++) {
        const x = -50 + rr() * 100;
        const b = Math.min(S(x), wTop);
        const k = (rr() + sec * 0.012 * (0.5 + rr())) % 1;
        const y = lerp(b + 0.3, wTop - 0.25, k);
        pos.setXYZ(i, x + Math.sin(sec * 0.4 + i) * 0.3, y, 0.25);
        if (wTop - b < 0.8) pos.setXYZ(i, x, -500, 0);
      }
      pos.needsUpdate = true;
    }
    // --- хук: передняя половина
    const cut = range(P.cut ?? 1, p);
    W0.block.visible = cut < 0.999;
    W0.block.position.set(0, iTop + sT - 15 - cut * 34, 25);

    // --- снегопад вокруг камеры
    {
      const on = range(P.snowfall ?? 0, p);
      W0.flakes.visible = on > 0.01;
      (W0.m.flake as THREE.PointsMaterial).opacity = on;
      if (W0.flakes.visible) {
        const pos = W0.flakes.geometry.attributes.position as THREE.BufferAttribute;
        const rr = rng(31);
        const c = camera.position;
        for (let i = 0; i < pos.count; i++) {
          const bx = (rr() - 0.5) * 60;
          const bz = (rr() - 0.5) * 60;
          const h = 30;
          const yy = h - ((sec * (1.0 + rr() * 0.6) + rr() * h) % h);
          // привязка к сетке 60 м, чтобы снег не «ехал» за камерой
          const ox = Math.round(c.x / 60) * 60;
          const oz = Math.round(c.z / 60) * 60;
          let x = ox + bx + Math.sin(sec * 0.7 + i) * 0.4;
          let z = oz + bz;
          if (x - c.x > 30) x -= 60;
          if (x - c.x < -30) x += 60;
          if (z - c.z > 30) z -= 60;
          if (z - c.z < -30) z += 60;
          const y = c.y - 12 + yy;
          const ground = z < 0 ? Math.max(Hgt(x, z), iTop + sT) : 1e9;
          pos.setXYZ(i, x, y < ground && z < 0 ? -500 : z > 0 && y < 0.5 ? -500 : y, z);
        }
        pos.needsUpdate = true;
      }
    }
    // --- стрелки перемешивания
    {
      const on = range(P.conv ?? 0, p);
      W0.arrows.forEach((a) => {
        const top = wTop - 1.2;
        const bot = Math.min(S(a.x), wTop) + 1.4;
        a.me.visible = on > 0.01 && top - bot > 2;
        if (!a.me.visible) return;
        const k = (sec * 0.35 + a.ph) % 1;
        const y = a.down ? lerp(top, bot, k) : lerp(bot, top, k);
        a.me.position.set(a.x + (a.down ? 0 : 0), y, 0.5);
        const fade = Math.sin(Math.PI * k);
        a.me.scale.setScalar(0.4 + 0.6 * fade);
        (a.me.material as THREE.MeshBasicMaterial).opacity = 0.95 * on;
      });
    }
    // --- таблички
    for (const [k, sp] of Object.entries(W0.labels) as [string, THREE.Sprite][]) {
      const v = range(P['lb_' + k] ?? 0, p);
      sp.visible = v > 0.01;
      (sp.material as THREE.SpriteMaterial).opacity = v;
      if (k === 'top') sp.position.y = wTop - 1.4;
    }
    // --- плиты-призраки
    {
      const fall = range(P.ghost ?? 0, p);
      const gop = range(P.ghostOp ?? 1, p);
      W0.ghosts.forEach((g) => {
        const {x, d, rot} = g.userData as {x: number; d: number; rot: number};
        const k = clamp01((fall - d) / 0.5);
        g.visible = fall > d + 0.001 && gop > 0.01;
        const yb = S(x) + 0.55;
        g.position.set(x, lerp(-0.4, yb, k * k), -0.6);
        g.rotation.z = rot * k;
        (g.material as THREE.MeshStandardMaterial).opacity = 0.9 * gop;
      });
    }
    // --- путь до берега
    {
      const pv = range(P.path ?? 0, p);
      W0.path.forEach((me, i) => {
        me.visible = pv * W0.path.length > i + 0.05;
        me.position.set(me.userData.x as number, iTop + sT + 0.06, -3);
      });
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

export const OzeroScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = lifeIn ?? Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const bOut = 1 - clamp01((frame - (P.bannerEnd ?? 1) * life + 8) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 1, 8], near: 0.5, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <OzWorld P={P} dur={life} t0={scene.start ?? 0} />
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
