// Screenshots + browser checks for v5.12.6 (旅游大巴):  node tools/bus-shots.js [name-filter]
//   writes $PF_SHOTS/v5126_*.png (default /workspace/v5126-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/v5126-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'v5126_';
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, BUS = f.BUS;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) { S.weather.rained = false; S.weather.rain = null; } };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };
    const quiet = () => { const t = document.getElementById('toast'); if (t) t.hidden = true; for (const el of document.querySelectorAll('.toast,#albumToast,#albToast')) el.style.display = 'none'; };
    const openTown = () => { f.buyPlot('eroad', 'road'); if (!S.town) S.town = {}; if (!S.town.school) S.town.school = {}; S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); const r = f.buy('town'); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(2.2, 12); return r; };
    const stampLv5 = () => { const H = S.town.hall; const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      ids.forEach((id, i) => { H.built[id] = (S.day | 0) - (ids.length + 2) + i; }); f.applyUpgrades(); f.TA.sync(true); return f.hallView().lv; };
    const agri = () => { for (const id of ['cabin', 'diner']) { f.innStart(id); S.inn.job = null; } S.inn.cabins = 4; S.inn.diner.lv = 1; if (f.innRepaint) f.innRepaint(); f.fogUpdate && f.fogUpdate(true); f.advance(1, 12); };
    const buildPark = () => { at(9 * 60); const r = f.hallStart('park'); day(S.day + 1); at(7 * 60); f.hallTick(); f.TA.sync(true); return r; };
    const six = () => { buildPark(); S.town.hall.lv6 = S.day - 30; f.TA.sync(true); };
    const buses = () => f.props.filter(q => q.eastBus).map(q => q.eastBus + ':' + q.busState + '@' + Math.round(q.x) + ',' + Math.round(q.y));
    const go = T => { at(T); dry(); f.busReset(); f.advance(0.05, 10); at(T); f.advance(0.05, 10); };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(60); dry(); at(9 * 60); openTown(); stampLv5(); f.buy('eastave'); f.buy('vacbeach'); agri(); f.busReset();`;
  const shot = async (name, vw, vh, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${setup} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const ver = r => r.ver !== VERSION ? 'ver ' + r.ver : r.sv && r.sv !== 15 ? 'saveVersion ' + r.sv : null;

  // 1. 繁荣度 6: bus A comes along the avenue and turns into the lot (the board card lists both buses)
  const arriveFn = `six(); const pl = f.busPlan(), a = pl[0]; go(a.arrive - 1.1); look(1180, 120, 0); hide(); quiet(); go(a.arrive - 1.1);
    const card = (() => { const v = f.busView(); return v; })();
    return { ver: f.version, sv: f.snapshot().saveVersion, n: pl.length, today: card.today, six: card.six, buses: buses(), why: card.why };`;
  const arriveCk = r => ver(r) || (r.n !== 2 || r.today !== 16 || !r.six ? 'plan ' + r.n + '/' + r.today : null) || (!r.buses.some(s => /^busA:arrive/.test(s)) ? 'no arriving bus ' + r.buses : null);
  await shot('arrive.png', 1280, 800, arriveFn, arriveCk);

  // 2. both buses parked in the reserved bays; the second group stepping off at the door
  const parkedFn = `six(); const pl = f.busPlan(), B = pl[1]; go(B.arrive + 3); look(1170, 150, 0); hide(); quiet(); go(B.arrive + 3);
    const vis = f.busVis();
    return { ver: f.version, buses: buses(), off: vis.filter(q => q.state === 'go' && q.y > 150).length, all: vis.length, bays: BUS.BAYS.map(s => s.x + ',' + s.y).join(' ') };`;
  const parkedCk = r => ver(r) || (r.buses.filter(s => /:parked@(1124|1210),178/.test(s)).length !== 2 ? 'parked ' + r.buses : null) || (r.off < 2 ? 'nobody stepping off ' + r.off : null);
  await shot('parked.png', 1280, 800, parkedFn, parkedCk);
  await shot('parked_phone.png', 390, 844, parkedFn, parkedCk);

  // 3. groups walking west along the avenue into town (pairs side by side)
  const walkFn = `six(); const pl = f.busPlan(), B = pl[1]; const T = B.arrive + 14; go(T); const v0 = f.busVis().filter(q => q.state === 'go');
    const cx = v0.reduce((a, q) => a + q.x, 0) / Math.max(1, v0.length), cy = v0.reduce((a, q) => a + q.y, 0) / Math.max(1, v0.length);
    look(cx, cy, 0); hide(); quiet(); go(T); const vis = f.busVis();
    return { ver: f.version, walking: vis.filter(q => q.state === 'go').length, at: Math.round(cx) + ',' + Math.round(cy) };`;
  const walkCk = r => ver(r) || (r.walking < 4 ? 'walking ' + r.walking : null);
  await shot('walk.png', 1280, 800, walkFn, walkCk);

  // 4. tourists at the 镇公园 and the 节庆广场 at midday; none in the rain (the buses still stand in the lot)
  const thereFn = `six(); const pl = f.busPlan(); let T = 13 * 60; go(T); look(780, 40, 0); hide(); quiet(); go(T);
    const vis = f.busVis(), there = vis.filter(q => q.state === 'there'); const by = {}; for (const q of there) by[q.dest] = (by[q.dest] | 0) + 1;
    S.weather = window.PFWeather.forceRain(S.weather, S.day, 12 * 60, 180); const wet = BUS.at(pl, T, { rain: true }).people.filter(q => q.state === 'there').length; const rainNow = window.PFWeather.isRaining(S.weather, S.day, S.t);
    f.busFrame(); const wetVis = f.busVis().filter(q => q.state === 'there').length; dry(); f.busFrame();
    return { ver: f.version, there: there.length, by, wet, wetVis, rainNow, buses: buses().length };`;
  const thereCk = r => ver(r) || (r.there < 4 ? 'there ' + r.there : null) || (!r.rainNow ? 'rain not forced' : null) || (r.wet || r.wetVis ? 'out in the rain ' + r.wet + '/' + r.wetVis : null) || (r.buses !== 2 ? 'buses in the rain ' + r.buses : null);
  await shot('there.png', 1280, 800, thereFn, thereCk);

  // 5. the last pair boards and bus A backs out, then drives off east; the fee is paid once, also across a reload mid-day
  const leaveFn = `six(); const pl = f.busPlan(), A = pl[0], c0 = S.coins, n0 = S.town.hall.bus | 0;
    for (let m = 8 * 60; m < 13 * 60; m += 2) { at(m); dry(); f.busFrame(); } const mid = S.coins - c0; f.busReset(); f.busFrame();
    for (let m = 13 * 60; m <= A.leave + 1; m += 1) { at(m); dry(); f.busFrame(); } const got = S.coins - c0, total = (S.town.hall.bus | 0) - n0;
    go(A.leave + 0.6); look(1150, 130, 0); hide(); quiet(); at(A.leave + 0.6); f.advance(0.02, 10);
    const sv = f.snapshot(), bytes = JSON.stringify(sv).length;
    return { ver: f.version, sv: sv.saveVersion, mid, got, total, buses: buses(), saved: sv.town && sv.town.hall && sv.town.hall.bus, bytes, album: !!(S.album && f.ALB && f.ALB.get(S.album, 'tourbus')) };`;
  const leaveCk = r => ver(r) || (r.mid !== 0 ? 'paid before leaving ' + r.mid : null) || (r.got !== 100 ? 'fee ' + r.got : null) || (r.total !== 8 ? 'total ' + r.total : null)
    || (!r.buses.some(s => /^busA:leave/.test(s)) ? 'bus A not leaving ' + r.buses : null) || (r.saved !== r.total ? 'hall.bus not saved ' + r.saved : null) || (r.bytes > 64 * 1024 ? 'bytes ' + r.bytes : null);
  await shot('leave.png', 1280, 800, leaveFn, leaveCk);

  // 6. night: the bays empty, the two bus-stop lamps lit
  const nightFn = `six(); go(20 * 60); look(1170, 150, 0); hide(); quiet(); go(20 * 60);
    return { ver: f.version, buses: buses(), vis: f.busVis().length, lamps: BUS.lightsAt(S.t % 1440, true).length, stops: f.props.filter(q => q.busStop).length };`;
  const nightCk = r => ver(r) || (r.buses.length || r.vis ? 'bus / people at night' : null) || (r.lamps !== 2 || r.stops !== 2 ? 'lamps ' + r.lamps + ' stops ' + r.stops : null);
  await shot('night.png', 1280, 800, nightFn, nightCk);

  // 7. below 6: one bus of 6; the board card says a second one comes at 繁荣度 6. Without a cabin: none, and the card says why
  const boardFn = `go(10 * 60 + 30); const v5 = f.busView(); const btn = document.getElementById('shopBtn'); if (btn) btn.click(); const tab = document.querySelector('#shop [data-tab="hall"]'); if (tab) tab.click(); f.refreshUI(); quiet();
    const card = document.querySelector('#shop [data-item="bus"]'); const txt = card ? card.textContent.replace(/\\s+/g, ' ') : '';
    S.inn.cabins = 0; f.busReset(); const v0 = f.busView();
    return { ver: f.version, runs: v5.runs.length, today: v5.today, why0: v0.why, n0: v0.today, txt: txt.slice(0, 300) };`;
  const boardCk = r => ver(r) || (r.runs !== 1 || r.today !== 6 ? 'lv5 plan ' + r.runs + '/' + r.today : null) || (!/繁荣度到 6/.test(r.txt) ? 'card ' + r.txt : null) || (!/民宿/.test(r.why0 || '') || r.n0 ? 'no-inn gate ' + r.why0 : null);
  await shot('board.png', 1280, 800, boardFn, boardCk);

  await b.close(); server.close();
  if (errs.length || fails.length) { console.error('ERRORS', errs.concat(fails).join('\n')); process.exit(1); }
  console.log('ok  bus-shots  version', VERSION, '->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
