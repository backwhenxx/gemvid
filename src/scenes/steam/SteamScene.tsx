// Мир «пар Нью-Йорка»: улица Манхэттена и грунт под ней в разрезе (лицевая плоскость z=0 к зрителю).
// Вдоль улицы — паровая магистраль, разрезанная вдоль оси: слева подвал станции с котлом, справа подвал дома
// с теплообменником и чиллером, посередине колодец под люком. Дальше по улице — место прорыва 2007 года.
// Статичный мир собирается один раз, кадр лишь двигает его части (структура как у SubwayScene).
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {clayTexture, cloudTexture, gravelTexture, rockTexture, skyTexture, topsoilTexture, waterTexture} from '../dam/textures';
import {libMaterial, libModel, useLib} from '../../lib/lib3d';
import LIBJ from './lib.json';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ---- размеры (метры) ----
const XL = -90, XR = 90;
const PY = -2.4; // ось паровой магистрали (лежит на плоскости среза)
const R1 = 0.58, R2 = 0.82; // внутренний радиус стали и наружный — по кожуху изоляции
const PB0 = -60, PB1 = -47; // подвал станции
const BR0 = 20, BR1 = 34; // подвал дома
const RY0 = -4.4, RY1 = -0.3; // пол и потолок подвалов
const MX = 4; // люк и колодец
const SR = 0.8; // радиус колодца
const HX = 1.2; // фланец, куда бьёт гидроудар
const CX0 = -31, CX1 = -22, CZ0 = -25, CZ1 = -16; // место прорыва на проезжей части
const CC: [number, number] = [(CX0 + CX1) / 2, (CZ0 + CZ1) / 2];

const TEX = LIBJ.tex;
const CITY = LIBJ.city;
export const STEAM_LIB = [...Object.values(TEX), ...CITY, ...(LIBJ.chrysler ? [LIBJ.chrysler] : [])];

type V3 = [number, number, number];
type B6 = [number, number, number, number, number, number];
type Cam = {pos: V3; look: V3; fov?: number};
const CAMS: Record<string, Cam> = {
  hook: {pos: [MX + 6, 1.7, 10], look: [MX - 1, 0.6, -6]},
  cut: {pos: [MX - 3, -1.4, 13], look: [MX - 3, -2.0, -2]},
  pipeIn: {pos: [-6, -2.3, 4.6], look: [-6, -2.4, -1]},
  plant: {pos: [-50, 6, 56], look: [-50, 9, -4]},
  basement: {pos: [27, -1.8, 14], look: [27, -2.2, -3]},
  cool: {pos: [30, -1.6, 11], look: [30, -2.4, -3]},
  wide: {pos: [-8, 22, 75], look: [-8, 10, -20]},
  rain: {pos: [MX, -0.8, 14], look: [MX, -1.0, -2]},
  stack: {pos: [MX + 4, 2.5, 15], look: [MX, 1.8, -2]},
  hammer: {pos: [-4, -2.35, 4.4], look: [-4, -2.4, -1]},
  blast: {pos: [-24, 9, 52], look: [-26, 30, -20]},
  final: {pos: [-16, 14, 72], look: [-22, 22, -30]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.cut : c);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const range = (v: any, p: number, dur = 1, delay = 0): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  return lerp(v[0], v[1], easeInOut(clamp01((p - delay) / dur)));
};

// общие геометрии: единичные тела, размер и место задаются масштабом (не освобождаются)
const U_BOX = new THREE.BoxGeometry(1, 1, 1);
const U_CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const U_SPH = new THREE.SphereGeometry(1, 12, 8);
const keepMesh = (g: THREE.BufferGeometry, mat: THREE.Material) => {
  const o = new THREE.Mesh(g, mat);
  o.userData.keep = true;
  return o;
};
const setBox = <T extends THREE.Object3D>(o: T, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): T => {
  o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  o.scale.set(x1 - x0, y1 - y0, z1 - z0);
  return o;
};
const setCyl = <T extends THREE.Object3D>(o: T, a: V3, b: V3, r: number): T => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  o.position.copy(A).add(B).multiplyScalar(0.5);
  o.scale.set(r, d.length(), r);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
};
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};
// UV в метрах, чтобы текстуры не растягивались
const worldUV = (g: THREE.BufferGeometry, s: number) => {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const [u, v] = ny > 0.5 ? [pos.getX(i), pos.getZ(i)] : nx > 0.5 ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u / s;
    uv[i * 2 + 1] = v / s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
const mbox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material | THREE.Material[], s = 2) =>
  new THREE.Mesh(worldUV(box(x0, x1, y0, y1, z0, z1), s), m);
