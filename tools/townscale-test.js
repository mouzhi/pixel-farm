// v5.11.0 小镇放大: the new town layout holds together (node tools/townscale-test.js)
// Every building / lot / stall / reserved lot sits inside the town, none overlap, none sit on a street, every door is
// reached by a street spur, the 农家乐区 ground is empty, gift slots did not shrink, the feast has 20 seats on its own square.
'use strict';
const assert = require('assert');
const WD = require('../world.js'), TN = require('../town.js'), HL = require('../hall.js'), CR = require('../careers.js'), MK = require('../market.js');
const FE = require('../festival.js'), SL = require('../slots.js'), SC = require('../school.js'), PL = require('../plots.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const inR = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
const rectOf = b => [b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd];
const hit = (a, b, pad = 0) => a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad;
const segD = (px, py, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1; let t = ((px - a.x) * dx + (py - a.y) * dy) / l; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a.x - t * dx, py - a.y - t * dy); };
const streets = Object.assign({}, TN.STREETS, CR.STREETS || {});
const streetD = (x, y) => { let d = 1e9; for (const k in streets) { const L = streets[k]; for (let i = 0; i < L.length - 1; i++) d = Math.min(d, segD(x, y, L[i], L[i + 1])); } return d; };

// the map
ok(WD.WORLD.x1 === 1008 && WD.WORLD.x0 === -256, 'map runs -256..1008');
ok((WD.WORLD.x1 - WD.WORLD.x0) / 8 === 158 && (WD.WORLD.y1 - WD.WORLD.y0) / 8 === 74, '158 x 74 tiles');
ok(TN.RECT[2] - TN.RECT[0] === 384 && TN.RECT[3] - TN.RECT[1] === 308, 'town 384 x 308');
ok(TN.RECT[1] > PL.ridgeY(700) + 4, 'town north edge below the cliff');
ok(TN.GATE.x < TN.RECT[0] && TN.GATE.y === 66, 'gate at the west edge on the main street');
ok(PL.TOWN.gate.x === TN.GATE.x, 'the closed gate (expansion.js) stands at the new gate');

// buildings
const things = [];
for (const b of TN.BUILDINGS) things.push({ id: b.id, r: rectOf(b), door: b.door, rot: b.rot });
for (const l of HL.LOTS) things.push({ id: l.id, r: rectOf(l), door: l.door, rot: l.rot });
for (const l of CR.LOTS) things.push({ id: l.id, r: rectOf(l), door: l.door, rot: l.rot });
ok(things.length === 8 + 9 + 2, 'all 19 buildings and lots');
for (const t of things) {
  ok(inR(t.r[0], t.r[1], TN.RECT) && inR(t.r[2], t.r[3], TN.RECT), t.id + ' inside the town');
  for (const u of things) if (u !== t) ok(!hit(t.r, u.r, 3), `${t.id} clear of ${u.id}`);
  for (const q of TN.RESERVED) ok(!hit(t.r, q.rect, 2), `${t.id} clear of ${q.id}`);
  ok(!hit(t.r, FE.SQUARE, 2), t.id + ' clear of the feast square');
  const P0 = TN.PLAZA; ok(Math.max(Math.abs(t.r[0] - P0.x), Math.abs(t.r[2] - P0.x)) > MK.PLAZA_R || t.r[3] < P0.y - MK.PLAZA_R - 2 || t.r[1] > P0.y + MK.PLAZA_R + 2, t.id + ' clear of the market square');
  // no street through the building (sample its inside)
  for (let x = t.r[0] + 1; x < t.r[2]; x += 2) for (let y = t.r[1] + 1; y < t.r[3]; y += 2) if (streetD(x, y) < 1.5) assert.fail(`${t.id}: a street runs through it at ${x},${y}`);
  ok(streetD(t.door.x, t.door.y) < 1.5, t.id + ' door is on a street spur');
  const out = t.rot ? t.door.y < t.r[1] : t.door.y > t.r[3]; ok(out, t.id + ' door outside the front wall');
  ok(Math.abs(t.door.x - (t.r[0] + t.r[2]) / 2) < 0.6, t.id + ' door centred');
}
// sizes: houses a size up, two-storey lots 20 x 16
for (const b of TN.BUILDINGS.filter(b => b.kind === 'house')) ok(b.hw * 2 === 18 && b.hd * 2 === 14, b.id + ' 18 x 14 house');
// trees on the town's grass stay off streets, roofs, the squares and the reserved lots
for (const [x, y] of TN.TREES) { ok(TN.inTown(x, y, -4), `tree ${x},${y} inside the town`); ok(streetD(x, y) > 6, `tree ${x},${y} off the streets`);
  for (const t of things) ok(!inR(x, y, t.r, 5), `tree ${x},${y} clear of ${t.id}`); for (const q of TN.RESERVED) ok(!inR(x, y, q.rect, 3), `tree ${x},${y} clear of ${q.id}`);
  ok(!inR(x, y, FE.SQUARE, 4) && Math.hypot(x - TN.PLAZA.x, y - TN.PLAZA.y) > MK.PLAZA_R + 4, `tree ${x},${y} off the squares`); }
