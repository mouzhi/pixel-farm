// v5.10.8 unit tests: resort prices and one-day builds, two-storey inn rooms, beach guests,
// seafood stall stock (sea fish, missing dishes drop off), sunset window, tidy beach slots,
// old-save defaults (inn2 / resort already reserved empty in v5.10.7).  node tools/resort-test.js
const assert = require('assert');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const PL = require('../plots.js');
const IN = require('../inn.js');

let n = 0;
function ok(name, fn) { try { fn(); n++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e && e.stack || e); process.exit(1); } }

ok('old saves still come in as nothing built; inn2 and resort clamp to the documented caps', () => {
  const I = IN.valid(null);
  assert.strictEqual(I.inn2, 0);
  assert.deepStrictEqual(I.resort, { huts: 0, parasols: 0, stall: 0, pier: 0, deck: 0 });
  const v = IN.valid({ inn2: 2, resort: { huts: 99, parasols: -3, stall: true, pier: 'yes', deck: 0 }, guests: [{ id: 'g1', look: 'beachA', n: 2, room: 0, from: 10, until: 12, stay: 'beach' }] });
  assert.strictEqual(v.inn2, 1);
  assert.strictEqual(v.resort.huts, 4);
  assert.strictEqual(v.resort.parasols, 0);
  assert.strictEqual(v.resort.stall, 1);
  assert.strictEqual(v.resort.pier, 1);
  assert.strictEqual(v.resort.deck, 0);
  assert.strictEqual(v.guests.length, 1, 'a beach guest is kept when a hut exists');
  assert.strictEqual(v.guests[0].stay, 'beach');
  assert.strictEqual(v.guests[0].look, 'beachA');
  assert.strictEqual(IN.valid({ guests: [{ id: 'g9', look: 'innA', n: 2, room: 0, from: 1, until: 2 }] }).guests.length, 0, 'an inn guest drops when no cabin is up');
});

ok('prices match the town plan: huts 15,000+200 (max 4), umbrellas 2,000 (max 8), stall 30,000+250, pier 25,000+300, deck 20,000+200, inn 60,000+600', () => {
  const I = IN.empty();
  assert.deepStrictEqual([IN.offer(I, 'hut').cost, IN.offer(I, 'hut').wood], [15000, 200]);
  assert.deepStrictEqual([IN.offer(I, 'parasol').cost, IN.offer(I, 'parasol').wood], [2000, 0]);
  assert.deepStrictEqual([IN.offer(I, 'stall').cost, IN.offer(I, 'stall').wood], [30000, 250]);
  assert.deepStrictEqual([IN.offer(I, 'pier').cost, IN.offer(I, 'pier').wood], [25000, 300]);
  assert.deepStrictEqual([IN.offer(I, 'deck').cost, IN.offer(I, 'deck').wood], [20000, 200]);
  assert.ok(/先盖至少一间/.test(IN.offer(I, 'inn2').why));
  I.cabins = 1;
  assert.deepStrictEqual([IN.offer(I, 'inn2').cost, IN.offer(I, 'inn2').wood], [60000, 600]);
  const gold = 4 * 15000 + 8 * 2000 + 30000 + 25000 + 20000 + 60000;
  const wood = 4 * 200 + 8 * 0 + 250 + 300 + 200 + 600;
  assert.strictEqual(gold, 60000 + 16000 + 75000 + 60000);
  assert.strictEqual(wood, 800 + 750 + 600);
});