// бокс минус пустоты (подвалы, колодец, магистраль): режем на части вне пустот
const subtract = (b: B6, holes: B6[]): B6[] => {
  for (const h of holes) {
    if (h[0] >= b[1] || h[1] <= b[0] || h[2] >= b[3] || h[3] <= b[2] || h[4] >= b[5] || h[5] <= b[4]) continue;
    const out: B6[] = [];
    let [x0, x1, y0, y1, z0, z1] = b;
    if (h[0] > x0) (out.push([x0, h[0], y0, y1, z0, z1]), (x0 = h[0]));
    if (h[1] < x1) (out.push([h[1], x1, y0, y1, z0, z1]), (x1 = h[1]));
    if (h[2] > y0) (out.push([x0, x1, y0, h[2], z0, z1]), (y0 = h[2]));
    if (h[3] < y1) (out.push([x0, x1, h[3], y1, z0, z1]), (y1 = h[3]));
    if (h[4] > z0) (out.push([x0, x1, y0, y1, z0, h[4]]), (z0 = h[4]));
    if (h[5] < z1) (out.push([x0, x1, y0, y1, h[5], z1]), (z1 = h[5]));
    return out.flatMap((o) => subtract(o, holes));
  }
  return [b];
};
// половина цилиндра (задняя, z<0) вдоль оси x — для разрезанных труб
const halfPipeX = (r: number, x0: number, x1: number, y: number) => {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, 20, 1, true, Math.PI / 2, Math.PI);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, 0);
  return g;
};
// половина цилиндра вдоль оси y — колодец
const shadeY = (g: THREE.BufferGeometry, y: number, r: number) => {
  const pos = g.attributes.position;
  const c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - 0.62 * Math.pow(Math.abs(pos.getY(i) - y) / r, 1.6);
    c.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
};
const halfPipeY = (r: number, y0: number, y1: number, x: number) => {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 20, 1, true, Math.PI / 2, Math.PI);
  g.translate(x, (y0 + y1) / 2, 0);
  return g;
};
// чугунная крышка люка: кольца и решётка
const lidTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#3b3936';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#57534d';
  x.lineWidth = 7;
  for (const r of [120, 96]) (x.beginPath(), x.arc(128, 128, r, 0, Math.PI * 2), x.stroke());
  x.lineWidth = 5;
  for (let k = -80; k <= 80; k += 20) {
    const h = Math.sqrt(Math.max(0, 88 * 88 - k * k));
    x.beginPath(), x.moveTo(128 + k, 128 - h), x.lineTo(128 + k, 128 + h), x.stroke();
    x.beginPath(), x.moveTo(128 - h, 128 + k), x.lineTo(128 + h, 128 + k), x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// неровный ком (асфальт/грунт), а не кубик
const lumpGeo = (seed: number) => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const r = rng(seed);
  const pos = g.attributes.position;
  const cache = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!cache.has(key)) cache.set(key, 0.65 + r() * 0.6);
    const k = cache.get(key)!;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.55, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
};

