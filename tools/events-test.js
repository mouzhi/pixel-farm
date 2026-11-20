// v5.10.14 活动倒计时: node tools/events-test.js
const assert = require('assert');
const path = require('path');
const EV = require('../events.js');
const MK = require('../market.js');
const SC = require('../school.js');
const FS = require('../festival.js');
const HL = require('../hall.js');
const CL = require('../clinic.js');
const PFSave = require('../save.js');
let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, e && e.message); process.exitCode = 1; } };

function pavedHall(day) {
  const H = HL.empty();
  const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
  ids.forEach((id, i) => { H.built[id] = (day | 0) - (ids.length - 1) + i; });
  return H;
}

ok('nextOccurrence: every N days, offset, and the unlock day itself does not count', () => {
  assert.strictEqual(EV.nextOccurrence(1, 7, 0, 0), 7);
  assert.strictEqual(EV.nextOccurrence(7, 7, 0, 0), 7); // today is a market day
  assert.strictEqual(EV.nextOccurrence(8, 7, 0, 0), 14);
  assert.strictEqual(EV.nextOccurrence(10, 7, 0, 20), 21); // after the square is built on day 20
  assert.strictEqual(EV.nextOccurrence(20, 7, 0, 20), 21); // not the unlock day
  assert.strictEqual(EV.nextOccurrence(28, 28, 0, 10), 28);
  assert.strictEqual(EV.nextOccurrence(29, 28, 0, 10), 56);
  // planned 海边节: every 28 days, offset 14
  assert.strictEqual(EV.nextOccurrence(1, 28, 14, 0), 14);
  assert.strictEqual(EV.nextOccurrence(14, 28, 14, 0), 14);
  assert.strictEqual(EV.nextOccurrence(15, 28, 14, 0), 42);
  assert.strictEqual(EV.nextOccurrence(40, 28, 14, 30), 42);
  assert.strictEqual(EV.nextOccurrence(42, 28, 14, 30), 42);
  assert.strictEqual(EV.nextOccurrence(43, 28, 14, 30), 70);
  assert.strictEqual(EV.nextOccurrence(10, 0, 0, 0), null);
  // a negative offset wraps
  assert.strictEqual(EV.nextOccurrence(1, 28, -14, 0), 14);
});

ok('matches market / school / festival nextDay for a paved hall', () => {
  const H = pavedHall(40);
  assert.strictEqual(FS.readyDay(H), 40);
  assert.ok(CL.paved(H));
  for (const d of [40, 41, 49, 55, 56, 57, 70, 84]) {
    assert.strictEqual(EV.nextOccurrence(d, MK.EVERY, 0, H.built.market), MK.nextDay(H, d), 'market ' + d);
    assert.strictEqual(EV.nextOccurrence(d, SC.EVERY, 0, H.built.school), SC.nextDay(H, d), 'sports ' + d);
    assert.strictEqual(EV.nextOccurrence(d, FS.EVERY, 0, FS.readyDay(H)), FS.nextDay(H, d), 'festival ' + d);
  }
});

ok('locked events stay hidden; a paved hall lists 集市, 运动会 and 丰收节', () => {
  const empty = EV.view({ hall: HL.empty(), day: 50, t: 10 * 60 });
  assert.ok(empty.empty);
  assert.strictEqual(empty.head, null);
  assert.deepStrictEqual(empty.items.map(i => i.id), []);
  const marketOnly = HL.empty(); marketOnly.built.market = 10;
  const m = EV.view({ hall: marketOnly, day: 12, t: 10 * 60 });
  assert.deepStrictEqual(m.items.map(i => i.id), ['market']);
  assert.strictEqual(m.head.id, 'market');
  assert.strictEqual(m.line, '🧺集市 还有2天'); // next is day 14
  const H = pavedHall(40);
  const v = EV.view({ hall: H, day: 58, t: 10 * 60 });
  assert.deepStrictEqual(v.items.map(i => i.id), ['market', 'sports', 'festival']);
  assert.strictEqual(v.items[0].day, 63);
  assert.strictEqual(v.items[1].day, 70);
  assert.strictEqual(v.items[2].day, 84);
  assert.strictEqual(v.line, '🧺集市 还有5天');
  const soon = EV.view({ hall: H, day: 53, t: 10 * 60 });
  // day 56 is market + sports + festival; headline prefers 丰收节
  assert.strictEqual(soon.head.id, 'festival');
  assert.strictEqual(soon.line, '🏮丰收节 还有3天');
  assert.ok(soon.items.every(it => it.days === 3));
});

