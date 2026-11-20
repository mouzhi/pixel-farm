// Unit tests for phase 9 (v5.7.0, decor.js + the v13 save):  node tools/decor-test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const DC = require('../decor.js'), SAVE = require('../save.js'), SIM = require('../sim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const rng = seed => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

ok('catalog: shop pieces, found pieces, lamps; everything has a footprint', () => {
  assert.deepStrictEqual(DC.SHOP_IDS, ['bench', 'flowerpot', 'scarecrow', 'birdbath', 'lamppost', 'stonelamp', 'stringlights', 'party']);
  for (const id of ['lamppost', 'stonelamp', 'stringlights']) assert(DC.LAMP_IDS.includes(id), id);
  for (const id of DC.IDS) { const c = DC.CATALOG[id]; assert(c.name && c.foot && c.foot.length === 2, id); assert(c.shop || c.src, id); }
  assert.deepStrictEqual([DC.CATALOG.party.shop.cost, DC.CATALOG.party.shop.wood, DC.CATALOG.party.shop.max], [2000, 40, 1]);
});
ok('drops: chopping and fishing now and then leave a piece, by their own odds', () => {
  assert.strictEqual(DC.rollDrop('chop', () => 0.01), 'carving'); assert.strictEqual(DC.rollDrop('chop', () => 0.05), 'stonelamp');
  assert.strictEqual(DC.rollDrop('chop', () => 0.2), null); assert.strictEqual(DC.rollDrop('sea', () => 0.07), 'bottle');
  assert.strictEqual(DC.rollDrop('pond', () => 0.01), 'bottle'); assert.strictEqual(DC.rollDrop('nope', () => 0), null);
  const r = rng(7); let got = 0; for (let i = 0; i < 10000; i++) if (DC.rollDrop('chop', r)) got++;
  assert(got > 350 && got < 750, 'chop drops ' + got); // ~5.5%
  assert.deepStrictEqual(DC.GIANT_KEEP, { pumpkin: 'giant_pumpkin', cabbage: 'giant_cabbage', watermelon: 'giant_watermelon' });
});
ok('book pages: a full page unlocks its piece, an empty or partial one does not', () => {
  assert(!DC.pageDone([], () => true)); assert(!DC.pageDone(['a', 'b'], k => k === 'a')); assert(DC.pageDone(['a', 'b'], () => true));
  assert.deepStrictEqual(DC.SET_UNLOCK.map(u => u.id), ['koistatue', 'chime']);
});
ok('party: never before the area is up, the first one the next evening, then not daily', () => {
  assert(!DC.partyTonight({ day: 5, placedDay: 0, last: 0 }, () => 0));
  assert(!DC.partyTonight({ day: 5, placedDay: 5, last: 0 }, () => 0));
  assert(DC.partyTonight({ day: 6, placedDay: 5, last: 0 }, () => 0.99));
  assert(!DC.partyTonight({ day: 8, placedDay: 5, last: 6 }, () => 0));
  const r = rng(42); let last = 6, days = []; for (let d = 7; d < 707; d++) if (DC.partyTonight({ day: d, placedDay: 5, last, special: DC.special(d, { moved: 3 }) }, r)) { days.push(d); last = d; }
  for (let i = 1; i < days.length; i++) assert(days[i] - days[i - 1] >= DC.PARTY.gap);
  assert(days.length > 20 && days.length < 120, 'parties in 700 days: ' + days.length);
});
ok('party: anniversaries (28 days) make one likelier; guests 0-2; the evening window', () => {
  assert(DC.special(31, { moved: 3 })); assert(!DC.special(30, { moved: 3 })); assert(!DC.special(3, { moved: 3 }));
  assert(DC.special(60, { kids: [{ born: 4 }] })); assert(!DC.special(60, {}));
  const r = rng(3), c = [0, 0, 0]; for (let i = 0; i < 3000; i++) c[DC.guestCount(r)]++; assert(c[0] && c[1] && c[2]);
  assert(!DC.partyOn(17 * 60)); assert(DC.partyOn(18 * 60)); assert(DC.partyOn(20 * 60 + 10)); assert(!DC.partyOn(20 * 60 + 30));
  assert.strictEqual(DC.partySeats({ x: 0, y: 0 }).length, 10); assert.strictEqual(DC.partyPosts({ x: 0, y: 0 }).length, 4);
});
// a 10x6 grid of grass (10) with a dirt path (5) across row 2 and a wall (0) with one gap in column 6
const grid = () => { const g = { x0: 0, y0: 0, cell: 4, w: 10, h: 6, cost: new Uint8Array(60).fill(10) };
  for (let i = 0; i < 10; i++) g.cost[2 * 10 + i] = 5; for (let j = 0; j < 6; j++) if (j !== 4) g.cost[j * 10 + 6] = 0; return g; };
