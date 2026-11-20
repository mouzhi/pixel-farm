// v5.10.13: goldfish go straight into the pond, and the family diary.
//   node tools/fishdiary-shots.js [name-filter]   writes /workspace/pf-shots/fishdiary_*.png (PF_SHOTS to change)
// A 小红书 player asked 「为什么金鱼放养不了啊」: a bought goldfish waited in the storehouse until the player found the
// small 放养 button, tapped the pond, and someone walked there. Checks: buying through the shop UI stocks the pond at
// once (toast + splash), a full pond refuses clearly and keeps the gold, an old save with unreleased goldfish gets them
// in the pond on load, and the diary (counts, panel on desktop and phone width, save round trip).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const s = JSON.parse(fs.readFileSync(f, 'utf8')); return s.save || s; };
const FIX = n => path.join(__dirname, 'fixtures', n);
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI && window.PFDiaryUI, null, { timeout: 30000 });
  async function page(save, vp) { const ctx = await b.newContext({ viewport: vp || { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    if (save) { save = Object.assign({}, save, { savedAt: Date.now() });
      await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const shot = async (name, vp, save, run, check) => { name = 'fishdiary_' + name; if (only && !name.includes(only)) return;
    const p = await page(save, vp); let r; try { r = await run(p); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const pondView = p => p.evaluate(() => { const f = __farm; f.setAngle(0); f.panTo(40, 96); f.advance(0.2, 10); });
  const sayText = p => p.evaluate(() => { const s = document.getElementById('say'); return s && !s.hidden ? s.textContent : null; });

  // 1. the shop: 工具 → 金鱼. One tap: gold goes, the pond has a goldfish, the bubble says so, nothing waits in the storehouse.
  await shot('shop_toast.png', null, null, async p => {
    await p.evaluate(() => { __farm.S.coins = 500; __farm.refreshUI(); }); await pondView(p);
    await p.click('#shopBtn'); await p.waitForTimeout(150); await p.click('#shop [data-tab="tools"]'); await p.waitForTimeout(150);
    await p.click('#shop [data-buy="goldfish"]'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const S = __farm.S, card = document.querySelector('#shop [data-item="goldfish"]');
      return { coins: S.coins, pond: S.pondFish.map(f => f.kind), held: S.ornament.goldfish, orders: S.orders.length, tools: document.getElementById('tools').textContent, card: card && card.textContent.replace(/\s+/g, ' ').slice(0, 90) }; });
    r.say = await sayText(p); return r; },
    r => r.coins !== 420 ? 'coins ' + r.coins : r.pond.join() !== 'goldfish' ? 'pond ' + r.pond : r.held ? 'still in storehouse' : /放养金鱼/.test(r.tools) ? 'release button shown' : !/池塘/.test(r.say || '') ? 'no toast' : !/池塘 1\/8/.test(r.card || '') ? 'card ' + r.card : null);

  // 2. a full pond (koi count too): the buy is refused with a reason, the gold stays
  await shot('pond_full.png', null, null, async p => {
    await p.evaluate(() => { const f = __farm, S = f.S; S.coins = 500; for (let i = 0; i < 6; i++) f.placePondFish('koi'); for (let i = 0; i < 2; i++) f.placePondFish('goldfish'); f.refreshUI(); });
    await pondView(p); await p.click('#shopBtn'); await p.waitForTimeout(150); await p.click('#shop [data-tab="tools"]'); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const f = __farm, S = f.S, x = f.buy('goldfish'), card = document.querySelector('#shop [data-item="goldfish"]');
      window.dispatchEvent(new CustomEvent('pf:say', { detail: x.why })); return { ok: x.ok, why: x.why, coins: S.coins, pond: S.pondFish.length, card: card && card.textContent.replace(/\s+/g, ' ').slice(0, 90) }; });
    r.say = await sayText(p); return r; },
    r => r.ok ? 'bought into a full pond' : r.coins !== 500 ? 'charged ' + r.coins : r.pond !== 8 ? 'pond ' + r.pond : !/养满/.test(r.why || '') ? 'why ' + r.why : !/养满/.test(r.card || '') ? 'card ' + r.card : null);

  // 3. an old save: 3 bought goldfish never released (one 放养 order flagged): in the pond on load
  if (fs.existsSync(FIX('save-v15-day72-cottage.json'))) { const save = JSON.parse(JSON.stringify(readSave(FIX('save-v15-day72-cottage.json'))));
    save.inventory = Object.assign({}, save.inventory, { ornament: Object.assign({}, save.inventory.ornament, { goldfish: 3 }) }); save.orders = (save.orders || []).concat([{ type: 'release', kind: 'goldfish' }]);
    const before = (save.pondFish || []).length;
    await shot('reload_pond.png', null, save, async p => { await pondView(p);
      return p.evaluate(before => { const S = __farm.S; return { before, pond: S.pondFish.length, kinds: S.pondFish.map(f => f.kind).filter(k => k === 'goldfish').length, held: S.ornament.goldfish, rel: S.orders.filter(o => o.type === 'release').length, log: S.events.map(e => e.msg).filter(m => /金鱼/.test(m)) }; }, before); },
      r => r.pond !== Math.min(8, r.before + 3) ? 'pond ' + r.pond : r.held ? 'held ' + r.held : r.rel ? 'orders left' : !r.log.length ? 'no log' : null);
  }

  // 4. the diary on a real-sized farm: a full day is counted per person, the panel shows it, it survives a save round trip
  for (const [vp, nm] of [[null, 'diary_desktop.png'], [{ width: 390, height: 844 }, 'diary_mobile.png']]) {
    const file = FIX('save-v10-day59-manor.json'); if (!fs.existsSync(file)) continue;
    await shot(nm, vp, readSave(file), async p => {
      const r = await p.evaluate(() => { const f = __farm, S = f.S, d0 = S.day;
        for (let i = 0; i < 6000 && S.day < d0 + 2; i++) f.advance(1, 10); // run through a whole day (and the night)
        for (let i = 0; i < 600 && S.t % 1440 < 11 * 60; i++) f.advance(1, 10);
        const y = S.diary.days.find(e => e.d === S.day - 1), v = f.diaryView(S.day - 1), snap = f.snapshot();
        const tot = o => Object.values(o || {}).reduce((s, n) => s + n, 0);
        const people = y ? Object.keys(y.a) : [], acts = y ? people.reduce((s, w) => s + tot(y.a[w].p) + tot(y.a[w].h) + tot(y.a[w].f), 0) : 0;
        return { day: S.day, days: S.diary.days.map(e => e.d), people, acts, pr: y && y.pr, in: y && y.in, lines: v && v.lines, saved: !!(snap.diary && snap.diary.days.length), bytes: JSON.stringify(snap.diary).length,
          morning: S.events.map(e => e.msg).filter(m => /^昨天（第/.test(m)).slice(-1)[0] }; });
      await p.evaluate(() => { __farm.panTo(60, 60); __farm.advance(0.2, 10); }); await p.click('#diaryBtn'); await p.waitForTimeout(150);
      await p.click('#diary .ttl .nav[data-day]:not([disabled])').catch(() => {}); await p.waitForTimeout(150);
      r.panel = await p.evaluate(() => { const el = document.getElementById('diary'), rc = el.getBoundingClientRect(); return { shown: !el.hidden, text: el.textContent.slice(0, 260), w: Math.round(rc.width), right: Math.round(rc.right), vw: innerWidth }; });
      return r; },
      r => !r.saved ? 'not saved' : r.acts < 5 ? 'too little counted ' + r.acts : !r.in ? 'no gold' : !r.panel.shown ? 'panel hidden' : !/第\d+天/.test(r.panel.text) ? 'panel text' : r.panel.right > r.panel.vw ? 'off screen' : r.bytes > 20000 ? 'diary too big ' + r.bytes : !r.morning ? 'no morning line' : null);
  }
  // 5. the diary comes back after a reload (append-only field in the v15 save)
  await shot('diary_reload.png', null, null, async p => {
    await p.evaluate(() => { const f = __farm, S = f.S, d0 = S.day; for (let i = 0; i < 6000 && S.day < d0 + 1; i++) f.advance(1, 10); for (let i = 0; i < 300 && S.t % 1440 < 9 * 60; i++) f.advance(1, 10);
      f.SAVE.off = false; f.saveNow(); f.SAVE.off = true; });
    const a = await p.evaluate(() => JSON.stringify(__farm.S.diary)); await p.reload(); await ready(p);
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
    const r = await p.evaluate(a => { const S = __farm.S, s = JSON.parse(a); return { sv: JSON.parse(localStorage.getItem('mouzhi/pixel-farm:save')).saveVersion, before: s.days.length, after: S.diary.days.length, same: JSON.stringify(s.days[0]) === JSON.stringify(S.diary.days[0]) }; }, a);
    await p.keyboard.press('k'); await p.waitForTimeout(150); return r; },
    r => r.sv !== 15 ? 'save version ' + r.sv : !r.before || r.after < r.before || !r.same ? 'lost ' + JSON.stringify(r) : null);

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
