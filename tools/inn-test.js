// v5.10.7 unit tests: guest schedule, room fees and star coefficients, menu stock (missing dishes drop off),
// star sources, old-save defaults, the 民宿院 layout, v5.11.0.12 restaurant shortfalls.  node tools/inn-test.js
const assert = require('assert');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const PL = require('../plots.js');
const IN = require('../inn.js');

let n = 0;
function ok(name, fn) { try { fn(); n++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e && e.stack || e); process.exit(1); } }

ok('valid() fills missing fields as nothing built; save stays append-only', () => {
  assert.deepStrictEqual(IN.valid(null).cabins, 0);
  assert.deepStrictEqual(IN.valid(undefined).diner.lv, 0);
  assert.strictEqual(IN.valid({}).stars.avg, 3);
  assert.deepStrictEqual(IN.valid({ earn: { rooms: -1 } }).earn, { rooms: 0, meals: 0 });
  const I = IN.valid({ cabins: 9, inn2: true, guests: [{ id: 'g1', look: 'innA', n: 2, room: 0, from: 10, until: 12 }, { id: 'nope' }, { id: 'g2', look: 'townE', n: 8, room: 0, from: 10, until: 11 }], diner: { lv: 9, menu: ['nope', 'grill_fish'], served: -3 }, stars: { last: [{ day: 4, s: 9, note: 'x'.repeat(40) }] }, resort: { huts: 99 }, job: { id: 'rocket', day: 1 } });
  assert.strictEqual(I.cabins, 4);
  assert.strictEqual(I.inn2, 1);
  assert.strictEqual(I.guests.length, 1, 'two groups cannot share a room; invalid rows drop');
  assert.strictEqual(I.guests[0].look, 'innA');
  assert.strictEqual(I.guests[0].n, 2);
  assert.strictEqual(IN.valid({ cabins: 1, guests: [{ id: 'g9', look: 'innA', n: 8, room: 0, from: 1, until: 2 }] }).guests[0].n, 3, 'group size clamps to 1–3');
  assert.strictEqual(I.diner.lv, 3);
  assert.deepStrictEqual(I.diner.menu, ['grill_fish']);
  assert.strictEqual(I.stars.last[0].s, 5);
  assert.ok(I.stars.last[0].note.length <= IN.NOTE_MAX);
  assert.strictEqual(I.resort.huts, 4);
  assert.strictEqual(I.job, null);
  assert.strictEqual(I.stars.avg, 5);
});

ok('star coefficient is 0.8 at 1 star and 1.3 at 5; room fee is 300 × nights × coefficient', () => {
  assert.strictEqual(IN.starCoef(1), 0.8);
  assert.strictEqual(IN.starCoef(5), 1.3);
  assert.strictEqual(IN.starCoef(3), 1.05);
  assert.strictEqual(IN.roomFee(1, 3), Math.round(300 * 1.05));
  assert.strictEqual(IN.roomFee(2, 5), Math.round(300 * 2 * 1.3));
  assert.strictEqual(IN.roomFee(1, 1), 240);
});

ok('3 stars bring 1 group a day, 5 stars at most 3; festive days double; below 3 some days are skipped', () => {
  assert.strictEqual(IN.groupsWanted(3, 80, false), 1);
  assert.strictEqual(IN.groupsWanted(4, 80, false), 2);
  assert.strictEqual(IN.groupsWanted(5, 80, false), 3);
  assert.strictEqual(IN.groupsWanted(5, 80, true), 6);
  const lows = Array.from({ length: 40 }, (_, i) => IN.groupsWanted(1.5, 20 + i, false));
  assert.ok(lows.some(v => v === 0) && lows.some(v => v === 1), '1–2 stars skip some days');
  assert.ok(lows.every(v => v === 0 || v === 1));
});

