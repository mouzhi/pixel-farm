// Unit tests for kids.js (v5.4.3 growth, school hours, no-regression, play targets):  node tools/kids-test.js
'use strict';
const assert = require('assert');
const K = require('../kids.js'), FAM = require('../family.js'), SAVE = require('../save.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

const kid = (born, extra) => Object.assign({ id: 'kid0', name: '小豆', born }, extra || {});

ok('stage transitions: baby 5, play 12, school 12, helper 14, teen from 43', () => {
  const k = kid(10);
  for (let d = 10; d <= 14; d++) assert.strictEqual(K.stageOf(k, d), 'baby', 'day ' + d);
  for (let d = 15; d <= 26; d++) assert.strictEqual(K.stageOf(k, d), 'play', 'day ' + d);
  for (let d = 27; d <= 38; d++) assert.strictEqual(K.stageOf(k, d), 'school', 'day ' + d);
  for (let d = 39; d <= 52; d++) assert.strictEqual(K.stageOf(k, d), 'helper', 'day ' + d);
  assert.strictEqual(K.stageOf(k, 53), 'teen');
  assert.strictEqual(K.workRole('play'), 'play');
  assert.strictEqual(K.workRole('school'), 'school');
  assert.strictEqual(K.workRole('helper'), 'child');
  assert.strictEqual(K.workRole('teen'), 'teen');
  assert.strictEqual(K.workRole('baby'), null);
});

ok('school schedule: school and helper leave around 8:00 and return around 14:00; play and baby do not', () => {
  const a = kid(1), b = kid(1, { id: 'kid1', name: '小米' });
  assert(K.goesToSchool('school') && K.goesToSchool('helper') && !K.goesToSchool('play') && !K.goesToSchool('teen'));
  assert(K.atSchool(a, 'school', 8 * 60 + 5) && K.atSchool(a, 'helper', 10 * 60));
  assert(!K.atSchool(a, 'school', 7 * 60) && !K.atSchool(a, 'school', 14 * 60 + 20));
  assert(!K.atSchool(a, 'play', 9 * 60));
  // siblings do not share the exact minute
  assert.notStrictEqual(K.leaveAt(a), K.leaveAt(b));
  assert(Math.abs(K.leaveAt(a) - 8 * 60) <= 8 && Math.abs(K.returnAt(a) - 14 * 60) <= 8);
});

ok('no regression: a working child in an old save stays at least helper (user 小豆: born 48, day 58, full basket)', () => {
  const xiaodou = kid(48);
  K.migrateFamily({ kids: [xiaodou] }, 58, [{ id: 'kid0', basket: ['truffle', 'milk', 'orange'], gathered: 0, bag: {} }]);
  assert.strictEqual(xiaodou.floor, 'helper');
  assert.strictEqual(K.stageOf(xiaodou, 58), 'helper', 'age 10 would be play, but already working');
  assert.strictEqual(K.stageOf(xiaodou, 70), 'helper');
  assert.strictEqual(K.stageOf(xiaodou, 91), 'teen');
  assert.match(K.panelText(xiaodou, 58), /帮工/);
  const xiaomi = { id: 'kid1', name: '小米', born: 58 };
  K.migrateFamily({ kids: [xiaomi] }, 58, []);
  assert.strictEqual(xiaomi.floor, undefined);
  assert.strictEqual(K.stageOf(xiaomi, 58), 'baby');
  // just walked out, no work yet → new table (play), not floored
  const fresh = kid(50);
  K.migrateFamily({ kids: [fresh] }, 56, [{ id: 'kid0', basket: [], gathered: 0, bag: { carrot: 0 } }]);
  assert.strictEqual(fresh.floor, undefined);
  assert.strictEqual(K.stageOf(fresh, 56), 'play');
  // already a teen under the old table (age >= 14)
  const oldTeen = kid(40);
  K.migrateFamily({ kids: [oldTeen] }, 58, [{ id: 'kid0', basket: ['egg'] }]);
  assert.strictEqual(oldTeen.floor, 'teen');
  assert.strictEqual(K.stageOf(oldTeen, 58), 'teen');
  // floor is applied once and kept
  const kept = kid(48, { floor: 'helper' });
  K.applyFloor(kept, 58, { worked: false });
  assert.strictEqual(kept.floor, 'helper');
  // once marked, a helper who is 32 days old (teen under the old table) is not promoted
  const fam = { kids: [kid(18)], kidGrowth: 1 };
  K.migrateFamily(fam, 50, [{ id: 'kid0', basket: ['egg'] }]);
  assert.strictEqual(fam.kids[0].floor, undefined);
  assert.strictEqual(K.stageOf(fam.kids[0], 50), 'helper');
});

ok('v10 save keeps floor append-only and drops junk; version stays 10', () => {
  assert.strictEqual(SAVE.CURRENT, 10);
  const base = SAVE.migrate({ saveVersion: 10, clock: { day: 58, t: 800 }, coins: 0, tiles: [{ f: 'home', c: 0, r: 0, open: true }],
    family: { love: 100, met: 30, moved: 41, kids: [{ id: 'kid0', name: '小豆', born: 48, floor: 'helper' }, { id: 'kid1', name: '小米', born: 58, floor: 'nope' }] } });
  assert.strictEqual(base.saveVersion, 10);
  assert.deepStrictEqual(base.family.kids[0], { id: 'kid0', name: '小豆', born: 48, floor: 'helper' });
  assert.deepStrictEqual(base.family.kids[1], { id: 'kid1', name: '小米', born: 58 });
});

ok('panel shows 玩耍 / 上学 / 帮工 / 少年 and days', () => {
  const k = kid(10);
  assert.strictEqual(K.panelText(k, 10), '宝宝 · 第 1/5 天');
  assert.strictEqual(K.panelText(k, 15), '玩耍 · 第 1/12 天');
  assert.strictEqual(K.panelText(k, 27), '上学 · 第 1/12 天');
  assert.strictEqual(K.panelText(k, 39), '帮工 · 第 1/14 天');
  assert.strictEqual(K.panelText(k, 53), '少年 · 第 1 天');
  assert.strictEqual(K.panelShort(k, 15), '玩耍 1/12');
  assert.strictEqual(K.panelShort(k, 53), '少年');
  assert.match(FAM.kidLine(k, 15), /玩耍/);
});

ok('play targets: pets, pens, pond; insect hook when present; skip around if none; never empty when the yard exists', () => {
  const ctx = {
    actor: { x: 40, y: 50 }, day: 20, t: 10 * 60, kid: kid(10),
    pets: [{ kind: 'cat', name: '黑猫', x: 60, y: 40 }, { kind: 'dog', name: '柴犬', x: 80, y: 50 }],
    pens: [{ id: 'coop', name: '鸡舍', door: { x: 19, y: 78 }, kinds: ['chicken'] },
      { id: 'fold', name: '羊圈', door: { x: -126, y: 0 }, kinds: ['sheep'] },
      { id: 'shed', name: '牛棚', door: { x: 312, y: -58 }, kinds: ['cow'] }],
    pond: { x: 34, y: 100, rx: 19, ry: 12 }, pondFish: 2,
    regions: ['home', 'orchard', 'pasture'], areaAt: (x, y) => {
      if (x >= 0 && x <= 192 && y >= 0 && y <= 128) return 'home';
      if (x < 0) return 'orchard';
      if (x > 216) return 'pasture';
      return 'home';
    },
    door: { x: 36, y: 40 }, rng: () => 0.3
  };
  const kinds = K.playTargets(ctx).map(t => t.kind);
  assert(kinds.includes('play-pet'), kinds);
  assert(kinds.includes('play-watch'), kinds);
  assert(kinds.includes('play-pond'), kinds);
  assert(kinds.includes('play-skip') || kinds.includes('play-chase'), kinds);
  assert(kinds.includes('play-yard'), kinds);
  // no insects yet → skip, not chase
  assert(kinds.includes('play-skip') && !kinds.includes('play-chase'));
  const pond = K.playTargets(ctx).find(t => t.kind === 'play-pond');
  assert.match(pond.label, /看鱼/);
  // hook: a butterfly appears
  globalThis.__insects = { list: [{ kind: 'butterfly', x: 70, y: 60 }] };
  const withBug = K.playTargets(ctx).map(t => t.kind);
  assert(withBug.includes('play-chase'), withBug);
  delete globalThis.__insects;
  // variety: last kind is not always repeated when other targets exist
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const t = K.pickPlay(Object.assign({}, ctx, { lastKind: 'play-yard', rng: () => (i * 0.17) % 1 }));
    seen.add(t.kind);
    assert(t && t.to && t.label);
  }
  assert(seen.size >= 2, 'expected variety, got ' + [...seen]);
  assert(![...seen].includes('play-yard') || seen.size >= 2);
});

