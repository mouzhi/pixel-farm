// Screenshots + browser checks for v5.11.0.4 (细雨): node tools/rain-shots.js [name-filter]
//   writes /workspace/pf-shots/rain_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check.
//   PF_RAIN_PERF_ONLY=1: only the frame-cost numbers (works on older builds too, for a before / after).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PERF_ONLY = !!process.env.PF_RAIN_PERF_ONLY, VER = (require('fs').readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1]; // v5.11.0.5.1: follow game.js
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(vp) { const { query, ...opt } = vp || {}; const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opt)); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual' + (query || '')); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom', 'inv', 'bottomRight', 'tools', 'say']) { const el = document.getElementById(id); if (el) { el.style.visibility = 'hidden'; if (id === 'say') { el.hidden = true; el.textContent = ''; } } } };
    const start = id => { f.FARMER.wood = 800; const r = f.hallStart(id); if (!r.ok) throw new Error(id + ' ' + (r.why || JSON.stringify(r))); return r; };
    const wake = () => { const all = (typeof f.actors === 'function' ? f.actors() : []).concat(f.FARMER || []);
      all.forEach(a => { if (a) { a.sleeping = false; a.home = false; } }); };
    const nearTable = a => { const t = f.FV.TABLE; return a && typeof a.x === 'number' && Math.hypot(a.x - t.x, a.y - t.y) < 18; };
    const familyHere = () => {
      const kids = (S.family && S.family.kids) || [];
      const partner = (typeof f.actors === 'function' ? f.actors() : []).find(a => a && a.id === 'partner');
      const kid = kids[0] && (typeof f.actors === 'function' ? f.actors() : []).find(a => a && a.id === kids[0].id);
      return { farmer: nearTable(f.FARMER), partner: partner ? nearTable(partner) : null, kid: kid ? nearTable(kid) : null, n: (typeof f.actors === 'function' ? f.actors() : []).filter(nearTable).length };
    };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 800000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 12 }] }); f.syncFamily(); dry();`;
  const toLv4 = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library']) { start(id); nextMorning(); at(9 * 60); } f.FARMER.wood = 800;`;
  const allHouses = `for (const id of ['clinic', 'h1', 'h2', 'h3', 'h4', 'h5']) { start(id); nextMorning(); at(9 * 60); }`;
  // rain on from `start` for 3 h, the clock just inside it; a couple of seconds so drops are in the air, splashes and wet spots on the ground
  const rain = `const rainOn = (start, T) => { f.forceRain(start, 180); at(T); f.advance(2, 30); };
    const stats = () => { const WX = f.WX || window.PFWeather, st = WX.rainStats ? WX.rainStats() : null, H = WX.rainHits ? WX.rainHits() : { a: [], n: 0 };
      const P = WX._visual; let inside = 0, drops = 0; if (WX.eachDrop) WX.eachDrop(d => { drops++; if (f.rainUnder(d.x, d.y)) inside++; });
      let pondHits = 0, seaHits = 0, river = 0; for (let i = 0; i < H.n; i++) { const h = H.a[i]; if (h.river) river++; else if (Math.hypot((h.x - f.POND.x) / f.POND.rx, (h.y - f.POND.y) / f.POND.ry) < 1.3) pondHits++; else seaHits++; }
      return { ver: f.version, sv: f.snapshot().saveVersion, raining: WX.isRaining(S.weather, S.day, S.t), st, inside, drops, pondHits, seaHits, river, streaks: P.streaks.length, T: S.t % 1440 }; };`;
  const shot = async (name, fn, check, vp, crop) => { if (only && !name.includes(only)) return;
    const p = await page(vp); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.screenshot({ path: path.join(OUT, name) });
    if (crop && !(r && r.error)) { const url = await p.evaluate(async ({ wx, wy, w, h, k }) => { const f = __farm; f.render(); const [sx, sy] = f.proj(wx, wy), cv = document.getElementById('game');
        const img = new Image(); await new Promise(res => { img.onload = res; img.src = cv.toDataURL(); }); const c = document.createElement('canvas'); c.width = w * k; c.height = h * k;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, Math.max(0, Math.round(sx) - w / 2), Math.max(0, Math.round(sy) - h / 2), w, h, 0, 0, w * k, h * k); return c.toDataURL(); }, crop);
      fs.writeFileSync(path.join(OUT, crop.name), Buffer.from(url.split(',')[1], 'base64')); }
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const common = r => r.ver !== VER ? 'ver ' + r.ver : r.sv !== 15 ? 'saveVersion ' + r.sv : !r.raining ? 'not raining' : !r.st ? 'no rain pools' : r.streaks ? 'old screen streaks ' + r.streaks
    : r.st.drops < 3 ? 'too few drops ' + r.st.drops : r.st.drops > r.st.caps.drops || r.st.wet > r.st.caps.wet || r.st.splashes > r.st.caps.splash || r.st.hits > r.st.caps.hits ? 'over a cap' : r.inside ? 'drops aimed inside a building ' + r.inside : null;

  if (!PERF_ONLY) {
    // 1. the farm in a drizzle: a few short streaks, splashes and wet spots on the ground and the soil
    await shot('rain_farm.png', `(() => { ${setup} ${rain} f.FARMER.home = false; f.FARMER.sleeping = false;
      for (const t of f.tiles) if (t.open && !t.crop) { t.tilled = true; t.crop = { type: 'carrot', age: 1, n: 0, stage: 1, rot: 0.2 }; }
      look(80, 66, 0.22); rainOn(11 * 60, 11 * 60 + 20); return stats(); })()`,
      r => common(r) || (r.st.wet + r.st.splashes < 5 ? 'no splashes / wet spots ' + JSON.stringify(r.st) : null), null, { name: 'rain_farm_close.png', wx: 80, wy: 66, w: 200, h: 120, k: 4 });
    // 2. the pond: drops that land in it ripple with the pond's own ripple
    await shot('rain_pond.png', `(() => { ${setup} ${rain} look(f.POND.x, f.POND.y, 0.22); rainOn(11 * 60, 11 * 60 + 20);
      let seen = 0; for (let i = 0; i < 40; i++) { f.advance(0.1, 30); const s = stats(); seen = Math.max(seen, s.pondHits); if (s.pondHits >= 3 && i > 10) break; } const r = stats(); r.maxPond = seen; return r; })()`,
      r => common(r) || (r.maxPond < 2 ? 'no ripples in the pond' : null), null, { name: 'rain_pond_close.png', wx: 34, wy: 100, w: 160, h: 96, k: 5 });
    // 3. the v5.11 town: nothing falls through a roof; streaks in front of a wall are drawn after it, behind it under it
    await shot('rain_town.png', `(() => { ${setup} ${toLv4} ${allHouses} ${rain} look(792, 60, 0); rainOn(13 * 60, 13 * 60 + 20); hide(); return stats(); })()`,
      r => common(r), null, { name: 'rain_town_close.png', wx: 792, wy: 60, w: 200, h: 120, k: 4 });
    // 4. night rain in town: the lamps still light it, drops are dimmed with everything else
    await shot('rain_night.png', `(() => { ${setup} ${toLv4} ${allHouses} ${rain} look(792, 60, 0); rainOn(20 * 60 + 30, 21 * 60 + 15); wake(); hide(); return stats(); })()`,
      r => common(r), null, { name: 'rain_night_close.png', wx: 792, wy: 60, w: 200, h: 120, k: 4 });
    // 5. the camera turned: drops stay on their world spots (ground anchored); the sea at the beach
    await shot('rain_turned_beach.png', `(() => { ${setup} ${rain} look(250, 250, 1.1); rainOn(11 * 60, 11 * 60 + 20); for (let i = 0; i < 20; i++) f.advance(0.1, 30); return stats(); })()`,
      r => common(r) || (r.seaHits + r.pondHits < 1 ? 'no sea ripples' : null));
    // 6. mobile portrait (小红书 size)
    await shot('rain_mobile.png', `(() => { ${setup} ${rain} look(80, 66, 0.22); rainOn(11 * 60, 11 * 60 + 20); return stats(); })()`,
      r => common(r), { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    // 7. after the shower: the pools drain, nothing left in the air
    await shot('rain_after.png', `(() => { ${setup} ${rain} look(80, 66, 0.22); rainOn(11 * 60, 11 * 60 + 20); at(14 * 60 + 30); f.advance(3, 30); return stats(); })()`,
      r => r.raining ? 'still raining' : r.st.drops || r.st.splashes || r.st.hits ? 'pools not drained ' + JSON.stringify(r.st) : null);
  }
  // perf: the big v5.11 town, ms per advance(1/30) + render, rain off vs on (median of 7 batches of 60 frames). The old rain
  // (v5.11.0.2) measured 0.83-0.90 here; the gate is loose (0.7) because shared CI runners are noisy, the numbers are what matter
  if (!only || only === 'perf') {
    const p = await page();
    const r = await p.evaluate(`(() => { ${setup} ${toLv4} ${allHouses} look(792, 60, 0); at(13 * 60); dry(); f.advance(1, 30);
      const W = f.WX || window.PFWeather;
      const batch = () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) f.advance(1 / 30, 30); return (performance.now() - t0) / 60; };
      const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
      const run = () => { batch(); const a = []; for (let i = 0; i < 7; i++) a.push(batch()); return +med(a).toFixed(2); };
      const res = {}; for (const k of [0, 1, 2]) { dry(); W.resetVisual(); at(13 * 60); f.advance(0.5, 30); res['off' + k] = run(); f.forceRain(13 * 60, 180); at(13 * 60 + 20); f.advance(1, 30); res['on' + k] = run(); }
      const off = Math.min(res.off0, res.off1, res.off2), on = Math.min(res.on0, res.on1, res.on2);
      return { ver: f.version, off, on, ratio: +(off / on).toFixed(3), all: res }; })()`);
    console.log('perf', JSON.stringify(r));
    if (!PERF_ONLY && r.ratio < 0.7) fails.push('perf: rain frame cost ' + r.on + ' ms vs ' + r.off + ' ms without');
    await p.context().close();
  }
  await b.close(); server.close();
  if (errs.length) { console.log('page errors:\n' + errs.slice(0, 10).join('\n')); }
  if (fails.length || errs.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
  console.log('all rain shots ok');
})().catch(e => { console.error(e); process.exit(1); });
