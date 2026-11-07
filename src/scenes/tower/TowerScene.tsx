// Мир «бочка на крыше»: жилой дом Нью-Йорка в разрезе (лицевая плоскость z=0 к зрителю),
// насос в подвале, стояк, кедровая бочка на стальной этажерке, вода самотёком по этажам, город на фоне.
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {cloudTexture, rockTexture, skyTexture, topsoilTexture, waterTexture} from '../dam/textures';
import {libMaterial, libModel, useLib} from '../../lib/lib3d';
import LIBJ from './lib.json';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ---- размеры ----
export const FL = 3; // высота этажа
export const N = 9; // этажей
const ROOF = N * FL; // 27
const BX = 6; // полуширина дома
const BZ = -8; // задняя стена
const BASE = -3.4; // пол подвала
const TX = 2.6, TZ = -3.6, TR = 1.8, TH = 3.6, LEG = 3; // бочка
const T0 = ROOF + 0.4 + LEG; // дно бочки
const RISER_X = 4.6, DOWN_X = 3.6, PZ = -1.6; // стояк и спуск
const OUT_Y = T0 + 0.9; // бытовой отвод выше дна — внизу запас для пожарных

const TEX = LIBJ.tex;
const CITY = LIBJ.city;
export const TOWER_LIB = [...Object.values(TEX), ...CITY];

type V3 = [number, number, number];
type Cam = {pos: V3; look: V3; fov?: number};
const CAMS: Record<string, Cam> = {
  skyline: {pos: [16, 40, 46], look: [0, 27, -14]},
  tankFar: {pos: [9, 33, 20], look: [2.6, 29, -3.6]},
  full: {pos: [0, 13.5, 54], look: [0, 13.5, -3]},
  upper: {pos: [1, 22, 22], look: [1.5, 21, -3]},
  basement: {pos: [3, -0.6, 12], look: [3.6, -1.8, -2]},
  riser: {pos: [5, 13, 30], look: [4, 14, -2]},
  tankCut: {pos: [2.6, 31.5, 9.5], look: [2.6, 30.2, -3.6]},
  tankBottom: {pos: [2.6, 30, 7.5], look: [2.6, 29.6, -3.6]},
  staves: {pos: [8.5, 31.5, 4.5], look: [2.6, 30.6, -3.6]},
  floors: {pos: [1.5, 12, 34], look: [2, 12, -3]},
  final: {pos: [13, 36, 50], look: [0, 22, -12]},
  finalWide: {pos: [16, 42, 60], look: [0, 24, -16]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.full : c);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const range = (v: any, p: number, dur = 1, delay = 0): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  return lerp(v[0], v[1], easeInOut(clamp01((p - delay) / dur)));
};
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};
// UV в метрах, чтобы кирпич и бетон не растягивались
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