ok('on the day: 今晚18点 / 今天7点 before it starts, 进行中 during, then the next cycle', () => {
  const H = pavedHall(40);
  const eve = EV.view({ hall: H, day: 56, t: 6 * 60 });
  assert.strictEqual(eve.head.id, 'festival');
  assert.strictEqual(eve.head.text, '今晚18点');
  assert.strictEqual(eve.line, '🏮丰收节 今晚18点');
  const fest = eve.items.find(i => i.id === 'festival');
  const mkt = eve.items.find(i => i.id === 'market');
  const sp = eve.items.find(i => i.id === 'sports');
  assert.strictEqual(mkt.text, '今天7点');
  assert.strictEqual(sp.text, '今天9点');
  assert.ok(fest.laterToday && !fest.open);
  const mid = EV.view({ hall: H, day: 56, t: 10 * 60 });
  assert.ok(mid.items.find(i => i.id === 'market').open);
  assert.ok(mid.items.find(i => i.id === 'sports').open);
  assert.strictEqual(mid.items.find(i => i.id === 'festival').text, '今晚18点');
  assert.strictEqual(mid.line, '🏮丰收节 今晚18点'); // still the festival, not the market in progress
  const live = EV.view({ hall: H, day: 56, t: 20 * 60 });
  assert.strictEqual(live.line, '🏮丰收节 进行中');
  assert.ok(live.head.open);
  // market and sports have ended, so they jump to the next cycle
  assert.strictEqual(live.items.find(i => i.id === 'market').day, 63);
  assert.strictEqual(live.items.find(i => i.id === 'sports').day, 70);
  const late = EV.view({ hall: H, day: 56, t: 22 * 60 });
  assert.strictEqual(late.head.id, 'market');
  assert.strictEqual(late.line, '🧺集市 还有7天');
  assert.strictEqual(late.items.find(i => i.id === 'festival').day, 84);
});

ok('register() adds an offset-14 event without changing the built-in ones; unregister cleans up', () => {
  const beach = EV.register({
    id: 'beach', name: '海边节', icon: '🌊', every: 28, offset: 14, priority: 3,
    hours: { from: 16 * 60, to: 21 * 60 },
    unlock: () => true, after: () => 0,
  });
  assert.strictEqual(beach.id, 'beach');
  const v = EV.view({ hall: HL.empty(), day: 20, t: 10 * 60 });
  const b = v.items.find(i => i.id === 'beach');
  assert.ok(b);
  assert.strictEqual(b.day, 42);
  assert.strictEqual(b.text, '还有22天');
  assert.strictEqual(EV.nextOccurrence(20, 28, 14, 0), 42);
  assert.ok(EV.unregister('beach'));
  const after = EV.view({ hall: HL.empty(), day: 20, t: 10 * 60 });
  assert.ok(!after.items.some(i => i.id === 'beach'));
  assert.ok(EV.list().some(e => e.id === 'festival'));
});

ok('hourText / whenText wording; save stays v15; fixtures do not grow a new field', () => {
  assert.strictEqual(EV.hourText(18 * 60), '今晚18点');
  assert.strictEqual(EV.hourText(7 * 60), '今天7点');
  assert.strictEqual(EV.whenText({ open: true, laterToday: false, days: 0, hours: { from: 18 * 60 } }), '进行中');
  assert.strictEqual(EV.whenText({ open: false, laterToday: true, days: 0, hours: { from: 18 * 60 } }), '今晚18点');
  assert.strictEqual(EV.whenText({ open: false, laterToday: false, days: 3, hours: { from: 18 * 60 } }), '还有3天');
  assert.strictEqual(EV.whenText({ open: false, laterToday: false, days: 1, hours: { from: 18 * 60 } }), '还有1天');
  assert.strictEqual(PFSave.CURRENT, 15);
  const fixtures = [
    path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'),
    path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'),
  ];
  const fs = require('fs');
  for (const f of fixtures) {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    const data = raw.save || raw;
    const hall = HL.valid(data.town && data.town.hall);
    const v = EV.view({ hall, day: (data.clock && data.clock.day) || 1, t: 10 * 60, save: data });
    // the day-72 cottage fixture has no hall projects, so the chip stays hidden
    if (/day72/.test(f)) assert.ok(v.empty);
    assert.ok(!('events' in data) && !('countdown' in data));
  }
});

console.log('events-test:', n, 'ok');
