// Библиотека реалистичных ассетов в сценах three.js (детерминированно по кадру).
// id: rb:<человек>, rba:<анимация>, ph:<модель>, pht:<текстура>, phh:<HDRI>  → public/lib (качает build.mjs)
import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {useState} from 'react';

export const libUrl = (id: string) => {
  const [k, n] = id.split(':');
  if (k === 'ph') return staticFile(`lib/ph/${n}/${n}.gltf`);
  if (k === 'phh') return staticFile(`lib/phh/${n}.hdr`);
  return staticFile(`lib/${k}/${n}.glb`);
};

type Asset = GLTF | THREE.DataTexture | Record<string, THREE.Texture>;
const done = new Map<string, Asset>();
const pending = new Map<string, Promise<Asset>>();
const gltf = new GLTFLoader();
const tex = new THREE.TextureLoader();

const load = (id: string): Promise<Asset> => {
  if (pending.has(id)) return pending.get(id)!;
  const [k, n] = id.split(':');
  let p: Promise<Asset>;
  if (k === 'phh') {
    p = new RGBELoader().loadAsync(libUrl(id)).then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      return t;
    });
  } else if (k === 'pht') {
    const get = (m: string) => tex.loadAsync(staticFile(`lib/pht/${n}/${m}.jpg`)).catch(() => null);
    p = Promise.all([get('diff'), get('nor'), get('rough')]).then(([diff, nor, rough]) => {
      const r: Record<string, THREE.Texture> = {};
      if (diff) { diff.colorSpace = THREE.SRGBColorSpace; r.map = diff; }
      if (nor) r.normalMap = nor;
      if (rough) r.roughnessMap = rough;
      Object.values(r).forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; });
      return r;
    });
  } else {
    p = gltf.loadAsync(libUrl(id));
  }
  p = p.then((a) => (done.set(id, a), a));
  pending.set(id, p);
  return p;
};

/** Загрузить ассеты до рендера кадра. Возвращает словарь id → ассет или null, пока грузится. */
export const useLib = (ids: string[]): Map<string, Asset> | null => {
  const need = ids.filter((i) => !done.has(i));
  const [, set] = useState(0);
  const [h] = useState(() => (need.length ? delayRender('lib ' + need.join(',')) : null));
  useState(() => {
    if (!need.length) return;
    Promise.all(need.map(load)).then(() => { set((x) => x + 1); continueRender(h!); }, (e) => cancelRender(e));
  });
  return ids.every((i) => done.has(i)) ? done : null;
};
export const getLib = <T extends Asset>(id: string) => done.get(id) as T;

/** Материал земли/стен из текстуры Poly Haven; repeat — сколько раз на объект. */
export const libMaterial = (id: string, repeat: [number, number] = [1, 1], extra: THREE.MeshStandardMaterialParameters = {}) => {
  const src = getLib<Record<string, THREE.Texture>>(id);
  const maps: Record<string, THREE.Texture> = {};
  for (const [k, t] of Object.entries(src)) { const c = t.clone(); c.repeat.set(...repeat); c.needsUpdate = true; maps[k] = c; }
  return new THREE.MeshStandardMaterial({...maps, roughness: 1, ...extra});
};

/** Копия модели (без анимации): высота или масштаб, тени. */
export const libModel = (id: string, opt: {scale?: number; height?: number; shadow?: boolean} = {}) => {
  const o = (getLib<GLTF>(id)).scene.clone(true);
  if (opt.height) {
    const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    o.scale.setScalar(opt.height / s.y);
  } else if (opt.scale) o.scale.setScalar(opt.scale);
  o.traverse((m: any) => { if (m.isMesh) { m.castShadow = opt.shadow ?? true; m.receiveShadow = true; } });
  return o;
};

const FOOT = /(L|R) (Toe0|Foot)$/;

