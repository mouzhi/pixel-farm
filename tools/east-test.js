// v5.12.2 东门大道 + 度假沙滩: node tools/east-test.js
'use strict';
const assert = require('assert');
const EA = require('../east.js');
const PL = require('../plots.js');
const TN = require('../town.js');
const WD = require('../world.js');
const SIM = require('../sim.js');

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// world grew once, to 1328
ok(EA.NEW_X1 === 1328 && EA.OLD_X1 === 1008, 'new east edge 1328, old 1008');
ok(EA.WORLD.x1 === 1328 && EA.WORLD.x0 === -256, 'extended world');

// layout matches the plan
ok(EA.AVENUE.y === 66 && EA.AVENUE.x0 === 984 && EA.AVENUE.x1 === 1240, 'avenue y=66, 984..1240');
ok(JSON.stringify([EA.PARK.x0, EA.PARK.y0, EA.PARK.x1, EA.PARK.y1]) === '[1080,80,1260,200]', 'parking 1080..1260, 80..200');
ok(EA.PRICE_AVE.cost === 25000 && EA.PRICE_AVE.wood === 150, 'avenue price');
ok(EA.PRICE_BEACH.cost === 20000 && EA.PRICE_BEACH.wood === 100, 'beach price');
ok(EA.beachX1(false) === 1008 && EA.beachX1(true) === 1288, 'beach ends at 1008, extends to 1288 with the avenue');
ok(EA.BEACH.x0 === 360 && EA.BEACH.y0 === 212, 'beach starts east of the pier, south of the town wall');
ok(EA.CAR_SLOTS.length === 8 && EA.BUS_SLOTS.length === 2, '8 car bays, 2 reserved bus bays');
ok(EA.UMBRELLAS.length === 8 && EA.CHAIRS.length === 8 && EA.SUNSETS.length === 2, 'basic beach kit');
ok(EA.UMBRELLAS.every(u => u.x >= 360 && u.x <= 1008), 'umbrellas sit on the no-avenue stretch so they show without the avenue');

// no overlap with existing lots (incl. 宅园) or the town / 农家乐
const parkBox = [EA.PARK.x0, EA.PARK.y0, EA.PARK.x1, EA.PARK.y1];
const aveBox = [EA.AVENUE.x0, EA.AVENUE.y - EA.AVENUE.hw, EA.AVENUE.x1, EA.AVENUE.y + EA.AVENUE.hw];
const beachOpen = EA.beachRect(false);
const beachFull = EA.beachRect(true);
const lots = PL.PLOTS.map(p => ({ id: p.id, name: p.name, rect: p.rect }));
lots.push({ id: 'town', name: '小镇', rect: TN.RECT });
lots.push({ id: 'agri', name: '农家乐区', rect: TN.AGRI });
for (const r of WD.REGIONS) lots.push({ id: r.id, name: r.name, rect: r.rect });
const hits = (box, pad) => lots.filter(l => EA.boxHit(box, l.rect, pad)).map(l => l.id + '/' + l.name);
ok(!hits(parkBox, 1).length, 'parking does not overlap lots: ' + hits(parkBox, 1));
// the avenue starts at the town's east wall (x 984) and shares that edge; it must not eat into the town interior
ok(!hits([EA.AVENUE.x0 + 1, aveBox[1], aveBox[2], aveBox[3]], 1).length, 'avenue interior does not overlap lots: ' + hits([EA.AVENUE.x0 + 1, aveBox[1], aveBox[2], aveBox[3]], 1));
ok(!hits(beachOpen, 1).length, 'beach (no avenue) does not overlap lots: ' + hits(beachOpen, 1));
ok(!hits(beachFull, 1).length, 'extended beach does not overlap lots: ' + hits(beachFull, 1));
ok(!hits(parkBox, 1).includes('nhome') && !PL.PLOTS.find(p => p.id === 'nhome' && EA.boxHit(parkBox, p.rect, 1)), 'parking misses 宅园');
ok(!EA.boxHit(beachFull, PL.plot('nhome').rect, 1), 'beach misses 宅园·度假村北');
ok(!EA.boxHit(beachOpen, PL.plot('eshore').rect, 1), 'beach misses 东南滩 (only a path from the south fence)');
ok(!EA.boxHit(beachOpen, WD.region('coast').rect, 1), 'beach starts east of the old 海边 fishing beach');

// gates: avenue needs town + prosperity 5; beach needs town + 海边, not the avenue
ok(EA.gateAve({ town: false, lv: 5 }) && /镇门/.test(EA.gateAve({ town: false, lv: 5 })), 'avenue waits for the town gate');
ok(/繁荣度到 5/.test(EA.gateAve({ town: true, lv: 4 })), 'avenue waits for prosperity 5');
ok(EA.gateAve({ town: true, lv: 5 }) === null, 'avenue opens at prosperity 5');
ok(/镇门/.test(EA.gateBeach({ town: false, coast: true })), 'beach waits for the town gate');
ok(/海边/.test(EA.gateBeach({ town: true, coast: false })), 'beach waits for 海边');
ok(EA.gateBeach({ town: true, coast: true }) === null, 'beach does not need the avenue');
ok(EA.gateBeach({ town: true, coast: true, avenue: false }) === null, 'still ok without the avenue flag');

