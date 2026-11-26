// Screenshots + browser checks for v5.13.0 扩建 (小豆家 / 小米家 grow like the farmhouse):  node tools/kidhouse-shots.js [name-filter]
//   writes $PF_SHOTS/kh_*.png (default /workspace/pf-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (a fresh farm built up in the page, and the repo's synthetic fixture); never a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [], net = [];
  async function page(vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('request', rq => { if (!rq.url().startsWith(base) && !rq.url().startsWith('data:')) net.push(rq.url()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  // a farm well along (day 70): the farmhouse grown to `main`, 宅园 bought, two new houses on its north pads, both children married and moved in
  const setup = main => `const f = __farm, S = f.S, HM = f.HM; f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 3000;
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; }, at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const look = (x, y, a) => { f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { f.advance(6, 10); for (const id of ['leftBottom', 'title']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
      for (const el of document.querySelectorAll('body div')) if (!el.children.length && /^(成就：|📷)/.test(el.textContent.trim())) el.style.visibility = 'hidden'; };
    for (let i = 0; i < ${main}; i++) f.buy('house');
    for (const id of ['axe','forest','east','orchard','south','pasture','coast','can','can']) f.buy(id);
    day(70); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 30 }] }); f.syncFamily();
    f.buyPlot('nhome', 'homestead'); f.buy('cottage'); f.buy('cottage');
    S.home.houses.forEach(h => { h.built = S.day - 1; h._tiles = null; }); f.homeTilesSync(); f.HA.sync(true);
    const marry = (k, mate, i) => { S.home.wed[k] = { mate, day: S.day - 1, moved: 0, house: i }; f.homeMoveIn(k); };
    const tiers = () => S.home.houses.map(h => [h.site, h.kid, h.lv | 0]);
    const reachDoors = () => S.home.houses.map(h => { const L = HM.layout(h), r = f.pathTo({ x: 340, y: 162 }, { x: L.door.x, y: L.door.y + 1 }); return !!(r && r.reached); });
    const walled = () => S.home.houses.map(h => HM.layout(h).block).filter(bk => [f.FARMER, ...S.members, ...f.SPOUSES].some(a => a.x > bk[0] && a.x < bk[2] && a.y > bk[1] && a.y < bk[3])).length;`;
  const shot = async (name, vw, vh, fn, check, clip) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name + '.png') });
    if (clip) await p.screenshot({ path: path.join(OUT, name + '_close.png'), clip });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const PADS_CLIP = { x: 400, y: 150, width: 480, height: 440 }, MAIN_CLIP = { x: 330, y: 150, width: 620, height: 440 };
  const buyN = (a, b) => `for (let i = 0; i < ${a}; i++) f.buy('kidhouse0'); for (let i = 0; i < ${b}; i++) f.buy('kidhouse1');`;
  const ver = r => r.ver !== '5.13.0' ? 'ver ' + r.ver : null;

  // 1. the farmhouse (庄园) at the same zoom and angle, for the side-by-side
  await shot('kh_main', 1280, 800, `${setup(3)} marry('kid0', 'm1', 0); marry('kid1', 'm0', 1); at(10 * 60); look(f.NAV.LAYOUT.HOUSE.x, f.NAV.LAYOUT.HOUSE.y + 6, 0); hide();
    return { ver: f.version, main: S.eff.house };`, r => ver(r) || (r.main !== 3 ? 'main ' + r.main : null), MAIN_CLIP);
  // 2–4. each tier, both houses side by side on the 宅园 north pads: the walls go up and back, the door, tiles and hen house stay
  for (const t of [0, 1, 2]) await shot('kh_tier' + t, 1280, 800, `${setup(3)} marry('kid0', 'm1', 0); marry('kid1', 'm0', 1);
    const before = S.home.houses.map(h => HM.layout(h)); const coins0 = S.coins;
    const buys = []; for (let i = 0; i < ${t}; i++) { buys.push(f.buy('kidhouse0').ok, f.buy('kidhouse1').ok); }
    const after = S.home.houses.map(h => HM.layout(h));
    const still = after.every((L, i) => JSON.stringify([L.door, L.tiles, L.coop]) === JSON.stringify([before[i].door, before[i].tiles, before[i].coop]));
    f.advance(2, 10); at(10 * 60); look(280, 150, 0); hide();
    return { ver: f.version, buys, tiers: tiers(), still, spent: coins0 - S.coins, doors: reachDoors(), walled: walled(), key: f.HA.state().key, blocks: after.map(L => L.block) };`,
    r => ver(r) || (r.buys.some(x => !x) ? 'a buy failed' : null) ||
      (r.tiers.map(x => x[2]).join() !== [t, t].join() ? 'tiers ' + JSON.stringify(r.tiers) : null) || (!r.still ? 'door / tiles / coop moved' : null) ||
      (r.spent !== [0, 12000, 36000][t] ? 'spent ' + r.spent : null) || (r.doors.some(x => !x) ? 'a door unreachable' : null) || (r.walled ? 'someone inside the walls' : null), PADS_CLIP);
  // 5. evening at the top tier: both floors lit, smoke from the taller chimney
  await shot('kh_tier2_night', 1280, 800, `${setup(3)} marry('kid0', 'm1', 0); marry('kid1', 'm0', 1); ${buyN(2, 1)}
    for (let i = 0; i < 900 && (S.t % 1440) < 20 * 60; i++) f.advance(1, 10); look(280, 150, 0); hide();
    return { ver: f.version, tiers: tiers(), smoke: f.HA.smoke().map(s => +s.z.toFixed(1)) };`,
    r => ver(r) || (r.tiers.map(x => x[2]).join() !== '2,1' ? 'tiers' : null) || (!(r.smoke[0] > r.smoke[1]) ? 'the bigger house should smoke higher ' + r.smoke : null), PADS_CLIP);
  // 6. the shop (建筑): 小豆家 offers 两层小楼; 小米家 waits for the farmhouse (二层农舍 here) — desktop and phone
  for (const [w, h] of [[1280, 800], [390, 844]]) await shot('kh_shop_' + w, w, h, `${setup(2)} marry('kid0', 'm1', 0); marry('kid1', 'm0', 1); f.buy('kidhouse0');
    document.getElementById('shopBtn').click(); const tb = document.querySelector('#shop [data-tab="build"]'); if (tb) tb.click(); f.refreshUI();
    const c0 = document.querySelector('#shop [data-item="kidhouse0"]'), c1 = document.querySelector('#shop [data-item="kidhouse1"]');
    if (c0) c0.scrollIntoView({ block: 'center' });
    const txt = e => e ? e.textContent.replace(/\\s+/g, ' ').trim() : null;
    return { ver: f.version, tiers: tiers(), main: S.eff.house, c0: txt(c0), c1: txt(c1), b0: c0 && !c0.querySelector('[data-buy]').disabled, b1: c1 && !c1.querySelector('[data-buy]').disabled };`,
    r => ver(r) || (!r.c0 || !r.c1 ? 'cards missing' : null) || (!/阁楼木屋/.test(r.c0) || !/两层小楼/.test(r.c0) ? 'c0 ' + r.c0 : null) || (!/主屋先扩建成庄园/.test(r.c0) ? 'c0 lock ' + r.c0 : null) ||
      (!/木屋/.test(r.c1) || !r.b1 ? 'c1 should be buyable at 二层农舍: ' + r.c1 : null));
  // 7. gates in the page: before moving in; then the shop refuses past the farmhouse; nothing is ever bought on its own
  await shot('kh_gates', 1280, 800, `${setup(1)} const g = [];
    g.push(f.buy('kidhouse0')); marry('kid0', 'm1', 0); g.push(f.buy('kidhouse0')); S.up.house = 2; f.applyUpgrades(); g.push(f.buy('kidhouse0')); g.push(f.buy('kidhouse0'));
    f.setAutoBuy && f.setAutoBuy(true); for (let i = 0; i < 3; i++) { day(S.day + 1); f.advance(20, 10); }
    look(280, 150, 0); hide();
    return { ver: f.version, g: g.map(x => [x.ok, x.reason, x.why || null]), up: [S.up.kidhouse0 | 0, S.up.kidhouse1 | 0] };`,
    r => ver(r) || (r.g[0][0] || !/成家/.test(r.g[0][2] || '') ? 'before marriage ' + JSON.stringify(r.g[0]) : null) || (r.g[1][0] || !/二层农舍/.test(r.g[1][2] || '') ? 'main gate ' + JSON.stringify(r.g[1]) : null) ||
      (!r.g[2][0] ? 'tier 1 ' + JSON.stringify(r.g[2]) : null) || (r.g[3][0] || !/庄园/.test(r.g[3][2] || '') ? 'tier 2 gate ' + JSON.stringify(r.g[3]) : null) || (r.up.join() !== '1,0' ? 'auto-bought? ' + r.up : null));
  // 8. the synthetic v15 fixture (a v5.9.0 house on 林间空地, 小豆 moved in): loads as 木屋, upgrades in place or says why, saves and reloads the tier
  if (!only || 'kh_v15save'.includes(only)) {
    const save = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'), 'utf8'));
    const p = await page();
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, S = f.S, HM = f.HM, h = S.home.houses[0]; const lv0 = h.lv | 0, up0 = S.up.kidhouse0 | 0;
      S.coins = 900000; f.FARMER.wood = 3000; S.up.house = 3; f.applyUpgrades(); const b1 = f.buy('kidhouse0'); const lv1 = h.lv | 0;
      const snap = f.snapshot(); const L = HM.layout(h); const rr = f.pathTo(f.NAV.LAYOUT.DOOR, { x: L.door.x, y: L.door.y + 1 });
      f.setAngle(0.35); f.panTo(h.x, h.y + 8); f.advance(0.3, 10);
      return { ver: f.version, sv: snap.saveVersion, lv0, up0, b1: [b1.ok, b1.why || null], lv1, saved: snap.upgrades.kidhouse0, savedHouse: 'lv' in snap.home.houses[0], door: !!(rr && rr.reached), size: JSON.stringify(snap).length }; });
    await p.screenshot({ path: path.join(OUT, 'kh_v15save.png') });
    const bad = r.ver !== '5.13.0' ? 'ver' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.lv0 || r.up0 ? 'old save not 木屋' : !r.b1[0] ? 'upgrade refused: ' + r.b1[1] : r.lv1 !== 1 ? 'lv ' + r.lv1 : r.saved !== 1 ? 'not saved' : r.savedHouse ? 'h.lv leaked into the save' : !r.door ? 'door unreachable' : r.size > 65536 ? 'save size ' + r.size : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'kh_v15save', JSON.stringify(r)); if (bad) fails.push('v15save: ' + bad); await p.context().close();
  }
  if (net.length) fails.push('network: ' + net.slice(0, 3).join(' '));
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
