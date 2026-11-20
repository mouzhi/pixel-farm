// PROTOTYPE shots for docs/mobile-touch-plan.md: injects touch.js into the packed xhs build (390×844 phone) and writes /workspace/pf-shots/touch_*.png
//   node tools/touch-mock-shots.js   (PF_XHS_DIST=<packed dist>, default /workspace/pf-touch-xhs/platforms/xhs/dist)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots', DIST = process.env.PF_XHS_DIST || '/workspace/pf-touch-xhs/platforms/xhs/dist';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const FIX = (s => s.save || s)(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'), 'utf8')));
const seed = { 'mouzhi/pixel-farm:save': JSON.stringify(Object.assign({}, FIX, { savedAt: Date.now() })) };
const MOCK = `(() => { const mem = ${JSON.stringify(seed)}; const ok = v => Promise.resolve(v);
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: { getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); }, removeStorage: a => ok({}),
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }), getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }),
    submitScore: () => ok({}), getRankList: () => ok({ data: [] }), getMyRank: () => ok({}), getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({}), share: () => ok({}) } }; })();`;
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  async function page() { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) Mobile/15E148 discover/9.53.3 XHS' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); await p.addInitScript(MOCK); await p.goto(base + '/index.html');
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && document.getElementById('xhs-bar'), null, { timeout: 30000 }); await p.waitForTimeout(1000);
    await p.evaluate(() => { const f = __farm, S = f.S; const o = document.getElementById('offline'); if (o) o.hidden = true; f.SAVE.off = true; S.coins = 900000; f.FARMER.wood = 3000; if (!S.eff.axe) f.buy('axe');
      f.FARMER.saplings.apple = 3; f.FARMER.saplings.orange = 2; S.decor.inv.bench = 1; S.decor.inv.flowerpot = 2; f.FARMER.crops.push('koi'); S.t = Math.floor(S.t / 1440) * 1440 + 600; PFPlatform.followFarmer = false; f.setAngle(0); });
    await p.addScriptTag({ path: path.resolve(__dirname, '..', 'touch.js') }); await p.waitForTimeout(1500); return p; }
  const shot = async (p, n) => { await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, n) }); console.log('wrote', n); };
  // 1. ⚒ toolbox open: every tool as a big tile, the clear buttons below
  { const p = await page(); await p.evaluate(() => __farm.panTo(__farm.HOUSE.x + 30, __farm.HOUSE.y + 60)); await shot(p, 'touch_box_button.png'); await p.evaluate(() => document.getElementById('pt-box').click()); await shot(p, 'touch_toolbox.png'); await p.context().close(); }
  // 2. 摆长椅: crosshair fixed on screen, the green box under it, the bottom bar with ✖ / ✔ (the bottom icons step aside)
  { const p = await page(); const r = await p.evaluate(() => { const f = __farm; document.querySelector('#tools [data-m="decor"][data-k="bench"]').click();
      const R = PFTouch.RET(); // pan so a free grass spot sits under the crosshair
      for (let rr = 0; rr < 60; rr += 3) for (let a = 0; a < 16; a++) { const x = f.HOUSE.x + 34 + rr * Math.cos(a * Math.PI / 8), y = f.HOUSE.y + 40 + rr * Math.sin(a * Math.PI / 8); if (f.placeOk(x, y, 'decor', 'bench', null).ok) { f.panTo(x, y); const c = f.toClient(x, y); f.panScreen && 0; return { x, y, c, R }; } } return null; });
    // nudge so the found spot is exactly under the crosshair
    await p.evaluate(r => { const f = __farm; for (let i = 0; i < 6; i++) { const c = f.toClient(r.x, r.y), c1 = (f.panScreen(8, 0), f.toClient(r.x, r.y)), k = (c1.x - c.x) / 8; f.panScreen((r.R.x - c1.x) / k, (r.R.y - c1.y) / k); } }, r);
    await shot(p, 'touch_place_reticle.png');
    // 2b. same, crosshair over the path: red box, ✔ explains why
    await p.evaluate(() => { __farm.panScreen(0, -40); }); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('#pt-bar .ok').click()); await shot(p, 'touch_place_invalid.png'); await p.context().close(); }
  // 3. 挪东西: the picked house with floating 移动 / 收回 / ✖ buttons (long-press also gets here)
  { const p = await page(); await p.evaluate(() => { const f = __farm, m = f.movables()[0]; f.panTo(m.x, m.y + 30); document.querySelector('#tools [data-m="move"]').click(); });
    await p.evaluate(() => { const f = __farm, m = f.movables()[0], c = f.toClient(m.x, m.y), cv = document.querySelector('#wrap canvas') || document.querySelector('canvas');
      const fire = t => cv.dispatchEvent(new PointerEvent(t, { clientX: c.x, clientY: c.y, bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse' })); fire('pointerdown'); fire('pointerup'); });
    await shot(p, 'touch_select_float.png'); await p.context().close(); }
  console.log('errors', errs); await b.close(); server.close(); })();