/** Человек с анимациями. Время анимации задаётся явно (кадр/fps) — без накопления. */
export class Actor {
  root = new THREE.Group();
  body: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  feet: THREE.Object3D[] = [];
  private actions = new Map<string, THREE.AnimationAction>();
  private own: THREE.AnimationClip[];
  constructor(id: string, opt: {height?: number} = {}) {
    this.own = getLib<GLTF>(id).animations;
    this.body = SkeletonUtils.clone(getLib<GLTF>(id).scene);
    this.body.traverse((m: any) => {
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
      if (m.isBone && FOOT.test(m.name.replace(/_/g, ' '))) this.feet.push(m);
    });
    this.root.add(this.body);
    this.body.updateMatrixWorld(true);
    const h = new THREE.Box3().setFromObject(this.body, true).getSize(new THREE.Vector3()).y || 1.78;
    this.body.scale.setScalar((opt.height ?? 1.78) / h);
    this.mixer = new THREE.AnimationMixer(this.body);
  }
  private act(animId: string) {
    let a = this.actions.get(animId);
    if (!a) {
      // '#имя' или '#номер' — анимация, встроенная в саму модель (животные со Sketchfab)
      const k = animId.slice(1);
      const clip = animId.startsWith('#') ? this.own.find((c) => c.name === k) ?? this.own[+k || 0] : getLib<GLTF>(animId).animations[0];
      a = this.mixer.clipAction(clip);
      a.play();
      this.actions.set(animId, a);
    }
    return a;
  }
  /** Поза: одна анимация или смешивание двух (w — вес второй). t — секунды. */
  pose(anim: string, t: number, mix?: {anim: string; t: number; w: number}, inPlace = false) {
    this.actions.forEach((a) => (a.weight = 0));
    const a = this.act(anim);
    a.time = t % a.getClip().duration;
    a.weight = mix ? 1 - mix.w : 1;
    if (mix) { const b = this.act(mix.anim); b.time = mix.t % b.getClip().duration; b.weight = mix.w; }
    this.mixer.update(0);
    this.body.position.set(0, 0, 0);
    if (inPlace) {
      // анимации с ходом (xy): таз всегда над точкой персонажа, двигаем мы сами
      const p = this.hip();
      this.body.position.x = -p.x;
      this.body.position.z = -p.z;
    }
    return this;
  }
  private bip?: THREE.Object3D;
  private hip() {
    this.bip ??= this.body.getObjectByName('Bip01') ?? this.body.getObjectByName('Bip01_Pelvis') ?? this.body;
    this.root.updateMatrixWorld(true);
    return this.root.worldToLocal(this.bip.getWorldPosition(new THREE.Vector3()));
  }
  private speeds = new Map<string, number>();
  /** Собственная скорость шага анимации (м/с) — чтобы ноги не скользили. */
  speed(anim: string) {
    if (!this.speeds.has(anim)) {
      const d = this.act(anim).getClip().duration;
      const [x0, z0] = (this.pose(anim, 0), this.hip()).toArray().filter((_, i) => i !== 1);
      const [x1, z1] = (this.pose(anim, d - 1e-3), this.hip()).toArray().filter((_, i) => i !== 1);
      this.speeds.set(anim, Math.hypot(x1 - x0, z1 - z0) / d || 1.3);
    }
    return this.speeds.get(anim)!;
  }
  /** Поставить так, чтобы нижняя ступня стояла на полу y (после pose и позиции по x/z). */
  stand(floorY: number) {
    this.root.position.y = 0;
    this.root.updateMatrixWorld(true);
    let min = Infinity;
    const v = new THREE.Vector3();
    for (const f of this.feet) min = Math.min(min, f.getWorldPosition(v).y);
    if (!isFinite(min)) min = new THREE.Box3().setFromObject(this.body, true).min.y;
    this.root.position.y = floorY - min + 0.03; // подошва ботинка над костью ступни
    return this;
  }
}

/** Высота пола в точке (луч вниз по объектам с userData.floor). */
const ray = new THREE.Raycaster();
export const floorAt = (scene: THREE.Object3D, x: number, z: number, fallback = 0) => {
  const floors: THREE.Object3D[] = [];
  scene.traverse((o) => o.userData.floor && floors.push(o));
  ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(floors, true)[0];
  return hit ? hit.point.y : fallback;
};

