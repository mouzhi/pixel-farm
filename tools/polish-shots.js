// v5.9.1 browser checks (polish): night light layer cached, one-row toolbar, welcome-back only after 10 minutes, same-kind surprises
//   on one log line, saplings with nowhere to go say so, town lamps / windows / evening square, the progressive shop, the day-59 fixture.
//   node tools/polish-shots.js   writes /workspace/pf-shots/v591_*.png (PF_SHOTS to change); exits 1 on an error or a failed check.
//   PF_REAL_SAVE=<save.json | dump with ===SAVE===> also loads that save (never committed) and shoots it at night with the new toolbar.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const FIXTURE = readSave(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'));
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page(save, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p); }
    await p.evaluate(() => { __farm.SAVE.off = true; }); return p; }
  const check = (name, bad, r) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); };
  // the toolbar: one row along the bottom, never a block over the middle; the bottom-right buttons sit above it, not on it
  const layout = `(() => { const R = id => { const e = document.getElementById(id); if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const inv = R('inv'), br = R('bottomRight'), au = R('audioBar'), over = (a, b) => !!(a && b && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1);
    const rows = new Set([...document.querySelectorAll('#inv .slot')].map(s => Math.round(s.getBoundingClientRect().top))).size;
    return { vh: innerHeight, inv, rows, slots: document.querySelectorAll('#inv .slot').length, brOnInv: over(br, inv), audioOnInv: over(au, inv) }; })()`;
  const layoutBad = r => r.rows !== 1 ? 'toolbar rows ' + r.rows : r.inv.h > 90 ? 'toolbar tall ' + r.inv.h : r.inv.y < r.vh * 0.7 ? 'toolbar high ' + r.inv.y : r.brOnInv ? 'buttons on the toolbar' : r.audioOnInv ? 'sound buttons on the toolbar' : null;
  const night = `(() => { const f = __farm, S = f.S; const o = document.getElementById('offline'); o.hidden = true; S.t = Math.floor(S.t / 1440) * 1440 + 21 * 60; f.advance(0.5, 10); f.setAngle(0); f.panTo(96, 70); f.advance(0.2, 10); f.refreshUI();
    for (let i = 0; i < 3; i++) f.render(); const b0 = f.litBuilds(), t0 = performance.now(); for (let i = 0; i < 20; i++) f.render(); const still = (performance.now() - t0) / 20, rebuilt = f.litBuilds() - b0;
    const t1 = performance.now(); for (let i = 0; i < 20; i++) { f.panTo(96 + (i % 2 ? 1.3 : -1.3), 70); f.render(); } const pan = (performance.now() - t1) / 20; f.panTo(96, 70); f.render();
    return { v: f.version, sv: f.snapshot().saveVersion, day: S.day, lamps: window.PFDecorArt ? PFDecorArt.lamps().length : 0, rebuiltStill: rebuilt, stillMs: +still.toFixed(1), panMs: +pan.toFixed(1) }; })()`;

  // 1. the day-59 fixture loads; at night the light layer is built once and reused while the camera is still; toolbar in one row
  { const p = await page(FIXTURE); const r = await p.evaluate(night); Object.assign(r, await p.evaluate(layout)); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, 'v591_fixture_night.png') });
    check('v591_fixture_night.png', r.v !== VERSION ? 'version' : r.sv !== 15 ? 'saveVersion' : r.day !== FIXTURE.clock.day ? 'day' : r.rebuiltStill !== 0 ? 'light layer rebuilt ' + r.rebuiltStill : layoutBad(r), r); await p.context().close(); }
  // 2. a busy late-game toolbar at a smaller window: still one row (scrolls sideways when it must)
  { const p = await page(FIXTURE, 1024, 700); const r = await p.evaluate(`(() => { const f = __farm, S = f.S; document.getElementById('offline').hidden = true; S.coins = 900000; f.FARMER.wood = 800;
      for (const id of ['axe', 'hay']) f.buy(id); f.FARMER.saplings.apple = 31; f.FARMER.saplings.orange = 31; f.FARMER.bag.strawberry = 3; f.FARMER.bag.pumpkin = 0; f.refreshUI(); return {}; })()`);
    Object.assign(r, await p.evaluate(layout)); await p.screenshot({ path: path.join(OUT, 'v591_toolbar_1024.png') }); check('v591_toolbar_1024.png', layoutBad(r), r); await p.context().close(); }
  // 3. welcome back: 5 minutes away -> only the log line; 2 hours -> the box
  for (const [name, min, want] of [['v591_away_5min.png', 5, false], ['v591_away_2h.png', 120, true]]) {
    const s = JSON.parse(JSON.stringify(FIXTURE)); s.stats.dayEarn = [4000, 4000, 4000]; s.savedAt = Date.now() - min * 60 * 1000;
    const p = await page(s); const r = await p.evaluate(() => ({ off: __farm.SAVE.offline && __farm.SAVE.offline.gold, shown: !document.getElementById('offline').hidden, line: __farm.S.events.map(e => e.msg).filter(m => /离线期间赚了/.test(m)).length }));
    await p.screenshot({ path: path.join(OUT, name) }); check(name, !(r.off > 0) ? 'no offline gold' : r.shown !== want ? 'box shown ' + r.shown : !r.line ? 'no log line' : null, r); await p.context().close(); }
  // 4. three double yolks and two gold eggs on one day read as two log lines with counts
  { const p = await page(FIXTURE); const r = await p.evaluate(() => { const f = __farm, S = f.S; document.getElementById('offline').hidden = true; f.advance(1, 10); const n0 = S.events.length;
      for (let i = 0; i < 3; i++) f.surpriseNote({ kind: 'double-egg', msg: '一颗双黄蛋！' }); for (let i = 0; i < 2; i++) f.surpriseNote({ kind: 'gold-egg', msg: '捡到一颗金蛋！' });
      f.setAngle(0); f.panTo(96, 70); f.advance(0.2, 10); f.refreshUI(); const add = S.events.slice(n0).map(e => e.msg); return { add, log: S.log.slice(0, 3), rate: PFSurprise.EGG.double.chance }; });
    await p.screenshot({ path: path.join(OUT, 'v591_surprise_log.png') });
    check('v591_surprise_log.png', r.add.length !== 2 ? 'lines ' + r.add.length : !r.add.includes('今天捡到 3 颗双黄蛋') || !r.add.includes('今天捡到 2 颗金蛋！') ? 'text' : r.rate !== 0.03 ? 'rate' : null, r); await p.context().close(); }
  // 5. saplings and no grass left: a fresh farm with its yard full of trees -> the button says so, clicking explains instead of arming
  { const p = await page(null); const r = await p.evaluate(() => { const f = __farm, S = f.S; f.FARMER.saplings.apple = 3; f.refreshUI(); const before = f.plantRoom();
      const W = f.S.trees[0] || { kind: 'wild', v: 0 }; let i = 0; for (let y = -12; y < 150; y += 9) for (let x = -12; x < 210; x += 9) S.trees.push({ id: 'pt' + i++, x, y, kind: 'wild', v: (i % 8), stage: 'tree', age: 0, ripe: 0, cd: 0 });
      return { before, after: f.plantRoom() }; });
    await p.waitForFunction(() => [...document.querySelectorAll('#tools .pbtn')].some(q => q.dataset.m === 'plant'), null, { timeout: 5000 }).catch(() => {});
    Object.assign(r, await p.evaluate(() => { const f = __farm, btn = [...document.querySelectorAll('#tools .pbtn')].find(q => q.dataset.m === 'plant'); if (btn) btn.click(); f.setAngle(0); f.panTo(96, 60); f.render();
      return { label: btn && btn.textContent, title: btn && btn.title, mode: f.input.mode, say: document.getElementById('say').textContent }; }));
    await p.screenshot({ path: path.join(OUT, 'v591_saplings_full.png') });
    check('v591_saplings_full.png', !r.before ? 'no room on a fresh farm' : r.after ? 'still room' : !/没地方/.test(r.label || '') ? 'label ' + r.label : r.mode ? 'armed' : !/没有能种树的空草地/.test(r.say) ? 'say ' + r.say : null, r); await p.context().close(); }
  // 6. the town at 19:30: lamps and windows lit, 周婶 and 林老师 on the square
  { const p = await page(FIXTURE); const r = await p.evaluate(() => { const f = __farm, S = f.S; document.getElementById('offline').hidden = true; S.coins = 900000; f.FARMER.wood = 800;
      f.buyPlot('eroad', 'road'); S.town.school.kid0 = 1; const ok = f.buy('town').ok; if (S.weather) S.weather.rained = false;
      S.t = Math.floor(S.t / 1440) * 1440 + 18 * 60; for (let i = 0; i < 200 && S.t % 1440 < 19 * 60 + 30; i++) f.advance(1, 10);
      for (let i = 0; i < 200 && f.NEIGH.some(n => n.out && n.moving); i++) f.advance(1, 10);
      f.setAngle(0.3); f.panTo(780, 70); f.advance(0.2, 10); return { ok, tod: Math.round(S.t % 1440), lights: f.TN.lightsAt(S.t % 1440).length, out: f.NEIGH.filter(n => n.out).map(n => n.name + ':' + n.spot) }; });
    await p.screenshot({ path: path.join(OUT, 'v591_town_evening.png') });
    check('v591_town_evening.png', !r.ok ? 'town' : r.lights < 10 ? 'lights ' + r.lights : r.out.length !== 2 ? 'out ' + r.out : null, r); await p.context().close(); }
  // 6b. the shop's 新房子 card with its long lock note (no 花甸 / 农田 yet): the name column keeps its width (was one character wide), at 1280 and 390
  for (const [w, h] of [[1280, 800], [390, 844]]) { const name = 'v591_newhouse_card_' + w + '.png'; const p = await page(FIXTURE, w, h);
    const r = await p.evaluate(() => { document.getElementById('offline').hidden = true; document.getElementById('shopBtn').click(); const t = document.querySelector('#shop [data-tab="build"]'); if (t) t.click(); __farm.refreshUI();
      const c = document.querySelector('#shop [data-item="cottage"]'); if (!c) return { none: true }; c.scrollIntoView({ block: 'center' }); const W = e => Math.round(e.getBoundingClientRect().width);
      const heads = [...document.querySelectorAll('#shop .sec')].map(e => e.textContent); return { card: W(c), ct: W(c.querySelector('.ct')), h: Math.round(c.getBoundingClientRect().height), lock: !!c.querySelector('.short.lock'), dupHead: heads.length !== new Set(heads).size }; });
    await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, name) });
    check(name, r.none ? 'no card' : !r.lock ? 'no lock note (scene)' : r.ct < r.card * 0.35 ? 'name column ' + r.ct + ' of ' + r.card : r.h > 220 ? 'card tall ' + r.h : r.dupHead ? 'a section header twice' : null, r); await p.context().close(); }
  // 6c. progressive shop: a fresh farm hides what is more than two unlock steps away (cows, the new house, the works...) with a quiet note;
  //     nothing owned or buyable is ever hidden, nor anything unlocked priced up to max(1000, 10x the 3-day average income); the day-59 fixture hides nothing
  for (const [tag, save] of [['day1', null], ['day59', FIXTURE]]) { const name = 'v591_shop_reveal_' + tag + '.png'; const p = await page(save);
    const r = await p.evaluate(() => { const o = document.getElementById('offline'); if (o) o.hidden = true; document.getElementById('shopBtn').click();
      const t = document.querySelector('#shop [data-tab="animals"]'); if (t) t.click(); __farm.refreshUI(); const f = __farm, S = f.S, SIM = window.PFSim;
      const hidden = [], bad = []; for (const id of SIM.SHOP_IDS) { const d = f.shopDepth(id); if (d > f.REVEAL_MAX) { hidden.push(id); const o = SIM.offer(S.up, S.coins, id, f.F.wood); if (S.up[id] > 0 || o.ok || (!o.locked && !o.lockText && !o.maxed && o.cost <= f.shopAfford())) bad.push(id); } }
      return { hidden, bad, cow: !!document.querySelector('#shop [data-item="cow"]'), chicken: !!document.querySelector('#shop [data-item="chicken"]'), more: !!document.querySelector('#shop .more') }; });
    await p.waitForTimeout(200); await p.screenshot({ path: path.join(OUT, name) });
    check(name, r.bad.length ? 'hid owned/buyable ' + r.bad : !r.chicken ? 'no chicken card' : tag === 'day1' ? (r.cow ? 'cow shown on day 1' : !r.more ? 'no 更多内容 note' : !r.hidden.includes('cottage') ? 'new house shown on day 1' : null)
      : (r.hidden.length ? 'late game hides ' + r.hidden : r.more ? 'note with nothing hidden' : null), r); await p.context().close(); }
  // 7. (local only) the player's own save at night with the new toolbar
  if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) { const save = readSave(process.env.PF_REAL_SAVE);
    const p = await page(save); const r = await p.evaluate(night); Object.assign(r, await p.evaluate(layout)); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, 'v591_realsave_night.png') });
    check('v591_realsave_night.png', r.v !== VERSION ? 'version' : r.sv !== 15 ? 'saveVersion' : r.day !== save.clock.day ? 'day' : r.rebuiltStill !== 0 ? 'rebuilt' : layoutBad(r), r); await p.context().close(); }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
