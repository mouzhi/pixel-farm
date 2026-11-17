// Capture pathfinding debug overlays: node tools/path-shots.js
// Writes /workspace/pf-shots/path_*.png (override with PF_SHOTS).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
function png(dataUrl) { return Buffer.from(dataUrl.split(',')[1], 'base64'); }

const SHOTS = [
  { name: 'house', label: '绕过房子', from: 'west', to: 'barn', cam: [70, 36], angle: 0.22 },
  { name: 'pond', label: '绕过池塘', from: 'fish', to: 'door', cam: [40, 88], angle: 0.22 },
  { name: 'fence', label: '绕过栅栏', from: 'westfence', to: 'field', cam: [20, 80], angle: 0.18 },
  { name: 'home', label: '三条路一起看', all: true, cam: [80, 64], angle: 0.22 }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${base}/index.html?manual=1&path=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__farm && __farm.spritesReady && __farm.spritesReady() && window.PFPath, null, { timeout: 20000 });

  const routes = await page.evaluate(() => {
    const f = __farm, L = PFPath.LAYOUT, spots = {
      west: { x: 10, y: 24 }, barn: L.BARN_DOOR, fish: L.POND_STAND, door: L.DOOR,
      westfence: { x: -16, y: 80 }, field: { x: 90, y: 70 }, well: L.WELL_SPOT
    };
    const pack = (a, b, color) => {
      const r = f.pathTo(spots[a], spots[b]);
      const hits = PFPath.blockedAlong(f.pathGrid(), r.points, 0.5);
      return { name: a + '→' + b, points: r.points, reached: r.reached, length: r.length, hits: hits.length, color,
        straight: [spots[a], spots[b]] };
    };
    return {
      house: pack('west', 'barn', '#ffe566'),
      pond: pack('fish', 'door', '#7ec8ff'),
      fence: pack('westfence', 'field', '#b6f27a'),
      spots
    };
  });
  for (const k of ['house', 'pond', 'fence']) {
    const r = routes[k];
    console.log(k, 'reached', r.reached, 'len', Math.round(r.length), 'pts', r.points.length, 'hits', r.hits);
    if (r.hits) errs.push(k + ' path entered blocked tiles');
    if (!r.reached) errs.push(k + ' path did not reach the goal');
  }

  await page.evaluate(r => { window.__pathShots = r; }, routes);
  const crops = [];
  for (const sh of SHOTS) {
    const info = await page.evaluate(sh => {
      const f = __farm, S = f.S, F = f.F;
      S.t = 10 * 60 + 20; F.home = false; F.sleeping = false; F.moving = false;
      let list;
      if (sh.all) list = ['house', 'pond', 'fence'].map(n => ({ points: window.__pathShots[n].points, color: window.__pathShots[n].color }));
      else {
        const src = window.__pathShots[sh.name];
        list = [{ points: src.points, color: src.color }, { points: src.straight, color: 'rgba(255,80,80,0.85)' }];
      }
      f.setPathDebug(list);
      f.setAngle(sh.angle); f.panTo(sh.cam[0], sh.cam[1]); f.setRealT(0.4); f.render();
      return { data: document.getElementById('game').toDataURL() };
    }, sh);
    const file = path.join(OUT, 'path_' + sh.name + '.png');
    fs.writeFileSync(file, png(info.data));
    crops.push({ name: sh.name, label: sh.label, data: info.data });
    console.log('wrote', file);
  }

  const strip = await page.evaluate(async crops => {
    const W = 200, H = 140, SCALE = 2, PAD = 8, LABEL = 18;
    const strip = document.createElement('canvas');
    strip.width = crops.length * (W * SCALE + PAD) + PAD;
    strip.height = H * SCALE + PAD * 2 + LABEL;
    const g = strip.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#1c1626'; g.fillRect(0, 0, strip.width, strip.height);
    g.textBaseline = 'top'; g.font = '13px sans-serif';
    const out = {};
    for (let i = 0; i < crops.length; i++) {
      const c = crops[i], img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = c.data; });
      const sx = Math.max(0, Math.floor((img.width - W) / 2)), sy = Math.max(0, Math.floor((img.height - H) / 2) - 8);
      const close = document.createElement('canvas'); close.width = W * SCALE; close.height = H * SCALE;
      const cg = close.getContext('2d'); cg.imageSmoothingEnabled = false;
      cg.drawImage(img, sx, sy, W, H, 0, 0, W * SCALE, H * SCALE);
      out[c.name] = close.toDataURL();
      const dx = PAD + i * (W * SCALE + PAD);
      g.drawImage(close, dx, PAD + LABEL);
      g.fillStyle = '#f6ecd0'; g.fillText(c.label, dx + 8, 6);
    }
    out.strip = strip.toDataURL();
    return out;
  }, crops);
  for (const [k, url] of Object.entries(strip)) {
    const name = k === 'strip' ? 'path_strip.png' : 'path_' + k + '_close.png';
    fs.writeFileSync(path.join(OUT, name), png(url));
  }
  console.log('ERR', errs);
  if (errs.length) process.exitCode = 1;
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
