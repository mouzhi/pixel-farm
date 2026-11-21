// Unit tests for v5.10.4 (bakery.js: 面包房 + 订单板 — the lot, daily orders, 50% pay, 「我来挑」, saved inside town.hall):  node tools/bakery-test.js
const assert = require('assert');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const TN = require('../town.js'), HL = require('../hall.js'), MK = require('../market.js'), BK = require('../bakery.js'), SIM = require('../sim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const overlap = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
const rectOf = b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd];
const houses = () => { const st = HL.empty(); for (const id of ['L5', 'L8', 'L11']) { HL.start(st, id, 40); HL.finish(st, 41); } return st; };

ok('the bakery is a board project: 25,000 金 + 150 木材, needs 繁荣度 2 (three houses first)', () => {
  const st = HL.empty(), rich = { open: true, coins: 1e6, wood: 999 }, p = HL.PROJ.bakery;
  assert.strictEqual(p.cost, 25000); assert.strictEqual(p.wood, 150); assert.strictEqual(p.lv, 2); assert.strictEqual(p.kind, 'bakery');
  assert(/繁荣度到 2/.test(HL.canStart(st, 'bakery', rich)));
  const b = houses(); assert.strictEqual(HL.canStart(b, 'bakery', { open: true, coins: 24999, wood: 999 }), '金币不够');
  assert.strictEqual(HL.canStart(b, 'bakery', { open: true, coins: 25000, wood: 149 }), '木材不够');
  assert.strictEqual(HL.canStart(b, 'bakery', { open: true, coins: 25000, wood: 150 }), null);
  HL.start(b, 'bakery', 50); assert.strictEqual(HL.finish(b, 51), 'bakery'); assert(BK.built(b)); assert.strictEqual(HL.prosperity(b), 2);
  assert(HL.blocks(b).some(r => overlap(r, rectOf(BK.LOT))), 'the bakery is solid');
});
ok('lot L6 sits between L5 and the square, in town, clear of buildings, lots, stalls, the fountain, streets, gifts and the board', () => {
  const l = BK.LOT, r = rectOf(l); assert.strictEqual(l.id, 'bakery');
  assert(TN.inRect(r[0], r[1], TN.RECT) && TN.inRect(r[2], r[3], TN.RECT), 'in town');
  const others = TN.BUILDINGS.map(b => [b.id, rectOf(b)]).concat(HL.LOTS.filter(q => q.id !== 'bakery').map(q => [q.id, rectOf(q)]), [['board', [HL.BOARD.x - 3, HL.BOARD.y - 1, HL.BOARD.x + 3, HL.BOARD.y + 1]]]);
  for (const [oid, o] of others) assert(!overlap(r, o, 1), 'bakery / ' + oid);
  const P = TN.PLAZA; assert(!overlap(r, [P.x - MK.PLAZA_R, P.y - MK.PLAZA_R, P.x + MK.PLAZA_R, P.y + MK.PLAZA_R]), 'off the bigger square');
  assert(!overlap(r, [440, 62, 640, 70]), 'off the main street'); assert(!overlap(r, [521, 66, 527, 140]), 'off the south street');
  for (const s of MK.STALLS) assert(!overlap(r, [s.x - MK.HW, s.y - MK.HD, s.x + MK.HW, s.y + MK.HD], 1), 'stall ' + s.id);
  const things = HL.GIFT_SPOTS.concat(HL.PROPS.map(([, x, y]) => ({ x, y })), [{ x: P.x - 10, y: P.y + 14 }, { x: P.x + 14, y: P.y - 10 }]);
  for (const t of things) assert(!TN.inRect(t.x, t.y, r, 3), 'on ' + JSON.stringify(t));
  assert(TN.inTown(l.door.x, l.door.y) && TN.inTown(BK.STAND.x, BK.STAND.y) && TN.inTown(BK.BOARD.x, BK.BOARD.y));
  for (const [, o] of others) { assert(!TN.inRect(l.door.x, l.door.y, o) && !TN.inRect(BK.STAND.x, BK.STAND.y, o) && !TN.inRect(BK.BOARD.x, BK.BOARD.y, o, 1)); }
  const site = HL.siteSpot('bakery'); assert(site && TN.inTown(site.x, site.y));
});
ok('once it is up, five projects take prosperity to 3; 小桃 works in the bakery 8:00–17:00 (her stall still wins on market day)', () => {
  const b = houses(); HL.start(b, 'market', 50); HL.finish(b, 51); assert.strictEqual(HL.prosperity(b), 2);
  HL.start(b, 'bakery', 51); HL.finish(b, 52); assert.strictEqual(HL.prosperity(b), 3); assert.deepStrictEqual(HL.nextLevelAt(b), { need: 4 }, 'v5.10.9: school + library (and the two shops) make 4');
  const tao = TN.NEIGHBOURS.find(q => q.id === 'n3');
  assert.strictEqual(HL.bakeryAt(b, tao, 60, 10 * 60).spot, 'bakery');
  assert.strictEqual(HL.bakeryAt(b, tao, 60, 18 * 60), null, 'home in the evening');
  assert.strictEqual(HL.bakeryAt(HL.empty(), tao, 60, 10 * 60), null, 'not before it is built');
  assert.strictEqual(HL.neighbourAt(tao, 10 * 60).spot, TN.neighbourAt(tao, 10 * 60).spot, 'the unbuilt day is unchanged');
  assert.strictEqual(HL.marketAt(b, tao, 56, 9 * 60).spot, 'stall:s2', 'market day: she keeps her stall');
});
ok('every day two orders; pay is 50% over the stall; the example「6 份面粉 + 4 个鸡蛋」is 600 金', () => {
  assert.strictEqual(BK.payOf([{ id: 'flour', n: 6 }, { id: 'egg', n: 4 }]), 600);
  assert.strictEqual(BK.baseOf([{ id: 'flour', n: 6 }, { id: 'egg', n: 4 }]), 400);
  assert.strictEqual(BK.needText([{ id: 'flour', n: 6 }, { id: 'egg', n: 4 }]), '6 份面粉 + 4 个鸡蛋');
  const a = BK.offers(80), b = BK.offers(80), c = BK.offers(81);
  assert.strictEqual(a.length, 2); assert.deepStrictEqual(a, b, 'the same day is the same after a reload');
  assert(a[0].id !== a[1].id && a[0].text !== a[1].text, 'two different orders');
  assert(c[0].text !== a[0].text || c[1].text !== a[1].text, 'the next day turns over');
  for (const o of a.concat(c)) { assert(o.need.length >= 1 && o.pay === Math.round(o.base * 1.5)); for (const x of o.need) assert(BK.WORD[x.id] && x.n >= 1); }
  const texts = new Set(Array.from({ length: 40 }, (_, i) => BK.offers(i + 20).map(o => o.text).join('|')));
  assert(texts.size >= 20, 'orders vary ' + texts.size);
});
ok('auto accepts the most profitable fulfillable order; 「我来挑」 waits for a click, then auto if none came', () => {
  const B = BK.empty(); BK.roll(B, 80); assert.strictEqual(B.offer.length, 2); assert.strictEqual(B.take, null);
  const rich = Object.fromEntries(Object.keys(BK.UNIT).map(id => [id, 99]));
  const best = BK.best(B.offer, rich); assert(best && B.offer.some(o => o.id === best.id));
  BK.autoTake(B, rich); assert.strictEqual(B.take, best.id, 'auto picks the better one');
  const mid = B.offer.find(o => o.id !== best.id);
  const poor = {}; for (const x of mid.need) poor[x.id] = x.n; // only enough for the lesser one
  const C = BK.empty(); BK.roll(C, 80); BK.autoTake(C, poor);
  assert.strictEqual(C.take, mid.id, 'only the one they can fill');
  const D = BK.empty(); BK.roll(D, 80); D.pick = 1; BK.autoTake(D, rich);
  assert.strictEqual(D.take, best.id, '我来挑 with no click still auto-accepts');
  const E = BK.empty(); BK.roll(E, 80); E.pick = 1; BK.setTake(E, mid.id); BK.autoTake(E, rich);
  assert.strictEqual(E.take, mid.id, 'a click sticks even if it pays less');
  BK.setTake(E, null); assert.strictEqual(E.take, null);
  const F = BK.empty(); BK.roll(F, 80); BK.autoTake(F, {}); assert.strictEqual(F.take, null, 'nothing in stock: wait, no penalty');
});
ok('valid(): junk in, a clean bakery out; old halls gain an automatic bakery; a new day rolls the board', () => {
  assert.deepStrictEqual(BK.valid(null), BK.empty()); assert.deepStrictEqual(HL.valid({ built: { L5: 3 } }).bakery, BK.empty());
  const v = BK.valid({ pick: 'yes', days: -2, gold: 1.6, extra: 'x', last: 9, offer: [{ id: 'o0', need: [{ id: 'flour', n: 6 }, { id: 'nope', n: 2 }] }, 7], take: 'o0', done: 1 });
  assert.strictEqual(v.pick, 1); assert.strictEqual(v.days, 0); assert.strictEqual(v.gold, 2); assert.strictEqual(v.extra, 0);
  assert.strictEqual(v.last, 9); assert.strictEqual(v.take, 'o0'); assert.strictEqual(v.done, 1);
  assert.deepStrictEqual(v.offer[0].need, [{ id: 'flour', n: 6 }]);
  const B = BK.valid({ last: 9, offer: [{ id: 'o0', need: [{ id: 'egg', n: 2 }] }], take: 'o0', done: 1 });
  BK.roll(B, 10); assert.strictEqual(B.last, 10); assert.strictEqual(B.take, null); assert.strictEqual(B.done, 0); assert.strictEqual(B.offer.length, 2);
});

