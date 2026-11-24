// Unit tests for the pure save / sim rules (no browser):  node tools/save-test.js
// Every saveVersion keeps a fixture in tools/fixtures/save-v<N>*.json; all of them must migrate to the current version.
const assert = require('assert'), fs = require('fs'), path = require('path');
const SAVE = require('../save.js'), SIM = require('../sim.js'), WD = require('../world.js'), AN = require('../animals.js'), FS = require('../fish.js'), FAM = require('../family.js'), CX = require('../codex.js');
const IN = require('../inn.js');
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
  assert.strictEqual(s.inventory.waterMax, 4); assert.deepStrictEqual(s.prices, { carrot: 1, cabbage: 1, pumpkin: 1, strawberry: 1, watermelon: 1, egg: 1, wool: 1, milk: 1, truffle: 1, wheat: 1 }); assert.deepStrictEqual(s.stats.dayEarn, []);
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
  const str = SAVE.encode(s); assert(str.startsWith('PF1.')); const d = SAVE.decode(str); // v5.11.0.8: the compact form rounds floats (rot to 2 decimals)
  assert.deepStrictEqual(d, SAVE.migrate(JSON.parse(JSON.stringify(SAVE.compact(s))))); assert.deepStrictEqual(SAVE.decode(SAVE.encode(d)), d);
  assert.throws(() => SAVE.decode(str.slice(0, -1) + (str.endsWith('a') ? 'b' : 'a'))); assert.throws(() => SAVE.decode('hello'));
});
ok('reset keeps one copy of the old save', () => {
  const m = new Mem({ [SAVE.KEY]: 'x', [SAVE.BAK]: 'y' }); SAVE.reset(m);
  assert.strictEqual(m.getItem(SAVE.KEY), null); assert.strictEqual(m.getItem(SAVE.BAK), null); assert([...m.m.keys()].some(k => k.startsWith(SAVE.PREFIX + 'reset:')));
});
ok('v1 -> current: nothing bought, one game speed, farm and gold kept, yard left to seed', () => {
  const v1 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-day4.json'), 'utf8')), s = SAVE.migrate(v1);
  assert.strictEqual(v1.saveVersion, 1); assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert.deepStrictEqual(s.upgrades, Object.assign(SIM.emptyUpgrades(), { speed: 0 })); assert.deepStrictEqual(s.settings, { speed: 1, speedRefund: 0, autoBuy: false, autoDay: 0, autoN: 0 }); assert.deepStrictEqual(s.offline, { win: [] });
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
  assert.strictEqual(v2.upgrades.can, 2); assert.strictEqual(v2.upgrades.speed, 1); assert.strictEqual(v2.upgrades.hoe, 0); assert(!('bogus' in v2.upgrades)); assert.strictEqual(v2.settings.speed, 1); // v5.10.2: the legacy speed level is kept so the game can refund it
});
ok('v3 -> current: regions and axe not bought, trees rebuilt, orders empty, tiles on the home field, yard kept', () => {
  const v2 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v3-day4.json'), 'utf8')), s = SAVE.migrate(v2);
  assert.strictEqual(v2.saveVersion, 3); assert.strictEqual(s.saveVersion, SAVE.CURRENT); assert.deepStrictEqual(s.yard, v2.yard);
  for (const id of ['axe', 'forest', 'east', 'orchard', 'south']) assert.strictEqual(s.upgrades[id], 0);
  for (const id of Object.keys(v2.upgrades)) assert.strictEqual(s.upgrades[id], v2.upgrades[id]);
  assert.strictEqual(s.trees, null); assert.deepStrictEqual(s.orders, []); assert.strictEqual(s.inventory.wood, 0); assert.deepStrictEqual(s.inventory.saplings, { apple: 0, orange: 0 });
  assert(s.tiles.every(t => t.f === 'home')); assert.strictEqual(s.coins, v2.coins); assert.strictEqual(s.upgrades.field, 0);
});
ok('v5 -> current: no animals, pets or pens, empty troughs, no hay, product prices at base, everything else kept', () => {
  const v5 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v5-day4.json'), 'utf8')), s = SAVE.migrate(v5);
  assert.strictEqual(v5.saveVersion, 5); assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  for (const id of ['pasture', 'coop', 'shed', 'sty', 'fold', 'chicken', 'sheep', 'cow', 'pig', 'cat', 'dog']) assert.strictEqual(s.upgrades[id], 0);
  for (const id of Object.keys(v5.upgrades)) assert.strictEqual(s.upgrades[id], v5.upgrades[id]);
  assert.deepStrictEqual(s.animals, []); assert.strictEqual(s.trough, undefined); assert.strictEqual(s.inventory.hay, 0);
  for (const k of AN.PEN_IDS) assert.deepStrictEqual(s.troughs[k], { feed: 0, water: 0 });
  assert.deepStrictEqual([s.prices.egg, s.prices.wool, s.prices.milk, s.prices.truffle], [1, 1, 1, 1]); assert.strictEqual(s.prices.carrot, v5.prices.carrot);
  assert.deepStrictEqual(s.trees.slice(0, v5.trees.length), v5.trees); assert.deepStrictEqual(s.yard, v5.yard); assert.strictEqual(s.coins, v5.coins); // v9 appends the new wild trees
});
// a v4.5 player with the north pasture, coop, shed and all three kinds: nothing is lost on the way to v8
const v6Rich = () => { const base = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v5-day4.json'), 'utf8')));
  return Object.assign(base, { saveVersion: 6, troughs: undefined, upgrades: Object.assign({}, base.upgrades, { forest: 1, pasture: 1, coop: 1, shed: 1, chicken: 3, sheep: 2, cow: 1, sty: undefined, fold: undefined, pig: undefined, cat: undefined, dog: undefined }),
    animals: [AN.animal('chicken0', 'chicken'), { id: 'x', kind: 'dragon' }, Object.assign(AN.animal('cow0', 'cow'), { h: 300, ready: 9 }), AN.animal('sheep0', 'sheep')],
    trough: { feed: 5, water: 1 }, prices: { carrot: 1.1, cabbage: 1, pumpkin: 1, strawberry: 1, watermelon: 1, egg: 0.9, wool: 1, milk: 1.05 },
    inventory: Object.assign(base.inventory, { hay: 12, basket: ['egg', 'milk', 'rock'] }) }); };
