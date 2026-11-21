// 像素农场 · 第 8 阶段（v5.6.0）的画面：浇水器、三座加工坊、蜂箱、路灯，水车转动，喷水、蜜蜂、成品小图标和灯的「接通 / 太远」标记。
// Rules live in works.js (pure, unit-tested). game.js calls mount(X) once its models exist, sync() whenever S.works or the
// plots change (idempotent: a key decides), frame() every frame (wheel frames), draw() with the order marks and lights() from lighting().
'use strict';
(function (root) {
  const PW = root.PFWorks, PL = root.PFPlots;
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink, G = R.green;
  let X = null, S = null, MD = null, ICON = null, lastKey = '', mounted = false;
  const own = { spr: [], works: [], hives: [], lamps: [] }; // props this file put down
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
    return { sprinkler, mill, jam, cheese, pie: jam, hive, lamp };
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
  const keyOf = () => JSON.stringify([S.works.sprinklers.map(s => [s.x, s.y, s._c]), S.works.works, S.works.hives.map(h => [h.at, h.s, h.x, h.y, h._c]), S.plots, S.eff && S.eff.wheel, (S.eff && S.eff.regions || []).includes('orchard')]);
  function clearList(list) { for (const q of list) removeFrom(X.props, q); list.length = 0; }
  function sync(force) {
    if (!mounted) return; const k = keyOf(); if (!force && k === lastKey) return; lastKey = k;
    clearList(own.spr); clearList(own.works); clearList(own.hives); clearList(own.lamps);
    for (const s of S.works.sprinklers) if (!s._c) own.spr.push(X.addProp(MD.sprinkler, s.x, s.y, 0, { xp: 1 }));
    for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (!w || !w.at || !S.plots[w.at]) continue; const p = PW.workPos(w);
      own.works.push(X.addProp(MD[id], p.x, p.y, 0, { xp: 1, big: 1, work: id })); }
    hiveSpots().forEach((h, i) => h && !S.works.hives[i]._c && own.hives.push(X.addProp(MD.hive, h.x, h.y, 0, { xp: 1 })));
    if ((S.eff && S.eff.wheel) > 0) for (const l of lamps()) own.lamps.push(X.addProp(MD.lamp, l.x, l.y, 0, { xp: 1, lamp: l.id }));
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
  function warm() {
    const list = [MD.sprinkler, MD.mill, MD.jam, MD.cheese, MD.hive, MD.lamp, ...((X.wheelFrames && X.wheelFrames()) || [])]; let n = 0, base = null, idx = 0;
    const step = () => { if (X.manual) return; const t0 = performance.now(), b = Math.round(X.cam.ta / X.ASTEP); if (b !== base) { base = b; n = 0; idx = 0; }
      while (n <= 8 && performance.now() - t0 < 5) { const m = list[idx], a = (base + (n & 1 ? -(n + 1) / 2 : n / 2)) * X.ASTEP; X.stackCanvas(m, a); if (++idx >= list.length) { idx = 0; n++; } }
      setTimeout(step, n > 8 ? 900 : 80); };
    setTimeout(step, 2500);
  }

  // ---------- every frame: turning wheels ----------
  function frame(realT) {
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
  const api = { mount, sync, frame, draw, lights, blocks, doorOf, hiveSpots, litLamps, icons: () => ICON, models: () => MD, own };
  root.PFWorksArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
