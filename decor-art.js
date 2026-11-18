// 像素农场 · 第 9 阶段（v5.7.0）的画面：装饰的体素模型和图标、夜灯和串灯的灯泡、派对区、摆放时的高亮和「搬运中」的小图标。
// Rules live in decor.js (pure, unit-tested). game.js calls mount(X) once its models exist, sync() whenever S.decor changes
// (idempotent: a key decides), draw() with the order marks and lights() from lighting().
'use strict';
(function (root) {
  const DC = root.PFDecor, PW = root.PFWorks;
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink, G = R.green;
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = []; // props this file put down
  const ICON_URL = {};

  // ---------- models (voxel = 1 screen px; 2 voxels per world unit) ----------
  const ring = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
  function makeModels(x) {
    const B = x.buildModel;
    const bench = B(12, 7, 8, (x, y, z) => {
      if (z <= 2 && (x === 1 || x === 10) && (y === 2 || y === 5)) return Wd[1];            // legs
      if (z === 3 && y >= 2 && y <= 5) return (y & 1) ? Wd[3] : Wd[4];                     // seat planks
      if (y === 1 && z >= 4 && z <= 7 && (x === 1 || x === 10 || z === 6 || z === 7)) return z === 7 ? Wd[4] : Wd[2]; // the back
      return null; });
    const flowerpot = B(6, 6, 9, (x, y, z) => {
      const c = ring(x, y, 2.5, 2.5);
      if (z <= 2) return c < 2.2 + z * 0.2 ? Rf[2] : null;
      if (z === 3) return c < 2.9 ? (c > 2.2 ? Rf[3] : Wd[1]) : null;
      if (z >= 4 && z <= 5) return (x + y) % 3 === 0 && c < 2.2 ? G[3] : null;            // stems
      if (z >= 6 && z <= 7) { if (c > 2.6) return null; const k = (x * 3 + y * 5 + z) % 5; return k === 0 ? Ac[3] : k === 1 ? Ac[1] : k === 2 ? Ac[0] : (c < 1.4 ? G[4] : null); }
      if (z === 8) return c < 1.2 ? Ac[3] : null;
      return null; });
    const scarecrow = B(10, 6, 20, (x, y, z) => {
      if ((x === 4 || x === 5) && (y === 2 || y === 3) && z <= 11) return Wd[2];          // pole
      if (z >= 10 && z <= 11 && y >= 2 && y <= 3) return (x === 0 || x === 9) ? Ac[1] : Rf[2]; // arms in sleeves, straw hands
      if (z >= 5 && z <= 11 && x >= 3 && x <= 6 && y >= 1 && y <= 4) return z === 7 ? Wd[2] : (z <= 6 ? Wt[2] : Rf[2]); // shirt, belt, trousers
      if (z >= 12 && z <= 15 && ring(x, y, 4.5, 2.5) < 2.2) return (z === 13 && y === 4 && (x === 3 || x === 6)) ? Ink[0] : Ac[0]; // sack head
      if (z === 16 && ring(x, y, 4.5, 2.5) < 4.2) return Ac[1];                             // hat brim
      if (z >= 17 && z <= 18 && ring(x, y, 4.5, 2.5) < 1.9) return z === 17 ? Rf[2] : Ac[1]; // crown with a band
      return null; });
    const birdbath = B(10, 10, 10, (x, y, z) => {
      const c = ring(x, y, 4.5, 4.5);
      if (z <= 1) return c < 3.4 ? St[1] : null;
      if (z <= 5) return c < 1.6 ? St[2] : null;
      if (z <= 7) return c < 4.4 ? (c > 3.4 || z === 6 ? St[3] : null) : null;
      if (z === 8) return c < 3.4 ? Wt[3] : (c < 4.4 ? St[3] : null);
      return null; });
    const stonelamp = B(8, 8, 15, (x, y, z) => {
      const c = ring(x, y, 3.5, 3.5), sq = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
      if (z <= 1) return c < 3.4 ? St[1] : null;
      if (z <= 5) return c < 1.6 ? St[2] : null;
      if (z === 6) return sq < 3.6 ? St[2] : null;
      if (z <= 10) { if (sq > 2.6) return null; const win = sq > 1.6 && (Math.abs(x - 3.5) < 1 || Math.abs(y - 3.5) < 1) && z >= 8 && z <= 9; return win ? Ac[1] : (sq > 1.6 ? St[3] : Ac[1]); }
      if (z <= 12) return sq < 4 - (z - 11) * 0.6 ? St[1] : null;
      if (z <= 14) return sq < 1.6 - (z - 13) * 0.8 ? St[2] : null;
      return null; });
    const stringlights = B(26, 4, 20, (x, y, z) => {
      if ((x <= 1 || x >= 24) && (y === 1 || y === 2) && z <= 18) return z === 18 ? Wd[4] : Wd[2];
      return null; });
    // 派对区: a long table with a cloth and food, two benches, four posts for the lights (strung by the overlay)
    const party = B(44, 30, 22, (x, y, z) => {
      if ((x <= 1 || x >= 42) && (y <= 1 || y >= 28) && z <= 20) return z === 20 ? Wd[4] : Wd[2];
      const tx = x >= 12 && x <= 31, ty = y >= 11 && y <= 18;
      if (tx && ty) {
        if (z <= 4) return ((x === 12 || x === 31) && (y === 11 || y === 18)) ? Wd[1] : null;
        if (z === 5) return (y === 11 || y === 18) ? Rf[2] : Ac[0];
        if (z === 6) { const k = (x * 7 + y * 3) % 9; return k === 0 ? Ac[2] : k === 3 ? Rf[3] : k === 5 ? G[4] : k === 7 ? Ac[1] : null; }
        if (z === 7) return (x * 7 + y * 3) % 9 === 0 && x % 2 === 0 ? Ac[1] : null;
        return null; }
      if (x >= 12 && x <= 31 && (y === 7 || y === 8 || y === 21 || y === 22)) { if (z === 3) return (x & 1) ? Wd[3] : Wd[4]; if (z <= 2) return (x === 13 || x === 30) ? Wd[1] : null; }
      return null; });
    const carving = B(8, 8, 13, (x, y, z) => {
      const body = ((x - 3.5) / 3.2) ** 2 + ((y - 3.5) / 2.8) ** 2 + ((z - 3) / 3.4) ** 2 < 1, head = ((x - 3.5) / 2.4) ** 2 + ((y - 4) / 2.2) ** 2 + ((z - 8.5) / 2.3) ** 2 < 1;
      if (z <= 0) return ring(x, y, 3.5, 3.5) < 3.6 ? Wd[1] : null;
      if (head) return (z === 9 && y >= 6 && (x === 2 || x === 5)) ? Ink[0] : (z === 8 && y >= 6 && (x === 3 || x === 4)) ? Wd[2] : Wd[3];
      if (z >= 10 && z <= 11 && (x === 1 || x === 6) && y >= 3 && y <= 4) return Wd[2];
      if (body) return Wd[3];
      return null; });
    const shell = B(8, 7, 5, (x, y, z) => {
      const c = ((x - 3.5) / 3.6) ** 2 + ((y - 3) / 3) ** 2; if (c > 1 - z * 0.24) return null;
      const k = (x * 5 + y * 3 + z * 7) % 6; return k === 0 ? Ac[3] : k === 1 ? Ac[1] : k === 2 ? Wd[5] : Ac[0]; });
    const bottle = B(7, 7, 10, (x, y, z) => {
      const c = ring(x, y, 3, 3);
      if (z === 0) return c < 3.2 ? Wd[5] : null;
      if (z <= 6) return c < 1.5 ? ((z === 3 && c < 0.8) ? Ac[0] : Wt[4]) : null;
      if (z <= 8) return c < 0.8 ? Wt[5] : null;
      if (z === 9) return c < 0.8 ? Wd[3] : null;
      return null; });
    const plinth = (x, y, z) => (z <= 2 && x >= 1 && x <= 10 && y >= 1 && y <= 10) ? (z === 2 ? St[3] : St[2]) : null;
    const keep = (top, rib, stem) => B(12, 12, 16, (x, y, z) => {
      const p = plinth(x, y, z); if (p) return p;
      const c = ((x - 5.5) / 4.6) ** 2 + ((y - 5.5) / 4.6) ** 2 + ((z - 8) / 4.4) ** 2;
      if (c < 1 && z >= 3) return rib(x, y, z) ? top[1] : top[0];
      if (z >= 12 && z <= 14 && ring(x, y, 5.5, 5.5) < 0.9) return stem;
      return null; });
    const giant_pumpkin = keep([Ac[2], Rf[2]], (x) => x % 3 === 0, Wd[1]);
    const giant_cabbage = keep([G[4], G[3]], (x, y, z) => (x + z) % 4 === 0 || (y + z) % 5 === 0, G[2]);
    const giant_watermelon = keep([G[2], G[1]], (x) => x % 3 === 1, Wd[1]);
    const koistatue = B(12, 12, 18, (x, y, z) => {
      const p = plinth(x, y, z); if (p) return p;
      if (y < 4 || y > 7 || z < 3) return null;
      const dx = x - 5.5, dz = z - 9.5, u = dx * 0.7 + dz * 0.7, v = -dx * 0.7 + dz * 0.7;
      if ((u / 4.6) ** 2 + (v / 1.9) ** 2 < 1) return (Math.abs(u - 3) < 0.8 && v > 0.2 && (y === 4 || y === 7)) ? Ink[0] : ((u > 0.5 && v > -0.3) || u < -2.6 ? Ac[2] : Ac[0]);
      if (u < -4 && u > -7 && Math.abs(v) < 0.6 + (-4 - u) * 0.8 && (y === 5 || y === 6)) return Ac[2];   // tail fan
      if (z <= 4 && Math.abs(dx) < 1.5 && (y === 5 || y === 6)) return Wt[4];                               // a splash under it
      return null; });
    const chime = B(10, 6, 20, (x, y, z) => {
      if ((x === 1 || x === 2) && (y === 2 || y === 3) && z <= 18) return Wd[2];
      if (z === 18 && x >= 1 && x <= 8 && (y === 2 || y === 3)) return Wd[3];
      if (z === 17 && x >= 5 && x <= 7 && y >= 2 && y <= 3) return Ac[1];                       // the little bell roof
      if ((x === 5 || x === 7) && y === 2 && z >= 11 && z <= 16) return z % 2 ? St[3] : Wt[4];  // the rods
      if (x === 6 && y === 3 && z >= 9 && z <= 16) return z <= 10 ? Ac[0] : St[2];              // the clapper and its paper
      return null; });
    return { bench, flowerpot, scarecrow, birdbath, lamppost: x.lampModel(), stonelamp, stringlights, party, carving, shell, bottle, giant_pumpkin, giant_cabbage, giant_watermelon, koistatue, chime };
  }
  // the toolbar / shop / book icon: the model drawn at a fixed angle, fitted into 32 x 32
  function makeIcons() {
    const extra = (X.extra && X.extra()) || {};
    for (const id of DC.IDS.concat(Object.keys(extra))) { const m = MD[id] || extra[id]; if (!m) continue;
      try { const k = X.stackCanvas(m, -0.6), c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        const sw = k.c.width, sh = k.c.height, s = Math.min(1, 30 / Math.max(sw, sh)), w = Math.round(sw * s), h = Math.round(sh * s);
        g.drawImage(k.c, 0, 0, sw, sh, Math.round((32 - w) / 2), Math.round((32 - h) / 2), w, h); ICON_URL[id] = c.toDataURL(); } catch (e) { /* drawn later */ } }
  }
  const iconURL = id => ICON_URL[id] || null;
  // the codex cell: the model cropped to its pixels and scaled up by a whole number onto 36x36 (shown at 72, like the fish and bugs);
  // unseen pieces use the book's own silhouette (dark fill, darker edge)
  const BOOK_URL = {};
  function bookURL(id, seen) {
    const key = id + (seen ? '' : ':sil'); if (BOOK_URL[key] !== undefined) return BOOK_URL[key];
    const m = MD && MD[id]; if (!m || typeof document === 'undefined') return null;
    try {
      const k = X.stackCanvas(m, -0.6), src = k.c, sg = src.getContext('2d'), d = sg.getImageData(0, 0, src.width, src.height).data;
      let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
      for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return (BOOK_URL[key] = null);
      const N = 36, w = x1 - x0 + 1, h = y1 - y0 + 1, big = Math.max(w, h), sc = big <= N - 2 ? Math.max(1, Math.floor((N - 2) / big)) : (N - 2) / big;
      const dw = Math.max(1, Math.round(w * sc)), dh = Math.max(1, Math.round(h * sc)), c = document.createElement('canvas'); c.width = c.height = N;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, x0, y0, w, h, Math.floor((N - dw) / 2), N - 1 - dh, dw, dh);
      const ICN = root.PFCodexIcons;
      if (!seen && ICN && ICN.silhouette) { const im = g.getImageData(0, 0, N, N), sil = ICN.silhouette({ w: N, h: N, px: im.data }); g.putImageData(new ImageData(sil.px, N, N), 0, 0); }
      return (BOOK_URL[key] = c.toDataURL());
    } catch (e) { return null; }
  }

  // ---------- mount / sync ----------
  function mount(x) { X = x; S = x.S; MD = makeModels(x); mounted = true; sync(true); makeIcons(); return api; }
  const carriedSet = () => new Set(S.decor.orders.filter(q => q.st === 1 && q.what === 'decor').map(q => q.ref));
  const keyOf = () => JSON.stringify([S.decor.placed.map(p => [p.u, p.x, p.y]), [...carriedSet()]]);
  function sync(force) {
    if (!mounted) return; const k = keyOf(); if (!force && k === lastKey) return; lastKey = k;
    for (const q of own) { const i = X.props.indexOf(q); if (i >= 0) X.props.splice(i, 1); } own.length = 0;
    const hid = carriedSet();
    for (const p of S.decor.placed) { if (hid.has(p.u) || !MD[p.id]) continue; own.push(X.addProp(MD[p.id], p.x, p.y, 0, { xp: 1, decor: p.u, big: DC.CATALOG[p.id].big ? 1 : 0 })); }
    X.markNavDirty();
  }
  // the parts people walk round
  function blocks() { const hid = carriedSet(), out = [];
    for (const p of S.decor.placed) { const b = DC.CATALOG[p.id].block; if (b && !hid.has(p.u)) out.push(DC.boxOf(p.x, p.y, b)); } return out; }
  // lamps: every placed lamp, lit when a turning wheel reaches it
  function lamps() { const n = (S.eff && S.eff.wheel) | 0, wheels = n && PW ? PW.wheelsOf(S.plots, n) : [], hid = carriedSet();
    return S.decor.placed.filter(p => DC.CATALOG[p.id].light && !hid.has(p.u)).map(p => ({ id: 'd' + p.u, u: p.u, kind: p.id, x: p.x, y: p.y, r: DC.CATALOG[p.id].light, on: wheels.length > 0 && PW.powered(p.x, p.y, wheels) })); }
  const litLamps = () => lamps().filter(l => l.on);
  const partyNow = T => { const pa = S.decor.party; return pa && pa.tonight === S.day && DC.partyOn(T); };
  function lights(hz, T) {
    for (const l of lamps()) { const party = l.kind === 'party' && partyNow(T); if (!(l.on || party)) continue;
      hz(l.x, l.y, { lamppost: 14, stonelamp: 5, stringlights: 16, party: 16 }[l.kind] || 10, l.r * 1.5, l.kind === 'lamppost' ? 0.9 : 0.75); }
  }
  // bulbs along a sagging string between two post tops (z in screen px)
  function string(ctx, proj, a, b, za, zb, n, lit, realT, ph) {
    for (let i = 1; i < n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = za + (zb - za) * t - Math.sin(Math.PI * t) * 4;
      const [sx, sy] = proj(x, y); const on = lit && (Math.sin(realT * 2 + i * 1.7 + ph) > -0.6);
      ctx.fillStyle = !lit ? St[3] : on ? ((i % 3 === 0) ? '#fff4b8' : (i % 3 === 1) ? Ac[3] : Ac[1]) : Wd[4];
      ctx.fillRect(Math.round(sx), Math.round(sy - z), 1, lit ? 2 : 1); }
  }
  // ---------- overlays ----------
  // mode: { on, hover: { x, y, id, ok, box }, pick: { x, y } | null, items: [{ x, y }] } (the placing / moving tool), far: wheel exists
  function draw(ctx, proj, onScreen, realT, T, night, mode, carriers) {
    const hid = carriedSet(), wheel = ((S.eff && S.eff.wheel) | 0) > 0;
    for (const p of S.decor.placed) { if (hid.has(p.u) || !onScreen(p.x, p.y, 40)) continue;
      const lamp = lamps().find(l => l.u === p.u), lit = !!(lamp && (lamp.on || (p.id === 'party' && partyNow(T)))) && night > 0.15;
      if (p.id === 'stringlights') string(ctx, proj, { x: p.x - 6, y: p.y }, { x: p.x + 6, y: p.y }, 18, 18, 9, lit, realT, p.u);
      if (p.id === 'party') { const P = DC.partyPosts(p); for (let i = 0; i < 4; i++) string(ctx, proj, P[i], P[(i + 1) % 4], 20, 20, i % 2 ? 9 : 13, lit, realT, i + p.u); }
      if (lamp && lit && p.id !== 'stringlights' && p.id !== 'party') { const [sx, sy] = proj(p.x, p.y), h = p.id === 'lamppost' ? 12 : 5; ctx.fillStyle = '#fff4b8'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - h, 2, 2); }
      if (lamp && !lamp.on && wheel && night > 0.2 && !(p.id === 'party' && partyNow(T)) && X.farIcon) { const [sx, sy] = proj(p.x, p.y); ctx.globalAlpha = 0.85; ctx.drawImage(X.farIcon(), Math.round(sx) - 3, Math.round(sy) - 30); ctx.globalAlpha = 1; } }
    // pending orders: a little flag where it is going
    for (const q of S.decor.orders) { if (!onScreen(q.x, q.y, 30)) continue; const [sx, sy] = proj(q.x, q.y), x = Math.round(sx), y = Math.round(sy);
      ctx.fillStyle = Ink[0]; ctx.fillRect(x, y - 9, 1, 9); ctx.fillStyle = q.st === 1 ? Ac[1] : Ac[0]; ctx.fillRect(x + 1, y - 9, 4, 3); }
    // someone carrying a piece: its icon bobbing over their head
    for (const c of carriers || []) { const url = c.id && ICON_URL[c.id]; if (!url) continue; const img = iconImg(c.id); if (!img) continue;
      const [sx, sy] = proj(c.x, c.y), bob = Math.round(Math.abs(Math.sin(realT * 8)) * 2); ctx.drawImage(img, Math.round(sx) - 8, Math.round(sy) - 50 - bob, 16, 16); }
    // the tool: every movable thing gets a small diamond; the hover footprint is green (fits) or red (does not)
    if (mode && mode.on) {
      for (const it of mode.items || []) { if (!onScreen(it.x, it.y, 20)) continue; const [sx, sy] = proj(it.x, it.y); ctx.fillStyle = mode.pick && mode.pick.x === it.x && mode.pick.y === it.y ? '#fff2a8' : 'rgba(255,246,220,0.85)';
        ctx.fillRect(Math.round(sx) - 1, Math.round(sy) + 2, 3, 1); ctx.fillRect(Math.round(sx), Math.round(sy) + 1, 1, 3); }
      const h = mode.hover; if (h && h.box) { const b = h.box, pts = [proj(b[0], b[1]), proj(b[2], b[1]), proj(b[2], b[3]), proj(b[0], b[3])];
        ctx.fillStyle = h.ok ? 'rgba(160,240,170,0.40)' : 'rgba(240,120,110,0.38)'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill(); }
    }
  }
  const IMG = {};
  function iconImg(id) { if (IMG[id]) return IMG[id].complete ? IMG[id] : null; if (!ICON_URL[id]) return null; const im = new Image(); im.src = ICON_URL[id]; IMG[id] = im; return null; }
  const api = { mount, sync, blocks, lamps, litLamps, lights, draw, iconURL, bookURL, models: () => MD };
  root.PFDecorArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