ok('v5.11.0.26: shortOf names what is missing; reserve holds string and object crops before a workshop would take them', () => {
  assert.deepStrictEqual(BK.shortOf([{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }], { milk: 3, honey: 3 }), []);
  assert.deepStrictEqual(BK.shortOf([{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }], { milk: 1, honey: 3 }), [{ id: 'milk', n: 2 }]);
  const crops = ['milk', 'milk', { type: 'milk', rare: 'big' }, 'egg', 'honey', 'honey'], keep = crops.map(() => false);
  const left = BK.reserve(crops, [{ id: 'milk', n: 3 }, { id: 'honey', n: 2 }], keep, it => it && it.type);
  assert.deepStrictEqual(keep, [true, true, true, false, true, true]);
  assert.deepStrictEqual(left, { milk: 0, honey: 0 });
});
ok('v5.11.0.26: valid() keeps short append-only; a new day clears it; autobuy still never buys town / hall / inn / resort / festival items', () => {
  const v = BK.valid({ last: 9, offer: [{ id: 'o0', need: [{ id: 'milk', n: 3 }] }], take: 'o0', short: ['milk', 'nope', 'honey'] });
  assert.deepStrictEqual(v.short, ['milk', 'honey']);
  const plain = BK.valid({ last: 9, offer: [{ id: 'o0', need: [{ id: 'egg', n: 2 }] }], take: 'o0' });
  assert.ok(!('short' in plain), 'missing short stays omitted');
  BK.roll(v, 10); assert.ok(!v.short, 'a new day drops yesterday\'s short');
  const ban = ['town', 'hall', 'shop', 'inn', 'inn2', 'cabin', 'diner', 'kitchen', 'resort', 'hut', 'parasol', 'pier', 'deck',
    'smithy', 'school', 'library', 'clinic', 'cottage', 'gravel', 'party', 'festival', 'h1', 'h2', 'h3', 'h4', 'h5', 'L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'roof'];
  for (const id of ban) assert.ok(!SIM.AUTO_BUY.includes(id), id + ' must stay off 家人帮忙添置');
});
ok('v5.11.0.26: addCount treats ready 0 as 0, not 1; a new day clears skip; autoTake leaves a skipped order alone', () => {
  const c = {};
  BK.addCount(c, 'honey'); BK.addCount(c, 'honey', 0); BK.addCount(c, 'flour', 0); BK.addCount(c, 'cheese', 0); BK.addCount(c, 'apple_pie', 0);
  BK.addCount(c, 'honey', 0); BK.addCount(c, 'honey', 0); BK.addCount(c, 'honey', 0); BK.addCount(c, 'honey', 0); BK.addCount(c, 'honey', 0);
  assert.deepStrictEqual(c, { honey: 1, flour: 0, cheese: 0, apple_pie: 0 });
  assert.ok(!BK.have([{ id: 'apple_pie', n: 1 }, { id: 'honey', n: 2 }], c), 'empty workshops and hives must not look fillable');
  BK.addCount(c, 'honey', 2); BK.addCount(c, 'apple_pie', 1);
  assert.ok(BK.have([{ id: 'apple_pie', n: 1 }, { id: 'honey', n: 2 }], c));
  const v = BK.valid({ last: 9, offer: [{ id: 'o0', need: [{ id: 'honey', n: 2 }] }], take: 'o0', skip: 1 });
  assert.strictEqual(v.skip, 1); assert.strictEqual(BK.taken(v), null);
  const plain = BK.valid({ last: 9, offer: [{ id: 'o0', need: [{ id: 'egg', n: 2 }] }], take: 'o0' });
  assert.ok(!('skip' in plain), 'missing skip stays omitted');
  BK.autoTake(v, { honey: 9 }, BK.payOf); assert.strictEqual(v.take, 'o0', 'skip blocks auto on the failed order');
  BK.roll(v, 10); assert.ok(!v.skip, 'a new day drops yesterday\'s skip'); assert.strictEqual(v.take, null);
});
console.log('bakery-test: ' + n + ' ok');
