// v5.11.0.36 unit tests: 换个活法 can pick a specific job or shop kind, new life paths, a 5-day cooldown, perks do not stack.
const assert = require('assert');
const CR = require('../careers.js');
const HL = require('../hall.js');
const CL = require('../clinic.js');
const LB = require('../library.js');
const SC = require('../school.js');

let n = 0;
function ok(name, fn) { try { fn(); n++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e && e.stack || e); process.exit(1); } }

const houses = () => {
  const st = HL.empty();
  for (const id of ['L5', 'L8', 'L11']) { HL.start(st, id, 40); HL.finish(st, 41); }
  return st;
};
const richTown = () => {
  const st = houses();
  HL.start(st, 'market', 50); HL.finish(st, 51);
  HL.start(st, 'bakery', 51); HL.finish(st, 52);
  return st;
};
const allShops = () => {
  const st = richTown();
  HL.start(st, 'woodshop', 60); HL.finish(st, 61);
  HL.start(st, 'smithy', 61); HL.finish(st, 62);
  return st;
};
const lateTown = () => {
  const st = allShops();
  HL.start(st, 'school', 70); HL.finish(st, 71);
  HL.start(st, 'library', 71); HL.finish(st, 72);
  HL.start(st, 'clinic', 80); HL.finish(st, 81);
  return st;
};
const home = () => CR.empty();
const ctxOf = (hall, extra) => Object.assign({ hall, lots: {}, coins: 200000, wood: 800, mate: 'm1', kidName: '小豆', nb: {}, day: 80, town: true }, extra || {});

ok('options list each job and shop kind; locked buildings stay visible', () => {
  const opts = CR.options(home(), 'kid0', ctxOf(richTown(), { mate: 'm1' }));
  const ways = opts.map(o => o.way + ':' + (o.at || o.kind || ''));
  assert.ok(ways.includes('farm:'));
  for (const at of ['bakery', 'wood', 'smith', 'school', 'clinic', 'library', 'fish', 'art']) assert.ok(ways.includes('work:' + at), at);
  for (const k of ['flower', 'sweet', 'tackle']) assert.ok(ways.includes('shop:' + k), k);
  assert.ok(ways.includes('inn:inn') || opts.some(o => o.way === 'inn'));
  assert.strictEqual(opts.find(o => o.at === 'bakery').ok, true);
  assert.strictEqual(opts.find(o => o.at === 'wood').ok, false);
  assert.strictEqual(opts.find(o => o.at === 'school').ok, false);
  assert.ok(/学校/.test(opts.find(o => o.at === 'school').why));
  assert.strictEqual(opts.find(o => o.at === 'fish').ok, true, 'the pond is always there');
  assert.strictEqual(opts.find(o => o.at === 'art').ok, true);
  const noTown = CR.options(home(), 'kid0', ctxOf(richTown(), { town: false }));
  assert.strictEqual(noTown.find(o => o.at === 'art').ok, false);
  assert.ok(/镇门/.test(noTown.find(o => o.at === 'art').why));
});

ok('the player can pick bakery vs smith, and a shop kind other than the spouse default', () => {
  const hall = allShops(), st = home(), lots = {};
  const w = CR.take(st, lots, 'kid0', { way: 'work', at: 'smith' }, ctxOf(hall, { nb: { n3: 90 } }), 80);
  assert.ok(w.ok, w.why); assert.strictEqual(w.at, 'smith');
  const st2 = home(), lots2 = {};
  const s = CR.take(st2, lots2, 'kid0', { way: 'shop', kind: 'tackle' }, ctxOf(hall, { mate: 'm1' }), 80);
  assert.ok(s.ok, s.why); assert.strictEqual(s.kind, 'tackle');
  assert.notStrictEqual(s.kind, CR.kindOfMate('m1'));
});

ok('new jobs: teacher, clinic, library, fisher, artist; take() and stands', () => {
  const hall = lateTown(), st = home(), lots = {};
  for (const at of ['school', 'clinic', 'library', 'fish', 'art']) {
    const r = CR.take(home(), {}, 'kid0', { way: 'work', at }, ctxOf(hall), 80);
    assert.ok(r.ok, at + ': ' + r.why);
    assert.strictEqual(r.at, at);
    const stand = CR.standOf(at);
    assert.ok(stand && Number.isFinite(stand.x) && Number.isFinite(stand.y), at + ' stand');
  }
  const early = CR.take(home(), lots, 'kid0', { way: 'work', at: 'school' }, ctxOf(allShops()), 80);
  assert.ok(!early.ok); assert.ok(/学校/.test(early.why));
});

