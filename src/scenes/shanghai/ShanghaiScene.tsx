import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {box} from '../trench/parts';
import {cloudTexture, waterTexture} from '../dam/textures';
import {LOOKS, LookGrade, LookLights, followSky, shadowAll} from '../../lib/look';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «Шанхай»: разрез земли по плоскости z=0 (к зрителю). 1 единица = 2 м.
// Слева (x<-20) старый район Пуси с колодцами — он проседает. Река Хуанпу x∈[-20,-6] уходит к горизонту.
// Справа Пудун: Шанхайская башня (x=20, z=-18) на сваях и плите, за ней Цзинь Мао, SWFC, «Жемчужина».
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const SMAX = 1.3; // 2,6 м просадки
const RX0 = -20;
const RX1 = -6;
const TOWER: [number, number] = [20, -18];
const TH = 316; // 632 м
const TR = 17.5;
const MAT_Y0 = -4.5;
const MAT_Y1 = -1.6;
const MAT_X0 = -4;
const MAT_X1 = 44;
const PILE_LEN = 27.5; // 55 м
const WELLS = [-72, -54, -37];
const WELL_TOP = 0.9;
const AQ0 = -21; // водоносный песок
const AQ1 = -15;

const wDist = (x: number) => (x <= -28 ? 1 : x >= RX0 ? 0 : (RX0 - x) / 8); // доля просадки
const wave = (x: number, a: number, s: number) => a * Math.sin(x * 0.13 + s) + a * 0.6 * Math.sin(x * 0.31 + s * 2);
const topY = (x: number, S: number) => {
  if (x <= RX0) return -S * wDist(x);
  if (x >= RX1) return 0;
  // русло с откосами
  const bank = Math.min(x - RX0, RX1 - x);
  return bank < 2.5 ? lerp(0, -5, bank / 2.5) : -5;
};
const fillBot = (x: number, S: number) => (x > RX0 + 0.5 && x < RX1 - 0.5 ? topY(x, S) : topY(x, S) - 1.6);
const clayBot = (x: number) => AQ1 + wave(x, 0.35, 1);
const sandBot = (x: number) => AQ0 + wave(x, 0.3, 2);
const stiffBot = (x: number) => -24 + wave(x, 0.25, 3);
const BOTTOM = -46;

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  skyline: {pos: [30, 30, 150], look: [20, 70, -80], fov: 50},
  clay: {pos: [-12, -8, 26], look: [-12, -9.5, 0]},
  tower: {pos: [110, 120, 330], look: [20, 150, -18], fov: 50},
  district: {pos: [-52, -3, 52], look: [-52, -7, -6]},
  sinkB: {pos: [-42, -2, 40], look: [-46, -6, -4]},
  recharge: {pos: [-58, -6, 40], look: [-56, -10, -4]},
  cityMid: {pos: [-10, 22, 120], look: [-12, -2, -30]},
  piles: {pos: [22, -10, 78], look: [20, -14, -4]},
  tips: {pos: [30, -24, 32], look: [26, -27, -2]},
  mat: {pos: [12, -2, 30], look: [14, -3.5, -2]},
  final: {pos: [-60, 70, 300], look: [0, 40, -300], fov: 50},
  final2: {pos: [-40, 80, 270], look: [0, 52, -300], fov: 50},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.skyline : c);
