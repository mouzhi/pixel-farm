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
    const P = TN.PLAZA, d = Math.hypot(x - P.x, y - P.y);
    if (d < P.r) { const cx = Math.floor((x + 400) / 3), cy = Math.floor((y + 400) / 3), k = hash(cx, cy, 5); // cobbles, a ring of darker stones at the edge
      if (d > P.r - 1.4) return [St[1], 'dirt']; return [(cx + cy) % 2 ? (k > 0.5 ? St[3] : St[2]) : (k > 0.7 ? St[2] : St[3]), 'dirt']; }
    if (TN.inRect(x, y, TN.SCHOOLYARD)) { const k = hash(Math.floor(x), Math.floor(y), 9); return [k > 0.8 ? Wd[3] : Wd[4], 'dirt']; }
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
    return { houses: [house(Rf[2]), house(Rf[3]), house(St[1])], shop, school, fountain, gateOpen, flowers, hall, board, two: [twoStorey(0), twoStorey(1), twoStorey(2)], scaffold, mailbox, cart, crates, parasol };
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
      for (const [tx, ty] of [[458, 46], [458, 132], [472, 132], [506, 132], [588, 132], [622, 132], [622, 4], [562, 2], [516, 4], [478, 2], [624, 96]]) {
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
    const k = open && H ? JSON.stringify([H.built, H.job, H.gifts]) : ''; if (!force && k === hallKey) return; hallKey = k;
    for (const q of own.hall) removeFrom(q); own.hall.length = 0; if (!k) return;
    for (const l of HL.LOTS) { const built = !!H.built[l.id], up = H.job && H.job.id === l.id; if (!built && !up) continue;
      own.hall.push(X.addProp(built ? MD.two[l.style] : MD.scaffold, l.x, l.y, l.rot, { xp: 1, big: 1, town: l.id }));
      if (built) { const fy = l.y - l.hd - 3; own.hall.push(X.addProp(MD.flowers, l.x - 10, fy, 0, { xp: 1, town: 'flowers' })); } }
    const DM = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models();
    if (DM) H.gifts.forEach((id, i) => { const at = HL.GIFT_SPOTS[i], m = DM[id]; if (m) own.hall.push(X.addProp(m, at.x, at.y, 0, { xp: 1, town: 'gift' })); });
    X.markNavDirty();
  }
  // a little sign over the shut gate while the town is locked (drawn by game.js with the plot locks)
  // v5.9.1: the town's lamps and windows for game.js's lighting pass (only while the town is open)
  function lights(hz, T) { if (!(S && S.eff && S.eff.town)) return; for (const l of TN.lightsAt(T)) hz(l.x, l.y, l.z, l.r, l.s);
    if (HL && S.town && S.town.hall) for (const l of HL.lightsAt(S.town.hall, T, root.PFDecor && root.PFDecor.CATALOG)) hz(l.x, l.y, l.z, l.r, l.s); } // v5.10.0: the new houses' windows, the gift lamps
  const api = { ground, mount, sync, lights, models: () => MD, state: () => ({ hall: own.hall.length, hallKey, closed: !!own.closed, gate: own.gate.length, cleared: own.cleared.length, inProps: own.closed ? X.props.includes(own.closed) : null, key: lastKey }) };
  root.PFTownArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
