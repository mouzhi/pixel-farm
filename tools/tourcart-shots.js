// Close-ups of the 农场游览车 (v5.12.10 redesign): node tools/tourcart-shots.js  -> $PF_SHOTS/$PF_PREFIX{day,night}_a<angle>.png (default /workspace/pf-tourcart/shots, prefix tc_)
//   writes $PF_SHOTS/tc_*.png (default /workspace/pf-tourcart/shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-tourcart/shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'tc_';
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, FXP = f.FXP;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const dry = () => { if (S.weather) { S.weather.rained = false; S.weather.rain = null; } };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const look = (x, y, a) => { f.setAngle(a == null ? 0 : a); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };
    const quiet = () => { const t = document.getElementById('toast'); if (t) t.hidden = true; for (const el of document.querySelectorAll('.toast,#albumToast,#albToast')) el.style.display = 'none'; };
    const openTown = () => { f.buyPlot('eroad', 'road'); if (!S.town) S.town = {}; if (!S.town.school) S.town.school = {}; S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); const r = f.buy('town'); f.fogUpdate && f.fogUpdate(true); f.refreshUI && f.refreshUI(); f.advance(2.2, 12); return r; };
    const stampLv5 = () => { const H = S.town.hall; const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      ids.forEach((id, i) => { H.built[id] = (S.day | 0) - (ids.length + 2) + i; }); f.applyUpgrades(); f.TA.sync(true); return f.hallView().lv; };
    const agri = () => { for (const id of ['cabin', 'diner']) { f.innStart(id); S.inn.job = null; } S.inn.cabins = 4; S.inn.diner.lv = 1; if (f.innRepaint) f.innRepaint();
      for (let k = 0; k < 4; k++) S.inn.guests.push({ id: 'g' + (S.day - 1) + k, look: ['innA', 'innB', 'innC', 'innD'][k], n: 3, room: k, from: S.day - 1, until: S.day + 1, at: 600, stay: 'inn' });
      f.fogUpdate && f.fogUpdate(true); f.advance(3, 12); };
    const buyAll = () => { const out = {}; for (const id of FXP.IDS) { const r = f.buy(id); out[id] = r.ok ? 1 : (r.why || r.reason); } f.xpfReset(); return out; };
    const props = k => f.props.filter(q => q.xp === k).length;`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 4000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(60); dry(); at(12 * 60); openTown(); stampLv5(); f.buy('eastave'); agri();`;
  const shot = async (name, vw, vh, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page(vw, vh); let r;
    try { r = await p.evaluate(`(() => { ${setup} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(350); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const ver = r => r.ver !== VERSION ? 'ver ' + r.ver : r.sv && r.sv !== 15 ? 'saveVersion ' + r.sv : null;
  // the truck parked at its stand with four riders aboard, camera on it at four angles, day and night. Synthetic farm only.
  const AT = (process.env.PF_AT || '430,44').split(',').map(Number), ANG = [0, 0.8, 1.6, 2.4];
  for (const [tag, T] of [['day', 8 * 60 + 30], ['night', 21 * 60]]) {
    if (only && !tag.includes(only)) continue;
    const p = await page(1280, 800); let r;
    try { r = await p.evaluate(`(() => { ${setup} buyAll(); dry(); at(${T}); f.xpfTick(); f.FXA.syncTruck({ x: ${AT[0]}, y: ${AT[1]}, rot: 0, riders: 4 }); hide(); quiet(); return { ver: f.version, n: f.FXA.truck().length }; })()`); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    const bad = r.error || ver(r) || (r.n !== 1 ? 'truck props ' + r.n : null); console.log(bad ? 'FAIL' : 'ok  ', tag, JSON.stringify(r)); if (bad) fails.push(tag + ': ' + bad);
    for (let i = 0; i < ANG.length && !r.error; i++) {
      const q = await p.evaluate(`(() => { ${helpers} look(${AT[0]}, ${AT[1]}, ${ANG[i]}); dry(); at(${T}); quiet(); f.advance(0.3, 10); const q = f.proj(${AT[0]}, ${AT[1]}); const cv = document.querySelector("canvas").getBoundingClientRect(); return [q[0], q[1], cv.width, cv.height, innerWidth, innerHeight, document.querySelector("canvas").width]; })()`); 
      await p.waitForTimeout(250);
      const name = `${tag}_a${i}.png`, k = q[2] / q[6], cx = Math.round(q[0] * k), cy = Math.round(q[1] * k - 60);
      await p.screenshot({ path: path.join(OUT, PREFIX + 'full_' + name) });
      await p.screenshot({ path: path.join(OUT, PREFIX + name), clip: { x: Math.max(0, cx - 150), y: Math.max(0, cy - 120), width: 300, height: 220 } });
    }
    await p.context().close();
  }
  await b.close(); server.close();
  if (errs.length || fails.length) { console.error('ERRORS', errs.concat(fails).join('\n')); process.exit(1); }
  console.log('ok  tourcart-shots  version', VERSION, '->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
