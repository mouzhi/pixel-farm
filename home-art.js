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

  // ---------- models (voxel = 1 screen px; 2 voxels per world unit) ----------
  function makeModels(x) {
    const B = x.buildModel, gable = x.gableY, W2 = HM.HOUSE.hw * 2, D2 = HM.HOUSE.hd * 2;
    // the new house: log walls on a stone footing, a green door under a little porch roof, flower boxes, a stone chimney
    const cottage = roof => B(W2 + 4, D2 + 8, 28, (x, y, z) => { const X0 = 2, X1 = W2 + 1, Y0 = 2, Y1 = D2 + 1, ZW = 11;
      if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) { const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
        if (!(front || side || back)) return Wd[3];
        if (z <= 1) return z ? St[2] : St[1];
        if (front && x >= 13 && x <= 16 && z <= 8) return z === 8 ? Wd[1] : (x === 15 && z === 4 ? Ac[1] : G[1]);   // the door
        if ((front || back) && (x === 6 || x === 7 || x === 22 || x === 23) && z >= 5 && z <= 8) return z === 8 ? Wd[1] : Wt[3];
        if (side && y >= 9 && y <= 11 && z >= 5 && z <= 8) return Wt[3];
        if ((side && (y === Y0 || y === Y1)) || (front && (x === X0 || x === X1))) return Wd[1];                  // corner posts
        return z % 3 === 0 ? Wd[2] : Wd[3]; }                                                                     // log courses
      if (y === Y1 + 1 && z === 4 && ((x >= 4 && x <= 9) || (x >= 20 && x <= 25))) return Wd[1];                 // flower boxes
      if (y === Y1 + 1 && z === 5 && ((x >= 4 && x <= 9) || (x >= 20 && x <= 25))) return (x % 2) ? Ac[3] : Rf[3];
      if (y >= Y1 + 1 && y <= Y1 + 4 && x >= 11 && x <= 18 && z === 10 - (y - Y1 - 1)) return roof;              // porch roof
      if (y === Y1 + 4 && (x === 11 || x === 18) && z < 7) return Wd[1];                                         // porch posts
      const r = gable(x, y, z, { z0: ZW + 1, pitch: 1, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 1, y1: Y1 + 1, fy0: Y0, fy1: Y1, base: roof, line: PAL.dark(roof, 1), ridge: PAL.dark(roof, 1), trim: Wd[4] });
      if (r === 'fill') return Wd[4]; if (r) return r;
      if (x >= 4 && x <= 6 && y >= 6 && y <= 8 && z <= 25) return z >= 23 ? St[1] : St[2];                       // chimney
      return null; });
    // being built: the footing, four corner posts, a top beam and a stack of planks
    const frame = B(W2 + 4, D2 + 8, 16, (x, y, z) => { const X0 = 2, X1 = W2 + 1, Y0 = 2, Y1 = D2 + 1;
      if (z === 0 && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) return (x === X0 || x === X1 || y === Y0 || y === Y1) ? St[1] : St[2];
      const post = (x === X0 || x === X1) && (y === Y0 || y === Y1);
      if (post && z <= 11) return Wd[1];
      if (z === 11 && (x === X0 || x === X1) && y >= Y0 && y <= Y1) return Wd[2];
      if (z === 11 && (y === Y0 || y === Y1) && x >= X0 && x <= X1) return Wd[2];
      if ((x === X0 || x === X1) && y === Y0 + 4 && z <= 11 && z >= 1 && z % 2) return Wd[2];
      if (y >= Y1 + 3 && y <= Y1 + 5 && x >= 18 && x <= 26 && z <= 3) return z === 3 ? Wd[4] : Wd[3];             // planks
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
      if (!h.built) { own.push(X.addProp(MD.frame, h.x, h.y + 1, 0, { xp: 1, big: 1, home: i })); return; }
      own.push(X.addProp(MD.cottages[i % MD.cottages.length], h.x, h.y + 1.5, 0, { xp: 1, big: 1, home: i }));
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
    for (const h of (S && S.home ? S.home.houses : [])) if (h.built && h.kid) { hz(h.x - 4.5, h.y + HM.HOUSE.hd + 2, 12, 34, 0.9); hz(h.x + 4.5, h.y + HM.HOUSE.hd + 2, 12, 34, 0.9); }
  }
  const inYard = (x, y) => feet().some(({ L }) => x > L.foot[0] - 3 && x < L.foot[2] + 3 && y > L.foot[1] - 3 && y < L.foot[3] + 3);
  const api = { mount, sync, inYard, ground, blocks, lights, models: () => MD, state: () => ({ props: own.length, key: lastKey }) };
  root.PFHomeArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
