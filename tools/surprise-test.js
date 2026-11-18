// Node unit tests for field surprises: glow, giant 2×2 merge, prices, cat gifts, planting bias, save extras.
'use strict';
const assert = require('assert');
const SU = require('../surprise.js');
const SIM = require('../sim.js');
const SAVE = require('../save.js');

const ripe = SIM.ripe;
function tile(f, c, r, crop) {
  return { f, c, r, open: true, tilled: true, watered: false, crop: crop && Object.assign({ n: 0, rot: 0, stage: 3 }, crop) };
}
function block(type, age) {
  const a = age != null ? age : SIM.CROPS[type].days;
  return [
    tile('home', 0, 0, { type, age: a }), tile('home', 1, 0, { type, age: a }),
    tile('home', 0, 1, { type, age: a }), tile('home', 1, 1, { type, age: a })
  ];
}
function seq(vals) { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; }
function always(v) { return () => v; }

let n = 0;
function test(name, fn) { fn(); n++; }

test('glow rolls only on newly listed ripe crops and multiplies the price', () => {
  const tiles = [
    tile('home', 0, 0, { type: 'pumpkin', age: 4 }),
    tile('home', 1, 0, { type: 'pumpkin', age: 3 }), // not ripe
    tile('home', 2, 0, { type: 'carrot', age: 1, glow: 1 }) // already glowing
  ];
  const got = SU.rollGlow(tiles, ripe, always(0)); // 0 < 0.02 → always glow
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].c, 0);
  assert.strictEqual(tiles[0].crop.glow, 1);
  assert.strictEqual(tiles[1].crop.glow, undefined);
  assert.strictEqual(SU.priceOf({ type: 'pumpkin', glow: 1 }, 85), 85 * 3);
  assert.strictEqual(SU.priceOf('pumpkin', 85), 85);
});

test('a ripe 2×2 of pumpkin / cabbage / watermelon can merge; carrot never does', () => {
  const pump = block('pumpkin');
  assert.ok(SU.eligibleBlock(pump, ripe));
  const merged = SU.rollGiant(pump, ripe, always(0)); // 0 < 0.12
  assert.strictEqual(merged.length, 1);
  assert.ok(pump[0].crop.giant);
  assert.strictEqual(pump[1].crop.giantOf.c, 0);
  assert.strictEqual(pump[2].crop.giantOf.r, 0);
  assert.strictEqual(pump[3].crop.giantOf.f, 'home');
  assert.ok(SU.canHarvest(pump[0].crop, ripe));
  assert.ok(!SU.canHarvest(pump[1].crop, ripe));
  assert.ok(!SU.canGrow(pump[0].crop, ripe));
  const item = SU.harvestItem(pump[0].crop);
  assert.strictEqual(item.giant, 1);
  assert.strictEqual(SU.priceOf(item, 85), 85 * 6);
  assert.ok(!SU.eligibleBlock(block('carrot'), ripe));
  assert.strictEqual(SU.rollGiant(block('carrot'), ripe, always(0)).length, 0);
});

test('glow on any tile of a block is inherited by the giant', () => {
  const g = block('cabbage');
  g[2].crop.glow = 1;
  SU.mergeBlock(g);
  assert.strictEqual(g[0].crop.glow, 1);
  assert.strictEqual(SU.priceOf(SU.harvestItem(g[0].crop), 30), 30 * 3 * 6);
});

test('overlapping 2×2 blocks merge at most one group', () => {
  // 2×3 ripe pumpkins: two overlapping 2×2. One merge consumes 4, leaving no second block.
  const tiles = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) tiles.push(tile('home', c, r, { type: 'pumpkin', age: 4 }));
  const found = SU.rollGiant(tiles, ripe, always(0));
  assert.strictEqual(found.length, 1);
  const giants = tiles.filter(t => t.crop && t.crop.giant).length;
  const parts = tiles.filter(t => t.crop && t.crop.giantOf).length;
  assert.strictEqual(giants, 1);
  assert.strictEqual(parts, 3);
});

test('clearGiant removes all four tiles', () => {
  const g = block('watermelon');
  SU.mergeBlock(g);
  SU.clearGiant(g[0], g);
  assert.ok(g.every(t => t.crop == null));
});

test('special eggs and truffles have higher value and a toast', () => {
  const gold = SU.rollProduct('egg', seq([0, 0])); // first roll < gold chance
  assert.deepStrictEqual(gold, { type: 'egg', rare: 'gold' });
  assert.strictEqual(SU.priceOf(gold, 10), 50);
  assert.strictEqual(SU.productToast(gold).kind, 'gold-egg');
  const dbl = SU.rollProduct('egg', seq([1, 0])); // skip gold, take double
  assert.deepStrictEqual(dbl, { type: 'egg', rare: 'double' });
  assert.strictEqual(SU.priceOf(dbl, 10), 20);
  const white = SU.rollProduct('truffle', seq([0, 0]));
  assert.deepStrictEqual(white, { type: 'truffle', rare: 'white' });
  assert.strictEqual(SU.priceOf(white, 45), 180);
  const big = SU.rollProduct('truffle', seq([1, 0]));
  assert.deepStrictEqual(big, { type: 'truffle', rare: 'big' });
  assert.strictEqual(SU.priceOf(big, 45), 90);
  assert.strictEqual(SU.rollProduct('egg', always(1)), 'egg');
  assert.strictEqual(SU.rollProduct('wool', always(0)), 'wool');
});

