// douyin: cached static layers for GPU mini-program canvases where every drawImage call is expensive (~0.06 ms iOS, ~0.1 ms Android).
// A/B switches (set by the landing page): window.__soilCache, window.__objCache, window.__noSway. Visuals with the caches on are the
// same frame (layer = the same draws, composed once); __noSway freezes wind poses (a 低-only quality choice).
const SOIL_A = "  for (const t of allTiles) if ((t.tilled || t.crop) && onScreen(t.x, t.y, 20)) drawStack(ctx, models.soil[t.watered ? 1 : 0], t.x, t.y, 0, 0);\n  for (const d of decals) { const [sx, sy] = proj(d.x, d.y); if (sx < -8 || sx > W + 8 || sy < -4 || sy > H + 12) continue; const bob = d.bob || 0; ctx.drawImage(d.c, Math.round(sx) - (d.c.width >> 1), Math.round(sy) - d.c.height + 1 + bob); }";
const SOIL_DECALS = SOIL_A.split('\n')[1];
const soilBody = g => SOIL_A.replaceAll('ctx', g).replace('for (const d of decals) { ', 'for (const d of decals) { if (d.lily !== undefined) continue; '); // pond lilies bob: drawn live
const lilies = SOIL_DECALS.replace('for (const d of decals) { ', 'for (const d of decals) { if (d.lily === undefined) continue; ');
const HELPERS = `
// ---- douyin: cached static layers (see build patches-cache.mjs)
let PFC_ID = 0, PFC_F = 0, PFK_FR = -1; const PFC_HOT = new Map();
const PFC_ST = window.__pfcStats = { soilBuild: 0, objBuild: 0, soilSync: 0, objSync: 0, objWhy: '', soilWhy: '', redraw: 0, statics: 0, dyn: 0, bad: 0, badStatic: 0, wipe: 0, wipeWhy: '', blankOff: 0, chunkBuild: 0, chunkDraws: 0, soilFb: 0, objFb: 0, fbDraws: 0, soilChunk: 0, objChunk: 0, preStk: 0, preTree: 0, warmQ: 0, grow: 0, defer: 0, blocked: 0, chunkReset: 0, chunks: 0, probe: 0, patch: 0, patchDraws: 0, scroll: 0, scrollDraws: 0, stkNew: 0, stkWho: {}, objPatchWhy: '', soilPatchWhy: '', treeChg: 0, treeShare: 0, stkEvict: 0 };
function pfcId(x) { return x.__pfc || (x.__pfc = ++PFC_ID); }
function pfcMix(h, v) { return (Math.imul(h ^ (v | 0), 16777619) + 0x9e3779b9) | 0; }
function pfcStr(h, s) { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; }
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
// v8 预建: the cached layers are fixed 256 px chunks on the camera-free picture plane (screen position minus the camera), so a pan
// only moves where they are blitted. Chunks are built ahead of the view, a time budget a frame (more when the map sits still),
// further ahead in the direction it is dragged and further the faster; never all at once. A chunk on screen that is not finished
// yet shows what it has and the rest of its items are drawn straight onto the screen (clipped to it) until it is. A chunk is only
// started when the object list holds everything that can draw into it, so items coming into the list are never patched in:
// patches are for real changes only. Kept until the camera turns or zooms (least recently used past PFK_MAXC).
const PFK_S = 256, PFK_MAXC = 48, PFK_BASE = 64, PFK_IDLE = 256, PFK_AHEAD = 768;
// a chunk's window: things standing up to MX px left/right of it, MT above, MB below (tall ones) can draw into it (per layer)
let PFK_POOL = [], PFK_T0 = 0, PFK_MS = 4, PFK_LX = 0, PFK_LY = 0, PFK_VX = 0, PFK_VY = 0, PFK_STILL = 0, PFK_RG = [64, 64, 64, 64], PFK_PADS = [0, 0, 0, 0], PFK_IDLEDONE = false;
let PFK_MOV = false, PFK_CT = 0, PFK_CB = 3, PFK_DEF = [], PFK_BLK = new Set(); // picture-making ms spent this frame, its share; deferred items
let PFC_PG = null, PFC_POSE = 0, PFC_CAND = new Int32Array(0), PFC_KIND = new Uint8Array(0), PFK_SPENT = 0;
function pfcCamR() { return pfcMix(pfcMix(Math.round(AQ * 1e4), Math.round(RS * 100)), W * 4099 + H); }
function pfkTick() { // once a frame: pan velocity (plane px/frame), the ring to keep built around the view, the object list's reach
  if (PFK_FR === realT) return; const lastF = PFK_FR; PFK_FR = realT; // the still-time ring stays until every layer drawn last frame has it all built
  PFK_IDLEDONE = (PFK_SL.ranF !== lastF || PFK_SL.idleDone) && (PFK_OL.ranF !== lastF || PFK_OL.idleDone); PFK_T0 = performance.now(); PFK_SPENT = 0; PFK_CT = 0; PFK_DEF.length = 0;
  let vx = PFK_LX - CX, vy = PFK_LY - CY; PFK_LX = CX; PFK_LY = CY; if (Math.abs(vx) > 300 || Math.abs(vy) > 300) vx = vy = 0; // a jump
  PFK_VX = PFK_VX * 0.6 + vx * 0.4; PFK_VY = PFK_VY * 0.6 + vy * 0.4;
  const moving = PFK_MOV = Math.abs(vx) + Math.abs(vy) > 0.5 || !!window.__dragging; PFK_STILL = moving ? 0 : PFK_STILL + 1; if (moving) PFK_IDLEDONE = false;
  const ax = Math.min(PFK_AHEAD, Math.abs(PFK_VX) * 45), ay = Math.min(PFK_AHEAD, Math.abs(PFK_VY) * 45), idle = PFK_STILL > 15 && !PFK_IDLEDONE ? PFK_IDLE : 0;
  const R = PFK_RG; R[0] = Math.max(idle, PFK_BASE + (PFK_VX < 0 ? ax : 0)); R[1] = Math.max(idle, PFK_BASE + (PFK_VX > 0 ? ax : 0));
  R[2] = Math.max(idle, PFK_BASE + (PFK_VY < 0 ? ay : 0)); R[3] = Math.max(idle, PFK_BASE + (PFK_VY > 0 ? ay : 0));
  // the list must reach every window of every chunk the ring touches (a chunk reaches up to S-1 past it); statics' own pad >= 30
  const P = PFK_PADS, ow = PFK_OL.mg; P[0] = R[0] + PFK_S + ow[0] - 30; P[1] = R[1] + PFK_S + ow[0] - 30; P[2] = R[2] + PFK_S + ow[1] - 30; P[3] = R[3] + PFK_S + ow[2] - 120;
  PFK_MS = moving ? 7 : 9; PFK_CB = moving ? 4 : 6; // ms of chunk building / of new pictures a frame
}
function pfkSlow(n, dt) { const S = PFC_ST.slow || (PFC_ST.slow = []); S.push(n + ' ' + Math.round(dt) ); if (S.length > 12) S.shift(); }
function pfkDefer(x, y) { PFK_DEF.push(x, y); PFC_ST.defer++; }
function pfkLayer(raw, name, st, mg) { return { ch: new Map(), camR: null, bx: new Map(), use: 0, raw, name, st, mg, lists: [], hs: new Int32Array(0), ranF: -2, idleDone: false }; }
function pfkFrame() { return { n: 0, key: new Int32Array(512), sub: new Int32Array(512), rx: new Int32Array(512), ry: new Int32Array(512), li: new Int32Array(512), d: new Float64Array(512), it: [] }; }
function pfkPush(F, key, sub, rx, ry, d, it, li) {
  if (F.n >= F.key.length) for (const f of ['key', 'sub', 'rx', 'ry', 'li', 'd']) { const a = F[f], b = new a.constructor(a.length * 2); b.set(a); F[f] = b; }
  const n = F.n++; F.key[n] = key; F.sub[n] = sub; F.rx[n] = rx; F.ry[n] = ry; F.d[n] = d; F.li[n] = li; F.it[n] = it; }
function pfkRecBox() { return PFR.bad ? [-1e9, -1e9, 1e9, 1e9] : [PFR.x0 - CX, PFR.y0 - CY, PFR.x1 - CX, PFR.y1 - CY]; }
function pfkKeep(Ly, k, sub, rx, ry, b) { if (Ly.bx.size > 60000) Ly.bx.clear(); Ly.bx.set(k, { sub, rx, ry, b });
  // v8: a chunk's window is sized to what its layer's items reach (soil tiles ~15 px, trees ~60 px wide and ~120 up); one that
  // reaches further widens it, and the layer starts over (rare: a zoom-in, a new big model)
  if (b[0] < -1e8) return; const m = Ly.mg, x = Math.max(rx - b[0], b[2] - rx), dn = b[3] - ry, up = ry - b[1];
  if (x > m[0] || dn > m[1] || up > m[2]) { m[0] = Math.max(m[0], Math.ceil(x * 1.25) + 4); m[1] = Math.max(m[1], Math.ceil(dn * 1.25) + 4); m[2] = Math.max(m[2], Math.ceil(up * 1.25) + 4); Ly.grow = true; PFC_ST.grow++; } }
function pfkCached(Ly, k, sub, rx, ry) { const c = Ly.bx.get(k); return c && c.sub === sub && c.rx === rx && c.ry === ry ? c.b : null; }
function pfkBox(Ly, k, sub, rx, ry, it) { // an item's box on the picture plane, kept while its look and spot stay the same
  const c = pfkCached(Ly, k, sub, rx, ry); if (c) return c;
  if (!PFC_PG) PFC_PG = mk(1, 1).getContext('2d'); PFC_PG.setTransform(1, 0, 0, 1, 0, 0); Ly.raw(pfcRec(PFC_PG), it); PFC_ST.probe++; PFK_SPENT++;
  const b = pfkRecBox(); pfkKeep(Ly, k, sub, rx, ry, b); return b; }
function pfkHit(b, x0, y0, x1, y1) { return b[0] < x1 && x0 < b[2] && b[1] < y1 && y0 < b[3]; }
function pfkChunk(i, j, C0) { const c = C0 ? C0.c : PFK_POOL.pop() || mk(PFK_S, PFK_S), g = C0 ? C0.g : c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, PFK_S, PFK_S); g.imageSmoothingEnabled = false; PFC_ST.chunkBuild++;
  return { i, j, c, g, rec: null, todo: null, ti: 0, kmap: null, fh: 0, use: 0 }; }
function pfkFree(C) { if (PFK_POOL.length < 12) PFK_POOL.push(C.c); else C.c.width = C.c.height = 0; }
function pfkStep(Ly, C, dl) { // more draws of a new chunk until the deadline (placed for the camera now: the plane does not move with it)
  const S = PFK_S, x0 = C.i * S, y0 = C.j * S, g = C.g; let done = 0;
  g.setTransform(1, 0, 0, 1, -x0 - CX, -y0 - CY);
  for (; C.ti < C.todo.length; C.ti++) { if ((done & 3) === 3 && performance.now() > dl) break; const e = C.todo[C.ti], b = pfkCached(Ly, e.k, e.sub, e.rx, e.ry);
    if (b) { e.b = b; if (!pfkHit(b, x0, y0, x0 + S, y0 + S)) continue; Ly.raw(g, e.it); }
    else { Ly.raw(pfcRec(g), e.it); e.b = pfkRecBox(); pfkKeep(Ly, e.k, e.sub, e.rx, e.ry, e.b); if (!pfkHit(e.b, x0, y0, x0 + S, y0 + S)) continue; }
    done++; }
  g.setTransform(1, 0, 0, 1, 0, 0); PFK_SPENT += done; PFC_ST.chunkDraws += done;
  if (C.ti < C.todo.length) return false;
  C.rec = C.todo; C.todo = null; C.kmap = null; PFC_ST[Ly.st[4]]++; return true; }
function pfkPatch(Ly, C, F, qs, G) { // a built chunk brought up to date with this frame's items in its window (G: where F is complete)
  const rec = C.rec; if (!C.kmap) { C.kmap = new Map(); for (let n = 0; n < rec.length; n++) C.kmap.set(rec[n].k, n); }
  const seen = new Uint8Array(rec.length), R = []; let add = null, gone = 0, why = '', resort = false;
  for (let t = 0; t < qs.length; t++) { const q = qs[t], k = F.key[q], n = C.kmap.get(k);
    if (n !== undefined && !seen[n]) { seen[n] = 1; const e = rec[n]; e.it = F.it[q];
      if (e.sub === F.sub[q] && e.rx === F.rx[q] && e.ry === F.ry[q]) continue;
      if (!why) why = (e.sub !== F.sub[q] ? 'look:' : 'pos:') + Ly.name(e.it);
      R.push(e.b); e.sub = F.sub[q]; e.rx = F.rx[q]; e.ry = F.ry[q]; if (e.d !== F.d[q]) { e.d = F.d[q]; resort = true; }
      e.b = pfkBox(Ly, k, e.sub, e.rx, e.ry, e.it); R.push(e.b); continue; }
    const e = { k, sub: F.sub[q], rx: F.rx[q], ry: F.ry[q], d: F.d[q], it: F.it[q], b: null }; e.b = pfkBox(Ly, k, e.sub, e.rx, e.ry, e.it);
    if (!why) why = 'add:' + Ly.name(e.it); (add || (add = [])).push(e); R.push(e.b); }
  for (let n = 0; n < rec.length; n++) if (!seen[n]) { const e = rec[n];
    if (G && !(e.rx > G[0] && e.rx < G[2] && e.ry > G[1] && e.ry < G[3])) { seen[n] = 2; continue; } // outside the known area: kept
    if (!why) why = 'gone:' + Ly.name(e.it); R.push(e.b); gone++; }
  if (add || gone) { const out = []; for (let n = 0; n < rec.length; n++) if (seen[n]) out.push(rec[n]); if (add) for (const e of add) out.push(e); C.rec = out; resort = true; }
  if (resort) { C.rec.sort((a, b) => a.d - b.d || a.k - b.k); C.kmap = null; }
  const S = PFK_S, X0 = C.i * S, Y0 = C.j * S, X1 = X0 + S, Y1 = Y0 + S, g = C.g; let rs = [];
  for (const b of R) { if (!(b[2] > b[0]) || !pfkHit(b, X0, Y0, X1, Y1)) continue; if (b[2] - b[0] > S * 4) { rs = [[X0, Y0, X1, Y1]]; break; } rs.push(b); }
  if (rs.length > 24) rs = [[X0, Y0, X1, Y1]];
  if (!rs.length) return;
  let nd = 0;
  for (const b of rs) { const x0 = Math.max(X0, Math.floor(b[0]) - 1), y0 = Math.max(Y0, Math.floor(b[1]) - 1), x1 = Math.min(X1, Math.ceil(b[2]) + 1), y1 = Math.min(Y1, Math.ceil(b[3]) + 1);
    g.save(); g.setTransform(1, 0, 0, 1, -X0, -Y0); g.clearRect(x0, y0, x1 - x0, y1 - y0); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.translate(-CX, -CY);
    for (const e of C.rec) if (pfkHit(e.b, x0, y0, x1, y1)) { Ly.raw(g, e.it); nd++; }
    g.restore(); }
  g.setTransform(1, 0, 0, 1, 0, 0); PFC_ST.patch++; PFC_ST.patchDraws += nd; PFK_SPENT += nd; if (why) PFC_ST[Ly.st[2]] = why;
}
function pfkRun(Ly, F, G) { // F: this frame's statics (picture-plane anchors); G: the plane area where F is complete (null: all of it)
  pfkTick(); const S = PFK_S, camR = pfcCamR(), mg = Ly.mg, RG = PFK_RG;
  if (Ly.grow) { Ly.grow = false; for (const C of Ly.ch.values()) pfkFree(C); Ly.ch.clear(); PFC_ST[Ly.st[3]] = 'window'; }
  if (Ly.camR !== camR) { for (const C of Ly.ch.values()) pfkFree(C); Ly.ch.clear(); Ly.bx.clear(); if (Ly.camR !== null) { PFC_ST[Ly.st[0]]++; PFC_ST[Ly.st[3]] = 'cam(angle/zoom/size)'; } Ly.camR = camR; PFC_ST.chunkReset++; }
  const use = ++Ly.use, X0 = -CX, Y0 = -CY, X1 = W - CX, Y1 = H - CY;
  const vi0 = Math.floor(X0 / S), vi1 = Math.floor((X1 - 1) / S), vj0 = Math.floor(Y0 / S), vj1 = Math.floor((Y1 - 1) / S);
  const ri0 = Math.floor((X0 - RG[0]) / S), ri1 = Math.floor((X1 + RG[1] - 1) / S), rj0 = Math.floor((Y0 - RG[2]) / S), rj1 = Math.floor((Y1 + RG[3] - 1) / S);
  const nI = ri1 - ri0 + 1, nC = nI * (rj1 - rj0 + 1), lists = Ly.lists;
  for (let c = 0; c < nC; c++) { if (!lists[c]) lists[c] = []; else lists[c].length = 0; }
  if (Ly.hs.length < nC) Ly.hs = new Int32Array(nC * 2); const hs = Ly.hs; hs.fill(0, 0, nC);
  for (let q = 0; q < F.n; q++) { const x = F.rx[q], y = F.ry[q];
    let i0 = Math.floor((x - mg[0]) / S), i1 = Math.floor((x + mg[0]) / S), j0 = Math.floor((y - mg[2]) / S), j1 = Math.floor((y + mg[1]) / S);
    if (i0 < ri0) i0 = ri0; if (i1 > ri1) i1 = ri1; if (j0 < rj0) j0 = rj0; if (j1 > rj1) j1 = rj1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = (j - rj0) * nI + (i - ri0); lists[c].push(q); hs[c] = pfcMix(pfcMix(pfcMix(pfcMix(hs[c], F.key[q]), F.sub[q]), x), y); } }
  const vis = [], todo = []; let need = 0; const blk = PFK_BLK; blk.clear();
  if (G) for (let d = 0; d < PFK_DEF.length; d += 2) { const x = PFK_DEF[d], y = PFK_DEF[d + 1]; // windows a deferred item can draw into
    for (let j = Math.floor((y - mg[2]) / S); j <= Math.floor((y + mg[1]) / S); j++) for (let i = Math.floor((x - mg[0]) / S); i <= Math.floor((x + mg[0]) / S); i++) blk.add((i + 32768) * 65536 + (j + 32768)); }
  // centre of where the view is heading (a few frames ahead), for build order
  const hx = (X0 + X1) / 2 + PFK_VX * 12, hy = (Y0 + Y1) / 2 + PFK_VY * 12;
  for (let j = rj0; j <= rj1; j++) for (let i = ri0; i <= ri1; i++) { const c = (j - rj0) * nI + (i - ri0), ck = (i + 32768) * 65536 + (j + 32768), on = i >= vi0 && i <= vi1 && j >= vj0 && j <= vj1;
    const C = Ly.ch.get(ck);
    if (C) { C.use = use;
      if (!C.todo) { if (C.fh !== hs[c]) { pfkPatch(Ly, C, F, lists[c], G); C.fh = hs[c]; } }
      else todo.push(C); }
    else { // started only when everything that can draw into it is in the list (else items arriving later would be patched in)
      const ok = !G || (i * S - mg[0] > G[0] && (i + 1) * S + mg[0] < G[2] && j * S - mg[1] > G[1] && (j + 1) * S + mg[2] < G[3] && !blk.has(ck));
      if (!ok && blk.has(ck)) PFC_ST.blocked++;
      if (ok) { const P = { i, j, c, ck, pr: 0, C: null }; P.pr = (on ? 0 : 1e6) + Math.abs((i + 0.5) * S - hx) + Math.abs((j + 0.5) * S - hy); todo.push(P); need++; } }
    if (on) vis.push(ck); }
  for (const C of todo) if (C.todo) C.pr = ((C.i >= vi0 && C.i <= vi1 && C.j >= vj0 && C.j <= vj1) ? 0 : 1e6) + Math.abs((C.i + 0.5) * S - hx) + Math.abs((C.j + 0.5) * S - hy) - 1; // started ones first
  todo.sort((a, b) => a.pr - b.pr);
  // v9: an unfinished chunk on screen while the map is not moving (load, zoom, a turn) is finished in a few ~20 ms frames rather
  // than drawn item by item each frame; while dragging the usual budget holds and the fallback covers it
  const visTodo = todo.length && todo[0].pr < 1e6, dl = performance.now() + (visTodo && !PFK_MOV ? 20 : PFK_MS) * (Ly === PFK_SL ? 0.4 : 0.6); let first = true;
  for (const P of todo) { if (!first && performance.now() > dl) break; first = false;
    let C = P.todo ? P : null;
    if (!C) { let reuse = null;
      if (Ly.ch.size >= PFK_MAXC) { let ok = -1, ou = 1e18; for (const [k2, C2] of Ly.ch) if (C2.use !== use && C2.use < ou) { ou = C2.use; ok = k2; } // the least recently used gives up its canvas
        if (ok !== -1) { reuse = Ly.ch.get(ok); Ly.ch.delete(ok); } }
      C = pfkChunk(P.i, P.j, reuse); C.use = use; const L = lists[P.c];
      C.todo = L.map(q => ({ k: F.key[q], sub: F.sub[q], rx: F.rx[q], ry: F.ry[q], d: F.d[q], it: F.it[q], b: null })); C.fh = hs[P.c]; Ly.ch.set(P.ck, C); }
    pfkStep(Ly, C, dl); }
  Ly.ranF = PFK_FR; Ly.idleDone = PFK_STILL > 15 && !need && !(G && PFK_DEF.length) && !todo.some(C => C.todo); // the still-time ring is all built
  const out = []; for (const ck of vis) { const C = Ly.ch.get(ck); out.push(C || { i: Math.floor(ck / 65536) - 32768, j: ck % 65536 - 32768, c: null, todo: [], ti: 0, ck, lc: lists }); }
  Ly.vis = out; Ly.vc = { ri0, rj0, nI, F }; return out;
}
function pfkBlit(vis, Ly) { // finished chunks are blitted; an unfinished one shows what it has, and its other items go straight on the screen
  const S = PFK_S;
  for (const C of vis) { const sx = C.i * S + CX, sy = C.j * S + CY;
    if (C.c && !C.todo) { ctx.drawImage(C.c, sx, sy); continue; }
    PFC_ST[Ly.st[1]]++; if (C.c && C.ti > 0) ctx.drawImage(C.c, sx, sy);
    let items = C.todo; if (!C.c) { const V = Ly.vc, c = (C.j - V.rj0) * V.nI + (C.i - V.ri0), F = V.F; items = Ly.lists[c].map(q => ({ k: F.key[q], sub: F.sub[q], rx: F.rx[q], ry: F.ry[q], it: F.it[q], b: null })); }
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(W, sx + S), y1 = Math.min(H, sy + S); if (x1 <= x0 || y1 <= y0) continue;
    const px0 = x0 - CX, py0 = y0 - CY, px1 = x1 - CX, py1 = y1 - CY;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    for (let t = C.ti; t < items.length; t++) { const e = items[t], b = e.b || pfkCached(Ly, e.k, e.sub, e.rx, e.ry);
      if (b) { if (pfkHit(b, px0, py0, px1, py1)) { Ly.raw(ctx, e.it); PFC_ST.fbDraws++; } continue; }
      Ly.raw(pfcRec(ctx), e.it); e.b = pfkRecBox(); pfkKeep(Ly, e.k, e.sub, e.rx, e.ry, e.b); PFC_ST.fbDraws++; }
    ctx.restore(); }
}
function pfcSoilDraw(g, it) {
  if (!it.tile) { const [sx, sy] = proj(it.x, it.y); g.drawImage(it.c, Math.round(sx) - (it.c.width >> 1), Math.round(sy) - it.c.height + 1 + (it.bob || 0)); }
  else drawStack(g, models.soil[it.tile.watered ? 1 : 0], it.tile.x, it.tile.y, 0, 0);
}
function pfcSoilName(it) { return it.tile ? 'tile' + (it.tile.watered ? '(wet)' : '') : 'decal'; }
const PFK_SL = pfkLayer(pfcSoilDraw, pfcSoilName, ['soilBuild', 'soilFb', 'soilPatchWhy', 'soilWhy', 'soilChunk'], [20, 20, 20]), PFK_SF = pfkFrame();
function pfkSoil(allTiles) { // tilled tiles and decals (not the bobbing lilies), on the plane area the chunks around the screen can need
  const F = PFK_SF, cs = CA * RS, sn = SA * RS, S = PFK_S; F.n = 0; let d = 0;
  pfkTick(); const R = PFK_RG, mg = PFK_SL.mg;
  const x0 = Math.floor((-CX - R[0]) / S) * S - mg[0], x1 = (Math.floor((W - CX + R[1] - 1) / S) + 1) * S + mg[0], y0 = Math.floor((-CY - R[2]) / S) * S - mg[1], y1 = (Math.floor((H - CY + R[3] - 1) / S) + 1) * S + mg[2];
  for (const t of allTiles) { d++; if (!(t.tilled || t.crop)) continue; const rx = Math.round(t.x * cs - t.y * sn), ry = Math.round((t.x * sn + t.y * cs) * K);
    if (rx < x0 || rx > x1 || ry < y0 || ry > y1) continue; pfkPush(F, pfcId(t), t.watered ? 1 : 0, rx, ry, d, t.__pfkIt || (t.__pfkIt = { tile: t }), 0); }
  for (const dc of decals) { d++; if (dc.lily !== undefined) continue; const rx = Math.round(dc.x * cs - dc.y * sn), ry = Math.round((dc.x * sn + dc.y * cs) * K);
    if (rx < x0 || rx > x1 || ry < y0 || ry > y1) continue; pfkPush(F, -pfcId(dc), pfcMix(pfcId(dc.c), dc.bob || 0), rx, ry, d, dc, 0); }
  pfkBlit(pfkRun(PFK_SL, F, null), PFK_SL);
${lilies}
}
// v8 预建: a big stack picture (3x render, majority filter, outline: tens of ms on a phone) is made a few slices / rows at a time
// over several frames, ahead of need (off-screen items that need one wait for it; while the map sits still, every big model on
// the farm is queued, nearest first), then handed to stackCanvas, which only puts it (see the buildStack patch)
const PFJ = { q: [], set: new Set(), cur: null, c: null, g: null, pre: new Map(), sort: false, warmAQ: null }; window.__pfjPre = PFJ.pre;
function pfjKey(m, a) { return pfcId(m) * 512 + (Math.round(a / ASTEP) & 511); }
function pfjWant(m, a, d) { const k = pfjKey(m, a); if (PFJ.set.has(k)) return; PFJ.set.add(k); PFJ.q.push({ m, a, k, d }); PFJ.sort = true; }
function pfjBig(m) { return m.w * m.d * m.h >= 3000 && !m.nearest; }
function pfjStart(J) { const m = J.m, a = J.a, ca = Math.cos(a), sa = Math.sin(a), r = Math.ceil(Math.hypot(m.w, m.d) / 2) + 2;
  J.w = 2 * r; J.h = Math.ceil(2 * r * K) + m.h + 4; J.ox = r; J.oy = Math.ceil(r * K) + m.h + 1; J.ca = ca; J.sa = sa; J.BW = J.w * SS; J.BH = J.h * SS; J.i = 0; J.ph = 0;
  if (!PFJ.c) { PFJ.c = mk(8, 8); PFJ.g = PFJ.c.getContext('2d', { willReadFrequently: true }); }
  if (PFJ.c.width < J.BW || PFJ.c.height < J.BH) { PFJ.c.width = Math.max(PFJ.c.width, J.BW); PFJ.c.height = Math.max(PFJ.c.height, J.BH); PFJ.g = PFJ.c.getContext('2d', { willReadFrequently: true }); }
  const g = PFJ.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, J.BW, J.BH); g.imageSmoothingEnabled = false; }
function pfjStep(J, dl) { const m = J.m, g = PFJ.g, w = J.w, h = J.h, BW = J.BW;
  if (J.ph === 0) { const sl = slicesAt(m, J.a);
    for (; J.i < m.h; J.i++) { if ((J.i & 7) === 7 && performance.now() > dl) return false; const i = J.i; if (!sl.has[i]) continue;
      for (let t = SS - 1; t >= 0; t--) { g.setTransform(J.ca * SS, J.sa * K * SS, -J.sa * SS, J.ca * K * SS, J.ox * SS, (J.oy - i) * SS + t); drawSlice(g, sl, i, -m.w / 2, -m.d / 2); } }
    g.setTransform(1, 0, 0, 1, 0, 0); J.ph = 1; if (performance.now() > dl) return false; }
  if (J.ph === 1) { J.src = new Uint32Array(g.getImageData(0, 0, BW, J.BH).data.buffer); J.out = new ImageData(w, h); J.dst = new Uint32Array(J.out.data.buffer); J.y = 0; J.ph = 2; J.v = new Uint32Array(SS * SS); if (performance.now() > dl) return false; }
  if (J.ph === 2) { const src = J.src, dst = J.dst, v = J.v;
    for (; J.y < h; J.y++) { if ((J.y & 3) === 3 && performance.now() > dl) return false; const y = J.y;
      for (let x = 0; x < w; x++) {
        let n = 0; for (let yy = 0; yy < SS; yy++) { const row = (y * SS + yy) * BW + x * SS; for (let xx = 0; xx < SS; xx++) { const p = src[row + xx]; v[n++] = (p >>> 24) >= 128 ? p | 0xff000000 : 0; } }
        const mid = v[(SS * SS) >> 1]; let same = true; for (let q = 0; q < n; q++) if (v[q] !== mid) { same = false; break; }
        if (same) { dst[y * w + x] = mid >>> 0; continue; }
        let best = mid, bc = 0; for (let q = 0; q < n; q++) if (v[q] === mid) bc++;
        for (let q = 0; q < n; q++) { const c = v[q]; if (c === best) continue; let cnt = 0; for (let s = 0; s < n; s++) if (v[s] === c) cnt++; if (cnt > bc) { bc = cnt; best = c; } }
        dst[y * w + x] = best >>> 0; } }
    J.src = null; J.ph = 3; }
  if (J.ph === 3) { if (!m.noOutline) { const d = J.dst, o = new Uint32Array(d.length); // outlineCanvas, on the buffer
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (d[i] >>> 24) continue;
        const nb = (y < h - 1 && d[i + w] >>> 24) ? i + w : (x > 0 && d[i - 1] >>> 24) ? i - 1 : (x < w - 1 && d[i + 1] >>> 24) ? i + 1 : (y > 0 && d[i - w] >>> 24) ? i - w : -1;
        if (nb >= 0) o[i] = OUTL.get(d[nb] | 0xff000000) || INK0; }
      for (let i = 0; i < d.length; i++) if (o[i]) d[i] = o[i]; }
    return true; }
  return false; }
function pfjRun(ms) { const t0 = performance.now(), dl = t0 + ms; let n = 0;
  while (n === 0 || performance.now() < dl) { n++;
    let J = PFJ.cur;
    if (!J) { if (!PFJ.q.length) break; if (PFJ.sort) { PFJ.q.sort((a, b) => b.d - a.d); PFJ.sort = false; } J = PFJ.q.pop(); PFJ.set.delete(J.k);
      if (J.t === 3) { seaBandMap(); continue; } // the sea's band map: built once for the whole map (~250 ms at 4x), not on first sight
      if (J.t === 2) { if (J.o.tree) { treeCache(J.o, treePoseT(J.o)); PFC_ST.preTree++; } continue; } // a tree's picture (one go)
      if (J.m._ck && J.m._ck.get(J.a)) continue;
      if (J.t === 1) { stackCanvas(J.m, J.a); continue; } // a small stack (one go, plain nearest)
      PFJ.set.add(J.k); pfjStart(J); PFJ.cur = J; }
    if (pfjStep(J, dl)) { PFJ.cur = null; PFJ.set.delete(J.k); if (!(J.m._ck && J.m._ck.get(J.a))) { PFJ.pre.set(J.m, J); stackCanvas(J.m, J.a); PFJ.pre.delete(J.m); PFC_ST.preStk++; } } }
  PFK_CT += performance.now() - t0; }
// v9: the map sits still: every static picture on the farm at this angle (big stacks a part at a time, small ones and trees in
// one go each), nearest first, within the frame's picture budget; the list then finds them made and nothing waits while dragging
function pfjWarm(allTiles) {
  if (PFJ.warmAQ === AQ || PFJ.q.length || PFJ.cur) return; PFJ.warmAQ = AQ; const cs = CA * RS, sn = SA * RS, cx = W / 2 - CX, cy = H / 2 - CY;
  const dist = (x, y) => Math.abs(x * cs - y * sn - cx) + Math.abs((x * sn + y * cs) * K - cy);
  const want = (m, x, y, rot) => { if (!m) return; const a = pfcQ(AQ + (rot || 0)); if (m._ck && m._ck.get(a)) return;
    const k = pfjKey(m, a); if (PFJ.set.has(k)) return; PFJ.set.add(k); PFJ.q.push({ t: pfjBig(m) ? 0 : 1, m, a, k, d: dist(x, y) }); };
  const tree = o => { const k0 = o._ck; if (k0 && k0.c && k0.__pfcStill) return; PFJ.q.push({ t: 2, o, k: -1, d: dist(o.x, o.y) }); };
  for (const p of props) { if (p.tree) { if (!eastHideAt(p.x, p.y)) tree(p); } else if (p.m) want(p.m, p.x, p.y, p.rot); }
  for (const t of S.trees) if (!eastHideAt(t.x, t.y)) { const o = treeView(t); if (o.tree) tree(o); else if (o.m) want(o.m, o.x, o.y, o.rot); }
  for (const c of yard) if (c.type !== 'weed') want(clutterModel(c), c.x, c.y, c.rot);
  if (allTiles) for (const t of allTiles) if (t.debris) want(debrisModel(t.debris), t.x, t.y, t.debris.rot);
  if (!SEA_BAND) PFJ.q.push({ t: 3, k: -1, d: -1 });
  PFJ.sort = true; PFC_ST.warmQ = PFJ.q.length; }
function pfcDrawOne(c, o, poseT) {
  if (o.rain) { WX.drawDrop(c, o.rain, proj); return; }
  if (o.bb) { drawBillboard(c, o); return; }
  if (o.tree) { const k = treeCache(o, treePoseT(o)), p = proj(o.x, o.y); c.drawImage(k.c, Math.round(p[0]) - k.ox, Math.round(p[1]) - k.oy); return; } // no on-screen cull: layers reach past the screen
  if (o.ci !== undefined) { drawCrop(c, o, poseT); return; }
  if (o.spr) { drawSpr(c, o, poseT); return; }
  drawStack(c, o.m, o.x, o.y, o.z || 0, o.rot || 0);
}
// v7: at 低 stack angles snap to the 256 camera steps (debris and yard clutter had random angles, vehicles turn smoothly), so the
// per-angle pictures are shared and stop being made while the farm just sits there; panel: which models still make new ones
function pfcQ(a) { return ((Math.round(a / ASTEP) % 256 + 256) % 256) * ASTEP; }
function pfcStkNew(m) { const S = PFC_ST, k = m.w + 'x' + m.d + 'x' + m.h; S.stkNew++; S.stkWho[k] = (S.stkWho[k] || 0) + 1; }
function pfcObjRaw(g, o) { pfcDrawOne(g, o, PFC_POSE); }
function pfcObjName(o) { return o.tree ? 'tree' : o.ci !== undefined ? 'crop' : o.spr ? 'spr' + o.spr.width + 'x' + o.spr.height : o.m ? 'stack' + o.m.w + 'x' + o.m.d + 'x' + o.m.h : '?'; }
const PFK_OL = pfkLayer((g, o) => pfcDrawOne(g, o, PFC_POSE), pfcObjName, ['objBuild', 'objFb', 'objPatchWhy', 'objWhy', 'objChunk'], [72, 60, 136]), PFK_OF = pfkFrame(); window.__pfk = { SL: PFK_SL, OL: PFK_OL, dbg: () => ({ still: PFK_STILL, idleDone: PFK_IDLEDONE, rg: PFK_RG.slice(), pads: PFK_PADS.slice(), ol: PFK_OL.ch.size, sl: PFK_SL.ch.size, olTodo: [...PFK_OL.ch.values()].filter(C => C.todo).length, def: PFK_DEF.length, jobs: PFJ.q.length + (PFJ.cur ? 1 : 0), vx: PFK_VX, vy: PFK_VY }) };
function pfcObjects(list, poseT, allTiles) { // statics composed once into a layer; each moving thing is drawn over it, then the statics in front of it
  const ns = !!window.__noSway; PFC_F++; PFC_POSE = poseT; // that it overlaps are drawn again, so the stacking order stays the same
  if (PFC_HOT.size > 4000) PFC_HOT.clear();
  // v7: no allocation per item (an interpreter-only JS engine pays for every array and boxed number): reused typed arrays, an
  // integer hot key, the projection inlined
  const nl = list.length; if (PFC_KIND.length < nl) PFC_KIND = new Uint8Array(nl * 2);
  const kind = PFC_KIND, F = PFK_OF; kind.fill(0, 0, nl); F.n = 0; // kind: 0 moving, 1 static (in the chunks)
  const cs = CA * RS, sn = SA * RS, ks = K * RS, Sk = PFK_S, om = PFK_OL.mg; // v9: items that can draw into an on-screen chunk are never deferred
  const nx0 = Math.floor(-CX / Sk) * Sk - om[0], nx1 = (Math.floor((W - CX - 1) / Sk) + 1) * Sk + om[0], ny0 = Math.floor(-CY / Sk) * Sk - om[1], ny1 = (Math.floor((H - CY - 1) / Sk) + 1) * Sk + om[2];
  const prof = PFC_F % 30 === 0, PT = prof ? (PFC_ST.scanProf = { tree: 0, crop: 0, spr: 0, stack: 0, hot: 0, n: 0 }) : null; let t0 = 0, t1 = 0; // panel: where the scan's time goes (1 frame in 30)
  for (let i = 0; i < nl; i++) { const o = list[i];
    if (prof) t0 = performance.now();
    if (o.rain || o.bb || o.partyKey || (o.spr && o.w && !o.sway) || (o.ci !== undefined && o.glow) || (!ns && (o.tree || o.ci !== undefined || (o.spr && o.sway)))) continue;
    let sub;
    // v8: a picture made for the first time (a stack at this angle, a tree's look) can take tens of ms; past this frame's share,
    // one that is still off screen waits for a later frame, and the chunks it can draw into are not started until it is in
    const rx = Math.round(o.x * cs - o.y * sn), ry = Math.round((o.x * sn + o.y * cs) * K), off = rx < nx0 || rx > nx1 || ry < ny0 || ry > ny1;
    if (o.tree) { // frozen pose and no lean: the tree's cached look cannot change, so skip re-keying it (the key string is costly)
      const still = ns || Math.abs(o.lean || 0) < 1e-3, k0 = o._ck;
      if (ns && still && k0 && k0.__pfcStill && k0.__pfcKey === k0.key) sub = k0.__pfcH;
      else { if (off && PFK_CT > PFK_CB) { pfkDefer(rx, ry); continue; } const tc = performance.now(), k = treeCache(o, treePoseT(o)), dt = performance.now() - tc; PFK_CT += dt; if (dt > 15) pfkSlow('tree', dt); sub = k.__pfcH = pfcStr(pfcId(k), k.key); k.__pfcKey = k.key; k.__pfcStill = still; } }
    else if (o.ci !== undefined) sub = 9e5 + o.ci * 4 + (o.giant ? 2 : 0) + (o.flip ? 1 : 0);
    else if (o.spr) sub = pfcMix(pfcId(o.spr), (o.lift || 0) * 64 + (o.sway ? 7 : 0));
    else { const a = ns ? pfcQ(AQ + (o.rot || 0)) : AQ + (o.rot || 0); let k = o.m._ck && o.m._ck.get(a); // no LRU touch per frame
      if (!k) { const big = pfjBig(o.m); if (off && (big || PFK_CT > PFK_CB)) { if (big) pfjWant(o.m, a, Math.abs(rx + CX - W / 2) + Math.abs(ry + CY - H / 2)); pfkDefer(rx, ry); continue; } const tc = performance.now(); k = stackCanvas(o.m, a); const dt = performance.now() - tc; PFK_CT += dt; if (dt > 15) pfkSlow('stack' + o.m.w + 'x' + o.m.d + 'x' + o.m.h, dt); }
      sub = pfcMix(pfcId(k), Math.round(o.z || 0)); }
    // a thing whose look changes once (a crop grows) is patched into the layer; one that keeps changing (a tree being shaken or
    // chopped, an animated sign) is drawn as moving for a while instead. Key: kind, half-unit spot, height (30 bits: a small int)
    if (prof) { t1 = performance.now(); PT[o.tree ? 'tree' : o.ci !== undefined ? 'crop' : o.spr ? 'spr' : 'stack'] += t1 - t0; PT.n++; }
    const key = ((((o.tree ? 1 : o.spr ? 2 : o.ci !== undefined ? 3 : 0) * 4096 + ((Math.round(o.x * 2) + 1024) & 4095)) * 4096 + ((Math.round(o.y * 2) + 1024) & 4095)) * 8 + ((o.z | 0) & 7)) | 0;
    const e = PFC_HOT.get(key); if (!e) PFC_HOT.set(key, { h: sub, hot: 0, chg: -1e9 }); else if (e.h !== sub) { e.h = sub; if (PFC_F - e.chg < 45) e.hot = PFC_F + 45; e.chg = PFC_F; }
    if (prof) PT.hot += performance.now() - t1;
    if (e && e.hot > PFC_F) continue;
    kind[i] = 1; pfkPush(F, key, sub, rx, ry, o.depth, o, i); }
  if (ns) { if (PFK_STILL > 15) pfjWarm(allTiles); if (PFJ.cur || PFJ.q.length) pfjRun(Math.max(1, PFK_CB - PFK_CT)); }
  tick('o.scan');
  // the list reaches PFK_PADS past the screen (every static's own onScreen pad is at least 30): there it is complete
  const P = PFK_PADS, vis = pfkRun(PFK_OL, F, [-CX - P[0] - 29, -CY - P[2] - 29, W - CX + P[1] + 29, H - CY + P[3] + 119]); tick('o.build');
  pfkBlit(vis, PFK_OL); tick('o.cache');
  let fi = 0, dyn = 0, redraw = 0;
  for (let i = 0; i < nl; i++) { if (kind[i]) continue;
    const o = list[i]; { const p = proj(o.x, o.y); if (p[0] < -100 || p[0] > W + 100 || p[1] < -100 || p[1] > H + 190) continue; } // the list reaches past the screen
    while (fi < F.n && F.li[fi] < i) fi++;
    dyn++; pfcDrawOne(pfcRec(ctx), o, poseT);
    if (PFR.x1 < PFR.x0 && !PFR.bad) continue;
    const bad = PFR.bad, x0 = PFR.x0 - CX, y0 = PFR.y0 - CY, x1 = PFR.x1 - CX, y1 = PFR.y1 - CY;
    let clipped = false; // the statics in front of it that it overlaps are drawn again inside its box, so the stacking order stays the same
    for (let q = fi; q < F.n; q++) { const rx = F.rx[q], ry = F.ry[q];
      if (!bad && (rx < x0 - 100 || rx > x1 + 100 || ry < y0 - 100 || ry > y1 + 190)) continue;
      const b = pfkCached(PFK_OL, F.key[q], F.sub[q], rx, ry); if (!b) continue;
      if (bad || pfkHit(b, x0, y0, x1, y1)) {
        if (!clipped && !bad) { clipped = true; ctx.save(); ctx.beginPath(); ctx.rect(Math.floor(PFR.x0), Math.floor(PFR.y0), Math.ceil(PFR.x1) - Math.floor(PFR.x0), Math.ceil(PFR.y1) - Math.floor(PFR.y0)); ctx.clip(); }
        pfcDrawOne(ctx, F.it[q], poseT); redraw++; } }
    if (clipped) ctx.restore(); }
  tick('o.dyn'); PFC_ST.statics = F.n; PFC_ST.dyn = dyn; PFC_ST.redraw = redraw; PFC_ST.chunks = PFK_OL.ch.size + PFK_SL.ch.size;
}
`;
export const CACHE_PATCHES = [
  // the object list reaches 2 margins (+60) past the screen while the cached layer is on: a layer drawn up to 1 margin away covers
  // 1 margin (+80) around its own screen, and all of that must stay in the list for its key to stay the same
  ['function onScreen(x, y, pad) { const [sx, sy] = proj(x, y); return sx > -pad', 'function onScreen(x, y, pad) { const [sx, sy] = proj(x, y); const P = window.__pfcPad4; if (P) return sx > -pad - P[0] && sx < W + pad + P[1] && sy > -pad - P[2] && sy < H + pad + 90 + P[3]; return sx > -pad'],
  ['  const list = [];\n  if (WX && WX.eachDrop)', '  if (window.__objCache && !window.__pfcAlbum) { pfkTick(); window.__pfcPad4 = PFK_PADS; } else window.__pfcPad4 = null; const list = [];\n  if (WX && WX.eachDrop)'],
  ['  if (FOG.on && !FOG.empty && !FOG.peek) { let n = 0; for (const o of list)', '  window.__pfcPad4 = null;\n  if (FOG.on && !FOG.empty && !FOG.peek) { let n = 0; for (const o of list)'],
  [SOIL_A, `  if (window.__soilCache && !window.__pfcAlbum) pfkSoil(allTiles); else {\n${SOIL_A} }`],
  ['  for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }', '  if (window.__objCache && !window.__pfcAlbum) pfcObjects(list, poseT, allTiles); else for (const o of list) {\n    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }'],
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
  // v7/v8: while dragging, a pond the screen edge cuts (its box changes every frame) is moved with the camera; it is recomputed
  // (a read-back and a new outline: tens of ms) only when the moved picture covers less than 55% of the new box, at most every 12th
  // frame (the strip it leaves shows the plain water of the ground under it until then)
  let cover = 1; if (drag && WS.img && WS.cam !== cam) { const ox = WS.bx + CX - WS.cx, oy = WS.by + CY - WS.cy, iw = Math.min(ox + WS.bw, bx + bw) - Math.max(ox, bx), ih = Math.min(oy + WS.bh, by + bh) - Math.max(oy, by); cover = iw > 0 && ih > 0 ? iw * ih / (bw * bh) : 0; WS.dn++; }
  if ((every > 1 || drag) && WS.img && WS.aq === AQ && (WS.cam === cam ? (drag || (++WS.n % every) !== 0) : drag && (cover >= 0.55 || WS.dn < 12))) {
    const sx = CX - WS.cx, sy = CY - WS.cy;
    if (WS.img !== 1) ctx.putImageData(WS.img, WS.bx + sx, WS.by + sy);
    for (const p of WS.decor) pondDecor.push(sx || sy ? [p[0] + sx, p[1] + sy].concat(p.slice(2)) : p);
    for (const p of WS.leaves) pondLeaves.push(sx || sy ? [p[0] + sx, p[1] + sy].concat(p.slice(2)) : p);
    return; }
  const d0 = pondDecor.length, l0 = pondLeaves.length; PFW_LAST = null; const tw = performance.now();
  paintWater0(t, box, key); if (window.__pfcStats) { const L = window.__pfcStats.wlog || (window.__pfcStats.wlog = []); const ms = performance.now() - tw; if (ms > 20) L.push(key + ' ' + bw + 'x' + bh + ' ' + Math.round(ms) + (WS.img ? '' : ' first') + (drag ? ' d' : '') + ' f' + PFC_F); if (L.length > 20) L.shift(); }
  WS.img = PFW_LAST || 1; WS.cam = cam; WS.n = 0; WS.dn = 0; WS.bx = bx; WS.by = by; WS.bw = bw; WS.bh = bh; WS.cx = CX; WS.cy = CY; WS.aq = AQ; WS.decor = pondDecor.slice(d0); WS.leaves = pondLeaves.slice(l0);
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
  ['function stackCanvas(m, a) {\n', 'function stackCanvas(m, a) {\n  if (window.__noSway) a = pfcQ(a);\n'],
  // v8: a big picture made ahead over several frames (PFJ) is only put here
  ['  const BW = w * SS, BH = h * SS; k.c = mk(w, h);\n', '  const BW = w * SS, BH = h * SS; k.c = mk(w, h);\n  { const PJ = window.__pfjPre && window.__pfjPre.get(m); if (PJ && PJ.a === a && PJ.w === w && PJ.h === h) { k.c.getContext(\'2d\').putImageData(PJ.out, 0, 0); k.done(); return k; } }\n'],
  ['  k = { a }; map.set(a, k); k.done', '  k = { a }; map.set(a, k); if (window.__pfcStats) pfcStkNew(m); k.done'],
  // panel: stack pictures dropped by the LRU (see also EXP/WORKS warm patches below) (they get rebuilt when shown again)
  ["const [ok, om] = STK.entries().next().value; STK.delete(ok);", "const [ok, om] = STK.entries().next().value; STK.delete(ok); if (window.__pfcStats) window.__pfcStats.stkEvict++;"],
  ['function paintWater(t, box, key) {', WATER_WRAP],
  ['  ctx.putImageData(img, bx, by);\n}', '  ctx.putImageData(img, bx, by); PFW_LAST = img;\n}'],
  // the 3 s blank-cache check rebuilds every stack and tree canvas when it fires; count it (panel) and, if a rebuild does not
  // make the check pass (a read-back that just reads empty on this canvas engine, while the farm visibly renders), stop checking
  ['function rebuildCaches(why) {\n', 'function rebuildCaches(why) {\n  if (window.__pfcStats) { window.__pfcStats.wipe++; window.__pfcStats.wipeWhy = String(why).slice(0, 12); }\n'],
  ["setInterval(() => { if (!document.hidden && cacheBlank()) rebuildCaches('blank cache detected'); }, 3000);",
   "let PF_BLANK = 0; setInterval(() => { if (document.hidden || window.__blankOff) return; if (!cacheBlank()) { PF_BLANK = 0; return; } if (++PF_BLANK > 2) { window.__blankOff = 1; if (window.__pfcStats) window.__pfcStats.blankOff = 1; return; } rebuildCaches('blank cache detected'); }, 3000);"],
];
// v7: the expansion and workshop modules warm their models' per-angle pictures in the background (each one a new GPU canvas on
// Krypton, ~15/s on a phone for minutes); off whenever the landing turns warming off (window.__noWarm), like game.js's own warmer
export const WARM_PATCHES = {
  'expansion.js': [["const step = () => { if (X.manual) return; const t0 = performance.now(), b = Math.round(X.cam.ta / X.ASTEP); if (b !== base) { base = b; n = 0; idx = 0; }\n      while (n <= 12",
    "const step = () => { if (X.manual || window.__noWarm) return; const t0 = performance.now(), b = Math.round(X.cam.ta / X.ASTEP); if (b !== base) { base = b; n = 0; idx = 0; }\n      while (n <= 12"]],
  'works-art.js': [["const step = () => { if (X.manual) return; const t0 = performance.now(), b = Math.round(X.cam.ta / X.ASTEP); if (b !== base) { base = b; n = 0; idx = 0; }\n      while (n <= 8",
    "const step = () => { if (X.manual || window.__noWarm) return; const t0 = performance.now(), b = Math.round(X.cam.ta / X.ASTEP); if (b !== base) { base = b; n = 0; idx = 0; }\n      while (n <= 8"]],
};
export const ICON_PATCHES = [
  // fishing: blit made a new canvas from the same sprite every frame; keep one per sprite
  ['    const c = canvasOf(img); if (!c) return;\n    const s = (opt && opt.scale) || 1', '    const c = img.__cv || (img.__cv = canvasOf(img)); if (!c) return;\n    const s = (opt && opt.scale) || 1'],
];
