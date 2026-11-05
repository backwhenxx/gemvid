// Полная сборка шортса из папки эпизода.
// node scripts/build.mjs episodes/<имя> [--demo-voice] [--whisper small]
//
// 1) копирует эпизод в public/ep/<имя>
// 2) озвучка: voice.mp3 из ElevenLabs (или тестовый голос espeak с --demo-voice)
// 3) faster-whisper → тайминги слов, выравнивание по тексту сценария
// 4) сцены встают на слова, расставляются звуки (Tone.js)
// 5) рендер Remotion → громкость и превью через FFmpeg → out/<имя>/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {makeSfx} from './sfx.mjs';
import {fetchSounds} from './sounds.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const epArg = args.find((a) => !a.startsWith('--'));
if (!epArg) throw new Error('Укажи папку эпизода: node scripts/build.mjs episodes/<имя>');
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};

const FPS = 30;
const epDir = path.resolve(epArg);
const slug = path.basename(epDir);
const ep = JSON.parse(fs.readFileSync(path.join(epDir, 'episode.json'), 'utf8'));
const pubBase = `ep/${slug}`;
const pubDir = path.join(ROOT, 'public', pubBase);
const outDir = path.join(ROOT, 'out', slug);
fs.mkdirSync(outDir, {recursive: true});
fs.rmSync(pubDir, {recursive: true, force: true});
fs.mkdirSync(pubDir, {recursive: true});
fs.cpSync(epDir, pubDir, {recursive: true});

// Общие 3D-модели из assets/models подтягиваем, если их нет в папке эпизода
for (const s of ep.scenes) {
  const m = s.props?.model;
  if (m && !fs.existsSync(path.join(pubDir, m)) && fs.existsSync(path.join(ROOT, 'assets/models', m))) {
    fs.mkdirSync(path.dirname(path.join(pubDir, m)), {recursive: true});
    fs.copyFileSync(path.join(ROOT, 'assets/models', m), path.join(pubDir, m));
  }
}

const log = (...m) => console.log(`[${slug}]`, ...m);

// Стоп-кадры всех сцен без озвучки (быстрая проверка картинки): --stills
if (flag('--stills')) {
  const SD = 3;
  const scenesS = ep.scenes.map((s, i) => ({type: s.type, start: i * SD, end: (i + 1) * SD, say: '', props: s.props ?? {}}));
  const timeline = {fps: 30, durationInFrames: scenesS.length * SD * 30, base: pubBase, voice: null, words: [], scenes: scenesS, sfx: [], music: null,
    accent: ep.accent ?? '#A9BCCB', palette: ep.palette ?? null, captionStyle: ep.captionStyle ?? 'karaoke'};
  const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
  const inputProps = {timeline};
  const comp = await selectComposition({serveUrl, id: 'Short', inputProps, chromiumOptions: {gl: 'swangle'}});
  const dir = path.join(outDir, 'stills');
  fs.mkdirSync(dir, {recursive: true});
  for (let i = 0; i < scenesS.length; i++) {
    const f = Math.round((i * SD + SD * 0.7) * 30);
    await renderStill({composition: comp, serveUrl, inputProps, frame: f, output: path.join(dir, `${String(i + 1).padStart(2, '0')}.jpg`), imageFormat: 'jpeg', jpegQuality: 80, chromiumOptions: {gl: 'swangle'}});
    log(`кадр сцены ${i + 1}`);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-pattern_type', 'glob', '-i', path.join(dir, '*.jpg'), '-vf', 'scale=270:-1,tile=8x3', '-frames:v', '1', '-q:v', '4', path.join(outDir, 'stills.jpg')], {stdio: 'inherit'});
  process.exit(0);
}

// Только обложка, без озвучки и рендера видео: node scripts/build.mjs episodes/<имя> --cover-only
if (flag('--cover-only')) {
  if (!ep.cover) throw new Error('В episode.json нет поля cover');
  // живые звуки и фон из Openverse (CC0 / общественное достояние)
const snd = await fetchSounds(ep, log);
scenes.forEach((s) =>
  (s.props.sounds ?? []).forEach((x) => {
    const g = snd[`sfx:${x.q}`];
    if (g) sfx.push({file: g.file, at: s.start + (x.at ?? 0) * (s.end - s.start), volume: x.volume ?? 0.4});
  }),
);
const ambience = (ep.ambience ?? [])
  .map((a) => {
    const g = snd[`amb:${a.q}`];
    if (!g) return null;
    const from = scenes[Math.min(a.from ?? 0, scenes.length - 1)].start;
    const to = scenes[Math.min(a.to ?? scenes.length - 1, scenes.length - 1)].end;
    return {file: g.file, from, to, volume: a.volume ?? 0.15};
  })
  .filter(Boolean);
fs.writeFileSync(path.join(outDir, 'sounds.json'), JSON.stringify(Object.values(snd), null, 1));

const timeline = {fps: 30, durationInFrames: 30, base: pubBase, voice: null, words: [], scenes: [], sfx: [], music: null, accent: ep.accent ?? '#A9BCCB', palette: ep.palette ?? null};
  const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
  const props = {timeline, cover: ep.cover};
  const comp = await selectComposition({serveUrl, id: 'Cover', inputProps: props, chromiumOptions: {gl: 'swangle'}});
  await renderStill({composition: comp, serveUrl, inputProps: props, output: path.join(outDir, 'cover.png'), chromiumOptions: {gl: 'swangle'}});
  log('обложка → out/' + slug + '/cover.png');
  process.exit(0);
}
const sh = (cmd, a) => execFileSync(cmd, a, {stdio: ['ignore', 'inherit', 'inherit']});

// ---------- текст ----------
const cleanSay = (s = '') => s.replace(/\[[^\]]*\]/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const scenesIn = ep.scenes.map((s) => ({...s, say: cleanSay(s.say)}));
const tokens = []; // {text, scene}
scenesIn.forEach((s, i) => s.say.split(' ').filter(Boolean).forEach((t) => tokens.push({text: t, scene: i})));
const fullText = tokens.map((t) => t.text).join(' ');

// ---------- озвучка ----------
let voiceFile = ep.voice ?? 'voice.mp3';
if (!fs.existsSync(path.join(pubDir, voiceFile))) {
  if (!flag('--demo-voice') && !ep.demoVoice) throw new Error(`Нет озвучки ${voiceFile} в ${epDir}`);
  log('озвучки нет — тестовый голос espeak-ng');
  voiceFile = 'voice.mp3';
  const wav = path.join(pubDir, 'voice.wav');
  sh('espeak-ng', ['-v', 'ru', '-s', '165', '-g', '6', '-w', wav, fullText]);
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ar', '44100', '-b:a', '160k', path.join(pubDir, voiceFile)]);
  fs.rmSync(wav);
}
const voicePath = path.join(pubDir, voiceFile);
const voiceDur = parseFloat(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voicePath]).toString().trim(),
);