const range = (v: any, p: number, dur = 0.6, delay = 0): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  return lerp(v[0], v[1], easeInOut(clamp01((p - delay) / dur)));
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
const fillTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#6e4b33';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 2600, ['rgba(40,24,14,0.35)', 'rgba(150,110,80,0.3)'], 3, [1, 3]);
  speckle(g, 512, 512, 90, ['#8f4a33', '#7b7066', '#9a8f80', '#6b3a28'], 4, [4, 9]); // обломки кирпича и камня
  return tex(c, 1 / 8, 1 / 8);
};
const clayTex = () => {
  const [c, g] = cv(512, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#6f7068');
  gr.addColorStop(1, '#5f625b');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  const r = rng(7);
  // слоистость
  for (let i = 0; i < 14; i++) {
    let y = r() * 512;
    g.strokeStyle = r() > 0.5 ? 'rgba(40,42,38,0.18)' : 'rgba(150,152,140,0.14)';
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    g.moveTo(-5, y);
    for (let x = 0; x <= 520; x += 30) {
      y += (r() - 0.5) * 4;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // мокрые блики — «каша»
  for (let i = 0; i < 220; i++) {
    g.strokeStyle = `rgba(225,228,215,${0.15 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 1.5;
    const x = r() * 512;
    const y = r() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 8, y - 2, x + 14 + r() * 20, y + (r() - 0.5) * 3);
    g.stroke();
  }
  speckle(g, 512, 512, 1500, ['rgba(40,36,28,0.25)', 'rgba(180,170,140,0.18)'], 8, [1, 2.5]);
  return tex(c, 1 / 9, 1 / 9);
};
const sandTex = (base: string, seed: number, pebbles = 0, water = 0) => {
  const [c, g] = cv(512, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 9000, ['rgba(255,235,190,0.35)', 'rgba(90,60,30,0.3)', 'rgba(160,120,70,0.35)'], seed, [0.8, 1.8]);
  if (pebbles) speckle(g, 512, 512, pebbles, ['#7d7468', '#9a8f80', '#5f574d', '#b4a690'], seed + 1, [3, 8]);
  if (water) speckle(g, 512, 512, water, ['rgba(120,185,225,0.55)', 'rgba(170,215,240,0.5)'], seed + 2, [1.5, 3.5]);
  return tex(c, 1 / 8, 1 / 8);
};
const groundTex = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#8b8378';
  g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 3000, ['rgba(255,245,225,0.12)', 'rgba(40,35,30,0.12)'], 9, [1, 2]);
  g.strokeStyle = 'rgba(60,55,48,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  return tex(c, 1 / 16, 1 / 16);
};
const mudTex = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#4f4a3d';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 1200, ['rgba(20,18,12,0.3)', 'rgba(120,110,85,0.25)'], 12, [1, 3]);
  return tex(c, 1 / 6, 1 / 6);
};
// Фасад: сетка окон; lit — светящиеся окна для emissiveMap
const facadeTex = (kind: 'glass' | 'stone' | 'dark' | 'brick', seed: number) => {
  const W = 128;
  const H = 256;
  const [c, g] = cv(W, H);
  const [lc, lg] = cv(W, H);
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, W, H);
  const base = {glass: '#6f8494', stone: '#b9a98f', dark: '#4a5058', brick: '#6f6d68'}[kind];
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const r = rng(seed);
  const cols = 8;
  const rows = 16;
  const cw = W / cols;
  const ch = H / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw;
      const y = j * ch;
      if (kind === 'glass') {
        const gr = g.createLinearGradient(x, y, x + cw, y + ch);
        gr.addColorStop(0, '#8fa7b6');
        gr.addColorStop(1, '#5b6f7f');
        g.fillStyle = gr;
        g.fillRect(x + 1, y + 1, cw - 2, ch - 3);
      } else {
        g.fillStyle = kind === 'stone' ? '#3e4b55' : kind === 'brick' ? '#2f3438' : '#2a3038';
        g.fillRect(x + cw * 0.22, y + ch * 0.2, cw * 0.56, ch * 0.55);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x + cw * 0.22, y + ch * 0.2, cw * 0.56, ch * 0.12);
      }
      if (r() < (kind === 'brick' ? 0.12 : 0.07)) {
        lg.fillStyle = r() > 0.5 ? '#ffcf8a' : '#ffe0a8';
        if (kind === 'glass') lg.fillRect(x + 1, y + 1, cw - 2, ch - 3);
        else lg.fillRect(x + cw * 0.22, y + ch * 0.2, cw * 0.56, ch * 0.55);
      }
    }
  }
  if (kind === 'brick') {
    g.strokeStyle = 'rgba(40,38,36,0.35)';
    g.lineWidth = 1;
    for (let y = 0; y < H; y += 4) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
  }
  // межэтажные пояса
  g.fillStyle = 'rgba(30,30,35,0.25)';
  for (let j = 0; j < rows; j++) g.fillRect(0, j * ch + ch - 2, W, 2);
  return {map: tex(c), lit: tex(lc)};
};
// Стекло башни: панели и межэтажные полосы
const towerTex = () => {
  const [c, g] = cv(256, 512);
  const [lc, lg] = cv(256, 512);
  lg.fillStyle = '#000';
  lg.fillRect(0, 0, 256, 512);
  const r = rng(77);
  for (let j = 0; j < 32; j++) {
    for (let i = 0; i < 16; i++) {
      const x = i * 16;
      const y = j * 16;
      const v = 0.85 + r() * 0.15;
      g.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(176 * v)},${Math.round(192 * v)})`;
      g.fillRect(x, y, 16, 16);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 1, y + 1, 7, 13);
      if (r() < 0.05) {
        lg.fillStyle = '#ffd59a';
        lg.fillRect(x + 1, y + 2, 14, 11);
      }
    }
    g.fillStyle = 'rgba(40,50,60,0.55)';
    g.fillRect(0, j * 16 + 14, 256, 2);
  }
  g.fillStyle = 'rgba(40,50,60,0.25)';
  for (let i = 0; i < 16; i++) g.fillRect(i * 16, 0, 1, 512);
  return {map: tex(c), lit: tex(lc)};
};

// UV в мировых единицах (для коробок с окнами)
const worldUV = (g: THREE.BufferGeometry) => {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const [u, v] = ny > 0.5 ? [pos.getX(i), pos.getZ(i)] : nx > 0.5 ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};

// ---------- геометрия ----------
const xsamples = (() => {
  const xs: number[] = [];
  for (let x = -2000; x < -200; x += 40) xs.push(x);
  for (let x = -200; x <= 200; x += 1) xs.push(x);
  for (let x = 240; x <= 2000; x += 40) xs.push(x);
  [-28, RX0, RX0 + 0.5, RX1 - 0.5, RX1].forEach((v) => xs.includes(v) || xs.push(v));
  return xs.sort((a, b) => a - b);
})();
// Слой разреза между двумя кривыми, вытянутый назад на depth
const layer = (top: (x: number) => number, bot: (x: number) => number, depth: number) => {
  const s = new THREE.Shape();
  s.moveTo(xsamples[0], bot(xsamples[0]));
  xsamples.forEach((x) => s.lineTo(x, bot(x)));
  for (let i = xsamples.length - 1; i >= 0; i--) {
    const x = xsamples[i];
    s.lineTo(x, Math.max(top(x), bot(x) + 0.001));
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: false, curveSegments: 1});
  g.translate(0, 0, -depth);
  return g;
};
// Половинка цилиндра «рельефом» на плоскости среза (круглой стороной к зрителю)
const halfCyl = (r: number, y0: number, y1: number, x: number) => {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 16, 1, true, -Math.PI / 2, Math.PI);
  g.translate(x, (y0 + y1) / 2, 0.01);
  return g;
};
// Шанхайская башня: скругленный треугольник, закрученный на 120°, сужается кверху
const towerGeo = () => {
  const LV = 110;
  const SEG = 64;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= LV; j++) {
    const h = (j / LV) * TH * 0.965;
    const f = h / TH;
    const R = TR * (1 - 0.45 * Math.pow(f, 1.15));
    const ph = f * ((Math.PI * 2) / 3);
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      let r = R * (1 + 0.09 * Math.cos(3 * (a - ph)));
      const dn = Math.atan2(Math.sin(a - ph - Math.PI / 3), Math.cos(a - ph - Math.PI / 3));
      r *= 1 - 0.06 * Math.exp(-(dn * dn) / 0.004); // спиральная «выемка» фасада
      pos.push(Math.cos(a) * r, h, Math.sin(a) * r);
      uv.push((i / SEG) * 6, h / 64);
    }
  }
  for (let j = 0; j < LV; j++)
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i;
      const b = a + SEG + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

