// Проба фирменного стиля в настоящем конвейере (17.11): мир «дом, погреб и колодец в разрезе» из лаборатории стиля.
// Стиль = материалы + свет + цепочка постобработки (styles.ts); в episode.json: "style": "paint" | "dusk" | "atlas" | …
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useFrame, useThree} from '@react-three/fiber';
import {loadFont} from '@remotion/google-fonts/Comfortaa';
import type {SceneProps} from '../../Short';
import {camBetween, Pose} from '../../lib/camPath';
import {buildWorld} from './world';
import {STYLES} from './styles';
import {Pipeline} from './post';

const {fontFamily: ROUND} = loadFont('normal', {weights: ['700'], subsets: ['cyrillic', 'latin']});
const SW = 1080;
const SH = 1920;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const range = (v: number | number[] | undefined, p: number, d = 0) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * ease(clamp01(p)) : v ?? d);

const CAMS: Record<string, Pose> = {
  wide: {pos: [7.6, 6.4, 33], look: [-0.15, -0.4, 0], fov: 40},
  mid: {pos: [4.4, 5.0, 28.5], look: [-0.25, -0.9, 0], fov: 40},
  cellar: {pos: [-0.6, 1.6, 17], look: [-3.3, -1.5, 0], fov: 40},
  well: {pos: [5.2, -0.6, 19], look: [1.5, -4.0, 0], fov: 40},
  wellUp: {pos: [5.6, 1.2, 22], look: [1.2, -3.0, 0], fov: 40},
};

const World: React.FC<{P: any; life: number; t0: number}> = ({P, life, t0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {gl} = useThree();
  const W = useMemo(() => {
    const st = STYLES[P.style ?? 'paint']();
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const world = buildWorld(st);
    const sz = gl.getDrawingBufferSize(new THREE.Vector2());
    const pipe = new Pipeline(gl, sz.x, sz.y, world.camera.near, world.camera.far);
    return {st, world, pipe, passes: st.post()};
  }, []);
  useFrame(() => {
    const p = clamp01(frame / life);
    const c = camBetween(CAMS[P.cam[0]], CAMS[P.cam[1]], ease(clamp01(p / (P.camDur ?? 1))));
    const cam = W.world.camera as THREE.PerspectiveCamera;
    cam.position.copy(c.pos);
    cam.quaternion.copy(c.q);
    cam.fov = c.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const t = t0 + frame / fps;
    W.world.animate(t, range(P.bucket, p, 0));
    W.pipe.render(W.world.scene, cam, W.world.sky, W.passes, t, W.st.flatNormals);
  }, 1);
  return null;
};

export const LabScene: React.FC<SceneProps> = ({scene, durationInFrames, life: lifeIn}) => {
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
