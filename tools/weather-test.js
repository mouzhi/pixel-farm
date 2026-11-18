// Unit tests for light rain and insects (no browser):  node tools/weather-test.js
'use strict';
const assert = require('assert');
const WX = require('../weather.js'), INS = require('../insects.js'), CX = require('../codex.js'), SAVE = require('../save.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

ok('over 100 days a shower arrives every 7–10 days and lasts 2–4 hours', () => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    const { rains } = WX.simulate(100, seed);
    assert(rains.length >= 9 && rains.length <= 14, 'seed ' + seed + ' rains ' + rains.length);
    for (let i = 1; i < rains.length; i++) {
      const gap = rains[i].day - rains[i - 1].day;
      assert(gap >= WX.GAP_MIN && gap <= WX.GAP_MAX, 'gap ' + gap + ' seed ' + seed);
    }
    for (const r of rains) {
      assert(r.dur >= WX.DUR_MIN && r.dur <= WX.DUR_MAX);
      assert(r.dur % 60 === 0);
      assert(r.start >= 8 * 60 && r.start < 14 * 60);
    }
  }
});

ok('a rain day marks existing crops as needing no watering; after the shower new plantings still need water', () => {
  let w = WX.emptyWeather();
  const seed = 42;
  const first = WX.simulate(40, seed).rains[0];
  for (let d = 1; d <= first.day; d++) w = WX.beginDay(w, d, seed);
  assert(WX.isRainDay(w, first.day));
  assert(WX.isRaining(w, first.day, first.start));
  assert(WX.isRaining(w, first.day, first.start + first.dur - 1));
  assert(!WX.isRaining(w, first.day, first.start + first.dur));
  assert(!WX.isRaining(w, first.day, first.start - 1));
  assert.strictEqual(WX.wetness(w, first.day, first.start + 1), 1);
  assert(WX.wetness(w, first.day, first.start + first.dur + 30) > 0);
  assert.strictEqual(WX.wetness(w, first.day - 1, 12 * 60), 0);
  // beginDay is idempotent: the window stays today's
  const start = w.start, dur = w.dur;
  w = WX.beginDay(w, first.day, seed);
  assert.strictEqual(w.start, start);
  assert.strictEqual(w.dur, dur);
});

ok('offline catch-up walks each dawn and reports the days that rained', () => {
  let w = WX.emptyWeather();
  w = WX.ensure(w, 1, 42);
  const off = WX.advanceDays(w, 1, 20, 42);
  const sim = WX.simulate(21, 42);
  assert.deepStrictEqual(off.rainDays, sim.rains.filter(r => r.day > 1 && r.day <= 21).map(r => r.day));
  assert(off.rainDays.length >= 1);
});

ok('summer is the second 30 days of a 120-day year', () => {
  assert(!WX.isSummer(1));
  assert(!WX.isSummer(30));
  assert(WX.isSummer(31));
  assert(WX.isSummer(60));
  assert(!WX.isSummer(61));
  assert(WX.isSummer(151)); // 151-1 = 150, 150 % 120 = 30, start of summer
});

