// Screenshots + browser checks for v5.10.7 (民宿 + 农家菜馆):  node tools/inn-shots.js [name-filter]
//   writes /workspace/pf-shots/v5107_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const REAL = process.env.PF_REAL_SAVE || '/workspace/pf-saves/day81-save-and-log.txt';
const FRIEND = process.env.PF_FRIEND_SAVE || '/workspace/pf-saves/friend/pixel-farm-save.json';
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
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); S.town.school.kid1 = Math.max(S.town.school.kid1 | 0, 3); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden'; };
    const Lof = () => f.innLayout && f.innLayout();
    const lookInn = (a) => { const L = Lof(); if (L) look(L.yard.x, L.yard.y + 8, a || 0); };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(70); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();`;
  const readyTown = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    S.coins = Math.max(S.coins, 400000); f.FARMER.wood = 2500;
    for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' wood=' + f.FARMER.wood); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 2500); S.coins = Math.max(S.coins, 300000);`;
  const wedMorning = `f.buyPlot('glade', 'meadow'); const cot = f.buy('cottage'); const h = S.home.houses[0]; if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); }
    S.home.rel.kid0 = { m0: 30, m1: 85, m2: 20 }; S.home.nb = Object.assign(S.home.nb || {}, { n3: 60, n2: 10, n8: 5 });
    day(S.day + 1); at(6 * 60 + 20); dry(); f.homeMorning();`;
  const zoneInn = `if (!f.innPlot()) throw new Error('no inn site: the 农家乐区 opens with the town gate (v5.11.0.5), town=' + !!(S.eff && S.eff.town));`;
  const raiseInn = `S.inn.cabins = 4; S.inn.diner.lv = 3; S.inn.job = null; S.inn.arrived = 0; S.inn._morn = 0;
    if (f.IA && f.IA.sync) f.IA.sync(true); f.markNavDirty && f.markNavDirty();`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. first cabin costs 20,000 + 300, family finishes it the next morning; autobuy does not buy it
  await shot('v5107_build_cabin.png', `(() => { ${setup} ${readyTown} ${zoneInn}
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.innStart('cabin'); if (!r.ok) return { r, lv: f.townLv(), plot: f.innPlot(), why: r && r.why };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood, same = S.inn.cabins;
    nextMorning(); at(9 * 60); if (f.IA) f.IA.sync(true);
    const auto = (S.autoBuy = true, f.autoBuyAtStall && f.autoBuyAtStall());
    lookInn(0); hide();
    const L = Lof();
    return { r, paid, wood, same, cabins: S.inn.cabins, diner: S.inn.diner.lv, job: S.inn.job, auto, lv: f.townLv(), plot: f.innPlot(),
      props: (f.props || []).filter(q => q.inn).length, ver: f.version, yard: L && { x: L.yard.x, y: L.yard.y } }; })()`,
    r => r.ver !== '5.12.8' ? 'ver ' + r.ver
      : !r.r || !r.r.ok ? 'start ' + JSON.stringify(r.r)
      : r.paid !== 20000 || r.wood !== 300 ? 'first cabin cost ' + r.paid + '/' + r.wood
      : r.same !== 0 ? 'finished the same day'
      : r.cabins !== 1 ? 'not finished next morning ' + r.cabins
      : r.auto && r.auto.id && /^inn/.test(String(r.auto.id)) ? 'autobuy bought inn ' + JSON.stringify(r.auto)
      : r.props < 1 ? 'no cabin prop'
      : r.lv < 3 ? 'lv ' + r.lv
      : null);

  // 2. four cabins and the restaurant, day, default south camera
  await shot('v5107_yard_day.png', `(() => { ${setup} ${readyTown} ${zoneInn} ${raiseInn}
    at(11 * 60); dry(); f.advance(1, 10); lookInn(0); hide();
    const L = Lof(), v = f.innView();
    return { cabins: S.inn.cabins, diner: S.inn.diner.lv, seats: v && v.seats, dishes: v && v.dishes,
      props: (f.props || []).filter(q => q.inn).length,
      tables: (f.props || []).filter(q => q.table != null || q.table === 0).length,
      L: L && { plot: L.plot, cx: L.cabins[0].x, cy: L.cabins[0].y, dx: L.diner.x, dy: L.diner.y } }; })()`,
    r => r.cabins !== 4 ? 'cabins ' + r.cabins
      : r.diner !== 3 ? 'diner ' + r.diner
      : r.seats !== 12 ? 'seats ' + r.seats
      : r.dishes < 6 ? 'dishes ' + r.dishes
      : r.props < 8 ? 'too few inn props ' + r.props
      : r.tables < 4 ? 'tables ' + r.tables
      : null);

  // 3. night: path lamps and occupied cabin windows
  await shot('v5107_yard_night.png', `(() => { ${setup} ${readyTown} ${zoneInn} ${raiseInn}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(20 * 60); dry(); until(() => (f.STAYS || []).some(g => g.inside) || (f.STAYS || []).length === 0, 400);
    f.advance(2, 10); lookInn(0); hide();
    const lights = (f.litBuilds && f.litBuilds()) || [];
    return { t: S.t % 1440, guests: (S.inn.guests || []).length, stays: (f.STAYS || []).length, inside: (f.STAYS || []).filter(g => g.inside).length, lights: lights.length }; })()`,
    r => r.t < 18 * 60 ? 'not night'
      : r.guests < 1 ? 'no booked guests'
      : r.lights < 3 ? 'too few lights ' + r.lights
      : null);

  // 4. restaurant tables close up
  await shot('v5107_diner.png', `(() => { ${setup} ${readyTown} ${zoneInn} ${raiseInn}
    at(12 * 60); dry(); f.advance(1, 10);
    const L = Lof(); look(L.diner.x, L.diner.door.y + 6, 0); hide();
    return { diner: S.inn.diner.lv, tables: (f.props || []).filter(q => q.table != null || q.table === 0).length, seats: f.innView().seats }; })()`,
    r => r.diner !== 3 ? 'diner' : r.tables < 4 ? 'tables ' + r.tables : r.seats !== 12 ? 'seats' : null);

  // 5. guests wandering the yard / fields by day
  await shot('v5107_guests_wander.png', `(() => { ${setup} ${readyTown} ${zoneInn} ${raiseInn}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(13 * 60); dry();
    until(() => (f.STAYS || []).some(g => !g.inside && !g.leaving), 800);
    const g = (f.STAYS || []).find(q => !q.inside) || (f.STAYS || [])[0];
    if (g) look(g.x, g.y, 0); else lookInn(0); hide();
    const looks = [...new Set((f.STAYS || []).map(q => q.look))];
    return { guests: (S.inn.guests || []).length, stays: (f.STAYS || []).length, looks, what: g && g.what, x: g && Math.round(g.x), y: g && Math.round(g.y) }; })()`,
    r => r.stays < 1 ? 'no guests on screen'
      : r.looks.some(k => !/^inn[A-F]$/.test(k)) ? 'looks not distinct ' + JSON.stringify(r.looks)
      : r.looks.some(k => /guest[AB]|town|mate|partner|father/.test(k)) ? 'reused family/neighbour look'
      : null);

  // 6. a guest fishing at the pond (does not take the fish)
  await shot('v5107_guests_fish.png', `(() => { ${setup} ${readyTown} ${zoneInn} ${raiseInn}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(14 * 60); dry();
    const stays = f.STAYS || [];
    if (!stays.length) until(() => (f.STAYS || []).length, 800);
    for (const a of f.actors()) { a.home = true; a.sleeping = true; a.x = 16; a.y = 40; a.task = null; }
    const s0 = (f.STAYS || [])[0];
    const pond = window.PFFish && PFFish.POND_SPOT && PFFish.POND_SPOT.stand || { x: 54, y: 94 };
    if (s0) { s0.pts = []; s0.inside = false; s0.leaving = false; s0.x = pond.x; s0.y = pond.y; s0.fx = -1; s0.fy = 0; s0.what = 'fish'; s0.task = { kind: 'fish', hook: { x: 40, y: 94 } }; s0.moving = false; s0.wait = 999; }
    const fish0 = (S.catches || []).length;
    f.advance(0.2, 10);
    look(pond.x, pond.y, 0); hide();
    const s = (f.STAYS || [])[0];
    return { stays: (f.STAYS || []).length, what: s && s.what, task: s && s.task && s.task.kind, fish: (S.catches || []).length - fish0, x: s && Math.round(s.x), y: s && Math.round(s.y) }; })()`,
    r => r.stays < 1 ? 'no guest'
      : r.task !== 'fish' && r.what !== 'fish' ? 'not fishing ' + JSON.stringify(r)
      : r.fish !== 0 ? 'guest took a fish'
      : null);

  // 7. guestbook + stars in the family panel, and the 农家乐 shop tab with 我来挑
  await shot('v5107_guestbook.png', `(() => { ${setup} ${readyTown} ${zoneInn} ${raiseInn}
    S.inn.stars.last = [{ day: S.day - 2, s: 5, note: '羊好软' }, { day: S.day - 1, s: 4, note: '南瓜饼好吃' }];
    S.inn.stars.avg = 4.5;
    f.refreshUI(); const hud = document.getElementById('loveHud'); if (hud) hud.click();
    const tip = document.getElementById('loveTip');
    f.openInn && f.openInn();
    const shop = document.getElementById('shop');
    const txt = ((tip && tip.innerText) || '') + ' ' + ((shop && shop.innerText) || '');
    return { tip: tip && !tip.hidden, shop: shop && !shop.hidden, tab: !!(shop && /农家乐|小木屋|留言/.test(shop.innerText || '')),
      book: /羊好软|南瓜饼|留言/.test(txt), stars: /★/.test(txt), pick: /我来挑/.test((shop && shop.innerText) || ''),
      v: f.innView() && { stars: f.innView().stars, book: f.innView().book.length, auto: f.innView().auto } }; })()`,
    r => !r.book ? 'guestbook missing'
      : !r.stars ? 'no stars'
      : !r.tab ? 'no 农家乐 tab'
      : !r.pick ? 'no 我来挑'
      : !r.v || r.v.book < 2 ? 'book ' + JSON.stringify(r.v)
      : null);

  // 8. career choice includes 经营民宿 / 菜馆 (same modal, fourth option)
  await shot('v5107_career_inn.png', `(() => { ${setup} ${readyTown} ${zoneInn}
    const b = f.innStart('cabin'); if (!b.ok) return { b };
    nextMorning(); at(9 * 60);
    ${wedMorning.replace('f.buyPlot(\'glade\', \'meadow\'); const cot = f.buy(\'cottage\'); const h = S.home.houses[0]; if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); }', 'if (!S.plots.glade) f.buyPlot(\'glade\', \'meadow\'); const cot = f.buy(\'cottage\'); const h = S.home.houses[0]; if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); }')}
    const box = document.getElementById('career');
    const opts = [...(box ? box.querySelectorAll('[data-way]') : [])].map(el => el.getAttribute('data-way') + (el.classList.contains('on') ? '*' : '') + (el.disabled ? '!' : ''));
    const v = f.careerView('kid0', 'wedding');
    const innOpt = v && v.options && v.options.find(o => o.way === 'inn');
    return { hidden: !box || box.hidden, opts, title: box && box.querySelector('h3') && box.querySelector('h3').textContent,
      inn: innOpt && { title: innOpt.title, ok: innOpt.ok, why: innOpt.why }, cabins: S.inn.cabins, plot: f.innPlot(), lv: f.townLv() }; })()`,
    r => r.hidden ? 'modal hidden'
      : !r.opts.includes('farm') || !r.opts.includes('work*') && !r.opts.includes('work') || !r.opts.find(s => s.startsWith('shop')) ? 'base opts ' + JSON.stringify(r.opts)
      : !r.opts.find(s => s.startsWith('inn')) ? 'missing inn option ' + JSON.stringify(r.opts)
      : r.opts.find(s => s.startsWith('inn') && s.endsWith('!')) ? 'inn locked ' + JSON.stringify(r)
      : !r.inn || !r.inn.ok ? 'inn option ' + JSON.stringify(r.inn)
      : !/民宿|菜馆/.test((r.inn && r.inn.title) || '') ? 'title ' + (r.inn && r.inn.title)
      : r.cabins < 1 ? 'need a cabin for the option'
      : null);

  // 9. fixtures load: save stays v15, empty inn, version 5.10.9, decorations unchanged
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5107_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); look(96, 60, 0);
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      const inn = s.inn || {};
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, cabins: inn.cabins | 0, diner: inn.diner && inn.diner.lv, guests: (inn.guests || []).length, inn2: inn.inn2 | 0, resort: inn.resort, counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.12.8' ? 'ver ' + r.ver
        : r.cabins !== 0 || (r.diner | 0) !== 0 || r.guests !== 0 ? 'inn not empty ' + JSON.stringify(r)
        : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts' : null, save);
  }

  // 10. real save and the friend's save load
  for (const [tag, file] of [['realsave', REAL], ['friendsave', FRIEND]]) if (file && fs.existsSync(file)) {
    const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5107_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); at(11 * 60); dry(); look(96, 70, 0); hide();
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, town: !!(S.eff && S.eff.town), inn: s2.inn && { cabins: s2.inn.cabins, diner: s2.inn.diner && s2.inn.diner.lv }, counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.12.8' ? 'ver ' + r.ver
        : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts changed' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
