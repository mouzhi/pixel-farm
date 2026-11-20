// v5.10.11.1 regression: paid-for road pieces (石子小路 / 石板路) and other family-built purchases must show up.
//   node tools/fixroad-shots.js [name-filter]   writes /workspace/pf-shots/fixroad_*.png (PF_SHOTS to change)
// A player report: "修路，钱花了，路好像没修". The yard pieces were a priority-42 job that a busy farm never got to (the
// friend's day-73 save left a bought piece unbuilt for 6+ days). Checks: a fresh game buying through the shop UI, a buy
// at night (done by morning), a save that already paid for unbuilt pieces (built on load), the 东大道 hint, and (local
// only, PF_FRIEND_SAVE / PF_REAL_SAVE) the busy real farms finishing the same day. PF_ROOT / PF_TAG run it on another
// checkout (the "before" shots). Exits 1 on a page error, a console error or a failed check.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG ? process.env.PF_TAG + '_' : '';
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
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    if (save) { save = Object.assign({}, save, { savedAt: Date.now() }); // no offline days: the clock stays where the save left it
      await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const tod = () => S.t % 1440;
    const toTime = m => until(() => tod() >= m && tod() < m + 25 && !f.FARMER.sleeping, 4000); // let the clock run there (people wake and sleep properly)
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { const say = document.getElementById('say'); if (say) { say.hidden = true; say.textContent = ''; } };
    const pend = () => f.YD.IDS.filter(id => (S.up[id] | 0) > (S.homeyard.put[id] | 0)).map(id => id + ':' + (S.homeyard.put[id] | 0) + '/' + S.up[id]);
    const logs = re => S.events.map(e => e.msg).filter(m => re.test(m)).slice(0, 6);
    const paveAt = (x, y) => f.YD.paveAt(S.homeyard.put, x, y);`;
  const shot = async (name, fn, check, save, after) => { name = 'fixroad_' + TAG + name; if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); if (after) r = Object.assign(r || {}, await after(p, r)); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. a new game, bought the way a player does it: shop → 院子 → 石子小路 four times. The log and the bubble say who
  //    builds it and when, the card shows what is still waiting, the camera goes to the door; then the family lays it.
  await shot('fresh_shop.png', `(() => { ${helpers} S.coins = 400; f.refreshUI && f.refreshUI(); return { day: S.day, t: tod() }; })()`, r => r.ui && r.ui.paid !== 160 ? 'paid ' + r.ui.paid : r.ui && !/家人/.test(r.ui.say || '') ? 'no bubble ' + JSON.stringify(r.ui) : r.ui && !/还没弄好/.test(r.ui.card || '') ? 'card ' + r.ui.card : null, null,
    async p => { const c0 = await p.evaluate(() => __farm.S.coins);
      await p.click('#shopBtn').catch(() => p.keyboard.press('b')); await p.waitForTimeout(200);
      await p.click('[data-tab="yard"]'); await p.waitForTimeout(150);
      for (let i = 0; i < 4; i++) { await p.click('[data-buy="gravel"]'); await p.waitForTimeout(120); }
      const ui = await p.evaluate(c0 => { const S = __farm.S, card = document.querySelector('[data-item="gravel"]'), say = document.getElementById('say');
        return { paid: c0 - S.coins, up: S.up.gravel, put: S.homeyard.put.gravel | 0, card: card ? card.textContent.replace(/\\s+/g, ' ').slice(0, 120) : null, say: say && !say.hidden ? say.textContent : null, cam: [Math.round(__farm.cam.x), Math.round(__farm.cam.y)], log: __farm.S.events.map(e => e.msg).filter(m => /石子/.test(m)).slice(0, 3) }; }, c0);
      return { ui }; });
  await shot('fresh_built.png', `(() => { ${helpers} S.coins = 400; const c0 = S.coins; for (let i = 0; i < 4; i++) f.buy('gravel'); const t0 = S.t;
      until(() => (S.homeyard.put.gravel | 0) >= 4, 400); const mins = S.t - t0;
      look(70, 50, 0.25); hide();
      return { paid: c0 - S.coins, put: S.homeyard.put.gravel | 0, mins, pave: [paveAt(36, 44), paveAt(48, 54), paveAt(120, 54)], log: logs(/石子/) }; })()`,
    r => r.paid !== 160 ? 'paid ' + r.paid : r.put !== 4 ? 'not built ' + r.put : r.mins > 4 * 60 ? 'slow ' + r.mins : r.pave[0] !== 'gravel' || r.pave[1] !== 'gravel' ? 'pave ' + r.pave : null);

  // 2. bought after dark: nothing is left waiting by the next morning (it used to wait for a free hand after 6:00)
  for (const [fx, fn] of [['day59', 'save-v10-day59-manor.json'], ['day72', 'save-v15-day72-cottage.json']]) {
    const file = path.join(__dirname, 'fixtures', fn); if (!fs.existsSync(file)) continue; const save = readSave(file);
    await shot(`night_${fx}.png`, `(() => { ${helpers} toTime(20 * 60); S.coins += 5000; f.FARMER.wood += 40; const d = S.day;
      const r = ['gravel', 'gravel', 'gravel', 'flag', 'flag', 'mailbox'].map(id => f.buy(id).ok);
      until(() => S.day > d, 4000); const morning = tod(), wait = pend();
      look(70, 50, 0.25); hide();
      return { r, day: S.day, morning, wait, put: S.homeyard.put, said: logs(/天黑了/).length, log: logs(/天亮前/) }; })()`,
      r => r.r.some(x => !x) ? 'buy ' + r.r : r.wait.length ? 'still waiting in the morning ' + r.wait : !r.said ? 'no night note on buying' : !r.log.length ? 'no catch-up line' : null, save);
  }

  // 3. a save from an older version that already paid for pieces nobody laid (the player's case): built when it loads
  { const file = path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json');
    if (fs.existsSync(file)) { const save = JSON.parse(JSON.stringify(readSave(file)));
      Object.assign(save.upgrades, { gravel: 12, flag: 4, mailbox: 1, sprinkler: (save.upgrades.sprinkler | 0) + 1 }); save.homeyard = { put: { gravel: 2 } };
      await shot('reload_stranded.png', `(() => { ${helpers} const put = Object.assign({}, S.homeyard.put), wait = pend(); f.advance(0.5, 10); look(96, 50, 0.25); hide();
        return { put, wait, spr: [S.works.sprinklers.length, S.eff.sprinkler], pave: [paveAt(36, 44), paveAt(100, 54), paveAt(130, 54)], log: logs(/之前买好|浇水器/) }; })()`,
        r => r.put.gravel !== 12 || r.put.flag !== 4 || r.put.mailbox !== 1 ? 'not built on load ' + JSON.stringify(r.put) : r.wait.length ? 'waiting ' + r.wait : r.spr[0] < r.spr[1] ? 'sprinkler ' + r.spr : r.pave[0] !== 'flag' || r.pave[1] !== 'gravel' ? 'pave ' + r.pave : !r.log.length ? 'no log' : null, save);
      // and it stays built after another save / load round trip
      await shot('reload_again.png', `(() => { ${helpers} const s = f.snapshot(); return { hy: s.homeyard, up: [s.upgrades.gravel, s.upgrades.flag] }; })()`,
        r => !r.hy || r.hy.put.gravel !== 12 || r.hy.put.flag !== 4 ? 'saved ' + JSON.stringify(r.hy) : null, save);
    } }

  // 4. 东大道 bought as 大道: the road is drawn and the log says the town gate is the next step
  await shot('eroad.png', `(() => { ${helpers} S.coins = 900000; f.FARMER.wood = 500; S.family.met = 1; S.family.moved = 1;
      for (const id of ['axe', 'forest', 'east', 'orchard', 'south', 'pasture', 'coast']) f.buy(id);
      const before = [], after = []; for (let x = 370; x <= 440; x += 10) before.push(f.groundAt(x, 66)[1]);
      const c0 = S.coins, r = f.buyPlot('eroad', 'road'); for (let x = 370; x <= 440; x += 10) after.push(f.groundAt(x, 66)[1]);
      look(400, 66, 0); hide(); return { ok: r.ok, paid: c0 - S.coins, before, after, log: logs(/大道/) }; })()`,
    r => !r.ok ? 'buy' : r.paid !== 6500 ? 'paid ' + r.paid : r.after.some(k => k !== 'dirt') ? 'road ' + r.after : !r.log.some(m => /镇门还关着/.test(m)) ? 'no hint' : null);

  // 5. (local only) the busy real farms: bought at 9:00, laid the same day (the friend's farm used to leave it 6+ days)
  for (const file of [FRIEND, REAL].filter(f => f && fs.existsSync(f))) {
    const save = readSave(file), tag = file === REAL ? 'realsave' : 'friendsave';
    await shot(`${tag}.png`, `(() => { ${helpers} toTime(9 * 60); S.coins += 5000; f.FARMER.wood += 40; const d = S.day, t0 = S.t;
      const r = ['gravel', 'gravel', 'gravel', 'gravel', 'flag', 'flag'].map(id => f.buy(id).ok);
      until(() => !pend().length || tod() >= 18 * 60 || S.day > d, 3000); const at = tod(), wait = pend(), mins = S.t - t0;
      look(80, 50, 0.25); hide();
      return { r, day: [d, S.day], at, mins, wait, put: S.homeyard.put, decor: { inv: S.decor.inv, orders: S.decor.orders.length }, log: logs(/石子|石板|之前买好/) }; })()`,
      r => r.r.some(x => !x) ? 'buy ' + r.r : r.wait.length ? 'not laid by evening ' + r.wait : r.day[1] !== r.day[0] ? 'took a night' : null, save);
  }

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
