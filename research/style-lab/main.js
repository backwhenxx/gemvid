import * as THREE from 'three';
import { buildWorld } from './world.js';
import { STYLES } from './styles.js';
import { Pipeline } from './post.js';
const q = new URLSearchParams(location.search);
const id = q.get('style') || 'base', W = +(q.get('w') || 1080), H = Math.round(W * 16 / 9), SS = +(q.get('ss') || 1);
const st = STYLES[id]();
const cv = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W * SS, H * SS, false); cv.style.width = W + 'px'; cv.style.height = H + 'px';
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.NoToneMapping;
const world = buildWorld(st);
const pipe = new Pipeline(renderer, W * SS, H * SS, world.camera.near, world.camera.far);
const passes = st.post();
const fv = new THREE.Vector3();
// подписи «как в атласе»: бумажные ярлыки, привязанные к точкам мира
let labels = null;
if (st.labels) {
  const k = W / 1080, ov = document.getElementById('ov'), ink = '#3b2a1c';
  ov.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;overflow:hidden`;
  const L = [
    { a: [-4.9, -2.9, 0], t: [-5.2, -5.3, 0], s: 'погреб: +4 °С весь год' },
    { a: [2.5, -6.0, 0], t: [-0.9, -6.6, 0], s: 'колодец, 9 м' },
    { t: [0.25, -3.1, 0], s: 'глина' }, { t: [5.3, -5.7, 0], s: 'песок' }, { t: [-3.4, -9.1, 0], s: 'водоносный слой' },
  ];
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.style.cssText = 'position:absolute;left:0;top:0'; ov.appendChild(svg);
  const tag = (txt, size) => { const d = document.createElement('div'); d.textContent = txt; d.style.cssText = `position:absolute;transform:translate(-50%,-50%);white-space:nowrap;background:#f3e8cc;border:${1.6 * k}px solid ${ink};padding:${3 * k}px ${13 * k}px ${5 * k}px;font:italic ${size * k}px FreeSerif, DejaVu Serif, serif;color:${ink};box-shadow:${2 * k}px ${3 * k}px 0 rgba(59,42,28,0.35)`; ov.appendChild(d); return d; };
  for (const l of L) {
    if (l.a) { l.ln = document.createElementNS(ns, 'path'); l.ln.setAttribute('stroke', ink); l.ln.setAttribute('stroke-width', 2 * k); l.ln.setAttribute('fill', 'none'); svg.appendChild(l.ln); l.dot = document.createElementNS(ns, 'circle'); l.dot.setAttribute('r', 5 * k); l.dot.setAttribute('fill', ink); svg.appendChild(l.dot); }
    l.d = tag(l.s, l.a ? 31 : 33);
  }
  if (st.labels === 'atlas') { const head = tag('Рис. 12. Погреб и колодец в разрезе', 35); head.style.left = W / 2 + 'px'; head.style.top = 96 * k + 'px'; }
  const v = new THREE.Vector3(), pr = (p) => { v.set(...p).project(world.camera); return [(v.x * 0.5 + 0.5) * W, (1 - (v.y * 0.5 + 0.5)) * H]; };
  labels = () => { for (const l of L) { let [tx, ty] = pr(l.t); const w2 = l.d.offsetWidth / 2 + 14 * k; tx = Math.min(W - w2, Math.max(w2, tx)); l.d.style.left = tx + 'px'; l.d.style.top = ty + 'px'; if (l.a) { const [ax, ay] = pr(l.a); l.ln.setAttribute('d', `M${ax} ${ay} Q${(ax + tx) / 2 + 26 * k} ${(ay + ty) / 2 - 8 * k} ${tx} ${ty}`); l.dot.setAttribute('cx', ax); l.dot.setAttribute('cy', ay); } } };
}
window.__info = { name: st.name, fps: st.fps || 24 };
window.__render = (t, T) => {
  const f = st.fps || 24; const tt = Math.floor(t * f + 1e-6) / f;
  world.update(tt, T || 4);
  if (st.focusAt) for (const p of passes) if (p.u && 'uFocus' in p.u) pipe.mat(p).uniforms.uFocus.value = world.camera.position.distanceTo(fv.set(...st.focusAt));
  if (labels) labels();
  const t0 = performance.now();
  pipe.render(world.scene, world.camera, world.sky, passes, tt, st.flatNormals);
  const gl = renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return performance.now() - t0;
};
window.__ready = true;
