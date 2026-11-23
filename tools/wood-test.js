// Unit checks for wood.js (v5.3.1 wood automation): node tools/wood-test.js
const assert = require('assert');
const WA = require('../wood.js'), WD = require('../world.js'), SIM = require('../sim.js');
const eff = up => SIM.effects(Object.assign(SIM.emptyUpgrades(), up));
// yield: 8 a tree, +2 per axe upgrade, +2 in 林场 with the hut
assert.strictEqual(WA.perTree(eff({ axe: 1 }), true), 8);
assert.strictEqual(WA.perTree(eff({ axe: 3 }), false), 12);
assert.strictEqual(WA.perTree(eff({ axe: 3, forest: 1, lumber: 1 }), true), 14);
assert.strictEqual(WA.perTree(eff({ axe: 3, forest: 1, lumber: 1 }), false), 12);
assert.deepStrictEqual([1, 2, 3].map(a => WA.chopMinutes(eff({ axe: a }))), [20, 15, 11]);
// target: the biggest next wood cost (the manor's 400 after the farmhouse), capped by the storehouse
const up = Object.assign(SIM.emptyUpgrades(), { house: 2, fence: 1, forest: 1, lumber: 1 });
assert.strictEqual(WA.target(SIM.SHOP, up, 400), 400);
assert.strictEqual(WA.target(SIM.SHOP, up, 200), 200);
assert.strictEqual(WA.target(SIM.SHOP, Object.assign({}, up, { house: 3 }), 800), 800); // v5.4.5: nothing left needs wood: fill the storehouse
assert.strictEqual(WA.autoBase(SIM.SHOP, Object.assign({}, up, { house: 3 })), WA.SPARE_BASE);
assert.strictEqual(WA.autoBase(SIM.SHOP, up), WA.AUTO_BASE);
assert.ok(WA.SPARE_BASE > 12 && WA.SPARE_BASE < 18); // above fishing, below tidying and every chore
assert.strictEqual(WA.target(SIM.SHOP, Object.assign(SIM.emptyUpgrades(), { house: 0 }), 100), 60); // fence 60 > cabin 40
// the hut needs the forest, so before 林场 it does not count
assert.strictEqual(WA.target(SIM.SHOP, Object.assign(SIM.emptyUpgrades(), { house: 1, fence: 1 }), 200), 150);
// auto trees: 林场 only, wild only, grown only, and never while KEEP or fewer stand
const trees = WD.defaultTrees();
const E = eff({ axe: 1, forest: 1 });
const auto = WA.autoTrees(trees, E);
assert.ok(auto.length === 17 && auto.every(t => t.kind === 'wild' && WD.regrows(t)), 'forest wild trees only');
assert.deepStrictEqual(WA.autoTrees(trees, eff({ axe: 1 })), [], 'needs 林场');
assert.deepStrictEqual(WA.autoTrees(trees, eff({ forest: 1 })), [], 'needs the axe');
const few = trees.map(t => Object.assign({}, t)); let n = 0; for (const t of few) if (t.kind === 'wild' && WD.regrows(t) && n++ >= 3) t.stage = 'stump';
assert.deepStrictEqual(WA.autoTrees(few, E), [], 'keeps 3 standing');
// the hut replants 林场 stumps from saplings, then they are grown 3 nights after the chop
const t = { id: 'x', x: 100, y: -70, kind: 'wild', stage: 'stump', age: 0 }, home = { id: 'y', x: 40, y: 40, kind: 'wild', stage: 'stump', age: 0 };
const sap = { apple: 1, orange: 0 }, H = eff({ axe: 1, forest: 1, lumber: 1 });
assert.strictEqual(WA.replant([t, home], sap, H).length, 1); assert.strictEqual(sap.apple, 0); assert.strictEqual(home.stage, 'stump');
for (let i = 0; i < 3; i++) WD.treeOvernight(t); assert.strictEqual(t.stage, 'tree');
assert.strictEqual(WA.replant([{ x: 100, y: -70, kind: 'wild', stage: 'stump', age: 0 }], { apple: 0, orange: 0 }, H).length, 0, 'no saplings, no replant');
// without the hut: 5 nights
const u = { x: 100, y: -70, kind: 'wild', stage: 'stump', age: 0 }; for (let i = 0; i < 4; i++) WD.treeOvernight(u); assert.strictEqual(u.stage, 'sapling'); WD.treeOvernight(u); assert.strictEqual(u.stage, 'tree');
// offline: modest, never past the target
assert.strictEqual(WA.offline(3, E, 17, 0, 400), Math.floor(14 * 8 / 5 * 3 * 0.5));
assert.strictEqual(WA.offline(3, H, 17, 390, 400), 10);
assert.strictEqual(WA.offline(3, eff({ axe: 1 }), 17, 0, 400), 0);
console.log('wood-test: ok');
// v5.11.0.37: the hut may use spare saplings for wild trees, never the ones promised to fruit-tree placement orders.
{ const t = { x: 100, y: -70, kind: 'wild', stage: 'stump', age: 0 }, sap = { apple: 2, orange: 1 };
  const keep = { apple: 2, orange: 1 }; assert.strictEqual(WA.replant([t], sap, H, keep).length, 0); assert.deepStrictEqual(sap, keep);
  sap.apple++; assert.strictEqual(WA.replant([t], sap, H, keep).length, 1); assert.deepStrictEqual(sap, keep); }
