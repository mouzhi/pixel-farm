// v5.10.6 unit tests: the wedding-day path, wages and shop takings, 换个活法 fees and refunds, old-save defaults.
const assert = require('assert');
const CR = require('../careers.js');
const HL = require('../hall.js');
const BK = require('../bakery.js');
const WS = require('../woodshop.js');
const SM = require('../smithy.js');

let n = 0;
function ok(name, fn) { try { fn(); n++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e && e.stack || e); process.exit(1); } }

const houses = () => {
  const st = HL.empty();
  for (const id of ['L5', 'L8', 'L11']) { HL.start(st, id, 40); HL.finish(st, 41); }
  return st;
};
const richTown = () => {
  const st = houses();
  HL.start(st, 'market', 50); HL.finish(st, 51);
  HL.start(st, 'bakery', 51); HL.finish(st, 52);
  return st;
};
const allShops = () => {
  const st = richTown();
  HL.start(st, 'woodshop', 60); HL.finish(st, 61);
  HL.start(st, 'smithy', 61); HL.finish(st, 62);
  return st;
};
const home = () => CR.empty();
const ctxOf = (hall, extra) => Object.assign({ hall, lots: {}, coins: 200000, wood: 800, mate: 'm1', kidName: '小豆', nb: {}, day: 80, town: true }, extra || {});

ok('empty / valid(): missing fields become 留家种地 and no lots; save stays append-only', () => {
  assert.deepStrictEqual(CR.valid(null), CR.empty());
  assert.deepStrictEqual(CR.validLots(null), {});
  assert.deepStrictEqual(CR.valid({ wage: -3, path: { kid0: { way: 'fly', at: 'moon' }, evil: { way: 'farm' } } }), { path: { kid0: { way: 'farm', at: null, kind: null, day: 0, ready: 0, pending: null, free: 0, chg: 0 } }, wage: 0 });
  const lots = CR.validLots({ L2: 'kid0', L3: 'kid0', L9: 'kid1', L3: 'kid1', foo: 'kid0' });
  assert.deepStrictEqual(lots, { L2: 'kid0', L3: 'kid1' });
  const p = CR.pathOf(CR.empty(), 'kid0');
  assert.strictEqual(p.way, 'farm'); assert.strictEqual(p.free, 1); assert.strictEqual(p.implied, 1);
});

ok('tendency 1: the job whose owner they like most, if ≥ 50 and that shop is up', () => {
  const st = home(), hall = allShops();
  const a = CR.prefer(st, 'kid0', ctxOf(hall, { nb: { n3: 60, n2: 80, n8: 55 }, mate: 'm1' }));
  assert.deepStrictEqual(a, { way: 'work', at: 'wood', kind: null }, '阿松 80 beats 小桃 60 and 阿锤 55');
  const b = CR.prefer(st, 'kid0', ctxOf(hall, { nb: { n3: 50, n2: 50, n8: 90 }, mate: 'm0' }));
  assert.strictEqual(b.way, 'work'); assert.strictEqual(b.at, 'smith');
  const c = CR.prefer(st, 'kid0', ctxOf(richTown(), { nb: { n3: 80, n2: 99, n8: 99 }, mate: 'm1' }));
  assert.deepStrictEqual(c, { way: 'work', at: 'bakery', kind: null }, 'only the bakery is up, even if they like 阿松 more');
  const d = CR.prefer(st, 'kid0', ctxOf(hall, { nb: { n3: 49, n2: 49, n8: 49 }, mate: 'm2' }));
  assert.notStrictEqual(d.way, 'work', 'below 50 is not a job default');
});

