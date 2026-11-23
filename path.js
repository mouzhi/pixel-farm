// 像素农场 · 寻路（纯数据和纯函数；浏览器里是 window.PFPath，Node 里可以 require 做单元测试）
// Characters used to walk in a straight line (or along the dirt road between regions), so they cut through the house,
// the pond and fences. This module keeps a tile grid of blocked / walkable / cheap-dirt cells, runs A* with path
// smoothing, and falls back to the nearest reachable tile when the goal itself cannot be reached.
'use strict';
(function (root) {
  const WD = root.PFWorld || (typeof require === 'function' ? require('./world.js') : null);
  const PL = root.PFPlots || (typeof require === 'function' ? require('./plots.js') : null); // v5.5.0: river, cliff, the new plots' fences
  const CELL = 4;                               // world units per nav cell (half a farm tile; fences sit on cell centres)
  const BLOCKED = 0;
  const DIRT = 5;
  const GRASS = 10;
  const MAX_CACHE = 256;
  const FENCE_HW = 1.7;                         // half-width of a fence rail, world units
  const VOX = 2;                                // voxels per world unit (same as game.js RS)

  // layout copied from game.js (world units). Tests assert the numbers stay in sync when both modules are loaded.
  const LAYOUT = {
    HOUSE: { x: 36, y: 24 }, BARN: { x: 158, y: 26 }, WELL: { x: 100, y: 22 },
    STALL: { x: 160, y: 100 }, POND: { x: 34, y: 100, rx: 19, ry: 12 }, BENCH: { x: 64, y: 108 },
    DOOR: { x: 36, y: 40 }, BARN_DOOR: { x: 158, y: 41 }, WELL_SPOT: { x: 100, y: 31 },
    STALL_SPOT: { x: 160, y: 111 }, BENCH_SPOT: { x: 64, y: 112 },
    POND_STAND: { x: 54, y: 94 },
    // packed-dirt lanes around the home field and out to each region's gate (same as game.js pathSegs / LANES)
    PATH_SEGS: [
      [36, 40, 36, 54], [36, 54, 68, 54], [68, 54, 124, 54], [124, 54, 124, 92], [68, 54, 68, 92],
      [68, 92, 124, 92], [124, 54, 158, 54], [158, 54, 158, 41], [100, 54, 100, 31], [124, 92, 140, 92],
      [140, 92, 140, 111], [140, 111, 166, 111], [68, 92, 68, 112], [68, 112, 64, 112], [36, 54, 36, 66]
    ],
    LANES: {
      forest: [[100, -38, 100, -60], [100, -12, 80, -12]],
      east: [[216, 66, 238, 66]],
      orchard: [[-40, 8, -70, -14], [-70, -14, -100, -6]],
      south: [[68, 150, 68, 176], [68, 176, 78, 176]],
      pasture: [[216, -40, 263, -40], [263, -40, 263, -26], [263, -40, 300, -40], [300, -40, 300, -60]],
      coast: [[220, 212, 272, 236], [272, 236, 280, 256], [280, 256, 280, 268]]
    }
  };

  const houseShape = tier => { const OX = tier >= 3 ? 30 : 0, AW = tier >= 1 ? 32 : 0, up = tier >= 2 ? 22 : 0; return { OX, AW, up, w: 70 + OX + AW, d: 58, h: 76 + up }; };
  const housePlace = tier => { const { OX, w } = houseShape(tier); return { x: LAYOUT.HOUSE.x - (35 + OX - w / 2) / 2, y: LAYOUT.HOUSE.y }; };
  const houseBox = tier => { const sh = houseShape(tier), at = housePlace(tier || 0); const hx = sh.w / (2 * VOX) - 1.2, hy = sh.d / (2 * VOX) - 1.2; return { x0: at.x - hx, x1: at.x + hx, y0: at.y - hy, y1: at.y + hy }; };

  const PEN_FOOT = { coop: [6, 5], sty: [6, 5], fold: [7, 5], shed: [9, 7] }; // half-extents; the south edge stops short of the door

  function makeGrid(world) {
    const W = world || WD.WORLD, cell = CELL;
    const x0 = W.x0, y0 = W.y0, w = Math.ceil((W.x1 - W.x0) / cell), h = Math.ceil((W.y1 - W.y0) / cell);
    const cost = new Uint8Array(w * h); for (let i = 0; i < cost.length; i++) cost[i] = GRASS;
    return { x0, y0, cell, w, h, cost, version: 1, cache: new Map(), cacheOrder: [] };
  }
  const idx = (g, i, j) => j * g.w + i;
  const inGrid = (g, i, j) => i >= 0 && j >= 0 && i < g.w && j < g.h;
  const cellOf = (g, x, y) => [Math.floor((x - g.x0) / g.cell), Math.floor((y - g.y0) / g.cell)];
  const worldOf = (g, i, j) => [g.x0 + (i + 0.5) * g.cell, g.y0 + (j + 0.5) * g.cell];
  const cellCost = (g, i, j) => inGrid(g, i, j) ? g.cost[idx(g, i, j)] : BLOCKED;
  const walkable = (g, i, j) => cellCost(g, i, j) !== BLOCKED;

  function setCell(g, i, j, c) { if (inGrid(g, i, j)) g.cost[idx(g, i, j)] = c; }
  function paintCellWorld(g, x, y, c) { const [i, j] = cellOf(g, x, y); setCell(g, i, j, c); }

  // mark every cell whose rectangle overlaps the world-space box / disc / segment (not just the cell centre,
  // otherwise a fence that sits on a cell edge would leave a one-cell gap and characters would walk through it)
  function cellRect(g, i, j) { const x = g.x0 + i * g.cell, y = g.y0 + j * g.cell; return [x, y, x + g.cell, y + g.cell]; }
  function distPointRect(px, py, x0, y0, x1, y1) { const dx = Math.max(x0 - px, 0, px - x1), dy = Math.max(y0 - py, 0, py - y1); return Math.hypot(dx, dy); }
  function paintBox(g, x0, y0, x1, y1, c) {
    const i0 = Math.max(0, Math.floor((x0 - g.x0) / g.cell)), i1 = Math.min(g.w - 1, Math.floor(((x1 - 1e-6) - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((y0 - g.y0) / g.cell)), j1 = Math.min(g.h - 1, Math.floor(((y1 - 1e-6) - g.y0) / g.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g.cost[idx(g, i, j)] = c;
  }
  function paintDisc(g, cx, cy, r, c) {
    const i0 = Math.max(0, Math.floor((cx - r - g.x0) / g.cell)), i1 = Math.min(g.w - 1, Math.floor((cx + r - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((cy - r - g.y0) / g.cell)), j1 = Math.min(g.h - 1, Math.floor((cy + r - g.y0) / g.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x0, y0, x1, y1] = cellRect(g, i, j); if (distPointRect(cx, cy, x0, y0, x1, y1) <= r) g.cost[idx(g, i, j)] = c;
    }
  }
  function paintEllipse(g, cx, cy, rx, ry, c) {
    const i0 = Math.max(0, Math.floor((cx - rx - g.x0) / g.cell)), i1 = Math.min(g.w - 1, Math.floor((cx + rx - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((cy - ry - g.y0) / g.cell)), j1 = Math.min(g.h - 1, Math.floor((cy + ry - g.y0) / g.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x0, y0, x1, y1] = cellRect(g, i, j);
      const px = Math.max(x0, Math.min(x1, cx)), py = Math.max(y0, Math.min(y1, cy));
      if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1) g.cost[idx(g, i, j)] = c;
    }
  }
  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / l; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
  }
  function distSegRect(x1, y1, x2, y2, rx0, ry0, rx1, ry1) {
    const hit = (ax, ay, bx, by, x0, y0, x3, y3) => {
      const ox = Math.max(x0, Math.min(x3, ax)) === ax && Math.max(y0, Math.min(y3, ay)) === ay;
      const tx = Math.max(x0, Math.min(x3, bx)) === bx && Math.max(y0, Math.min(y3, by)) === by;
      if (ox || tx) return true;
      const sides = [[x0, y0, x3, y0], [x3, y0, x3, y3], [x3, y3, x0, y3], [x0, y3, x0, y0]];
      for (const [sx, sy, ex, ey] of sides) {
        const d1x = bx - ax, d1y = by - ay, d2x = ex - sx, d2y = ey - sy, den = d1x * d2y - d1y * d2x; if (!den) continue;
        const t = ((sx - ax) * d2y - (sy - ay) * d2x) / den, u = ((sx - ax) * d1y - (sy - ay) * d1x) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
      }
      return false;
    };
    if (hit(x1, y1, x2, y2, rx0, ry0, rx1, ry1)) return 0;
    let d = Math.min(distPointRect(x1, y1, rx0, ry0, rx1, ry1), distPointRect(x2, y2, rx0, ry0, rx1, ry1));
    for (const [px, py] of [[rx0, ry0], [rx1, ry0], [rx0, ry1], [rx1, ry1]]) d = Math.min(d, segDist(px, py, x1, y1, x2, y2));
    return d;
  }
  function paintSeg(g, x1, y1, x2, y2, hw, c) {
    const pad = hw + g.cell;
    const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - pad - g.x0) / g.cell)), i1 = Math.min(g.w - 1, Math.floor((Math.max(x1, x2) + pad - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((Math.min(y1, y2) - pad - g.y0) / g.cell)), j1 = Math.min(g.h - 1, Math.floor((Math.max(y1, y2) + pad - g.y0) / g.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [rx0, ry0, rx1, ry1] = cellRect(g, i, j); if (distSegRect(x1, y1, x2, y2, rx0, ry0, rx1, ry1) <= hw) g.cost[idx(g, i, j)] = c;
    }
  }
  function carveDisc(g, cx, cy, r, c) { paintDisc(g, cx, cy, r, c == null ? GRASS : c); }

  function pathDist(x, y, openRegions) {
    let pd = 99; const segs = LAYOUT.PATH_SEGS;
    for (let i = 0; i < segs.length; i++) { const s = segs[i]; pd = Math.min(pd, segDist(x, y, s[0], s[1], s[2], s[3])); }
    if (WD) for (const k in WD.ROUTES) {
      const r = WD.ROUTES[k]; for (let i = 0; i < r.length - 1; i++) pd = Math.min(pd, segDist(x, y, r[i].x, r[i].y, r[i + 1].x, r[i + 1].y));
    }
    const lanes = LAYOUT.LANES; for (const k in lanes) {
      if (openRegions && !openRegions.includes(k)) continue;
      for (const s of lanes[k]) pd = Math.min(pd, segDist(x, y, s[0], s[1], s[2], s[3]));
    }
    return pd;
  }

  // the same segments pathDist measures, rasterised one bounding box at a time (v5.5.0: the bigger map made the full scan slow)
  function dirtSegs(openRegions, plots) {
    const out = LAYOUT.PATH_SEGS.slice();
    if (WD) for (const k in WD.ROUTES) { const r = WD.ROUTES[k]; for (let i = 0; i < r.length - 1; i++) out.push([r[i].x, r[i].y, r[i + 1].x, r[i + 1].y]); }
    const lanes = LAYOUT.LANES; for (const k in lanes) { if (openRegions && !openRegions.includes(k)) continue; for (const s of lanes[k]) out.push(s); }
    if (PL && PL.resortOpen && PL.resortOpen(plots) && PL.RESORT_JOIN && (!openRegions || (openRegions.includes('eshore') && openRegions.includes('coast')))) {
      const line = PL.RESORT_JOIN.path;
      for (let i = 0; i < line.length - 1; i++) out.push([line[i].x, line[i].y, line[i + 1].x, line[i + 1].y]);
    }
    return out;
  }
  function paintDirt(g, openRegions, plots) {
    const R = 5;
    for (const s of dirtSegs(openRegions, plots)) {
      const [i0, j0] = cellOf(g, Math.min(s[0], s[2]) - R, Math.min(s[1], s[3]) - R), [i1, j1] = cellOf(g, Math.max(s[0], s[2]) + R, Math.max(s[1], s[3]) + R);
      for (let j = Math.max(0, j0); j <= Math.min(g.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(g.w - 1, i1); i++) {
        const k = idx(g, i, j); if (g.cost[k] === BLOCKED || g.cost[k] === DIRT) continue;
        const [x, y] = worldOf(g, i, j);
        if (segDist(x, y, s[0], s[1], s[2], s[3]) < R) g.cost[k] = DIRT;
      }
    }
  }

  function homeFences(g) {
    for (let x = 4; x < 58; x += 8) if (x + 4 < 30 || x + 4 > 42) paintSeg(g, x, 50, x + 8, 50, FENCE_HW, BLOCKED);
    for (let x = 76; x < 130; x += 8) paintSeg(g, x, 124, x + 8, 124, FENCE_HW, BLOCKED);
    for (let y = 56; y < 120; y += 8) paintSeg(g, 2, y, 2, y + 8, FENCE_HW, BLOCKED);
    for (const [x, y] of [[60, 50], [28, 50], [132, 124], [2, 120]]) paintDisc(g, x, y, 1.6, BLOCKED);
    carveDisc(g, LAYOUT.DOOR.x, 50, 7, DIRT); // the path gap in the north fence
  }

  function regionFences(g, openRegions, plots, opts) {
    if (!WD) return;
    const open = openRegions || [];
    for (const r of WD.REGIONS) {
      const [x0, y0, x1, y1] = r.rect, opened = open.includes(r.id);
      const openings = [r.gate, r.pier].filter(Boolean);
      // a 度假村 on 东南滩 also opens the east fence of the beach
      if (r.id === 'coast' && PL && PL.resortOpen && PL.resortOpen(plots) && PL.RESORT_JOIN) openings.push(PL.RESORT_JOIN.beach);
      // the guest pier mouth: the south fence would otherwise run across the boards
      let guestMouth = null;
      if (r.id === 'coast' && opts && opts.guestPier) {
        const gp = opts.guestPier;
        guestMouth = gp.mouth || { x: gp.x, y: r.rect[3] };
        openings.push(guestMouth);
      }
      const nearGate = (x, y) => openings.some(p => Math.hypot(x - p.x, y - p.y) < (p === guestMouth ? 16 : 12));
      for (let x = x0; x < x1; x += 8) for (const y of [y0, y1]) if (!(opened && nearGate(x + 4, y))) paintSeg(g, x, y, x + 8, y, FENCE_HW, BLOCKED);
      for (let y = y0; y < y1; y += 8) for (const x of [x0, x1]) if (!(opened && nearGate(x, y + 4))) paintSeg(g, x, y, x, y + 8, FENCE_HW, BLOCKED);
    }
  }

  function penFences(g, opts) {
    if (!WD || !opts || !opts.fence) return;
    const pens = opts.pens || {};
    for (const k of ['sty', 'fold', 'shed']) {
      if (!pens[k]) continue;
      const P = WD.PENS[k], [x0, y0, x1, y1] = [P.roam[0] - 4, P.roam[1] - 4, P.roam[2] + 4, P.roam[3] + 4];
      const gap = (x, y) => pathDist(x, y, opts.regions) < 7 || Math.hypot(x - P.door.x, y - P.door.y) < 9
        || Math.hypot(x - P.trough.x, y - P.trough.y) < 10 || Math.hypot(x - P.bld.x, (y - P.bld.y) * 1.3) < 18;
      for (let x = x0; x < x1; x += 8) for (const y of [y0, y1]) if (!gap(x + 4, y)) paintSeg(g, x, y, x + 8, y, FENCE_HW, BLOCKED);
      for (let y = y0; y < y1; y += 8) for (const x of [x0, x1]) if (!gap(x, y + 4)) paintSeg(g, x, y, x, y + 8, FENCE_HW, BLOCKED);
    }
  }

  function paintBuildings(g, opts) {
    const L = LAYOUT, tier = (opts && opts.houseTier) || 0, box = houseBox(tier);
    paintBox(g, box.x0, box.y0, box.x1, box.y1, BLOCKED);
    paintBox(g, L.BARN.x - 14.5, L.BARN.y - 11.5, L.BARN.x + 14.5, L.BARN.y + 11.5, BLOCKED);
    paintDisc(g, L.WELL.x, L.WELL.y, 5.5, BLOCKED);
    paintBox(g, L.STALL.x - 11, L.STALL.y - 6.5, L.STALL.x + 11, L.STALL.y + 6.5, BLOCKED);
    paintBox(g, L.BENCH.x - 4, L.BENCH.y - 2, L.BENCH.x + 4, L.BENCH.y + 2, BLOCKED);
    for (const b of (opts && opts.blocks) || []) paintBox(g, b[0], b[1], b[2], b[3], BLOCKED); // v5.3.1: e.g. the lumber hut
    const pens = (opts && opts.pens) || {};
    if (WD) for (const k of WD.PEN_IDS) if (pens[k]) {
      const P = WD.PENS[k], [hx, hy] = PEN_FOOT[k] || PEN_FOOT[P.base] || [6, 5]; // v5.6.0: a second pen has its first one's footprint
      paintBox(g, P.bld.x - hx, P.bld.y - hy, P.bld.x + hx, P.bld.y + hy, BLOCKED);
      paintBox(g, P.trough.x - 4, P.trough.y - 2.2, P.trough.x + 4, P.trough.y + 2.2, BLOCKED);
    }
  }

  function paintWater(g) {
    const P = LAYOUT.POND;
    paintEllipse(g, P.x, P.y, P.rx * 1.04, P.ry * 1.04, BLOCKED);
    if (!WD) return;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const [x, y] = worldOf(g, i, j);
      if (WD.seaAt(x, y) === 'water') g.cost[idx(g, i, j)] = BLOCKED;
    }
    // piers are walkable even though they sit over the sea (the fishing stand is at the end)
    const coast = WD.region('coast');
    if (coast && coast.pier && coast.fish) {
      const px = coast.pier.x, y0 = coast.pier.y - 2, y1 = coast.fish.stand.y + 4;
      paintBox(g, px - 5, y0, px + 5, y1, DIRT);
    }
  }
  function paintGuestPier(g, opts) {
    const gp = opts && opts.guestPier; if (!gp) return;
    const px = gp.x, hw = (gp.hw || 4) + 1;
    const y0 = (gp.from && gp.from.y != null ? gp.from.y : gp.y) - 2;
    const y1 = (gp.stand && gp.stand.y != null ? gp.stand.y : gp.y) + 4;
    paintBox(g, px - hw, y0, px + hw, y1, DIRT);
  }

  function paintTreesAndRocks(g, opts) {
    const trees = (opts && opts.trees) || [], rocks = (opts && opts.rocks) || [], regions = (opts && opts.regions) || [];
    for (const t of trees) {
      if (t.stage && t.stage !== 'tree') continue;
      if (pathDist(t.x, t.y, regions) < 6) continue; // keep the roads clear
      paintDisc(g, t.x, t.y, 5.5, BLOCKED);
    }
    for (const r of rocks) paintDisc(g, r.x, r.y, 3.4, BLOCKED);
  }

  function carveEntries(g, opts) {
    const L = LAYOUT, dirt = DIRT;
    const spots = [L.DOOR, L.BARN_DOOR, L.WELL_SPOT, L.STALL_SPOT, L.BENCH_SPOT, L.POND_STAND];
    if (WD) {
      const open = (opts && opts.regions) || [];
      const coast = WD.region('coast');
      if (coast && open.includes('coast') && coast.fish) spots.push(coast.fish.stand, coast.gate, coast.pier);
      if (open.includes('coast') && opts && opts.guestPier) {
        const gp = opts.guestPier;
        spots.push(gp.stand || gp, gp.mouth || { x: gp.x, y: gp.from ? gp.from.y : gp.y }, { x: gp.x, y: (gp.from && gp.from.y) || gp.y });
      }
      if (PL && PL.resortOpen && PL.resortOpen(opts && opts.plots) && open.includes('eshore') && open.includes('coast') && PL.RESORT_JOIN) {
        spots.push(PL.RESORT_JOIN.lot, PL.RESORT_JOIN.beach);
      }
      for (const r of WD.REGIONS) {
        if (open.includes(r.id)) spots.push(r.gate);
        if (r.barrel && open.includes(r.id)) spots.push({ x: r.barrel.x, y: r.barrel.y + 8 });
      }
      const pens = (opts && opts.pens) || {};
      for (const k of WD.PEN_IDS) if (pens[k]) { const P = WD.PENS[k]; spots.push(P.door, { x: P.trough.x - 9, y: P.trough.y + 2 }); }
    }
    for (const s of spots) if (s) carveDisc(g, s.x, s.y, 4.5, dirt);
  }

  const HELP = { worldOf: (g, i, j) => worldOf(g, i, j), paintSeg: (...a) => paintSeg(...a), paintBox: (...a) => paintBox(...a), carveDisc: (...a) => carveDisc(...a), BLOCKED, GRASS, DIRT, FENCE_HW };
  function build(opts) {
    const o = opts || {}, g = makeGrid(o.world || (WD && WD.WORLD));
    paintWater(g);
    paintGuestPier(g, o);
    paintBuildings(g, o);
    homeFences(g);
    regionFences(g, o.regions || [], o.plots, o);
    penFences(g, o);
    if (PL) PL.navPaint(g, HELP, o);
    paintTreesAndRocks(g, o);
    paintDirt(g, o.regions || [], o.plots);
    carveEntries(g, o);
    if (PL) PL.navCarve(g, HELP, o);
    g.opts = o;
    return g;
  }

  function nearestWalkable(g, x, y, maxR, bounds) {
    const [si, sj] = cellOf(g, x, y);
    if (walkable(g, si, sj) && inBounds(si, sj, bounds)) return { i: si, j: sj, x, y, exact: true };
    const R = maxR == null ? 48 : maxR;
    let best = null, bd = 1e9;
    for (let r = 1; r <= R; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const i = si + di, j = sj + dj; if (!walkable(g, i, j) || !inBounds(i, j, bounds)) continue;
        const [wx, wy] = worldOf(g, i, j), d = Math.hypot(wx - x, wy - y);
        if (d < bd) { bd = d; best = { i, j, x: wx, y: wy, exact: false }; }
      }
      if (best) return best;
    }
    return null;
  }
  function inBounds(i, j, b) { if (!b) return true; return i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1; }
  function boundsCells(g, rect) {
    if (!rect) return null;
    const pad = rect.pad || 0;
    return {
      i0: Math.max(0, Math.floor((rect.x0 - pad - g.x0) / g.cell)),
      i1: Math.min(g.w - 1, Math.floor((rect.x1 + pad - g.x0) / g.cell)),
      j0: Math.max(0, Math.floor((rect.y0 - pad - g.y0) / g.cell)),
      j1: Math.min(g.h - 1, Math.floor((rect.y1 + pad - g.y0) / g.cell))
    };
  }

  // 8-connected. A diagonal step is allowed only when both adjacent orthogonal cells are walkable (no corner cutting).
  const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41421356], [1, -1, 1.41421356], [-1, 1, 1.41421356], [-1, -1, 1.41421356]];
  function canStep(g, i, j, di, dj, b) {
    const ni = i + di, nj = j + dj; if (!walkable(g, ni, nj) || !inBounds(ni, nj, b)) return false;
    if (di && dj && (!walkable(g, i + di, j) || !walkable(g, i, j + dj))) return false;
    return true;
  }
  function heur(i, j, ti, tj, minC) {
    const dx = Math.abs(i - ti), dy = Math.abs(j - tj), d = Math.min(dx, dy);
    return (d * 1.41421356 + (Math.max(dx, dy) - d)) * minC;
  }

  function astar(g, si, sj, ti, tj, opt) {
    const w = g.w, h = g.h, n = w * h, b = opt && opt.bounds, maxN = (opt && opt.maxNodes) || n;
    const startWalk = walkable(g, si, sj) && inBounds(si, sj, b);
    if (!startWalk) return null;
    if (si === ti && sj === tj) return { cells: [[si, sj]], cost: 0 };
    const gScore = new Float32Array(n); gScore.fill(1e9);
    const came = new Int32Array(n); came.fill(-1);
    const closed = new Uint8Array(n);
    const heap = [], pos = new Int32Array(n); pos.fill(-1);
    const s = sj * w + si; gScore[s] = 0;
    const minC = DIRT;
    function less(a, b0) { return heap[a].f < heap[b0].f || (heap[a].f === heap[b0].f && heap[a].h < heap[b0].h); }
    function swap(a, b0) { const t = heap[a]; heap[a] = heap[b0]; heap[b0] = t; pos[heap[a].k] = a; pos[heap[b0].k] = b0; }
    function up(i) { while (i > 0) { const p = (i - 1) >> 1; if (!less(i, p)) break; swap(i, p); i = p; } }
    function down(i) { for (;;) { let s0 = i, l = i * 2 + 1, r = l + 1; if (l < heap.length && less(l, s0)) s0 = l; if (r < heap.length && less(r, s0)) s0 = r; if (s0 === i) break; swap(i, s0); i = s0; } }
    function push(node) { if (pos[node.k] >= 0) { heap[pos[node.k]] = node; up(pos[node.k]); down(pos[node.k]); } else { pos[node.k] = heap.length; heap.push(node); up(heap.length - 1); } }
    function pop() { const t = heap[0], last = heap.pop(); pos[t.k] = -1; if (heap.length) { heap[0] = last; pos[last.k] = 0; down(0); } return t; }
    const hs = heur(si, sj, ti, tj, minC); push({ k: s, i: si, j: sj, f: hs, h: hs });
    let expanded = 0, found = -1;
    while (heap.length && expanded < maxN) {
      const cur = pop(); if (closed[cur.k]) continue; closed[cur.k] = 1; expanded++;
      if (cur.i === ti && cur.j === tj) { found = cur.k; break; }
      for (const [di, dj, step] of N8) {
        if (!canStep(g, cur.i, cur.j, di, dj, b)) continue;
        const ni = cur.i + di, nj = cur.j + dj, nk = nj * w + ni;
        if (closed[nk]) continue;
        const stepCost = cellCost(g, ni, nj) * step, ng = gScore[cur.k] + stepCost;
        if (ng >= gScore[nk]) continue;
        gScore[nk] = ng; came[nk] = cur.k;
        const hh = heur(ni, nj, ti, tj, minC); push({ k: nk, i: ni, j: nj, f: ng + hh, h: hh });
      }
    }
    if (found < 0) return { cells: null, expanded, cost: Infinity };
    const cells = []; let k = found; while (k >= 0) { cells.push([k % w, (k / w) | 0]); k = came[k]; } cells.reverse();
    return { cells, expanded, cost: gScore[found] };
  }

  // Supercover line of sight: every cell the segment touches must be walkable, and diagonal crossings cannot cut a corner.
  function los(g, x1, y1, x2, y2, b) {
    const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy);
    if (dist < 0.01) return true;
    const step = g.cell * 0.45, n = Math.max(1, Math.ceil(dist / step));
    let pi = -1, pj = -1;
    for (let s = 0; s <= n; s++) {
      const x = x1 + dx * (s / n), y = y1 + dy * (s / n);
      const [i, j] = cellOf(g, x, y);
      if (!walkable(g, i, j) || !inBounds(i, j, b)) return false;
      if (pi >= 0 && i !== pi && j !== pj) { if (!walkable(g, pi, j) || !walkable(g, i, pj)) return false; }
      pi = i; pj = j;
    }
    return true;
  }

  function smooth(g, points, b) {
    if (!points || points.length <= 2) return points ? points.slice() : points;
    const out = [points[0]]; let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      while (j > i + 1 && !los(g, points[i].x, points[i].y, points[j].x, points[j].y, b)) j--;
      out.push(points[j]); i = j;
    }
    return out;
  }

  function pathLength(points) { let d = 0; for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); return d; }

  function blockedAlong(g, points, step) {
    if (!points || points.length < 2) return [];
    const st = step || g.cell * 0.5, hits = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(dist / st));
      for (let s = 0; s <= n; s++) {
        const x = a.x + dx * (s / n), y = a.y + dy * (s / n), [ci, cj] = cellOf(g, x, y);
        if (!walkable(g, ci, cj)) hits.push({ x, y, i: ci, j: cj, seg: i });
      }
    }
    return hits;
  }

  function cacheGet(g, key) { const v = g.cache.get(key); if (!v) return null; const i = g.cacheOrder.indexOf(key); if (i >= 0) { g.cacheOrder.splice(i, 1); g.cacheOrder.push(key); } return v; }
  function cacheSet(g, key, val) {
    if (g.cache.has(key)) { const i = g.cacheOrder.indexOf(key); if (i >= 0) g.cacheOrder.splice(i, 1); }
    g.cache.set(key, val); g.cacheOrder.push(key);
    while (g.cacheOrder.length > MAX_CACHE) { const old = g.cacheOrder.shift(); g.cache.delete(old); }
  }
  function clearCache(g) { g.cache.clear(); g.cacheOrder.length = 0; }

  function route(g, from, to, opt) {
    const o = opt || {}, b = boundsCells(g, o.bounds);
    const start = nearestWalkable(g, from.x, from.y, o.maxSnap || 48, b);
    let goal = nearestWalkable(g, to.x, to.y, o.maxSnap || 48, b);
    if (!start) return { points: [{ x: from.x, y: from.y }], waypoints: [], reached: false, fallback: true, length: 0, reason: 'no-start' };
    if (!goal) {
      // no walkable cell near the goal: walk as close as a bounded search can get, then stop
      goal = nearestReachable(g, start.i, start.j, to.x, to.y, b, o.maxNodes);
      if (!goal) return { points: [{ x: from.x, y: from.y }], waypoints: [], reached: false, fallback: true, length: 0, reason: 'no-goal' };
    }
    const same = start.i === goal.i && start.j === goal.j;
    const ck = [start.i, start.j, goal.i, goal.j, b ? [b.i0, b.j0, b.i1, b.j1].join(',') : '', o.maxNodes || 0].join('|');
    let used = cacheGet(g, ck);
    if (!used) {
      if (same) used = { cells: [[start.i, start.j]], cost: 0, expanded: 0 };
      else used = astar(g, start.i, start.j, goal.i, goal.j, { bounds: b, maxNodes: o.maxNodes });
      if (!used || !used.cells) {
        const fb = nearestReachable(g, start.i, start.j, to.x, to.y, b, o.maxNodes);
        if (!fb || (fb.i === start.i && fb.j === start.j)) {
          used = { cells: [[start.i, start.j]], cost: 0, expanded: used && used.expanded, fallback: true, reached: false };
        } else {
          used = astar(g, start.i, start.j, fb.i, fb.j, { bounds: b, maxNodes: o.maxNodes }) || { cells: [[start.i, start.j]], fallback: true };
          used.fallback = true; used.reached = false;
        }
      } else { used.fallback = !goal.exact || !!(o && o._forceFallback); used.reached = !used.fallback ? true : Math.hypot(goal.x - to.x, goal.y - to.y) < (o.close || 6); }
      cacheSet(g, ck, used);
    }
    const cells = used.cells || [[start.i, start.j]];
    const mid = cells.map(([i, j]) => { const [x, y] = worldOf(g, i, j); return { x, y }; });
    const points0 = [{ x: from.x, y: from.y }].concat(mid);
    const end = (goal.exact ? { x: to.x, y: to.y } : { x: goal.x, y: goal.y });
    const last = points0[points0.length - 1];
    if (Math.hypot(last.x - end.x, last.y - end.y) > 0.2) points0.push(end);
    const points = smooth(g, points0, b);
    const reached = !used.fallback && goal.exact;
    return { points, waypoints: points.slice(1), reached, fallback: !reached, length: pathLength(points), expanded: used.expanded || 0 };
  }

  // Dijkstra from the start, pick the reachable cell closest to (tx, ty). Used when A* cannot reach the snapped goal.
  function nearestReachable(g, si, sj, tx, ty, b, maxNodes) {
    const w = g.w, n = w * g.h, maxN = maxNodes || n;
    const dist = new Float32Array(n); dist.fill(1e9); dist[sj * w + si] = 0;
    const heap = [];
    function push(k, i, j, d) { heap.push({ k, i, j, d }); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p].d <= heap[c].d) break; const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p; } }
    function pop() { const t = heap[0], last = heap.pop(); if (!heap.length) return t; heap[0] = last; let i = 0; for (;;) { let s = i, l = i * 2 + 1, r = l + 1; if (l < heap.length && heap[l].d < heap[s].d) s = l; if (r < heap.length && heap[r].d < heap[s].d) s = r; if (s === i) break; const q = heap[i]; heap[i] = heap[s]; heap[s] = q; i = s; } return t; }
    push(sj * w + si, si, sj, 0);
    let best = { i: si, j: sj, x: worldOf(g, si, sj)[0], y: worldOf(g, si, sj)[1], exact: false }, bd = Math.hypot(best.x - tx, best.y - ty);
    let expanded = 0, seen = new Uint8Array(n);
    while (heap.length && expanded < maxN) {
      const cur = pop(); if (seen[cur.k]) continue; seen[cur.k] = 1; expanded++;
      const [wx, wy] = worldOf(g, cur.i, cur.j), d = Math.hypot(wx - tx, wy - ty);
      if (d < bd) { bd = d; best = { i: cur.i, j: cur.j, x: wx, y: wy, exact: d < 0.8 }; }
      for (const [di, dj, step] of N8) {
        if (!canStep(g, cur.i, cur.j, di, dj, b)) continue;
        const ni = cur.i + di, nj = cur.j + dj, nk = nj * w + ni, nd = cur.d + cellCost(g, ni, nj) * step;
        if (nd < dist[nk]) { dist[nk] = nd; push(nk, ni, nj, nd); }
      }
    }
    return best;
  }

  function draw(ctx, g, proj, routes, opt) {
    const o = opt || {}, pad = o.pad || 20, W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    // blocked cells: a flat diamond in world space, so it sits on the ground under the camera tilt
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const c = g.cost[idx(g, i, j)]; if (c !== BLOCKED && !(o.showDirt && c === DIRT)) continue;
      const [x, y] = worldOf(g, i, j), [sx, sy] = proj(x, y);
      if (sx < -pad || sx > W + pad || sy < -pad || sy > H + pad) continue;
      const h = g.cell * 0.45, p1 = proj(x - h, y), p2 = proj(x, y - h), p3 = proj(x + h, y), p4 = proj(x, y + h);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath();
      ctx.fillStyle = c === BLOCKED ? 'rgba(180, 30, 40, 0.38)' : 'rgba(196, 150, 70, 0.28)';
      ctx.fill();
    }
    const cols = o.colors || ['#ffe566', '#7ec8ff', '#b6f27a', '#ff9ed1'];
    (routes || []).forEach((r, n) => {
      const pts = r.points || r;
      if (!pts || pts.length < 1) return;
      ctx.strokeStyle = r.color || cols[n % cols.length]; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => { const [sx, sy] = proj(p.x, p.y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.stroke();
      pts.forEach((p, i) => {
        const [sx, sy] = proj(p.x, p.y);
        ctx.fillStyle = i === 0 ? '#7cff9a' : i === pts.length - 1 ? '#ff6b6b' : (r.color || cols[n % cols.length]);
        ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
      });
    });
    ctx.restore();
  }

  const api = {
    CELL, BLOCKED, DIRT, GRASS, LAYOUT, houseShape, housePlace, houseBox,
    makeGrid, build, cellOf, worldOf, walkable, cellCost, setCell, paintBox, paintDisc, paintEllipse, paintSeg, carveDisc,
    pathDist, nearestWalkable, astar, los, smooth, route, pathLength, blockedAlong, clearCache, draw, nearestReachable
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFPath = api;
})(typeof window !== 'undefined' ? window : globalThis);
