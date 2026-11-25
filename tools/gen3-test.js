// v5.12.5 第三代: node tools/gen3-test.js — births, growth, closeness, moving out, weddings, the save (v15, append-only)
'use strict';
const assert = require('assert');
const G3 = require('../gen3.js'), KD = require('../kids.js'), HM = require('../home.js'), SV = require('../save.js'), SIM = require('../sim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const both = { kid0: 60, kid1: 80 };
const run = (st, from, to, ctx) => { const ev = []; for (let d = from; d <= to; d++) ev.push(...G3.catchUp(st, d, ctx)); return ev; };

ok('four grandchildren, two per family, each family has a daughter; names differ from everyone else', () => {
  assert.strictEqual(G3.KIDS.length, 4); assert.strictEqual(G3.MAX, 4);
  for (const p of ['kid0', 'kid1']) { const fam = G3.KIDS.filter(k => k.p === p); assert.strictEqual(fam.length, 2); assert(fam.some(k => k.girl), p + ' has a daughter'); }
  const names = G3.KIDS.map(k => k.name).concat(G3.MATES.map(m => m.name)); assert.strictEqual(new Set(names).size, names.length);
  for (const nm of names) assert(!['小豆', '小米', '阿团', '朵朵', '石头', '阿禾'].includes(nm), nm);
});
ok('births: nothing before a child marries; an old save gets its first grandchild 7 days after this version first sees it', () => {
  const st = G3.empty(); assert.deepStrictEqual(G3.catchUp(st, 50, { moved: {} }), []); assert.strictEqual(st.s, 0);
  assert.deepStrictEqual(G3.catchUp(st, 100, { moved: both }), []); assert.strictEqual(st.s, 100, 'stamped on first sight');
  const ev = run(st, 101, 130, { moved: both }); assert.deepStrictEqual(ev.map(e => e.id + '@' + e.day), ['g0@107', 'g1@107', 'g2@128', 'g3@128']);
});
ok('births: a child who marries later has their children after their own wedding; offline days count', () => {
  const st = G3.empty(); G3.catchUp(st, 70, { moved: { kid0: 70 } }); const ev = G3.catchUp(st, 200, { moved: { kid0: 70, kid1: 150 } });
  assert.deepStrictEqual(ev.map(e => e.id + '@' + e.day), ['g0@77', 'g2@98', 'g1@157', 'g3@178']);
  assert.strictEqual(st.d, 200);
});
ok('growth uses the children\'s table: 宝宝 5, 玩耍 12, 上学 12, 帮工 14, then 少年', () => {
  const g = { b: 100 }; assert.strictEqual(G3.stageOf(g, 104), 'baby'); assert.strictEqual(G3.stageOf(g, 105), 'play'); assert.strictEqual(G3.stageOf(g, 117), 'school');
  assert.strictEqual(G3.stageOf(g, 129), 'helper'); assert.strictEqual(G3.stageOf(g, 143), 'teen'); assert.strictEqual(KD.TEEN_START, 43);
});
ok('closeness: school days +1 each and +2 with the 同桌 (doubled by the school expansion), teens +1 with the closest (+1 more with the park), capped at 100', () => {
  const st = G3.empty(); st.s = 1; st.d = 1; st.k.g0 = { b: 1 };
  run(st, 2, 17, { moved: { kid0: 1 } }); assert(!st.k.g0.r, 'nothing before school');
  run(st, 18, 18, { moved: { kid0: 1 } }); const r = st.k.g0.r; const sum = Object.values(r).reduce((a, b) => a + b, 0); assert.strictEqual(sum, 4 + 2);
  const st2 = G3.empty(); st2.s = 1; st2.d = 17; st2.k.g0 = { b: 1 }; run(st2, 18, 18, { moved: { kid0: 1 }, mul: 2 }); assert.strictEqual(Object.values(st2.k.g0.r).reduce((a, b) => a + b, 0), 12);
  const st3 = G3.empty(); st3.s = 1; st3.d = 43; st3.k.g0 = { b: 1, r: { c1: 50 } }; run(st3, 44, 53, { moved: { kid0: 1 }, park: true }); assert.strictEqual(st3.k.g0.r.c1, 70);
  st3.k.g0.r.c1 = 99; run(st3, 54, 60, { moved: { kid0: 1 } }); assert.strictEqual(st3.k.g0.r.c1, 100);
});
ok('best: ties follow each grandchild\'s order; a classmate married to one is nobody else\'s', () => {
  const st = G3.empty(); st.k.g0 = { b: 1 }; st.k.g1 = { b: 1, r: { c0: 90, c1: 85 } };
  assert.strictEqual(G3.best(st, 'g0').id, 'c0'); assert.strictEqual(G3.best(st, 'g1').id, 'c0');
  st.k.g0.w = 'c0'; st.k.g0.wd = 5; st.k.g0.mv = 3; st.k.g0.h = 2; assert.strictEqual(G3.best(st, 'g1').id, 'c1');
});
ok('moving out: ten days into 少年 (age 53); a wedding needs their own house, closeness 80, a fine day, 3 days after the last', () => {
  const g = { b: 100 }; assert(!G3.wantsHouse(g, 152)); assert(G3.wantsHouse(g, 153)); assert(!G3.wantsHouse(Object.assign({ mv: 150 }, g), 160));
  const st = G3.empty(); st.k.g0 = { b: 100, r: { c0: 80 } };
  assert.strictEqual(G3.wedReady(st, 'g0', 160, {}), null, 'no house yet');
  st.k.g0.mv = 155; st.k.g0.h = 2; assert.strictEqual(G3.wedReady(st, 'g0', 160, {}), 'c0');
  assert.strictEqual(G3.wedReady(st, 'g0', 160, { rain: true }), null); assert.strictEqual(G3.wedReady(st, 'g0', 160, { busy: true }), null);
  assert.strictEqual(G3.wedReady(st, 'g0', 160, { lastWed: 158 }), null); st.k.g0.r.c0 = 79; assert.strictEqual(G3.wedReady(st, 'g0', 160, {}), null);
  st.k.g0.w = 'c0'; st.k.g0.wd = 160; assert(!G3.married(st.k.g0, 160, 18 * 60)); assert(G3.married(st.k.g0, 160, 20 * 60 + 30)); assert(G3.married(st.k.g0, 161, 0));
  assert.strictEqual(G3.wedTonight(st, 160), 'g0'); assert.strictEqual(G3.wedTonight(st, 161), null);
});
ok('the day: a baby by the door, play in the yard, school 8-14, the park after school on a park day, a teen on the parents\' tiles, a couple on their own', () => {
  const door = { x: 100, y: 100 }, H = { door, bench: { x: 109, y: 104 }, coop: { x: 83, y: 99 }, tiles: [{ x: 117, y: 96 }, { x: 125, y: 96 }] };
  const sch = [door, { x: 150, y: 66 }, { x: 640, y: 66 }, { x: 642, y: 46 }], park = [{ x: 642, y: 46 }, { x: 838, y: -14 }, { x: 781, y: -36 }];
  const c = (g, day, T, o) => G3.placeOf(Object.assign({ id: 'g0' }, g), Object.assign({ day, T, parent: H, toSchool: sch, toPark: park, parkSpots: [{ x: 760, y: -50 }, { x: 790, y: -60 }] }, o));
  assert(c({ b: 100 }, 101, 10 * 60).cradle); assert.strictEqual(c({ b: 100 }, 101, 22 * 60), null); assert.strictEqual(c({ b: 100 }, 101, 10 * 60, { rain: true }), null);
  assert.strictEqual(c({ b: 100 }, 108, 10 * 60).where, 'yard');
  const s = { b: 100 }, d = 120; assert.strictEqual(c(s, d, 10 * 60), null, 'in class'); assert.strictEqual(c(s, d, 7 * 60 + 50).where, 'school-go');
  assert.strictEqual(c(s, d, 14 * 60 + 5).where, 'home-walk');
  const pk = c(s, d, 16 * 60 + 30, { park: true, parkIn: true }); assert.strictEqual(pk.where, 'park'); assert(pk.x > 700 && pk.y < 0);
  const tn = c({ b: 100 }, 150, 11 * 60); assert.strictEqual(tn.where, 'tiles'); assert.strictEqual(tn.cut, 3);
  const own = { door: { x: 300, y: 160 }, bench: { x: 309, y: 164 }, coop: { x: 283, y: 159 }, tiles: [{ x: 317, y: 156 }] };
  const m = c({ b: 100, mv: 153, h: 2, w: 'c0', wd: 160 }, 170, 10 * 60, { own }); assert.strictEqual(m.where, 'tiles'); assert(Math.abs(m.x - 317) < 9);
  const wed = c({ b: 100, mv: 153, h: 2, w: 'c0', wd: 160 }, 160, 18 * 60, { own }); assert(wed.wed); assert.strictEqual(c({ b: 100, mv: 153, h: 2 }, 170, 23 * 60, { own }), null);
});
ok('park slots: at most the given number, school-age only, none in the rain', () => {
  const st = G3.empty(); st.k = { g0: { b: 100 }, g1: { b: 100 }, g2: { b: 100 }, g3: { b: 140 } };
  for (let d = 118; d < 140; d++) { const p = G3.parkKids(st, d, 2, false); assert(p.length <= 2); }
  assert.deepStrictEqual(G3.parkKids(st, 120, 2, true), []); assert.deepStrictEqual(G3.parkKids(st, 150, 2, false), [], 'teens do not take slots');
});
ok('save: home.g3 and a house\'s g round-trip (v15); bad data is dropped; old saves gain nothing', () => {
  const old = HM.valid({ houses: [{ site: 'nhome0', x: 250, y: 140, built: 3, kid: 'kid0', tiles: [] }], wed: { kid0: { mate: 'm1', day: 3, moved: 3, house: 0 } } });
  assert(!('g3' in old)); assert(!old.houses.some(h => 'g' in h));
  const raw = { houses: [{ site: 'nhome0', x: 250, y: 140, built: 3, kid: 'kid0', tiles: [] }, { site: 'nhome1', x: 300, y: 140, built: 9, g: 'g0', tiles: [] }, { site: 'nhome2', x: 250, y: 180, built: 9, g: 'g1', tiles: [] }],
    wed: { kid0: { mate: 'm1', day: 3, moved: 3, house: 0 } },
    g3: { s: 4, d: 90, k: { g0: { b: 11, r: { c0: 85, zz: 4 }, h: 1, mv: 70, w: 'c0', wd: 80 }, g1: { b: 0 }, g2: { b: 32, w: 'c0', wd: 50 }, bad: { b: 3 } } } };
  const v = HM.valid(raw);
  assert.deepStrictEqual(v.g3, { s: 4, d: 90, k: { g0: { b: 11, r: { c0: 85 }, h: 1, mv: 70, w: 'c0', wd: 80 }, g2: { b: 32 } } });
  assert.strictEqual(v.houses[1].g, 'g0'); assert(!('g' in v.houses[2]), 'a house whose grandchild is not living there is free again');
  assert.deepStrictEqual(HM.valid(JSON.parse(JSON.stringify(v))), v, 'idempotent');
  const fs = require('fs'), path = require('path'), fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'), 'utf8'));
  const base = SV.validate(SV.migrate(fx.save || fx)); assert.strictEqual(base.saveVersion, 15); assert(!('g3' in base.home), 'an old save gains no g3 on load');
  assert.deepStrictEqual(SV.validate(JSON.parse(JSON.stringify(base))).home, base.home, 'old home unchanged');
  const withG = JSON.parse(JSON.stringify(base)); withG.home = raw; const s2 = SV.validate(withG); assert.strictEqual(s2.saveVersion, 15); assert.deepStrictEqual(s2.home.g3, v.g3);
  assert(JSON.stringify(SV.compact(s2)).length < 64 * 1024);
  // a house kept by a child of the 2nd generation is never handed to a grandchild
  const clash = HM.valid({ houses: [{ site: 'nhome0', x: 250, y: 140, built: 3, kid: 'kid0', g: 'g0', tiles: [] }], wed: { kid0: { mate: 'm1', day: 3, moved: 3, house: 0 } }, g3: { s: 1, d: 1, k: { g0: { b: 5, h: 0, mv: 60 } } } });
  assert.strictEqual(clash.houses[0].kid, 'kid0'); assert(!clash.houses[0].g); assert(!clash.g3.k.g0.mv);
});
ok('size: a full late-game family (6 houses, 4 grandchildren married, every closeness set) adds well under 1 KB', () => {
  const k = {}; for (const id of G3.IDS) k[id] = { b: 99999, r: { c0: 100, c1: 100, c2: 100, c3: 100 }, h: 2 + G3.IDS.indexOf(id), mv: 99999, w: G3.MATE_IDS[G3.IDS.indexOf(id)], wd: 99999 };
  const g3 = { s: 99999, d: 99999, k }; const b = JSON.stringify({ g3 }).length + 6 * ',"g":"g0"'.length; console.log('     g3 worst case', b, 'bytes'); assert(b < 1000, b);
});
ok('shop: 新房子 levels 3–6 say they are for the grandchildren and are never auto-bought', () => {
  const it = SIM.shopItem('cottage'); assert.strictEqual(it.levels.length, 6); assert(it.levels.slice(2).every(l => /孙辈/.test(l.desc)));
  assert.deepStrictEqual(it.levels.slice(2).map(l => l.label), ['第三座新房子', '第四座新房子', '第五座新房子', '第六座新房子']);
  assert(!SIM.AUTO_BUY.includes('cottage'));
});
ok('宅园: all four pads take a house with the other three standing (their yards touch edge to edge)', () => {
  const PL = require('../plots.js'), feet = PL.HOME_PADS.map(p => HM.layout(p).foot);
  for (const p of PL.HOME_PADS) assert.strictEqual(HM.spotsIn(p.id, 'homestead', feet.filter((f, k) => PL.HOME_PADS[k] !== p)).length, 1, p.id);
});
console.log('gen3-test:', n, 'ok');
