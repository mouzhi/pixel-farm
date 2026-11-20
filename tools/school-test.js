// v5.10.9 unit tests: school expansion and 书屋 prices, prosperity 3→4, sports day, doubled school-day 好感,
// after-school reading, 图鉴 hints, the apple-pie recipe, autobuy never buys them.  node tools/school-test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const TN = require('../town.js'), HL = require('../hall.js'), SC = require('../school.js'), LB = require('../library.js');
const HM = require('../home.js'), BK = require('../bakery.js'), PW = require('../works.js'), SIM = require('../sim.js');
const K = require('../kids.js'), SAVE = require('../save.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const FIX = f => { const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')); return r.save || r; };
const rich = { open: true, coins: 1e6, wood: 999 };
const houses = () => { const st = HL.empty(); for (const id of ['L5', 'L8', 'L11']) { HL.start(st, id, 40); HL.finish(st, 41); } return st; };
const ready = () => { const st = houses(); HL.start(st, 'market', 50); HL.finish(st, 51); HL.start(st, 'bakery', 51); HL.finish(st, 52); return st; };
const shops = () => { const st = ready(); HL.start(st, 'woodshop', 60); HL.finish(st, 61); HL.start(st, 'smithy', 61); HL.finish(st, 62); return st; };

ok('prices match the town plan: school 40,000+200, 书屋 25,000+150, both need 繁荣度 3', () => {
  assert.strictEqual(SC.COST, 40000); assert.strictEqual(SC.WOOD, 200); assert.strictEqual(SC.LV, 3); assert.strictEqual(SC.EVERY, 14);
  assert.strictEqual(LB.COST, 25000); assert.strictEqual(LB.WOOD, 150); assert.strictEqual(LB.LV, 3);
  const p = HL.PROJ.school, q = HL.PROJ.library;
  assert.strictEqual(p.cost, 40000); assert.strictEqual(p.wood, 200); assert.strictEqual(p.lv, 3); assert.strictEqual(p.kind, 'school');
  assert.strictEqual(q.cost, 25000); assert.strictEqual(q.wood, 150); assert.strictEqual(q.lv, 3); assert.strictEqual(q.kind, 'library'); assert.strictEqual(q.who, 'n9');
  const st = houses();
  assert(/繁荣度到 3/.test(HL.canStart(st, 'school', rich)));
  const r = ready();
  assert.strictEqual(HL.canStart(r, 'school', { open: true, coins: 39999, wood: 999 }), '金币不够');
  assert.strictEqual(HL.canStart(r, 'school', { open: true, coins: 40000, wood: 199 }), '木材不够');
  assert.strictEqual(HL.canStart(r, 'school', rich), null);
  assert.strictEqual(HL.canStart(r, 'library', rich), null);
});

ok('lots sit inside the town, clear of the school, 小桃, the smithy and each other; 阿宁 keeps hours at the 书屋', () => {
  const overlap = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
  const rectOf = b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd];
  for (const id of ['school', 'library']) {
    const l = HL.LOT[id]; assert(l && TN.inTown(l.x, l.y) && TN.inTown(l.door.x, l.door.y), id);
    assert(TN.inRect(l.x - l.hw, l.y - l.hd, TN.RECT) && TN.inRect(l.x + l.hw, l.y + l.hd, TN.RECT), id + ' box');
    assert(TN.inTown(HL.siteSpot(id).x, HL.siteSpot(id).y), id + ' site');
  }
  assert(!overlap(rectOf(HL.LOT.school), rectOf(TN.BY_ID.school), 2), 'classroom / school');
  assert(!overlap(rectOf(HL.LOT.library), rectOf(TN.BY_ID.h4), 2), 'library / 小桃');
  assert(!overlap(rectOf(HL.LOT.library), rectOf(HL.LOT.smithy), 2), 'library / smithy');
  assert(!overlap(rectOf(HL.LOT.school), rectOf(HL.LOT.library), 2));
  const ning = HL.NEIGHBOURS.find(q => q.id === 'n9');
  assert.strictEqual(ning.name, '书屋阿宁'); assert.strictEqual(ning.look, 'townJ');
  const st = shops(); HL.start(st, 'library', 70); HL.finish(st, 71);
  assert(HL.residents(st).some(q => q.id === 'n9'));
  assert.strictEqual(HL.libraryAt(st, ning, 80, 10 * 60).spot, 'library');
  assert.strictEqual(HL.libraryAt(st, ning, 80, 18 * 60), null, 'home in the evening');
});

