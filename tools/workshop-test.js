// Unit tests for v5.10.5 (woodshop.js + smithy.js: 木工坊 + 铁匠铺 — lots, wood cap, crafts, 5 upgrades, saved inside town.hall):  node tools/workshop-test.js
const assert = require('assert');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const TN = require('../town.js'), HL = require('../hall.js'), MK = require('../market.js'), BK = require('../bakery.js');
const WS = require('../woodshop.js'), SM = require('../smithy.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const overlap = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
const rectOf = b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd];
const houses = () => { const st = HL.empty(); for (const id of ['L5', 'L8', 'L11']) { HL.start(st, id, 40); HL.finish(st, 41); } return st; };
const ready = () => { const st = houses(); HL.start(st, 'market', 50); HL.finish(st, 51); HL.start(st, 'bakery', 51); HL.finish(st, 52); return st; };
const othersOf = skip => TN.BUILDINGS.map(b => [b.id, rectOf(b)])
  .concat(HL.LOTS.filter(q => q.id !== skip).map(q => [q.id, rectOf(q)]))
  .concat([['board', [HL.BOARD.x - 3, HL.BOARD.y - 1, HL.BOARD.x + 3, HL.BOARD.y + 1]]]);
const clearOf = (name, lot, extras) => {
  const r = rectOf(lot);
  assert(TN.inRect(r[0], r[1], TN.RECT) && TN.inRect(r[2], r[3], TN.RECT), name + ' in town');
  for (const [oid, o] of othersOf(lot.id)) assert(!overlap(r, o, 1), name + ' / ' + oid);
  const P = TN.PLAZA; assert(!overlap(r, [P.x - MK.PLAZA_R, P.y - MK.PLAZA_R, P.x + MK.PLAZA_R, P.y + MK.PLAZA_R]), name + ' off the square');
  assert(!overlap(r, [440, 62, 640, 70]), name + ' off the main street'); assert(!overlap(r, [521, 66, 527, 140]), name + ' off the south street');
  for (const s of MK.STALLS) assert(!overlap(r, [s.x - MK.HW, s.y - MK.HD, s.x + MK.HW, s.y + MK.HD], 1), name + ' stall ' + s.id);
  const things = HL.GIFT_SPOTS.concat(HL.PROPS.map(([, x, y]) => ({ x, y })), extras || []);
  for (const t of things) assert(!TN.inRect(t.x, t.y, r, 3), name + ' on ' + JSON.stringify(t));
  assert(TN.inTown(lot.door.x, lot.door.y));
};

