// v5.11.0.6 未开放区域的阴影: fog.js locks, hints and the shade field (node tools/fog-test.js)
'use strict';
const assert = require('assert');
const FG = require('../fog.js'), TN = require('../town.js'), WD = require('../world.js'), IN = require('../inn.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const at = (F, x, y) => { const i = Math.floor((x - FG.BOUNDS[0]) / FG.CELL), j = Math.floor((y - FG.BOUNDS[1]) / FG.CELL); return i < 0 || j < 0 || i >= FG.GW || j >= FG.GH ? 0 : F[j * FG.GW + i]; };

// locks come from the existing gates only
const fresh = FG.locked({});
ok(fresh.town && fresh.agri && fresh.beach, 'a fresh farm: town, 农家乐区 and the beach are shut');
ok(FG.locked({ town: true, lv: 1 }).agri && !FG.locked({ town: true, lv: 1 }).town, 'town open at prosperity 1: only the 农家乐区 is shut');
ok(!FG.locked({ town: true, lv: IN.PROSPERITY }).agri, 'prosperity 3 (the inn gate) opens the 农家乐区');
ok(!FG.locked({ town: true, lv: 6 }).agri, 'prosperity above 3 too');
ok(!FG.locked({ inn: true }).agri, 'a save that already runs lodging never sees the 农家乐区 shaded');
ok(FG.locked({ town: false, lv: 5 }).agri, 'prosperity alone does not open the district while the gate is shut');
ok(!FG.locked({ coast: true }).beach, 'the 海边 jump is lit once the beach is bought');
ok(FG.PROSPERITY === IN.PROSPERITY, 'the 农家乐区 gate is the inn\'s own');

// hints: say what opens each district, nothing once open
ok(/东大道/.test(FG.hint('town', { plots: {} })), 'town hint names the road first: ' + FG.hint('town', { plots: {} }));
ok(/上过一天学/.test(FG.hint('town', { plots: { eroad: { mod: 'road' } }, schoolDays: 0 })), 'then the school day');
ok(/12000/.test(FG.hint('town', { plots: { eroad: { mod: 'road' } }, schoolDays: 3 })), 'then the price');
ok(FG.hint('town', { town: true }) === null, 'no town hint once open');
ok(/繁荣度到 3/.test(FG.hint('agri', { town: true, lv: 2 })) && /现在 2/.test(FG.hint('agri', { town: true, lv: 2 })), 'agri hint shows the prosperity');
ok(/先开小镇/.test(FG.hint('agri', {})), 'agri hint before the town opens');
ok(FG.hint('agri', { town: true, lv: 3 }) === null, 'no agri hint once open');

// the field: farm never shaded, districts shaded, sea clear, a dithered edge, the road lit once built
const m0 = FG.membership({ road: false }), m1 = FG.membership({ road: true });
const both = FG.field(m0, { agri: true, town: true }), agriOnly = FG.field(m1, { agri: true, town: false }), none = FG.field(m1, { agri: false, town: false });
ok(FG.GW === 568 && FG.GH === 592, 'one cell per world unit over 440..1008 x -208..384');
for (let x = 440; x < 448; x++) for (let y = -200; y < 380; y += 7) ok(at(both, x, y) === 0, `farm side x ${x} y ${y} never shaded`);
for (const [x, y] of [[0, 0], [100, 60], [300, 60], [400, 66], [362, 150]]) ok(!FG.zoneAt(x, y, { agri: true, town: true }), `farm point ${x},${y} is in no district`);
ok(at(both, 520, 20) === 1 && at(both, 790, 60) === 1 && at(both, 900, -150) === 1, 'inside both districts: full shade');
ok(at(both, 596, 66) === 1, 'no seam where the two districts meet while both are shut');
ok(at(both, 800, 300) === 0 && WD.seaAt(800, 300) === 'water', 'the open sea is never shaded');
let ramp = []; for (let x = 448; x <= 480; x += 2) ramp.push(at(both, x, 10)); ok(ramp[0] < 0.5 && ramp[ramp.length - 1] === 1, 'feathered west edge ' + ramp.map(v => v.toFixed(2)).join(' '));
for (let i = 1; i < ramp.length; i++) ok(ramp[i] >= ramp[i - 1] - 1e-6, 'the edge only darkens going east');
ok(at(agriOnly, 520, 20) === 1 && at(agriOnly, 790, 60) === 0, 'town open: town clear, 农家乐区 shaded');
ok(at(agriOnly, 520, 66) === 0 && at(agriOnly, 580, 66) === 0, 'the built east road stays lit through the 农家乐区');
ok(at(FG.field(m0, { agri: true }), 520, 66) > 0, '...but not before it is built');
ok(none.every(v => v === 0), 'all open: nothing shaded');
ok(FG.zoneAt(520, 20, { agri: true, town: false }) === 'agri' && FG.zoneAt(790, 60, { agri: true, town: false }) === null, 'zoneAt follows the locks');
ok(FG.zoneAt(520, 66, { agri: true }, { road: true }) === null, 'a tap on the lit road is not a district tap');
// the west edge wanders but stays within WOBBLE of the old map edge
for (let y = -208; y < 384; y += 3) { const e = FG.westEdge(y); ok(e >= TN.STRIP[0] && e <= TN.STRIP[0] + 2 + FG.WOBBLE, 'west edge ' + e + ' at y ' + y); }

// fade: max(new, old * (1 - t)) — a district that stays shut never flickers, the opened one lifts smoothly
const mid = FG.blend(both, agriOnly, 0.5), end = FG.blend(both, agriOnly, 1);
ok(at(mid, 520, 20) === 1, 'still-shut district stays at full shade during the fade');
ok(Math.abs(at(mid, 790, 60) - 0.5) < 1e-6, 'the opening district is half way at t 0.5');
ok(end.every((v, k) => v === agriOnly[k]), 'the fade ends exactly on the new field');

// paint: three-level ordered dither, transparent where clear, never above ALPHA
const px = FG.paint(both); let maxA = 0, half = 0;
for (let k = 3; k < px.length; k += 4) { maxA = Math.max(maxA, px[k]); if (px[k] > 0 && px[k] < Math.round(FG.ALPHA * 255)) half++; }
ok(maxA === Math.round(FG.ALPHA * 255), 'darkest shade is ALPHA');
ok(half > 0, 'the edge has a half-shade dither step');
ok(FG.paint(none).every((v, k) => k % 4 !== 3 || v === 0), 'nothing painted when all is open');
console.log('fog-test: ' + n + ' checks ok');
