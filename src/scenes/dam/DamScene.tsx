import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut, rng} from '../../lib/util';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {
  clayTexture,
  cloudTexture,
  concreteTexture,
  grassTexture,
  gravelTexture,
  rockTexture,
  skyTexture,
  topsoilTexture,
  waterTexture,
} from './textures';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});

// ===== Мир «плотина»: разрез по оси реки (плоскость z=0 к зрителю), вода слева, низовье справа =====
const ZB = -14; // ширина долины (дальний край русла)
const TOPSOIL = -2.6;
const ROCK_BOTTOM = -18;

type Prof = {B: number; b: number; H: number};
const PROFS: Record<string, Prof> = {
  none: {B: 0.01, b: 0.01, H: 0.01},
  pile: {B: 1.7, b: 0.35, H: 3.3},
  washed: {B: 2.6, b: 1.3, H: 0.6},
  final: {B: 9, b: 1.3, H: 7.2},
};
const prof = (p: string | Prof) => (typeof p === 'string' ? PROFS[p] : p);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpProf = (a: Prof, b: Prof, k: number): Prof => ({B: lerp(a.B, b.B, k), b: lerp(a.b, b.b, k), H: lerp(a.H, b.H, k)});
const FINAL = PROFS.final;
// верховая (xu) и низовая (xd) грани на высоте y
const xu = (P: Prof, y: number) => -(P.b + (P.B - P.b) * (1 - y / P.H));
const xd = (P: Prof, y: number) => P.b + (P.B - P.b) * (1 - y / P.H);

type Cam = {pos: [number, number, number]; look: [number, number, number]; fov?: number};
const CAMS: Record<string, Cam> = {
  front: {pos: [0, 3.2, 25], look: [0, 2.2, 0]},
  frontLow: {pos: [0, 2.2, 19], look: [0, 1.6, 0]},
  frontClose: {pos: [-1.5, 3.4, 15], look: [-0.5, 2.4, 0]},
  wide: {pos: [0, 4, 30], look: [0, 2.6, 0]},
  upstreamFace: {pos: [-6.5, 4, 13], look: [-6.5, 3, 0]},
  core: {pos: [-0.5, 3.5, 15.5], look: [-0.5, 2.6, 0]},
  under: {pos: [0, -2.5, 17], look: [0, -3.2, 0]},
  deep: {pos: [0, -5, 20], look: [0, -6.5, 0]},
  overflow: {pos: [5, 9.5, 17], look: [2, 4.5, -3]},
  spillTop: {pos: [16, 11, 8], look: [5, 3.5, -11]},
  spillBottom: {pos: [21, 4.2, 1], look: [13, 0.6, -11]},
  ladder: {pos: [17, 5.5, 7], look: [6, 3, -3.5]},
  turbine: {pos: [9, 2.6, 12], look: [11.2, 1.4, 0]},
  final: {pos: [-4, 8, 29], look: [1.5, 3, -5]},
  finalWide: {pos: [-6, 11, 36], look: [2, 3, -6]},
};
const cam = (c: string | Cam) => (typeof c === 'string' ? CAMS[c] ?? CAMS.front : c);

const range = (v: any, p: number, dur = 0.6, delay = 0): number => {
  if (v === undefined || v === null || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  const k = easeInOut(clamp01((p - delay) / dur));
  return lerp(v[0], v[1], k);
};

// ---------- геометрия ----------
const trapShape = (P: Prof, yBottom = 0) => {
  const s = new THREE.Shape();
  s.moveTo(-P.B, yBottom);
  s.lineTo(P.B, yBottom);
  s.lineTo(P.b, P.H);
  s.lineTo(-P.b, P.H);
  s.closePath();
  return s;
};
const extrude = (shape: THREE.Shape, depth: number, z0: number) => {
  const g = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false});
  g.translate(0, 0, z0);
  return g;
};
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};
// задаём UV граней куба в мировых единицах, чтобы текстура не растягивалась
const worldUV = (g: THREE.BufferGeometry, scale: number) => {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const [u, v] = ny > 0.5 ? [x, z] : nx > 0.5 ? [z, y] : [x, y];
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};

