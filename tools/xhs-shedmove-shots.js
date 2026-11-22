// 小红书小工具 1.3.1：打包后的真触摸路径搬第二套棚舍（打开 ⚒ 工具箱 → 挪东西 → 点第二套鸡舍 → 搬到另一块牧场 → 再读档）。
//   bash platforms/xhs/pack.sh && node tools/xhs-shedmove-shots.js [name-filter]   writes /workspace/pf-shots/xhs_shedmove_*.png (PF_SHOTS / PF_TAG)
// Existing tools/shedmove-shots.js drives the move through __farm.decorClick / settle; this file must go through
// #pt-box, #pt-sheet, a real touch on the shed, ✋ 移动, and #pt-bar ✔.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'xhs_shedmove_';
const VERSION = (fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('no platforms/xhs/dist: run bash platforms/xhs/pack.sh first'); process.exit(1); }
const server = http.createServer((req, res) => { const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
const MOCK = seed => `(() => { const mem = Object.assign({}, ${JSON.stringify(seed || {})}); const ok = v => Promise.resolve(v); window.__buzz = 0;
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: {
    getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); }, removeStorage: a => { delete mem[a.key]; return ok({}); },
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }),
    getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }), submitScore: () => ok({}), getRankList: () => ok({ data: [] }), getMyRank: () => ok({ rank: 1, score: 1, status: 'EXACT' }),
    getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({ follow_status: 1 }), share: () => ok({}), vibrateShort: () => { window.__buzz++; return ok({}); } } }; })();`;
const SETUP = `(() => {
  const f = __farm, S = f.S;
  f.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true;
  const fb = document.getElementById('xhs-follow'); if (fb && fb.classList.contains('on')) fb.click();
  S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 3000;
  for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','sty','fold','shed','can','can','can','can']) f.buy(id);
  const trail = f.buyPlot('trail', 'trail'), alp = f.buyPlot('alp', 'pasture');
  S.day = 51; if (S.plots.alp) S.plots.alp.day = 51;
  const built = ['coop2','sty2','fold2','shed2'].map(id => f.buy(id).ok);
  const nes = f.buyPlot('neslope', 'pasture');
  for (let i = 0; i < 12; i++) f.buy('chicken'); for (let i = 0; i < 6; i++) { f.buy('pig'); f.buy('sheep'); f.buy('cow'); }
  for (const k of f.PW.PEN2_IDS) S.troughs[k] = { feed: 7, water: 1 };
  S.works.mach = { f: (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7), e: 1, m: 1, eg: 5, mk: 3 };
  S.t = Math.floor(S.t / 1440) * 1440 + 10 * 60; for (let i = 0; i < 8; i++) f.advance(1, 10);
  for (const k of f.PW.PEN2_IDS) S.troughs[k] = { feed: 7, water: 1 };
  f.setAngle(0); f.refreshUI();
  return { trail: trail.ok, alp: alp.ok, nes: nes.ok, built, host: S.works.penHost, n: S.animals.length };
})()`;
const HELPERS = `const f = __farm, S = f.S, R = PFTouch.RET();
  const center = (x, y) => { for (let i = 0; i < 4; i++) { const a = f.toClient(x, y); f.panScreen(8, 0); const b = f.toClient(x, y), k = (b.x - a.x) / 8; f.panScreen((R.x - b.x) / k, (R.y - b.y) / k); } };
  const mid = id => { const r = f.PL.plot(id).rect; return { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }; };
  const counts = () => { const by = {}, trough = {}, fitted = {};
    S.animals.forEach(a => { const k = a.pen || a.kind; by[k] = (by[k] || 0) + 1; });
    for (const k of f.PW.PEN2_IDS) { trough[k] = S.troughs[k] && S.troughs[k].feed; fitted[k] = f.PW.fitted(S.works.mach, k); }
    return { n: S.animals.length, by, trough, fitted, bin: { eg: f.PW.binHas(S.works.mach, 'egg'), mk: f.PW.binHas(S.works.mach, 'milk') }, host: S.works.penHost }; };
  const inRoam = () => S.animals.filter(a => a.pen && f.PW.PEN2_IDS.includes(a.pen)).every(a => { const v = f.AV.get(a.id), R0 = f.PENS[a.pen] && f.PENS[a.pen].roam; return !v || (R0 && v.x >= R0[0] - 1 && v.x <= R0[2] + 1 && v.y >= R0[1] - 1 && v.y <= R0[3] + 1); });
  const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };`;

(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(seed) { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 discover/9.53.3 XHS' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(MOCK(seed || {})); await p.goto(base + '/index.html');
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && document.getElementById('xhs-bar') && window.PFTouch, null, { timeout: 30000 });
    await p.waitForTimeout(800);
    p.cdp = await ctx.newCDPSession(p); return p; }
  const touch = async (p, pts, hold) => { await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] }); if (hold) await p.waitForTimeout(hold);
    for (const q of pts.slice(1)) await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(150); };
  const tapEl = async (p, sel) => { const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel);
    if (!r) throw new Error('no ' + sel); await touch(p, [[r.x, r.y]]); return r; };
  const step = async (p, name, fn, check) => { name = TAG + name; if (only && !name.includes(only)) return null; let r; try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(250); if (!(r && r._shot === false)) await p.screenshot({ path: path.join(OUT, name) }); if (r) delete r._shot; const bad = r && r.error ? r.error : check(r);
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); return r; };

  const p = await page();
  const farm = await p.evaluate(SETUP);
  if (!farm.trail || !farm.alp || !farm.nes || farm.built.some(x => !x) || farm.host !== 'alp') {
    console.error('setup failed', farm); process.exit(1);
  }
  await p.evaluate(() => { for (const id of ['say', 'albumToast', 'offline', 'shop', 'store', 'diary', 'loveTip']) { const e = document.getElementById(id); if (e) e.hidden = true; } __farm.refreshUI(); });
  await p.waitForFunction(() => { const b = document.getElementById('pt-box'); if (!b || b.hidden) return false; const q = b.getBoundingClientRect(); return q.width >= 44 && q.height >= 44; }, null, { timeout: 10000 });
  await p.waitForTimeout(300);

  await step(p, 'toolbox.png', async () => { await tapEl(p, '#pt-box'); await p.waitForTimeout(350);
    return p.evaluate(`(() => { ${HELPERS} const t = [...document.querySelectorAll('#pt-sheet .grid button')];
      return { farm: ${JSON.stringify(farm)}, open: vis('pt-sheet'), tiles: t.map(b => b.textContent.replace(/\\s+/g, ' ').trim()), ver: f.version }; })()`); },
    r => !r.open ? 'sheet closed' : !r.tiles.some(t => /挪东西/.test(t)) ? 'no 挪东西 ' + r.tiles : r.ver !== VERSION ? 'ver ' + r.ver : null);

  await step(p, 'pick.png', async () => {
    const i = await p.evaluate(() => [...document.querySelectorAll('#pt-sheet .grid button')].findIndex(b => /挪东西/.test(b.textContent)));
    if (i < 0) throw new Error('挪东西 tile missing');
    await tapEl(p, `#pt-sheet .grid button:nth-child(${i + 1})`); await p.waitForTimeout(250);
    await p.evaluate(`(() => { ${HELPERS} const P = f.PENS.coop2.bld; center(P.x, P.y); f.render(); })()`); await p.waitForTimeout(200);
    const c = await p.evaluate(`(() => { ${HELPERS} const P = f.PENS.coop2.bld, q = f.toClient(P.x, P.y); return { x: q.x, y: q.y, mode: f.input.mode }; })()`);
    await touch(p, [[c.x, c.y]]); await p.waitForTimeout(250);
    return p.evaluate(c0 => { const f = __farm; const flt = [...document.querySelectorAll('#pt-float button')].map(b => b.textContent.trim());
      return { mode: f.input.mode, startMode: c0.mode, pick: f.input.mvPick && f.input.mvPick.what, ref: f.input.mvPick && f.input.mvPick.ref,
        st: PFTouch.state().stage, float: flt, store: flt.some(t => /收回/.test(t)) }; }, c); },
    r => r.startMode !== 'move' ? 'mode after toolbox ' + r.startMode : r.mode !== 'move' || r.pick !== 'pen2' || r.ref !== 'coop2' ? 'tap missed shed ' + JSON.stringify(r) : r.st !== 'menu' ? 'stage ' + r.st : !r.float.some(t => /移动/.test(t)) ? 'no 移动 ' + r.float : r.store ? '收回 shown for a shed' : null);

  const aimed = await step(p, 'aim.png', async () => {
    await tapEl(p, '#pt-float [data-a="move"]'); await p.waitForTimeout(200);
    await p.evaluate(`(() => { ${HELPERS} const d = mid('neslope'); center(d.x, d.y); f.render(); })()`); await p.waitForTimeout(250);
    return p.evaluate(`(() => { ${HELPERS} return { st: PFTouch.state().stage, ret: (document.getElementById('pt-ret') || {}).className, before: counts(), hint: (document.querySelector('#pt-bar .t') || {}).textContent || '', host: S.works.penHost }; })()`); },
    r => r.st !== 'moving' ? 'stage ' + r.st : r.ret !== 'ok' ? 'crosshair ' + r.ret + ' ' + r.hint : r.host !== 'alp' ? 'already moved' : null);

  const before = aimed && aimed.before;
  const moved = await step(p, 'moved.png', async () => {
    await tapEl(p, '#pt-bar .ok'); await p.waitForTimeout(200);
    return p.evaluate(`(() => { ${HELPERS}
      const q = S.decor.orders.find(o => o.what === 'pen2'); const settled = q ? f.settle(q) : false;
      const after = counts(); const d = mid('neslope'); center(d.x, d.y);
      const s = document.getElementById('say'); if (s) s.hidden = true;
      f.setMode(null); f.advance(0.2, 10); f.render();
      const snap = f.snapshot();
      return { settled, after, host: S.works.penHost, inRoam: inRoam(), sv: snap.saveVersion, ver: snap.gameVersion, hasMach: !!(snap.works && snap.works.mach), hasHeld: 'held' in (snap.works || {}) }; })()`); },
    r => !before ? 'no before counts' : !r.settled ? '✔ did not queue a move' : r.host !== 'neslope' ? 'host ' + r.host : r.after.n !== before.n ? 'lost animals' : JSON.stringify(r.after.by) !== JSON.stringify(before.by) ? 'pens' : JSON.stringify(r.after.trough) !== JSON.stringify(before.trough) ? 'troughs' : JSON.stringify(r.after.fitted) !== JSON.stringify(before.fitted) || JSON.stringify(r.after.bin) !== JSON.stringify(before.bin) ? 'machines' : !r.inRoam ? 'roam' : r.sv !== 15 ? 'save v' + r.sv : r.ver !== VERSION ? 'ver ' + r.ver : !r.hasMach ? 'mach dropped' : r.hasHeld ? 'unexpected works.held' : null);

  const saved = moved ? await p.evaluate(() => Object.assign(__farm.snapshot(), { savedAt: Date.now() })) : null;
  await p.context().close();

  if (saved && before && (!only || String(only).includes('reload'))) {
    const p2 = await page({ 'mouzhi/pixel-farm:save': JSON.stringify(saved) });
    await p2.evaluate(() => { const f = __farm, o = document.getElementById('offline'); if (o) o.hidden = true; f.SAVE.off = true;
      const fb = document.getElementById('xhs-follow'); if (fb && fb.classList.contains('on')) fb.click();
      f.advance(1, 10); f.render(); });
    await p2.waitForTimeout(400);
    await step(p2, 'reload.png', async () => p2.evaluate(`(() => { ${HELPERS}
        const c = counts(); const d = mid('neslope'); center(d.x, d.y);
        const out = S.animals.filter(a => a.pen && f.PW.PEN2_IDS.includes(a.pen)).map(a => { const v = f.AV.get(a.id), R0 = f.PENS[a.pen] && f.PENS[a.pen].roam; const ok = !v || (R0 && v.x >= R0[0] - 1 && v.x <= R0[2] + 1 && v.y >= R0[1] - 1 && v.y <= R0[3] + 1); return ok ? null : { id: a.id, pen: a.pen, x: v && +v.x.toFixed(1), y: v && +v.y.toFixed(1), R: R0 }; }).filter(Boolean);
        f.setMode('move');
        const hit = f.movableAt(f.PENS.coop2.bld.x, f.PENS.coop2.bld.y);
        f.render();
        return { c, hit: hit && hit.what, ref: hit && hit.ref, inRoam: inRoam(), out, sv: f.snapshot().saveVersion, ver: f.version, host: S.works.penHost }; })()`),
      r => r.host !== 'neslope' ? 'host ' + r.host : r.sv !== 15 ? 'save v' + r.sv : r.ver !== VERSION ? 'ver ' + r.ver : r.hit !== 'pen2' || r.ref !== 'coop2' ? 'shed not selectable after reload' : r.c.n !== before.n ? 'animals ' + r.c.n : JSON.stringify(r.c.trough) !== JSON.stringify(before.trough) ? 'troughs after reload' : JSON.stringify(r.c.fitted) !== JSON.stringify(before.fitted) || JSON.stringify(r.c.bin) !== JSON.stringify(before.bin) ? 'machines after reload' : !r.inRoam ? 'roam after reload' : null);
    await p2.context().close();
  }

  server.close(); await b.close();
  if (errs.length) { console.error('page/console errors:\n' + errs.join('\n')); process.exit(1); }
  if (fails.length) { console.error('FAIL\\n' + fails.join('\\n')); process.exit(1); }
  console.log('ok   xhs-shedmove-shots', VERSION);
})().catch(e => { console.error(e); process.exit(1); });
