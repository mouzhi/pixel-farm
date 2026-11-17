// Plays the real game headless for N days with a scripted player who buys shop items in a fixed order as soon as he can,
// and prints what the farm earns, when each purchase happens (in real minutes at the bought speed), and how seeds flow.
//   node tools/econ.js [days=20] [seed]   Phase 3: also chops, transplants and reports wood / fruit gold;
//   Phase 4/v4.6: buys the home coop early and each region's pen + animals after the region and reports animal-product gold, hay spent and average happiness
//   v5.0: the axe comes early (any wild tree at home is choppable), house tiers and the pen fence are bought with wood + gold, and the
//   family timeline (met / moved in / children) is printed   (numbers on the design Page come from this script)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), DAYS = +process.argv[2] || 20, RNG = process.argv[3];
// v4.7: the home coop and a couple of chickens come right after the first tools; a cat and a dog early-ish; each bigger animal right after its region
const ORDER = ['field', 'can', 'field', 'shoe', 'coop', 'chicken', 'hoe', 'chicken', 'basket', 'axe', 'field', 'cat', 'speed', 'house', 'can', 'chicken', 'dog', 'forest', 'sty', 'pig', 'strawberry', 'east', 'shoe', 'basket',
  'chicken', 'pig', 'orchard', 'fold', 'sheep', 'watermelon', 'speed', 'fence', 'house', 'south', 'hoe', 'sheep', 'can', 'shoe', 'rod', 'chicken', 'pig', 'pasture', 'shed', 'cow', 'sheep', 'chicken', 'cow', 'cow', 'rod', 'house', 'coast', 'searod'];
// Phase 3 player: once he has the axe and the forest he marks 2 trees a day, and plants every sapling on the next free spot of a fixed list
const PLANT = []; for (let y = -88; y <= 4; y += 16) for (let x = -140; x <= -50; x += 16) PLANT.push([x, y]); for (const [x, y] of [[20, 70], [30, 96], [176, 24], [184, 100], [12, 120]]) PLANT.push([x, y]);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual${RNG ? '&seed=' + RNG : ''}`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const out = await p.evaluate(({ DAYS, ORDER, PLANT }) => {
    const S = __farm.S, F = __farm.F; __farm.SAVE.off = true;
    let real = 0, i = 0, idleTiles = 0; const buys = [], days = [], fam = {};
    const seeds = o => Object.values(o).reduce((a, b) => a + b, 0);
    let lastOrderDay = 0;
    while (S.day <= DAYS) {
      __farm.advance(5, 10); real += 5;
      if (S.eff.axe && lastOrderDay !== S.day) { lastOrderDay = S.day; // v5.0: 3 trees a day, nearest to the house first (home trees, then bought regions)
        S.trees.filter(t => PFWorld.choppable(t, S.eff.regions) && !S.orders.some(o => o.id === t.id)).sort((a, b) => Math.hypot(a.x - 36, a.y - 24) - Math.hypot(b.x - 36, b.y - 24)).slice(0, 3).forEach(t => __farm.orderChop(t.id)); }
      for (const k of ['apple', 'orange']) while (F.saplings[k] > S.orders.filter(o => o.type === 'plant' && o.kind === k).length) {
        const sp = PLANT.find(([x, y]) => __farm.orderPlant(k, x, y).ok); if (!sp) break; }
      while (i < ORDER.length) { const id = ORDER[i], r = __farm.buy(id);
        if (r.ok) { buys.push({ id, label: r.offer.level.label, cost: r.offer.cost + (r.offer.wood ? '+' + r.offer.wood + 'w' : ''), day: S.day, min: Math.round(real / 6) / 10 }); i++; if (id === 'speed') __farm.setGameSpeed(S.eff.speedMax); }
        else if (r.reason === 'maxed') i++; else break; }
      if (days.length < S.day - 1) days.push({ day: S.day - 1, earn: S.dayEarn[S.dayEarn.length - 1], coins: S.coins, earned: S.earned, open: __farm.tiles.filter(t => t.open).length,
        seeds: seeds(S.store) + seeds(F.bag) + F.gathered, min: Math.round(real / 6) / 10, idle: idleTiles, flow: Object.assign({}, S.flow), wood: S.woodGold || 0, fruit: S.fruitGold || 0, trees: S.trees.filter(t => t.kind !== 'wild' && t.stage === 'tree').length,
        anim: S.animals.length, animG: S.animalGold || 0, hayG: S.hayGold || 0, happy: S.animals.length ? Math.round(S.animals.reduce((a, x) => a + x.h, 0) / S.animals.length) : '-', fishG: S.fishGold || 0, woodNow: F.wood, cut: S.woodCut || 0, love: S.family.love, people: 1 + S.members.length });
      const fm = S.family; if (fm.met && !fam.met) fam.met = fm.met; if (fm.love >= 100 && !fam.love100) fam.love100 = S.day; if (fm.moved && !fam.moved) fam.moved = fm.moved;
      fm.kids.forEach((k, j) => { if (!fam['kid' + j]) fam['kid' + j] = k.born; });
      if (S.t % 1440 >= 12 * 60 && S.t % 1440 < 12 * 60 + 5) idleTiles = __farm.tiles.filter(t => t.open && !t.crop).length; // empty tiles at noon
    }
    return { buys, days, up: S.up, flow: S.flow, fishG: S.fishGold || 0, earned: S.earned, coins: S.coins, fam, drops: S.drops || {}, wildLeft: S.trees.filter(t => t.kind === 'wild' && t.stage === 'tree').length };
  }, { DAYS, ORDER, PLANT });
  console.log('  day  earn coins earned  open seeds noonEmpty realMin woodG fruitG fruitTrees anim animG  hayG happy fishG  wood   cut  love  ppl');
  for (const d of out.days) console.log([d.day, d.earn, d.coins, d.earned, d.open, d.seeds, d.idle, d.min, d.wood, d.fruit, d.trees, d.anim, d.animG, d.hayG, d.happy, d.fishG, d.woodNow, d.cut, d.love, d.people].map(v => String(v).padStart(5)).join(' '));
  console.log('\nfamily (days):', JSON.stringify(out.fam), ' chop drops:', JSON.stringify(out.drops), ' wild trees standing:', out.wildLeft);
  console.log('\nseed flow (whole run):', JSON.stringify(out.flow));
  console.log('totals: earned', out.earned, 'coins', out.coins, 'fishG', out.fishG);
  console.log('\npurchases:'); for (const b of out.buys) console.log(`  day ${b.day}  ${b.min} min  ${b.id} ${b.label}  ${b.cost}g`);
  if (errs.length) console.log('ERRORS', errs);
  await browser.close(); server.close();
})();
