// Текстуры внутри GLB: извлечь (для правки) и вставить обратно.
//   node tex.mjs extract model.glb outdir     → outdir/t<номер>.<png|jpg> + outdir/textures.json
//   node tex.mjs replace model.glb dir out.glb → заменить картинки t<номер>.* из dir
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

const [mode, src, dir, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const tex = doc.getRoot().listTextures();
const ext = (m) => (m === 'image/png' ? 'png' : m === 'image/webp' ? 'webp' : 'jpg');
if (mode === 'extract') {
  fs.mkdirSync(dir, {recursive: true});
  const info = [];
  const slots = new Map();
  for (const m of doc.getRoot().listMaterials()) {
    for (const [k, t] of [['base', m.getBaseColorTexture()], ['normal', m.getNormalTexture()], ['orm', m.getMetallicRoughnessTexture()], ['emissive', m.getEmissiveTexture()], ['occlusion', m.getOcclusionTexture()]]) {
      if (t) slots.set(t, [...(slots.get(t) ?? []), `${m.getName()}:${k}`]);
    }
  }
  tex.forEach((t, i) => {
    const f = `t${i}.${ext(t.getMimeType())}`;
    fs.writeFileSync(path.join(dir, f), t.getImage());
    info.push({i, file: f, name: t.getName(), mime: t.getMimeType(), size: t.getSize(), used: slots.get(t) ?? []});
  });
  fs.writeFileSync(path.join(dir, 'textures.json'), JSON.stringify(info, null, 1));
  console.log(info);
} else {
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^t(\d+)\.(png|jpg|jpeg|webp)$/);
    if (!m) continue;
    const t = tex[+m[1]];
    t.setImage(fs.readFileSync(path.join(dir, f)));
    t.setMimeType(m[2] === 'png' ? 'image/png' : m[2] === 'webp' ? 'image/webp' : 'image/jpeg');
    console.log('заменена', f);
  }
  await io.write(out, doc);
}
