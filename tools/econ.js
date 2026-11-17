// Plays the real game headless for N days with a scripted player who buys shop items in a fixed order as soon as he can,
// and prints what the farm earns, when each purchase happens (in real minutes at the bought speed), and how seeds flow.
//   node tools/econ.js [days=20] [seed]   (numbers on the design Page come from this script)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), DAYS = +process.argv[2] || 20, RNG = process.argv[3];
const ORDER = ['can', 'field', 'shoe', 'hoe', 'basket', 'field', 'speed', 'can', 'strawberry', 'shoe', 'basket', 'watermelon', 'speed', 'hoe', 'can', 'shoe'];
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
  const out = await p.evaluate(({ DAYS, ORDER }) => {
    const S = __farm.S, F = __farm.F; __farm.SAVE.off = true;
    let real = 0, i = 0, idleTiles = 0; const buys = [], days = [];
    const seeds = o => Object.values(o).reduce((a, b) => a + b, 0);
    while (S.day <= DAYS) {
      __farm.advance(5, 10); real += 5;
      while (i < ORDER.length) { const id = ORDER[i], r = __farm.buy(id);
        if (r.ok) { buys.push({ id, label: r.offer.level.label, cost: r.offer.cost, day: S.day, min: Math.round(real / 6) / 10 }); i++; if (id === 'speed') __farm.setGameSpeed(S.eff.speedMax); }
        else if (r.reason === 'maxed') i++; else break; }
      if (days.length < S.day - 1) days.push({ day: S.day - 1, earn: S.dayEarn[S.dayEarn.length - 1], coins: S.coins, earned: S.earned, open: __farm.tiles.filter(t => t.open).length,
        seeds: seeds(S.store) + seeds(F.bag) + F.gathered, min: Math.round(real / 6) / 10, idle: idleTiles, flow: Object.assign({}, S.flow) });
      if (S.t % 1440 >= 12 * 60 && S.t % 1440 < 12 * 60 + 5) idleTiles = __farm.tiles.filter(t => t.open && !t.crop).length; // empty tiles at noon
    }
    return { buys, days, up: S.up, flow: S.flow };
  }, { DAYS, ORDER });
  console.log('  day  earn coins earned  open seeds noonEmpty realMin');
  for (const d of out.days) console.log([d.day, d.earn, d.coins, d.earned, d.open, d.seeds, d.idle, d.min].map(v => String(v).padStart(5)).join(' '));
  console.log('\nseed flow (whole run):', JSON.stringify(out.flow));
  console.log('\npurchases:'); for (const b of out.buys) console.log(`  day ${b.day}  ${b.min} min  ${b.id} ${b.label}  ${b.cost}g`);
  if (errs.length) console.log('ERRORS', errs);
  await browser.close(); server.close();
})();
