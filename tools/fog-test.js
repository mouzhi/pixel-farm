// v5.11.0.6 / v5.11.0.13 未开放区域的迷雾: fog.js locks, hints, the cloud field, mask, reveal and tile (node tools/fog-test.js)
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
ok(FG.GW === 888 && FG.GH === 592, 'one cell per world unit over 440..1328 x -208..384');
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

// reveal: the opened district breaks up cell by cell (revealOrder), a district that stays shut never flickers
const shareSolid = (F, x0, x1, y0, y1) => { let n = 0, s = 0; for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { if (at(both, x, y) < 1) continue; n++; if (at(F, x, y) >= 1) s++; } return s / n; };
const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => FG.reveal(both, agriOnly, t));
const sh = steps.map(F => shareSolid(F, 640, 1000, -190, 200));
ok(sh[0] === 1 && sh[5] === 0, 'reveal starts solid and ends clear ' + sh.map(v => v.toFixed(2)));
for (let i = 1; i < sh.length; i++) ok(sh[i] <= sh[i - 1], 'the bank only rolls back ' + sh.map(v => v.toFixed(2)));
ok(sh[2] > 0.2 && sh[2] < 0.95 && sh[3] > 0.05 && sh[3] < 0.8, 'half way it is broken up, not one sheet fading ' + sh.map(v => v.toFixed(2)));
for (const F of steps) ok(at(F, 520, 20) === 1 && at(F, 530, 150) === 1, 'the still-shut 农家乐区 stays solid through the reveal');
ok(steps[5].every((v, k) => v === agriOnly[k]), 'the reveal ends exactly on the new field');
ok(FG.blend === FG.reveal, 'the v5.11.0.6 name still works');
// rolls back in patches: at t 0.5 the solid cells form blobs (few isolated cells), not salt and pepper
{ const F = FG.reveal(both, agriOnly, 0.5); let lone = 0, sol = 0; for (let y = -150; y < 150; y++) for (let x = 650; x < 990; x++) { if (at(F, x, y) < 1) continue; sol++;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => at(F, x + dx, y + dy) >= 1).length <= 1) lone++; }
  ok(sol > 1000 && lone / sol < 0.03, 'mid reveal patches are blobs: ' + lone + ' lone of ' + sol); }

// the mask: opaque or clear (never see-through), solid inside, clear outside, a dithered feather at the rim
const lv = new Uint8Array(FG.GW * FG.GH), px = FG.paint(both, null, null, lv);
const alphas = new Set(); for (let k = 3; k < px.length; k += 4) alphas.add(px[k]);
ok(alphas.size === 2 && alphas.has(0) && alphas.has(255), 'mask pixels are only clear or opaque: ' + [...alphas]);
const lvAt = (x, y) => lv[Math.floor(y - FG.BOUNDS[1]) * FG.GW + Math.floor(x - FG.BOUNDS[0])];
const pxAt = (x, y) => px[(Math.floor(y - FG.BOUNDS[1]) * FG.GW + Math.floor(x - FG.BOUNDS[0])) * 4 + 3];
for (let y = -200; y < 380; y += 5) for (const x of [500, 560, 650, 800, 990]) if (at(both, x, y) >= 1) ok(pxAt(x, y) === 255 && lvAt(x, y) === 255, `solid deep inside at ${x},${y}`);
for (let y = -200; y < 380; y += 5) ok(pxAt(441, y) === 0 && pxAt(447, y) === 0, 'the farm side is clear at y ' + y);
ok(FG.paint(none).every((v, k) => k % 4 !== 3 || v === 0), 'nothing painted when all is open');
{ let rows = 0, wid = []; for (let y = -200; y < 380; y += 4) { if (WD.seaAt(470, y) === 'water' || at(both, 519, y) < 1) continue; let a = -1, z = -1, part = 0;
    for (let x = 440; x < 520; x++) { const q = lvAt(x, y); if (a < 0 && q > 0) a = x; if (z < 0 && q >= 255) z = x; if (q > 0 && q < 255) part++; }
    let on = 0, tot = 0; for (let x = a; x < z; x++) { tot++; if (pxAt(x, y)) on++; }
    rows++; wid.push(z - a); ok(z - a >= 3 && z - a <= 30, `feather at y ${y}: ${a}..${z}`); if (tot >= 4) ok(on > 0 && on < tot, `the feather at y ${y} is dithered (${on}/${tot})`); }
  ok(new Set(wid).size >= 4, 'the rim billows (feather widths ' + [...new Set(wid)].join(',') + ')'); }
