// v5.11.0.36: synthetic regressions for riverbank feedback (no player saves).
// node tools/riverbank-test.js: marked planting + reload/harvest, rezone/unreachable rejection without sapling loss,
// normal autonomous bridge farming on both across-river fields within ten days (a reproduction scenario, not a claim about a player's device).
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
    const setup = () => { S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 5000;
      for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can']) f.buy(id); f.syncFamily(); };
    const find = id => { const r = f.PL.plot(id).rect; for (let y=r[1]+10;y<r[3]-8;y+=8) for(let x=r[0]+12;x<r[2]-8;x+=8) if(f.plantSpot(x,y).ok) return {x,y}; return null; };
    const until = (ok, n=1800) => { for(let i=0;i<n&&!ok();i++) f.advance(1,3); return ok(); };`;
  const check = (name,r,bad) => { console.log(bad ? 'FAIL' : 'ok', name, JSON.stringify(r)); if(bad) fails.push(name + ': ' + bad); };

  // Complete a marked fruit-tree job on the riverbank through the normal family task board.
  { const p = await page(); const r = await p.evaluate(`(() => { ${H} setup(); f.buyPlot('swbank','dam');
      f.FARMER.saplings.apple = 3; const pos=find('swbank'); if(!pos) return {error:'no dam spot'};
      const workers=[];window.addEventListener('pf:farm',e=>{if(e.detail.type==='task'&&e.detail.kind==='transplant')workers.push(e.detail.who);});const order=f.orderPlant('apple',pos.x,pos.y); const sap0=f.FARMER.saplings.apple;
      const done=until(()=>S.trees.some(t=>t.kind==='apple'&&Math.hypot(t.x-pos.x,t.y-pos.y)<1),800);
      const tree=S.trees.find(t=>t.kind==='apple'&&Math.hypot(t.x-pos.x,t.y-pos.y)<1);
      const jobs=[]; for(const a of f.actors()) {f.setF(a); jobs.push(...f.board().filter(j=>j.kind==='pick').map(j=>({who:a.id||'farmer',at:j.at})));} f.setF(f.FARMER);
      return {pos,order,done,workers,sap0,sap:f.FARMER.saplings.apple,tree,save:f.snapshot()}; })()`);
    check('marked dam fruit tree completes once', {pos:r.pos,order:r.order,done:r.done,workers:r.workers,sap:r.sap},r.error || !r.order.ok || !r.done || r.sap!==r.sap0-1 ? 'placement failed or sapling not conserved' : null);
    if(r.save){ const saved=JSON.stringify(Object.assign(r.save,{savedAt:Date.now()}));await p.context().close();const q=await page(saved);
      const rl=await q.evaluate(pos=>{const f=__farm,S=f.S,t=S.trees.find(t=>t.kind==='apple'&&Math.hypot(t.x-pos.x,t.y-pos.y)<1); for(const u of S.trees)u.ripe=0;if(t){t.stage='tree';t.ripe=1;} f.FARMER.crops=[];f.setF(f.FARMER);f.markNavDirty(); const jobs=f.board().filter(j=>j.kind==='pick');return {tree:!!t,sap:f.FARMER.saplings.apple,queued:S.orders.filter(o=>o.type==='plant').length,pickable:jobs.some(j=>j.at===t),sv:f.snapshot().saveVersion};},r.pos);
      check('reload retains riverbank tree, and ripe fruit is collectable',rl,!rl.tree||!rl.pickable||rl.sv!==15||rl.sap!==r.sap?'reload/pick failed':null); await q.context().close();
    }else await p.context().close(); }
  // A valid plan made before a rezone must not consume a sapling or plant a ghost tree on a new crop field.
  { const p=await page();const r=await p.evaluate(`(() => { ${H} setup(); f.buyPlot('swbank','meadow');f.FARMER.saplings.apple=3;
      const pos={x:-108,y:228},order=f.orderPlant('apple',pos.x,pos.y);const o=S.orders.find(o=>o.type==='plant');
      const j=f.board().find(j=>j.kind==='transplant'); const task=j&&j.make();f.rezonePlot('swbank','field');if(task)task.done();
      return {order,task:!!task,sap:f.FARMER.saplings.apple,tree:S.trees.some(t=>Math.hypot(t.x-pos.x,t.y-pos.y)<1),queued:S.orders.includes(o)}; })()`);
    check('stale placement revalidated after rezone; sapling refunded',r,!r.task||r.sap!==3||r.tree||r.queued?'stale order consumed sapling':null);await p.context().close(); }
  // Deliberately close the only gate after buying (synthetic obstacle, not a legal bridge bypass). No saplings vanish.
  { const p=await page();const r=await p.evaluate(`(() => { ${H} setup();f.buyPlot('bridge','bridge');f.buyPlot('seacross','meadow');f.FARMER.saplings.apple=3;
      const pos=find('seacross');const g=f.ensureNav();for(let j=0;j<g.h;j++)for(let i=0;i<g.w;i++){const y=g.y0+(j+.5)*g.cell;if(y>=300&&y<=336)g.cost[j*g.w+i]=0;} f.NAV.clearCache(g);
      const order=f.orderPlant('apple',pos.x,pos.y);return{pos,order,sap:f.FARMER.saplings.apple,queued:S.orders.filter(o=>o.type==='plant').length}; })()`);
    check('unreachable across-river tree refused, no sapling lost',r,r.order.ok||r.sap!==3||r.queued?'unreachable order accepted':null);await p.context().close(); }
  // Reproduction scenario, not a claim about the player's farm: normal task priorities on a two-field synthetic farm.
  { const p=await page();const r=await p.evaluate(`(() => { ${H} setup();f.buyPlot('bridge','bridge');f.buyPlot('swacross','field');f.buyPlot('seacross','field');
      const start=S.day; const visits=[];until(()=>{const a=f.tiles.filter(t=>t.f==='swacross'&&t.crop).length,b=f.tiles.filter(t=>t.f==='seacross'&&t.crop).length;if(a&&b)return true;return S.day>=start+10;},7500);
      return {days:S.day-start,sw:f.tiles.filter(t=>t.f==='swacross'&&t.crop).length,se:f.tiles.filter(t=>t.f==='seacross'&&t.crop).length,plots:S.plots,save:f.snapshot().saveVersion}; })()`);
    check('normal autonomous cross-river farming reaches both fields within 10 days',r,!r.sw||!r.se?'did not sow both fields':null);await p.context().close(); }
  await b.close();server.close();if(errs.length) fails.push(errs.join('\n')); if(fails.length){console.error(fails.join('\n'));process.exit(1);}console.log('riverbank-test all passed',VERSION);
})().catch(e=>{console.error(e);process.exit(1);});
