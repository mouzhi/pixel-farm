// 像素农场 · 第 7 阶段外扩：外圈的画面和玩法挂钩（地面、悬崖、桥、水车、镇口、乐园、地块篱笆和牌子、模块外观、买地 / 改建、放牧草地）。
// Rules and data live in plots.js (pure, unit-tested). game.js calls PFExpand.ground() for the ground canvas, then mount(X)
// once its models exist; X hands over the few game internals this needs. Everything here is drawn with the game's own
// voxel / billboard machinery, so per-angle caches, the LRU budget and the no-jitter rules all still hold.
'use strict';
(function (root) {
  const PL = root.PFPlots;
  const PAL = root.PF_PALETTE, R = PAL.ramps, G = R.green, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, SH = R.shallow;
  const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
  function vnoise(x, y, s) { const h = (i, j) => { let n = i * 374761393 + j * 668265263 + s * 1442695; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v; }

  // ---------- ground (one call per ground pixel; cheap rejects first) ----------
  // -> [palette colour, kind] or null (null: the old ground rules decide). plots: S.plots (bought plots and their module)
  // 16-unit buckets: which river / trail segments and plots can touch a cell (ground() runs ~2M times per rebuild)
  const BK = 16, BX0 = -300, BY0 = -260, BW = 52, BH = 46;
  const segD = (px, py, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1; let t = ((px - a.x) * dx + (py - a.y) * dy) / l; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - a.x - t * dx, py - a.y - t * dy); };
  const bucket = (lines, pad) => { const out = new Array(BW * BH); for (let k = 0; k < out.length; k++) { const cx = BX0 + (k % BW) * BK, cy = BY0 + Math.floor(k / BW) * BK, segs = [];
      for (const L of lines) for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; if (Math.min(a.x, b.x) - pad <= cx + BK && Math.max(a.x, b.x) + pad >= cx && Math.min(a.y, b.y) - pad <= cy + BK && Math.max(a.y, b.y) + pad >= cy) segs.push([a, b]); }
      out[k] = segs.length ? segs : null; } return out; };
  const cellOf = (x, y) => { const i = Math.floor((x - BX0) / BK), j = Math.floor((y - BY0) / BK); return i < 0 || j < 0 || i >= BW || j >= BH ? -1 : j * BW + i; };
  const RB = bucket([PL.RIVER], 16), TB = bucket([PL.TRAIL, PL.TRAIL_TOP, PL.TRAIL_EAST], 6);
  const PB = (() => { const out = new Array(BW * BH); for (let k = 0; k < out.length; k++) { const cx = BX0 + (k % BW) * BK, cy = BY0 + Math.floor(k / BW) * BK;
    const ps = PL.PLOTS.filter(p => p.rect[0] <= cx + BK && p.rect[2] >= cx && p.rect[1] <= cy + BK && p.rect[3] >= cy); out[k] = ps.length ? ps : null; } return out; })();
  const fastRiver = (x, y) => { const k = cellOf(x, y), segs = k < 0 ? null : RB[k]; if (k < 0) return PL.riverDist(x, y); if (!segs) return 99; let d = 99; for (const [a, b] of segs) { const q = segD(x, y, a, b); if (q < d) d = q; } return d; };
  const fastTrail = (x, y, w) => { const k = cellOf(x, y), segs = k < 0 ? null : TB[k]; if (!segs) return false; for (const [a, b] of segs) if (segD(x, y, a, b) < w) return true; return false; };
  const fastPlot = (x, y) => { const k = cellOf(x, y), ps = k < 0 ? null : PB[k]; if (!ps) return null; for (const p of ps) if (inRect(x, y, p.rect)) return p; return null; };
  function ground(x, y, plots) {
    const nearRiver = !(x > -150 && y < 255), nearRidge = y < -100;
    if (nearRiver) {
      const rd = fastRiver(x, y), hw = PL.riverHW(x, y);
      if (rd < hw) { // flowing water: lighter in the middle, a dark line along the banks, a few streaks that run with the flow
        if (rd > hw - 1.2) return [SH[0], 'water'];
        const v = vnoise(x / 6 + y / 9, y / 3 - x / 11, 21);
        return [v > 0.74 ? Wt[4] : rd < hw * 0.5 ? Wt[3] : (v < 0.2 ? Wt[1] : Wt[3]), 'water'];
      }
      if (rd < hw + PL.BANK) { const v = vnoise(x / 3, y / 3, 23); return [rd < hw + 1.4 ? Wd[2] : v > 0.6 ? Wd[4] : Wd[3], 'sand']; }
    }
    if (nearRidge) {
      if (fastTrail(x, y, 4.2) && fastTrail(x, y, 3.6 + (vnoise(x / 3, y / 3, 29) - 0.5) * 1.2)) return [fastTrail(x, y, 2.4) ? Wd[4] : Wd[3], 'dirt'];
      const ry = PL.ridgeY(x);
      if (y < ry - PL.CLIFF) { // the high plateau: short grass, bare stone patches, a pale rocky crest along the north edge
        const p = fastPlot(x, y); if (p) return plotGround(p, x, y, plots);
        const v = vnoise(x / 8, y / 8, 31), crest = y < -196 + vnoise(x / 13, 0, 33) * 6;
        if (crest) return [v > 0.55 ? St[3] : St[2], 'rock'];
        return [v > 0.72 ? St[2] : v > 0.4 ? G[2] : G[3], 'high'];
      }
      if (y < ry) { const k = Math.floor((ry - y) * 1.6); return [k <= 1 ? St[0] : (Math.floor(x / 3) + k) % 4 === 0 ? St[0] : St[1], 'rock']; } // the rock face
      if (y < ry + 3) return [G[1], 'grass'];                                         // the cliff's shadowed foot
    }
    if (inRect(x, y, PL.GRAZE.rect) && !(x > -151)) return grazeGround(x, y);
    const p = (x < -24 || x > 352 || y > 136 || y < -110) ? fastPlot(x, y) : null;
    if (p) return plotGround(p, x, y, plots);
    if (x > 440 && y > 40 && y < 92) return [Math.abs(y - 66) < 5 ? Wd[4] : G[2], Math.abs(y - 66) < 5 ? 'dirt' : 'grass']; // beyond the town gate
    return null;
  }
  let GRAZED = false; // the meadow is bought (set by sync); a locked meadow is a wild one
  function grazeGround(x, y) { const v = vnoise(x / 7, y / 7, 41);
    if (!GRAZED) return [v > 0.62 ? G[3] : G[2], 'wild'];
    return [v > 0.7 ? G[4] : G[3], 'grass']; }
  function plotGround(p, x, y, plots) {
    const own = plots && plots[p.id], v = vnoise(x / 9, y / 9, 13);
    if (p.special === 'bridge') return null;
    if (!own) return [v > 0.62 ? G[3] : G[2], 'wild'];                                            // locked: a wild meadow, like the old regions
    const mod = own.mod, [x0, y0, x1, y1] = p.rect;
    if (mod === 'field' && p.field) { const f = p.field, fx0 = f.c0 * 8 - 6, fy0 = f.r0 * 8 - 6, fx1 = (f.c0 + f.cols) * 8 + 6, fy1 = (f.r0 + f.rows) * 8 + 6;
      if (x > fx0 && x < fx1 && y > fy0 && y < fy1) return [Wd[4], 'dirt']; return [G[3], 'grass']; }
    if (mod === 'workshop') { const e = Math.min(x - x0, x1 - x, y - y0, y1 - y); if (e < 5) return [G[3], 'grass']; const w = vnoise(x / 4, y / 4, 49); return [w > 0.78 ? Wd[3] : w < 0.12 ? St[2] : Wd[4], 'dirt']; }
    if (mod === 'meadow') { const w = vnoise(x / 5, y / 5, 43); return [w > 0.7 ? G[5] : w > 0.35 ? G[4] : G[3], 'grass']; }
    if (mod === 'pasture') return [v > 0.6 ? G[4] : G[3], 'grass'];
    if (mod === 'woodland') return [v > 0.5 ? G[2] : G[1], 'grass'];
    if (mod === 'orchard') { const row = ((y - y0) % 16 + 16) % 16; return [row < 2 ? G[2] : G[3], 'grass']; }
    if (mod === 'road') { const d = Math.abs(y - 66); return d < 5 ? [d > 3.8 ? Wd[3] : Wd[4], 'dirt'] : [G[3], 'grass']; }
    if (mod === 'playground') { const s = playSand(p, x, y); if (s) return s; return [v > 0.7 ? G[4] : G[3], 'grass']; }
    if (mod === 'trail') return null;
    return [G[3], 'grass'];
  }
  function playSand(p, x, y) { const [x0, y0, x1, y1] = p.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (Math.abs(x - (cx + 12)) < 10 && Math.abs(y - (cy + 12)) < 8) return [vnoise(x, y, 47) > 0.6 ? Wd[5] : Wd[4], 'sand'];
    if (Math.hypot(x - (cx - 14), (y - (cy - 2)) * 0.7) < 9) return [Wd[4], 'dirt']; // worn ground at the foot of the slide
    if (Math.hypot(x - (cx + 12), (y - (cy - 10)) * 1.2) < 8) return [Wd[4], 'dirt'];  // and under the swings
    return null; }

  // ---------- models (style A voxels: 2 voxels per world unit) ----------
  let MD = null;
  function makeModels(X) {
    const B = X.buildModel, hash = (a, b, c) => { let n = a * 374761393 + b * 668265263 + c * 2147483647; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
    // a slab of the cliff face: layered rock with a grassy lip; three variants so the ridge does not repeat
    const ledge = seed => B(18, 10, 26, (x, y, z) => { const lip = 20 + Math.floor(hash(x >> 1, seed, 3) * 5), back = y < 3 ? 2 : 0, top = lip - back - (y > 7 ? Math.floor((y - 7) * 2.5) : 0);
      if (z > top) return null; if (z >= top - 1 && y <= 7) return hash(x, y, seed) > 0.3 ? G[3] : G[2];             // grassy lip of the plateau
      const band = (z + Math.floor(hash(x >> 2, 9, seed) * 3)) % 7; if (band === 0) return St[1];                         // rock strata
      if (y >= 8 && hash(x, z, seed + 2) > 0.8) return G[2];                                                               // tufts on the face
      return hash(x, z, seed + 1) > 0.85 ? St[1] : (z < 6 ? St[1] : St[2]); });
    const boulder = seed => B(12, 10, 8, Object.assign((x, y, z) => { const e = ((x - 6) / 5.6) ** 2 + ((y - 5) / 4.6) ** 2 + (z / (6 + hash(seed, 1, 1) * 2)) ** 2; if (e > 1) return null;
      return z >= 5 && hash(x, y, seed) > 0.4 ? G[3] : (hash(x, z, seed) > 0.8 ? St[1] : St[2]); }, {}));
    // a stone abutment where the bridge meets the bank
    const abut = B(16, 6, 6, (x, y, z) => (z === 5 ? St[3] : (x + z) % 5 === 0 ? St[1] : St[2]));
    const rail = B(3, 16, 9, (x, y, z) => (z < 9 && (y === 1 || y === 14)) || z === 8 ? Wd[3] : null);
    // trail barrier: a red-and-cream bar between two posts
    const barrier = B(18, 3, 10, (x, y, z) => (x <= 1 || x >= 16) ? Wd[2] : (z >= 6 && z <= 8) ? ((x >> 2) & 1 ? Rf[2] : Ac[0]) : null);
    // water wheel: axle east-west, wheel in the y-z plane. full: rim, spokes and paddles; frame: only the posts and axle
    const wheel = (full, turn = 0) => B(8, 24, 24, (x, y, z) => { const dy = y - 11.5, dz = z - 12, r = Math.hypot(dy, dz);
      if ((x === 0 || x === 7) && Math.abs(dy) < 1.5 && z <= 12) return Wd[1];                      // the two posts
      if (z === 12 && Math.abs(dy) < 1 && x > 0 && x < 7) return St[1];                               // axle
      if (!full || x < 2 || x > 5) return null;
      if (r > 9.5 && r < 11.2) return Wd[3];                                                          // rim
      const ang = Math.atan2(dz, dy) + turn, k = ((ang / (Math.PI / 4)) % 1 + 1) % 1; // turn: v5.6.0 frames of a turning wheel
      if (r < 9.6 && (k < 0.12 || k > 0.88)) return Wd[2];                                            // spokes
      if (r >= 11.2 && r < 12 && (k < 0.2 || k > 0.8)) return Wd[4];                                  // paddles
      return null; });
    // a little cottage for the town on the horizon (gable roof, two windows)
    const cottage = roof => B(20, 16, 20, (x, y, z) => { const X0 = 2, X1 = 17, Y0 = 2, Y1 = 13, ZW = 9;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3]; if (front && (x === 6 || x === 13) && z >= 4 && z <= 6) return Wt[3]; if (front && x >= 9 && x <= 10 && z <= 6) return Wd[1];
        return z === ZW ? Wd[4] : Ac[0]; }
      const r = X.gableY(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[4] });
      return r === 'fill' ? Wd[3] : r; });
    const townGate = B(6, 28, 22, (x, y, z) => { if ((y <= 3 || y >= 24) && z <= 20) return St[2]; if (z >= 18 && z <= 21) return z === 21 ? St[3] : St[1];
      if (x >= 2 && x <= 3 && y > 3 && y < 24 && z < 18) return (y === 13 || y === 14) ? Wd[1] : (z % 4 === 0 ? Wd[2] : Wd[3]); return null; });
    // playground: a slide (ladder, platform, chute), a sandbox with a sandcastle, a two-seat swing
    const slide = B(10, 26, 18, (x, y, z) => { if ((x === 1 || x === 8) && y >= 2 && y <= 5 && z <= 16) return Rf[2]; if (y >= 2 && y <= 5 && x > 1 && x < 8 && z % 3 === 0 && z <= 15) return Ac[1];
      if (y >= 2 && y <= 6 && z === 15 && x >= 1 && x <= 8) return Ac[2];
      const t = 14 - (y - 6) * 0.72; if (y > 6 && y <= 25 && z >= t - 1 && z <= t + 1 && x >= 2 && x <= 7) return (x === 2 || x === 7) ? Ac[2] : z >= t ? Wt[4] : Wt[3]; return null; });
    const sandbox = B(36, 28, 9, (x, y, z) => { const rim = x <= 1 || x >= 34 || y <= 1 || y >= 26;
      if (rim) return z <= 2 ? (z === 2 ? Wd[4] : Wd[2]) : null; if (z === 0) return Wd[5];
      const cx = 22, cy = 12, tw = Math.abs(x - cx) <= 3 && Math.abs(y - cy) <= 3; if (tw && z <= 7) return z === 7 ? ((x + y) & 1 ? Wd[5] : null) : (z % 3 === 2 ? Wd[4] : Wd[5]);
      if (Math.abs(x - 13) <= 2 && Math.abs(y - 16) <= 2 && z <= 4) return z === 4 ? null : Wd[4];               // a smaller tower
      if (x >= 8 && x <= 10 && y >= 7 && y <= 8 && z === 1) return Rf[2];                                       // a red bucket
      return null; });
    const swing = B(28, 10, 22, (x, y, z) => { const post = (x <= 1 || x >= 26) && (y === 1 || y === 8) && z <= 20; if (post) return Wd[2];
      if (z >= 20 && z <= 21 && y >= 1 && y <= 8 && (x <= 1 || x >= 26)) return Wd[2]; if (z === 21 && y >= 4 && y <= 5) return Wd[3];   // top bar
      for (const sx of [8, 18]) { if ((x === sx - 2 || x === sx + 2) && y === 4 && z >= 6 && z <= 20) return St[2]; if (z === 5 && Math.abs(x - sx) <= 2 && y >= 3 && y <= 5) return Rf[3]; }
      return null; });
    const shelter = B(22, 14, 14, (x, y, z) => { if ((x <= 1 || x >= 20) && (y <= 1 || y >= 12) && z <= 9) return Wd[2]; const r = 9 + (y / 13) * 3; if (z >= 9 && z <= r && z >= r - 1 && x >= 0 && x <= 21) return Wd[3];
      if (y <= 1 && z < 9 && x > 1 && x < 20) return z % 3 === 0 ? Wd[2] : Wd[3]; return null; });
    const trough = B(14, 6, 5, (x, y, z) => { if (x === 0 || x === 13 || y === 0 || y === 5 || z === 0) return Wd[2]; return z === 3 ? Wt[3] : null; });
    const board = B(14, 3, 14, (x, y, z) => ((x === 2 || x === 11) && z < 8) ? Wd[2] : (z >= 7 && z <= 13 && y === 1) ? (z === 7 || z === 13 || x === 0 || x === 13 ? Wd[2] : Wd[4]) : null);
    MD = { ledges: [ledge(3), ledge(11), ledge(29)], boulders: [boulder(5), boulder(17)], abut, rail, barrier, wheelFull: wheel(true), wheelTurn: [1, 2].map(i => wheel(true, i * Math.PI / 12)), // v5.6.0: a repaired wheel turns
      cottages: [cottage(Rf[2]), cottage(Rf[3]), cottage(St[1])], townGate, slide, sandbox, swing, shelter, trough, board };
    return MD;
  }

  // ---------- mount: build the props once, then keep them in step with S.plots ----------
  let X = null, S = null, mounted = false;
  const plotProps = {};         // plot id -> props / billboards the module put down
  let grazeProps = [], bridgeDeck = [], lastKey = '';
  function mount(x) {
    X = x; S = x.S; patchWorld(x.WD); const md = makeModels(x), add = x.addProp;
    // the ridge: cliff slabs along the rock face, stepping where the trail climbs through
    for (let gx = -250; gx <= 446; gx += 8) { const ry = PL.ridgeY(gx); if (PL.onTrail(gx, ry, 12)) continue;
      add(md.ledges[((gx / 8) | 0) & 1 ? 1 : (gx % 3 === 0 ? 2 : 0)], gx, ry - 1.5, 0, { xp: 1 }); }
    // the plateau: boulders and pines, kept off the plots and the trail
    { const fr = x.mulberry32(6161);
      for (let i = 0; i < 160; i++) { const tx = -250 + fr() * 696, ty = -206 + fr() * 70; const ry = PL.ridgeY(tx);
        if (ty > ry - PL.CLIFF - 6 || PL.plotAt(tx, ty) || PL.onTrail(tx, ty, 9) || PL.riverDist(tx, ty) < 14) continue;
        if (fr() < 0.35) add(md.boulders[i & 1], tx, ty, fr() * 6, { xp: 1 }); else x.addTree(x.treeDefs.pine[Math.floor(fr() * 3)], tx, ty); } }
    // the bridge: stone abutments always; the deck once it is bought
    const B = PL.BRIDGE; add(md.abut, B.x, B.y0 + 1, 0, { xp: 1 }); add(md.abut, B.x, B.y1 - 1, 0, { xp: 1 });
    // the town on the horizon, and its locked gate at the end of the east road
    PL.TOWN.roofs.forEach((r, i) => add(md.cottages[i % 3], r.x, r.y, (i % 2) * Math.PI / 2, { xp: 1, big: 1 }));
    add(md.townGate, PL.TOWN.gate.x, PL.TOWN.gate.y, 0, { xp: 1 });
    // fences and a sign for every plot that has a fence; registered with the regions so their gates and signs follow the shop
    for (const p of PL.PLOTS) { const list = x.regionProps[p.id] = [];
      if (!p.special) { const [x0, y0, x1, y1] = p.rect, nearGate = (gx, gy) => Math.hypot(gx - p.gate.x, gy - p.gate.y) < 12;
        for (let fx = x0; fx < x1; fx += 8) for (const fy of [y0, y1]) { if (PL.riverDist(fx + 4, fy) < PL.RIVER_HW + 2) continue; const q = add(x.models.fence, fx + 4, fy, 0, { region: p.id }); q.gate = nearGate(fx + 4, fy); list.push(q); }
        for (let fy = y0; fy < y1; fy += 8) for (const fx of [x0, x1]) { if (PL.riverDist(fx, fy + 4) < PL.RIVER_HW + 2) continue; const q = add(x.models.fence, fx, fy + 4, Math.PI / 2, { region: p.id }); q.gate = nearGate(fx, fy + 4); list.push(q); } }
      if (p.special === 'trail') { const q = add(md.barrier, p.gate.x, p.gate.y, 0.5, { region: p.id }); q.gate = true; list.push(q); }
      const sign = { spr: x.SIGN, x: p.sign.x, y: p.sign.y, region: p.id, sign: 1 }; x.billboards.push(sign); list.push(sign); }
    // the grazing meadow's sign (taken down once the fold has its meadow)
    grazeProps.sign = { spr: x.SIGN, x: PL.GRAZE.sign.x, y: PL.GRAZE.sign.y, sign: 1, graze: 1 }; x.billboards.push(grazeProps.sign);
    // the orchard fence posts in the meadow gap (hidden once bought)
    grazeProps.gap = (x.regionProps.orchard || []).filter(q => !q.sign && Math.abs(q.x - PL.GRAZE.gap[0]) < 1 && q.y > PL.GRAZE.gap[1] - 2 && q.y < PL.GRAZE.gap[3] + 2);
    mounted = true; sync(true);
    warm();
    return api;
  }
  function plotPropsOf(id) { return plotProps[id] || (plotProps[id] = { list: [], decals: [], wheel: null }); }
  const removeFrom = (arr, o) => { const i = arr.indexOf(o); if (i >= 0) arr.splice(i, 1); };
  // put each bought plot's module things down (and take a changed module's away); idempotent
  function sync(force) {
    if (!mounted) return; const plots = S.plots || {}, graze = !!(S.eff && S.eff.graze);
    const key = JSON.stringify(plots) + graze + (S.works ? S.works.penHost : ''), host = S.works ? S.works.penHost : null; if (!force && key === lastKey) return; lastKey = key;
    if (GRAZED !== graze) { GRAZED = graze; const r = PL.GRAZE.rect; X.buildGroundBase && X.buildGroundBase([r[0] - 6, r[1] - 6, r[2] + 6, r[3] + 6]); }
    for (const p of PL.PLOTS) { const o = plotPropsOf(p.id), own = plots[p.id], mod = own ? own.mod : null;
      if (o.mod === mod && o.host === (host === p.id) && !force) continue; o.host = host === p.id; // v5.6.0: a pasture that hosts the second pens drops its shelter
      for (const q of o.list) { removeFrom(X.props, q); removeFrom(X.billboards, q); } o.list.length = 0;
      for (const d of o.decals) removeFrom(X.decals, d); o.decals.length = 0;
      o.mod = mod; o.wheel = null; if (mod) place(p, mod, o); }
    // bridge deck
    if (plots.bridge && !bridgeDeck.length) { const B = PL.BRIDGE; for (let y = B.y0 + 4; y <= B.y1 - 4; y += 8) bridgeDeck.push(X.addProp(X.pierDeck, B.x, y, 0, { xp: 1 }), X.addProp(MD.rail, B.x - 4.2, y, 0, { xp: 1 }), X.addProp(MD.rail, B.x + 4.2, y, 0, { xp: 1 })); }
    if (!plots.bridge && bridgeDeck.length) { for (const q of bridgeDeck) removeFrom(X.props, q); bridgeDeck.length = 0; }
    // the grazing meadow: fence on three sides, a gap in the orchard fence, the sign comes down
    if (graze && !grazeProps.fence) { const [x0, y0, x1, y1] = PL.GRAZE.rect, f = grazeProps.fence = [];
      for (let fx = x0; fx < x1; fx += 8) for (const fy of [y0, y1]) f.push(X.addProp(X.models.fence, fx + 4, fy, 0, { xp: 1 }));
      for (let fy = y0; fy < y1; fy += 8) f.push(X.addProp(X.models.fence, x0, fy + 4, Math.PI / 2, { xp: 1 }));
      removeFrom(X.billboards, grazeProps.sign); }
    if (graze) for (const q of grazeProps.gap) removeFrom(X.props, q);
  }
  function place(p, mod, o) {
    const [x0, y0, x1, y1] = p.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, add = (m, x, y, rot = 0, extra) => { const q = X.addProp(m, x, y, rot, Object.assign({ xp: 1 }, extra)); o.list.push(q); return q; };
    const fr = X.mulberry32([...p.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
    if (mod === 'field' && p.barrel) add(X.barrelModel, p.barrel.x, p.barrel.y);
    if (mod === 'pasture' && !(S.works && S.works.penHost === p.id)) { add(MD.shelter, x0 + 18, y0 + 14, 0); add(MD.trough, x1 - 18, y0 + 12, 0); }
    if (mod === 'workshop') { add(MD.board, cx, y0 + 8, 0); add(X.crateModel, x0 + 12, y1 - 10, 0.2); add(X.crateModel, x0 + 20, y1 - 9, 1.1); add(X.logsModel, x1 - 16, y1 - 10, 0.15); }
    if (mod === 'road') { add(MD.board, x0 + 10, 56, 0); }
    if (mod === 'dam' && p.wheel) o.wheel = add(MD.wheelFull, p.wheel.x, p.wheel.y, 0, { big: 1 });
    if (mod === 'woodland') syncWoodland(p.id, true);
    if (mod === 'playground') for (const s of PL.playSpots({ [p.id]: { mod } }).filter(s => s.plot === p.id)) {
      if (s.kind === 'slide') add(MD.slide, s.x, s.y, 0); if (s.kind === 'sandbox') add(MD.sandbox, s.x, s.y, 0); if (s.kind === 'swing') add(MD.swing, s.x, s.y, 0); }
    if (mod === 'meadow' || mod === 'playground' || mod === 'pasture') { const n = mod === 'meadow' ? Math.round((x1 - x0) * (y1 - y0) / 45) : 12;
      for (let i = 0; i < n; i++) { const x = x0 + 4 + fr() * (x1 - x0 - 8), y = y0 + 4 + fr() * (y1 - y0 - 8); if (mod === 'playground' && Math.hypot(x - cx, y - cy) < 26) continue;
        const d = { x, y, c: (mod === 'meadow' || fr() < 0.3) ? X.SPRITES.flowers[Math.floor(fr() * 4)] : X.SPRITES.tufts[Math.floor(fr() * 4)] }; X.decals.push(d); o.decals.push(d); } }
    if (mod === 'meadow') for (let i = 0; i < 3; i++) { const def = X.treeDefs.bush[Math.floor(fr() * 3)], bx = x0 + 10 + fr() * (x1 - x0 - 20), by = y0 + 8 + fr() * (y1 - y0 - 16);
      if (X.inHomeYard && X.inHomeYard(bx, by)) continue; X.addTree(def, bx, by); o.list.push(X.props[X.props.length - 1]); } // v5.9.0: none in a new house's yard
  }
  // overlay: the padlock over each locked plot's sign (like the old regions)
  function drawLocks(ctx, proj, onScreen, bob) {
    const plots = S.plots || {};
    for (const p of PL.PLOTS) if (!plots[p.id] && onScreen(p.sign.x, p.sign.y, 30)) { const [sx, sy] = proj(p.sign.x, p.sign.y); ctx.drawImage(X.LOCK, Math.round(sx) - 3, Math.round(sy) - 22 + bob); }
    if (!(S.eff && S.eff.graze) && onScreen(PL.GRAZE.sign.x, PL.GRAZE.sign.y, 30)) { const [sx, sy] = proj(PL.GRAZE.sign.x, PL.GRAZE.sign.y); ctx.drawImage(X.LOCK, Math.round(sx) - 3, Math.round(sy) - 22 + bob); }
  }
  // minimap: locked plots darkened with a dashed outline; bought ones get a small module letter
  function minimap(g, P, fillCoinPrice) {
    const plots = S.plots || {}, open = PL.gateOpen(S.family);
    for (const p of PL.PLOTS) { const [x0, y0] = P(p.rect[0], p.rect[1]), [x1, y1] = P(p.rect[2], p.rect[3]);
      if (plots[p.id]) { g.font = '600 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff6dc'; g.fillText(PL.MODULES[plots[p.id].mod].name, (x0 + x1) / 2, (y0 + y1) / 2); continue; }
      g.fillStyle = open ? 'rgba(20,14,10,0.35)' : 'rgba(20,14,10,0.55)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = open ? '#e8c78a' : '#9a8a70'; g.setLineDash([3, 2]); g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1); g.setLineDash([]);
      if (x1 - x0 > 30) { g.font = '600 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff6dc'; g.fillText(p.name, (x0 + x1) / 2, (y0 + y1) / 2 - 1);
        if (open && fillCoinPrice) fillCoinPrice(g, p.price, (x0 + x1) / 2, (y0 + y1) / 2 + 8); } }
  }
  // per-angle caches for the new models, warmed in small slices once the farm is running (never all at once: v5.2.4's freeze)
  function warm() {
    const list = [...MD.ledges, ...MD.boulders, MD.abut, MD.wheelFull, ...MD.cottages, MD.townGate, MD.barrier, X.pierDeck];
    let n = 0, base = null, idx = 0;
    const step = () => { if (X.manual) return; const t0 = performance.now(), b = Math.round(X.cam.ta / X.ASTEP); if (b !== base) { base = b; n = 0; idx = 0; }
      while (n <= 12 && performance.now() - t0 < 6) { const m = list[idx], a = (base + (n & 1 ? -(n + 1) / 2 : n / 2)) * X.ASTEP; X.stackCanvas(m, a); X.stackCanvas(m, a + Math.PI / 2); if (++idx >= list.length) { idx = 0; n++; } }
      setTimeout(step, n > 12 ? 800 : 60); };
    setTimeout(step, 1500);
  }

  // ---------- the family and the animals ----------
  // sheep go out to the meadow in the day once it is bought; null keeps the pen's own patch
  function roamOf(a, T) { if (a.kind !== 'sheep' || (a.pen && a.pen !== 'fold') || !(S.eff && S.eff.graze) || !PL.grazeHours(T)) return null; const r = PL.GRAZE.rect; return [r[0] + 6, r[1] + 6, r[2] - 6, r[3] - 6]; }

  // ---------- buying and re-zoning (rules: plots.js offer / rezoneOffer) ----------
  // bought plot ids join S.eff.regions, so the old region machinery (gates, choppable trees, saplings, the ground) just works
  function applyEff(S) { const ids = Object.keys(S.plots || {}).filter(PL.isPlotId); if (ids.length) S.eff.regions = S.eff.regions.concat(ids); }
  // the woodland's trees are ordinary wild sim trees (saved with the rest); they grow back like 林场's (WD.regrows is patched)
  function syncWoodland(id, on) {
    const pre = 'x' + id; if (!on) return;
    for (const t of PL.woodlandTrees(id)) if (!S.trees.some(q => q.id === t.id)) { S.trees.push({ id: t.id, x: t.x, y: t.y, kind: 'wild', v: t.v | 0, stage: 'tree', age: 0, ripe: 0, cd: 0 }); }
    void pre; }
  function clearPlot(id, from) { // what goes when a plot changes module: crops are sold (unripe ones refunded at seed cost), tiles close, woodland trees become wood
    const p = PL.plot(id), out = { gold: 0, wood: 0 };
    for (const t of X.tiles) if (t.f === id) { if (t.crop) { const c = X.SIM.CROPS[t.crop.type]; out.gold += X.SIM.ripe(t.crop) ? Math.round((c.price || 0) * ((S.prices && S.prices[t.crop.type]) || 1)) : (c.seed || 0); }
      Object.assign(t, { open: false, crop: null, tilled: false, watered: false, debris: null, weed: null }); }
    if (from === 'woodland') { const pre = 'x' + id;
      for (let i = S.trees.length - 1; i >= 0; i--) { const t = S.trees[i]; if (!t.id.startsWith(pre) || !/^\d+$/.test(t.id.slice(pre.length))) continue; if (t.stage === 'tree') out.wood += 4; S.trees.splice(i, 1); X.dropTree(t.id); }
      S.orders = S.orders.filter(o => !(o.type === 'chop' && String(o.id).startsWith(pre))); }
    void p; return out;
  }
  function pay(o) { S.coins -= o.cost; X.FARMER.wood = Math.max(0, (X.FARMER.wood || 0) - (o.wood || 0)); }
  function buyPlot(id, mod) {
    const o = PL.offer(S.plots, id, mod, S.coins, X.FARMER.wood, S.family); if (!o) return { ok: false, reason: 'unknown' }; if (o.owned) return { ok: false, reason: 'owned' }; if (!o.ok) return o;
    pay(o); S.plots[id] = { mod: o.mod, day: S.day };
    const p = o.plot, M = PL.MODULES[o.mod];
    X.log(`买下了「${p.name}」（${o.cost} 金${o.wood ? ' + ' + o.wood + ' 木材' : ''}），做成${M.name}`);
    X.popText(X.FARMER.x, X.FARMER.y, 22, '-' + o.cost, '#ffd76a'); X.burst(p.sign.x, p.sign.y, 14, ['#ffd76a', '#fff2a8', '#ffffff'], 14, 'spark');
    X.emit('purchase', { item: 'plot:' + id, mod: o.mod, gold: o.cost, wood: o.wood, who: 'player' });
    X.applyUpgrades(); X.saveNow(); return Object.assign({}, o, { ok: true });
  }
  function rezonePlot(id, mod) {
    const o = PL.rezoneOffer(S.plots, id, mod, S.coins, X.FARMER.wood); if (!o) return { ok: false, reason: 'unknown' }; if (!o.ok) return o;
    const busy = X.plotBusy && X.plotBusy(id); if (busy) return Object.assign({}, o, { ok: false, reason: 'busy', why: busy }); // v5.6.0: workshops, hives or second pens stand on it
    pay(o); const back = clearPlot(id, o.from); S.plots[id] = { mod, day: S.day };
    S.coins += back.gold; X.FARMER.wood = Math.min(X.woodCap(), (X.FARMER.wood || 0) + back.wood);
    const p = o.plot; X.log(`「${p.name}」从${PL.MODULES[o.from].name}改成了${PL.MODULES[mod].name}（${o.cost} 金）${back.gold ? '，地里的庄稼折了 ' + back.gold + ' 金' : ''}${back.wood ? '，砍下的树得了 ' + back.wood + ' 木材' : ''}`);
    X.popText(p.sign.x, p.sign.y, 22, '-' + o.cost, '#ffd76a');
    X.emit('purchase', { item: 'rezone:' + id, mod, gold: o.cost, wood: o.wood, who: 'player' });
    X.applyUpgrades(); repaint(id); X.markNavDirty(); X.saveNow(); return Object.assign({}, o, { ok: true, back });
  }
  // the world rules learn about plots: a plot is an area of its own; woodland trees grow back
  function patchWorld(WD) {
    if (WD._plots) return; WD._plots = 1;
    const areaAt = WD.areaAt, regrows = WD.regrows, choppable = WD.choppable;
    WD.areaAt = (x, y) => areaAt(x, y) || (PL.plotAt(x, y) || {}).id || null;
    WD.regrows = t => regrows(t) || PL.woodlandOf(S && S.plots, t.x, t.y);
    WD.choppable = (t, regions) => choppable(t, regions) || (t.kind === 'wild' && t.stage === 'tree' && (() => { const p = PL.plotAt(t.x, t.y); return !!(p && regions.includes(p.id)); })());
  }

  // the ground patch a change of open areas repaints: only plots changed -> their rects (with a margin for fences and gates), else null (all)
  function dirtyRect(was, now) {
    const a = new Set(was), b = new Set(now), diff = [...was.filter(id => !b.has(id)), ...now.filter(id => !a.has(id))];
    if (!diff.length || diff.some(id => !PL.isPlotId(id))) return null;
    const r = [1e9, 1e9, -1e9, -1e9];
    for (const id of diff) { const p = PL.plot(id); let q = p.rect; if (p.special === 'trail') q = [170, -200, 240, -100];
      r[0] = Math.min(r[0], q[0] - 10); r[1] = Math.min(r[1], q[1] - 10); r[2] = Math.max(r[2], q[2] + 10); r[3] = Math.max(r[3], q[3] + 10); }
    return r;
  }
  // a module change keeps the plot open, so applyUpgrades does not repaint: this does
  function repaint(id) { const r = dirtyRect([], [id]); if (r && X.buildGroundBase) X.buildGroundBase(r); }

  // v5.6.0: the water wheel prop of each 动力坝 plot (works-art.js swaps its frames while it turns)
  const wheelProp = id => (plotProps[id] && plotProps[id].wheel) || null;
  const api = { ground, mount, applyEff, dirtyRect, repaint, buyPlot, rezonePlot, sync, drawLocks, minimap, roamOf, playSpots: () => PL.playSpots(S ? S.plots : {}), models: () => MD, wheelProp };
  root.PFExpand = api;
})(typeof window !== 'undefined' ? window : globalThis);
