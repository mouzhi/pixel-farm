// 像素农场 · v5.10.3：院子小花销、阿禾小摊、动物照护的体素模型、图标和夜里的灯（规则在 yard.js）。
// game.js calls mount(X) once its models exist and sync() whenever S.homeyard changes or the weather turns (idempotent: a key decides).
// The pieces are plain props (no nav block), so decorations keep clear of them; the paths are painted by game.js's groundAt.
'use strict';
(function (root) {
  const YD = root.PFYard;
  const PAL = root.PF_PALETTE, R = PAL.ramps, Wd = R.wood, St = R.stone, Wt = R.water, Rf = R.roof, Ac = R.accent, Ink = R.ink, G = R.green;
  let X = null, S = null, MD = null, lastKey = '', mounted = false;
  const own = [], ICON_URL = {};
  const ring = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
  // ---------- models (voxel = 1 screen px; 2 voxels per world unit) ----------
  function makeModels(x) {
    const B = x.buildModel;
    const mailbox = B(8, 10, 18, (x, y, z) => {
      if (x >= 3 && x <= 4 && y >= 4 && y <= 5 && z <= 10) return Wd[2];                                   // post
      if (z >= 11 && z <= 15 && x >= 1 && x <= 6 && y >= 1 && y <= 8) { if (z === 15) return (x === 1 || x === 6) ? G[1] : G[2];
        if (y === 8 && x >= 2 && x <= 5 && z === 13) return Ink[0]; return G[2]; }                         // a green box with a letter slot
      if (z === 16 && x >= 2 && x <= 5 && y >= 1 && y <= 8) return G[1];
      if (x === 7 && y === 3 && z >= 12 && z <= 17) return z >= 15 ? Rf[2] : St[1];                         // the little flag
      return null; });
    const line = (clothes) => B(40, 4, 22, (x, y, z) => {
      if ((x <= 1 || x >= 38) && y >= 1 && y <= 2 && z <= 20) return Wd[2];                                 // posts
      if (z === 20 && (x <= 2 || x >= 37) && y <= 3) return Wd[3];
      if (z === 19 && x >= 2 && x <= 37 && y >= 1 && y <= 2) return St[3];                                         // the line
      if (clothes && y >= 1 && y <= 2) {
        if (x >= 5 && x <= 11 && z >= 12 && z <= 18) return (z >= 15 || (x >= 6 && x <= 10)) ? Ac[0] : null;  // a shirt
        if (x >= 14 && x <= 19 && z >= 10 && z <= 18) return (x === 16 || x === 17) && z <= 12 ? null : Wt[3];  // trousers
        if (x >= 22 && x <= 29 && z >= 13 && z <= 18) return (x + z) % 4 ? Ac[3] : Ac[0];                    // a towel
        if (x >= 32 && x <= 33 && z >= 15 && z <= 18) return Ac[1];                                          // a sock
      }
      return null; });
    const lantern = B(8, 6, 24, (x, y, z) => {
      if (x >= 1 && x <= 2 && y >= 2 && y <= 3 && z <= 22) return Wd[2];
      if (z === 22 && x >= 1 && x <= 6 && y >= 2 && y <= 3) return Wd[2];                                   // the arm
      if (x === 5 && y === 2 && z >= 19 && z <= 21) return Ink[1];
      if (x >= 4 && x <= 6 && y >= 1 && y <= 3 && z >= 13 && z <= 18) return z === 18 || z === 13 ? Ink[1] : (x === 5 || y === 2) ? Ac[1] : Rf[2]; // a red paper lantern, gold inside
      return null; });
    const flowerbed = B(14, 8, 5, (x, y, z) => {
      const edge = x === 0 || x === 13 || y === 0 || y === 7;
      if (edge) return z <= 1 ? ((x + y) % 3 ? St[2] : St[3]) : null;
      if (z === 0) return Wd[1];
      if (z === 1) return (x * 5 + y * 3) % 4 ? G[2] : Wd[1];
      if (z === 2) return (x + y) % 2 ? G[3] : null;
      if (z === 3) { const k = (x * 7 + y * 3) % 6; return k === 0 ? Ac[3] : k === 2 ? Ac[1] : k === 4 ? Ac[0] : null; }
      return null; });
    const fence = B(16, 4, 9, (x, y, z) => {
      if ((x <= 1 || x >= 14) && y >= 1 && y <= 2) return z <= 8 ? (z === 8 ? Wd[4] : Wd[2]) : null;        // posts
      if (y >= 1 && y <= 2 && (x % 3 === 0) && z <= 7) return z === 7 ? Ac[0] : Wd[4];                     // white-tipped pickets
      if (y === 2 && (z === 2 || z === 5)) return Wd[3];                                                    // rails
      return null; });
    const awning = B(46, 10, 30, (x, y, z) => {
      if ((x <= 1 || x >= 44) && y >= 8 && z <= 27) return Wd[2];                                           // front poles
      const top = 29 - Math.floor(y / 4);
      if (z === top) return Math.floor(x / 5) % 2 ? Ac[0] : G[3];                                          // striped canvas sloping forward
      if (y === 9 && z >= 25 && z < top && x % 5 < 3) return Math.floor(x / 5) % 2 ? Ac[0] : G[3];         // the scalloped edge
      return null; });
    const scale = B(12, 6, 22, (x, y, z) => {
      if (x >= 5 && x <= 6 && y >= 2 && y <= 3 && z <= 20) return Wd[2];                                    // the stand
      if (z <= 1 && y >= 1 && y <= 4 && x >= 3 && x <= 8) return Wd[1];
      if (z === 20 && y === 2 && x >= 0 && x <= 11) return St[1];                                           // the beam
      if (x === 2 && y === 2 && z >= 11 && z <= 19) return St[1];                                          // the pan's cord
      if (z === 10 && x >= 0 && x <= 4 && y >= 1 && y <= 4) return St[3];                                  // the pan
      if (x === 10 && y === 2 && z >= 15 && z <= 17) return Ink[1];                                        // the weight
      return null; });
    const sign = B(14, 4, 22, (x, y, z) => {
      if ((x === 1 || x === 12) && y >= 1 && y <= 2 && z <= 18) return Wd[1];
      if (z >= 10 && z <= 18 && x >= 0 && x <= 13 && y >= 1 && y <= 2) {
        if (y === 2 && ((z === 12 || z === 15) && x >= 3 && x <= 10 && x % 3 !== 2)) return Wd[1];        // the painted words
        return (z === 10 || z === 18 || x === 0 || x === 13) ? Wd[2] : Wd[4]; }
      if (z >= 19 && z <= 20 && x >= 0 && x <= 13 && y <= 3) return Rf[2];                                 // a little roof
      return null; });
    const vase = B(4, 4, 10, (x, y, z) => {
      if (z <= 4) return (x === 0 || x === 3) && (y === 0 || y === 3) ? null : (z === 2 ? Wt[4] : Wt[3]);
      if (z <= 6) return (x + y) % 2 ? G[3] : null;
      if (z <= 8) { const k = (x * 3 + y + z) % 3; return k === 0 ? Ac[3] : k === 1 ? Ac[1] : Ac[0]; }
      return null; });
    const straw = B(18, 12, 3, (x, y, z) => {
      if (ring(x, y, 8.5, 5.5) > 7.5 + ((x * 7 + y * 3) % 3) * 0.4) return null;
      if (z === 0) return (x + y) % 3 ? Ac[1] : Wd[4];
      if (z === 1) return (x * 3 + y * 5) % 4 === 0 ? Wd[4] : null;
      return null; });
    const catbed = B(8, 8, 5, (x, y, z) => {
      const c = ring(x, y, 3.5, 3.5); if (c > 3.6) return null;
      if (z === 0) return Wd[2];
      if (c > 2.5 && z <= 3) return z === 3 ? Wd[4] : ((x + z) % 2 ? Wd[3] : Wd[2]);                      // a woven basket
      if (z === 1) return Ac[3];                                                                            // the cushion
      return null; });
    const doghouse = B(14, 14, 16, (x, y, z) => {
      if (z <= 9 && x >= 1 && x <= 12 && y >= 1 && y <= 12) {
        const wall = x <= 1 || x >= 12 || y <= 1 || y >= 12; if (!wall) return null;
        if (y >= 12 && x >= 5 && x <= 8 && z <= 6 && !(z === 6 && (x === 5 || x === 8))) return Ink[0];     // the doorway
        return (x === 1 || x === 12) && (y === 1 || y === 12) ? Wd[2] : (z % 3 === 2 ? Wd[2] : Wd[3]); }
      const rz = 10 + Math.floor((6.5 - Math.abs(x - 6.5)) * 0.9);
      if (z >= 10 && z <= rz && x >= 0 && x <= 13 && y >= 0 && y <= 13) { if (z === rz) return Rf[2]; return y === 0 || y === 13 ? (z === rz - 1 ? Rf[1] : Wd[4]) : null; }
      return null; });
    const brush = B(6, 6, 14, (x, y, z) => {
      if (x >= 2 && x <= 3 && y >= 2 && y <= 3 && z <= 12) return Wd[2];
      if (z === 12 && x >= 1 && x <= 4 && y >= 2 && y <= 3) return Wd[2];
      if (y === 4 && x >= 1 && x <= 4 && z >= 8 && z <= 9) return z === 9 ? Wd[4] : Ink[1];               // the brush on its hook
      return null; });
    const saltlick = B(7, 6, 5, (x, y, z) => {
      if (x >= 1 && x <= 5 && y >= 1 && y <= 4 && z <= 1) return Wd[2];
      if (x >= 2 && x <= 4 && y >= 1 && y <= 4 && z >= 2 && z <= 4) return z === 4 ? Ac[0] : (x + z) % 2 ? St[3] : Ac[0];
      return null; });
    return { mailbox, clothesline: line(false), clothes: line(true), lantern, flowerbed, vegfence: fence, awning, scale, sign, vase, straw, catbed, doghouse, brush, saltlick };
  }
  // ---------- the props ----------
  const pensNow = () => (X.pens ? X.pens() : {});
  const keyOf = dry => JSON.stringify([S.homeyard && S.homeyard.put, Object.keys(pensNow()), !!dry]);
  function sync(force, dry) {
    if (!mounted) return; const k = keyOf(dry); if (!force && k === lastKey) return; lastKey = k;
    for (const q of own) { const i = X.props.indexOf(q); if (i >= 0) X.props.splice(i, 1); } own.length = 0;
    const put = (S.homeyard && S.homeyard.put) || {}, pens = pensNow();
    if (X.mailProp) X.mailProp.m = put.mailbox ? MD.mailbox : X.mailModel; // the new mailbox takes the old one's place
    for (const id of YD.IDS) {
      if (['gravel', 'flag', 'curtains', 'roof', 'mailbox'].includes(id)) continue;
      const m = id === 'clothesline' ? (dry ? MD.clothes : MD.clothesline) : MD[id]; if (!m) continue;
      for (let i = 0; i < (put[id] | 0); i++) { const p = YD.spotOf(id, i, pens); if (!p) continue;
        const rot = id === 'vegfence' ? YD.FENCE[i].rot : 0, o = { yard: id };
        if (id === 'vase') Object.assign(o, { z: 14, dy: 1.5 }); if (id === 'awning') o.dy = 1;
        own.push(X.addProp(m, p.x, p.y, rot, o)); } }
  }
  // the lantern by the door at night, and warm windows with the curtains up
  function lights(hz, T, house) {
    const put = (S.homeyard && S.homeyard.put) || {}, dark = T >= 17 * 60 + 30 || T < 6 * 60 + 30;
    if (!dark) return;
    if (put.lantern) { const p = YD.SPOTS.lantern[0]; hz(p.x + 1.5, p.y, 16, 22, 0.85); }
    if (put.curtains && house) { hz(house.x - 8.5, house.y + 10.5, 12, 30, 0.9); hz(house.x + 8.5, house.y + 10.5, 12, 30, 0.9); }
  }
  function makeIcons() {
    for (const id of YD.IDS) { const m = MD[id === 'clothesline' ? 'clothes' : id];
      try { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        if (m) { const k = X.stackCanvas(m, -0.6), sw = k.c.width, sh = k.c.height, s = Math.min(2, 30 / Math.max(sw, sh)), w = Math.round(sw * s), h = Math.round(sh * s);
          g.drawImage(k.c, 0, 0, sw, sh, Math.round((32 - w) / 2), Math.round((32 - h) / 2), w, h); }
        else iconFlat(g, id);
        ICON_URL['y_' + id] = c.toDataURL(); } catch (e) { /* drawn later */ } }
  }
  function iconFlat(g, id) { // the ground and house things: a small flat picture
    const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    if (id === 'gravel') { for (let i = 0; i < 40; i++) px(4 + (i * 7) % 24, 8 + (i * 11) % 16, 2, 2, [St[2], St[3], St[1], Wd[3]][i % 4]); return; }
    if (id === 'flag') { for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) px(4 + i * 8 + (j % 2) * 3, 6 + j * 7, 7, 6, (i + j) % 2 ? St[2] : St[3]); return; }
    if (id === 'curtains') { px(6, 4, 20, 22, Ac[0]); px(8, 6, 16, 18, Wt[3]); px(8, 6, 4, 18, Ac[3]); px(20, 6, 4, 18, Ac[3]); px(13, 10, 6, 6, Rf[2]); return; }
    if (id === 'roof') { const cs = [G[2], Wt[2], St[1]]; for (let i = 0; i < 3; i++) { g.fillStyle = cs[i]; g.beginPath(); g.moveTo(2 + i * 10, 22); g.lineTo(7 + i * 10, 10); g.lineTo(12 + i * 10, 22); g.fill(); } px(2, 22, 30, 6, Wd[3]); }
  }
  const iconURL = id => ICON_URL[id] || null;
  function mount(x) { X = x; S = x.S; MD = makeModels(x); mounted = true; sync(true); makeIcons(); return api; }
  const api = { mount, sync, lights, iconURL, models: () => MD };
  root.PFYardArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
