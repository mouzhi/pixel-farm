// Screenshots + browser checks for v5.12.5 (第三代: 孙辈、女儿、搬进宅园、好感结婚):  node tools/gen3-shots.js [name-filter]
//   writes $PF_SHOTS/v5125_*.png (default /workspace/v5125-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/v5125-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'v5125_';
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, G3 = f.G3, HM = f.HM;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) { S.weather.rained = false; if (f.WX) S.weather.rain = null; } };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { window.__cam = { x, y }; f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };
    const quiet = () => { const t = document.getElementById('toast'); if (t) t.hidden = true; for (const el of document.querySelectorAll('.toast,#albumToast,#albToast,#say')) el.style.display = 'none'; };
    const openTown = () => { f.buyPlot('eroad', 'road'); if (!S.town) S.town = {}; if (!S.town.school) S.town.school = {}; S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); const r = f.buy('town'); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(2.2, 12); return r; };
    const stampLv5 = () => { const H = S.town.hall; const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      ids.forEach((id, i) => { H.built[id] = (S.day | 0) - (ids.length + 2) + i; }); f.applyUpgrades(); f.TA.sync(true); };
    const buildPark = () => { at(9 * 60); const r = f.hallStart('park'); day(S.day + 1); at(7 * 60); f.hallTick(); f.TA.sync(true); return r; };
    const built = h => { if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); } };
    const door = i => HM.layout(S.home.houses[i]).door;
    const reload = () => { f.restore(PFSave.validate(PFSave.compact(f.snapshot()))); };
    const mkG3 = ages => { S.home.g3 = { s: 40, d: S.day, k: {} }; for (const id in ages) S.home.g3.k[id] = { b: S.day - ages[id] }; reload(); return S.home.g3; };
    const ppl = () => f.g3People().map(p => ({ id: p.id, name: p.name, look: p.look, where: p.where, cut: p.cut, x: Math.round(p.x), y: Math.round(p.y), pose: p.pose || '' }));
    const logs = re => S.events.map(e => e.msg).filter(m => re.test(m));`;
  // a farm with the town open, 宅园 bought, both children grown and married into the two pad houses (synthetic)
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 2000000; f.FARMER.wood = 8000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','can','can']) f.buy(id);
    day(120); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 1 }, { id: 'kid1', name: '小米', born: 3 }] }); f.syncFamily(); dry(); at(12 * 60); openTown();
    const hb = f.buyPlot('nhome', 'homestead'); if (!hb || !hb.ok) throw new Error('nhome ' + JSON.stringify(hb));
    for (let i = 0; i < 2; i++) { const r = f.buy('cottage'); if (!r.ok) throw new Error('cottage ' + i + ' ' + r.why); built(S.home.houses[i]); }
    S.home.wed = { kid0: { mate: 'm1', day: 40, moved: 40, house: 0 }, kid1: { mate: 'm0', day: 44, moved: 44, house: 1 } }; S.home.houses[0].kid = 'kid0'; S.home.houses[1].kid = 'kid1';
    reload(); dry();`;
  const shot = async (name, vw, vh, fn, check, after) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${setup} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    if (after && r && !r.error) try { await after(p, r); } catch (e) { r.error = String(e).slice(0, 300); }
    if (vw >= 800 && r && !r.error && ZOOM.has(name)) { await p.mouse.move(vw / 2, vh / 2); await p.mouse.wheel(0, -120); await p.waitForTimeout(150);
      await p.evaluate(() => { const c = window.__cam; if (c) { __farm.panTo(c.x, c.y); __farm.advance(0.05, 10); } }); } // one wheel step in: bigger pixels for the people
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const ZOOM = new Set(['born.png', 'yard.png', 'teen.png', 'move.png', 'wedding.png', 'married.png', 'park.png']);
  const ver = r => r.ver !== VERSION ? 'ver ' + r.ver : r.sv && r.sv !== 15 ? 'saveVersion ' + r.sv : null;

  // 1. the real path: an old save with two married children meets this version; a week later the first grandchildren arrive
  const bornFn = `const s0 = !!S.home.g3; f.g3Morning(); const st = S.home.g3, stamp = st && st.s;
    { const d0 = S.day; for (let d = d0 + 1; d <= d0 + 8; d++) { day(d); dry(); f.g3Morning(); } }
    at(10 * 60); quiet(); const d0 = door(0); look(d0.x, d0.y + 4, 0); hide(); f.advance(0.3, 10);
    return { ver: f.version, sv: f.snapshot().saveVersion, s0, stamp, born: Object.keys(S.home.g3.k), b: S.home.g3.k.g0 && S.home.g3.k.g0.b, ppl: ppl(), log: logs(/第三代/), status: f.homeStatus().grand.map(g => g.name + ':' + g.short + ':' + g.note) };`;
  const bornCk = r => ver(r) || (r.s0 ? 'g3 before the morning' : null) || (r.born.join() !== 'g0,g1' ? 'born ' + r.born : null) || (r.b !== r.stamp + 7 ? 'born day ' + r.b + ' stamp ' + r.stamp : null)
    || (r.ppl.filter(p => p.where === 'cradle').length !== 2 ? 'cradles ' + JSON.stringify(r.ppl) : null) || (r.log.length !== 2 || !/起名小满/.test(r.log.join()) ? 'logs ' + r.log : null) || (!/小豆的女儿/.test(r.status.join()) ? 'status ' + r.status : null);
  await shot('born.png', 1280, 800, bornFn, bornCk);

  // 2. a little girl playing in the yard and a baby brother in the cradle by the door (小豆's house); 小米's two the same
  const yardFn = `mkG3({ g0: 10, g1: 9, g2: 2, g3: 1 }); dry(); at(10 * 60 + 30); quiet(); const a = door(0), c = door(1); look((a.x + c.x) / 2, (a.y + c.y) / 2 + 6, 0); hide(); f.advance(0.4, 10); f.refreshUI();
    return { ver: f.version, ppl: ppl(), panel: (document.querySelector('[data-id="family"]') || { dataset: {} }).dataset.tip || '' };`;
  const yardCk = r => ver(r) || (r.ppl.filter(p => p.where === 'yard').length !== 2 ? 'yard ' + JSON.stringify(r.ppl) : null) || (r.ppl.filter(p => p.where === 'cradle').length !== 2 ? 'cradles' : null)
    || (!r.ppl.some(p => p.id === 'g0' && p.look === 'g3girl' && p.cut === 6) ? 'girl look ' + JSON.stringify(r.ppl) : null) || (!/孙辈 4 个/.test(r.panel) || !/小满（玩耍/.test(r.panel) ? 'panel ' + r.panel.slice(-300) : null);
  await shot('yard.png', 1280, 800, yardFn, yardCk);
  await shot('yard_phone.png', 390, 844, yardFn, yardCk);

  // 3. after school in the 镇公园 (park built, level 6): the grandchildren take park slots first, the town children fill the rest (4 at most)
  const parkFn = `stampLv5(); buildPark(); f.buy('eastave'); S.town.hall.lv6 = S.day - 30; const st = mkG3({ g0: 20, g1: 19, g2: 3, g3: 2 });
    let d = S.day; for (let i = 0; i < 30 && G3.parkKids(st, d, 2, false).length < 2; i++) d++; day(d); dry(); at(16 * 60 + 30); quiet(); look(781, -58, 0); hide(); f.advance(0.4, 10);
    const g = ppl(), town = f.parkPeople().filter(p => p.kid && p.where === 'park');
    return { ver: f.version, slots: f.g3ParkKids(), g, town: town.length, inPark: g.filter(p => p.where === 'park').length };`;
  const parkCk = r => ver(r) || (r.slots.length !== 2 ? 'slots ' + r.slots : null) || (r.inPark !== 2 ? 'grandkids in park ' + JSON.stringify(r.g) : null) || (r.inPark + r.town > 4 ? 'too many kids ' + r.town : null) || (r.town < 1 ? 'no town kids' : null);
  await shot('park.png', 1280, 800, parkFn, parkCk);

  // 4. a teen granddaughter helping on her parents' six tiles; the younger ones at school
  const teenFn = `mkG3({ g0: 46, g1: 45, g2: 25, g3: 24 }); dry(); at(11 * 60); quiet(); const a = door(0); look(a.x + 14, a.y - 2, 0); hide(); f.advance(0.4, 10);
    return { ver: f.version, ppl: ppl() };`;
  const teenCk = r => ver(r) || (r.ppl.filter(p => p.where === 'tiles' && p.cut === 3).length !== 2 ? 'teens on tiles ' + JSON.stringify(r.ppl) : null) || (r.ppl.some(p => p.id === 'g2' || p.id === 'g3') ? 'school kids at home' : null);
  await shot('teen.png', 1280, 800, teenFn, teenCk);

  // 5. moving out: no free house -> a hint; the shop sells a 3rd house for her (a 宅园 pad), she moves in next morning
  const moveFn = `const gate0 = (() => { mkG3({ g0: 20 }); return f.houseGate(); })();
    mkG3({ g0: 53, g1: 40, g2: 33, g3: 30 }); const gate1 = f.houseGate(); day(S.day + 1); dry(); f.g3Morning(); const hint = logs(/想搬出去住/).length;
    const r = f.buy('cottage'); built(S.home.houses[2]); day(S.day + 1); dry(); f.g3Morning(); const h = S.home.houses[2];
    at(10 * 60); quiet(); const d = door(2); look(d.x + 10, d.y - 2, 0); hide(); f.advance(0.4, 10);
    return { ver: f.version, gate0, gate1, hint, buy: r.ok, site: h && h.site, g: h && h.g, mv: S.home.g3.k.g0.mv, ppl: ppl(), crops: h && h._tiles ? h._tiles.filter(t => t.crop).length : 0, log: logs(/搬进了/) };`;
  const moveCk = r => ver(r) || (!r.gate0 || !/孙辈/.test(r.gate0) ? 'gate before ' + r.gate0 : null) || (r.gate1 !== null ? 'gate when needed ' + r.gate1 : null) || (r.hint !== 1 ? 'hint ' + r.hint : null)
    || (!r.buy || !/^nhome/.test(r.site || '') ? 'house ' + r.site : null) || (r.g !== 'g0' || !r.mv ? 'not moved' : null) || (!r.ppl.some(p => p.id === 'g0' && p.where === 'tiles' && Math.abs(p.x - r.ppl[0].x) < 80) ? 'not on own tiles ' + JSON.stringify(r.ppl) : null)
    || (r.crops !== 6 ? 'crops ' + r.crops : null);
  await shot('move.png', 1280, 800, moveFn, moveCk);

  // 6. the wedding evening in front of her house; 7. the next day the couple on their tiles; the save round-trips
  const wedPrep = `mkG3({ g0: 60, g1: 47, g2: 39, g3: 33 }); f.buy('cottage'); built(S.home.houses[2]); S.home.houses[2].g = 'g0'; Object.assign(S.home.g3.k.g0, { h: 2, mv: S.day - 5, r: { c0: 84, c1: 30 } }); reload();
    day(S.day + 1); dry(); f.g3Morning(); const wd = S.home.g3.k.g0.wd, w = S.home.g3.k.g0.w;`;
  const wedFn = `${wedPrep} at(18 * 60 + 40); quiet(); const d = door(2); look(d.x, d.y + 2, 0); hide(); f.advance(1, 10);
    return { ver: f.version, wd, w, today: S.day, ppl: ppl(), log: logs(/办婚礼|婚礼开始/) };`;
  const wedCk = r => ver(r) || (r.wd !== r.today || r.w !== 'c0' ? 'no wedding ' + r.wd + r.w : null) || (r.ppl.filter(p => p.where === 'wed').length !== 2 ? 'couple ' + JSON.stringify(r.ppl) : null)
    || (!r.ppl.some(p => p.look === 'bride') || !r.ppl.some(p => p.look === 'groom') ? 'clothes' : null) || (r.log.length < 2 ? 'logs ' + r.log : null);
  await shot('wedding.png', 1280, 800, wedFn, wedCk);
  const marFn = `${wedPrep} at(21 * 60); f.advance(0.5, 10); day(S.day + 1); dry(); f.g3Morning(); at(10 * 60 + 10); reload(); quiet(); const d = door(2); look(d.x + 12, d.y - 2, 0); hide(); f.advance(0.4, 10);
    const snap = f.snapshot(), json = JSON.stringify(PFSave.compact(snap)), h = S.home.houses[2];
    return { ver: f.version, sv: snap.saveVersion, ppl: ppl(), g: h.g, k: S.home.g3.k.g0, bytes: json.length, earn: h._today | 0, st: f.homeStatus().grand.find(g => g.id === 'g0'), log: logs(/成家了/) };`;
  const marCk = r => ver(r) || (r.g !== 'g0' || r.k.w !== 'c0' ? 'state ' + JSON.stringify(r.k) : null) || (r.ppl.filter(p => p.where === 'tiles' && (p.id === 'g0' || p.id === 'gs_g0')).length !== 2 ? 'couple tiles ' + JSON.stringify(r.ppl) : null)
    || (r.bytes > 64 * 1024 ? 'save ' + r.bytes : null) || (!/和阿朗成家了/.test(r.st.note) ? 'note ' + r.st.note : null);
  await shot('married.png', 1280, 800, marFn, marCk);

  // 8. night and rain: nobody out (babies inside in the rain), only the school run
  const nightFn = `mkG3({ g0: 10, g1: 20, g2: 2, g3: 50 }); at(22 * 60); const n = ppl().length; at(10 * 60); Object.assign(S.weather, { rained: true, lastDay: S.day, start: 0, dur: 1440 }); const rain = ppl();
    return { ver: f.version, night: n, rain };`;
  const nightCk = r => ver(r) || (r.night ? 'out at night ' + r.night : null) || (r.rain.some(p => p.where !== 'school-go' && p.where !== 'home-walk' && p.where !== 'yard') ? 'out in the rain ' + JSON.stringify(r.rain) : null);
  await shot('night.png', 1280, 800, nightFn, nightCk);

  if (errs.length) fails.push('page errors: ' + errs.slice(0, 5).join(' | '));
  await b.close(); server.close();
  if (fails.length) { console.log('FAILED', fails.length, '\n' + fails.join('\n')); process.exit(1); }
  console.log('gen3-shots: all ok');
})();