ok('pickTask: play stage always plays; school hours walk off the east edge; helper leaves the board to work', () => {
  const playKid = kid(10);
  const ctx = { actor: { x: 40, y: 50 }, day: 20, t: 10 * 60, kid: playKid, pets: [], pens: [], pond: { x: 34, y: 100, rx: 19, ry: 12 },
    pondFish: 0, regions: [], door: { x: 36, y: 40 }, world: { x1: 352 }, rng: () => 0.9 };
  const play = K.pickTask(ctx);
  assert(play && play.kind.startsWith('play'), play);
  const schoolKid = kid(1);
  assert.strictEqual(K.stageOf(schoolKid, 20), 'school'); // age 19
  const go = K.pickTask(Object.assign({}, ctx, { kid: schoolKid, day: 20, t: 8 * 60 + 10, actor: { x: 40, y: 50 } }));
  assert.strictEqual(go.kind, 'school-go');
  assert(go.to.x >= 216, 'walks toward the east edge, got ' + JSON.stringify(go.to));
  assert(go.keepVia && go.via.length >= 3);
  const away = K.pickTask(Object.assign({}, ctx, { kid: schoolKid, day: 20, t: 10 * 60, actor: { x: 360, y: 66, away: 'school' } }));
  assert.strictEqual(away.kind, 'school');
  assert.strictEqual(away.away, true);
  const back = K.pickTask(Object.assign({}, ctx, { kid: schoolKid, day: 20, t: 14 * 60 + 10, actor: { x: 360, y: 66, away: 'school' } }));
  assert.strictEqual(back.kind, 'school-back');
  const helper = kid(1);
  assert.strictEqual(K.stageOf(helper, 35), 'helper');
  const work = K.pickTask(Object.assign({}, ctx, { kid: helper, day: 35, t: 15 * 60, actor: { x: 40, y: 50 } }));
  assert.strictEqual(work, null, 'helper after school defers to the work board');
  const helperGo = K.pickTask(Object.assign({}, ctx, { kid: helper, day: 35, t: 9 * 60, actor: { x: 40, y: 50 } }));
  assert.strictEqual(helperGo.kind, 'school-go');
});