ok('placement: grass only (not paths, walls or off the grid)', () => {
  const g = grid();
  assert(DC.onGrass(g, DC.boxOf(6, 18, [2, 2]), 10)); assert(!DC.onGrass(g, DC.boxOf(6, 10, [2, 2]), 10));
  assert(!DC.onGrass(g, DC.boxOf(26, 2, [1, 1]), 10)); assert(!DC.onGrass(g, DC.boxOf(-2, 2, [1, 1]), 10));
});
ok('placement: something that blocks may not cut off a spot people need to reach', () => {
  const g = grid(), from = { x: 2, y: 2 }, spots = [{ x: 38, y: 22 }];
  assert(DC.reach(g, from, [])[5 * 10 + 9]);
  assert(!DC.keepsPaths(g, DC.boxOf(26, 18, [1.5, 1.5]), spots, from)); // plugs the one gap in the wall
  assert(DC.keepsPaths(g, DC.boxOf(10, 18, [1.5, 1.5]), spots, from));
});
ok('the family looks nearest first', () => {
  const s = DC.ringSpots({ x: 10, y: 10 }, 18, 6); assert.deepStrictEqual([s[0].x, s[0].y], [10, 10]);
  for (let i = 1; i < s.length; i++) assert(s[i].d >= s[i - 1].d); assert(s.every(p => p.d <= 18));
});
ok('state: junk becomes an empty storehouse; one party area; half-done carries are dropped safely', () => {
  assert.deepStrictEqual(DC.valid(null), DC.empty()); assert.deepStrictEqual(DC.valid([1, 2]), DC.empty());
  const v = DC.valid({ inv: { bench: 3, nope: 2, party: 99 }, placed: [{ u: 4, id: 'party', x: 1, y: 2 }, { u: 4, id: 'party', x: 9, y: 9 }, { u: 9, id: 'bench', x: 1e9, y: 0 }, { id: 'ghost', x: 0, y: 0 }],
    orders: [{ op: 'move', what: 'decor', ref: 4, x: 3, y: 3, st: 2, mine: 1 }, { op: 'place', what: 'decor', id: 'nope', x: 0, y: 0 }, { op: 'fly', what: 'decor', x: 0, y: 0 }],
    party: { last: 3, guests: 9 }, got: { koistatue: 1, x: 1 }, n: 2, moon: 'y' });
  assert.deepStrictEqual(v.inv, { bench: 3, party: DC.INV_MAX });
  assert.deepStrictEqual(v.placed.map(p => p.id), ['party', 'bench']); assert.strictEqual(v.placed[1].x, 452);
  assert.strictEqual(new Set(v.placed.map(p => p.u)).size, 2);
  assert.strictEqual(v.orders.length, 1); assert(!('st' in v.orders[0])); assert.strictEqual(v.orders[0].mine, 1);
  assert(v.n > Math.max(...v.placed.map(p => p.u), ...v.orders.map(q => q.u)));
  assert.deepStrictEqual(v.party, { last: 3, at: 0, tonight: 0, guests: 2 }); assert.deepStrictEqual(v.got, { koistatue: 1 }); assert.strictEqual(v.moon, 1);
});
ok('save: the day-59 manor fixture (v10) migrates to v13 with no decorations and the old house where it was', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8'));
  const s = SAVE.migrate(JSON.parse(JSON.stringify(raw)));
  assert.strictEqual(SAVE.CURRENT, 15); assert.strictEqual(s.saveVersion, 15); assert.deepStrictEqual(s.decor, DC.empty());
  for (const id of DC.SHOP_IDS) assert.strictEqual(s.upgrades[id], 0, id);
  for (const k of Object.keys(raw.upgrades)) assert.strictEqual(s.upgrades[k], raw.upgrades[k], k);
  assert.strictEqual(s.coins, raw.coins); assert.strictEqual(s.clock.day, raw.clock.day);
  assert.deepStrictEqual(s.plots, SAVE.migrate(JSON.parse(JSON.stringify(raw))).plots);
});
ok('save: decorations survive a write/read round trip', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8'));
  const s = SAVE.migrate(raw); s.decor.inv = { flowerpot: 2 }; s.decor.placed = [{ u: 1, id: 'lamppost', x: 40, y: 60, d: 50 }]; s.decor.n = 2; s.decor.party.last = 40;
  const back = SAVE.validate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(back.decor.inv, { flowerpot: 2 }); assert.deepStrictEqual(back.decor.placed, s.decor.placed); assert.strictEqual(back.decor.party.last, 40);
});
ok('shop: a 装饰 tab with flat prices; the party area costs 2000 + 40 wood', () => {
  const tab = SIM.SHOP_TABS.find(t => t.id === 'decor'); assert(tab); assert.deepStrictEqual(tab.ids, DC.SHOP_IDS);
  const p = SIM.shopItem('party'); assert(p.flat && p.p9); assert.deepStrictEqual([p.levels[0].cost, p.levels[0].wood], [2000, 40]);
  const b = SIM.shopItem('bench'); assert(b.levels.every(l => l.cost === 300 && l.wood === 10)); assert.strictEqual(b.levels.length, 6);
});
ok('v5.11.0.2 收回: store orders and kept pieces survive valid(); kept never exceeds the storehouse; untouched saves keep their shape', () => {
  const v = DC.valid({ inv: { bench: 2, flowerpot: 1 }, kept: { bench: 5, flowerpot: 1, nope: 3 }, placed: [{ u: 3, id: 'bench', x: 60, y: 60 }],
    orders: [{ op: 'store', what: 'decor', ref: 3, id: 'bench', x: 158, y: 41, mine: 1 }, { op: 'store', what: 'work', ref: 'mill', x: 1, y: 1 }, { op: 'store', what: 'decor', ref: null, x: 1, y: 1 }], n: 4 });
  assert.deepStrictEqual(v.kept, { bench: 2, flowerpot: 1 });
  assert.strictEqual(v.orders.length, 1); assert.deepStrictEqual([v.orders[0].op, v.orders[0].what, v.orders[0].ref, v.orders[0].mine], ['store', 'decor', 3, 1]);
  assert(!('kept' in DC.valid({ inv: { bench: 1 } })), 'no kept field unless used'); assert(!('kept' in DC.empty()));
});
console.log(`decor-test: ${n} ok`);
