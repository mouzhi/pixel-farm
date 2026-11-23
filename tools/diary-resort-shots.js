// v5.11.0.39: diary 农家乐账单, shop lifetime wording, and the family-panel 「← new」 badge.
//   node tools/diary-resort-shots.js [name-filter]
//   writes /workspace/resort-ledger-shots/*.png (PF_SHOTS to change)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..');
const OUT = process.env.PF_SHOTS || '/workspace/resort-ledger-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI && window.PFDiaryUI, null, { timeout: 30000 });
  async function page(vp) {
    const ctx = await b.newContext({ viewport: vp || { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
    return p;
  }
  const shot = async (name, vp, run, check) => {
    if (only && !name.includes(only)) return;
    const p = await page(vp); let r;
    try { r = await run(p); } catch (e) { r = { error: String(e).slice(0, 500) }; }
    if (!(r && r.alreadyShot)) await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : (check ? check(r) : null);
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900));
    if (bad) fails.push(name + ': ' + bad);
    await p.context().close();
  };

  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); S.town.school.kid1 = Math.max(S.town.school.kid1 | 0, 3); return f.buy('town').ok; };
    const hideLog = () => { const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden';
      const say = document.getElementById('say'); if (say) say.hidden = true;
      const alb = document.getElementById('albumToast'); if (alb) alb.hidden = true; };`;

  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(80); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();`;

  const readyTown = `openTown(); at(9 * 60);
    for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    S.coins = Math.max(S.coins, 400000); f.FARMER.wood = 2500;
    for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 2500); S.coins = Math.max(S.coins, 300000);
    if (!f.innPlot()) throw new Error('no inn site, town=' + !!(S.eff && S.eff.town));
    f.buyPlot('eshore', 'resort');`;

  const seedBusy = `S.inn.cabins = 4; S.inn.inn2 = 1; S.inn.diner.lv = 3; S.inn.job = null;
    S.inn.resort = Object.assign(S.inn.resort || f.IN.emptyResort(), { huts: 4, parasols: 8, stall: 1, pier: 1, deck: 1, villas: 3, camp: 1 });
    S.inn.stars = { avg: 3, last: [] };
    S.inn.earn.rooms = 88000; S.inn.earn.meals = 52000; S.inn.earn.today = 0;
    const D = f.DY;
    for (let d = S.day - 6; d < S.day; d++) { D.addResort(S.diary, d, 'cabin', 600); D.addResort(S.diary, d, 'diner', 400); }
    const day0 = S.day;
    S.inn.guests = [
      { id: 'gInn', look: 'innA', n: 2, room: 0, from: day0 - 2, until: day0, at: 12 * 60, stay: 'inn' },
      { id: 'gHut', look: 'beachA', n: 2, room: 0, from: day0 - 2, until: day0, at: 12 * 60, stay: 'beach' },
      { id: 'gVil', look: 'beachB', n: 2, room: 0, from: day0 - 2, until: day0, at: 12 * 60, stay: 'villa' },
      { id: 'gCam', look: 'beachC', n: 2, room: 0, from: day0 - 2, until: day0, at: 12 * 60, stay: 'camp' }
    ];
    for (const id of ['cabbage','egg','pumpkin','flour','milk','jam','carrot','apple']) for (let i = 0; i < 12; i++) f.FARMER.crops.push(id);
    for (const id of f.IN.SEA_FISH) for (let i = 0; i < 6; i++) f.FARMER.crops.push(id);
    S.inn.arrived = 0; S.inn._morn = 0; S.inn.diner.last = 0; if (S.inn.resort) delete S.inn.resort._meal;
    if (f.IA && f.IA.sync) f.IA.sync(true);
    const coins0 = S.coins, earn0 = S.todayEarn | 0, rooms0 = S.inn.earn.rooms, meals0 = S.inn.earn.meals;
    f.innMorning(); f.innServeMeals(); f.innServeStall();
    at(14 * 60); dry(); f.advance(1, 10);
    window.__ledgerShot = { gained: S.coins - coins0, earn0, rooms0, meals0, todayEarn: (S.todayEarn - earn0) };
    S.seenLove = 0; f.refreshUI();`;

  const gather = `const badge = document.getElementById('loveNew');
    const shop = document.getElementById('shop');
    const dv = f.diaryView(), e = S.diary.days.find(x => x.d === S.day), rs = (e && e.rs) || {};
    const shot = window.__ledgerShot || {};
    return {
      ver: f.version, day: S.day,
      gained: shot.gained, todayEarn: shot.todayEarn,
      rooms0: shot.rooms0, meals0: shot.meals0, rooms: S.inn.earn.rooms, meals: S.inn.earn.meals, todayFlag: S.inn.earn.today | 0,
      rs, ledger: dv && dv.resort, shopLine: (shop && shop.innerText) || '',
      badge: badge && { shown: !badge.hidden, text: badge.textContent, seen: S.seenLove | 0 },
      diaryText: (document.getElementById('diary') && document.getElementById('diary').innerText) || ''
    };`;

  // 1–2. diary ledger, desktop and phone
  for (const [name, vp] of [['ledger_desktop.png', { width: 1280, height: 800 }], ['ledger_phone.png', { width: 390, height: 844 }]]) {
    await shot(name, vp, async p => {
      await p.evaluate(`(() => { ${setup} ${readyTown} ${seedBusy}
        hideLog();
        const L = f.innLayout && f.innLayout(); if (L) { f.setAngle(0); f.panTo(L.yard.x, L.yard.y + 8); f.advance(0.3, 10); }
        return true; })()`);
      await p.evaluate(() => { if (window.PFDiaryUI) PFDiaryUI.open(); });
      await p.waitForTimeout(200);
      return p.evaluate(`(() => { const f = __farm, S = f.S; ${gather} })()`);
    }, r => r.ver !== '5.11.0.39' ? 'ver ' + r.ver
      : !r.ledger || !r.ledger.day.total ? 'no today ledger ' + JSON.stringify(r.ledger)
      : r.ledger.day.total !== r.gained ? 'ledger ' + r.ledger.day.total + ' != coins gained ' + r.gained
      : r.ledger.day.total !== (r.rs.cabin + r.rs.hut + r.rs.villa + r.rs.camp + r.rs.diner + r.rs.stall) ? 'rows != total'
      : !r.rs.cabin || !r.rs.hut || !r.rs.villa || !r.rs.camp || !r.rs.diner || !r.rs.stall ? 'missing source ' + JSON.stringify(r.rs)
      : r.ledger.week.total <= r.ledger.day.total ? 'week should include earlier days'
      : r.ledger.life.rooms !== r.rooms || r.ledger.life.meals !== r.meals ? 'life mismatch'
      : !/农家乐账单/.test(r.diaryText) ? 'diary panel missing ledger'
      : !/今日合计/.test(r.diaryText) ? 'no today total'
      : r.todayFlag !== r.ledger.day.total ? 'earn.today ' + r.todayFlag + ' != ledger ' + r.ledger.day.total
      : null);
  }

  // 3. shop 农家乐 tab wording (desktop)
  await shot('shop_earn_desktop.png', { width: 1280, height: 800 }, async p => {
    await p.evaluate(`(() => { ${setup} ${readyTown} ${seedBusy}
      hideLog();
      const L = f.innLayout && f.innLayout(); if (L) { f.setAngle(0); f.panTo(L.yard.x, L.yard.y + 8); f.advance(0.3, 10); }
      return true; })()`);
    await p.click('#shopBtn'); await p.waitForTimeout(150);
    await p.click('#shop [data-tab="inn"]'); await p.waitForTimeout(200);
    return p.evaluate(`(() => { const f = __farm, S = f.S; ${gather} })()`);
  }, r => {
    const want = `开业以来：房费 ${r.rooms} 金、菜钱 ${r.meals} 金；今天 ${r.ledger && r.ledger.day.total} 金`;
    if (r.ver !== '5.11.0.39') return 'ver ' + r.ver;
    if (!r.ledger || !r.ledger.day.total) return 'no ledger';
    if (r.rooms !== r.rooms0 + (r.rs.cabin + r.rs.hut + r.rs.villa + r.rs.camp)) return 'rooms lifetime ' + r.rooms;
    if (r.meals !== r.meals0 + (r.rs.diner + r.rs.stall)) return 'meals lifetime ' + r.meals;
    if (!r.shopLine.includes(want)) return 'shop text missing ' + want + ' in ' + r.shopLine.replace(/\s+/g, ' ').slice(0, 400);
    if (/房费和菜钱一共/.test(r.shopLine)) return 'old wording still present';
    return null;
  });

  // 4–7. badge before/after, desktop and phone; after-click also checks reload
  for (const [name, vp, after] of [
    ['badge_before_desktop.png', { width: 1280, height: 800 }, false],
    ['badge_before_phone.png', { width: 390, height: 844 }, false],
    ['badge_after_desktop.png', { width: 1280, height: 800 }, true],
    ['badge_after_phone.png', { width: 390, height: 844 }, true],
  ]) {
    await shot(name, vp, async p => {
      await p.evaluate(`(() => { ${setup} ${readyTown} ${seedBusy}
        S.seenLove = 0; f.refreshUI();
        const hud = document.getElementById('loveHud');
        if (hud) { const r = hud.getBoundingClientRect(); window.scrollTo(0, 0); }
        return true; })()`);
      if (after) {
        await p.click('#loveHud'); await p.waitForTimeout(200);
        const mid = await p.evaluate(() => {
          const f = __farm, b = document.getElementById('loveNew'), tip = document.getElementById('loveTip');
          const say = document.getElementById('say'); if (say) say.hidden = true;
          const alb = document.getElementById('albumToast'); if (alb) alb.hidden = true;
          const snap = f.snapshot();
          return { shown: b && !b.hidden, seen: f.S.seenLove | 0, tip: tip && !tip.hidden, saved: !!(snap.settings && snap.settings.seenLove), ver: f.version };
        });
        await p.screenshot({ path: path.join(OUT, name) });
        mid.alreadyShot = true;
        // reload from the snapshot to prove the flag persists (after the photo)
        const save = await p.evaluate(() => __farm.snapshot());
        await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
        await p.reload(); await ready(p);
        await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
        mid.reload = await p.evaluate(() => {
          const b = document.getElementById('loveNew');
          return { shown: b && !b.hidden, seen: __farm.S.seenLove | 0, ver: __farm.version };
        });
        return mid;
      }
      return p.evaluate(() => {
        const b = document.getElementById('loveNew'), hud = document.getElementById('loveHud');
        const br = b && b.getBoundingClientRect(), hr = hud && hud.getBoundingClientRect();
        return { shown: b && !b.hidden, text: b && b.textContent, seen: __farm.S.seenLove | 0, ver: __farm.version,
          onScreen: !!(br && br.width > 0 && br.right <= innerWidth + 1), vw: innerWidth };
      });
    }, r => {
      if (r.ver && r.ver !== '5.11.0.39') return 'ver ' + r.ver;
      if (after) {
        if (r.shown) return 'badge still visible after click';
        if (!r.seen || !r.saved) return 'flag not saved ' + JSON.stringify(r);
        if (!r.tip) return 'panel did not open';
        if (!r.reload || r.reload.shown || !r.reload.seen) return 'badge came back after reload ' + JSON.stringify(r.reload);
        if (r.reload.ver !== '5.11.0.39') return 'reload ver ' + (r.reload && r.reload.ver);
        return null;
      }
      return !r.shown ? 'badge hidden before click'
        : r.text !== '← new' ? 'text ' + r.text
        : r.seen ? 'seen already set'
        : !r.onScreen ? 'badge off screen'
        : null;
    });
  }

  if (errs.length) { console.error('page errors', errs.slice(0, 8)); fails.push('page errors'); }
  console.log(fails.length ? ('FAILED ' + fails.join(' | ')) : 'diary-resort-shots: all ok');
  if (fails.length) process.exitCode = 1;
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