const World: React.FC<{P: Record<string, any>; life: number; t0: number}> = ({P, life, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const first = useRef(true);
  const p = clamp01(frame / life);
  const t = frame / fps + t0;

  const W0 = useMemo(() => {
    const m: Record<string, any> = {
      brick: libMaterial(TEX.brick, [1, 1], {roughness: 0.95}),
      brickDark: libMaterial(TEX.brick, [1, 1], {color: '#8a7a70', roughness: 0.95}),
      shaft: libMaterial(TEX.brick, [1, 1], {color: '#7c7068', emissive: '#1a1512', side: THREE.DoubleSide}),
      concrete: libMaterial(TEX.concrete, [1, 1], {color: '#d8d6d0'}),
      room: libMaterial(TEX.pave, [1, 1], {color: '#c9c6bd', emissive: '#22211e'}),
      pave: libMaterial(TEX.pave, [1, 1]),
      road: libMaterial(TEX.roof, [1, 1], {color: '#6d6a66'}),
      jacket: libMaterial(TEX.metal, [1, 1], {color: '#c9ced2', metalness: 0.25, roughness: 0.45, side: THREE.DoubleSide}),
      inner: new THREE.MeshStandardMaterial({color: '#cfc6ba', roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, vertexColors: true}),
      steelCut: new THREE.MeshStandardMaterial({color: '#4a4c4f', roughness: 0.5}),
      wool: new THREE.MeshStandardMaterial({color: '#d9c38a', roughness: 1}),
      tank: libMaterial(TEX.metal, [1, 1], {color: '#c3cad0', metalness: 0.05, roughness: 0.5, emissive: '#2a2e31'}),
      boiler: libMaterial(TEX.metal, [1, 1], {color: '#7b6f66', metalness: 0.15, roughness: 0.6}),
      chiller: new THREE.MeshStandardMaterial({color: '#7e8f87', roughness: 0.6}),
      coolant: new THREE.MeshStandardMaterial({color: '#6aa2c8', roughness: 0.45}),
      fan: new THREE.MeshStandardMaterial({color: '#2b2f31', roughness: 0.6}),
      wheel: new THREE.MeshStandardMaterial({color: '#7a2f27', roughness: 0.6}),
      topsoil: new THREE.MeshStandardMaterial({map: topsoilTexture(1 / 6, 1 / 3), roughness: 1, color: '#cdbba8'}),
      clay: new THREE.MeshStandardMaterial({map: clayTexture(1 / 6, 1 / 3), roughness: 1}),
      gravel: new THREE.MeshStandardMaterial({map: gravelTexture(1 / 5, 1 / 5), roughness: 1}),
      rock: new THREE.MeshStandardMaterial({map: rockTexture(1 / 7, 1 / 7), roughness: 1, color: '#ffffff', emissive: '#34383d'}),
      crater: new THREE.MeshStandardMaterial({map: clayTexture(1 / 3, 1 / 3), roughness: 1, color: '#9c8a78', side: THREE.DoubleSide}),
      lumpRoad: new THREE.MeshStandardMaterial({map: topsoilTexture(1, 1), color: '#5a5754', roughness: 1}),
      lumpSoil: new THREE.MeshStandardMaterial({map: clayTexture(1, 1), roughness: 1}),
      steel: new THREE.MeshStandardMaterial({color: '#4c5258', roughness: 0.6, metalness: 0.1}),
      water: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#4f8fc0', roughness: 0.2, transparent: true, opacity: 0.85}),
      drop: new THREE.MeshStandardMaterial({color: '#8fc3ee', roughness: 0.2, transparent: true, opacity: 0.9}),
      lid: new THREE.MeshStandardMaterial({map: lidTexture(), roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide}),
      yellow: new THREE.MeshStandardMaterial({color: '#e0b92f', roughness: 0.7}),
      lamp: new THREE.MeshStandardMaterial({color: '#fff0c8', emissive: '#ffe7a8', emissiveIntensity: 0.7}),
      glass: new THREE.MeshStandardMaterial({color: '#7f95a6', emissive: '#4d5a64', emissiveIntensity: 0.4, roughness: 0.25}),
      hydrant: new THREE.MeshStandardMaterial({color: '#b8372f', roughness: 0.5}),
      stackO: new THREE.MeshStandardMaterial({color: '#e0732a', roughness: 0.6}),
      stackW: new THREE.MeshStandardMaterial({color: '#f1ede4', roughness: 0.6}),
      arrow: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, depthTest: false}),
      far: new THREE.MeshStandardMaterial({color: '#9a8478', roughness: 1}),
    };
    const g = new THREE.Group();
    const A = <T extends THREE.Object3D>(o: T): T => (g.add(o), o);
    // --- пустоты в грунте у плоскости среза
    const H_PIPE: B6 = [PB1, BR0, PY - R2, PY + R2, -R2, 0];
    const H_SHAFT: B6 = [MX - SR - 0.05, MX + SR + 0.05, PY + R2, 0.01, -SR - 0.05, 0];
    const H_ROOM: B6 = [BR0, BR1, RY0, RY1, -8, 0];
    const H_PLANT: B6 = [PB0, PB1, RY0, RY1, -8, 0];
    const H_CRATER: B6 = [CX0, CX1, -2.6, 0.01, CZ0, CZ1];
    const holes = [H_PIPE, H_SHAFT, H_ROOM, H_PLANT, H_CRATER];
    const layer = (b: B6, mat: THREE.Material | THREE.Material[], s: number) => subtract(b, holes).forEach((q) => A(mbox(...q, mat, s)));
    // --- улица: тротуар (z -14..0), проезжая часть за ним, бордюр, пунктир
    layer([XL, XR, -0.3, 0, -14, 0], m.pave, 3);
    layer([XL, XR, -0.3, 0, -40, -14], [m.topsoil, m.topsoil, m.road, m.topsoil, m.topsoil, m.topsoil], 3);
    A(mbox(XL, XR, 0, 0.15, -14.4, -14, m.pave, 2));
    for (let x = XL; x < XR; x += 6) if (x + 3 < CX0 || x > CX1) A(mbox(x, x + 3, 0.01, 0.03, -27.1, -26.9, m.yellow, 1));
    // заплатка асфальта над местом прорыва (до взрыва)
    const patch = A(mbox(CX0, CX1, -0.3, 0, CZ0, CZ1, [m.topsoil, m.topsoil, m.road, m.topsoil, m.topsoil, m.topsoil], 3));
    // --- слои грунта: насыпь, глина, гравий, скала
    layer([XL, XR, -1.2, -0.3, -40, 0], m.topsoil, 3);
    layer([XL, XR, -5.0, -1.2, -40, 0], m.clay, 3);
    layer([XL, XR, -8.0, -5.0, -40, 0], m.gravel, 3);
    layer([XL, XR, -30, -8.0, -40, 0], m.rock, 6);
    // --- подвалы: пол, потолок, стены (все срезы текстурированы)
    for (const [a0, a1] of [[PB0, PB1], [BR0, BR1]]) {
      A(mbox(a0, a1, RY0, RY0 + 0.2, -8, 0, m.concrete, 2));
      A(mbox(a0, a1, RY1 - 0.3, RY1, -8, 0, m.concrete, 2));
      A(mbox(a0, a1, RY0 + 0.2, RY1 - 0.3, -8, -7.8, m.room, 2));
      A(mbox(a0, a0 + 0.25, RY0 + 0.2, RY1 - 0.3, -7.8, 0, m.concrete, 2));
      A(mbox(a1 - 0.25, a1, RY0 + 0.2, RY1 - 0.3, -7.8, 0, m.concrete, 2));
    }
    // --- паровая магистраль: разрезана вдоль, видно нутро; срез стенки — сталь, изоляция, кожух
    const PX0 = -55, PX1 = 23;
    A(new THREE.Mesh(halfPipeX(R2, PX0, PX1, PY), m.jacket));
    A(new THREE.Mesh(shadeY(halfPipeX(R1, PX0, PX1, PY), PY, R1), m.inner));
    for (const sgn of [1, -1]) {
      const yy = (a: number, b: number) => (sgn > 0 ? [PY + a, PY + b] : [PY - b, PY - a]) as [number, number];
      A(mbox(PX0, PX1, ...yy(R1, R1 + 0.05), 0, 0.012, m.steelCut, 1));
      A(mbox(PX0, PX1, ...yy(R1 + 0.05, R2 - 0.03), 0, 0.012, m.wool, 1));
      A(mbox(PX0, PX1, ...yy(R2 - 0.03, R2), 0, 0.012, m.steelCut, 1));
    }
    // фланцы-кольца каждые 8 м и фланец гидроудара
    for (const fx of [-40, -32, -24, -16, -8, HX, 10, 16]) {
      A(new THREE.Mesh(halfPipeX(R2 + 0.07, fx - 0.12, fx + 0.12, PY), m.steel));
      for (const sgn of [1, -1]) A(mbox(fx - 0.12, fx + 0.12, sgn > 0 ? PY + R2 : PY - R2 - 0.07, sgn > 0 ? PY + R2 + 0.07 : PY - R2, 0, 0.014, m.steel, 1));
    }
    // --- станция: котёл в подвале, здание с трубой наверху
    A(setCyl(keepMesh(U_CYL, m.boiler), [-58.5, PY, -2.6], [-52.5, PY, -2.6], 1.35));
    A(setCyl(keepMesh(U_CYL, m.steel), [-56, PY - 1.3, -2.6], [-56, RY0 + 0.2, -2.6], 0.25));
    A(setCyl(keepMesh(U_CYL, m.steel), [-54, PY - 1.3, -2.6], [-54, RY0 + 0.2, -2.6], 0.25));
    A(mbox(-58, -57.2, PY - 0.5, PY + 0.5, -1.27, -1.2, m.wheel, 1)); // топочная дверца
    A(mbox(-62, -45, 0, 15, -13, -2, m.brickDark, 3));
    for (let fl = 0; fl < 3; fl++) for (let k = 0; k < 7; k++) A(mbox(-60.6 + k * 2.3, -59.4 + k * 2.3, 3 + fl * 4, 5.4 + fl * 4, -2.02, -1.95, m.glass, 1));
    A(setCyl(keepMesh(U_CYL, m.brickDark), [-49, 15, -8], [-49, 40, -8], 1.5));
    A(setCyl(keepMesh(U_CYL, m.stackW), [-49, 37, -8], [-49, 38.6, -8], 1.52));
    // --- подвал дома: задвижка, теплообменник, стояк в дом, чиллер с трубами холода
    A(setCyl(keepMesh(U_CYL, m.steel), [21.2, PY + R2, -0.4], [21.2, PY + 1.3, -0.4], 0.06));
    A(setCyl(keepMesh(U_CYL, m.wheel), [21.2, PY + 1.3, -0.4], [21.2, PY + 1.36, -0.4], 0.32));
    A(setCyl(keepMesh(U_CYL, m.tank), [23, -2.6, -3], [27.5, -2.6, -3], 0.95));
    A(setCyl(keepMesh(U_CYL, m.jacket), [PX1, PY, -0.3], [PX1, PY, -3], 0.3));
    A(setCyl(keepMesh(U_CYL, m.jacket), [26.5, -1.7, -3], [26.5, RY1, -3], 0.22));
    A(mbox(29, 33.2, RY0 + 0.2, -2.3, -6.5, -2.2, m.chiller, 1));
    for (const fx of [30.1, 32.1]) {
      const f = A(keepMesh(U_CYL, m.fan));
      setCyl(f, [fx, -3.0, -2.2], [fx, -3.0, -2.15], 0.7);
    }
    for (const cx of [29.6, 32.6]) A(setCyl(keepMesh(U_CYL, m.coolant), [cx, -2.3, -4.5], [cx, RY1, -4.5], 0.16));
    A(setCyl(keepMesh(U_CYL, m.steel), [27.5, -2.9, -3.2], [29, -2.9, -3.2], 0.12));
    // --- колодец под люком: кирпичная полутруба, срез стенки, крышка
    A(new THREE.Mesh(halfPipeY(SR, PY + R2, -0.3, MX), m.shaft));
    for (const sx of [-1, 1]) A(mbox(MX + sx * SR - (sx > 0 ? 0 : 0.05), MX + sx * SR + (sx > 0 ? 0.05 : 0), PY + R2, 0, -0.06, 0, m.brick, 1));
    const lid = A(new THREE.Mesh(new THREE.CircleGeometry(SR + 0.08, 24, 0, Math.PI), m.lid));
    lid.rotation.x = -Math.PI / 2;
    lid.position.set(MX, 0.02, 0);
    // --- улица: гидрант, фонари
    const hy = new THREE.Group();
    hy.add(setCyl(keepMesh(U_CYL, m.hydrant), [0, 0, 0], [0, 0.7, 0], 0.2));
    const hd = keepMesh(U_SPH, m.hydrant);
    hd.position.set(0, 0.72, 0);
    hd.scale.set(0.22, 0.16, 0.22);
    hy.add(hd, setCyl(keepMesh(U_CYL, m.hydrant), [-0.3, 0.45, 0], [0.3, 0.45, 0], 0.08));
    hy.position.set(-6, 0, -6);
    A(hy);
    for (const lx of [-14, 14, -38]) {
      A(setCyl(keepMesh(U_CYL, m.steel), [lx, 0, -3], [lx, 7, -3], 0.1));
      A(setCyl(keepMesh(U_CYL, m.steel), [lx, 7, -3], [lx + 1.8, 7.3, -3], 0.06));
      A(setBox(keepMesh(U_BOX, m.steel), lx + 1.5, lx + 2.4, 7.1, 7.3, -3.2, -2.8));
    }
    // --- оранжево-белая труба на люке: опускается сверху
    const stack = A(new THREE.Group());
    for (let k = 0; k < 6; k++) stack.add(setCyl(keepMesh(U_CYL, k % 2 ? m.stackW : m.stackO), [0, k * 0.6, 0], [0, (k + 1) * 0.6, 0], 0.36 - k * 0.02));
    stack.add(setCyl(keepMesh(U_CYL, m.stackO), [0, 3.6, 0], [0, 3.9, 0], 0.24));
    stack.visible = false;
    // --- воронка прорыва (видна после взрыва) и комья
    const bowl = A(new THREE.Mesh(new THREE.LatheGeometry([0, 0.5, 1.6, 2.6, 3.5, 4.3, 4.6].map((rr, i) => new THREE.Vector2(rr, -2.5 + [0, 0.05, 0.4, 0.95, 1.6, 2.2, 2.52][i])), 20), m.crater));
    bowl.position.set(CC[0], 0, CC[1]);
    bowl.visible = false;
    const rl = rng(11);
    const lumps = Array.from({length: 26}, (_, i) => {
      const o = A(new THREE.Mesh(lumpGeo(100 + i), i % 3 ? m.lumpRoad : m.lumpSoil));
      const ang = rl() * Math.PI * 2, sp = 6 + rl() * 10;
      o.visible = false;
      return {o, s: 0.35 + rl() * 0.5, vx: Math.cos(ang) * sp * 0.35, vz: Math.sin(ang) * sp * 0.35, vy: 9 + rl() * 10, spin: rl() * 6, r0: 2 + rl() * 2, ang};
    });
    // --- город: модели Нью-Йорка, Крайслер, дальние дома, облака
    const place = (id: string, x: number, z: number, h: number, ry = 0) => {
      const o = libModel(id, {height: h});
      o.rotation.y = ry;
      o.position.set(x, 0, z);
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      o.position.x += x - (b.min.x + b.max.x) / 2;
      o.position.z += z - (b.min.z + b.max.z) / 2;
      o.position.y -= b.min.y;
      g.add(o);
    };
    place(CITY[2], 27, -46, 30, 0);
    place(CITY[0], 4, -50, 46, 0.2);
    place(CITY[2], -46, -48, 32, Math.PI / 2);
    place(CITY[1], 48, -82, 44, -0.3);
    if (LIBJ.chrysler) place(LIBJ.chrysler, -14, -150, 105, 0.3);
    place(CITY[3], 40, -150, 80, 0);
    const r = rng(5);
    for (let i = 0; i < 28; i++) {
      const x = -90 + i * 7 + r() * 3, z = -85 - r() * 50, w = 6 + r() * 6, h = 14 + r() * 34;
      if (Math.abs(x + 14) < 12) continue;
      g.add(mbox(x - w / 2, x + w / 2, 0, h, z - w / 2, z + w / 2, m.far, 4));
    }
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(200 + i), transparent: true, depthWrite: false, fog: false}));
      sp.scale.set(50 + r() * 20, 24 + r() * 8, 1);
      sp.position.set(-100 + i * 32 + r() * 10, 90 + r() * 25, -240);
      g.add(sp);
    }
    // --- пар: пулы спрайтов (люк, труба на люке, колодец, точки у трубы, дымовая труба станции, фланец, столб взрыва)
    const pool = (n: number, seed: number) =>
      Array.from({length: n}, (_, k) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(seed + k), transparent: true, depthWrite: false, fog: false, opacity: 0}));
        sp.visible = false;
        g.add(sp);
        return sp;
      });
    const puffs = {lid: pool(12, 300), stack: pool(10, 330), shaft: pool(8, 360), seep: pool(10, 380), plant: pool(8, 400), burst: pool(10, 420), plume: pool(46, 440)};
    // капли дождя, просачивающиеся сквозь грунт к трубе (на плоскости среза)
    const seeps = Array.from({length: 16}, (_, i) => {
      const o = A(keepMesh(U_SPH, m.drop));
      o.visible = false;
      let x = MX - 3.4 + (i / 15) * 6.8;
      if (Math.abs(x - MX) < SR + 0.15) x += x < MX ? -0.6 : 0.6;
      return {o, x, ph: r()};
    });
    // вода внутри трубы: конденсат на дне и «пробка»
    const cond = A(keepMesh(U_BOX, m.water));
    const slug = A(keepMesh(U_BOX, m.water));
    cond.visible = slug.visible = false;
    const steamIn = Array.from({length: 18}, (_, k) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(500 + k), transparent: true, depthWrite: false, fog: false, opacity: 0}));
      sp.visible = false;
      g.add(sp);
      return sp;
    });
    // дождь: пул штрихов
    const NR = 700;
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 6), 3));
    const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({color: '#b3cde0', transparent: true, opacity: 0.85, fog: false}));
    rain.frustumCulled = false;
    rain.visible = false;
    g.add(rain);
    const hemi = new THREE.HemisphereLight('#eef5ff', '#7a6a58', 1.5);
    const sun = new THREE.DirectionalLight('#fff2dc', 1.9);
    sun.position.set(18, 40, 30);
    g.add(hemi, sun);
    const rnd2 = rng(77);
    const rainSeed = Array.from({length: NR}, () => [rnd2(), rnd2(), rnd2()]);
    return {m, g, steamIn, stack, patch, bowl, lumps, puffs, seeps, cond, slug, rain, rainSeed, hemi, sun};
  }, []);
  const {m} = W0;

  useLayoutEffect(() => {
    scene.background = skyTexture();
    scene.fog = new THREE.Fog('#dfe7ef', 140, 380);
    scene.add(W0.g);
    return () => void scene.remove(W0.g);
  }, []);
  const dyn = useMemo(() => new THREE.Group(), []);
  useLayoutEffect(() => {
    scene.add(dyn);
    return () => void scene.remove(dyn);
  }, []);

  useLayoutEffect(() => {
    dyn.children.slice().forEach((c: any) => {
      dyn.remove(c);
      if (!c.userData.keep) c.geometry?.dispose?.();
    });
    const add = (o: THREE.Object3D) => dyn.add(o);
    const sec = life / fps; // длительность сцены в секундах

    // --- камера
    const [ca, cb] = (P.cam ?? ['cut', 'cut']).map(cam);
    const kc = easeInOut(p);
    const pos = ca.pos.map((v: number, i: number) => lerp(v, cb.pos[i], kc));
    const look = ca.look.map((v: number, i: number) => lerp(v, cb.look[i], kc));

    const rainK = range(P.rain, p, 0.3);
    const seepK = range(P.seep, p, 0.4);
    const vapor = P.vapor ?? 1;
    const ev = P.events ?? {};

    // --- труба на люке: опускается сверху и встаёт на крышку
    const sk = range(P.stack, p, 0.5, 0.15);
    W0.stack.visible = sk > 0.001;
    W0.stack.position.set(MX, (1 - sk) * 9, -0.42);

    // --- пар над люком / из трубы / в колодце
    const puff = (sp: THREE.Sprite, x: number, y: number, z: number, sc: number, op: number) => {
      sp.visible = op > 0.004;
      sp.position.set(x, y, z);
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).opacity = op;
    };
    const lidOut = vapor * (1 - sk) * (0.6 + 0.4 * rainK);
    W0.puffs.lid.forEach((sp, k) => {
      const u = ((t * 0.28 + k / 12) % 1 + 1) % 1;
      puff(sp, MX + Math.sin(k * 2.1 + u * 3) * (0.3 + u), 0.2 + u * 5, -0.4 + (k % 3) * 0.1, 0.9 + u * 3, lidOut * 0.6 * Math.sin(Math.PI * u));
    });
    W0.puffs.stack.forEach((sp, k) => {
      const u = ((t * 0.3 + k / 10) % 1 + 1) % 1;
      puff(sp, MX + Math.sin(k * 1.7 + u * 2) * (0.3 + u * 1.2), 4.0 + u * 7, -0.42, 0.8 + u * 3.6, vapor * (sk > 0.98 ? 1 : 0) * 0.6 * Math.sin(Math.PI * u));
    });
    W0.puffs.shaft.forEach((sp, k) => {
      const u = ((t * 0.35 + k / 8) % 1 + 1) % 1;
      puff(sp, MX + Math.sin(k * 2.7 + u * 4) * 0.25, PY + R2 + u * 2.2, -0.35, 0.6 + u * 0.8, vapor * 0.55 * Math.sin(Math.PI * u));
    });
    // --- дождевая вода сквозь грунт к трубе: капли и клубочки пара на горячем кожухе
    W0.seeps.forEach((d, i) => {
      d.o.visible = seepK > 0.01;
      if (!d.o.visible) return;
      const u = ((t / 1.5 + d.ph) % 1 + 1) % 1;
      d.o.position.set(d.x, lerp(-0.4, PY + R2 + 0.05, u * u), 0.06);
      d.o.scale.set(0.07, 0.11, 0.07);
    });
    W0.puffs.seep.forEach((sp, k) => {
      const d = W0.seeps[(k * 3 + 1) % W0.seeps.length];
      const u = ((t / 1.5 + d.ph + 0.0) % 1 + 1) % 1;
      const v = ((t * 0.6 + k / 10) % 1 + 1) % 1;
      puff(sp, d.x + Math.sin(k + v * 3) * 0.15, PY + R2 + 0.05 + v * 0.3, 0.1, 0.2 + v * 0.3, seepK * 0.45 * Math.sin(Math.PI * v) * (u > 0 ? 1 : 1));
    });
    // --- дым/пар станции
    W0.puffs.plant.forEach((sp, k) => {
      const u = ((t * 0.18 + k / 8) % 1 + 1) % 1;
      puff(sp, -49 + u * 6 + Math.sin(k * 1.3) * 1.2, 40 + u * 12, -8, 3 + u * 8, 0.5 * Math.sin(Math.PI * u));
    });

    // --- пар внутри трубы: стрелки потока от станции к дому
    const flowA = range(P.flow, p, 0.2);
    // --- конденсат и гидроудар (по доле сцены): вода копится, «пробка» разгоняется, удар во фланец
    const hk = P.hammer ? p : -1;
    let shake = 0;
    const condH = P.hammer ? (hk < 0.45 ? lerp(0.05, 0.32, hk / 0.45) : hk < 0.6 ? lerp(0.32, 0.08, (hk - 0.45) / 0.15) : 0.08) : range(P.cond, p, 0.6) * 0.32;
    W0.cond.visible = condH > 0.02;
    if (W0.cond.visible) {
      const w = Math.sqrt(Math.max(0.01, R1 * R1 - (R1 - condH) * (R1 - condH)));
      setBox(W0.cond, -16, HX - 0.15, PY - R1 + 0.01, PY - R1 + condH, -w, -0.01);
    }
    const IMP = 0.62;
    W0.slug.visible = !!P.hammer && hk > 0.45 && hk < IMP;
    if (W0.slug.visible) {
      const k = (hk - 0.45) / (IMP - 0.45);
      const x1 = lerp(-12, HX - 0.15, k * k);
      setBox(W0.slug, x1 - 2.2, x1, PY - R1 + 0.01, PY + R1 - 0.01, -R1 * 0.98, -0.01);
    }
    const tImp = P.hammer ? (hk - IMP) * sec : -1;
    if (tImp >= 0) shake = Math.exp(-tImp * 5) * 0.16;
    W0.puffs.burst.forEach((sp, k) => {
      const v = tImp >= 0 ? clamp01(tImp / 1.4 - k * 0.03) : 0;
      const a = (k / 10) * Math.PI * 2;
      puff(sp, HX + Math.cos(a) * (0.3 + v * 1.4), PY + Math.sin(a) * (0.6 + v * 1.0), 0.3, 0.4 + v * 1.4, v > 0 ? 0.7 * (1 - v) : 0);
    });
    const flowOn = P.hammer ? (hk < IMP ? 1 : 0) : 1;
    W0.steamIn.forEach((sp, k) => {
      const span = 24;
      const x = pos[0] - span / 2 + ((((t * 2.2 + (k / 18) * span) % span) + span) % span);
      const yy = PY + Math.sin(k * 2.7) * R1 * 0.45;
      const inX = x > PB1 && x < BR0;
      puff(sp, x, yy, -R1 * 0.5, 0.7 + (k % 3) * 0.2, inX ? flowA * flowOn * 0.4 : 0);
    });
    // --- взрыв 2007 года: заплатка исчезает, комья летят, столб пара выше Крайслера
    const tb = ev.blast !== undefined ? t - ev.blast : -1;
    const blown = tb >= 0;
    W0.patch.visible = !blown;
    W0.bowl.visible = blown;
    if (tb >= 0 && tb < 1.2) shake = Math.max(shake, Math.exp(-tb * 3) * 0.5);
    W0.lumps.forEach((l) => {
      l.o.visible = blown;
      if (!blown) return;
      const tt = tb;
      const vy = l.vy, tl = (2 * vy) / 9.8; // время до падения обратно на уровень улицы
      const tc = Math.min(tt, tl);
      const x = CC[0] + Math.cos(l.ang) * l.r0 + l.vx * tc, z = CC[1] + Math.sin(l.ang) * l.r0 + l.vz * tc;
      const y = Math.max(0.15, vy * tc - 4.9 * tc * tc);
      l.o.position.set(x, y, z);
      l.o.scale.setScalar(l.s);
      l.o.rotation.set(tc * l.spin, tc * l.spin * 0.7, 0);
    });
    const plumeK = P.plume === undefined ? 1 : range(P.plume, p);
    W0.puffs.plume.forEach((sp, k) => {
      if (!blown) return puff(sp, 0, 0, 0, 1, 0);
      const born = k * 0.05;
      const a = tb - born;
      if (a < 0) return puff(sp, 0, 0, 0, 1, 0);
      // поднимается быстро, потом медленно и расплывается; низ подпитывается постоянно
      const cyc = 7;
      const u = (a % cyc) / cyc;
      const hgt = 125 * (1 - Math.pow(1 - u, 2.2)) * (k % 4 === 0 ? 0.35 : 1);
      const sc = 6 + u * 28 + (k % 5);
      const op = (a < cyc ? 0.85 : 0.75) * Math.min(1, a * 3) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.08)) * plumeK;
      puff(sp, CC[0] + Math.sin(k * 2.3 + u * 2) * (1.5 + u * 8), 2 + hgt, CC[1] + Math.cos(k * 1.7) * 3, sc, op);
    });

    // --- дождь и освещение
    W0.rain.visible = rainK > 0.01;
    if (W0.rain.visible) {
      const arr = W0.rain.geometry.attributes.position.array as Float32Array;
      const cx = pos[0];
      W0.rainSeed.forEach(([a, b, c], i) => {
        const x = cx - 30 + a * 60, z = -34 + c * 80;
        const y = 70 - ((t * 48 + b * 70) % 70);
        arr.set([x, y, z, x - 0.25, y + 1.6, z], i * 6);
      });
      W0.rain.geometry.attributes.position.needsUpdate = true;
    }
    W0.hemi.intensity = lerp(1.5, 1.05, rainK);
    W0.sun.intensity = lerp(1.9, 0.8, rainK);

    // --- белые стрелки
    const arrows = (pts: V3[], n: number, speed: number, a: number, sc = 1) => {
      if (a <= 0) return;
      const seg = pts.slice(1).map((q, i) => new THREE.Vector3(...q).sub(new THREE.Vector3(...pts[i])));
      const len = seg.reduce((s, v) => s + v.length(), 0);
      for (let i = 0; i < n; i++) {
        let d = (((t * speed + (i / n) * len) % len) + len) % len;
        let j = 0;
        while (j < seg.length - 1 && d > seg[j].length()) d -= seg[j++].length();
        const dir = seg[j].clone().normalize();
        const pp = new THREE.Vector3(...pts[j]).add(dir.clone().multiplyScalar(d));
        const ar = new THREE.Mesh(arrowGeo, m.arrow);
        ar.userData.keep = true;
        ar.position.copy(pp).add(new THREE.Vector3(0, 0, 0.4));
        ar.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2;
        ar.scale.setScalar(sc);
        ar.renderOrder = 10;
        add(ar);
      }
      m.arrow.opacity = Math.min(1, a);
    };
    arrows([[-52, PY, 0], [22.5, PY, 0]], 40, 4, flowA * flowOn, 0.55); // пар по магистрали
    arrows([[26.5, -1.6, -2.6], [26.5, -0.4, -2.6]], 3, 1.2, range(P.heatUp, p, 0.2), 0.45); // в дом
    arrows([[29.6, -2.2, -4.2], [29.6, -0.4, -4.2]], 3, 1.2, range(P.coldUp, p, 0.2), 0.45);
    arrows([[32.6, -0.4, -4.2], [32.6, -2.2, -4.2]], 3, 1.2, range(P.coldUp, p, 0.2), 0.45);

    // --- камера (с тряской при ударе)
    const sh = (k: number) => Math.sin(t * 61 + k) * Math.sin(t * 37 + k * 2) * shake;
    camera.position.set(pos[0] + sh(1), pos[1] + sh(2), pos[2]);
    camera.lookAt(look[0] + sh(3), look[1] + sh(4), look[2]);
    const fov = lerp(ca.fov ?? 40, cb.fov ?? 40, kc);
    if ((camera as THREE.PerspectiveCamera).fov !== fov) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      camera.updateProjectionMatrix();
    }
    if (first.current) {
      first.current = false;
      gl.render(scene, camera);
    }
  }, [frame]);
  return null;
};

// белая стрелка-шеврон
const arrowGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.45);
  s.lineTo(0.38, -0.05);
  s.lineTo(0.16, -0.05);
  s.lineTo(0.16, -0.4);
  s.lineTo(-0.16, -0.4);
  s.lineTo(-0.16, -0.05);
  s.lineTo(-0.38, -0.05);
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();

const Loader: React.FC<{P: Record<string, any>; life: number; t0: number}> = ({P, life, t0}) => {
  const lib = useLib(STEAM_LIB);
  return lib ? <World P={P} life={life} t0={t0} /> : null;
};

export const SteamScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 40, position: [0, -2, 13], near: 0.3, far: 800}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <Loader P={P} life={life} t0={scene.start ?? 0} />
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
