// Browser checks + screenshots for v5.12.7 (砍树不再卡住):  node tools/chop-shots.js
//   writes $PF_SHOTS/v5127_*.png (default /workspace/v5127-shots); exits 1 on a page error or a failed check.
//   Synthetic save only: the committed day-72 fixture with a thick stand of trees at 林场's west end (some hard against
//   the west fence, one boxed in on every side, a closed ring of trunks with the farmer saved inside it). Never a player's save.
//   PF_BEFORE=1: screenshots only, no checks (run it against an older build to show the old behaviour).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/v5127-shots', BEFORE = !!process.env.PF_BEFORE;
const CHOP_ANG = 1.57; // a quarter turn: 林场's west fence runs down the left and the person beside the trunk is in front of the thicket
const PREFIX = BEFORE ? 'v5127_before_' : 'v5127_';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });

// the synthetic thicket (world units; 林场 is x 0..192, y -104..-38, its west fence on x = 0)
const RING = { x: 22, y: -66 };   // the farmer is saved in the middle of a closed ring of trunks
const BOX = { x: 52, y: -84 };    // a tree with trunks on every side: nobody can reach it until a neighbour falls
function makeSave() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'), 'utf8')), s = raw.save || raw;
  s.trees = s.trees.filter(t => !(t.x < 70 && t.y < -40 && t.y > -104));
  let k = 0; const add = (x, y, id) => { const t = { id: id || 'q' + (k++), x: Math.round(x), y: Math.round(y), kind: 'wild', v: k % 8, stage: 'tree', age: 0, ripe: 0, cd: 0 }; s.trees.push(t); return t; };
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; add(RING.x + Math.cos(a) * 10, RING.y + Math.sin(a) * 8, 'ring' + i); }
  add(BOX.x, BOX.y, 'boxed'); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(BOX.x + Math.cos(a) * 10, BOX.y + Math.sin(a) * 8, 'box' + i); }
  for (const y of [-96, -84, -48]) add(5, y, 'west' + y); // hard against the west fence: the old stand spot (8 west of the trunk) is outside it
  add(184, -62, 'huttree'); // east end beside the lumber hut (170, -61): old stand (176, -60) is inside the hut block
  s.farmer.x = RING.x; s.farmer.y = RING.y; s.farmer.sleeping = false; s.farmer.home = false;
  s.clock.t = Math.floor(s.clock.t / 1440) * 1440 + 9 * 60;
  s.orders = ['west-96', 'west-84', 'west-48', 'ring0', 'ring2', 'ring4', 'boxed', 'box0', 'box4'].map(id => ({ type: 'chop', id }));
  s.savedAt = Date.now(); return raw.save ? raw : s;
}
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  const save = makeSave(); await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(save));
  await p.goto(base + '/index.html?manual&seed=7'); await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 30000 });
  await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
  // full page plus a 3x close-up around (x, y); the camera looks from the north so the house does not hide 林场
  const shot = async (name, x, y, ang) => {
    const c = await p.evaluate(([x, y, ang]) => { const f = __farm; f.setAngle(ang == null ? Math.PI : ang); f.panTo(x, y); f.advance(0.05, 10); f.panTo(x, y); f.render();
      for (const el of document.querySelectorAll('.toast,#toast')) el.hidden = true; const [sx, sy] = f.proj(x, y), cv = document.getElementById('game'); return { sx, sy, data: cv.toDataURL() }; }, [x, y, ang]);
    await p.screenshot({ path: path.join(OUT, PREFIX + name + '.png') });
    const close = await p.evaluate(async i => { const img = new Image(); await new Promise(r => { img.onload = r; img.src = i.data; });
      const W = 260, H = 160, K = 3, cv = document.createElement('canvas'); cv.width = W * K; cv.height = H * K; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(img, Math.max(0, Math.round(i.sx) - W / 2), Math.max(0, Math.round(i.sy) - H * 0.6), W, H, 0, 0, W * K, H * K); return cv.toDataURL(); }, c);
    fs.writeFileSync(path.join(OUT, PREFIX + name + '_close.png'), Buffer.from(close.split(',')[1], 'base64'));
    console.log('wrote', PREFIX + name + '.png', PREFIX + name + '_close.png'); };
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((ok ? 'ok   ' : 'FAIL ') + msg); };

  if (BEFORE) await shot('ring', RING.x, RING.y, CHOP_ANG); // the old build: he stands where the save left him, inside the ring
  // 1. load: the farmer was saved inside the closed ring; he steps out onto the farm's side before his first job
  const load = await p.evaluate(({ RING }) => { const f = __farm, S = f.S, F = f.FARMER, N = PFPath, g = f.nav ? f.nav() : null;
    const r0 = g && N.areaOf ? { door: N.areaOf(g, 36, 40), at: N.areaOf(g, RING.x, RING.y) } : null;
    f.advance(0.2, 10); const g2 = f.nav ? f.nav() : null;
    return { r0, home: g2 && N.areaOf ? N.areaOf(g2, F.x, F.y) === N.areaOf(g2, 36, 40) : null, x: F.x, y: F.y, boxed: f.orderChop('boxed'), boxedStand: f.treeStand ? f.treeStand(S.trees.find(t => t.id === 'boxed')) : null }; }, { RING });
  if (!BEFORE) {
    check(load.r0 && load.r0.at !== load.r0.door, 'the ring really is a closed pocket (its own walkable area)');
    check(load.home, `on load the farmer steps out of the ring onto the farm (${load.x.toFixed(1)}, ${load.y.toFixed(1)})`);
    check(load.boxedStand === null, 'the boxed-in tree has no stand spot');
    // orderChop toggles: 'boxed' was already marked in the save, so this call removed it; mark it again to see the refusal
    const again = await p.evaluate(() => __farm.orderChop('boxed'));
    check(load.boxed.removed && !again.ok && /走不过去/.test(again.why || ''), 'marking a boxed-in tree is refused with a reason');
  }
  // 2. work through the marks: every chop is done from the tree's own side of the fence, nobody stays stuck
  const run = await p.evaluate(({ BEFORE }) => { const f = __farm, S = f.S, WD = PFWorld, N = PFPath;
    const out = { outside: [], standBad: [], still: 0, chopShot: null, maxStill: 0 }; const last = new Map();
    for (let i = 0; i < 540 && S.t % 1440 < 15 * 60; i++) { f.advance(0.5, 10);
      const g = f.nav ? f.nav() : null, home = g && N.areaOf ? N.areaOf(g, 36, 40) : null;
      for (const a of f.actors()) { const k = a.task; if (!k || a.sleeping || a.home) continue; const id = a.id || 'farmer';
        const chop = /砍/.test(k.label || '');
        if (chop && a.y < -38 && a.y > -104 && a.x < 0) out.outside.push([id, +a.x.toFixed(1), +a.y.toFixed(1), Math.round(S.t % 1440)]);
        if (chop && k.tile && home != null) { const okSide = WD.areaAt(k.to.x, k.to.y) === WD.areaAt(k.tile.x, k.tile.y), okArea = N.areaOf(g, k.to.x, k.to.y) === home; if (!okSide || !okArea) out.standBad.push([id, k.tile.id, k.to.x, k.to.y]); }
        if (chop && !out.chopShot && k.work > 3 && a.x > 0 && Math.hypot(a.x - k.to.x, a.y - k.to.y) < 1) out.chopShot = { x: a.x, y: a.y, who: id, tree: k.tile && k.tile.id };
        if (BEFORE && chop && !out.beforeShot && a.x < 0 && a.y < -38 && k.work > 3) out.beforeShot = { x: a.x, y: a.y, who: id };
        const L = last.get(id); if (!L || Math.hypot(L.x - a.x, L.y - a.y) > 0.5 || L.k !== k) last.set(id, { x: a.x, y: a.y, k, t: S.t });
        else if (!k.rest && Math.hypot(k.to.x - a.x, k.to.y - a.y) > 0.5) out.maxStill = Math.max(out.maxStill, S.t - L.t); }
      if (out.chopShot && !out.shotDone && !BEFORE) { out.shotDone = 1; break; }
      if (BEFORE && out.beforeShot) break; }
    out.t = S.t % 1440; out.orders = S.orders.map(o => o.id); return out; }, { BEFORE });
  if (BEFORE) { const s = run.beforeShot || run.chopShot; if (s) await shot('outside', s.x, s.y, -CHOP_ANG); } // from the west: the one outside the fence is in front of it
  else {
    if (run.chopShot) { if (process.env.PF_ANGLES) for (const a of [0, 0.25, 1.57, -1.57, 2.4, -2.4]) await shot('chopping_a' + a, run.chopShot.x, run.chopShot.y, a); await shot('chopping', run.chopShot.x, run.chopShot.y, CHOP_ANG); }
    check(!!run.chopShot, `someone fells a marked tree from inside 林场 (${run.chopShot ? run.chopShot.who + ' at ' + run.chopShot.tree : 'none'})`);
  }
  const rest = await p.evaluate(({ BEFORE }) => { const f = __farm, S = f.S, out = { outside: [], maxStill: 0 }; const last = new Map();
    for (let i = 0; i < 900 && S.t % 1440 < 17 * 60; i++) { f.advance(0.5, 10);
      for (const a of f.actors()) { const k = a.task; if (!k || a.sleeping || a.home) continue; const id = a.id || 'farmer';
        if (/砍/.test(k.label || '') && a.y < -38 && a.y > -104 && a.x < 0) out.outside.push([id, +a.x.toFixed(1), +a.y.toFixed(1)]);
        const L = last.get(id); if (!L || Math.hypot(L.x - a.x, L.y - a.y) > 0.5 || L.k !== k) last.set(id, { x: a.x, y: a.y, k, t: S.t });
        else if (!k.rest && Math.hypot(k.to.x - a.x, k.to.y - a.y) > 0.5) out.maxStill = Math.max(out.maxStill, S.t - L.t); } }
    out.left = S.orders.map(o => S.trees.find(t => t.id === o.id)).filter(Boolean).map(t => [t.id, t.stage, !!f.treeStand(t)]); out.stats = f.stuckStats ? f.stuckStats() : null; out.orders = S.orders.map(o => o.id); out.trees = Object.fromEntries(S.trees.filter(t => /^(west|ring|box)/.test(t.id)).map(t => [t.id, t.stage])); return out; }, { BEFORE });
  if (!BEFORE) {
    const outside = run.outside.concat(rest.outside), stuckMin = Math.max(run.maxStill, rest.maxStill);
    check(!outside.length, `nobody chops from outside 林场's west fence (${JSON.stringify(outside.slice(0, 3))})`);
    check(!run.standBad.length, `every chop stand is on the tree's side of its fence and joined to the farm (${JSON.stringify(run.standBad.slice(0, 3))})`);
    const felled = Object.entries(rest.trees).filter(([, st]) => st !== 'tree').map(([id]) => id);
    // a mark still standing at 17:00 must be one nobody can walk up to yet (walled in by trunks and the fence)
    check(rest.left.every(([, st, reach]) => st === 'tree' && !reach), `every reachable marked tree is felled by 17:00; the rest are walled in (${JSON.stringify(rest.left)})`);
    check(felled.length >= 5 && felled.includes('west-48'), `the reachable marks are felled, west-48 too (${felled.join(', ')})`);
    check(stuckMin < 70, `nobody stands still short of their target for an hour (longest ${Math.round(stuckMin)} min)`);
  }
  // 3. day-2 regression cases: (a) worker outside the top-left west fence steps back inside on load/idle;
  //    (b) tree near the east-end lumber hut has a valid stand outside the hut block;
  //    (c) worker in '正在砍树' next to a fresh stump drops the job at once and moves on;
  //    (d) a walk that gets nowhere is dropped after STUCK_MIN walking minutes
  if (!BEFORE) {
    const day2 = await p.evaluate(() => { const f = __farm, S = f.S, F = f.FARMER, N = PFPath, WD = PFWorld, m = S.members.find(q => q.id === 'partner');
      // (a) place partner outside 林场's top-left west fence (wrong side of fence, in wild rim where areaOf === doorArea)
      m.x = -8; m.y = -92; m.task = null; m.home = false; m.sleeping = false;
      f.advance(0.1, 10);
      const backIn = f.validStand(m.x, m.y) && WD.areaAt(m.x, m.y) === 'forest';
      const backPos = [Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10];
      // (b) huttree beside the east-end lumber hut: stand must be walkable & outside hut block [159,-68,181,-54]
      const ht = S.trees.find(t => t.id === 'huttree');
      const hst = ht && f.treeStand(ht), g = f.nav();
      const hutOk = !!(hst && N.areaOf(g, hst.x, hst.y) === N.areaOf(g, 36, 40) && !(hst.x >= 159 && hst.x <= 181 && hst.y >= -68 && hst.y <= -54));
      // (c) partner standing next to ht with '正在砍树' when ht turns into a fresh stump
      const st = hst || { x: 184, y: -54 };
      m.x = st.x; m.y = st.y; m.task = { label: '正在砍树', to: st, tile: ht, tree: ht, dur: 20, kind: 'chop', work: 5 };
      ht.stage = 'stump'; f.advance(0.2, 10);
      const ended = !m.task || m.task.tree !== ht;
      const nextLabel = m.task && m.task.label;
      // (d) the stuck watch: a walk that cannot move (speed ~0) is given up after STUCK_MIN game minutes
      const g0 = f.stuckStats ? f.stuckStats().giveup : 0, spd = F.spd; F.spd = 1e-9; F.task = { kind: 'test', label: '测试走路', to: { x: F.x + 60, y: F.y }, dur: 1, work: 0 }; f.advance((f.STUCK_MIN + 10) / 3, 10); F.spd = spd;
      return { backIn, backPos, hutOk, hst, ended, nextLabel, gaveUp: f.stuckStats().giveup - g0, label: F.task && F.task.label }; });
    check(day2.backIn, `worker outside top-left west fence steps back inside 林场 (${JSON.stringify(day2.backPos)})`);
    check(day2.hutOk, `tree near east-end lumber hut picks a stand outside hut block (${JSON.stringify(day2.hst)})`);
    check(day2.ended, `worker in '正在砍树' next to a fresh stump drops it immediately (next: ${day2.nextLabel})`);
    check(day2.gaveUp >= 1 && day2.label !== '测试走路', `a walk that gets no closer is dropped after STUCK_MIN (now: ${day2.label})`);
  }
  // 4. evening: everyone walks home through the gate, not round the outside of the fence
  const walk = await p.evaluate(() => { const f = __farm, F = f.FARMER; let w = null;
    for (let i = 0; i < 1500 && !w; i++) { f.advance(0.5, 10); if (F.task && F.task.label === '回家睡觉' && F.moving && Math.hypot(F.x - 36, F.y - 40) > 30) w = { x: F.x, y: F.y }; }
    return w; });
  if (walk && !BEFORE) await shot('walking_home', walk.x, walk.y, 0);
  const home = await p.evaluate(() => { const f = __farm, S = f.S, F = f.FARMER; let n = 0; while (n++ < 400 && !F.sleeping) f.advance(0.5, 10); return { slept: F.sleeping, t: S.t % 1440 }; });
  if (!BEFORE) check(!!walk && home.slept, `the farmer walks home and goes to bed (${home.slept ? 'asleep' : 'not asleep'} at ${Math.floor(home.t / 60)}:${String(Math.floor(home.t % 60)).padStart(2, '0')})`);
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); fails.push('page errors'); }
  await b.close(); server.close();
  if (fails.length && !BEFORE) { console.log('FAILED:', fails.length); process.exit(1); } console.log(BEFORE ? 'before shots done' : 'chop-shots: all checks passed');
})();
