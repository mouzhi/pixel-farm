// v5.11.0.39 农家乐账单: per-source diary ledger matches real checkout / meal gold, survives a v15 round trip,
// and an old save without `rs` / `seenLove` still loads (ledger starts empty; the family-panel badge stays on).
const assert = require('assert'), fs = require('fs'), path = require('path');
const D = require('../diary.js'), IN = require('../inn.js'), Save = require('../save.js');
let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, e.stack); process.exitCode = 1; } };
const FIX = name => path.join(__dirname, 'fixtures', name);

ok('ledger accumulates per source; totals are the sum of the rows', () => {
  const d = D.empty();
  D.addResort(d, 80, 'cabin', 300); D.addResort(d, 80, 'cabin', 300);
  D.addResort(d, 80, 'hut', 300); D.addResort(d, 80, 'villa', 400);
  D.addResort(d, 80, 'camp', 160); D.addResort(d, 80, 'diner', 128); D.addResort(d, 80, 'stall', 64);
  assert.equal(D.addResort(d, 80, 'pier', 50), false, 'pier has no ticket fee');
  const e = d.days[0], r = D.resortOf(e);
  assert.equal(e.rs.cabin, 600);
  assert.deepEqual(r.rows.map(x => x.id), ['cabin', 'hut', 'villa', 'camp', 'diner', 'stall']);
  assert.equal(r.total, 600 + 300 + 400 + 160 + 128 + 64);
  assert.equal(r.rows.reduce((s, x) => s + x.gold, 0), r.total);
  assert.ok(r.rows.find(x => x.id === 'cabin').name === '民宿房费');
});

ok('checkout / diner / stall gold matches the diary rows one for one', () => {
  const I = IN.empty();
  I.cabins = 1; I.diner.lv = 3; I.resort.huts = 1; I.resort.villas = 1; I.resort.camp = 1; I.resort.stall = 1;
  I.stars.avg = 3;
  I.guests = [
    { id: 'g1', look: 'innA', n: 2, room: 0, from: 80, until: 82, at: 12 * 60, stay: 'inn' },
    { id: 'g2', look: 'beachA', n: 2, room: 0, from: 80, until: 82, at: 12 * 60, stay: 'beach' },
    { id: 'g3', look: 'beachB', n: 2, room: 0, from: 80, until: 82, at: 12 * 60, stay: 'villa' },
    { id: 'g4', look: 'beachC', n: 2, room: 0, from: 80, until: 82, at: 12 * 60, stay: 'camp' },
  ];
  const out = IN.checkOut(I, 82, () => ({ s: 3, note: '' }));
  assert.equal(out.groups.length, 4);
  assert.equal(out.by.inn, IN.roomFee(2, 3, 'inn'));
  assert.equal(out.by.beach, IN.roomFee(2, 3, 'beach'));
  assert.equal(out.by.villa, IN.roomFee(2, 3, 'villa'));
  assert.equal(out.by.camp, IN.roomFee(2, 3, 'camp'));
  assert.equal(out.gold, out.by.inn + out.by.beach + out.by.villa + out.by.camp);
  assert.equal(I.earn.rooms, out.gold);

  const dinerStock = { egg: 8, cabbage: 8, pumpkin: 2, flour: 2, milk: 2 };
  const meals = IN.serve(I, 4, dinerStock, false);
  assert.ok(meals.n > 0 && meals.gold > 0);
  const sea = {};
  for (const id of IN.SEA_FISH) sea[id] = 4;
  const stall = IN.serveStall(I, 3, sea);
  assert.ok(stall.n > 0 && stall.gold > 0, 'stall served: ' + JSON.stringify(stall));

  const d = D.empty();
  for (const stay of Object.keys(out.by)) D.addResort(d, 82, D.rsOfStay(stay), out.by[stay]);
  D.addResort(d, 82, 'diner', meals.gold);
  D.addResort(d, 82, 'stall', stall.gold);
  const r = D.resortOf(d.days[0]);
  assert.equal(r.total, out.gold + meals.gold + stall.gold);
  assert.equal(r.rows.find(x => x.id === 'cabin').gold, out.by.inn);
  assert.equal(r.rows.find(x => x.id === 'hut').gold, out.by.beach);
  assert.equal(r.rows.find(x => x.id === 'villa').gold, out.by.villa);
  assert.equal(r.rows.find(x => x.id === 'camp').gold, out.by.camp);
  assert.equal(r.rows.find(x => x.id === 'diner').gold, meals.gold);
  assert.equal(r.rows.find(x => x.id === 'stall').gold, stall.gold);
});

ok('near-7-day total sums only those days; a day without rs does not invent history', () => {
  const d = D.empty();
  D.addResort(d, 10, 'cabin', 100);
  D.addResort(d, 12, 'diner', 50);
  D.add(d, 13, 'in', null, 999); // farm income, not 农家乐
  D.addResort(d, 16, 'stall', 20);
  const w = D.resortWeek(d, 16, 7); // days 10..16
  assert.equal(w.total, 100 + 50 + 20);
  const w2 = D.resortWeek(d, 16, 3); // 14..16
  assert.equal(w2.total, 20);
  const emptyDay = D.valid({ days: [{ d: 13, in: 999 }] }).days[0];
  assert.ok(!emptyDay.rs);
  assert.equal(D.resortOf(emptyDay).total, 0);
});

ok('v15 round trip keeps rs; old diary / settings without the fields load', () => {
  const file = FIX('save-v15-day72-cottage.json');
  let s = JSON.parse(fs.readFileSync(file, 'utf8')); s = s.save || s;
  const old = Save.migrate(s);
  assert.equal(old.saveVersion, 15);
  assert.ok(!old.diary || !((old.diary.days || [])[0] || {}).rs, 'fixture is not supposed to have rs');
  assert.ok(!old.settings.seenLove, 'old save has not opened the panel in this version');

  const d = D.empty();
  D.addResort(d, old.clock.day, 'villa', 800);
  D.addResort(d, old.clock.day, 'diner', 240);
  D.add(d, old.clock.day, 'in', null, 2000);
  old.diary = d;
  const r = Save.decode(Save.encode(old));
  assert.equal(r.saveVersion, 15);
  assert.deepEqual(r.diary.days[0].rs, { villa: 800, diner: 240 });
  assert.equal(D.resortOf(r.diary.days[0]).total, 1040);
  assert.equal(r.diary.days[0].in, 2000);
  assert.ok(JSON.stringify(r.diary).length < 2000);

  // a compact write of the flag, and a missing flag stays off
  old.settings = Object.assign({}, old.settings, { seenLove: 1 });
  const r2 = Save.decode(Save.encode(old));
  assert.equal(r2.settings.seenLove, 1);
  const packed = JSON.parse(Buffer.from(Save.encode(old).split('.')[1], 'base64').toString('utf8'));
  assert.equal(packed.settings.seenLove, 1);
  const bare = Save.validate(Object.assign({}, s, { settings: { speed: 1 } }));
  assert.ok(!bare.settings.seenLove);
});

ok('hostile or unknown rs keys are dropped; entries stay bounded', () => {
  const d = D.valid({ days: [{ d: 5, rs: { cabin: 1e20, pier: 9, diner: -3, stall: 12.4, nope: 1 } }] });
  assert.equal(d.days[0].rs.cabin, 1e9);
  assert.equal(d.days[0].rs.stall, 12);
  assert.ok(!d.days[0].rs.pier && !d.days[0].rs.nope && !d.days[0].rs.diner);
});

console.log('diary-resort-test:', n, 'ok');
