import * as THREE from 'three';
import {Pipeline} from './post.js';
import {makeRig, passes as mk} from './look.js';
const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 540), H = Math.round(W * 16 / 9), SS = +(q.get('ss') || 2), world = q.get('world') || 'teplo';
const cv = document.getElementById('c');
const r = new THREE.WebGLRenderer({canvas: cv, antialias: false, preserveDrawingBuffer: true});
r.setPixelRatio(1); r.setSize(W, H, false); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.NoToneMapping;
const Wm = await import(`./worlds/${world}.js`);
const scene = new THREE.Scene(), sky = new THREE.Group(); scene.add(sky);
const setTod = makeRig(scene, sky); const w = Wm.build(scene, sky);
const cam = new THREE.PerspectiveCamera(40, 1080 / 1920, Wm.NEAR ?? 3, 600);
const pipe = new Pipeline(r, W * SS, H * SS, Wm.NEAR ?? 3, 600); const ps = mk();
const ease = (x) => x * x * (3 - 2 * x);
// a: {cam:[a,b], p, tod:[a,b], k, q:{...}}
window.__render = (a) => {
  const A = Wm.CAMS[a.cam[0]], B = Wm.CAMS[a.cam[1] ?? a.cam[0]], k = ease(a.p ?? 0);
  const pos = new THREE.Vector3(...A.pos).lerp(new THREE.Vector3(...B.pos), k), look = new THREE.Vector3(...A.look).lerp(new THREE.Vector3(...B.look), k);
  cam.position.copy(pos); cam.lookAt(look); cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  setTod(a.tod?.[0] ?? 'day', a.tod?.[1] ?? a.tod?.[0] ?? 'day', a.k ?? 0, w.lamps, w.wins);
  w.animate(Object.assign({t: a.t ?? 0}, a.q || {}));
  const t0 = performance.now(); pipe.render(scene, cam, sky, ps, a.t ?? 0, true);
  const px = new Uint8Array(4); r.getContext().readPixels(0, 0, 1, 1, r.getContext().RGBA, r.getContext().UNSIGNED_BYTE, px);
  return performance.now() - t0;
};
window.__ready = true;
