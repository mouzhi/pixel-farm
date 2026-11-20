// v5.11.0.3: the coastline must not repeat when the view scrolls.  node tools/coast-shots.js [name-filter]
//   writes /workspace/pf-shots/coast_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
// A player scrolled down over the sea and saw a second, wavy coastline (mud lip, foam, a paler sea below it) across the open
// water. The layered-water geometry was cached per angle and screen box only; the sea box is clipped to the screen, so once it
// filled the view it stopped changing and the old shoreline stayed painted at its old screen rows. Checks: after dragging the
// camera in small steps (as a mouse drag does) over the coast, the pond and the river, every frame equals a frame drawn with
// fresh water caches; the open sea's depth bands stay put on the map; the 海边 jump; the bottom edge of the map.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI && __farm.waterReset, null, { timeout: 30000 });
  await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true;
    S.coins = 500000; for (const id of ['south', 'east', 'coast']) f.buy(id); S.t = Math.floor(S.t / 1440) * 1440 + 11 * 60; if (S.weather) S.weather.rained = false;
    for (const id of ['leftBottom', 'inv', 'bottomRight', 'tools', 'say']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } f.advance(0.2, 10); });
  // drag the camera from one spot to another in small steps (a mouse drag), then compare with a frame drawn from fresh caches
  const sweep = (from, to, a, steps) => p.evaluate(([from, to, a, steps]) => { const f = __farm, c = f.cvs || document.getElementById('game'), g = c.getContext('2d');
    f.setAngle(a); f.panTo(from[0], from[1]); f.render(); const bad = [];
    for (let i = 1; i <= steps; i++) { f.panTo(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); f.render();
      if (i % 4 && i !== steps) continue;
      const A = g.getImageData(0, 0, c.width, c.height).data; f.waterReset(); f.render(); const B = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let k = 0; k < A.length; k += 4) if (A[k] !== B[k] || A[k + 1] !== B[k + 1] || A[k + 2] !== B[k + 2]) n++;
      if (n) bad.push([+f.cam.x.toFixed(1), +f.cam.y.toFixed(1), n]); }
    return { cam: [f.cam.x, f.cam.y], bad }; }, [from, to, a, steps]);
  const check = async (name, run, ok) => { name = 'coast_' + name; if (only && !name.includes(only)) return;
    let r; try { r = await run(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.locator('#game').screenshot({ path: path.join(OUT, name + '.png') });
    const bad = r && r.error ? r.error : ok(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 600)); if (bad) fails.push(name + ': ' + bad); };
  const clean = r => r.bad.length ? `stale water at ${r.bad.length} stops, e.g. ${JSON.stringify(r.bad.slice(0, 3))}` : null;
  // the reported view: the shore near the farm, scrolled down to the bottom of the map
  await check('drag_down_west', () => sweep([400, 200], [400, 360], 0, 80), clean);
  await check('drag_down_town', () => sweep([760, 210], [760, 360], 0, 75), clean);
  await check('drag_down_east', () => sweep([930, 220], [930, 360], 0, 70), clean);
  await check('drag_along_bottom', () => sweep([300, 340], [930, 340], 0, 90), clean);
  await check('drag_up', () => sweep([600, 360], [600, 220], 0, 70), clean);
  await check('drag_down_turned', () => sweep([500, 210], [500, 350], 0.6, 70), clean);
  await check('drag_down_default_angle', () => sweep([350, 220], [350, 350], 0.22, 65), clean);
  // the 海边 jump, then a drag down from there
  await check('jump_beach', async () => { const at = await p.evaluate(() => { __farm.setAngle(0); __farm.jumpTo('beach'); __farm.render(); return [__farm.cam.x, __farm.cam.y]; });
    const r = await sweep(at, [at[0], at[1] + 90], 0, 45); return Object.assign(r, { at }); }, clean);
  // the pond and the river must not change: drag across both
  await check('pond_drag', () => sweep([20, 40], [150, 150], 0.22, 60), clean);
  await check('river_drag', () => sweep([-120, -60], [80, 40], 0, 60), clean);
  // the open sea's depth bands belong to the map: the same spot of sea reads the same band from two camera heights
  await check('bands_fixed', () => p.evaluate(() => { const f = __farm, pts = []; for (let x = 330; x <= 900; x += 15) for (let y = 300; y <= 330; y += 6) pts.push([x, y]);
    const bandAt = cy => { f.setAngle(0); f.panTo(615, cy); f.render(); const G = f.waterGeomOf('sea'); return pts.map(([x, y]) => { const [sx, sy] = f.proj(x, y), X = Math.round(sx) - G.bx, Y = Math.round(sy) - G.by;
      return X < 0 || Y < 0 || X >= G.bw || Y >= G.bh || !G.mask[Y * G.bw + X] ? -1 : G.band[Y * G.bw + X]; }); };
    const a = bandAt(290), b = bandAt(345); let same = 0, n = 0; for (let i = 0; i < pts.length; i++) if (a[i] >= 0 && b[i] >= 0) { n++; if (a[i] === b[i]) same++; }
    return { n, same, kinds: [...new Set(a.concat(b))].sort() }; }), r => r.n < 40 ? 'too few sea points on screen' : r.same < r.n * 0.97 ? `bands moved with the camera (${r.same}/${r.n})` : null);
  if (errs.length) fails.push('page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); server.close();
  if (fails.length) { console.log('\nFAILED:\n  ' + fails.join('\n  ')); process.exit(1); } console.log('\nall coast checks ok');
})();
