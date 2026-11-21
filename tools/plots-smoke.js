// Browser test for the outer ring (v5.5.0, used by CI):  node tools/plots-smoke.js
// Checks: the ring loads with no errors; plots stay locked until 阿禾 moves in; the shop's 地块 page lists the plots; the plot
// page buys a plot as a chosen module and re-zones it; the ground, tiles, fences and paths follow; plots survive a reload;
// 放牧草地 sends the sheep out by day. PF_USER_SAVE=/path/export.json also plays a real player's save (read-only copy).
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
let browser, base, failed = 0;
async function open(ctx, q = '?manual') {
  const p = await ctx.newPage({ viewport: { width: 1280, height: 800 } }); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(`${base}/index.html${q}`); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 20000 });
  return p;
}
async function test(name, fn) {
  if (process.env.PF_ONLY && !new RegExp(process.env.PF_ONLY).test(name)) return;
  const ctx = await browser.newContext();
  try { await fn(ctx); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', String(e.message).split('\n').slice(0, 6).join('\n      ')); }
  await ctx.close();
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

  await test('ring loads: river, cliff and locked plots on the ground, nothing bought, plots locked until 阿禾 moves in', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { const f = __farm, PL = f.PL; return { world: f.WORLD, plots: f.S.plots, river: f.groundAt(24, 316)[1], bank: f.groundAt(24, 326)[1], cliff: f.groundAt(100, PL.ridgeY(100) - 2)[1],
      wild: f.groundAt(-80, 160)[1], high: f.groundAt(0, -190)[1], gate: f.plotOffer('glade', 'field').reason, v: f.version, regions: f.S.eff.regions.length }; });
    assert.deepStrictEqual(r.world, { x0: -256, y0: -208, x1: 1008, y1: 384 }); assert.deepStrictEqual(r.plots, {}); // v5.8.0: +24 tiles east for the town
    assert.strictEqual(r.river, 'water'); assert.strictEqual(r.bank, 'sand'); assert.strictEqual(r.cliff, 'rock'); assert.strictEqual(r.wild, 'wild'); assert.strictEqual(r.high, 'high');
    assert.strictEqual(r.gate, 'gate'); assert.strictEqual(r.v, '5.11.0.22'); assert.strictEqual(r.regions, 0);
    await p.keyboard.press('b'); await p.click('#shop [data-tab="land"]');
    const txt = await p.textContent('#shop'); assert(txt.includes('外圈新地块') && txt.includes('阿禾搬来后开放') && txt.includes('林间空地'), txt.slice(0, 200));
    await p.click('#shop [data-plot="glade"]'); const d = await p.textContent('#shop'); assert(d.includes('要先有 2 个人一起干活'));
    assert(await p.$eval('#shop [data-pbuy="glade:field"]', b => b.disabled));
    assert.deepStrictEqual(p.errs, []);
  });

  await test('plot page: buy 林间空地 as 农田, its tiles open, ground and paths follow; re-zone to 花甸; reload keeps it', async ctx => {
    const p = await open(ctx);
    await p.evaluate(() => { const S = __farm.S; S.family.met = 1; S.family.moved = 1; S.coins = 20000; __farm.FARMER.wood = 100; __farm.refreshUI(); });
    await p.keyboard.press('b'); await p.click('#shop [data-tab="land"]'); await p.click('#shop [data-plot="glade"]');
    const txt = await p.textContent('#shop'); for (const m of ['农田', '果园', '花甸', '乐园']) assert(txt.includes(m), 'module ' + m);
    const before = await p.evaluate(() => ({ g: __farm.groundAt(-75, 161)[1], reach: __farm.pathTo({ x: -10, y: 160 }, { x: -75, y: 161 }).reached }));
    assert.strictEqual(before.g, 'wild'); assert.strictEqual(before.reach, false);
    await p.click('#shop [data-pbuy="glade:field"]');
    const a = await p.evaluate(() => { const f = __farm, S = f.S; return { plots: S.plots, coins: S.coins, open: f.tiles.filter(t => t.f === 'glade' && t.open).length, all: f.tiles.filter(t => t.f === 'glade').length,
      g: f.groundAt(-75, 161)[1], reach: f.pathTo({ x: -10, y: 160 }, { x: -75, y: 161 }).reached, regions: S.eff.regions.includes('glade'), page: document.getElementById('shop').textContent }; });
    assert.deepStrictEqual(Object.keys(a.plots), ['glade']); assert.strictEqual(a.plots.glade.mod, 'field'); assert.strictEqual(a.coins, 20000 - 2400);
    assert.strictEqual(a.open, a.all); assert.strictEqual(a.all, 24); assert.strictEqual(a.g, 'dirt'); assert(a.reach, 'the gate opened'); assert(a.regions); assert(a.page.includes('现在：农田'));
    await p.evaluate(() => { const t = __farm.tiles.find(t => t.f === 'glade'); t.tilled = true; t.crop = { type: 'carrot', age: 9, n: 0, rot: 0 }; });
    await p.click('#shop [data-pzone="glade:meadow"]');
    const b = await p.evaluate(() => { const f = __farm, S = f.S; return { mod: S.plots.glade.mod, coins: S.coins, wood: f.FARMER.wood, open: f.tiles.filter(t => t.f === 'glade' && t.open).length, crops: f.tiles.filter(t => t.f === 'glade' && t.crop).length, g: f.groundAt(-75, 161)[1] }; });
    assert.strictEqual(b.mod, 'meadow'); assert.strictEqual(b.open, 0); assert.strictEqual(b.crops, 0); assert.strictEqual(b.g, 'grass'); assert.strictEqual(b.wood, 90);
    assert(b.coins >= 20000 - 2400 - 600 && b.coins <= 20000 - 2400 - 600 + 20, 'fee 600, a ripe carrot sold: ' + b.coins);
    await p.evaluate(() => __farm.saveNow()); await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI);
    const c = await p.evaluate(() => ({ plots: __farm.S.plots, regions: __farm.S.eff.regions.includes('glade'), g: __farm.groundAt(-75, 161)[1] }));
    assert.strictEqual(c.plots.glade.mod, 'meadow'); assert(c.regions); assert.strictEqual(c.g, 'grass');
    assert.deepStrictEqual(p.errs, []);
  });

  await test('the bridge, across the river, the trail and the mountain; a workday with every plot bought has no errors', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { const f = __farm, S = f.S; S.family.met = 1; S.family.moved = 1; S.coins = 1e5; f.FARMER.wood = 600; f.buy('axe');
      const no = f.plotOffer('swacross', 'field').reason;
      const buys = [['bridge'], ['swacross', 'field'], ['seacross', 'dam'], ['trail'], ['summit', 'orchard'], ['alp', 'woodland'], ['play', 'playground'], ['wbank', 'workshop'], ['eroad'], ['eslope', 'pasture'], ['nwslope', 'woodland']].map(([id, m]) => f.buyPlot(id, m).ok);
      const cross = f.pathTo({ x: 24, y: 280 }, { x: -40, y: 355 }), up = f.pathTo({ x: 200, y: -60 }, { x: 300, y: -186 });
      const trees = S.trees.filter(t => t.id.startsWith('xalp')).length;
      for (let i = 0; i < 6; i++) f.advance(120, 10);
      return { no, buys, cross: cross.reached, crossLen: cross.length, up: up.reached, trees, chop: f.orderChop('xalp0'), day: S.day };
    });
    assert.strictEqual(r.no, 'needs'); assert(r.buys.every(Boolean), JSON.stringify(r.buys)); assert(r.cross && r.crossLen < 170, 'over the bridge ' + r.crossLen); assert(r.up, 'up the trail');
    assert(r.trees >= 8, 'woodland trees ' + r.trees); assert(r.chop && r.chop.ok !== false, 'woodland trees can be marked ' + JSON.stringify(r.chop));
    assert.deepStrictEqual(p.errs, []);
  });

  await test('放牧草地: a fold upgrade (600 + 30 wood); sheep go out to graze by day and come back at night', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(async () => { const f = __farm, S = f.S; S.coins = 1e5; f.FARMER.wood = 200;
      for (const id of ['orchard', 'fold', 'sheep', 'sheep']) f.buy(id); const w0 = f.FARMER.wood, ok = f.buy('graze').ok, spent = w0 - f.FARMER.wood;
      const G = f.PL.GRAZE.rect, inG = v => v.x >= G[0] - 2 && v.x <= G[2] + 2 && v.y >= G[1] - 2 && v.y <= G[3] + 2;
      S.t = Math.floor(S.t / 1440) * 1440 + 9 * 60; let best = 0;
      for (let i = 0; i < 40; i++) { f.advance(10, 10); best = Math.max(best, [...f.AV.values()].filter(v => v.sim.kind === 'sheep' && inG(v)).length); }
      const day = best; S.t = Math.floor(S.t / 1440) * 1440 + 20 * 60; for (let i = 0; i < 30; i++) f.advance(10, 10);
      const night = [...f.AV.values()].filter(v => v.sim.kind === 'sheep' && inG(v)).length;
      return { up: S.up.graze, graze: S.eff.graze, sheep: S.animals.filter(a => a.kind === 'sheep').length, day, night, ground: f.groundAt(-180, -30)[1], spent, ok };
    });
    assert.strictEqual(r.up, 1); assert(r.graze); assert.strictEqual(r.sheep, 2); assert(r.day >= 1, 'a sheep out on the meadow by day ' + r.day); assert.strictEqual(r.night, 0); assert.strictEqual(r.ground, 'grass'); assert(r.ok); assert.strictEqual(r.spent, 30);
    assert.deepStrictEqual(p.errs, []);
  });

  await test('乐园: a play-stage kid walks to the slide / sandbox / swing on her own, and the first go unlocks 童年 DNA 动了', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; S.coins = 1e6; f.FARMER.wood = 900; for (const id of ['house', 'house', 'house']) f.buy(id);
      S.day = 40; Object.assign(S.family, { love: 100, met: 3, moved: 10, kids: [{ id: 'kid0', name: '小豆', born: 32 }] }); f.syncFamily();
      const buy = f.buyPlot('play', 'playground').ok; S.t = Math.floor(S.t / 1440) * 1440 + 9 * 60; const seen = {};
      for (let i = 0; i < 3000 && !(S.achievements || []).some(a => a.id === 'firstpark'); i++) { f.advance(0.5, 5);
        const k = S.members.find(m => m.id === 'kid0'); if (k && k.task) seen[k.task.kind] = 1; }
      return { buy, seen: Object.keys(seen), ach: (S.achievements || []).map(a => a.id) }; });
    assert(r.buy); assert(r.seen.some(k => /play-(slide|sandbox|swing)/.test(k)), 'played in the park: ' + r.seen.join(','));
    assert(r.ach.includes('firstpark'), 'achievement: ' + r.ach.join(','));
    assert.deepStrictEqual(p.errs, []);
  });

  await test('小镇做题家: a school-age kid walks off to school in the morning and the achievement lights', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; S.coins = 1e6; f.FARMER.wood = 900; for (const id of ['house', 'house', 'house']) f.buy(id);
      S.day = 40; Object.assign(S.family, { love: 100, met: 3, moved: 10, kids: [{ id: 'kid0', name: '小豆', born: 22 }] }); f.syncFamily();
      const stage = f.FAM.kidStage(S.family.kids[0], S.day); S.t = Math.floor(S.t / 1440) * 1440 + 6 * 60 + 40; let away = false;
      for (let i = 0; i < 3000 && !away; i++) { f.advance(0.5, 5); const k = S.members.find(m => m.id === 'kid0'); away = !!(k && k.away === 'school'); }
      return { stage, away, ach: (S.achievements || []).map(a => a.id), log: document.body.textContent.includes('去上学了') }; });
    assert.strictEqual(r.stage, 'school'); assert(r.away, 'went to school'); assert(r.ach.includes('school'), 'achievement: ' + r.ach.join(','));
    assert.deepStrictEqual(p.errs, []);
  });

  await test('price signs: at the default zoom no sign overlaps another sign or the HUD, wherever the camera is', async ctx => {
    for (const [vw, vh] of [[1280, 800], [1600, 1000], [1024, 640]]) {
      const p = await ctx.newPage(); await p.setViewportSize({ width: vw, height: vh }); p.errs = []; p.on('pageerror', e => p.errs.push(String(e)));
      await p.goto(`${base}/index.html?manual`); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI && __farm.signRects, null, { timeout: 20000 });
      await p.evaluate(() => { const f = __farm, S = f.S; S.family.met = 1; S.family.moved = 1; S.coins = 60000; f.refreshUI(); });
      for (const [x, y] of [[96, 96], [24, 300], [200, -150], [-120, 100], [380, 60], [-150, -120], [100, 340]]) {
        await p.evaluate(([x, y]) => { __farm.setAngle(0); __farm.panTo(x, y); __farm.advance(0.05, 1); }, [x, y]);
        await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const r = await p.evaluate(() => ({ signs: __farm.signRects(), hud: __farm.hudRects() }));
        const hit = (a, b) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;
        for (let i = 0; i < r.signs.length; i++) for (let j = i + 1; j < r.signs.length; j++)
          assert(!hit(r.signs[i], r.signs[j]), `${vw}x${vh} @${x},${y}: ${r.signs[i].text} overlaps ${r.signs[j].text}`);
        for (const s of r.signs) for (const h of r.hud) assert(!hit(s, { x0: h[0] + 4, y0: h[1] + 4, x1: h[2] - 4, y1: h[3] - 4 }), `${vw}x${vh} @${x},${y}: ${s.text} under the HUD ${JSON.stringify(h)}`);
      }
      assert.deepStrictEqual(p.errs, []); await p.close();
    }
  });

  const USER = process.env.PF_USER_SAVE;
  if (USER && fs.existsSync(USER)) await test('a real player save loads in v5.8.1, keeps everything, buys a plot and plays a day', async ctx => {
    const raw = JSON.parse(fs.readFileSync(USER, 'utf8')), save = raw.save || raw, p = await open(ctx);
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI);
    const r = await p.evaluate(() => { const f = __farm, S = f.S, s = f.snapshot(); const buy = f.buyPlot('eshore', 'field'); f.advance(300, 10);
      return { v: s.saveVersion, coins: s.coins - ((f.SAVE.offline && f.SAVE.offline.gold) || 0), day: s.clock.day, tiles: s.tiles.length, trees: s.trees.length, animals: s.animals.length, open: s.tiles.filter(t => t.open).length, up: s.upgrades, farmer: s.farmer, buy: buy.ok, after: S.coins, plots: S.plots }; });
    assert.strictEqual(r.v, 11); assert.strictEqual(r.coins, save.coins); assert.strictEqual(r.day, save.clock.day); assert.strictEqual(r.trees, save.trees.length); assert.strictEqual(r.animals, save.animals.length);
    assert.strictEqual(r.open, save.tiles.filter(t => t.open).length); assert(r.tiles >= save.tiles.length);
    for (const k of Object.keys(save.upgrades)) assert.strictEqual(r.up[k], save.upgrades[k], k);
    assert.deepStrictEqual([r.farmer.x, r.farmer.y], [save.farmer.x, save.farmer.y]); assert(r.buy, 'can buy a plot (阿禾 has moved in)');
    assert.deepStrictEqual(p.errs, []);
  });

  await browser.close(); server.close();
  if (failed) { console.log(`plots-smoke: ${failed} failed`); process.exit(1); }
  console.log('plots-smoke: ok');
})();
