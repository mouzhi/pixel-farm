// Screenshots of v5.4.0: the 图鉴 panel, wandering dogs, ornamental pond fish, shop fish food.
// node tools/codex-shots.js [optional-save.json]
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
function loadSave() {
  if (!process.argv[2]) return null;
  const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const save = raw.save || raw; save.savedAt = Date.now(); return save;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const save = loadSave();
  if (save) await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(save));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const prep = await p.evaluate(() => {
    const f = __farm, S = f.S, CX = f.BOOK || window.PFCodex, FS = window.PFFish;
    f.SAVE.off = true; const keepCoins = S.coins; S.t = Math.floor(S.t / 1440) * 1440 + 11 * 60; f.FARMER.home = false; f.FARMER.sleeping = false;
    for (const id of ['forest', 'east', 'orchard', 'south', 'pasture', 'coast', 'coop', 'sty', 'fold', 'shed', 'cat', 'cat', 'dog', 'dog', 'dog']) f.buy(id);
    S.day = Math.max(S.day, 48);
    if (!S.family.moved) Object.assign(S.family, { love: 100, met: 3, moved: S.day - 12, kids: [{ id: 'kid0', name: '小豆', born: S.day - 6 }] });
    f.syncFamily(); S.coins = keepCoins;
    ['crucian', 'carp', 'grassc', 'bass', 'koi', 'sardine'].forEach((id, i) => CX.record(S.codex, CX.keyFish(id), 8 + i * 3, 1 + (i % 3)));
    CX.record(S.codex, CX.keyRare('gold'), 20); CX.record(S.codex, CX.keyGlow('pumpkin'), 18); CX.record(S.codex, CX.keyGiant('pumpkin'), 22);
    S.achievements = S.achievements || []; S.milestones = S.milestones || [];
    f.noteProgress({ coins: S.coins, caughtKoi: true, sawRare: true, sawGiant: true, sawGiantPumpkin: true, pondCount: 0 });
    f.placePondFish('koi'); f.placePondFish('goldfish'); f.placePondFish('koi');
    f.noteProgress({ pondCount: S.pondFish.length });
    f.setAngle(0.2); f.setRealT(2.4);
    return { day: S.day, dogs: f.PETS_LIVE.filter(q => q.kind === 'dog').length, pond: S.pondFish.length, aches: S.achievements.length, entries: Object.keys(S.codex.entries).length };
  });
  // dogs wander a bit so they aren't piled on the porch
  await p.evaluate(() => { const f = __farm; f.FARMER.x = 90; f.FARMER.y = 70; for (let i = 0; i < 80; i++) f.advance(8, 10); f.panTo(70, 70); f.render(); });
  await p.screenshot({ path: path.join(OUT, 'v54_dogs.png') });
  const dogs = await p.evaluate(async () => {
    const f = __farm, pets = f.PETS_LIVE.filter(q => q.kind === 'dog');
    if (!pets.length) return null;
    const views = pets.map(q => f.PV.get(q.id)).filter(v => v && isFinite(v.x) && isFinite(v.y));
    if (!views.length) return { n: pets.length, jobs: pets.map(q => q.coat) };
    const mid = { x: views.reduce((s, v) => s + v.x, 0) / views.length, y: views.reduce((s, v) => s + v.y, 0) / views.length };
    f.panTo(mid.x, mid.y); f.render();
    const [sx, sy] = f.proj(mid.x, mid.y), cv = document.getElementById('game');
    const data = cv.toDataURL(), W = 320, H = 200, K = 3, c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = data; });
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.max(0, Math.round(sx) - W / 2), Math.max(0, Math.round(sy) - H * 0.55), W, H, 0, 0, W * K, H * K);
    return { n: pets.length, jobs: pets.map(q => q.coat), at: views.map(v => [Math.round(v.x), Math.round(v.y)]), data: c.toDataURL() };
  });
  if (dogs && dogs.data) fs.writeFileSync(path.join(OUT, 'v54_dogs_close.png'), Buffer.from(dogs.data.split(',')[1], 'base64'));
  console.log('dogs', JSON.stringify({ n: dogs && dogs.n, jobs: dogs && dogs.jobs }));

  await p.evaluate(() => { const f = __farm; f.panTo(40, 100); f.setAngle(0.15); f.setRealT(2.8); f.render(); });
  await p.screenshot({ path: path.join(OUT, 'v54_pond.png') });
  const pondClose = await p.evaluate(async () => {
    const f = __farm, [sx, sy] = f.proj(34, 100), cv = document.getElementById('game');
    const data = cv.toDataURL(), W = 280, H = 160, K = 3, c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = data; });
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.max(0, Math.round(sx) - W / 2), Math.max(0, Math.round(sy) - H * 0.45), W, H, 0, 0, W * K, H * K);
    return c.toDataURL();
  });
  fs.writeFileSync(path.join(OUT, 'v54_pond_close.png'), Buffer.from(pondClose.split(',')[1], 'base64'));

  await p.evaluate(() => { document.getElementById('codexBtn').click(); });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, 'v54_codex.png') });
  await p.evaluate(() => { const b = document.querySelector('#codex [data-tab="ach"]'); if (b) b.click(); });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, 'v54_achievements.png') });
  await p.evaluate(() => { const box = document.querySelector('#codex .body, #codex .list, #codex .cards, #codex');
    const later = document.querySelector('#codex .card.locked');
    if (later) later.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(120);
  await p.screenshot({ path: path.join(OUT, 'v54_achievements_later.png') });
  await p.evaluate(() => { const b = document.querySelector('#codex [data-tab="ms"]'); if (b) b.click(); });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, 'v54_milestones.png') });
  await p.evaluate(() => { const last = [...document.querySelectorAll('#codex .card, #codex .row')].pop(); if (last) last.scrollIntoView({ block: 'end' }); });
  await p.waitForTimeout(120);
  await p.screenshot({ path: path.join(OUT, 'v54_milestones_end.png') });

  await p.evaluate(() => { const x = document.querySelector('#codex [data-a="close"]'); if (x) x.click(); document.getElementById('shopBtn').click(); });
  await p.evaluate(() => { const t = document.querySelector('#shop [data-tab="tools"]'); if (t) t.click(); const c = document.querySelector('#shop [data-item="fishfood"]'); if (c) c.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, 'v54_shop_pond.png') });

  console.log(JSON.stringify(prep));
  if (errs.length) console.log('ERRORS', errs);
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
