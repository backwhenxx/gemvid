// node render.cjs still <style[,style]> [w=1080] [ss=1] [t=0]   |   node render.cjs clip <style> [w=720] [T=4] [fps=24]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const [mode, styles, a3, a4, a5] = process.argv.slice(2);
const root = __dirname; const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  for (const st of styles.split(',')) {
    const w = +(a3 || (mode === 'clip' ? 720 : 1080)), h = Math.round(w * 16 / 9);
    const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [' + m.type() + ']', m.text().slice(0, 600)); });
    page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 600)));
    const ss = mode === 'still' ? +(a4 || 1) : 1;
    await page.goto(`http://127.0.0.1:${port}/index.html?style=${st}&w=${w}&ss=${ss}`);
    try { await page.waitForFunction('window.__ready === true', null, { timeout: 120000 }); } catch (e) { console.log(st, 'не загрузился'); await page.close(); continue; }
    fs.mkdirSync(path.join(root, 'out'), { recursive: true });
    if (mode === 'bench') { const r = []; for (let i = 0; i < 4; i++) r.push(Math.round(await page.evaluate(`window.__render(${i / 24}, 4)`))); console.log(st, 'мс по кадрам:', r.join(', ')); await page.close(); continue; }
    if (mode === 'still') {
      const t = +(a5 || 0); const ms = await page.evaluate(`window.__render(${t}, 4)`);
      await page.screenshot({ path: path.join(root, 'out', `${st}.png`), clip: { x: 0, y: 0, width: w, height: h } });
      console.log(st, 'кадр', Math.round(ms), 'мс');
    } else {
      const T = +(a4 || 4), fps = +(a5 || 24), dir = path.join(root, 'out', 'f_' + st); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      let sum = 0; const n = Math.round(T * fps);
      for (let i = 0; i < n; i++) { sum += await page.evaluate(`window.__render(${i / fps}, ${T})`); await page.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png'), clip: { x: 0, y: 0, width: w, height: h } }); }
      console.log(st, 'клип', n, 'кадров, в среднем', Math.round(sum / n), 'мс/кадр');
    }
    await page.close();
  }
  await b.close(); srv.close();
})();
