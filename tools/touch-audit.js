// Phone touch audit of the map tools (砍树 / 种树 / 放养 / 摆装饰 / 挪东西) on the web build and the packed xhs build.
//   node tools/touch-audit.js [web|xhs]   (xhs: PF_XHS_DIST=<packed dist>)  writes /workspace/pf-shots/touch_before_*.png + touch-audit.json
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'touch_before_';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const serve = root => http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const readSave = f => { const s = JSON.parse(fs.readFileSync(f, 'utf8')); return s.save || s; };
const FIX = readSave(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'));
const MOCK = seed => `(() => { const mem = Object.assign({}, ${JSON.stringify(seed)}); const ok = v => Promise.resolve(v);
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: { getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); }, removeStorage: a => { delete mem[a.key]; return ok({}); },
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }), getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }),
    submitScore: () => ok({}), getRankList: () => ok({ data: [] }), getMyRank: () => ok({ rank: 1, score: 1, status: 'EXACT' }), getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({}), share: () => ok({}) } }; })();`;
const target = process.argv[2] || 'web';
const ROOT = target === 'xhs' ? (process.env.PF_XHS_DIST || '/workspace/pf-touch-xhs/platforms/xhs/dist') : path.resolve(__dirname, '..');
const KEY = 'mouzhi/pixel-farm:save';
(async () => { const server = serve(ROOT); await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 discover/9.53.3 XHS' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const seed = { [KEY]: JSON.stringify(Object.assign({}, FIX, { savedAt: Date.now() })) };
  if (target === 'xhs') await p.addInitScript(MOCK(seed)); else await p.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem(s.k, s.v); sessionStorage.setItem('seeded', 1); } }, { k: KEY, v: seed[KEY] });
  await p.goto(base + '/index.html' + (target === 'web' ? '?manual' : '')); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await p.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(p);
  const touch = async (pts) => { // pts: [[x,y],...] one finger: down at first, moves, up at last
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] });
    for (const q of pts.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(120); };
  const finger = (x, y, label) => p.evaluate(([x, y, label]) => { const d = document.createElement('div'); d.className = 'fingerdemo'; d.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:58px;border-radius:22px 22px 18px 18px;background:rgba(240,200,170,.72);border:2px solid rgba(120,70,40,.6);z-index:999;pointer-events:none`;
    document.body.appendChild(d); if (label) { const t = document.createElement('div'); t.className = 'fingerdemo'; t.textContent = label; t.style.cssText = `position:fixed;left:${Math.max(4, x - 90)}px;top:${y + 40}px;width:180px;text-align:center;font:600 12px sans-serif;color:#fff;background:rgba(160,30,30,.85);padding:3px 4px;border-radius:6px;z-index:999;pointer-events:none`; document.body.appendChild(t); } }, [x, y, label || '']);
  const clearFingers = () => p.evaluate(() => document.querySelectorAll('.fingerdemo').forEach(e => e.remove()));
  const shot = n => p.screenshot({ path: path.join(OUT, TAG + target + '_' + n + '.png') });
  const M = {};
  // farm well along with every tool on: axe, saplings, a koi, a stored bench, goldfish in the storehouse
  M.setup = await p.evaluate(() => { const f = __farm, S = f.S; const o = document.getElementById('offline'); if (o) o.hidden = true; S.coins = 900000; f.FARMER.wood = 3000;
    if (!S.eff.axe) f.buy('axe'); f.FARMER.saplings.apple = 3; f.FARMER.saplings.orange = 2; S.decor.inv.bench = (S.decor.inv.bench | 0) + 1; S.decor.inv.flowerpot = (S.decor.inv.flowerpot | 0) + 2;
    if (S.ornament) S.ornament.goldfish = 0; f.FARMER.crops.push('koi'); S.t = Math.floor(S.t / 1440) * 1440 + 10 * 60; if (f.SAVE) f.SAVE.off = true; f.setAngle && f.setAngle(0); f.panTo && f.panTo(f.HOUSE.x + 30, f.HOUSE.y + 50); f.refreshUI(); f.render();
    const cv = document.querySelector('canvas'), r = cv.getBoundingClientRect(); return { canvas: [r.left, r.top, r.width, r.height].map(Math.round), version: window.GAME_VERSION || (document.title) }; });
  await p.waitForTimeout(1500); await p.evaluate(() => __farm.render());
  M.drift = await p.evaluate(async () => { const f = __farm, a = f.toClient(f.HOUSE.x, f.HOUSE.y); f.setMode('chop'); await new Promise(r => setTimeout(r, 1500)); const c = f.toClient(f.HOUSE.x, f.HOUSE.y); f.setMode(null); return { follow: !!(window.PFPlatform && PFPlatform.followFarmer), px1500ms: Math.round(Math.hypot(c.x - a.x, c.y - a.y)) }; });
  M.layout = await p.evaluate(() => { const rect = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
    const tools = document.getElementById('tools'), btns = [...tools.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), r: rect(b) }));
    const rows = new Set(btns.map(b => b.r[1])).size; const hud = [...document.querySelectorAll('#hud, #log, #minimap, #catches, #xhs-bar, #xhs-side, #bar, #shopBtn')].filter(e => e.offsetParent || getComputedStyle(e).position === 'fixed').map(e => ({ id: e.id, r: rect(e) }));
    const f = __farm, a = f.toClient(0, 0), c = f.toClient(10, 0); return { tools: rect(tools), rows, btns, minBtnH: Math.min(...btns.map(b => b.r[3])), cssPerWorld: Math.round(Math.hypot(c.x - a.x, c.y - a.y) / 10 * 100) / 100, hud }; });
  await shot('tools');
  // chop: tree hit box size; a tap that wobbles 6 px is taken as a pan (no mark); the finger hides the tree
  M.chop = await p.evaluate(() => { const f = __farm, S = f.S; if (window.PFPlatform) PFPlatform.followFarmer = false; f.setMode('chop'); const t = S.trees.filter(t => t.stage === 'tree' && t.kind === 'wild' && window.PFWorld.choppable(t, S.eff.regions)).map(t => ({ t, c: f.toClient(t.x, t.y) })).filter(o => { const R = document.querySelector('canvas').getBoundingClientRect(); return o.c.x > Math.max(40, R.left + 20) && o.c.x < Math.min(350, R.right - 20) && o.c.y > Math.max(200, R.top + 60) && o.c.y < Math.min(640, R.bottom - 10); }).sort((a, b) => Math.abs(a.c.x - 195) + Math.abs(a.c.y - 420) - Math.abs(b.c.x - 195) - Math.abs(b.c.y - 420));
    if (!t.length) return { none: true }; const o = t[0]; const cvr = document.querySelector('canvas'), k = cvr.getBoundingClientRect().width / cvr.width; return { id: o.t.id, x: Math.round(o.c.x), y: Math.round(o.c.y), hitWcss: Math.round(32 * k), n: t.length }; });
  if (!M.chop.none) { const { x, y, id } = M.chop; const before = await p.evaluate(() => __farm.S.orders.length);
    await touch([[x, y - 14], [x + 4, y - 16], [x + 6, y - 14]]); M.chop.wobbleMarked = (await p.evaluate(() => __farm.S.orders.length)) > before;
    await touch([[x, y - M.chop.hitWcss * 0.5]]); M.chop.tapMarked = await p.evaluate(id => __farm.S.orders.some(o => o.type === 'chop' && o.id === id), id);
    await touch([[x + 22, y - 14]]); M.chop.miss22pxSays = await p.evaluate(() => { const s = document.getElementById('say') || document.getElementById('xhs-toast'); return s && !s.hidden ? s.textContent.slice(0, 40) : ''; });
    await finger(x, y - 14, '手指盖住了要砍的树，也看不到斧头标记'); await shot('chop'); await clearFingers(); }
  // plant: preview only exists while the finger is down; after lifting, nothing shows where it would go
  M.plant = await p.evaluate(() => { const f = __farm; f.setMode('plant', 'apple'); f.render(); return { hoverBeforeTouch: f.input.hover }; });
  { const c = await p.evaluate(() => { const q = __farm.toClient(__farm.HOUSE.x + 40, __farm.HOUSE.y + 60); return [Math.round(q.x), Math.round(q.y)]; });
    await touch([[c[0], c[1]]]); M.plant.orders = await p.evaluate(() => __farm.S.orders.filter(o => o.type === 'plant').length); M.plant.lastSay = await p.evaluate(() => { const s = document.getElementById('say'); return s ? s.textContent : ''; }); }
  await p.evaluate(() => __farm.setMode(null));
  // release (xhs 1.2.0 still has the mode; web v5.10.13 stocks goldfish on purchase, koi still go through the mode)
  M.release = await p.evaluate(async () => { const f = __farm; f.refreshUI(); const b = document.querySelector('#tools [data-m="release"]'); if (!b) return { button: false }; b.click(); await new Promise(r => setTimeout(r, 300)); const pc = f.toClient(f.POND.x, f.POND.y), pe = f.toClient(f.POND.x + f.POND.rx + 6, f.POND.y);
    return { button: true, mode: f.input.mode, pondCss: [Math.round(pc.x), Math.round(pc.y)], pondRadiusCss: Math.round(Math.abs(pe.x - pc.x)), onScreen: pc.x > 0 && pc.x < innerWidth && pc.y > 0 && pc.y < innerHeight }; });
  await shot('release'); await p.evaluate(() => __farm.setMode(null));
  // decor: green/red box only under the finger; after a bad tap there is just a toast
  M.decor = await p.evaluate(() => { const f = __farm; f.refreshUI(); const b = document.querySelector('#tools [data-m="decor"]'); if (!b) return { button: false }; b.click(); return { button: true, mode: f.input.mode, kind: f.input.kind, hoverBeforeTouch: f.input.hover }; });
  { const c = await p.evaluate(() => { const q = __farm.toClient(__farm.HOUSE.x + 20, __farm.HOUSE.y + 30); return [Math.round(q.x), Math.round(q.y)]; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c[0], y: c[1] }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c[0] + 2, y: c[1] + 1 }] }); await p.waitForTimeout(150);
    M.decor.hoverWhileDown = await p.evaluate(() => __farm.input.hover && __farm.input.hover.dec && { ok: __farm.input.hover.dec.ok }); await finger(c[0] + 2, c[1] + 1, '绿/红框就在手指正下方'); await shot('decor');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await clearFingers(); }
  await p.evaluate(() => __farm.setMode(null));
  // move: two taps (pick, then target). Small decor has a 6-world-unit pick radius; no drag; nothing says how to cancel without Esc
  M.move = await p.evaluate(() => { const f = __farm; f.refreshUI(); const b = document.querySelector('#tools [data-m="move"]'); if (!b) return { button: false }; b.click(); const items = f.movables ? f.movables() : [];
    const small = items.find(m => m.what === 'decor' && m.r === 6) || items[0]; if (!small) return { button: true, items: 0 }; f.panTo(small.x, small.y + 10); f.render(); const c = f.toClient(small.x, small.y), e = f.toClient(small.x + small.r, small.y);
    return { button: true, items: items.length, kinds: [...new Set(items.map(m => m.what))], pick: small.what + ':' + (small.id || small.ref), x: Math.round(c.x), y: Math.round(c.y), pickRadiusCss: Math.round(Math.hypot(e.x - c.x, e.y - c.y)) }; });
  if (M.move.x) { const { x, y } = M.move; await touch([[x, y]]); M.move.picked = await p.evaluate(() => !!__farm.input.mvPick);
    await touch([[x + 30, y - 40], [x + 60, y - 70], [x + 90, y - 100]]); M.move.dragPanned = await p.evaluate(() => !!__farm.input.mvPick); // the drag pans the map, the thing does not follow
    await finger(x + 90, y - 100, '拖不动东西：一拖就变成平移地图'); await shot('move'); await clearFingers(); }
  await p.evaluate(() => __farm.setMode(null));
  // web: how to rotate / zoom with one or two fingers
  M.gestures = await p.evaluate(() => ({ pinchHandler: !!(window.PFPlatform && PFPlatform.mobile), setZoom: !!(__farm.setZoom), rotateButtons: !!document.querySelector('[data-rot], #rotL, #rotR, .rot') }));
  M.errs = errs; console.log(JSON.stringify(M, null, 1));
  const out = path.join(OUT, 'touch-audit.json'); const all = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {}; all[target] = M; fs.writeFileSync(out, JSON.stringify(all, null, 1));
  await b.close(); server.close(); })().catch(e => { console.error(e); process.exit(1); });