ok('a play kid with targets is never without a play task (idle cap)', () => {
  const k = kid(10);
  const ctx0 = { actor: { x: 40, y: 50 }, day: 20, t: 10 * 60, kid: k,
    pets: [{ kind: 'dog', name: '柴犬', x: 80, y: 50 }],
    pens: [{ id: 'coop', name: '鸡舍', door: { x: 19, y: 78 }, kinds: ['chicken'] }],
    pond: { x: 34, y: 100, rx: 19, ry: 12 }, pondFish: 1, regions: [], door: { x: 36, y: 40 }, rng: () => 0.4 };
  let last = 'play-yard', idle = 0, maxIdle = 0, t = 0;
  while (t < 180) {
    const task = K.pickTask(Object.assign({}, ctx0, { lastKind: last, t: 9 * 60, rng: () => (t * 0.13) % 1 }));
    assert(task && task.kind && task.kind.startsWith('play'), 'needed a play task at t=' + t + ' got ' + (task && task.kind));
    last = task.kind;
    // standing in place with no destination would count as idle; our tasks always have a `to`
    if (!task.to) idle += 1; else idle = 0;
    if (idle > maxIdle) maxIdle = idle;
    t += task.dur || 1;
  }
  assert(maxIdle < K.IDLE_LIMIT, 'idle streak ' + maxIdle + ' >= ' + K.IDLE_LIMIT);
});


ok('nearbyInsect forwards kind to __insects.nearest so chase prefers butterflies', () => {
  const calls = [];
  globalThis.__insects = { nearest(x, y, kind) { calls.push([x, y, kind]); return kind === 'butterfly' ? { kind: 'white', group: 'butterfly', x: 88, y: 60 } : null; } };
  const n = K.nearbyInsect(10, 20, 'butterfly');
  assert.deepStrictEqual(calls[0], [10, 20, 'butterfly']);
  assert.strictEqual(n.group, 'butterfly');
  assert.strictEqual(n.x, 88);
  delete globalThis.__insects;
});

console.log(n + ' tests ok');
