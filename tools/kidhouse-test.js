// Unit tests for v5.13.0 扩建 (小豆家 / 小米家 grow like the farmhouse):  node tools/kidhouse-test.js
//   tiers and prices, the shop gate, footprints (only the strip behind the house is new), save round-trip / old saves,
//   and pathing round upgraded houses on the 宅园 pads. Synthetic data and the repo's synthetic fixtures only.
const assert = require('assert'), fs = require('fs'), path = require('path');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const HM = require('../home.js'), SAVE = require('../save.js'), SIM = require('../sim.js'), PL = require('../plots.js'), NAV = require('../path.js'), DC = require('../decor.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const FIX = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const PADS = PL.HOME_PADS.map(p => ({ site: p.id, x: p.x, y: p.y, m: p.m, built: 80 }));

ok('shop: 小豆家 and 小米家, two tiers each (6000+220 wood, 12000+400), in 建筑, never auto-bought', () => {
  for (const [k, id] of HM.UP.ids.entries()) {
    const it = SIM.shopItem(id); assert(it && it.kidup, id);
    assert.strictEqual(it.name, ['小豆家', '小米家'][k]);
    assert.deepStrictEqual(it.levels.map(l => [l.cost, l.wood, l.label]), [[6000, 220, '阁楼木屋'], [12000, 400, '两层小楼']]);
    assert(SIM.SHOP_TABS.find(t => t.id === 'build').ids.includes(id), 'in the build tab');
    assert(!SIM.AUTO_BUY.includes(id), 'never in AUTO_BUY');
    assert(SAVE.UPGRADE_IDS.includes(id), 'saved with the other shop levels');
  }
  // appended at the end of the saved shop ids (append-only)
  assert.deepStrictEqual(SAVE.UPGRADE_IDS.slice(-2), HM.UP.ids);
  assert.deepStrictEqual(SIM.effects({ kidhouse0: 2, kidhouse1: 1 }).kidhouse, [2, 1]);
  assert.deepStrictEqual(SIM.effects({ kidhouse0: 9 }).kidhouse, [2, 0], 'clamped to the tiers there are');
  assert.deepStrictEqual(SIM.effects({}).kidhouse, [0, 0]);
  // the main house still costs less at every step than the child's next one (the kids buy later, with a richer farm)
  const main = SIM.shopItem('house').levels; assert(main[1].cost < 6000 && main[2].cost < 12000);
});
ok('tiers: walls grow back (north) only; the door, porch, six tiles, hen house and bench never move; income +15% / +30%', () => {
  for (const m of [0, 1]) { const base = { site: 'glade', x: -68, y: 160, m };
    const L = [0, 1, 2].map(lv => HM.layout(Object.assign({}, base, { lv })));
    for (const lv of [1, 2]) {
      assert.deepStrictEqual([L[lv].door, L[lv].bench, L[lv].coop, L[lv].tiles, L[lv].coopBlock], [L[0].door, L[0].bench, L[0].coop, L[0].tiles, L[0].coopBlock]);
      assert.strictEqual(L[lv].block[3], L[0].block[3], 'front wall stays'); assert.strictEqual(L[lv].block[0], L[0].block[0]); assert.strictEqual(L[lv].block[2], L[0].block[2]);
      assert.strictEqual(L[lv].block[1], L[0].block[1] - HM.UP.back[lv], 'grows back by ' + HM.UP.back[lv]);
      assert(inside(L[lv].block, L[lv].foot), 'the walls stay in the yard');
      assert.strictEqual(L[lv].foot[1], L[0].foot[1] - HM.UP.back[lv]); assert.deepStrictEqual([L[lv].foot[0], L[lv].foot[2], L[lv].foot[3]], [L[0].foot[0], L[0].foot[2], L[0].foot[3]]);
      assert(!HM.boxHit(L[lv].block, L[lv].coopBlock), 'walls clear of the hen house');
      for (const t of L[lv].tiles) assert(!HM.boxHit(L[lv].block, [t.x - 4, t.y - 4, t.x + 4, t.y + 4]), 'walls clear of the tiles');
    } }
  assert.deepStrictEqual([0, 1, 2].map(lv => HM.earnMul({ lv })), [1, 1.15, 1.3]);
  assert.strictEqual(HM.lvOf({ lv: 7 }), 2); assert.strictEqual(HM.lvOf({}), 0); assert.strictEqual(HM.lvOf(null), 0);
  assert.strictEqual(HM.upKid('kidhouse0'), 'kid0'); assert.strictEqual(HM.upKid('kidhouse1'), 'kid1'); assert.strictEqual(HM.upKid('house'), null);
});
ok('gate: after the child moves in; the farmhouse first (二层农舍, then 庄园); room behind the house; nothing past the top tier', () => {
  assert.strictEqual(HM.upGate({ have: 0, name: '小豆', house: false, main: 3 }), '小豆成家、搬进新房子以后才能扩建');
  assert(/主屋先扩建成二层农舍/.test(HM.upGate({ have: 0, name: '小豆', house: true, main: 1 })));
  assert.strictEqual(HM.upGate({ have: 0, name: '小豆', house: true, main: 2 }), null);
  assert(/主屋先扩建成庄园/.test(HM.upGate({ have: 1, name: '小米', house: true, main: 2 })));
  assert.strictEqual(HM.upGate({ have: 1, name: '小米', house: true, main: 3 }), null);
  assert.strictEqual(HM.upGate({ have: 1, name: '小米', house: true, main: 3, grow: '挤' }), '挤');
  assert.strictEqual(HM.upGate({ have: 2, name: '小米', house: false, main: 0 }), null);
});
ok('room: all four 宅园 pads can reach the top tier side by side; a fence, a tree or a house behind refuses it', () => {
  for (const h of PADS) for (const lv of [1, 2]) {
    const others = PADS.filter(q => q !== h).map(q => HM.layout(Object.assign({}, q, { lv: 2 })).foot);
    assert.strictEqual(HM.growWhy(h, lv, { others, avoid: [] }), null, h.site + ' lv' + lv);
  }
  // the pads' upgraded yards never overlap (north row vs south row, west vs east)
  const feet = PADS.map(q => HM.layout(Object.assign({}, q, { lv: 2 })).foot);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert(!HM.boxHit(feet[i], feet[j], -0.01), PADS[i].site + ' / ' + PADS[j].site);
  // the 宅园 spine (y 163) stays clear of every upgraded wall
  for (const q of PADS) { const b = HM.layout(Object.assign({}, q, { lv: 2 })).block; assert(b[1] > 163 + 4 || b[3] < 163 - 4, q.site + ' block ' + b); }
  const h = PADS[0], L = HM.layout(h);
  const tree = [h.x - 3, L.block[1] - 3, h.x + 3, L.block[1] - 1];
  assert(/树/.test(HM.growWhy(h, 1, { avoid: [tree] })), 'a tree right behind');
  assert(/另一座房子/.test(HM.growWhy(h, 2, { others: [[h.x - 10, L.block[1] - 12, h.x + 10, L.block[1] - 2]] })));
  // a house pushed up against the top fence of its plot cannot grow back
  const g = PL.plot('glade'), tight = { site: 'glade', x: (g.rect[0] + g.rect[2]) / 2, y: g.rect[1] + 12, m: 0 };
  assert(/篱笆/.test(HM.growWhy(tight, 2, {})), HM.growWhy(tight, 2, {}));
  // moving an upgraded house checks its bigger yard
  const ctx = { plots: { nhome: { mod: 'homestead', day: 40 }, glade: { mod: 'meadow', day: 20 } }, regions: [], houses: [], avoid: [] };
  const mv = HM.moveOk(302, 180, { site: 'glade', x: -68, y: 160, m: 1, built: 61, lv: 2 }, ctx);
  assert(mv.ok && mv.spot.site === 'nhome3', mv.why); assert.strictEqual(mv.box[1], 180 - 9 - HM.UP.back[2]);
});
ok('save: the two tiers ride on the shop levels (v15, append-only); old saves load as 木屋; round-trip; still small', () => {
  const s = SAVE.migrate(FIX('save-v15-day72-cottage.json'));
  assert.strictEqual(s.saveVersion, 15);
  const v0 = SAVE.validate(JSON.parse(JSON.stringify(s)));
  assert.strictEqual(v0.upgrades.kidhouse0, 0, 'an old save has no kidhouse levels'); assert.strictEqual(v0.upgrades.kidhouse1, 0);
  assert.deepStrictEqual(SIM.effects(v0.upgrades).kidhouse, [0, 0]);
  assert(v0.home.houses.every(h => !('lv' in h)), 'the house record is unchanged (h.lv is runtime only)');
  const up = JSON.parse(JSON.stringify(v0)); up.upgrades.kidhouse0 = 2; up.upgrades.kidhouse1 = 1; up.home.houses[0].lv = 2;
  const back = SAVE.validate(JSON.parse(JSON.stringify(up)));
  assert.strictEqual(back.upgrades.kidhouse0, 2); assert.strictEqual(back.upgrades.kidhouse1, 1);
  assert.deepStrictEqual(back.home, v0.home, 'a stray h.lv is dropped; the shop levels decide');
  assert.deepStrictEqual(SAVE.validate(JSON.parse(JSON.stringify(back))), back, 'stable round-trip');
  const enc = SAVE.encode ? SAVE.encode(SAVE.compact ? SAVE.compact(back) : back) : JSON.stringify(back);
  assert(String(enc).length <= 64 * 1024, 'save size ' + String(enc).length);
  const bad = JSON.parse(JSON.stringify(v0)); bad.upgrades.kidhouse0 = 'x'; bad.upgrades.kidhouse1 = -3;
  const vb = SAVE.validate(bad); assert.strictEqual(vb.upgrades.kidhouse0, 0); assert.strictEqual(vb.upgrades.kidhouse1, 0);
});
ok('pathing: four top-tier houses on the 宅园 keep every door, tile, hen house, the east gate and the beach path reachable', () => {
  const regions = WD.REGION_IDS.concat(['nhome']), plots = { nhome: { mod: 'homestead', day: 40 } };
  const Ls = PADS.map(q => HM.layout(Object.assign({}, q, { lv: 2 })));
  const blocks = Ls.flatMap(L => [L.block, L.coopBlock]);
  const g = NAV.build({ trees: [], regions, pens: {}, fence: false, houseTier: 3, graze: false, plots, blocks });
  const gate = PL.plot('nhome').gate, beach = PL.HOME_JOIN.beach;
  const seen = DC.reach(g, gate, []);
  const reach = p => { const [i, j] = NAV.cellOf(g, p.x, p.y); return i >= 0 && j >= 0 && i < g.w && j < g.h && !!seen[j * g.w + i]; };
  assert(reach(beach), 'the beach path from the 宅园 gate');
  Ls.forEach((L, k) => {
    assert(reach({ x: L.door.x, y: L.door.y + 1 }), PADS[k].site + ' door');
    assert(reach(L.eggs), PADS[k].site + ' eggs');
    for (const t of L.tiles) assert(reach({ x: t.x, y: t.y + 5 }), PADS[k].site + ' tile ' + t.i);
  });
  assert(NAV.route(g, NAV.LAYOUT.DOOR, { x: Ls[0].door.x, y: Ls[0].door.y + 1 }).reached, 'from the farmhouse door to 西北');
  // nobody is walled in: every open cell inside the 宅园 that the tier-0 houses could reach is still reachable at tier 2 (except the new walls)
  const g0 = NAV.build({ trees: [], regions, pens: {}, fence: false, houseTier: 3, graze: false, plots, blocks: PADS.flatMap(q => { const L = HM.layout(q); return [L.block, L.coopBlock]; }) });
  const s0 = DC.reach(g0, gate, []), r = PL.plot('nhome').rect; let lost = 0;
  for (let y = r[1] + 1; y < r[3]; y += 1) for (let x = r[0] + 1; x < r[2]; x += 1) {
    const [i, j] = NAV.cellOf(g, x, y); if (!(i >= 0 && j >= 0 && i < g.w && j < g.h)) continue; const c = j * g.w + i;
    if (s0[c] && !seen[c] && g.cost[c] !== NAV.BLOCKED && !Ls.some(L => x >= L.block[0] - 2 && x <= L.block[2] + 2 && y >= L.block[1] - 2 && y <= L.block[3] + 2)) { lost++; if (process.env.KH_DEBUG) console.log('lost', x, y); } }
  assert.strictEqual(lost, 0, 'open cells cut off by the bigger houses');
});
console.log(`kidhouse-test: ${n} passed`);
