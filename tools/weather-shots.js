// Screenshots of v5.4.3: light rain (ripples, wet path), butterflies, and the 图鉴 昆虫 page.
// node tools/weather-shots.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const DOCS = path.join(ROOT, 'docs', 'img');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
function save(name, buf) {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), buf);
  fs.writeFileSync(path.join(DOCS, name), buf);
}
async function cropAround(p, wx, wy, W, H, K) {
  return p.evaluate(async ({ wx, wy, W, H, K }) => {
    const f = __farm; f.panTo(wx, wy); f.render();
    const [sx, sy] = f.proj(wx, wy), cv = document.getElementById('game');
    const data = cv.toDataURL(), c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = data; });
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.max(0, Math.round(sx) - W / 2), Math.max(0, Math.round(sy) - H * 0.55), W, H, 0, 0, W * K, H * K);
    return c.toDataURL();
  }, { wx, wy, W, H, K });
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const prep = await p.evaluate(() => {
    const f = __farm, S = f.S, CX = f.BOOK || window.PFCodex, INS = window.PFInsects;
    f.SAVE.off = true;
    S.t = Math.floor(S.t / 1440) * 1440 + 11 * 60;
    f.FARMER.home = false; f.FARMER.sleeping = false;
    S.coins = Math.max(S.coins, 5000);
    f.buy('bugnet');
    for (const t of f.tiles) if (t.open && !t.crop) { t.tilled = true; t.crop = { type: 'carrot', age: 1, n: 0, stage: 1, rot: 0.2 }; }
    // record a mixed insect book, leave two silhouettes
    ['white', 'yellow', 'dragon', 'damsel', 'firefly', 'swallow'].forEach((id, i) => CX.record(S.codex, CX.keyBug(id), 6 + i, 1 + (i % 3)));
    f.noteProgress({ caughtBug: true });
    f.setAngle(0.15); f.setRealT(3.2);
    return { day: S.day, net: S.bugNet, entries: Object.keys(S.codex.entries).filter(k => k.indexOf('bug:') === 0), ver: f.version };
  });
  console.log('prep', prep);

  // --- butterflies on a sunny morning ---
  await p.evaluate(() => {
    const f = __farm, S = f.S, INS = window.PFInsects;
    S.weather = (f.WX || window.PFWeather).emptyWeather();
    S.weather.nextDay = S.day + 8;
    if (INS) { INS.reset(); INS.tick(0, { day: S.day, raining: false, night: false, summer: false, butterflies: 5, dragonflies: 3, pond: f.POND }); }
    f.panTo(70, 80); f.render();
  });
  await p.evaluate(() => { const f = __farm; for (let i = 0; i < 40; i++) f.advance(0.05, 20); f.render(); });
  await p.screenshot({ path: path.join(OUT, 'v543_butterflies.png') });
  const but = await cropAround(p, 70, 80, 360, 220, 3);
  if (but) save('v543_butterflies_close.png', Buffer.from(but.split(',')[1], 'base64'));
  fs.copyFileSync(path.join(OUT, 'v543_butterflies.png'), path.join(DOCS, 'v543_butterflies.png'));

  // --- rain: wet path, ripples, streaks ---
  const rainState = await p.evaluate(() => {
    const f = __farm, S = f.S, WX = f.WX || window.PFWeather, INS = window.PFInsects;
    if (INS) INS.reset();
    f.forceRain(11 * 60, 3 * 60);
    S.t = Math.floor(S.t / 1440) * 1440 + 11 * 60 + 20;
    if (WX) { WX.resetVisual(); for (let i = 0; i < 40; i++) WX.tickVisual(0.05, { raining: true, wetness: 1, pond: f.POND, W: 1280, H: 800, pathSegs: null }); }
    f.panTo(80, 70);
    for (let i = 0; i < 30; i++) f.advance(0.05, 20);
    if (f.setRealT) f.setRealT(2.2);
    f.render();
    const v = WX && WX._visual;
    return { raining: WX.isRaining(S.weather, S.day, S.t), wet: WX.wetness(S.weather, S.day, S.t), watered: f.tiles.filter(t => t.crop && t.watered).length, streaks: v && v.streaks.length, ripples: v && v.ripples.length, puddles: v && v.puddles.length };
  });
  console.log('rain', rainState);
  await p.screenshot({ path: path.join(OUT, 'v543_rain.png') });
  fs.copyFileSync(path.join(OUT, 'v543_rain.png'), path.join(DOCS, 'v543_rain.png'));
  const pond = await cropAround(p, 34, 100, 320, 200, 3);
  if (pond) save('v543_rain_pond.png', Buffer.from(pond.split(',')[1], 'base64'));
  const pathShot = await cropAround(p, 68, 54, 340, 200, 3);
  if (pathShot) save('v543_rain_path.png', Buffer.from(pathShot.split(',')[1], 'base64'));

  // --- insect codex page ---
  await p.evaluate(() => {
    const f = __farm;
    const b = document.getElementById('codexBtn'); if (b) b.click();
    const el = document.getElementById('codex');
    const sec = el && [...el.querySelectorAll('.sec')].find(s => s.textContent.indexOf('昆虫') >= 0);
    if (sec) sec.scrollIntoView({ block: 'start' });
    f.render();
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, 'v543_codex_bugs.png') });
  const panel = await p.evaluate(() => {
    const el = document.getElementById('codex'); if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    const sec = [...el.querySelectorAll('.sec')].find(s => s.textContent.indexOf('昆虫') >= 0);
    const sr = sec ? sec.getBoundingClientRect() : r;
    const all = [...el.querySelectorAll('.sec')];
    const i = all.indexOf(sec);
    const next = all[i + 1];
    const top = Math.max(r.y, sr.y - 8);
    const bottom = next ? next.getBoundingClientRect().top : r.bottom;
    return { x: r.x, y: top, width: r.width, height: Math.max(40, Math.min(r.bottom, bottom + 4) - top) };
  });
  if (panel) {
    const buf = await p.screenshot({ clip: panel });
    save('v543_codex_bugs_panel.png', buf);
  }
  fs.copyFileSync(path.join(OUT, 'v543_codex_bugs.png'), path.join(DOCS, 'v543_codex_bugs.png'));

  // --- brief frame cost: rain off vs on, 3s each ---
  const cost = await p.evaluate(async () => {
    const f = __farm, WX = f.WX || window.PFWeather;
    function sample(n) {
      const times = [];
      for (let i = 0; i < n; i++) {
        if (WX) WX.tickVisual(1/60, { raining: !!(WX.isRaining(f.S.weather, f.S.day, f.S.t)), wetness: WX.wetness(f.S.weather, f.S.day, f.S.t), pond: f.POND, W: 1280, H: 800 });
        const t0 = performance.now(); f.render(); times.push(performance.now() - t0);
      }
      return times;
    }
    const S = f.S;
    S.weather = WX.emptyWeather(); S.weather.nextDay = S.day + 8;
    if (WX.resetVisual) WX.resetVisual();
    f.render();
    const off = sample(120);
    f.forceRain(Math.floor(S.t % 1440) - 5, 3 * 60);
    if (WX.resetVisual) WX.resetVisual();
    for (let i = 0; i < 30; i++) WX.tickVisual(0.05, { raining: true, wetness: 1, pond: f.POND, W: 1280, H: 800 });
    f.render();
    const on = sample(120);
    const stat = a => { const b = a.slice().sort((x, y) => x - y), avg = a.reduce((s, x) => s + x, 0) / a.length; return { n: a.length, avg: +avg.toFixed(3), p95: +b[Math.floor(b.length * 0.95)].toFixed(3), min: +b[0].toFixed(3), max: +b[b.length-1].toFixed(3) }; };
    return { off: stat(off), on: stat(on), delta: +(stat(on).avg - stat(off).avg).toFixed(3) };
  });
  console.log('frame-cost ms/frame', JSON.stringify(cost));
  fs.writeFileSync(path.join(OUT, 'v543_rain_frame_cost.json'), JSON.stringify(cost, null, 2));

  console.log('errors', errs);
  if (errs.length) { await b.close(); process.exit(1); }
  await b.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
