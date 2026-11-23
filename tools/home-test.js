// Unit tests for phase 11 (v5.9.0, home.js + the v15 save):  node tools/home-test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const TN = require('../town.js'), HM = require('../home.js'), SAVE = require('../save.js'), SIM = require('../sim.js'), PL = require('../plots.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const rng = seed => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const FIX = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v10-day59-manor.json'), 'utf8'));

ok('the phase-7 stub and home.js agree: 6 tiles, help at most twice a day for an hour', () => {
  assert.deepStrictEqual(HM.HS, { tiles: PL.HOMESTEAD.tiles, helpPerDay: PL.HOMESTEAD.helpPerDay, helpMinutes: PL.HOMESTEAD.helpMinutes });
  assert.strictEqual(HM.TILE_AT.length, HM.HS.tiles); assert.strictEqual(HM.GARDEN.length, HM.HS.tiles);
  assert.strictEqual(HM.HELP.perDay, 2); assert.strictEqual(HM.HELP.minutes, 60);
});
ok('closeness grows slowly: a school day +1 each, +2 with the 同桌, capped at 100; a classmate visit +5', () => {
  const st = HM.empty(), r = rng(3); const desk = HM.schoolDay(st, 'kid0', r, false);
  for (const id of HM.MATE_IDS) assert.strictEqual(st.rel.kid0[id], id === desk ? 3 : 1, id);
  assert.deepStrictEqual(st.nb, {}, 'no teacher before the town');
  HM.schoolDay(st, 'kid0', r, true); assert.strictEqual(st.nb.n1, 1, '林老师 once the school is in town');
  HM.visit(st, 'kid0', 'm2'); assert(st.rel.kid0.m2 >= 6);
  for (let i = 0; i < 200; i++) HM.schoolDay(st, 'kid0', r, true); for (const id of HM.MATE_IDS) assert.strictEqual(st.rel.kid0[id], 100);
  // the whole school stretch (days 17..43 = 26 days) alone gets the closest classmate to about 40-50, not to 80: they marry as teens
  const s2 = HM.empty(), r2 = rng(9); for (let d = 0; d < 26; d++) HM.schoolDay(s2, 'kid0', r2, true);
  const b = HM.best(s2, 'kid0'); assert(b.v >= 30 && b.v < HM.REL.close, 'school alone ' + b.v);
});
ok('levels and notes', () => {
  assert.deepStrictEqual([0, 1, 19, 20, 49, 50, 79, 80, 100].map(HM.levelOf), ['还不熟', '认识', '认识', '熟悉', '熟悉', '要好', '要好', '走得很近', '走得很近']);
  const st = HM.empty(); assert.strictEqual(HM.kidNote(st, 'kid0', '小豆'), '');
  st.rel.kid0 = { m0: 12, m1: 55 }; assert.strictEqual(HM.kidNote(st, 'kid0', '小豆'), '小豆和朵朵要好（55）');
  st.wed.kid0 = { mate: 'm1', day: 80, moved: 0, house: 0 }; assert.strictEqual(HM.kidNote(st, 'kid0', '小豆'), '小豆今晚和朵朵办婚礼');
  st.wed.kid0.moved = 80; assert.strictEqual(HM.kidNote(st, 'kid0', '小豆'), '小豆和朵朵成家了，住在新房子');
  assert.deepStrictEqual(HM.kidRel(st, 'kid0').map(r => r.name), ['朵朵', '阿团', '石头']);
});
ok('best: ties follow each child\'s fixed order; a married classmate is nobody else\'s', () => {
  const st = HM.empty(); st.rel.kid0 = { m0: 50, m1: 50, m2: 50 }; st.rel.kid1 = { m0: 50, m1: 50, m2: 50 };
  assert.strictEqual(HM.best(st, 'kid0').id, 'm1'); assert.strictEqual(HM.best(st, 'kid1').id, 'm0');
  st.wed.kid0 = { mate: 'm0', day: 1, moved: 1, house: 0 }; assert.strictEqual(HM.best(st, 'kid1').id, 'm2');
});
ok('wedReady: a teen, a free built house, a fine day, 3 days after the last wedding, closeness 80', () => {
  const st = HM.empty(); st.rel.kid0 = { m1: 80 }; const base = { kid: { id: 'kid0' }, stage: 'teen', house: true, rain: false, lastWed: 0, day: 90 };
  assert.strictEqual(HM.wedReady(st, base), 'm1');
  assert.strictEqual(HM.wedReady(st, Object.assign({}, base, { stage: 'helper' })), null);
  assert.strictEqual(HM.wedReady(st, Object.assign({}, base, { house: false })), null);
  assert.strictEqual(HM.wedReady(st, Object.assign({}, base, { rain: true })), null);
  assert.strictEqual(HM.wedReady(st, Object.assign({}, base, { lastWed: 88 })), null);
  assert.strictEqual(HM.wedReady(st, Object.assign({}, base, { lastWed: 87 })), 'm1');
  st.rel.kid0.m1 = 79; assert.strictEqual(HM.wedReady(st, base), null);
});
ok('help: about every other day, never while their own tiles need them, 09:00-16:00, a second hour only when the main farm is behind', () => {
  const r = () => 0.99, yes = () => 0, c = { T: 10 * 60, backlog: 0, own: 0, helpDay: true }, w = o => Object.assign({}, c, o);
  assert.strictEqual(HM.helpNow(null, c, 5, r), false); assert.strictEqual(HM.helpNow(null, c, 5, yes), true);
  assert.strictEqual(HM.helpNow(null, w({ helpDay: false, backlog: 20 }), 5, yes), false, 'not a help day');
  assert.strictEqual(HM.helpNow(null, w({ backlog: 6 }), 5, r), true);
  assert.strictEqual(HM.helpNow(null, w({ own: 1, backlog: 9 }), 5, yes), false);
  assert.strictEqual(HM.helpNow(null, w({ T: 8 * 60 }), 5, yes), false); assert.strictEqual(HM.helpNow(null, w({ T: 16 * 60 }), 5, yes), false);
  assert.strictEqual(HM.helpNow({ day: 5, n: 1, last: 8 * 60 }, c, 5, yes), false, 'second hour: only with a backlog');
  assert.strictEqual(HM.helpNow({ day: 5, n: 1, last: 9 * 60 }, w({ backlog: 6 }), 5, yes), false, '2 h apart');
  assert.strictEqual(HM.helpNow({ day: 5, n: 1, last: 8 * 60 }, w({ backlog: 6 }), 5, yes), true);
  assert.strictEqual(HM.helpNow({ day: 5, n: 2, last: 0 }, w({ backlog: 9 }), 5, yes), false);
  assert.strictEqual(HM.helpNow({ day: 4, n: 2, last: 0 }, c, 5, yes), true);
});
ok('shop: 新房子 is a build, two levels (5000+200 wood, 6500+240), gated on 阿禾, a site and room', () => {
  const it = SIM.shopItem('cottage'); assert(it && it.p11);
  assert.deepStrictEqual(it.levels.map(l => [l.cost, l.wood]), [[5000, 200], [6500, 240]]);
  assert(SIM.SHOP_TABS.find(t => t.id === 'build').ids.includes('cottage'));
  assert.strictEqual(HM.houseGate({ moved: 0 }), '阿禾搬来以后才盖新房子');
  assert.strictEqual(HM.houseGate({ moved: 1, have: 0, sites: 0 }), HM.SITE_HINT);
  assert(/放不下/.test(HM.houseGate({ moved: 1, have: 0, sites: 1, room: 0 })));
  assert.strictEqual(HM.houseGate({ moved: 1, have: 0, sites: 1, room: 1 }), null);
  assert.strictEqual(SIM.effects({ cottage: 2 }).cottage, 2);
});
ok('sites: only bought 花甸/农田 on ordinary ground; the yard fits inside the plot and keeps clear of the gate and the field block', () => {
  assert.deepStrictEqual(HM.freeSites({}, []), []);
  const plots = { glade: { mod: 'meadow' }, eslope: { mod: 'field' }, play: { mod: 'meadow' } };
  const free = HM.freeSites(plots, []); assert(free.includes('glade') && free.includes('eslope'));
  assert.deepStrictEqual(HM.freeSites(plots, [{ site: 'glade' }]).includes('glade'), false);
  const fits = {};
  for (const p of PL.PLOTS) for (const mod of ['meadow', 'field']) { if (!PL.homesteadSites({ [p.id]: { mod } }).length) continue;
    const s = HM.spotsIn(p.id, mod, []); if (!s.length) continue; (fits[mod] = fits[mod] || []).push(p.id);
    for (const q of s.slice(0, 6)) { const L = HM.layout(Object.assign({ site: p.id }, q)), r = p.rect;
      assert(L.foot[0] >= r[0] && L.foot[2] <= r[2] && L.foot[1] >= r[1] && L.foot[3] <= r[3], p.id + ' inside');
      if (p.gate) assert(!HM.inBox(p.gate, L.foot, 10), p.id + ' gate clear'); } }
  assert(fits.meadow.length >= 4, 'meadow ' + fits.meadow); assert(fits.field.length >= 2, 'field ' + fits.field);
  const L = HM.layout({ x: 0, y: 0, m: 0 }), M = HM.layout({ x: 0, y: 0, m: 1 });
  assert.strictEqual(L.tiles.length, 6); assert(L.tiles.every((t, i) => t.x === -M.tiles[i].x), 'mirrored');
  assert(!L.tiles.some(t => HM.inBox(t, L.block)), 'tiles off the house');
  // the house (20 x 14) is clearly bigger than the hen house and keeps clear of it, the tiles, the bench and the door inside the yard
  for (const Q of [L, M]) { const area = b => (b[2] - b[0]) * (b[3] - b[1]);
    assert(area(Q.block) >= 3 * area(Q.coopBlock), 'house well bigger than the hen house');
    assert(!HM.boxHit(Q.block, Q.coopBlock, 2), 'hen house clear of the house');
    assert(Q.tiles.every(t => !HM.boxHit(Q.block, [t.x - 4, t.y - 4, t.x + 4, t.y + 4], 1.5)), 'tiles clear of the house');
    assert(!HM.inBox(Q.door, Q.block) && !HM.inBox(Q.bench, Q.block, 1) && Q.door.y > Q.block[3] + 2, 'door and bench out front');
    for (const b of [Q.block, Q.coopBlock]) assert(b[0] >= Q.foot[0] && b[2] <= Q.foot[2] && b[1] >= Q.foot[1] && b[3] <= Q.foot[3], 'inside the yard');
    assert(Q.tiles.every(t => t.x - 4 >= Q.foot[0] && t.x + 4 <= Q.foot[2]), 'tiles inside the yard'); }
  assert.deepStrictEqual([HM.HOUSE.hw * 2, HM.HOUSE.hd * 2], [20, 14]);
});
ok('valid: clamps, unique sites, no shared spouse, a married child lives in their house', () => {
  const bad = { houses: [{ site: 'glade', x: -68, y: 160, built: 60, kid: 'kid0', tiles: [{ t: 1, c: { type: 'carrot', age: 2 } }, { c: { type: 'gold' } }] }, { site: 'glade', x: 0, y: 0 }, { site: 'nowhere', x: 0, y: 0 }],
    rel: { kid0: { m0: 300, m1: -5, zz: 9 } }, nb: { n0: 12, n99: 4 },
    wed: { kid0: { mate: 'm1', day: 70, moved: 70, house: 0 }, kid1: { mate: 'm1', day: 71, moved: 71, house: 0 } }, help: { kid0: { day: 72, n: 9 } }, earn: -1 };
  const v = HM.valid(bad);
  assert.strictEqual(v.houses.length, 1); assert.strictEqual(v.houses[0].tiles.length, 6); assert.deepStrictEqual(v.houses[0].tiles[1], { t: 0, w: 0, c: null });
  assert.strictEqual(v.houses[0].tiles[0].c.type, 'carrot'); assert.deepStrictEqual(v.rel.kid0, { m0: 100 }); assert.deepStrictEqual(v.nb, { n0: 12 });
  assert.deepStrictEqual(Object.keys(v.wed), ['kid0']); assert.strictEqual(v.houses[0].kid, 'kid0'); assert.strictEqual(v.help.kid0.n, 2); assert.strictEqual(v.earn, 0);
  assert.deepStrictEqual(HM.valid(JSON.parse(JSON.stringify(v))), v, 'round-trips');
  assert.deepStrictEqual(HM.valid(null), HM.empty()); assert.deepStrictEqual(HM.valid({ wed: { kid0: { mate: 'm0', moved: 3 } } }).wed, {}, 'no house: no wedding');
});
ok('save: the day-59 manor fixture (v10) migrates to v15 with nobody married and the new house unbought', () => {
  const raw = FIX(), s = SAVE.migrate(JSON.parse(JSON.stringify(raw)));
  assert.strictEqual(SAVE.CURRENT, 15); assert.strictEqual(s.saveVersion, 15); assert.deepStrictEqual(s.home, HM.empty()); assert.strictEqual(s.upgrades.cottage, 0);
  for (const k of Object.keys(raw.upgrades)) assert.strictEqual(s.upgrades[k], raw.upgrades[k], k);
  assert.strictEqual(s.coins, raw.coins); assert.strictEqual(s.clock.day, raw.clock.day);
  const v = SAVE.validate(s); assert.deepStrictEqual(v.home, HM.empty()); assert.strictEqual(v.upgrades.cottage, 0);
  assert(SAVE.UPGRADE_IDS.indexOf('cottage') === SAVE.UPGRADE_IDS.length - 1 - require('../yard.js').IDS.length, 'append-only: cottage last before the v5.10.3 yard things');
});
ok('save: a v14 save gains only the homestead (and cottage 0); a v15 homestead round-trips', () => {
  const v14 = SAVE.migrate(FIX()); delete v14.home; delete v14.upgrades.cottage; v14.saveVersion = 14;
  const s = SAVE.migrate(JSON.parse(JSON.stringify(v14))); const a = Object.assign({}, s); delete a.home; delete a.saveVersion; a.upgrades = Object.assign({}, a.upgrades); delete a.upgrades.cottage;
  const b = Object.assign({}, v14); delete b.saveVersion; assert.deepStrictEqual(a, b);
  s.home = HM.valid({ houses: [{ site: 'glade', x: -68, y: 160, m: 1, d: 60, built: 61, kid: 'kid0', tiles: [], eggs: 70, hens: 2 }], rel: { kid0: { m1: 86 }, kid1: { m0: 20 } }, nb: { n1: 9 },
    wed: { kid0: { mate: 'm1', day: 70, moved: 70, house: 0 } }, help: { kid0: { day: 71, n: 1, last: 600, until: 660 } }, teen: { kid0: 66 }, earn: 140 }); s.upgrades.cottage = 1;
  const back = SAVE.validate(JSON.parse(JSON.stringify(s))); assert.deepStrictEqual(back.home, s.home); assert.strictEqual(back.upgrades.cottage, 1);
});
ok('sites: a bought first-ring field (东田) is a move target, not a shop buy site', () => {
  const WD = require('../world.js'), NAV = require('../path.js'), DC = require('../decor.js');
  assert.strictEqual(HM.siteAt(280, 36), 'east');
  assert.strictEqual(HM.siteName('east'), '东田');
  assert.strictEqual(HM.siteAt(36, 40), 'home');
  assert.strictEqual(HM.siteAt(396, 128), 'eshore');
  assert.deepStrictEqual(HM.freeSites({ east: { mod: 'field' }, eshore: { mod: 'field' } }, []), ['eshore']);
  assert.strictEqual(HM.siteOwned('east', { eshore: { mod: 'field' } }, []), false);
  assert.strictEqual(HM.siteOwned('east', {}, ['east']), true);
  assert.strictEqual(HM.siteAllowsHouse('east', {}), true);
  assert.strictEqual(HM.siteAllowsHouse('home', {}), true);
  assert.strictEqual(HM.siteAllowsHouse('eshore', { eshore: { mod: 'workshop' } }), false);
  assert.strictEqual(HM.siteAllowsHouse('eroad', { eroad: { mod: 'road' } }), false);
  const field = HM.fieldBox('east', 'field');
  assert(field, 'east has a field block');
  assert(field[0] < 256 && field[2] > 256 && field[1] < 68 && field[3] > 68, 'sprinkler mid-field sits in the block ' + field);
  const grass = HM.spotsIn('east', 'field', []);
  assert(grass.length >= 8, 'east has room on the grass ' + grass.length);
  assert(grass.every(s => !HM.boxHit(HM.layout(s).foot, field)), 'no spot overlaps the 农田');
  assert(grass.every(s => s.y < field[1] || s.y > field[3]), 'spots sit north or south of the crops');
  const north = grass.filter(s => s.y < field[1]);
  assert(north.length >= 4, 'room north of the 东田 crops (the grass the player pointed at)');
});
ok('moveOk: the house at 东南滩 can go into 东田 grass, and rejects name the obstacle', () => {
  const h = { site: 'eshore', x: 396, y: 128, m: 0, built: 87 };
  const trees = require('../world.js').EXTRA_TREES.filter(t => t.stage === 'tree' || !t.stage).map(t => [t.x - 5, t.y - 4, t.x + 5, t.y + 4]);
  const ctx = { plots: { eshore: { mod: 'field' }, eslope: { mod: 'meadow' } }, regions: ['east'], houses: [], avoid: trees };
  const okGrass = HM.moveOk(280, 36, h, ctx);
  assert(okGrass.ok, 'north grass should take the house: ' + okGrass.why);
  assert.strictEqual(okGrass.spot.site, 'east');
  assert(okGrass.spot.y < 56, 'snaps onto the north grass, not the crops ' + okGrass.spot.y);
  const fieldHit = HM.moveOk(272, 68, h, ctx);
  assert.strictEqual(fieldHit.ok, false);
  assert(/农田/.test(fieldHit.why), 'clicking the crops says so: ' + fieldHit.why);
  const unbought = HM.moveOk(280, 36, h, Object.assign({}, ctx, { regions: [] }));
  assert.strictEqual(unbought.ok, false);
  assert(/还没买下东田/.test(unbought.why), unbought.why);
  const road = HM.moveOk(352, 66, h, ctx);
  assert.strictEqual(road.ok, false);
  assert(/路/.test(road.why), 'the lane between 东田 and 东南滩: ' + road.why);
  const taken = HM.moveOk(280, 36, h, Object.assign({}, ctx, { houses: [{ site: 'east', x: 280, y: 36 }] }));
  assert.strictEqual(taken.ok, false);
  assert(/已经有一座新房子/.test(taken.why), taken.why);
  const keep = HM.valid({ houses: [{ site: 'east', x: okGrass.spot.x, y: okGrass.spot.y, m: okGrass.spot.m, d: 90, built: 90, tiles: [] }] });
  assert.strictEqual(keep.houses.length, 1); assert.strictEqual(keep.houses[0].site, 'east');
  assert.strictEqual(keep.houses[0].x, okGrass.spot.x); assert.strictEqual(keep.houses[0].y, okGrass.spot.y);
  assert.deepStrictEqual(HM.valid(JSON.parse(JSON.stringify(keep))), keep, 'east site round-trips on v15');
});
ok('moveOk + pathing: a house in 东田 keeps the farm door, well and warehouse reachable, and its own door is on a path', () => {
  const NAV = require('../path.js'), DC = require('../decor.js'), WD = require('../world.js');
  const h = { site: 'eshore', x: 396, y: 128, m: 0, built: 87 };
  const trees = WD.defaultTrees().filter(t => t.stage === 'tree').concat(WD.EXTRA_TREES);
  const avoid = trees.map(t => [t.x - 5, t.y - 4, t.x + 5, t.y + 4]);
  const r = HM.moveOk(280, 36, h, { plots: { eshore: { mod: 'field' } }, regions: ['east', 'forest', 'orchard', 'south', 'pasture', 'coast'], houses: [], avoid });
  assert(r.ok, 'still fits with the real trees: ' + (r.why || '') + ' ' + JSON.stringify(r.spot));
  const L = HM.layout(Object.assign({}, h, r.spot));
  const g = NAV.build({ trees: trees.filter(t => t.stage === 'tree'), regions: ['east', 'forest', 'orchard', 'south', 'pasture', 'coast'], pens: {}, fence: true, houseTier: 3, blocks: [L.block] });
  const to = (a, b) => NAV.route(g, a, b);
  const door = L.door, farm = NAV.LAYOUT.DOOR, well = NAV.LAYOUT.WELL_SPOT, barn = NAV.LAYOUT.BARN_DOOR, gate = WD.region('east').gate;
  assert(to(farm, door).reached || to(gate, door).reached, 'door reachable from the farm or the 东田 gate');
  assert(to(farm, well).reached, 'well still reachable');
  assert(to(farm, barn).reached, 'warehouse still reachable');
  assert(DC.keepsPaths(g, [0, 0, 0, 0], [farm, well, barn, door, gate], farm), 'sanity: empty box keeps paths');
  // the house block is already in the grid; a second copy must not cut the farm entries
  assert(DC.keepsPaths(NAV.build({ trees: trees.filter(t => t.stage === 'tree'), regions: ['east', 'forest', 'orchard', 'south', 'pasture', 'coast'], pens: {}, fence: true, houseTier: 3 }), L.block, [farm, well, barn, gate], farm), 'placing it does not cut the farm paths');
});
ok('v5.12.1: 宅园 pads are home sites; 4 houses fit; old houses elsewhere are kept; shop still sells two', () => {
  assert.strictEqual(HM.HOUSE.max, 6); assert.strictEqual(HM.HOUSE.levels.length, 2);
  assert.strictEqual(HM.siteAt(258, 142), 'nhome0'); assert.strictEqual(HM.siteAt(302, 180), 'nhome3');
  assert.strictEqual(HM.siteName('nhome0'), '宅园·度假村北（西北）');
  assert.strictEqual(HM.padPlot('nhome2'), 'nhome');
  assert.strictEqual(HM.siteOwned('nhome0', {}, []), false);
  assert.strictEqual(HM.siteOwned('nhome0', { nhome: { mod: 'homestead', day: 1 } }, []), true);
  assert.strictEqual(HM.siteAllowsHouse('nhome0', { nhome: { mod: 'homestead' } }), true);
  assert.strictEqual(HM.siteAllowsHouse('nhome0', {}), false);
  assert.strictEqual(HM.isHomeSite('nhome'), false, 'the plot itself is not a house site');
  assert.strictEqual(HM.isHomeSite('nhome0'), true);
  const plots = { nhome: { mod: 'homestead', day: 40 }, glade: { mod: 'meadow', day: 20 }, eshore: { mod: 'field', day: 30 } };
  const free = HM.freeSites(plots, []);
  assert.deepStrictEqual(free.filter(id => HM.isPadId(id)), ['nhome0', 'nhome1', 'nhome2', 'nhome3']);
  assert(free.includes('glade') && free.includes('eshore'));
  assert(free[0] === 'nhome0', 'pads are offered before ordinary plots: ' + free[0]);
  const oldHouse = { site: 'glade', x: -68, y: 160, m: 1, d: 60, built: 61, kid: 'kid0', tiles: [], eggs: 70, hens: 2 };
  const v = HM.valid({ houses: [oldHouse, { site: 'nhome0', x: 258, y: 142, m: 1, d: 80, built: 80, tiles: [] }, { site: 'nhome1', x: 302, y: 142, m: 0, d: 80, built: 80, tiles: [] }, { site: 'nhome2', x: 258, y: 180, m: 1, d: 81, built: 0, tiles: [] }, { site: 'nhome3', x: 302, y: 180, m: 0, d: 81, built: 0, tiles: [] }, { site: 'eshore', x: 396, y: 128, m: 0, d: 70, built: 70, tiles: [] }],
    wed: { kid0: { mate: 'm1', day: 70, moved: 70, house: 0 } } });
  assert.strictEqual(v.houses.length, 6, 'cap raised to 6');
  assert.strictEqual(v.houses[0].site, 'glade'); assert.strictEqual(v.houses[0].kid, 'kid0');
  assert.deepStrictEqual(v.houses.map(h => h.site).sort(), ['eshore', 'glade', 'nhome0', 'nhome1', 'nhome2', 'nhome3']);
  assert.deepStrictEqual(HM.valid(JSON.parse(JSON.stringify(v))), v, '6 houses including old+pads round-trip');
});
ok('v5.12.1 moveOk: snap to a free 宅园 pad; a taken pad is refused; unbought 宅园 is refused; glade houses stay put', () => {
  const h = { site: 'glade', x: -68, y: 160, m: 1, built: 61 };
  const ctx = { plots: { nhome: { mod: 'homestead', day: 40 }, glade: { mod: 'meadow', day: 20 } }, regions: ['east', 'coast'], houses: [], avoid: [] };
  const okPad = HM.moveOk(258, 142, h, ctx);
  assert(okPad.ok, 'empty pad takes the house: ' + okPad.why);
  assert.strictEqual(okPad.spot.site, 'nhome0');
  assert.deepStrictEqual([okPad.spot.x, okPad.spot.y, okPad.spot.m], [258, 142, 1]);
  const snap = HM.moveOk(270, 150, h, ctx);
  assert(snap.ok && snap.spot.site === 'nhome0', 'click near the pad snaps onto it: ' + (snap.why || snap.spot.site));
  const taken = HM.moveOk(258, 142, h, Object.assign({}, ctx, { houses: [{ site: 'nhome0', x: 258, y: 142 }] }));
  assert.strictEqual(taken.ok, false);
  assert(/已经有一座新房子|这个房基/.test(taken.why), taken.why);
  const other = HM.moveOk(302, 180, h, Object.assign({}, ctx, { houses: [{ site: 'nhome0', x: 258, y: 142 }] }));
  assert(other.ok && other.spot.site === 'nhome3', 'a free pad on the same plot is fine');
  const locked = HM.moveOk(258, 142, h, { plots: { glade: { mod: 'meadow' } }, regions: [], houses: [], avoid: [] });
  assert.strictEqual(locked.ok, false);
  assert(/还没买下/.test(locked.why), locked.why);
  // an existing house on 林间空地 is still valid after the new plot exists
  const keep = HM.valid({ houses: [{ site: 'glade', x: -68, y: 160, m: 1, d: 60, built: 61, tiles: [] }] });
  assert.strictEqual(keep.houses[0].site, 'glade');
});
console.log(`home-test: ${n} ok`);