ok('cabin / restaurant / kitchen prices and the one-day build; prosperity 3 and the 农家乐区 are required', () => {
  const I = IN.empty();
  assert.deepStrictEqual(IN.cabinCost(0), { cost: 20000, wood: 300 });
  assert.deepStrictEqual(IN.cabinCost(1), { cost: 25000, wood: 250 });
  assert.strictEqual(IN.offer(I, 'cabin').cost, 20000);
  assert.strictEqual(IN.offer(I, 'diner').cost, 35000);
  assert.strictEqual(IN.offer(I, 'diner').wood, 400);
  assert.ok(/先盖农家菜馆/.test(IN.offer(I, 'kitchen').why));
  const poor = { plot: 'glade', lv: 3, coins: 100, wood: 10 };
  assert.strictEqual(IN.canStart(I, 'cabin', { plot: null, lv: 3, coins: 1e6, wood: 999 }), '先开镇门：农家乐区就在镇门口东大道两边，不用改建地块');
  assert.strictEqual(IN.canStart(I, 'cabin', { site: 'agri', lv: 3, coins: 1e6, wood: 999 }), null, 'v5.11.0.5: the 农家乐区 is the site');
  assert.ok(/繁荣度到 3/.test(IN.canStart(I, 'cabin', { plot: 'glade', lv: 2, coins: 1e6, wood: 999 })));
  assert.strictEqual(IN.canStart(I, 'cabin', poor), '金币不够');
  const rich = { plot: 'glade', lv: 3, coins: 1e6, wood: 999 };
  assert.strictEqual(IN.canStart(I, 'cabin', rich), null);
  IN.start(I, 'cabin', 80); assert.ok(/正在盖|一次只盖/.test(IN.canStart(I, 'diner', rich)));
  assert.strictEqual(IN.finish(I, 80), null, 'same day is still scaffolding');
  assert.strictEqual(IN.finish(I, 81), 'cabin'); assert.strictEqual(I.cabins, 1);
  IN.start(I, 'cabin', 81); IN.finish(I, 82);
  IN.start(I, 'cabin', 82); IN.finish(I, 83);
  IN.start(I, 'cabin', 83); IN.finish(I, 84);
  assert.strictEqual(I.cabins, 4);
  assert.ok(/最多 4/.test(IN.offer(I, 'cabin').why));
  IN.start(I, 'diner', 84); IN.finish(I, 85); assert.strictEqual(I.diner.lv, 1);
  assert.strictEqual(IN.seatsOf(I), 4); assert.strictEqual(IN.dishSlots(I, false), 2);
  IN.start(I, 'kitchen', 85); IN.finish(I, 86); assert.strictEqual(I.diner.lv, 2);
  assert.strictEqual(IN.seatsOf(I), 8); assert.strictEqual(IN.dishSlots(I, false), 4);
  IN.start(I, 'kitchen', 86); IN.finish(I, 87);
  assert.strictEqual(IN.seatsOf(I), 12); assert.strictEqual(IN.dishSlots(I, false), 6);
  assert.strictEqual(IN.dishSlots(I, true), 7);
  assert.ok(/已经升到/.test(IN.offer(I, 'kitchen').why));
  const totalGold = 20000 + 3 * 25000 + 35000 + 2 * 20000;
  const totalWood = 300 + 3 * 250 + 400 + 2 * 200;
  assert.strictEqual(totalGold, 95000 + 75000 - 0, '4 cabins 95,000 + diner with two kitchen levels 75,000');
  assert.strictEqual(totalWood, 1050 + 800);
});