/** Текстуры клубов дыма: фрактальный шум (fbm) с объёмной подсветкой сверху — 4 разных клуба. */
const smokeTex = (() => {
  let t: THREE.CanvasTexture[] | null = null;
  return () => {
    if (t) return t;
    t = [11, 23, 37, 51].map((seed) => {
      const N = 256, G = 16;
      let s = seed;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const grid = Array.from({length: 6}, () => Float32Array.from({length: (G + 1) * (G + 1)}, r));
      const sm = (x: number) => x * x * (3 - 2 * x);
      const vn = (o: number, x: number, y: number) => {
        const n = 4;
        const gx = (x * n) % G, gy = (y * n) % G;
        const ix = Math.floor(gx), iy = Math.floor(gy), fx = sm(gx - ix), fy = sm(gy - iy);
        const g = grid[o], W = G + 1;
        const v = (i: number, j: number) => g[(j % G) * W + (i % G)];
        return v(ix, iy) * (1 - fx) * (1 - fy) + v(ix + 1, iy) * fx * (1 - fy) + v(ix, iy + 1) * (1 - fx) * fy + v(ix + 1, iy + 1) * fx * fy;
      };
      const fbm = (x: number, y: number) => {
        let a = 0, w = 0.5, f = 1;
        for (let o = 0; o < 5; o++) { a += w * vn(o, x * f, y * f); w *= 0.5; f *= 2; }
        return a;
      };
      const D = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N, v = y / N;
        const d = Math.hypot(u - 0.5, v - 0.52) * 2;
        const n = fbm(u * 0.9 + 0.3, v * 0.9 + 0.1);
        D[y * N + x] = Math.max(0, Math.min(1, (n * 1.35 - d * d * 0.95 - 0.08) * 2.2));
      }
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d')!;
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const dx = D[i] - D[y * N + Math.max(0, x - 2)], dy = D[i] - D[Math.max(0, y - 2) * N + x];
        // свет сверху-слева: верх клуба светлее, низ и впадины темнее
        const lit = Math.max(0.35, Math.min(1, 0.72 + (dx * 2.2 + dy * 3.2) + (0.5 - y / N) * 0.35));
        const k = Math.round(255 * lit);
        img.data[i * 4] = k; img.data[i * 4 + 1] = k; img.data[i * 4 + 2] = k;
        img.data[i * 4 + 3] = Math.round(255 * Math.pow(D[i], 0.8));
      }
      g.putImageData(img, 0, 0);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      return tx;
    });
    return t;
  };
})();

const clodGeos = (() => {
  let g: THREE.BufferGeometry[] | null = null;
  return () => {
    if (g) return g;
    let s = 5;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g = [0, 1, 2, 3].map(() => {
      const q = new THREE.IcosahedronGeometry(1, 1);
      const p = q.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 0.6 + r() * 0.6;
        p.setXYZ(i, p.getX(i) * k * 1.3, p.getY(i) * k * 0.8, p.getZ(i) * k);
      }
      q.computeVertexNormals();
      return q;
    });
    return g;
  };
})();

