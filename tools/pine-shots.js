// v5.11.0.5.3: the pine is a fir again: foliage to the tip, no trunk between the tiers.  node tools/pine-shots.js [name-filter]
//   writes /workspace/pf-shots/pine_*.png (PF_SHOTS to change, PF_TAG to prefix the names); exits 1 on a page error or a failed check
// A player saw the pine as "a trunk skewered through pancakes": the trunk stack ran up to H-6, above the tiny cap tier, and each
// flat tier only reached a few px above its own centre, so the trunk showed between the tiers and stuck out of the top.
// Checks, for every pine variant at several camera angles and wind poses (including a chop lean): the top rows are foliage,
// the centre column is solid foliage from the tip down to the lowest tier (no trunk, no see-through gap), and only a short
// trunk stub (2-4 rows) shows under the lowest tier.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.treeImage, null, { timeout: 30000 });
  await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true;
    S.t = Math.floor(S.t / 1440) * 1440 + 11 * 60; if (S.weather) S.weather.rained = false; f.advance(0.1, 10); });
  const check = async (name, run, ok, shot) => { name = 'pine_' + TAG + name; if (only && !name.includes(only)) return;
    let r; try { r = await run(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    if (shot) await shot(path.join(OUT, name + '.png'));
    const bad = r && r.error ? r.error : ok(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700)); if (bad) fails.push(name + ': ' + bad); };

  // every variant x angle x pose: measure the sprite
  await check('shape', () => p.evaluate(() => { const f = __farm, out = [];
    const measure = im => { const { w, h, ox, cls } = im, at = (x, y) => cls[y * w + x];
      let top = h; for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (at(x, y)) { top = y; break; }
      let trunkTop = h, trunkRows = 0; for (let y = 0; y < h; y++) { let t = 0; for (let x = 0; x < w; x++) if (at(x, y) === 2) t = 1; if (t) { trunkRows++; trunkTop = Math.min(trunkTop, y); } }
      let between = 0; for (let x = 0; x < w; x++) { let leaf = false; for (let y = h - 1; y >= 0; y--) { const k = at(x, y); if (k === 1) leaf = true; else if (k === 2 && leaf) between++; } } // trunk with needles below it
      let leafBot = -1; for (let y = 0; y < h; y++) for (let x = ox - 2; x <= ox + 1; x++) if (at(x, y) === 1) leafBot = Math.max(leafBot, y);
      const holes = []; for (let x = ox - 1; x <= ox; x++) for (let y = top + (x === ox ? 1 : 5); y < leafBot - 1; y++) if (at(x, y) === 0 || at(x, y) === 2) holes.push([x - ox, y - top, at(x, y)]);
      let lastLeaf = -1, stub = 0; for (let y = 0; y < h; y++) if (at(ox, y) === 1) lastLeaf = y; for (let y = lastLeaf + 1; y < h; y++) if ([-2, -1, 0, 1].some(d => at(ox + d, y) === 2)) stub++; // the stub under the skirt
      let topTrunk = 0; for (let y = top; y < top + 4; y++) for (let x = 0; x < w; x++) if (at(x, y) === 2) topTrunk++;
      return { treeH: leafBot - top, trunkRows, stub, trunkAbove: between, topTrunk, holes: holes.length, hole0: holes[0] || null }; };
    f.treeDefs.pine.forEach((def, i) => { for (const a of [0, 0.22, 0.6, 1.3, 2.4, 3.9]) { f.setAngle(a); f.render();
      for (let t = 0; t < 20; t += 0.7) for (const lean of [0, 0.8]) { const m = measure(f.treeImage(def, 300 + i * 40, 120, t, lean)); m.v = i; m.a = a; out.push(m); } } });
    const worst = k => out.reduce((m, o) => o[k] > m[k] ? o : m, out[0]);
    return { n: out.length, maxTrunkRows: worst('trunkRows').trunkRows, stub: [Math.min(...out.map(o => o.stub)), Math.max(...out.map(o => o.stub))], stubBy: [...new Set(out.map(o => o.v + '@' + o.a + ':' + o.stub))].join(' '), maxTrunkAbove: worst('trunkAbove').trunkAbove,
      maxTopTrunk: worst('topTrunk').topTrunk, maxHoles: worst('holes').holes, holeAt: worst('holes'), heights: [...new Set(out.map(o => o.treeH))].sort((x, y) => x - y) }; }),
    r => r.maxTopTrunk ? `trunk in the top rows (${r.maxTopTrunk} px)` : r.maxTrunkAbove ? `trunk shows between the tiers (${r.maxTrunkAbove} px with needles under them)` : r.maxHoles ? `centre column not solid foliage: ${JSON.stringify(r.holeAt)}`
      : r.maxTrunkRows > 7 ? `trunk spans ${r.maxTrunkRows} rows` : r.stub[1] > 4 ? `trunk stub ${r.stub[1]} px tall` : r.stub[0] < 2 ? `trunk stub only ${r.stub[0]} px` : null);

  // close-ups: the three variants at the default angle, still and at a gust, 8x, on grass
  const closeup = (angle, poses, file) => p.evaluate(([angle, poses]) => new Promise(done => { const f = __farm; f.setAngle(angle); f.render(); const ims = [];
    f.treeDefs.pine.forEach((def, i) => poses.forEach(t => ims.push(f.treeImage(def, 300 + i * 40, 120, t, 0))));
    const Z = 8, pad = 4, cw = ims.reduce((s, m) => s + m.w + pad, pad), ch = Math.max(...ims.map(m => m.h)) + 2 * pad;
    const c = document.createElement('canvas'); c.width = cw * Z; c.height = ch * Z; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#358a3c'; g.fillRect(0, 0, c.width, c.height);
    let x = pad, n = 0; const imgs = ims.map(m => { const im = new Image(); im.src = m.url; return im; });
    imgs.forEach((im, k) => im.onload = () => { if (++n < imgs.length) return; for (let j = 0; j < ims.length; j++) { const m = ims[j];
        g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse((x + m.ox) * Z, (ch - pad - (m.h - m.oy)) * Z, 14 * Z, 5 * Z, 0, 0, 7); g.fill();
        g.drawImage(imgs[j], x * Z, (ch - pad - m.h) * Z, m.w * Z, m.h * Z); x += m.w + pad; }
      done(c.toDataURL()); }); }), [angle, poses]).then(u => fs.writeFileSync(file, Buffer.from(u.split(',')[1], 'base64')));
  for (const [name, a] of [['closeup', 0.22], ['closeup_turned', 1.3]]) if (!only || ('pine_' + TAG + name).includes(only)) { await closeup(a, [0, 6.3], path.join(OUT, 'pine_' + TAG + name + '.png')); console.log('ok   pine_' + TAG + name); }

  // in the scene: a stand of pines near the farm at three zoom steps
  const target = await p.evaluate(() => { const f = __farm, ps = f.props.filter(q => q.tree && q.tree.kind === 'pine'); f.setAngle(0.22);
    const best = ps.map(q => [q, ps.filter(o => Math.hypot(o.x - q.x, o.y - q.y) < 60).length]).sort((a, b) => b[1] - a[1])[0]; return best ? [best[0].x, best[0].y + 10, ps.length] : null; });
  for (const z of [0, 1, 2]) await check('scene_zoom' + z, () => p.evaluate(([x, y, n]) => { const f = __farm; f.setAngle(0.22); f.panTo(x, y); f.render(); return { pines: n, at: [x, y] }; }, target || [0, 0, 0]),
    r => !r.pines ? 'no pine on the map' : null, async file => { const g = p.locator('#game'); if (z) await g.hover({ position: { x: 5, y: 5 } }).catch(() => {}); if (z) await p.mouse.wheel(0, -100); await p.waitForTimeout(150);
      await p.evaluate(() => __farm.render()); await p.screenshot({ path: file }); });
  if (errs.length) fails.push('page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); server.close();
  if (fails.length) { console.log('\nFAILED:\n  ' + fails.join('\n  ')); process.exit(1); } console.log('\nall pine checks ok');
})().catch(e => { console.error(e); process.exit(1); });
