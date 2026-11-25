// v5.12.6 旅游大巴: node tools/bus-test.js — the daily plan, the bus's lanes, the walkers' routes, night / rain, the save (v15, append-only)
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const EA = require('../east.js'); global.PFEast = EA;
const BUS = require('../bus.js'), HL = require('../hall.js'), TN = require('../town.js'), SV = require('../save.js'), FXP = require('../farmxp.js'), ALB = require('../album.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const inR = (x, y, r, p = 0) => x >= r[0] - p && x <= r[2] + p && y >= r[1] - p && y <= r[3] + p;
const box = (s, hw, hd) => [s.x - hw, s.y - hd, s.x + hw, s.y + hd];
const CTX5 = { avenue: true, inn: true, lv: 5, park: true, beach: true }, CTX6 = Object.assign({}, CTX5, { lv: 6 });
const sample = (r, step = 1) => { const L = BUS.lenOf(r), out = []; for (let d = 0; d <= L; d += step) out.push(BUS.along(r, d)); return out; };

ok('gate: 东门大道 and a 民宿 cabin; nothing comes before them', () => {
  assert(/东门大道/.test(BUS.gate({ inn: true }))); assert(/民宿/.test(BUS.gate({ avenue: true }))); assert.strictEqual(BUS.gate({ avenue: true, inn: true }), null);
  assert.deepStrictEqual(BUS.dayPlan(40, { avenue: true }), []); assert.deepStrictEqual(BUS.dayPlan(40, { inn: true, lv: 6 }), []);
});
ok('one bus of 6 a day below 繁荣度 6, two buses (8 + 8) at 6; 16 a day at most; all gone by 17:00', () => {
  for (let d = 1; d < 400; d++) {
    const a = BUS.dayPlan(d, CTX5), b = BUS.dayPlan(d, CTX6);
    assert.strictEqual(a.length, 1); assert.strictEqual(BUS.count(a), 6); assert.strictEqual(b.length, 2); assert.strictEqual(BUS.count(b), 16);
    assert(BUS.count(b) <= BUS.MAX_DAY); assert.deepStrictEqual(b.map(x => x.bay), [0, 1], 'each bus has its own reserved bay');
    for (const x of b) { assert(x.arrive >= 9 * 60 + 40 && x.arrive <= 11 * 60 + 20, 'arrive ' + x.arrive); assert(x.leave + BUS.DRIVE <= BUS.LAST, 'leave ' + x.leave); assert(x.leave - x.arrive >= 240); }
  }
  assert.deepStrictEqual(BUS.dayPlan(77, CTX6), BUS.dayPlan(77, CTX6), 'pure: same day, same plan');
});
ok('destinations: the first pair always goes to the 农家乐区; 公园 / 沙滩 only once they exist; every walker is back before the bus leaves', () => {
  const seen = {};
  for (let d = 1; d < 200; d++) for (const b of BUS.dayPlan(d, CTX6)) {
    assert.strictEqual(b.people[0].dest, 'agri'); assert.strictEqual(b.people[1].dest, 'agri');
    for (const q of b.people) { seen[q.dest] = 1; assert(q.off > b.arrive && q.there > q.off && q.back > q.there + 20, q.id + ' stays ' + (q.back - q.there));
      assert(q.on <= b.leave - BUS.BOARD + 0.01, q.id + ' late ' + q.on + ' > ' + b.leave);
      const r = q.route, d0 = BUS.DOOR(b.bay); assert(Math.hypot(r[0].x - d0.x, r[0].y - d0.y) < 0.01, 'routes start at the bus door'); }
  }
  assert.deepStrictEqual(Object.keys(seen).sort(), ['agri', 'beach', 'park', 'town']);
  for (let d = 1; d < 200; d++) for (const b of BUS.dayPlan(d, { avenue: true, inn: true, lv: 6 })) for (const q of b.people) assert(q.dest === 'town' || q.dest === 'agri', 'no park / beach before they are built: ' + q.dest);
  const pl = BUS.poolOf(BUS.dayPlan(9, CTX6)); assert.strictEqual(pl.agri + pl.other, 16); assert(pl.agri >= 4);
  // the 农家乐 pool grows, but each experience keeps its own daily cap
  const built = Object.fromEntries(FXP.IDS.map(id => [id, 1])), c = FXP.counts(9, { stay: 24, parkAgri: 6 + pl.agri, parkOther: 4 + pl.other }, built);
  for (const it of FXP.ITEMS) assert(c[it.id] <= it.cap, it.id + ' ' + c[it.id]);
});
ok('the bus keeps to its lanes: inside the lot or on the avenue, never over a car bay; parked squarely in its reserved bay', () => {
  const lot = [EA.PARK.x0, EA.PARK.y0, EA.PARK.x1, EA.PARK.y1], cars = EA.CAR_SLOTS.map(s => box(s, 10, 8));
  for (const bay of [0, 1]) {
    const o = BUS.busOut(bay);
    for (const r of [BUS.busPath(bay), o.back, o.fwd]) for (const p of sample(r)) {
      assert(inR(p.x, p.y, lot, -1) || (Math.abs(p.y - EA.AVENUE.y) < 0.01 && p.x >= EA.PARK_GATE.x) || (Math.abs(p.x - EA.PARK_GATE.x) < 0.01 && p.y >= EA.AVENUE.y && p.y <= EA.PARK.y0 + 1), 'off the lot / avenue ' + p.x + ',' + p.y);
      for (const c of cars) assert(!inR(p.x, p.y, c, 5), 'bus centre within 5 of a car bay (it is 12 wide; parked cars stand lengthways, 10 wide) ' + p.x + ',' + p.y);
    }
    const s = EA.BUS_SLOTS[bay], end = BUS.busPath(bay).slice(-1)[0]; assert.deepStrictEqual([end.x, end.y], [s.x, s.y]);
  }
  const pl = BUS.dayPlan(12, CTX6), b = pl[0];
  const st = t => BUS.at(pl, t).buses.find(x => x.id === b.id);
  assert.strictEqual(st(b.arrive - 1.5).state, 'arrive'); assert.strictEqual(st(b.arrive + 30).state, 'parked'); assert.deepStrictEqual([st(b.arrive + 30).x, st(b.arrive + 30).y], [EA.BUS_SLOTS[0].x, EA.BUS_SLOTS[0].y]);
  assert.strictEqual(st(b.leave + 1).state, 'leave'); assert.strictEqual(st(b.leave + BUS.DRIVE + 0.1), undefined, 'gone off the east end');
  assert.strictEqual(st(b.leave + 0.2).rot, BUS.BAY_ROT[0], 'backs out nose first in');
});
ok('walkers: in the lot only on the gaps between car bays; never inside a town building; pairs side by side', () => {
  const cars = EA.CAR_SLOTS.map(s => box(s, 10, 8));
  for (let d = 1; d < 30; d++) { const pl = BUS.dayPlan(d, CTX6);
    for (const b of pl) for (const q of b.people) for (const p of sample(q.route, 2)) {
      for (const c of cars) assert(!inR(p.x, p.y, c, -0.5), q.id + ' over a car bay ' + p.x + ',' + p.y);
      for (const B of TN.BUILDINGS) assert(!inR(p.x, p.y, [B.x - B.hw, B.y - B.hd, B.x + B.hw, B.y + B.hd], -0.5), q.id + ' inside ' + B.id);
      for (const s of EA.BUS_SLOTS) assert(!inR(p.x, p.y, box(s, 15, 6), -0.5), q.id + ' through a parked bus ' + p.x + ',' + p.y);
    }
    for (let t = 9 * 60; t < 17 * 60; t += 5) { const ps = BUS.at(pl, t).people;
      for (const p of ps) if (p.dest === 'park' && p.state === 'there') assert(inR(p.x, p.y, TN.RESERVED[0].rect, 3), 'park visitor outside the park');
      for (const p of ps) if (p.dest === 'town' && p.state === 'there') assert(inR(p.x, p.y, TN.SQUARE, 3), 'town visitor outside the square ' + p.x + ',' + p.y); }
  }
});
ok('night and rain: nobody before 9:00 or after 17:00; in the rain the groups at the square / park / beach are under a roof', () => {
  const pl = BUS.dayPlan(31, CTX6);
  for (const t of [0, 6 * 60, 8 * 60 + 30, 17 * 60, 20 * 60, 23 * 60 + 59]) { const f = BUS.at(pl, t); assert.strictEqual(f.buses.length, 0, 'bus at ' + t); assert.strictEqual(f.people.length, 0, 'people at ' + t); }
  const t = 13 * 60, dry = BUS.at(pl, t).people, wet = BUS.at(pl, t, { rain: true }).people;
  assert(dry.some(p => p.state === 'there')); assert(!wet.some(p => p.state === 'there')); assert.strictEqual(wet.length, dry.filter(p => p.state !== 'there').length);
  assert(BUS.at(pl, t, { rain: true }).buses.length === 2, 'the buses still come in the rain');
  assert.deepStrictEqual(BUS.lightsAt(12 * 60, true), []); assert.strictEqual(BUS.lightsAt(19 * 60, true).length, 2); assert.deepStrictEqual(BUS.lightsAt(23 * 60, true), []); assert.deepStrictEqual(BUS.lightsAt(19 * 60, false), []);
});
ok('fee: 100 a bus, so 200 a day at most; nothing is tied to follow / share / tip', () => {
  assert.strictEqual(BUS.FEE, 100); assert.strictEqual(BUS.FEE * BUS.RUNS.length, 200);
  const src = fs.readFileSync(path.join(__dirname, '..', 'bus.js'), 'utf8'); assert(!/follow|share|tip|关注|分享|打赏/i.test(src.replace(/\/\/.*$/gm, '')));
});
ok('save stays v15: hall.bus is append-only and bounded; old saves gain nothing; the album gains one moment', () => {
  assert.strictEqual(SV.CURRENT, 15);
  assert(!('bus' in HL.valid({}))); assert(!('bus' in HL.valid({ bus: 0 }))); assert(!('bus' in HL.valid({ bus: 'x' })));
  assert.strictEqual(HL.valid({ bus: 1234 }).bus, 1234); assert.strictEqual(HL.valid({ bus: 1e12 }).bus, 1e7);
  for (const fx of fs.readdirSync(path.join(__dirname, 'fixtures')).filter(f => /\.json$/.test(f))) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', fx), 'utf8')), s = SV.validate(SV.migrate(raw.save || raw));
    assert(!(s.town && s.town.hall && 'bus' in s.town.hall), fx + ' gained hall.bus');
    const w = JSON.parse(JSON.stringify(s)); if (w.town && w.town.hall) { w.town.hall.bus = 4321; const back = SV.validate(JSON.parse(JSON.stringify(w)));
      assert.strictEqual(back.town.hall.bus, 4321, fx); assert(JSON.stringify(SV.compact ? SV.compact(back) : back).length < 64 * 1024); }
  }
  assert(ALB.BY.tourbus && ALB.BY.tourbus.at === 'bus');
  console.log('     hall.bus adds', JSON.stringify({ bus: 1e7 }).length - 2 + 1, 'bytes at most');
});
console.log(`bus-test: ${n} ok`);
