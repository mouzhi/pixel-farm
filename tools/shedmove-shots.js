// v5.11.0.32: second pens can be moved with 挪东西, and a 牧场 can be re-zoned once they have somewhere to go.
//   node tools/shedmove-shots.js [name-filter]   writes /workspace/pf-shots/shedmove_*.png (PF_SHOTS to change)
// Player report: 「棚舍点挪东西挪不动，然后不挪的话地块又不能改建」 (高山牧场·山顶高地, day 51).
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
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page() { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const mid = id => { const r = f.PL.plot(id).rect; return { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }; };
    const look = (id) => { const c = mid(id); f.setAngle(0); f.panTo(c.x, c.y + 6); f.advance(0.3, 10); };
    const hide = () => { const s = document.getElementById('say'); if (s) s.hidden = true; };
    const counts = () => { const by = {}, trough = {}, fitted = {};
      S.animals.forEach(a => { const k = a.pen || a.kind; by[k] = (by[k] || 0) + 1; });
      for (const k of f.PW.PEN2_IDS) { trough[k] = S.troughs[k] && S.troughs[k].feed; fitted[k] = f.PW.fitted(S.works.mach, k); }
      return { n: S.animals.length, by, trough, fitted, bin: { eg: f.PW.binHas(S.works.mach, 'egg'), mk: f.PW.binHas(S.works.mach, 'milk') }, host: S.works.penHost }; };
    const inRoam = () => S.animals.filter(a => a.pen && f.PW.PEN2_IDS.includes(a.pen)).every(a => { const v = f.AV.get(a.id), R = f.PENS[a.pen] && f.PENS[a.pen].roam; return !v || (R && v.x >= R[0] - 1 && v.x <= R[2] + 1 && v.y >= R[1] - 1 && v.y <= R[3] + 1); });`;
  // the report's farm: 高山牧场 (alp) is the first 牧场, day 51, with the second pens on it
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 3000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','sty','fold','shed','can','can','can','can']) f.buy(id);
    const trail = f.buyPlot('trail', 'trail'), alp = f.buyPlot('alp', 'pasture'); S.day = 51; if (S.plots.alp) S.plots.alp.day = 51;
    const built = ['coop2','sty2','fold2','shed2'].map(id => f.buy(id).ok);
    for (let i = 0; i < 12; i++) f.buy('chicken'); for (let i = 0; i < 6; i++) { f.buy('pig'); f.buy('sheep'); f.buy('cow'); }
    for (const k of f.PW.PEN2_IDS) S.troughs[k] = { feed: 7, water: 1 };
    S.works.mach = { f: (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7), e: 1, m: 1, eg: 5, mk: 3 };
    at(10 * 60); for (let i = 0; i < 8; i++) f.advance(1, 10);
    for (const k of f.PW.PEN2_IDS) S.troughs[k] = { feed: 7, water: 1 };
    const farm = { trail: trail.ok, alp: alp.ok, built, host: S.works.penHost, n: S.animals.length };`;
  const shot = async (name, fn, check) => { name = 'shedmove_' + name; if (only && !name.includes(only)) return;
    const p = await page(); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 500) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); return r; };

  // 1. the reported deadlock: only 高山牧场 is a 牧场, the shop blocks conversion, 挪东西 can now pick a second shed
  await shot('shop_blocked.png', `(() => { ${setup}
    look('alp'); f.openPlot('alp'); f.refreshUI();
    const shop = (document.getElementById('shop') || {}).textContent || '';
    const busy = f.plotBusy('alp'), note = f.worksVacateNote('alp');
    const zone = f.rezonePlot('alp', 'meadow');
    const items = f.movables().filter(m => m.what === 'pen2'), first = f.movableAt(f.PENS.coop.bld.x, f.PENS.coop.bld.y);
    const hit = f.movableAt(f.PENS.coop2.bld.x, f.PENS.coop2.bld.y);
    f.setMode('move'); if (hit) f.decorClick(hit); f.render();
    return { farm, busy, note, zone, shop: shop.slice(0, 400), hasMsg: /改成牧场/.test(shop + (busy || '')), nPen: items.length, refs: [...new Set(items.map(m => m.ref))], hit: hit && hit.what, first: first && first.what, store: hit ? f.canStore(hit) : null, ver: f.version }; })()`,
    r => !r.farm.trail || !r.farm.alp ? 'buy ' + JSON.stringify(r.farm) : r.farm.built.some(x => !x) ? 'build' : r.farm.host !== 'alp' ? 'host ' + r.farm.host : !r.busy ? 'not blocked' : !r.hasMsg ? 'msg ' + r.busy : r.zone && r.zone.ok ? 'rezone succeeded' : r.nPen < 4 ? 'movables ' + r.nPen : r.hit !== 'pen2' ? 'not selectable' : r.first ? 'first pen selectable' : r.store ? 'can store shed' : r.ver !== VERSION ? 'ver ' + r.ver : null);

  // 2. touch pick radius (xhs setTouch pickCss) still finds a shed just outside the desktop radius; first pens stay unselectable
  await shot('touch_pick.png', `(() => { ${setup}
    look('alp'); f.render(); const P = f.PENS.coop2.bld, c = f.toClient(P.x, P.y), first = f.toClient(f.PENS.coop.bld.x, f.PENS.coop.bld.y);
    const st = f.setTouch({ pickCss: 22, slop: 10 }); f.setMode('move');
    const a0 = f.aimAt(c.x, c.y), aOff = f.aimAt(c.x + 8, c.y + 8), aFirst = f.aimAt(first.x, first.y);
    const committed = f.commitAt(c.x, c.y);
    const said = (document.getElementById('say') || {}).textContent || '';
    f.render();
    return { st, aim: a0.what && a0.what.what, ref: a0.what && a0.what.ref, off: aOff.what && aOff.what.what, first: aFirst.what && aFirst.what.what, pick: f.input.mvPick && f.input.mvPick.what, said: /第二套棚舍/.test(said), ver: f.version }; })()`,
    r => r.st.pickCss !== 22 || r.st.slop !== 10 ? 'setTouch ' + JSON.stringify(r.st) : r.aim !== 'pen2' || r.ref !== 'coop2' ? 'aimAt missed shed' : r.off !== 'pen2' ? 'slight offset missed' : r.first ? 'first pen selectable by touch' : r.pick !== 'pen2' || !r.said ? 'commitAt did not pick' : null);

  // 3. 挪东西 to 北坡·东: animals, troughs and machines stay; the old host can then be re-zoned
  await shot('move_to_neslope.png', `(() => { ${setup}
    const nes = f.buyPlot('neslope', 'pasture'); const before = counts();
    look('alp'); f.setMode('move'); const p0 = f.PENS.coop2.bld; const pick = f.decorClick(p0);
    const dest = mid('neslope'); const hover = f.pen2MoveOk(dest.x, dest.y); const bad = f.pen2MoveOk(mid('alp').x, mid('alp').y);
    const go = f.decorClick(dest); const q = S.decor.orders.find(o => o.what === 'pen2'); const settled = q && f.settle(q);
    const after = counts(); look('neslope'); hide(); f.setMode(null); f.advance(0.2, 10);
    const busyAlp = f.plotBusy('alp'), zone = f.rezonePlot('alp', 'meadow');
    return { nes: nes.ok, before, after, hover: !!(hover && hover.ok), refusedSame: !!(bad && !bad.ok), settled, host: S.works.penHost, inRoam: inRoam(), busyAlp, zoneOk: !!(zone && zone.ok), alpMod: S.plots.alp && S.plots.alp.mod, props: !!(f.PENS.coop2.bld), ver: f.version }; })()`,
    r => !r.nes ? 'buy neslope' : !r.hover ? 'dest not ok' : !r.refusedSame ? 'same plot accepted' : !r.settled ? 'settle failed' : r.host !== 'neslope' ? 'host ' + r.host : r.after.n !== r.before.n ? 'lost animals' : JSON.stringify(r.after.by) !== JSON.stringify(r.before.by) ? 'pens ' + JSON.stringify(r.after.by) : JSON.stringify(r.after.trough) !== JSON.stringify(r.before.trough) ? 'troughs' : JSON.stringify(r.after.fitted) !== JSON.stringify(r.before.fitted) ? 'feeders' : JSON.stringify(r.after.bin) !== JSON.stringify(r.before.bin) ? 'bin' : !r.inRoam ? 'animals not in new roam' : r.busyAlp ? 'old host still busy ' + r.busyAlp : !r.zoneOk || r.alpMod !== 'meadow' ? 'rezone after move' : null);

  // 4. save / reload keeps the new host, the animals, troughs and the machine bin (v15, no new fields)
  let snap = null;
  const moved = await shot('reload.png', `(() => { ${setup}
    f.buyPlot('neslope', 'pasture'); const before = counts();
    f.setMode('move'); f.decorClick(f.PENS.shed2.bld); f.decorClick(mid('neslope'));
    const q = S.decor.orders.find(o => o.what === 'pen2'); if (q) f.settle(q);
    const s = f.snapshot();
    return { before, after: counts(), host: S.works.penHost, sv: s.saveVersion, ver: s.gameVersion, hasMach: !!(s.works && s.works.mach), hasHeld: 'held' in (s.works || {}), snap: s }; })()`,
    r => !r ? 'no result' : r.host !== 'neslope' ? 'host' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== VERSION ? 'ver ' + r.ver : !r.hasMach ? 'mach dropped' : r.hasHeld ? 'unexpected works.held' : r.after.n !== r.before.n ? 'animals' : null);
  if (moved && moved.snap) snap = moved.snap;
  if (snap && (!only || 'shedmove_reload_load.png'.includes(only) || 'reload'.includes(only))) {
    const p = await page();
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, Object.assign({}, snap, { savedAt: Date.now() }));
    await p.reload(); await ready(p);
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
    const r = await p.evaluate(`(() => { ${helpers}
      const c = counts(), roam0 = inRoam();
      look('neslope'); hide(); f.setMode('move'); const hit = f.movableAt(f.PENS.coop2.bld.x, f.PENS.coop2.bld.y);
      f.render(); return { c, hit: hit && hit.what, inRoam: roam0, sv: f.snapshot().saveVersion, ver: f.version }; })()`);
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, 'shedmove_reload_load.png') });
    const want = moved.after, bad = r.c.host !== 'neslope' ? 'host ' + r.c.host : r.c.n !== want.n ? 'animals ' + r.c.n : JSON.stringify(r.c.by) !== JSON.stringify(want.by) ? 'pens' : JSON.stringify(r.c.trough) !== JSON.stringify(want.trough) ? 'troughs' : JSON.stringify(r.c.bin) !== JSON.stringify(want.bin) ? 'bin' : !r.inRoam ? 'roam' : r.hit !== 'pen2' ? 'not selectable after load' : r.sv !== 15 ? 'sv' : null;
    console.log(bad ? 'FAIL' : 'ok  ', 'shedmove_reload_load.png', JSON.stringify(r).slice(0, 900)); if (bad) fails.push('shedmove_reload_load.png: ' + bad);
    await p.context().close();
  }

  // 5. conversion auto-vacates when another 牧场 already exists (shop note, no lost animals / goods / machines)
  await shot('rezone_vacate.png', `(() => { ${setup}
    const nes = f.buyPlot('neslope', 'pasture'); const before = counts();
    look('alp'); f.openPlot('alp'); f.refreshUI();
    const note = f.worksVacateNote('alp'), busy = f.plotBusy('alp'), shop = (document.getElementById('shop') || {}).textContent || '';
    const zone = f.rezonePlot('alp', 'woodland');
    const after = counts(); look('neslope'); hide(); f.setMode(null); f.advance(0.2, 10);
    return { nes: nes.ok, before, after, busy, note, shopHas: /搬到北坡/.test(shop + (note || '')), zoneOk: !!(zone && zone.ok), host: S.works.penHost, alpMod: S.plots.alp && S.plots.alp.mod, inRoam: inRoam(), ver: f.version }; })()`,
    r => !r.nes ? 'buy neslope' : r.busy ? 'still blocked ' + r.busy : !r.shopHas ? 'note ' + r.note : !r.zoneOk || r.alpMod !== 'woodland' ? 'rezone' : r.host !== 'neslope' ? 'host ' + r.host : r.after.n !== r.before.n ? 'lost animals' : JSON.stringify(r.after.by) !== JSON.stringify(r.before.by) ? 'pens' : JSON.stringify(r.after.trough) !== JSON.stringify(r.before.trough) ? 'troughs' : JSON.stringify(r.after.fitted) !== JSON.stringify(r.before.fitted) || JSON.stringify(r.after.bin) !== JSON.stringify(r.before.bin) ? 'machines' : !r.inRoam ? 'roam' : null);

  server.close(); await b.close();
  if (errs.length) { console.error('page/console errors:\\n' + errs.join('\\n')); process.exit(1); }
  if (fails.length) { console.error('FAIL\\n' + fails.join('\\n')); process.exit(1); }
  console.log('ok   shedmove-shots', VERSION);
})().catch(e => { console.error(e); process.exit(1); });
