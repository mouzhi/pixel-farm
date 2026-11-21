// Screenshots + browser checks for v5.10.8 (海边度假村 + 二层客栈):  node tools/resort-shots.js [name-filter]
//   writes /workspace/pf-shots/v5108_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const REAL = process.env.PF_REAL_SAVE || '/workspace/pf-saves/day81-save-and-log.txt';
const FRIEND = process.env.PF_FRIEND_SAVE || '/workspace/pf-saves/friend/pixel-farm-save.json';
const FIX59 = path.join(ROOT, 'tools/fixtures/save-v10-day59-manor.json');
const FIX72 = path.join(ROOT, 'tools/fixtures/save-v15-day72-cottage.json');
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
    const lookBeach = (a) => { const L = f.innResortLayout && f.innResortLayout(); look((L && L.coast.center) ? L.coast.center.x : 272, (L && L.coast.center) ? L.coast.center.y : 236, a || 0); };
    const lookInn = (a) => { const L = f.innLayout && f.innLayout(); if (L) look(L.yard.x, L.yard.y + 8, a || 0); };
    const parkFam = () => { for (const a of f.actors()) { a.x = 40; a.y = 40; a.pts = []; a.task = null; a.moving = false; a.wait = 999; } };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 5000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can','searod']) f.buy(id);
    day(80); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();`;
  const readyTown = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    S.coins = Math.max(S.coins, 600000); f.FARMER.wood = 3000;
    for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' wood=' + f.FARMER.wood); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 3000); S.coins = Math.max(S.coins, 500000);`;
  const zoneInn = `if (!f.innPlot()) throw new Error('no inn site: the 农家乐区 opens with the town gate (v5.11.0.5), town=' + !!(S.eff && S.eff.town));`;
  const zoneResort = `let land = f.buyPlot('eshore', 'resort');
    if (!land.ok && !S.plots.eshore) { land = f.buyPlot('eshore', 'meadow'); }
    if (S.plots.eshore && S.plots.eshore.mod !== 'resort') { const z = f.rezonePlot('eshore', 'resort'); if (!z.ok) throw new Error('rezone resort: ' + (z.why || z.reason)); }
    if (!(f.IN && f.IN.resortPlotOf(S.plots))) throw new Error('no resort plot ' + JSON.stringify(land));
    if (!(S.eff.regions || []).includes('coast')) throw new Error('coast not bought');`;
  const raiseResort = `S.inn.resort = { huts: 4, parasols: 8, stall: 1, pier: 1, deck: 1 }; S.inn.job = null; S.inn.arrived = 0; S.inn._morn = 0;
    if (f.IA && f.IA.sync) f.IA.sync(true); f.markNavDirty && f.markNavDirty();`;
  const raiseInn2 = `S.inn.cabins = 4; S.inn.inn2 = 1; S.inn.diner.lv = Math.max(S.inn.diner.lv | 0, 1); S.inn.job = null;
    if (f.IA && f.IA.sync) f.IA.sync(true); f.markNavDirty && f.markNavDirty();`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 1000)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. beach day: 4 huts, 8 umbrellas, guests on the sand. Autobuy does not buy a hut.
  await shot('v5108_beach_day.png', `(() => { ${setup} ${readyTown} ${zoneResort}
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.innStart('hut'); if (!r.ok) return { r, lv: f.townLv(), why: r && r.why, coast: (S.eff.regions || []).includes('coast'), plot: f.IN.resortPlotOf(S.plots) };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood, same = S.inn.resort.huts;
    nextMorning(); at(9 * 60);
    ${raiseResort}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(13 * 60); dry();
    until(() => (f.STAYS || []).some(g => g.stay === 'beach' && !g.inside), 900);
    const auto = (S.autoBuy = true, f.autoBuyAtStall && f.autoBuyAtStall());
    const L = f.innResortLayout(), v = f.innView();
    parkFam();
    const us = L.parasols || [];
    let ui = 0;
    for (const s of (f.STAYS || []).filter(g => g.stay === 'beach' && !g.leaving)) {
      const u = us[ui++ % Math.max(1, us.length)] || L.coast.center;
      s.pts = []; s.x = u.x + 2; s.y = u.y + 3; s.what = 'lie'; s.task = { rest: 1 }; s.inside = false; s.moving = false;
    }
    lookBeach(0); hide();
    const looks = [...new Set((f.STAYS || []).filter(g => g.stay === 'beach').map(q => q.look))];
    return { r, paid, wood, same, huts: S.inn.resort.huts, parasols: S.inn.resort.parasols, stall: S.inn.resort.stall,
      pier: S.inn.resort.pier, deck: S.inn.resort.deck, stays: (f.STAYS || []).filter(g => g.stay === 'beach').length,
      looks, auto, ver: f.version, props: (f.props || []).filter(q => q.hut != null || q.parasol != null || q.stall || q.deck || q.pier).length,
      lv: f.townLv() }; })()`,
    r => r.ver !== '5.11.0.15' ? 'ver ' + r.ver
      : !r.r || !r.r.ok ? 'start hut ' + JSON.stringify(r.r)
      : r.paid !== 15000 || r.wood !== 200 ? 'hut cost ' + r.paid + '/' + r.wood
      : r.same !== 0 ? 'finished the same day'
      : r.huts !== 4 || r.parasols !== 8 ? 'not raised ' + r.huts + '/' + r.parasols
      : r.stays < 1 ? 'no beach guests'
      : r.looks.some(k => !/^beach[A-F]$/.test(k)) ? 'looks ' + JSON.stringify(r.looks)
      : r.looks.some(k => /guest[AB]|town|mate|inn[A-F]|partner|father/.test(k)) ? 'reused look'
      : r.auto && r.auto.id && /hut|parasol|stall|pier|deck|inn2/.test(String(r.auto.id)) ? 'autobuy bought resort ' + JSON.stringify(r.auto)
      : r.props < 10 ? 'too few props ' + r.props
      : r.lv < 3 ? 'lv ' + r.lv
      : null);

  // 2. sunset deck at evening, 18:00
  await shot('v5108_sunset_deck.png', `(() => { ${setup} ${readyTown} ${zoneResort} ${raiseResort}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(13 * 60); dry();
    until(() => (f.STAYS || []).some(g => g.stay === 'beach' && !g.inside), 700);
    at(18 * 60);
    const L = f.innResortLayout();
    parkFam();
    for (const s of (f.STAYS || []).filter(g => g.stay === 'beach' && !g.leaving)) {
      const seat = L.deck.sit[(s.room | 0) % L.deck.sit.length];
      s.pts = []; s.x = seat.x; s.y = seat.y; s.what = 'sunset'; s.task = { rest: 1 }; s.inside = false; s.moving = false;
    }
    f.advance(0.3, 10); look(L.deck.x, L.deck.y, 0); hide();
    const sitting = (f.STAYS || []).filter(g => g.what === 'sunset');
    return { t: S.t % 1440, deck: S.inn.resort.deck, sunset: f.IN.isSunset(S.t), fade: f.sunsetFade(S.t), sitting: sitting.length, stays: (f.STAYS || []).length, props: (f.props || []).filter(q => q.deck).length }; })()`,
    r => r.t < 17 * 60 || r.t >= 19 * 60 ? 'not sunset hour ' + r.t
      : !r.sunset ? 'isSunset false'
      : r.deck !== 1 ? 'no deck'
      : r.props < 1 ? 'no deck prop'
      : r.sitting < 1 ? 'no one on the deck'
      : (typeof r.fade === 'number' && r.fade < 0.9) ? 'fade not full at 18:00 ' + r.fade
      : null);

  // 2b. same hour, camera panned west onto the field / sea join — the wash must not show a box edge
  await shot('v5108_sunset_pan.png', `(() => { ${setup} ${readyTown} ${zoneResort} ${raiseResort}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(13 * 60); dry();
    until(() => (f.STAYS || []).some(g => g.stay === 'beach' && !g.inside), 700);
    at(18 * 60);
    const L = f.innResortLayout();
    parkFam();
    for (const s of (f.STAYS || []).filter(g => g.stay === 'beach' && !g.leaving)) {
      const seat = L.deck.sit[(s.room | 0) % L.deck.sit.length];
      s.pts = []; s.x = seat.x; s.y = seat.y; s.what = 'sunset'; s.task = { rest: 1 }; s.inside = false; s.moving = false;
    }
    f.advance(0.3, 10); look(L.deck.x - 52, L.deck.y + 6, 0.35); hide();
    return { t: S.t % 1440, sunset: f.IN.isSunset(S.t), fade: f.sunsetFade(S.t), deck: S.inn.resort.deck, angle: 0.35 }; })()`,
    r => r.t < 17 * 60 || r.t >= 19 * 60 ? 'not sunset hour ' + r.t
      : !r.sunset ? 'isSunset false'
      : r.deck !== 1 ? 'no deck'
      : (typeof r.fade === 'number' && r.fade < 0.9) ? 'fade not full at 18:00 ' + r.fade
      : null);

  // 2c. the home pond at 18:00 — same sheen as the sea, still reads as water
  await shot('v5108_sunset_pond.png', `(() => { ${setup} ${readyTown} ${zoneResort} ${raiseResort}
    at(18 * 60); dry(); parkFam();
    const P = f.POND; look(P.x, P.y, 0); hide();
    return { t: S.t % 1440, sunset: f.IN.isSunset(S.t), fade: f.sunsetFade(S.t), deck: S.inn.resort.deck, pond: !!(P && P.x) }; })()`,
    r => r.t < 17 * 60 || r.t >= 19 * 60 ? 'not sunset hour ' + r.t
      : !r.sunset ? 'isSunset false'
      : r.deck !== 1 ? 'no deck'
      : !r.pond ? 'no pond'
      : (typeof r.fade === 'number' && r.fade < 0.9) ? 'fade not full at 18:00 ' + r.fade
      : null);

  // 3. seafood stall (day, smoke)
  await shot('v5108_seafood_stall.png', `(() => { ${setup} ${readyTown} ${zoneResort} ${raiseResort}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(12 * 60); dry();
    for (const id of ['sardine','sardine','sardine','sardine','seabass','seabass','sardine','sardine']) f.FARMER.crops.push(id);
    S.inn.resort._meal = 0; if (f.innTick) f.innTick(1);
    const L = f.innResortLayout();
    parkFam();
    until(() => (f.STAYS || []).some(g => g.stay === 'beach' && !g.inside), 400);
    const eater = (f.STAYS || []).find(g => g.stay === 'beach' && !g.leaving);
    if (eater) { eater.pts = []; eater.x = L.stall.stand.x; eater.y = L.stall.stand.y + 1; eater.what = 'eat'; eater.task = { rest: 1 }; eater.inside = false; eater.moving = false; }
    f.advance(2.5, 12); look(L.stall.x, L.stall.y + 4, 0); hide();
    const v = f.innView();
    return { stall: S.inn.resort.stall, meals: v.earn.meals, props: (f.props || []).filter(q => q.stall).length, served: (S.inn.diner && S.inn.diner.served) | 0, eater: !!(eater) }; })()`,
    r => !r.stall ? 'no stall' : r.props < 1 ? 'no stall prop' : null);

  // 4. guest pier fishing (catch is not kept)
  await shot('v5108_pier_fish.png', `(() => { ${setup} ${readyTown} ${zoneResort} ${raiseResort}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(14 * 60); dry();
    const L = f.innResortLayout();
    until(() => (f.STAYS || []).some(g => g.stay === 'beach' && !g.inside), 700);
    const placeFisher = () => {
      const s = (f.STAYS || []).find(q => q.stay === 'beach' && !q.leaving) || (f.STAYS || []).find(q => q.stay === 'beach');
      if (!s) return null;
      s.pts = []; s.what = 'fish'; s.task = { kind: 'fish', hook: L.pier.hook }; s.x = L.pier.stand.x; s.y = L.pier.stand.y; s.inside = false; s.moving = false; s.wait = 80;
      return s;
    };
    placeFisher();
    const fish0 = f.FARMER.crops.filter(x => f.IN.isSeaFish(typeof x === 'string' ? x : (x && x.id))).length;
    f.advance(8, 10);
    const fish1 = f.FARMER.crops.filter(x => f.IN.isSeaFish(typeof x === 'string' ? x : (x && x.id))).length;
    parkFam();
    const fisher = placeFisher();
    look(L.pier.stand.x, L.pier.stand.y, 0); hide();
    return { pier: S.inn.resort.pier, props: (f.props || []).filter(q => q.pier).length, stays: (f.STAYS || []).length, fisher: fisher && { what: fisher.what, look: fisher.look, x: Math.round(fisher.x), y: Math.round(fisher.y) }, fish0, fish1 }; })()`,
    r => !r.pier ? 'no pier' : r.props < 1 ? 'no pier prop' : r.fish1 !== r.fish0 ? 'catch was kept' : r.stays < 1 ? 'no guests'
      : !(r.fisher && /^beach[A-F]$/.test(r.fisher.look)) ? 'fisher look ' + JSON.stringify(r.fisher)
      : null);

  // 5–6. two-storey inn day and night
  await shot('v5108_inn2_day.png', `(() => { ${setup} ${readyTown} ${zoneInn}
    S.inn.cabins = 1; S.coins = Math.max(S.coins, 80000); f.FARMER.wood = Math.max(f.FARMER.wood, 800);
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.innStart('inn2'); if (!r.ok) return { r, cabins: S.inn.cabins, why: r && r.why };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood, same = S.inn.inn2;
    nextMorning(); at(11 * 60); ${raiseInn2}
    dry(); lookInn(0); hide();
    return { r, paid, wood, same, inn2: S.inn.inn2, cabins: S.inn.cabins, rooms: f.IN.innRoomsOf(S.inn),
      props: (f.props || []).filter(q => q.cabin != null && q.inn2).length, ver: f.version }; })()`,
    r => !r.r || !r.r.ok ? 'start inn2 ' + JSON.stringify(r.r)
      : r.paid !== 60000 || r.wood !== 600 ? 'inn2 cost ' + r.paid + '/' + r.wood
      : r.same !== 0 ? 'finished the same day'
      : r.inn2 !== 1 ? 'not finished'
      : r.rooms !== 8 ? 'rooms ' + r.rooms
      : r.props < 1 ? 'no two-storey prop'
      : r.ver !== '5.11.0.15' ? 'ver ' + r.ver
      : null);

  await shot('v5108_inn2_night.png', `(() => { ${setup} ${readyTown} ${zoneInn} ${raiseInn2}
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(20 * 60); dry(); until(() => (f.STAYS || []).some(g => g.inside) || (f.STAYS || []).length === 0, 400);
    f.advance(2, 10); lookInn(0); hide();
    const lights = (f.litBuilds && f.litBuilds()) || [];
    return { t: S.t % 1440, inn2: S.inn.inn2, guests: (S.inn.guests || []).length, rooms: f.IN.innRoomsOf(S.inn), lights: lights.length, props: (f.props || []).filter(q => q.inn2).length }; })()`,
    r => r.t < 18 * 60 ? 'not night' : !r.inn2 ? 'no inn2' : r.rooms !== 8 ? 'rooms ' + r.rooms : r.props < 1 ? 'no two-storey prop' : r.lights < 3 ? 'too few lights ' + r.lights : null);

  // 7. fixtures: save stays v15, empty resort, version 5.10.8, decorations unchanged
  for (const [tag, file] of [['fixture_day59', FIX59], ['fixture_day72', FIX72]]) if (fs.existsSync(file)) {
    const save = JSON.parse(fs.readFileSync(file, 'utf8'));
    const src = save.save || save;
    const want = {}; for (const p0 of (src.decor && src.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((src.decor && src.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5108_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); at(11 * 60); dry(); look(96, 70, 0); hide();
      const c = {}; for (const p of (S.decor && S.decor.placed) || []) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries((S.decor && S.decor.inv) || {})) c[k] = (c[k] || 0) + v;
      const I = s.inn || {};
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, inn2: I.inn2 | 0, huts: I.resort && I.resort.huts | 0, guests: (I.guests || []).length, counts: c }; })()`,
      r => r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.15' ? 'ver ' + r.ver
        : r.inn2 !== 0 || r.huts !== 0 || r.guests !== 0 ? 'inn not empty ' + JSON.stringify(r)
        : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts' : null, src);
  }

  // 8. real save and the friend's save load
  for (const [tag, file] of [['realsave', REAL], ['friendsave', FRIEND]]) if (file && fs.existsSync(file)) {
    const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5108_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); at(11 * 60); dry(); look(96, 70, 0); hide();
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, inn: s2.inn && { cabins: s2.inn.cabins | 0, inn2: s2.inn.inn2 | 0, huts: s2.inn.resort && s2.inn.resort.huts | 0 }, counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.15' ? 'ver ' + r.ver
        : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts changed' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
