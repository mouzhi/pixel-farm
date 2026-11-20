// 像素农场 · v5.11.0 小镇放大：镇上房子的新模型（门和大人一样高，平房约 2.7 人高、二层约 3.7 人高）
// One template (walls, base course, bands between storeys, door, windows, a gable roof, a chimney) plus each building's own
// bits (awnings, signs, the loaf / saw / horseshoe / cross on the ridge, the balcony, the bell tower...). Same palette and the
// same 1-voxel detail lines as the old models (town-art.js v5.8–v5.10); only the proportions changed: 24 voxels a storey,
// doors 22 voxels (a grown-up is 24 px with the hat), footprints a size up. Voxel = 1 screen px, 2 voxels per world unit.
// town-art.js calls make(x) from makeModels() and uses these in place of the old town models.
'use strict';
(function (root) {
  function make(x) {
    const B = x.buildModel, gable = x.gableY, PAL = root.PF_PALETTE, R = PAL.ramps;
    const G = R.green, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink;
    const FH = 24, DOOR = 22;
    // a window: 1-voxel frame, a mullion, a pale glint in the top-left corner (fill: what stands behind the lower half)
    const glass = (u, v, u0, v0, w, h, frame, fill) => {
      const du = u - u0, dv = v - v0; if (du < 0 || du >= w || dv < 0 || dv >= h) return null;
      if (du === 0 || du === w - 1 || dv === 0 || dv === h - 1) return frame;
      if (w >= 7 && du === (w >> 1)) return frame;
      if (fill && dv <= (h >> 1) - 1) { const f = fill(u, v); if (f) return f; }
      return (du === 1 && dv >= h - 4) || (dv === h - 2 && du <= 2) ? Wt[4] : Wt[3];
    };
    // T: the template. W, D: model size; front: voxels in front of the wall for porches / awnings / steps; floors, fh;
    // pitch: roof rise per voxel; wall(x, y, z, c), band, beam, posts (x columns of timber on the long walls);
    // door { w, h, frame, leaf, knob, double, glass }; win { xs: [x0...], w, z0, h, frame, fill(x, z, f) }, side { ys, w };
    // roof { base, line, ridge, trim, fill(x, y, z, c) }; chim { x0, x1, y0, y1, top, body, cap }; extra(x, y, z, c) first.
    function T(o) {
      const W = o.W, D = o.D, front = o.front || 0, X0 = 2, X1 = W - 3, Y0 = 2, Y1 = D - 3 - front, fh = o.fh || FH, n = o.floors || 1, ZW = n * fh;
      const half = (X1 - X0 + 4) / 2, ridgeZ = ZW + 1 + Math.floor(half * o.pitch), H = Math.max(ridgeZ + 2, (o.chim && o.chim.top + 1) || 0, o.H || 0);
      const cx = (X0 + X1) / 2, c = { W, D, X0, X1, Y0, Y1, ZW, fh, n, cx, ridgeZ, H };
      const d = o.door || { w: 8 }, dw = d.w, dh = d.h || DOOR, dx0 = Math.round(cx - dw / 2 + 0.5), dx1 = dx0 + dw - 1;
      const wn = o.win || { xs: [], w: 7, z0: 8, h: 11 };
      const roof = o.roof;
      const m = B(W, D, H, (x, y, z) => {
        if (o.extra) { const e = o.extra(x, y, z, c); if (e !== undefined) return e; }
        if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
          const fr = y >= Y1 - 1, bk = y <= Y0 + 1, sd = x <= X0 + 1 || x >= X1 - 1;
          if (!(fr || bk || sd)) { // hollow inside (keeps the cell count down); 4 voxels of solid behind every face so the shading normals are unchanged
            if (z >= 4 && z <= ZW - 4 && x >= X0 + 5 && x <= X1 - 5 && y >= Y0 + 5 && y <= Y1 - 5) return null; return o.core || Wd[3]; }
          if (z <= 1) return o.base ? o.base(x, y, z) : (z === 0 ? St[1] : St[2]);
          if (fr && x >= dx0 && x <= dx1 && z <= dh) { // the door
            if (z === dh || x === dx0 || x === dx1) return d.frame || Wd[2];
            if (d.glass && z >= dh - 8 && z <= dh - 3 && x >= dx0 + 2 && x <= dx1 - 2 && !(d.double && (x === Math.floor(cx) || x === Math.ceil(cx)))) return Wt[3];
            if (d.double && (x === Math.floor(cx) || x === Math.ceil(cx))) return d.frame || Wd[2];
            if (d.knob !== false && z === (dh >> 1) && (x === dx1 - 2 || (d.double && x === dx0 + 2))) return Ac[1];
            return (d.leaf && d.leaf(x, z)) || Wd[1];
          }
          const f = Math.min(n - 1, Math.floor((z - 1) / fh)), zf = z - f * fh;
          if ((fr || bk) && wn.xs.length) for (const wx of (f === 0 && wn.ground ? wn.ground : wn.xs)) {
            if (fr && f === 0 && wx + wn.w - 1 >= dx0 - 1 && wx <= dx1 + 1) continue;
            const g = glass(x, zf, wx, wn.z0, wn.w, wn.h, wn.frame || Wd[2], wn.fill && (u => wn.fill(u, zf, f, fr)));
            if (g) return g; }
          if (sd && o.side) for (const sy of o.side.ys) { const g = glass(y, zf, sy, wn.z0, o.side.w || 5, wn.h, wn.frame || Wd[2], null); if (g) return g; }
          if (z % fh === 0) return o.band || Wd[2];
          if (o.beam && (x === X0 || x === X1 || ((fr || bk) && o.posts && o.posts.includes(x)))) return o.beam;
          return o.wall ? o.wall(x, y, z, c) : Ac[0];
        }
        if (roof) { const r = gable(x, y, z, { z0: ZW + 1, pitch: o.pitch, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: roof.base, line: roof.line || PAL.dark(roof.base, 1), ridge: roof.ridge || PAL.dark(roof.base, 1), trim: roof.trim || Wd[4] });
          if (r === 'fill') { const k = z - ZW - 1, ax = X0 - 2 + k / o.pitch, bx = X1 + 2 - k / o.pitch;
            if (z > ZW + 4 && y >= Y0 + 5 && y <= Y1 - 5 && x > ax + 7 && x < bx - 7) return null; // the attic is hollow too
            return roof.fill ? roof.fill(x, y, z, c) : (o.wall ? o.wall(x, y, z, c) : Ac[0]); } if (r) return r; }
        const h = o.chim; if (h && x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1 && z <= h.top) return z >= h.top - 1 ? (h.cap || St[1]) : (h.body ? h.body(z) : St[2]);
        if (o.after) { const e = o.after(x, y, z, c); if (e !== undefined) return e; }
        return null; });
      m.c = c; return m;
    }
    // little shared pieces (all in model voxels)
    const awning = (x, y, z, c, x0, x1, depth, top, a, b) => { if (y > c.Y1 && y <= c.Y1 + depth && x >= x0 && x <= x1 && z === top - (y - c.Y1 - 1)) return ((x >> 2) & 1) ? a : b; };
    const flowerBox = (x, y, z, c, xs, w, zz) => { if (y === c.Y1 + 1) for (const wx of xs) if (x >= wx && x < wx + w) { if (z === zz) return Wd[2]; if (z === zz + 1) return (x + wx) % 3 === 0 ? Ac[3] : (x % 3 === 1 ? Rf[3] : G[3]); } };
    const step = (x, y, z, c, x0, x1) => { if (y > c.Y1 && y <= c.Y1 + 2 && x >= x0 && x <= x1 && z <= 2 - (y - c.Y1 - 1)) return z === 2 - (y - c.Y1 - 1) ? St[3] : St[2]; };
    const board = (x, z, x0, x1, z0, z1, rim, body, ink) => { if (x < x0 || x > x1 || z < z0 || z > z1) return; if (x === x0 || x === x1 || z === z0 || z === z1) return rim; return ink && (x + z) % 3 === 0 ? ink : body; };

    // ---------- the old one-storey town houses (h1–h5 before they are rebuilt): 18 x 14 world units ----------
    const house = roofC => T({ W: 36, D: 32, front: 3, floors: 1, pitch: 0.9, beam: Wd[2], posts: [10, 25], wall: (x, y, z) => (z === 6 ? Wd[2] : Ac[0]),
      door: { w: 8, glass: 1 }, win: { xs: [4, 26], w: 6, z0: 8, h: 10 }, side: { ys: [10], w: 6 },
      roof: { base: roofC }, chim: { x0: 23, x1: 25, y0: 8, y1: 10, top: 44 },
      extra: (x, y, z, c) => flowerBox(x, y, z, c, [4, 26], 6, 6) || step(x, y, z, c, 13, 22) });

    // ---------- the two-storey family: 20 x 16 world units (+3 in front), 24 voxels a storey ----------
    // the lots are 20 x 16 world units (W 40, D 36 voxels); a rebuilt old house keeps its 18 x 14 plot (W 36, D 32)
    const twoStorey = (style, W, D) => { const brick = style === 1, shop = style === 2, roofC = brick ? St[1] : shop ? G[2] : Rf[2];
      const brickW = (x, y, z) => (((z >> 1) + (((x + y) >> 2) & 1)) % 3 === 0 ? Rf[1] : Rf[2]);
      const mid = Math.round(W / 2 - 3.5), wr = W - 12, cxv = (W - 1) / 2;
      return T({ W, D, front: 5, floors: 2, pitch: 0.75, beam: style === 0 ? Wd[2] : null, posts: [mid - 3, mid + 9],
        wall: brick ? brickW : shop ? ((x, y, z) => (z < FH ? Wd[4] : Ac[0])) : undefined,
        door: { w: 8, glass: 1 }, win: { xs: [5, mid, wr], ground: shop ? [] : [5, wr], w: 7, z0: 8, h: 11, frame: brick ? Ac[0] : Wd[2] }, side: { ys: [8, D - 18], w: 6 },
        roof: { base: roofC, fill: (x, y, z, c) => (brick && y >= c.Y1 - 1 && z >= c.ZW + 3 && z <= c.ZW + 10 && Math.abs(x - c.cx) <= 3) ? (z === c.ZW + 3 || z === c.ZW + 10 || Math.abs(x - c.cx) === 3 ? Ac[0] : Wt[3]) : (brick ? Rf[2] : Ac[0]) },
        chim: brick ? { x0: W - 12, x1: W - 9, y0: 8, y1: 11, top: 62 + (W >> 3), body: z => (z % 5 === 0 ? St[2] : Rf[1]) } : { x0: 8, x1: 10, y0: D - 18, y1: D - 16, top: 58 + (W >> 3) },
        extra: (x, y, z, c) => {
          if (shop && y >= c.Y1 - 1 && y <= c.Y1 && z >= 4 && z <= 19) for (const [a, b] of [[4, Math.floor(cxv) - 6], [Math.ceil(cxv) + 6, W - 5]]) if (x >= a && x <= b) { // the shop windows, flowers inside
            if (z === 4 || z === 19 || x === a || x === b || x === ((a + b) >> 1)) return Wd[1];
            return z <= 9 && (x * 3 + z) % 5 < 2 ? (x % 2 ? Ac[3] : Rf[3]) : (z >= 16 && x === a + 1 ? Wt[4] : Wt[3]); }
          if (style === 0 && y > c.Y1 && y <= c.Y1 + 4 && x >= 5 && x <= W - 6) { // the balcony on the first floor
            if (z === FH) return Wd[2]; if (z > FH && z <= FH + 6 && (y === c.Y1 + 4 || x === 5 || x === W - 6) && (z === FH + 6 || x % 3 === 0)) return Wd[1]; }
          if (style === 0 && x === c.X1 + 1 && (y === 6 || y === c.Y1 - 2) && z <= 20) return Wd[1];                               // the clothes-line posts
          if (style === 0 && x === c.X1 + 1 && y > 6 && y < c.Y1 - 2 && z === 18) return (y % 3 === 0) ? Ac[0] : (y % 3 === 1 ? Rf[3] : null);
          if (shop) { const a = awning(x, y, z, c, 3, W - 4, 5, FH - 1, G[3], Ac[0]); if (a) return a;
            if (y > c.Y1 + 1 && y <= c.Y1 + 4 && x >= W - 12 && x <= W - 5 && z <= 2) return z === 2 ? ((x + y) % 3 ? Ac[3] : Rf[3]) : Wd[2]; }
          if (!shop) { const s = step(x, y, z, c, Math.floor(cxv) - 5, Math.ceil(cxv) + 5); if (s) return s; }
          return undefined; } }); };
    const W2 = 40;

    // ---------- 小桃's bakery (style 3): warm plaster, crust roof, loaves in the windows, a deep awning, a loaf on the ridge ----------
    const crust = Rf[3] || Rf[2];
    const bakery = T({ W: 40, D: 40, front: 6, floors: 2, pitch: 0.75, beam: Wd[2], posts: [12, 27], band: Wd[4],
      wall: (x, y, z) => (z < FH ? Wd[4] : Ac[0]), door: { w: 8, glass: 1 },
      win: { xs: [4, 17, 29], ground: [4, 29], w: 7, z0: 6, h: 13, frame: Wd[1], fill: (u, v, f) => (f === 0 && (u + v) % 4 < 2 ? (u % 2 ? Wd[4] : crust) : null) }, side: { ys: [10, 22], w: 6 },
      roof: { base: crust }, chim: { x0: 28, x1: 32, y0: 8, y1: 12, top: 68, body: () => Rf[1] },
      extra: (x, y, z, c) => {
        const a = awning(x, y, z, c, 2, 37, 7, FH - 1, crust, Ac[0]); if (a) return a;
        if (y > c.Y1 + 1 && y <= c.Y1 + 5 && ((x >= 4 && x <= 11) || (x >= 28 && x <= 35)) && z <= 3) return z === 3 ? ((x + y) % 3 ? Wd[4] : crust) : Wd[2]; // bread baskets
        if (y <= 1 && x >= 13 && x <= 26 && z >= FH + 6 && z <= FH + 18) return board(x, z, 13, 26, FH + 6, FH + 18, Wd[1], Ac[0], crust); // the south sign
        if (z > c.ridgeZ - 3) { const e = ((x - c.cx) / 7) ** 2 + ((y - (c.Y0 + c.Y1) / 2) / 4.5) ** 2 + ((z - c.ridgeZ - 3) / 6) ** 2; if (e < 1) return e < 0.28 ? Wd[4] : (e < 0.85 ? Ac[0] : Wd[2]); }
        return undefined; } });

    // ---------- 阿松's woodshop (style 4): timber frame, a wide door, lumber in the windows, a log and a saw on the ridge ----------
    const woodshop = T({ W: 40, D: 40, front: 6, floors: 2, pitch: 0.75, beam: Wd[2], posts: [11, 28], band: Wd[2], wall: () => Wd[4],
      door: { w: 14, double: 1, frame: Wd[2], leaf: (x, z) => (z <= 2 ? St[2] : Wd[1]) },
      win: { xs: [4, 29], w: 7, z0: 7, h: 11, frame: Wd[2], fill: (u, v, f) => (f === 0 ? ((u + v) % 3 === 0 ? Wd[3] : Wd[5]) : null) }, side: { ys: [10, 22], w: 6 },
      roof: { base: Wd[1], ridge: Wd[3], fill: () => Wd[3] }, chim: { x0: 6, x1: 9, y0: 8, y1: 12, top: 64 },
      extra: (x, y, z, c) => {
        const a = awning(x, y, z, c, 3, 36, 6, FH, Wd[3], Wd[5]); if (a) return a;
        if (y > c.Y1 + 1 && y <= c.Y1 + 5 && ((x >= 3 && x <= 10) || (x >= 29 && x <= 36)) && z <= 3) return z === 3 ? Wd[4] : Wd[2]; // crates of offcuts
        if (y <= 1 && x >= 13 && x <= 26 && z >= FH + 6 && z <= FH + 18) return board(x, z, 13, 26, FH + 6, FH + 18, Wd[1], Wd[2], Wd[4]);
        if (z >= c.ridgeZ - 2 && z <= c.ridgeZ + 10) { const e = ((x - 15) / 9) ** 2 + ((y - 20) / 4) ** 2 + ((z - c.ridgeZ - 2) / 4.5) ** 2; if (e < 1) return e < 0.18 ? Wd[2] : (e < 0.7 ? Wd[5] : Wd[3]); }
        if (z >= c.ridgeZ - 2 && z <= c.ridgeZ + 18 && x >= 21 && x <= 34 && y >= 16 && y <= 24) { const rr = Math.hypot(x - 28, y - 20, (z - c.ridgeZ - 8) * 0.55);
          if (rr < 7 && rr > 4.6) return St[3]; if (rr <= 4.6 && Math.abs(z - c.ridgeZ - 8) < 1.2) return St[2]; }
        return undefined; } });

    // ---------- the smithy (style 5): sooty brick, slate roof, the forge mouth on the south wall, a horseshoe on the ridge ----------
    const ember = Ac[2], coal = Rf[1];
    const smithy = T({ W: 40, D: 40, front: 6, floors: 2, pitch: 0.75, core: St[1], band: St[2], base: (x, y, z) => (z === 0 ? St[0] : St[2]),
      wall: (x, y, z) => (((z >> 1) + (((x + y) >> 2) & 1)) % 3 === 0 ? Rf[1] : St[2]),
      door: { w: 9, frame: Wd[1], leaf: (x, z) => (z <= 2 ? St[2] : Wd[2]) },
      win: { xs: [4, 29], w: 7, z0: 7, h: 10, frame: St[2], fill: (u, v, f) => (f === 0 && (u + v) % 4 === 0 ? ember : null) }, side: { ys: [10, 22], w: 6 },
      roof: { base: St[1], ridge: St[0], trim: St[2], fill: () => St[1] }, chim: { x0: 28, x1: 33, y0: 8, y1: 13, top: 72, body: z => (z % 5 === 0 ? Rf[1] : St[2]) },
      extra: (x, y, z, c) => {
        if (y >= c.Y0 && y <= c.Y0 + 1 && x >= 12 && x <= 27 && z >= 2 && z <= 16) { // the forge mouth on the south wall
          const e = ((x - 19.5) / 7.2) ** 2 + ((z - 8) / 6.8) ** 2; if (e < 1) { if (e > 0.72) return St[0]; if (e < 0.22) return Ac[1]; return (x + z) % 2 ? ember : coal; } }
        const a = awning(x, y, z, c, 4, 35, 5, FH - 2, St[2], coal); if (a) return a;
        if (y <= 1 && x >= 13 && x <= 26 && z >= FH + 6 && z <= FH + 18) return board(x, z, 13, 26, FH + 6, FH + 18, St[1], St[2], ember);
        if (z >= c.ridgeZ - 2 && z <= c.ridgeZ + 16 && x >= 10 && x <= 30 && y >= c.Y0 + 6 && y <= c.Y1 - 6) { const rx = Math.abs(x - 20), rz = z - c.ridgeZ - 6, ry = Math.abs(y - (c.Y0 + c.Y1) / 2);
          const ring = Math.hypot(rx, rz); if (ry < 3.6 && ring > 4.6 && ring < 8 && rz > -4) return ring > 7 ? St[3] : St[1]; }
        return undefined; } });

    // ---------- the second classroom (style 6): a school wing, plaster, red roof, a row of windows ----------
    const classroom = T({ W: 48, D: 44 + 4, front: 4, floors: 1, fh: 28, pitch: 0.75, core: Ac[0],
      door: { w: 12, double: 1, h: 24, frame: Wd[2], leaf: (x, z) => (x % 2 ? Rf[1] : Wd[1]), glass: 1 },
      win: { xs: [4, 13, 30, 39], w: 6, z0: 9, h: 13, frame: Ac[0] }, side: { ys: [9, 18, 27], w: 6 },
      roof: { base: Rf[2], line: Rf[1], ridge: Rf[1] }, wall: (x, y, z) => (z <= 3 ? St[2] : Ac[0]),
      extra: (x, y, z, c) => step(x, y, z, c, 17, 30) });

    // ---------- 书屋 (style 7): plaster, ink-blue roof, books in the windows, a hanging 书 sign ----------
    const ink = '#2a4e88', inkL = '#1a2e58';
    const library = T({ W: 40, D: 40, front: 4, floors: 2, pitch: 0.8, beam: Wd[2], posts: [12, 27],
      door: { w: 8, glass: 1 }, win: { xs: [3, 16, 28], ground: [3, 28], w: 9, z0: 7, h: 12, frame: Wd[1], fill: (u, v, f) => (f === 0 ? ((u + v) % 3 === 0 ? Rf[2] : (u % 2 ? G[2] : '#d4a04a')) : null) },
      side: { ys: [10, 22], w: 6 }, roof: { base: ink, line: inkL, ridge: inkL },
      extra: (x, y, z, c) => {
        if (y === c.Y1 + 1 && x >= 13 && x <= 26 && z >= FH + 2 && z <= FH + 10) return (z === FH + 2 || z === FH + 10 || x === 13 || x === 26) ? Wd[1] : (z === FH + 6 ? Ac[0] : ink); // 书 sign
        return step(x, y, z, c, 15, 24); } });

    // ---------- 诊所 (style 8): warm plaster, timber, a stone plinth, green roof, green crosses the usual camera can read ----------
    const cross = G[1];
    const plaster = (x, y, z) => ((x * 3 + z * 5 + y) % 9 === 0 ? Wd[5] : ((x + z) % 11 === 0 ? Wd[4] : Ac[0]));
    const plus = (x, z, cx, cz, r) => (Math.abs(x - cx) <= 1 && Math.abs(z - cz) <= r) || (Math.abs(z - cz) <= 1 && Math.abs(x - cx) <= r);
    const clinic = T({ W: 44, D: 40, front: 6, floors: 2, pitch: 0.75, beam: Wd[2], posts: [13, 30], wall: plaster,
      base: (x, y, z) => ((x + y + z) % 3 === 0 ? St[1] : St[2]),
      door: { w: 10, double: 1, glass: 1 }, win: { xs: [4, 18, 33], ground: [4, 33], w: 8, z0: 7, h: 12, frame: Wd[2] }, side: { ys: [10, 22], w: 6 },
      roof: { base: G[2], fill: plaster }, chim: { x0: 33, x1: 35, y0: 9, y1: 11, top: 64 },
      extra: (x, y, z, c) => {
        const s = step(x, y, z, c, 15, 28); if (s) return s;
        if (y === c.Y1 + 1 && x >= 15 && x <= 28 && z >= FH + 3 && z <= FH + 14) { if (x === 15 || x === 28 || z === FH + 3 || z === FH + 14) return Wd[1]; return plus(x, z, 21.5, FH + 8.5, 4) ? cross : Ac[0]; }
        if (y <= 1 && x >= 14 && x <= 29 && z >= FH + 4 && z <= FH + 18) { if (x === 14 || x === 29 || z === FH + 4 || z === FH + 18) return Wd[1]; return plus(x, z, 21.5, FH + 11, 5) ? cross : Ac[0]; }
        if (z >= c.ridgeZ - 3 && z <= c.ridgeZ + 15 && x >= 14 && x <= 29 && y >= 17 && y <= 19) { const zz = c.ridgeZ + 6; if (x === 14 || x === 29 || z === c.ridgeZ - 3 || z === c.ridgeZ + 15) return Wd[1]; return plus(x, z, 21.5, zz, 6) ? cross : Ac[0]; }
        return undefined; } });

    // ---------- a child's own shop (flower / sweet / tackle): one tall storey, goods in the windows, an awning ----------
    const kidShop = kind => { const wall = kind === 'flower' ? Ac[0] : kind === 'sweet' ? Wd[4] : Wd[2], trim = kind === 'flower' ? G[2] : kind === 'sweet' ? (Rf[3] || Rf[2]) : St[1];
      const roofC = kind === 'flower' ? G[3] : kind === 'sweet' ? (Rf[3] || Rf[2]) : St[2];
      const goods = kind === 'flower' ? [G[3], Ac[3], Rf[3], G[2]] : kind === 'sweet' ? [Wd[4], Rf[3], Ac[0], G[3]] : [St[2], Wd[1], Wt[3], Ink[0]];
      return T({ W: 36, D: 32 + 4, front: 4, floors: 1, fh: 26, pitch: 0.9, band: trim, wall: () => wall,
        door: { w: 8, glass: 1 }, win: { xs: [4, 24], w: 8, z0: 6, h: 13, frame: Wd[1], fill: (u, v) => goods[(u + v) % goods.length] }, side: { ys: [9, 19], w: 6 },
        roof: { base: roofC, fill: () => wall },
        extra: (x, y, z, c) => { const a = awning(x, y, z, c, 2, 33, 4, 23, trim, roofC); if (a) return a;
          if (y > c.Y1 && y <= c.Y1 + 3 && x >= 24 && x <= 31 && z <= 2) return z === 2 ? goods[(x + y) % goods.length] : Wd[2]; return undefined; } }); };

    // ---------- 镇上小店: a long shop, a striped awning, display windows, a sign, crates of goods ----------
    const shop = T({ W: 72, D: 48, front: 8, floors: 1, fh: 28, pitch: 0.55, wall: () => Wd[4], band: Wd[2], beam: Wd[2], posts: [24, 47],
      door: { w: 12, double: 1, glass: 1 }, win: { xs: [], w: 7, z0: 8, h: 12 }, side: { ys: [12, 26], w: 7 },
      roof: { base: G[2], line: G[1], ridge: G[1], fill: () => Wd[4] },
      extra: (x, y, z, c) => {
        if (y >= c.Y1 - 1 && y <= c.Y1 && z >= 6 && z <= 21) for (const [a, b] of [[6, 21], [50, 65]]) if (x >= a && x <= b) {
          if (z === 6 || z === 21 || x === a || x === b || (x - a) % 5 === 0) return Wd[2]; return z <= 10 ? ((x + z) % 3 === 0 ? Ac[2] : (x % 2 ? G[3] : Ac[1])) : (z >= 18 && (x - a) % 5 === 1 ? Wt[4] : Wt[3]); }
        const a = awning(x, y, z, c, 3, 68, 8, 26, Rf[2], Ac[0]); if (a) return a;
        if (y > c.Y1 && y <= c.Y1 + 7 && (x === 4 || x === 67) && z < 26 - (y - c.Y1 - 1)) return Wd[2]; // awning posts
        if (y > c.Y1 + 1 && y <= c.Y1 + 6 && ((x >= 7 && x <= 14) || (x >= 57 && x <= 64)) && z <= 4) return z === 4 ? ((x + y) % 2 ? Ac[2] : G[4]) : Wd[2]; // crates of produce
        if (y >= c.Y1 - 1 && y <= c.Y1 && x >= 24 && x <= 47 && z >= c.ZW + 1 && z <= c.ZW + 10) return board(x, z, 24, 47, c.ZW + 1, c.ZW + 10, Wd[1], Wd[5], Ac[1]);
        return undefined; } });

    // ---------- 学校: a long schoolhouse, a row of windows, double doors, a red roof with a bell tower, a flag pole ----------
    const school = T({ W: 92, D: 56, front: 6, floors: 1, fh: 30, pitch: 0.5, core: Ac[0], wall: (x, y, z) => (z <= 3 ? St[2] : Ac[0]), band: Wd[2],
      door: { w: 14, double: 1, h: 24, frame: Wd[2], leaf: (x, z) => (x % 2 ? Rf[1] : Wd[1]), glass: 1 },
      win: { xs: [5, 15, 25, 35, 51, 61, 71, 80], w: 7, z0: 9, h: 14, frame: Ac[0] }, side: { ys: [10, 20, 30, 40], w: 6 },
      roof: { base: Rf[2], line: Rf[1], ridge: Rf[1] },
      extra: (x, y, z, c) => {
        const s = step(x, y, z, c, 37, 54); if (s) return s;
        const ty0 = 22, ty1 = 31, tx0 = 41, tx1 = 50, z0 = c.ridgeZ - 4; // the bell tower on the ridge
        if (x >= tx0 && x <= tx1 && y >= ty0 && y <= ty1 && z >= z0 && z <= z0 + 22) { const e = x === tx0 || x === tx1 || y === ty0 || y === ty1;
          if (z >= z0 + 16) return z - z0 - 16 < 6 - Math.max(Math.abs(x - 45.5), Math.abs(y - 26.5)) + 1 ? Rf[1] : null;
          if (z >= z0 + 7 && z <= z0 + 13 && !e) return (z === z0 + 9 && x >= 44 && x <= 47 && y >= 25 && y <= 28) ? Ac[1] : null; // the bell
          if (z === z0 + 6 || z === z0 + 14) return Wd[4]; return e ? Wd[4] : (z < z0 + 7 ? Ac[0] : null); }
        if (x === 89 && y === c.D - 2 && z <= 56) return St[3];                                           // the flag pole
        if (z >= 48 && z <= 54 && y === c.D - 2 && x >= 78 && x < 89) return z === 51 ? Ac[0] : Rf[2];   // the flag
        return undefined; } });

    // ---------- 镇公所: stone base, pillars by the double door, a clock in the front gable, a flag on the ridge ----------
    const hall = T({ W: 60, D: 52, front: 6, floors: 2, pitch: 0.6, core: Ac[0], band: St[3], base: (x, y, z) => (z === 0 ? St[2] : St[3]),
      wall: (x, y, z) => (z <= 4 ? St[2] : Ac[0]), door: { w: 14, double: 1, frame: St[3], leaf: (x, z) => (x % 3 ? Wd[2] : Wd[1]), glass: 1 },
      win: { xs: [5, 14, 39, 48], w: 7, z0: 8, h: 12, frame: Ac[0] }, side: { ys: [10, 22, 34], w: 6 },
      roof: { base: St[1], line: Ink[0], ridge: Ink[0], trim: St[3], fill: (x, y, z, c) => { const cz = c.ZW + 9, r = Math.hypot(x - c.cx, z - cz);
        if (y >= c.Y1 - 1 && r < 5.6) return r < 4.2 ? ((Math.abs(x - c.cx) < 0.6 && z >= cz && z <= cz + 3) || (Math.abs(z - cz) < 0.6 && x >= c.cx && x <= c.cx + 3) ? Ink[0] : Ac[0]) : Wd[1]; return Ac[0]; } },
      extra: (x, y, z, c) => {
        if (y >= c.Y1 - 1 && y <= c.Y1 + 2 && (x === 20 || x === 21 || x === 38 || x === 39) && z <= FH + 4) return z >= FH + 2 ? St[3] : St[2]; // pillars
        if (y > c.Y1 && y <= c.Y1 + 3 && x >= 18 && x <= 41 && z <= 3 - (y - c.Y1 - 1)) return St[2];                                      // steps
        if (x === 29 && y === (c.Y0 + c.Y1) >> 1 && z >= c.ridgeZ - 2 && z <= c.ridgeZ + 14) return St[3];                                 // the flag pole
        if (y === (c.Y0 + c.Y1) >> 1 && z >= c.ridgeZ + 9 && z <= c.ridgeZ + 13 && x >= 30 && x <= 38) return z === c.ridgeZ + 11 ? Ac[0] : Rf[2];
        return undefined; } });

    // ---------- scaffolding while a house goes up: poles, planks, the ground floor half built ----------
    const scaffoldOf = (W, D) => B(W, D, 52, (x, y, z) => {
      const pole = (x === 0 || x === W - 1 || x === (W >> 1)) && (y === 0 || y === D - 1);
      if (pole && z <= 50) return Wd[1];
      if ((z === 16 || z === 32 || z === 48) && (y === 0 || y === D - 1 || x === 0 || x === W - 1)) return Wd[3];
      if (z <= 12 && x >= 2 && x <= W - 3 && y >= 2 && y <= D - 3 && (x <= 3 || x >= W - 4 || y <= 3 || y >= D - 4)) return z === 0 ? St[1] : ((x + z) % 4 ? Wd[3] : Wd[2]);
      if (y === D - 1 && x >= 3 && x <= W - 4 && (x - z) % 16 === 3 && z <= 48) return Wd[2];
      return null; });
    // ---------- one section of the harvest feast's long table (26 world units; three of them make the 78-unit table) ----------
    const feast = B(52, 26, 12, (x, y, z) => {
      const tx = x >= 1 && x <= 50, ty = y >= 8 && y <= 17;
      if (tx && ty) {
        if (z <= 5) return ((x === 3 || x === 48 || x === 25) && (y === 9 || y === 16)) ? Wd[1] : null;
        if (z === 6) return (y === 8 || y === 17) ? Wd[2] : Wd[3];
        if (z === 7) return (y === 8 || y === 17) ? Rf[2] : Ac[0];
        if (z === 8) { const k = (x * 5 + y * 3) % 10; return k === 0 ? Ac[2] : k === 3 ? Rf[3] : k === 6 ? G[3] : k === 8 ? Ac[1] : null; }
        if (z === 9 && (x * 5 + y * 3) % 10 === 0) return Ac[1];
        return null; }
      if (x >= 2 && x <= 49 && (y === 3 || y === 4 || y === 21 || y === 22)) { if (z === 4) return (x & 1) ? Wd[3] : Wd[4]; if (z <= 3) return (x === 4 || x === 47 || x === 25) ? Wd[1] : null; }
      return null; });
    // a signpost for a reserved lot: 「待开发」 (two posts, a board, no words: the HUD names it)
    const lotSign = B(16, 4, 26, (x, y, z) => {
      if ((x === 2 || x === 13) && y >= 1 && y <= 2 && z <= 20) return Wd[1];
      if (y === 2 && x >= 1 && x <= 14 && z >= 12 && z <= 22) { if (x === 1 || x === 14 || z === 12 || z === 22) return Wd[1]; return z === 17 && x >= 3 && x <= 12 ? Ink[0] : (z === 19 && x >= 4 && x <= 9 ? Ink[0] : Wd[4]); }
      return null; });
    const stake = B(2, 2, 8, (x, y, z) => (z === 7 ? Rf[2] : Wd[2]));
    return { houses: [house(Rf[2]), house(Rf[3]), house(St[1])], twoHouse: [0, 1, 2].map(i => twoStorey(i, 36, 32)), scaffoldHouse: scaffoldOf(36, 30), two: [twoStorey(0, 40, 36), twoStorey(1, 40, 36), twoStorey(2, 40, 36), bakery, woodshop, smithy, classroom, library, clinic],
      kidShops: { flower: kidShop('flower'), sweet: kidShop('sweet'), tackle: kidShop('tackle') }, shop, school, hall, scaffold: scaffoldOf(40, 34), feast, lotSign, stake };
  }
  root.PFTownBldg = { make };
})(typeof window !== 'undefined' ? window : globalThis);
