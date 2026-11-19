// Night-lighting bench (v5.9.1): node tools/night-bench.js [save.json | dump.txt with ===SAVE===] [out.png]
//   loads the save (default: the day-59 fixture), frames the home yard at 21:00 and times render(): camera still (the light layer is
//   cached) and camera panning (rebuilt every frame), plus noon for comparison. Prints JSON; exits 1 on a page or console error.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
function readSave(f) { const txt = fs.readFileSync(f, 'utf8'), a = txt.indexOf('===SAVE==='); let s = a >= 0 ? txt.slice(a + 10, txt.indexOf('===LOG===') > a ? txt.indexOf('===LOG===') : undefined) : txt; s = JSON.parse(s.trim()); return s.save || s; }
const file = process.argv[2] || path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), out = process.argv[3] || null;
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = []; const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 60000 });
  await p.goto(base + '/index.html?manual'); await ready();
  await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, readSave(file));
  await p.reload(); await ready();
  const r = await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const time = (n, step) => { for (let i = 0; i < 5; i++) f.render(); const t0 = performance.now(); for (let i = 0; i < n; i++) { if (step) step(i); f.render(); } return +((performance.now() - t0) / n).toFixed(1); };
    at(21 * 60); f.advance(0.5, 10); f.setAngle(0); f.panTo(96, 70); f.advance(0.2, 10);
    const lamps = window.PFDecorArt && PFDecorArt.lamps ? PFDecorArt.lamps().length : null;
    const still = time(40), pan = time(40, i => f.panTo(96 + (i % 2 ? 1.3 : -1.3), 70)); f.panTo(96, 70);
    const rotate = time(20, i => f.setAngle(i * 0.05)); f.setAngle(0); f.panTo(96, 70);
    at(12 * 60); f.advance(0.2, 10); const noon = time(40); at(21 * 60); f.advance(0.2, 10); f.panTo(96, 70); f.render();
    return { v: f.version, sv: f.snapshot().saveVersion, day: S.day, lamps, nightStillMs: still, nightPanMs: pan, nightRotateMs: rotate, noonMs: noon }; });
  if (out) { await p.waitForTimeout(300); await p.screenshot({ path: out }); }
  console.log(JSON.stringify({ file: path.basename(file), ...r, errs }, null, 1)); await b.close(); server.close(); process.exit(errs.length ? 1 : 0); })();
