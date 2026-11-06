import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {cloudTexture, concreteTexture, gravelTexture, skyTexture, waterTexture} from '../dam/textures';
import {box} from '../trench/parts';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «септик»: разрез по плоскости z=0 (к зрителю). Дом слева, септик в центре, поле фильтрации справа. =====
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ZB = -14; // глубина вырезанного куска земли
const ZF = -3.4; // толщина «переднего» слоя земли, в котором вырезаны яма/бак/поле
// Бак
const TX0 = -3;
const TX1 = 4.5;
const TY0 = -3.6;
const TY1 = -0.5;
const PART = [-0.5, 2.0]; // перегородки
const CH: [number, number][] = [
  [TX0 + 0.2, PART[0] - 0.08],
  [PART[0] + 0.08, PART[1] - 0.08],
  [PART[1] + 0.08, TX1 - 0.2],
];
const LIQ = -1.25; // уровень жидкости
const FX0 = 6.5;
const FX1 = 18;
const FY0 = -1.9;
const FY1 = -0.75;
const WELL_X = 30;

type Cam = {pos: [number, number, number]; look: [number, number, number]};
const CAMS: Record<string, Cam> = {
  house: {pos: [-15, 3.5, 17], look: [-10, 1.6, -4]},
  houseCut: {pos: [-9.6, 1.6, 7.5], look: [-9.6, 0.7, -2]},
  pipe: {pos: [-6.5, 0.6, 11], look: [-5.5, -0.6, -1]},
  pit: {pos: [-0.8, 1.0, 9.5], look: [-0.8, -1.3, -1]},
  pitWide: {pos: [-3, 3.2, 15], look: [-2.5, -0.4, -2]},
  tank: {pos: [0.75, 0.2, 13], look: [0.75, -1.9, -1]},
  ch1: {pos: [-1.75, -1.4, 5.6], look: [-1.75, -2.3, -1]},
  ch1Low: {pos: [-1.75, -2.6, 5.2], look: [-1.75, -2.8, -1]},
  tee: {pos: [-0.5, -1.2, 4.3], look: [-0.5, -1.7, -1]},
  ch2: {pos: [0.75, -1.4, 5.6], look: [0.75, -2.3, -1]},
  bact: {pos: [-0.4, -2.6, 4.6], look: [-0.4, -3.0, -1]},
  vent: {pos: [3.5, 2.6, 14], look: [0.8, 0.6, -1]},
  ch3: {pos: [3.25, -1.4, 5.6], look: [3.25, -2.3, -1]},
  field: {pos: [11.5, 1.4, 14], look: [11.5, -1.2, -1]},
  fieldClose: {pos: [12, -0.8, 6], look: [12, -1.7, -1]},
  truck: {pos: [8, 5, 20], look: [4, 0.2, -4]},
  well: {pos: [21, 6, 30], look: [23.5, 0, -5]},
  final: {pos: [2, 3.5, 25], look: [2, -0.9, -3]},
  finalWide: {pos: [6, 7, 36], look: [8, -0.8, -5]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.tank : c);
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
// Разрез грунта: дёрн, гумус, суглинок, песок — с камешками и корешками. Верх текстуры = поверхность (y=0)
const strataTexture = () => {
  const [c, g] = cv(512, 1024);
  const bands: [number, string][] = [
    [0, '#3d2a1a'],
    [0.0105, '#4e3520'],
    [0.027, '#8a5a34'],
    [0.126, '#9c7044'],
    [0.186, '#c9a66b'],
    [0.45, '#b8955c'],
    [1, '#b8955c'],
  ];
  for (let i = 0; i < bands.length - 1; i++) {
    const [a, col] = bands[i];
    const [b] = bands[i + 1];
    g.fillStyle = col;
    g.fillRect(0, a * 1024, 512, (b - a) * 1024 + 1);
  }
  const r = rng(5);
  for (let i = 0; i < 9000; i++) {
    const y = r() * 1024;
    g.fillStyle = r() > 0.5 ? 'rgba(255,230,190,0.10)' : 'rgba(30,15,5,0.16)';
    g.fillRect(r() * 512, y, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  for (let i = 0; i < 160; i++) {
    const y = 120 + r() * 880;
    const x = r() * 512;
    const s = 3 + r() * 9;
    g.fillStyle = ['#7a7570', '#8d867c', '#6a645d', '#a39a8c'][Math.floor(r() * 4)];
    g.beginPath();
    g.ellipse(x, y, s, s * (0.55 + r() * 0.35), r() * 3, 0, 6.3);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.strokeStyle = 'rgba(60,40,22,0.55)';
  for (let i = 0; i < 60; i++) {
    let x = r() * 512;
    let y = 30 + r() * 30;
    g.lineWidth = 0.8 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 18;
      y += 8 + r() * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 8, 1 / 40);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
const lawnTexture = () => {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#6fae4c';
  g.fillRect(0, 0, 256, 256);
  const r = rng(71);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(150,210,100,0.35)' : 'rgba(40,95,30,0.3)';
    g.fillRect(r() * 256, r() * 256, 1.5, 2.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 4, 1 / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const tileTexture = () => {
  const [c, g] = cv(128, 128);
  g.fillStyle = '#dbe9ee';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#b6c9d0';
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const woodTex = () => {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#c99e6b';
  g.fillRect(0, 0, 256, 64);
  const r = rng(13);
  for (let i = 0; i < 20; i++) {
    g.strokeStyle = `rgba(110,72,40,${0.15 + r() * 0.25})`;
    g.lineWidth = 1 + r();
    const y = r() * 64;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(90, y + (r() - 0.5) * 6, 170, y + (r() - 0.5) * 6, 256, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// ---------- статичные постройки ----------
const tubeAlong = (pts: number[][], r: number, mat: THREE.Material) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.02), 80, r, 12), mat);

const buildHouse = (m: Record<string, THREE.Material>) => {
  const g = new THREE.Group();
  const X0 = -15;
  const X1 = -6;
  const Z0 = -9;
  // фундамент, пол, стены (передняя срезана)
  g.add(new THREE.Mesh(box(X0, X1, 0, 0.45, Z0, 0), m.concrete));
  g.add(new THREE.Mesh(box(X0 + 0.2, X1 - 0.2, 0.45, 0.5, Z0 + 0.2, 0), m.floor));
  g.add(new THREE.Mesh(box(X0, X1, 0.45, 4, Z0, Z0 + 0.2), m.wall));
  g.add(new THREE.Mesh(box(X0, X0 + 0.2, 0.45, 4, Z0, 0), m.wall));
  g.add(new THREE.Mesh(box(X1 - 0.2, X1, 0.45, 4, Z0, 0), m.wall));
  g.add(new THREE.Mesh(box(-10.4, -10.25, 0.5, 4, Z0 + 0.2, 0), m.wall)); // перегородка ванной
  g.add(new THREE.Mesh(box(X0, X1, 4, 4.15, Z0, 0), m.wall)); // потолок
  // плитка в ванной
  g.add(new THREE.Mesh(box(-10.25, X1 - 0.2, 0.5, 4, Z0 + 0.2, Z0 + 0.22), m.tile));
  // крыша — треугольная призма
  const rs = new THREE.Shape();
  rs.moveTo(X0 - 0.6, 4.15);
  rs.lineTo(X1 + 0.6, 4.15);
  rs.lineTo((X0 + X1) / 2, 6.6);
  rs.closePath();
  const rg = new THREE.ExtrudeGeometry(rs, {depth: -Z0 + 0.5, bevelEnabled: false});
  rg.translate(0, 0, Z0 - 0.25);
  g.add(new THREE.Mesh(rg, m.roof));
  g.add(new THREE.Mesh(box(-13, -12.4, 5, 7.0, Z0 + 2, Z0 + 2.6), m.brick)); // труба
  // окно в спальне + кровать, лампа
  g.add(new THREE.Mesh(box(-13.8, -11.6, 1.8, 3.2, Z0 + 0.21, Z0 + 0.26), m.window));
  g.add(new THREE.Mesh(box(-14.6, -12.3, 0.5, 1.0, Z0 + 0.3, Z0 + 2.4), m.wood));
  g.add(new THREE.Mesh(box(-14.6, -12.3, 1.0, 1.15, Z0 + 0.3, Z0 + 2.4), m.white));
  g.add(new THREE.Mesh(box(-14.55, -14.0, 1.15, 1.35, Z0 + 0.4, Z0 + 1.0), m.white));
  // ванная: унитаз, раковина, ванна с уточкой
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.45, 20), m.white);
  bowl.position.set(-9.0, 0.73, -0.9);
  g.add(bowl);
  g.add(new THREE.Mesh(box(-9.25, -8.75, 0.5, 1.45, -1.55, -1.25), m.white)); // бачок
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), m.white);
  seat.rotation.x = Math.PI / 2;
  seat.position.set(-9.0, 0.97, -0.9);
  g.add(seat);
  g.add(new THREE.Mesh(box(-9.12, -8.88, 1.45, 1.52, -1.5, -1.3), m.chrome)); // кнопка слива
  g.add(new THREE.Mesh(box(-7.8, -6.3, 0.5, 1.1, Z0 + 0.3, Z0 + 1.6), m.white)); // ванна
  g.add(new THREE.Mesh(box(-7.65, -6.45, 1.0, 1.06, Z0 + 0.45, Z0 + 1.45), m.waterClean));
  const duck = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), m.duck);
  duck.position.set(-7.1, 1.12, Z0 + 0.9);
  g.add(duck);
  const dh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), m.duck);
  dh.position.set(-7.0, 1.26, Z0 + 0.9);
  g.add(dh);
  g.add(new THREE.Mesh(box(-9.8, -9.0, 1.5, 1.6, Z0 + 0.25, Z0 + 0.7), m.white)); // раковина
  g.add(new THREE.Mesh(box(-9.7, -9.1, 1.9, 2.8, Z0 + 0.23, Z0 + 0.26), m.mirror));
  // крыльцо и дверь снаружи (сбоку)
  g.add(new THREE.Mesh(box(X1, X1 + 0.06, 0.45, 2.6, -5.5, -4.3), m.door));
  return g;
};

