import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {cloudTexture, waterTexture} from '../dam/textures';
import {box, burlapTexture, earthCutTexture, makeSoldier, mudTexture, overcastSky, pose, smokeTexture, woodTexture, type Soldier} from './parts';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «окоп»: окоп идёт вдаль по оси z, разрез z=0 к зрителю. Враг — слева (x<0). =====
const LEN = 120; // длина окопа вглубь
const DEPTH = 2.3;
const HW_TOP = 1.25;
const HW_BOT = 0.85;
const WALL = 0.95; // стенки после укрепления
const BOT_Y = -10;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  field: {pos: [0, 2.0, 8.5], look: [0, 1.0, -6]},
  fieldWide: {pos: [0, 3.2, 12], look: [0, 0.4, -10]},
  trench: {pos: [0, 0.4, 6.2], look: [0, -1.1, -6]},
  trenchLow: {pos: [0, -0.3, 4.6], look: [0, -1.2, -6]},
  boards: {pos: [1.3, 1.1, 3.2], look: [0, -1.7, -6]},
  boardsClose: {pos: [0.7, -0.4, 2.8], look: [0, -1.4, -4]},
  wall: {pos: [2.2, 0.6, 5.2], look: [-0.2, -1.1, -4]},
  wallTop: {pos: [3.0, 1.6, 4.4], look: [0, -0.4, -5]},
  parapet: {pos: [-3.6, 1.2, 4.2], look: [-1.1, 0.1, -3.5]},
  step: {pos: [1.7, 0.1, 4.2], look: [-0.5, -0.7, -3]},
  stepClose: {pos: [1.2, 0.3, 2.6], look: [-0.6, -0.3, -2.5]},
  periscope: {pos: [1.5, 0.6, 3.1], look: [-0.6, -0.2, -2.2]},
  enemyView: {pos: [-6, 0.6, 1.2], look: [-1.2, 0.25, -3.2]},
  dugout: {pos: [0, -5.6, 6.6], look: [0, -5.9, -2]},
  dugoutClose: {pos: [0.4, -5.7, 4.6], look: [0, -6, -2]},
  bucket: {pos: [10, 2.4, 6], look: [6, 0.6, -8]},
  aerial: {pos: [5, 19, 7], look: [0.5, -1.5, -16]},
  aerialHigh: {pos: [7, 40, 12], look: [1, -1, -42]},
  zig: {pos: [6, 15, 6], look: [1, -1.8, -13]},
  cat: {pos: [1.6, 0.6, 2.8], look: [-1.2, 0.2, -2]},
  final: {pos: [4.5, 4.5, 11], look: [-0.4, -2.6, -6]},
  zigFinal: {pos: [3.6, 4.3, 7.8], look: [1.2, -2.6, -6.5]},
  zigFinalWide: {pos: [5.5, 6.8, 12.5], look: [1.6, -2.8, -9]},
  finalWide: {pos: [6, 7.5, 16], look: [0, -2.4, -9]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.trench : c);
const range = (v: any, p: number, dur = 0.6, delay = 0): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  return lerp(v[0], v[1], easeInOut(clamp01((p - delay) / dur)));
};

// Профиль земли с выемкой окопа (и отверстием под блиндаж)
const groundShape = (dig: number, walls: number, dug: boolean) => {
  const d = DEPTH * dig;
  const hwT = lerp(HW_TOP, WALL, walls);
  const hwB = lerp(HW_BOT, WALL, walls);
  const s = new THREE.Shape();
  s.moveTo(-60, 0);
  if (d > 0.01) {
    s.lineTo(-hwT, 0);
    s.lineTo(-hwB, -d);
    s.lineTo(hwB, -d);
    s.lineTo(hwT, 0);
  }
  s.lineTo(60, 0);
  s.lineTo(60, BOT_Y);
  s.lineTo(-60, BOT_Y);
  s.closePath();
  if (dug) {
    const h = new THREE.Path();
    h.moveTo(-2.6, -7.3);
    h.lineTo(2.6, -7.3);
    h.lineTo(2.6, -4.7);
    h.lineTo(-2.6, -4.7);
    h.closePath();
    s.holes.push(h);
  }
  return s;
};

// Зигзаг (вид сверху): сегменты по z, «колена» смещаются по x
const zigPts = (() => {
  const pts: [number, number][] = [[0, 2]];
  let z = 2;
  let left = true;
  while (z > -LEN) {
    pts.push([left ? 0 : 1.8, z - 4.5]);
    z -= 4.5;
    pts.push([left ? 1.8 : 0, z]);
    pts.push([left ? 1.8 : 0, z - 2.2]);
    z -= 2.2;
    left = !left;
  }
  return pts;
})();

