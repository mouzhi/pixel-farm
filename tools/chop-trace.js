// Why does (or doesn't) the farmer chop by himself? Replays a save headless and, every 2.5 game-sec sample, logs the
// auto-chop conditions (axe + 林场, wood vs target, grown 林场 trees vs KEEP, before 18:00) and what each person is doing.
//   node tools/chop-trace.js <save.json> [days=3] [buy=id,id]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const [SAVE_PATH, DAYS_S, BUY = ''] = process.argv.slice(2); const DAYS = +DAYS_S || 3;
const raw = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')), save = raw.save || raw; save.savedAt = Date.now();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(s => { try { localStorage.setItem('mouzhi/pixel-farm:save', s); } catch (e) {} }, JSON.stringify(save));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const out = await p.evaluate(({ DAYS, BUY }) => {
    const f = __farm, S = f.S, F = f.FARMER, WA = PFWood, WD = PFWorld; f.SAVE.off = true;
    for (const id of BUY.split(',').filter(Boolean)) f.buy(id);
    const start = S.day, days = {}, at0 = { coins: S.coins, wood: F.wood, target: f.woodAuto().target, cap: f.woodCap(), orders: S.orders.length };
    const who = a => a === F ? 'farmer' : a.id;
    while (S.day < start + DAYS) {
      f.advance(2.5, 10);
      const T = S.t % 1440; if (F.sleeping || F.home) continue;
      const d = days[S.day] || (days[S.day] = { samples: 0, want: 0, cond: {}, farmerWhenWant: {}, chopBy: {}, wood: [] });
      const tgt = f.woodAuto().target, grown = S.trees.filter(t => t.kind === 'wild' && t.stage === 'tree' && WD.regrows(t)).length;
      const c = { short: F.wood < tgt, trees: grown > WA.KEEP, early: T < WA.AUTO_END }; d.samples++;
      for (const k in c) if (!c[k]) d.cond['no_' + k] = (d.cond['no_' + k] || 0) + 1;
      if (c.short && c.trees && c.early) { d.want++; const k = F.task ? F.task.kind || F.task.label : 'none'; d.farmerWhenWant[k] = (d.farmerWhenWant[k] || 0) + 1; }
      for (const a of f.actors()) if (a.task && a.task.kind === 'chop') { const k = who(a) + (a.task.label === '自己去林场砍树' ? ':auto' : ':marked'); d.chopBy[k] = (d.chopBy[k] || 0) + 1; }
      if (d.samples % 60 === 1) d.wood.push(F.wood);
    }
    return { start, at0, days, coins0: at0.coins, coinsEnd: S.coins, woodEnd: F.wood, cut: S.woodCut || 0, version: f.version };
  }, { DAYS, BUY });
  console.log(JSON.stringify(out, null, 1));
  if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  await b.close(); server.close();
})();