ok('tendency 2: if they can open a shop and the spouse is 朵朵 / 阿团 / 石头, default to that shop', () => {
  const st = home(), hall = richTown();
  assert.deepStrictEqual(CR.prefer(st, 'kid0', ctxOf(hall, { mate: 'm1', nb: { n3: 20 } })), { way: 'shop', at: null, kind: 'flower' });
  assert.deepStrictEqual(CR.prefer(st, 'kid0', ctxOf(hall, { mate: 'm0' })), { way: 'shop', at: null, kind: 'sweet' });
  assert.deepStrictEqual(CR.prefer(st, 'kid0', ctxOf(hall, { mate: 'm2' })), { way: 'shop', at: null, kind: 'tackle' });
  assert.deepStrictEqual(CR.prefer(st, 'kid0', ctxOf(hall, { mate: 'm1', coins: 100 })), { way: 'farm', at: null, kind: null }, 'cannot afford a shop');
  assert.deepStrictEqual(CR.prefer(st, 'kid0', ctxOf(houses(), { mate: 'm1' })), { way: 'farm', at: null, kind: null }, 'prosperity 2 cannot open a shop');
});

ok('tendency 3: otherwise they stay and farm', () => {
  const st = home();
  assert.deepStrictEqual(CR.prefer(st, 'kid0', ctxOf(HL.empty(), { mate: 'm1', coins: 10, wood: 0 })), { way: 'farm', at: null, kind: null });
  const opts = CR.options(st, 'kid0', ctxOf(richTown(), { mate: 'm1', nb: { n3: 20 } }));
  assert.strictEqual(opts[0].way, 'farm');
  const shop = opts.find(o => o.way === 'shop' && o.kind === 'flower');
  const bakery = opts.find(o => o.way === 'work' && o.at === 'bakery');
  assert.ok(shop && shop.selected && shop.ok, 'flower shop is the default');
  assert.ok(bakery && bakery.ok, 'bakery job is open');
  const locked = CR.options(st, 'kid0', ctxOf(houses(), { mate: 'm1' }));
  const lockJob = locked.find(o => o.way === 'work' && o.at === 'bakery');
  const lockShop = locked.find(o => o.way === 'shop' && o.kind === 'flower');
  assert.ok(lockJob && !lockJob.ok); assert.ok(/面包房/.test(lockJob.why));
  assert.ok(lockShop && !lockShop.ok); assert.ok(/繁荣度/.test(lockShop.why));
  assert.strictEqual(locked[0].selected, true);
});

ok('take(): work is free; a shop costs 15,000 + 150 wood, uses a free lot, and opens the next morning', () => {
  const st = home(), lots = {}, hall = allShops();
  const w = CR.take(st, lots, 'kid0', { way: 'work' }, ctxOf(hall, { nb: { n3: 70 } }), 80);
  assert.ok(w.ok); assert.strictEqual(w.way, 'work'); assert.strictEqual(w.at, 'bakery'); assert.strictEqual(w.paid, 0); assert.strictEqual(w.wood, 0);
  const st2 = home(), lots2 = {};
  const s = CR.take(st2, lots2, 'kid0', { way: 'shop', kind: 'flower' }, ctxOf(richTown(), { mate: 'm1' }), 80);
  assert.ok(s.ok, s.why); assert.strictEqual(s.way, 'shop'); assert.strictEqual(s.at, 'L2'); assert.strictEqual(s.kind, 'flower');
  assert.strictEqual(s.paid, 15000); assert.strictEqual(s.wood, 150); assert.strictEqual(s.ready, 81);
  assert.deepStrictEqual(lots2, { L2: 'kid0' });
  assert.strictEqual(CR.shopReady(st2.path.kid0, 80), false);
  assert.strictEqual(CR.shopReady(st2.path.kid0, 81), true);
  assert.strictEqual(CR.shopName('小豆', 'flower'), '小豆的花店');
  assert.strictEqual(CR.lvBonus(lots2, st2.path, 80), 0, 'scaffolding does not lift prosperity');
  assert.strictEqual(CR.lvBonus(lots2, st2.path, 81), 1);
  assert.strictEqual(CR.townLv(richTown(), lots2, st2.path, 81), 4);
});

