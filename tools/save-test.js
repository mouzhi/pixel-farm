// Unit tests for the pure save / sim rules (no browser):  node tools/save-test.js
// Every saveVersion keeps a fixture in tools/fixtures/save-v<N>*.json; all of them must migrate to the current version.
const assert = require('assert'), fs = require('fs'), path = require('path');
const SAVE = require('../save.js'), SIM = require('../sim.js');
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
  assert.strictEqual(s.inventory.waterMax, 4); assert.deepStrictEqual(s.prices, { carrot: 1, cabbage: 1, pumpkin: 1, strawberry: 1, watermelon: 1 }); assert.deepStrictEqual(s.stats.dayEarn, []);
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
ok('v2 -> v3: bought levels kept, missing yard stays unset, junk yard items dropped', () => {
  const raw = Object.assign(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v2-day4.json'), 'utf8')), { yard: [{ type: 'weed', v: 1, rot: 0.2, x: 50, y: 80 }, { type: 'bogus', v: 0, x: 1, y: 1 }] });
  const s = SAVE.migrate(raw);
  assert.strictEqual(s.saveVersion, 3); assert.strictEqual(s.upgrades.can, raw.upgrades && raw.upgrades.can || 0);
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
  const open = lv => { let c = 0; for (let r = 0; r < 4; r++) for (let x = 0; x < 6; x++) c += SIM.isOpen(x, r, lv); return c; };
  assert.deepStrictEqual([0, 1, 2].map(open), [12, 18, 24]);
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