ok('guests: groups of 1–3 stay 1–2 nights, one cabin each, arrivals 10:00–16:00, the same day is stable after a reload', () => {
  const I = IN.empty(); I.cabins = 4;
  const a = IN.planArrivals(I, 90, 5, false);
  const b = IN.planArrivals(I, 90, 5, false);
  assert.deepStrictEqual(a, b);
  assert.ok(a.length >= 1 && a.length <= 3);
  const rooms = new Set();
  for (const g of a) {
    assert.ok(g.n >= 1 && g.n <= 3);
    assert.ok(g.until === g.from + 1 || g.until === g.from + 2);
    assert.ok(g.at >= 10 * 60 && g.at < 16 * 60);
    assert.ok(IN.LOOKS.includes(g.look));
    assert.ok(!rooms.has(g.room)); rooms.add(g.room);
  }
  IN.checkIn(I, 90, 5, false);
  assert.strictEqual(I.guests.length, a.length);
  const again = IN.planArrivals(I, 90, 5, false);
  const taken = new Set(I.guests.map(g => g.room));
  assert.ok(again.every(g => !taken.has(g.room)), 'later arrivals only take free cabins');
  assert.ok(I.guests.length + again.length <= 4);
});

ok('checkout pays the room fee, writes a guestbook star, and frees the cabin the next or third morning', () => {
  const I = IN.empty(); I.cabins = 1;
  I.guests.push({ id: 'g90', look: 'innA', n: 2, room: 0, from: 90, until: 92, at: 12 * 60 });
  const morning = IN.checkOut(I, 91, () => ({ s: 4, note: '羊好软' }));
  assert.strictEqual(morning.groups.length, 0, 'they stay the second night');
  assert.strictEqual(I.guests.length, 1);
  const out = IN.checkOut(I, 92, () => ({ s: 4, note: '羊好软' }));
  assert.strictEqual(out.groups.length, 1);
  assert.strictEqual(out.gold, IN.roomFee(2, 3), 'fee uses the average from before this review');
  assert.strictEqual(I.earn.rooms, out.gold);
  assert.strictEqual(I.guests.length, 0);
  assert.strictEqual(I.stars.last.length, 1);
  assert.strictEqual(I.stars.last[0].s, 4);
  assert.strictEqual(I.stars.last[0].note, '羊好软');
  assert.strictEqual(I.stars.avg, 4);
});

ok('menu: 1.6× stall; auto picks the most abundant stock; missing dishes drop off and never stall', () => {
  assert.strictEqual(IN.dishPay(IN.DISH.cabbage_egg), Math.round((10 + 30) * 1.6));
  assert.strictEqual(IN.dishPay(IN.DISH.pumpkin_pie), Math.round((85 + 60) * 1.6));
  assert.strictEqual(IN.dishPay(IN.DISH.jam_muffin), Math.round((60 + 80 + 35) * 1.6));
  assert.strictEqual(IN.dishPay(IN.DISH.grill_fish), Math.round(20 * 1.6));
  const I = IN.empty(); I.diner.lv = 3;
  const stock = { egg: 8, cabbage: 8, pumpkin: 1, flour: 1, jam: 0, milk: 0, fish: 0, cheese: 0, honey: 0, carrot: 0, apple: 0 };
  const auto = IN.autoMenu(I, stock, false).map(d => d.id);
  assert.ok(auto[0] === 'cabbage_egg', 'most stocked dish first: ' + auto);
  assert.ok(!auto.includes('jam_muffin') && !auto.includes('grill_fish'), 'missing stock is not listed');
  // a maxed kitchen's garden (24 时蔬 + cabbages) covers the rest of a 20-portion sitting
  const r = IN.serve(I, 20, stock, false);
  assert.strictEqual(r.n, 20, 'garden 时蔬 fills the sitting once farm dishes run low: ' + r.n);
  assert.strictEqual(r.missed, 0);
  assert.ok(r.used.includes('cabbage_egg') && r.used.includes('garden_veg'), r.used.join(','));
  assert.ok((stock.egg | 0) < 8, 'farm eggs were used');
  assert.strictEqual(I.earn.meals, r.gold);
  assert.strictEqual(I.diner.servedLast, 20);
  assert.strictEqual(I.diner.missedLast, 0);
  const I2 = IN.empty(); I2.diner.lv = 3; IN.setMenu(I2, ['grill_fish', 'jam_muffin'], false);
  const r2 = IN.serve(I2, 4, { fish: 1 }, false);
  assert.ok(r2.used.includes('grill_fish'));
  assert.ok(r2.n >= 1, 'fish first, then garden 时蔬 covers the rest at a maxed kitchen');
  assert.strictEqual(r2.n + r2.missed, 4);
});

