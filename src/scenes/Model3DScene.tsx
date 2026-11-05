import React, {useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type {SceneProps} from '../Short';
import {Accented} from '../components/Accented';
import {FONT, H, W, asset, easeInOut} from '../lib/util';

// 3D-сцена (three.js): облёт камерой + «разрез» (clipping plane) — показывает, что внутри.
// props: model? ("file.glb" в папке эпизода), primitive? ("cellar"), cutaway?, title?, color?
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};

const buildCellar = (accent: string) => {
  const outer = new THREE.Group(); // режется
  const inner = new THREE.Group(); // содержимое — не режется
  const soil = new THREE.MeshStandardMaterial({color: '#4a3426', roughness: 0.95});
  const brick = new THREE.MeshStandardMaterial({color: '#9a5a3c', roughness: 0.8});
  const wall = new THREE.MeshStandardMaterial({color: '#e8dccb', roughness: 0.7});
  const roof = new THREE.MeshStandardMaterial({color: '#3b3f58', roughness: 0.6});
  const grass = new THREE.MeshStandardMaterial({color: '#3f7d3a', roughness: 0.9});
  // Грунт вокруг комнаты-погреба x[-1.5,1.5] y[-3,-1] z[-1.5,1.5]
  [
    box(-4, -1.5, -4, 0, -3, 3),
    box(1.5, 4, -4, 0, -3, 3),
    box(-1.5, 1.5, -4, -3, -3, 3),
    box(-1.5, 1.5, -1, -0.05, -3, 3),
    box(-1.5, 1.5, -3, -1, -3, -1.5),
    box(-1.5, 1.5, -3, -1, 1.5, 3),
  ].forEach((g) => outer.add(new THREE.Mesh(g, soil)));
  outer.add(new THREE.Mesh(box(-4, 4, -0.05, 0, -3, 3), grass));
  // Кирпичная кладка погреба
  outer.add(new THREE.Mesh(box(-1.5, -1.35, -3, -1, -1.5, 1.5), brick));
  outer.add(new THREE.Mesh(box(1.35, 1.5, -3, -1, -1.5, 1.5), brick));
  outer.add(new THREE.Mesh(box(-1.5, 1.5, -3, -1, -1.5, -1.35), brick));
  // Дом
  outer.add(new THREE.Mesh(box(-1.6, 1.6, 0, 2.2, -1.6, 1.6), wall));
  const r = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), roof);
  r.rotation.y = Math.PI / 4;
  r.position.y = 3;
  outer.add(r);
  // Внутри: полки, банки, лестница
  const wood = new THREE.MeshStandardMaterial({color: '#7b5132'});
  inner.add(new THREE.Mesh(box(-1.3, -0.2, -2.3, -2.22, -1.3, -0.9), wood));
  inner.add(new THREE.Mesh(box(-1.3, -0.2, -1.7, -1.62, -1.3, -0.9), wood));
  const jarMat = new THREE.MeshStandardMaterial({color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.3});
  for (let s = 0; s < 2; s++)
    for (let i = 0; i < 5; i++) {
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 16), jarMat);
      j.position.set(-1.18 + i * 0.22, -2.09 + s * 0.6, -1.1);
      inner.add(j);
    }
  for (let i = 0; i < 6; i++) inner.add(new THREE.Mesh(box(0.6, 1.3, -1.2 - i * 0.3, -1.1 - i * 0.3, -0.4 + i * 0.25, -0.15 + i * 0.25), wood));
  return {outer, inner, target: new THREE.Vector3(0, -0.4, 0), radius: 11};
};

const Scene: React.FC<{model: THREE.Object3D | null; primitive: string; cutaway: boolean; accent: string; dur: number}> = ({
  model,
  primitive,
  cutaway,
  accent,
  dur,
}) => {
  const frame = useCurrentFrame();
  const {camera, gl, scene} = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 10), []);

  const built = useMemo(() => {
    if (model) {
      const b = new THREE.Box3().setFromObject(model);
      const size = b.getSize(new THREE.Vector3()).length();
      const s = 7 / size;
      model.scale.setScalar(s);
      const c = b.getCenter(new THREE.Vector3()).multiplyScalar(s);
      model.position.sub(c);
      return {outer: model, inner: new THREE.Group(), target: new THREE.Vector3(0, 0, 0), radius: 10};
    }
    return buildCellar(accent);
  }, [model, primitive, accent]);

  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
    scene.background = new THREE.Color('#07070c');
    scene.fog = new THREE.Fog('#07070c', 14, 30);
    if (cutaway)
      built.outer.traverse((o: any) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.clippingPlanes = [plane];
          o.material.side = THREE.DoubleSide;
        }
      });
  }, [built, cutaway]);

  useLayoutEffect(() => {
    const p = frame / dur;
    const a = interpolate(p, [0, 1], [0.15, 0.85]);
    const rad = built.radius * interpolate(p, [0, 1], [1.08, 0.9]);
    camera.position.set(Math.sin(a) * rad, built.target.y + 3.2, Math.cos(a) * rad);
    camera.lookAt(built.target);
    // разрез: передняя половина «уходит» с 15% до 55% длительности сцены
    plane.constant = cutaway ? interpolate(easeInOut((p - 0.15) / 0.4), [0, 1], [5, 0]) : 10;
  }, [frame, built]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} />
      <directionalLight position={[-6, 3, -4]} intensity={1.2} color={accent} />
      <pointLight position={[0, -1.8, 0.3]} intensity={6} distance={5} color="#ffb35a" />
      <primitive object={built.outer} />
      <primitive object={built.inner} />
    </>
  );
};

export const Model3DScene: React.FC<SceneProps> = ({scene, base, accent, durationInFrames}) => {
  const {model: modelFile, primitive = 'cellar', cutaway = true, title = ''} = scene.props;
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const [handle] = useState(() => (modelFile ? delayRender('gltf ' + modelFile) : null));
  const frame = useCurrentFrame();

  useEffect(() => {
    if (!modelFile) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      asset(base, modelFile),
      (g) => {
        setModel(g.scene);
        continueRender(handle!);
      },
      undefined,
      (e) => cancelRender(e),
    );
  }, [modelFile]);

  const titleIn = interpolate(frame, [4, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill>
      {modelFile && !model ? null : (
        <ThreeCanvas width={W} height={H} camera={{fov: 38, position: [0, 3, 11]}} gl={{preserveDrawingBuffer: true, antialias: true}}>
          <Scene model={model} primitive={primitive} cutaway={cutaway} accent={accent} dur={durationInFrames} />
        </ThreeCanvas>
      )}
      {title ? (
        <div
          style={{
            position: 'absolute',
            top: 230,
            left: 70,
            right: 70,
            textAlign: 'center',
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 84,
            color: '#fff',
            textTransform: 'uppercase',
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * -30}px)`,
            textShadow: '0 8px 30px rgba(0,0,0,0.8)',
          }}
        >
          <Accented text={title} accent={accent} />
        </div>
      ) : null}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(7,7,12,0.0) 55%, rgba(7,7,12,0.55) 100%)'}} />
    </AbsoluteFill>
  );
};
