// Звуки и музыкальная подложка, синтезированные Tone.js (в headless Chrome, офлайн).
// node scripts/sfx.mjs  → public/sfx/*.wav, public/music/pad.wav
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const findChrome = () => {
  const c = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const p = c.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error('Не найден Chrome: задай CHROME_PATH');
  return p;
};

const toneFile = () => {
  for (const id of ['tone/build/Tone.js', 'tone']) {
    try {
      const p = require.resolve(id);
      if (p.endsWith('Tone.js')) return p;
    } catch {}
  }
  return path.join(ROOT, 'node_modules/tone/build/Tone.js');
};

// Описания звуков выполняются внутри страницы (там есть Web Audio)
const SOUNDS = {
  'sfx/whoosh.wav': [0.7, `
    const f = new Tone.Filter({type:'bandpass', frequency:300, Q:1.4});
    const env = new Tone.AmplitudeEnvelope({attack:0.22, decay:0.18, sustain:0, release:0.2});
    new Tone.Noise('pink').start(0).connect(f); f.connect(env); env.toDestination();
    f.frequency.setValueAtTime(250, 0); f.frequency.exponentialRampToValueAtTime(5000, 0.42);
    env.triggerAttackRelease(0.3, 0);`],
  'sfx/hit.wav': [1.6, `
    const rev = new Tone.Freeverb({roomSize:0.7, dampening:3000, wet:0.25}).toDestination();
    new Tone.MembraneSynth({pitchDecay:0.08, octaves:6, envelope:{attack:0.001, decay:0.9, sustain:0, release:0.4}}).connect(rev).triggerAttackRelease('C1', 0.6, 0);
    const lp = new Tone.Filter(1800, 'lowpass').connect(rev);
    const ne = new Tone.AmplitudeEnvelope({attack:0.001, decay:0.25, sustain:0, release:0.1}).connect(lp);
    new Tone.Noise('white').start(0).connect(ne); ne.triggerAttackRelease(0.05, 0);`],
  'sfx/riser.wav': [1.7, `
    const g = new Tone.Gain(0).toDestination();
    const hp = new Tone.Filter(200, 'highpass').connect(g);
    new Tone.Noise('white').start(0).connect(hp);
    const o = new Tone.Oscillator(110, 'sawtooth').start(0); const og = new Tone.Gain(0.12).connect(g); o.connect(og);
    hp.frequency.setValueAtTime(200, 0); hp.frequency.exponentialRampToValueAtTime(7000, 1.55);
    o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(880, 1.55);
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, 1.5); g.gain.linearRampToValueAtTime(0, 1.6);`],
  'sfx/ding.wav': [1.4, `
    const rev = new Tone.Freeverb({roomSize:0.8, wet:0.3}).toDestination();
    const s = new Tone.PolySynth(Tone.Synth, {oscillator:{type:'sine'}, envelope:{attack:0.002, decay:0.9, sustain:0, release:0.4}}).connect(rev);
    s.triggerAttackRelease(['C6','G6'], 0.5, 0); s.triggerAttackRelease(['E6'], 0.4, 0.06);`],
  'sfx/tuk.wav': [0.5, `
    const lp = new Tone.Filter(900, 'lowpass').toDestination();
    new Tone.MembraneSynth({pitchDecay:0.02, octaves:1.5, envelope:{attack:0.001, decay:0.22, sustain:0, release:0.1}}).connect(lp).triggerAttackRelease(290, 0.1, 0);
    const ne = new Tone.AmplitudeEnvelope({attack:0.001, decay:0.06, sustain:0, release:0.05}).connect(lp);
    new Tone.Noise('brown').start(0).connect(ne); ne.triggerAttackRelease(0.03, 0);`],
  'sfx/pop.wav': [0.4, `
    new Tone.Synth({oscillator:{type:'triangle'}, envelope:{attack:0.001, decay:0.12, sustain:0, release:0.05}}).toDestination().triggerAttackRelease('A5', 0.05, 0);`],
  'music/pad.wav': [16, `
    const rev = new Tone.Freeverb({roomSize:0.85, dampening:2500, wet:0.45}).toDestination();
    const lp = new Tone.Filter(1100, 'lowpass').connect(rev);
    const pad = new Tone.PolySynth(Tone.Synth, {oscillator:{type:'fatsawtooth', count:3, spread:20}, envelope:{attack:1.2, decay:0.5, sustain:0.7, release:1.5}, volume:-18}).connect(lp);
    const bass = new Tone.MonoSynth({oscillator:{type:'sine'}, envelope:{attack:0.02, decay:0.3, sustain:0.6, release:0.4}, volume:-10}).connect(rev);
    const tick = new Tone.MetalSynth({envelope:{attack:0.001, decay:0.05, release:0.01}, volume:-34}).connect(rev);
    const chords = [['A3','C4','E4'], ['F3','A3','C4'], ['C3','E3','G3','C4'], ['G3','B3','D4']];
    const roots = ['A1','F1','C2','G1'];
    chords.forEach((c, i) => { pad.triggerAttackRelease(c, 3.6, i * 4); for (let b = 0; b < 4; b++) bass.triggerAttackRelease(roots[i], 0.5, i * 4 + b); });
    for (let k = 0; k < 32; k++) tick.triggerAttackRelease('C6', 0.03, k * 0.5 + 0.25);`],
};

const PAGE = `
function wav(ab){
  const ch = ab.numberOfChannels, sr = ab.sampleRate, n = ab.length;
  const buf = new ArrayBuffer(44 + n * ch * 2); const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0,'RIFF'); v.setUint32(4, 36 + n*ch*2, true); w(8,'WAVE'); w(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,ch,true); v.setUint32(24,sr,true);
  v.setUint32(28,sr*ch*2,true); v.setUint16(32,ch*2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*ch*2,true);
  const data = [...Array(ch)].map((_, c) => ab.getChannelData(c));
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s*0x8000 : s*0x7fff, true); o += 2; }
  let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
window.renderSound = async (dur, code) => {
  const fn = new Function('Tone', code);
  const b = await Tone.Offline(() => fn(Tone), dur, 2, 44100);
  return wav(b.get());
};`;

export const makeSfx = async ({force = false} = {}) => {
  const outDir = path.join(ROOT, 'public');
  const todo = Object.entries(SOUNDS).filter(([f]) => force || !fs.existsSync(path.join(outDir, f)));
  if (!todo.length) return;
  const browser = await puppeteer.launch({executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']});
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({path: toneFile()});
    await page.addScriptTag({content: PAGE});
    for (const [file, [dur, code]] of todo) {
      const b64 = await page.evaluate((d, c) => window.renderSound(d, c), dur, code);
      const out = path.join(outDir, file);
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(out, Buffer.from(b64, 'base64'));
      console.log('звук:', file);
    }
  } finally {
    await browser.close();
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  makeSfx({force: process.argv.includes('--force')}).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
