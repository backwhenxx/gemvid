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

// ===== Мир «Глубина промерзания» (поле, ели, две трубы в разрезе). Основа — «Озеро». Круглое озеро R=55 м, глубина 12 м, центр в (0,0,0); разрез по z=0 через середину.
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
  hook0: {pos: [1.2, 0.6, 7.2], look: [-0.5, -0.9, 0], fov: 50},
  hook1: {pos: [2.2, 0.3, 8.6], look: [0.3, -1.1, 0], fov: 50},
  summer: {pos: [-2.5, 0.5, 8.2], look: [-1.5, -1.1, 0], fov: 50},
  frost: {pos: [0.5, 1.0, 9.4], look: [0, -0.9, 0], fov: 50},
  shallow: {pos: [-1.4, -0.3, 3.8], look: [-2, -0.75, 0], fov: 50},
  burst: {pos: [-1.8, -0.5, 2.9], look: [-2.2, -0.78, 0], fov: 50},
  deep: {pos: [0.6, -1.4, 4.4], look: [0, -1.95, 0], fov: 50},
  line: {pos: [3.5, 0.5, 11], look: [2.5, -1.2, 0], fov: 50},
  taps: {pos: [11.5, 1.3, 6.5], look: [12.8, 0.5, -0.6], fov: 50},
  dacha: {pos: [7, 2.2, 15], look: [7, 0.0, -2], fov: 50},
  final: {pos: [-3, 4.5, 22], look: [4, 0, -5], fov: 50},
  cover: {pos: [0.8, 0.3, 7.6], look: [-0.6, -1.0, 0], fov: 50},
};