// ---------- зигзаг в разрезе (финал) ----------
const ZC = {w: 0.62, dug: 3.6, floor: -6.8, ceil: -4.4};
const zigPath = (maxLen = 60): [number, number][] => {
  const pts: [number, number][] = [[0, 0]];
  let z = 0;
  let left = true;
  while (z > -maxLen) {
    z -= 4.5;
    pts.push([left ? 0 : 1.8, z]);
    pts.push([left ? 1.8 : 0, z]);
    z -= 2.2;
    pts.push([left ? 1.8 : 0, z]);
    left = !left;
  }
  return pts;
};
// смещение осевой линии с прямыми углами: левая (+1) или правая (-1) кромка канала
const offsetPath = (pts: [number, number][], side: number, w: number) => {
  const dir = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  const n = (d: number[]) => [d[1] * side, -d[0] * side];
  return pts.map((p, i) => {
    const d1 = i > 0 ? dir(pts[i - 1], p) : dir(p, pts[i + 1]);
    const d2 = i < pts.length - 1 ? dir(p, pts[i + 1]) : d1;
    const n1 = n(d1);
    const n2 = n(d2);
    const same = Math.abs(n1[0] - n2[0]) < 1e-6 && Math.abs(n1[1] - n2[1]) < 1e-6;
    return [p[0] + w * (same ? n1[0] : n1[0] + n2[0]), p[1] + w * (same ? n1[1] : n1[1] + n2[1])] as [number, number];
  });
};
const buildZigCut = (m: Record<string, any>, maxLen = 60, upTo = 9999, withDugout = true) => {
  const g = new THREE.Group();
  const pts = zigPath(maxLen).slice(0, Math.max(2, upTo));
  const zEnd = pts[pts.length - 1][1];
  const L = offsetPath(pts, 1, ZC.w);
  const R = offsetPath(pts, -1, ZC.w);
  const slab = (poly: [number, number][]) => {
    const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, z)));
    const geo = new THREE.ExtrudeGeometry(sh, {depth: DEPTH, bevelEnabled: false});
    geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, [m.mud, m.earth]);
  };
  g.add(slab([[-60, 0], ...L, [-60, zEnd]]));
  g.add(slab([...R, [60, zEnd], [60, 0]]));
  if (!withDugout) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(140, 200), m.side);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(0, -DEPTH, -90);
    g.add(fl);
  }
  // нижний слой с лестницей и блиндажом
  const low = new THREE.Shape();
  low.moveTo(-60, -DEPTH);
  low.lineTo(60, -DEPTH);
  low.lineTo(60, BOT_Y);
  low.lineTo(-60, BOT_Y);
  low.closePath();
  const hole = new THREE.Path();
  hole.moveTo(0.05, -DEPTH);
  hole.lineTo(0.75, -DEPTH);
  hole.lineTo(1.95, ZC.ceil);
  hole.lineTo(ZC.dug + 2, ZC.ceil);
  hole.lineTo(ZC.dug + 2, ZC.floor);
  hole.lineTo(1.6, ZC.floor);
  hole.closePath();
  if (withDugout) low.holes.push(hole);
  const lowGeo = new THREE.ExtrudeGeometry(low, {depth: LEN, bevelEnabled: false});
  lowGeo.translate(0, 0, -LEN);
  g.add(new THREE.Mesh(lowGeo, [m.earth, m.side]));
  if (withDugout) {
  // задние стенки лестницы и блиндажа
  g.add(new THREE.Mesh(box(0.0, 2.0, ZC.floor, -DEPTH, -1.3, -1.25), m.room));
  g.add(new THREE.Mesh(box(1.6, ZC.dug + 2, ZC.floor, ZC.ceil, -4.05, -4.0), m.room));
  g.add(new THREE.Mesh(box(1.6, ZC.dug + 2, ZC.floor - 0.05, ZC.floor, -4.0, 0), m.wood));
  // ступени вниз
  for (let i = 0; i < 9; i++) {
    const k = i / 9;
    const x = lerp(0.45, 1.55, k);
    const y = lerp(-DEPTH, ZC.floor + 0.45, k);
    g.add(new THREE.Mesh(box(x - 0.2, x + 0.25, y - 0.5, y - 0.42, -1.25, 0), m.wood));
  }
  // брёвна потолка, стол, свеча, ящики
  for (let x = 1.75; x <= ZC.dug + 1.9; x += 0.42) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 12), m.darkWood);
    log.rotation.x = Math.PI / 2;
    log.position.set(x, ZC.ceil - 0.2, -2);
    g.add(log);
  }
  g.add(new THREE.Mesh(box(ZC.dug - 0.55, ZC.dug + 0.55, ZC.floor + 0.7, ZC.floor + 0.75, -2.9, -2.1), m.wood));
  g.add(new THREE.Mesh(box(ZC.dug - 0.07, ZC.dug + 0.07, ZC.floor, ZC.floor + 0.7, -2.57, -2.43), m.darkWood));
  [-1.05, 1.05].forEach((dx) => g.add(new THREE.Mesh(box(ZC.dug + dx - 0.28, ZC.dug + dx + 0.28, ZC.floor, ZC.floor + 0.42, -2.8, -2.2), m.wood)));
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m.flame);
  fl.position.set(ZC.dug + 0.2, ZC.floor + 0.88, -2.5);
  fl.scale.set(1, 1.6, 1);
  g.add(fl);
  const light = new THREE.PointLight('#ffcf8a', 3.2, 7, 1.5);
  light.position.set(ZC.dug + 0.2, ZC.floor + 1.2, -2.2);
  g.add(light);
  }
  // внутри канала: обшивка, мостки, ступень, мешки по кромкам
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    if (x0 !== x1) continue;
    const za = Math.min(z0, z1);
    const zb = Math.max(z0, z1);
    [-1, 1].forEach((sd) => g.add(new THREE.Mesh(box(x0 + sd * ZC.w - 0.03, x0 + sd * ZC.w + 0.03, -DEPTH, 0, za, zb), m.room)));
    for (let z = zb - 0.15; z > za; z -= 0.2) g.add(new THREE.Mesh(box(x0 - 0.45, x0 + 0.45, -DEPTH + 0.08, -DEPTH + 0.12, z - 0.055, z + 0.055), m.wood));
    [-1, 1].forEach((sd) => {
      for (let z = zb - 0.55; z > za + 0.2; z -= 1.15) g.add(new THREE.Mesh(box(x0 + sd * (ZC.w + 0.42) - 0.38, x0 + sd * (ZC.w + 0.42) + 0.38, 0, 0.24, z - 0.5, z + 0.5), m.bag));
    });
  }
  g.add(new THREE.Mesh(box(-ZC.w + 0.03, -ZC.w + 0.45, -DEPTH, -DEPTH + 0.8, -4.4, -0.02), m.wood)); // стрелковая ступень
  return g;
};

