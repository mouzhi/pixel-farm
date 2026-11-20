// Screenshots + browser checks for v5.10.6 (成家后的出路):  node tools/careers-shots.js [name-filter]
//   writes /workspace/pf-shots/v5106_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
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

  // 1. wedding morning: the path-choice modal, three options, work preselected (affinity with 小桃 ≥ 50)
  await shot('v5106_wedding_choice.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    const box = document.getElementById('career');
    const opts = [...(box ? box.querySelectorAll('[data-way]') : [])].map(el => el.getAttribute('data-way') + (el.classList.contains('on') ? '*' : '') + (el.disabled ? '!' : ''));
    const v = f.careerView('kid0', 'wedding');
    look(96, 60, 0);
    return { hidden: !box || box.hidden, title: box && box.querySelector('h3') && box.querySelector('h3').textContent, opts, txt: box ? box.innerText.replace(/\\s+/g, ' ').slice(0, 240) : '',
      v, wed: S.home.wed.kid0, ver: f.version, lv: f.townLv() }; })()`,
    r => r.ver !== '5.11.0.4.1' ? 'ver ' + r.ver
      : r.hidden ? 'modal hidden'
      : !/成家以后做什么/.test(r.title || '') ? 'title ' + r.title
      : !r.wed || r.wed.mate !== 'm1' ? 'no wedding'
      : r.lv < 3 ? 'lv ' + r.lv
      : !r.opts.includes('farm') || !r.opts.includes('work*') || !r.opts.find(s => s.startsWith('shop')) ? 'opts ' + JSON.stringify(r.opts)
      : r.opts.filter(s => !s.startsWith('inn')).some(s => s.endsWith('!')) ? 'an option locked ' + JSON.stringify(r.opts)
      : !r.opts.some(s => s.startsWith('inn')) ? 'missing inn option ' + JSON.stringify(r.opts)
      : !r.v || r.v.fee !== 0 ? 'fee ' + JSON.stringify(r.v)
      : null);

  // 2. the couple walk the east avenue to the bakery in the morning, no field tool in hand
  await shot('v5106_commute.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    const pick = f.careerPick('kid0', 'work', 'bakery'); if (!pick.ok) return { pick };
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(8 * 60); f.advance(0.5, 10);
    const seen = [];
    until(() => { const k = kid(), s = sp(); if (!k || !s) return false;
      if (f.workWalk(k) || f.workWalk(s)) seen.push({ kx: Math.round(k.x), ky: Math.round(k.y), sx: Math.round(s.x), sy: Math.round(s.y), kt: k.task && k.task.kind, st: s.task && s.task.kind });
      return k.x > 400 && Math.abs(k.y - 66) < 10 && (f.workWalk(k) || (k.task && /^work/.test(k.task.kind))); }, 2200);
    const k = kid(), s = sp();
    look(Math.max(k && k.x || 430, 430), 66, 0); hide();
    return { pick, path: S.home.path.kid0, t: S.t % 1440,
      k: k && { x: Math.round(k.x), y: Math.round(k.y), task: k.task && k.task.kind, walk: f.workWalk(k), carry: f.carryFields(k), look: f.lookOf(k) },
      s: s && { x: Math.round(s.x), y: Math.round(s.y), task: s.task && s.task.kind, walk: f.workWalk(s), carry: f.carryFields(s) },
      seen: seen.slice(-3) }; })()`,
    r => !r.pick || !r.pick.ok ? 'pick ' + JSON.stringify(r.pick)
      : !r.path || r.path.way !== 'work' || r.path.at !== 'bakery' ? 'path ' + JSON.stringify(r.path)
      : !r.k || r.k.x < 360 || Math.abs(r.k.y - 66) > 14 ? 'kid not on the avenue ' + JSON.stringify(r.k)
      : !r.s || r.s.x < 300 ? 'spouse not commuting ' + JSON.stringify(r.s)
      : r.k.carry && (r.k.carry.basket || r.k.carry.carry) ? 'kid holding a tool ' + JSON.stringify(r.k.carry)
      : r.s && r.s.carry && (r.s.carry.basket || r.s.carry.carry) ? 'spouse holding a tool'
      : r.k.look && /_school$/.test(r.k.look[0] || r.k.look) ? 'school look on an adult ' + JSON.stringify(r.k.look)
      : null);

  // 3. 小豆的花店 in town, day (after the scaffold day) and a name sign
  await shot('v5106_shop_day.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    const c0 = S.coins, w0 = f.FARMER.wood, pick = f.careerPick('kid0', 'shop', null, 'flower'); if (!pick.ok) return { pick };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood, lot = pick.at || (S.home.path.kid0 && S.home.path.kid0.at);
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    const ready0 = f.CR.shopReady(S.home.path.kid0, S.day);
    nextMorning(); dry(); at(9 * 60); const l = f.CR.LOT[lot];
    until(() => { const k = kid(); return k && l && Math.hypot(k.x - l.door.x, k.y - l.door.y) < 16; }, 1800);
    at(11 * 60); f.advance(2, 10);
    const k = kid(), s = sp();
    look(l.x, l.y + 8, 0); hide();
    const props = (f.props || []).filter(q => q.town === lot).map(q => q.town);
    return { pick, paid, wood, lot, ready0, ready: f.CR.shopReady(S.home.path.kid0, S.day), lv: f.townLv(), hallLv: window.PFHall.prosperity(S.town.hall),
      name: f.CR.shopName('小豆', 'flower'),
      k: k && { x: Math.round(k.x), y: Math.round(k.y), task: k.task && k.task.kind },
      s: s && { x: Math.round(s.x), y: Math.round(s.y), task: s.task && s.task.kind },
      props, kind: S.home.path.kid0.kind }; })()`,
    r => !r.pick || !r.pick.ok ? 'pick ' + JSON.stringify(r.pick)
      : r.paid !== 15000 || r.wood !== 150 ? 'cost ' + r.paid + '/' + r.wood
      : r.ready0 ? 'opened the same day'
      : !r.ready ? 'not ready next morning'
      : r.hallLv !== 3 ? 'hall lv ' + r.hallLv
      : r.lv !== 4 ? 'townLv should be hall+1 once, got ' + r.lv
      : r.name !== '小豆的花店' ? 'name ' + r.name
      : r.kind !== 'flower' ? 'kind'
      : !r.props.length ? 'no shop prop'
      : null);

  // 4. the same shop at night, with a window light
  await shot('v5106_shop_night.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    f.careerPick('kid0', 'shop', null, 'flower');
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(21 * 60); f.advance(2, 10);
    const lot = S.home.path.kid0.at, l = f.CR.LOT[lot];
    look(l.x, l.y + 8, 0); hide();
    const lights = f.CR.lightsAt(S.town.lots, S.home.path, S.t, S.day);
    return { t: S.t % 1440, ready: f.CR.shopReady(S.home.path.kid0, S.day), lights: lights.length, at: lot }; })()`,
    r => r.t < 20 * 60 ? 'not night' : !r.ready ? 'not ready' : r.lights < 1 ? 'no shop light' : null);

  // 5. family panel 「换个活法」: a pre-v5.10.6 marriage is free the first time
  await shot('v5106_change.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    f.careerPick('kid0', 'farm');
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    delete S.home.path.kid0; // already married, no record: first change is free
    nextMorning(); at(10 * 60); f.advance(1, 10);
    f.refreshUI(); const hud = document.getElementById('loveHud'); if (hud) hud.click();
    const tip = document.getElementById('loveTip');
    const btn = tip && tip.querySelector('[data-cr="kid0"]'); if (btn) btn.click();
    const box = document.getElementById('career');
    const v = f.careerView('kid0', 'change');
    const auto = (S.autoBuy = true, f.autoBuyAtStall && f.autoBuyAtStall());
    return { tip: tip && !tip.hidden, tipTxt: tip ? tip.textContent.replace(/\\s+/g, ' ').slice(0, 200) : '',
      btn: !!(btn || (box && !box.hidden)), hidden: !box || box.hidden,
      title: box && box.querySelector('h3') && box.querySelector('h3').textContent,
      txt: box ? box.innerText.replace(/\\s+/g, ' ').slice(0, 240) : '',
      v, auto, path: f.CR.pathOf(S.home, 'kid0') }; })()`,
    r => !r.btn && r.hidden ? 'no 换个活法'
      : r.hidden ? 'change modal hidden'
      : !/换个活法/.test(r.title || '') ? 'title ' + r.title
      : !r.v || r.v.fee !== 0 || !r.v.free ? 'first change should be free ' + JSON.stringify(r.v)
      : !/第一次换不用花钱/.test(r.txt || '') ? 'copy ' + r.txt
      : null);

  // 6. a child still walks to school with the school look (no tool, no straw hat, a backpack)
  await shot('v5106_school_walk.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    f.careerPick('kid0', 'work', 'bakery');
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(7 * 60 + 40); f.advance(0.5, 10);
    const k1 = S.members.find(m => m.id === 'kid1');
    until(() => k1 && (k1.away === 'school' || f.schoolWalk(k1)), 1600);
    look((k1 && k1.x) || 200, (k1 && k1.y) || 70, 0); hide();
    return { away: k1 && k1.away, walk: f.schoolWalk(k1), look: f.lookOf(k1), carry: f.carryFields(k1), task: k1 && k1.task && k1.task.kind }; })()`,
    r => !r.walk && r.away !== 'school' ? 'kid1 not walking to school ' + JSON.stringify(r)
      : r.carry && (r.carry.basket || r.carry.carry) ? 'held item'
      : r.look && r.look[0] !== 'kid1_school' && r.look !== 'kid1_school' ? 'look ' + JSON.stringify(r.look)
      : null);

  // 7. fixtures load: save stays v15, path and lots start empty, version is 5.10.9
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5106_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); look(96, 60, 0);
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, path: s2.home && s2.home.path, lots: s2.town && s2.town.lots, woodshop: s2.town.hall && s2.town.hall.woodshop, counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.4.1' ? 'ver ' + r.ver
        : r.path && Object.keys(r.path).length ? 'path not empty' : r.lots && Object.keys(r.lots).length ? 'lots not empty'
        : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts' : null, save);
  }

  // 8. (local only) the real save and the friend's save load
  for (const [tag, file] of [['realsave', REAL], ['friendsave', FRIEND]]) if (file && fs.existsSync(file)) {
    const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5106_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); at(11 * 60); dry(); look(96, 70, 0); hide();
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, town: !!(S.eff && S.eff.town), path: s2.home && s2.home.path, lots: s2.town && s2.town.lots, counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.4.1' ? 'ver ' + r.ver
        : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts changed' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
