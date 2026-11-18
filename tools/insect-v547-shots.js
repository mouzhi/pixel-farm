// Screenshots of the user's day-64 save: node tools/insect-v547-shots.js [rootDir] [before|after]
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(process.argv[2] || path.resolve(__dirname, '..'));
const TAG = process.argv[3] || 'after';
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const SAVE_PATH = process.env.PF_SAVE || '/workspace/pf-shots/user-v547/pixel-farm-save.json';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css' };
const wrap = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
const save = Object.assign({}, wrap.save || wrap, { savedAt: Date.now() });

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(save));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__farm && __farm.spritesReady && __farm.spritesReady(), { timeout: 60000 });
  const prep = await p.evaluate(() => {
    const f = __farm, S = f.S, INS = window.PFInsects, WX = window.PFWeather;
    f.SAVE.off = true;
    const T = S.t % 1440, night = T >= 20 * 60 || T < 6 * 60;
    const raining = !!(WX && WX.isRaining && WX.isRaining(S.weather, S.day, S.t));
    const summer = !!(WX && WX.isSummer && WX.isSummer(S.day));
    if (INS) {
      INS.reset();
      INS.tick(0, {
        day: S.day, t: S.t, raining, night, summer,
        pond: f.POND, orchard: !!(S.eff.regions && S.eff.regions.includes('orchard')),
      });
    }
    f.setAngle(0.22);
    f.panTo(74, 80);
    f.render();
    const kids = (S.members || []).filter(m => /^kid/.test(m.id || '')).map(m => ({ id: m.id, name: m.name, role: m.role, x: m.x, y: m.y, away: m.away }));
    return {
      ver: f.version, day: S.day, t: S.t % 1440, bugNet: S.bugNet,
      family: 1 + (S.members || []).length, kids,
      bugs: INS && INS.list ? INS.list() : [], raining, night, summer,
      title: document.title,
    };
  });
  console.log('prep', JSON.stringify(prep, null, 2));
  await p.screenshot({ path: path.join(OUT, `v547_${TAG}.png`) });
  const close = await p.evaluate(async () => {
    const f = __farm; f.panTo(50, 90); f.render();
    const [sx, sy] = f.proj(50, 90), cv = document.getElementById('game');
    const W = 420, H = 280, K = 3;
    const data = cv.toDataURL(), c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = data; });
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.max(0, Math.round(sx) - W / 2), Math.max(0, Math.round(sy) - H * 0.55), W, H, 0, 0, W * K, H * K);
    return c.toDataURL();
  });
  fs.writeFileSync(path.join(OUT, `v547_${TAG}_close.png`), Buffer.from(close.split(',')[1], 'base64'));

  if (TAG === 'after') {
    await p.evaluate(() => {
      const f = __farm, S = f.S, INS = window.PFInsects;
      const kid = (S.members || []).find(m => m.id === 'kid0') || f.FARMER;
      // stand a teen in the yard so the tiny popup is easy to compare with a person
      if (kid) { kid.home = false; kid.sleeping = false; kid.away = ''; kid.x = 80; kid.y = 80; }
      const ev = INS.forceCatch('swallow', S.day, 80, 80, kid ? { id: kid.id, x: kid.x, y: kid.y } : null);
      if (f.noteBugCatch) f.noteBugCatch(ev);
      f.panTo(80, 80); f.render();
    });
    await p.waitForTimeout(80);
    await p.screenshot({ path: path.join(OUT, 'v547_catch.png') });
    const catchClose = await p.evaluate(async () => {
      const f = __farm, S = f.S, kid = (S.members || []).find(m => m.id === 'kid0') || f.FARMER;
      f.panTo(kid.x, kid.y); f.render();
      const [sx, sy] = f.proj(kid.x, kid.y), cv = document.getElementById('game');
      const W = 300, H = 220, K = 3;
      const data = cv.toDataURL(), c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
      const img = new Image(); await new Promise(r => { img.onload = r; img.src = data; });
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(img, Math.max(0, Math.round(sx) - W / 2), Math.max(0, Math.round(sy) - H * 0.65), W, H, 0, 0, W * K, H * K);
      return c.toDataURL();
    });
    fs.writeFileSync(path.join(OUT, 'v547_catch_close.png'), Buffer.from(catchClose.split(',')[1], 'base64'));
  }
  if (errs.length) console.log('pageErrors', errs);
  await b.close();
  server.close();
})().catch(err => { console.error(err); process.exit(1); });
