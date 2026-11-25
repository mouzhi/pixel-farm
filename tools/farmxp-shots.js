// Screenshots + browser checks for v5.12.4 (农场体验):  node tools/farmxp-shots.js [name-filter]
//   writes $PF_SHOTS/v5124_*.png (default /workspace/v5124-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/v5124-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'v5124_';
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, FXP = f.FXP;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) { S.weather.rained = false; S.weather.rain = null; } };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };
    const quiet = () => { const t = document.getElementById('toast'); if (t) t.hidden = true; for (const el of document.querySelectorAll('.toast,#albumToast,#albToast')) el.style.display = 'none'; };
    const openTown = () => { f.buyPlot('eroad', 'road'); if (!S.town) S.town = {}; if (!S.town.school) S.town.school = {}; S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); const r = f.buy('town'); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(2.2, 12); return r; };
    const stampLv5 = () => { const H = S.town.hall; const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      ids.forEach((id, i) => { H.built[id] = (S.day | 0) - (ids.length + 2) + i; }); f.applyUpgrades(); f.TA.sync(true); return f.hallView().lv; };
    const agri = () => { for (const id of ['cabin', 'diner']) { f.innStart(id); S.inn.job = null; } S.inn.cabins = 4; S.inn.diner.lv = 1; if (f.innRepaint) f.innRepaint();
      for (let k = 0; k < 4; k++) S.inn.guests.push({ id: 'g' + (S.day - 1) + k, look: ['innA', 'innB', 'innC', 'innD'][k], n: 3, room: k, from: S.day - 1, until: S.day + 1, at: 600, stay: 'inn' });
      f.fogUpdate && f.fogUpdate(true); f.advance(3, 12); };
    const buyAll = () => { const out = {}; for (const id of FXP.IDS) { const r = f.buy(id); out[id] = r.ok ? 1 : (r.why || r.reason); } f.xpfReset(); return out; };
    const props = k => f.props.filter(q => q.xp === k).length;`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(60); dry(); at(12 * 60); openTown(); stampLv5(); f.buy('eastave'); agri();`;
  const shot = async (name, vw, vh, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${setup} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const ver = r => r.ver !== VERSION ? 'ver ' + r.ver : r.sv && r.sv !== 15 ? 'saveVersion ' + r.sv : null;

  // 1. the shop's 体验 tab: five cards with the plan's prices; nothing bought yet; the gates read right on a farm with an inn
  const shopFn = `at(11 * 60); const btn = document.getElementById('shopBtn'); if (btn) btn.click();
    const tab = document.querySelector('#shop [data-tab="farmxp"]'); if (tab) tab.click(); f.refreshUI(); quiet();
    const cards = [...document.querySelectorAll('#shop .card')].map(c => c.textContent.replace(/\\s+/g, ' ').slice(0, 90));
    const offers = FXP.IDS.map(id => { const o = window.PFSim.offer(S.up, S.coins, id, f.FARMER.wood); return id + ':' + o.cost + '+' + o.wood + ':' + (o.ok ? 'ok' : o.lockText); });
    return { ver: f.version, sv: f.snapshot().saveVersion, tab: !!tab, cards: cards.length, offers, txt: cards.join(' | ').slice(0, 400) };`;
  const shopCk = r => ver(r) || (!r.tab ? 'no 体验 tab' : null) || (r.cards < 5 ? 'cards ' + r.cards : null)
    || (r.offers.join() !== 'xppick:8000+40:ok,xppet:10000+60:ok,xptour:15000+120:ok,xpcraft:12000+80:ok,xpphoto:6000+30:先建一个别的农场体验项目' ? 'offers ' + r.offers : null);
  await shot('shop.png', 1280, 800, shopFn, shopCk);
  await shot('shop_phone.png', 390, 844, shopFn, shopCk);

  // 2. everything bought: the 农家乐区 at 11:20 with visitors at the 手作坊 table, in the pen and at the arch; the truck out on its run
  const agriFn = `const bought = buyAll(); dry(); let m0 = 10 * 60; for (let m = 10 * 60; m < 14 * 60; m++) { at(m); f.xpfTick(); const a = f.xpfVis().filter(q => q.state === 'at').map(q => q.k); if (a.includes('xpcraft') && a.includes('xppet')) { m0 = m + 2; break; } }
    at(m0); look(520, 104, 0); hide(); quiet(); f.advance(0.3, 10); at(m0); f.xpfTick();
    const v = f.xpfView(), vis = f.xpfVis();
    return { ver: f.version, sv: f.snapshot().saveVersion, bought, counts: v.counts, pool: v.pool, earn: v.earn, tours: v.tours, dur: Math.round(v.dur),
      at: vis.filter(q => q.state === 'at').map(q => q.k).join(), props: ['pen', 'booth', 'craft', 'arch', 'crow', 'pick', 'picksign', 'truck'].map(k => k + ':' + props(k)).join(),
      ground: [f.groundAt(570, 115)[1], f.groundAt(488, 84)[1]], up: FXP.IDS.map(id => S.up[id] | 0).join('') };`;
  const agriCk = r => ver(r) || (Object.values(r.bought).some(x => x !== 1) ? 'buy ' + JSON.stringify(r.bought) : null) || (r.up !== '11111' ? 'up ' + r.up : null)
    || (r.pool < 12 ? 'pool ' + r.pool : null) || (r.earn < 500 || r.earn > 2000 ? 'earn ' + r.earn : null) || (!/xpcraft/.test(r.at) || !/xppet/.test(r.at) ? 'visitors at spots ' + r.at : null)
    || (/:0\b/.test(r.props) || !/pen:4/.test(r.props) ? 'props ' + r.props : null) || (r.ground.join() !== 'dirt,dirt' ? 'ground ' + r.ground : null) || (r.tours.length !== 2 ? 'tours ' + JSON.stringify(r.tours) : null);
  await shot('agri.png', 1280, 800, agriFn, agriCk);
  await shot('agri_phone.png', 390, 844, agriFn, agriCk);

  // 3. 果园采摘: pickers under the 果园坡's fruit trees at 12:30; the farm's own fruit is untouched
  const pickFn = `buyAll(); dry(); const fruit0 = JSON.stringify(S.trees.filter(t => t.kind !== 'wild').map(t => [t.id, t.ripe | 0, t.stage]));
    at(12 * 60 + 30); look(-80, -30, 0); hide(); quiet(); f.advance(0.3, 10); f.xpfTick();
    const vis = f.xpfVis().filter(q => q.k === 'xppick'), fruit1 = JSON.stringify(S.trees.filter(t => t.kind !== 'wild').map(t => [t.id, t.ripe | 0, t.stage]));
    return { ver: f.version, pickers: vis.length, at: vis.filter(q => q.state === 'at').length, pos: vis.map(q => Math.round(q.x) + ',' + Math.round(q.y) + ':' + q.state), same: fruit0 === fruit1, stand: props('pick') };`;
  const pickCk = r => ver(r) || (r.at < 1 ? 'no picker at a tree ' + r.pos : null) || (!r.same ? 'fruit changed' : null) || (r.stand !== 1 ? 'stand ' + r.stand : null);
  await shot('orchard.png', 1280, 800, pickFn, pickCk);

  // 4. the tour truck on the farm lane with riders aboard
  const tourFn = `buyAll(); dry(); at(10 * 60 + 20); f.xpfTick(); const p = f.xpfPlan(), t0 = p.tours[0].t0; at(t0 + Math.round(p.dur * 0.3)); f.xpfTick();
    const tr = f.FXA.truck()[0]; look(tr.x, tr.y, 0); hide(); quiet(); f.advance(0.2, 10); f.xpfTick(); const tr2 = f.FXA.truck()[0];
    return { ver: f.version, x: Math.round(tr2.x), y: Math.round(tr2.y), riders: p.tours[0].riders, model: f.FXA.models().truck.indexOf(tr2.m), dur: Math.round(p.dur), ground: f.groundAt(tr2.x, tr2.y)[1] };`;
  const tourCk = r => ver(r) || (r.riders < 1 || r.model !== r.riders ? 'riders ' + r.riders + ' model ' + r.model : null) || (r.x > 456 ? 'truck still in 农家乐 ' + r.x : null) || (r.dur < 20 || r.dur > 90 ? 'dur ' + r.dur : null);
  await shot('tour.png', 1280, 800, tourFn, tourCk);

  // 5. a whole day's takings: paid once per visit as the clock passes, the same after a reload mid-day (no double pay); tally logged overnight
  const payFn = `buyAll(); dry(); at(8 * 60); f.xpfTick(); const want = f.xpfView().earn, c0 = S.coins;
    for (let m = 8 * 60; m < 13 * 60; m += 2) { at(m); dry(); f.xpfTick(); }
    const mid = S.coins - c0; f.xpfReset(); f.xpfTick();
    for (let m = 13 * 60; m < 19 * 60; m += 2) { at(m); dry(); f.xpfTick(); }
    const got = S.coins - c0, tally = f.xpfView().tally; const sv = f.snapshot(); const bytes = JSON.stringify(sv).length;
    return { ver: f.version, sv: sv.saveVersion, want, mid, got, tally, bytes, up: Object.keys(sv.upgrades || {}).filter(k => /^xp/.test(k)).join() };`;
  const payCk = r => ver(r) || (r.got !== r.want ? 'paid ' + r.got + ' want ' + r.want : null) || (!(r.mid > 0 && r.mid < r.want) ? 'mid ' + r.mid : null) || (r.tally.gold !== r.want ? 'tally ' + JSON.stringify(r.tally) : null)
    || (r.bytes > 64 * 1024 ? 'save bytes ' + r.bytes : null);
  await shot('pay.png', 1280, 800, payFn, payCk);

  // 6. night: nobody out, the truck parked at its stand, the pen animals asleep in the corner
  const nightFn = `buyAll(); at(21 * 60); look(520, 104, 0); hide(); quiet(); f.advance(0.4, 10); f.xpfTick(); const tr = f.FXA.truck()[0];
    return { ver: f.version, vis: f.xpfVis().length, truck: tr && Math.round(tr.x) + ',' + Math.round(tr.y) };`;
  const nightCk = r => ver(r) || (r.vis ? 'visitors at night ' + r.vis : null) || (r.truck !== '487,84' ? 'truck ' + r.truck : null);
  await shot('night.png', 1280, 800, nightFn, nightCk);

  // 7. gates on a farm without an inn: every item explains what it needs; nothing is bought by the family on its own
  const gateFn = `S.inn.cabins = 0; S.inn.diner.lv = 0; S.inn.guests = []; const g = FXP.IDS.map(id => window.PFSim.offer(S.up, S.coins, id, f.FARMER.wood).lockText || 'ok');
    return { ver: f.version, g, auto: window.PFSim.AUTO_BUY.filter(id => /^xp/.test(id)).length };`;
  const gateCk = r => ver(r) || (!r.g.every(t => /民宿/.test(t)) ? 'gates ' + r.g : null) || (r.auto ? 'in AUTO_BUY' : null);
  await shot('gates.png', 1280, 800, gateFn, gateCk);

  await b.close(); server.close();
  if (errs.length || fails.length) { console.error('ERRORS', errs.concat(fails).join('\n')); process.exit(1); }
  console.log('ok  farmxp-shots  version', VERSION, '->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
