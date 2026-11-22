// 像素农场 · v5.10.3：装饰的固定位置（纯数据和纯函数；浏览器里是 window.PFSlots，Node 里可以 require 做单元测试）
// The family no longer sets decorations down on any free tile. Each kind has an ordered list of spots per area, laid out
// so the yard looks planned: lamps line the paths and the house front at even spacing, flower pots go on the doorstep,
// under the windows and round the pond, benches and the other pieces in a few nooks. Crop tiles, the walk paths and the
// animal pens stay clear. Spots are tried in order (game.js checks each one against what is there today); when a kind's
// spots are all taken the piece waits in the storehouse. The same groups lay out the gifts on the town's main street (hall.js).
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  // which list a decoration uses
  const LAMPS = ['lamppost', 'stonelamp'];
  function group(id) {
    if (LAMPS.includes(id)) return 'lamp';
    if (id === 'flowerpot') return 'pot';
    if (id === 'scarecrow') return 'scarecrow';
    if (id === 'bench') return 'bench';
    if (id === 'party') return 'party';
    if (id === 'stringlights') return 'string';
    return 'nook';
  }
  // ---------- the home yard (world units; house door at 36,40; field 72..120 x 56..88 inside the path loop 68/124 x 54/92) ----------
  const HOME = {
    // the house front (by the door, the far corner), the yard road's north edge, the south corners of the field (wide),
    // the east edge, the road east, then south of the stall path (not hugging 阿禾's stall)
    // v5.10.4: the south field and stall lamps were too tight (a lamp every 12, plus scarecrows in the gaps);
    // same number of spots, just wider — overflow still goes to the storehouse
    lamp: [P(45.5, 44.5), P(66.5, 44.5), P(80, 44.5), P(112, 44.5), P(128, 44.5), P(70, 101.5), P(122, 101.5),
      P(134.5, 56), P(134.5, 86), P(148, 62), P(164, 62), P(172, 50), P(172, 126), P(186, 68), P(198, 96)],
    // the doorstep and under the front windows, then round the pond's south and west shore
    pot: [P(52.5, 44), P(59.5, 44), P(24, 119.5), P(34, 119.5), P(44, 119.5), P(8, 96), P(8, 106), P(14, 119.5), P(54, 119.5)],
    scarecrow: [P(100, 130), P(56, 132), P(134.5, 73)],
    // benches: facing the field from the south lawn, by the house's east side, out east
    bench: [P(84, 114), P(116, 114), P(82, 16), P(82, 28), P(156, 80), P(188, 104), P(188, 120), P(156, 126)],
    string: [P(100, 114)],
    nook: [P(116, 26), P(156, 71.5), P(128, 121), P(144, 126), P(188, 136), P(124, 36), P(188, 86)],
  };
  // ---------- a little house in a plot (home.js layout: door, foot; m = mirrored) ----------
  function cottage(L, m) {
    const s = m ? -1 : 1, d = L.door, f = L.foot;
    return { lamp: [P(d.x - s * 12, d.y + 2), P(d.x + s * 15, d.y + 2)], pot: [P(d.x - s * 6, d.y + 0.5), P(d.x - s * 9, d.y + 0.5)],
      scarecrow: [], bench: [], string: [], nook: [P(m ? f[0] + 4 : f[2] - 4, d.y + 7), P(m ? f[2] - 4 : f[0] + 4, d.y + 7)] };
  }
  // all spots for one decoration kind, in order: the home yard, then each little house (homes: [{ L, m }])
  function spotsFor(id, homes) {
    const g = group(id), out = [];
    const take = (list, area) => { for (const p of list || []) out.push({ x: p.x, y: p.y, area }); };
    if (g === 'party') return out; // the party area keeps its own rule (a playground plot, or open grass)
    take(HOME[g], 'home'); if (g === 'string' || g === 'bench') take(HOME.nook, 'home');
    (homes || []).forEach((h, i) => { const c = cottage(h.L, h.m); take(c[g], 'cottage' + i); if (g !== 'lamp' && g !== 'pot') take(c.nook, 'cottage' + i); });
    return out;
  }
  // the one-time re-layout of an old save: placed pieces in their kinds' order (lamps first: they shape the yard), the rest after
  const ORDER = ['lamp', 'pot', 'scarecrow', 'bench', 'string', 'nook'];
  function relayoutOrder(placed) { return placed.slice().sort((a, b) => ORDER.indexOf(group(a.id)) - ORDER.indexOf(group(b.id)) || a.u - b.u); }
  // ---------- the town's main street (gifts; hall.js) ----------
  const TOWN = {
    // v5.11.0: the town moved east and grew (town.js); the same number of spots per kind, so no gift is ever dropped
    lamp: [P(660, 59), P(733, 59), P(806, 59), P(851, 74), P(640, 168), P(890, 168), P(851, -8), P(976, -8)],
    pot: [P(634, 49), P(684, 49), P(718, 49), P(758, 47), P(828, 49), P(862, 95)],
    nook: [P(700, 80), P(826, 80), P(689, 166), P(830, 166), P(890, 80), P(976, 80), P(613, 100), P(613, 150), P(950, 168)],
  };
  const townGroup = id => { const g = group(id); return g === 'lamp' || g === 'pot' ? g : 'nook'; };
  // where each gift stands: the n-th lamp on the n-th lamp spot, and so on (null: no room left for it)
  function townLayout(gifts) { const used = { lamp: 0, pot: 0, nook: 0 };
    return gifts.map(id => { const g = townGroup(id), p = TOWN[g][used[g]++]; return p ? P(p.x, p.y) : null; }); }
  const townRoom = (gifts, id) => { const g = townGroup(id); return gifts.filter(q => townGroup(q) === g).length < TOWN[g].length; };
  const TOWN_MAX = TOWN.lamp.length + TOWN.pot.length + TOWN.nook.length;
  const api = { group, HOME, cottage, spotsFor, ORDER, relayoutOrder, TOWN, townGroup, townLayout, townRoom, TOWN_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFSlots = api;
})(typeof window !== 'undefined' ? window : globalThis);
