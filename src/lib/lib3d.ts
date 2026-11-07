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
  constructor(id: string, opt: {height?: number} = {}) {
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
      const clip = getLib<GLTF>(animId).animations[0];
      a = this.mixer.clipAction(clip);
      a.play();
      this.actions.set(animId, a);
    }
    return a;
  }
  /** Поза: одна анимация или смешивание двух (w — вес второй). t — секунды. */
  pose(anim: string, t: number, mix?: {anim: string; t: number; w: number}) {
    this.actions.forEach((a) => (a.weight = 0));
    const a = this.act(anim);
    a.time = t % a.getClip().duration;
    a.weight = mix ? 1 - mix.w : 1;
    if (mix) { const b = this.act(mix.anim); b.time = mix.t % b.getClip().duration; b.weight = mix.w; }
    this.mixer.update(0);
    return this;
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

/** Взрыв: вспышка, огненное ядро, клубы дыма-спрайтов с текстурой, комья. t — сек от начала. */
const smokeTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const R = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const r = R(7);
    for (let i = 0; i < 70; i++) {
      const x = 128 + (r() - 0.5) * 120, y = 128 + (r() - 0.5) * 120, rad = 20 + r() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const a = 0.12 + r() * 0.1;
      gr.addColorStop(0, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
    const m = g.getImageData(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const d = Math.hypot(x - 128, y - 128) / 128;
      m.data[(y * 256 + x) * 4 + 3] *= Math.max(0, 1 - d * d);
    }
    g.putImageData(m, 0, 0);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

export const explosion = (t: number, opt: {seed?: number; size?: number; dust?: string} = {}) => {
  const grp = new THREE.Group();
  if (t < 0 || t > 6) return grp;
  const S = opt.size ?? 1;
  let s = (opt.seed ?? 1) * 9301 + 49297;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const tx = smokeTex();
  // вспышка — короткая, маленький свет (без засветки кадра)
  if (t < 0.25) {
    const k = 1 - t / 0.25;
    const l = new THREE.PointLight('#ffb15c', 6 * k * S, 8 * S, 2);
    l.position.y = 0.8 * S;
    grp.add(l);
  }
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, up = 0.4 + r() * 1.2, sp = 0.5 + r() * 1.5, rot = r() * 6, life = 2.5 + r() * 3;
    const delay = r() * 0.15;
    const tt = t - delay;
    if (tt < 0 || tt > life) continue;
    const k = tt / life;
    const ease = 1 - Math.pow(1 - Math.min(1, tt / 1.2), 3);
    const fire = Math.max(0, 1 - tt / 0.35);
    const col = new THREE.Color(opt.dust ?? '#6f6559').lerp(new THREE.Color('#ffd08a'), fire);
    const m = new THREE.SpriteMaterial({map: tx, color: col, transparent: true, depthWrite: false, opacity: Math.min(1, tt / 0.06) * (1 - k) * 0.9, rotation: rot + tt * 0.3});
    const sp_ = new THREE.Sprite(m);
    sp_.position.set(Math.cos(a) * sp * ease * S, (up * ease * 2.2 + tt * 0.35) * S, Math.sin(a) * sp * ease * S);
    sp_.scale.setScalar((0.6 + ease * 1.8 + tt * 0.25) * S);
    grp.add(sp_);
  }
  // комья земли: неровные, падают по баллистике
  const clod = new THREE.IcosahedronGeometry(0.06 * S, 0);
  const mud = new THREE.MeshStandardMaterial({color: opt.dust ?? '#4b3b2c', roughness: 1, flatShading: true});
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, v = (2 + r() * 3) * S, vy = (3 + r() * 4) * S;
    const y = vy * t - 4.9 * t * t;
    if (y < -0.2) continue;
    const c = new THREE.Mesh(clod, mud);
    c.position.set(Math.cos(a) * v * t, y, Math.sin(a) * v * t);
    c.scale.set(1 + r(), 0.7 + r() * 0.6, 1 + r() * 0.8);
    c.rotation.set(t * 5 * r(), t * 7 * r(), 0);
    grp.add(c);
  }
  return grp;
};
