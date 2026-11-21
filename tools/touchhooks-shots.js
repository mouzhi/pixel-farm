// v5.11.0.2: the hooks a touch shell uses (platforms/xhs touch.js): aimAt / commitAt, setTouch (tap slop, smallest pick radius),
// storeThing (收回: a placed decoration goes back to the storehouse and stays there). The web's mouse path must not change.
//   node tools/touchhooks-shots.js [name-filter]   writes /workspace/pf-shots/touchhooks_*.png (PF_SHOTS to change)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const s = JSON.parse(fs.readFileSync(f, 'utf8')); return s.save || s; };
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page(opts, save) { const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts || {})); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, Object.assign({}, save, { savedAt: Date.now() })); await p.reload(); await ready(p); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const setup = `const f = __farm, S = f.S; S.coins = 500000; f.FARMER.wood = 2000; S.family.met = 1; S.family.moved = 1;
    for (const id of ['house', 'axe', 'forest', 'east']) f.buy(id);
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; }; at(8 * 60); if (S.weather) S.weather.rained = false; f.setAngle(0);`;
  const shot = async (name, opts, save, run, check) => { name = 'touchhooks_' + name; if (only && !name.includes(only)) return;
    const p = await page(opts, save); let r; try { r = await run(p); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 600)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. desktop defaults unchanged: 5 px slop, no pick floor; a mouse click in 砍树 still marks and a 6 px mouse drag still pans
  await shot('desktop_defaults.png', null, null, async p => {
    const r = await p.evaluate(`(() => { ${setup} f.panTo(f.HOUSE.x + 20, f.HOUSE.y + 70); f.render(); f.setMode('chop');
      const t = S.trees.filter(t => t.stage === 'tree' && t.kind === 'wild' && window.PFWorld.choppable(t, S.eff.regions)).map(t => ({ t, c: f.toClient(t.x, t.y) })).filter(o => o.c.x > 100 && o.c.x < 1180 && o.c.y > 200 && o.c.y < 700)[0];
      return { v: window.GAME_VERSION_TEXT || document.title, touch: f.setTouch(), id: t.t.id, x: t.c.x, y: t.c.y - 20 }; })()`);
    await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.mouse.move(r.x + 6, r.y); await p.mouse.up(); r.dragMarked = await p.evaluate(id => __farm.S.orders.some(o => o.id === id), r.id);
    await p.mouse.click(r.x, r.y); r.clickMarked = await p.evaluate(id => __farm.S.orders.some(o => o.id === id), r.id); return r; },
    r => r.touch.slop !== 5 || r.touch.pickCss !== 0 || r.touch.onTap ? 'defaults ' + JSON.stringify(r.touch) : r.dragMarked ? 'a 6px drag marked' : !r.clickMarked ? 'click did not mark' : !r.v.includes(VERSION) ? 'version ' + r.v : null);

  // 2. aimAt / commitAt in 砍树, 种树 and 摆装饰 agree with what a click does; slop 10 lets a 7 px finger wobble through as a tap
  await shot('aim_commit.png', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, null, async p => {
    const r = await p.evaluate(`(() => { ${setup} f.FARMER.saplings.apple = 2; S.decor.inv.bench = 1; f.panTo(f.HOUSE.x + 20, f.HOUSE.y + 70); f.render(); f.setMode('chop');
      const R = document.querySelector('canvas').getBoundingClientRect();
      const t = S.trees.filter(t => t.stage === 'tree' && t.kind === 'wild' && window.PFWorld.choppable(t, S.eff.regions)).map(t => ({ t, c: f.toClient(t.x, t.y) })).filter(o => o.c.x > R.left + 30 && o.c.x < R.right - 30 && o.c.y > R.top + 40 && o.c.y < R.bottom - 5);
      const o = t[0], x = o.c.x, y = o.c.y - 10; const a0 = f.aimAt(x, y), c0 = f.commitAt(x, y), a1 = f.aimAt(x, y), c1 = f.commitAt(x, y);
      const miss = f.aimAt(R.left + 3, R.top + 3);
      f.setMode('plant', 'apple'); let good = null, bad = null; for (let yy = R.top + 10; yy < R.bottom && !(good && bad); yy += 6) for (let xx = R.left + 10; xx < R.right; xx += 6) { const a = f.aimAt(xx, yy); if (a.ok && !good) good = [xx, yy]; if (a.ok === false && !bad) bad = [xx, yy]; }
      const pg = good && f.commitAt(good[0], good[1]), pb = bad && f.commitAt(bad[0], bad[1]);
      f.setMode('decor', 'bench'); let dg = null; for (let yy = R.top + 10; yy < R.bottom && !dg; yy += 6) for (let xx = R.left + 10; xx < R.right; xx += 6) { if (f.aimAt(xx, yy).ok) { dg = [xx, yy]; break; } }
      const dc = dg && f.commitAt(dg[0], dg[1]); f.setMode('chop');
      return { a0, c0: c0.r, a1, c1: c1.r, miss, plantGood: pg && pg.r, plantBad: pb && pb.r, decor: dc && dc.r, tree: [x, y, o.t.id] }; })()`);
    // a 7px wobble: dropped at slop 5, a tap at slop 10
    const [x, y, id] = r.tree; const cdp = await p.context().newCDPSession(p);
    const tap = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 7, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(100); };
    const marked = () => p.evaluate(id => __farm.S.orders.some(o => o.type === 'chop' && o.id === id), id);
    await tap(); r.wobble5 = await marked(); await p.evaluate(() => __farm.setTouch({ slop: 10 })); await tap(); r.wobble10 = await marked();
    await p.evaluate(() => { window.__taps = 0; __farm.setTouch({ onTap: () => { window.__taps++; return true; } }); }); await tap(); r.onTapTook = await p.evaluate(() => window.__taps); r.onTapKept = await marked(); await p.evaluate(() => __farm.setTouch({ onTap: null })); return r; },
    r => !r.a0.ok || r.a0.marked ? 'aim before ' + JSON.stringify(r.a0) : !r.c0.ok || r.c0.removed ? 'commit ' + JSON.stringify(r.c0) : !r.a1.marked ? 'not shown as marked' : !r.c1.removed ? 'second commit did not unmark'
      : r.miss.ok !== false ? 'miss ' + JSON.stringify(r.miss) : !r.plantGood || !r.plantGood.ok ? 'plant good ' + JSON.stringify(r.plantGood) : !r.plantBad || r.plantBad.ok ? 'plant bad ' + JSON.stringify(r.plantBad)
      : !r.decor || !r.decor.ok ? 'decor ' + JSON.stringify(r.decor) : r.wobble5 ? '7px wobble counted at slop 5' : !r.wobble10 ? '7px wobble lost at slop 10' : r.onTapTook !== 1 || !r.onTapKept ? 'onTap did not take the tap ' + r.onTapTook : null);

  // 3. pick floor: a point 16 CSS px off a bench misses at pickCss 0 and picks it at 22; aimAt names it; commitAt picks and unpicks
  // 4. 收回: the family carries it to the storehouse; it stays there over nights (not set down again), and placing it by hand uses the kept piece
  await shot('store.png', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, null, async p => p.evaluate(`(() => { ${setup}
    f.buy('bench'); until(() => S.decor.placed.some(q => q.id === 'bench'), 900); const q = S.decor.placed.find(q => q.id === 'bench'); f.panTo(q.x, q.y); f.render();
    const c = f.toClient(q.x, q.y), off = [c.x + 16, c.y]; f.setMode('move'); const m0 = f.aimAt(off[0], off[1]); f.setTouch({ pickCss: 22 }); const m1 = f.aimAt(off[0], off[1]);
    const pick = f.commitAt(off[0], off[1]); const pk = f.input.mvPick; const store = f.storeThing(pk); f.setMode(null);
    const party = f.storeThing({ what: 'decor', id: 'party', ref: 1 }), work = f.storeThing({ what: 'work', ref: 'mill' });
    until(() => !S.decor.orders.some(o => o.op === 'store'), 900); const gone = !S.decor.placed.some(p => p.u === q.u), inv1 = S.decor.inv.bench | 0, kept1 = f.keptOf('bench');
    for (let d = 0; d < 2; d++) until(() => S.t % 1440 < 60, 2000); f.decorNight && f.decorNight(); until(() => (S.t % 1440) > 10 * 60, 2000);
    const inv2 = S.decor.inv.bench | 0, placed2 = S.decor.placed.filter(p => p.id === 'bench').length;
    const snap = JSON.parse(JSON.stringify(f.snapshot())), sv = snap.saveVersion, keptSaved = snap.decor && snap.decor.kept;
    f.setMode('decor', 'bench'); const R = document.querySelector('canvas').getBoundingClientRect(); let ok = null; for (let yy = R.top + 10; yy < R.bottom && !ok; yy += 6) for (let xx = R.left + 10; xx < R.right; xx += 6) { if (f.aimAt(xx, yy).ok) { ok = f.commitAt(xx, yy).r; break; } }
    until(() => !S.decor.orders.some(o => o.mine), 900); f.setMode(null); f.panTo(q.x, q.y); f.render();
    return { m0: !!m0.what, m1: m1.what && m1.what.what, pick: !!pk, store, party: party.ok, work: work.ok, gone, inv1, kept1, inv2, placed2, sv, keptSaved, place: ok, kept3: f.keptOf('bench'), placed3: S.decor.placed.filter(p => p.id === 'bench').length }; })()`),
    r => r.m0 ? 'picked at 16px with no floor' : r.m1 !== 'decor' ? 'no pick at 22px floor' : !r.pick || !r.store.ok ? 'store ' + JSON.stringify(r.store) : r.party || r.work ? 'stored a party area / workshop'
      : !r.gone || r.inv1 !== 1 || r.kept1 !== 1 ? 'not stored ' + JSON.stringify(r) : r.inv2 !== 1 || r.placed2 !== 0 ? 'the family set the kept piece down again' : r.sv !== 15 ? 'saveVersion ' + r.sv : !r.keptSaved || r.keptSaved.bench !== 1 ? 'kept not saved'
      : !r.place || !r.place.ok || r.kept3 !== 0 || r.placed3 !== 1 ? 'hand place ' + JSON.stringify(r) : null);

  // 5. fixtures still load at save v15 with no kept field
  for (const fn of ['save-v10-day59-manor.json', 'save-v15-day72-cottage.json']) { const save = readSave(path.join(__dirname, 'fixtures', fn));
    await shot('fixture_' + fn.replace('.json', '.png'), null, save, p => p.evaluate(() => { const s = __farm.snapshot(); return { sv: s.saveVersion, day: s.clock.day, kept: 'kept' in s.decor, touch: __farm.setTouch() }; }),
      r => r.sv !== 15 ? 'saveVersion ' + r.sv : r.kept ? 'kept appeared' : r.touch.slop !== 5 ? 'slop' : null); }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