// ---------- материалы и статичный мир ----------
const useWorld = () =>
  useMemo(() => {
    const m = {
      gravel: new THREE.MeshStandardMaterial({map: gravelTexture(1 / 5, 1 / 5), roughness: 1}),
      topsoil: new THREE.MeshStandardMaterial({map: topsoilTexture(1 / 6, 1 / 2.6), roughness: 1}),
      rock: new THREE.MeshStandardMaterial({map: rockTexture(1 / 7, 1 / 7), roughness: 1}),
      clay: new THREE.MeshStandardMaterial({map: clayTexture(1 / 2, 1 / 2), roughness: 0.95}),
      concrete: new THREE.MeshStandardMaterial({map: concreteTexture(1 / 3, 1 / 3), roughness: 0.9}),
      grass: new THREE.MeshStandardMaterial({map: grassTexture(1 / 4, 1 / 4), roughness: 1}),
      hill: new THREE.MeshStandardMaterial({color: '#8fc96a', roughness: 1}),
      leaf: new THREE.MeshStandardMaterial({color: '#4f8a3a', roughness: 0.9}),
      trunk: new THREE.MeshStandardMaterial({color: '#6b4a2e', roughness: 1}),
      water: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#ffffff', transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0}),
      waterFast: new THREE.MeshStandardMaterial({map: waterTexture(), color: '#dff0ff', transparent: true, opacity: 0.9, roughness: 0.1}),
      white: new THREE.MeshStandardMaterial({color: '#f4f4f4', roughness: 0.5}),
      drop: new THREE.MeshBasicMaterial({color: '#ffffff'}),
      arrow: new THREE.MeshBasicMaterial({color: '#ffffff', transparent: true}),
      dark: new THREE.MeshStandardMaterial({color: '#1d2329', roughness: 1}),
      pipe: new THREE.MeshStandardMaterial({color: '#b9bec4', metalness: 0.7, roughness: 0.3}),
      fish: new THREE.MeshStandardMaterial({color: '#f08a3c', roughness: 0.5}),
      asphalt: new THREE.MeshStandardMaterial({color: '#3a3b40', roughness: 0.9}),
      hole: new THREE.MeshStandardMaterial({color: '#3b2716', roughness: 1}),
      wood: new THREE.MeshStandardMaterial({color: '#7a5a3a', roughness: 1}),
      red: new THREE.MeshStandardMaterial({color: '#d9433b', roughness: 0.5}),
    };
    const g = new THREE.Group();
    // разрез: почва и скала (лицевая грань — на z=0)
    g.add(new THREE.Mesh(worldUV(box(-60, 60, TOPSOIL, 0, ZB, 0), 1), m.topsoil));
    g.add(new THREE.Mesh(worldUV(box(-60, 60, ROCK_BOTTOM, TOPSOIL, ZB, 0), 1), m.rock));
    // склон берега и поле за рекой
    const slopeLen = Math.hypot(18, 8.5);
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(140, slopeLen), m.grass);
    slope.rotation.x = -Math.PI / 2 + Math.atan2(8.5, 18);
    slope.position.set(0, 4.25, ZB - 9);
    g.add(slope);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(260, 140), m.grass);
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, 8.5, ZB - 18 - 70);
    g.add(field);
    // холмы
    const r = rng(5);
    for (let i = 0; i < 7; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), m.hill);
      h.scale.set(28 + r() * 18, 9 + r() * 7, 14);
      h.position.set(-80 + i * 27 + r() * 8, 8.5, -95 - r() * 25);
      g.add(h);
    }
    // деревья
    const tree = (x: number, y: number, z: number, s: number) => {
      const t = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.6, 10), m.trunk);
      tr.position.y = 0.8;
      t.add(tr);
      [[0, 2.2, 0, 1.05], [-0.6, 1.9, 0.2, 0.75], [0.6, 1.95, -0.1, 0.8], [0.1, 2.75, -0.1, 0.7]].forEach(([a, b, c, rr]) => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(rr, 16, 12), m.leaf);
        l.position.set(a, b, c);
        t.add(l);
      });
      t.position.set(x, y, z);
      t.scale.setScalar(s);
      g.add(t);
    };
    [[-16, -40, 1.6], [-9, -46, 1.3], [7, -42, 1.5], [15, -38, 1.7], [24, -52, 1.4], [-26, -50, 1.5], [3, -60, 1.2], [-3, -36, 1.2]].forEach(([x, z, s]) =>
      tree(x, 8.5, z, s),
    );
    // облака
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: cloudTexture(100 + i), transparent: true, depthWrite: false, fog: false}));
      sp.scale.set(48 + r() * 20, 24 + r() * 8, 1);
      sp.position.set(-90 + i * 30 + r() * 10, 34 + r() * 18, -160);
      g.add(sp);
      clouds.push(sp);
    }
    return {m, g, clouds, sky: skyTexture()};
  }, []);