const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.frost : c);
// ---------- рельеф: ровное поле, вдали пологие холмы ----------
const Hgt = (x: number, z: number) => {
  const r = Math.hypot(x, z * 1.2);
  const bump = 0.35 * Math.sin(x * 0.09 + z * 0.06) * Math.sin(z * 0.13 + 1) * smooth(25, 60, r);
  return bump + 10 * smooth(120, 700, r) * (0.6 + 0.4 * Math.sin(x * 0.004 + 1));
};
const S = (x: number) => Hgt(x, 0);
const NL = 3;
const bound = (k: number, x: number) => (k === 0 ? S(x) : k === 1 ? S(x) - 0.6 : k === 2 ? S(x) - 2.6 : YB);
const XS: number[] = (() => {
  const s = new Set<number>();
  for (let x = -1500; x < -120; x += 25) s.add(x);
  for (let x = -120; x < -20; x += 1) s.add(x);
  for (let x = -20; x <= 20; x += 0.25) s.add(Math.round(x * 100) / 100);
  for (let x = 21; x <= 120; x += 1) s.add(x);
  for (let x = 145; x <= 1500; x += 25) s.add(x);
  return [...s].sort((a, b) => a - b);
})();
const ZS: number[] = (() => {
  const z: number[] = [];
  for (let v = 0; v > -60; v -= 1) z.push(v);
  for (let v = -60; v > -400; v -= 10) z.push(v);
  for (let v = -400; v >= -1500; v -= 50) z.push(v);
  return z;
})();
const PIPE_Y = [-0.75, -1.95];
const PIPE_R = 0.16;
const X0 = -40;
const TAPX = [12, 13.5];
const frostTex = () => {
  const [c, g] = cv(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(215,235,250,0.22)';
  g.fillRect(0, 0, 256, 256);
  const r = rng(77);
  for (let i = 0; i < 140; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const s = 3 + r() * 7;
    g.strokeStyle = `rgba(255,255,255,${0.5 + r() * 0.4})`;
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3 + r() * 0.3;
      g.beginPath();
      g.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s);
      g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      g.stroke();
    }
  }
  return tex(c);
};
const crackGeo = () => {
  // сетка трещин: зигзаги из узких полосок, в плоскости xy
  const r = rng(91);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    let x = 0;
    let y = 0;
    const a0 = (i / 7) * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const a = a0 + (r() - 0.5) * 0.9;
      const l = 0.05 + r() * 0.06;
      const nx = x + Math.cos(a) * l;
      const ny = y + Math.sin(a) * l * 0.6;
      const len = Math.hypot(nx - x, ny - y);
      const g = new THREE.PlaneGeometry(len, 0.012 * (1 - k * 0.2));
      g.rotateZ(Math.atan2(ny - y, nx - x));
      g.translate((x + nx) / 2, (y + ny) / 2, 0);
      parts.push(g);
      x = nx;
      y = ny;
    }
  }
  return mergeGeometries(parts);
};
// лента слоя с горизонтальными вырезами под трубы
const layerGeo = (k: number) => {
  const P: number[] = [];
  const U: number[] = [];
  const sc = 6;
  const quad = (x0: number, b0: number, t0: number, x1: number, b1: number, t1: number) => {
    if (t0 - b0 < 1e-4 && t1 - b1 < 1e-4) return;
    P.push(x0, b0, 0, x1, b1, 0, x1, t1, 0, x0, b0, 0, x1, t1, 0, x0, t0, 0);
    U.push(x0 / sc, b0 / sc, x1 / sc, b1 / sc, x1 / sc, t1 / sc, x0 / sc, b0 / sc, x1 / sc, t1 / sc, x0 / sc, t0 / sc);
  };
  for (let i = 0; i < XS.length - 1; i++) {
    const x0 = XS[i];
    const x1 = XS[i + 1];
    const xm = (x0 + x1) / 2;
    let segs: [number, number, number, number][] = [[bound(k + 1, x0), bound(k, x0), bound(k + 1, x1), bound(k, x1)]];
    PIPE_Y.forEach((py, j) => {
      if (xm < X0 || xm > TAPX[j]) return;
      const lo = py - PIPE_R;
      const hi = py + PIPE_R;
      const out: typeof segs = [];
      for (const [b0, t0, b1, t1] of segs) {
        // ниже трубы и выше трубы
        out.push([b0, Math.min(t0, lo), b1, Math.min(t1, lo)]);
        out.push([Math.max(b0, hi), t0, Math.max(b1, hi), t1]);
      }
      segs = out.filter(([b0, t0, b1, t1]) => t0 > b0 + 1e-4 || t1 > b1 + 1e-4);
    });
    for (const [b0, t0, b1, t1] of segs) quad(x0, b0, Math.max(b0, t0), x1, b1, Math.max(b1, t1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
};


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

const useWorld = () =>
  useMemo(() => {
    const r = rng(29);
    const dot = dotTex();
    const lay = [
      rockTex('#4b3a2b', ['rgba(0,0,0,0.12)', 'rgba(150,130,100,0.12)'], ['rgba(40,30,20,0.5)'], 101, 40, 0),
      rockTex('#bfa678', ['rgba(120,95,60,0.16)', 'rgba(255,245,220,0.15)'], ['rgba(140,125,105,0.5)', 'rgba(95,85,70,0.45)'], 102, 70, 2),
      rockTex('#8f6a52', ['rgba(60,35,25,0.13)', 'rgba(210,170,150,0.1)'], ['rgba(110,80,65,0.35)'], 103, 25, 8),
    ];
    const snow = snowTex();
    const m: Record<string, any> = {
      ground: new THREE.MeshStandardMaterial({map: groundTex(), roughness: 1, color: '#6f8a45'}),
      snowOver: new THREE.MeshStandardMaterial({map: snow, roughness: 0.9, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3}),
      snowBand: new THREE.MeshStandardMaterial({map: snow, roughness: 0.9}),
      layers: lay.map((t) => new THREE.MeshStandardMaterial({map: t, roughness: 0.95})),
      frost: new THREE.MeshBasicMaterial({map: frostTex(), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false}),
      pipe: new THREE.MeshStandardMaterial({color: '#4d5f6c', roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide}),
      pipeIn: new THREE.MeshStandardMaterial({color: '#2f3d47', roughness: 0.6, side: THREE.DoubleSide}),
      waterA: new THREE.MeshStandardMaterial({color: '#3f8fc4', roughness: 0.15, emissive: '#16405e', emissiveIntensity: 0.4, side: THREE.DoubleSide}),
      waterB: new THREE.MeshStandardMaterial({color: '#3f8fc4', roughness: 0.15, emissive: '#16405e', emissiveIntensity: 0.4, side: THREE.DoubleSide}),
      crack: new THREE.MeshBasicMaterial({color: '#141a1f', transparent: true, opacity: 0, depthTest: false, toneMapped: false}),
      shard: new THREE.PointsMaterial({color: '#f4fbff', size: 0.035, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05}),
      arrow: new THREE.MeshBasicMaterial({color: '#e2f4ff', toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, fog: false}),
      ruler: new THREE.MeshBasicMaterial({color: '#FFD54A', toneMapped: false, transparent: true, opacity: 0.95, depthTest: false}),
      spruce: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, flatShading: true}),
      cap: new THREE.MeshStandardMaterial({color: '#f3f6fa', roughness: 0.9, flatShading: true, transparent: true}),
      flake: new THREE.PointsMaterial({color: '#ffffff', size: 0.05, map: dot, transparent: true, depthWrite: false, alphaTest: 0.05}),
      tap: new THREE.MeshStandardMaterial({color: '#8b9399', roughness: 0.35, metalness: 0.7}),
      handle: new THREE.MeshStandardMaterial({color: '#b0412e', roughness: 0.5, metalness: 0.2}),
      stream: new THREE.MeshStandardMaterial({color: '#cfe8f7', roughness: 0.1, transparent: true, opacity: 0.8, depthWrite: false}),
      icicle: new THREE.MeshStandardMaterial({color: '#e6f4fb', roughness: 0.15, transparent: true, opacity: 0.9}),
    };
    const world = new THREE.Group();
    const tg = terrainGeo();
    world.add(new THREE.Mesh(tg, m.ground));
    const snowOver = new THREE.Mesh(tg, m.snowOver);
    snowOver.renderOrder = 1;
    world.add(snowOver);
    for (let k = 0; k < NL; k++) world.add(new THREE.Mesh(layerGeo(k), m.layers[k]));
    // ели (как в «Озере») + шапки снега
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
      for (let i = 0; i < 9000 && n < 520; i++) {
        const x = -220 + r() * 440;
        const z = -9 - Math.pow(r(), 0.8) * 300;
        if (Math.abs(x - 6) < 16 && z > -16) continue;
        const cl = 0.5 + 0.5 * Math.sin(x * 0.03) * Math.sin(z * 0.025 + 2);
        if (r() > cl + 0.15) continue;
        const h = 6 + r() * 8;
        const y0 = Hgt(x, z);
        const tr = new THREE.CylinderGeometry(0.15, 0.25, h * 0.3, 5);
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
          const cn = cap.toNonIndexed();
          cn.deleteAttribute('uv');
          caps.push(cn);
        }
        n++;
      }
      const g = mergeGeometries(parts);
      g.computeVertexNormals();
      world.add(new THREE.Mesh(g, m.spruce));
    }
    const capMesh = new THREE.Mesh(mergeGeometries(caps), m.cap);
    world.add(capMesh);
    for (let i = 0; i < 20; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(500 + (i % 12)), color: '#f6f3ee', transparent: true, opacity: 0.85, depthWrite: false, fog: false}));
      const sc = 450 + r() * 800;
      s.scale.set(sc, sc * 0.32, 1);
      const a = -Math.PI * 0.95 + r() * Math.PI * 0.9;
      const d = 1200 + r() * 400;
      s.position.set(Math.cos(a) * d, 200 + r() * 380, Math.sin(a) * d);
      world.add(s);
    }
    // трубы: задняя половина в разрезе + вода внутри
    const pipes = PIPE_Y.map((y, i) => {
      const x1 = TAPX[i];
      const len = x1 - X0;
      const og = new THREE.CylinderGeometry(PIPE_R, PIPE_R, len, 24, 1, true, Math.PI / 2, Math.PI);
      og.rotateZ(Math.PI / 2);
      og.translate((X0 + x1) / 2, y, 0);
      const outer = new THREE.Mesh(og, m.pipe);
      const wg = new THREE.CylinderGeometry(PIPE_R * 0.8, PIPE_R * 0.8, len, 24, 1, true, Math.PI / 2, Math.PI);
      wg.rotateZ(Math.PI / 2);
      wg.translate(0, 0, 0);
      const water = new THREE.Mesh(wg, i === 0 ? m.waterA : m.waterB);
      water.position.set((X0 + x1) / 2, y, 0);
      // торец трубы (срез стенки) — кольцо в плоскости среза, чуть впереди
      const rg = new THREE.RingGeometry(PIPE_R * 0.84, PIPE_R, 24, 1, Math.PI, Math.PI);
      world.add(outer);
      world.add(water);
      // стояк к крану за срезом
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 14), m.tap);
      riser.position.set(x1, 0.3, -0.6);
      world.add(riser);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), m.tap);
      head.position.set(x1, 0.95, -0.6);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), m.tap);
      spout.rotation.z = Math.PI / 2;
      spout.position.set(x1 + 0.17, 0.92, -0.6);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), m.handle);
      handle.position.set(x1, 1.04, -0.6);
      world.add(head, spout, handle);
      void rg;
      return {water, y, x1};
    });

    // ===== динамика
    const dyn = new THREE.Group();
    world.add(dyn);
    // мороз в земле: полоса от поверхности до фронта
    const FX = XS.filter((x) => x >= -60 && x <= 60);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FX.length * 2 * 3), 3));
    fg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(FX.length * 2 * 2), 2));
    {
      const I: number[] = [];
      for (let i = 0; i < FX.length - 1; i++) {
        const a = i * 2;
        I.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
      fg.setIndex(I);
    }
    const frost = new THREE.Mesh(fg, m.frost);
    frost.renderOrder = 3;
    frost.frustumCulled = false;
    dyn.add(frost);
    // снег на срезе (бортик)
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FX.length * 2 * 3), 3));
    sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(FX.length * 2 * 2), 2));
    sg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(FX.length * 2 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    sg.setIndex(fg.index!.clone());
    const snowBand = new THREE.Mesh(sg, m.snowBand);
    snowBand.frustumCulled = false;
    dyn.add(snowBand);
    // трещина и осколки льда в верхней трубе
    const crack = new THREE.Mesh(crackGeo(), m.crack);
    crack.position.set(-2, PIPE_Y[0], 0.05);
    crack.scale.setScalar(2.2);
    crack.renderOrder = 12;
    dyn.add(crack);
    const NS = 140;
    const shG = new THREE.BufferGeometry();
    shG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    const shards = new THREE.Points(shG, m.shard);
    shards.frustumCulled = false;
    shards.renderOrder = 11;
    dyn.add(shards);
    // стрелки течения в трубах
    const arrows = PIPE_Y.map(() =>
      Array.from({length: 14}, () => {
        const a = new THREE.Mesh(flatArrow(0.32, 0.07, 0.17, 0.12), m.arrow);
        a.renderOrder = 20;
        dyn.add(a);
        return a;
      }),
    );
    // линейка глубины промерзания
    const ruler = new THREE.Group();
    {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1), m.ruler);
      ruler.add(bar);
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.06), m.ruler);
      ruler.add(tick);
      ruler.children.forEach((c) => (c.renderOrder = 22));
    }
    dyn.add(ruler);
    // струи из кранов и сосулька на верхнем
    const streams = TAPX.map((x) => {
      const g = new THREE.CylinderGeometry(0.018, 0.026, 1, 8, 1, true);
      g.translate(0, -0.5, 0);
      const s = new THREE.Mesh(g, m.stream);
      s.position.set(x + 0.27, 0.9, -0.6);
      dyn.add(s);
      return s;
    });
    const icG = new THREE.ConeGeometry(0.035, 1, 8);
    icG.rotateX(Math.PI);
    icG.translate(0, -0.5, 0);
    const icicle = new THREE.Mesh(icG, m.icicle);
    icicle.position.set(TAPX[0] + 0.27, 0.91, -0.6);
    dyn.add(icicle);
    // снегопад
    const NF = 1400;
    const flG = new THREE.BufferGeometry();
    flG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NF * 3), 3));
    const flakes = new THREE.Points(flG, m.flake);
    flakes.frustumCulled = false;
    flakes.renderOrder = 9;
    dyn.add(flakes);
    // таблички
    const label = (txt: string, col: string, s: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: labelTex(txt, col), transparent: true, depthTest: false, fog: false, toneMapped: false}));
      sp.scale.set(s * 2, s, 1);
      sp.renderOrder = 30;
      dyn.add(sp);
      return sp;
    };
    const labels: Record<string, THREE.Sprite> = {
      air: label('−20°', '#ffffff', 0.6),
      zero: label('0°', '#e8f7ff', 0.55),
      plus: label('+2°', '#ffcf9a', 0.55),
      summer: label('+18°', '#ffd27a', 0.55),
    };
    return {m, world, pipes, frost, FX, snowBand, crack, shards, arrows, ruler, streams, icicle, flakes, labels, capMesh};
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

