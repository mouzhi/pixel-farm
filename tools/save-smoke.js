// Browser test for saving (used by CI):  node tools/save-smoke.js [--write-fixture]
// Serves the repo root, then checks: save -> reload restores the same state; every fixture in tools/fixtures loads and
// plays a day; a broken save falls back to the backup; a newer save is left alone; offline gold is 50% / 3-day capped;
// export -> import round trip; reset starts over and keeps a copy.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures');
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
  try { await fn(ctx); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message.split('\n').filter(l => /^[+-] /.test(l.trim()) || /^ *[+-]/.test(l)).slice(0, 30).join('\n      ')); }
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
    if (process.argv.includes('--write-fixture')) { const s = await p.evaluate(() => __farm.snapshot()); fs.writeFileSync(path.join(FIX, 'save-v1-day4.json'), JSON.stringify(s, null, 1) + '\n'); console.log('     wrote fixtures/save-v1-day4.json'); }
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
  await test('tilled soil never reverts over 12 days', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => { let lost = 0, prev = new Set(); for (let i = 0; i < 12 * 33; i++) { __farm.advance(10, 6); const now = new Set(__farm.tiles.filter(t => t.tilled).map(t => t.c + ',' + t.r)); for (const k of prev) if (!now.has(k)) lost++; prev = now; }
      return { day: __farm.S.day, lost, tilled: prev.size, locked: __farm.tiles.filter(t => !t.open && (t.tilled || t.crop)).length }; });
    assert(r.day >= 12); assert.strictEqual(r.lost, 0); assert.strictEqual(r.tilled, 12); assert.strictEqual(r.locked, 0); assert.deepStrictEqual(p.errs, []);
  });
  await browser.close(); server.close(); console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
