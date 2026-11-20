// Screenshots + browser checks for v5.11.0 (小镇放大):  node tools/v5110-shots.js [name-filter]
//   writes /workspace/pf-shots/v5110_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
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
  async function page(save, vp) { const { query, ...opt } = vp || {}; const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opt)); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual' + ((vp && vp.query) || '')); const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await ready();
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
    const nearTable = a => { const t = f.FV.TABLE; return a && typeof a.x === 'number' && Math.hypot(a.x - t.x, a.y - t.y) < 18; };
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
  const shot = async (name, fn, check, save, vp) => { if (only && !name.includes(only)) return;
    const p = await page(save, vp); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 800)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };


  const allHouses = `for (const id of ['clinic', 'h1', 'h2', 'h3', 'h4', 'h5']) { start(id); nextMorning(); at(9 * 60); }`;
  const facts = `(() => { const TN = window.PFTown, H = S.town.hall, M = f.TA.models(); const st = window.PFTown.BUILDINGS;
      return { ver: f.version, world: [PFWorld.WORLD.x0, PFWorld.WORLD.x1], open: !!(S.eff && S.eff.town), lv: f.hallView().lv,
        built: Object.keys(H.built).filter(k => H.built[k]).length, town: f.props.filter(p => p.town && p.big).length,
        houseH: M.houses[0].h, twoH: M.two[0].h, twoHouseH: M.twoHouse[0].h, schoolH: M.school.h }; })()`;
  // 1. wide overview of the whole new town, everything built
  await shot('v5110_overview.png', `(() => { ${setup} ${toLv4} ${allHouses} at(15 * 60); look(792, 60, 0); hide(); return ${facts}; })()`,
    r => r.ver !== '5.11.0.9' ? 'ver ' + r.ver : r.world[1] !== 1008 ? 'world ' + r.world : !r.open ? 'town shut' : r.lv < 5 ? 'lv ' + r.lv : null, null, { viewport: { width: 1600, height: 1000 }, query: '&view=800x500' });
  // 2. a house beside the farmer, for scale (old one-storey and a two-storey side by side)
  await shot('v5110_scale.png', `(() => { ${setup} openTown(); at(9 * 60); start('L11'); nextMorning(); at(10 * 60);
    f.FARMER.x = 947; f.FARMER.y = 52; f.FARMER.task = null; look(944, 34, 0); hide(); const r = ${facts};
    r.farmerPx = 24; r.houseRatio = +((r.houseH + 14 * 2 * 0.75) / 24).toFixed(2); r.twoRatio = +((r.twoH + 16 * 2 * 0.75) / 24).toFixed(2); return r; })()`,
    r => r.houseH < 40 || r.twoH < 58 ? 'too small ' + r.houseH + '/' + r.twoH : null, null, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  // 3. the festival square with the feast: three table sections, 20 seats, the family at the table, the lantern ring lit
  const toFeast = `${toLv4} ${allHouses}
    const festDay = f.FV.nextDay(S.town.hall, S.day); day(festDay); at(18 * 60 + 10); dry(); wake(); f.advance(0.5, 10);
    const kids = (S.family && S.family.kids) || [];
    (typeof f.actors === 'function' ? f.actors() : []).concat(f.FARMER || []).forEach(a => { if (!a) return;
      const i = (a === f.FARMER || !a.id) ? 0 : (a.id === 'partner' ? 1 : 2 + Math.max(0, kids.findIndex(k => k.id === a.id)));
      if (a === f.FARMER || a.id === 'partner' || kids.some(k => k.id === a.id)) { const q = f.FV.seatAt(i);
        a.x = q.x; a.y = q.y; a.moving = false; a.sleeping = false; a.home = false; a.away = null; a.task = { kind: 'feast', label: '在镇上吃丰收宴', to: { x: q.x, y: q.y }, dur: 20, rest: true }; } });
    at(19 * 60 + 40); dry(); wake(); f.advance(0.4, 10);`;
  await shot('v5110_feast.png', `(() => { ${setup} ${toFeast} look(763, 128, 0); hide();
    const FV = f.FV, sq = FV.SQUARE, onSq = a => a && a.x >= sq[0] && a.x <= sq[2] && a.y >= sq[1] && a.y <= sq[3];
    const feast = f.props.filter(p => p.town === 'feast').length, ring = f.props.filter(p => p.town === 'lantern').length;
    const partner = f.actors().find(a => a && a.id === 'partner'), kid = f.actors().find(a => a && a.id === 'kid0');
    return { feast, ring, seats: FV.SEATS.length, partnerOnSquare: partner ? onSq(partner) : null, kidOnSquare: kid ? onSq(kid) : null, farmerOnSquare: onSq(f.FARMER), fair: !!(f.fairNow && f.fairNow()), T: S.t % 1440 }; })()`,
    r => r.feast !== 3 ? 'feast sections ' + r.feast : r.seats !== 20 ? 'seats ' + r.seats : r.ring < 20 ? 'lantern posts ' + r.ring : !r.farmerOnSquare || r.partnerOnSquare === false || r.kidOnSquare === false ? 'family not at the table ' + JSON.stringify(r) : !r.fair ? 'fair closed' : null);
  // 4. the market plaza (r 36): six stalls round the fountain on market day
  await shot('v5110_market.png', `(() => { ${setup} ${toLv4} const md = f.MK ? f.MK.nextDay(S.town.hall, S.day) : S.day; day(md); at(10 * 60); dry(); f.advance(1, 10); look(650, 118, 0); hide();
    const stalls = f.props.filter(p => p.town === 'stall').length; return { stalls, r: window.PFMarket.PLAZA_R }; })()`,
    r => r.stalls !== 6 ? 'stalls ' + r.stalls : r.r !== 36 ? 'plaza r ' + r.r : null);
  // 5. a two-storey street: the houses on the north lane rebuilt next to the new lots
  await shot('v5110_street.png', `(() => { ${setup} ${toLv4} ${allHouses} at(16 * 60); look(912, 4, 0); hide();
    const two = window.PFTownArt.models().twoHouse, rebuilt = ['h1', 'h2', 'h3', 'h4', 'h5'].filter(id => { const q = f.props.find(p => p.town === id); return q && two.includes(q.m); }).length;
    return { rebuilt }; })()`, r => r.rebuilt !== 5 ? 'rebuilt ' + r.rebuilt : null);
  // 6. the minimap with its jump buttons: each button moves the camera to its place
  await shot('v5110_minimap.png', `(() => { ${setup} openTown(); at(11 * 60); f.advance(0.5, 10); const mm = document.getElementById('minimap'); mm.hidden = false; f.minimapDraw();
    const out = {}; for (const b of document.querySelectorAll('#mmJump button')) { b.click(); f.advance(0.1, 10); out[b.dataset.j] = [Math.round(f.cam.x), Math.round(f.cam.y)]; }
    document.querySelector('#mmJump button[data-j=town]').click(); f.advance(0.2, 10); f.minimapDraw();
    const r = mm.getBoundingClientRect(), jb = document.getElementById('mmJump').getBoundingClientRect(); return { out, mm: [Math.round(r.width), Math.round(r.height)], jb: [Math.round(jb.width), Math.round(jb.height)], n: document.querySelectorAll('#mmJump button').length }; })()`,
    r => r.n !== 4 ? 'buttons ' + r.n : r.out.town[0] < 700 ? 'town jump ' + r.out.town : r.out.home[0] > 200 ? 'home jump ' + r.out.home : r.out.beach[1] < 100 ? 'beach jump ' + r.out.beach : !r.out.agri ? 'agri' : r.mm[0] < 200 ? 'minimap ' + r.mm : null);
  // 7. mobile portrait (390 x 844, as on 小红书): the town, the HUD and the minimap buttons fit
  await shot('v5110_mobile.png', `(() => { ${setup} ${toLv4} at(11 * 60); const mm = document.getElementById('minimap'); mm.hidden = false; look(700, 60, 0); f.minimapDraw();
    const vw = innerWidth, over = [...document.querySelectorAll('#mmJump button, #minimap')].filter(e => { const q = e.getBoundingClientRect(); return q.right > vw + 1 || q.left < -1; }).length, wrap = [...document.querySelectorAll('#mmJump button')].filter(e => e.getBoundingClientRect().height > 30).length;
    const hit = (a, b) => { const p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return p.width && q.width && p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom; };
    const dy = document.getElementById('diaryBtn'), clash = dy ? [mm, ...document.querySelectorAll('#mmJump button, #navBtns button')].filter(e => e !== dy && hit(dy, e)).length : -1; // v5.10.13's 日记 K sits in the same right-hand dock
    return { vw, over, wrap, clash, mm: Math.round(mm.getBoundingClientRect().width) }; })()`,
    r => r.over ? 'off screen ' + r.over : r.wrap ? 'jump buttons wrap ' + r.wrap : r.clash ? 'diary button overlaps ' + r.clash : null, null, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  // 8. routes: from the farm to every door in town, nobody walks through a building; the kid's school walk on the new avenue
  await shot('v5110_routes.png', `(() => { ${setup} ${toLv4} ${allHouses} at(9 * 60); f.ensureNav();
    const TN = window.PFTown, HLm = window.PFHall, CRm = window.PFCareers, rects = [...TN.BUILDINGS, ...HLm.LOTS, ...CRm.LOTS].map(b => ({ id: b.id, r: [b.x - b.hw + 0.6, b.y - b.hd + 0.6, b.x + b.hw - 0.6, b.y + b.hd - 0.6], door: b.door }));
    const inside = (x, y) => rects.find(q => x > q.r[0] && x < q.r[2] && y > q.r[1] && y < q.r[3]);
    const bad = [], far = [], from = { x: 158, y: 54 };
    for (const q of rects) { const w = f.routeVia(from, q.door); const pts = [from].concat(w);
      for (let i = 1; i < pts.length; i++) for (let t = 0; t <= 1; t += 0.05) { const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t, h = inside(x, y); if (h) { bad.push(q.id + '>' + h.id); t = 2; i = pts.length; } }
      const end = pts[pts.length - 1]; if (Math.hypot(end.x - q.door.x, end.y - q.door.y) > 4) far.push(q.id); }
    // a school morning: the kid walks from the farm to the school door; sample the walk
    S.family.kids[0].floor = 'school'; f.syncFamily(); day(S.day + 1); at(6 * 60); dry(); wake(); const hits = [], seen = { pack: 0, hat: 0, hold: 0, walk: 0 }; let maxX = 0, leftAt = null, arrived = null; const kinds = {};
    for (let i = 0; i < 900; i++) { f.advance(1 / 3, 10); const k = S.members.find(m => m.id === 'kid0'); if (!k) break; maxX = Math.max(maxX, k.x); const kk = (k.task && k.task.kind) || '-'; kinds[kk] = (kinds[kk] || 0) + 1;
      const h = inside(k.x, k.y); if (h && !k.away && !(k.task && /school/.test(k.task.kind) && Math.hypot(k.x - TN.SCHOOL_DOOR.x, k.y - TN.SCHOOL_DOOR.y) < 6)) hits.push(h.id + '@' + Math.round(k.x) + ',' + Math.round(k.y));
      if (f.schoolWalk(k) && k.x > 300) { seen.walk++; const [look] = f.lookOf(k), held = f.carryFields(k); if (look === 'kid0_school') seen.pack++; if (held.basket || held.carry) seen.hold++; }
      if (k.task && k.task.kind === 'school-go' && leftAt === null) leftAt = S.t % 1440; if (k.away === 'school' && arrived === null) arrived = S.t % 1440;
      if (k.away || (S.t % 1440) > 11 * 60) break; }
    look(700, 60, 0); hide(); return { bad, far, hits: hits.slice(0, 6), seen, maxX: Math.round(maxX), T: S.t % 1440, kinds, leftAt, arrived, walkMin: arrived !== null && leftAt !== null ? Math.round(arrived - leftAt) : null }; })()`,
    r => r.bad.length ? 'through ' + r.bad.join(' ') : r.far.length ? 'unreached ' + r.far.join(' ') : r.hits.length ? 'kid inside ' + r.hits.join(' ') : !r.seen.walk ? 'no school walk seen' : r.seen.pack !== r.seen.walk ? 'school look ' + JSON.stringify(r.seen) : r.seen.hold ? 'holding on the walk' : r.arrived === null ? 'never reached school' : null);
  // 9. fixtures and (locally) the real saves: they load, keep v15 and draw the new town
  const fixtures = fs.readdirSync(path.join(__dirname, 'fixtures')).filter(n => /^save-.*\.json$/.test(n));
  const saves = fixtures.map(n => [n.replace(/^save-|\.json$/g, ''), path.join(__dirname, 'fixtures', n)]);
  for (const file of [REAL, FRIEND].filter(q => q && fs.existsSync(q))) saves.push([file === REAL ? 'realsave' : 'friendsave', file]);
  const friendDir = path.dirname(FRIEND); if (fs.existsSync(friendDir)) for (const n of fs.readdirSync(friendDir)) { const q = path.join(friendDir, n); if (q !== FRIEND && /\.(json|txt)$/.test(n)) saves.push(['friend_' + n.replace(/\W+/g, '_'), q]); }
  for (const [tag, file] of saves) { let save; try { save = readSave(file); } catch (e) { continue; } if (!save || !save.clock) continue;
    await shot(`v5110_load_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(3, 10); const town = !!(S.eff && S.eff.town);
      f.ensureNav(); const TN = window.PFTown, rects = [...TN.BUILDINGS, ...window.PFHall.LOTS, ...window.PFCareers.LOTS].map(b => [b.x - b.hw + 0.6, b.y - b.hd + 0.6, b.x + b.hw - 0.6, b.y + b.hd - 0.6]);
      const inB = a => a && rects.some(r => a.x > r[0] && a.x < r[2] && a.y > r[1] && a.y < r[3]);
      let stuck = 0; for (let i = 0; i < 40; i++) { f.advance(0.5, 10); stuck += (f.actors ? f.actors() : []).filter(a => a && !a.away && !a.home && inB(a)).length; }
      if (town) look(780, 60, 0); else look(96, 60, 0); hide(); const s2 = f.snapshot();
      return { day: s.clock.day, sv: s2.saveVersion, ver: f.version, town, stuck, built: town ? Object.keys(S.town.hall.built).filter(k => S.town.hall.built[k]).length : 0 }; })()`,
      r => r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.9' ? 'ver ' + r.ver : r.stuck ? 'someone inside a building x' + r.stuck : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
