// v5.11.0.38: 新房入伙 was left as a later-phase stub, so a married child already living in a
// new house never unlocked it. This loads the day-72 cottage fixture (kid0 moved in on day 71,
// achievement missing), shows the locked card, then runs the same save through PFSave.migrate
// (the load path) and shows it lit on the move-in day. Synthetic fixture only; no player saves.
//   node tools/newhouse-shots.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const FIX = path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

function check(name, err) { if (err) { console.error('FAIL', name, err); process.exit(1); } console.log('ok  ', name); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const raw = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  assert(!(raw.achievements || []).some(u => u.id === 'newhouse'), 'fixture must still omit 新房入伙');
  assert.strictEqual(raw.home.wed.kid0.moved, 71);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  // Start on a fresh farm, then restore the raw fixture in two steps so the locked card can be
  // photographed before migrate() backfills the achievement.
  await p.goto(base + '/index.html?manual&seed=7');
  await p.waitForFunction(() => window.__farm && __farm.spritesReady && __farm.spritesReady() && window.PFSave, null, { timeout: 30000 });

  const pre = await p.evaluate(raw => {
    const f = window.__farm, SAVE = window.PFSave;
    f.SAVE.off = true;
    const state = JSON.parse(JSON.stringify(raw));
    state.savedAt = Date.now();
    // restore the farm as it was saved, but keep the locked stub (strip a backfill if present)
    const loaded = SAVE.migrate(JSON.parse(JSON.stringify(state)));
    const day = (loaded.achievements.find(u => u.id === 'newhouse') || {}).day;
    const locked = JSON.parse(JSON.stringify(loaded));
    locked.achievements = (locked.achievements || []).filter(u => u.id !== 'newhouse');
    f.restore(locked);
    if (document.getElementById('offline')) document.getElementById('offline').hidden = true;
    return { v: f.version, sv: loaded.saveVersion, day: loaded.clock.day, moved: window.PFCodex.movedInDay(loaded.home) | 0, backfillDay: day | 0, has: (f.S.achievements || []).some(u => u.id === 'newhouse'), later: !!(window.PFCodex.ACH_BY.newhouse && window.PFCodex.ACH_BY.newhouse.later) };
  }, raw);
  check('version and fixture',
    pre.v !== VERSION ? 'ver ' + pre.v
      : pre.sv !== 15 ? 'saveVersion ' + pre.sv
        : pre.day !== 72 ? 'day ' + pre.day
          : pre.moved !== 71 ? 'movedIn ' + pre.moved
            : pre.backfillDay !== 71 ? 'migrate day ' + pre.backfillDay
              : pre.has ? 'already unlocked before the locked shot'
                : pre.later ? 'still marked later'
                  : null);

  const openAch = async () => {
    await p.evaluate(() => {
      const el = document.getElementById('codex');
      // the 图鉴 button toggles; only click it when the panel is closed
      if (!el || el.hidden) {
        const btn = document.getElementById('codexBtn');
        if (btn) btn.click();
      }
      const tab = document.querySelector('#codex [data-tab="ach"]');
      if (tab) tab.click();
      if (window.__farm.refreshUI) window.__farm.refreshUI();
      const cards = [...document.querySelectorAll('#codex .card')];
      const card = cards.find(c => (c.textContent || '').indexOf('新房入伙') >= 0);
      if (card) card.scrollIntoView({ block: 'center' });
    });
    await p.waitForTimeout(200);
  };
  const cardInfo = () => p.evaluate(() => {
    const cards = [...document.querySelectorAll('#codex .card')];
    const card = cards.find(el => (el.textContent || '').indexOf('新房入伙') >= 0);
    if (!card) return { missing: true };
    return { locked: card.classList.contains('locked'), text: card.textContent.replace(/\s+/g, ' ').trim(), later: /以后才能达成/.test(card.textContent || '') };
  });

  await openAch();
  let info = await cardInfo();
  check('locked card before load backfill',
    info.missing ? 'card missing'
      : !info.locked ? 'already unlocked: ' + info.text
        : info.later ? 'still says 以后才能达成'
          : null);
  await p.screenshot({ path: path.join(OUT, 'newhouse_locked.png') });

  const post = await p.evaluate(raw => {
    const f = window.__farm, SAVE = window.PFSave;
    const state = JSON.parse(JSON.stringify(raw));
    state.savedAt = Date.now();
    const loaded = SAVE.migrate(state);
    f.restore(loaded);
    if (document.getElementById('offline')) document.getElementById('offline').hidden = true;
    const u = (f.S.achievements || []).find(x => x.id === 'newhouse');
    return { has: !!u, day: u ? u.day : 0, sv: loaded.saveVersion };
  }, raw);
  check('load of a qualifying save unlocks on the move-in day',
    post.sv !== 15 ? 'saveVersion ' + post.sv
      : !post.has ? 'still locked after migrate'
        : post.day !== 71 ? 'day ' + post.day
          : null);

  await openAch();
  info = await cardInfo();
  check('unlocked card after load',
    info.missing ? 'card missing'
      : info.locked ? 'still locked: ' + info.text
        : !/第 71 天/.test(info.text) ? 'label ' + info.text
          : null);
  await p.screenshot({ path: path.join(OUT, 'newhouse_unlocked.png') });

  if (errs.length) { console.error('page errors', errs); process.exit(1); }
  console.log('newhouse-shots: ok  ver=' + VERSION + '  -> ' + OUT);
  await b.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
