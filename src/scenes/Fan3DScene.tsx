import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../Short';
import {Accented} from '../components/Accented';
import {C, MONO, SLAM, expoOut} from '../lib/theme';
import {H, W, clamp01, easeInOut} from '../lib/util';

// Главный вентилятор шахты в 3D: диаметр ~5 м, рядом человек для масштаба.
// twin: рядом появляется второй — запасной (стоит, лопасти не крутятся).
// Без совпадающих граней и теней — чтобы ничего не мерцало.
const metal = new THREE.MeshStandardMaterial({color: '#6B6B78', metalness: 0.55, roughness: 0.45, side: THREE.DoubleSide});
const paperM = new THREE.MeshStandardMaterial({color: C.paper, roughness: 0.6});
const accentM = new THREE.MeshStandardMaterial({color: C.accent, roughness: 0.5});
const bladeM = new THREE.MeshStandardMaterial({color: '#C9C5BD', metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide});
const concrete = new THREE.MeshStandardMaterial({color: '#2B2B33', roughness: 0.95});

const buildFan = () => {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 3.2, 64, 1, true), metal);
  housing.rotation.x = Math.PI / 2;
  g.add(housing);
  [-1.6, 1.6].forEach((z) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.56, 0.13, 16, 80), paperM);
    ring.position.z = z;
    g.add(ring);
  });
  const rotor = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 40), metal);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.9, 40), accentM);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.0;
  rotor.add(nose);
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.62, 0.05), bladeM);
    const piv = new THREE.Group();
    b.position.x = 1.5;
    b.rotation.x = 0.55;
    piv.add(b);
    piv.rotation.z = (i / 8) * Math.PI * 2;
    rotor.add(piv);
  }
  g.add(rotor);
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 3.4), concrete);
  base.position.y = -3.05 + 0.45 - 0.08;
  g.add(base);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 2.6), metal);
  leg.position.y = -2.35;
  g.add(leg);
  return {g, rotor};
};

const buildPerson = () => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 6, 16), paperM);
  body.position.y = -3 + 0.22 + 0.45 + 0.3;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), paperM);
  head.position.y = -3 + 1.62;
  g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), accentM);
  helmet.position.y = -3 + 1.66;
  g.add(helmet);
  return g;
};

const Scene: React.FC<{twin: boolean; dur: number; twinFrom: number}> = ({twin, dur, twinFrom}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene} = useThree();
  const main = useMemo(buildFan, []);
  const spare = useMemo(buildFan, []);
  const person = useMemo(buildPerson, []);

  useLayoutEffect(() => {
    scene.background = new THREE.Color(C.bg);
    scene.fog = new THREE.Fog(C.bg, 18, 40);
  }, []);

  const p = clamp01(frame / dur);
  const tw = twin ? expoOut(clamp01((frame - twinFrom * dur) / 14)) : 0;

  useLayoutEffect(() => {
    main.rotor.rotation.z = -(frame / fps) * Math.PI * 2 * 0.35;
    spare.g.scale.setScalar(Math.max(0.0001, tw));
    // одиночный: облёт и наезд; twin: стартует ровно там, где закончил одиночный, и отъезжает
    const e = easeInOut(p);
    const L = (a0: number, a1: number) => a0 + (a1 - a0) * e;
    const a = twin ? L(-0.32, -0.26) : L(-0.62, -0.32);
    const dist = twin ? L(10, 17.5) : L(12.5, 10);
    const tx = twin ? L(0.8, 3.6) : 0.8;
    const cyy = twin ? 1.4 : L(0.8, 1.4);
    camera.position.set(tx + Math.sin(a) * dist, cyy, Math.cos(a) * dist);
    camera.lookAt(tx, -0.6, 0);
  }, [frame]);

  return (
    <>
      <hemisphereLight args={['#d9d4ff', '#1a1410', 0.9]} />
      <directionalLight position={[6, 9, 8]} intensity={1.8} />
      <directionalLight position={[-8, 3, -6]} intensity={0.7} color={C.accent} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#141419" roughness={1} />
      </mesh>
      <primitive object={main.g} />
      <primitive object={spare.g} position={[7.2, 0, -0.4]} />
      <primitive object={person} position={[3.3, 0, 1.4]} />
    </>
  );
};

export const Fan3DScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const {title = '', kicker = '', twin = false, twinFrom = 0.2, label = ''} = scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const tIn = expoOut(clamp01(frame / 12));
  const lIn = expoOut(clamp01((frame - (twinFrom * life + 10)) / 10));
  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <ThreeCanvas width={W} height={H} camera={{fov: 42, position: [0, 1, 12], near: 0.1, far: 100}} gl={{preserveDrawingBuffer: true, antialias: true, logarithmicDepthBuffer: true}}>
        <Scene twin={twin} dur={life} twinFrom={twinFrom} />
      </ThreeCanvas>
      {title ? (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: 260,
            textAlign: 'center',
            fontFamily: SLAM,
            fontWeight: 900,
            fontSize: 76,
            lineHeight: 1.05,
            color: C.paper,
            textTransform: 'uppercase',
            opacity: tIn,
            transform: `translateY(${(1 - tIn) * 20}px)`,
          }}
        >
          {kicker ? <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 30, color: C.dim, letterSpacing: 6, marginBottom: 12}}>{kicker}</div> : null}
          <Accented text={title} accent={C.accent} />
        </div>
      ) : null}
      {twin && label ? (
        <div
          style={{
            position: 'absolute',
            right: 90,
            top: 1060,
            fontFamily: MONO,
            fontWeight: 700,
            fontSize: 40,
            color: C.accent,
            opacity: lIn,
            transform: `translateY(${(1 - lIn) * 16}px)`,
          }}
        >
          {label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
