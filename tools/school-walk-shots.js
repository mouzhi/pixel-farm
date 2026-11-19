// v5.8.1 browser check: a child on the walk to / from school has nothing in hand; on the farm the hip basket still shows.
//   node tools/school-walk-shots.js   writes /workspace/pf-shots/v581_*.png (PF_SHOTS to change); exits 1 on an error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page() { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); return p; }
  const check = (name, bad, r) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); };
  // a school-age child with crops in the basket (kids pick and sell), walking on the east lane
  const scene = kind => `(() => { const f = __farm, S = f.S; f.SAVE.off = true; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house', 'house', 'axe', 'forest', 'east', 'orchard', 'south', 'pasture']) f.buy(id); S.family.met = 1; S.family.moved = 1; S.family.love = 100;
    f.buyPlot('eroad', 'road'); S.day = 30; S.t = 30 * 1440 + 8 * 60 + 12; Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 12 }] }); f.syncFamily();
    const k = S.members.find(m => m.id === 'kid0'); k.home = false; k.away = null; k.sleeping = false; k.crops = ['carrot', 'carrot', 'pumpkin'];
    k.x = 400; k.y = 66; k.fx = 1; k.fy = 0; k.moving = true;
    k.task = ${kind === 'school' ? `{ kind: 'school-go', label: '去上学', to: { x: 438, y: 66 }, dur: 3, work: 0, keepVia: true, via: [{ x: 438, y: 66 }], leave: true }`
      : `{ kind: 'play-yard', label: '在院子里玩', to: { x: 438, y: 66 }, dur: 3, work: 0, play: true }`};
    f.setAngle(0.1); f.panTo(400, 66); f.advance(0.05, 20); k.x = 400; k.y = 66; k.moving = true; f.advance(0.02, 10);
    const c = f.toClient(k.x, k.y), held = f.carryFields(k);
    return { c, basket: held.basket, carry: held.carry, walk: f.schoolWalk(k), task: k.task && k.task.kind, x: Math.round(k.x) }; })()`;
  for (const [name, kind] of [['v581_school_walk.png', 'school'], ['v581_farm_basket.png', 'play']]) {
    const p = await page(); const r = await p.evaluate(scene(kind)); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, name), clip: { x: r.c.x - 70, y: r.c.y - 85, width: 140, height: 105 } });
    await p.screenshot({ path: path.join(OUT, name.replace('.png', '_wide.png')) });
    check(name, kind === 'school' ? (!r.walk ? 'not a school walk: ' + r.task : r.basket || r.carry ? 'still holding ' + (r.basket || r.carry) : null)
      : (r.walk ? 'play counted as school walk' : r.basket !== 'pumpkin' ? 'farm basket missing: ' + r.basket : null), r);
    await p.context().close();
  }
  // the day-59 manor save still loads (no save change in 5.8.1)
  { const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8')), save = raw.save || raw, p = await page();
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save);
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    const r = await p.evaluate(() => { const f = __farm, s = f.snapshot(); f.advance(60, 10); return { v: f.version, sv: s.saveVersion, day: s.clock.day, animals: s.animals.length }; });
    check('fixture day 59', r.v !== VERSION ? 'version' : r.sv !== 14 ? 'saveVersion' : r.day !== save.clock.day ? 'day' : r.animals !== save.animals.length ? 'animals' : null, r); await p.context().close(); }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