// the dither is fixed to the world grid: the same field paints the same pixels
ok(Buffer.compare(Buffer.from(FG.paint(both)), Buffer.from(px)) === 0, 'painting is deterministic');

// the cloud tile: tileable, opaque, palette colours only, puffs (a few colours in big runs, not noise)
const pal = new Set(FG.CLOUD.map(h => parseInt(h.slice(1), 16)));
for (const [S, kind] of [[128, 'body'], [96, 'wisp']]) { const t = FG.cloudTex(S, kind); let op = 0, runs = 0, prev = -1;
  for (let k = 0; k < S * S; k++) { const a = t[k * 4 + 3]; if (!a) { prev = -1; continue; } ok(a === 255, kind + ' pixels are opaque or empty'); op++; const c = (t[k * 4] << 16) | (t[k * 4 + 1] << 8) | t[k * 4 + 2];
    if (!pal.has(c)) ok(false, kind + ' colour off palette ' + c.toString(16)); if (c !== prev) runs++; prev = c; }
  if (kind === 'body') { ok(op === S * S, 'the body tile covers every pixel'); ok(runs / op < 0.25, 'the body is made of runs, not speckle: ' + (runs / op).toFixed(2)); }
  else ok(op > S * S * 0.04 && op < S * S * 0.6, 'the wisps are loose puffs: ' + (op / S / S).toFixed(2));
  // tileable: the colour changes across the wrap are like those between any two neighbouring columns / rows inside the tile
  const col = (x0, x1, y) => (t[(y * S + x0) * 4] << 16 | t[(y * S + x0) * 4 + 1] << 8 | t[(y * S + x0) * 4 + 2]) !== (t[(y * S + x1) * 4] << 16 | t[(y * S + x1) * 4 + 1] << 8 | t[(y * S + x1) * 4 + 2]);
  const cut = x => { let n = 0; for (let y = 0; y < S; y++) if (col(x, (x + 1) % S, y)) n++; return n; }, cuts = []; for (let x = 0; x < S - 1; x++) cuts.push(cut(x));
  ok(cut(S - 1) <= Math.max(...cuts) * 1.6 + 4, kind + ' tile wraps without a seam (' + cut(S - 1) + ' vs max ' + Math.max(...cuts) + ')'); }
ok(FG.CLOUD.every(c => /^#[0-9a-f]{6}$/.test(c)), 'cloud colours are palette hex');
// zoneOf carries past the north / east map edge (the bank does too)
ok(FG.zoneOf(900, -400) === 'town' && FG.zoneOf(1200, 0) === 'eastave' && FG.zoneOf(1400, 0) === 'eastave' && FG.zoneOf(520, -400) === 'agri' && FG.zoneOf(300, 0) === null, 'zoneOf past the edges');
// v5.12.2: 东门大道 is its own fog district east of the old map edge
ok(FG.locked({}).eastave && FG.locked({}).vacbeach, 'fresh farm: 东门大道 and 沙滩 jumps are shut');
ok(FG.locked({ town: true, lv: 5 }).eastave, 'opening the town does not lift the avenue fog');
ok(!FG.locked({ eastave: true }).eastave, 'buying 东门大道 lifts its fog');
ok(!FG.locked({ vacbeach: true }).vacbeach, 'buying 度假沙滩 lights its jump');
ok(/东门大道/.test(FG.hint('eastave', { town: true, lv: 4 })), 'avenue hint names the shop and prosperity');
ok(/海边/.test(FG.hint('vacbeach', { town: true, coast: false })), 'beach hint names 海边');
ok(FG.hint('vacbeach', { town: true, coast: true, vacbeach: true }) === null, 'no beach hint once bought');
ok(FG.hint('eastave', { eastave: true }) === null, 'no avenue hint once bought');
ok(FG.zoneAt(1160, 90, { agri: false, town: false, eastave: true }) === 'eastave', 'tapping the unbought avenue is the new district');
ok(FG.zoneAt(1160, 90, { agri: false, town: false, eastave: false }) === null, 'bought avenue is not a lock-tap');
ok(FG.zoneAt(790, 60, { agri: true, town: true, eastave: true }) === 'town', 'town zone still ends at the old edge');
const eastShut = FG.field(FG.membership({ road: true }), { agri: false, town: false, eastave: true });
ok(at(eastShut, 790, 60) === 0 && at(eastShut, 1160, 40) === 1, 'town open + avenue shut: only the new strip is shaded');
const allOpen = FG.field(FG.membership({ road: true }), { agri: false, town: false, eastave: false });
ok(allOpen.every(v => v === 0), 'avenue open: the new strip is clear too');

console.log('fog-test: ' + n + ' checks ok');

