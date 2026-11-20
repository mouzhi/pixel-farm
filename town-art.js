// 像素农场 · 第 10 阶段（v5.8.0）的画面：镇子的地面、学校、小店、民居、广场喷泉、镇子篱笆和镇门（买下前关着，买下后打开），
// 东边新长出来的一条林子和崖壁。Rules live in town.js (pure, unit-tested). game.js calls ground() while painting the ground canvas,
// mount(X) once its models exist and sync() whenever the town is bought (idempotent: a key decides).
'use strict';
(function (root) {
  const TN = root.PFTown, PL = root.PFPlots, HL = root.PFHall; // HL: v5.10.0 镇公所 and the new houses
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink, G = R.green;
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = { gate: [], always: [], cleared: [], hall: [] };
  const hash = (a, b, c) => { let n = a * 374761393 + b * 668265263 + c * 1442695; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };

  // ---------- ground (called for every ground pixel inside the strip; null: not ours) ----------
  function ground(x, y) {
    if (!TN.inTown(x, y)) return null;
    const P = TN.PLAZA, d = Math.hypot(x - P.x, y - P.y), H = S && S.town && S.town.hall, r = root.PFMarket && root.PFMarket.built(H) ? root.PFMarket.PLAZA_R : P.r; // v5.10.3: the market square is bigger
    if (d < r) { const cx = Math.floor((x + 400) / 3), cy = Math.floor((y + 400) / 3), k = hash(cx, cy, 5); // cobbles, a ring of darker stones at the edge
      if (d > r - 1.4) return [St[1], 'dirt']; return [(cx + cy) % 2 ? (k > 0.5 ? St[3] : St[2]) : (k > 0.7 ? St[2] : St[3]), 'dirt']; }
    const SC = root.PFSchool, yard = (SC && SC.built(H)) ? SC.YARD : TN.SCHOOLYARD;
    if (TN.inRect(x, y, yard)) {
      if (SC && SC.built(H) && SC.onTrack(x, y)) { const k = hash(Math.floor(x), Math.floor(y), 11); return [k > 0.55 ? St[1] : Wd[2], 'dirt']; }
      const k = hash(Math.floor(x), Math.floor(y), 9); return [k > 0.8 ? Wd[3] : Wd[4], 'dirt']; }
    const k = hash(Math.floor(x / 5), Math.floor(y / 5), 3); return [k > 0.82 ? G[3] : G[2], 'grass'];
  }

  // ---------- models (voxel = 1 screen px; 2 voxels per world unit) ----------
  function makeModels(x) {
    const B = x.buildModel, gable = x.gableY;
    // a town house: plastered walls, a timber band, two windows and a door on the front (+y), a gable roof
    const house = roof => B(24, 20, 24, (x, y, z) => { const X0 = 2, X1 = 21, Y0 = 2, Y1 = 17, ZW = 11;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 10 && x <= 13 && z <= 7) return z === 7 ? Wd[2] : (x === 12 && z === 4 ? Ac[1] : Wd[1]);
        if ((front || back) && (x === 5 || x === 6 || x === 17 || x === 18) && z >= 5 && z <= 8) return z === 8 ? Wd[2] : Wt[3];
        if (side && y >= 8 && y <= 11 && z >= 5 && z <= 8) return Wt[3];
        return z === ZW || z === 4 ? Wd[2] : Ac[0]; }
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[4] });
      if (r === 'fill') return Ac[0]; if (r) return r;
      if (x >= 15 && x <= 17 && y >= 6 && y <= 8 && z <= 24) return z >= 22 ? St[1] : St[2]; // chimney
      return null; });
    // 镇上小店: a long shop with a striped awning, a shop sign and crates of goods by the door
    const shop = B(52, 32, 26, (x, y, z) => { const X0 = 2, X1 = 49, Y0 = 2, Y1 = 25, ZW = 12;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 23 && x <= 28 && z <= 8) return z === 8 ? Wd[2] : (x === 25 || x === 26 ? Wd[1] : Wd[2]);
        if (front && ((x >= 7 && x <= 18) || (x >= 33 && x <= 44)) && z >= 3 && z <= 8) return (z === 3 || z === 8 || x === 12 || x === 13 || x === 38 || x === 39) ? Wd[2] : Wt[3];
        return z === ZW ? Wd[2] : Wd[4]; }
      if (y >= 26 && y <= 30 && x >= 3 && x <= 48 && z === 10 - (y - 26)) return ((x >> 2) & 1) ? Rf[2] : Ac[0];               // the awning
      if (y >= 26 && y <= 29 && (x === 4 || x === 47) && z < 10 - (y - 26)) return Wd[2];                                        // awning posts
      if (y >= 27 && y <= 30 && ((x >= 6 && x <= 10) || (x >= 40 && x <= 44)) && z <= 3) return z === 3 ? ((x + y) % 2 ? Ac[2] : G[4]) : Wd[2]; // crates of produce
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1.3, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1, fy0: Y0, fy1: Y1 - 1, base: G[2], line: G[1], ridge: G[1], trim: Wd[4] });
      if (r === 'fill') return Wd[4]; if (r) return r;
      if (y === 25 && x >= 17 && x <= 34 && z >= 13 && z <= 17) return (z === 13 || z === 17 || x === 17 || x === 34) ? Wd[1] : ((x + z) % 3 === 0 ? Ac[1] : Wd[5]); // the sign
      return null; });
    // 学校: a long plastered schoolhouse, a row of windows, double doors, a red roof with a little bell tower, a flag pole
    const school = B(68, 40, 44, (x, y, z) => { const X0 = 2, X1 = 65, Y0 = 4, Y1 = 33, ZW = 14;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Ac[0];
        if (z <= 1) return St[1];
        if (front && x >= 30 && x <= 37 && z <= 10) return z === 10 ? Wd[2] : (x === 33 || x === 34 ? Wd[1] : Rf[1]);
        if ((front || back) && z >= 5 && z <= 10 && x >= 6 && x <= 61 && (x - 6) % 8 < 4 && !(x >= 28 && x <= 39)) return z === 10 || z === 5 ? Ac[0] : Wt[3];
        if (side && y >= 12 && y <= 25 && (y - 12) % 8 < 4 && z >= 5 && z <= 10) return Wt[3];
        return z === ZW ? Wd[2] : z <= 2 ? St[2] : Ac[0]; }
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1.2, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: Rf[2], line: Rf[1], ridge: Rf[1], trim: Wd[4] });
      if (r === 'fill') return Ac[0]; if (r) return r;
      if (x >= 31 && x <= 36 && y >= 16 && y <= 21 && z >= 26 && z <= 37) { const edge = x === 31 || x === 36 || y === 16 || y === 21;
        if (z >= 34) return z - 34 < 3 - Math.max(Math.abs(x - 33.5), Math.abs(y - 18.5)) + 1 ? Rf[1] : null;
        if (z >= 29 && z <= 32 && !edge) return (z === 30 && x >= 33 && x <= 34 && y >= 18 && y <= 19) ? Ac[1] : null; // the bell
        return edge ? Wd[4] : null; }
      if (x === 64 && y === 37 && z <= 42) return St[3];                                         // the flag pole
      if (z >= 36 && z <= 40 && y === 37 && x >= 56 && x < 64) return z === 38 ? Ac[0] : Rf[2];  // the flag
      return null; });
    // a round fountain on the square
    const fountain = B(18, 18, 14, (x, y, z) => { const c = Math.hypot(x + 0.5 - 9, y + 0.5 - 9);
      if (c > 8.6) return null;
      if (z <= 2) return c > 7.2 ? (z === 2 ? St[3] : St[2]) : (z === 2 ? Wt[3] : St[1]);
      if (c < 1.4 && z <= 9) return z === 9 ? Wt[4] : St[2];
      if (c < 3.2 && z >= 6 && z <= 7) return z === 7 ? (c > 2.4 ? St[3] : Wt[4]) : St[2];
      if (c < 0.8 && z >= 10 && z <= 12) return Wt[4];
      return null; });
    // the town gate: open (two stone posts and a beam with a sign) and the town's fence
    // posts a little taller than the shut gate's and a beam with a small hanging sign; nothing in the opening
    const gateOpen = B(6, 28, 32, (x, y, z) => { const post = true;
      if (post && (y <= 3 || y >= 24) && z <= 28) return z >= 27 ? St[3] : ((z % 6) === 0 ? St[1] : St[2]);
      if (post && z >= 26 && z <= 28 && y > 3 && y < 24) return Wd[2];
      if (x >= 2 && x <= 3 && z >= 19 && z <= 24 && y >= 9 && y <= 18) return (z === 19 || z === 24 || y === 9 || y === 18) ? Wd[1] : (((y + z) % 3) ? Wd[4] : Ac[1]);
      if (x >= 2 && x <= 3 && z === 25 && (y === 10 || y === 17)) return Ink[0];
      return null; });
    const flowers = B(10, 6, 5, (x, y, z) => { if (z <= 1) return (x === 0 || x === 9 || y === 0 || y === 5) ? Wd[2] : Wd[1];
      if (z <= 3 && x > 0 && x < 9 && y > 0 && y < 5) { const k = (x * 5 + y * 3) % 7; return z === 3 ? (k === 0 ? Ac[3] : k === 2 ? Ac[1] : k === 4 ? Rf[3] : null) : G[3]; } return null; });
    // ---------- v5.10.0: 镇公所, the notice board, three two-storey houses, the scaffolding, street things ----------
    // 镇公所: a stone-based civic hall, pillars by the double door, a clock in the front gable, a little flag
    const hall = B(40, 32, 46, (x, y, z) => { const X0 = 2, X1 = 37, Y0 = 3, Y1 = 26, ZW = 17;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Ac[0];
        if (z <= 3) return (z === 3 ? St[3] : St[2]);
        if (front && x >= 16 && x <= 23 && z <= 11) return z === 11 ? St[3] : (x === 19 || x === 20 ? Wd[1] : Wd[2]);
        if (front && (x === 13 || x === 14 || x === 25 || x === 26) && z <= 15) return z >= 14 ? St[3] : St[2]; // pillars
        if ((front || back) && z >= 6 && z <= 12 && ((x >= 5 && x <= 10) || (x >= 29 && x <= 34))) return z === 6 || z === 12 || x === 5 || x === 10 || x === 29 || x === 34 ? Ac[0] : (z === 9 ? Ac[0] : Wt[3]);
        if (side && y >= 9 && y <= 20 && (y - 9) % 7 < 4 && z >= 6 && z <= 12) return Wt[3];
        return z === ZW || z === ZW - 1 ? St[3] : Ac[0]; }
      if (front_steps(x, y, z)) return St[2];
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1.1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: St[1], line: Ink[0], ridge: Ink[0], trim: St[3] });
      if (r === 'fill') { if (y >= Y1 - 1 && z >= 21 && z <= 27 && Math.hypot(x - 19.5, z - 24) < 3.6) return Math.hypot(x - 19.5, z - 24) < 2.6 ? ((x === 19 || x === 20) && z >= 24 || (z === 24 && x >= 19 && x <= 21) ? Ink[0] : Ac[0]) : Wd[1]; return Ac[0]; }
      if (r) return r;
      if (x === 19 && y === 14 && z >= 33 && z <= 45) return St[3];                       // the flag pole on the ridge
      if (y === 14 && z >= 41 && z <= 44 && x >= 20 && x <= 26) return z === 42 || z === 43 ? Rf[2] : Ac[0];
      return null; });
    function front_steps(x, y, z) { return y >= 27 && y <= 29 && x >= 14 && x <= 25 && z <= 29 - y; }
    // the notice board: two posts, a little roof, pinned notes
    const board = B(16, 4, 20, (x, y, z) => {
      if ((x === 1 || x === 14) && y >= 1 && y <= 2 && z <= 15) return Wd[1];
      if (z >= 16 && z <= 17 && y <= 3) return z === 17 ? Rf[1] : Rf[2];
      if (y === 2 && x >= 1 && x <= 14 && z >= 6 && z <= 15) { if (x === 1 || x === 14 || z === 6 || z === 15) return Wd[1];
        const note = (x >= 3 && x <= 6 && z >= 9 && z <= 13) ? Ac[0] : (x >= 8 && x <= 12 && z >= 10 && z <= 14) ? '#f2cf55' : (x >= 8 && x <= 11 && z >= 7 && z <= 8) ? Ac[0] : null;
        return note && (x + z) % 4 === 0 ? Ink[0] : note || Wd[3]; }
      return null; });
    // three two-storey houses (16 x 14 world units: a size up from the old houses), front on +y (the lots turn them to the street)
    const W2 = 32, D2 = 28;
    const twoStorey = style => B(W2, D2 + 6, 44, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 2, Y1 = 25, ZW = 22, F1 = 11; // F1: the floor between storeys
      const brick = style === 1, shop = style === 2;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 13 && x <= 17 && z <= 8) return z === 8 ? Wd[2] : (x === 16 && z === 4 ? Ac[1] : Wd[1]);                  // the door
        if (shop && front && z >= 2 && z <= 8 && ((x >= 4 && x <= 11) || (x >= 19 && x <= 27))) return z === 2 || z === 8 || x === 4 || x === 11 || x === 19 || x === 27 ? Wd[1] : (z <= 4 && (x * 3 + z) % 5 < 2 ? (x % 2 ? Ac[3] : Rf[3]) : Wt[3]); // shop windows with flowers inside
        if (!shop && (front || back) && z >= 3 && z <= 8 && ((x >= 5 && x <= 9) || (x >= 21 && x <= 25))) return z === 3 || z === 8 ? Wd[2] : Wt[3];
        if ((front || back) && z >= F1 + 3 && z <= F1 + 8 && ((x >= 5 && x <= 9) || (x >= 13 && x <= 17) || (x >= 21 && x <= 25))) return z === F1 + 3 || z === F1 + 8 ? (brick ? Ac[0] : Wd[2]) : Wt[3];
        if (side && y >= 9 && y <= 18 && ((z >= 3 && z <= 8) || (z >= F1 + 3 && z <= F1 + 8)) && (y - 9) % 6 < 4) return Wt[3];
        if (z === F1 || z === ZW) return Wd[2];                                                                                       // the band between storeys
        if (brick) return ((z + (((x + y) >> 2) & 1)) % 3 === 0) ? Rf[1] : Rf[2];
        if (style === 0) return (x === X0 || x === X1 || (front || back) && (x === 11 || x === 19)) ? Wd[2] : Ac[0];               // timber frame, plaster
        return z < F1 ? Wd[4] : Ac[0]; }
      if (style === 0 && y >= 26 && y <= 29 && x >= 4 && x <= 26) { if (z === F1) return Wd[2]; if (z >= F1 + 1 && z <= F1 + 4 && (y === 29 || x === 4 || x === 26) && (z === F1 + 4 || x % 3 === 0)) return Wd[1]; } // the balcony
      if (style === 0 && x === 30 && (y === 6 || y === 20) && z <= 12) return Wd[1];                                                // the clothes-line posts
      if (style === 0 && x === 30 && y > 6 && y < 20 && z === 11) return (y % 3 === 0) ? Ac[0] : (y % 3 === 1 ? Rf[3] : null);
      if (shop && y >= 26 && y <= 30 && x >= 3 && x <= 28 && z === 10 - (y - 26)) return ((x >> 2) & 1) ? G[3] : Ac[0];               // the shop's awning
      if (shop && y >= 27 && y <= 30 && x >= 22 && x <= 27 && z <= 2) return z === 2 ? ((x + y) % 3 ? Ac[3] : Rf[3]) : Wd[2];           // buckets of flowers
      const roof = style === 1 ? St[1] : style === 2 ? G[2] : Rf[2];
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[4] });
      if (r === 'fill') return (brick && y >= Y1 - 1 && z >= ZW + 3 && z <= ZW + 7 && x >= 13 && x <= 17) ? (z === ZW + 3 || z === ZW + 7 || x === 13 || x === 17 ? Ac[0] : Wt[3]) : (brick ? Rf[2] : Ac[0]); // the attic window
      if (r) return r;
      if (brick && x >= 22 && x <= 25 && y >= 8 && y <= 11 && z <= 40) return z >= 38 ? St[1] : Rf[1];                          // a tall chimney
      if (!brick && x >= 6 && x <= 8 && y >= 16 && y <= 18 && z <= 36) return z >= 34 ? St[1] : St[2];
      return null; }, );
    // scaffolding: poles, planks and the ground floor half up
    const scaffold = B(W2, D2, 30, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 2, Y1 = 25;
      const pole = (x === 0 || x === 31 || x === 15) && (y === 0 || y === 27);
      if (pole && z <= 28) return Wd[1];
      if ((z === 10 || z === 20) && (y === 0 || y === 27 || x === 0 || x === 31)) return Wd[3];                                // planks
      if (z <= 6 && x >= X0 && x <= X1 && y >= Y0 && y <= Y1 && (x <= X0 + 1 || x >= X1 - 1 || y <= Y0 + 1 || y >= Y1 - 1)) return z === 0 ? St[1] : ((x + z) % 4 ? Wd[3] : Wd[2]);
      if (y === 27 && x >= 3 && x <= 28 && (x - z * 2) === 3) return Wd[2];                                                       // a ladder-ish brace
      return null; });
    // street things: a red post box, a hand cart, crates, a sun shade
    const mailbox = B(4, 4, 12, (x, y, z) => (z <= 5 ? (x >= 1 && x <= 2 && y >= 1 && y <= 2 ? St[1] : null) : z <= 11 ? (z === 9 && y === 3 && x >= 1 && x <= 2 ? Ink[0] : Rf[2]) : null));
    const cart = B(14, 10, 10, (x, y, z) => { if ((y === 0 || y === 9) && Math.hypot(x - 5, z - 3) < 3.2) return Math.hypot(x - 5, z - 3) < 1.2 ? Wd[1] : (Math.hypot(x - 5, z - 3) > 2.3 ? Wd[1] : null);
      if (y >= 1 && y <= 8 && x >= 1 && x <= 10 && z >= 4 && z <= 7) { if (z === 4 || x === 1 || x === 10 || y === 1 || y === 8) return Wd[2]; return z === 7 ? ((x + y) % 3 === 0 ? Ac[2] : (x + y) % 3 === 1 ? G[3] : Rf[3]) : null; }
      if (x >= 11 && x <= 13 && (y === 3 || y === 6) && z === 6) return Wd[1]; return null; });
    const crates = B(12, 8, 10, (x, y, z) => { const a = x <= 5 && y <= 7 && z <= 5, b = x >= 6 && y >= 1 && z <= 4, c = x >= 2 && x <= 7 && y >= 1 && y <= 6 && z >= 6 && z <= 9;
      if (!(a || b || c)) return null; const e = (x === 0 || x === 5 || x === 6 || x === 11 || z === 5 || z === 4 || z === 9) ; return e ? Wd[1] : Wd[3]; });
    const parasol = B(18, 18, 22, (x, y, z) => { const c = Math.hypot(x + 0.5 - 9, y + 0.5 - 9);
      if (c < 1 && z <= 18) return Wd[1]; if (z >= 16 && z <= 19 && c < 9 - (z - 16) * 2.4) return (Math.floor(Math.atan2(y - 9, x - 9) / (Math.PI / 4)) & 1) ? Ac[0] : Rf[2];
      if (z <= 3 && c >= 3 && c <= 5 && ((x + y) % 5 === 0)) return Wd[2]; return null; });
    // v5.10.3 集市: a market stall (posts, a counter of goods, a back shelf, a striped awning); bare frames while it is going up
    const AWN = [[Rf[2], Ac[0]], [G[3], Ac[0]], [Wt[3], Ac[0]], [Ac[2], Rf[3]], [Rf[3], Ac[0]]];
    const GOODS = { farm: [G[3], Ac[2], Rf[2], G[4] || G[3]], n0: [Wd[3], Ac[2], St[2]], n3: [Wd[4], Wd[3], Ac[0]], n7: [Rf[2], Ac[2], Ac[0], G[3]], n5: [Wt[3], Rf[3], Ac[0], G[2]], v: [St[2], St[1], Wd[2]] };
    const marketStall = (awn, goods, bare) => B(22, 16, 20, (x, y, z) => {
      const post = (x === 2 || x === 19) && (y === 3 || y === 13);
      if (post && z <= 15) return Wd[1];
      if (bare) { if ((z === 15) && (y === 3 || y === 13) && x >= 2 && x <= 19) return Wd[3]; if (z <= 1 && y >= 10 && y <= 13 && x >= 3 && x <= 18 && (x % 3)) return Wd[3]; return null; }
      if (y >= 10 && y <= 13 && x >= 2 && x <= 19 && z <= 6) { if (z === 6) return Wd[3]; return y === 13 ? (x % 5 === 2 ? Wd[1] : Wd[2]) : Wd[1]; }          // the counter
      if (y >= 10 && y <= 12 && x >= 3 && x <= 18 && (z === 7 || (z === 8 && hash(x, y, 31) > 0.45)) && x % 4 !== 2) return goods[((x >> 2) + y) % goods.length]; // goods in heaps
      if (y >= 3 && y <= 4 && x >= 3 && x <= 18 && z <= 9) return z === 9 ? Wd[3] : (z % 3 ? null : Wd[2]);                                            // the back shelf
      if (y >= 3 && y <= 4 && x >= 4 && x <= 17 && (z === 4 || z === 7 || z === 10) && x % 3 !== 0) return goods[(x + z) % goods.length];
      const az = y < 8 ? 17 : 16; // the awning, tipped to the front, scalloped at its edge
      if (x >= 1 && x <= 20 && y >= 1 && y <= 15 && z === az) return ((x >> 1) & 1) ? awn[0] : awn[1];
      if (y === 15 && x >= 1 && x <= 20 && z === 15 && !((x >> 1) & 1)) return awn[0];
      return null; });
    const stalls = HL && root.PFMarket ? root.PFMarket.STALLS.map(st => marketStall(AWN[st.awn % AWN.length], GOODS[st.who] || GOODS.v, false)) : [];
    const stallFrame = marketStall(AWN[0], GOODS.v, true);
    // v5.10.4: 小桃's bakery — warm plaster, a crust-coloured roof, bread in the windows on both sides, a deep awning, a loaf on the ridge (readable from the usual south camera, not only from the street)
    const bakery = B(W2, D2 + 6, 48, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 2, Y1 = 25, ZW = 22, F1 = 11, crust = Rf[3] || Rf[2], wall = Wd[4];
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 13 && x <= 17 && z <= 8) return z === 8 ? Wd[2] : (x === 16 && z === 4 ? Ac[1] : Wd[1]);
        if ((front || back) && z >= 2 && z <= 8 && ((x >= 4 && x <= 11) || (x >= 19 && x <= 27))) return z === 2 || z === 8 || x === 4 || x === 11 || x === 19 || x === 27 ? Wd[1] : (z <= 5 && (x + z) % 4 < 2 ? (x % 2 ? Wd[4] : crust) : Wt[3]); // windows with loaves, street and south
        if ((front || back) && z >= F1 + 3 && z <= F1 + 8 && ((x >= 5 && x <= 9) || (x >= 13 && x <= 17) || (x >= 21 && x <= 25))) return z === F1 + 3 || z === F1 + 8 ? Wd[2] : Wt[3];
        if (side && y >= 9 && y <= 18 && ((z >= 3 && z <= 8) || (z >= F1 + 3 && z <= F1 + 8)) && (y - 9) % 6 < 4) return Wt[3];
        if (z === F1 || z === ZW) return Wd[4];
        return (x === X0 || x === X1 || (front || back) && (x === 11 || x === 19)) ? Wd[2] : (z < F1 ? wall : Ac[0]); }
      if (y >= 26 && y <= 33 && x >= 2 && x <= 29) { const az = 12 - (y - 26); // deep cream-and-crust awning over the street
        if (z === az) return ((x >> 2) & 1) ? crust : Ac[0];
        if (y === 33 && z === az - 1 && !((x >> 2) & 1)) return crust; }
      if (y >= 27 && y <= 31 && ((x >= 4 && x <= 10) || (x >= 21 && x <= 27)) && z <= 3) return z === 3 ? ((x + y) % 3 ? Wd[4] : crust) : Wd[2];
      if (y >= 26 && y <= 29 && x >= 14 && x <= 18 && z >= 13 && z <= 18) { const cx = 16, cz = 15.5, rr = Math.hypot(x - cx, z - cz); if (rr < 2.6) return rr < 1.3 ? Wd[4] : crust; }
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: crust, line: PAL.dark(crust, 1), ridge: PAL.dark(crust, 1), trim: Wd[4] });
      if (r === 'fill') return Ac[0];
      if (r) return r;
      if (y <= 1 && x >= 11 && x <= 21 && z >= 14 && z <= 25) { // a south-facing shop sign, the usual camera looks this way
        if (x === 16 && z <= 20) return Wd[1];
        if (z >= 16 && z <= 25 && x >= 12 && x <= 20) {
          if (x === 12 || x === 20 || z === 16 || z === 25) return Wd[1];
          return ((x + z) % 3 === 0) ? crust : Ac[0]; } }
      if (z >= 32 && z <= 47 && x >= 10 && x <= 22 && y >= 9 && y <= 18) { // a cream loaf on the ridge, so it doesn't disappear into the terracotta
        const e = ((x - 16) / 5.5) ** 2 + ((y - 13.5) / 3.6) ** 2 + ((z - 40) / 6) ** 2; if (e < 1) return e < 0.28 ? Wd[4] : (e < 0.85 ? Ac[0] : Wd[2]); }
      if (x >= 22 && x <= 26 && y >= 7 && y <= 11 && z <= 44) return z >= 42 ? St[1] : Rf[1]; // the oven chimney
      return null; });
    const orderBoard = B(14, 4, 20, (x, y, z) => {
      if ((x === 1 || x === 12) && y <= 2 && z <= 16) return Wd[1];
      if (z >= 17 && z <= 18 && y <= 3) return z === 18 ? Rf[3] : Rf[2];
      if (y === 2 && x >= 1 && x <= 12 && z >= 6 && z <= 16) { if (x === 1 || x === 12 || z === 6 || z === 16) return Wd[1];
        return ((x + z) % 3 === 0) ? Ink[0] : Ac[0]; }
      return null; });
    // v5.10.5 木工坊 — timber-frame shed, a saw-and-log on the ridge (readable from the usual south camera), a stone chimney, lumber in the windows
    const woodshop = B(W2, D2 + 6, 48, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 2, Y1 = 25, ZW = 20, wall = Wd[4], beam = Wd[2], roof = Wd[1];
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 12 && x <= 19 && z <= 10) return z === 10 || x === 12 || x === 19 ? beam : (z <= 2 ? St[2] : Wd[1]); // a wide workshop door
        if ((front || back) && z >= 3 && z <= 9 && ((x >= 4 && x <= 9) || (x >= 22 && x <= 27))) return z === 3 || z === 9 || x === 4 || x === 9 || x === 22 || x === 27 ? beam : ((x + z) % 3 === 0 ? Wd[3] : Wd[5] || Wd[4]);
        if (side && y >= 8 && y <= 17 && z >= 4 && z <= 9 && (y - 8) % 5 < 3) return beam;
        if (z === ZW) return beam;
        return (x === X0 || x === X1 || (front || back) && (x === 11 || x === 20)) ? beam : wall; }
      if (y >= 26 && y <= 31 && x >= 3 && x <= 28 && z === 11 - (y - 26)) return ((x >> 2) & 1) ? Wd[3] : Wd[5] || Wd[4]; // a short awning over the door
      if (y >= 27 && y <= 30 && ((x >= 3 && x <= 9) || (x >= 22 && x <= 28)) && z <= 3) return z === 3 ? Wd[4] : Wd[2]; // crates of offcuts
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: roof, line: PAL.dark(roof, 1), ridge: Wd[3], trim: Wd[4] });
      if (r === 'fill') return Wd[3]; if (r) return r;
      if (y <= 1 && x >= 10 && x <= 21 && z >= 12 && z <= 22) { // a south-facing sign (the usual camera looks this way)
        if (x === 15 && z <= 16) return Wd[1];
        if (z >= 16 && z <= 22 && x >= 11 && x <= 20) {
          if (x === 11 || x === 20 || z === 16 || z === 22) return Wd[1];
          return ((x + z) % 3 === 0) ? Wd[4] : Wd[2]; } }
      // a pale log and a steel saw standing on the ridge, large enough to read from the usual south camera
      if (z >= 30 && z <= 42 && y >= 9 && y <= 21 && x >= 5 && x <= 22) {
        const cx = 13, cy = 15, cz = 35, e = ((x - cx) / 8.5) ** 2 + ((y - cy) / 3.8) ** 2 + ((z - cz) / 4.2) ** 2;
        if (e < 1) return e < 0.18 ? Wd[2] : (e < 0.7 ? (Wd[5] || Wd[4]) : Wd[3]); }
      if (z >= 32 && z <= 50 && x >= 19 && x <= 30 && y >= 11 && y <= 19) {
        const cx = 24.5, cy = 15, cz = 41, rr = Math.hypot(x - cx, y - cy, (z - cz) * 0.55);
        if (rr < 6.6 && rr > 4.4) return St[3] || St[1]; if (rr <= 4.4 && Math.abs(z - cz) < 1.2) return St[2]; }
      if (x >= 5 && x <= 8 && y >= 7 && y <= 11 && z <= 40) return z >= 38 ? St[1] : St[2]; // chimney
      return null; });
    const timber = B(16, 10, 12, (x, y, z) => { // three logs in a pile
      for (const [cx, cy, cz, ax] of [[4, 4, 3, 1], [10, 5, 3, 1], [7, 4, 7, 0]]) {
        const dx = ax ? (x - cx) / 5.5 : (x - cx) / 2.2, dy = ax ? (y - cy) / 2.2 : (y - cy) / 4.5, dz = (z - cz) / 2.2;
        if (dx * dx + dy * dy + dz * dz < 1) return (dx * dx + dy * dy + dz * dz < 0.2) ? Wd[2] : ((x + y + z) % 3 ? Wd[3] : Wd[1]); }
      return null; });
    // v5.10.5 铁匠铺 — sooty brick, a slate roof, a south-facing forge mouth (glow the usual camera can see), a horseshoe on the ridge, a tall chimney
    const ember = Ac[2], coal = Rf[1], steel = St[1];
    const smithy = B(W2, D2 + 6, 52, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 2, Y1 = 25, ZW = 20;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return St[1];
        if (z === 0) return St[0] || St[1];
        if (front && x >= 13 && x <= 18 && z <= 9) return z === 9 || x === 13 || x === 18 ? Wd[1] : (z <= 1 ? St[2] : Wd[2]); // a heavy door
        // the forge mouth on the south wall (back of the model): a dark arch with a bright heart, readable from the usual camera
        if (back && x >= 10 && x <= 21 && z >= 1 && z <= 10) {
          const cx = 15.5, cz = 5.5, e = ((x - cx) / 5.4) ** 2 + ((z - cz) / 4.4) ** 2;
          if (e < 1) { if (e > 0.72) return St[0] || St[1]; if (e < 0.22) return Ac[1]; return ((x + z) % 2 ? ember : coal); } }
        if (front && z >= 3 && z <= 8 && ((x >= 4 && x <= 9) || (x >= 22 && x <= 27))) return z === 3 || z === 8 || x === 4 || x === 9 || x === 22 || x === 27 ? St[2] : ((x + z) % 4 === 0 ? ember : Wt[2]);
        if (side && y >= 8 && y <= 17 && z >= 4 && z <= 9 && (y - 8) % 5 < 3) return St[2];
        if (z === ZW) return St[2];
        return ((z + (((x + y) >> 2) & 1)) % 3 === 0) ? Rf[1] : St[2]; } // sooty brick
      if (y >= 26 && y <= 30 && x >= 4 && x <= 27 && z === 10 - (y - 26)) return ((x >> 2) & 1) ? St[2] : coal; // a short iron awning
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: steel, line: PAL.dark(steel, 1), ridge: St[0] || St[1], trim: St[2] });
      if (r === 'fill') return St[1]; if (r) return r;
      if (y <= 1 && x >= 10 && x <= 21 && z >= 12 && z <= 22) { // a south-facing iron sign above the forge
        if (x === 15 && z <= 16) return St[1];
        if (z >= 16 && z <= 22 && x >= 11 && x <= 20) {
          if (x === 11 || x === 20 || z === 16 || z === 22) return St[1];
          return ((x + z) % 3 === 0) ? ember : St[2]; } }
      // a bright horseshoe on the ridge, large enough to read from the usual south camera
      if (z >= 32 && z <= 50 && x >= 8 && x <= 24 && y >= 9 && y <= 21) {
        const cx = 16, cy = 15, cz = 41, rx = Math.abs(x - cx), rz = z - cz, ry = Math.abs(y - cy);
        const ring = Math.hypot(rx, rz); if (ry < 3.6 && ring > 4.0 && ring < 7.2 && rz > -3.5) return (ring > 6.2 ? St[3] : St[1]); }
      if (x >= 22 && x <= 27 && y >= 7 && y <= 12 && z <= 50) return z >= 48 ? St[1] : (z % 5 === 0 ? Rf[1] : St[2]); // a tall chimney
      return null; });
    const anvil = B(10, 8, 10, (x, y, z) => {
      if (z <= 2 && x >= 2 && x <= 7 && y >= 2 && y <= 5) return St[1];
      if (z >= 3 && z <= 6 && x >= 3 && x <= 6 && y >= 2 && y <= 5) return St[2];
      if (z >= 7 && z <= 9 && x >= 1 && x <= 8 && y >= 2 && y <= 5) return (z === 9 ? St[3] : St[2]);
      return null; });
    // v5.10.6: a child's own shop (flower / sweet / tackle), a size down from the two-storey lots so it fits L2/L3
    const kidShop = kind => B(24, 22, 32, (x, y, z) => { const X0 = 2, X1 = 21, Y0 = 2, Y1 = 19, ZW = 14;
      const wall = kind === 'flower' ? Ac[0] : kind === 'sweet' ? Wd[4] : Wd[2];
      const trim = kind === 'flower' ? G[2] : kind === 'sweet' ? Rf[3] : St[1];
      const roof = kind === 'flower' ? G[3] : kind === 'sweet' ? (Rf[3] || Rf[2]) : St[2];
      const goods = kind === 'flower' ? [G[3], Ac[3], Rf[3], G[2]] : kind === 'sweet' ? [Wd[4], Rf[3], Ac[0], G[3]] : [St[2], Wd[1], Wt[3], Ink[0]];
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 9 && x <= 13 && z <= 7) return z === 7 ? Wd[2] : (x === 12 && z === 3 ? Ac[1] : Wd[1]);
        if ((front || back) && z >= 2 && z <= 7 && ((x >= 3 && x <= 7) || (x >= 15 && x <= 19))) return z === 2 || z === 7 || x === 3 || x === 7 || x === 15 || x === 19 ? Wd[1] : (z <= 4 ? goods[(x + z) % goods.length] : Wt[3]);
        if (side && y >= 6 && y <= 14 && z >= 3 && z <= 7 && (y - 6) % 5 < 3) return Wt[3];
        if (z === ZW) return trim;
        return wall; }
      if (y >= 20 && y <= 21 && x >= 2 && x <= 21 && z === 9 - (y - 20)) return ((x >> 2) & 1) ? trim : roof;
      if (y >= 20 && y <= 21 && x >= 16 && x <= 20 && z <= 2) return z === 2 ? goods[(x + y) % goods.length] : Wd[2];
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 1, x1: X1 + 1, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[4] });
      if (r === 'fill') return wall; if (r) return r; return null; });
    const kidShops = { flower: kidShop('flower'), sweet: kidShop('sweet'), tackle: kidShop('tackle') };
    // v5.10.9: second classroom (style 6) — a smaller school wing, plaster, red roof, door to the south
    const classroom = B(32, 32, 36, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 3, Y1 = 27, ZW = 14;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Ac[0];
        if (z <= 1) return St[1];
        if (front && x >= 13 && x <= 18 && z <= 9) return z === 9 ? Wd[2] : (x === 15 || x === 16 ? Wd[1] : Rf[1]);
        if ((front || back) && z >= 5 && z <= 10 && x >= 4 && x <= 27 && (x - 4) % 6 < 3 && !(x >= 12 && x <= 19)) return z === 10 || z === 5 ? Ac[0] : Wt[3];
        return z === ZW ? Wd[2] : Ac[0]; }
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1.1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: Rf[2], line: Rf[1], ridge: Rf[1], trim: Wd[4] });
      if (r === 'fill') return Ac[0]; if (r) return r; return null; });
    // v5.10.9: 书屋 (style 7) — plaster, ink-blue roof, books in the windows, a hanging 书 sign
    const library = B(W2, D2 + 6, 44, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 2, Y1 = 25, ZW = 16;
      const roof = '#2a4e88', line = '#1a2e58';
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 12 && x <= 17 && z <= 8) return z === 8 ? Wd[2] : (x === 14 || x === 15 ? Wd[1] : Wd[2]);
        if ((front || back) && z >= 3 && z <= 8 && ((x >= 3 && x <= 9) || (x >= 20 && x <= 26))) {
          if (z === 3 || z === 8 || x === 3 || x === 9 || x === 20 || x === 26) return Wd[1];
          return z <= 5 ? ((x + z) % 3 === 0 ? Rf[2] : (x % 2 ? G[2] : '#d4a04a')) : Wt[3]; } // books on the lower shelf
        return z === ZW ? Wd[2] : Ac[0]; }
      if (y === 26 && x >= 10 && x <= 21 && z >= 17 && z <= 22) return (z === 17 || z === 22 || x === 10 || x === 21) ? Wd[1] : (z === 20 ? '#f6ecd0' : '#2a4e88'); // 书 sign
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1.15, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1, fy0: Y0, fy1: Y1 - 1, base: roof, line, ridge: line, trim: Wd[4] });
      if (r === 'fill') return Ac[0]; if (r) return r; return null; });
    // v5.10.10: 诊所 (style 8) — pale plaster, a green roof, a red cross over the door
    const clinic = B(W2, D2 + 6, 36, (x, y, z) => { const X0 = 2, X1 = 29, Y0 = 2, Y1 = 25, ZW = 16, wall = '#e8eef0', roof = '#2e6b4a', cross = '#c23b2a';
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z === 0) return St[1];
        if (front && x >= 13 && x <= 17 && z <= 8) return z === 8 ? Wd[2] : (x === 16 && z === 4 ? Ac[1] : Wd[1]);
        if ((front || back) && z >= 4 && z <= 10 && ((x >= 4 && x <= 9) || (x >= 21 && x <= 26))) return z === 4 || z === 10 || x === 4 || x === 9 || x === 21 || x === 26 ? Wd[1] : Wt[3];
        if (side && y >= 8 && y <= 17 && z >= 4 && z <= 10 && (y - 8) % 6 < 4) return Wt[3];
        return z === ZW ? Wd[2] : wall; }
      if (y === 26 && x >= 11 && x <= 20 && z >= 18 && z <= 26) {
        if ((z >= 21 && z <= 23) || (x >= 14 && x <= 17 && z >= 19 && z <= 25)) return cross;
        if (z === 18 || z === 26 || x === 11 || x === 20) return Wd[1];
        return wall; }
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1.1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1, fy0: Y0, fy1: Y1 - 1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[4] });
      if (r === 'fill') return wall; if (r) return r;
      if (x >= 24 && x <= 26 && y >= 8 && y <= 10 && z <= 28) return z >= 26 ? St[1] : St[2];
      if (x >= 14 && x <= 17 && y >= 12 && y <= 16 && z >= 28 && z <= 35) { // red cross on the ridge, readable from the usual camera
        if ((x >= 15 && x <= 16 && z >= 28 && z <= 35) || (z >= 31 && z <= 32 && x >= 14 && x <= 17)) return cross; }
      return null; });
    const yardFlag = B(6, 6, 28, (x, y, z) => {
      if (x === 2 && y === 2 && z <= 26) return St[3];
      if (z >= 16 && z <= 22 && y === 2 && x >= 3 && x <= 5) return z === 19 ? Ac[0] : Rf[2];
      return null; });
    const yardPost = B(4, 4, 14, (x, y, z) => (x >= 1 && x <= 2 && y >= 1 && y <= 2 && z <= 13) ? (z === 13 ? Rf[2] : Wd[2]) : null);
    return { houses: [house(Rf[2]), house(Rf[3]), house(St[1])], shop, school, fountain, gateOpen, flowers, hall, board, two: [twoStorey(0), twoStorey(1), twoStorey(2), bakery, woodshop, smithy, classroom, library, clinic], scaffold, mailbox, cart, crates, parasol, stalls, stallFrame, orderBoard, timber, anvil, kidShops, yardFlag, yardPost };
  }

  // ---------- mount: the town is always there to look at; the gate and the walk-in depend on it being bought ----------
  function mount(x) {
    X = x; S = x.S; MD = makeModels(x); const add = x.addProp;
    // the far-off roofs and the old closed gate came from expansion.js; the closed gate is ours to swap from now on
    const xm = x.xpModels && x.xpModels(); own.closed = xm ? X.props.find(p => p.m === xm.townGate) || null : null;
    // keep trees out of the town (the old forest loop reached x 458)
    for (let i = X.props.length - 1; i >= 0; i--) { const p = X.props[i]; if (p.tree && TN.inTown(p.x, p.y, 6)) X.props.splice(i, 1); }
    for (const b of TN.BUILDINGS) { const m = b.kind === 'shop' ? MD.shop : b.kind === 'school' ? MD.school : b.kind === 'hall' ? MD.hall : MD.houses[b.roof || 0];
      own.always.push(add(m, b.x, b.y, b.rot || 0, { xp: 1, big: 1, town: b.id })); }
    own.always.push(add(MD.fountain, TN.PLAZA.x, TN.PLAZA.y, 0, { xp: 1, town: 'fountain' }));
    const bench = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models() && root.PFDecorArt.models().bench;
    if (bench) for (const [bx, by, r] of [[TN.PLAZA.x - 10, TN.PLAZA.y + 14, 0], [TN.PLAZA.x + 14, TN.PLAZA.y - 10, Math.PI / 2], [604, 60, 0], [566, 60, 0]]) own.always.push(add(bench, bx, by, r, { xp: 1, town: 'bench' }));
    if (HL) { own.always.push(add(MD.board, HL.BOARD.x, HL.BOARD.y, 0, { xp: 1, town: 'board' }));
      for (const [m, px, py, r] of HL.PROPS) own.always.push(add(MD[m], px, py, r, { xp: 1, town: m })); }
    for (const b of TN.BUILDINGS) if (b.kind === 'house') { const fy = b.rot ? b.y - b.hd - 3 : b.y + b.hd + 3; own.always.push(add(MD.flowers, b.x - 9, fy, 0, { xp: 1, town: 'flowers' })); }
    if (x.lampModel) for (const l of TN.LAMPS) own.always.push(add(x.lampModel(), l.x, l.y, 0, { xp: 1, town: 'lamp' }));
    // the town's fence: all round, with the west gap at the gate
    const R0 = TN.RECT, fence = x.models.fence;
    for (let fx = R0[0]; fx < R0[2]; fx += 8) for (const fy of [R0[1], R0[3]]) own.always.push(add(fence, fx + 4, fy, 0, { xp: 1, town: 'fence' }));
    for (let fy = R0[1]; fy < R0[3]; fy += 8) for (const fx of [R0[0], R0[2]]) { if (fx === R0[0] && Math.abs(fy + 4 - TN.GATE.y) < 10) continue; own.always.push(add(fence, fx, fy + 4, Math.PI / 2, { xp: 1, town: 'fence' })); }
    // trees on the town's grass, kept off streets, buildings and the square
    { let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (const [tx, ty] of [[458, 46], [458, 132], [472, 132], [492, 135], [470, 146], [628, 48], [622, 4], [562, 2], [516, 4], [478, 2], [624, 96]]) {
        const defs = rnd() < 0.5 ? x.treeDefs.oak : x.treeDefs.small; x.addTree(defs[Math.floor(rnd() * defs.length)], tx + (rnd() - 0.5) * 3, ty + (rnd() - 0.5) * 3); } }
    // the strip east of the old map edge: cliff slabs where the ridge runs on
    const xmod = xm && xm.ledges; if (xmod) for (let gx = 448; gx <= 640; gx += 8) { const ry = PL.ridgeY(gx); own.always.push(add(xmod[((gx / 8) | 0) % 3], gx, ry - 1.5, 0, { xp: 1 })); }
    mounted = true; sync(true); syncHall(true); return api;
  }
  const removeFrom = (q) => { const i = X.props.indexOf(q); if (i >= 0) X.props.splice(i, 1); };
  function sync(force) {
    syncHall(force); if (!mounted) return; const open = !!(S.eff && S.eff.town), road = !!(S.plots && S.plots.eroad && S.plots.eroad.mod === 'road'), k = open + ':' + road; if (!force && k === lastKey) return; lastKey = k;
    // once 东大道 is a road, the old forest steps aside from it so the walk to town reads as one road (put back if it is rezoned)
    if (road && !own.cleared.length) for (let i = X.props.length - 1; i >= 0; i--) { const p = X.props[i]; if (p.tree && !p.town && p.x > 354 && p.x < 452 && p.y > 54 && p.y < 94) own.cleared.push(X.props.splice(i, 1)[0]); }
    if (!road && own.cleared.length) { for (const q of own.cleared) X.props.push(q); own.cleared.length = 0; }
    for (const q of own.gate) removeFrom(q); own.gate.length = 0;
    if (own.closed) { removeFrom(own.closed); if (!open) X.props.push(own.closed); }
    if (open) own.gate.push(X.addProp(MD.gateOpen, TN.GATE.x, TN.GATE.y, 0, { xp: 1, town: 'gate' }));
    X.markNavDirty();
  }
  // v5.10.0: the lots (scaffolding while a house goes up, the house once it is done) and the gifts along the main street
  let hallKey = '';
  function syncHall(force) {
    if (!mounted || !HL) return; const H = S.town && S.town.hall, open = !!(S.eff && S.eff.town);
    const lots = S.town && S.town.lots, path = S.home && S.home.path;
    const sports = !!(root.PFSchool && H && root.PFSchool.isDay(H, S.day));
    const k = open && H ? JSON.stringify([H.built, H.job, H.gifts, lots, path, sports ? 1 : 0]) : ''; if (!force && k === hallKey) return; hallKey = k;
    for (const q of own.hall) removeFrom(q); own.hall.length = 0; if (!k) return;
    const CL = root.PFClinic; // v5.10.10: original houses swap to a two-storey (or scaffolding) when rebuilt
    if (CL) for (const b of TN.BUILDINGS) if (b.kind === 'house') {
      const prop = own.always.find(q => q.town === b.id); if (!prop) continue;
      const up = H.job && H.job.id === b.id, done = !!H.built[b.id], style = (CL.HOUSE[b.id] && CL.HOUSE[b.id].style) || 0;
      prop.m = up ? MD.scaffold : done ? (MD.two[style] || MD.two[0]) : MD.houses[b.roof || 0]; }
    for (const l of HL.LOTS) { const built = !!H.built[l.id], up = H.job && H.job.id === l.id; if (!built && !up) continue;
      own.hall.push(X.addProp(built ? (MD.two[l.style] || MD.two[2]) : MD.scaffold, l.x, l.y, l.rot, { xp: 1, big: 1, town: l.id }));
      if (built) { const fy = l.y - l.hd - 3; own.hall.push(X.addProp(MD.flowers, l.x - 10, fy, 0, { xp: 1, town: 'flowers' })); }
      if (built && l.id === 'bakery' && MD.orderBoard) { const BK = root.PFBakery; own.hall.push(X.addProp(MD.orderBoard, (BK && BK.BOARD.x) || (l.door.x - 8), (BK && BK.BOARD.y) || (l.door.y + 1), 0, { xp: 1, town: 'orders' })); }
      if (built && l.id === 'woodshop' && MD.timber) { const WS = root.PFWoodshop; own.hall.push(X.addProp(MD.timber, (WS && WS.PILE.x) || (l.door.x - 7), (WS && WS.PILE.y) || (l.door.y + 1), 0, { xp: 1, town: 'timber' })); }
      if (built && l.id === 'smithy' && MD.anvil) { const SM = root.PFSmithy; own.hall.push(X.addProp(MD.anvil, (SM && SM.ANVIL.x) || (l.door.x - 6), (SM && SM.ANVIL.y) || (l.door.y + 1), 0, { xp: 1, town: 'anvil' })); }
      if (built && l.id === 'library' && MD.orderBoard) { const LB = root.PFLibrary; own.hall.push(X.addProp(MD.orderBoard, (LB && LB.BOARD.x) || (l.door.x - 8), (LB && LB.BOARD.y) || (l.door.y + 1), 0, { xp: 1, town: 'libboard' })); } }
    const SC = root.PFSchool; // v5.10.9: playground posts and the flag; extra flags on sports day
    if (SC && H.built.school) {
      if (MD.yardFlag) own.hall.push(X.addProp(MD.yardFlag, SC.FLAG.x, SC.FLAG.y, 0, { xp: 1, town: 'flag' }));
      if (MD.yardPost) { const T = SC.TRACK; for (const [dx, dy] of [[T.rx, 0], [-T.rx, 0], [0, T.ry], [0, -T.ry]]) own.hall.push(X.addProp(MD.yardPost, T.cx + dx, T.cy + dy, 0, { xp: 1, town: 'post' })); }
      const DM = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models();
      if (DM && DM.bench) for (const b of SC.BENCHES) own.hall.push(X.addProp(DM.bench, b.x, b.y, 0, { xp: 1, town: 'yardbench' }));
      if (sports && MD.yardFlag) { own.hall.push(X.addProp(MD.yardFlag, SC.TRACK.cx - 6, SC.TRACK.cy - SC.TRACK.ry, 0, { xp: 1, town: 'flag' })); own.hall.push(X.addProp(MD.yardFlag, SC.TRACK.cx + 6, SC.TRACK.cy - SC.TRACK.ry, 0, { xp: 1, town: 'flag' })); }
    }
    const MKS = root.PFMarket; // v5.10.3: the market stalls (bare frames while 阿松 is putting them up)
    if (MKS && (H.built.market || (H.job && H.job.id === 'market'))) MKS.STALLS.forEach((st, i) => { const m = H.built.market ? MD.stalls[i] : MD.stallFrame; if (m) own.hall.push(X.addProp(m, st.x, st.y, st.rot, { xp: 1, town: 'stall' })); });
    const DM = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models();
    if (DM) { const gp = HL.giftPos(H); H.gifts.forEach((id, i) => { const at = gp[i], m = DM[id]; if (m && at) own.hall.push(X.addProp(m, at.x, at.y, 0, { xp: 1, town: 'gift' })); }); } // v5.10.3: by kind (slots.js)
    const CR = root.PFCareers; // v5.10.6: a child's own shop (scaffolding the first day, then the model for its kind)
    if (CR && lots) for (const l of CR.LOTS) { const kid = lots[l.id]; if (!kid) continue; const p = path && path[kid], ready = CR.shopReady(p, S.day), kind = (p && p.kind) || 'flower';
      const m = ready ? ((MD.kidShops && MD.kidShops[kind]) || MD.two[2]) : MD.scaffold; if (m) own.hall.push(X.addProp(m, l.x, l.y, l.rot, { xp: 1, big: 1, town: l.id })); }
    X.markNavDirty();
  }
  // a little sign over the shut gate while the town is locked (drawn by game.js with the plot locks)
  // v5.9.1: the town's lamps and windows for game.js's lighting pass (only while the town is open)
  function lights(hz, T) { if (!(S && S.eff && S.eff.town)) return; for (const l of TN.lightsAt(T)) hz(l.x, l.y, l.z, l.r, l.s);
    if (HL && S.town && S.town.hall) for (const l of HL.lightsAt(S.town.hall, T, root.PFDecor && root.PFDecor.CATALOG)) hz(l.x, l.y, l.z, l.r, l.s); // v5.10.0: the new houses' windows, the gift lamps
    if (root.PFCareers && S.town && S.town.lots) for (const l of root.PFCareers.lightsAt(S.town.lots, S.home && S.home.path, T, S.day)) hz(l.x, l.y, l.z, l.r, l.s); } // v5.10.6: the child's shop window at dusk
  // chimney tops in world units (model voxels are 2 per world unit; lots with rot π flip the footprint)
  function chimneyOf(lot, vx, vy, vz, W, D) {
    let dx = (vx - (W - 1) / 2) / 2, dy = (vy - (D - 1) / 2) / 2;
    if (lot.rot === Math.PI) { dx = -dx; dy = -dy; }
    return { x: lot.x + dx, y: lot.y + dy, z: vz / 2 };
  }
  function smoke() {
    const H = S && S.town && S.town.hall, out = []; if (!(S && S.eff && S.eff.town) || !H) return out;
    if (H.built && H.built.woodshop) { const WS = root.PFWoodshop, l = (WS && WS.LOT) || (HL && HL.LOT.woodshop); if (l) out.push(chimneyOf(l, 6.5, 9, 40, 32, 34)); }
    if (H.built && H.built.smithy) { const SM = root.PFSmithy, l = (SM && SM.LOT) || (HL && HL.LOT.smithy); if (l) out.push(Object.assign(chimneyOf(l, 24.5, 9.5, 50, 32, 34), { forge: 1 })); }
    return out;
  }
  const api = { ground, mount, sync, lights, smoke, models: () => MD, state: () => ({ hall: own.hall.length, hallKey, closed: !!own.closed, gate: own.gate.length, cleared: own.cleared.length, inProps: own.closed ? X.props.includes(own.closed) : null, key: lastKey }) };
  root.PFTownArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
