// Unit tests for v5.10.0 (hall.js: 镇公所, the board's projects, prosperity, gifts, the weekly paper; saved inside `town`):  node tools/hall-test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const TN = require('../town.js'), HL = require('../hall.js'), SAVE = require('../save.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const FIX = f => { const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')); return r.save || r; };
const overlap = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
const rectOf = b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd];

ok('the hall and the three lots sit inside the town, clear of every building, the square and each other', () => {
  assert.strictEqual(TN.BY_ID.hall.kind, 'hall'); assert(TN.inTown(HL.BOARD.x, HL.BOARD.y));
  const all = TN.BUILDINGS.map(b => [b.id, rectOf(b)]).concat(HL.LOTS.map(l => [l.id, rectOf(l)]));
  const P = TN.PLAZA, sq = [P.x - P.r, P.y - P.r, P.x + P.r, P.y + P.r];
  for (const [id, r] of all) { assert(TN.inRect(r[0], r[1], TN.RECT) && TN.inRect(r[2], r[3], TN.RECT), id + ' in town'); assert(!overlap(r, sq), id + ' off the square'); }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!overlap(all[i][1], all[j][1], 2), all[i][0] + ' / ' + all[j][0]);
  for (const l of HL.LOTS) { assert(!overlap(rectOf(l), [l.x - 1, 62, l.x + 1, 70]), l.id + ' off the main street'); assert(TN.inTown(l.door.x, l.door.y)); }
  for (const s of HL.GIFT_SPOTS.concat(HL.PROPS.map(([, x, y]) => ({ x, y })))) { assert(TN.inTown(s.x, s.y), JSON.stringify(s));
    for (const [id, r] of all) assert(!TN.inRect(s.x, s.y, r, 2), 'spot on ' + id + ' ' + JSON.stringify(s)); }
});
ok('projects: town first, one at a time, money and wood, done the morning after; three of them take prosperity 1 -> 2', () => {
  const st = HL.empty(), rich = { open: true, coins: 1e6, wood: 999 };
  assert.strictEqual(HL.prosperity(st), 1); assert.deepStrictEqual(HL.nextLevelAt(st), { need: 3 });
  assert.strictEqual(HL.canStart(st, 'L5', { open: false, coins: 1e6, wood: 999 }), '先把镇子买下来');
  assert.strictEqual(HL.canStart(st, 'L5', { open: true, coins: 7999, wood: 999 }), '金币不够');
  assert.strictEqual(HL.canStart(st, 'L5', { open: true, coins: 8000, wood: 119 }), '木材不够');
  assert.strictEqual(HL.canStart(st, 'L5', { open: true, coins: 8000, wood: 120 }), null);
  HL.start(st, 'L5', 40); assert(/一次只盖一座/.test(HL.canStart(st, 'L8', rich))); assert.strictEqual(HL.canStart(st, 'L5', rich), '正在盖');
  assert.strictEqual(HL.finish(st, 40), null, 'not the same day'); assert.strictEqual(HL.finish(st, 41), 'L5'); assert.deepStrictEqual(st.built, { L5: 41 }); assert.strictEqual(st.job, null);
  assert.strictEqual(HL.canStart(st, 'L5', rich), '已经盖好了');
  assert.deepStrictEqual(HL.residents(st).map(r => r.id), ['n4', 'n5'], 'the mayor, and 阿梅 in the new house');
  HL.start(st, 'L8', 41); HL.finish(st, 44); assert.strictEqual(HL.prosperity(st), 1, 'away for days: done all the same');
  HL.start(st, 'L11', 44); HL.finish(st, 45); assert.strictEqual(HL.prosperity(st), 2); assert.deepStrictEqual(HL.nextLevelAt(st), { need: 2 }, 'v5.10.4: the market and the bakery make 3');
  assert.strictEqual(HL.residents(st).length, 4); assert.strictEqual(HL.blocks(st).length, 4);
});
ok('the new neighbours keep their hours; doors and spots are in town; 阿松 has a site spot by each lot', () => {
  for (const nb of HL.NEIGHBOURS) { for (const [a, b, s] of nb.plan) { assert(a < b); const w = HL.neighbourAt(nb, a); assert.strictEqual(w.spot, s); assert(w.at && TN.inTown(w.at.x, w.at.y), nb.id + ' ' + s); }
    const late = HL.neighbourAt(nb, 23 * 60); assert(!late.out); assert.deepStrictEqual(late.at, HL.doorOf(nb)); }
  for (const nb of TN.NEIGHBOURS) assert.deepStrictEqual(HL.neighbourAt(nb, 10 * 60), TN.neighbourAt(nb, 10 * 60), 'the old four unchanged');
  for (const l of HL.LOTS) assert(TN.inTown(HL.siteSpot(l.id).x, HL.siteSpot(l.id).y));
  assert.strictEqual(new Set(HL.NEIGHBOURS.map(q => q.look)).size, HL.NEIGHBOURS.length);
});
ok('gifts: any decoration but the party table, until the street is full; lamps light at night, new windows in the evening', () => {
  const st = HL.empty(); assert(!HL.give(st, 'party'));
  const SL = require('../slots.js'), NL = SL.TOWN.lamp.length, NN = SL.TOWN.nook.length;
  for (let i = 0; i < NL; i++) assert(HL.give(st, 'lamppost')); assert(!HL.give(st, 'stonelamp'), 'v5.10.3: the lamp spots are full'); assert(HL.give(st, 'bench'), 'a bench still has a nook');
  for (let i = 1; i < NN; i++) assert(HL.give(st, i % 2 ? 'bench' : 'shell')); assert(!HL.give(st, 'bench'), 'nooks full'); assert.strictEqual(HL.giftSpot(st, 'bench'), null);
  const gp = HL.giftPos(st); assert.deepStrictEqual(gp.slice(0, NL), SL.TOWN.lamp, 'lamps in their spots, in order'); assert(gp.every(Boolean));
  const CAT = { lamppost: { light: 26 }, bench: {} };
  assert.strictEqual(HL.lightsAt(st, 12 * 60, CAT).length, 0, 'not at noon');
  assert.strictEqual(HL.lightsAt(st, 21 * 60, CAT).length, NL + 1, 'the lamps and the hall');
  st.built.L5 = 3; assert.strictEqual(HL.lightsAt(st, 21 * 60, CAT).length, NL + 2);
  assert.strictEqual(HL.lightsAt(st, 23 * 60, CAT).length, NL, 'windows go dark, lamps stay');
});
ok('the weekly paper reads like a few lines of news', () => {
  const t = HL.paperText({ day: 70, built: ['L5'], gifts: 2, trade: 340, lv: 1, people: 6 });
  assert(/第 70 天/.test(t) && /木构二层小楼盖好了/.test(t) && /2 件装饰/.test(t) && /340 金/.test(t) && /6 位邻居/.test(t) && /繁荣度 1/.test(t), t);
  assert(/镇子小报/.test(HL.paperText({ day: 71, built: [], gifts: 0, trade: 0, lv: 2, people: 8 })));
});
ok('valid(): junk in, a clean hall out; unknown projects and the party table dropped; a job on a built lot dropped', () => {
  assert.deepStrictEqual(HL.valid(undefined), HL.empty()); assert.deepStrictEqual(HL.valid([1, 2]), HL.empty());
  const v = HL.valid({ built: { L5: 12, X9: 3 }, job: { id: 'L5', day: 12 }, gifts: ['bench', 'party', 7, 'lamppost'], paper: 63, week: { built: ['L5', 'zz'], gifts: 2, trade: 50 } });
  assert.deepStrictEqual(v, { built: { L5: 12 }, job: null, gifts: ['bench', 'lamppost'], paper: 63, week: { built: ['L5'], gifts: 2, trade: 50 }, market: require('../market.js').empty(), bakery: require('../bakery.js').empty(), woodshop: require('../woodshop.js').empty(), smithy: require('../smithy.js').empty(), school: require('../school.js').empty(), library: require('../library.js').empty(), clinic: require('../clinic.js').empty() });
  assert.deepStrictEqual(HL.valid({ job: { id: 'L8', day: 5 } }).job, { id: 'L8', day: 5 });
});
ok('save: no version bump; every fixture gains an empty hall inside `town`, nothing else changes; a hall round-trips', () => {
  for (const f of fs.readdirSync(path.join(__dirname, 'fixtures')).filter(f => /\.json$/.test(f))) {
    const s = SAVE.migrate(JSON.parse(JSON.stringify(FIX(f)))); const v = SAVE.validate(s);
    assert.strictEqual(v.saveVersion, SAVE.CURRENT, f); assert.deepStrictEqual(v.town.hall, HL.empty(), f);
    const t = Object.assign({}, v.town); delete t.hall; assert.deepStrictEqual(t, TN.valid(s.town), f + ': the rest of town as before');
    v.town.hall = { built: { L5: 60, L8: 61 }, job: { id: 'L11', day: 62 }, gifts: ['lamppost', 'bench'], paper: 58, week: { built: ['L5', 'L8'], gifts: 2, trade: 120 }, market: { pick: 1, take: { crops: 1, fruit: 0, animals: 1, fish: 1, goods: 0 }, days: 3, gold: 4000, extra: 700, last: 56 }, bakery: { pick: 1, days: 4, gold: 2400, extra: 800, last: 70, offer: [{ id: 'o0', need: [{ id: 'flour', n: 6 }, { id: 'egg', n: 4 }], text: '6 份面粉 + 4 个鸡蛋', base: 400, pay: 600 }], take: 'o0', done: 1 }, woodshop: { auto: 1, days: 2, used: 80, last: 71, made: 0 }, smithy: { up: { water: 1, works: 0, axe: 2, rod: 0, cart: 1 } }, school: { last: 0 }, library: { days: 0, last: 0 }, clinic: { last: 0 } };
    const back = SAVE.validate(JSON.parse(JSON.stringify(v))); assert.deepStrictEqual(back.town.hall, v.town.hall, f + ' round trip');
  }
});
console.log('hall-test: ' + n + ' ok');
