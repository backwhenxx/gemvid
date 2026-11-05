// Живые звуки и эмбиент из Openverse (без аккаунта): только CC0 и общественное достояние.
// Описание в episode.json:
//   "ambience": [{"q": "river water", "from": 0, "to": 5, "volume": 0.18}]   — фон на сцены from..to (вкл.)
//   сцена.props.sounds: [{"q": "splash", "at": 0.3, "volume": 0.4, "len": 2}] — разовый звук внутри сцены
// Файлы → public/snd/*.wav (кэш между запусками), список с авторами → out/<эпизод>/sounds.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SND = path.join(ROOT, 'public', 'snd');
const API = 'https://api.openverse.org/v1/audio/';
const UA = 'gemvid-shorts/1.0 (+https://github.com/backwhenxx/gemvid)';

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

const search = async (q, {minDur, maxDur}) => {
  const url = `${API}?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=20`;
  const r = await fetch(url, {headers: {'User-Agent': UA}});
  if (!r.ok) throw new Error(`Openverse ${r.status} на «${q}»`);
  const j = await r.json();
  const ok = (j.results ?? []).filter((x) => {
    const d = (x.duration ?? 0) / 1000;
    return x.url && (!d || (d >= minDur && d <= maxDur)) && ['cc0', 'pdm'].includes(String(x.license).toLowerCase());
  });
  return ok;
};

const download = async (item, out, {len, ambient}) => {
  const tmp = out + '.src';
  const r = await fetch(item.url, {headers: {'User-Agent': UA}, redirect: 'follow'});
  if (!r.ok) throw new Error(`скачивание ${r.status}`);
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  // в wav 44.1 кГц стерео; разовые звуки — обрезка и мягкий хвост; фон — ровная громкость
  const af = ambient ? 'loudnorm=I=-23:TP=-3,afade=t=in:d=0.5' : `atrim=0:${len},afade=t=out:st=${Math.max(0, len - 0.3)}:d=0.3,loudnorm=I=-18:TP=-2`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '2', '-ar', '44100', '-af', af, ...(ambient ? ['-t', '120'] : []), out]);
  fs.rmSync(tmp);
};

// Возвращает {key → {file, title, creator, license, landing}}
export const fetchSounds = async (ep, log = console.log) => {
  fs.mkdirSync(SND, {recursive: true});
  const wants = [];
  (ep.ambience ?? []).forEach((a) => wants.push({q: a.q, ambient: true, len: 120}));
  ep.scenes.forEach((s) => (s.props?.sounds ?? []).forEach((x) => wants.push({q: x.q, ambient: false, len: x.len ?? 2.5})));
  const got = {};
  for (const w of wants) {
    const key = `${w.ambient ? 'amb' : 'sfx'}:${w.q}`;
    if (got[key]) continue;
    const file = `snd/${w.ambient ? 'amb' : 'sfx'}_${hash(w.q)}.wav`;
    const meta = path.join(SND, path.basename(file) + '.json');
    if (fs.existsSync(path.join(ROOT, 'public', file)) && fs.existsSync(meta)) {
      got[key] = JSON.parse(fs.readFileSync(meta, 'utf8'));
      continue;
    }
    try {
      const list = await search(w.q, w.ambient ? {minDur: 15, maxDur: 900} : {minDur: 0.2, maxDur: 30});
      let done = null;
      for (const item of list.slice(0, 5)) {
        try {
          await download(item, path.join(ROOT, 'public', file), w);
          done = {file, q: w.q, title: item.title, creator: item.creator, license: item.license, source: item.source, landing: item.foreign_landing_url};
          break;
        } catch (e) {
          log(`  пропуск «${item.title}»: ${e.message}`);
        }
      }
      if (!done) {
        log(`звук «${w.q}»: ничего подходящего (CC0/PD) — пропускаю`);
        continue;
      }
      fs.writeFileSync(meta, JSON.stringify(done, null, 1));
      got[key] = done;
      log(`звук «${w.q}» → ${done.title} (${done.license}, ${done.source})`);
    } catch (e) {
      log(`звук «${w.q}»: ${e.message} — пропускаю`);
    }
  }
  return got;
};

// Самостоятельный запуск: node scripts/sounds.mjs episodes/<имя> — только скачать и показать
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = path.resolve(process.argv[2]);
  const ep = JSON.parse(fs.readFileSync(path.join(dir, 'episode.json'), 'utf8'));
  const got = await fetchSounds(ep);
  const out = path.join(ROOT, 'out', path.basename(dir));
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'sounds.json'), JSON.stringify(Object.values(got), null, 1));
  console.log(`найдено ${Object.keys(got).length} звуков → out/${path.basename(dir)}/sounds.json`);
}