const buildTank = (m: Record<string, THREE.Material>) => {
  const g = new THREE.Group();
  const T = 0.2;
  g.add(new THREE.Mesh(box(TX0, TX1, TY0, TY0 + T, ZF + 0.2, 0), m.concrete));
  g.add(new THREE.Mesh(box(TX0, TX1, TY0, TY1, ZF + 0.2, ZF + 0.4), m.concreteDark)); // задняя стенка
  g.add(new THREE.Mesh(box(TX0, TX0 + T, TY0, TY1, ZF + 0.2, 0), m.concrete));
  g.add(new THREE.Mesh(box(TX1 - T, TX1, TY0, TY1, ZF + 0.2, 0), m.concrete));
  g.add(new THREE.Mesh(box(TX0, TX1, TY1 - T, TY1, ZF + 0.2, 0), m.concrete)); // крышка
  PART.forEach((x) => g.add(new THREE.Mesh(box(x - 0.08, x + 0.08, TY0, TY1 - T, ZF + 0.2, 0), m.concrete)));
  // горловины с люками до поверхности
  CH.forEach(([a, b]) => {
    const cx = (a + b) / 2;
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, -TY1 + 0.05, 24, 1, true), m.concrete);
    n.position.set(cx, TY1 / 2 + 0.025, -1.2);
    g.add(n);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), m.lid);
    lid.position.set(cx, 0.06, -1.2);
    g.add(lid);
  });
  return g;
};

