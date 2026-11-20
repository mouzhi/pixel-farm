// v5.10.10 unit tests: clinic 30,000 gold, five house rebuilds at 12,000+150 (one at a time),
// prosperity 4→5, paved streets, mood floor and monthly checkup, autobuy never buys them.
//   node tools/clinic-test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const TN = require('../town.js'), HL = require('../hall.js'), CL = require('../clinic.js');
const AN = require('../animals.js'), SAVE = require('../save.js'), SIM = require('../sim.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const FIX = f => { const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')); return r.save || r; };
const rich = { open: true, coins: 1e6, wood: 999 };
const houses = () => { const st = HL.empty(); for (const id of ['L5', 'L8', 'L11']) { HL.start(st, id, 40); HL.finish(st, 41); } return st; };
const ready = () => { const st = houses(); HL.start(st, 'market', 50); HL.finish(st, 51); HL.start(st, 'bakery', 51); HL.finish(st, 52); return st; };
const shops = () => { const st = ready(); HL.start(st, 'woodshop', 60); HL.finish(st, 61); HL.start(st, 'smithy', 61); HL.finish(st, 62); return st; };
const lv4 = () => { const st = shops(); HL.start(st, 'school', 70); HL.finish(st, 71); HL.start(st, 'library', 71); HL.finish(st, 72); return st; };

ok('prices match the town plan: clinic 30,000 gold (no wood), each rebuild 12,000+150, all need 繁荣度 4', () => {
  assert.strictEqual(CL.COST, 30000); assert.strictEqual(CL.WOOD, 0); assert.strictEqual(CL.LV, 4);
  assert.strictEqual(CL.REBUILD_COST, 12000); assert.strictEqual(CL.REBUILD_WOOD, 150);
  assert.strictEqual(CL.HOUSES.length, 5);
  const c = HL.PROJ.clinic; assert.strictEqual(c.cost, 30000); assert.strictEqual(c.wood, 0); assert.strictEqual(c.lv, 4); assert.strictEqual(c.who, 'n10');
  for (const id of ['h1', 'h2', 'h3', 'h4', 'h5']) {
    const p = HL.PROJ[id]; assert(p, id); assert.strictEqual(p.cost, 12000); assert.strictEqual(p.wood, 150); assert.strictEqual(p.lv, 4); assert.strictEqual(p.kind, 'rebuild');
  }
  const low = shops();
  assert(/繁荣度到 4/.test(HL.canStart(low, 'clinic', rich)));
  assert(/繁荣度到 4/.test(HL.canStart(low, 'h1', rich)));
  const st = lv4();
  assert.strictEqual(HL.canStart(st, 'clinic', { open: true, coins: 29999, wood: 0 }), '金币不够');
  assert.strictEqual(HL.canStart(st, 'clinic', rich), null);
  assert.strictEqual(HL.canStart(st, 'h1', { open: true, coins: 12000, wood: 149 }), '木材不够');
  assert.strictEqual(HL.canStart(st, 'h1', rich), null);
});

ok('the clinic lot sits east of L8, in town, clear of houses, lots and the market stalls', () => {
  const overlap = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
  const rectOf = b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd];
  const l = HL.LOT.clinic; assert.strictEqual(l.id, 'clinic');
  assert(TN.inTown(l.x, l.y) && TN.inTown(l.door.x, l.door.y));
  assert(TN.inRect(l.x - l.hw, l.y - l.hd, TN.RECT) && TN.inRect(l.x + l.hw, l.y + l.hd, TN.RECT));
  const box = rectOf(l);
  for (const b of TN.BUILDINGS) assert(!overlap(box, rectOf(b), 2), 'vs ' + b.id);
  for (const o of HL.LOTS) if (o.id !== 'clinic') assert(!overlap(box, rectOf(o), 2), 'vs ' + o.id);
  const MK = require('../market.js');
  for (const s of MK.blocks({ built: { market: 1 } })) assert(!overlap(box, s, 2), 'vs stall ' + s);
  assert(!overlap(box, [l.x - 1, 62, l.x + 1, 70]), 'off the main street');
  const su = HL.NEIGHBOURS.find(q => q.id === 'n10');
  assert.strictEqual(su.name, '苏大夫'); assert.strictEqual(su.look, 'townK');
  const st = lv4(); HL.start(st, 'clinic', 80); HL.finish(st, 81);
  assert(HL.residents(st).some(q => q.id === 'n10'));
  assert.strictEqual(HL.clinicAt(st, su, 81, 10 * 60).spot, 'clinic');
  assert.strictEqual(HL.clinicAt(st, su, 81, 18 * 60), null);
});

