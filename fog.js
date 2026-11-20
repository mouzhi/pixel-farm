// 像素农场 · v5.11.0.6 未开放区域的地图阴影（纯数据和纯函数；浏览器里是 window.PFFog，Node 里可以 require 做单元测试）
// Before the town or the 农家乐区 are open the east strip already shows streets, roofs and a fountain, which reads as "go
// there" when nothing can be done yet. A soft dark shade sits over each district still locked, with a dithered edge (ordered
// 4x4 Bayer on a world-space grid, so the pattern is fixed to the ground and never crawls when the camera scrolls), and lifts
// with a short fade the moment the district opens. Nothing new is saved: the locks come from the existing gates —
//   小镇    open once the town is bought (S.eff.town, the shop item `town`, gated by town.js gate()),
//   农家乐区 open once the town is open and its prosperity reaches the inn's PROSPERITY (3), or as soon as any lodging exists
//           (an old 民宿院 plot, a cabin or the diner), so saves that already run an inn never see a shade.
// The starting farm and the bought / buyable farm regions and ring plots are never shaded (they keep their padlock signs).
// game.js owns the canvas and the fade; this file builds the cell field and the hint text.
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  const TN = root.PFTown || (typeof require === 'function' ? require('./town.js') : null);
  const WD = root.PFWorld || (typeof require === 'function' ? require('./world.js') : null);
  const IN = root.PFInn || (typeof require === 'function' && typeof document === 'undefined' ? require('./inn.js') : null);
  // the shaded grid: world units, one cell per world unit (2 screen px), covering the east strip and a little west of it
  const CELL = 1, BOUNDS = [440, -208, 1008, 384];
  const GW = (BOUNDS[2] - BOUNDS[0]) / CELL, GH = (BOUNDS[3] - BOUNDS[1]) / CELL;
  const SPLIT = TN ? TN.GATE.x : 596;                          // the town gate: 农家乐区 to the west, the town to the east
  const STRIP_X0 = TN ? TN.STRIP[0] : 448;                     // the old map edge; nothing west of it is ever shaded
  const ZONES = [
    { id: 'agri', name: '农家乐区', rect: [STRIP_X0, BOUNDS[1], SPLIT, BOUNDS[3]], label: P(520, 26) },
    { id: 'town', name: '小镇', rect: [SPLIT, BOUNDS[1], BOUNDS[2], BOUNDS[3]], label: P(792, 8) },
  ];
  const ZONE_IDS = ZONES.map(z => z.id);
  const FEATHER = 14;           // world units of dithered edge
  const WOBBLE = 10;            // world units the west edge wanders
  const ALPHA = 0.55;           // darkest shade (0..1) inside a locked district
  const COLOR = [16, 20, 34];   // a cool night ink, so the shade reads as "not yet" rather than as dirt
  const FADE = 1.2;             // seconds for the shade to lift once a district opens
  // the east road through the 农家乐区 stays lit once it is built: children walk it to the town gate every school day
  const ROAD = { x0: 440, x1: SPLIT + 4, y: TN ? TN.AVENUE.y : 66, hw: 7 };

  const PROSPERITY = IN ? IN.PROSPERITY : 3;
  // ctx: { town: S.eff.town, lv: town prosperity, inn: lodging exists already, coast: the 海边 region is bought,
  //        road: 东大道 bought as a road, schoolDays, plots }
  function locked(ctx) {
    const c = ctx || {}, town = !!c.town;
    return { town: !town, agri: !(c.inn || (town && (c.lv | 0) >= PROSPERITY)), beach: !c.coast };
  }
  // one line saying what opens the district (shown on tap, on hover and on the dimmed jump button)
  function hint(id, ctx) {
    const c = ctx || {}, L = locked(c);
    if (id === 'town') {
      if (!L.town) return null;
      const why = TN ? TN.gate({ plots: c.plots || {}, schoolDays: c.schoolDays | 0 }) : null;
      const price = TN ? `（${TN.PRICE.cost} 金 + ${TN.PRICE.wood} 木）` : '';
      return '小镇还没开放：' + (why ? why + '，再到商店买下「小镇」' + price : '到商店买下「小镇」就开镇门' + price);
    }
    if (id === 'agri') {
      if (!L.agri) return null;
      return L.town ? '农家乐区还没开放：先开小镇，小镇繁荣度到 ' + PROSPERITY + ' 就能来这里开民宿'
        : `农家乐区还没开放：小镇繁荣度到 ${PROSPERITY} 就开放（现在 ${c.lv | 0}，先把集市和面包房盖好）`;
    }
    if (id === 'beach') return L.beach ? '海边还没买下：在商店买「海边」' : null;
    return null;
  }
  const inRect = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
  // the west edge (the old map edge, x 448) wanders a little so the shade does not slice the woodland along a ruler line
  const hash = i => { let n = (i * 374761393) ^ 0x5bd1e995; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const smooth = t => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
  const westEdge = y => STRIP_X0 + 2 + Math.round((smooth(y / 23) * 0.7 + smooth(y / 7 + 40) * 0.3) * WOBBLE);
  const onRoad = (x, y) => x >= ROAD.x0 && x <= ROAD.x1 && Math.abs(y - ROAD.y) <= ROAD.hw;
  const isWater = (x, y) => !!(WD && WD.seaAt && WD.seaAt(x, y) === 'water');
  // which zone (index + 1, 0 = none) each cell belongs to. Open sea is never shaded (the shade stops at the shore).
  function membership(opts) {
    const road = !!(opts && opts.road), out = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) { const y = BOUNDS[1] + (j + 0.5) * CELL;
      for (let i = 0; i < GW; i++) { const x = BOUNDS[0] + (i + 0.5) * CELL;
        if (x < westEdge(y) || isWater(x, y) || (road && onRoad(x, y))) continue;
        for (let z = 0; z < ZONES.length; z++) if (inRect(x, y, ZONES[z].rect)) { out[j * GW + i] = z + 1; break; } } }
    return out;
  }
  // 0..1 per cell: 0 where the district is open (or no district), rising to 1 FEATHER units inside a locked one.
  // shut: { agri: bool, town: bool }. Distance is a two-pass chamfer (3-4) to the nearest cell that is not shaded; the
  // map's own edges (north, east, south) are not "clear", so the shade runs right to the border there.
  function field(memb, shut) {
    const N = GW * GH, d = new Float32Array(N), BIG = 1e6, on = ZONES.map(z => !!(shut && shut[z.id]));
    for (let k = 0; k < N; k++) { const z = memb[k]; d[k] = z && on[z - 1] ? BIG : 0; }
    const a = 1, b = Math.SQRT2;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = j * GW + i; if (!d[k]) continue; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a); if (j > 0) { v = Math.min(v, d[k - GW] + a); if (i > 0) v = Math.min(v, d[k - GW - 1] + b); if (i < GW - 1) v = Math.min(v, d[k - GW + 1] + b); }
      d[k] = v; }
    for (let j = GH - 1; j >= 0; j--) for (let i = GW - 1; i >= 0; i--) { const k = j * GW + i; if (!d[k]) continue; let v = d[k];
      if (i < GW - 1) v = Math.min(v, d[k + 1] + a); if (j < GH - 1) { v = Math.min(v, d[k + GW] + a); if (i < GW - 1) v = Math.min(v, d[k + GW + 1] + b); if (i > 0) v = Math.min(v, d[k + GW - 1] + b); }
      d[k] = v; }
    const out = new Float32Array(N), f = FEATHER / CELL;
    for (let k = 0; k < N; k++) { const u = d[k] >= BIG ? 1 : Math.min(1, d[k] / f); out[k] = u * u * (3 - 2 * u); }
    return out;
  }
  // a fade: the old field lifting into the new one. t 0..1 -> max(new, old * (1 - t)), so a district that stays shut never
  // flickers and the freshly opened edge of its neighbour feathers in smoothly.
  // box: optional [i0, j0, i1, j1] cell window (the part that differs); everything outside it is left alone
  function blend(oldF, newF, t, out, box) {
    const N = newF.length, o = out || new Float32Array(N), k1 = 1 - Math.max(0, Math.min(1, t)), [i0, j0, i1, j1] = box || [0, 0, GW, GH];
    for (let j = j0; j < j1; j++) for (let k = j * GW + i0, e = j * GW + i1; k < e; k++) { const a = oldF ? oldF[k] * k1 : 0, b = newF[k]; o[k] = a > b ? a : b; }
    return o;
  }
  // the cell window where two fields differ (null if they are the same)
  function diffBox(a, b) {
    let i0 = GW, j0 = GH, i1 = -1, j1 = -1;
    for (let j = 0; j < GH; j++) for (let i = 0, k = j * GW; i < GW; i++, k++) if (a[k] !== b[k]) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    return i1 < 0 ? null : [i0, j0, i1 + 1, j1 + 1];
  }
  // field -> RGBA bytes. Ordered dither between three levels (0, half, full shade) on the world grid: the pixel-art edge.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  function paint(F, rgba, box) {
    const px = rgba || new Uint8ClampedArray(GW * GH * 4), u32 = new Uint32Array(px.buffer, px.byteOffset, GW * GH), A = Math.round(ALPHA * 255), H = Math.round(A / 2);
    const word = a => LITTLE ? ((a << 24) | (COLOR[2] << 16) | (COLOR[1] << 8) | COLOR[0]) >>> 0 : ((COLOR[0] << 24) | (COLOR[1] << 16) | (COLOR[2] << 8) | a) >>> 0;
    const LV = [0, word(H), word(A)], [i0, j0, i1, j1] = box || [0, 0, GW, GH];
    for (let j = j0; j < j1; j++) { const row = (j & 3) * 4;
      for (let i = i0, k = j * GW + i0; i < i1; i++, k++) { const v = F[k]; if (v <= 0) { u32[k] = 0; continue; }
        const q = Math.floor(v * 2 + (BAYER[row + (i & 3)] + 0.5) / 16); u32[k] = LV[q > 2 ? 2 : q]; } }
    return px;
  }
  // which locked district covers a world point (for taps and hover), or null
  function zoneAt(x, y, shut, opts) {
    if (x < westEdge(y) || !inRect(x, y, BOUNDS) || isWater(x, y)) return null;
    if (opts && opts.road && onRoad(x, y)) return null;
    for (const z of ZONES) if (inRect(x, y, z.rect)) return shut && shut[z.id] ? z.id : null;
    return null;
  }
  const api = { westEdge, WOBBLE, CELL, BOUNDS, GW, GH, ZONES, ZONE_IDS, FEATHER, ALPHA, COLOR, FADE, ROAD, PROSPERITY, locked, hint, membership, field, blend, diffBox, paint, zoneAt, onRoad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFog = api;
})(typeof window !== 'undefined' ? window : globalThis);
