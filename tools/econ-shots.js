// v5.10.1 browser checks (economy): the 24-hour offline window (full, partial, used up, clock turned back) and 「家人帮忙添置」
// (shop-header toggle, one basic thing a day at the stall, first-time hint, off means off, the day-59 fixture untouched).
//   node tools/econ-shots.js   writes /workspace/pf-shots/v5101_*.png (PF_SHOTS to change); exits 1 on an error or a failed check.
//   PF_REAL_SAVE=<dump with ===SAVE===> also loads that save (never committed): empty window, toggle off, nothing bought by itself.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const FIXTURE = readSave(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'));
FIXTURE.upgrades.speed = 0; // v5.10.2: the fixture bought 2x / 4x; the refund is checked in nospeed-shots.js, here coins must only move by offline gold
const H = 3600e3;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page(save, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p); }
    await p.evaluate(() => { __farm.SAVE.off = true; }); return p; }
  const check = (name, bad, r) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); };
  const away = (min, win) => { const s = JSON.parse(JSON.stringify(FIXTURE)); s.stats.dayEarn = [4000, 4000, 4000]; s.savedAt = Date.now() - min * 60e3; if (win) s.offline = { win: win.map(w => ({ at: Date.now() + w[0], days: w[1] })) }; return s; };
  const offState = () => ({ v: __farm.version, r: __farm.SAVE.offline && (({ days, asked, used, limited, gold }) => ({ days, asked, used, limited, gold }))(__farm.SAVE.offline), shown: !document.getElementById('offline').hidden,
    box: document.getElementById('offline').innerText.replace(/\s+/g, ' '), win: __farm.snapshot().offline.win.length, log: __farm.S.log.slice(0, 3) });

  // 1. away 2 hours with an empty window: the old box, 3 days; then a hidden tab for 40 minutes the same day: nothing, a log line only
  { const p = await page(away(120)); const r1 = await p.evaluate(offState); await p.screenshot({ path: path.join(OUT, 'v5101_offline_full.png') });
    check('v5101_offline_full.png', r1.v !== VERSION ? 'version ' + r1.v : !r1.shown ? 'no box' : r1.r.days !== 3 || r1.r.limited ? 'days' : r1.r.gold !== 12000 ? 'gold ' + r1.r.gold : r1.win !== 1 ? 'window' : /24 小时/.test(r1.box) ? 'window note on a normal visit' : null, r1);
    const r2 = await p.evaluate(() => { document.getElementById('offline').hidden = true; const c0 = __farm.S.coins, r = __farm.settleOffline(2400); return Object.assign({ got: __farm.S.coins - c0, next: r && r.nextText }, (() => ({ shown: !document.getElementById('offline').hidden, log: __farm.S.log.slice(0, 2) }))()); });
    await p.evaluate(() => { __farm.setAngle(0); __farm.render(); }); await p.screenshot({ path: path.join(OUT, 'v5101_offline_used.png') });
    check('v5101_offline_used.png', r2.got !== 0 ? 'paid ' + r2.got : r2.shown ? 'box shown' : !r2.log.some(l => /3 天离线收益已经领过/.test(l) && /起恢复全部 3 天/.test(l) /* v5.11.0.8 review: rolling-window wording */) ? 'log line' : null, r2);
    await p.context().close(); }
  // 2. 2 days already settled 3 hours ago, away 2 hours now: 1 day, the box says so and when the window is full again
  { const p = await page(away(120, [[-3 * H, 2]])); const r = await p.evaluate(offState); await p.screenshot({ path: path.join(OUT, 'v5101_offline_partial.png') });
    check('v5101_offline_partial.png', !r.shown ? 'no box' : r.r.days !== 1 || !r.r.limited || r.r.used !== 2 ? 'days' : r.r.gold !== 4000 ? 'gold' : !/已经结算过 2 天，这次相当于 1 天的收入/.test(r.box) /* v5.11.0.8 copy */ || !/每 24 小时最多结算 3 天离线收益，(今天|明天) \d\d:\d\d 以后再满/.test(r.box) ? 'box text' : null, r);
    await p.context().close(); }
  // 3. the clock was turned back (saved 3 hours "in the future"): no gold, a log line, the window kept
  { const s = away(-180, [[2 * H, 3]]); const p = await page(s); const r = await p.evaluate(() => ({ off: __farm.SAVE.offline, coins: __farm.S.coins, shown: !document.getElementById('offline').hidden, log: __farm.S.log.slice(0, 3), win: __farm.snapshot().offline.win }));
    check('v5101_clock_back', r.off ? 'settled' : r.coins !== s.coins ? 'coins' : r.shown ? 'box' : !r.log.some(l => /时钟好像往回调过/.test(l)) ? 'log line' : r.win.length !== 1 ? 'window lost' : null, { coins: r.coins, log: r.log, win: r.win.length });
    // and back on the real clock a bit later: the future entry counts as now, so nothing more today
    const r2 = await p.evaluate(() => { const c0 = __farm.S.coins, x = __farm.settleOffline(4000); return { got: __farm.S.coins - c0, used: x && x.used, days: x && x.days }; });
    check('v5101_clock_back_then_away', r2.got !== 0 || r2.used !== 3 ? 'window freed early' : null, r2); await p.context().close(); }
  // 4. the toggle in the shop header (desktop and phone); clicking turns it on, the log says what it does; it survives a save round trip
  for (const [name, vw, vh] of [['v5101_shop_toggle.png', 1280, 800], ['v5101_shop_toggle_phone.png', 390, 844]]) {
    const p = await page(null, vw, vh); await p.evaluate(() => { document.getElementById('offline').hidden = true; __farm.S.coins = 420; document.getElementById('shopBtn').click(); });
    const before = await p.evaluate(() => { const bt = document.querySelector('#shop [data-a="autobuy"]'); return bt && bt.textContent; });
    await p.click('#shop [data-a="autobuy"]'); await p.waitForTimeout(100);
    const r = await p.evaluate(() => { const bt = document.querySelector('#shop [data-a="autobuy"]'), x = document.querySelector('#shop [data-a="close"]'), br = bt.getBoundingClientRect(), xr = x.getBoundingClientRect();
      return { on: __farm.S.autoBuy, text: bt.textContent, pressed: bt.getAttribute('aria-pressed'), title: bt.title.slice(0, 12), overlap: br.right > xr.left + 1 && br.top < xr.bottom - 1 && xr.top < br.bottom - 1, inView: br.right <= innerWidth && br.left >= 0,
        saved: PFSave.validate(JSON.parse(JSON.stringify(__farm.snapshot()))).settings.autoBuy, log: __farm.S.log[0] }; });
    r.before = before; await p.screenshot({ path: path.join(OUT, name) });
    check(name, before !== '家人帮忙添置 · 关' ? 'default not off' : !r.on || r.text !== '家人帮忙添置 · 开' || r.pressed !== 'true' ? 'not on' : r.overlap || !r.inView ? 'layout' : !r.saved ? 'not saved' : !/打开了「家人帮忙添置」/.test(r.log) ? 'log' : null, r);
    await p.context().close(); }
  // 5. on a fresh farm with the toggle on: at most one thing a day, in list order, with the first-time hint once; off means off
  { const p = await page(null); const r = await p.evaluate(() => { const f = __farm, S = f.S; document.getElementById('offline').hidden = true; S.coins = 3000; f.setAutoBuy(true);
      const days = []; const sum = () => Object.values(S.up).reduce((a, b) => a + b, 0);
      for (let d = 0; d < 4; d++) { const day = S.day, u0 = sum(); let guard = 0; while (S.day === day && guard++ < 400) f.advance(5, 4); days.push({ day, bought: sum() - u0, field: S.up.field, coins: S.coins }); }
      const lines = S.events.map(e => e.msg).filter(m => /帮家里添置了/.test(m));
      f.setAutoBuy(false); S.coins = 99999; const u1 = sum(), day = S.day; let guard = 0; while (S.day === day && guard++ < 400) f.advance(5, 4);
      return { days, lines, autoN: S.autoN, offBought: sum() - u1 }; });
    await p.evaluate(() => { __farm.setAngle(0); __farm.render(); }); await p.screenshot({ path: path.join(OUT, 'v5101_autobuy_log.png') });
    const bad = r.days.some(d => d.bought > 1) ? 'more than one a day' : r.days[3].field !== 3 ? 'fields ' + r.days[3].field : r.lines.length !== r.autoN ? 'lines' : !/不想让家人代买/.test(r.lines[0] || '') ? 'no first-time hint' : r.lines.slice(1).some(l => /不想让家人代买/.test(l)) ? 'hint repeated'
      : !/^农夫帮家里添置了家门口的田/.test(r.lines[0]) ? 'line text' : r.offBought ? 'bought while off' : null;
    check('v5101_autobuy_log.png', bad, r); await p.context().close(); }
  // 6. the day-59 fixture: toggle off and an empty window from validate (loading it then settles its own offline time); with the toggle on it buys at most one basic thing in a day and never touches the town hall or decor
  for (const [fname, FX] of [['v5101_fixture_day59', FIXTURE], ['v5101_fixture_v15_day72', readSave(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'))]]) { const p = await page(FX); const r = await p.evaluate(fx => { const f = __farm, S = f.S; document.getElementById('offline').hidden = true; const s0 = f.snapshot();
      const v = PFSave.validate(fx), base = { auto: S.autoBuy, win: v.offline.win.length, settings: v.settings, sv: s0.saveVersion, settled: s0.offline.win.length }; f.setAutoBuy(true); S.coins = 999999; const u = JSON.stringify(S.up), hall0 = JSON.stringify(S.town && S.town.hall || null), deco0 = JSON.stringify(S.decor.inv), day = S.day; let g = 0; while (S.day === day && g++ < 400) f.advance(5, 4);
      return Object.assign(base, { pick: PFSim.autoPick(S.up, S.coins, f.FARMER.wood, S.dayEarn).why, same: JSON.stringify(S.up) === u, upDiff: (o => Object.keys(S.up).reduce((a, k) => a + (S.up[k] - (o[k] | 0)), 0))(JSON.parse(u)), hallSame: JSON.stringify(S.town && S.town.hall || null) === hall0, decoSame: JSON.stringify(S.decor.inv) === deco0, autoN: S.autoN }); }, FX);
    check(fname, r.auto !== false || r.win !== 0 || r.settings.autoBuy !== false || r.sv !== 15 ? 'defaults' : !r.hallSame || !r.decoSame ? 'touched the town hall or decor' : r.autoN > 1 || r.upDiff !== r.autoN ? 'bought more than one basic thing' : null, r); await p.context().close(); }
  // 6b. the title: one line at 1280 (the full one) and on phones (the short one in the right dock), never over the HUD
  for (const [vw, vh] of [[1280, 800], [1024, 700], [800, 600], [390, 844], [360, 780]]) {
    const p = await page(null, vw, vh); await p.evaluate(() => { document.getElementById('offline').hidden = true; });
    const r = await p.evaluate(() => { const ids = ['title', 'titleS'], t = ids.map(id => document.getElementById(id)).find(e => getComputedStyle(e).display !== 'none'); if (!t) return { none: true };
      const first = t.id === 'title' ? t.firstChild : t, rg = document.createRange(); rg.selectNodeContents(first); const lines = new Set([...rg.getClientRects()].filter(q => q.width).map(q => Math.round(q.top))).size;
      const R = t.getBoundingClientRect(), H = document.getElementById('hud').getBoundingClientRect(), over = R.left < H.right && H.left < R.right && R.top < H.bottom && H.top < R.bottom;
      return { id: t.id, text: first.textContent.trim(), lines, over, inView: R.left >= 0 && R.right <= innerWidth }; });
    await p.screenshot({ path: path.join(OUT, `v5101_title_${vw}.png`), clip: { x: 0, y: 0, width: vw, height: Math.min(vh, 200) } });
    check(`v5101_title_${vw}.png`, r.none ? 'no title' : r.lines !== 1 ? r.lines + ' lines' : r.over ? 'over the HUD' : !r.inView ? 'off screen' : !r.text.includes('v' + VERSION) ? 'version' : null, r); await p.context().close(); }
  // 7. optional: a real exported save (local only)
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) {
    const real = readSave(process.env.PF_REAL_SAVE); real.savedAt = Date.now() - 2 * H; const p = await page(real);
    const r = await p.evaluate(() => ({ day: __farm.S.day, auto: __farm.S.autoBuy, off: __farm.SAVE.offline && __farm.SAVE.offline.days, win: __farm.snapshot().offline.win.length, shown: !document.getElementById('offline').hidden }));
    await p.screenshot({ path: path.join(OUT, 'v5101_real_save.png') });
    check('v5101_real_save.png', r.auto !== false ? 'toggle on' : r.off !== 3 || r.win !== 1 || !r.shown ? 'offline' : null, r); await p.context().close(); }
  await b.close(); server.close();
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); fails.push('page errors'); }
  if (fails.length) { console.log('\nFAILED:', fails); process.exit(1); } console.log('\nall v' + VERSION + ' economy checks ok');
})().catch(e => { console.error(e); process.exit(1); });
