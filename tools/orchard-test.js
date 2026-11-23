// v5.11.0.35: synthetic regressions for 果园自动种树 (no player saves).
// node tools/orchard-test.js: spare saplings go into empty orchard ground by themselves (果园坡 and a plot made into a 果园),
// v5.11.0.35 also: fruit trees can be chopped (two taps), always leave 1 sapling, the slot is refilled; a later mark wins.
// the player's marks still come first and keep their sapling, a real chore beats the orchard errand, the spot is checked
// again before the sapling leaves the storehouse, the lumber hut only gets what the orchards have no room for, and reload.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    if (save) await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, save);
    await p.goto(base + '/index.html' + (save ? '' : '?manual')); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const H = `const f = __farm, S = f.S;
    const setup = () => { S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 5000;
      for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can']) f.buy(id); f.syncFamily(); };
    const inR = (t, r) => t.x > r[0] && t.x < r[2] && t.y > r[1] && t.y < r[3];
    const orchR = () => [PFWorld.region('orchard').rect].concat(Object.keys(S.plots).filter(id => S.plots[id].mod === 'orchard').map(id => f.PL.plot(id).rect));
    const young = () => S.trees.filter(t => t.stage === 'sapling' && t.kind !== 'wild');
    const until = (ok, n = 3000) => { for (let i = 0; i < n && !ok(); i++) f.advance(1, 3); return ok(); };`;
  const check = (name, r, bad) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 600)); if (bad) fails.push(name + ': ' + bad); };

  // 1. Spare saplings in storage -> family plants them into empty orchard ground (果园坡 + a 果园 plot), no marks; reload keeps them.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.buyPlot('glade','orchard'); f.FARMER.saplings.apple = 2; f.FARMER.saplings.orange = 1;
      const spots = f.orchardSpots().length, t0 = young().length, start = S.day, who = [];
      window.addEventListener('pf:farm', e => { if (e.detail.type === 'task' && e.detail.kind === 'orchardplant') who.push(e.detail.who); });
      const done = until(() => young().length >= t0 + 3);
      const yt = young(), inside = yt.every(t => orchR().some(r => inR(t, r)));
      return { spots, done, days: S.day - start, who, planted: yt.length - t0, inside, sap: Object.assign({}, f.FARMER.saplings), kinds: yt.map(t => t.kind), marks: S.orders.length, save: f.snapshot() }; })()`);
    check('spare saplings are planted in empty orchards by the family', Object.assign({}, r, { save: undefined }), !r.done || !r.inside || r.sap.apple !== 0 || r.sap.orange !== 0 || !r.who.length || r.marks ? 'not planted on its own' : null);
    const saved = JSON.stringify(Object.assign(r.save, { savedAt: Date.now() })); await p.context().close(); const q = await page(saved);
    const rl = await q.evaluate(() => { const S = __farm.S; return { young: S.trees.filter(t => t.stage === 'sapling' && t.kind !== 'wild').length, sap: Object.assign({}, __farm.FARMER.saplings), sv: __farm.snapshot().saveVersion, bytes: JSON.stringify(PFSave.compact(__farm.snapshot())).length }; });
    check('orchard saplings survive reload (v15, <64KB)', rl, rl.young < r.planted || rl.sap.apple !== 0 || rl.sv !== 15 || rl.bytes >= 65536 ? 'reload lost trees' : null); await q.context().close(); }

  // 2. A player's mark keeps its sapling and is done first; only the spare one goes to the orchard.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.FARMER.saplings.apple = 1;
      let pos = null; for (let y = 40; y < 120 && !pos; y += 6) for (let x = 0; x < 180; x += 6) if (f.plantSpot(x, y).ok) { pos = { x, y }; break; }
      const order = f.orderPlant('apple', pos.x, pos.y), jobs = f.board().map(j => j.kind);
      const done = until(() => S.trees.some(t => t.kind === 'apple' && Math.hypot(t.x - pos.x, t.y - pos.y) < 1), 1500);
      const orch = young().filter(t => orchR().some(r => inR(t, r))).length;
      return { order: order.ok, jobs: jobs.filter(k => /plant/.test(k)), done, orch, sap: f.FARMER.saplings.apple }; })()`);
    check('marked planting keeps its sapling and wins over the orchard errand', r, !r.order || r.jobs.includes('orchardplant') || !r.done || r.orch || r.sap !== 0 ? 'mark lost its sapling' : null); await p.context().close(); }

  // 3. Low errand: with a real chore on the board the orchard job is never chosen; alone it is.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.FARMER.saplings.apple = 1; S.t = Math.floor(S.t / 1440) * 1440 + 9 * 60; f.setF(f.FARMER);
      const jobs = f.board(), hasO = jobs.some(j => j.kind === 'orchardplant'), real = jobs.filter(j => j.kind !== 'orchardplant').length, k = f.chooseTask();
      return { hasO, real, chose: k && k.kind }; })()`);
    check('orchard errand never displaces a real chore', r, !r.hasO || (r.real && r.chose === 'orchardplant') || (!r.real && r.chose !== 'orchardplant') ? 'priority wrong' : null); await p.context().close(); }

  // 4. Revalidate before consuming: the orchard plot rezoned after the job was taken -> nothing consumed, no ghost tree.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.buyPlot('glade','orchard'); f.FARMER.saplings.apple = 1;
      for(const q of f.orchardSpots().filter(q => inR(q, PFWorld.region('orchard').rect))) S.trees.push({id:'fixture_'+q.key,x:q.x,y:q.y,kind:'apple',stage:'sapling',age:0}); f.markNavDirty();
      const s = f.orchardSpots().find(s => inR(s, f.PL.plot('glade').rect)); f.setF(f.FARMER); const j = f.board().find(j => j.kind === 'orchardplant' && j.key === s.key) || f.board().find(j => j.kind === 'orchardplant');
      const at = j && j.at, task = j && j.make(); const rezoned = f.rezonePlot('glade','field'); if (task) task.done();
      return { task: !!task, rezoned, at, sap: f.FARMER.saplings.apple, ghost: S.trees.some(t => at && Math.hypot(t.x - (at.x + 7), t.y - (at.y - 1)) < 1) }; })()`);
    check('rezoned orchard spot is re-checked, sapling stays', r, !r.task || r.sap !== 1 || r.ghost ? 'stale orchard job consumed sapling' : null); await p.context().close(); }

  // Empty purchased orchard: a family job can put a sapling there, while a claimed slot/in-flight sapling is not offered twice.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.buyPlot('glade','orchard');
      for(const q of f.orchardSpots().filter(q => inR(q, PFWorld.region('orchard').rect))) S.trees.push({id:'fixture_'+q.key,x:q.x,y:q.y,kind:'apple',stage:'sapling',age:0}); f.markNavDirty();
      f.FARMER.saplings.orange=1;const j=f.board().find(j=>j.kind==='orchardplant'),task=j&&j.make(); task.kind='orchardplant';f.FARMER.task=task;
      const partner=S.members.find(a=>a.id==='partner'); f.setF(partner);const offered=f.board().some(j=>j.kind==='orchardplant');f.setF(f.FARMER);task.done();f.FARMER.task=null;
      const planted=S.trees.some(t=>t.kind==='orange'&&inR(t,f.PL.plot('glade').rect));return {planted,offered,sap:f.FARMER.saplings.orange};})()`);
    check('purchased orchard is plantable, in-flight sapling is reserved once',r,!r.planted||r.offered||r.sap!==0?'plot/claim failed':null);await p.context().close(); }

  // A disconnected orchard does not reserve saplings or offer an impossible walk; stale in-flight jobs lose no saplings.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup();f.buyPlot('bridge','bridge');f.buyPlot('swacross','orchard');
      for(const q of f.orchardSpots().filter(q=>inR(q,PFWorld.region('orchard').rect)))S.trees.push({id:'fixture_'+q.key,x:q.x,y:q.y,kind:'apple',stage:'sapling',age:0});f.markNavDirty();
      f.FARMER.saplings.apple=1;const j=f.board().find(j=>j.kind==='orchardplant'),task=j&&j.make();
      const g=f.ensureNav();for(let n=0;n<g.h;n++)for(let i=0;i<g.w;i++){const y=g.y0+(n+.5)*g.cell;if(y>=300&&y<=336)g.cost[n*g.w+i]=0;}f.NAV.clearCache(g);
      if(task)task.done();return{task:!!task,sap:f.FARMER.saplings.apple,spotted:f.orchardSpots().length,ghost:S.trees.some(t=>t.kind==='apple'&&inR(t,f.PL.plot('swacross').rect))};})()`);
    check('unreachable in-flight orchard job consumes nothing',r,!r.task||r.sap!==1||r.ghost?'unreachable consumed sapling':null);await p.context().close(); }

  // 5. Lumber hut: orchards first. Room in the orchard -> the hut leaves the saplings; no orchard room -> spare ones replant the forest.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.buy('lumber');
      const stumps = () => S.trees.filter(t => t.kind === 'wild' && PFWorld.regrows(t)).slice(0, 3).forEach(t => { t.stage = 'stump'; t.age = 0; });
      stumps(); f.FARMER.saplings.apple = 2; f.FARMER.saplings.orange = 0; const room = f.orchardSpots().length; f.woodNight(); const keep = f.FARMER.saplings.apple;
      S.eff.regions = S.eff.regions.filter(id => id !== 'orchard'); f.markNavDirty(); const room2 = f.orchardSpots().length; f.woodNight(); const after = f.FARMER.saplings.apple;
      return { room, keep, room2, after }; })()`);
    check('lumber hut uses only saplings the orchards have no room for', r, !r.room || r.keep !== 2 || r.room2 || r.after !== 0 ? 'hut took orchard saplings' : null); await p.context().close(); }

  // 6. v5.11.0.35 砍果树: a fruit tree asks twice, always drops 1 sapling of its kind (+ a little wood), leaves no stump;
  //    the empty orchard spot is then refilled by the family with that spare sapling.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.FARMER.saplings.apple = 0; f.FARMER.saplings.orange = 0;
      const out = [];
      for (const [id, kind] of [['a0', 'apple'], ['a1', 'apple']]) { const t = S.trees.find(q => q.id === id); t.kind = id === 'a1' ? 'orange' : 'apple'; f.markNavDirty();
        const k = t.kind, first = f.orderChop(id), queued1 = S.orders.some(o => o.type === 'chop' && o.id === id), second = f.orderChop(id);
        const sap0 = f.FARMER.saplings[k], wood0 = f.FARMER.wood; let sapAt = null, woodAt = null;
        for (let i = 0; i < 3000 && S.trees.includes(t); i++) f.advance(1, 3);
        sapAt = f.FARMER.saplings[k] - sap0; woodAt = f.FARMER.wood - wood0;
        out.push({ id, k, confirm: !!first.confirm && !first.ok, queued1, second: second.ok, gone: !S.trees.includes(t), stump: S.trees.some(q => q.id === id), sap: sapAt, wood: woodAt,
          log: S.events.some(e => new RegExp('砍倒一棵' + (k === 'apple' ? '苹果' : '橘子') + '树').test(e.msg)) }); }
      const spot = { x: -120, y: -70 }; // a0's place: fill every other free orchard spot so the family must come back to this one
      for (const q of f.orchardSpots()) if (Math.hypot(q.x - spot.x, q.y - spot.y) > 14) S.trees.push({ id: 'fixture_' + q.key, x: q.x, y: q.y, kind: 'apple', stage: 'tree', age: 0, ripe: 0, cd: 9 });
      f.markNavDirty();
      const refilled = until(() => young().filter(t => Math.hypot(t.x - spot.x, t.y - spot.y) < 14).length >= 1 && f.FARMER.saplings.apple + f.FARMER.saplings.orange <= 1, 2500);
      return { out, refilled, sap: Object.assign({}, f.FARMER.saplings), young: young().map(t => [t.kind, t.x, t.y]) }; })()`);
    check('fruit tree chop asks twice, always drops its sapling, slot is replanted', r, r.out.some(o => !o.confirm || o.queued1 || !o.second || !o.gone || o.stump || o.sap !== 1 || o.wood < 1 || o.wood > 6 || !o.log) || !r.refilled ? 'fruit chop wrong' : null); await p.context().close(); }

  // 7. Chop then mark: the player marks a new spot for the sapling before the family's orchard errand -> it goes to the mark.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.FARMER.saplings.apple = 0; f.FARMER.saplings.orange = 0;
      const t = S.trees.find(q => q.id === 'a2'); f.orderChop('a2'); f.orderChop('a2'); let pos = null, marked = null;
      for (let i = 0; i < 3000 && S.trees.includes(t); i++) f.advance(1, 3);
      for (let y = 40; y < 120 && !pos; y += 6) for (let x = 0; x < 180; x += 6) if (f.plantSpot(x, y).ok) { pos = { x, y }; break; }
      marked = f.orderPlant('apple', pos.x, pos.y);
      const done = until(() => S.trees.some(q => q.kind === 'apple' && q.stage === 'sapling' && Math.hypot(q.x - pos.x, q.y - pos.y) < 1), 3000);
      return { gone: !S.trees.includes(t), marked: marked.ok, done, orch: young().filter(q => orchR().some(rc => inR(q, rc))).length, sap: f.FARMER.saplings.apple }; })()`);
    check('a mark placed after the chop takes the sapling, not the orchard', r, !r.gone || !r.marked || !r.done || r.orch || r.sap !== 0 ? 'mark lost to the orchard' : null); await p.context().close(); }

  // 8. Locked fruit trees stay safe; leaving the tool forgets a half-made confirmation.
  { const p = await page(); const r = await p.evaluate(`(() => { const f = __farm, S = f.S; S.coins = 5000; f.buy('axe');
      const locked = f.orderChop('a0'); f.buy('orchard'); f.setMode('chop'); const c1 = f.orderChop('a0'); f.setMode(null); f.setMode('chop'); const c2 = f.orderChop('a0');
      return { locked: locked.ok || !!locked.confirm, c1: !!c1.confirm, c2: !!c2.confirm, orders: S.orders.length }; })()`);
    check('locked fruit trees refuse; confirmation resets with the tool', r, r.locked || !r.c1 || !r.c2 || r.orders ? 'safeguard wrong' : null); await p.context().close(); }

  await b.close(); server.close(); if (errs.length) fails.push(errs.join('\n')); if (fails.length) { console.error(fails.join('\n')); process.exit(1); } console.log('orchard-test all passed', VERSION);
})().catch(e => { console.error(e); process.exit(1); });