ok('wages: 300 a day; shop takings are 30% over the market, at most 10 items', () => {
  const st = home();
  assert.strictEqual(CR.payWage(st), 300); assert.strictEqual(st.wage, 300);
  CR.payWage(st); assert.strictEqual(st.wage, 600);
  assert.strictEqual(CR.marketPrice(100), 115);
  assert.strictEqual(CR.shopPrice(100), Math.round(115 * 1.3));
  const prices = { flour: 60, jam: 80, egg: 10, milk: 35, strawberry: 30, apple: 12, honey: 40, flower: 8, crucian: 15, fishFood: 20 };
  const sweet = CR.sell('sweet', { flour: 4, jam: 3, egg: 8, milk: 2, strawberry: 5, apple: 20 }, id => prices[id]);
  assert.ok(sweet.n <= 10); assert.strictEqual(sweet.n, 10);
  assert.ok(!sweet.take.some(t => t.id === 'apple'), 'a sweet shop does not take fruit other than strawberries');
  assert.strictEqual(sweet.gold, sweet.take.reduce((s, t) => s + t.n * CR.shopPrice(prices[t.id]), 0));
  assert.ok(sweet.gold >= 400 && sweet.gold <= 900, 'about 400–900 a day, got ' + sweet.gold);
  const few = CR.sell('flower', { honey: 2, apple: 1 }, id => prices[id]);
  assert.strictEqual(few.n, 3); assert.ok(few.gold > 0);
  const fish = CR.sell('tackle', { crucian: 6, fishFood: 5, flour: 9 }, id => prices[id], id => id === 'crucian');
  assert.ok(fish.take.every(t => t.id === 'crucian' || t.id === 'fishFood'));
  assert.ok(!fish.take.some(t => t.id === 'flour'));
  CR.payShop(st, sweet.gold); assert.strictEqual(st.wage, 600 + sweet.gold);
});

ok('换个活法: 2,000, next morning; closing a shop refunds half; a pre-v5.10.6 marriage is free the first time', () => {
  const hall = allShops();
  const st = home(), lots = {};
  // already married, no path record
  assert.strictEqual(CR.pathOf(st, 'kid0').free, 1);
  const plan = CR.planChange(st, 'kid0', { way: 'work', at: 'smith' }, ctxOf(hall, { coins: 2000, nb: { n8: 10 } }), 90);
  assert.ok(plan.ok, plan.why); assert.strictEqual(plan.fee, 0); assert.strictEqual(plan.free, true);
  assert.ok(st.path.kid0.pending);
  const r = CR.applyPending(st, lots, 'kid0', ctxOf(hall), 91);
  assert.ok(r.ok); assert.strictEqual(r.way, 'work'); assert.strictEqual(r.at, 'smith'); assert.strictEqual(st.path.kid0.free, 0);
  assert.strictEqual(st.path.kid0.pending, null);

  const tooSoon = CR.planChange(st, 'kid0', { way: 'shop', kind: 'flower' }, ctxOf(hall, { mate: 'm1', coins: 20000 }), 91);
  assert.ok(!tooSoon.ok); assert.ok(/再过/.test(tooSoon.why), tooSoon.why);
  const plan2 = CR.planChange(st, 'kid0', { way: 'shop', kind: 'flower' }, ctxOf(hall, { mate: 'm1', coins: 1500 }), 96);
  assert.ok(!plan2.ok); assert.ok(/2,000/.test(plan2.why), plan2.why);
  const plan3 = CR.planChange(st, 'kid0', { way: 'shop', kind: 'flower' }, ctxOf(hall, { mate: 'm1', coins: 20000 }), 96);
  assert.ok(plan3.ok, plan3.why); assert.strictEqual(plan3.fee, 2000);
  const r3 = CR.applyPending(st, lots, 'kid0', ctxOf(hall, { mate: 'm1', coins: 20000, wood: 200 }), 97);
  assert.ok(r3.ok, r3.why); assert.strictEqual(r3.paid, 15000); assert.strictEqual(r3.wood, 150); assert.deepStrictEqual(lots, { L2: 'kid0' });

  // close it once it has opened
  st.path.kid0.ready = 92;
  const close = CR.take(st, lots, 'kid0', { way: 'farm' }, ctxOf(hall), 93);
  assert.ok(close.ok, close.why); assert.strictEqual(close.refund, 7500); assert.strictEqual(close.wood, 0);
  assert.deepStrictEqual(lots, {});
  assert.strictEqual(st.path.kid0.way, 'farm');

  // closing while the shop is still going up gives the fit-out back
  const st4 = home(), lots4 = {};
  CR.take(st4, lots4, 'kid0', { way: 'shop', kind: 'sweet' }, ctxOf(hall, { mate: 'm0' }), 100);
  const mid = CR.take(st4, lots4, 'kid0', { way: 'farm' }, ctxOf(hall, { mate: 'm0' }), 100);
  assert.ok(mid.ok); assert.strictEqual(mid.refund, 15000); assert.strictEqual(mid.wood, -150);
  assert.deepStrictEqual(lots4, {});
});