ok('resort builds need the beach, a 度假村 on 东南滩, and prosperity 3; umbrellas go up at once, the rest take a day', () => {
  const I = IN.empty();
  const poor = { coast: 1, resort: 'eshore', lv: 3, coins: 100, wood: 10 };
  assert.strictEqual(IN.canStart(I, 'hut', { resort: 'eshore', lv: 3, coins: 1e6, wood: 999 }), '先买下海边');
  assert.strictEqual(IN.canStart(I, 'hut', { coast: 1, lv: 3, coins: 1e6, wood: 999 }), '先把东南滩改建成度假村');
  assert.ok(/繁荣度到 3/.test(IN.canStart(I, 'hut', { coast: 1, resort: 'eshore', lv: 2, coins: 1e6, wood: 999 })));
  assert.strictEqual(IN.canStart(I, 'hut', poor), '金币不够');
  const rich = { coast: 1, resort: 'eshore', lv: 3, coins: 1e6, wood: 999 };
  assert.strictEqual(IN.canStart(I, 'hut', rich), null);
  IN.start(I, 'hut', 80);
  assert.ok(/正在盖|一次只盖/.test(IN.canStart(I, 'stall', rich)));
  assert.strictEqual(IN.canStart(I, 'parasol', rich), null, 'umbrellas do not wait on the build job');
  IN.start(I, 'parasol', 80);
  assert.strictEqual(I.resort.parasols, 1, 'family places an umbrella immediately');
  assert.strictEqual(IN.finish(I, 80), null);
  assert.strictEqual(IN.finish(I, 81), 'hut');
  assert.strictEqual(I.resort.huts, 1);
  IN.start(I, 'stall', 81); IN.finish(I, 82); assert.strictEqual(I.resort.stall, 1);
  IN.start(I, 'pier', 82); IN.finish(I, 83); assert.strictEqual(I.resort.pier, 1);
  IN.start(I, 'deck', 83); IN.finish(I, 84); assert.strictEqual(I.resort.deck, 1);
  for (let i = I.resort.huts; i < 4; i++) { IN.start(I, 'hut', 84 + i); IN.finish(I, 85 + i); }
  assert.strictEqual(I.resort.huts, 4);
  assert.ok(/最多 4/.test(IN.offer(I, 'hut').why));
  while (I.resort.parasols < 8) IN.start(I, 'parasol', 90);
  assert.strictEqual(I.resort.parasols, 8);
  assert.ok(/最多 8/.test(IN.offer(I, 'parasol').why));
});

ok('inn2 needs a cabin, takes a day, and each cabin then hosts one extra group', () => {
  const I = IN.empty();
  const richInn = { plot: 'glade', lv: 3, coins: 1e6, wood: 999 };
  assert.ok(IN.canStart(I, 'inn2', richInn));
  IN.start(I, 'cabin', 70); IN.finish(I, 71);
  assert.strictEqual(IN.canStart(I, 'inn2', richInn), null);
  IN.start(I, 'inn2', 71);
  assert.strictEqual(IN.finish(I, 71), null);
  assert.strictEqual(IN.finish(I, 72), 'inn2');
  assert.strictEqual(I.inn2, 1);
  assert.strictEqual(IN.innRoomsOf(I), 2, 'one cabin, two groups');
  I.cabins = 4;
  assert.strictEqual(IN.innRoomsOf(I), 8);
  assert.ok(/已经是二层/.test(IN.offer(I, 'inn2').why));
  const a = IN.planArrivals(I, 100, 5, false);
  assert.ok(a.length <= 3);
  IN.checkIn(I, 100, 5, false);
  assert.ok(I.guests.every(g => g.stay === 'inn'));
  assert.ok(I.guests.every(g => g.room < 8));
  const again = IN.planArrivals(I, 100, 5, false);
  const taken = new Set(I.guests.map(g => g.stay + ':' + g.room));
  assert.ok(again.every(g => !taken.has(g.stay + ':' + g.room)));
  assert.ok(I.guests.length + again.length <= 8);
});

