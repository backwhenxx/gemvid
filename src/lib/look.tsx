import React, {useLayoutEffect, useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';

// «Свет и цвет» ролика: один рецепт на весь эпизод (см. LESSONS.md).
// Свет: солнце (направление, цвет), заполняющий свет от неба/земли, отражённый свет спереди.
// Небо: купол с градиентом к горизонту и свечением у солнца; туман = цвет горизонта, поэтому дальний план тает в небе.
// Цветокор: поверх кадра — подъём теней в цвет (screen), тонировка бликов (multiply), виньетка, лёгкое зерно.
export type Look = {
  sun: {dir: [number, number, number]; color: string; intensity: number};
  fill: {sky: string; ground: string; intensity: number};
  bounce?: {dir: [number, number, number]; color: string; intensity: number};
  sky: {top: string; mid: string; horizon: string; glow: string; glowSize: number};
  fog: {color: string; near: number; far: number};
  grade: {shadow: string; shadowAmt: number; high: string; highAmt: number; vignette: number; grain: number};
  exposure: number;
  shadows: boolean;
};

export const LOOKS: Record<string, Look> = {
  // Золотой час: низкое солнце сбоку, тёплые блики, тени в индиго, горизонт в персиковой дымке
  golden: {
    sun: {dir: [-1, 0.42, 0.55], color: '#ffc58a', intensity: 3.1},
    fill: {sky: '#8f9cc8', ground: '#7a553a', intensity: 0.9},
    bounce: {dir: [0.2, 0.15, 1], color: '#ffb98a', intensity: 0.55},
    sky: {top: '#3f5584', mid: '#d6a171', horizon: '#f6d29a', glow: '#ffe2a8', glowSize: 10},
    fog: {color: '#e8b98f', near: 180, far: 1500},
    grade: {shadow: '#2a2a48', shadowAmt: 0.09, high: '#ffe6c4', highAmt: 0.18, vignette: 0.38, grain: 0.05},
    exposure: 1.0,
    shadows: true,
  },
  // Влажный тропический день: тёплое высокое солнце, тени и вода — бирюзово-холодные, зелень, дымка у горизонта
  tropic: {
    sun: {dir: [-0.55, 0.85, 0.6], color: '#fff0d2', intensity: 2.9},
    fill: {sky: '#9cc4dc', ground: '#55613a', intensity: 1.0},
    bounce: {dir: [0.3, 0.2, 1], color: '#d6ece6', intensity: 0.35},
    sky: {top: '#2f6aa6', mid: '#86b8d8', horizon: '#dbe8e4', glow: '#fff6df', glowSize: 9},
    fog: {color: '#cddfdc', near: 350, far: 3200},
    grade: {shadow: '#0f3640', shadowAmt: 0.08, high: '#fff1d6', highAmt: 0.1, vignette: 0.3, grain: 0.04},
    exposure: 1.0,
    shadows: true,
  },
  // Пасмурно-свинцовый: мягкий рассеянный свет, оливково-серые тона
  overcast: {
    sun: {dir: [-0.4, 1, 0.5], color: '#e8ecef', intensity: 1.2},
    fill: {sky: '#c9d0d4', ground: '#5d6250', intensity: 1.5},
    sky: {top: '#5d666e', mid: '#8d969b', horizon: '#b9bfbf', glow: '#c9cdcc', glowSize: 4},
    fog: {color: '#aeb5b4', near: 120, far: 900},
    grade: {shadow: '#26302c', shadowAmt: 0.12, high: '#eef0e2', highAmt: 0.2, vignette: 0.32, grain: 0.05},
    exposure: 1.0,
    shadows: false,
  },
  // Ночь под фонарями: холодная луна, тёплые источники ставятся в сцене
  night: {
    sun: {dir: [0.6, 0.8, 0.4], color: '#9fb6e8', intensity: 0.7},
    fill: {sky: '#2b3a66', ground: '#1a1410', intensity: 0.6},
    sky: {top: '#070b1c', mid: '#18244a', horizon: '#3a3d5c', glow: '#5a6a9a', glowSize: 6},
    fog: {color: '#2a2e48', near: 80, far: 700},
    grade: {shadow: '#0e1430', shadowAmt: 0.15, high: '#ffd9a8', highAmt: 0.25, vignette: 0.45, grain: 0.06},
    exposure: 1.1,
    shadows: false,
  },
};

const col = (c: string) => new THREE.Color(c);

// Небесный купол: цвет по высоте над горизонтом + свечение в сторону солнца
const makeSky = (L: Look) => {
  const g = new THREE.SphereGeometry(1800, 48, 24);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sun = new THREE.Vector3(...L.sun.dir).normalize();
  const top = col(L.sky.top);
  const mid = col(L.sky.mid);
  const hor = col(L.sky.horizon);
  const glow = col(L.sky.glow);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const e = v.y; // высота над горизонтом (-1..1)
    if (e <= 0.02) c.copy(hor);
    else if (e < 0.22) c.copy(hor).lerp(mid, (e - 0.02) / 0.2);
    else c.copy(mid).lerp(top, Math.min(1, (e - 0.22) / 0.55));
    const d = Math.max(0, v.dot(sun));
    c.lerp(glow, Math.min(0.85, Math.pow(d, L.sky.glowSize) * 0.9 + Math.pow(d, 2) * 0.12 * (1 - Math.min(1, Math.max(0, e) * 2))));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false});
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
};

