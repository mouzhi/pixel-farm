// Browser test for saving (used by CI):  node tools/save-smoke.js [--write-fixture]
// Serves the repo root, then checks: save -> reload restores the same state; every fixture in tools/fixtures loads and
// plays a day; a broken save falls back to the backup; a newer save is left alone; offline gold is 50% / 3-day capped;
// export -> import round trip; reset starts over and keeps a copy; Phase 3: regions, chop and transplant orders, fruit.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures'), SAVE = require('../save.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const KEY = 'mouzhi/pixel-farm:save', BAK = KEY + ':bak';
let browser, base, failed = 0;
async function open(ctx) {
  const p = await ctx.newPage({ viewport: { width: 1280, height: 800 } }); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(`${base}/index.html?manual`); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.SAVE, null, { timeout: 15000 });
  return p;
}
// put raw strings into storage and reload without letting the running game save over them
async function seed(p, items) {
  await p.evaluate(items => { __farm.SAVE.off = true; localStorage.clear(); for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, items);
  await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.SAVE, null, { timeout: 15000 });
}
const core = p => p.evaluate(() => { const s = __farm.snapshot(); delete s.savedAt; return s; });
async function test(name, fn) {
  const ctx = await browser.newContext();
  try { await fn(ctx); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.split('\n')[0].slice(0, 300), '\n     ', e.message.split('\n').filter(l => /^[+-] /.test(l.trim()) || /^ *[+-]/.test(l)).slice(0, 30).join('\n      ')); }
  await ctx.close();
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

  await test('save -> reload restores the same farm', async ctx => {
    const p = await open(ctx); await p.evaluate(() => { __farm.advance(420, 10); __farm.saveNow(); });
    const a = await core(p); assert(a.clock.day >= 2, 'played into day 2'); assert(a.tiles.some(t => t.crop), 'has crops');
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.SAVE);
    const b = await core(p); delete a.log; delete b.log; assert.deepStrictEqual(b, a); assert.deepStrictEqual(p.errs, []);
    if (process.argv.includes('--write-fixture')) { const s = await p.evaluate(() => __farm.snapshot()); const f = `save-v${s.saveVersion}-day4.json`; fs.writeFileSync(path.join(FIX, f), JSON.stringify(s, null, 1) + '\n'); console.log('     wrote fixtures/' + f); }
  });
  for (const f of fs.readdirSync(FIX).filter(f => /^save-v\d+.*\.json$/.test(f))) await test(`fixture ${f} loads and plays a day`, async ctx => {
    const s = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')); s.savedAt = Date.now();
    const p = await open(ctx); await seed(p, { [KEY]: JSON.stringify(s) });
    const r = await p.evaluate(() => ({ day: __farm.S.day, coins: __farm.S.coins, notes: __farm.SAVE.notes }));
    assert.strictEqual(r.day, s.clock.day); assert.strictEqual(r.coins, s.coins || 0); assert.deepStrictEqual(r.notes, []);
    const d = await p.evaluate(() => { __farm.advance(330, 10); return __farm.S.day; }); assert(d > s.clock.day); assert.deepStrictEqual(p.errs, []);
  });
  await test('broken save falls back to the backup', async ctx => {
    const good = fs.readFileSync(path.join(FIX, 'save-v1-day4.json'), 'utf8'), day = JSON.parse(good).clock.day;
    const p = await open(ctx); await seed(p, { [KEY]: '{"saveVersion":1,"tiles":[', [BAK]: good.replace(/"savedAt": \d+/, `"savedAt": ${Date.now()}`) });
    const r = await p.evaluate(() => ({ day: __farm.S.day, notes: __farm.SAVE.notes, q: Object.keys(localStorage).filter(k => k.includes(':corrupt:')).length }));
    assert.strictEqual(r.day, day); assert(r.notes.includes('restored-from-backup')); assert.strictEqual(r.q, 1);
  });
  await test('a newer save is not overwritten', async ctx => {
    const newer = JSON.stringify({ saveVersion: 999, tiles: [{}], clock: { day: 77 } });
    const p = await open(ctx); await seed(p, { [KEY]: newer });
    const r = await p.evaluate(() => { __farm.advance(30, 10); __farm.saveNow(); return { day: __farm.S.day, notes: __farm.SAVE.notes, raw: localStorage.getItem('mouzhi/pixel-farm:save') }; });
    assert.strictEqual(r.day, 1); assert(r.notes.includes('newer-save')); assert.strictEqual(r.raw, newer);
  });
  await test('offline gold: 50% rate, 3-day cap, summary shown', async ctx => {
    const s = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-day4.json'), 'utf8'));
    s.stats.dayEarn = [100, 100, 100]; s.savedAt = Date.now() - 2 * 3600 * 1000;
    const p = await open(ctx); await seed(p, { [KEY]: JSON.stringify(s) });
    const r = await p.evaluate(() => ({ coins: __farm.S.coins, off: __farm.SAVE.offline, shown: !document.getElementById('offline').hidden, text: document.getElementById('offline').textContent }));
    assert.strictEqual(r.off.days, 3); assert(r.off.capped); assert.strictEqual(r.coins, s.coins + 300); assert(r.shown, 'summary visible'); assert(/300 金/.test(r.text));
    // a hidden tab for ~10 minutes of real time (simulated) settles the same way
    const g = await p.evaluate(() => { const c = __farm.S.coins; const o = __farm.settleOffline(626.67); return __farm.S.coins - c + ':' + o.days; });
    assert.strictEqual(g, '100:1');
  });
  await test('export -> import round trip, reset keeps a copy', async ctx => {
    const p = await open(ctx); await p.evaluate(() => __farm.advance(200, 10));
    const str = await p.evaluate(() => PFSave.encode(__farm.snapshot())), day = await p.evaluate(() => __farm.S.day);
    await p.evaluate(() => { document.getElementById('menuBtn').click(); }); assert(await p.evaluate(() => !document.getElementById('menu').hidden));
    await p.evaluate(() => __farm.reset()); await p.waitForFunction(() => window.__farm && __farm.SAVE);
    const r = await p.evaluate(() => ({ day: __farm.S.day, t: __farm.S.t, copies: Object.keys(localStorage).filter(k => k.includes(':reset:')).length }));
    assert.strictEqual(r.day, 1); assert(r.t < 400); assert.strictEqual(r.copies, 1);
    await p.evaluate(s => __farm.importState(PFSave.decode(s)), str); await p.waitForFunction(() => window.__farm && __farm.SAVE);
    assert.strictEqual(await p.evaluate(() => __farm.S.day), day);
  });
  await test('v1 save upgrades to the current version: nothing bought, still 12 tiles, yard is seeded', async ctx => {
    const s = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-day4.json'), 'utf8')); s.savedAt = Date.now();
    const p = await open(ctx); await seed(p, { [KEY]: JSON.stringify(s) });
    const r = await p.evaluate(() => { __farm.saveNow(); const v = JSON.parse(localStorage.getItem('mouzhi/pixel-farm:save'));
      return { v: v.saveVersion, up: v.upgrades, open: __farm.tiles.filter(t => t.open).length, coins: __farm.S.coins, speed: __farm.S.speed, yard: v.yard && v.yard.length, kinds: [...new Set((v.yard || []).map(c => c.type))] }; });
    assert.strictEqual(r.v, SAVE.CURRENT); assert(Object.values(r.up).every(x => x === 0)); assert.strictEqual(r.open, 12); assert.strictEqual(r.coins, s.coins); assert.strictEqual(r.speed, 1);
    assert(r.yard >= 8, 'old save should get a yard to tidy: ' + r.yard); assert(r.kinds.every(k => ['rock', 'branch', 'weed', 'pebble'].includes(k)));
    assert.deepStrictEqual(p.errs, []);
  });
  await test('day-1 afternoon: farmer tidies the yard instead of sitting by the pond', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      __farm.SAVE.off = true;
      const start = __farm.yard.length, seen = [];
      while (__farm.S.day === 1 && (__farm.S.t % 1440) < 19 * 60) {
        __farm.advance(8, 8);
        const k = __farm.F.task && __farm.F.task.kind, lab = __farm.S.label;
        if (k === 'tidy' || /院子|小石子/.test(lab)) seen.push(lab);
        if (seen.length && start - __farm.yard.length >= 2) break;
      }
      return { start, left: __farm.yard.length, seen: seen.slice(0, 4), label: __farm.S.label, t: Math.floor(__farm.S.t % 1440), planted: __farm.tiles.filter(t => t.open && t.crop).length, kind: __farm.F.task && __farm.F.task.kind };
    });
    assert(r.start >= 8, 'fresh farm has yard clutter: ' + r.start);
    assert(r.seen.length > 0, 'farmer should tidy the yard after the field is done: ' + JSON.stringify(r));
    assert(r.left < r.start, 'yard items should be cleared: ' + JSON.stringify(r));
    assert(!/坐在池塘边休息/.test(r.label) || r.left === 0, 'should not rest while clutter remains: ' + JSON.stringify(r));
    assert.deepStrictEqual(p.errs, []);
  });
  await test('shop: buy from the panel, upgrades survive reload, speed buttons work', async ctx => {
    const p = await open(ctx);
    await p.evaluate(() => { __farm.S.coins = 1000; }); await p.keyboard.press('b'); await p.waitForSelector('#shop:not([hidden]) [data-buy="field"]');
    await p.click('#shop [data-buy="field"]'); await p.click('#shop [data-buy="speed"]');
    let r = await p.evaluate(() => ({ coins: __farm.S.coins, up: Object.assign({}, __farm.S.up), open: __farm.tiles.filter(t => t.open).length, poor: __farm.buy('watermelon') }));
    assert.strictEqual(r.coins, 1000 - 60 - 600); assert.strictEqual(r.up.field, 1); assert.strictEqual(r.up.speed, 1); assert.strictEqual(r.open, 16);
    assert.deepStrictEqual(r.poor, { ok: false, reason: 'short', short: 2500 - 340 });
    await p.waitForSelector('#speed:not([hidden]) [data-v="2"]'); await p.click('#speed [data-v="2"]');
    assert.strictEqual(await p.evaluate(() => __farm.S.speed), 2);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.SAVE);
    r = await p.evaluate(() => ({ coins: __farm.S.coins, field: __farm.S.up.field, open: __farm.tiles.filter(t => t.open).length, speed: __farm.S.speed, bar: !document.getElementById('speed').hidden }));
    assert.deepStrictEqual(r, { coins: 340, field: 1, open: 16, speed: 2, bar: true }); assert.deepStrictEqual(p.errs, []);
  });
  await test('wide hoe tills 3x3, harvests drop seeds, strawberries regrow', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { const S = __farm.S, T = __farm.tiles; S.coins = 1e5; for (const id of ['field', 'field', 'field', 'hoe', 'hoe', 'strawberry', 'basket', 'basket']) __farm.buy(id);
      for (const t of T) { t.debris = t.weed = null; t.tilled = false; t.crop = null; }
      __farm.F.bag = { carrot: 0, cabbage: 0, pumpkin: 0, strawberry: 0, watermelon: 0 }; S.store = Object.assign({}, __farm.F.bag); __farm.F.gathered = 0;
      __farm.advance(12, 10); const tilled = T.filter(t => t.tilled).length;
      T.forEach((t, i) => { t.tilled = true; t.crop = { type: i % 2 ? 'strawberry' : 'pumpkin', age: 9, n: 0, stage: 3, rot: 0 }; });
      __farm.advance(150, 10);
      const berries = T.filter(t => t.crop && t.crop.type === 'strawberry' && t.crop.n === 1).length;
      return { tilled, berries, seeds: S.flow.harvest, board: __farm.board().map(j => j.kind) }; });
    assert(r.tilled >= 9, 'one swing of the wide hoe tills a 3x3: ' + r.tilled); assert(r.berries >= 6, 'picked strawberry bushes stay planted'); assert(r.seeds >= 3, 'pumpkins left seeds');
    assert.deepStrictEqual(p.errs, []);
  });
  await test('tilled soil never reverts over 12 days', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { let lost = 0, prev = new Set(); for (let i = 0; i < 12 * 33; i++) { __farm.advance(10, 6); const now = new Set(__farm.tiles.filter(t => t.tilled).map(t => t.c + ',' + t.r)); for (const k of prev) if (!now.has(k)) lost++; prev = now; }
      return { day: __farm.S.day, lost, tilled: prev.size, locked: __farm.tiles.filter(t => !t.open && (t.tilled || t.crop)).length }; });
    assert(r.day >= 12); assert.strictEqual(r.lost, 0); assert.strictEqual(r.tilled, 12); assert.strictEqual(r.locked, 0); assert.deepStrictEqual(p.errs, []);
  });
  await test('regions: buying one opens its field and gate, and it survives reload', async ctx => {
    const p = await open(ctx);
    let r = await p.evaluate(() => { const S = __farm.S, T = __farm.tiles; S.coins = 2000; const before = T.filter(t => t.f === 'east' && t.open).length;
      const poor = __farm.buy('south'); const ok = __farm.buy('east').ok; return { before, ok, poor: poor.ok, open: T.filter(t => t.f === 'east' && t.open).length, coins: S.coins, regions: S.eff.regions.slice(), lab: document.querySelectorAll('.rlab').length }; });
    assert.strictEqual(r.before, 0); assert(r.ok); assert(!r.poor); assert(r.open >= 12, 'east field opens tiles: ' + r.open); assert.strictEqual(r.coins, 2000 - 1200); assert.deepStrictEqual(r.regions, ['east']); assert.strictEqual(r.lab, 4);
    const junk = () => __farm.tiles.filter(t => t.f === 'east' && (t.debris || t.weed)).length, j0 = await p.evaluate(junk);
    await p.evaluate(() => { for (let i = 0; i < 66; i++) __farm.advance(10, 5); __farm.saveNow(); });
    const worked = j0 - await p.evaluate(junk) + await p.evaluate(() => __farm.tiles.filter(t => t.f === 'east' && (t.tilled || t.crop)).length);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.SAVE);
    r = await p.evaluate(() => ({ regions: __farm.S.eff.regions.slice(), open: __farm.tiles.filter(t => t.f === 'east' && t.open).length }));
    assert.deepStrictEqual(r.regions, ['east']); assert(r.open >= 12); assert(worked >= 1, 'the farmer works the new field'); assert.deepStrictEqual(p.errs, []);
  });
  await test('chop and transplant orders: wood, a sapling, then fruit he picks and sells', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { const f = __farm, S = f.S, F = f.F; S.coins = 5000; f.buy('axe'); f.buy('forest');
      const no = f.orderChop(S.trees.find(t => t.kind === 'apple').id);
      const w = S.trees.filter(t => t.kind === 'wild').slice(0, 2); const marks = w.map(t => f.orderChop(t.id).ok);
      for (let i = 0; i < 60 && S.orders.length; i++) f.advance(10, 10);
      const wood = F.wood, sap = F.saplings.apple + F.saplings.orange, stumps = w.filter(t => t.stage === 'stump').length;
      const kind = F.saplings.apple ? 'apple' : 'orange', bad = f.orderPlant(kind, 96, 64), good = [[20, 70], [30, 96], [176, 24], [184, 100], [12, 120], [20, 84], [176, 40]].map(([x, y]) => f.orderPlant(kind, x, y)).find(q => q.ok) || { ok: false };
      for (let i = 0; i < 60 && S.orders.length; i++) f.advance(10, 10);
      const pl = S.trees.find(t => t.stage === 'sapling' && t.kind === kind), day0 = S.day; let fruitDay = 0, sold0 = S.coins;
      const picked = () => S.events.some(e => /摘了 \d+ 个(苹果|橘子)/.test(e.msg));
      for (let i = 0; i < 9 * 33 && !(fruitDay && picked()); i++) { f.advance(10, 5); if (pl.stage === 'tree' && !fruitDay) fruitDay = S.day; }
      return { no: no.ok, marks, wood, sap, stumps, bad: bad.ok, good: good.ok, planted: !!pl, grewIn: fruitDay - day0, orders: S.orders.length, picked: picked(), fruitGold: S.fruitGold || 0 }; });
    assert(!r.no, 'fruit trees cannot be chopped'); assert.deepStrictEqual(r.marks, [true, true]);
    assert.strictEqual(r.wood, 10); assert.strictEqual(r.sap, 2); assert.strictEqual(r.stumps, 2);
    assert(!r.bad, 'no planting in the field'); assert(r.good); assert(r.planted); assert.strictEqual(r.orders, 0);
    assert(r.grewIn >= 4 && r.grewIn <= 5, 'sapling grows up in 5 nights: ' + r.grewIn); assert(r.picked, 'he picks the new tree'); assert.deepStrictEqual(p.errs, []);
  });
  await test('orchard fruit is picked and sold; pan, minimap and tool bar work', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { const f = __farm, S = f.S; S.coins = 2000; f.buy('orchard'); const c0 = S.coins; let fruitGold = 0;
      for (let i = 0; i < 2 * 33; i++) f.advance(10, 5);
      return { c0, fruitGold: S.fruitGold || 0, apples: S.events.filter(e => /摘了 5 个苹果/.test(e.msg)).length, coins: S.coins, ripe: S.trees.filter(t => t.kind === 'apple' && t.ripe).length }; });
    assert(r.apples >= 3, 'picked all three apple trees: ' + r.apples); assert(r.fruitGold >= 30, 'sold apples: ' + r.fruitGold);
    await p.keyboard.down('d'); await p.waitForTimeout(400); await p.keyboard.up('d');
    const cam = await p.evaluate(() => ({ x: __farm.cam.x, y: __farm.cam.y }));
    await p.mouse.move(640, 400); await p.mouse.down(); await p.mouse.move(400, 300, { steps: 5 }); await p.mouse.up();
    const cam2 = await p.evaluate(() => ({ x: __farm.cam.x, y: __farm.cam.y })); assert(cam2.x !== cam.x || cam2.y !== cam.y, 'drag pans');
    await p.click('#minimap', { position: { x: 20, y: 20 } }); const cam3 = await p.evaluate(() => __farm.cam.x); assert(cam3 < 0, 'minimap click jumps west: ' + cam3);
    await p.keyboard.press('r'); assert.strictEqual(await p.evaluate(() => Math.round(__farm.cam.x)), 96);
    await p.keyboard.press('m'); assert(await p.evaluate(() => document.getElementById('minimap').hidden)); await p.keyboard.press('m');
    await p.evaluate(() => { __farm.S.coins = 2000; __farm.buy('axe'); __farm.buy('forest'); }); await p.waitForSelector('#tools:not([hidden]) [data-m="chop"]');
    await p.click('#tools [data-m="chop"]'); assert.strictEqual(await p.evaluate(() => __farm.input.mode), 'chop');
    await p.evaluate(() => __farm.panTo(96, -60)); await p.waitForTimeout(100);
    const tgt = await p.evaluate(() => { const t = __farm.S.trees.find(t => t.kind === 'wild' && t.x > 70 && t.x < 130 && t.y > -80 && t.y < -45); const s = __farm.treeScreen(t.id), c = document.querySelector('canvas').getBoundingClientRect();
      return { id: t.id, x: c.left + s.x * c.width / 426, y: c.top + s.y * c.height / 266 }; });
    await p.mouse.click(tgt.x, tgt.y); const ord = await p.evaluate(() => __farm.S.orders.map(o => o.id));
    assert.deepStrictEqual(ord, [tgt.id]); await p.keyboard.press('Escape'); assert.strictEqual(await p.evaluate(() => __farm.input.mode), null);
    assert.deepStrictEqual(p.errs, []);
  });
  await browser.close(); server.close(); console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