ok('building both takes prosperity 3 → 4; woodshop and smithy stay at 3 until then', () => {
  const st = shops();
  assert.strictEqual(HL.prosperity(st), 3); assert.deepStrictEqual(HL.nextLevelAt(st), { need: 2 });
  HL.start(st, 'school', 70); HL.finish(st, 71);
  assert.strictEqual(HL.prosperity(st), 3); assert.deepStrictEqual(HL.nextLevelAt(st), { need: 1 });
  assert.strictEqual(SC.built(st), true); assert.strictEqual(SC.favorMul(st), 2);
  HL.start(st, 'library', 71); HL.finish(st, 72);
  assert.strictEqual(HL.prosperity(st), 4); assert.deepStrictEqual(HL.nextLevelAt(st), { need: 6 }, 'v5.10.10: clinic + 5 rebuilds make 繁荣度 5');
  assert.strictEqual(HL.LV_NAME[4], '大镇子');
});

ok('sports day is every 14th day after the expansion, 9:00–15:00; 林老师 is on the playground', () => {
  const st = shops(); HL.start(st, 'school', 70); HL.finish(st, 71);
  assert.strictEqual(st.built.school, 71);
  assert(!SC.isDay(st, 71), 'not the morning it opens');
  assert(!SC.isDay(st, 84 - 1));
  assert(SC.isDay(st, 84), '84 is a multiple of 14 after 71');
  assert.strictEqual(SC.nextDay(st, 72), 84);
  assert(SC.open(st, 84, 10 * 60) && !SC.open(st, 84, 8 * 60) && !SC.open(st, 84, 16 * 60));
  const lin = TN.NEIGHBOURS.find(q => q.id === 'n1');
  assert.strictEqual(HL.sportsAt(st, lin, 84, 10 * 60).spot, 'yard');
  assert.strictEqual(HL.sportsAt(st, lin, 85, 10 * 60), null);
  const at = SC.raceAt(0, 0, 6); assert(SC.inYard(at.x, at.y), 'race stays in the yard');
});

ok('上学日的好感翻倍 once the school is expanded; before that it stays +1', () => {
  const r = () => 0;
  const a = HM.empty(); HM.schoolDay(a, 'kid0', r, true, 1);
  const b = HM.empty(); HM.schoolDay(b, 'kid0', r, true, SC.favorMul({ built: { school: 1 } }));
  assert.strictEqual(a.nb.n1, 1); assert.strictEqual(b.nb.n1, 2);
  const id = HM.MATE_IDS[0];
  assert.strictEqual(b.rel.kid0[id], a.rel.kid0[id] * 2);
});