ok('meals: two a day per staying guest, plus walk-ins on a festive / market day', () => {
  const I = IN.empty(); I.cabins = 4;
  I.guests = [
    { id: 'a', look: 'innA', n: 2, room: 0, from: 90, until: 92, at: 600 },
    { id: 'b', look: 'innB', n: 3, room: 1, from: 90, until: 91, at: 700 },
    { id: 'c', look: 'innC', n: 1, room: 2, from: 89, until: 91, at: 700 },
  ];
  assert.strictEqual(IN.peopleOf(I, 90), 6);
  assert.strictEqual(IN.mealsWanted(I, 90, false, 0), 12);
  assert.ok(IN.mealsWanted(I, 90, true, 0) >= 12 + 6);
  assert.ok(IN.walkinsOf(true, 0, 90) >= 4 && IN.walkinsOf(true, 0, 90) <= 8);
  assert.strictEqual(IN.walkinsOf(false, 0, 90), 0);
});

ok('star sources: happy animals, a tidy yard, flowers, a full menu, fireflies; a short note is written', () => {
  const good = IN.rateStay({ animals: [{ h: 90 }, { h: 88 }], yard: 0, yardCap: 18, decor: 8, flowers: 10, missed: 0, diner: 1, fireflies: 1, servedDish: 'pumpkin_pie' });
  assert.ok(good.s >= 4, 'a well-kept farm rates high: ' + good.s);
  assert.ok(/南瓜饼|萤火虫/.test(good.note), good.note);
  const poor = IN.rateStay({ animals: [{ h: 20 }], yard: 18, yardCap: 18, decor: 0, flowers: 0, missed: 6, diner: 1 });
  assert.ok(poor.s <= 3, 'a messy, hungry stay rates low: ' + poor.s);
  assert.ok(/菜不够|乱/.test(poor.note), poor.note);
  const mid = IN.rateStay({});
  assert.ok(mid.s >= 1 && mid.s <= 5);
});

ok('staffed path adds 0.3 stars and a signature dish; furniture from the woodshop is a small comfort bonus', () => {
  const I = IN.empty(); I.diner.lv = 1; I.stars.avg = 3;
  assert.strictEqual(IN.effectiveStars(I, false, false), 3);
  assert.strictEqual(IN.effectiveStars(I, true, false), 3.3);
  assert.ok(IN.unlocked(I, true).some(d => d.special));
  assert.ok(!IN.unlocked(I, false).some(d => d.special));
  assert.ok(IN.effectiveStars(I, true, true) > IN.effectiveStars(I, true, false));
});

