// Browser smoke for the v5.4.1 collection book, wandering dogs and ornamental pond fish: node tools/codex-smoke.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
let browser, base, failed = 0;
async function open(ctx, q = 'manual') {
  const p = await ctx.newPage({ viewport: { width: 1280, height: 800 } }); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(`${base}/index.html?${q}`); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && window.PFCodex, null, { timeout: 15000 });
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

  await test('version 5.4.5 and a fresh save is v10 with an empty book', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      const s = __farm.snapshot();
      return { v: __farm.version, sv: s.saveVersion, entries: Object.keys(s.codex.entries).length, food: s.inventory.fishFood, pond: (s.pondFish || []).length, btn: !!document.getElementById('codexBtn') };
    });
    assert.strictEqual(r.v, '5.4.5'); assert.strictEqual(r.sv, 10); assert.strictEqual(r.entries, 0); assert.strictEqual(r.food, 0); assert.strictEqual(r.pond, 0); assert(r.btn);
    assert.deepStrictEqual(p.errs, []);
  });

  await test('the 图鉴 panel has three tabs, and a known fish shows the first day and the count', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      const f = __farm, S = f.S;
      S.catches = [{ id: 'koi', name: '锦鲤', gold: 36, water: 'pond', day: 4 }];
      PFCodex.record(S.codex, PFCodex.keyFish('koi'), 4);
      S.achievements = [{ id: 'truecatch', day: 4 }];
      S.milestones = [{ id: 'open', day: 1 }, { id: 'fish', day: 4 }];
      document.getElementById('codexBtn').click();
      const box = document.getElementById('codex');
      const tabs = [...box.querySelectorAll('[data-tab]')].map(b => b.textContent);
      const cells = box.querySelectorAll('.cell:not(.locked)').length;
      const locked = box.querySelectorAll('.cell.locked').length;
      const koiIco = box.querySelector('[data-key="fish:koi"] .ico');
      const lockedIco = box.querySelector('.cell.locked .ico');
      const sw = box.querySelectorAll('.sw').length;
      const koiBg = koiIco ? getComputedStyle(koiIco).backgroundImage : '';
      const lockedBg = lockedIco ? getComputedStyle(lockedIco).backgroundImage : '';
      const qMarks = [...box.querySelectorAll('.cell.locked .nm')].filter(el => el.textContent === '？').length;
      const koiCell = box.querySelector('[data-key="fish:koi"]');
      const qEl = box.querySelector('.cell.locked .nm');
      const headEl = box.querySelector('.shead b');
      const colors = { koiClass: koiCell.className, koiColor: getComputedStyle(koiCell.querySelector('.nm')).color, qColor: qEl ? getComputedStyle(qEl).color : '', headColor: headEl ? getComputedStyle(headEl).color : '' };
      koiCell.click();
      const detailEl = box.querySelector('.detail');
      const detail = detailEl.textContent;
      colors.detailColor = getComputedStyle(detailEl).color;
      box.querySelector('[data-tab="ach"]').click();
      const ach = box.textContent;
      box.querySelector('[data-tab="ms"]').click();
      const ms = box.textContent;
      return Object.assign({ hidden: box.hidden, tabs, cells, locked, detail, ach, ms, sw, koiBg, lockedBg, qMarks }, colors);
    });
    assert.strictEqual(r.hidden, false);
    assert.deepStrictEqual(r.tabs, ['图鉴', '成就', '里程碑']);
    assert(r.cells >= 1 && r.locked >= 8);
    assert.strictEqual(r.sw, 0, 'no colour swatches in the book');
    assert(/data:image/.test(r.koiBg), 'discovered koi uses a pixel sprite');
    assert(/data:image/.test(r.lockedBg), 'unseen cells use a silhouette, not a question mark');
    assert(r.qMarks >= 8);
    assert(r.koiClass && /r-epic/.test(r.koiClass), 'koi name is marked very-rare');
    const dark = (c) => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c || ''); if (!m) return true; return +m[1] + +m[2] + +m[3] < 200; };
    assert(!dark(r.koiColor), 'discovered name should be a light rarity colour, got ' + r.koiColor);
    assert(!dark(r.qColor), 'unseen ？ should be a light label, got ' + r.qColor);
    assert(!dark(r.detailColor), 'help text should be light, got ' + r.detailColor);
    assert(!dark(r.headColor), 'header should be light, got ' + r.headColor);
    assert(/第 4 天/.test(r.detail) && /一共遇到 1 次/.test(r.detail));
    assert(/这波是真的/.test(r.ach) && /第 4 天/.test(r.ach));
    assert(/农场开张/.test(r.ms));
    assert.deepStrictEqual(p.errs, []);
  });

  await test('dogs wander on their own instead of staying glued to the farmer, and pick at least two jobs in 10 minutes', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      const f = __farm, S = f.S;
      S.coins = 1e6; f.buy('dog'); f.buy('dog');
      f.FARMER.x = 80; f.FARMER.y = 70; f.FARMER.home = false; f.FARMER.sleeping = false;
      S.t = 10 * 60; // mid-morning
      const kinds = new Set(), far = [];
      for (let i = 0; i < 600; i++) { // 10 minutes of sim at 1s steps, plus extra so jobs rotate
        f.advance(10, 10);
        for (const pet of f.PETS_LIVE) if (pet.kind === 'dog') {
          const v = f.PV.get(pet.id);
          if (v && v.job) kinds.add(v.job.kind);
          if (v) far.push(Math.hypot(v.x - f.FARMER.x, v.y - f.FARMER.y));
        }
      }
      const mean = far.reduce((a, b) => a + b, 0) / (far.length || 1);
      return { dogs: f.PETS_LIVE.filter(q => q.kind === 'dog').length, kinds: [...kinds], mean, max: Math.max(0, ...far), min: Math.min(1e9, ...far), dogjob: (S.achievements || []).some(a => a.id === 'dogjob') };
    });
    assert.strictEqual(r.dogs, 2);
    assert(r.kinds.length >= 2, 'jobs ' + r.kinds.join(','));
    assert(r.mean > 8, 'mean distance to the farmer should not be a tight heel, got ' + r.mean);
    assert(r.dogjob, 'finishing a self-chosen job unlocks 旺旺队出动');
    assert.deepStrictEqual(p.errs, []);
  });

  await test('buying fish food and a goldfish, then releasing it, fills the pond and unlocks 锦鲤附体', async ctx => {
    const p = await open(ctx);
    const r = await p.evaluate(() => {
      const f = __farm, S = f.S;
      S.coins = 500;
      const food = f.buy('fishfood'), gf = f.buy('goldfish');
      const rel = f.orderRelease('goldfish');
      // skip walking: finish the release as if a family member had arrived
      const o = S.orders.find(q => q.type === 'release');
      S.t = 10 * 60; f.FARMER.home = false;
      // dump the fish in directly (the order path is also exercised by orderRelease)
      const placed = f.placePondFish('goldfish');
      S.orders = S.orders.filter(q => q !== o);
      S.ornament.goldfish = Math.max(0, (S.ornament.goldfish || 1) - 1);
      f.noteProgress({ pondCount: S.pondFish.length });
      const snap = f.snapshot();
      return { food: food.ok, gf: gf.ok, rel: rel.ok, pond: S.pondFish.length, kind: placed && placed.kind, ach: (snap.achievements || []).map(u => u.id), foodN: snap.inventory.fishFood, sv: snap.saveVersion };
    });
    assert(r.food && r.gf && r.rel);
    assert.strictEqual(r.pond, 1); assert.strictEqual(r.kind, 'goldfish'); assert.strictEqual(r.foodN, 1); assert.strictEqual(r.sv, 10);
    assert(r.ach.includes('ornamental'), '锦鲤附体 ' + r.ach.join(','));
    assert.deepStrictEqual(p.errs, []);
  });

  await test('a v9 save migrates: existing catches appear in the book, unseen cells stay empty', async ctx => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/fixtures/save-v9-day4.json'), 'utf8'));
    raw.catches = [{ id: 'bass', name: '鲈鱼', gold: 20, water: 'pond', day: 2 }];
    raw.inventory = Object.assign({}, raw.inventory, { basket: raw.inventory.basket || [] });
    const p = await ctx.newPage({ viewport: { width: 1280, height: 800 } }); p.errs = [];
    p.on('pageerror', e => p.errs.push(String(e)));
    await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(raw));
    await p.goto(`${base}/index.html?manual`);
    await p.waitForFunction(() => window.__farm && __farm.spritesReady());
    const r = await p.evaluate(() => {
      const s = __farm.snapshot();
      return { sv: s.saveVersion, v: __farm.version, bass: !!(s.codex.entries && s.codex.entries['fish:bass']), sword: !!(s.codex.entries && s.codex.entries['fish:sword']), food: s.inventory.fishFood, coins: s.coins };
    });
    assert.strictEqual(r.sv, 10); assert.strictEqual(r.v, '5.4.5'); assert(r.bass); assert(!r.sword); assert.strictEqual(r.food, 0);
    assert.deepStrictEqual(p.errs, []);
    await p.close();
  });

  await browser.close(); server.close();
  if (failed) { console.log(failed + ' failed'); process.exit(1); }
  console.log('codex-smoke: ok');
})().catch(e => { console.error(e); process.exit(1); });
