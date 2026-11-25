// Screenshots + browser checks for v5.10.10 (诊所, 老房翻盖, 路面铺石板):  node tools/clinic-shots.js [name-filter]
//   writes /workspace/pf-shots/v51010_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
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
    const lookFree = (x, y, a) => { f.setAngle(a || 0); f.cam.x = x; f.cam.y = y; f.advance(0.05, 10); }; // bypass clampCam: the clinic sits near WORLD.x1
    const hide = () => { const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden'; const say = document.getElementById('say'); if (say) { say.hidden = true; say.textContent = ''; } };
    const shoo = (x, y, r, keep) => {
      const go = a => { if (!a || (keep && a.id === keep) || typeof a.x !== 'number') return;
        if (Math.hypot(a.x - x, a.y - y) < r) { a.x = 760; a.y = 2; a.moving = false; if ('out' in a && a.id !== keep) a.out = false; } };
      (f.NEIGH || []).forEach(go); (f.GUESTS || []).forEach(go);
      (typeof f.actors === 'function' ? f.actors() : []).forEach(go); if (f.FARMER) go(f.FARMER);
      const su = keep && f.NEIGH.find(q => q.id === keep); if (su) { su.x = window.PFClinic.STAND.x; su.y = window.PFClinic.STAND.y; su.moving = false; su.out = true; su.spot = 'clinic'; }
    };
    const out = id => { const g = f.NEIGH.find(q => q.id === id); return g ? { out: g.out, spot: g.spot, x: Math.round(g.x), y: Math.round(g.y), name: g.name } : null; };
    const start = id => { f.FARMER.wood = 800; const r = f.hallStart(id); if (!r.ok) throw new Error(id + ' ' + (r.why || JSON.stringify(r))); return r; };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 12 }] }); f.syncFamily(); dry();`;
  const toLv4 = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library']) { start(id); nextMorning(); at(9 * 60); } f.FARMER.wood = 800;`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 800)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. the clinic from the street: warm plaster, door and steps, a green-cross sign, 苏大夫 beside the door
  await shot('v51010_clinic.png', `(() => { ${setup} ${toLv4}
    const lock0 = (f.hallView().projects.find(p => p.id === 'clinic') || {}).why;
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.hallStart('clinic'); if (!r.ok) return { r, lock0 };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood;
    nextMorning(); at(10 * 60); dry(); f.advance(2, 10);
    until(() => { const n = f.NEIGH.find(q => q.id === 'n10'); return n && n.out && n.spot === 'clinic' && !n.moving; }, 800);
    shoo(870, 98, 28, 'n10'); lookFree(870, 100, Math.PI + 0.2); shoo(870, 98, 28, 'n10'); hide();
    const v = f.hallView(), su = out('n10');
    return { lock0, r, paid, wood, built: S.town.hall.built.clinic, lv: v.lv, paved: !!(f.CL && f.CL.paved(S.town.hall)), su, log: S.events.map(e => e.msg).filter(m => /诊所|苏大夫/.test(m)).slice(0, 4) }; })()`,
    r => !r.r || !r.r.ok ? 'start ' + JSON.stringify(r.r) : r.paid !== 30000 || r.wood !== 0 ? 'cost ' + r.paid + '/' + r.wood : !r.built ? 'not built' : r.lv !== 4 ? 'lv ' + r.lv : !r.su || r.su.spot !== 'clinic' ? '苏大夫 ' + JSON.stringify(r.su) : r.paved ? 'paved too early' : null);

  // 2. one rebuilt two-storey house (阿松) next to an old one-storey house (小桃)
  await shot('v51010_rebuild.png', `(() => { ${setup} ${toLv4}
    start('clinic'); nextMorning(); at(9 * 60);
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.hallStart('h3'); if (!r.ok) return { r };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood;
    nextMorning(); at(10 * 60); f.advance(2, 10);
    look(913, 30, 0); hide();
    const v = f.hallView();
    return { r, paid, wood, h3: S.town.hall.built.h3, h4: S.town.hall.built.h4 || 0, lv: v.lv, paved: !!(f.CL && f.CL.paved(S.town.hall)) }; })()`,
    r => !r.r || !r.r.ok ? 'start ' + JSON.stringify(r.r) : r.paid !== 12000 || r.wood !== 150 ? 'cost ' + r.paid + '/' + r.wood : !r.h3 ? 'not rebuilt' : r.h4 ? '小桃 already rebuilt' : r.paved ? 'paved too early' : null);

  // 3. all five houses rebuilt and the clinic up: streets laid in stone, prosperity 5
  await shot('v51010_paved.png', `(() => { ${setup} ${toLv4}
    start('clinic'); nextMorning(); at(9 * 60);
    for (const id of ['h1', 'h2', 'h3', 'h4', 'h5']) { start(id); nextMorning(); at(9 * 60); }
    at(11 * 60); dry(); f.advance(2, 10); shoo(870, 98, 28, 'n10'); look(780, 60, 0); shoo(870, 98, 28, 'n10'); hide();
    const v = f.hallView(), g = f.groundAt(780, 66), g2 = f.groundAt(720, 66);
    return { lv: v.lv, lvName: v.lvName, paved: !!(f.CL && f.CL.paved(S.town.hall)), built: Object.keys(S.town.hall.built).length, road: g && g[1], stone: !!(g && g[0] && g2 && g2[0]), log: S.events.map(e => e.msg).filter(m => /石板|繁荣度升到了 5/.test(m)).slice(0, 3) }; })()`,
    r => r.lv !== 5 ? 'lv ' + r.lv : !r.paved ? 'not paved' : r.built !== 15 ? 'built ' + r.built : !r.log.length ? 'no pave log' : null);

  // 4. fixtures load: hall gains an empty clinic, save version stays 15
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    await shot(`v51010_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, clinic: s2.town.hall.clinic, school: s2.town.hall.school }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.12.6' ? 'ver ' + r.ver : !r.clinic || r.clinic.last !== 0 ? 'clinic ' + JSON.stringify(r.clinic) : null, save);
  }

  // 5. (local only) the real save and the friend's save load without errors
  for (const file of [REAL, FRIEND].filter(f => f && fs.existsSync(f))) {
    const save = readSave(file), tag = file === REAL ? 'realsave' : 'friendsave';
    await shot(`v51010_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(3, 10);
      const town = !!(S.eff && S.eff.town);
      if (town) { f.setAngle(0); f.panTo(780, 70); f.advance(0.3, 10); } else look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, clinic: s2.town.hall.clinic, coins: s.coins }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.12.6' ? 'ver ' + r.ver : !r.clinic ? 'missing clinic' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