// sand: only inside the bought beach, not west of the pier, not in the water, not in the parking lot
const optsB = { beach: true, avenue: false, world: WD };
ok(EA.sandAt(400, 230, optsB), 'west beach sand at 400,230');
ok(!EA.sandAt(300, 230, optsB), 'old fishing beach is not widened');
ok(!EA.sandAt(400, 180, optsB), 'no sand north of the town wall');
ok(!EA.sandAt(1100, 230, optsB), 'east sand is not there until the avenue is bought');
ok(EA.sandAt(1100, 230, { beach: true, avenue: true, world: WD }), 'east sand appears once the avenue is bought');
ok(!EA.sandAt(400, 230, { beach: false, world: WD }), 'no widened sand before the beach is bought');
ok(!EA.sandAt(1170, 150, { beach: true, avenue: true, world: WD }), 'parking is not sand');
ok(EA.hideTree(400, 230, optsB) && !EA.hideTree(400, 180, optsB), 'trees in the sand belt are hidden, others stay');

// traffic: nothing without the avenue; with it, 3-6 parked arrivals a day, at most 2 moving, visitors skip the beach if it is shut
ok(EA.trafficAt(20, 10 * 60, { avenue: false }).moving.length === 0, 'no cars before the avenue is bought');
ok(EA.trafficAt(20, 10 * 60, { avenue: false }).parked.length === 0, 'no parked cars either');
for (let d = 1; d <= 20; d++) {
  const p = EA.dayPlan(d, { avenue: true, beach: false });
  ok(p.n >= 3 && p.n <= 6, 'day ' + d + ' has 3-6 arrivals: ' + p.n);
  ok(p.cars.every(c => c.people === 1 || c.people === 2), '1-2 people');
  ok(p.cars.every(c => c.dest !== 'beach'), 'without the beach, nobody is sent to the beach');
  const slots = new Set(p.cars.map(c => c.slot));
  ok(slots.size === p.cars.length, 'unique parking slots on day ' + d);
}
const mid = EA.trafficAt(4, 12 * 60, { avenue: true, beach: true });
ok(mid.moving.length <= 2, 'at most 2 moving cars: ' + mid.moving.length);
ok(mid.moving.every(c => Math.abs(c.y - EA.AVENUE.y) < 1 || EA.inPark(c.x, c.y, 8)), 'moving cars stay on the avenue or in the lot');
ok(mid.moving.every(c => c.y < 210), 'cars never drive onto the beach');
ok(mid.visitors.filter(v => v.dest === 'beach').length <= 8, 'beach visitors cap 8');
const trB = EA.trafficAt(4, 12 * 60, { avenue: true, beach: false });
ok(trB.visitors.every(v => v.dest !== 'beach'), 'visitors go to town / 农家乐 when the beach is shut');
ok(JSON.stringify(EA.trafficAt(4, 12 * 60, { avenue: true, beach: true })) === JSON.stringify(EA.trafficAt(4, 12 * 60, { avenue: true, beach: true })), 'traffic is deterministic');

// night lights: only the tower and two decks, and only after dusk
ok(EA.lightsAt(12 * 60, { beach: true }).length === 0, 'no beach floodlights at noon');
ok(EA.lightsAt(20 * 60, { beach: false }).length === 0, 'no lights before the beach is bought');
const lit = EA.lightsAt(20 * 60, { beach: true });
ok(lit.length === 3, 'dusk: tower + 2 sunset decks');

// shop items exist once sim is wired (this file also requires sim, which pulls town/home)
// eastave / vacbeach are added in sim.js; if this test is run before that patch it will fail later in the suite.
if (SIM.shopItem('eastave')) {
  const ave = SIM.shopItem('eastave'), beach = SIM.shopItem('vacbeach');
  ok(ave && ave.levels[0].cost === 25000 && ave.levels[0].wood === 150, 'shop 东门大道');
  ok(beach && beach.levels[0].cost === 20000 && beach.levels[0].wood === 100, 'shop 度假沙滩');
  const eff0 = SIM.effects({});
  ok(!eff0.eastave && !eff0.vacbeach, 'fresh save: both shut');
  const eff1 = SIM.effects({ eastave: 1, vacbeach: 1, town: 1, coast: 1 });
  ok(eff1.eastave && eff1.vacbeach, 'effects flag both purchases');
  const tab = SIM.SHOP_TABS.find(t => t.id === 'land');
  ok(tab.ids.includes('eastave') && tab.ids.includes('vacbeach'), 'both sit on the 地块 tab');
}

console.log('ok  ' + n + ' east-test checks');