// ---------- вид сверху: прямой окоп и ходы сообщения, вырезанные в земле ----------
const COMMS = [-70, -42, -16];
const buildNetwork = (m: Record<string, any>, cp: number) => {
  const g = new THREE.Group();
  const outer = new THREE.Shape([new THREE.Vector2(-60, 10), new THREE.Vector2(60, 10), new THREE.Vector2(60, -150), new THREE.Vector2(-60, -150)]);
  const hole: [number, number][] = [[-WALL, 8], [-WALL, -140], [WALL, -140]];
  const lens = COMMS.map((_, i) => 26 * clamp01(cp * 1.5 - (COMMS.length - 1 - i) * 0.2));
  COMMS.forEach((zc, i) => {
    const len = lens[i];
    if (len < 0.05) return;
    hole.push([WALL, zc - 0.55], [WALL + len, zc - 0.55], [WALL + len, zc + 0.55], [WALL, zc + 0.55]);
  });
  hole.push([WALL, 8]);
  outer.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
  const geo = new THREE.ExtrudeGeometry(outer, {depth: DEPTH, bevelEnabled: false});
  geo.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(geo, [m.mud, m.side]));
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(140, 170), m.side);
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(0, -DEPTH, -70);
  g.add(fl);
  COMMS.forEach((zc, i) => {
    const len = lens[i];
    for (let x = WALL + 0.5; x < WALL + len - 0.3; x += 1.1)
      [zc - 0.85, zc + 0.85].forEach((z) => g.add(new THREE.Mesh(box(x - 0.45, x + 0.45, 0, 0.24, z - 0.22, z + 0.22), m.bag)));
    for (let x = WALL + 0.2; x < WALL + len - 0.1; x += 0.35) g.add(new THREE.Mesh(box(x - 0.05, x + 0.05, -DEPTH + 0.08, -DEPTH + 0.12, zc - 0.4, zc + 0.4), m.wood));
  });
  return g;
};

