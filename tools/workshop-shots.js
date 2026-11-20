// Screenshots + browser checks for v5.10.6 (木工坊 + 铁匠铺):  node tools/workshop-shots.js [name-filter]
//   writes /workspace/pf-shots/v5105_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
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
  const readyTown = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); } S.coins = Math.max(S.coins, 200000); f.FARMER.wood = 800; const manor = f.buy('house'); if (!manor.ok) throw new Error('manor: ' + JSON.stringify(manor)); f.FARMER.wood = 800; for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' wood=' + f.FARMER.wood + ' cap=' + f.woodCap()); nextMorning(); at(9 * 60); } f.FARMER.wood = 800;`;
  const shot = async (name, fn, check, save) => { if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 800)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. both shops go up: scaffolding, then the finished buildings with 阿松 and 阿锤 at work, timber at the door
  await shot('v5105_shops_build.png', `(() => { ${setup} ${readyTown}
    const lockW = f.hallView().projects.find(p => p.id === 'woodshop').why, lockS = f.hallView().projects.find(p => p.id === 'smithy').why;
    const c0 = S.coins, w0 = f.FARMER.wood, rW = f.hallStart('woodshop'); if (!rW.ok) return { rW, built: S.town.hall.built, job: S.town.hall.job };
    const paidW = c0 - S.coins, woodW = w0 - f.FARMER.wood;
    nextMorning(); at(9 * 60); const c1 = S.coins, w1 = f.FARMER.wood, rS = f.hallStart('smithy');
    const paidS = c1 - S.coins, woodS = w1 - f.FARMER.wood;
    nextMorning(); at(10 * 60); f.advance(2, 10);
    until(() => { const a = f.NEIGH.find(q => q.id === 'n2'), h = f.NEIGH.find(q => q.id === 'n8');
      return a && a.spot === 'woodshop' && !a.moving && h && h.spot === 'smithy' && !h.moving; }, 1000);
    look(680, 186, 0); hide();
    const song = f.NEIGH.find(q => q.id === 'n2'), hammer = f.NEIGH.find(q => q.id === 'n8');
    const props = (f.props || []).filter(q => q.town === 'woodshop' || q.town === 'smithy' || q.town === 'timber' || q.town === 'anvil').map(q => q.town);
    return { lockW, lockS, rW, rS, paidW, woodW, paidS, woodS, cap: f.woodCap(), lv: f.hallView().lv,
      song: song && { spot: song.spot, x: Math.round(song.x), y: Math.round(song.y) },
      hammer: hammer && { spot: hammer.spot, out: hammer.out, name: hammer.name },
      props, log: S.events.map(e => e.msg).filter(m => /木工坊|铁匠铺|上限/.test(m)).slice(0, 6) }; })()`,
    r => r.lockW || r.lockS ? 'still locked ' + r.lockW + '/' + r.lockS
      : !r.rW.ok || !r.rS.ok ? 'start ' + JSON.stringify(r)
      : r.paidW !== 20000 || r.woodW !== 300 ? 'woodshop cost ' + r.paidW + '/' + r.woodW
      : r.paidS !== 35000 || r.woodS !== 100 ? 'smithy cost ' + r.paidS + '/' + r.woodS
      : r.cap !== 1200 ? 'cap ' + r.cap
      : r.lv !== 3 ? 'lv ' + r.lv
      : !r.song || r.song.spot !== 'woodshop' ? '阿松 ' + JSON.stringify(r.song)
      : !r.hammer || r.hammer.spot !== 'smithy' ? '阿锤 ' + JSON.stringify(r.hammer)
      : !(r.props.includes('woodshop') && r.props.includes('smithy') && r.props.includes('timber') && r.props.includes('anvil')) ? 'props ' + r.props
      : null);

  // 2. the same shops at night: windows, forge glow, chimney smoke
  await shot('v5105_shops_night.png', `(() => { ${setup} ${readyTown}
    f.hallStart('woodshop'); nextMorning(); f.hallStart('smithy'); nextMorning();
    at(21 * 60); dry(); f.advance(2, 10); look(680, 186, 0); hide();
    const lights = (f.litBuilds && f.litBuilds().length) || 0;
    const glow = f.HL.lightsAt(S.town.hall, S.t, window.PFDecor && window.PFDecor.CATALOG).some(l => l.r >= 18);
    const smoke = f.TA.smoke ? f.TA.smoke().length : 0;
    return { built: !!(S.town.hall.built.woodshop && S.town.hall.built.smithy), t: S.t % 1440, lights, glow, smoke }; })()`,
    r => !r.built ? 'not built' : r.t < 20 * 60 ? 'not night' : r.smoke < 2 ? 'smoke ' + r.smoke : !r.glow ? 'no forge glow' : null);

  // 3. the board: woodshop auto toggle and the five smithy upgrades
  await shot('v5105_smithy_upgrades.png', `(() => { ${setup} ${readyTown}
    f.hallStart('woodshop'); nextMorning(); f.hallStart('smithy'); nextMorning(); at(10 * 60); f.advance(1, 10);
    f.refreshUI(); f.openHall(); f.refreshUI();
    const sh = document.getElementById('shop');
    const card = sh.querySelector('[data-item="smithy:water"]') || sh.querySelector('[data-item^="smithy:"]'); if (card) card.scrollIntoView();
    const v = f.smithyView(), w = f.woodshopView();
    const sm = [...sh.querySelectorAll('[data-sm]')].map(el => el.getAttribute('data-sm') + ':' + el.textContent.trim());
    const ws = [...sh.querySelectorAll('[data-ws]')].map(el => el.getAttribute('data-ws') + ':' + el.textContent.trim());
    const txt = sh.innerText;
    return { v, w, sm, ws, txt: /铁匠铺升级/.test(txt) && /木工坊/.test(txt) && /浇水器加长/.test(txt) && /集市手推车/.test(txt) }; })()`,
    r => !r.w || r.w.auto !== 1 || r.w.bonus !== 400 ? 'woodshop ' + JSON.stringify(r.w)
      : !r.v || r.v.items.length !== 5 ? 'upgrades ' + JSON.stringify(r.v)
      : r.v.items.some(u => u.maxed || !u.cost) ? 'already bought'
      : !r.txt ? 'card missing'
      : r.sm.filter(s => s.startsWith('buy:')).length !== 5 ? 'buttons ' + r.sm
      : null);

  // 4. buying one upgrade spends gold, changes the effect, and is refused a second time; autobuy still ignores it
  await shot('v5105_smithy_bought.png', `(() => { ${setup} ${readyTown}
    f.hallStart('woodshop'); nextMorning(); f.hallStart('smithy'); nextMorning(); at(10 * 60);
    const c0 = S.coins, r = f.smithyBuy('water'), paid = c0 - S.coins;
    const e = S.eff.sprReach, again = f.smithyBuy('water');
    const auto = f.autoBuyAtStall && (S.autoBuy = true, f.autoBuyAtStall());
    f.refreshUI(); f.openHall(); f.refreshUI();
    const sh = document.getElementById('shop'); const card = sh.querySelector('[data-item="smithy:water"]'); if (card) card.scrollIntoView();
    return { r, paid, reach: e, again, auto, have: f.smithyView().items.find(u => u.id === 'water') }; })()`,
    r => !r.r.ok || r.paid !== 12000 ? 'buy ' + JSON.stringify(r.r) + ' paid ' + r.paid
      : r.reach !== 24 ? 'reach ' + r.reach
      : r.again.ok ? 'bought twice'
      : !r.have || !r.have.maxed ? 'not maxed'
      : null);

  // 5. fixtures load: hall gains empty woodshop + smithy, save version stays 15, decorations keep their counts
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5105_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10);
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, woodshop: s2.town.hall.woodshop, smithy: s2.town.hall.smithy, bakery: s2.town.hall.bakery, cap: f.woodCap(), counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.4' ? 'ver ' + r.ver
        : !r.woodshop || r.woodshop.auto !== 1 ? 'woodshop ' + JSON.stringify(r.woodshop)
        : !r.smithy || r.smithy.up.axe !== 0 ? 'smithy ' + JSON.stringify(r.smithy)
        : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts' : null, save);
  }

  // 6. (local only) the real save and the friend's save load, decorations keep their counts
  for (const REAL of [process.env.PF_REAL_SAVE, process.env.PF_FRIEND_SAVE].filter(Boolean)) if (fs.existsSync(REAL)) {
    const save = readSave(REAL), tag = REAL === process.env.PF_REAL_SAVE ? 'realsave' : 'friendsave';
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5105_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); at(11 * 60); dry(); look(96, 70, 0); hide();
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      const s2 = f.snapshot();
      return { day: s.clock.day, town: !!(S.eff && S.eff.town), woodshop: s2.town.hall.woodshop, smithy: s2.town.hall.smithy, cap: f.woodCap(), counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts changed' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