test('cat gifts sometimes swap a carrot for a shop-only seed', () => {
  const none = SU.catGifts(3, always(1));
  assert.strictEqual(none.add.carrot, 3);
  assert.deepStrictEqual(none.rare, []);
  const all = SU.catGifts(2, always(0)); // 0 < 0.18, then 0 picks first shop seed
  assert.strictEqual(all.add.strawberry, 2);
  assert.deepStrictEqual(all.rare, ['strawberry', 'strawberry']);
  assert.ok(!all.add.carrot);
});

test('planting lightly prefers completing a 2×2 of the same chunky crop', () => {
  const tiles = [
    tile('home', 0, 0, { type: 'pumpkin', age: 1 }),
    tile('home', 1, 0, null),
    tile('home', 0, 1, null),
    tile('home', 2, 2, null)
  ];
  tiles[1].crop = tiles[2].crop = tiles[3].crop = null;
  const bag = { pumpkin: 2, carrot: 5 };
  const empty = tiles.filter(t => !t.crop);
  assert.ok(SU.plantScore(tiles[1], tiles, bag) > SU.plantScore(tiles[3], tiles, bag));
  const pick = SU.pickPlantTile(empty, tiles, bag, always(0)); // 0 < 0.7 → biased
  assert.ok(pick === tiles[1] || pick === tiles[2], 'should plant beside the pumpkin');
  assert.strictEqual(SU.pickSeed(tiles[1], tiles, bag, () => 'carrot'), 'pumpkin');
});

test('validate keeps glow / giant fields and basket objects, drops junk, keeps old strings', () => {
  const s = SAVE.read ? null : null;
  const base = SAVE.validate({
    saveVersion: 9, gameVersion: '5.1', createdAt: 1, savedAt: 2, rng: 1,
    clock: { day: 4, t: 400 }, coins: 10,
    tiles: [
      { f: 'home', c: 0, r: 0, open: true, tilled: true, crop: { type: 'pumpkin', age: 4, n: 0, rot: 1, glow: 1, giant: 1 } },
      { f: 'home', c: 1, r: 0, open: true, tilled: true, crop: { type: 'pumpkin', age: 4, n: 0, rot: 1, giantOf: { f: 'home', c: 0, r: 0 } } }
    ],
    inventory: { basket: ['carrot', { type: 'pumpkin', giant: 1, glow: 1 }, { type: 'egg', rare: 'gold' }, { type: 'egg', rare: 'nope' }, '???'] }
  });
  assert.strictEqual(base.saveVersion, SAVE.CURRENT);
  assert.strictEqual(base.tiles[0].crop.glow, 1);
  assert.strictEqual(base.tiles[0].crop.giant, 1);
  assert.deepStrictEqual(base.tiles[1].crop.giantOf, { f: 'home', c: 0, r: 0 });
  assert.ok(base.inventory.basket.includes('carrot'));
  const giant = base.inventory.basket.find(k => k && k.giant);
  assert.ok(giant && giant.type === 'pumpkin' && giant.glow === 1);
  const gold = base.inventory.basket.find(k => k && k.rare === 'gold');
  assert.ok(gold && gold.type === 'egg');
  assert.ok(!base.inventory.basket.some(k => k && k.rare === 'nope'));
  assert.ok(!base.inventory.basket.includes('???'));
});

test('expected extra income from published rates stays under 10%', () => {
  // early: 12 carrots a day, glow only
  const earlyExtra = 12 * SU.GLOW_CHANCE * (SU.GLOW_MULT - 1) * 8;
  assert.ok(earlyExtra / 96 < 0.10, 'early extra ' + (earlyExtra / 96).toFixed(3));
  // mid: ~24 tiles, mixed crops (~240g/day), a ripe chunky 2×2 every 4 days, 3 eggs and 0.5 truffle
  const glow = 10 * SU.GLOW_CHANCE * (SU.GLOW_MULT - 1) * 30;
  const giant = (SU.GIANT_CHANCE / 4) * (SU.GIANT_MULT - 4) * 85;
  const egg = 3 * (SU.EGG.gold.chance * 10 * (SU.EGG.gold.mult - 1) + SU.EGG.double.chance * 10 * (SU.EGG.double.mult - 1));
  const tru = 0.5 * (SU.TRUFFLE.white.chance * 45 * (SU.TRUFFLE.white.mult - 1) + SU.TRUFFLE.big.chance * 45 * (SU.TRUFFLE.big.mult - 1));
  const extra = glow + giant + egg + tru, earn = 240 + 30 + 22;
  assert.ok(extra / earn < 0.10, 'mid extra ' + (extra / earn).toFixed(3) + ' of income');
});

console.log(n + ' passed');
