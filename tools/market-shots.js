// Screenshots + browser checks for v5.10.3 (集市: the market square, market day, 我来挑; yard things; tidy decor slots):  node tools/market-shots.js [name-filter]
//   writes /workspace/pf-shots/v5103_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, HL = require('../hall.js');
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await ready();
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const out = id => { const g = f.NEIGH.find(q => q.id === id); return g ? { out: g.out, spot: g.spot, x: Math.round(g.x), y: Math.round(g.y) } : null; };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 12 }] }); f.syncFamily(); dry();`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 600)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  const houses = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { f.hallStart(id); nextMorning(); at(9 * 60); } f.FARMER.wood = 400;`;
  const stalls = () => `(f.props || []).filter(q => q.town === 'stall').length`;

  // 1. the market goes up: bare stall frames the first day, six stalls and a bigger square the next morning
  await shot('v5103_market_build.png', `(() => { ${setup} ${houses} const lock0 = f.hallView().projects.find(p => p.id === 'market').why;
    const c0 = S.coins, r = f.hallStart('market'), frames = ${stalls()}, paid = c0 - S.coins; if (!r.ok) return { r, built: S.town.hall.built, job: S.town.hall.job, day: S.day }; nextMorning(); at(9 * 60); f.advance(1, 10); look(650, 118, 0);
    return { lock0, r, frames, paid, stalls: ${stalls()}, built: S.town.hall.built.market, next: f.marketView().next, log: S.events.map(e => e.msg).filter(m => /集市/.test(m)).slice(0, 3) }; })()`,
    r => !r.r.ok ? 'start ' + JSON.stringify(r.r) : r.paid !== 30000 ? 'paid ' + r.paid : r.frames !== 6 || r.stalls !== 6 ? 'stalls ' + r.frames + '/' + r.stalls : !r.built ? 'not built' : r.next % 7 ? 'next ' + r.next : null);
  // 2. market day: neighbours at their stalls, pedlars and shoppers on the square, a grown-up sells the basket at the family's stall
  await shot('v5103_market_day.png', `(() => { ${setup} ${houses} f.hallStart('market'); nextMorning(); const nx = f.marketView().next; day(nx); at(6 * 60 + 50); f.advance(1, 10);
    const add = ['carrot', 'carrot', 'carrot', 'egg', 'egg', 'carrot']; f.FARMER.crops.length = 0; f.FARMER.crops.push(...add); const c0 = S.coins;
    until(() => S.events.some(e => /在集市上卖了/.test(e.msg)), 900); const after = S.coins - c0;
    at(10 * 60); f.advance(3, 10); until(() => f.NEIGH.filter(q => /^stall:/.test(q.spot) && !q.moving).length >= 4, 600); look(650, 118, 0);
    return { day: S.day, isDay: f.marketDay(), at: f.NEIGH.filter(q => /^stall:/.test(q.spot)).map(q => q.name + ':' + q.spot), crowd: f.marketCrowd().length, after, left: f.FARMER.crops.length, mv: f.marketView(),
      log: S.events.map(e => e.msg).filter(m => /集市/.test(m)).slice(0, 4) }; })()`,
    r => !r.isDay ? 'not market day' : r.at.length < 4 ? 'stall keepers ' + r.at : r.crowd < 6 ? 'crowd ' + r.crowd : !(r.mv.days >= 1 && r.mv.extra > 0) ? 'no sale ' + JSON.stringify(r.mv) : null);
  // 3. the board: the market card, 「我来挑」 with the kinds, fish left at home
  await shot('v5103_market_board.png', `(() => { ${setup} ${houses} f.hallStart('market'); nextMorning(); f.refreshUI(); f.openHall(); f.refreshUI();
    const sh = document.getElementById('shop'); sh.querySelector('[data-mk="mode"]').click(); sh.querySelector('[data-mk="take:fish"]').click();
    sh.querySelector('[data-item="market"]').scrollIntoView(); const v = f.marketView();
    return { pick: v.pick, fish: v.take.fish, kinds: sh.querySelectorAll('[data-mk^="take:"]').length, txt: (sh.querySelector('[data-item="market"]') || {}).textContent }; })()`,
    r => r.pick !== 1 || r.fish !== 0 || r.kinds !== 5 ? JSON.stringify(r) : null);
  // 3b. market night: the square at dusk, stalls under the lamps
  await shot('v5103_market_night.png', `(() => { ${setup} ${houses} f.hallStart('market'); nextMorning(); at(20 * 60 + 30); f.advance(1, 10); look(650, 118, 0); return { stalls: ${stalls()} }; })()`, r => r.stalls !== 6 ? 'stalls ' + r.stalls : null);
  // 4. the yard things (v5.10.3): bought in the 「院子」 tab, the family sets them up; effects; the decor slots stay free
  const yardAll = `for (const id of ['cat', 'cat', 'dog', 'dog', 'sty', 'shed']) f.buy(id); const okSlots = () => ['lamppost', 'flowerpot', 'bench', 'scarecrow'].map(id => f.slotWhy(id).filter(q => !q[2]).length).join('/');
    const slots0 = okSlots(), auto0 = S.autoBuy; S.autoBuy = true; const bought = {}, c0 = S.coins;
    for (const id of f.YD.IDS) { let k = 0; while ((id !== 'roof' || k < 1) && f.buy(id).ok) k++; bought[id] = k; } S.autoBuy = auto0;
    const spent = c0 - S.coins; at(7 * 60); dry(); const t0 = S.t; until(() => (S.homeyard.put.mailbox | 0) > 0, 1500); const byFamily = { mailbox: S.homeyard.put.mailbox | 0, min: Math.round(S.t - t0) };
    let guard = 0; while (f.yardTodo() && guard++ < 200) f.yardSetup(f.yardTodo());`;
  await shot('v5103_yard_shop.png', `(() => { ${helpers} S.coins = 300; f.refreshUI(); document.getElementById('shopBtn').click(); f.refreshUI();
    const sh = document.getElementById('shop'); const tab = sh.querySelector('[data-tab="yard"]'); if (tab) tab.click(); f.refreshUI();
    const cards = [...sh.querySelectorAll('.card[data-item]')].map(c => c.dataset.item);
    S.autoBuy = true; S.coins = 200000; f.FARMER.wood = 400; f.buy('axe'); for (let d = 0; d < 4; d++) nextMorning();
    return { tab: !!tab, cards, icons: sh.querySelectorAll('.card i').length, auto: f.YD.IDS.filter(id => S.up[id] > 0) }; })()`,
    r => !r.tab ? 'no 院子 tab' : r.cards.length < 6 || !r.cards.includes('gravel') ? 'cards ' + r.cards : r.auto.length ? 'auto-bought ' + r.auto : null);
  await shot('v5103_yard_day.png', `(() => { ${setup} ${yardAll} at(10 * 60 + 30); dry(); f.advance(1, 10); look(70, 40, 0);
    return { bought, spent, byFamily, put: S.homeyard.put, todo: f.yardTodo() || null, mult: +f.priceMult().toFixed(3), walk: [f.yardWalk(36, 44), f.yardWalk(80, 54), f.yardWalk(40, 80)], clothes: f.clothesOut(),
      ground: f.groundAt(60, 54)[0], props: (f.props || []).filter(q => q.yard).length, slots: [slots0, okSlots()], beds: [f.petBed(false, 0), f.petBed(true, 1)],
      log: S.events.map(e => e.msg).filter(m => /信箱|小路|石板|栅栏|遮阳棚|盐砖|猫窝|狗屋|房顶/.test(m)).slice(0, 8) }; })()`,
    r => r.todo ? 'left ' + r.todo : !r.byFamily.mailbox ? 'family did not set up the mailbox' : r.mult !== 1.06 ? 'mult ' + r.mult : r.walk.join() !== '1.1,1.1,1' ? 'walk ' + r.walk : !r.clothes ? 'no clothes out' : r.slots[0] !== r.slots[1] ? 'slots ' + r.slots : r.put.saltlick !== 3 || r.put.catbed !== 2 || r.put.doghouse !== 2 ? 'room ' + JSON.stringify(r.put) : null);
  await shot('v5103_yard_night.png', `(() => { ${setup} ${yardAll} at(21 * 60); f.advance(1, 10); look(60, 44, 0);
    const pets = f.PETS_LIVE ? f.PETS_LIVE.length : 0; return { put: S.homeyard.put, clothes: f.clothesOut(), pets }; })()`, r => r.clothes ? 'clothes out at night' : null);
  await shot('v5103_yard_fence.png', `(() => { ${setup} ${yardAll} at(9 * 60); dry(); f.advance(1, 10); look(96, 66, 0); return { fence: S.homeyard.put.vegfence }; })()`, r => r.fence !== 20 ? 'fence' : null);
  await shot('v5103_yard_stall.png', `(() => { ${setup} ${yardAll} at(11 * 60); dry(); f.advance(1, 10); look(156, 100, 0); return { mult: +f.priceMult().toFixed(3) }; })()`, r => r.mult !== 1.06 ? 'mult' : null);
  // 4b. the night: straw +3 for the coop, a salt lick +2 for its pen, the letter now and then; a save round-trips `homeyard`
  await shot('v5103_yard_save.png', `(() => { ${setup} ${yardAll} const snap = f.SAVE.snapshot ? f.SAVE.snapshot() : null; const js = JSON.stringify(f.snapshot ? f.snapshot() : snap);
    const sv = JSON.parse(js); return { has: !!sv.homeyard, put: sv.homeyard && sv.homeyard.put, up: sv.upgrades && sv.upgrades.gravel }; })()`, r => !r.has || r.up !== 20 || !r.put || r.put.gravel !== 20 ? JSON.stringify(r) : null);
  // 8. (local only) the real day-82 save: the home yard by day and by night (PF_DECOR_TAG=before on the old code, after on this one)
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) { const save = readSave(process.env.PF_REAL_SAVE), tag = process.env.PF_DECOR_TAG || 'after';
    for (const [when, T] of [['day', 12 * 60], ['night', 21 * 60 + 30]]) await shot(`v5103_decor_${tag}${when === 'day' ? '' : '_night'}.png`, `(() => { const f = __farm, S = f.S; const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
      f.advance(1, 10); at(${T}); f.advance(0.5, 10); f.setAngle(0); f.panTo(104, 76); f.advance(0.3, 10); for (const id of ['leftBottom']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
      const c = {}, t = {}; for (const p of S.decor.placed) { c[p.id] = (c[p.id] || 0) + 1; t[p.id] = (t[p.id] || 0) + 1; } for (const [k, v] of Object.entries(S.decor.inv)) t[k] = (t[k] || 0) + v;
      return { placed: S.decor.placed.length, inv: Object.assign({}, S.decor.inv), by: c, total: t, layout: f.snapshot().settings.decorLayout }; })()`,
      tag === 'before' ? null : r => { const w = {}; for (const p of save.decor.placed) w[p.id] = (w[p.id] || 0) + 1; for (const [k, v] of Object.entries(save.decor.inv || {})) w[k] = (w[k] || 0) + v;
        return r.layout !== 2 ? 'layout flag' : JSON.stringify(Object.entries(r.total).sort()) !== JSON.stringify(Object.entries(w).sort()) ? 'counts changed ' + JSON.stringify(r.total) : null; }, save); }
  // 8b. (CI) the day-72 fixture with decorations strewn about the yard (as an old save had them): laid out once on load, counts kept, every piece on a spot of its kind
  { const save = readSave(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json')); delete (save.settings || {}).decorLayout;
    const strew = [['lamppost', 126, 100], ['lamppost', 132, 82], ['lamppost', 114, 16], ['stonelamp', 144, 124], ['stonelamp', 162, 70], ['flowerpot', 60, 64], ['flowerpot', 42, 76], ['flowerpot', 90, 106], ['flowerpot', 12, 88],
      ['bench', 54, 76], ['bench', 78, 100], ['scarecrow', 108, 112], ['birdbath', 120, 28], ['stringlights', 156, 124], ['carving', 78, 112], ['shell', 150, 70]];
    save.decor = Object.assign({ inv: {}, orders: [], party: { last: 0, at: 0, tonight: 0, guests: 0 }, got: {}, moon: 0 }, save.decor || {}); save.decor.placed = strew.map(([id, x, y], i) => ({ u: i + 1, id, x, y, d: 60 })); save.decor.n = strew.length + 1;
    const want = {}; for (const [id] of strew) want[id] = (want[id] || 0) + 1;
    for (const [when, T] of [['', 12 * 60], ['_night', 21 * 60 + 30]]) await shot(`v5103_decor_fixture${when}.png`, `(() => { const f = __farm, S = f.S; const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
      f.advance(0.5, 10); at(${T}); f.advance(0.3, 10); f.setAngle(0); f.panTo(104, 76); f.advance(0.3, 10); document.getElementById('leftBottom').style.visibility = 'hidden';
      const homes = f.slotHomes ? f.slotHomes() : [], c = {}, off = [];
      for (const p of S.decor.placed) { c[p.id] = (c[p.id] || 0) + 1; const sp = f.SLT.spotsFor(p.id, homes); if (!sp.some(q => Math.abs(q.x - p.x) < 0.6 && Math.abs(q.y - p.y) < 0.6)) off.push(p.id + '@' + p.x + ',' + p.y); }
      for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      return { counts: c, off, layout: f.snapshot().settings.decorLayout, placed: S.decor.placed.length, log: S.events.map(e => e.msg).filter(m => /重新摆/.test(m)) }; })()`,
      r => r.layout !== 2 ? 'flag' : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts ' + JSON.stringify(r.counts) : r.off.length ? 'off its spots ' + r.off : r.placed < 12 ? 'placed ' + r.placed : !r.log.length ? 'no log line' : null, save); }
  // 9. the fixtures and (local only) real saves load: hall gains an automatic market, nothing else changes
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) { const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5103_fixture_${fx}.png`, `(() => { const f = __farm, S = f.S; const s = f.snapshot(); f.advance(2, 10); const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v; for (const q of S.decor.orders) if (q.op === 'place' && q.id) c[q.id] = c[q.id]; 
      return { day: s.clock.day, market: s.town.hall.market, coins: s.coins, decor: S.decor.placed.length, counts: c, layout: f.snapshot().settings.decorLayout }; })()`,
      r => r.day !== save.clock.day ? 'day' : !r.market || r.market.pick !== 0 ? 'market ' + JSON.stringify(r.market) : r.layout !== 2 ? 'layout flag' : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'decor counts ' + JSON.stringify(r.counts) + ' vs ' + JSON.stringify(want) : null, save); }
  for (const REAL of [process.env.PF_REAL_SAVE, process.env.PF_FRIEND_SAVE].filter(Boolean)) if (fs.existsSync(REAL)) { const save = readSave(REAL), tag = REAL === process.env.PF_REAL_SAVE ? 'realsave' : 'friendsave';
    await shot(`v5103_${tag}.png`, `(() => { const f = __farm, S = f.S; const s = f.snapshot(); f.advance(2, 10); f.setAngle(0); f.panTo(650, 110); f.advance(0.3, 10);
      return { day: s.clock.day, town: !!(S.eff && S.eff.town), market: s.town.hall.market, view: f.hallView() && f.hallView().projects.map(p => p.id + ':' + (p.why || 'ok')), decor: S.decor.placed.length }; })()`, r => r.day !== save.clock.day ? 'day' : null, save); }
  // 10. (local only) the real save with every yard thing bought: set up beside the laid-out decorations, nothing moved
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) { const save = readSave(process.env.PF_REAL_SAVE);
    for (const [when, T] of [['', 11 * 60], ['_night', 21 * 60 + 30]]) await shot(`v5103_yard_realsave${when}.png`, `(() => { ${helpers} f.advance(1, 10); const before = JSON.stringify(S.decor.placed.map(p => [p.id, p.x, p.y]));
      S.coins += 30000; f.FARMER.wood = Math.max(f.FARMER.wood, 200); const n = {}; for (const id of f.YD.IDS) { let k = 0; while ((id !== 'roof' || k < 1) && f.buy(id).ok) k++; n[id] = k; }
      let g = 0; while (f.yardTodo() && g++ < 200) f.yardSetup(f.yardTodo()); at(${T}); dry(); f.advance(1, 10); look(96, 60, 0); document.getElementById('leftBottom').style.visibility = 'hidden';
      return { bought: n, put: S.homeyard.put, same: before === JSON.stringify(S.decor.placed.map(p => [p.id, p.x, p.y])), mult: +f.priceMult().toFixed(3) }; })()`, r => !r.same ? 'decor moved' : null, save); }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
