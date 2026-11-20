// Screenshots + browser checks for v5.11.0.6 (未开放区域的地图阴影):  node tools/fog-shots.js [name-filter]
//   writes /workspace/pf-shots/fog_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const VER = '5.11.0.6';
const FIX = path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json');
const readSave = f => { const t = fs.readFileSync(f, 'utf8'); const s = JSON.parse(t); return s.save || s; };
fs.mkdirSync(OUT, { recursive: true });

(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save, vp) { const { query, ...opt } = vp || {}; const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opt)); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual' + (query || '')); const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await ready();
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true;
      window.__said = []; addEventListener('pf:say', e => __said.push(String(e.detail))); }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.2, 10); };
    const hide = () => { for (const id of ['say']) { const el = document.getElementById(id); if (el) { el.hidden = true; el.textContent = ''; } } };
    const openTown = () => { S.coins = Math.max(S.coins, 800000); f.FARMER.wood = Math.max(f.FARMER.wood, 2000);
      if (!S.eff.regions.includes('east')) for (const id of ['house', 'house', 'axe', 'forest', 'east', 'orchard', 'south', 'pasture', 'coast']) f.buy(id);
      if (!S.family.moved) { S.family.met = 1; S.family.moved = 1; S.family.love = 100; f.syncFamily(); } f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const toLv3 = () => { const H = S.town.hall; H.built = H.built || {}; ['L5', 'L8', 'L11', 'market', 'bakery'].forEach((id, i) => { H.built[id] = Math.max(1, S.day - 5 + i); }); f.applyUpgrades(); };
    const cv = document.getElementById('game'), g = cv.getContext('2d');
    // the on / off brightness ratio at world points (proves the shade sits on the ground under any camera)
    // only points on screen and deep inside a shade (cell 1) or plainly outside one are sampled; never the padlocks
    const deep = pts => pts.filter(([x, y]) => { const [sx, sy] = f.proj(x, y); return sx >= 2 && sy >= 2 && sx < cv.width - 2 && sy < cv.height - 2 && (f.fogCell(x, y) >= 0.99 || f.fogCell(x, y) === 0); });
    const ratio = pts => { f.render(); for (const [x, y] of pts) { const [sx, sy] = f.proj(x, y); if (sx < 0 || sy < 0 || sx >= cv.width || sy >= cv.height) throw new Error('off screen sample ' + x + ',' + y); } const on = pts.map(([x, y]) => { const [sx, sy] = f.proj(x, y); return Array.from(g.getImageData(Math.round(sx), Math.round(sy), 1, 1).data); });
      f.fogSet(false); f.render(); const off = pts.map(([x, y]) => { const [sx, sy] = f.proj(x, y); return Array.from(g.getImageData(Math.round(sx), Math.round(sy), 1, 1).data); }); f.fogSet(true); f.fogUpdate(true); f.render();
      return on.map((c, i) => { const a = c[0] + c[1] + c[2], z = off[i][0] + off[i][1] + off[i][2]; return z ? +(a / z).toFixed(2) : 1; }); };
    const same = () => { f.render(); const a = cv.toDataURL(); f.fogSet(false); f.render(); const z = cv.toDataURL(); f.fogSet(true); f.fogUpdate(true); f.render(); return a === z; };
    const jumps = () => Object.fromEntries(Array.from(document.querySelectorAll('#mmJump button[data-j]')).map(b => [b.dataset.j, b.classList.contains('locked') ? 'locked:' + b.title : 'open']));
    const fog = () => Object.assign(f.fog(), { ver: f.version, sv: f.snapshot().saveVersion });`;
  const shot = async (name, fn, check, save, vp, el) => { if (only && !name.includes(only)) return;
    const p = await page(save, vp); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300);
    if (el) { const box = await p.evaluate(ids => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const id of ids.split(',')) { const e = document.getElementById(id.trim()); if (!e) continue; const r = e.getBoundingClientRect(); if (!r.width) continue;
        x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); } return x1 > x0 ? { x: x0 - 4, y: y0 - 4, width: x1 - x0 + 8, height: y1 - y0 + 8 } : null; }, el);
      if (box) await p.screenshot({ path: path.join(OUT, name), clip: box }); } else await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const wide = { viewport: { width: 1600, height: 1000 }, query: '&view=800x500' };

  // 1. a fresh farm: both districts shaded, the farm untouched, wide overview from the farm's east edge to the town
  await shot('fog_early_overview.png', `(() => { ${helpers} at(10 * 60); dry(); look(600, 40, 0); hide(); const r = fog();
      r.farmSame = (look(100, 60, 0), same()); look(600, 40, 0);
      r.r = ratio([[520, 80], [700, 60], [760, -40], [700, 160], [430, 60], [420, -60], [410, 150]]); r.jumps = jumps(); return r; })()`,
    r => r.ver !== VER ? 'ver ' + r.ver : r.sv !== 15 ? 'sv ' + r.sv : !r.shut || !r.shut.agri || !r.shut.town ? 'not shut ' + JSON.stringify(r.shut) : !r.farmSame ? 'the farm view changed'
      : r.r.slice(0, 4).some(v => v > 0.7) ? 'districts not shaded ' + r.r : r.r.slice(4).some(v => v !== 1) ? 'farm shaded ' + r.r
      : !/^locked:/.test(r.jumps.agri) || !/^locked:/.test(r.jumps.town) || !/^locked:/.test(r.jumps.beach) || r.jumps.home !== 'open' ? 'jumps ' + JSON.stringify(r.jumps) : null, null, wide);
  // 2. close-ups: the shut town and the 农家乐区 (with the padlock), a night look
  await shot('fog_early_town.png', `(() => { ${helpers} at(10 * 60); dry(); look(792, 20, 0); hide(); const r = fog(); r.r = ratio([[792, 60], [720, -50], [850, -20]]); return r; })()`,
    r => r.r.some(v => v > 0.7) ? 'town not shaded ' + r.r : r.lockA.town !== 1 ? 'no padlock' : null);
  await shot('fog_early_agri.png', `(() => { ${helpers} at(10 * 60); dry(); look(500, 50, 0); hide(); const r = fog(); r.r = ratio([[520, 100], [560, -30], [430, 60]]); return r; })()`,
    r => r.r[0] > 0.7 || r.r[1] > 0.7 ? 'agri not shaded ' + r.r : r.r[2] !== 1 ? 'east road plot shaded ' + r.r : null);
  await shot('fog_early_night.png', `(() => { ${helpers} at(21 * 60); dry(); look(600, 40, 0); hide(); return fog(); })()`, null, null, wide);
  // 3. camera scroll, rotation and the map's south edge: the shade stays on the same ground (no swimming, no gaps)
  await shot('fog_scroll.png', `(() => { ${helpers} at(10 * 60); dry(); const out = [];
      for (const [x, y, a] of [[560, 66, 0], [640, 150, 0], [700, 260, 0], [800, 330, 0], [900, -180, 0], [600, 40, 0.6], [700, 100, -0.9], [480, 200, 2.2]]) { look(x, y, a);
        const r = ratio(deep([[x, y], [x + 30, y - 20], [x - 25, y + 15], [x + 10, y + 30]]).filter(([px, py]) => f.fogCell(px, py) >= 0.99));
        out.push([x, y, a, r]); }
      look(560, 230, 0.4); hide(); return { out }; })()`,
    r => { // particles and leaves are drawn over the shade, so a stray bright sample is fine; most must be dark
      const all = r.out.flatMap(o => o[3]), dark = all.filter(v => v <= 0.75).length; return all.length < 20 || dark < all.length * 0.85 ? 'unshaded under ' + JSON.stringify(r.out) : null; });
  // 4. taps and hover say how to open a district
  await shot('fog_hint.png', `(() => { ${helpers} at(10 * 60); look(792, 40, 0); const tap = f.fogTap(792, 40), farm = f.fogTap(100, 60);
      const r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
      const title = cv.title; document.querySelector('#mmJump button[data-j=agri]').click(); return { tap, farm, said: __said.slice(), title, cam: [f.cam.x, f.cam.y] }; })()`,
    r => !r.tap || r.farm ? 'tap ' + r.tap + '/' + r.farm : !/小镇还没开放/.test(r.said[0] || '') ? 'said ' + r.said : !/小镇/.test(r.title) ? 'hover title ' + r.title : !/农家乐区还没开放/.test(r.said[1] || '') ? 'jump hint ' + r.said
      : Math.abs(r.cam[0] - 520) > 30 ? 'locked jump still moves the camera ' + r.cam : null);
  await shot('fog_minimap_early.png', `(() => { ${helpers} at(10 * 60); look(100, 60, 0); f.minimapDraw(); return { jumps: jumps() }; })()`, null, null, { deviceScaleFactor: 2 }, 'minimap, mmJump');
  // 5. the town opens: the town shade lifts with a fade, the 农家乐区 stays shaded, the built road through it is lit
  await shot('fog_fade_mid.png', `(() => { ${helpers} at(10 * 60); dry(); look(600, 40, 0); f.advance(0.3, 10); const opened = openTown(); f.advance(0.1, 10); f.advance(0.45, 20); hide();
      const r = fog(); r.opened = opened; r.r = ratio([[700, 60], [520, 100]]); return r; })()`,
    r => !r.opened ? 'town not bought' : !r.fading ? 'no fade' : !(r.lockA.town > 0.05 && r.lockA.town < 0.95) ? 'padlock alpha ' + r.lockA.town : !(r.r[0] > 0.55 && r.r[0] < 0.98) ? 'mid-fade town ratio ' + r.r[0] : r.r[1] > 0.7 ? 'agri lost its shade mid fade ' + r.r[1] : null, null, wide);
  await shot('fog_mid.png', `(() => { ${helpers} at(10 * 60); dry(); look(600, 40, 0); openTown(); f.advance(2, 10); hide();
      const r = fog(); r.r = ratio([[700, 60], [660, 120], [520, 100], [560, 140], [520, 66], [570, 66]]); r.jumps = jumps(); r.hint = f.fogHint('agri'); return r; })()`,
    r => r.fading ? 'still fading' : r.shut.town || !r.shut.agri ? 'shut ' + JSON.stringify(r.shut) : r.r[0] !== 1 || r.r[1] !== 1 ? 'town still shaded ' + r.r : r.r[2] > 0.7 || r.r[3] > 0.7 ? 'agri not shaded ' + r.r
      : r.r[4] !== 1 || r.r[5] !== 1 ? 'the road through the 农家乐区 is shaded ' + r.r : r.jumps.town !== 'open' || !/^locked:/.test(r.jumps.agri) ? 'jumps ' + JSON.stringify(r.jumps) : !/现在 1/.test(r.hint || '') ? 'hint ' + r.hint : null, null, wide);
  await shot('fog_minimap_mid.png', `(() => { ${helpers} openTown(); f.advance(2, 10); look(100, 60, 0); f.minimapDraw(); return { jumps: jumps() }; })()`, null, null, { deviceScaleFactor: 2 }, 'minimap, mmJump');
  // 6. prosperity 3: the 农家乐区 opens too; nothing shaded any more and nothing drawn
  await shot('fog_full.png', `(() => { ${helpers} at(10 * 60); dry(); look(600, 40, 0); openTown(); f.advance(2, 10); toLv3(); f.advance(2, 10); hide();
      const r = fog(); r.same = same(); r.jumps = jumps(); r.lv = f.hallView().lv; return r; })()`,
    r => r.lv < 3 ? 'lv ' + r.lv : r.fading || !r.empty ? 'still shaded ' + JSON.stringify(r.shut) : !r.same ? 'something still drawn' : r.jumps.agri !== 'open' || r.jumps.town !== 'open' ? 'jumps ' + JSON.stringify(r.jumps) : null, null, wide);
  // 6b. v5.11.0.5 农家乐区: the lodging stands in the district (cabins, two-storey inn, restaurant) — no shade over it
  const district = `S.inn.cabins = 4; S.inn.inn2 = 1; S.inn.diner.lv = 3; S.inn.job = null; S.inn.arrived = 0; S.inn._morn = 0; f.IA.sync(true); f.markNavDirty(); f.innRepaint(); f.applyUpgrades();`;
  await shot('fog_agri_built.png', `(() => { ${helpers} at(11 * 60); dry(); openTown(); f.advance(2, 10); toLv3(); ${district} f.advance(2, 10); look(520, 62, 0); hide();
      const r = fog(); r.same = same(); r.props = (f.props || []).filter(q => q.inn).length; r.cells = [f.fogCell(490, 20), f.fogCell(550, 150), f.fogCell(520, 100)]; return r; })()`,
    r => r.props < 20 ? 'district not built ' + r.props : !r.empty || r.shut.agri ? 'district still shaded ' + JSON.stringify(r.shut) : r.cells.some(v => v) ? 'cells ' + r.cells : !r.same ? 'something drawn' : null);
  // the first lodging going up lifts the district's shade with the fade (a migrated old inn, or a build finishing)
  await shot('fog_agri_fade.png', `(() => { ${helpers} at(11 * 60); dry(); openTown(); f.advance(2, 10); look(520, 62, 0); const before = fog(); ${district} f.advance(0.1, 10); f.advance(0.5, 20); hide();
      const r = fog(); r.before = before.shut; r.mid = r.fading; f.advance(1.5, 10); r.after = fog(); return r; })()`,
    r => !r.before.agri ? 'district was not shut before' : !r.mid ? 'no fade' : r.after.fading || !r.after.empty ? 'did not finish ' + JSON.stringify(r.after) : null, null, wide);
  await shot('fog_minimap_full.png', `(() => { ${helpers} openTown(); toLv3(); f.advance(3, 10); look(100, 60, 0); f.minimapDraw(); return fog(); })()`, null, null, { deviceScaleFactor: 2 }, 'minimap, mmJump');
  // 7. an existing save that already opened everything: no shade and no fade on load; the day-72 fixture (town shut) is shaded
  if (!only || 'fog_load'.includes(only) || only.includes('fog_load')) {
    const p = await page(null); const snap = await p.evaluate(`(() => { ${helpers} openTown(); toLv3(); f.advance(3, 10); return f.snapshot(); })()`); await p.context().close();
    await shot('fog_load_open.png', `(() => { ${helpers} f.render(); const r = fog(); r.lv = f.hallView().lv; look(600, 40, 0); r.same = same(); return r; })()`,
      r => !r.init || r.fading || !r.empty ? 'shade on an opened save ' + JSON.stringify(r) : !r.same ? 'drawn' : null, snap, wide);
  }
  await shot('fog_load_fixture.png', `(() => { ${helpers} f.render(); const r = fog(); look(600, 40, 0); hide(); return r; })()`,
    r => r.fading ? 'fades on load' : !r.shut || !r.shut.town || !r.shut.agri ? 'fixture should be shut ' + JSON.stringify(r.shut) : null, readSave(FIX), wide);
  // 8. cost: renders with and without the shade over the shut town
  await shot('fog_perf.png', `(() => { ${helpers} at(10 * 60); look(700, 40, 0.3); const N = 60, t = on => { f.fogSet(on); f.fogUpdate(true); f.render(); const t0 = performance.now(); for (let i = 0; i < N; i++) f.render(); return (performance.now() - t0) / N; };
      t(true); t(false); const off = t(false), on = t(true), off2 = t(false), on2 = t(true);
      let rebuild = 0, first = 0; { let t0 = performance.now(); const m = f.FG.membership({ road: true }); first = performance.now() - t0; t0 = performance.now(); f.FG.field(m, { agri: true, town: true }); rebuild = performance.now() - t0; }
      // the fade: render-only frames while the town shade lifts, against the same frames once it is done
      openTown(); f.advance(0.05, 20); const step = () => { f.setRealT(f.getRealT() + 1 / 30); const t0 = performance.now(); f.render(); return performance.now() - t0; };
      let fade = 0, k = 0; while (f.fog().fading && k < 60) { fade += step(); k++; } let after = 0; for (let i = 0; i < k; i++) after += step();
      return { off: +((off + off2) / 2).toFixed(2), on: +((on + on2) / 2).toFixed(2), extra: +(((on + on2) - (off + off2)) / 2).toFixed(2), rebuild: +rebuild.toFixed(1), firstBuild: +(first + rebuild).toFixed(1), fadeFrames: k,
        fadeExtra: +((fade - after) / Math.max(1, k)).toFixed(2) }; })()`,
    r => r.extra > 3 ? 'shade costs ' + r.extra + ' ms a frame' : r.fadeFrames < 20 ? 'fade too short ' + r.fadeFrames : r.fadeExtra > 6 ? 'fade costs ' + r.fadeExtra + ' ms a frame' : null);

  await b.close(); server.close();
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); process.exit(1); }
  if (fails.length) { console.log('FAILED:', fails); process.exit(1); }
  console.log('fog-shots: all ok');
})();