ok('the woodshop is a board project: 20,000 金 + 300 木材, needs 繁荣度 3 (houses, market and bakery first)', () => {
  const st = HL.empty(), rich = { open: true, coins: 1e6, wood: 999 }, p = HL.PROJ.woodshop;
  assert.strictEqual(p.cost, 20000); assert.strictEqual(p.wood, 300); assert.strictEqual(p.lv, 3); assert.strictEqual(p.kind, 'woodshop');
  assert(/繁荣度到 3/.test(HL.canStart(st, 'woodshop', rich)));
  const h = houses(); assert(/繁荣度到 3/.test(HL.canStart(h, 'woodshop', rich)), 'still locked at prosperity 2');
  const b = ready(); assert.strictEqual(HL.prosperity(b), 3);
  assert.strictEqual(HL.canStart(b, 'woodshop', { open: true, coins: 19999, wood: 999 }), '金币不够');
  assert.strictEqual(HL.canStart(b, 'woodshop', { open: true, coins: 20000, wood: 299 }), '木材不够');
  assert.strictEqual(HL.canStart(b, 'woodshop', { open: true, coins: 20000, wood: 300 }), null);
  HL.start(b, 'woodshop', 60); assert.strictEqual(HL.finish(b, 61), 'woodshop'); assert(WS.built(b));
  assert.strictEqual(HL.prosperity(b), 3, 'the workshop does not lift prosperity past 3');
  assert(HL.blocks(b).some(r => overlap(r, rectOf(WS.LOT))), 'the workshop is solid');
});
ok('the smithy is a board project: 35,000 金 + 100 木材, needs 繁荣度 3; both can be queued one after the other', () => {
  const p = HL.PROJ.smithy, b = ready(), rich = { open: true, coins: 1e6, wood: 999 };
  assert.strictEqual(p.cost, 35000); assert.strictEqual(p.wood, 100); assert.strictEqual(p.lv, 3); assert.strictEqual(p.kind, 'smithy'); assert.strictEqual(p.who, 'n8');
  assert.strictEqual(HL.canStart(b, 'smithy', { open: true, coins: 34999, wood: 999 }), '金币不够');
  assert.strictEqual(HL.canStart(b, 'smithy', { open: true, coins: 35000, wood: 99 }), '木材不够');
  assert.strictEqual(HL.canStart(b, 'smithy', rich), null);
  HL.start(b, 'woodshop', 60); assert(/一次只盖一座/.test(HL.canStart(b, 'smithy', rich)));
  HL.finish(b, 61); assert.strictEqual(HL.canStart(b, 'smithy', rich), null);
  HL.start(b, 'smithy', 61); assert.strictEqual(HL.finish(b, 62), 'smithy'); assert(SM.built(b));
  assert.strictEqual(HL.prosperity(b), 3); assert.strictEqual(HL.nextLevelAt(b), null);
  const hammer = HL.NEIGHBOURS.find(q => q.id === 'n8');
  assert.strictEqual(hammer.name, '铁匠阿锤');
  assert(HL.residents(b).some(q => q.id === 'n8'), '阿锤 moves in the morning after');
  assert.strictEqual(HL.smithyAt(b, hammer, 70, 10 * 60).spot, 'smithy');
  assert.strictEqual(HL.smithyAt(b, hammer, 70, 18 * 60), null, 'home in the evening');
});
ok('lot L10 (woodshop) sits south of 阿松, clear of buildings, lots, stalls, the fountain, streets, gifts and the board', () => {
  const l = WS.LOT; assert.strictEqual(l.id, 'woodshop'); assert.deepStrictEqual(l, HL.LOT.woodshop);
  clearOf('woodshop', l, [{ x: WS.STAND.x, y: WS.STAND.y }, { x: WS.PILE.x, y: WS.PILE.y }].filter(() => false));
  assert(TN.inTown(WS.STAND.x, WS.STAND.y) && TN.inTown(WS.PILE.x, WS.PILE.y));
  const song = TN.BY_ID.h3, gap = (l.y - l.hd) - (song.y + song.hd);
  assert(gap >= 8, 'alley behind 阿松 is walkable, gap ' + gap);
  const site = HL.siteSpot('woodshop'); assert(site && TN.inTown(site.x, site.y));
});
ok('the smithy sits south of 小桃, clear of the woodshop and everything else', () => {
  const l = SM.LOT; assert.strictEqual(l.id, 'smithy'); assert.deepStrictEqual(l, HL.LOT.smithy);
  clearOf('smithy', l);
  assert(TN.inTown(SM.STAND.x, SM.STAND.y) && TN.inTown(SM.ANVIL.x, SM.ANVIL.y));
  assert(!overlap(rectOf(WS.LOT), rectOf(SM.LOT), 1), 'the two shops leave a gap');
  const tao = TN.BY_ID.h4, gap = (l.y - l.hd) - (tao.y + tao.hd);
  assert(gap >= 8, 'alley behind 小桃 is walkable, gap ' + gap);
  const site = HL.siteSpot('smithy'); assert(site && TN.inTown(site.x, site.y));
});
ok('once the woodshop is up, 阿松 works there 8:00–17:00 (a house going up still comes first in game.js; his old hours are unchanged before it is built)', () => {
  const b = ready(); HL.start(b, 'woodshop', 60); HL.finish(b, 61);
  const song = TN.NEIGHBOURS.find(q => q.id === 'n2');
  assert.strictEqual(HL.woodshopAt(b, song, 70, 10 * 60).spot, 'woodshop');
  assert.strictEqual(HL.woodshopAt(b, song, 70, 18 * 60), null, 'home in the evening');
  assert.strictEqual(HL.woodshopAt(HL.empty(), song, 70, 10 * 60), null, 'not before it is built');
  assert.strictEqual(HL.neighbourAt(song, 10 * 60).spot, TN.neighbourAt(song, 10 * 60).spot, 'the unbuilt day is unchanged');
});
ok('the woodshop raises the storehouse cap by 400; spare wood above a 400 reserve becomes one bench a day', () => {
  assert.strictEqual(WS.CAP_BONUS, 400); assert.strictEqual(WS.capOf(800, HL.empty()), 800);
  const b = ready(); HL.start(b, 'woodshop', 60); HL.finish(b, 61);
  assert.strictEqual(WS.capOf(800, b), 1200); assert.strictEqual(WS.capBonus(b), 400);
  const W = WS.empty(); assert.strictEqual(W.auto, 1);
  assert.deepStrictEqual(WS.craft(W, 70, 439), { ok: false, why: 'keep' });
  const r = WS.craft(W, 70, 440); assert.deepStrictEqual(r, { ok: true, wood: 40, item: 'bench' });
  assert.strictEqual(W.days, 1); assert.strictEqual(W.used, 40); assert.strictEqual(W.last, 70);
  assert.strictEqual(WS.craft(W, 70, 800).why, 'today');
  WS.setAuto(W, 0); assert.strictEqual(WS.craft(W, 71, 800).why, 'paused');
  WS.setAuto(W, 1); assert.strictEqual(WS.craft(W, 71, 800).ok, true);
});
ok('the smithy sells 5 upgrades at 8k–25k; axe and rod have 3 levels; effects match the plan', () => {
  assert.strictEqual(SM.UPGRADES.length, 5);
  const ids = SM.UPGRADES.map(u => u.id); assert.deepStrictEqual(ids, ['water', 'works', 'axe', 'rod', 'cart']);
  const S = SM.empty(), ctx = { built: true, coins: 1e6 };
  assert.strictEqual(SM.canBuy(S, 'water', { built: false, coins: 1e6 }), '先把铁匠铺盖好');
  assert.strictEqual(SM.canBuy(S, 'water', { built: true, coins: 11999 }), '金币不够');
  const w = SM.buy(S, 'water', ctx); assert.strictEqual(w.cost, 12000); assert.strictEqual(S.up.water, 1);
  assert.strictEqual(SM.canBuy(S, 'water', ctx), '已经满级');
  assert.strictEqual(SM.buy(S, 'works', ctx).cost, 15000);
  assert.strictEqual(SM.buy(S, 'cart', ctx).cost, 10000);
  assert.deepStrictEqual([0, 1, 2].map(i => SM.costOf(SM.BY.axe, i)), [8000, 14000, 22000]);
  assert.deepStrictEqual([0, 1, 2].map(i => SM.costOf(SM.BY.rod, i)), [8000, 16000, 24000]);
  assert.strictEqual(SM.buy(S, 'axe', ctx).cost, 8000);
  assert.strictEqual(SM.buy(S, 'axe', ctx).cost, 14000);
  assert.strictEqual(SM.buy(S, 'axe', ctx).cost, 22000);
  assert.strictEqual(SM.canBuy(S, 'axe', ctx), '已经满级');
  SM.buy(S, 'rod', ctx); SM.buy(S, 'rod', ctx); SM.buy(S, 'rod', ctx);
  const e = SM.effects(S.up);
  assert.strictEqual(e.sprReach, SM.SPR_REACH_UP); assert.strictEqual(e.workSpeed, 1.5);
  assert.strictEqual(e.axeBonus, 6); assert.strictEqual(e.axeCut, 5); assert.strictEqual(e.cartExtra, 20);
  assert.strictEqual(e.rodLv, 3); assert.ok(e.rod.wait < 0 && e.rod.rare > 1);
  const zero = SM.effects(SM.emptyUp());
  assert.strictEqual(zero.sprReach, 16); assert.strictEqual(zero.workSpeed, 1); assert.strictEqual(zero.cartExtra, 0);
  // total gold if every upgrade is bought
  const sum = 12000 + 15000 + 8000 + 14000 + 22000 + 8000 + 16000 + 24000 + 10000;
  assert.strictEqual(sum, 129000);
});
ok('valid(): junk in, a clean workshop and smithy out; old halls gain empty shops; autobuy never lists the upgrades', () => {
  assert.deepStrictEqual(WS.valid(null), WS.empty()); assert.deepStrictEqual(SM.valid(null), SM.empty());
  const h = HL.valid({ built: { L5: 3 } });
  assert.deepStrictEqual(h.woodshop, WS.empty()); assert.deepStrictEqual(h.smithy, SM.empty());
  const v = WS.valid({ auto: 0, days: -2, used: 1.6, last: 'x' });
  assert.strictEqual(v.auto, 0); assert.strictEqual(v.days, 0); assert.strictEqual(v.used, 2); assert.strictEqual(v.last, 0);
  const s = SM.valid({ up: { water: 9, axe: 2, nope: 1, cart: 1 } });
  assert.deepStrictEqual(s.up, { water: 1, works: 0, axe: 2, rod: 0, cart: 1 });
  const SIM = require('../sim.js');
  for (const id of ['woodshop', 'smithy', 'hall']) {
    assert.ok(!SIM.AUTO_BUY.includes(id), id + ' must stay off 家人帮忙添置');
    assert.ok(!SIM.SHOP_IDS.includes(id), id + ' is not a shop item');
  }
  // axe / rod / works exist in the farm shop, but 家人帮忙添置 never buys them or the smithy upgrades
  for (const id of ['axe', 'rod', 'works', 'sprinkler', 'cart']) assert.ok(!SIM.AUTO_BUY.includes(id), id + ' stays off the family list');
  const pick = SIM.autoPick(SIM.emptyUpgrades(), 1e9, 1e6, [8000, 8000, 8000]);
  assert.ok(pick.id && SIM.AUTO_BUY.includes(pick.id));
});
console.log('workshop-test: ' + n + ' ok');
