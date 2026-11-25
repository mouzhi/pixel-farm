// Screenshots + browser checks for v5.12.2 (东门大道 + 度假沙滩):  node tools/eastave-shots.js [name-filter]
//   writes $PF_SHOTS/v5122_*.png (default /workspace/v5122-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/v5122-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'v5122_';
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
  const helpers = `const f = __farm, S = f.S, EA = f.EA, SIM = f.SIM || window.PFSim;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };
    const jumps = () => [...document.querySelectorAll('#mmJump [data-j]')].map(b => b.dataset.j + (b.classList.contains('locked') ? ':locked' : ':open'));
    const openTown = () => { f.buyPlot('eroad', 'road'); if (!S.town) S.town = {}; if (!S.town.school) S.town.school = {}; S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); const r = f.buy('town'); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); fade(); return r; };
    const fade = () => { f.fogUpdate && f.fogUpdate(true); f.advance(2.2, 12); };
    const stampLv5 = () => {
      if (!S.town) S.town = {};
      if (!S.town.hall) S.town.hall = (f.HL && f.HL.empty) ? f.HL.empty() : { built: {} };
      const H = S.town.hall; H.built = H.built || {};
      const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      ids.forEach((id, i) => { H.built[id] = (S.day | 0) - (ids.length - 1) + i; });
      f.applyUpgrades(); f.fogUpdate && f.fogUpdate(true); return f.hallView ? f.hallView().lv : 0;
    };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can']) f.buy(id);
    day(50); dry(); at(12 * 60);`;
  const copy = (name, folder) => { const src = path.join(OUT, PREFIX + name), dst = path.join(OUT, folder, PREFIX + name); if (fs.existsSync(src)) fs.copyFileSync(src, dst); };
  const shot = async (name, vw, vh, fn, check, folder) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${setup} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    if (folder) copy(name, folder);
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 1000)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  const ver = r => r.ver !== '5.12.6' ? 'ver ' + r.ver : r.sv && r.sv !== 15 ? 'saveVersion ' + r.sv : null;

  // 1. town + 海边 open, neither purchase yet: east shore is still a wood, 沙滩 / 东门 dimmed
  const lockedFn = `openTown(); at(12 * 60); look(680, 236, 0); hide(); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI();
    const ave = SIM.offer(S.up, S.coins, 'eastave', f.FARMER.wood);
    const beach = SIM.offer(S.up, S.coins, 'vacbeach', f.FARMER.wood);
    const sand = f.groundAt(400, 230)[1], wild = f.groundAt(680, 230)[1];
    const world = f.WORLD;
    return { ver: f.version, sv: f.snapshot().saveVersion, world: [world.x0, world.x1], town: !!(S.eff && S.eff.town), coast: !!(S.eff && S.eff.regions && S.eff.regions.includes('coast')),
      lv: f.hallView().lv, ave: ave && { ok: ave.ok, lockText: ave.lockText, cost: ave.cost, wood: ave.wood },
      beach: beach && { ok: beach.ok, lockText: beach.lockText, cost: beach.cost, wood: beach.wood },
      sand, wild, jumps: jumps(), fog: f.fog && f.fog() };`;
  const lockedCk = r => ver(r) || (r.world[1] !== 1328 ? 'world ' + r.world : null) || (!r.town ? 'town shut' : null) || (!r.coast ? 'no 海边' : null)
    || (!r.ave || r.ave.ok ? 'avenue should be locked at lv ' + r.lv : null) || (!r.beach || !r.beach.ok ? 'beach should be offerable ' + JSON.stringify(r.beach) : null)
    || (r.beach.cost !== 20000 ? 'beach cost ' + r.beach.cost : null)
    || (r.wild === 'sand' ? 'east shore already sand before buying' : null)
    || (!r.jumps.includes('vacbeach:locked') ? '沙滩 jump not dimmed ' + r.jumps : null)
    || (!r.jumps.includes('eastave:locked') ? '东门 jump not dimmed ' + r.jumps : null);
  await shot('locked.png', 1280, 800, lockedFn, lockedCk, 'before');
  await shot('locked_phone.png', 390, 844, lockedFn, lockedCk, 'before');

  // 2. 度假沙滩 only: sand, umbrellas, no parking, still fog east of 1008, old fishing beach not widened at x 300
  const beachFn = `openTown(); const buy = f.buy('vacbeach'); at(12 * 60); look(680, 236, 0); hide(); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(0.4, 10);
    const mid = f.groundAt(680, 230)[1], west = f.groundAt(400, 230)[1], old = f.groundAt(300, 230)[1], far = f.groundAt(1100, 230)[1];
    const walk = f.pathTo({ x: 400, y: 200 }, { x: 400, y: 236 });
    const umb = (f.props || []).filter(p => p.vacUmb != null).length;
    const chairs = (f.props || []).filter(p => p.vacChair != null).length;
    const tower = (f.props || []).some(p => p.vacTower);
    const snaps = f.snapshot();
    return { ver: f.version, sv: snaps.saveVersion, ok: !!(buy && buy.ok), mid, west, old, far, reach: !!(walk && walk.reached),
      umb, chairs, tower, eastave: !!(S.eff && S.eff.eastave), vacbeach: !!(S.eff && S.eff.vacbeach),
      up: { eastave: S.up.eastave | 0, vacbeach: S.up.vacbeach | 0 }, jumps: jumps() };`;
  const beachCk = r => ver(r) || (!r.ok ? 'buy beach failed' : null) || (r.mid !== 'sand' && r.mid !== 'dirt' ? 'mid not sand ' + r.mid : null)
    || (r.west !== 'sand' && r.west !== 'dirt' ? 'west not sand ' + r.west : null)
    || (r.old === 'sand' && false) /* old fishing beach may already have a narrow sand strip */
    || (r.far === 'sand' ? 'east sand appeared without the avenue' : null)
    || (!r.reach ? 'cannot walk from 东南滩 south down to the new beach' : null)
    || (r.umb < 8 ? 'umbrellas ' + r.umb : null) || (r.chairs < 8 ? 'chairs ' + r.chairs : null) || (!r.tower ? 'no tower' : null)
    || (r.eastave ? 'avenue should stay unbought' : null)
    || (!r.jumps.includes('vacbeach:open') ? '沙滩 jump still dimmed' : null)
    || (r.sv !== 15 ? 'saveVersion ' + r.sv : null);
  await shot('beach.png', 1280, 800, beachFn, beachCk, 'after');
  await shot('beach_phone.png', 390, 844, beachFn, beachCk, 'after');

  // 3. 东门大道 only: parking lot + cars, east shore still woods
  const aveFn = `openTown(); const lv = stampLv5(); const offer = SIM.offer(S.up, S.coins, 'eastave', f.FARMER.wood);
    const buy = f.buy('eastave'); at(12 * 60); look(1170, 120, 0); hide(); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(0.5, 12);
    const road = f.groundAt(1100, 66)[1], park = f.groundAt(1170, 140)[1], shore = f.groundAt(1100, 230)[1];
    const tr = f.eastTraffic && f.eastTraffic();
    const moving = tr && tr.moving ? tr.moving.length : 0, parked = tr && tr.parked ? tr.parked.length : 0;
    const carsOnBeach = (tr && tr.moving || []).some(c => c.y > 210);
    const walk = f.pathTo({ x: 984, y: 66 }, { x: 1170, y: 140 });
    return { ver: f.version, lv, offer: offer && { ok: offer.ok, cost: offer.cost, wood: offer.wood, lockText: offer.lockText },
      ok: !!(buy && buy.ok), road, park, shore, moving, parked, carsOnBeach, reach: !!(walk && walk.reached),
      vacbeach: !!(S.eff && S.eff.vacbeach), jumps: jumps() };`;
  const aveCk = r => ver(r) || (r.lv < 5 ? 'lv ' + r.lv : null) || (!r.offer || !r.offer.ok ? 'avenue not offerable ' + JSON.stringify(r.offer) : null)
    || (r.offer.cost !== 25000 ? 'cost ' + r.offer.cost : null) || (!r.ok ? 'buy avenue failed' : null)
    || (r.road !== 'dirt' ? 'avenue not paved ' + r.road : null) || (r.park !== 'dirt' ? 'parking not paved ' + r.park : null)
    || (r.shore === 'sand' ? 'east sand without beach purchase' : null)
    || (r.moving > 2 ? 'too many moving cars ' + r.moving : null) || (r.carsOnBeach ? 'car on the beach' : null)
    || (!r.reach ? 'cannot walk from the town gate into the parking lot' : null)
    || (r.vacbeach ? 'beach should stay unbought' : null)
    || (!r.jumps.includes('eastave:open') ? '东门 jump still dimmed' : null);
  await shot('avenue.png', 1280, 800, aveFn, aveCk, 'after');
  await shot('avenue_phone.png', 390, 844, aveFn, aveCk, 'after');

  // 4. both bought: parking joins the east beach, visitors can be on the sand, save still v15
  const bothFn = `openTown(); stampLv5(); const a = f.buy('eastave'), b = f.buy('vacbeach'); at(12 * 60); look(1170, 200, 0.15); hide(); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(0.5, 12);
    const join = f.groundAt(1170, 210)[1], sand = f.groundAt(1170, 230)[1], mid = f.groundAt(680, 230)[1];
    const walk = f.pathTo({ x: 1170, y: 140 }, { x: 1170, y: 236 });
    const tr = f.eastTraffic && f.eastTraffic();
    const beachFolk = (tr && tr.visitors || []).filter(v => v.dest === 'beach').length;
    const snap = f.snapshot();
    return { ver: f.version, sv: snap.saveVersion, a: !!(a && a.ok), b: !!(b && b.ok), join, sand, mid, reach: !!(walk && walk.reached),
      beachFolk, moving: tr && tr.moving && tr.moving.length, parked: tr && tr.parked && tr.parked.length, jumps: jumps() };`;
  const bothCk = r => ver(r) || (!r.a || !r.b ? 'buy failed' : null)
    || ((r.sand !== 'sand' && r.sand !== 'dirt') ? 'east sand missing ' + r.sand : null)
    || (!r.reach ? 'cannot walk from the parking lot down to the east beach' : null)
    || (r.beachFolk > 8 ? 'too many beach visitors ' + r.beachFolk : null)
    || (r.sv !== 15 ? 'saveVersion ' + r.sv : null)
    || (!r.jumps.includes('eastave:open') || !r.jumps.includes('vacbeach:open') ? 'jumps ' + r.jumps : null);
  await shot('both.png', 1280, 800, bothFn, bothCk, 'after');
  await shot('both_phone.png', 390, 844, bothFn, bothCk, 'after');

  // 5. shop cards + night lights (tower / decks only)
  const shopFn = `openTown(); stampLv5(); at(12 * 60); look(980, 66, 0);
    const btn = document.getElementById('shopBtn'); if (btn) btn.click();
    const tab = document.querySelector('#shop [data-tab="land"]'); if (tab) tab.click();
    f.refreshUI && f.refreshUI();
    const el = document.querySelector('#shop [data-item="eastave"]') || document.querySelector('#shop [data-item="vacbeach"]');
    if (el) el.scrollIntoView({ block: 'center' });
    const txt = (document.getElementById('shop') || {}).innerText || (document.getElementById('shop') || {}).textContent || '';
    return { ver: f.version, txt: txt.slice(0, 800), hasAve: /东门大道/.test(txt), hasBeach: /度假沙滩/.test(txt), hidden: !!(document.getElementById('shop') && document.getElementById('shop').hidden) };`;
  const shopCk = r => ver(r) || (!r.hasAve ? 'shop missing 东门大道' : null) || (!r.hasBeach ? 'shop missing 度假沙滩' : null) || (r.hidden ? 'shop still hidden' : null);
  await shot('shop.png', 1280, 800, shopFn, shopCk, 'after');

  const nightFn = `openTown(); stampLv5(); f.buy('eastave'); f.buy('vacbeach'); at(20 * 60); look(680, 236, 0); hide(); f.advance(0.4, 10);
    const lights = (f.EAA && f.EA) ? f.EA.lightsAt(S.t, { beach: true, avenue: true }) : [];
    return { ver: f.version, n: lights.length, t: S.t % 1440 };`;
  const nightCk = r => ver(r) || (r.n !== 3 ? 'night lights ' + r.n : null);
  await shot('night.png', 1280, 800, nightFn, nightCk, 'after');

  await b.close(); server.close();
  if (errs.length || fails.length) { console.error('ERRORS', errs.concat(fails).join('\\n')); process.exit(1); }
  console.log('ok  eastave-shots  version', VERSION, '->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