// ---------- мир ----------
const useWorld = () =>
  useMemo(() => {
    const T = towerTex();
    const fac = {
      glass: facadeTex('glass', 1),
      stone: facadeTex('stone', 2),
      dark: facadeTex('dark', 3),
      brick: facadeTex('brick', 4),
    };
    const facMat = (k: keyof typeof fac, rx: number, ry: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const map = fac[k].map.clone();
      const lit = fac[k].lit.clone();
      [map, lit].forEach((t) => {
        t.needsUpdate = true;
        t.repeat.set(rx, ry);
      });
      return new THREE.MeshStandardMaterial({map, emissiveMap: lit, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6, ...extra});
    };
    const m: Record<string, any> = {
      fill: new THREE.MeshStandardMaterial({map: fillTex(), roughness: 1}),
      ground: new THREE.MeshStandardMaterial({map: groundTex(), roughness: 0.95}),
      clay: new THREE.MeshStandardMaterial({map: clayTex(), roughness: 0.38, metalness: 0.05}),
      mud: new THREE.MeshStandardMaterial({map: mudTex(), roughness: 0.9}),
      sand: new THREE.MeshStandardMaterial({map: sandTex('#c39a5f', 21, 0, 900), roughness: 0.95}),
      stiff: new THREE.MeshStandardMaterial({map: sandTex('#8b6748', 31, 60), roughness: 1}),
      dense: new THREE.MeshStandardMaterial({map: sandTex('#b08f5e', 41, 700), roughness: 1}),
      water: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#4f7a80', transparent: true, opacity: 0.93, roughness: 0.06, metalness: 0.25}),
      tower: new THREE.MeshStandardMaterial({map: T.map, emissiveMap: T.lit, emissive: '#ffffff', emissiveIntensity: 0.6, color: '#d9e4ea', metalness: 0.55, roughness: 0.16}),
      crown: new THREE.MeshStandardMaterial({color: '#8d9aa3', metalness: 0.7, roughness: 0.3}),
      glassB: facMat('glass', 1 / 16, 1 / 32, {metalness: 0.45, roughness: 0.2}),
      stoneB: facMat('stone', 1 / 16, 1 / 32),
      darkB: facMat('dark', 1 / 16, 1 / 32, {metalness: 0.3, roughness: 0.35}),
      brickH: facMat('brick', 1 / 16, 1 / 32),
      roofTile: new THREE.MeshStandardMaterial({color: '#3d3b3a', roughness: 0.8}),
      roofFlat: new THREE.MeshStandardMaterial({color: '#5d5a56', roughness: 0.9}),
      jinmao: new THREE.MeshStandardMaterial({color: '#5e6266', metalness: 0.7, roughness: 0.35}),
      swfc: new THREE.MeshStandardMaterial({color: '#9fb2bd', metalness: 0.6, roughness: 0.15}),
      pearl: new THREE.MeshStandardMaterial({color: '#6e3a3a', metalness: 0.6, roughness: 0.28}),
      pearlLeg: new THREE.MeshStandardMaterial({color: '#cfc8bd', roughness: 0.6}),
      concrete: new THREE.MeshStandardMaterial({map: sandTex('#9c968c', 51, 400), color: '#d8d4cc', roughness: 0.9}),
      wet: new THREE.MeshStandardMaterial({color: '#6e6a63', roughness: 0.3}),
      steel: new THREE.MeshStandardMaterial({color: '#8c949a', metalness: 0.8, roughness: 0.35}),
      rust: new THREE.MeshStandardMaterial({color: '#7a5a44', metalness: 0.4, roughness: 0.6}),
      pump: new THREE.MeshStandardMaterial({color: '#4f6b5a', metalness: 0.3, roughness: 0.5}),
      pile: new THREE.MeshStandardMaterial({color: '#9d9890', roughness: 0.85}),
      drop: new THREE.MeshBasicMaterial({color: '#8fd0f2', fog: false}),
      arrow: new THREE.MeshBasicMaterial({color: '#fff3dc', transparent: true, fog: false}),
      leaf: new THREE.MeshStandardMaterial({color: '#4e6e34', roughness: 0.9}),
      trunk: new THREE.MeshStandardMaterial({color: '#5a4030', roughness: 1}),
      chimney: new THREE.MeshStandardMaterial({color: '#7e4a36', roughness: 0.9}),
    };

    const world = new THREE.Group(); // неподвижное
    const district = new THREE.Group(); // проседает вместе с землёй Пуси

    // --- Шанхайская башня
    const tw = new THREE.Group();
    tw.add(new THREE.Mesh(towerGeo(), m.tower));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(TR * 0.5, TR * 0.56, TH * 0.035, 24, 1, true), m.crown);
    crown.position.y = TH * 0.965 + TH * 0.0175;
    tw.add(crown);
    tw.position.set(TOWER[0], 0, TOWER[1]);
    world.add(tw);

    // --- Цзинь Мао: ступенчатая «пагода» со шпилем
    const jm = new THREE.Group();
    let y = 0;
    let hw = 12;
    for (let i = 0; i < 12; i++) {
      const h = i === 0 ? 95 : Math.max(4, 22 - i * 1.6);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(hw * 0.97 * Math.SQRT2, hw * Math.SQRT2, h, 8), m.jinmao);
      b.position.y = y + h / 2;
      b.rotation.y = Math.PI / 8;
      jm.add(b);
      y += h;
      hw *= 0.86;
    }
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.4, 22, 8), m.crown);
    sp.position.y = y + 11;
    jm.add(sp);
    jm.position.set(64, 0, -64);
    world.add(jm);

    // --- Всемирный финансовый центр (SWFC): сужающаяся призма с «окном» наверху
    const sw = new THREE.Group();
    const SWH = 246;
    const swBody = new THREE.Mesh(new THREE.CylinderGeometry(9 * Math.SQRT2, 15 * Math.SQRT2, SWH * 0.86, 4), m.swfc);
    swBody.rotation.y = Math.PI / 4;
    swBody.position.y = (SWH * 0.86) / 2;
    sw.add(swBody);
    [-1, 1].forEach((s) => {
      const leg = new THREE.Mesh(box(-2.6, 2.6, 0, SWH * 0.12, -8, 8), m.swfc);
      leg.position.set(s * 6.2, SWH * 0.86, 0);
      leg.scale.set(1, 1, 0.9);
      sw.add(leg);
    });
    sw.add(new THREE.Mesh(box(-8.8, 8.8, SWH * 0.97, SWH, -7.2, 7.2), m.swfc));
    sw.position.set(100, 0, -86);
    sw.rotation.y = -0.35;
    world.add(sw);

    // --- «Восточная жемчужина»: опоры и шары
    const pe = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 120, 12), m.pearlLeg);
      leg.position.set(Math.cos(a) * 6, 60, Math.sin(a) * 6);
      pe.add(leg);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 190, 12), m.pearlLeg);
    shaft.position.y = 95;
    pe.add(shaft);
    [
      [12.5, 60],
      [7.5, 142],
      [3.5, 180],
    ].forEach(([r, yy]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m.pearl);
      s.position.y = yy;
      pe.add(s);
    });
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 45, 8), m.crown);
    ant.position.y = 212;
    pe.add(ant);
    pe.position.set(4, 0, -95);
    world.add(pe);

    // --- город: участки по сетке, без пересечений с ориентирами
    const r = rng(19);
    const keep: [number, number, number][] = [
      [TOWER[0], TOWER[1], TR + 8],
      [64, -64, 20],
      [100, -86, 24],
      [4, -95, 18],
    ];
    const free = (x: number, z: number, rad: number) => keep.every(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) > kr + rad + 4);
    const mats = [m.glassB, m.stoneB, m.darkB];
    // Пудун: высотки, ниже с удалением
    for (let x = 10; x < 520; x += 30) {
      for (let z = x > 48 ? -14 : -50; z > -900; z -= 34) {
        if (r() < 0.25) continue;
        const cx = x + (r() - 0.5) * 6;
        const cz = z + (r() - 0.5) * 6;
        const hx = 5 + r() * 5;
        const hz = 5 + r() * 5;
        if (!free(cx, cz, Math.max(hx, hz) * 1.42) || cx - hx < -3) continue;
        const far = Math.min(1, Math.hypot(cx - 40, cz + 60) / 700);
        const h = (20 + r() * 90) * (1 - far * 0.55);
        const mt = mats[Math.floor(r() * 3)];
        const b = new THREE.Mesh(worldUV(box(cx - hx, cx + hx, 0, h, cz - hz, cz + hz)), mt);
        world.add(b);
        if (r() < 0.45) {
          const h2 = h * (0.15 + r() * 0.25);
          world.add(new THREE.Mesh(worldUV(box(cx - hx * 0.65, cx + hx * 0.65, h, h + h2, cz - hz * 0.65, cz + hz * 0.65)), mt));
        }
        keep.push([cx, cz, Math.max(hx, hz) * 1.42]);
      }
    }
    // Пуси за кадром ближнего района: дома ниже, кирпич и камень
    for (let x = -60; x > -700; x -= 22) {
      for (let z = -48; z > -900; z -= 26) {
        if (r() < 0.2) continue;
        const cx = x + (r() - 0.5) * 5;
        const cz = z + (r() - 0.5) * 5;
        if (cx > -124 && cx < -80 && cz > -64 && cz < -24) continue; // место фабрики
        const hx = 4 + r() * 4;
        const hz = 4 + r() * 4;
        const h = 6 + r() * (r() < 0.15 ? 60 : 18);
        const mt = r() < 0.5 ? m.stoneB : m.brickH;
        district.add(new THREE.Mesh(worldUV(box(cx - hx, cx + hx, 0, h, cz - hz, cz + hz)), mt));
      }
    }
    // Старый район у разреза: ряды двухэтажных домов шикумэнь с черепичными крышами
    const gable = (x0: number, x1: number, y0: number, z0: number, z1: number) => {
      const s = new THREE.Shape();
      const zc = (z0 + z1) / 2;
      s.moveTo(z0 - 0.4, 0);
      s.lineTo(z1 + 0.4, 0);
      s.lineTo(zc, 2.2);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, {depth: x1 - x0 + 0.4, bevelEnabled: false});
      g.rotateY(-Math.PI / 2);
      g.translate(x1 + 0.2, y0, 0);
      return g;
    };
    for (let row = 0; row < 3; row++) {
      const z1 = -4 - row * 11;
      const z0 = z1 - 7;
      for (let x = -88; x < -33; x += 5.2) {
        if (WELLS.some((w) => Math.abs(w - x - 2.4) < 3.2) && row === 0) continue;
        const h = 4.2 + (r() < 0.3 ? 2.2 : 0);
        district.add(new THREE.Mesh(worldUV(box(x, x + 4.8, 0, h, z0, z1)), m.brickH));
        district.add(new THREE.Mesh(gable(x, x + 4.8, h, z0, z1), m.roofTile));
      }
    }
    // фабрика с трубой
    district.add(new THREE.Mesh(worldUV(box(-112, -92, 0, 9, -52, -36)), m.brickH));
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, 34, 16), m.chimney);
    ch.position.set(-96, 17, -40);
    district.add(ch);
    // деревья на набережных
    const tree = (g: THREE.Group, x: number, z: number, s: number) => {
      const t = new THREE.Group();
      const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2, 8), m.trunk);
      tk.position.y = 1;
      t.add(tk);
      [[0, 2.5, 0, 1.15], [-0.6, 2.1, 0.2, 0.8], [0.6, 2.2, -0.1, 0.85]].forEach(([a, b, c, rr]) => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(rr, 12, 8), m.leaf);
        l.position.set(a, b, c);
        t.add(l);
      });
      t.position.set(x, 0, z);
      t.scale.setScalar(s);
      g.add(t);
    };
    for (let z = -3; z > -260; z -= 7) {
      tree(district, -30 + (r() - 0.5), z - 14, 1.1 + r() * 0.3);
      tree(world, -3 + (r() - 0.5), z - 3, 1.1 + r() * 0.3);
    }
    // вода реки до горизонта
    const water = new THREE.Mesh(box(RX0 + 0.3, RX1 - 0.3, -5, -0.35, -2000, 0.04), m.water);
    world.add(water);
    // облака у горизонта, подсвеченные закатом
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(500 + i), color: '#ffd4b0', transparent: true, opacity: 0.85, depthWrite: false, fog: false}));
      s.scale.set(260 + r() * 160, 70 + r() * 30, 1);
      s.position.set(-900 + i * 230 + r() * 80, 160 + r() * 150, -1500);
      world.add(s);
      clouds.push(s);
    }
    // дымок над фабрикой
    const smoke: THREE.Sprite[] = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(700 + i), color: '#d9c7b4', transparent: true, opacity: 0.35, depthWrite: false}));
      district.add(s);
      smoke.push(s);
    }
    shadowAll(world);
    shadowAll(district);
    water.castShadow = false;
    return {m, world, district, clouds, smoke, cache: new Map<string, THREE.Object3D>()};
  }, []);

