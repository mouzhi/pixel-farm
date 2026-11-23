// v5.11.0.36: hives move to another 花甸 with 挪东西, so the old meadow can be re-zoned (player report from xhs:
// 「蜂箱只能在放的那块花甸里用，挪不走，原来那块地就没法改用途」).
//   node tools/beehive-shots.js [name-filter]   writes /workspace/pf-shots/beehive_*.png (PF_SHOTS to change). Synthetic farm only.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    if (save) await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, save);
    await p.goto(base + '/index.html' + (save ? '' : '?manual')); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const H = `const f = __farm, S = f.S;
    const mid = id => { const r = f.PL.plot(id).rect; return { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }; };
    const look = id => { const c = mid(id); f.setAngle(0); f.panTo(c.x, c.y + 6); f.advance(0.3, 10); const s = document.getElementById('say'); if (s) s.hidden = true; f.render(); };
    const slot = (id, s) => f.PW.hiveSlots(S.plots, S.eff.regions).find(q => q.at === id && q.s === s);
    const hv = () => ({ n: S.works.hives.length, at: S.works.hives.map(h => h.at), s: S.works.hives.map(h => h.s), ready: S.works.hives.map(h => h.ready), cd: S.works.hives.map(h => h.cd), tray: !!(S.works.mach && S.works.mach.h), hn: f.PW.binHas(S.works.mach, 'honey'), spots: f.PWA.hiveSpots().filter(Boolean).length, vat: f.PWA.machSpots().filter(m => m.kind === 'vat').map(m => f.PL.plotAt(m.x, m.y) && f.PL.plotAt(m.x, m.y).id), gutters: f.PWA.machSpots().filter(m => m.kind === 'gutter').length });`;
  const shot = async (p, name, fn, check) => { name = 'beehive_' + name; if (only && !name.includes(only)) return null; let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 500) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700)); if (bad) fails.push(name + ': ' + bad); return r; };

  const p = await page();
  const before = await shot(p, 'before.png', `(() => { ${H} S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 3000;
      for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can','can','can']) f.buy(id);
      const a = f.buyPlot('swbank', 'meadow'), hives = []; for (let i = 0; i < 6; i++) hives.push(f.buy('hive').ok); const tray = f.buy('tray').ok;
      S.day += 3; const g = f.buyPlot('glade', 'meadow'); S.works.mach = Object.assign(S.works.mach || {}, { hn: 4 });
      S.t = Math.floor(S.t / 1440) * 1440 + 10 * 60; f.advance(1, 10); S.works.hives.forEach((h, i) => { h.ready = i % 3; h.cd = 1 + (i % 2); });
      look('swbank'); return { a: a.ok, g: g.ok, hives, tray, h: hv(), busy: f.plotBusy('swbank'), ver: f.version }; })()`,
    r => !r.a || !r.g || r.hives.some(x => !x) || !r.tray ? 'setup ' + JSON.stringify(r) : r.h.at.some(a => a !== 'swbank') ? 'at ' + r.h.at : r.h.vat[0] !== 'swbank' ? 'vat' : !/挪东西/.test(r.busy || '') ? 'busy ' + r.busy : r.ver !== VERSION ? 'ver ' + r.ver : null);
  const h0 = before && before.h;

  // desktop 挪东西: a click on the hive, a click off any meadow (refused, nothing lost), a click on the second meadow
  const moved = await shot(p, 'moved.png', `(() => { ${H} f.setMode('move'); const q = f.PWA.hiveSpots()[2]; f.decorClick({ x: q.x, y: q.y });
      const pick = f.input.mvPick && f.input.mvPick.what; const bad = f.decorClick({ x: 100, y: 150 }), badOrders = S.decor.orders.length, keep = hv();
      const g = slot('glade', 1); const okc = f.decorClick({ x: g.x, y: g.y }); const o = S.decor.orders.find(o => o.what === 'hive' && o.ref === 2); const settled = o ? f.settle(o) : false;
      f.setMode(null); look('glade'); return { pick, bad: bad && bad.ok, badWhy: bad && bad.why, badOrders, keep, settled, h: hv() }; })()`,
    r => !h0 ? 'no before' : r.pick !== 'hive' ? 'pick ' + r.pick : r.bad || r.badOrders ? 'off-meadow click queued a move' : JSON.stringify(r.keep.ready) !== JSON.stringify(h0.ready) ? 'honey lost on refusal' : !r.settled ? 'no move' : r.h.at[2] !== 'glade' ? 'at ' + r.h.at : JSON.stringify(r.h.ready) !== JSON.stringify(h0.ready) || JSON.stringify(r.h.cd) !== JSON.stringify(h0.cd) ? 'honey/countdown' : null);
  const after = moved && await shot(p, 'after_glade.png', `(() => { ${H} const res = []; for (let i = 0; i < 6; i++) { if (S.works.hives[i].at === 'glade') continue; const g = slot('glade', [0, 2, 3, 4, 5][res.length]);
        const o = f.orderThing('move', 'hive', i, null, g.x, g.y, 1); res.push(o.ok && f.settle(o.q)); }
      look('glade'); return { res, h: hv(), busy: f.plotBusy('swbank'), seventh: f.buy('hive').ok }; })()`,
    r => r.res.some(x => !x) ? 'moves ' + r.res : r.h.at.some(a => a !== 'glade') ? 'at ' + r.h.at : JSON.stringify(r.h.ready) !== JSON.stringify(h0.ready) ? 'honey' : r.h.vat[0] !== 'glade' || r.h.gutters !== 6 || r.h.hn !== h0.hn ? 'tray ' + JSON.stringify(r.h) : r.busy ? 'busy ' + r.busy : r.seventh ? '7th hive sold' : null);
  const saved = after ? await p.evaluate(() => JSON.stringify(Object.assign(__farm.snapshot(), { savedAt: Date.now() }))) : null;
  await p.context().close();
  if (saved) { const p2 = await page(saved);
    await shot(p2, 'reload_dam.png', `(() => { ${H} const h = hv(), sv = f.snapshot().saveVersion, busy = f.plotBusy('swbank'), z = f.rezonePlot('swbank', 'dam'); look('swbank');
        return { h, sv, busy, z: z && z.ok, mod: S.plots.swbank && S.plots.swbank.mod }; })()`,
      r => r.sv !== 15 ? 'save v' + r.sv : r.h.at.some(a => a !== 'glade') || JSON.stringify(r.h.ready) !== JSON.stringify(h0.ready) ? 'hives after reload ' + JSON.stringify(r.h) : r.h.vat[0] !== 'glade' ? 'vat' : r.busy || r.mod !== 'dam' ? 'rezone ' + r.busy + ' ' + r.mod : null);
    await p2.context().close(); }
  server.close(); await b.close();
  if (errs.length) { console.error('page/console errors:\n' + errs.join('\n')); process.exit(1); }
  if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
  console.log('ok   beehive-shots', VERSION);
})().catch(e => { console.error(e); process.exit(1); });