export const explosion = (t: number, opt: {seed?: number; size?: number; dust?: string} = {}) => {
  const grp = new THREE.Group();
  if (t < 0 || t > 6) return grp;
  const S = opt.size ?? 1;
  let s = (opt.seed ?? 1) * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const tx = smokeTex();
  const dust = new THREE.Color(opt.dust ?? '#7a6d5e');
  const puff = (pos: THREE.Vector3, size: number, col: THREE.Color, op: number, rot: number, i: number, blend = THREE.NormalBlending) => {
    if (op <= 0.01) return;
    const m = new THREE.SpriteMaterial({map: tx[i % tx.length], color: col, transparent: true, depthWrite: false, opacity: Math.min(1, op), rotation: ((rot % 1) - 0.5) * 0.5, blending: blend}); // свет в текстуре сверху — почти не вращаем
    const p = new THREE.Sprite(m);
    p.position.copy(pos);
    p.scale.setScalar(size);
    grp.add(p);
  };
  // вспышка — короткая, маленький свет (без засветки кадра)
  if (t < 0.25) {
    const k = 1 - t / 0.25;
    const l = new THREE.PointLight('#ffb15c', 6 * k * S, 8 * S, 2);
    l.position.y = 0.8 * S;
    grp.add(l);
  }
  // огненное ядро: доли секунды
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28, k = t / 0.3;
    if (k > 1) { r(); continue; }
    puff(new THREE.Vector3(Math.cos(a) * 0.3 * S * k, (0.3 + r() * 0.6) * S * (0.5 + k), Math.sin(a) * 0.3 * S * k), (0.6 + k * 1.2) * S,
      new THREE.Color('#ffc070').lerp(new THREE.Color('#ff7a2a'), k), (1 - k) * 0.95, a, i, THREE.AdditiveBlending);
  }
  // столб земли: узкий тёмный выброс вверх, тормозит и расплывается
  for (let i = 0; i < 12; i++) {
    const h = (1.5 + r() * 2.5) * S, dx = (r() - 0.5) * 0.6 * S, dz = (r() - 0.5) * 0.6 * S, life = 2.2 + r() * 1.5, rot = r() * 6;
    const tt = t - r() * 0.08;
    if (tt < 0 || tt > life) continue;
    const e = 1 - Math.pow(1 - Math.min(1, tt / 0.9), 3);
    const k = tt / life;
    puff(new THREE.Vector3(dx * (1 + e), h * e - Math.max(0, tt - 1.2) * 0.4 * S, dz * (1 + e)), (0.5 + e * 1.1 + tt * 0.3) * S,
      dust.clone().multiplyScalar(0.55 + r() * 0.2), Math.min(1, tt / 0.05) * (1 - k * k) * 0.95, rot + tt * 0.2, i);
  }
  // клубящееся облако: медленно растёт и поднимается, держится дольше всего
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, up = 0.3 + r() * 1.4, sp = 0.4 + r() * 1.3, rot = r() * 6, life = 3.5 + r() * 2.5;
    const tt = t - 0.05 - r() * 0.25;
    if (tt < 0 || tt > life) continue;
    const k = tt / life;
    const e = 1 - Math.pow(1 - Math.min(1, tt / 1.4), 3);
    const fire = Math.max(0, 1 - tt / 0.4);
    const col = dust.clone().multiplyScalar(0.8 + r() * 0.35).lerp(new THREE.Color('#e0a060'), fire * 0.7);
    puff(new THREE.Vector3(Math.cos(a) * sp * e * S, (up * e * 2 + tt * 0.3) * S, Math.sin(a) * sp * e * S), (0.8 + e * 1.9 + tt * 0.35) * S,
      col, Math.min(1, tt / 0.1) * (1 - k) * 0.85, rot + tt * 0.15, i + 1);
  }
  // пыль по земле: низкое кольцо разлетается в стороны
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + r() * 0.5, life = 3 + r() * 2, rot = r() * 6;
    if (t > life) continue;
    const e = 1 - Math.pow(1 - Math.min(1, t / 1.0), 2);
    puff(new THREE.Vector3(Math.cos(a) * (0.5 + e * 2.6) * S, 0.25 * S, Math.sin(a) * (0.5 + e * 2.6) * S), (0.7 + e * 1.3) * S,
      dust.clone().multiplyScalar(0.95), Math.min(1, t / 0.12) * (1 - t / life) * 0.7, rot, i + 2);
  }
  // комья земли: неровные (смещённые вершины), тёмные, падают по баллистике
  const clods = clodGeos();
  const mud = new THREE.MeshStandardMaterial({color: opt.dust ? new THREE.Color(opt.dust).multiplyScalar(0.55) : '#3a2e24', roughness: 1});
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, v = (1.5 + r() * 3) * S, vy = (3 + r() * 4) * S, sz = (0.025 + r() * 0.05) * S;
    const y = vy * t - 4.9 * t * t;
    if (y < -0.1) continue;
    const c = new THREE.Mesh(clods[i % clods.length], mud);
    c.position.set(Math.cos(a) * v * t, y, Math.sin(a) * v * t);
    c.scale.setScalar(sz);
    c.rotation.set(t * 5 * r(), t * 7 * r(), t * 3);
    grp.add(c);
  }
  return grp;
};
