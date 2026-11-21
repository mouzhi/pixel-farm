// Screenshots + browser checks for v5.10.11 (丰收节 + 灯会):  node tools/festival-shots.js [name-filter]
//   writes /workspace/pf-shots/v51011_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
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
    const hide = () => { for (const id of ['leftBottom', 'inv', 'bottomRight', 'tools', 'say']) { const el = document.getElementById(id); if (el) { el.style.visibility = 'hidden'; if (id === 'say') { el.hidden = true; el.textContent = ''; } } } };
    const start = id => { f.FARMER.wood = 800; const r = f.hallStart(id); if (!r.ok) throw new Error(id + ' ' + (r.why || JSON.stringify(r))); return r; };
    const wake = () => { const all = (typeof f.actors === 'function' ? f.actors() : []).concat(f.FARMER || []);
      all.forEach(a => { if (a) { a.sleeping = false; a.home = false; } }); };
    const nearTable = a => a && typeof a.x === 'number' && (f.FV.SECTIONS || [f.FV.TABLE]).some(t => Math.hypot(a.x - t.x, a.y - t.y) < 18); // v5.11.0: three table sections
    const familyHere = () => {
      const kids = (S.family && S.family.kids) || [];
      const partner = (typeof f.actors === 'function' ? f.actors() : []).find(a => a && a.id === 'partner');
      const kid = kids[0] && (typeof f.actors === 'function' ? f.actors() : []).find(a => a && a.id === kids[0].id);
      return { farmer: nearTable(f.FARMER), partner: partner ? nearTable(partner) : null, kid: kid ? nearTable(kid) : null, n: (typeof f.actors === 'function' ? f.actors() : []).filter(nearTable).length };
    };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 12 }] }); f.syncFamily(); dry();`;
  const toLv4 = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library']) { start(id); nextMorning(); at(9 * 60); } f.FARMER.wood = 800;`;
  const toFest = `${toLv4}
    start('clinic'); nextMorning(); at(9 * 60);
    for (const id of ['h1', 'h2', 'h3', 'h4', 'h5']) { start(id); nextMorning(); at(9 * 60); }
    const festDay = f.FV.nextDay(S.town.hall, S.day);
    day(festDay); at(18 * 60 + 10); dry(); wake(); f.advance(0.5, 10);
    until(() => { const fam = familyHere(); return fam.farmer && fam.partner !== false && fam.kid !== false; }, 55);
    const kids = (S.family && S.family.kids) || [];
    (typeof f.actors === 'function' ? f.actors() : []).concat(f.FARMER || []).forEach(a => {
      if (!a) return;
      const i = (a === f.FARMER || !a.id) ? 0 : (a.id === 'partner' ? 1 : 2 + Math.max(0, kids.findIndex(k => k.id === a.id)));
      if (a === f.FARMER || a.id === 'partner' || kids.some(k => k.id === a.id)) {
        const at = f.FV.seatAt(i);
        a.x = at.x + (i % 2 ? 0.3 : -0.3); a.y = at.y; a.moving = false; a.sleeping = false; a.home = false; a.away = null;
        a.task = { kind: 'feast', label: '在镇上吃丰收宴', to: { x: at.x, y: at.y }, dur: 20, rest: true };
      }
    });
    at(20 * 60 + 15); dry(); wake(); f.advance(0.4, 10);`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 800)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. night lantern fair on the plaza: strings over the paved street, stalls, warm lights
  await shot('v51011_fair.png', `(() => { ${setup} ${toFest}
    look(763, 110, 0); hide();
    const v = f.hallView(), H = S.town.hall, T = S.t % 1440;
    return { festDay: S.day, today: !!(v.festival && v.festival.today), lantern: !!(v.festival && v.festival.lantern),
      fair: !!(f.fairNow && f.fairNow()), feast: !!(f.festNow && f.festNow()), sleep: f.sleepAt && f.sleepAt(),
      gift: H.festival && H.festival.gift, last: H.festival && H.festival.last, gold: v.festival && v.festival.gift,
      paved: !!(f.CL && f.CL.paved(H)), lv: v.lv, T, family: familyHere(),
      log: S.events.map(e => e.msg).filter(m => /丰收节|长桌|灯会/.test(m)).slice(0, 4) }; })()`,
    r => r.lv !== 5 ? 'lv ' + r.lv : !r.paved ? 'not paved' : !r.today ? 'not festival' : !r.lantern ? 'no lantern shops' : !r.fair ? 'fair closed' : r.sleep !== 22 * 60 ? 'bedtime ' + r.sleep : r.gift !== r.festDay ? 'gift day ' + r.gift : r.gold !== 400 ? 'gift ' + r.gold : !r.log.length ? 'no log' : null);

  // 2. long-table feast with the family (south side of the table, camera-side seats)
  await shot('v51011_feast.png', `(() => { ${setup} ${toFest}
    look(763, 130, Math.PI + 0.28); hide();
    const fam = familyHere(), T = S.t % 1440;
    return { festDay: S.day, feast: !!(f.festNow && f.festNow()), fair: !!(f.fairNow && f.fairNow()), T, fam,
      farmer: f.FARMER && { x: Math.round(f.FARMER.x), y: Math.round(f.FARMER.y), kind: f.FARMER.task && f.FARMER.task.kind, sleeping: !!f.FARMER.sleeping } }; })()`,
    r => !r.feast ? 'feast closed' : !r.fam.farmer || r.fam.partner === false || r.fam.kid === false ? 'family not at table ' + JSON.stringify(r.fam) : r.farmer && r.farmer.sleeping ? 'farmer sleeping' : null);

  // 3. wide shot of the lit town: main street lanterns, plaza, paved road
  await shot('v51011_lit.png', `(() => { ${setup} ${toFest}
    look(763, 96, 0); hide();
    const v = f.hallView(), H = S.town.hall;
    return { festDay: S.day, fair: !!(f.fairNow && f.fairNow()), paved: !!(f.CL && f.CL.paved(H)), lv: v.lv, sleep: f.sleepAt && f.sleepAt() }; })()`,
    r => r.lv !== 5 ? 'lv ' + r.lv : !r.paved ? 'not paved' : !r.fair ? 'fair closed' : r.sleep !== 22 * 60 ? 'bedtime ' + r.sleep : null);

  // 4. fixtures load: hall gains an empty festival, save version stays 15
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    await shot(`v51011_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, festival: s2.town.hall.festival, clinic: s2.town.hall.clinic }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.24' ? 'ver ' + r.ver : !r.festival || r.festival.last !== 0 || r.festival.gift !== 0 ? 'festival ' + JSON.stringify(r.festival) : !r.clinic ? 'missing clinic' : null, save);
  }

  // 5. (local only) the real save and the friend's save load without errors
  for (const file of [REAL, FRIEND].filter(f => f && fs.existsSync(f))) {
    const save = readSave(file), tag = file === REAL ? 'realsave' : 'friendsave';
    await shot(`v51011_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(3, 10);
      const town = !!(S.eff && S.eff.town);
      if (town) { f.setAngle(0); f.panTo(780, 70); f.advance(0.3, 10); } else look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, festival: s2.town.hall.festival, coins: s.coins }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.24' ? 'ver ' + r.ver : !r.festival ? 'missing festival' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