const SUMMER = new THREE.Color('#6f8a45');
const WINTERG = new THREE.Color('#9aa08a');

const PromWorld: React.FC<{P: Record<string, any>; dur: number; t0: number}> = ({P, dur, t0}) => {
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
    const cs = (P.cam ?? ['frost', 'frost']).map((c: string | Cam) => cam(c));
    const cp = camBetween(cs[0], cs[cs.length - 1], easeInOut(p));
    camera.position.copy(cp.pos);
    camera.quaternion.copy(cp.q);
    camera.userData.focus = cp.dist;
    const near = Math.min(3, Math.max(0.2, cp.dist * 0.04));
    const pc = camera as THREE.PerspectiveCamera;
    if (pc.fov !== cp.fov || pc.far !== FAR || Math.abs(pc.near - near) > 1e-4) {
      pc.fov = cp.fov;
      pc.near = near;
      pc.far = FAR;
      pc.updateProjectionMatrix();
    }
    SL.sky.position.copy(camera.position);

    // --- сезон и снег
    const win = range(P.win ?? 1, p);
    (W0.m.ground as THREE.MeshStandardMaterial).color.copy(SUMMER).lerp(WINTERG, win);
    (W0.m.snowOver as THREE.MeshStandardMaterial).opacity = win;
    W0.capMesh.visible = win > 0.02;
    (W0.m.cap as THREE.MeshStandardMaterial).opacity = win;
    const sT = 0.14 * win;
    {
      const pa = W0.snowBand.geometry.attributes.position as THREE.BufferAttribute;
      const ua = W0.snowBand.geometry.attributes.uv as THREE.BufferAttribute;
      W0.FX.forEach((x, i) => {
        const s = S(x);
        pa.setXYZ(i * 2, x, s, 0);
        pa.setXYZ(i * 2 + 1, x, s + sT + 0.001, 0);
        ua.setXY(i * 2, x / 3, s / 3);
        ua.setXY(i * 2 + 1, x / 3, (s + sT) / 3);
      });
      pa.needsUpdate = true;
      ua.needsUpdate = true;
      W0.snowBand.visible = win > 0.02;
    }
    // --- фронт мороза
    const F = range(P.frost ?? 1.3, p);
    {
      const pa = W0.frost.geometry.attributes.position as THREE.BufferAttribute;
      const ua = W0.frost.geometry.attributes.uv as THREE.BufferAttribute;
      W0.FX.forEach((x, i) => {
        const s = S(x);
        const d = F * (1 + 0.07 * Math.sin(x * 1.7) + 0.05 * Math.sin(x * 4.3 + 1));
        pa.setXYZ(i * 2, x, s - d, 0.06);
        pa.setXYZ(i * 2 + 1, x, s, 0.06);
        ua.setXY(i * 2, x / 1.5, (s - d) / 1.5);
        ua.setXY(i * 2 + 1, x / 1.5, s / 1.5);
      });
      pa.needsUpdate = true;
      ua.needsUpdate = true;
      W0.frost.visible = F > 0.02;
    }
    // --- вода в трубах: лёд
    const frz = [range(P.frzA ?? 1, p), 0];
    const flow = [range(P.flowA ?? 0, p), range(P.flowB ?? 1, p)];
    const wA = W0.m.waterA as THREE.MeshStandardMaterial;
    wA.color.set('#3f8fc4').lerp(new THREE.Color('#ffffff'), frz[0]);
    wA.emissive.set('#16405e').lerp(new THREE.Color('#4c7f99'), frz[0]);
    // лёд распирает: вода-лёд чуть толще (до стенки)
    const ex = 1 + 0.12 * frz[0];
    W0.pipes[0].water.scale.set(1, ex, ex);
    // --- трещина и осколки
    const br = range(P.burst ?? 1, p);
    (W0.m.crack as THREE.MeshBasicMaterial).opacity = clamp01(br * 3);
    W0.crack.scale.setScalar(0.35 + 0.75 * br);
    {
      const pos = W0.shards.geometry.attributes.position as THREE.BufferAttribute;
      const rr = rng(57);
      W0.shards.visible = br > 0.01;
      for (let i = 0; i < pos.count; i++) {
        const a = rr() * Math.PI * 2;
        const d = (0.12 + rr() * 0.35) * clamp01(br * 1.4);
        pos.setXYZ(i, -2 + Math.cos(a) * d * 1.3, PIPE_Y[0] + Math.sin(a) * d * 0.7, 0.08);
      }
      pos.needsUpdate = true;
    }
    // --- стрелки течения
    W0.arrows.forEach((row, j) => {
      row.forEach((a, i) => {
        const s = (i * 1.6 + sec * 0.55) % (row.length * 1.6);
        const x = -10 + s;
        const f = flow[j];
        a.visible = f > 0.01 && x < TAPX[j] - 0.4;
        a.position.set(x, PIPE_Y[j], 0.25);
        a.scale.setScalar(0.4 + 0.6 * f);
        (a.material as THREE.MeshBasicMaterial).opacity = 0.95;
      });
    });
    // --- краны: струи и сосулька
    W0.streams.forEach((s, j) => {
      const f = flow[j];
      s.visible = f > 0.02;
      const h = 0.9 - Math.max(0, Hgt(TAPX[j] + 0.27, -0.6));
      s.scale.set(f, Math.max(0.01, h), f);
    });
    const ic = range(P.icicle ?? 0, p);
    W0.icicle.visible = ic > 0.01;
    W0.icicle.scale.set(1, Math.max(0.01, 0.28 * ic), 1);
    // --- линейка
    const rl = range(P.ruler ?? 0, p);
    W0.ruler.visible = rl > 0.01;
    {
      const len = F * rl;
      const [bar, tick] = W0.ruler.children;
      bar.scale.set(1, Math.max(0.01, len), 1);
      bar.position.set(2.5, -len / 2, 0.3);
      tick.position.set(2.5, -len, 0.3);
    }
    // --- таблички
    const lp: Record<string, [number, number]> = {air: [-2.6, 1.1], zero: [-0.3, -F - 0.22], plus: [1.6, PIPE_Y[1] - 0.35], summer: [1.4, 0.55]};
    for (const [k, sp] of Object.entries(W0.labels) as [string, THREE.Sprite][]) {
      const v = range(P['lb_' + k] ?? 0, p);
      sp.visible = v > 0.01;
      (sp.material as THREE.SpriteMaterial).opacity = v;
      sp.position.set(lp[k][0], lp[k][1], 0.6);
    }
    // --- снегопад вокруг камеры (сетка 30 м)
    {
      const on = range(P.snowfall ?? 0, p);
      W0.flakes.visible = on > 0.01;
      (W0.m.flake as THREE.PointsMaterial).opacity = on;
      if (W0.flakes.visible) {
        const pos = W0.flakes.geometry.attributes.position as THREE.BufferAttribute;
        const rr = rng(31);
        const c = camera.position;
        const B = 24;
        for (let i = 0; i < pos.count; i++) {
          const bx = rr() * B;
          const bz = rr() * B;
          const hh = 10;
          const yy = hh - ((sec * (0.7 + rr() * 0.5) + rr() * hh) % hh);
          let x = Math.floor(c.x / B) * B + bx + Math.sin(sec * 0.6 + i) * 0.15;
          let z = Math.floor(c.z / B) * B + bz;
          if (x - c.x > B / 2) x -= B;
          if (z - c.z > B / 2) z -= B;
          const y = c.y - 5 + yy;
          const hide = z > 0 ? y < 0.3 : y < Hgt(x, z) + sT;
          pos.setXYZ(i, x, hide ? -500 : y, z);
        }
        pos.needsUpdate = true;
      }
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

export const PromScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = lifeIn ?? Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const bOut = 1 - clamp01((frame - (P.bannerEnd ?? 1) * life + 8) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 1, 8], near: 0.5, far: FAR}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <PromWorld P={P} dur={life} t0={scene.start ?? 0} />
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
