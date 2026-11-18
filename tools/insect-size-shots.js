// Screenshots of v5.4.6 insect world size vs a person: node tools/insect-size-shots.js [before|after]
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TAG = process.argv[2] || 'after';
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
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const prep = await p.evaluate(() => {
    const f = __farm, S = f.S, INS = window.PFInsects;
    f.SAVE.off = true;
    S.day = 30; S.t = 11 * 60;
    f.FARMER.home = false; f.FARMER.sleeping = false;
    S.coins = 8000; f.buy('bugnet');
    Object.assign(S.family, { love: 100, met: 3, moved: 10, kids: [{ id: 'kid0', name: '小豆', born: 22 }] });
    f.syncFamily();
    const kid = S.members.find(m => m.id === 'kid0');
    f.FARMER.x = 72; f.FARMER.y = 78; f.FARMER.fx = 1; f.FARMER.fy = 0;
    if (kid) { kid.home = false; kid.sleeping = false; kid.x = 80; kid.y = 80; kid.fx = -1; kid.fy = 0; kid.away = ''; }
    if (INS) {
      INS.reset();
      // park a few insects just beside the people so scale is obvious
      const spots = [
        ['white', 64, 84], ['yellow', 66, 74], ['swallow', 88, 84],
        ['grey', 90, 74], ['dragon', 50, 98], ['damsel', 58, 94],
      ];
      const st = { day: S.day, raining: false, night: false, summer: false, pond: f.POND, orchard: true, butterflies: 4, dragonflies: 2 };
      INS.tick(0, st);
      const live = INS.live || [];
      let i = 0;
      for (const b of live) {
        if (!b.alive) continue;
        const s = spots[i++]; if (!s) break;
        b.kind = s[0];
        const sp = INS.BY && INS.BY[s[0]];
        if (sp) { b.group = sp.group; b.name = sp.name; }
        b.x = s[1]; b.y = s[2]; b.tx = s[1] + 2; b.ty = s[2]; b.z = 3; b.ph = 0.8;
      }
    }
    f.setAngle(0.12); f.setRealT(2);
    f.panTo(74, 80); f.render();
    const kidNow = S.members.find(m => m.id === 'kid0');
    return { ver: f.version, net: S.bugNet, kid: kidNow && { x: kidNow.x, y: kidNow.y, role: kidNow.role }, bugs: (INS.list && INS.list()) ? INS.list().length : 0 };
  });
  console.log('prep', prep);
  await p.screenshot({ path: path.join(OUT, `v546_insects_${TAG}.png`) });
  const close = await p.evaluate(async () => {
    const f = __farm; f.panTo(74, 80); f.render();
    const [sx, sy] = f.proj(74, 80), cv = document.getElementById('game');
    const W = 360, H = 240, K = 3;
    const data = cv.toDataURL(), c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = data; });
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.max(0, Math.round(sx) - W / 2), Math.max(0, Math.round(sy) - H * 0.55), W, H, 0, 0, W * K, H * K);
    return c.toDataURL();
  });
  fs.writeFileSync(path.join(OUT, `v546_insects_${TAG}_close.png`), Buffer.from(close.split(',')[1], 'base64'));
  if (TAG === 'after') {
    await p.evaluate(() => {
      const f = __farm, S = f.S, INS = window.PFInsects, kid = S.members.find(m => m.id === 'kid0');
      const ev = INS.forceCatch('swallow', S.day, kid ? kid.x : 80, kid ? kid.y : 80);
      if (f.noteBugCatch) f.noteBugCatch(ev);
      else if (ev) {
        const cx = ev.x, cy = ev.y;
        const src = INS.canvasOf(INS.imageOf(ev.kind, true));
        // fallback if hook not yet wired
        if (src) { /* leave it */ }
      }
      f.render();
    });
    await p.waitForTimeout(80);
    await p.screenshot({ path: path.join(OUT, 'v546_insects_catch.png') });
    const catchClose = await p.evaluate(async () => {
      const f = __farm, S = f.S, kid = S.members.find(m => m.id === 'kid0') || f.FARMER;
      f.panTo(kid.x, kid.y); f.render();
      const [sx, sy] = f.proj(kid.x, kid.y), cv = document.getElementById('game');
      const W = 300, H = 220, K = 3;
      const data = cv.toDataURL(), c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
      const img = new Image(); await new Promise(r => { img.onload = r; img.src = data; });
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(img, Math.max(0, Math.round(sx) - W / 2), Math.max(0, Math.round(sy) - H * 0.6), W, H, 0, 0, W * K, H * K);
      return c.toDataURL();
    });
    fs.writeFileSync(path.join(OUT, 'v546_insects_catch_close.png'), Buffer.from(catchClose.split(',')[1], 'base64'));
    // codex page still detailed
    await p.evaluate(() => {
      const CX = __farm.BOOK || window.PFCodex, S = __farm.S;
      ['white','yellow','grey','swallow','dragon','reddragon','damsel','firefly'].forEach((id,i) => CX.record(S.codex, CX.keyBug(id), 6+i, 1));
      const b = document.getElementById('codexBtn'); if (b) b.click();
      const el = document.getElementById('codex');
      const sec = el && [...el.querySelectorAll('.sec')].find(s => s.textContent.indexOf('昆虫') >= 0);
      if (sec) sec.scrollIntoView({ block: 'start' });
    });
    await p.waitForTimeout(150);
    const panel = await p.evaluate(() => {
      const el = document.getElementById('codex'); if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      const sec = [...el.querySelectorAll('.sec')].find(s => s.textContent.indexOf('昆虫') >= 0);
      const sr = sec ? sec.getBoundingClientRect() : r;
      const all = [...el.querySelectorAll('.sec')];
      const next = all[all.indexOf(sec) + 1];
      const top = Math.max(r.y, sr.y - 8);
      const bottom = next ? next.getBoundingClientRect().top : r.bottom;
      return { x: r.x, y: top, width: r.width, height: Math.max(40, Math.min(r.bottom, bottom + 4) - top) };
    });
    if (panel) {
      const buf = await p.screenshot({ clip: panel });
      fs.writeFileSync(path.join(OUT, 'v546_insects_codex.png'), buf);
    }
  }
  console.log('errors', errs);
  await b.close(); server.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
