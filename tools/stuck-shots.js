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
  const run = await p.evaluate(POCKET => { const f = __farm, S = f.S, N = PFPath; const out = { off: [], moved: {}, first: null }; const last = {}, since = {}; for (const q of POCKET) { const v = f.PV.get(q.id); last[q.id] = { x: v.x, y: v.y }; out.moved[q.id] = 0; }
    const t0 = S.t; while (S.t - t0 < 180) { f.advance(0.5, 10); const g = f.nav(), home = N.areaOf(g, 36, 40);
      for (const q of POCKET) { const v = f.PV.get(q.id); out.moved[q.id] += Math.hypot(v.x - last[q.id].x, v.y - last[q.id].y); last[q.id] = { x: v.x, y: v.y };
        const stuck = f.petWalled(v.x, v.y); since[q.id] = stuck ? (since[q.id] == null ? S.t : since[q.id]) : null; // walking across a rail for a minute is fine; sitting walled in is not
        if (stuck && S.t - since[q.id] > 45) out.off.push([q.id, +v.x.toFixed(1), +v.y.toFixed(1), Math.round(S.t - t0)]); } }
    out.pos = POCKET.map(q => { const v = f.PV.get(q.id); return [q.id, +v.x.toFixed(1), +v.y.toFixed(1)]; }); out.stats = f.stuckStats(); return out; }, POCKET);
  console.log(JSON.stringify(run));
  check(!run.off.length, `no pet sits walled in for more than 45 game minutes (${JSON.stringify(run.off.slice(0, 3))})`);
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
  const day = await p.evaluate(() => { const f = __farm, S = f.S, N = PFPath; const out = { frozen: [], offHome: [], rescues0: f.stuckStats().pet || 0 }; const t0 = S.t; let n = 0;
    while (S.t - t0 < 2 * 1440) { f.advance(0.5, 10); if (++n % 40) continue; const g = f.nav(), home = N.areaOf(g, 36, 40);
      for (const [id, v] of f.AV) if (v.hold && !f.actors().some(a => a.task && a.task.an && a.task.an.id === id) && ![...f.SPOUSES].some(a => a.task && a.task.an && a.task.an.id === id)) out.frozen.push([id, Math.round(S.t)]);
      for (const [id, v] of f.PV) { if (f.petWalled(v.x, v.y)) out.offHome.push([id, +v.x.toFixed(1), +v.y.toFixed(1), Math.round(S.t)]); } }
    out.rescues = (f.stuckStats().pet || 0) - out.rescues0; out.day = S.day; return out; });
  console.log(JSON.stringify(day));
  check(!day.frozen.length, `no animal stays held without a job (${JSON.stringify(day.frozen.slice(0, 3))})`);
  check(!day.offHome.length, `no pet is found in a walled-off pocket over two days (${JSON.stringify(day.offHome.slice(0, 3))})`);

  console.log(`pet rescues over two game days of normal play: ${day.rescues}`);
  check(day.rescues <= 6, `pets are rescued rarely in normal play (${day.rescues} in two game days, three pets, lamp-heavy yard)`);

  // 4a. a dog on a truffle trip is rescued from the pocket: it must still go to its ORIGINAL target and drop one truffle there
  const dog = await p.evaluate(() => { const f = __farm, S = f.S, N = PFPath, p = f.PETS_LIVE.find(q => q.kind === 'dog'), v = f.PV.get(p.id);
    while (S.t % 1440 > 11 * 60 || S.t % 1440 < 9 * 60) f.advance(2, 10);
    S.loose.length = 0; v.hold = 0; v.job = null; v.x = 58; v.y = 44.5; v.tx = 58; v.ty = 44.5; v.via = null; v._pk = -1; v._pkT = 0;
    f.dogSurprise(p, 'truffle'); const job = { x: v.job.x, y: v.job.y }, wait0 = v.wait, n0 = S.loose.length, t0 = S.t; let arrived = null, dropT = null;
    for (let i = 0; i < 600 && dropT == null; i++) { f.advance(0.5, 10); if (arrived == null && Math.hypot(v.x - job.x, v.y - job.y) < 1.5) arrived = S.t - t0; if (S.loose.length > n0) dropT = S.t - t0; }
    const tr = S.loose.filter(l => l.type === 'truffle'); const last = tr[tr.length - 1];
    return { job, wait0, arrived: arrived == null ? null : Math.round(arrived), dropT: dropT == null ? null : Math.round(dropT), n: tr.length, at: last ? [+last.x.toFixed(1), +last.y.toFixed(1)] : null, rescues: f.stuckStats().pet }; });
  console.log(JSON.stringify(dog));
  check(dog.arrived != null && dog.dropT != null && dog.arrived <= dog.dropT, `the rescued dog walks on to its truffle spot (${JSON.stringify(dog.job)}), arriving after ${dog.arrived} min and digging at ${dog.dropT}`);
  check(dog.n === 1 && dog.at && Math.hypot(dog.at[0] - dog.job.x, dog.at[1] - dog.job.y) < 4, `exactly one truffle, dropped at the original target, not at the rescue point (${JSON.stringify(dog.at)})`);

  // 4b. 阿禾 beside a chicken that stands by the coop: the spot 7 west of it is inside the coop's block. The map is rebuilt every few minutes on a busy farm (the test rebuilds it every half minute)
  //     (crops, trees, decorations change it); a re-plan used to walk her off the spot and back each time, so a 4-minute pat took an hour or more.
  const pat = await p.evaluate(() => { const f = __farm, S = f.S, N = PFPath, m = S.members.find(q => q.id === 'partner'); const out = { trials: [] };
    const hen = S.animals.filter(a => a.kind === 'chicken')[0], v = f.AV.get(hen.id);
    for (const [x, y] of [[28.3, 65], [25.4, 70.1], [24.7, 67.5], [21.5, 63.8], [41, 71.6]]) {
      v.x = x; v.y = y; v.tx = x; v.ty = y; v.via = null; v.hold = 0; for (const a of S.animals) { a.pet = 1; a.ready = 0; } hen.pet = 0;
      f.setF(m); m.x = 39; m.y = 40; m.home = false; m.sleeping = false; const k = f.jobs.petTask(hen); k.work = 0; k.via = f.routeVia(m, k.to); m.task = k;
      const g = f.nav(), c = N.cellOf(g, k.to.x, k.to.y), blocked = N.cellCost(g, c[0], c[1]) === N.BLOCKED, t0 = S.t; let done = false;
      for (let i = 0; i < 300; i++) { f.advance(0.5, 10); f.markNavDirty(); if (m.task !== k) { done = true; break; } }
      out.trials.push({ at: [x, y], blockedStand: blocked, done, min: Math.round(S.t - t0), hold: v.hold }); m.task = null; v.hold = 0; }
    // a job that drags on (here: 999 minutes of work) is dropped after JOB_MAX_MIN, the animal is let go and left alone for the day
    v.x = 41; v.y = 71.6; v.tx = 41; v.ty = 71.6; hen.pet = 0; f.setF(m); m.x = 39; m.y = 40; const kk = f.jobs.petTask(hen); kk.dur = 999; kk.work = 0; kk.via = f.routeVia(m, kk.to); m.task = kk; const t1 = S.t;
    for (let i = 0; i < 400 && m.task === kk; i++) f.advance(0.5, 10);
    out.long = { dropped: m.task !== kk, min: Math.round(S.t - t1), hold: v.hold, stats: f.stuckStats() }; return out; });
  console.log(JSON.stringify(pat));
  check(pat.trials.some(t => t.blockedStand), 'at least one stand spot beside the hens really is inside a block (coop / hay)');
  check(pat.trials.every(t => t.done && t.min <= 25 && !t.hold), `every pat is done within 25 game minutes even with the map rebuilt every half minute (${pat.trials.map(t => t.min).join(', ')})`);
  check(pat.long.dropped && pat.long.min <= 60 && !pat.long.hold, `a job that never ends is dropped after about 45 minutes and its animal let go (${pat.long.min} min)`);

  // 5. the screenshot: daytime in front of the house; the three pets are put back into the pocket and a few minutes later stand on the lawn
  const lawn = await p.evaluate(POCKET => { const f = __farm, S = f.S, N = PFPath; while (S.t % 1440 > 12 * 60 || S.t % 1440 < 9 * 60) f.advance(2, 10);
    for (const q of POCKET) { const v = f.PV.get(q.id); v.x = q.x; v.y = q.y; v.tx = q.x; v.ty = q.y; v.via = null; v.hold = 0; v._pkT = 0; }
    const t0 = S.t, r0 = f.stuckStats().pet || 0; let n = 0; while (S.t - t0 < 60 && n++ < 200) { f.advance(0.25, 10); if ((f.stuckStats().pet || 0) - r0 >= POCKET.length) break; } // stop as soon as all three have been stepped out
    return { mins: Math.round(S.t - t0), pos: POCKET.map(q => { const v = f.PV.get(q.id); return [q.id, +v.x.toFixed(1), +v.y.toFixed(1)]; }) }; }, POCKET);
  console.log(JSON.stringify(lawn));
  const cx = lawn.pos.reduce((a, q) => a + q[1], 0) / lawn.pos.length, cy = lawn.pos.reduce((a, q) => a + q[2], 0) / lawn.pos.length;
  check(lawn.pos.every(q => Math.hypot(q[1] - 54, q[2] - 50) < 30), `all three were stepped out onto the front lawn within ${lawn.mins} game minutes`);
  await shot('lawn', cx, cy, 0.22);
  check(!errs.length, `no page errors${errs.length ? ': ' + errs[0] : ''}`);
  await b.close(); server.close();
  if (!BEFORE && fails.length) { console.log(fails.length + ' check(s) failed'); process.exit(1); }
  console.log(BEFORE ? 'done (before run)' : 'stuck-shots: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
