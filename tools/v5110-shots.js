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
    r => r.ver !== '5.11.0' ? 'ver ' + r.ver : r.world[1] !== 1008 ? 'world ' + r.world : !r.open ? 'town shut' : r.lv < 5 ? 'lv ' + r.lv : null, null, { viewport: { width: 1600, height: 1000 }, query: '&view=800x500' });
  // 2. a house beside the farmer, for scale (old one-storey and a two-storey side by side)
  await shot('v5110_scale.png', `(() => { ${setup} openTown(); at(9 * 60); start('L11'); nextMorning(); at(10 * 60);
    f.FARMER.x = 947; f.FARMER.y = 52; f.FARMER.task = null; look(944, 34, 0); hide(); const r = ${facts};
    r.farmerPx = 24; r.houseRatio = +((r.houseH + 14 * 2 * 0.75) / 24).toFixed(2); r.twoRatio = +((r.twoH + 16 * 2 * 0.75) / 24).toFixed(2); return r; })()`,
    r => r.houseH < 40 || r.twoH < 58 ? 'too small ' + r.houseH + '/' + r.twoH : null, null, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
