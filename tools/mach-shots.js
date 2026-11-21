// Screenshots + browser checks for v5.11.1 自动化机械 (auto feeder + waterer, egg chute, milker, honey tray):  node tools/mach-shots.js [name-filter]
//   writes /workspace/pf-shots/mach_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page() { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; }); return p; }
  // a farm with every prerequisite: both coops and sheds full, the cheese house, a turning wheel, six hives on a 花甸, the smithy in town
  const setup = `const f = __farm, S = f.S; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','sty','fold','shed','can','can','can','can']) f.buy(id);
    f.buyPlot('sbank', 'dam'); f.buyPlot('glade', 'meadow'); f.buyPlot('eslope', 'pasture'); f.buyPlot('wbank', 'workshop');
    for (const id of ['coop2', 'shed2', 'wheel']) f.buy(id); for (let i = 0; i < 6; i++) f.buy('hive');
    for (let i = 0; i < 8; i++) f.buy('chicken'); for (let i = 0; i < 4; i++) f.buy('cow'); f.buy('pig'); f.buy('sheep'); f.buy('cheese');
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; }; const dry = () => { if (S.weather) S.weather.rained = false; };
    const smithy = () => { S.town.hall.built.smithy = S.day; f.applyUpgrades(); };
    const nextMorning = () => { const d = S.day; for (let i = 0; i < 4000 && !(S.day > d && S.t % 1440 >= 6 * 60 + 30); i++) f.advance(1, 10); };
    const d0 = S.day, recent = re => S.events.filter(e => e.day >= d0 && re.test(e.msg));`;
  const closeup = `async (x, y, W = 150, H = 96, K = 4) => { const f = __farm; f.setAngle(0); f.panTo(x, y); for (let i = 0; i < 20; i++) f.advance(0.05, 1); f.render();
    const [sx, sy] = f.proj(x, y), cv = document.getElementById('game'), img = new Image(); await new Promise(r => { img.onload = r; img.src = cv.toDataURL(); });
    const c = document.createElement('canvas'); c.width = W * K; c.height = H * K; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.round(sx - W / 2), Math.round(sy - H * 0.62), W, H, 0, 0, W * K, H * K); return c.toDataURL(); }`;
  const shot = async (name, fn, check, after) => { if (only && !name.includes(only)) return;
    const p = await page(); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    if (after && !r.error) try { await after(p, r); } catch (e) { r.error = String(e).slice(0, 300); }
    await p.waitForTimeout(300); if (r && r.png) fs.writeFileSync(path.join(OUT, name), Buffer.from(r.png.split(',')[1], 'base64')); else await p.screenshot({ path: path.join(OUT, name) });
    if (r) delete r.png; const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. gates and the feeder set: locked until the wheel turns and the smithy stands; the set fits every pen; troughs stay full; no feed jobs left
  await shot('mach_feeder.png', `(async () => { ${setup} at(9 * 60); dry();
    const lock0 = f.buy('feeder'), c0 = S.coins; smithy(); const set = f.buy('feedset'), paid = c0 - S.coins;
    const pens = S.works.mach && S.works.mach.f, full = f.PW.MACH_PENS.filter(k => f.PW.fitted(S.works.mach, k)).length;
    for (const k of Object.keys(S.troughs)) { S.troughs[k].feed = 0; S.troughs[k].water = 0; } f.advance(0.1, 1);
    const jobs = f.board().map(j => j.kind).filter(k => k === 'feed' || k === 'trough' || k === 'refill').length;
    nextMorning(); const tr = Object.entries(S.troughs).filter(([k]) => f.PW.fitted(S.works.mach, k) && window.PFAnimals.penNeed(S.animals, k) > 0).map(([k, t]) => t.water && t.feed >= window.PFAnimals.penNeed(S.animals, k));
    const hungry = recent(/没吃饱/).length, hay = recent(/干草铺一早送来/).length;
    S.autoBuy = true; const pick = window.PFSim.autoPick(Object.assign({}, S.up, { feeder: 0, chute: 0, milker: 0, tray: 0 }), 1e7, 999, [1e6], () => true);
    const P = window.PFWorld.PENS.coop.trough; at(10 * 60); const png = await (${closeup})(P.x, P.y - 2);
    return { lock: lock0.why, set: set.ok, paid, pens, full, jobs, trough: tr, hungry, hay, auto: pick.id, up: S.up.feeder, png }; })()`,
    r => !/水车|铁匠铺/.test(r.lock || '') ? 'feeder not locked behind the wheel/smithy: ' + r.lock : !r.set || r.paid !== 12000 ? 'set ' + r.paid
      : r.full < 6 ? 'pens fitted ' + r.full : r.jobs ? r.jobs + ' feed/water jobs still posted' : !r.trough.length || r.trough.some(x => !x) ? 'trough not full ' + r.trough
      : r.hungry ? 'animals went hungry' : ['feeder', 'feedset', 'chute', 'milker', 'tray'].includes(r.auto) ? 'autobuy picked a machine' : null);
  // 2. the egg chute: eggs roll into the crate and go straight into the storehouse bin; nobody is sent to the coop
  await shot('mach_chute.png', `(async () => { ${setup} at(9 * 60); dry(); const r = f.buy('chute'); nextMorning(); const eggsWaiting = S.animals.filter(a => a.kind === 'chicken').reduce((n, a) => n + a.ready, 0);
    const bin = f.PW.binHas(S.works.mach, 'egg'), jobs = f.board().filter(j => j.kind === 'collect').length, logged = recent(/个鸡蛋收进了仓库|鸡蛋.*收进了仓库/).length;
    const P = window.PFWorld.PENS.coop.bld; at(11 * 60); const png = await (${closeup})(P.x + 6, P.y + 2);
    return { ok: r.ok, bin, eggsWaiting, jobs, logged, codex: !!S.codex.entries['mach:chute'], png }; })()`,
    r => !r.ok ? 'buy' : !(r.bin > 0) ? 'no eggs in the bin' : r.eggsWaiting ? r.eggsWaiting + ' eggs left on the chickens' : !r.logged ? 'no log line' : !r.codex ? 'no codex entry' : null);
  // 3. the milker: milk fills the cheese house first, the rest goes to the storehouse; the cows are never milked by hand
  await shot('mach_milker.png', `(async () => { ${setup} at(9 * 60); dry(); const c0 = S.coins, r = f.buy('milker'), paid = c0 - S.coins; const ch = S.works.works.cheese; if (!ch) return { error: 'no cheese house' }; ch.inp = 0;
    nextMorning(); const cowsReady = S.animals.filter(a => a.kind === 'cow').reduce((n, a) => n + a.ready, 0);
    const cheese = ch.inp + (ch.out || 0) * 2 + (ch.left > 0 ? 2 : 0), bin = f.PW.binHas(S.works.mach, 'milk');
    const P = window.PFWorld.PENS.shed.bld; at(11 * 60); const png = await (${closeup})(P.x - 8, P.y + 2);
    return { ok: r.ok, paid, cowsReady, cheese, bin, png }; })()`,
    r => !r.ok || r.paid !== 6000 ? 'buy ' + r.paid : r.cowsReady ? 'cows still waiting to be milked' : !(r.cheese > 0) ? 'the cheese house got no milk' : null);
  // 4. the honey tray: six hives drain into the barrel; no hive caps at 2; the bin feeds an order; the night cart ships the extra
  await shot('mach_tray.png', `(async () => { ${setup} at(9 * 60); dry(); for (const h of S.works.hives) h.ready = 2; const r = f.buy('tray');
    const now = f.PW.binHas(S.works.mach, 'honey'), left = S.works.hives.reduce((n, h) => n + h.ready, 0); const counts = f.bakeryCounts().honey | 0;
    S.works.mach.hn = 20; const c0 = S.earned; nextMorning(); const shipped = recent(/收货车拉走了/).length, earned = S.earned - c0;
    const sp = f.PWA.machSpots().find(q => q.kind === 'vat'); at(11 * 60); const png = await (${closeup})(sp.x, sp.y);
    return { ok: r.ok, now, left, counts, shipped, keep: f.PW.binHas(S.works.mach, 'honey'), png }; })()`,
    r => !r.ok ? 'buy' : r.now !== 12 || r.left ? 'hives did not drain ' + r.now + '/' + r.left : r.counts < 12 ? 'bakery does not see the bin' : !r.shipped ? 'no produce cart' : null);
  // 5. the shop's 工坊 tab (machines with prices, locks and icons) and the codex 机械 page
  await shot('mach_shop.png', `(() => { ${setup} smithy(); f.buy('feeder'); f.buy('chute'); localStorage.setItem('mouzhi/pixel-farm:shop-tab', 'works'); return {}; })()`,
    r => (r.cards || 0) < 5 ? 'machine cards ' + r.cards : null,
    async (p, r) => { await p.keyboard.press('b'); await p.waitForTimeout(300); await p.evaluate(() => { const t = document.querySelector('#shop [data-tab="works"]'); if (t) t.click(); }); await p.waitForTimeout(300);
      const q = await p.evaluate(() => { const ids = ['feeder', 'feedset', 'chute', 'milker', 'tray']; const el = document.querySelector('#shop [data-item="tray"]'); if (el) el.scrollIntoView({ block: 'center' });
        return { cards: ids.filter(id => document.querySelector('#shop [data-item="' + id + '"]')).length, icons: ids.filter(id => { const i = document.querySelector('#shop [data-item="' + id + '"] i'); return i && /data:image\/png/.test(i.getAttribute('style') || ''); }).length }; });
      Object.assign(r, q); if (r.icons < 5) r.error = 'icons ' + r.icons; });
  await shot('mach_codex.png', `(() => { ${setup} smithy(); f.buy('feedset'); f.buy('tray'); return {}; })()`,
    r => r.seen !== 2 || r.cells !== 4 ? 'codex 机械 ' + r.seen + '/' + r.cells : null,
    async (p, r) => { await p.keyboard.press('j'); await p.waitForTimeout(300);
      Object.assign(r, await p.evaluate(() => { const c = [...document.querySelectorAll('#codex [data-key^="mach:"], #codex [data-lock^="mach:"]')]; if (c[0]) c[0].scrollIntoView({ block: 'center' });
        return { cells: c.length, seen: c.filter(e => e.dataset.key).length }; })); });
  // 6. the save: one small works.mach field, no machine keys under upgrades; a reload brings the shop levels back
  if (!only || 'mach_save'.includes(only)) { const p = await page(); let r;
    try { const st = await p.evaluate(`(() => { ${setup} smithy(); f.buy('feedset'); f.buy('chute'); f.buy('milker'); f.buy('tray'); nextMorning(); return f.snapshot(); })()`);
      r = { mach: st.works.mach, upKeys: ['feeder', 'feedset', 'chute', 'milker', 'tray'].filter(k => k in st.upgrades), bytes: JSON.stringify(st.works.mach).length };
      await p.evaluate(s => { localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, st); await p.reload();
      await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 30000 });
      Object.assign(r, await p.evaluate(() => ({ up: ['feeder', 'feedset', 'chute', 'milker', 'tray'].map(k => __farm.S.up[k]), props: __farm.PWA.own.mach.length }))); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    const bad = r.error || (!r.mach || !r.mach.f ? 'no works.mach' : r.upKeys.length ? 'machine keys in upgrades ' + r.upKeys : r.bytes > 60 ? 'works.mach is ' + r.bytes + ' bytes' : r.up.join() !== '8,1,1,1,1' && r.up[0] < 6 ? 'levels after reload ' + r.up : !(r.props > 6) ? 'machine props after reload ' + r.props : null);
    console.log(bad ? 'FAIL' : 'ok  ', 'mach_save', JSON.stringify(r)); if (bad) fails.push('mach_save: ' + bad); await p.context().close(); }

  await b.close(); server.close();
  const real = errs.filter(e => !/favicon|net::ERR/.test(e));
  if (real.length) { console.log('page errors:', real.slice(0, 8)); process.exit(1); }
  if (fails.length) { console.log('FAILED:', fails); process.exit(1); }
  console.log('mach-shots: all ok');
})();
