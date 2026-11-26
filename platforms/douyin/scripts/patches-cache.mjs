// douyin: cached static layers for GPU mini-program canvases where every drawImage call is expensive (~0.06 ms iOS, ~0.1 ms Android).
// A/B switches (set by the landing page): window.__soilCache, window.__objCache, window.__noSway. Visuals with the caches on are the
// same frame (layer = the same draws, composed once); __noSway freezes wind poses (a 低-only quality choice).
const SOIL_A = "  for (const t of allTiles) if ((t.tilled || t.crop) && onScreen(t.x, t.y, 20)) drawStack(ctx, models.soil[t.watered ? 1 : 0], t.x, t.y, 0, 0);\n  for (const d of decals) { const [sx, sy] = proj(d.x, d.y); if (sx < -8 || sx > W + 8 || sy < -4 || sy > H + 12) continue; const bob = d.bob || 0; ctx.drawImage(d.c, Math.round(sx) - (d.c.width >> 1), Math.round(sy) - d.c.height + 1 + bob); }";
const SOIL_DECALS = SOIL_A.split('\n')[1];
const soilBody = g => SOIL_A.replaceAll('ctx', g).replace('for (const d of decals) { ', 'for (const d of decals) { if (d.lily !== undefined) continue; '); // pond lilies bob: drawn live
const lilies = SOIL_DECALS.replace('for (const d of decals) { ', 'for (const d of decals) { if (d.lily === undefined) continue; ');
const HELPERS = `
// ---- douyin: cached static layers (see build patches-cache.mjs)
let PFC_ID = 0, PFC_S = null, PFC_O = null, PFC_F = 0; const PFC_HOT = new Map();
const PFC_ST = window.__pfcStats = { soilBuild: 0, objBuild: 0, soilSync: 0, objSync: 0, redraw: 0, statics: 0, dyn: 0, bad: 0, badStatic: 0, wipe: 0, wipeWhy: '', blankOff: 0 };
function pfcId(x) { return x.__pfc || (x.__pfc = ++PFC_ID); }
function pfcMix(h, v) { return (Math.imul(h ^ (v | 0), 16777619) + 0x9e3779b9) | 0; }
function pfcStr(h, s) { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; }
function pfcCam() { return pfcMix(pfcMix(pfcMix(pfcMix(CX, CY), Math.round(AQ * 1e4)), Math.round(RS * 100)), W * 4099 + H); }
// v5 拖动: layers are PFC_M px bigger than the screen on every side and remember the camera (CX, CY: whole pixels) they were drawn
// for; a pan inside the margin only moves the blit. Past half the margin a replacement is drawn in the background, a few items per
// frame (a "job"), and swapped in when done, so a drag never rebuilds a whole layer in one frame unless it outruns the margin.
const PFC_M = 128;
let PFC_S2 = null, PFC_O2 = null, PFC_SJ = null, PFC_OJ = null, PFC_POSE = 0;
function pfcCamR() { return pfcMix(pfcMix(Math.round(AQ * 1e4), Math.round(RS * 100)), W * 4099 + H); }
function pfcLayer(L) {
  const w = W + 2 * PFC_M, h = H + 2 * PFC_M;
  if (L && L.c.width === w && L.c.height === h) return L;
  const c = (L && L.c) || mk(w, h); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return { c, g, h: null, boxes: null, cx: 0, cy: 0 };
}
function pfcNear(L) { return !!L && Math.abs(CX - L.cx) <= PFC_M && Math.abs(CY - L.cy) <= PFC_M; }
function pfcFar(L) { return Math.abs(CX - L.cx) > PFC_M / 2 || Math.abs(CY - L.cy) > PFC_M / 2; }
let PFC_LX = 0, PFC_LY = 0, PFC_V = 0, PFC_VF = -1;
function pfcChunk(F, J, min) { // enough items per frame to finish before the shown layer F runs out of margin at the current pan speed
  if (PFC_VF !== realT) { PFC_VF = realT; PFC_V = Math.max(Math.abs(CX - PFC_LX), Math.abs(CY - PFC_LY)); PFC_LX = CX; PFC_LY = CY; }
  const left = PFC_M - Math.max(Math.abs(CX - F.cx), Math.abs(CY - F.cy)), frames = Math.max(1, Math.floor(left / Math.max(1, PFC_V)) - 1);
  return Math.max(min, Math.ceil((J.items.length - J.i) / frames)); }
function pfcJobStart(L, items, h, draw) { L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.clearRect(0, 0, L.c.width, L.c.height); L.h = null;
  return { L, items, i: 0, h, cx: CX, cy: CY, cam: pfcCamR(), draw, boxes: draw.boxes ? new Array(items.length * 4) : null }; }
function pfcJobRun(J, n) { // up to n more items, placed for the camera the job started at (the layer's own origin)
  const g = J.L.g, dx = CX - J.cx, dy = CY - J.cy, end = Math.min(J.items.length, J.i + n);
  g.setTransform(1, 0, 0, 1, PFC_M - dx, PFC_M - dy);
  for (; J.i < end; J.i++) J.draw(g, J.items[J.i], J, dx, dy);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return J.i >= J.items.length;
}
function pfcJobDone(J) { const L = J.L; L.h = J.h; L.cx = J.cx; L.cy = J.cy; L.boxes = J.boxes; return L; }
const PFR = { x0: 0, y0: 0, x1: 0, y1: 0, bad: false, t: null, p: null, m: [1, 0, 0, 1, 0, 0], stack: [] };
function pfcPt(x, y) { const m = PFR.m, X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
  if (X < PFR.x0) PFR.x0 = X; if (Y < PFR.y0) PFR.y0 = Y; if (X > PFR.x1) PFR.x1 = X; if (Y > PFR.y1) PFR.y1 = Y; }
function pfcBox(x, y, w, h) { pfcPt(x, y); pfcPt(x + w, y); pfcPt(x, y + h); pfcPt(x + w, y + h); }
function pfcDraw(img, a, b, c, d, e, f, g, h) { const t = PFR.t, n = arguments.length;
  if (n <= 3) { pfcBox(a, b, img.width, img.height); return t.drawImage(img, a, b); }
  if (n <= 5) { pfcBox(a, b, c, d); return t.drawImage(img, a, b, c, d); }
  pfcBox(e, f, g, h); return t.drawImage(img, a, b, c, d, e, f, g, h); }
// the recorder follows save/restore/translate/scale/setTransform/transform so flipped sprites get a tight box too
const PFR_FN = {
  drawImage: pfcDraw,
  fillRect(x, y, w, h) { pfcBox(x, y, w, h); return PFR.t.fillRect(x, y, w, h); },
  save() { PFR.stack.push(PFR.m.slice()); return PFR.t.save(); },
  restore() { if (PFR.stack.length) PFR.m = PFR.stack.pop(); return PFR.t.restore(); },
  translate(x, y) { const m = PFR.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; return PFR.t.translate(x, y); },
  scale(x, y) { const m = PFR.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; return PFR.t.scale(x, y); },
  setTransform(a, b, c, d, e, f) { PFR.m = [a, b, c, d, e, f]; return PFR.t.setTransform(a, b, c, d, e, f); },
  transform(a, b, c, d, e, f) { const m = PFR.m; PFR.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; return PFR.t.transform(a, b, c, d, e, f); },
};
const PFR_BAD = { rotate: 1, putImageData: 1, fill: 1, stroke: 1, fillText: 1, strokeText: 1, strokeRect: 1, clearRect: 1 };
function pfcRec(target) { // forwards to target, records the screen box of what is drawn
  PFR.t = target; PFR.x0 = PFR.y0 = 1e9; PFR.x1 = PFR.y1 = -1e9; PFR.bad = false; PFR.m = [1, 0, 0, 1, 0, 0]; PFR.stack.length = 0;
  if (!PFR.p) PFR.p = new Proxy({}, {
    get(_, k) { const f = PFR_FN[k]; if (f) return f; if (PFR_BAD[k]) { PFR.bad = true; PFC_ST.bad++; }
      const t = PFR.t, v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
    set(_, k, v) { PFR.t[k] = v; return true; } });
  return PFR.p;
}
function pfcSoilItems() { // tilled tiles and decals (not the bobbing lilies) under the layer's area, for the current camera
  const out = [], M = PFC_M, allTiles = HT.length ? tiles.concat(HT) : tiles;
  for (const t of allTiles) { if (!(t.tilled || t.crop)) continue; const [sx, sy] = proj(t.x, t.y);
    if (sx > -20 - M && sx < W + 20 + M && sy > -20 - M && sy < H + 110 + M) out.push({ tile: t }); }
  for (const d of decals) { if (d.lily !== undefined) continue; const [sx, sy] = proj(d.x, d.y);
    if (sx < -8 - M || sx > W + 8 + M || sy < -4 - M || sy > H + 12 + M) continue; out.push(d); }
  return out;
}
function pfcSoilDraw(g, it) {
  if (!it.tile) { const [sx, sy] = proj(it.x, it.y); g.drawImage(it.c, Math.round(sx) - (it.c.width >> 1), Math.round(sy) - it.c.height + 1 + (it.bob || 0)); }
  else drawStack(g, models.soil[it.tile.watered ? 1 : 0], it.tile.x, it.tile.y, 0, 0);
}
function pfcSoil(allTiles) {
  let h = pfcCamR(); // pan-free key: the tiles' state, not where they are on screen
  for (let i = 0; i < allTiles.length; i++) { const t = allTiles[i]; if (t.tilled || t.crop) h = pfcMix(h, i * 2 + (t.watered ? 1 : 0)); }
  h = pfcMix(h, decals.length);
  h = pfcMix(pfcMix(h, pfcId(models.soil[0])), pfcId(models.soil[1]));
  const swap = J => { PFC_S2 = PFC_S; PFC_S = pfcJobDone(J); PFC_SJ = null; PFC_ST.soilBuild++; };
  if (PFC_SJ && (PFC_SJ.h !== h || PFC_SJ.cam !== pfcCamR() || !pfcNear(PFC_SJ))) PFC_SJ = null;
  if (!(PFC_S && PFC_S.h === h && pfcNear(PFC_S))) { // the shown layer no longer fits: finish the background one, or draw now
    if (!PFC_SJ) PFC_SJ = pfcJobStart(PFC_S2 = pfcLayer(PFC_S2), pfcSoilItems(), h, pfcSoilDraw);
    pfcJobRun(PFC_SJ, 1e9); swap(PFC_SJ); PFC_ST.soilSync++;
  } else if (PFC_SJ) { if (pfcJobRun(PFC_SJ, pfcChunk(PFC_S, PFC_SJ, 40))) swap(PFC_SJ); }
  else if (pfcFar(PFC_S)) PFC_SJ = pfcJobStart(PFC_S2 = pfcLayer(PFC_S2), pfcSoilItems(), h, pfcSoilDraw);
  ctx.drawImage(PFC_S.c, CX - PFC_S.cx - PFC_M, CY - PFC_S.cy - PFC_M);
${lilies}
}
function pfcDrawOne(c, o, poseT) {
  if (o.rain) { WX.drawDrop(c, o.rain, proj); return; }
  if (o.bb) { drawBillboard(c, o); return; }
  if (o.tree) { drawTree(c, o); return; }
  if (o.ci !== undefined) { drawCrop(c, o, poseT); return; }
  if (o.spr) { drawSpr(c, o, poseT); return; }
  drawStack(c, o.m, o.x, o.y, o.z || 0, o.rot || 0);
}
function pfcObjDraw(g, o, J, dx, dy) { // one static into a (background) layer; its box is kept in the layer camera's screen space
  pfcDrawOne(pfcRec(g), o, PFC_POSE); const B = J.boxes, b = (J.i) * 4;
  if (PFR.bad) { PFC_ST.badStatic++; B[b] = -1e9; B[b + 1] = -1e9; B[b + 2] = 1e9; B[b + 3] = 1e9; }
  else { B[b] = PFR.x0 - dx; B[b + 1] = PFR.y0 - dy; B[b + 2] = PFR.x1 - dx; B[b + 3] = PFR.y1 - dy; }
}
pfcObjDraw.boxes = true;
function pfcObjects(list, poseT) { // statics composed once into a layer; each moving thing is drawn over it, then the statics in front of it
  const ns = !!window.__noSway; PFC_F++; PFC_POSE = poseT; // that it overlaps are drawn again, so the stacking order stays the same
  if (PFC_HOT.size > 4000) PFC_HOT.clear();
  const cand = [], kind = new Uint8Array(list.length); // kind: 0 moving, 1 static
  for (let i = 0; i < list.length; i++) { const o = list[i];
    if (o.rain || o.bb || o.partyKey || (o.spr && o.w && !o.sway) || (o.ci !== undefined && o.glow) || (!ns && (o.tree || o.ci !== undefined || (o.spr && o.sway)))) continue;
    let sub;
    if (o.tree) { // frozen pose and no lean: the tree's cached look cannot change, so skip re-keying it (the key string is costly)
      const still = Math.abs(o.lean || 0) < 1e-3, k0 = o._ck;
      if (ns && still && k0 && k0.__pfcStill && k0.__pfcKey === k0.key) sub = k0.__pfcH;
      else { const k = treeCache(o, treePoseT(o)); sub = k.__pfcH = pfcStr(pfcId(k), k.key); k.__pfcKey = k.key; k.__pfcStill = still; } }
    else if (o.ci !== undefined) sub = 9e5 + o.ci * 4 + (o.giant ? 2 : 0) + (o.flip ? 1 : 0);
    else if (o.spr) sub = pfcMix(pfcId(o.spr), (o.lift || 0) * 64 + (o.sway ? 7 : 0));
    else { const a = AQ + (o.rot || 0), k = (o.m._ck && o.m._ck.get(a)) || stackCanvas(o.m, a); sub = pfcMix(pfcId(k), Math.round(o.z || 0)); } // no LRU touch per frame
    // a thing whose look keeps changing (a tree being shaken or chopped, an animated sign) is drawn as moving for a while,
    // so it does not force the whole layer to be rebuilt every frame
    const key = (o.tree ? 1 : o.spr ? 2 : o.ci !== undefined ? 3 : 4) * 1e11 + (Math.round(o.x * 4) + 50000) * 1e5 + Math.round(o.y * 4) + 50000;
    const e = PFC_HOT.get(key); if (!e) PFC_HOT.set(key, { h: sub, hot: 0 }); else if (e.h !== sub) { e.h = sub; e.hot = PFC_F + 45; }
    if (e && e.hot > PFC_F) continue;
    const p = proj(o.x, o.y); kind[i] = 1; cand.push(i, sub, Math.round(p[0]) - CX, Math.round(p[1]) - CY); }
  const camR = pfcCamR(), M = PFC_M;
  const pick = (cx0, cy0) => { // the statics under a layer drawn for camera (cx0, cy0), and a pan-free key of them
    const st = []; let h = camR;
    for (let k = 0; k < cand.length; k += 4) { const x = cand[k + 2] + cx0, y = cand[k + 3] + cy0;
      if (x < -M - 80 || x > W + M + 80 || y < -M - 80 || y > H + M + 170) continue;
      st.push(cand[k]); h = pfcMix(pfcMix(pfcMix(h, cand[k + 2]), cand[k + 3]), cand[k + 1]); }
    return { st, h: pfcMix(h, st.length) }; };
  const start = () => { const s0 = pick(CX, CY); return pfcJobStart(PFC_O2 = pfcLayer(PFC_O2), s0.st.map(i => list[i]), s0.h, pfcObjDraw); };
  const swap = J => { PFC_O2 = PFC_O; PFC_O = pfcJobDone(J); PFC_OJ = null; PFC_ST.objBuild++; };
  if (PFC_OJ && (PFC_OJ.cam !== camR || !pfcNear(PFC_OJ) || pick(PFC_OJ.cx, PFC_OJ.cy).h !== PFC_OJ.h)) PFC_OJ = null;
  let sel = PFC_O && pfcNear(PFC_O) ? pick(PFC_O.cx, PFC_O.cy) : null;
  if (!sel || sel.h !== PFC_O.h) { // the shown layer no longer fits: finish the background one, or draw it now
    if (!PFC_OJ) PFC_OJ = start();
    PFC_ST.badStatic = 0; pfcJobRun(PFC_OJ, 1e9); swap(PFC_OJ); PFC_ST.objSync++; sel = pick(PFC_O.cx, PFC_O.cy);
  } else if (PFC_OJ) { if (pfcJobRun(PFC_OJ, pfcChunk(PFC_O, PFC_OJ, 30))) { swap(PFC_OJ); sel = pick(PFC_O.cx, PFC_O.cy); } }
  else if (pfcFar(PFC_O)) PFC_OJ = start();
  const st = sel.st, ox = CX - PFC_O.cx, oy = CY - PFC_O.cy;
  tick('o.hash');
  ctx.drawImage(PFC_O.c, ox - M, oy - M); tick('o.cache');
  const B = PFC_O.boxes; let j = 0, dyn = 0, redraw = 0;
  for (let i = 0; i < list.length; i++) {
    if (j < st.length && st[j] === i) { j++; continue; }
    if (kind[i]) continue; // a static outside the layer's area: off screen
    const o = list[i]; { const p = proj(o.x, o.y); if (p[0] < -100 || p[0] > W + 100 || p[1] < -100 || p[1] > H + 190) continue; } // the list reaches past the screen for the layer margin
    dyn++; pfcDrawOne(pfcRec(ctx), o, poseT);
    if (PFR.x1 < PFR.x0 && !PFR.bad) continue;
    const bad = PFR.bad, x0 = PFR.x0 - ox, y0 = PFR.y0 - oy, x1 = PFR.x1 - ox, y1 = PFR.y1 - oy;
    let clipped = false; // redraw only inside the moving thing's box, so statics keep their order among themselves
    for (let q = j; q < st.length; q++) { const b = q * 4;
      if (bad || (B[b] < x1 && x0 < B[b + 2] && B[b + 1] < y1 && y0 < B[b + 3])) {
        if (!clipped && !bad) { clipped = true; ctx.save(); ctx.beginPath(); ctx.rect(Math.floor(PFR.x0), Math.floor(PFR.y0), Math.ceil(PFR.x1) - Math.floor(PFR.x0), Math.ceil(PFR.y1) - Math.floor(PFR.y0)); ctx.clip(); }
        pfcDrawOne(ctx, list[st[q]], poseT); redraw++; } }
    if (clipped) ctx.restore(); }
  tick('o.dyn'); PFC_ST.statics = st.length; PFC_ST.dyn = dyn; PFC_ST.redraw = redraw;
}
`;
export const CACHE_PATCHES = [
  // the object list reaches 2 margins (+60) past the screen while the cached layer is on: a layer drawn up to 1 margin away covers
  // 1 margin (+80) around its own screen, and all of that must stay in the list for its key to stay the same
  ['function onScreen(x, y, pad) { const [sx, sy] = proj(x, y); return sx > -pad', 'function onScreen(x, y, pad) { pad += window.__pfcPadX || 0; const [sx, sy] = proj(x, y); return sx > -pad'],
  ['  const list = [];\n  if (WX && WX.eachDrop)', '  window.__pfcPadX = window.__objCache ? 316 : 0; const list = [];\n  if (WX && WX.eachDrop)'],
  ['  if (FOG.on && !FOG.empty && !FOG.peek) { let n = 0; for (const o of list)', '  window.__pfcPadX = 0;\n  if (FOG.on && !FOG.empty && !FOG.peek) { let n = 0; for (const o of list)'],
  [SOIL_A, `  if (window.__soilCache) pfcSoil(allTiles); else {\n${SOIL_A} }`],
  ['  for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }', '  if (window.__objCache) pfcObjects(list, poseT); else for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }'],
  // the shadow mask is only read by (gpu)applyShadows: skip building it when shadows are off (低)
  ['  for (const o of list) { if (o.flat || o.ci !== undefined) continue; if (o.bb) { bbShadow(sctx, o); continue; }', '  if (night < 0.9 && !window.__trialNoShadow) for (const o of list) { if (o.flat || o.ci !== undefined) continue; if (window.__objCache) { const q = proj(o.x, o.y); if (q[0] < -100 || q[0] > W + 100 || q[1] < -100 || q[1] > H + 190) continue; } if (o.bb) { bbShadow(sctx, o); continue; }'],
  ['function treePoseT(o) { return Math.floor(realT * 10 + o.tick) / 10; }', 'function treePoseT(o) { return window.__noSway ? 0 : Math.floor(realT * 10 + o.tick) / 10; }'],
  // 低: wind poses (render only) frozen at rest, so trees and crops can live in the cached layer
  ['function windPose(x, y, t) { // unrounded unit sway at a point: downwind px, upward lift\n', 'function windPose(x, y, t) { // unrounded unit sway at a point: downwind px, upward lift\n  if (window.__noSway) return [0, 0];\n'],
  ['function drawTree(c, o) {', HELPERS + 'function drawTree(c, o) {'],
];