ok('v5.11.0.5: no plot offers 民宿院; the 农家乐区 layout stays inside the district, off the road, and does not overlap', () => {
  const TN = require('../town.js');
  assert.deepStrictEqual(IN.AGRI, TN.AGRI, 'inn.js and town.js agree on the district');
  for (const p of PL.PLOTS) assert.ok(!p.mods.includes('inn'), p.id + ' no longer zones 民宿院');
  const L = IN.layout('agri'); assert.ok(L && L.site === 'agri' && L.name === '农家乐区');
  const [x0, y0, x1, y1] = IN.AGRI;
  const boxes = L.cabins.map(c => ({ id: 'c' + c.i, a: [c.x - c.hw, c.y - c.hd, c.x + c.hw, c.y + c.hd] }))
    .concat([{ id: 'diner', a: [L.diner.x - L.diner.hw, L.diner.y - L.diner.hd, L.diner.x + L.diner.hw, L.diner.y + L.diner.hd] }]);
  for (const b of boxes) {
    assert.ok(b.a[0] >= x0 + 2 && b.a[2] <= x1 - 2 && b.a[1] >= y0 + 2 && b.a[3] <= y1 - 2, b.id + ' inside ' + b.a);
    assert.ok(b.a[3] < TN.AVENUE.y - TN.AVENUE.hw - 2 || b.a[1] > TN.AVENUE.y + TN.AVENUE.hw + 2, b.id + ' off the east road');
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i].a, B = boxes[j].a;
    assert.ok(!(A[0] < B[2] + 2 && B[0] < A[2] + 2 && A[1] < B[3] + 2 && B[1] < A[3] + 2), 'overlap ' + boxes[i].id + ' / ' + boxes[j].id);
  }
  for (const c of L.cabins) assert.ok(c.y < TN.AVENUE.y, 'cabins on the north half');
  assert.ok(L.diner.y > TN.AVENUE.y, 'the restaurant on the south half');
  for (const t of L.tables) assert.ok(t.y > L.diner.door.y && t.x > x0 && t.x < x1, 'tables south of the door');
  assert.strictEqual(L.cabins.length, 4); assert.strictEqual(L.tables.length, 6);
  assert.ok(L.lamps.length >= 4 && L.pots.length >= 4 && L.board && L.diner.stand && L.garden && L.square);
  for (const c of L.cabins) assert.ok(c.door.y >= c.y, 'cabin door on the south side');
  // the old per-plot layout still works (unused, kept for code that asks by plot id)
  assert.ok(IN.layout('glade'));
});

ok('v5.11.0.5: siteOf — the district opens with the town gate; a save with buildings keeps it', () => {
  assert.strictEqual(IN.siteOf(false, IN.empty()), null);
  assert.strictEqual(IN.siteOf(true, IN.empty()), 'agri');
  const I = IN.empty(); I.cabins = 1; assert.strictEqual(IN.siteOf(false, I), 'agri');
  const J = IN.empty(); J.job = { id: 'cabin', day: 3 }; assert.strictEqual(IN.siteOf(false, J), 'agri');
});

ok('v5.11.0.5: migrate — an old 民宿院 plot keeps every building, frees the plot once, idempotent', () => {
  const plots = { glade: { mod: 'inn', day: 70 }, sbank: { mod: 'field', day: 40 } };
  const I = IN.valid({ cabins: 3, inn2: 1, diner: { lv: 2, served: 12 }, guests: [{ id: 'g71', look: 'innB', n: 2, room: 4, from: 80, until: 82, at: 700 }],
    stars: { last: [{ day: 79, s: 5, note: '羊好软' }] }, earn: { rooms: 4000, meals: 2500 }, job: { id: 'cabin', day: 80 } });
  const before = JSON.stringify({ c: I.cabins, i: I.inn2, d: I.diner, g: I.guests, s: I.stars, e: I.earn, j: I.job });
  const r = IN.migrate(I, plots, 81);
  assert.deepStrictEqual(r, { plots: ['glade'], notice: true });
  assert.strictEqual(plots.glade.free, 1); assert.strictEqual(plots.glade.mod, 'inn'); assert.ok(!plots.sbank.free);
  assert.strictEqual(I.where, 'agri'); assert.strictEqual(I.moved, 81);
  assert.strictEqual(JSON.stringify({ c: I.cabins, i: I.inn2, d: I.diner, g: I.guests, s: I.stars, e: I.earn, j: I.job }), before, 'nothing lost');
  // round trip through the save: where / moved survive, plots keep the legacy mod and the free flag
  const I2 = IN.valid(JSON.parse(JSON.stringify(I))); assert.strictEqual(I2.where, 'agri'); assert.strictEqual(I2.moved, 81);
  const P2 = PL.validPlots(JSON.parse(JSON.stringify(plots))); assert.deepStrictEqual(P2.glade, { mod: 'inn', day: 70, free: 1 });
  assert.deepStrictEqual(IN.migrate(I2, P2, 90), { plots: [], notice: false }, 'a second load does nothing');
  // the free rezone: costs nothing, then the plot is ordinary again
  const o = PL.rezoneOffer(P2, 'glade', 'field', 0, 0); assert.ok(o.ok && o.free && o.cost === 0 && o.wood === 0, JSON.stringify(o));
  const pg = PL.rezoneOffer(P2, 'glade', 'playground', 0, 0); assert.ok(pg.ok && pg.cost === 0, 'even the playground setup is free once');
  P2.glade = { mod: 'field', day: 91 };
  const o2 = PL.rezoneOffer(P2, 'glade', 'meadow', 1e6, 999); assert.ok(!o2.free && o2.cost > 0);
  // an old plot never blocks a rezone now
  assert.strictEqual(IN.plotBusy('glade', { glade: { mod: 'inn', day: 70 } }, I), null);
  // a save without an inn plot is untouched
  const I3 = IN.empty(); assert.deepStrictEqual(IN.migrate(I3, { sbank: { mod: 'field', day: 4 } }, 50), { plots: [], notice: false }); assert.ok(!I3.moved);
});

