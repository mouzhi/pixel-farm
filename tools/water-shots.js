// v5.11.0.17 河口和水: the river runs into the sea through a sandy mouth instead of a hard straight cut, the river visibly flows
// downstream, the sea swells and laps the beaches, and each water wheel dips into the river and turns with the current.
//   node tools/water-shots.js [name-filter]   writes /workspace/pf-shots/water_*.png and waterwheel_*.png (PF_SHOTS to change)
// exits 1 on a page error, a console error or a failed check.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', PFX = process.env.PF_PREFIX || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
const SETUP = () => { const f = __farm, S = f.S; f.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true;
  S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 2000;
  for (const id of ['house', 'axe', 'forest', 'east', 'orchard', 'south', 'pasture', 'coast']) f.buy(id);
  f.buyPlot('bridge'); f.buyPlot('sbank', 'dam'); f.buyPlot('seacross', 'dam'); f.buyPlot('swbank', 'dam'); f.buyPlot('wbank', 'dam');
  f.buy('wheel'); f.buy('wheel');
  S.t = Math.floor(S.t / 1440) * 1440 + 11 * 60; if (S.weather) S.weather.rained = false; S.weather && (S.weather.rain = 0);
  const cv = document.getElementById('game'); for (const el of document.querySelectorAll('body *')) if (!el.contains(cv)) el.style.visibility = 'hidden';
  f.refreshUI && f.refreshUI(); f.advance(0.2, 10); };
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const page = async (vw = 1024, vh = 808) => { const p = await (await b.newContext({ viewport: { width: vw, height: vh } })).newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(SETUP); return p; };
  const p = await page();
  const view = (x, y, a, t) => p.evaluate(([x, y, a, t]) => { const f = __farm; f.setAngle(a); f.panTo(x, y); f.advance(0.05, 1); if (t !== undefined) f.setRealT(t); f.render(); }, [x, y, a, t]);
  const hideUi = pg => pg.evaluate(() => { const cv = document.getElementById('game'); for (const el of document.querySelectorAll('body *')) if (!el.contains(cv)) el.style.visibility = 'hidden'; });
  const snap = async (name, pg = p, clip) => { if (only && !name.includes(only)) return null; await hideUi(pg); const file = path.join(OUT, PFX + name + '.png');
    if (clip) await pg.screenshot({ path: file, clip }); else await pg.locator('#game').screenshot({ path: file }); console.log('shot', PFX + name); return file; };
  const check = async (name, run, ok) => { if (only && !name.includes(only)) return; let r; try { r = await run(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    const bad = r && r.error ? r.error : ok(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 500)); if (bad) fails.push(name + ': ' + bad); };
  // the user's spot: 南河湾 / 河对岸·东 fenced either side of the river where it reaches the sea, the default camera angle
  const SPOT = [150, 300, 0.22];
  await view(...SPOT, 12.3); await snap('water_after');
  if (!only || 'water_zoom'.includes(only)) { await view(...SPOT, 12.3); const r = await p.locator('#game').boundingBox(); await snap('water_zoom', p, { x: r.x + r.width * 0.36, y: r.y + r.height * 0.45, width: r.width * 0.34, height: r.height * 0.3 }); }
  await view(110, 312, 0.22, 12.3); await snap('waterwheel_after');
  // pure checks of the river / coast geometry the art relies on
  await check('rules_unchanged', () => p.evaluate(() => { const f = __farm, WD = window.PFWorld, PL = window.PFPlots, bad = [];
    for (let x = -260; x <= 1010; x += 3) for (let y = 200; y <= 390; y += 3) { const a = WD.seaAt(x, y), b = WD.seaLook(x, y);
      if (b === 'water' && a !== 'water') bad.push(['water on land', x, y]); if (x < 155 && b === 'water') bad.push(['west of 155', x, y]);
      if (PL.PLOTS.some(q => x >= q.rect[0] && x <= q.rect[2] && y >= q.rect[1] && y <= q.rect[3]) && b) bad.push(['beach in a plot', x, y]); }
    return { bad: bad.length, eg: bad.slice(0, 4) }; }), r => r.bad ? 'the picture puts sea or sand where the rules do not' : null);
  await check('wheels_in_river', () => p.evaluate(() => { const PL = window.PFPlots, XP = window.PFExpand, out = [];
    for (const s of XP.wheelSites()) { const d = PL.riverDist(s.x, s.y), hw = PL.riverHW(s.x, s.y), db = PL.riverDist(s.bank.x, s.bank.y);
      // local -y of the model, turned by rot, must point downstream (the bottom paddles move that way: expansion.js)
      const ly = [Math.sin(s.rot), -Math.cos(s.rot)], down = ly[0] * s.fx + ly[1] * s.fy;
      out.push({ plot: s.plot, d: +d.toFixed(2), hw: +hw.toFixed(2), bank: +db.toFixed(2), down: +down.toFixed(3) }); }
    return out; }), r => r.length < 4 ? 'expected 4 wheels (setup builds every 动力坝)' : r.find(w => w.d > w.hw - 2 || w.bank < w.hw || w.down < 0.999) ? 'a wheel is out of the water, its post is in it, or it faces the wrong way' : null);
  // the flow layer is a pure function of realT: two renders at the same time match; frames apart differ on the river
  await check('flow_moves', () => p.evaluate(([x, y, a]) => { const f = __farm, c = document.getElementById('game'), g = c.getContext('2d'); f.setAngle(a); f.panTo(x, y); f.advance(0.05, 1);
    const grab = t => { f.setRealT(t); f.render(); return g.getImageData(0, 0, c.width, c.height).data; };
    const A = grab(20), B = grab(20), C = grab(20.5); let same = 0, moved = 0;
    for (let k = 0; k < A.length; k += 4) { if (A[k] !== B[k] || A[k + 1] !== B[k + 1] || A[k + 2] !== B[k + 2]) same++; if (A[k] !== C[k] || A[k + 1] !== C[k + 1] || A[k + 2] !== C[k + 2]) moved++; }
    return { unstable: same, moved }; }, SPOT), r => r.unstable ? 'the same realT drew two different frames' : r.moved < 400 ? 'the water barely changes in half a second' : null);
  // scrolling over the mouth must not leave old water painted (RED-73): every stop equals a frame from fresh caches
  await check('mouth_drag', () => p.evaluate(() => { const f = __farm, c = document.getElementById('game'), g = c.getContext('2d'), bad = []; f.setAngle(0.22); f.setRealT(7);
    for (let i = 0; i <= 40; i++) { f.panTo(60 + i * 4, 260 + i * 2.5); f.render(); if (i % 5) continue;
      const A = g.getImageData(0, 0, c.width, c.height).data; f.waterReset(); f.render(); const B = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let k = 0; k < A.length; k += 4) if (A[k] !== B[k] || A[k + 1] !== B[k + 1] || A[k + 2] !== B[k + 2]) n++; if (n) bad.push([i, n]); }
    return { bad }; }), r => r.bad.length ? 'stale water while scrolling: ' + JSON.stringify(r.bad.slice(0, 3)) : null);
  // other angles and the whole-map view
  await view(150, 300, 0, 3); await snap('water_angle0');
  await view(150, 300, 1.2, 3); await snap('water_angle12');
  await view(-208, 120, 0.22, 3); await snap('waterwheel_wbank');
  await view(-146, 256, 0.22, 3); await snap('waterwheel_swbank');
  // integer scales: the framebuffer follows the window at 2x and 3x device pixels
  for (const dsf of [2, 3]) { if (only && !('water_scale' + dsf).includes(only)) continue; const ctx2 = await b.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: dsf }), q = await ctx2.newPage();
    q.on('pageerror', e => errs.push(String(e))); await q.goto(base + '/index.html?manual'); await q.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await q.evaluate(SETUP);
    await q.evaluate(() => { const f = __farm; f.setAngle(0.22); f.panTo(150, 302); f.advance(0.05, 1); f.setRealT(4); f.render(); }); await snap('water_scale' + dsf, q); await ctx2.close(); }
  // frame cost: the water pass (pond + sea) and the new flow layer, over the mouth and over the whole south coast
  await check('perf', async () => { const q = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage(); q.on('pageerror', e => errs.push(String(e)));
    await q.goto(base + '/index.html?manual&prof'); await q.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await q.evaluate(SETUP);
    const r = await q.evaluate(() => { const f = __farm, out = {}; for (const [k, x, y, drag] of [['mouth', 150, 300, 0], ['coast', 500, 300, 0], ['mouth_drag', 150, 300, 1], ['coast_drag', 500, 300, 1]]) { f.setAngle(0.22); f.panTo(x, y); f.render();
      for (const key in window.__prof) window.__prof[key] = 0; const t0 = performance.now(); for (let i = 0; i < 40; i++) { f.setRealT(i / 30); if (drag) f.panTo(x + (i & 1), y); f.render(); }
      out[k] = { frame: +((performance.now() - t0) / 40).toFixed(1), water: +(window.__prof.water / 40).toFixed(2), flow: +((window.__prof.flow || 0) / 40).toFixed(2) }; } return out; });
    await q.context().close(); return r; }, r => r.mouth.flow > 2 || r.coast.flow > 2 ? 'the flow layer costs over 2 ms a frame' : null);
  // a few seconds of the river and the sea moving (and the wheels turning): /workspace/pf-shots/water_flow.gif
  // PF_GIF=1 only (CI skips it): the frames go to PF_SHOTS/.flow_*.png and the list to .flow_list.json; turn them into a GIF with
  // python3 -c "from PIL import Image; import json; f=[Image.open(p).convert('P', palette=Image.ADAPTIVE) for p in json.load(open('.flow_list.json'))]; f[0].save('water_flow.gif', save_all=True, append_images=f[1:], duration=125, loop=0)"
  if (process.env.PF_GIF && (!only || 'water_flow'.includes(only))) { const frames = []; const r = await p.locator('#game').boundingBox();
    await p.evaluate(() => { const f = __farm; f.setAngle(0.22); f.panTo(132, 306); f.advance(0.05, 1); }); await hideUi(p);
    for (let k = 0; k < 40; k++) { await p.evaluate(t => { __farm.setRealT(t); __farm.render(); }, 30 + k * 0.125);
      const file = path.join(OUT, `.flow_${k}.png`); await p.screenshot({ path: file, clip: { x: r.x + r.width * 0.2, y: r.y + r.height * 0.4, width: Math.round(r.width * 0.5), height: Math.round(r.height * 0.36) } }); frames.push(file); }
    fs.writeFileSync(path.join(OUT, '.flow_list.json'), JSON.stringify(frames)); console.log('frames', frames.length); }
  if (errs.length) fails.push('page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); server.close();
  if (fails.length) { console.log('\nFAILED:\n  ' + fails.join('\n  ')); process.exit(1); } console.log('\nall water checks ok');
})();
