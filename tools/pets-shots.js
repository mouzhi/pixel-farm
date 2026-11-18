// Pet close-ups (after npm --prefix tools ci): node tools/pets-shots.js [name]  -> /workspace/pf-shots/<name>.png (default pets_after)
// Puts every cat and dog coat on the grass next to the farmer, in their poses, and writes a 4x close-up plus a sprite sheet.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const NAME = process.argv[2] || 'pets_after';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const png = d => Buffer.from(d.split(',')[1], 'base64');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${base}/index.html?manual=1`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__farm && __farm.spritesReady && __farm.spritesReady(), null, { timeout: 20000 });
  const out = await p.evaluate(async ([process_dx, process_dy]) => {
    const f = __farm, F = f.F, S = f.S, AN = PFAnimals, L = f.PETS_LIVE;
    S.t = 10 * 60; S.day = 3; F.home = false; F.sleeping = false; F.moving = false; F.task = null;
    const cx = (f.HOUSE.x || 0) + (+process_dx), cy = (f.HOUSE.y || 0) + (+process_dy); F.x = cx; F.y = cy; F.fx = 1; F.fy = 0;
    L.length = 0; f.PV.clear();
    const lay = [['cat', 0, -16, -6, 2], ['cat', 1, -18, 5, 0], ['cat', 2, -8, 13, 3], ['dog', 0, 13, -6, 2], ['dog', 1, 15, 5, 1], ['dog', 2, 7, 14, 3]];
    for (const [k, i, dx, dy, pose] of lay) { const pt = AN.pet(k, i); L.push(pt); f.PV.set(pt.id, { x: cx + dx, y: cy + dy, tx: cx + dx, ty: cy + dy, flip: dx > 0, step: 0, pose, wait: 1e9, idle: 0, hold: 0, pet: pt }); }
    f.setAngle(0); f.panTo(cx, cy); f.setRealT(0.3); f.render();
    const cv = document.getElementById('game'), [sx, sy] = f.proj(cx, cy);
    const W = 120, H = 70, SC = 4, img = new Image(); await new Promise(r => { img.onload = r; img.src = cv.toDataURL(); });
    const c = document.createElement('canvas'); c.width = W * SC; c.height = H * SC; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.round(sx - W / 2), Math.round(sy - H / 2 - 6), W, H, 0, 0, W * SC, H * SC);
    // sprite sheet: every coat x every frame, right-facing then left-facing, on grass green
    let sheet = null; if (f.petFrames) {
      const coats = []; for (const k of AN.PET_IDS) for (let i = 0; i < AN.PETS[k].coats.length; i++) coats.push(AN.pet(k, i));
      const sp = coats.map(pt => f.petFrames(pt)), nf = sp[0].r.length, cw = 20, ch = 16, s2 = 6;
      const sc = document.createElement('canvas'); sc.width = nf * 2 * cw * s2; sc.height = coats.length * ch * s2; const sg = sc.getContext('2d'); sg.imageSmoothingEnabled = false;
      sg.fillStyle = '#52af3a'; sg.fillRect(0, 0, sc.width, sc.height);
      sp.forEach((s, row) => [...s.r, ...s.l].forEach((fr, col) => sg.drawImage(fr, (col * cw + ((cw - fr.width) >> 1)) * s2, (row * ch + ch - fr.height - 1) * s2, fr.width * s2, fr.height * s2)));
      sheet = sc.toDataURL(); }
    return { shot: c.toDataURL(), full: cv.toDataURL(), sheet };
  }, [+(process.env.PDX || 40), +(process.env.PDY || -40)]);
  fs.writeFileSync(path.join(OUT, NAME + '.png'), png(out.shot));
  fs.writeFileSync(path.join(OUT, NAME + '_full.png'), png(out.full));
  if (out.sheet) fs.writeFileSync(path.join(OUT, NAME + '_sheet.png'), png(out.sheet));
  console.log('wrote', NAME, out.sheet ? '+ sheet' : '', errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
  await b.close(); server.close();
})();