// ---------- сцена ----------
const ShanghaiWorld: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
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
    scene.add(W0.world, W0.district, dyn);
    return () => {
      scene.remove(W0.world, W0.district, dyn);
    };
  }, []);

  useLayoutEffect(() => {
    dyn.children.slice().forEach((c: any) => {
      dyn.remove(c);
      if (!c.userData.cached) c.geometry?.dispose?.();
    });
    const add = (o: THREE.Object3D) => dyn.add(o);
    const rr = rng(41);

    // --- просадка
    const sinkK = range(P.sink, p, P.sinkDur ?? 0.8, P.sinkDelay ?? 0);
    const S = Math.round(sinkK * SMAX * 50) / 50;
    W0.district.position.y = -S;
    const strata = cached(`strata${S}`, () => {
      const g = new THREE.Group();
      const top = (x: number) => topY(x, S);
      const fb = (x: number) => fillBot(x, S);
      const L = (geo: THREE.BufferGeometry, mats: THREE.Material | THREE.Material[]) => {
        const me = new THREE.Mesh(geo, mats);
        me.receiveShadow = true;
        g.add(me);
      };
      L(layer(top, fb, 2000), [m.fill, m.ground]);
      L(layer(fb, clayBot, 2000), [m.clay, m.mud]);
      L(layer(clayBot, sandBot, 80), m.sand);
      L(layer(sandBot, stiffBot, 80), m.stiff);
      L(layer(stiffBot, () => BOTTOM, 80), m.dense);
      return g;
    });
    add(strata);

    // стрелки сжатия глины
    const squeezing = Array.isArray(P.sink) && sinkK > 0.02 && sinkK < 0.98;
    if (squeezing || P.arrows) {
      m.arrow.opacity = 0.9;
      [-80, -66, -48, -31].forEach((x, i) => {
        const yTop = -S - 3 - ((t * 2 + i * 0.4) % 1) * 2.5;
        const s = new THREE.Shape();
        s.moveTo(-0.5, 0);
        s.lineTo(0, -0.7);
        s.lineTo(0.5, 0);
        s.lineTo(0.5, 0.35);
        s.lineTo(0, -0.35);
        s.lineTo(-0.5, 0.35);
        s.closePath();
        const a = new THREE.Mesh(new THREE.ShapeGeometry(s), m.arrow);
        a.position.set(x, yTop, 0.3);
        a.scale.setScalar(1.6);
        add(a);
      });
    }

    // --- колодцы: обсадная труба в разрезе, насос наверху (верх трубы не проседает)
    WELLS.forEach((wx) => {
      add(
        cached(`well${wx}`, () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(halfCyl(0.45, AQ0 + 0.8, -0.05, wx), m.rust));
          // фильтр в водоносном слое: кольца
          for (let yy = AQ0 + 1; yy < AQ1 - 0.5; yy += 0.7) {
            const ring = new THREE.Mesh(halfCyl(0.55, yy, yy + 0.22, wx), m.steel);
            g.add(ring);
          }
          // надземная часть и насос
          const top = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, WELL_TOP + 0.05, 16), m.rust);
          top.position.set(wx, (WELL_TOP - 0.05) / 2, 0);
          g.add(top);
          const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), m.steel);
          flange.position.set(wx, WELL_TOP + 0.07, 0);
          g.add(flange);
          g.add(new THREE.Mesh(box(wx - 0.75, wx + 0.75, WELL_TOP + 0.15, WELL_TOP + 1.0, -0.75, 0.75), m.pump));
          const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 16), m.pump);
          motor.position.set(wx, WELL_TOP + 1.55, 0);
          g.add(motor);
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.2, 12), m.steel);
          pipe.rotation.x = Math.PI / 2;
          pipe.position.set(wx, WELL_TOP + 0.6, -2.3);
          g.add(pipe);
          shadowAll(g);
          return g;
        }),
      );
      // верх обсадной трубы, торчащий над просевшей землёй
      if (S > 0.05) {
        const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, S + 0.05, 16), m.rust);
        stub.position.set(wx, -S + (S + 0.05) / 2 - 0.05, 0);
        add(stub);
      }
    });

    // --- капли воды: откачка (out) / закачка (in), выжимание из глины
    if (P.pump) {
      const dir = P.pump === 'in' ? -1 : 1;
      WELLS.forEach((wx, wi) => {
        for (let i = 0; i < 14; i++) {
          let k = ((i / 14 + t * 0.22 + wi * 0.31) % 1 + 1) % 1;
          if (dir < 0) k = 1 - k;
          const side = i % 2 ? 1 : -1;
          const yAq = lerp(AQ0 + 1.2, AQ1 - 1.2, ((i * 0.37) % 1));
          let x;
          let yy;
          if (k < 0.45) {
            const u = k / 0.45;
            x = wx + side * lerp(8, 0.6, u);
            yy = yAq;
          } else {
            const u = (k - 0.45) / 0.55;
            x = wx;
            yy = lerp(yAq, WELL_TOP + 0.3, u);
          }
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), m.drop);
          d.position.set(x, yy, 0.55);
          add(d);
        }
      });
    }
    if (squeezing) {
      for (let i = 0; i < 26; i++) {
        const k = ((i * 0.618 + t * 0.35) % 1);
        const x = -86 + ((i * 0.377) % 1) * 56;
        const yy = lerp(-9, AQ1 - 0.6, k);
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m.drop);
        d.position.set(x, yy, 0.5);
        add(d);
      }
    }

    // --- сваи и плита под башней
    const pl = range(P.piles, p, P.pilesDur ?? 0.6, P.pilesDelay ?? 0);
    if (pl > 0) {
      const xs: number[] = [];
      for (let x = MAT_X0 + 1.5; x <= MAT_X1 - 1.4; x += 3) xs.push(x);
      xs.forEach((x, i) => {
        const k = clamp01(pl * 1.6 - (i / xs.length) * 0.6);
        if (k <= 0) return;
        const len = PILE_LEN * easeInOut(k);
        const key = `pile${x}_${len.toFixed(1)}`;
        const me = cached(key, () => new THREE.Mesh(halfCyl(0.32, MAT_Y0 - len, MAT_Y0, x), m.pile));
        add(me);
      });
    }
    const mt = range(P.mat, p, P.matDur ?? 0.7, P.matDelay ?? 0);
    if (mt > 0) {
      const h = (MAT_Y1 - MAT_Y0) * mt;
      add(cached(`mat${h.toFixed(2)}`, () => new THREE.Mesh(box(MAT_X0, MAT_X1, MAT_Y0, MAT_Y0 + h, -1, 0.06), m.concrete)));
      if (mt < 1) {
        const wet = new THREE.Mesh(box(MAT_X0, MAT_X1, MAT_Y0 + h - 0.12, MAT_Y0 + h + 0.02, -1, 0.08), m.wet);
        add(wet);
      }
    }

    // --- анимация воды, облаков, дыма
    m.water.map.offset.set(0, -t * 0.02);
    W0.clouds.forEach((c, i) => (c.position.x = -900 + i * 230 + t * 1.5));
    W0.smoke.forEach((s, i) => {
      const k = ((t * 0.12 + i / 6) % 1);
      s.position.set(-96 + k * 10, 34 + k * 22, -40 - k * 4);
      s.scale.set(6 + k * 14, 4 + k * 8, 1);
      (s.material as THREE.SpriteMaterial).opacity = 0.35 * Math.sin(k * Math.PI);
    });

    // --- камера
    const [c0, c1] = (P.cam ?? ['skyline', 'skyline']).map(cam);
    const kc = easeInOut(clamp01(p / (P.camDur ?? 1)));
    const pos = c0.pos.map((v, i) => lerp(v, c1.pos[i], kc));
    const look = c0.look.map((v, i) => lerp(v, c1.look[i], kc));
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    const pc = camera as THREE.PerspectiveCamera;
    const fov = lerp(c0.fov ?? 45, c1.fov ?? 45, kc);
    if (pc.fov !== fov || pc.far !== 4000) {
      pc.fov = fov;
      pc.near = 0.5;
      pc.far = 4000;
      pc.updateProjectionMatrix();
    }
    followSky(scene, camera);
  }, [frame]);

  return <LookLights look={LOOKS[P.look ?? 'golden']} center={[0, 0, -80]} shadowSize={400} />;
};

export const ShanghaiScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const look = LOOKS[P.look ?? 'golden'];
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} shadows camera={{fov: 45, position: [0, 30, 150], near: 0.5, far: 4000}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <ShanghaiWorld P={P} life={life} />
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
            lineHeight: 1.1,
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
