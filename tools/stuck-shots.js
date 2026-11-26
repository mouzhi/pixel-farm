// Browser checks + screenshot for v5.12.9 (宠物和动物不再卡住):  node tools/stuck-shots.js
//   writes $PF_SHOTS/v5129_*.png (default /workspace/pf-stuck/shots); exits 1 on a page error or a failed check.
//   Synthetic save only: the committed day-72 fixture plus a pig sty, two cats, a dog, the home fence and eight lamp posts
//   on their yard slots (the lamps at 45.5 and 66.5 on the front lawn, the fence and the house wall close a 4-cell pocket).
//   Never a player's save. PF_BEFORE=1: print what an older build does, no pass/fail (run it with PF_ROOT on an older checkout).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-stuck/shots', BEFORE = !!process.env.PF_BEFORE;
const PREFIX = BEFORE ? 'v5129_before_' : 'v5129_';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const POCKET = [{ id: 'cat0', x: 54, y: 44 }, { id: 'cat1', x: 47, y: 51.3 }, { id: 'dog0', x: 58, y: 44.5 }]; // inside the pocket / on the rail beside it
function makeSave() {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'), 'utf8')), s = raw.save || raw;
  const u = s.upgrades; u.sty = 1; u.pig = 2; u.cat = 2; u.dog = 1; u.fence = 1;
  s.animals.push({ id: 'pig0', kind: 'pig', h: 80, cd: 1, ready: 1, pet: 0 }, { id: 'pig1', kind: 'pig', h: 80, cd: 1, ready: 1, pet: 0 });
  s.decor.placed = [[45.5, 44.5], [66.5, 44.5], [80, 44.5], [112, 44.5], [128, 44.5], [70, 101.5], [122, 101.5], [134.5, 56]].map((p, i) => ({ u: i + 1, id: 'lamppost', x: p[0], y: p[1], d: 1 }));
  s.decor.n = 20; s.clock.t = Math.floor(s.clock.t / 1440) * 1440 + 9 * 60; s.farmer.sleeping = false; s.farmer.home = false; s.savedAt = Date.now();
  return raw.save ? raw : s;
}
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(makeSave()));
  await p.goto(base + '/index.html?manual&seed=7'); await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 30000 });
  await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log((BEFORE ? 'info ' : ok ? 'ok   ' : 'FAIL ') + msg); };
  const shot = async (name, x, y, ang) => { await p.evaluate(([x, y, ang]) => { const f = __farm; f.setAngle(ang); f.panTo(x, y); f.advance(0.05, 10); f.panTo(x, y); f.render(); for (const el of document.querySelectorAll('.toast,#toast')) el.hidden = true; }, [x, y, ang]);
    await p.screenshot({ path: path.join(OUT, PREFIX + name + '.png') }); console.log('wrote', PREFIX + name + '.png'); };

  // 1. the pocket exists, and three pets are put in / beside it (where a pet spawns: 6..20 east of the door, 6..14 south of it)
  const setup = await p.evaluate(POCKET => { const f = __farm, N = PFPath; f.advance(0.1, 10); const g = f.nav(), home = N.areaOf(g, 36, 40);
    for (const q of POCKET) { const v = f.PV.get(q.id); v.x = q.x; v.y = q.y; v.tx = q.x; v.ty = q.y; v.via = null; v.wait = 5; }
    return { pocketArea: N.areaOf(g, 54, 44), home, pets: [...f.PV.keys()] }; }, POCKET);
  check(setup.pocketArea >= 0 && setup.pocketArea !== setup.home, `the lamps, fence and house wall wall off a pocket in front of the house (area ${setup.pocketArea}, farm ${setup.home})`);
  check(POCKET.every(q => setup.pets.includes(q.id)), `the save has the cats and the dog (${setup.pets.join(', ')})`);
  if (BEFORE) await shot('pocket', 54, 46, 0.22);

  // 2. three game hours in daylight: every pet is back on the farm's walkable area and keeps moving about
  const run = await p.evaluate(POCKET => { const f = __farm, S = f.S, N = PFPath; const out = { off: [], moved: {}, first: null }; const last = {}; for (const q of POCKET) { const v = f.PV.get(q.id); last[q.id] = { x: v.x, y: v.y }; out.moved[q.id] = 0; }
    const t0 = S.t; while (S.t - t0 < 180) { f.advance(0.5, 10); const g = f.nav(), home = N.areaOf(g, 36, 40);
      for (const q of POCKET) { const v = f.PV.get(q.id); out.moved[q.id] += Math.hypot(v.x - last[q.id].x, v.y - last[q.id].y); last[q.id] = { x: v.x, y: v.y };
        const ar = N.areaOf(g, v.x, v.y), snap = ar < 0 ? N.nearestWalkable(g, v.x, v.y, 6) : null, stuck = ar >= 0 ? ar !== home : (snap ? N.areaOf(g, snap.x, snap.y) !== home : false);
        if (stuck && S.t - t0 > 60) out.off.push([q.id, +v.x.toFixed(1), +v.y.toFixed(1), Math.round(S.t - t0)]); } }
    out.pos = POCKET.map(q => { const v = f.PV.get(q.id); return [q.id, +v.x.toFixed(1), +v.y.toFixed(1)]; }); out.stats = f.stuckStats(); return out; }, POCKET);
  console.log(JSON.stringify(run));
  check(!run.off.length, `after the first game hour no pet stands in the pocket (${JSON.stringify(run.off.slice(0, 3))})`);
  check(Object.values(run.moved).every(d => d > 25), `every pet walks about (${Object.entries(run.moved).map(([k, d]) => k + ' ' + Math.round(d)).join(', ')})`);
  if (!BEFORE) check((run.stats.pet || 0) >= 2, `the stuck pets were stepped back onto the farm (${run.stats.pet || 0})`);

  // 3. a job that is dropped (given up, a wedding call, an error) no longer leaves its animal frozen: take a person who is
  //    working on an animal, drop their task the way giveUp does, and the animal must be free again
  const hold = await p.evaluate(() => { const f = __farm, S = f.S, N = PFPath; const people = () => [f.FARMER, ...S.members, ...f.SPOUSES]; let victim = null, view = null, kind = null, k0 = null;
    for (let i = 0; i < 2400 && !victim; i++) { f.advance(0.5, 10);
      for (const a of people()) { const k = a.task; if (k && k.an && /挤|剪|猪|梳|摸/.test(k.label || '')) { const v = f.AV.get(k.an.id); if (v && v.hold) { victim = a; view = v; kind = k.label; k0 = k; break; } } } }
    if (!victim) return { found: false };
    const held = view.hold, sim = view.sim, id = k0.an.id; victim.task = null; victim.moving = false; sim.pet = 1; sim.ready = 0; // dropped, and nothing else wants this animal today
    f.advance(0.2, 10); const live = people().some(a => a.task && a.task.an && a.task.an.id === id);
    return { found: true, who: victim.id || 'farmer', kind, held, after: view.hold, live, stats: f.stuckStats() }; });
  console.log(JSON.stringify(hold));
  check(hold.found && hold.held === 1, `somebody was working on an animal (${hold.kind}, ${hold.who})`);
  check(hold.found && !hold.after && !hold.live, 'the animal is free again once the job is dropped (hold released)');

  // 4. two game days of normal farm life: nothing frozen, nothing thrown
  const day = await p.evaluate(() => { const f = __farm, S = f.S, N = PFPath; const out = { frozen: [], offHome: [] }; const t0 = S.t; let n = 0;
    while (S.t - t0 < 2 * 1440) { f.advance(0.5, 10); if (++n % 40) continue; const g = f.nav(), home = N.areaOf(g, 36, 40);
      for (const [id, v] of f.AV) if (v.hold && !f.actors().some(a => a.task && a.task.an && a.task.an.id === id) && ![...f.SPOUSES].some(a => a.task && a.task.an && a.task.an.id === id)) out.frozen.push([id, Math.round(S.t)]);
      for (const [id, v] of f.PV) { const ar = N.areaOf(g, v.x, v.y); if (ar >= 0 && ar !== home) out.offHome.push([id, +v.x.toFixed(1), +v.y.toFixed(1), Math.round(S.t)]); } }
    out.day = S.day; return out; });
  console.log(JSON.stringify(day));
  check(!day.frozen.length, `no animal stays held without a job (${JSON.stringify(day.frozen.slice(0, 3))})`);
  check(!day.offHome.length, `no pet is found in a walled-off pocket over two days (${JSON.stringify(day.offHome.slice(0, 3))})`);

  // 5. the screenshot: daytime in front of the house; the three pets are put back into the pocket and a few minutes later stand on the lawn
  const lawn = await p.evaluate(POCKET => { const f = __farm, S = f.S, N = PFPath; while (S.t % 1440 > 12 * 60 || S.t % 1440 < 9 * 60) f.advance(2, 10);
    for (const q of POCKET) { const v = f.PV.get(q.id); v.x = q.x; v.y = q.y; v.tx = q.x; v.ty = q.y; v.via = null; v.hold = 0; v._pkT = 0; }
    const t0 = S.t; let n = 0; while (S.t - t0 < 60 && n++ < 200) { f.advance(0.25, 10); const g = f.nav(), home = N.areaOf(g, 36, 40);
      if (S.t - t0 > 2 && POCKET.every(q => { const v = f.PV.get(q.id); return N.areaOf(g, v.x, v.y) === home; })) break; }
    return { mins: Math.round(S.t - t0), pos: POCKET.map(q => { const v = f.PV.get(q.id); return [q.id, +v.x.toFixed(1), +v.y.toFixed(1)]; }) }; }, POCKET);
  console.log(JSON.stringify(lawn));
  const cx = lawn.pos.reduce((a, q) => a + q[1], 0) / lawn.pos.length, cy = lawn.pos.reduce((a, q) => a + q[2], 0) / lawn.pos.length;
  check(lawn.pos.every(q => Math.hypot(q[1] - 54, q[2] - 50) < 30), `within ${lawn.mins} game minutes all three are out on the front lawn`);
  await shot('lawn', cx, cy, 0.22);
  check(!errs.length, `no page errors${errs.length ? ': ' + errs[0] : ''}`);
  await b.close(); server.close();
  if (!BEFORE && fails.length) { console.log(fails.length + ' check(s) failed'); process.exit(1); }
  console.log(BEFORE ? 'done (before run)' : 'stuck-shots: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