// ---- деревянная бочка: клёпки (между ними щели), стальные обручи, конусная крыша ----
const makeTank = (m: Record<string, THREE.Material>, s = 1, staves = 30) => {
  const g = new THREE.Group();
  const ring = new THREE.Group();
  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * Math.PI * 2;
    const w = ((2 * Math.PI * TR) / staves) * 0.97;
    const st = new THREE.Mesh(box(-w / 2, w / 2, 0, TH, -0.06, 0.06), m.cedar);
    st.position.set(Math.sin(a) * TR, 0, Math.cos(a) * TR);
    st.rotation.y = a;
    st.userData.a = a;
    ring.add(st);
  }
  g.add(ring);
  // обручи из двух половин: передняя прячется вместе с передними клёпками на срезе
  const hoopsFront = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    [0, 1].forEach((half) => {
      const h = new THREE.Mesh(new THREE.TorusGeometry(TR + 0.08, 0.035, 6, 24, Math.PI), m.hoop);
      h.rotation.x = half ? -Math.PI / 2 : Math.PI / 2; // half=1 — передняя (к зрителю)
      h.position.y = 0.25 + k * 0.62;
      (half ? hoopsFront : g).add(h);
    });
  }
  g.add(hoopsFront);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(TR + 0.15, 1.1, 30, 1, true), m.cedarDark);
  roof.position.y = TH + 0.55;
  g.add(roof);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 8), m.steel);
  cap.position.y = TH + 1.2;
  g.add(cap);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR, 0.1, 30), m.cedarDark);
  floor.position.y = 0.05;
  g.add(floor);
  // стальная этажерка
  const legs = new THREE.Group();
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) legs.add(new THREE.Mesh(box(x - 0.1, x + 0.1, -LEG, 0, z - 0.1, z + 0.1), m.steel));
  for (const y of [-LEG + 0.6, -0.15]) {
    legs.add(new THREE.Mesh(box(-1.3, 1.3, y - 0.07, y + 0.07, -1.25, -1.15), m.steel));
    legs.add(new THREE.Mesh(box(-1.3, 1.3, y - 0.07, y + 0.07, 1.15, 1.25), m.steel));
    legs.add(new THREE.Mesh(box(-1.25, -1.15, y - 0.07, y + 0.07, -1.3, 1.3), m.steel));
    legs.add(new THREE.Mesh(box(1.15, 1.25, y - 0.07, y + 0.07, -1.3, 1.3), m.steel));
  }
  g.add(legs);
  g.scale.setScalar(s);
  return {g, ring, roof, hoopsFront};
};

