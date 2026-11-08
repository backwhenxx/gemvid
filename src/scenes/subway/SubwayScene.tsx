// Мир «метро и насосы»: нью-йоркская улица и тоннель метро в разрезе вдоль путей (лицевая плоскость z=0 к зрителю).
// Над тоннелем — канализационный коллектор и бывший ручей в грунте, под путями — приямки с насосами,
// от каждого — труба вверх, в коллектор. Статичный мир собирается один раз, кадр лишь двигает его части.
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
const SLAB0 = -6.55, SLAB1 = -6.0; // перекрытие тоннеля
const FLOOR = -11.75; // верх пола тоннеля
const FL0 = -14.35; // низ плиты пола
const PIT0 = -13.55; // дно приямка
const BACK = -9.5; // задняя стена тоннеля
const PW = 1.4, PD = 1.6; // полуширина приямка по x и глубина по z
const LO = -13.0, HI = -12.1; // уровни воды: насос выключился / включился
const SEW0 = -3.3, SEW1 = -1.5; // коллектор
const SEWW = -2.55; // поверхность воды в коллекторе
const PZ = 0.14; // трубы лежат на плоскости среза
const PITS = [-42, -35, -28, -21, -14, -7, 0, 7, 14];
const HERO = 6; // приямок под камерой x = 0
const TRACKS = [-4.2, -7.4];
const PLAT_X0 = 24;
const FLOOD_MAX = 4.0; // метров воды над полом при flood = 1

const TEX = LIBJ.tex;
const CITY = LIBJ.city;
export const SUBWAY_LIB = [...Object.values(TEX), ...CITY];

type V3 = [number, number, number];
type Cam = {pos: V3; look: V3; fov?: number};
const CAMS: Record<string, Cam> = {
  street: {pos: [8, 8, 48], look: [0, -1, -8]},
  full: {pos: [0, -6, 27], look: [0, -6.6, -2]},
  seep: {pos: [-6, -8.5, 20], look: [-6, -8, -3]},
  pit: {pos: [0.5, -11.1, 11], look: [0.5, -11.3, -1]},
  panL: {pos: [-20, -6.5, 30], look: [-20, -7, -2]},
  sewer: {pos: [-6, -3.2, 22], look: [-6, -3, -3]},
  pools: {pos: [31, 120, 30], look: [31, 0, -21]},
  rainView: {pos: [0, -2, 36], look: [0, -4, -2]},
  flood1: {pos: [22, -9.5, 30], look: [22, -9.8, -2]},
  flood2: {pos: [18, -8, 44], look: [18, -8.5, -2]},
  final: {pos: [14, -7, 52], look: [14, -8, -2]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.full : c);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const range = (v: any, p: number, dur = 1, delay = 0): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  return lerp(v[0], v[1], easeInOut(clamp01((p - delay) / dur)));
};

// общие геометрии: единичные тела, размер и место задаются масштабом (не освобождаются)
const U_BOX = new THREE.BoxGeometry(1, 1, 1);
const U_CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
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
// цилиндр между двумя точками
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
// UV в метрах, чтобы бетон и кирпич не растягивались
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

