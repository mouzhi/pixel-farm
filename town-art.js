// 像素农场 · 第 10 阶段（v5.8.0）的画面：镇子的地面、学校、小店、民居、广场喷泉、镇子篱笆和镇门（买下前关着，买下后打开），
// 东边新长出来的一条林子和崖壁。Rules live in town.js (pure, unit-tested). game.js calls ground() while painting the ground canvas,
// mount(X) once its models exist and sync() whenever the town is bought (idempotent: a key decides).
'use strict';
(function (root) {
  const TN = root.PFTown, PL = root.PFPlots, HL = root.PFHall; // HL: v5.10.0 镇公所 and the new houses
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink, G = R.green;
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = { gate: [], always: [], cleared: [], hall: [], dress: [] }; // v5.12.0: dress = the street dressing (its own list, so `hall` still counts the lots)
  const hash = (a, b, c) => { let n = a * 374761393 + b * 668265263 + c * 1442695; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };

  // ---------- ground (called for every ground pixel inside the strip; null: not ours) ----------
  function ground(x, y) {
    if (!TN.inTown(x, y)) return null;
    const PK = root.PFPark, H0 = S && S.town && S.town.hall; // v5.12.3 镇公园 on R1 (and its gravel link to 东街)
    if (PK && PK.built(H0) && (PK.inPark(x, y) || PK.onLink(x, y))) { const o = PK.ground(x, y, { G, Wd, St, Ac }); if (o) return o; }
    const P = TN.PLAZA, d = Math.hypot(x - P.x, y - P.y), H = H0, r = root.PFMarket && root.PFMarket.built(H) ? root.PFMarket.PLAZA_R : P.r; // v5.10.3: the market square is bigger
    if (d < r) { const cx = Math.floor((x + 400) / 3), cy = Math.floor((y + 400) / 3), k = hash(cx, cy, 5); // cobbles, a ring of darker stones at the edge
      if (d > r - 1.4) return [St[1], 'dirt']; // v5.11.0: concentric rings of setts round the fountain (the checkerboard was loud at r 36)
      const ring = Math.floor(d / 3), ang = Math.atan2(y - P.y, x - P.x), per = Math.max(6, Math.round(ring * 2 * Math.PI)), seg = (ang / (2 * Math.PI) + 1) * per + (ring & 1) * 0.5;
      if (d - ring * 3 < 0.5 || seg - Math.floor(seg) < 0.5 / Math.max(1, d * 2 * Math.PI / per)) return [St[2], 'dirt']; const kk = hash(ring, Math.floor(seg), 7);
      return [kk > 0.78 ? Wd[5] : (kk > 0.5 ? St[2] : St[3]), 'dirt']; }
    if (TN.SQUARE && TN.inRect(x, y, TN.SQUARE)) { // v5.11.0: 节庆广场 — big flagstones with a darker kerb; the feast table stands on it
      const q = TN.SQUARE, kerb = x < q[0] + 1.2 || x > q[2] - 1.2 || y < q[1] + 1.2 || y > q[3] - 1.2; if (kerb) return [St[1], 'dirt'];
      const fx = Math.floor((x - q[0]) / 6), fy = Math.floor((y - q[1]) / 4), jx = (x - q[0]) - fx * 6, jy = (y - q[1]) - fy * 4;
      if (jx < 0.5 || jy < 0.5) return [St[2], 'dirt']; const k = hash(fx, fy, 17); return [k > 0.5 ? St[3] : (k > 0.2 ? Wd[5] : Wd[4]), 'dirt']; }
    const SC = root.PFSchool, yard = (SC && SC.built(H)) ? SC.YARD : TN.SCHOOLYARD;
    if (TN.inRect(x, y, yard)) {
      if (SC && SC.built(H)) { const o = playground(SC, x, y); if (o) return o; }
      const k = hash(Math.floor(x), Math.floor(y), 9); return [k > 0.8 ? Wd[3] : Wd[4], 'dirt']; }
    const k = hash(Math.floor(x / 5), Math.floor(y / 5), 3); return [k > 0.82 ? G[3] : G[2], 'grass'];
  }

  // v5.12.0 操场重做: a red two-lane track with cream lines, a mown infield with a halfway line, centre circle and goal boxes,
  // a half court round the hoop, worn ground under the toys. Lines sit on whole world units so the lanes never blur into each other.
  function playground(SC, x, y) {
    const T = SC.TRACK, L = SC.LANES || [-3, 0, 3], LINE = Ac[0];
    const C = SC.COURT; if (C && TN.inRect(x, y, C)) { const e = x < C[0] + 0.6 || x > C[2] - 0.6 || y < C[1] + 0.6 || y > C[3] - 0.6;
      const cx = (C[0] + C[2]) / 2, key = Math.abs(x - cx) <= 4 && y <= C[1] + 9, keyE = key && (Math.abs(Math.abs(x - cx) - 4) < 0.5 || Math.abs(y - (C[1] + 9)) < 0.5);
      const arc = Math.abs(Math.hypot(x - cx, (y - C[1] - 2) * 1.0) - 12) < 0.45 && y > C[1] + 2;
      if (e || keyE || arc) return [LINE, 'dirt']; return [key ? Rf[3] : ((Math.floor(x) + Math.floor(y)) % 7 === 0 ? St[2] : St[3]), 'dirt']; }
    const o = SC.trackOff(x, y);
    if (o >= L[0] - 0.5 && o <= L[2] + 0.5) {
      for (const l of L) if (Math.abs(o - l) < 0.42) return [LINE, 'dirt'];
      if (y > T.cy && Math.abs(x - T.cx) < 0.5) return [LINE, 'dirt'];                              // the start / finish line
      const k = hash(Math.floor(x * 2), Math.floor(y * 2), 13); return [k > 0.86 ? Rf[1] : Rf[2], 'dirt']; }
    if (o < L[0] - 0.5) { const dx = x - T.cx, dy = y - T.cy;
      if (Math.abs(dx) < 0.4 || Math.abs(Math.hypot(dx, dy * 1.4) - 5) < 0.42) return [LINE, 'dirt'];  // halfway line, centre circle
      for (const s of [-1, 1]) { const gx = T.cx + s * 30, bx = (x - gx) * s; if (bx >= -0.4 && bx <= 6 && Math.abs(dy) <= 6 && (Math.abs(bx - 6) < 0.42 || Math.abs(Math.abs(dy) - 6) < 0.42)) return [LINE, 'dirt']; }
      return [(Math.floor((x - T.cx + 200) / 5) & 1) ? G[3] : G[2], 'grass']; }                    // mown stripes
    for (const q of (SC.PLAY || [])) if (q.k !== 'goal' && q.k !== 'stand' && Math.hypot((x - q.x) / 1.3, y - q.y) < 9) { const k = hash(Math.floor(x), Math.floor(y), 19); return [k > 0.7 ? Wd[5] : Wd[4], 'dirt']; }
    return null;
  }
  const cross = (x, y) => !!(root.PFTownLife && S && S.eff && S.eff.town && root.PFTownLife.crossAt(x, y)); // 斑马线 on 主街 (game.js paints the avenue)

  // ---------- models (voxel = 1 screen px; 2 voxels per world unit) ----------
  function makeModels(x) {
    const B = x.buildModel, gable = x.gableY;
    // a round fountain on the square
    const fountain = B(26, 26, 19, (x, y, z0) => { const c = Math.hypot(x + 0.5 - 13, y + 0.5 - 13) / 1.44, z = Math.floor(z0 / 1.36); // v5.11.0: a size up for the bigger square
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
    // the notice board: two posts, a little roof, pinned notes
    const board = B(16, 4, 20, (x, y, z) => {
      if ((x === 1 || x === 14) && y >= 1 && y <= 2 && z <= 15) return Wd[1];
      if (z >= 16 && z <= 17 && y <= 3) return z === 17 ? Rf[1] : Rf[2];
      if (y === 2 && x >= 1 && x <= 14 && z >= 6 && z <= 15) { if (x === 1 || x === 14 || z === 6 || z === 15) return Wd[1];
        const note = (x >= 3 && x <= 6 && z >= 9 && z <= 13) ? Ac[0] : (x >= 8 && x <= 12 && z >= 10 && z <= 14) ? '#f2cf55' : (x >= 8 && x <= 11 && z >= 7 && z <= 8) ? Ac[0] : null;
        return note && (x + z) % 4 === 0 ? Ink[0] : note || Wd[3]; }
      return null; });
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
    // v5.11.0.9 (房子比例): the same footprint, but the awning now clears the stallholder's hat (it sat at 16-17, a grown-up is 24)
    const marketStall = (awn, goods, bare) => B(22, 16, 30, (x, y, z) => {
      const post = (x === 2 || x === 19) && (y === 3 || y === 13);
      if (post && z <= 25) return Wd[1];
      if (bare) { if ((z === 25) && (y === 3 || y === 13) && x >= 2 && x <= 19) return Wd[3]; if (z <= 1 && y >= 10 && y <= 13 && x >= 3 && x <= 18 && (x % 3)) return Wd[3]; return null; }
      if (y >= 10 && y <= 13 && x >= 2 && x <= 19 && z <= 8) { if (z === 8) return Wd[3]; return y === 13 ? (x % 5 === 2 ? Wd[1] : Wd[2]) : Wd[1]; }          // the counter
      if (y >= 10 && y <= 12 && x >= 3 && x <= 18 && (z === 9 || (z === 10 && hash(x, y, 31) > 0.45)) && x % 4 !== 2) return goods[((x >> 2) + y) % goods.length]; // goods in heaps
      if (y >= 3 && y <= 4 && x >= 3 && x <= 18 && z <= 16) return z === 16 ? Wd[3] : (z % 4 ? null : Wd[2]);                                          // the back shelf
      if (y >= 3 && y <= 4 && x >= 4 && x <= 17 && (z === 5 || z === 9 || z === 13) && x % 3 !== 0) return goods[(x + z) % goods.length];
      const az = y < 8 ? 27 : 26; // the awning, tipped to the front, scalloped at its edge
      if (x >= 1 && x <= 20 && y >= 1 && y <= 15 && z === az) return ((x >> 1) & 1) ? awn[0] : awn[1];
      if (y === 15 && x >= 1 && x <= 20 && z === 25 && !((x >> 1) & 1)) return awn[0];
      return null; });
    const stalls = HL && root.PFMarket ? root.PFMarket.STALLS.map(st => marketStall(AWN[st.awn % AWN.length], GOODS[st.who] || GOODS.v, false)) : [];
    const stallFrame = marketStall(AWN[0], GOODS.v, true);
    const orderBoard = B(14, 4, 20, (x, y, z) => {
      if ((x === 1 || x === 12) && y <= 2 && z <= 16) return Wd[1];
      if (z >= 17 && z <= 18 && y <= 3) return z === 18 ? Rf[3] : Rf[2];
      if (y === 2 && x >= 1 && x <= 12 && z >= 6 && z <= 16) { if (x === 1 || x === 12 || z === 6 || z === 16) return Wd[1];
        return ((x + z) % 3 === 0) ? Ink[0] : Ac[0]; }
      return null; });
    const timber = B(16, 10, 12, (x, y, z) => { // three logs in a pile
      for (const [cx, cy, cz, ax] of [[4, 4, 3, 1], [10, 5, 3, 1], [7, 4, 7, 0]]) {
        const dx = ax ? (x - cx) / 5.5 : (x - cx) / 2.2, dy = ax ? (y - cy) / 2.2 : (y - cy) / 4.5, dz = (z - cz) / 2.2;
        if (dx * dx + dy * dy + dz * dz < 1) return (dx * dx + dy * dy + dz * dz < 0.2) ? Wd[2] : ((x + y + z) % 3 ? Wd[3] : Wd[1]); }
      return null; });
    const anvil = B(10, 8, 10, (x, y, z) => {
      if (z <= 2 && x >= 2 && x <= 7 && y >= 2 && y <= 5) return St[1];
      if (z >= 3 && z <= 6 && x >= 3 && x <= 6 && y >= 2 && y <= 5) return St[2];
      if (z >= 7 && z <= 9 && x >= 1 && x <= 8 && y >= 2 && y <= 5) return (z === 9 ? St[3] : St[2]);
      return null; });
    const lantern = B(6, 6, 22, (x, y, z) => {
      if ((x === 2 || x === 3) && (y === 2 || y === 3) && z <= 14) return z === 14 ? Wd[4] : Wd[2];
      const c = Math.hypot(x - 2.5, y - 2.5);
      if (z >= 15 && z <= 20 && c < 2.4) {
        if (z === 15 || z === 20 || c > 1.8) return Wd[4];
        return (z + x) % 3 === 0 ? Ac[1] : Ac[0]; }
      return null; });
    const yardFlag = B(6, 6, 28, (x, y, z) => {
      if (x === 2 && y === 2 && z <= 26) return St[3];
      if (z >= 16 && z <= 22 && y === 2 && x >= 3 && x <= 5) return z === 19 ? Ac[0] : Rf[2];
      return null; });
    const yardPost = B(4, 4, 14, (x, y, z) => (x >= 1 && x <= 2 && y >= 1 && y <= 2 && z <= 13) ? (z === 13 ? Rf[2] : Wd[2]) : null);
    // ---------- v5.12.0 小镇美术升级: street dressing (town-life.js slots) and the new playground (school.js PLAY) ----------
    // planter: a long wooden box with a shrub and a row of flowers (Witchbrook-style window boxes, but standing on the pavement)
    const planter = B(14, 6, 10, (x, y, z) => {
      if (z <= 3) { if (x === 0 || x === 13 || y === 0 || y === 5) return z === 3 ? Wd[4] : ((x + z) % 4 === 0 ? Wd[1] : Wd[2]); return z === 3 ? Wd[1] : null; }
      if (x < 1 || x > 12 || y < 1 || y > 4) return null;
      const bush = Math.hypot((x - 4) / 3.2, (y - 2.5) / 2, (z - 6) / 3.4); if (bush < 1) return bush > 0.7 && (x + y + z) % 3 === 0 ? G[4] : (z >= 8 ? G[3] : G[2]);
      if (x >= 8 && z <= 6) { const k = (x * 7 + y * 3) % 5; return z === 6 ? (k === 0 ? Ac[3] : k === 2 ? Ac[1] : k === 4 ? Ac[0] : null) : (z === 4 ? G[2] : (k & 1 ? G[3] : null)); }
      return null; });
    // aframe: a sandwich board facing the street; the face says what it is (chalk on slate, or painted wood)
    const AFACE = { school: [G[0], Ac[0]], sale: [Ink[1], Ac[1]], market: [Wd[4], Rf[2]] };
    const aframe = face => B(9, 6, 14, (x, y, z) => {
      const lean = Math.floor(z / 5); if (z > 12) return null;
      if (y === 4 - lean || y === 1 + lean) { if (x === 0 || x === 8 || z === 12 || z <= 1) return Wd[2];
        if (y === 4 - lean) { if (z === 11) return Wd[3]; const line = (z === 9 || z === 7 || z === 5) && x >= 2 && x <= 6 && ((x + z) % 3 !== 0); return line ? face[1] : face[0]; }
        return Wd[1]; }
      return null; });
    // blade: a post with an arm and a hanging signboard (both faces painted), a small lantern on top for the evening
    const EMB = { book: [Wt[2], Ac[0]], shop: [Ac[1], Wd[2]], flower: [Ac[3], G[3]], clinic: [Ac[0], Rf[2]], bread: [Wd[4], Wd[2]], saw: [St[3], Wd[2]], anvil: [Ink[0], St[2]], school: [G[0], Ac[0]] };
    const blade = sign => B(12, 4, 30, (x, y, z) => { const e = EMB[sign] || EMB.shop;
      if (x <= 1 && y >= 1 && y <= 2 && z <= 25) return z === 25 ? Wd[1] : Wd[2];                          // the post
      if (z === 24 && y >= 1 && y <= 2 && x >= 2 && x <= 11) return Wd[1];                                   // the arm
      if (z >= 26 && z <= 28 && x <= 1 && y >= 1 && y <= 2) return z === 28 ? Wd[1] : Ac[1];               // the lantern
      if ((x === 4 || x === 10) && y === 1 && z >= 21 && z <= 23) return St[1];                             // the chains
      if (y >= 1 && y <= 2 && x >= 3 && x <= 11 && z >= 12 && z <= 20) {                                     // the board
        if (x === 3 || x === 11 || z === 12 || z === 20) return Wd[1];
        const c = Math.hypot(x - 7, (z - 16) * 1.1); if (sign === 'clinic') return (x === 7 || z === 16) && c < 3.2 ? e[1] : e[0];
        return c < 2.6 ? e[0] : (c < 3.4 ? e[1] : Wd[4]); }
      return null; });
    const barrel = B(6, 6, 9, (x, y, z) => { const c = Math.hypot(x - 2.5, y - 2.5); if (c > 2.9 - (z === 0 || z === 8 ? 0.4 : 0)) return null;
      if (z === 8) return c < 1.6 ? Wd[1] : Wd[2]; return (z === 2 || z === 6) ? St[1] : ((x + y) % 3 === 0 ? Wd[2] : Wd[3]); });
    // awning: a striped canvas over a shop front, sloping out to the street with a scalloped edge (rot π: faces north)
    const ACOL = [[Rf[2], Ac[0]], [G[2], Ac[0]], [Wt[2], Ac[0]]];
    const awning = (w, c) => B(w * 2, 8, 32, (x, y, z) => { const col = ACOL[c % ACOL.length], zt = 31 - Math.round(y * 0.8);
      if (z === zt) return ((x >> 1) & 1) ? col[0] : col[1];
      if (y === 7 && z === zt - 1 && ((x >> 1) & 1)) return col[0];                                         // the scalloped edge
      if ((x === 0 || x === w * 2 - 1) && y === 7 && z < zt && z >= zt - 3) return Wd[1];                    // the little brackets
      return null; });
    // cafe: a round table, two stools and a parasol (the square's café corners)
    const cafe = B(18, 18, 24, (x, y, z) => { const c = Math.hypot(x + 0.5 - 9, y + 0.5 - 9);
      if (z >= 18 && z <= 21 && c < 9 - (z - 18) * 2.6) return (Math.floor(Math.atan2(y - 9, x - 9) / (Math.PI / 4)) & 1) ? Ac[0] : G[3];
      if (c < 0.9 && z <= 18) return z === 18 ? Wd[1] : St[1];
      if (z === 7 && c < 3.4) return c > 2.6 ? Wd[2] : Wd[4];                                                // the table top
      if (z >= 5 && z <= 6 && c < 3) return null;
      for (const [sx, sy] of [[3, 9], [15, 9]]) { const d = Math.hypot(x - sx, y - sy); if (d < 1.6 && z <= 4) return z === 4 ? Rf[3] : (d < 0.8 ? Wd[1] : null); }
      return null; });
    // the playground: football goals with nets, a basketball hoop, short stands in team colours, a tall flagpole
    const goal = B(8, 18, 12, (x, y, z) => { const post = (y === 0 || y === 17) && x === 7 && z <= 11, bar = z === 11 && x === 7;
      if (post || bar) return Ac[0];
      if ((y === 0 || y === 17) && z === 11 - Math.round((7 - x) * 1.2) && x < 7) return St[3];             // the side frames
      if (x === 0 && z <= 3 && (y + z) % 2 === 0) return St[3];                                             // the net at the back
      if (z > 3 && z < 11 && x === Math.round((z - 3) * 0.85) && (y + z) % 2 === 0) return St[3];           // the sloping net
      return null; });
    const hoop = B(10, 8, 36, (x, y, z) => {
      if (x >= 4 && x <= 5 && y >= 0 && y <= 1 && z <= 30) return z % 6 === 0 ? St[1] : St[2];               // the pole
      if (y === 2 && x >= 0 && x <= 9 && z >= 26 && z <= 33) { if (x === 0 || x === 9 || z === 26 || z === 33) return St[1];
        return (x >= 3 && x <= 6 && z >= 27 && z <= 30 && (x === 3 || x === 6 || z === 30)) ? Rf[2] : Ac[0]; }  // the backboard
      if (z === 27 && Math.hypot(x - 4.5, y - 4.5) < 2.2 && Math.hypot(x - 4.5, y - 4.5) > 1.2) return Ac[2]; // the rim
      if (z >= 23 && z <= 26 && Math.hypot(x - 4.5, y - 4.5) < 2 && Math.hypot(x - 4.5, y - 4.5) > 1.2 && (x + z) % 2 === 0) return Ac[0]; // the net
      return null; });
    const stand = B(56, 12, 13, (x, y, z) => { const row = y >= 8 ? 0 : y >= 4 ? 1 : 2, top = 3 + row * 4;
      if (z > top) return null; if (x === 0 || x === 55) return z === top ? Wd[1] : St[1];
      if (z === top) return (Math.floor(x / 7) & 1) ? (row === 1 ? Wt[3] : Rf[2]) : Ac[0];                    // the painted seats
      return (y === 11 || y === 7 || y === 3) ? (z % 2 ? St[2] : St[1]) : St[1]; });
    const flagHigh = B(8, 6, 52, (x, y, z) => {
      if (x === 2 && y === 2 && z <= 49) return z === 49 ? Ac[1] : (z <= 1 ? St[1] : St[3]);
      if (z >= 38 && z <= 47 && y === 2 && x >= 3 && x <= 7) { const star = Math.hypot(x - 4.5, z - 44) < 1.3; return star ? Ac[1] : (z >= 38 && z <= 39 ? Rf[1] : Rf[2]); }
      if (z <= 1 && x >= 0 && x <= 4 && y >= 0 && y <= 4) return St[2];
      return null; });
    // v5.11.0: the buildings themselves come from town-bldg.js (the new scale: doors as tall as a grown-up, 24 voxels a storey)
    const NB = root.PFTownBldg.make(x);
    const xm = x.xpModels && x.xpModels(); // the farm's 乐园 toys, reused on the school's playground
    const aframes = Object.fromEntries(Object.keys(AFACE).map(k => [k, aframe(AFACE[k])])), blades = Object.fromEntries(Object.keys(EMB).map(k => [k, blade(k)]));
    const awnings = [0, 1, 2].map(c => awning(14, c));
    const play = { goal, hoop, stand, slide: xm && xm.slide, swing: xm && xm.swing, sandbox: xm && xm.sandbox };
    // ---------- v5.12.3 镇公园: a pergola (廊架) with climbing roses, a kennel for the park dog, short pickets round the pet corner ----------
    const pergola = B(30, 18, 34, (x, y, z) => {
      const post = (x <= 1 || x >= 28) && (y <= 1 || y >= 16);
      if (post && z <= 27) return z <= 1 ? St[2] : (z % 7 === 0 ? Wd[1] : Wd[2]);
      if ((y <= 1 || y >= 16) && z >= 26 && z <= 27) return z === 27 ? Wd[3] : Wd[2];                                 // the long beams
      if (z === 29 && x % 4 === 1) return Wd[3];                                                                        // slats across
      const vine = (z >= 28 && z <= 31 && hash(x, y, 51) > 0.38) || ((y <= 1 || y >= 16) && z >= 6 && z < 26 && (x <= 2 || x >= 27) && hash(x, z, 53) > 0.45);
      if (vine) { const k = hash(x + z, y, 57); return k > 0.86 ? Ac[3] : k > 0.78 ? Ac[0] : (k > 0.4 ? G[3] : G[2]); }
      if (y >= 7 && y <= 10 && x >= 8 && x <= 21 && z >= 6 && z <= 7) return z === 7 ? Wd[4] : Wd[2];                // a long bench in its shade
      if (y >= 7 && y <= 10 && (x === 9 || x === 20) && z <= 5) return Wd[1];
      return null; });
    const kennel = B(12, 12, 14, (x, y, z) => {
      if (z <= 7 && x >= 1 && x <= 10 && y >= 1 && y <= 10) { if (y === 10 && x >= 4 && x <= 7 && z >= 1 && z <= 5) return z === 5 ? Wd[1] : null; // the door hole faces south
        return (x === 1 || x === 10 || y === 1 || y === 10) ? ((z + x) % 3 ? Wd[3] : Wd[2]) : null; }
      const roofW = 6 - (z - 8); if (z >= 8 && z <= 13 && Math.abs(x - 5.5) <= roofW && y <= 11) return Math.abs(Math.abs(x - 5.5) - roofW) < 1 ? Rf[1] : Rf[2];
      return null; });
    const picket = B(8, 2, 8, (x, y, z) => ((x % 4 === 1 || x % 4 === 2) && z <= 6 ? (z === 6 ? Wd[4] : Wd[3]) : (z === 4 ? Wd[2] : null)));
    return Object.assign(NB, { fountain, gateOpen, flowers, board, mailbox, cart, crates, parasol, stalls, stallFrame, orderBoard, timber, anvil, yardFlag, yardPost, lantern,
      planter, aframes, blades, barrel, awnings, cafe, play, flagHigh, pergola, kennel, picket });
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
    if (bench) for (const [bx, by, r] of [[TN.PLAZA.x - 12, TN.PLAZA.y + 16, 0], [TN.PLAZA.x + 16, TN.PLAZA.y - 12, Math.PI / 2], [622, 58, 0], [676, 58, 0]]) own.always.push(add(bench, bx, by, r, { xp: 1, town: 'bench' }));
    if (HL) { own.always.push(add(MD.board, HL.BOARD.x, HL.BOARD.y, 0, { xp: 1, town: 'board' }));
      for (const [m, px, py, r] of HL.PROPS) own.always.push(add(MD[m], px, py, r, { xp: 1, town: m })); }
    for (const b of TN.BUILDINGS) if (b.kind === 'house') { const fy = b.rot ? b.y - b.hd - 4 : b.y + b.hd + 4; own.always.push(add(MD.flowers, b.x - 11, fy, 0, { xp: 1, town: 'flowers' })); }
    const FS0 = root.PFFestival; // v5.11.0: 节庆广场 — the lantern ring stands all year (lit on festival nights), planters at the corners
    if (FS0 && FS0.RING && MD.lantern) for (const q of FS0.RING) own.always.push(add(MD.lantern, q.x, q.y, 0, { xp: 1, town: 'lantern' }));
    if (TN.SQUARE) { const q = TN.SQUARE; for (const [px, py] of [[q[0] + 12, q[1] + 6], [q[2] - 12, q[1] + 6], [q[0] + 12, q[3] - 6], [q[2] - 12, q[3] - 6]]) own.always.push(add(MD.flowers, px, py, 0, { xp: 1, town: 'flowers' })); }
    if (MD.lotSign) for (const r of TN.RESERVED) { const cx = (r.rect[0] + r.rect[2]) / 2; // v5.11.0: 待开发 — a signpost and four stakes; the ground stays empty for later
      own.always.push(add(MD.lotSign, cx, r.rect[3] - 3, 0, { xp: 1, town: 'reserved', lot: r.id }));
      for (const [sx, sy] of [[r.rect[0] + 1, r.rect[1] + 1], [r.rect[2] - 1, r.rect[1] + 1], [r.rect[0] + 1, r.rect[3] - 1], [r.rect[2] - 1, r.rect[3] - 1]]) own.always.push(add(MD.stake, sx, sy, 0, { xp: 1, town: 'stake', lot: r.id })); }
    if (x.lampModel) for (const l of TN.LAMPS) own.always.push(add(x.lampModel(), l.x, l.y, 0, { xp: 1, town: 'lamp' }));
    // the town's fence: all round, with the west gap at the gate
    const R0 = TN.RECT, fence = x.models.fence;
    for (let fx = R0[0]; fx < R0[2]; fx += 8) for (const fy of [R0[1], R0[3]]) own.always.push(add(fence, fx + 4, fy, 0, { xp: 1, town: 'fence' }));
    for (let fy = R0[1]; fy < R0[3]; fy += 8) for (const fx of [R0[0], R0[2]]) { if (fx === R0[0] && Math.abs(fy + 4 - TN.GATE.y) < 10) continue; own.always.push(add(fence, fx, fy + 4, Math.PI / 2, { xp: 1, town: 'fence' })); }
    // trees on the town's grass, kept off streets, buildings and the square
    { let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (const [tx, ty] of TN.TREES) { // v5.11.0: town.js keeps the list (the test checks they stay off streets and roofs)
        const defs = rnd() < 0.5 ? x.treeDefs.oak : x.treeDefs.small; x.addTree(defs[Math.floor(rnd() * defs.length)], tx + (rnd() - 0.5) * 3, ty + (rnd() - 0.5) * 3); } }
    // the strip east of the old map edge: cliff slabs where the ridge runs on
    const xmod = xm && xm.ledges; if (xmod) for (let gx = 448; gx <= ((root.PFWorld && root.PFWorld.WORLD.x1) || 640); gx += 8) { const ry = PL.ridgeY(gx); own.always.push(add(xmod[((gx / 8) | 0) % 3], gx, ry - 1.5, 0, { xp: 1 })); }
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
    const fest = !!(root.PFFestival && H && root.PFFestival.isDay(H, S.day));
    const k = open && H ? JSON.stringify([H.built, H.job, H.gifts, lots, path, sports ? 1 : 0, fest ? 1 : 0]) : ''; if (!force && k === hallKey) return; hallKey = k;
    for (const q of own.hall.concat(own.dress)) removeFrom(q); own.hall.length = 0; own.dress.length = 0; if (!k) return;
    const CL = root.PFClinic; // v5.10.10: original houses swap to a two-storey (or scaffolding) when rebuilt
    if (CL) for (const b of TN.BUILDINGS) if (b.kind === 'house') {
      const prop = own.always.find(q => q.town === b.id); if (!prop) continue;
      const up = H.job && H.job.id === b.id, done = !!H.built[b.id], style = (CL.HOUSE[b.id] && CL.HOUSE[b.id].style) || 0;
      prop.m = up ? (MD.scaffoldHouse || MD.scaffold) : done ? ((MD.twoHouse || MD.two)[style] || MD.two[0]) : MD.houses[b.roof || 0]; } // v5.11.0: a rebuilt house keeps its own 16 x 14 plot
    for (const l of HL.LOTS) { const built = !!H.built[l.id], up = H.job && H.job.id === l.id; if (!built && !up) continue;
      own.hall.push(X.addProp(built ? (MD.two[l.style] || MD.two[2]) : MD.scaffold, l.x, l.y, l.rot, { xp: 1, big: 1, town: l.id }));
      if (built) { const fy = l.rot ? l.y - l.hd - 4 : l.y + l.hd + 4; own.hall.push(X.addProp(MD.flowers, l.x - 13, fy, 0, { xp: 1, town: 'flowers' })); }
      if (built && l.id === 'bakery' && MD.orderBoard) { const BK = root.PFBakery; own.hall.push(X.addProp(MD.orderBoard, (BK && BK.BOARD.x) || (l.door.x - 8), (BK && BK.BOARD.y) || (l.door.y + 1), 0, { xp: 1, town: 'orders' })); }
      if (built && l.id === 'woodshop' && MD.timber) { const WS = root.PFWoodshop; own.hall.push(X.addProp(MD.timber, (WS && WS.PILE.x) || (l.door.x - 7), (WS && WS.PILE.y) || (l.door.y + 1), 0, { xp: 1, town: 'timber' })); }
      if (built && l.id === 'smithy' && MD.anvil) { const SM = root.PFSmithy; own.hall.push(X.addProp(MD.anvil, (SM && SM.ANVIL.x) || (l.door.x - 6), (SM && SM.ANVIL.y) || (l.door.y + 1), 0, { xp: 1, town: 'anvil' })); }
      if (built && l.id === 'library' && MD.orderBoard) { const LB = root.PFLibrary; own.hall.push(X.addProp(MD.orderBoard, (LB && LB.BOARD.x) || (l.door.x - 8), (LB && LB.BOARD.y) || (l.door.y + 1), 0, { xp: 1, town: 'libboard' })); } }
    const SC = root.PFSchool; // v5.10.9: the flag; extra flags on sports day. v5.12.0 操场重做: goals, hoop, stands, toys, a tall flagpole
    if (SC && H.built.school) {
      own.hall.push(X.addProp(MD.flagHigh || MD.yardFlag, SC.FLAG.x, SC.FLAG.y, 0, { xp: 1, town: 'flag' }));
      const PM = MD.play || {}; let stand = false;
      for (const q of (SC.PLAY || [])) { const m = PM[q.k]; if (!m) continue; if (q.k === 'stand') stand = true; own.hall.push(X.addProp(m, q.x, q.y, q.rot || 0, { xp: 1, town: 'play:' + q.k })); }
      const DM = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models();
      if (!stand && DM && DM.bench) for (const b of SC.BENCHES) own.hall.push(X.addProp(DM.bench, b.x, b.y, 0, { xp: 1, town: 'yardbench' }));
      const T = SC.TRACK, top = T.cy - T.ry - ((SC.LANES && SC.LANES[2]) || 0) - 2; // sports-day flags just outside the outer lane
      if (sports && MD.yardFlag) { own.hall.push(X.addProp(MD.yardFlag, T.cx - 6, top, 0, { xp: 1, town: 'flag' })); own.hall.push(X.addProp(MD.yardFlag, T.cx + 6, top, 0, { xp: 1, town: 'flag' })); }
    }
    const PK = root.PFPark; // v5.12.3 镇公园: R1's signpost and stakes go once the park is built; its props in fixed slots
    if (PK) { const park = PK.built(H);
      for (const q of own.always) if (q.lot === 'R1') { const i = X.props.indexOf(q); if (park && i >= 0) X.props.splice(i, 1); else if (!park && i < 0) X.props.push(q); }
      if (park) { const DM = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models(), lampM = X.lampModel && X.lampModel();
        for (const q of PK.PROPS) { const m = q.k === 'bench' ? DM && DM.bench : q.k === 'sandbox' ? MD.play && MD.play.sandbox : q.k === 'lamp' ? lampM : MD[q.k];
          if (m) own.hall.push(X.addProp(m, q.x, q.y, q.rot || 0, { xp: 1, town: 'park:' + q.k })); }
        if (MD.picket) for (const f of PK.FENCE) own.hall.push(X.addProp(MD.picket, f.x, f.y, f.rot, { xp: 1, town: 'park:fence' })); }
      else if (H.job && H.job.id === 'park' && MD.timber) own.hall.push(X.addProp(MD.timber, PK.GATE.x + 10, PK.GATE.y - 6, 0, { xp: 1, town: 'park:timber' })); }
    const TL = root.PFTownLife; // v5.12.0 小镇美术升级: planters, sandwich boards, hanging signs, barrels, awnings and café tables in fixed slots
    if (TL) for (const d of TL.dressFor(H.built)) { const m = d.k === 'aframe' ? MD.aframes && MD.aframes[d.sign] : d.k === 'blade' ? MD.blades && MD.blades[d.sign] : d.k === 'awning' ? MD.awnings && MD.awnings[d.c | 0] : MD[d.k];
      if (!m) continue; const host = d.k === 'awning' && HL.LOTS.find(l => l.id === d.need); own.dress.push(X.addProp(m, d.x, d.y, host ? host.rot : 0, { xp: 1, town: 'dress:' + d.k })); }
    const MKS = root.PFMarket; // v5.10.3: the market stalls (bare frames while 阿松 is putting them up)
    if (MKS && (H.built.market || (H.job && H.job.id === 'market'))) MKS.STALLS.forEach((st, i) => { const m = H.built.market ? MD.stalls[i] : MD.stallFrame; if (m) own.hall.push(X.addProp(m, st.x, st.y, st.rot, { xp: 1, town: 'stall' })); });
    const DM = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models();
    if (DM) { const gp = HL.giftPos(H); H.gifts.forEach((id, i) => { const at = gp[i], m = DM[id]; if (m && at) own.hall.push(X.addProp(m, at.x, at.y, 0, { xp: 1, town: 'gift' })); }); } // v5.10.3: by kind (slots.js)
    const CR = root.PFCareers; // v5.10.6: a child's own shop (scaffolding the first day, then the model for its kind)
    if (CR && lots) for (const l of CR.LOTS) { const kid = lots[l.id]; if (!kid) continue; const p = path && path[kid], ready = CR.shopReady(p, S.day), kind = (p && p.kind) || 'flower';
      const m = ready ? ((MD.kidShops && MD.kidShops[kind]) || MD.two[2]) : MD.scaffold; if (m) own.hall.push(X.addProp(m, l.x, l.y, l.rot, { xp: 1, big: 1, town: l.id })); }
    const FS = root.PFFestival; // v5.10.11: the long table and lantern posts on harvest-festival day
    if (fest && FS) {
      if (MD.feast) for (const q of FS.SECTIONS) own.hall.push(X.addProp(MD.feast, q.x, q.y, 0, { xp: 1, big: 1, town: 'feast' })); // v5.11.0: three sections, 20 seats
      if (MD.lantern) for (const q of (FS.STREET_POSTS || FS.POSTS)) own.hall.push(X.addProp(MD.lantern, q.x, q.y, 0, { xp: 1, town: 'lantern' })); } // the square's ring stands all year (mount)
    X.markNavDirty();
  }
  // a little sign over the shut gate while the town is locked (drawn by game.js with the plot locks)
  // v5.9.1: the town's lamps and windows for game.js's lighting pass (only while the town is open)
  function lights(hz, T) { if (!(S && S.eff && S.eff.town)) return; for (const l of TN.lightsAt(T)) hz(l.x, l.y, l.z, l.r, l.s);
    if (HL && S.town && S.town.hall) for (const l of HL.lightsAt(S.town.hall, T, root.PFDecor && root.PFDecor.CATALOG)) hz(l.x, l.y, l.z, l.r, l.s); // v5.10.0: the new houses' windows, the gift lamps
    if (root.PFCareers && S.town && S.town.lots) for (const l of root.PFCareers.lightsAt(S.town.lots, S.home && S.home.path, T, S.day)) hz(l.x, l.y, l.z, l.r, l.s); // v5.10.6: the child's shop window at dusk
    if (root.PFTownLife && S.town && S.town.hall) for (const l of root.PFTownLife.signLights(S.town.hall.built, T)) hz(l.x, l.y, l.z, l.r, l.s); // v5.12.0: the hanging signs' lanterns
    const FS = root.PFFestival; // v5.10.11: warm lanterns over the paved streets and the plaza
    if (FS && S.town && S.town.hall && FS.fairOpen(S.town.hall, S.day, T)) for (const l of FS.lights()) hz(l.x, l.y, l.z, l.r, l.s); }
  function festString(ctx, proj, a, b, za, zb, n, lit, realT, ph) {
    for (let i = 1; i < n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = za + (zb - za) * t - Math.sin(Math.PI * t) * 5;
      const [sx, sy] = proj(x, y); const on = lit && (Math.sin(realT * 2 + i * 1.7 + ph) > -0.55);
      ctx.fillStyle = !lit ? Wd[4] : on ? ((i % 3 === 0) ? '#fff4b8' : (i % 3 === 1) ? Ac[1] : Ac[2]) : Wd[3];
      ctx.fillRect(Math.round(sx), Math.round(sy - z), 2, lit ? 3 : 1); }
  }
  function draw(ctx, proj, onScreen, realT, T, night) {
    const FS = root.PFFestival, H = S && S.town && S.town.hall;
    if (!FS || !H || !S.eff || !S.eff.town || !FS.isDay(H, S.day)) return;
    const lit = !!(FS.fairOpen(H, S.day, T) && night > 0.12);
    FS.STRINGS.forEach((pair, i) => { if (onScreen((pair[0].x + pair[1].x) / 2, (pair[0].y + pair[1].y) / 2, 80)) festString(ctx, proj, pair[0], pair[1], 16, 16, 10, lit, realT, i); });
  }
  // chimney tops in world units (model voxels are 2 per world unit; lots with rot π flip the footprint)
  function chimneyOf(lot, vx, vy, vz, W, D) {
    let dx = (vx - (W - 1) / 2) / 2, dy = (vy - (D - 1) / 2) / 2;
    if (lot.rot === Math.PI) { dx = -dx; dy = -dy; }
    return { x: lot.x + dx, y: lot.y + dy, z: vz / 2 };
  }
  function smoke() {
    const H = S && S.town && S.town.hall, out = []; if (!(S && S.eff && S.eff.town) || !H) return out;
    if (H.built && H.built.woodshop) { const WS = root.PFWoodshop, l = (WS && WS.LOT) || (HL && HL.LOT.woodshop); if (l) out.push(chimneyOf(l, 7.5, 10, 64, 40, 40)); } // v5.11.0 models (town-bldg.js)
    if (H.built && H.built.smithy) { const SM = root.PFSmithy, l = (SM && SM.LOT) || (HL && HL.LOT.smithy); if (l) out.push(Object.assign(chimneyOf(l, 30.5, 10.5, 72, 40, 40), { forge: 1 })); }
    return out;
  }
  const api = { ground, cross, mount, sync, lights, draw, smoke, models: () => MD, state: () => ({ hall: own.hall.length, dress: own.dress.length, hallKey, closed: !!own.closed, gate: own.gate.length, cleared: own.cleared.length, inProps: own.closed ? X.props.includes(own.closed) : null, key: lastKey }) };
  root.PFTownArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
