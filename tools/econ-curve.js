// v5.9.x economy curve: plays the real game headless from a fresh farm for N days and records, per game day, income by
// source, coins, wood, and every unlock. game.js is served with a few one-line counters spliced in (only for this run;
// the file on disk is untouched) so each sale can be split into crops / fruit / animals / fish / workshop goods / town.
//   node tools/econ-curve.js [days=90] [casual|growth|idle] [seed=7]   → prints a table, writes $PF_SHOTS/econ_<policy>.json
// casual: every game hour, buy the cheapest thing that can be bought right now (shop items and new plots, decorations
//   only once the purse is 5× their price), mark up to 3 trees a day while wood is short, plant saplings on fixed spots.
// growth: like casual, but never buys decorations or pets (an upper bound on how fast the farm can grow).
// idle: never clicks anything; the farmer (and later the family) just works on his own.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), DAYS = +process.argv[2] || 90, POLICY = process.argv[3] || 'casual', SEED = process.argv[4] || '7';
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const HOOKS = [ // [anchor, code appended after it]; each anchor must occur exactly once
  ['const ty = SU.itemType(it), g = priceOfAny(it), base = basePrice(ty); sum += g;', " window.__econ && __econ('market', ty, g);"],
  ['const g = priceOfAny(o.it), p = TN.tradePrice(g); base += g; sum += p;', " window.__econ && __econ('town', o.ty, p, g);"],
  ['const g = spare * WD.WOOD.price; sum += g;', " window.__econ && __econ('market', 'woodsell', g);"],
  ['if (sp.gold) {', " window.__econ && __econ('market', 'seeds', sp.gold);"],
  ['function homeEarn(h, g, x, y) { if (!(g > 0)) return;', " window.__econ && __econ('home', 'home', g);"],
  ["else if (y.drop === 'coins') {", " window.__econ && __econ('chop', 'coins', y.gold);"],
  ['if (g) { S.coins += g; S.earned += g; S.todayEarn += g; popText(c.x, c.y, 12', '', ' window.__econ && __econ(\'yard\', \'yard\', g);'],
];
function patched() {
  let src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  for (const [a, after, before] of HOOKS) {
    const n = src.split(a).length - 1; if (n !== 1) throw new Error('hook anchor found ' + n + 'x: ' + a);
    src = src.replace(a, (before ? before.replace(/^ /, '') + ' ' : '') + a + after);
  }
  return src;
}
const GAME = patched();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html', p = path.join(ROOT, rel);
  if (rel === 'game.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(GAME); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
// the plot each casual player would pick for each piece of new land (the same choices as the real day-81 save)
const PLOT_MOD = { play: 'playground', glade: 'meadow', swbank: 'dam', wbank: 'workshop', sbank: 'field', bridge: 'bridge', swacross: 'pasture', seacross: 'field',
  eslope: 'orchard', eroad: 'road', eshore: 'field', nwslope: 'pasture', neslope: 'woodland', trail: 'trail', summit: 'orchard', alp: 'pasture' };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=${SEED}`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  await p.evaluate(({ POLICY, PLOT_MOD }) => {
    const S = __farm.S, SIM = window.PFSim, PL = window.PFPlots, X = window.PFExpand, DC = window.PFDecor; __farm.SAVE.off = true;
    const CAT = t => /^(carrot|cabbage|pumpkin|strawberry|watermelon|wheat)$/.test(t) ? 'crops' : /^(apple|orange)$/.test(t) ? 'fruit' : /^(egg|wool|milk|truffle)$/.test(t) ? 'animals'
      : /^(flour|jam|cheese|honey)$/.test(t) ? 'works' : /^(crucian|carp|grassc|bass|koi|sardine|seabass|snapper|tuna|sword)$/.test(t) ? 'fish' : t === 'woodsell' ? 'wood' : t === 'seeds' ? 'seeds' : 'other';
    const E = window.__E = { day: null, days: [], unlocks: [], seen: {}, policy: POLICY, lastChop: 0 };
    const fresh = () => ({ crops: 0, fruit: 0, animals: 0, fish: 0, works: 0, wood: 0, seeds: 0, town: 0, townExtra: 0, home: 0, chop: 0, yard: 0, other: 0, spend: {}, buys: [] });
    E.cur = fresh();
    window.__econ = (where, ty, g, base) => { const c = E.cur;
      if (where === 'town') { c.town += g; c.townExtra += g - base; return; }
      if (where === 'home' || where === 'chop' || where === 'yard') { c[where] += g; return; }
      c[CAT(ty)] += g; };
    const unlock = (what, extra) => E.unlocks.push(Object.assign({ day: S.day, what }, extra || {}));
    window.addEventListener('pf:farm', ev => { const d = ev.detail; if (d.type !== 'purchase') return; const k = /^(hay|seeds)$/.test(d.item) ? d.item : /^plot:/.test(d.item) ? 'plots' : 'shop';
      E.cur.spend[k] = (E.cur.spend[k] || 0) + (d.gold || 0); if (k === 'shop' || k === 'plots') { E.cur.buys.push(d.item + (d.level ? ':' + d.level : '') + (d.mod ? ':' + d.mod : '')); unlock(d.item + (d.level ? ' L' + d.level : ''), { gold: d.gold, wood: d.wood || 0 }); } });
    E.snap = () => { const FA = __farm.FARMER, fm = S.family, c = E.cur;
      const inc = ['crops', 'fruit', 'animals', 'fish', 'works', 'wood', 'seeds', 'town', 'home', 'chop', 'yard', 'other'].reduce((a, k) => a + c[k], 0);
      return Object.assign(c, { day: S.day, coins: S.coins, earned: S.earned, todayEarn: S.todayEarn, incSum: inc, surprise: S.surpriseGold || 0, wood: FA.wood, woodCap: __farm.woodCap(),
        saplings: (FA.saplings.apple | 0) + (FA.saplings.orange | 0), open: __farm.tiles.filter(t => t.open).length, herd: S.animals.length, people: 1 + S.members.length,
        love: fm.love, kids: fm.kids.length, plots: Object.keys(S.plots || {}).length, ups: Object.values(S.up).reduce((a, b) => a + b, 0), hay: S.hay,
        cottages: S.home ? S.home.houses.length : 0 }); };
    const watch = () => { const fm = S.family, seen = E.seen;
      const ev = (k, v) => { if (v && !seen[k]) { seen[k] = 1; unlock(k); } };
      ev('met 阿禾', fm.met); ev('阿禾 love 100', fm.love >= 100); ev('阿禾 moved in', fm.moved); fm.kids.forEach((k, i) => ev('kid' + i + ' born', 1));
      (S.members || []).forEach(m => ev('worker ' + m.id + ' ' + m.role, 1));
      ev('school day 1', S.town && Object.values(S.town.school || {}).some(v => v > 0));
      if (S.home) { ev('wedding', (S.home.wed && Object.keys(S.home.wed).length) || (S.home.houses || []).some(h => h.kid)); (S.home.houses || []).forEach((h, i) => ev('cottage' + i + ' lived in', h.kid)); } };
    const offers = () => { const out = [], FA = __farm.FARMER;
      for (const id of SIM.SHOP_IDS) { const o = SIM.offer(S.up, S.coins, id, FA.wood); if (!o || o.maxed || !o.ok) continue;
        const deco = DC && DC.CATALOG[id]; if (deco && (POLICY === 'growth' || S.coins < o.cost * 5)) continue; if (POLICY === 'growth' && /^(cat|dog)$/.test(id)) continue; out.push({ kind: 'shop', id, cost: o.cost }); }
      if (PL && X) for (const id of Object.keys(PLOT_MOD)) { const o = PL.offer(S.plots, id, PLOT_MOD[id], S.coins, FA.wood, S.family); if (o && o.ok) out.push({ kind: 'plot', id, cost: o.cost }); }
      return out.sort((a, b) => a.cost - b.cost); };
    const PLANT = []; for (let y = -88; y <= 4; y += 16) for (let x = -140; x <= -50; x += 16) PLANT.push([x, y]);
    E.hour = () => { watch(); if (POLICY === 'idle') return;
      for (let guard = 0; guard < 40; guard++) { const o = offers()[0]; if (!o) break;
        const r = o.kind === 'shop' ? __farm.buy(o.id) : X.buyPlot(o.id, PLOT_MOD[o.id]); if (!r || !r.ok) break; }
      const FA = __farm.FARMER, wa = __farm.woodAuto();
      if (S.eff.axe && E.lastChop !== S.day && FA.wood < wa.target) { E.lastChop = S.day;
        S.trees.filter(t => PFWorld.choppable(t, S.eff.regions) && !S.orders.some(o => o.id === t.id)).sort((a, b) => Math.hypot(a.x - 36, a.y - 24) - Math.hypot(b.x - 36, b.y - 24)).slice(0, 3).forEach(t => __farm.orderChop(t.id)); }
      for (const k of ['apple', 'orange']) while (FA.saplings[k] > S.orders.filter(o => o.type === 'plant' && o.kind === k).length) {
        const sp = PLANT.find(([x, y]) => __farm.orderPlant(k, x, y).ok); if (!sp) break; } };
    E.day = S.day;
  }, { POLICY, PLOT_MOD });
  const t0 = Date.now();
  for (let d = 1; d <= DAYS; d++) {
    const row = await p.evaluate(() => { const S = __farm.S, E = window.__E; let guard = 0;
      while (S.day === E.day && guard++ < 200) { __farm.advance(20, 3); E.hour(); }
      // S.day just ticked: the finished day is S.dayEarn's last entry
      const r = E.snap(); r.day = E.day; r.dayEarn = S.dayEarn[S.dayEarn.length - 1]; E.days.push(r); E.cur = (() => { const c = { crops: 0, fruit: 0, animals: 0, fish: 0, works: 0, wood: 0, seeds: 0, town: 0, townExtra: 0, home: 0, chop: 0, yard: 0, other: 0, spend: {}, buys: [] }; return c; })(); E.day = S.day;
      return r; });
    const sp = Object.entries(row.spend).map(([k, v]) => k + ' ' + v).join(', ');
    console.log(`d${String(row.day).padStart(3)} earn ${String(row.dayEarn).padStart(6)} coins ${String(row.coins).padStart(7)} wood ${row.wood}/${row.woodCap} crops ${row.crops} fruit ${row.fruit} anim ${row.animals} herd ${row.herd} fish ${row.fish} works ${row.works} town ${row.town} home ${row.home} | spend ${sp} | ${row.buys.join(' ')} | ${Math.round((Date.now() - t0) / 1000)}s`);
    if (d % 5 === 0 || d === DAYS) { const all = await p.evaluate(() => ({ days: __E.days, unlocks: __E.unlocks, up: __farm.S.up, plots: __farm.S.plots }));
      fs.writeFileSync(path.join(OUT, `econ_${POLICY}.json`), JSON.stringify(Object.assign({ policy: POLICY, seed: SEED, errs }, all))); }
  }
  if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