// состояние приямка: k — уровень воды 0..1, on — насос работает (идёт откачка)
const pitState = (i: number, ph: number) => {
  const u = (((ph / 4.6 + i * 0.37) % 1) + 1) % 1;
  return {k: u < 0.78 ? u / 0.78 : 1 - (u - 0.78) / 0.22, on: u >= 0.78};
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
      concrete: libMaterial(TEX.pave, [1, 1], {color: '#e2e2de'}),
      tunnel: libMaterial(TEX.pave, [1, 1], {color: '#b3bcc4', emissive: '#1d2226'}),
      tile: libMaterial(TEX.pave, [1, 1], {color: '#f1ede2'}),
      sewerWall: libMaterial(TEX.brick, [1, 1], {color: '#5d6d70', emissive: '#12181a'}),
      trainBody: libMaterial(TEX.metal, [1, 1], {color: '#cfd6dc', metalness: 0.15, roughness: 0.5}),
      glass: new THREE.MeshStandardMaterial({color: '#26323c', emissive: '#8a7a4c', emissiveIntensity: 0.55, roughness: 0.3}),
      pave: libMaterial(TEX.pave, [1, 1]),
      road: libMaterial(TEX.roof, [1, 1], {color: '#6d6a66'}),
      metal: libMaterial(TEX.metal, [1, 1], {color: '#7d8791', metalness: 0.2, roughness: 0.55}),
      sleeper: libMaterial(TEX.cedar, [1, 1], {color: '#4d3a2a'}),
      topsoil: new THREE.MeshStandardMaterial({map: topsoilTexture(1 / 6, 1 / 3), roughness: 1, color: '#cdbba8'}),
      clay: new THREE.MeshStandardMaterial({map: clayTexture(1 / 6, 1 / 3), roughness: 1}),
      gravel: new THREE.MeshStandardMaterial({map: gravelTexture(1 / 5, 1 / 5), roughness: 1}),
      rock: new THREE.MeshStandardMaterial({map: rockTexture(1 / 7, 1 / 7), roughness: 1, color: '#ffffff', emissive: '#34383d'}),
      steel: new THREE.MeshStandardMaterial({color: '#4c5258', roughness: 0.6, metalness: 0.1}),
      rail: new THREE.MeshStandardMaterial({color: '#7a7f84', roughness: 0.4, metalness: 0.4}),
      pipe: new THREE.MeshStandardMaterial({color: '#aeb6bd', roughness: 0.45, metalness: 0.1}),
      pipeOn: new THREE.MeshStandardMaterial({color: '#4a8fd0', roughness: 0.35, metalness: 0.1}),
      stream: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#4f8fc0', roughness: 0.2, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}),
      sewerWater: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#5f9fb0', roughness: 0.25, transparent: true, opacity: 0.95}),
      waterDeep: new THREE.MeshStandardMaterial({color: '#3f86c8', roughness: 0.3, transparent: true, opacity: 0.6}),
      flood: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#4f8fc0', roughness: 0.2, transparent: true, opacity: 0.7}),
      puddle: new THREE.MeshStandardMaterial({color: '#5d86ad', roughness: 0.2, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}),
      streak: new THREE.MeshStandardMaterial({color: '#4d5e6c', roughness: 0.4, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}),
      drop: new THREE.MeshStandardMaterial({color: '#8fc3ee', roughness: 0.2, transparent: true, opacity: 0.9}),
      pumpBody: new THREE.MeshStandardMaterial({color: '#2f6fa3', roughness: 0.45, metalness: 0.1}),
      cabinet: new THREE.MeshStandardMaterial({color: '#5e6b61', roughness: 0.6}),
      yellow: new THREE.MeshStandardMaterial({color: '#e0b92f', roughness: 0.7}),
      stripe: new THREE.MeshStandardMaterial({color: '#2e6f8f', roughness: 0.6}),
      lamp: new THREE.MeshStandardMaterial({color: '#fff0c8', emissive: '#ffe7a8', emissiveIntensity: 0.7}),
      hydrant: new THREE.MeshStandardMaterial({color: '#b8372f', roughness: 0.5}),
      stackO: new THREE.MeshStandardMaterial({color: '#e0732a', roughness: 0.6}),
      stackW: new THREE.MeshStandardMaterial({color: '#f1ede4', roughness: 0.6}),
      grate: new THREE.MeshStandardMaterial({color: '#25292c', roughness: 0.7}),
      poolRim: new THREE.MeshStandardMaterial({color: '#e9e7e0', roughness: 0.6}),
      poolWater: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#58b6d8', roughness: 0.25}),
      white: new THREE.MeshBasicMaterial({color: '#f4f6f8'}),
      arrow: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, depthTest: false}),
      red: new THREE.MeshBasicMaterial({color: '#e0443a'}),
      green: new THREE.MeshBasicMaterial({color: '#3fc35a'}),
      far: new THREE.MeshStandardMaterial({color: '#9a8478', roughness: 1}),
    };
    const g = new THREE.Group();
    const A = <T extends THREE.Object3D>(o: T): T => (g.add(o), o);
    // --- улица: тротуар (z -14..0), проезжая часть за ним, бордюр, пунктир посередине
    A(mbox(XL, XR, -0.3, 0, -14, 0, m.pave, 3));
    A(mbox(XL, XR, -0.3, 0, -40, -14, [m.topsoil, m.topsoil, m.road, m.topsoil, m.topsoil, m.topsoil], 3));
    A(mbox(XL, XR, -0.3, 0.15, -14.4, -14, m.pave, 2));
    for (let x = XL; x < XR; x += 6) A(mbox(x, x + 3, 0.01, 0.03, -27.1, -26.9, m.yellow, 1));
    // --- слои грунта в разрезе, коллектор, перекрытие тоннеля
    A(mbox(XL, XR, -1.0, -0.3, -40, 0, m.topsoil, 3));
    A(mbox(XL, XR, SEW1, -1.0, -40, 0, m.brick, 2)); // свод коллектора
    A(mbox(XL, XR, SEW0, SEW1, -40, -6, m.sewerWall, 2)); // задняя стена коллектора (сырая)
    A(mbox(XL, XR, SEW0 - 0.3, SEW0, -40, 0, m.brick, 2)); // лоток коллектора
    A(mbox(XL, XR, -4.9, SEW0 - 0.3, -40, 0, m.clay, 3));
    A(mbox(XL, XR, SLAB1, -4.9, -40, 0, m.gravel, 3));
    A(mbox(XL, XR, SLAB0, SLAB1, -10.2, 0, m.concrete, 3));
    // вода в коллекторе
    A(mbox(XL, XR, SEW0, SEWW, -5.9, -0.05, m.sewerWater, 3));
    // бывший ручей в гравии: лента воды на плоскости среза
    const stream = A(mbox(XL, XR, -5.7, -4.7, 0.02, 0.06, m.stream, 2));
    // --- тоннель: задняя стена, плитка, потолок, плита пола с приямками
    A(mbox(XL, XR, FL0, SLAB0, -10.2, BACK, m.tunnel, 2));
    A(mbox(PLAT_X0, XR, FLOOR, FLOOR + 3.5, BACK, BACK + 0.05, m.tile, 2));
    A(mbox(PLAT_X0, XR, FLOOR + 3.0, FLOOR + 3.3, BACK + 0.05, BACK + 0.08, m.stripe, 1));
    const edges = [XL, ...PITS.flatMap((x) => [x - PW, x + PW]), XR];
    for (let i = 0; i < edges.length; i += 2) A(mbox(edges[i], edges[i + 1], FL0, FLOOR, -10.2, 0, m.concrete, 3));
    for (const x of PITS) {
      A(mbox(x - PW, x + PW, FL0, FLOOR, -10.2, -PD, m.concrete, 3)); // задняя стенка приямка
      A(mbox(x - PW, x + PW, FL0, PIT0, -PD, 0, m.concrete, 3)); // дно приямка
    }
    A(mbox(XL, XR, -40, FL0, -40, 0, m.rock, 6)); // скала под плитой
    // --- пути: шпалы (один InstancedMesh), рельсы, платформа
    const nS = Math.ceil((XR - XL) / 0.8);
    const sl = new THREE.InstancedMesh(U_BOX, m.sleeper, nS * 2);
    const dm = new THREE.Object3D();
    TRACKS.forEach((zc, j) => {
      for (let i = 0; i < nS; i++) {
        dm.position.set(XL + i * 0.8, FLOOR + 0.1, zc);
        dm.scale.set(0.26, 0.2, 2.5);
        dm.updateMatrix();
        sl.setMatrixAt(j * nS + i, dm.matrix);
      }
      for (const dz of [-0.72, 0.72]) A(mbox(XL, XR, FLOOR + 0.2, FLOOR + 0.35, zc + dz - 0.05, zc + dz + 0.05, m.rail, 1));
    });
    sl.frustumCulled = false;
    A(sl);
    A(mbox(PLAT_X0, XR, FLOOR, FLOOR + 0.8, -3.0, 0, m.concrete, 2));
    A(mbox(PLAT_X0, XR, FLOOR + 0.8, FLOOR + 0.83, -3.0, -2.5, m.yellow, 1));
    // колонны, светильники, кабельный лоток
    for (let x = XL + 3; x < XR; x += 6) {
      A(mbox(x - 0.18, x + 0.18, FLOOR, SLAB0, -5.95, -5.65, m.steel, 1));
      A(mbox(x - 0.4, x + 0.4, SLAB0 - 0.25, SLAB0, -6.1, -5.5, m.steel, 1));
      A(mbox(x + 2.4, x + 3.6, SLAB0 - 0.12, SLAB0 - 0.02, -5.9, -5.7, m.lamp, 1));
    }
    A(mbox(XL, XR, SLAB0 - 0.25, SLAB0 - 0.15, -9.3, -8.9, m.steel, 1));
    // --- приямки: вода, насос, поплавок, щиток, трубы вверх в коллектор
    const pits = PITS.map((x, i) => {
      const xr = x + 0.9;
      const water = A(keepMesh(U_BOX, m.waterDeep));
      const pump = A(keepMesh(U_CYL, m.pumpBody));
      pump.position.set(x - 0.1, PIT0 + 0.57, -0.8);
      pump.scale.set(0.3, 1.1, 0.3);
      const cap = A(keepMesh(U_SPH, m.pumpBody));
      cap.position.set(x - 0.1, PIT0 + 1.12, -0.8);
      cap.scale.set(0.3, 0.2, 0.3);
      const rod = A(keepMesh(U_CYL, m.steel));
      setCyl(rod, [x - 0.95, PIT0, -0.9], [x - 0.95, FLOOR - 0.2, -0.9], 0.03);
      const ball = A(keepMesh(U_SPH, m.red));
      ball.scale.setScalar(0.2);
      const cab = A(keepMesh(U_BOX, m.cabinet));
      setBox(cab, x + 1.85, x + 2.35, FLOOR, FLOOR + 0.8, -1.2, -0.6);
      const lamp = A(keepMesh(U_SPH, m.red));
      lamp.position.set(x + 2.1, FLOOR + 0.92, -0.9);
      lamp.scale.setScalar(0.1);
      // трубы: от насоса вбок, к плоскости среза, вверх, назад в коллектор, носик над водой
      const pipes: THREE.Object3D[] = [];
      const seg = (a: V3, b: V3, r = 0.11) => pipes.push(A(setCyl(keepMesh(U_CYL, m.pipe), a, b, r)));
      seg([x + 0.2, -12.6, -0.8], [xr, -12.6, -0.8]);
      seg([xr, -12.6, -0.8], [xr, -12.6, PZ]);
      seg([xr, -12.6, PZ], [xr, -2.0, PZ]);
      seg([xr, -2.0, PZ], [xr, -2.0, -0.8]);
      seg([xr, -2.0, -0.8], [xr, -2.5, -0.8], 0.09);
      for (const [yy, zz] of [[-12.6, -0.8], [-12.6, PZ], [-2.0, PZ], [-2.0, -0.8]]) {
        const j = A(keepMesh(U_SPH, m.pipe));
        j.position.set(xr, yy, zz);
        j.scale.setScalar(0.14);
        pipes.push(j);
      }
      // метки уровней на задней стенке приямка (красная — включение насоса)
      const mk = [LO, HI].map((y, k) => {
        const o = A(keepMesh(U_BOX, k ? m.red : m.white));
        setBox(o, x - PW, x + PW, y - 0.03, y + 0.03, -PD + 0.01, -PD + 0.04);
        o.visible = false;
        return o;
      });
      return {x, water, ball, lamp, pipes, mk};
    });
    // --- капли с потолка, лужи, мокрые разводы на задней стене
    const r = rng(5);
    const drops = Array.from({length: 36}, (_, i) => {
      const o = A(keepMesh(U_SPH, m.drop));
      o.visible = false;
      return {o, x: -20 + (i * 53) % 44 - (i % 3) * 3 + r() * 2, z: -2 - r() * 6.5, ph: r() * 1.6, rainy: i >= 18};
    });
    const puddles = drops.slice(0, 18).map((d) => {
      const o = A(keepMesh(U_BOX, m.puddle));
      setBox(o, d.x - 0.5 - r() * 0.3, d.x + 0.5 + r() * 0.3, FLOOR + 0.0, FLOOR + 0.025, d.z - 0.4, d.z + 0.4);
      o.visible = false;
      return o;
    });
    const streaks = Array.from({length: 12}, (_, i) => {
      const o = A(keepMesh(U_BOX, m.streak));
      o.visible = false;
      return {o, x: -22 + i * 3.8 + r() * 2, len: 2 + r() * 3.2};
    });
    // --- поезд на дальнем пути: три серебристых вагона с окнами едет по абсолютному времени
    const train = A(new THREE.Group());
    train.visible = false;
    for (let c = 0; c < 3; c++) {
      const x0 = c * 18;
      const add2 = (mat: THREE.Material, ax0: number, ax1: number, y0: number, y1: number, z0: number, z1: number) =>
        train.add(setBox(keepMesh(U_BOX, mat), x0 + ax0, x0 + ax1, y0, y1, z0, z1));
      add2(m.trainBody, 0, 17.4, -11.3, -8.1, -8.9, -6.2);
      add2(m.steel, 0.6, 16.8, -11.5, -11.3, -8.6, -6.5);
      add2(m.stripe, 0, 17.4, -10.5, -10.3, -6.21, -6.15);
      for (let k = 0; k < 6; k++) add2(m.glass, 1.2 + k * 2.55, 3.1 + k * 2.55, -9.9, -8.7, -6.21, -6.13);
      for (const dx of [0.05, 8.7, 17.3]) add2(m.steel, dx - 0.04, dx + 0.04, -11.2, -8.2, -6.21, -6.14);
    }
    // --- затопление тоннеля
    const flood = A(keepMesh(U_BOX, m.flood));
    flood.visible = false;
    // --- улица: гидрант, паровая труба, решётки, люк, фонари
    const hy = new THREE.Group();
    hy.add(setCyl(keepMesh(U_CYL, m.hydrant), [0, 0, 0], [0, 0.7, 0], 0.2));
    const hd = keepMesh(U_SPH, m.hydrant);
    hd.position.set(0, 0.72, 0);
    hd.scale.set(0.22, 0.16, 0.22);
    hy.add(hd, setCyl(keepMesh(U_CYL, m.hydrant), [-0.3, 0.45, 0], [0.3, 0.45, 0], 0.08));
    hy.position.set(-13, 0, -6);
    A(hy);
    const stack = new THREE.Group();
    for (let k = 0; k < 6; k++) stack.add(setCyl(keepMesh(U_CYL, k % 2 ? m.stackW : m.stackO), [0, k * 0.6, 0], [0, (k + 1) * 0.6, 0], 0.34 - k * 0.02));
    stack.add(setCyl(keepMesh(U_CYL, m.stackO), [0, 3.6, 0], [0, 3.9, 0], 0.22));
    stack.position.set(11, 0, -8);
    A(stack);
    for (const gx of [-4, 4]) {
      A(mbox(gx - 1.5, gx + 1.5, 0.0, 0.05, -4.5, -2.5, m.grate, 1));
      for (let k = 0; k < 8; k++) A(mbox(gx - 1.4 + k * 0.4, gx - 1.3 + k * 0.4, 0.05, 0.08, -4.4, -2.6, m.steel, 1));
    }
    A(setCyl(keepMesh(U_CYL, m.metal), [8, 0, -10], [8, 0.05, -10], 0.55));
    for (const lx of [-30, 28]) {
      A(setCyl(keepMesh(U_CYL, m.steel), [lx, 0, -3], [lx, 7, -3], 0.1));
      A(setCyl(keepMesh(U_CYL, m.steel), [lx, 7, -3], [lx + 1.8, 7.3, -3], 0.06));
      const hd2 = A(keepMesh(U_BOX, m.steel));
      setBox(hd2, lx + 1.5, lx + 2.4, 7.1, 7.3, -3.2, -2.8);
    }
    // --- 20 бассейнов (сетка 4×5 на тротуаре справа); растут по очереди
    const pools = Array.from({length: 20}, (_, i) => {
      const c = i % 4, rr = Math.floor(i / 4);
      const gp = new THREE.Group();
      gp.userData.keep = true;
      gp.position.set(8 + c * 12.5, 0, -6 - rr * 7.5);
      for (const [x0, x1, z0, z1] of [[-5, 5, -2.5, -2.2], [-5, 5, 2.2, 2.5], [-5, -4.7, -2.5, 2.5], [4.7, 5, -2.5, 2.5]]) {
        const o = keepMesh(U_BOX, m.poolRim);
        setBox(o, x0, x1, 0, 0.4, z0, z1);
        gp.add(o);
      }
      const w = keepMesh(U_BOX, m.poolWater);
      setBox(w, -4.7, 4.7, 0, 0.3, -2.2, 2.2);
      gp.add(w);
      for (let k = 1; k < 5; k++) {
        const ln = keepMesh(U_BOX, m.white);
        setBox(ln, -4.6, 4.6, 0.3, 0.33, -2.2 + k * 0.88 - 0.03, -2.2 + k * 0.88 + 0.03);
        gp.add(ln);
      }
      gp.visible = false;
      g.add(gp);
      return gp;
    });
    // --- город: модели Нью-Йорка и простые дальние дома
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
    place(CITY[0], -24, -48, 46, 0.2);
    place(CITY[1], 26, -52, 60, -0.3);
    place(CITY[2], -17, -24, 30, 0);
    place(CITY[2], -46, -30, 32, Math.PI / 2);
    place(CITY[3], 0, -125, 90, 0);
    for (let i = 0; i < 26; i++) {
      const x = -90 + i * 7 + r() * 3, z = -75 - r() * 50, w = 6 + r() * 6, h = 14 + r() * 34;
      if (Math.abs(x) < 10 && z > -95) continue;
      g.add(mbox(x - w / 2, x + w / 2, 0, h, z - w / 2, z + w / 2, m.far, 4));
    }
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(200 + i), transparent: true, depthWrite: false, fog: false}));
      sp.scale.set(50 + r() * 20, 24 + r() * 8, 1);
      sp.position.set(-100 + i * 32 + r() * 10, 70 + r() * 25, -220);
      g.add(sp);
    }
    // пар: из паровой трубы и решёток
    const steamSrc: V3[] = [[11, 3.9, -8], [-4, 0.1, -3.5], [4, 0.1, -3.5]];
    const steam = steamSrc.flatMap((s, si) =>
      Array.from({length: 7}, (_, k) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(300 + si * 10 + k), transparent: true, depthWrite: false, fog: false, opacity: 0}));
        g.add(sp);
        return {sp, s, k, si};
      }),
    );
    // дождь: пул штрихов, положение считается по времени
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
    return {m, g, train, pits, drops, puddles, streaks, flood, stream, pools, steam, rain, rainSeed, hemi, sun};
  }, []);
  const {m} = W0;

  useLayoutEffect(() => {
    scene.background = skyTexture();
    scene.fog = new THREE.Fog('#dfe7ef', 120, 330);
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

    // --- камера (нужна раньше всего: от неё зависит область дождя)
    const [ca, cb] = (P.cam ?? ['full', 'full']).map(cam);
    const kc = easeInOut(p);
    const pos = ca.pos.map((v: number, i: number) => lerp(v, cb.pos[i], kc));
    const look = ca.look.map((v: number, i: number) => lerp(v, cb.look[i], kc));

    const off = P.pumps === 0;
    const rainK = range(P.rain, p, 0.3);
    const ph = P.rate2 ? 2 * t - t0 : t; // в ливень насосы включаются вдвое чаще, без скачка на стыке
    const fd = P.floodDelay ?? 0;
    const floodH = range(P.flood, p, 1 - fd, fd) * FLOOD_MAX;

    // --- приямки
    W0.pits.forEach((pt, i) => {
      const st = pitState(i, ph);
      const lvl = off ? lerp(lerp(LO, HI, st.k), FLOOR - 0.05, clamp01(P.pitsFull ? 1 : p * 2.5)) : lerp(LO, HI, st.k);
      const top = Math.max(lvl, floodH > 0.01 ? FLOOR + floodH : -99);
      setBox(pt.water, pt.x - PW + 0.05, pt.x + PW - 0.05, PIT0 + 0.02, top, -PD + 0.05, -0.03);
      pt.ball.position.set(pt.x - 0.95, top + 0.04, -0.9);
      const run = !off && st.on;
      pt.lamp.material = run ? m.green : m.red;
      pt.pipes.forEach((o: any) => (o.material = run ? m.pipeOn : m.pipe));
      pt.mk.forEach((o: any) => (o.visible = !!P.marks && i === HERO));
    });

    // --- вода течёт: просачивается в тоннель (капли, лужи, разводы), лента ручья
    const seep = range(P.seep, p, 0.5);
    const rainy = rainK > 0.5;
    const sk = range(P.stream, p, 0.5);
    W0.stream.visible = sk > 0.01;
    m.stream.opacity = 0.85 * sk;
    W0.drops.forEach((d) => {
      d.o.visible = seep > 0.01 && (!d.rainy || rainy);
      if (!d.o.visible) return;
      const u = ((t * (rainy ? 1.2 : 0.8) + d.ph) % 1.6) / 1.6;
      d.o.position.set(d.x, SLAB0 - 0.1 - 5.1 * u * u, d.z);
      d.o.scale.set(0.05, 0.09, 0.05);
    });
    W0.puddles.forEach((o) => (o.visible = seep > 0.01));
    W0.streaks.forEach((s) => {
      s.o.visible = seep > 0.01;
      setBox(s.o, s.x - 0.07, s.x + 0.07, SLAB0 - s.len * seep, SLAB0, BACK + 0.01, BACK + 0.04);
    });

    // --- поезд
    const tk = range(P.train, p, 0.01);
    W0.train.visible = tk > 0;
    W0.train.position.x = -52 + t * 12;

    // --- затопление тоннеля: вода поднимается над полом
    W0.flood.visible = floodH > 0.01;
    if (W0.flood.visible) setBox(W0.flood, XL, XR, FLOOR + 0.01, FLOOR + floodH, BACK + 0.05, -0.04);

    // --- бассейны
    const nPool = range(P.pools ?? 0, p, 0.9) * W0.pools.length;
    W0.pools.forEach((gp, i) => {
      const k = clamp01(nPool - i);
      gp.visible = k > 0.01;
      gp.scale.set(1, 0.2 + 0.8 * k, 1);
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

    // --- пар: клубы поднимаются и тают
    W0.steam.forEach(({sp, s, k, si}) => {
      const u = ((t * 0.22 + k / 7 + si * 0.13) % 1 + 1) % 1;
      sp.position.set(s[0] + Math.sin(k * 2.1 + u * 3) * (0.5 + u), s[1] + u * 6, s[2] + (k % 3) * 0.1);
      const sc = 1.2 + u * 3.2;
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).opacity = (P.steam ?? 1) * 0.55 * Math.sin(Math.PI * u) * (si ? 0.7 : 1);
    });

    // --- стрелки потока (белые, как в эталоне)
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
        ar.position.copy(pp).add(new THREE.Vector3(0, 0, 0.5));
        ar.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2;
        ar.scale.setScalar(sc);
        ar.renderOrder = 10;
        add(ar);
      }
      m.arrow.opacity = Math.min(1, a);
    };
    arrows([[XL + 40, -5.2, 0], [XR - 40, -5.2, 0]], 14, 3, range(P.arrowsStream, p, 0.2), 0.9); // ручей течёт
    arrows([[-18, -2.0, -3], [14, -2.0, -3]], 8, 4, range(P.arrowsSewer, p, 0.2), 0.8); // коллектор уносит воду
    if (!off) {
      const hs = pitState(HERO, ph);
      if (hs.on) {
        const xr = PITS[HERO] + 0.9;
        arrows([[xr, -12.4, PZ], [xr, -2.2, PZ]], 8, 7, range(P.arrowsPump, p, 0.2), 0.9);
      }
    }

    // --- камера
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
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
  const lib = useLib(SUBWAY_LIB);
  return lib ? <World P={P} life={life} t0={t0} /> : null;
};

export const SubwayScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 40, position: [0, -6, 27], near: 0.5, far: 700}} gl={{preserveDrawingBuffer: true, antialias: false}}>
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
