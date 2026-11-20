// Screenshots + browser checks for v5.11.0.9 (房子比例: the buildings that kept their old small models are a size up):
//   node tools/scale-shots.js [tag] [name-filter]   writes /workspace/pf-shots/scale_<tag>_*.png (tag: after; PF_SHOTS to change)
//   exits 1 on a page error, a console error or a failed check (a door nobody can walk to, a building on a lane or on another)
//   the scale of each model on its own (and the rule) is tools/scale-audit.js
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const TAG = process.argv[2] || 'after', only = process.argv[3] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await ready();
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); S.town.school.kid1 = Math.max(S.town.school.kid1 | 0, 3); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden'; };
    const Lof = () => f.innLayout && f.innLayout();
    const lookInn = (a) => { const L = Lof(); if (L) look(L.yard.x, L.yard.y + 8, a || 0); };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(70); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();`;
  const readyTown = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    S.coins = Math.max(S.coins, 400000); f.FARMER.wood = 2500;
    for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' wood=' + f.FARMER.wood); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 2500); S.coins = Math.max(S.coins, 300000);`;
  const shopText = `(() => { const shop = document.getElementById('shop'); return shop ? shop.innerText.replace(/\\s+/g, ' ') : ''; })()`;
  const cardTitles = `[...document.querySelectorAll('#shop .card b')].map(b => b.textContent.trim())`;
  const shot = async (name0, fn, check, save, after) => { const name = `scale_${TAG}_${name0}.png`; if (only && !name0.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    if (after && !(r && r.error)) { try { r = Object.assign(r || {}, await after(p)); } catch (e) { r = { error: String(e).slice(0, 400) }; } }
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };


  const full = `S.inn.cabins = 4; S.inn.inn2 = 0; S.inn.diner.lv = 3; S.inn.job = null; S.inn.arrived = 0; S.inn._morn = 0;
    f.IA.sync(true); f.markNavDirty(); f.innRepaint();`;
  // every lodging door can be walked to from the town gate, and no building box sits on a lane or another building
  const check = `(() => { const L = f.innLayout(); if (!L) return { error: 'no layout' };
    const box = (c) => [c.x - c.hw, c.y - c.hd, c.x + c.hw, c.y + c.hd - 1], boxes = L.cabins.map(box).concat([box(L.diner)]);
    const lane = []; for (const p of (L.paths || [L.path])) for (let i = 0; i < p.length - 1; i++) for (let t = 0; t <= 1; t += 0.05) lane.push([p[i].x + (p[i + 1].x - p[i].x) * t, p[i].y + (p[i + 1].y - p[i].y) * t]);
    const onLane = boxes.filter(b => lane.some(([x, y]) => x > b[0] && x < b[2] && y > b[1] && y < b[3])).length;
    let overlap = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const A = boxes[i], B = boxes[j]; if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) overlap++; }
    const tablesIn = L.tables.filter(t => boxes.some(b => t.x + 4 > b[0] && t.x - 4 < b[2] && t.y + 4 > b[1] && t.y - 4 < b[3])).length;
    const from = { x: 596, y: 66 }, doors = L.cabins.map(c => c.door).concat([L.diner.door]);
    const routes = doors.map(d => { const r = f.routeVia(from, d); return r ? r.length : -1; });
    return { onLane, overlap, tablesIn, routes }; })()`;
  const bad = r => r.onLane ? 'a building on a lane' : r.overlap ? 'buildings overlap' : r.tablesIn ? 'a table inside a building' : r.routes && r.routes.some(n => n < 1) ? 'a door nobody can reach ' + r.routes : null;

  // 1. the 农家乐区 by day: four cabins north of the road, the restaurant (top level) south of it
  await shot('agri_day', `(() => { ${setup} ${readyTown} ${full} at(11 * 60); dry(); f.advance(0.5, 10); look(520, 64, 0); hide(); return ${check}; })()`, bad);
  // 2. the two-storey inn, a little closer to the cabins
  await shot('agri_inn2', `(() => { ${setup} ${readyTown} ${full} S.inn.inn2 = 1; f.IA.sync(true); f.markNavDirty(); at(15 * 60); dry(); f.advance(0.5, 10); look(520, 22, 0); hide(); return ${check}; })()`, bad);
  // 3. the restaurant, its tables and the guest square
  await shot('agri_south', `(() => { ${setup} ${readyTown} ${full} at(12 * 60); dry(); f.advance(0.5, 10); look(522, 126, 0); hide(); return ${check}; })()`, bad);
  // 4. night: guests asleep, windows lit
  await shot('agri_night', `(() => { ${setup} ${readyTown} ${full} S.inn.inn2 = 1; S.inn.stars.avg = 5; at(9 * 60 + 50); dry(); f.innMorning(); until(() => (f.STAYS || []).length > 0, 600);
    at(20 * 60); until(() => (f.STAYS || []).length && (f.STAYS || []).every(g => g.inside), 900); at(21 * 60 + 30); f.IA.sync(true); f.advance(0.5, 10); look(520, 50, 0); hide();
    return Object.assign(${check}, { inside: (f.STAYS || []).filter(g => g.inside).length, stays: (f.STAYS || []).length }); })()`, r => bad(r) || (r.inside < 1 ? 'nobody asleep ' + r.stays : null));
  // 5. the town: a v5.11.0 house street beside the market (the stalls' awnings now clear the stallholders' hats)
  await shot('town', `(() => { ${setup} ${readyTown} const nx = f.marketView().next; day(nx); at(6 * 60 + 50); f.advance(1, 10); at(10 * 60); f.advance(3, 10);
    until(() => f.NEIGH.filter(q => /^stall:/.test(q.spot) && !q.moving).length >= 4, 600); look(650, 100, 0); hide();
    return { stalls: (f.props || []).filter(q => q.town === 'stall').length, keepers: f.NEIGH.filter(q => /^stall:/.test(q.spot)).length }; })()`, r => r.stalls < 6 ? 'stalls ' + r.stalls : null);
  // 6. the home farm: a married child's cottage, the three workshops in a 工坊院
  await shot('farm', `(() => { ${setup} f.buyPlot('glade', 'meadow'); f.buy('cottage'); const h = S.home.houses[0]; if (h) { h.built = S.day - 1; h.kid = 'kid0'; h._tiles = null; f.homeTilesSync(); f.HA.sync(true); }
    f.buy('shed'); f.buy('cow'); f.buyPlot('wbank', 'workshop'); const gm = f.buy('mill'), gj = f.buy('jam'), gc = f.buy('cheese'); at(10 * 60); dry(); f.advance(1, 10);
    const R = f.PL.plot('wbank').rect, works = ['mill', 'jam', 'cheese'].map(id => S.works.works[id] && f.PW.workPos(S.works.works[id]));
    const doors = ['mill', 'jam', 'cheese'].map(id => S.works.works[id] && f.routeVia({ x: 36, y: 44 }, f.PWA.doorOf(id))).map(r => (r ? r.length : -1));
    look((R[0] + R[2]) / 2, (R[1] + R[3]) / 2, 0); hide();
    return { house: !!(h && h.built), works: works.map(p => p && [Math.round(p.x), Math.round(p.y)]), doors, ok: [gm.ok, gj.ok, gc.ok] }; })()`,
    r => r.ok.some(x => !x) ? 'bought ' + r.ok : r.doors.some(n => n < 1) ? 'a workshop door nobody can reach ' + r.doors : null);
  await shot('farm_cottage', `(() => { ${setup} f.buyPlot('glade', 'meadow'); f.buy('cottage'); const h = S.home.houses[0]; if (!h) return { error: 'no cottage' }; h.built = S.day - 1; h.kid = 'kid0'; h._tiles = null; f.homeTilesSync(); f.HA.sync(true);
    at(10 * 60); dry(); f.advance(1, 10); look(h.x, h.y + 6, 0); hide(); const L = f.HM.layout(h), door = L && L.door; const r = door ? f.routeVia({ x: 36, y: 44 }, door) : null;
    return { at: [h.x, h.y], door, route: r ? r.length : -1 }; })()`, r => r.route < 1 ? 'nobody can reach the cottage door' : null);
  // 7. the seaside resort: four huts, umbrellas, the seafood stall, the guest pier and the deck
  await shot('seaside', `(() => { ${setup} ${readyTown} let land = f.buyPlot('eshore', 'resort'); if (S.plots.eshore && S.plots.eshore.mod !== 'resort') f.rezonePlot('eshore', 'resort');
    S.inn.resort = { huts: 4, parasols: 8, stall: 1, pier: 1, deck: 1 }; S.inn.job = null; f.IA.sync(true); f.markNavDirty(); f.innRepaint && f.innRepaint();
    at(11 * 60); dry(); f.advance(0.5, 10); const RL = f.IA.resortLayout(); look(272, 236, 0); hide();
    const huts = RL.huts.map(c => [c.x - c.hw, c.y - c.hd, c.x + c.hw, c.y + c.hd - 1]); let overlap = 0; for (let i = 0; i < huts.length; i++) for (let j = i + 1; j < huts.length; j++) { const A = huts[i], B = huts[j]; if (A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3]) overlap++; }
    const umbIn = RL.parasols.filter(u => huts.some(b => u.x > b[0] - 2 && u.x < b[2] + 2 && u.y > b[1] - 2 && u.y < b[3] + 2)).length;
    const routes = RL.huts.map(c => { const r = f.routeVia(RL.gate, c.door); return r ? r.length : -1; });
    return { overlap, umbIn, routes, props: (f.props || []).filter(q => q.hut != null).length }; })()`,
    r => r.props < 4 ? 'huts ' + r.props : r.overlap ? 'huts overlap' : r.umbIn ? 'an umbrella in a hut' : r.routes.some(n => n < 1) ? 'a hut door nobody can reach ' + r.routes : null);
  await shot('seaside_night', `(() => { ${setup} ${readyTown} let land = f.buyPlot('eshore', 'resort'); if (S.plots.eshore && S.plots.eshore.mod !== 'resort') f.rezonePlot('eshore', 'resort');
    S.inn.resort = { huts: 4, parasols: 8, stall: 1, pier: 1, deck: 1 }; S.inn.job = null; at(20 * 60 + 30); dry(); f.IA.sync(true); f.markNavDirty(); f.advance(0.5, 10); look(272, 236, 0); hide(); return {}; })()`);

  // 8. perf: the full district in view, render time while the camera turns (cold: new stack canvases, warm: cached)
  await shot('perf', `(() => { ${setup} ${readyTown} ${full} S.inn.inn2 = 1; f.IA.sync(true); at(11 * 60); dry(); f.advance(0.5, 10); look(520, 64, 0); hide();
    const st = 2 * Math.PI / 256, run = (n, a0) => { const ts = []; for (let i = 0; i < n; i++) { f.setAngle(a0 + i * st); const t = performance.now(); f.render(); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return { avg: +(ts.reduce((a, b) => a + b) / n).toFixed(2), p95: +ts[Math.floor(n * 0.95)].toFixed(2) }; };
    const stat = (() => { const ts = []; for (let i = 0; i < 30; i++) { const t = performance.now(); f.render(); ts.push(performance.now() - t); } return +(ts.reduce((a, b) => a + b) / 30).toFixed(2); })();
    const cold = run(60, 0.22), warm = run(60, 0.22); f.setAngle(0); f.render(); return { stat, cold, warm, mem: f.mem && f.mem() }; })()`,
    r => r.warm && r.warm.avg > 40 ? 'slow ' + JSON.stringify(r) : null);
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