ok('the 书屋 gives two locked 图鉴 hints and unlocks the apple-pie bakery templates and workshop', () => {
  const cat = [{ id: 'a', name: '甲', hint: '找甲' }, { id: 'b', name: '乙', hint: '找乙' }, { id: 'c', name: '丙', hint: '找丙' }, { id: 'd', name: '丁', later: true, hint: '以后' }];
  const h = LB.hints({ a: 1 }, 20, cat);
  assert.strictEqual(h.length, 2); assert(h.every(q => q.hint && q.id !== 'a' && q.id !== 'd'));
  assert.deepStrictEqual(LB.hints({ a: 1 }, 20, cat), h, 'stable after a reload');
  const pie = LB.RECIPES.find(q => q.id === 'pie');
  assert.strictEqual(pie.out, 'apple_pie');
  assert.deepStrictEqual(pie.need, [{ id: 'flour', n: 1 }, { id: 'apple', n: 2 }]);
  const o = BK.offers(20, 0, LB.TEMPLATES);
  assert.strictEqual(o.length, 2);
  assert(BK.WORD.apple_pie, 'bakery knows 苹果派');
  assert.strictEqual(PW.PRODUCTS.apple_pie.price, 140);
  assert.strictEqual(PW.WORKS.pie.out, 'apple_pie');
  assert.strictEqual(PW.workGate('pie', { plots: {}, works: {}, library: false }), '先在镇上盖好书屋，才能学到苹果派的配方');
});

ok('kids: a sports-day walk goes to the track; after school they can stop at the 书屋; ordinary school hours are unchanged', () => {
  const kid = { id: 'kid0', name: '小豆', born: 0 };
  const door = { x: 40, y: 50 }, school = { to: { x: 590, y: 44 }, via: [{ x: 280, y: 66 }] };
  const ctx = { kid, day: 20, t: 8 * 60 + 10, actor: { x: 40, y: 50 }, door, school, rng: () => 1 };
  const go = K.pickTask(ctx);
  assert.strictEqual(go.kind, 'school-go'); assert.strictEqual(go.label, '去上学');
  const race = K.pickTask(Object.assign({}, ctx, { sports: true, race: { x: 618, y: 51 } }));
  assert.strictEqual(race.kind, 'school-go'); assert.strictEqual(race.label, '去参加运动会'); assert(race.toRace);
  const onTrack = K.pickTask(Object.assign({}, ctx, { sports: true, race: { x: 618, y: 51 }, actor: { x: 618, y: 51, _sports: 1 }, inTown: () => true }));
  assert.strictEqual(onTrack.kind, 'race');
  const back = K.pickTask({ kid, day: 20, t: 14 * 60 + 10, actor: { x: 590, y: 44, away: 'school' }, door, school, library: { x: 626, y: 106 }, libVia: [{ x: 590, y: 44 }] });
  assert.strictEqual(back.kind, 'library-go');
  const read = K.pickTask({ kid, day: 20, t: 14 * 60 + 15, actor: { x: 626, y: 106, _lib: 1 }, door, school, library: { x: 626, y: 106 }, libUntil: 14 * 60 + 40 });
  assert.strictEqual(read.kind, 'library');
});

ok('autobuy lists never include a hall, school, library or pie project (the family only buys field / tools / chickens)', () => {
  const ids = SIM.AUTO_BUY.slice();
  for (const id of ['town', 'school', 'library', 'pie', 'bakery', 'market', 'woodshop', 'smithy', 'inn', 'hall']) {
    assert(!ids.includes(id), id);
  }
});

ok('valid(): junk in, a clean school and library out; fixtures gain empty school/library inside hall, save stays v15', () => {
  assert.deepStrictEqual(SC.valid(undefined), SC.empty());
  assert.deepStrictEqual(LB.valid({ days: -3, last: 'x', extra: 1 }), LB.empty());
  const v = HL.valid({ school: { last: 84, nope: 1 }, library: { days: 3, last: 90, zz: 1 } });
  assert.deepStrictEqual(v.school, { last: 84 }); assert.deepStrictEqual(v.library, { days: 3, last: 90 });
  for (const f of ['save-v10-day59-manor.json', 'save-v15-day72-cottage.json']) {
    const s = SAVE.migrate(JSON.parse(JSON.stringify(FIX(f)))); const out = SAVE.validate(s);
    assert.strictEqual(out.saveVersion, SAVE.CURRENT, f);
    assert.deepStrictEqual(out.town.hall.school, SC.empty(), f);
    assert.deepStrictEqual(out.town.hall.library, LB.empty(), f);
  }
});

console.log('school-test: ' + n + ' ok');
