// v5.10.3 yard / stall / animal-care things (yard.js): prices from docs/economy-rebalance.md 6.2, the shop, effects, save state
'use strict';
const assert = require('assert');
const YD = require('../yard.js'), SIM = require('../sim.js'), SAVE = require('../save.js'), AN = require('../animals.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };

ok('catalogue: the doc prices and limits', () => {
  const want = { gravel: [40, 20], mailbox: [120, 1], clothesline: [150, 1], flowerbed: [200, 4], vegfence: [30, 20], curtains: [180, 1], lantern: [260, 1], roof: [300, 3], flag: [150, 20],
    awning: [300, 1], scale: [200, 1], sign: [400, 1], vase: [120, 1], straw: [200, 1], catbed: [150, 3], doghouse: [250, 3], brush: [300, 1], saltlick: [400, 3] };
  assert.deepStrictEqual(Object.keys(want).sort(), YD.IDS.slice().sort());
  for (const [id, [cost, max]] of Object.entries(want)) { assert.strictEqual(YD.ITEM[id].cost, cost, id); assert.strictEqual(YD.ITEM[id].max, max, id); }
  assert.strictEqual(YD.ITEM.vegfence.wood, 1); assert.strictEqual(YD.ITEM.flag.wood, 2); assert.strictEqual(YD.ITEM.sign.wood, 10);
  assert.deepStrictEqual([0, 1, 2].map(i => YD.costAt(YD.ITEM.roof, i)), [300, 100, 100]);
  assert.strictEqual(YD.ITEM.vegfence.needs, 'axe'); assert.strictEqual(YD.ITEM.flag.needs, 'house');
});
ok('shop: one 「院子」 tab, the family never buys them, wood for the fence and flagstones', () => {
  const tab = SIM.SHOP_TABS.find(t => t.id === 'yard'); assert(tab); assert.deepStrictEqual(tab.ids, YD.IDS);
  for (const id of YD.IDS) { assert(SIM.shopItem(id).yard, id); assert(!SIM.AUTO_BUY.includes(id), id + ' is not auto-bought'); }
  const up = SIM.emptyUpgrades(); assert.strictEqual(SIM.offer(up, 1e6, 'vegfence').locked, 'axe');
  assert.strictEqual(SIM.offer(Object.assign({}, up, { axe: 1 }), 1e6, 'vegfence', 0).ok, false); // a bit of wood too
  assert.strictEqual(SIM.offer(Object.assign({}, up, { axe: 1 }), 1e6, 'vegfence', 1).ok, true);
  assert.strictEqual(SIM.offer(up, 40, 'gravel').ok, true); assert.strictEqual(SIM.offer(Object.assign({}, up, { gravel: 20 }), 1e6, 'gravel').maxed, true);
});
ok('spots: every piece has its own place, none on top of another', () => {
  const pens = { sty: { x: 200, y: 20 }, fold: { x: 260, y: 30 }, shed: { x: 300, y: 10 } }, all = [];
  for (const it of YD.ITEMS) for (let i = 0; i < it.max; i++) { const p = YD.spotOf(it.id, i, pens); if (it.id === 'curtains' || it.id === 'roof') continue; assert(p, it.id + i); all.push([it.id + i, p]); }
  assert.strictEqual(YD.PIECES.length, 20); assert.strictEqual(YD.FENCE.length, 20);
  const solo = all.filter(([k]) => !/^(gravel|flag|vegfence)/.test(k));
  for (let i = 0; i < solo.length; i++) for (let j = i + 1; j < solo.length; j++) assert(Math.hypot(solo[i][1].x - solo[j][1].x, solo[i][1].y - solo[j][1].y) >= 5, solo[i][0] + ' / ' + solo[j][0]);
  assert.strictEqual(YD.room('catbed', { cats: 2 }), 2); assert.strictEqual(YD.room('doghouse', { dogs: 0 }), 0); assert.strictEqual(YD.room('saltlick', { pens: { sty: {}, shed: {} } }), 2);
});
ok('effects: stall +2% each, path speed, the fence halves the field clutter, pens and honey', () => {
  assert.strictEqual(YD.stallMult({}), 1); assert.strictEqual(+YD.stallMult({ awning: 1, scale: 1, sign: 1, vase: 1 }).toFixed(3), 1.06);
  assert.strictEqual(YD.paveAt({}, 40, 54), null); assert.strictEqual(YD.paveAt({ gravel: 3 }, 40, 54), 'gravel'); assert.strictEqual(YD.paveAt({ gravel: 3 }, 80, 54), null);
  assert.strictEqual(YD.paveAt({ gravel: 20, flag: 2 }, 36, 44), 'flag'); assert.strictEqual(YD.paveAt({ gravel: 20, flag: 2 }, 80, 54), 'gravel');
  assert.strictEqual(YD.walkMult('gravel'), 1.05); assert.strictEqual(YD.walkMult('flag'), 1.1); assert.strictEqual(YD.walkMult(null), 1);
  assert.strictEqual(YD.clutterMult({}), 1); assert.strictEqual(YD.clutterMult({ vegfence: 20 }), 0.5); assert.strictEqual(YD.clutterMult({ vegfence: 10 }), 0.75);
  assert.deepStrictEqual(YD.penBonus({ straw: 1, saltlick: 1 }, { fold: {}, shed: {} }), { coop: 3, fold: 2 });
  assert.strictEqual(+YD.honeyExtra({ flowerbed: 4 }).toFixed(2), 0.08);
  // the pens' night: +3 for the coop with straw on top of the usual
  const mk = () => [{ kind: 'chicken', h: 50, cd: 1, ready: 0 }], tr = { coop: { feed: 9, water: 1 } };
  const a = mk(), b = mk(); AN.overnightPens(a, tr, 0); AN.overnightPens(b, tr, 0, { coop: 3 }); assert.strictEqual(b[0].h - a[0].h, 3);
});
ok('letters: now and then, from the right people', () => {
  let got = 0; for (let i = 0; i < 100; i++) if (YD.letter(i / 100, 10 + i, { moved: false, town: false })) got++;
  assert.strictEqual(got, 30);
  for (let i = 0; i < 30; i++) { const t = YD.letter(i / 100, i, { moved: true, town: false }); assert(!/阿禾/.test(t) && !/镇上/.test(t), t); }
});
ok('save: append-only `homeyard`, absent until something is set up, round-trips and clamps', () => {
  assert.deepStrictEqual(YD.valid(null), { put: {} });
  assert.deepStrictEqual(YD.valid({ put: { gravel: 99, mailbox: 1, nope: 3, roof: -1 }, bday: 12 }), { put: { gravel: 20, mailbox: 1 }, bday: 12 });
  for (const id of YD.IDS) assert(SAVE.UPGRADE_IDS.includes(id), id);
  assert.strictEqual(SAVE.UPGRADE_IDS.indexOf('cottage'), SAVE.UPGRADE_IDS.indexOf(YD.IDS[0]) - 1, 'appended after cottage');
});
console.log(`${n} yard tests passed`);
