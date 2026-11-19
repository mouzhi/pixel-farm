// Unit tests for v5.10.3 (slots.js: where the family sets decorations down; the town gifts by kind):  node tools/slots-test.js
const assert = require('assert');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const SL = require('../slots.js'), TN = require('../town.js'), HL = require('../hall.js'), DC = require('../decor.js'), MK = require('../market.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const box = (p, f) => [p.x - f[0], p.y - f[1], p.x + f[0], p.y + f[1]];
const hit = (a, b, pad = 0) => a[0] - pad < b[2] && a[2] + pad > b[0] && a[1] - pad < b[3] && a[3] + pad > b[1];
const FOOT = { lamp: [3.5, 3.5], pot: [3, 3], scarecrow: [4, 4], bench: [6, 3.5], string: [7, 3], nook: [5, 5] };

ok('every decoration has a group; lamps, pots, benches and nooks as planned', () => {
  for (const id of DC.IDS) assert(SL.ORDER.concat('party').includes(SL.group(id)), id);
  assert.strictEqual(SL.group('lamppost'), 'lamp'); assert.strictEqual(SL.group('stonelamp'), 'lamp'); assert.strictEqual(SL.group('flowerpot'), 'pot');
  assert.strictEqual(SL.group('bench'), 'bench'); assert.strictEqual(SL.group('koistatue'), 'nook'); assert.strictEqual(SL.spotsFor('party', []).length, 0);
});
ok('home spots: on the home map, clear of the field, the house, the paths\' middles and of each other', () => {
  const all = []; for (const g of Object.keys(SL.HOME)) for (const p of SL.HOME[g]) all.push({ g, p, b: box(p, FOOT[g]) });
  const field = [72, 56, 120, 88], house = [19.7, 10.7, 68.3, 37.3];
  for (const a of all) { assert(WD.inRect(a.p.x, a.p.y, [-20, -20, 200, 140]), JSON.stringify(a.p)); assert(!hit(a.b, field), a.g + ' in the field ' + JSON.stringify(a.p)); assert(!hit(a.b, house), a.g + ' in the house ' + JSON.stringify(a.p)); }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!hit(all[i].b, all[j].b), JSON.stringify(all[i].p) + ' / ' + JSON.stringify(all[j].p));
  const lampsN = SL.HOME.lamp.filter(p => Math.abs(p.y - 44.5) < 0.1).map(p => p.x); assert(lampsN.length >= 4, 'a row of lamps along the house front and the yard road');
});
ok('spotsFor: the kind\'s own list first, benches and string lights fall back to the nooks, then each little house', () => {
  const L = { door: { x: 300, y: 40 }, foot: [270, 20, 330, 50] };
  const lamps = SL.spotsFor('lamppost', [{ L, m: 0 }]); assert.strictEqual(lamps.length, SL.HOME.lamp.length + 2); assert.strictEqual(lamps[lamps.length - 1].area, 'cottage0');
  const b = SL.spotsFor('bench', []); assert.strictEqual(b.length, SL.HOME.bench.length + SL.HOME.nook.length);
  const m = SL.cottage(L, 1), m0 = SL.cottage(L, 0); assert.strictEqual(m.pot[0].x - 300, -(m0.pot[0].x - 300), 'mirrored');
});
ok('relayout order: lamps, then pots, scarecrows, benches, string lights, the rest; ties by age', () => {
  const o = SL.relayoutOrder([{ u: 5, id: 'bench' }, { u: 3, id: 'shell' }, { u: 9, id: 'lamppost' }, { u: 2, id: 'flowerpot' }, { u: 1, id: 'stonelamp' }]).map(p => p.u);
  assert.deepStrictEqual(o, [1, 9, 2, 5, 3]);
});
ok('town: lamp, pot and nook spots in town, off buildings, lots, the square\'s stalls and each other; gifts by kind', () => {
  const blocks = TN.BUILDINGS.map(b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd]).concat(HL.LOTS.map(l => [l.x - l.hw, l.y - l.hd, l.x + l.hw, l.y + l.hd]), MK.STALLS.map(s => [s.x - MK.HW, s.y - MK.HD, s.x + MK.HW, s.y + MK.HD]));
  const all = [].concat(SL.TOWN.lamp, SL.TOWN.pot, SL.TOWN.nook);
  for (const p of all) { assert(TN.inTown(p.x, p.y), JSON.stringify(p)); for (const b of blocks) assert(!TN.inRect(p.x, p.y, b, 2), JSON.stringify(p)); assert(Math.abs(p.y - 66) > 6, 'off the main street ' + JSON.stringify(p)); }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= 8, JSON.stringify(all[i]) + ' / ' + JSON.stringify(all[j]));
  const pos = SL.townLayout(['bench', 'lamppost', 'flowerpot', 'stonelamp', 'shell']);
  assert.deepStrictEqual(pos, [SL.TOWN.nook[0], SL.TOWN.lamp[0], SL.TOWN.pot[0], SL.TOWN.lamp[1], SL.TOWN.nook[1]]);
  assert(!SL.townRoom(Array(SL.TOWN.lamp.length).fill('lamppost'), 'stonelamp')); assert(SL.townRoom(Array(SL.TOWN.lamp.length).fill('lamppost'), 'bench'));
});
console.log('slots-test: ' + n + ' ok');
