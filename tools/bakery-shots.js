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

  // 5. v5.11.0.26: milk reserved for a taken bakery order is not poured into the cheese workshop; only one adult walks it; no 「送到门口才发现」 loop
  await shot('v511025_bakery_short.png', `(() => { ${setup} ${houses} f.hallStart('bakery'); nextMorning();
    f.buy('cheese');
    if (!S.works.works.cheese || !S.works.works.cheese.at) {
      const plot = Object.keys(S.plots).find(id => S.plots[id] && !S.works.works.cheese);
      S.works.works.cheese = S.works.works.cheese || { at: plot || 'wbank', slot: 0, inp: 0, left: 0, ready: 0 };
      if (!S.works.works.cheese.at) S.works.works.cheese.at = plot || 'wbank';
    }
    S.works.works.cheese.inp = 0; S.works.works.cheese.ready = 0;
    day(S.day); at(8 * 60);
    const B = S.town.hall.bakery;
    B.offer = [{ id: 'o0', need: [{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }], text: '3 瓶牛奶 + 3 罐蜂蜜', base: 225, pay: 338 },
      { id: 'o1', need: [{ id: 'egg', n: 4 }], text: '4 个鸡蛋', base: 40, pay: 60 }];
    B.take = 'o0'; B.done = 0; B.last = S.day; B.pick = 0; delete B.short;
    for (const a of f.actors()) a.crops.length = 0;
    f.FARMER.crops.push('milk','milk','milk','honey','honey','honey');
    const partner = f.actors().find(a => a.id === 'partner');
    const walkers = [], seen = [];
    const delivered = () => ((S.events || []).some(e => /把 .*送到小桃的面包房/.test(e.msg)));
    for (let i = 0; i < 200 && !delivered(); i++) {
      f.advance(1, 10);
      const bakers = f.actors().filter(a => a.task && a.task.kind === 'bakery' && a.task.label && /送到小桃/.test(a.task.label));
      walkers.push(bakers.length);
      for (const a of bakers) if (!seen.includes(a === f.FARMER ? 'farmer' : a.id)) seen.push(a === f.FARMER ? 'farmer' : a.id);
    }
    at(9 * 60 + 20);
    const msgs = ((S.events || []).map(e => e.msg)).concat(Array.isArray(S.log) ? S.log : []);
    const door = msgs.filter(m => /送到门口才发现原料不够/.test(m));
    const short = msgs.filter(m => /还缺/.test(m) && /再送/.test(m));
    const v = f.bakeryView();
    look(f.BK.STAND.x, f.BK.STAND.y + 4, 0);
    const lb = document.getElementById('leftBottom'); if (lb) lb.style.visibility = 'visible';
    f.refreshUI();
    return { done: !!(v && v.done), take: v && v.take, cheeseIn: S.works.works.cheese && (S.works.works.cheese.inp | 0),
      milkLeft: f.actors().reduce((n, a) => n + a.crops.filter(it => it === 'milk' || (it && it.type === 'milk')).length, 0),
      maxWalkers: Math.max(0, ...walkers), walkers: seen, door: door.length, short: short.length, log: msgs.filter(m => /小桃|门口|还缺|订单/.test(m)).slice(-8) }; })()`,
    r => r.door > 0 ? 'still walks empty-handed: ' + r.door + ' ' + JSON.stringify(r.log)
      : r.maxWalkers > 1 ? 'two adults walked the same order ' + r.maxWalkers
      : !(r.done) ? 'order not delivered ' + JSON.stringify(r)
      : (r.cheeseIn >= 3) ? 'cheese took the bakery milk ' + r.cheeseIn
      : null);

  // 5b. v5.11.0.26: a taken order that is already short is not walked to the door (the live 8-minute retry); the log says once what is missing
  await shot('v511026_bakery_short_wait.png', `(() => { ${setup} ${houses} f.hallStart('bakery'); nextMorning();
    f.buy('mill');
    if (!S.works.works.mill || !S.works.works.mill.at) S.works.works.mill = Object.assign({ at: 'wbank', slot: 2, inp: 0, left: 0, ready: 0 }, S.works.works.mill || {});
    S.works.works.mill.inp = 0; S.works.works.mill.ready = 0;
    for (const id of ['cheese', 'jam', 'pie']) {
      S.works.works[id] = Object.assign({ at: 'wbank', slot: 0, inp: 0, left: 0, ready: 0 }, S.works.works[id] || {});
      S.works.works[id].ready = 0;
    }
    S.works.hives = S.works.hives && S.works.hives.length ? S.works.hives : [{}, {}, {}, {}, {}, {}];
    for (const h of S.works.hives) h.ready = 0;
    day(S.day); at(8 * 60);
    const phantom = f.bakeryCounts();
    const B = S.town.hall.bakery;
    B.offer = [{ id: 'o0', need: [{ id: 'flour', n: 4 }, { id: 'apple', n: 7 }], text: '4 份面粉 + 7 个苹果', base: 324, pay: 486 }];
    B.take = 'o0'; B.done = 0; B.last = S.day; B.pick = 0; delete B.short; delete B._shortLog;
    for (const a of f.actors()) a.crops.length = 0;
    const walkers = [];
    for (let i = 0; i < 40; i++) {
      f.advance(1, 10);
      walkers.push(f.actors().filter(a => a.task && a.task.kind === 'bakery' && a.task.label && /送到小桃/.test(a.task.label)).length);
    }
    at(8 * 60 + 40);
    const msgs = ((S.events || []).map(e => e.msg)).concat(Array.isArray(S.log) ? S.log : []);
    const door = msgs.filter(m => /送到门口才发现原料不够/.test(m));
    const short = msgs.filter(m => /还缺/.test(m) && /再送/.test(m));
    const v = f.bakeryView();
    look(f.BK.STAND.x, f.BK.STAND.y + 4, 0);
    const lb = document.getElementById('leftBottom'); if (lb) lb.style.visibility = 'visible';
    f.refreshUI();
    return { done: !!(v && v.done), take: v && v.take, maxWalkers: Math.max(0, ...walkers), door: door.length, short: short.length,
      phantom, log: msgs.filter(m => /小桃|门口|还缺|订单|面粉/.test(m)).slice(-8) }; })()`,
    r => (r.phantom.flour || r.phantom.cheese || r.phantom.jam || r.phantom.apple_pie || r.phantom.honey)
      ? 'phantom stock ' + JSON.stringify(r.phantom)
      : r.door > 0 ? 'walked empty-handed: ' + r.door + ' ' + JSON.stringify(r.log)
      : r.maxWalkers > 0 ? 'started a delivery while short ' + r.maxWalkers
      : r.done ? 'delivered without stock ' + JSON.stringify(r)
      : r.short !== 1 ? 'short log ' + r.short + ' ' + JSON.stringify(r.log)
      : null);

  // 5c. v5.11.0.27: pull at departure is serialized as bakery.held; a save+reload mid-walk keeps 3 milk+3 honey and pays once
  if (!only || 'v511027_bakery_held_reload.png'.includes(only)) {
    const p = await page();
    let r, mid;
    try {
      mid = await p.evaluate(`(() => { ${setup} ${houses} f.hallStart('bakery'); nextMorning();
        day(S.day); at(8 * 60);
        const typ = it => typeof it === 'string' ? it : (it && it.type);
        const tally = () => {
          const c = { milk: 0, honey: 0 };
          for (const a of f.actors()) for (const it of (a.crops || [])) { const t = typ(it); if (t in c) c[t]++; }
          if (S.works && S.works.hives) for (const h of S.works.hives) c.honey += (h && h.ready) | 0;
          const held = (S.town.hall.bakery && S.town.hall.bakery.held) || [];
          for (const x of held) if (x.id in c) c[x.id] += x.n | 0;
          const B = S.town.hall.bakery || {};
          return { milk: c.milk, honey: c.honey, n: c.milk + c.honey, coins: S.coins, gold: B.gold | 0, done: !!B.done, days: B.days | 0, held: held.map(x => x.id + ':' + x.n), take: B.take };
        };
        const B = S.town.hall.bakery;
        B.offer = [{ id: 'o0', need: [{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }], text: '3 瓶牛奶 + 3 罐蜂蜜', base: 225, pay: 338 }];
        B.take = 'o0'; B.done = 0; B.last = S.day; B.pick = 0; B.gold = 0; B.days = 0; B.extra = 0; delete B.short; delete B.skip; delete B.held;
        for (const a of f.actors()) a.crops.length = 0;
        f.FARMER.crops.push('milk','milk','milk','honey','honey','honey');
        const start = tally();
        const left = until(() => f.actors().some(a => a.task && a.task.kind === 'bakery' && /送到小桃/.test(a.task.label || '')), 200);
        const walking = tally();
        const snap = f.snapshot();
        const compact = PFSave.compact(snap);
        const baked = compact.town && compact.town.hall && compact.town.hall.bakery;
        const pay = f.BK.payOf(B.offer[0].need, ty => f.priceOfAny(ty));
        return { start, walking, left, snap, bakedHeld: baked && baked.held, bakedTake: baked && baked.take, ver: f.version, pay }; })()`);
      if (!mid || !mid.snap) throw new Error('no mid-walk snapshot');
      await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, mid.snap);
      await p.reload();
      await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
      await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
      r = await p.evaluate(({ start, pay }) => {
        const f = __farm, S = f.S;
        const typ = it => typeof it === 'string' ? it : (it && it.type);
        const tally = () => {
          const c = { milk: 0, honey: 0 };
          for (const a of f.actors()) for (const it of (a.crops || [])) { const t = typ(it); if (t in c) c[t]++; }
          if (S.works && S.works.hives) for (const h of S.works.hives) c.honey += (h && h.ready) | 0;
          const held = (S.town.hall.bakery && S.town.hall.bakery.held) || [];
          for (const x of held) if (x.id in c) c[x.id] += x.n | 0;
          const B = S.town.hall.bakery || {};
          return { milk: c.milk, honey: c.honey, n: c.milk + c.honey, coins: S.coins, gold: B.gold | 0, done: !!B.done, days: B.days | 0, held: held.map(x => x.id + ':' + x.n), take: B.take };
        };
        const loaded = tally();
        const delivered = () => ((S.events || []).some(e => /把 .*送到小桃的面包房/.test(e.msg)));
        for (let i = 0; i < 200 && !delivered(); i++) f.advance(1, 10);
        const paid = tally();
        const payLogs = ((S.events || []).map(e => e.msg)).filter(m => /把 .*送到小桃的面包房/.test(m));
        const goldAfterPay = paid.gold;
        S.t = Math.floor(S.t / 1440) * 1440 + 10 * 60 + 40;
        if (f.jumpTo) f.jumpTo('town');
        f.setAngle(0); f.panTo(f.BK.STAND.x, f.BK.STAND.y + 4); f.advance(0.3, 10);
        const lb = document.getElementById('leftBottom'); if (lb) lb.style.visibility = 'visible';
        f.refreshUI(); if (f.render) f.render();
        return { start, loaded, paid, payLogs: payLogs.length, pay, goldAfterPay, ver: f.version, snapPaid: f.snapshot() };
      }, { start: mid.start, pay: mid.pay });
      r.walking = mid.walking; r.bakedHeld = mid.bakedHeld; r.left = mid.left;
      await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, 'v511027_bakery_held_reload.png') });
      const more = await p.evaluate(({ goldAfterPay, pay, snapPaid }) => {
        const f = __farm, S = f.S;
        f.SAVE.off = true;
        f.restore(PFSave.validate(PFSave.compact(snapPaid)));
        f.SAVE.off = true;
        const typ = it => typeof it === 'string' ? it : (it && it.type);
        const tally = () => {
          const c = { milk: 0, honey: 0 };
          for (const a of f.actors()) for (const it of (a.crops || [])) { const t = typ(it); if (t in c) c[t]++; }
          if (S.works && S.works.hives) for (const h of S.works.hives) c.honey += (h && h.ready) | 0;
          const held = (S.town.hall.bakery && S.town.hall.bakery.held) || [];
          for (const x of held) if (x.id in c) c[x.id] += x.n | 0;
          const B = S.town.hall.bakery || {};
          return { milk: c.milk, honey: c.honey, n: c.milk + c.honey, coins: S.coins, gold: B.gold | 0, done: !!B.done, days: B.days | 0, held: held.map(x => x.id + ':' + x.n), take: B.take };
        };
        const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
        const afterPayLoad = tally();
        for (let i = 0; i < 40; i++) f.advance(1, 10);
        const noDouble = tally();
        const B = S.town.hall.bakery;
        const next = () => { const d = S.day; for (let i = 0; i < 3000 && !(S.day > d && S.t % 1440 >= 6 * 60 + 30); i++) f.advance(1, 10); };
        next(); S.t = Math.floor(S.t / 1440) * 1440 + 8 * 60;
        B.offer = [{ id: 'o0', need: [{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }], text: '3 瓶牛奶 + 3 罐蜂蜜', base: 225, pay: 338 }];
        B.take = 'o0'; B.done = 0; B.last = S.day; B.pick = 0; delete B.short; delete B.skip; delete B.held;
        for (const a of f.actors()) a.crops.length = 0;
        f.FARMER.crops.push('milk','milk','milk','honey','honey','honey');
        until(() => f.actors().some(a => a.task && a.task.kind === 'bakery' && /送到小桃/.test(a.task.label || '')), 200);
        const midClose = tally();
        S.t = Math.floor(S.t / 1440) * 1440 + 16 * 60;
        until(() => !f.actors().some(a => a.task && a.task.kind === 'bakery'), 200);
        const closed = tally();
        const closeLog = ((S.events || []).map(e => e.msg)).filter(m => /打烊/.test(m));
        B.offer = [{ id: 'o0', need: [{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }], text: '3 瓶牛奶 + 3 罐蜂蜜', base: 225, pay: 338 }];
        B.take = 'o0'; B.done = 0; B.last = S.day; B.pick = 0; delete B.short; delete B.skip; delete B.held;
        for (const a of f.actors()) a.crops.length = 0;
        f.FARMER.crops.push('milk','milk','milk','honey','honey','honey');
        S.t = Math.floor(S.t / 1440) * 1440 + 8 * 60;
        until(() => f.actors().some(a => a.task && a.task.kind === 'bakery' && /送到小桃/.test(a.task.label || '')), 200);
        const midCancel = tally();
        f.setBakeryPick(1, null);
        const cancelled = tally();
        B.offer = [{ id: 'o0', need: [{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }], text: '3 瓶牛奶 + 3 罐蜂蜜', base: 225, pay: 338 }];
        B.take = 'o0'; B.done = 0; B.last = S.day; B.pick = 0; delete B.short; delete B.skip; delete B.held;
        for (const a of f.actors()) a.crops.length = 0;
        f.FARMER.crops.push('milk','milk','milk','honey','honey','honey');
        S.t = Math.floor(S.t / 1440) * 1440 + 8 * 60;
        until(() => f.actors().some(a => a.task && a.task.kind === 'bakery' && /送到小桃/.test(a.task.label || '')), 200);
        const midRoll = tally();
        const day0 = S.day;
        S.t = (S.day + 1) * 1440 + 7 * 60; S.day = day0 + 1;
        f.bakeryView();
        const rolled = tally();
        return { afterPayLoad, noDouble, midClose, closed, closeLog: closeLog.length, midCancel, cancelled, midRoll, rolled };
      }, { goldAfterPay: r.goldAfterPay, pay: r.pay, snapPaid: r.snapPaid });
      delete r.snapPaid;
      Object.assign(r, more);
    } catch (e) { r = { error: String(e).slice(0, 400) }; if (r && !r.loaded) await p.screenshot({ path: path.join(OUT, 'v511027_bakery_held_reload.png') }).catch(() => {}); }
    const bad = r && r.error ? r.error : (!r.left ? 'never left with the basket'
      : (r.walking && r.walking.n !== 6) || (r.walking && !(r.walking.held && r.walking.held.length)) ? 'cargo not serialized at departure ' + JSON.stringify(r.walking)
      : !r.bakedHeld || r.bakedHeld.length < 2 ? 'compact save dropped held ' + JSON.stringify(r.bakedHeld)
      : r.loaded.n !== 6 || r.loaded.milk !== 3 || r.loaded.honey !== 3 ? 'lost cargo on reload ' + JSON.stringify(r.loaded)
      : r.loaded.gold !== 0 || r.loaded.done ? 'paid before arrival ' + JSON.stringify(r.loaded)
      : r.paid.n !== 0 || !r.paid.done || r.paid.gold !== r.pay ? 'live delivery after reload ' + JSON.stringify(r.paid)
      : r.payLogs !== 1 ? 'payout log ' + r.payLogs
      : r.afterPayLoad.gold !== r.pay || r.noDouble.gold !== r.pay ? 'duplicate payout ' + JSON.stringify({ afterPayLoad: r.afterPayLoad, noDouble: r.noDouble })
      : r.midClose.n !== 6 || r.closed.n !== 6 || r.closed.held.length || r.closed.gold !== r.pay || !r.closeLog ? 'close did not return cargo ' + JSON.stringify({ midClose: r.midClose, closed: r.closed, closeLog: r.closeLog })
      : r.midCancel.n !== 6 || r.cancelled.n !== 6 || r.cancelled.held.length || r.cancelled.take || r.cancelled.gold !== r.pay ? 'cancel did not return cargo ' + JSON.stringify({ midCancel: r.midCancel, cancelled: r.cancelled })
      : r.midRoll.n !== 6 || r.rolled.n !== 6 || r.rolled.held.length || r.rolled.gold !== r.pay ? 'rollover did not return cargo ' + JSON.stringify({ midRoll: r.midRoll, rolled: r.rolled })
      : null);
    console.log(bad ? 'FAIL' : 'ok  ', 'v511027_bakery_held_reload.png', JSON.stringify(r).slice(0, 900)); if (bad) fails.push('v511027_bakery_held_reload.png: ' + bad);
    await p.context().close();
  }

  // 6. fixtures load: hall gains an empty bakery, save version stays 15, decorations keep their counts (layout flag 2)
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    const want = {}; for (const p0 of (save.decor && save.decor.placed) || []) want[p0.id] = (want[p0.id] || 0) + 1; for (const [k, v] of Object.entries((save.decor && save.decor.inv) || {})) want[k] = (want[k] || 0) + v;
    await shot(`v5104_fixture_${fx}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10);
      const c = {}; for (const p of S.decor.placed) c[p.id] = (c[p.id] || 0) + 1; for (const [k, v] of Object.entries(S.decor.inv)) c[k] = (c[k] || 0) + v;
      look(96, 60, 0);
      const s2 = f.snapshot();
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, bakery: s2.town.hall.bakery, layout: s2.settings.decorLayout, counts: c }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.11.0.32' ? 'ver ' + r.ver : !r.bakery || r.bakery.pick !== 0 ? 'bakery ' + JSON.stringify(r.bakery) : r.layout !== 2 ? 'layout ' + r.layout : JSON.stringify(Object.entries(r.counts).sort()) !== JSON.stringify(Object.entries(want).sort()) ? 'counts' : null, save);
  }

  // 7. (local only) the real save and the friend's save load, decorations keep their counts, lamps use the wider spots
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

  // 8. (local only) real-save lamps after the wider layout, day and night, looking at the field and 阿禾's stall
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) {
    const save = readSave(process.env.PF_REAL_SAVE);
    for (const [when, T] of [['', 11 * 60], ['_night', 21 * 60 + 30]]) await shot(`v5104_lamps${when}.png`, `(() => { ${helpers} f.advance(1, 10); at(${T}); dry(); f.advance(1, 10); look(120, 80, 0); hide();
      const lamps = S.decor.placed.filter(p => p.id === 'lamppost' || p.id === 'stonelamp');
      return { n: lamps.length, layout: f.snapshot().settings.decorLayout, t: S.t % 1440 }; })()`,
      r => r.layout !== 2 ? 'layout' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
