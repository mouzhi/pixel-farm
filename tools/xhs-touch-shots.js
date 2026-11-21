// 小红书小工具 · 触屏工具模式（platforms/xhs/touch.js）：手机截图 + 检查，跑在打好的包上（390×844 @3x，真触摸事件）。
//   bash platforms/xhs/pack.sh && node tools/xhs-touch-shots.js [name-filter]   writes /workspace/pf-shots/touch_v2_*.png (PF_SHOTS / PF_TAG)
// Checks: #tools folds into ⚒; the toolbox (decor merged into one tile, sub-grid, big tiles); a tool hides the bottom bar and shows the crosshair +
// ✖/✔ bar; following pauses and comes back; green/red under the crosshair; ✔ places / explains; a tap pans that spot under the crosshair;
// 砍树 by ✔ and by tapping the tree; long-press picks → 移动 / 收回 / ✖; 收回 goes to the storehouse and stays; 撤销 asks first; slop 10 / pick 22.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'touch_v2_';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('no platforms/xhs/dist: run bash platforms/xhs/pack.sh first'); process.exit(1); }
const server = http.createServer((req, res) => { const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const FIX = (s => s.save || s)(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'), 'utf8')));
fs.mkdirSync(OUT, { recursive: true });
const MOCK = seed => `(() => { const mem = Object.assign({}, ${JSON.stringify(seed)}); const ok = v => Promise.resolve(v); window.__buzz = 0;
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: {
    getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); }, removeStorage: a => { delete mem[a.key]; return ok({}); },
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }),
    getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }), submitScore: () => ok({}), getRankList: () => ok({ data: [] }), getMyRank: () => ok({ rank: 1, score: 1, status: 'EXACT' }),
    getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({ follow_status: 1 }), share: () => ok({}), vibrateShort: () => { window.__buzz++; return ok({}); } } }; })();`;
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page() { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 discover/9.53.3 XHS' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(MOCK({ 'mouzhi/pixel-farm:save': JSON.stringify(Object.assign({}, FIX, { savedAt: Date.now() })) })); await p.goto(base + '/index.html');
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && document.getElementById('xhs-bar') && window.PFTouch, null, { timeout: 30000 });
    await p.waitForTimeout(800);
    await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; S.coins = 900000; f.FARMER.wood = 3000; if (!S.eff.axe) f.buy('axe');
      f.FARMER.saplings.apple = 3; f.FARMER.saplings.orange = 2; S.decor.inv.bench = (S.decor.inv.bench | 0) + 2; S.decor.inv.flowerpot = (S.decor.inv.flowerpot | 0) + 2; S.decor.inv.scarecrow = 1;
      if (S.weather) S.weather.rained = false; S.t = Math.floor(S.t / 1440) * 1440 + 10 * 60; f.setAngle(0); f.panTo(f.HOUSE.x + 30, f.HOUSE.y + 60); f.refreshUI(); });
    await p.waitForTimeout(400); p.cdp = await ctx.newCDPSession(p); return p; }
  const touch = async (p, pts, hold) => { await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] }); if (hold) await p.waitForTimeout(hold);
    for (const q of pts.slice(1)) await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(150); };
  const tapEl = async (p, sel) => { const r = await p.evaluate(s => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width, h: q.height }; }, sel);
    if (!r) throw new Error('no ' + sel); await touch(p, [[r.x, r.y]]); return r; };
  // pan the map so world (x, y) sits under the crosshair; find a spot that passes ok(x, y) near c
  const H = `const f = __farm, S = f.S, R = PFTouch.RET(); const center = (x, y) => { for (let i = 0; i < 4; i++) { const a = f.toClient(x, y); f.panScreen(8, 0); const b = f.toClient(x, y), k = (b.x - a.x) / 8; f.panScreen((R.x - b.x) / k, (R.y - b.y) / k); } };
    const spot = (ok, c, from) => { for (let r = 0; r <= 90; r += 3) for (let a = 0; a < 24; a++) { const x = c.x + r * Math.cos(a * Math.PI / 12), y = c.y + r * Math.sin(a * Math.PI / 12); if (from && Math.hypot(x - from.x, y - from.y) < 16) continue; if (ok(x, y)) return { x, y }; } return null; };
    const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };`;
  const step = async (p, name, fn, check) => { name = TAG + name; if (only && !name.includes(only)) return null; let r; try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(250); if (!(r && r._shot === false)) await p.screenshot({ path: path.join(OUT, name) }); if (r) delete r._shot; const bad = r && r.error ? r.error : check(r);
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 600)); if (bad) fails.push(name + ': ' + bad); return r; };
  const inScreen = `(() => { const bad = []; for (const id of ['pt-box', 'pt-sheet', 'pt-bar', 'pt-float']) { const e = document.getElementById(id); if (!e || e.hidden || !e.getClientRects().length) continue; const q = e.getBoundingClientRect(); if (q.left < -1 || q.top < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1) bad.push(id + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round)); } return bad; })()`;

  // A. the toolbox, placing a bench, the red explanation, tap-to-aim, leaving the mode
  { const p = await page();
    await step(p, 'box.png', async () => p.evaluate(`(() => { ${H} const box = document.getElementById('pt-box').getBoundingClientRect(); return { tools: vis('tools'), box: vis('pt-box'), boxSize: [box.width, box.height], bar: vis('xhs-bar'), touch: f.setTouch({}), follow: !!PFPlatform.followFarmer }; })()`),
      r => r.tools ? '#tools still shown' : !r.box ? 'no ⚒' : r.boxSize[0] < 44 ? 'small ⚒' : !r.bar ? 'bottom bar hidden' : r.touch.slop !== 10 || r.touch.pickCss !== 22 || !r.touch.onTap ? 'setTouch ' + JSON.stringify(r.touch) : null);
    await step(p, 'toolbox.png', async () => { await tapEl(p, '#pt-box'); return p.evaluate(`(() => { const t = [...document.querySelectorAll('#pt-sheet .grid button')]; return { open: !document.getElementById('pt-sheet').hidden, tiles: t.map(b => b.textContent.replace(/\\s+/g, ' ').trim()), minH: Math.min(...t.map(b => b.getBoundingClientRect().height)), off: ${inScreen}, buzz: window.__buzz }; })()`); },
      r => !r.open ? 'sheet closed' : r.tiles.filter(t => /摆装饰/.test(t)).length !== 1 ? 'decor not merged ' + r.tiles : r.tiles.some(t => /长椅|花盆/.test(t)) ? 'decor kinds on the first page' : !r.tiles.some(t => /砍树/.test(t)) || !r.tiles.some(t => /挪东西/.test(t)) ? 'tiles ' + r.tiles : r.minH < 64 ? 'small tiles ' + r.minH : r.off.length ? 'off screen ' + r.off : !r.buzz ? 'no haptic' : null);
    await step(p, 'decor_sub.png', async () => { await tapEl(p, '#pt-sheet [data-a="deco"]'); return p.evaluate(() => ({ tiles: [...document.querySelectorAll('#pt-sheet .grid button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()), back: !!document.querySelector('#pt-sheet .back') })); },
      r => !r.tiles.some(t => /长椅/.test(t)) || !r.tiles.some(t => /花盆/.test(t)) || !r.back ? 'sub grid ' + r.tiles : null);
    await step(p, 'place_ok.png', async () => { await tapEl(p, '#pt-sheet [data-d="0"]'); await p.waitForTimeout(200);
      await p.evaluate(`(() => { ${H} const ok = (x, y) => [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(d => f.placeOk(x + d[0], y + d[1], 'decor', f.input.kind, null).ok); const s = spot(ok, { x: f.HOUSE.x + 40, y: f.HOUSE.y + 45 }); center(s.x, s.y); })()`); await p.waitForTimeout(300);
      const r = await p.evaluate(`(() => { ${H} return { mode: f.input.mode, kind: f.input.kind, follow: !!PFPlatform.followFarmer, bar: vis('pt-bar'), xbar: vis('xhs-bar'), ret: document.getElementById('pt-ret').className, text: document.querySelector('#pt-bar .t').textContent, off: ${inScreen}, mine0: S.decor.orders.filter(q => q.mine).length }; })()`);
      await p.screenshot({ path: path.join(OUT, TAG + 'place_ok.png') }); await tapEl(p, '#pt-bar .ok'); r.mine1 = await p.evaluate(() => __farm.S.decor.orders.filter(q => q.mine).length); r._shot = false; return r; },
      r => r.mode !== 'decor' ? 'mode ' + r.mode : r.follow ? 'still following' : !r.bar || r.xbar ? 'bars ' + r.bar + '/' + r.xbar : r.ret !== 'ok' ? 'crosshair ' + r.ret : r.off.length ? 'off ' + r.off : r.mine1 !== r.mine0 + 1 ? 'no order ' + r.mine0 + '->' + r.mine1 : null);
    await step(p, 'place_bad.png', async () => { await p.evaluate(`(() => { ${H} if (!f.input.mode) document.querySelector('#tools [data-m="decor"]').click(); const s = spot((x, y) => !f.placeOk(x, y, 'decor', f.input.kind, null).ok && f.groundAt(x, y)[1] !== 'grass', { x: f.HOUSE.x + 40, y: f.HOUSE.y + 45 }); center(s.x, s.y); })()`); await p.waitForTimeout(300);
      const r0 = await p.evaluate(() => ({ ret: document.getElementById('pt-ret').className, mine: __farm.S.decor.orders.filter(q => q.mine).length, mode: __farm.input.mode })); await tapEl(p, '#pt-bar .ok'); await p.waitForTimeout(100);
      return Object.assign(r0, await p.evaluate(() => ({ why: (document.querySelector('#pt-bar .t .why') || {}).textContent || '', mine1: __farm.S.decor.orders.filter(q => q.mine).length, toast: getComputedStyle(document.getElementById('xhs-toast') || document.body).visibility }))); },
      r => r.mode !== 'decor' ? 'mode ' + r.mode : r.ret !== 'bad' ? 'crosshair ' + r.ret : !r.why ? 'no reason in the bar' : r.mine1 !== r.mine ? 'placed on a bad spot' : null);
    await step(p, 'tap_aims.png', async () => { const w = await p.evaluate(`(() => { ${H} const x = R.x - 90, y = R.y + 150; const a = f.toClient(0, 0), b = (f.panScreen(8, 0), f.toClient(0, 0)); f.panScreen(-8, 0); return { x, y, mine: S.decor.orders.filter(q => q.mine).length }; })()`);
      const wp = await p.evaluate(({ x, y }) => { const f = __farm; const R = document.querySelector('#wrap canvas, canvas').getBoundingClientRect(); return null; }, w);
      // the world point under (x, y) before the tap
      const before = await p.evaluate(({ x, y }) => { const f = __farm; for (let i = 0; i < 1; i++); let best = null; for (let wx = -100; wx < 400; wx += 1) {} return null; }, w);
      await p.evaluate(({ x, y }) => { window.__mark = (() => { const f = __farm; let bx = 0, by = 0, bd = 1e9; for (let wx = -60; wx < 360; wx += 2) for (let wy = -60; wy < 300; wy += 2) { const c = f.toClient(wx, wy), d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; bx = wx; by = wy; } } return { x: bx, y: by }; })(); }, w);
      await touch(p, [[w.x, w.y]]); await p.waitForTimeout(150);
      return p.evaluate(({ mine }) => { const f = __farm, R = PFTouch.RET(), c = f.toClient(window.__mark.x, window.__mark.y); return { d: Math.round(Math.hypot(c.x - R.x, c.y - R.y)), mineSame: f.S.decor.orders.filter(q => q.mine).length === mine, mode: f.input.mode }; }, w); },
      r => r.mode !== 'decor' ? 'left the mode' : r.d > 8 ? 'tapped spot not under the crosshair (' + r.d + 'px)' : !r.mineSame ? 'a tap placed something' : null);
    await step(p, 'exit.png', async () => { await tapEl(p, '#pt-bar .x'); await p.waitForTimeout(150); return p.evaluate(`(() => { ${H} return { mode: f.input.mode, follow: !!PFPlatform.followFarmer, xbar: vis('xhs-bar'), bar: vis('pt-bar'), box: vis('pt-box') }; })()`); },
      r => r.mode ? 'still in ' + r.mode : !r.follow ? 'following not restored' : !r.xbar || r.bar || !r.box ? 'bars ' + JSON.stringify(r) : null);
    await p.context().close(); }

  // B. 砍树: ✔ marks, ✔ again unmarks (↺), a direct tap on the tree marks
  { const p = await page();
    await step(p, 'chop.png', async () => { await tapEl(p, '#pt-box'); const i = await p.evaluate(() => [...document.querySelectorAll('#pt-sheet .grid button')].findIndex(b => /砍树/.test(b.textContent))); await tapEl(p, `#pt-sheet .grid button:nth-child(${i + 1})`);
      const t = await p.evaluate(`(() => { ${H} const t = S.trees.filter(t => t.stage === 'tree' && t.kind === 'wild' && window.PFWorld.choppable(t, S.eff.regions)).sort((a, b) => Math.hypot(a.x - f.HOUSE.x, a.y - f.HOUSE.y) - Math.hypot(b.x - f.HOUSE.x, b.y - f.HOUSE.y))[0]; center(t.x, t.y);
        for (let dy = 0; dy < 60; dy += 2) { const a = f.aimAt(R.x, R.y); if (a.ok) break; f.panScreen(0, 2); } return { id: t.id, mode: f.input.mode }; })()`); await p.waitForTimeout(200);
      await tapEl(p, '#pt-bar .ok'); await p.waitForTimeout(250); const m1 = await p.evaluate(id => ({ marked: __farm.S.orders.some(o => o.type === 'chop' && o.id === id), ok: document.querySelector('#pt-bar .ok').textContent, hint: document.querySelector('#pt-bar .t').textContent }), t.id);
      await p.screenshot({ path: path.join(OUT, TAG + 'chop.png') });
      await tapEl(p, '#pt-bar .ok'); const m2 = await p.evaluate(id => __farm.S.orders.some(o => o.type === 'chop' && o.id === id), t.id);
      const c = await p.evaluate(() => { const R = PFTouch.RET(); return R; }); await touch(p, [[c.x, c.y]]); const m3 = await p.evaluate(id => __farm.S.orders.some(o => o.type === 'chop' && o.id === id), t.id);
      return { mode: t.mode, m1, unmarked: !m2, tapMarked: m3, _shot: false }; },
      r => r.mode !== 'chop' ? 'mode ' + r.mode : !r.m1.marked ? 'not marked' : r.m1.ok !== '↺' ? 'button ' + r.m1.ok : !r.unmarked ? 'second ✔ did not unmark' : !r.tapMarked ? 'direct tap on the tree did not mark' : null);
    // 撤销 asks first
    await step(p, 'clear_confirm.png', async () => { await tapEl(p, '#pt-bar .x'); await p.evaluate(() => __farm.refreshUI()); await p.waitForTimeout(300); await tapEl(p, '#pt-box'); await tapEl(p, '#pt-sheet [data-c]');
      const r = await p.evaluate(() => ({ ask: (document.querySelector('#pt-sheet .cf') || {}).textContent || '', n: __farm.S.orders.length })); await p.screenshot({ path: path.join(OUT, TAG + 'clear_confirm.png') });
      await tapEl(p, '#pt-sheet [data-a="yes"]'); r.after = await p.evaluate(() => __farm.S.orders.length); r._shot = false; return r; },
      r => !/撤销/.test(r.ask) ? 'no confirm' : !r.n ? 'nothing to clear' : r.after !== 0 ? 'not cleared ' + r.after : null);
    await p.context().close(); }

  // C. 挪东西: long-press a bench → 移动 / 收回 / ✖; 移动 → ✔ moves it; 收回 → storehouse, kept
  { const p = await page();
    const placed = await p.evaluate(`(() => { ${H} const fb = document.getElementById('xhs-follow'); if (fb && fb.classList.contains('on')) fb.click(); const s = spot((x, y) => f.placeOk(x, y, 'decor', 'bench', null).ok, { x: f.HOUSE.x + 40, y: f.HOUSE.y + 45 }); const o = f.orderThing('place', 'decor', null, 'bench', s.x, s.y, true); f.settle(o.q); f.render();
      const q = S.decor.placed[S.decor.placed.length - 1]; center(q.x, q.y + 20); f.render(); return { u: q.u, x: q.x, y: q.y }; })()`);
    await step(p, 'longpress.png', async () => { const c = await p.evaluate(({ x, y }) => { const q = __farm.toClient(x, y); return { x: q.x + 12, y: q.y - 4 }; }, placed); // 12px off: inside the 22px floor
      const dbg = await p.evaluate(({ x, y }) => { const f = __farm; f.setMode('move'); const a = f.aimAt(x, y); f.setMode(null); return { what: a.what && a.what.what, x, y, el: (document.elementFromPoint(x, y) || {}).id }; }, c);
      await touch(p, [[c.x, c.y]], 650); await p.waitForTimeout(200);
      return p.evaluate(dbg => ({ dbg, mode: __farm.input.mode, pick: __farm.input.mvPick && __farm.input.mvPick.what, st: PFTouch.state().stage, float: [...document.querySelectorAll('#pt-float button')].map(b => b.textContent.trim()), ok: document.querySelector('#pt-bar .ok').disabled }), dbg); },
      r => r.mode !== 'move' || r.pick !== 'decor' ? 'not picked ' + JSON.stringify(r) : r.st !== 'menu' ? 'stage ' + r.st : r.float.length !== 3 || !/移动/.test(r.float[0]) || !/收回/.test(r.float[1]) ? 'float ' + r.float : !r.ok ? '✔ should wait for a choice' : null);
    await step(p, 'moving.png', async () => { await tapEl(p, '#pt-float [data-a="move"]'); await p.waitForTimeout(150);
      await p.evaluate(`(() => { ${H} const pk = f.input.mvPick; const s = spot((x, y) => [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(d => f.placeOk(x + d[0], y + d[1], 'decor', 'bench', { what: 'decor', ref: pk.ref }).ok), { x: pk.x, y: pk.y + 6 }, pk); center(s.x, s.y); })()`); await p.waitForTimeout(300);
      const r = await p.evaluate(() => ({ st: PFTouch.state().stage, ret: document.getElementById('pt-ret').className, float: !document.getElementById('pt-float').hidden, hint: document.querySelector('#pt-bar .t').textContent }));
      await p.screenshot({ path: path.join(OUT, TAG + 'moving.png') }); await tapEl(p, '#pt-bar .ok'); r.order = await p.evaluate(u => __farm.S.decor.orders.some(q => q.op === 'move' && q.ref === u), placed.u); r._shot = false; return r; },
      r => r.st !== 'moving' ? 'stage ' + r.st : r.float ? 'float still shown while moving' : r.ret !== 'ok' ? 'crosshair ' + r.ret : !r.order ? 'no move order' : null);
    await step(p, 'store.png', async () => { await p.evaluate(u => { const f = __farm; f.setMode(null); f.S.decor.orders.filter(q => q.ref === u).forEach(q => f.settle(q)); }, placed.u); await p.waitForTimeout(150);
      const q = await p.evaluate(u => { const f = __farm, q = f.S.decor.placed.find(p => p.u === u); const R = PFTouch.RET(); for (let i = 0; i < 4; i++) { const a = f.toClient(q.x, q.y); f.panScreen(8, 0); const b = f.toClient(q.x, q.y), k = (b.x - a.x) / 8; f.panScreen((R.x - b.x) / k, (R.y + 60 - b.y) / k); } const c = f.toClient(q.x, q.y); return { x: c.x, y: c.y - 3 }; }, placed.u);
      await touch(p, [[q.x, q.y]], 650); await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, TAG + 'store.png') }); await tapEl(p, '#pt-float [data-a="store"]');
      return p.evaluate(u => { const f = __farm, S = f.S, inv0 = S.decor.inv.bench | 0; const ord = S.decor.orders.some(q => q.op === 'store' && q.ref === u); for (let i = 0; i < 900 && S.decor.orders.some(q => q.op === 'store'); i++) f.advance(1, 10);
        return { _shot: false, ord, mode: f.input.mode, gone: !S.decor.placed.some(p => p.u === u), inv: (S.decor.inv.bench | 0) - inv0, kept: f.keptOf('bench') }; }, placed.u); },
      r => !r.ord ? 'no store order' : r.mode ? 'mode left on ' + r.mode : !r.gone || r.inv !== 1 || r.kept < 1 ? 'not stored ' + JSON.stringify(r) : null);
    await p.context().close(); }

  // D. 放养锦鲤 is one tap since v5.10.13 (straight into the pond, no map aiming); a long-press while following the farmer still picks
  //    (following pauses under the finger and comes back after a plain tap)
  { const p = await page();
    await step(p, 'release.png', async () => { await p.evaluate(() => { __farm.FARMER.crops.push('koi'); __farm.refreshUI(); }); await p.waitForTimeout(300); const n0 = await p.evaluate(() => __farm.S.pondFish.length); await tapEl(p, '#pt-box');
      const i = await p.evaluate(() => [...document.querySelectorAll('#pt-sheet .grid button')].findIndex(b => /锦鲤/.test(b.textContent))); if (i < 0) throw new Error('no 放养锦鲤 tile'); await tapEl(p, `#pt-sheet .grid button:nth-child(${i + 1})`); await p.waitForTimeout(300);
      return p.evaluate(n0 => ({ n0, n1: __farm.S.pondFish.length, mode: __farm.input.mode, sheet: PFTouch.state().sheet }), n0); },
      r => r.n1 !== r.n0 + 1 ? 'pond ' + r.n0 + '->' + r.n1 : r.mode ? 'left a mode on: ' + r.mode : r.sheet ? 'sheet still open' : null);
    await step(p, 'longpress_follow.png', async () => { await p.evaluate(() => { const f = __farm; f.setMode(null); const fb = document.getElementById('xhs-follow'); if (fb && !fb.classList.contains('on')) fb.click(); });
      const q = await p.evaluate(`(() => { ${H} const s = spot((x, y) => f.placeOk(x, y, 'decor', 'bench', null).ok, { x: f.FARMER.x + 10, y: f.FARMER.y + 10 }); const o = f.orderThing('place', 'decor', null, 'bench', s.x, s.y, true); f.settle(o.q); f.advance(0.2, 10); return { x: s.x, y: s.y }; })()`);
      // a plain tap on empty ground: following stays on
      const e = await p.evaluate(() => ({ x: innerWidth / 2 + 120, y: innerHeight / 2 + 200 })); await touch(p, [[e.x, e.y]]); const f1 = await p.evaluate(() => !!PFPlatform.followFarmer);
      const c = await p.evaluate(({ x, y }) => __farm.toClient(x, y), q); await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
      await p.evaluate(() => { const f = __farm; f.FARMER.x += 40; }); await p.waitForTimeout(650); await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(200);
      const r = await p.evaluate(() => ({ mode: __farm.input.mode, pick: __farm.input.mvPick && __farm.input.mvPick.what, follow: !!PFPlatform.followFarmer, st: PFTouch.state() }));
      await tapEl(p, '#pt-bar .x'); await tapEl(p, '#pt-bar .x'); r.after = await p.evaluate(() => ({ mode: __farm.input.mode, follow: !!PFPlatform.followFarmer })); r.f1 = f1; return r; },
      r => !r.f1 ? 'a plain tap turned following off' : r.mode !== 'move' || r.pick !== 'decor' ? 'long-press while following did not pick ' + JSON.stringify(r) : r.follow ? 'following not paused in the tool' : r.after.mode || !r.after.follow ? 'after ✖ ' + JSON.stringify(r.after) : null);
    await p.context().close(); }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