// Свет, небо, туман и отражения окружения. center — куда смотрит тень (центр интересной области).
export const LookLights: React.FC<{look: Look; center?: [number, number, number]; shadowSize?: number; shadowMap?: number; far?: number}> = ({look: L, center = [0, 0, 0], shadowSize = 260, shadowMap = 2048, far = 1400}) => {
  const {scene, gl, camera} = useThree();
  const W = useMemo(() => {
    const sky = makeSky(L);
    const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
    const d = new THREE.Vector3(...L.sun.dir).normalize();
    const sd = far / 2.3;
    sun.position.set(center[0] + d.x * sd, center[1] + d.y * sd, center[2] + d.z * sd);
    sun.target.position.set(...center);
    if (L.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(shadowMap, shadowMap);
      const cam = sun.shadow.camera as THREE.OrthographicCamera;
      cam.left = -shadowSize;
      cam.right = shadowSize;
      cam.top = shadowSize;
      cam.bottom = -shadowSize;
      cam.near = 10;
      cam.far = far;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.4;
    }
    const hemi = new THREE.HemisphereLight(L.fill.sky, L.fill.ground, L.fill.intensity);
    const extra: THREE.Light[] = [];
    if (L.bounce) {
      const b = new THREE.DirectionalLight(L.bounce.color, L.bounce.intensity);
      const bd = new THREE.Vector3(...L.bounce.dir).normalize();
      b.position.set(center[0] + bd.x * 300, center[1] + bd.y * 300, center[2] + bd.z * 300);
      b.target.position.set(...center);
      extra.push(b);
    }
    return {sky, sun, hemi, extra};
  }, []);

  useLayoutEffect(() => {
    scene.add(W.sky, W.sun, W.sun.target, W.hemi, ...W.extra, ...W.extra.map((e: any) => e.target));
    scene.background = col(L.sky.horizon);
    scene.fog = new THREE.Fog(L.fog.color, L.fog.near, L.fog.far);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = L.exposure;
    if (L.shadows) {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    // окружение для отражений (стекло, вода, металл) — из того же неба
    const pm = new THREE.PMREMGenerator(gl);
    const envScene = new THREE.Scene();
    const skyCopy = makeSky(L);
    skyCopy.scale.setScalar(0.05);
    envScene.add(skyCopy);
    const env = pm.fromScene(envScene, 0.02).texture;
    scene.environment = env;
    pm.dispose();
    return () => {
      scene.remove(W.sky, W.sun, W.sun.target, W.hemi, ...W.extra);
      scene.environment = null;
    };
  }, []);

  scene.userData.lookSky = W.sky;
  return null;
};

// Вызывать после установки камеры в кадре: купол неба всегда вокруг камеры
export const followSky = (scene: THREE.Scene, camera: THREE.Camera) => {
  const s = scene.userData.lookSky as THREE.Object3D | undefined;
  if (s) s.position.copy(camera.position);
};

// Включить тени у всех мешей группы
export const shadowAll = (o: THREE.Object3D, cast = true, receive = true) =>
  o.traverse((m: any) => {
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });

// Зерно: одна плитка шума на весь ролик, каждый кадр сдвигается (дёшево, без SVG-фильтра)
let grainUrl = '';
const grainTile = () => {
  if (grainUrl) return grainUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const im = g.createImageData(256, 256);
  let s = 12345;
  for (let i = 0; i < im.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 8) & 255;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  grainUrl = c.toDataURL('image/png');
  return grainUrl;
};

// Цветокор поверх 3D: кладётся в сцену ПЕРЕД плашками и субтитрами
export const LookGrade: React.FC<{look: Look}> = ({look: L}) => {
  const frame = useCurrentFrame();
  const G = L.grade;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: G.shadow, mixBlendMode: 'screen', opacity: G.shadowAmt}} />
      <AbsoluteFill style={{background: G.high, mixBlendMode: 'multiply', opacity: G.highAmt}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(10,6,20,${G.vignette}) 100%)`}} />
      {G.grain > 0 ? (
        <AbsoluteFill
          style={{
            mixBlendMode: 'overlay',
            opacity: G.grain,
            backgroundImage: `url(${grainTile()})`,
            backgroundSize: '256px 256px',
            backgroundPosition: `${(frame * 97) % 256}px ${(frame * 61) % 256}px`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
