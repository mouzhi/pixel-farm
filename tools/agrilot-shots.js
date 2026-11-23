// Screenshots + browser checks for v5.11.0.5 (农家乐区: the lodging gets its own district by the town gate, no plot is rezoned):
//   node tools/agrilot-shots.js [name-filter]        writes /workspace/pf-shots/agrilot_*.png (PF_SHOTS to change)
//   node tools/agrilot-shots.js --make-fixture       rewrites tools/fixtures/save-v15-inn-resort.json (a synthetic v5.11.0-style
//                                                    save: 民宿院 on 林间空地, 3 cabins, two-storey, restaurant + kitchen, guests,
//                                                    东南滩 resort with 2 huts). Never a real player's save.
//   exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const MAKE = process.argv.includes('--make-fixture'), only = MAKE ? null : (process.argv[2] || null);
const FIXTURE = path.join(__dirname, 'fixtures', 'save-v15-inn-resort.json');
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
  const shopText = `(() => { const shop = document.getElementById('shop'); return shop ? shop.innerText.replace(/\\s+/g, ' ') : ''; })()`;
  const cardTitles = `[...document.querySelectorAll('#shop .card b')].map(b => b.textContent.trim())`;
  const shot = async (name, fn, check, save, after) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    if (after && !(r && r.error)) { try { r = Object.assign(r || {}, await after(p)); } catch (e) { r = { error: String(e).slice(0, 400) }; } }
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // the synthetic old save: what a v5.11.0 player who had rezoned 林间空地 into 民宿院 would have
  const legacy = `${setup} ${readyTown}
    f.buyPlot('glade', 'meadow'); S.plots.glade = { mod: 'inn', day: S.day }; delete S.plots.glade.free;
    f.buyPlot('eshore', 'field'); S.plots.eshore = { mod: 'resort', day: S.day };
    Object.assign(S.inn, { cabins: 3, inn2: 1, job: null, arrived: S.day, _morn: S.day });
    S.inn.diner.lv = 2; S.inn.diner.served = 37; S.inn.resort.huts = 2; S.inn.resort.parasols = 3;
    S.inn.guests = [{ id: 'g' + S.day + '0', look: 'innB', n: 2, room: 1, from: S.day - 1, until: S.day + 1, at: 700, stay: 'inn' },
      { id: 'g' + S.day + '1', look: 'innE', n: 1, room: 4, from: S.day, until: S.day + 2, at: 650, stay: 'inn' },
      { id: 'b' + S.day + '0', look: 'beachC', n: 2, room: 1, from: S.day, until: S.day + 1, at: 660, stay: 'beach' }];
    S.inn.stars.last = [{ day: S.day - 3, s: 4, note: '羊好软' }, { day: S.day - 1, s: 5, note: '南瓜饼好吃' }]; S.inn.stars.avg = 4.5;
    S.inn.earn.rooms = 4200; S.inn.earn.meals = 2650; delete S.inn.where; delete S.inn.moved;`;

  if (MAKE) {
    const p = await page(null);
    const save = await p.evaluate(`(() => { ${legacy} const s = f.snapshot(); if (s.version) s.version = '5.11.0.1'; return s; })()`);
    if (save.inn.where || save.inn.moved || save.plots.glade.free) throw new Error('fixture is not a pre-v5.11.0.5 save');
    fs.writeFileSync(FIXTURE, JSON.stringify(save, null, 1) + '\n');
    console.log('wrote', FIXTURE, 'day', save.clock.day, 'plots', JSON.stringify(save.plots), 'inn', JSON.stringify({ c: save.inn.cabins, i: save.inn.inn2, d: save.inn.diner.lv, g: save.inn.guests.length, r: save.inn.resort }));
    console.log('errors', errs); if (errs.length) process.exitCode = 1; await b.close(); server.close(); return;
  }

  // 1. the 农家乐 tab before the town gate: no word about rezoning, it says where the district is
  await shot('agrilot_shop_tab_closed.png', `(() => { ${setup} f.buyPlot('eroad', 'road'); f.openInn && f.openInn(); f.refreshUI();
    return { site: f.innPlot(), town: !!(S.eff && S.eff.town), text: ${shopText}.slice(0, 700), titles: ${cardTitles} }; })()`,
    r => r.site !== null ? 'site before the town opened ' + r.site
      : /改建成民宿院|林间空地、南河湾/.test(r.text) ? 'still asks to rezone a plot'
      : !/农家乐区在镇门口/.test(r.text) ? 'no district text'
      : r.titles.some(t => /^[a-z0-9]+$/i.test(t)) ? 'raw id title ' + JSON.stringify(r.titles)
      : null);

  // 2. the 农家乐 tab once the town is open (the user's screenshot): district text, every card buildable or named, no raw ids
  await shot('agrilot_shop_tab.png', `(() => { ${setup} ${readyTown} f.openInn && f.openInn(); f.refreshUI();
    const v = f.innView();
    return { site: f.innPlot(), lv: f.townLv(), text: ${shopText}.slice(0, 900), titles: ${cardTitles},
      cabin: v.offers.find(o => o.id === 'cabin'), kitchen: v.offers.find(o => o.id === 'kitchen').name, inn2: v.offers.find(o => o.id === 'inn2').name, plots: JSON.stringify(S.plots) }; })()`,
    r => r.site !== 'agri' ? 'site ' + r.site
      : /改建成民宿院|林间空地、南河湾/.test(r.text) ? 'still asks to rezone a plot'
      : !/不用改建任何地块/.test(r.text) ? 'no district text'
      : !r.cabin.ok ? 'first cabin not buildable ' + JSON.stringify(r.cabin)
      : r.kitchen !== '厨房升级' || r.inn2 !== '二层客栈' ? 'names ' + r.kitchen + ' / ' + r.inn2
      : r.titles.some(t => /^[a-z0-9]+$/i.test(t) || /kitchen|inn2/.test(t)) ? 'raw id title ' + JSON.stringify(r.titles)
      : /"inn"/.test(r.plots) ? 'a plot got zoned inn'
      : null);

  // 3. building in the district with real purchases: 0/4 → 1/4 cabins, then the restaurant; no plot changes
  await shot('agrilot_district_build.png', `(() => { ${setup} ${readyTown}
    const plots0 = JSON.stringify(S.plots), c0 = S.coins;
    const r1 = f.innStart('cabin'); if (!r1.ok) return { error: 'cabin ' + r1.why };
    const v0 = f.innView(); nextMorning(); at(9 * 60);
    const r2 = f.innStart('diner'); if (!r2.ok) return { error: 'diner ' + r2.why };
    nextMorning(); at(10 * 60); dry(); f.advance(0.5, 10);
    const L = f.innLayout(); look(520, 60, 0); hide(); f.openInn && f.openInn(); f.refreshUI();
    const v = f.innView(), txt = ${shopText};
    return { cabins: S.inn.cabins, diner: S.inn.diner.lv, before: v0.cabins, paid: c0 - S.coins, plotsSame: JSON.stringify(S.plots) === plots0,
      progress: (txt.match(/现在 (\\d) \\/ 4 间小木屋/) || [])[1], props: (f.props || []).filter(q => q.inn && !q.lamp && !q.pot && !q.board).map(q => [Math.round(q.x), Math.round(q.y)]),
      rect: L && L.rect, close: (() => { const sh = document.getElementById('shop'); if (sh) sh.hidden = true; return 1; })() }; })()`,
    r => r.cabins !== 1 || r.diner !== 1 ? 'built ' + r.cabins + '/' + r.diner
      : r.before !== 0 ? 'progress started at ' + r.before
      : r.progress !== '1' ? 'shop progress ' + r.progress
      : !r.plotsSame ? 'a plot changed'
      : r.props.some(([x, y]) => x < r.rect[0] || x > r.rect[2] || y < r.rect[1] || y > r.rect[3]) ? 'a building outside the district ' + JSON.stringify(r.props)
      : null);

  // 4. the full district by day (4 cabins as a two-storey inn, the restaurant with both kitchen levels), north and south halves
  const full = `S.inn.cabins = 4; S.inn.inn2 = 1; S.inn.diner.lv = 3; S.inn.job = null; S.inn.arrived = 0; S.inn._morn = 0;
    f.IA.sync(true); f.markNavDirty(); f.innRepaint();`;
  await shot('agrilot_district_day.png', `(() => { ${setup} ${readyTown} ${full} at(11 * 60); dry(); f.advance(0.5, 10); look(520, 62, 0); hide();
    return { cabins: S.inn.cabins, inn2: S.inn.inn2, diner: S.inn.diner.lv, props: (f.props || []).filter(q => q.inn).length,
      g: [f.groundAt(490, 160)[1], f.groundAt(550, 160)[1], f.groundAt(520, 40)[1]] }; })()`,
    r => r.props < 20 ? 'props ' + r.props : r.g[0] !== 'dirt' || r.g[1] !== 'dirt' ? 'garden / square not painted ' + r.g : null);
  await shot('agrilot_district_south.png', `(() => { ${setup} ${readyTown} ${full} at(12 * 60); dry(); f.advance(0.5, 10); look(522, 138, 0); hide();
    return { diner: S.inn.diner.lv, tables: (f.props || []).filter(q => q.inn && q.table != null).length }; })()`,
    r => r.tables < 6 ? 'tables ' + r.tables : null);

  // 5. guests: arrive through the town gate, walk to a cabin in the district, sleep there, leave the next morning
  await shot('agrilot_guests_route.png', `(() => { ${setup} ${readyTown} ${full}
    S.inn.stars.avg = 5; at(9 * 60 + 50); dry(); f.innMorning(); const booked = (S.inn.guests || []).length;
    const L = f.innLayout(), inR = (x, y) => x >= L.rect[0] && x <= L.rect[2] && y >= L.rect[1] && y <= L.rect[3];
    until(() => (f.STAYS || []).length > 0, 600);
    const s0 = (f.STAYS || [])[0], from = s0 && { x: Math.round(s0.x), y: Math.round(s0.y) };
    const door = s0 && L.cabins[f.IN.cabinOf({ stay: 'inn', room: s0.room }, S.inn)].door;
    const route = s0 && f.routeVia(s0, door);
    at(20 * 60); until(() => (f.STAYS || []).length && (f.STAYS || []).every(g => g.inside), 900);
    const inside = (f.STAYS || []).filter(g => g.inside), near = inside.every(g => inR(g.x, g.y) && L.cabins.some(c => Math.hypot(g.x - c.door.x, g.y - c.door.y) < 8));
    look(520, 40, 0); hide(); const night = f.litBuilds ? f.litBuilds().length : 0;
    return { booked, from, door, route: route ? route.length : -1, inside: inside.length, near, stays: (f.STAYS || []).length, night }; })()`,
    r => r.booked < 1 ? 'no guests booked'
      : !r.from || Math.abs(r.from.x - 596) > 12 ? 'did not come in by the town gate ' + JSON.stringify(r.from)
      : r.route < 1 ? 'no route to the cabin'
      : r.inside < 1 || !r.near ? 'not asleep in a district cabin ' + JSON.stringify(r)
      : null);

  // 6. an old save whose lodging stood on a rezoned plot (the fixture): moved in place by counts, the plot is free to rezone once
  const fx = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : null;
  if (!fx) fails.push('missing fixture ' + FIXTURE);
  else {
    const want = { cabins: fx.inn.cabins, inn2: fx.inn.inn2, diner: fx.inn.diner.lv, served: fx.inn.diner.served, guests: fx.inn.guests.map(g => g.id + ':' + g.room).join(), stars: fx.inn.stars.last.length, earn: fx.inn.earn.rooms + fx.inn.earn.meals, huts: fx.inn.resort.huts, parasols: fx.inn.resort.parasols };
    await shot('agrilot_oldsave_migrated.png', `(() => { ${helpers} const s = f.snapshot(); at(11 * 60); dry(); f.advance(0.5, 10); look(520, 50, 0); hide();
      const I = S.inn, logTxt = (S.events || []).map(e => e.msg).concat(S.log || []).join('\\n');
      const o = f.rezoneOffer('glade', 'field');
      return { got: { cabins: I.cabins, inn2: I.inn2, diner: I.diner.lv, served: I.diner.served, guests: I.guests.map(g => g.id + ':' + g.room).join(), stars: I.stars.last.length, earn: I.earn.rooms + I.earn.meals, huts: I.resort.huts, parasols: I.resort.parasols },
        site: f.innPlot(), where: s.inn.where, moved: s.inn.moved, plot: s.plots.glade, resort: s.plots.eshore, notice: /民宿搬到镇门口的农家乐区/.test(logTxt), offer: o && { ok: o.ok, cost: o.cost, wood: o.wood, free: o.free },
        props: (f.props || []).filter(q => q.inn && q.cabin != null).length, sv: s.saveVersion, ver: f.version }; })()`,
      r => r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.36' ? 'ver ' + r.ver
        : JSON.stringify(r.got) !== JSON.stringify(want) ? 'lost progress ' + JSON.stringify(r.got) + ' want ' + JSON.stringify(want)
        : r.site !== 'agri' || r.where !== 'agri' || !r.moved ? 'not moved ' + JSON.stringify(r)
        : !r.plot || r.plot.mod !== 'inn' || r.plot.free !== 1 ? 'plot ' + JSON.stringify(r.plot)
        : !r.resort || r.resort.mod !== 'resort' ? 'resort plot touched ' + JSON.stringify(r.resort)
        : !r.notice ? 'no notice in the log'
        : !r.offer || !r.offer.ok || r.offer.cost !== 0 || r.offer.wood !== 0 ? 'rezone not free ' + JSON.stringify(r.offer)
        : r.props < 3 ? 'cabins not standing ' + r.props
        : null, fx);

    // the plot page offers the free rezone; doing it costs nothing; a reload neither repeats the notice nor frees it again
    await shot('agrilot_oldsave_free_rezone.png', `(() => { ${helpers} f.openPlot && f.openPlot('glade'); f.refreshUI(); return { text: ${shopText}.slice(0, 900) }; })()`,
      r => r.check ? r.check : !/免费改建一次|这次改建不要钱/.test(r.text) ? 'plot page: ' + r.text.slice(0, 200) : !/空院子/.test(r.text) ? 'no 空院子' : null, fx,
      async p => {
        const a = await p.evaluate(`(() => { const f = __farm, S = f.S; f.FARMER.wood = Math.min(f.FARMER.wood, f.woodCap() - 50); const c0 = S.coins, w0 = f.FARMER.wood; const r = f.rezonePlot('glade', 'field');
          const s = f.snapshot(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s));
          return { ok: r.ok, paid: c0 - S.coins + (r.back ? r.back.gold : 0), wood: w0 - f.FARMER.wood, plot: S.plots.glade, logN: S.log.length }; })()`);
        await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
        const b2 = await p.evaluate(`(() => { const S = __farm.S, logTxt = (S.events || []).map(e => e.msg).concat(S.log || []).join('\\n');
          return { plot: S.plots.glade, notices: (logTxt.match(/民宿搬到镇门口的农家乐区/g) || []).length, cabins: S.inn.cabins, offer: __farm.rezoneOffer('glade', 'meadow').cost }; })()`);
        return { rezone: a, reload: b2, check: !a.ok ? 'rezone failed' : a.paid !== 0 || a.wood !== 0 ? 'rezone cost ' + a.paid + '/' + a.wood : b2.plot.mod !== 'field' || b2.plot.free ? 'plot after ' + JSON.stringify(b2.plot) : b2.notices > 1 ? 'notice repeated' : !(b2.offer > 0) ? 'second rezone free' : b2.cabins !== want.cabins ? 'cabins' : null };
      });
  }

  // 7. no raw ids in the diary's purchases (every 农家乐 project has a name)
  await shot('agrilot_diary_names.png', `(() => { ${setup} ${readyTown} for (const id of ['cabin']) f.innStart(id);
    S.inn.job = null; S.inn.cabins = 1; for (const id of ['inn2', 'diner']) { const r = f.innStart(id); S.inn.job = null; if (id === 'diner') S.inn.diner.lv = 1; }
    f.innStart('kitchen'); S.inn.job = null;
    const v = f.diaryView ? f.diaryView(S.day) : null, txt = v ? (v.title + ' ' + v.lines.join(' ')) : '';
    return { txt: txt.slice(0, 600) }; })()`,
    r => !r.txt ? 'no diary' : /\\b(cabin|diner|kitchen|inn2|inn:)\\b/.test(r.txt) ? 'raw id in diary: ' + r.txt : !/二层客栈/.test(r.txt) ? 'inn2 purchase not named: ' + r.txt : null);

  for (const f0 of fails.slice()) void f0;
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