ok('v5.11.0.5: every offer has a Chinese name (the shop cards showed "kitchen" / "inn2")', () => {
  const states = [IN.empty(), (() => { const I = IN.empty(); I.cabins = 4; I.inn2 = 1; I.diner.lv = 3; I.resort = { huts: 4, parasols: 8, stall: 1, pier: 1, deck: 1 }; return I; })(),
    (() => { const I = IN.empty(); I.cabins = 1; I.diner.lv = 1; return I; })()];
  for (const I of states) for (const id of ['cabin', 'diner', 'kitchen', 'inn2', 'hut', 'parasol', 'stall', 'pier', 'deck']) {
    const o = IN.offer(I, id); assert.ok(o.name && /[\u4e00-\u9fff]/.test(o.name) && !/[a-z]{3,}/i.test(o.name), id + ' ' + JSON.stringify(o));
  }
  assert.strictEqual(IN.offer(IN.empty(), 'kitchen').name, '厨房升级');
  assert.strictEqual(IN.offer(IN.empty(), 'inn2').name, '二层客栈');
});

ok('east-avenue entry: the town gate when the town is open, otherwise the east-road mouth', () => {
  assert.deepStrictEqual(IN.entryOf({ eroad: { mod: 'road', day: 10 } }, true), { x: 596, y: 66 }); // v5.11.0: the town gate moved east
  assert.deepStrictEqual(IN.entryOf({ eroad: { mod: 'road', day: 10 } }, false), { x: 362, y: 66 });
  assert.deepStrictEqual(IN.entryOf({}, false), { x: 352, y: 66 });
});

ok('guestbook keeps the last 10 notes, stars the last 20', () => {
  const I = IN.empty();
  for (let i = 0; i < 25; i++) I.stars.last.push({ day: 10 + i, s: 3 + (i % 3 === 0 ? 1 : 0), note: 'n' + i });
  I.stars.last = I.stars.last.slice(-20);
  I.stars.avg = IN.avgOf(I.stars.last);
  assert.strictEqual(IN.book(I).length, 10);
  assert.strictEqual(IN.book(I)[0].note, 'n24', 'newest first');
  assert.strictEqual(I.stars.last.length, 20);
});