ok('rebuilds are one at a time; clinic + all five houses take prosperity 4 → 5 and pave the streets', () => {
  const st = lv4();
  assert.strictEqual(HL.prosperity(st), 4); assert.deepStrictEqual(HL.nextLevelAt(st), { need: 6 });
  assert(!CL.paved(st) && !HL.paved(st));
  HL.start(st, 'h1', 80); assert.strictEqual(HL.canStart(st, 'h2', rich), '一次只盖一座，等翻盖林老师家盖好');
  HL.finish(st, 81); assert(CL.rebuilt(st, 'h1')); assert.strictEqual(HL.prosperity(st), 4);
  HL.start(st, 'clinic', 81); HL.finish(st, 82);
  assert.strictEqual(HL.prosperity(st), 4); assert(!CL.paved(st));
  for (const id of ['h2', 'h3', 'h4', 'h5']) { HL.start(st, id, 90); HL.finish(st, 91); }
  assert.strictEqual(HL.prosperity(st), 5); assert.strictEqual(HL.nextLevelAt(st), null);
  assert.strictEqual(HL.LV_NAME[5], '远近闻名');
  assert(CL.paved(st) && HL.paved(st) && CL.allRebuilt(st));
});

ok('once the clinic is up, overnight mood never drops below 40; a checkup day adds 10, once', () => {
  const st = lv4(); HL.start(st, 'clinic', 80); HL.finish(st, 81);
  assert.strictEqual(CL.floor(st), 40); assert.strictEqual(CL.built(st), true);
  const a = [AN.animal('c0', 'chicken')]; a[0].h = 5;
  AN.overnight(a, { feed: 0, water: 0 }, 0, CL.floor(st));
  assert(a[0].h >= 40, 'floor ' + a[0].h);
  assert(!CL.isCheck(st, 81));
  assert.strictEqual(CL.nextCheck(st, 81), 90);
  assert(CL.isCheck(st, 90));
  a[0].h = 50;
  assert.strictEqual(CL.checkup(st, a, 90), 1);
  assert.strictEqual(a[0].h, 60);
  assert.strictEqual(CL.checkup(st, a, 90), 0, 'once a checkup day');
  assert.strictEqual(a[0].h, 60);
});

ok('autobuy never lists the clinic, a house rebuild, paving, or the other hall projects', () => {
  const ids = SIM.AUTO_BUY.slice();
  for (const id of ['clinic', 'h1', 'h2', 'h3', 'h4', 'h5', 'pave', 'paving', 'town', 'school', 'library', 'bakery', 'market', 'woodshop', 'smithy', 'inn', 'hall', 'pie']) {
    assert(!ids.includes(id), id);
  }
});

ok('valid(): junk in, a clean clinic out; fixtures gain an empty clinic, save stays v15', () => {
  assert.deepStrictEqual(CL.valid(undefined), CL.empty());
  assert.deepStrictEqual(CL.valid({ last: 'x', extra: 1 }), CL.empty());
  const v = HL.valid({ clinic: { last: 90, nope: 1 } });
  assert.deepStrictEqual(v.clinic, { last: 90 });
  for (const f of ['save-v10-day59-manor.json', 'save-v15-day72-cottage.json']) {
    const s = SAVE.migrate(JSON.parse(JSON.stringify(FIX(f)))); const out = SAVE.validate(s);
    assert.strictEqual(out.saveVersion, SAVE.CURRENT, f);
    assert.deepStrictEqual(out.town.hall.clinic, CL.empty(), f);
  }
});

console.log('clinic-test: ' + n + ' ok');
