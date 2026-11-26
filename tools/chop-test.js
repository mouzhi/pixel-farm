// v5.12.7 unit tests: the walkable areas path.js now keeps (areas / areaOf / connected / nearestInArea), which decide
// where people stand to chop a tree and when someone stands off the farm and needs to step back. node tools/chop-test.js
'use strict';
const assert = require('assert');
const N = require('../path.js'), WD = require('../world.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DOOR = N.LAYOUT.DOOR, tree = (x, y) => ({ x, y, stage: 'tree' });
const ring = (cx, cy, rx, ry, k) => Array.from({ length: k }, (_, i) => tree(Math.round(cx + Math.cos(i / k * Math.PI * 2) * rx), Math.round(cy + Math.sin(i / k * Math.PI * 2) * ry)));

t('林场 is joined to the front door through its gate once bought', () => {
  const g = N.build({ regions: ['forest'] });
  assert.ok(N.connected(g, DOOR, { x: 100, y: -60 }));
  assert.ok(N.connected(g, DOOR, { x: 150, y: -80 }));
});
t('a blocked cell (a trunk, a fence rail) belongs to no area', () => {
  const g = N.build({ regions: ['forest'], trees: [tree(60, -70)] });
  assert.strictEqual(N.areaOf(g, 60, -70), -1);
  assert.strictEqual(N.areaOf(g, 0, -70), -1); // 林场's west fence
  assert.ok(!N.connected(g, DOOR, { x: 60, y: -70 }));
});
t('a closed ring of trunks is a pocket of its own', () => {
  const g = N.build({ regions: ['forest'], trees: ring(22, -66, 10, 8, 9) });
  const inside = N.areaOf(g, 22, -66);
  assert.ok(inside >= 0, 'the middle of the ring is walkable');
  assert.notStrictEqual(inside, N.areaOf(g, DOOR.x, DOOR.y), 'but not joined to the farm');
  const out = N.nearestInArea(g, 22, -66, N.areaOf(g, DOOR.x, DOOR.y), 6);
  assert.ok(out && N.connected(g, DOOR, out) && Math.hypot(out.x - 22, out.y - -66) < 24, 'the nearest farm cell is just outside the ring');
});
t('the strip outside 林场\'s west fence is the wrong side for a 林场 tree', () => {
  const g = N.build({ regions: ['forest'], trees: [tree(5, -84)] });
  const home = N.areaOf(g, DOOR.x, DOOR.y), side = WD.areaAt(5, -84);
  assert.strictEqual(side, 'forest');
  // the old stand spot, 8 west of the trunk, lies outside the fence
  assert.notStrictEqual(WD.areaAt(5 - 8, -84 + 2), side);
  // with the same-side test, the nearest stand cell is inside the fence
  const q = N.nearestInArea(g, 5 - 8, -84 + 2, home, 4, (x, y) => WD.areaAt(x, y) === side);
  assert.ok(q && q.x > 0 && WD.areaAt(q.x, q.y) === 'forest' && N.connected(g, DOOR, q), JSON.stringify(q));
});
t('areas are cached per grid build and rebuilt with it', () => {
  const g1 = N.build({ regions: ['forest'] }); assert.strictEqual(N.areas(g1), N.areas(g1));
  const g2 = N.build({ regions: ['forest'], trees: ring(22, -66, 10, 8, 9) });
  assert.notStrictEqual(N.areas(g2), N.areas(g1));
  assert.ok(N.connected(g1, DOOR, { x: 22, y: -66 }) && !N.connected(g2, DOOR, { x: 22, y: -66 }), 'the same spot is open on one map and walled in on the other');
});
console.log(`chop-test: ${n} passed`);
