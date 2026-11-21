// 像素农场 · 第 8 阶段（v5.6.0）的画面：浇水器、三座加工坊、蜂箱、路灯，水车转动，喷水、蜜蜂、成品小图标和灯的「接通 / 太远」标记。
// Rules live in works.js (pure, unit-tested). game.js calls mount(X) once its models exist, sync() whenever S.works or the
// plots change (idempotent: a key decides), frame() every frame (wheel frames), draw() with the order marks and lights() from lighting().
'use strict';
(function (root) {
  const PW = root.PFWorks, PL = root.PFPlots;
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink, G = R.green;
  let X = null, S = null, MD = null, ICON = null, lastKey = '', mounted = false;
  const own = { spr: [], works: [], hives: [], lamps: [], mach: [] }; // props this file put down (v5.11.0.27: machines)
  const removeFrom = (arr, o) => { const i = arr.indexOf(o); if (i >= 0) arr.splice(i, 1); };

  // ---------- models (voxel = 1 screen px; 2 voxels per world unit) ----------
  function makeModels(x) {
    const B = x.buildModel, gable = x.gableY;
    const sprinkler = B(8, 8, 10, (x, y, z) => {
      const c = Math.hypot(x - 3.5, y - 3.5);
      if (z <= 1) return c < 3.2 ? St[1] : null;                                     // a little stone pad
      if (z <= 7) return c < 1.2 ? (z % 3 === 0 ? St[3] : St[2]) : null;              // the pipe
      if (z === 8) return c < 2.6 ? St[3] : null;                                     // the head
      if (z === 9) return c < 1.3 ? Wt[4] : null;                                     // nozzle
      return null; });
    // 磨坊: a stone mill with a tall gable and a millstone leaning by the door
    const mill = (() => { const X0 = 2, X1 = 25, Y0 = 3, Y1 = 19, ZW = 23; // v5.11.0.9 (房子比例): walls 23 (were 15), a door a grown-up fits through
      const roof = { z0: ZW + 1, pitch: 0.7, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 2, y1: Y1 + 2, fy0: Y0, fy1: Y1, base: Wd[1], line: Wd[0] || Ink[1], ridge: Wd[0] || Ink[1], trim: Wd[3] };
      return B(28, 26, 42, (x, y, z) => {
        if (z <= 7 && Math.hypot(x - 22, z - 4) < 4.2 && y >= Y1 + 1 && y <= Y1 + 2) return Math.hypot(x - 22, z - 4) < 1 ? St[1] : St[3]; // millstone
        if (z <= 2 && y > Y1 && y <= Y1 + 4 && x >= 5 && x <= 9) return Wd[3];        // a sack
        if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
          const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
          if (!(front || side || back)) return St[1];
          if (front && x >= 11 && x <= 16 && z >= 1 && z <= 19) return z === 19 || x === 11 || x === 16 ? Wd[4] : (z === 10 ? Wd[3] : Wd[2]);   // the door
          if (front && ((x >= 4 && x <= 7) || (x >= 20 && x <= 23)) && z >= 11 && z <= 15) return (x === 4 || x === 7 || x === 20 || x === 23 || z === 11 || z === 15) ? Ac[0] : Ink[1];
          if (z === 0) return St[1];
          return ((front || back) ? (x + (z >> 2)) % 5 === 0 : (y + (z >> 2)) % 5 === 0) || z % 4 === 0 ? St[2] : St[3];
        }
        const r = gable(x, y, z, roof); return r === 'fill' ? St[2] : r; }, { big: 1 }); })();
    // 果酱铺: a plank cottage with a red-and-white awning and jars on the counter
    const jam = (() => { const X0 = 2, X1 = 23, Y0 = 3, Y1 = 16, ZW = 21; // v5.11.0.9: walls 21 (were 13)
      const roof = { z0: ZW + 1, pitch: 0.9, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 2, y1: Y1 + 2, fy0: Y0, fy1: Y1, base: Rf[3], line: Rf[2], ridge: Rf[2], trim: Wd[4] };
      return B(26, 24, 36, (x, y, z) => {
        if (y >= Y1 + 1 && y <= Y1 + 5 && x >= X0 + 1 && x <= X1 - 1 && z === ZW - 2 + ((Y1 + 5 - y) >> 1)) return ((x >> 1) & 1) ? Rf[3] : Ac[0]; // awning
        if ((x === X0 + 1 || x === X1 - 1) && y === Y1 + 5 && z < ZW - 2) return Wd[2];                     // awning posts
        if (y >= Y1 + 1 && y <= Y1 + 2 && x >= 4 && x <= 20 && z <= 8) { if (z === 8) return Wd[4]; return z < 8 && (x === 4 || x === 20) ? Wd[2] : (z === 7 ? null : Wd[3]); } // counter
        if (z === 9 && y === Y1 + 2 && x >= 6 && x <= 18 && x % 3 === 0) return [Rf[2], Ac[2], Ac[3], Rf[3], Ac[1]][(x / 3) % 5];   // jars
        if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
          const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
          if (!(front || side || back)) return Wd[2];
          if (front && x >= 8 && x <= 16 && z >= 8 && z <= 16) return (x === 8 || x === 16 || z === 8 || z === 16) ? Ac[0] : Ink[1];  // serving window
          if (z === ZW || z === 0) return Wd[4];
          return (front || back) ? (x % 4 === 0 ? Wd[2] : Wd[3]) : (y % 4 === 0 ? Wd[2] : Wd[3]);
        }
        const r = gable(x, y, z, roof); return r === 'fill' ? Wd[2] : r; }, { big: 1 }); })();
    // 奶酪坊: white plaster, a blue-grey roof and a round cheese sign on the gable
    const cheese = (() => { const X0 = 2, X1 = 25, Y0 = 3, Y1 = 18, ZW = 22; // v5.11.0.9: walls 22 (were 14)
      const roof = { z0: ZW + 1, pitch: 0.9, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 2, y1: Y1 + 2, fy0: Y0, fy1: Y1, base: St[2], line: St[1], ridge: St[1], trim: Wd[4] };
      return B(28, 24, 38, (x, y, z) => {
        if (y === Y1 + 2 && Math.hypot(x - 13.5, z - (ZW + 6)) < 3.2) return Math.hypot(x - 13.5, z - (ZW + 6)) < 2.2 ? Ac[1] : Ac[2];       // cheese sign
        if (z <= 3 && y > Y1 && y <= Y1 + 4 && Math.hypot(x - 21, y - (Y1 + 2)) < 2.4) return z === 3 ? Ac[1] : Ac[2];                            // a wheel by the door
        if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
          const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
          if (!(front || side || back)) return Ac[0];
          if (front && x >= 11 && x <= 16 && z >= 1 && z <= 19) return z === 19 || x === 11 || x === 16 ? Wd[4] : Wt[2];
          if (front && ((x >= 4 && x <= 7) || (x >= 20 && x <= 23)) && z >= 11 && z <= 15) return (x === 4 || x === 7 || x === 20 || x === 23 || z === 11 || z === 15) ? Wd[4] : Ink[1];
          if (z <= 1) return St[2];
          return (front || back) ? ((x + z) % 9 === 0 ? St[3] : Ac[0]) : ((y + z) % 9 === 0 ? St[3] : Ac[0]);
        }
        const r = gable(x, y, z, roof); return r === 'fill' ? Ac[0] : r; }, { big: 1 }); })();
    // 蜂箱: a white stacked box on a stand with a small roof
    const hive = B(10, 9, 14, (x, y, z) => {
      if (z <= 2) return (x === 1 || x === 8) && (y === 1 || y === 7) ? Wd[2] : null;   // legs
      if (z === 3) return x >= 0 && x <= 9 && y >= 0 && y <= 8 ? Wd[3] : null;
      if (z <= 10 && x >= 1 && x <= 8 && y >= 1 && y <= 7) { if (y === 7 && z === 4 && x >= 3 && x <= 6) return Ink[1]; return z === 7 ? Ac[1] : Ac[0]; }
      if (z === 11 && x >= 0 && x <= 9 && y >= 0 && y <= 8) return Rf[2];
      if (z === 12 && x >= 1 && x <= 8 && y >= 2 && y <= 6) return Rf[3];
      return null; });
    // 路灯: a dark post with a lantern
    const lamp = B(6, 6, 26, (x, y, z) => {
      if (z <= 1) return x >= 1 && x <= 4 && y >= 1 && y <= 4 ? St[1] : null;
      if (z <= 18) return (x === 2 || x === 3) && (y === 2 || y === 3) ? Ink[1] : null;
      if (z <= 22) { const edge = x === 1 || x === 4 || y === 1 || y === 4; if (x < 1 || x > 4 || y < 1 || y > 4) return null; return edge && (z === 19 || z === 22 || (x + y) % 3 === 0) ? Ink[1] : Ac[1]; }
      if (z === 23) return x >= 1 && x <= 4 && y >= 1 && y <= 4 ? Ink[1] : null;
      if (z === 24) return (x === 2 || x === 3) && (y === 2 || y === 3) ? Ink[1] : null;
      return null; });
    // ---------- v5.11.0.27 自动化机械 ----------
    // 自动饲喂槽 + 自来水槽: stands right behind a pen's trough (same width): a plank hopper with a tin funnel over the hay half,
    // a crank wheel on its side that turns while it feeds, and a blue pipe from the wheel's main with a tap over the water half.
    const spokes = (u, v, a, r0, r1, rim, spoke, hub) => { const r = Math.hypot(u, v); if (r > r1) return null; if (r > r1 - 1) return rim; if (r < r0) return hub;
      const k = (((Math.atan2(v, u) - a) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); return (k < 0.38 || k > Math.PI / 2 - 0.38) ? spoke : null; };
    const feederAt = a => B(18, 7, 16, (x, y, z) => {
      if (x >= 1 && x <= 9 && y >= 0 && y <= 3) {                                      // the hopper
        if (z <= 4) return (x === 1 || x === 9) && (y === 0 || y === 3) ? Wd[1] : null;   // legs
        if (z <= 12) { const edge = x === 1 || x === 9 || y === 0 || y === 3; if (!edge) return z === 12 ? Ac[1] : null; return z === 12 ? Wd[4] : (z === 5 || z === 9 ? Wd[2] : Wd[3]); }
        if (z === 13) return x >= 2 && x <= 8 && y >= 1 && y <= 2 ? Ac[1] : null;           // hay heaped on top
        return null; }
      if (z >= 5 && z <= 6 && x >= 2 && x <= 4 && y >= 4 && y <= 5) return z === 5 ? St[2] : St[3]; // the tin chute over the hay
      if (y === 4 && x >= 4 && x <= 10 && z >= 6 && z <= 12) return spokes(x - 7, z - 9, a, 0.9, 3.4, St[2], St[3], Ink[1]); // the crank wheel, turning
      if (x >= 13 && x <= 14 && y <= 1 && z <= 13) return z % 4 === 0 ? Wt[2] : Wt[3];    // the water pipe up from the ground
      if (z >= 12 && z <= 13 && x >= 13 && x <= 14 && y >= 2 && y <= 4) return Wt[3];      // over the trough
      if (z === 11 && x >= 13 && x <= 14 && y === 4) return St[3];                         // the tap
      if (z === 14 && x >= 12 && x <= 15 && y === 0) return Rf[3];                         // its red valve handle
      return null; });
    const feeder = [0, 1, 2, 3].map(i => feederAt(i * Math.PI / 8));
    // 集蛋滑道: a plank chute sloping down east from a hatch in the coop wall into a straw-lined crate (eggs roll down it: draw())
    const chute = B(16, 10, 14, (x, y, z) => {
      if (x >= 11 && x <= 15 && y >= 1 && y <= 8) {                                      // the crate
        const edge = x === 11 || x === 15 || y === 1 || y === 8; if (z === 0) return Wd[2];
        if (z <= 4) return edge ? (z === 4 ? Wd[4] : z === 2 ? Wd[2] : Wd[3]) : (z <= 2 ? Ac[1] : z === 3 && (x * 3 + y) % 4 === 0 ? Ac[0] : null);
        return null; }
      const top = 12 - Math.floor(x * 9 / 11);                                           // slope: 12 at the wall → 3 over the crate
      if (x <= 11 && y >= 3 && y <= 6) { if (z === top) return y === 3 || y === 6 ? Wd[2] : Wd[4]; if (z === top + 1 && (y === 3 || y === 6)) return Wd[3]; }
      if ((y === 3 || y === 6) && x === 5 && z < top) return Wd[1];                       // a prop under it
      if (x <= 1 && y >= 2 && y <= 7 && z >= 11 && z <= 14) return z === 14 ? Wd[4] : (y === 2 || y === 7 ? Wd[2] : Ink[1]); // the hatch in the wall
      return null; });
    // 挤奶机: a squat steel milk tank on legs with a pump, a gauge and a turning flywheel; a hose runs into the shed
    const milkerAt = a => B(18, 12, 18, (x, y, z) => {
      const c = Math.hypot(x - 6, y - 6);
      if (z <= 2) return c < 4.6 && c > 3.4 && (x + y) % 3 === 0 ? St[1] : null;                         // legs
      if (z >= 3 && z <= 14 && c < 5) { if (c > 4) { if (y >= 10 && x >= 4 && x <= 7 && z >= 9 && z <= 12) return (x === 4 || x === 7 || z === 9 || z === 12) ? Ink[1] : (x === 6 && z === 11 ? Rf[2] : Ac[0]); // gauge
        return z === 3 || z === 14 ? St[2] : (z === 8 ? St[1] : ((x + z) % 7 === 0 ? St[2] : St[3])); } return null; } // the tank
      if (z === 15 && c < 3) return c < 1.4 ? St[1] : St[2];                                              // its lid
      if (z === 16 && c < 1) return Ink[1];
      if (y === 10 && x >= 10 && x <= 17 && z >= 3 && z <= 11) return spokes(x - 13.5, z - 7, a, 1, 3.8, Ink[1], St[2], St[3]); // the flywheel, turning
      if (x >= 11 && x <= 15 && y >= 6 && y <= 9 && z >= 2 && z <= 6) return z === 6 ? St[2] : St[1];       // the pump body
      if (x >= 16 && y >= 4 && y <= 5 && z >= 6 && z <= 7) return Ink[1];                                  // the hose into the stalls
      return null; });
    const milker = [0, 1, 2, 3].map(i => milkerAt(i * Math.PI / 8));
    // 蜂蜜收集槽: the honey barrel in the middle of the meadow (hives drain into it), a wooden tap and a jar under it
    const vat = B(12, 12, 16, (x, y, z) => {
      const c = Math.hypot(x - 5.5, y - 5);
      if (z <= 12 && c < 4.6) { if (c > 3.6) return z === 2 || z === 10 ? Ink[1] : z === 0 ? Wd[1] : ((Math.atan2(y - 5, x - 5.5) * 6 / Math.PI + 6) | 0) % 2 ? Wd[3] : Wd[2]; return z === 12 ? Ac[1] : null; }
      if (z === 13 && c < 3.6 && c > 2.4) return Wd[4];                                                    // rim
      if (y >= 9 && y <= 10 && x >= 5 && x <= 6 && z >= 3 && z <= 4) return z === 4 ? Wd[4] : Wd[2];        // the tap
      if (y === 11 && x >= 4 && x <= 7 && z <= 2) return z === 2 ? St[3] : Ac[1];                           // a jar filling up
      return null; });
    // the little gutter under each hive (a golden lip on a short trough), drawn as its own tiny model in front of the hive
    const gutter = B(12, 4, 3, (x, y, z) => { if (x < 1 || x > 10 || y > 3) return null; const rim = x === 1 || x === 10 || y === 0 || y === 3; if (z === 0) return Wd[2]; if (z === 1) return rim ? Wd[1] : Ac[1]; return z === 2 && rim && (x + y) % 3 === 0 ? Wd[1] : null; });
    return { sprinkler, mill, jam, cheese, pie: jam, hive, lamp, feeder, chute, milker, vat, gutter };
  }
  // ---------- small pixel icons (products, the lamp's 'too far' mark) ----------
  function makeIcons(x) { const pix = x.pix;
    return {
      flour: pix(['.ccc.', 'ccccc', 'ctctc', 'ccccc', '.ccc.']),
      jam: pix(['.ttt.', '.www.', 'rrrrr', 'rcrrr', 'rrrrr', '.rrr.']),
      cheese: pix(['...yy', '.yyyy', 'yyoyy', 'yyyyy', 'ooooo']),
      apple_pie: pix(['.ttt.', '.wrw.', 'rrrrr', 'rcrcr', 'rrrrr', '.rrr.']),
      honey: pix(['.sss.', '.www.', 'yyyyy', 'yoyyy', 'yyyyy', '.yyy.']),
      far: pix(['...EE', '..EE.', '.EEEE', '..EE.', '.EE..', 'EE...']),
      bee: pix(['ii', 'yi'], false),
    };
  }

  // ---------- mount / sync ----------
  function mount(x) { X = x; S = x.S; MD = makeModels(x); ICON = makeIcons(x); mounted = true; sync(true); warm(); return api; }
  const keyOf = () => JSON.stringify([S.works.sprinklers.map(s => [s.x, s.y, s._c]), S.works.works, S.works.hives.map(h => [h.at, h.s, h.x, h.y, h._c]), S.plots, S.eff && S.eff.wheel, (S.eff && S.eff.regions || []).includes('orchard'), machKey()]);
  function clearList(list) { for (const q of list) removeFrom(X.props, q); list.length = 0; }
  function sync(force) {
    if (!mounted) return; const k = keyOf(); if (!force && k === lastKey) return; lastKey = k;
    clearList(own.spr); clearList(own.works); clearList(own.hives); clearList(own.lamps); clearList(own.mach);
    for (const s of S.works.sprinklers) if (!s._c) own.spr.push(X.addProp(MD.sprinkler, s.x, s.y, 0, { xp: 1 }));
    for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (!w || !w.at || !S.plots[w.at]) continue; const p = PW.workPos(w);
      own.works.push(X.addProp(MD[id], p.x, p.y, 0, { xp: 1, big: 1, work: id })); }
    hiveSpots().forEach((h, i) => h && !S.works.hives[i]._c && own.hives.push(X.addProp(MD.hive, h.x, h.y, 0, { xp: 1 })));
    if ((S.eff && S.eff.wheel) > 0) for (const l of lamps()) own.lamps.push(X.addProp(MD.lamp, l.x, l.y, 0, { xp: 1, lamp: l.id }));
    for (const q of machSpots()) own.mach.push(X.addProp(q.frames ? MD[q.kind][0] : MD[q.kind], q.x, q.y, 0, { xp: 1, mach: q.kind, frames: q.frames ? MD[q.kind] : null }));
    X.markNavDirty();
  }
  // where the hives stand: hive i takes slot i (the meadow's six first, then the orchard pair)
  function hiveSpots() { const reg = S.eff ? S.eff.regions : []; return S.works.hives.map(h => PW.hivePos(h, S.plots, reg)); } // index-aligned with S.works.hives (null: no slot)
  let lampCache = null, lampKey = '';
  function lamps() { const k = JSON.stringify([S.plots, S.works.works, S.eff && S.eff.wheel]); if (k === lampKey && lampCache) return lampCache; lampKey = k;
    const wheels = PW.wheelsOf(S.plots, (S.eff && S.eff.wheel) | 0); lampCache = PW.lampSpots(S.plots, S.works.works).map(l => Object.assign(l, { on: PW.powered(l.x, l.y, wheels) })); return lampCache; }
  // things that block walking: the workshop buildings (lamps, hives and sprinklers are small enough to walk round in place)
  function blocks() { const out = []; for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (!w || !w.at || !S.plots[w.at]) continue; const p = PW.workPos(w); out.push([p.x - 7, p.y - 5, p.x + 7, p.y + 4]); } return out; }
  // where someone stands to hand goods in / take them out: in front of the door
  function doorOf(id) { const w = S.works.works[id]; const p = PW.workPos(w); return { x: p.x + 1, y: p.y + 8 }; }
  // ---------- v5.11.0.27 machines: where each one stands (fixed spots on what is already there) ----------
  const PENS = () => (root.PFWorld && root.PFWorld.PENS) || {};
  const machKey = () => JSON.stringify([S.works.mach || 0, PW.MACH_PENS.map(k => !!(S.eff && S.eff[k])), PW.MACH_PENS.map(k => { const P = PENS()[k]; return P && P.bld ? [P.bld.x, P.bld.y] : 0; })]);
  const meadowCentre = () => { const sl = PW.hiveSlots(S.plots, S.eff ? S.eff.regions : []).filter(q => q.at !== 'orchard'); if (sl.length < 6) return null;
    return { x: Math.round((sl[0].x + sl[1].x) / 2), y: Math.round((sl[0].y + sl[3].y) / 2) }; };
  function machSpots() {
    const m = S.works.mach, out = []; if (!m || !S.eff) return out; const P = PENS();
    for (const k of PW.MACH_PENS) { if (!S.eff[k] || !PW.fitted(m, k) || !P[k] || !P[k].trough) continue; const t = P[k].trough; out.push({ kind: 'feeder', pen: k, x: t.x, y: t.y - 3.5, frames: 1 }); }
    if (m.e) for (const k of ['coop', 'coop2']) { if (!S.eff[k] || !P[k]) continue; const b = P[k].bld; out.push({ kind: 'chute', pen: k, x: b.x + 9.5, y: b.y + 1 }); }
    if (m.m) for (const k of ['shed', 'shed2']) { if (!S.eff[k] || !P[k]) continue; const b = P[k].bld; out.push({ kind: 'milker', pen: k, x: b.x - 14, y: b.y + 3, frames: 1 }); }
    if (m.h) { const c = meadowCentre(); if (c) out.push({ kind: 'vat', x: c.x, y: c.y });
      hiveSpots().forEach((h, i) => { if (h && !S.works.hives[i]._c && h.at !== 'orchard') out.push({ kind: 'gutter', x: h.x, y: h.y + 4 }); }); }
    return out;
  }
  // the shop and the codex draw the machines from their models (like the decorations)
  const MACH_ART = { feeder: 'feeder', feedset: 'feeder', chute: 'chute', milker: 'milker', tray: 'vat' };
  const ICON_URL = {}, BOOK_URL = {};
  function machModel(id) { const m = MD && MD[MACH_ART[id]]; return Array.isArray(m) ? m[0] : m; }
  function cropURL(m, N, seen) {
    const k = X.stackCanvas(m, -0.6), src = k.c, d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, big = Math.max(w, h), sc = big <= N - 2 ? Math.max(1, Math.floor((N - 2) / big)) : (N - 2) / big;
    const dw = Math.max(1, Math.round(w * sc)), dh = Math.max(1, Math.round(h * sc)), c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, x0, y0, w, h, Math.floor((N - dw) / 2), N - 1 - dh, dw, dh);
    const ICN = root.PFCodexIcons;
    if (seen === false && ICN && ICN.silhouette) { const im = g.getImageData(0, 0, N, N), sil = ICN.silhouette({ w: N, h: N, px: im.data }); g.putImageData(new ImageData(sil.px, N, N), 0, 0); }
    return c.toDataURL();
  }
  function machIconURL(id) { if (ICON_URL[id] !== undefined) return ICON_URL[id]; const m = machModel(id); if (!m || typeof document === 'undefined') return null;
    try { return (ICON_URL[id] = cropURL(m, 32, true)); } catch (e) { return null; } }
  function machBookURL(id, seen) { const key = id + (seen ? '' : ':sil'); if (BOOK_URL[key] !== undefined) return BOOK_URL[key]; const m = machModel(id); if (!m || typeof document === 'undefined') return null;
    try { return (BOOK_URL[key] = cropURL(m, 36, !!seen)); } catch (e) { return null; } }
  function warm() {
    const list = [MD.sprinkler, MD.mill, MD.jam, MD.cheese, MD.hive, MD.lamp, ...((X.wheelFrames && X.wheelFrames()) || []), ...(S.works.mach ? [...MD.feeder, MD.chute, ...MD.milker, MD.vat, MD.gutter] : [])]; let n = 0, base = null, idx = 0;
    const step = () => { if (X.manual) return; const t0 = performance.now(), b = Math.round(X.cam.ta / X.ASTEP); if (b !== base) { base = b; n = 0; idx = 0; }
      while (n <= 8 && performance.now() - t0 < 5) { const m = list[idx], a = (base + (n & 1 ? -(n + 1) / 2 : n / 2)) * X.ASTEP; X.stackCanvas(m, a); if (++idx >= list.length) { idx = 0; n++; } }
      setTimeout(step, n > 8 ? 900 : 80); };
    setTimeout(step, 2500);
  }

  // ---------- every frame: turning wheels ----------
  function frame(realT) {
    if (own.mach.length) { const i = Math.floor(realT * 4); for (const q of own.mach) if (q.frames) q.m = q.frames[(i + (q.x & 3)) % q.frames.length]; } // v5.11.0.27: cranks and flywheels turn
    const n = (S.eff && S.eff.wheel) | 0; if (!n || !X.wheelProp) return; const frames = X.wheelFrames();
    PW.wheelsOf(S.plots, n).forEach(w => { const q = X.wheelProp(w.plot), fr = (q && q.frames) || frames; if (q) q.m = fr[Math.floor(realT * 5) % fr.length]; }); // v5.11.0.20: each wheel has its bank side's frames
  }
  // ---------- overlays: spray, bees, finished goods, lamps that are too far ----------
  function draw(ctx, proj, onScreen, realT, T, night, rain, mode) {
    const day = T >= 7 * 60 && T < 18 * 60 + 30;
    // spray: an arc of droplets turning round each sprinkler while it waters
    S.works.sprinklers.forEach((s, i) => { if (s._c || !(realT < (s.spray || 0) || (s.wday === S.day && T >= 6 * 60 && T < 6 * 60 + 50)) || !onScreen(s.x, s.y, 30)) return;
      for (let k = 0; k < 18; k++) { const a = realT * 2.2 + (k >> 1) * 0.7 + i, r = ((realT * 11 + k * 1.7) % 15) + 2, h = 5 + 7 * Math.sin(Math.PI * r / 17);
        const [sx, sy] = proj(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); ctx.fillStyle = k & 1 ? '#d8f0f8' : '#7ec0dc'; ctx.fillRect(Math.round(sx), Math.round(sy - h), 2, k & 1 ? 1 : 2); } });
    // bees: a few dots buzzing round each hive in the daytime
    if (day && !rain) hiveSpots().forEach((h, i) => { if (!h || S.works.hives[i]._c || !onScreen(h.x, h.y, 40)) return;
      for (let k = 0; k < 3; k++) { const ph = i * 2.3 + k * 2.1, R = 6 + 5 * Math.sin(realT * 0.7 + ph), a = realT * (1.4 + k * 0.3) + ph;
        const [sx, sy] = proj(h.x + Math.cos(a) * R, h.y + Math.sin(a * 1.3) * R * 0.8); ctx.drawImage(ICON.bee, Math.round(sx) - 1, Math.round(sy - 10 - 3 * Math.sin(realT * 4 + ph)) - 1); } });
    // finished goods waiting: the product's icon bobbing over the door
    const bob = Math.round(Math.sin(realT * 3));
    for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (!w || !w.at || !(w.ready > 0)) continue; const p = PW.workPos(w); if (!onScreen(p.x, p.y, 40)) continue;
      const [sx, sy] = proj(p.x, p.y), ic = ICON[PW.WORKS[id].out]; ctx.drawImage(ic, Math.round(sx) - (ic.width >> 1), Math.round(sy) - 40 + bob); }
    const hs = hiveSpots(); S.works.hives.forEach((hv, i) => { const h = hs[i]; if (!h || hv._c || !(hv.ready > 0) || !onScreen(h.x, h.y, 30)) return; const [sx, sy] = proj(h.x, h.y); ctx.drawImage(ICON.honey, Math.round(sx) - 3, Math.round(sy) - 22 + bob); });
    // v5.11.0.27 machines: eggs roll down the chute, water drips from the feeder's tap, honey drips into the jar
    if (own.mach.length && T >= 5 * 60 && T < 21 * 60) for (const q of own.mach) { if (!onScreen(q.x, q.y, 30)) continue;
      if (q.mach === 'chute') for (let k = 0; k < 2; k++) { const t = (realT * 0.45 + k * 0.5 + (q.x & 7) * 0.13) % 1; if (t > 0.8) continue; const u = t / 0.8;
        const [sx, sy] = proj(q.x - 4 + u * 5.5, q.y); const z = 13 - 9 * u; ctx.fillStyle = '#f6ecd0'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy - z) - 1, 2, 2); ctx.fillStyle = '#cfd0c6'; ctx.fillRect(Math.round(sx), Math.round(sy - z), 1, 1); }
      else if (q.mach === 'feeder') { const t = (realT * 1.3 + (q.x & 3) * 0.25) % 1, [sx, sy] = proj(q.x + 2.5, q.y + 2); ctx.fillStyle = '#6fc0dc'; ctx.fillRect(Math.round(sx), Math.round(sy - 10 + t * 7), 1, 2); }
      else if (q.mach === 'vat') { const t = (realT * 0.9) % 1, [sx, sy] = proj(q.x + 0.25, q.y + 5); ctx.fillStyle = '#f2cf55'; ctx.fillRect(Math.round(sx), Math.round(sy - 3 + t * 2), 1, 1); }
      else if (q.mach === 'milker') { const [sx, sy] = proj(q.x, q.y); if (Math.floor(realT * 2) % 2) { ctx.fillStyle = '#9a9ea0'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 21 - Math.floor((realT * 6) % 4), 2, 1); } } } // a puff over the lid
    // lamps: lit bulbs, and a small grey 'too far' bolt over the ones the wheel can't reach (only at dusk / night)
    if (night > 0.2 && (S.eff && S.eff.wheel) > 0) for (const l of lamps()) { if (!onScreen(l.x, l.y, 30)) continue; const [sx, sy] = proj(l.x, l.y);
      if (l.on) { ctx.fillStyle = '#fff4b8'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 12, 2, 2); }
      else { ctx.globalAlpha = 0.85; ctx.drawImage(ICON.far, Math.round(sx) - 3, Math.round(sy) - 26); ctx.globalAlpha = 1; } }
    // move mode: every sprinkler's patch outlined; the picked one and the hover spot stand out
    if (mode && mode.on) {
      const tl = X.tiles, cov = PW.coveredBy(S.works.sprinklers, tl);
      cov.forEach((list, i) => { ctx.fillStyle = i === mode.pick ? 'rgba(255,240,160,0.55)' : 'rgba(140,210,240,0.35)'; for (const t of list) tileBox(ctx, proj, t); });
      if (mode.hover) { const h = mode.hover; ctx.fillStyle = h.ok ? 'rgba(160,240,170,0.45)' : 'rgba(240,120,110,0.4)'; if (h.ok) for (const t of tl) if (t.open && PW.covers(h, t)) tileBox(ctx, proj, t);
        const [sx, sy] = proj(h.x, h.y); ctx.fillStyle = h.ok ? '#bff0c0' : '#f08070'; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) - 1, 5, 2); }
    }
  }
  function tileBox(ctx, proj, t) { const h = 3.5; const a = proj(t.x - h, t.y - h), b = proj(t.x + h, t.y - h), c = proj(t.x + h, t.y + h), d = proj(t.x - h, t.y + h);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill(); }
  // light sources at night: powered lamps glow, the workshops' windows are warm while they work
  function lights(hz) {
    if ((S.eff && S.eff.wheel) > 0) for (const l of lamps()) if (l.on) hz(l.x, l.y, 22, 38, 0.9);
    for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (!w || !w.at || !(w.left > 0)) continue; const p = PW.workPos(w); hz(p.x, p.y + 6, 14, 18, 0.5); }
  }
  // the lamp ids that are lit now (works.js decides the fruit bonus from these)
  const litLamps = () => (S.eff && S.eff.wheel) > 0 ? lamps().filter(l => l.on) : [];
  const api = { mount, sync, frame, draw, lights, blocks, doorOf, hiveSpots, litLamps, icons: () => ICON, models: () => MD, own, machSpots, machIconURL, machBookURL };
  root.PFWorksArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
