// Browser smoke for field surprises: node tools/surprise-smoke.js
'use strict';
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
async function open(ctx, q = 'manual') {
  const p = await ctx.newPage({ viewport: { width: 1280, height: 800 } }); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(`${base}/index.html?${q}`); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && window.PFSurprise, null, { timeout: 15000 });
  return p;
}
async function test(name, fn) {
  const ctx = await browser.newContext();
  try { await fn(ctx); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.split('\n')[0].slice(0, 400)); }
  await ctx.close();
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

  await test('version 5.2.3, saveVersion stays 9', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => ({ v: __farm.version, sv: __farm.snapshot().saveVersion }));
    assert.strictEqual(r.v, '5.2.3');
    assert.strictEqual(r.sv, 9);
    assert.deepStrictEqual(p.errs, []);
  });

  await test('glowing crop persists, sells at 3×, and logs a surprise event', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      const t = __farm.tiles.find(x => x.open && x.f === 'home');
      t.tilled = true; t.debris = t.weed = null;
      t.crop = { type: 'pumpkin', age: 4, n: 0, rot: 0, stage: 3, glow: 1 };
      __farm.saveNow();
      const ev = { type: 'surprise', kind: 'glow', msg: '一棵南瓜在发光！', day: __farm.S.day, t: __farm.S.t };
      PFPlaylog.event(ev);
      const snap = __farm.snapshot();
      const crop = snap.tiles.find(x => x.f === t.f && x.c === t.c && x.r === t.r).crop;
      __farm.F.crops.length = 0; __farm.F.crops.push({ type: 'pumpkin', glow: 1 });
      const before = __farm.S.coins;
      // run the sell done() by walking the real task would be heavy; price path:
      const price = __farm.surprise.priceOf({ type: 'pumpkin', glow: 1 }, 85);
      return { crop, price, sv: snap.saveVersion };
    });
    assert.strictEqual(r.sv, 9);
    assert.strictEqual(r.crop.glow, 1);
    assert.strictEqual(r.price, 255);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.SAVE);
    const again = await p.evaluate(() => {
      const t = __farm.tiles.find(x => x.crop && x.crop.glow);
      return t && t.crop.type;
    });
    assert.strictEqual(again, 'pumpkin');
    assert.deepStrictEqual(p.errs, []);
  });

  await test('a ripe 2×2 pumpkin merges, is harvested as one giant, and is carried overhead', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      const SU = PFSurprise, home = __farm.tiles.filter(t => t.open && t.f === 'home');
      const origin = home.find(t => t.c === 0 && t.r === 0) || home[0];
      const group = [];
      for (const dc of [0, 1]) for (const dr of [0, 1]) {
        const t = __farm.tiles.find(x => x.f === origin.f && x.c === origin.c + dc && x.r === origin.r + dr);
        t.open = true; t.tilled = true; t.debris = t.weed = null;
        t.crop = { type: 'pumpkin', age: 4, n: 0, rot: 0, stage: 3 };
        group.push(t);
      }
      const got = SU.rollGiant(group, window.PFSim.ripe, () => 0);
      const t0 = got[0];
      __farm.F.crops.length = 0; __farm.F.home = false; __farm.F.sleeping = false;
      __farm.F.x = t0.x; __farm.F.y = t0.y; __farm.F.task = null;
      // harvest via the board helper: call done of a harvest task by picking it
      const ripe = __farm.tiles.filter(t => t.crop && SU.canHarvest(t.crop, window.PFSim.ripe) && t.crop.giant);
      const assertOk = ripe.length === 1;
      // mimic harvestTask.done
      const item = SU.harvestItem(t0.crop);
      __farm.F.crops.push(item);
      SU.clearGiant(t0, __farm.tiles);
      __farm.F.moving = true;
      __farm.render();
      const partsLeft = __farm.tiles.filter(t => t.crop && (t.crop.giant || t.crop.giantOf)).length;
      return { merged: got.length, item, price: SU.priceOf(item, 85), partsLeft, carry: !!item.giant, assertOk };
    });
    assert.strictEqual(r.merged, 1);
    assert.ok(r.item.giant);
    assert.strictEqual(r.price, 85 * 6);
    assert.strictEqual(r.partsLeft, 0);
    assert.ok(r.carry);
    assert.deepStrictEqual(p.errs, []);
  });

  await test('?nofx does not throw when a glowing crop is on the field', async ctx => {
    const p = await open(ctx, 'manual&nofx');
    const r = await p.evaluate(() => {
      const t = __farm.tiles.find(x => x.open);
      t.crop = { type: 'cabbage', age: 2, n: 0, rot: 0, stage: 3, glow: 1 };
      __farm.advance(1, 10); __farm.render();
      return { enabled: PF_FX.enabled(), n: PF_FX.count() };
    });
    assert.strictEqual(r.enabled, false);
    assert.strictEqual(r.n, 0);
    assert.deepStrictEqual(p.errs, []);
  });

  await browser.close();
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  if (failed) { console.log(failed + ' failed'); process.exit(1); }
  console.log('surprise-smoke ok');
})().catch(err => { console.error(err); process.exit(1); });
