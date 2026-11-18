// 像素农场 · 第 10 阶段（v5.8.0）的画面：镇子的地面、学校、小店、民居、广场喷泉、镇子篱笆和镇门（买下前关着，买下后打开），
// 东边新长出来的一条林子和崖壁。Rules live in town.js (pure, unit-tested). game.js calls ground() while painting the ground canvas,
// mount(X) once its models exist and sync() whenever the town is bought (idempotent: a key decides).
'use strict';
(function (root) {
  const TN = root.PFTown, PL = root.PFPlots;
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink, G = R.green;
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = { gate: [], always: [], cleared: [] };
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
    // posts a little taller than the shut gate's, a beam with a small hanging sign, and both door leaves swung back inside along the fence
    const gateOpen = B(18, 28, 32, (x, y, z) => { const post = x >= 1 && x <= 4;
      if (post && (y <= 3 || y >= 24) && z <= 28) return z >= 27 ? St[3] : ((z % 6) === 0 ? St[1] : St[2]);
      if (post && z >= 26 && z <= 28 && y > 3 && y < 24) return Wd[2];
      if (x >= 2 && x <= 3 && z >= 19 && z <= 24 && y >= 9 && y <= 18) return (z === 19 || z === 24 || y === 9 || y === 18) ? Wd[1] : (((y + z) % 3) ? Wd[4] : Ac[1]);
      if (x >= 2 && x <= 3 && z === 25 && (y === 10 || y === 17)) return Ink[0];
      if ((y === 4 || y === 23) && x >= 5 && x <= 16 && z >= 2 && z <= 16) return (z === 2 || z === 16 || x === 16) ? Wd[1] : ((x % 3) ? Wd[3] : Wd[2]);
      return null; });
    const flowers = B(10, 6, 5, (x, y, z) => { if (z <= 1) return (x === 0 || x === 9 || y === 0 || y === 5) ? Wd[2] : Wd[1];
      if (z <= 3 && x > 0 && x < 9 && y > 0 && y < 5) { const k = (x * 5 + y * 3) % 7; return z === 3 ? (k === 0 ? Ac[3] : k === 2 ? Ac[1] : k === 4 ? Rf[3] : null) : G[3]; } return null; });
    return { houses: [house(Rf[2]), house(Rf[3]), house(St[1])], shop, school, fountain, gateOpen, flowers };
  }

  // ---------- mount: the town is always there to look at; the gate and the walk-in depend on it being bought ----------
  function mount(x) {
    X = x; S = x.S; MD = makeModels(x); const add = x.addProp;
    // the far-off roofs and the old closed gate came from expansion.js; the closed gate is ours to swap from now on
    const xm = x.xpModels && x.xpModels(); own.closed = xm ? X.props.find(p => p.m === xm.townGate) || null : null;
    // keep trees out of the town (the old forest loop reached x 458)
    for (let i = X.props.length - 1; i >= 0; i--) { const p = X.props[i]; if (p.tree && TN.inTown(p.x, p.y, 6)) X.props.splice(i, 1); }
    for (const b of TN.BUILDINGS) { const m = b.kind === 'shop' ? MD.shop : b.kind === 'school' ? MD.school : MD.houses[b.roof || 0];
      own.always.push(add(m, b.x, b.y, b.rot || 0, { xp: 1, big: 1, town: b.id })); }
    own.always.push(add(MD.fountain, TN.PLAZA.x, TN.PLAZA.y, 0, { xp: 1, town: 'fountain' }));
    const bench = root.PFDecorArt && root.PFDecorArt.models && root.PFDecorArt.models() && root.PFDecorArt.models().bench;
    if (bench) for (const [bx, by, r] of [[TN.PLAZA.x - 10, TN.PLAZA.y + 14, 0], [TN.PLAZA.x + 14, TN.PLAZA.y - 10, Math.PI / 2], [604, 60, 0], [566, 60, 0]]) own.always.push(add(bench, bx, by, r, { xp: 1, town: 'bench' }));
    for (const b of TN.BUILDINGS) if (b.kind === 'house') { const fy = b.rot ? b.y - b.hd - 3 : b.y + b.hd + 3; own.always.push(add(MD.flowers, b.x - 9, fy, 0, { xp: 1, town: 'flowers' })); }
    if (x.lampModel) for (const [lx, ly] of [[470, 72], [516, 60], [560, 72], [612, 60], [530, 120]]) own.always.push(add(x.lampModel(), lx, ly, 0, { xp: 1, town: 'lamp' }));
    // the town's fence: all round, with the west gap at the gate
    const R0 = TN.RECT, fence = x.models.fence;
    for (let fx = R0[0]; fx < R0[2]; fx += 8) for (const fy of [R0[1], R0[3]]) own.always.push(add(fence, fx + 4, fy, 0, { xp: 1, town: 'fence' }));
    for (let fy = R0[1]; fy < R0[3]; fy += 8) for (const fx of [R0[0], R0[2]]) { if (fx === R0[0] && Math.abs(fy + 4 - TN.GATE.y) < 10) continue; own.always.push(add(fence, fx, fy + 4, Math.PI / 2, { xp: 1, town: 'fence' })); }
    // trees on the town's grass, kept off streets, buildings and the square
    { let s = 4242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (const [tx, ty] of [[458, 46], [458, 132], [472, 132], [506, 132], [548, 132], [588, 132], [622, 132], [624, 90], [622, 4], [562, 2], [516, 4], [478, 2], [604, 90], [504, 90], [548, 92]]) {
        const defs = rnd() < 0.5 ? x.treeDefs.oak : x.treeDefs.small; x.addTree(defs[Math.floor(rnd() * defs.length)], tx + (rnd() - 0.5) * 3, ty + (rnd() - 0.5) * 3); } }
    // the strip east of the old map edge: cliff slabs where the ridge runs on
    const xmod = xm && xm.ledges; if (xmod) for (let gx = 448; gx <= 640; gx += 8) { const ry = PL.ridgeY(gx); own.always.push(add(xmod[((gx / 8) | 0) % 3], gx, ry - 1.5, 0, { xp: 1 })); }
    mounted = true; sync(true); return api;
  }
  const removeFrom = (q) => { const i = X.props.indexOf(q); if (i >= 0) X.props.splice(i, 1); };
  function sync(force) {
    if (!mounted) return; const open = !!(S.eff && S.eff.town), road = !!(S.plots && S.plots.eroad && S.plots.eroad.mod === 'road'), k = open + ':' + road; if (!force && k === lastKey) return; lastKey = k;
    // once 东大道 is a road, the old forest steps aside from it so the walk to town reads as one road (put back if it is rezoned)
    if (road && !own.cleared.length) for (let i = X.props.length - 1; i >= 0; i--) { const p = X.props[i]; if (p.tree && !p.town && p.x > 354 && p.x < 452 && p.y > 54 && p.y < 94) own.cleared.push(X.props.splice(i, 1)[0]); }
    if (!road && own.cleared.length) { for (const q of own.cleared) X.props.push(q); own.cleared.length = 0; }
    for (const q of own.gate) removeFrom(q); own.gate.length = 0;
    if (own.closed) { removeFrom(own.closed); if (!open) X.props.push(own.closed); }
    if (open) own.gate.push(X.addProp(MD.gateOpen, TN.GATE.x, TN.GATE.y, 0, { xp: 1, town: 'gate' }));
    X.markNavDirty();
  }
  // a little sign over the shut gate while the town is locked (drawn by game.js with the plot locks)
  const api = { ground, mount, sync, models: () => MD, state: () => ({ closed: !!own.closed, gate: own.gate.length, cleared: own.cleared.length, inProps: own.closed ? X.props.includes(own.closed) : null, key: lastKey }) };
  root.PFTownArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
