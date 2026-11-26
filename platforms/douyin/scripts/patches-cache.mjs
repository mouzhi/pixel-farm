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
const PFC_ST = window.__pfcStats = { soilBuild: 0, objBuild: 0, soilSync: 0, objSync: 0, objWhy: '', soilWhy: '', redraw: 0, statics: 0, dyn: 0, bad: 0, badStatic: 0, wipe: 0, wipeWhy: '', blankOff: 0, patch: 0, patchDraws: 0, objPatchWhy: '', soilPatchWhy: '', treeChg: 0, treeShare: 0, stkEvict: 0 };
function pfcId(x) { return x.__pfc || (x.__pfc = ++PFC_ID); }
function pfcMix(h, v) { return (Math.imul(h ^ (v | 0), 16777619) + 0x9e3779b9) | 0; }
function pfcStr(h, s) { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; }
function pfcCam() { return pfcMix(pfcMix(pfcMix(pfcMix(CX, CY), Math.round(AQ * 1e4)), Math.round(RS * 100)), W * 4099 + H); }
// v5 拖动: layers are PFC_M px bigger than the screen on every side and remember the camera (CX, CY: whole pixels) they were drawn
// for; a pan inside the margin only moves the blit. Past half the margin a replacement is drawn in the background, a few items per
// frame (a "job"), and swapped in when done, so a drag never rebuilds a whole layer in one frame unless it outruns the margin.
const PFC_M = 64; // v6: was 128 (2.5x the screen's pixels per layer at 309x651; 64 is 1.7x)
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
function pfcJobStart(L, sel, h, raw) { L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.clearRect(0, 0, L.c.width, L.c.height); L.h = null;
  return { L, items: sel.items, keys: sel.keys, sig: sel.sig, i: 0, h: h === null ? sel.h : h, cx: CX, cy: CY, cam: pfcCamR(), raw, boxes: new Array(sel.items.length * 4) }; }
function pfcRecDraw(g, J, dx, dy) { J.raw(pfcRec(g), J.items[J.i]); const B = J.boxes, b = J.i * 4; // every item's box is kept (layer camera's screen space) for patches
  if (PFR.bad) { PFC_ST.badStatic++; B[b] = -1e9; B[b + 1] = -1e9; B[b + 2] = 1e9; B[b + 3] = 1e9; }
  else { B[b] = PFR.x0 - dx; B[b + 1] = PFR.y0 - dy; B[b + 2] = PFR.x1 - dx; B[b + 3] = PFR.y1 - dy; } }
