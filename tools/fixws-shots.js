// v5.10.12: workshops move across 工坊院 plots; a 工坊院 can be re-zoned.  node tools/fixws-shots.js [name-filter]
//   writes /workspace/pf-shots/fixws_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
// Player report: 「加工坊不能跨区域移动，只能在同一个工坊地里挪，一个区域一旦变成工坊就没有后悔药吃了」.
// Rules: with 挪东西 a workshop goes to any owned 工坊院 that has a free slot (3 per yard; green outline, red when full);
// its goods and progress go with it. Re-zoning a 工坊院 moves its workshops to another yard with room, or stores them
// (state kept) until a yard has room again, when the family puts them back up.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
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
    if (save) { save = Object.assign({}, save, { savedAt: Date.now() }); await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const W = id => S.works.works[id], yard = id => f.PL.plot(id).rect, mid = id => { const r = yard(id); return { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }; };
    const spotIn = (id, ref, avoid) => { const c = mid(id), sk = { what: 'work', ref }; for (let r = 0; r <= 40; r += 2) for (let a = 0; a < 24; a++) { const x = c.x + r * Math.cos(a * Math.PI / 12), y = c.y + r * Math.sin(a * Math.PI / 12);
      if (avoid && avoid.some(p => Math.hypot(p.x - x, p.y - y) < 16)) continue; const q = f.placeOk(x, y, 'work', null, sk); if (q.ok) return q; } return null; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { const s = document.getElementById('say'); if (s) s.hidden = true; };
    const state = id => { const w = W(id); return w ? { at: w.at, slot: w.slot, inp: w.inp, left: Math.round(w.left), ready: w.ready } : null; };`;
  // a farm with the mill, the jam shop and the dairy in 西河湾's 工坊院, and an empty 工坊院 at 南河湾
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 3000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','fold','shed','can','can','cow']) f.buy(id);
    f.buyPlot('wbank', 'workshop'); const built = ['mill', 'jam', 'cheese'].map(id => f.buy(id).ok); f.buyPlot('sbank', 'workshop'); dry(); at(9 * 60);
    W('mill').inp = 4; W('mill').ready = 2; W('jam').inp = 2; W('cheese').ready = 1;`;
  const shot = async (name, fn, check, save) => { name = 'fixws_' + name; if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  // 1. 挪东西 with the mill picked: every 工坊院 is outlined (here 南河湾, another region: green, room for 3); the hover is green
  await shot('move_targets.png', `(() => { ${setup} const p0 = f.PW.workPos(W('mill'));
    f.setMode('move'); f.decorClick(p0); const picked = f.input.mvPick && f.input.mvPick.ref, said = document.getElementById('say').textContent;
    const to = spotIn('sbank', 'mill'); const home = f.placeOk(f.DOOR.x + 40, f.DOOR.y + 40, 'work', null, { what: 'work', ref: 'mill' });
    look(mid('sbank').x, mid('sbank').y - 4, 0.2); f.input.hover = f.decorHover(to); f.render();
    return { built: ${'built'}, picked, said, to: to && [to.x, to.y], hoverOk: f.input.hover.dec.ok, homeNo: !home.ok && home.why }; })()`,
    r => r.built.some(x => !x) ? 'build ' + r.built : r.picked !== 'mill' ? 'pick' : !/工坊院/.test(r.said) ? 'say ' + r.said : !r.to || !r.hoverOk ? 'no green spot in the other yard' : !/工坊院/.test(r.homeNo || '') ? 'home yard accepted: ' + r.homeNo : null);

  // 2. the mill moves to 南河湾 (another region): goods and progress go along, the family delivers to and collects at its new door
  await shot('moved_working.png', `(() => { ${setup} const obj = W('mill'), p0 = f.PW.workPos(obj); W('mill').inp = 1; // below a batch, so nothing is used up while the order waits
    f.setMode('move'); f.decorClick(p0); const to = spotIn('sbank', 'mill'); const r = f.decorClick(to); f.setMode(null);
    let moved = null; for (let i = 0; i < 900 && S.decor.orders.length; i++) { f.advance(1, 10); if (!moved && W('mill').at === 'sbank') moved = state('mill'); }
    const p1 = f.PW.workPos(W('mill')), door = f.PWA.doorOf('mill'), same = W('mill') === obj;
    const m = W('mill'); m.inp = 0; m.ready = 0; m.left = 0; let near = 0, got = 0, made = 0;
    for (let i = 0; i < 8 * 24 * 6 && !(got && made && near); i++) { f.advance(1, 10); if (W('mill').at !== 'sbank') break;
      if ([f.FARMER].concat(S.members).some(a => a && Math.hypot(a.x - door.x, a.y - door.y) < 6)) near = 1;
      if (W('mill').inp > 0 || W('mill').left > 0) got = 1; if (W('mill').ready > 0 || S.events.some(e => /面粉/.test(e.msg))) made = 1; }
    look(p1.x, p1.y, 0.2); hide();
    return { ok: r && r.ok, moved, same, inYard: f.PL.plotAt(p1.x, p1.y).id, near, got, made, at2: W('mill').at, day: S.day, log: S.events.map(e => e.msg).filter(m => /搬到了南河湾/.test(m)).slice(0, 2) }; })()`,
    r => !r.ok ? 'order' : !r.moved || r.inYard !== 'sbank' ? 'not in 南河湾' : !r.same || r.moved.inp !== 1 ? 'goods lost ' + JSON.stringify(r.moved) : !r.near ? 'nobody went to the new door' : !r.got ? 'no wheat delivered' : !r.made ? 'no flour' : r.at2 !== 'sbank' ? 'drifted' : !r.log.length ? 'no log' : null);

  // 3. re-zoning 西河湾 (工坊院 → 农田): the shop says where its workshops go; they move to 南河湾 with their goods
  await shot('rezone_note.png', `(() => { ${setup} f.refreshUI(); f.openPlot('wbank'); f.refreshUI(); const el = document.querySelector('#shop .ws-note'), busy = f.plotBusy('wbank');
    const btn = document.querySelector('#shop [data-pzone="wbank:field"]');
    return { note: el && el.textContent, busy, btn: !!btn && !btn.disabled }; })()`,
    r => !r.note || !/南河湾/.test(r.note) ? 'note ' + r.note : r.busy ? 'still busy: ' + r.busy : !r.btn ? 'rezone button disabled' : null);
  await shot('rezone_moved.png', `(() => { ${setup} const b4 = ['mill', 'jam', 'cheese'].map(state); const r = f.rezonePlot('wbank', 'field'); const af = ['mill', 'jam', 'cheese'].map(state);
    f.advance(1, 10); look(mid('sbank').x, mid('sbank').y, 0.2); hide();
    return { ok: r.ok, why: r.why, plot: S.plots.wbank.mod, b4, af, log: S.events.map(e => e.msg).filter(m => /加工坊/.test(m)).slice(0, 3) }; })()`,
    r => !r.ok ? 'rezone ' + r.why : r.plot !== 'field' ? 'mod ' + r.plot : r.af.some(w => w.at !== 'sbank') ? 'not moved ' + JSON.stringify(r.af) : r.af.some((w, i) => w.inp !== r.b4[i].inp || w.ready !== r.b4[i].ready) ? 'state lost' : new Set(r.af.map(w => w.slot)).size !== 3 ? 'slots clash' : null);

  // 4. no other yard has room: they wait in the storehouse (goods kept, the shop card says so), then go up in a new 工坊院
  await shot('stored_restock.png', `(() => { ${setup} f.rezonePlot('sbank', 'field'); const r = f.rezonePlot('wbank', 'field'); const stored = ['mill', 'jam', 'cheese'].map(state);
    for (let i = 0; i < 200; i++) f.advance(1, 10); const still = ['mill', 'jam', 'cheese'].map(state);
    const b = f.buyPlot('eshore', 'workshop'); const back = ['mill', 'jam', 'cheese'].map(state); f.advance(0.5, 10);
    look(mid('eshore').x, mid('eshore').y, 0.2); hide();
    return { ok: r.ok, stored, still, bought: b.ok, back, log: S.events.map(e => e.msg).filter(m => /收进仓库|重新盖好/.test(m)).slice(0, 4) }; })()`,
    r => !r.ok ? 'rezone' : r.stored.some(w => w.at !== null) ? 'not stored ' + JSON.stringify(r.stored) : r.still.some((w, i) => w.inp !== r.stored[i].inp || w.ready !== r.stored[i].ready) ? 'stored workshops changed' : !r.bought ? 'buy eshore' : r.back.some(w => w.at !== 'eshore') ? 'not back up ' + JSON.stringify(r.back) : r.back.some((w, i) => w.inp !== r.stored[i].inp || w.ready !== r.stored[i].ready) ? 'state lost' : null);
  // and a stored workshop survives a save / load round trip
  await shot('stored_reload.png', `(() => { ${setup} f.rezonePlot('sbank', 'field'); f.rezonePlot('wbank', 'field'); const s = f.snapshot(); return { works: s.works.works, ver: f.version }; })()`,
    r => !r.works.mill || r.works.mill.at !== null || r.works.mill.inp !== 4 ? 'saved ' + JSON.stringify(r.works) : r.ver !== VERSION ? 'ver ' + r.ver : null);

  // 5. fixtures and (local only) the real saves load; their workshops keep their places; a re-zone note shows where they would go
  const loads = [['day59', path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json')], ['day72', path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json')], ['realsave', REAL], ['friendsave', FRIEND]];
  for (const [tag, file] of loads) { if (!file || !fs.existsSync(file)) continue; const save = readSave(file);
    await shot(`load_${tag}.png`, `(() => { ${helpers} const s = f.snapshot(); f.advance(3, 10);
      const ws = Object.entries(S.works.works).map(([k, w]) => [k, w.at]), yards = f.PW.ownedSorted(S.plots, 'workshop'), notes = yards.map(id => f.worksVacateNote(id));
      const w0 = ws.find(([, a]) => a); if (w0) { const p = f.PW.workPos(W(w0[0])); look(p.x, p.y, 0.2); } else look(96, 60, 0);
      // the real farm: buy a second 工坊院 in another region if one is for sale, then re-zone the first one: everything
      // moves along (or, with nowhere to go, waits in the storehouse), goods kept
      S.coins += 5e6; f.FARMER.wood += 5000; let moved = null; const from = yards[0];
      if (from) { const to = f.PL.PLOTS.map(p => p.id).find(id => !S.plots[id] && f.PL.plot(id).mods.includes('workshop') && f.buyPlot(id, 'workshop').ok);
        const b4 = ws.filter(([, a]) => a === from).map(([k]) => state(k)); const rz = f.rezonePlot(from, 'field');
        moved = { to, rz: rz.ok, why: rz.why, b4, af: ws.filter(([, a]) => a === from).map(([k]) => state(k)) }; f.advance(1, 10);
        if (to) { const c = mid(to); look(c.x, c.y, 0.2); } hide(); }
      return { day: s.clock.day, sv: s.saveVersion, ver: f.version, ws, yards, notes, moved }; })()`,
      r => r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== VERSION ? 'ver ' + r.ver : r.ws.some(([, a]) => a && !r.yards.includes(a)) ? 'workshop outside a yard'
        : r.moved && !r.moved.rz ? 'real-farm rezone ' + r.moved.why : r.moved && r.moved.af.some((w, i) => w.at !== (r.moved.to || null) || w.inp !== r.moved.b4[i].inp || w.ready !== r.moved.b4[i].ready) ? 'real-farm state ' + JSON.stringify(r.moved) : null, save);
  }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
