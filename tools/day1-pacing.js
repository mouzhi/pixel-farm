// v5.11.0.31 前三天节奏: plays the real game headless from a FRESH farm (the xhs build shares sim.js, so one run covers both)
// with the econ-curve "casual" player (each game hour, buy the cheapest thing affordable; decorations only with 5x the price)
// and records every game hour of days 1-3: gold, what the farmer is doing, tilled / planted / ripe tiles, and the first-time
// milestones (first gold, first sale at the stall, first shop buy, first field expansion, coop, first chicken, meeting 阿禾).
//   node tools/day1-pacing.js [days=7] [casual|goal]  → prints the timeline, writes $PF_SHOTS/day1_pacing_<policy>.json
//   goal: a player who follows the starter goals (buys only the goal's item, as soon as it is affordable) until the chain is done, then plays casual
//   asserts the day-1 milestones whenever 3+ days are played (PF_NO_ASSERT=1 to only print)
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), DAYS = +process.argv[2] || 7, POLICY = process.argv[3] || 'casual', OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html', p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  await p.evaluate(POLICY => {
    const S = __farm.S, SIM = window.PFSim, DC = window.PFDecor; __farm.SAVE.off = true;
    const E = window.__D = { hours: [], ms: {}, real: 0, buys: [], toasts: [] };
    const hm = () => { const T = Math.floor(S.t % 1440); return `d${S.day} ${String(Math.floor(T / 60)).padStart(2, '0')}:${String(T % 60).padStart(2, '0')}`; };
    const mark = (k, extra) => { if (!E.ms[k]) E.ms[k] = Object.assign({ at: hm(), day: S.day, min: Math.floor(S.t % 1440), realMin: Math.round(E.real / 6) / 10, coins: S.coins }, extra || {}); };
    window.addEventListener('pf:farm', ev => { const d = ev.detail;
      if (d.type === 'purchase') { if (/^plot:|^hay$|^seeds$/.test(d.item)) { if (d.item === 'seeds') mark('first seed purchase'); } else { E.buys.push(hm() + ' ' + d.item + (d.level ? ':' + d.level : '') + ' ' + d.gold); mark('first shop buy', { item: d.item, gold: d.gold }); }
        if (d.item === 'field') mark('field:' + d.level); if (d.item === 'coop') mark('coop'); if (d.item === 'chicken') mark('first chicken'); }
      if (d.type === 'income' && d.gold > 0) mark('first gold', { source: d.source }); });
    E.offers = () => { const out = [], FA = __farm.FARMER;
      for (const id of SIM.SHOP_IDS) { const o = SIM.offer(S.up, S.coins, id, FA.wood); if (!o || o.maxed || !o.ok) continue;
        const deco = (DC && DC.CATALOG[id]) || SIM.shopItem(id).yard; if (deco && S.coins < o.cost * 5) continue; out.push({ id, cost: o.cost }); }
      return out.sort((a, b) => a.cost - b.cost); };
    E.hour = () => {
      const goal = POLICY === 'goal' && SIM.starterGoal && SIM.starterGoal(S.up, S.totalSold, S.day);
      if (goal) { if (goal.step.shop) { const o = SIM.offer(S.up, S.coins, goal.step.shop, __farm.FARMER.wood); if (o && o.ok) __farm.buy(goal.step.shop); } }
      else for (let g = 0; g < 40; g++) { const o = E.offers()[0]; if (!o) break; const r = __farm.buy(o.id); if (!r || !r.ok) break; }
      const open = __farm.tiles.filter(t => t.open);
      if (S.earned > 0) mark('first gold');
      if (S.totalSold > 0) mark('first crop sold');
      if (S.family && S.family.met) mark('met 阿禾');
      E.hours.push({ at: hm(), day: S.day, h: Math.floor((S.t % 1440) / 60), coins: S.coins, earned: S.earned, label: S.label, tilled: open.filter(t => t.tilled).length,
        planted: open.filter(t => t.crop).length, ripe: open.filter(t => t.crop && SIM.ripe(t.crop)).length, open: open.length, realMin: Math.round(E.real / 6) / 10 }); };
  }, POLICY);
  const days = [];
  for (let d = 1; d <= DAYS; d++) {
    const row = await p.evaluate(() => { const S = __farm.S, E = window.__D, day = S.day; let guard = 0;
      while (S.day === day && guard++ < 200) { __farm.advance(20, 3); E.real += 20; E.hour(); }
      return { day, earned: S.earned, coins: S.coins, dayEarn: S.dayEarn[S.dayEarn.length - 1], realMin: Math.round(E.real / 6) / 10 }; });
    days.push(row);
  }
  const res = await p.evaluate(() => ({ hours: __D.hours, ms: __D.ms, buys: __D.buys, ach: (__farm.S.achievements || []).map(a => a.id || a) }));
  res.days = days; res.errs = errs;
  for (const h of res.hours.filter(h => h.day <= 3)) console.log(`${h.at}  coins ${String(h.coins).padStart(5)}  earned ${String(h.earned).padStart(5)}  tilled ${String(h.tilled).padStart(2)}/${h.open} planted ${String(h.planted).padStart(2)} ripe ${String(h.ripe).padStart(2)}  ${h.realMin}m  ${h.label}`);
  console.log('--- milestones'); for (const [k, v] of Object.entries(res.ms)) console.log(k.padEnd(20), v.at, `real ${v.realMin} min`, 'coins', v.coins, v.item || v.source || '');
  console.log('--- days'); for (const r of days) console.log(`d${r.day} earned(total) ${r.earned} dayEarn ${r.dayEarn} coins ${r.coins} real ${r.realMin} min`);
  console.log('--- buys'); console.log(res.buys.join('\n'));
  try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `day1_pacing_${POLICY}.json`), JSON.stringify(res)); } catch (e) {}
  if (!process.env.PF_NO_ASSERT && DAYS >= 3) { // the day-1 milestones (CI runs `node tools/day1-pacing.js`)
    const ms = res.ms;
    assert(!errs.length, 'page errors: ' + errs.slice(0, 3).join(' | '));
    assert(ms['first gold'] && ms['first gold'].day === 1 && ms['first gold'].min <= 15 * 60, 'first gold on day 1 by 15:00: ' + JSON.stringify(ms['first gold']));
    assert(ms['first crop sold'] && ms['first crop sold'].day === 1 && ms['first crop sold'].min <= 17 * 60, 'a crop is sold on day 1 by 17:00: ' + JSON.stringify(ms['first crop sold']));
    assert(ms['field:1'] && ms['field:1'].day === 1, 'first field expansion bought on day 1: ' + JSON.stringify(ms['field:1']));
    assert(days[0].earned >= 100, 'day 1 earns at least 100: ' + days[0].earned);
    assert(days[0].earned <= 400, 'day 1 is not a windfall: ' + days[0].earned);
    assert(days[2].earned >= 400, 'three days earn at least 400: ' + days[2].earned);
    console.log('ok   day-1 pacing milestones');
  }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
