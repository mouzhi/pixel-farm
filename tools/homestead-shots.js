// Screenshots + browser checks for v5.12.1 (宅园·度假村北):  node tools/homestead-shots.js [name-filter]
//   writes $PF_SHOTS/v5121_*.png (default /workspace/v5121-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/v5121-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'v5121_';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'before'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'after'), { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, PL = f.PL, HM = f.HM;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can']) f.buy(id);
    day(50); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 30 }] }); f.syncFamily(); dry(); at(10 * 60);`;
  const copy = (name, folder) => { const src = path.join(OUT, PREFIX + name), dst = path.join(OUT, folder, PREFIX + name); if (fs.existsSync(src)) fs.copyFileSync(src, dst); };
  const shot = async (name, vw, vh, fn, check, folder) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${setup} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    if (folder) copy(name, folder);
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  const ver = r => r.ver !== '5.12.4' ? 'ver ' + r.ver : r.sv && r.sv !== 15 ? 'saveVersion ' + r.sv : null;

  // 1. locked lot (before), desktop + phone
  const lockedFn = `look(280, 162, 0); hide();
    const p = PL.plot('nhome'), offer = f.plotOffer('nhome', 'homestead');
    const g = f.groundAt(280, 163);
    return { ver: f.version, owned: !!S.plots.nhome, offer: offer && { ok: offer.ok, reason: offer.reason, cost: offer.cost, wood: offer.wood, mod: offer.mod },
      rect: p && p.rect, mods: p && p.mods, ground: g && g[1], east: !!(S.eff && S.eff.regions && S.eff.regions.includes('east')),
      coast: !!(S.eff && S.eff.regions && S.eff.regions.includes('coast')) };`;
  const lockedCk = r => ver(r) || (r.owned ? 'already bought' : null) || (!r.offer || !r.offer.ok ? 'not offerable ' + JSON.stringify(r.offer) : null) ||
    (r.offer.cost !== 4800 ? 'cost ' + r.offer.cost : null) || (r.offer.mod !== 'homestead' ? 'mod' : null) ||
    (JSON.stringify(r.rect) !== '[220,124,340,200]' ? 'rect ' + r.rect : null) || (r.mods.join() !== 'homestead' ? 'mods' : null) ||
    (r.ground !== 'wild' ? 'locked ground ' + r.ground : null);
  await shot('locked.png', 1280, 800, lockedFn, lockedCk, 'before');
  await shot('locked_phone.png', 390, 844, lockedFn, lockedCk, 'before');

  // 2. bought lot with 4 pads and the middle road (after)
  const boughtFn = `const buy = f.buyPlot('nhome', 'homestead');
    look(280, 162, 0); hide();
    const pads = (PL.HOME_PADS || []).map(pad => ({ id: pad.id, g: f.groundAt(pad.x, pad.y)[1] }));
    const road = f.groundAt(280, 163)[1], path = f.groundAt(280, 206)[1];
    const reachPad = f.pathTo({ x: 352, y: 150 }, { x: 258, y: 152 });
    const reachBeach = f.pathTo({ x: 280, y: 163 }, { x: 280, y: 220 });
    const zone = f.rezoneOffer('nhome', 'field');
    return { ver: f.version, ok: buy && buy.ok, cost: buy && buy.cost, mod: S.plots.nhome && S.plots.nhome.mod, pads, road, path,
      reachPad: !!(reachPad && reachPad.reached), padLen: reachPad && +reachPad.length.toFixed(1),
      reachBeach: !!(reachBeach && reachBeach.reached), beachLen: reachBeach && +reachBeach.length.toFixed(1),
      zone: zone && { ok: zone.ok, reason: zone.reason } };`;
  const boughtCk = r => ver(r) || (!r.ok ? 'buy failed' : null) || (r.mod !== 'homestead' ? 'mod ' + r.mod : null) ||
    (r.pads.length !== 4 ? 'pads ' + r.pads.length : null) || (r.road !== 'dirt' ? 'middle road ' + r.road : null) ||
    (r.path !== 'dirt' ? 'south path ' + r.path : null) || (!r.reachPad ? 'cannot walk from the east road to a pad door' : null) ||
    (!r.reachBeach ? 'cannot walk down to 海边' : null) || (r.zone && r.zone.reason !== 'fixed' ? 'rezone ' + JSON.stringify(r.zone) : null);
  await shot('bought.png', 1280, 800, boughtFn, boughtCk, 'after');
  await shot('bought_phone.png', 390, 844, boughtFn, boughtCk, 'after');

  // 3. existing gen-2 houses stay on 林间空地 / 东南滩 after the new lot is bought
  const oldFn = `f.buyPlot('glade', 'meadow'); f.buyPlot('eshore', 'field');
    const c1 = f.buy('cottage'); const h0 = S.home.houses[0]; if (h0) { h0.built = S.day - 1; h0._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); }
    const c2 = f.buy('cottage'); const h1 = S.home.houses[1]; if (h1) { h1.built = S.day - 1; h1._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); }
    const sitesBefore = S.home.houses.map(h => h.site).slice();
    const buy = f.buyPlot('nhome', 'homestead');
    const sitesAfter = S.home.houses.map(h => h.site);
    look(h0 ? h0.x : -68, h0 ? h0.y : 160, 0.3); hide();
    return { ver: f.version, c1: !!(c1 && c1.ok), c2: !!(c2 && c2.ok), buy: !!(buy && buy.ok), sitesBefore, sitesAfter, n: S.home.houses.length };`;
  const oldCk = r => ver(r) || (!r.c1 || !r.c2 ? 'cottages not bought' : null) || (!r.buy ? '宅园 not bought' : null) ||
    (r.n !== 2 ? 'houses ' + r.n : null) || (r.sitesAfter.join() !== r.sitesBefore.join() ? 'houses moved on buy: ' + r.sitesAfter : null) ||
    (r.sitesAfter.some(id => /^nhome/.test(id)) ? 'a house jumped onto a pad' : null);
  await shot('oldhouses.png', 1280, 800, oldFn, oldCk, 'after');

  // 4. move one of the two onto a pad; the other stays
  const moveFn = `f.buyPlot('glade', 'meadow'); f.buyPlot('eshore', 'field');
    const c1 = f.buy('cottage'); const h0 = S.home.houses[0]; if (h0) { h0.built = S.day - 1; h0._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); }
    const c2 = f.buy('cottage'); const h1 = S.home.houses[1]; if (h1) { h1.built = S.day - 1; h1._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); }
    const buy = f.buyPlot('nhome', 'homestead');
    const staySite = h1 && h1.site, stayAt = h1 && [h1.x, h1.y];
    const r = f.homeMoveTo(258, 142, 0);
    const snap = f.snapshot();
    const back = (window.PFSave || f.SAVE).validate(JSON.parse(JSON.stringify(snap)));
    look(258, 155, 0); hide();
    const door = HM.layout(S.home.houses[0]).door;
    const reach = f.pathTo({ x: 352, y: 150 }, door);
    return { ver: f.version, sv: snap.saveVersion, moved: r && r.ok && (r.site || (r.spot && r.spot.site)), at: h0 && [h0.x, h0.y, h0.m],
      stay: h1 && h1.site, stayAt, staySame: h1 && h1.site === staySite && h1.x === stayAt[0] && h1.y === stayAt[1],
      reloadSites: back.home.houses.map(h => h.site), reach: !!(reach && reach.reached), n: S.home.houses.length };`;
  const moveCk = r => ver(r) || (r.moved !== 'nhome0' ? 'moved to ' + r.moved : null) || (!r.staySame ? 'the other house moved' : null) ||
    (r.n !== 2 ? 'houses ' + r.n : null) || (r.reloadSites.join() !== [r.moved, r.stay].join() && r.reloadSites.join() !== [r.stay, r.moved].join() ? 'reload sites ' + r.reloadSites : null) ||
    (!r.reach ? 'door not reachable after the move' : null);
  await shot('moved.png', 1280, 800, moveFn, moveCk, 'after');
  await shot('moved_phone.png', 390, 844, moveFn, moveCk, 'after');

  // 5. shop detail: 宅地 only, cannot rezone
  const shopFn = `const buy = f.buyPlot('nhome', 'homestead');
    f.refreshUI(); f.openPlot('nhome'); f.refreshUI();
    const shop = (document.getElementById('shop') || {}).textContent || '';
    look(280, 162, 0);
    return { ver: f.version, ok: !!(buy && buy.ok), shop: shop.replace(/\\s+/g, ' ').slice(0, 400),
      hasHomestead: /宅地/.test(shop), noField: !/改成农田/.test(shop), only: /不能改成农田或花甸|只有一种用途/.test(shop) };`;
  const shopCk = r => ver(r) || (!r.ok ? 'buy failed' : null) || (!r.hasHomestead ? 'shop missing 宅地: ' + r.shop : null) ||
    (r.rezoneBtn ? 'shop offers 农田 rezone' : null) || (!r.only ? 'shop missing the fixed-use note: ' + r.shop : null);
  await shot('shop.png', 1280, 800, shopFn, shopCk, 'after');

  // 6. south path close-up, desktop
  const southFn = `const buy = f.buyPlot('nhome', 'homestead');
    look(280, 206, 0); hide();
    const reach = f.pathTo({ x: 280, y: 163 }, { x: 220, y: 220 });
    return { ver: f.version, ok: !!(buy && buy.ok), path: f.groundAt(280, 206)[1], reach: !!(reach && reach.reached) };`;
  const southCk = r => ver(r) || (!r.ok ? 'buy failed' : null) || (r.path !== 'dirt' ? 'path ' + r.path : null) || (!r.reach ? 'no walk to 海边' : null);
  await shot('south.png', 1280, 800, southFn, southCk, 'after');

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