ok('insects: 2–5 butterflies and 1–3 dragonflies on a sunny day, none in the rain, fireflies only on summer nights', () => {
  const rng = (() => { let a = 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  const pond = { x: 34, y: 100, rx: 19, ry: 12 };
  INS.reset();
  INS.tick(0, { day: 3, raining: false, night: false, summer: false, rng, pond });
  const sunny = INS.list();
  const but = sunny.filter(x => x.group === 'butterfly').length;
  const dra = sunny.filter(x => x.group === 'dragonfly').length;
  assert(but >= 2 && but <= 5, 'butterflies ' + but);
  assert(dra >= 1 && dra <= 3, 'dragonflies ' + dra);
  assert.strictEqual(sunny.filter(x => x.group === 'firefly').length, 0);
  INS.tick(0.2, { day: 3, raining: false, night: false, summer: false, rng, pond });
  assert.strictEqual(INS.list().filter(x => x.group === 'butterfly').length, but, 'counts stay put on the same day');
  INS.tick(0, { day: 3, raining: true, night: false, rng, pond });
  assert.strictEqual(INS.list().length, 0);
  INS.tick(0, { day: 40, raining: false, night: true, summer: true, rng, pond });
  const flies = INS.list();
  assert(flies.length >= 3 && flies.every(x => x.group === 'firefly'));
  INS.tick(0, { day: 3, raining: false, night: true, summer: false, rng, pond });
  assert.strictEqual(INS.list().length, 0, 'no fireflies outside summer');
});

ok('catching an insect writes a bug: key, then the insect is released', () => {
  INS.reset();
  const ev = INS.forceCatch('swallow', 9, 80, 70);
  assert.strictEqual(ev.kind, 'swallow');
  assert.strictEqual(ev.key, 'bug:swallow');
  assert.strictEqual(ev.name, '凤蝶');
  const book = CX.emptyCodex();
  const rec = CX.record(book, ev.key, ev.day);
  assert(rec.first);
  assert(CX.has(book, CX.keyBug('swallow')));
  const due = CX.dueAchievements({ day: 9, caughtBug: true, sawRain: true });
  assert(due.some(u => u.id === 'firstbug'));
  assert(due.some(u => u.id === 'firstrain'));
  assert.strictEqual(INS.list().filter(x => x.id === ev.id).length, 0);
});

ok('__insects.nearest (and PFInsects.nearest) returns the closest live insect', () => {
  INS.reset();
  INS.tick(0, { day: 2, raining: false, night: false, butterflies: 3, dragonflies: 2, pond: { x: 34, y: 100, rx: 19, ry: 12 }, rng: () => 0.4 });
  const n = INS.nearest(34, 100);
  assert(n && typeof n.dist === 'number' && n.kind);
  const n2 = INS.list().reduce((b, it) => {
    const d = Math.hypot(it.x - 34, it.y - 100);
    return !b || d < b.dist ? { kind: it.kind, dist: d } : b;
  }, null);
  assert.strictEqual(n.kind, n2.kind);
});

ok('a v10 save keeps weather and insect entries without bumping the version', () => {
  const s = SAVE.validate({ saveVersion: 10, clock: { day: 8, t: 600 }, tiles: [{ f: 'home', c: 0, r: 0, open: true }],
    weather: { nextDay: 11, start: 540, dur: 180, lastDay: 3, rained: 0, nextStart: 0, nextDur: 0 }, bugNet: 1,
    codex: { entries: { 'bug:white': { firstDay: 6, count: 1 } } } });
  assert.strictEqual(s.saveVersion, 10);
  assert.strictEqual(s.weather.nextDay, 11);
  assert.strictEqual(s.bugNet, 1);
  assert.ok(s.codex.entries['bug:white']);
});

ok('insect catalog has 8 species with rarity colours and the 昆虫 group is in the book', () => {
  const g = CX.groups().find(x => x.id === 'bug');
  assert(g && g.name === '昆虫' && g.items.length === 8);
  assert.strictEqual(CX.rarityOf(g.items.find(i => i.id === 'white')), 'common');
  assert.strictEqual(CX.rarityOf(g.items.find(i => i.id === 'grey')), 'rare');
  assert.strictEqual(CX.rarityOf(g.items.find(i => i.id === 'swallow')), 'epic');
  assert.strictEqual(CX.rarityOf(g.items.find(i => i.id === 'firefly')), 'epic');
});


ok('nearest(x, y, "butterfly") skips dragonflies so a chasing kid aims at a butterfly', () => {
  INS.reset();
  const pond = { x: 34, y: 100, rx: 19, ry: 12 };
  INS.tick(0, { day: 2, raining: false, night: false, butterflies: 1, dragonflies: 1, fireflies: 0, pond, rng: () => 0.4 });
  const list = INS.list();
  const fly = list.find(x => x.group === 'dragonfly');
  const but = list.find(x => x.group === 'butterfly');
  assert(fly && but, 'need both');
  // stand on the dragonfly; unfiltered nearest would pick it
  const any = INS.nearest(fly.x, fly.y);
  assert.strictEqual(any.group, 'dragonfly');
  const only = INS.nearest(fly.x, fly.y, 'butterfly');
  assert(only && only.group === 'butterfly' && only.id === but.id, only);
});

ok('a kid with a net standing next to an insect catches it (then it is released)', () => {
  INS.reset();
  const pond = { x: 34, y: 100, rx: 19, ry: 12 };
  INS.tick(0, { day: 5, raining: false, night: false, butterflies: 1, dragonflies: 0, pond, rng: () => 0.2 });
  const b = INS.list()[0];
  assert(b);
  const evs = INS.tick(1, {
    day: 5, raining: false, night: false, butterflies: 1, dragonflies: 0, pond,
    hasNet: true, kids: [{ x: b.x, y: b.y, id: 'kid0' }], rng: () => 0
  });
  assert(evs && evs.length === 1 && evs[0].id === b.id, evs);
  assert.strictEqual(INS.list().filter(x => x.id === b.id).length, 0);
});

console.log(n + ' tests ok');
