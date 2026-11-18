// Screenshots + browser checks for phase 9 (v5.7.0):  node tools/decor-shots.js [name-filter]
//   writes /workspace/pf-shots/v570_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), VERSION = (fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(q, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html' + q); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); return p; }
  // a farm well along: 阿禾 lives here, the old regions are open, plenty of gold and wood
  const setup = `const f = __farm, S = f.S; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','fold','shed','can','can','can','can']) f.buy(id);
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const tod = () => S.t % 1440, dry = () => { if (S.weather) S.weather.rained = false; };
    const spotFor = (what, id, c, skip) => { for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 16; a++) { const x = c.x + r * Math.cos(a * Math.PI / 8), y = c.y + r * Math.sin(a * Math.PI / 8);
      const q = f.placeOk(x, y, what, id, skip); if (q.ok) return q; } return null; };`;
  const shot = async (name, fn, check, vw, vh) => { if (only && !name.includes(only)) return;
    const p = await page('?manual', vw, vh); const r = await p.evaluate(fn); await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, name) });
    const bad = check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. sprinklers: bought in the shop, the family sets them down along the home field; at 6:00 they spray and water
  // 1. the shop's 装饰 tab: decorations, night lamps and the party area at a flat price
  await shot('v570_shop_decor.png', `(() => { ${setup} f.refreshUI(); document.getElementById('shopBtn').click(); const t = document.querySelector('#shop [data-tab="decor"]'); t && t.click(); f.refreshUI();
    const txt = document.getElementById('shop').textContent; return { tab: !!t, party: txt.includes('派对区'), lamps: txt.includes('夜灯'), cards: document.querySelectorAll('#shop .card').length }; })()`,
    r => !r.tab ? 'no decor tab' : !r.party || !r.lamps ? 'text' : r.cards < 8 ? 'cards ' + r.cards : null);
  // 2. bought pieces go to the storehouse; the family sets each one down on free grass near the house by themselves
  await shot('v570_auto_placed.png', `(() => { ${setup} dry(); at(8 * 60); const ids = ['bench', 'bench', 'flowerpot', 'flowerpot', 'flowerpot', 'scarecrow', 'birdbath'];
    const bought = ids.map(id => f.buy(id).ok); const inv0 = Object.values(S.decor.inv).reduce((a, b) => a + b, 0);
    until(() => !Object.keys(S.decor.inv).length && !S.decor.orders.length, 900);
    const p = S.decor.placed, cx = p.reduce((s, q) => s + q.x, 0) / (p.length || 1), cy = p.reduce((s, q) => s + q.y, 0) / (p.length || 1);
    f.setAngle(0); f.panTo(cx, cy); f.advance(0.3, 10);
    return { bought: bought.every(Boolean), inv0, placed: p.length, left: Object.keys(S.decor.inv).length, t: tod(), onGrass: p.every(q => f.placeOk(q.x, q.y, 'decor', q.id, { what: 'decor', ref: q.u }).ok) }; })()`,
    r => !r.bought ? 'buy' : r.inv0 !== 7 ? 'storehouse ' + r.inv0 : r.placed !== 7 ? 'placed ' + r.placed : !r.onGrass ? 'a piece sits where it may not' : null);
  // 3. the player points: 「摆路灯」 shows a green footprint on grass, refuses the path and the door, then someone carries it over
  await shot('v570_place_mode.png', `(() => { ${setup} dry(); at(9 * 60); f.decorGain('lamppost'); f.decorGain('stringlights'); f.setMode(null);
    const btn = [...document.querySelectorAll('#tools button')].map(b => b.textContent); f.setMode('decor', 'lamppost');
    const door = f.decorClick({ x: f.DOOR.x, y: f.DOOR.y + 3 }), water = f.decorClick({ x: 30, y: 200 });
    const sp = f.autoSpot('lamppost'), good = f.decorClick(sp); const queued = S.decor.orders.length;
    until(() => !S.decor.orders.length, 400); const placed = S.decor.placed.some(p => p.id === 'lamppost' && Math.hypot(p.x - sp.x, p.y - sp.y) < 1);
    f.setMode(null); const btn2 = [...document.querySelectorAll('#tools button')].map(b => b.textContent); f.setMode('decor', 'stringlights'); const s2 = f.autoSpot('stringlights'); f.input.hover = f.decorHover(s2); f.setAngle(0); f.panTo(sp.x, sp.y); f.advance(0.2, 10); f.input.hover = f.decorHover(s2); f.render();
    return { btn, btn2, doorNo: door && !door.ok && door.why, waterNo: water && !water.ok && water.why, good: good && good.ok, queued, placed, hoverOk: f.input.hover && f.input.hover.dec && f.input.hover.dec.ok }; })()`,
    r => !r.btn.some(t => /摆路灯/.test(t)) || !r.btn2.some(t => /挪东西/.test(t)) ? 'toolbar ' + r.btn + ' / ' + r.btn2 : !r.doorNo || !r.waterNo ? 'bad spot accepted' : !r.good || !r.placed ? 'not placed' : !r.hoverOk ? 'hover' : null);
  // 4. 挪东西: a workshop moves out of its yard to a spot by the house; deliveries still find its door
  await shot('v570_move_workshop.png', `(() => { ${setup} dry(); f.buyPlot('wbank', 'workshop'); f.buy('mill'); at(9 * 60); const w = S.works.works.mill, p0 = f.PW.workPos(w);
    f.setMode('move'); f.decorClick(p0); const picked = f.input.mvPick && f.input.mvPick.ref; const to = spotFor('work', null, { x: f.DOOR.x + 60, y: f.DOOR.y + 40 }, { what: 'work', ref: 'mill' });
    const r = f.decorClick(to); f.setMode(null); until(() => !S.decor.orders.length, 600); const p1 = f.PW.workPos(w), door = f.PWA.doorOf('mill');
    f.setAngle(0); f.panTo(p1.x, p1.y); f.advance(0.3, 10);
    return { picked, ok: r && r.ok, from: [p0.x, p0.y], to: [p1.x, p1.y], moved: Math.hypot(p1.x - to.x, p1.y - to.y) < 1, saved: typeof w.x === 'number', door: [door.x, door.y] }; })()`,
    r => r.picked !== 'mill' ? 'pick' : !r.ok ? 'order' : !r.moved ? 'not moved' : null);
  // 5. a hive and a sprinkler move too (the sprinkler only along a field's edge)
  await shot('v570_move_hive.png', `(() => { ${setup} dry(); f.buy('hive'); f.buy('hive'); at(9 * 60); const h0 = f.PWA.hiveSpots()[0];
    f.setMode('move'); f.decorClick(h0); const to = spotFor('hive', null, { x: f.DOOR.x + 40, y: f.DOOR.y + 36 }, { what: 'hive', ref: 0 }); const r = f.decorClick(to); f.setMode(null);
    until(() => !S.decor.orders.length, 600); const h1 = f.PWA.hiveSpots()[0]; f.setMode('move'); f.setAngle(0); f.panTo(h1.x, h1.y); f.advance(0.3, 10);
    return { ok: r && r.ok, moved: Math.hypot(h1.x - to.x, h1.y - to.y) < 1, kept: S.works.hives.length }; })()`,
    r => !r.ok ? 'order' : !r.moved ? 'hive not moved' : r.kept !== 2 ? 'hives' : null);
  // 6. lamps: without a water wheel they stand dark; with one turning they light at dusk and 「今晚月色真美」 lights up
  const lampSetup = `${setup} dry(); for (const id of ['lamppost', 'lamppost', 'stonelamp', 'stonelamp', 'stringlights']) f.buy(id); at(8 * 60); until(() => !Object.keys(S.decor.inv).length && !S.decor.orders.length, 900);
    const ps = S.decor.placed, cx = ps.reduce((s, q) => s + q.x, 0) / ps.length, cy = ps.reduce((s, q) => s + q.y, 0) / ps.length;`;
  await shot('v570_lamps_unpowered.png', `(() => { ${lampSetup} at(21 * 60); f.setAngle(0); f.panTo(cx, cy); f.advance(0.5, 10);
    return { placed: ps.length, lit: f.DA.litLamps().length, moon: S.achievements.some(a => a.id === 'nightlight') }; })()`, r => r.placed !== 5 ? 'placed ' + r.placed : r.lit ? 'lit without power' : r.moon ? 'moon without power' : null);
  await shot('v570_lamps_lit.png', `(() => { ${lampSetup} f.buyPlot('sbank', 'dam'); const w = f.buy('wheel'); at(21 * 60); f.setAngle(0); f.panTo(cx, cy); f.advance(0.5, 10); f.advance(2, 10);
    return { wheel: w.ok, lit: f.DA.litLamps().length, moon: S.achievements.some(a => a.id === 'nightlight'), log: S.log.filter(l => /灯亮/.test(l)).length }; })()`,
    r => !r.wheel ? 'wheel' : r.lit !== 5 ? 'lit ' + r.lit : !r.moon ? 'no 今晚月色真美' : null);
  // 7. the party area: the family sets it up; one evening the family gathers there and two guests come up the east road
  await shot('v570_party.png', `(() => { ${setup} dry(); const b = f.buy('party'); at(8 * 60); until(() => !Object.keys(S.decor.inv).length && !S.decor.orders.length, 900);
    const area = f.partyArea(); if (!area) return { b: b.ok, area: false };
    const day0 = S.day; until(() => S.day > day0, 3000); const first = S.decor.party.tonight === S.day; S.decor.party.guests = 2;
    at(17 * 60 + 20); dry(); until(() => tod() >= 18 * 60 + 40, 900);
    const at_ = f.actors ? f.actors().filter(a => a.task && a.task.kind === 'party').length : null, guests = f.GUESTS.length, near = f.GUESTS.filter(g => Math.hypot(g.x - area.x, g.y - area.y) < 16).length;
    f.setAngle(0); f.panTo(area.x, area.y); f.advance(0.3, 10);
    return { b: b.ok, area: true, first, guests, near, atTable: at_, held: S.achievements.some(a => a.id === 'party'), t: tod(), log: S.log.filter(l => /派对/.test(l)).slice(-2) }; })()`,
    r => !r.b ? 'buy' : !r.area ? 'not set up' : !r.first ? 'first party not tonight' : r.guests !== 2 || r.near < 1 ? 'guests ' + r.guests + '/' + r.near : !r.held ? 'achievement' : null, 1280, 800);
  // 8. not daily: 120 mornings in the game decide 4+ days apart, a few times a month
  await shot('v570_party_days.png', `(() => { ${setup} f.buy('party'); at(8 * 60); until(() => !Object.keys(S.decor.inv).length && !S.decor.orders.length, 900);
    const d0 = S.day, days = []; S.decor.party.at = d0; for (let d = d0 + 1; d < d0 + 121; d++) { S.day = d; f.partyMorning(); if (S.decor.party.tonight === d) { days.push(d); S.decor.party.last = d; } }
    S.day = d0; S.decor.party.tonight = 0; const gaps = days.slice(1).map((d, i) => d - days[i]); const area = f.partyArea(); f.setAngle(0); f.panTo(area.x, area.y); f.advance(0.2, 10);
    return { n: days.length, minGap: Math.min(...gaps), first: days[0] - d0 }; })()`, r => r.first !== 1 ? 'first ' + r.first : r.minGap < 4 ? 'gap ' + r.minGap : r.n > 30 || r.n < 4 ? 'parties ' + r.n : null);
  // 9. the book's 装饰 page: pieces seen are drawn, the rest are silhouettes
  await shot('v570_codex_decor.png', `(() => { ${setup} for (const id of ['bench', 'lamppost', 'carving', 'shell', 'giant_pumpkin']) f.decorGain(id); f.refreshUI(); document.getElementById('codexBtn').click();
    const box = document.getElementById('codex'), cells = [...box.querySelectorAll('[data-key^="decor:"], [data-lock^="decor:"]')]; cells[0] && cells[0].scrollIntoView({ block: 'center' });
    return { cells: cells.length, seen: cells.filter(c => !c.classList.contains('locked')).length, icons: cells.filter(c => { const i = c.querySelector('.ico'); return i && /data:image\\/png/.test(i.style.backgroundImage); }).length }; })()`,
    r => r.cells !== 16 ? 'cells ' + r.cells : r.seen !== 5 ? 'seen ' + r.seen : r.icons !== 16 ? 'icons ' + r.icons : null);
  // 10. the day-59 manor save (v10) loads in v5.7.0: no decorations, plots and the old house where they were
  if (!only || 'v570_fixture_day59.png'.includes(only)) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8')), save = raw.save || raw;
    const p = await page('?manual');
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, s = f.snapshot(); f.advance(120, 10); const s2 = f.snapshot(); f.setAngle(0); f.panTo(96, 70); f.advance(0.3, 10);
      return { v: f.version, sv: s.saveVersion, day: s.clock.day, decor: s.decor, plots: Object.keys(s.plots).length, house: s.upgrades.house, placedLater: s2.decor.placed.length, animals: s.animals.length }; });
    await p.screenshot({ path: path.join(OUT, 'v570_fixture_day59.png') });
    const empty = JSON.stringify({ inv: {}, placed: [], orders: [], party: { last: 0, at: 0, tonight: 0, guests: 0 }, got: {}, n: 1, moon: 0 });
    const bad = r.v !== VERSION ? 'version' : r.sv !== 13 ? 'saveVersion' : r.day !== save.clock.day ? 'day' : JSON.stringify(r.decor) !== empty ? 'decor not empty' : r.placedLater ? 'decor appeared' : r.plots !== Object.keys(save.plots || {}).length ? 'plots' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'v570_fixture_day59.png', JSON.stringify(r)); if (bad) fails.push('fixture: ' + bad); await p.context().close();
  }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
