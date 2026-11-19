// Screenshots + browser checks for phase 11 (v5.9.0, the new house, weddings, the couple's little farm, closeness):  node tools/home-shots.js [name-filter]
//   writes /workspace/pf-shots/v590_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [], net = [];
  async function page(q, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('request', rq => { if (!rq.url().startsWith(base) && !rq.url().startsWith('data:')) net.push(rq.url()); });
    await p.goto(base + '/index.html' + q); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const tod = () => S.t % 1440, dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const kid = () => S.members.find(m => m.id === 'kid0');
    const house = () => S.home.houses[0], sp = () => f.SPOUSES[0];
    const prep = () => { f.buyPlot('glade', 'meadow'); const r = f.buy('cottage'); const h = house(); if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); f.HA.sync(true); } return r.ok; };
    const wed = () => { prep(); S.home.rel.kid0 = { m0: 30, m1: 85, m2: 20 }; day(S.day + 1); at(6 * 60); dry(); f.homeMorning(); return JSON.parse(JSON.stringify(S.home.wed)); };
    const road = () => f.buyPlot('eroad', 'road').ok;
    const openTown = () => { road(); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };`;
  // fn sets the scene and returns what it saw; the picture is taken then; `after` (optional) plays on and checks what follows
  const shot = async (name, fn, check, after) => { if (only && !name.includes(only)) return;
    const p = await page('?manual'); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    if (after && !(r && r.error)) { try { Object.assign(r, await p.evaluate(`(() => { ${helpers} ${after} })()`)); } catch (e) { r.error = String(e).slice(0, 300); } }
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };


  // a farm well along (day 70): the farmhouse grown to the manor, two children: 小豆 (born day 15, a teen) and 小米 (born 40, at school)
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','chicken','fold','sheep','shed','cow','dog','can','can','can','can']) f.buy(id);
    day(70); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily();`;

  // 1. the shop: 新房子 waits for a bought 花甸 / 农田; with one it can be bought, and the family builds it there (a frame first)
  await shot('v590_build.png', `(() => { ${setup} dry(); const g0 = f.homeGate(0); f.buyPlot('glade', 'meadow'); const g1 = f.homeGate(0);
    const r = f.buy('cottage'); const h = house(); at(8 * 60); until(() => [f.FARMER, ...S.members].some(a => a.task && a.task.kind === 'homebuild' && Math.hypot(a.x - h.x, a.y - h.y) < 16), 900);
    const builder = [f.FARMER, ...S.members].find(a => a.task && a.task.kind === 'homebuild'); f.advance(4, 10); look(h.x + 4, h.y + 2, 0.9);
    return { g0, g1, ok: r.ok, site: h && h.site, at: h && [h.x, h.y, h.m], built: h && h.built, builder: builder && builder.name, coins: S.coins, frame: f.HA.state().props }; })()`,
    r => r.g0 !== '先在外圈买一块平地，选成「花甸」或「农田」，新房子盖在那里' ? 'gate before a site: ' + r.g0 : r.g1 !== null ? 'gate with a site: ' + r.g1 : !r.ok ? 'not bought' : r.site !== 'glade' ? 'site ' + r.site : r.built ? 'built at once' : !r.builder ? 'nobody building' : !r.done ? 'never finished' : r.child ? 'a child built it' : null,
    `const h = S.home.houses[0], kids = new Set(); for (let i = 0; i < 900 && !h.built; i++) { f.advance(1, 10); for (const m of S.members) if (m.role === 'child' && m.task && m.task.kind === 'homebuild') kids.add(m.id); }
     return { done: h.built, child: kids.size, tiles: f.HT.length, log: S.events.map(e => e.msg).filter(l => /新房子/.test(l)).slice(0, 3) };`);
  // 2. closeness: school days and a classmate visit add up slowly; the heart panel lists each child's classmates and the neighbours
  await shot('v590_relations.png', `(() => { ${setup} dry(); f.buyPlot('eroad', 'road'); S.town.school.kid1 = 3; f.buy('town');
    const kid1 = S.members.find(m => m.id === 'kid1'); const before = JSON.parse(JSON.stringify(S.home.rel));
    let d = 71; for (; d < 74; d++) { day(d); at(7 * 60 + 30); dry(); until(() => kid1.away === 'school', 600); until(() => !kid1.away && tod() > 15 * 60, 1500); }
    S.home.rel.kid0 = Object.assign({ m0: 30, m1: 62, m2: 18 }, {}); S.home.nb.n0 = Math.max(S.home.nb.n0 | 0, 8);
    f.refreshUI(); document.getElementById('loveHud').click(); const tip = document.getElementById('loveTip');
    return { before, rel: S.home.rel, nb: S.home.nb, open: tip && !tip.hidden, txt: tip ? tip.textContent.replace(/\\s+/g, ' ') : '', st: f.homeStatus().kids.map(k => k.note) }; })()`,
    r => !r.open ? 'tip closed' : !(r.rel.kid1 && Object.values(r.rel.kid1).reduce((a, b) => a + b, 0) >= 9) ? 'school days did not count ' + JSON.stringify(r.rel.kid1) : !(r.nb.n1 >= 2) ? 'no teacher' : !/朵朵/.test(r.txt) || !/要好/.test(r.txt) || !/林老师/.test(r.txt) || !/周婶/.test(r.txt) ? 'tip text' : null);
  // 3. the wedding: 小豆 (a teen, 走得很近 with 朵朵) marries on a fine evening in front of the new house, the family around them
  await shot('v590_wedding.png', `(() => { ${setup} const w = wed(); until(() => tod() >= 18 * 60 + 40, 1500); const k = kid(), h = house();
    const near = [f.FARMER, ...S.members].filter(a => Math.hypot(a.x - h.x, a.y - h.y - 8) < 18).length; look(h.x, h.y + 6, 0.3);
    return { w, sp: sp() && sp().name, near, task: k.task && k.task.kind, log: S.events.map(e => e.msg).filter(l => /婚礼/.test(l)).slice(0, 2) }; })()`,
    r => !r.w.kid0 || r.w.kid0.mate !== 'm1' ? 'no wedding ' + JSON.stringify(r.w) : r.sp !== '朵朵' ? 'no spouse' : r.near < 3 ? 'family not there ' + r.near : !r.log.length ? 'no log' : !r.moved ? 'never moved in' : null,
    `until(() => tod() >= 20 * 60 + 40, 900); return { moved: S.home.wed.kid0 && S.home.wed.kid0.moved, houseKid: S.home.houses[0].kid };`);
  // 4. the homestead: the next morning the couple works their six tiles (harvest, water, replant) and collects the eggs
  await shot('v590_homestead.png', `(() => { ${setup} wed(); until(() => S.day === 72 && tod() >= 7 * 60 + 5, 1600); dry(); const h = house();
    f.HT.forEach((t, i) => { t.tilled = true; t.crop = { type: f.HM.GARDEN[i], age: i < 3 ? 99 : 1, n: 0, stage: 0, rot: 0 }; t.watered = i >= 3 ? false : true; });
    const earn0 = S.home.earn, seen = {}; let shotAt = null;
    for (let i = 0; i < 400; i++) { f.advance(1, 10); dry(); for (const a of [kid(), sp()]) if (a && a.task && /^hs-/.test(a.task.kind)) seen[a.name + ':' + a.task.kind] = 1;
      const k = kid(); if (!shotAt && k.task && /^hs-/.test(k.task.kind) && Math.hypot(k.x - k.task.to.x, k.y - k.task.to.y) < 2) { shotAt = [Math.round(k.x), Math.round(k.y), k.task.kind]; break; } }
    look(h.x + (h.m ? -14 : 14), h.y + 2, 0.3);
    return { shotAt, seen: Object.keys(seen), earn: S.home.earn - earn0, label: kid().label }; })()`,
    r => !r.shotAt ? 'the child never worked the tiles: ' + r.seen : null,
    `const h = S.home.houses[0]; until(() => tod() >= 12 * 60, 900); return { later: Object.assign({}, { crops: f.HT.map(t => t.crop && [t.crop.type, t.crop.age, t.watered]), eggs: h.eggs, earned: S.home.earn }) };`);
  // 4b. moving it: in 挪东西 mode the new house goes to another bought 花甸 / 农田 with room; the family takes it down and puts it up
  //     there, tiles and crops along; somewhere else is refused with a reason
  await shot('v590_move.png', `(() => { ${setup} wed(); until(() => S.day === 72 && tod() >= 8 * 60, 3000); const h = house(); dry();
    f.HT.forEach((t, i) => { t.tilled = true; t.crop = { type: f.HM.GARDEN[i], age: 1, n: 0, stage: 0, rot: 0 }; t.watered = true; });
    const bought = f.buyPlot('eslope', 'meadow').ok, P = f.PL.plot('eslope').rect, cx = (P[0] + P[2]) / 2, cy = (P[1] + P[3]) / 2;
    f.setMode('move'); f.decorClick({ x: h.x, y: h.y }); const picked = f.input.mvPick && f.input.mvPick.what;
    const no = f.decorClick({ x: 200, y: 60 }), yes = f.decorClick({ x: cx, y: cy }); f.setMode(null);
    until(() => !S.decor.orders.length, 1500); dry(); const crops = f.HT.filter(t => t.crop).length;
    until(() => { const k = kid(); return Math.hypot(k.x - h.x, k.y - h.y) < 30; }, 1500); look(h.x, h.y + 2, 0.3);
    return { bought, picked, no: no && no.why, yes: yes && yes.ok, at: [h.site, h.x, h.y, h.m], crops, inPlot: f.HT.every(t => f.PL.plotAt(t.x, t.y) && f.PL.plotAt(t.x, t.y).id === 'eslope'),
      kidNear: [Math.round(kid().x), Math.round(kid().y)], log: S.events.map(e => e.msg).filter(l => /挪到了新地方/.test(l)).slice(-1) }; })()`,
    r => !r.bought ? 'eslope not bought' : r.picked !== 'home' ? 'not picked' : !/花甸或农田/.test(r.no || '') ? 'bad spot accepted: ' + r.no : !r.yes ? 'move refused' : r.at[0] !== 'eslope' ? 'not moved ' + r.at : !r.inPlot ? 'tiles left behind' : r.crops !== 6 ? 'crops lost ' + r.crops : !r.log.length ? 'no log' : null);
  // 5. helping: about every other day 小豆 comes over for an hour (a second only when the main farm is behind); then back home
  await shot('v590_help.png', `(() => { ${setup} wed(); const days = []; let pic = null;
    for (let d = 72; d <= 77; d++) { until(() => S.day === d && tod() >= 9 * 60, 2000);
      for (let i = 0; i < 2000 && S.day === d && tod() < 17 * 60; i++) { f.advance(1, 10); dry(); const hp = S.home.help.kid0, k = kid();
        if (!pic && hp && hp.day === d && tod() < hp.until && k.task && !/^hs-|^home|idle/.test(k.task.kind) && k.x > -20) { pic = { at: [Math.round(k.x), Math.round(k.y)], task: k.task.kind, d, label: k.label }; break; } }
      const hp = S.home.help.kid0; days.push(hp && hp.day === d ? hp.n : 0); if (pic) break; }
    if (pic) look(pic.at[0], pic.at[1], 0.3); return { pic, days, max: Math.max(...days) }; })()`,
    r => !r.pic ? 'never came to help ' + r.days : r.max > 2 ? 'more than twice a day' : null);
  // 6. night: the couple asleep in their own house, its windows lit
  await shot('v590_night.png', `(() => { ${setup} wed(); until(() => S.day === 72 && tod() >= 21 * 60 + 30, 4000); const h = house(), d = f.HM.layout(h).door, k = kid(), s = sp();
    look(h.x, h.y + 4, 0.3); return { k: [Math.round(k.x - d.x), Math.round(k.y - d.y), k.sleeping], s: [Math.round(s.x - d.x), Math.round(s.y - d.y), s.sleeping] }; })()`,
    r => Math.hypot(r.k[0], r.k[1]) > 2 || !r.k[2] ? 'child not asleep at the new house ' + r.k : Math.hypot(r.s[0], r.s[1]) > 2 || !r.s[2] ? 'spouse not asleep there ' + r.s : null);
  // 7. a reload: the house, its tiles, the spouse and the closeness all come back from the save; no bush grows back in the yard
  if (!only || 'v590_reload.png'.includes(only)) {
    const p = await page('?manual');
    const save = await p.evaluate(`(() => { ${setup} wed(); until(() => S.day === 72 && tod() >= 10 * 60, 2000); return f.snapshot(); })()`);
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, S = f.S, h = S.home.houses[0], L = f.HM.layout(h);
      const bushes = f.props ? f.props.filter(q => q.tree && q.tree.kind === 'bush' && f.HA.inYard(q.x, q.y)).length : -1;
      f.advance(30, 10); f.setAngle(0.3); f.panTo(h.x, h.y + 2); f.advance(0.3, 10);
      return { sv: f.snapshot().saveVersion, house: [h.site, h.built, h.kid], tiles: f.HT.length, spouse: f.SPOUSES.map(s => s.name), rel: S.home.rel.kid0, bushes, crops: f.HT.filter(t => t.crop).length }; });
    await p.screenshot({ path: path.join(OUT, 'v590_reload.png') });
    const bad = r.sv !== 15 ? 'saveVersion' : r.house[2] !== 'kid0' || !r.house[1] ? 'house ' + r.house : r.tiles !== 6 ? 'tiles' : r.spouse.join() !== '朵朵' ? 'spouse' : !(r.rel && r.rel.m1 >= 80) ? 'rel' : r.bushes > 0 ? 'bush in the yard' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'v590_reload.png', JSON.stringify(r)); if (bad) fails.push('reload: ' + bad); await p.context().close();
  }
  // 8. the day-59 manor save (v10) loads in v5.9.0: nobody married, no new house, still plays a day
  if (!only || 'v590_fixture_day59.png'.includes(only)) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8')), save = raw.save || raw;
    const p = await page('?manual');
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, s = f.snapshot(); f.advance(120, 10); const s2 = f.snapshot(); f.setAngle(0.5); f.panTo(100, 60); f.advance(0.3, 10);
      return { v: f.version, sv: s.saveVersion, day: s.clock.day, home: s.home, up: s.upgrades.cottage, plots: Object.keys(s.plots).length, animals: s.animals.length, later: s2.clock.t > s.clock.t, spouses: f.SPOUSES.length, gate: f.homeGate(0) }; });
    await p.screenshot({ path: path.join(OUT, 'v590_fixture_day59.png') });
    const empty = JSON.stringify({ houses: [], rel: {}, nb: {}, wed: {}, help: {}, teen: {}, earn: 0 });
    const bad = r.v !== VERSION ? 'version' : r.sv !== 15 ? 'saveVersion' : r.day !== save.clock.day ? 'day' : JSON.stringify(r.home) !== empty ? 'home not empty ' + JSON.stringify(r.home) : r.up !== 0 ? 'cottage bought' : r.spouses ? 'spouses' : !r.later ? 'clock' : r.plots !== Object.keys(save.plots || {}).length ? 'plots' : r.animals !== save.animals.length ? 'animals' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'v590_fixture_day59.png', JSON.stringify(r)); if (bad) fails.push('fixture: ' + bad); await p.context().close();
  }
  if (net.length) fails.push('network: ' + net.slice(0, 3).join(' '));
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