const World: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene} = useThree();
  const p = clamp01(frame / life);
  const t = frame / fps;

  const W0 = useMemo(() => {
    const earth = new THREE.MeshStandardMaterial({map: earthCutTexture(), roughness: 1});
    const mudT = mudTexture();
    const m = {
      earth,
      mud: new THREE.MeshStandardMaterial({map: mudT, roughness: 1}),
      side: new THREE.MeshStandardMaterial({map: mudT, color: '#c9b293', roughness: 1}),
      wall: new THREE.MeshStandardMaterial({map: mudT, color: '#a58c6c', roughness: 1}),
      bag: new THREE.MeshStandardMaterial({map: burlapTexture(), roughness: 1}),
      wood: new THREE.MeshStandardMaterial({map: woodTexture(), roughness: 0.95}),
      darkWood: new THREE.MeshStandardMaterial({color: '#6a5136', roughness: 1}),
      water: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#7d8584', transparent: true, opacity: 0.72, roughness: 0.25}),
      puddle: new THREE.MeshStandardMaterial({color: '#aab7c2', roughness: 0.15, metalness: 0.2}),
      tree: new THREE.MeshStandardMaterial({color: '#4a443d', roughness: 1}),
      wire: new THREE.LineBasicMaterial({color: '#3b3836'}),
      rain: new THREE.LineBasicMaterial({color: '#e8eef4', transparent: true, opacity: 0.55}),
      cloth: new THREE.MeshStandardMaterial({color: '#7f7a58', roughness: 0.95}),
      skin: new THREE.MeshStandardMaterial({color: '#d5a985', roughness: 0.8}),
      helmet: new THREE.MeshStandardMaterial({color: '#6b6a4c', roughness: 0.7, metalness: 0.2}),
      boot: new THREE.MeshStandardMaterial({color: '#3a2f25', roughness: 1}),
      green: new THREE.MeshStandardMaterial({color: '#4b5a46', roughness: 0.8}),
      mirror: new THREE.MeshStandardMaterial({color: '#dfe8ee', roughness: 0.05, metalness: 0.9}),
      black: new THREE.MeshStandardMaterial({color: '#1c1c1e', roughness: 0.6}),
      paper: new THREE.MeshStandardMaterial({color: '#f1ead8', roughness: 0.9}),
      fire: new THREE.MeshBasicMaterial({color: '#ff8a2a'}),
      flame: new THREE.MeshBasicMaterial({color: '#ffd27a'}),
      smokeBall: new THREE.MeshStandardMaterial({color: '#4a4c52', roughness: 1, transparent: true, opacity: 0.7, depthWrite: false}),
      room: new THREE.MeshStandardMaterial({color: '#d9c8a6', roughness: 1}),
      channel: new THREE.MeshStandardMaterial({color: '#3d2f25', roughness: 1}),
      grey: new THREE.MeshStandardMaterial({color: '#7b7672', roughness: 0.9}),
    };
    const g = new THREE.Group();
    // дальнее поле за окопом
    const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), m.mud);
    far.rotation.x = -Math.PI / 2;
    far.position.set(0, -0.01, -LEN - 190);
    g.add(far);
    const r = rng(41);
    // воронки с водой
    [[-9, -18], [8, -33], [-15, -52], [12, -12], [5, -70], [-6, -90], [16, -60], [-20, -28]].forEach(([x, z]) => {
      const s = 1.4 + r() * 1.6;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s, 0.25, 8, 28), m.wall);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.02, z);
      g.add(ring);
      const pd = new THREE.Mesh(new THREE.CircleGeometry(s * 0.85, 28), m.puddle);
      pd.rotation.x = -Math.PI / 2;
      pd.position.set(x, 0.03, z);
      g.add(pd);
    });
    // сухие деревья
    [[-12, -30], [14, -44], [-21, -68], [9, -95], [-7, -112], [19, -24], [-4, -60]].forEach(([x, z]) => {
      const tr = new THREE.Group();
      const h = 3 + r() * 2.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, h, 8), m.tree);
      trunk.position.y = h / 2;
      tr.add(trunk);
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.9 + r() * 0.8, 6), m.tree);
        b.position.set(0, h * (0.55 + k * 0.13), 0);
        b.rotation.z = (k % 2 ? 1 : -1) * (0.6 + r() * 0.4);
        b.translateY(0.4);
        tr.add(b);
      }
      tr.position.set(x, 0, z);
      g.add(tr);
    });
    // колючая проволока на колышках вдоль поля (со стороны врага)
    const wirePts: number[] = [];
    for (let z = -3; z > -LEN; z -= 2.2) {
      const post = new THREE.Mesh(box(-0.04, 0.04, 0, 1.1, -0.04, 0.04), m.darkWood);
      post.position.set(-7, 0, z);
      g.add(post);
    }
    for (let k = 0; k < 900; k++) {
      const z0 = -3 - k * 0.13;
      const a = k * 0.9;
      const a2 = (k + 1) * 0.9;
      wirePts.push(-7 + Math.cos(a) * 0.35, 0.55 + Math.sin(a) * 0.35, z0, -7 + Math.cos(a2) * 0.35, 0.55 + Math.sin(a2) * 0.35, z0 - 0.13);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
    g.add(new THREE.LineSegments(wg, m.wire));
    // облака
    const sky = overcastSky();
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(200 + i), transparent: true, depthWrite: false, fog: false, opacity: 0.85}));
      sp.scale.set(70, 32, 1);
      sp.position.set(-120 + i * 50, 48 + r() * 16, -260);
      g.add(sp);
    }
    // столбы дыма вдали
    const smokeTex = smokeTexture();
    const smokes: {sp: THREE.Sprite; x: number; z: number; ph: number}[] = [];
    [[-22, -140], [14, -170], [3, -210], [-40, -200]].forEach(([x, z], j) => {
      for (let k = 0; k < 7; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: smokeTex, transparent: true, depthWrite: false}));
        g.add(sp);
        smokes.push({sp, x, z, ph: k / 7 + j * 0.13});
      }
    });
    // солдаты
    const mk = () => {
      const s = makeSoldier({cloth: m.cloth, skin: m.skin, helmet: m.helmet, boot: m.boot});
      s.traverse((c) => (c.userData.cached = true)); // переиспользуется каждый кадр — не освобождать
      return s;
    };
    return {m, g, sky, smokes, hero: mk(), mate1: mk(), mate2: mk(), carrier: mk(), cache: new Map<string, THREE.Object3D>()};
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
    scene.fog = new THREE.Fog('#c9cfd6', 60, 260);
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
    const rr = rng(77);

    const dig = range(P.dig ?? 1, p, P.digDur ?? 0.6, P.digDelay ?? 0);
    const walls = range(P.revet, p, P.revetDur ?? 0.6, P.revetDelay ?? 0);
    const dug = range(P.dugout, p, 0.4, P.dugoutDelay ?? 0);
    const D = DEPTH * dig;

    // --- финальный вид: зигзагообразный окоп в разрезе с блиндажом
    if (P.zigCut) {
      add(cached('zigCut', () => buildZigCut(m)));
      [W0.mate1, W0.mate2].forEach((s2, i) => {
        pose(s2 as Soldier, 'sit', t + i);
        s2.position.set(ZC.dug + (i ? 1.05 : -1.05), ZC.floor + 0.03, -2.5);
        s2.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
        add(s2);
      });
    }

    // --- вид сверху: настоящие канавы с глубиной
    const cm = range(P.comms, p, 0.6, P.commsDelay ?? 0);
    if (P.aerialNet) add(cached(`net${Math.round(cm * 40)}`, () => buildNetwork(m, Math.round(cm * 40) / 40)));
    const zig = range(P.zigzag, p, P.zigDur ?? 0.6, P.zigDelay ?? 0);
    const ZIG_N = zigPath(110).length;
    if (P.zigzag !== undefined && P.zigzag !== false) {
      const upTo = Math.max(2, Math.round(zig * ZIG_N));
      add(cached(`zigA${upTo}`, () => buildZigCut(m, 110, upTo, false)));
    }

    // --- земля с выемкой
    if (!P.zigCut && !P.aerialNet && (P.zigzag === undefined || P.zigzag === false)) {
    const gkey = `g${dig.toFixed(3)}_${walls > 0 ? 1 : 0}_${dug > 0 ? 1 : 0}`;
    add(
      cached(gkey, () => {
        const geo = new THREE.ExtrudeGeometry(groundShape(dig, walls > 0 ? 1 : 0, dug > 0), {depth: LEN, bevelEnabled: false});
        geo.translate(0, 0, -LEN);
        return new THREE.Mesh(geo, [m.earth, m.side]);
      }),
    );
    }

    // --- вода на дне
    const wl = range(P.water, p, P.waterDur ?? 0.5, P.waterDelay ?? 0);
    if (wl > 0 && D > 0.5) {
      const hw = lerp(HW_BOT, WALL, walls > 0 ? 1 : 0) - 0.01;
      add(cached(`w${wl.toFixed(3)}_${hw.toFixed(2)}`, () => new THREE.Mesh(box(-hw, hw, -D, -D + 0.55 * wl, -LEN, -0.02), m.water)));
    }
    m.water.map!.offset.set(t * 0.02, t * 0.05);

    // --- мостки
    const bd = range(P.boards, p, P.boardsDur ?? 0.5, P.boardsDelay ?? 0);
    if (bd > 0) {
      const y = -D + 0.6;
      const n = Math.floor(bd * 200);
      add(
        cached(`boards${n}`, () => {
          const g = new THREE.Group();
          const slats = new THREE.InstancedMesh(box(-0.62, 0.62, -0.025, 0.025, -0.055, 0.055), m.wood, n);
          const o = new THREE.Object3D();
          for (let i = 0; i < n; i++) {
            o.position.set(0, y, -0.15 - i * 0.2);
            o.updateMatrix();
            slats.setMatrixAt(i, o.matrix);
          }
          g.add(slats);
          const zEnd = -0.15 - n * 0.2;
          [-0.45, 0.45].forEach((x) => g.add(new THREE.Mesh(box(x - 0.05, x + 0.05, y - 0.13, y - 0.025, zEnd, -0.05), m.darkWood)));
          for (let z = -0.6; z > zEnd; z -= 1.3)
            [-0.45, 0.45].forEach((x) => g.add(new THREE.Mesh(box(x - 0.04, x + 0.04, -D, y - 0.12, z - 0.04, z + 0.04), m.darkWood)));
          return g;
        }),
      );
    }

    // --- оползни стенок (комья съезжают)
    if (P.slide) {
      for (let i = 0; i < 10; i++) {
        const k = clamp01((p - 0.1 - i * 0.05) / 0.4);
        if (k <= 0 || k >= 1) continue;
        const side = i % 2 ? 1 : -1;
        const c = new THREE.Mesh(box(-0.2, 0.2, -0.14, 0.14, -0.3, 0.3), m.wall);
        c.position.set(side * lerp(1.15, 0.35, k), lerp(-0.2, -D + 0.7, k * k), -1.2 - i * 0.9 - rr() * 0.4);
        c.rotation.set(k * 1.5, rr(), k * side * 1.2);
        add(c);
      }
    }

    // --- укрепление: мешки с песком и стойки
    if (walls > 0) {
      const rows = Math.round(DEPTH / 0.155);
      const per = 50; // мешков в ряду на 22 м
      const shown = Math.floor(walls * rows);
      add(
        cached(`revet${shown}`, () => {
          const g = new THREE.Group();
          const geo = new THREE.SphereGeometry(0.2, 10, 6);
          geo.scale(1.12, 0.42, 0.62);
          const im = new THREE.InstancedMesh(geo, m.bag, Math.max(1, shown * per * 2));
          const o = new THREE.Object3D();
          let k = 0;
          for (let row = 0; row < shown; row++)
            for (const side of [-1, 1])
              for (let i = 0; i < per; i++) {
                o.position.set(side * (WALL + 0.02), -DEPTH + 0.08 + row * 0.155, -0.22 - i * 0.44 - (row % 2) * 0.22);
                o.rotation.set(0, Math.PI / 2, 0);
                o.updateMatrix();
                im.setMatrixAt(k++, o.matrix);
              }
          im.count = k;
          g.add(im);
          return g;
        }),
      );
      add(
        cached('posts', () => {
          const g = new THREE.Group();
          for (let z = -0.6; z > -24; z -= 1.6)
            [-1, 1].forEach((s) => g.add(new THREE.Mesh(box(s * WALL - 0.05, s * WALL + 0.05, -DEPTH, 1.25, z - 0.05, z + 0.05), m.wood)));
          return g;
        }),
      );
    }

    // --- стрелковая ступень + бруствер с бойницей
    const st = range(P.step, p, 0.4, P.stepDelay ?? 0);
    if (st > 0) {
      add(cached('step', () => new THREE.Mesh(box(-WALL + 0.02, -WALL + 0.52, -DEPTH, -DEPTH + 0.8, -24, -0.03), m.wood)));
    }
    const pr = range(P.parapet, p, 0.5, P.parapetDelay ?? 0);
    if (pr > 0) {
      const rowsP = Math.max(1, Math.round(3 * pr));
      add(
        cached(`parapet${rowsP}`, () => {
          const g = new THREE.Group();
          const geo = new THREE.SphereGeometry(0.2, 10, 6);
          geo.scale(1.12, 0.42, 0.62);
          const im = new THREE.InstancedMesh(geo, m.bag, rowsP * 3 * 55 + 60);
          const o = new THREE.Object3D();
          let k = 0;
          for (let row = 0; row < rowsP; row++)
            for (let col = 0; col < 3; col++)
              for (let i = 0; i < 55; i++) {
                const z = -0.22 - i * 0.44 - (row % 2) * 0.22;
                // бойница: в верхнем ряду пропуск на z≈-3
                if (row === rowsP - 1 && rowsP === 3 && col === 0 && z < -2.7 && z > -3.6) continue;
                o.position.set(-1.12 - col * 0.3, 0.08 + row * 0.155, z);
                o.rotation.set(0, Math.PI / 2, 0);
                o.updateMatrix();
                im.setMatrixAt(k++, o.matrix);
              }
          // тыльный бруствер
          for (let i = 0; i < 55; i++) {
            o.position.set(1.15, 0.08, -0.22 - i * 0.44);
            o.updateMatrix();
            im.setMatrixAt(k++, o.matrix);
          }
          im.count = k;
          g.add(im);
          return g;
        }),
      );
    }

    // --- пуля через бойницу
    if (P.bullet) {
      const k = clamp01((p - (P.bulletAt ?? 0.4)) / 0.12);
      if (k > 0 && k < 1) {
        const b = new THREE.Mesh(box(-0.25, 0.25, -0.012, 0.012, -0.012, 0.012), m.flame);
        b.position.set(lerp(-14, -0.9, k), 0.38, -3.15);
        add(b);
      }
    }

    // --- перископ
    const pe = range(P.periscope, p, 0.35, P.periscopeDelay ?? 0);
    if (pe > 0) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(box(-0.08, 0.08, 0, 1.45 * pe, -0.08, 0.08), m.green));
      if (pe > 0.9) {
        const top = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), m.mirror);
        top.position.set(-0.081, 1.35, 0);
        top.rotation.y = -Math.PI / 2;
        g.add(top);
        const bot = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), m.mirror);
        bot.position.set(0.081, 0.18, 0);
        bot.rotation.y = Math.PI / 2;
        g.add(bot);
      }
      g.position.set(-0.62, -DEPTH + 0.95, -2.2);
      add(g);
    }

    // --- блиндаж под землёй (видно в разрезе)
    if (dug > 0) {
      add(
        cached('dugout', () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(box(-2.6, 2.6, -7.3, -4.7, -4.6, -4.4), m.room)); // задняя стена
          g.add(new THREE.Mesh(box(-2.6, 2.6, -7.35, -7.3, -4.6, 0), m.wood)); // пол
          for (let x = -2.4; x <= 2.41; x += 0.44) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 4.6, 12), m.darkWood);
            log.rotation.x = Math.PI / 2;
            log.position.set(x, -4.92, -2.3);
            g.add(log);
          }
          g.add(new THREE.Mesh(box(-0.6, 0.6, -6.6, -6.55, -2.9, -2.1), m.wood)); // столешница
          g.add(new THREE.Mesh(box(-0.08, 0.08, -7.3, -6.6, -2.58, -2.42), m.darkWood));
          [-1.15, 1.15].forEach((x) => g.add(new THREE.Mesh(box(x - 0.3, x + 0.3, -7.3, -6.9, -2.8, -2.2), m.wood))); // ящики-скамьи
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), m.paper);
          candle.position.set(0.2, -6.48, -2.5);
          g.add(candle);
          const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m.flame);
          fl.position.set(0.2, -6.37, -2.5);
          fl.scale.set(1, 1.6, 1);
          g.add(fl);
          const light = new THREE.PointLight('#ffcf8a', 3.5, 7, 1.5);
          light.position.set(0.2, -6.1, -2.3);
          g.add(light);
          [[-0.25, -0.3], [0.15, -0.25], [0.35, -0.42]].forEach(([dx, dz]) => {
            const card = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.13), m.paper);
            card.rotation.x = -Math.PI / 2;
            card.position.set(dx, -6.545, -2.5 + dz);
            g.add(card);
          });
          return g;
        }),
      );
      // солдаты за картами
      [W0.mate1, W0.mate2].forEach((s, i) => {
        pose(s as Soldier, 'sit', t + i);
        s.position.set(i ? 1.15 : -1.15, -7.33, -2.5);
        s.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
        add(s);
      });
    }

    // --- взрыв, летящий по прямому окопу
    const bl = range(P.blastLine, p, 0.45, P.blastDelay ?? 0.15);
    if (bl > 0 && bl < 1.02) {
      const z1 = -LEN * 0.8;
      const z0 = lerp(z1, -1, bl);
      const fire = new THREE.Mesh(box(-0.5, 0.5, -DEPTH, -DEPTH + 1.6, z0, z0 + 22), m.fire);
      add(fire);
      const glow = new THREE.PointLight('#ff8a2a', 30, 30, 1.2);
      glow.position.set(0, 1, z0 + 6);
      add(glow);
    }

    // взрыв в одном колене зигзага — не проходит за угол
    const zb = range(P.zigBlast, p, 0.5, P.zigBlastDelay ?? 0.1);
    if (zb > 0) {
      const zp = zigPath(110);
      const [x, z] = zp[4];
      const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m.fire);
      const fk = clamp01(zb * 3);
      flash.scale.setScalar(0.4 + 1.6 * fk);
      flash.position.set(x, -0.6, z + 2.2);
      if (zb < 0.45) add(flash);
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m.smokeBall);
      smoke.scale.setScalar(0.5 + 2.4 * easeInOut(zb));
      smoke.position.set(x, 0.2 + 2.6 * zb, z + 2.2);
      add(smoke);
    }

    // --- снаряды в поле (ведро) — дым и вспышки
    if (P.shells) {
      [0.2, 0.55, 0.8].forEach((at, i) => {
        const k = clamp01((p - at) / 0.35);
        if (k <= 0 || k >= 1) return;
        const x = 4 + i * 3.5;
        const z = -9 - i * 4;
        if (k < 0.15) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.6 + k * 6, 12, 10), m.fire);
          f.position.set(x, 0.4, z);
          add(f);
        }
        const s = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), m.smokeBall);
        s.scale.setScalar(0.4 + 1.5 * k);
        s.position.set(x, 0.6 + 2.6 * k, z);
        add(s);
      });
    }

    // --- чайник, письма, кот и крысы
    if (P.homely) {
      const hg = cached('homely', () => {
          const g = new THREE.Group();
          const pot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), m.black);
          pot.scale.set(1, 0.85, 1);
          pot.position.set(-0.75, -DEPTH + 0.92, -1.2);
          g.add(pot);
          const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.16, 8), m.black);
          spout.position.set(-0.6, -DEPTH + 0.95, -1.2);
          spout.rotation.z = -0.9;
          g.add(spout);
          const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14, Math.PI), m.black);
          handle.position.set(-0.75, -DEPTH + 1.02, -1.2);
          g.add(handle);
          [[-0.72, -1.65], [-0.68, -1.85]].forEach(([x, z], i) => {
            const l = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), m.paper);
            l.rotation.x = -Math.PI / 2;
            l.rotation.z = 0.3 * (i ? -1 : 1);
            l.position.set(x, -DEPTH + 0.805, z);
            g.add(l);
          });
          // кот на бруствере
          const cat = new THREE.Group();
          const bodyC = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), m.black);
          bodyC.scale.set(0.9, 0.85, 1.5);
          bodyC.position.y = 0.16;
          cat.add(bodyC);
          const headC = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), m.black);
          headC.position.set(0, 0.33, -0.2);
          cat.add(headC);
          [-0.05, 0.05].forEach((x) => {
            const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 6), m.black);
            ear.position.set(x, 0.44, -0.2);
            cat.add(ear);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), m.flame);
            eye.position.set(x * 0.8, 0.35, -0.29);
            cat.add(eye);
          });
          const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 6), m.black);
          tail.position.set(0, 0.3, 0.27);
          tail.rotation.x = -0.6;
          cat.add(tail);
          cat.position.set(-1.25, 0.48, -1.6);
          cat.rotation.y = -0.6;
          g.add(cat);
          return g;
        });
      hg.position.set(P.zigCut ? 0.42 : 0, P.zigCut ? -0.2 : 0, 0);
      add(hg);
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.35 + i * 0.5) % 1;
        const rat = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.grey);
        rat.scale.set(0.7, 0.6, 1.6);
        rat.position.set(0.25 - i * 0.4, P.zigCut ? -DEPTH + 0.2 : -DEPTH + 0.66, lerp(P.zigCut ? -4.2 : -9, -2.2, k));
        add(rat);
      }
    }

    // --- солдаты
    const S = P.hero;
    if (S) {
      const hs = W0.hero as Soldier;
      const k = easeInOut(clamp01(p / (S.dur ?? 1)));
      const pos = S.from ? S.from.map((v: number, i: number) => lerp(v, S.to[i], k)) : S.at;
      pose(hs, S.pose ?? 'stand', t);
      hs.position.set(pos[0], pos[1], pos[2]);
      hs.rotation.y = S.rotY ?? 0;
      add(hs);
      if (S.pose === 'carry') {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.22, 12, 1, true), m.grey);
        b.position.set(pos[0] + 0.3, pos[1] + 0.68, pos[2]);
        add(b);
      }
    }
    if (P.crew) {
      (P.crew as any[]).forEach((c, i) => {
        const key = `crew${i}`;
        const sd = cached(key, () => makeSoldier({cloth: m.cloth, skin: m.skin, helmet: m.helmet, boot: m.boot})) as Soldier;
        pose(sd, c.pose ?? 'stand', t + i * 0.7);
        sd.position.set(c.at[0], c.at[1], c.at[2]);
        sd.rotation.y = c.rotY ?? 0;
        sd.scale.setScalar(c.scale ?? 1);
        add(sd);
      });
    }

    // --- комья, летящие по полю (начало)
    if (P.clods) {
      for (let i = 0; i < 14; i++) {
        const k = ((t * 0.5 + i * 0.137) % 1);
        const x0 = -12 + rr() * 24;
        const z0 = -6 - rr() * 18;
        const c = new THREE.Mesh(box(-0.12, 0.12, -0.12, 0.12, -0.12, 0.12), m.wall);
        c.position.set(x0 + k * 2, Math.max(0.12, Math.sin(k * Math.PI) * 3.5), z0);
        c.rotation.set(k * 6, k * 4, 0);
        add(c);
      }
    }

    // --- дождь
    if (P.rain) {
      const N = 700;
      const pts = new Float32Array(N * 6);
      const cx = camera.position.x;
      const cz = camera.position.z;
      for (let i = 0; i < N; i++) {
        const x = cx - 7 + ((i * 7.31) % 14);
        const z = cz - 14 + ((i * 3.77) % 14);
        const y = 6 - (((t * 9 + i * 0.731) % 10) + 0);
        pts.set([x, y, z, x - 0.03, y - 0.45, z], i * 6);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      add(new THREE.LineSegments(rg, m.rain));
    }

    // --- дым вдали
    W0.smokes.forEach((s) => {
      const k = (t * 0.08 + s.ph) % 1;
      s.sp.position.set(s.x + k * 4, 2 + k * 30, s.z);
      s.sp.scale.setScalar(6 + k * 18);
      (s.sp.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 4) * (1 - k) * 0.9;
    });

    // --- камера
    const [c0, c1] = (P.cam ?? ['trench', 'trench']).map(cam);
    const kc = easeInOut(clamp01(p / (P.camDur ?? 1)));
    const pos = c0.pos.map((v, i) => lerp(v, c1.pos[i], kc));
    const look = c0.look.map((v, i) => lerp(v, c1.look[i], kc));
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
  }, [frame]);

  return (
    <>
      <hemisphereLight args={['#dfe6ef', '#5d4c3c', 1.15]} />
      <directionalLight position={[14, 26, 18]} intensity={1.5} color="#f4efe6" />
      <directionalLight position={[-18, 9, 8]} intensity={0.45} color="#cdd8e6" />
    </>
  );
};

export const TrenchScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 2, 8], near: 0.1, far: 700}} gl={{preserveDrawingBuffer: true, antialias: false}}>
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
