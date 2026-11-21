// Headless smoke test (used by CI and before every PR):
//   node tools/smoke.js            # serves the repo root on a free port, loads the game, runs a day, checks the picture
// Env: CHROME=/path/to/chrome (default /usr/bin/google-chrome)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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
    p.on('pageerror', e => errs.push(String(e))); p.on('requestfailed', r => { const u = r.url(); if (/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(u)) return; errs.push('request failed ' + u); });
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
        // shop UI: coin/wood icons, category tabs, last tab remembered, locked-item teasers
        document.getElementById('store').hidden = true;
        const tipClose = document.getElementById('loveTip'); if (tipClose) tipClose.hidden = true;
        S.coins = 1200; F.wood = 25; if (__farm.hud) __farm.hud();
        document.getElementById('shopBtn').click();
        const shopEl = document.getElementById('shop');
        const buyBtns = [...shopEl.querySelectorAll('[data-buy]')];
        const tabIds = [...shopEl.querySelectorAll('[data-tab]')].map(b => b.dataset.tab);
        const goldWordOnBuy = buyBtns.some(b => /金/.test(b.textContent));
        const shopUi = {
          open: !shopEl.hidden,
          woodHud: (document.getElementById('wood') || {}).textContent,
          tabs: tabIds,
          coinIco: !!shopEl.querySelector('.wallet .ico.coin'),
          woodIco: !!shopEl.querySelector('.wallet .ico.wood'),
          buyHasCoin: buyBtns.some(b => b.querySelector('.ico.coin')),
          goldWordOnBuy,
        };
        const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, cy: r.top + r.height / 2, w: r.width, h: r.height }; };
        const alignOf = root => {
          const rows = [...root.querySelectorAll('.cost')].map(c => ({ ico: box(c.querySelector('.ico')), amt: box(c.querySelector('.amt')) }));
          if (!rows.length) return { ok: false, why: 'no cost' };
          const vCenter = rows.every(r => Math.abs(r.ico.cy - r.amt.cy) <= 2);
          const icoSz = rows.every(r => Math.abs(r.ico.w - 16) <= 1 && Math.abs(r.ico.h - 16) <= 1);
          const numsRight = rows.length < 2 || Math.abs(rows[0].amt.r - rows[1].amt.r) <= 1;
          const icoLeft = rows.length < 2 || Math.abs(rows[0].ico.l - rows[1].ico.l) <= 1;
          return { ok: vCenter && icoSz && numsRight && icoLeft, vCenter, icoSz, numsRight, icoLeft, n: rows.length };
        };
        const toolsBtn = shopEl.querySelector('[data-buy="can"]');
        shopUi.singleAlign = toolsBtn ? alignOf(toolsBtn) : { ok: false, why: 'no can' };
        const buildTab = shopEl.querySelector('[data-tab="build"]'); if (buildTab) buildTab.click();
        const house = shopEl.querySelector('[data-item="house"]');
        const houseBtn = house && house.querySelector('[data-buy="house"]');
        const houseShort = house && house.querySelector('.short');
        shopUi.dualAlign = houseBtn ? alignOf(houseBtn) : { ok: false, why: 'no house' };
        if (houseBtn && houseShort && houseShort.querySelector('.amt')) {
          const btnAmt = box(houseBtn.querySelector('.amt')); // first row; all share right edge
          const shAmt = box(houseShort.querySelector('.amt'));
          const btnIco = box(houseBtn.querySelector('.ico'));
          const shIco = box(houseShort.querySelector('.ico'));
          shopUi.shortAlign = { ok: Math.abs(btnAmt.r - shAmt.r) <= 2 && Math.abs(btnIco.l - shIco.l) <= 2, amt: Math.round(shAmt.r - btnAmt.r), ico: Math.round(shIco.l - btnIco.l) };
        } else shopUi.shortAlign = { ok: false, why: 'no short' };
        const aniBtn = shopEl.querySelector('[data-tab="animals"]'); if (aniBtn) aniBtn.click();
        shopUi.teaser = /先买/.test(shopEl.textContent) && /猪圈/.test(shopEl.textContent);
        shopUi.savedTab = localStorage.getItem('mouzhi/pixel-farm:shop-tab');
        const closeShop = () => { const b = shopEl.querySelector('[data-a="close"]'); if (b) b.click(); else shopEl.hidden = true; };
        closeShop();
        document.getElementById('shopBtn').click();
        shopUi.reopenedAnimals = !!(shopEl.querySelector('[data-tab="animals"].on') && /猪/.test(shopEl.textContent));
        closeShop();
        return { meters, version: __farm.version, storeOpen, txt, sellGold: data.sellGold, basketGold: data.basketGold, storeN: data.store.reduce((s, r) => s + r.n, 0), hasGiant: /巨大/.test(txt), hasGold: /金蛋/.test(txt), hasWood: /木材/.test(txt), hasHay: /干草/.test(txt), hasFish: /鲫/.test(txt) || /鲤/.test(txt), mid, fullHint, love2, movedVal, movedHint, shopUi };
      });
      const bad = (ui.meters || []).filter(m => !m.ok);
      const storeOk = ui.storeOpen && ui.hasGiant && ui.hasGold && ui.hasWood && ui.hasHay && ui.storeN >= 7 && ui.sellGold >= ui.basketGold;
      const loveOk = ui.mid && ui.mid.loveVal === '63/100' && ui.mid.tipOpen && /聊天 \+3/.test(ui.mid.tipTxt) && /野花/.test(ui.mid.tipTxt) && /好感满后/.test(ui.mid.hint) && ui.mid.fillW > 0 && /等待大木屋/.test(ui.fullHint) && /一家/.test(ui.movedVal) && /已经住在农场/.test(ui.movedHint);
      const shop = ui.shopUi || {};
      const alignOk = shop.singleAlign && shop.singleAlign.ok && shop.dualAlign && shop.dualAlign.ok && shop.shortAlign && shop.shortAlign.ok;
      const shopOk = shop.open && shop.woodHud === '25' && (shop.tabs || []).join() === 'tools,seeds,land,build,works,animals,yard,decor' && shop.coinIco && shop.woodIco && shop.buyHasCoin && !shop.goldWordOnBuy && shop.teaser && shop.savedTab === 'animals' && shop.reopenedAnimals && alignOk;
      const okUi = !bad.length && storeOk && loveOk && shopOk && ui.version === '5.11.0.28';
      console.log(okUi ? 'ok  ' : 'FAIL', 'meters+store+love+shop', JSON.stringify({ bad, storeOpen: ui.storeOpen, sellGold: ui.sellGold, love: { mid: ui.mid, fullHint: ui.fullHint, movedVal: ui.movedVal, movedHint: ui.movedHint }, shop, flags: { g: ui.hasGiant, e: ui.hasGold, w: ui.hasWood, h: ui.hasHay, f: ui.hasFish, n: ui.storeN, v: ui.version } }));
      if (!okUi) fail.push('meters+store+love+shop');
      // close the panel so the later screenshot-less colour test is not blocked; Esc on window
      await p.keyboard.press('Escape');
      // v5.1.2: 第N天 HUD, the event log, inventory, title, and catch list must not overlap
      const sizes = [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [1024, 576]];
      const layoutHits = [];
      for (const [w, h] of sizes) {
        await p.setViewportSize({ width: w, height: h });
        const hit = await p.evaluate(() => {
          const S = __farm.S;
          S.eff.crops = ['carrot', 'cabbage', 'pumpkin', 'strawberry', 'watermelon'];
          S.animals = [{ kind: 'chicken', h: 1 }, { kind: 'cow', h: 1 }, { kind: 'sheep', h: 1 }];
          S.log = ['18:40 卖了 12 个南瓜，进账 1020 金', '16:05 浇完了南边的菜地', '12:20 和阿禾聊了几句', '07:15 出门拔草收集种子'];
          document.getElementById('log').innerHTML = S.log.map(s => '<div>' + s + '</div>').join('');
          const catches = document.getElementById('catches');
          catches.hidden = false;
          catches.innerHTML = '<div class="h">今日渔获</div><div>今 · 鲫鱼 8 金</div>';
          const tip = document.getElementById('loveTip'); if (tip) tip.hidden = true;
          if (__farm.hud) __farm.hud();
          __farm.refreshUI();
          const rect = id => {
            const e = document.getElementById(id);
            if (!e || e.hidden || e.getClientRects().length === 0) return null;
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          };
          const boxes = { hud: rect('hud'), log: rect('log'), inv: rect('inv'), title: rect('title'), catches: rect('catches') };
          const overlap = (a, b) => {
            if (!a || !b) return 0;
            const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
            const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
            return x > 1 && y > 1 ? Math.round(x * y) : 0; // 1px tolerance for subpixel seams
          };
          const pairs = [['hud', 'log'], ['hud', 'inv'], ['hud', 'title'], ['hud', 'catches'], ['log', 'inv'], ['log', 'catches'], ['log', 'title'], ['catches', 'inv'], ['title', 'inv']];
          const bad = pairs.map(([a, b]) => ({ pair: a + '+' + b, area: overlap(boxes[a], boxes[b]) })).filter(x => x.area);
          return { bad, vw: innerWidth, vh: innerHeight };
        });
        if (hit.bad.length) layoutHits.push({ w, h, bad: hit.bad });
      }
      const okLayout = !layoutHits.length;
      console.log(okLayout ? 'ok  ' : 'FAIL', 'hud-log-layout', JSON.stringify(layoutHits));
      if (!okLayout) fail.push('hud-log-layout');
      await p.setViewportSize({ width: 390, height: 844 });
      const portrait = await p.evaluate(() => {
        const tip = document.getElementById('loveTip'); if (tip) tip.hidden = true;
        document.getElementById('store').hidden = true;
        document.getElementById('shopBtn').click();
        const shop = document.getElementById('shop');
        const r = shop.getBoundingClientRect();
        const tabs = shop.querySelectorAll('[data-tab]');
        const inView = r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.width > 200 && r.height > 120;
        const tabWrap = getComputedStyle(shop.querySelector('.tabs')).flexWrap === 'wrap';
        shop.hidden = true;
        return { hidden: shop.hidden, inView, tabN: tabs.length, tabWrap, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
      });
      const okPortrait = portrait.inView && portrait.tabN === 8 && portrait.tabWrap;
      console.log(okPortrait ? 'ok  ' : 'FAIL', 'shop-portrait', JSON.stringify(portrait));
      if (!okPortrait) fail.push('shop-portrait');
      await p.setViewportSize({ width: 1280, height: 800 });
    }
    const r = await p.evaluate(manual => {
      const colours = () => { const d = document.getElementById('game').getContext('2d').getImageData(0, 0, document.getElementById('game').width, document.getElementById('game').height).data, s = new Set(); for (let i = 0; i < d.length; i += 16) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; };
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
