// Стили: материалы + свет + небо + цепочка постобработки. Мир один и тот же.
import * as THREE from 'three';
import { P } from './post.js';
import { rnd } from './world.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const hsl = (hex) => { const o = {}; new THREE.Color(hex).getHSL(o, THREE.SRGBColorSpace); return o; };
const css = (h, s, l, a = 1) => `hsla(${(((h % 1) + 1) % 1) * 360},${clamp01(s) * 100}%,${clamp01(l) * 100}%,${a})`;
const seedOf = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const texCache = new Map();
const cached = (k, f) => { if (!texCache.has(k)) texCache.set(k, f()); return texCache.get(k); };

// «как сейчас»: мелкая крапинка
const speckle = (hex, role, k = 1) => cached('sp' + hex + role + k, () => canvasTex(512, (g, S) => {
  const { h, s, l } = hsl(hex), r = rnd(seedOf(role)); g.fillStyle = css(h, s, l); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { g.fillStyle = css(h + (r() - 0.5) * 0.02, s, l + (r() - 0.5) * 0.17 * k, 0.4); g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 5 * k, 0, 7); g.fill(); }
}));
// живопись: широкие мазки с разбросом тона и оттенка
const STROKE = {
  grass: { ang: 1.5, spread: 0.35, len: 46, wid: 13, lv: 0.09, hv: 0.04 }, soil: { ang: 0, spread: 0.3, len: 80, wid: 20 }, clay: { ang: 0.08, spread: 0.3, len: 110, wid: 30, lv: 0.08, hv: 0.025 },
  sand: { ang: -0.05, spread: 0.25, len: 110, wid: 26, lv: 0.06 }, aquifer: { ang: 0, spread: 0.4, len: 70, wid: 22, hv: 0.04 }, rock: { ang: 0.25, spread: 0.5, len: 120, wid: 38, lv: 0.07, hv: 0.04 },
  wall: { ang: 0.9, spread: 0.7, len: 90, wid: 34, lv: 0.05, sv: 0.08 }, roof: { ang: 0, spread: 0.2, len: 70, wid: 22, lv: 0.08 }, leaf: { ang: 0.6, spread: 1.6, len: 34, wid: 22, lv: 0.1, hv: 0.045 },
  leaf2: { ang: 0.6, spread: 1.6, len: 34, wid: 22, lv: 0.1, hv: 0.045 }, leafDark: { ang: 0.6, spread: 1.6, len: 34, wid: 22, lv: 0.08, hv: 0.04 }, cloud: { ang: 0.2, spread: 0.8, len: 90, wid: 40, lv: 0.035, sv: 0.05 },
  brick: { ang: 0, spread: 0.15, len: 60, wid: 20, lv: 0.08 }, wood: { ang: 0, spread: 0.12, len: 120, wid: 14, lv: 0.07 }, stone: { ang: 0.4, spread: 0.9, len: 60, wid: 26, lv: 0.07 },
};
const strokes = (hex, role) => cached('st' + hex + role, () => canvasTex(512, (g, S) => {
  const o = Object.assign({ ang: 0.3, spread: 0.6, len: 70, wid: 22, hv: 0.03, sv: 0.12, lv: 0.08, n: 520 }, STROKE[role] || {}); o.lv *= 0.62; o.hv *= 0.6; o.len *= 1.3; o.wid *= 1.3;
  const { h, s, l } = hsl(hex), r = rnd(seedOf(role) + 3); g.fillStyle = css(h, s, l); g.fillRect(0, 0, S, S);
  for (let i = 0; i < o.n; i++) {
    const x = r() * S, y = r() * S, a = o.ang + (r() - 0.5) * 2 * o.spread, L = o.len * (0.5 + r()), W = o.wid * (0.55 + r() * 0.9);
    const warm = (r() - 0.5) * 2; const col = css(h + warm * o.hv, s + (r() - 0.5) * 2 * o.sv, l + (r() - 0.5) * 2 * o.lv + warm * 0.01, 0.5 + r() * 0.45);
    for (const [ox, oy] of [[0, 0], [-S, 0], [0, -S], [-S, -S], [S, 0], [0, S]]) { g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.fillStyle = col; g.beginPath(); g.roundRect(-L / 2, -W / 2, L, W, W * 0.45); g.fill(); g.restore(); }
  }
}));
// пластилин: рельеф (отпечатки пальцев, вмятины) и лёгкая пятнистость цвета
const clayBump = () => cached('claybump', () => canvasTex(512, (g, S) => {
  const r = rnd(5); g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { const x = r() * S, y = r() * S, rad = 18 + r() * 60, d = r() > 0.5; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, d ? 'rgba(40,40,40,0.35)' : 'rgba(215,215,215,0.35)'); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; for (const [ox, oy] of [[0, 0], [-S, 0], [0, -S], [-S, -S]]) { g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); } }
  for (let i = 0; i < 16; i++) { const x = r() * S, y = r() * S, a = r() * 6.28, rx = 22 + r() * 22; g.save(); g.translate(x, y); g.rotate(a); g.lineWidth = 1.6; for (let k = 3; k < rx; k += 3.6) { g.strokeStyle = 'rgba(50,50,50,0.33)'; g.beginPath(); g.ellipse(0, 0, k, k * 1.35, 0, 0, 6.28); g.stroke(); } g.restore(); }
  for (let i = 0; i < 5000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
}, false));
const mottle = (hex, role) => cached('mo' + hex + role, () => canvasTex(256, (g, S) => {
  const { h, s, l } = hsl(hex), r = rnd(seedOf(role) + 9); g.fillStyle = css(h, s, l); g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, rad = 20 + r() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, css(h + (r() - 0.5) * 0.03, s, l + (r() - 0.5) * 0.09, 0.5)); gr.addColorStop(1, css(h, s, l, 0)); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
}));
const ramp = (steps) => cached('ramp' + steps.join(), () => { const d = new Uint8Array(steps.length * 4); steps.forEach((v, i) => { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255; }); const t = new THREE.DataTexture(d, steps.length, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; });

const rampRGB = (cols) => cached('rr' + cols.join(), () => { const d = new Uint8Array(cols.length * 4); cols.forEach((c, i) => { d[i * 4] = c[0] * 255; d[i * 4 + 1] = c[1] * 255; d[i * 4 + 2] = c[2] * 255; d[i * 4 + 3] = 255; }); const t = new THREE.DataTexture(d, cols.length, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; });
const softRamp = (shadow, term, key = 'd') => cached('soft' + key, () => { const N = 64, d = new Uint8Array(N * 4); const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < N; i++) { const x = i / (N - 1); let c = mix(shadow, term, ss(0.16, 0.36, x)); c = mix(c, [0.86, 0.86, 0.86], ss(0.34, 0.5, x)); c = mix(c, [1, 1, 1], ss(0.5, 1, x)); d[i * 4] = c[0] * 255; d[i * 4 + 1] = c[1] * 255; d[i * 4 + 2] = c[2] * 255; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, N, 1); t.minFilter = t.magFilter = THREE.LinearFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; });
const NOUV = (role) => role.startsWith('hill');
function fin(m, hex, o) {
  if (o.side) m.side = o.side;
  if (o.water) { m.transparent = true; m.opacity = 0.85; }
  if (o.emissive && 'emissive' in m) { m.emissive = new THREE.Color(hex); m.emissiveIntensity = o.ei ?? 0.9; }
  if (o.tone) m.color.multiplyScalar(o.tone);
  return m;
}
function sun(scene, color, I, pos = [-11, 17, 13], radius = 2, size = 2048) {
  const d = new THREE.DirectionalLight(color, I); d.position.set(...pos); d.target.position.set(0, -2, -2); scene.add(d, d.target); d.castShadow = true;
  const c = d.shadow.camera; c.left = -24; c.right = 24; c.top = 24; c.bottom = -24; c.near = 1; c.far = 100; d.shadow.mapSize.set(size, size); d.shadow.bias = -0.0006; d.shadow.normalBias = 0.05; d.shadow.radius = radius; return d;
}
function dome(sky, scene, top, mid, fog = [50, 230], fogCol, low) {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, low: { value: new THREE.Color(low || mid) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top, mid, low; void main(){ float h = normalize(vP).y; vec3 c = mix(low, mid, smoothstep(0.0, 0.11, h)); gl_FragColor = vec4(mix(c, top, smoothstep(0.06, 0.42, h)), 1.); }' });
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 20), m));
  if (fog) scene.fog = new THREE.Fog(new THREE.Color(fogCol || low || mid), fog[0], fog[1]);
}
const hemi = (scene, a, b, I) => scene.add(new THREE.HemisphereLight(a, b, I));

