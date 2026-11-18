// Screenshots + browser checks for phase 8 (v5.6.0):  node tools/works-shots.js [name-filter]
//   writes /workspace/pf-shots/v560_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
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
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };`;
  const shot = async (name, fn, check, vw, vh) => { if (only && !name.includes(only)) return;
    const p = await page('?manual', vw, vh); const r = await p.evaluate(fn); await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, name) });
    const bad = check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. sprinklers: bought in the shop, the family sets them down along the home field; at 6:00 they spray and water
  await shot('v560_sprinklers.png', `(() => { ${setup} for (let i = 0; i < 4; i++) f.buy('sprinkler'); at(9 * 60);
    for (let i = 0; i < 400 && S.works.sprinklers.length < 4; i++) f.advance(1, 10);
    f.tiles.forEach(t => { t.watered = false; }); for (const t of f.tiles) if (t.open && t.f === 'home' && !t.crop) { t.tilled = true; t.crop = { type: 'pumpkin', age: 1, n: 0, stage: 1 }; }
    f.worksTick(1); const cov = f.tiles.filter(t => t.open && t.f === 'home' && t.crop && t.watered).length, open = f.tiles.filter(t => t.open && t.f === 'home').length;
    S.works.sprinklers.forEach(s => { s.spray = 1e9; }); f.setAngle(0); f.panTo(96, 76); f.advance(0.5, 10);
    return { placed: S.works.sprinklers.length, watered: cov, homeOpen: open, board: f.board().map(j => j.kind).filter(k => k === 'install').length }; })()`,
    r => r.placed !== 4 ? 'placed ' + r.placed : r.watered < r.homeOpen ? 'watered ' + r.watered : r.board ? 'install still posted' : null);
  // 2. moving one: the tool shows every sprinkler's patch, the picked one, and where it would go
  await shot('v560_sprinkler_move.png', `(() => { ${setup} for (let i = 0; i < 3; i++) f.buy('sprinkler'); at(9 * 60);
    for (let i = 0; i < 400 && S.works.sprinklers.length < 3; i++) f.advance(1, 10);
    f.setMode('sprinkler'); const s = S.works.sprinklers[0], before = { x: s.x, y: s.y }; f.sprinklerClick({ x: s.x, y: s.y }); const picked = f.input.sprPick;
    const bad = f.sprinklerClick({ x: f.tiles[0].x, y: f.tiles[0].y }); const dest = { x: s.x, y: s.y + 0 }; f.input.sprPick = 0;
    f.input.hover = { spr: { x: before.x + 16, y: before.y, ok: true } }; f.setAngle(0); f.panTo(96, 70); f.advance(0.2, 10); f.input.hover = { spr: { x: before.x + 16, y: before.y, ok: true } }; f.render();
    return { picked, refusedOnTile: !!(bad && !bad.ok), n: S.works.sprinklers.length }; })()`,
    r => r.picked !== 0 ? 'pick' : !r.refusedOnTile ? 'tile spot accepted' : null);
  // 3. workshops on a 工坊院 plot: mill, jam shop, cheese house; goods in, products out, mill feed to the barn
  await shot('v560_workshops.png', `(() => { ${setup} f.buy('cow'); f.buyPlot('wbank', 'workshop'); const gm = f.buy('mill'), gj = f.buy('jam'), gc = f.buy('cheese'); at(10 * 60);
    const W = S.works.works; W.mill.inp = 8; W.jam.inp = 8; W.cheese.inp = 6; const hay0 = S.hay; f.worksTick(1); f.worksTick(400);
    const r = f.PL.plot('wbank').rect; f.setAngle(0); f.panTo((r[0] + r[2]) / 2, (r[1] + r[3]) / 2 + 6); f.advance(0.5, 10);
    return { mill: gm.ok, jam: gj.ok, cheese: gc.ok, ready: [W.mill.ready, W.jam.ready, W.cheese.ready], hay: S.hay - hay0, slots: [W.mill.slot, W.jam.slot, W.cheese.slot] }; })()`,
    r => !(r.mill && r.jam && r.cheese) ? 'buy' : r.ready.some(x => !(x > 0)) ? 'no products' : r.hay < 2 ? 'no feed' : null);
  // 4. the family runs it: wheat is planted for the mill, carried in, flour comes out and is sold
  await shot('v560_wheat.png', `(() => { ${setup} f.buyPlot('wbank', 'workshop'); f.buy('mill'); at(7 * 60); const coins0 = S.coins;
    let wheatSeen = 0, deliv = 0, flourSold = 0; const sold0 = S.totalSold;
    for (let d = 0; d < 8 * 24 * 6 && !(S.works.works.mill.ready || S.events.some(e => /面粉/.test(e.msg))); d++) { f.advance(1, 10); wheatSeen = Math.max(wheatSeen, f.tiles.filter(t => t.crop && t.crop.type === 'wheat').length); deliv = Math.max(deliv, S.works.works.mill.inp + S.works.works.mill.ready + (S.works.works.mill.left > 0 ? 2 : 0)); if (S.log.some(l => /面粉/.test(l))) flourSold++; }
    f.tiles.filter(t => t.crop && t.crop.type === 'wheat').slice(0, 6).forEach(t => { t.crop.age = 9; t.crop.stage = 3; });
    f.setAngle(0); f.panTo(96, 70); f.advance(0.3, 10);
    return { wheatSeen, deliv, day: S.day, events: S.events.filter(e => /小麦|磨坊|面粉/.test(e.msg)).length, sample: S.events.filter(e => /小麦|磨坊|面粉/.test(e.msg)).slice(-4).map(e => e.msg) }; })()`,
    r => !r.wheatSeen ? 'no wheat planted' : !(r.deliv || r.sample.some(m => /送了|面粉/.test(m))) ? 'mill never worked' : null);
  // 5. night: the water wheel turns, the lamps it reaches are lit; a lamp too far away stays dark with a small mark
  await shot('v560_lamps_night.png', `(() => { ${setup} f.buyPlot('sbank', 'dam'); const w = f.buy('wheel'); at(21 * 60); f.setAngle(0); f.panTo(96, 70); f.advance(0.5, 10);
    const lit = f.PWA.litLamps().length; return { wheel: w.ok, lit }; })()`, r => !r.wheel ? 'wheel' : r.lit < 5 ? 'lit ' + r.lit : null);
  await shot('v560_lamps_far.png', `(() => { ${setup} f.buyPlot('sbank', 'dam'); f.buyPlot('eslope', 'meadow'); f.buy('wheel'); at(21 * 60);
    const r = f.PL.plot('eslope'), far = f.PWA.litLamps().some(l => l.id === 'peslope'); f.setAngle(0); f.panTo(r.gate.x + 10, r.gate.y); f.advance(0.5, 10); return { farLit: far }; })()`, r => r.farLit ? 'far lamp lit' : null);
  await shot('v560_waterwheel.png', `(() => { ${setup} f.buyPlot('sbank', 'dam'); f.buy('wheel'); at(10 * 60); const w = f.PL.plot('sbank').wheel; const q = f.XP.wheelProp('sbank'); f.setAngle(Math.PI / 2 + 0.22);
    const ms = new Set(); for (let i = 0; i < 12; i++) { f.advance(0.07, 30); ms.add(q && q.m); } f.panTo(w.x, w.y); f.advance(0.1, 10); return { frames: ms.size }; })()`, r => r.frames < 2 ? 'wheel not turning' : null);
  // 6. hives in a 花甸 with bees, honey ready; the bee goes into the insect book
  await shot('v560_hives.png', `(() => { ${setup} f.buyPlot('glade', 'meadow'); let n = 0; for (let i = 0; i < 6; i++) if (f.buy('hive').ok) n++; const extra = f.buy('hive'); at(11 * 60);
    S.works.hives.forEach((h, i) => { if (i % 2) h.ready = 1; }); const r = f.PL.plot('glade').rect; f.setAngle(0); f.panTo((r[0] + r[2]) / 2, (r[1] + r[3]) / 2); f.advance(0.6, 10);
    return { n, extraRefused: !extra.ok, bee: !!S.codex.entries['bug:bee'], honeyJobs: f.board().filter(j => j.kind === 'honey').length }; })()`,
    r => r.n !== 6 ? 'hives ' + r.n : !r.extraRefused ? 'seventh hive' : !r.bee ? 'no bee in the book' : null);
  await shot('v560_hives_orchard.png', `(() => { ${setup} const a = f.buy('hive'), b = f.buy('hive'), c = f.buy('hive'); at(11 * 60); f.setAngle(0); f.panTo(-56, -58); f.advance(0.6, 10);
    return { two: a.ok && b.ok, third: c.ok, why: c.why }; })()`, r => !r.two ? 'orchard hives' : r.third ? 'third orchard hive' : null);
  // 7. second pens on a 牧场 plot: animals past the first building's room live there
  await shot('v560_pens2.png', `(() => { ${setup} f.buy('sty'); const locked = f.buy('coop2'); f.buyPlot('eslope', 'pasture'); const res = ['coop2','sty2','fold2','shed2'].map(id => f.buy(id).ok);
    for (let i = 0; i < 12; i++) f.buy('chicken'); for (let i = 0; i < 6; i++) { f.buy('pig'); f.buy('sheep'); f.buy('cow'); }
    at(10 * 60); for (let i = 0; i < 30; i++) f.advance(1, 10); const r = f.PL.plot('eslope').rect; f.setAngle(0); f.panTo((r[0] + r[2]) / 2, (r[1] + r[3]) / 2); f.advance(0.5, 10);
    const by = {}; S.animals.forEach(a => { const k = a.pen || a.kind; by[k] = (by[k] || 0) + 1; });
    return { lockedFirst: !locked.ok, built: res, host: S.works.penHost, by, busy: f.plotBusy('eslope'), animals: S.animals.length }; })()`,
    r => !r.lockedFirst ? 'pen2 without pasture' : r.built.some(x => !x) ? 'build' : r.by.coop2 !== 6 || r.by.shed2 !== 3 ? 'pens ' + JSON.stringify(r.by) : !r.busy ? 'host can be re-zoned' : null);
  // 8. the border collie herds the fold's sheep out in the morning (mid-drive), then watches them on the meadow
  const herdSetup = `${setup} f.buy('graze'); f.buy('dog'); f.buy('dog'); for (let i = 0; i < 3; i++) f.buy('sheep'); at(7 * 60 + 58);
    const G = f.PL.GRAZE.rect, sheep = () => S.animals.filter(a => a.kind === 'sheep').map(a => f.AV.get(a.id)), dog = () => { const d = f.PETS_LIVE.find(p => p.coat === 'collie'); return d && f.PV.get(d.id); };
    const look = () => { const sh = sheep(), cx = sh.reduce((s, v) => s + v.x, 0) / sh.length, cy = sh.reduce((s, v) => s + v.y, 0) / sh.length; f.setAngle(0); f.panTo(cx - 6, cy + 4); f.advance(0.1, 10); return [Math.round(cx), Math.round(cy)]; };`;
  await shot('v560_herding.png', `(() => { ${herdSetup} for (let i = 0; i < 10; i++) f.advance(1, 10); const flock = look(), d = dog();
    return { herd: f.herdOn(), flock, dog: d && [Math.round(d.x), Math.round(d.y)], t: S.t % 1440 }; })()`, r => !r.herd ? 'not herding' : !r.dog ? 'no collie' : null);
  await shot('v560_herding_meadow.png', `(() => { ${herdSetup} for (let i = 0; i < 30; i++) f.advance(1, 10); const sh = sheep(), out = sh.filter(v => v.x >= G[0] - 2 && v.x <= G[2] + 2 && v.y >= G[1] - 2 && v.y <= G[3] + 2).length;
    const d = dog(); look(); return { out, n: sh.length, dog: d && [Math.round(d.x), Math.round(d.y)], t: S.t % 1440 }; })()`, r => r.out < r.n ? 'flock not out by 9:30' : null);
  // 9. the shop's 工坊 tab, with the gates spelled out
  await shot('v560_shop_works.png', `(() => { ${setup} f.refreshUI(); document.getElementById('shopBtn').click(); const t = document.querySelector('#shop [data-tab="works"]'); t && t.click(); f.refreshUI();
    return { tab: !!t, text: document.getElementById('shop').textContent.includes('工坊院') }; })()`, r => !r.tab || !r.text ? 'works tab' : null);
  // 10. the day-59 manor save (v10) loads in v5.6.0 and plays on
  if (!only || 'v560_fixture_day59.png'.includes(only)) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8')), save = raw.save || raw;
    const p = await page('?manual');
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, s = f.snapshot(); f.advance(120, 10); f.setAngle(0); f.panTo(96, 70); f.advance(0.3, 10);
      return { v: f.version, sv: s.saveVersion, day: s.clock.day, coins: s.coins - ((f.SAVE.offline && f.SAVE.offline.gold) || 0), works: s.works, animals: s.animals.length, up: s.upgrades.house }; });
    await p.screenshot({ path: path.join(OUT, 'v560_fixture_day59.png') });
    const bad = r.v !== '5.6.0' ? 'version' : r.sv !== 12 ? 'saveVersion' : r.day !== save.clock.day ? 'day' : r.animals !== save.animals.length ? 'animals' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'v560_fixture_day59.png', JSON.stringify(r)); if (bad) fails.push('fixture: ' + bad); await p.context().close();
  }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
