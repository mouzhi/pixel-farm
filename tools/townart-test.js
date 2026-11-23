// Unit tests for v5.12.0 (小镇美术升级: town-life.js slots, crossings, walkers; school.js lanes):  node tools/townart-test.js
const assert = require('assert');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const TN = require('../town.js'); globalThis.PFTown = TN;
const TL = require('../town-life.js'), SC = require('../school.js'), SL = require('../slots.js'), HL = require('../hall.js'), FS = require('../festival.js'), MK = require('../market.js'), CR = require('../careers.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const inR = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
const segD = (x, y, a, b) => { const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy, t = L ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L)) : 0; return Math.hypot(x - a.x - vx * t, y - a.y - vy * t); };
const streetD = (x, y) => Math.min(...Object.values(TN.STREETS).map(s => { let d = 1e9; for (let i = 1; i < s.length; i++) d = Math.min(d, segD(x, y, s[i - 1], s[i])); return d; }));
const ALL = Object.fromEntries(HL.LOTS.map(l => [l.id, 1]).concat([['market', 1]]));
const rects = () => TN.BUILDINGS.map(b => [b.id, [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd]]).concat(HL.LOTS.map(l => [l.id, [l.x - l.hw, l.y - l.hd, l.x + l.hw, l.y + l.hd]]), CR.LOTS.map(l => [l.id, [l.x - l.hw, l.y - l.hd, l.x + l.hw, l.y + l.hd]]));
// everything else already standing in the town (props, gift slots, lamps, festival posts, trees, stalls, the fountain)
const things = () => [].concat(
  HL.PROPS.map(p => ['prop:' + p[0], p[1], p[2]]), [['board', HL.BOARD.x, HL.BOARD.y]],
  SL.TOWN.lamp.map(p => ['gift-lamp', p.x, p.y]), SL.TOWN.pot.map(p => ['gift-pot', p.x, p.y]), SL.TOWN.nook.map(p => ['gift-nook', p.x, p.y]),
  TN.LAMPS.map(p => ['lamp', p.x, p.y]), (FS.STREET_POSTS || FS.POSTS).map(p => ['fest-post', p.x, p.y]), FS.RING.map(p => ['ring', p.x, p.y]),
  TN.TREES.map(t => ['tree', t[0], t[1]]), MK.STALLS.map(s => ['stall', s.x, s.y]), [['fountain', TN.PLAZA.x, TN.PLAZA.y]],
  [[622, 58], [676, 58]].map(p => ['bench', p[0], p[1]]), TN.BUILDINGS.filter(b => b.kind === 'house').map(b => ['flowers', b.x - 11, b.y + b.hd + 4]),
  HL.LOTS.map(l => ['flowers', l.x - 13, l.rot ? l.y - l.hd - 4 : l.y + l.hd + 4]), [['bakeryBoard', 620, 183], ['pile', 682, 190], ['anvil', 720, 190], ['libBoard', 719, 47]]);