for (const id of ['L5', 'L8', 'L11']) ok(HL.LOT[id].hw * 2 === 20 && HL.LOT[id].hd * 2 === 16, id + ' 20 x 16');
// the market square and stalls
ok(MK.PLAZA_R === 36, 'market square r 36');
for (const s of MK.STALLS) { ok(Math.hypot(s.x - TN.PLAZA.x, s.y - TN.PLAZA.y) + MK.HW < MK.PLAZA_R, s.id + ' inside the square'); ok(Math.hypot(s.x - TN.PLAZA.x, s.y - TN.PLAZA.y) > 12, s.id + ' clear of the fountain'); }
// the feast square
ok(FE.SQUARE[2] - FE.SQUARE[0] === 114 && FE.SQUARE[3] - FE.SQUARE[1] === 86, 'feast square 114 x 86');
ok(FE.SEATS.length === 20, '20 seats');
for (const s of FE.SEATS) ok(inR(s.x, s.y, FE.SQUARE, -4), 'seat on the square');
ok(new Set(FE.SEATS.map(s => s.x + ',' + s.y)).size === 20, 'seats distinct');
for (const p of FE.POSTS) ok(streetD(p.x, p.y) > 2 || p.y === 61, 'lantern posts off the walking line');
// reserved lots: 4, empty, inside the town
ok(TN.RESERVED.length === 4, 'four reserved lots');
for (const q of TN.RESERVED) { ok(inR(q.rect[0], q.rect[1], TN.RECT) && inR(q.rect[2], q.rect[3], TN.RECT), q.id + ' inside'); for (let x = q.rect[0]; x <= q.rect[2]; x += 2) for (let y = q.rect[1]; y <= q.rect[3]; y += 2) if (streetD(x, y) < 3) assert.fail(q.id + ' has a street on it'); }
// gifts: no group shrank (old saves keep every gift)
ok(SL.TOWN.lamp.length >= 8 && SL.TOWN.pot.length >= 6 && SL.TOWN.nook.length >= 9, 'gift slots kept their counts');
for (const g of ['lamp', 'pot', 'nook']) for (const p of SL.TOWN[g]) { ok(inR(p.x, p.y, TN.RECT), g + ' slot in town'); for (const t of things) ok(!inR(p.x, p.y, t.r, 1), `${g} slot ${p.x},${p.y} clear of ${t.id}`); }
// the 农家乐区 ground stays empty: no streets but the east road
for (let x = TN.AGRI[0]; x <= TN.AGRI[2]; x += 4) for (let y = TN.AGRI[1]; y <= TN.AGRI[3]; y += 4) if (Math.abs(y - 66) > 6 && streetD(x, y) < 3) assert.fail('a street in the 农家乐区 at ' + x + ',' + y);
// the school walk: along the east road to the gate, then the school door
const sr = TN.schoolRoute({ regions: ['east'], plots: { eroad: { mod: 'road' } }, open: true });
let len = 0; for (let i = 0; i < sr.via.length - 1; i++) len += Math.hypot(sr.via[i + 1].x - sr.via[i].x, sr.via[i + 1].y - sr.via[i].y);
ok(sr.to === TN.SCHOOL_DOOR, 'school route ends at the school door');
const onAve = sr.via.reduce((a, p, i) => i && TN.onAvenue(p.x, p.y) && TN.onAvenue(sr.via[i - 1].x, sr.via[i - 1].y) ? a + Math.hypot(p.x - sr.via[i - 1].x, p.y - sr.via[i - 1].y) : a, 0);
const mins = (len - onAve) / 7 + onAve / (7 * TN.AVENUE.walk);
ok(mins <= 80, `farm -> school ${mins.toFixed(0)} game minutes (<= 80)`);
ok(TN.onAvenue(500, 66) && TN.onAvenue(900, 68) && !TN.onAvenue(300, 66) && !TN.onAvenue(500, 80), 'the stone avenue');
ok(SC.YARD[0] >= TN.RECT[0] && SC.TRACK.cx - SC.TRACK.rx > SC.YARD[0] && SC.TRACK.cx + SC.TRACK.rx < SC.YARD[2], 'track inside the yard');
console.log(`townscale-test: ${n} checks ok (farm -> school ${mins.toFixed(0)} min, ${len.toFixed(0)} units)`);