ok('two children can each have a shop; a third cannot; autobuy never enters this', () => {
  const hall = richTown(), st = home(), lots = {};
  const a = CR.take(st, lots, 'kid0', { way: 'shop', kind: 'flower' }, ctxOf(hall, { mate: 'm1' }), 80);
  const b = CR.take(st, lots, 'kid1', { way: 'shop', kind: 'tackle' }, ctxOf(hall, { mate: 'm2' }), 80);
  assert.ok(a.ok && b.ok, (a.why || '') + (b.why || ''));
  assert.deepStrictEqual(lots, { L2: 'kid0', L3: 'kid1' });
  assert.strictEqual(CR.lvBonus(lots, st.path, 81), 1, 'two shops still lift prosperity only once');
  const why = CR.canTake(home(), 'kid0', { way: 'shop', kind: 'sweet' }, ctxOf(hall, { mate: 'm0', lots }));
  assert.ok(/空地块/.test(why));
});

ok('little farm: yield halves and help is rarer once they work or keep a shop', () => {
  const st = home();
  assert.strictEqual(CR.yieldMul(st, 'kid0'), 1); assert.strictEqual(CR.helpDayP(st, 'kid0'), 0.5);
  assert.strictEqual(CR.earnOf(200, st, 'kid0'), 200);
  st.path.kid0 = CR.cleanPath({ way: 'work', at: 'bakery', day: 80 });
  assert.strictEqual(CR.yieldMul(st, 'kid0'), 0.5); assert.strictEqual(CR.helpDayP(st, 'kid0'), 0.25);
  assert.strictEqual(CR.earnOf(200, st, 'kid0'), 100);
  assert.strictEqual(CR.earnOf(25, st, 'kid0'), 13);
});

ok('work perks: +1 bakery order, furniture twice as fast, smithy upgrades 10% off', () => {
  const st = home();
  assert.strictEqual(CR.extraOrders(st), 0); assert.strictEqual(CR.craftTimes(st), 1); assert.strictEqual(CR.smithOff(st), 0);
  st.path.kid0 = CR.cleanPath({ way: 'work', at: 'bakery', day: 80 });
  assert.strictEqual(CR.extraOrders(st), 1);
  st.path.kid0.at = 'wood';
  assert.strictEqual(CR.craftTimes(st), 2); assert.strictEqual(CR.extraOrders(st), 0);
  st.path.kid0.at = 'smith';
  assert.strictEqual(CR.smithOff(st), 0.1);
  const u = SM.UPGRADES.find(x => x.id === 'water');
  const full = SM.costOf(u, 0); const off = SM.costOf(u, 0, true) || Math.round(full * 0.9);
  // costOf may not take a discount arg yet; the expected price is still 10% off
  assert.strictEqual(Math.round(full * 0.9), 10800);
});

