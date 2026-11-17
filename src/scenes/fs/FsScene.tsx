// Фирменный стиль «Сплав» (17.11): один компонент для всех новых миров.
// В episode.json: "type": "fs", props: {world, cam: [a, b], tod: [a, b] | "golden", <параметры мира числами или [от, до]>, tags, banner…}
// Рендер внутри идёт в 2× (сверхвыборка) — убирает рябь тонких граней и карандашных линий.
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useFrame, useThree} from '@react-three/fiber';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import {loadFont as loadSerif} from '@remotion/google-fonts/PTSerif';
import type {SceneProps} from '../../Short';
import {camBetween, Pose} from '../../lib/camPath';
import {Pipeline} from './post';
import {makeRig, passes as makePasses} from './look';
import * as teplo from './worlds/teplo';
import * as yama from './worlds/yama';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});
const {fontFamily: SERIF} = loadSerif('italic', {weights: ['400'], subsets: ['cyrillic', 'latin']});
const WORLDS: Record<string, any> = {teplo, yama};
const SW = 1080;
const SH = 1920;
const SS = 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
// число или [от, до] или [от, до, p0, p1] — меняется на участке сцены p0..p1
const range = (v: any, p: number, d = 0) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * ease(clamp01(v.length > 2 ? (p - v[2]) / Math.max(1e-6, v[3] - v[2]) : p)) : v ?? d);
// всё числовое в props (кроме служебного) уходит в мир как параметр кадра
const RESERVED = new Set(['camDur', 'bannerAt', 'bannerEnd', 'bannerY', 'bannerSize']);
const isNum = (v: any) => typeof v === 'number' || (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number'));

const poseOf = (W: any, P: any, p: number) => {
  const C: Record<string, Pose> = W.CAMS;
  const a = C[P.cam[0]], b = C[P.cam[1] ?? P.cam[0]];
  return camBetween(a, b, ease(clamp01(p / (P.camDur ?? 1))));
};

const World: React.FC<{P: any; life: number; t0: number}> = ({P, life, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {gl} = useThree();
  const Wm = WORLDS[P.world ?? 'teplo'];
  const S = useMemo(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.NoToneMapping;
    const scene = new THREE.Scene();
    const sky = new THREE.Group();
    scene.add(sky);
    const setTod = makeRig(scene, sky);
    const w = Wm.build(scene, sky);
    const near = Wm.NEAR ?? 3;
    const camera = new THREE.PerspectiveCamera(40, SW / SH, near, 600);
    const pipe = new Pipeline(gl, SW, SH, near, 600, SS);
    return {scene, sky, setTod, w, camera, pipe, passes: makePasses()};
  }, []);
  useFrame(() => {
    const p = clamp01(frame / life);
    const c = poseOf(Wm, P, p);
    const cam = S.camera;
    cam.position.copy(c.pos);
    cam.quaternion.copy(c.q);
    cam.fov = c.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // время суток: строка или список ключевых точек ['night', 'day', 'night'] — равномерно по сцене (todAt — свои доли)
    const tod: string[] = Array.isArray(P.tod) ? P.tod : [P.tod ?? 'day'];
    if (tod.length < 2) S.setTod(tod[0], tod[0], 0, S.w.lamps, S.w.wins);
    else {
      const at: number[] = P.todAt ?? tod.map((_, i) => i / (tod.length - 1));
      let i = 0;
      while (i < tod.length - 2 && p > at[i + 1]) i++;
      S.setTod(tod[i], tod[i + 1], ease(clamp01((p - at[i]) / Math.max(1e-6, at[i + 1] - at[i]))), S.w.lamps, S.w.wins);
    }
    const q: any = {t: t0 + frame / fps};
    for (const k of Object.keys(P)) if (!RESERVED.has(k) && !k.endsWith('Dur') && isNum(P[k])) q[k] = range(P[k], clamp01(p / (P[k + 'Dur'] ?? 1)));
    S.w.animate(q);
    S.pipe.render(S.scene, cam, S.sky, S.passes, q.t, true);
  }, 1);
  return null;
};

// Подписи «как в атласе»: бумажный ярлык, от него линия с точкой к предмету
const Tags: React.FC<{P: any; life: number}> = ({P, life}) => {
  const frame = useCurrentFrame();
  const Wm = WORLDS[P.world ?? 'teplo'];
  const cam = useMemo(() => new THREE.PerspectiveCamera(40, SW / SH, WORLDS[P.world ?? 'teplo'].NEAR ?? 3, 600), []);
  if (!P.tags?.length) return null;
  const p = clamp01(frame / life);
  const c = poseOf(Wm, P, p);
  cam.position.copy(c.pos);
  cam.quaternion.copy(c.q);
  cam.fov = c.fov;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const v = new THREE.Vector3();
  const pr = (pt: any) => {
    const a = typeof pt === 'string' ? Wm.T[pt] : pt;
    v.set(a[0], a[1], a[2]).project(cam);
    return [(v.x * 0.5 + 0.5) * SW, (1 - (v.y * 0.5 + 0.5)) * SH];
  };
  return (
    <svg width={SW} height={SH} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      {P.tags.map((tg: any, i: number) => {
        const op = clamp01((frame - (tg.at ?? 0) * life) / 8) * (1 - clamp01((frame - (tg.end ?? 1) * life + 8) / 8));
        if (op <= 0) return null;
        const [ax, ay] = pr(tg.t);
        const lx = Math.min(SW - 60, Math.max(60, ax + (tg.dx ?? 0)));
        const ly = ay + (tg.dy ?? 0);
        const line = tg.dx !== undefined || tg.dy !== undefined;
        const fs = tg.size ?? 40;
        const w = tg.s.length * fs * 0.48 + 40;
        const bx = Math.min(SW - 24 - w, Math.max(24, lx - w / 2));
        return (
          <g key={i} opacity={op}>
            {line ? <path d={`M${ax} ${ay} Q${(ax + lx) / 2 + 24} ${(ay + ly) / 2 - 10} ${lx} ${ly}`} stroke="#3b2a1c" strokeWidth={3} fill="none" /> : null}
            {line ? <circle cx={ax} cy={ay} r={7} fill="#3b2a1c" /> : null}
            <rect x={bx + 4} y={ly - fs * 0.78 + 5} width={w} height={fs * 1.5} fill="rgba(59,42,28,0.35)" />
            <rect x={bx} y={ly - fs * 0.78} width={w} height={fs * 1.5} fill="#f6ecd2" stroke="#3b2a1c" strokeWidth={2.5} />
            <text x={bx + w / 2} y={ly + fs * 0.22} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={fs} fill="#3b2a1c">{tg.s}</text>
          </g>
        );
      })}
    </svg>
  );
};

export const FsScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const life = lifeIn ?? Math.max(1, durationInFrames - 10);
  const bIn = clamp01((frame - (P.bannerAt ?? 0) * life) / 8);
  const bOut = 1 - clamp01((frame - (P.bannerEnd ?? 1) * life + 8) / 8);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} camera={{fov: 40, position: [0, 3, 30], near: 3, far: 600}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <World P={P} life={life} t0={scene.start ?? 0} />
      </ThreeCanvas>
      <Tags P={P} life={life} />
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
