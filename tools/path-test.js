// Node unit tests for grid pathfinding: A*, smoothing, farm obstacles (house / pond / fences), fallback, reachability.
'use strict';
const assert = require('assert');
const NAV = require('../path.js');
const WD = require('../world.js');

let n = 0;
function test(name, fn) { fn(); n++; }

function wallGrid() {
  const g = NAV.makeGrid({ x0: 0, y0: 0, x1: 80, y1: 80 });
  NAV.paintBox(g, 36, 0, 44, 56, NAV.BLOCKED); // a wall with a gap at the south
  return g;
}

test('A* walks around a wall instead of through it', () => {
  const g = wallGrid();
  const r = NAV.route(g, { x: 16, y: 16 }, { x: 64, y: 16 });
  assert.ok(r.points.length >= 2, 'has a path');
  assert.ok(r.reached, 'reaches the goal');
  assert.strictEqual(NAV.blockedAlong(g, r.points).length, 0);
  // the straight line at y=16 crosses the wall at x=36..44; the path must go south around the gap
  const minY = Math.min(...r.points.map(p => p.y));
  assert.ok(minY >= 50 || r.points.some(p => p.y >= 54), 'goes around the south gap, minY=' + minY + ' ' + JSON.stringify(r.points));
  for (const p of r.points) assert.ok(!(p.x > 36 && p.x < 44 && p.y < 56), 'no waypoint inside the wall ' + JSON.stringify(p));
});

test('diagonal steps do not cut a blocked corner', () => {
  const g = NAV.makeGrid({ x0: 0, y0: 0, x1: 48, y1: 48 });
  // two blocked cells that only touch at a corner; a diagonal step through that corner is forbidden
  NAV.paintBox(g, 16, 12, 20, 16, NAV.BLOCKED);
  NAV.paintBox(g, 12, 16, 16, 20, NAV.BLOCKED);
  const r = NAV.route(g, { x: 14, y: 14 }, { x: 22, y: 22 });
  assert.ok(r.reached, 'there is a way around the corner');
  assert.strictEqual(NAV.blockedAlong(g, r.points, 0.4).length, 0);
  assert.ok(!NAV.los(g, 14, 14, 22, 22), 'the direct diagonal through the corner is not line-of-sight');
  // the path must go the long way around (via the open side at x>=20 or y>=20, or the west/north)
  const cuts = r.points.some((p, i) => i && p.x > 12 && p.x < 20 && p.y > 12 && p.y < 20);
  assert.ok(!cuts, 'no waypoint sits in the blocked corner');
});

test('when the goal is inside a block, the path stops at the nearest walkable tile and never enters it', () => {
  const g = wallGrid();
  const r = NAV.route(g, { x: 16, y: 16 }, { x: 40, y: 20 }); // centre of the wall
  assert.strictEqual(NAV.blockedAlong(g, r.points).length, 0);
  const end = r.points[r.points.length - 1];
  const [i, j] = NAV.cellOf(g, end.x, end.y);
  assert.ok(NAV.walkable(g, i, j), 'end is walkable');
  assert.ok(r.fallback || !r.reached, 'reports a fallback');
  assert.ok(Math.hypot(end.x - 40, end.y - 20) < 20, 'ended near the wall, not far away');
});

test('dirt cells are preferred when they are only a little longer', () => {
  const g = NAV.makeGrid({ x0: 0, y0: 0, x1: 80, y1: 48 });
  // a cheap dirt corridor along y=8, and open grass everywhere else
  NAV.paintBox(g, 4, 4, 76, 12, NAV.DIRT);
  const r = NAV.route(g, { x: 8, y: 8 }, { x: 72, y: 8 });
  assert.ok(r.reached);
  const onDirt = r.points.filter(p => Math.abs(p.y - 8) < 6).length;
  assert.ok(onDirt >= r.points.length - 1, 'stays on the dirt lane');
});

test('smoothing keeps line-of-sight and never re-enters a blocked cell', () => {
  const g = wallGrid();
  const r = NAV.route(g, { x: 12, y: 8 }, { x: 68, y: 8 });
  assert.ok(r.points.length < 30, 'smoothed, got ' + r.points.length + ' points');
  for (let i = 0; i < r.points.length - 1; i++) {
    assert.ok(NAV.los(g, r.points[i].x, r.points[i].y, r.points[i + 1].x, r.points[i + 1].y), 'segment ' + i + ' has line of sight');
  }
  assert.strictEqual(NAV.blockedAlong(g, r.points, 0.5).length, 0);
});