const buildField = (m: Record<string, THREE.Material>, k: number) => {
  const g = new THREE.Group();
  const x1 = lerp(FX0, FX1, k);
  g.add(new THREE.Mesh(box(FX0, x1, FY0, FY1, ZF + 0.2, 0), m.gravel));
  g.add(new THREE.Mesh(box(FX0, x1, FY1, FY1 + 0.04, ZF + 0.2, 0), m.geotex));
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, x1 - FX0, 16), m.pvc);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set((FX0 + x1) / 2, -1.15, -0.05);
  g.add(pipe);
  for (let x = FX0 + 0.4; x < x1 - 0.2; x += 0.6) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), m.hole);
    h.position.set(x, -1.27, 0.04);
    h.rotation.x = -0.6;
    g.add(h);
  }
  return g;
};

const buildTruck = (m: Record<string, THREE.Material>) => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(box(-2.6, 2.6, 0.55, 0.85, -0.95, 0.95), m.dark)); // рама
  g.add(new THREE.Mesh(box(1.7, 3.3, 0.85, 2.6, -1.0, 1.0), m.cab)); // кабина
  g.add(new THREE.Mesh(box(2.4, 3.32, 1.7, 2.4, -0.85, 0.85), m.window));
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 4.0, 28), m.orange);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-0.45, 1.95, 0);
  g.add(tank);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.07, 1.07, 0.18, 28), m.white);
  band.rotation.z = Math.PI / 2;
  band.position.set(-0.45, 1.95, 0);
  g.add(band);
  [[-1.8, 1], [-1.8, -1], [0.2, 1], [0.2, -1], [2.5, 1], [2.5, -1]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.35, 20), m.tire);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.48, z * 0.95);
    g.add(w);
  });
  return g;
};

const buildWell = (m: Record<string, THREE.Material>) => {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.9, 28), m.concrete);
  ring.position.y = 0.45;
  g.add(ring);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.72, 28), m.waterClean);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.6;
  g.add(water);
  [-0.85, 0.85].forEach((x) => g.add(new THREE.Mesh(box(x - 0.07, x + 0.07, 0, 2.2, -0.07, 0.07), m.wood)));
  const rs = new THREE.Shape();
  rs.moveTo(-1.2, 2.1);
  rs.lineTo(1.2, 2.1);
  rs.lineTo(0, 2.9);
  rs.closePath();
  const rg = new THREE.ExtrudeGeometry(rs, {depth: 1.6, bevelEnabled: false});
  rg.translate(0, 0, -0.8);
  g.add(new THREE.Mesh(rg, m.roof));
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 14), m.chrome);
  bucket.position.set(0.3, 1.2, 0);
  g.add(bucket);
  return g;
};

