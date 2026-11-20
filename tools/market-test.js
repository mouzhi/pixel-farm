// Unit tests for v5.10.3 (market.js: 集市 — the stalls, market days, the 抢手货, prices, 「我来挑」, saved inside town.hall):  node tools/market-test.js
const assert = require('assert');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const TN = require('../town.js'), HL = require('../hall.js'), MK = require('../market.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const overlap = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
const rectOf = b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd];
const built = () => { const st = HL.empty(); for (const id of ['L5', 'L8', 'L11']) { HL.start(st, id, 40); HL.finish(st, 41); } return st; };

ok('the market is a board project: 30,000 金 + 200 木材, needs 繁荣度 2 (three houses first)', () => {
  const st = HL.empty(), rich = { open: true, coins: 1e6, wood: 999 }, p = HL.PROJ.market;
  assert.strictEqual(p.cost, 30000); assert.strictEqual(p.wood, 200); assert.strictEqual(p.lv, 2);
  assert(/繁荣度到 2/.test(HL.canStart(st, 'market', rich)));
  const b = built(); assert.strictEqual(HL.canStart(b, 'market', { open: true, coins: 29999, wood: 999 }), '金币不够');
  assert.strictEqual(HL.canStart(b, 'market', { open: true, coins: 30000, wood: 199 }), '木材不够');
  assert.strictEqual(HL.canStart(b, 'market', { open: true, coins: 30000, wood: 200 }), null);
  HL.start(b, 'market', 50); assert.strictEqual(HL.finish(b, 51), 'market'); assert(MK.built(b)); assert.strictEqual(HL.prosperity(b), 2);
  assert.strictEqual(HL.blocks(b).length, 4 + MK.STALLS.length, 'the stalls are solid');
});
ok('six stalls round the bigger square: in town, clear of buildings, lots, the fountain, streets, benches, props, gifts and each other', () => {
  assert.strictEqual(MK.STALLS.length, 6); const rs = MK.STALLS.map(s => [s.id, [s.x - MK.HW, s.y - MK.HD, s.x + MK.HW, s.y + MK.HD]]);
  const others = TN.BUILDINGS.map(b => [b.id, rectOf(b)]).concat(HL.LOTS.map(l => [l.id, rectOf(l)]), [['board', [HL.BOARD.x - 3, HL.BOARD.y - 1, HL.BOARD.x + 3, HL.BOARD.y + 1]]]);
  const P = TN.PLAZA, things = HL.GIFT_SPOTS.concat(HL.PROPS.map(([, x, y]) => ({ x, y })), [{ x: P.x - 10, y: P.y + 14 }, { x: P.x + 14, y: P.y - 10 }]);
  for (const [id, r] of rs) { assert(TN.inRect(r[0], r[1], TN.RECT) && TN.inRect(r[2], r[3], TN.RECT), id);
    for (const [oid, o] of others) assert(!overlap(r, o, 1), id + ' / ' + oid);
    assert(!overlap(r, [P.x - 6, P.y - 6, P.x + 6, P.y + 6]), id + ' off the fountain');
    assert(!overlap(r, [440, 62, 640, 70]), id + ' off the main street'); assert(!overlap(r, [521, 66, 527, 140]), id + ' off the south street');
    for (const t of things) assert(!TN.inRect(t.x, t.y, r, 3), id + ' on ' + JSON.stringify(t));
    const at = MK.standAt(MK.STALL[id]); assert(TN.inTown(at.x, at.y)); for (const [, o] of others) assert(!TN.inRect(at.x, at.y, o), id + ' seller spot'); }
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) assert(!overlap(rs[i][1], rs[j][1], 3), rs[i][0] + ' / ' + rs[j][0]);
  assert.strictEqual(MK.STALLS.filter(s => s.who === 'farm').length, 1);
});
ok('market days: every 7th day after it is built, 7:00–16:00; the next one; nothing before it is built', () => {
  const b = built(); assert.strictEqual(MK.isDay(b, 56), false); assert.strictEqual(MK.nextDay(b, 56), null);
  HL.start(b, 'market', 55); HL.finish(b, 56);
  assert.strictEqual(MK.isDay(b, 56), false, 'not the day it opens'); assert.strictEqual(MK.nextDay(b, 56), 63); assert(MK.isDay(b, 63)); assert(!MK.isDay(b, 64)); assert(MK.isDay(b, 70));
  assert.strictEqual(MK.nextDay(b, 63), 63); assert.strictEqual(MK.nextDay(b, 64), 70);
  assert(MK.open(b, 63, 7 * 60)); assert(!MK.open(b, 63, 16 * 60)); assert(!MK.open(b, 63, 6 * 60 + 59));
  const days = Array.from({ length: 70 }, (_, i) => i + 57).filter(d => MK.isDay(b, d)); assert.strictEqual(days.length, 10);
});
ok('prices: 15% over the stall, the day\'s 抢手货 30%; the hot kind turns over between market days', () => {
  const d = 63, hot = MK.hot(d), other = MK.KINDS.find(k => k.id !== hot).id;
  assert.strictEqual(MK.price(100, other, d), 115); assert.strictEqual(MK.price(100, hot, d), 130);
  const hots = new Set(Array.from({ length: 10 }, (_, i) => MK.hot(7 * (i + 9)))); assert(hots.size >= 3, [...hots].join());
  const f = { fish: t => t === 'carp', fruit: t => t === 'apple', animal: t => t === 'egg', good: t => t === 'jam' };
  assert.deepStrictEqual(['carp', 'apple', 'egg', 'jam', 'carrot'].map(t => MK.kindOf(t, f)), ['fish', 'fruit', 'animals', 'goods', 'crops']);
});
ok('「我来挑」: automatic takes everything; picked mode only the ticked kinds', () => {
  const M = MK.empty(); for (const k of MK.KINDS) assert(MK.takes(M, k.id));
  M.take.fish = 0; assert(MK.takes(M, 'fish'), 'automatic ignores the ticks'); M.pick = 1; assert(!MK.takes(M, 'fish')); assert(MK.takes(M, 'crops'));
});
ok('neighbours who keep a stall stand at it on market day 8:00–15:30, otherwise their usual day', () => {
  const b = built(); HL.start(b, 'market', 55); HL.finish(b, 56);
  const zhou = TN.NEIGHBOURS.find(q => q.id === 'n0'), mei = HL.NEIGHBOURS.find(q => q.id === 'n5');
  assert.strictEqual(HL.marketAt(b, zhou, 63, 9 * 60).spot, 'stall:s1'); assert.strictEqual(HL.marketAt(b, mei, 63, 9 * 60).spot, 'stall:s4');
  assert.strictEqual(HL.marketAt(b, zhou, 64, 9 * 60), null); assert.strictEqual(HL.marketAt(b, zhou, 63, 16 * 60), null);
  assert.strictEqual(HL.marketAt(b, HL.NEIGHBOURS.find(q => q.id === 'n4'), 63, 9 * 60), null, 'the mayor has no stall');
});
ok('valid(): junk in, a clean market out; old halls gain an automatic market', () => {
  assert.deepStrictEqual(MK.valid(null), MK.empty()); assert.deepStrictEqual(HL.valid({ built: { L5: 3 } }).market, MK.empty());
  const v = MK.valid({ pick: 'yes', take: { fish: 0, bogus: 1 }, days: -3, gold: 1.6, extra: 'x', last: 9 });
  assert.deepStrictEqual(v, { pick: 1, take: { crops: 1, fruit: 1, animals: 1, fish: 0, goods: 1 }, days: 0, gold: 2, extra: 0, last: 9 });
});
console.log('market-test: ' + n + ' ok');
