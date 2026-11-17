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
});
ok('minimal (older) v1 save gets defaults', () => {
  const s = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-minimal.json'), 'utf8')));
  assert.strictEqual(s.inventory.waterMax, 4); assert.deepStrictEqual(s.prices, { carrot: 1, cabbage: 1, pumpkin: 1 }); assert.deepStrictEqual(s.stats.dayEarn, []);
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