function farm(opts) { return NAV.build(Object.assign({ trees: WD.defaultTrees(), regions: [], pens: {}, fence: false, houseTier: 0 }, opts || {})); }

function mustReach(g, a, b, label) {
  const r = NAV.route(g, a, b);
  const hits = NAV.blockedAlong(g, r.points, 0.5);
  assert.strictEqual(hits.length, 0, (label || 'path') + ' entered blocked cells ' + JSON.stringify(hits.slice(0, 3)));
  assert.ok(r.reached, (label || 'path') + ' did not reach the goal, ended at ' + JSON.stringify(r.points[r.points.length - 1]) + ' fallback=' + r.fallback);
  return r;
}

test('the pond fishing stand, well, barn door and stall are reachable from the house door', () => {
  const g = farm(), L = NAV.LAYOUT;
  mustReach(g, L.DOOR, L.POND_STAND, 'door → fishing stand');
  mustReach(g, L.DOOR, L.WELL_SPOT, 'door → well');
  mustReach(g, L.DOOR, L.BARN_DOOR, 'door → barn');
  mustReach(g, L.DOOR, L.STALL_SPOT, 'door → stall');
  mustReach(g, L.POND_STAND, L.BARN_DOOR, 'fishing stand → barn');
});

test('a scripted route around the house never enters the house or the pond', () => {
  const g = farm(), L = NAV.LAYOUT;
  const r = mustReach(g, { x: 10, y: 24 }, L.BARN_DOOR, 'west of house → barn');
  const box = NAV.houseBox(0);
  for (const p of r.points) {
    assert.ok(!(p.x > box.x0 + 0.4 && p.x < box.x1 - 0.4 && p.y > box.y0 + 0.4 && p.y < box.y1 - 0.4), 'waypoint inside the house ' + JSON.stringify(p));
  }
  const hits = NAV.blockedAlong(g, r.points, 0.4);
  assert.strictEqual(hits.length, 0);
  // the straight line from (10, 24) to the barn door crosses the house; the path must bow south (or north) around it
  const maxY = Math.max(...r.points.map(p => p.y));
  assert.ok(maxY >= box.y1 - 1, 'goes around the house (south), maxY=' + maxY + ' house.y1=' + box.y1);
});

test('a scripted route from the fishing stand to the door goes around the pond, not through it', () => {
  const g = farm(), L = NAV.LAYOUT, P = L.POND;
  const r = mustReach(g, L.POND_STAND, L.DOOR, 'fishing stand → door');
  for (const p of r.points) {
    const e = ((p.x - P.x) / P.rx) ** 2 + ((p.y - P.y) / P.ry) ** 2;
    assert.ok(e >= 0.98, 'waypoint in the pond ' + JSON.stringify(p) + ' e=' + e);
  }
  assert.strictEqual(NAV.blockedAlong(g, r.points, 0.4).length, 0);
});

test('a scripted route from west of the home fence into the field goes around the fence, not through it', () => {
  const g = farm();
  const r = mustReach(g, { x: -16, y: 80 }, { x: 90, y: 70 }, 'west of fence → field');
  // the west fence stands at x=2, y=56..120; the path may only cross near a post gap (there is none) or go around north/south
  const crossings = [];
  const pts = r.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((a.x - 2) * (b.x - 2) <= 0 && Math.abs(a.x - b.x) > 0.01) {
      const t = (2 - a.x) / (b.x - a.x), y = a.y + t * (b.y - a.y);
      if (y > 56 && y < 120) crossings.push({ y, a, b });
    }
  }
  assert.strictEqual(crossings.length, 0, 'crossed the west fence ' + JSON.stringify(crossings));
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  assert.ok(minY <= 56 || maxY >= 120, 'went around the fence north or south, y=' + minY + '..' + maxY);
});

test('locked forest is fenced off; buying it opens the gate', () => {
  const locked = farm({ regions: [] }), open = farm({ regions: ['forest'] });
  const gate = WD.ROUTES.forest[WD.ROUTES.forest.length - 1];
  const center = WD.region('forest').center;
  const a = NAV.route(locked, NAV.LAYOUT.DOOR, center);
  assert.ok(!a.reached, 'cannot reach the locked forest centre');
  const b = mustReach(open, NAV.LAYOUT.DOOR, gate, 'door → open forest gate');
  assert.ok(b.reached);
  const c = mustReach(open, NAV.LAYOUT.DOOR, { x: 100, y: -50 }, 'door → just inside the forest');
  assert.ok(c.reached);
});

