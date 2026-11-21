// Screenshots + browser checks for v5.11.0.12 (菜馆供餐: guestbook no longer repeats 「今天的菜不够」,
// the shop panel names a shortfall and shows the kitchen garden). 
//   node tools/restaurant-shots.js [name-filter]
//   writes /workspace/pf-shots/restaurant_*.png (PF_SHOTS to change)
//   exits 1 on a page error, a console error or a failed check
// Never loads a real player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page() { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, IN = f.IN;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden'; };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coop','chicken','can','can']) f.buy(id);
    f.buyPlot('eroad', 'road'); f.buy('town');
    day(118); at(7 * 60);
    Object.assign(S.inn, { cabins: 4, inn2: 1, job: null, arrived: 117, _morn: 117, walkins: 0 });
    S.inn.diner.lv = 3; S.inn.diner.menu = 'auto'; S.inn.diner.served = 200; S.inn.diner.missed = 40;
    S.animals.forEach(a => { a.h = 90; });`;
  const shopText = `(() => { const shop = document.getElementById('shop'); return shop ? shop.innerText.replace(/\\s+/g, ' ') : ''; })()`;
  const shot = async (name, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page(); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 1000)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. the shop guestbook after a short day: one line per day, the note names the missing ingredient
  await shot('restaurant_guestbook.png', `(() => { ${setup}
    S.inn.diner.last = 117; S.inn.diner.missedLast = 4; S.inn.diner.servedLast = 28; S.inn.diner.short = ['cabbage', 'flour']; S.inn.diner.dishLast = 'garden_veg';
    S.inn.guests = [
      { id: 'g1160', look: 'innA', n: 2, room: 0, from: 116, until: 118, at: 600, stay: 'inn' },
      { id: 'g1161', look: 'innB', n: 2, room: 1, from: 116, until: 118, at: 620, stay: 'inn' },
      { id: 'g1162', look: 'innC', n: 3, room: 2, from: 116, until: 118, at: 640, stay: 'inn' },
    ];
    // leftover identical rows from the old lifetime-missed bug (days 116–117)
    S.inn.stars.last = [];
    for (let i = 0; i < 4; i++) S.inn.stars.last.push({ day: 116, s: 3, note: '今天的菜不够' });
    for (let i = 0; i < 3; i++) S.inn.stars.last.push({ day: 117, s: 3, note: '今天的菜不够' });
    S.inn.stars.avg = 3;
    f.innMorning();
    const L = f.innLayout(); if (L) look(L.diner.x, L.diner.y + 8, 0);
    hide(); f.openInn && f.openInn(); f.refreshUI();
    const shop = document.getElementById('shop');
    const el = shop && [...shop.querySelectorAll('.sec, .more')].find(e => /菜馆菜单|留言本/.test(e.textContent));
    if (el) el.scrollIntoView({ block: 'start' });
    const v = f.innView();
    const book = v.book || [];
    return { day: S.day, text: ${shopText}.slice(0, 1200), book, nBook: book.length, notes: book.map(b => [b.day, b.n || 1, b.note]), last: v.lastMeal, cap: v.cookCap, garden: v.garden }; })()`,
    r => !r.book ? 'no book'
      : r.nBook > 3 ? 'still listing every group: ' + r.nBook + ' ' + JSON.stringify(r.notes)
      : !r.notes.some(n => n[0] === 118 && n[1] >= 3 && /缺/.test(n[2]) && /卷心菜|面粉/.test(n[2])) ? 'day 118 not merged / not named: ' + JSON.stringify(r.notes)
      : !r.notes.some(n => n[0] === 116 && n[1] >= 4) ? 'old identical rows not collapsed: ' + JSON.stringify(r.notes)
      : (r.text.match(/今天的菜不够/g) || []).length > 3 ? 'shop still repeats the same line'
      : r.cap !== 36 ? 'cook cap ' + r.cap
      : null);

  // 2. the restaurant panel on a fully served day: kitchen cap, garden yield, last sitting, no 菜不够
  await shot('restaurant_panel.png', `(() => { ${setup}
    at(12 * 60);
    S.inn.diner.last = 118; S.inn.diner.missedLast = 0; S.inn.diner.servedLast = 32; delete S.inn.diner.short; S.inn.diner.dishLast = 'cabbage_egg';
    S.inn.stars.last = [{ day: 116, s: 4, note: '羊好软', n: 2 }, { day: 117, s: 5, note: '南瓜饼好吃', n: 3 }, { day: 118, s: 5, note: '卷心菜炒蛋很香', n: 3 }];
    S.inn.stars.avg = 4.7;
    S.inn.guests = [{ id: 'g1180', look: 'innD', n: 2, room: 0, from: 118, until: 120, at: 650, stay: 'inn' }];
    const L = f.innLayout(); if (L) look(L.diner.x, L.diner.y + 6, 0.2);
    hide(); f.openInn && f.openInn(); f.refreshUI();
    const shop = document.getElementById('shop');
    const el = shop && [...shop.querySelectorAll('.sec, .more')].find(e => /菜馆菜单|留言本/.test(e.textContent));
    if (el) el.scrollIntoView({ block: 'start' });
    const v = f.innView();
    return { text: ${shopText}.slice(0, 1400), cap: v.cookCap, garden: v.garden, last: v.lastMeal, book: (v.book || []).map(b => [b.day, b.n || 1, b.note]), dishes: v.dishes, seats: v.seats }; })()`,
    r => r.cap !== 36 ? 'cap ' + r.cap
      : r.seats !== 12 ? 'seats ' + r.seats
      : r.garden.greens !== 24 ? 'garden ' + JSON.stringify(r.garden)
      : r.last.served !== 32 || r.last.missed !== 0 ? 'last meal ' + JSON.stringify(r.last)
      : !/每天最多做 36 份/.test(r.text) ? 'no cap line'
      : !/时蔬 24 份/.test(r.text) ? 'no garden line'
      : !/做了 32 份/.test(r.text) ? 'no last sitting line'
      : /菜不够/.test(r.text) ? 'still says 菜不够 on a full day'
      : r.book.length !== 3 ? 'book ' + JSON.stringify(r.book)
      : null);

  console.log('\n' + (fails.length ? fails.length + ' failed' : 'shots ok'));
  if (errs.length) { console.log('page/console errors:'); errs.forEach(e => console.log(' ', e.slice(0, 300))); }
  await b.close(); server.close();
  if (fails.length || errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