// ---------- тайминги слов ----------
const wordsJson = path.join(outDir, 'words.json');
if (!(flag('--reuse-words') && fs.existsSync(wordsJson))) {
  log('faster-whisper: распознаю озвучку…');
  sh('python3', [path.join(ROOT, 'scripts/transcribe.py'), voicePath, wordsJson, '--prompt', fullText, '--model', opt('--whisper', ep.whisper ?? 'small')]);
}
const heard = JSON.parse(fs.readFileSync(wordsJson, 'utf8')).words;

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
const lev = (a, b) => {
  const d = Array.from({length: a.length + 1}, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const sim = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 2;
  return 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.6 ? 1 : 0;
};

// Выравнивание текста сценария и распознанных слов (DP) → у каждого слова сценария есть время
const align = () => {
  const A = tokens.map((t) => norm(t.text));
  const B = heard.map((w) => norm(w.text));
  const n = A.length;
  const m = B.length;
  const S = Array.from({length: n + 1}, () => new Float32Array(m + 1));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) S[i][j] = Math.max(S[i - 1][j], S[i][j - 1], S[i - 1][j - 1] + sim(A[i - 1], B[j - 1]));
  const match = Array(n).fill(-1);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const s = sim(A[i - 1], B[j - 1]);
    if (s > 0 && S[i][j] === S[i - 1][j - 1] + s) {
      match[i - 1] = j - 1;
      i--;
      j--;
    } else if (S[i - 1][j] >= S[i][j - 1]) i--;
    else j--;
  }
  const out = tokens.map((t, i) => (match[i] >= 0 ? {text: t.text, start: heard[match[i]].start, end: heard[match[i]].end} : {text: t.text, start: NaN, end: NaN}));
  // Дыры (числа словами, оговорки) — равномерно между соседями
  for (let i = 0; i < out.length; i++) {
    if (!isNaN(out[i].start)) continue;
    let k = i;
    while (k < out.length && isNaN(out[k].start)) k++;
    // начало фразы, которое распознавание пропустило, растягиваем от начала озвучки
    const t0 = i > 0 ? out[i - 1].end : 0;
    const t1 = k < out.length ? out[k].start : Math.max(t0 + 0.3 * (k - i), heard[heard.length - 1]?.end ?? voiceDur);
    const step = (t1 - t0) / (k - i);
    for (let q = i; q < k; q++) {
      out[q].start = t0 + step * (q - i);
      out[q].end = t0 + step * (q - i + 1);
    }
    i = k - 1;
  }
  const matched = match.filter((x) => x >= 0).length;
  log(`выравнивание: ${matched}/${n} слов совпало`);
  return out;
};
const words = tokens.length && heard.length ? align() : [];