// ---------- сцена ----------
type DamProps = Record<string, any>;

const DamWorld: React.FC<{P: DamProps; life: number}> = ({P, life}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene} = useThree();
  const W0 = useWorld();
  const {m} = W0;
  const p = clamp01(frame / life);
  const t = frame / fps + (P.t0 ?? 0);

  // динамические объекты держим в одной группе и пересобираем каждый кадр (геометрия простая)
  const dyn = useMemo(() => new THREE.Group(), []);
  // кэш неизменных объектов: не пересобираем их каждый кадр (рендер в разы быстрее)
  const cache = useMemo(() => new Map<string, THREE.Object3D>(), []);
  const cached = <T extends THREE.Object3D>(key: string, make: () => T): T => {
    let o = cache.get(key) as T | undefined;
    if (!o) {
      o = make();
      o.traverse((c) => (c.userData.cached = true));
      cache.set(key, o);
    }
    return o;
  };

  useLayoutEffect(() => {
    scene.background = W0.sky;
    scene.fog = new THREE.Fog('#dfe9f2', 90, 230);
    scene.add(W0.g);
    scene.add(dyn);
    return () => {
      scene.remove(W0.g);
      scene.remove(dyn);
    };
  }, []);

  useLayoutEffect(() => {
    // очистка прошлого кадра
    dyn.children.slice().forEach((c: any) => {
      dyn.remove(c);
      if (!c.userData.cached) c.geometry?.dispose?.();
    });
    const add = (o: THREE.Object3D) => dyn.add(o);

    // --- профиль плотины
    const [pa, pb] = (P.dam ?? ['final', 'final']).map(prof);
    const kd = easeInOut(clamp01(p / (P.damDur ?? 0.6)));
    const D = P.drop ? lerpProf(PROFS.none, PROFS.pile, easeInOut(clamp01(p / 0.75))) : lerpProf(pa, pb, kd);
    const hasDam = D.H > 0.05;
    if (hasDam) {
      // плотина уходит в склон берега, чтобы не было видно её торца
      const key = `dam${D.B.toFixed(3)}_${D.b.toFixed(3)}_${D.H.toFixed(3)}`;
      add(cached(key, () => new THREE.Mesh(extrude(trapShape(D), -ZB + 16, ZB - 16), m.gravel)));
    }

    // --- падающие комья земли (начало) и смыв
    const rr = rng(17);
    if (P.drop) {
      for (let i = 0; i < 16; i++) {
        const t0 = (i / 16) * 0.7;
        const k = clamp01((p - t0) / 0.14);
        if (k <= 0) continue;
        const x = (rr() - 0.5) * 2.4;
        const z = -2 - rr() * 3;
        const yEnd = Math.max(0.3, D.H * (1 - Math.abs(x) / Math.max(D.B, 0.2)) - 0.2);
        const y = lerp(13, yEnd, k * k);
        if (k >= 1 && i < 10) continue; // упавшие «растворяются» в куче
        const c = new THREE.Mesh(box(-0.35, 0.35, -0.35, 0.35, -0.35, 0.35), m.gravel);
        c.position.set(x, y, Math.min(z + 2.2, 0.45));
        c.rotation.set(rr() * 3 + k * 2, rr() * 3, rr() * 3);
        add(c);
      }
    }
    if (P.erode) {
      for (let i = 0; i < 12; i++) {
        const k = clamp01((p - 0.35 - i * 0.025) / 0.45);
        if (k <= 0 || k >= 1) continue;
        const c = new THREE.Mesh(box(-0.3, 0.3, -0.3, 0.3, -0.3, 0.3), m.gravel);
        c.position.set(0.5 + k * 9 + rr() * 1.5, Math.max(0.35, 2.4 * (1 - k) + rr() * 0.8), 0.4 - rr() * 0.6);
        c.rotation.set(k * 6 + rr() * 3, k * 4, rr() * 3);
        add(c);
      }
    }
    if (P.debris) {
      for (let i = 0; i < 8; i++) {
        const k = clamp01((p - 0.2 - i * 0.07) / 0.35);
        if (k <= 0 || k >= 1) continue;
        const x0 = lerp(FINAL.b, FINAL.B, 0.3 + rr() * 0.5);
        const y0 = FINAL.H * (1 - (x0 - FINAL.b) / (FINAL.B - FINAL.b));
        const c = new THREE.Mesh(box(-0.35, 0.35, -0.35, 0.35, -0.35, 0.35), m.gravel);
        c.position.set(x0 + k * 4, Math.max(0.3, y0 * (1 - k)), P.debrisZ ?? -1 - rr() * 3);
        c.rotation.set(k * 7, k * 3, rr() * 3);
        add(c);
      }
    }

    // --- вода в верхнем бьефе
    const L = range(P.level ?? [0.6, 0.6], p, P.levelDur ?? 0.7, P.levelDelay ?? 0);
    m.water.map!.offset.set(t * 0.03, t * 0.012);
    if (L > 0.02) {
      const s = new THREE.Shape();
      if (hasDam && L < D.H) {
        s.moveTo(-60, 0);
        s.lineTo(xu(D, 0), 0);
        s.lineTo(xu(D, L), L);
        s.lineTo(-60, L);
      } else if (hasDam && L <= D.H + 0.5) {
        s.moveTo(-60, 0);
        s.lineTo(xu(D, 0), 0);
        s.lineTo(-D.b, D.H);
        s.lineTo(-D.b, L);
        s.lineTo(-60, L);
      } else {
        s.moveTo(-60, 0);
        s.lineTo(60, 0);
        s.lineTo(60, L);
        s.lineTo(-60, L);
      }
      s.closePath();
      const zBack = ZB - L * (18 / 8.5) - 0.5; // вода заходит на склон берега
      const key = `w${L.toFixed(3)}_${D.B.toFixed(3)}_${D.H.toFixed(3)}`;
      add(cached(key, () => new THREE.Mesh(extrude(s, -zBack - 0.02, zBack + 0.01), m.water)));
    }
    // нижний бьеф
    if (hasDam && L <= D.H + 0.5) {
      add(cached(`wd${D.B.toFixed(3)}`, () => new THREE.Mesh(box(xd(D, 0), 60, 0, 0.45, ZB + 0.01, -0.01), m.water)));
    }
    // перелив: плёнка воды по гребню и низовому откосу
    const ov = range(P.overflow, p, P.overflowDur ?? 0.5, P.overflowDelay ?? 0);
    if (ov > 0 && hasDam) {
      const th = 0.28;
      const reach = ov; // 0..1 — насколько далеко вниз по откосу дошла вода
      const x2 = lerp(D.b, D.B + 2, reach);
      const y2 = Math.max(0, D.H * (1 - (Math.min(x2, D.B) - D.b) / (D.B - D.b)));
      const s = new THREE.Shape();
      s.moveTo(-D.b - 0.1, D.H);
      s.lineTo(D.b, D.H);
      s.lineTo(Math.min(x2, D.B), y2);
      if (x2 > D.B) s.lineTo(x2, 0);
      s.lineTo(x2, (x2 > D.B ? 0 : y2) + th);
      if (x2 > D.B) s.lineTo(D.B, th);
      s.lineTo(D.b, D.H + th);
      s.lineTo(-D.b - 0.1, D.H + th);
      s.closePath();
      add(new THREE.Mesh(extrude(s, -ZB - 0.1, ZB + 0.05), m.waterFast));
    }
    m.waterFast.map!.offset.set(-t * 0.6, t * 0.1);

    // --- стрелки давления
    const ar = range(P.arrows, p, 0.3, P.arrowsDelay ?? 0);
    if (ar > 0 && L > 1) {
      m.arrow.opacity = ar;
      const levels = [0.18, 0.4, 0.62, 0.84];
      levels.forEach((f, i) => {
        const depth = L * f;
        const y = L - depth;
        const len = 0.9 + depth * 0.5;
        const k = clamp01((ar * 1.6 - i * 0.15));
        if (k <= 0) return;
        const s = new THREE.Shape();
        const hw = 0.13 + depth * 0.035;
        s.moveTo(0, -hw);
        s.lineTo(len, -hw);
        s.lineTo(len, -hw * 2.4);
        s.lineTo(len + hw * 2.6, 0);
        s.lineTo(len, hw * 2.4);
        s.lineTo(len, hw);
        s.lineTo(0, hw);
        s.closePath();
        const xEnd = xu(D, Math.max(0.01, y)) - 0.25;
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), m.arrow);
        const wob = Math.sin(t * 3 + i) * 0.15;
        mesh.position.set(xEnd - len - hw * 2.6 - 0.2 + wob - (1 - k) * 2, y, 0.25);
        add(mesh);
      });
    }

    // --- глиняное ядро
    const coreP = range(P.core, p, P.coreDur ?? 0.55, P.coreDelay ?? 0);
    const coreTop = FINAL.H - 0.45;
    const coreHalf = (y: number) => (y < 0 ? lerp(0.85, 1.5, (y - TOPSOIL) / -TOPSOIL) : lerp(1.5, 0.45, y / coreTop));
    if (coreP > 0) {
      const yTop = lerp(TOPSOIL, coreTop, coreP);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 12; k++) {
        const y = lerp(TOPSOIL, yTop, k / 12);
        pts.push([-coreHalf(y), y]);
      }
      const s = new THREE.Shape();
      s.moveTo(coreHalf(TOPSOIL), TOPSOIL);
      for (let k = 0; k <= 12; k++) {
        const y = lerp(TOPSOIL, yTop, k / 12);
        s.lineTo(coreHalf(y), y);
      }
      pts.reverse().forEach(([x, y]) => s.lineTo(x, y));
      s.closePath();
      add(new THREE.Mesh(extrude(s, 0.07, 0.0), m.clay));
    }

    // --- цементационная завеса: трубы вниз в скалу
    const gr = range(P.grout, p, P.groutDur ?? 0.6, P.groutDelay ?? 0);
    if (gr > 0) {
      [-0.72, -0.36, 0, 0.36, 0.72].forEach((x, i) => {
        const len = Math.max(0.05, 9.5 * clamp01(gr * 1.25 - i * 0.05));
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len, 14), m.white);
        c.position.set(x, TOPSOIL - len / 2, 0.08);
        add(c);
      });
    }

    // --- просачивание (капли)
    if (P.seep) {
      const N = 26;
      for (let i = 0; i < N; i++) {
        const ph = ((i * 0.6180339) % 1) + t * 0.22;
        const k = ph % 1;
        let x = 0;
        let y = 0;
        let vis = true;
        if (P.seep === 'through' || P.seep === 'core') {
          const yy = 0.4 + ((i * 0.37) % 1) * Math.max(0.5, Math.min(L, D.H) - 1);
          const x0 = xu(D, yy) - 0.2;
          const x1 = P.seep === 'core' ? -coreHalf(yy) - 0.12 : xd(D, yy) + 0.4;
          x = lerp(x0, x1, P.seep === 'core' ? Math.min(1, k * 1.4) : k);
          y = yy - (P.seep === 'through' ? Math.max(0, k - 0.85) * 3 : 0);
        } else {
          // под плотиной: вниз в почву → по трещинам скалы → наверх в низовье
          const pathPts: [number, number][] = [
            [-7 + ((i * 0.53) % 1) * 3, 0],
            [-5, -1.6],
            [-3, -3.4],
            [0, -4.2],
            [3, -3.4],
            [5.5, -1.6],
            [7.5, 0.1],
          ];
          const stopAt = P.seep === 'underBlocked' ? 2.6 : 6;
          const u = Math.min(k * 6, stopAt);
          const j = Math.min(5, Math.floor(u));
          const f = u - j;
          x = lerp(pathPts[j][0], pathPts[j + 1][0], f);
          y = lerp(pathPts[j][1], pathPts[j + 1][1], f) + ((i * 0.29) % 1 - 0.5) * 0.6;
          if (P.seep === 'underBlocked' && u >= stopAt) {
            x = -1.05 - ((i * 0.41) % 1) * 0.3;
            vis = k < 0.75;
          }
        }
        if (!vis) continue;
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m.drop);
        d.position.set(x, y, 0.3);
        add(d);
      }
    }

    // --- водосброс (сбоку, z от -12.6 до -9.8)
    const sp = range(P.spill, p, P.spillDur ?? 0.5, P.spillDelay ?? 0);
    const SZ0 = -12.6;
    const SZ1 = -9.8;
    if (sp > 0) {
      const F = FINAL;
      const prof2 = (lift: number, below: number) => {
        const s = new THREE.Shape();
        s.moveTo(-F.b - 0.6, F.H + lift);
        s.lineTo(F.b, F.H + lift);
        s.lineTo(F.B, lift);
        s.lineTo(F.B + 7, lift);
        s.lineTo(F.B + 7, lift - below);
        s.lineTo(F.B, lift - below);
        s.lineTo(F.b, F.H + lift - below);
        s.lineTo(-F.b - 0.6, F.H + lift - below);
        s.closePath();
        return s;
      };
      const grow = cached(`spill${!!P.spillWater}`, () => {
      const grow = new THREE.Group();
      grow.add(new THREE.Mesh(extrude(prof2(0.08, 0.4), SZ1 - SZ0, SZ0), m.concrete));
      grow.add(new THREE.Mesh(extrude(prof2(1.0, 1.0), 0.28, SZ0 - 0.28), m.concrete));
      grow.add(new THREE.Mesh(extrude(prof2(1.0, 1.0), 0.28, SZ1), m.concrete));
      if (P.spillWater) {
        grow.add(new THREE.Mesh(extrude(prof2(0.36, 0.26), SZ1 - SZ0 - 0.1, SZ0 + 0.05), m.waterFast));
      }
      return grow;
      });
      grow.scale.set(1, Math.max(0.001, sp), 1);
      add(grow);
    }
    // яма внизу водосброса
    const pit = range(P.pit, p, 0.7, P.pitDelay ?? 0);
    if (pit > 0) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(1, 40), m.hole);
      h.rotation.x = -Math.PI / 2;
      h.scale.set(2.4 * pit, 1.6 * pit, 1);
      h.position.set(FINAL.B + 8.5, 0.47, (SZ0 + SZ1) / 2);
      add(h);
    }
    // гасители: ряды бетонных зубьев + пена
    const bf = range(P.baffles, p, P.bafflesDur ?? 0.55, P.bafflesDelay ?? 0);
    if (bf > 0) {
      const spots: [number, number][] = [];
      [FINAL.B + 2.4, FINAL.B + 4.4].forEach((x, row) => [-12.1, -11.2, -10.3].forEach((z) => spots.push([x + (row ? 0 : 0), z + (row ? 0.45 : 0)])));
      spots.forEach(([x, z], i) => {
        const k = clamp01(bf * spots.length - i);
        if (k <= 0) return;
        const b2 = new THREE.Mesh(box(-0.35, 0.35, 0, 0.62, -0.32, 0.32), m.concrete);
        b2.position.set(x, 0.08 + (1 - k) * 4, z);
        add(b2);
        if (P.foam && k >= 1) {
          for (let f = 0; f < 4; f++) {
            const s = 0.16 + 0.12 * Math.abs(Math.sin(t * 6 + i + f * 1.7));
            const fo = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), m.white);
            fo.position.set(x + 0.45 + f * 0.18, 0.55 + 0.25 * Math.abs(Math.sin(t * 5 + f)), z + Math.sin(i + f) * 0.3);
            add(fo);
          }
        }
      });
    }

    // --- рыбоход: ступени с бассейнами на низовом откосе (z от -4.6 до -2.6)
    const ld = range(P.ladder, p, P.ladderDur ?? 0.6, P.ladderDelay ?? 0);
    const N = 9;
    const step = (k: number) => {
      const x = lerp(FINAL.B + 0.6, FINAL.b + 0.6, k / N);
      const y = lerp(0.0, FINAL.H - 0.9, k / N);
      return [x, y] as const;
    };
    if (ld > 0) {
      for (let k = 0; k <= N; k++) {
        const vis = clamp01(ld * (N + 1) - k);
        if (vis <= 0) continue;
        const [x, y] = step(k);
        const st = new THREE.Mesh(box(x - 0.55, x + 0.55, -0.4, y + 0.55, -4.6, -2.6), m.concrete);
        st.position.y = (1 - vis) * -2;
        add(st);
        const pool = new THREE.Mesh(box(x - 0.42, x + 0.42, y + 0.3, y + 0.5, -4.45, -2.75), m.water);
        pool.position.y = (1 - vis) * -2;
        add(pool);
      }
    }
    // рыбы: «упираются» в плотину или прыгают по ступеням
    if (P.fish) {
      for (let i = 0; i < 3; i++) {
        const fsh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), m.fish);
        fsh.scale.set(1.8, 0.8, 0.7);
        if (P.fish === 'blocked') {
          const k = (t * 0.9 + i * 0.33) % 1;
          fsh.position.set(FINAL.B + 1.2 + Math.sin(k * Math.PI) * 0.2 + i * 0.5, 0.35 + Math.sin(k * Math.PI) * 0.9, -3.4 - i * 0.6);
          fsh.rotation.z = Math.PI + Math.cos(k * Math.PI) * 0.8;
        } else {
          const u = ((t * 0.7 + i * 1.3) % N) as number;
          const j = Math.floor(u);
          const f = u - j;
          const [x0, y0] = step(j);
          const [x1, y1] = step(Math.min(N, j + 1));
          fsh.position.set(lerp(x0, x1, f), lerp(y0, y1, f) + 0.55 + Math.sin(f * Math.PI) * 0.7, -3.6 + (i - 1) * 0.4);
          fsh.rotation.z = Math.PI + Math.atan2(y1 - y0, x1 - x0) * 0.6 - Math.cos(f * Math.PI) * 0.6;
        }
        add(fsh);
      }
    }

    // --- турбина: труба сквозь плотину и здание ГЭС у подножия (в разрезе)
    const tb = range(P.turbine, p, P.turbineDur ?? 0.5, P.turbineDelay ?? 0);
    if (tb > 0) {
      const X0 = FINAL.B + 1.0;
      const house = cached('house', () => {
      const house = new THREE.Group();
      house.add(new THREE.Mesh(box(X0, X0 + 3.2, 0, 0.35, -2.6, 0.2), m.concrete));
      house.add(new THREE.Mesh(box(X0, X0 + 3.2, 2.5, 2.9, -2.6, 0.2), m.concrete));
      house.add(new THREE.Mesh(box(X0, X0 + 0.35, 0.35, 2.5, -2.6, 0.2), m.concrete));
      house.add(new THREE.Mesh(box(X0 + 2.85, X0 + 3.2, 0.35, 2.5, -2.6, 0.2), m.concrete));
      house.add(new THREE.Mesh(box(X0, X0 + 3.2, 0.35, 2.5, -2.6, -2.3), m.dark));
      const pipePath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-8, 1.2, 0.45),
        new THREE.Vector3(-5, 0.7, 0.45),
        new THREE.Vector3(0, 0.7, 0.45),
        new THREE.Vector3(X0 + 0.5, 0.95, 0.45),
        new THREE.Vector3(X0 + 1.3, 1.3, 0.1),
      ]);
      house.add(new THREE.Mesh(new THREE.TubeGeometry(pipePath, 60, 0.28, 16), m.pipe));
      const rot = new THREE.Group();
      rot.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), m.pipe));
      for (let i = 0; i < 8; i++) {
        const bl = new THREE.Mesh(box(0.2, 0.85, -0.06, 0.06, -0.12, 0.12), m.pipe);
        const pv = new THREE.Group();
        pv.add(bl);
        pv.rotation.z = (i / 8) * Math.PI * 2;
        rot.add(pv);
      }
      rot.position.set(X0 + 1.6, 1.4, -0.4);
      house.add(rot);
      house.userData.rot = rot;
      return house;
      });
      house.userData.rot.rotation.z = -t * 5;
      house.scale.set(1, Math.max(0.001, tb), 1);
      add(house);
      // провода к опоре
      if (tb >= 1) {
        const pole = new THREE.Mesh(box(-0.08, 0.08, 0, 4.2, -0.08, 0.08), m.wood);
        pole.position.set(X0 + 5.2, 0.45, -1.5);
        add(pole);
      }
    }

    // --- дорога на гребне, забор, машина, табличка
    const rd = range(P.road, p, 0.4, P.roadDelay ?? 0);
    if (rd > 0) {
      add(new THREE.Mesh(box(-FINAL.b + 0.15, FINAL.b - 0.15, FINAL.H, FINAL.H + 0.06, ZB, ZB + (-ZB) * rd), m.asphalt));
      for (let z = ZB + 0.6; z < ZB + (-ZB) * rd - 0.3; z += 1.4) {
        const dash = new THREE.Mesh(box(-0.04, 0.04, FINAL.H + 0.061, FINAL.H + 0.07, z, z + 0.6), m.white);
        add(dash);
      }
      if (rd >= 1) {
        const car = new THREE.Group();
        car.add(new THREE.Mesh(box(-0.38, 0.38, 0, 0.42, -0.85, 0.85), m.red));
        car.add(new THREE.Mesh(box(-0.32, 0.32, 0.42, 0.75, -0.45, 0.4), m.red));
        const cz = ZB + 1 + ((t * 2.5) % 13);
        car.position.set(0.38, FINAL.H + 0.08, cz);
        add(car);
      }
    }
    const fe = range(P.fence, p, 0.4, P.fenceDelay ?? 0);
    if (fe > 0) {
      const xF = -FINAL.b + 0.08;
      const zEnd = ZB + (-ZB) * fe;
      for (let z = ZB + 0.2; z <= zEnd; z += 1.3) add(new THREE.Mesh(box(xF - 0.05, xF + 0.05, FINAL.H, FINAL.H + 0.9, z - 0.05, z + 0.05), m.wood));
      [0.45, 0.8].forEach((h) => add(new THREE.Mesh(box(xF - 0.02, xF + 0.02, FINAL.H + h, FINAL.H + h + 0.04, ZB + 0.2, zEnd), m.white)));
    }

    // --- камера
    const [c0, c1] = (P.cam ?? ['front', 'front']).map(cam);
    const kc = easeInOut(clamp01(p / (P.camDur ?? 1)));
    const pos = c0.pos.map((v, i) => lerp(v, c1.pos[i], kc));
    const look = c0.look.map((v, i) => lerp(v, c1.look[i], kc));
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    const pc = camera as THREE.PerspectiveCamera;
    const fov = lerp(c0.fov ?? 45, c1.fov ?? 45, kc);
    if (pc.fov !== fov) {
      pc.fov = fov;
      pc.updateProjectionMatrix();
    }
    W0.clouds.forEach((c, i) => (c.position.x = -90 + i * 30 + ((t * 0.6) % 30)));
  }, [frame]);

  return (
    <>
      <hemisphereLight args={['#eaf3ff', '#7a6a55', 1.25]} />
      <directionalLight position={[18, 30, 22]} intensity={1.9} color="#fff6e8" />
      <directionalLight position={[-20, 10, 10]} intensity={0.45} color="#cfe3ff" />
    </>
  );
};

export const DamScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 45, position: [0, 3, 25], near: 0.5, far: 600}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <DamWorld P={P} life={life} />
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