ok('v5.11.0.12: kitchen garden and cap grow with upgrades; a maxed kitchen covers a full inn', () => {
  const I = IN.empty(); I.diner.lv = 1;
  assert.strictEqual(IN.seatsOf(I), 4);
  assert.strictEqual(IN.kitchenCap(I), 12);
  assert.strictEqual(IN.gardenYield(I).greens, 8);
  assert.strictEqual(IN.gardenYield(I).cabbage, 2);
  I.diner.lv = 2;
  assert.strictEqual(IN.kitchenCap(I), 24);
  assert.strictEqual(IN.gardenYield(I).greens, 16);
  I.diner.lv = 3;
  assert.strictEqual(IN.kitchenCap(I), 36);
  assert.deepStrictEqual(IN.gardenYield(I), { greens: 24, cabbage: 10, carrot: 4 });
  // 4 cabins + inn2, 8 groups of 2 = 16 people, 32 raw meals; cap 36 so a maxed kitchen takes them all
  I.cabins = 4; I.inn2 = 1;
  I.guests = Array.from({ length: 8 }, (_, i) => ({ id: 'g' + i, look: 'innA', n: 2, room: i, from: 116, until: 118, at: 700 }));
  assert.strictEqual(IN.peopleStay(I, 117, 'inn'), 16);
  assert.strictEqual(IN.mealsWanted(I, 117, false, 0), 32);
  I.diner.lv = 1;
  assert.strictEqual(IN.mealsWanted(I, 117, false, 0), 12, 'a small kitchen is not asked for 32 portions');
  I.diner.lv = 3;
  const stock = { egg: 12, milk: 4, flour: 6, jam: 3, cheese: 3, honey: 3, fish: 2 }; // a reasonable late farm, no cabbage in the baskets
  const r = IN.serve(I, IN.mealsWanted(I, 117, false, 0), Object.assign({}, stock), false);
  assert.strictEqual(r.missed, 0, 'maxed kitchen + garden + a reasonable farm satisfies a full inn: served ' + r.n + ' missed ' + r.missed + ' used ' + r.used.slice(0, 8));
  assert.strictEqual(r.n, 32);
  I.diner.lv = 1;
  const r1 = IN.serve(I, 12, { egg: 12 }, false);
  assert.ok(r1.n < 32 && r1.n >= 8, 'the level-1 garden already helps, but cannot match a maxed kitchen: ' + r1.n);
});

ok('v5.11.0.12: a lifetime missed total must not poison later reviews; the note names what was short', () => {
  const I = IN.empty(); I.diner.lv = 3; I.cabins = 2;
  // an early short day (empty baskets, before the garden fallback existed in old builds)
  I.diner.served = 3; I.diner.missed = 40; I.diner.last = 100;
  I.diner.missedLast = 9; I.diner.servedLast = 3; I.diner.short = ['cabbage', 'flour'];
  const mid = IN.mealReview(I, 101);
  assert.strictEqual(mid.missed, 9, 'dawn checkout reads yesterday\'s service, not the lifetime 40');
  assert.deepStrictEqual(mid.short, ['cabbage', 'flour']);
  const note = IN.rateStay({ animals: [{ h: 90 }], yard: 0, yardCap: 18, decor: 8, flowers: 8, missed: mid.missed, short: mid.short, diner: 1 }).note;
  assert.ok(/菜不够/.test(note) && /卷心菜/.test(note), 'actionable short note: ' + note);

  // the next day the maxed kitchen cooks enough; lifetime missed stays 40
  const r = IN.serve(I, 12, { egg: 12, flour: 6, cheese: 4 }, false);
  I.diner.last = 117;
  assert.strictEqual(r.missed, 0);
  assert.strictEqual(I.diner.missed, 40, 'lifetime total is unchanged when today is fully served');
  const later = IN.mealReview(I, 118);
  assert.strictEqual(later.missed, 0);
  const good = IN.rateStay({ animals: [{ h: 90 }], yard: 0, yardCap: 18, decor: 8, flowers: 8, missed: later.missed, short: later.short, diner: 1, servedDish: later.dish || 'cabbage_egg' });
  assert.ok(!/菜不够/.test(good.note), 'a full service does not write 菜不够: ' + good.note);
  assert.ok(good.s >= 4, 'stars recover: ' + good.s);

  // a stale lifetime total alone, with no last-service shortfall, is ignored
  const stale = IN.mealReview({ diner: { lv: 3, missed: 99, last: 80, missedLast: 12 } }, 118);
  assert.strictEqual(stale.missed, 0, 'a week-old shortfall does not apply at checkout');
});

