// Реалистичная сцена из библиотеки: HDRI-небо, земля из текстуры Poly Haven, предметы Poly Haven,
// люди Rocketbox с мокап-анимациями, взрывы спрайтами. Всё задаётся в props сцены.
import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneProps} from '../../Short';
import {H as SH, W as SW, clamp01, easeInOut} from '../../lib/util';
import {collect} from './collect';
import {Actor, explosion, floorAt, getLib, libMaterial, libModel, useLib} from '../../lib/lib3d';

type V3 = [number, number, number];
type Cam = {pos: V3; look: V3; fov?: number};

const World: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {camera, scene, gl} = useThree();
  const t = frame / fps + (P.t0 ?? 0);

  const W0 = useMemo(() => {
    const g = new THREE.Group();
    const G = P.ground ?? {};
    const size = G.size ?? 80;
    const geo = new THREE.PlaneGeometry(size, size, 64, 64);
    // лёгкий рельеф, чтобы земля не была столом
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const d = Math.hypot(x, y);
      pos.setZ(i, d < (G.flat ?? 8) ? 0 : (Math.sin(x * 0.21) * Math.cos(y * 0.17) * 0.35 + Math.sin(x * 0.07 + y * 0.05) * 0.6) * clamp01((d - (G.flat ?? 8)) / 10));
    }
    geo.computeVertexNormals();
    const mat = G.tex ? libMaterial(G.tex, [size / (G.tile ?? 4), size / (G.tile ?? 4)]) : new THREE.MeshStandardMaterial({color: '#6b5a45', roughness: 1});
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.floor = true;
    g.add(ground);
    g.updateMatrixWorld(true);
    for (const it of P.items ?? []) {
      const o = libModel(it.id, {scale: it.scale, height: it.height});
      const [x, y, z] = it.at;
      o.position.set(x, y ?? floorAt(g, x, z), z);
      o.rotation.set(it.tilt?.[0] ?? 0, ((it.yaw ?? 0) * Math.PI) / 180, it.tilt?.[1] ?? 0);
      g.add(o);
    }
    const sun = new THREE.DirectionalLight(P.sunColor ?? '#fff1dc', P.sun ?? 2.2);
    const sd = P.sunDir ?? [6, 10, 4];
    sun.position.set(sd[0], sd[1], sd[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = P.shadowSize ?? 12;
    Object.assign(sun.shadow.camera, {left: -S, right: S, top: S, bottom: -S, near: 0.5, far: 60});
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    g.add(sun, sun.target);
    const actors = (P.actors ?? []).map((a: any) => new Actor(a.id, {height: a.height}));
    actors.forEach((a: Actor) => g.add(a.root));
    return {g, actors};
  }, []);

  useLayoutEffect(() => {
    if (P.hdri) {
      const env = getLib<THREE.DataTexture>(P.hdri);
      scene.environment = env;
      scene.background = env;
      scene.environmentIntensity = P.envI ?? 1;
      scene.backgroundIntensity = P.bgI ?? 1;
    } else scene.background = new THREE.Color('#9aa6b0');
    if (P.fog) scene.fog = new THREE.Fog(P.fog[0], P.fog[1], P.fog[2]);
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMappingExposure = P.exposure ?? 1;
    scene.add(W0.g);
    return () => void scene.remove(W0.g);
  }, []);

  const dyn = useMemo(() => new THREE.Group(), []);
  useLayoutEffect(() => {
    scene.add(dyn);
    return () => void scene.remove(dyn);
  }, []);

  useLayoutEffect(() => {
    // люди: путь (ходьба) или стояние на месте
    (P.actors ?? []).forEach((a: any, i: number) => {
      const A: Actor = W0.actors[i];
      const path: [number, number][] = a.path ?? [a.at, a.at];
      const seg = path.slice(1).map((q, k) => Math.hypot(q[0] - path[k][0], q[1] - path[k][1]));
      const total = seg.reduce((s, x) => s + x, 0);
      const speed = a.speed ?? 1.25; // м/с
      const t0 = a.start ?? 0;
      const dist = total > 0 ? Math.min(total, Math.max(0, t - t0) * speed) : 0;
      const walking = total > 0 && t > t0 && dist < total;
      let d = dist, k = 0;
      while (k < seg.length - 1 && d > seg[k]) d -= seg[k++];
      const p0 = path[k], p1 = path[k + 1] ?? path[k];
      const f = seg[k] ? d / seg[k] : 0;
      const x = p0[0] + (p1[0] - p0[0]) * f, z = p0[1] + (p1[1] - p0[1]) * f;
      const yaw = total > 0 ? Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) : ((a.yaw ?? 0) * Math.PI) / 180;
      A.root.position.set(x, 0, z);
      A.root.rotation.y = yaw + ((a.yawFix ?? 0) * Math.PI) / 180;
      const idleT = t + (a.phase ?? i * 1.7);
      if (walking) A.pose(a.walk ?? 'rba:m_walk_neutral_01', dist / (a.stride ?? speed));
      else A.pose(a.anim ?? 'rba:m_idle_neutral_01', idleT);
      A.stand(floorAt(W0.g, x, z));
    });

    dyn.children.slice().forEach((c) => dyn.remove(c));
    for (const [i, b] of (P.booms ?? []).entries()) {
      const e = explosion(t - b.t, {seed: i + 1, size: b.size ?? 1, dust: b.dust});
      e.position.set(b.at[0], floorAt(W0.g, b.at[0], b.at[1]), b.at[1]);
      dyn.add(e);
    }

    const cams: Cam[] = P.cam ?? [{pos: [4, 2, 6], look: [0, 1, 0]}, {pos: [3, 2, 6], look: [0, 1, 0]}];
    const k = easeInOut(clamp01(frame / life));
    const a = cams[0], b = cams[1] ?? cams[0];
    const L = (u: V3, v: V3): V3 => [0, 1, 2].map((j) => u[j] + (v[j] - u[j]) * k) as V3;
    const pos = L(a.pos, b.pos), look = L(a.look, b.look);
    camera.position.set(...pos);
    camera.lookAt(...look);
    const fov = (a.fov ?? 40) + ((b.fov ?? a.fov ?? 40) - (a.fov ?? 40)) * k;
    if ((camera as THREE.PerspectiveCamera).fov !== fov) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [frame]);
  return null;
};

const Loader: React.FC<{P: Record<string, any>; life: number}> = ({P, life}) => {
  const lib = useLib(collect(P));
  return lib ? <World P={P} life={life} /> : null;
};

export const StageScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const life = Math.max(1, durationInFrames - 10);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={SW} height={SH} shadows camera={{fov: 40, position: [0, 2, 8], near: 0.3, far: 800}} gl={{preserveDrawingBuffer: true, antialias: false}}>
        <Loader P={scene.props} life={life} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