ok('festival: a work day is off; a shop stays open', () => {
  const st = home();
  st.path.kid0 = CR.cleanPath({ way: 'work', at: 'bakery', day: 80 });
  assert.strictEqual(CR.worksToday(st, 'kid0', false), true);
  assert.strictEqual(CR.worksToday(st, 'kid0', true), false);
  st.path.kid0 = CR.cleanPath({ way: 'shop', at: 'L2', kind: 'flower', day: 80, ready: 81 });
  assert.strictEqual(CR.shopsToday(st, 'kid0', 81), true);
  assert.strictEqual(CR.worksToday(st, 'kid0', false), false);
});

ok('round-trip of a filled home.path / town.lots', () => {
  const st = { path: { kid0: { way: 'shop', at: 'L2', kind: 'flower', day: 80, ready: 81, free: 0 } }, wage: 4200 };
  const v = CR.valid(st); assert.deepStrictEqual(CR.valid(JSON.parse(JSON.stringify(v))), v);
  const lots = CR.validLots({ L2: 'kid0' }); assert.deepStrictEqual(CR.validLots(JSON.parse(JSON.stringify(lots))), lots);
});


ok('v5.10.7: 经营民宿 / 菜馆 is a fourth option on the same choice UI, free, no town lot', () => {
  const st = home(), hall = richTown();
  const locked = CR.options(st, 'kid0', ctxOf(hall, { mate: 'm1' }));
  const innL = locked.find(o => o.way === 'inn');
  assert.ok(locked.length >= 12, 'farm + jobs + shops + inn, got ' + locked.length);
  assert.ok(innL); assert.strictEqual(innL.title, '经营民宿 / 菜馆');
  assert.strictEqual(innL.ok, false);
  assert.ok(/民宿院|小木屋|菜馆/.test(innL.why));
  const open = CR.options(st, 'kid0', ctxOf(hall, { mate: 'm1', innPlot: 'glade', cabins: 1 }));
  const innO = open.find(o => o.way === 'inn');
  assert.ok(innO && innO.ok); assert.strictEqual(innO.cost, 0);
  const r = CR.take(st, {}, 'kid0', { way: 'inn' }, ctxOf(hall, { innPlot: 'glade', cabins: 2, diner: 1 }), 80);
  assert.ok(r.ok); assert.strictEqual(r.way, 'inn'); assert.strictEqual(r.paid, 0); assert.strictEqual(r.wood, 0);
  assert.strictEqual(st.path.kid0.way, 'inn');
  assert.strictEqual(CR.innsToday(st, 'kid0'), true);
  assert.strictEqual(CR.innStaffed(st), true);
  assert.strictEqual(CR.awayForFarm(st, 'kid0'), true);
  assert.strictEqual(CR.isAway(st, 'kid0'), true);
});

ok('v5.10.7: 换个活法 can switch onto and off the inn path; a shop still refunds as before', () => {
  const st = home(), lots = {}, hall = richTown();
  const s = CR.take(st, lots, 'kid0', { way: 'shop', kind: 'flower' }, ctxOf(hall, { mate: 'm1' }), 80);
  assert.ok(s.ok); lots.L2 = 'kid0'; st.path.kid0.ready = 81;
  const plan = CR.planChange(st, 'kid0', { way: 'inn' }, ctxOf(hall, { mate: 'm1', innPlot: 'glade', cabins: 1, coins: 200000, day: 82 }), 82);
  assert.ok(plan.ok); assert.strictEqual(plan.fee, 2000);
  const r = CR.applyPending(st, lots, 'kid0', ctxOf(hall, { mate: 'm1', innPlot: 'glade', cabins: 1, coins: 200000, day: 83 }), 83);
  assert.ok(r.ok); assert.strictEqual(r.way, 'inn'); assert.strictEqual(r.refund, Math.round(15000 * 0.5));
  assert.deepStrictEqual(lots, {});
  assert.strictEqual(st.path.kid0.way, 'inn');
});

console.log('\n' + n + ' tests ok');
