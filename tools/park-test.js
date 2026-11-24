// v5.12.3 繁荣度 6 · 镇公园 · 镇民家庭: node tools/park-test.js
'use strict';
const assert = require('assert');
const PK = require('../park.js'), HL = require('../hall.js'), TN = require('../town.js'), CR = require('../careers.js'), SV = require('../save.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const inR = (x, y, r, p = 0) => x >= r[0] - p && x <= r[2] + p && y >= r[1] - p && y <= r[3] + p;
const lv5 = () => { const H = HL.empty(); ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'].forEach((id, i) => { H.built[id] = 10 + i; }); return H; };

ok('the park sits on R1, its props and fence stay inside it, nothing on R2–R4 or the school yard', () => {
  const R1 = TN.RESERVED.find(r => r.id === 'R1').rect; assert.deepStrictEqual(PK.RECT, R1);
  for (const q of PK.PROPS.concat(PK.FENCE)) assert(inR(q.x, q.y, PK.RECT), q.k + ' ' + q.x + ',' + q.y);
  for (const r of TN.RESERVED.filter(r => r.id !== 'R1')) for (const q of PK.PROPS) assert(!inR(q.x, q.y, r.rect, 2));
  for (const q of PK.PROPS) assert(!inR(q.x, q.y, TN.SCHOOLYARD, 2), 'clear of the school yard');
  for (const b of TN.BUILDINGS) assert(!inR(PK.GATE.x, PK.GATE.y, [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd], 2), 'gate clear of ' + b.id);
  assert(PK.PROPS.filter(q => q.k === 'bench').length >= 4 && PK.PROPS.some(q => q.k === 'sandbox') && PK.PROPS.some(q => q.k === 'pergola') && PK.PROPS.some(q => q.k === 'kennel'));
  // props off the ring path, so walkers on it do not cross a bench
  for (const q of PK.PROPS) if (q.k !== 'lamp' && q.k !== 'flowers') assert(!PK.onLoop(q.x, q.y, 1), q.k + ' on the ring');
});
ok('ground: lawn, ring path, flagstones, pet corner and the link to 东街; nothing painted outside', () => {
  const pal = { G: ['g0', 'g1', 'g2', 'g3', 'g4'], Wd: ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'], St: ['s0', 's1', 's2', 's3'], Ac: ['a0', 'a1', 'a2', 'a3'] };
  assert.strictEqual(PK.ground(781, -57, pal)[1], 'dirt'); assert.strictEqual(PK.ground(781 + 36, -57, pal)[1], 'dirt'); assert.strictEqual(PK.ground(760, -45, pal)[1], 'grass');
  assert.strictEqual(PK.ground(815, -80, pal)[1], 'dirt'); assert.strictEqual(PK.ground(800, -14, pal)[1], 'dirt'); assert.strictEqual(PK.ground(700, 0, pal), null);
});
ok('hall: 镇公园 is a project at level 5 and does not count towards 1–5; level 6 needs hall.lv6 too', () => {
  const H = lv5(); assert.strictEqual(HL.prosperity(H), 5); assert(HL.PROJ.park && HL.PROJ.park.lv === 5 && HL.PROJ.park.cost === 36000 && HL.PROJ.park.wood === 200);
  const H4 = HL.empty(); ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library'].forEach(id => { H4.built[id] = 1; });
  assert(/繁荣度到 5/.test(HL.canStart(H4, 'park', { open: true, coins: 1e6, wood: 1e4 })));
  assert.strictEqual(HL.canStart(H, 'park', { open: true, coins: 1e6, wood: 1e4 }), null);
  HL.start(H, 'park', 30); assert.strictEqual(HL.finish(H, 31), 'park'); assert.strictEqual(HL.prosperity(H), 5, 'park alone is not 6');
  H.lv6 = 33; assert.strictEqual(HL.prosperity(H), 6); assert.strictEqual(HL.LV_NAME[6], '旅游小镇');
  const H2 = lv5(); H2.lv6 = 33; assert.strictEqual(HL.prosperity(H2), 5, 'no park: no 6 even with the stamp');
  assert.strictEqual(HL.valid(H2).lv6, undefined, 'valid drops lv6 without the park'); assert.strictEqual(HL.valid(H).lv6, 33);
  assert.strictEqual(HL.valid(lv5()).lv6, undefined, 'old saves gain nothing');
  assert.deepStrictEqual(HL.siteSpot('park'), { x: PK.GATE.x + 8, y: PK.GATE.y + 5 });
  assert(HL.lightsAt(H, 20 * 60).length >= 2 && HL.lightsAt(H, 23 * 60).every(l => !(Math.abs(l.y + 29) < 0.1 && (l.x === 774 || l.x === 788))));
});
ok('a child\'s shop lifts the town once, but not past 5 (6 only with the park)', () => {
  const H = lv5(), lots = { L2: 'kid0' }, path = { kid0: { way: 'shop', at: 'L2', kind: 'flower', ready: 5 } };
  assert.strictEqual(CR.townLv(H, lots, path, 10), 5);
  H.built.park = 31; H.lv6 = 33; assert.strictEqual(CR.townLv(H, lots, path, 40), 6);
});
ok('tourCheck: level 5, the park, 大道 or 沙滩, and 4 stars or 30 visitors in 14 days', () => {
  const base = { lv: 5, park: true, avenue: true, beach: false, stars: 3.2, visitors: 10 };
  assert(!PK.tourCheck(base).ok); assert(PK.tourCheck(Object.assign({}, base, { stars: 4 })).ok); assert(PK.tourCheck(Object.assign({}, base, { visitors: 30 })).ok);
  assert(!PK.tourCheck(Object.assign({}, base, { stars: 5, park: false })).ok); assert(!PK.tourCheck(Object.assign({}, base, { stars: 5, avenue: false })).ok);
  assert(PK.tourCheck(Object.assign({}, base, { stars: 5, avenue: false, beach: true })).ok); assert(!PK.tourCheck(Object.assign({}, base, { stars: 5, lv: 4 })).ok);
  const rows = [{ day: 1, s: 4 }, { day: 40, s: 4, n: 3 }, { day: 45, s: 5 }];
  assert.strictEqual(PK.visitors14({ day: 50, rows }), 8); assert.strictEqual(PK.visitors14({ day: 50, rows, parking: () => 2 }), 8 + 28);
});
ok('families: three couples, 1–2 children each, a pram for 7 days, news on the day', () => {
  assert.strictEqual(PK.FAMILIES.length, 3); assert.deepStrictEqual(PK.FAMILIES.map(f => f.lot), ['L5', 'L8', 'L11']);
  for (const f of PK.FAMILIES) { assert(f.kids.length >= 1 && f.kids.length <= 2); assert(HL.NEIGHBOURS.some(n => n.id === f.host && n.lot === f.lot)); assert.deepStrictEqual(f.door, HL.LOT[f.lot].door); }
  assert.strictEqual(PK.FAMILIES.reduce((a, f) => a + f.kids.length, 0), PK.KIDS_MAX);
  assert.deepStrictEqual(PK.familiesOn(0, 50), []); assert.deepStrictEqual(PK.familiesOn(60, 50), []);
  assert.strictEqual(PK.familiesOn(10, 11).length, 1); assert.strictEqual(PK.familiesOn(10, 13).length, 3);
  const d15 = PK.familiesOn(10, 15)[0]; assert.deepStrictEqual(d15.babies.map(k => k.name), ['小豆']);
  const d22 = PK.familiesOn(10, 22)[0]; assert.deepStrictEqual(d22.kids.map(k => k.name), ['小豆']);
  assert(/阿诚/.test(PK.news(10, 11).join())); assert(/小豆/.test(PK.news(10, 15).join())); assert(/会自己走了/.test(PK.news(10, 22).join())); assert.deepStrictEqual(PK.news(10, 9), []);
  assert.strictEqual(PK.extraPeople(10, 60), 3 + 4);
});
ok('peopleAt: pure, nobody at night or in the rain; children in the park after school, at most 4; spouses in the morning', () => {
  const lv6 = 10, day = 60;
  assert.deepStrictEqual(PK.peopleAt(lv6, day, 16 * 60 + 30), PK.peopleAt(lv6, day, 16 * 60 + 30), 'same clock, same picture');
  assert.deepStrictEqual(PK.peopleAt(lv6, day, 22 * 60), []); assert.deepStrictEqual(PK.peopleAt(lv6, day, 16 * 60 + 30, { rain: true }), []);
  assert.deepStrictEqual(PK.peopleAt(0, day, 16 * 60 + 30), []);
  const pm = PK.peopleAt(lv6, day, 16 * 60 + 40), kids = pm.filter(p => p.kid);
  assert.strictEqual(kids.length, 4); assert(kids.every(p => p.where === 'park' && PK.inPark(p.x, p.y)), JSON.stringify(kids));
  assert(kids.length <= PK.KIDS_MAX);
  const am = PK.peopleAt(lv6, day, 10 * 60 + 15); assert.strictEqual(am.filter(p => !p.kid && p.where === 'park').length, 3); assert(!am.some(p => p.kid), 'children are at school in the morning');
  const baby = PK.peopleAt(10, 16, 10 * 60 + 15).find(p => p.id === 'ps5'); assert(baby && baby.pram && PK.onLoop(baby.x, baby.y, 1.5), 'a pram on the ring');
  // walking: every position on a walk is on the town's streets or the park link (never through a building)
  for (let t = 8 * 60; t < 19 * 60; t += 3) for (const p of PK.peopleAt(lv6, day, t)) for (const b of TN.BUILDINGS) assert(!inR(p.x, p.y, [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd], -0.5), p.id + ' inside ' + b.id + ' at ' + t);
  for (let t = 8 * 60; t < 19 * 60; t += 3) for (const p of PK.peopleAt(lv6, day, t)) for (const l of HL.LOTS) assert(!inR(p.x, p.y, [l.x - l.hw, l.y - l.hd, l.x + l.hw, l.y + l.hd], -0.5), p.id + ' inside ' + l.id + ' at ' + t);
});
ok('pets: one dog and one cat in the pet corner by day, asleep by the kennel at night, none before the park', () => {
  const H = lv5(); assert.deepStrictEqual(PK.petsAt(H, 5, 600), []); H.built.park = 3;
  for (let t = 0; t < 1440; t += 7) { const ps = PK.petsAt(H, 5, t); assert.strictEqual(ps.length, PK.PETS_MAX); for (const p of ps) assert(inR(p.x, p.y, PK.PETS_RECT, 0.5), p.id + ' ' + t); }
  assert(PK.petsAt(H, 5, 23 * 60).every(p => p.pose === 'sleep'));
});
ok('save stays v15; a hall with the park and lv6 round-trips; empty saves gain no lv6', () => {
  assert.strictEqual(SV.CURRENT, 15);
  const fs = require('fs'), path = require('path'), fx = fs.readdirSync(path.join(__dirname, 'fixtures')).filter(f => /\.json$/.test(f)).sort().pop(), raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', fx), 'utf8'));
  const base = SV.validate(SV.migrate(raw.save || raw)), withPark = JSON.parse(JSON.stringify(base)); withPark.town = withPark.town || {}; const H0 = lv5(); H0.built.park = 31; H0.lv6 = 33; withPark.town.hall = H0;
  const back = SV.validate(JSON.parse(JSON.stringify(withPark))); assert.strictEqual(back.town.hall.lv6, 33); assert.strictEqual(back.town.hall.built.park, 31);
  assert(JSON.stringify(SV.compact ? SV.compact(back) : back).length < 64 * 1024);
  const H = lv5(); H.built.park = 31; H.lv6 = 33; const v = HL.valid(JSON.parse(JSON.stringify(H))); assert.strictEqual(v.lv6, 33); assert.strictEqual(v.built.park, 31);
  assert(!('lv6' in HL.empty()));
});
console.log(`park-test: ${n} ok`);