ok('dressing: every slot is inside the town, off the reserved lots and the playground, clear of streets, roofs and what already stands there', () => {
  assert(TL.DRESS.length >= 24, 'a busy street: ' + TL.DRESS.length);
  for (const d of TL.DRESS) { const id = d.k + '@' + d.x + ',' + d.y;
    assert(TN.inTown(d.x, d.y, -4), id + ' in town');
    for (const r of TN.RESERVED) assert(!inR(d.x, d.y, r.rect, 2), id + ' on ' + r.id);
    assert(!inR(d.x, d.y, SC.YARD, 1), id + ' in the yard');
    if (d.k !== 'awning') { assert(streetD(d.x, d.y) >= 4, id + ' on a street (' + streetD(d.x, d.y).toFixed(1) + ')');
      for (const [bid, r] of rects()) assert(!inR(d.x, d.y, r, 1), id + ' in ' + bid); }
    else { const host = HL.LOTS.find(l => l.id === d.need); assert(host && Math.abs(host.x - d.x) <= 1 && Math.abs((host.rot ? host.y - host.hd : host.y + host.hd) - d.y) <= 2, id + ' on its shop front'); }
    if (d.need) assert(ALL[d.need], id + ' needs ' + d.need);
    for (const [what, x, y] of things()) { const gap = d.k === 'cafe' ? 9 : 5; if (d.k === 'awning') continue; assert(Math.hypot(d.x - x, d.y - y) >= gap, id + ' too near ' + what + ' ' + x + ',' + y); }
  }
  for (let i = 0; i < TL.DRESS.length; i++) for (let j = i + 1; j < TL.DRESS.length; j++) { const a = TL.DRESS[i], b = TL.DRESS[j];
    if (a.k === 'awning' || b.k === 'awning') continue; assert(Math.hypot(a.x - b.x, a.y - b.y) >= 5, a.k + '@' + a.x + ',' + a.y + ' / ' + b.k + '@' + b.x + ',' + b.y); }
  // café tables stay clear of the feast table and its seats
  for (const d of TL.DRESS.filter(q => q.k === 'cafe')) { assert(Math.abs(d.y - FS.TABLE.y) >= 18, 'cafe vs feast ' + d.x + ',' + d.y); assert(inR(d.x, d.y, TN.SQUARE, -6), 'cafe on the square'); }
});
ok('dressing: slots that need a project only show once it is built; the rest show as soon as the town is open', () => {
  const base = TL.dressFor({}), all = TL.dressFor(ALL);
  assert(base.length >= 14 && base.every(d => !d.need)); assert.strictEqual(all.length, TL.DRESS.length);
  assert(!TL.dressFor({ bakery: 9 }).some(d => d.need && d.need !== 'bakery') && TL.dressFor({ bakery: 9 }).filter(d => d.need === 'bakery').length === 2);
});
ok('sign lanterns: lit 17:30-21:00 for the built signs only (a small budget)', () => {
  assert.strictEqual(TL.signLights(ALL, 12 * 60).length, 0); assert.strictEqual(TL.signLights(ALL, 21 * 60).length, 0);
  const l = TL.signLights(ALL, 18 * 60); assert.strictEqual(l.length, TL.DRESS.filter(d => d.k === 'blade').length); assert(l.length <= 8 && l.every(q => q.r <= 12));
  assert.strictEqual(TL.signLights({}, 18 * 60).length, TL.DRESS.filter(d => d.k === 'blade' && !d.need).length);
});
ok('crossings: zebra stripes only on 主街 where a side street meets it, alternating every 1.5 units', () => {
  for (const c of TL.CROSSINGS) { assert(TN.onAvenue(c.x, c.y)); assert(Object.values(TN.STREETS).some(s => s.some(p => p.x === c.x) && s.some(p => p.y !== 66)), 'side street at ' + c.x);
    const marks = []; for (let x = c.x - 5; x <= c.x + 5; x += 0.25) marks.push(TL.crossAt(x, c.y) ? 1 : 0);
    assert(marks.includes(1) && marks.includes(0)); assert(!TL.crossAt(c.x, c.y - 4) && !TL.crossAt(c.x + 7, c.y)); }
  assert(!TL.crossAt(760, 66) && !TL.crossAt(500, 66));
});
ok('walkers: 4 / 6 at prosperity 5 / 8 on market and festival days, half in the rain, nobody out at night', () => {
  const T = 11 * 60;
  assert.strictEqual(TL.lifeCount({ T, lv: 3 }), 4); assert.strictEqual(TL.lifeCount({ T, lv: 5 }), 6);
  assert.strictEqual(TL.lifeCount({ T, lv: 3, market: true }), 8); assert.strictEqual(TL.lifeCount({ T, lv: 5, fest: true }), 8);
  assert.strictEqual(TL.lifeCount({ T, lv: 5, rain: true }), 3); assert.strictEqual(TL.lifeCount({ T: 22 * 60, lv: 5 }), 0); assert.strictEqual(TL.lifeCount({ T: 6 * 60, lv: 5, market: true }), 0);
});
ok('walkers: every stop and edge is walkable with the whole town built, and inside the town', () => {
  const st = Object.assign(HL.empty(), { built: Object.fromEntries(Object.keys(ALL).map(k => [k, 5])) });
  const blk = TN.blocks(true, true).concat(HL.blocks(st), FS.blocks());
  for (const p of TL.STOPS.concat(TL.EDGES)) { assert(TN.inTown(p.x, p.y), JSON.stringify(p)); assert(!blk.some(r => inR(p.x, p.y, r)), 'blocked ' + JSON.stringify(p)); }
  assert(TL.LOOKS.length >= 8 && new Set(TL.LOOKS).size === TL.LOOKS.length);
  const named = new Set(TN.NEIGHBOURS.map(q => q.look).concat(HL.NEIGHBOURS.map(q => q.look)));
  assert(!TL.LOOKS.some(l => named.has(l)), 'walkers never wear a named neighbour\'s clothes');
});
ok('playground: two lanes with lines between, runners keep to their own lane (不串道), all inside the yard', () => {
  const T = SC.TRACK, L = SC.LANES; assert(L && L.length === 3 && L[0] < L[1] && L[1] < L[2]);
  for (let i = 0; i < 8; i++) for (let k = 0; k < 60; k++) { const at = SC.raceAt(i, k * 1.7, 8), o = SC.trackOff(at.x, at.y), lane = i % 2;
    assert(o > L[lane] + 0.3 && o < L[lane + 1] - 0.3, 'runner ' + i + ' off its lane: ' + o.toFixed(2)); assert(SC.inYard(at.x, at.y), 'runner in yard'); }
  assert(SC.onTrack(T.cx + T.rx, T.cy) && SC.onTrack(T.cx, T.cy - T.ry) && !SC.onTrack(T.cx, T.cy) && !SC.onTrack(T.cx + T.rx + L[2] + 2, T.cy));
  assert(SC.inYard(T.cx - T.rx - L[2], T.cy) && SC.inYard(T.cx + T.rx + L[2], T.cy) && SC.inYard(T.cx, T.cy - T.ry - L[2]) && SC.inYard(T.cx, T.cy + T.ry + L[2]));
  // the play things stand in the yard, off the track and apart from each other and the benches
  const ps = SC.PLAY; assert(ps.length >= 5);
  for (const p of ps) { assert(SC.inYard(p.x, p.y, -2), p.k + ' in yard'); if (p.k !== 'goal') assert(SC.trackOff(p.x, p.y) > L[2] + 2, p.k + ' off the track'); else assert(SC.trackOff(p.x, p.y) < L[0] - 1, 'goal in the infield'); }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) >= 10, ps[i].k + '/' + ps[j].k);
});
console.log(n + ' tests passed');
