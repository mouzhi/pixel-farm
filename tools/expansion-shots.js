// Screenshots for the outer ring (v5.5.0):  node tools/expansion-shots.js [name-filter]
//   writes /workspace/pf-shots/v550_*.png (PF_SHOTS to change); PF_DOCS=1 also copies them to docs/img/
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', DOCS = path.join(ROOT, 'docs/img');
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2];
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [];
  async function page(q, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
    await p.goto(base + '/index.html' + q); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); return p; }
  const setup = `(() => { const f = __farm, S = f.S; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 60000; f.FARMER.wood = 400; for (const id of ['house','axe','forest','east','orchard','south','pasture','coast','fold','sheep','sheep','sheep']) f.buy(id); f.refreshUI(); })()`;
  const shot = async (name, q, fn, vw, vh) => { if (only && !name.includes(only)) return; const p = await page(q, vw, vh); await p.evaluate(fn); await p.waitForTimeout(600); await p.screenshot({ path: path.join(OUT, name) }); if (process.env.PF_DOCS) fs.copyFileSync(path.join(OUT, name), path.join(DOCS, name)); console.log('shot', name); await p.context().close(); };
  // 1. the whole ring, locked (a fresh farm: nobody has moved in yet)
  await shot('v550_ring.png', '?manual&view=1600x1000', `(() => { __farm.setAngle(0); __farm.panTo(96, 96); __farm.advance(1, 10); })()`, 1600, 1000);
  // 1b. the ring once 阿禾 has moved in: prices on the labels, the minimap
  await shot('v550_ring_open.png', '?manual&view=1600x1000', `(() => { ${setup}; __farm.setAngle(0); __farm.panTo(96, 96); __farm.advance(1, 10); __farm.refreshUI(); })()`, 1600, 1000);
  // 2. river and bridge, close
  await shot('v550_bridge.png', '?manual', `(() => { ${setup}; const f = __farm; f.buyPlot('bridge'); f.buyPlot('sbank', 'dam'); f.buyPlot('seacross', 'pasture'); f.S.t = Math.floor(f.S.t / 1440) * 1440 + 600; f.panTo(40, 300); f.advance(2, 10); })()`);
  // 3. the mountain: cliff, the trail and the plateau
  await shot('v550_mountain.png', '?manual', `(() => { ${setup}; const f = __farm; f.buyPlot('trail'); f.buyPlot('alp', 'pasture'); f.buyPlot('neslope', 'woodland'); f.S.t = Math.floor(f.S.t / 1440) * 1440 + 600; f.panTo(220, -150); f.advance(2, 10); })()`);
  // 4. the module dialog for 林间空地
  await shot('v550_plot_dialog.png', '?manual', `(() => { ${setup}; const f = __farm; f.panTo(-75, 160); f.advance(1, 10); f.openPlot('glade'); })()`);
  // 5. modules: playground, workshop, meadow by the house
  await shot('v550_modules.png', '?manual', `(() => { ${setup}; const f = __farm; f.buyPlot('play', 'playground'); f.buyPlot('glade', 'field'); f.buyPlot('wbank', 'workshop'); f.S.t = Math.floor(f.S.t / 1440) * 1440 + 600; f.panTo(-80, 120); f.advance(30, 10); })()`);
  // 6. kids playing in the playground
  await shot('v550_kids_play.png', '?manual', `(() => { const f = __farm, S = f.S; S.coins = 1e6; f.FARMER.wood = 900; for (const id of ['house','house','house']) f.buy(id); S.day = 40; Object.assign(S.family, { love: 100, met: 3, moved: 10, kids: [{ id: 'kid0', name: '小豆', born: 26 }, { id: 'kid1', name: '小米', born: 30 }] }); f.syncFamily(); f.buyPlot('play', 'playground');
    S.t = Math.floor(S.t / 1440) * 1440 + 15 * 60; const P = f.PL.plot('play').rect, inP = m => m.x > P[0] && m.x < P[2] && m.y > P[1] && m.y < P[3];
    for (let i = 0; i < 2000; i++) { f.advance(0.5, 5); const k = S.members.filter(m => /^kid/.test(m.id)); if (k.filter(inP).length >= 2 && k.every(m => m.task && /play-(slide|swing|sandbox)/.test(m.task.kind) && m.task.work > 0)) break; }
    f.setAngle(0); f.panTo((P[0] + P[2]) / 2, (P[1] + P[3]) / 2); f.advance(0.05, 1); })()`);
  // 7. the grazing meadow, sheep out by day
  await shot('v550_graze.png', '?manual', `(() => { ${setup}; const f = __farm, S = f.S; f.buy('graze'); S.t = Math.floor(S.t / 1440) * 1440 + 9 * 60; for (let i = 0; i < 30; i++) f.advance(10, 10); f.panTo(-160, -24); f.advance(1, 10); })()`);
  // 8. the re-zone page of a bought plot (林间空地 as 农田 -> other modules, fee shown)
  await shot('v550_rezone.png', '?manual', `(() => { ${setup}; const f = __farm; f.buyPlot('glade', 'field'); f.panTo(-75, 160); f.advance(1, 10); f.openPlot('glade'); })()`);
  console.log('errors', errs); if (errs.length) process.exitCode = 1; await b.close(); server.close(); })();