function pfcJobRun(J, n) { // up to n more items, placed for the camera the job started at (the layer's own origin)
  const g = J.L.g, dx = CX - J.cx, dy = CY - J.cy, end = Math.min(J.items.length, J.i + n);
  g.setTransform(1, 0, 0, 1, PFC_M - dx, PFC_M - dy);
  for (; J.i < end; J.i++) pfcRecDraw(g, J, dx, dy);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return J.i >= J.items.length;
}
function pfcJobDone(J) { const L = J.L; L.h = J.h; L.cx = J.cx; L.cy = J.cy; L.boxes = J.boxes; L.sig = J.sig; L.keys = J.keys; L.kmap = null; L.camR = J.cam; L.items = J.items; return L; }
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
function pfcSoilItems(cx0, cy0) { // tilled tiles and decals (not the bobbing lilies) under a layer drawn for camera (cx0, cy0); pan-free keys
  const items = [], keys = [], sig = [], M = PFC_M, ox = cx0 - CX, oy = cy0 - CY, allTiles = HT.length ? tiles.concat(HT) : tiles;
  for (const t of allTiles) { if (!(t.tilled || t.crop)) continue; const p = proj(t.x, t.y), sx = p[0] + ox, sy = p[1] + oy;
    if (sx > -20 - M && sx < W + 20 + M && sy > -20 - M && sy < H + 110 + M) { items.push({ tile: t }); keys.push(pfcId(t)); sig.push(t.watered ? 1 : 0, Math.round(p[0]) - CX, Math.round(p[1]) - CY); } }
  for (const d of decals) { if (d.lily !== undefined) continue; const p = proj(d.x, d.y), sx = p[0] + ox, sy = p[1] + oy;
    if (sx < -8 - M || sx > W + 8 + M || sy < -4 - M || sy > H + 12 + M) continue; items.push(d); keys.push(-pfcId(d)); sig.push(pfcId(d.c), Math.round(p[0]) - CX, Math.round(p[1]) - CY); }
  return { items, keys, sig };
}
function pfcSoilDraw(g, it) {
  if (!it.tile) { const [sx, sy] = proj(it.x, it.y); g.drawImage(it.c, Math.round(sx) - (it.c.width >> 1), Math.round(sy) - it.c.height + 1 + (it.bob || 0)); }
  else drawStack(g, models.soil[it.tile.watered ? 1 : 0], it.tile.x, it.tile.y, 0, 0);
}
function pfcSoilName(it) { return it.tile ? 'tile' + (it.tile.watered ? '(wet)' : '') : 'decal'; }
// v6: a few things that changed (a tile watered, a crop grown, a decal added) are patched into the shown layer: their old and new
// boxes are cleared and every static under them redrawn in order, clipped to the box. Only many changes rebuild the whole layer.
let PFC_PG = null, PFC_PW = '';
function pfcProbe(raw, it, dx, dy, B, b) { // the box (layer coordinates) of one item, drawn into a 1x1 scratch canvas
  if (!PFC_PG) PFC_PG = mk(1, 1).getContext('2d');
  PFC_PG.setTransform(1, 0, 0, 1, 0, 0); raw(pfcRec(PFC_PG), it);
  if (PFR.bad) { B[b] = -1e9; B[b + 1] = -1e9; B[b + 2] = 1e9; B[b + 3] = 1e9; }
  else { B[b] = PFR.x0 - dx; B[b + 1] = PFR.y0 - dy; B[b + 2] = PFR.x1 - dx; B[b + 3] = PFR.y1 - dy; } }
