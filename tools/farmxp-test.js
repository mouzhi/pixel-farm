// v5.12.4 农场体验: node tools/farmxp-test.js
'use strict';
const assert = require('assert');
const FX = require('../farmxp.js'), IN = require('../inn.js'), EA = require('../east.js'), SIM = require('../sim.js'), SV = require('../save.js'), WA = require('../wood.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const inR = (x, y, r, p = 0) => x >= r[0] - p && x <= r[2] + p && y >= r[1] - p && y <= r[3] + p;
const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const ALL = Object.fromEntries(FX.IDS.map(k => [k, 1]));

ok('five items with the plan\'s prices; a full day tops out inside 500–2,000 gold', () => {
  assert.deepStrictEqual(FX.IDS, ['xppick', 'xppet', 'xptour', 'xpcraft', 'xpphoto']);
  assert.deepStrictEqual(FX.ITEMS.map(i => i.cost + '+' + i.wood), ['8000+40', '10000+60', '15000+120', '12000+80', '6000+30']);
  assert(FX.MAX_DAY >= 500 && FX.MAX_DAY <= 2000, 'max ' + FX.MAX_DAY);
});
ok('gates: an inn first, then each item\'s own condition; the 留影角 needs another item', () => {
  for (const id of FX.IDS) assert(/民宿/.test(FX.gate(id, {})), id);
  const base = { inn: true };
  assert(/果园坡/.test(FX.gate('xppick', base))); assert.strictEqual(FX.gate('xppick', { inn: true, orchard: true }), null);
  assert(/鸡舍或羊圈/.test(FX.gate('xppet', base))); assert.strictEqual(FX.gate('xppet', { inn: true, fold: true }), null); assert.strictEqual(FX.gate('xppet', { inn: true, coop: true }), null);
  assert(/东门大道/.test(FX.gate('xptour', base))); assert.strictEqual(FX.gate('xptour', { inn: true, avenue: true }), null);
  assert(/菜馆/.test(FX.gate('xpcraft', base))); assert.strictEqual(FX.gate('xpcraft', { inn: true, diner: true }), null);
  assert(/别的/.test(FX.gate('xpphoto', base))); assert.strictEqual(FX.gate('xpphoto', { inn: true, any: true }), null);
});
ok('shop + save: appended to UPGRADE_IDS, a 体验 tab, never bought by the family, no wood steering', () => {
  assert.deepStrictEqual(SV.UPGRADE_IDS.slice(-5), FX.IDS);
  const tab = SIM.SHOP_TABS.find(t => t.id === 'farmxp'); assert(tab && tab.ids.join() === FX.IDS.join());
  for (const id of FX.IDS) { assert(SIM.shopItem(id), id); assert(!SIM.AUTO_BUY.includes(id), id + ' in AUTO_BUY'); }
  const e = SIM.effects({ xppet: 1 }); assert.strictEqual(e.xppet, true); assert.strictEqual(e.xppick, false);
  const t0 = WA.target(SIM.SHOP, {}, 9999), t1 = WA.target(SIM.SHOP.filter(s => !/^xp/.test(s.id)), {}, 9999); assert.deepStrictEqual(t0, t1, 'xp items do not steer the wood target');
});
ok('tourists: a stable pool; counts capped per item, none without tourists, the same every call', () => {
  assert.strictEqual(FX.pool({}), 0); assert.deepStrictEqual(FX.counts(9, {}, ALL), { xppick: 0, xppet: 0, xptour: 0, xpcraft: 0, xpphoto: 0 });
  assert.strictEqual(FX.pool({ stay: 6, parkAgri: 3, parkOther: 5 }), 11);
  for (let d = 1; d < 200; d++) { const c = FX.counts(d, { stay: 40, parkAgri: 10 }, ALL);
    for (const it of FX.ITEMS) assert(c[it.id] <= it.cap && c[it.id] >= 0, it.id + ' ' + c[it.id]);
    assert(FX.earnOf(c) <= FX.MAX_DAY); assert.deepStrictEqual(c, FX.counts(d, { stay: 40, parkAgri: 10 }, ALL)); }
  const some = FX.counts(5, { stay: 12 }, { xppet: 1 }); assert.deepStrictEqual(Object.keys(some), ['xppet']);
  const mid = FX.counts(7, { stay: 10, parkAgri: 4 }, ALL); const e = FX.earnOf(mid); assert(e >= 500 && e <= 2000, 'a busy day ' + e);
});
ok('visits: inside the opening hours, one person per spot at a time, spots are the fixed slots', () => {
  for (let d = 1; d < 120; d++) {
    const v = FX.visits(d, FX.counts(d, { stay: 30 }, ALL), { trees: [] });
    for (const q of v) { const it = FX.BY[q.k]; assert(q.at >= it.win[0] - 20 && q.end <= it.win[1] + it.stay + 20, q.id + ' ' + q.at); assert(q.end <= 17 * 60 + 30, 'home before dusk ' + q.id); }
    const by = {}; for (const q of v) (by[q.k + ':' + q.slot] = by[q.k + ':' + q.slot] || []).push(q);
    for (const k in by) { const a = by[k].sort((x, y) => x.at - y.at); for (let i = 1; i < a.length; i++) assert(a[i].at >= a[i - 1].end, 'overlap ' + k + ' day ' + d); }
  }
  assert.strictEqual(FX.visits(3, FX.counts(3, { stay: 30 }, ALL)).filter(q => q.k === 'xptour').length, 0, 'the tour is not a spot visit');
});
ok('tour: at most 4 riders a run, two runs, the truck loop returns to its stand', () => {
  for (let r = 0; r <= 8; r++) { const t = FX.tours(1, r, 50); assert(t.every(x => x.riders >= 1 && x.riders <= 4)); assert.strictEqual(t.reduce((a, x) => a + x.riders, 0), Math.min(8, r)); }
  const S = FX.TOUR.stand, legs = [[S, { x: 300, y: 84 }, FX.TOUR.stops[0]], [FX.TOUR.stops[0], FX.TOUR.stops[1]], [FX.TOUR.stops[1], { x: 300, y: 70 }, S]];
  const dur = FX.truckDur(legs); assert(dur > 40 && dur < 120, 'dur ' + dur);
  assert.strictEqual(FX.truckAt(legs, 630, 629), null); assert.strictEqual(FX.truckAt(legs, 630, 630 + dur + 1), null);
  const a = FX.truckAt(legs, 630, 630.01); assert(Math.hypot(a.x - S.x, a.y - S.y) < 1);
  const w = FX.truckAt(legs, 630, 630 + FX.lenOf(legs[0]) / FX.TOUR.speed + 1); assert(!w.moving && Math.hypot(w.x - FX.TOUR.stops[0].x, w.y - FX.TOUR.stops[0].y) < 1, 'waits at the house');
});
ok('stroll: walks in, stays, walks back; nothing outside the visit', () => {
  const r = [{ x: 0, y: 0 }, { x: 70, y: 0 }]; // 10 minutes at 7 units a minute
  assert.strictEqual(FX.stroll(r, 600, 30, 589), null); assert.strictEqual(FX.stroll(r, 600, 30, 641), null);
  const g = FX.stroll(r, 600, 30, 595); assert.strictEqual(g.state, 'go'); assert(Math.abs(g.x - 35) < 0.01);
  assert.strictEqual(FX.stroll(r, 600, 30, 610).state, 'at'); const b = FX.stroll(r, 600, 30, 635); assert.strictEqual(b.state, 'back'); assert(Math.abs(b.x - 35) < 0.01 && b.fx < 0);
});
ok('layout: everything in the 农家乐区\'s empty corners, clear of its buildings, lanes, garden and square; nothing on the beach', () => {
  const L = IN.agriLayout(), A = L.rect, box = o => [o.x - o.hw, o.y - o.hd, o.x + o.hw, o.y + o.hd];
  const solid = [box(L.diner), ...L.cabins.map(box), L.garden, L.square, [L.diner.x - 16, L.diner.y + 8, L.diner.x + 16, L.diner.y + 36]];
  const mine = { pen: FX.PEN.rect, photo: FX.PHOTO.rect, stand: FX.STAND_RECT, craft: FX.RECTS.xpcraft, booth: [FX.TOUR.booth.x - 5, FX.TOUR.booth.y - 4, FX.TOUR.booth.x + 5, FX.TOUR.booth.y + 4] };
  for (const k in mine) { const r = mine[k]; assert(r[0] >= A[0] && r[2] <= A[2] + 4 && r[1] >= A[1] && r[3] <= A[3], k + ' inside 农家乐区');
    assert(r[1] > 66 + 7, k + ' south of the road'); for (const s of solid) assert(!hit(r, s), k + ' hits ' + s);
    for (const p of L.paths) for (const q of p) assert(!inR(q.x, q.y, r, -1), k + ' on a lane ' + q.x + ',' + q.y);
    for (const l of L.lamps) assert(!inR(l.x, l.y, r), k + ' on a lamp ' + l.x + ',' + l.y);
    for (const j in mine) if (j !== k && !(j === 'booth' && k === 'stand') && !(k === 'booth' && j === 'stand')) assert(!hit(r, mine[j]), k + ' / ' + j);
    assert(!hit(r, [EA.BEACH.x0, EA.BEACH.y0, EA.BEACH.x1Full, EA.BEACH.y1]), k + ' on the beach'); }
  for (const s of FX.PEN.spots) assert(inR(s.x, s.y, FX.PEN.rect, -2)); for (const s of FX.CRAFT.seats) assert(inR(s.x, s.y, FX.RECTS.xpcraft));
  assert(inR(FX.PICK.stand.x, FX.PICK.stand.y, FX.PICK.rect), 'pick stand inside 果园坡'); for (const s of FX.PICK.spots) assert(inR(s.x, s.y, FX.PICK.rect));
});
ok('pick spots use the 果园坡\'s fruit trees first (beside them, never on them), fall back to fixed spots', () => {
  const t = [{ x: -70, y: -20 }, { x: -120, y: -70 }, { x: 40, y: 40 }];
  const s = FX.pickSpots(t); assert.strictEqual(s.length, 4); assert(s[0].tree && s[1].tree && !s[2].tree); assert(s.every(p => !t.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 5)));
  assert.strictEqual(FX.pickSpots([]).length, 4);
});
ok('pen animals stay inside the pen, asleep in a corner at night', () => {
  for (let T = 0; T < 1440; T += 7) for (const a of FX.penAnimals(4, T, ['chicken', 'sheep'])) assert(inR(a.x, a.y, FX.PEN.rect, -1), T + ' ' + a.x + ',' + a.y);
  assert.deepStrictEqual(FX.penAnimals(4, 600, ['chicken', 'sheep']).map(a => a.kind), ['chicken', 'chicken', 'sheep']);
  assert(FX.penAnimals(4, 22 * 60, ['sheep']).every(a => !a.moving));
});
ok('ground only where bought', () => {
  assert.strictEqual(FX.ground(570, 115, {}), null); assert.strictEqual(FX.ground(570, 115, { xppet: 1 }), 'pen');
  assert.strictEqual(FX.ground(488, 84, { xptour: 1 }), 'stand'); assert.strictEqual(FX.ground(478, 108, { xpcraft: 1 }), 'craft'); assert.strictEqual(FX.ground(568, 83, { xpphoto: 1 }), 'photo');
});
console.log('farmxp-test:', n, 'ok');
