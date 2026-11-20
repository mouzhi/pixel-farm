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
    // a small south-facing log cabin: stone footing, two front windows, a green door, a little porch and a chimney
    // world footprint ~14×10 (hw 7, hd 5); voxels are half a world unit
    const CW = 32, CD = 28, CX0 = 4, CX1 = 27, CY0 = 3, CY1 = 18, ZW = 14;
    const DOOR = { x0: 13, x1: 18 };
    const cabin = (roof, lit) => B(CW, CD, ZW + 16, (x, y, z) => {
      const wfn = lit ? litWin : win;
      const inX = x >= CX0 && x <= CX1, inY = y >= CY0 && y <= CY1;
      if (x >= CX1 - 6 && x <= CX1 - 3 && y >= CY0 + 3 && y <= CY0 + 6 && z >= 3 && z <= ZW + 12) return z >= ZW + 11 ? St[1] : (z % 4 === 0 ? St[1] : St[2]);
      if (z <= 2 && x >= CX0 - 1 && x <= CX1 + 1 && y >= CY0 - 1 && y <= CY1 + 1) return (z === 2 || (x + y + z) % 5) ? St[2] : St[1];
      if (inX && inY && z >= 3 && z <= ZW) {
        const front = y >= CY1 - 1, back = y <= CY0 + 1, side = x <= CX0 + 1 || x >= CX1 - 1;
        if (!(front || back || side)) return Wd[4];
        if (side && (front || back)) return Wd[1];
        if (z >= ZW - 1) return Wd[2];
        if (front) {
          if (x >= DOOR.x0 && x <= DOOR.x1 && z <= 11) { if (x === DOOR.x0 || x === DOOR.x1 || z === 11) return Wd[1]; if (x === DOOR.x1 - 1 && z === 7) return Ac[1]; return (x - DOOR.x0) % 3 === 0 ? G[1] : G[2]; }
          const w = wfn(x, z, 6, 6, 6) || wfn(x, z, 20, 6, 6); if (w) return w; }
        if (side) { const w = wfn(y, z, 8, 6, 5); if (w) return w; }
        return logs(z); }
      if (y === CY1 + 1 && z >= 5 && z <= 6) for (const u0 of [6, 20]) if (x >= u0 && x <= u0 + 5) return z === 5 ? Wd[1] : ((x % 3 === 0) ? Ac[3] : G[3]);
      const P0 = DOOR.x0 - 4, P1 = DOOR.x1 + 4;
      if (y > CY1 && y <= CY1 + 5 && x >= P0 && x <= P1) {
        if (z <= 1) return (x & 1) ? Wd[3] : Wd[4];
        if ((x === P0 || x === P1) && y === CY1 + 5 && z <= 12) return Wd[2];
        if (z === 12 + Math.floor((CY1 + 1 - y) / 2) || z === 13 + Math.floor((CY1 + 1 - y) / 2)) return z % 2 ? PAL.dark(roof, 1) : roof;
        return null; }
      if (z === 0 && y > CY1 + 5 && y <= CY1 + 7 && x >= DOOR.x0 && x <= DOOR.x1) return St[3];
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 0.75, x0: CX0 - 2, x1: CX1 + 2, y0: CY0 - 1, y1: CY1 + 1, fy0: CY0, fy1: CY1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[2] });
      if (r === 'fill') return logs(z);
      if (r) return r;
      return null;
    });
    const frame = B(CW, CD, ZW + 12, (x, y, z) => {
      const inX = x >= CX0 && x <= CX1, inY = y >= CY0 && y <= CY1, edge = x === CX0 || x === CX1 || y === CY0 || y === CY1;
      if (z <= 2 && x >= CX0 - 1 && x <= CX1 + 1 && y >= CY0 - 1 && y <= CY1 + 1) { const rim = x <= CX0 || x >= CX1 || y <= CY0 || y >= CY1;
        if (rim) return (z === 2 || (x + y + z) % 5) ? St[2] : St[1]; return z === 0 ? ((x % 4) ? Wd[3] : Wd[2]) : null; }
      if (!(inX && inY)) {
        if (y >= CY1 + 2 && y <= CY1 + 6 && x >= CX0 + 2 && x <= CX0 + 12 && z <= 4) return (x === CX0 + 2 || x === CX0 + 12) ? Wd[1] : Wd[2];
        return null; }
      const post = (x === CX0 || x === CX1) && (y === CY0 || y === CY1);
      if (post && z <= ZW) return Wd[1];
      if (edge && y !== CY1 && z >= 3 && z <= 7) return logs(z);
      if (edge && z === ZW) return Wd[2];
      return null;
    });
    // the restaurant: a wider south-facing hall, a kitchen wing on the east, a chimney, a door onto the tables
    const DW = 44, DD = 32, DX0 = 4, DX1 = 39, DY0 = 4, DY1 = 22, DZW = 16;
    const DDOOR = { x0: 19, x1: 24 };
    const diner = (lv, lit) => B(DW, DD, DZW + 18, (x, y, z) => {
      const wfn = lit ? litWin : win;
      const kitchen = lv >= 2 && x >= 32; // a slightly taller kitchen wing once the first upgrade is in
      const inX = x >= DX0 && x <= DX1, inY = y >= DY0 && y <= DY1;
      if (x >= DX1 - 5 && x <= DX1 - 2 && y >= DY0 + 3 && y <= DY0 + 6 && z >= 3 && z <= DZW + 14) return z >= DZW + 13 ? St[1] : (z % 3 === 0 ? St[1] : St[2]);
      if (z <= 2 && x >= DX0 - 1 && x <= DX1 + 1 && y >= DY0 - 1 && y <= DY1 + 1) return (z === 2 || (x + y) % 4) ? St[2] : St[1];
      if (inX && inY && z >= 3 && z <= DZW + (kitchen ? 2 : 0)) {
        const front = y >= DY1 - 1, back = y <= DY0 + 1, side = x <= DX0 + 1 || x >= DX1 - 1;
        if (!(front || back || side)) return kitchen ? Wd[3] : Ac[0];
        if (side && (front || back)) return Wd[1];
        if (z >= DZW - 1 + (kitchen ? 2 : 0)) return Wd[2];
        if (front) {
          if (x >= DDOOR.x0 && x <= DDOOR.x1 && z <= 12) { if (x === DDOOR.x0 || x === DDOOR.x1 || z === 12) return Wd[1]; if (x === DDOOR.x1 - 1 && z === 8) return Ac[1]; return Rf[2]; }
          const w = wfn(x, z, 8, 7, 7) || wfn(x, z, 29, 7, 7); if (w) return w; }
        if (side) { const w = wfn(y, z, 10, 7, 6); if (w) return w; }
        return (x + z) % 5 === 0 ? Wd[2] : Wd[4]; }
      if (y === DY1 + 1 && z >= 6 && z <= 7) for (const u0 of [8, 29]) if (x >= u0 && x <= u0 + 6) return z === 6 ? Wd[1] : ((x % 3) ? Ac[3] : G[3]);
      if (z === 0 && y > DY1 && y <= DY1 + 3 && x >= DDOOR.x0 - 1 && x <= DDOOR.x1 + 1) return St[3];
      const roof = lv >= 3 ? Rf[1] : Rf[2];
      const r = gable(x, y, z, { z0: DZW + 1 + (kitchen && x >= 32 ? 2 : 0), pitch: 0.7, x0: DX0 - 2, x1: DX1 + 2, y0: DY0 - 1, y1: DY1 + 1, fy0: DY0, fy1: DY1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[2] });
      if (r === 'fill') return Wd[4];
      if (r) return r;
      return null;
    });
    const dinerFrame = B(DW, DD, DZW + 10, (x, y, z) => {
      const inX = x >= DX0 && x <= DX1, inY = y >= DY0 && y <= DY1, edge = x === DX0 || x === DX1 || y === DY0 || y === DY1;
      if (z <= 2 && x >= DX0 - 1 && x <= DX1 + 1 && y >= DY0 - 1 && y <= DY1 + 1) { const rim = x <= DX0 || x >= DX1 || y <= DY0 || y >= DY1;
        if (rim) return St[2]; return z === 0 ? Wd[3] : null; }
      if (!(inX && inY)) return null;
      if ((x === DX0 || x === DX1) && (y === DY0 || y === DY1) && z <= DZW) return Wd[1];
      if (edge && z === DZW) return Wd[2];
      if (edge && z >= 3 && z <= 6) return Wd[3];
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
    const lamp = B(4, 4, 18, (x, y, z) => {
      if ((x === 1 || x === 2) && (y === 1 || y === 2) && z <= 14) return z < 2 ? St[1] : Wd[2];
      if (z >= 15 && z <= 17 && x >= 0 && x <= 3 && y >= 0 && y <= 3) return (x === 0 || x === 3 || y === 0 || y === 3) ? Wd[1] : Ac[1];
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
    // v5.10.8: the same cabin footprint, a second storey of windows, a taller roof
    const ZW2 = 28;
    const cabin2 = (roof, lit) => B(CW, CD, ZW2 + 16, (x, y, z) => {
      const wfn = lit ? litWin : win;
      const inX = x >= CX0 && x <= CX1, inY = y >= CY0 && y <= CY1;
      if (x >= CX1 - 6 && x <= CX1 - 3 && y >= CY0 + 3 && y <= CY0 + 6 && z >= 3 && z <= ZW2 + 12) return z >= ZW2 + 11 ? St[1] : (z % 4 === 0 ? St[1] : St[2]);
      if (z <= 2 && x >= CX0 - 1 && x <= CX1 + 1 && y >= CY0 - 1 && y <= CY1 + 1) return (z === 2 || (x + y + z) % 5) ? St[2] : St[1];
      if (inX && inY && z >= 3 && z <= ZW2) {
        const front = y >= CY1 - 1, back = y <= CY0 + 1, side = x <= CX0 + 1 || x >= CX1 - 1;
        if (!(front || back || side)) return Wd[4];
        if (side && (front || back)) return Wd[1];
        if (z >= ZW2 - 1) return Wd[2];
        if (front) {
          if (x >= DOOR.x0 && x <= DOOR.x1 && z <= 11) { if (x === DOOR.x0 || x === DOOR.x1 || z === 11) return Wd[1]; if (x === DOOR.x1 - 1 && z === 7) return Ac[1]; return (x - DOOR.x0) % 3 === 0 ? G[1] : G[2]; }
          const w = wfn(x, z, 6, 6, 6) || wfn(x, z, 20, 6, 6) || wfn(x, z, 6, 18, 6) || wfn(x, z, 20, 18, 6); if (w) return w; }
        if (side) { const w = wfn(y, z, 8, 6, 5) || wfn(y, z, 8, 18, 5); if (w) return w; }
        return logs(z); }
      if (y === CY1 + 1 && z >= 5 && z <= 6) for (const u0 of [6, 20]) if (x >= u0 && x <= u0 + 5) return z === 5 ? Wd[1] : ((x % 3 === 0) ? Ac[3] : G[3]);
      const P0 = DOOR.x0 - 4, P1 = DOOR.x1 + 4;
      if (y > CY1 && y <= CY1 + 5 && x >= P0 && x <= P1) {
        if (z <= 1) return (x & 1) ? Wd[3] : Wd[4];
        if ((x === P0 || x === P1) && y === CY1 + 5 && z <= 12) return Wd[2];
        if (z === 12 + Math.floor((CY1 + 1 - y) / 2) || z === 13 + Math.floor((CY1 + 1 - y) / 2)) return z % 2 ? PAL.dark(roof, 1) : roof;
        return null; }
      if (z === 0 && y > CY1 + 5 && y <= CY1 + 7 && x >= DOOR.x0 && x <= DOOR.x1) return St[3];
      const r = gable(x, y, z, { z0: ZW2 + 1, pitch: 0.75, x0: CX0 - 2, x1: CX1 + 2, y0: CY0 - 1, y1: CY1 + 1, fy0: CY0, fy1: CY1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[2] });
      if (r === 'fill') return logs(z);
      if (r) return r;
      return null;
    });
    // a small pale beach hut: one window, a blue door, a thatched roof. World footprint ~12×10.
    const HW = 26, HD = 22, HX0 = 4, HX1 = 21, HY0 = 3, HY1 = 16, HZW = 12, HDOOR = { x0: 10, x1: 15 };
    const thatch = (z) => (z % 2 ? Ac[0] : '#c9a85a');
    const hut = (lit) => B(HW, HD, HZW + 14, (x, y, z) => {
      const wfn = lit ? litWin : win;
      const inX = x >= HX0 && x <= HX1, inY = y >= HY0 && y <= HY1;
      if (z <= 1 && x >= HX0 - 1 && x <= HX1 + 1 && y >= HY0 - 1 && y <= HY1 + 1) return (x + y + z) % 3 ? St[3] : Wd[5];
      if (inX && inY && z >= 2 && z <= HZW) {
        const front = y >= HY1 - 1, back = y <= HY0 + 1, side = x <= HX0 + 1 || x >= HX1 - 1;
        if (!(front || back || side)) return Wd[5];
        if (front) {
          if (x >= HDOOR.x0 && x <= HDOOR.x1 && z <= 9) { if (x === HDOOR.x0 || x === HDOOR.x1 || z === 9) return Wd[2]; return Wt[4]; }
          const w = wfn(x, z, 5, 5, 5); if (w) return w; }
        if (side) { const w = wfn(y, z, 7, 5, 4); if (w) return w; }
        return (z % 3 === 2) ? Wd[4] : Wd[5]; }
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
    // seafood stall: an open south counter, a striped awning, a little chimney
    const stall = B(22, 16, 20, (x, y, z) => {
      if (z <= 1 && x >= 1 && x <= 20 && y >= 2 && y <= 14) return (x + y) % 2 ? Wd[3] : Wd[4];
      if ((x === 1 || x === 20) && y >= 2 && y <= 13 && z >= 2 && z <= 10) return Wd[2];
      if (y === 2 && x >= 1 && x <= 20 && z >= 2 && z <= 10) return (z === 10) ? Wd[1] : Wd[3];
      if (y >= 12 && y <= 14 && x >= 3 && x <= 18 && z === 5) return Wd[4];
      if (y >= 12 && y <= 13 && x >= 4 && x <= 17 && z === 6) return (x % 3 ? Wt[3] : Ac[1]); // fish on the counter
      if (z >= 11 && z <= 14 && x >= 0 && x <= 21 && y >= 2 && y <= 14) {
        const drop = Math.floor((y - 2) / 3);
        if (z === 14 - drop || z === 13 - drop) return (x % 2 ? Rf[2] : Ac[0]);
      }
      if (x >= 16 && x <= 18 && y >= 3 && y <= 5 && z >= 3 && z <= 18) return z >= 17 ? St[1] : (z % 3 === 0 ? St[1] : St[2]);
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
      dinerFrame, table, lamp, pot, board,
      hutDay: hut(false), hutNight: hut(true), hutFrame,
      parasolA: parasol(Rf[2], Ac[0]), parasolB: parasol(Wt[3], Ac[0]), parasolC: parasol(G[2], Ac[0]), parasolD: parasol('#3a5a8c', Ac[0]),
      stall, pierSeg, deck };
  }
  const CABIN_CY = 1; // model centre sits a little north of the door so the porch hangs south

  function layout() {
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
        add(m, L.diner.x, L.diner.y - 3, 0, { diner: 1 });
        const seats = IN.seatsOf(I), tables = Math.ceil(seats / 2);
        for (let i = 0; i < Math.min(tables, L.tables.length); i++) add(MD.table, L.tables[i].x, L.tables[i].y, 0, { table: i, big: 0 });
      } else if (job && job.id === 'diner') add(MD.dinerFrame, L.diner.x, L.diner.y, 0, { diner: 1, frame: 1 });
      if (job && job.id === 'kitchen' && lv > 0) add(MD.dinerFrame, L.diner.x + L.diner.hw + 4, L.diner.y, 0, { kitchen: 1, frame: 1 });
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
          hz(c.door.x, c.door.y - 2, 10, rooms.has(i) ? 22 : 14, rooms.has(i) ? 0.85 : 0.45);
          if (I.inn2) hz(c.door.x, c.door.y - 2, 16, rooms.has(i) ? 18 : 12, rooms.has(i) ? 0.7 : 0.4);
        }
      }
      if ((I.diner && I.diner.lv) > 0 && dusk) hz(L.diner.door.x, L.diner.door.y - 2, 12, 24, 0.7);
      for (const p of L.lamps) hz(p.x, p.y, 14, 16, 0.55);
    }
    const RL = rLayout(), r = I.resort;
    if (RL && r) {
      const hutsLit = occupiedHuts(T);
      for (let i = 0; i < (r.huts | 0); i++) {
        const c = RL.huts[i]; if (!c) continue;
        if (hutsLit.has(i) || dusk) hz(c.door.x, c.door.y - 2, 8, hutsLit.has(i) ? 18 : 12, hutsLit.has(i) ? 0.8 : 0.45);
      }
      if (r.stall && dusk) hz(RL.stall.door.x, RL.stall.door.y - 2, 10, 16, 0.6);
      if (r.deck) hz(RL.deck.x, RL.deck.y, 10, 14, dusk ? 0.7 : 0.35);
    }
  }
  function smoke() {
    const I = S && S.inn; if (!I) return [];
    const t = ((S.t % 1440) + 1440) % 1440;
    const out = [];
    const L = layout();
    if (L && (I.diner && I.diner.lv) > 0 && t >= 10 * 60 && t < 20 * 60) out.push({ x: L.diner.x + L.diner.hw - 3, y: L.diner.y - 2, z: 22 });
    const RL = rLayout();
    if (RL && I.resort && I.resort.stall && t >= 10 * 60 && t < 20 * 60) out.push({ x: RL.stall.x + 5, y: RL.stall.y - 3, z: 16 });
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
    if (L) {
      for (let i = 0; i < L.path.length - 1; i++) {
        const a = L.path[i], b = L.path[i + 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const t = ((x - a.x) * dx + (y - a.y) * dy) / (len * len);
        if (t < -0.02 || t > 1.02) continue;
        const px = a.x + t * dx, py = a.y + t * dy;
        if (Math.hypot(x - px, y - py) < 3.2) return [hash(x, y, 3) > 0.7 ? Wd[3] : Wd[4], 'dirt'];
      }
      if ((S.inn && S.inn.diner && S.inn.diner.lv) > 0) {
        for (const tb of L.tables) if (Math.hypot(x - tb.x, y - tb.y) < 5) return [St[3], 'dirt'];
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
