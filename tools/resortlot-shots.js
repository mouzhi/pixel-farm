// Local screenshots for feat/resort-lot-villas (not in CI).  node tools/resortlot-shots.js
// writes /workspace/pf-shots/resortlot_*.png
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page() { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); S.town.school.kid1 = Math.max(S.town.school.kid1 | 0, 3); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom','shop','say','albumToast']) { const el = document.getElementById(id); if (el) { el.hidden = true; el.style.visibility = 'hidden'; } } };
    const parkFam = () => { for (const a of f.actors()) { a.x = 40; a.y = 40; a.pts = []; a.task = null; a.moving = false; a.wait = 999; } };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 5000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can','searod']) f.buy(id);
    day(80); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();`;
  const readyTown = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    S.coins = Math.max(S.coins, 600000); f.FARMER.wood = 3000;
    for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' wood=' + f.FARMER.wood); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 3000); S.coins = Math.max(S.coins, 500000);`;
  const zoneResort = `let land = f.buyPlot('eshore', 'resort');
    if (!land.ok && !S.plots.eshore) { land = f.buyPlot('eshore', 'meadow'); }
    if (S.plots.eshore && S.plots.eshore.mod !== 'resort') { const z = f.rezonePlot('eshore', 'resort'); if (!z.ok) throw new Error('rezone resort: ' + (z.why || z.reason)); }
    if (!(f.IN && f.IN.resortPlotOf(S.plots))) throw new Error('no resort plot ' + JSON.stringify(land));
    if (f.syncResortJoin) f.syncResortJoin();
    f.markNavDirty && f.markNavDirty();`;
  const shot = async (name, fn, check) => {
    const p = await page(); let r;
    try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 500) }; }
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null;
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 1200));
    if (bad) fails.push(name + ': ' + bad);
    await p.context().close();
  };

  await shot('resortlot_empty.png', `(() => { ${setup} ${readyTown} ${zoneResort}
    at(13 * 60); dry(); parkFam();
    const L = f.innResortLayout(), p = f.PL.plot('eshore').rect;
    look(368, 196, 0.15); hide();
    const g0 = f.groundAt(376, 200), g1 = f.groundAt(360, 208), g2 = f.groundAt(344, 220);
    const nav = f.NAV.route(f.ensureNav(), { x: 400, y: 150 }, { x: 332, y: 236 });
    return { zoned: S.plots.eshore && S.plots.eshore.mod, villas: (S.inn.resort && S.inn.resort.villas) | 0, camp: !!(S.inn.resort && S.inn.resort.camp),
      join: L && L.lotJoin, sand: [g0 && g0[1], g1 && g1[1], g2 && g1 && g2[1]], reached: nav.reached, len: Math.round(nav.length), rect: p }; })()`,
    r => (!r || r.zoned !== 'resort') ? 'not zoned' : (!r.reached || r.len > 160) ? 'path not short ' + (r && r.len) : (r.villas || r.camp) ? 'lot should be empty' : null);

  await shot('resortlot_day.png', `(() => { ${setup} ${readyTown} ${zoneResort}
    S.inn.resort = { huts: 2, parasols: 4, stall: 1, pier: 0, deck: 1, villas: 3, camp: 1 }; S.inn.job = null; S.inn.arrived = 0; S.inn._morn = 0;
    if (f.IA && f.IA.sync) f.IA.sync(true); f.markNavDirty && f.markNavDirty();
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(13 * 60); dry();
    until(() => (f.STAYS || []).some(g => (g.stay === 'villa' || g.stay === 'camp') && !g.inside), 900);
    const L = f.innResortLayout();
    parkFam();
    const villas = (f.STAYS || []).filter(g => g.stay === 'villa' && !g.leaving);
    const campers = (f.STAYS || []).filter(g => g.stay === 'camp' && !g.leaving);
    const beach = (f.STAYS || []).filter(g => g.stay === 'beach' && !g.leaving);
    villas.forEach((s, i) => { const v = L.villas[i % 3]; s.pts = []; s.inside = false; s.moving = false;
      if (i === 0) { s.x = 368; s.y = 202; s.what = 'walk'; } else { s.x = v.door.x + 2; s.y = v.door.y + 5; s.what = 'yard'; } });
    campers.forEach((s, i) => { const sit = L.fire.sit[i % L.fire.sit.length]; s.pts = []; s.x = sit.x; s.y = sit.y; s.what = 'fire'; s.task = { rest: 1 }; s.inside = false; s.moving = false; });
    if (beach[0]) { beach[0].pts = []; beach[0].x = 348; beach[0].y = 218; beach[0].what = 'walk'; beach[0].inside = false; }
    look(392, 168, 0.12); hide();
    const props = (f.props || []).filter(q => q.villa != null || q.tent != null || q.fire);
    return { villas: S.inn.resort.villas, camp: S.inn.resort.camp, stays: { villa: villas.length, camp: campers.length, beach: beach.length },
      props: props.length, fire: !!(props.find(q => q.fire)), tents: props.filter(q => q.tent != null).length, villaProps: props.filter(q => q.villa != null).length }; })()`,
    r => (!r || r.villas !== 3 || !r.camp) ? 'not built' : (r.villaProps < 3 || r.tents < 3 || !r.fire) ? 'missing props ' + JSON.stringify(r) : (r.stays.villa + r.stays.camp < 2) ? 'no lot guests' : null);

  await shot('resortlot_night.png', `(() => { ${setup} ${readyTown} ${zoneResort}
    S.inn.resort = { huts: 0, parasols: 0, stall: 0, pier: 0, deck: 0, villas: 3, camp: 1 }; S.inn.job = null; S.inn.arrived = 0; S.inn._morn = 0;
    S.inn.guests = [];
    if (f.IA && f.IA.sync) f.IA.sync(true); f.markNavDirty && f.markNavDirty();
    S.inn.arrived = 0; S.inn._morn = 0; f.innMorning();
    at(20 * 60 + 30); dry();
    const L = f.innResortLayout();
    parkFam();
    // park a few campers by the fire for the night shot (ON_SCREEN may have kept them from spawning)
    f.STAYS.length = 0;
    const looks = f.IN.BEACH_LOOKS;
    (L.fire.sit || [L.fire]).forEach((sit, i) => {
      f.STAYS.push({ id: 'cshot' + i, gid: 'cshot' + i, look: looks[i % looks.length], room: i, n: 1, lead: 1, stay: 'camp',
        x: sit.x, y: sit.y, fx: 0, fy: 1, pts: [], moving: false, leaving: false, inside: false, wait: 40, what: 'fire',
        until: S.day + 1, fromDay: S.day, at: 12 * 60, task: { rest: 1 } });
    });
    for (let i = 0; i < 3; i++) {
      const v = L.villas[i];
      f.STAYS.push({ id: 'vshot' + i, gid: 'vshot' + i, look: looks[(i + 3) % looks.length], room: i, n: 1, lead: 1, stay: 'villa',
        x: v.door.x, y: v.door.y, fx: 0, fy: 1, pts: [], moving: false, leaving: false, inside: true, wait: 0, what: 'sleep',
        until: S.day + 1, fromDay: S.day, at: 12 * 60, task: null });
    }
    if (f.IA && f.IA.sync) f.IA.sync(true);
    look(386, 182, 0.2); hide();
    const t = S.t % 1440, late = t >= 17 * 60 + 30 || t < 6 * 60 + 30;
    return { t, late, campers: (f.STAYS || []).filter(g => g.stay === 'camp' && !g.inside).length,
      villasIn: (f.STAYS || []).filter(g => g.stay === 'villa' && g.inside).length,
      fire: !!(f.props || []).some(q => q.fire), camp: !!(S.inn.resort && S.inn.resort.camp) }; })()`,
    r => (!r || !r.late) ? 'not night' : (!r.fire || !r.camp) ? 'no campfire' : (r.campers < 1) ? 'no one at the fire' : null);

  console.log('errors', errs.slice(0, 8));
  if (fails.length || errs.length) { console.error('FAILED', fails, errs.slice(0, 5)); process.exit(1); }
  console.log('shots ok');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
