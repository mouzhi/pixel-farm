// v5.3: close-ups of 阿禾 in every direction and work pose, and a wide shot of the family working apart.
//   node tools/family-shots.js [tag]   writes /workspace/pf-shots/ahe_closeups[_tag].png and family_wide[_tag]_1..3.png (PF_SHOTS to change)
//   PF_ONLY=closeups skips the wide shot.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.argv[2] ? '_' + process.argv[2] : '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
// name, facing (world), moving, task pose, realT (picks the animation frame), basket item
const POSES = [
  ['front', 0, 1, true, null, 0.0], ['front2', 0, 1, true, null, 0.13], ['side_r', 1, 0, true, null, 0.0], ['side_r2', 1, 0, true, null, 0.13], ['side_l', -1, 0, true, null, 0.26],
  ['back', 0, -1, true, null, 0.0], ['back2', 0, -1, true, null, 0.13], ['idle_side', 1, 0, false, null, 0],
  ['hoe', 1, 0, false, 'hoe', 0.2], ['hoe2', 1, 0, false, 'hoe', 0.4], ['pull', 1, 0, false, 'pull', 0.2], ['pull2', 1, 0, false, 'pull', 0.4],
  ['pull_l', -1, 0, false, 'pull', 0.2], ['water', 1, 0, false, 'water', 0.2], ['water_l', -1, 0, false, 'water', 0.4], ['carry', 1, 0, true, null, 0.13, 'apple'],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; S.coins = 1e7; f.FARMER.wood = 5000;
    for (const id of ['axe', 'field', 'field', 'field', 'coop', 'chicken', 'chicken', 'chicken', 'forest', 'orchard', 'east', 'pasture', 'sty', 'fold', 'shed', 'pig', 'sheep', 'sheep', 'cow', 'cow', 'house', 'house', 'house']) f.buy(id);
    S.day = 40; Object.assign(S.family, { love: 100, met: 3, moved: 20, kids: [] }); f.syncFamily(); });
  await p.waitForTimeout(300);
  const sheet = await p.evaluate(POSES => new Promise(done => {
    const f = __farm, S = f.S, m = S.members[0], FA = f.FARMER, cv = document.getElementById('game');
    S.t = 40 * 1440 + 10 * 60; FA.x = -120; FA.y = -60; FA.task = { kind: 'idle', to: { x: FA.x, y: FA.y }, dur: 1e9, work: 0 };
    const X = 112, Y = 70, CW = 30, CH = 34, SC = 8, out = document.createElement('canvas'); out.width = POSES.length * CW * SC / 2; out.height = CH * SC * 2;
    const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.fillStyle = '#7aa95a'; o.fillRect(0, 0, out.width, out.height);
    const tick = () => { if (!f.famSheet('partner')) return setTimeout(tick, 50);
      f.setAngle(0); f.panTo(X, Y);
      POSES.forEach(([name, fx, fy, moving, pose, rt, item], i) => {
        Object.assign(m, { x: X, y: Y, fx, fy, moving, home: false, sleeping: false, crops: item ? [item, item] : [] });
        m.task = pose ? { kind: 'till', pose, work: 1, dur: 1e9, to: { x: X, y: Y } } : { kind: 'idle', work: moving ? 0 : 1, dur: 1e9, to: { x: X + fx * 40, y: Y + fy * 40 } };
        f.setRealT(rt); f.render(); f.render();
        const [sx, sy] = f.proj(X, Y);
        o.drawImage(cv, Math.round(sx - CW / 2), Math.round(sy - CH + 4), CW, CH, (i % (POSES.length / 2)) * CW * SC, Math.floor(i / (POSES.length / 2)) * CH * SC, CW * SC, CH * SC);
      });
      done(out.toDataURL()); };
    tick(); }), POSES);
  fs.writeFileSync(path.join(OUT, `ahe_closeups${TAG}.png`), Buffer.from(sheet.split(',')[1], 'base64'));
  console.log('closeups', POSES.map(q => q[0]).join(' '));
  if (process.env.PF_ONLY !== 'closeups') { // run the farm until the two are both working far apart and both on screen, then shoot the whole view (3 moments)
    await p.evaluate(() => { const f = __farm, S = f.S, m = S.members[0], FA = f.FARMER; S.t = 41 * 1440 + 6 * 60; S.day = 41; FA.home = m.home = true; FA.task = m.task = null; window.__lastShot = 0; });
    for (let n = 0; n < 3; n++) {
      const r = await p.evaluate(() => { const f = __farm, S = f.S, m = S.members[0], FA = f.FARMER;
        const busy = a => a.task && !['idle', 'home', 'fish'].includes(a.task.kind) && !a.moving;
        for (let i = 0; i < 6000; i++) { f.advance(0.25, 8); const T = S.t % 1440, d = Math.hypot(FA.x - m.x, FA.y - m.y);
          if (T > 7 * 60 && T < 17 * 60 && S.t - window.__lastShot > 90 && busy(FA) && busy(m) && d > 60 && d < 140) {
            f.setAngle(0.22); f.panTo((FA.x + m.x) / 2, (FA.y + m.y) / 2 - 6); f.render();
            const a = f.proj(FA.x, FA.y), c = f.proj(m.x, m.y), ok = q => q[0] > 70 && q[0] < 356 && q[1] > 60 && q[1] < 190;
            if (!ok(a) || !ok(c)) continue;
            window.__lastShot = S.t; return { d: Math.round(d / 8) + ' tiles', farmer: FA.task.label, partner: m.task.label, t: Math.floor(T / 60) + ':' + String(Math.floor(T % 60)).padStart(2, '0') }; } }
        return null; });
      if (!r) break;
      await p.waitForTimeout(150);
      await p.screenshot({ path: path.join(OUT, `family_wide${TAG}_${n + 1}.png`) });
      console.log('wide', n + 1, JSON.stringify(r));
    }
  }
  if (errs.length) console.log('ERRORS', errs);
  await b.close(); server.close();
})();
