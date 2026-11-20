// Screenshots + browser checks for v5.10.4 (面包房 + 订单板; wider lamp spacing):  node tools/bakery-shots.js [name-filter]
//   writes /workspace/pf-shots/v5104_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
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
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden'; };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 12 }] }); f.syncFamily(); dry();`;
  const houses = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { f.hallStart(id); nextMorning(); at(9 * 60); } f.FARMER.wood = 400;`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. the bakery goes up on lot L6: scaffolding the first day, 小桃's shop the next morning
  await shot('v5104_bakery_build.png', `(() => { ${setup} ${houses} const lock0 = f.hallView().projects.find(p => p.id === 'bakery').why;
    const c0 = S.coins, w0 = f.FARMER.wood, r = f.hallStart('bakery'); if (!r.ok) return { r, built: S.town.hall.built, job: S.town.hall.job };
    const paid = c0 - S.coins, wood = w0 - f.FARMER.wood, up = !!(f.props || []).find(q => q.town === 'bakery');
    nextMorning(); at(10 * 60); f.advance(2, 10);
    until(() => { const t = f.NEIGH.find(q => q.id === 'n3'); return t && t.spot === 'bakery' && !t.moving && Math.hypot(t.x - f.BK.STAND.x, t.y - f.BK.STAND.y) < 4; }, 800);
    look(664, 186, 0); hide();
    const tao = f.NEIGH.find(q => q.id === 'n3');
    return { lock0, r, paid, wood, up, built: S.town.hall.built.bakery, lv: f.hallView().lv, tao: tao && { spot: tao.spot, out: tao.out, x: Math.round(tao.x), y: Math.round(tao.y) },
      log: S.events.map(e => e.msg).filter(m => /面包房|订单板/.test(m)).slice(0, 4) }; })()`,
    r => !r.r.ok ? 'start ' + JSON.stringify(r.r) : r.paid !== 25000 || r.wood !== 150 ? 'cost ' + r.paid + '/' + r.wood : !r.built ? 'not built' : r.lv < 2 ? 'lv ' + r.lv : !r.tao || r.tao.spot !== 'bakery' ? '小桃 ' + JSON.stringify(r.tao) : null);

  // 2. the same shop at night (windows and the street lamps)
  await shot('v5104_bakery_night.png', `(() => { ${setup} ${houses} f.hallStart('bakery'); nextMorning(); at(21 * 60); dry(); f.advance(1, 10); look(664, 186, 0); hide();
    return { built: !!S.town.hall.built.bakery, t: S.t % 1440, lights: (f.litBuilds && f.litBuilds().length) || 0 }; })()`,
    r => !r.built ? 'not built' : r.t < 20 * 60 ? 'not night' : null);

  // 3. the board: the order card, 「我来挑」, both of today's orders listed
  await shot('v5104_orders_board.png', `(() => { ${setup} ${houses} f.hallStart('bakery'); nextMorning(); at(9 * 60); f.advance(1, 10);
    f.refreshUI(); f.openHall(); f.refreshUI();
    const sh = document.getElementById('shop'); sh.querySelector('[data-bk="mode"]').click(); f.refreshUI();
    const card = sh.querySelector('[data-item="bakery"]'); if (card) card.scrollIntoView();
    const v = f.bakeryView(), btns = [...sh.querySelectorAll('[data-bk]')].map(el => el.getAttribute('data-bk') + ':' + el.textContent.trim());
    return { v, btns, txt: sh.innerText.includes('面包房订单') && sh.innerText.includes('我来挑') }; })()`,
    r => !r.v || r.v.offer.length !== 2 ? 'offers ' + JSON.stringify(r.v) : !r.v.pick ? 'not 我来挑' : !r.txt ? 'card missing' : r.btns.filter(s => s.startsWith('take:')).length !== 2 ? 'buttons ' + r.btns : null);

  // 4. a grown-up walks the accepted order to 小桃 and the log records it
  await shot('v5104_deliver.png', `(() => { ${setup} ${houses} f.hallStart('bakery'); nextMorning(); day(S.day); at(8 * 60);
    const v0 = f.bakeryView(); const o = (v0.offer.find(q => q.pay === Math.max(...v0.offer.map(x => x.pay))) || v0.offer[0]);
    f.FARMER.crops.length = 0; for (const x of o.need) for (let i = 0; i < x.n; i++) f.FARMER.crops.push(x.id);
    const fav0 = (S.home.nb && S.home.nb.n3) || 0;
    at(8 * 60); f.advance(1, 10); until(() => S.events.some(e => /送到小桃的面包房/.test(e.msg)), 1200);
    until(() => { const a = f.actors().find(q => q.task && q.task.kind === 'bakery'); return !a; }, 200);
    at(10 * 60); f.advance(2, 10); look(664, 186, 0); hide();
    const v = f.bakeryView(), tao = f.NEIGH.find(q => q.id === 'n3');
    return { offer: o.text, pay: o.pay, gold: v && v.gold, days: v && v.days, done: v && v.done, extra: v && v.extra, fav: ((S.home.nb && S.home.nb.n3) || 0) - fav0,
      tao: tao && tao.spot, log: S.events.map(e => e.msg).filter(m => /面包房|订单/.test(m)).slice(0, 5) }; })()`,
    r => !(r.done && r.days >= 1) ? 'not delivered ' + JSON.stringify(r) : r.gold !== r.pay ? 'pay ' + r.gold + ' vs ' + r.pay : r.fav !== 3 ? 'favor ' + r.fav : !r.log.some(m => /送到小桃的面包房/.test(m)) ? 'log ' + r.log : null);

  // 5. fixtures load: hall gains an empty bakery, save version stays 15, decorations keep their counts (layout flag 2)
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5104_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10);
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, bakery: s2.town.hall.bakery, layout: s2.settings.decorLayout, counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.14' ? 'ver ' + r.ver : !r.bakery || r.bakery.pick !== 0 ? 'bakery ' + JSON.stringify(r.bakery) : r.layout !== 2 ? 'layout ' + r.layout : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts' : null, save);
  }

  // 6. (local only) the real save and the friend's save load, decorations keep their counts, lamps use the wider spots
  for (const REAL of [process.env.PF_REAL_SAVE, process.env.PF_FRIEND_SAVE].filter(Boolean)) if (fs.existsSync(REAL)) {
    const save = readSave(REAL), tag = REAL === process.env.PF_REAL_SAVE ? 'realsave' : 'friendsave';
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5104_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); at(11 * 60); dry(); look(96, 70, 0); hide();
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      const lamps = S.decor.placed.filter(p => p.id === 'lamppost' || p.id === 'stonelamp');
      const south = lamps.filter(p => Math.abs(p.y - 101.5) < 1).sort((a, b) => a.x - b.x);
      const stallD = lamps.map(p => Math.hypot(p.x - 160, p.y - 100)).sort((a, b) => a - b);
      const s2 = f.snapshot();
      return { day: s.clock.day, town: !!(S.eff && S.eff.town), bakery: s2.town.hall.bakery, layout: s2.settings.decorLayout, counts: c, south: south.map(p => [p.x, p.y]), nearStall: stallD[0] }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.layout !== 2 ? 'layout ' + r.layout : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts changed' : (r.south.length >= 2 && Math.abs(r.south[0][0] - r.south[r.south.length - 1][0]) < 48) ? 'south still tight ' + JSON.stringify(r.south) : (r.nearStall < 28) ? 'lamp hugging the stall ' + r.nearStall : null, save);
  }

  // 7. (local only) real-save lamps after the wider layout, day and night, looking at the field and 阿禾's stall
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) {
    const save = readSave(process.env.PF_REAL_SAVE);
    for (const [when, T] of [['', 11 * 60], ['_night', 21 * 60 + 30]]) await shot(`v5104_lamps${when}.png`, `(() => { ${helpers} f.advance(1, 10); at(${T}); dry(); f.advance(1, 10); look(120, 80, 0); hide();
      const lamps = S.decor.placed.filter(p => p.id === 'lamppost' || p.id === 'stonelamp');
      return { n: lamps.length, layout: f.snapshot().settings.decorLayout, t: S.t % 1440 }; })()`,
      r => r.layout !== 2 ? 'layout' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
