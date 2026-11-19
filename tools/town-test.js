// Unit tests for phase 10 (v5.8.0, town.js + the v14 save):  node tools/town-test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const WD = require('../world.js'); globalThis.PFWorld = WD;              // town.js adds its streets to the routes it finds
const TN = require('../town.js'), SAVE = require('../save.js'), SIM = require('../sim.js'), PL = require('../plots.js'), KIDS = require('../kids.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const rng = seed => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const inAny = (x, y, rs) => rs.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);

ok('map: the strip east of the old edge holds the town; the old map keeps its bounds for its scatter', () => {
  assert.deepStrictEqual([WD.WORLD.x0, WD.WORLD.y0, WD.WORLD.x1, WD.WORLD.y1], [-256, -208, 640, 384]);
  assert.deepStrictEqual([WD.WORLD55.x0, WD.WORLD55.y0, WD.WORLD55.x1, WD.WORLD55.y1], [-256, -208, 448, 384]);
  const R = TN.RECT; assert(R[0] >= WD.WORLD55.x1 && R[2] <= WD.WORLD.x1, 'town inside the strip');
  for (const b of TN.BUILDINGS) { assert(TN.inTown(b.x - b.hw, b.y - b.hd) && TN.inTown(b.x + b.hw, b.y + b.hd), b.id); assert(!WD.seaAt(b.x, b.y + b.hd), b.id + ' dry'); }
  for (const k of Object.keys(TN.STREETS)) assert(WD.ROUTES[k], 'street registered: ' + k);
  for (let x = 470; x <= 640; x += 10) { assert(Math.abs(PL.ridgeY(x) - PL.ridgeY(470)) < 16, 'the ridge levels off past the old edge ' + x); assert(PL.ridgeY(x) < TN.RECT[1] - 40, 'cliff well north of town'); }
});
ok('buildings: no two overlap, doors stand outside on a street or the square and are walkable', () => {
  const B = TN.BUILDINGS, open = TN.blocks(true);
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i], b = B[j];
    assert(Math.abs(a.x - b.x) >= a.hw + b.hw + 2 || Math.abs(a.y - b.y) >= a.hd + b.hd + 2, a.id + '/' + b.id); }
  for (const b of B) assert(!inAny(b.door.x, b.door.y, open), b.id + ' door walkable');
  for (const k of Object.keys(TN.SPOTS)) assert(!inAny(TN.SPOTS[k].x, TN.SPOTS[k].y, open), 'spot ' + k);
  assert(!inAny(TN.GATE.x + 8, TN.GATE.y, open) && inAny(TN.GATE.x + 8, TN.GATE.y - 30, open), 'the gate gap is the only way in');
});
ok('gate: needs 东大道 as a road and a school day; locked town blocks everything east of the gate', () => {
  assert.strictEqual(TN.gate({ plots: {}, schoolDays: 3 }), '先把东大道买下来（选成「大道」）');
  assert.strictEqual(TN.gate({ plots: { eroad: { mod: 'road' } }, schoolDays: 0 }), '等孩子上过一天学再开镇门');
  assert.strictEqual(TN.gate({ plots: { eroad: { mod: 'road' } }, schoolDays: 1 }), null);
  const shut = TN.blocks(false); assert(inAny(TN.GATE.x + 10, TN.GATE.y, shut) && inAny(600, 60, shut) && !inAny(TN.GATE.x - 2, TN.GATE.y, shut));
  const it = SIM.shopItem('town'); assert(it && it.p10); assert.deepStrictEqual([it.levels[0].cost, it.levels[0].wood], [12000, 60]);
  assert(SIM.SHOP_TABS.find(t => t.id === 'land').ids.includes('town'));
  assert.strictEqual(SIM.effects({ town: 1 }).town, true); assert.strictEqual(SIM.effects({}).town, false);
});
ok('school route: before the east region, before the road, along the road to the shut gate, into town to the school door', () => {
  const r0 = TN.schoolRoute({ regions: [], plots: {} }), r1 = TN.schoolRoute({ regions: ['east'], plots: {} });
  const r2 = TN.schoolRoute({ regions: ['east'], plots: { eroad: { mod: 'road' } } }), r3 = TN.schoolRoute({ regions: ['east'], plots: { eroad: { mod: 'road' } }, open: true });
  assert.deepStrictEqual(r0.to, { x: 224, y: 66 }); assert.deepStrictEqual(r1.to, { x: 356, y: 66 }); assert.deepStrictEqual(r2.to, { x: TN.GATE.x - 2, y: 66 });
  assert.deepStrictEqual(r3.to, TN.SCHOOL_DOOR); assert(r3.inTown && !r2.inTown);
  for (const r of [r0, r1, r2, r3]) { assert.deepStrictEqual(r.via[0], { x: 158, y: 54 }); assert.deepStrictEqual(r.via[r.via.length - 1], r.to);
    for (let i = 1; i < r.via.length; i++) assert(r.via[i].x === r.via[i - 1].x || r.via[i].y === r.via[i - 1].y, 'straight legs'); }
  assert(r2.via.every(p => p.x <= 216 || p.y === 66), 'the road leg stays on the road');
  const blocked = TN.blocks(true); assert(r3.via.every(p => !inAny(p.x, p.y, blocked)), 'the town leg is walkable');
  assert.strictEqual(KIDS.schoolExit({ school: r3 }), r3, 'kids.js takes the route the game hands over');
  assert.strictEqual(KIDS.schoolExit({ world: { x1: 352 } }).to.x > 0, true, 'and still has its own fallback');
});
ok('days off: only on a rain day or a party evening, never otherwise; about the set odds', () => {
  const r = rng(3); let rain = 0, party = 0;
  for (let i = 0; i < 4000; i++) { assert.strictEqual(TN.skipSchool({}, r), false); if (TN.skipSchool({ rain: true }, r)) rain++; if (TN.skipSchool({ party: true }, r)) party++; }
  assert(Math.abs(rain / 4000 - TN.SKIP.rain) < 0.04, 'rain ' + rain); assert(Math.abs(party / 4000 - TN.SKIP.party) < 0.04, 'party ' + party);
});
ok('classmates: not before 6 school days, not twice within 3 days, not on rain or party days; named only once the town is open', () => {
  const yes = () => 0;
  assert.strictEqual(TN.mateToday({ day: 30, schoolDays: 5, last: 0 }, yes), false);
  assert.strictEqual(TN.mateToday({ day: 30, schoolDays: 6, last: 0 }, yes), true);
  assert.strictEqual(TN.mateToday({ day: 30, schoolDays: 9, last: 28 }, yes), false);
  assert.strictEqual(TN.mateToday({ day: 30, schoolDays: 9, last: 27 }, yes), true);
  assert.strictEqual(TN.mateToday({ day: 30, schoolDays: 9, last: 0, rain: true }, yes), false);
  assert.strictEqual(TN.mateToday({ day: 30, schoolDays: 9, last: 0, party: true }, yes), false);
  assert.strictEqual(TN.mateToday({ day: 30, schoolDays: 9, last: 0 }, () => 0.9), false);
  assert.strictEqual(TN.mateName(0, false), '同学'); assert.strictEqual(TN.mateName(1, true), '朵朵');
  assert(TN.MATE.leave < 17 * 60 + 30, 'gone before the party hour');
});
ok('neighbours: each keeps hours, is home outside them, and the party guests (阿松, 小桃) are home before 17:30', () => {
  for (const nb of TN.NEIGHBOURS) { assert(TN.BY_ID[nb.home]); assert.strictEqual(TN.neighbourAt(nb, 3 * 60).out, false);
    for (const [a, b, s] of nb.plan) { assert(a < b && TN.SPOTS[s], nb.id); assert.strictEqual(TN.neighbourAt(nb, (a + b) / 2).spot, s); } }
  for (const id of ['n2', 'n3']) { const nb = TN.NEIGHBOURS.find(q => q.id === id); assert(nb.plan.every(p => p[1] <= 17 * 60 + 30), id); }
  const lin = TN.NEIGHBOURS.find(q => q.name === '林老师'); assert.strictEqual(TN.neighbourAt(lin, 10 * 60).spot, 'schoolgate');
});
ok('town shop: workshop goods, honey and fish only, a fifth more', () => {
  assert(TN.tradeable('jam', false) && TN.tradeable('honey', false) && TN.tradeable('carp', true));
  assert(!TN.tradeable('carrot', false) && !TN.tradeable('egg', false));
  assert.strictEqual(TN.tradePrice(100), 120); assert.strictEqual(TN.tradePrice(37), 44);
});
ok('state: empty, valid() repairs junk, keeps good values, counts school days', () => {
  assert.deepStrictEqual(TN.valid(null), TN.empty());
  const v = TN.valid({ school: { kid0: 7, evil: 3, kid1: -2 }, last: { kid0: 40.4 }, skip: { kid1: 'x' }, mate: { last: 38, day: 40, kid: 'kid0', who: 9 }, trade: 1234 });
  assert.deepStrictEqual(v.school, { kid0: 7 }); assert.deepStrictEqual(v.last, { kid0: 40 }); assert.deepStrictEqual(v.skip, {});
  assert.deepStrictEqual(v.mate, { last: 38, day: 40, kid: 'kid0', who: TN.MATES.length - 1 }); assert.strictEqual(v.trade, 1234);
  assert.strictEqual(TN.schoolDays({ school: { kid0: 3, kid1: 4 } }), 7); assert.strictEqual(TN.schoolDays(undefined), 0);
});
ok('save: the day-59 manor fixture (v10) migrates to v14: the town unbought, school days counted from today', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8'));
  const s = SAVE.migrate(JSON.parse(JSON.stringify(raw)));
  assert.strictEqual(SAVE.CURRENT, 15); assert.strictEqual(s.saveVersion, 15); assert.deepStrictEqual(s.town, TN.empty()); assert.strictEqual(s.upgrades.town, 0);
  for (const k of Object.keys(raw.upgrades)) assert.strictEqual(s.upgrades[k], raw.upgrades[k], k);
  assert.strictEqual(s.coins, raw.coins); assert.strictEqual(s.clock.day, raw.clock.day);
  const v = SAVE.validate(s); assert.deepStrictEqual(v.town, TN.empty());
});
ok('save: a v13 save gains only the town; a v14 town round-trips', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8'));
  const v13 = SAVE.migrate(JSON.parse(JSON.stringify(raw))); delete v13.town; delete v13.upgrades.town; v13.saveVersion = 13;
  const s = SAVE.migrate(JSON.parse(JSON.stringify(v13))); const a = Object.assign({}, s); delete a.town; delete a.saveVersion; a.upgrades = Object.assign({}, a.upgrades); delete a.upgrades.town;
  const b = Object.assign({}, v13); delete b.saveVersion; assert.deepStrictEqual(a, b);
  s.town = { school: { kid0: 12 }, last: { kid0: 70 }, skip: { kid0: 66 }, mate: { last: 68, day: 70, kid: 'kid0', who: 1 }, trade: 88 }; s.upgrades.town = 1;
  const back = SAVE.validate(JSON.parse(JSON.stringify(s))); assert.deepStrictEqual(back.town, s.town); assert.strictEqual(back.upgrades.town, 1);
});
console.log(`town-test: ${n} ok`);
