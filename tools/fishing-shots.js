// Capture fishing animation frames: node tools/fishing-shots.js
// Writes /workspace/pf-shots/fishing_*.png (override with PF_SHOTS).
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
const FRAMES = [
  { name: 'cast', phase: 'cast', u: 0.55, t: 0.4, rare: false, label: '抛竿' },
  { name: 'wait', phase: 'wait', u: 1, t: 0.71, rare: false, label: '等待' },
  { name: 'bite', phase: 'bite', u: 0.6, t: 0.14, rare: true, label: '咬钩' },
  { name: 'reel', phase: 'reel', u: 0.42, t: 1.1, rare: true, label: '收线' },
  { name: 'show', phase: 'show', u: 0.35, t: 1.6, rare: true, label: '收鱼' },
];
function png(dataUrl) { return Buffer.from(dataUrl.split(',')[1], 'base64'); }
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${base}/index.html?manual=1`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__farm && __farm.spritesReady && __farm.spritesReady() && window.PFFish, null, { timeout: 20000 });
  const crops = [];
  for (const fr of FRAMES) {
    const info = await p.evaluate(fr => {
      const f = __farm, F = f.F, S = f.S, FS = PFFish, spot = FS.POND_SPOT;
      S.t = 10 * 60 + 20; S.day = 2; F.home = false; F.sleeping = false; F.moving = false;
      F.x = spot.stand.x; F.y = spot.stand.y;
      const dx = spot.hook.x - F.x, dy = spot.hook.y - F.y, L = Math.hypot(dx, dy) || 1;
      F.fx = dx / L; F.fy = dy / L;
      const wait = 40, work = (
        fr.phase === 'cast' ? FS.CAST * fr.u :
        fr.phase === 'wait' ? FS.CAST + wait * 0.4 :
        fr.phase === 'bite' ? FS.CAST + wait + FS.BITE * fr.u :
        fr.phase === 'reel' ? FS.CAST + wait + FS.BITE + FS.REEL * fr.u :
        FS.CAST + wait + FS.BITE + FS.REEL + FS.SHOW * fr.u
      );
      F.task = { kind: 'fish', label: fr.label, to: spot.stand, tile: spot.hook, hook: spot.hook, water: 'pond',
        phase: fr.phase, wait, dur: 200, work, rest: fr.phase === 'cast' || fr.phase === 'wait',
        pose: (fr.phase === 'bite' || fr.phase === 'reel') ? 'pull' : null,
        result: fr.phase === 'cast' || fr.phase === 'wait' ? null
          : fr.rare ? { miss: false, fish: 'koi', name: '锦鲤', gold: 36, col: '#e06a2c', rare: 1, water: 'pond' }
          : { miss: false, fish: 'crucian', name: '鲫鱼', gold: 5, col: '#9a9ea0', water: 'pond' } };
      f.setAngle(0.22); f.panTo(spot.stand.x - 4, spot.stand.y + 2); f.setRealT(fr.t); f.render();
      const [sx, sy] = f.proj(F.x, F.y), [hx, hy] = f.proj(spot.hook.x, spot.hook.y);
      const cv = document.getElementById('game');
      return { sx, sy, hx, hy, phase: F.task.phase, data: cv.toDataURL(), w: cv.width, h: cv.height };
    }, fr);
    const full = path.join(OUT, 'fishing_' + fr.name + '.png');
    fs.writeFileSync(full, png(info.data));
    crops.push({ name: fr.name, label: fr.label, info, buf: png(info.data) });
    console.log(fr.name, 'feet', Math.round(info.sx), Math.round(info.sy), 'hook', Math.round(info.hx), Math.round(info.hy));
  }
  // close-ups and a labeled strip, via a page that scales nearest-neighbour
  const strip = await p.evaluate(async crops => {
    const W = 130, H = 110, SCALE = 3, PAD = 8, LABEL = 16;
    const strip = document.createElement('canvas');
    strip.width = crops.length * (W * SCALE + PAD) + PAD;
    strip.height = H * SCALE + PAD * 2 + LABEL;
    const g = strip.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#1c1626'; g.fillRect(0, 0, strip.width, strip.height);
    g.fillStyle = '#f6ecd0'; g.font = '12px monospace'; g.textBaseline = 'top';
    const out = {};
    for (let i = 0; i < crops.length; i++) {
      const c = crops[i], img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = c.data; });
      const cx = Math.round(c.sx), cy = Math.round(c.sy);
      const sx = Math.max(0, Math.min(img.width - W, cx - 58)), sy = Math.max(0, Math.min(img.height - H, cy - 70));
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
  }, crops.map((c, i) => ({ name: c.name, label: FRAMES[i].label, data: 'data:image/png;base64,' + c.buf.toString('base64'), sx: c.info.sx, sy: c.info.sy })));
  for (const [k, url] of Object.entries(strip)) {
    const name = k === 'strip' ? 'fishing_strip.png' : 'fishing_' + k + '_close.png';
    fs.writeFileSync(path.join(OUT, name), png(url));
  }
  console.log('ERR', errs);
  if (errs.length) process.exitCode = 1;
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
