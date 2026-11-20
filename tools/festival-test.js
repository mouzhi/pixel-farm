// v5.10.11 丰收节 + 灯会: node tools/festival-test.js
const assert = require('assert');
const path = require('path');
const FS = require('../festival.js');
const HL = require('../hall.js');
const CL = require('../clinic.js');
const SIM = require('../sim.js');
const PFSave = require('../save.js');
let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, e && e.message); process.exitCode = 1; } };

function pavedHall(day) {
  const H = HL.empty();
  // 15 projects that take prosperity to 5 (clinic + 5 rebuilds + earlier ones)
  const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
  ids.forEach((id, i) => { H.built[id] = (day | 0) - (ids.length - 1) + i; });
  return H;
}

ok('unlocked only at 繁荣度 5 (clinic + five rebuilds); every 28 days after that, not the day it is unlocked', () => {
  const early = HL.empty(); early.built = { L5: 1, L8: 2, L11: 3, market: 4, bakery: 5, woodshop: 6, smithy: 7, school: 8, library: 9 };
  assert.strictEqual(FS.ready(early), false);
  assert.strictEqual(FS.isDay(early, 28), false);
  assert.strictEqual(FS.nextDay(early, 10), null);
  const H = pavedHall(40);
  assert.strictEqual(HL.prosperity(H), 5);
  assert.ok(CL.paved(H));
  assert.ok(FS.ready(H));
  assert.strictEqual(FS.readyDay(H), 40);
  assert.strictEqual(FS.isDay(H, 40), false); // unlocked today, first festival is later
  assert.strictEqual(FS.isDay(H, 56), true);
  assert.strictEqual(FS.isDay(H, 57), false);
  assert.strictEqual(FS.isDay(H, 84), true);
  assert.strictEqual(FS.nextDay(H, 41), 56);
  assert.strictEqual(FS.nextDay(H, 56), 56);
  assert.strictEqual(FS.nextDay(H, 57), 84);
});

ok('the lantern fair needs the woodshop and the smithy; feast and fair hours; sleep after 22:00', () => {
  const H = pavedHall(40);
  assert.ok(FS.hasLantern(H, 56));
  const noForge = pavedHall(40); delete noForge.built.smithy;
  assert.strictEqual(CL.paved(noForge), true); // paved does not care about the smithy, but the fair does
  assert.strictEqual(FS.hasLantern(noForge, 56), false);
  assert.ok(FS.feastOpen(H, 56, 18 * 60));
  assert.ok(FS.feastOpen(H, 56, 21 * 60 + 59));
  assert.strictEqual(FS.feastOpen(H, 56, 17 * 60 + 59), false);
  assert.strictEqual(FS.fairOpen(H, 56, 18 * 60 + 30), false);
  assert.ok(FS.fairOpen(H, 56, 19 * 60));
  assert.ok(FS.fairOpen(H, 56, 21 * 60 + 59));
  assert.strictEqual(FS.fairOpen(H, 56, 22 * 60), false);
  assert.strictEqual(FS.bedtime(H, 56), 22 * 60);
  assert.strictEqual(FS.bedtime(H, 57), null);
  assert.ok(FS.GIFT >= 200 && FS.GIFT <= 800);
  assert.strictEqual(FS.EVERY, 28);
});

ok('a modest red packet is granted once per festival, never tied to follow / share / tip', () => {
  const H = pavedHall(40);
  assert.strictEqual(FS.grant(H, 56), FS.GIFT);
  assert.strictEqual(H.festival.gift, 56);
  assert.strictEqual(H.festival.last, 56);
  assert.strictEqual(FS.grant(H, 56), 0); // once
  assert.strictEqual(FS.grant(H, 84), FS.GIFT);
  assert.strictEqual(FS.grant.length, 2); // only the hall state and the day; no follow / share / tip argument
});

ok('autobuy never lists a festival, hall, school, library, clinic, rebuild, shop, inn, resort or smithy item', () => {
  const deny = /festival|fest|hall|school|library|clinic|rebuild|h1|h2|h3|h4|h5|inn|resort|smithy|woodshop|bakery|market|town|shop|lantern|feast|pave/;
  for (const id of SIM.AUTO_BUY) assert.ok(!deny.test(id), 'autobuy has ' + id);
});

ok('the long table sits on the plaza, clear of the fountain, the stalls and L11', () => {
  const MK = require('../market.js');
  const T = FS.TABLE, box = FS.blocks()[0];
  assert.ok(Math.hypot(T.x - 524, T.y - 98) > 12, 'too close to the fountain');
  for (const s of MK.STALLS) {
    const hit = !(box[2] < s.x - MK.HW || box[0] > s.x + MK.HW || box[3] < s.y - MK.HD || box[1] > s.y + MK.HD);
    assert.ok(!hit, 'overlaps stall ' + s.id);
  }
  // L11 is 546, 131 hw 8 hd 7 → y 124–138
  assert.ok(box[3] < 124, 'overlaps L11');
  assert.ok(FS.SEATS.length >= 8);
  assert.ok(FS.STRINGS.length >= 8);
  assert.ok(FS.lights().length >= 12);
});

ok('valid(): junk in, a clean festival out; fixtures gain an empty festival, save stays v15', () => {
  const v = FS.valid({ last: 90, gift: 56, nope: 1, follow: true });
  assert.deepStrictEqual(v, { last: 90, gift: 56 });
  const hall = HL.valid({ festival: { last: 'x', gift: -3 } });
  assert.deepStrictEqual(hall.festival, { last: 0, gift: 0 });
  const empty = HL.empty();
  assert.deepStrictEqual(empty.festival, { last: 0, gift: 0 });
  assert.strictEqual(PFSave.CURRENT, 15);
  const fixtures = [
    path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'),
    path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'),
  ];
  const fs = require('fs');
  for (const f of fixtures) {
    if (!fs.existsSync(f)) continue;
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    const s = raw.save || raw;
    const out = HL.valid(s.town && s.town.hall);
    assert.deepStrictEqual(out.festival, { last: 0, gift: 0 });
  }
});

console.log('festival-test:', n, 'ok');