const stdMat = (role, hex, o) => fin(new THREE.MeshStandardMaterial(NOUV(role) ? { color: hex, roughness: 0.95 } : { map: speckle(hex, role), roughness: 0.92 }), hex, o);
const lambert = (flat) => (role, hex, o) => fin(new THREE.MeshLambertMaterial({ color: hex, flatShading: !!flat }), hex, o);
const toon = (steps) => (role, hex, o) => fin(new THREE.MeshToonMaterial({ color: hex, gradientMap: ramp(steps) }), hex, o);

export const STYLES = {
  // 0. Как сейчас
  base: () => ({
    name: 'Сейчас', mat: stdMat,
    setup(scene, sky) { sun(scene, '#fff4e0', 3.0); hemi(scene, '#cfe2ff', '#8a7860', 1.1); dome(sky, scene, '#3f86d8', '#c4e2f5'); },
    post: () => [P.tonemap({}), P.fxaa(), P.finish({ vig: 0.1 })],
  }),

  // 1. Живопись — ближе всего к присланным роликам
  paint: () => ({
    name: 'Живопись',
    pal: { roof: '#b9502e', shutter: '#2c8086', door: '#7a4a2c', pipe: '#efb11f', grass: '#8aa644', leaf: '#5d8f3c', leaf2: '#9db84a', leafDark: '#31624a', wall: '#ead9b6', clay: '#b27748', sand: '#dcc083', aquifer: '#5d8fa6', rock: '#474c66', soil: '#4a342b', cloud: '#fbeedd', hillMid: '#6f9f84', hillFar: '#86a9d2', stone: '#9c958f', concrete: '#bfb8ad', brick: '#a35238', pebble: '#b4c0c6', trunk: '#5b4036', wood: '#8b5f3a', woodDark: '#5a3b28', barrel: '#7a4d2e' },
    mat: (role, hex, o) => { const gm = softRamp([0.10, 0.11, 0.2], [0.66, 0.42, 0.3], 'day'); return fin(new THREE.MeshToonMaterial(NOUV(role) ? { color: hex, gradientMap: gm } : { map: strokes(hex, role), gradientMap: gm }), hex, o); },
    lampI: 22,
    setup(scene, sky) {
      sun(scene, '#ffd09a', 2.9, [-12, 15, 12], 1.5); hemi(scene, '#8494ee', '#c98e70', 1.25);
      const rim = new THREE.DirectionalLight('#a8d8ff', 0.7); rim.position.set(12, 8, -12); scene.add(rim);
      dome(sky, scene, '#2a5cbc', '#8cc0ee', [36, 170], '#d5e3f0', '#fff1d8');
    },
    post: () => [P.tonemap({ exp: 1.0 }), P.kuwahara({ radius: 6, q: 9, half: true }), P.ink({ px: 1.2, op: 0.4, wob: 1.0, self: 1, n: 9 }), P.finish({ sat: 1.02, con: 1.07, sh: [0.0, 0.005, 0.04], hi: [0.035, 0.015, -0.02], emboss: 0.6, canvas: 0.05, grain: 0.03, vig: 0.25 })],
  }),

  // 1б. Живопись, вечер — тот же стиль, другое настроение
  dusk: () => {
    const b = STYLES.paint();
    return Object.assign(b, {
      name: 'Живопись, вечер', lampI: 16,
      pal: Object.assign({}, b.pal, { cloud: '#ffd9c2', glass: '#ffd070', lamp: '#ffd98a' }),
      mat: (role, hex, o) => { const gm = softRamp([0.06, 0.07, 0.16], [0.74, 0.36, 0.22], 'dusk'); const m = fin(new THREE.MeshToonMaterial(NOUV(role) ? { color: hex, gradientMap: gm } : { map: strokes(hex, role), gradientMap: gm }), hex, o); if (o.emissive) m.emissiveIntensity = 2.2; return m; },
      setup(scene, sky) {
        sun(scene, '#ff9d5c', 3.0, [-17, 6.5, 11], 1.5); hemi(scene, '#5a66c8', '#8a5a6a', 1.25);
        const rim = new THREE.DirectionalLight('#7fb0ff', 0.6); rim.position.set(12, 8, -12); scene.add(rim);
        dome(sky, scene, '#27306e', '#c26a7a', [36, 170], '#b98592', '#ffb36b');
      },
      post: () => [P.tonemap({ exp: 1.05 }), P.kuwahara({ radius: 6, q: 9, half: true }), P.ink({ px: 1.2, op: 0.4, wob: 1.0, self: 1, n: 9 }), P.finish({ sat: 1.05, con: 1.1, sh: [0.0, 0.0, 0.05], hi: [0.05, 0.02, -0.03], emboss: 0.6, canvas: 0.05, grain: 0.035, vig: 0.32 })],
    });
  },

  // 2. Пластилин — мир как вылепленный макет, покадровая съёмка
  clay: () => ({
    name: 'Пластилин', fps: 12,
    geo: { r: 0.11, wobble: 0.035, finite: true },
    pal: { grass: '#8cc63f', soil: '#6b4a35', clay: '#dc8a4c', sand: '#f2d58a', aquifer: '#7fb6cc', rock: '#70748a', roof: '#e4553a', wall: '#f8ecd4', leaf: '#58a83d', leaf2: '#93d04a', leafDark: '#3c8c4e', water: '#4aa3e0', stone: '#bbb4a8', pipe: '#3b7de6', trunk: '#7c5338', table: '#c48d58', mat: '#4f9a7c', board: '#a9d7f3', pebble: '#c9d6dc', shutter: '#3aa0a6', door: '#8a5230', concrete: '#d2cec4' },
    mat: (role, hex, o) => fin(new THREE.MeshStandardMaterial({ map: mottle(hex, role), bumpMap: clayBump(), bumpScale: 2.2, roughness: 0.62 }), hex, o),
    lampI: 9, strings: true, cloudsInScene: true,
    cam: { a: [[9.5, 6.0, 40], [0, -2.1, -2]], b: [[6, 5, 36.5], [0, -2.3, -2]] }, focusAt: [0, -2.2, -0.5],
    setup(scene, sky) { sun(scene, '#fff0da', 2.7, [-13, 19, 17], 5); hemi(scene, '#ffffff', '#ecc9a6', 1.15); dome(sky, scene, '#e9c9b2', '#e9c9b2', null); },
    extra({ box }) { box(90, 70, 0.4, 'board', 0, 18, -17, { r: 0.05, cast: false }); },
    post: () => [P.tonemap({ exp: 1.0 }), P.fxaa(), P.tilt({ k: 2.4, max: 12 }), P.finish({ sat: 1.12, con: 1.04, vig: 0.22, grain: 0.025 })],
  }),

  // 3. Макет на столе — музейная диорама, малая глубина резкости
  diorama: () => ({
    name: 'Макет', geo: { finite: true }, noClouds: true, mat: stdMat, lampI: 12,
    pal: { table: '#8a5f3c', mat: '#2f6b55', board: '#bfdcee' },
    cam: { a: [[10, 7, 41.5], [0, -2.5, -2]], b: [[6.5, 5.6, 38], [0, -2.6, -2]] }, focusAt: [0, -2.5, -0.5],
    setup(scene, sky) {
      const s = sun(scene, '#ffe2b8', 3.4, [-14, 20, 16], 4); void s; hemi(scene, '#9fa8c9', '#5a4636', 0.5);
      dome(sky, scene, '#17130f', '#2b241e', null);
    },
    extra({ scene, box, cyl, M }) {
      const tex = canvasTex(1024, (g, S) => {
        const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#5f9fdc'); gr.addColorStop(0.75, '#cfe6f2'); gr.addColorStop(1, '#eef0e0'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
        const r = rnd(4); for (const [cx, cy, sc] of [[260, 330, 1.2], [700, 210, 1.5], [840, 520, 0.9], [120, 620, 0.8]]) for (let i = 0; i < 26; i++) { const x = cx + (r() - 0.5) * 240 * sc, y = cy + (r() - 0.5) * 60 * sc - Math.abs(x - cx) * 0.05, rad = (26 + r() * 40) * sc; const q = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad); q.addColorStop(0, 'rgba(255,255,255,0.95)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 23.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); b.position.set(0, -1.3, -9.0); b.receiveShadow = true; scene.add(b);
      box(18.1, 24.1, 0.3, 'woodDark', 0, -1.3, -9.2, { r: 0.05 });
      void M;
    },
    post: () => [P.tonemap({ exp: 1.05 }), P.fxaa(), P.tilt({ k: 3.0, max: 15 }), P.finish({ sat: 1.06, con: 1.06, vig: 0.4, grain: 0.03 })],
  }),

  // 4. Комикс
  comic: () => ({
    name: 'Комикс',
    pal: { grass: '#7fc241', soil: '#5a3b28', clay: '#dc803a', sand: '#f4d37a', aquifer: '#6fb1c9', rock: '#5a5f78', roof: '#e2482d', wall: '#fff1d6', leaf: '#4fa03a', leaf2: '#86c94a', leafDark: '#2f7a45', pipe: '#2f6fe0', hillMid: '#8fc79a', hillFar: '#b9d6ea' },
    mat: toon([0.55, 1]),
    setup(scene, sky) { sun(scene, '#ffffff', 2.4, [-11, 17, 13], 1); hemi(scene, '#b9c8ff', '#c9a184', 1.3); dome(sky, scene, '#3b9be6', '#c3e8fb'); },
    post: () => [P.tonemap({ aces: 0.3 }), P.fxaa(), P.halftone({}), P.ink({ color: '#17121a', px: 2.6, wob: 1.6, ws: 48, n: 0.45 }), P.finish({ sat: 1.12, paper: '#fff2dc', paperK: 0.55, grain: 0.02 })],
  }),

  // 5. Бумага — аппликация из цветного картона
  paper: () => ({
    name: 'Бумага', geo: { flat: true, detail: 1, r: 0.001, layerStep: 0.12 }, flatClouds: true, flatNormals: true,
    pal: { grass: '#8fb86a', soil: '#6e4f3b', clay: '#d8935a', sand: '#efd7a0', aquifer: '#8fbccb', rock: '#6b6f80', roof: '#db6548', wall: '#f7edda', leaf: '#6aa45a', leaf2: '#9cc76c', leafDark: '#3f7f5a', hillMid: '#9cc0a4', hillFar: '#c5dae4', trunk: '#7b5a45', pipe: '#3f77c9' },
    mat: lambert(true),
    setup(scene, sky) { sun(scene, '#fff6ea', 2.1, [-11, 17, 13], 4); hemi(scene, '#ffffff', '#d9c9b9', 1.5); dome(sky, scene, '#bfe0ef', '#eaf3f1'); },
    post: () => [P.tonemap({ aces: 0 }), P.fxaa(), P.paper({ edge: 0.6, tex: 0.09 }), P.finish({ vig: 0.12 })],
  }),

  // 6. Атлас — ожившая гравюра из старой энциклопедии
  atlas: () => ({
    name: 'Атлас', mat: lambert(false), labels: 'atlas', pal: { rock: '#7b8094', soil: '#6a4a38', leafDark: '#3f7a50', clay: '#c27c46', aquifer: '#6fa3bd', roof: '#c2502f' },
    setup(scene, sky) { sun(scene, '#ffffff', 2.7, [-11, 17, 13], 2); hemi(scene, '#dfe6ff', '#bfa98f', 1.15); dome(sky, scene, '#6f93bd', '#e8e3d2'); },
    post: () => [P.tonemap({ aces: 0.5 }), P.fxaa(), P.engrave({ paper: '#f2e6c9', wash: 0.95 })],
  }),

  // 7. Скетчбук — акварель и карандаш
  sketch: () => ({
    name: 'Скетчбук', mat: lambert(false),
    pal: { grass: '#84b848', clay: '#cc7f44', roof: '#cf5334', aquifer: '#5f9fc0', leaf: '#5aa040', leaf2: '#8cc24c', rock: '#7d849c' },
    setup(scene, sky) { sun(scene, '#fff6e6', 2.6, [-11, 17, 13], 2); hemi(scene, '#cfdcff', '#c9a98a', 1.25); dome(sky, scene, '#5f9fe0', '#eaf2f5'); },
    post: () => [P.tonemap({ aces: 0.3 }), P.kuwahara({ radius: 5, q: 8, half: true }), P.watercolor({})],
  }),

  // 8. Плакат — ризограф в четыре краски
  riso: () => ({
    name: 'Плакат', mat: toon([0.5, 0.78, 1]),
    setup(scene, sky) { sun(scene, '#ffffff', 2.5, [-11, 17, 13], 1); hemi(scene, '#d6e2ff', '#c9a98a', 1.2); dome(sky, scene, '#58aee2', '#eef5f3'); },
    post: () => [P.tonemap({ aces: 0.2 }), P.fxaa(), P.riso({})],
  }),

  // 9. Низкополигональная пастель
  lowpoly: () => ({
    name: 'Грани', geo: { flat: true, detail: 1, r: 0.001 }, flatNormals: true,
    pal: { grass: '#9fd16a', soil: '#7a5a48', clay: '#e29a68', sand: '#f5dda6', aquifer: '#8fcbe0', rock: '#7f86a3', roof: '#f0705a', wall: '#fff4e2', leaf: '#6fc06a', leaf2: '#a8de7a', leafDark: '#4a9a78', hillMid: '#a9d6b4', hillFar: '#cfe3f0', water: '#5ab4f0', pipe: '#5a8ff0', stone: '#c3bdb4', trunk: '#8a644c' },
    mat: (role, hex, o) => fin(new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 1 }), hex, o),
    setup(scene, sky) { sun(scene, '#fff0dc', 2.5, [-11, 17, 13], 3); hemi(scene, '#dfe9ff', '#f0c9b0', 1.35); dome(sky, scene, '#8cc7f2', '#fde9d2'); },
    post: () => [P.tonemap({ aces: 0.4 }), P.fxaa(), P.finish({ sat: 1.08, vig: 0.1 })],
  }),
};
