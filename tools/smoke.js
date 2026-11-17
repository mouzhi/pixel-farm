// Headless smoke test (used by CI and before every PR):
//   node tools/smoke.js            # serves the repo root on a free port, loads the game, runs a day, checks the picture
// Env: CHROME=/path/to/chrome (default /usr/bin/google-chrome)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const fail = [];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const url of [`${base}/index.html?manual`, `${base}/index.html`, 'file://' + path.join(ROOT, 'index.html')]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } }), errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('requestfailed', r => errs.push('request failed ' + r.url()));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(url); await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 15000 });
    const r = await p.evaluate(manual => {
      const colours = () => { const d = document.getElementById('game').getContext('2d').getImageData(0, 0, 426, 266).data, s = new Set(); for (let i = 0; i < d.length; i += 16) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; };
      if (!manual) return { label: __farm.S.label, colours: colours() };
      const out = { colours: [] }; for (const a of [0.22, 1.8, 3.4, 5.0]) { __farm.setAngle(a); __farm.advance(60, 10); out.colours.push(colours()); }
      out.day = __farm.S.day; out.label = __farm.S.label; return out;
    }, url.includes('manual'));
    if (!url.includes('manual')) await p.waitForTimeout(2000);
    const ok = errs.length === 0 && [].concat(r.colours).every(n => n > 40);
    console.log(ok ? 'ok  ' : 'FAIL', url.replace(base, ''), JSON.stringify(r), errs.length ? errs : '');
    if (!ok) fail.push(url); await p.close();
  }
  await b.close(); server.close(); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