ok('v6 -> v8 keeps every animal and building: chickens move to the home coop, sheep get a free fold (and the orchard), the trough goes to the shed', () => {
  const s = SAVE.migrate(v6Rich());
  assert.strictEqual(s.saveVersion, SAVE.CURRENT); assert.strictEqual(s.animals.length, 3); assert.deepStrictEqual(s.animals.map(a => a.kind), ['chicken', 'cow', 'sheep']);
  assert.strictEqual(s.animals[1].h, 100); assert.strictEqual(s.animals[1].ready, 3);
  for (const [k, v] of Object.entries({ pasture: 1, coop: 1, shed: 1, fold: 1, orchard: 1, chicken: 3, sheep: 2, cow: 1, sty: 0, pig: 0, cat: 0, dog: 0, forest: 1 })) assert.strictEqual(s.upgrades[k], v, k);
  assert.strictEqual(s.trough, undefined); assert.deepStrictEqual(s.troughs.shed, { feed: 5, water: 1 }); assert.deepStrictEqual(s.troughs.coop, { feed: 0, water: 0 });
  assert.strictEqual(s.inventory.hay, 12); assert.deepStrictEqual(s.inventory.basket, ['egg', 'milk']); assert.strictEqual(s.prices.egg, 0.9); assert.strictEqual(s.prices.truffle, 1);
  const eff = SIM.effects(s.upgrades); assert.deepStrictEqual(eff.animals, { chicken: 3, sheep: 2, cow: 1, pig: 0 }); assert(eff.coop && eff.fold && eff.shed && !eff.sty);
  // a v6 farm with only the coop (no shed yet) keeps its trough at the coop
  const c = v6Rich(); c.upgrades.shed = 0; c.upgrades.cow = 0; c.upgrades.sheep = 0; assert.deepStrictEqual(SAVE.migrate(c).troughs.coop, { feed: 5, water: 1 });
  assert.strictEqual(SAVE.migrate(c).upgrades.fold, 0);
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
ok('fish: rare flags, rod looks, and the screen-space pose points the rod at the water', () => {
  assert(FS.isRare('koi') && FS.isRare('sword') && FS.isRare('tuna') && FS.isRare('snapper'));
  assert(!FS.isRare('crucian') && !FS.isRare('carp') && !FS.isRare('sardine') && !FS.isRare('bass'));
  s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let seen = 0; s = 1; for (let i = 0; i < 4000; i++) { const r = FS.roll('pond', 2, rnd); if (!r.miss && r.fish === 'koi') { seen++; assert.strictEqual(r.rare, true); } }
  assert(seen > 0, 'carbon rod can still roll a glowing koi');
  const b = FS.rodLook(0, false), st = FS.rodLook(1, false), c = FS.rodLook(2, false), sea = FS.rodLook(0, true);
  assert.strictEqual(b.id, 'bamboo'); assert.strictEqual(st.id, 'steel'); assert.strictEqual(c.id, 'carbon'); assert.strictEqual(sea.id, 'searod');
  assert.notStrictEqual(b.shaft, st.shaft); assert.notStrictEqual(st.shaft, c.shaft); assert.notStrictEqual(sea.wrap, b.wrap);
  const wait = FS.pose(100, 80, 70, 95, 'wait', 1, 0);
  assert(wait.faceLeft && wait.tip.x < wait.grip.x && wait.tip.y < wait.grip.y, 'pond: rod points up and left toward the hook ' + JSON.stringify(wait.tip));
  assert(wait.bob.show && Math.abs(wait.bob.y - 95) < 1.5, 'bobber rests on the water');
  const right = FS.pose(100, 80, 130, 95, 'wait', 1, 0);
  assert(!right.faceLeft && right.tip.x > right.grip.x, 'rod follows a hook on the right');
  const bite = FS.pose(100, 80, 70, 95, 'bite', 0.5, 0.2);
  assert(bite.bob.y >= 95 + 2, 'bobber dips on a bite: ' + bite.bob.y);
  const koi = { miss: false, fish: 'koi', col: '#e06a2c', rare: 1 };
  const mid = FS.pose(100, 80, 70, 95, 'reel', 0.4, 0, koi);
  assert(mid.fish && mid.fish.glow, 'rare fish glows on the way out');
  assert(mid.fish.x > 70 && mid.fish.x < 100, 'fish arcs toward the farmer: ' + mid.fish.x);
  assert(mid.fish.y < 95 - 4, 'fish is out of the water: ' + mid.fish.y);
  const land = FS.pose(100, 80, 70, 95, 'show', 0.3, 0, koi);
  assert(land.fish && land.fish.landed && land.fish.glow, 'glow lasts after landing');
  assert(land.emote && land.emote.a > 0 && land.emote.y < 80 - 20, 'a happy emote floats above the head');
  const miss = FS.pose(100, 80, 70, 95, 'reel', 0.4, 0, { miss: true });
  assert(!miss.fish && !miss.emote, 'a miss has no fish and no emote');
  const common = FS.pose(100, 80, 70, 95, 'show', 0.3, 0, { miss: false, fish: 'crucian', rare: 0 });
  assert(common.fish && !common.fish.glow && !common.emote, 'a common catch does not glow or emote');
  const early = FS.pose(100, 80, 70, 95, 'cast', 0.3, 0);
  assert(early.tip.y < early.grip.y && early.tip.x < early.grip.x, 'cast already aims at the pond');
});
ok('animals: each kind is gated by its region and its building; coop is a home building with no region', () => {
  const up = SIM.emptyUpgrades(), lock = id => SIM.offer(up, 1e5, id).locked;
  assert(SIM.offer(up, 1e5, 'coop').ok); assert.strictEqual(lock('chicken'), 'coop'); assert(SIM.offer(up, 1e5, 'cat').ok && SIM.offer(up, 1e5, 'dog').ok);
  assert.deepStrictEqual([lock('sty'), lock('fold'), lock('shed')], ['forest', 'orchard', 'pasture']);
  up.forest = 1; up.orchard = 1; up.pasture = 1; assert.deepStrictEqual([lock('pig'), lock('sheep'), lock('cow')], ['sty', 'fold', 'shed']);
  up.sty = 1; up.fold = 1; up.shed = 1; up.coop = 1; for (const id of ['chicken', 'pig', 'sheep', 'cow']) assert(SIM.offer(up, 1e5, id).ok, id);
  const cost = id => SIM.shopItem(id).levels.map(l => l.cost);
  assert.deepStrictEqual([cost('coop'), cost('sty'), cost('fold'), cost('shed')], [[300], [500], [900], [1500]]);
  assert.deepStrictEqual([cost('chicken').length, cost('pig').length, cost('sheep').length, cost('cow').length], [12, 6, 6, 6]);
  for (const id of ['chicken', 'pig', 'sheep', 'cow', 'cat', 'dog']) { const c = cost(id); assert(c.every((v, i) => !i || v > c[i - 1]), id); }
  up.chicken = 2; up.cow = 1; up.pig = 1; assert.deepStrictEqual(SIM.effects(up).animals, { chicken: 2, sheep: 0, cow: 1, pig: 1 });
  assert.deepStrictEqual(SAVE.PRODUCT_IDS, AN.PRODUCT_IDS); assert.deepStrictEqual(SAVE.ANIMAL_IDS, AN.KIND_IDS); assert.deepStrictEqual(SAVE.PEN_IDS, AN.PEN_IDS); assert.deepStrictEqual(AN.PEN_IDS, WD.PEN_IDS);
  for (const k of AN.KIND_IDS) assert(AN.PEN_IDS.includes(AN.KINDS[k].home), k);
});
ok('pets: cats and dogs come from the shop levels, three coats each, small bonuses', () => {
  const up = SIM.emptyUpgrades(), base = SIM.effects(up).walk; assert.deepStrictEqual(SIM.effects(up).pets, { cat: 0, dog: 0 });
  up.dog = 2; up.cat = 3; const e = SIM.effects(up); assert.deepStrictEqual(e.pets, { cat: 3, dog: 2 }); assert.strictEqual(e.walk, Math.round(base * 1.06 * 1000) / 1000);
  assert.deepStrictEqual([AN.PETS.cat.coats.length, AN.PETS.dog.coats.length], [3, 3]);
  assert.strictEqual(new Set([0, 1, 2].map(i => AN.pet('cat', i).coat)).size, 3); assert(SIM.shopItem('cat').levels[0].cost <= 200);
});
ok('animal care: fed + watered + petted gets happy and gives double; hungry gives nothing and sulks', () => {
  const run = (days, care) => { const a = [AN.animal('c', 'chicken')]; let got = 0; for (let d = 0; d < days; d++) { a[0].pet = care.pet ? 1 : 0;
    const r = AN.overnight(a, { feed: care.feed ? 1 : 0, water: care.water ? 1 : 0 }); got += r.report.made.egg || 0; a[0].ready = 0; } return { got, h: a[0].h }; };
  const best = run(6, { feed: 1, water: 1, pet: 1 }); assert.strictEqual(best.h, 100); assert.strictEqual(best.got, 6 * 2); // 60 + 20 is already happy after the first night
  const plain = run(6, { feed: 1, water: 1 }); assert(plain.h > 60 && plain.h < 100); assert(plain.got >= 6 && plain.got < best.got);
  const hungry = run(3, { water: 1, pet: 1 }); assert.strictEqual(hungry.got, 0); assert(hungry.h < AN.SULKY);
  const sheep = [AN.animal('s', 'sheep')]; let wool = 0; for (let d = 0; d < 9; d++) { const r = AN.overnight(sheep, { feed: 2, water: 1 }); wool += r.report.made.wool ? 1 : 0; sheep[0].ready = 0; } assert.strictEqual(wool, 3);
  const pig = [AN.animal('p', 'pig')]; let tr = 0; for (let d = 0; d < 8; d++) { const r = AN.overnight(pig, { feed: 2, water: 1 }); tr += r.report.made.truffle ? 1 : 0; pig[0].ready = 0; } assert.strictEqual(tr, 4);
  const t = AN.overnight([AN.animal('a', 'cow'), AN.animal('b', 'chicken')], { feed: 3, water: 1 }); assert.strictEqual(t.report.hungry, 1); assert.deepStrictEqual(t.trough, { feed: 0, water: 0 });
  const full = AN.animal('f', 'chicken'); full.ready = AN.MAX_READY; AN.overnight([full], { feed: 1, water: 1 }); assert.strictEqual(full.ready, AN.MAX_READY);
});
ok('each pen eats from its own trough; an empty pen keeps its feed', () => {
  const T = { coop: { feed: 2, water: 1 }, sty: { feed: 0, water: 1 }, fold: { feed: 4, water: 1 }, shed: { feed: 6, water: 1 } };
  const r = AN.overnightPens([AN.animal('c0', 'chicken'), AN.animal('c1', 'chicken'), AN.animal('p0', 'pig'), AN.animal('w0', 'cow')], T);
  assert.deepStrictEqual(r.troughs.coop, { feed: 0, water: 0 }); assert.deepStrictEqual(r.troughs.fold, { feed: 4, water: 1 }); assert.strictEqual(r.troughs.shed.feed, 3);
  assert.strictEqual(r.report.fed, 3); assert.strictEqual(r.report.hungry, 1);
});
ok('pens sit in their own region (coop at home, sty at the forest edge behind the house) and do not overlap each other or the house', () => {
  const box = P => [P.bld.x - 14, P.bld.y - 14, P.bld.x + 14, P.bld.y + 14], hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const k of WD.PEN_IDS) { const P = WD.PENS[k], r = P.needs && WD.region(P.needs);
    if (r && k !== 'sty') for (const pt of [P.bld, P.door, P.trough, { x: P.roam[0], y: P.roam[1] }, { x: P.roam[2], y: P.roam[3] }]) assert(WD.inRect(pt.x, pt.y, r.rect), `${k} ${pt.x},${pt.y}`);
    for (const j of WD.PEN_IDS) if (j !== k) assert(!hit(box(P), box(WD.PENS[j])), k + '/' + j);
    assert(!hit(box(P), [16, 6, 56, 40]), k + ' vs house'); }
  const p = WD.region('pasture'); for (const r of WD.REGIONS) if (r !== p) assert(!(p.rect[0] < r.rect[2] && r.rect[0] < p.rect[2] && p.rect[1] < r.rect[3] && r.rect[1] < p.rect[3]), r.id);
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
  const map = (w => (w.x1 - w.x0) / WD.TILE + 'x' + (w.y1 - w.y0) / WD.TILE)(WD.WORLD); assert.strictEqual(map, '198x74'); // v5.5.0: the ring adds 12 tiles each side east-west and 12 north-south; v5.8.0: the town strip adds 24 more east; v5.11.0: 46 more; v5.12.2: +40 for 东门大道
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
ok('chopping (v5.0; v5.3.1: 8 wood): wood and a sapling; any wild tree at home or in a bought region; fruit trees and the rim forest never', () => {
  const seq = a => { let i = 0; return () => a[i++ % a.length]; };
  assert.deepStrictEqual(WD.chopYield(seq([0.1, 0.9])), { wood: WD.WOOD.perChop, sapling: 'apple', drop: null }); assert.strictEqual(WD.chopYield(seq([0.9, 0.99])).sapling, 'orange');
  const trees = WD.defaultTrees(), wild = trees.filter(t => t.kind === 'wild'), a = trees.find(t => t.kind === 'apple');
  assert(wild.length >= 29); assert.strictEqual(trees.filter(t => t.kind === 'apple').length, 3); assert.deepStrictEqual(WD.defaultTrees(), trees);
  const w = wild.find(t => WD.areaAt(t.x, t.y) === 'forest'), home = wild.filter(t => WD.areaAt(t.x, t.y) === 'home');
  assert(home.length >= 6); assert(home.every(t => WD.choppable(t, []))); assert(home.every(t => !WD.regrows(t)));
  assert(WD.choppable(w, ['forest'])); assert(!WD.choppable(w, [])); assert(WD.regrows(w)); assert(!WD.choppable(a, ['forest', 'orchard']));
  assert(!WD.choppable(Object.assign({}, w, { stage: 'stump' }), ['forest']));
  for (const t of wild) { const r = WD.areaAt(t.x, t.y); assert(r, `${t.id} is in an area`); if (r !== 'home') assert(!WD.choppable(t, []), `${t.id} locked until ${r} is bought`); }
  // the framing forest round the map edge is scenery: it is not in S.trees at all, and any spot outside every area is never choppable
  for (const [x, y] of [[-30, 60], [230, 140], [100, -30], [-20, 140], [210, 10], [-40, 110]]) assert(!WD.choppable({ kind: 'wild', stage: 'tree', x, y }, SIM.SHOP.filter(i => i.region).map(i => i.id)), `${x},${y}`);
  assert(wild.every(t => !WD.seaAt || !WD.seaAt(t.x, t.y)));
});
ok('chop drops: about 60% of chops drop something; fruit, flower, rare seed, coins or a nest, each in range', () => {
  let x = 1; const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647, n = {}, N = 20000;
  for (let i = 0; i < N; i++) { const y = WD.chopYield(rnd); n[y.drop || 'none'] = (n[y.drop || 'none'] || 0) + 1;
    if (y.drop === 'fruit') { assert(WD.FRUIT[y.fruit]); assert.strictEqual(y.n, 2); }
    if (y.drop === 'seed') assert(['strawberry', 'watermelon'].includes(y.seed));
    if (y.drop === 'coins') assert(y.gold >= 10 && y.gold <= 30); }
  for (const d of WD.DROPS) assert(Math.abs(n[d.id] / N - d.p) < 0.02, d.id); assert(Math.abs(n.none / N - 0.4) < 0.02);
});
ok('save.js and sim.js agree on crops and shop items', () => { assert.deepStrictEqual(SAVE.CROP_IDS, SIM.IDS); assert.deepStrictEqual(SAVE.UPGRADE_IDS.filter(k => k !== 'speed'), SIM.SHOP_IDS.filter(k => !SIM.shopItem(k).mach)); }); // v5.11.0.29: machines are saved in works.mach // v5.10.2: save.js keeps the legacy speed level to refund it
ok('shop tabs cover every item once', () => {
  const ids = SIM.SHOP_TABS.flatMap(t => t.ids);
  assert.deepStrictEqual(ids.slice().sort(), SIM.SHOP_IDS.slice().sort());
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const t of SIM.SHOP_TABS) assert(t.name && t.ids.length, t.id);
});
ok('shop: costs, short amount, max level', () => {
  const o = SIM.offer({}, 50, 'can'); assert.strictEqual(o.cost, 80); assert.strictEqual(o.ok, false); assert.strictEqual(o.short, 30);
  assert.strictEqual(SIM.offer({}, 80, 'can').ok, true); assert.strictEqual(SIM.offer({ can: 4 }, 1e9, 'can').maxed, true);
  assert(!SIM.SHOP_IDS.includes('speed'), 'v5.10.2: no game speed in the shop'); assert(!SIM.SHOP_TABS.some(t => t.ids.includes('speed')));
  for (const id of SIM.SHOP_IDS) { const L = SIM.shopItem(id).levels; const flat = (SIM.shopItem(id).p8 && (id === 'sprinkler' || id === 'hive')) || SIM.shopItem(id).flat; for (let i = 1; i < L.length; i++) assert(id === 'roof' ? L[i].cost <= L[i - 1].cost /* v5.10.3: a later roof colour is cheaper */ : flat ? L[i].cost === L[i - 1].cost : L[i].cost > L[i - 1].cost, id + ' gets dearer'); } // v5.6.0: sprinklers and hives are a flat price each
});
ok('v5.10.2: a bought 2x / 4x is refunded once (600 / 3600), settings keep only speed 1 and the refund', () => {
  assert.deepStrictEqual([0, 1, 2, 3, -1, 'x'].map(SIM.speedRefund), [0, 600, 3600, 3600, 0, 0]);
  const v = SAVE.validate(Object.assign(SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v10-day59-manor.json'), 'utf8'))), { settings: { speed: 4, speedRefund: 3600.4 } }));
  assert.strictEqual(v.upgrades.speed, 2); assert.deepStrictEqual([v.settings.speed, v.settings.speedRefund], [1, 3600]);
});
ok('shop effects: base and fully upgraded', () => {
  const b = SIM.effects({}); assert.deepStrictEqual([b.waterMax, b.walk, b.basket, b.till3], [SIM.WATER_MAX0, 1, SIM.BASKET, false]); assert(!('speedMax' in b));
  assert.deepStrictEqual(b.crops, ['carrot', 'cabbage', 'pumpkin']);
  const max = {}; for (const id of SIM.SHOP_IDS) max[id] = SIM.shopItem(id).levels.length; const m = SIM.effects(max);
  assert.deepStrictEqual([m.waterMax, m.water3, m.walk, m.basket, m.till3, m.tillDur], [40, true, 1.962, 40, true, 2]); // 1.8 boots × 1.09 from three dogs
  assert.deepStrictEqual(m.crops, SIM.IDS);
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

// ---- v5.0 phase 5: wood as a material, house tiers, family ----
ok('house tiers cost wood + gold, raise the population and the woodshed; fence costs wood; offer() reports missing wood', () => {
  const L = SIM.shopItem('house').levels; assert.deepStrictEqual(L.map(l => [l.cost, l.wood]), [[800, 40], [3000, 150], [8000, 400]]);
  assert.deepStrictEqual(WD.HOUSE_TIERS.map(t => t.pop), [1, 2, 3, 4]); assert.deepStrictEqual(WD.HOUSE_TIERS.map(t => t.name), ['小木屋', '大木屋', '二层农舍', '庄园']);
  for (let i = 1; i < WD.HOUSE_TIERS.length; i++) assert(WD.HOUSE_TIERS[i].woodCap > WD.HOUSE_TIERS[i - 1].woodCap);
  const o = SIM.offer({}, 1000, 'house', 10); assert(!o.ok); assert.strictEqual(o.shortWood, 30); assert.strictEqual(o.short, 0);
  assert(SIM.offer({}, 800, 'house', 40).ok); assert(!SIM.offer({}, 799, 'house', 400).ok); assert.strictEqual(SIM.offer({}, 1e5, 'house').shortWood, 40); // no wood argument = none
  assert.strictEqual(SIM.offer({ house: 3 }, 1e9, 'house', 1e9).maxed, true); assert.strictEqual(SIM.effects({ house: 2 }).house, 2); assert.strictEqual(SIM.effects({}).house, 0);
  assert.strictEqual(SIM.offer({}, 200, 'fence', 60).ok, true); assert.strictEqual(SIM.effects({ fence: 1 }).fence, true);
  assert(L[0].wood <= 60 && L[2].wood >= 300); // first house by the axe's first week; the manor takes the forest's regrowth into the late game
});
ok('fences: +4 mood a night for every animal', () => {
  const a = [AN.animal('chicken0', 'chicken')], b = [AN.animal('chicken0', 'chicken')], tr = () => ({ feed: 9, water: 1 });
  AN.overnight(a, tr()); AN.overnight(b, tr(), AN.CARE.fence); assert.strictEqual(b[0].h - a[0].h, Math.min(AN.CARE.fence, 100 - a[0].h));
});
ok('family: 阿禾 keeps the stall; one chat and one gift a day, +1 for the first two sale trips, she moves in at 100 love once the house has room', () => {
  const f = FAM.empty(); assert.strictEqual(FAM.MEET_DAY, 1);
  assert.strictEqual(FAM.visit(f, 3, 'flower', 2), FAM.CHAT + 12 + FAM.SALE); assert.strictEqual(f.met, 3);
  assert.strictEqual(FAM.visit(f, 3, null, 5), FAM.SALE); assert.strictEqual(FAM.visit(f, 3, null, 5), 0, 'only two sale bonuses a day'); assert.strictEqual(FAM.visit(f, 3, 'flower', 0), 0, 'one gift a day');
  assert.strictEqual(FAM.visit(f, 4, null, 0), FAM.CHAT); assert.strictEqual(f.sales, 0, 'sale count resets each day');
  for (const id of FS.FISH_IDS) assert.strictEqual(FAM.giftValue(id), FAM.GIFT_FISH, id);
  assert.strictEqual(FAM.giftValue('wool'), 0); assert.strictEqual(FAM.bestGift(['carrot', 'egg', 'apple', 'wool']), 'apple'); assert.strictEqual(FAM.bestGift(['carrot', 'milk']), null);
  let d = 5; while (f.love < 100) { FAM.visit(f, d, 'egg', 3); FAM.visit(f, d++, null, 3); } assert(d - 3 >= 8 && d - 3 <= 14, 'eggs and two sale trips a day: about ten days (' + (d - 3) + ')');
  assert.deepStrictEqual(FAM.morning(f, d, 1), ['waiting']); assert.strictEqual(f.moved, 0);
  assert.deepStrictEqual(FAM.morning(f, d + 1, 2), ['moved']); assert.strictEqual(f.moved, d + 1);
  assert.strictEqual(FAM.visit(f, d + 2, 'flower'), 0); // no more courting once she lives here
  assert.deepStrictEqual(FAM.workers(f, d + 1).map(w => w.role), ['partner']);
});
ok('family: children need a bigger house and time; v5.4.3 baby -> play -> school -> helper -> teen; children only take light jobs', () => {
  const f = Object.assign(FAM.empty(), { love: 100, moved: 10 });
  for (let d = 10; d < 40; d++) FAM.morning(f, d, 2); assert.strictEqual(f.kids.length, 0, 'no room for a child in the 大木屋');
  const g = Object.assign(FAM.empty(), { love: 100, moved: 10 }); const born = [];
  for (let d = 11; d < 60; d++) { const pop = d < 30 ? 3 : 4; if (FAM.morning(g, d, pop).includes('born')) born.push(d); }
  assert.deepStrictEqual(born, [17, 30]); assert.deepStrictEqual(g.kids.map(k => k.name), ['小豆', '小米']);
  const k = g.kids[0]; // born day 17
  assert.strictEqual(FAM.kidStage(k, 17), 'baby'); assert.strictEqual(FAM.kidStage(k, 21), 'baby');
  assert.strictEqual(FAM.kidStage(k, 22), 'play'); assert.strictEqual(FAM.kidStage(k, 33), 'play');
  assert.strictEqual(FAM.kidStage(k, 34), 'school'); assert.strictEqual(FAM.kidStage(k, 45), 'school');
  assert.strictEqual(FAM.kidStage(k, 46), 'helper'); assert.strictEqual(FAM.kidStage(k, 59), 'helper');
  assert.strictEqual(FAM.kidStage(k, 60), 'teen');
  assert.deepStrictEqual(FAM.workers(g, 20).map(w => w.role), ['partner']);
  assert.deepStrictEqual(FAM.workers(g, 22).map(w => w.role), ['partner', 'play']);
  assert.deepStrictEqual(FAM.workers(g, 46).map(w => w.role), ['partner', 'child', 'play']); // 小豆 helper, 小米 (born 30, age 16) still play
  assert(FAM.canDo('child', 'feed') && FAM.canDo('child', 'pick') && !FAM.canDo('child', 'water') && !FAM.canDo('child', 'chop') && !FAM.canDo('child', 'buy'));
  assert(FAM.canDo('play', 'feed') === false && FAM.canDo('school', 'feed') && !FAM.canDo('school', 'harvest'));
  assert(FAM.canDo('teen', 'chop') && !FAM.canDo('teen', 'buy') && !FAM.canDo('teen', 'fish')); assert(FAM.canDo('partner', 'buy') && !FAM.canDo('partner', 'fish'));
});
ok('v5.3 family: each person prefers their own areas, helps elsewhere at a cost; alone the farmer has no preference; the next child is counted down', () => {
  const P = [{ id: 'partner', role: 'partner' }], M = [{ id: 'farmer' }];
  assert.strictEqual(FAM.affinity('farmer', undefined, 'field', []), 0, 'alone: no preference');
  assert.strictEqual(FAM.affinity('farmer', undefined, 'animal', []), 0);
  assert(FAM.affinity('farmer', undefined, 'field', P) > 0 && FAM.affinity('farmer', undefined, 'animal', P) < 0);
  assert(FAM.affinity('partner', 'partner', 'animal', M) > 0 && FAM.affinity('partner', 'partner', 'orchard', M) > 0 && FAM.affinity('partner', 'partner', 'field', M) < 0);
  assert.strictEqual(FAM.affinity('partner', 'partner', 'market', M), 0, 'nobody owns the market');
  assert(FAM.affinity('kid0', 'child', 'yard', M) > 0 && FAM.affinity('kid1', 'child', 'coop', M) > 0 && FAM.affinity('kid0', 'teen', 'field', M) > 0);
  assert(FAM.OWN - FAM.HELP > -30, 'helping still beats fishing (8-12) for most jobs');
  const f = Object.assign(FAM.empty(), { love: 100, moved: 41 });
  assert.deepStrictEqual(FAM.nextKid(f, 42, 3), { name: '小豆', days: 6 }); assert.strictEqual(FAM.kidText(FAM.nextKid(f, 42, 3)), '小豆还有 6 天到来');
  assert.strictEqual(FAM.kidText(FAM.nextKid(f, 47, 3)), '小豆明天就来了'); assert.deepStrictEqual(FAM.nextKid(f, 47, 2), { name: '小豆', room: true });
  const g = Object.assign(FAM.empty(), { love: 100, moved: 41 }); for (let d = 42; d <= 60; d++) { const n = FAM.nextKid(g, d - 1, 4); if (FAM.morning(g, d, 4).includes('born')) assert.strictEqual(n.days, 1, 'countdown said tomorrow the day before ' + d); }
  assert.strictEqual(g.kids.length, 2); assert.strictEqual(FAM.nextKid(g, 61, 4), null); assert.strictEqual(FAM.nextKid(FAM.empty(), 5, 4), null);
});
ok('v8 -> v9: house and fence at 0, nobody met yet, wild trees appended once, wood, regions and animals kept', () => {
  const v8 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v8-day4.json'), 'utf8')); v8.inventory.wood = 37; v8.upgrades.forest = 1; v8.upgrades.chicken = 2; v8.upgrades.coop = 1;
  v8.animals = [AN.animal('chicken0', 'chicken'), AN.animal('chicken1', 'chicken')]; v8.trees = WD.defaultTrees().filter(t => !/^h/.test(t.id)); v8.trees[0].stage = 'stump';
  const s = SAVE.migrate(v8); assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert.strictEqual(s.upgrades.house, 0); assert.strictEqual(s.upgrades.fence, 0); assert.strictEqual(s.inventory.wood, 37); assert.strictEqual(s.upgrades.forest, 1); assert.strictEqual(s.animals.length, 2);
  assert.deepStrictEqual(s.family, FAM.empty()); assert.deepStrictEqual(s.members, []);
  assert.strictEqual(s.trees.length, v8.trees.length + WD.EXTRA_TREES.length); assert.strictEqual(s.trees[0].stage, 'stump');
  assert.deepStrictEqual(s.trees.slice(v8.trees.length).map(t => t.id), WD.EXTRA_TREES.map(t => t.id));
  assert.deepStrictEqual(s.trees.slice(v8.trees.length), WD.EXTRA_TREES); // the frozen copy in migration 9 matches world.js
  const again = SAVE.migrate(Object.assign({}, v8, { trees: WD.defaultTrees() })); assert.strictEqual(again.trees.length, WD.defaultTrees().length); // no duplicates
  assert.strictEqual(SAVE.migrate(Object.assign({}, v8, { trees: null })).trees, null);
});
ok('v9 validation: family and members are clamped, junk dropped', () => {
  const v = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v8-day4.json'), 'utf8')));
  const s = SAVE.migrate(Object.assign(v, { family: { love: 999, met: 3, chatDay: 5, gifts: 4, moved: 9, kids: [{ id: 'kid0', name: '小豆', born: 20 }, { id: 'kid7', name: 'x', born: 1 }, 5] },
    members: [{ id: 'partner', water: 3, bag: { carrot: 2 }, gathered: 1, basket: ['egg', 'flower', 'rock'] }, { id: 'stranger' }, null] }));
  assert.strictEqual(s.family.love, 100); assert.deepStrictEqual(s.family.kids, [{ id: 'kid0', name: '小豆', born: 20 }]);
  assert.strictEqual(s.members.length, 1); assert.deepStrictEqual(s.members[0].basket, ['egg', 'flower']); assert.strictEqual(s.members[0].bag.carrot, 2);
});

ok('v9 -> v10: empty book is filled from catches and basket rares, streaks start at 0, fish food is 0', () => {
  const v9 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v9-day4.json'), 'utf8'));
  v9.catches = [{ id: 'crucian', name: '鲫鱼', gold: 5, water: 'pond', day: 3 }, { id: 'koi', name: '锦鲤', gold: 36, water: 'pond', day: 4 }];
  v9.inventory = Object.assign({}, v9.inventory, { basket: ['carp', { type: 'egg', rare: 'gold' }] });
  v9.coins = 50; v9.stats = Object.assign({}, v9.stats, { earned: 80 });
  const s = SAVE.migrate(v9);
  assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert.strictEqual(s.inventory.fishFood, 0); assert.deepStrictEqual(s.inventory.ornament, { koi: 0, goldfish: 0 });
  assert.deepStrictEqual(s.pondFish, []);
  assert(s.codex.entries['fish:crucian'] && s.codex.entries['fish:koi'] && s.codex.entries['fish:carp']);
  assert.strictEqual(s.codex.entries['fish:koi'].firstDay, 4);
  assert(s.codex.entries['rare:gold']); assert(!s.codex.entries['fish:sword']); assert(!s.codex.entries['giant:pumpkin']);
  assert(s.achievements.some(u => u.id === 'truecatch'), 'koi in the catch log seeds 这波是真的');
  assert(!s.achievements.some(u => u.id === 'idleweek'), 'lying-flat is not awarded on load');
  assert.strictEqual(s.streaks.noShop, 0); assert.strictEqual(s.streaks.happy, 0);
  assert(s.milestones.some(u => u.id === 'open'));
});
ok('v10 validation: junk book entries dropped, pond cap 8, sea fish stay out, unlocks de-duplicated', () => {
  const v9 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v9-day4.json'), 'utf8'));
  const raw = Object.assign({}, v9, {
    saveVersion: 10,
    inventory: Object.assign({}, v9.inventory, { fishFood: 99, ornament: { goldfish: 4, sword: 9, koi: -2 } }),
    pondFish: [{ id: 'pf1', kind: 'koi', day: 4 }, { id: 'pf1', kind: 'koi', day: 5 }, { id: 'x', kind: 'sword', day: 1 }, { id: 'pf2', kind: 'goldfish', day: 6 }],
    codex: { entries: { 'fish:koi': { firstDay: 4, count: 2 }, 'nope:x': { firstDay: 1, count: 1 }, 'fish:': { firstDay: 1, count: 1 } } },
    achievements: [{ id: 'truecatch', day: 4 }, { id: 'truecatch', day: 5 }, { id: 'bogus', day: 1 }],
    milestones: [{ id: 'open', day: 1 }, { id: 'nope', day: 2 }],
    streaks: { noShop: -3, shopDay: 2, happy: 99, dogDay: 1 },
  });
  const s = SAVE.migrate(raw);
  assert.strictEqual(s.inventory.fishFood, 30); assert.strictEqual(s.inventory.ornament.goldfish, 4); assert.strictEqual(s.inventory.ornament.koi, 0);
  assert.deepStrictEqual(s.pondFish.map(f => f.kind), ['koi', 'goldfish']);
  assert.deepStrictEqual(Object.keys(s.codex.entries), ['fish:koi']);
  assert.deepStrictEqual(s.achievements, [{ id: 'truecatch', day: 4 }]);
  assert.deepStrictEqual(s.milestones.filter(u => u.id === 'open'), [{ id: 'open', day: 1 }]);
  assert.strictEqual(s.streaks.noShop, 0); assert.strictEqual(s.streaks.happy, 99);
});

ok('v10 append-only: missing weather and bug net get defaults; insect book keys are kept', () => {
  const raw = Object.assign({}, JSON.parse(fs.readFileSync(path.join(FIX, 'save-v10-day4.json'), 'utf8')));
  delete raw.weather; delete raw.bugNet;
  raw.codex = { entries: { 'bug:white': { firstDay: 4, count: 2 }, 'fish:koi': { firstDay: 2, count: 1 } } };
  const s = SAVE.validate(SAVE.migrate(raw));
  assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert.strictEqual(s.bugNet, 0);
  assert.ok(s.weather);
  assert.strictEqual(s.weather.rained, 0);
  assert.strictEqual(s.weather.nextDay, 0);
  assert.ok(s.codex.entries['bug:white']);
  assert.ok(s.codex.entries['fish:koi']);
});
ok('v10 validate keeps a scheduled shower and a bought net', () => {
  const raw = Object.assign({}, JSON.parse(fs.readFileSync(path.join(FIX, 'save-v10-day4.json'), 'utf8')));
  raw.weather = { nextDay: 12, start: 600, dur: 180, lastDay: 4, rained: 1, nextStart: 700, nextDur: 120 };
  raw.bugNet = 1;
  const s = SAVE.validate(SAVE.migrate(raw));
  assert.strictEqual(s.weather.lastDay, 4);
  assert.strictEqual(s.weather.nextDay, 12);
  assert.strictEqual(s.weather.dur, 180);
  assert.strictEqual(s.weather.nextStart, 700);
  assert.strictEqual(s.bugNet, 1);
});

ok('v10 keeps weather, bugNet and kids growth fields together through the v11 migration', () => {
  const raw = Object.assign({}, JSON.parse(fs.readFileSync(path.join(FIX, 'save-v10-day4.json'), 'utf8')));
  raw.weather = { nextDay: 12, start: 600, dur: 180, lastDay: 4, rained: 1, nextStart: 700, nextDur: 120 };
  raw.bugNet = 1;
  raw.family = { moved: 1, kidGrowth: 1, kids: [{ id: 'kid0', name: '小豆', born: 0, floor: 'helper' }] };
  const s = SAVE.validate(SAVE.migrate(raw));
  assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert.strictEqual(s.bugNet, 1);
  assert.strictEqual(s.weather.nextDay, 12);
  assert.strictEqual(s.family.kidGrowth, 1);
  assert.strictEqual(s.family.kids[0].floor, 'helper');
});

ok('v15 old save gets an empty inn; a filled inn round-trips (append-only, saveVersion stays 15)', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v15-day72-cottage.json'), 'utf8'));
  const s = SAVE.validate(SAVE.migrate(raw));
  assert.strictEqual(s.saveVersion, 15);
  assert.deepStrictEqual(s.inn.cabins, 0);
  assert.strictEqual(s.inn.diner.lv, 0);
  assert.deepStrictEqual(s.inn.guests, []);
  assert.strictEqual(s.inn.stars.avg, 3);
  assert.deepStrictEqual(s.inn.earn, { rooms: 0, meals: 0 });
  const filled = Object.assign({}, raw, { inn: { cabins: 2, guests: [{ id: 'g11', look: 'innC', n: 2, room: 1, from: 70, until: 72, at: 700 }], diner: { lv: 2, menu: 'auto', served: 40 }, stars: { last: [{ day: 70, s: 4, note: '羊好软' }] }, earn: { rooms: 900, meals: 1600 } } });
  const t2 = SAVE.validate(SAVE.migrate(filled));
  assert.strictEqual(t2.saveVersion, 15);
  assert.strictEqual(t2.inn.cabins, 2);
  assert.strictEqual(t2.inn.guests[0].look, 'innC');
  assert.strictEqual(t2.inn.diner.lv, 2);
  assert.strictEqual(t2.inn.stars.avg, 4);
  assert.strictEqual(t2.inn.earn.rooms, 900);
  const again = SAVE.validate(JSON.parse(JSON.stringify(t2)));
  assert.deepStrictEqual(again.inn, t2.inn);
});

ok('v5.11.0.30: home.held is append-only; junk ids drop; empty/missing stays omitted; a second validate does not duplicate', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v15-day72-cottage.json'), 'utf8'));
  const plain = SAVE.validate(SAVE.migrate(raw));
  assert.strictEqual(plain.saveVersion, 15);
  assert.ok(!('held' in plain.home), 'missing held stays omitted');

  const withHeld = Object.assign({}, raw, { home: Object.assign({}, raw.home, { held: [
    { id: 'sp_kid0', basket: ['honey', 'honey', 'rock'] },
    { id: 'ghost', basket: ['honey'] },
    { id: 'sp_kid0', basket: ['honey', 'honey'] },
    { id: 'sp_kid1', basket: [] },
    { id: 'partner', basket: ['honey'] }
  ] }) });
  const s = SAVE.validate(SAVE.migrate(withHeld));
  assert.strictEqual(s.saveVersion, 15);
  assert.deepStrictEqual(s.home.held, [{ id: 'sp_kid0', basket: ['honey', 'honey'] }]);
  const again = SAVE.validate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(again.home.held, s.home.held);
  const empty = SAVE.validate(SAVE.migrate(Object.assign({}, raw, { home: Object.assign({}, raw.home, { held: [] }) })));
  assert.ok(!('held' in empty.home), 'empty held stays omitted');
});

ok('v15: already-moved-in married kids light 新房入伙 on load, keeping the move-in day', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v15-day72-cottage.json'), 'utf8'));
  assert(!(raw.achievements || []).some(u => u.id === 'newhouse'), 'fixture still has the locked stub state');
  assert.strictEqual(raw.home.wed.kid0.moved, 71);
  const s = SAVE.migrate(JSON.parse(JSON.stringify(raw)));
  assert.strictEqual(s.saveVersion, 15);
  const u = s.achievements.find(x => x.id === 'newhouse');
  assert(u, 'load backfills 新房入伙');
  assert.strictEqual(u.day, 71, 'uses the first move-in day, not today');
  const again = SAVE.migrate(JSON.parse(JSON.stringify(s)));
  assert.deepStrictEqual(again.achievements.filter(x => x.id === 'newhouse'), [{ id: 'newhouse', day: 71 }]);
  const booked = JSON.parse(JSON.stringify(raw));
  booked.achievements = (booked.achievements || []).concat([{ id: 'newhouse', day: 71 }]);
  const kept = SAVE.migrate(booked);
  assert.deepStrictEqual(kept.achievements.filter(x => x.id === 'newhouse'), [{ id: 'newhouse', day: 71 }]);
  const pending = JSON.parse(JSON.stringify(raw));
  pending.home.wed.kid0.moved = 0;
  pending.home.houses[0].kid = null;
  const locked = SAVE.migrate(pending);
  assert(!locked.achievements.some(x => x.id === 'newhouse'), 'a wedding that has not moved in stays locked');
});
