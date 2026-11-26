// 小红书小工具 1.4.x（同步网页版 v5.12.1–v5.12.7）：手机截图 + 检查，跑在打好的包上（390×844 @3x，XHS UA，真触摸事件）。
//   bash platforms/xhs/pack.sh && node tools/xhs140-shots.js [name-filter]   writes $PF_SHOTS/xhs140_*.png (default /workspace/pf-shots)
// Checks the new web features on the phone layout: the shop's 体验 tab (tap the bar's 商店, tap 体验, five cards inside the screen, buy one by touch),
// the 镇公园 at R1 (镇公所 tab shows 繁荣度 6 and the 旅游大巴 card), grandkids around the 宅园 houses, tour buses in the reserved bays, the 宅园 pads;
// plus the touch chrome (xhs bar, no web 存档 button), game version / save v15, and the compact save of a farm with all of it < 64KB.
// Synthetic farms only: never loads a real player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'xhs140_';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('no platforms/xhs/dist: run bash platforms/xhs/pack.sh first'); process.exit(1); }
const server = http.createServer((req, res) => { const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const VER = (fs.readFileSync(path.join(DIST, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const WEBVER = (fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const APPV = JSON.parse(fs.readFileSync(path.join(__dirname, '../platforms/xhs/project.json'), 'utf8')).version;
fs.mkdirSync(OUT, { recursive: true });
const MOCK = `(() => { const mem = {}; const ok = v => Promise.resolve(v);
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: {
    getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); }, removeStorage: a => { delete mem[a.key]; return ok({}); },
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }),
    getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }), submitScore: () => ok({}), getRankList: () => ok({ data: [] }), getMyRank: () => ok({ rank: 1, score: 1, status: 'EXACT' }),
    getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({ follow_status: 1 }), share: () => ok({}), vibrateShort: () => ok({}) } }; })();`;
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page() { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 discover/9.53.3 XHS' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(MOCK); await p.goto(base + '/index.html?manual');
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && document.getElementById('xhs-bar'), null, { timeout: 30000 });
    await p.waitForTimeout(800);
    await p.evaluate(() => { const f = __farm; f.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
    p.cdp = await ctx.newCDPSession(p); return p; }
  const touch = async (p, x, y) => { await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(250); };
  const tapEl = async (p, sel) => { const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel);
    if (!r) throw new Error('no ' + sel); await touch(p, r.x, r.y); return r; };
  const H = `const f = __farm, S = f.S, HM = window.PFHome;
    const vis = e => { e = typeof e === 'string' ? document.querySelector(e) : e; if (!e || e.hidden) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; };
    const inside = e => { e = typeof e === 'string' ? document.querySelector(e) : e; const q = e.getBoundingClientRect(); return q.left >= -1 && q.right <= innerWidth + 1; };
    const saveBtns = () => [...document.querySelectorAll('button, .pbtn')].filter(e => vis(e) && /存档|保存进度|导出|导入/.test(e.textContent + ' ' + (e.title || ''))).map(e => e.id || e.textContent.trim());
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; }; const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const dry = () => { if (S.weather) { S.weather.rained = false; S.weather.rain = null; } };
    const look = (x, y, a) => { if (window.PFPlatform && PFPlatform.setFollow) PFPlatform.setFollow(false); f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const quiet = () => { const t = document.getElementById('toast'); if (t) t.hidden = true; for (const el of document.querySelectorAll('.toast,#albumToast,#albToast,#say')) el.style.display = 'none'; const x = document.getElementById('xhs-toast'); if (x) x.classList.remove('show'); };
    const openTown = () => { f.buyPlot('eroad', 'road'); if (!S.town) S.town = {}; if (!S.town.school) S.town.school = {}; S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); const r = f.buy('town'); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(2.2, 12); return r; };
    const stampLv5 = () => { const Hl = S.town.hall; const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      ids.forEach((id, i) => { Hl.built[id] = (S.day | 0) - (ids.length + 2) + i; }); f.applyUpgrades(); f.TA.sync(true); return f.hallView().lv; };
    const agri = () => { for (const id of ['cabin', 'diner']) { f.innStart(id); S.inn.job = null; } S.inn.cabins = 4; S.inn.diner.lv = 1; if (f.innRepaint) f.innRepaint(); f.fogUpdate && f.fogUpdate(true); f.advance(1, 12); };
    const buildPark = () => { at(9 * 60); const r = f.hallStart('park'); day(S.day + 1); at(7 * 60); f.hallTick(); f.TA.sync(true); return r; };
    const six = () => { buildPark(); S.town.hall.lv6 = S.day - 30; f.TA.sync(true); };
    const built = h => { if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); } };
    const reload = () => { f.restore(PFSave.validate(PFSave.compact(f.snapshot()))); };
    const base = () => { f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 2000000; f.FARMER.wood = 8000;
      for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
      day(120); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 1 }, { id: 'kid1', name: '小米', born: 3 }] }); f.syncFamily(); dry(); at(9 * 60); openTown(); stampLv5(); };
    const facts = () => { const snap = f.snapshot(), json = JSON.stringify(PFSave.compact(snap)); return { ver: f.version, sv: snap.saveVersion, bytes: new Blob([json]).size, bar: vis('#xhs-bar'), saveBtns: saveBtns() }; };`;
  const common = r => r.ver !== WEBVER ? 'game version ' + r.ver : r.sv !== 15 ? 'save v' + r.sv : r.bytes >= 65536 ? 'compact save ' + r.bytes : !r.bar ? 'xhs bar missing' : r.saveBtns && r.saveBtns.length ? 'a save button: ' + r.saveBtns : null;
  const step = async (p, name, fn, check) => { name = TAG + name; if (only && !name.includes(only)) return null; let r; try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, name) }); const bad = r && r.error ? r.error : common(r) || check(r);
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 1200)); if (bad) fails.push(name + ': ' + bad); return r; };
  const want = n => !only || (TAG + n).includes(only);

  // 1. 商店 → 体验 (v5.12.4) by touch: the tab row wraps inside the phone width, five cards, buy 果园采摘 with a tap
  if (want('shop_xp.png') || want('shop_xp_bought.png')) { const p = await page();
    await p.evaluate(`(() => { ${H} base(); f.buy('eastave'); agri(); at(11 * 60); f.refreshUI(); quiet(); })()`);
    await tapEl(p, '#xhs-btn-shop'); await tapEl(p, '#shop [data-tab="farmxp"]');
    await step(p, 'shop_xp.png', () => p.evaluate(`(() => { ${H} quiet(); const sh = document.getElementById('shop'), tabs = [...sh.querySelectorAll('.tabs .pbtn')];
      const cards = [...sh.querySelectorAll('.card')].filter(vis); sh.scrollTop = 0;
      return Object.assign(facts(), { open: vis(sh), on: (sh.querySelector('.tabs .pbtn.on') || {}).textContent, tabs: tabs.map(t => t.textContent).join(','), tabsInside: tabs.every(inside), cardsInside: cards.every(inside), cards: cards.length,
        names: cards.map(c => (c.querySelector('b') || {}).textContent).join(','), buy: !!sh.querySelector('[data-buy="xppick"]:not([disabled])') }); })()`),
      r => !r.open ? 'shop not open' : r.on !== '体验' ? 'tab ' + r.on : !r.tabsInside ? 'tabs overflow ' + r.tabs : !r.cardsInside ? 'cards overflow' : r.cards < 5 ? 'cards ' + r.cards : !r.buy ? 'xppick not buyable' : null);
    await tapEl(p, '#shop [data-buy="xppick"]');
    await step(p, 'shop_xp_bought.png', () => p.evaluate(`(() => { ${H} quiet(); return Object.assign(facts(), { up: S.up.xppick | 0, open: vis('#shop') }); })()`), r => r.up !== 1 ? 'xppick not bought by touch' : null);
    await p.context().close(); }

  // 2. 镇公园 (v5.12.3) at R1 + 繁荣度 6, then the 镇公所 tab in the phone shop: 旅游小镇 and 旅游大巴 cards
  if (want('park.png') || want('hall_tab.png')) { const p = await page();
    await step(p, 'park.png', () => p.evaluate(`(() => { ${H} base(); f.buy('eastave'); agri(); six(); dry(); at(16 * 60); look(781, -50, 0); quiet(); f.advance(0.4, 10);
      return Object.assign(facts(), { built: !!S.town.hall.built.park, lv: f.hallView().lv, props: f.props.filter(q => /^park:/.test(q.town || '')).length, ppl: f.parkPeople().length }); })()`),
      r => !r.built ? 'park not built' : r.lv < 6 ? 'lv ' + r.lv : r.props < 5 ? 'park props ' + r.props : null);
    await tapEl(p, '#xhs-btn-shop'); await tapEl(p, '#shop [data-tab="hall"]');
    await step(p, 'hall_tab.png', () => p.evaluate(`(() => { ${H} quiet(); const sh = document.getElementById('shop'), bus = sh.querySelector('[data-item="bus"]'), tour = sh.querySelector('[data-item="tour"]'); if (tour) tour.scrollIntoView({ block: 'start' });
      return Object.assign(facts(), { tour: tour && tour.textContent.slice(0, 80), bus: bus && bus.textContent.slice(0, 120), inside: !!bus && inside(bus) && inside(tour) }); })()`),
      r => !r.tour || !/旅游小镇/.test(r.tour) ? 'no tour card' : !r.bus || !/旅游大巴/.test(r.bus) ? 'no bus card' : !r.inside ? 'cards overflow' : null);
    await p.context().close(); }

  // 3. 宅园 (v5.12.1) + 第三代 (v5.12.5): two married kids in pad houses, their four children in the yard after school
  if (want('grandkids.png')) { const p = await page();
    await step(p, 'grandkids.png', () => p.evaluate(`(() => { ${H} base(); const hb = f.buyPlot('nhome', 'homestead'); if (!hb || !hb.ok) throw new Error('nhome ' + JSON.stringify(hb));
      for (let i = 0; i < 2; i++) { const r = f.buy('cottage'); if (!r.ok) throw new Error('cottage ' + i + ' ' + r.why); built(S.home.houses[i]); }
      S.home.wed = { kid0: { mate: 'm1', day: 40, moved: 40, house: 0 }, kid1: { mate: 'm0', day: 44, moved: 44, house: 1 } }; S.home.houses[0].kid = 'kid0'; S.home.houses[1].kid = 'kid1'; reload(); dry();
      S.home.g3 = { s: 40, d: S.day, k: { g0: { b: S.day - 20 }, g1: { b: S.day - 10 }, g2: { b: S.day - 3 }, g3: { b: S.day - 14 } } }; reload(); dry(); at(16 * 60 + 30);
      const d = HM.layout(S.home.houses[0]).door; look(d.x + 20, d.y + 4, 0); quiet(); f.advance(0.4, 10);
      const g = f.g3People(); return Object.assign(facts(), { g: g.map(q => q.name + ':' + q.where).join(','), n: g.length, pads: S.home.houses.length }); })()`),
      r => r.n < 3 ? 'grandkids ' + r.g : null);
    await p.context().close(); }

  // 4. 旅游大巴 (v5.12.6): both buses parked in the reserved bays at 繁荣度 6, visitors stepping off; phone camera on the lot
  if (want('bus.png')) { const p = await page();
    await step(p, 'bus.png', () => p.evaluate(`(() => { ${H} base(); f.buy('eastave'); f.buy('vacbeach'); agri(); six(); f.busReset();
      const go = T => { at(T); dry(); f.busReset(); f.advance(0.05, 10); at(T); f.advance(0.05, 10); };
      const pl = f.busPlan(), B = pl[1]; go(B.arrive + 3); look(1170, 150, 0); quiet(); go(B.arrive + 3);
      const buses = f.props.filter(q => q.eastBus).map(q => q.eastBus + ':' + q.busState + '@' + Math.round(q.x) + ',' + Math.round(q.y));
      return Object.assign(facts(), { n: pl.length, buses, vis: f.busVis().length }); })()`),
      r => r.n !== 2 ? 'plan ' + r.n : r.buses.filter(s => /:parked@/.test(s)).length !== 2 ? 'parked ' + r.buses : r.vis < 2 ? 'no visitors' : null);
    await p.context().close(); }

  // 5. everything at once (park, lv6, all 体验, buses, 宅园 + grandkids) a few days on: compact save v15 < 64KB and round-trips
  if (want('allnew_save.png')) { const p = await page();
    await step(p, 'allnew_save.png', () => p.evaluate(`(() => { ${H} base(); f.buy('eastave'); f.buy('vacbeach'); agri(); six(); for (const id of f.FXP.IDS) f.buy(id);
      f.buyPlot('nhome', 'homestead'); for (let i = 0; i < 2; i++) { f.buy('cottage'); built(S.home.houses[i]); }
      S.home.wed = { kid0: { mate: 'm1', day: 40, moved: 40, house: 0 }, kid1: { mate: 'm0', day: 44, moved: 44, house: 1 } }; S.home.houses[0].kid = 'kid0'; S.home.houses[1].kid = 'kid1';
      S.home.g3 = { s: 40, d: S.day, k: { g0: { b: S.day - 50 }, g1: { b: S.day - 30 }, g2: { b: S.day - 20 }, g3: { b: S.day - 14 } } }; reload();
      for (let d = 0; d < 3; d++) { const d0 = S.day; S.coins = Math.max(S.coins, 1e6); for (let i = 0; i < 4000 && S.day === d0; i++) f.advance(1, 10); }
      const c = PFSave.compact(f.snapshot()), m = PFSave.migrate(JSON.parse(JSON.stringify(c)));
      at(12 * 60); look(1170, 150, 0); quiet();
      return Object.assign(facts(), { rt: m.saveVersion === 15 && !!(m.town && m.town.hall && m.town.hall.built && m.town.hall.built.park) && !!(m.home && m.home.g3), bus: S.town.hall.bus | 0, xp: f.FXP.IDS.map(id => S.up[id] | 0).join('') }); })()`),
      r => !r.rt ? 'park / g3 lost on round-trip' : r.xp !== '11111' ? 'xp ' + r.xp : null);
    await p.context().close(); }

  console.log('app', APPV, 'game', VER); console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
