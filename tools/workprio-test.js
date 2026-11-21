// v5.11.0.27 work priorities (from a day-132 farm where chores piled up): the player's chop marks first and 阿禾 helps with
// them, the sunset deck only an hour a day while work waits, demand crops (the diner's cabbage / carrot) sown first, the
// married child and their spouse come over 6–8 for the harvest and collecting, and with beach guests the farmer fishes for
// the seafood stall before 11:30 (and the catch waits in the basket for it).
//   node tools/workprio-test.js  ->  workprio_*.png in PF_SHOTS (default /workspace/pf-shots); exits 1 on any failure
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const fixture = n => { const s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8')); return s.save || s; };
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(s => { if (!sessionStorage.getItem('wp')) { sessionStorage.setItem('wp', 1); localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', s); } }, JSON.stringify(Object.assign({}, save, { savedAt: Date.now() })));
    await p.goto(base + '/index.html?manual&seed=3');
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const helpers = `const f = __farm, S = f.S, F0 = f.FARMER;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const as = (a, fn) => { f.setF(a); try { return fn(); } finally { f.setF(F0); } };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const partner = () => S.members.find(m => m.id === 'partner');
    const quiet = () => { for (const t of f.tiles) if (t.crop && t.open) { t.crop = null; t.watered = false; } for (const a of S.animals) a.ready = 0; for (const h of S.works.hives || []) if (h) h.ready = 0; S.orders = S.orders.filter(o => o.type !== 'chop'); };
    const ripen = n => { let k = 0; for (const t of f.tiles) { if (k >= n) break; if (!t.open || t.debris || t.weed) continue; t.tilled = true; t.crop = { type: 'carrot', age: 9, n: 0, stage: 3, rot: 0 }; k++; } return k; };
    const free = () => { for (const a of f.actors().concat(f.SPOUSES)) { a.task = null; a.path = []; } };
    const look = (x, y) => { f.setAngle(0); f.panTo(x, y); f.advance(0.3, 10); };`;
  const shot = async (name, save, fn, check) => {
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const inn = fixture('save-v15-inn-resort.json'), married = fixture('save-v15-day72-cottage.json');

  // 1. marked trees: base 95 + the walk (an errand, above harvest 90), 阿禾 helps without the -HELP penalty, all four fall the same morning
  await shot('workprio_chop.png', inn, `(() => { ${helpers} at(8 * 60); dry(); quiet(); ripen(6); free();
    const forest = S.trees.filter(t => t.kind === 'wild' && t.stage === 'tree' && /^w[0-9]/.test(t.id)).slice(0, 4);
    for (const t of forest) S.orders.push({ type: 'chop', id: t.id });
    const job = f.board().find(j => j.kind === 'chop');
    const ft = f.chooseTask(); F0.task = ft; ft.work = 0;
    const pt = as(partner(), () => f.chooseTask()); partner().task = pt; pt.work = 0;
    let pChop = pt.kind === 'chop'; for (let i = 0; i < 400 && S.orders.some(o => o.type === 'chop'); i++) { f.advance(1, 10); if (partner().task && partner().task.kind === 'chop') pChop = true; }
    look(forest[0].x, forest[0].y);
    return { ver: f.version, base: job && Math.round(job.base), order: job && job.order, farmer: ft.kind, partner: pt.kind, pChop, same: ft.tile === pt.tile, left: S.orders.filter(o => o.type === 'chop').length, T: Math.round(S.t % 1440) }; })()`,
    r => r.ver !== VERSION ? 'ver ' + r.ver : !(r.base >= 95) || !r.order ? 'chop job ' + r.base : r.farmer !== 'chop' ? 'farmer ' + r.farmer : !r.pChop ? 'partner never chopped (' + r.partner + ')' : r.same ? 'same tree' : r.left ? 'left ' + r.left : null);

  // 2. the sunset deck: with work waiting an hour a day, with nothing waiting as long as it lasts
  await shot('workprio_sunset.png', inn, `(() => { ${helpers} S.inn.resort.deck = 1; f.innRepaint && f.innRepaint(); at(17 * 60 + 5); dry(); quiet(); ripen(6); free();
    const first = f.chooseTask(); F0._rest = { day: S.day, sunset: 60 };
    const capped = f.chooseTask(); quiet(); free(); const idle = f.chooseTask();
    const pending = f.workPending(); F0._rest = null; free(); for (let i = 0; i < 10; i++) f.advance(1, 10);
    const L = f.innResortLayout(), seat = L && L.deck && L.deck.sit[0]; if (seat) look(seat.x, seat.y);
    const onDeck = f.actors().filter(a => a.task && a.task.kind === 'sunset').length;
    return { first: first && first.kind, capped: capped && capped.kind, idle: idle && idle.kind, pending, onDeck, T: Math.round(S.t % 1440) }; })()`,
    r => r.first !== 'sunset' ? 'first ' + r.first : r.capped === 'sunset' ? 'still on the deck with work waiting' : r.idle !== 'sunset' ? 'no work, no deck: ' + r.idle : null);

  // 3. demand crops: the diner is open, so a tile goes to cabbage before the bag's watermelons; the seed is bought too
  await shot('workprio_demand.png', inn, `(() => { ${helpers} at(9 * 60); dry(); quiet(); free();
    const want = f.demandWant(); F0.bag.watermelon = 20; F0.bag.cabbage = 3; F0.bag.carrot = 0;
    const t = f.tiles.find(t => t.open && !t.debris && !t.weed); t.tilled = true; t.crop = null;
    const job = f.board().find(j => j.kind === 'plant'), k = job && job.make(); const pick = f.demandPick(F0.bag);
    F0.bag.cabbage = 0; S.store.cabbage = 0; const short = f.demandShort('cabbage');
    return { want, pick, label: k && k.label, short }; })()`,
    r => !r.want || r.want.cabbage !== 4 || r.want.carrot !== 4 ? 'want ' + JSON.stringify(r.want) : r.pick !== 'cabbage' ? 'pick ' + r.pick : !/卷心菜/.test(r.label || '') ? 'label ' + r.label : r.short !== 4 ? 'short ' + r.short : null);

  // 4. beach guests + the seafood stall: the farmer fishes before 11:30 and the catch is kept for the stall
  await shot('workprio_seafish.png', inn, `(() => { ${helpers} S.inn.resort.stall = 1; S.up.searod = 1; f.applyUpgrades(); at(8 * 60); dry(); quiet(); free();
    const q = f.seaQuota(), job = f.board().filter(j => j.kind === 'fish').sort((a, b) => b.base - a.base)[0];
    const late = (at(11 * 60 + 40), f.seaQuota()); at(8 * 60);
    const k = f.chooseTask(); F0.task = k; k.work = 0; for (let i = 0; i < 200 && F0.task === k; i++) f.advance(1, 10);
    const sp = f.fishSpot('sea'); look(sp.stand.x, sp.stand.y);
    return { q, base: job && job.base, late, kind: k.kind, label: k.label }; })()`,
    r => !(r.q > 0) ? 'quota ' + r.q : !(r.base >= 80) ? 'fish job ' + r.base : r.late !== 0 ? 'quota after 11:30 ' + r.late : r.kind !== 'fish' ? 'task ' + r.kind : null);

  // 5. the married child and the spouse come over at 6:30 for the harvest and the eggs (not the new house's bench)
  await shot('workprio_married_help.png', married, `(() => { ${helpers} at(6 * 60 + 30); dry(); free(); const n = ripen(10);
    const kid = S.members.find(m => m.id === 'kid0'), sp = f.SPOUSES[0];
    const kt = as(kid, () => f.chooseTask()); kid.task = kt; kt.work = 0;
    const st = sp ? as(sp, () => f.chooseTask()) : null; if (sp && st) { sp.task = st; st.work = 0; sp.home = false; }
    const mid = (at(12 * 60), f.helpWinNow(S.t % 1440)); at(6 * 60 + 30);
    let onMain = 0; for (let i = 0; i < 12; i++) { f.advance(0.5, 10); if (kid.task && ['harvest', 'collect', 'pick', 'water'].includes(kid.task.kind)) onMain++; } look(kid.x, kid.y);
    return { n, onMain, T: Math.round(S.t % 1440), hands: f.farmHands(), kid: kt && kt.kind, sp: st && st.kind, win: kid._helpWin > 0, mid, has: !!sp }; })()`,
    r => !r.has ? 'no spouse' : !['harvest', 'collect', 'pick', 'water'].includes(r.kid) ? 'kid ' + r.kid : !['harvest', 'collect', 'pick', 'water'].includes(r.sp) ? 'spouse ' + r.sp : r.mid !== 0 ? 'window at noon' : null);

  if (errs.length) fails.push('page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); server.close();
  if (fails.length) { console.error('FAILED\n' + fails.join('\n')); process.exit(1); }
  console.log('workprio-test: all ok');
})().catch(e => { console.error(e); process.exit(1); });
