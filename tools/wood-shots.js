// Screenshot of v5.3.1 auto chopping from a late save: node tools/wood-shots.js <save.json>
// Buys the axe upgrades and the lumber hut, runs until someone is felling a 林场 tree by themselves, and writes
// $PF_SHOTS/wood_autochop.png (full page) and wood_autochop_close.png (3x close-up). Default PF_SHOTS=/workspace/pf-shots.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), save = raw.save || raw; save.savedAt = Date.now();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(save));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const info = await p.evaluate(() => {
    const f = __farm, S = f.S; f.SAVE.off = true; ['axe', 'axe', 'lumber'].forEach(id => f.buy(id));
    const busy = a => a.task && a.task.label === '自己去林场砍树' && Math.hypot(a.x - a.task.to.x, a.y - a.task.to.y) < 1.5 && a.task.work > 4;
    const who = n => n < 6000 ? (busy(f.FARMER) ? f.FARMER : null) : f.actors().find(busy); // the farmer first (roles give him the wood)
    let n = 0; while (!who(n) && n++ < 20000) f.advance(1, 10);
    const a = who(n); if (!a) return { ok: false };
    const hut = PFWood.HUT; f.setAngle(0.25); f.panTo((a.x + hut.x) / 2, (a.y + hut.y) / 2 - 6); f.setRealT(3); f.render();
    const [sx, sy] = f.proj((a.x + hut.x) / 2, (a.y + hut.y) / 2), cv = document.getElementById('game');
    return { ok: true, who: a.name || '农夫', label: a.task.label, day: S.day, t: S.t % 1440, wood: f.FARMER.wood, sx, sy, data: cv.toDataURL(), w: cv.width, h: cv.height, log: S.log.slice() };
  });
  if (!info.ok) { console.log('no auto chop found'); process.exit(1); }
  await p.screenshot({ path: path.join(OUT, 'wood_autochop.png') });
  const close = await p.evaluate(async i => { const img = new Image(); await new Promise(r => { img.onload = r; img.src = i.data; });
    const W = 300, H = 170, K = 3, c = document.createElement('canvas'); c.width = W * K; c.height = H * K; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.max(0, Math.round(i.sx) - W / 2), Math.max(0, Math.round(i.sy) - H * 0.55), W, H, 0, 0, W * K, H * K); return c.toDataURL(); }, info);
  fs.writeFileSync(path.join(OUT, 'wood_autochop_close.png'), Buffer.from(close.split(',')[1], 'base64'));
  console.log(`${info.who}: ${info.label}  day ${info.day} ${Math.floor(info.t / 60)}:${String(Math.floor(info.t % 60)).padStart(2, '0')}  wood ${info.wood}`); console.log(info.log.join('\n'));
  if (errs.length) console.log('ERRORS', errs);
  await b.close(); server.close();
})();
