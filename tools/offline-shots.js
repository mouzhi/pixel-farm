// v5.11.0.8 browser checks + shots for the offline copy (rules unchanged) and the compact save:
//   node tools/offline-shots.js   writes /workspace/pf-shots/offline_*.png (PF_SHOTS to change); exits 1 on a failed check.
//   PF_REAL_SAVE=<exported JSON> (local only, never committed) also round-trips that save in the page and prints its sizes.
// - the welcome-back box says the game clock stood still (还是第 N 天 HH:MM), the family worked at half speed, 「相当于 N 天的收入」
//   (never 「折合」), and that only the weather walked on (with the rain line when it rained)
// - a short absence (no box) floats 「+4,001 金（离开 4 分钟，时间暂停中）」 under the gold; a used-up window says when it pays again
// - phone portrait: the box and the toast stay on screen
// - the page saves the compact form; save -> reload -> save gives the same state
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', SAVE = require('../save.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const readSave = f => { const t = JSON.parse(fs.readFileSync(f, 'utf8')); return t.save || t; };
const DAY72 = readSave(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'));
const KEY = 'mouzhi/pixel-farm:save', H = 3600e3, MIN = 60e3;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page(save, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p);
    return p; }
  const check = (name, bad, r) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 400)); if (bad) fails.push(name + ': ' + bad); };
  const hm = t => { t = Math.floor(t % 1440); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const state = () => { const box = document.getElementById('offline'), t = document.getElementById('offToast'), c = document.getElementById('coins').getBoundingClientRect();
    const rb = box.getBoundingClientRect(), rt = t && t.getBoundingClientRect();
    return { day: __farm.S.day, t: __farm.S.t, coins: __farm.S.coins, off: __farm.SAVE.offline, box: box.hidden ? null : box.innerText, boxRect: box.hidden ? null : [rb.left, rb.top, rb.right, rb.bottom],
      toast: t && t.classList.contains('show') ? t.textContent : null, toastRect: rt && [rt.left, rt.top, rt.right, rt.bottom], coinsRect: [c.left, c.top, c.right, c.bottom], vw: innerWidth, vh: innerHeight }; };
  const fresh = (away, win, mut) => { const s = JSON.parse(JSON.stringify(DAY72)); s.savedAt = Date.now() - away; s.offline = { win: win || [] }; if (mut) mut(s); return s; };
  const onScreen = (r, k) => r[k] && r[k][0] >= 0 && r[k][1] >= 0 && r[k][2] <= r.vw && r[k][3] <= r.vh;
  const fmt = n => Number(n).toLocaleString('en-US');
  const boxOk = (r, s, extra) => !r.box ? 'no box' : r.day !== s.clock.day || Math.abs(r.t - s.clock.t) > 0.01 ? 'clock moved ' + r.day + ' ' + r.t
    : !r.box.includes(`游戏时间是暂停的：现在还是第 ${s.clock.day} 天 ${hm(s.clock.t)}`) ? 'no paused line' : !/家人按在线一半的速度帮你干活/.test(r.box) ? 'no half-speed line'
    : /折合/.test(r.box) ? '折合 still there' : !r.box.includes(`相当于 ${r.off.days} 天的收入`) ? 'no 相当于' : !r.box.includes(fmt(r.off.gold) + ' 金') ? 'gold' : r.coins !== s.coins + r.off.gold ? 'coins' : extra ? extra(r) : null;
  // 1. two hours away, empty window: the box (capped at 3 days); weather walked 3 days, no rain in them
  { const s = fresh(2 * H, [], s => { s.weather = Object.assign({}, s.weather, { nextDay: s.clock.day + 9, rained: 0 }); }); const p = await page(s); const r = await p.evaluate(state);
    await p.screenshot({ path: path.join(OUT, 'offline_popup.png') });
    check('offline_popup.png', boxOk(r, s, r => !/已到 3 天上限/.test(r.box) ? 'cap note' : !/日历没往前走，只有天气照常过了 3 天/.test(r.box) ? 'weather line' : /小雨/.test(r.box) ? 'rain line without rain' : null), r); await p.context().close(); }
  // 2. rain on one of the days away: the weather line says so
  { const s = fresh(2 * H, [], s => { s.weather = Object.assign({}, s.weather, { nextDay: s.clock.day + 2, rained: 0 }); }); const p = await page(s); const r = await p.evaluate(state);
    await p.screenshot({ path: path.join(OUT, 'offline_popup_rain.png') });
    check('offline_popup_rain.png', boxOk(r, s, r => !/只有天气照常过了 3 天，其间下过小雨，田都湿了/.test(r.box) ? 'rain line' : null), r); await p.context().close(); }
  // 3. 1.6 of the 3 days already settled in the last 24 hours: 「这次相当于 1.4 天的收入」
  { const s = fresh(2 * H, [{ at: Date.now() - 5 * H, days: 1.6 }]); const p = await page(s); const r = await p.evaluate(state);
    await p.screenshot({ path: path.join(OUT, 'offline_popup_limited.png') });
    check('offline_popup_limited.png', boxOk(r, s, r => !r.off.limited || r.off.days !== 1.4 ? 'not limited' : !/过去 24 小时已经结算过 1.6 天，这次相当于 1.4 天的收入/.test(r.box) ? 'limited line' : !/以后再满/.test(r.box) ? 'window note' : null), r); await p.context().close(); }
  // 4. four minutes away (window full, a short absence is still paid): no box, a toast under the gold
  { const s = fresh(4 * MIN, [{ at: Date.now() - H, days: 3 }]); const p = await page(s); const r = await p.evaluate(state);
    await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, 'offline_toast.png') });
    check('offline_toast.png', r.box ? 'box shown' : !(r.off.gold > 0) ? 'no gold' : r.toast !== `+${fmt(r.off.gold)} 金（离开 4 分钟，时间暂停中）` ? 'toast ' + r.toast
      : r.day !== s.clock.day || r.coins !== s.coins + r.off.gold ? 'clock / coins' : !(r.toastRect[1] >= r.coinsRect[3] - 1 && r.toastRect[1] < r.coinsRect[3] + 30) ? 'toast not under the gold' : !onScreen(r, 'toastRect') ? 'off screen' : null, r);
    await p.waitForTimeout(4300); const gone = await p.evaluate(() => document.getElementById('offToast').classList.contains('show')); check('toast fades', gone ? 'still there' : null, {}); await p.context().close(); }
  // 5. half an hour away with the 24-hour window used up: no gold, a toast that says when it pays again
  { const s = fresh(30 * MIN, [{ at: Date.now() - H, days: 3 }]); const p = await page(s); const r = await p.evaluate(state);
    await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, 'offline_toast_used.png') });
    check('offline_toast_used.png', r.box ? 'box shown' : r.coins !== s.coins ? 'coins' : !/^离开 30 分钟，时间暂停中（离线收益 (今天|明天) \d\d:\d\d 以后再算）$/.test(r.toast || '') ? 'toast ' + r.toast : null, r); await p.context().close(); }
  // 6. phone portrait (the xhs size): box and toast stay on screen
  { const s = fresh(2 * H, []); const p = await page(s, 390, 844); const r = await p.evaluate(state); await p.screenshot({ path: path.join(OUT, 'offline_phone_popup.png') });
    check('offline_phone_popup.png', boxOk(r, s, r => !onScreen(r, 'boxRect') ? 'box off screen ' + r.boxRect : null), r); await p.context().close(); }
  { const s = fresh(4 * MIN, []); const p = await page(s, 390, 844); const r = await p.evaluate(state); await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, 'offline_phone_toast.png') });
    check('offline_phone_toast.png', !r.toast ? 'no toast' : !onScreen(r, 'toastRect') ? 'toast off screen ' + r.toastRect : null, r); await p.context().close(); }
  // 7. the page writes the compact form; save -> reload -> save is byte-identical apart from savedAt
  async function roundTrip(name, raw) { const s = JSON.parse(JSON.stringify(raw)); s.savedAt = Date.now(); const p = await page(s);
    const one = await p.evaluate(k => { __farm.SAVE.off = false; __farm.saveNow(); __farm.SAVE.off = true; return localStorage.getItem(k); }, KEY);
    await p.reload(); await ready(p);
    const two = await p.evaluate(k => { __farm.SAVE.off = false; __farm.saveNow(); __farm.SAVE.off = true; return localStorage.getItem(k); }, KEY);
    // compare what a load gives (validate() drops the pond fish's swim fields); the log gains 「读取存档」 on every load
    const a = SAVE.migrate(JSON.parse(one)), z = SAVE.migrate(JSON.parse(two)); for (const x of [a, z]) { delete x.savedAt; delete x.log; }
    const verbose = Buffer.byteLength(JSON.stringify(SAVE.migrate(JSON.parse(one)))); // the same state written the old way
    const r = { verbose, saved: Buffer.byteLength(one), day: a.clock.day };
    check(name, JSON.stringify(a) !== JSON.stringify(z) ? 'state after reload differs' : !(Buffer.byteLength(JSON.stringify(SAVE.compact(SAVE.migrate(JSON.parse(one))))) <= r.saved) ? 'not the compact form' : r.saved > verbose * 0.75 ? 'not much smaller' : r.saved > 48 * 1024 ? 'over 48KB' : null, r);
    await p.context().close(); }
  await roundTrip('round trip: day-72 fixture', DAY72);
  await roundTrip('round trip: day-59 fixture', readSave(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json')));
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) await roundTrip('round trip: real save', readSave(process.env.PF_REAL_SAVE));
  await b.close(); server.close();
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); fails.push('page errors'); }
  console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'all passed'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
