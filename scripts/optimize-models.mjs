// Сжатие 3D-моделей (glTF Transform): assets/models/raw/*.glb → assets/models/*.glb
// Меньше вес → быстрее рендер. Сжатие meshopt + текстуры webp ≤1024.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(ROOT, 'assets/models/raw');
const dst = path.join(ROOT, 'assets/models');
if (!fs.existsSync(src)) {
  console.log('Положи исходные .glb в assets/models/raw/');
  process.exit(0);
}
const cli = path.join(ROOT, 'node_modules/.bin/gltf-transform');
for (const f of fs.readdirSync(src).filter((x) => /\.(glb|gltf)$/i.test(x))) {
  const out = path.join(dst, f.replace(/\.gltf$/i, '.glb'));
  execFileSync(cli, ['optimize', path.join(src, f), out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024'], {stdio: 'inherit'});
  const kb = (p) => Math.round(fs.statSync(p).size / 1024);
  console.log(`${f}: ${kb(path.join(src, f))} КБ → ${kb(out)} КБ`);
}
