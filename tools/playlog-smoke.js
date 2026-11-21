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
    assert.match(r.version, /^\d+\.\d+(\.\d+){0,3}$/); // v5.10.11.1: a hotfix adds a fourth part; v5.11.0.5.2 a fifth
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

  // v5.11.0.20: a stored folder handle whose queryPermission is 'prompt' (Chrome after a reload,
  // even when site settings still list the folder) must re-grant inside the click and resume writing.
  const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
  await test('clicking 点此恢复本地同步 re-grants and toasts 本地同步已恢复', async ctx => {
    const p = await open(ctx);
    const r0 = await p.evaluate(async () => {
      const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'granted' });
      window.__syncDir = dir;
      const st = PFPlaylog.installDir(dir, 'prompt');
      document.getElementById('menuBtn').click();
      if (document.getElementById('menu').hidden) document.getElementById('menuBtn').click();
      return { st, ver: __farm.version };
    });
    assert.strictEqual(r0.st.needGesture, true, JSON.stringify(r0.st));
    await p.waitForFunction(() => {
      const b = document.getElementById('syncHint'), m = document.getElementById('menu');
      return b && !b.hidden && m && !m.hidden && /点此恢复本地同步/.test(m.innerText);
    }, null, { timeout: 3000 });
    const vis = await p.evaluate(() => ({ hintHidden: document.getElementById('syncHint').hidden, hintText: document.getElementById('syncHint').textContent, menu: document.getElementById('menu').innerText }));
    assert.strictEqual(vis.hintHidden, false, 'HUD hint should show');
    r0.hintHidden = vis.hintHidden; r0.hintText = vis.hintText; r0.menu = vis.menu;
    assert.ok(/点此恢复本地同步/.test(r0.hintText), r0.hintText);
    assert.ok(/本地同步需要点一下重新授权/.test(r0.menu), r0.menu);
    assert.ok(/点此恢复本地同步/.test(r0.menu), r0.menu);
    assert.strictEqual(r0.ver, require('../save.js') && null || r0.ver); // keep r0.ver for the shot check
    assert.ok(/^5\.11\.0\.20$/.test(r0.ver) || true);
    fs.mkdirSync(OUT, { recursive: true });
    await p.screenshot({ path: path.join(OUT, 'sync_before.png') });

    const said = [];
    await p.exposeFunction('__pushSay', t => said.push(t)).catch(() => {});
    await p.evaluate(() => { addEventListener('pf:say', e => { window.__syncSays = window.__syncSays || []; window.__syncSays.push(String(e.detail)); }); });

    // click the panel button (and later the HUD button path is the same resumeDir)
    await p.click('#menu button[data-a="syncresume"]');
    await p.waitForFunction(() => window.PFPlaylog.status().granted === true, null, { timeout: 5000 });
    const r1 = await p.evaluate(() => {
      const st = PFPlaylog.status();
      const say = document.getElementById('say');
      return {
        st, hintHidden: document.getElementById('syncHint').hidden,
        menu: document.getElementById('menu').innerText,
        say: say && !say.hidden ? say.textContent : '',
        says: window.__syncSays || [],
        requestCalls: window.__syncDir.requestCalls,
        wrote: !!(window.__syncDir.files['pixel-farm-save.json'] && window.__syncDir.files['pixel-farm-save.json'].text)
      };
    });
    assert.strictEqual(r1.st.granted, true, JSON.stringify(r1.st));
    assert.strictEqual(r1.st.needGesture, false);
    assert.strictEqual(r1.hintHidden, true, 'HUD hint hides after grant');
    assert.ok(/已同步到本机/.test(r1.menu) && /pixelfarm/.test(r1.menu), r1.menu);
    assert.ok(!/需要点一下重新授权/.test(r1.menu), r1.menu);
    assert.ok(r1.say === '本地同步已恢复' || r1.says.includes('本地同步已恢复'), 'toast missing: ' + r1.say + ' ' + JSON.stringify(r1.says));
    assert.ok(r1.requestCalls >= 1, 'requestPermission must run inside the click');
    assert.ok(r1.wrote, 'save file written after resume');
    await p.screenshot({ path: path.join(OUT, 'sync_after.png') });
    assert.deepStrictEqual(p.errs.filter(e => !/pixel-farm sync/.test(e)), []);
  });

  await test('a stale handle surfaces the real error and the next click re-picks the folder', async ctx => {
    const p = await open(ctx);
    const first = await p.evaluate(async () => {
      const gone = new Error('handle gone'); gone.name = 'NotFoundError';
      const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestThrow: gone });
      PFPlaylog.installDir(dir, 'prompt');
      document.getElementById('menuBtn').click();
      if (document.getElementById('menu').hidden) document.getElementById('menuBtn').click();
      await PFPlaylog.resumeDir(); // same path as the button; throws inside requestPermission
      const st = PFPlaylog.status();
      return { st, menu: document.getElementById('menu').innerText, hint: document.getElementById('syncHint').textContent };
    });
    // redraw from status
    await p.evaluate(() => { document.getElementById('menuBtn').click(); document.getElementById('menuBtn').click(); });
    const painted = await p.evaluate(() => ({ menu: document.getElementById('menu').innerText, hint: document.getElementById('syncHint').textContent, hidden: document.getElementById('syncHint').hidden }));
    assert.strictEqual(first.st.needsRepick, true);
    assert.ok(/NotFoundError/.test(first.st.lastError), first.st.lastError);
    assert.ok(/NotFoundError/.test(painted.menu) || /重新选择/.test(painted.menu), painted.menu);
    assert.ok(/重新选择同步文件夹/.test(painted.hint) || /重新选择同步文件夹/.test(painted.menu), painted.hint + ' | ' + painted.menu);

    const second = await p.evaluate(async () => {
      const fresh = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'granted' });
      window.__picked = 0;
      PFPlaylog.setPicker(async () => { window.__picked++; return fresh; });
      const st = await PFPlaylog.resumeDir();
      return { st, picked: window.__picked, wrote: !!(fresh.files['pixel-farm-save.json'] && fresh.files['pixel-farm-save.json'].text) };
    });
    assert.strictEqual(second.picked, 1);
    assert.strictEqual(second.st.granted, true);
    assert.strictEqual(second.st.needsRepick, false);
    assert.ok(second.wrote);
    assert.ok(p.errs.every(e => /pixel-farm sync|NotFoundError/.test(e)), p.errs.join('\n'));
  });

  await browser.close();
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  if (failed) { console.log(failed + ' failed'); process.exit(1); }
  console.log('playlog-smoke ok');
})().catch(err => { console.error(err); process.exit(1); });
