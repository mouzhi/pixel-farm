// Plays the real game headless from a saved farm and reports the wood economy day by day.
//   node tools/wood-sim.js <save.json> [days=20] [mode=idle|mark] [buy=house,...]
// save.json: an exported save ({ meta, save }) or a bare save object. The save is put in localStorage with savedAt = now
// (no offline settlement). mode 'mark': the player marks every choppable grown tree in 林场 each morning (the most a
// pre-v5.3.1 player could do); 'idle': the player never marks a tree. buy: shop ids bought in order as soon as affordable.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const [SAVE_PATH, DAYS_S, MODE = 'idle', BUY = 'house'] = process.argv.slice(2);
const DAYS = +DAYS_S || 20, ORDER = BUY ? BUY.split(',').filter(Boolean) : [];
const raw = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')), save = raw.save || raw; save.savedAt = Date.now();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(save));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const out = await p.evaluate(({ DAYS, ORDER, MODE }) => {
    const S = __farm.S, F = __farm.FARMER; __farm.SAVE.off = true;
    const start = S.day, rows = [], buys = []; let i = 0, markDay = 0, cut0 = S.woodCut || 0, coins0 = S.coins, wood0 = F.wood;
    const forestTrees = () => S.trees.filter(t => t.kind === 'wild' && PFWorld.regrows(t));
    const tryBuy = () => { while (i < ORDER.length) { const id = ORDER[i], r = __farm.buy(id);
      if (r.ok) { buys.push({ id, label: r.offer.level.label, gold: r.offer.cost, wood: r.offer.wood || 0, day: S.day, t: Math.floor(S.t % 1440) }); i++; }
      else if (r.reason === 'maxed') i++; else break; } };
    __farm.setGameSpeed(S.eff.speedMax); tryBuy();
    let last = S.day, minutes = { chop: 0, fish: 0, idle: 0 }, sample = 0;
    while (S.day < start + DAYS) {
      __farm.advance(5, 10);
      if (MODE === 'mark' && markDay !== S.day) { markDay = S.day; for (const t of forestTrees()) if (t.stage === 'tree' && !S.orders.some(o => o.id === t.id)) __farm.orderChop(t.id); }
      const k = F.task && F.task.kind; if (k === 'chop' || k === 'fish' || k === 'idle') minutes[k]++; sample++;
      tryBuy();
      if (S.day !== last) { last = S.day; const cut = (S.woodCut || 0);
        rows.push({ day: S.day - 1, wood: F.wood, cut: cut - cut0, coins: S.coins, grown: forestTrees().filter(t => t.stage === 'tree').length, stumps: forestTrees().filter(t => t.stage !== 'tree').length });
        cut0 = cut; }
    }
    const manor = buys.find(b => b.id === 'house' && b.label === '庄园');
    return { start, rows, buys, manor, minutes, sample, woodNow: F.wood, coins0, wood0, up: S.up, sap: F.saplings, version: __farm.version };
  }, { DAYS, ORDER, MODE });
  console.log(`v${out.version}  mode=${MODE}  from day ${out.start}: wood ${out.wood0}, coins ${out.coins0}; buy ${ORDER.join(',')}`);
  console.log(' day  wood  cut/day  coins  grownForest  stumps/saplings');
  for (const r of out.rows) console.log([r.day, r.wood, r.cut, r.coins, r.grown, r.stumps].map(v => String(v).padStart(6)).join(' '));
  const cuts = out.rows.map(r => r.cut), avg = cuts.reduce((a, b) => a + b, 0) / Math.max(1, cuts.length);
  console.log(`\nwood cut per day: avg ${avg.toFixed(1)}  (max ${Math.max(...cuts)})`);
  console.log('farmer time share (5 s samples): ' + Object.entries(out.minutes).map(([k, v]) => `${k} ${(v / out.sample * 100).toFixed(1)}%`).join(', '));
  console.log('purchases:'); for (const b of out.buys) console.log(`  day ${b.day} ${String(Math.floor(b.t / 60)).padStart(2, '0')}:${String(b.t % 60).padStart(2, '0')}  ${b.id} ${b.label}  ${b.gold}g${b.wood ? ' + ' + b.wood + ' wood' : ''}`);
  console.log(out.manor ? `manor bought on day ${out.manor.day} (${out.manor.day - out.start} game days after the save)` : `manor NOT bought within ${DAYS} days`);
  console.log('saplings left', JSON.stringify(out.sap));
  if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  await browser.close(); server.close();
})();
