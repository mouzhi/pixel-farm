// Screenshots + browser checks for v5.12.0 (小镇美术升级 + 操场重做):  node tools/townart-shots.js [name-filter]
//   writes $PF_SHOTS/v5120_*.png (default /workspace/pf-shots); exits 1 on a page error, a console error or a failed check.
//   Synthetic saves only (built in the page from a fresh farm); never loads a player's save.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, PREFIX = process.env.PF_PREFIX || 'v5120_';
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vw < 500 ? 2 : 1, isMobile: vw < 500, hasTouch: vw < 500 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await ready();
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const hide = () => { for (const id of ['leftBottom']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; } };
    const time = (n, step) => { for (let i = 0; i < 5; i++) f.render(); const t0 = performance.now(); for (let i = 0; i < n; i++) { if (step) step(i); f.render(); } return +((performance.now() - t0) / n).toFixed(2); };`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 3000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(30); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 16 }] }); f.syncFamily(); dry();`;
  // the whole town: the hall's projects one a day (school expansion included, so the playground is there)
  const town = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library']) { f.FARMER.wood = 900; const r = f.hallStart(id); if (!r.ok) return { error: id + ' ' + (r.why || r.err || JSON.stringify(r)) }; nextMorning(); at(9 * 60); } f.FARMER.wood = 900;`;
  const shot = async (name, fn, check, o = {}) => { if (only && !name.includes(only)) return;
    const p = await page(o.save, o.w || 1280, o.h || 800); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 300) }; }
    await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const facts = `({ v: f.version, life: window.PFTownArt && PFTownArt.life ? PFTownArt.life().length : null, street: window.PFTownArt && PFTownArt.state ? PFTownArt.state().street : null, t: S.t % 1440, day: S.day })`;

  // 1. the main street by day (desktop + phone)
  for (const [tag, w, h] of [['street.png', 1280, 800], ['street_phone.png', 390, 844]])
    await shot(tag, `(() => { ${setup} ${town} at(11 * 60); dry(); f.advance(3, 10); look(${w < 500 ? 760 : 740}, 70, 0); hide(); return ${facts}; })()`, null, { w, h });
  // 2. the east half (houses, shop, clinic lane)
  await shot('east.png', `(() => { ${setup} ${town} at(15 * 60); dry(); f.advance(3, 10); look(880, 40, 0); hide(); return ${facts}; })()`);
  // 3. the playground behind the school (desktop + phone)
  for (const [tag, w, h] of [['playground.png', 1280, 800], ['playground_phone.png', 390, 844]])
    await shot(tag, `(() => { ${setup} ${town} at(16 * 60); dry(); f.advance(3, 10); look(662, -40, 0); hide(); return ${facts}; })()`, null, { w, h });
  // 4. the plaza / market / feast square
  await shot('plaza.png', `(() => { ${setup} ${town} at(10 * 60); dry(); f.advance(3, 10); look(700, 120, 0); hide(); return ${facts}; })()`);
  // 5. night on the main street: lamps and windows, with frame times (still / panning)
  for (const [tag, w, h] of [['night.png', 1280, 800], ['night_phone.png', 390, 844]])
    await shot(tag, `(() => { ${setup} ${town} at(20 * 60 + 30); dry(); f.advance(2, 10); look(740, 70, 0);
      const still = time(40), pan = time(40, i => f.panTo(740 + (i % 2 ? 1.3 : -1.3), 70)); f.panTo(740, 70); f.render(); hide();
      return Object.assign(${facts}, { stillMs: still, panMs: pan }); })()`, r => r.stillMs > 15 ? 'night frame ' + r.stillMs + ' ms' : null, { w, h });

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
