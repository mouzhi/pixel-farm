// v5.11.0.14: move a new house into a first-ring field (东田).  node tools/housemove-shots.js [name-filter]
//   writes /workspace/pf-shots/housemove_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const USER_SAVE = process.env.PF_USER_SAVE || '/workspace/user-save-1120/pixel-farm-save.json';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [], net = [];
  async function page(q, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('request', rq => { if (!rq.url().startsWith(base) && !rq.url().startsWith('data:')) net.push(rq.url()); });
    await p.goto(base + '/index.html' + q); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const tod = () => S.t % 1440, dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const house = () => S.home.houses[0];
    const look = (x, y, a) => { f.setAngle(a == null ? 0.25 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const clientOf = (wx, wy) => { const [sx, sy] = f.proj(wx, wy), cv = document.querySelector('canvas'), b = cv.getBoundingClientRect();
      return { x: b.left + sx * b.width / cv.width, y: b.top + sy * b.height / cv.height }; };
    const setup = () => { f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
      for (const id of ['house','house','house','axe','forest','east','orchard','south','pasture','coast','can','can','can','can']) f.buy(id);
      day(90); at(10 * 60); dry();
      const plot = f.buyPlot('eshore', 'field'); const cot = f.buy('cottage'); const h = house();
      if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); f.HA.sync(true); f.markNavDirty(); }
      return { plot: !!(plot && plot.ok), cot: !!(cot && cot.ok), site: h && h.site, at: h && [h.x, h.y, h.m] }; };`;

  const shot = async (name, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page('?manual'); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, name + '.png') });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. the cottage still starts on 东南滩; 东田 (with its 农田) sits to the north-west, the same view as the report
  await shot('housemove_before', `(() => { ${helpers} const st = setup(); const h = house();
    look(340, 90, 0.2); f.advance(1, 10);
    const field = f.HM.fieldBox('east', 'field');
    const tiles = (f.tiles || []).filter(t => t.f === 'east' && t.open).length;
    return { ver: f.version, sv: f.snapshot().saveVersion, st, site: h && h.site, at: h && [h.x, h.y], field, tiles }; })()`,
    r => r.ver !== VERSION ? 'ver ' + r.ver : r.sv !== 15 ? 'saveVersion ' + r.sv : r.site !== 'eshore' ? 'not on 东南滩 ' + r.site : (r.tiles | 0) < 8 ? 'east tiles ' + r.tiles : null);

  // 2. 挪东西 onto the 东田 crops is refused, and the toast names the 农田
  await shot('housemove_reject', `(() => { ${helpers} setup(); const h = house();
    look(300, 70, 0.2); f.advance(0.5, 10);
    f.setMode('move');
    const hc = clientOf(h.x, h.y); f.commitAt(hc.x, hc.y);
    const field = f.HM.fieldBox('east', 'field'), fx = (field[0] + field[2]) / 2, fy = (field[1] + field[3]) / 2;
    const r = f.homeMoveOk(fx, fy, 0);
    const fc = clientOf(fx, fy); f.aimAt(fc.x, fc.y); const click = f.commitAt(fc.x, fc.y);
    const say = document.getElementById('say');
    if (say) { say.textContent = r.why || ''; say.hidden = false; say.style.top = '200px'; say.style.zIndex = '20'; }
    f.render();
    const toast = (say && say.textContent) || '';
    const hover = f.input && f.input.hover && f.input.hover.dec;
    return { ver: f.version, why: r.why, ok: r.ok, toast, hoverOk: hover && hover.ok, click: click && click.r, pick: !!(click && click.pick) }; })()`,
    r => r.ok ? 'should reject the crops' : !/农田/.test(r.why || '') ? 'why ' + r.why : !/农田/.test(r.toast || '') ? 'toast ' + r.toast : r.hoverOk ? 'hover looked valid' : null);

  // 3. the same house moves onto the empty grass north of the 东田 crops
  await shot('housemove_after', `(() => { ${helpers} setup(); const h = house();
    const r = f.homeMoveTo(280, 36, 0); const H = house(), L = f.HM.layout(H);
    look(300, 50, 0.2); f.advance(1, 10);
    const field = f.HM.fieldBox('east', 'field'), hit = field && f.HM.boxHit(L.foot, field);
    const g = f.ensureNav(), door = L.door, farm = f.NAV.LAYOUT.DOOR, well = f.NAV.LAYOUT.WELL_SPOT, barn = f.NAV.LAYOUT.BARN_DOOR;
    const reach = (a, b) => f.pathTo(a, b).reached;
    return { ver: f.version, sv: f.snapshot().saveVersion, r, site: H.site, at: [H.x, H.y, H.m], hit, from: h && [h.x, h.y],
      paths: { door: reach(farm, door) || reach(f.WD.region('east').gate, door), well: reach(farm, well), barn: reach(farm, barn) } }; })()`,
    r => !r.r || !r.r.ok ? 'move failed ' + ((r.r && r.r.why) || r.error) : r.site !== 'east' ? 'site ' + r.site : r.hit ? 'still on the crops' : r.sv !== 15 ? 'saveVersion ' : !r.paths.door ? 'door unreachable' : !r.paths.well ? 'well cut off' : !r.paths.barn ? 'warehouse cut off' : null);

  // 4. the farmer walks from the farm door to the new door (school-side path still open)
  await shot('housemove_path', `(() => { ${helpers} setup(); const moved = f.homeMoveTo(280, 36, 0); const H = house(), L = f.HM.layout(H);
    const farm = f.NAV.LAYOUT.DOOR; f.FARMER.x = farm.x; f.FARMER.y = farm.y; f.FARMER.task = { kind: 'goto', label: '去新房子', to: { x: L.door.x, y: L.door.y + 2 }, dur: 2 };
    const got = until(() => Math.hypot(f.FARMER.x - L.door.x, f.FARMER.y - (L.door.y + 2)) < 4, 2400);
    look(300, 50, 0.2); f.advance(0.5, 10);
    const end = [Math.round(f.FARMER.x), Math.round(f.FARMER.y)];
    return { ver: f.version, ok: !!(moved && moved.ok), site: H.site, got, end, door: [L.door.x, L.door.y], dist: Math.round(Math.hypot(f.FARMER.x - L.door.x, f.FARMER.y - L.door.y)) }; })()`,
    r => !r.ok ? 'move failed' : r.site !== 'east' ? 'site ' + r.site : !r.got ? 'farmer did not reach the new door ' + JSON.stringify(r.end) : r.dist > 8 ? 'still far ' + r.dist : null);

  // optional: the player's own save (never committed) still loads as v15 and can move the 东南滩 house into 东田
  if (fs.existsSync(USER_SAVE) && (!only || 'housemove_usersave'.includes(only))) {
    const raw = JSON.parse(fs.readFileSync(USER_SAVE, 'utf8'));
    const save = raw && raw.save ? raw.save : raw;
    const p = await page('?manual');
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { const b = document.getElementById('offOk'); if (b) b.click(); });
    const r = await p.evaluate(() => { const f = __farm, S = f.S;
      const i = S.home.houses.findIndex(h => h.site === 'eshore'); const h = S.home.houses[i];
      const before = h && { site: h.site, x: h.x, y: h.y, m: h.m };
      const field = f.homeMoveOk(272, 68, i), grass = i >= 0 ? f.homeMoveTo(280, 36, i) : { ok: false, why: 'no eshore house' };
      const H = S.home.houses[i], L = H && f.HM.layout(H), farm = f.NAV.LAYOUT.DOOR;
      if (H) { f.setAngle(0.2); f.panTo(300, 50); f.advance(0.5, 10); }
      const box = document.getElementById('offline'); if (box) box.hidden = true;
      return { ver: f.version, sv: f.snapshot().saveVersion, day: S.clock ? S.clock.day : S.day, n: S.home.houses.length,
        before, fieldWhy: field && field.why, fieldOk: field && field.ok, grass, site: H && H.site, at: H && [H.x, H.y, H.m],
        door: L && f.pathTo(farm, L.door).reached, well: f.pathTo(farm, f.NAV.LAYOUT.WELL_SPOT).reached }; });
    await p.screenshot({ path: path.join(OUT, 'housemove_usersave.png') });
    const bad = r.sv !== 15 ? 'saveVersion ' + r.sv : r.n < 1 ? 'no houses' : !r.before || r.before.site !== 'eshore' ? 'eshore house missing' : r.fieldOk ? 'crops should be rejected' : !/农田/.test(r.fieldWhy || '') ? 'field why ' + r.fieldWhy : !r.grass || !r.grass.ok ? 'usersave move failed ' + ((r.grass && r.grass.why) || '') : r.site !== 'east' ? 'site ' + r.site : !r.door ? 'door unreachable' : !r.well ? 'well cut off' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'housemove_usersave', JSON.stringify(r)); if (bad) fails.push('usersave: ' + bad); await p.context().close();
  }

  if (net.length) fails.push('network: ' + net.slice(0, 3).join(' '));
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
