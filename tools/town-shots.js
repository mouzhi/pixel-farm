// Screenshots + browser checks for phase 10 (v5.8.0, school, classmates, the town):  node tools/town-shots.js [name-filter]
//   writes /workspace/pf-shots/v580_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, SAVE_V = require('../save.js').CURRENT; // the fixture migrates to the current save version
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [], net = [];
  async function page(q, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('request', rq => { if (!rq.url().startsWith(base) && !rq.url().startsWith('data:')) net.push(rq.url()); });
    await p.goto(base + '/index.html' + q); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); return p; }
  // a farm well along with a school-age child (day 30, born day 12), 东大道 bought as a road
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const tod = () => S.t % 1440, dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const kid = () => S.members.find(m => m.id === 'kid0');
    const road = () => f.buyPlot('eroad', 'road').ok;
    const openTown = () => { road(); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','chicken','fold','sheep','shed','cow','dog','can','can','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 12 }] }); f.syncFamily();`;
  // fn sets the scene and returns what it saw; the picture is taken then; `after` (optional) plays on and checks what follows
  const shot = async (name, fn, check, after) => { if (only && !name.includes(only)) return;
    const p = await page('?manual'); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    if (after && !(r && r.error)) { try { Object.assign(r, await p.evaluate(`(() => { ${helpers} ${after} })()`)); } catch (e) { r.error = String(e).slice(0, 300); } }
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. town still locked: the child walks to school along 东大道 and goes out by the shut gate; home again in the afternoon, nothing lost
  await shot('v580_school_road.png', `(() => { ${setup} dry(); road(); at(7 * 60 + 50);
    const lock = f.buy('town'); until(() => kid().task && kid().task.kind === 'school-go', 300); until(() => kid().x > 390 || kid().away, 900);
    const k = kid(), onRoad = Math.abs(k.y - 66) < 3 && k.x > 362; look(k.x + 6, 62, 0.5);
    return { lock: lock.why, onRoad, x: Math.round(k.x), gateShut: f.TA.state().inProps }; })()`,
    r => !/上过一天学/.test(r.lock || '') ? 'gate text ' + r.lock : !r.onRoad ? 'not on the road' : !r.gateShut ? 'gate open' : r.away !== 'school' ? 'never left' : r.days !== 1 ? 'school days ' + r.days : !r.home || r.homeAt[0] > 360 ? 'not home ' + r.homeAt : null,
    `until(() => kid().away === 'school', 600); const away = kid().away, days = S.town.school.kid0; until(() => tod() >= 15 * 60 + 30, 3000); const k = kid();
    return { away, days, home: !k.away, homeAt: [Math.round(k.x), Math.round(k.y)], log: S.events.map(e => e.msg).filter(l => /上学|放学/.test(l)).slice(0, 2) };`);
  // 2. the shop's land tab: 隔壁镇子 with its gate text until a child has been to school
  await shot('v580_shop_town.png', `(() => { ${setup} road(); f.refreshUI(); document.getElementById('shopBtn').click(); const t = document.querySelector('#shop [data-tab="land"]'); t && t.click(); f.refreshUI();
    const c = document.querySelector('#shop [data-item="town"]'); c && c.scrollIntoView({ block: 'center' });
    return { tab: !!t, card: !!c, text: c ? c.textContent.replace(/\\s+/g, ' ').slice(0, 160) : '' }; })()`, r => !r.card ? 'no card' : !/隔壁镇子/.test(r.text) || !/上过一天学/.test(r.text) ? 'card text' : null);
  // 3. bought: the gate opens; the town with its school, shop, houses, square and neighbours out by the clock
  await shot('v580_town.png', `(() => { ${setup} dry(); const ok = openTown(); at(10 * 60); f.advance(2, 10); until(() => f.NEIGH.filter(n => n.out && !n.moving).length >= 3, 400);
    look(540, 66, 0); return { ok, eff: S.eff.town, open: f.TA.state().gate === 1 && !f.TA.state().inProps, out: f.NEIGH.filter(n => n.out).map(n => n.name), coins: S.coins }; })()`,
    r => !r.ok || !r.eff ? 'buy' : !r.open ? 'gate' : r.out.length < 3 ? 'neighbours ' + r.out : null);
  // 4. a school morning with the town open: the child walks the road, in at the gate, across to the school door
  await shot('v580_school_town.png', `(() => { ${setup} dry(); openTown(); at(7 * 60 + 50); until(() => kid().task && kid().task.kind === 'school-go', 300);
    until(() => kid().x > 520 || kid().away, 1500); const k = kid(); look(560, 56, 0.3); return { pos: [Math.round(k.x), Math.round(k.y)], inTown: f.TN.inTown(k.x, k.y) }; })()`,
    r => !r.inTown ? 'not in town ' + r.pos : !/镇上的学校/.test(r.log[0] || '') ? 'no school log' : r.away !== 'school' ? 'never got to school' : Math.hypot(r.at[0] - r.door.x, r.at[1] - r.door.y) > 2 ? 'not at the school door ' + r.at : r.home !== true ? 'not home after school' : null,
    `until(() => kid().away === 'school', 600); const at_ = [Math.round(kid().x), Math.round(kid().y)], away = kid().away; until(() => tod() >= 16 * 60, 3000);
    return { away, at: at_, door: f.TN.SCHOOL_DOOR, home: !kid().away && kid().x < 360, log: S.events.map(e => e.msg).filter(l => /学校/.test(l)).slice(0, 1) };`);
  // 5. a classmate: after 6+ school days one comes home with the child, goes to the playground first, then the animals, and leaves before evening
  await shot('v580_classmate.png', `(() => { ${setup} dry(); openTown(); f.buyPlot('play', 'playground'); S.town.school.kid0 = 9;
    let d = 31; for (; d < 80; d++) { day(d); S.town.mate.day = 0; S.town.mate.last = 0; const before = f.VISITORS.length; f.townMateHome(kid(), f.schoolRoute()); if (f.VISITORS.length > before) break; }
    const v = f.VISITORS[0]; if (!v) return { none: true }; f.VISITORS.length = 0; S.town.mate.day = 0; S.town.mate.last = 0;
    at(13 * 60 + 50); const k = kid(); k.away = 'school'; k.home = false; k.task = null; dry(); until(() => f.VISITORS.length && !kid().away, 600);
    const g = f.VISITORS[0]; if (!g) return { none2: true, d };
    const first = g.stops[0] && g.stops[0].what; until(() => g.what === 'play' && !g.pts.length, 2000); look(g.x, g.y, 0.3);
    const spot = [Math.round(g.x), Math.round(g.y)], name = g.name, t = tod(); f.advance(0.1, 10);
    return { d, name, first, spot, t, log: S.events.map(e => e.msg).filter(l => /同学/.test(l)).slice(-1) }; })()`,
    r => r.none || r.none2 ? 'no classmate' : !(r.log[0] || '').includes('同学' + r.name) ? 'no arrival log' : r.first !== 'play' ? 'playground not first: ' + r.first : !['阿团', '朵朵', '石头'].includes(r.name) ? 'name ' + r.name : r.t > 16 * 60 ? 'too late' : null);
  // 6. the classmate goes home by 16:40, off the farm by evening
  await shot('v580_classmate_leaves.png', `(() => { ${setup} dry(); S.town.school.kid0 = 9; road();
    let d = 31; for (; d < 80; d++) { day(d); S.town.mate.day = 0; S.town.mate.last = 0; const before = f.VISITORS.length; f.townMateHome(kid(), f.schoolRoute()); if (f.VISITORS.length > before) break; }
    const g = f.VISITORS[0]; if (!g) return { none: true }; const name = g.name; at(15 * 60 + 50); until(() => g.leaving, 400); until(() => g.x > 250 || !f.VISITORS.length, 1500);
    look(g.x + 10, 66, 0.3); return { name, midway: [Math.round(g.x), Math.round(g.y)], leaving: g.leaving }; })()`,
    r => r.none ? 'no classmate' : r.name !== '同学' ? 'named before the town: ' + r.name : !r.leaving ? 'not leaving' : !r.gone || r.t > 18 * 60 ? 'still here at ' + r.t : null,
    `until(() => !f.VISITORS.length, 1500); return { gone: !f.VISITORS.length, t: tod(), log: S.events.map(e => e.msg).filter(l => /同学/.test(l)).slice(0, 2) };`);
  // 7. a day off: on a rain day now and then the child stays home (never as a punishment) and plays instead
  await shot('v580_dayoff.png', `(() => { ${setup} road(); let d = 31, off = false;
    for (; d < 90 && !off; d++) { day(d); S.weather.rained = true; S.weather.lastDay = d; S.town.skip = {}; S.town.last = {}; kid()._skipDay = 0; off = f.townSkip(kid()); }
    d--; S.town.skip = {}; kid()._skipDay = 0; at(7 * 60 + 40); S.weather.rained = true; S.weather.lastDay = d; until(() => tod() >= 9 * 60 + 30, 900);
    const k = kid(); look(k.x, k.y, 0.3); return { d, off, away: k.away, task: k.task && k.task.kind, skip: S.town.skip.kid0, days: S.town.school.kid0 | 0, log: S.events.map(e => e.msg).filter(l => /请假/.test(l)).slice(0, 1) }; })()`,
    r => !r.off ? 'never a day off' : !/请假/.test(r.log[0] || '') ? 'no day-off log' : r.away ? 'went anyway' : r.skip !== r.d ? 'not recorded' : r.days ? 'counted as a school day' : null);
  // 8. the town shop: a grown-up walks over with workshop goods, honey and fish and gets a fifth more than the market
  await shot('v580_town_trade.png', `(() => { ${setup} dry(); openTown(); at(9 * 60 + 10); const F = f.FARMER; F.crops.length = 0; F.crops.push('jam', 'jam', 'honey', 'carp', 'carrot');
    const goods = ['jam', 'jam', 'honey', 'carp'], base = goods.reduce((s, t) => s + f.priceOfAny(t), 0), want = goods.reduce((s, t) => s + f.TN.tradePrice(f.priceOfAny(t)), 0) - base; F.task = null;
    until(() => F.task && F.task.kind === 'towntrade', 200); const going = !!(F.task && F.task.kind === 'towntrade');
    until(() => !F.crops.some(t => t === 'jam'), 1500); look(f.TN.SHOP_DOOR.x, f.TN.SHOP_DOOR.y + 4, 0.3);
    return { going, base, want, left: F.crops.slice(), extra: S.town.trade, log: S.events.map(e => e.msg).filter(l => /小店/.test(l)).slice(0, 1) }; })()`,
    r => !r.going ? 'no trip' : r.extra !== r.want || r.want < r.base * 0.15 ? 'extra ' + r.extra + ' want ' + r.want : r.left.includes('jam') || !r.left.includes('carrot') ? 'basket ' + r.left : !r.log.length ? 'no log' : null);
  // 9. a party evening with the town open: 阿松 and 小桃 set out from their houses in town and walk over
  await shot('v580_party_town.png', `(() => { ${setup} dry(); openTown(); f.buy('party'); at(8 * 60); until(() => !Object.keys(S.decor.inv).length && !S.decor.orders.length, 900);
    const area = f.partyArea(); if (!area) return { area: false }; S.decor.party.tonight = S.day; S.decor.party.guests = 2; S.decor.party.at = S.day - 5;
    at(15 * 60 + 50); dry(); until(() => f.GUESTS.length, 200); const fromTown = f.GUESTS.length === 2 && f.GUESTS.every(g => f.TN.inTown(g.x, g.y, 2));
    until(() => tod() >= 16 * 60 + 20, 600); const g0 = f.GUESTS[0]; look(g0.x - 14, g0.y, 0.4);
    return { fromTown, mid: f.GUESTS.map(g => [Math.round(g.x), Math.round(g.y)]), hidden: f.NEIGH.filter(n => n.out && (n.look === 'guestA' || n.look === 'guestB')).length }; })()`,
    r => r.area === false ? 'no party area' : !r.fromTown ? 'guests not from town' : r.hidden ? 'doubled as neighbours' : r.near < 2 ? 'guests not at the party by 18:30: ' + r.near : !r.home ? 'guests not home after' : null,
    `const area = f.partyArea(); until(() => tod() >= 18 * 60 + 30, 900); const near = f.GUESTS.filter(g => Math.hypot(g.x - area.x, g.y - area.y) < 18).length;
    until(() => tod() >= 23 * 60, 1500); return { near, home: !f.GUESTS.length, log: S.events.map(e => e.msg).filter(l => /镇上动身|派对/.test(l)).slice(0, 2) };`);
  // 10. the day-59 manor save (v10) loads in v5.8.0: town unbought, school days from today, the gate shut, still plays a day
  if (!only || 'v580_fixture_day59.png'.includes(only)) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8')), save = raw.save || raw;
    const p = await page('?manual');
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, s = f.snapshot(); f.advance(120, 10); const s2 = f.snapshot(); f.setAngle(0.5); f.panTo(420, 66); f.advance(0.3, 10);
      return { v: f.version, sv: s.saveVersion, day: s.clock.day, town: s.town, up: s.upgrades.town, eff: f.S.eff.town, plots: Object.keys(s.plots).length, animals: s.animals.length, later: s2.clock.t > s.clock.t, gateShut: f.TA.state().inProps }; });
    await p.screenshot({ path: path.join(OUT, 'v580_fixture_day59.png') });
    const empty = JSON.stringify({ school: {}, last: {}, skip: {}, mate: { last: 0, day: 0, kid: null, who: 0 }, trade: 0, lots: {}, hall: require('../hall.js').empty() }); // v5.10.0: + an empty hall; v5.10.6: + lots
    const bad = r.v !== VERSION ? 'version' : r.sv !== SAVE_V ? 'saveVersion' : r.day !== save.clock.day ? 'day' : JSON.stringify(r.town) !== empty ? 'town not empty' : r.up !== 0 || r.eff ? 'town bought' : !r.gateShut ? 'gate open' : r.plots !== Object.keys(save.plots || {}).length ? 'plots' : r.animals !== save.animals.length ? 'animals' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'v580_fixture_day59.png', JSON.stringify(r)); if (bad) fails.push('fixture: ' + bad); await p.context().close();
  }
  if (net.length) fails.push('network: ' + net.slice(0, 3).join(' '));
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