// ---------- мир ----------
const World: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene} = useThree();
  const p = clamp01(frame / life);
  const t = frame / fps;

  const W0 = useMemo(() => {
    const m: Record<string, any> = {
      cut: new THREE.MeshStandardMaterial({map: strataTexture(), roughness: 1}),
      soilSide: new THREE.MeshStandardMaterial({color: '#6e4a2c', roughness: 1}),
      lawn: new THREE.MeshStandardMaterial({map: lawnTexture(), roughness: 1}),
      concrete: new THREE.MeshStandardMaterial({map: concreteTexture(1 / 3, 1 / 3), color: '#c8c2b8', roughness: 0.9, side: THREE.DoubleSide}),
      concreteDark: new THREE.MeshStandardMaterial({map: concreteTexture(1 / 3, 1 / 3), color: '#8e8a83', roughness: 0.95}),
      lid: new THREE.MeshStandardMaterial({color: '#4f6d3c', roughness: 0.7}),
      gravel: new THREE.MeshStandardMaterial({map: gravelTexture(1 / 2, 1 / 2), color: '#c7c3bb', roughness: 1}),
      geotex: new THREE.MeshStandardMaterial({color: '#e9e4d8', roughness: 1}),
      pvc: new THREE.MeshStandardMaterial({color: '#d26c3a', roughness: 0.5}),
      hole: new THREE.MeshBasicMaterial({color: '#2a1d14'}),
      wall: new THREE.MeshStandardMaterial({color: '#efe2c7', roughness: 0.9}),
      floor: new THREE.MeshStandardMaterial({map: woodTex(), roughness: 0.8}),
      tile: new THREE.MeshStandardMaterial({map: tileTexture(), roughness: 0.4}),
      roof: new THREE.MeshStandardMaterial({color: '#8c3b2c', roughness: 0.8}),
      brick: new THREE.MeshStandardMaterial({color: '#9a4d36', roughness: 0.9}),
      window: new THREE.MeshStandardMaterial({color: '#9cc4dd', roughness: 0.15, metalness: 0.2}),
      wood: new THREE.MeshStandardMaterial({color: '#8a6440', roughness: 0.9}),
      white: new THREE.MeshStandardMaterial({color: '#f5f5f2', roughness: 0.35}),
      chrome: new THREE.MeshStandardMaterial({color: '#cfd5da', roughness: 0.2, metalness: 0.8}),
      mirror: new THREE.MeshStandardMaterial({color: '#e2edf3', roughness: 0.05, metalness: 0.9}),
      duck: new THREE.MeshStandardMaterial({color: '#ffd23d', roughness: 0.5}),
      door: new THREE.MeshStandardMaterial({color: '#6b4a30', roughness: 0.8}),
      waterClean: new THREE.MeshStandardMaterial({color: '#8ec5e0', transparent: true, opacity: 0.85, roughness: 0.1}),
      sewage: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#8d7a4c', transparent: true, opacity: 0.88, roughness: 0.3}),
      liq: [
        new THREE.MeshStandardMaterial({color: '#8a7650', transparent: true, opacity: 0.86, roughness: 0.3}),
        new THREE.MeshStandardMaterial({color: '#94976a', transparent: true, opacity: 0.8, roughness: 0.25}),
        new THREE.MeshStandardMaterial({color: '#9cc0b9', transparent: true, opacity: 0.72, roughness: 0.15}),
      ],
      sludge: new THREE.MeshStandardMaterial({color: '#4a3524', roughness: 1}),
      scum: new THREE.MeshStandardMaterial({color: '#d8c98f', roughness: 0.8}),
      drop: new THREE.MeshStandardMaterial({color: '#6f5a35', roughness: 0.6}),
      dropClean: new THREE.MeshBasicMaterial({color: '#bfe6ff'}),
      fatBlob: new THREE.MeshStandardMaterial({color: '#f1e3a4', roughness: 0.6}),
      bubble: new THREE.MeshStandardMaterial({color: '#ffffff', transparent: true, opacity: 0.6, roughness: 0.1}),
      bact: new THREE.MeshStandardMaterial({color: '#7fd06b', roughness: 0.5}),
      stink: new THREE.MeshBasicMaterial({color: '#b9d77a', transparent: true, opacity: 0.6}),
      fly: new THREE.MeshBasicMaterial({color: '#1b1b1b'}),
      dark: new THREE.MeshStandardMaterial({color: '#2b2d31', roughness: 0.8}),
      tire: new THREE.MeshStandardMaterial({color: '#1d1d1f', roughness: 0.9}),
      cab: new THREE.MeshStandardMaterial({color: '#f2f2ee', roughness: 0.5}),
      orange: new THREE.MeshStandardMaterial({color: '#e98a2c', roughness: 0.5, metalness: 0.1}),
      hose: new THREE.MeshStandardMaterial({color: '#2f3a2f', roughness: 0.7}),
      leaf: new THREE.MeshStandardMaterial({color: '#4f8a3a', roughness: 0.9}),
      trunk: new THREE.MeshStandardMaterial({color: '#6b4a2e', roughness: 1}),
      fence: new THREE.MeshStandardMaterial({color: '#b08a5c', roughness: 0.9}),
      line: new THREE.MeshBasicMaterial({color: '#ffffff'}),
      gas: new THREE.MeshBasicMaterial({color: '#e6eadf', transparent: true, opacity: 0.45}),
    };
    const g = new THREE.Group();
    // земля сзади (сплошная) и газон сверху
    const back = new THREE.Mesh(box(-80, 90, -40, 0, ZB, ZF), m.soilSide);
    g.add(back);
    const lawnFar = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), m.lawn);
    lawnFar.rotation.x = -Math.PI / 2;
    lawnFar.position.set(0, 0.0, ZB - 150);
    g.add(lawnFar);
    // забор, деревья, кусты, облака
    for (let x = -40; x < 70; x += 1.2) g.add(new THREE.Mesh(box(x - 0.05, x + 0.05, 0, 1.4, -24, -23.9), m.fence));
    g.add(new THREE.Mesh(box(-40, 70, 0.9, 1.0, -24.05, -23.95), m.fence));
    g.add(new THREE.Mesh(box(-40, 70, 0.4, 0.5, -24.05, -23.95), m.fence));
    const r = rng(8);
    const tree = (x: number, z: number, s: number) => {
      const tr = new THREE.Group();
      const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2, 10), m.trunk);
      tk.position.y = 1;
      tr.add(tk);
      [[0, 2.6, 0, 1.2], [-0.7, 2.2, 0.2, 0.85], [0.7, 2.3, -0.1, 0.9], [0.1, 3.3, -0.1, 0.8]].forEach(([a, b, c, rr]) => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(rr, 14, 10), m.leaf);
        l.position.set(a, b, c);
        tr.add(l);
      });
      tr.position.set(x, 0, z);
      tr.scale.setScalar(s);
      g.add(tr);
    };
    [[-24, -20, 1.6], [-19, -28, 1.3], [8, -21, 1.2], [26, -19, 1.5], [33, -28, 1.7], [52, -22, 1.4], [-4, -30, 1.3], [15, -32, 1.6]].forEach(([x, z, s]) => tree(x, z, s));
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5 + r() * 0.4, 12, 8), m.leaf);
      b.position.set(-20 + i * 5 + r() * 2, 0.3, -8 - r() * 4);
      b.scale.y = 0.7;
      g.add(b);
    }
    const sky = skyTexture();
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(300 + i), transparent: true, depthWrite: false, fog: false}));
      sp.scale.set(50 + r() * 20, 25, 1);
      sp.position.set(-90 + i * 32, 36 + r() * 16, -170);
      g.add(sp);
    }
    g.add(buildHouse(m));
    return {m, g, sky, cache: new Map<string, THREE.Object3D>()};
  }, []);
  const {m} = W0;
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
    scene.background = W0.sky;
    scene.fog = new THREE.Fog('#dfe9f2', 70, 220);
    scene.add(W0.g);
    scene.add(dyn);
    return () => {
      scene.remove(W0.g);
      scene.remove(dyn);
    };
  }, []);

  useLayoutEffect(() => {
    dyn.children.slice().forEach((c: any) => {
      dyn.remove(c);
      if (!c.userData.cached) c.geometry?.dispose?.();
    });
    const add = (o: THREE.Object3D) => dyn.add(o);
    const rr = rng(31);

    const pit = range(P.pit, p, P.pitDur ?? 0.5, P.pitDelay ?? 0);
    const tank = range(P.tank, p, P.tankDur ?? 0.5, P.tankDelay ?? 0);
    const field = range(P.field, p, P.fieldDur ?? 0.6, P.fieldDelay ?? 0);
    const pipeIn = range(P.pipe, p, P.pipeDur ?? 0.4, P.pipeDelay ?? 0);

    // --- передний слой земли с вырезами (яма / бак / траншея поля)
    const pitOpen = pit > 0 && tank <= 0;
    const kPit = pitOpen ? Math.round(pit * 20) / 20 : 0;
    const kField = field > 0 ? 1 : 0;
    add(
      cached(`front${kPit}_${tank > 0 ? 1 : 0}_${kField}`, () => {
        const s = new THREE.Shape([new THREE.Vector2(-80, 0), new THREE.Vector2(90, 0), new THREE.Vector2(90, -40), new THREE.Vector2(-80, -40)]);
        if (kPit > 0) {
          const d = -3.2 * kPit;
          s.holes.push(new THREE.Path([new THREE.Vector2(-3, 0), new THREE.Vector2(-3.2 + 0.3, d), new THREE.Vector2(2.2, d), new THREE.Vector2(2.5, 0)]));
        }
        if (tank > 0)
          s.holes.push(new THREE.Path([new THREE.Vector2(TX0 - 0.05, TY1 + 0.02), new THREE.Vector2(TX0 - 0.05, TY0 - 0.05), new THREE.Vector2(TX1 + 0.05, TY0 - 0.05), new THREE.Vector2(TX1 + 0.05, TY1 + 0.02)]));
        if (kField) s.holes.push(new THREE.Path([new THREE.Vector2(FX0, FY1 + 0.04), new THREE.Vector2(FX0, FY0), new THREE.Vector2(FX1, FY0), new THREE.Vector2(FX1, FY1 + 0.04)]));
        const geo = new THREE.ExtrudeGeometry(s, {depth: -ZF, bevelEnabled: false});
        geo.translate(0, 0, ZF);
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(geo, [m.cut, m.soilSide]));
        // газон сверху переднего слоя (с дыркой над открытой ямой)
        const top = new THREE.Shape([new THREE.Vector2(-80, 0), new THREE.Vector2(90, 0), new THREE.Vector2(90, ZF), new THREE.Vector2(-80, ZF)]);
        if (kPit > 0) top.holes.push(new THREE.Path([new THREE.Vector2(-3, 0), new THREE.Vector2(2.5, 0), new THREE.Vector2(2.5, ZF + 0.3), new THREE.Vector2(-3, ZF + 0.3)]));
        const tg = new THREE.ShapeGeometry(top);
        tg.rotateX(Math.PI / 2);
        const lawn = new THREE.Mesh(tg, m.lawn);
        lawn.position.y = 0.01;
        grp.add(lawn);
        const lawnBack = new THREE.Mesh(new THREE.PlaneGeometry(170, -ZB + ZF), m.lawn);
        lawnBack.rotation.x = -Math.PI / 2;
        lawnBack.position.set(5, 0.01, (ZB + ZF) / 2);
        grp.add(lawnBack);
        return grp;
      }),
    );

    // --- труба из дома
    if (pipeIn > 0) {
      const end = tank > 0 ? [TX0 - 0.1, -1.05, 0.02] : [-2.2, -0.9, 0.02];
      const pts = [
        [-9.0, 0.4, 0.02],
        [-9.0, -0.55, 0.02],
        [-8.6, -0.7, 0.02],
        end,
      ];
      const key = `pipe${Math.round(pipeIn * 20)}_${tank > 0 ? 1 : 0}`;
      add(
        cached(key, () => {
          const c = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, 'catmullrom', 0.05);
          const n = Math.max(2, Math.round(80 * pipeIn));
          const sub = c.getPoints(80).slice(0, n);
          return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sub), 60, 0.13, 12), m.pvc);
        }),
      );
    }

    // --- выгребная яма: жижа, запах, мухи
    if (pitOpen && pit > 0.5) {
      const fill = range(P.pitFill, p, P.pitFillDur ?? 0.7, 0);
      if (fill > 0) {
        const d = -3.2;
        const y = d + (-d - 0.15) * fill;
        const k = (y - d) / -d;
        const x0 = -2.9 + 0.0 * k;
        add(new THREE.Mesh(box(x0, 2.2 + 0.3 * k, d, y, ZF + 0.3, 0.01), m.sewage));
      }
      m.sewage.map.offset.set(t * 0.02, t * 0.01);
      const st = range(P.stink, p, 0.4, P.stinkDelay ?? 0);
      if (st > 0) {
        for (let i = 0; i < 6; i++) {
          const x = -2.2 + i * 0.85;
          const ph = t * 1.4 + i;
          const pts: number[][] = [];
          for (let k = 0; k <= 8; k++) pts.push([x + Math.sin(ph + k * 0.9) * 0.25, 0.2 + k * 0.38 * st, -1.2 + Math.cos(ph + k) * 0.1]);
          add(tubeAlong(pts, 0.045, m.stink));
        }
        for (let i = 0; i < 9; i++) {
          const a = t * (3 + i * 0.4) + i;
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), m.fly);
          f.position.set(-0.3 + Math.cos(a) * (0.8 + (i % 3) * 0.5), 0.7 + Math.sin(a * 1.7) * 0.4 + (i % 4) * 0.2, -1 + Math.sin(a) * 0.9);
          add(f);
        }
      }
    }

    // --- бак с камерами
    if (tank > 0) {
      const tg = cached('tank', () => buildTank(m));
      tg.scale.set(1, Math.max(0.001, tank), 1);
      tg.position.y = TY0 * (1 - tank) * 0.0 + (1 - tank) * 2.5;
      add(tg);
    }
    if (tank >= 1) {
      // уровни слоёв в камерах
      const sl = [range(P.sludge1, p, P.sludgeDur ?? 0.6, P.sludgeDelay ?? 0), range(P.sludge2, p, P.sludgeDur ?? 0.6, P.sludgeDelay ?? 0), range(P.sludge3, p, 0.6)];
      const pump = range(P.pump, p, P.pumpDur ?? 0.35, P.pumpDelay ?? 0.6);
      const grow = range(P.grow, p, 0.4, 0);
      const SL = [0.85, 0.38, 0.1];
      const sc = [range(P.scum, p, P.scumDur ?? 0.6, P.scumDelay ?? 0), range(P.scum, p, 0.6) * 0.3, 0];
      const SC = [0.24, 0.1, 0];
      const liqOn = range(P.liquid, p, 0.5, P.liquidDelay ?? 0);
      CH.forEach(([a, b], i) => {
        const fill = liqOn;
        if (fill <= 0) return;
        const top = lerp(TY0 + 0.2, LIQ, fill);
        let sh = SL[i] * sl[i] * (1 + 0.5 * grow);
        if (i === 0) sh *= 1 - 0.85 * pump;
        if (i === 1) sh *= 1 - 0.7 * pump;
        const sludgeTop = TY0 + 0.2 + sh;
        if (sh > 0.01) add(new THREE.Mesh(box(a, b, TY0 + 0.2, sludgeTop, ZF + 0.4, 0.0), m.sludge));
        add(new THREE.Mesh(box(a, b, Math.max(sludgeTop, TY0 + 0.2), top, ZF + 0.4, -0.005), m.liq[i]));
        const s2 = SC[i] * sc[i] * (i === 0 ? 1 - 0.8 * pump : 1);
        if (s2 > 0.01) add(new THREE.Mesh(box(a, b, top - s2 * 0.4, top + s2 * 0.6, ZF + 0.4, 0.0), m.scum));
      });
      // Т-образные трубы через перегородки и на выходе
      const tees = range(P.tees, p, 0.4, P.teesDelay ?? 0);
      if (tees > 0 || P.teesAlways) {
        const k = P.teesAlways ? 1 : tees;
        [PART[0], PART[1], TX1 - 0.1].forEach((x) => {
          const v = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2 * k, 14), m.white);
          v.position.set(x - 0.32, -1.6 + 0.6 * (1 - k) * 0, 0.06);
          add(v);
          const h = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 14), m.white);
          h.rotation.z = Math.PI / 2;
          h.position.set(x - 0.1, -1.4, 0.06);
          if (k > 0.6) add(h);
        });
      }
      // выход в поле
      if (field > 0) {
        const x1 = lerp(TX1, FX0 + 0.1, clamp01(field * 2));
        const out = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, x1 - TX1, 12), m.pvc);
        out.rotation.z = Math.PI / 2 + 0.03;
        out.position.set((TX1 + x1) / 2, -1.25, 0.02);
        add(out);
      }
      // падающие частицы (ил) в первой камере
      if (P.settle) {
        const [a, b] = CH[P.settle === 2 ? 1 : 0];
        for (let i = 0; i < 18; i++) {
          const k = (t * 0.35 + i * 0.137) % 1;
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.02, 8, 6), m.drop);
          d.position.set(lerp(a + 0.2, b - 0.2, (i * 0.618) % 1), lerp(LIQ - 0.15, TY0 + 0.35, k), -0.15 - (i % 4) * 0.2);
          add(d);
        }
      }
      // всплывающий жир
      if (P.floatUp) {
        const [a, b] = CH[0];
        for (let i = 0; i < 14; i++) {
          const k = (t * 0.3 + i * 0.173) % 1;
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m.fatBlob);
          d.position.set(lerp(a + 0.2, b - 0.2, (i * 0.41) % 1), lerp(TY0 + 0.6, LIQ - 0.05, k), -0.2 - (i % 3) * 0.25);
          add(d);
        }
      }
      // бактерии в иле
      const bc = range(P.bacteria, p, 0.4, P.bacteriaDelay ?? 0);
      if (bc > 0) {
        [0, 1].forEach((ci) => {
          const [a, b] = CH[ci];
          const n = ci === 0 ? 16 : 9;
          for (let i = 0; i < n; i++) {
            const sc2 = bc * (0.8 + 0.2 * Math.sin(t * 6 + i));
            const bm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 3, 6), m.bact);
            bm.scale.setScalar(sc2);
            bm.position.set(lerp(a + 0.15, b - 0.15, ((i * 0.618) % 1)) + Math.sin(t * 2 + i) * 0.06, TY0 + 0.3 + ((i * 0.37) % 1) * (ci === 0 ? 0.6 : 0.25), 0.03);
            bm.rotation.z = t * 2 + i;
            add(bm);
          }
        });
      }
      // пузырьки газа
      if (P.gas) {
        [0, 1].forEach((ci) => {
          const [a, b] = CH[ci];
          for (let i = 0; i < 10; i++) {
            const k = (t * 0.45 + i * 0.1 + ci * 0.05) % 1;
            const bb = new THREE.Mesh(new THREE.SphereGeometry(0.05 + (i % 3) * 0.02, 8, 6), m.bubble);
            bb.position.set(lerp(a + 0.2, b - 0.2, ((i * 0.53) % 1)) + Math.sin(t * 3 + i) * 0.04, lerp(TY0 + 0.5, LIQ, k), -0.1);
            add(bb);
          }
        });
      }
      // вентиляция: труба вверх и газ наружу
      const vt = range(P.vent, p, 0.4, P.ventDelay ?? 0);
      if (vt > 0) {
        const vx = 0.75;
        const h = 3.3 * vt;
        const vp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, -TY1 + h, 14), m.pvc);
        vp.position.set(vx, (TY1 + h) / 2, -0.4);
        add(vp);
        if (vt > 0.95) {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.pvc);
          cap.position.set(vx, h + 0.12, -0.4);
          add(cap);
          if (P.gasOut) {
            for (let i = 0; i < 7; i++) {
              const k = (t * 0.35 + i / 7) % 1;
              const s = new THREE.Mesh(new THREE.SphereGeometry(0.12 + k * 0.45, 10, 8), m.gas);
              s.position.set(vx + Math.sin(i + t) * 0.2 + k * 0.6, h + 0.25 + k * 2.4, -0.4);
              add(s);
            }
            // газ из камер поднимается по трубе
            for (let i = 0; i < 6; i++) {
              const k = (t * 0.6 + i / 6) % 1;
              const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.bubble);
              s.position.set(vx, lerp(TY1, h, k), -0.25);
              add(s);
            }
          }
        }
      }
    }

    // --- поле фильтрации
    if (field > 0) add(cached(`field${Math.round(field * 20)}`, () => buildField(m, Math.round(field * 20) / 20)));
    if (P.seep && field >= 1) {
      for (let i = 0; i < 40; i++) {
        const k = (t * 0.4 + i * 0.071) % 1;
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), m.dropClean);
        const x = FX0 + 0.5 + ((i * 0.618) % 1) * (FX1 - FX0 - 1);
        const y = lerp(-1.3, -4.2, k);
        d.position.set(x + Math.sin(k * 6 + i) * 0.08, y, 0.04);
        d.scale.setScalar(1 - k * 0.7);
        add(d);
      }
    }

    // --- поток: капли из унитаза по трубе в камеры
    if (P.flow) {
      const path: [number, number][] =
        tank >= 1
          ? [
              [-9.0, 0.4],
              [-9.0, -0.55],
              [-8.4, -0.72],
              [TX0 - 0.1, -1.05],
              [CH[0][0] + 0.4, LIQ - 0.2],
              [PART[0] - 0.32, -2.0],
              [PART[0] + 0.2, -1.4],
              [PART[1] - 0.32, -2.0],
              [PART[1] + 0.2, -1.4],
              [TX1 - 0.42, -2.0],
              [TX1, -1.25],
              ...(field > 0 ? ([[FX0 + 0.2, -1.2], [FX1 - 0.4, -1.15]] as [number, number][]) : []),
            ]
          : [
              [-9.0, 0.4],
              [-9.0, -0.55],
              [-8.4, -0.72],
              [-2.2, -0.9],
              [-1.6, -2.6],
            ];
      const segs = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1]));
      const tot = segs.reduce((a, b) => a + b, 0);
      const N = 16;
      for (let i = 0; i < N; i++) {
        let d = ((t * 1.6 + (i / N) * tot) % tot + tot) % tot;
        let j = 0;
        while (j < segs.length - 1 && d > segs[j]) {
          d -= segs[j];
          j++;
        }
        const k = segs[j] ? d / segs[j] : 0;
        const x = lerp(path[j][0], path[j + 1][0], k);
        const y = lerp(path[j][1], path[j + 1][1], k);
        const clean = tank >= 1 && x > PART[1];
        const dr = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), clean ? m.dropClean : m.drop);
        dr.position.set(x, y, 0.16);
        add(dr);
      }
    }

    // --- ассенизаторская машина
    const tr = range(P.truck, p, P.truckDur ?? 0.45, P.truckDelay ?? 0);
    if (tr > 0) {
      const truck = cached('truck', () => buildTruck(m));
      const x = lerp(34, 5.6, tr);
      truck.position.set(x, 0, -6.5);
      add(truck);
      if (tr >= 1 && P.hose) {
        const hk = range(P.hose, p, 0.25, P.hoseDelay ?? 0);
        if (hk > 0) {
          const [a, b] = CH[0];
          const cx = (a + b) / 2;
          const pts = [
            [x - 2.6, 1.5, -6.5],
            [x - 4, 0.3, -4.5],
            [cx + 1.5, 0.25, -1.6],
            [cx, 0.3, -1.2],
            [cx, TY1, -0.6],
            [cx, lerp(TY1, TY0 + 0.4, hk), 0.12],
          ];
          add(tubeAlong(pts, 0.1, m.hose));
        }
      }
    }

    // --- колодец и расстояние 50 м
    const wl = range(P.well, p, 0.4, P.wellDelay ?? 0);
    if (wl > 0) {
      const w = cached('well', () => buildWell(m));
      w.position.set(WELL_X, 0, -5);
      w.scale.setScalar(Math.max(0.001, wl));
      add(w);
      const dl = range(P.distance, p, 0.5, P.distanceDelay ?? 0.2);
      if (dl > 0) {
        const x1 = lerp(FX1, WELL_X - 1, dl);
        add(new THREE.Mesh(box(FX1, x1, 0.03, 0.06, -2.55, -2.45), m.line));
        [FX1, x1].forEach((x) => add(new THREE.Mesh(box(x - 0.05, x + 0.05, 0.03, 0.06, -2.9, -2.1), m.line)));
      }
    }

    // --- камера
    const [c0, c1] = (P.cam ?? ['tank', 'tank']).map(cam);
    const kc = easeInOut(clamp01(p / (P.camDur ?? 1)));
    camera.position.set(...(c0.pos.map((v, i) => lerp(v, c1.pos[i], kc)) as [number, number, number]));
    const look = c0.look.map((v, i) => lerp(v, c1.look[i], kc));
    camera.lookAt(look[0], look[1], look[2]);
    void rr;
  }, [frame]);

  return (
    <>
      <hemisphereLight args={['#eaf3ff', '#7a6a55', 1.2]} />
      <directionalLight position={[18, 30, 22]} intensity={1.9} color="#fff6e8" />
      <directionalLight position={[-20, 10, 14]} intensity={0.55} color="#cfe3ff" />
    </>
  );
};

export const SepticScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 2, 12], near: 0.1, far: 700}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <World P={P} life={life} />
      </ThreeCanvas>
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
            fontSize: P.bannerSize ?? 62,
            lineHeight: 1.1,
            color: '#FFD54A',
            WebkitTextStroke: '8px #3a2a00',
            paintOrder: 'stroke fill',
            textTransform: 'uppercase',
            whiteSpace: 'pre-line',
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
