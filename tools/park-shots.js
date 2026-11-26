// Screenshots + browser checks for v5.12.3 (繁荣度 6 · 镇公园 · 镇民家庭):  node tools/park-shots.js [name-filter]
//   writes $PF_SHOTS/v5123_*.png (default /workspace/v5123-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/v5123-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'v5123_';
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, PK = f.PK;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) S.weather.rained = false; if (f.WX && S.weather) S.weather.rain = null; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };
    const openTown = () => { f.buyPlot('eroad', 'road'); if (!S.town) S.town = {}; if (!S.town.school) S.town.school = {}; S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); const r = f.buy('town'); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(2.2, 12); return r; };
    const stampLv5 = () => { const H = S.town.hall; const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      ids.forEach((id, i) => { H.built[id] = (S.day | 0) - (ids.length + 2) + i; }); f.applyUpgrades(); f.TA.sync(true); return f.hallView().lv; };
    const buildPark = () => { at(9 * 60); const r = f.hallStart('park'); day(S.day + 1); at(7 * 60); f.hallTick(); f.TA.sync(true); return r; };
    const parkProps = () => f.props.filter(q => /^park:/.test(q.town || '')).length;
    const r1Sign = () => f.props.some(q => q.lot === 'R1');
    const quiet = () => { const t = document.getElementById('toast'); if (t) t.hidden = true; for (const el of document.querySelectorAll('.toast,#albumToast,#albToast')) el.style.display = 'none'; };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can']) f.buy(id);
    day(60); dry(); at(12 * 60); openTown(); stampLv5();`;
  const shot = async (name, vw, vh, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${setup} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const ver = r => r.ver !== '5.12.10' ? 'ver ' + r.ver : r.sv && r.sv !== 15 ? 'saveVersion ' + r.sv : null;

  // 1. level 5, park not built: R1 still a signposted empty lot; the board offers 镇公园 and says what level 6 needs
  const boardFn = `at(11 * 60); look(781, -50, 0); hide(); const v0 = f.hallView(), park = v0.projects.find(p => p.id === 'park');
    f.openHall(); f.refreshUI(); const sh = document.getElementById('shop'); const card = sh.querySelector('[data-item="tour"]'), top = sh.querySelector('.stars'); if (top) top.closest('.sec').scrollIntoView({ block: 'start' });
    return { ver: f.version, sv: f.snapshot().saveVersion, lv: v0.lv, park: park && { why: park.why, cost: park.cost, wood: park.wood }, sign: r1Sign(), props: parkProps(), tour: !!card, txt: card ? card.textContent.slice(0, 160) : '', ground: f.groundAt(781, -57)[1] };`;
  const boardCk = r => ver(r) || (r.lv !== 5 ? 'lv ' + r.lv : null) || (!r.park || r.park.why !== null || r.park.cost !== 36000 || r.park.wood !== 200 ? 'park project ' + JSON.stringify(r.park) : null)
    || (!r.sign ? 'R1 sign gone before the park' : null) || (r.props ? 'park props before building' : null) || (!r.tour || !/建好镇公园/.test(r.txt) ? 'tour card ' + r.txt : null) || (r.ground !== 'grass' ? 'R1 ground ' + r.ground : null);
  await shot('board_lv5.png', 1280, 800, boardFn, boardCk);

  // 2. the park built (real path: board -> next morning), the avenue bought: level 6 reached; the town families' children in the park after school
  const parkFn = `const st = buildPark(); f.buy('eastave'); f.parkMorning(); const lv6 = S.town.hall.lv6, lvA = f.hallView().lv;
    S.town.hall.lv6 = S.day - 30; dry(); at(16 * 60 + 40); look(781, -58, 0); hide(); quiet(); f.advance(0.4, 10);
    const ppl = f.parkPeople(), pets = f.parkPets(), v = f.hallView();
    return { ver: f.version, sv: f.snapshot().saveVersion, start: st.ok, built: S.town.hall.built.park | 0, lv6, lvA, lv: v.lv, name: v.lvName, people: v.people, sign: r1Sign(), props: parkProps(),
      kids: ppl.filter(p => p.kid && p.where === 'park').length, adults: ppl.filter(p => !p.kid).length, pets: pets.map(p => p.kind + ':' + p.pose), ground: [f.groundAt(781, -57)[1], f.groundAt(817, -57)[1], f.groundAt(760, -45)[1]],
      log: S.events.map(e => e.msg).filter(m => /镇公园修好了|繁荣度升到 6/.test(m)).length };`;
  const parkCk = r => ver(r) || (!r.start || !r.built ? 'park not built' : null) || (!r.lv6 ? 'no lv6 stamp' : null) || (r.lvA !== 6 || r.lv !== 6 || r.name !== '旅游小镇' ? 'lv ' + r.lvA + '/' + r.lv + ' ' + r.name : null)
    || (r.sign ? 'R1 sign still up' : null) || (r.props < 20 ? 'park props ' + r.props : null) || (r.kids !== 4 ? 'kids in park ' + r.kids : null) || (r.pets.length !== 2 ? 'pets ' + r.pets : null)
    || (r.ground[0] !== 'dirt' || r.ground[2] !== 'grass' ? 'ground ' + r.ground : null) || (r.log < 2 ? 'logs ' + r.log : null);
  await shot('park.png', 1280, 800, parkFn, parkCk);
  await shot('park_phone.png', 390, 844, parkFn, parkCk);

  // 3. residents in town: at 17:35 the children and parents walk home along the back lane / 东街; a morning with a pram on the ring
  const homeFn = `buildPark(); f.buy('eastave'); f.parkMorning(); S.town.hall.lv6 = S.day - 30; dry(); at(17 * 60 + 36); look(870, -10, 0); hide(); quiet(); f.advance(0.3, 10);
    const ppl = f.parkPeople(); return { ver: f.version, walking: ppl.filter(p => p.where === 'walk').length, kids: ppl.filter(p => p.kid).length, ids: ppl.map(p => p.name + ':' + p.where + '@' + Math.round(p.x) + ',' + Math.round(p.y)) };`;
  const homeCk = r => ver(r) || (r.walking < 4 ? 'walking home ' + r.walking : null);
  await shot('residents.png', 1280, 800, homeFn, homeCk);
  const pramFn = `buildPark(); f.buy('eastave'); f.parkMorning(); S.town.hall.lv6 = S.day - 8; dry(); at(10 * 60 + 15); look(781, -58, 0); hide(); quiet(); f.advance(0.3, 10);
    const ppl = f.parkPeople(), tv = f.tourView(); return { ver: f.version, prams: ppl.filter(p => p.pram).length, park: ppl.filter(p => p.where === 'park').length, kids: ppl.filter(p => p.kid).length, fams: tv.families };`;
  const pramCk = r => ver(r) || (r.prams < 1 ? 'no pram' : null) || (r.park !== 3 ? 'park adults ' + r.park : null) || (r.kids ? 'children out of school in the morning' : null);
  await shot('pram.png', 1280, 800, pramFn, pramCk);

  // 4. the board at level 6: six stars, 旅游小镇, the families listed
  const lv6Fn = `buildPark(); f.buy('eastave'); f.parkMorning(); S.town.hall.lv6 = S.day - 30; f.openHall(); f.refreshUI(); const sh = document.getElementById('shop');
    const card = sh.querySelector('[data-item="tour"]'), top = sh.querySelector('.stars'); if (top) top.closest('.sec').scrollIntoView({ block: 'start' }); quiet();
    return { ver: f.version, txt: sh.textContent.replace(/\\s+/g, ' ').slice(0, 300), fam: sh.querySelectorAll('[data-item="tourfam"]').length, stars: (sh.querySelector('.stars') || {}).textContent };`;
  const lv6Ck = r => ver(r) || (!/旅游小镇/.test(r.txt) ? 'no 旅游小镇' : null) || (r.fam !== 3 ? 'family cards ' + r.fam : null) || (r.stars !== '★★★★★★' ? 'stars ' + r.stars : null);
  await shot('board_lv6.png', 1280, 800, lv6Fn, lv6Ck);
  await shot('board_lv6_phone.png', 390, 844, lv6Fn, lv6Ck);

  // 5. night: only the two gate lamps in the park; pets asleep by the kennel; nobody out
  const nightFn = `buildPark(); f.buy('eastave'); f.parkMorning(); S.town.hall.lv6 = S.day - 30; at(20 * 60 + 30); look(781, -50, 0); hide(); quiet(); f.advance(0.4, 10);
    const L = f.HL.lightsAt(S.town.hall, S.t).filter(l => f.PK.inPark(l.x, l.y)); return { ver: f.version, lamps: L.length, pets: f.parkPets().map(p => p.pose), ppl: f.parkPeople().length };`;
  const nightCk = r => ver(r) || (r.lamps !== 2 ? 'park lamps ' + r.lamps : null) || (r.pets.some(p => p !== 'sleep') ? 'pets ' + r.pets : null) || (r.ppl ? 'people at night ' + r.ppl : null);
  await shot('night.png', 1280, 800, nightFn, nightCk);

  // 6. no 繁荣度 6 without tourists: park built, avenue and beach not bought
  const noTourFn = `buildPark(); f.parkMorning(); const v = f.hallView(); return { ver: f.version, lv: v.lv, lv6: S.town.hall.lv6 | 0, need: v.tour && v.tour.need, ppl: f.parkPeople().length, pets: f.parkPets().length };`;
  const noTourCk = r => ver(r) || (r.lv !== 5 || r.lv6 ? 'lv ' + r.lv + ' lv6 ' + r.lv6 : null) || (!r.need || !r.need.some(t => /东门大道或度假沙滩/.test(t)) ? 'need ' + r.need : null) || (r.ppl ? 'families before 6' : null) || (r.pets !== 2 ? 'pets come with the park' : null);
  await shot('notour.png', 1280, 800, noTourFn, noTourCk);

  await b.close(); server.close();
  if (errs.length || fails.length) { console.error('ERRORS', errs.concat(fails).join('\n')); process.exit(1); }
  console.log('ok  park-shots  version', VERSION, '->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
