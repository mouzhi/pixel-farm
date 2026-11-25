// Screenshots + browser checks for v5.10.0 (镇公所, the board, the first two-storey houses, gifts to the town):  node tools/hall-shots.js [name-filter]
//   writes /workspace/pf-shots/v5100_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, HL = require('../hall.js');
const readSave = f => { const r = JSON.parse(fs.readFileSync(f, 'utf8')); return r.save || r; };
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

  // 1. the town just opened: 镇公所 next to the shop, its notice board, a post box, a cart, crates, a sun shade; 镇长 at the hall door
  await shot('v5100_town_open.png', `(() => { ${setup} const ok = openTown(); at(10 * 60); f.advance(3, 10); until(() => (out('n4') || {}).spot === 'hall' && !f.NEIGH.find(q => q.id === 'n4').moving, 300); look(768, 50, 0);
    return { ok, hall: f.TA.state().hall, props: f.props ? f.props.filter(q => q.town === 'board' || q.town === 'mailbox' || q.town === 'cart' || q.town === 'parasol' || q.town === 'crates').length : null, mayor: out('n4'), people: f.NEIGH.length, h: S.town.hall }; })()`,
    r => !r.ok ? 'town not bought' : r.mayor && r.mayor.spot !== 'hall' ? 'mayor ' + JSON.stringify(r.mayor) : !r.mayor ? 'no mayor' : r.people !== 5 ? 'people ' + r.people : r.props !== null && r.props !== 5 ? 'props ' + r.props : null);
  // 2. the board (shop tab 镇公所): prosperity, sixteen projects with prices (v5.12.3: + 镇公园) (market and bakery locked until prosperity 2, the workshop, smithy, school and library until 3), gifts from the storehouse and the yard
  await shot('v5100_board.png', `(() => { ${setup} openTown(); S.decor.inv.lamppost = 2; S.decor.inv.bench = 1; f.refreshUI(); f.openHall(); f.refreshUI();
    const sh = document.getElementById('shop'), tab = sh.querySelector('[data-tab="hall"].on');
    return { tab: !!tab, cards: sh.querySelectorAll('[data-hall^="start:"]').length, enabled: sh.querySelectorAll('[data-hall^="start:"]:not([disabled])').length, give: sh.querySelectorAll('[data-hall^="give:"]').length, txt: sh.textContent.replace(/\\s+/g, ' ').slice(0, 200) }; })()`,
    r => !r.tab ? 'no hall tab' : r.cards !== 16 || r.enabled !== 3 ? 'cards ' + r.cards + '/' + r.enabled : r.give !== 2 ? 'gift rows ' + r.give : !/繁荣度/.test(r.txt) ? 'no prosperity' : null);
  // 2b. before the town is open there is no hall tab
  await shot('v5100_board_locked.png', `(() => { ${setup} f.refreshUI(); document.getElementById('shopBtn').click(); f.refreshUI(); return { tab: !!document.querySelector('#shop [data-tab="hall"]'), start: f.hallStart('L5') }; })()`,
    r => r.tab ? 'hall tab before the town' : r.start.ok ? 'started before the town' : null);
  // 3. a project starts: paid for, scaffolding on the lot, 阿松 on site during the day
  await shot('v5100_scaffold.png', `(() => { ${setup} openTown(); at(9 * 60); const c0 = S.coins, w0 = f.FARMER.wood;
    document.getElementById('shopBtn').click(); f.openHall(); f.refreshUI(); document.querySelector('#shop [data-hall="start:L5"]').click(); document.getElementById('shopBtn').click();
    at(11 * 60); f.advance(2, 10); until(() => (out('n2') || {}).spot === 'site:L5' && !f.NEIGH.find(q => q.id === 'n2').moving, 400); look(940, -20, 0);
    return { job: S.town.hall.job, paid: c0 - S.coins, wood: w0 - f.FARMER.wood, hall: f.TA.state().hall, builder: out('n2'), log: S.events.map(e => e.msg).filter(m => /开工/.test(m)).slice(0, 1) }; })()`,
    r => !r.job || r.job.id !== 'L5' ? 'no job' : r.paid !== 8000 || r.wood !== 120 ? 'paid ' + r.paid + '/' + r.wood : r.hall !== 1 ? 'scaffold props ' + r.hall : !r.builder || r.builder.spot !== 'site:L5' ? 'builder ' + JSON.stringify(r.builder) : !r.log.length ? 'no log' : null);
  // 4. all three built (one a night), prosperity 2, the new families out on the street in the afternoon
  await shot('v5100_three_houses.png', `(() => { ${setup} openTown(); at(9 * 60);
    const seen = []; for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); seen.push(r.ok); nextMorning(); at(9 * 60); }
    at(15 * 60 + 30); f.advance(2, 10); until(() => f.NEIGH.filter(q => q.out && !q.moving).length >= 6, 600); look(900, 10, 0);
    const v = f.hallView();
    return { seen, built: Object.keys(S.town.hall.built), lv: v.lv, people: v.people, out: f.NEIGH.filter(q => q.out).map(q => q.name + ':' + q.spot), hall: f.TA.state().hall, log: S.events.map(e => e.msg).filter(m => /盖好了|繁荣度/.test(m)) }; })()`,
    r => r.seen.some(x => !x) ? 'start failed ' + r.seen : r.built.length !== 3 ? 'built ' + r.built : r.lv !== 2 ? 'prosperity ' + r.lv : r.people !== 8 ? 'people ' + r.people : r.out.length < 6 ? 'out ' + r.out.length : !r.log.some(m => /繁荣度升到 2/.test(m)) ? 'no level-up log' : null);
  // 5. gifts along the main street, a summer evening: gift lamps lit without the water wheel, new houses' windows lit
  await shot('v5100_gifts_night.png', `(() => { ${setup} openTown(); for (const id of ['L5', 'L8']) { f.hallStart(id); nextMorning(); }
    S.decor.inv.lamppost = 3; S.decor.inv.stonelamp = 1; S.decor.inv.bench = 1; S.decor.inv.party = 1; const res = [];
    for (const id of ['lamppost', 'lamppost', 'lamppost', 'stonelamp', 'bench', 'party']) res.push(f.hallGive(id).ok);
    at(20 * 60 + 15); f.advance(1, 10); look(780, 60, 0);
    const L = HLL => HLL.lightsAt(S.town.hall, S.t, window.PFDecor.CATALOG).length;
    return { res, gifts: S.town.hall.gifts, inv: S.decor.inv, lights: L(f.HL), hall: f.TA.state().hall }; })()`,
    r => r.res.join() !== 'true,true,true,true,true,false' ? 'give ' + r.res : r.gifts.length !== 5 ? 'gifts ' + r.gifts : r.lights !== 4 + 2 + 1 ? 'lights ' + r.lights : (r.inv.lamppost | 0) !== 0 || r.inv.party !== 1 ? 'inv ' + JSON.stringify(r.inv) : null);
  // 6. a gift from the yard (a crowded yard gets a little room back); and the weekly paper in the log
  await shot('v5100_paper.png', `(() => { ${setup} openTown(); at(9 * 60); f.advance(1, 10); S.decor.placed.push({ u: 900, id: 'lamppost', x: 120, y: 90, d: S.day }); const n0 = S.decor.placed.length;
    const r = f.hallGive('lamppost', 900), n1 = S.decor.placed.length; f.hallStart('L5'); const d0 = S.day; for (let i = 0; i < 8; i++) nextMorning(); at(8 * 60); f.advance(1, 10);
    const paper = S.events.map(e => e.msg).filter(m => /镇子小报/.test(m)); look(780, 60, 0);
    return { yard: r.ok, placed: n0 - n1, gifts: S.town.hall.gifts, paper: paper.slice(0, 2), days: S.day - d0 }; })()`,
    r => !r.yard || r.placed !== 1 || r.gifts.length !== 1 ? 'yard gift ' + JSON.stringify(r) : !r.paper.length ? 'no paper' : !/木构二层小楼盖好了/.test(r.paper[r.paper.length - 1]) || !/1 件装饰/.test(r.paper[r.paper.length - 1]) ? 'paper text ' + r.paper : null);
  // 7. the fixtures: day 59 (town not bought) and day 72 (the cottage) load with an empty hall, no tab, nothing else changed
  for (const [f, name] of [['save-v10-day59-manor.json', 'v5100_fixture_day59.png'], ['save-v15-day72-cottage.json', 'v5100_fixture_day72.png']]) {
    const save = readSave(path.join(__dirname, 'fixtures', f));
    await shot(name, `(() => { const f = __farm, S = f.S, s = f.snapshot(); f.advance(30, 10); f.refreshUI(); document.getElementById('shopBtn').click(); f.refreshUI();
      return { day: s.clock.day, hall: s.town.hall, tab: !!document.querySelector('#shop [data-tab="hall"]'), coins: s.coins, animals: s.animals.length }; })()`,
      r => r.day !== save.clock.day ? 'day' : JSON.stringify(r.hall) !== JSON.stringify(HL.empty()) ? 'hall ' + JSON.stringify(r.hall) : r.tab !== !!(save.upgrades && save.upgrades.town) ? 'tab' : r.animals !== save.animals.length ? 'animals' : null, save); }
  // 8. (local only) the player's own save, with the town open: the board and the town at noon
  const REAL = process.env.PF_REAL_SAVE;
  if (REAL && fs.existsSync(REAL)) { const save = readSave(REAL);
    await shot('v5100_realsave.png', `(() => { const f = __farm, S = f.S; const s = f.snapshot(); at0 = 0; f.advance(5, 10); f.setAngle(0); f.panTo(780, 70); f.advance(0.3, 10);
      return { day: s.clock.day, town: !!(S.eff && S.eff.town), hall: S.town.hall, view: f.hallView() && f.hallView().projects.map(p => p.id + ':' + (p.why || 'ok')) }; })()`, r => r.day !== save.clock.day ? 'day' : null, save); }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
