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
      const goal = __farm.S.events.filter(e => e.day === 1).reduce((a, e) => { const m = /完成目标.*奖励 (\d+) 金/.exec(e.msg); return a + (m ? +m[1] : 0); }, 0); // v5.11.0.31 starter goal rewards (not a playlog income source)
      return { day: __farm.S.day, coins: __farm.S.coins, d1, d2, goal, nDays: log.days.length, events: log.events.map(e => e.type) };
    });
    assert.ok(r.day >= 2, 'reached day 2, got ' + r.day);
    assert.ok(r.d1, 'day 1 summary exists');
    assert.strictEqual(r.d1.open, false);
    assert.ok(r.d1.income.yard > 0, 'yard income recorded: ' + JSON.stringify(r.d1.income));
    // v5.11.0.31: day 1 now also sells its first carrots and buys seeds, and the starter goal pays a reward
    const sum = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
    assert.strictEqual(r.d1.goldEnd, r.d1.goldStart + sum(r.d1.income) - sum(r.d1.spend) + r.goal, JSON.stringify({ d1: r.d1, goal: r.goal }));
    assert.ok(r.d1.income.crops > 0, 'the first carrots are sold on day 1');
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

  // v5.11.0.25: a stored handle whose permission is not granted must open the folder
  // picker in the same click (do not wait on requestPermission — it can hang forever).
  const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
  await test('clicking 点此恢复本地同步 re-grants and toasts 本地同步已恢复', async ctx => {
    const p = await open(ctx);
    const r0 = await p.evaluate(async () => {
      const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
      dir.requestPermission = () => new Promise(() => {});
      window.__syncDir = dir;
      window.__picked = 0;
      const fresh = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'granted' });
      window.__freshDir = fresh;
      PFPlaylog.setPicker(async (opts) => {
        window.__picked++;
        window.__startInSame = !!(opts && opts.startIn === dir);
        return fresh;
      });
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
    assert.strictEqual(r0.ver, '5.12.7', r0.ver);
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
        picked: window.__picked,
        startInSame: window.__startInSame,
        wrote: !!(window.__freshDir.files['pixel-farm-save.json'] && window.__freshDir.files['pixel-farm-save.json'].text)
      };
    });
    assert.strictEqual(r1.st.granted, true, JSON.stringify(r1.st));
    assert.strictEqual(r1.st.needGesture, false);
    assert.strictEqual(r1.hintHidden, true, 'HUD hint hides after grant');
    assert.ok(/已同步到本机/.test(r1.menu) && /pixelfarm/.test(r1.menu), r1.menu);
    assert.ok(!/需要点一下重新授权/.test(r1.menu), r1.menu);
    assert.ok(r1.say === '本地同步已恢复' || r1.says.includes('本地同步已恢复'), 'toast missing: ' + r1.say + ' ' + JSON.stringify(r1.says));
    assert.strictEqual(r1.picked, 1, 'picker must open in the same click');
    assert.ok(r1.startInSame, 'picker startIn is the stored handle');
    assert.strictEqual(r1.requestCalls, 0, 'must not wait on a hanging requestPermission');
    assert.ok(r1.wrote, 'save file written after resume');
    await p.screenshot({ path: path.join(OUT, 'sync_after.png') });
    assert.deepStrictEqual(p.errs.filter(e => !/pixel-farm sync/.test(e)), []);
  });

  await test('a stale handle opens the folder picker in the same click', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(async () => {
      const gone = new Error('handle gone'); gone.name = 'NotFoundError';
      const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestThrow: gone });
      PFPlaylog.installDir(dir, 'prompt');
      document.getElementById('menuBtn').click();
      if (document.getElementById('menu').hidden) document.getElementById('menuBtn').click();
      const fresh = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'granted' });
      window.__picked = 0;
      PFPlaylog.setPicker(async (opts) => { window.__picked++; window.__startInSame = !!(opts && opts.startIn === dir); return fresh; });
      const st = await PFPlaylog.resumeDir();
      return { st, picked: window.__picked, startInSame: window.__startInSame, storedRequests: dir.requestCalls, wrote: !!(fresh.files['pixel-farm-save.json'] && fresh.files['pixel-farm-save.json'].text) };
    });
    assert.strictEqual(r.picked, 1, 'picker must run in the same resumeDir call');
    assert.ok(r.startInSame, 'picker startIn is the stored handle');
    assert.strictEqual(r.storedRequests, 0, 'must not wait on requestPermission of a stale handle');
    assert.strictEqual(r.st.granted, true);
    assert.strictEqual(r.st.needsRepick, false);
    assert.ok(r.wrote);
    assert.deepStrictEqual(p.errs.filter(e => !/pixel-farm sync/.test(e)), []);
  });

  await test('opening the game preserves folder day 12 under saves/ and writes the browser latest', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(async () => {
      const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
      const folder = { meta: { kind: 'pixel-farm-save', gameVersion: '5.11.0.16', saveVersion: 15 },
        save: { saveVersion: 15, gameVersion: '5.11.0.16', createdAt: Date.parse('2026-10-01T00:00:00-07:00'), savedAt: Date.parse('2026-11-21T02:02:00-08:00'), clock: { day: 12, t: 800 }, coins: 999 } };
      const before = JSON.stringify(folder, null, 2) + '\n';
      dir.files['pixel-farm-save.json'] = { text: before };
      window.__syncDir = dir;
      window.__folderBefore = before;
      PFPlaylog.installDir(dir, 'prompt');
      // no button clicks — just the boot/hydrate path
      const st = await PFPlaylog.hydrateDir();
      const after = JSON.parse(dir.files['pixel-farm-save.json'].text);
      const saves = dir.dirs && dir.dirs.saves && dir.dirs.saves.files || {};
      const day012 = saves['pixel-farm-save-day012.json'] && saves['pixel-farm-save-day012.json'].text;
      const list = await PFPlaylog.listRewind(dir);
      const tree = [];
      for (const name of Object.keys(dir.files).sort()) tree.push(name);
      if (dir.dirs && dir.dirs.saves) {
        tree.push('saves/');
        for (const name of Object.keys(dir.dirs.saves.files).sort()) tree.push('saves/' + name);
      }
      return {
        st,
        latestDay: after.save.clock.day,
        latestCoins: after.save.coins,
        day012,
        day012same: day012 === before,
        day012day: day012 ? JSON.parse(day012).save.clock.day : null,
        wrotePlaylog: !!dir.files['pixel-farm-playlog.json'],
        probeLeft: !!dir.files[PFPlaylog.PROBE_FILE],
        ver: __farm.version,
        browserDay: __farm.S.day,
        listDays: list.map(x => x.day),
        tree,
        hasConflictBox: !!document.getElementById('syncConflict'),
        hintHidden: document.getElementById('syncHint').hidden,
        hint: document.getElementById('syncHint').textContent
      };
    });
    assert.strictEqual(r.day012same, true, 'saves/pixel-farm-save-day012.json must be identical to the original folder save');
    assert.strictEqual(r.day012day, 12);
    assert.strictEqual(r.latestDay, r.browserDay, 'latest must be the browser save, got day ' + r.latestDay);
    assert.ok(r.browserDay !== 12, 'browser should still be the early-game save, day ' + r.browserDay);
    assert.strictEqual(r.wrotePlaylog, true);
    assert.strictEqual(r.probeLeft, false);
    assert.ok(!r.st.conflict, 'no conflict in status: ' + JSON.stringify(r.st.conflict));
    assert.strictEqual(r.hasConflictBox, false, 'conflict panel must not exist');
    assert.ok(r.hintHidden || !/两份/.test(r.hint || ''), r.hint);
    assert.ok(r.listDays.includes(12), 'rewind list must include day 12: ' + JSON.stringify(r.listDays));
    // Render a folder-contents panel for the shot (test-only overlay, not a game UI).
    await p.evaluate(() => {
      const dir = window.__syncDir;
      const peek = text => {
        try { const o = JSON.parse(text), s = o.save || o, c = s.clock || {}; return { day: c.day, t: c.t, coins: s.coins }; } catch (e) { return null; }
      };
      const clock = t => { if (t == null) return ''; const n = Math.max(0, Math.round(Number(t) || 0)); const h = Math.floor(n / 60) % 24, m = n % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; };
      const line = (name, text, note) => {
        const p = text ? peek(text) : null;
        const meta = p && p.day != null ? `第${p.day}天${p.t != null ? ' ' + clock(p.t) : ''}${p.coins != null ? ' · ' + p.coins + '金' : ''}` : '';
        return `<div class="fl-row"><span class="fl-name">${name}</span><span class="fl-meta">${meta}${note ? '  ' + note : ''}</span></div>`;
      };
      let html = `<h3>本机文件夹 pixelfarm</h3><div class="csub">浏览器进度写成最新文件。原来的农场按天数留在 saves/，可用「回到某一天」再打开。</div>`;
      html += line('pixel-farm-save.json', dir.files['pixel-farm-save.json'] && dir.files['pixel-farm-save.json'].text, '← 最新进度（浏览器）');
      html += line('pixel-farm-playlog.json', dir.files['pixel-farm-playlog.json'] && dir.files['pixel-farm-playlog.json'].text, '');
      html += `<div class="fl-row"><span class="fl-name">saves/</span></div>`;
      const saves = dir.dirs && dir.dirs.saves && dir.dirs.saves.files || {};
      for (const name of Object.keys(saves).sort()) {
        const note = /day012/.test(name) ? '← 写入前原样保留' : '';
        html += line('  ' + name, saves[name] && saves[name].text, note);
      }
      const box = document.createElement('div');
      box.id = 'folderListing';
      box.className = 'panel';
      box.innerHTML = html;
      document.body.appendChild(box);
      const o = document.getElementById('offline'); if (o) o.hidden = true;
      const menu = document.getElementById('menu'); if (menu) menu.hidden = true;
    });
    await p.addStyleTag({ content: `#folderListing{position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);padding:14px 18px;min-width:440px;max-width:min(560px,calc(100vw - 24px));text-align:left;font-size:14px;z-index:6}
      #folderListing h3{margin:0 0 6px;font-size:16px;color:#ffd76a;text-align:center}
      #folderListing .csub{text-align:center;font-size:13px;opacity:.9;margin-bottom:8px}
      #folderListing .fl-row{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;white-space:pre}
      #folderListing .fl-name{color:#fff4c8}
      #folderListing .fl-meta{display:block;font-weight:500;font-size:12px;opacity:.9;margin:0 0 6px 1.2em;white-space:normal}` });
    fs.mkdirSync(OUT, { recursive: true });
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, 'sync_folder_listing.png') });
    assert.deepStrictEqual(p.errs.filter(e => !/pixel-farm sync/.test(e)), []);
  });

  await test('回到某一天 lists per-day snapshots and is hidden on a hosted (xhs) shell', async ctx => {
    const p = await open(ctx);
    await p.evaluate(async () => {
      const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'granted' });
      const wrap = (day, coins, at, t) => ({
        meta: { kind: 'pixel-farm-save', gameVersion: '5.12.7', saveVersion: 15, timeline: 'a', exportedAt: new Date(at).toISOString() },
        save: { saveVersion: 15, gameVersion: '5.12.7', createdAt: Date.parse('2026-10-01T00:00:00-07:00'), savedAt: at, clock: { day, t }, coins }
      });
      const w8 = wrap(8, 200, Date.parse('2026-11-15T12:00:00-08:00'), 800);
      const w12 = wrap(12, 999, Date.parse('2026-11-21T02:02:00-08:00'), 800); // wedding day in the fixture story
      const w20 = wrap(20, 1500, Date.parse('2026-11-21T14:00:00-08:00'), 360);
      const saves = await dir.getDirectoryHandle('saves', { create: true });
      saves.files['pixel-farm-save-day008.json'] = { text: JSON.stringify(w8, null, 2) + '\n' };
      saves.files['pixel-farm-save-day012.json'] = { text: JSON.stringify(w12, null, 2) + '\n' };
      saves.files['pixel-farm-save-day020.json'] = { text: JSON.stringify(w20, null, 2) + '\n' };
      window.__syncDir = dir;
      PFPlaylog.installDir(dir, 'granted');
      document.getElementById('menuBtn').click();
      if (document.getElementById('menu').hidden) document.getElementById('menuBtn').click();
    });
    await p.waitForFunction(() => /回到某一天/.test(document.getElementById('menu').innerText), null, { timeout: 3000 });
    await p.click('#menu button[data-a="syncrewind"]');
    await p.waitForFunction(() => {
      const m = document.getElementById('menu');
      return m && /第12天/.test(m.innerText) && /第8天/.test(m.innerText) && /婚礼会是新的样子|每日存档/.test(m.innerText);
    }, null, { timeout: 4000 });
    const text = await p.evaluate(() => document.getElementById('menu').innerText);
    assert.ok(/第12天/.test(text) && /13:20/.test(text), text);
    assert.ok(/第8天/.test(text), text);
    assert.ok(/第20天/.test(text), text);
    fs.mkdirSync(OUT, { recursive: true });
    await p.screenshot({ path: path.join(OUT, 'sync_rewind.png') });
    // confirm dialog
    await p.click('#menu button[data-n="pixel-farm-save-day012.json"]');
    await p.waitForFunction(() => /确定回到/.test(document.getElementById('menu').innerText), null, { timeout: 3000 });
    const confirm = await p.evaluate(() => document.getElementById('menu').innerText);
    assert.ok(/确定回到/.test(confirm) && /第12天/.test(confirm) && /回溯前的进度/.test(confirm), confirm);
    // cancel — folder files must be unchanged (no rewind yet)
    await p.click('#menu button[data-a="rewindno"]');
    const days = await p.evaluate(() => {
      const files = window.__syncDir.dirs.saves.files;
      return {
        d12: JSON.parse(files['pixel-farm-save-day012.json'].text).save.clock.day,
        d20: JSON.parse(files['pixel-farm-save-day020.json'].text).save.clock.day,
        keys: Object.keys(files).sort()
      };
    });
    assert.strictEqual(days.d12, 12);
    assert.strictEqual(days.d20, 20);
    // hosted / xhs shell hides the button
    const hidden = await p.evaluate(() => {
      window.PFPlatform = { id: 'xhs' };
      document.getElementById('menuBtn').click();
      document.getElementById('menuBtn').click();
      return /回到某一天/.test(document.getElementById('menu').innerText);
    });
    assert.strictEqual(hidden, false, 'hosted shell must not show 回到某一天');
    assert.deepStrictEqual(p.errs.filter(e => !/pixel-farm sync/.test(e)), []);
  });

  await browser.close();
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  if (failed) { console.log(failed + ' failed'); process.exit(1); }
  console.log('playlog-smoke ok');
})().catch(err => { console.error(err); process.exit(1); });
