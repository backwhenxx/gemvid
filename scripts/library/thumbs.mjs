// Листы превью GLB через three.js (как в рендере): node thumbs.mjs <dir с .glb> <out-prefix> [anim.glb для позы]
// + каталог <out-prefix>.json: размеры, треугольники, анимации.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const [dir, prefix, pose] = process.argv.slice(2);
const ROOT = process.cwd();
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort();
const PAGE = `<!doctype html><html><body style="margin:0;background:#222">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const T = 240, COLS = 8;
const r = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
r.setSize(T, T); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
const L = new GLTFLoader();
window.run = async (urls, pose, poseTimes) => {
  const meta = [];
  let clip = null;
  if (pose) { const g = await L.loadAsync(pose); clip = g.animations[0]; }
  const items = [];
  for (const u of urls) for (const t of (poseTimes || [null])) items.push([u, t]);
  const rows = Math.ceil(items.length / COLS);
  const sheet = document.createElement('canvas'); sheet.width = COLS * T; sheet.height = rows * (T + 18);
  const ctx = sheet.getContext('2d'); ctx.fillStyle = '#26262b'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < items.length; i++) {
    const [u, t] = items[i];
    const sc = new THREE.Scene(); sc.background = new THREE.Color('#8f9aa3');
    sc.add(new THREE.HemisphereLight('#dfe8f0', '#5a5040', 1.6));
    const d = new THREE.DirectionalLight('#fff4e0', 2.2); d.position.set(3, 5, 4); sc.add(d);
    let info = {file: u.split('/').pop()};
    try {
      const g = await L.loadAsync(u);
      const root = g.scene; sc.add(root);
      if (clip && t !== null) { const mx = new THREE.AnimationMixer(root); mx.clipAction(clip).play(); mx.setTime(t); }
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      let tris = 0, skinned = false;
      root.traverse((o) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        if (o.isSkinnedMesh) { skinned = true; o.computeBoundingBox?.(); } const b = new THREE.Box3().setFromObject(o, true); box.union(b); } });
      const s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const R = Math.max(s.x, s.y, s.z) * 0.62;
      const cam = new THREE.PerspectiveCamera(30, 1, R / 50, R * 20);
      cam.position.set(c.x + R * 1.5, c.y + R * 0.6, c.z + R * 2.6); cam.lookAt(c);
      r.render(sc, cam);
      Object.assign(info, {size: [s.x, s.y, s.z].map((v) => +v.toFixed(3)), tris: Math.round(tris), skinned, anims: g.animations.map((a) => a.name)});
    } catch (e) { info.error = String(e); r.setClearColor('#600'); r.clear(); }
    const x = (i % COLS) * T, y = Math.floor(i / COLS) * (T + 18);
    ctx.drawImage(r.domElement, x, y);
    ctx.fillStyle = '#eee'; ctx.font = '13px sans-serif';
    ctx.fillText(((t !== null ? 't=' + t + ' ' : (i + 1) + '. ') + info.file.replace('.glb', '')).slice(0, 30), x + 3, y + T + 13);
    if (t === null || t === poseTimes[0]) meta.push(info);
  }
  return {img: sheet.toDataURL('image/jpeg', 0.85), meta};
};
window.ready = true;
</script></body></html>`;

const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/p.html') { s.setHeader('content-type', 'text/html'); return s.end(PAGE); }
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f)) { s.statusCode = 404; return s.end(); }
  s.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  fs.createReadStream(f).pipe(s);
}).listen(8765);
const br = await puppeteer.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const pg = await br.newPage();
pg.on('console', (m) => console.log('page:', m.text()));
await pg.goto('http://localhost:8765/p.html');
await pg.waitForFunction('window.ready');
const rel = (f) => '/' + path.relative(ROOT, path.join(dir, f));
const all = [];
const PER = pose ? 48 : 48;
const times = pose ? JSON.parse(process.env.POSE_TIMES || 'null') : null;
for (let p = 0; p < files.length; p += PER) {
  const res = await pg.evaluate((u, po, ti) => window.run(u, po, ti), files.slice(p, p + PER).map(rel), pose ? '/' + path.relative(ROOT, pose) : null, times);
  fs.writeFileSync(`${prefix}_${String(p / PER + 1).padStart(2, '0')}.jpg`, Buffer.from(res.img.split(',')[1], 'base64'));
  all.push(...res.meta);
  console.log('лист', p / PER + 1);
}
fs.writeFileSync(`${prefix}.json`, JSON.stringify(all, null, 0));
await br.close(); srv.close();