ok('v5.11.0.12: seafood-stall misses do not write diner.missedLast or a 菜不够 review', () => {
  const I = IN.empty(); I.diner.lv = 3; I.resort.stall = 1;
  I.diner.last = 117; I.diner.missedLast = 0; I.diner.servedLast = 16; I.diner.dishLast = 'cabbage_egg';
  const stall = IN.serveStall(I, 8, { sardine: 1 }, null);
  assert.ok(stall.missed > 0, 'the stall itself can still run short');
  assert.strictEqual(I.diner.missedLast, 0, 'stall shortfalls stay off the restaurant review');
  const rev = IN.mealReview(I, 118);
  assert.strictEqual(rev.missed, 0);
});

ok('v5.11.0.12: guestbook merges same-day lines (old saves had ten identical 菜不够 rows)', () => {
  const I = IN.empty(); I.cabins = 4;
  I.guests = [
    { id: 'g1', look: 'innA', n: 2, room: 0, from: 116, until: 118, at: 600 },
    { id: 'g2', look: 'innB', n: 2, room: 1, from: 116, until: 118, at: 620 },
    { id: 'g3', look: 'innC', n: 1, room: 2, from: 116, until: 118, at: 640 },
  ];
  const ctx = { animals: [{ h: 80 }], yard: 0, yardCap: 18, missed: 4, short: ['cabbage'], diner: 1 };
  const out = IN.checkOut(I, 118, () => IN.rateStay(ctx));
  assert.strictEqual(out.groups.length, 3);
  assert.strictEqual(I.stars.last.length, 1, 'one row per day, not one per group');
  assert.strictEqual(I.stars.last[0].n, 3);
  assert.ok(/卷心菜/.test(I.stars.last[0].note), I.stars.last[0].note);
  // an already-written save with ten identical lines still displays as one
  const old = IN.empty();
  for (let i = 0; i < 4; i++) old.stars.last.push({ day: 116, s: 3, note: '今天的菜不够' });
  for (let i = 0; i < 3; i++) old.stars.last.push({ day: 117, s: 3, note: '今天的菜不够' });
  for (let i = 0; i < 3; i++) old.stars.last.push({ day: 118, s: 3, note: '今天的菜不够' });
  const b = IN.book(old);
  assert.strictEqual(b.length, 3);
  assert.strictEqual(b[0].day, 118);
  assert.strictEqual(b[0].n, 3);
  assert.strictEqual(b[1].n, 3);
  assert.strictEqual(b[2].n, 4);
});

ok('v5.11.0.12: a short sitting names the missing ingredient; valid() keeps last-service fields', () => {
  const I = IN.empty(); I.diner.lv = 1;
  // no farm stock and a small garden (8 时蔬, cap 12) so 4 portions are still missed
  const r = IN.serve(I, 12, {}, false);
  assert.strictEqual(r.n, 8, 'level-1 garden serves 8 时蔬: ' + r.n);
  assert.strictEqual(r.missed, 4);
  assert.ok(r.short.includes('cabbage') || r.short.includes('egg') || r.short.includes('flour'), 'short ' + JSON.stringify(r.short));
  assert.ok(/缺/.test(IN.shortNote(r.short)), IN.shortNote(r.short));
  const v = IN.valid(I);
  assert.strictEqual(v.diner.missedLast, 4);
  assert.strictEqual(v.diner.servedLast, 8);
  assert.ok(Array.isArray(v.diner.short) && v.diner.short.length);
  const v0 = IN.valid({ diner: { lv: 3 } });
  assert.ok(!('missedLast' in v0.diner), 'missing last-service fields stay omitted (append-only)');
});

console.log('\n' + n + ' tests ok');

