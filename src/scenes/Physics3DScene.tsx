import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {SceneProps} from '../Short';
import {Accented} from '../components/Accented';
import {FONT, H, W, rng} from '../lib/util';

// 3D-физика (Rapier): предметы сыплются в прозрачный контейнер.
// Симуляция считается один раз целиком, кадр берёт готовые позиции → результат стабильный.
// props: count, shape ("box" | "sphere" | "coin"), size?, color?, label?
type Sim = {data: Float32Array; count: number};

const HW = 1.6;
const HD = 1.0;
const HEIGHT = 3.2;

const simulate = async (count: number, shape: string, size: number, frames: number, fps: number): Promise<Sim> => {
  await RAPIER.init();
  const world = new RAPIER.World({x: 0, y: -9.81, z: 0});
  world.timestep = 1 / fps;
  const wall = 0.1;
  world.createCollider(RAPIER.ColliderDesc.cuboid(HW + wall, wall, HD + wall).setTranslation(0, -wall, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(wall, HEIGHT * 4, HD + wall).setTranslation(-HW - wall, HEIGHT * 4, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(wall, HEIGHT * 4, HD + wall).setTranslation(HW + wall, HEIGHT * 4, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(HW + wall, HEIGHT * 4, wall).setTranslation(0, HEIGHT * 4, -HD - wall));
  world.createCollider(RAPIER.ColliderDesc.cuboid(HW + wall, HEIGHT * 4, wall).setTranslation(0, HEIGHT * 4, HD + wall));
  const r = rng(42);
  const bodies: RAPIER.RigidBody[] = [];
  for (let i = 0; i < count; i++) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
    const rb = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation((r() - 0.5) * (HW * 1.6), HEIGHT + 0.5 + i * size * 0.9, (r() - 0.5) * (HD * 1.4))
        .setRotation({x: q.x, y: q.y, z: q.z, w: q.w}),
    );
    const cd =
      shape === 'sphere'
        ? RAPIER.ColliderDesc.ball(size)
        : shape === 'coin'
          ? RAPIER.ColliderDesc.cylinder(size * 0.18, size)
          : RAPIER.ColliderDesc.cuboid(size, size, size);
    world.createCollider(cd.setRestitution(0.25).setFriction(0.6), rb);
    bodies.push(rb);
  }
  const data = new Float32Array(frames * count * 7);
  for (let f = 0; f < frames; f++) {
    world.step();
    for (let i = 0; i < count; i++) {
      const t = bodies[i].translation();
      const q = bodies[i].rotation();
      data.set([t.x, t.y, t.z, q.x, q.y, q.z, q.w], (f * count + i) * 7);
    }
  }
  world.free();
  return {data, count};
};

const Bodies: React.FC<{sim: Sim; shape: string; size: number; accent: string; dur: number}> = ({sim, shape, size, accent, dur}) => {
  const frame = useCurrentFrame();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const {camera, scene} = useThree();
  const geom = useMemo(
    () =>
      shape === 'sphere'
        ? new THREE.SphereGeometry(size, 20, 14)
        : shape === 'coin'
          ? new THREE.CylinderGeometry(size, size, size * 0.36, 28)
          : new THREE.BoxGeometry(size * 2, size * 2, size * 2),
    [shape, size],
  );
  const mat = useMemo(() => new THREE.MeshStandardMaterial({roughness: shape === 'coin' ? 0.25 : 0.45, metalness: shape === 'coin' ? 0.9 : 0.05}), [shape]);
  const glass = useMemo(() => new THREE.BoxGeometry(HW * 2, HEIGHT, HD * 2).translate(0, HEIGHT / 2, 0), []);

  useLayoutEffect(() => {
    scene.background = new THREE.Color('#07070c');
    const m = mesh.current!;
    const r = rng(9);
    const base = new THREE.Color(shape === 'coin' ? '#f2c14e' : accent);
    for (let i = 0; i < sim.count; i++) {
      const c = base.clone().offsetHSL((r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.25);
      m.setColorAt(i, c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [sim]);

  useLayoutEffect(() => {
    const m = mesh.current!;
    const f = Math.min(frame, dur - 1);
    const o = new THREE.Object3D();
    for (let i = 0; i < sim.count; i++) {
      const k = (f * sim.count + i) * 7;
      o.position.set(sim.data[k], sim.data[k + 1], sim.data[k + 2]);
      o.quaternion.set(sim.data[k + 3], sim.data[k + 4], sim.data[k + 5], sim.data[k + 6]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    const p = frame / dur;
    const a = interpolate(p, [0, 1], [-0.25, 0.25]);
    const rad = interpolate(p, [0, 1], [8.2, 7.2]);
    camera.position.set(Math.sin(a) * rad, 3.6, Math.cos(a) * rad);
    camera.lookAt(0, 1.3, 0);
  }, [frame, sim]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 9, 6]} intensity={1.8} />
      <directionalLight position={[-5, 4, -3]} intensity={1.1} color={accent} />
      <instancedMesh ref={mesh} args={[geom, mat, sim.count]} />
      <mesh geometry={glass}>
        <meshPhysicalMaterial color="#9fd0ff" transparent opacity={0.12} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[glass]} />
        <lineBasicMaterial color="#cfe8ff" transparent opacity={0.6} />
      </lineSegments>
    </>
  );
};

export const Physics3DScene: React.FC<SceneProps> = ({scene, accent, durationInFrames}) => {
  const {count = 120, shape = 'box', size = 0.16, label = ''} = scene.props;
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const [sim, setSim] = useState<Sim | null>(null);
  const [handle] = useState(() => delayRender('rapier sim'));

  useEffect(() => {
    simulate(Math.min(count, 400), shape, size, durationInFrames, fps)
      .then((s) => {
        setSim(s);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, []);

  const labelIn = interpolate(frame, [6, 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill>
      {sim ? (
        <ThreeCanvas width={W} height={H} camera={{fov: 50, position: [0, 3.6, 8]}} gl={{preserveDrawingBuffer: true, antialias: true}}>
          <Bodies sim={sim} shape={shape} size={size} accent={accent} dur={durationInFrames} />
        </ThreeCanvas>
      ) : null}
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: 250,
            left: 60,
            right: 60,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 96,
            color: '#fff',
            textTransform: 'uppercase',
            opacity: labelIn,
            transform: `scale(${0.8 + 0.2 * labelIn})`,
            textShadow: '0 8px 30px rgba(0,0,0,0.8)',
          }}
        >
          <Accented text={label} accent={accent} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