// ---------- сцены ----------
const firstWordTime = scenesIn.map((s, i) => {
  const k = tokens.findIndex((t) => t.scene === i);
  return k >= 0 ? words[k].start : null;
});
const voiceEnd = words.length ? Math.min(voiceDur, words[words.length - 1].end + 0.35) : voiceDur;
const scenes = [];
scenesIn.forEach((s, i) => {
  let start = i === 0 ? 0 : firstWordTime[i] ?? scenes[scenes.length - 1]?.end ?? 0;
  if (i > 0) start = Math.max(start - 0.08, scenes[scenes.length - 1].start + 0.5); // смена чуть раньше слова
  if (scenes.length) scenes[scenes.length - 1].end = start;
  scenes.push({type: s.type, start, end: voiceEnd, say: s.say, props: s.props ?? {}});
});
const last = scenes[scenes.length - 1];
if (last.type === 'outro') last.end = Math.max(last.end, last.start + 2.2);
else if (ep.autoOutro !== false) scenes.push({type: 'outro', start: voiceEnd, end: voiceEnd + 2.0, say: '', props: {}});
else last.end = voiceEnd + (ep.tail ?? 1.2);
const total = scenes[scenes.length - 1].end;

// ---------- звуки ----------
await makeSfx();
const sfx = [{file: 'sfx/tuk.wav', at: 0.05, volume: 0.5}];
scenes.forEach((s, i) => {
  if (i === 0) return;
  if (s.type === 'outro') {
    sfx.push({file: 'sfx/riser.wav', at: Math.max(0, s.start - 1.55), volume: 0.18}, {file: 'sfx/tuk.wav', at: s.start, volume: 0.5});
    return;
  }
  if (!s.props.cont) sfx.push({file: 'sfx/whoosh.wav', at: Math.max(0, s.start - 0.15), volume: 0.22});
  if (s.type === 'slam' || s.props.slam) sfx.push({file: 'sfx/tuk.wav', at: s.start + 0.05, volume: 0.45});
  if (s.type === 'gauge') sfx.push({file: 'sfx/tuk.wav', at: s.start + 0.1, volume: 0.3});
  if (s.type === 'number') sfx.push({file: 'sfx/ding.wav', at: s.start + Math.min((s.end - s.start) * 0.55, 1.4), volume: 0.3});
  if (s.type === 'physics2d' || s.type === 'physics3d') sfx.push({file: 'sfx/pop.wav', at: s.start + 0.6, volume: 0.25});
  (s.props.sfx ?? []).forEach((c) => sfx.push({file: `sfx/${c.file}.wav`, at: s.start + c.at * (s.end - s.start), volume: c.volume ?? 0.35}));
});

const timeline = {
  fps: FPS,
  durationInFrames: Math.ceil(total * FPS),
  base: pubBase,
  voice: voiceFile,
  words,
  scenes,
  sfx,
  music: ep.music === false ? null : {file: 'music/pad.wav', volume: ep.musicVolume ?? 0.1},
  accent: ep.accent ?? '#FF3D8B',
  keys: ep.keys ?? [],
  palette: ep.palette ?? null,
  ambience,
  captionStyle: ep.captionStyle ?? 'karaoke',
  brand: ep.brand !== false,
};
fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 1));
log(`сцен: ${scenes.length}, длительность ${total.toFixed(1)} с`);
if (total < 45) log(`⚠ ролик короче 45 с (${total.toFixed(1)} с)`);

// ---------- рендер ----------
log('сборка Remotion…');
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
const inputProps = {timeline};
const composition = await selectComposition({serveUrl, id: 'Short', inputProps, chromiumOptions: {gl: 'swangle'}});
const raw = path.join(ROOT, '.render', `${slug}.mp4`);
fs.mkdirSync(path.dirname(raw), {recursive: true});
let lastPct = -10;
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  crf: 18,
  x264Preset: 'veryfast',
  outputLocation: raw,
  inputProps,
  chromiumOptions: {gl: 'swangle'},
  concurrency: Math.max(1, os.cpus().length),
  timeoutInMilliseconds: 180000,
  onProgress: ({progress}) => {
    const p = Math.floor(progress * 100);
    if (p >= lastPct + 10) {
      lastPct = p;
      log(`рендер ${p}%`);
    }
  },
});

// ---------- обложка ----------
if (ep.cover) {
  const coverProps = {timeline, cover: ep.cover};
  const coverComp = await selectComposition({serveUrl, id: 'Cover', inputProps: coverProps, chromiumOptions: {gl: 'swangle'}});
  await renderStill({composition: coverComp, serveUrl, inputProps: coverProps, output: path.join(outDir, 'cover.png'), chromiumOptions: {gl: 'swangle'}});
  log('обложка → out/' + slug + '/cover.png');
}

// ---------- финал: громкость под YouTube (-14 LUFS) и превью ----------
const final = path.join(outDir, `${slug}.mp4`);
sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', final]);
sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', final, '-vf', `fps=${(12 / total).toFixed(4)},scale=270:-1,tile=6x2`, '-frames:v', '1', '-q:v', '4', path.join(outDir, 'preview.jpg')]);
log('готово →', path.relative(ROOT, final));
