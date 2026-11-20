// Browser smoke for the play log and folder sync (used by CI): node tools/playlog-smoke.js
// Serves the repo root, checks: playlog is written to its own localStorage key (save is untouched);
// day summaries aggregate yard gold and close on morning; OPFS (or a mock handle) receives both JSON files.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const SAVE_CURRENT = require('../save.js').CURRENT;
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
let browser, base, failed = 0;
async function open(ctx) {
  const p = await ctx.newPage({ viewport: { width: 1280, height: 800 } }); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(`${base}/index.html?manual`); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.SAVE && window.PFPlaylog, null, { timeout: 15000 });
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

  await test('playlog boots into its own key; saveVersion is untouched by the log', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      const raw = localStorage.getItem('mouzhi/pixel-farm:playlog');
      const save = JSON.parse(localStorage.getItem('mouzhi/pixel-farm:save') || 'null');
      const log = raw ? JSON.parse(raw) : null;
      const snap = __farm.snapshot();
      return { version: __farm.version, saveVersion: snap.saveVersion, hasPlaylogInSave: 'playlog' in snap, logSchema: log && log.schema, days: log && log.days.length, ev: log && log.events[0] && log.events[0].type, keys: Object.keys(localStorage).sort() };
    });
    assert.match(r.version, /^\d+\.\d+(\.\d+){0,3}$/); // v5.10.11.1: a hotfix adds a fourth part; v5.11.0.4.1 a fifth
    assert.strictEqual(r.saveVersion, SAVE_CURRENT); // the log never bumps saveVersion
    assert.strictEqual(r.hasPlaylogInSave, false);
    assert.strictEqual(r.logSchema, 1);
    assert.ok(r.days >= 1);
    assert.strictEqual(r.ev, 'session-start');
    assert.ok(r.keys.includes('mouzhi/pixel-farm:playlog'));
    assert.ok(r.keys.includes('mouzhi/pixel-farm:save'));
    assert.deepStrictEqual(p.errs, []);
  });

  await test('day summary closes at morning with yard income and time buckets', async ctx => {
    const p = await open(ctx);
    // play through most of day 1 into the next morning (a 5-minute day is 300s of sim; 20 fps steps of 1/20s)
    const r = await p.evaluate(() => {
      __farm.advance(420, 10); // a 1x day is ~313s if he sleeps; leave margin if bedtime is late
      __farm.saveNow();
      const log = JSON.parse(localStorage.getItem('mouzhi/pixel-farm:playlog'));
      const d1 = log.days.find(d => d.day === 1);
      const d2 = log.days.find(d => d.day === 2);
      return { day: __farm.S.day, coins: __farm.S.coins, d1, d2, nDays: log.days.length, events: log.events.map(e => e.type) };
    });
    assert.ok(r.day >= 2, 'reached day 2, got ' + r.day);
    assert.ok(r.d1, 'day 1 summary exists');
    assert.strictEqual(r.d1.open, false);
    assert.ok(r.d1.income.yard > 0, 'yard income recorded: ' + JSON.stringify(r.d1.income));
    assert.strictEqual(r.d1.goldEnd, r.d1.goldStart + r.d1.income.yard);
    assert.ok(r.d1.busyMin + r.d1.idleMin + r.d1.sleepMin > 100, 'time buckets filled');
    assert.ok(r.d1.sleepMin > 0, 'sleep recorded');
    assert.ok(r.d1.idle.fish + r.d1.idle.rest + r.d1.idle.other > 0, 'idle breakdown');
    assert.ok(r.d1.tiles >= 12);
    assert.ok(r.d2 && r.d2.open, 'day 2 is in progress');
    assert.deepStrictEqual(p.errs, []);
  });

  await test('OPFS directory handle receives both JSON files', async ctx => {
    const p = await open(ctx);
    await p.evaluate(() => __farm.advance(40, 10));
    const r = await p.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      // start from a clean pair of names
      try { await root.removeEntry('pixel-farm-save.json'); } catch (e) {}
      try { await root.removeEntry('pixel-farm-playlog.json'); } catch (e) {}
      const written = await PFPlaylog.syncNow('opfs', root, __farm.snapshot());
      const playText = await (await (await root.getFileHandle('pixel-farm-playlog.json')).getFile()).text();
      const saveText = await (await (await root.getFileHandle('pixel-farm-save.json')).getFile()).text();
      const play = JSON.parse(playText), save = JSON.parse(saveText);
      return { written, play, save, playPretty: /\n  /.test(playText), savePretty: /\n  /.test(saveText) };
    });
    assert.ok(r.written.ok, r.written.error);
    assert.strictEqual(r.play.meta.kind, 'pixel-farm-playlog');
    assert.strictEqual(r.play.meta.schema, 1);
    assert.ok(r.play.days.length >= 1);
    assert.ok(r.play.events.some(e => e.type === 'session-start'));
    assert.strictEqual(r.save.meta.kind, 'pixel-farm-save');
    assert.strictEqual(r.save.meta.saveVersion, SAVE_CURRENT);
    assert.strictEqual(r.save.save.saveVersion, SAVE_CURRENT);
    assert.strictEqual(r.save.save.clock.day, 1);
    assert.ok(r.playPretty && r.savePretty, 'files are pretty-printed');
    assert.deepStrictEqual(p.errs, []);
  });

  await test('存档 menu has sync and export-log buttons', async ctx => {
    const p = await open(ctx);
    await p.evaluate(() => document.getElementById('menuBtn').click());
    const text = await p.evaluate(() => document.getElementById('menu').innerText);
    assert.ok(/同步到本地文件夹/.test(text), text);
    assert.ok(/导出游玩记录/.test(text), text);
    const hint = await p.evaluate(() => document.getElementById('syncHint') !== null);
    assert.ok(hint, 'restore button exists in the page');
    assert.deepStrictEqual(p.errs, []);
  });

  await browser.close();
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  if (failed) { console.log(failed + ' failed'); process.exit(1); }
  console.log('playlog-smoke ok');
})().catch(err => { console.error(err); process.exit(1); });
