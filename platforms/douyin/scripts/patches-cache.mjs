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
const PFC_ST = window.__pfcStats = { soilBuild: 0, objBuild: 0, redraw: 0, statics: 0, dyn: 0, bad: 0, badStatic: 0 };
function pfcId(x) { return x.__pfc || (x.__pfc = ++PFC_ID); }
function pfcMix(h, v) { return (Math.imul(h ^ (v | 0), 16777619) + 0x9e3779b9) | 0; }
function pfcStr(h, s) { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; }
function pfcCam() { return pfcMix(pfcMix(pfcMix(pfcMix(CX, CY), Math.round(AQ * 1e4)), Math.round(RS * 100)), W * 4099 + H); }
function pfcLayer(L) {
  if (L && L.c.width === W && L.c.height === H) return L;
  const c = (L && L.c) || mk(W, H); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return { c, g, h: null, boxes: null };
}
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
function pfcSoil(allTiles) {
  let h = pfcCam();
  for (let i = 0; i < allTiles.length; i++) { const t = allTiles[i]; if (t.tilled || t.crop) h = pfcMix(h, i * 2 + (t.watered ? 1 : 0)); }
  h = pfcMix(h, decals.length);
  h = pfcMix(pfcMix(h, pfcId(models.soil[0])), pfcId(models.soil[1]));
  PFC_S = pfcLayer(PFC_S);
  if (PFC_S.h !== h) { const g = PFC_S.g; g.clearRect(0, 0, W, H);
${soilBody('g')}
    PFC_S.h = h; PFC_ST.soilBuild++; }
  ctx.drawImage(PFC_S.c, 0, 0);
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
function pfcObjects(list, poseT) { // statics composed once into a layer; each moving thing is drawn over it, then the statics in front of it
  const ns = !!window.__noSway;            // that it overlaps are drawn again, so the stacking order stays the same as one-by-one
  let h = pfcCam(); const st = []; PFC_F++;
  if (PFC_HOT.size > 4000) PFC_HOT.clear();
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
    st.push(i); const p = proj(o.x, o.y); h = pfcMix(pfcMix(pfcMix(h, Math.round(p[0])), Math.round(p[1])), sub); }
  h = pfcMix(h, st.length); tick('o.hash');
  PFC_O = pfcLayer(PFC_O);
  if (PFC_O.h !== h) { const g = PFC_O.g, boxes = new Array(st.length * 4); g.clearRect(0, 0, W, H); PFC_ST.badStatic = 0;
    for (let j = 0; j < st.length; j++) { pfcDrawOne(pfcRec(g), list[st[j]], poseT);
      if (PFR.bad) { PFC_ST.badStatic++; boxes[j * 4] = -1e9; boxes[j * 4 + 1] = -1e9; boxes[j * 4 + 2] = 1e9; boxes[j * 4 + 3] = 1e9; }
      else { boxes[j * 4] = PFR.x0; boxes[j * 4 + 1] = PFR.y0; boxes[j * 4 + 2] = PFR.x1; boxes[j * 4 + 3] = PFR.y1; } }
    PFC_O.h = h; PFC_O.boxes = boxes; PFC_ST.objBuild++; }
  ctx.drawImage(PFC_O.c, 0, 0); tick('o.cache');
  const B = PFC_O.boxes; let j = 0, dyn = 0, redraw = 0;
  for (let i = 0; i < list.length; i++) {
    if (j < st.length && st[j] === i) { j++; continue; }
    const o = list[i]; dyn++; pfcDrawOne(pfcRec(ctx), o, poseT);
    if (PFR.x1 < PFR.x0 && !PFR.bad) continue;
    const bad = PFR.bad, x0 = PFR.x0, y0 = PFR.y0, x1 = PFR.x1, y1 = PFR.y1;
    let clipped = false; // redraw only inside the moving thing's box, so statics keep their order among themselves
    for (let q = j; q < st.length; q++) { const b = q * 4;
      if (bad || (B[b] < x1 && x0 < B[b + 2] && B[b + 1] < y1 && y0 < B[b + 3])) {
        if (!clipped && !bad) { clipped = true; ctx.save(); ctx.beginPath(); ctx.rect(Math.floor(x0), Math.floor(y0), Math.ceil(x1) - Math.floor(x0), Math.ceil(y1) - Math.floor(y0)); ctx.clip(); }
        pfcDrawOne(ctx, list[st[q]], poseT); redraw++; } }
    if (clipped) ctx.restore(); }
  tick('o.dyn'); PFC_ST.statics = st.length; PFC_ST.dyn = dyn; PFC_ST.redraw = redraw;
}
`;
export const CACHE_PATCHES = [
  [SOIL_A, `  if (window.__soilCache) pfcSoil(allTiles); else {\n${SOIL_A} }`],
  ['  for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }', '  if (window.__objCache) pfcObjects(list, poseT); else for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }'],
  // the shadow mask is only read by (gpu)applyShadows: skip building it when shadows are off (低)
  ['  for (const o of list) { if (o.flat || o.ci !== undefined) continue; if (o.bb) { bbShadow(sctx, o); continue; }', '  if (night < 0.9 && !window.__trialNoShadow) for (const o of list) { if (o.flat || o.ci !== undefined) continue; if (o.bb) { bbShadow(sctx, o); continue; }'],
  ['function treePoseT(o) { return Math.floor(realT * 10 + o.tick) / 10; }', 'function treePoseT(o) { return window.__noSway ? 0 : Math.floor(realT * 10 + o.tick) / 10; }'],
  // 低: wind poses (render only) frozen at rest, so trees and crops can live in the cached layer
  ['function windPose(x, y, t) { // unrounded unit sway at a point: downwind px, upward lift\n', 'function windPose(x, y, t) { // unrounded unit sway at a point: downwind px, upward lift\n  if (window.__noSway) return [0, 0];\n'],
  ['function drawTree(c, o) {', HELPERS + 'function drawTree(c, o) {'],
];