ok('换个活法 can switch from bakery to teacher; 5-day cooldown; fee 2,000 after the first free change', () => {
  const hall = lateTown(), st = home(), lots = {};
  assert.strictEqual(CR.pathOf(st, 'kid0').free, 1);
  const plan = CR.planChange(st, 'kid0', { way: 'work', at: 'bakery' }, ctxOf(hall), 90);
  assert.ok(plan.ok, plan.why); assert.strictEqual(plan.fee, 0);
  const r = CR.applyPending(st, lots, 'kid0', ctxOf(hall), 91);
  assert.ok(r.ok); assert.strictEqual(r.at, 'bakery'); assert.strictEqual(st.path.kid0.chg, 91);
  const soon = CR.planChange(st, 'kid0', { way: 'work', at: 'school' }, ctxOf(hall, { coins: 20000 }), 94);
  assert.ok(!soon.ok); assert.ok(/再过 2 天/.test(soon.why), soon.why);
  assert.strictEqual(CR.coolLeft(st.path.kid0, 94), 2);
  const ready = CR.planChange(st, 'kid0', { way: 'work', at: 'school' }, ctxOf(hall, { coins: 20000 }), 96);
  assert.ok(ready.ok, ready.why); assert.strictEqual(ready.fee, 2000);
  const r2 = CR.applyPending(st, lots, 'kid0', ctxOf(hall), 97);
  assert.ok(r2.ok); assert.strictEqual(r2.at, 'school'); assert.strictEqual(st.path.kid0.chg, 97);
  assert.strictEqual(CR.pathLine(st.path.kid0, '小豆'), '在学校当老师');
});

ok('new job perks do not stack when both children take the same path; farm help stays halved', () => {
  const st = home();
  assert.strictEqual(CR.schoolFavor(st), 0);
  assert.strictEqual(CR.clinicFloor(st), 0);
  assert.strictEqual(CR.libraryHints(st), 0);
  assert.strictEqual(CR.artStars(st), 0);
  st.path.kid0 = CR.cleanPath({ way: 'work', at: 'school', day: 80 });
  st.path.kid1 = CR.cleanPath({ way: 'work', at: 'school', day: 80 });
  assert.strictEqual(CR.schoolFavor(st), 1);
  assert.strictEqual(CR.awayForFarm(st, 'kid0'), true);
  assert.strictEqual(CR.yieldMul(st, 'kid0'), 0.5);
  assert.strictEqual(CR.helpDayP(st, 'kid0'), 0.25);
  st.path.kid1 = CR.cleanPath({ way: 'work', at: 'clinic', day: 80 });
  assert.strictEqual(CR.clinicFloor(st), 10);
  assert.strictEqual(CR.clinicCheck(st), 5);
  st.path.kid0 = CR.cleanPath({ way: 'work', at: 'library', day: 80 });
  assert.strictEqual(CR.libraryFavor(st), 1);
  assert.strictEqual(CR.libraryHints(st), 1);
  st.path.kid0 = CR.cleanPath({ way: 'work', at: 'art', day: 80 });
  assert.strictEqual(CR.artStars(st), 0.15);
  st.path.kid1 = CR.cleanPath({ way: 'work', at: 'art', day: 80 });
  assert.strictEqual(CR.artStars(st), 0.15, 'two artists still boost once');
  assert.strictEqual(CR.sketchDue(st, 'kid0', 85), true);
  assert.strictEqual(CR.sketchDue(st, 'kid0', 84), false);
  assert.strictEqual(CR.sketchDue(st, 'kid0', 80), false);
});

ok('clinic checkup and library hints stay backward compatible and accept the extra boost', () => {
  const hall = lateTown();
  hall.clinic = CL.empty();
  const day = 90; // 90 % 30 === 0, and after clinic built on 81
  assert.ok(CL.isCheck(hall, day));
  const a = [{ h: 40 }, { h: 80 }];
  const n = CL.checkup(hall, a, day, 5);
  assert.strictEqual(n, 2);
  assert.strictEqual(a[0].h, 55);
  assert.strictEqual(a[1].h, 95);
  const catalog = [
    { id: 'a', name: 'A', hint: 'ha' }, { id: 'b', name: 'B', hint: 'hb' },
    { id: 'c', name: 'C', hint: 'hc' }, { id: 'd', name: 'D', hint: 'hd' }
  ];
  assert.strictEqual(LB.hints({}, 3, catalog).length, 2);
  assert.strictEqual(LB.hints({}, 3, catalog, 1).length, 3);
  assert.strictEqual(SC.favorMul(hall), 2);
});

ok('save stays v15 append-only: missing chg means no cooldown; unknown at falls back to farm', () => {
  const v = CR.valid({ path: { kid0: { way: 'work', at: 'school', day: 100, chg: 100 } }, wage: 0 });
  assert.strictEqual(v.path.kid0.at, 'school');
  assert.strictEqual(v.path.kid0.chg, 100);
  const old = CR.valid({ path: { kid0: { way: 'work', at: 'bakery', day: 50 } } });
  assert.strictEqual(old.path.kid0.chg, 0);
  assert.strictEqual(CR.coolLeft(old.path.kid0, 80), 0);
  const bad = CR.valid({ path: { kid0: { way: 'work', at: 'pilot', day: 10 } } });
  assert.strictEqual(bad.path.kid0.way, 'work');
  assert.strictEqual(bad.path.kid0.at, null);
  const once = CR.valid(JSON.parse(JSON.stringify(v)));
  assert.deepStrictEqual(once, v);
});

console.log('\n' + n + ' tests ok');