// ---- v5: water every Nth frame at 低, blank-cache false positives, cached fish sprite canvas
const WATER_WRAP = `// douyin: at 低 the pond/sea animation is recomputed every window.__waterEvery frames; in between the last result is put back
// (same camera and box only), which skips the full-box getImageData read-back on the frames in between
const PFW = {}; let PFW_LAST = null;
function paintWater(t, box, key) {
  const [bx, by, bw, bh] = box; if (bw <= 0 || bh <= 0) return;
  // the key is relative to the camera, so while the map is dragged the last water is moved along with it instead of recomputed
  const WS = PFW[key] || (PFW[key] = { n: 0, img: null, cam: '' }), cam = (bx - CX) + ',' + (by - CY) + ',' + AQ + ',' + bw + ',' + bh, every = window.__waterEvery || 1, drag = !!window.__dragging;
  if ((every > 1 || drag) && WS.img && WS.cam === cam && (drag || (++WS.n % every) !== 0)) {
    const sx = bx - WS.bx, sy = by - WS.by;
    if (WS.img !== 1) ctx.putImageData(WS.img, bx, by);
    for (const p of WS.decor) pondDecor.push(sx || sy ? [p[0] + sx, p[1] + sy].concat(p.slice(2)) : p);
    for (const p of WS.leaves) pondLeaves.push(sx || sy ? [p[0] + sx, p[1] + sy].concat(p.slice(2)) : p);
    return; }
  const d0 = pondDecor.length, l0 = pondLeaves.length; PFW_LAST = null;
  paintWater0(t, box, key);
  WS.img = PFW_LAST || 1; WS.cam = cam; WS.n = 0; WS.bx = bx; WS.by = by; WS.decor = pondDecor.slice(d0); WS.leaves = pondLeaves.slice(l0);
}
function paintWater0(t, box, key) {`;
export const V5_PATCHES = [
  ['function paintWater(t, box, key) {', WATER_WRAP],
  ['  ctx.putImageData(img, bx, by);\n}', '  ctx.putImageData(img, bx, by); PFW_LAST = img;\n}'],
  // the 3 s blank-cache check rebuilds every stack and tree canvas when it fires; count it (panel) and, if a rebuild does not
  // make the check pass (a read-back that just reads empty on this canvas engine, while the farm visibly renders), stop checking
  ['function rebuildCaches(why) {\n', 'function rebuildCaches(why) {\n  if (window.__pfcStats) { window.__pfcStats.wipe++; window.__pfcStats.wipeWhy = String(why).slice(0, 12); }\n'],
  ["setInterval(() => { if (!document.hidden && cacheBlank()) rebuildCaches('blank cache detected'); }, 3000);",
   "let PF_BLANK = 0; setInterval(() => { if (document.hidden || window.__blankOff) return; if (!cacheBlank()) { PF_BLANK = 0; return; } if (++PF_BLANK > 2) { window.__blankOff = 1; if (window.__pfcStats) window.__pfcStats.blankOff = 1; return; } rebuildCaches('blank cache detected'); }, 3000);"],
];
export const ICON_PATCHES = [
  // fishing: blit made a new canvas from the same sprite every frame; keep one per sprite
  ['    const c = canvasOf(img); if (!c) return;\n    const s = (opt && opt.scale) || 1', '    const c = img.__cv || (img.__cv = canvasOf(img)); if (!c) return;\n    const s = (opt && opt.scale) || 1'],
];
