// Screenshots + browser checks for v5.10.9 (学校扩建 + 书屋, 操场, 运动会):  node tools/school-shots.js [name-filter]
//   writes /workspace/pf-shots/v5109_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const REAL = process.env.PF_REAL_SAVE || '/workspace/pf-saves/day81-save-and-log.txt';
const FRIEND = process.env.PF_FRIEND_SAVE || '/workspace/pf-saves/friend/pixel-farm-save.json';
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
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden'; };
    const out = id => { const g = f.NEIGH.find(q => q.id === id); return g ? { out: g.out, spot: g.spot, x: Math.round(g.x), y: Math.round(g.y), name: g.name } : null; };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 16 }] }); f.syncFamily(); dry();`;
  const shops = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy']) { f.FARMER.wood = 800; const r = f.hallStart(id); if (!r.ok) return { error: id + ' ' + (r.why || r.err || JSON.stringify(r)) }; nextMorning(); at(9 * 60); } f.FARMER.wood = 800;`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 800)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. the school expansion: a second classroom east of the school, the yard already wider
  await shot('v5109_school.png', `(() => { ${setup} ${shops}
    const lock0 = (f.hallView().projects.find(p => p.id === 'school') || {}).why;
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.hallStart('school'); if (!r.ok) return { r, lock0, built: S.town.hall.built, job: S.town.hall.job };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood;
    nextMorning(); at(10 * 60); f.advance(2, 10); look(668, 20, 0); hide();
    const v = f.hallView();
    return { lock0, r, paid, wood, built: S.town.hall.built.school, lv: v.lv, next: v.next, classroom: !!(f.TA.state && f.TA.state().hall), log: S.events.map(e => e.msg).filter(m => /学校|操场|教室/.test(m)).slice(0, 4) }; })()`,
    r => !r.r || !r.r.ok ? 'start ' + JSON.stringify(r.r) : r.paid !== 40000 || r.wood !== 200 ? 'cost ' + r.paid + '/' + r.wood : !r.built ? 'not built' : r.lv !== 3 ? 'lv ' + r.lv : null);

  // 2. the playground: the oval track, flag, posts and benches east of the school
  await shot('v5109_playground.png', `(() => { ${setup} ${shops}
    const r = f.hallStart('school'); if (!r.ok) return { r };
    nextMorning(); at(11 * 60); dry(); f.advance(2, 10); look(662, -30, 0); hide();
    const v = f.hallView();
    return { built: !!S.town.hall.built.school, sports: v.school && v.school.sports, next: v.school && v.school.next, yard: f.SC && f.SC.YARD, flag: f.SC && f.SC.FLAG, t: S.t % 1440 }; })()`,
    r => !r.built ? 'not built' : !r.yard ? 'no yard' : r.sports ? 'not a regular day' : !r.next ? 'no next sports day' : null);

  // 3. the 书屋 east of 小桃: ink-blue roof, 书 sign, 阿宁 at the door
  await shot('v5109_library.png', `(() => { ${setup} ${shops}
    const s0 = f.hallStart('school'); if (!s0.ok) return { s0 };
    nextMorning(); at(9 * 60);
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.hallStart('library'); if (!r.ok) return { r, built: S.town.hall.built };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood;
    nextMorning(); at(10 * 60); f.advance(2, 10);
    until(() => { const n = f.NEIGH.find(q => q.id === 'n9'); return n && n.out && n.spot === 'library' && !n.moving; }, 800);
    look(726, 40, 0); hide();
    const v = f.hallView(), ning = out('n9');
    return { r, paid, wood, built: S.town.hall.built.library, lv: v.lv, hints: (v.library && v.library.hints || []).map(q => q.id), ning, log: S.events.map(e => e.msg).filter(m => /书屋|图书馆/.test(m)).slice(0, 4) }; })()`,
    r => !r.r || !r.r.ok ? 'start ' + JSON.stringify(r.r) : r.paid !== 25000 || r.wood !== 150 ? 'cost ' + r.paid + '/' + r.wood : !r.built ? 'not built' : r.lv !== 4 ? 'lv ' + r.lv : !r.ning || r.ning.spot !== 'library' ? '阿宁 ' + JSON.stringify(r.ning) : null);

  // 4. sports day: kids on the track, family on the benches, 林老师, classmates, flags
  await shot('v5109_sports.png', `(() => { ${setup} ${shops}
    const s0 = f.hallStart('school'); if (!s0.ok) return { s0 };
    nextMorning();
    const H = S.town.hall, next = f.SC.nextDay(H, S.day);
    day(next); at(7 * 60 + 40); dry(); f.advance(2, 10);
    until(() => f.actors().some(q => q.id && /^kid/.test(q.id) && q.task && (q.task.kind === 'school-go' || q.task.kind === 'race')), 600);
    at(10 * 60); f.advance(2, 10);
    until(() => f.sportsOpenNow() && (out('n1') || {}).spot === 'yard', 800);
    const inYard = q => f.SC.inYard(q.x, q.y, 4) || q._sports || (q.task && q.task.kind === 'race');
    until(() => f.actors().filter(q => q.id && /^kid/.test(q.id)).some(inYard), 2500);
    const far = f.actors().filter(q => q.id && /^kid/.test(q.id) && !inYard(q));
    if (far.length) {
      far.forEach((q, i) => {
        const m = (f.memberOf && f.memberOf(q.id)) || q;
        const at = f.SC.raceAt(i, S.t, 6);
        m.x = at.x; m.y = at.y; m.pts = []; m.moving = false; m._sports = 1; m.away = null;
        if (m.task) { m.task.kind = 'race'; m.task.done = null; }
      });
      f.advance(1, 10);
    }
    look(662, -30, 0); hide();
    const v = f.hallView(), lin = out('n1');
    const kids = f.actors().filter(q => q.id && /^kid/.test(q.id)).map(q => ({ id: q.id, kind: q.task && q.task.kind, sports: !!q._sports, away: q.away, x: Math.round(q.x), y: Math.round(q.y), hold: q.hold, hat: q.hat }));
    const watch = f.actors().filter(q => q.task && /运动会|操场/.test(q.task.label || '')).map(q => q.name || q.id);
    return { next, open: f.sportsOpenNow(), sports: v.school && v.school.sports, lin, kids, watch, people: f.NEIGH.filter(q => q.out).map(q => q.id + ':' + q.spot) }; })()`,
    r => !r.open || !r.sports ? 'not sports day ' + JSON.stringify({ open: r.open, sports: r.sports, next: r.next }) : !r.lin || r.lin.spot !== 'yard' ? '林老师 ' + JSON.stringify(r.lin) : null);

  // 5. fixtures load: hall gains empty school/library, save version stays 15
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    await shot(`v5109_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, school: s2.town.hall.school, library: s2.town.hall.library, hall: s2.town.hall.built }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.12.4' ? 'ver ' + r.ver : !r.school || r.school.last !== 0 ? 'school ' + JSON.stringify(r.school) : !r.library || r.library.days !== 0 ? 'library ' + JSON.stringify(r.library) : null, save);
  }

  // 6. (local only) the real save and the friend's save load without errors
  for (const file of [REAL, FRIEND].filter(f => f && fs.existsSync(f))) {
    const save = readSave(file), tag = file === REAL ? 'realsave' : 'friendsave';
    await shot(`v5109_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(3, 10);
      const town = !!(S.eff && S.eff.town);
      if (town) { f.setAngle(0); f.panTo(668, 30); f.advance(0.3, 10); } else look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, school: s2.town.hall.school, library: s2.town.hall.library, coins: s.coins }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.12.4' ? 'ver ' + r.ver : !r.school || !r.library ? 'missing hall fields' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
