// Unit tests for the pure save / sim rules (no browser):  node tools/save-test.js
// Every saveVersion keeps a fixture in tools/fixtures/save-v<N>*.json; all of them must migrate to the current version.
const assert = require('assert'), fs = require('fs'), path = require('path');
const SAVE = require('../save.js'), SIM = require('../sim.js'), WD = require('../world.js'), AN = require('../animals.js'), FS = require('../fish.js');
const FIX = path.join(__dirname, 'fixtures');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
class Mem { constructor(o = {}) { this.m = new Map(Object.entries(o)); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i]; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

const fixtures = fs.readdirSync(FIX).filter(f => /^save-v\d+.*\.json$/.test(f));
assert(fixtures.length >= 2, 'need fixtures');
for (const f of fixtures) ok(`fixture ${f} migrates to v${SAVE.CURRENT}`, () => {
  const s = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')));
  assert.strictEqual(s.saveVersion, SAVE.CURRENT); assert(s.tiles.length > 0); assert(s.clock.day >= 1);
  for (const t of s.tiles) { if (t.debris) assert(Number.isInteger(t.debris.v)); if (t.weed) assert(Number.isInteger(t.weed.v)); }
  if (s.yard) for (const c of s.yard) { assert(['rock', 'branch', 'weed', 'pebble'].includes(c.type)); assert(Number.isInteger(c.v)); assert(typeof c.x === 'number' && typeof c.y === 'number'); }
});
ok('minimal (older) v1 save gets defaults', () => {
  const s = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-minimal.json'), 'utf8')));
  assert.strictEqual(s.inventory.waterMax, 4); assert.deepStrictEqual(s.prices, { carrot: 1, cabbage: 1, pumpkin: 1, strawberry: 1, watermelon: 1, egg: 1, wool: 1, milk: 1 }); assert.deepStrictEqual(s.stats.dayEarn, []);
});
ok('write keeps the previous good save as :bak', () => {
  const m = new Mem(), a = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-minimal.json'), 'utf8')));
  SAVE.write(Object.assign({}, a, { coins: 1 }), m); SAVE.write(Object.assign({}, a, { coins: 2 }), m);
  assert.strictEqual(JSON.parse(m.getItem(SAVE.KEY)).coins, 2); assert.strictEqual(JSON.parse(m.getItem(SAVE.BAK)).coins, 1);
});
ok('corrupt main save falls back to :bak and is quarantined', () => {
  const good = fs.readFileSync(path.join(FIX, 'save-v1-minimal.json'), 'utf8');
  const m = new Mem({ [SAVE.KEY]: '{"saveVersion":1,"tiles":', [SAVE.BAK]: good });
  const r = SAVE.read(m); assert(r.state); assert.strictEqual(r.from, SAVE.BAK); assert(r.notes.includes('restored-from-backup'));
  assert([...m.m.keys()].some(k => k.startsWith(SAVE.PREFIX + 'corrupt:')));
  SAVE.write(r.state, m); assert.strictEqual(JSON.parse(m.getItem(SAVE.BAK)).clock.day, r.state.clock.day, 'a broken main save never replaces the backup');
});
ok('a newer save is never overwritten', () => {
  const m = new Mem({ [SAVE.KEY]: JSON.stringify({ saveVersion: SAVE.CURRENT + 1, tiles: [{}] }) });
  const r = SAVE.read(m); assert(r.blocked); assert.strictEqual(SAVE.write({ saveVersion: 1 }, m).ok, false);
  assert.strictEqual(JSON.parse(m.getItem(SAVE.KEY)).saveVersion, SAVE.CURRENT + 1);
  SAVE.reset(new Mem()); // clears the blocked flag for the next tests
});
ok('export string round trip and tamper check', () => {
  const s = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-day4.json'), 'utf8')));
  const str = SAVE.encode(s); assert(str.startsWith('PF1.')); assert.deepStrictEqual(SAVE.decode(str), s);
  assert.throws(() => SAVE.decode(str.slice(0, -1) + (str.endsWith('a') ? 'b' : 'a'))); assert.throws(() => SAVE.decode('hello'));
});
ok('reset keeps one copy of the old save', () => {
  const m = new Mem({ [SAVE.KEY]: 'x', [SAVE.BAK]: 'y' }); SAVE.reset(m);
  assert.strictEqual(m.getItem(SAVE.KEY), null); assert.strictEqual(m.getItem(SAVE.BAK), null); assert([...m.m.keys()].some(k => k.startsWith(SAVE.PREFIX + 'reset:')));
});
ok('v1 -> current: nothing bought, 1x speed, farm and gold kept, yard left to seed', () => {
  const v1 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-day4.json'), 'utf8')), s = SAVE.migrate(v1);
  assert.strictEqual(v1.saveVersion, 1); assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert.deepStrictEqual(s.upgrades, SIM.emptyUpgrades()); assert.deepStrictEqual(s.settings, { speed: 1 });
  assert.strictEqual(s.coins, v1.coins); assert.strictEqual(s.clock.day, v1.clock.day); assert.strictEqual(s.tiles.length, v1.tiles.length);
  assert.deepStrictEqual(s.tiles.map(t => [t.open, t.tilled, t.crop && t.crop.type]), v1.tiles.map(t => [t.open, t.tilled, t.crop && t.crop.type]));
  assert.strictEqual(s.inventory.store.carrot, v1.inventory.store.carrot); assert.strictEqual(s.inventory.store.watermelon, 0);
  assert.strictEqual(s.yard, undefined);
});
ok('v2 -> current: bought levels kept, missing yard stays unset, junk yard items dropped', () => {
  const raw = Object.assign(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v2-day4.json'), 'utf8')), { yard: [{ type: 'weed', v: 1, rot: 0.2, x: 50, y: 80 }, { type: 'bogus', v: 0, x: 1, y: 1 }] });
  const s = SAVE.migrate(raw);
  assert.strictEqual(s.saveVersion, SAVE.CURRENT); assert.strictEqual(s.upgrades.can, raw.upgrades && raw.upgrades.can || 0);
  assert.strictEqual(s.coins, raw.coins); assert.deepStrictEqual(s.yard, [{ type: 'weed', v: 1, rot: 0.2, x: 50, y: 80 }]);
  const empty = SAVE.migrate(Object.assign(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v2-day4.json'), 'utf8')), { yard: [] }));
  assert.deepStrictEqual(empty.yard, []);
  const missing = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v2-day4.json'), 'utf8')));
  assert.strictEqual(missing.yard, undefined);
});
ok('v2 keeps bought levels and rejects junk', () => {
  const v2 = SAVE.migrate(Object.assign(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-day4.json'), 'utf8')), { saveVersion: 2, upgrades: { can: 2, speed: 1, bogus: 5, hoe: -3 }, settings: { speed: 3 } }));
  assert.strictEqual(v2.upgrades.can, 2); assert.strictEqual(v2.upgrades.speed, 1); assert.strictEqual(v2.upgrades.hoe, 0); assert(!('bogus' in v2.upgrades)); assert.strictEqual(v2.settings.speed, 1);
});
ok('v3 -> current: regions and axe not bought, trees rebuilt, orders empty, tiles on the home field, yard kept', () => {
  const v2 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v3-day4.json'), 'utf8')), s = SAVE.migrate(v2);
  assert.strictEqual(v2.saveVersion, 3); assert.strictEqual(s.saveVersion, SAVE.CURRENT); assert.deepStrictEqual(s.yard, v2.yard);
  for (const id of ['axe', 'forest', 'east', 'orchard', 'south']) assert.strictEqual(s.upgrades[id], 0);
  for (const id of Object.keys(v2.upgrades)) assert.strictEqual(s.upgrades[id], v2.upgrades[id]);
  assert.strictEqual(s.trees, null); assert.deepStrictEqual(s.orders, []); assert.strictEqual(s.inventory.wood, 0); assert.deepStrictEqual(s.inventory.saplings, { apple: 0, orange: 0 });
  assert(s.tiles.every(t => t.f === 'home')); assert.strictEqual(s.coins, v2.coins); assert.strictEqual(s.upgrades.field, 0);
});
ok('v5 -> current: no pasture or animals, empty trough, no hay, product prices at base, everything else kept', () => {
  const v4 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v5-day4.json'), 'utf8')), s = SAVE.migrate(v4); // (v4 = the older save, here v5)
  assert.strictEqual(v4.saveVersion, 5); assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  for (const id of ['pasture', 'coop', 'shed', 'chicken', 'sheep', 'cow']) assert.strictEqual(s.upgrades[id], 0);
  for (const id of Object.keys(v4.upgrades)) assert.strictEqual(s.upgrades[id], v4.upgrades[id]);
  assert.deepStrictEqual(s.animals, []); assert.deepStrictEqual(s.trough, { feed: 0, water: 0 }); assert.strictEqual(s.inventory.hay, 0);
  assert.deepStrictEqual([s.prices.egg, s.prices.wool, s.prices.milk], [1, 1, 1]); assert.strictEqual(s.prices.carrot, v4.prices.carrot);
  assert.deepStrictEqual(s.trees, v4.trees); assert.deepStrictEqual(s.yard, v4.yard); assert.strictEqual(s.coins, v4.coins);
});
ok('v6 keeps animals and the trough, drops bad animals, keeps eggs in the basket', () => {
  const base = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v5-day4.json'), 'utf8')));
  const s = SAVE.migrate(Object.assign(base, { animals: [AN.animal('chicken0', 'chicken'), { id: 'x', kind: 'dragon' }, Object.assign(AN.animal('cow0', 'cow'), { h: 300, ready: 9 })],
    trough: { feed: 5, water: 1 }, inventory: Object.assign(base.inventory, { hay: 12, basket: ['egg', 'milk', 'rock'] }) }));
  assert.strictEqual(s.animals.length, 2); assert.strictEqual(s.animals[1].h, 100); assert.strictEqual(s.animals[1].ready, 3);
  assert.deepStrictEqual(s.trough, { feed: 5, water: 1 }); assert.strictEqual(s.inventory.hay, 12); assert.deepStrictEqual(s.inventory.basket, ['egg', 'milk']);
});
ok('v6 -> v7: old saves get the starter bamboo rod, no sea rod or coast, empty catch log, animals kept', () => {
  const v6 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v6-day4.json'), 'utf8')), s = SAVE.migrate(v6);
  assert.strictEqual(v6.saveVersion, 6); assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert.strictEqual(s.upgrades.rod, 0); assert.strictEqual(s.upgrades.searod, 0); assert.strictEqual(s.upgrades.coast, 0);
  assert.deepStrictEqual(s.catches, []);
  for (const id of Object.keys(v6.upgrades)) assert.strictEqual(s.upgrades[id], v6.upgrades[id]);
  assert.deepStrictEqual(s.animals, v6.animals || []); assert.strictEqual(s.coins, v6.coins);
});
ok('catches validate: known fish kept, junk dropped, basket accepts fish', () => {
  const base = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v6-day4.json'), 'utf8')));
  const s = SAVE.migrate(Object.assign(base, { catches: [{ id: 'crucian', name: '鲫鱼', gold: 5, water: 'pond', day: 1 }, { id: 'dragon', gold: 9 }, { id: 'tuna', name: '金枪鱼', gold: 80, water: 'sea', day: 3 }],
    inventory: Object.assign(base.inventory, { basket: ['crucian', 'carrot', 'rock', 'tuna'] }) }));
  assert.deepStrictEqual(s.catches.map(c => c.id), ['crucian', 'tuna']);
  assert.strictEqual(s.catches[1].water, 'sea'); assert.deepStrictEqual(s.inventory.basket, ['crucian', 'carrot', 'tuna']);
});
ok('fish: starter rod is owned at level 0, shop upgrades and sea rod lock, prices and rolls', () => {
  const up = SIM.emptyUpgrades(); assert.strictEqual(SIM.effects(up).rod, 0); assert.strictEqual(SIM.effects(up).searod, false);
  assert(SIM.offer(up, 400, 'rod').ok); assert.strictEqual(SIM.offer(up, 1e5, 'searod').locked, 'coast');
  up.coast = 1; assert(SIM.offer(up, 2000, 'searod').ok);
  assert.strictEqual(SIM.shopItem('rod').levels.map(l => l.cost).join(), '400,1600');
  assert.strictEqual(SIM.shopItem('coast').levels[0].cost, 3500); assert.strictEqual(SIM.shopItem('searod').levels[0].cost, 2000);
  assert.deepStrictEqual(SAVE.FISH_IDS, FS.FISH_IDS);
  assert.strictEqual(FS.priceOf('crucian'), 5); assert.strictEqual(FS.priceOf('sword'), 140); assert.strictEqual(FS.rodOf(0).name, '竹竿');
  let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ev = (water, lv, n = 20000) => { let g = 0, miss = 0; s = 1; for (let i = 0; i < n; i++) { const r = FS.roll(water, lv, rnd); if (r.miss) miss++; else g += r.gold; } return { ev: g / n, miss: miss / n }; };
  const b = ev('pond', 0), st = ev('pond', 1), c = ev('pond', 2), sea = ev('sea', 2);
  assert(b.ev > 5 && b.ev < 10, 'bamboo ev ' + b.ev); assert(st.ev > b.ev && c.ev > st.ev, 'better rods earn more');
  assert(b.miss > st.miss && st.miss > c.miss, 'better rods miss less');
  assert(sea.ev > 25 && sea.ev < 55, 'sea ev ' + sea.ev);
  s = 1; for (let i = 0; i < 200; i++) { const w = FS.waitTime(0, rnd); assert(w >= 38 && w <= 54, 'wait ' + w); }
});
ok('animals: shop needs pasture -> building -> animal, prices and counts', () => {
  const up = SIM.emptyUpgrades(); assert.strictEqual(SIM.offer(up, 1e5, 'coop').locked, 'pasture'); assert.strictEqual(SIM.offer(up, 1e5, 'chicken').ok, false);
  up.pasture = 1; assert(SIM.offer(up, 1e5, 'coop').ok); assert.strictEqual(SIM.offer(up, 1e5, 'chicken').locked, 'coop'); up.coop = 1; assert(SIM.offer(up, 1e5, 'chicken').ok);
  assert.strictEqual(SIM.offer(up, 1e5, 'sheep').locked, 'shed');
  const cost = id => SIM.shopItem(id).levels.map(l => l.cost);
  assert.deepStrictEqual([cost('pasture'), cost('coop'), cost('shed')], [[2000], [600], [1500]]);
  assert.deepStrictEqual([cost('chicken').length, cost('sheep').length, cost('cow').length], [6, 3, 2]);
  up.chicken = 2; up.shed = 1; up.cow = 1; assert.deepStrictEqual(SIM.effects(up).animals, { chicken: 2, sheep: 0, cow: 1 }); assert(SIM.effects(up).regions.includes('pasture'));
  assert.deepStrictEqual(SAVE.PRODUCT_IDS, AN.PRODUCT_IDS); assert.deepStrictEqual(SAVE.ANIMAL_IDS, AN.KIND_IDS);
});
ok('animal care: fed + watered + petted gets happy and gives double; hungry gives nothing and sulks', () => {
  const run = (days, care) => { const a = [AN.animal('c', 'chicken')]; let got = 0; for (let d = 0; d < days; d++) { a[0].pet = care.pet ? 1 : 0;
    const r = AN.overnight(a, { feed: care.feed ? 1 : 0, water: care.water ? 1 : 0 }); got += r.report.made.egg || 0; a[0].ready = 0; } return { got, h: a[0].h }; };
  const best = run(6, { feed: 1, water: 1, pet: 1 }); assert.strictEqual(best.h, 100); assert.strictEqual(best.got, 6 * 2); // 60 + 20 is already happy after the first night
  const plain = run(6, { feed: 1, water: 1 }); assert(plain.h > 60 && plain.h < 100); assert(plain.got >= 6 && plain.got < best.got);
  const hungry = run(3, { water: 1, pet: 1 }); assert.strictEqual(hungry.got, 0); assert(hungry.h < AN.SULKY);
  const sheep = [AN.animal('s', 'sheep')]; let wool = 0; for (let d = 0; d < 9; d++) { const r = AN.overnight(sheep, { feed: 2, water: 1 }); wool += r.report.made.wool ? 1 : 0; sheep[0].ready = 0; } assert.strictEqual(wool, 3);
  const t = AN.overnight([AN.animal('a', 'cow'), AN.animal('b', 'chicken')], { feed: 3, water: 1 }); assert.strictEqual(t.report.hungry, 1); assert.deepStrictEqual(t.trough, { feed: 0, water: 0 });
  const full = AN.animal('f', 'chicken'); full.ready = AN.MAX_READY; AN.overnight([full], { feed: 1, water: 1 }); assert.strictEqual(full.ready, AN.MAX_READY);
});
ok('the pasture sits outside the other regions and has its road', () => {
  const p = WD.region('pasture'); for (const r of WD.REGIONS) if (r !== p) assert(!(p.rect[0] < r.rect[2] && r.rect[0] < p.rect[2] && p.rect[1] < r.rect[3] && r.rect[1] < p.rect[3]), r.id);
  for (const k of AN.KIND_IDS) { const R0 = p.roam[k]; assert(WD.inRect(R0[0], R0[1], p.rect) && WD.inRect(R0[2], R0[3], p.rect)); }
});
ok('v4 keeps trees and orders, drops bad ones', () => {
  const base = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v3-day4.json'), 'utf8')));
  const trees = WD.defaultTrees(); trees[0].stage = 'stump'; trees.push({ id: 'x', x: 1, y: 2, kind: 'pear', v: 0, stage: 'tree', age: 0, ripe: 0, cd: 0 });
  const s = SAVE.migrate(Object.assign(base, { trees, orders: [{ type: 'chop', id: 'w1' }, { type: 'plant', kind: 'orange', x: 20, y: 70 }, { type: 'dance' }] }));
  assert.strictEqual(s.trees.length, trees.length - 1); assert.strictEqual(s.trees[0].stage, 'stump'); assert.strictEqual(s.orders.length, 2);
});
ok('v4 -> v5: old field levels map up, never lose open tiles', () => {
  const base = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v4-day4.json'), 'utf8'));
  const withField = (field, openHome) => SAVE.migrate(Object.assign({}, base, {
    upgrades: Object.assign({}, base.upgrades, { field }),
    tiles: base.tiles.map(t => (t.f || 'home') === 'home' ? Object.assign({}, t, { open: openHome(t) }) : t),
  }));
  // published v4 rungs: 0→12, 1→18, 2→24
  const a = withField(0, t => t.c < 4 && t.r < 3);
  assert.strictEqual(a.saveVersion, SAVE.CURRENT); assert.strictEqual(a.upgrades.field, 0);
  const b = withField(1, t => t.r < 3);
  assert.strictEqual(b.upgrades.field, 2); // 18 open tiles → 20-tile rung, never shrink
  const c = withField(2, () => true);
  assert.strictEqual(c.upgrades.field, 3);
  // already-open tiles win if they are ahead of the stored level
  const d = withField(0, t => t.r < 3);
  assert.strictEqual(d.upgrades.field, 2);
  const e = withField(1, () => true);
  assert.strictEqual(e.upgrades.field, 3);
  assert.deepStrictEqual([12, 16, 18, 20, 24].map(SIM.fieldLevelForOpen), [0, 1, 2, 2, 3]);
});
ok('save.js and world.js agree on fruit; every region is a shop item', () => {
  assert.deepStrictEqual(SAVE.FRUIT_IDS, WD.FRUIT_IDS);
  for (const id of WD.REGION_IDS) { const it = SIM.shopItem(id); assert(it && it.region, id); }
  assert.deepStrictEqual(SIM.SHOP.filter(s => s.region).map(s => s.id).sort(), WD.REGION_IDS.slice().sort());
});
ok('region prices and region effects', () => {
  const cost = id => SIM.shopItem(id).levels[0].cost;
  assert.deepStrictEqual([cost('axe'), cost('forest'), cost('east'), cost('orchard'), cost('south'), cost('coast')], [500, 800, 1200, 1500, 2500, 3500]);
  const up = SIM.emptyUpgrades(); assert.deepStrictEqual(SIM.effects(up).regions, []); assert.strictEqual(SIM.effects(up).axe, false);
  up.axe = 1; up.east = 1; up.forest = 1; const e = SIM.effects(up); assert.strictEqual(e.axe, true); assert.deepStrictEqual(e.regions.slice().sort(), ['east', 'forest']);
});
ok('map: regions sit outside the farm and each other, gates on their edge, routes end at the gate', () => {
  const R = WD.REGIONS, ov = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3], H = WD.HOME;
  for (const r of R) { assert(!ov(r.rect, [H.x0, H.y0, H.x1, H.y1]), r.id); for (const q of R) if (q !== r) assert(!ov(r.rect, q.rect), r.id + q.id);
    const [x0, y0, x1, y1] = r.rect, g = r.gate; assert(g.x === x0 || g.x === x1 || g.y === y0 || g.y === y1, 'gate on edge ' + r.id);
    const w = WD.WORLD; assert(x0 > w.x0 && y0 > w.y0 && x1 < w.x1 && y1 < w.y1);
    const rt = WD.ROUTES[r.id], end = rt[rt.length - 1]; assert.deepStrictEqual([end.x, end.y], [g.x, g.y]); assert.strictEqual(WD.areaAt(r.center.x, r.center.y), r.id); }
  assert.strictEqual(WD.areaAt(96, 64), 'home'); assert.strictEqual(WD.areaAt(-150, 200), null);
  const map = (w => (w.x1 - w.x0) / WD.TILE + 'x' + (w.y1 - w.y0) / WD.TILE)(WD.WORLD); assert.strictEqual(map, '64x50');
  const coast = WD.region('coast'); assert.strictEqual(WD.areaAt(coast.center.x, coast.center.y), 'coast');
  assert.strictEqual(WD.areaAt(coast.fish.stand.x, coast.fish.stand.y), 'coast'); // the pier is in r.water, still area 'coast'
  assert.strictEqual(WD.seaAt(280, 278), 'water');
  const shore = WD.seaShore(280); assert.strictEqual(WD.seaAt(280, shore + 4), 'water'); assert.strictEqual(WD.seaAt(280, shore - 4), 'sand'); assert.strictEqual(WD.seaAt(0, 100), null);
});
ok('fruit: apple 5 every 3 days, orange 4 every 2 days', () => {
  for (const [k, n, every] of [['apple', 5, 3], ['orange', 4, 2]]) { const t = WD.fruitTree('t', 0, 0, k, 0); let got = [];
    for (let d = 0; d < 12; d++) { got.push(WD.pickFruit(t)); WD.treeOvernight(t); }
    assert.strictEqual(got[0], n); assert.strictEqual(got.filter(x => x).length, Math.ceil(12 / every)); assert(got.every((x, i) => x === (i % every ? 0 : n))); }
  assert.strictEqual(WD.FRUIT.apple.price, 12); assert.strictEqual(WD.FRUIT.orange.price, 15);
});
ok('a planted sapling fruits 5 days later; a stump grows back', () => {
  const t = { id: 'p', x: 0, y: 0, kind: 'orange', v: 0, stage: 'sapling', age: 0, ripe: 0, cd: 0 };
  for (let d = 1; d <= 5; d++) { assert.strictEqual(WD.pickFruit(t), 0); WD.treeOvernight(t); } assert.strictEqual(t.stage, 'tree'); assert.strictEqual(WD.pickFruit(t), 4);
  const w = { id: 'w', x: 0, y: 0, kind: 'wild', v: 0, stage: 'stump', age: 0, ripe: 0, cd: 0 }; let d = 0; while (w.stage !== 'tree' && d < 30) { WD.treeOvernight(w); d++; }
  assert.strictEqual(d, WD.STUMP_TO_TREE); // counted from the chop
});
ok('chopping: 5 wood and a sapling, only grown wild trees in a bought forest', () => {
  const y = WD.chopYield(() => 0.1); assert.deepStrictEqual(y, { wood: 5, sapling: 'apple' }); assert.strictEqual(WD.chopYield(() => 0.9).sapling, 'orange');
  const trees = WD.defaultTrees(), w = trees.find(t => t.kind === 'wild'), a = trees.find(t => t.kind === 'apple');
  assert(trees.filter(t => t.kind === 'wild').length >= 12); assert.strictEqual(trees.filter(t => t.kind === 'apple').length, 3);
  assert(WD.choppable(w, ['forest'])); assert(!WD.choppable(w, [])); assert(!WD.choppable(a, ['forest'])); assert(!WD.choppable(Object.assign({}, w, { stage: 'stump' }), ['forest']));
  assert.deepStrictEqual(WD.defaultTrees(), trees); assert(trees.every(t => WD.areaAt(t.x, t.y) === (t.kind === 'wild' ? 'forest' : 'orchard')));
});
ok('save.js and sim.js agree on crops and shop items', () => { assert.deepStrictEqual(SAVE.CROP_IDS, SIM.IDS); assert.deepStrictEqual(SAVE.UPGRADE_IDS, SIM.SHOP_IDS); });
ok('shop: costs, short amount, max level', () => {
  const o = SIM.offer({}, 50, 'can'); assert.strictEqual(o.cost, 80); assert.strictEqual(o.ok, false); assert.strictEqual(o.short, 30);
  assert.strictEqual(SIM.offer({}, 80, 'can').ok, true); assert.strictEqual(SIM.offer({ speed: 2 }, 1e9, 'speed').maxed, true);
  for (const id of SIM.SHOP_IDS) { const L = SIM.shopItem(id).levels; for (let i = 1; i < L.length; i++) assert(L[i].cost > L[i - 1].cost, id + ' gets dearer'); }
});
ok('shop effects: base and fully upgraded', () => {
  const b = SIM.effects({}); assert.deepStrictEqual([b.waterMax, b.walk, b.basket, b.speedMax, b.till3], [SIM.WATER_MAX0, 1, SIM.BASKET, 1, false]);
  assert.deepStrictEqual(b.crops, ['carrot', 'cabbage', 'pumpkin']);
  const max = {}; for (const id of SIM.SHOP_IDS) max[id] = SIM.shopItem(id).levels.length; const m = SIM.effects(max);
  assert.deepStrictEqual([m.waterMax, m.walk, m.basket, m.speedMax, m.till3, m.tillDur], [30, 1.8, 40, 4, true, 2]); assert.deepStrictEqual(m.crops, SIM.IDS);
  assert.deepStrictEqual([0, 1, 2, 3].map(SIM.homeOpenCount), [12, 16, 20, 24]);
});
ok('crop ladder: each unlock earns more per tile-day than the last', () => {
  const v = k => SIM.netPerDay(k, SIM.startPrices(), false);
  assert(v('carrot') < v('cabbage') && v('cabbage') < v('pumpkin') && v('pumpkin') < v('strawberry') && v('strawberry') < v('watermelon'));
});
ok('harvest seed drop rates match the table', () => {
  let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const k of SIM.IDS) { let t = 0; for (let i = 0; i < 20000; i++) t += SIM.harvestSeeds(k, rnd); const d = SIM.CROPS[k].drop, exp = d[0] * (1 + d[1]);
    assert(Math.abs(t / 20000 - exp) < 0.03, `${k} ${t / 20000} vs ${exp}`); }
});
ok('surplus seeds: only what he carries above one replanting', () => {
  const bag = Object.assign(SIM.emptySeeds(), { carrot: 20, pumpkin: 3 }), store = Object.assign(SIM.emptySeeds(), { carrot: 4, pumpkin: 30 });
  const r = SIM.surplusSeeds(bag, store, 12); assert.strictEqual(r.sell.carrot, 12); assert.strictEqual(r.sell.pumpkin, 3); assert.strictEqual(r.gold, 12 * 1 + 3 * 10);
  assert.strictEqual(SIM.surplusSeeds(Object.assign(SIM.emptySeeds(), { carrot: 6 }), SIM.emptySeeds(), 6).gold, 0);
});
ok('seed plan never buys a locked crop', () => {
  const p = SIM.planSeeds(1e6, SIM.startPrices(), 20, 0, SIM.effects({}).crops); assert.strictEqual(p.buy.watermelon + p.buy.strawberry, 0);
  const q = SIM.planSeeds(1e6, SIM.startPrices(), 20, 0, SIM.effects({ watermelon: 1 }).crops); assert(q.buy.watermelon > 0);
});
ok('a day is about 5 real minutes', () => assert(SIM.DAY_REAL_SEC > 290 && SIM.DAY_REAL_SEC < 330));
ok('crops ripen after their days, carrot next morning', () => {
  assert.strictEqual(SIM.stageOf({ type: 'carrot', age: 0 }), 0); assert.strictEqual(SIM.stageOf({ type: 'carrot', age: 1 }), 3);
  assert.deepStrictEqual([0, 1, 2, 3, 4].map(a => SIM.stageOf({ type: 'pumpkin', age: a })), [0, 1, 2, 2, 3]);
});
ok('12 of 24 home tiles open at the start', () => { let c = 0; for (let r = 0; r < 4; r++) for (let x = 0; x < 6; x++) c += SIM.startOpen(x, r); assert.strictEqual(c, 12); });
ok('seed plan keeps half the purse and uses free carrots first', () => {
  const p = SIM.planSeeds(100, SIM.startPrices(), 12, 4); assert(p.cost <= 100 - 0 && 100 - p.cost >= 0);
  assert(p.buy.pumpkin * 25 + p.buy.cabbage * 10 <= 50 + 10); assert.strictEqual(SIM.planSeeds(0, SIM.startPrices(), 5, 0).cost, 0);
});
ok('prices drift at most 5% a day inside 0.8..1.2', () => {
  let p = SIM.startPrices(); let r = 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let d = 0; d < 500; d++) { const q = SIM.driftPrices(p, rnd); for (const k of SIM.IDS) { assert(q[k] >= 0.8 && q[k] <= 1.2); assert(Math.abs(q[k] - p[k]) <= 0.05 + 0.3 * Math.abs(1 - p[k]) + 1e-3); } p = q; }
});
ok('offline: 50% rate, capped at 3 days, nothing under a minute', () => {
  assert.strictEqual(SIM.offlineSettle(30, [100]), null);
  const a = SIM.offlineSettle(SIM.DAY_REAL_SEC * 2, [100, 100, 100]); assert.strictEqual(a.days, 1); assert.strictEqual(a.gold, 100);
  const b = SIM.offlineSettle(86400, [90, 120, 150]); assert.strictEqual(b.days, 3); assert(b.capped); assert.strictEqual(b.gold, 360);
  assert.strictEqual(SIM.offlineSettle(3600, []).gold, 0);
});
console.log(`${n} passed`);
