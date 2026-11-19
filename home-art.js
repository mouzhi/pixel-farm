// 像素农场 · 第 11 阶段（v5.9.0）的画面：新房子（比老房子小一号的木屋，带门廊、花箱和烟囱）、盖房时的木架子、
// 小鸡舍、门前的长椅和院子里压实的土。Rules live in home.js (pure, unit-tested). game.js calls mount(X) once its models
// exist, sync() whenever a house is bought, built or moved (idempotent: a key decides), ground() while painting the ground.
'use strict';
(function (root) {
  const HM = root.PFHome;
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, G = R.green;
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = [];
  const hash = (a, b, c) => { let n = a * 374761393 + b * 668265263 + c * 1442695; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };

  // ---------- models (voxel = 1 screen px = half a world unit) ----------
  // the cottage's walls are the collision block (HM.HOUSE.hw x hd world units, 2 voxels each); the model is a little wider for
  // the roof overhang and deeper for the porch. CY: how far (world units) south of the anchor the model's centre sits.
  const W2 = HM.HOUSE.hw * 4, D2 = HM.HOUSE.hd * 4, CW = W2 + 8, CD = D2 + 14, CX0 = 4, CX1 = W2 + 3, CY0 = 3, CY1 = D2 + 2, ZW = 20;
  const CY = (CD / 2 - (CY0 + CY1) / 2) / 2;
  const toWorld = (vx, vy) => ({ dx: (vx - CW / 2) / 2, dy: (vy - CD / 2) / 2 + CY });
  const CHIM = { x0: CX1 - 9, x1: CX1 - 6, y0: CY0 + 6, y1: CY0 + 9, top: ZW + 22 };
  const WINS = [CX0 + 4, CX1 - 12];             // the two front windows (left edge, 9 voxels wide)
  const DOOR = { x0: Math.round((CX0 + CX1) / 2) - 4, x1: Math.round((CX0 + CX1) / 2) + 3 };
  function makeModels(x) {
    const B = x.buildModel, gable = x.gableY, cx = (CX0 + CX1) / 2;
    const win = (u, v, u0, v0, s) => { const du = u - u0, dv = v - v0; if (du < 0 || du >= s || dv < 0 || dv >= s) return null;
      if (du === 0 || du === s - 1 || dv === 0 || dv === s - 1) return Wd[1];                               // frame
      if (du === (s >> 1) || dv === (s >> 1)) return Ac[0];                                                 // cross bars
      return (du <= 2 && dv >= s - 4) ? Wt[5] : Wt[3]; };
    const logs = z => (z % 3 === 2 ? Wd[2] : (z % 6 < 3 ? Wd[3] : Wd[4]));
    // the new house: a log cottage on a stone footing; two front windows with flower boxes, one on each side and one at the
    // back, a small green door with a lantern, a porch with its own little roof, a gable vent and a stone chimney
    const cottage = roof => B(CW, CD, ZW + 24, (x, y, z) => {
      const inX = x >= CX0 && x <= CX1, inY = y >= CY0 && y <= CY1;
      if (x >= CHIM.x0 && x <= CHIM.x1 && y >= CHIM.y0 && y <= CHIM.y1 && z >= 3 && z <= CHIM.top) return z >= CHIM.top - 1 ? St[1] : (z % 4 === 0 ? St[1] : St[2]);
      if (z <= 2 && x >= CX0 - 1 && x <= CX1 + 1 && y >= CY0 - 1 && y <= CY1 + 1) return (z === 2 || (x + y + z) % 5) ? St[2] : St[1]; // footing
      if (inX && inY && z >= 3 && z <= ZW) {
        const front = y >= CY1 - 1, back = y <= CY0 + 1, side = x <= CX0 + 1 || x >= CX1 - 1;
        if (!(front || back || side)) return Wd[4];
        if (side && (front || back)) return Wd[1];                                                          // corner posts
        if (z >= ZW - 1) return Wd[2];                                                                      // eave beam
        if (front) {
          if (x >= DOOR.x0 && x <= DOOR.x1 && z <= 15) { if (x === DOOR.x0 || x === DOOR.x1 || z === 15) return Wd[1]; if (x === DOOR.x1 - 2 && z === 9) return Ac[1]; return (x - DOOR.x0) % 3 === 0 ? G[1] : G[2]; }
          for (const u0 of WINS) { const w = win(x, z, u0, 8, 9); if (w) return w; } }
        if (side) { const w = win(y, z, Math.round((CY0 + CY1) / 2) - 4, 8, 8); if (w) return w; }
        if (back) { const w = win(x, z, Math.round(cx) - 4, 8, 8); if (w) return w; }
        return logs(z); }
      if (y === CY1 + 1 && z >= 6 && z <= 7) for (const u0 of WINS) if (x >= u0 && x <= u0 + 8) return z === 6 ? Wd[1] : ((x % 3 === 0) ? Ac[3] : (x % 3 === 1) ? G[3] : Rf[3]); // flower boxes
      if (y === CY1 + 1 && x === DOOR.x1 + 2 && z >= 12 && z <= 15) return z === 15 ? Wd[1] : z === 12 ? Wd[1] : Ac[1];               // the lantern
      const P0 = DOOR.x0 - 6, P1 = DOOR.x1 + 6;
      if (y > CY1 && y <= CY1 + 6 && x >= P0 && x <= P1) {                                                  // the porch
        if (z <= 1) return (x & 1) ? Wd[3] : Wd[4];
        if ((x === P0 || x === P1) && y === CY1 + 6 && z <= 16) return Wd[2];
        if (z === 17 + Math.floor((CY1 + 1 - y) / 2) + 2 || z === 18 + Math.floor((CY1 + 1 - y) / 2) + 2) return z % 2 ? PAL.dark(roof, 1) : roof;
        return null; }
      if (z === 0 && y > CY1 + 6 && y <= CY1 + 8 && x >= DOOR.x0 && x <= DOOR.x1) return St[3];             // doorstep
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 0.8, x0: CX0 - 3, x1: CX1 + 3, y0: CY0 - 2, y1: CY1 + 2, fy0: CY0, fy1: CY1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[2] });
      if (r === 'fill') { if (y >= CY1 - 1 && Math.abs(x - cx) <= 2 && z >= ZW + 4 && z <= ZW + 7) return (Math.abs(x - cx) === 2 || z === ZW + 4 || z === ZW + 7) ? Wd[1] : Wt[3]; return logs(z); }
      if (r) return r;
      return null; });
    // being built (the same size): the footing, the first log courses round three walls, corner and door posts, the eave beams,
    // a rafter pair on each gable, and logs and planks waiting out front
    const frame = B(CW, CD, ZW + 18, (x, y, z) => {
      const inX = x >= CX0 && x <= CX1, inY = y >= CY0 && y <= CY1, edge = x === CX0 || x === CX1 || y === CY0 || y === CY1;
      if (z <= 2 && x >= CX0 - 1 && x <= CX1 + 1 && y >= CY0 - 1 && y <= CY1 + 1) { const rim = x <= CX0 || x >= CX1 || y <= CY0 || y >= CY1;
        if (rim) return (z === 2 || (x + y + z) % 5) ? St[2] : St[1]; return z === 0 ? ((x % 4) ? Wd[3] : Wd[2]) : null; } // footing, a plank floor inside
      if (!(inX && inY)) {
        if (y >= CY1 + 3 && y <= CY1 + 7 && x >= CX1 - 12 && x <= CX1 && z <= 5) return z === 5 ? Wd[4] : (z % 2 ? Wd[3] : Wd[2]);  // planks
        if (y >= CY1 + 3 && y <= CY1 + 8 && x >= CX0 && x <= CX0 + 12 && z <= 4 && !((z === 4) && (y === CY1 + 3 || y === CY1 + 8))) return (x === CX0 || x === CX0 + 12) ? Wd[1] : Wd[2]; // logs
        return null; }
      const post = (x === CX0 || x === CX1) && (y === CY0 || y === CY1), doorPost = y === CY1 && (x === DOOR.x0 || x === DOOR.x1);
      if ((post || doorPost) && z <= ZW) return Wd[1];
      if (edge && y !== CY1 && z >= 3 && z <= 8) return logs(z);                                            // first courses
      if (edge && z === ZW) return Wd[2];                                                                   // eave beams
      if ((y === CY0 || y === CY1) && z > ZW && Math.abs(Math.abs(x - cx) - (CX1 + 3 - cx - (z - ZW) * 1.25)) < 0.9 && Math.abs(x - cx) <= CX1 - cx) return Wd[1]; // rafters
      if ((y === CY0 || y === CY1) && Math.abs(x - cx) < 1 && z > ZW && z <= ZW + 13) return Wd[1];        // king post
      return null; });
    // a little hen house: plank walls, a sloped roof, a round door and a ramp
    const coop = B(18, 12, 14, (x, y, z) => { const X0 = 1, X1 = 16, Y0 = 1, Y1 = 9;
      if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && z >= 2 && z <= 7) { const edge = x === X0 || x === X1 || y === Y0 || y === Y1; if (!edge) return Wd[3];
        if (y === Y1 && x >= 7 && x <= 9 && z >= 2 && z <= 4) return Wd[1]; return (x % 3 === 0) ? Wd[2] : Wd[4]; }
      if ((x === X0 || x === X1) && (y === Y0 || y === Y1) && z < 2) return Wd[1];                                // legs
      if (y >= 10 && y <= 11 && x >= 7 && x <= 9 && z === 11 - y) return Wd[2];                                  // ramp
      if (z >= 8 && x >= 0 && x <= 17 && y >= 0 && y <= 10 && z === 8 + Math.floor((10 - y) / 3)) return (x % 4 === 0) ? PAL.dark(Rf[2], 1) : Rf[2];
      return null; });
    const bench = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models() ? root.PFDecorArt.models().bench : null;
    return { cottages: [cottage(Rf[3]), cottage(G[2])], frame, coop, bench };
  }

  // ---------- ground: a packed-dirt yard in front of the door and round the six tiles ----------
  const feet = () => (S && S.home ? S.home.houses : []).map(h => ({ h, L: HM.layout(h) }));
  let FEET = [];
  function ground(x, y) {
    for (const { h, L } of FEET) { const f = L.foot; if (x < f[0] - 1 || x > f[2] + 1 || y < f[1] - 1 || y > f[3] + 1) continue;
      const t0 = L.tiles[0], t5 = L.tiles[5], tx0 = Math.min(t0.x, t5.x) - 6, tx1 = Math.max(t0.x, t5.x) + 6;
      const inTiles = x >= tx0 && x <= tx1 && y >= h.y - 9 && y <= h.y + 9;
      const path = Math.abs(x - h.x) < 3.2 + (hash(Math.floor(x), Math.floor(y), 3) - 0.5) && y > h.y + HM.HOUSE.hd && y < h.y + 13;
      const yard = Math.hypot((x - L.door.x) / 9, (y - L.door.y - 1) / 4) < 1;
      if (inTiles || path || yard) { const k = hash(Math.floor(x * 2), Math.floor(y * 2), 7); return [k > 0.86 ? Wd[3] : Wd[4], 'dirt']; }
    }
    return null;
  }

  // ---------- props ----------
  function mount(x) { X = x; S = x.S; MD = makeModels(x); mounted = true; sync(true); return api; }
  const removeAll = () => { for (const q of own) { const i = X.props.indexOf(q); if (i >= 0) X.props.splice(i, 1); } own.length = 0; };
  function sync(force) {
    if (!mounted) return; const hs = S.home ? S.home.houses : [];
    const k = hs.map(h => [h.site, h.x, h.y, h.m, h.built ? 1 : 0].join(':')).join('|'); if (!force && k === lastKey) return;
    const moved = k !== lastKey; lastKey = k; removeAll(); FEET = feet();
    hs.forEach((h, i) => { const L = HM.layout(h);
      if (!h.built) { own.push(X.addProp(MD.frame, h.x, h.y + CY, 0, { xp: 1, big: 1, home: i })); return; }
      own.push(X.addProp(MD.cottages[i % MD.cottages.length], h.x, h.y + CY, 0, { xp: 1, big: 1, home: i }));
      own.push(X.addProp(MD.coop, L.coop.x, L.coop.y, 0, { xp: 1, home: i }));
      if (MD.bench) own.push(X.addProp(MD.bench, L.bench.x, L.bench.y, 0, { xp: 1, home: i })); });
    // the yard is cleared: the meadow's wild bushes inside the footprint go (they are scenery, never saved)
    for (const { L } of FEET) for (let i = X.props.length - 1; i >= 0; i--) { const q = X.props[i]; if (q.tree && q.tree.kind === 'bush' && inYard(q.x, q.y)) X.props.splice(i, 1); }
    if (moved && X.repaint) for (const { L } of FEET) X.repaint([L.foot[0] - 4, L.foot[1] - 4, L.foot[2] + 4, L.foot[3] + 4]);
    X.markNavDirty();
  }
  // the parts people walk round: the house (or its frame) and the hen house
  function blocks() { const out = []; for (const h of (S && S.home ? S.home.houses : [])) { const L = HM.layout(h); out.push(L.block); if (h.built) out.push(L.coopBlock); } return out; }
  // evenings: the windows glow once someone lives there
  function lights(hz, T) {
    if (!(T >= 17 * 60 + 30 || T < 6 * 60 + 30)) return;
    const fy = toWorld(0, CY1 + 1).dy, lant = toWorld(DOOR.x1 + 2, CY1 + 1);
    for (const h of (S && S.home ? S.home.houses : [])) if (h.built && h.kid) {
      for (const u0 of WINS) hz(h.x + toWorld(u0 + 4.5, 0).dx, h.y + fy + 1, 12, 22, 0.85);
      hz(h.x + lant.dx, h.y + lant.dy + 1, 14, 14, 0.8); }
  }
  // the chimney top (world units, z up) of each house someone lives in, for a curl of smoke
  function smoke() { const c = toWorld((CHIM.x0 + CHIM.x1) / 2 + 0.5, (CHIM.y0 + CHIM.y1) / 2 + 0.5);
    return (S && S.home ? S.home.houses : []).filter(h => h.built && h.kid).map(h => ({ x: h.x + c.dx, y: h.y + c.dy, z: (CHIM.top + 1) / 2 })); }
  const inYard = (x, y) => feet().some(({ L }) => x > L.foot[0] - 3 && x < L.foot[2] + 3 && y > L.foot[1] - 3 && y < L.foot[3] + 3);
  const repaintAt = f => { if (X && X.repaint) X.repaint([f[0] - 4, f[1] - 4, f[2] + 4, f[3] + 4]); };
  const api = { mount, sync, inYard, repaintAt, ground, blocks, lights, smoke, models: () => MD, state: () => ({ props: own.length, key: lastKey }) };
  root.PFHomeArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
