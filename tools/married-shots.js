// v5.11.0.22 browser checks: a married child who picked 经营民宿 / 菜馆 works in the 农家乐区 by day with their spouse (it used to
// sit on the new house's bench all day), comes home once in the evening, and the spouse counts as family (HUD 一家 N/M, 家人 slot).
//   node tools/married-shots.js [name-filter]  ->  married_*.png in PF_SHOTS (default /workspace/pf-shots); exits 1 on any failure
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
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
    const kid = () => S.members.find(m => m.id === 'kid0');
    const house = () => S.home.houses[0], sp = () => f.SPOUSES[0];
    const prepHome = () => { f.buyPlot('glade', 'meadow'); const r = f.buy('cottage'); const h = house(); if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); } return r.ok; };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(70); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();`;
  const readyTown = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    S.coins = Math.max(S.coins, 200000); f.FARMER.wood = 800;
    for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' wood=' + f.FARMER.wood); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 400); S.coins = Math.max(S.coins, 80000);`;
  const wedMorning = `prepHome(); S.home.rel.kid0 = { m0: 30, m1: 85, m2: 20 }; S.home.nb = Object.assign(S.home.nb || {}, { n3: 60, n2: 10, n8: 5 });
    day(S.day + 1); at(6 * 60 + 20); dry(); f.homeMorning();`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  const VER = '5.12.7';
  // a cabin in the 农家乐区 (paid, then put up) so the inn path is open, then the wedding morning
  const innReady = `{ const r = f.innStart('cabin'); if (!r.ok) throw new Error('cabin ' + r.why); nextMorning(); at(9 * 60); S.inn.job = null; S.inn.cabins = Math.max(1, S.inn.cabins | 0); f.FARMER.wood = Math.max(f.FARMER.wood, 800); S.coins = Math.max(S.coins, 80000); }`;
  // per game minute, what kid0 and the spouse are doing; on shift = 9:00–17:00, evening = 18:00–21:00
  const tally = `const tally = (from, to) => { const o = { kid: {}, sp: {}, kidXY: [], spXY: [] }; at(from); f.advance(0.2, 10);
      let g = 0; while (S.t % 1440 < to && g++ < 6000) { const t0 = S.t; f.advance(0.5, 10); const w = S.t - t0, k = kid(), s = sp();
        for (const [who, a] of [['kid', k], ['sp', s]]) { const key = !a ? 'missing' : a.home ? 'home' : a.task ? a.task.kind : 'none'; o[who][key] = (o[who][key] || 0) + w; }
        if (k && s) { o.kidXY.push([Math.round(k.x), Math.round(k.y)]); o.spXY.push([Math.round(s.x), Math.round(s.y)]); } }
      return o; };`;
  const sum = (o, re) => Object.entries(o).filter(([k]) => re.test(k)).reduce((n, [, v]) => n + v, 0);

  // 1. 经营民宿 / 菜馆: both of them spend most of the shift in the 农家乐区 with visible jobs, not on the bench
  await shot('married_inn.png', `(() => { ${setup} ${readyTown} ${innReady} ${wedMorning} ${tally}
    const before = document.getElementById('loveVal').textContent, ls0 = f.loveStatus();
    const pick = f.careerPick('kid0', 'inn'); if (!pick.ok) return { pick };
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry();
    const shift = tally(9 * 60, 17 * 60), A = f.IN.AGRI, inA = p => p[0] >= A[0] && p[0] <= A[2] && p[1] >= A[1] && p[1] <= A[3];
    const kIn = shift.kidXY.filter(inA).length / Math.max(1, shift.kidXY.length), sIn = shift.spXY.filter(inA).length / Math.max(1, shift.spXY.length);
    at(14 * 60); f.advance(1, 10); const k = kid(), s = sp(), labels = [k && k.task && k.task.label, s && s.task && s.task.label];
    look(520, 40, 0); hide(); f.refreshUI(); f.advance(0.2, 10);
    return { pick, path: S.home.path.kid0, shift: { kid: shift.kid, sp: shift.sp }, kIn, sIn, labels, before, after: document.getElementById('loveVal').textContent, ls0: { people: ls0.people, pop: ls0.pop },
      ls: (({ people, pop, inlaws, hint }) => ({ people, pop, inlaws, hint }))(f.loveStatus()), ver: f.version }; })()`,
    r => r.ver !== VER ? 'ver ' + r.ver
      : !r.pick || !r.pick.ok ? 'pick ' + JSON.stringify(r.pick)
      : !r.path || r.path.way !== 'inn' ? 'path ' + JSON.stringify(r.path)
      : sum(r.shift.kid, /^inn-keep$/) < 240 ? 'kid at the inn only ' + sum(r.shift.kid, /^inn-keep$/) + ' min ' + JSON.stringify(r.shift.kid)
      : sum(r.shift.sp, /^inn-keep$/) < 240 ? 'spouse at the inn only ' + sum(r.shift.sp, /^inn-keep$/) + ' min ' + JSON.stringify(r.shift.sp)
      : sum(r.shift.kid, /^idle$/) > 30 || sum(r.shift.sp, /^idle$/) > 30 ? 'resting on shift ' + JSON.stringify(r.shift)
      : r.kIn < 0.8 || r.sIn < 0.8 ? 'not in the 农家乐区 ' + r.kIn + ' / ' + r.sIn
      : r.ls.people !== r.ls0.people + 1 || r.ls.pop !== r.ls0.pop + 1 ? 'family count ' + JSON.stringify([r.ls0, r.ls])
      : r.after !== '一家 ' + r.ls.people + '/' + r.ls.pop ? 'HUD ' + r.after
      : !r.ls.inlaws || r.ls.inlaws.length !== 1 || !r.ls.hint.includes(r.ls.inlaws[0] + '（小豆的爱人）') ? 'hint ' + r.ls.hint
      : null);

  // 2. the evening: one walk home, then they stay round the new house (no trips back up to the road)
  await shot('married_evening.png', `(() => { ${setup} ${readyTown} ${innReady} ${wedMorning} ${tally}
    f.careerPick('kid0', 'inn'); until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(8 * 60); until(() => S.t % 1440 >= 17 * 60, 4000); // the whole working day in real time, no jump
    const eve = tally(17 * 60, 21 * 60), d = f.HM.layout(house()).door;
    const near = xy => xy.slice(Math.floor(xy.length / 2)).every(p => Math.hypot(p[0] - d.x, p[1] - d.y) < 45);
    look(d.x, d.y, 0); hide();
    return { kid: eve.kid, sp: eve.sp, kNear: near(eve.kidXY), sNear: near(eve.spXY) }; })()`,
    r => sum(r.kid, /^work-back$/) > 120 || sum(r.sp, /^work-back$/) > 120 ? 'walking home all evening ' + JSON.stringify(r)
      : !r.kNear || !r.sNear ? 'not at home in the second half of the evening ' + JSON.stringify(r)
      : null);

  // 3. the 家人 slot counts the spouse and lists what they are doing
  await shot('married_hud.png', `(() => { ${setup} ${readyTown} ${innReady} ${wedMorning}
    f.careerPick('kid0', 'inn'); until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(11 * 60); f.advance(1, 10); f.refreshUI();
    const hud = document.getElementById('loveHud'); if (hud) hud.click(); f.advance(0.2, 10);
    const tip = document.getElementById('loveTip'), name = f.SPOUSES[0] && f.SPOUSES[0].name;
    const slot = [...document.querySelectorAll('[data-id="family"], [data-inv="family"]')].map(e => (e.getAttribute('title') || '') + ' ' + e.textContent).join(' ');
    return { hud: document.getElementById('loveVal').textContent, tip: tip && !tip.hidden ? tip.textContent.replace(/\\s+/g, ' ').slice(0, 300) : '', name, slot: slot.slice(0, 300) }; })()`,
    r => !r.name ? 'no spouse'
      : !/^一家 \d+\/\d+$/.test(r.hud) ? 'HUD ' + r.hud
      : !r.tip.includes(r.name + '（小豆的爱人）') ? 'tip ' + r.tip
      : null);

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
