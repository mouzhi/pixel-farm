// Headless smoke test (used by CI and before every PR):
//   node tools/smoke.js            # serves the repo root on a free port, loads the game, runs a day, checks the picture
// Env: CHROME=/path/to/chrome (default /usr/bin/google-chrome)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const fail = [];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const url of [`${base}/index.html?manual`, `${base}/index.html`, 'file://' + path.join(ROOT, 'index.html')]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } }), errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('requestfailed', r => errs.push('request failed ' + r.url()));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(url); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 15000 });
    if (url.includes('manual')) {
      const ui = await p.evaluate(() => {
        const F = __farm.FARMER || __farm.F, S = __farm.S, meters = [];
        const check = () => {
          __farm.refreshUI();
          const slot = document.querySelector('#inv .slot');
          const meter = slot && slot.querySelector('.meter');
          if (!slot || !meter) return { ok: false, why: 'missing meter' };
          const inside = meter.offsetLeft >= 2 && meter.offsetLeft + meter.offsetWidth <= slot.clientWidth - 2
            && meter.offsetTop >= 0 && meter.offsetTop + meter.offsetHeight <= slot.clientHeight;
          return { ok: inside, max: S.waterMax, water: F.water, left: meter.offsetLeft, w: meter.offsetWidth, slotW: slot.clientWidth, fill: (meter.querySelector('.fill') || {}).offsetWidth };
        };
        const saved = { max: S.waterMax, water: F.water };
        for (const max of [4, 8, 16, 30, 40]) { S.waterMax = max; F.water = 1; meters.push(check()); S.waterMax = max; F.water = max; meters.push(check()); }
        S.waterMax = saved.max; F.water = saved.water; __farm.refreshUI();
        // store panel: stock a mixed shelf, open with I, read it back
        S.store.carrot = 5; S.store.pumpkin = 2; F.bag.cabbage = 3; F.gathered = 1;
        F.wood = 120; S.hay = 4; F.saplings.apple = 1;
        F.crops = ['carrot', { type: 'pumpkin', glow: 1, giant: 1 }, { type: 'egg', rare: 'gold' }, 'crucian', 'apple', 'flower'];
        document.getElementById('storeBtn').click();
        const panel = document.getElementById('store');
        const data = __farm.storehouse();
        const txt = panel.textContent;
        const storeOpen = !panel.hidden;
        const closedEsc = (() => { panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; })();
        // affection HUD: mid-courtship, today's chat+gift, milestone hint, then moved-in family status
        const fam = S.family; fam.met = 1; fam.love = 63; fam.moved = 0; fam.today = { day: S.day, chat: 3, gift: 12, giftName: '一束野花', sales: 1 };
        if (__farm.hud) __farm.hud();
        const loveVal = (document.getElementById('loveVal') || {}).textContent;
        const loveHud = document.getElementById('loveHud'); loveHud.click();
        const tip = document.getElementById('loveTip');
        const tipTxt = tip ? tip.textContent : '';
        const loveFill = document.getElementById('loveFill');
        const fillW = loveFill ? loveFill.offsetWidth : 0;
        const mid = { loveVal, tipOpen: tip && !tip.hidden, tipTxt, fillW, hint: (__farm.loveStatus() || {}).hint };
        fam.love = 100; fam.moved = 0; if (__farm.hud) __farm.hud();
        const fullHint = (__farm.loveStatus() || {}).hint;
        const love2 = document.getElementById('loveTip').textContent;
        fam.moved = S.day; fam.love = 100; if (__farm.hud) __farm.hud();
        const movedVal = (document.getElementById('loveVal') || {}).textContent;
        const movedHint = (__farm.loveStatus() || {}).hint;
        return { meters, version: __farm.version, storeOpen, txt, sellGold: data.sellGold, basketGold: data.basketGold, storeN: data.store.reduce((s, r) => s + r.n, 0), hasGiant: /巨大/.test(txt), hasGold: /金蛋/.test(txt), hasWood: /木材/.test(txt), hasHay: /干草/.test(txt), hasFish: /鲫/.test(txt) || /鲤/.test(txt), mid, fullHint, love2, movedVal, movedHint };
      });
      const bad = (ui.meters || []).filter(m => !m.ok);
      const storeOk = ui.storeOpen && ui.hasGiant && ui.hasGold && ui.hasWood && ui.hasHay && ui.storeN >= 7 && ui.sellGold >= ui.basketGold;
      const loveOk = ui.mid && ui.mid.loveVal === '63/100' && ui.mid.tipOpen && /聊天 \+3/.test(ui.mid.tipTxt) && /野花/.test(ui.mid.tipTxt) && /好感满后/.test(ui.mid.hint) && ui.mid.fillW > 0 && /等待大木屋/.test(ui.fullHint) && /一家/.test(ui.movedVal) && /已经住在农场/.test(ui.movedHint);
      const okUi = !bad.length && storeOk && loveOk && ui.version === '5.1.1';
      console.log(okUi ? 'ok  ' : 'FAIL', 'meters+store+love', JSON.stringify({ bad, storeOpen: ui.storeOpen, sellGold: ui.sellGold, love: { mid: ui.mid, fullHint: ui.fullHint, movedVal: ui.movedVal, movedHint: ui.movedHint }, flags: { g: ui.hasGiant, e: ui.hasGold, w: ui.hasWood, h: ui.hasHay, f: ui.hasFish, n: ui.storeN, v: ui.version } }));
      if (!okUi) fail.push('meters+store+love');
      // close the panel so the later screenshot-less colour test is not blocked; Esc on window
      await p.keyboard.press('Escape');
    }
    const r = await p.evaluate(manual => {
      const colours = () => { const d = document.getElementById('game').getContext('2d').getImageData(0, 0, 426, 266).data, s = new Set(); for (let i = 0; i < d.length; i += 16) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; };
      if (!manual) return { label: __farm.S.label, colours: colours() };
      const out = { colours: [] }; for (const a of [0.22, 1.8, 3.4, 5.0]) { __farm.setAngle(a); __farm.advance(60, 10); out.colours.push(colours()); }
      out.day = __farm.S.day; out.label = __farm.S.label; return out;
    }, url.includes('manual'));
    if (!url.includes('manual')) await p.waitForTimeout(2000);
    const ok = errs.length === 0 && [].concat(r.colours).every(n => n > 40);
    console.log(ok ? 'ok  ' : 'FAIL', url.replace(base, ''), JSON.stringify(r), errs.length ? errs : '');
    if (!ok) fail.push(url); await p.close();
  }
  await b.close(); server.close(); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