function pfcPatch(L, sel, raw, name) { // false: too much changed (PFC_PW: the first change, for the panel)
  if (!L.kmap) { L.kmap = new Map(); for (let q = 0; q < L.keys.length; q++) L.kmap.set(L.keys[q], q); }
  const n = sel.keys.length, B = new Array(n * 4), OB = L.boxes, R = [], seen = new Uint8Array(L.keys.length), dx = CX - L.cx, dy = CY - L.cy, a = L.sig, s = sel.sig;
  let first = '', ok = true;
  for (let q = 0; q < n; q++) { const o = L.kmap.get(sel.keys[q]), b = q * 4;
    if (o !== undefined && !seen[o]) { seen[o] = 1;
      if (a[o * 3] === s[q * 3] && a[o * 3 + 1] === s[q * 3 + 1] && a[o * 3 + 2] === s[q * 3 + 2]) { B[b] = OB[o * 4]; B[b + 1] = OB[o * 4 + 1]; B[b + 2] = OB[o * 4 + 2]; B[b + 3] = OB[o * 4 + 3]; continue; }
      R.push(OB[o * 4], OB[o * 4 + 1], OB[o * 4 + 2], OB[o * 4 + 3]); if (!first) first = (a[o * 3] !== s[q * 3] ? 'look:' : 'pos:') + name(sel.items[q]); }
    else if (!first) first = 'add:' + name(sel.items[q]);
    if (R.length > 96) { ok = false; break; }
    pfcProbe(raw, sel.items[q], dx, dy, B, b); R.push(B[b], B[b + 1], B[b + 2], B[b + 3]); }
  if (ok) for (let o = 0; o < L.keys.length; o++) if (!seen[o]) { R.push(OB[o * 4], OB[o * 4 + 1], OB[o * 4 + 2], OB[o * 4 + 3]); if (!first) first = 'gone:' + name(L.items[o]); }
  PFC_PW = first || 'order';
  if (!ok || R.length > 96) return false;
  for (let r = 0; r < R.length; r += 4) if (R[r + 2] - R[r] > W || R[r + 3] - R[r + 1] > H) return false; // a box of unknown extent
  const g = L.g; let nd = 0;
  for (let r = 0; r < R.length; r += 4) { if (!(R[r + 2] > R[r] && R[r + 3] > R[r + 1])) continue; // drew nothing
    const x0 = Math.floor(R[r]) - 1, y0 = Math.floor(R[r + 1]) - 1, x1 = Math.ceil(R[r + 2]) + 1, y1 = Math.ceil(R[r + 3]) + 1;
    g.save(); g.setTransform(1, 0, 0, 1, PFC_M, PFC_M); g.clearRect(x0, y0, x1 - x0, y1 - y0); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.translate(-dx, -dy);
    for (let q = 0; q < n; q++) { const b = q * 4; if (B[b] < x1 && x0 < B[b + 2] && B[b + 1] < y1 && y0 < B[b + 3]) { raw(g, sel.items[q]); nd++; } }
    g.restore(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  L.boxes = B; L.keys = sel.keys; L.sig = sel.sig; L.items = sel.items; L.h = sel.h; L.kmap = null; PFC_ST.patch++; PFC_ST.patchDraws += nd;
  return true;
}
function pfcSoil(allTiles) {
  const camR = pfcCamR(); let h = camR; // pan-free key: the tiles' state, not where they are on screen
  for (let i = 0; i < allTiles.length; i++) { const t = allTiles[i]; if (t.tilled || t.crop) h = pfcMix(h, i * 2 + (t.watered ? 1 : 0)); }
  h = pfcMix(h, decals.length);
  h = pfcMix(pfcMix(h, pfcId(models.soil[0])), pfcId(models.soil[1]));
  const swap = J => { PFC_S2 = PFC_S; PFC_S = pfcJobDone(J); PFC_SJ = null; PFC_ST.soilBuild++; };
  const start = () => pfcJobStart(PFC_S2 = pfcLayer(PFC_S2), pfcSoilItems(CX, CY), h, pfcSoilDraw);
  const fit = () => { if (PFC_S.h === h) return true; const s = pfcSoilItems(PFC_S.cx, PFC_S.cy); s.h = h;
    if (pfcPatch(PFC_S, s, pfcSoilDraw, pfcSoilName)) { PFC_ST.soilPatchWhy = PFC_PW; return true; } return false; };
  const full = why => { PFC_SJ = start(); pfcJobRun(PFC_SJ, 1e9); swap(PFC_SJ); PFC_ST.soilSync++; PFC_ST.soilWhy = why; };
  if (PFC_SJ && (PFC_SJ.cam !== camR || !pfcNear(PFC_SJ))) PFC_SJ = null;
  if (!(PFC_S && PFC_S.camR === camR && pfcNear(PFC_S) && fit())) { // the shown layer no longer fits: finish the background one, or draw now
    const why = !PFC_S ? 'first' : PFC_S.camR !== camR ? 'cam(angle/zoom/size)' : !pfcNear(PFC_S) ? 'pan>margin' : 'many:' + PFC_PW;
    if (PFC_SJ) { pfcJobRun(PFC_SJ, 1e9); swap(PFC_SJ); PFC_ST.soilSync++; PFC_ST.soilWhy = why; if (!fit()) full('many:' + PFC_PW); } else full(why);
  } else if (PFC_SJ) { if (pfcJobRun(PFC_SJ, pfcChunk(PFC_S, PFC_SJ, 40))) { swap(PFC_SJ); if (!fit()) full('many:' + PFC_PW); } }
  else if (pfcFar(PFC_S)) { PFC_SJ = start(); PFC_ST.soilWhy = 'pan'; }
  ctx.drawImage(PFC_S.c, CX - PFC_S.cx - PFC_M, CY - PFC_S.cy - PFC_M);
${lilies}
}
function pfcDrawOne(c, o, poseT) {
  if (o.rain) { WX.drawDrop(c, o.rain, proj); return; }
  if (o.bb) { drawBillboard(c, o); return; }
  if (o.tree) { const k = treeCache(o, treePoseT(o)), p = proj(o.x, o.y); c.drawImage(k.c, Math.round(p[0]) - k.ox, Math.round(p[1]) - k.oy); return; } // no on-screen cull: layers reach past the screen
  if (o.ci !== undefined) { drawCrop(c, o, poseT); return; }
  if (o.spr) { drawSpr(c, o, poseT); return; }
  drawStack(c, o.m, o.x, o.y, o.z || 0, o.rot || 0);
}
function pfcObjRaw(g, o) { pfcDrawOne(g, o, PFC_POSE); }
function pfcObjName(o) { return o.tree ? 'tree' : o.ci !== undefined ? 'crop' : o.spr ? 'spr' + o.spr.width + 'x' + o.spr.height : o.m ? 'stack' + o.m.w + 'x' + o.m.d + 'x' + o.m.h : '?'; }
function pfcObjects(list, poseT) { // statics composed once into a layer; each moving thing is drawn over it, then the statics in front of it
  const ns = !!window.__noSway; PFC_F++; PFC_POSE = poseT; // that it overlaps are drawn again, so the stacking order stays the same
  if (PFC_HOT.size > 4000) PFC_HOT.clear();
  const cand = [], kind = new Uint8Array(list.length); // kind: 0 moving, 1 static
  for (let i = 0; i < list.length; i++) { const o = list[i];
    if (o.rain || o.bb || o.partyKey || (o.spr && o.w && !o.sway) || (o.ci !== undefined && o.glow) || (!ns && (o.tree || o.ci !== undefined || (o.spr && o.sway)))) continue;
    let sub;
    if (o.tree) { // frozen pose and no lean: the tree's cached look cannot change, so skip re-keying it (the key string is costly)
      const still = ns || Math.abs(o.lean || 0) < 1e-3, k0 = o._ck;
      if (ns && still && k0 && k0.__pfcStill && k0.__pfcKey === k0.key) sub = k0.__pfcH;
      else { const k = treeCache(o, treePoseT(o)); sub = k.__pfcH = pfcStr(pfcId(k), k.key); k.__pfcKey = k.key; k.__pfcStill = still; } }
    else if (o.ci !== undefined) sub = 9e5 + o.ci * 4 + (o.giant ? 2 : 0) + (o.flip ? 1 : 0);
    else if (o.spr) sub = pfcMix(pfcId(o.spr), (o.lift || 0) * 64 + (o.sway ? 7 : 0));
    else { const a = AQ + (o.rot || 0), k = (o.m._ck && o.m._ck.get(a)) || stackCanvas(o.m, a); sub = pfcMix(pfcId(k), Math.round(o.z || 0)); } // no LRU touch per frame
    // a thing whose look changes once (a crop grows) is patched into the layer; one that keeps changing (a tree being shaken or
    // chopped, an animated sign) is drawn as moving for a while instead
    const key = (o.tree ? 1 : o.spr ? 2 : o.ci !== undefined ? 3 : 4) * 1e11 + (Math.round(o.x * 4) + 50000) * 1e5 + Math.round(o.y * 4) + 50000 + ((o.z | 0) & 255) / 512;
    const e = PFC_HOT.get(key); if (!e) PFC_HOT.set(key, { h: sub, hot: 0, chg: -1e9 }); else if (e.h !== sub) { e.h = sub; if (PFC_F - e.chg < 45) e.hot = PFC_F + 45; e.chg = PFC_F; }
    if (e && e.hot > PFC_F) continue;
    const p = proj(o.x, o.y); kind[i] = 1; cand.push(i, sub, Math.round(p[0]) - CX, Math.round(p[1]) - CY, key); }
  const camR = pfcCamR(), M = PFC_M;
  const pick = (cx0, cy0) => { // the statics under a layer drawn for camera (cx0, cy0), and a pan-free key of them
    const st = [], keys = [], sig = []; let h = camR;
    for (let k = 0; k < cand.length; k += 5) { const x = cand[k + 2] + cx0, y = cand[k + 3] + cy0;
      if (x < -M - 80 || x > W + M + 80 || y < -M - 80 || y > H + M + 170) continue;
      st.push(cand[k]); keys.push(cand[k + 4]); sig.push(cand[k + 1], cand[k + 2], cand[k + 3]); h = pfcMix(pfcMix(pfcMix(h, cand[k + 2]), cand[k + 3]), cand[k + 1]); }
    return { st, keys, sig, h: pfcMix(h, st.length), items: null }; };
  const withItems = s => { s.items = s.st.map(i => list[i]); return s; };
  const swap = J => { PFC_O2 = PFC_O; PFC_O = pfcJobDone(J); PFC_OJ = null; PFC_ST.objBuild++; };
  const start = () => pfcJobStart(PFC_O2 = pfcLayer(PFC_O2), withItems(pick(CX, CY)), null, pfcObjRaw);
  const fit = () => { const s = pick(PFC_O.cx, PFC_O.cy); if (s.h === PFC_O.h) return s;
    if (pfcPatch(PFC_O, withItems(s), pfcObjRaw, pfcObjName)) { PFC_ST.objPatchWhy = PFC_PW; return s; } return null; };
  const full = why => { PFC_OJ = start(); PFC_ST.badStatic = 0; pfcJobRun(PFC_OJ, 1e9); swap(PFC_OJ); PFC_ST.objSync++; PFC_ST.objWhy = why; return pick(PFC_O.cx, PFC_O.cy); };
  if (PFC_OJ && (PFC_OJ.cam !== camR || !pfcNear(PFC_OJ))) PFC_OJ = null; // a changed item no longer drops the job: it is patched after the swap
  const near = PFC_O && PFC_O.camR === camR && pfcNear(PFC_O);
  const s0 = near ? pick(PFC_O.cx, PFC_O.cy) : null;
  tick('o.hash');
  let sel = s0 && s0.h === PFC_O.h ? s0 : near ? fit() : null;
  if (!sel) { // the shown layer no longer fits: finish the background one, or draw it now
    const why = !PFC_O ? 'first' : PFC_O.camR !== camR ? 'cam(angle/zoom/size)' : !near ? 'pan>margin' : 'many:' + PFC_PW;
    if (PFC_OJ) { pfcJobRun(PFC_OJ, 1e9); swap(PFC_OJ); PFC_ST.objSync++; PFC_ST.objWhy = why; sel = fit() || full('many:' + PFC_PW); } else sel = full(why);
  } else if (PFC_OJ) { if (pfcJobRun(PFC_OJ, pfcChunk(PFC_O, PFC_OJ, 30))) { swap(PFC_OJ); sel = fit() || full('many:' + PFC_PW); } }
  else if (pfcFar(PFC_O)) { PFC_OJ = start(); PFC_ST.objWhy = 'pan'; }
  const st = sel.st, ox = CX - PFC_O.cx, oy = CY - PFC_O.cy;
  tick('o.build');
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
  ['  const list = [];\n  if (WX && WX.eachDrop)', '  window.__pfcPadX = window.__objCache && !window.__pfcAlbum ? 2 * 64 + 60 : 0; const list = [];\n  if (WX && WX.eachDrop)'],
  ['  if (FOG.on && !FOG.empty && !FOG.peek) { let n = 0; for (const o of list)', '  window.__pfcPadX = 0;\n  if (FOG.on && !FOG.empty && !FOG.peek) { let n = 0; for (const o of list)'],
  [SOIL_A, `  if (window.__soilCache && !window.__pfcAlbum) pfcSoil(allTiles); else {\n${SOIL_A} }`],
  ['  for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }', '  if (window.__objCache && !window.__pfcAlbum) pfcObjects(list, poseT); else for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }'],
  // the shadow mask is only read by (gpu)applyShadows: skip building it when shadows are off (低)
  ['  for (const o of list) { if (o.flat || o.ci !== undefined) continue; if (o.bb) { bbShadow(sctx, o); continue; }', '  if (night < 0.9 && !window.__trialNoShadow) for (const o of list) { if (o.flat || o.ci !== undefined) continue; if (window.__objCache) { const q = proj(o.x, o.y); if (q[0] < -100 || q[0] > W + 100 || q[1] < -100 || q[1] > H + 190) continue; } if (o.bb) { bbShadow(sctx, o); continue; }'],
  ['function treePoseT(o) { return Math.floor(realT * 10 + o.tick) / 10; }', 'function treePoseT(o) { return window.__noSway ? 0 : Math.floor(realT * 10 + o.tick) / 10; }'],
  // 低: wind poses (render only) frozen at rest, so trees and crops can live in the cached layer
  // v6: the gust lean (render only) is frozen too, or every gust changes every tree's picture and the layer has to follow
  ['let dx = Math.round(wx * p.w + o.lean * (p.bend ?? p.w))', 'let dx = Math.round(wx * p.w + (window.__noSway ? 0 : o.lean) * (p.bend ?? p.w))'],
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
  // v6: an album photo renders the farm at another spot (and maybe size) for one frame: the layers are left alone (drawn uncached)
  ["albumBusy = 1; const w0 = W, h0 = H,", "albumBusy = 1; window.__pfcAlbum = 1; const w0 = W, h0 = H,"],
  ["render(); albumBusy = 0; }", "render(); albumBusy = 0; window.__pfcAlbum = 0; }"],
  ["try { albumFlush(); } catch (e) { albumBusy = 0; } }", "try { albumFlush(); } catch (e) { albumBusy = 0; window.__pfcAlbum = 0; } }"],
  // v6: with wind frozen (低) a tree's picture depends only on its kind and its key (angle + clump offsets), so trees share one
  // canvas per (kind, key): a fruit tree that ripens or is picked swaps to an existing picture instead of making a new canvas
  ["  const k = o._ck || (o._ck = {});\n  if (k.key !== key) {", "  let k = o._ck;\n  if (window.__noSway) { const m = PFT.get(T) || (PFT.set(T, new Map()), PFT.get(T)); k = m.get(key);\n    if (!k) { if (m.size > 12) m.clear(); m.set(key, k = { shared: 1 }); } else if (k !== o._ck && window.__pfcStats) window.__pfcStats.treeShare++; o._ck = k; }\n  else if (!k || k.shared) k = o._ck = {};\n  if (k.key !== key) {"],
  ["function treeCache(o, poseT) {", "const PFT = new Map(); // douyin v6: shared tree pictures\nfunction treeCache(o, poseT) {"],
  // a shared picture is never freed by one tree (others still draw it)
  ["function setView(o, t) {\n  if (o._ck && o._ck.c) o._ck.c.width", "function setView(o, t) {\n  if (window.__pfcStats) window.__pfcStats.treeChg++;\n  if (o._ck && o._ck.c && !o._ck.shared) o._ck.c.width"],
  ["function resetTreeViews() { for (const o of TV.values()) if (o._ck && o._ck.c) o._ck", "function resetTreeViews() { PFT.clear(); for (const o of TV.values()) if (o._ck && o._ck.c && !o._ck.shared) o._ck"],
  ["dropTree: id => { const o = TV.get(id); if (o && o._ck && o._ck.c) o._ck", "dropTree: id => { const o = TV.get(id); if (o && o._ck && o._ck.c && !o._ck.shared) o._ck"],
  ["  for (const p of props) if (p.tree) p._ck = null; for (const o of TV.values()) o._ck = null;", "  PFT.clear(); for (const p of props) if (p.tree) p._ck = null; for (const o of TV.values()) o._ck = null;"],
  // panel: stack pictures dropped by the LRU (they get rebuilt when shown again)
  ["const [ok, om] = STK.entries().next().value; STK.delete(ok);", "const [ok, om] = STK.entries().next().value; STK.delete(ok); if (window.__pfcStats) window.__pfcStats.stkEvict++;"],
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
