// Unit tests for phase 8 (v5.6.0, works.js + the v12 save):  node tools/works-test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const PW = require('../works.js'), SAVE = require('../save.js'), SIM = require('../sim.js'), PL = require('../plots.js'), AN = require('../animals.js'), WD = require('../world.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const T = PW.TILE;
// a 6x3 field at c0=2, r0=4 with tile centres like the game's
const fd = { id: 'f', c0: 2, r0: 4, cols: 6, rows: 3 };
const tilesOf = (f, open = true) => { const out = []; for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) out.push({ f: f.id, c, r, x: (f.c0 + c) * T + T / 2, y: (f.r0 + r) * T + T / 2, open }); return out; };

ok('sprinkler: an edge spot between two columns waters 4x2 = 8 tiles', () => {
  const tiles = tilesOf({ id: 'f', c0: 0, r0: 0, cols: 8, rows: 4 }), s = { x: 4 * T, y: -PW.SPRINKLER.off };
  assert.strictEqual(tiles.filter(t => PW.covers(s, t)).length, 8);
});
ok('sprinkler: greedy placement covers every open tile, then returns null', () => {
  const tiles = tilesOf(fd), placed = [];
  for (let i = 0; i < 20; i++) { const s = PW.nextSpot([fd], tiles, placed); if (!s) break; assert(PW.spotOk(s.x, s.y, tiles).ok); placed.push(s); }
  assert(tiles.every(t => placed.some(s => PW.covers(s, t)))); assert.strictEqual(PW.nextSpot([fd], tiles, placed), null); assert(placed.length <= 4, 'placed ' + placed.length);
});
ok('sprinkler: closed tiles are not counted; spots on a tile or far away are refused', () => {
  const tiles = tilesOf(fd, false); assert.strictEqual(PW.nextSpot([fd], tiles, []), null);
  const open = tilesOf(fd); assert(!PW.spotOk(open[0].x, open[0].y, open).ok); assert(!PW.spotOk(500, 500, open).ok);
});
ok('sprinkler gate: the sprinkler can (level 4) or three workers', () => {
  assert(!PW.sprinklerGate({ can: 3 }, 2)); assert(PW.sprinklerGate({ can: 4 }, 1)); assert(PW.sprinklerGate({ can: 0 }, 3));
});
ok('workshop: two inputs make one product after the batch time; the out shelf caps it', () => {
  const def = PW.WORKS.jam, w = { inp: 8, left: 0, ready: 0 }; let made = 0;
  for (let t = 0; t < def.mins * 10; t++) made += PW.workStep(w, def, 1);
  assert.strictEqual(made, 4); assert.strictEqual(w.ready, 4); assert.strictEqual(w.inp, 0);
  const full = { inp: 4, left: 0, ready: def.outCap }; PW.workStep(full, def, 1); assert.strictEqual(full.left, 0); assert.strictEqual(full.inp, 4);
});
ok('workshop gates: a 工坊院 plot first, three slots per yard; jam needs fruit, cheese a cow', () => {
  const ctx = { plots: {}, regions: [], works: {}, cows: 0, fruit: false };
  assert(/工坊院/.test(PW.workGate('mill', ctx)));
  ctx.plots = { wbank: { mod: 'workshop', day: 3 } }; assert.strictEqual(PW.workGate('mill', ctx), null);
  assert(/果园/.test(PW.workGate('jam', ctx))); assert(/牛/.test(PW.workGate('cheese', ctx)));
  ctx.regions = ['orchard']; ctx.fruit = true; ctx.cows = 1; assert.strictEqual(PW.workGate('jam', ctx), null); assert.strictEqual(PW.workGate('cheese', ctx), null);
  const works = {}; for (const id of ['mill', 'jam', 'cheese']) { const s = PW.freeSlot(ctx.plots, works); works[id] = { at: s.at, slot: s.slot }; }
  assert.deepStrictEqual(Object.values(works).map(w => w.slot), [0, 1, 2]); assert.strictEqual(PW.freeSlot(ctx.plots, works), null);
  const sp = [0, 1, 2].map(i => PW.slotPos('wbank', i)), r = PL.plot('wbank').rect; for (const p of sp) assert(p.x > r[0] && p.x < r[2] && p.y > r[1] && p.y < r[3]);
});
ok('power: wheels in purchase order, range 400; lamps by plot gates and workshops', () => {
  const plots = { sbank: { mod: 'dam', day: 5 }, wbank: { mod: 'workshop', day: 3 }, eslope: { mod: 'meadow', day: 6 } };
  assert.strictEqual(PW.wheelGate(plots, 0), null); assert(PW.wheelGate(plots, 1)); const w = PW.wheelsOf(plots, 1); assert.strictEqual(w.length, 1);
  const lamps = PW.lampSpots(plots, { mill: { at: 'wbank', slot: 0 } }); assert(lamps.some(l => l.id === 'pwbank')); assert(lamps.some(l => l.id === 'wmill'));
  const on = lamps.filter(l => PW.powered(l.x, l.y, w)), off = lamps.filter(l => !PW.powered(l.x, l.y, w));
  assert(on.some(l => l.id === 'h0')); assert(off.some(l => l.id === 'peslope'), 'the far east slope is out of range');
});
ok('hives: orchard holds two, a meadow six; honey every two days, capped', () => {
  assert(PW.hiveGate({}, [], 0)); assert.strictEqual(PW.hiveGate({}, ['orchard'], 1, []), null); assert(PW.hiveGate({}, ['orchard'], 2, [{ at: 'orchard', s: 0 }, { at: 'orchard', s: 1 }]));
  const plots = { glade: { mod: 'meadow', day: 2 } }; assert.strictEqual(PW.hiveCap(plots, ['orchard']), 6);
  const hives = []; for (let i = 0; i < 6; i++) { const s = PW.hiveFree(plots, ['orchard'], hives); hives.push({ at: s.at, s: s.s, cd: 2, ready: 0 }); }
  assert(hives.every(h => h.at === 'glade')); assert(hives.every(h => PW.hivePos(h, plots, ['orchard'])));
  const h = [{ cd: 2, ready: 0 }], one = () => 0.99; let made = 0; for (let d = 0; d < 10; d++) made += PW.hiveNight(h, one);
  assert.strictEqual(h[0].ready, PW.HIVE.readyCap); assert.strictEqual(made, PW.HIVE.readyCap);
});
ok('second pens: four quarters inside the host pasture; animals past the first building move in', () => {
  for (const id of PL.PLOT_IDS) { if (!PL.plot(id).mods.includes('pasture')) continue; const lay = PW.penLayout(id), r = PL.plot(id).rect;
    for (const k of PW.PEN2_IDS) { const P = lay[k]; for (const p of [P.bld, P.door, P.trough]) assert(p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3], id + ' ' + k); } }
  const animals = Array.from({ length: 9 }, (_, i) => AN.animal('chicken' + i, 'chicken'));
  PW.assignPens(animals, {}); assert(animals.every(a => !a.pen));
  PW.assignPens(animals, { coop2: 1 }); assert.deepStrictEqual(animals.map(a => a.pen || 'coop'), ['coop', 'coop', 'coop', 'coop', 'coop', 'coop', 'coop2', 'coop2', 'coop2']);
  assert(PW.animalGate('chicken', 6, {})); assert.strictEqual(PW.animalGate('chicken', 6, { coop2: 1 }), null); assert.strictEqual(PW.animalGate('chicken', 5, {}), null);
  assert(PW.pen2Gate('coop2', {}, null)); assert.strictEqual(PW.pen2Gate('coop2', { alp: { mod: 'pasture', day: 1 } }, null), null);
  const r = AN.overnightPens(animals.map(a => Object.assign({}, a)), { coop: { feed: 0, water: 0 }, coop2: { feed: 99, water: 1 } }); assert.strictEqual(r.report.fed, 3);
});
ok('herding: out in the morning, graze, back at dusk', () => {
  assert.deepStrictEqual([7 * 60, 8 * 60 + 10, 12 * 60, 16 * 60 + 50, 18 * 60].map(PW.herdPhase), [null, 'out', 'graze', 'back', null]);
});
ok('a plot with phase-8 buildings cannot be re-zoned', () => {
  assert(PW.plotBusy('wbank', { works: { mill: { at: 'wbank' } } })); assert(PW.plotBusy('glade', { hives: [{ at: 'glade' }] }));
  assert(PW.plotBusy('alp', { penHost: 'alp', pens2: true })); assert.strictEqual(PW.plotBusy('alp', { penHost: 'alp', pens2: false }), null);
});
ok('v5.11.0.32: second pens can leave a pasture when another 牧场 exists (pensMove); otherwise they still block', () => {
  const one = { alp: { mod: 'pasture', day: 51 } };
  const two = { alp: { mod: 'pasture', day: 51 }, neslope: { mod: 'pasture', day: 40 } };
  assert.strictEqual(PW.otherPasture(one, 'alp'), null);
  assert.strictEqual(PW.otherPasture(two, 'alp'), 'neslope');
  assert.strictEqual(PW.penMoveOk(two, 'alp', 'neslope').ok, true);
  assert.strictEqual(PW.penMoveOk(two, 'alp', 'alp').ok, false);
  assert.strictEqual(PW.penMoveOk(two, 'alp', 'glade').ok, false);
  assert(/改成牧场/.test(PW.plotBusy('alp', { penHost: 'alp', pens2: true, pensMove: true, plots: one })));
  assert.strictEqual(PW.plotBusy('alp', { penHost: 'alp', pens2: true, pensMove: true, plots: two }), null);
  // without pensMove the guard still stands, even if another pasture exists (assets stay protected)
  assert(PW.plotBusy('alp', { penHost: 'alp', pens2: true, plots: two }));
  assert.strictEqual(PW.plotBusy('neslope', { penHost: 'alp', pens2: true, pensMove: true, plots: two }), null);
});
ok('save: works round-trips through valid(); junk is dropped', () => {
  const plots = { wbank: { mod: 'workshop', day: 1 } };
  const v = PW.valid({ sprinklers: [{ x: 10, y: 20 }, { x: 'a' }], works: { mill: { at: 'wbank', slot: 1, inp: 99, left: 30, ready: 2 }, jam: { at: 'nowhere' }, bogus: {} }, hives: [{ at: 'orchard', s: 1, cd: 1, ready: 5 }, 'x'], penHost: 'alp' }, plots);
  assert.deepStrictEqual(v.sprinklers, [{ x: 10, y: 20 }]); assert.strictEqual(v.works.mill.inp, PW.WORKS.mill.inCap); assert.strictEqual(v.works.jam.at, null); assert(!v.works.bogus);
  assert.deepStrictEqual(v.hives, [{ at: 'orchard', s: 1, cd: 1, ready: PW.HIVE.readyCap }]); assert.strictEqual(v.penHost, 'alp');
  assert.deepStrictEqual(PW.valid(null, {}), PW.empty());
});
ok('save: the day-59 manor fixture (v10) migrates to v12 append-only', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8'));
  const s = SAVE.migrate(JSON.parse(JSON.stringify(raw)));
  assert.strictEqual(s.saveVersion, 15); assert.deepStrictEqual(s.works, PW.empty());
  for (const id of ['sprinkler', 'mill', 'jam', 'cheese', 'wheel', 'hive', 'coop2', 'sty2', 'fold2', 'shed2']) assert.strictEqual(s.upgrades[id], 0, id);
  for (const k of Object.keys(raw.upgrades)) assert.strictEqual(s.upgrades[k], raw.upgrades[k], k);
  assert.strictEqual(s.coins, raw.coins); assert.strictEqual(s.clock.day, raw.clock.day); assert.strictEqual(s.animals.length, raw.animals.length);
  for (const k of PW.PEN2_IDS) assert.deepStrictEqual(s.troughs[k], { feed: 0, water: 0 });
  assert.strictEqual(s.inventory.basket.length, raw.inventory.basket.length);
});
ok('shop: phase-8 items exist, wheat unlocks with the mill, gates go through SIM.gate', () => {
  assert.strictEqual(SIM.CROPS.wheat.unlock, 'mill'); assert(!SIM.effects({}).crops.includes('wheat')); assert(SIM.effects({ mill: 1 }).crops.includes('wheat'));
  const up = SIM.emptyUpgrades(); SIM.gate = id => id === 'mill' ? '先把一块新地选成「工坊院」' : null;
  const o = SIM.offer(up, 1e6, 'mill', 999); assert(!o.ok); assert.strictEqual(o.lockText, '先把一块新地选成「工坊院」');
  SIM.gate = null; assert(SIM.offer(up, 1e6, 'mill', 999).ok);
  assert.strictEqual(SIM.shopItem('sprinkler').levels.length, 16); assert.deepStrictEqual([SIM.shopItem('sprinkler').levels[0].cost, SIM.shopItem('sprinkler').levels[0].wood], [800, 20]);
});
ok('v5.10.12: a 工坊院 can be re-zoned once the game moves its workshops (worksMove)', () => {
  assert.strictEqual(PW.plotBusy('wbank', { worksMove: true, works: { mill: { at: 'wbank' } } }), null);
  assert(PW.plotBusy('glade', { worksMove: true, hives: [{ at: 'glade' }] }), 'hives still block');
});
ok('v5.10.12: slotIn finds a free slot in one yard; the moved workshop does not take its own', () => {
  const works = { mill: { at: 'wbank', slot: 0 }, jam: { at: 'wbank', slot: 1 }, cheese: { at: 'wbank', slot: 2 } };
  assert.strictEqual(PW.slotIn(works, 'wbank'), -1); assert.strictEqual(PW.slotIn(works, 'wbank', 'jam'), 1); assert.strictEqual(PW.slotIn(works, 'sbank'), 0);
});
ok('v5.10.12: evacuate moves workshops to another yard, else stores them (at null); restock puts them back', () => {
  const plots = { wbank: { mod: 'workshop', day: 1 }, sbank: { mod: 'workshop', day: 2 } };
  const works = { mill: { at: 'wbank', slot: 0, inp: 3, left: 10, ready: 2 }, jam: { at: 'wbank', slot: 1 }, cheese: { at: 'sbank', slot: 0 }, pie: { at: 'sbank', slot: 1 } };
  const m = PW.evacuate(plots, works, 'wbank');
  assert.deepStrictEqual(m, [{ id: 'mill', to: 'sbank', slot: 2 }, { id: 'jam', to: null, slot: 0 }]);
  assert.strictEqual(works.mill.at, 'wbank', 'evacuate is pure');
  // the caller applies it; the plot becomes a field; later a new 工坊院 restocks the stored one
  works.mill.at = 'sbank'; works.mill.slot = 2; works.jam.at = null; const plots2 = { wbank: { mod: 'field', day: 1 }, sbank: plots.sbank };
  assert.deepStrictEqual(PW.restock(plots2, works), [], 'no room yet');
  const plots3 = Object.assign({}, plots2, { glade: { mod: 'workshop', day: 9 } });
  assert.deepStrictEqual(PW.restock(plots3, works), [{ id: 'jam', to: 'glade', slot: 0 }]);
  // a stored workshop keeps its state through the save
  const v = PW.valid({ works: { mill: { at: 'sbank', slot: 2, inp: 3, left: 10, ready: 2 }, jam: { at: null, slot: 0, inp: 1, ready: 1 } } }, plots2);
  assert.strictEqual(v.works.jam.at, null); assert.strictEqual(v.works.jam.inp, 1); assert.strictEqual(v.works.jam.ready, 1); assert.strictEqual(v.works.mill.ready, 2);
});
ok('v5.11.0.29 machines: gates, feeder set, levels, never autobought', () => {
  const ctx = { wheel: 0, smithy: false, built: ['coop', 'sty', 'fold', 'shed', 'coop2', 'sty2', 'fold2', 'shed2'], coop2: true, shed2: true, hives: 6, meadow: true };
  assert(/水车/.test(PW.machGate('feeder', {}, ctx)) && /铁匠铺/.test(PW.machGate('feeder', {}, ctx)));
  assert(/铁匠铺/.test(PW.machGate('feeder', {}, Object.assign({}, ctx, { wheel: 1 }))));
  const ok2 = Object.assign({}, ctx, { wheel: 1, smithy: true }); assert.strictEqual(PW.machGate('feeder', {}, ok2), null); assert.strictEqual(PW.machGate('feedset', {}, ok2), null);
  assert.strictEqual(PW.machGate('chute', {}, Object.assign({}, ok2, { coop2: false })), '先盖第二鸡舍');
  assert.strictEqual(PW.machGate('milker', {}, Object.assign({}, ok2, { shed2: false })), '先盖第二牛棚');
  assert(/6 个蜂箱/.test(PW.machGate('tray', {}, Object.assign({}, ok2, { hives: 4 }))));
  const m = {}; assert.deepStrictEqual(PW.machBuy(m, 'feeder', ok2.built), ['coop']); assert.strictEqual(PW.fitCount(m), 1);
  assert.deepStrictEqual(PW.machBuy(m, 'feedset', ok2.built), ['sty', 'fold', 'shed', 'coop2', 'sty2', 'fold2', 'shed2']); assert.strictEqual(m.f, 255);
  assert(/都装上了/.test(PW.machGate('feeder', m, ok2))); assert.deepStrictEqual(PW.machLevels(m, ok2.built), { feeder: 8, feedset: 1, chute: 0, milker: 0, tray: 0 });
  const m2 = { f: 1 }; assert(/单个装更划算/.test(PW.machGate('feedset', m2, Object.assign({}, ok2, { built: ['coop', 'sty', 'fold', 'shed'] }))));
  for (const id of PW.MACH_IDS) { assert(SIM.shopItem(id) && SIM.shopItem(id).mach, id); assert(!SIM.AUTO_BUY.includes(id), id + ' must never be autobought'); assert(SIM.SHOP_TABS.find(t => t.id === 'works').ids.includes(id)); assert(!(id in SIM.emptyUpgrades()), id + ' is not an upgrade'); }
  assert.deepStrictEqual(['feeder', 'feedset', 'chute', 'milker', 'tray'].map(id => SIM.shopItem(id).levels[0].cost), [2500, 12000, 5000, 6000, 1500]); assert.strictEqual(SIM.shopItem('feeder').levels[0].wood, 30);
});
ok('v5.11.0.29 machines: fitted troughs fill from the hay, the bin caps / ships / saves as small ints', () => {
  const troughs = { coop: { feed: 1, water: 0 }, sty: { feed: 0, water: 0 } }, m = { f: 1 };
  assert.strictEqual(PW.machFill(m, troughs, k => (k === 'coop' ? 6 : 4), 50), 5); assert.deepStrictEqual(troughs.coop, { feed: 6, water: 1 }); assert.deepStrictEqual(troughs.sty, { feed: 0, water: 0 }, 'an unfitted pen is left alone');
  assert.strictEqual(PW.machFill({ f: 3 }, troughs, k => (k === 'coop' ? 6 : 4), 2), 2, 'never more hay than the storehouse has');
  const b = {}; assert.strictEqual(PW.binAdd(b, 'egg', 60), PW.BIN.egg.cap); assert.strictEqual(PW.binRoom(b, 'egg'), 0);
  assert.strictEqual(PW.binAdd(b, 'milk', 5), 5); assert.strictEqual(PW.binTake(b, 'milk', 9), 5); PW.binAdd(b, 'honey', 10);
  assert.deepStrictEqual(PW.binShip(b), { egg: PW.BIN.egg.cap - PW.BIN.egg.keep, honey: 10 - PW.BIN.honey.keep }); assert.strictEqual(PW.binHas(b, 'egg'), PW.BIN.egg.keep);
  assert.deepStrictEqual(PW.machValid({ f: 999, e: 1, m: 0, h: true, eg: 8.4, mk: -3, hn: 99, junk: 1 }), { f: 255, e: 1, h: 1, eg: 8, hn: PW.BIN.honey.cap });
  assert.strictEqual(PW.machValid({}), null); assert.strictEqual(PW.machValid(null), null);
  const v = PW.valid({ sprinklers: [], works: {}, hives: [], penHost: null, mach: { f: 3, eg: 4 } }, {}); assert.deepStrictEqual(v.mach, { f: 3, eg: 4 });
  assert(!('mach' in PW.valid({ sprinklers: [], works: {}, hives: [] }, {})), 'no field until something is bought');
  assert(JSON.stringify(v.mach).length < 40, 'one small field');
});
ok('v5.11.0.26: a full hopper does not request a delivery; carry must cover need or remaining room', () => {
  const jam = PW.WORKS.jam;
  assert.strictEqual(jam.inCap, 8); assert.strictEqual(jam.need, 2);
  assert.ok(!PW.canDeliver(40, jam.need, jam.inCap, jam.inCap), 'full 8/8 must not post');
  assert.ok(!PW.canDeliver(0, jam.need, jam.inCap, 0), 'empty hands must not post');
  assert.ok(!PW.canDeliver(1, jam.need, jam.inCap, 0), 'one fruit is below need 2');
  assert.ok(PW.canDeliver(2, jam.need, jam.inCap, 0));
  assert.ok(PW.canDeliver(1, jam.need, jam.inCap, 7), 'one slot left accepts a single fruit');
  assert.ok(!PW.canDeliver(1, jam.need, jam.inCap, 8));
});
ok('xhs 1.3.2: every 花甸 has six slots; hives move to another meadow, the cap stays 6, the old plot frees up', () => {
  const plots = { swbank: { mod: 'meadow', day: 2 }, glade: { mod: 'meadow', day: 5 } };
  const sl = PW.hiveSlots(plots, []); assert.strictEqual(sl.filter(q => q.at === 'swbank').length, 6); assert.strictEqual(sl.filter(q => q.at === 'glade').length, 6);
  const hives = []; for (let i = 0; i < 6; i++) { const s = PW.hiveFree(plots, [], hives); hives.push({ at: s.at, s: s.s, cd: 2, ready: i % 3 }); }
  assert(hives.every(h => h.at === 'swbank'), 'new hives fill the first meadow first'); assert(PW.hiveGate(plots, [], 6, hives), 'still 6 in all');
  assert.strictEqual(PW.hiveHome(plots, hives), 'swbank');
  assert(/挪东西/.test(PW.plotBusy('swbank', { plots, hives })), 'busy names the move tool');
  assert.strictEqual(PW.hiveSlotIn(plots, [], hives, 'swbank', 2), hives[2].s, 'own meadow: own slot');
  for (let i = 0; i < 6; i++) { const s = PW.hiveSlotIn(plots, [], hives, 'glade', i); assert(s >= 0); hives[i].at = 'glade'; hives[i].s = s; }
  assert.deepStrictEqual(hives.map(h => h.s).sort(), [0, 1, 2, 3, 4, 5]); assert(hives.every(h => PW.hivePos(h, plots, [])));
  assert.deepStrictEqual(hives.map(h => h.ready), [0, 1, 2, 0, 1, 2], 'honey goes with them'); assert.strictEqual(PW.hiveHome(plots, hives), 'glade');
  assert.strictEqual(PW.hiveSlotIn(plots, [], hives.concat({ at: 'swbank', s: 0 }), 'glade', 6), -1, 'a full meadow takes no seventh');
  assert.strictEqual(PW.plotBusy('swbank', { plots, hives }), null, 'the old meadow can be re-zoned');
  assert(/另一块地改成花甸/.test(PW.plotBusy('glade', { plots: { glade: plots.glade }, hives })), 'only meadow: say to make another first');
  const v = PW.valid({ sprinklers: [], works: {}, hives, penHost: null }, plots); assert.deepStrictEqual(v.hives.map(h => [h.at, h.s, h.ready]), hives.map(h => [h.at, h.s, h.ready]), 'save keeps them');
});
console.log(`works-test: ${n} ok`);
