// 小红书小工具 1.3.2：玩家反馈「蜂箱挪不动，原来那块花甸就没法改建」。打包后的真触摸路径：⚒ 工具箱 → 挪东西 → 点蜂箱 → 移动 →
// 先瞄一块不是花甸的地（红框，✔ 不搬、蜂蜜不丢）→ 再瞄第二块花甸 ✔ → 其余 5 箱也搬过去 → 再读档 → 旧花甸改成动力坝。
//   bash platforms/xhs/pack.sh && node tools/xhs-beehive-shots.js [name-filter]   writes /workspace/pf-shots/xhs_beehive_*.png (PF_SHOTS / PF_TAG)
// Synthetic farm only (no player saves).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'xhs_beehive_';
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
  for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can','can','can']) f.buy(id);
  const a = f.buyPlot('swbank', 'meadow');
  const hives = []; for (let i = 0; i < 6; i++) hives.push(f.buy('hive').ok);
  const tray = f.buy('tray').ok;
  S.day += 3; const b = f.buyPlot('glade', 'meadow');
  S.works.hives.forEach((h, i) => { h.ready = i % 3; h.cd = 1 + (i % 2); });
  S.works.mach = Object.assign(S.works.mach || {}, { hn: 4 });
  S.t = Math.floor(S.t / 1440) * 1440 + 10 * 60; for (let i = 0; i < 4; i++) f.advance(1, 10);
  S.works.hives.forEach((h, i) => { h.ready = i % 3; h.cd = 1 + (i % 2); });
  f.setAngle(0); f.refreshUI();
  return { a: a.ok, b: b.ok, hives, tray, n: S.works.hives.length, at: S.works.hives.map(h => h.at), mach: S.works.mach };
})()`;
const HELPERS = `const f = __farm, S = f.S, R = PFTouch.RET();
  const center = (x, y) => { for (let i = 0; i < 4; i++) { const a = f.toClient(x, y); f.panScreen(8, 0); const b = f.toClient(x, y), k = (b.x - a.x) / 8; f.panScreen((R.x - b.x) / k, (R.y - b.y) / k); } };
  const mid = id => { const r = f.PL.plot(id).rect; return { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }; };
  const slot = (id, s) => f.PW.hiveSlots(S.plots, S.eff.regions).find(q => q.at === id && q.s === s);
  const hv = () => ({ n: S.works.hives.length, at: S.works.hives.map(h => h.at), s: S.works.hives.map(h => h.s), ready: S.works.hives.map(h => h.ready), cd: S.works.hives.map(h => h.cd), tray: !!(S.works.mach && S.works.mach.h), hn: f.PW.binHas(S.works.mach, 'honey'), spots: f.PWA.hiveSpots().filter(Boolean).length, vat: f.PWA.machSpots().filter(m => m.kind === 'vat').map(m => f.PL.plotAt(m.x, m.y) && f.PL.plotAt(m.x, m.y).id), gutters: f.PWA.machSpots().filter(m => m.kind === 'gutter').length });
  const quiet = () => { for (const id of ['say', 'albumToast', 'offline', 'shop', 'store', 'diary', 'loveTip']) { const e = document.getElementById(id); if (e) e.hidden = true; } };`;

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
  if (!farm.a || !farm.b || farm.hives.some(x => !x) || !farm.tray || farm.n !== 6 || farm.at.some(a => a !== 'swbank')) { console.error('setup failed', JSON.stringify(farm)); process.exit(1); }
  await p.evaluate(`(() => { ${HELPERS} quiet(); f.refreshUI(); })()`);
  await p.waitForFunction(() => { const b = document.getElementById('pt-box'); if (!b || b.hidden) return false; const q = b.getBoundingClientRect(); return q.width >= 44 && q.height >= 44; }, null, { timeout: 10000 });
  await p.waitForTimeout(300);

  const before = await step(p, 'before.png', async () => p.evaluate(`(() => { ${HELPERS} const d = mid('swbank'); center(d.x, d.y); f.render();
      return { farm: ${JSON.stringify(farm)}, h: hv(), busy: f.plotBusy('swbank'), slotsGlade: f.PW.hiveSlots(S.plots, S.eff.regions).filter(q => q.at === 'glade').length, ver: f.version }; })()`),
    r => r.h.n !== 6 || r.h.at.some(a => a !== 'swbank') ? 'hives ' + r.h.at : !r.h.tray || r.h.vat[0] !== 'swbank' || r.h.gutters !== 6 ? 'tray not on swbank' : !/挪东西/.test(r.busy || '') ? 'busy ' + r.busy : r.slotsGlade !== 6 ? 'glade slots ' + r.slotsGlade : r.ver !== VERSION ? 'ver ' + r.ver : null);
  const h0 = before && before.h;

  await step(p, 'pick.png', async () => {
    await tapEl(p, '#pt-box'); await p.waitForTimeout(350);
    const i = await p.evaluate(() => [...document.querySelectorAll('#pt-sheet .grid button')].findIndex(b => /挪东西/.test(b.textContent)));
    if (i < 0) throw new Error('挪东西 tile missing');
    await tapEl(p, `#pt-sheet .grid button:nth-child(${i + 1})`); await p.waitForTimeout(250);
    const c = await p.evaluate(`(() => { ${HELPERS} const q = f.PWA.hiveSpots()[2]; center(q.x, q.y); f.render(); const t = f.toClient(q.x, q.y); return { x: t.x, y: t.y, mode: f.input.mode }; })()`);
    await touch(p, [[c.x, c.y]]); await p.waitForTimeout(250);
    return p.evaluate(c0 => { const f = __farm; const flt = [...document.querySelectorAll('#pt-float button')].map(b => b.textContent.trim());
      return { mode: f.input.mode, startMode: c0.mode, pick: f.input.mvPick && f.input.mvPick.what, ref: f.input.mvPick && f.input.mvPick.ref, st: PFTouch.state().stage, float: flt }; }, c); },
    r => r.startMode !== 'move' ? 'mode ' + r.startMode : r.pick !== 'hive' || r.ref !== 2 ? 'tap missed hive ' + JSON.stringify(r) : r.st !== 'menu' ? 'stage ' + r.st : !r.float.some(t => /移动/.test(t)) ? 'no 移动 ' + r.float : null);

  // rejection: a plot that is not a 花甸 -> red box, ✔ moves nothing, honey stays
  await step(p, 'reject.png', async () => {
    await tapEl(p, '#pt-float [data-a="move"]'); await p.waitForTimeout(200);
    await p.evaluate(`(() => { ${HELPERS} center(100, 150); f.render(); })()`); await p.waitForTimeout(250);
    const r0 = await p.evaluate(() => ({ st: PFTouch.state().stage, ret: (document.getElementById('pt-ret') || {}).className }));
    await tapEl(p, '#pt-bar .ok'); await p.waitForTimeout(250);
    const r1 = await p.evaluate(`(() => { ${HELPERS} return { h: hv(), orders: S.decor.orders.filter(o => o.what === 'hive').length, stAfter: PFTouch.state().stage }; })()`);
    return Object.assign(r0, r1); },
    r => r.st !== 'moving' ? 'stage ' + r.st : r.ret === 'ok' ? 'crosshair ok off a meadow' : r.orders ? 'queued a move off a meadow' : JSON.stringify(r.h.ready) !== JSON.stringify(h0.ready) || JSON.stringify(r.h.at) !== JSON.stringify(h0.at) ? 'hives changed' : null);

  await step(p, 'moving.png', async () => {
    await p.waitForTimeout(2600); // the rejected ✔'s reason fades (touch.js keeps it 2.4s)
    const st = await p.evaluate(() => PFTouch.state().stage);
    if (st !== 'moving') { // the rejected ✔ ended the move: pick the hive again
      await p.evaluate(`(() => { ${HELPERS} f.setMode('move'); const q = f.PWA.hiveSpots()[2]; center(q.x, q.y); f.render(); })()`);
      const c = await p.evaluate(`(() => { ${HELPERS} const q = f.PWA.hiveSpots()[2], t = f.toClient(q.x, q.y); return { x: t.x, y: t.y }; })()`);
      await touch(p, [[c.x, c.y]]); await p.waitForTimeout(250); await tapEl(p, '#pt-float [data-a="move"]'); await p.waitForTimeout(200); }
    await p.evaluate(`(() => { ${HELPERS} const q = slot('glade', 1); center(q.x, q.y); f.render(); })()`); await p.waitForTimeout(250);
    return p.evaluate(`(() => { ${HELPERS} return { st: PFTouch.state().stage, ret: (document.getElementById('pt-ret') || {}).className, hint: (document.querySelector('#pt-bar .t') || {}).textContent || '', pick: f.input.mvPick && f.input.mvPick.ref }; })()`); },
    r => r.st !== 'moving' ? 'stage ' + r.st : r.ret !== 'ok' ? 'crosshair ' + r.ret + ' ' + r.hint : r.pick !== 2 ? 'pick ' + r.pick : null);

  const moved = await step(p, 'moved.png', async () => {
    await tapEl(p, '#pt-bar .ok'); await p.waitForTimeout(200);
    return p.evaluate(`(() => { ${HELPERS}
      const q = S.decor.orders.find(o => o.what === 'hive' && o.ref === 2); const settled = q ? f.settle(q) : false;
      quiet(); f.setMode(null); const g = slot('glade', 1); center(g.x, g.y); f.advance(0.2, 10); f.render();
      return { settled, h: hv(), busy: f.plotBusy('swbank') }; })()`); },
    r => !h0 ? 'no before' : !r.settled ? '✔ did not queue a move' : r.h.at[2] !== 'glade' ? 'hive 2 at ' + r.h.at[2] : r.h.n !== 6 ? 'count ' + r.h.n : JSON.stringify(r.h.ready) !== JSON.stringify(h0.ready) ? 'honey lost' : JSON.stringify(r.h.cd) !== JSON.stringify(h0.cd) ? 'countdown changed' : r.h.spots !== 6 ? 'spots ' + r.h.spots : !r.busy ? 'swbank free with 5 hives left' : null);

  const after = await step(p, 'after_glade.png', async () => p.evaluate(`(() => { ${HELPERS}
      const res = []; for (let i = 0; i < 6; i++) { if (S.works.hives[i].at === 'glade') continue; const g = slot('glade', [0, 2, 3, 4, 5][res.length]);
        const o = f.orderThing('move', 'hive', i, null, g.x, g.y, 1); res.push(o.ok && f.settle(o.q)); }
      quiet(); const d = mid('glade'); center(d.x, d.y); f.advance(0.2, 10); f.render();
      return { res, h: hv(), busy: f.plotBusy('swbank'), buyHive: f.buy('hive').ok }; })()`),
    r => r.res.some(x => !x) ? 'moves ' + r.res : r.h.at.some(a => a !== 'glade') ? 'at ' + r.h.at : new Set(r.h.s).size !== 6 ? 'slots ' + r.h.s : JSON.stringify(r.h.ready) !== JSON.stringify(h0.ready) ? 'honey lost' : !r.h.tray || r.h.vat[0] !== 'glade' || r.h.gutters !== 6 ? 'tray did not follow ' + JSON.stringify(r.h) : r.h.hn !== h0.hn ? 'bin honey' : r.busy ? 'swbank still busy: ' + r.busy : r.buyHive ? 'a 7th hive was sold' : r.h.n !== 6 ? 'count' : null);

  const saved = after ? await p.evaluate(() => { const s = __farm.snapshot(); return { snap: Object.assign(s, { savedAt: Date.now() }), bytes: new Blob([JSON.stringify(window.PFSave.compact(s))]).size }; }) : null;
  await p.context().close();

  if (saved && h0) {
    const p2 = await page({ 'mouzhi/pixel-farm:save': JSON.stringify(saved.snap) });
    await p2.evaluate(() => { const f = __farm, o = document.getElementById('offline'); if (o) o.hidden = true; f.SAVE.off = true;
      const fb = document.getElementById('xhs-follow'); if (fb && fb.classList.contains('on')) fb.click(); f.advance(0.2, 10); f.render(); });
    await p2.waitForTimeout(400);
    const rl = await step(p2, 'reload.png', async () => p2.evaluate(`(() => { ${HELPERS} quiet(); const d = mid('glade'); center(d.x, d.y); f.render();
        return { h: hv(), sv: f.snapshot().saveVersion, ver: f.version, bytes: ${saved.bytes} }; })()`),
      r => r.sv !== 15 ? 'save v' + r.sv : r.ver !== VERSION ? 'ver ' + r.ver : r.h.n !== 6 || r.h.at.some(a => a !== 'glade') ? 'hives after reload ' + r.h.at : JSON.stringify(r.h.ready) !== JSON.stringify(h0.ready) ? 'honey after reload' : !r.h.tray || r.h.vat[0] !== 'glade' ? 'tray after reload' : r.bytes >= 65536 ? 'compact save ' + r.bytes : null);
    if (rl) await step(p2, 'old_lot_dam.png', async () => p2.evaluate(`(() => { ${HELPERS} const busy = f.plotBusy('swbank'), z = f.rezonePlot('swbank', 'dam'); quiet(); const d = mid('swbank'), w = f.PL.plot('swbank').wheel || d; center((d.x + w.x) / 2, (d.y + w.y) / 2); f.advance(0.2, 10); f.render();
        return { busy, z: z && (z.ok !== undefined ? z.ok : z), why: z && z.why, mod: S.plots.swbank && S.plots.swbank.mod, h: hv() }; })()`),
      r => r.busy ? 'busy ' + r.busy : r.mod !== 'dam' ? 'swbank is ' + r.mod + ' ' + r.why : r.h.n !== 6 || r.h.at.some(a => a !== 'glade') ? 'hives moved by rezone' : null);
    await p2.context().close();
  }

  server.close(); await b.close();
  if (errs.length) { console.error('page/console errors:\n' + errs.join('\n')); process.exit(1); }
  if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
  console.log('ok   xhs-beehive-shots', VERSION);
})().catch(e => { console.error(e); process.exit(1); });
