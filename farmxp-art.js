// 像素农场 · v5.12.4：农场体验的体素（规则在 farmxp.js）。
// game.js 在模型就绪后调用 mount(X)；买下时 sync()；游览车每次挪动时 syncTruck()（只有一辆，按 key 决定要不要重放）。
'use strict';
(function (root) {
  const FX = root.PFFarmXp || (typeof require === 'function' ? require('./farmxp.js') : null);
  const PAL = root.PF_PALETTE, R = PAL ? PAL.ramps : null;
  const Wd = R && R.wood, St = R && R.stone, Wt = R && R.water, Rf = R && R.roof, Ac = R && R.accent, G = R && R.green, ink = R && R.ink && R.ink[0];
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = [], TRUCK = [];
  const RED = Rf && Rf[2], APPLE = Rf && Rf[3], ORANGE = Ac && Ac[2], JAM = Rf && Rf[1], STRAW = Wd && Wd[5], SHIRT = Wt && Wt[2], CREAM = Ac && Ac[0], SKIN = R && R.skin[1], HAIR = Wd && Wd[0], TYRE = R && R.ink[1], YEL = Ac && Ac[1];

  // voxel = 1 screen px = half a world unit (RS 2): a grown-up is about 22 voxels tall
  function makeModels(x) {
    const B = x.buildModel;
    // 采摘篮: a trestle table (10 x 5 world) with three baskets of fruit and a little price board
    const pickStand = B(20, 10, 14, (px, py, z) => {
      if (z <= 6 && (px === 1 || px === 18) && (py === 1 || py === 8)) return Wd[1];
      if (z === 7 && px >= 0 && px <= 19 && py >= 0 && py <= 9) return Wd[3];
      for (let b = 0; b < 3; b++) { const cx = 3.5 + b * 6.5;
        if (z >= 8 && z <= 10 && Math.abs(px - cx) <= 2.6 && py >= 2 && py <= 7) { if (z === 10 && Math.abs(px - cx) <= 1.6 && py >= 3 && py <= 6) return b === 1 ? ORANGE : APPLE; return (px + z) % 2 ? Wd[2] : Wd[3]; } }
      if (px >= 17 && px <= 19 && py === 9 && z >= 8 && z <= 13) return z >= 11 ? CREAM : Wd[1];
      return null;
    });
    const sign = B(14, 4, 26, (px, py, z) => {
      if (px >= 6 && px <= 7 && py >= 1 && py <= 2 && z <= 16) return Wd[2];
      if (z >= 15 && z <= 25 && px >= 0 && px <= 13 && py >= 0 && py <= 3) { if (z === 15 || z === 25 || px === 0 || px === 13) return Wd[1];
        if (z >= 18 && z <= 22 && px >= 4 && px <= 9 && py === 0) return (z >= 21 && px >= 6 && px <= 7) ? G[2] : APPLE; return Wd[4]; }
      return null;
    });
    // 摸动物圈: a low picket square (24 x 34 world) with a gap on the west, a water trough and a hay box in the corners
    const [x0, y0, x1, y1] = FX.PEN.rect, w = (x1 - x0) * 2, d = (y1 - y0) * 2, gy = (FX.PEN.gate.y - y0) * 2;
    const rail = (along, z) => (along % 8 <= 1 && z <= 9) ? Wd[1] : (z === 3 || z === 4 || z === 7 || z === 8) ? Wd[3] : null;
    const penH = B(w + 1, 2, 10, (px, py, z) => rail(px, z)); // north and south sides (each its own prop, so depth sorting works)
    const penW = B(2, d + 1, 10, (px, py, z) => (Math.abs(py - gy) <= 5 && py % 8 > 1) ? null : rail(py, z)); // west side, the gate gap
    const penE = B(2, d + 1, 10, (px, py, z) => rail(py, z));
    const trough = B(12, 6, 5, (px, py, z) => (z === 4 && px > 0 && px < 11 && py > 0 && py < 5) ? Wt[3] : z <= 4 ? Wd[2] : null);
    const hay = B(9, 9, 7, (px, py, z) => z >= 5 ? STRAW : (px === 0 || px === 8 || py === 0 || py === 8) ? Wd[2] : z === 4 ? STRAW : null);
    // 售票小棚: a small booth (8 x 7 world) with a striped roof and a counter window facing south
    const booth = B(18, 16, 32, (px, py, z) => {
      if (z >= 24 && z <= 29) { const s = z - 24; if (py >= s - 1 && py <= 15 - s + 1 && px >= 0 && px <= 17) return ((px >> 1) % 2) ? RED : CREAM; }
      if (z >= 30 && py >= 6 && py <= 9) return Wd[1];
      const wall = px <= 1 || px >= 16 || py <= 1 || py >= 14;
      if (z < 24 && wall) { if (py >= 14 && z >= 9 && z <= 17 && px >= 4 && px <= 13) return z === 9 ? Wd[4] : null; return z % 4 === 0 ? Wd[2] : Wd[3]; }
      if (z === 0) return Wd[2];
      return null;
    });
    // v5.12.10 the tour tractor (18 x 9 world, same footprint as before): a green tractor at the front (+x) with a driver in a straw hat, a
    // wooden trailer behind it with a bench down each side (0–4 riders sitting facing the aisle), four posts and a red-and-yellow striped
    // canopy with a scalloped fringe and a little pennant. The canopy is high (z 28+) so the riders' heads stay in view from the default camera.
    const truck = n => B(36, 18, 40, (px, py, z) => {
      const ring = (cx, cz, r, py0, py1, hub) => py >= py0 && py <= py1 && Math.hypot(px - cx, z - cz) <= r ? (Math.hypot(px - cx, z - cz) <= hub ? YEL : TYRE) : null;
      const wheel = ring(25, 4.6, 4.6, 0, 3, 1.8) || ring(25, 4.6, 4.6, 14, 17, 1.8) || ring(32, 3.2, 3.2, 1, 3, 1.1) || ring(32, 3.2, 3.2, 14, 16, 1.1)
        || ring(9, 3.6, 3.6, 0, 1, 1.2) || ring(9, 3.6, 3.6, 16, 17, 1.2);
      if (wheel) return wheel;
      // tractor: chassis, hood with grille, fenders, seat, exhaust
      if (px >= 21 && px <= 35 && py >= 5 && py <= 12 && z >= 3 && z <= 5) return St[0];
      if (px >= 28 && px <= 35 && py >= 5 && py <= 12 && z >= 6 && z <= 12) {
        if (px === 35) return z >= 7 && z <= 11 && py >= 6 && py <= 11 ? (py % 2 ? St[2] : TYRE) : G[1];
        return z === 12 ? G[3] : z >= 11 || py === 5 || py === 12 ? G[2] : G[1]; }
      if (px === 35 && z >= 9 && z <= 10 && (py === 5 || py === 12)) return YEL; // lamps
      if (px >= 21 && px <= 28 && py >= 4 && py <= 13 && z === 10 && (py <= 4 || py >= 13 || px <= 22)) return G[2];
      if (px >= 20 && px <= 29 && ((py >= 1 && py <= 4) || (py >= 13 && py <= 16)) && z >= 10 && z <= 11) return z === 11 ? G[3] : G[1]; // fenders
      if (px >= 21 && px <= 28 && py >= 5 && py <= 12 && z >= 6 && z <= 9) return G[1]; // rear body under the seat
      if (px === 30 && py >= 10 && py <= 11 && z >= 13 && z <= 19) return z === 19 ? St[2] : TYRE; // exhaust
      if (px >= 21 && px <= 22 && py >= 6 && py <= 11 && z >= 10 && z <= 13) return Wd[1]; // seat back
      if (px >= 23 && px <= 25 && py >= 6 && py <= 11 && z >= 8 && z <= 9) return Wd[2]; // seat
      if (px === 27 && py >= 8 && py <= 9 && z >= 10 && z <= 13) return TYRE; // steering column
      if (px >= 26 && px <= 28 && py >= 6 && py <= 11 && z === 14) return TYRE; // steering wheel
      // the driver: shirt, arms to the wheel, head with eyes, a straw hat
      if (px >= 22 && px <= 25 && py >= 7 && py <= 10 && z >= 10 && z <= 15) return SHIRT;
      if (px >= 26 && px <= 27 && (py === 6 || py === 11) && z >= 12 && z <= 13) return SHIRT;
      if (px >= 22 && px <= 25 && py >= 7 && py <= 10 && z >= 16 && z <= 19) return px === 25 && z === 18 && (py === 7 || py === 10) ? TYRE : SKIN;
      if (px >= 21 && px <= 26 && py >= 6 && py <= 11 && z === 20) return STRAW;
      if (px >= 22 && px <= 25 && py >= 7 && py <= 10 && z >= 21 && z <= 22) return z === 21 ? Wd[2] : STRAW;
      // drawbar, trailer floor with its rim, low rails, two benches
      if (px >= 18 && px <= 22 && py >= 8 && py <= 9 && z >= 4 && z <= 5) return TYRE;
      if (px >= 1 && px <= 18 && py >= 2 && py <= 15) {
        if (z >= 4 && z <= 5 && (px <= 1 || px >= 18 || py <= 2 || py >= 15)) return z === 5 ? Wd[4] : Wd[2];
        if (z === 5) return Wd[3];
        if (z === 4) return Wd[2];
        if (z === 6 && (py === 2 || py === 15)) return Wd[4];
        const bench = (py >= 4 && py <= 6) || (py >= 11 && py <= 13);
        if (bench && px >= 3 && px <= 16) { if (z === 7) return px % 4 === 0 ? Wd[2] : Wd[4]; if (z === 6 && (px <= 4 || px >= 15)) return Wd[1]; }
      }
      // the canopy: four posts, a striped roof (red / yellow, three voxels a stripe), a scalloped fringe on both long sides, a pennant
      if (z >= 6 && z <= 29 && (px === 1 || px === 18) && (py === 2 || py === 15)) return Wd[1];
      const st = (Math.floor(px / 3) % 2) ? YEL : RED;
      if (px >= 0 && px <= 20) {
        if (z === 30 && py >= 0 && py <= 17) return st;
        if (z === 31 && py >= 1 && py <= 16) return st;
        if (z === 32 && py >= 4 && py <= 13) return st;
        if (z === 33 && py >= 7 && py <= 10) return Wd[1];
        if ((py === 0 || py === 17) && (z === 29 || (z === 28 && px % 3 === 1))) return st;
        if (px === 0 && py >= 1 && py <= 16 && z === 29 && py % 3 !== 0) return st; // back fringe
      }
      if (px === 19 && py === 8 && z >= 34 && z <= 39) return Wd[2];
      if (py === 8 && z >= 37 && z <= 39 && px >= 13 && px <= 18 && px >= 18 - (z === 38 ? 5 : z === 39 ? 4 : 3)) return z === 38 ? RED : YEL; // pennant, flying back
      for (let q = 0; q < n; q++) { const hx = 5 + (q >> 1) * 9, hy = q & 1 ? 12 : 5, fy = q & 1 ? -1 : 1; // a rider on a bench, facing the aisle: shirt, face, hair
        const dx = Math.abs(px - hx), dy = Math.abs(py - hy);
        if (dx <= 2 && dy <= 1 && z >= 8 && z <= 14) return [SHIRT, RED, G[2], ORANGE][q];
        if (dx <= 1 && dy <= 1 && z >= 15 && z <= 18) return z === 18 ? HAIR : (z === 16 && dx === 1 && py === hy + fy) ? TYRE : SKIN; }
      return null;
    });
    // 手作坊: a striped awning on four posts over a long table (32 x 16 world); jam jars, pie tins and fruit on the table,
    // stools along its north side where the visitors sit facing south (the default camera)
    const cw = FX.CRAFT.hw * 4, cd = FX.CRAFT.hd * 4; // 32 x 16 world
    const craft = B(cw + 1, cd + 1, 34, (px, py, z) => {
      const ay1 = 18; // the awning covers the north half (the table); the visitors stand in front of it, in the open
      const post = (px <= 1 || px >= cw - 1) && (py <= 1 || (py >= ay1 - 1 && py <= ay1));
      if (post && z <= 28) return Wd[1];
      if (z >= 28 && z <= 31 && py <= ay1 + 1) { const s = (z - 28) * 2; if (py >= s && py <= ay1 + 1 - s) return ((px >> 2) % 2) ? CREAM : RED; }
      const ty0 = 6, ty1 = 15;
      if (z === 9 && px >= 4 && px <= cw - 4 && py >= ty0 && py <= ty1) return (px + py) % 7 ? Wd[4] : Wd[3];
      if (z <= 8 && (px === 6 || px === cw - 6) && (py === ty0 + 1 || py === ty1 - 1)) return Wd[2];
      if (z >= 10 && z <= 12 && py >= ty0 + 3 && py <= ty0 + 5) { const k = px % 12; if (k >= 2 && k <= 4) return z === 12 ? CREAM : JAM; if (k >= 7 && k <= 9 && z === 10) return St[3]; if (k === 8 && z === 11) return ORANGE; }
      if (z === 10 && py >= ty1 - 3 && py <= ty1 - 1 && px % 16 >= 5 && px % 16 <= 10 && px > 4 && px < cw - 4) return (px % 16 === 5 || px % 16 === 10) ? Wd[2] : ORANGE; // pie tins
      if (z <= 5 && py >= 24 && py <= 26 && (px % 16 >= 7 && px % 16 <= 9) && px > 4 && px < cw - 4) return z === 5 ? Wd[3] : (z % 2 ? Wd[2] : null); // stools
      return null;
    });
    // 留影角: a flower arch (16 world wide) with a little frame sign on top, and a scarecrow beside it
    const arch = B(32, 6, 44, (px, py, z) => {
      const cx = 15.5, r = Math.hypot(px - cx, (z - 26) * 1.0);
      const bloom = (px * 3 + z * 5) % 7 === 0 ? APPLE : (px * 5 + z * 3) % 11 === 0 ? YEL : (px + z) % 2 ? G[2] : G[3];
      if ((px <= 2 || px >= 29) && z <= 26 && py >= 1 && py <= 4) return bloom;
      if (z > 26 && r >= 12.5 && r <= 15.8 && py >= 1 && py <= 4) return bloom;
      if (z >= 38 && z <= 43 && px >= 9 && px <= 22 && py === 2) return (z === 38 || z === 43 || px === 9 || px === 22) ? Wd[1] : CREAM;
      return null;
    });
    const crow = B(22, 6, 40, (px, py, z) => {
      if (px >= 10 && px <= 11 && py >= 2 && py <= 3 && z <= 30) return Wd[2];
      if (z >= 22 && z <= 23 && px >= 0 && px <= 21 && py >= 2 && py <= 3) return Wd[2]; // arms
      if (z >= 18 && z <= 26 && px >= 6 && px <= 15 && py >= 1 && py <= 4) return (z === 18 || px === 6 || px === 15) ? Wd[2] : SHIRT; // shirt
      if (z >= 27 && z <= 32 && px >= 8 && px <= 13 && py >= 1 && py <= 4) return STRAW; // straw head
      if (z === 33 && px >= 4 && px <= 17 && py >= 0 && py <= 5) return Wd[3]; // hat brim
      if (z >= 34 && z <= 36 && px >= 8 && px <= 13 && py >= 1 && py <= 4) return Wd[3];
      return null;
    });
    return { pickStand, sign, penH, penW, penE, trough, hay, booth, truck: [0, 1, 2, 3, 4].map(truck), craft, arch, crow };
  }

  function flags() { const e = S && S.eff || {}; const o = {}; for (const id of FX.IDS) o[id] = !!e[id]; return o; }
  function clear(list) { if (X && X.props) for (const p of list) { const i = X.props.indexOf(p); if (i >= 0) X.props.splice(i, 1); } list.length = 0; }
  function add(model, x, y, rot, extra, into) { const p = X.addProp(model, x, y, rot || 0, extra || {}); (into || own).push(p); return p; }

  function placeStatic(o) {
    clear(own);
    if (o.xppick) { add(MD.pickStand, FX.PICK.stand.x, FX.PICK.stand.y, 0, { xp: 'pick', big: 0 }); add(MD.sign, FX.PICK.sign.x, FX.PICK.sign.y, 0, { xp: 'picksign', big: 0 }); }
    if (o.xppet) { const r = FX.PEN.rect, cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
      add(MD.penH, cx, r[1], 0, { xp: 'pen', big: 0 }); add(MD.penH, cx, r[3], 0, { xp: 'pen', big: 0 });
      add(MD.penW, r[0], cy, 0, { xp: 'pen', big: 0 }); add(MD.penE, r[2], cy, 0, { xp: 'pen', big: 0 });
      add(MD.trough, r[2] - 5, r[1] + 4, 0, { xp: 'pentrough', big: 0 }); add(MD.hay, r[0] + 5, r[3] - 5, 0, { xp: 'penhay', big: 0 }); }
    if (o.xptour) add(MD.booth, FX.TOUR.booth.x, FX.TOUR.booth.y, 0, { xp: 'booth', big: 1 });
    if (o.xpcraft) add(MD.craft, FX.CRAFT.x, FX.CRAFT.y, 0, { xp: 'craft', big: 1 });
    if (o.xpphoto) { add(MD.arch, FX.PHOTO.arch.x, FX.PHOTO.arch.y, 0, { xp: 'arch', big: 1 }); add(MD.crow, FX.PHOTO.crow.x, FX.PHOTO.crow.y, 0, { xp: 'crow', big: 1 }); }
  }
  // the truck: parked at the stand when not out; n riders on board while touring
  function syncTruck(t) {
    if (!mounted) return; clear(TRUCK);
    if (!(S && S.eff && S.eff.xptour) || !t) return;
    add(MD.truck[Math.max(0, Math.min(4, t.riders | 0))], t.x, t.y, t.rot || 0, { xp: 'truck', big: 1, moving: t.moving ? 1 : 0 }, TRUCK);
  }
  function sync(force) {
    if (!mounted || !FX) return; const o = flags(), k = FX.IDS.map(id => o[id] | 0).join('');
    if (force || k !== lastKey) { lastKey = k; placeStatic(o); }
  }
  function mount(x) { X = x; S = x.S; MD = makeModels(x); mounted = true; lastKey = ''; sync(true); return api; }
  const api = { mount, sync, syncTruck, models: () => MD, flags, own: () => own.slice(), truck: () => TRUCK.slice() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFarmXpArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
