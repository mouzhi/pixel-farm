// v5.10.2 browser checks: no 2x / 4x game speed anywhere (shop, top bar, __farm), a save that bought it gets the price back
// exactly once with a log line, the clock runs at one speed, and a short absence is paid without touching the 24-hour window.
//   node tools/nospeed-shots.js   writes /workspace/pf-shots/v5102_*.png (PF_SHOTS to change); exits 1 on an error or a failed check.
//   PF_REAL_SAVE=<file> (a ===SAVE=== dump or an exported JSON; never committed) also loads that save: v5102_real.png.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const SIM = require('../sim.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const DAY59 = readSave(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json')); // bought 2x and 4x
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page(save, vw = 1280, vh = 800, q = '?manual') { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html' + q); await ready(p);
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p); }
    return p; }
  const check = (name, bad, r) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); };
  const ui = () => ({ v: __farm.version, coins: __farm.S.coins, refund: __farm.S.speedRefund, lv: __farm.S.up.speed | 0, speedEl: !!document.getElementById('speed'), set: typeof __farm.setGameSpeed,
    btn: [...document.querySelectorAll('button')].filter(e => /^[24]×$/.test(e.textContent.trim())).length, log: __farm.S.log.slice(0, 4) });
  const shopTools = async p => { await p.evaluate(() => { if (document.getElementById('shop').hidden) document.getElementById('shopBtn').click(); }); await p.waitForSelector('#shop:not([hidden])');
    await p.click('#shop [data-tab="tools"]'); await p.waitForTimeout(300);
    return p.evaluate(() => ({ speedBuy: !!document.querySelector('#shop [data-buy="speed"]'), text: /倍速/.test(document.getElementById('shop').innerText) })); };
  const refundOk = (r, s, gold) => r.v !== VERSION ? 'version ' + r.v : r.coins !== s.coins + gold ? 'coins ' + r.coins + ' vs ' + (s.coins + gold) : r.refund !== gold ? 'refund ' + r.refund : r.lv ? 'level kept'
    : r.speedEl || r.btn || r.set !== 'undefined' ? 'speed UI left' : !r.log.some(l => new RegExp('倍速已取消.*退回 ' + gold + ' 金').test(l)) ? 'log line' : null;

  // 1. a fresh farm: top bar and the tools tab have no speed
  { const p = await page(null); const r = await p.evaluate(ui), s = await shopTools(p); await p.screenshot({ path: path.join(OUT, 'v5102_shop_tools.png') });
    check('v5102_shop_tools.png', r.v !== VERSION ? 'version' : r.speedEl || r.btn ? 'speed buttons' : s.speedBuy || s.text ? 'speed in the shop' : null, Object.assign(r, s));
    // ?speed= is honoured on a local server only (tools); one game speed for the player: 10 s by day is about 30 game minutes
    const m = await p.evaluate(() => { const S = __farm.S; S.t = Math.floor(S.t / 1440) * 1440 + 9 * 60; __farm.F.sleeping = false; const a = S.t; __farm.advance(10, 10); return S.t - a; });
    check('one speed: 10 s = 30 game minutes', m < 25 || m > 35 ? 'minutes ' + m : null, { m }); await p.context().close(); }
  // 2. the day-59 fixture (bought 2x and 4x): 3600 back once, a log line; reload gives nothing more
  { const s = JSON.parse(JSON.stringify(DAY59)); s.savedAt = Date.now(); const gold = SIM.speedRefund(s.upgrades.speed);
    const p = await page(s); const r = await p.evaluate(ui); await p.evaluate(() => { __farm.render(); }); await p.screenshot({ path: path.join(OUT, 'v5102_refund_day59.png') });
    check('v5102_refund_day59.png', gold !== 3600 ? 'fixture level' : refundOk(r, s, gold), r);
    const c1 = await p.evaluate(() => { __farm.saveNow(); return __farm.S.coins; }); await p.reload(); await ready(p);
    const r2 = await p.evaluate(ui); check('reload: no second refund', r2.coins !== c1 || r2.refund !== 3600 ? 'coins ' + r2.coins + ' vs ' + c1 : null, r2);
    await p.context().close(); }
  // 3. a short absence (3 minutes) with the 24-hour window already full: paid, window unchanged
  { const s = JSON.parse(JSON.stringify(DAY59)); s.upgrades.speed = 0; s.stats.dayEarn = [4000, 4000, 4000]; s.savedAt = Date.now() - 3 * 60e3; s.offline = { win: [{ at: Date.now() - 3600e3, days: 3 }] };
    const p = await page(s); const r = await p.evaluate(() => ({ off: __farm.SAVE.offline && (({ days, gold, free, limited, used }) => ({ days, gold, free, limited, used }))(__farm.SAVE.offline), win: __farm.snapshot().offline.win, coins: __farm.S.coins, log: __farm.S.log.slice(0, 3) }));
    check('short absence is free', !r.off || !r.off.free || r.off.limited || !(r.off.gold > 0) || r.win.length !== 1 || r.win[0].days !== 3 || r.coins !== s.coins + r.off.gold ? 'not free' : null, r);
    await p.context().close(); }
  // 4. phone portrait: the top-right buttons without a speed group
  { const s = JSON.parse(JSON.stringify(DAY59)); s.savedAt = Date.now(); const p = await page(s, 390, 844); await p.evaluate(() => __farm.render()); const r = await p.evaluate(ui); await p.screenshot({ path: path.join(OUT, 'v5102_phone.png') });
    check('v5102_phone.png', r.speedEl || r.btn ? 'speed buttons' : null, { btn: r.btn }); await p.context().close(); }
  // 5. optional: a real exported save (local only)
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) { const s = readSave(process.env.PF_REAL_SAVE); s.savedAt = Date.now(); const gold = SIM.speedRefund((s.upgrades || {}).speed);
    const p = await page(s); const r = await p.evaluate(ui); await p.evaluate(() => { __farm.advance(20, 10); }); const day = await p.evaluate(() => __farm.S.day);
    await p.screenshot({ path: path.join(OUT, process.env.PF_REAL_NAME || 'v5102_real.png') });
    check(process.env.PF_REAL_NAME || 'v5102_real.png', gold ? refundOk(r, s, gold) : r.coins !== s.coins || r.refund ? 'touched coins' : null, Object.assign({ gold, day }, r)); await p.context().close(); }
  await b.close(); server.close();
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); fails.push('page errors'); }
  console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'all passed'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
