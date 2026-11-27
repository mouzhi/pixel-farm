// Idle frame cap check (v5.12.8): fps while touching / first 8 s / after 8 s idle / after 45 s idle, and the game-time rate (must not change).
//   node tools/idle-cap-test.js      (about 70 s; serves the repo root itself)
const http = require('http'), fs = require('fs'), path = require('path'), { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } }), errs = []; p.on('pageerror', e => errs.push(String(e)));
  // count the frames the game really runs: a wrapped requestAnimationFrame callback that moved the game clock
  await p.addInitScript(() => { const cb = window.requestAnimationFrame.bind(window); window.__gameFrames = 0;
    window.requestAnimationFrame = fn => cb(t => { const s = window.__farm && window.__farm.S, k = s ? s.day * 1440 + s.t : 0; fn(t); if (s && s.day * 1440 + s.t !== k) window.__gameFrames++; }); });
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 30000 });
  const win = async (label, ms, poke) => {
    const r = await p.evaluate(async ([ms, poke]) => { const s = __farm.S, g0 = s.day * 1440 + s.t, f0 = window.__gameFrames, t0 = performance.now();
      const h = poke ? setInterval(() => dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10 })), 400) : 0; await new Promise(r => setTimeout(r, ms)); clearInterval(h);
      const sec = (performance.now() - t0) / 1000; return { simFps: +((window.__gameFrames - f0) / sec).toFixed(1), gameMinPerSec: +((s.day * 1440 + s.t - g0) / sec).toFixed(2) }; }, [ms, poke]);
    console.log(label.padEnd(34), JSON.stringify(r)); return r; };
  const out = {};
  out.first8 = await win('first 8 s after boot (60 at most)', 5000, false);
  await p.waitForTimeout(4000);
  out.idle = await win('idle 9-13 s (want ~20)', 4000, false);
  await p.waitForTimeout(34000);
  out.deep = await win('idle 47-51 s (want ~15)', 4000, false);
  out.touch = await win('pointer moves (60 at most)', 4000, true);
  // headless Chrome often cannot hold 60 fps with the game drawing: judge the idle windows against the touch window
  const ok = out.idle.simFps > 14 && out.idle.simFps < 23 && out.deep.simFps > 10 && out.deep.simFps < 17.5 && out.idle.simFps < 0.75 * out.first8.simFps && out.deep.simFps < out.idle.simFps && out.touch.simFps > 0.8 * out.first8.simFps &&
    Math.abs(out.idle.gameMinPerSec - out.first8.gameMinPerSec) < 0.35 * out.first8.gameMinPerSec && Math.abs(out.deep.gameMinPerSec - out.first8.gameMinPerSec) < 0.35 * out.first8.gameMinPerSec;
  console.log(ok && !errs.length ? 'PASS idle cap: 60 / 20 / 15 fps, game time rate unchanged' : 'FAIL idle cap', errs.slice(0, 3));
  await b.close(); server.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