const World: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const first = useRef(true);
  const p = clamp01(frame / life);
  const t = frame / fps + (P.t0 ?? 0);

  const W0 = useMemo(() => {
    const m: Record<string, any> = {
      brick: libMaterial(TEX.brick, [1, 1], {roughness: 0.95}),
      plaster: libMaterial(TEX.plaster, [1, 1], {color: '#f1ece2'}),
      concrete: libMaterial(TEX.concrete, [1, 1], {color: '#d8d6d0'}),
      cedar: libMaterial(TEX.cedar, [0.5, 1], {color: '#d7a77a', side: THREE.DoubleSide}),
      cedarDark: libMaterial(TEX.cedar, [2, 1], {color: '#8a6142', side: THREE.DoubleSide}),
      pave: libMaterial(TEX.pave, [1, 1]),
      roof: libMaterial(TEX.roof, [1, 1], {color: '#6d6a66'}),
      metal: libMaterial(TEX.metal, [1, 1], {color: '#6f8fa8', metalness: 0.2, roughness: 0.55}),
      soil: new THREE.MeshStandardMaterial({map: topsoilTexture(1 / 6, 1 / 3), roughness: 1}),
      rock: new THREE.MeshStandardMaterial({map: rockTexture(1 / 7, 1 / 7), roughness: 1}),
      steel: new THREE.MeshStandardMaterial({color: '#4c5258', roughness: 0.6, metalness: 0.1}),
      hoop: new THREE.MeshStandardMaterial({color: '#3a3d40', roughness: 0.5, metalness: 0.2}),
      pipe: new THREE.MeshStandardMaterial({color: '#aeb6bd', roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide}),
      water: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#7fb8e8', roughness: 0.2, transparent: true, opacity: 0.9, side: THREE.DoubleSide}),
      waterDeep: new THREE.MeshStandardMaterial({color: '#3f86c8', roughness: 0.3, transparent: true, opacity: 0.92, side: THREE.DoubleSide}),
      reserve: new THREE.MeshStandardMaterial({color: '#c85a4a', roughness: 0.3, transparent: true, opacity: 0.9, side: THREE.DoubleSide}),
      glass: new THREE.MeshStandardMaterial({color: '#7fa6c4', roughness: 0.15, metalness: 0.1}),
      frame: new THREE.MeshStandardMaterial({color: '#f4f2ec', roughness: 0.6}),
      arrow: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true, depthTest: false}),
      red: new THREE.MeshBasicMaterial({color: '#e0443a'}),
      green: new THREE.MeshBasicMaterial({color: '#3fc35a'}),
      off: new THREE.MeshStandardMaterial({color: '#444', roughness: 0.6}),
      pumpBody: new THREE.MeshStandardMaterial({color: '#2f6fa3', roughness: 0.45, metalness: 0.1}),
      sink: new THREE.MeshStandardMaterial({color: '#f6f6f4', roughness: 0.3}),
      far: new THREE.MeshStandardMaterial({color: '#9a8478', roughness: 1}),
      farWin: new THREE.MeshStandardMaterial({color: '#596b7a', roughness: 0.4}),
    };
    const g = new THREE.Group();
    // --- земля в разрезе: тротуар сверху, почва, ниже скала; вырез под подвал
    const soilM = [m.soil, m.soil, m.pave, m.soil, m.soil, m.soil];
    g.add(mbox(-80, -BX - 0.4, -2.6, 0, -40, 0, soilM, 3), mbox(BX + 0.4, 80, -2.6, 0, -40, 0, soilM, 3));
    g.add(mbox(-80, -BX - 0.4, -14, -2.6, -40, 0, m.rock, 6), mbox(BX + 0.4, 80, -14, -2.6, -40, 0, m.rock, 6));
    g.add(mbox(-BX - 0.4, BX + 0.4, -14, BASE - 0.3, -40, 0, m.rock, 6));
    g.add(mbox(-BX - 0.4, BX + 0.4, -2.6, 0, -40, BZ - 0.3, soilM, 3)); // земля за домом
    // улица за домом и асфальт дальше
    const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), m.roof);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.02, -190);
    g.add(road);
    // --- дом: стены кирпич (снаружи и на срезе), внутри штукатурка, перекрытия бетон
    g.add(mbox(-BX - 0.4, -BX, BASE - 0.3, ROOF + 0.9, BZ - 0.3, 0, [m.plaster, m.brick, m.brick, m.brick, m.brick, m.brick], 2));
    g.add(mbox(BX, BX + 0.4, BASE - 0.3, ROOF + 0.9, BZ - 0.3, 0, [m.brick, m.plaster, m.brick, m.brick, m.brick, m.brick], 2));
    g.add(mbox(-BX, BX, BASE - 0.3, ROOF, BZ - 0.3, BZ, [m.brick, m.brick, m.brick, m.brick, m.plaster, m.brick], 2));
    for (let k = 0; k <= N; k++) {
      const y = k * FL;
      g.add(mbox(-BX, BX, y - 0.3, y, BZ, 0, k === N ? [m.concrete, m.concrete, m.roof, m.concrete, m.concrete, m.concrete] : m.concrete, 3));
    }
    g.add(mbox(-BX, BX, BASE - 0.3, BASE, BZ, 0, m.concrete, 3));
    // парапет крыши
    g.add(mbox(-BX - 0.4, BX + 0.4, ROOF, ROOF + 0.9, BZ - 0.3, BZ + 0.1, m.brick, 2));
    // окна на задней стене (изнутри) и плинтус-полка с раковиной на каждом этаже
    for (let k = 0; k < N; k++) {
      const y = k * FL;
      for (const x of [-3.6, -0.6]) {
        g.add(mbox(x - 0.75, x + 0.75, y + 0.9, y + 2.4, BZ + 0.02, BZ + 0.05, m.frame, 1));
        g.add(mbox(x - 0.65, x + 0.65, y + 1.0, y + 2.3, BZ + 0.05, BZ + 0.07, m.glass, 1));
      }
      g.add(mbox(1.6, 2.6, y + 0.85, y + 1.0, -2.1, -1.1, m.sink, 1)); // раковина
      g.add(mbox(1.9, 2.3, y, y + 0.85, -1.8, -1.4, m.sink, 1)); // тумба
      g.add(mbox(2.05, 2.15, y + 1.0, y + 1.35, -1.65, -1.55, m.pipe, 1)); // кран
      g.add(mbox(2.15, DOWN_X, y + 1.3, y + 1.38, -1.66, -1.54, m.pipe, 1)); // отвод от спуска
    }
    // трубы: стояк (насос → бочка) и спуск (бочка → этажи); городской ввод в подвал
    const pipeV = (x: number, y0: number, y1: number, r = 0.12) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 14, 1, true), m.pipe);
      c.position.set(x, (y0 + y1) / 2, PZ);
      return c;
    };
    g.add(pipeV(RISER_X, BASE + 1.0, T0 + TH + 0.3), pipeV(DOWN_X, 1.3, OUT_Y));
    const top = new THREE.Mesh(box(TX + 0.6, RISER_X + 0.12, T0 + TH + 0.2, T0 + TH + 0.42, PZ - 0.12, PZ + 0.12), m.pipe);
    g.add(top);
    const cityIn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 20, 14, 1, true), m.pipe);
    cityIn.rotation.z = Math.PI / 2;
    cityIn.position.set(-6, -1.6, PZ);
    g.add(cityIn);
    g.add(mbox(4.0, RISER_X + 0.15, -1.68, -1.52, PZ - 0.08, PZ + 0.08, m.pipe, 1));
    // насос в подвале
    const pump = new THREE.Group();
    pump.add(mbox(2.2, 5.2, BASE, BASE + 0.35, -2.6, -0.8, m.concrete, 1)); // фундамент
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 20), m.pumpBody);
    motor.rotation.z = Math.PI / 2;
    motor.position.set(3.1, BASE + 0.85, PZ);
    pump.add(motor);
    const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 20), m.pumpBody);
    volute.rotation.x = Math.PI / 2;
    volute.position.set(4.2, BASE + 0.9, PZ);
    pump.add(volute);
    g.add(pump);
    // этажерка с бочкой
    const tank = makeTank(m);
    tank.g.position.set(TX, T0, TZ);
    g.add(tank.g);
    // отвод в спуск: бытовой — выше дна (внизу остаётся запас), пожарный — у самого дна
    g.add(mbox(DOWN_X - 0.06, TX + TR, OUT_Y - 0.06, OUT_Y + 0.06, PZ - 0.06, PZ + 0.06, m.pipe, 1));
    // --- город: модели Нью-Йорка и простые дальние дома, на крышах — свои бочки
    const r = rng(9);
    const roofs: V3[] = [];
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
      roofs.push([x, h, z]);
    };
    place(CITY[0], -24, -40, 46, 0.2);
    place(CITY[1], 26, -48, 60, -0.3);
    place(CITY[2], -17, -22, 30, 0);
    place(CITY[2], 18, -24, 32, Math.PI / 2);
    place(CITY[3], 0, -120, 90, 0);
    for (let i = 0; i < 26; i++) {
      const x = -90 + i * 7 + r() * 3, z = -70 - r() * 50, w = 6 + r() * 6, h = 14 + r() * 34;
      if (Math.abs(x) < 10 && z > -90) continue;
      g.add(mbox(x - w / 2, x + w / 2, 0, h, z - w / 2, z + w / 2, m.far, 4));
      roofs.push([x, h, z]);
    }
    // облака
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(200 + i), transparent: true, depthWrite: false, fog: false}));
      sp.scale.set(50 + r() * 20, 24 + r() * 8, 1);
      sp.position.set(-100 + i * 32 + r() * 10, 70 + r() * 25, -220);
      g.add(sp);
    }
    const hemi = new THREE.HemisphereLight('#eef5ff', '#7a6a58', 1.5);
    const sun = new THREE.DirectionalLight('#fff2dc', 1.9);
    sun.position.set(18, 40, 30);
    g.add(hemi, sun);
    // маленькие бочки для крыш города (позиции)
    const others = roofs.map(([x, h, z]) => ({x: x + (r() - 0.5) * 3, y: h, z: z + (r() - 0.5) * 3, s: 0.55 + r() * 0.3}));
    return {m, g, tank, motor, others, otherTank: makeTank(m, 1, 16)};
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

    // --- срез бочки: передние клёпки и крыша уходят, видно воду внутри
    const cut = range(P.tankCut, p, 0.5);
    const gap = range(P.gap ?? 0.0, p, 0.8); // щели между клёпками (сухое дерево)
    W0.tank.ring.children.forEach((st: any) => {
      const a = st.userData.a;
      const front = Math.cos(a) > 0.05;
      st.visible = !(front && cut > 0.5);
      st.scale.x = 1 - gap * 6;
    });
    (W0.tank.roof.material as THREE.Material).side = THREE.DoubleSide;
    W0.tank.roof.visible = cut < 0.5;
    W0.tank.hoopsFront.visible = cut < 0.5;

    // --- вода в бочке: уровень, слой запаса снизу, поплавок
    const lvl = range(P.level ?? 0.8, p, P.levelDur ?? 1);
    const H = lvl * (TH - 0.2);
    if (cut > 0.5) {
      const res = Math.min(H, OUT_Y - T0 - 0.05);
      const resM = range(P.reserve, p, 0.4) > 0.5 ? m.reserve : m.waterDeep;
      const wr = new THREE.Mesh(new THREE.CylinderGeometry(TR - 0.07, TR - 0.07, res, 30, 1, false, Math.PI / 2, Math.PI), resM);
      wr.position.set(TX, T0 + 0.1 + res / 2, TZ);
      add(wr);
      if (H > res) {
        const wt = new THREE.Mesh(new THREE.CylinderGeometry(TR - 0.07, TR - 0.07, H - res, 30, 1, false, Math.PI / 2, Math.PI), m.water);
        wt.position.set(TX, T0 + 0.1 + res + (H - res) / 2, TZ);
        add(wt);
      }
      // лицевая плоскость среза воды — видно сразу весь объём
      const wf = (y0: number, y1: number, mt: THREE.Material) => {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(2 * (TR - 0.07), y1 - y0), mt);
        f.position.set(TX, (y0 + y1) / 2, TZ + 0.01);
        add(f);
      };
      wf(T0 + 0.1, T0 + 0.1 + res, resM);
      if (H > res) wf(T0 + 0.1 + res, T0 + 0.1 + H, m.water);
      // поплавок на рычаге
      const fy = T0 + 0.1 + H + 0.05;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), m.red);
      ball.position.set(TX + 0.4, fy, TZ + 0.3);
      add(ball);
      const arm = new THREE.Mesh(box(0, 1.0, -0.03, 0.03, -0.03, 0.03), m.steel);
      arm.position.set(TX + 0.4, fy, TZ + 0.3);
      arm.rotation.z = Math.atan2(T0 + TH - 0.3 - fy, 1.0);
      add(arm);
      if (P.reserve) {
        const line = new THREE.Mesh(box(TX - TR, TX + TR, OUT_Y - T0 + T0 - 0.015, OUT_Y + 0.015, TZ - 0.02, TZ + 0.02), m.arrow);
        add(line);
      }
    }

    // --- вода в стояке от города: до 6-го этажа (дальше давления нет)
    const city = range(P.city, p, P.cityDur ?? 0.8);
    const pumpOn = typeof P.pump === 'object' && !Array.isArray(P.pump) ? false : !!P.pump;
    // насос: включён / выключен по сценарию (pumpAt — список [доля, вкл])
    let on = pumpOn;
    if (P.pumpAt) for (const [at, v] of P.pumpAt as [number, number][]) if (p >= at) on = !!v;
    const riserTop = range(P.riser, p, P.riserDur ?? 0.7);
    const yCity = lerp(BASE + 1, 6 * FL - 0.2, city);
    const yRise = lerp(BASE + 1, T0 + TH + 0.3, riserTop);
    const wy = Math.max(city > 0 ? yCity : -99, riserTop > 0 ? yRise : -99);
    if (wy > BASE + 1) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, wy - (BASE + 1), 12), m.waterDeep);
      c.position.set(RISER_X, (wy + BASE + 1) / 2, PZ + 0.13);
      add(c);
    }
    // лампа насоса и вращение
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), on ? m.green : m.red);
    lamp.position.set(2.6, BASE + 1.45, PZ + 0.2);
    add(lamp);
    W0.motor.rotation.x = on ? t * 18 : 0;

    // --- краны на этажах: сколько этажей с водой
    const wet = P.taps === 'all' ? N : Math.round(range(P.taps ?? 0, p, P.tapsDur ?? 0.8));
    for (let k = 0; k < N; k++) {
      const y = k * FL;
      if (k < wet) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 8), m.waterDeep);
        s.position.set(2.1, y + 1.12, -1.6);
        add(s);
      } else if (P.dry && k >= 6) {
        // сухо: красный крестик над краном
        [Math.PI / 4, -Math.PI / 4].forEach((rz) => {
          const x = new THREE.Mesh(box(-0.32, 0.32, -0.05, 0.05, 0, 0.02), m.red);
          x.position.set(2.1, y + 1.85, -1.4);
          x.rotation.z = rz;
          add(x);
        });
      }
    }

    // --- стрелки потока (белые, как в эталоне): вверх по стояку, вниз по спуску, вбок из города
    const arrows = (pts: V3[], n: number, speed: number, a: number) => {
      if (a <= 0) return;
      const seg = pts.slice(1).map((q, i) => new THREE.Vector3(...q).sub(new THREE.Vector3(...pts[i])));
      const len = seg.reduce((s, v) => s + v.length(), 0);
      for (let i = 0; i < n; i++) {
        let d = ((t * speed + (i / n) * len) % len + len) % len;
        let j = 0;
        while (j < seg.length - 1 && d > seg[j].length()) d -= seg[j++].length();
        const dir = seg[j].clone().normalize();
        const pos = new THREE.Vector3(...pts[j]).add(dir.clone().multiplyScalar(d));
        const ar = new THREE.Mesh(arrowGeo, m.arrow);
        ar.userData.keep = true;
        ar.position.copy(pos).add(new THREE.Vector3(0, 0, 0.5));
        ar.rotation.z = Math.atan2(dir.y, dir.x) - Math.PI / 2;
        ar.scale.setScalar(P.arrowScale ?? 1);
        ar.renderOrder = 10;
        add(ar);
      }
      m.arrow.opacity = Math.min(1, a);
    };
    arrows([[-14, -1.6, PZ], [RISER_X, -1.6, PZ], [RISER_X, yCity, PZ]], 6, 2.5, range(P.arrowsCity, p, 0.2));
    arrows([[RISER_X, BASE + 1, PZ], [RISER_X, T0 + TH + 0.3, PZ], [TX + 0.6, T0 + TH + 0.3, PZ]], 12, 5, range(P.arrowsUp, p, 0.2));
    arrows([[DOWN_X, OUT_Y, PZ], [DOWN_X, 1.3, PZ]], 12, 4, range(P.arrowsDown, p, 0.2));

    // --- бочки на крышах города: появляются по одной
    const nOther = Math.round(range(P.others ?? 0.25, p, P.othersDur ?? 0.8) * W0.others.length);
    W0.others.slice(0, nOther).forEach((o, i) => {
      const k = clamp01((p * W0.others.length - i) / 2);
      const tk = W0.otherTank.g.clone();
      tk.userData.keep = true;
      tk.traverse((c) => (c.userData.keep = true));
      tk.position.set(o.x, o.y + LEG * o.s, o.z);
      tk.scale.setScalar(o.s * (P.othersGrow ? Math.min(1, 0.2 + k) : 1));
      add(tk);
    });

    // --- камера
    const [ca, cb] = (P.cam ?? ['full', 'full']).map(cam);
    const kc = easeInOut(p);
    const pos = ca.pos.map((v, i) => lerp(v, cb.pos[i], kc));
    const look = ca.look.map((v, i) => lerp(v, cb.look[i], kc));
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

const Loader: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
  const lib = useLib(TOWER_LIB);
  return lib ? <World P={P} life={life} /> : null;
};

export const TowerScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 40, position: [0, 14, 50], near: 0.5, far: 700}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <Loader P={P} life={life} />
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
