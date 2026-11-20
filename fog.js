// 像素农场 · v5.11.0.13 未开放区域的迷雾（纯数据和纯函数；浏览器里是 window.PFFog，Node 里可以 require 做单元测试）
// v5.11.0.6 laid a see-through dark shade over the locked districts; players could still read every roof and street under it,
// which spoils the surprise of opening them. v5.11.0.13: an opaque bank of pixel-art cloud instead. Each locked district is a
// solid mask (feathered edge: ordered 4x4 Bayer dither on the world grid, with a little noise so the rim billows instead of
// following a ruler), filled in game.js with slowly drifting cloud tiles (cloudTex). Nothing under it is drawn at all.
// When a district opens the bank breaks up and rolls back (reveal) over REVEAL seconds. Nothing new is saved: the locks come from the existing gates —
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
  const FADE = 1.7;             // seconds for the cloud to roll back once a district opens (REVEAL)
  const REVEAL = FADE;
  const EDGE_NOISE = 0.42;      // how much the rim billows (field units)
  const HIDE = 128;             // cell alpha (0..255) from which things standing there are not drawn
  // the cloud's colours, all from the palette: stone ramp for the body, the cream accent for sunlit tops
  const CLOUD = ['#666a73', '#9a9ea0', '#cfd0c6', '#f6ecd0'];
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
  // tileable value noise (period p lattice cells of size c), 0..1
  const lat = (i, j, seed) => hash(((i * 73856093) ^ (j * 19349663) ^ seed) | 0);
  function vnoise(x, y, c, p, seed) {
    const fx = x / c, fy = y / c, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const m = k => ((k % p) + p) % p, a = lat(m(i), m(j), seed), b = lat(m(i + 1), m(j), seed), cc = lat(m(i), m(j + 1), seed), d = lat(m(i + 1), m(j + 1), seed);
    return (a * (1 - su) + b * su) * (1 - sv) + (cc * (1 - su) + d * su) * sv;
  }
  // per cell: when the cloud there breaks up during a reveal (0 = first, 1 = last): big blobs plus a little detail
  let RN = null, EN = null;
  function revealOrder() { if (RN) return RN; RN = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const x = BOUNDS[0] + i, y = BOUNDS[1] + j;
      RN[j * GW + i] = Math.min(1, Math.max(0, (vnoise(x, y, 28, 1 << 20, 11) * 0.75 + vnoise(x, y, 7, 1 << 20, 12) * 0.25 - 0.18) / 0.64)); }
    return RN; }
  function edgeNoise() { if (EN) return EN; EN = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const x = BOUNDS[0] + i, y = BOUNDS[1] + j; EN[j * GW + i] = vnoise(x, y, 6, 1 << 20, 21) * 0.65 + vnoise(x, y, 2.5, 1 << 20, 22) * 0.35 - 0.5; }
    return EN; }
  // a reveal step: the old field rolling back into the new one. t 0..1; each cell clears at its own moment (revealOrder), so
  // the bank breaks into drifting patches instead of fading as one sheet. A district that stays shut keeps its field (max).
  // box: optional [i0, j0, i1, j1] cell window (the part that differs); everything outside it is left alone
  function reveal(oldF, newF, t, out, box) {
    const N = newF.length, o = out || new Float32Array(N), T = Math.max(0, Math.min(1, t)), r = revealOrder(), [i0, j0, i1, j1] = box || [0, 0, GW, GH];
    for (let j = j0; j < j1; j++) for (let k = j * GW + i0, e = j * GW + i1; k < e; k++) {
      const g = Math.max(0, Math.min(1, (r[k] + 0.25 - 1.25 * T) / 0.25)), a = oldF ? oldF[k] * g : 0, b = newF[k]; o[k] = a > b ? a : b; }
    return o;
  }
  const blend = reveal; // the v5.11.0.6 name
  // the cell window where two fields differ (null if they are the same)
  function diffBox(a, b) {
    let i0 = GW, j0 = GH, i1 = -1, j1 = -1;
    for (let j = 0; j < GH; j++) for (let i = 0, k = j * GW; i < GW; i++, k++) if (a[k] !== b[k]) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    return i1 < 0 ? null : [i0, j0, i1 + 1, j1 + 1];
  }
  // field -> how solid the cloud is per cell (0..1): the feather, pushed about by a little noise so the rim billows
  const level = (v, n) => { if (v <= 0) return 0; const e = v + EDGE_NOISE * n; return e <= 0.25 ? 0 : e >= 0.75 ? 1 : (e - 0.25) / 0.5; };
  // field -> mask bytes (RGBA, white, alpha 0 or 255: the cloud is opaque wherever it is drawn) and, if asked, the 0..255 level
  // per cell (game.js: things standing where it is >= HIDE are not drawn). Ordered dither on the world grid: the pixel-art rim.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function paint(F, rgba, box, lv) {
    const px = rgba || new Uint8ClampedArray(GW * GH * 4), u32 = new Uint32Array(px.buffer, px.byteOffset, GW * GH), n = edgeNoise(), [i0, j0, i1, j1] = box || [0, 0, GW, GH];
    for (let j = j0; j < j1; j++) { const row = (j & 3) * 4;
      for (let i = i0, k = j * GW + i0; i < i1; i++, k++) { const a = level(F[k], n[k]); if (lv) lv[k] = Math.round(a * 255);
        u32[k] = a > 0 && a * 16 > BAYER[row + (i & 3)] + 0.5 ? 0xffffffff : 0; } }
    return px;
  }
  // the cloud tile, size x size (tileable), RGBA bytes. kind 'body': opaque, the bank itself (stone shadows under billows, grey
  // body, pale tops, cream where the sun catches a crest; lit from the top left like the rest of the game). 'wisp': sparse
  // transparent puffs that drift over the body at another speed, so the bank seems to move in depth.
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  function cloudTex(size, kind) {
    const S = size || 128, out = new Uint8ClampedArray(S * S * 4), C = CLOUD.map(hex), wisp = kind === 'wisp', seed = wisp ? 40 : 30;
    const f = (x, y) => vnoise(x, y, S / 4, 4, seed) * 0.55 + vnoise(x, y, S / 8, 8, seed + 1) * 0.3 + vnoise(x, y, S / 16, 16, seed + 2) * 0.15;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = f(x, y), lit = v - f(x + 2, y + 2), d = BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47, k = (y * S + x) * 4;
      let c;
      if (wisp) { if (v + d * 0.12 < 0.6) { out[k + 3] = 0; continue; } c = lit > 0.012 ? 3 : 2; }
      else { const q = v + lit * 2.2 + d * 0.07; c = q < 0.38 ? 0 : q < 0.53 ? 1 : q < 0.68 ? 2 : 3; }
      out[k] = C[c][0]; out[k + 1] = C[c][1]; out[k + 2] = C[c][2]; out[k + 3] = 255; }
    return out;
  }
  // which locked district covers a world point (for taps and hover), or null
  function zoneAt(x, y, shut, opts) {
    if (x < westEdge(y) || !inRect(x, y, BOUNDS) || isWater(x, y)) return null;
    if (opts && opts.road && onRoad(x, y)) return null;
    for (const z of ZONES) if (inRect(x, y, z.rect)) return shut && shut[z.id] ? z.id : null;
    return null;
  }
  // the district a point belongs to (shut or not), past the north / east edge too (the cloud carries on there); null elsewhere
  function zoneOf(x, y) {
    const cx = Math.min(x, BOUNDS[2] - 0.5), cy = Math.max(y, BOUNDS[1] + 0.5);
    if (cx < westEdge(cy) || !inRect(cx, cy, BOUNDS)) return null;
    for (const z of ZONES) if (inRect(cx, cy, z.rect)) return z.id;
    return null;
  }
  const api = { westEdge, WOBBLE, CELL, BOUNDS, GW, GH, ZONES, ZONE_IDS, FEATHER, FADE, REVEAL, EDGE_NOISE, HIDE, CLOUD, BAYER, ROAD, PROSPERITY, locked, hint, membership, field,
    reveal, blend, revealOrder, diffBox, level, paint, cloudTex, vnoise, zoneAt, zoneOf, onRoad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFog = api;
})(typeof window !== 'undefined' ? window : globalThis);