test('a bigger house blocks a wider footprint, and the door stays walkable', () => {
  const g0 = farm({ houseTier: 0 }), g3 = farm({ houseTier: 3 });
  const box0 = NAV.houseBox(0), box3 = NAV.houseBox(3);
  assert.ok(box3.x0 < box0.x0 && box3.x1 > box0.x1, 'tier 3 is wider');
  mustReach(g3, NAV.LAYOUT.DOOR, NAV.LAYOUT.WELL_SPOT, 'door still works at tier 3');
  const r = NAV.route(g3, { x: -4, y: 24 }, { x: 80, y: 24 });
  assert.ok(r.reached);
  assert.strictEqual(NAV.blockedAlong(g3, r.points, 0.4).length, 0);
  const [iw, jw] = NAV.cellOf(g3, (box3.x0 + box3.x1) / 2, (box3.y0 + box3.y1) / 2);
  assert.ok(!NAV.walkable(g3, iw, jw), 'the house interior is blocked');
});

test('pen fences (once bought) are solid except at the door, and the sty door stays reachable', () => {
  const g = farm({ regions: ['forest'], pens: { sty: true }, fence: true });
  const door = WD.PENS.sty.door;
  mustReach(g, NAV.LAYOUT.DOOR, door, 'door → sty door');
  // a point on the north rail of the sty fence, away from the door / road gap, should be blocked
  const P = WD.PENS.sty, y = P.roam[1] - 4, x = (P.roam[0] + P.roam[2]) / 2;
  if (Math.hypot(x - P.door.x, y - P.door.y) > 12) {
    const [i, j] = NAV.cellOf(g, x, y);
    assert.ok(!NAV.walkable(g, i, j) || NAV.pathDist(x, y, ['forest']) < 7, 'sty fence blocks the rail (or sits on a road gap)');
  }
});

test('the coast fishing stand is reachable along the pier once the beach is open, and the sea stays blocked', () => {
  const g = farm({ regions: ['south', 'coast'] });
  const stand = WD.region('coast').fish.stand;
  mustReach(g, WD.region('coast').gate, stand, 'coast gate → pier stand');
  const sea = WD.seaAt(300, 280);
  assert.strictEqual(sea, 'water');
  const [i, j] = NAV.cellOf(g, 300, 280);
  assert.ok(!NAV.walkable(g, i, j), 'open sea is blocked');
});

test('path cache returns the same waypoints and clears on demand', () => {
  const g = farm(), L = NAV.LAYOUT;
  const a = NAV.route(g, L.DOOR, L.POND_STAND);
  const b = NAV.route(g, L.DOOR, L.POND_STAND);
  assert.deepStrictEqual(a.waypoints, b.waypoints);
  assert.ok(g.cache.size >= 1);
  NAV.clearCache(g);
  assert.strictEqual(g.cache.size, 0);
  const c = NAV.route(g, L.DOOR, L.POND_STAND);
  assert.deepStrictEqual(a.points.map(p => [p.x, p.y]), c.points.map(p => [p.x, p.y]));
});

test('a hundred routes on the full farm stay off blocked tiles and finish quickly', () => {
  const g = farm({ regions: WD.REGION_IDS, pens: { coop: true, sty: true, fold: true, shed: true }, fence: true, houseTier: 1 });
  const L = NAV.LAYOUT;
  const goals = [L.DOOR, L.BARN_DOOR, L.WELL_SPOT, L.STALL_SPOT, L.POND_STAND, L.BENCH_SPOT,
    WD.region('forest').gate, WD.region('east').gate, WD.region('orchard').gate, WD.region('south').gate,
    WD.region('pasture').gate, WD.PENS.coop.door, WD.PENS.sty.door, WD.region('coast').fish.stand];
  const t0 = Date.now();
  let reached = 0;
  for (let i = 0; i < 100; i++) {
    const a = goals[i % goals.length], b = goals[(i * 7 + 3) % goals.length];
    const r = NAV.route(g, a, b);
    assert.strictEqual(NAV.blockedAlong(g, r.points, 0.5).length, 0, 'route ' + i + ' from ' + JSON.stringify(a) + ' to ' + JSON.stringify(b));
    if (r.reached) reached++;
  }
  const ms = Date.now() - t0;
  assert.ok(reached >= 90, 'almost every pair is reachable, got ' + reached);
  assert.ok(ms < 800, '100 routes should be well under a second, took ' + ms + 'ms');
});

console.log('ok — ' + n + ' path tests');
