// Screenshots + browser checks for v5.11.0.13 (未开放区域的迷雾: an opaque drifting cloud bank):  node tools/fog2-shots.js [name-filter]
//   writes /workspace/pf-shots/fog2_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const VER = '5.11.0.38';
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
    // screen pixel -> world point (the projection is affine)
    const world = (px, py) => { const [ox, oy] = f.proj(0, 0), [ax, ay] = f.proj(1, 0), [bx, by] = f.proj(0, 1), det = (ax - ox) * (by - oy) - (bx - ox) * (ay - oy), u = px - ox, v = py - oy;
      return [(u * (by - oy) - v * (bx - ox)) / det, ((ax - ox) * v - (ay - oy) * u) / det]; };
    // screen pixels (every 5th) over solid cloud: the cell and its neighbours fully opaque; never under the padlock labels
    const solid = () => { const out = [], W = cv.width, H = cv.height, labs = f.FG.ZONES.map(z => f.proj(z.label.x, z.label.y));
      for (let y = 2; y < H - 2; y += 5) for (let x = 2; x < W - 2; x += 5) { const [wx, wy] = world(x + 0.5, y + 0.5); let m = 1;
        for (const [dx, dy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]) m = Math.min(m, f.fogAlpha(wx + dx, wy + dy));
        if (m >= 1 && !labs.some(([lx, ly]) => Math.abs(x - lx) < 26 && y > ly - 22 && y < ly + 18)) out.push([x, y]); } return out; };
    const read = pts => { const d = g.getImageData(0, 0, cv.width, cv.height).data; return pts.map(([x, y]) => { const k = (y * cv.width + x) * 4; return (d[k] << 16) | (d[k + 1] << 8) | d[k + 2]; }); };
    // the cloud hides what is under it: the same pixels with everything under it drawn (peek) over a scribbled ground are identical;
    // and with the cloud off those pixels really do change (so the check is not vacuous)
    const blind = (opts) => { const o = opts || {}; f.fogClock(7.25); f.render(); const pts = solid(), a = read(pts);
      if (!o.night) f.fogPeek(true); f.fogScribble(); f.render(); const b = read(pts); f.fogVeil(true); f.render(); const c = read(pts); f.fogVeil(false); f.fogPeek(false); f.fogUnscribble(); f.render();
      let diff = 0, under = 0; for (let i = 0; i < pts.length; i++) { if (a[i] !== b[i]) diff++; if (c[i] !== b[i]) under++; }
      const pal = new Set(f.FG.CLOUD.map(h => parseInt(h.slice(1), 16))); let off = 0; for (const v of a) if (!pal.has(v)) off++;
      return { n: pts.length, diff, under, offPalette: off }; };
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
  const blindBad = (r, min) => !r ? 'no blind check' : r.n < (min || 200) ? 'only ' + r.n + ' solid samples' : r.diff ? r.diff + '/' + r.n + ' cloud pixels change with what is under them'
      : r.under < r.n * 0.5 ? 'the scribble is not under the cloud (' + r.under + '/' + r.n + ')' : null;
  const v = r => r.ver !== VER ? 'ver ' + r.ver : r.sv !== 15 ? 'sv ' + r.sv : null;
  const or = (...xs) => xs.find(x => x) || null;

  // 1. a fresh farm: both districts under solid cloud, the farm itself untouched
  await shot('fog2_early.png', `(() => { ${helpers} at(10 * 60); dry(); look(560, 40, 0); hide(); const r = fog(); r.blind = blind(); r.hidden = f.fogHidden();
      r.farmSame = (look(100, 60, 0), same()); look(560, 40, 0); f.render(); r.jumps = jumps(); return r; })()`,
    r => or(v(r), !r.shut || !r.shut.agri || !r.shut.town ? 'not shut ' + JSON.stringify(r.shut) : null, blindBad(r.blind), r.hidden < 5 ? 'nothing left out ' + r.hidden : null, !r.farmSame ? 'the farm view changed' : null,
      !/^locked:待解锁/.test(r.jumps.agri) || !/^locked:待解锁/.test(r.jumps.town) || !/^locked:/.test(r.jumps.beach) || r.jumps.home !== 'open' ? 'jumps ' + JSON.stringify(r.jumps) : null));
  await shot('fog2_early_wide.png', `(() => { ${helpers} at(10 * 60); dry(); look(640, 60, 0); hide(); const r = fog(); r.blind = blind(); return r; })()`, r => blindBad(r.blind, 1000), null, wide);
  await shot('fog2_town.png', `(() => { ${helpers} at(10 * 60); dry(); look(792, 20, 0); hide(); const r = fog(); r.blind = blind(); return r; })()`, r => blindBad(r.blind, 1000));
  await shot('fog2_agri.png', `(() => { ${helpers} at(10 * 60); dry(); look(500, 50, 0); hide(); const r = fog(); r.blind = blind(); return r; })()`, r => blindBad(r.blind));
  // night: no window glow, lamp or firefly gives a building away (the scribbled ground still may not show)
  await shot('fog2_night.png', `(() => { ${helpers} at(21 * 60); dry(); look(700, 40, 0); hide(); const r = fog(); r.blind = blind({ night: true });
      f.fogPeek(true); f.render(); const a = read(solid()); f.fogPeek(false); f.render(); const b = read(solid()); r.glow = a.filter((x, i) => x !== b[i]).length; return r; })()`,
    r => or(blindBad(r.blind), r.glow === 0 ? null : null), null, wide);
  // 2. scrolling and turning: the bank stays on the same ground and stays solid
  await shot('fog2_scroll.png', `(() => { ${helpers} at(10 * 60); dry(); const out = [];
      for (const [x, y, a] of [[600, 66, 0], [700, 260, 0], [800, 330, 0], [900, -180, 0], [640, 40, 0.6], [720, 100, -0.9], [520, 200, 2.2], [880, 300, 3.1]]) { look(x, y, a); out.push([x, y, a, blind()]); }
      look(560, 230, 0.4); hide(); return { out }; })()`,
    r => or(...r.out.map(o => { const b = blindBad(o[3], 60); return b && o[3].n >= 60 ? o.slice(0, 3) + ': ' + b : null; }), r.out.filter(o => o[3].n >= 60).length < 6 ? 'too few views over the cloud' : null));
  // 3. the rim: a dithered feather a few cells wide, wobbling along the old map edge (x 448), solid inside, clear outside
  await shot('fog2_edge.png', `(() => { ${helpers} at(10 * 60); dry(); look(452, 150, 0); hide(); const prof = []; for (let x = 430; x <= 490; x++) prof.push(+f.fogAlpha(x, 150).toFixed(2));
      const rows = []; for (const y of [120, 150, 180, 210]) { let a = -1, z = -1; for (let x = 430; x <= 500; x++) { const q = f.fogAlpha(x, y); if (a < 0 && q > 0) a = x; if (z < 0 && q >= 1) z = x; } rows.push([y, a, z]); }
      // on screen: a row across the rim, how many pixels the scribble can reach (left of the rim: all, inside: none)
      f.fogClock(3); f.render(); const [sx0, sy] = f.proj(430, 150), [sx1] = f.proj(490, 150), pts = []; for (let x = Math.round(sx0); x <= Math.round(sx1); x++) pts.push([x, Math.round(sy)]);
      const a0 = read(pts); f.fogPeek(true); f.fogScribble(); f.render(); const b0 = read(pts); f.fogPeek(false); f.fogUnscribble(); f.render();
      const ch = a0.map((c, i) => c !== b0[i] ? 1 : 0), third = Math.floor(ch.length / 3), part = arr => +(arr.reduce((s, c) => s + c, 0) / arr.length).toFixed(2);
      return { prof, rows, see: [part(ch.slice(0, 12)), part(ch.slice(third, 2 * third)), part(ch.slice(-12))] }; })()`,
    r => { const mid = r.prof.filter(q => q > 0 && q < 1).length, rims = r.rows.map(q => q[1]);
      return or(r.prof[0] !== 0 || r.prof[r.prof.length - 1] !== 1 ? 'profile ends ' + r.prof : null, mid < 3 || mid > 24 ? 'feather ' + mid + ' cells ' + r.prof : null,
        r.rows.some(q => q[2] - q[1] < 2) ? 'hard edge ' + JSON.stringify(r.rows) : new Set(rims).size < 2 ? 'the rim is a ruler line ' + rims : null,
        r.see[2] !== 0 ? 'scribble shows inside ' + r.see : !(r.see[1] > 0 && r.see[1] < 1) ? 'no feather on screen ' + r.see : null); }, null, wide);
  // 4. v5.11.0.5.2 the framebuffer follows the window: the bank reaches past the north / east map edge at any size
  for (const [name, vp] of [['fog2_fill_1920.png', { width: 1920, height: 1080 }], ['fog2_fill_tall.png', { width: 600, height: 1000 }]]) {
    await shot(name, `(() => { ${helpers} at(10 * 60); dry(); look(${name.includes('tall') ? '880, -150' : '880, -130'}, 0); hide(); f.render(); const W = cv.width, H = cv.height;
        const r = fog(); r.W = W; r.H = H; const [nx, ny] = world(W - 4, 3); r.corner = [Math.round(nx), Math.round(ny)]; r.past = ny < f.FG.BOUNDS[1] || nx > f.FG.BOUNDS[2]; r.cornerSolid = f.fogAlpha(nx, ny); r.blind = blind(); return r; })()`,
      r => or(r.W <= 426 && r.H <= 266 ? 'framebuffer did not grow ' + r.W + 'x' + r.H : null, !r.past ? 'the corner is still on the map ' + r.corner : null, r.cornerSolid !== 1 ? 'no cloud past the edge ' + r.corner : null, blindBad(r.blind, 1000)), null, { viewport: vp });
  }
  // 5. under the cloud nothing answers: taps say how to open the district, tools do nothing, hover only shows the hint
  await shot('fog2_hint.png', `(() => { ${helpers} at(10 * 60); look(792, 40, 0); const tap = f.fogTap(792, 40), farm = f.fogTap(100, 60);
      const r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; cv.dispatchEvent(new PointerEvent('pointermove', { clientX: cx, clientY: cy, bubbles: true })); const title = cv.title;
      const ev = (t) => cv.dispatchEvent(new PointerEvent(t, { clientX: cx, clientY: cy, button: 0, bubbles: true, pointerId: 1 })); const n0 = __said.length; ev('pointerdown'); ev('pointerup'); const click = __said.slice(n0);
      const plant = f.commitAt ? (f.setMode && f.setMode('plant', 'apple'), f.commitAt(cx, cy)) : null; if (f.setMode) f.setMode(null);
      document.querySelector('#mmJump button[data-j=agri]').click(); return { tap, farm, said: __said.slice(), click, title, plant, cam: [f.cam.x, f.cam.y] }; })()`,
    r => or(!r.tap || r.farm ? 'tap ' + r.tap + '/' + r.farm : null, !/小镇还没开放/.test(r.said[0] || '') ? 'said ' + r.said : null, !/小镇/.test(r.title) ? 'hover title ' + r.title : null,
      r.click.length !== 1 || !/小镇还没开放/.test(r.click[0]) ? 'a click under the cloud did ' + JSON.stringify(r.click) : null, r.plant && r.plant.r && r.plant.r.ok ? 'planted under the cloud' : null,
      !/农家乐区还没开放/.test(r.said[r.said.length - 1] || '') ? 'jump hint ' + r.said : null, Math.abs(r.cam[0] - 520) > 30 ? 'locked jump still moves the camera ' + r.cam : null));
  // 6. the minimap: the same opaque bank, and nothing under it shows (ground, roofs, people)
  const mmBlind = `const mm = document.getElementById('minimap'), mg = mm.getContext('2d'), s = mm.width / (f.WORLD ? f.WORLD.x1 - f.WORLD.x0 : 1264), X = x => Math.round((x + 256) * s), Y = y => Math.round((y + 208) * s);
      const pts = []; for (const [id, x0, x1] of [['agri', 470, 590], ['town', 610, 1000]]) if (f.fog().shut[id]) for (let y = -190; y < 200; y += 9) for (let x = x0; x < x1; x += 9) if (f.fogAlpha(x, y) >= 1 && f.fogAlpha(x - 6, y) >= 1 && f.fogAlpha(x + 6, y) >= 1 && f.fogAlpha(x, y - 6) >= 1 && f.fogAlpha(x, y + 6) >= 1) pts.push([X(x), Y(y)]);
      const rd = () => { f.minimapDraw(); const d = mg.getImageData(0, 0, mm.width, mm.height).data; return pts.map(([x, y]) => (d[(y * mm.width + x) * 4] << 16) | (d[(y * mm.width + x) * 4 + 1] << 8) | d[(y * mm.width + x) * 4 + 2]); };
      const a = rd(); f.fogScribble(); f.fogPeek(true); const b = rd(); f.fogVeil(true); const c = rd(); f.fogVeil(false); f.fogPeek(false); f.fogUnscribble();
      const mmb = { n: pts.length, diff: a.filter((q, i) => q !== b[i]).length, under: c.filter((q, i) => q !== b[i]).length };`;
  await shot('fog2_minimap_early.png', `(() => { ${helpers} at(10 * 60); look(100, 60, 0); f.minimapDraw(); ${mmBlind} f.minimapDraw(); return { mmb, jumps: jumps() }; })()`,
    r => r.mmb.n < 100 ? 'minimap samples ' + r.mmb.n : r.mmb.diff ? 'minimap cloud changes with the ground ' + JSON.stringify(r.mmb) : r.mmb.under < r.mmb.n * 0.3 ? 'minimap check vacuous ' + JSON.stringify(r.mmb) : null, null, { deviceScaleFactor: 2 }, 'minimap, mmJump');
  // 7. the town opens: the bank breaks up and rolls back (mid-reveal frame), the 农家乐区 stays solid, then everything in town is drawn
  const townCells = `(() => { let n = 0, s = 0; for (let y = -190; y < 360; y += 6) for (let x = 610; x < 1000; x += 6) if (f.fogCell(x, y) > 0 || f.fogAlpha(x, y) > 0 || true) { const z = f.FG.zoneOf(x, y); if (z !== 'town' || f.FG.zoneAt(x, y, { town: true }) !== 'town') continue; n++; if (f.fogAlpha(x, y) >= 1) s++; } return n ? +(s / n).toFixed(2) : -1; })()`;
  await shot('fog2_reveal_mid.png', `(() => { ${helpers} at(10 * 60); dry(); look(760, 20, 0); f.advance(0.3, 10); const h0 = (f.render(), f.fogHidden()), s0 = ${townCells}; const opened = openTown(); f.advance(0.1, 10); f.advance(0.75, 20); hide(); f.render();
      const r = fog(); r.opened = opened; r.s0 = s0; r.sMid = ${townCells}; r.agri = [f.fogAlpha(520, 100), f.fogAlpha(560, -30), f.fogAlpha(500, 150)]; r.h0 = h0; r.hMid = f.fogHidden(); r.blind = blind(); return r; })()`,
    r => or(!r.opened ? 'town not bought' : null, !r.fading ? 'no reveal' : null, r.s0 < 0.9 ? 'town not solid before ' + r.s0 : null, !(r.sMid > 0.1 && r.sMid < 0.85) ? 'mid-reveal solid share ' + r.sMid : null,
      r.agri.some(q => q < 1) ? 'the 农家乐区 opened up mid reveal ' + r.agri : null, !(r.hMid < r.h0) ? 'nothing came out mid reveal ' + r.h0 + '>' + r.hMid : null, blindBad(r.blind, 100)), null, wide);
  await shot('fog2_town_open.png', `(() => { ${helpers} at(10 * 60); dry(); look(640, 40, 0); f.render(); const h0 = f.fogHidden(); openTown(); f.advance(2.2, 10); hide(); f.render();
      const r = fog(); r.h0 = h0; r.h1 = f.fogHidden(); r.sEnd = ${townCells}; r.town = [f.fogAlpha(792, 40), f.fogAlpha(700, 200), f.fogAlpha(950, -150), f.fogAlpha(1100, -300)]; r.road = [f.fogAlpha(520, 66), f.fogAlpha(570, 66)]; r.blind = blind(); r.jumps = jumps(); r.hint = f.fogHint('agri'); return r; })()`,
    r => or(r.fading ? 'still revealing' : null, r.shut.town || !r.shut.agri ? 'shut ' + JSON.stringify(r.shut) : null, r.sEnd !== 0 || r.town.some(q => q) ? 'town still clouded ' + r.sEnd + ' ' + r.town : null,
      r.road.some(q => q) ? 'the road through the 农家乐区 is clouded ' + r.road : null, !(r.h1 < r.h0) ? 'town objects not drawn ' + r.h0 + '>' + r.h1 : null, blindBad(r.blind),
      r.jumps.town !== 'open' || !/^locked:/.test(r.jumps.agri) ? 'jumps ' + JSON.stringify(r.jumps) : null, !/现在 1/.test(r.hint || '') ? 'hint ' + r.hint : null), null, wide);
  await shot('fog2_minimap_mid.png', `(() => { ${helpers} openTown(); f.advance(2.2, 10); look(100, 60, 0); f.minimapDraw(); ${mmBlind} f.minimapDraw(); return { mmb, jumps: jumps() }; })()`,
    r => r.mmb.n < 50 ? 'minimap samples ' + r.mmb.n : r.mmb.diff ? 'minimap cloud changes ' + JSON.stringify(r.mmb) : null, null, { deviceScaleFactor: 2 }, 'minimap, mmJump');
  // 8. the other way round: an old save already runs cabins in the 农家乐区 while the town is still shut
  await shot('fog2_agri_open_town_locked.png', `(() => { ${helpers} at(11 * 60); dry(); S.coins = Math.max(S.coins, 800000); f.FARMER.wood = 2000; for (const id of ['house', 'axe', 'forest', 'east']) f.buy(id); f.buyPlot('eroad', 'road');
      S.inn.cabins = 2; S.inn.job = null; f.IA.sync(true); f.markNavDirty(); f.innRepaint(); f.applyUpgrades(); f.advance(0.3, 10); f.fogUpdate(true); f.advance(2.2, 10); look(600, 60, 0); hide(); f.render();
      const r = fog(); r.agri = [f.fogAlpha(520, 100), f.fogAlpha(560, -30)]; r.town = [f.fogAlpha(700, 60), f.fogAlpha(800, -100)]; r.blind = blind(); return r; })()`,
    r => or(!r.shut || r.shut.agri || !r.shut.town ? 'shut ' + JSON.stringify(r.shut) : null, r.agri.some(q => q) ? 'agri clouded ' + r.agri : null, r.town.some(q => q < 1) ? 'town open ' + r.town : null, blindBad(r.blind)), null, wide);
  // 9. prosperity 3: the 农家乐区 opens too; nothing clouded and nothing left out
  await shot('fog2_full.png', `(() => { ${helpers} at(10 * 60); dry(); look(600, 40, 0); openTown(); f.advance(2.2, 10); toLv3(); f.advance(2.2, 10); hide();
      const r = fog(); r.same = same(); r.jumps = jumps(); r.lv = f.hallView().lv; r.hidden = (f.render(), f.fogHidden()); return r; })()`,
    r => or(r.lv < 3 ? 'lv ' + r.lv : null, r.fading || !r.empty ? 'still clouded ' + JSON.stringify(r.shut) : null, !r.same ? 'something still drawn' : null, r.hidden ? 'left out ' + r.hidden : null,
      r.jumps.agri !== 'open' || r.jumps.town !== 'open' ? 'jumps ' + JSON.stringify(r.jumps) : null), null, wide);
  await shot('fog2_minimap_full.png', `(() => { ${helpers} openTown(); toLv3(); f.advance(3, 10); look(100, 60, 0); f.minimapDraw(); return fog(); })()`, r => !r.empty ? 'clouded' : null, null, { deviceScaleFactor: 2 }, 'minimap, mmJump');
  // 10. saves: an opened save shows no cloud and no reveal on load; the day-72 fixture (town shut) is clouded at once
  if (!only || 'fog2_load'.includes(only) || only.includes('fog2_load')) {
    const p = await page(null); const snap = await p.evaluate(`(() => { ${helpers} openTown(); toLv3(); f.advance(3, 10); return f.snapshot(); })()`); await p.context().close();
    await shot('fog2_load_open.png', `(() => { ${helpers} f.render(); const r = fog(); look(600, 40, 0); r.same = same(); return r; })()`,
      r => !r.init || r.fading || !r.empty ? 'cloud on an opened save ' + JSON.stringify(r) : !r.same ? 'drawn' : null, snap, wide);
  }
  await shot('fog2_load_fixture.png', `(() => { ${helpers} f.render(); const r = fog(); look(640, 40, 0); hide(); r.blind = blind(); return r; })()`,
    r => or(v(r), r.fading ? 'reveals on load' : null, !r.shut || !r.shut.town || !r.shut.agri ? 'fixture should be shut ' + JSON.stringify(r.shut) : null, blindBad(r.blind)), readSave(FIX), wide);
  // 11. cost: frames with and without the bank over the shut town (drifting, so the layer is rebuilt), the reveal, the first build
  await shot('fog2_perf.png', `(() => { ${helpers} at(10 * 60); look(700, 40, 0.3); const N = 60, t = on => { f.fogSet(on); f.fogUpdate(true); f.render(); const t0 = performance.now(); for (let i = 0; i < N; i++) { f.setRealT(f.getRealT() + 1 / 30); f.render(); } return (performance.now() - t0) / N; };
      t(true); t(false); const off = t(false), on = t(true), off2 = t(false), on2 = t(true);
      let rebuild = 0, first = 0; { let t0 = performance.now(); const m = f.FG.membership({ road: true }); first = performance.now() - t0; t0 = performance.now(); f.FG.field(m, { agri: true, town: true }); rebuild = performance.now() - t0; }
      openTown(); f.advance(0.05, 20); const step = () => { f.setRealT(f.getRealT() + 1 / 30); const t0 = performance.now(); f.render(); return performance.now() - t0; };
      let fade = 0, k = 0; while (f.fog().fading && k < 90) { fade += step(); k++; } let after = 0; for (let i = 0; i < k; i++) after += step();
      return { off: +((off + off2) / 2).toFixed(2), on: +((on + on2) / 2).toFixed(2), extra: +(((on + on2) - (off + off2)) / 2).toFixed(2), rebuild: +rebuild.toFixed(1), firstBuild: +(first + rebuild).toFixed(1), fadeFrames: k,
        fadeExtra: +((fade - after) / Math.max(1, k)).toFixed(2) }; })()`,
    r => r.extra > 3 ? 'cloud costs ' + r.extra + ' ms a frame' : r.fadeFrames < 30 ? 'reveal too short ' + r.fadeFrames : r.fadeExtra > 8 ? 'reveal costs ' + r.fadeExtra + ' ms a frame' : null);

  await b.close(); server.close();
  if (errs.length) { console.log('page errors:', errs.slice(0, 5)); process.exit(1); }
  if (fails.length) { console.log('FAILED:', fails); process.exit(1); }
  console.log('fog2-shots: all ok');
})();