ok('beach guests only stay in huts, pay the same room fee, and do not take a cabin', () => {
  const I = IN.empty(); I.cabins = 2; I.resort.huts = 4;
  const inn = IN.planArrivals(I, 110, 5, false);
  const beach = IN.planBeachArrivals(I, 110, 5, false);
  assert.ok(beach.length >= 1 && beach.length <= 3);
  assert.ok(beach.every(g => g.stay === 'beach' && IN.BEACH_LOOKS.includes(g.look)));
  assert.ok(beach.every(g => g.n >= 1 && g.n <= 3));
  assert.ok(beach.every(g => g.at >= 10 * 60 && g.at < 16 * 60));
  const rooms = new Set();
  for (const g of beach) { assert.ok(!rooms.has(g.room)); rooms.add(g.room); }
  IN.checkIn(I, 110, 5, false);
  assert.ok(I.guests.some(g => g.stay === 'inn') && I.guests.some(g => g.stay === 'beach'));
  assert.strictEqual(IN.peopleStay(I, 110, 'inn'), inn.reduce((s, g) => s + g.n, 0));
  assert.strictEqual(IN.peopleStay(I, 110, 'beach'), beach.reduce((s, g) => s + g.n, 0));
  const dinerMeals = IN.mealsWanted(I, 110, false, 0);
  assert.strictEqual(dinerMeals, IN.peopleStay(I, 110, 'inn') * 2, 'the restaurant only cooks for cabin guests');
  assert.strictEqual(IN.stallMealsWanted(I, 110), IN.peopleStay(I, 110, 'beach') * 2);
  I.guests = [{ id: 'b1', look: 'beachA', n: 2, room: 0, from: 110, until: 112, at: 12 * 60, stay: 'beach' }];
  const morning = IN.checkOut(I, 111, () => ({ s: 5, note: '看到了海上的落日' }));
  assert.strictEqual(morning.groups.length, 0);
  const out = IN.checkOut(I, 112, () => ({ s: 5, note: '看到了海上的落日' }));
  assert.strictEqual(out.gold, IN.roomFee(2, 3));
  assert.strictEqual(out.notes[0].note, '看到了海上的落日');
  assert.strictEqual(I.guests.length, 0);
});

ok('seafood stall: 1.6× the sea-fish stall price; 海鱼烤 and 海鲜汤; missing stock drops off; takings go to earn.meals', () => {
  assert.strictEqual(IN.dishPay(IN.DISH.grill_sea), Math.round(16 * 1.6));
  assert.strictEqual(IN.dishPay(IN.DISH.seafood_soup), Math.round(16 * 2 * 1.6));
  const I = IN.empty();
  const r0 = IN.serveStall(I, 4, { sardine: 10 }, null);
  assert.strictEqual(r0.n, 0, 'no stall, no service');
  I.resort.stall = 1;
  const stock = { sardine: 3, seabass: 1, snapper: 0, tuna: 0, sword: 0, fish: 8 };
  const r = IN.serveStall(I, 6, stock, null);
  assert.ok(r.n > 0 && r.missed > 0);
  assert.strictEqual(r.n + r.missed, 6);
  assert.strictEqual(stock.fish, 8, 'pond fish stay in the basket');
  assert.ok(IN.seaCount(stock) < 4, 'sea fish were used');
  assert.strictEqual(I.earn.meals, r.gold);
  assert.ok(r.gold >= Math.round(16 * 1.6), 'at least the sardine price');
  const empty = { sardine: 0, seabass: 0, snapper: 0, tuna: 0, sword: 0 };
  const r2 = IN.serveStall(I, 3, empty, null);
  assert.strictEqual(r2.n, 0); assert.strictEqual(r2.missed, 3);
});

ok('sunset is 17:00–19:00; seeing it writes the guestbook note', () => {
  assert.strictEqual(IN.SUNSET.from, 17 * 60);
  assert.strictEqual(IN.SUNSET.to, 19 * 60);
  assert.ok(IN.isSunset(17 * 60) && IN.isSunset(18 * 60 + 30) && !IN.isSunset(16 * 60 + 59) && !IN.isSunset(19 * 60));
  const seen = IN.rateStay({ sunset: 1, animals: [{ h: 50 }], diner: 1 });
  assert.strictEqual(seen.note, '看到了海上的落日');
});

