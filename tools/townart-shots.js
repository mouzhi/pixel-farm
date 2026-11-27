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
  // one page per screen size: the town is built once, then each scene is framed and shot in turn
  const run = async (tag, w, h, scenes) => { if (only && !scenes.some(sc => sc[0].includes(only))) return;
    const p = await page(null, w, h); let r0; try { r0 = await p.evaluate(`(() => { ${setup} ${town} return { ok: 1 }; })()`); } catch (e) { r0 = { error: String(e).slice(0, 300) }; }
    if (r0 && r0.error) { fails.push(tag + ': ' + r0.error); console.log('FAIL', tag, r0.error); await p.context().close(); return; }
    for (const [name, fn, check] of scenes) { if (only && !name.includes(only)) continue; let r;
      try { r = await p.evaluate(`(() => { ${helpers} ${fn} })()`); } catch (e) { r = { error: String(e).slice(0, 300) }; }
      await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, PREFIX + name) });
      const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); }
    await p.context().close(); };
  const facts = `({ v: f.version, life: f.townLife ? f.townLife().length : null, want: f.lifeWant ? f.lifeWant() : null, dress: f.props.filter(q => /^dress:/.test(q.town || '')).length, play: f.props.filter(q => /^play:/.test(q.town || '')).length, t: Math.round(S.t % 1440), day: S.day, lv: f.townLv() })`;
  const NEW = VERSION !== '5.11.0.39'; // the same script takes the 'before' pictures on the old main
  const dayCheck = r => !NEW ? null : r.v !== '5.13.1' ? 'ver ' + r.v : r.dress < 24 ? 'dressing ' + r.dress : r.play < 6 ? 'playground ' + r.play : r.want < 4 ? 'walkers wanted ' + r.want : r.life < r.want - 1 ? 'walkers ' + r.life + '/' + r.want : null;
  const scenes = phone => [
    [`street${phone}.png`, `at(11 * 60); dry(); f.advance(4, 10); look(${phone ? 760 : 740}, 66, 0); hide(); return ${facts};`, dayCheck],
    [`east${phone}.png`, `at(15 * 60); dry(); f.advance(3, 10); look(880, 40, 0); hide(); return ${facts};`, dayCheck],
    [`playground${phone}.png`, `at(16 * 60); dry(); f.advance(3, 10); look(662, -44, 0); hide(); return ${facts};`, dayCheck],
    [`works${phone}.png`, `at(10 * 60); dry(); f.advance(3, 10); look(668, 168, 0); hide(); return ${facts};`, dayCheck],
    [`square${phone}.png`, `at(10 * 60 + 30); dry(); f.advance(3, 10); look(763, 128, 0); hide(); return ${facts};`, dayCheck],
    // night on the main street: lamps, windows and the signs' lanterns, with frame times (camera still / panning)
    [`night${phone}.png`, `at(19 * 60 + 40); dry(); f.advance(2, 10); look(760, 66, 0);
      const still = time(40), pan = time(40, i => f.panTo(760 + (i % 2 ? 1.3 : -1.3), 66)); f.panTo(760, 66); f.render(); hide();
      return Object.assign(${facts}, { stillMs: still, panMs: pan });`, r => (!phone && r.stillMs > 15) ? 'night frame ' + r.stillMs + ' ms' : null],
  ];
  await run('desktop', 1280, 800, scenes(''));
  await run('phone', 390, 844, scenes('_phone'));
  // an old save (the day-72 fixture: town not bought yet) loads clean on the new version; the street wakes up once the town is bought
  if (!only || 'fixture'.includes(only)) { const file = path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json');
    if (fs.existsSync(file)) { const save = readSave(file), p = await page(save); let r;
      try { r = await p.evaluate(`(() => { ${helpers} const s = f.snapshot(); f.advance(2, 10); return { day: s.clock.day, sv: s.saveVersion, v: f.version, town: !!(S.eff && S.eff.town), life: f.townLife().length }; })()`); } catch (e) { r = { error: String(e).slice(0, 300) }; }
      const bad = r.error || (r.day !== save.clock.day ? 'day' : r.sv !== 15 ? 'saveVersion ' + r.sv : NEW && r.v !== '5.13.1' ? 'ver ' + r.v : (!r.town && r.life) ? 'walkers in a shut town' : null);
      console.log(bad ? 'FAIL' : 'ok  ', 'fixture day72', JSON.stringify(r)); if (bad) fails.push('fixture: ' + bad); await p.context().close(); } }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
