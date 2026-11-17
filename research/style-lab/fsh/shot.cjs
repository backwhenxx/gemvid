// node shot.cjs shots.json out_prefix [w] [ss] — кадры по списку {cam,p,tod,k,q,t}
const {chromium} = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const [js, pre, w0, ss0] = process.argv.slice(2); const shots = JSON.parse(fs.readFileSync(js)); const W = +(w0 || 540), H = Math.round(W * 16 / 9);
const root = __dirname; const MIME = {'.js': 'text/javascript', '.html': 'text/html'};
const srv = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'}); s.end(d); }); });
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
  const pg = await b.newPage({viewport: {width: W, height: H}});
  pg.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 400)); }); pg.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 600)));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/index.html?w=${W}&ss=${ss0 || 2}&world=${process.env.WORLD || 'teplo'}`);
  await pg.waitForFunction('window.__ready === true', null, {timeout: 180000});
  for (let i = 0; i < shots.length; i++) { const ms = await pg.evaluate((a) => window.__render(a), shots[i]); await pg.screenshot({path: `${pre}${String(i).padStart(3, '0')}.png`}); if (i < 3 || i % 20 === 0) console.log(i, Math.round(ms), 'мс'); }
  await b.close(); srv.close();
})();
