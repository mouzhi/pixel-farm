// v5.10.7 农家乐 I：小木屋、农家菜馆、门口的桌子、路灯和留言本（规则在 inn.js）。
// v5.10.8: two-storey inn cabins, beach huts, umbrellas, the seafood stall, the guest pier and the sunset deck.
// game.js calls mount(X) once its models exist, sync() whenever a cabin, the restaurant or a resort building goes up (idempotent: a key decides).
'use strict';
(function (root) {
  const IN = root.PFInn;
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, G = R.green, ink = R.ink[0];
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = [];
  const hash = (a, b, c) => { let n = a * 374761393 + b * 668265263 + c * 1442695; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };

  function makeModels(x) {
    const B = x.buildModel, gable = x.gableY;
    const win = (u, v, u0, v0, s) => { const du = u - u0, dv = v - v0; if (du < 0 || du >= s || dv < 0 || dv >= s) return null;
      if (du === 0 || du === s - 1 || dv === 0 || dv === s - 1) return Wd[1];
      if (du === (s >> 1) || dv === (s >> 1)) return Ac[0];
      return (du <= 1 && dv >= s - 3) ? Wt[5] : Wt[3]; };
    const litWin = (u, v, u0, v0, s) => { const du = u - u0, dv = v - v0; if (du < 0 || du >= s || dv < 0 || dv >= s) return null;
      if (du === 0 || du === s - 1 || dv === 0 || dv === s - 1) return Wd[1];
      if (du === (s >> 1) || dv === (s >> 1)) return Ac[1];
      return Ac[1]; };
    const logs = z => (z % 3 === 2 ? Wd[2] : (z % 6 < 3 ? Wd[3] : Wd[4]));
    // a south-facing log cabin: stone footing, two front windows with flower boxes, a green door under a little porch roof,
    // a chimney. v5.11.0.9 (房子比例): a size up to match the v5.11.0 town houses: walls 16 x 11 world units, 24 voxels a
    // storey, a door as tall as a grown-up (22 voxels; a grown-up is 24 px with the hat). floors 2: the two-storey inn.
    // voxels are half a world unit
    const CW = 40, CD = 34, CX0 = 4, CX1 = 35, CY0 = 3, CY1 = 24, FH = 24, ZW = 3 + FH;
    const DOOR = { x0: 16, x1: 23, top: 24 };
    const cabinOf = (roof, lit, floors) => { const ZT = 3 + FH * floors; // the eave beam
      return B(CW, CD, ZT + 20, (x, y, z) => {
      const wfn = lit ? litWin : win;
      const inX = x >= CX0 && x <= CX1, inY = y >= CY0 && y <= CY1;
      if (x >= CX1 - 7 && x <= CX1 - 4 && y >= CY0 + 3 && y <= CY0 + 6 && z >= 3 && z <= ZT + 18) return z >= ZT + 17 ? St[1] : (z % 4 === 0 ? St[1] : St[2]); // chimney
      if (z <= 2 && x >= CX0 - 1 && x <= CX1 + 1 && y >= CY0 - 1 && y <= CY1 + 1) return (z === 2 || (x + y + z) % 5) ? St[2] : St[1]; // footing
      if (inX && inY && z >= 3 && z <= ZT) {
        const front = y >= CY1 - 1, back = y <= CY0 + 1, side = x <= CX0 + 1 || x >= CX1 - 1;
        if (!(front || back || side)) { if (z >= 7 && z <= ZT - 4 && x >= CX0 + 5 && x <= CX1 - 5 && y >= CY0 + 5 && y <= CY1 - 5) return null; return Wd[4]; } // hollow inside
        if (side && (front || back)) return Wd[1];                                                        // corner posts
        if (z >= ZT - 1 || (floors > 1 && (z === ZW || z === ZW + 1))) return Wd[2];                     // eave beam, the floor beam between storeys
        const zf = z > ZW ? z - FH : z, up = z > ZW + 1;                                                 // height within its storey
        if (front) {
          if (!up && x >= DOOR.x0 && x <= DOOR.x1 && z <= DOOR.top) { if (x === DOOR.x0 || x === DOOR.x1 || z === DOOR.top) return Wd[1]; if (x === DOOR.x1 - 2 && z === 13) return Ac[1]; return (x - DOOR.x0) % 3 === 0 ? G[1] : G[2]; }
          const w = wfn(x, zf, 6, 11, 8) || wfn(x, zf, 26, 11, 8) || (up && wfn(x, zf, 16, 11, 8)); if (w) return w; }
        if (side) { const w = wfn(y, zf, 10, 11, 7); if (w) return w; }
        if (back) { const w = wfn(x, zf, 16, 11, 8); if (w) return w; }
        return logs(z); }
      if (y === CY1 + 1 && z >= 9 && z <= 10) for (const u0 of [6, 26]) if (x >= u0 && x <= u0 + 7) return z === 9 ? Wd[1] : ((x % 3 === 0) ? Ac[3] : G[3]); // flower boxes
      if (y === CY1 + 1 && x === DOOR.x1 + 2 && z >= 16 && z <= 19) return z === 19 || z === 16 ? Wd[1] : Ac[1];                         // the door lantern
      const P0 = DOOR.x0 - 5, P1 = DOOR.x1 + 5, pr = 28 + Math.floor((CY1 + 1 - y) / 2);                                                  // the porch
      if (y > CY1 && y <= CY1 + 6 && x >= P0 && x <= P1) {
        if (z <= 1) return (x & 1) ? Wd[3] : Wd[4];
        if ((x === P0 || x === P1) && y === CY1 + 6 && z < pr) return Wd[2];
        if (z === pr || z === pr + 1) return z % 2 ? PAL.dark(roof, 1) : roof;
        return null; }
      if (z === 0 && y > CY1 + 6 && y <= CY1 + 8 && x >= DOOR.x0 && x <= DOOR.x1) return St[3];                                          // doorstep
      const r = gable(x, y, z, { z0: ZT + 1, pitch: 0.75, x0: CX0 - 2, x1: CX1 + 2, y0: CY0 - 1, y1: CY1 + 1, fy0: CY0, fy1: CY1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[2] });
      if (r === 'fill') { const cx = (CX0 + CX1) / 2; if (y >= CY1 - 1 && Math.abs(x - cx) <= 2.5 && z >= ZT + 3 && z <= ZT + 7) return (Math.abs(x - cx) >= 2.5 || z === ZT + 3 || z === ZT + 7) ? Wd[1] : (lit ? Ac[1] : Wt[3]); return logs(z); } // a gable vent
      if (r) return r;
      return null;
    }); };
    const cabin = (roof, lit) => cabinOf(roof, lit, 1);
    // being built: the footing, a plank floor, corner posts, the first log courses, the eave beams, logs waiting out front
    const frame = B(CW, CD, ZW + 12, (x, y, z) => {
      const inX = x >= CX0 && x <= CX1, inY = y >= CY0 && y <= CY1, edge = x === CX0 || x === CX1 || y === CY0 || y === CY1;
      if (z <= 2 && x >= CX0 - 1 && x <= CX1 + 1 && y >= CY0 - 1 && y <= CY1 + 1) { const rim = x <= CX0 || x >= CX1 || y <= CY0 || y >= CY1;
        if (rim) return (z === 2 || (x + y + z) % 5) ? St[2] : St[1]; return z === 0 ? ((x % 4) ? Wd[3] : Wd[2]) : null; }
      if (!(inX && inY)) {
        if (y >= CY1 + 2 && y <= CY1 + 7 && x >= CX0 + 2 && x <= CX0 + 14 && z <= 4) return (x === CX0 + 2 || x === CX0 + 14) ? Wd[1] : Wd[2];
        return null; }
      const post = (x === CX0 || x === CX1) && (y === CY0 || y === CY1), doorPost = y === CY1 && (x === DOOR.x0 || x === DOOR.x1) && z <= DOOR.top;
      if ((post || doorPost) && z <= ZW) return Wd[1];
      if (edge && y !== CY1 && z >= 3 && z <= 9) return logs(z);
      if (edge && z === ZW) return Wd[2];
      return null;
    });
    // the restaurant: a wide south-facing hall, a kitchen wing on the east, a chimney, double doors onto the tables, a sign in the
    // gable. v5.11.0.9: a public building, so a size up from the cabins: walls 26 x 14 world units, 26-voxel walls, 22-voxel doors
    const DW = 60, DD = 42, DX0 = 4, DX1 = 55, DY0 = 4, DY1 = 31, DZW = 28, KX = 42;
    const DDOOR = { x0: 25, x1: 34, top: 24 };
    const diner = (lv, lit) => B(DW, DD, DZW + 25, (x, y, z) => {
      const wfn = lit ? litWin : win;
      const kitchen = lv >= 2 && x >= KX; // a slightly taller kitchen wing once the first upgrade is in
      const zt = DZW + (kitchen ? 3 : 0), cx = (DX0 + DX1) / 2;
      const inX = x >= DX0 && x <= DX1, inY = y >= DY0 && y <= DY1;
      if (x >= DX1 - 7 && x <= DX1 - 4 && y >= DY0 + 3 && y <= DY0 + 7 && z >= 3 && z <= DZW + 23) return z >= DZW + 22 ? St[1] : (z % 3 === 0 ? St[1] : St[2]); // chimney
      if (z <= 2 && x >= DX0 - 1 && x <= DX1 + 1 && y >= DY0 - 1 && y <= DY1 + 1) return (z === 2 || (x + y) % 4) ? St[2] : St[1];
      if (inX && inY && z >= 3 && z <= zt) {
        const front = y >= DY1 - 1, back = y <= DY0 + 1, side = x <= DX0 + 1 || x >= DX1 - 1;
        if (!(front || back || side)) { if (z >= 7 && z <= DZW - 4 && x >= DX0 + 5 && x <= DX1 - 5 && y >= DY0 + 5 && y <= DY1 - 5) return null; return kitchen ? Wd[3] : Ac[0]; }
        if (side && (front || back)) return Wd[1];
        if (z >= zt - 1) return Wd[2];
        if (kitchen && front && x === KX) return Wd[1];                                                   // where the wing starts
        if (front) {
          if (x >= DDOOR.x0 && x <= DDOOR.x1 && z <= DDOOR.top) { const mid = x === 29 || x === 30;      // double doors
            if (x === DDOOR.x0 || x === DDOOR.x1 || z === DDOOR.top || mid) return Wd[1];
            if (z >= 15 && z <= 20 && x !== DDOOR.x0 + 1 && x !== DDOOR.x1 - 1) return lit ? Ac[1] : Wt[3];
            if ((x === 28 || x === 31) && z === 12) return Ac[1]; return Rf[2]; }
          if (y === DY1 && x >= DDOOR.x0 - 1 && x <= DDOOR.x1 + 1 && z >= DDOOR.top + 1 && z <= DDOOR.top + 2) return Wd[1];      // lintel
          const w = wfn(x, z, 8, 10, 9) || wfn(x, z, 15, 10, 9) || wfn(x, z, 44, 10, 9); if (w) return w; }
        if (side) { const w = wfn(y, z, 10, 10, 8) || wfn(y, z, 20, 10, 8); if (w) return w; }
        if (back) { const w = wfn(x, z, 12, 10, 8) || wfn(x, z, 40, 10, 8); if (w) return w; }
        return (x + z) % 5 === 0 ? Wd[2] : Wd[4]; }
      if (y === DY1 + 1 && z >= 8 && z <= 9) for (const u0 of [8, 15, 44]) if (x >= u0 && x <= u0 + 8) return z === 8 ? Wd[1] : ((x % 3) ? Ac[3] : G[3]); // flower boxes
      if (y >= DY1 + 1 && y <= DY1 + 4 && x >= DDOOR.x0 - 3 && x <= DDOOR.x1 + 3 && z === DDOOR.top + 3 + Math.floor((DY1 + 1 - y) / 2)) return ((x >> 1) & 1) ? Rf[2] : Ac[0]; // an awning over the doors
      if (z <= 1 && y > DY1 && y <= DY1 + 3 && x >= DDOOR.x0 - 1 && x <= DDOOR.x1 + 1) return z === 1 && y === DY1 + 3 ? null : St[3]; // steps
      const roof = lv >= 3 ? Rf[1] : Rf[2];
      const r = gable(x, y, z, { z0: zt + 1, pitch: 0.6, x0: DX0 - 2, x1: DX1 + 2, y0: DY0 - 1, y1: DY1 + 1, fy0: DY0, fy1: DY1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[2] });
      if (r === 'fill') { // the sign: a board with a bowl on it, in the front gable
        if (y >= DY1 - 1 && Math.abs(x - cx) <= 7 && z >= DZW + 3 && z <= DZW + 10) { if (Math.abs(x - cx) === 7 || z === DZW + 3 || z === DZW + 10) return Wd[1];
          const bw = Math.hypot((x - cx) / 1.6, z - (DZW + 7)); return bw < 2.2 && z <= DZW + 7 ? Ac[0] : Ac[1]; }
        return Wd[4]; }
      if (r) return r;
      return null;
    });
    const dinerFrame = B(DW, DD, DZW + 10, (x, y, z) => {
      const inX = x >= DX0 && x <= DX1, inY = y >= DY0 && y <= DY1, edge = x === DX0 || x === DX1 || y === DY0 || y === DY1;
      if (z <= 2 && x >= DX0 - 1 && x <= DX1 + 1 && y >= DY0 - 1 && y <= DY1 + 1) { const rim = x <= DX0 || x >= DX1 || y <= DY0 || y >= DY1;
        if (rim) return St[2]; return z === 0 ? Wd[3] : null; }
      if (!(inX && inY)) return null;
      if ((x === DX0 || x === DX1 || x === KX) && (y === DY0 || y === DY1) && z <= DZW) return Wd[1];
      if (y === DY1 && (x === DDOOR.x0 || x === DDOOR.x1) && z <= DDOOR.top) return Wd[1];
      if (edge && z === DZW) return Wd[2];
      if (edge && z >= 3 && z <= 7 && !(y === DY1 && x > DDOOR.x0 && x < DDOOR.x1)) return Wd[3];
      return null;
    });
    // the kitchen upgrade is built on the restaurant's east wing, not a second restaurant on the guest lane
    const kitchenFrame = B(14, DD, DZW + 10, (x, y, z) => {
      const edge = x === 0 || x === 13 || y === DY0 || y === DY1;
      if (y < DY0 || y > DY1) return null;
      if ((x === 0 || x === 13) && (y === DY0 || y === DY1) && z <= DZW + 3) return Wd[1];
      if (edge && (z === DZW + 3 || z === DZW + 4)) return Wd[2];
      if (z <= 1) return Wd[3];
      return null;
    });
    // a little square table with two stools, seen from the south
    const table = B(16, 16, 9, (x, y, z) => {
      if ((x === 2 || x === 13) && (y === 3 || y === 12) && z <= 4) return Wd[1];
      if (z === 5 && x >= 1 && x <= 14 && y >= 2 && y <= 13) return (x + y) % 3 ? Wd[4] : Wd[3];
      if (z === 6 && x >= 2 && x <= 13 && y >= 3 && y <= 12) return ((x + y) % 4 === 0) ? Ac[0] : Rf[3];
      if ((Math.abs(x - 5) <= 1 && y >= 14 && y <= 15 && z <= 3) || (Math.abs(x - 10) <= 1 && y <= 1 && z <= 3)) return z === 3 ? Wd[4] : Wd[2];
      return null;
    });
    const lamp = B(4, 4, 26, (x, y, z) => { // v5.11.0.9: a lamp post taller than a grown-up (was 18)
      if ((x === 1 || x === 2) && (y === 1 || y === 2) && z <= 21) return z < 2 ? St[1] : Wd[2];
      if (z >= 22 && z <= 25 && x >= 0 && x <= 3 && y >= 0 && y <= 3) return (x === 0 || x === 3 || y === 0 || y === 3) ? Wd[1] : Ac[1];
      return null;
    });
    const pot = B(6, 6, 6, (x, y, z) => {
      if (z <= 2 && x >= 1 && x <= 4 && y >= 1 && y <= 4) return (x === 1 || x === 4 || y === 1 || y === 4) ? Rf[2] : St[2];
      if (z >= 3 && z <= 5 && Math.abs(x - 2.5) <= 1 && Math.abs(y - 2.5) <= 1) return z === 5 ? ((x + y) & 1 ? Ac[3] : G[4]) : G[2];
      return null;
    });
    const board = B(10, 4, 14, (x, y, z) => {
      if ((x === 1 || x === 8) && y <= 2 && z <= 12) return Wd[1];
      if (z >= 4 && z <= 12 && x >= 1 && x <= 8 && y <= 2) {
        if (z === 4 || z === 12 || x === 1 || x === 8) return Wd[2];
        return Ac[0];
      }
      return null;
    });
    // v5.10.8: the two-storey inn: the same cabin footprint, a second storey of windows, a taller roof
    const cabin2 = (roof, lit) => cabinOf(roof, lit, 2);
    // a pale beach hut: two windows, a blue door, a thatched roof. v5.11.0.9: walls 12 x 9 world units, a door a grown-up
    // walks through (19 voxels) and walls a storey high
    const HW = 32, HD = 28, HX0 = 4, HX1 = 27, HY0 = 3, HY1 = 20, HZW = 24, HDOOR = { x0: 13, x1: 18, top: 20 };
    const thatch = (z) => (z % 2 ? Ac[0] : '#c9a85a');
    const hut = (lit) => B(HW, HD, HZW + 17, (x, y, z) => {
      const wfn = lit ? litWin : win;
      const inX = x >= HX0 && x <= HX1, inY = y >= HY0 && y <= HY1;
      if (z <= 1 && x >= HX0 - 1 && x <= HX1 + 1 && y >= HY0 - 1 && y <= HY1 + 1) return (x + y + z) % 3 ? St[3] : Wd[5];
      if (inX && inY && z >= 2 && z <= HZW) {
        const front = y >= HY1 - 1, back = y <= HY0 + 1, side = x <= HX0 + 1 || x >= HX1 - 1;
        if (!(front || back || side)) return Wd[5];
        if (front) {
          if (x >= HDOOR.x0 && x <= HDOOR.x1 && z <= HDOOR.top) { if (x === HDOOR.x0 || x === HDOOR.x1 || z === HDOOR.top) return Wd[2]; if (x === HDOOR.x1 - 1 && z === 11) return Ac[1]; return Wt[4]; }
          const w = wfn(x, z, 6, 10, 6) || wfn(x, z, 20, 10, 6); if (w) return w; }
        if (side) { const w = wfn(y, z, 8, 10, 5); if (w) return w; }
        return (z % 3 === 2) ? Wd[4] : Wd[5]; }
      if (z === 0 && y > HY1 + 1 && y <= HY1 + 3 && x >= HDOOR.x0 - 1 && x <= HDOOR.x1 + 1) return Wd[3];   // a plank step
      const r = gable(x, y, z, { z0: HZW + 1, pitch: 0.85, x0: HX0 - 2, x1: HX1 + 2, y0: HY0 - 1, y1: HY1 + 1, fy0: HY0, fy1: HY1, base: Ac[0], line: '#b08a3a', ridge: '#8a6a2a', trim: Wd[3] });
      if (r === 'fill') return thatch(z);
      if (r) return r;
      return null;
    });
    const hutFrame = B(HW, HD, HZW + 8, (x, y, z) => {
      const edge = x === HX0 || x === HX1 || y === HY0 || y === HY1;
      if (z <= 1 && x >= HX0 && x <= HX1 && y >= HY0 && y <= HY1) return (x === HX0 || x === HX1 || y === HY0 || y === HY1) ? St[2] : Wd[4];
      if ((x === HX0 || x === HX1) && (y === HY0 || y === HY1) && z <= HZW) return Wd[2];
      if (edge && z === HZW) return Wd[3];
      return null;
    });
    // a beach umbrella: a thin pole and a striped cone. Colours cycle by slot.
    const parasol = (c1, c2) => B(14, 14, 18, (x, y, z) => {
      const cx = 7, cy = 7;
      if (Math.abs(x - cx) <= 0 && Math.abs(y - cy) <= 0 && z <= 12) return Wd[2];
      if (z >= 12 && z <= 17) {
        const d = Math.hypot(x - cx, y - cy);
        const top = 17 - z;
        if (d <= 1 + top * 1.6 && d >= (top === 0 ? 0 : top * 1.6 - 1.4)) return ((Math.atan2(y - cy, x - cx) + 6.3) / 0.8 | 0) % 2 ? c1 : c2;
      }
      return null;
    });
    // seafood stall: an open south counter, a striped awning, a little chimney. v5.11.0.9: the awning clears a grown-up's hat
    const stall = B(22, 16, 32, (x, y, z) => {
      if (z <= 1 && x >= 1 && x <= 20 && y >= 2 && y <= 14) return (x + y) % 2 ? Wd[3] : Wd[4];
      if ((x === 1 || x === 20) && y >= 2 && y <= 13 && z >= 2 && z <= 24) return Wd[2];
      if ((x === 1 || x === 20) && y === 14 && z >= 2 && z <= 22) return Wd[2];                     // front posts
      if (y === 2 && x >= 1 && x <= 20 && z >= 2 && z <= 16) return (z === 16 || z === 9) ? Wd[1] : Wd[3];
      if (y === 3 && x >= 3 && x <= 14 && (z === 12 || z === 13) && x % 3) return z === 12 ? Wd[2] : Wt[3];  // a shelf with fish on hooks
      if (y >= 11 && y <= 14 && x >= 3 && x <= 18 && z <= 8) { if (z === 8) return Wd[4]; return y === 14 ? (x % 5 === 3 ? Wd[1] : Wd[2]) : null; } // the counter
      if (y >= 12 && y <= 13 && x >= 4 && x <= 17 && z === 9) return (x % 3 ? Wt[3] : Ac[1]);                // fish on the counter
      if (z >= 22 && z <= 26 && x >= 0 && x <= 21 && y >= 2 && y <= 15) {
        const drop = Math.floor((y - 2) / 3);
        if (z === 26 - drop || z === 25 - drop) return (x % 2 ? Rf[2] : Ac[0]);
      }
      if (x >= 16 && x <= 18 && y >= 3 && y <= 5 && z >= 3 && z <= 31) return z >= 30 ? St[1] : (z % 3 === 0 ? St[1] : St[2]);
      return null;
    });
    const pierSeg = B(12, 16, 5, (x, y, z) => {
      if (z === 0 && (x === 1 || x === 10) && (y % 4 === 0)) return St[1];
      if (z === 1 || z === 2) return (y & 1) ? Wd[3] : Wd[4];
      if (z === 3 && (x <= 1 || x >= 10)) return Wd[2];
      return null;
    });
    const deck = B(28, 16, 8, (x, y, z) => {
      if (z <= 1 && x >= 1 && x <= 26 && y >= 1 && y <= 14) return (x + y) % 2 ? Wd[3] : Wd[4];
      if (z === 0 && (x === 1 || x === 26) && (y === 1 || y === 14)) return St[1];
      if (z >= 2 && z <= 6 && (x === 1 || x === 26 || y === 1) && !((y >= 12) && x > 2 && x < 25)) return z === 6 ? Wd[1] : Wd[2];
      if (z === 3 && y >= 6 && y <= 9 && ((x >= 4 && x <= 10) || (x >= 17 && x <= 23))) return Wd[4]; // benches facing the sea
      return null;
    });
    return { cabinDay: cabin(Rf[3], false), cabinNight: cabin(Rf[3], true), cabinAlt: cabin(G[2], false), cabinAltNight: cabin(G[2], true),
      cabin2Day: cabin2(Rf[3], false), cabin2Night: cabin2(Rf[3], true), cabin2Alt: cabin2(G[2], false), cabin2AltNight: cabin2(G[2], true), frame,
      diner0: diner(1, false), diner0n: diner(1, true), diner1: diner(2, false), diner1n: diner(2, true), diner2: diner(3, false), diner2n: diner(3, true),
      dinerFrame, kitchenFrame, table, lamp, pot, board,
      hutDay: hut(false), hutNight: hut(true), hutFrame,
      parasolA: parasol(Rf[2], Ac[0]), parasolB: parasol(Wt[3], Ac[0]), parasolC: parasol(G[2], Ac[0]), parasolD: parasol('#3a5a8c', Ac[0]),
      stall, pierSeg, deck };
  }
  const DINER_CY = 1.5; // v5.11.0.9: the restaurant's walls fill its block (hd 8), the steps and awning hang south
  const CABIN_CY = 1.5; // model centre sits a little north of the door so the porch hangs south (v5.11.0.9: the bigger cabin's walls fill hd 6.5)

  function layout() { // v5.11.0.5: the 农家乐区 (game.js decides when it is open)
    if (X && X.innLay) return X.innLay();
    const id = IN && S && S.plots ? IN.innPlotOf(S.plots) : null;
    return id ? IN.layout(id) : null;
  }
  function rLayout() { return IN && IN.resortLayout ? IN.resortLayout() : null; }
  function occupiedRooms(T) {
    const t = ((T % 1440) + 1440) % 1440, day = S && S.day | 0;
    const night = t >= 18 * 60 || t < IN.LEAVE_MORNING;
    const stay = IN && S && S.inn ? IN.staying(S.inn, day) : [];
    const rooms = new Set();
    if (night) for (const g of stay) {
      if (IN.stayOf && IN.stayOf(g) === 'beach') continue;
      rooms.add(IN.cabinOf ? IN.cabinOf(g, S.inn) : g.room);
    }
    return rooms;
  }
  function occupiedHuts(T) {
    const t = ((T % 1440) + 1440) % 1440, day = S && S.day | 0;
    const night = t >= 18 * 60 || t < IN.LEAVE_MORNING;
    const stay = IN && S && S.inn ? IN.staying(S.inn, day) : [];
    const rooms = new Set();
    if (night) for (const g of stay) if (IN.stayOf && IN.stayOf(g) === 'beach') rooms.add(g.room);
    return rooms;
  }
  function clock() {
    const t = ((S && S.t || 0) % 1440 + 1440) % 1440;
    return { t, late: t >= 17 * 60 + 30 || t < 6 * 60 + 30, dusk: t >= 17 * 60 + 30 && t < 22 * 60 + 30 };
  }
  function keyOf() {
    const I = S && S.inn, L = layout(), R = I && I.resort;
    if (!I) return 'none';
    const c = clock(), rooms = [...occupiedRooms(S.t)].join(','), huts = [...occupiedHuts(S.t)].join(',');
    return [L ? L.plot : '-', I.cabins | 0, I.inn2 | 0, (I.diner && I.diner.lv) | 0, I.job ? I.job.id + I.job.day : '',
      R ? [R.huts, R.parasols, R.stall, R.pier, R.deck].join('.') : '', rooms, huts, c.late ? 1 : 0, c.dusk ? 1 : 0].join('|');
  }
  function clear() { for (const p of own) { const i = X.props.indexOf(p); if (i >= 0) X.props.splice(i, 1); } own.length = 0; }
  function add(m, x, y, rot, meta) { if (!m) return null; const p = X.addProp(m, x, y, rot || 0, Object.assign({ inn: 1, big: 1 }, meta || {})); own.push(p); return p; }
  function sync(force) {
    if (!mounted || !S) return;
    const k = keyOf(); if (k === lastKey && !force) return; lastKey = k;
    clear();
    const I = S.inn; if (!I) return;
    const L = layout(), job = I.job, ck = clock(), rooms = occupiedRooms(S.t);
    if (L) {
      const n = I.cabins | 0, lv = (I.diner && I.diner.lv) | 0, two = !!I.inn2;
      for (let i = 0; i < L.cabins.length; i++) {
        const c = L.cabins[i];
        if (i < n) {
          const lit = ck.late && (rooms.has(i) || ck.dusk);
          const alt = i % 2;
          const m = two
            ? (lit ? (alt ? MD.cabin2AltNight : MD.cabin2Night) : (alt ? MD.cabin2Alt : MD.cabin2Day))
            : (lit ? (alt ? MD.cabinAltNight : MD.cabinNight) : (alt ? MD.cabinAlt : MD.cabinDay));
          add(m, c.x, c.y + CABIN_CY, 0, { cabin: i, inn2: two ? 1 : 0 });
        } else if (job && job.id === 'cabin' && i === n) add(MD.frame, c.x, c.y + CABIN_CY, 0, { cabin: i, frame: 1 });
      }
      if (lv > 0) {
        const lit = ck.dusk;
        const m = lv >= 3 ? (lit ? MD.diner2n : MD.diner2) : lv >= 2 ? (lit ? MD.diner1n : MD.diner1) : (lit ? MD.diner0n : MD.diner0);
        add(m, L.diner.x, L.diner.y + DINER_CY, 0, { diner: 1 });
        const seats = IN.seatsOf(I), tables = Math.ceil(seats / 2);
        for (let i = 0; i < Math.min(tables, L.tables.length); i++) add(MD.table, L.tables[i].x, L.tables[i].y, 0, { table: i, big: 0 });
      } else if (job && job.id === 'diner') add(MD.dinerFrame, L.diner.x, L.diner.y + DINER_CY, 0, { diner: 1, frame: 1 });
      if (job && job.id === 'kitchen' && lv > 0) add(MD.kitchenFrame, L.diner.x + 9.5, L.diner.y + DINER_CY, 0, { kitchen: 1, frame: 1 });
      if (job && job.id === 'inn2' && n > 0) add(MD.frame, L.cabins[0].x, L.cabins[0].y + CABIN_CY, 0, { inn2: 1, frame: 1 });
      for (const p of L.pots) add(MD.pot, p.x, p.y, 0, { pot: 1, big: 0 });
      for (const p of L.lamps) add(MD.lamp, p.x, p.y, 0, { lamp: 1, big: 0 });
      add(MD.board, L.board.x, L.board.y, 0, { board: 1, big: 0 });
    }
    const RL = rLayout(), r = I.resort, hutsLit = occupiedHuts(S.t);
    if (RL && r) {
      const umb = [MD.parasolA, MD.parasolB, MD.parasolC, MD.parasolD];
      for (let i = 0; i < (r.huts | 0); i++) {
        const c = RL.huts[i]; if (!c) continue;
        const lit = ck.late && (hutsLit.has(i) || ck.dusk);
        add(lit ? MD.hutNight : MD.hutDay, c.x, c.y + 1, 0, { hut: i });
      }
      if (job && job.id === 'hut' && RL.huts[r.huts | 0]) add(MD.hutFrame, RL.huts[r.huts | 0].x, RL.huts[r.huts | 0].y + 1, 0, { hut: r.huts | 0, frame: 1 });
      for (let i = 0; i < (r.parasols | 0); i++) {
        const u = RL.parasols[i]; if (u) add(umb[i % umb.length], u.x, u.y, 0, { parasol: i, big: 0 });
      }
      if (r.stall) add(MD.stall, RL.stall.x, RL.stall.y, 0, { stall: 1 });
      else if (job && job.id === 'stall') add(MD.hutFrame, RL.stall.x, RL.stall.y, 0, { stall: 1, frame: 1 });
      if (r.pier) {
        for (let y = RL.pier.from.y; y <= RL.pier.stand.y + 4; y += 8) add(MD.pierSeg, RL.pier.x, y, 0, { pier: 1 });
      } else if (job && job.id === 'pier') add(MD.pierSeg, RL.pier.from.x, RL.pier.from.y, 0, { pier: 1, frame: 1 });
      if (r.deck) add(MD.deck, RL.deck.x, RL.deck.y, 0, { deck: 1 });
      else if (job && job.id === 'deck') add(MD.hutFrame, RL.deck.x, RL.deck.y, 0, { deck: 1, frame: 1 });
    }
  }
  function lights(hz, T) {
    const I = S && S.inn; if (!I) return;
    const t = ((T % 1440) + 1440) % 1440;
    const dusk = t >= 17 * 60 + 30 && t < 22 * 60 + 30;
    const late = t >= 17 * 60 + 30 || t < 6 * 60 + 30;
    if (!late) return;
    const L = layout();
    if (L) {
      const rooms = occupiedRooms(T);
      for (let i = 0; i < (I.cabins | 0); i++) {
        const c = L.cabins[i]; if (!c) continue;
        if (rooms.has(i) || dusk) {
          hz(c.door.x, c.door.y - 2, 14, rooms.has(i) ? 22 : 14, rooms.has(i) ? 0.85 : 0.45);
          if (I.inn2) hz(c.door.x, c.door.y - 2, 38, rooms.has(i) ? 18 : 12, rooms.has(i) ? 0.7 : 0.4);
        }
      }
      if ((I.diner && I.diner.lv) > 0 && dusk) hz(L.diner.door.x, L.diner.door.y - 2, 14, 28, 0.7);
      for (const p of L.lamps) hz(p.x, p.y, 23, 16, 0.55);
    }
    const RL = rLayout(), r = I.resort;
    if (RL && r) {
      const hutsLit = occupiedHuts(T);
      for (let i = 0; i < (r.huts | 0); i++) {
        const c = RL.huts[i]; if (!c) continue;
        if (hutsLit.has(i) || dusk) hz(c.door.x, c.door.y - 2, 12, hutsLit.has(i) ? 18 : 12, hutsLit.has(i) ? 0.8 : 0.45);
      }
      if (r.stall && dusk) hz(RL.stall.door.x, RL.stall.door.y - 2, 14, 16, 0.6);
      if (r.deck) hz(RL.deck.x, RL.deck.y, 10, 14, dusk ? 0.7 : 0.35);
    }
  }
  function smoke() {
    const I = S && S.inn; if (!I) return [];
    const t = ((S.t % 1440) + 1440) % 1440;
    const out = [];
    const L = layout();
    if (L && (I.diner && I.diner.lv) > 0 && t >= 10 * 60 && t < 20 * 60) out.push({ x: L.diner.x + 10, y: L.diner.y - 6.5, z: 26 });
    const RL = rLayout();
    if (RL && I.resort && I.resort.stall && t >= 10 * 60 && t < 20 * 60) out.push({ x: RL.stall.x + 3, y: RL.stall.y - 2, z: 16 });
    return out;
  }
  function blocks() {
    const I = S && S.inn, out = []; if (!I) return out;
    const L = layout();
    if (L) {
      for (let i = 0; i < (I.cabins | 0); i++) { const c = L.cabins[i]; if (c) out.push([c.x - c.hw, c.y - c.hd, c.x + c.hw, c.y + c.hd - 1]); }
      if ((I.diner && I.diner.lv) > 0) out.push([L.diner.x - L.diner.hw, L.diner.y - L.diner.hd, L.diner.x + L.diner.hw, L.diner.y + L.diner.hd - 1]);
    }
    const RL = rLayout(), r = I.resort;
    if (RL && r) {
      for (let i = 0; i < (r.huts | 0); i++) { const c = RL.huts[i]; if (c) out.push([c.x - c.hw, c.y - c.hd, c.x + c.hw, c.y + c.hd - 1]); }
      if (r.stall) out.push([RL.stall.x - RL.stall.hw, RL.stall.y - RL.stall.hd, RL.stall.x + RL.stall.hw, RL.stall.y + RL.stall.hd - 1]);
      if (r.deck) out.push([RL.deck.x - RL.deck.hw, RL.deck.y - RL.deck.hd, RL.deck.x + RL.deck.hw, RL.deck.y + RL.deck.hd - 1]);
    }
    return out;
  }
  function ground(x, y) {
    const L = layout();
    if (L && (!L.rect || (x >= L.rect[0] - 4 && x <= L.rect[2] + 4 && y >= L.rect[1] - 4 && y <= L.rect[3] + 4))) {
      for (const path of (L.paths || [L.path])) for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len);
        if (t < -0.02 || t > 1.02) continue;
        const px = a.x + t * dx, py = a.y + t * dy;
        if (Math.hypot(x - px, y - py) < 3.2) return [hash(x, y, 3) > 0.7 ? Wd[3] : Wd[4], 'dirt'];
      }
      const dinerUp = (S.inn && S.inn.diner && S.inn.diner.lv) > 0;
      if (dinerUp) {
        for (const tb of L.tables) if (Math.hypot(x - tb.x, y - tb.y) < 5) return [St[3], 'dirt'];
      }
      // v5.11.0.5: the district's yard under the cabins, the restaurant's forecourt, the kitchen garden and the guest square
      const inR = r => r && x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
      if ((S.inn && S.inn.cabins | 0) > 0 && L.site && x >= 462 && x <= 578 && y >= -4 && y <= 24) return [hash(x, y, 7) > 0.8 ? Wd[3] : Wd[4], 'dirt'];
      if (dinerUp && inR(L.garden)) {
        const row = Math.floor((y - L.garden[1]) / 6), inRow = (y - L.garden[1]) - row * 6;
        if (x < L.garden[0] + 1 || x > L.garden[2] - 1 || y < L.garden[1] + 1 || y > L.garden[3] - 1) return [Wd[2], 'dirt']; // a low wooden edge
        if (inRow < 3) return [hash(x, y, 9) > 0.5 ? G[4] : G[2], 'dirt'];  // greens
        return [Wd[1], 'dirt'];                                           // tilled soil between the rows
      }
      if (dinerUp && inR(L.square)) {
        const u = Math.floor((x + (Math.floor(y / 3) & 1) * 1.5) / 3), gx = (x + (Math.floor(y / 3) & 1) * 1.5) % 3, gy = y % 3;
        if (gx < 0.5 || gy < 0.5) return [St[1], 'dirt'];
        return [(u + Math.floor(y / 3)) % 4 ? St[3] : St[2], 'dirt'];
      }
    }
    const RL = rLayout(), r = S && S.inn && S.inn.resort;
    if (RL && r && (r.huts || r.parasols || r.stall || r.deck)) {
      for (let i = 0; i < RL.path.length - 1; i++) {
        const a = RL.path[i], b = RL.path[i + 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len);
        if (t < -0.02 || t > 1.02) continue;
        const px = a.x + t * dx, py = a.y + t * dy;
        if (Math.hypot(x - px, y - py) < 2.6) return [hash(x, y, 5) > 0.5 ? Wd[4] : Wd[5], 'sand'];
      }
    }
    return null;
  }
  function mount(x) { X = x; S = x.S; MD = makeModels(x); mounted = true; sync(true); return api; }
  const api = { mount, sync, lights, smoke, blocks, ground, layout, resortLayout: rLayout, models: () => MD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFInnArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