ok('beach slots are tidy, on the sand, and do not sit on the fishing pier or on each other', () => {
  const L = IN.resortLayout();
  assert.strictEqual(L.huts.length, 4);
  assert.strictEqual(L.parasols.length, 8);
  assert.ok(L.stall && L.pier && L.deck && L.deck.sit.length >= 4);
  const [x0, y0, x1, y1] = IN.COAST.rect;
  const waterY = IN.COAST.water[1];
  for (const c of L.huts) {
    assert.ok(c.x - c.hw >= x0 && c.x + c.hw <= x1, 'hut x ' + c.i);
    assert.ok(c.y - c.hd >= y0 && c.y + c.hd <= y1 + 2, 'hut y ' + c.i);
    assert.ok(c.door.y >= c.y, 'hut door faces south');
  }
  for (const u of L.parasols) {
    assert.ok(u.x >= x0 + 4 && u.x <= x1 - 4);
    assert.ok(u.y >= y0 + 8 && u.y < waterY + 2);
    assert.ok(Math.abs(u.x - IN.COAST.pier.x) >= 12, 'umbrella clears the old pier column');
  }
  const boxes = L.huts.map(c => ({ id: 'h' + c.i, a: [c.x - c.hw, c.y - c.hd, c.x + c.hw, c.y + c.hd] }))
    .concat([{ id: 'stall', a: [L.stall.x - L.stall.hw, L.stall.y - L.stall.hd, L.stall.x + L.stall.hw, L.stall.y + L.stall.hd] }])
    .concat([{ id: 'deck', a: [L.deck.x - L.deck.hw, L.deck.y - L.deck.hd, L.deck.x + L.deck.hw, L.deck.y + L.deck.hd] }]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i].a, B = boxes[j].a;
    const hit = A[0] < B[2] - 1 && B[0] < A[2] - 1 && A[1] < B[3] - 1 && B[1] < A[3] - 1;
    assert.ok(!hit, 'overlap ' + boxes[i].id + ' / ' + boxes[j].id);
  }
  // guest pier sits east of the fishing pier and reaches into the sea
  assert.ok(L.pier.x - IN.COAST.pier.x >= 16);
  assert.ok(L.pier.hook.y >= IN.COAST.water[1]);
  assert.deepStrictEqual(IN.COAST.rect, WD.region('coast').rect, 'slots follow the real coast');
});

ok('东南滩 offers 度假村 and is the only reserved resort plot; rezoning is blocked once something is up', () => {
  assert.strictEqual(IN.RESORT_PLOT, 'eshore');
  assert.ok(PL.plot('eshore').mods.includes('resort'));
  assert.ok(!PL.plot('eshore').mods.includes('inn'));
  for (const id of IN.INN_PLOTS) assert.ok(!PL.plot(id).mods.includes('resort'), id + ' stays a farmstay plot');
  const plots = { eshore: { mod: 'resort', day: 80 } };
  assert.strictEqual(IN.plotBusy('eshore', plots, IN.empty()), null);
  const I = IN.empty(); I.resort.huts = 1;
  assert.ok(/度假村/.test(IN.plotBusy('eshore', plots, I)));
  assert.strictEqual(IN.resortPlotOf(plots), 'eshore');
  assert.strictEqual(IN.resortPlotOf({}), null);
});

ok('autobuy lists never include a resort or inn project (the family only buys field / tools / chickens)', () => {
  // loaded only to make the contract obvious in this file; SIM is required here.
  const SIM = require('../sim.js');
  const ids = SIM.AUTO_BUY || [];
  const banned = ['hut', 'parasol', 'stall', 'pier', 'deck', 'inn2', 'cabin', 'diner', 'kitchen', 'inn', 'resort'];
  for (const id of banned) assert.ok(!ids.includes(id), id + ' must stay off autobuy');
});

console.log('\n' + n + ' tests ok');
