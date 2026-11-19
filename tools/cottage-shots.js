// Close-ups of the new house (bigger cottage): day, night, the build, another angle:  node tools/cottage-shots.js [name-filter]
//   writes /workspace/pf-shots/cottage_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
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
  // a farm well along (day 70): the farmhouse grown to the manor, two children: 小豆 (born day 15, a teen) and 小米 (born 40, at school)
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','chicken','fold','sheep','shed','cow','dog','can','can','can','can']) f.buy(id);
    day(70); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily();`;

  // name: full frame; name_close: a 440x300 crop round the house at the screen centre
  const shot = async (name, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page('?manual'); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name + '.png') });
    await p.screenshot({ path: path.join(OUT, name + '_close.png'), clip: { x: 440, y: 250, width: 400, height: 260 } });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const fit = `const h = house(), L = f.HM.layout(h), hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const clash = [L.coopBlock, ...L.tiles.map(t => [t.x - 4, t.y - 4, t.x + 4, t.y + 4])].filter(b => hit(L.block, b)).length;`;
  // 1. day: the couple's house on 林间空地 (the v5.9.0 anchor -68,160 mirrored), smoke from the chimney, the six tiles and the hen house
  await shot('cottage_day', `(() => { ${setup} wed(); until(() => S.day === 72 && tod() >= 10 * 60, 3000); dry(); ${fit}
    look(h.x, h.y + 12, 0.35); f.advance(2, 10); return { at: [h.site, h.x, h.y, h.m], block: L.block, clash, smoke: f.HA.smoke().length }; })()`,
    r => r.clash ? 'overlap ' + r.clash : r.smoke !== 1 ? 'no smoke' : null);
  // 2. night: four windows and the lantern lit, the couple asleep inside
  await shot('cottage_night', `(() => { ${setup} wed(); until(() => S.day === 72 && tod() >= 21 * 60 + 40, 4000); const h = house(), k = kid();
    look(h.x, h.y + 12, 0.35); return { asleep: k.sleeping, at: [Math.round(k.x - h.x), Math.round(k.y - h.y)] }; })()`, r => !r.asleep ? 'not asleep' : null);
  // 3. the build: the frame at full size, the builder beside it (not inside)
  await shot('cottage_build', `(() => { ${setup} dry(); f.buyPlot('glade', 'meadow'); f.buy('cottage'); const h = house(), L = f.HM.layout(h); at(8 * 60);
    until(() => [f.FARMER, ...S.members].some(a => a.task && a.task.kind === 'homebuild' && Math.hypot(a.x - a.task.to.x, a.y - a.task.to.y) < 1.5), 900);
    const b = [f.FARMER, ...S.members].find(a => a.task && a.task.kind === 'homebuild'); f.advance(3, 10); look(h.x, h.y + 12, 0.35);
    const inside = b && b.x > L.block[0] && b.x < L.block[2] && b.y > L.block[1] && b.y < L.block[3];
    return { builder: b && b.name, at: b && [Math.round(b.x - h.x), Math.round(b.y - h.y)], inside, built: h.built }; })()`,
    r => !r.builder ? 'nobody building' : r.inside ? 'builder inside the walls' : null);
  // 4. a v15 save made by v5.9.0 (the small house, built, the couple moved in): same anchor, the bigger house fits its yard,
  //    nothing overlaps, the couple still gets to their tiles and their door
  if (!only || 'cottage_v15save'.includes(only)) {
    const save = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'), 'utf8'));
    const p = await page('?manual');
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, S = f.S, h = S.home.houses[0], L = f.HM.layout(h), hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
      const clash = [L.coopBlock, ...L.tiles.map(t => [t.x - 4, t.y - 4, t.x + 4, t.y + 4])].filter(b => hit(L.block, b)).length;
      const inYard = [L.block, L.coopBlock].every(b => b[0] >= L.foot[0] && b[2] <= L.foot[2] && b[1] >= L.foot[1] && b[3] <= L.foot[3]);
      const seen = {}; for (let i = 0; i < 900 && !(seen.hs && seen.home); i++) { f.advance(1, 10); const k = S.members.find(m => m.id === 'kid0');
        if (k.task && /^hs-/.test(k.task.kind) && Math.hypot(k.x - k.task.to.x, k.y - k.task.to.y) < 2) seen.hs = 1;
        if (S.t % 1440 > 21 * 60 && k.sleeping && Math.hypot(k.x - L.door.x, k.y - L.door.y) < 2) seen.home = 1; }
      f.setAngle(0.35); f.panTo(h.x, h.y + 12); f.advance(0.3, 10);
      return { sv: f.snapshot().saveVersion, at: [h.site, h.x, h.y, h.m, h.built, h.kid], clash, inYard, seen, props: f.HA.state().props }; });
    await p.screenshot({ path: path.join(OUT, 'cottage_v15save.png') });
    const bad = r.sv !== 15 ? 'saveVersion' : JSON.stringify(r.at) !== JSON.stringify(['glade', -68, 160, 1, save.home.houses[0].built, 'kid0']) ? 'anchor moved ' + r.at : r.clash ? 'overlap' : !r.inYard ? 'outside the yard' : !r.seen.hs ? 'never worked the tiles' : !r.seen.home ? 'never got home' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'cottage_v15save', JSON.stringify(r)); if (bad) fails.push('v15save: ' + bad); await p.context().close();
  }
  if (net.length) fails.push('network: ' + net.slice(0, 3).join(' '));
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
