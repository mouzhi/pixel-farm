// v5.11.0.10: the heart tip keeps each child's classmates (♥ rows, 好感 numbers, how far from a wedding) on screen in live play.
// Before, game.js hud() rewrote the open tip every frame with only the hint, so the rows drawn by ui.js lived for one frame.
// Runs WITHOUT ?manual (the real requestAnimationFrame loop), on a synthetic farm.  node tools/kidslove-shots.js [name-filter]
// Optional: PF_SAVE=/path/to/export.json also loads that save (local use only; never commit a player's save) -> kids_fix_save.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
// counts, over n animation frames, the frames where the open tip shows the closeness rows
const watch = n => new Promise(done => { let seen = 0, k = 0; const step = () => { if (document.querySelector('#loveTip:not([hidden]) .rel .rh')) seen++; if (++k >= n) return done({ seen, n }); requestAnimationFrame(step); }; requestAnimationFrame(step); });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await ctx.addInitScript(s => { localStorage.clear(); if (s) localStorage.setItem('mouzhi/pixel-farm:save', s); }, save || '');
    await p.goto(base + '/index.html'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 60000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offOk'); if (o) o.click(); }); return p; }
  const check = (name, r, bad) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); };
  const tipState = () => { const t = document.getElementById('loveTip'); const kids = __farm.S.family.kids.map(k => ({ id: k.id, slot: [...document.querySelectorAll('#inv .slot')].map(s => s.textContent.trim()).find(x => x.startsWith(k.name)) }));
    return { ver: __farm.SAVE && document.title.replace(/.* v/, ''), open: t && !t.hidden, txt: t ? t.textContent.replace(/\s+/g, ' ') : '', kids }; };

  // 1. a synthetic day-114 farm shaped like a long-running save: 小豆 (a teen) and 小米 (floored helper, now a teen), both with a classmate they like
  if (!only || 'kids_fix_tip.png'.includes(only)) {
    const p = await page();
    await p.evaluate(() => { const f = __farm, S = f.S; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
      for (const id of ['house', 'house', 'house']) f.buy(id);
      S.day = 114; S.t = 114 * 1440 + 10 * 60; S.family.kidGrowth = 1;
      S.family.kids = [{ id: 'kid0', name: '小豆', born: 48, floor: 'teen' }, { id: 'kid1', name: '小米', born: 58, floor: 'helper' }]; f.syncFamily();
      S.home.rel = { kid0: { m1: 57 }, kid1: { m0: 62, m1: 16, m2: 25 } }; S.home.nb = Object.assign({ n0: 100, n1: 14 }, S.home.nb); f.refreshUI(); });
    await p.waitForTimeout(400); await p.click('#loveHud');
    const w = await p.evaluate(watch, 90); await p.waitForTimeout(100); await p.screenshot({ path: path.join(OUT, 'kids_fix_tip.png') });
    const r = Object.assign(await p.evaluate(tipState), w);
    check('kids_fix_tip.png', r, r.ver !== VERSION ? 'ver ' + r.ver : !r.open ? 'tip closed' : r.seen < r.n ? `closeness rows on ${r.seen}/${r.n} frames` : !/小豆的同学/.test(r.txt) || !/小米的同学/.test(r.txt) ? 'no classmate rows' : !/62\/80/.test(r.txt) || !/57\/80/.test(r.txt) ? 'no wedding progress' : !/林老师/.test(r.txt) ? 'no neighbours' : !/小豆（少年/.test(r.txt) || !/小米（少年/.test(r.txt) ? 'stages (小米 is floored at 帮工 but 56 days old: 少年)' : null);
    // a 换个活法 button survives a few redraws (the tip only rewrites when its text changed)
    const same = await p.evaluate(async () => { const a = document.querySelector('#loveTip .rel'); await new Promise(r => setTimeout(r, 700)); return a === document.querySelector('#loveTip .rel'); });
    check('kids_fix_tip.png (stable node)', { same }, same ? null : 'tip DOM rebuilt while nothing changed');
    await p.context().close();
  }
  // 2. optional: a player's exported save (local only)
  if (process.env.PF_SAVE && (!only || 'kids_fix_save.png'.includes(only))) {
    const raw = JSON.parse(fs.readFileSync(process.env.PF_SAVE, 'utf8')); const save = JSON.stringify(raw.save || raw);
    const p = await page(save); await p.waitForTimeout(800); await p.click('#loveHud');
    const w = await p.evaluate(watch, 90); await p.waitForTimeout(100); await p.screenshot({ path: path.join(OUT, 'kids_fix_save.png') });
    await p.screenshot({ path: path.join(OUT, 'kids_fix_save_tip.png'), clip: { x: 0, y: 140, width: 330, height: 260 } });
    const r = Object.assign(await p.evaluate(tipState), w, { rel: await p.evaluate(() => __farm.S.home.rel) });
    check('kids_fix_save.png', r, r.seen < r.n ? `closeness rows on ${r.seen}/${r.n} frames` : null);
    await p.context().close();
  }
  await b.close(); server.close();
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); process.exit(1); }
  if (fails.length) { console.log('FAILED:', fails); process.exit(1); }
  console.log('all ok');
})().catch(e => { console.error(e); process.exit(1); });
