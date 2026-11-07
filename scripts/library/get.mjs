// Подкачка ассетов библиотеки по id в public/lib (кэшируется в Actions):
//   rb:<Аватар>      — человек Rocketbox (MIT), GLB из релиза lib
//   rba:<анимация>   — анимация Rocketbox (m_walk_neutral_01 …)
//   ph:<id>          — модель Poly Haven (CC0), glTF 1k
//   pht:<id>         — текстура Poly Haven: diff/nor_gl/rough 1k jpg
//   phh:<id>         — HDRI Poly Haven 1k (небо + свет)
// Ищет такие строки в любом месте episode.json.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const RE = /^(rb|rba|ph|pht|phh):[\w.-]+$/;
export const collectIds = (o, out = new Set()) => {
  if (typeof o === 'string') { if (RE.test(o)) out.add(o); }
  else if (Array.isArray(o)) o.forEach((x) => collectIds(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => collectIds(x, out));
  return out;
};

const dl = async (url, file) => {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, {headers: {'User-Agent': 'gemvid/1.0'}});
    if (r.ok) { fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return; }
    console.log('повтор', r.status, url);
  }
  throw new Error('не скачалось: ' + url);
};
const ph = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
const gh = (args, cwd) => execFileSync('gh', args, {cwd, stdio: 'inherit'});

export async function fetchLib(ids, ROOT) {
  const L = path.join(ROOT, 'public/lib');
  for (const id of ids) {
    const [k, n] = id.split(':');
    if (k === 'rb') {
      const f = path.join(L, 'rb', n + '.glb');
      if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), {recursive: true}); gh(['release', 'download', 'lib', '-p', `rb_${n}.glb`, '-D', path.dirname(f), '--clobber'], ROOT); fs.renameSync(path.join(path.dirname(f), `rb_${n}.glb`), f); }
    } else if (k === 'rba') {
      if (!fs.existsSync(path.join(L, 'rba', n + '.glb'))) {
        fs.mkdirSync(L, {recursive: true});
        gh(['release', 'download', 'lib', '-p', 'rocketbox-anims.zip', '-D', L, '--clobber'], ROOT);
        execFileSync('unzip', ['-qo', path.join(L, 'rocketbox-anims.zip'), '-d', L]);
        fs.rmSync(path.join(L, 'rba'), {recursive: true, force: true});
        fs.renameSync(path.join(L, 'anims'), path.join(L, 'rba'));
        fs.rmSync(path.join(L, 'rocketbox-anims.zip'));
      }
    } else if (k === 'ph') {
      const j = (await ph(n)).gltf?.['1k']?.gltf;
      if (!j) throw new Error('нет glTF у ' + n);
      await dl(j.url, path.join(L, 'ph', n, n + '.gltf'));
      for (const [p, v] of Object.entries(j.include ?? {})) await dl(v.url, path.join(L, 'ph', n, p));
    } else if (k === 'pht') {
      const j = await ph(n);
      for (const [map, name] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['Rough', 'rough']]) {
        const u = j[map]?.['1k']?.jpg?.url;
        if (u) await dl(u, path.join(L, 'pht', n, name + '.jpg'));
      }
    } else if (k === 'phh') {
      const j = await ph(n);
      await dl(j.hdri['1k'].hdr.url, path.join(L, 'phh', n + '.hdr'));
    }
    console.log('библиотека:', id);
  }
}
