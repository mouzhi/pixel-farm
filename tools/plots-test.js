// Unit tests for the outer ring (v5.5.0, plots.js): layout, buying with a module, re-zoning, save migration, and the bridge.
//   node tools/plots-test.js          (PF_USER_SAVE=/path/to/export.json also migrates a real player's save, read-only)
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const PL = require('../plots.js'), WD = require('../world.js'), SAVE = require('../save.js'), SIM = require('../sim.js'), NAV = require('../path.js');
const FIX = path.join(__dirname, 'fixtures');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const ov = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const MOVED = { moved: 12 }, SINGLE = { moved: 0 };
const allOpen = () => SIM.SHOP.filter(s => s.region).map(s => s.id);

ok('map: 88x74 tiles; old coordinates unchanged, the ring only adds bounds', () => {
  const w = WD.WORLD; assert.strictEqual((w.x1 - w.x0) / 8 + 'x' + (w.y1 - w.y0) / 8, '88x74');
  assert(w.x0 < PL.OLD.x0 && w.y0 < PL.OLD.y0 && w.x1 > PL.OLD.x1 && w.y1 > PL.OLD.y1);
  assert.deepStrictEqual(WD.HOME, { x0: 0, y0: 0, x1: 192, y1: 128 });
  assert.strictEqual(WD.REGIONS.length, 6); assert.deepStrictEqual(WD.region('forest').rect, WD.region('forest').rect);
});
ok('layout: plots inside the world, apart from each other, the farm, the old regions and the pens; gates on their edge', () => {
  const H = WD.HOME, home = [H.x0 - 4, H.y0 - 4, H.x1 + 4, H.y1 + 4], w = WD.WORLD;
  for (const p of PL.PLOTS) { const r = p.rect;
    assert(r[0] >= w.x0 && r[1] >= w.y0 && r[2] <= w.x1 && r[3] <= w.y1, 'in world ' + p.id);
    assert(!ov(r, home), 'off the farm ' + p.id);
    for (const q of WD.REGIONS) assert(!ov(r, q.rect), p.id + ' overlaps region ' + q.id);
    for (const q of PL.PLOTS) if (q !== p) assert(!ov(r, q.rect), p.id + ' overlaps ' + q.id);
    const g = p.gate; assert(g.x === r[0] || g.x === r[2] || g.y === r[1] || g.y === r[3], 'gate on edge ' + p.id);
    assert(p.mods.length >= 1 && p.mods.every(m => PL.MODULES[m]), 'modules ' + p.id);
    assert(p.price >= 2000 && p.price <= 7000, 'price ' + p.id);
    if (p.field) { const f = p.field; assert(f.c0 * 8 >= r[0] && (f.c0 + f.cols) * 8 <= r[2] && f.r0 * 8 >= r[1] && (f.r0 + f.rows) * 8 <= r[3], 'field inside ' + p.id); assert(p.mods.includes('field')); assert(p.barrel, 'barrel ' + p.id); }
    if (p.special !== 'bridge') for (let x = r[0] + 2; x < r[2]; x += 4) for (let y = r[1] + 2; y < r[3]; y += 4) assert(PL.terrainAt(x, y) !== 'river', p.id + ' has river inside at ' + x + ',' + y);
  }
  assert.strictEqual(PL.PLOTS.length, 16);
  const area = r => (r[2] - r[0]) * (r[3] - r[1]), small = Math.min(...WD.REGIONS.map(q => area(q.rect)));
  assert(PL.PLOTS.every(p => area(p.rect) < 7800), 'small and medium: none as big as the old regions'); assert(PL.PLOTS.filter(p => area(p.rect) <= small * 0.75).length >= 8, 'at least half are small');
  for (const id of ['field', 'pasture', 'orchard', 'meadow', 'woodland', 'workshop', 'dam', 'road', 'playground']) assert(PL.PLOTS.some(p => p.mods.includes(id)), 'some plot offers ' + id);
  assert.deepStrictEqual(PL.PLOTS.find(p => p.id === 'play').mods, ['playground', 'meadow']);
});
ok('routes: every plot gate is on a dirt road from the farm', () => {
  const segs = []; for (const k in WD.ROUTES) { const r = WD.ROUTES[k]; for (let i = 0; i < r.length - 1; i++) segs.push([r[i], r[i + 1]]); }
  const near = (x, y) => segs.some(([a, b]) => PL.polyDist(x, y, [a, b]) < 1.5);
  for (const p of PL.PLOTS) if (!['summit', 'alp'].includes(p.id)) assert(near(p.gate.x, p.gate.y), 'road to ' + p.id);
});
ok('terrain: river, banks, cliff, plateau, and the trail is the only way up', () => {
  assert.strictEqual(PL.terrainAt(24, 316), 'river'); assert.strictEqual(PL.terrainAt(-224, 30), 'river');
  assert.strictEqual(PL.terrainAt(96, 64), null); assert.strictEqual(PL.terrainAt(100, -190), 'high');
  assert.strictEqual(PL.terrainAt(100, PL.ridgeY(100) - 2), 'cliff');
  assert(PL.onTrail(204, -108) && PL.onTrail(196, -184) && !PL.onTrail(100, -184));
});
ok('buying: closed until 阿禾 moves in (2 workers), then a module the terrain allows, price and wood', () => {
  assert.strictEqual(PL.workers(SINGLE), 1); assert.strictEqual(PL.workers(MOVED), 2);
  assert.strictEqual(PL.offer({}, 'glade', 'field', 1e6, 999, SINGLE).reason, 'gate');
  const o = PL.offer({}, 'glade', 'field', 2400, 0, MOVED); assert(o.ok); assert.strictEqual(o.cost, 2400); assert.strictEqual(o.wood, 0);
  const s = PL.offer({}, 'glade', 'field', 2399, 0, MOVED); assert(!s.ok); assert.strictEqual(s.reason, 'short'); assert.strictEqual(s.short, 1);
  assert.strictEqual(PL.offer({}, 'glade', 'dam', 1e6, 999, MOVED).reason, 'module');      // no river by the glade
  assert.strictEqual(PL.offer({}, 'nwslope', 'field', 1e6, 999, MOVED).reason, 'module');  // a slope is no field
  const pg = PL.offer({}, 'glade', 'playground', 1e6, 999, MOVED); assert.strictEqual(pg.cost, 2400 + 800); assert.strictEqual(pg.wood, 40);
  const pb = PL.offer({}, 'play', 'playground', 1e6, 999, MOVED); assert.strictEqual(pb.cost, 2200); assert.strictEqual(pb.wood, 40); // bundled
  assert.strictEqual(PL.offer({}, 'play', null, 1e6, 999, MOVED).mod, 'playground');
  assert.strictEqual(PL.offer({ glade: { mod: 'field', day: 3 } }, 'glade', 'meadow', 1e6, 999, MOVED).owned, true);
});
ok('buying: across the river needs the bridge, up the mountain needs the trail', () => {
  assert.strictEqual(PL.offer({}, 'swacross', 'field', 1e6, 999, MOVED).reason, 'needs');
  assert(PL.offer({ bridge: { mod: 'bridge', day: 1 } }, 'swacross', 'field', 1e6, 999, MOVED).ok);
  assert.strictEqual(PL.offer({}, 'summit', 'orchard', 1e6, 999, MOVED).needs, 'trail');
  const b = PL.offer({}, 'bridge', null, 5500, 30, MOVED); assert(b.ok); assert.strictEqual(b.mod, 'bridge');
  assert(!PL.offer({}, 'bridge', null, 5500, 29, MOVED).ok);
});
ok('re-zoning: a quarter of the plot price (to 50) + 10 wood (+ the playground setup); special plots are fixed', () => {
  const own = { glade: { mod: 'field', day: 3 }, bridge: { mod: 'bridge', day: 2 }, play: { mod: 'playground', day: 4 } };
  const r = PL.rezoneOffer(own, 'glade', 'meadow', 1e6, 999); assert(r.ok); assert.strictEqual(r.cost, 600); assert.strictEqual(r.wood, 10); assert.strictEqual(r.from, 'field');
  const p = PL.rezoneOffer(own, 'glade', 'playground', 1e6, 999); assert.strictEqual(p.cost, 600 + 800); assert.strictEqual(p.wood, 50);
  assert.strictEqual(PL.rezoneOffer(own, 'glade', 'field', 1e6, 999).reason, 'same');
  assert.strictEqual(PL.rezoneOffer(own, 'glade', 'dam', 1e6, 999).reason, 'module');
  assert.strictEqual(PL.rezoneOffer(own, 'bridge', 'field', 1e6, 999).reason, 'fixed');
  assert.strictEqual(PL.rezoneOffer(own, 'eslope', 'field', 1e6, 999), null);
  assert.strictEqual(PL.rezoneOffer(own, 'glade', 'meadow', 599, 999).reason, 'short');
  assert.strictEqual(PL.rezoneOffer(own, 'play', 'meadow', 1e6, 999).cost, 550); // back from the bundled playground: no setup
  for (const q of PL.PLOTS) if (q.mods.length > 1) assert.strictEqual(PL.rezoneOffer({ [q.id]: { mod: q.mods[0] } }, q.id, q.mods[1], 0, 0).cost % 50, 0);
});
ok('validPlots: junk dropped, unknown modules fall back, nothing across the river without the bridge', () => {
  const v = PL.validPlots({ glade: { mod: 'field', day: 4 }, eslope: { mod: 'rocket', day: 'x' }, nope: { mod: 'field' }, swacross: { mod: 'field', day: 9 }, summit: { mod: 'orchard' }, trail: { mod: 'trail' } });
  assert.deepStrictEqual(v, { glade: { mod: 'field', day: 4 }, eslope: { mod: 'pasture', day: 1 }, summit: { mod: 'orchard', day: 1 }, trail: { mod: 'trail', day: 1 } });
  assert.deepStrictEqual(PL.validPlots(null), {}); assert.deepStrictEqual(PL.validPlots([1, 2]), {});
});
ok('woodland, playground spots and the grazing hours', () => {
  const t = PL.woodlandTrees('nwslope'); assert(t.length >= 6 && t.length <= 10); const r = PL.plot('nwslope').rect;
  assert(t.every(q => q.x > r[0] && q.x < r[2] && q.y > r[1] && q.y < r[3] && q.id.startsWith('xnwslope')));
  assert(PL.woodlandOf({ nwslope: { mod: 'woodland' } }, t[0].x, t[0].y)); assert(!PL.woodlandOf({ nwslope: { mod: 'orchard' } }, t[0].x, t[0].y));
  const s = PL.playSpots({ play: { mod: 'playground' } }); assert.deepStrictEqual(s.map(q => q.kind), ['slide', 'sandbox', 'swing']);
  assert(s.every(q => PL.plotAt(q.x, q.y).id === 'play' && PL.plotAt(q.stand.x, q.stand.y).id === 'play'));
  assert(PL.grazeHours(9 * 60) && !PL.grazeHours(18 * 60) && !PL.grazeHours(7 * 60));
  assert(!ov(PL.GRAZE.rect, WD.region('orchard').rect) && PL.GRAZE.rect[2] === WD.region('orchard').rect[0]);
});
ok('shop: 放牧草地 is a fold upgrade for 600 gold + 30 wood, no plot needed', () => {
  const it = SIM.shopItem('graze'); assert.strictEqual(it.needs, 'fold'); assert.strictEqual(it.levels[0].cost, 600); assert.strictEqual(it.levels[0].wood, 30);
  assert(SIM.SHOP_TABS.find(t => t.id === 'build').ids.includes('graze'));
  assert.strictEqual(SIM.offer({ fold: 0 }, 1e4, 'graze', 99).locked, 'fold'); assert(SIM.offer({ fold: 1 }, 600, 'graze', 30).ok);
  assert.strictEqual(SIM.effects({ fold: 1, graze: 1 }).graze, true); assert.strictEqual(SIM.effects({ fold: 1 }).graze, false);
});
ok('save: v10 -> v11 adds no plots and no meadow; v11 keeps plots and plot field tiles', () => {
  const v10 = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v10-day4.json'), 'utf8'));
  const s = SAVE.migrate(v10); assert.strictEqual(s.saveVersion, 11); assert.deepStrictEqual(s.plots, {}); assert.strictEqual(s.upgrades.graze, 0);
  assert.deepStrictEqual(s.tiles, SAVE.migrate(v10).tiles);
  const v11 = Object.assign({}, s, { plots: { glade: { mod: 'field', day: 5 }, bridge: { mod: 'bridge', day: 6 }, swacross: { mod: 'meadow', day: 7 } }, upgrades: Object.assign({}, s.upgrades, { graze: 1 }),
    tiles: s.tiles.concat([{ f: 'glade', c: 2, r: 1, open: true, tilled: true, watered: false, crop: { type: 'carrot', age: 0, rot: 1 } }]), farmer: { x: -240, y: 370, sleeping: false, home: false } });
  const b = SAVE.migrate(JSON.parse(JSON.stringify(v11)));
  assert.deepStrictEqual(b.plots, v11.plots); assert.strictEqual(b.upgrades.graze, 1);
  const t = b.tiles[b.tiles.length - 1]; assert.strictEqual(t.f, 'glade'); assert.strictEqual(t.crop.type, 'carrot');
  assert.deepStrictEqual([b.farmer.x, b.farmer.y], [-240, 370]); // out in the ring: kept, not clamped back onto the old map
  assert(fs.existsSync(path.join(FIX, 'save-v11-day4.json')), 'v11 fixture');
});
const USER = process.env.PF_USER_SAVE;
if (USER && fs.existsSync(USER)) ok('a real player save (v10, ' + path.basename(USER) + ') migrates to v11 with nothing lost', () => {
  const raw = JSON.parse(fs.readFileSync(USER, 'utf8')), old = raw.save || raw, s = SAVE.migrate(JSON.parse(JSON.stringify(old))), base = SAVE.validate(old);
  assert.strictEqual(s.saveVersion, 11); assert.deepStrictEqual(s.plots, {}); assert.strictEqual(s.upgrades.graze, 0);
  for (const k of Object.keys(base)) { if (['saveVersion', 'plots', 'upgrades'].includes(k)) continue; assert.deepStrictEqual(s[k], base[k], 'kept ' + k); }
  for (const k of Object.keys(base.upgrades)) assert.strictEqual(s.upgrades[k], base.upgrades[k], 'upgrade ' + k);
  assert.strictEqual(s.coins, old.coins); assert.strictEqual(s.tiles.length, old.tiles.length); assert.strictEqual(s.trees.length, old.trees.length);
  assert.deepStrictEqual([s.farmer.x, s.farmer.y], [old.farmer.x, old.farmer.y]);
  assert(PL.gateOpen(s.family), '阿禾 has moved in: the ring is open');
});
// the bridge: across the river only over it
const nav = plots => NAV.build({ trees: [], regions: allOpen().concat(Object.keys(plots)), pens: {}, fence: false, houseTier: 0, graze: false });
ok('path: no way across the river without the bridge; with it the route crosses on the deck', () => {
  const from = { x: 24, y: 280 }, to = { x: -40, y: 355 };
  const a = NAV.route(nav({ swacross: 1 }), from, to); assert(!a.reached, 'no bridge: cannot reach the far bank');
  const g = nav({ bridge: 1, swacross: 1 }), b = NAV.route(g, from, to); assert(b.reached, 'bridge: reaches the far bank');
  assert.strictEqual(NAV.blockedAlong(g, b.points).length, 0);
  const crossing = b.points.some((p, i) => i && Math.min(p.y, b.points[i - 1].y) < 312 && Math.max(p.y, b.points[i - 1].y) > 322 && Math.abs(p.x - 24) < 5 && Math.abs(b.points[i - 1].x - 24) < 5);
  assert(crossing, 'crosses at the bridge ' + JSON.stringify(b.points));
  for (let i = 1; i < b.points.length; i++) { const p = b.points[i], q = b.points[i - 1]; for (let t = 0; t <= 1; t += 0.05) { const x = q.x + (p.x - q.x) * t, y = q.y + (p.y - q.y) * t; if (PL.terrainAt(x, y) === 'river') assert(Math.abs(x - 24) < 5, 'only wet on the bridge ' + x + ',' + y); } }
  assert(b.length < 160, 'short way round ' + b.length);
});
ok('path: the trail climbs the cliff, nowhere else does', () => {
  const from = { x: 200, y: -60 }, to = { x: 300, y: -186 };
  assert(!NAV.route(nav({ alp: 1 }), from, to).reached, 'no trail: the cliff blocks');
  const r = NAV.route(nav({ trail: 1, alp: 1 }), from, to); assert(r.reached, 'trail: reaches 高山牧场');
});
ok('path: locked plots are fenced, bought ones open at the gate', () => {
  const c = PL.plot('eshore'), mid = { x: (c.rect[0] + c.rect[2]) / 2, y: (c.rect[1] + c.rect[3]) / 2 }, from = { x: 340, y: 150 };
  assert(!NAV.route(nav({}), from, mid).reached); assert(NAV.route(nav({ eshore: 1 }), from, mid).reached);
});
console.log(`plots-test: ${n} ok`);
