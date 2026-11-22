// 像素堆叠 · 放置农场 v3 · 风格 A —— all art is generated in code: voxel functions -> slices (sprite stacking),
// plus a hand-authored 2D billboard farmer (the usual hybrid in sprite-stacking games).
'use strict';
(() => {
// ---------- config ----------
const FB = (window.PFPlatform && window.PFPlatform.framebuffer) || null; // xhs: mobile passes a portrait size
const VIEW = (new URLSearchParams(location.search).get('view') || '').match(/^(\d+)x(\d+)$/); // v5.5.0: ?view=WxH, wide screenshots only
const BW = 426, BH = 266; // the reference framebuffer: its whole-number scale on this screen sets the pixel size (3x on 1280x800)
// v5.11.0.5.2: the framebuffer grows to cover the window at that pixel size (fit), so the picture always fills the screen; ?view=WxH stays fixed for wide screenshots
// xhs: mobile passes a fixed portrait framebuffer (PFPlatform.framebuffer) and keeps it
let W = VIEW ? Math.min(1600, +VIEW[1]) : FB ? FB.w : BW, H = VIEW ? Math.min(1000, +VIEW[2]) : FB ? FB.h : BH;
const RS = 2;                    // screen px per world unit: one 8-unit tile = 16 px, the classic 16-bit tile
const K = 0.75;                  // vertical squash (camera tilt)
const TILE = 8, COLS = 24, ROWS = 16, WW = COLS * TILE, WH = ROWS * TILE;
const M = 40;                    // forest margin around the home farm (world units)
const AN = window.PFAnimals; // v4.5: animal care rules
const SU = window.PFSurprise; // v5.1: glowing / giant crops, rare gifts
const BOOK = window.PFCodex; // v5.4.0: the collection book, achievements and milestones
const WX = window.PFWeather, INS = window.PFInsects; // v5.4.3: light rain and insects
const WA = window.PFWood; // v5.3.1: wood automation (auto chopping, axe levels, the lumber hut)
const PL = window.PFPlots, XP = window.PFExpand; // v5.5.0: the outer ring (plots.js rules, expansion.js art)
const WD = window.PFWorld, WORLD = WD.WORLD, FS = window.PFFish, NAV = window.PFPath; // v4.6: the big map (64 x 50 tiles), seaside to the south; the farm keeps its 0..192 x 0..128 coordinates
const SLT = window.PFSlots; // v5.10.3: tidy decoration spots (slots.js)
const MK = window.PFMarket; // v5.10.3: 集市 (market.js rules; art in town-art.js)
const BK = window.PFBakery; // v5.10.4: 面包房 + 订单板 (bakery.js rules; art in town-art.js)
const WS = window.PFWoodshop; // v5.10.5: 木工坊 (woodshop.js rules; art in town-art.js)
const SM = window.PFSmithy; // v5.10.5: 铁匠铺 (smithy.js rules; art in town-art.js)
const HL = window.PFHall; // v5.10.0: 镇公所, the board's projects, gifts to the town (hall.js rules; art in town-art.js)
const TN = window.PFTown, TA = window.PFTownArt, WORLD55 = WD.WORLD55 || WORLD; // v5.8.0 phase 10: the town east of 东大道 (town.js rules, town-art.js art)
if (TN) for (const k in TN.STREETS) if (!WD.ROUTES[k]) WD.ROUTES[k] = TN.STREETS[k]; // the town's streets are routes like the farm lanes
const HM = window.PFHome, HA = window.PFHomeArt; // v5.9.0 phase 11: closeness, the new house, the married children's little farms (home.js rules, home-art.js art)
const CR = window.PFCareers; // v5.10.6: 成家后的出路 (careers.js rules; walking here, art in town-art.js)
const IN = window.PFInn, IA = window.PFInnArt; // v5.10.7: 民宿 + 农家菜馆; v5.10.8: 海边度假村 + 二层客栈
const SC = window.PFSchool, LB = window.PFLibrary, CL = window.PFClinic, FV = window.PFFestival; // v5.10.9–v5.10.11
// v5.11.0: 东大道 and the town's main street are laid in stone once the road is bought: everyone walks 1.3x faster on them
const roadBuilt = () => !!(S.plots && S.plots.eroad && S.plots.eroad.mod === 'road');
const aveWalk = (x, y) => (TN && TN.onAvenue && TN.onAvenue(x, y) && roadBuilt() ? TN.AVENUE.walk : 1);
const DY = window.PFDiary; // v5.10.13: the family's daily diary (diary.js rules, diary-ui.js panel)
const ALB = window.PFAlbum; // v5.11.0.11: the photo album (album.js rules, album-ui.js panel)
const GM = 28, GX0 = WORLD.x0 - GM, GY0 = WORLD.y0 - GM; // the ground canvas covers the whole world plus a margin
// ---------- v5.11.0.13 未开放区域的迷雾 (fog.js): an opaque bank of drifting pixel cloud over the 农家乐区 / 小镇 until each one opens ----------
// v5.11.0.6 put a see-through shade there and every roof still showed. Now: a mask canvas (one pixel per world unit over fog.js
// BOUNDS, opaque or clear, dithered rim) is drawn with the ground's own transform into a screen-sized layer, the cloud tiles fill
// it (source-in, then wisps source-atop, each drifting at its own slow pace in world space) and the layer goes on top of the
// objects. Nothing standing where the cloud is solid is drawn at all (objects, shadows, lights, NPCs, particles), taps there
// only say how the district opens, and the minimap gets the same bank. The mask is rebuilt only when a lock changes; the
// reveal repaints it for FADE seconds. Nothing is saved: the locks are read from the shop / town / inn state.
const FG = window.PFFog || null;
const FOG = { on: !!FG, init: false, key: '', shut: null, L: null, road: false, F: null, from: null, to: null, buf: null, t0: 0, fading: false,
  c: null, img: null, A: null, memb: {}, next: 0, empty: true, mmDirty: false, lockA: { agri: 0, town: 0 }, lockFrom: null, btnKey: '', ver: 0, scr: null, scrKey: '', tex: null };
function fogCtx() {
  const I = S.inn, inn = !!(IN && I && (IN.anyInn ? IN.anyInn(I) : ((I.cabins | 0) > 0 || (I.inn2 | 0) > 0 || IN.dinerUp(I) || (I.job && /^(cabin|diner|kitchen|inn2)$/.test(I.job.id)))) || (IN && S.plots && IN.innPlotOf(S.plots)));
  return { town: townOpen(), lv: TN && S.town ? townLv() : 0, inn, coast: !!(S.eff && S.eff.regions && S.eff.regions.includes('coast')),
    plots: S.plots || {}, schoolDays: TN && S.town ? TN.schoolDays(S.town) : 0 };
}
function fogReset() { FOG.init = false; FOG.key = ''; FOG.next = 0; FOG.fading = false; FOG.from = FOG.to = null; FOG.scrKey = ''; }
function fogTex() { // the two cloud tiles (fog.js cloudTex), made once
  if (FOG.tex) return FOG.tex; const t = {};
  for (const [k, n] of [['body', 128], ['wisp', 96]]) { const c = mkc(n, n), g = c.getContext('2d'), im = g.createImageData(n, n); im.data.set(FG.cloudTex(n, k)); g.putImageData(im, 0, 0); t[k] = c; }
  return (FOG.tex = t); }
function fogPaint(F, box) {
  if (!FOG.c) { FOG.c = mkc(FG.GW, FG.GH); FOG.img = FOG.c.getContext('2d').createImageData(FG.GW, FG.GH); FOG.A = new Uint8Array(FG.GW * FG.GH); box = null; }
  FG.paint(F, FOG.img.data, box, FOG.A); const g = FOG.c.getContext('2d'); FOG.ver++;
  if (box) g.putImageData(FOG.img, 0, 0, box[0], box[1], box[2] - box[0], box[3] - box[1]); else g.putImageData(FOG.img, 0, 0);
  // (variable framebuffer) a tall or wide window sees past the north / east edge of the map, so the bank carries on there:
  // EDGE cells deep strips made by repeating the outer 4 rows / columns of the mask (one dither period, so no seam), plus the corner
  if (!FOG.eN) { FOG.eN = mkc(FG.GW, FOG_EDGE); FOG.eE = mkc(FOG_EDGE, FG.GH); FOG.eNE = mkc(FOG_EDGE, FOG_EDGE); }
  const n = FOG.eN.getContext('2d'), e = FOG.eE.getContext('2d'), c = FOG.eNE.getContext('2d'); n.clearRect(0, 0, FG.GW, FOG_EDGE); e.clearRect(0, 0, FOG_EDGE, FG.GH); c.clearRect(0, 0, FOG_EDGE, FOG_EDGE);
  for (let k = 0; k < FOG_EDGE; k += 4) { n.drawImage(FOG.c, 0, 0, FG.GW, 4, 0, k, FG.GW, 4); e.drawImage(FOG.c, FG.GW - 4, 0, 4, FG.GH, k, 0, 4, FG.GH);
    for (let m = 0; m < FOG_EDGE; m += 4) c.drawImage(FOG.c, FG.GW - 4, 0, 4, 4, k, m, 4, 4); }
}
const FOG_EDGE = 64;
function fogUpdate(force) {
  if (!FOG.on || !S.eff) return;
  if (force || !FOG.init || realT >= FOG.next || realT < FOG.next - 1) { FOG.next = realT + 0.25;
    const c = fogCtx(), L = FG.locked(c), road = roadBuilt(), shut = { agri: L.agri, town: L.town }, key = [shut.agri, shut.town, road].join();
    FOG.L = L; FOG.ctxv = c; FOG.road = road;
    if (key !== FOG.key) {
      const memb = FOG.memb[road] || (FOG.memb[road] = FG.membership({ road })), nf = FG.field(memb, shut), was = FOG.shut;
      const lifts = FOG.init && was && FOG.F && ((was.agri && !shut.agri) || (was.town && !shut.town) || (road && !FOG.road0));
      if (lifts) { if (FOG.fading) FOG.F = FG.reveal(FOG.from, FOG.to, FOG.e || 0, FOG.buf, FOG.fbox); FOG.from = FOG.F === FOG.buf ? FOG.buf.slice() : FOG.F; FOG.to = nf; FOG.fbox = FG.diffBox(FOG.from, nf); FOG.buf = FOG.from.slice(); FOG.t0 = realT; FOG.e = 0; FOG.fading = true; FOG.lockFrom = Object.assign({}, FOG.lockA); FOG.dirty = true; }
      else { FOG.F = nf; FOG.fading = false; FOG.dirty = true; FOG.box = null; for (const id of FG.ZONE_IDS) FOG.lockA[id] = shut[id] ? 1 : 0; }
      FOG.shut = shut; FOG.key = key; FOG.road0 = road; FOG.init = true; FOG.empty = !shut.agri && !shut.town && !FOG.fading; FOG.mmDirty = true;
    }
    fogButtons();
  }
  if (FOG.fading) {
    const u = Math.min(1, (realT - FOG.t0) / FG.FADE), e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); // ease in-out: the bank starts to stir, then rolls away
    for (const id of FG.ZONE_IDS) FOG.lockA[id] = FOG.shut[id] ? 1 : (FOG.lockFrom ? FOG.lockFrom[id] : 0) * Math.max(0, 1 - u * 3);
    if (u >= 1) { FOG.F = FOG.to; FOG.from = FOG.to = null; FOG.fading = false; FOG.dirty = true; FOG.box = FOG.fbox; FOG.empty = !FOG.shut.agri && !FOG.shut.town; FOG.mmDirty = true; }
    else { FOG.e = e; FOG.dirty = true; if (((realT * 4) | 0) !== ((FOG.mmT * 4) | 0)) { FOG.mmT = realT; FOG.mmDirty = true; } }
  }
}
// the mask is repainted at most once per drawn frame, only while something changed (a reveal step or a new lock state)
function fogRepaint() { if (!FOG.dirty) return; FOG.dirty = false; const box = FOG.box; FOG.box = null;
  if (FOG.fading) { FOG.F = FG.reveal(FOG.from, FOG.to, FOG.e || 0, FOG.buf, FOG.fbox); fogPaint(FOG.F, FOG.fbox); } else fogPaint(FOG.F, box); }
// is the cloud solid enough at a world point that whatever stands there is not drawn (and taps there go to the cloud)?
// Past the north / east map edge the bank carries on (the mask's outer row / column), as drawn.
function fogHid(x, y) {
  if (!FOG.on || FOG.empty || !FOG.A) return false; const B = FG.BOUNDS, i = Math.min(FG.GW - 1, Math.floor((x - B[0]) / FG.CELL)), j = Math.max(0, Math.floor((y - B[1]) / FG.CELL));
  return i >= 0 && j < FG.GH && FOG.A[j * FG.GW + i] >= FG.HIDE; }
const FOG_DRIFT = { body: [1.1, 0.35], wisp: [2.4, -0.8] }; // cells per second: the bank creeps east, the wisps a little faster and north
function drawFog() {
  if (!FOG.on || FOG.veil) return; fogRepaint(); if (!FOG.c || FOG.empty) return;
  const [gx, gy] = proj(GX0, GY0), B = FG.BOUNDS, s = FG.CELL * RS;
  // only the cells under the screen (like the ground): invert the four corners into fog cells, one cell of margin
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [px, py] of [[0, 0], [W, 0], [0, H], [W, H]]) { const rx = (px - CX) / RS, ry = (py - CY) / (K * RS), u = (rx * CA + ry * SA - B[0]) / FG.CELL, v = (-rx * SA + ry * CA - B[1]) / FG.CELL;
    x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v); }
  const vN = Math.floor(y0) - 1, uE = Math.ceil(x1) + 1, uW = Math.floor(x0) - 1, vS = Math.ceil(y1) + 1; // the screen in cells (past the edges too)
  x0 = clamp(uW, 0, FG.GW); y0 = clamp(vN, 0, FG.GH); x1 = clamp(uE, 0, FG.GW); y1 = clamp(vS, 0, FG.GH);
  if (uE <= 0 || uW >= FG.GW + 8 * FOG_EDGE || vS <= -8 * FOG_EDGE || vN >= FG.GH) return; // the bank is off screen
  const ox = (B[0] - GX0) * RS, oy = (B[1] - GY0) * RS, tx = Math.round(gx), ty = Math.round(gy);
  const db = FOG_DRIFT.body, dw = FOG_DRIFT.wisp, tc = FOG.clock != null ? FOG.clock : realT, q = v => Math.floor(tc * v * 2) / 2; // half-cell steps: one screen pixel at a time
  const key = [tx, ty, CA, SA, W, H, FOG.ver, q(db[0]), q(db[1]), q(dw[0]), q(dw[1])].join();
  if (!FOG.scr || FOG.scr.width !== W || FOG.scr.height !== H) { FOG.scr = mkc(W, H); FOG.scrKey = ''; }
  if (key !== FOG.scrKey) { FOG.scrKey = key; const g = FOG.scr.getContext('2d'), T = fogTex(); g.imageSmoothingEnabled = false;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    g.setTransform(CA, SA * K, -SA, CA * K, tx, ty);
    if (x1 > x0 && y1 > y0) g.drawImage(FOG.c, x0, y0, x1 - x0, y1 - y0, ox + x0 * s, oy + y0 * s, (x1 - x0) * s, (y1 - y0) * s);
    const E = FOG_EDGE, far = 8 * E; // at most 512 cells out, far more than any window shows
    if (x1 > x0) for (let v = 0; v > Math.max(vN, -far); v -= E) g.drawImage(FOG.eN, x0, 0, x1 - x0, E, ox + x0 * s, oy + (v - E) * s, (x1 - x0) * s, E * s);
    if (y1 > y0) for (let u = FG.GW; u < Math.min(uE, FG.GW + far); u += E) g.drawImage(FOG.eE, 0, y0, E, y1 - y0, ox + u * s, oy + y0 * s, E * s, (y1 - y0) * s);
    if (vN < 0 && uE > FG.GW) for (let u = FG.GW; u < Math.min(uE, FG.GW + far); u += E) for (let v = 0; v > Math.max(vN, -far); v -= E) g.drawImage(FOG.eNE, ox + u * s, oy + (v - E) * s, E * s, E * s);
    const rx0 = ox + uW * s, ry0 = oy + vN * s, rw = (uE - uW) * s, rh = (vS - vN) * s; // the screen, in ground pixels
    for (const [k, d, op] of [['body', db, 'source-in'], ['wisp', dw, 'source-atop']]) { const p = g.createPattern(T[k], 'repeat');
      p.setTransform(new DOMMatrix([s, 0, 0, s, ox + q(d[0]) * s, oy + q(d[1]) * s])); g.globalCompositeOperation = op; g.fillStyle = p; g.fillRect(rx0, ry0, rw, rh); }
    g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0); }
  ctx.drawImage(FOG.scr, 0, 0);
  // a small padlock and 「待解锁」 over each district still shut, quiet: the cloud already says "more map here"
  const bob = Math.round(Math.sin(realT * 2));
  for (const z of FG.ZONES) { const a = FOG.lockA[z.id] || 0; if (a <= 0.02 || !onScreen(z.label.x, z.label.y, 20)) continue; const [sx, sy] = proj(z.label.x, z.label.y), X = Math.round(sx), Y = Math.round(sy) + bob;
    ctx.globalAlpha = 0.8 * a; ctx.drawImage(LOCK, X - LOCK.width, Y - 2 * LOCK.height, LOCK.width * 2, LOCK.height * 2);
    ctx.font = '600 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#3e3f4c'; ctx.fillText('待解锁', X, Y + 3); ctx.globalAlpha = 1; }
}
// the minimap's bank: the same mask, filled with the cloud tile (still: the minimap redraws 4x a second), made when the mask changes
function fogMinimap() {
  if (!FOG.on || FOG.veil || !FOG.c || FOG.empty) return null; if (FOG.mmC && FOG.mmVer === FOG.ver) return FOG.mmC;
  const c = FOG.mmC = FOG.mmC || mkc(FG.GW, FG.GH), g = c.getContext('2d'); FOG.mmVer = FOG.ver;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, FG.GW, FG.GH); g.drawImage(FOG.c, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = g.createPattern(fogTex().body, 'repeat'); g.fillRect(0, 0, FG.GW, FG.GH); g.globalCompositeOperation = 'source-over';
  return c; }
// which shut district is under a world point, if the cloud is solid there (taps, hover), or null
const fogZone = (x, y) => { if (!fogHid(x, y)) return null; const id = FG.zoneOf(x, y); return id && FOG.shut && FOG.shut[id] ? id : null; };
const fogHint = id => (FOG.on && FOG.ctxv ? FG.hint(id, FOG.ctxv) : null);
function fogTap(w) { const id = fogZone(w.x, w.y), h = id && fogHint(id); if (h) { say(h); return true; } return false; }
function fogHover(e) { const w = toWorld(e.clientX, e.clientY), id = fogZone(w.x, w.y), t = (id && fogHint(id)) || ''; if (cv.title !== t) cv.title = t; return !!id; }
// the jump buttons under the minimap: dimmed (still clickable, to have a look) while their place is shut
function fogButtons() {
  if (!FOG.L) return; const L = FOG.L, key = [L.agri, L.town, L.beach, fogHint('town'), fogHint('agri')].join('|'); if (key === FOG.btnKey) return; FOG.btnKey = key;
  const jb = document.getElementById('mmJump'); if (!jb) return;
  for (const b of jb.querySelectorAll('button[data-j]')) { const id = b.dataset.j; if (!(id in L)) continue; if (b.dataset.t0 === undefined) b.dataset.t0 = b.title || '';
    b.classList.toggle('locked', !!L[id]); b.title = L[id] ? '待解锁 · ' + (fogHint(id) || b.dataset.t0) : b.dataset.t0; }
}
const Q = new URLSearchParams(location.search);
// ?speed= is a test-only clock multiplier for the tools (tools/soak.js, rec2.js); v5.10.2 keeps it to a local server so players have one speed
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
let SPEED = (DEV_HOST && +Q.get('speed')) || 1;
const MANUAL = Q.has('manual');
const PATHDEBUG = Q.has('path'); // ?path=1 draws the walkability grid and current routes
const MIN_PER_SEC = window.PFSim.MIN_PER_SEC, WALK = 7, WAKE = window.PFSim.WAKE, BEDTIME = window.PFSim.BEDTIME; // sim.js: about 5 real minutes a day

// ---------- rng / helpers ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// the simulation's random stream keeps its state in RNG.a, so it can be saved and restored (same maths as mulberry32)
const RNG = { a: (+Q.get('seed') || 20261116) | 0 };
const rand = () => { let a = RNG.a = (RNG.a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = (a, b) => a + rand() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1)), pick = a => a[Math.floor(rand() * a.length)];
const VR = (a, b) => a + Math.random() * (b - a), vpick = a => a[Math.floor(Math.random() * a.length)]; // visuals only: particles never move the farm's random stream
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hexc = {}; const hex = h => hexc[h] || (hexc[h] = (n => [n >> 16 & 255, n >> 8 & 255, n & 255])(parseInt(h.slice(1), 16)));
const hash3 = (x, y, z) => { let n = x * 374761393 + y * 668265263 + z * 2147483647; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
function pick2(r, a) { return a[Math.floor(r() * a.length)]; }
const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;

// ---------- palette (assets/palette.js): every voxel colour is a palette entry; shading only walks down its ramp ----------
const YD = window.PFYard, YA = window.PFYardArt; // v5.10.3: yard, stall and animal-care things (rules yard.js, art yard-art.js)
const PAL = window.PF_PALETTE, G = PAL.ramps.green, Wd = PAL.ramps.wood, Rf = PAL.ramps.roof, St = PAL.ramps.stone, Wt = PAL.ramps.water, Ac = PAL.ramps.accent, Ink = PAL.ramps.ink, Sk = PAL.ramps.skin;
// Every offscreen canvas is CPU-backed (willReadFrequently on its first getContext). Chrome can drop GPU canvas backings under
// memory pressure or after a long time in a background tab ("context lost": the canvas turns blank); CPU canvases never do, and
// the main canvas is CPU-backed too (shadows read it back every frame), so drawing between them needs no GPU readback.
const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }); return c; };
const u32 = h => { const [r, g, b] = hex(h); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; };
const OUTL = new Map(); for (const c of PAL.colors) OUTL.set(u32(c), u32(PAL.outlineOf[c] || Ink[0]));
const INK0 = u32(Ink[0]);
// selective outline: every transparent pixel touching the object takes the darkest colour of the neighbour's ramp
function outlineCanvas(c) {
  const w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true }), img = g.getImageData(0, 0, w, h), d = new Uint32Array(img.data.buffer), o = new Uint32Array(d.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (d[i] >>> 24) continue;
    const n = (y < h - 1 && d[i + w] >>> 24) ? i + w : (x > 0 && d[i - 1] >>> 24) ? i - 1 : (x < w - 1 && d[i + 1] >>> 24) ? i + 1 : (y > 0 && d[i - w] >>> 24) ? i - w : -1;
    if (n >= 0) o[i] = OUTL.get(d[n] | 0xff000000) || INK0; }
  for (let i = 0; i < d.length; i++) if (o[i]) d[i] = o[i];
  g.putImageData(img, 0, 0); return c;
}
// tiny hand-drawn 2D sprites (decals and billboards): rows of legend characters
const PIXK = { d: G[1], m: G[2], g: G[3], l: G[4], h: G[5], w: Wd[1], b: Wd[2], t: Wd[3], s: Wd[4], k: Wd[5], c: Ac[0], y: Ac[1], o: Ac[2], p: Ac[3], r: Rf[2], R: Rf[3], e: St[2], E: St[3], a: Wt[3], A: Wt[5], u: Wt[2], i: Ink[0], j: Ink[1] };
function pix(rows, outline = true) { const h = rows.length, w = Math.max(...rows.map(r => r.length)), c = mkc(w + 2, h + 2), g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PIXK[ch]) { g.fillStyle = PIXK[ch]; g.fillRect(x + 1, y + 1, 1, 1); } }));
  return outline ? outlineCanvas(c) : c; }

// ---------- voxel model -> slices (sprite stacking) ----------
// Shading follows the surface normal (taken from the occupancy around each surface voxel, so any roof pitch or sphere works):
//   top (normal mostly up) = authored colour; slope (roofs, upper canopy) = same, or one step darker when it faces screen-right;
//   wall = one step darker, two steps when it faces screen-right. The light is fixed to the screen, so each model keeps
//   16 lazily built slice sets, one per 22.5 degree sector of its on-screen angle. No gradients, no noise, no AO.
const NSEC = 16, ALLM = [];
function buildModel(w, d, h, fn, opt = {}) {
  w = Math.round(w); d = Math.round(d); h = Math.round(h);
  const N = w * d * h, vox = new Array(N).fill(null);
  const id = (x, y, z) => (z * d + y) * w + x;
  for (let z = 0; z < h; z++) for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) { const c = fn(x, y, z); if (c) { vox[id(x, y, z)] = c; if (!PAL.rampOf[c] && !PAL.darkOf[c]) console.warn('off-palette colour', c); } }
  const solid = (x, y, z) => z < 0 ? true : (x < 0 || y < 0 || x >= w || y >= d || z >= h) ? false : !!vox[id(x, y, z)];
  const foot = mkc(w, d), fctx = foot.getContext('2d'), fimg = fctx.createImageData(w, d);
  const cells = []; // per slice: [pixel, colour, class (0 top, 1 slope, 2 wall), nx, ny]
  for (let z = 0; z < h; z++) { const row = []; cells.push(row);
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) { const c = vox[id(x, y, z)]; if (!c) continue; fimg.data[(y * w + x) * 4 + 3] = 255;
      const exposed = !solid(x, y, z + 1) || !solid(x - 1, y, z) || !solid(x + 1, y, z) || !solid(x, y - 1, z) || !solid(x, y + 1, z);
      if (!exposed) { row.push([y * w + x, c, 2, 0, 1]); continue; }
      let nx = 0, ny = 0, nz = 0;
      if (fn.normal) { [nx, ny, nz] = fn.normal(x, y, z); const L = Math.hypot(nx, ny, nz) || 1, Lh = Math.hypot(nx, ny) || 1, cz = nz / L; // analytic (round shapes)
        row.push([y * w + x, c, opt.flat ? 0 : cz > 0.72 ? 0 : cz > 0.22 ? 1 : 2, nx / Lh, ny / Lh]); continue; }
      for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = dx * dx + dy * dy + dz * dz; if (q === 0 || q > 6) continue;
        if (!solid(x + dx, y + dy, z + dz)) { nx += dx; ny += dy; nz += dz; } }
      const L = Math.hypot(nx, ny, nz) || 1, Lh = Math.hypot(nx, ny) || 1, cz = nz / L;
      row.push([y * w + x, c, opt.flat ? 0 : cz > 0.9 ? 0 : cz > 0.3 ? 1 : 2, nx / Lh, ny / Lh]); } }
  fctx.putImageData(fimg, 0, 0);
  const m = { w, d, h, cells, foot, secs: new Array(NSEC), noOutline: !!opt.noOutline }; ALLM.push(m);
  m.slices = sliceSet(m, 0); return m;
}
// One atlas canvas per (model, sector): slice z sits in row z (stride d + 1, a transparent gap so nearest sampling never bleeds).
// v3.0 made one canvas per slice: ~10 000 canvases and 120 MB+ of backing store after a few minutes, which is what made Chrome
// drop the canvases and blank the farm. drawSlice() draws one row of the atlas.
function sliceSet(m, s) {
  if (m.secs[s]) return m.secs[s];
  const a = s * 2 * Math.PI / NSEC, ca = Math.cos(a), sa = Math.sin(a), st = m.d + 1, out = { c: null, has: new Array(m.h).fill(false), w: m.w, d: m.d, st, length: 0 };
  const c = mkc(m.w, Math.max(1, st * m.h)), g = c.getContext('2d'), img = g.createImageData(c.width, c.height), d32 = new Uint32Array(img.data.buffer);
  for (let z = 0; z < m.h; z++) { const row = m.cells[z]; if (!row.length) continue; out.has[z] = true; out.length++;
    const off = z * st * m.w;
    for (const [p, col, cls, nx, ny] of row) { const sx = nx * ca - ny * sa; // which way this face points on screen
      const step = cls === 0 ? 0 : cls === 1 ? (sx > 0.35 ? 1 : 0) : (sx > 0.35 ? 2 : 1);
      d32[off + p] = u32(PAL.dark(col, step)); } }
  g.putImageData(img, 0, 0); out.c = c;
  return (m.secs[s] = out);
}
const drawSlice = (g, sl, i, x, y) => g.drawImage(sl.c, 0, i * sl.st, sl.w, sl.d, x, y, sl.w, sl.d);
const secOf = a => ((Math.round(a / (2 * Math.PI / NSEC)) % NSEC) + NSEC) % NSEC;
const slicesAt = (m, a) => sliceSet(m, secOf(a));

const ellN = (cx, cy, cz, rx, ry, rz) => (x, y, z) => [(x + 0.5 - cx) / (rx * rx), (y + 0.5 - cy) / (ry * ry), (z + 0.5 - cz) / (rz * rz)];
// ---------- buildings (voxel = 1 screen px; walls 1 px per slice) ----------
// gable roof with the ridge along y: slopes face +-x, the gable triangle faces the viewer (like the A mock)
function gableY(x, y, z, o) {
  const k = z - o.z0; if (k < 0 || y < o.y0 || y > o.y1) return null;
  const a = o.x0 + k / o.pitch, b = o.x1 - k / o.pitch; if (x < a || x > b) return null;
  const shell = x < a + 2.6 || x > b - 2.6;
  if (!shell) return (y >= o.fy0 && y <= o.fy1) ? 'fill' : null;
  if (b - a < 4) return o.ridge;
  if (y <= o.y0 + 1 || y >= o.y1 - 1) return o.trim;          // barge boards along the gable edge
  return (k % 6 === 5) ? o.line : o.base;                      // one dark line per 6-slice course, nothing finer (D: low detail)
}
let WIN_CURT = 0; // v5.10.3 窗花和窗帘: set while houseModel builds a house with curtains
function win(u, v, u0, v0, s = 10) { // window on a wall: u along the wall, v = z
  const du = u - u0, dv = v - v0; if (du < 0 || du >= s || dv < 0 || dv >= s) return null;
  if (du <= 1 || du >= s - 2 || dv <= 1 || dv >= s - 2) return Ac[0];
  if (du === (s >> 1)) return Ac[0];
  if (WIN_CURT) { if ((du === 2 || du === s - 3) && dv >= 3) return dv === s - 4 ? Ac[2] : Ac[3]; if (du >= 3 && du <= s - 4 && dv === 2) return Rf[2]; } // curtains tied back, a paper cut at the sill
  return (du >= 2 && du <= 3 && dv >= s - 5) ? Wt[5] : Wt[3];
}
const HOUSE_DIM = { w: 70, d: 58, chim: [53, 20, 74] }; // the first cottage; chimney top (model px) for the smoke
// v5.0: four house tiers (小木屋 / 大木屋 / 二层农舍 / 庄园). The main block stays where it was; a bigger house adds an east
// annex, then a second storey, then a west wing and a front porch. OX: model px west of the main block; up: the extra storey.
const houseShape = tier => { const OX = tier >= 3 ? 30 : 0, AW = tier >= 1 ? 32 : 0, up = tier >= 2 ? 22 : 0; return { OX, AW, up, w: 70 + OX + AW, d: 58, h: 76 + up }; };
const ROOF_TONES = [[Rf[2], Rf[1]], [G[2], G[1]], [Wt[2], Wt[1]], [St[1], St[0]]]; // v5.10.3 屋顶换色: red (the old roof), green, blue, slate
function houseModel(tier = 0, look = {}) {
  const { OX, up, w, d, h } = houseShape(tier), X0 = 8, X1 = 61, Y0 = 8, Y1 = 49, ZW = 34 + up, [rb, rl] = ROOF_TONES[look.roof | 0] || ROOF_TONES[0];
  const roof = { z0: ZW + 1, pitch: 0.92, x0: 3, x1: 66, y0: 4, y1: 53, fy0: Y0, fy1: Y1, base: rb, line: rl, ridge: rl, trim: Wd[2] };
  const annexRoof = { z0: 25, pitch: 0.92, x0: 60, x1: 93, y0: 12, y1: 53, fy0: 16, fy1: Y1, base: rb, line: rl, ridge: rl, trim: Wd[2] };
  const wingRoof = { z0: 27, pitch: 0.92, x0: -31, x1: 11, y0: 12, y1: 53, fy0: 16, fy1: Y1, base: rb, line: rl, ridge: rl, trim: Wd[2] };
  WIN_CURT = look.curt ? 1 : 0;
  const planks = z => (z - 3) % 5 === 4 ? Wd[3] : Wd[4];
  const block = (x, y, z, x0, x1, y0, y1, zw, wins) => { // a plank room: corner posts, eave beam, windows on the long walls
    if (z < 3 || z > zw || x < x0 || x > x1 || y < y0 || y > y1) return undefined;
    const front = y >= y1 - 1, back = y <= y0 + 1, sideL = x <= x0 + 1, sideR = x >= x1 - 1;
    if (!(front || back || sideL || sideR)) return Wd[4];
    if ((sideL || sideR) && (front || back)) return Wd[2];
    if (z >= zw - 1) return Wd[2];
    if (front || back) for (const u0 of wins) { const wv = win(x, z, u0, 12); if (wv) return wv; }
    return planks(z);
  };
  const m = buildModel(w, d, h, (mx, y, z) => {
    const x = mx - OX; // main-block coordinates (the first cottage's)
    if (x >= 51 && x <= 56 && y >= 17 && y <= 23 && z >= 44 + up && z <= 74 + up) return z >= 72 + up ? St[1] : (z % 6 === 0 ? St[1] : St[2]);   // chimney
    if (z <= 2 && x >= X0 - 1 && x <= X1 + 1 && y >= Y0 - 1 && y <= Y1 + 1) return (z === 2 || (x + 2 * Math.floor(z / 2)) % 7) ? St[2] : St[1];
    if (z <= 1 && y > Y1 + 1 && y <= Y1 + 4 && x >= 28 && x <= 41) return St[3];                                                    // step
    if (tier >= 3 && y > Y1 + 1 && y <= Y1 + 7 && x >= X0 && x <= X1) {                                                              // porch: deck, posts, a flat roof
      if (z <= 1) return x >= 28 && x <= 41 ? St[3] : (x & 1 ? Wd[3] : Wd[4]);
      if ((x === X0 || x === X0 + 1 || x === X1 || x === X1 - 1 || x === 20 || x === 49) && y >= Y1 + 6 && z <= 29) return Wd[2];
      if (z >= 30 && z <= 31) return z === 31 && (x + y) % 6 === 0 ? Wd[2] : Rf[1];
      if (y >= Y1 + 6 && z === 10 && !(x >= 28 && x <= 41)) return Wd[2];                                                     // porch rail
      return null;
    }
    if (y >= Y1 + 1 && y <= Y1 + 2 && z >= 8 && z <= 11 && ((x >= 13 && x <= 24) || (x >= 45 && x <= 56)))                          // flower boxes
      return z === 11 ? ((x % 3 === 0) ? Ac[3] : (x % 3 === 1) ? G[3] : Ac[1]) : Wd[2];
    if (z >= 3 && z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y >= Y1 - 1, back = y <= Y0 + 1, sideL = x <= X0 + 1, sideR = x >= X1 - 1;
      if (!(front || back || sideL || sideR)) return Wd[4];
      if ((sideL || sideR) && (front || back)) return Wd[2];                                  // corner posts
      if (z >= ZW - 1 || (up && (z === 34 || z === 35))) return Wd[2];                     // eave beam (and the floor beam of the upper storey)
      if (front) {
        if (x >= 29 && x <= 40 && z <= 24) { if (x <= 30 || x >= 39 || z >= 23) return Wd[1]; if (x === 37 && z === 13) return Ac[1]; return x === 34 || x === 35 ? Wd[1] : Wd[2]; }
        const wv = win(x, z, 13, 12) || win(x, z, 47, 12) || (up && (win(x, z, 13, 40) || win(x, z, 30, 40) || win(x, z, 47, 40))); if (wv) return wv;
      }
      if (sideL || sideR) { const wv = win(y, z, 24, 12) || (up && win(y, z, 24, 40)); if (wv) return wv; }
      if (back) { const wv = win(x, z, 30, 12) || (up && win(x, z, 30, 40)); if (wv) return wv; }
      return planks(z);
    }
    const r = gableY(x, y, z, roof);
    if (r === 'fill') { if (y >= Y1 - 1 || y <= Y0 + 1) { const wv = win(x, z, 30, 43 + up); if (wv) return wv; } return planks(z); }
    if (r) return r;
    if (tier >= 1) { // east annex: a lower room against the east wall
      if (z <= 2 && x >= 61 && x <= 91 && y >= 15 && y <= Y1 + 1) return z === 2 ? St[2] : St[1];
      const b = block(x, y, z, 62, 90, 16, Y1, 24, [66, 78]); if (b !== undefined) return b;
      const ar = gableY(x, y, z, annexRoof); if (ar === 'fill') return planks(z); if (ar) return ar;
    }
    if (tier >= 3) { // west wing
      if (z <= 2 && x >= -28 && x <= 7 && y >= 15 && y <= Y1 + 1) return z === 2 ? St[2] : St[1];
      const b = block(x, y, z, -27, 7, 16, Y1, 26, [-23, -10]); if (b !== undefined) return b;
      const wr = gableY(x, y, z, wingRoof); if (wr === 'fill') return planks(z); if (wr) return wr;
    }
    return null;
  });
  WIN_CURT = 0; return m;
}
// where the house prop stands so the main block (and its door) stays put, and where its chimney smoke comes out
const housePlace = tier => { const { OX, w } = houseShape(tier); return { x: HOUSE.x - (35 + OX - w / 2) / 2, y: HOUSE.y }; };
const houseSmoke = tier => ({ x: HOUSE.x + 9.25, y: HOUSE.y - 4.5, z: 38 + houseShape(tier).up / 2 });
const BARN_DIM = { w: 64, d: 52 };
function barnModel() {
  const { w, d } = BARN_DIM, X0 = 6, X1 = 57, Y0 = 8, Y1 = 43, ZW = 28;
  const roof = { z0: ZW + 1, pitch: 0.95, x0: 2, x1: 61, y0: 4, y1: 47, fy0: Y0, fy1: Y1, base: St[2], line: St[1], ridge: St[1], trim: Ac[0] };
  return buildModel(w, d, 62, (x, y, z) => {
    if (z <= 1 && x >= X0 - 1 && x <= X1 + 1 && y >= Y0 - 1 && y <= Y1 + 1) return St[2];
    if (z <= 1 && y > Y1 + 1 && y <= Y1 + 5 && x >= 19 && x <= 44) return Wd[3];                                                   // ramp
    if (z >= 2 && z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y >= Y1 - 1, back = y <= Y0 + 1, sideL = x <= X0 + 1, sideR = x >= X1 - 1;
      if (!(front || back || sideL || sideR)) return Rf[3];
      if ((sideL || sideR) && (front || back)) return Ac[0];
      if (z >= ZW - 1) return Ac[0];
      if (front && x >= 21 && x <= 42 && z <= 22) { const u = x - 21, v = z - 2;
        if (u <= 1 || u >= 20 || v >= 19 || u === 10 || u === 11) return Ac[0];
        const hu = u < 10 ? u - 2 : u - 12; if (Math.abs(hu - v * 7 / 18) < 1 || Math.abs(7 - hu - v * 7 / 18) < 1) return Ac[0];
        return Rf[2]; }
      if ((sideL || sideR) && z >= 12 && z <= 19 && y >= 22 && y <= 29) return (z <= 13 || z >= 18 || y <= 23 || y >= 28) ? Ac[0] : Ink[1];
      return (front || back) ? ((x % 6 === 0) ? Rf[2] : Rf[3]) : ((y % 6 === 0) ? Rf[2] : Rf[3]);   // vertical boards
    }
    const r = gableY(x, y, z, roof);
    if (r === 'fill') { if (y >= Y1 - 1 && x >= 26 && x <= 37 && z >= 34 && z <= 44) return (x <= 27 || x >= 36 || z <= 35 || z >= 43) ? Ac[0] : (z <= 38 ? Ac[1] : Ink[1]);
      return (y >= Y1 - 1 || y <= Y0 + 1) ? ((x % 6 === 0) ? Rf[2] : Rf[3]) : Rf[3]; }
    return r;
  });
}
function stallModel(part) { // 'back' (shelf, back posts, awning) or 'front' (counter, front posts): the keeper stands between them
  const w = 48, d = 28, keep = y => part === 'back' ? y <= 11 : y >= 12;
  return buildModel(w, d, 46, (x, y, z) => {
    if (!keep(y)) return null;
    const post = (x <= 2 || x >= 45) && (y <= 2 || (y >= 22 && y <= 24));
    if (post && z <= 38) return Wd[2];
    if (x >= 3 && x <= 44 && y >= 16 && y <= 25 && z <= 13) { if (z >= 12) return Wd[4]; return (x % 8 === 0) ? Wd[2] : Wd[3]; }     // counter
    for (const [x0, col] of [[6, Ac[2]], [19, G[4]], [32, Rf[3]]])                                                               // produce crates
      if (x >= x0 && x <= x0 + 9 && y >= 17 && y <= 24) { if (z === 14 || (z <= 16 && (x === x0 || x === x0 + 9 || y === 17 || y === 24))) return Wd[4]; if (z >= 15 && z <= 17) return col; }
    if (y >= 1 && y <= 4 && x >= 4 && x <= 43 && z >= 16 && z <= 21) return z === 16 ? Wd[2] : (z <= 20 && x % 10 !== 4) ? Ac[1] : null; // back shelf of sacks
    if (z >= 38 && z <= 45) { const yb = (45 - z) * 3.8; if (y >= yb - 1 && y <= yb + 4) return (Math.floor(x / 6) % 2) ? Rf[3] : Ac[0]; } // striped awning
    return null;
  });
}
function wellModel() {
  return buildModel(24, 24, 40, (x, y, z) => {
    const dd = Math.hypot(x - 11.5, y - 11.5);
    if (z <= 8 && dd >= 6.5 && dd <= 10.5) return (z === 8) ? St[3] : (z % 4 === 0 ? St[1] : St[2]);
    if (z === 5 && dd < 6.5) return Wt[2];
    if ((x <= 2 || x >= 21) && y >= 11 && y <= 12 && z >= 9 && z <= 28) return Wd[2];
    if (z === 24 && y >= 11 && y <= 12 && x >= 2 && x <= 21) return Wd[3];
    if (x >= 10 && x <= 13 && y >= 10 && y <= 13 && z >= 13 && z <= 16) return Wd[4];               // bucket
    const r = gableY(x, y, z, { z0: 28, pitch: 1.0, x0: 0, x1: 23, y0: 2, y1: 21, fy0: 99, fy1: -1, base: Rf[2], line: Rf[1], ridge: Rf[1], trim: Wd[2] });
    return r === 'fill' ? null : r;
  });
}
function fenceModel() { return buildModel(17, 3, 13, (x, y, z) => (x <= 2) ? (z < 13 ? Wd[3] : null) : (y === 1 && (z === 4 || z === 5 || z === 9 || z === 10)) ? Wd[4] : null); } // one post + two rails that run into the next post
// small props: clean shapes, one or two colours each
const benchModel = buildModel(18, 7, 10, (x, y, z) => (z === 5 && y <= 4) ? Wd[4] : ((x <= 1 || x >= 16) && z < 5 && y <= 4) ? Wd[2] : (y === 0 && z >= 6 && z <= 9 && x >= 1 && x <= 16) ? (z === 9 ? Wd[4] : Wd[3]) : null);
const hayModel = buildModel(18, 14, 12, Object.assign((x, y, z) => ell(x + 0.5, y + 0.5, z + 0.5, 9, 7, 0.5, 8.6, 6.6, 11) < 1 ? (z === 6 ? Wd[4] : Ac[1]) : null, { normal: ellN(9, 7, 0.5, 8.6, 6.6, 11) }));
const crateModel = buildModel(10, 10, 10, (x, y, z) => (x <= 0 || x >= 9 || y <= 0 || y >= 9 || z >= 9 || z <= 0) ? ((((x <= 0 || x >= 9) && (y <= 0 || y >= 9)) || ((z >= 9 || z <= 0) && (x <= 0 || x >= 9 || y <= 0 || y >= 9))) ? Wd[2] : Wd[4]) : null);
const logsModel = buildModel(16, 10, 9, (x, y, z) => { for (const [cy, cz] of [[2, 2], [7, 2], [4.5, 6]]) { const r = Math.hypot(y - cy, z - cz); if (r < 2.4) return (x === 0 || x === 15) ? (r < 1.1 ? Wd[3] : Wd[5]) : Wd[2]; } return null; });
const mailModel = buildModel(7, 9, 17, (x, y, z) => (x === 3 && y === 4 && z < 10) ? Wd[2] : (z >= 10 && z <= 14 && x >= 1 && x <= 5 && y >= 1) ? Rf[3] : (x === 6 && y === 3 && z >= 12 && z <= 16) ? Ac[1] : null);
// field clutter
function rockModel(seed) {
  const r = mulberry32(seed), cx = 5.5 + r(), cy = 4.5;
  const f = (x, y, z) => ell(x + 0.5, y + 0.5, z + 0.5, cx, cy, 0.2, 5.4, 4.3, 6.8) > 1 ? null : St[2]; f.normal = ellN(cx, cy, 0.2, 5.4, 4.3, 6.8);
  return buildModel(12, 10, 8, f);
}
function branchModel(seed) {
  const ang = 0.18 + (seed % 3) * 0.05;
  return buildModel(18, 8, 4, (x, y, z) => {
    const cy = 3.5 + (x - 9) * ang; if (Math.abs(y - cy) < 1.3 && z <= 2) return Wd[3];
    if (x >= 11 && x <= 15 && Math.abs(y - (cy + 1.5 + (x - 11) * 0.9)) < 0.8 && z <= 1) return Wd[3];
    if ((x === 16 || x === 1) && Math.abs(y - cy) < 1.5 && z <= 2) return G[3];
    return null;
  });
}
function pebbleModel(seed) { // a small stone, same palette and stacking path as the field rocks
  const r = mulberry32(seed), cx = 3.2 + r() * 0.5, cy = 2.6 + r() * 0.3;
  const rx = 3.0 + r() * 0.4, ry = 2.3 + r() * 0.3, rz = 2.5 + r() * 0.3;
  const f = (x, y, z) => ell(x + 0.5, y + 0.5, z + 0.5, cx, cy, 0.1, rx, ry, rz) > 1 ? null : (z >= 2 && hash3(x, y, seed) > 0.55 ? St[3] : St[2]);
  f.normal = ellN(cx, cy, 0.1, rx, ry, rz);
  return buildModel(8, 6, 4, f);
}
const CROPS = {
  carrot: { name: '胡萝卜', price: 9, top: Ac[2] },
  cabbage: { name: '卷心菜', price: 13, top: G[4] },
  pumpkin: { name: '南瓜', price: 21, top: Ac[2] },
  strawberry: { name: '草莓', price: 30, top: Rf[2] }, // basket colours only; prices live in sim.js
  watermelon: { name: '西瓜', price: 220, top: G[2] },
};
// tilled soil: a flat two-slice tile (furrow + ridges), rendered through the same rotation cache, so its rows never crawl
function soilModel(wet) { const base = wet ? Wd[0] : Wd[1], ridge = wet ? Wd[1] : Wd[2];
  return buildModel(17, 17, 2, (x, y, z) => z === 0 ? base : (y % 4 === 1 || y % 4 === 2) && y < 16 ? ridge : null, { noOutline: true }); }
// 2D sprites
const SPRITES = {
  weed: [pix(['....y...y..', '.y..g..mg..', '.g..m.gm...', '..m.mgm..y.', '..mmgmm.gm.', '...dmmmgm..', '.dmdmmdmd..', '..ddmddd...']),
         pix(['..y.....', '..g..g..', '.gm.gm.y', '..mgmm.g', '.dmmmdm.', '..ddmd..']),
         pix(['.g...g.', '.mg.gm.', '..mgm..', 'g.mmm.g', '.dmdmd.', '..ddd..'])],
  seed: pix(['.bbb.', 'bbcbb'], false),
  sprout: pix(['g.g', 'gmg', '.m.']),
  young: pix(['..g.g..', 'ggm.mgg', 'gmm.mmg', '.mmdmm.', '..ddd..']),
  tufts: [pix(['.m.m.', 'm.m.m'], false), pix(['m.m', '.m.'], false), pix(['.l.', 'l.l'], false), pix(['m..m', '.mm.'], false)],
  dirtTufts: [pix(['.t.t.', 't.t.t'], false), pix(['e.', '.E'], false)],
  flowers: [pix(['.c.', 'cyc', '.c.'], false), pix(['.p.', 'pyp', '.p.'], false), pix(['y'], false), pix(['c.', '.c'], false)],
  lily: pix(['.ggg.', 'ggmgp', '.gmg.']),
  cattail: pix(['.w..', '.w.w', '.w.w', '.m.w', 'm..m', 'm.m.', 'mm..', '.m..']),
  basket: pix(['tttttt', 'sstsst', '.ssss.']),
};

// ---------- trees (after @asynkimo's forest): lush canopies of many leaf clumps, light from the upper left ----------
// Every clump is a small flat 2D sprite: a scalloped ball made of little leaf cells, each cell lit on its upper left and dark
// on its lower right, with a deep separation edge along the clump's lower right. A dark "inside" copy of every clump sits
// behind it and never moves, so a clump lifted by the wind never opens a hole. Only clump *positions* turn with the camera
// (a ball looks the same from every side), so canopies stay crisp at every angle. Trunks are small voxel stacks.
// Species: broad oak (green or sunlit olive), dark back-row oak, layered pine (still trunk, only the top tiers sway), birch, bush.
function part(box, fn) { const [x0, x1, y0, y1, z0, z1] = box, f = (x, y, z) => fn(x + x0, y + y0, z + z0); if (fn.normal) f.normal = (x, y, z) => fn.normal(x + x0, y + y0, z + z0);
  const m = buildModel(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, f, { noOutline: true });
  m.nearest = true;
  return { m, ox: x0 + m.w / 2, oy: y0 + m.d / 2, z: z0 }; }
const TREE_RAMPS = { // cap, light, mid, shade, deep, deepest
  oak:   [G[5], G[4], G[3], G[2], G[1], G[0]],
  olive: [G[5], G[5], G[4], G[3], G[2], G[1]],
  dark:  [G[4], G[3], G[2], G[1], G[0], G[0]],
  pine:  [G[3], G[2], G[1], G[0], G[0], Ink[0]],
  birch: [G[5], G[4], G[3], G[2], G[1], G[0]],
};
const discC = new Map();
function leafSprite(r, ramp, seed, inside, berries, sh = 0) { // sh: how deep in the canopy the clump sits (0 top .. 2 underside)
  const key = 'L' + r + ramp + seed + (inside ? 'i' : '') + (berries ? 'b' : '') + sh; let o = discC.get(key); if (o) return o;
  const Rm = TREE_RAMPS[ramp], rx = r, ry = Math.max(2, Math.round(r * 0.84)), w = 2 * rx + 1, h = 2 * ry + 1;
  const c = mkc(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  const rr = mulberry32(seed * 7919 + r * 31 + 3), p1 = rr() * 6.28, p2 = rr() * 6.28, nl = r >= 7 ? 6 : 5;
  const inS = (i, j) => { if (i < 0 || j < 0 || i >= w || j >= h) return false;
    const u = (i - rx) / (rx + 0.5), v = (j - ry) / (ry + 0.5), q = u * u + v * v, a = Math.atan2(v, u);
    const lob = inside ? 0.86 : 0.87 + 0.08 * Math.cos(nl * a + p1) + 0.05 * Math.cos((2 * nl + 1) * a + p2); // scalloped, leafy rim
    return q < lob * lob; };
  const S = r >= 7 ? 3.3 : 2.7, cells = []; // leaf cells on a jittered, offset grid
  for (let gy = -1; gy * S < h + S; gy++) for (let gx = -1; gx * S < w + S; gx++) cells.push([gx * S + (gy & 1) * S / 2 + (rr() - 0.5) * 1.3, gy * S + (rr() - 0.5) * 1.3]);
  const light = (u, v) => -0.5 * u - 0.68 * v + 0.5 * Math.sqrt(Math.max(0, 1 - u * u - v * v));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!inS(i, j)) continue;
    const u = (i - rx) / (rx + 0.5), v = (j - ry) / (ry + 0.5);
    if (inside) { d[j * w + i] = u32(Rm[v > 0.05 ? 5 : 4]); continue; }
    let b1 = 1e9, b2 = 1e9, cc = cells[0];
    for (const ce of cells) { const dd = (i - ce[0]) ** 2 + (j - ce[1]) ** 2; if (dd < b1) { b2 = b1; b1 = dd; cc = ce; } else if (dd < b2) b2 = dd; }
    let L = 0.6 * light((cc[0] - rx) / (rx + 0.5), (cc[1] - ry) / (ry + 0.5)) + 0.4 * light(u, v);
    const side = ((i - cc[0]) * 0.6 + (j - cc[1]) * 0.8) / S;
    if (side > 0.3) L -= 0.2; else if (side < -0.3) L += 0.07;    // each leaf cell: lit upper left, dark lower right
    if (Math.sqrt(b2) - Math.sqrt(b1) < 0.6 && side > -0.1) L -= 0.1;
    let t = L > 0.84 ? 0 : L > 0.6 ? 1 : L > 0.34 ? 2 : L > 0.08 ? 3 : 4;
    if (t === 0 && (sh > 0 || u * u + v * v > 0.3)) t = 1;                // the brightest tone stays a small cap on top clumps
    t = Math.min(4, t + sh);                    // the brightest tone stays a small cap
    if (!inS(i + 1, j) || !inS(i, j + 1) || !inS(i + 1, j + 1)) { if (v > -0.25 || u > 0.3) t = Math.max(t, v > 0.35 ? 5 : 4); } // separation edge
    let col = Rm[t];
    if (berries === true) { if (t <= 2 && hash3(i, j, r + seed) < 0.06) col = Ac[3]; }
    else if (berries && t <= 3 && hash3(i >> 1, j >> 1, r + seed + 7) < 0.14) { const fc = FRUIT_COL[berries]; col = (i & 1) || (j & 1) ? fc[0] : fc[1]; } // 2x2 fruit, lit corner
    d[j * w + i] = u32(col);
  }
  g.putImageData(img, 0, 0); o = { c, rx, ry }; discC.set(key, o); return o;
}
function pineTier(r, th, ramp, seed) { // v5.11.0.5.3: one fir tier, a pointed cone of needles th px tall from its tip to its drooping skirt
  // Row 0 is the tip, row th the skirt line (the tier's anchor). Each tier reaches well up behind the tier above, so the stack reads
  // as one fir: green to the tip, no trunk between the tiers. Lit from the upper left, deep shade on the right and under the skirt.
  const key = 'P' + r + '|' + th + ramp + seed; let o = discC.get(key); if (o) return o;
  const Rm = TREE_RAMPS[ramp], w = 2 * r + 1, h = th + 4;
  const c = mkc(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (let x = -r; x <= r; x++) { const ax = Math.abs(x) / r, top = Math.round(th * Math.pow(ax, 1.12)), ph = (Math.abs(x) + seed * 2 + 99) % 3;
    const bot = Math.min(h - 1, th + Math.round(ax * ax * 1.5) + (Math.abs(x) < 3 ? 0 : ph === 0 ? 2 : ph === 1 ? 1 : 0) - (ax > 0.9 ? 1 : 0)); // jagged, drooping needle tips (a level skirt over the stub)
    for (let y = top; y <= bot; y++) { const rel = (y - top) / Math.max(1, bot - top), v = y / Math.max(1, th);
      let L = 1.0 - v * 0.5 - rel * 0.35 - (x / r) * 0.42;
      if (y > top && ((Math.abs(x) * 2 + y + seed) % 4 === 0) && rel > 0.2) L -= 0.22;     // needle streaks, sloping down and out
      let t = L > 0.62 ? 0 : L > 0.36 ? 1 : L > 0.08 ? 2 : 3;
      if (y >= bot - (ax < 0.85 ? 1 : 0)) t = Math.max(t, x > 0 ? 4 : 3);            // the underside of the skirt
      else if (y === top && x <= 0) t = Math.min(t, 1);                              // sunlit upper-left edge
      else if (y === top && x > 0) t = Math.max(t, 2);
      d[y * w + x + r] = u32(Rm[t]); } }
  g.putImageData(img, 0, 0); o = { c, rx: r, ry: th }; discC.set(key, o); return o;
}
function clumpSprite(p) { return p.tier ? pineTier(p.r, p.th, p.ramp, p.seed) : leafSprite(p.r, p.ramp, p.seed, p.inside, p.berries, p.sh || 0); }
function discFoot(ps) { // shadow footprint of the canopy (screen px, centred)
  let R = 4; for (const p of ps) R = Math.max(R, Math.hypot(p.ox, p.oy) + p.r);
  const w = Math.ceil(2 * R), foot = mkc(w, w), g = foot.getContext('2d'); g.fillStyle = '#000';
  for (const p of ps) { if (p.inside) continue; g.beginPath(); g.arc(R + p.ox, R + p.oy, p.r * 0.9, 0, 7); g.fill(); }
  return { w, d: w, h: 0, foot, slices: [], cx: 0, cy: 0 };
}
function finishTree(def, cz0, reach) { // weights for the wind, the inside layer, the shadow footprint
  const out = [];
  for (const p of def.discs) { if (p.w === undefined) p.w = 0.35 + 0.65 * Math.min(1, Math.hypot(p.ox, p.oy, (p.cz - cz0) * 0.7) / reach);
    if (!p.tier && !p.noInside && p.r >= 4) out.push({ ox: p.ox, oy: p.oy, cz: p.cz - 1, r: p.r - 1, ramp: p.ramp, seed: 0, inside: true, w: 0 }); }
  def.discs = out.concat(def.discs); def.union = discFoot(def.discs); return def;
}
function oakDef(seed, ramp = 'oak', sc = 1) {
  const r = mulberry32(seed), parts = [], discs = [];
  const T = Math.round((14 + r() * 5) * sc), CR = (20 + r() * 4) * sc, CZ = (13 + r() * 3) * sc, cz0 = T + CZ * 0.8;
  parts.push(part([-6, 5, -6, 5, 0, T + 8], (x, y, z) => {
    const tr = Math.max(Math.abs(x + 0.5), Math.abs(y + 0.5)) <= (z < 4 ? 3.6 - z * 0.25 : 2.6);
    const root = z <= 2 && (Math.abs(x + 0.5) + Math.abs(y + 0.5) * 0.4 <= 4.6 - z * 1.6 || Math.abs(y + 0.5) + Math.abs(x + 0.5) * 0.4 <= 4.6 - z * 1.6);
    return (tr || root) ? (((x + 13) % 4 === 0 && z > 3 && z % 6 !== 1) ? Wd[1] : Wd[2]) : null; }));
  const n = Math.round((14 + r() * 5) * Math.min(1.1, sc));
  for (let i = 0; i < n; i++) { const f = (i + 0.5) / n, zz = 1 - f * 1.4, rad = Math.sqrt(Math.max(0.04, 1 - zz * zz)), a = i * 2.39996 + r() * 0.4;
    discs.push({ ox: Math.cos(a) * rad * CR * 0.74, oy: Math.sin(a) * rad * CR * 0.74, cz: cz0 + zz * CZ, r: Math.max(4, Math.round((zz > 0.55 ? 6 : 7.5) * sc + r() * 2)), ramp, seed: (seed + i) % 6, sh: zz > 0.35 ? 0 : zz > -0.1 ? 1 : 2 }); }
  return finishTree({ kind: 'oak', parts, discs, push: 0.75, period: 5.5, damp: 1.05, h: Math.ceil(cz0 + CZ + 12) }, cz0, CR * 0.8);
}
function birchDef(seed, sc = 1) {
  const r = mulberry32(seed), parts = [], discs = [], T = Math.round((32 + r() * 8) * sc), lean = (r() - 0.5) * 0.12;
  parts.push(part([-3, 3, -3, 3, 0, T], (x, y, z) => { const ox = Math.round(z * lean); if (Math.max(Math.abs(x - ox + 0.5), Math.abs(y + 0.5)) > 1.6) return null;
    return (z % 7 === 3 || (z % 11 === 6 && x - ox < 0)) ? Ink[1] : St[3]; }));
  const n = Math.round(8 + r() * 3), cz0 = T * 0.78;
  for (let i = 0; i < n; i++) { const f = (i + 0.5) / n, zz = 1 - f * 1.8, a = i * 2.39996 + r(), rad = (0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - zz * zz * 0.6))) * 8 * sc;
    discs.push({ ox: Math.cos(a) * rad + lean * cz0 * 0.5, oy: Math.sin(a) * rad * 0.8, cz: cz0 + zz * 12 * sc, r: Math.round(4 + r() * 2), ramp: 'birch', seed: (seed + i) % 6, sh: zz > 0.2 ? 0 : 1 }); }
  return finishTree({ kind: 'birch', parts, discs, push: 0.7, period: 4.8, damp: 1.05, h: Math.ceil(cz0 + 14 * sc + 10) }, cz0, 9 * sc);
}
function pineDef(seed, ramp = 'pine', sc = 1) { // v5.11.0.5.3: a fir. A short trunk stub under overlapping cone tiers, foliage to the tip
  const r = mulberry32(seed), parts = [], discs = [], H = Math.round((62 + r() * 16) * sc), n = 5 + Math.floor(r() * 2), R0 = (16 + r() * 4) * sc;
  const base = Math.round(3 * sc), step = (H - 2 - base) / (n + 0.9), th = Math.round(step * 1.9);
  parts.push(part([-2, 2, -2, 2, 0, base + 3], (x, y, z) => Math.max(Math.abs(x + 0.5), Math.abs(y + 0.5)) <= 1.6 ? (z === 0 ? Wd[0] : Wd[1]) : null)); // hidden above the skirt
  for (let i = 0; i < n; i++) { const up = (i + 0.5) / n;
    discs.push({ ox: 0, oy: 0, cz: Math.round(base + i * step), r: Math.max(5, Math.round(R0 * (1 - i / (n + 0.4)) + 2)), th: i === n - 1 ? H - 2 - Math.round(base + i * step) : th, ramp, seed: (seed + i) % 3, tier: 1, w: up > 0.62 ? 0.2 + 0.25 * up : 0 }); }
  return finishTree({ kind: 'pine', parts, discs, push: 0.3, period: 8.0, damp: 1.2, h: H + 8 }, 0, 1);
}
function bushDef(seed, ramp = 'oak') {
  const r = mulberry32(seed), discs = [], berries = seed % 2 === 1;
  for (let i = 0; i < 5; i++) { const a = r() * 1.2 + i * 1.257; discs.push({ ox: Math.cos(a) * 5, oy: Math.sin(a) * 4, cz: 5 + r() * 2, r: 5 + Math.round(r()), ramp, seed: i, berries, sh: 1 }); }
  discs.push({ ox: 0, oy: 0, cz: 9, r: 6, ramp, seed: 5, berries });
  return finishTree({ kind: 'bush', parts: [], discs, push: 0.55, period: 3.6, damp: 1.0, h: 18 }, 6, 5);
}
// ---------- wind: gust patches crossing the map + a breeze around them (world units) ----------
const GUSTS = [];
{ const gr = mulberry32(4242); for (let i = 0; i < 6; i++) GUSTS.push({ t0: i * 20 / 6 + (i === 3 ? -2.0 : 0), speed: 18 + gr() * 6, cy: gr() * WH, hh: i % 3 === 0 ? 0 : 16 + gr() * 8, len: 10 + gr() * 7, str: 0.5 + gr() * 0.75 }); }
let windT = 0;
const WAVE_T = 5.4, WAVE_L = 36; // slower, longer traveling breeze (was 1.54 s / 26)
const wrap = (v, lo, hi) => { const L = hi - lo; return ((v - lo) % L + L) % L + lo; };
function windField(x, y, spread) { let s = 0; const al = x + 0.25 * y;
  for (const g of GUSTS) { const path = g.speed * 20; const d = wrap(al - g.speed * (windT - g.t0), -path / 2, path / 2);
    let a = g.str * Math.exp(-((d / (g.len * spread)) ** 2)); if (g.hh > 0) a *= Math.exp(-(((y - g.cy) / (g.hh * (spread > 1 ? 1.6 : 1))) ** 2)); s += a; } return s; }
if (Q.has('nowind')) GUSTS.forEach(g => g.str = 0);
const gustAt = (x, y) => windField(x, y, 1), breezeAt = (x, y) => Math.min(1.6 * windField(x, y, 2.2), 1);
const phaseAt = (x, y, t) => 2 * Math.PI * (t / WAVE_T - (x + 0.25 * y) / WAVE_L);
const TS = 0.7; // mostly 0–1 px; gust peaks on broadleaf can reach 2. Motion stays in whole pixels
function windPose(x, y, t) { // unrounded unit sway at a point: downwind px, upward lift
  const b = breezeAt(x, y), g = gustAt(x, y), a = phaseAt(x, y, t);
  return [TS * (0.9 * b + 1.3 * g) * (0.5 - 0.5 * Math.cos(a)), TS * (0.75 * b + 0.5 * g) * Math.max(Math.sin(a), 0)];
}
function clumpPose(x, y, w, lean, t) { // billboards / crops: integer offset
  const [dx, dz] = windPose(x, y, t);
  return [Math.round(lean * w + dx * w), Math.round(dz * w)];
}
function discSway(o, p, poseT, unit) { // one canopy clump; the whole tree shares one wind sample so layers do not shear
  if (!(p.w > 0)) return [0, 0];
  const pine = o.tree.kind === 'pine', cap = pine ? 1 : 2, [wx, wz] = unit || windPose(o.x, o.y, poseT);
  let dx = Math.round(wx * p.w + o.lean * (p.bend ?? p.w)), dz = pine ? 0 : Math.round(wz * p.w);
  if (dx > cap) dx = cap; else if (dx < -cap) dx = -cap;
  if (dz > cap) dz = cap; else if (dz < 0) dz = 0;
  return [dx, dz];
}

// ---------- canvas ----------
const cv = document.getElementById('game'), ctx = cv.getContext('2d', { willReadFrequently: true });
cv.width = W; cv.height = H;
const mk = mkc;
let shMask = new Uint32Array(W * H);
let shC = mk(W, H), sctx = shC.getContext('2d');
let litC = mk(W, H), lctx = litC.getContext('2d'); let litImg = lctx.createImageData(W, H), litL = new Float32Array(W * H); let litKey = '', litBuilds = 0; // v5.9.1: the light layer is cached by key
const GW = Math.ceil((WORLD.x1 - WORLD.x0 + 2 * GM) * RS), GH = Math.ceil((WORLD.y1 - WORLD.y0 + 2 * GM) * RS);
const groundBase = mk(GW, GH);
[ctx, sctx].forEach(c => c.imageSmoothingEnabled = false);
let zoom = 0; // extra integer zoom steps from the mouse wheel (bigger pixels, so pixels stay square)
function sizeBuffers(w, h) { // v5.11.0.5.2: the screen-sized buffers follow the framebuffer
  if (w === W && h === H) return;
  W = w; H = h; cv.width = W; cv.height = H;
  shMask = new Uint32Array(W * H); shC = mk(W, H); sctx = shC.getContext('2d');
  litC = mk(W, H); lctx = litC.getContext('2d'); litImg = lctx.createImageData(W, H); litL = new Float32Array(W * H); litKey = '';
  [ctx, sctx].forEach(c => c.imageSmoothingEnabled = false);
}
function fit() { // whole multiple of the framebuffer in *device* pixels
  const dpr = window.devicePixelRatio || 1;
  const box = (window.PFPlatform && typeof PFPlatform.stageBox === 'function' && PFPlatform.stageBox()) || { left: 0, top: 0, w: innerWidth, h: innerHeight };
  const fb = window.PFPlatform && PFPlatform.framebuffer, mob = !!(window.PFPlatform && PFPlatform.mobile && fb && fb.scale);
  let vw, vh, base, s;
  if (mob) { // xhs phone: the locked portrait buffer at its integer scale fills the stage; extra zoom crops the edges
    vw = Math.max(1, Math.floor(box.w * dpr)); vh = Math.max(1, Math.floor(box.h * dpr));
    zoom = clamp(zoom, 0, 4);
    const fitMax = Math.min(vw / W, vh / H);
    base = Math.max(1, Math.floor(fitMax));
    s = fitMax >= 1 ? Math.max(1, (fb.scale | 0) + zoom) : fitMax;
  } else { // web (v5.11.0.5.2): the framebuffer is sized to cover the window, so there is no letterbox
    vw = Math.max(1, Math.round(box.w * dpr)); vh = Math.max(1, Math.round(box.h * dpr));
    base = Math.max(1, Math.floor(Math.min(vw / BW, vh / BH))); s = base + zoom;
    if (!VIEW) sizeBuffers(Math.min(1600, Math.ceil(vw / s)), Math.min(1000, Math.ceil(vh / s)));
  }
  const wrap = document.getElementById('wrap'), left = Math.floor((vw - W * s) / 2), top = Math.floor((vh - H * s) / 2);
  wrap.style.left = (box.left + left / dpr) + 'px'; wrap.style.top = (box.top + top / dpr) + 'px';
  cv.style.width = W * s / dpr + 'px'; cv.style.height = H * s / dpr + 'px';
  const css = base / dpr, hud = document.getElementById('hud');
  if (hud && !(window.PFPlatform && PFPlatform.mobile)) hud.style.fontSize = (css >= 4 ? 16 : css >= 3 ? 14 : 12) + 'px';
}
addEventListener('resize', fit); fit();
matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.('change', fit);


// ---------- billboard sprites (SpriteCook sheet, see assets/sprites.js) ----------
const SPR = { ok: false, img: new Image(), rows: {} };
if (window.PF_SPRITES) { const s = window.PF_SPRITES; s.rows.forEach((n, i) => SPR.rows[n.replace('anim_', '')] = i); SPR.fw = s.fw; SPR.fh = s.fh; SPR.ax = s.ax ?? 18; SPR.ay = s.ay ?? 35; SPR.frames = s.frames || {};
  SPR.img.onload = () => { SPR.ok = true; SPR.flip = mk(SPR.img.width, SPR.img.height); const c = SPR.flip.getContext('2d'); c.translate(SPR.img.width, 0); c.scale(-1, 1); c.drawImage(SPR.img, 0, 0); }; SPR.img.src = s.src; }
const CROPI = { ok: false, img: new Image() }; // SpriteCook ripe crops: carrot / cabbage / pumpkin (16x16)
if (window.PF_CROPS) { CROPI.img.onload = () => CROPI.ok = true; CROPI.img.src = window.PF_CROPS.src; }

// ---------- world layout (world units; 1 tile = 8 units = 16 px) ----------
const HOUSE = { x: 36, y: 24 }, BARN = { x: 158, y: 26 }, WELL = { x: 100, y: 22 }, STALL = { x: 160, y: 100 }, POND = { x: 34, y: 100, rx: 19, ry: 12 }, BENCH = { x: 64, y: 108 };
const DOOR = { x: 36, y: 40 }, BARN_DOOR = { x: 158, y: 41 }, WELL_SPOT = { x: 100, y: 31 }, STALL_SPOT = { x: 160, y: 111 }, BENCH_SPOT = { x: 64, y: 112 };
const KEEPER = { x: 160, y: 97.4 };
// v5.0: the stall keeps hours. 阿禾 (later her father) opens at 7:00 and goes home at 19:00; at night nothing is sold or bought
const SHOP_OPEN = 7 * 60, SHOP_CLOSE = 19 * 60;
const shopOpen = (T = S.t % 1440) => T >= SHOP_OPEN && T < SHOP_CLOSE;
const FIELD = { c0: 9, r0: 7, cols: 6, rows: 4 }; // tiles x 72..120, y 56..88
const props = [];
const addProp = (m, x, y, rot = 0, o = {}) => { const p = Object.assign({ m, x, y, rot, z: 0 }, o); props.push(p); return p; };
const models = {
  house: houseModel(), barn: barnModel(), stallB: stallModel('back'), stallF: stallModel('front'), well: wellModel(), fence: fenceModel(),
  rocks: [1, 2, 3].map(s => rockModel(s * 31)), branches: [1, 2].map(s => branchModel(s * 17)), pebbles: [1, 2].map(s => pebbleModel(s * 43)), weeds: SPRITES.weed,
  soil: [soilModel(false), soilModel(true)],
};
const houseProp = addProp(models.house, HOUSE.x, HOUSE.y, 0, { big: 1, house: 1 }); // v5.0: swapped for a bigger model on upgrade (setHouseTier)
addProp(models.barn, BARN.x, BARN.y, 0, { big: 1 });
addProp(models.stallB, STALL.x, STALL.y, 0, { big: 1, dy: -4.5 });
addProp(models.stallF, STALL.x, STALL.y, 0, { big: 1, dy: 3.5 });
addProp(models.well, WELL.x, WELL.y, 0);
addProp(benchModel, BENCH.x, BENCH.y, 0);
addProp(hayModel, 182, 46, 0.3); addProp(crateModel, 134, 44, 0.2); const logsProp = addProp(logsModel, 64, 22, 0.15); // the woodpile moves out of the annex's way (setHouseTier)
const mailProp = addProp(mailModel, 16, 45, 0); addProp(crateModel, 178, 110, 0.1); addProp(hayModel, 140, 118, 1.2);
const mossRock = buildModel(14, 11, 8, (x, y, z) => { const e = ell(x, y, z, 7, 5.5, 0, 6.5, 5, 7.5); if (e > 1) return null; return (z >= 5 && hash3(x, y, 5) > 0.45) || (z >= 6 && x < 8) ? G[3] : St[2]; }, {});
const billboards = []; // small 2D sprites standing in the world (depth sorted with everything else)
const POND_SOLIDS = []; // things standing in the pond: they get lapping foam around their foot
for (let i = 0; i < 6; i++) billboards.push({ spr: SPRITES.cattail, x: POND.x + Math.cos(i * 1.1 + 2) * (POND.rx + 0.5), y: POND.y + Math.sin(i * 1.1 + 2) * (POND.ry + 0.5), sway: 0.5, flip: i % 2, reed: 1 });
for (let x = 4; x < 58; x += 8) if (x + 4 < 30 || x + 4 > 42) addProp(models.fence, x + 4, 50, 0); // gap for the path
for (let x = 76; x < 130; x += 8) addProp(models.fence, x + 4, 124, 0);
for (let y = 56; y < 120; y += 8) addProp(models.fence, 2, y + 4, Math.PI / 2);
const postM = buildModel(3, 3, 13, () => Wd[3]); for (const [x, y] of [[60, 50], [28, 50], [132, 124], [2, 120]]) addProp(postM, x, y, 0); // posts closing each run
// trees: a proper forest edge around the farm (two staggered rows per side, big trees at the back, lower ones toward the
// default camera), a few trees by the pond so it has something to mirror, and bushes on the farm
const treeDefs = {
  oak: [1, 2, 3].map(s => oakDef(s * 77, 'oak')), olive: [4, 5].map(s => oakDef(s * 77, 'olive')), dark: [6, 7, 8].map(s => oakDef(s * 77, 'dark', 1.1)),
  pine: [1, 2, 3].map(s => pineDef(s * 53, 'pine')), birch: [1, 2, 3].map(s => birchDef(s * 41)), small: [9, 10].map(s => oakDef(s * 77, 'oak', 0.78)),
  bush: [1, 2, 3].map(s => bushDef(s * 13, 'oak')), bushD: [4, 5].map(s => bushDef(s * 13, 'dark')),
};
let treeN = 0;
const addTree = (def, x, y) => props.push({ tree: def, m: def.union, x, y, rot: 0, z: 0, lean: 0, leanV: 0, tick: (treeN++ % 6) / 6 });
{ const fr = mulberry32(9090), P = a => a[Math.floor(fr() * a.length)];
  const front = () => P([...treeDefs.oak, ...treeDefs.olive, ...treeDefs.pine, ...treeDefs.birch]), back = () => P([...treeDefs.dark, ...treeDefs.pine, ...treeDefs.dark, ...treeDefs.olive]);
  for (let x = -34; x <= WW + 34; x += 15 + fr() * 4) addTree(front(), x + (fr() - 0.5) * 4, -9 - fr() * 4);            // back edge, row 1
  for (let x = -42; x <= WW + 40; x += 16 + fr() * 4) addTree(back(), x + (fr() - 0.5) * 4, -24 - fr() * 5);           // back edge, row 2
  for (let y = 6; y <= WH + 30; y += 15 + fr() * 4) { addTree(front(), -9 - fr() * 4, y); addTree(front(), WW + 9 + fr() * 4, y + 3); } // sides
  for (let y = 0; y <= WH + 40; y += 16 + fr() * 4) { addTree(back(), -24 - fr() * 5, y + 7); addTree(back(), WW + 24 + fr() * 5, y); }
  for (let x = -20; x <= WW + 20; x += 13 + fr() * 5) addTree(fr() < 0.6 ? P([...treeDefs.bush, ...treeDefs.bushD]) : P([...treeDefs.birch, ...treeDefs.small]), x, WH + 10 + fr() * 4); // front: low
  for (let x = -30; x <= WW + 30; x += 17 + fr() * 4) addTree(back(), x, WH + 26 + fr() * 6);
}
// v5.0: the trees by the pond are choppable wild trees now (world.js EXTRA_TREES h0–h3), drawn with the forest views
[[58, 40], [12, 44], [134, 66], [56, 80], [182, 52], [112, 114], [86, 116], [132, 103]].forEach(([x, y], i) => addTree(treeDefs.bush[i % 3], x, y));
POND_SOLIDS.push({ x: POND.x + 11, y: POND.y + 5, r: 6 });
addProp(mossRock, POND.x + 11, POND.y + 5, 0.6);
// ---------- field ----------
// Pacing, economy, shop and save rules live in sim.js and save.js (pure, unit-tested); this block is the farm's state machine.
const SIM = window.PFSim, CROP_IDS = SIM.IDS;
const tiles = [];
// fields: the home field plus one per farming region (v4.3); c / r are local to their field, f names the field
const FIELDS = [Object.assign({ id: 'home' }, FIELD), ...WD.REGIONS.filter(r => r.field).map(r => Object.assign({ id: r.id }, r.field)), ...PL.PLOTS.filter(p => p.field).map(p => Object.assign({ id: p.id }, p.field))]; // v5.5.0: plots that can be 农田
for (const fd of FIELDS) for (let r = 0; r < fd.rows; r++) for (let c = 0; c < fd.cols; c++) {
  tiles.push({ f: fd.id, c, r, x: (fd.c0 + c) * TILE + TILE / 2, y: (fd.r0 + r) * TILE + TILE / 2, open: fd.id === 'home' && SIM.isOpen(c, r, 0), debris: null, weed: null, tilled: false, crop: null, watered: false });
}
const tileOpen = (t, eff) => t.f === 'home' ? SIM.isOpen(t.c, t.r, eff.field) : PL.isPlotId(t.f) ? !!(S.plots[t.f] && S.plots[t.f].mod === 'field') : eff.regions.includes(t.f);
// clutter is stored as plain data (kind + variant index), so it can be saved; the model is looked up when drawing
const debrisModel = d => { const a = d.type === 'rock' ? models.rocks : models.branches; return a[d.v % a.length]; };
const weedSprite = w => models.weeds[w.v % models.weeds.length];
function spawnClutter(t, pDebris, pWeed) {
  if (t.crop || t.debris || t.weed) return false;
  const v = rand();
  if (v < pDebris && !t.tilled) { const rock = rand() < 0.5; t.debris = { type: rock ? 'rock' : 'branch', v: RI(0, (rock ? models.rocks : models.branches).length - 1), rot: R(0, 6.28) }; return true; }
  if (v < pDebris + pWeed) { t.weed = { v: RI(0, models.weeds.length - 1), rot: R(0, 6.28) }; return true; } // weeds no longer undo tilling
  return false;
}
tiles.forEach(t => { if (!PL.isPlotId(t.f)) spawnClutter(t, t.f === 'home' ? 0.34 : 0.5, t.f === 'home' ? 0.42 : 0.4); }); // the new fields start overgrown (plot fields start clean: the sim stream stays the same)
// yard clutter lives off the field (grass and dirt around the farm). It is saved as { type, v, rot, x, y }.
const YARD_CAP = 18, YARD_START = 26, YARD_TYPES = ['weed', 'weed', 'weed', 'rock', 'rock', 'branch', 'branch', 'pebble'];
const yard = [];
const clutterModel = d => { const a = d.type === 'rock' ? models.rocks : d.type === 'pebble' ? models.pebbles : models.branches; return a[d.v % a.length]; };
function yardSpotOk(x, y) {
  if (x < 10 || x > WW - 8 || y < 18 || y > WH + 6) return false;
  if (Math.max(-x, x - WW, -y, y - WH, 0) > 8) return false;
  if (groundAt(x, y)[1] === 'water') return false;
  if (pathD(x, y) < 5.2) return false;
  if (S && S.eff && AN.PEN_IDS.some(k => S.eff[k] && (Math.hypot(x - PENS[k].bld.x, y - PENS[k].bld.y) < 16 || Math.hypot(x - PENS[k].trough.x, y - PENS[k].trough.y) < 10))) return false; // v4.7: not on a built coop / trough
  const fx0 = FIELD.c0 * TILE, fy0 = FIELD.r0 * TILE;
  if (x > fx0 - 3 && x < fx0 + FIELD.cols * TILE + 3 && y > fy0 - 3 && y < fy0 + FIELD.rows * TILE + 3) return false;
  const near = (px, py, r) => Math.hypot(x - px, (y - py) * 1.2) < r;
  if (near(HOUSE.x, HOUSE.y, 22) || near(BARN.x, BARN.y, 20) || near(WELL.x, WELL.y, 12) || near(STALL.x, STALL.y, 16) || near(BENCH.x, BENCH.y, 10)) return false;
  if (near(POND.x + 11, POND.y + 5, 8)) return false;
  for (const p of props) {
    if (p.tree && near(p.x, p.y, 10)) return false;
    if ((p.m === hayModel || p.m === crateModel || p.m === logsModel || p.m === mailModel) && near(p.x, p.y, 8)) return false;
  }
  for (const c of yard) if (Math.hypot(c.x - x, c.y - y) < 8) return false;
  if (typeof S !== 'undefined' && S.trees) { for (const t of S.trees) if (near(t.x, t.y, 9)) return false; for (const o of S.orders) if (o.type === 'plant' && near(o.x, o.y, 9)) return false; }
  return true;
}
// a private stream so yard spawn / loot never moves the simulation RNG (prices, harvest drops, field clutter)
const yardRng = (salt) => mulberry32(((RNG.a ^ (salt | 0) ^ 0xC0FFEE) >>> 0) || 1);
function fillYard(rnd, target) {
  // prefer the visible grass around the pond, house, field and stall; fall back to the rest of the farm
  const bands = [[20, 70, 52, 100], [70, 145, 92, 122], [124, 175, 48, 100], [12, 50, 50, 90], [10, WW - 8, 40, WH + 4]];
  let tries = 0;
  while (yard.length < target && tries < 800) {
    tries++;
    const prefer = yard.length < target * 0.85;
    const b = bands[Math.floor(rnd() * (prefer ? bands.length - 1 : bands.length))];
    const x = b[0] + rnd() * (b[1] - b[0]), y = b[2] + rnd() * (b[3] - b[2]);
    if (!yardSpotOk(x, y)) continue;
    const type = YARD_TYPES[Math.floor(rnd() * YARD_TYPES.length)];
    const n = type === 'rock' ? models.rocks.length : type === 'branch' ? models.branches.length : type === 'pebble' ? models.pebbles.length : models.weeds.length;
    yard.push({ type, v: Math.floor(rnd() * n), rot: rnd() * 6.28, x, y });
  }
}

// ---------- state ----------
const FAM = window.PFFamily;
const PW = window.PFWorks, PWA = window.PFWorksArt; // v5.6.0 phase 8
const DC = window.PFDecor, DA = window.PFDecorArt; // v5.7.0 phase 9
const S = {
  autoBuy: false, autoDay: 0, autoN: 0, offlineWin: [], // v5.10.1: 家人帮忙添置 (off by default) and the 24-hour offline window
  day: 1, t: WAKE, coins: 0, soldToday: 0, totalSold: 0, cleared: 0, earned: 0, todayEarn: 0, dayEarn: [], surpriseGold: 0,
  store: Object.assign(SIM.emptySeeds(), { carrot: 2 }), prices: SIM.startPrices(), waterMax: SIM.WATER_MAX0, createdAt: Date.now(),
  up: SIM.emptyUpgrades(), eff: SIM.effects({}), speedRefund: 0, // shop levels, what they add up to; v5.10.2: gold given back for a bought 2x / 4x (the speed is gone)
  farmer: { x: DOOR.x, y: DOOR.y, fx: 0, fy: 1, home: true, sleeping: false, task: null, bag: SIM.emptySeeds(), gathered: 0, crops: [], water: 0, walkPhase: 0, idleCount: 0, act: 0, wood: 0, saplings: { apple: 0, orange: 0 } },
  log: [], events: [], label: '起床',
  flow: { weed: 0, harvest: 0, bought: 0, boughtGold: 0, sold: 0, soldGold: 0 }, // seed flow since the page opened (diagnostics, not saved)
  trees: WD.defaultTrees(), orders: [], // v4.3: forest / fruit trees with their state; the player's chop and transplant orders
  animals: [], troughs: Object.fromEntries(AN.PEN_IDS.map(k => [k, { feed: 0, water: 0 }])), hay: 0, // v4.5/v4.7: animals, one trough per building, hay bales in the barn
  catches: [], fishGold: 0, // v4.6: recent catches (id, name, gold, water, day) and gold earned from fish this session
  family: FAM.empty(), members: [], // v5.0: 阿禾 and the children (family.js rules); members: the family out working (runtime actors)
  fishFood: 0, ornament: { koi: 0, goldfish: 0 }, pondFish: [], pondFed: 0, // v5.4.0: fish food and ornamental pond fish
  diary: DY ? DY.empty() : null, // v5.10.13: the last 30 days, what each of the family did
  album: ALB ? ALB.empty() : null, // v5.11.0.11: which story moments have a photo (metadata only)
  weather: (WX && WX.emptyWeather) ? WX.emptyWeather() : { nextDay: 0, start: 0, dur: 0, lastDay: 0, rained: 0, nextStart: 0, nextDur: 0 }, bugNet: 0, // v5.4.3
  codex: BOOK.emptyCodex(), achievements: [], milestones: [], streaks: BOOK.emptyStreaks(),
  doorGift: null, loose: [], dogPlan: null,
  plots: {}, // v5.5.0: bought plots of the outer ring: id -> { mod, day }
  homeyard: YD.empty(), // v5.10.3: the yard / stall / animal-care things set up (saved as `homeyard` once anything is)
  inn: IN ? IN.empty() : null, // v5.10.7: cabins, the 农家菜馆, guests and the guestbook (saved as `inn`)
  decor: DC.empty(), // v5.7.0: decorations, carrying orders, the party (saved as `decor`)
  home: HM ? HM.empty() : null, // v5.9.0: the new houses, who is close to whom, the weddings (saved as `home`)
  town: Object.assign(TN.empty(), { hall: HL.empty() }), // v5.8.0; v5.10.0: + hall: school days, days off, classmates' visits, what the town shop paid extra (saved as `town`)
  works: PW.empty(), // v5.6.0: sprinklers, workshops, hives, the second pens' plot (saved as `works`)
};
Object.assign(S.prices, { egg: 1, wool: 1, milk: 1, truffle: 1 }); // animal products drift like crops
const PASTURE = WD.region('pasture'), PENS = WD.PENS, COOP_DOOR = PENS.coop.door; // v4.7: each kind lives by its own building (world.js PENS)
const homeOf = a => PW.homeOf(a), PEN1 = AN.PEN_IDS.filter(k => !PENS[k].second); // v5.6.0: an animal's own building (the second one past the first's room)
const penOfKind = k => AN.KINDS[k].home, troughSpot = pen => ({ x: PENS[pen].trough.x - 9, y: PENS[pen].trough.y + 2 });
const penBox = P => [Math.min(P.roam[0], P.bld.x - 16), Math.min(P.roam[1], P.bld.y - 16), Math.max(P.roam[2], P.bld.x + 16), Math.max(P.roam[3], P.bld.y + 12)];
const anyPen = () => AN.PEN_IDS.some(k => S.eff[k]);
const AV = new Map(); // animal id -> its view (position, walk target, pose); positions are not saved
const PETS_LIVE = [], PV = new Map(); // v4.7: the pets (from the shop levels, not saved) and their views
const FARMER = S.farmer; // the player's farmer: the storehouse (wood, saplings) is his, the HUD shows his job
let F = FARMER;          // v5.0: whoever is choosing or doing a task right now (stepSim points it at each family member in turn)
const particles = [];
let groundDirty = true;
const fmtT = t => { const m = ((Math.floor(t) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function log(msg) { S.log.unshift(fmtT(S.t) + ' ' + msg); S.log.length = Math.min(S.log.length, 4); S.events.push({ day: S.day, t: Math.floor(S.t), msg }); if (S.events.length > 300) S.events.splice(0, S.events.length - 300); }
// routes: A* on a walkability grid so people and animals go around the house, the pond and fences
// (dirt roads are cheaper, so they still prefer the lanes between regions). Rebuilt when the map changes.
let navGrid = null, navVer = 0, navDirty = true, dbgRoutes = [];
function navState() {
  return {
    houseTier: (S.eff && S.eff.house) || 0, regions: (S.eff && S.eff.regions) || [],
    pens: Object.fromEntries(AN.PEN_IDS.map(k => [k, !!(S.eff && S.eff[k])])), fence: !!(S.eff && S.eff.fence),
    trees: (S.trees || []).filter(t => t.stage === 'tree').map(t => ({ x: t.x, y: t.y })), blocks: WA.blocks(S.eff).concat(WORKS_ON ? PWA.blocks() : [], DECOR_ON ? DA.blocks() : [], TN ? TN.blocks(!!(S.eff && S.eff.town), !!innPlot()) : [], TN && HL && S.eff && S.eff.town ? HL.blocks(S.town.hall).concat((FV && FV.isDay(S.town.hall, S.day)) ? FV.blocks() : []) : [], TN && CR && S.eff && S.eff.town ? CR.blocks(S.town.lots, S.home && S.home.path, S.day) : [], HOME_ON ? HA.blocks() : [], INN_ON ? IA.blocks() : []), // v5.3.1: the lumber hut; v5.6.0 the workshops; v5.10.7 inn
    rocks: (typeof yard !== 'undefined' ? yard : []).filter(c => c.type === 'rock').map(c => ({ x: c.x, y: c.y })), graze: !!(S.eff && S.eff.graze)
  };
}
function markNavDirty() { navDirty = true; }
function ensureNav() { if (!navGrid || navDirty) { navGrid = NAV.build(navState()); navVer++; navDirty = false; } return navGrid; }
function pathTo(a, b, bounds) { return NAV.route(ensureNav(), a, b, bounds ? { bounds } : undefined); }
function routeVia(a, b, bounds) { return pathTo(a, b, bounds).waypoints; }
function travel(a, b) { return pathTo(a, b).length; }
function setWalkTarget(v, x, y) { if (Math.hypot((v.tx || 0) - x, (v.ty || 0) - y) > 0.8) v.via = null; v.tx = x; v.ty = y; }
function nextHop(v, dest, bounds) {
  if (!v.via || v._nav !== navVer) { v.via = routeVia(v, dest, bounds); v._nav = navVer; }
  while (v.via.length && Math.hypot(v.via[0].x - v.x, v.via[0].y - v.y) <= 0.5) v.via.shift();
  return v.via.length ? v.via[0] : dest;
}
// v5.5.0: nearest first by straight line, and stop once the straight line alone is longer than the best walk found
// (a walk is never shorter than the straight line, less the few units a snap to the nav grid can cut), so the big outer
// ring's far tiles never each cost a full A* every time someone picks a job; at most 8 walks are measured per pick
const rngNear = (list) => { let best = null, bd = 1e9, n = 0; const c = list.map(t => ({ t, e: Math.hypot(t.x - F.x, t.y - F.y) })).sort((a, b) => a.e - b.e);
  for (const { t, e } of c) { if (e - 8 >= bd || n >= 8) break; if (CLAIM.has(t) || (t.an && CLAIM.has(t.an))) continue;
  if (t.f !== undefined && CROWD.some(q => q.tile && Math.abs(q.x - t.x) <= TILE * 1.5 && Math.abs(q.y - t.y) <= TILE * 1.5)) continue; // v5.3: never the tile next to someone else's
  n++; const d = travel(F, t) + Math.abs(t.y - F.y) * 0.01 + crowd(t); if (d < bd) { bd = d; best = t; } } return best; };
const waterSpots = () => [WELL_SPOT, ...WD.REGIONS.filter(r => r.barrel && S.eff.regions.includes(r.id)).map(r => ({ x: r.barrel.x, y: r.barrel.y + 8 })),
  ...PL.PLOTS.filter(p => p.barrel && S.plots[p.id] && S.plots[p.id].mod === 'field').map(p => ({ x: p.barrel.x, y: p.barrel.y + 8 }))];
const standAt = t => ({ x: t.x - 7, y: t.y + 1 }); // stand beside the tile, so work poses show in profile
// v5.0 family: everyone shares one task board. A job someone else is already doing (its tile, tree, animal, trough, or a
// one-at-a-time errand like buying hay) is claimed, so two people never walk to the same tile. Each person has their own
// walking speed and basket; children only take light jobs (family.js canDo).
const BASK = () => { const base = F === FARMER ? S.eff.basket : Math.max(4, Math.round(S.eff.basket * (F.bmul || 1)));
  const extra = (S.eff && S.eff.marketExtra) | 0; if (!extra || !MK || !S.town || !S.town.hall || !MK.isDay(S.town.hall, S.day)) return base; return base + extra; }; // v5.10.5: the smithy cart carries more on market day
const EXCLUSIVE = ['hay', 'buy', 'fetch', 'fish', 'feedpond', 'bakery']; // v5.11.0.26: only one adult walks a bakery order
let CLAIM = new Set();
// v5.3 roles: while one person picks a job, CROWD holds where the others stand and where they are heading. A target near
// them costs up to CROWD_K px of extra walk per px inside CROWD_R (rngNear) and a quarter of that in score (chooseTask), so
// two people spread over the farm instead of working side by side; family.js affinity() adds the "my area" preference.
let CROWD = [];
const CROWD_R = 5 * TILE, CROWD_K = 3;
const crowd = t => { let p = 0; for (const q of CROWD) { const d = Math.hypot(t.x - q.x, t.y - q.y); if (d < CROWD_R) p += (CROWD_R - d) * CROWD_K; } return p; };
const workingOthers = me => actors().filter(a => a !== me && !a.home && !a.sleeping && !a.away);
function crowdFor(me) { const out = [];
  for (const a of workingOthers(me)) { out.push({ x: a.x, y: a.y }); const k = a.task; if (k && k.kind !== 'idle' && k.kind !== 'home') { const t = k.tile || k.to; if (t) out.push({ x: t.x, y: t.y, tile: !!k.tile }); } }
  return out; }
const whoId = a => a === FARMER ? 'farmer' : a.id;
const actors = () => S.members.length ? [FARMER, ...S.members] : [FARMER];
function claimsFor(me) { const c = new Set(); for (const a of actors().concat(SPOUSES.filter(s => s._helpWin))) { const k = a.task; if (a === me || !k) continue; // v5.11.0.28: a spouse helping out claims too
  if (k.tile) c.add(k.tile); if (k.an) c.add(k.an); if (k.key) c.add(k.key); if (EXCLUSIVE.includes(k.kind)) c.add('kind:' + k.kind); } return c; }
const seedCount = o => CROP_IDS.reduce((n, k) => n + (o[k] || 0), 0);
const seedText = o => CROP_IDS.filter(k => o[k] > 0).map(k => `${SIM.CROPS[k].name}×${o[k]}`).join('、');
let onMorning = () => {};
function syncAnimals() { // the shop says how many of each kind; new ones arrive at their building
  for (const k of AN.KIND_IDS) { const want = (S.eff.animals || {})[k] || 0; let have = S.animals.filter(a => a.kind === k);
    while (have.length > want) { const a = have.pop(); S.animals.splice(S.animals.indexOf(a), 1); AV.delete(a.id); }
    for (let i = have.length; i < want; i++) { let n = i; while (S.animals.some(a => a.id === k + n)) n++; S.animals.push(AN.animal(k + n, k)); } }
  PW.assignPens(S.animals, S.eff); // v5.6.0: past the first building's room they live in the second
  PETS_LIVE.length = 0; for (const k of AN.PET_IDS) for (let i = 0; i < ((S.eff.pets || {})[k] || 0); i++) { const p = AN.pet(k, i); PETS_LIVE.push(PV.has(p.id) ? PV.get(p.id).pet : p); }
  if (typeof syncPastureProps === 'function') syncPastureProps();
}
function applyUpgrades() { // shop levels -> farm: capacity, walking, open tiles
  if (S.works) machSyncUp(); // v5.11.0.29: a new pen changes what the feeder set can still fit
  S.eff = SIM.effects(S.up); if (SM && S.town && S.town.hall) { const e = SM.effects((S.town.hall.smithy || {}).up); S.eff.sprReach = e.sprReach; S.eff.workSpeed = e.workSpeed; S.eff.smithAxe = e.axeBonus; S.eff.smithAxeCut = e.axeCut; S.eff.smithRod = e.rod; S.eff.marketExtra = e.cartExtra; } XP.applyEff(S); S.waterMax = S.eff.waterMax;
  SPR_COVER = null; FOG.next = 0; // v5.11.0.6: look at the locks again on the next frame
  for (const t of tiles) if (!t.open && tileOpen(t, S.eff)) t.open = true;
  syncAnimals();
  groundDirty = true;
  if (typeof setHouseTier === 'function') { setHouseTier(S.eff.house || 0); syncFenceProps(); }
  if (typeof syncRegionProps === 'function' && OPEN_REGIONS.join() !== S.eff.regions.join()) { const dirty = XP.dirtyRect(OPEN_REGIONS, S.eff.regions); OPEN_REGIONS = S.eff.regions.slice(); syncRegionProps(); if (groundReady) buildGroundBase(dirty); } // v5.5.0: a plot only repaints its own patch
  if (typeof syncLumberProps === 'function') syncLumberProps();
  syncAvenue();
  if (S.works && S.works.works) worksRestock(); // v5.10.12: stored workshops go back up once a yard has room
  XP.sync(); if (WORKS_ON) PWA.sync(); if (INN_ON) IA.sync(); SPR_COVER = null;
  markNavDirty();
}
function buy(id, who = 'player') { // the player's one action: spend gold on the next level of a shop item, or a stall consumable (v5.4.0 fish food / goldfish)
  if (id === 'fishfood') {
    if (S.fishFood >= FS.FOOD.stock) return { ok: false, reason: 'maxed' };
    if (S.coins < FS.FOOD.price) return { ok: false, reason: 'short', short: FS.FOOD.price - S.coins };
    S.coins -= FS.FOOD.price; S.fishFood++; emit('purchase', { item: 'fishfood', n: 1, gold: FS.FOOD.price, who: 'player' });
    log(`买了 1 包鱼食（${FS.FOOD.price} 金），放进仓库`); popText(FARMER.x, FARMER.y, 22, '-' + FS.FOOD.price, '#ffd76a'); burst(FARMER.x, FARMER.y, 10, ['#ffd76a', '#fff2a8'], 8, 'coin');
    noteProgress(); return { ok: true, consumable: true };
  }
  if (id === 'goldfish') { // v5.10.13: a bought goldfish goes straight into the home pond (it used to wait in the storehouse for a 放养 tap)
    const price = FS.ORN_BY.goldfish.price;
    if (pondRoom() <= 0) return { ok: false, reason: 'maxed', why: `池塘已经养满了（${S.pondFish.length}/${FS.POND_CAP}），放不下新的金鱼` };
    if (S.coins < price) return { ok: false, reason: 'short', short: price - S.coins };
    S.coins -= price; emit('purchase', { item: 'goldfish', n: 1, gold: price, who: 'player' });
    const f = stockPond('goldfish'); popText(FARMER.x, FARMER.y, 22, '-' + price, '#ffd76a');
    log(`买了一条金鱼（${price} 金），直接放进了家门口的池塘（${S.pondFish.length}/${FS.POND_CAP}）`);
    noteProgress({ pondCount: S.pondFish.length }); say(`金鱼游进了家门口的池塘（${S.pondFish.length}/${FS.POND_CAP}）`); return { ok: true, consumable: true, stocked: !!f, pond: S.pondFish.length };
  }
  if (id === 'bugnet' || id === 'net') {
    if (S.bugNet) return { ok: false, reason: 'maxed' };
    const price = (INS && INS.NET_PRICE) || 150;
    if (S.coins < price) return { ok: false, reason: 'short', short: price - S.coins };
    S.coins -= price; S.bugNet = 1; emit('purchase', { item: 'bugnet', n: 1, gold: price, who: 'player' });
    log(`买了捕虫网（${price} 金），孩子有时会自己去捉一只昆虫，看一眼就放走`); popText(FARMER.x, FARMER.y, 22, '-' + price, '#ffd76a'); burst(FARMER.x, FARMER.y, 10, ['#ffd76a', '#8fd35a'], 8, 'coin');
    noteProgress(); return { ok: true, consumable: true };
  }
  const o = SIM.offer(S.up, S.coins, id, FARMER.wood);
  if (!o || o.maxed) return { ok: false, reason: 'maxed' };
  if (o.locked) return Object.assign({ ok: false, reason: 'locked', needs: o.locked }, o.lockText ? { why: o.lockText } : {});
  if (!o.ok) return Object.assign({ ok: false, reason: 'short', short: o.short }, o.shortWood ? { shortWood: o.shortWood } : {});
  S.coins -= o.cost; FARMER.wood -= o.wood; S.up[id] = o.have + 1; worksBought(id); if (id === 'cottage' && HM) homeBought(); if (DC.CATALOG[id]) decorGain(id); applyUpgrades(); emit('purchase', { item: id, level: o.have + 1, gold: o.cost, wood: o.wood, who });
  if (who !== 'auto') log(`买下了${o.item.name}：${o.level.label}（${o.cost} 金` + (o.wood ? ` + 木材 ${o.wood} 份` : '') + '）'); popText(F.x, F.y, 22, '-' + o.cost, '#ffd76a'); burst(F.x, F.y, 14, ['#ffd76a', '#fff2a8'], 10, 'coin');
  if (id === 'field') log('新的田地开放了，农夫会去清理');
  if (o.item.region) log(`${o.item.name}的篱笆门打开了`);
  if (id === 'coop' || id === 'shed') log(`${o.item.name}盖好了`);
  if (id === 'house') { log(`房子扩建成了${o.level.label}，能住 ${popCap()} 个人`); burst(HOUSE.x, HOUSE.y, 30, [Wd[3], Wd[4], '#fff2a8'], 16, 'wood');
    if (S.family.love >= FAM.LOVE_MAX && !S.family.moved) log('阿禾说明天就搬过来'); }
  if (id === 'fence') log('给每个动物棚子围上了木篱笆，动物们每晚更开心');
  if (AN.KINDS[id]) { const a = S.animals.filter(q => q.kind === id).pop(); log(`一只${AN.KINDS[id].name}住进了${PENS[a ? homeOf(a) : AN.KINDS[id].home].name}`); }
  worksBoughtLog(id);
  if (YD.ITEM[id]) yardBought(id, who); // v5.10.11.1: say who is coming and when, and show where it goes
  if (id === 'town' && TN) { if (TOWN_ON) TA.sync(true); markNavDirty(); log('镇门打开了：孩子们以后去镇上的学校，镇上的小店收工坊货、蜂蜜和鱼（多给两成）'); burst(TN.GATE.x, TN.GATE.y, 20, [Wd[3], Wd[4], '#fff2a8'], 12, 'wood'); albumSnap('towngate', TN.GATE.x, TN.GATE.y + 6, { wait: 0 }); }
  if (DC.CATALOG[id]) log(id === 'party' ? '派对区的桌椅和串灯买好了，家人会找一块空地搭起来' : `${o.item.name}放进了仓库，家人会找地方摆上（也可以用「摆${o.item.name}」自己选地方）`); // v5.7.0
  if (AN.PETS[id]) log(`${o.level.label}来到了农场`);
  if (PENS[id]) for (let i = yard.length - 1; i >= 0; i--) { const c = yard[i], P = PENS[id]; if (Math.hypot(c.x - P.bld.x, c.y - P.bld.y) < 16 || Math.hypot(c.x - P.trough.x, c.y - P.trough.y) < 10) yard.splice(i, 1); } // builders tidy the spot
  noteLog('purchase', { id, who, name: o.item.name, label: o.level.label, cost: o.cost, region: !!o.item.region, day: S.day, t: S.t, createdAt: S.createdAt, now: Date.now() });
  noteProgress();
  return { ok: true, offer: o };
}

// ---------- farmer AI: task board + scoring ----------
// Every system posts the jobs it has (with a target and a base priority) to a board; the farmer takes the job with the best
// score = base priority - walking distance / 8. Hard rules (night, a full basket) come first. Picking the nearest target per
// kind makes him work along a row instead of zigzagging. Later, helpers will read the same board and claim tiles.
function storeTask() { return { kind: 'store', label: '正在把种子放进仓库', to: BARN_DOOR, dur: 8, done: () => { log(`把 ${F.gathered} 颗胡萝卜种子放进仓库`); S.store.carrot += F.gathered; F.gathered = 0; } }; }
function homeTask() { const me = F; return { kind: 'home', label: '回家睡觉', to: DOOR, dur: 5, done: () => { me.home = true; me.sleeping = true; if (me === FARMER) log('回到家，躺下睡觉 Zzz'); } }; }
// ---- v5.11.0.28 work priorities (day-132 farm: chores piled up while the family sat on the deck and the marked trees waited) ----
// The player's chop marks come first (CHOP_ORDER_BASE, above harvest 90) and whoever fells one walks on to the next marked
// tree beside it in the same trip. The sunset deck and the market-day gathering only run long when nothing urgent waits;
// otherwise an hour each a day (REST_CAP). Demand crops (DEMAND_TILES: wheat for the mill, cabbage and carrot for the
// diner) keep a few tiles of their own. The married children and their partners come over 6–8 and 17–19 for the harvest
// and the collecting (HELP_WIN, HELP_KINDS), and on a day with beach guests the farmer fishes about an hour before the
// seafood stall serves at 11:30 (SEA_QUOTA_MIN).
const CHOP_ORDER_BASE = 95, CHOP_CHAIN_R = 48, REST_CAP = 60, SEA_QUOTA_MIN = 60, SEA_QUOTA_BY = 11 * 60 + 15;
const HELP_WIN = [[6 * 60, 8 * 60], [17 * 60, 19 * 60]], HELP_KINDS = ['harvest', 'collect', 'pick', 'honey', 'water', 'refill', 'sell', 'deliver'];
const DEMAND_TILES = { wheat: 8, cabbage: 4, carrot: 4 }; // the mill's wheat run is an errand too (worksBoard), so the flour does not wait behind field work
const orderedChop = () => S.orders.filter(o => o.type === 'chop').map(o => S.trees.find(t => t.id === o.id)).filter(t => t && S.eff.axe && WD.choppable(t, S.eff.regions));
function chopNext() { // the marked tree beside the one just felled (chopTask leaves it in F._chopNext)
  const t0 = F._chopNext; F._chopNext = null; if (!t0 || F.crops.length >= BASK() || F._helpWin) return null;
  const T = S.t % 1440; if (T >= sleepAt() - 20) return null;
  const taken = claimsFor(F); const t = orderedChop().filter(t => t !== t0 && !taken.has(t) && Math.hypot(t.x - t0.x, t.y - t0.y) <= CHOP_CHAIN_R).sort((a, b) => Math.hypot(a.x - F.x, a.y - F.y) - Math.hypot(b.x - F.x, b.y - F.y))[0];
  if (!t) return null; F.idleCount = 0; return Object.assign(chopTask(t), { kind: 'chop', label: '接着砍旁边标记的树' });
}
function workPending() { // what should not wait for the deck or the shop gathering
  if (orderedChop().length) return true;
  for (const t of tiles) if (t.open && t.crop && SU.canHarvest(t.crop, SIM.ripe)) return true;
  if (S.animals.some(a => a.ready > 0)) return true;
  return !!(S.works && S.works.hives && S.works.hives.some(h => h && h.ready > 0));
}
const restDay = () => (F._rest && F._rest.day === S.day ? F._rest : (F._rest = { day: S.day }));
const restWorker = () => F === FARMER || F.role === 'partner' || F.role === 'teen';
const restOk = k => !restWorker() || (restDay()[k.kind] | 0) < REST_CAP || !workPending();
const restUse = k => { if (restWorker()) { const d = restDay(); d[k.kind] = (d[k.kind] | 0) + (k.dur | 0); } return k; };
function demandGrowing() { const c = {}; for (const t of tiles) if (t.open && t.crop && DEMAND_TILES[t.crop.type]) c[t.crop.type] = (c[t.crop.type] | 0) + 1; return c; }
function demandWant() { // tiles each demand crop should keep going today
  const w = {};
  if (S.eff.mill && S.works && S.works.works && S.works.works.mill) w.wheat = DEMAND_TILES.wheat;
  if (IN && S.inn && IN.dinerUp(S.inn)) { w.cabbage = DEMAND_TILES.cabbage; w.carrot = DEMAND_TILES.carrot; }
  for (const k of Object.keys(w)) if (!(S.eff.crops || []).includes(k) && k !== 'wheat') delete w[k];
  return w;
}
function demandPick(bag) { // a demand crop that is short and in this bag (null: plant as usual)
  const w = demandWant(), g = demandGrowing();
  for (const k of Object.keys(w)) if ((g[k] | 0) < w[k] && (bag[k] | 0) > 0) return k;
  return null;
}
function demandFetchN() { // demand seed waiting in the storehouse for tiles that are short (0: nothing to fetch)
  const w = demandWant(), g = demandGrowing(); let n = 0;
  for (const k of Object.keys(w)) n += Math.min(S.store[k] | 0, Math.max(0, w[k] - (g[k] | 0) - (F.bag[k] | 0)));
  return n;
}
function demandStoreSeeds() { // morning: demand seed in the bag of someone who does not sow the fields goes to the storehouse
  for (const a of S.members) { if (FAM.areasOf(a.id, a.role).includes('field')) continue;
    for (const k of Object.keys(DEMAND_TILES)) if ((a.bag[k] | 0) > 0) { S.store[k] = (S.store[k] | 0) + a.bag[k]; a.bag[k] = 0; } }
}
function demandShort(k) { // seeds still to buy for a demand crop: its tiles minus what grows and what the family holds
  const w = demandWant()[k]; if (!w) return 0;
  let n = demandGrowing()[k] | 0; n += S.store[k] | 0; for (const a of actors()) n += a.bag[k] | 0;
  return Math.max(0, w - n);
}
function seaQuota() { // sea fish the stall still lacks for today's beach guests (only before it serves at 11:30)
  if (F !== FARMER || !IN || !S.inn || !IN.stallUp(S.inn) || !IN.stallMealsWanted) return 0;
  if (S.inn.resort && S.inn.resort._meal === S.day) return 0;
  const T = S.t % 1440; if (T < WAKE || T >= SEA_QUOTA_BY || !(S.eff.searod && S.eff.regions.includes('coast'))) return 0;
  const want = IN.stallMealsWanted(S.inn, S.day) | 0; if (!want) return 0;
  let have = 0; for (const a of actors()) for (const it of a.crops) if (typeof it === 'string' && IN.isSeaFish(it)) have++;
  return Math.max(0, want - have);
}
function seaHold(a) { // index flags: sea fish that wait in the basket for the stall's 11:30 meal
  const keep = new Array(a.crops.length).fill(false);
  if (!IN || !S.inn || !IN.stallUp(S.inn) || (S.inn.resort && S.inn.resort._meal === S.day) || S.t % 1440 >= 11 * 60 + 30) return keep;
  let n = IN.stallMealsWanted ? IN.stallMealsWanted(S.inn, S.day) | 0 : 0;
  a.crops.forEach((it, i) => { if (n > 0 && typeof it === 'string' && IN.isSeaFish(it)) { keep[i] = true; n--; } });
  return keep;
}
function helpEnd() { // the window is over: workshop goods go to the farmer; a spouse (not saved) hands the rest to the married child's basket
  F._helpWin = 0; if (!F.crops.length) return;
  { const keep = worksKeep(F), give = F.crops.filter((_, i) => keep[i]); // what a workshop waits for (the mill's wheat) goes to the farmer, who delivers it
    if (give.length) { const left = F.crops.filter((_, i) => !keep[i]); F.crops.length = 0; F.crops.push(...left); FARMER.crops.push(...give); } }
  if (!F._spouse || !F.crops.length) return;
  const m = memberOf(F._spouse); if (m) { m.crops.push(...F.crops); F.crops.length = 0; }
}
function helpWinNow(T) { const i = HELP_WIN.findIndex(w => T >= w[0] && T < w[1]); return i < 0 ? 0 : S.day * 2 + i + 1; }
function farmHands() { // the main farm's harvest / collecting backlog the married ones would come over for
  let n = 0; for (const t of tiles) if (t.open && t.crop && SU.canHarvest(t.crop, SIM.ripe)) n++;
  for (const a of S.animals) if (a.ready > 0) n++;
  return n;
}
function board() {
  const T = S.t % 1440, E = S.eff, out = [];
  const shut = T < SHOP_OPEN || T >= SHOP_CLOSE - 20; // v5.0: no trips to a closed stall (crops wait in the basket until morning)
  const post = (kind, base, at, make, key, area, order) => { if (at && !(shut && at === STALL_SPOT)) out.push({ kind, base, at, make, key, area: area || FAM.AREA_OF[kind], order: !!order }); }; // at = null: every target is claimed; v5.11.0.28 order: the player's own command (or a demand seed), no "someone else's area" penalty
  const open = tiles.filter(t => t.open && !CLAIM.has(t));
  const ripe = open.filter(t => t.crop && SU.canHarvest(t.crop, SIM.ripe));
  const dry = open.filter(t => t.crop && SU.canGrow(t.crop, SIM.ripe) && !t.watered);
  const debris = open.filter(t => t.debris), weeds = open.filter(t => t.weed);
  const tilledEmpty = open.filter(t => t.tilled && !t.crop && !t.weed);
  const tillable = open.filter(t => !t.tilled && !t.crop && !t.debris && !t.weed);
  const bagN = seedCount(F.bag), storeN = seedCount(S.store), full = F.crops.length >= BASK();
  if (ripe.length && !full) { const t = rngNear(ripe); post('harvest', 90, t, () => harvestTask(t)); }
  if (dry.length) { const late = T >= 15 * 60;
    if (F.water <= 0) { const w = rngNear(waterSpots()); post('refill', late ? 95 : 60, w, () => refillTask(w), undefined, 'field'); }
    else { let t = rngNear(dry); // v5.0 sprinkler can: aim at the tile with the most thirsty crops around it
      if (t && E.water3) t = dry.reduce((b, u) => { const v = dry.filter(w => w.f === u.f && Math.abs(w.c - u.c) <= 1 && Math.abs(w.r - u.r) <= 1).length * 100 - travel(F, u); return v > b.v ? { t: u, v } : b; }, { t, v: -1e9 }).t;
      post('water', late ? 96 : 61, t, () => waterTask(t)); } }
  if (tilledEmpty.length && !demandPick(F.bag)) { const n = demandFetchN(); if (n > 0) post('fetch', 72, BARN_DOOR, () => fetchTask(n)); } // v5.11.0.28: the mill's / diner's seed from the storehouse
  if (tilledEmpty.length && bagN > 0) { const t = SU.pickPlantTile(tilledEmpty, tiles, F.bag, rand) || rngNear(tilledEmpty); post('plant', 70, t, () => plantTask(t), undefined, undefined, !!demandPick(F.bag)); } // v5.11.0.28: 阿禾 sows a short demand crop too
  else if (tilledEmpty.length && (storeN > 0 || F.gathered > 0)) post('fetch', 68, BARN_DOOR, () => fetchTask(tilledEmpty.length + tillable.length));
  else if (tilledEmpty.length && S.coins >= SIM.CROPS.carrot.seed && T < 17 * 60) post('buy', 55, STALL_SPOT, sellTask);
  if (weeds.length) { const t = rngNear(weeds); post('weed', 45, t, () => weedTask(t)); }
  if (debris.length) { const t = rngNear(debris); post('clear', 40, t, () => clearTask(t)); }
  if (yard.length) { const c = rngNear(yard); post('tidy', 18, c, () => yardTask(c)); }
  // v4.6 fishing: lowest-priority idle work (below yard tidy 18). Sea fishing is a little more worthwhile once unlocked.
  const fishedOut = S.members.length && F.fishDay === S.day && F.fishMin >= FISH_FAMILY_CAP; // v5.3: with family around he does not fish the whole afternoon away
  if (T < 19 * 60 && F.crops.length < BASK() && !fishedOut) {
    if (E.searod && E.regions.includes('coast')) { const sp = fishSpot('sea'); post('fish', 12, sp.stand, () => fishTask('sea')); }
    else post('fish', 8, FS.POND_SPOT.stand, () => fishTask('pond')); }
  { const q = seaQuota(); if (q > 0 && F.crops.length < BASK() && (F.fishDay !== S.day || F.fishMin < SEA_QUOTA_MIN)) { const sp = fishSpot('sea'); post('fish', 80 + travel(F, sp.stand) / 8, sp.stand, () => Object.assign(fishTask('sea'), { label: '给海鲜摊钓今天的海鱼' })); } } // v5.11.0.28: an errand (the walk to the pier is not held against it)
  if (F.gathered > 0 && (F.gathered >= 12 || (weeds.length === 0 && (F.gathered >= 4 || T >= 18 * 60)))) post('store', 50, BARN_DOOR, storeTask);
  if (tillable.length && T < 17 * 60) { // the wide hoe aims at the tile whose 3x3 has the most soil to turn
    const t = E.till3 ? tillable.reduce((b, u) => { const v = tillable.filter(w => w.f === u.f && Math.abs(w.c - u.c) <= 1 && Math.abs(w.r - u.r) <= 1).length * 100 - Math.hypot(u.x - F.x, u.y - F.y); return v > b.v ? { t: u, v } : b; }, { t: null, v: -1e9 }).t : rngNear(tillable);
    post('till', 35, t, () => tillTask(t)); }
  // v4.3: fruit to pick, and the player's orders (chop a marked tree, transplant a sapling where he pointed)
  const ripeTrees = S.trees.filter(t => t.stage === 'tree' && t.ripe && WD.FRUIT[t.kind] && treeReachable(t));
  if (ripeTrees.length && F.crops.length + WD.FRUIT.apple.n <= BASK()) { const t = rngNear(ripeTrees); post('pick', 75, t, () => pickTask(t)); }
  const chop = S.orders.filter(o => o.type === 'chop').map(o => S.trees.find(t => t.id === o.id)).filter(t => t && E.axe && WD.choppable(t, E.regions));
  if (chop.length) { const t = rngNear(chop); post('chop', CHOP_ORDER_BASE + travel(F, t) / 8, t, () => chopTask(t), undefined, undefined, true); } // v5.11.0.28: the player's mark comes first (was 64, under every chore); an errand, the walk to the wood is not held against it
  postAutoChop(post, chop); // v5.3.1: short of wood, a free hand walks to 林场 by themselves
  const plant = S.orders.filter(o => o.type === 'plant' && FARMER.saplings[o.kind] > 0);
  if (plant.length) { const o = rngNear(plant); post('transplant', 64, o, () => transplantTask(o)); }
  // v5.4.0: sprinkle fish food, release an ornamental fish the player flagged, pick up a truffle a dog found
  if (S.fishFood > 0 && S.pondFed !== S.day && T < 18 * 60) post('feedpond', 28, FS.POND_SPOT.stand, feedPondTask);
  const rel = S.orders.filter(o => o.type === 'release');
  if (rel.length && S.pondFish.length < FS.POND_CAP) { const o = rel[0]; post('release', 64, FS.POND_SPOT.stand, () => releaseTask(o)); }
  if (S.loose && S.loose.length) { const it = S.loose[0]; post('collect', 50, { x: it.x, y: it.y }, () => looseTask(it), it, 'yard'); }
  // v4.5/v4.7: the animals. Hay into each building's trough in the morning, water, collect eggs / wool / milk / truffles, a pat each
  if (S.animals.length) { const need = AN.need(S.animals), space = BASK() - F.crops.length;
    const late = T >= 14 * 60 ? 40 : 0; // a far pen loses to field work all day on a big farm; by afternoon the night's feed and water win anyway
    let inTroughs = 0;
    for (const pen of AN.PEN_IDS) { const pn = AN.penNeed(S.animals, pen); if (!pn) continue; const tr = S.troughs[pen], at = troughSpot(pen); inTroughs += Math.min(tr.feed, pn);
      if (machFit(pen)) continue; // v5.11.0.29: the auto feeder keeps this one full
      if (tr.feed < pn && S.hay > 0) post('feed', (T < 12 * 60 ? 82 : 66) + late, at, () => feedTask(pen), PENS[pen].trough);
      if (!tr.water) { if (F.water >= PENS[pen].water) post('trough', 70 + late, at, () => troughTask(pen), PENS[pen].trough);
        else { const w = rngNear(waterSpots()); post('refill', 62 + late, w, () => refillTask(w), undefined, 'animal'); } } }
    const ready = S.animals.filter(a => a.ready > 0);
    const eggs = ready.filter(a => a.kind === 'chicken').reduce((n, a) => n + a.ready, 0);
    if (eggs && space > 0) post('collect', 72, COOP_DOOR, () => eggTask(), PENS.coop.bld, 'coop');
    const big = ready.filter(a => a.kind !== 'chicken');
    if (big.length && space > 0) { const a = rngNear(big.map(animalSpot)); if (a) post('collect', 72, a, () => milkTask(a.an)); }
    const lonely = S.animals.filter(a => !a.pet);
    if (lonely.length && T < 18 * 60) { const a = rngNear(lonely.map(animalSpot)); if (a) post('pet', 26, a, () => petTask(a.an)); }
    const short = S.hay + inTroughs < need; // tonight's feed is not covered: buying hay beats almost everything
    if (!machAllFed() && S.hay < need * 2 && S.coins >= AN.HAY.price * need && (short || T < 17 * 60)) post('hay', short ? 80 + late : 54, STALL_SPOT, sellTask);
  }
  // v4.7: a pat for each pet once a day, when nothing better is waiting
  if (T < 18 * 60) { const p = PETS_LIVE.find(p => !p.patted && !CLAIM.has(petView(p))); if (p) { const v = petView(p); post('petpet', 20, { x: v.x - 7, y: v.y + 1 }, () => patPetTask(p), v); } }
  const spareWood = F === FARMER ? FARMER.wood - woodCap() : 0; // v5.0: wood stays in the storehouse; only what does not fit is sold
  worksBoard(post, T); // v5.6.0
  decorBoard(post, T); // v5.7.0
  yardBoard(post, T); // v5.10.3
  if (TN) townBoard(post, T); // v5.8.0: the town shop
  if (HM) homeBoard(post); // v5.9.0: putting up a new house
  const sellN = F.crops.length - worksKeepN(F); // v5.6.0: goods kept for a workshop do not send anyone to the stall
  if (sellN > 0 || spareWood > 0) {
    const busy = ripe.length || dry.length || (tilledEmpty.length && bagN);
    const base = full ? 100 : T >= 17.5 * 60 ? 80 : F.crops.length >= BASK() * 0.6 || spareWood >= 20 ? 58 : !busy ? 30 : 0;
    if (base) post('sell', base, STALL_SPOT, sellTask);
  }
  return out;
}

// v5.4.3: kids.js picks play and school tasks; the game only supplies the live world (pets, pens, pond, path)
function kidCtx() {
  const kid = (S.family.kids || []).find(k => k.id === F.id);
  const pets = PETS_LIVE.map(p => { const v = petView(p), name = ((AN.PETS[p.kind] || {}).coats || []).find(c => c.id === p.coat); return { id: p.id, kind: p.kind, coat: p.coat, name: name ? name.name : (p.kind === 'dog' ? '小狗' : '小猫'), x: v.x, y: v.y, view: v, pet: p }; });
  const pens = [];
  for (const id of AN.PEN_IDS) {
    const kinds = [];
    for (const a of S.animals) { const k = AN.KINDS[a.kind]; if (k && homeOf(a) === id && !kinds.includes(a.kind)) kinds.push(a.kind); }
    if (!kinds.length) continue;
    const P = PENS[id];
    if (P.needs && !S.eff.regions.includes(P.needs) && P.needs !== null) continue;
    pens.push({ id, name: P.name, door: P.door, kinds });
  }
  return { actor: F, day: S.day, t: S.t, kid, pets, pens, pond: POND, pondFish: (S.pondFish || []).length, regions: S.eff.regions || [],
    areaAt: (x, y) => WD.areaAt(x, y), rng: rand, lastKind: F.task && F.task.play ? F.task.kind : (F._playKind || null),
    door: DOOR, world: WD.WORLD, allowFeed: true, playSpots: XP.playSpots(), school: TN ? schoolRoute() : null, // v5.5.0; v5.8.0
    sports: !!(SC && S.town && SC.isDay(S.town.hall, S.day)), race: (SC && S.town && SC.isDay(S.town.hall, S.day)) ? SC.raceAt((F.id === 'kid1' ? 1 : 0), realT, 6) : null,
    library: (LB && S.town && LB.built(S.town.hall) ? LB.STAND : null),
    libVia: (LB && TN && townOpen()) ? schoolRoute().via.concat([TN.SCHOOL_DOOR, LB.STAND]) : [],
    libViaHome: (LB && TN) ? [LB.STAND].concat(schoolRoute().via.slice().reverse()) : [],
    libUntil: (window.PFKids && F.id) ? PFKids.returnAt((S.family.kids || []).find(k => k.id === F.id) || { born: 0 }) + 20 : 14 * 60 + 20,
    inTown: (x, y, pad) => !!(TN && TN.inTown(x, y, pad || 0)) };
}
function finishKidTask(k) {
  if (!k) return k;
  if (k.leave) { if (TN) townSchoolGo(F); k.done = () => { F.away = 'school'; F.x = k.to.x; F.y = k.to.y; log(`${F.name}${townOpen() ? '走进了镇上的学校' : '去上学了'}`); noteProgress({ wentSchool: true }); }; }
  if (k.toRace) { if (TN) townSchoolGo(F); k.done = () => { F._sports = 1; log(`${F.name}来到操场参加运动会`); noteProgress({ wentSchool: true }); albumSnap('sports', Math.round(F.x), Math.round(F.y), { wait: 15, follow: F.id }); }; }
  if (k.toLib) {
    const ex = window.PFKids.schoolExit(kidCtx());
    F.away = null; F.x = ex.to.x; F.y = ex.to.y; F.fx = 1; F.fy = 0;
    k.done = () => { F._lib = 1; libraryRead(F); log(`${F.name}放学后在书屋看了一会儿书`); };
  }
  if (k.fromLib) { F._lib = 0; k.done = () => { log(`${F.name}从书屋回家了`); }; }
  if (k.comeBack) {
    const ex = window.PFKids.schoolExit(kidCtx());
    const x1 = (WD.WORLD && WD.WORLD.x1) || 352;
    F.away = null; F._lib = 0; F._sports = 0; F.x = Math.min(ex.to.x, x1 - 2); F.y = ex.to.y; F.fx = -1; F.fy = 0;
    k.done = () => { log(`${F.name}放学回来了`); };
    if (TN) townMateHome(F, ex); // v5.8.0: now and then a classmate comes along
  }
  if (k.kind === 'play-pet' && k.pet && k.pet.pet) k.done = () => { const v = k.pet.view || petView(k.pet.pet); hearts(v.x, v.y, 8); if (v.pose === 3) v.pose = 2; v.idle = 0; log(`${F.name}摸了摸${k.pet.name}`); };
  else if (k.kind === 'play-pet' && k.pet) k.done = () => { hearts(k.pet.x, k.pet.y, 8); log(`${F.name}摸了摸${k.pet.name}`); };
  if (k.kind === 'play-slide' || k.kind === 'play-sandbox' || k.kind === 'play-swing') { // v5.5.0: 第一次在乐园玩 → 成就
    const prev = k.done; k.done = () => { if (prev) prev(); noteProgress({ playedPark: true }); }; }
  F._playKind = k.kind;
  return k;
}
function kidPickTask() { const c = kidCtx(); let k = PFKids.pickTask(c); if (k && k.leave && TN && townSkip(F)) k = PFKids.pickPlay(c); return finishKidTask(k); } // v5.8.0: a day off now and then
function kidPickPlay() { return finishKidTask(PFKids.pickPlay(kidCtx())); }

function chooseTask() {
  const T = S.t % 1440;
  if (HM) { const wt = weddingTask(); if (wt) return wt; } // v5.9.0: the wedding
  { const ft = feastTask(); if (ft) return ft; } // v5.10.11: harvest feast (runs past bedtime, to 22:00)
  if (HM) { if (F._spouse) { const st = spouseTask(); if (st) return st; } else { const ht = homeChoose(); if (ht) return ht; } } // the couple's own day (v5.11.0.28: null = helping on the main farm)
  { const pt = partyTask(); if (pt) return pt; } // v5.7.0: a party evening (runs past bedtime, to 20:30)
  { const sp = sportsTask(); if (sp) return sp; } // v5.10.9: watch the sports day on the playground
  { const st = F._helpWin ? null : sunsetTask(); if (st && restOk(st)) return restUse(st); } // v5.10.8: sit on the sunset deck 17:00–19:00 (v5.11.0.28: an hour while work waits)
  if (CR) { const cft = careerFest(); if (cft && !F._spouse && !(F.id && HM && HM.isMarried(S.home, F.id)) && restOk(cft)) return restUse(cft); } // v5.10.6: on a festival the family gathers at the child's shop
  if (T >= sleepAt() || T < WAKE - 30) {
    if (F.crops.length - worksKeepN(F) > 0 && shopOpen(T)) return sellTask(); // v5.0: the stall is shut at night; the basket waits until morning
    if (F.gathered > 0 && T < sleepAt() + 60) return storeTask();
    return homeTask();
  }
  if (window.PFKids && F.id && /^kid/.test(F.id) && !F._helpWin) { const k = kidPickTask(); if (k) return k; }
  { const ct = chopNext(); if (ct) return ct; } // v5.11.0.28: the next marked tree beside the one just felled, same trip
  let best = null, bs = -Infinity;
  const others = workingOthers(F).map(a => ({ id: whoId(a), role: a.role })), me = whoId(F);
  const taken = CLAIM = claimsFor(F); CROWD = crowdFor(F); const jobs = board();
  for (const j of jobs) { if (F.role && !FAM.canDo(F.role, j.kind)) continue; if ((j.key && taken.has(j.key)) || taken.has('kind:' + j.kind)) continue;
    if (F._helpWin && !HELP_KINDS.includes(j.kind)) continue; // v5.11.0.28: the married ones come over for the harvest and the collecting
    const aff = FAM.affinity(me, F.role, j.area, others); // v5.11.0.28: a player's order (or a demand seed) is everyone's job: no -HELP
    const s = j.base - travel(F, j.at) / 8 + (j.order && aff < 0 ? 0 : aff) - crowd(j.at) / 4; if (s > bs) { bs = s; best = j; } }
  CLAIM = new Set(); CROWD = [];
  if (!best && F._helpWin) { F._helpOff = F._helpWin; helpEnd(); return F._spouse ? spouseTask() : homeChoose() || null; } // v5.11.0.28: nothing left to help with
  if (best) { F.idleCount = 0; const k = best.make(); k.kind = best.kind; return k; }
  // nothing on the board: rest or stroll. v5.4.3: a child who is not working goes off to play (pets, pens, pond, skip)
  F.idleCount++;
  if (window.PFKids && F.id && /^kid/.test(F.id)) { const k = kidPickPlay(); if (k) return k; }
  if (F.role === 'child') { const at = F.id === 'kid1' && S.eff.coop ? { x: COOP_DOOR.x + 8, y: COOP_DOOR.y + 6, label: '在鸡舍边看小鸡' } : { x: DOOR.x + 14, y: DOOR.y + 10, label: '在院子里玩' };
    return { kind: 'idle', label: at.label, to: { x: at.x + R(-3, 3), y: at.y + R(-2, 2) }, dur: 12 }; } // v5.3: a child plays in their own corner
  if (F.id === 'partner' && F.idleCount % 3 !== 0) { const spots = idleSpotsOf(F); if (spots.length) { const p = pick(spots); return { kind: 'idle', label: p.label, to: { x: p.x, y: p.y }, dur: 14, rest: true }; } }
  if (F.idleCount % 3 === 0) { const t = pick(tiles.filter(t => t.open)); return { kind: 'idle', label: '在田边巡视', to: { x: t.x + R(-6, 6), y: FIELD.r0 * TILE - 4 }, dur: 6 }; }
  return { kind: 'idle', label: '坐在池塘边休息', to: F === FARMER ? BENCH_SPOT : { x: BENCH_SPOT.x + 5 + 4 * S.members.indexOf(F), y: BENCH_SPOT.y + 1 }, dur: 25, rest: true };
}
// v5.3: 阿禾 takes her breaks in her own corner of the farm (by a pen she looks after, or under a fruit tree), not on his bench
function idleSpotsOf(m) { const out = [];
  for (const pen of AN.PEN_IDS) if (S.animals.some(a => homeOf(a) === pen)) { const at = troughSpot(pen); out.push({ x: at.x - 2, y: at.y + 6, label: '在棚子边看着动物们' }); }
  for (const t of S.trees) if (t.stage === 'tree' && WD.FRUIT[t.kind] && treeReachable(t)) out.push({ x: t.x - 6, y: t.y + 5, label: '在果树下歇一会儿' });
  return out.filter(p => Math.hypot(p.x - FARMER.x, p.y - FARMER.y) > CROWD_R).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)).slice(0, 3); } // a nearby one: a break, not a hike
function harvestTask(t) {
  const origin = SU.originOf(t, tiles), giant = !!(origin.crop && origin.crop.giant);
  const name = origin.crop ? SIM.CROPS[origin.crop.type].name : '';
  return { label: giant ? `正在收获巨大的${name}` : '正在收获', to: standAt(origin), tile: origin, dur: giant ? 6 : 4, fx: 'leaf', pose: 'pull', done: () => {
    const t0 = SU.originOf(origin, tiles);
    if (!t0.crop || !SU.canHarvest(t0.crop, SIM.ripe) || F.crops.length >= BASK()) return;
    const crop = t0.crop, ty = crop.type, c = SIM.CROPS[ty], item = SU.harvestItem(crop), big = !!crop.giant;
    const cx = big ? t0.x + TILE / 2 : t0.x, cy = big ? t0.y + TILE / 2 : t0.y;
    F.crops.push(item); groundDirty = true; diary('h', ty);
    const ck = BOOK.itemKey(item); if (ck) { BOOK.record(S.codex, ck, S.day); noteProgress({ sawRare: /rare:/.test(ck), sawGiant: !!item.giant || /giant:/.test(ck), sawGiantPumpkin: item.giant && ty === 'pumpkin' }); if (item.giant) albumSnap('giant', Math.round(F.x), Math.round(F.y), { wait: 0, follow: albumId(F) }); }
    burst(cx, cy, big ? 12 : 4, ['#f0a030', '#8fd35a', '#ffffff', '#fff2a8'], big ? 16 : 8, big ? 'spark' : 'harvest');
    popText(cx, cy, 12, big ? '巨大!' : '+1', '#ffffff');
    if (big) decorKeepGiant(ty, cx, cy); // v5.7.0: the first of each kind leaves a keepsake
    if (big) { hearts(cx, cy, 16); say(F === FARMER ? `头顶着巨大的${c.name}，开心地去卖！` : `${F.name}头顶着巨大的${c.name}，开心地去卖！`); }
    if (c.regrow && !big && (crop.n || 0) + 1 < c.harvests) { t0.crop.n = (crop.n || 0) + 1; t0.crop.age = c.days - c.regrow; t0.crop.stage = SIM.stageOf(t0.crop); if (crop.glow) t0.crop.glow = 1; log(`摘了一个${SU.itemName(item, cropNames())}（第 ${t0.crop.n} 次）`); return; }
    if (big) SU.clearGiant(t0, tiles); else t0.crop = null;
    let n = SIM.harvestSeeds(ty, rand); if (big) n += SIM.harvestSeeds(ty, rand);
    if (n) { F.bag[ty] += n; S.flow.harvest += n; popText(cx + 3, cy, 16, `+${n}种`, '#e6c35c'); }
    log(`收获了${SU.itemName(item, cropNames())}` + (n ? `，留下 ${n} 颗种子` : ''));
  } };
}
function refillTask(w = WELL_SPOT) { const well = w === WELL_SPOT; return { label: well ? '正在井边打水' : '正在水桶边打水', to: w, dur: well ? 8 : 6, fx: 'water', done: () => { F.water = S.waterMax; log(`在${well ? '井边' : '水桶边'}装满了水壶（${S.waterMax} 格）`); } }; }
function waterTask(t) {
  const wide = S.eff.water3;
  return { label: wide ? '正在用花洒浇一片' : '正在浇水', to: standAt(t), tile: t, dur: 3, fx: 'water', pose: 'water', done: () => {
    const area = wide ? tiles.filter(u => u.f === t.f && Math.abs(u.c - t.c) <= 1 && Math.abs(u.r - t.r) <= 1).sort((a, b) => (a === t ? -1 : b === t ? 1 : 0)) : [t];
    for (const u of area) { if (u.watered || F.water <= 0 || !u.crop || !u.open) continue; F.water--; u.watered = true; groundDirty = true; burst(u.x, u.y, 6, ['#8cc6dc', '#5b9cc4'], wide ? 4 : 10, 'drop'); }
  } };
}
function plantTask(t) {
  const ty = demandPick(F.bag) || SU.pickSeed(t, tiles, F.bag, () => wheatPick() || SIM.pickFromBag(F.bag, S.prices)); // v5.6.0: wheat only while the mill wants it; v5.11.0.28: a short demand crop first (before the giant-patch habit)
  return { label: `正在播种${SIM.CROPS[ty].name}`, to: standAt(t), tile: t, dur: 3, fx: 'seed', pose: 'pull', done: () => { if (t.crop || !t.tilled || !ty || F.bag[ty] <= 0) return; F.bag[ty]--; diary('p', ty); t.crop = { type: ty, age: 0, n: 0, stage: 0, rot: R(0, 6.28) }; if (WX && WX.isRaining(S.weather, S.day, S.t)) t.watered = true; groundDirty = true; } };
}
function fetchTask(need) { // take the best seeds from the barn first
  return { label: '正在从仓库取种子', to: BARN_DOOR, dur: 5, done: () => {
    if (F.gathered > 0) { S.store.carrot += F.gathered; F.gathered = 0; }
    const order = CROP_IDS.slice().sort((a, b) => SIM.netPerDay(b, S.prices, true) - SIM.netPerDay(a, S.prices, true)), took = SIM.emptySeeds();
    let left = need; const dw = demandWant(), dg = demandGrowing(); // v5.11.0.28: a short demand crop's seed comes along first
    for (const k of Object.keys(dw)) { const m = Math.min(left, S.store[k] | 0, Math.max(0, dw[k] - (dg[k] | 0) - (F.bag[k] | 0))); if (m > 0) { S.store[k] -= m; F.bag[k] += m; took[k] = m; left -= m; } }
    for (const k of order) { if (left <= 0) break; const m = Math.min(left, S.store[k]); S.store[k] -= m; F.bag[k] += m; took[k] += m; left -= m; if (left <= 0) break; }
    log(`从仓库取出种子：${seedText(took) || '没有了'}`);
  } };
}
function weedTask(t) {
  return { label: '正在拔草收集种子', to: standAt(t), tile: t, dur: 6, fx: 'leaf', pose: 'pull', done: () => { if (!t.weed) return; t.weed = null; const n = RI(2, 3); F.gathered += n; S.flow.weed += n; burst(t.x, t.y, 3, ['#5a9a3a', '#e6c35c', '#3f7a32'], 10, 'weed'); popText(t.x, t.y, 10, '+' + n, '#e6c35c'); if (anyPen() && S.hay < AN.HAY.stock) S.hay++; log(`拔掉杂草，收集到 ${n} 颗种子`); } };
}
function clearTask(t) {
  const rock = t.debris.type === 'rock';
  return { label: '正在清理杂物', to: standAt(t), tile: t, dur: rock ? 8 : 6, fx: rock ? 'rock' : 'wood', pose: 'pull', done: () => { if (!t.debris) return; t.debris = null; S.cleared++; burst(t.x, t.y, 2, rock ? ['#9a9a92', '#b9b8ad', '#77776f'] : ['#a0703f', '#7a5230'], 10, rock ? 'rock' : 'wood'); log(rock ? '搬走了一块石头' : '清走了一根树枝'); groundDirty = true; } };
}
function yardTask(c) {
  const labels = { weed: '正在清理院子的杂草', rock: '正在搬走院子里的石头', branch: '正在捡起院子里的枯枝', pebble: '正在清走小石子' };
  const dur = c.type === 'rock' ? 10 : c.type === 'pebble' ? 5 : 8;
  const fx = c.type === 'weed' ? 'leaf' : (c.type === 'rock' || c.type === 'pebble') ? 'rock' : 'wood';
  return { kind: 'tidy', label: labels[c.type], to: standAt(c), tile: c, dur, fx, pose: 'pull', done: () => {
    const i = yard.indexOf(c); if (i < 0) return;
    yard.splice(i, 1); S.cleared++; if (c.type === 'rock') markNavDirty();
    const yr = yardRng(S.cleared * 2654435761 + S.day * 374761393);
    if (c.type === 'weed' && yr() < 0.7) { F.gathered++; S.flow.weed++; popText(c.x, c.y, 10, '+1', '#e6c35c'); }
    else {
      // early-game gold comes from the yard (day 1 has no harvest). Rocks always pay, branches and pebbles often do;
      // a full first-day sweep is about 12–18 gold, later nightly spawns stay small so mid-game is barely affected.
      let g = 0;
      if (c.type === 'rock') g = yr() < 0.4 ? 2 : 1;
      else if (c.type === 'branch' && yr() < 0.7) g = 1;
      else if (c.type === 'pebble' && yr() < 0.4) g = 1;
      if (g) { S.coins += g; S.earned += g; S.todayEarn += g; popText(c.x, c.y, 12, '+' + g, '#ffd76a'); noteLog('income', 'yard', g); }
    }
    const col = c.type === 'weed' ? ['#5a9a3a', '#3f7a32'] : c.type === 'branch' ? ['#a0703f', '#7a5230'] : ['#9a9a92', '#b9b8ad', '#77776f'];
    burst(c.x, c.y, 2, col, 10, c.type === 'weed' ? 'weed' : (c.type === 'rock' || c.type === 'pebble') ? 'rock' : 'wood');
    log(c.type === 'weed' ? '拔掉了院子里的杂草' : c.type === 'rock' ? '搬走了院子里的一块石头' : c.type === 'branch' ? '捡走了院子里的枯枝' : '清走了一颗小石子');
  } };
}
function tillTask(t) { // tilled soil is permanent; the wide hoe turns the 3x3 around the target in one go
  const wide = S.eff.till3;
  return { label: wide ? '正在用宽锄头开垦' : '正在开垦土地', to: standAt(t), tile: t, dur: wide ? 5 : S.eff.tillDur, fx: 'dirt', pose: 'hoe', done: () => {
    const area = wide ? tiles.filter(u => u.f === t.f && Math.abs(u.c - t.c) <= 1 && Math.abs(u.r - t.r) <= 1) : [t];
    for (const u of area) if (u.open && !u.tilled && !u.crop && !u.debris && !u.weed) { u.tilled = true; burst(u.x, u.y, 1, ['#8b5a35', '#a06c43', '#6e452a'], 8, 'dirt'); }
    groundDirty = true;
  } };
}
const treeReachable = t => { const a = WD.areaAt(t.x, t.y); return a === 'home' || S.eff.regions.includes(a); };
const treeStand = t => ({ x: t.x - 8, y: t.y + 2 });
function pickTask(t) {
  const fr = WD.FRUIT[t.kind];
  return { label: `正在摘${fr.name}`, to: treeStand(t), tile: t, dur: 8, fx: 'leaf', pose: 'pull', done: () => {
    const n = Math.min(WD.pickFruit(t), BASK() - F.crops.length); if (!n) return;
    for (let i = 0; i < n; i++) F.crops.push(t.kind); treeChanged(t); diary('h', t.kind, n);
    burst(t.x, t.y, 20, t.kind === 'apple' ? [Rf[2], Rf[3]] : [Ac[2], Ac[1]], 8, 'harvest'); popText(t.x, t.y, 30, '+' + n, '#ffffff'); log(`摘了 ${n} 个${fr.name}`);
  } };
}
function chopTask(t) {
  return { label: '正在砍树', to: treeStand(t), tile: t, dur: WA.chopMinutes(S.eff), fx: 'wood', pose: 'hoe', done: () => {
    S.orders = S.orders.filter(o => !(o.type === 'chop' && o.id === t.id));
    if (t.stage !== 'tree' || t.kind !== 'wild') return;
    // v5.0: only the 林场 forest grows back; anywhere else the stump is dug out overnight (the sapling is the tree's legacy)
    const y = WD.chopYield(rand), back = WD.regrows(t); y.wood = WA.perTree(S.eff, back); t.stage = 'stump'; t.age = 0; treeChanged(t);
    FARMER.wood += y.wood; FARMER.saplings[y.sapling]++; S.woodCut = (S.woodCut || 0) + y.wood; diary('wd', null, y.wood);
    burst(t.x, t.y, 6, [Wd[3], Wd[4], G[3]], 16, 'wood'); popText(t.x, t.y, 20, '+' + y.wood, '#e0b880');
    log(`砍倒一棵树：木材 ${y.wood} 份进仓库，${WD.FRUIT[y.sapling].name}树苗 1 棵` + (back ? '' : '（这里的树不会再长，树桩夜里挖走）'));
    if (y.drop) chopDrop(t, y);
    decorDrop('chop', t.x, t.y); // v5.7.0: now and then a carving or a stone lamp
    F._chopNext = t; // v5.11.0.28: chooseTask walks on to a marked tree beside this one
  } };
}
// v5.0: a felled tree sometimes drops something small (world.js DROPS): fruit, a wildflower (a gift for 阿禾), rare seeds, coins, a nest
const DROP_SPR = {}; // v5.0: little icons that float up from a felled tree (built on first use, five at most)
const dropSpr = k => DROP_SPR[k] || (DROP_SPR[k] = pix({ apple: ['..b..', '.rRr.', 'rrRrr', 'rrrrr', '.rrr.'], orange: ['..g..', '.oyo.', 'ooyoo', 'ooooo', '.ooo.'],
  flower: ['.p.p.', 'ppcpp', '.ppp.', '..g..', '.gg..', '..g..'], seed: ['.bbb.', 'bkkkb', 'bkykb', 'bkkkb', '.bbb.'], nest: ['..c..', '.cEc.', 'tbtbt', '.tbt.'] }[k]));
const floatIcon = (x, y, k) => particles.push({ x, y, z: 22, vx: 0, vy: 0, vz: 7, life: 1.8, spr: dropSpr(k), kind: 'icon' });
function chopDrop(t, y) {
  S.drops = S.drops || {}; S.drops[y.drop] = (S.drops[y.drop] || 0) + 1;
  const room = () => F.crops.length < BASK();
  if (y.drop === 'fruit') { let n = 0; for (let i = 0; i < y.n && room(); i++) { F.crops.push(y.fruit); n++; }
    burst(t.x, t.y, 22, y.fruit === 'apple' ? [Rf[2], Rf[3]] : [Ac[2], Ac[1]], 6, 'harvest'); popText(t.x + 5, t.y, 28, '+' + n, '#ffffff'); floatIcon(t.x - 2, t.y, y.fruit); log(`树上掉下 ${y.n} 个${WD.FRUIT[y.fruit].name}` + (n < y.n ? '（篮子装不下了）' : '')); }
  else if (y.drop === 'flower') { if (room()) F.crops.push('flower'); burst(t.x, t.y, 6, [Ac[3], Ac[0], Ac[1]], 8, 'spark'); popText(t.x + 5, t.y, 26, '+1', '#ffffff'); floatIcon(t.x - 2, t.y, 'flower'); log('树下发现一束野花，可以送给阿禾'); }
  else if (y.drop === 'seed') { S.store[y.seed] += 2; burst(t.x, t.y, 10, ['#e8d9a0', Ac[1]], 8, 'seed'); popText(t.x + 5, t.y, 26, '+2', '#e6c35c'); floatIcon(t.x - 2, t.y, 'seed'); log(`树洞里藏着 2 颗稀有的${SIM.CROPS[y.seed].name}种子，放进仓库`); }
  else if (y.drop === 'coins') { emit('income', { gold: y.gold, source: 'chop' }); S.coins += y.gold; S.earned += y.gold; S.todayEarn += y.gold; burst(t.x, t.y, 12, ['#ffd76a', '#fff2a8'], 10, 'coin'); popText(t.x + 4, t.y, 26, '+' + y.gold, '#ffd76a'); log(`树根下挖到几枚铜钱：${y.gold} 金`); }
  else if (y.drop === 'nest') { if (room()) F.crops.push('egg'); burst(t.x, t.y, 24, [Wd[3], Ac[0]], 8, 'leaf'); hearts(t.x, t.y, 20); popText(t.x + 5, t.y, 28, '+1', '#ffffff'); floatIcon(t.x - 2, t.y, 'nest'); log('树上掉下一个鸟窝，里面有一个蛋'); }
}
function transplantTask(o) {
  return { label: `正在移植${WD.FRUIT[o.kind].name}树苗`, to: { x: o.x - 7, y: o.y + 1 }, tile: o, dur: 12, fx: 'dirt', pose: 'hoe', done: () => {
    if (FARMER.saplings[o.kind] <= 0 || !S.orders.includes(o)) return;
    S.orders = S.orders.filter(q => q !== o); FARMER.saplings[o.kind]--;
    const t = { id: 'p' + S.day + '_' + Math.floor(S.t % 1440) + '_' + S.trees.length, x: o.x, y: o.y, kind: o.kind, v: S.trees.length % 3, stage: 'sapling', age: 0, ripe: 0, cd: 0 };
    S.trees.push(t); treeChanged(t); burst(o.x, o.y, 6, ['#8cc6dc', '#5b9cc4'], 10, 'drop');
    log(`种下一棵${WD.FRUIT[o.kind].name}树苗，浇了第一次水（${WD.SAPLING_DAYS} 天后结果）`);
  } };
}
// ---- v5.3.1 wood automation (rules and numbers in wood.js) ----
// While the storehouse holds less than the next wood purchase needs, a free hand walks to 林场 and fells a grown tree by
// themselves (kind 'chop'; v5.3.2: only the person whose area is the wood, the farmer, gets this job). Only 林场's regrowing trees, never fruit
// trees or the trees at home and in other regions (those still wait for the player's mark), and a few always stay up.
const woodTarget = () => WA.target(SIM.SHOP, S.up, woodCap());
function postAutoChop(post, marked) {
  if (!FAM.areasOf(whoId(F), F.role).includes('wood')) return; // v5.3.2: the trip to 林场 is the wood owner's (the farmer), not 阿禾's or the children's
  if (S.t % 1440 >= WA.AUTO_END || !WA.wants(S.eff, FARMER.wood, woodTarget())) return;
  const free = WA.autoTrees(S.trees, S.eff).filter(t => !CLAIM.has(t) && !marked.includes(t));
  if (free.length <= WA.KEEP) return;
  const t = rngNear(free); if (t) post('chop', WA.autoBase(SIM.SHOP, S.up), t, () => Object.assign(chopTask(t), { label: '自己去林场砍树' }));
}
function woodNight() {
  const re = WA.replant(S.trees, FARMER.saplings, S.eff); for (const t of re) treeChanged(t);
  if (re.length) log(`伐木小屋用仓库里的 ${re.length} 棵树苗补种了林场`);
}
function offlineWood(r) {
  const forestN = S.trees.filter(t => t.kind === 'wild' && WD.regrows(t)).length;
  const w = WA.offline(r.days, S.eff, forestN, FARMER.wood, woodTarget()); if (!w) return;
  FARMER.wood += w; S.woodCut = (S.woodCut || 0) + w; r.wood = w; log(`离线期间家人在林场砍了 ${w} 份木材`);
}
// ---- v4.5 / v4.7 animal tasks ----
const animalSpot = a => { const v = AV.get(a.id), P = PENS[homeOf(a)]; return { x: v ? v.x : P.bld.x, y: v ? v.y : P.bld.y + 14, an: a }; };
function feedTask(pen) { const P = PENS[pen];
  return { label: `正在往${P.name}的饲料槽里添干草`, to: troughSpot(pen), tile: P.trough, sfx: AN.KINDS && Object.keys(AN.KINDS).find(k => AN.KINDS[k].home === (PENS[pen].base || pen)), dur: 6, fx: 'hay', pose: 'pull', done: () => {
    const n = Math.min(S.hay, AN.penNeed(S.animals, pen) - S.troughs[pen].feed); if (n <= 0) return;
    S.hay -= n; S.troughs[pen].feed += n; burst(P.trough.x, P.trough.y, 4, [Ac[1], Wd[4], Ac[2]], 8, 'leaf'); log(`往${P.name}的饲料槽添了 ${n} 份干草（仓库还剩 ${S.hay} 份）`); } };
}
function troughTask(pen) { const P = PENS[pen];
  return { label: `正在给${P.name}的水槽加水`, to: troughSpot(pen), tile: P.trough, dur: 5, fx: 'water', pose: 'water', done: () => {
    if (F.water < P.water || S.troughs[pen].water) return; F.water -= P.water; S.troughs[pen].water = 1; burst(P.trough.x, P.trough.y, 4, ['#8cc6dc', '#5b9cc4'], 8, 'drop'); log(`给${P.name}的水槽加满了水`); } };
}
function eggTask() {
  return { label: '正在鸡舍捡鸡蛋', to: COOP_DOOR, tile: PENS.coop.bld, dur: 6, fx: 'seed', pose: 'pull', done: () => {
    let n = 0, rare = []; for (const a of S.animals) if (a.kind === 'chicken') while (a.ready > 0 && F.crops.length < BASK()) { a.ready--; const it = SU.rollProduct('egg', rand); F.crops.push(it); n++; const ev = SU.productToast(it); if (ev) rare.push(ev); const ck = BOOK.itemKey(it); if (ck) { BOOK.record(S.codex, ck, S.day); noteProgress({ sawRare: true }); } }
    if (n) { diary('pr', 'egg', n); popText(COOP_DOOR.x, COOP_DOOR.y, 16, '+' + n, '#ffffff'); burst(COOP_DOOR.x, COOP_DOOR.y, 6, [Ac[0], '#fff2a8'], 5, 'spark'); log(`在鸡舍捡了 ${n} 个鸡蛋`); }
    for (const ev of rare) surpriseNote(ev, COOP_DOOR.x, COOP_DOOR.y); } };
}
const WORK = { cow: ['正在挤牛奶', 10, 'milk', n => `挤了 ${n} 瓶牛奶`], sheep: ['正在剪羊毛', 12, 'wool', n => `剪了 ${n} 份羊毛`], pig: ['正在跟着猪找松露', 10, 'dirt', n => `猪在树下拱出了 ${n} 颗松露`] };
function milkTask(a) {
  const v = AV.get(a.id), W0 = WORK[a.kind], spot = animalSpot(a);
  if (v) v.hold = 1; // stand still while he works
  const at = v ? { x: v.x - 9 * (v.flip ? -1 : 1), y: v.y + 1 } : spot;
  return { label: W0[0], to: at, tile: v || spot, an: a, dur: W0[1], fx: W0[2], pose: 'pull', done: () => {
    if (v) v.hold = 0; let n = 0; const p = AN.KINDS[a.kind].product;
    let rare = []; while (a.ready > 0 && F.crops.length < BASK()) { a.ready--; const it = SU.rollProduct(p, rand); F.crops.push(it); n++; const ev = SU.productToast(it); if (ev) rare.push(ev); const ck = BOOK.itemKey(it); if (ck) { BOOK.record(S.codex, ck, S.day); noteProgress({ sawRare: true }); } }
    if (n) { diary('pr', p, n); const pv = v || spot; popText(pv.x, pv.y, 18, '+' + n, '#ffffff');
      if (a.kind === 'pig') burst(pv.x + 6, pv.y, 2, [Wd[1], Wd[2], '#6e452a'], 8, 'dirt'); else burst(pv.x, pv.y, 6, [Ac[0], St[3]], a.kind === 'cow' ? 8 : 10, a.kind === 'cow' ? 'drop' : 'leaf');
      log(W0[3](n)); for (const ev of rare) surpriseNote(ev, pv.x, pv.y); } } };
}
function petTask(a) {
  const v = AV.get(a.id); if (v) v.hold = 1;
  const at = v ? { x: v.x - 7, y: v.y + 1 } : animalSpot(a);
  return { label: `正在摸摸${AN.KINDS[a.kind].name}`, to: at, tile: v || at, an: a, dur: 4, pose: 'pull', done: () => {
    if (v) { v.hold = 0; hearts(v.x, v.y); } a.pet = 1; } };
}
function patPetTask(p) { const v = petView(p), name = AN.PETS[p.kind].coats.find(c => c.id === p.coat).name; v.hold = 1;
  return { label: `正在摸摸${name}`, to: { x: v.x - 7, y: v.y + 1 }, tile: v, sfx: p.kind, dur: 4, pose: 'pull', done: () => { v.hold = 0; hearts(v.x, v.y); p.patted = 1; log(`摸了摸${name}，它很开心`); } };
}
function hearts(x, y, z = 10) { burst(x, y, z, [Ac[3], Rf[3]], 3, 'heart'); } // fx.js draws them as little pixel hearts
const PRODUCT_COL = { egg: [Ac[0], St[3]], wool: [Ac[0], St[3]], milk: [Ac[0], Wt[4]], truffle: [Wd[1], Wd[2]] };
const FLOWER_PRICE = 5; // v5.0: a wildflower from a felled tree (a gift for 阿禾, or 5 gold at the stall)
const basePrice = ty => PW.PRODUCTS[ty] ? PW.PRODUCTS[ty].price : ty === 'flower' ? FLOWER_PRICE : FS.isFish(ty) ? FS.priceOf(ty) : WD.FRUIT[ty] ? WD.FRUIT[ty].price : AN.PRODUCTS[ty] ? Math.max(1, Math.round(AN.PRODUCTS[ty].price * (S.prices[ty] || 1))) : SIM.priceOf(ty, S.prices);
const priceOfAny = it => SU.priceOf(it, basePrice(SU.itemType(it)));
// v5.0 the storehouse holds this much wood (a bigger house has a bigger woodshed)
const woodCap = () => { const shop = WS || window.PFWoodshop; const base = WD.HOUSE_TIERS[(S.eff && S.eff.house) || 0].woodCap; return shop && shop.capOf ? shop.capOf(base, S.town && S.town.hall) : base; }; // v5.10.5: +400 once the woodshop is up
// v5.1.1: everything the farm is holding, for the 仓库 panel (today's prices)
function storehouse() {
  const names = cropNames();
  for (const k of WD.FRUIT_IDS) names[k] = WD.FRUIT[k].name;
  for (const k of AN.PRODUCT_IDS) names[k] = AN.PRODUCTS[k].name;
  for (const k of PW.PRODUCT_IDS) names[k] = PW.PRODUCTS[k].name; // v5.6.0
  names.flower = '野花';
  if (FS) for (const id of FS.FISH_IDS) { const f = FS.BY_ID[id] || (FS.fishOf && FS.fishOf(id)); if (f) names[id] = f.name; }
  const label = it => SU.itemName(it, names);
  const seedRows = bags => CROP_IDS.map(k => {
    const n = bags.reduce((s, b) => s + (b[k] || 0), 0); if (!n) return null;
    const unit = SIM.CROPS[k].seedSell; return { id: k, kind: 'seed', name: SIM.CROPS[k].name + '种子', n, unit, gold: n * unit };
  }).filter(Boolean);
  function groupBasket(list) {
    const map = new Map();
    for (const it of list) {
      const o = SU.itemOf(it), key = [o.type, o.glow || 0, o.giant || 0, o.rare || ''].join(':'), unit = priceOfAny(it);
      const e = map.get(key) || { type: o.type, kind: 'item', name: label(it), n: 0, unit, gold: 0, surprise: SU.isSurpriseItem(it), glow: o.glow || 0, giant: o.giant || 0, rare: o.rare || '' };
      e.n++; e.gold += unit; map.set(key, e);
    }
    return Array.from(map.values());
  }
  const famBag = {}; for (const m of S.members) for (const k of CROP_IDS) famBag[k] = (famBag[k] || 0) + (m.bag[k] || 0);
  const baskets = [{ who: '农夫', rows: groupBasket(FARMER.crops) }].concat(S.members.map(m => ({ who: m.name, rows: groupBasket(m.crops) }))).filter(b => b.rows.length);
  const basketGold = baskets.reduce((s, b) => s + b.rows.reduce((a, r) => a + r.gold, 0), 0);
  const cap = woodCap(), wood = FARMER.wood, spare = Math.max(0, wood - cap), woodGold = spare * WD.WOOD.price;
  return {
    store: seedRows([S.store]),
    bag: seedRows([FARMER.bag, { carrot: FARMER.gathered || 0 }]),
    familyBag: seedRows([famBag]),
    baskets, basketGold,
    wood: { n: wood, cap, spare, unit: WD.WOOD.price, gold: woodGold },
    hay: { n: S.hay, unit: AN.HAY.price },
    fishFood: { n: S.fishFood, unit: FS.FOOD.price },
    ornament: FS.ORNAMENTAL.filter(o => (S.ornament[o.id] || 0)).map(o => ({ id: o.id, kind: 'ornament', name: o.name, n: S.ornament[o.id] || 0 })),
    pondFish: S.pondFish.length,
    saplings: WD.FRUIT_IDS.map(k => ({ id: k, kind: 'sapling', name: WD.FRUIT[k].name + '树苗', n: (FARMER.saplings[k] || 0) })).filter(r => r.n),
    bin: S.works.mach ? PW.BIN_IDS.map(k => { const n = PW.binHas(S.works.mach, k), unit = basePrice(k); return n ? { id: k, type: k, kind: 'item', name: binName(k) + '（仓库）', n, unit, gold: n * unit, keep: PW.BIN[k].keep } : null; }).filter(Boolean) : [], // v5.11.0.29
    sellGold: basketGold + woodGold,
  };
}
// v5.0 family: 阿禾 keeps the stall. The first stop there each day is a chat (+3) and the best gift in the basket (a wildflower,
// a fish, fruit, an egg ...); the day's first two sale trips add +1 each. At 100 she moves in once the house has a second room
// and her father takes over the stall.
function giftAtStall() {
  const fam = S.family; if (fam.moved || S.day < FAM.MEET_DAY) return;
  const first = !fam.met, g = fam.chatDay !== S.day ? FAM.bestGift(F.crops) : null; if (g) F.crops.splice(F.crops.indexOf(g), 1);
  const before = fam.love, add = FAM.visit(fam, S.day, g, F.crops.length); if (!add) return;
  const ty = g && SU.itemType(g);
  const name = ty ? (ty === 'flower' ? '一束野花' : FS.isFish(ty) ? '一条' + FS.BY_ID[ty].name : '一个' + (WD.FRUIT[ty] ? WD.FRUIT[ty].name : AN.PRODUCTS[ty] ? AN.PRODUCTS[ty].name : ty)) : '';
  if (g && fam.today && fam.today.day === S.day) fam.today.giftName = name;
  if (first) log('认识了集市的店主阿禾，聊了几句');
  log((g ? `送给阿禾${name}，` : add > FAM.SALE ? '和阿禾聊了一会儿，' : '把菜卖给阿禾，') + `好感 +${add}（${fam.love}/${FAM.LOVE_MAX}）`);
  hearts(STALL.x - 10, STALL.y + 4, 16);
  const gained = fam.love - before;
  if (gained) popText(KEEPER.x, KEEPER.y, 28, '+' + gained + '♥', '#e57fa0');
  if (fam.love >= FAM.LOVE_MAX) log(S.eff.house >= 1 ? '阿禾答应明天搬过来一起住' : '阿禾说：等房子再大一点，我就搬过来（要先扩建成大木屋）');
}
function loveStatus() { // v5.1.1: HUD heart meter, today's gains, and the next milestone
  const fam = S.family, max = FAM.LOVE_MAX, tier = WD.HOUSE_TIERS[S.eff.house || 0];
  const babies = fam.kids.filter(k => FAM.kidStage(k, S.day) === 'baby').length;
  const people = 1 + S.members.length + babies;
  const inlaws = spousesIn(); // v5.11.0.19: a married child's husband or wife is family too (they live in the new house, so the manor's room count is unchanged)
  const today = (fam.today && fam.today.day === S.day) ? fam.today : { chat: 0, gift: 0, giftName: '', sales: 0 };
  let hint;
  if (fam.moved) {
    const kids = fam.kids.map(k => FAM.kidLine(k, S.day));
    const nk = FAM.kidText(FAM.nextKid(fam, S.day, tier.pop)); // v5.3: 「小豆还有 N 天到来」
    const sps = inlaws.map(q => `${q.name}（${kidName(q.kid)}的爱人）`);
    hint = `阿禾已经住在农场。家人：农夫、阿禾${kids.length ? '、' + kids.join('、') : ''}${sps.length ? '、' + sps.join('、') : ''}。${tier.name}，${people}/${tier.pop} 人${inlaws.length ? `；新房子里还有 ${inlaws.length} 位家人` : ''}。` + (nk ? nk + '。' : '');
  } else if (!fam.met) hint = '去集市逛逛，就能认识店主阿禾。';
  else if (fam.love >= max && S.eff.house >= 1) hint = '好感已满，她答应明天搬过来。';
  else if (fam.love >= max) hint = '已满，等待大木屋';
  else hint = '好感满后，扩建大木屋她就会搬来';
  const bits = [];
  if (today.chat) bits.push('聊天 +' + today.chat);
  if (today.gift) bits.push((today.giftName ? '礼物（' + today.giftName + '）' : '礼物') + ' +' + today.gift);
  if (today.sales) bits.push('卖菜 +' + today.sales);
  const total = today.chat + today.gift + today.sales;
  const todayText = bits.length ? ('今天：' + bits.join('，') + '，共 +' + total) : (fam.moved ? '' : '今天还没去集市');
  if (HM && fam.moved) { const notes = fam.kids.map(k => HM.kidNote(S.home, k.id, k.name)).filter(Boolean); if (notes.length) hint += notes.join('；') + '。'; } // v5.9.0
  const all = people + inlaws.length, room = tier.pop + inlaws.length;
  return { home: HM ? homeStatus() : null, met: fam.met, moved: fam.moved, love: fam.love, max, people: all, pop: room, manor: people, manorPop: tier.pop, inlaws: inlaws.map(q => q.name), today, todayText, hint, nextKid: FAM.nextKid(fam, S.day, tier.pop),
    label: fam.moved ? `一家 ${all}/${room}` : `${fam.love}/${max}`, title: fam.moved ? '家人' : '阿禾' };
}
// v5.11.0.19: the married children's partners, from the save (S.home.wed), so the count does not wait for their actor
function spousesIn() {
  if (!HM || !S.home || !S.home.wed) return [];
  return HM.KID_IDS.filter(k => HM.isMarried(S.home, k) && S.family.kids.some(q => q.id === k)).map(k => ({ kid: k, mate: S.home.wed[k].mate, name: HM.mateName(S.home.wed[k].mate) }));
}
// one stop at the stall: sell the whole basket at today's prices and any spare seeds, then buy seeds for the empty tiles
function sellTask() {
  const kid = F.role === 'child' || !!F._spouse; // children sell what they picked; buying stays with the grown-ups (v5.11.0.28: a helping spouse too)
  return { label: F.crops.length ? '正在去市场卖菜' : S.animals.length && S.hay < AN.need(S.animals) * 2 ? '正在去市场买干草' : '正在去市场买种子', to: STALL_SPOT, via: Math.hypot(F.x - STALL_SPOT.x, F.y - STALL_SPOT.y) > 3 && F.y < STALL_SPOT.y - 2 ? [{ x: 140, y: Math.min(92, Math.max(F.y, 56)) }, { x: 140, y: STALL_SPOT.y }] : [], dur: 6, fx: 'coin', done: () => {
    if (!shopOpen()) { if (F === FARMER) log('集市已经关门了，明天早上再来卖'); return; }
    if (F === FARMER) giftAtStall();
    const hold = seaHold(F), keep = F._spouse ? F.crops.map(() => false) : (TN ? tradeKeep(F, worksKeep(F)) : worksKeep(F)).map((v, i) => v || hold[i]), sell = F.crops.filter((_, i) => !keep[i]), kept = F.crops.filter((_, i) => keep[i]), n = sell.length, open = tiles.filter(t => t.open); // v5.6.0: workshop goods stay in the basket
    let sum = 0, nFish = 0, by = { crops: 0, fruit: 0, animals: 0, fish: 0, wood: 0 };
    const sm = YD.stallMult(S.homeyard.put); // v5.10.3: the awning, the new scale, the sign
    for (const it of sell) { const ty = SU.itemType(it), g = Math.round(priceOfAny(it) * sm), base = basePrice(ty); sum += g;
      if (SU.isSurpriseItem(it)) S.surpriseGold = (S.surpriseGold || 0) + Math.max(0, g - base);
      if (WD.FRUIT[ty]) { S.fruitGold = (S.fruitGold || 0) + g; by.fruit += g; } else if (AN.PRODUCTS[ty]) { S.animalGold = (S.animalGold || 0) + g; by.animals += g; } else if (FS.isFish(ty)) { S.fishGold = (S.fishGold || 0) + g; by.fish += g; nFish++; } else by.crops += g; } F.crops.length = 0; F.crops.push(...kept);
    const spare = F === FARMER ? FARMER.wood - woodCap() : 0; // v5.0: only wood the storehouse cannot hold is sold
    if (spare > 0) { const g = spare * WD.WOOD.price; sum += g; S.woodGold = (S.woodGold || 0) + g; by.wood += g; log(`仓库放不下，卖出多余木材 ${spare} 份，得 ${g} 金`); FARMER.wood -= spare; }
    const earn = () => { emit('income', { gold: sum, items: n, source: 'market', by, who: F === FARMER ? 'farmer' : F.id }); S.coins += sum; S.earned += sum; S.todayEarn += sum; S.soldToday += n; S.totalSold += n; for (const k of Object.keys(by)) if (by[k]) noteLog('income', k, by[k]); if (F !== FARMER) noteLog('work', F.id, 0, sum); };
    if (kid) { if (sum) { earn(); popText(STALL.x + VR(-4, 4), STALL.y - 3, 26, '+' + sum, '#ffd76a'); log(`${F.name}卖出 ${n} 件收获，得 ${sum} 金`); } return; }
    const sp = SIM.surplusSeeds(F.bag, S.store, open.length);
    if (sp.gold) { for (const k of CROP_IDS) F.bag[k] -= sp.sell[k]; sum += sp.gold; by.crops += sp.gold; S.flow.sold += seedCount(sp.sell); S.flow.soldGold += sp.gold; log(`卖掉多余的种子：${seedText(sp.sell)}（${sp.gold} 金）`); }
    if (sum) { earn();
      popText(STALL.x + VR(-4, 4), STALL.y - 3, 26, '+' + sum, '#ffd76a'); burst(STALL_SPOT.x, STALL_SPOT.y - 6, 10, ['#ffd76a', '#fff2a8'], 6, 'coin');
      if (n) log((F === FARMER ? '' : F.name) + `卖出 ${n} 件收获` + (nFish ? `（其中 ${nFish} 条鱼）` : '')); }
    autoBuyAtStall(); // v5.10.1
    if (S.animals.length) { const need = AN.need(S.animals), want = Math.min(AN.HAY.stock, need * 4) - S.hay, can = Math.floor(S.coins * 0.5 / AN.HAY.price), n = Math.max(0, Math.min(want, can));
      if (n > 0 && S.hay < need * 3) { emit('purchase', { item: 'hay', n, gold: n * AN.HAY.price }); S.coins -= n * AN.HAY.price; S.hay += n; S.hayGold = (S.hayGold || 0) + n * AN.HAY.price; noteLog('spend', 'hay', n * AN.HAY.price); log(`买了 ${n} 捆干草（${n * AN.HAY.price} 金），放进仓库`); } }
    const need = open.filter(t => !t.crop).length - seedCount(F.bag) - seedCount(S.store) + S.store.carrot;
    if (need > 0) { const p = SIM.planSeeds(S.coins, S.prices, need, S.store.carrot + F.gathered, S.eff.crops.filter(k => k !== 'wheat')); // v5.6.0: wheat is bought for the mill below
      if (p.cost > 0) { emit('purchase', { item: 'seeds', n: seedCount(p.buy), gold: p.cost }); S.coins -= p.cost; for (const k of CROP_IDS) F.bag[k] += p.buy[k]; S.flow.bought += seedCount(p.buy); S.flow.boughtGold += p.cost; noteLog('spend', 'seeds', p.cost); log(`买了种子：${seedText(p.buy)}（${p.cost} 金）`); } }
    const ws = Math.max(wheatShort(), demandShort('wheat')), wk = Math.min(ws, Math.floor(S.coins * 0.3 / SIM.CROPS.wheat.seed)); // v5.6.0: seed for the mill's wheat; v5.11.0.28: its tiles too
    if (wk > 0) { diary('out', null, wk * SIM.CROPS.wheat.seed); S.coins -= wk * SIM.CROPS.wheat.seed; F.bag.wheat += wk; noteLog('spend', 'seeds', wk * SIM.CROPS.wheat.seed); log(`给磨坊买了 ${wk} 颗小麦种子（${wk * SIM.CROPS.wheat.seed} 金）`); }
    for (const k of ['cabbage', 'carrot']) { const c = SIM.CROPS[k].seed, m = Math.min(demandShort(k), Math.floor(S.coins * 0.1 / c)); // v5.11.0.28: the diner's vegetables
      if (m > 0) { diary('out', null, m * c); S.coins -= m * c; F.bag[k] += m; noteLog('spend', 'seeds', m * c); log(`给菜馆买了 ${m} 颗${SIM.CROPS[k].name}种子（${m * c} 金）`); } }
    noteProgress();
  } };
}

// v5.10.1 「家人帮忙添置」: off by default. At most one thing a game day, bought at the stall by the farmer or 阿禾 (never a child)
// right after a sale, only from SIM.AUTO_BUY, only with 3x its price in hand and enough left for seeds, and only what the shop shows.
function autoBuyAtStall() {
  if (!S.autoBuy || S.autoDay === S.day || !(F === FARMER || F.id === 'partner')) return null;
  const p = SIM.autoPick(S.up, S.coins, FARMER.wood, S.dayEarn, id => shopDepth(id) <= REVEAL_MAX); if (!p.id) return p;
  const o = SIM.offer(S.up, S.coins, p.id, FARMER.wood), r = buy(p.id, 'auto'); if (!r.ok) return r;
  const who = F === FARMER ? '农夫' : F.name, first = !(S.autoN > 0); S.autoDay = S.day; S.autoN = (S.autoN | 0) + 1;
  log(`${who}帮家里添置了${o.item.name}：${o.level.label}（${o.cost} 金）` + (first ? '。不想让家人代买，可以在商店顶上关掉「家人帮忙添置」' : ''));
  popText(STALL.x, STALL.y - 6, 26, '-' + o.cost, '#ffd76a'); saveNow(); return Object.assign({ ok: true, id: p.id, cost: o.cost }, r);
}
function setAutoBuy(v) { S.autoBuy = !!v; noteLog('event', { type: 'autobuy', on: S.autoBuy, day: S.day }); log(S.autoBuy ? '打开了「家人帮忙添置」：钱多的时候，家人每天最多替你买一样基础的东西（扩田、工具、鸡）' : '关掉了「家人帮忙添置」'); saveNow(); return S.autoBuy; }
// v5.4.0: fish food, ornamental fish, a truffle a dog found
function ornamentHeld(kind) {
  if (kind === 'goldfish') return (S.ornament && S.ornament.goldfish) || 0;
  if (kind === 'koi') {
    let n = 0;
    const count = list => { for (const it of list) if (SU.itemType(it) === 'koi') n++; };
    count(FARMER.crops); for (const m of S.members) count(m.crops);
    return n;
  }
  return 0;
}
function takeOrnament(kind) {
  if (kind === 'goldfish') { if (!((S.ornament.goldfish || 0) > 0)) return false; S.ornament.goldfish--; return true; }
  if (kind === 'koi') {
    const bags = [FARMER].concat(S.members);
    for (const a of bags) { const i = a.crops.findIndex(it => SU.itemType(it) === 'koi'); if (i >= 0) { a.crops.splice(i, 1); return true; } }
  }
  return false;
}
function placePondFish(kind) {
  if (S.pondFish.length >= FS.POND_CAP) return null;
  const ang = petRng() * Math.PI * 2, r = 0.25 + petRng() * 0.45;
  const f = { id: 'pf' + (1 + S.pondFish.reduce((m, q) => Math.max(m, parseInt(String(q.id).replace(/\D/g, ''), 10) || 0), 0)),
    kind, day: S.day, x: POND.x + Math.cos(ang) * POND.rx * r, y: POND.y + Math.sin(ang) * POND.ry * r, a: ang, v: 0.35 + petRng() * 0.4 };
  S.pondFish.push(f); if (BOOK) BOOK.record(S.codex, BOOK.keyFish(kind), S.day);
  return f;
}
// v5.10.13: room left in the home pond (fish already swimming plus bought goldfish still waiting in the storehouse)
function pondRoom() { return FS.POND_CAP - S.pondFish.length - ((S.ornament && S.ornament.goldfish) || 0); }
function stockPond(kind) { // put one ornamental fish in the pond right now, with a splash
  const f = placePondFish(kind); if (!f) return null;
  const col = (FS.ORN_BY[kind] || {}).col || '#e8a02a'; burst(POND.x + 4, POND.y, 10, [col, '#8cc6dc', '#ffffff'], 10, 'splash'); hearts(POND.x, POND.y - 2, 6);
  diaryNote('pond:' + kind); return f;
}
// an older save could hold bought goldfish that were never released (and 放养 orders for them): they swim in on load
function pondCatchUp() {
  const held = (S.ornament && S.ornament.goldfish) || 0; if (!held) return 0;
  S.orders = S.orders.filter(o => !(o.type === 'release' && o.kind === 'goldfish'));
  let n = 0; while (S.ornament.goldfish > 0 && S.pondFish.length < FS.POND_CAP) { S.ornament.goldfish--; if (!placePondFish('goldfish')) { S.ornament.goldfish++; break; } n++; }
  if (n) log(`之前买的 ${n} 条金鱼放进了家门口的池塘（${S.pondFish.length}/${FS.POND_CAP}）`);
  if (S.ornament.goldfish > 0) log(`池塘满了，还有 ${S.ornament.goldfish} 条金鱼在仓库里等着`);
  return n;
}
function feedPondTask() {
  return { kind: 'feedpond', label: '正在给池塘撒鱼食', to: FS.POND_SPOT.stand, dur: 6, fx: 'water', done: () => {
    if (S.fishFood <= 0 || S.pondFed === S.day) return;
    S.fishFood--; S.pondFed = S.day;
    burst(POND.x, POND.y, 6, ['#e8c78a', '#8cc6dc', '#fff6dc'], 8, 'drop');
    log(`${F === FARMER ? '农夫' : F.name}给池塘撒了一把鱼食（还剩 ${S.fishFood} 包）`);
  } };
}
function releaseTask(o) {
  const name = (FS.ORN_BY[o.kind] || {}).name || o.kind;
  return { kind: 'release', label: `正在把${name}放进池塘`, to: FS.POND_SPOT.stand, dur: 6, fx: 'water', done: () => {
    if (!S.orders.includes(o) || S.pondFish.length >= FS.POND_CAP) return;
    if (!takeOrnament(o.kind)) { S.orders = S.orders.filter(q => q !== o); return; }
    S.orders = S.orders.filter(q => q !== o);
    const f = placePondFish(o.kind);
    if (f) { const col = (FS.ORN_BY[o.kind] || {}).col || '#e06a2c'; burst(POND.x + 4, POND.y, 8, [col, '#8cc6dc', '#ffffff'], 10, 'splash');
      log(`${F === FARMER ? '农夫' : F.name}把一条${name}放进了家门口的池塘`); noteProgress({ pondCount: S.pondFish.length }); }
  } };
}
function looseTask(it) {
  return { label: it.item ? '正在捡滑道滚出来的蛋' : '正在捡狗发现的松露', to: { x: it.x - 6, y: it.y + 2 }, tile: it, dur: 4, fx: 'leaf', pose: 'pull', done: () => {
    const i = S.loose.indexOf(it); if (i < 0 || F.crops.length >= BASK()) return;
    if (it.item) { S.loose.splice(i, 1); F.crops.push(it.item); popText(it.x, it.y, 12, '+1', '#fff6dc'); log(`${F === FARMER ? '农夫' : F.name}捡起了集蛋滑道滚出来的${SU.itemName(it.item, { egg: '鸡蛋' })}`); return; } // v5.11.0.29 (recorded when it rolled out)
    S.loose.splice(i, 1); const item = SU.rollProduct('truffle', rand); F.crops.push(item);
    const ck = BOOK.itemKey(item); if (ck) { BOOK.record(S.codex, ck, S.day); noteProgress({ sawRare: true }); }
    const ev = SU.productToast(item); if (ev) surpriseNote(ev, it.x, it.y); else popText(it.x, it.y, 12, '+1', '#fff6dc');
    log(`${F === FARMER ? '农夫' : F.name}捡到狗发现的松露`);
  } };
}
function inHomePond(x, y) { const dx = (x - POND.x) / (POND.rx + 6), dy = (y - POND.y) / (POND.ry + 6); return dx * dx + dy * dy <= 1; }

function fishSpot(water) { if (water === 'sea') { const r = WD.region('coast'); return r.fish; } return FS.POND_SPOT; }
const FISH_FAMILY_CAP = 75; // game minutes of fishing a day once the family works too
function fishTask(water) {
  const spot = fishSpot(water), wait = FS.waitTime(S.eff.rod, rand, S.eff.smithRod);
  if (F.fishDay !== S.day) { F.fishDay = S.day; F.fishMin = 0; } F.fishMin += FS.CAST + wait + FS.BITE + FS.REEL + FS.SHOW;
  return { kind: 'fish', label: water === 'sea' ? '正在码头海钓' : '正在池塘边钓鱼', to: spot.stand, tile: spot.hook, hook: spot.hook, water, phase: 'cast',
    dur: FS.CAST + wait + FS.BITE + FS.REEL + FS.SHOW, wait, rest: true, tick: fishTick, done: fishDone };
}
function fishTick(k) {
  const c = FS.CAST, wt = c + k.wait, b = wt + FS.BITE, r0 = b + FS.REEL, w = k.work, prev = k.phase;
  k.phase = w < c ? 'cast' : w < wt ? 'wait' : w < b ? 'bite' : w < r0 ? 'reel' : 'show';
  k.rest = k.phase === 'cast' || k.phase === 'wait'; k.pose = (k.phase === 'bite' || k.phase === 'reel') ? 'pull' : null;
  const labels = { cast: k.water === 'sea' ? '正在码头抛竿' : '正在池塘边抛竿', wait: '静静等鱼上钩', bite: '有鱼咬钩了！', reel: '正在收线', show: '把鱼收进篮子' };
  k.label = labels[k.phase]; if (F === FARMER) S.label = k.label;
  if (prev !== 'bite' && k.phase === 'bite') {
    if (!k.result) k.result = FS.roll(k.water, S.eff.rod, rand, k.water === 'pond' && S.pondFed === S.day, S.eff.smithRod);
    burst(k.hook.x, k.hook.y, 2, ['#8cc6dc', '#c8e8f0', '#ffffff'], 10, 'splash');
  }
  if (prev !== 'reel' && k.phase === 'reel' && k.result && !k.result.miss && FS.isRare(k.result.fish) && window.PF_FX)
    PF_FX.play('glow', k.hook.x, k.hook.y, 6);
}
function fishDone() {
  const k = F.task, r = k.result || FS.roll(k.water, S.eff.rod, rand, k.water === 'pond' && S.pondFed === S.day, S.eff.smithRod);
  if (r.miss) { log('浮标动了一下，没钓上来'); popText(k.hook.x, k.hook.y, 8, '空钩', '#c8e8f0'); burst(k.hook.x, k.hook.y, 2, ['#8cc6dc', '#ffffff'], 4, 'splash'); return; }
  if (F.crops.length >= BASK()) { log('篮子满了，这条鱼只好放回去'); return; }
  F.crops.push(r.fish); diary('f', r.fish); if (FS.isRare(r.fish)) diaryNote('rare:' + r.fish);
  S.catches.unshift({ id: r.fish, name: r.name, gold: r.gold, water: k.water, day: S.day }); S.catches.length = Math.min(12, S.catches.length);
  BOOK.record(S.codex, BOOK.keyFish(r.fish), S.day);
  noteProgress({ caughtKoi: r.fish === 'koi', caughtSword: r.fish === 'sword' });
  decorDrop(k.water === 'sea' ? 'sea' : 'pond', F.x, F.y); // v5.7.0: a shell or a bottle now and then
  log(`钓到一条${r.name}（${r.gold} 金）`); popText(F.x, F.y, 16, r.name, r.col); burst(F.x, F.y, 8, r.rare ? [r.col, '#fff2a8', '#ffffff', '#ffd76a'] : [r.col, '#ffffff'], r.rare ? 10 : 6, 'spark');
}

// ---------- simulation ----------
function overnight() {
  noteLog('closeDay', logSnap());
  noteProgress(); // catch a 2,000-gold day before todayEarn is cleared
  machShip(); // v5.11.0.29: the produce cart takes the bin's extra eggs, milk and honey
  if (DY && S.diary && S.todayEarn > 0) DY.entry(S.diary, S.day).in = S.todayEarn; // v5.10.13: the day's takings go in the diary
  S.day++; try { albumBackfill(); } catch (e) {} S.dayEarn.push(S.todayEarn); if (S.dayEarn.length > 7) S.dayEarn.shift(); S.todayEarn = 0; S.soldToday = 0;
  let grew = 0; const justRipe = [];
  for (const t of tiles) { // a crop grows one day overnight, only if it was watered that day
    if (t.crop && t.watered && SU.canGrow(t.crop, SIM.ripe)) { t.crop.age++; grew++; const st = SIM.stageOf(t.crop); if (st === 3 && t.crop.stage !== 3) { justRipe.push(t); burst(t.x, t.y, 6, ['#fff2a8', '#ffffff'], 6, 'spark'); } t.crop.stage = st; }
    t.watered = false;
  }
  for (const t of SU.rollGlow(justRipe, SIM.ripe, rand)) { const ev = SU.glowToast(t, cropNames()); surpriseNote(ev, t.x, t.y); t.crop.stage = 3; BOOK.record(S.codex, BOOK.keyGlow(t.crop.type), S.day); }
  for (const t of SU.rollGiant(tiles, SIM.ripe, rand)) { const ev = SU.giantToast(t, cropNames()); surpriseNote(ev, t.x + TILE / 2, t.y + TILE / 2); t.crop.stage = 3; groundDirty = true; BOOK.record(S.codex, BOOK.keyGiant(t.crop.type), S.day); noteProgress({ sawGiant: true, sawGiantPumpkin: t.crop.type === 'pumpkin' }); albumSnap('giant', t.x + TILE / 2, t.y + TILE / 2, { wait: 0 }); }
  let n = 0; const cm = YD.clutterMult(S.homeyard.put); tiles.forEach(t => { const k = t.f === 'home' ? cm : 1; if (t.open && !t.crop && spawnClutter(t, 0.1 * k, 0.14 * k)) n++; }); // v5.10.3: the little fence keeps the home field tidier
  const before = yard.length, add = 2 + Math.floor(yardRng(S.day * 668265263)() * 3); // 2..4, without consuming rand()
  if (yard.length < YARD_CAP) fillYard(yardRng(S.day * 2147483647), Math.min(YARD_CAP, yard.length + add));
  const yn = yard.length - before;
  let dug = 0; // v5.0: a stump outside the forest is dug out overnight; the forest's stumps sprout again (world.js treeOvernight)
  for (let i = S.trees.length - 1; i >= 0; i--) { const t = S.trees[i]; if (t.kind === 'wild' && t.stage === 'stump' && !WD.regrows(t)) { S.trees.splice(i, 1); TV.delete(t.id); dug++; } }
  if (dug) log(`夜里挖走了 ${dug} 个树桩，空地可以移植果树苗`);
  woodNight(); // v5.3.1: the lumber hut replants 林场 stumps before they age
  for (const t of S.trees) { const before = t.stage + t.ripe; WD.treeOvernight(t); if (t.stage + t.ripe !== before) treeChanged(t); }
  S.prices = Object.assign(SIM.driftPrices(S.prices, rand), driftProducts(S.prices));
  machFeed(); // v5.11.0.29: fitted troughs are full before the animals eat
  if (S.animals.length) { const r = AN.overnightPens(S.animals, S.troughs, S.eff.fence ? AN.CARE.fence : 0, YD.penBonus(S.homeyard.put, yardPens()), CL && S.town ? CL.floor(S.town.hall) : 0); S.troughs = r.troughs; const m = r.report.made, t = AN.PRODUCT_IDS.filter(k => m[k]).map(k => `${AN.PRODUCTS[k].name} ${m[k]}`).join('、');
    log((r.report.hungry ? `有 ${r.report.hungry} 只动物没吃饱，` : '') + (t ? `夜里产了：${t}` : '动物们夜里没有新产出')); }
  if (CL && S.town && CL.isCheck(S.town.hall, S.day)) { const n = CL.checkup(S.town.hall, S.animals, S.day), pets = PETS_LIVE.length; // v5.10.10 monthly checkup
    if (n || pets) log(`诊所的苏大夫来家里做了每月体检${n ? '，' + n + ' 只动物心情好了一些' : ''}${pets ? '，还看看了家里的猫和狗' : ''}`); }
  worksNight(); // v5.6.0: honey, the lamps' orchard, the herded sheep
  decorNight(); // v5.7.0: a full book page leaves a piece
  yardCatchUp('天亮前家人赶完了活：'); sprCatchUp(); decorCatchUp('天亮前家人把'); // v5.10.11.1: nothing paid for waits past one night
  yardNight(); // v5.10.3: the flower beds' extra honey, the morning letter
  for (const p of PETS_LIVE) p.patted = 0;
  const cats = (S.eff.pets || {}).cat || 0; if (cats) { const g = SU.catGifts(cats * AN.CAT_SEEDS, rand); for (const k of CROP_IDS) if (g.add[k]) S.store[k] = (S.store[k] || 0) + g.add[k];
    const bits = []; if (g.add.carrot) bits.push(`${g.add.carrot} 颗胡萝卜种子`);
    for (const k of g.rare) { const ev = SU.catToast(k, cropNames()); surpriseNote(ev, HOUSE.x, HOUSE.y + 6); bits.push(`一颗${SIM.CROPS[k].name}种子`); }
    log(`猫咪在门口放了${bits.join('、')}`); }
  familyMorning();
  partyMorning(); // v5.7.0: a party tonight?
  if (HM) { homeNight(); homeMorning(); } // v5.9.0: the little farms grow; a wedding tonight?
  if (S.doorGift && S.doorGift.day < S.day) S.doorGift = null;
  S.loose = []; // a truffle a dog found and nobody picked up does not linger
  machCollect(); machHay(); machFeed(); // v5.11.0.29: the night's eggs, milk and honey into the storehouse; troughs full again for the day
  S.streaks = BOOK.tickStreaks(S.streaks, S.day, S.animals);
  planDogDay();
  noteProgress();
  markNavDirty();
  groundDirty = true; log(`新的一天！${grew} 棵作物长大了，夜里长出 ${n} 处田里杂物` + (yn ? `，院子里又出现 ${yn} 处杂物` : ''));
  if (applyRainMorning()) { /* 今天下雨的田已经浇过，日志在 applyRainMorning 里 */ }
  diaryMorning();
  onMorning();
}
function diaryMorning() { // v5.10.13: today's weather and town days in the diary; yesterday in one line
  if (!DY || !S.diary) return;
  if (WX && WX.isRainDay && WX.isRainDay(S.weather, S.day)) diaryNote('rain');
  if (FV && S.town && S.town.hall && FV.isDay(S.town.hall, S.day)) diaryNote('fest');
  if (SC && S.town && S.town.hall && SC.isDay(S.town.hall, S.day)) diaryNote('sports');
  const y = S.diary.days.find(e => e.d === S.day - 1), b = y ? DY.brief(y, diaryLook()) : '';
  if (b) { log(b); if (window.__farm && window.__farm.onDiaryMorning) window.__farm.onDiaryMorning(b); }
}
// names for the diary text: who did it, what it was, what was bought
function diaryLook() {
  const kids = (S.family && S.family.kids) || [];
  const who = id => id === 'farmer' ? '农夫' : id === 'partner' ? '阿禾' : ((kids.find(k => k.id === id) || {}).name || (actors().find(a => a.id === id) || {}).name || '家人');
  const item = id => (SIM.CROPS[id] && SIM.CROPS[id].name) || (WD.FRUIT[id] && WD.FRUIT[id].name) || (FS.fishOf(id) && FS.fishOf(id).name) || (FS.ORN_BY[id] && FS.ORN_BY[id].name) ||
    (AN.PRODUCTS[id] && AN.PRODUCTS[id].name) || ({ honey: '蜂蜜', flower: '野花' })[id] || id;
  const buy = id => { if (id === 'goldfish') return '金鱼'; if (id === 'fishfood') return '鱼食'; if (id === 'bugnet') return '捕虫网';
    if (/^plot:/.test(id)) return '一块新地'; if (/^inn:/.test(id)) return ({ cabin: '民宿小木屋', diner: '农家菜馆', kitchen: '菜馆厨房', inn2: '二层客栈', hut: '沙滩小屋', parasol: '遮阳伞', stall: '海鲜摊', pier: '游客栈桥', deck: '日落观景台' })[id.slice(4)] || '民宿的新设施';
    if (/^hall:/.test(id)) { const p = HL && HL.PROJ && HL.PROJ[id.slice(5)]; return p ? p.name : ''; }
    const it = (SIM.SHOP || []).find(x => x.id === id); return it ? it.name : ''; };
  return { who, item, buy };
}
function diaryView(day) { // -> { day, title, lines, today, days: [day numbers] } for the panel
  if (!DY || !S.diary) return null;
  const days = S.diary.days.map(e => e.d); if (!days.includes(S.day)) days.push(S.day);
  const d = day && days.includes(day) ? day : S.day, today = d === S.day, L = diaryLook();
  const e = Object.assign(DY.blank(d), S.diary.days.find(x => x.d === d) || {}); if (today) e.in = S.todayEarn | 0;
  const photos = ALB && S.album ? e.ev.filter(c => c.indexOf('photo:') === 0).map(c => c.slice(6)).filter(id => ALB.has(S.album, id)).map(id => ({ id, title: ALB.BY[id].t })) : []; // v5.11.0.11
  return { day: d, title: DY.title(e, L, today), lines: DY.lines(e, L, today), today, days, photos };
}
function driftProducts(prices) { // own stream, so the crops' prices and the farm's random events stay where they were
  const r = mulberry32((S.day * 2246822519) ^ 0x51ED), out = {};
  for (const k of AN.PRODUCT_IDS) { const m = prices[k] || 1; out[k] = Math.round(Math.min(1.2, Math.max(0.8, m + 0.3 * (1 - m) + (r() * 2 - 1) * 0.05)) * 1000) / 1000; }
  return out;
}
function stepSim(dm) {
  stepAnimals(dm);
  const prevDay = Math.floor((S.t - WAKE) / 1440);
  S.t += dm;
  if (Math.floor((S.t - WAKE) / 1440) !== prevDay) { // reached 6:00: everyone gets up
    for (const a of actors()) if (a.sleeping) { a.sleeping = false; a.home = true; }
    overnight(); log(S.members.length ? '一家人起床啦，开始干活' : '起床啦，开始干活');
  }
  for (const a of S.members) { F = a; stepActor(dm); } // v5.0: the family first, so the farmer's own step leaves F on him
  F = FARMER; stepActor(dm);
  worksTick(dm); // v5.6.0
  decorTick(dm); // v5.7.0
  townTick(dm); // v5.8.0
  if (HM) homeTick(dm); // v5.9.0
}
function followInsect(k) { // play-chase: keep walking toward the live butterfly (window.__insects.nearest)
  if (!window.PFKids) return;
  const bug = PFKids.nearbyInsect(F.x, F.y, 'butterfly') || PFKids.nearbyInsect(F.x, F.y);
  if (!bug || bug.x == null) return;
  const moved = Math.hypot((k.to && k.to.x || 0) - bug.x, (k.to && k.to.y || 0) - bug.y);
  k.to = { x: bug.x, y: bug.y }; k.insect = bug;
  if (moved > 5) k.via = routeVia(F, k.to);
}
function idleHold() { return { kind: 'idle', label: '歇一会儿', to: { x: F.x, y: F.y }, dur: 8, rest: true }; }
function nextTask() { // v5.11.0.23: chooseTask may return null (a spouse with no party seat); never hand that to stepActor
  try { const t = chooseTask(); if (t) return t; } catch (e) { try { console.warn('[pixel-farm] chooseTask', F && (F.id || 'farmer'), e); } catch (x) {} }
  return idleHold(); }
function stepActor(dm) { // one person's step: pick a job from the board (claims respected), walk there, work, finish
  try { stepActorInner(dm); }
  catch (e) {
    try { console.warn('[pixel-farm] stepActor', F && (F.id || 'farmer'), e); } catch (x) {}
    if (F) { F.task = idleHold(); F.task.work = 0; }
  }
}
function stepActorInner(dm) {
  const me = F === FARMER;
  if (F.sleeping) { if (me) { S.label = '睡觉中 Zzz'; noteLog('tick', dm, 'sleep'); } return; }
  if (!F.task) { F.task = nextTask(); F.task.work = 0; if (!(F.task.keepVia && F.task.via && F.task.via.length)) F.task.via = routeVia(F, F.task.to); F._nav = navVer; if (me) S.label = F.task.label; if (F.task.label !== '回家睡觉' || !F.home) F.home = false; }
  else if (F._nav !== navVer && !F.task.keepVia) { F.task.via = routeVia(F, F.task.to); F._nav = navVer; }
  const k = F.task;
  if (k && k.kind === 'play-chase') followInsect(k);
  while (k.via && k.via.length && Math.hypot(k.via[0].x - F.x, k.via[0].y - F.y) <= 0.5) k.via.shift();
  const tgt = (k.via && k.via.length) ? k.via[0] : k.to;
  const dx = tgt.x - F.x, dy = tgt.y - F.y, dist = Math.hypot(dx, dy);
  if (dist > 0.5) { const st = Math.min(dist, WALK * S.eff.walk * (F.spd || 1) * yardWalk(F.x, F.y) * dm); F.x += dx / dist * st; F.y += dy / dist * st; F.fx = dx / dist; F.fy = dy / dist; F.walkPhase += st; F.act = 0; F.home = false; F.moving = true; }
  else {
    if (k.tile) { const ex = k.tile.x - F.x, ey = k.tile.y - F.y, el = Math.hypot(ex, ey) || 1; F.fx = ex / el; F.fy = ey / el; }
    if (!k.work && k.kind === 'fish') emit('task-start', { kind: 'fish' }); // v5.2: audio.js casts the line
    k.work += dm; F.act += dm; F.moving = false;
    if (k.tick) k.tick(k, dm);
    if (k.fx && Math.random() < dm * 0.5) fxTick(k);
    if (k.work >= k.dur) { k.done && k.done(); F.task = null; if (k.kind !== 'idle') emit('task', { kind: k.kind, an: k.an ? k.an.kind : k.sfx }); }
  }
  if (me) noteLog('tick', dm, F.task && F.task.kind, F.task && F.task.label); else if (F.task && F.task.kind !== 'idle' && F.task.kind !== 'home') noteLog('work', F.id, dm);
}
// ---- v5.0 family: 阿禾 moves in, children arrive and grow up (family.js); members are the ones out working ----
const ROLE = { partner: { spd: 1, bmul: 1 }, teen: { spd: 1.1, bmul: 0.75 }, child: { spd: 0.8, bmul: 0.5 }, play: { spd: 0.85, bmul: 0.5 }, school: { spd: 0.85, bmul: 0.5 } };
function makeMember(w) {
  return { id: w.id, name: w.name, role: w.role, spd: ROLE[w.role].spd, bmul: ROLE[w.role].bmul, x: DOOR.x + 3, y: DOOR.y, fx: 0, fy: 1, home: true, sleeping: false, task: null,
    bag: SIM.emptySeeds(), gathered: 0, crops: [], water: 0, walkPhase: 0, idleCount: 0, act: 0 };
}
function syncFamily() { // the family list from family.js -> working members (new ones step out of the front door)
  const want = FAM.workers(S.family, S.day);
  for (const w of want) { const m = S.members.find(q => q.id === w.id); if (!m) S.members.push(makeMember(w)); else if (m.role !== w.role) Object.assign(m, { role: w.role, spd: ROLE[w.role].spd, bmul: ROLE[w.role].bmul }); }
  for (let i = S.members.length - 1; i >= 0; i--) if (!want.some(w => w.id === S.members[i].id)) S.members.splice(i, 1);
}
const popCap = () => WD.HOUSE_TIERS[S.eff.house || 0].pop;
function familyMorning() {
  const before = S.members.map(m => m.id + m.role).join();
  for (const e of FAM.morning(S.family, S.day, popCap())) {
    emit('family', { event: e });
    if (e === 'moved') { log(`阿禾搬进了${WD.HOUSE_TIERS[S.eff.house].name}，从今天起一起经营农场`); log('集市的摊子交给阿禾的爸爸照看'); }
    if (e === 'waiting' && S.day % 3 === 0) log('阿禾在等房子扩建成大木屋，好搬过来一起住');
    if (e === 'born') { const k = S.family.kids[S.family.kids.length - 1]; log(`家里添了一个宝宝：${k.name}！`); hearts(DOOR.x, DOOR.y, 30); albumSnap('born' + (S.family.kids.length - 1), null, null, { wait: 90, follow: 'partner' }); }
  }
  let kidStarted = false;
  for (const k of S.family.kids) { const st = FAM.kidStage(k, S.day), was = FAM.kidStage(k, S.day - 1);
    if (st !== was) { const msg = window.PFKids ? PFKids.stageChangeLog(k.name, st) : (st === 'child' || st === 'helper' ? `${k.name}会走路了，能帮忙喂鸡、摸摸动物、摘果子` : `${k.name}长成了少年，田里的活都能干了`);
      if (msg) log(msg); if (k.id === 'kid0' && (st === 'child' || st === 'helper')) kidStarted = true; } }
  if (kidStarted) noteProgress({ kidStarted: true });
  syncFamily(); demandStoreSeeds(); if (S.members.map(m => m.id + m.role).join() !== before && window.__farm && window.__farm.onFamily) window.__farm.onFamily();
}
function fxTick(k) {
  const t = k.tile || { x: F.x, y: F.y - 4 };
  if (k.fx === 'water') burst(t.x, t.y, 7, ['#8cc6dc', '#5b9cc4'], 2, 'drop');
  else if (k.fx === 'dirt') burst(t.x, t.y, 1, ['#8b5a35', '#a06c43'], 2, 'dirt');
  else if (k.fx === 'leaf') burst(t.x, t.y, 2, ['#5a9a3a', '#8fd35a'], 2, 'leaf');
  else if (k.fx === 'rock') burst(t.x, t.y, 2, ['#b9b8ad', '#9a9a92'], 2, 'rock');
  else if (k.fx === 'wood') burst(t.x, t.y, 2, ['#a0703f'], 2, 'wood');
  else if (k.fx === 'seed') burst(t.x, t.y, 4, ['#e8d9a0'], 1, 'seed');
  else if (k.fx === 'hay') burst(t.x, t.y, 3, [Ac[1], Wd[4], Ac[2]], 3, 'leaf');
  else if (k.fx === 'wool') burst(t.x, t.y, 6, [Ac[0], St[3]], 3, 'leaf');
  else if (k.fx === 'milk') burst(t.x, t.y, 4, [Ac[0], St[3]], 2, 'drop');
  else if (k.fx === 'coin') burst(F.x, F.y, 10, ['#ffd76a', '#fff2a8'], 2, 'spark');
}
function burst(x, y, z, cols, n, kind) { // short pixel VFX; ?nofx turns this off. Text pops and chimney smoke stay in `particles`.
  if (window.PF_FX) PF_FX.play(kind || 'bits', x, y, z, { cols, n });
}
function popText(x, y, z, s, c) { particles.push({ x, y, z, vx: 0, vy: 0, vz: 10, c, life: 1.6, text: s }); }
let lastCatch = null;
function noteBugCatch(ev) { // brief, small sprite above the catching kid — never a 24px icon sitting in the yard
  if (!ev) return;
  lastCatch = { line: null, url: (INS && INS.bugURL) ? INS.bugURL(ev.kind, true) : '', at: Date.now() };
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].catchBug) particles.splice(i, 1);
  const x = ev.kidX != null ? ev.kidX : ev.x, y = ev.kidY != null ? ev.kidY : ev.y;
  if (INS && INS.catchSprite) {
    const spr = INS.catchSprite(ev.kind, 0.5); // 12px, clearly smaller than a person
    if (spr) particles.push({ x, y, z: 16, vx: 0, vy: 0, vz: 1.2, life: 1.2, spr, kind: 'icon', catchBug: true, fade: true });
  }
  particles.push({ x, y, z: 26, vx: 0, vy: 0, vz: 8, c: '#fff6dc', life: 1.2, text: ev.name, catchBug: true, fade: true });
  burst(x, y, 16, ['#fff6dc', '#8fd35a', '#ffd76a'], 6, 'spark');
  log(`孩子用捕虫网捉到一只${ev.name}，看了一眼就放走了`);
  lastCatch.line = S.log[0];
}


// ---------- rendering helpers ----------
const DEFAULT_A = Q.has('angle') ? +Q.get('angle') : 0.22;
const HOME_CAM = { x: WW / 2, y: WH / 2 + 2 };
const cam = { x: HOME_CAM.x, y: HOME_CAM.y, a: DEFAULT_A, ta: DEFAULT_A };
let CA = Math.cos(cam.a), SA = Math.sin(cam.a);
// The camera never drifts: it is fixed on the farm centre, and its screen offset is snapped to whole pixels once per frame.
// Every object then keeps the same sub-pixel phase between frames, so nothing re-rounds and shimmers.
let CX = 0, CY = 0;
const ASTEP = Math.PI * 2 / 256; let AQ = 0; // the picture turns in 1.4 degree steps, so per-angle caches get reused
function setCam() { AQ = Math.round(cam.a / ASTEP) * ASTEP; CA = Math.cos(AQ); SA = Math.sin(AQ); CX = Math.round(W / 2 - (cam.x * CA - cam.y * SA) * RS); CY = Math.round(H / 2 + 44 - (cam.x * SA + cam.y * CA) * K * RS); }
function proj(x, y) { const rx = x * CA - y * SA, ry = x * SA + y * CA; return [CX + rx * RS, CY + ry * K * RS, ry]; }
// Rotated stacks are rendered at 3x and reduced with a majority (mode) filter: each screen pixel takes the colour that covers
// most of it, so stripes keep their shape at every angle. Each result gets its own selective outline and is cached per angle.
const SS = 3, ssC = mk(8, 8), ssG = ssC.getContext('2d', { willReadFrequently: true });
const STK = new Map(), STK_BUDGET = 16e6, STK_MAX = 10000; let stkPx = 0; // ~64 MB (CPU) of cached stacks at most, least recently used goes first
function stackCanvas(m, a) {
  const map = m._ck || (m._ck = new Map()); let k = map.get(a);
  if (k) { STK.delete(k); STK.set(k, m); return k; }
  k = { a }; map.set(a, k); k.done = () => { k.px = k.c.width * k.c.height; stkPx += k.px; STK.set(k, m);
    while ((stkPx > STK_BUDGET || STK.size > STK_MAX) && STK.size > 1) { const [ok, om] = STK.entries().next().value; STK.delete(ok); om._ck.delete(ok.a); stkPx -= ok.px; ok.c.width = ok.c.height = 0; } };
  return buildStack(m, a, k);
}
function buildStack(m, a, k) {
  const sl = slicesAt(m, a), ca = Math.cos(a), sa = Math.sin(a), r = Math.ceil(Math.hypot(m.w, m.d) / 2) + 2;
  const w = 2 * r, h = Math.ceil(2 * r * K) + m.h + 4; k.ox = r; k.oy = Math.ceil(r * K) + m.h + 1;
  if (m.w * m.d * m.h < 3000 || m.nearest) { // small props and tree trunks: plain nearest is stable enough (and fast)
    k.c = mk(w, h); const g = k.c.getContext('2d'); g.imageSmoothingEnabled = false;
    for (let i = 0; i < m.h; i++) { if (!sl.has[i]) continue; g.setTransform(ca, sa * K, -sa, ca * K, k.ox, k.oy - i); drawSlice(g, sl, i, -m.w / 2, -m.d / 2); }
    if (!m.noOutline) outlineCanvas(k.c); k.done(); return k;
  }
  const BW = w * SS, BH = h * SS; k.c = mk(w, h);
  if (ssC.width < BW || ssC.height < BH) { ssC.width = Math.max(ssC.width, BW); ssC.height = Math.max(ssC.height, BH); }
  const g = ssG; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, BW, BH); g.imageSmoothingEnabled = false;
  for (let i = 0; i < m.h; i++) { if (!sl.has[i]) continue;
    for (let t = SS - 1; t >= 0; t--) { g.setTransform(ca * SS, sa * K * SS, -sa * SS, ca * K * SS, k.ox * SS, (k.oy - i) * SS + t); drawSlice(g, sl, i, -m.w / 2, -m.d / 2); } }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const src = new Uint32Array(g.getImageData(0, 0, BW, BH).data.buffer), out = new ImageData(w, h), dst = new Uint32Array(out.data.buffer);
  const v = new Uint32Array(SS * SS);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0; for (let yy = 0; yy < SS; yy++) { const row = (y * SS + yy) * BW + x * SS; for (let xx = 0; xx < SS; xx++) { const p = src[row + xx]; v[n++] = (p >>> 24) >= 128 ? p | 0xff000000 : 0; } }
    const mid = v[(SS * SS) >> 1]; let same = true; for (let q = 0; q < n; q++) if (v[q] !== mid) { same = false; break; }
    if (same) { dst[y * w + x] = mid >>> 0; continue; }
    let best = mid, bc = 0; for (let q = 0; q < n; q++) if (v[q] === mid) bc++;
    for (let q = 0; q < n; q++) { const c = v[q]; if (c === best) continue; let cnt = 0; for (let s = 0; s < n; s++) if (v[s] === c) cnt++; if (cnt > bc) { bc = cnt; best = c; } }
    dst[y * w + x] = best >>> 0;
  }
  k.c.getContext('2d').putImageData(out, 0, 0); if (!m.noOutline) outlineCanvas(k.c); k.done(); return k;
}
function drawStack(c, m, x, y, z, rot) { // z in screen px
  const [sx, sy] = proj(x, y), k = stackCanvas(m, AQ + rot);
  c.drawImage(k.c, Math.round(sx) - k.ox, Math.round(sy) - Math.round(z) - k.oy);
}
function drawFoot(c, m, x, y, rot, ox, oy) {
  const [sx, sy] = proj(x + ox, y + oy); const a = AQ + rot, ca = Math.cos(a), sa = Math.sin(a);
  c.setTransform(ca, sa * K, -sa, ca * K, Math.round(sx), Math.round(sy)); c.drawImage(m.foot, -m.w / 2, -m.d / 2); c.setTransform(1, 0, 0, 1, 0, 0);
}
function vnoise(x, y, s) { const h = (i, j) => { let n = i * 374761393 + j * 668265263 + s * 1442695; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);
const pathSegs = [[DOOR.x, DOOR.y, DOOR.x, 54], [DOOR.x, 54, 68, 54], [68, 54, 124, 54], [124, 54, 124, 92], [68, 54, 68, 92], [68, 92, 124, 92], [124, 54, 158, 54], [158, 54, BARN_DOOR.x, BARN_DOOR.y], [100, 54, WELL_SPOT.x, WELL_SPOT.y], [124, 92, 140, 92], [140, 92, 140, STALL_SPOT.y], [140, STALL_SPOT.y, STALL_SPOT.x + 6, STALL_SPOT.y], [68, 92, 68, BENCH_SPOT.y], [68, BENCH_SPOT.y, BENCH_SPOT.x, BENCH_SPOT.y], [DOOR.x, 54, DOOR.x, 66]];
function segDist(px, py, [x1, y1, x2, y2]) { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / l; t = clamp(t, 0, 1); return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); }
// v4.3: dirt roads from the farm to each region's gate, and a short lane inside each region
for (const k in WD.ROUTES) { const r = WD.ROUTES[k]; for (let i = 0; i < r.length - 1; i++) pathSegs.push([r[i].x, r[i].y, r[i + 1].x, r[i + 1].y]); }
const LANES = { forest: [[100, -38, 100, -60], [100, -12, 80, -12]], east: [[216, 66, 238, 66]], orchard: [[-40, 8, -70, -14], [-70, -14, -100, -6]], south: [[68, 150, 68, 176], [68, 176, 78, 176]], pasture: [[216, -40, 263, -40], [263, -40, 263, -26], [263, -40, 300, -40], [300, -40, 300, -60]], coast: [[220, 212, 272, 236], [272, 236, 280, 256], [280, 256, 280, 268]] };
for (const k in LANES) for (const l of LANES[k]) pathSegs.push(l.concat(k)); // tagged: only painted once the region is open
const routeSegs = []; for (const k in WD.ROUTES) { const r = WD.ROUTES[k]; for (let i = 0; i < r.length - 1; i++) routeSegs.push([r[i].x, r[i].y, r[i + 1].x, r[i + 1].y]); }
const nearRoute = (x, y, d) => routeSegs.some(s => segDist(x, y, s) < d) || Object.values(LANES).some(ls => ls.some(l => segDist(x, y, l) < d));
// v5.5.0: the bigger map has ~2M ground pixels, so pathD only looks at the segments listed for its 16-unit cell (same result)
const PB = 16, PBX = Math.floor((WORLD.x0 - GM) / PB) - 1, PBY = Math.floor((WORLD.y0 - GM) / PB) - 1, PBW = Math.ceil((WORLD.x1 - WORLD.x0 + 2 * GM) / PB) + 3, PBH = Math.ceil((WORLD.y1 - WORLD.y0 + 2 * GM) / PB) + 3;
const PBK = Array.from({ length: PBW * PBH }, (_, k) => { const cx = (PBX + k % PBW) * PB, cy = (PBY + Math.floor(k / PBW)) * PB;
  return pathSegs.filter(s => Math.min(s[0], s[2]) - 12 <= cx + PB && Math.max(s[0], s[2]) + 12 >= cx && Math.min(s[1], s[3]) - 12 <= cy + PB && Math.max(s[1], s[3]) + 12 >= cy); });
const pathCell = (x, y) => { const i = Math.floor(x / PB) - PBX, j = Math.floor(y / PB) - PBY; return i < 0 || j < 0 || i >= PBW || j >= PBH ? pathSegs : PBK[j * PBW + i]; };
const pathD = (x, y) => { let pd = 99; for (const s of pathCell(x, y)) { if (s[4] && !regionOpen(s[4])) continue; if (Math.abs(x - (s[0] + s[2]) / 2) > Math.abs(s[2] - s[0]) / 2 + 12 || Math.abs(y - (s[1] + s[3]) / 2) > Math.abs(s[3] - s[1]) / 2 + 12) continue; pd = Math.min(pd, segDist(x, y, s)); } return pd; };
const rectOut = (x, y, [x0, y0, x1, y1]) => Math.max(x0 - x, x - x1, y0 - y, y - y1, 0);
let OPEN_REGIONS = []; const regionOpen = id => OPEN_REGIONS.includes(id); // copied from the shop state (S.eff.regions) before the ground is rebuilt
const fieldYard = r => r.field && [r.field.c0 * TILE - 6, r.field.r0 * TILE - 6, (r.field.c0 + r.field.cols) * TILE + 6, (r.field.r0 + r.field.rows) * TILE + 6];
const YARD = { x0: 68, x1: 124, y0: 52, y1: 92 }; // packed-dirt yard around the field (like the mock)
const inYard = (x, y, pad = 0) => x > YARD.x0 - pad && x < YARD.x1 + pad && y > YARD.y0 - pad && y < YARD.y1 + pad;
// ground: flat palette areas only (grass, dirt, water). All texture lives in decals that never rotate, so nothing crawls.
let COAST_OLD = false; // the decal scatter below draws its random stream against the old coast, so nothing else on the map moves
function groundAt(x, y) { // -> [palette colour, kind]
  const e = ((x - POND.x) / POND.rx) ** 2 + ((y - POND.y) / POND.ry) ** 2 + (vnoise(x / 4, y / 4, 11) - 0.5) * 0.34;
  if (e < 1) return [Wt[2], 'water'];           // one flat tone: the layered water is painted over it in screen space (waterPass)
  if (e < 1.3) return [G[3], 'shore'];
  const sea = COAST_OLD ? WD.seaAt(x, y) : WD.seaLook(x, y); // v5.11.0.20: the picture's irregular coast (rules keep seaAt)
  if (sea === 'water') return [Wt[2], 'water'];
  if (sea === 'sand' && !COAST_OLD) { const o = XP.mouthWater(x, y); if (o) return o; } // v5.11.0.20: the river runs on across the beach into the sea
  if (sea === 'sand') { const v = vnoise(x / 5, y / 5, 17); return [v > 0.66 ? Wd[5] : v > 0.33 ? Wd[4] : Wd[3], 'sand']; }
  const wob = (vnoise(x / 3, y / 3, 7) - 0.5) * 1.6;
  const pd = pathD(x, y), pw = 4.2 + wob;
  const yd = Math.max(YARD.x0 - x, x - YARD.x1, YARD.y0 - y, y - YARD.y1) + wob * 0.6;
  if (pd < 6 && (S.homeyard.put.gravel || S.homeyard.put.flag)) { const pv = YD.paveAt(S.homeyard.put, x, y, 3.3 + wob * 0.25); // v5.10.3: the paved pieces
    if (pv === 'flag') { const u = Math.floor((x + (Math.floor(y / 2.5) % 2) * 1.5) / 3), gx = (x + (Math.floor(y / 2.5) % 2) * 1.5) % 3, gy = y % 2.5; return [gx < 0.5 || gy < 0.5 ? St[1] : (u + Math.floor(y / 2.5)) % 3 ? St[2] : St[3], 'dirt']; }
    if (pv === 'gravel') { const v = vnoise(x * 1.7, y * 1.7, 23); return [v > 0.7 ? St[3] : v > 0.4 ? St[2] : v > 0.2 ? Wd[3] : St[1], 'dirt']; } }
  if (x >= 356 && TN && TN.onAvenue(x, y) && roadBuilt() && (x < TN.GATE.x + 2 || (S.eff && S.eff.town))) { // v5.11.0: the stone avenue
    const dy = y - TN.AVENUE.y + TN.AVENUE.hw, edge = dy < 0.9 || dy > 2 * TN.AVENUE.hw - 0.9; if (edge) return [St[1], 'dirt']; // kerb stones
    const row = Math.floor(dy / 2.5), u = x + (row & 1) * 2.5, gx = Math.floor(u / 5), jx = u - gx * 5, jy = dy - row * 2.5; // running bond, 5 x 2.5 setts
    if (jx < 0.5 || jy < 0.5) return [St[2], 'dirt']; const k = vnoise(gx, row, 5); return [k > 0.72 ? Wd[5] : (k > 0.45 ? St[2] : St[3]), 'dirt']; }
  if (pd < pw || yd < 0) {
    if (yd >= 0 && x >= 446 && TN && TN.inTown(x, y) && HL && HL.paved && S.town && HL.paved(S.town.hall)) { // v5.10.10: 路面铺石板
      const u = x + 400 + (Math.floor((y + 400) / 3) & 1) * 1.5, cx = Math.floor(u / 3), cy = Math.floor((y + 400) / 3), k = vnoise(cx, cy, 5);
      if (pd > pw - 0.8) return [St[1], 'dirt']; if (u - cx * 3 < 0.5 || (y + 400) - cy * 3 < 0.5) return [St[2], 'dirt']; // v5.11.0: setts in a running bond (the checkerboard was loud at the new size)
      return [k > 0.75 ? Wd[5] : (k > 0.5 ? St[2] : St[3]), 'dirt']; }
    return [(pd > pw - 0.6 && yd > -0.6) ? Wd[3] : Wd[4], 'dirt']; }
  if (INN_ON) { const o = IA.ground(x, y); if (o) return o; } // v5.10.7: the inn path and the tables (v5.11.0.5: before the town art, the 农家乐区 is in its strip)
  if (x >= 446 && TA) { const o = TA.ground(x, y); if (o) return o; } // v5.8.0: the town
  if (HOME_ON) { const o = HA.ground(x, y); if (o) return o; } // v5.9.0: the new house's yard
  { const o = XP.ground(x, y, S.plots); if (o) return o; } // v5.5.0: river, cliff, mountain, the ring's plots
  // regions: an open region is farm grass (with a packed-dirt yard round its field); a locked one stays a wild meadow
  for (const r of WD.REGIONS) if (WD.inRect(x, y, r.rect)) {
    if (r.id === 'coast') { const v = vnoise(x / 5, y / 5, 17); return [v > 0.66 ? Wd[5] : v > 0.33 ? Wd[4] : Wd[3], 'sand']; } // the beach is sand even before it is bought
    if (!regionOpen(r.id)) return [vnoise(x / 9, y / 9, 13) > 0.62 ? G[3] : G[2], 'wild'];
    const fy = fieldYard(r); if (fy && rectOut(x, y, fy) === 0) return [Wd[4], 'dirt'];
    return [G[3], 'grass'];
  }
  let out = Math.max(-x, x - WW, -y, y - WH, 0);
  for (const r of WD.REGIONS) out = Math.min(out, rectOut(x, y, r.rect) + 2);
  for (const k of PEN1) if (!PENS[k].needs || !WD.region(PENS[k].needs) || !WD.inRect(PENS[k].bld.x, PENS[k].bld.y, WD.region(PENS[k].needs).rect)) out = Math.min(out, rectOut(x, y, penBox(PENS[k])) + 2); // v4.7: the coop and the sty sit in clearings
  if (pd < pw + 8) out = Math.min(out, 4);                             // roads keep a strip of open grass beside them
  if (out > 22 + vnoise(x / 7, y / 7, 5) * 12) return [G[1], 'grass']; // forest floor under the tree line
  if (out > 6 + vnoise(x / 6, y / 6, 3) * 8) return [G[2], 'grass'];
  return [G[3], 'grass'];
}
function buildGroundBase(r) { // one ground pixel per screen pixel (world unit = RS px); r: only this world rect [x0, y0, x1, y1] (v5.5.0)
  const X0 = r ? Math.max(0, Math.floor((r[0] - GX0) * RS)) : 0, Y0 = r ? Math.max(0, Math.floor((r[1] - GY0) * RS)) : 0;
  const X1 = r ? Math.min(GW, Math.ceil((r[2] - GX0) * RS)) : GW, Y1 = r ? Math.min(GH, Math.ceil((r[3] - GY0) * RS)) : GH, w = X1 - X0, h = Y1 - Y0; if (w <= 0 || h <= 0) return;
  const g = groundBase.getContext('2d'), img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) d[py * w + px] = u32(groundAt((px + X0) / RS + GX0, (py + Y0) / RS + GY0)[0]);
  g.putImageData(img, X0, Y0);
  if (window.__farm && window.__farm.onGround) window.__farm.onGround(); // the minimap copies it
}
function buildGround() { groundDirty = false; }
let aveKey = null; // v5.11.0: the stone avenue and the paved town repaint when the road is bought, the town opens or the streets are paved
function syncAvenue() { if (!TN || !TN.AVENUE) return; const k = [roadBuilt(), !!(S.eff && S.eff.town), !!(HL && HL.paved && S.town && HL.paved(S.town.hall))].join();
  if (k === aveKey) return; const first = aveKey === null; aveKey = k; if (!first && groundReady) buildGroundBase([356, TN.RECT[1] - 4, TN.RECT[2] + 4, TN.RECT[3] + 4]); }
// decals: grass tufts, flowers, pebbles; placed in the world but drawn upright, like billboards lying on the ground
const decals = [];
COAST_OLD = true;
{ const r = mulberry32(777), blocked = (x, y) => { const k = groundAt(x, y)[1];
    return Math.hypot(x - HOUSE.x, (y - HOUSE.y) * 1.2) < 22 || Math.hypot(x - BARN.x, (y - BARN.y) * 1.2) < 20 || (x > 66 && x < 126 && y > 50 && y < 94 && k !== 'grass'); };
  for (let i = 0; i < 900 && decals.length < 330; i++) { const x = -M * 0.8 + r() * (WW + M * 1.6), y = -M * 0.8 + r() * (WH + M * 1.6); const k = groundAt(x, y)[1];
    if (blocked(x, y)) continue;
    if (k === 'grass') { const v = r(); decals.push({ x, y, c: v < 0.12 ? SPRITES.flowers[Math.floor(r() * 4)] : SPRITES.tufts[Math.floor(r() * 4)] }); }
    else if (k === 'dirt' && r() < 0.25) decals.push({ x, y, c: SPRITES.dirtTufts[Math.floor(r() * 2)] }); }
  [[-10, -3], [-4, 3], [3, -5], [8, 1], [-13, 4]].forEach(([dx, dy], i) => decals.push({ x: POND.x + dx, y: POND.y + dy, c: SPRITES.lily, lily: i, bob: 0 }));
  // v4.3: the rest of the big map (same density); locked meadows get extra flowers so they look worth buying
  // v5.8.0: the v5.5.0 map keeps its own layout (WORLD55); the town strip east of it gets its own stream below
  const scatter = (r2, W0, skip) => { const area = (W0.x1 - W0.x0) * (W0.y1 - W0.y0);
  for (let i = 0; i < area / 60; i++) { const x = W0.x0 + r2() * (W0.x1 - W0.x0), y = W0.y0 + r2() * (W0.y1 - W0.y0); if (skip && skip(x, y)) { r2(); continue; }
    if (x > -M * 0.8 && x < WW + M * 0.8 && y > -M * 0.8 && y < WH + M * 0.8) continue;
    const k = groundAt(x, y)[1], v = r2();
    if (k === 'wild') { if (v < 0.75) decals.push({ x, y, c: v < 0.3 ? SPRITES.flowers[Math.floor(r2() * 4)] : SPRITES.tufts[Math.floor(r2() * 4)] }); }
    else if (k === 'grass' && v < 0.35) decals.push({ x, y, c: v < 0.04 ? SPRITES.flowers[Math.floor(r2() * 4)] : SPRITES.tufts[Math.floor(r2() * 4)] });
    else if (k === 'dirt' && v < 0.1) decals.push({ x, y, c: SPRITES.dirtTufts[Math.floor(r2() * 2)] });
    else if (k === 'sand' && v < 0.16) decals.push({ x, y, c: SPRITES.pebbles ? SPRITES.pebbles[Math.floor(r2() * (SPRITES.pebbles.length || 1))] : SPRITES.dirtTufts[Math.floor(r2() * 2)] }); } };
  scatter(mulberry32(778), WORLD55);
  if (WORLD.x1 > WORLD55.x1) scatter(mulberry32(7781), { x0: WORLD55.x1, y0: WORLD.y0, x1: WORLD.x1, y1: WORLD.y1 }, (x, y) => TN && TN.inTown(x, y) && Math.hypot(x - TN.PLAZA.x, y - TN.PLAZA.y) < TN.PLAZA.r + 2);
}
COAST_OLD = false; for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i]; if (WD.seaLook(d.x, d.y) !== WD.seaAt(d.x, d.y)) decals.splice(i, 1); } // none on the new beach strip
// ---------- the big map (v4.3): roads cut through the forest rim, wild forest between the clearings, fenced regions ----------
for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (!p.tree) continue;
  if (nearRoute(p.x, p.y, 14) || WD.seaAt(p.x, p.y) || PL.clearAt(p.x, p.y, 10) || WD.REGIONS.some(r => WD.inRect(p.x, p.y, r.rect, 10) || (r.water && WD.inRect(p.x, p.y, r.water, 8))) || PEN1.some(k => WD.inRect(p.x, p.y, penBox(PENS[k]), 8))) props.splice(i, 1); }
{ const fr = mulberry32(5150), P = a => a[Math.floor(fr() * a.length)];
  const kinds = () => P([...treeDefs.dark, ...treeDefs.pine, ...treeDefs.oak, ...treeDefs.olive, ...treeDefs.dark, ...treeDefs.birch]);
  for (let y = WORLD55.y0 - 8; y <= WORLD55.y1 + 14; y += 17) for (let x = WORLD55.x0 - 8; x <= WORLD55.x1 + 10; x += 18) {
    const tx = x + (fr() - 0.5) * 9 + ((Math.round(y / 17) & 1) ? 9 : 0), ty = y + (fr() - 0.5) * 7;
    if (tx > -46 && tx < WW + 46 && ty > -46 && ty < WH + 46) continue;                    // the farm's own rim is already there
    if (PL.clearAt(tx, ty, 12) || ty < PL.ridgeY(tx) - PL.CLIFF - 2 || WD.seaAt(tx, ty) || WD.REGIONS.some(r => WD.inRect(tx, ty, r.rect, 12) || (r.water && WD.inRect(tx, ty, r.water, 8))) || AN.PEN_IDS.some(k => WD.inRect(tx, ty, penBox(PENS[k]), 10)) || nearRoute(tx, ty, 13)) continue;
    let d = 1e9; for (const r of WD.REGIONS) d = Math.min(d, rectOut(tx, ty, r.rect)); d = Math.min(d, Math.max(-tx, tx - WW, -ty, ty - WH, 0));
    if (fr() < (d < 50 ? 0.9 : 0.55)) addTree(kinds(), tx, ty);
  }
  // v5.8.0: the strip east of the old edge: thick woods round the town, pines on the high ground, the beach and sea stay open
  if (TN && WORLD.x1 > WORLD55.x1) { const fs = mulberry32(5151);
    for (let y = WORLD.y0 - 8; y <= WORLD.y1 + 14; y += 16) for (let x = WORLD55.x1 + 14; x <= WORLD.x1 + 10; x += 17) {
      const tx = x + (fs() - 0.5) * 8 + ((Math.round(y / 16) & 1) ? 8 : 0), ty = y + (fs() - 0.5) * 6, roll = fs(), pick = fs();
      if (TN.inTown(tx, ty, 9) || (TN.AGRI && TN.inRect(tx, ty, TN.AGRI, 4)) || WD.seaAt(tx, ty) || nearRoute(tx, ty, 12) || WD.seaShore(tx) - ty < 14) continue; // v5.11.0: the 农家乐区 ground stays clear
      const ry = PL.ridgeY(tx); if (ty < ry + 3 && ty > ry - PL.CLIFF - 4) continue;                    // the cliff face
      const hi = ty < ry - PL.CLIFF; if (roll < (hi ? 0.45 : 0.85)) addTree(hi ? treeDefs.pine[Math.floor(pick * 3)] : kinds(), tx, ty); } }
}
// v5.11.0.5: the old map's rim put a few trees on the west edge of the 农家乐区 (their canopies hid the kitchen garden); a pass
// afterwards (not a skip inside the loops, so no other tree moves)
if (TN && TN.AGRI) for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (p.tree && TN.inRect(p.x, p.y, TN.AGRI, 7)) props.splice(i, 1); }
// region fences (gate segments open when the region is bought), a sign with a padlock at each gate, water barrels
const barrelModel = buildModel(10, 10, 12, Object.assign((x, y, z) => { const e = Math.hypot(x + 0.5 - 5, y + 0.5 - 5); if (e > 4.6) return null;
  if (z === 11) return e < 3.6 ? Wt[3] : Wd[3]; return (z === 2 || z === 8) ? St[1] : (e > 3.6 ? Wd[2] : null); }, {}));
const stumpModel = buildModel(10, 10, 6, Object.assign((x, y, z) => { const e = Math.hypot(x + 0.5 - 5, y + 0.5 - 5); if (e > 4.4 - (z === 0 ? -0.6 : 0)) return null;
  if (z === 5) return e < 1.4 ? Wd[3] : e < 3.2 ? Wd[4] : Wd[2]; return Wd[2]; }, {}));
const SIGN = pix(['.bbbbbbbbbbb.', 'bsssssssssssb', 'bsttsssttsssb', 'bsssssssssssb', 'bssttsssttssb', 'bsssssssssssb', '.bbbbbbbbbbb.', '......w......', '......w......', '......w......', '.....www.....']);
const LOCK = pix(['.eee.', 'e...e', 'e...e', 'yyyyy', 'yyiyy', 'yyiyy', 'yyyyy']);
const regionProps = {};
for (const r of WD.REGIONS) { const [x0, y0, x1, y1] = r.rect, list = regionProps[r.id] = [];
  const openings = [r.gate, r.pier].filter(Boolean);
  const nearGate = (x, y) => openings.some(g => Math.hypot(x - g.x, y - g.y) < 12);
  for (let x = x0; x < x1; x += 8) for (const y of [y0, y1]) { const p = addProp(models.fence, x + 4, y, 0, { region: r.id }); p.gate = nearGate(x + 4, y); list.push(p); }
  for (let y = y0; y < y1; y += 8) for (const x of [x0, x1]) { const p = addProp(models.fence, x, y + 4, Math.PI / 2, { region: r.id }); p.gate = nearGate(x, y + 4); list.push(p); }
  const sign = { spr: SIGN, x: r.sign.x, y: r.sign.y, region: r.id, sign: 1 }; billboards.push(sign); list.push(sign);
  if (r.barrel) addProp(barrelModel, r.barrel.x, r.barrel.y, 0);
}
const SEA_SOLIDS = [];
const pierDeck = buildModel(14, 16, 4, Object.assign((x, y, z) => {
  if (z <= 0) return (x < 2 || x > 11) ? Wd[1] : null; // posts at the sides
  if (z === 1 || z === 2) return (y & 1) ? Wd[3] : Wd[4]; // planks running along the pier
  if (z === 3 && (x <= 1 || x >= 12)) return Wd[2]; // low rail
  return null;
}, {}));
{ const r = WD.region('coast'); if (r && r.pier) { const list = regionProps[r.id] || (regionProps[r.id] = []);
  for (let y = r.pier.y; y <= r.fish.stand.y + 4; y += 8) { const p = addProp(pierDeck, r.pier.x, y, 0, { pier: 1 }); list.push(p);
    if (y > r.pier.y) { SEA_SOLIDS.push({ x: r.pier.x - 6, y, r: 2 }); SEA_SOLIDS.push({ x: r.pier.x + 6, y, r: 2 }); } } } }
// v5.5.0: the outer ring's props (expansion.js): cliffs, the bridge, wheels, the town, plot fences and signs, the modules
const XPM = XP.mount({ S, inHomeYard: (x, y) => !!(HA && HA.inYard(x, y)), buildModel, gableY, addProp, addTree, props, billboards, decals, regionProps, models, treeDefs, mulberry32, SIGN, LOCK, SPRITES, pierDeck, barrelModel, crateModel, logsModel,
  stackCanvas, ASTEP, cam, manual: MANUAL, tiles, FARMER, log: m => log(m), popText: (...a) => popText(...a), burst: (...a) => burst(...a), emit: (...a) => emit(...a), applyUpgrades: () => applyUpgrades(), saveNow: () => saveNow(), woodCap: () => woodCap(),
  plotBusy: id => worksBusy(id), plotVacate: (id, mod) => worksVacate(id, mod), treeChanged: t => treeChanged(t), dropTree: id => { const o = TV.get(id); if (o && o._ck && o._ck.c) o._ck.c.width = o._ck.c.height = 0; TV.delete(id); }, markNavDirty: () => markNavDirty(), buildGroundBase: r => { if (groundReady) buildGroundBase(r); }, WD, SIM });
// ---------- the pasture (v4.5): coop, shed, trough, hay; animals are billboards that wander slowly ----------
function coopModel() { // a small red-roofed hen house with a ramp to its door
  const X0 = 3, X1 = 22, Y0 = 4, Y1 = 17, ZW = 12;
  const roof = { z0: ZW + 1, pitch: 0.9, x0: X0 - 3, x1: X1 + 3, y0: Y0 - 2, y1: Y1 + 2, fy0: Y0, fy1: Y1, base: Rf[2], line: Rf[1], ridge: Rf[1], trim: Wd[4] };
  return buildModel(26, 24, 26, (x, y, z) => {
    if (z <= 1 && y > Y1 && y <= Y1 + 5 && x >= 11 && x <= 14) return z === 1 && y % 2 ? Wd[4] : Wd[3];                       // ramp
    if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
      if (!(front || side || back)) return Wd[2];
      if (front && x >= 11 && x <= 14 && z >= 2 && z <= 7) return Ink[1];                                                    // little door
      if (front && ((x >= 5 && x <= 8) || (x >= 17 && x <= 20)) && z >= 7 && z <= 10) return (x === 5 || x === 8 || x === 17 || x === 20 || z === 7 || z === 10) ? Ac[0] : Ink[1];
      if (z === ZW || z === 0) return Wd[4];
      return (front || back) ? (x % 4 === 0 ? Wd[2] : Wd[3]) : (y % 4 === 0 ? Wd[2] : Wd[3]);
    }
    const r = gableY(x, y, z, roof); return r === 'fill' ? (y >= Y1 - 1 || y <= Y0 + 1 ? Wd[3] : Wd[2]) : r;
  });
}
function shedModel() { // an open-fronted stable with a grey roof: sheep and cows sleep inside
  const X0 = 3, X1 = 36, Y0 = 4, Y1 = 25, ZW = 16;
  const roof = { z0: ZW + 1, pitch: 0.8, x0: X0 - 3, x1: X1 + 3, y0: Y0 - 2, y1: Y1 + 3, fy0: Y0, fy1: Y1, base: St[2], line: St[1], ridge: St[1], trim: Wd[4] };
  return buildModel(40, 30, 32, (x, y, z) => {
    if (z <= 1 && x >= X0 && x <= X1 && y >= Y0 && y <= Y1 + 2) return Wd[3];
    if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
      if (!(front || side || back)) return z <= 1 ? ((x * 7 + y * 3) % 5 < 2 ? Ac[1] : Wd[3]) : z === ZW - 1 && x % 6 === 0 ? Wd[1] : null; // straw on a plank floor, rafters
      if (front && x >= 9 && x <= 30 && z >= 2 && z <= 13) return null;                                                     // wide opening
      if (z === ZW) return Wd[4];
      if (front && (x === 8 || x === 31)) return Wd[1];
      return (front || back) ? (x % 5 === 0 ? Wd[1] : Wd[2]) : (y % 5 === 0 ? Wd[1] : Wd[2]);
    }
    const r = gableY(x, y, z, roof); return r === 'fill' ? Wd[2] : r;
  });
}
function troughModel(feed, water) { // wooden trough: hay on the left half, water on the right
  return buildModel(18, 8, 5, (x, y, z) => {
    if ((x === 1 || x === 16) && y >= 1 && y <= 6 && z <= 1) return Wd[1];                                                   // legs
    if (z < 2 || x < 1 || x > 16 || y < 1 || y > 6) return null;
    const rim = x === 1 || x === 16 || y === 1 || y === 6 || x === 9 || z === 2;
    if (rim) return z === 4 ? Wd[4] : Wd[2];
    if (x < 9) return feed && z <= 4 ? (z === 4 ? Ac[1] : Wd[4]) : null;
    return water && z === 3 ? Wt[3] : null;
  });
}
function styModel() { // a low plank hut with a dark shingle roof and a muddy patch in front
  const X0 = 3, X1 = 24, Y0 = 4, Y1 = 16, ZW = 9;
  const roof = { z0: ZW + 1, pitch: 0.75, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 2, y1: Y1 + 2, fy0: Y0, fy1: Y1, base: Wd[2], line: Wd[1], ridge: Wd[1], trim: Wd[3] };
  return buildModel(28, 26, 20, (x, y, z) => {
    if (z === 0 && y > Y1 + 1 && y <= Y1 + 8 && x >= 5 && x <= 22 && (x - 13.5) ** 2 / 90 + (y - Y1 - 4.5) ** 2 / 14 < 1) return (x * 5 + y * 3) % 7 < 2 ? Wd[2] : Wd[1]; // mud
    if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
      if (!(front || side || back)) return z <= 1 ? Ac[1] : null;
      if (front && x >= 11 && x <= 16 && z >= 1 && z <= 6) return z <= 1 ? Ac[1] : null;                                     // doorway with straw
      if (z === ZW) return Wd[4];
      return (front || back) ? (x % 3 === 0 ? Wd[2] : Wd[3]) : (y % 3 === 0 ? Wd[2] : Wd[3]);
    }
    const r = gableY(x, y, z, roof); return r === 'fill' ? Wd[3] : r;
  });
}
function foldModel() { // an open sheep shelter: four posts, a low wattle back wall, a thatched roof
  const X0 = 3, X1 = 28, Y0 = 4, Y1 = 18, ZW = 11;
  const roof = { z0: ZW + 1, pitch: 0.85, x0: X0 - 3, x1: X1 + 3, y0: Y0 - 3, y1: Y1 + 3, fy0: Y0, fy1: Y1, base: Ac[1], line: Wd[4], ridge: Wd[3], trim: Wd[4] };
  return buildModel(32, 26, 24, (x, y, z) => {
    if (z === 0 && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) return (x + y * 2) % 5 < 2 ? Ac[1] : Wd[4];                       // straw bedding
    if (z <= ZW && ((x <= X0 + 1 || x >= X1 - 1) && (y <= Y0 + 1 || y >= Y1 - 1))) return Wd[2];                                // posts
    if (z <= 6 && y <= Y0 + 1 && x >= X0 && x <= X1) return (x + z) % 2 ? Wd[3] : Wd[2];                                        // wattle back wall
    if (z === ZW && (y <= Y0 + 1 || y >= Y1 - 1) && x >= X0 && x <= X1) return Wd[3];                                          // beams
    const r = gableY(x, y, z, roof); return r === 'fill' ? Ac[1] : r;
  });
}
const pastureModels = { coop: coopModel(), sty: styModel(), fold: foldModel(), shed: shedModel(), trough: [0, 1, 2, 3].map(i => troughModel(i & 1, i & 2)) };
Object.assign(pastureModels, { coop2: pastureModels.coop, sty2: pastureModels.sty, fold2: pastureModels.fold, shed2: pastureModels.shed }); // v5.6.0: the second pens look like the first
const pens = Object.fromEntries(AN.PEN_IDS.map(k => [k, { bld: null, trough: null }])); let shedHay = null;
var PASTURE_READY = true;
function syncPastureProps() { // a building and its trough appear once bought
  if (!PASTURE_READY) return;
  for (const k of AN.PEN_IDS) { const P = PENS[k], o = pens[k]; if (!S.eff[k] || o.bld) continue;
    o.bld = addProp(pastureModels[k], P.bld.x, P.bld.y, 0, { big: 1 }); o.trough = addProp(pastureModels.trough[0], P.trough.x, P.trough.y, 0); }
  if (S.eff.shed && !shedHay) shedHay = addProp(hayModel, PENS.shed.hay.x, PENS.shed.hay.y, 0.4);
}
// v5.3.1 the lumber hut: a plank cabin with a moss-green roof and a log pile, in 林场's empty south strip east of the gate
function lumberModel() {
  const X0 = 3, X1 = 22, Y0 = 4, Y1 = 15, ZW = 10;
  const roof = { z0: ZW + 1, pitch: 0.8, x0: X0 - 2, x1: X1 + 2, y0: Y0 - 2, y1: Y1 + 2, fy0: Y0, fy1: Y1, base: G[1], line: G[0], ridge: Wd[1], trim: Wd[3] };
  return buildModel(26, 20, 20, (x, y, z) => {
    if (z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y >= Y1 - 1, side = x <= X0 + 1 || x >= X1 - 1, back = y <= Y0 + 1;
      if (!(front || side || back)) return null;
      if (front && x >= 10 && x <= 14 && z >= 1 && z <= 7) return z <= 1 ? Wd[1] : null;                  // doorway
      if (front && (x === 6 || x === 18) && z >= 5 && z <= 7) return Wt[3];                                  // two little windows
      if (z === ZW) return Wd[4];
      return (front || back) ? (z % 3 === 0 ? Wd[2] : Wd[3]) : (z % 3 === 0 ? Wd[2] : Wd[4]);
    }
    const r = gableY(x, y, z, roof); return r === 'fill' ? G[1] : r;
  });
}
var LUMBER_READY = true; let lumberProps = null;
function syncLumberProps() {
  if (!LUMBER_READY || !S.eff.lumber || lumberProps) return;
  lumberProps = [addProp(lumberModel(), WA.HUT.x, WA.HUT.y, 0, { big: 1 }), addProp(logsModel, WA.HUT_LOGS.x, WA.HUT_LOGS.y, 0.2)];
}
function troughLook() { for (const k of AN.PEN_IDS) { const o = pens[k].trough; if (!o) continue; const t = S.troughs[k], m = pastureModels.trough[(t.feed > 0 ? 1 : 0) | (t.water ? 2 : 0)]; if (o.m !== m) o.m = m; } }
// ---------- v5.6.0 phase 8: sprinklers, workshops + wheat, the water wheel and its lamps, hives, second pens, herding ----------
// Rules: works.js (pure). Art: works-art.js. S.works is saved as `works` (save v12).
var WORKS_ON = false;
const worksRng = salt => mulberry32(((S.day * 2654435761) ^ salt) >>> 0); // own streams: the farm's RNG stays where it was
const worksCtx = () => ({ plots: S.plots, regions: S.eff.regions, works: S.works.works, cows: S.animals.filter(a => a.kind === 'cow').length, fruit: S.trees.some(t => t.stage === 'tree' && WD.FRUIT[t.kind]), library: !!(LB && S.town && LB.built(S.town.hall)) });
const workersNow = () => 1 + S.members.filter(m => m.role === 'partner' || m.role === 'teen' || m.role === 'child').length;
SIM.gate = (id, have) => { // shop gates the plain levels cannot express (the shop card shows the text)
  if (id === 'cottage' && HM) return homeGate(have); // v5.9.0
  if (id === 'town' && TN) return have ? null : TN.gate({ plots: S.plots, schoolDays: TN.schoolDays(S.town) }); // v5.8.0
  if (id === 'sprinkler') return PW.sprinklerGate(S.up, workersNow()) ? null : '先买花洒水壶，或等家里有 3 个能干活的人';
  if (PW.WORKS[id]) return PW.workGate(id, worksCtx());
  if (id === 'wheel') return PW.wheelGate(S.plots, have);
  if (id === 'hive') return PW.hiveGate(S.plots, S.eff.regions, have, S.works.hives);
  if (PW.MACH[id]) return PW.machGate(id, MC(), machCtx()); // v5.11.0.29
  if (PW.PEN2[id]) return PW.pen2Gate(id, S.plots, S.works.penHost);
  if (AN.KINDS[id]) return PW.animalGate(id, have, S.eff);
  if (id === 'party') return S.family.moved ? null : '阿禾搬来以后才办得起派对'; // v5.7.0
  if (YD.ITEM[id]) return yardGate(id, have); // v5.10.3
  return null;
};
// v5.9.1 progressive shop: how many unlock steps an item is from buyable (0: owned, buyable, or only short of money it can soon have).
// The shop shows items up to REVEAL_MAX steps away (locked ones with their condition) and hides the rest, so a new farm's shop is short.
const REVEAL_MAX = 2;
const plotMod = (...mods) => Object.values(S.plots || {}).some(p => p && mods.includes(p.mod));
const revealSteps = id => { // the outside conditions behind a gate, in order; each one not met yet is a step
  const moved = !!S.family.moved;
  if (id === 'town') return [moved, !!(S.plots.eroad && S.plots.eroad.mod === 'road'), TN ? TN.schoolDays(S.town) > 0 || S.family.kids.length > 0 : true];
  if (id === 'cottage') return [moved, plotMod('meadow', 'field'), S.family.kids.length > 0];
  if (PW.WORKS[id]) return [moved, plotMod('workshop')];
  if (id === 'wheel') return [moved, plotMod('dam')];
  if (id === 'hive') return [moved, plotMod('meadow', 'orchard')];
  if (PW.PEN2[id]) return [moved, plotMod('pasture')];
  if (PW.MACH[id]) { const c = machCtx(); return id === 'chute' ? [moved, c.coop2] : id === 'milker' ? [moved, c.shed2] : id === 'tray' ? [moved, c.meadow, c.hives >= PW.HIVE.max] : [moved, c.wheel > 0, c.smithy]; } // v5.11.0.29
  if (id === 'party') return [moved];
  return null;
};
// prices up to max(1000, 10x the last 3 days' average income) always count as within reach once the prerequisites are met
const shopAfford = () => { const e = S.dayEarn.slice(-3); return Math.max(1000, 10 * (e.length ? e.reduce((a, b) => a + b, 0) / e.length : 0)); };
function shopDepth(id) {
  const it = SIM.shopItem(id); if (!it) return 0; const have = S.up[id] | 0; if (have > 0) return 0;
  const o = SIM.offer(S.up, S.coins, id, FARMER.wood); if (!o || o.maxed || o.ok) return 0;
  let d = 0;
  if (o.locked && o.locked !== id) d += 1 + shopDepth(o.locked); // needs another shop item first
  else if (o.lockText) { const st = revealSteps(id); d += Math.max(1, st ? st.filter(x => !x).length : 1); }
  if (!d && o.cost <= shopAfford()) return 0; // nothing in the way and within reach: always shown (coins must have somewhere to go)
  const earn = S.dayEarn.length ? S.dayEarn.reduce((a, b) => a + b, 0) / S.dayEarn.length : 0, reach = Math.max(S.coins, 3 * earn, 300);
  if (o.cost > 4 * reach) d += 1; // far beyond what the farm has or makes in a few days
  return d;
}
function worksBought(id) { // before applyUpgrades: put the new thing in its place
  const W = S.works;
  if (PW.WORKS[id]) { const sl = PW.freeSlot(S.plots, W.works); if (sl) W.works[id] = { at: sl.at, slot: sl.slot, inp: 0, left: 0, ready: 0 }; }
  if (id === 'hive') { const sl = PW.hiveFree(S.plots, S.eff.regions, W.hives); if (sl) { W.hives.push({ at: sl.at, s: sl.s, cd: PW.HIVE.every, ready: 0 }); if (HM && S.home.houses.length) { const h = W.hives[W.hives.length - 1], p = PW.hivePos(h, S.plots, S.eff.regions); if (p && homeFeet().some(f => HM.inBox(p, f, 3))) homeHiveAside(h, p); } } // v5.9.0: not in the new house's yard
    if (W.hives.length === 1) { BOOK.record(S.codex, 'bug:bee', S.day); log('蜜蜂飞起来了，图鉴「昆虫」页记下了蜜蜂'); } }
  if (PW.PEN2[id] && !W.penHost) { W.penHost = PW.pastureHost(S.plots, null); PW.applyPenLayout(PENS, W.penHost); }
  if (PW.MACH[id]) machBought(id); // v5.11.0.29
}
// v5.10.12: a 工坊院 being re-zoned: its workshops move to another yard (same state), or wait in the storehouse until one is free
function worksVacate(id, mod) {
  if (mod === 'workshop') return [];
  const moves = PW.evacuate(S.plots, S.works.works, id), names = [], stored = [];
  for (const m of moves) { const w = S.works.works[m.id]; for (const q of S.decor.orders.slice()) if (q.what === 'work' && q.ref === m.id) dropOrder(q);
    w.at = m.to; w.slot = m.slot; delete w.x; delete w.y; (m.to ? names : stored).push(PW.WORKS[m.id].name + (m.to ? '搬到了' + PL.plot(m.to).name : '')); }
  if (names.length) log(`改建前家人把加工坊挪走了：${names.join('、')}，原料和成品都在`);
  if (stored.length) log(`${stored.join('、')}先拆下来收进仓库（原料和成品都留着），等有新的工坊院空位，家人会盖回去`);
  if (moves.length) { markNavDirty(); if (WORKS_ON) PWA.sync(true); }
  return moves;
}
function worksRestock() { // v5.10.12: stored workshops go back up in a free yard slot
  if (!S.works || !S.works.works) return; const moves = PW.restock(S.plots, S.works.works); if (!moves.length) return;
  for (const m of moves) { const w = S.works.works[m.id]; w.at = m.to; w.slot = m.slot; delete w.x; delete w.y; log(`${PW.WORKS[m.id].name}在${PL.plot(m.to).name}重新盖好了，原料和成品都还在`); }
  markNavDirty();
}
// what re-zoning a plot does to its workshops (shop text): null when there are none
function worksVacateNote(id) {
  if (!S.works || !Object.values(S.works.works).some(w => w && w.at === id)) return null;
  const moves = PW.evacuate(S.plots, S.works.works, id);
  return '院子里的加工坊会跟着走：' + moves.map(m => PW.WORKS[m.id].name + (m.to ? '搬到' + PL.plot(m.to).name : '先收进仓库，有空的工坊院再盖回去')).join('；') + '（原料和成品都留着）';
}
function worksBoughtLog(id) {
  if (id === 'sprinkler') log('浇水器买好了，家里人会把它装到田边');
  if (PW.WORKS[id] && S.works.works[id]) log(`${PW.WORKS[id].name}在${PL.plot(S.works.works[id].at).name}的院子里盖好了`);
  if (id === 'wheel') { const n = PW.wheelsOf(S.plots, S.eff.wheel).length; log(n ? '水车转起来了，天黑后够得着的路灯会亮' : '水车修好了'); }
  if (PW.PEN2[id]) log(`${PW.PEN2[id].name}盖在了${PL.plot(S.works.penHost).name}`);
}
// ---------- v5.11.0.29 自动化机械 (rules: works.js; art: works-art.js) ----------
// Saved as works.mach. The shop's levels (S.up.feeder ...) mirror it and are never saved under upgrades.
const MC = () => S.works.mach || (S.works.mach = {});
const machBuilt = () => PW.MACH_PENS.filter(k => (S.up[k] | 0) > 0);
const machCtx = () => ({ wheel: S.up.wheel | 0, smithy: !!(S.town && S.town.hall && S.town.hall.built && S.town.hall.built.smithy), built: machBuilt(),
  coop2: (S.up.coop2 | 0) > 0, shed2: (S.up.shed2 | 0) > 0, hives: S.works.hives.length, meadow: Object.values(S.plots || {}).some(p => p && p.mod === 'meadow') });
const machFit = pen => PW.fitted(S.works.mach, pen);
function machStrip(up) { for (const id of PW.MACH_IDS) delete up[id]; return up; }
function machSyncUp() { const lv = PW.machLevels(S.works.mach, machBuilt()); for (const id of PW.MACH_IDS) S.up[id] = lv[id]; }
const MACH_LOG = { feeder: '自动饲喂槽', feedset: '自动饲喂槽', chute: '集蛋滑道', milker: '挤奶机', tray: '蜂蜜收集槽' };
function machBought(id) {
  const ks = PW.machBuy(MC(), id, machBuilt()); machSyncUp();
  BOOK.record(S.codex, 'mach:' + (id === 'feedset' ? 'feeder' : id), S.day);
  const names = ks.map(k => PENS[k].name).join('、');
  if (id === 'feeder' || id === 'feedset') { machFeed(); log(`${names}装上了自动饲喂槽和自来水槽：料斗自己添干草，水管接着水车，槽里一直是满的，不用再有人去喂`); }
  if (id === 'chute') log('两座鸡舍装上了集蛋滑道：鸡蛋顺着滑道滚进木箱，直接收进仓库');
  if (id === 'milker') log('两座牛棚装上了挤奶机：牛奶先灌进奶酪坊，剩下的收进仓库');
  if (id === 'tray') log('花甸的蜂箱底下接上了集蜜槽：蜂蜜流进中间的蜜桶，再收进仓库，蜂箱不会再攒满停工');
  if (DY && S.diary) diaryNote('mach:' + (id === 'feedset' ? 'feeder' : id));
  machCollect(true); if (WORKS_ON) PWA.sync();
}
// fitted pens: troughs topped up from the storehouse's hay (and water from the wheel)
// every pen with animals has a feeder: the morning delivery brings the hay, so nobody walks to the stall for it
function machAllFed() { const m = S.works && S.works.mach; return !!(m && m.f) && S.animals.length > 0 && PW.MACH_PENS.every(k => !(AN.penNeed(S.animals, k) > 0) || PW.fitted(m, k)); }
function machFeed() { if (!S.works.mach || !S.works.mach.f) return 0; const used = PW.machFill(S.works.mach, S.troughs, k => AN.penNeed(S.animals, k), S.hay); S.hay -= used; return used; }
// with feeders, the hay stall delivers every morning: up to three nights' worth, paid like a stall purchase (never more than half the coins)
function machHay() {
  if (!S.works.mach || !S.works.mach.f || !S.animals.length) return;
  const need = AN.need(S.animals), want = Math.min(AN.HAY.stock, need * 3) - S.hay, can = Math.floor(S.coins * 0.5 / AN.HAY.price), n = Math.max(0, Math.min(want, can)); if (n <= 0) return;
  const g = n * AN.HAY.price; emit('purchase', { item: 'hay', n, gold: g }); S.coins -= g; S.hay += n; S.hayGold = (S.hayGold || 0) + g; noteLog('spend', 'hay', g);
  log(`干草铺一早送来 ${n} 捆干草，直接放进仓库（${g} 金）`);
}
// eggs, milk and honey straight into the storehouse bin (milk fills the cheese shop first); a rare egg waits at the coop door
function machCollect(now) {
  const m = S.works.mach; if (!m) return; const got = { egg: 0, milk: 0, honey: 0 }, r = worksRng(0x3A1C + (now ? 7 : 0)); let rare = null;
  if (m.e) for (const a of S.animals) { if (a.kind !== 'chicken') continue;
    while (a.ready > 0 && PW.binRoom(m, 'egg') > 0) { a.ready--; const it = SU.rollProduct('egg', r); const ck = BOOK.itemKey(it);
      if (ck) { BOOK.record(S.codex, ck, S.day); noteProgress({ sawRare: true }); rare = it; const P = PENS[homeOf(a)]; S.loose.push({ id: 'chute' + S.day + a.id, type: 'egg', item: it, x: P.door.x + 6, y: P.door.y + 2 }); continue; }
      got.egg += PW.binAdd(m, 'egg', 1); } }
  if (m.m) { const ch = S.works.works.cheese, def = PW.WORKS.cheese;
    for (const a of S.animals) { if (a.kind !== 'cow') continue;
      while (a.ready > 0) { if (ch && ch.at && ch.inp < def.inCap) { a.ready--; ch.inp++; got.milk++; continue; } if (PW.binAdd(m, 'milk', 1)) { a.ready--; got.milk++; continue; } break; } } }
  if (m.h) for (const h of S.works.hives) { const n = PW.binAdd(m, 'honey', h.ready | 0); h.ready -= n; got.honey += n; }
  for (const k of PW.BIN_IDS) if (got[k]) { if (DY && S.diary) DY.add(S.diary, S.day, 'pr', k, got[k], 'mach'); }
  const t = PW.BIN_IDS.filter(k => got[k]).map(k => binText(k, got[k])).join('、');
  if (t) log(`机器把${t}收进了仓库` + (rare ? '，鸡舍门口还滚出一个特别的蛋' : ''));
  if (rare) { const ev = SU.productToast(rare); if (ev) surpriseNote(ev, PENS.coop.door.x, PENS.coop.door.y); }
}
const binName = k => (AN.PRODUCTS[k] || PW.PRODUCTS[k]).name;
const binText = (k, n) => `${n} ${({ egg: '个', milk: '瓶', honey: '罐' })[k] || '份'}${binName(k)}`;
// the night's produce cart: what is above the bin's keep goes at the stall's price (with its awning / scale bonus)
function machShip() {
  const m = S.works.mach; if (!m) return; const out = PW.binShip(m), ks = Object.keys(out); if (!ks.length) return;
  const sm = YD.stallMult(S.homeyard.put); let sum = 0, n = 0; const by = { animals: 0, crops: 0 };
  for (const k of ks) { const g = Math.round(basePrice(k) * out[k] * sm); sum += g; n += out[k]; if (AN.PRODUCTS[k]) { by.animals += g; S.animalGold = (S.animalGold || 0) + g; } else by.crops += g; } // honey counts like at the stall
  emit('income', { gold: sum, items: n, source: 'market', by, who: 'mach' }); S.coins += sum; S.earned += sum; S.todayEarn += sum; S.soldToday += n; S.totalSold += n;
  for (const k of Object.keys(by)) if (by[k]) noteLog('income', k, by[k]);
  log(`收货车拉走了仓库里的${ks.map(k => binText(k, out[k])).join('、')}，得 ${sum} 金`);
}
// orders, meals and the town shops draw on the bin like a workshop's finished goods
function machCounts(add) { const m = S.works.mach; if (m) for (const k of PW.BIN_IDS) { const n = PW.binHas(m, k); if (n) add(k, n); } }
function machPull(left) { const m = S.works.mach; if (m) for (const k of PW.BIN_IDS) if (left[k] > 0) left[k] -= PW.binTake(m, k, left[k]); }
// a field's outline from its tiles (home first, then in tile order)
function fieldList() { const by = new Map();
  for (const t of tiles) { let f = by.get(t.f); if (!f) by.set(t.f, f = { id: t.f, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }); f.x0 = Math.min(f.x0, t.x); f.y0 = Math.min(f.y0, t.y); f.x1 = Math.max(f.x1, t.x); f.y1 = Math.max(f.y1, t.y); }
  return [...by.values()].map(f => ({ id: f.id, c0: (f.x0 - TILE / 2) / TILE, r0: (f.y0 - TILE / 2) / TILE, cols: Math.round((f.x1 - f.x0) / TILE) + 1, rows: Math.round((f.y1 - f.y0) / TILE) + 1 })); }
var SPR_COVER = null; // per sprinkler: the tiles it waters (rebuilt when one is added or moved)
const sprReach = () => (S.eff && S.eff.sprReach) || (PW.SPRINKLER && PW.SPRINKLER.reach) || 16;
const sprCover = () => SPR_COVER || (SPR_COVER = PW.coveredBy(S.works.sprinklers, tiles, sprReach()));
function sprinklerNext() { return S.eff.sprinkler > S.works.sprinklers.length ? PW.nextSpot(fieldList(), tiles, S.works.sprinklers, sprReach()) : null; }
function sprCatchUp(pre) { // v5.10.11.1: sprinklers bought but not yet put in go in overnight
  let n = 0; for (let sp = sprinklerNext(); sp && S.eff.sprinkler > S.works.sprinklers.length && n < 64; sp = sprinklerNext()) { S.works.sprinklers.push({ x: sp.x, y: sp.y }); n++; }
  if (n) { SPR_COVER = null; sprSince = null; log(`${pre || '天亮前家人'}在田边装好了 ${n} 台浇水器（${S.works.sprinklers.length}/${S.eff.sprinkler}）`); noteProgress(); }
  return n; }
function installTask(sp) {
  return { kind: 'install', key: 'spr:install', label: '正在田边装浇水器', to: { x: sp.x - 4, y: sp.y + 2 }, dur: 14, pose: 'pull', done: () => {
    if (!(S.eff.sprinkler > S.works.sprinklers.length)) return; S.works.sprinklers.push({ x: sp.x, y: sp.y }); SPR_COVER = null;
    burst(sp.x, sp.y, 8, ['#8cc6dc', '#5b9cc4', St[2]], 8, 'drop'); log(`${F === FARMER ? '' : F.name}在田边装好了一台浇水器（${S.works.sprinklers.length}/${S.eff.sprinkler}）`); noteProgress(); } };
}
function sprinklerTick() {
  if (!S.works.sprinklers.length) return; const cov = sprCover();
  S.works.sprinklers.forEach((s, i) => { if (s._c) return; let n = 0; /* v5.7.0: not while someone carries it */ for (const t of cov[i] || []) if (t.open && t.crop && !t.watered && SU.canGrow(t.crop, SIM.ripe)) { t.watered = true; n++; }
    if (n) { groundDirty = true; s.spray = realT + 2.5; s.wday = S.day; } });
}
// workshops: what someone carrying goods would hand in (index flags into the basket), so the stall run keeps them
function dinerReserveNeed() {
  if (!IN || !S.inn || !IN.dinerUp(S.inn) || !IN.reserveNeed || S.inn.diner.last === S.day) return null;
  const fest = innFest();
  const wantGroups = IN.groupsWanted(innStarsNow(), S.day, fest);
  const overflow = Math.max(0, wantGroups - (S.inn.cabins | 0));
  const walk = IN.walkinsOf(fest, overflow, S.day);
  const want = IN.mealsWanted(S.inn, S.day, fest, walk);
  if (!(want > 0)) return null;
  return IN.reserveNeed(S.inn, want, innStaffedNow(), innCounts(), innPay);
}
function worksKeep(a) { const keep = new Array(a.crops.length).fill(false); if (a.role && !FAM.canDo(a.role, 'deliver')) return keep;
  const typ = it => (BK && BK.cropId) ? BK.cropId(it, SU && SU.itemType) : (typeof it === 'string' ? it : (SU && SU.itemType ? SU.itemType(it) : (it && it.type)));
  // v5.11.0.26: a taken bakery order is held first (including rare/object crops), so it is not sold or poured into a workshop on the walk to 小桃
  const ord = bakeryTaken(); if (ord && BK.reserve) BK.reserve(a.crops, ord.need, keep, typ);
  for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (!w || !w.at) continue; let room = PW.WORKS[id].inCap - w.inp;
    a.crops.forEach((it, i) => { const ty = typ(it); if (room > 0 && !keep[i] && ty && PW.WORKS[id].inputs.includes(ty)) { keep[i] = true; room--; } }); }
  const dinerNeed = dinerReserveNeed(); // v5.11.0.12: hold tonight's restaurant ingredients until 11:30, like the bakery
  if (dinerNeed) a.crops.forEach((it, i) => {
    const ty = innType(it);
    if (ty && dinerNeed[ty] > 0 && !keep[i]) { keep[i] = true; dinerNeed[ty]--; }
  });
  return keep; }
const worksKeepN = a => worksKeep(a).filter(Boolean).length;
const workArea = { mill: 'field', jam: 'orchard', cheese: 'animal' };
function deliverTask(id) { const def = PW.WORKS[id];
  return { kind: 'deliver', key: 'w:' + id + ':in', label: `正在把原料送去${def.name}`, to: PWA.doorOf(id), dur: 6, pose: 'pull', done: () => {
    const w = S.works.works[id]; if (!w) return; let n = 0;
    const typ = it => (BK && BK.cropId) ? BK.cropId(it, SU && SU.itemType) : (typeof it === 'string' ? it : (it && it.type));
    // bakery / diner fruit stays in the basket
    const reserved = new Array(F.crops.length).fill(false);
    const ord = bakeryTaken(); if (ord && BK.reserve) BK.reserve(F.crops, ord.need, reserved, typ);
    const dinerNeed = dinerReserveNeed();
    if (dinerNeed) F.crops.forEach((it, i) => { const ty = innType(it); if (ty && dinerNeed[ty] > 0 && !reserved[i]) { reserved[i] = true; dinerNeed[ty]--; } });
    for (let i = F.crops.length - 1; i >= 0 && w.inp < def.inCap; i--) {
      const ty = typ(F.crops[i]); if (!reserved[i] && ty && def.inputs.includes(ty)) { F.crops.splice(i, 1); w.inp++; n++; }
    }
    if (n) { log(`${F === FARMER ? '' : F.name}往${def.name}送了 ${n} 份原料`); burst(PWA.doorOf(id).x, PWA.doorOf(id).y - 4, 8, [Ac[1], Wd[4]], 6, 'leaf'); } } };
}
function pickupTask(id) { const def = PW.WORKS[id], name = PW.PRODUCTS[def.out].name;
  return { kind: 'pickup', key: 'w:' + id + ':out', label: `正在去${def.name}取${name}`, to: PWA.doorOf(id), dur: 5, done: () => {
    const w = S.works.works[id]; if (!w) return; const n = Math.min(w.ready, BASK() - F.crops.length); if (n <= 0) return;
    w.ready -= n; for (let i = 0; i < n; i++) F.crops.push(def.out); popText(PWA.doorOf(id).x, PWA.doorOf(id).y, 18, `+${n}${name}`, '#fff2a8'); log(`${F === FARMER ? '' : F.name}从${def.name}取了 ${n} 份${name}，拿去集市卖`); } };
}
function honeyTask(i) { const spot = PWA.hiveSpots()[i];
  return { kind: 'honey', key: 'hive:' + i, label: '正在取蜂蜜', to: { x: spot.x - 6, y: spot.y + 4 }, dur: 8, pose: 'pull', done: () => {
    const h = S.works.hives[i]; if (!h) return; const n = Math.min(h.ready, BASK() - F.crops.length); if (n <= 0) return;
    h.ready -= n; diary('pr', 'honey', n); for (let k = 0; k < n; k++) F.crops.push('honey'); popText(spot.x, spot.y, 16, `+${n}蜂蜜`, '#ffd76a'); log(`${F === FARMER ? '' : F.name}从蜂箱里取了 ${n} 罐蜂蜜`); } };
}
// wheat for the mill: planted on demand while growing + carried + in the mill + seeds is under PW.WHEAT_WANT
function wheatHave() { let n = 0; for (const t of tiles) if (t.crop && t.crop.type === 'wheat') n++;
  for (const a of actors()) { n += a.crops.filter(it => it === 'wheat').length + (a.bag.wheat || 0); } n += S.store.wheat || 0;
  const m = S.works.works.mill; return n + (m ? m.inp : 0); }
const wheatShort = () => S.eff.mill && S.works.works.mill ? Math.max(0, PW.WHEAT_WANT - wheatHave()) : 0;
const wheatPick = () => (S.eff.mill && F.bag.wheat > 0 && wheatHave() - (F.bag.wheat || 0) - (S.store.wheat || 0) < PW.WHEAT_WANT) ? 'wheat' : null;
function worksBoard(post, T) {
  const W = S.works, space = BASK() - F.crops.length;
  const spr = S.eff.sprinkler > S.works.sprinklers.length; if (!spr) sprSince = null; else if (sprSince === null) sprSince = S.t; // v5.10.11.1: it climbs while it waits
  if (T < 18 * 60 && spr) { const sp = sprinklerNext(); if (sp) post('install', 66 + WAIT_BOOST(sprSince), { x: sp.x - 4, y: sp.y + 2 }, () => installTask(sp), 'spr:install', 'field'); }
  const typ = it => (BK && BK.cropId) ? BK.cropId(it, SU && SU.itemType) : (typeof it === 'string' ? it : (it && it.type));
  const reserved = new Array(F.crops.length).fill(false);
  const ord = bakeryTaken(); if (ord && BK.reserve) BK.reserve(F.crops, ord.need, reserved, typ);
  const dinerNeed = dinerReserveNeed();
  if (dinerNeed) F.crops.forEach((it, i) => { const ty = innType(it); if (ty && dinerNeed[ty] > 0 && !reserved[i]) { reserved[i] = true; dinerNeed[ty]--; } });
  for (const id of PW.WORK_IDS) { const w = W.works[id]; if (!w || !w.at || !S.plots[w.at]) continue; const def = PW.WORKS[id], door = PWA.doorOf(id);
    const carry = F.crops.filter((it, i) => !reserved[i] && def.inputs.includes(typ(it))).length;
    if (PW.canDeliver(carry, def.need, def.inCap, w.inp)) post('deliver', space <= 0 ? 100 : id === 'mill' ? 70 + travel(F, door) / 8 : 70, door, () => deliverTask(id), 'w:' + id + ':in', workArea[id]);
    if (w.ready > 0 && space > 0 && T < 18 * 60) post('pickup', w.ready >= def.outCap ? 72 : 60, door, () => pickupTask(id), 'w:' + id + ':out', workArea[id]); }
  if (space > 0 && T < 18 * 60) W.hives.forEach((h, i) => { const sp = PWA.hiveSpots()[i]; if (h.ready > 0 && sp) post('honey', 58, { x: sp.x - 6, y: sp.y + 4 }, () => honeyTask(i), 'hive:' + i, 'orchard'); });
}
function worksTick(dm) {
  sprinklerTick();
  for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (!w || !w.at || !S.plots[w.at]) continue; const def = PW.WORKS[id], made = PW.workStep(w, def, dm, S.eff && S.eff.workSpeed);
    if (!made) continue;
    if (def.feed) S.hay = Math.min(AN.HAY.stock, S.hay + def.feed * made);
    const p = PW.workPos(w); burst(p.x, p.y, 16, ['#fff6dc', Ac[1]], 6, 'spark');
    if (w._day !== S.day) { w._day = S.day; log(`${def.name}做好了${PW.PRODUCTS[def.out].name}` + (def.feed ? `，麸皮做成 ${def.feed} 份饲料进了仓库` : '')); } }
}
function worksNight() {
  const W = S.works;
  if (W.hives.length) { const n = PW.hiveNight(W.hives, worksRng(0x4E5)); if (n) log(`蜂箱里又攒了 ${n} 罐蜂蜜`); }
  const lit = PWA.litLamps().concat(DECOR_ON ? DA.litLamps() : []); // v5.7.0: the lamps the player set down count too
  if (lit.length) { const r = worksRng(0x1A3); let n = 0;
    for (const t of S.trees) { if (t.stage !== 'tree' || t.ripe || !WD.FRUIT[t.kind] || !lit.some(l => Math.hypot(l.x - t.x, l.y - t.y) <= PW.LAMP_R)) continue;
      if (r() < PW.LAMP_FRUIT) { t.cd = (t.cd | 0) - 1; if (t.cd <= 0) { t.ripe = 1; t.cd = WD.FRUIT[t.kind].every || t.cd; treeChanged(t); } n++; } }
    if (n) log(`路灯底下的 ${n} 棵果树夜里多长了一点`); }
  let g = 0; for (const a of S.animals) { const v = AV.get(a.id); if (a.kind === 'sheep' && v && v.grazed === S.day - 1) { a.h = Math.min(100, a.h + PW.HERD.bonus); g++; } }
  if (g) log(`边牧白天把 ${g} 只羊赶去吃了好草，羊心情更好`);
}
// herding: the border collie takes the fold's sheep out to the meadow in the morning and brings them back at dusk
const herdOn = () => S.eff.graze && PETS_LIVE.some(p => AN.isCollie(p)) && S.animals.some(a => a.kind === 'sheep' && homeOf(a) === 'fold') && !(WX && WX.isRaining(S.weather, S.day, S.t));
const herdRng = mulberry32(8123);
function herdSheep(a, v, T) {
  if (homeOf(a) !== 'fold' || !herdOn()) return; const ph = PW.herdPhase(T), G = PL.GRAZE.rect, i = (a.id.charCodeAt(a.id.length - 1) % 6);
  if (ph === 'out' && v.herd !== S.day + 'o') { v.herd = S.day + 'o'; setWalkTarget(v, G[0] + 14 + (i % 3) * 12, G[1] + 26 + Math.floor(i / 3) * 12); v.wait = 25; }
  if (ph === 'back' && v.herd !== S.day + 'b') { v.herd = S.day + 'b'; const P = PENS.fold; setWalkTarget(v, P.door.x - 8 + (i % 3) * 6, P.door.y - 3 + Math.floor(i / 3) * 3); v.wait = 120; }
  if (T >= PW.HERD.noon && T < PW.HERD.noon + 60 && WD.inRect(v.x, v.y, G)) { v.grazed = S.day; if (!S.achievements.some(u => u.id === 'herding')) noteProgress({ herded: true }); } // v5.7.0: 专业对口
}
function herdDog(p, v) { // -> true while the collie is herding (stepPets moves it)
  if (!AN.isCollie(p) || !herdOn()) return false; const ph = PW.herdPhase(S.t % 1440); if (!ph) return false;
  const flock = S.animals.filter(a => a.kind === 'sheep' && homeOf(a) === 'fold').map(a => AV.get(a.id)).filter(Boolean); if (!flock.length) return false;
  v.job = null; const G = PL.GRAZE.rect;
  if (ph === 'graze') { if (Math.hypot(v.tx - v.x, v.ty - v.y) < 0.6) { v.wait -= 1; if (v.wait <= 0) { const gap = PL.GRAZE.gap, edge = herdRng() < 0.5;
      setWalkTarget(v, edge ? G[0] + 8 + herdRng() * (G[2] - G[0] - 16) : gap[0] + 6, edge ? (herdRng() < 0.5 ? G[1] + 6 : G[3] - 6) : (gap[1] + gap[3]) / 2); v.wait = 200 + herdRng() * 400; } }
    return true; }
  const cx = flock.reduce((s, q) => s + q.x, 0) / flock.length, cy = flock.reduce((s, q) => s + q.y, 0) / flock.length;
  const dest = ph === 'out' ? { x: (G[0] + G[2]) / 2, y: (G[1] + G[3]) / 2 } : PENS.fold.door, dx = dest.x - cx, dy = dest.y - cy, d = Math.hypot(dx, dy) || 1;
  const w = Math.sin(realT * 1.3) * 6, tx = cx - dx / d * 12 - dy / d * w, ty = cy - dy / d * 12 + dx / d * w;
  if (Math.hypot(tx - v.tx, ty - v.ty) > 5) setWalkTarget(v, tx, ty);
  return true;
}
// moving a sprinkler (tool bar: 挪浇水器): click one, then click a spot beside a field
function sprinklerSpot(x, y, skip) { const r = PW.spotOk(x, y, tiles, sprReach()); if (!r.ok) return r;
  if (S.works.sprinklers.some((s, i) => i !== skip && Math.hypot(s.x - x, s.y - y) < 5)) return { ok: false, why: '这里已经有一台了' }; return r; }
function sprinklerAt(x, y) { let best = -1, bd = 8; S.works.sprinklers.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } }); return best; }
function sprinklerClick(w) {
  if (INPUT.sprPick == null || INPUT.sprPick < 0) { const i = sprinklerAt(w.x, w.y); if (i < 0) return { ok: false, why: S.works.sprinklers.length ? '先点一台浇水器（田边的小喷头）' : '还没有装好的浇水器' }; INPUT.sprPick = i; say('选中了一台浇水器，再点田边的新位置'); return null; }
  const i = INPUT.sprPick; if (sprinklerAt(w.x, w.y) === i) { INPUT.sprPick = null; say('取消选择'); return null; }
  const r = sprinklerSpot(w.x, w.y, i); if (!r.ok) return r;
  const s = S.works.sprinklers[i]; s.x = Math.round(w.x * 10) / 10; s.y = Math.round(w.y * 10) / 10; SPR_COVER = null; INPUT.sprPick = null; say('把浇水器挪到了这里'); return { ok: true };
}
let worksSyncT = 0;
function worksFrame() { if (!WORKS_ON) return; if (realT - worksSyncT > 0.2 || realT < worksSyncT) { worksSyncT = realT; PWA.sync(); } PWA.frame(realT); } // the key check is a few JSON strings: 5 times a second is plenty
function worksBusy(id) { return PW.plotBusy(id, { worksMove: true, works: S.works.works, hives: S.works.hives, penHost: S.works.penHost, pens2: PW.PEN2_IDS.some(k => S.eff[k]) }) || (DECOR_ON ? decorBusy(id) : null) || (HM ? homeBusy(id) : null) || (IN ? IN.plotBusy(id, S.plots, S.inn) : null); }
PWA.mount({ S, buildModel, gableY, addProp, props, pix, stackCanvas, ASTEP, cam, manual: MANUAL, tiles, markNavDirty: () => markNavDirty(), wheelProp: id => XP.wheelProp(id),
  wheelFrames: () => { const md = XP.models(); return md ? [...md.wheelSets[1], ...md.wheelSets[-1]] : []; } }); // v5.11.0.20: both bank sides
WORKS_ON = true;
// ---------- v5.7.0 phase 9: decorations, night lamps, the party area, moving things ----------
// Rules: decor.js (pure). Art: decor-art.js. S.decor is saved as `decor` (save v13).
// Pieces come from the shop or now and then from chopping, fishing, a giant crop, a full page of the book. The family sets
// each one down on free grass near the house by themselves; the toolbar's 「摆…」 / 「挪东西」 let the player point at a spot,
// and someone carries it there. Everything but the old house moves: decorations, the party area, workshops, hives, sprinklers.
var DECOR_ON = false;
var YARD_ON = false; // v5.10.3
// ---------- v5.10.3: the yard, 阿禾's stall and the animals' things (rules yard.js, art yard-art.js) ----------
// Bought in the shop's 「院子」 tab (never by 「家人帮忙添置」); a free hand walks over and sets each one up on its own spot.
const yardPens = () => Object.fromEntries(YD.LICK_PENS.filter(k => S.eff[k] && PENS[k]).map(k => [k, PENS[k].trough]));
const yardCtx = () => ({ cats: PETS_LIVE.filter(p => p.kind === 'cat').length, dogs: PETS_LIVE.filter(p => p.kind === 'dog').length, pens: yardPens() });
function yardGate(id, have) {
  if (have < YD.room(id, yardCtx())) return null;
  if (id === 'catbed') return '一只猫一个窝：先再养一只猫';
  if (id === 'doghouse') return '一只狗一个狗屋：先再养一只狗';
  if (id === 'saltlick') return '猪圈、羊圈、牛棚各放一块：先再盖一个棚';
  return null;
}
const yardTodo = () => YD.IDS.find(id => { const k = S.homeyard.put[id] | 0; return (S.up[id] | 0) > k && k < YD.room(id, yardCtx()); });
const yardWalk = (x, y) => { const put = S.homeyard.put; return (put.gravel || put.flag ? YD.walkMult(YD.paveAt(put, x, y)) : 1) * aveWalk(x, y); };
const clothesOut = () => { const T = S.t % 1440; return !!S.homeyard.put.clothesline && T >= 8 * 60 && T < 17 * 60 && !(WX && WX.isRaining(S.weather, S.day, S.t)); };
function yardStand(id, n) { // where the one setting it up stands
  if (id === 'curtains' || id === 'roof' || id === 'lantern') return { x: DOOR.x - 3, y: DOOR.y + 5 };
  if (YD.ITEM[id].kind === 'stall') return { x: STALL_SPOT.x - 6, y: STALL_SPOT.y };
  const p = YD.spotOf(id, Math.min(n, YD.ITEM[id].max - 1), yardPens()); if (!p) return null;
  if (id === 'gravel' || id === 'flag') return p;
  if (id === 'vegfence') { const f = YD.FENCE[n] || YD.FENCE[0]; return f.rot ? { x: f.x + (f.x > 96 ? 3 : -3), y: f.y } : { x: f.x, y: f.y + (f.y < 70 ? -3 : 3) }; }
  return { x: p.x, y: p.y + 5 };
}
// v5.10.11.1: a bought piece used to wait at priority 42, below almost every farm chore, so on a busy farm (a family, pens,
// workshops) the gravel or flagstones could sit unbuilt for a week while the gold was gone. Now it starts at 66 (like a
// sprinkler) and climbs while it waits (WAIT_BOOST); whatever is still not done at night is finished before morning.
let yardSince = null, sprSince = null, dcSince = null; // S.t when the oldest unbuilt purchase was noticed (in memory: the night catches up the rest)
const WAIT_BOOST = since => Math.min(40, Math.max(0, S.t - since) / 60 * 15); // +15 an hour, up to +40 (above the harvest)
function yardBoard(post, T) {
  const id0 = yardTodo(); if (!id0) yardSince = null; else if (yardSince === null) yardSince = S.t;
  if (T >= 18 * 60 || T < WAKE) return;
  const id = id0; if (id) { const at = yardStand(id, S.homeyard.put[id] | 0); if (at) post('setup', 66 + WAIT_BOOST(yardSince), at, () => yardSetupTask(id), 'yard:setup'); }
  const h = S.homeyard; if (h.put.brush && h.bday !== S.day && T < 17 * 60 && S.animals.length) {
    const a = S.animals.reduce((b, q) => (q.h | 0) < (b.h | 0) ? q : b, S.animals[0]); post('brush', 24, animalSpot(a), () => brushTask(a), 'yard:brush'); }
}
const YARD_MANY = { gravel: 1, flag: 1, vegfence: 1 };
function yardSetupTask(id) {
  const it = YD.ITEM[id], at = yardStand(id, S.homeyard.put[id] | 0) || { x: DOOR.x, y: DOOR.y + 6 };
  return { kind: 'setup', label: `正在弄${it.name}`, to: at, dur: YARD_MANY[id] ? 6 : 5, pose: 'pull', done: () => {
    const put = S.homeyard.put, want = Math.min(S.up[id] | 0, YD.room(id, yardCtx())), k = put[id] | 0; if (k >= want) return;
    put[id] = k + (YARD_MANY[id] ? Math.min(4, want - k) : 1); yardDone(id, k, put[id]); } };
}
// v5.10.11.1: finish every bought-but-unbuilt yard piece at once (overnight, and once when a save loads: older versions
// could leave paid pieces unbuilt for days). Returns how many kinds were finished.
function yardCatchUp(pre) {
  let n = 0;
  for (const id of YD.IDS) { const put = S.homeyard.put, k = put[id] | 0, want = Math.min(S.up[id] | 0, YD.room(id, yardCtx())); if (k >= want) continue;
    put[id] = want; yardDone(id, k, want, pre); n++; }
  if (n) { yardSince = null; markNavDirty(); }
  return n;
}
function yardBought(id, who) {
  const it = YD.ITEM[id], k = S.homeyard.put[id] | 0, room = YD.room(id, yardCtx()); if (yardSince === null) yardSince = S.t;
  const T = S.t % 1440, late = T >= 18 * 60 || T < WAKE, verb = YARD_MANY[id] ? '铺' : it.kind === 'care' ? '放' : '装';
  const msg = k >= room ? `${it.name}买好了，${yardGate(id, k) || '等有地方了家人再弄'}` : late ? `${it.name}买好了，天黑了，家人夜里赶一赶，明天早上就能看到` : `${it.name}买好了，家人今天就去${verb}，最晚明天早上弄好`;
  log(msg); if (who === 'player') { say(msg); const P = YD.spotOf(id, Math.min(k, it.max - 1), yardPens()); if (P) panTo(P.x, P.y); }
}
const ROOF_NAMES = ['红', '绿', '蓝', '青灰'];
function yardDone(id, from, to, pre) {
  const it = YD.ITEM[id], P = YD.spotOf(id, from, yardPens()) || { x: DOOR.x, y: DOOR.y + 6 }, love = { awning: 5, vase: 3 }[id];
  const text = { gravel: `门口铺好了 ${to - from} 段石子小路（${to}/${it.max}），走在上面快一点`, flag: `小路换上了 ${to - from} 段石板（${to}/${it.max}）`,
    vegfence: `家门口的田边围上了 ${to - from} 段小栅栏（${to}/${it.max}）`, mailbox: '门口换上了新信箱', clothesline: '屋后拉好了晾衣绳，晴天就能晾衣服',
    flowerbed: '门前又砌好一个花坛', curtains: '窗上贴了窗花、挂上了窗帘，晚上透出暖光', lantern: '门口挂上了一盏灯笼，天黑就点上', roof: `房顶刷成了${ROOF_NAMES[to] || ''}色`,
    awning: '阿禾的小摊搭上了遮阳棚', scale: '小摊上换了一杆新秤', sign: '小摊边立起了木招牌', vase: '摊子上插了一瓶花', straw: '鸡舍里铺上了干稻草',
    catbed: '屋檐下放好了一个猫窝', doghouse: '院子里搭好了一个小狗屋', brush: '谷仓门口挂好了刷子，以后每天给一只动物梳梳毛',
    saltlick: `${(PENS[YD.LICK_PENS.filter(k => yardPens()[k])[from]] || {}).name || '棚子'}里放好了一块盐砖` }[id];
  if (love) { const fam = S.family; fam.love = Math.min(FAM.LOVE_MAX, fam.love + love); hearts(STALL.x, STALL.y - 4, 10); log(`${pre || ''}${text}，阿禾很高兴（好感 +${love}）`); } else log((pre || '') + text);
  if (id === 'roof' || id === 'curtains') { houseTierShown = ''; setHouseTier(S.eff.house || 0); }
  if ((id === 'gravel' || id === 'flag') && groundReady) for (let i = from; i < to; i++) { const q = YD.PIECES[i]; buildGroundBase([Math.min(q[0], q[2]) - 6, Math.min(q[1], q[3]) - 6, Math.max(q[0], q[2]) + 6, Math.max(q[1], q[3]) + 6]); }
  burst(P.x, P.y, 10, [Wd[4], '#fff2a8'], 8, 'wood'); if (YARD_ON) YA.sync(true, clothesOut());
}
function brushTask(a) {
  const v = AV.get(a.id); if (v) v.hold = 1; const at = v ? { x: v.x - 7, y: v.y + 1 } : animalSpot(a);
  return { kind: 'brush', label: `正在给${AN.KINDS[a.kind].name}梳毛`, to: at, tile: v || at, an: a, dur: 5, pose: 'pull', done: () => {
    if (v) { v.hold = 0; hearts(v.x, v.y); } if (S.homeyard.bday === S.day) return; S.homeyard.bday = S.day;
    a.h = Math.min(100, (a.h | 0) + 2); log(`用刷子给一只${AN.KINDS[a.kind].name}梳了梳毛，它心情好了一点`); } };
}
function yardNight() { // after worksNight: a hive that made honey tonight sometimes makes one more with flower beds by the door; a letter now and then
  const put = S.homeyard.put, W = S.works, p = YD.honeyExtra(put), HV = PW.HIVE || { every: 2, readyCap: 2 };
  if (p && W.hives.length) { const r = worksRng(0x7A3D); let n = 0; for (const h of W.hives) if (h.cd === HV.every && (h.ready | 0) < HV.readyCap && r() < p) { h.ready = (h.ready | 0) + 1; n++; }
    if (n) log(`门前的花坛招来了蜜蜂，蜂箱里多攒了 ${n} 罐蜜`); }
  if (put.mailbox) { const t = YD.letter(worksRng(0x3A11)(), S.day, { moved: !!S.family.moved, town: townOpen() }); if (t) log(`早上信箱里有一封信——${t}`); }
}
const decorRng = salt => mulberry32(((S.day * 2246822519) ^ salt ^ (S.decor.n * 40503)) >>> 0); // own streams, so the farm's RNG stays where it was
let dropRoll = 0; const dropRng = () => mulberry32(((S.day * 374761393) ^ (++dropRoll * 668265263) ^ 0xDEC0) >>> 0)();
function decorGain(id, how) { // -> true when it went into the storehouse
  if (!DC.CATALOG[id]) return false; const inv = S.decor.inv; if ((inv[id] | 0) >= DC.INV_MAX) return false;
  inv[id] = (inv[id] | 0) + 1; BOOK.record(S.codex, BOOK.keyDecor ? BOOK.keyDecor(id) : 'decor:' + id, S.day);
  if (how) log(how); return true;
}
function decorDrop(src, x, y) { // a chance piece from chopping or fishing
  const id = DC.rollDrop(src, dropRng); if (!id) return null;
  const name = DC.CATALOG[id].name, how = { chop: `木头里刻出了一个${name}`, sea: `鱼线上挂着一个${name}`, pond: `钩上来一个${name}` }[src];
  if (decorGain(id, `${how}，家人会找地方摆上`)) { popText(x, y, 24, name, '#fff2a8'); burst(x, y, 16, ['#fff2a8', '#ffffff'], 8, 'spark'); }
  return id;
}
function decorKeepGiant(type, x, y) { const id = DC.GIANT_KEEP[type]; if (!id || S.decor.got[id]) return; S.decor.got[id] = 1;
  if (decorGain(id, `留下了一座${DC.CATALOG[id].name}，家人会找地方摆上`)) popText(x, y, 30, '纪念', '#fff2a8'); }
function decorBookCheck() { // a full page of the book unlocks one piece, once
  const groups = BOOK.groups();
  for (const u of DC.SET_UNLOCK) { if (S.decor.got[u.id]) continue; const g = groups.find(q => q.id === u.group); if (!g) continue;
    if (DC.pageDone(g.items.map(it => it.key), k => BOOK.has(S.codex, k))) { S.decor.got[u.id] = 1; decorGain(u.id, `图鉴「${g.name}」页集满了，得到一座${DC.CATALOG[u.id].name}`); } }
}
// ---- where something may stand ----
const ownGround = (x, y) => { const a = WD.areaAt(x, y); if (a === 'home' || (a && S.eff.regions.includes(a))) return true; const p = PL.plotAt(x, y); return !!(p && S.plots[p.id]); };
const workBox = (x, y) => [x - 8, y - 6, x + 8, y + 10];            // the building and the ground in front of its door
const workBlock = (x, y) => [x - 7, y - 5, x + 7, y + 4];
function thingBox(what, id, x, y) { if (what === 'work') return workBox(x, y); if (what === 'home') return [x - 37, y - 9, x + 37, y + 13]; // v5.9.0: the new house's yard (either way round)
  if (what === 'hive') return DC.boxOf(x, y, [3.5, 3.5]); return DC.boxOf(x, y, DC.CATALOG[id].foot); }
function thingBlock(what, id, x, y) { if (what === 'work') return workBlock(x, y); if (what === 'decor' && DC.CATALOG[id].block) return DC.boxOf(x, y, DC.CATALOG[id].block); return null; }
const boxHit = (a, b, pad = 0) => a[0] - pad < b[2] && a[2] + pad > b[0] && a[1] - pad < b[3] && a[3] + pad > b[1];
const ptIn = (p, b, pad = 0) => p.x > b[0] - pad && p.x < b[2] + pad && p.y > b[1] - pad && p.y < b[3] + pad;
function entrySpots() { const L = NAV.LAYOUT, out = [L.DOOR, L.BARN_DOOR, L.WELL_SPOT, L.STALL_SPOT, L.BENCH_SPOT, L.POND_STAND];
  for (const k of AN.PEN_IDS) if (S.eff[k]) out.push(PENS[k].door, troughSpot(k));
  for (const r of WD.REGIONS) if (S.eff.regions.includes(r.id)) out.push(r.gate);
  for (const id of Object.keys(S.plots)) { const p = PL.plot(id); if (p && p.gate) out.push(p.gate); }
  for (const id of PW.WORK_IDS) if (S.works.works[id] && S.works.works[id].at) out.push(PWA.doorOf(id));
  return out; }
// skip: { what, ref } of the thing being moved (it does not collide with itself)
function placeOk(x, y, what, id, skip, self, slot) { // self: the order being carried out (it does not collide with itself); slot (v5.10.3): a planned spot (slots.js) may stand on the yard's packed dirt and close to the house, never on a walk path or in a pen
  x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; const box = thingBox(what, id, x, y), res = (ok, why) => ({ ok, why, box, x, y });
  if (!slot && what === 'decor' && SLT && id && SLT.spotsFor(id, slotHomes()).some(s => Math.abs(s.x - x) < 0.6 && Math.abs(s.y - y) < 0.6)) slot = true; // v5.10.3: a planned spot follows its own rules wherever it is checked (the player's click, the hover, the move tool)
  const pts = [{ x, y }, { x: box[0], y: box[1] }, { x: box[2], y: box[1] }, { x: box[0], y: box[3] }, { x: box[2], y: box[3] }];
  if (!pts.every(p => ownGround(p.x, p.y))) return res(false, '这里还没解锁');
  if (HM && S.home.houses.some(h => { const L = HM.layout(h); return slot ? boxHit(box, L.block, 1.5) || boxHit(box, L.coopBlock, 1.5) || L.tiles.some(t => boxHit(box, [t.x - 1, t.y - 1, t.x + 9, t.y + 9])) : boxHit(box, L.foot); })) return res(false, '这里是新房子的院子和小田'); // v5.9.0
  const zone = thingZone(what, skip); if (zone && !pts.every(p => zone.ok(p.x, p.y))) return res(false, zone.why);
  if (slot) { if (!pts.every(p => groundAt(p.x, p.y)[1] !== 'water' && pathD(p.x, p.y) > 4.3)) return res(false, '不能压在路上或水里');
    if (AN.PEN_IDS.some(k => S.eff[k] && PENS[k].roam && boxHit(box, PENS[k].roam, 2))) return res(false, '这里是动物的圈'); }
  else if (!zone && !pts.every(p => groundAt(p.x, p.y)[1] === 'grass')) return res(false, '只能放在草地上，不能压在路、水边或桥上');
  const g = ensureNav(), cur = skip && skip.what !== 'spr' ? thingNow({ op: 'move', what: skip.what, ref: skip.ref }) : null;
  const own = cur ? thingBlock(skip.what, skip.what === 'decor' ? decorById(skip.ref) : id, cur.x, cur.y) : null;
  if (zone) { // inside its own plot the yard's packed dirt is fine; only fences, water, buildings and the plot's gate are out
    const mine = new Set(own ? DC.cellsOf(g, own).map(([i, j]) => j * g.w + i) : []), pl = PL.plotAt(x, y);
    if (DC.cellsOf(g, box).some(([i, j]) => i < 0 || j < 0 || i >= g.w || j >= g.h || (!g.cost[j * g.w + i] && !mine.has(j * g.w + i))) || (pl && pl.gate && ptIn(pl.gate, box, 4))) return res(false, '这里挡路了（篱笆、门口或别的东西）');
  } else if (slot) { const mine = new Set(own ? DC.cellsOf(g, own).map(([i, j]) => j * g.w + i) : []);
    if (DC.cellsOf(g, box).some(([i, j]) => i < 0 || j < 0 || i >= g.w || j >= g.h || (!g.cost[j * g.w + i] && !mine.has(j * g.w + i)))) return res(false, '这里挡路了（篱笆、门口或别的东西）');
  } else if (!DC.onGrass(g, box, NAV.GRASS, own)) return res(false, '这里挡路了（路、门口、篱笆或别的东西）');
  if (tiles.some(t => (t.open || !PL.isPlotId(t.f)) && ptIn(t, box, 5))) return res(false, '不能放在田里');
  if (!slot && yard.some(c => ptIn(c, box, 3))) return res(false, '这里有杂物，等家人收拾完再放'); // v5.10.3: a planned spot does not wait for the weeds
  const hb = NAV.houseBox(S.eff.house || 0); if (boxHit(box, [hb.x0, hb.y0, hb.x1, hb.y1], slot ? 1.5 : 8)) return res(false, '离房子太近');
  if ([[BARN, 22], [STALL, 18], [WELL, 10]].some(([b, d]) => ptIn(b, box, d))) return res(false, '离房子太近');
  if (AN.PEN_IDS.some(k => (!PENS[k].second || S.eff[k]) && (ptIn(PENS[k].bld, box, 16) || ptIn(PENS[k].trough, box, 8)))) return res(false, '这里留给动物的棚子');
  if (S.trees.some(t => ptIn(t, box, 6)) || S.orders.some(o => o.type === 'plant' && ptIn(o, box, 8))) return res(false, '离树太近');
  const me = (w, r) => skip && skip.what === w && skip.ref === r;
  for (const p of S.decor.placed) if (!me('decor', p.u) && boxHit(box, DC.boxOf(p.x, p.y, DC.CATALOG[p.id].foot), 1)) return res(false, '这里已经有东西了');
  for (const q of S.decor.orders) if (q !== self && !(skip && q.what === skip.what && q.ref === skip.ref) && boxHit(box, thingBox(q.what, q.id || (q.what === 'decor' ? decorById(q.ref) : null) || 'flowerpot', q.x, q.y), 1)) return res(false, '这里已经约好要放别的了');
  for (const wid of PW.WORK_IDS) { const w = S.works.works[wid]; if (!w || !w.at || me('work', wid)) continue; const p = PW.workPos(w); if (boxHit(box, workBox(p.x, p.y), 1)) return res(false, '这里已经有东西了'); }
  const hs = PWA.hiveSpots(); for (let i = 0; i < hs.length; i++) if (hs[i] && !me('hive', i) && ptIn(hs[i], box, 4)) return res(false, '这里已经有东西了');
  for (let i = 0; i < S.works.sprinklers.length; i++) if (!me('spr', i) && ptIn(S.works.sprinklers[i], box, 3)) return res(false, '这里已经有东西了');
  for (const p of props) { if (p.region || p.decor || p.house || p.tree || p.work) continue; if (ptIn(p, box, p.big ? 10 : 2)) return res(false, '这里已经有东西了'); }
  const blk = thingBlock(what, id, x, y);
  if (blk && !DC.keepsPaths(g, blk, entrySpots(), NAV.LAYOUT.DOOR)) return res(false, '放在这里会把路堵上');
  return res(true, null);
}
const workYardAt = (x, y) => { const p = PL.plotAt(x, y); return p && S.plots[p.id] && S.plots[p.id].mod === 'workshop' ? p.id : null; }; // v5.10.12
// things tied to a plot's use stay inside it: a workshop in its 工坊院, a hive in its 花甸 (or on 果园坡 for the orchard pair)
function thingZone(what, skip) {
  const inPlot = (id, mod) => { const p = PL.plot(id), st = S.plots[id]; return p && st && st.mod === mod ? (x, y) => WD.inRect(x, y, p.rect) : () => false; };
  if (what === 'work' && skip) { const w = S.works.works[skip.ref]; if (!w || !w.at) return null; // v5.10.12: any 工坊院 with a free slot (each holds 3)
    return { ok: (x, y) => { const id = workYardAt(x, y); return !!id && (id === w.at || PW.slotIn(S.works.works, id, skip.ref) >= 0); }, why: `${PW.WORKS[skip.ref].name}只能挪到工坊院里（哪一块都行，每块最多 3 座）` }; }
  if (what === 'hive' && skip) { const h = S.works.hives[skip.ref]; if (!h) return null;
    if (h.at === 'orchard') return { ok: (x, y) => WD.areaAt(x, y) === 'orchard', why: '这箱蜂只能在果园坡里挪' };
    return { ok: inPlot(h.at, 'meadow'), why: '蜂箱只能挪到它所在的花甸里' }; }
  return null;
}
const decorById = u => { const p = S.decor.placed.find(q => q.u === u); return p ? p.id : null; };
// the family's own choice: free grass near the house (the party area prefers a playground plot), spaced out a little
let autoCache = { key: '', spot: null };
// v5.10.3: everything but the party area goes to the first free spot of its kind (slots.js); none free: it waits in the storehouse
const slotHomes = () => (HM ? S.home.houses.map(h => ({ L: HM.layout(h), m: h.m })) : []);
function slotSpot(id, skipU) {
  for (const s of SLT.spotsFor(id, slotHomes())) { if (!ownGround(s.x, s.y)) continue;
    const r = placeOk(s.x, s.y, 'decor', id, skipU ? { what: 'decor', ref: skipU } : null, null, true); if (r.ok) return { x: r.x, y: r.y, area: s.area }; }
  return null;
}
function autoSpot(id) {
  const key = [navVer, S.decor.placed.length, S.decor.orders.length, S.day, id, Math.floor(S.t % 1440 / 120)].join('|'); if (autoCache.key === key) return autoCache.spot;
  if (SLT && id !== 'party') { const spot = slotSpot(id); autoCache = { key, spot }; return spot; }
  const anchors = [];
  if (id === 'party') for (const pid of Object.keys(S.plots)) if (S.plots[pid].mod === 'playground') { const r = PL.plot(pid).rect; anchors.push({ c: { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }, r: 40 }); }
  anchors.push({ c: { x: DOOR.x + 24, y: DOOR.y + 30 }, r: 120 });
  if (id === 'party') anchors.push({ c: { x: DOOR.x, y: DOOR.y }, r: 200 }); // v5.11.0.15: further out, for room to spread out
  let spot = null;
  let best = null, tried = 0; // v5.11.0.15: the party area looks a little further for grass to spread out on (all three lawn corners)
  for (const a of anchors) { for (const s of DC.ringSpots(a.c, a.r, 6)) {
      if (S.decor.placed.some(p => Math.hypot(p.x - s.x, p.y - s.y) < (DC.CATALOG[p.id].big || id === 'party' ? 24 : 12))) continue;
      const r = placeOk(s.x, s.y, 'decor', id, null); if (!r.ok) continue;
      if (id !== 'party') { spot = { x: r.x, y: r.y }; break; }
      const n = lawnAt({ x: r.x, y: r.y }).lawn.length; if (!best || n > best.n) best = { x: r.x, y: r.y, n };
      if (n >= DC.LAWN.length || ++tried >= 90) break; }
    if (spot || (best && (best.n >= DC.LAWN.length || tried >= 90))) break; }
  if (!spot && best) spot = { x: best.x, y: best.y };
  autoCache = { key, spot }; return spot;
}
// ---- orders and the carrying jobs ----
const BUILD_LIKE = q => q.what === 'work' || q.what === 'home' || (q.what === 'decor' && (q.id || decorById(q.ref)) === 'party');
function orderThing(op, what, ref, id, x, y, mine) {
  const D = S.decor; D.orders = D.orders.filter(q => !(op === 'move' && q.op === 'move' && q.what === what && q.ref === ref));
  if (D.orders.length >= DC.ORDERS_MAX) return { ok: false, why: '要搬的东西太多了，先等家人搬完一些' };
  const q = { u: D.n++, op, what, ref, id, x, y, mine: mine ? 1 : 0 }; D.orders.push(q); autoCache.key = ''; return { ok: true, q };
}
function thingNow(q) { // where the thing is now (null: gone)
  if (q.op === 'place') return BARN_DOOR;
  if (q.what === 'decor') return S.decor.placed.find(p => p.u === q.ref) || null;
  if (q.what === 'work') { const w = S.works.works[q.ref]; return w && w.at ? PW.workPos(w) : null; }
  if (q.what === 'hive') return PWA.hiveSpots()[q.ref] || null;
  if (q.what === 'spr') return S.works.sprinklers[q.ref] || null;
  if (q.what === 'home') return (HM && S.home.houses[q.ref]) || null;
  return null; }
function thingName(q) { if (q.what === 'home') return '新房子'; if (q.what === 'work') return PW.WORKS[q.ref].name; if (q.what === 'hive') return '蜂箱'; if (q.what === 'spr') return '浇水器'; return DC.CATALOG[q.id || decorById(q.ref)].name; }
function setCarried(q, on) { if (q.what === 'hive' && S.works.hives[q.ref]) S.works.hives[q.ref]._c = on ? 1 : 0; if (q.what === 'spr' && S.works.sprinklers[q.ref]) { S.works.sprinklers[q.ref]._c = on ? 1 : 0; SPR_COVER = null; } }
function dropOrder(q) { S.decor.orders = S.decor.orders.filter(o => o !== q); setCarried(q, false); for (const a of actors()) if (a._carry === q.u) a._carry = null; autoCache.key = ''; }
function settle(q) { // put it down at q.x, q.y (checked again: the ground may have changed since the click)
  const id = q.id || (q.what === 'decor' ? decorById(q.ref) : null), skip = q.op === 'move' ? { what: q.what, ref: q.ref } : null;
  if (q.op === 'store') return storeDone(q, id); // v5.11.0.2
  if (q.what === 'home') return homeMoveDone(q);
  let r = q.what === 'spr' ? sprinklerSpot(q.x, q.y, q.ref) : placeOk(q.x, q.y, q.what, id, skip, q, !q.mine && q.what === 'decor' && SLT && id !== 'party');
  if (!r.ok) { dropOrder(q); log(`${thingName(q)}没法放到那里（${r.why}），留在原处`); return false; }
  const x = q.what === 'spr' ? Math.round(q.x * 10) / 10 : r.x, y = q.what === 'spr' ? Math.round(q.y * 10) / 10 : r.y;
  if (q.op === 'place') { if (!((S.decor.inv[id] | 0) > 0)) { dropOrder(q); return false; } if (q.mine && keptOf(id)) { S.decor.kept[id]--; if (!S.decor.kept[id]) delete S.decor.kept[id]; } S.decor.inv[id]--; if (!S.decor.inv[id]) delete S.decor.inv[id];
    S.decor.placed.push({ u: S.decor.n++, id, x, y, d: S.day }); if (id === 'party') S.decor.party.at = S.day; }
  else if (q.what === 'decor') { const p = S.decor.placed.find(o => o.u === q.ref); if (p) { p.x = x; p.y = y; if (p.id === 'party') S.decor.party.at = Math.max(S.decor.party.at, 1); } }
  else if (q.what === 'work') { const w = S.works.works[q.ref], to = workYardAt(x, y); // v5.10.12: it may go to another 工坊院 (production and goods go with it)
    if (to && to !== w.at) { const sl = PW.slotIn(S.works.works, to, q.ref); if (sl < 0) { dropOrder(q); log(`${thingName(q)}没法挪过去（那块工坊院满了），留在原处`); return false; }
      log(`${thingName(q)}从${PL.plot(w.at).name}搬到了${PL.plot(to).name}，里面的原料和成品一起带过去了`); w.at = to; w.slot = sl; }
    w.x = x; w.y = y; }
  else if (q.what === 'hive') { const h = S.works.hives[q.ref]; h.x = x; h.y = y; }
  else if (q.what === 'spr') { const s = S.works.sprinklers[q.ref]; s.x = x; s.y = y; SPR_COVER = null; }
  dropOrder(q); markNavDirty(); DA.sync(true); PWA.sync(true); return true;
}
// v5.11.0.2 收回: the piece goes back to the storehouse and is kept there (the family does not set kept pieces down again by themselves)
const keptOf = id => Math.min((S.decor.kept && S.decor.kept[id]) | 0, (S.decor.inv[id] | 0));
function storeDone(q, id) { const i = S.decor.placed.findIndex(p => p.u === q.ref); if (i < 0 || !id) { dropOrder(q); return false; }
  S.decor.placed.splice(i, 1); S.decor.inv[id] = (S.decor.inv[id] | 0) + 1; if (!S.decor.kept) S.decor.kept = {}; S.decor.kept[id] = (S.decor.kept[id] | 0) + 1;
  dropOrder(q); markNavDirty(); DA.sync(true); return true; }
function carryPickTask(q) { const at = thingNow(q);
  return { kind: 'carry', key: 'dc:' + q.u, label: q.op === 'place' ? `正在从仓库拿${thingName(q)}` : `正在去搬${thingName(q)}`, to: { x: at.x - 5, y: at.y + 3 }, dur: 3, pose: 'pull', done: () => {
    if (!S.decor.orders.includes(q) || !thingNow(q)) return; q.st = 1; F._carry = q.u; setCarried(q, true); DA.sync(true); PWA.sync(true); } };
}
function carryDropTask(q) {
  return { kind: 'carry', key: 'dc2:' + q.u, label: `正在把${thingName(q)}搬过去`, to: { x: q.x - 5, y: q.y + 3 }, dur: 4, pose: 'pull', done: () => {
    if (!S.decor.orders.includes(q)) { F._carry = null; return; } const name = thingName(q), place = q.op === 'place', who = F === FARMER ? '' : F.name;
    if (settle(q)) { burst(q.x, q.y, 10, [Wd[3], G[4], '#fff2a8'], 8, 'leaf'); log(`${who}${q.op === 'store' ? '把' + name + '收回了仓库' : place ? '把' + name + '摆好了' : '把' + name + '搬到了新地方'}`); } F._carry = null; } };
}
function buildTask(q) { // workshops and the party area are rebuilt where they go (nobody carries a house)
  return { kind: 'carry', key: 'dc:' + q.u, label: q.op === 'place' ? `正在搭${thingName(q)}` : `正在把${thingName(q)}挪过去`, to: { x: q.x - 9, y: q.y + 6 }, dur: q.what === 'home' ? HM.HOUSE.build : q.what === 'work' ? 30 : 20, fx: 'wood', pose: 'hoe', done: () => {
    if (!S.decor.orders.includes(q) || !thingNow(q)) return; const name = thingName(q), place = q.op === 'place', who = F === FARMER ? '' : F.name;
    if (settle(q)) { burst(q.x, q.y, 24, [Wd[3], Wd[4], '#fff2a8'], 16, 'wood'); log(`${who}${place ? '搭好了' + name : '把' + name + '挪到了新地方'}`); } } };
}
function decorBoard(post, T) {
  const D = S.decor; if (!D.orders.some(q => !q.mine)) dcSince = null; else if (dcSince === null) dcSince = S.t; // v5.10.11.1: the family's own placing climbs while it waits
  if (F._carry) { const q = D.orders.find(o => o.u === F._carry); if (q) post('carry', 99, { x: q.x - 5, y: q.y + 3 }, () => carryDropTask(q), 'dc2:' + q.u, 'yard'); else F._carry = null; }
  if (T >= 18 * 60) return;
  // the family sets new pieces down by themselves, one at a time
  if (!D.orders.some(q => !q.mine)) for (const id of Object.keys(D.inv)) { const want = (D.inv[id] | 0) - keptOf(id) - D.orders.filter(q => q.op === 'place' && q.id === id).length; if (want <= 0) continue;
    const sp = autoSpot(id); if (sp) { orderThing('place', 'decor', null, id, sp.x, sp.y, false); break; } }
  for (const q of D.orders) { if (q.st === 1 || !thingNow(q)) continue;
    const base = q.mine ? 64 : 40 + WAIT_BOOST(dcSince === null ? S.t : dcSince);
    if (BUILD_LIKE(q)) post('carry', base, { x: q.x - 9, y: q.y + 6 }, () => buildTask(q), 'dc:' + q.u, 'yard');
    else { const at = thingNow(q); post('carry', base, { x: at.x - 5, y: at.y + 3 }, () => carryPickTask(q), 'dc:' + q.u, 'yard'); } }
}
// ---- the party: an evening now and then (decided in the morning), the family and maybe a guest or two from the next town ----
const partyArea = () => S.decor.placed.find(p => p.id === 'party') || null;
const partyTonight = () => S.decor.party.tonight === S.day && !!partyArea();
function partyMorning() {
  const pa = S.decor.party, area = partyArea(); if (!area) { pa.tonight = 0; return; }
  if (FV && S.town && S.town.hall && FV.isDay(S.town.hall, S.day)) { pa.tonight = 0; return; } // v5.10.11: the family goes to the town feast
  const r = decorRng(0x9A7), go = DC.partyTonight({ day: S.day, placedDay: pa.at || area.d || 0, last: pa.last, special: DC.special(S.day, S.family) }, r);
  pa.tonight = go ? S.day : 0; pa.guests = go ? DC.guestCount(r) : 0; partyBegun = 0;
}
let partyBegun = 0; const GUESTS = [];
const GUEST_LOOK = ['guestA', 'guestB'], GUEST_NAME = ['镇上的木匠阿松', '镇上的面包师小桃'];
const EAST_IN = [{ x: 224, y: 66 }, { x: 216, y: 66 }, { x: 176, y: 66 }, { x: 176, y: 54 }, { x: 158, y: 54 }];
// ---- v5.11.0.15: everyone at the party gets their own place (decor.js partyPlan): the table, and on free grass next to the
// area a dance floor, a picnic rug and a ball lawn for the children. Who came is kept in memory in the order they turned up
// (nothing is saved); every hour they swap round, and while they stand there they eat, toast, dance, chat or play (drawn only).
const partyKid = a => !!(a && /^(child|play|school|helper)$/.test(a.role || ''));
const partyKeyOf = a => (a === FARMER ? 'farmer' : String(a.id));
let partyReg = { day: -1, keys: [], kid: {} }, partyLawnC = { key: '', lawn: [], extra: [] }, partyPlanC = { key: '', plan: {} };
function partyLawnNow() {
  const a = partyArea(); if (!a) return { lawn: [], extra: [] };
  ensureNav(); const wt = wedNow(), key = [S.day, a.x, a.y, navVer, wt ? wt.kid : ''].join('|'); if (partyLawnC.key === key) return partyLawnC;
  partyLawnC = Object.assign({ key }, lawnAt(a, !!wt)); // v5.11.0.21: + wed
  partyPlanC.key = ''; return partyLawnC;
}
let lawnSeen = { v: -1, seen: null };
function lawnAt(a, wedFirst) { // the lawn corners an area at a would get (also asked by autoSpot, before the area is put down); v5.11.0.21 wedFirst: the wedding's aisle and rows first
  const g = ensureNav(); if (lawnSeen.v !== navVer) lawnSeen = { v: navVer, seen: DC.reach(g, NAV.LAYOUT.DOOR, []) }; const seen = lawnSeen.seen;
  const seat = DC.partySeats(a)[0], near = c => { const r = pathTo(seat, c); return !!r.reached && r.length <= Math.hypot(c.x - seat.x, c.y - seat.y) * 1.6 + 12; }; // a short walk from the table (not round a fence)
  const why = {}, no = r => { why[r] = (why[r] | 0) + 1; return false; }, by = o => Math.abs(o.x - a.x) < 80 && Math.abs(o.y - a.y) < 80; // only what is near (autoSpot asks this for many spots)
  const nTiles = tiles.filter(t => (t.open || t.tilled || t.crop) && by(t)), nTrees = S.trees.filter(by), nYard = yard.filter(by), nProps = props.filter(p => !p.decor && !p.region && by(p));
  let free = (b, c) => { for (const [i, j] of DC.cellsOf(g, b)) { if (i < 0 || j < 0 || i >= g.w || j >= g.h) return no('edge'); const k = j * g.w + i; if (g.cost[k] !== NAV.GRASS || !seen[k]) return no('ground'); }
    if (![[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]].every(([x, y]) => ownGround(x, y))) return no('locked');
    const under = (t, up, side) => t.x > b[0] - side && t.x < b[2] + side && t.y > b[1] - 3 && t.y < b[3] + up; // a tree (or stump) south of the box would stand over it
    if (nTiles.some(t => ptIn(t, b, 4)) || nTrees.some(t => t.stage === 'tree' ? under(t, 28, 6) : under(t, 6, 3.5)) || nYard.some(c => ptIn(c, b, 2))) return no('field/tree');
    const hits = p => { const q = p.m && Math.abs(Math.sin(p.rot || 0)) > 0.7, rx = p.m ? (q ? p.m.d : p.m.w) / 4 : 2, ry = p.m ? (q ? p.m.w : p.m.d) / 4 : 2, up = p.m ? p.m.h / 3 : 2; return p.x + rx > b[0] - 1 && p.x - rx < b[2] + 1 && p.y + ry > b[1] - 1 && p.y - ry < b[3] + up; }; // its own size, and what it hides behind it
    if (nProps.some(p => p.tree ? under(p, 28, 6) : hits(p))) return no('prop'); // under a canopy, against a building, on the slide or the swings
    for (const p of S.decor.placed) if (p.id !== 'party' && boxHit(b, DC.boxOf(p.x, p.y, DC.CATALOG[p.id].foot))) return no('decor');
    for (const wid of PW.WORK_IDS) { const w = S.works.works[wid]; if (w && w.at) { const q = PW.workPos(w); if (boxHit(b, workBox(q.x, q.y), 1)) return no('work'); } }
    if (HM && S.home.houses.some(h => boxHit(b, HM.layout(h).foot))) return no('house');
    if (AN.PEN_IDS.some(k => S.eff[k] && PENS[k].roam && boxHit(b, PENS[k].roam, 2))) return no('pen');
    if (c && !near(c)) return no('far');
    return true; };
  const wed = wedFirst ? DC.weddingLayout(a, free, []) : null, wb = wed ? wed.boxes : [], free0 = free; // v5.11.0.21: on a wedding evening the corners fit round the ceremony
  free = wb.length ? (b, c) => !wb.some(w => boxHit(b, w)) && free0(b, c) : free0;
  const lawn = DC.partyLawn(a, free), extra = [];
  for (const [dx, dy] of [[-16, 11], [16, 11], [-16, -11], [16, -11], [-8, 12.5], [8, 12.5], [0, 12.5], [-8, -12.5], [8, -12.5], [0, -12.5], [-17, 0], [17, 0]]) {
    const x = a.x + dx, y = a.y + dy; if (free([x - 2, y - 2, x + 2, y + 2], { x, y }) && !DC.partySeats(a).concat(extra, lawn.flatMap(l => l.spots)).some(p => Math.hypot(x - p.x, y - p.y) < 7) && !lawn.some(l => ptIn({ x, y }, l.box, 3))) extra.push({ x, y }); }
  // A full household and friends can outgrow a small lawn. Spare places remain on reachable grass, at least 7 units apart.
  const all = DC.partySeats(a).concat(lawn.flatMap(l => l.spots));
  for (const p of DC.ringSpots(a, 60, 7)) { if (extra.length >= 48) break;
    if (all.concat(extra).some(q => Math.hypot(q.x - p.x, q.y - p.y) < 7) || ptIn(p, DC.boxOf(a.x, a.y, DC.CATALOG.party.foot), 2) || lawn.some(l => ptIn(p, l.box, 3))) continue;
    if (free([p.x - 2, p.y - 2, p.x + 2, p.y + 2], p)) extra.push({ x: p.x, y: p.y }); }
  return { lawn, extra, why, wed }; // why: how often each reason ruled a spot out (for the shots); wed: v5.11.0.21 the ceremony's layout (wedding evenings)
}
function partyPlanNow() {
  const area = partyArea(); if (!area) return {};
  if (partyReg.day !== S.day) partyReg = { day: S.day, keys: [], kid: {} };
  const L = partyLawnNow(), T = S.t % 1440, W = L.wed && DC.wedOn(T) ? L.wed : null, couple = L.wed ? wedCouple() : null;
  const ph = W ? 'w' + DC.wedPhase(T) : DC.partyPhase(T), key = [L.key, ph, partyReg.keys.join(',')].join('|');
  if (partyPlanC.key !== key) { // v5.11.0.21: a wedding evening opens with the ceremony; afterwards the couple sit at the table first
    // v5.11.0.23: the family (farmer, members, spouses) sit before town guests, so a cramped ceremony still has 阿禾 in the rows
    const fam = new Set(['farmer'].concat(S.members.map(m => m.id), (typeof SPOUSES !== 'undefined' ? SPOUSES : []).map(s => s.id)));
    const keys = couple ? couple.filter(k => partyReg.keys.includes(k)).concat(partyReg.keys.filter(k => !couple.includes(k) && fam.has(k)), partyReg.keys.filter(k => !couple.includes(k) && !fam.has(k))) : partyReg.keys, roster = keys.map(k => ({ key: k, kid: partyReg.kid[k] }));
    partyPlanC = { key, plan: W ? DC.weddingPlan(W, roster, couple, DC.wedPhase(T), L.extra) : DC.partyPlan(area, L.lawn, roster, ph, L.extra) }; }
  return partyPlanC.plan;
}
function partySpot(a, key) { // a: the actor or guest; their place for this hour of the party
  const area = partyArea(); if (!area) return null; key = key || partyKeyOf(a);
  if (partyReg.day !== S.day) partyReg = { day: S.day, keys: [], kid: {} };
  if (!partyReg.keys.includes(key)) { partyReg.keys.push(key); partyReg.kid[key] = partyKid(a); }
  const p = partyPlanNow()[key]; if (p) return { x: p.x, y: p.y };
  // v5.11.0.23: a missing place used to make spouseTask return null and crash the frame loop
  const i = Math.max(0, partyReg.keys.indexOf(key));
  return { x: area.x + 12 + (i % 4) * 3, y: area.y + 10 + Math.floor(i / 4) * 3 };
}
const partyDur = T => Math.max(3, Math.min(30, (wedCer() ? DC.wedPhaseEnd(T) : DC.phaseEnd(T)) - T, DC.PARTY.to - T)); // v5.11.0.21: the ceremony's beats too
function partyIndex(a) { return a === FARMER ? 0 : 1 + Math.max(0, S.members.indexOf(a)); }
function sunsetTask() { // v5.10.8: once the deck is up, the family sits and watches the sea 17:00–19:00
  if (!IN || !S.inn || !IN.deckUp(S.inn) || !IN.isSunset(S.t) || F.away || F.sleeping) return null;
  const T = ((S.t % 1440) + 1440) % 1440;
  if (partyTonight() && DC.partyOn(T)) return null;
  const L = IN.resortLayout(); if (!L || !L.deck || !L.deck.sit.length) return null;
  const i = Math.max(0, actors().indexOf(F));
  const seat = L.deck.sit[(i + (S.day | 0)) % L.deck.sit.length];
  return { kind: 'sunset', label: '去观景台看落日', to: { x: seat.x + (i % 2 ? 0.6 : -0.6), y: seat.y }, dur: Math.max(8, Math.min(22, IN.SUNSET.to - T)), rest: true };
}
function partyTask() { // chooseTask asks first: on a party evening everyone who is around comes over
  const T = S.t % 1440, early = T < DC.PARTY.from && DC.wedOn(T) && (wedCouple() || []).includes(F.id); // v5.11.0.21: the couple go over first, to wait at the end of the aisle
  if (!partyTonight() || !(DC.partyOn(T) || early) || F.away || F.sleeping) return null;
  const seat = partySpot(F); if (!seat) return null; // v5.11.0.15: their own place this hour (was one of 10 seats a few px apart)
  return { kind: 'party', label: '在派对区和大家聚会', to: { x: seat.x, y: seat.y }, dur: partyDur(T), rest: true };
}
function guestStep(g, dm) {
  if (!g.pts.length) return;
  const t = g.pts[0], dx = t.x - g.x, dy = t.y - g.y, d = Math.hypot(dx, dy);
  if (d < 0.5) { g.pts.shift(); g.moving = !!g.pts.length; return; }
  const st = Math.min(d, WALK * (g.fast ? 1.1 : 0.85) * aveWalk(g.x, g.y) * dm); g.x += dx / d * st; g.y += dy / d * st; g.fx = dx / d; g.fy = dy / d; g.moving = true; g.walkPhase = (g.walkPhase || 0) + st;
}
let guestsOut = 0; // v5.8.0: the day the town guests set out (they walk over from their houses, so they leave before the party starts)
const GUEST_WALK = 120; // v5.11.0: the town is farther east (was 90)
// v5.10.3: an old save's pieces were set down anywhere; once, on load, they are put on their kinds' spots (counts kept: what does not fit goes to the storehouse)
const DECOR_LAYOUT = 2; // v5.10.4: wider lamp spacing along the field and by 阿禾's stall (1 was the first tidy-up)
function decorRelayout() {
  if ((S.decorLayout | 0) >= DECOR_LAYOUT || !SLT) return null; S.decorLayout = DECOR_LAYOUT; ensureNav();
  const D = S.decor, keep = [], move = [], before = D.placed.length + Object.values(D.inv).reduce((a, b) => a + b, 0);
  D.orders = D.orders.filter(q => q.what !== 'decor' || q.op !== 'move'); for (const a of actors()) a._carry = null;
  for (const p of D.placed) (p.id === 'party' ? keep : move).push(p);
  D.placed = keep.slice(); markNavDirty(); ensureNav(); let put = 0, stored = 0;
  for (const p of SLT.relayoutOrder(move)) { const sp = slotSpot(p.id);
    if (sp) { D.placed.push(Object.assign({}, p, { x: sp.x, y: sp.y })); put++; } else { D.inv[p.id] = (D.inv[p.id] | 0) + 1; stored++; } }
  const after = D.placed.length + Object.values(D.inv).reduce((a, b) => a + b, 0);
  markNavDirty(); autoCache.key = ''; if (DECOR_ON) DA.sync(true);
  if (move.length) log(`家里把院子里的装饰重新摆了一遍：灯沿着路和房前排开，花盆放到门口、窗下和池塘边${stored ? `，放不下的 ${stored} 件先收进仓库` : ''}`);
  return { before, after, put, stored };
}
function decorTick(dm) {
  if ((S.decorLayout | 0) < DECOR_LAYOUT) decorRelayout();
  const T = S.t % 1440, early = townOpen() ? GUEST_WALK : 0;
  if (early && partyTonight() && T >= DC.PARTY.from - early && T < DC.PARTY.from && guestsOut !== S.day && !(WX && WX.isRaining(S.weather, S.day, S.t))) { guestsOut = S.day;
    for (let i = 0; i < S.decor.party.guests; i++) { const seat = partySpot({ id: 'g' + i }), h = TN.BY_ID[i ? 'h4' : 'h3'].door; if (!seat) continue;
      GUESTS.push({ id: 'g' + i, look: GUEST_LOOK[i], x: h.x, y: h.y, fx: 0, fy: 1, pts: routeVia(h, seat).concat([seat]), moving: true, leaving: false, home: h, fast: 1 }); }
    if (S.decor.party.guests) log(`${GUEST_NAME.slice(0, S.decor.party.guests).map(n => n.replace('镇上的', '')).join('和')}从镇上动身，来参加今晚的派对`); }
  if (partyTonight() && T >= DC.PARTY.from && T < DC.PARTY.to && partyBegun !== S.day) { partyBegun = S.day;
    if (WX && WX.isRaining(S.weather, S.day, S.t)) { S.decor.party.tonight = 0; log('下雨了，派对改到下回'); }
    else { const n = S.decor.party.guests, a = partyArea(); S.decor.party.last = S.day;
      log(n ? `傍晚一家人在派对区聚在一起，${GUEST_NAME.slice(0, n).join('和')}也来做客` : '傍晚一家人在派对区聚在一起，挂起了串灯');
      burst(a.x, a.y, 24, [Ac[3], Ac[1], '#fff2a8', Wt[4]], 18, 'spark'); noteProgress({ partyHeld: true }); albumSnap('party', a.x, a.y + 6, { wait: 30 });
      for (let i = 0; i < n; i++) { const seat = partySpot({ id: 'g' + i }), e = EAST_IN[0]; if (!seat) continue;
        if (guestsOut === S.day) break; // v5.8.0: the town guests are already on their way
        GUESTS.push({ id: 'g' + i, look: GUEST_LOOK[i], x: e.x + i * 3, y: e.y + i, fx: -1, fy: 0, pts: EAST_IN.slice(1).concat(routeVia(EAST_IN[EAST_IN.length - 1], seat), [seat]), moving: true, leaving: false }); } } }
  if (GUESTS.length && (!partyTonight() || T >= DC.PARTY.to || T < DC.PARTY.from - early)) for (const g of GUESTS) if (!g.leaving) { g.leaving = true; if (g.home) { g.pts = routeVia(g, g.home).concat([g.home]); continue; } const back = EAST_IN.slice().reverse(); g.pts = routeVia(g, back[0]).concat(back); }
  for (let i = GUESTS.length - 1; i >= 0; i--) { const g = GUESTS[i]; guestStep(g, dm); if (g.leaving && !g.pts.length) GUESTS.splice(i, 1); }
  if (GUESTS.length && partyTonight() && DC.partyOn(T) && partyBegun === S.day) for (const g of GUESTS) { if (g.leaving || g.pts.length) continue; // v5.11.0.15: the guests swap round too
    const p = partySpot(g, g.id); if (p && Math.hypot(p.x - g.x, p.y - g.y) > 1.2) { g.pts = routeVia(g, p).concat([p]); g.moving = true; } }
}
// ---------- v5.8.0 phase 10: school days, days off, classmates, the town (rules in town.js, art in town-art.js) ----------
var TOWN_ON = false;
const townOpen = () => !!(TN && S.eff && S.eff.town);
const rainDay = () => !!(WX && WX.isRainDay && WX.isRainDay(S.weather, S.day));
const townRng = salt => mulberry32(((S.day * 2654435761) ^ salt) >>> 0);
const kidSalt = id => (id === 'kid1' ? 2 : 1);
const schoolRoute = () => TN.schoolRoute({ regions: S.eff.regions || [], plots: S.plots, open: townOpen() });
function townSchoolGo(a) { // the morning walk counts as a school day (once a day per child; old saves count from today)
  const T = S.town; if (T.last[a.id] === S.day) return; T.last[a.id] = S.day; T.school[a.id] = (T.school[a.id] | 0) + 1; if (HM) homeSchoolDay(a); } // v5.9.0: a school day brings them a little closer to their classmates
function townSkip(a) { // a day off now and then: a rainy day, a party evening. Decided once a day per child, never a punishment
  const T = S.town; if (T.skip[a.id] === S.day) return true; if (T.last[a.id] === S.day || a._skipDay === S.day) return false;
  a._skipDay = S.day; const rain = rainDay(), party = partyTonight();
  if (SC && S.town && SC.isDay(S.town.hall, S.day)) return false; // v5.10.9: sports day is a school day
  if (!TN.skipSchool({ rain, party }, townRng(0x5C00 + kidSalt(a.id)))) return false;
  T.skip[a.id] = S.day; log(`${a.name}今天请假在家（${rain ? '下雨天' : '晚上家里有派对'}）`); return true; }
// ---- classmates: after a few school days a classmate now and then comes home with a child, looks round and goes before evening ----
const VISITORS = [];
function mateStops() { // the playground first if there is one, then a pen, the pets, the pond
  const out = [], spots = XP.playSpots(), r = townRng(0x57A9), pick = a => a[Math.floor(r() * a.length)];
  if (spots.length) { const s = pick(spots); out.push({ x: s.stand.x, y: s.stand.y, wait: 40, what: 'play' }); }
  const pens = AN.PEN_IDS.filter(id => S.animals.some(a => homeOf(a) === id) && PENS[id] && PENS[id].door && (!PENS[id].needs || (S.eff.regions || []).includes(PENS[id].needs)));
  if (pens.length) { const d = PENS[pick(pens)].door; out.push({ x: d.x + 3, y: d.y + 6, wait: 30, what: 'pen' }); }
  if (PETS_LIVE.length) { const v = petView(PETS_LIVE[0]); out.push({ x: v.x + 4, y: v.y + 3, wait: 20, what: 'pet' }); }
  if (S.homeyard.put.sign && r() < 0.5) out.unshift({ x: STALL_SPOT.x - 8, y: STALL_SPOT.y + 2, wait: 18, what: 'stall' }); // v5.10.3: the sign catches the eye
  { const ps = NAV.LAYOUT.POND_STAND; out.push({ x: ps.x + 4, y: ps.y + 2, wait: 25, what: 'pond' }); }
  return out.slice(0, 3); }
function townMateHome(a, ex) { // the child is back from school: does a classmate come along today?
  const M = S.town.mate; if (M.day === S.day) return; M.day = S.day;
  if (!TN.mateToday({ day: S.day, schoolDays: S.town.school[a.id] | 0, last: M.last, rain: rainDay(), party: partyTonight() }, townRng(0x3A7E))) return;
  M.last = S.day; M.kid = a.id; M.who = (M.who + 1) % TN.MATES.length; spawnMate(a, ex); }
function spawnMate(a, ex) {
  const i = S.town.mate.who, open = townOpen(), name = TN.mateName(i, open), back = ex.via.slice().reverse(); if (HM) homeVisit(a, i); // v5.9.0
  VISITORS.push({ id: 'mate', fast: 1, look: TN.MATES[i].look, name, kid: a.id, x: ex.to.x + 3, y: ex.to.y + 2, fx: -1, fy: 0, moving: true, wait: 0, leaving: false, ex,
    pts: back.map(p => ({ x: p.x + 2, y: p.y + 2 })).concat([{ x: DOOR.x + 14, y: DOOR.y + 10 }]), stops: mateStops() });
  log(`${a.name}放学带着${open ? '同学' + name : '一位同学'}回家玩`); albumSnap('classmate', Math.round(a.x), Math.round(a.y), { wait: 25, follow: a.id }); }
function visitorTick(dm) {
  const T = S.t % 1440;
  for (let i = VISITORS.length - 1; i >= 0; i--) { const g = VISITORS[i];
    if (g.pts.length) { guestStep(g, dm); continue; } g.moving = false;
    if (g.leaving) { VISITORS.splice(i, 1); continue; }
    if (T >= TN.MATE.leave || T < WAKE || (!g.stops.length && g.wait <= 0)) { g.leaving = true; const v = g.ex.via, home = v[0];
      g.pts = routeVia(g, home).concat(v.slice(1).map(p => ({ x: p.x + 2, y: p.y + 2 })), [g.ex.to]); log(`${g.name === '同学' ? '同学' : g.name}回家了`); continue; }
    if (g.wait > 0) { g.wait -= dm; if (g.what === 'pet' || g.what === 'pen') { if (Math.random() < dm * 0.02) hearts(g.x, g.y, 8); } continue; }
    const s = g.stops.shift(); g.what = s.what; g.wait = s.wait; g.pts = routeVia(g, s).concat([{ x: s.x, y: s.y }]); }
}
// ---- the neighbours: out of the house by the clock, only once the town is open ----
const NEIGH = [];
function neighbourTick(dm) {
  if (!townOpen()) { NEIGH.length = 0; return; }
  const defs = HL ? TN.NEIGHBOURS.concat(HL.residents(S.town.hall)) : TN.NEIGHBOURS; // v5.10.0: 镇长, and a family for every new house
  if (NEIGH.length !== defs.length) for (const n of defs) if (!NEIGH.some(g => g.id === n.id)) { const h = HL ? HL.doorOf(n) : TN.BY_ID[n.home].door; NEIGH.push({ id: n.id, name: n.name, def: n, look: n.look, x: h.x, y: h.y, fx: 0, fy: 1, pts: [], spot: 'home', out: false, moving: false }); }
  const T = S.t % 1440;
  for (const g of NEIGH) { if (GUESTS.some(q => q.look === g.look)) { if (g.out) { g.out = false; g.spot = 'party'; g.pts.length = 0; const h = HL ? HL.doorOf(g.def) : TN.BY_ID[g.def.home].door; g.x = h.x; g.y = h.y; } continue; } // tonight they are the party guests
    const w = hallSite(g, T) || (HL && HL.sportsAt && HL.sportsAt(S.town.hall, g.def, S.day, T)) || (HL && HL.festivalAt && HL.festivalAt(S.town.hall, g.def, S.day, T)) || (HL && HL.marketAt(S.town.hall, g.def, S.day, T)) || (HL && HL.bakeryAt(S.town.hall, g.def, S.day, T)) || (HL && HL.woodshopAt(S.town.hall, g.def, S.day, T)) || (HL && HL.smithyAt(S.town.hall, g.def, S.day, T)) || (HL && HL.libraryAt && HL.libraryAt(S.town.hall, g.def, S.day, T)) || (HL && HL.clinicAt && HL.clinicAt(S.town.hall, g.def, S.day, T)) || (HL ? HL.neighbourAt(g.def, T) : TN.neighbourAt(g.def, T));
    if (w.spot !== g.spot) { g.spot = w.spot; g.out = true; g.pts = routeVia(g, w.at).concat([{ x: w.at.x, y: w.at.y }]); }
    if (g.pts.length) guestStep(g, dm); else { g.moving = false; if (g.spot === 'home') g.out = false; } }
}
// ---- v5.10.0 镇公所: the board's projects (a house a night), gifts to the town, the weekly paper ----
function hallSite(g, T) { // 木匠阿松 is on the building site while a house goes up
  const J = HL && S.town.hall.job; if (!J || g.id !== 'n2' || T < HL.BUILD_HOURS[0] || T >= HL.BUILD_HOURS[1]) return null;
  return { at: HL.siteSpot(J.id), out: true, spot: 'site:' + J.id }; }
const hallCtx = () => ({ open: townOpen(), coins: S.coins, wood: FARMER.wood });
const townLv = () => (CR && S.town ? CR.townLv(S.town.hall, S.town.lots, S.home && S.home.path, S.day) : (HL ? HL.prosperity(S.town && S.town.hall) : 1)); // v5.10.6: a kid's shop lifts prosperity once
function hallStart(id) {
  const H = S.town.hall, why = HL.canStart(H, id, hallCtx()); if (why) return { ok: false, why };
  const p = HL.PROJ[id]; S.coins -= p.cost; FARMER.wood -= p.wood; HL.start(H, id, S.day); emit('purchase', { item: 'hall:' + id, level: 1, gold: p.cost, wood: p.wood, who: 'player' });
  const l = HL.LOT[id] || TN.PLAZA; burst(l.x, l.y, 14, [Wd[3], Wd[4], '#fff2a8'], 8); markNavDirty(); if (TOWN_ON) TA.sync(true);
  const how = p.kind === 'market' ? '在广场上搭摊位' : (p.kind === 'woodshop' || p.kind === 'smithy' || p.kind === 'bakery' ? '搭起脚手架' : '搭起脚手架');
  log(`镇公所的告示板：${p.name}开工了，木匠阿松${how}，明天一早就能盖好`); return { ok: true }; }
function hallGive(id, u) { // 送给镇上: from the storehouse (u undefined) or from the yard (u: the placed one)
  const H = S.town.hall; if (!townOpen()) return { ok: false, why: '先把镇子买下来' }; if (!HL.GIFT_OK(id)) return { ok: false, why: '派对区留在家里' };
  if (!HL.giftRoom(H, id)) return { ok: false, why: '主街上放这类东西的地方已经满了' }; // v5.10.3: by kind
  if (u === undefined) { if (!((S.decor.inv[id] | 0) > 0)) return { ok: false, why: '仓库里没有' }; S.decor.inv[id]--; if (!S.decor.inv[id]) delete S.decor.inv[id]; }
  else { const i = S.decor.placed.findIndex(p => p.u === u && p.id === id); if (i < 0) return { ok: false, why: '找不到它' }; S.decor.placed.splice(i, 1); S.decor.orders = S.decor.orders.filter(q => q.ref !== u); }
  HL.give(H, id); H.week.gifts++; markNavDirty(); if (TOWN_ON) TA.sync(true);
  log(`把一件${DC.CATALOG[id].name}送给了镇上，摆在主街边`); return { ok: true }; }
function hallTick() {
  if (!HL || !townOpen()) return; const H = S.town.hall;
  if (!H.paper) H.paper = S.day; // the paper starts counting the week the town opens
  const lv0 = HL.prosperity(H), done = HL.finish(H, S.day);
  if (done) { const p = HL.PROJ[done], l = HL.LOT[done] || TN.PLAZA, who = HL.NEIGHBOURS.find(n => n.id === p.who); H.week.built.push(done); markNavDirty(); if (TOWN_ON) TA.sync(true);
    burst(l.x, l.y - 6, 20, ['#fff2a8', '#ffd76a', Wd[4]], 14); log(`镇上的${p.name}盖好了${who ? '，' + who.name + '一家搬了进来' : ''}${p.kind === 'market' ? `；每 7 天一次集市日，下一次是第 ${MK.nextDay(H, S.day)} 天` : p.kind === 'bakery' ? '；订单板挂出来了，小桃每天要两单货，按单多付五成' : p.kind === 'woodshop' ? '；仓库能多放 400 份木材，阿松会把多的木头做成街上的长椅' : p.kind === 'smithy' ? '；铺子里可以升级浇水器、加工坊、斧头、鱼竿和集市手推车' : p.kind === 'school' ? `；操场和第二间教室启用了，每 14 天一次运动会，下一次是第 ${SC.nextDay(H, S.day)} 天，上学日的好感翻倍` : p.kind === 'library' ? '；孩子放学会顺路去看书，图鉴里还没收集到的条目会给出提示，面包房也能订苹果派了' : p.kind === 'clinic' ? '；动物和猫狗心情的下限更高，苏大夫每月会来家里做体检' : p.kind === 'rebuild' ? '' : ''}`); if ((p.kind === 'market' || p.kind === 'school' || (CL && CL.paved(H))) && groundReady) { const q = (CL && CL.paved(H)) ? TN.RECT : p.kind === 'school' && SC ? SC.YARD : [TN.PLAZA.x - 26, TN.PLAZA.y - 26, TN.PLAZA.x + 26, TN.PLAZA.y + 26]; buildGroundBase(q); if (CL && CL.paved(H) && p.kind !== 'market') log('镇子的路面铺上了石板，繁荣度升到了 5'); }
    if (p.kind === 'woodshop' || p.kind === 'smithy') applyUpgrades();
    const lv = HL.prosperity(H); if (lv > lv0) log(`镇子的繁荣度升到 ${lv}（${HL.LV_NAME[lv]}）`); syncAvenue(); }
  if (S.day - H.paper >= HL.PAPER_EVERY && S.t % 1440 >= WAKE + 60) {
    log(HL.paperText({ day: S.day, built: H.week.built, gifts: H.week.gifts, trade: H.week.trade, lv: townLv(), people: TN.NEIGHBOURS.length + HL.residents(H).length }));
    H.paper = S.day; H.week = { built: [], gifts: 0, trade: 0 }; }
}
function hallTap(w) { // v5.10.0: a click on the notice board (or the hall's door) opens the board; v5.10.4: the bakery too; v5.10.5: the workshop and the smithy
  if (!HL || !townOpen()) return false; setCam();
  const spots = [[HL.BOARD.x, HL.BOARD.y, 12], [HL.HALL.door.x, HL.HALL.door.y - 6, 14]];
  if (BK && BK.built(S.town.hall)) spots.push([BK.BOARD.x, BK.BOARD.y, 12], [BK.LOT.door.x, BK.LOT.door.y - 6, 14]);
  if (WS && WS.built(S.town.hall)) spots.push([WS.STAND.x, WS.STAND.y, 12], [WS.LOT.door.x, WS.LOT.door.y - 6, 14]);
  if (SM && SM.built(S.town.hall)) spots.push([SM.STAND.x, SM.STAND.y, 12], [SM.LOT.door.x, SM.LOT.door.y - 6, 14]);
  if (LB && LB.built(S.town.hall)) spots.push([LB.BOARD.x, LB.BOARD.y, 12], [LB.LOT.door.x, LB.LOT.door.y - 6, 14]);
  for (const [x, y, r] of spots) { const [sx, sy] = proj(x, y); if (Math.hypot(sx - w.px, sy - (w.py + 6)) < r) return true; }
  return false; }
function hallView() { // what the board shows (ui.js)
  const H = S.town.hall, ctx = hallCtx(), placed = {};
  for (const p of S.decor.placed) if (HL.GIFT_OK(p.id)) (placed[p.id] = placed[p.id] || []).push(p.u);
  return { open: ctx.open, lv: townLv(), lvName: HL.LV_NAME[townLv()] || HL.LV_NAME[HL.prosperity(H)], next: HL.nextLevelAt(H), job: H.job, people: TN.NEIGHBOURS.length + HL.residents(H).length,
    projects: HL.PROJECTS.map(p => ({ id: p.id, name: p.name, desc: p.desc, cost: p.cost, wood: p.wood, built: H.built[p.id] || 0, building: !!(H.job && H.job.id === p.id), why: HL.canStart(H, p.id, ctx) })),
    gifts: H.gifts.slice(), room: HL.GIFT_SPOTS.length - H.gifts.length, roomOf: id => HL.giftRoom(H, id),
    inv: Object.keys(S.decor.inv).filter(id => HL.GIFT_OK(id) && S.decor.inv[id] > 0).map(id => ({ id, name: DC.CATALOG[id].name, n: S.decor.inv[id] })),
    placed: Object.keys(placed).map(id => ({ id, name: DC.CATALOG[id].name, n: placed[id].length, u: placed[id][placed[id].length - 1] })),
    school: SC && SC.built(H) ? { next: SC.nextDay(H, S.day), sports: SC.isDay(H, S.day) } : null,
    library: LB && LB.built(H) ? { hints: LB.hints((S.codex && S.codex.got) || {}, S.day, window.PFCodex && PFCodex.ENTRIES) } : null,
    clinic: CL && CL.built(H) ? { next: CL.nextCheck(H, S.day), floor: CL.FLOOR, paved: CL.paved(H) } : null,
    festival: FV && FV.ready(H) ? { today: FV.isDay(H, S.day), next: FV.nextDay(H, S.day), lantern: FV.hasShops(H), gift: FV.GIFT } : null }; }
// ---- the town shop: a grown-up takes workshop goods, honey and fish over at a fifth more ----
const tradeOk = a => townOpen() && (!a.role || FAM.canDo(a.role, 'towntrade')) && a.role !== 'child';
const tradeList = a => { const hold = seaHold(a); return a.crops.map((it, i) => ({ it, i, ty: SU.itemType(it) })).filter(o => typeof o.it === 'string' && !hold[o.i] && TN.tradeable(o.ty, FS.isFish(o.ty))); }; // v5.11.0.28: not the stall's sea fish
function tradeKeep(a, keep) { // while the town shop is still open today, the tradeable goods stay in the basket for it
  const T = S.t % 1440; if (marketDay() && tradeOk(a)) return marketKeep(a, keep, T); // v5.10.3
  if (!tradeOk(a) || T >= TN.TRADE.to - 30) return keep;
  const k = keep.slice(); for (const o of tradeList(a)) k[o.i] = true; return k; }
function townBoard(post, T) {
  if (BK) bakeryBoard(post, T); // v5.10.4: a delivery to 小桃, same day as a market run is fine
  if (marketBoard(post, T)) return; // v5.10.3: on market day everything goes to the square (周婶 keeps her stall there)
  if (!tradeOk(F) || T < TN.TRADE.from || T >= TN.TRADE.to) return;
  if (tradeList(F).length >= TN.TRADE.min) post('towntrade', 66 + travel(F, TN.SHOP_DOOR) / 8, TN.SHOP_DOOR, () => tradeTask(), 'town:trade:' + (F === FARMER ? 'farmer' : F.id)); // an errand: the long walk is not held against it
}
function tradeTask() {
  const at = { x: TN.SHOP_DOOR.x - 3, y: TN.SHOP_DOOR.y + 3 };
  return { kind: 'towntrade', label: '正在去镇上小店卖东西', to: at, dur: 6, pose: 'pull', done: () => {
    const list = tradeList(F); if (!list.length) return; let sum = 0, base = 0; const by = { crops: 0, fruit: 0, animals: 0, fish: 0, wood: 0 };
    for (const o of list) { const g = priceOfAny(o.it), p = TN.tradePrice(g); base += g; sum += p; if (FS.isFish(o.ty)) { by.fish += p; S.fishGold = (S.fishGold || 0) + p; } else if (AN.PRODUCTS[o.ty]) by.animals += p; else by.crops += p; }
    const gone = new Set(list.map(o => o.i)), left = F.crops.filter((_, i) => !gone.has(i)); F.crops.length = 0; F.crops.push(...left);
    const n = list.length, extra = sum - base; S.coins += sum; S.earned += sum; S.todayEarn += sum; S.soldToday += n; S.totalSold += n; S.town.trade += extra; if (HL) S.town.hall.week.trade += extra; if (HM) homeTrade(); // v5.9.0: 周婶 gets to know the family
    emit('income', { gold: sum, items: n, source: 'market', by, who: F === FARMER ? 'farmer' : F.id }); for (const k of Object.keys(by)) if (by[k]) noteLog('income', k, by[k]);
    popText(TN.SHOP_DOOR.x, TN.SHOP_DOOR.y - 8, 26, '+' + sum, '#ffd76a'); burst(TN.SHOP_DOOR.x, TN.SHOP_DOOR.y - 4, 10, ['#ffd76a', '#fff2a8'], 6, 'coin');
    log(`${F === FARMER ? '' : F.name}在镇上小店卖了 ${n} 件，得 ${sum} 金（比自家摊子多 ${extra} 金）`); } };
}
// ---- v5.10.3 集市: every 7th day a grown-up takes the basket to the family's stall on the square (market.js) ----
const marketH = () => (MK && HL && TN && S.town && S.town.hall ? S.town.hall : null);
const marketDay = () => { const H = marketH(); return !!(H && townOpen() && MK.isDay(H, S.day)); };
const marketOpenNow = () => { const H = marketH(); return !!(H && townOpen() && MK.open(H, S.day, S.t % 1440)); };
const MK_F = { fish: ty => FS.isFish(ty), fruit: ty => !!WD.FRUIT[ty], animal: ty => !!AN.PRODUCTS[ty], good: ty => !!(PW && PW.PRODUCTS[ty]) };
const marketKind = ty => MK.kindOf(ty, MK_F);
function marketList(a) { // what of this basket goes to the market (not what a workshop is waiting for; 「我来挑」 kinds only)
  const M = marketH().market, wk = worksKeep(a), hold = seaHold(a);
  return a.crops.map((it, i) => ({ it, i, ty: SU.itemType(it) })).filter(o => typeof o.it === 'string' && !wk[o.i] && !hold[o.i] && MK.takes(M, marketKind(o.ty)));
}
function marketKeep(a, keep, T) { if (T >= MK.HOURS.to - 30) return keep; const k = keep.slice(); for (const o of marketList(a)) k[o.i] = true; return k; }
function marketBoard(post, T) {
  if (!marketDay()) return false; if (!tradeOk(F) || !marketOpenNow()) return true;
  const n = marketList(F).length, full = F.crops.length >= BASK();
  if (n >= MK.MIN || (n && (full || T >= MK.HOURS.to - 60))) post('market', (full ? 100 : 70) + travel(F, MK.FARM_SPOT) / 8, MK.FARM_SPOT, () => marketTask(), 'town:market:' + (F === FARMER ? 'farmer' : F.id));
  return true;
}
function marketTask() {
  const at = MK.FARM_SPOT;
  return { kind: 'market', label: '正在推车去集市摆摊', to: at, dur: 8, pose: 'pull', done: () => {
    const H = marketH(); if (!H || !marketOpenNow()) { log('集市已经散了，东西带回家里的摊子卖'); return; }
    const list = marketList(F); if (!list.length) return; const M = H.market, hot = MK.hot(S.day); let sum = 0, base = 0, nHot = 0; const by = { crops: 0, fruit: 0, animals: 0, fish: 0, wood: 0 };
    for (const o of list) { const g = priceOfAny(o.it), kd = marketKind(o.ty), p = MK.price(g, kd, S.day); base += g; sum += p; if (kd === hot) nHot++;
      if (kd === 'fish') { by.fish += p; S.fishGold = (S.fishGold || 0) + p; } else if (kd === 'fruit') { by.fruit += p; S.fruitGold = (S.fruitGold || 0) + p; } else if (kd === 'animals') { by.animals += p; S.animalGold = (S.animalGold || 0) + p; } else by.crops += p; }
    const gone = new Set(list.map(o => o.i)), left = F.crops.filter((_, i) => !gone.has(i)); F.crops.length = 0; F.crops.push(...left);
    const n = list.length, extra = sum - base; S.coins += sum; S.earned += sum; S.todayEarn += sum; S.soldToday += n; S.totalSold += n;
    if (M.last !== S.day) { M.last = S.day; M.days++; } M.gold += sum; M.extra += extra; S.town.trade += extra; H.week.trade += extra;
    emit('income', { gold: sum, items: n, source: 'market', by, who: F === FARMER ? 'farmer' : F.id }); for (const k of Object.keys(by)) if (by[k]) noteLog('income', k, by[k]);
    popText(at.x, at.y - 10, 26, '+' + sum, '#ffd76a'); burst(at.x, at.y - 6, 12, ['#ffd76a', '#fff2a8'], 6, 'coin');
    log(`${F === FARMER ? '' : F.name}在集市上卖了 ${n} 件，得 ${sum} 金（比自家摊子多 ${extra} 金${nHot ? `，其中 ${nHot} 件是今天的抢手货${MK.KIND[hot].name}` : ''}）`);  albumSnap('market', Math.round(F.x), Math.round(F.y), { wait: 0, follow: albumId(F) }); } };
}
function marketMorning() { // the first tick of a market day: one line in the log
  const H = marketH(); if (!H || !townOpen()) return; const M = H.market;
  if (M._told === S.day) return; M._told = S.day;
  if (MK.isDay(H, S.day)) log(`今天是集市日！广场上摆满了摊子，今天的抢手货是${MK.KIND[MK.hot(S.day)].name}（多卖三成，别的多卖一成半）`);
  else if (MK.nextDay(H, S.day) === S.day + 1) log(`明天是集市日，抢手货是${MK.KIND[MK.hot(S.day + 1)].name}`);
}
function setMarketPick(on, kind) { // 「我来挑」 (ui.js): on = 0/1 switches the mode; kind toggles one kind
  const H = marketH(); if (!H) return; const M = H.market;
  if (on !== undefined && on !== null) M.pick = on ? 1 : 0;
  if (kind && MK.KIND[kind]) M.take[kind] = M.take[kind] ? 0 : 1;
}
function marketView() {
  const H = marketH(); if (!H || !MK.built(H)) return null; const M = H.market, nx = MK.nextDay(H, S.day), today = MK.isDay(H, S.day);
  return { today, open: marketOpenNow(), next: today ? S.day : nx, hot: MK.KIND[MK.hot(today ? S.day : nx)].name, hotId: MK.hot(today ? S.day : nx), pick: M.pick, take: Object.assign({}, M.take), kinds: MK.KINDS, days: M.days, gold: M.gold, extra: M.extra };
}
// ---- v5.10.4 面包房: every day 2 orders, the family delivers the best one they can fill (bakery.js) ----
const bakeryH = () => (BK && HL && TN && S.town && S.town.hall && BK.built(S.town.hall) ? S.town.hall : null);
const bakeryPrice = ty => basePrice(ty);
function bakeryCounts() {
  const c = {};
  const add = (ty, n) => { if (!ty || !BK.WORD[ty]) return; BK.addCount(c, ty, n); };
  for (const a of actors()) for (const it of a.crops) add(typeof it === 'string' ? it : SU.itemType(it));
  if (S.works && S.works.works) for (const id of Object.keys(S.works.works)) { const w = S.works.works[id], def = PW.WORKS[id]; if (w && def) add(def.out, w.ready | 0); }
  if (S.works && S.works.hives) for (const h of S.works.hives) if (h) add('honey', h.ready | 0);
  machCounts(add); // v5.11.0.29: the storehouse bin
  return c;
}
function bakeryTaken() { const H = bakeryH(); if (!H || H.bakery.done) return null; return BK.taken(H.bakery); }
function bakeryPull(need) { // check the whole order first; never take honey / flour / etc. if the rest is short
  if (!BK.have(need, bakeryCounts())) return false;
  const left = {}; for (const x of need) left[x.id] = (left[x.id] | 0) + x.n;
  const pull = arr => { for (let i = arr.length - 1; i >= 0; i--) { const ty = typeof arr[i] === 'string' ? arr[i] : SU.itemType(arr[i]); if (left[ty] > 0) { arr.splice(i, 1); left[ty]--; } } };
  pull(F.crops); for (const a of actors()) if (a !== F) pull(a.crops);
  if (S.works && S.works.works) for (const id of Object.keys(S.works.works)) { const w = S.works.works[id], def = PW.WORKS[id]; if (!w || !def || !(left[def.out] > 0)) continue; const n = Math.min(w.ready | 0, left[def.out]); w.ready -= n; left[def.out] -= n; }
  if (S.works && S.works.hives) for (const h of S.works.hives) { if (!h || !(left.honey > 0)) continue; const n = Math.min(h.ready | 0, left.honey); h.ready -= n; left.honey -= n; }
  machPull(left); // v5.11.0.29
  return Object.keys(left).every(k => left[k] <= 0);
}
function bakeryReleaseHeld(B) {
  if (!B || !B.held) return;
  bakeryHeldReturn(B.held);
  delete B.held;
}
function bakeryRoll(B) {
  if (!B || B.last === S.day) return B;
  bakeryReleaseHeld(B);
  BK.roll(B, S.day, CR ? CR.extraOrders(S.home) : 0, (LB && LB.built(S.town.hall) ? LB.TEMPLATES : undefined));
  return B;
}
function bakeryMorning() {
  const H = bakeryH(); if (!H || !townOpen()) return; const B = H.bakery; if (B.last === S.day) return;
  bakeryRoll(B); BK.autoTake(B, bakeryCounts(), bakeryPrice);
  const texts = B.offer.map(q => q.text).join('；');
  log(`小桃的订单板：${texts}。家人会接更划算的一单送到面包房，按单多付五成；不接也没有惩罚`);
}
function bakeryMarkShort(B, o, counts) {
  const short = (BK.shortOf ? BK.shortOf(o.need, counts || bakeryCounts()) : o.need.filter(x => ((counts || bakeryCounts())[x.id] | 0) < x.n));
  B.short = short.map(x => x.id);
  const tag = S.day + ':' + o.id;
  if (B._shortLog === tag) return;
  B._shortLog = tag;
  const bit = short.map(x => (BK.needText ? BK.needText([x]) : ((x.n | 0) + (BK.NAME && BK.NAME[x.id] || x.id)))).join('、');
  log(`小桃这一单还缺${bit || '原料'}，凑齐了再送`);
}
function bakeryHeldReturn(need) {
  if (!need) return;
  const bag = (F && Array.isArray(F.crops)) ? F : FARMER;
  if (!bag || !Array.isArray(bag.crops)) return;
  const m = S.works && S.works.mach, own = { egg: 'e', milk: 'm', honey: 'h' }; // v5.11.0.29: eggs / milk / honey go back into the machine bin (no basket to overfill) when that machine is installed
  for (const x of need) { let n = x.n | 0; if (m && own[x.id] && m[own[x.id]]) n -= PW.binAdd(m, x.id, n); for (let i = 0; i < n; i++) bag.crops.push(x.id); }
}
// when a taken order is short, pick up / collect the missing product first (never a town / hall / inn autobuy)
function bakeryGatherBoard(post, T, o) {
  const short = BK.shortOf ? BK.shortOf(o.need, bakeryCounts()) : [];
  if (!short.length || T >= 18 * 60) return;
  const want = {}; for (const x of short) want[x.id] = x.n;
  const space = BASK() - F.crops.length; if (space <= 0) return;
  for (const id of PW.WORK_IDS) {
    const w = S.works && S.works.works && S.works.works[id], def = PW.WORKS[id];
    if (!w || !w.at || !def || !want[def.out] || !(w.ready > 0)) continue;
    post('pickup', 86, PWA.doorOf(id), () => pickupTask(id), 'w:' + id + ':out', workArea[id]);
  }
  if (want.honey && S.works && S.works.hives) S.works.hives.forEach((h, i) => {
    const sp = PWA.hiveSpots()[i];
    if (h && h.ready > 0 && sp) post('honey', 86, { x: sp.x - 6, y: sp.y + 4 }, () => honeyTask(i), 'hive:' + i, 'orchard');
  });
  // flour is milled from wheat already in a basket; do not buy mill / hall / town items
  if (want.flour) {
    const w = S.works && S.works.works && S.works.works.mill, def = PW.WORKS && PW.WORKS.mill;
    if (w && w.at && def && w.inp < def.inCap) {
      const typ = it => typeof it === 'string' ? it : SU.itemType(it);
      const carry = F.crops.filter(it => typ(it) === 'wheat').length;
      if (carry > 0) post('deliver', 86, PWA.doorOf('mill'), () => deliverTask('mill'), 'w:mill:in', workArea.mill);
    }
  }
}
function bakeryBoard(post, T) {
  const H = bakeryH(); if (!H || !tradeOk(F) || !BK.open(H, T)) return;
  const B = H.bakery; if (B.last !== S.day) { bakeryRoll(B); log(`小桃的订单板：${B.offer.map(q => q.text).join('；')}`); }
  // cargo already pulled for today's walk: finish the trip even if skip was set, and do not pull twice
  if (B.held && B.held.length && !B.done) { post('bakery', 74 + travel(F, BK.STAND) / 8, BK.STAND, () => bakeryTask(), 'town:bakery'); return; }
  if (B.skip) return;
  BK.autoTake(B, bakeryCounts(), bakeryPrice); const o = BK.taken(B); if (!o || B.done) return;
  bakeryGatherBoard(post, T, o);
  if (!BK.have(o.need, bakeryCounts())) { bakeryMarkShort(B, o); return; }
  post('bakery', 74 + travel(F, BK.STAND) / 8, BK.STAND, () => bakeryTask(), 'town:bakery');
}
function bakeryTask() {
  const at = BK.STAND, KEY = 'town:bakery';
  const H0 = bakeryH(), B0 = H0 && H0.bakery, o0 = B0 && (BK.taken(B0) || (B0.held && B0.held.length && B0.offer && B0.offer.find(q => q.id === B0.take)));
  if (B0 && B0.held && B0.held.length && !B0.done) {
    const text = (o0 && o0.text) || BK.needText(B0.held);
    return { kind: 'bakery', key: KEY, label: '正在把订单送到小桃的面包房', to: at, dur: 8, pose: 'pull', done: bakeryArrive(at, text) };
  }
  if (!o0 || B0.done || B0.skip) return { kind: 'idle', key: KEY, label: '在农场里走走', to: { x: F.x, y: F.y }, dur: 2 };
  const counts = bakeryCounts();
  // v5.11.0.26: pull the goods when the job is taken, not at 小桃's door (a second adult or a workshop run used to empty the basket on the walk)
  // v5.11.0.27: the pulled cargo is saved as bakery.held so a reload mid-walk cannot drop it
  if (!BK.have(o0.need, counts)) {
    bakeryMarkShort(B0, o0, counts);
    return { kind: 'idle', key: KEY, label: '先凑齐面包房的原料', to: { x: F.x, y: F.y }, dur: 2 };
  }
  if (!bakeryPull(o0.need)) {
    B0.skip = 1;
    bakeryMarkShort(B0, o0, counts);
    return { kind: 'idle', key: KEY, label: '这一单今天先放下', to: { x: F.x, y: F.y }, dur: 2 };
  }
  if (B0.short) delete B0.short;
  B0.held = o0.need.map(x => ({ id: x.id, n: x.n }));
  return { kind: 'bakery', key: KEY, label: '正在把订单送到小桃的面包房', to: at, dur: 8, pose: 'pull', done: bakeryArrive(at, o0.text) };
}
function bakeryArrive(at, text) {
  return () => {
    const H = bakeryH(), B = H && H.bakery, held = B && B.held;
    if (!H || !BK.open(H, S.t % 1440)) { bakeryReleaseHeld(B); log('面包房已经打烊了，东西先带回家'); return; }
    const o = B && (BK.taken(B) || (held && B.offer && B.offer.find(q => q.id === B.take)));
    if (!B || !o || B.done) { bakeryReleaseHeld(B); return; }
    if (!held || !held.length) return;
    const base = BK.baseOf(held, bakeryPrice), sum = BK.payOf(held, bakeryPrice), extra = sum - base, n = held.reduce((s, x) => s + x.n, 0);
    S.coins += sum; S.earned += sum; S.todayEarn += sum; S.soldToday += n; S.totalSold += n;
    B.done = 1; B.days++; B.gold += sum; B.extra += extra; delete B.short; delete B.held;
    if (HM) HM.clampAdd(S.home.nb, 'n3', BK.FAVOR);
    emit('income', { gold: sum, items: n, source: 'bakery', by: { works: sum }, who: F === FARMER ? 'farmer' : F.id });
    noteLog('income', 'works', sum); if (F !== FARMER) noteLog('work', F.id, 0, sum);
    popText(at.x, at.y - 8, 26, '+' + sum, '#ffd76a'); burst(at.x, at.y - 4, 12, ['#ffd76a', '#fff2a8', Ac[0]], 8, 'coin'); hearts(at.x, at.y - 2, 14);
    const who = F === FARMER ? '' : F.name; log(`${who ? who : '家人'}把 ${text} 送到小桃的面包房，按单收了 ${sum} 金（比平时多 ${extra} 金），小桃很高兴（好感 +${BK.FAVOR}）`);
  };
}
function woodshopMorning() { // v5.10.5: once a day, if auto is on and the pile is above the reserve, 阿松 makes a bench
  const H = S.town && S.town.hall; if (!H || !WS || !WS.built(H) || !townOpen()) return;
  const W = H.woodshop || (H.woodshop = WS.empty());
  const times = CR ? CR.craftTimes(S.home) : 1;
  for (let i = 0; i < times; i++) {
    const r = WS.craft(W, S.day, FARMER.wood, times); if (!r.ok) break;
    FARMER.wood -= r.wood; applyUpgrades();
    let where = '仓库';
    if (HL.giftRoom(H, r.item)) { HL.give(H, r.item); H.week.gifts++; where = '街上'; if (TOWN_ON) TA.sync(true); markNavDirty(); }
    else { S.decor.inv[r.item] = (S.decor.inv[r.item] | 0) + 1; }
    burst(WS.LOT.x, WS.LOT.y - 4, 12, [Wd[3], Wd[4], '#fff2a8'], 6);
    log(`阿松用 ${r.wood} 份木材做好一张长椅，放到了${where}` + (times > 1 && i === 0 ? '（有家人在坊里帮工，今天能做两张）' : ''));
  }
}
function setWoodshopAuto(on) { const H = S.town && S.town.hall; if (!H || !WS || !WS.built(H)) return; WS.setAuto(H.woodshop || (H.woodshop = WS.empty()), on); }
function woodshopView() {
  const H = S.town && S.town.hall; if (!H || !WS || !WS.built(H)) return null; const W = H.woodshop || WS.empty();
  return { auto: W.auto, days: W.days, used: W.used, cap: woodCap(), bonus: WS.CAP_BONUS, keep: WS.KEEP, cost: WS.COST };
}
function smithyBuy(id) {
  const H = S.town && S.town.hall; if (!H || !SM || !SM.built(H)) return { ok: false, why: '先把铁匠铺盖好' };
  const r = SM.buy(H.smithy || (H.smithy = SM.empty()), id, { built: true, coins: S.coins, off: !!(CR && CR.smithOff(S.home)) });
  if (!r.ok) return r; S.coins -= r.cost; diary('out', null, r.cost); applyUpgrades(); SPR_COVER = null;
  emit('purchase', { item: 'smithy:' + id, level: r.have, gold: r.cost, who: 'player' });
  burst(SM.LOT.x, SM.LOT.y - 4, 14, ['#e06a2c', '#f2cf55', St[2]], 8);
  log(`在铁匠铺升级了${r.name}（花了 ${r.cost} 金）`); return r;
}
function smithyView() {
  const H = S.town && S.town.hall; if (!H || !SM || !SM.built(H)) return null;
  const Stt = H.smithy || SM.empty(), ctx = { built: true, coins: S.coins, off: !!(CR && CR.smithOff(S.home)) };
  return { up: Object.assign({}, Stt.up), items: SM.UPGRADES.map(u => { const have = SM.lv(Stt, u.id), maxed = have >= u.max;
    return { id: u.id, name: u.name, label: maxed ? (u.labels && u.labels[u.max - 1] || u.name) : SM.labelOf(u, have), desc: maxed ? u.desc : SM.descOf(u, have), have, max: u.max, cost: maxed ? 0 : SM.costOf(u, have), maxed, why: SM.canBuy(Stt, u.id, ctx) }; }) };
}
function setBakeryPick(on, id) { // 「我来挑」 (ui.js): on = 0/1 switches the mode; id accepts one of today's orders
  const H = bakeryH(); if (!H) return; const B = H.bakery;
  if (on === 0 || on === 1 || on === true || on === false) B.pick = on ? 1 : 0;
  if (id !== undefined) {
    if (B.held && B.take !== id) bakeryReleaseHeld(B);
    BK.setTake(B, id);
  }
}
function bakeryView() {
  const H = bakeryH(); if (!H) return null; const B = H.bakery;
  if (B.last !== S.day) bakeryRoll(B);
  const o = BK.taken(B) || (B.held && B.offer && B.offer.find(q => q.id === B.take));
  return { pick: B.pick, offer: B.offer.map(q => ({ id: q.id, text: q.text, need: q.need, pay: q.pay, base: q.base, take: B.take === q.id, have: (B.held && B.take === q.id) || BK.have(q.need, bakeryCounts()) })), take: B.take, done: B.done, days: B.days, gold: B.gold, extra: B.extra, open: BK.open(H, S.t % 1440), text: o ? o.text : null };
}
// the crowd on market day: pedlars at the stalls nobody lives here to keep, and shoppers going round them
const MKT = [];
const MKT_LOOKS = ['guestA', 'mateB', 'townF', 'townD', 'mateC', 'guestB', 'townG'];
function marketCrowd(dm) {
  if (!marketOpenNow()) { MKT.length = 0; return; }
  const H = marketH(), res = new Set((HL.residents(H) || []).map(n => n.id).concat(TN.NEIGHBOURS.map(n => n.id)));
  if (!MKT.length) { let i = 0;
    for (const s of MK.STALLS) if (s.who !== 'farm' && !res.has(s.who)) { const at = MK.standAt(s); MKT.push({ id: 'ped' + s.id, pedlar: 1, look: MKT_LOOKS[(i++) % MKT_LOOKS.length], x: at.x, y: at.y, fx: 0, fy: 1, pts: [], moving: false, wait: 1e9 }); }
    for (let k = 0; k < 6; k++) { const s = MK.STALLS[(k * 5 + S.day) % MK.STALLS.length], at = MK.standAt(s); MKT.push({ id: 'shop' + k, look: MKT_LOOKS[(k + 3) % MKT_LOOKS.length], x: at.x + (k % 3) * 3 - 3, y: at.y + 4, fx: 0, fy: -1, pts: [], moving: false, wait: 8 + k * 7 }); } }
  for (const g of MKT) { if (g.pedlar) continue; if (g.pts.length) { guestStep(g, dm); continue; } g.moving = false; g.fx = 0; g.fy = -1;
    if ((g.wait -= dm) > 0) continue; const s = MK.STALLS[(Math.random() * MK.STALLS.length) | 0], at = MK.standAt(s), to = { x: at.x + (Math.random() - 0.5) * 6, y: at.y + 4 };
    g.pts = routeVia(g, to).concat([to]); g.wait = 20 + Math.random() * 40; }
}
function libraryRead(a) { // v5.10.9: 上学日 +1 with 书屋阿宁, once a day
  const H = S.town && S.town.hall; if (!LB || !H || !LB.built(H) || !HM) return;
  const L = H.library || (H.library = LB.empty()); if (L.last === S.day) return;
  L.last = S.day; L.days = (L.days | 0) + 1; HM.clampAdd(S.home.nb, 'n9', LB.FAVOR);
}
function sleepAt() { // v5.10.11: on a lantern-fair night the family stays up until 22:00; then the usual night sleep speedup starts
  const H = S.town && S.town.hall, t = (FV && H && townOpen()) ? FV.bedtime(H, S.day) : null; return t == null ? BEDTIME : t; }
function festNow() { const H = S.town && S.town.hall; return !!(FV && H && townOpen() && FV.feastOpen(H, S.day, S.t % 1440)); }
function fairNow() { const H = S.town && S.town.hall; return !!(FV && H && townOpen() && FV.fairOpen(H, S.day, S.t % 1440)); }
function feastTask() {
  if (!festNow() || F.away || F.sleeping) return null;
  const kids = (S.family && S.family.kids) || [];
  const i = F === FARMER ? 0 : (F.id === 'partner' ? 1 : 2 + Math.max(0, kids.findIndex(k => k.id === F.id)));
  const at = FV.seatAt(i), T = S.t % 1440;
  return { kind: 'feast', label: '在镇上吃丰收宴', to: { x: at.x + (i % 2 ? 0.4 : -0.4), y: at.y }, dur: Math.max(8, Math.min(24, FV.FEAST.to - T)), rest: true };
}
function festivalMorning() {
  const H = S.town && S.town.hall; if (!FV || !H || !townOpen() || !FV.isDay(H, S.day)) return;
  const st = H.festival || (H.festival = FV.empty()); if (st._told === S.day) return; st._told = S.day;
  log(FV.hasLantern(H, S.day) ? '今天是丰收节！晚上镇上摆长桌宴，灯会也一起办，石板路和广场都会挂上灯笼' : '今天是丰收节！晚上镇上摆长桌宴');
}
function festivalBegin() {
  const H = S.town && S.town.hall; if (!festNow() || !H) return;
  const st = H.festival || (H.festival = FV.empty()); if (st.last === S.day) return;
  const gold = FV.grant(H, S.day); if (gold) { S.coins += gold; S.earned = (S.earned | 0) + gold; S.todayEarn = (S.todayEarn | 0) + gold;
    log(`丰收节的长桌宴摆好了，一家人围坐在广场上；镇上送来一份薄礼 ${gold} 金`); const at = FV.TABLE; popText(at.x, at.y - 8, 24, '+' + gold, '#ffd76a'); burst(at.x, at.y - 4, 16, ['#ffd76a', '#fff2a8', Ac[1]], 10, 'spark'); }
  else { st.last = S.day; log('丰收节的长桌宴摆好了，一家人围坐在广场上'); }
  albumSnap('fest', FV.TABLE.x, FV.TABLE.y + 4, { wait: 45 });
}
function sportsOpenNow() { const H = S.town && S.town.hall; return !!(SC && H && townOpen() && SC.open(H, S.day, S.t % 1440)); }
function sportsTask() { // a grown-up walks over to watch (kids have their own race task)
  if (!sportsOpenNow() || F.away || F.sleeping || (F.id && /^kid/.test(F.id))) return null;
  const at = SC.WATCH, off = F === FARMER ? -2 : (F.id === 'partner' ? 2 : 0);
  return { kind: 'sports', label: '正在看运动会', to: { x: at.x + off, y: at.y + 1 }, dur: 50 };
}
function sportsMorning() {
  const H = S.town && S.town.hall; if (!SC || !H || !SC.isDay(H, S.day)) return;
  const Sch = H.school || (H.school = SC.empty()); if (Sch.last === S.day) return;
  Sch.last = S.day; log(`今天是运动会！操场上在赛跑，家人会去看`);
}
const SPT = [];
const SPT_LOOKS = ['mateA', 'mateB', 'mateC', 'guestA', 'townF', 'guestB'];
function sportsCrowd(dm) {
  if (!sportsOpenNow()) { SPT.length = 0; return; }
  if (!SPT.length) {
    for (let i = 0; i < 5; i++) { const at = SC.raceAt(i + 2, realT, 8); SPT.push({ id: 'run' + i, look: SPT_LOOKS[i % SPT_LOOKS.length], x: at.x, y: at.y, fx: 1, fy: 0, pts: [], moving: true, wait: 0, race: 1, i: i + 2 }); }
    for (let k = 0; k < 3; k++) { const b = SC.BENCHES[k % SC.BENCHES.length]; SPT.push({ id: 'watch' + k, look: SPT_LOOKS[(k + 3) % SPT_LOOKS.length], x: b.x + (k % 2), y: b.y + 1, fx: 0, fy: 1, pts: [], moving: false, wait: 1e9, race: 0 }); }
  }
  for (const g of SPT) { if (!g.race) continue; const at = SC.raceAt(g.i, realT, 8); g.x = at.x; g.y = at.y; g.moving = true; const prev = SC.raceAt(g.i, realT - 0.2, 8); g.fx = at.x >= prev.x ? 1 : -1; g.fy = at.y >= prev.y ? 1 : -1; }
}
function townTick(dm) { if (!TN) return; visitorTick(dm); hallTick(); neighbourTick(dm); if (MK && HL) { marketMorning(); marketCrowd(dm); } if (BK && HL) bakeryMorning(); if (WS && HL) woodshopMorning(); if (SC && HL) { sportsMorning(); sportsCrowd(dm); } if (FV && HL) festivalMorning(); if (IN) innTick(dm); if (TOWN_ON) TA.sync(); festivalBegin(); }
function townDraw(list) {
  for (const g of VISITORS) { const sh = famSheet(g.look, 6); if (sh) list.push(Object.assign({ bb: 1, x: g.x, y: g.y, sheet: sh }, farmerPose(g))); }
  for (const g of NEIGH) if (g.out) { const sh = famSheet(g.look, 0); if (sh) list.push(Object.assign({ bb: 1, x: g.x, y: g.y, sheet: sh }, farmerPose(g))); }
  for (const g of MKT) { const sh = famSheet(g.look, 0); if (sh) list.push(Object.assign({ bb: 1, x: g.x, y: g.y, sheet: sh }, farmerPose(g))); } // v5.10.3: the market crowd
  for (const g of SPT) { const sh = famSheet(g.look, g.race ? 6 : 0); if (sh) list.push(Object.assign({ bb: 1, x: g.x, y: g.y, sheet: sh }, farmerPose(g))); } // v5.10.9: sports day
}
// ---------- v5.9.0 phase 11: 好感, the new house, the wedding, the couple's little farm (rules in home.js, art in home-art.js) ----------
var HOME_ON = false;
const homeRngS = mulberry32(0x40E5A11); // its own stream (the farm's RNG stays where it was)
const hr = () => homeRngS();
const homeDayRng = salt => mulberry32((Math.imul(S.day, 0x9E3779B1) ^ salt ^ 0x11E) >>> 0); // one roll per day and purpose (the same after a reload)
const HT = [];      // the little farms' tiles: drawn with the main field, grown overnight here, never on the main board
const SPOUSES = []; // the married children's partners: they live in the new house and only work there
const kidName = id => { const k = S.family.kids.find(q => q.id === id); return k ? k.name : '孩子'; };
const memberOf = id => S.members.find(m => m.id === id) || null;
const homeOfActor = a => { if (!a || !S.home) return null; const id = a._spouse || a.id; return id && HM.isMarried(S.home, id) ? HM.houseOf(S.home, id) : null; };
const weddingTonight = () => { for (const k of HM.KID_IDS) { const w = S.home.wed[k]; if (w && w.day === S.day && !w.moved) return { kid: k, w }; } return null; };
// ---- v5.11.0.21 婚礼: the couple's wedding clothes (bride / groom sheets, home.js wedLooks), and the ceremony at the party area ----
const wedNow = () => (HM && S.home ? weddingTonight() : null);
const wedCouple = () => { const w = wedNow(); return w ? [w.kid, 'sp_' + w.kid] : null; };
function wedLook(a) { // the sheet for one of tonight's couple from 17:00 until the evening ends (null: everyday clothes)
  if (!a || !HM || !S.home) return null; const w = wedNow(); if (!w) return null; const T = S.t % 1440; if (T < HM.WED.from - 30 || T >= HM.WED.to) return null;
  const L = HM.wedLooks(w.kid, w.w.mate); return a.id === w.kid ? L.kid : a._spouse === w.kid && a.id === 'sp_' + w.kid ? L.mate : null; }
const wedCer = () => { if (!DECOR_ON || !partyTonight() || !DC.wedOn(S.t % 1440)) return null; const L = partyLawnNow(); return L.wed || null; }; // the ceremony layout while it lasts
function homeTilesSync() { // runtime tile views of every built house (state lives on h._tiles; the save gets { t, w, c })
  HT.length = 0;
  S.home.houses.forEach((h, hi) => { if (!h._tiles) { const L = HM.layout(h); h._tiles = L.tiles.map((p, i) => { const o = h.tiles[i] || HM.emptyTile();
      return { f: 'hs', hi, i, x: p.x, y: p.y, open: true, tilled: !!o.t, watered: !!o.w, crop: o.c ? Object.assign({}, o.c) : null, debris: null, weed: null }; }); }
    else { const L = HM.layout(h); h._tiles.forEach((t, i) => { t.x = L.tiles[i].x; t.y = L.tiles[i].y; t.hi = hi; }); }
    if (h.built) HT.push(...h._tiles); });
}
const homeSave = () => HM.valid({ houses: S.home.houses.map(h => Object.assign({}, h, { _tiles: undefined, tiles: h._tiles ? h._tiles.map(t => ({ t: t.tilled ? 1 : 0, w: t.watered ? 1 : 0, c: t.crop ? { type: t.crop.type, age: t.crop.age, stage: t.crop.stage, rot: t.crop.rot } : null })) : h.tiles })),
  rel: S.home.rel, nb: S.home.nb, wed: S.home.wed, help: S.home.help, teen: S.home.teen, earn: S.home.earn, path: S.home.path, wage: S.home.wage });
const homeFeet = () => S.home.houses.map(h => HM.layout(h).foot);
// ---- where a new house can go: any free 花甸 / 农田 plot, clear of what already stands there ----
function homeAvoid(skip) { const out = []; // skip: the house being moved (its own yard and itself are not in the way)
  for (const m of movables()) if (!(m.what === 'home')) out.push([m.x - Math.max(4, m.r * 0.6), m.y - Math.max(4, m.r * 0.6), m.x + Math.max(4, m.r * 0.6), m.y + Math.max(4, m.r * 0.6)]);
  S.home.houses.forEach((h, i) => { if (i !== skip) out.push(HM.layout(h).foot); });
  for (const t of S.trees) if (t.stage === 'tree') out.push([t.x - 5, t.y - 4, t.x + 5, t.y + 4]);
  return out; }
function homeSpot() { const avoid = homeAvoid();
  for (const id of HM.freeSites(S.plots, S.home.houses)) { const s = HM.spotsIn(id, S.plots[id].mod, avoid)[0]; if (s) return Object.assign({ site: id }, s); }
  return null; }
let homeGateKey = '', homeGateVal = null;
function homeGate(have) {
  const key = [have, S.family.moved, JSON.stringify(S.plots), S.home.houses.length, S.decor.placed.length, S.works.hives.length, S.works.sprinklers.length, Object.keys(S.works.works).length].join('|');
  if (key === homeGateKey) return homeGateVal; homeGateKey = key;
  const sites = HM.freeSites(S.plots, S.home.houses).length;
  return (homeGateVal = HM.houseGate({ moved: S.family.moved, have, sites, room: sites && homeSpot() ? 1 : 0 }));
}
function homeBought() {
  const s = homeSpot(); if (!s) return;
  S.home.houses.push({ site: s.site, x: s.x, y: s.y, m: s.m, d: S.day, built: 0, kid: null, tiles: [], eggs: 0, hens: HM.HENS }); homeGateKey = '';
  for (const h of S.works.hives) { const p = PW.hivePos(h, S.plots, S.eff.regions); if (p && homeFeet().some(f => HM.inBox(p, f, 3))) homeHiveAside(h, p); } // a hive in the way steps aside
  homeTilesSync(); if (HOME_ON) HA.sync(); markNavDirty();
  log(`新房子的地基打在了${HM.siteName(s.site)}，家人有空就去盖起来`);
}
function homeHiveAside(h, p) { // move a hive that stands where the house goes to the nearest free grass of its site
  const site = HM.siteAt(p.x, p.y); if (!site) return;
  for (const c of DC.ringSpots(p, 40, 4)) { if (HM.siteAt(c.x, c.y) !== site || homeFeet().some(f => HM.inBox(c, f, 4))) continue;
    if (PWA.hiveSpots().some(q => q && q !== p && Math.hypot(q.x - c.x, q.y - c.y) < 7)) continue; h.x = c.x; h.y = c.y; if (WORKS_ON && PWA.sync) PWA.sync(true); return; }
}
// moving it (the shop's 挪东西 mode, like the other pieces): to a bought 花甸 / 农田, or a bought first-ring field such as 东田, with room, one house a plot; the family takes it
// down and puts it up again there (HM.HOUSE.build minutes), the six tiles, the coop and what grows on them go along
function homeMoveOk(x, y, ref) {
  const h = S.home.houses[ref];
  const r = HM.moveOk(x, y, h, { plots: S.plots, regions: (S.eff && S.eff.regions) || [], houses: S.home.houses.filter((q, i) => i !== ref), avoid: homeAvoid(ref) });
  if (!r.ok) return r;
  const f = HM.layout(Object.assign({}, h, r.spot)).foot;
  if (S.decor.orders.some(q => !(q.what === 'home' && q.ref === ref) && q.what !== 'home' && HM.inBox(q, f, 2))) return Object.assign({}, r, { ok: false, why: '这里已经约好要放别的了' });
  if (S.home.houses.some((q, i) => i !== ref && HM.boxHit(f, HM.layout(q).foot, 2))) return Object.assign({}, r, { ok: false, why: '离另一座新房子太近' });
  const L = HM.layout(Object.assign({}, h, r.spot));
  markNavDirty(); const g = ensureNav(); // a plot just bought in this click must have its gate open
  const gate = (HM.siteOf(r.spot.site) || {}).gate || NAV.LAYOUT.DOOR;
  if (DC && !DC.keepsPaths(g, L.block, entrySpots().concat([L.door, gate]), NAV.LAYOUT.DOOR))
    return Object.assign({}, r, { ok: false, why: '放在这里会把路堵上' });
  const seen = DC.reach(g, NAV.LAYOUT.DOOR, [L.block]);
  const [di, dj] = NAV.cellOf(g, L.door.x, L.door.y);
  if (!(di >= 0 && dj >= 0 && di < g.w && dj < g.h && seen[dj * g.w + di]))
    return Object.assign({}, r, { ok: false, why: '家人走不到新房子的门口' });
  return r;
}
function homeMoveDone(q) {
  const h = S.home.houses[q.ref], r = homeMoveOk(q.x, q.y, q.ref);
  if (!h || !r.ok) { dropOrder(q); log(`新房子没法挪到那里（${r.why}），留在原处`); return false; }
  const from = HM.layout(h).foot; Object.assign(h, { site: r.spot.site, x: r.spot.x, y: r.spot.y, m: r.spot.m }); q.x = h.x; q.y = h.y;
  for (const w of S.works.hives) { const p = PW.hivePos(w, S.plots, S.eff.regions); if (p && HM.inBox(p, HM.layout(h).foot, 3)) homeHiveAside(w, p); }
  for (const a of [FARMER, ...S.members, ...SPOUSES]) if (a.task && a.task.kind && /^hs-|^home$/.test(a.task.kind)) { a.task = null; a.path = []; }
  homeTilesSync(); homeGateKey = ''; dropOrder(q); if (HOME_ON) { HA.sync(true); HA.repaintAt && HA.repaintAt(from); } markNavDirty(); return true;
}
const homeBusy = id => S.home.houses.some(h => h.site === id) ? '这块地上有新房子，不能改建' : null;
// ---- building it: a grown-up goes over and puts it up (about 40 game minutes) ----
function homeBoard(post) {
  S.home.houses.forEach((h, i) => { if (h.built) return; const L = HM.layout(h);
    post('homebuild', 62, { x: h.x + (h.m ? -8 : 8), y: h.y + HM.HOUSE.hd + 3 }, () => homeBuildTask(i), 'home:build:' + i); });
}
function homeBuildTask(i) { const h = S.home.houses[i], L = HM.layout(h);
  return { kind: 'homebuild', label: '正在盖新房子', to: { x: h.x + (h.m ? -8 : 8), y: h.y + HM.HOUSE.hd + 3 }, dur: HM.HOUSE.build, fx: 'wood', pose: 'hoe', done: () => {
    if (!h || h.built) return; h.built = S.day; homeTilesSync(); if (HOME_ON) HA.sync(true); markNavDirty();
    burst(h.x, h.y, 26, [Wd[3], Wd[4], '#fff2a8'], 16, 'wood'); log(`${HM.siteName(h.site)}的新房子盖好了，旁边留了 6 格小田和一个小鸡舍`); noteProgress(); } };
}
// ---- 好感: school days, a classmate coming home, parties, the town shop ----
function homeSchoolDay(a) { HM.schoolDay(S.home, a.id, homeDayRng(0x5D + kidSalt(a.id)), townOpen(), SC && S.town ? SC.favorMul(S.town.hall) : 1); }
function homeVisit(a, mateIdx) { HM.visit(S.home, a.id, TN.MATES[mateIdx % TN.MATES.length].id); }
function homeTrade() { HM.clampAdd(S.home.nb, 'n0', HM.NB.shop); }
let homePartyNoted = 0, homeFriendDay = 0;
function homeParty(T) { // the party has begun: the guests who came get to know the family a little more; a teen's close friend is asked too
  if (partyBegun !== S.day || homePartyNoted === S.day) return; homePartyNoted = S.day;
  for (const g of GUESTS) { if (g.look === 'guestA') HM.clampAdd(S.home.nb, 'n2', HM.NB.party); if (g.look === 'guestB') HM.clampAdd(S.home.nb, 'n3', HM.NB.party); }
  if (WX && WX.isRaining(S.weather, S.day, S.t)) return;
  for (const k of S.family.kids) { if (FAM.kidStage(k, S.day) !== 'teen' || HM.isMarried(S.home, k.id)) continue;
    const b = HM.best(S.home, k.id); if (!b || b.v < HM.REL.friend) continue; HM.clampAdd(HM.KID_IDS.includes(k.id) ? (S.home.rel[k.id] || (S.home.rel[k.id] = {})) : {}, b.id, HM.REL.party);
    const w = weddingTonight(); if (w && w.w.mate === b.id) continue; // the bride or groom comes on their own
    const i = HM.mateIndex(b.id), from = townOpen() ? TN.SCHOOL_DOOR : EAST_IN[0], seat = partySpot({ id: 'f' + i }); if (!seat || GUESTS.some(g => g.id === 'f' + i)) continue;
    GUESTS.push({ id: 'f' + i, look: TN.MATES[i].look, x: from.x, y: from.y, fx: -1, fy: 0, pts: routeVia(from, seat).concat([seat]), moving: true, leaving: false, home: townOpen() ? from : null, fast: 1, friend: 1 });
    log(`${k.name}的好朋友${HM.mateName(b.id)}也来参加派对`); }
}
// a teen who no longer goes to school: their closest friend drops by in the afternoon now and then, and they keep in touch
function homeTeenDay() {
  for (const k of S.family.kids) { if (FAM.kidStage(k, S.day) !== 'teen' || HM.isMarried(S.home, k.id) || (S.home.wed[k.id] && S.home.wed[k.id].mate)) continue;
    const b = HM.best(S.home, k.id) || { id: HM.PREF[k.id][0], v: 0 }; HM.clampAdd(S.home.rel[k.id] || (S.home.rel[k.id] = {}), b.v > 0 ? b.id : HM.PREF[k.id][0], HM.REL.teen); }
}
function homeTeenVisit(T) {
  if (T < HM.TEEN.from || T >= TN.MATE.leave - 60 || VISITORS.length || homeFriendDay === S.day) return; homeFriendDay = S.day;
  for (const k of S.family.kids) { const a = memberOf(k.id); if (!a || a.home || a.away || FAM.kidStage(k, S.day) !== 'teen' || HM.isMarried(S.home, k.id) || (S.home.wed[k.id] && S.home.wed[k.id].mate)) continue;
    if (!HM.teenVisit({ day: S.day, last: S.home.teen[k.id], rain: rainDay(), party: partyTonight() }, homeDayRng(0x7EE + kidSalt(k.id)))) continue;
    const b = HM.best(S.home, k.id) || { id: HM.PREF[k.id][0] }; S.home.teen[k.id] = S.day; HM.visit(S.home, k.id, b.id);
    const i = HM.mateIndex(b.id), ex = schoolRoute(), name = townOpen() ? TN.MATES[i].name : '老同学', back = ex.via.slice().reverse();
    VISITORS.push({ id: 'mate', fast: 1, look: TN.MATES[i].look, name, kid: k.id, x: ex.to.x + 3, y: ex.to.y + 2, fx: -1, fy: 0, moving: true, wait: 0, leaving: false, ex,
      pts: back.map(p => ({ x: p.x + 2, y: p.y + 2 })).concat([{ x: DOOR.x + 14, y: DOOR.y + 10 }]), stops: mateStops() });
    log(`${name}来找${k.name}玩`); return; }
}

// ---------- v5.10.6: 成家后的出路 (rules in careers.js) ----------
let careerPayDay = 0, careerPrompt = null; // prompt: { kid, day } while the wedding-morning choice is open
function careerCtx(kid, extra) {
  const w = S.home && S.home.wed && S.home.wed[kid], k = S.family.kids.find(q => q.id === kid);
  return Object.assign({ hall: S.town && S.town.hall, lots: (S.town.lots || (S.town.lots = {})), coins: S.coins, wood: FARMER.wood, mate: w && w.mate, kidName: k ? k.name : '孩子', nb: (S.home && S.home.nb) || {}, day: S.day, innPlot: IN ? innPlot() : null, cabins: S.inn ? S.inn.cabins : 0, diner: S.inn && S.inn.diner ? S.inn.diner.lv : 0 }, extra || {});
}
function careerDone() { try { dispatchEvent(new Event('pf:career-done')); } catch (e) {} }
function careerSettle(r, kid, how) {
  if (!r || !r.ok) return r;
  if (r.paid) { S.coins -= r.paid; emit('purchase', { item: 'career-shop', gold: r.paid, wood: Math.max(0, r.wood), who: 'player' }); }
  if (r.wood) FARMER.wood -= r.wood;
  if (r.refund) { S.coins += r.refund; emit('income', { gold: r.refund, source: 'career-refund', who: kid }); }
  const name = kidName(kid), p = CR.pathOf(S.home, kid);
  if (r.way === 'work') log(`${name}以后去${CR.JOB[p.at] ? CR.JOB[p.at].name : '镇上'}上班，每天工钱 ${CR.WAGE} 金` + (how || ''));
  else if (r.way === 'shop') log(`${name}要在镇上开${CR.shopName(name, p.kind)}，装修花了 ${r.paid} 金和 ${r.wood} 份木材，家人明天搭好` + (how || ''));
  else if (r.way === 'inn') log(`${name}以后帮家里经营民宿和菜馆，客人住得更满意，菜馆能多做一份拿手菜` + (how || ''));
  else log(`${name}留在新房子种地` + (how || ''));
  if (r.refund) log(`关上了店，退回 ${r.refund} 金装修钱`);
  if (TOWN_ON && TA && TA.sync) TA.sync(true); markNavDirty();
  return r;
}
function careerPick(kid, way, at, kind) {
  if (!CR || !S.home) return { ok: false, why: '还没有成家' };
  const ctx = careerCtx(kid), choice = { way, at, kind };
  const r = CR.take(S.home, S.town.lots || (S.town.lots = {}), kid, choice, ctx, S.day);
  if (r.ok) { careerSettle(r, kid, ''); if (careerPrompt && careerPrompt.kid === kid) careerPrompt = null; careerDone(); }
  return r;
}
function careerChange(kid, way, at, kind) {
  if (!CR || !S.home) return { ok: false, why: '还没有成家' };
  const ctx = careerCtx(kid), r = CR.planChange(S.home, kid, { way, at, kind }, ctx, S.day);
  if (!r.ok) return r;
  if (r.fee) { S.coins -= r.fee; emit('purchase', { item: 'career-change', gold: r.fee, who: 'player' }); }
  log(`${kidName(kid)}决定换个活法${r.fee ? '（花了 ' + r.fee + ' 金）' : '（第一次换，不用花）'}，明天早上生效`);
  return r;
}
function careerDefault(kid) { return CR.prefer(S.home, kid, careerCtx(kid)); }
function careerOffer(kid) {
  careerPrompt = { kid, day: S.day };
  try { dispatchEvent(new CustomEvent('pf:career', { detail: careerView(kid, 'wedding') })); } catch (e) {}
}
function careerEnsure(kid) { // if the wedding path was never picked, take the default (legacy married kids stay 留家种地)
  if (!CR || !S.home) return;
  const w = S.home.wed[kid]; if (!w || !w.mate) return;
  if (w.day !== S.day && w.moved !== S.day) return;
  const p = CR.pathOf(S.home, kid); if (!p.implied && p.day) return;
  const r = CR.take(S.home, S.town.lots || (S.town.lots = {}), kid, careerDefault(kid), careerCtx(kid), S.day);
  if (r && r.ok) careerSettle(r, kid, '（按默认的去向）');
  if (careerPrompt && careerPrompt.kid === kid) careerPrompt = null;
  careerDone();
}
function careerMorning() {
  if (!CR || !S.home || !S.town) return;
  S.town.lots = S.town.lots || {};
  for (const k of HM.KID_IDS) {
    const r = CR.applyPending(S.home, S.town.lots, k, careerCtx(k), S.day);
    if (r && r.ok) careerSettle(r, k, '（换的活法今天起算）');
    if (S.home.wed[k] && S.home.wed[k].moved === S.day) careerEnsure(k);
  }
  if (TOWN_ON && TA && TA.sync) TA.sync(true);
}
function careerStock() {
  const c = {}, add = (ty, n) => { if (ty) BK.addCount(c, ty, n); };
  for (const a of actors()) for (const it of a.crops) add(typeof it === 'string' ? it : SU.itemType(it));
  if (S.works && S.works.works) for (const id of Object.keys(S.works.works)) { const w = S.works.works[id], def = PW.WORKS[id]; if (w && def) add(def.out, w.ready | 0); }
  if (S.works && S.works.hives) for (const h of S.works.hives) if (h) add('honey', h.ready | 0);
  machCounts(add); // v5.11.0.29: the storehouse bin
  if (S.fishFood) add('fishFood', S.fishFood);
  return c;
}
function careerPull(take) {
  const have = careerStock();
  if (!(take || []).every(x => (have[x.id] | 0) >= (x.n | 0))) return;
  const left = {}; for (const x of take) left[x.id] = (left[x.id] | 0) + x.n;
  const isFish = id => FS && FS.isFish && FS.isFish(id);
  const pull = arr => { for (let i = arr.length - 1; i >= 0; i--) { const ty = typeof arr[i] === 'string' ? arr[i] : SU.itemType(arr[i]); const key = isFish(ty) && left.fish ? 'fish' : ty; if (left[key] > 0 || left[ty] > 0) { const k = left[ty] > 0 ? ty : key; arr.splice(i, 1); left[k]--; } } };
  pull(FARMER.crops); for (const a of actors()) if (a !== FARMER) pull(a.crops);
  if (S.works && S.works.works) for (const id of Object.keys(S.works.works)) { const w = S.works.works[id], def = PW.WORKS[id]; if (!w || !def) continue; const k = def.out; if (!(left[k] > 0)) continue; const n = Math.min(w.ready | 0, left[k]); w.ready -= n; left[k] -= n; }
  if (S.works && S.works.hives) for (const h of S.works.hives) { if (!h || !(left.honey > 0)) continue; const n = Math.min(h.ready | 0, left.honey); h.ready -= n; left.honey -= n; }
  machPull(left); // v5.11.0.29
  if (left.fishFood > 0 && S.fishFood) { const n = Math.min(S.fishFood, left.fishFood); S.fishFood -= n; left.fishFood -= n; }
}
function careerDayPay() {
  if (!CR || !S.home || careerPayDay === S.day) return; const T = S.t % 1440;
  if (T < 17 * 60) return;
  const fest = !!(MK && S.town && S.town.hall && MK.isDay(S.town.hall, S.day));
  for (const k of HM.KID_IDS) {
    if (!HM.isMarried(S.home, k)) continue;
    if (CR.worksToday(S.home, k, fest)) {
      const g = CR.payWage(S.home), p = CR.pathOf(S.home, k), job = CR.JOB[p.at];
      S.coins += g; S.earned += g; S.todayEarn += g;
      emit('income', { gold: g, source: 'wage', who: k }); noteLog('income', 'town', g);
      log(`${kidName(k)}在${job ? job.name : '镇上'}帮工，傍晚领了 ${g} 金工钱，算进家里的收入`);
    }
    if (CR.shopsToday(S.home, k, S.day)) {
      const p = CR.pathOf(S.home, k), sold = CR.sell(p.kind, careerStock(), id => priceOfAny(id === 'fishFood' && FS ? FS.FOOD.price : id), id => FS && FS.isFish && FS.isFish(id));
      if (sold.n) careerPull(sold.take);
      const g = CR.payShop(S.home, sold.gold);
      if (g) { S.coins += g; S.earned += g; S.todayEarn += g; emit('income', { gold: g, source: 'kidshop', who: k }); noteLog('income', 'town', g); }
      const shop = CR.shopName(kidName(k), p.kind);
      log(g ? `${shop}今天卖了 ${sold.n} 件货，收了 ${g} 金（比集市多 ${sold.extra} 金），算进家里的收入` : `${shop}今天没有对口的货可卖`);
    }
  }
  careerPayDay = S.day;
}
function careerView(kid, mode) {
  if (!CR || !S.home) return null;
  const ctx = careerCtx(kid), opts = CR.options(S.home, kid, ctx), p = CR.pathOf(S.home, kid);
  const fee = mode === 'wedding' ? 0 : (p.free || p.implied ? 0 : CR.CHANGE.cost);
  return { kid, name: ctx.kidName, mate: ctx.mate ? HM.mateName(ctx.mate) : '', mode: mode || 'change', fee, free: fee === 0 && mode !== 'wedding', coins: S.coins, wood: FARMER.wood, path: { way: p.way, at: p.at, kind: p.kind, pending: p.pending }, options: opts };
}
function careerVia(from, dest, homeward) {
  if (!TN || !dest) return [];
  const gate = TN.GATE, sr = schoolRoute(), along = (sr && sr.via) ? sr.via.slice() : [{ x: gate.x - 2, y: 66 }];
  const onRoad = Math.abs(from.y - 66) < 8 && from.x > 200;
  const via = [];
  if (!homeward && from.x < dest.x && from.x < gate.x + 20) {
    for (const p of along) if (p.x >= Math.min(from.x, gate.x) - 20 && p.x <= (dest.x < gate.x - 8 ? dest.x : Math.max(dest.x, gate.x)) + 4) via.push(p); // v5.11.0.19: the 农家乐区 is short of the gate
    if (dest.y !== 66) via.push({ x: dest.x, y: 66 });
  } else if (homeward) {
    via.push({ x: from.x, y: 66 });
    const back = along.slice().reverse();
    for (const p of back) if (p.x <= from.x + 8 && p.x >= dest.x - 8) via.push(p); // v5.11.0.19: stop at the house (a new house east of the farm was reached by walking to the farm gate and back)
  }
  return via;
}
function careerSigns() { // a name board over the child's shop door
  if (!CR || !S.town || !S.town.lots || !S.home) return;
  ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const id of Object.keys(S.town.lots)) { const kid = S.town.lots[id], p = CR.pathOf(S.home, kid), l = CR.LOT[id]; if (!l || !CR.shopReady(p, S.day)) continue;
    if (fogHid(l.door.x, l.door.y)) continue; const name = CR.shopName(kidName(kid), p.kind), [sx, sy] = proj(l.door.x, l.door.y); if (sx < -40 || sx > W + 40 || sy < -20 || sy > H + 40) continue;
    const tw = ctx.measureText(name).width; ctx.fillStyle = 'rgba(26,18,14,0.72)'; ctx.fillRect(Math.round(sx - tw / 2 - 4), Math.round(sy - 54), Math.round(tw + 8), 14);
    ctx.fillStyle = '#fff6dc'; ctx.fillText(name, Math.round(sx), Math.round(sy - 42)); }
}
function careerFest() { // market day: the family gathers at a child's shop
  if (!CR || !S.home || !MK || !S.town || !MK.isDay(S.town.hall, S.day)) return null;
  const T = S.t % 1440; if (T < 10 * 60 || T >= 16 * 60) return null;
  for (const k of HM.KID_IDS) { const p = CR.pathOf(S.home, k); if (!CR.shopReady(p, S.day)) continue; const d = CR.doorOf(p.at); if (d) return { kind: 'shop-fest', label: '节日在店门口和家人聚', to: { x: d.x + (hr() - 0.5) * 6, y: d.y + 2 + (hr() - 0.5) * 3 }, dur: 16, rest: true }; }
  return null;
}

// ---------- v5.10.7: 民宿 + 农家菜馆 (rules in inn.js, art in inn-art.js) ----------
var INN_ON = false;
const STAYS = []; // inn guests (not the party GUESTS)
function innPlot() { return IN && S.inn && IN.siteOf ? IN.siteOf(townOpen(), S.inn) : null; } // v5.11.0.5: the 农家乐区 by the town gate (no plot is zoned for it any more)
function innLay() { const id = innPlot(); return id ? IN.layout(id) : null; }
function innStand() {
  const L = innLay(); if (!L) return null;
  if (IN.dinerUp(S.inn)) return L.diner.stand || L.diner.door;
  if ((S.inn && S.inn.cabins | 0) > 0 && L.cabins[0]) return { x: L.cabins[0].door.x + 8, y: L.cabins[0].door.y + 4 };
  return L.yard || L.gate;
}
// v5.11.0.19: what a married child (and their spouse) who runs the 民宿 / 菜馆 does on shift. They take turns round these
// spots, a step apart so the two are not on top of each other; the labels say what they are doing.
const inAgri = a => { const r = IN && IN.AGRI; return !!(r && a.x >= r[0] - 2 && a.x <= r[2] + 2 && a.y >= r[1] - 2 && a.y <= r[3] + 2); };
function innDuties() {
  const L = innLay(); if (!L) return [];
  const I = S.inn || {}, out = [], nc = Math.min(L.cabins.length, I.cabins | 0);
  if (IN.dinerUp(I)) { const d = L.diner;
    out.push({ to: d.stand, label: '在菜馆门口招呼食客', rest: true });
    for (const t of (d.tables || []).slice(0, 3)) out.push({ to: { x: t.x + 6, y: t.y + 1 }, label: '给客人端菜、擦桌子', pose: 'pull' });
    if (L.garden) out.push({ to: { x: Math.round((L.garden[0] + L.garden[2]) / 2), y: L.garden[1] - 3 }, label: '在菜园摘菜', pose: 'pull' }); }
  for (let i = 0; i < nc; i++) { const c = L.cabins[i], g = (I.guests || []).some(q => IN.cabinOf(q, I) === i && (q.from | 0) <= S.day && (q.until | 0) >= S.day);
    out.push({ to: { x: c.door.x + 5, y: c.door.y + 4 }, label: g ? `给${i + 1}号小木屋的客人送热水` : `打扫${i + 1}号小木屋、换床单`, pose: g ? null : 'pull', rest: !!g }); }
  out.push({ to: { x: L.gate.x + 6, y: L.gate.y + 6 }, label: '在农家乐门口迎客', rest: true });
  return out;
}
function innDuty(a, sp) {
  const ds = innDuties(); if (!ds.length) return null;
  a._innStep = (a._innStep | 0) + 1;
  const d = ds[(a._innStep + (sp ? Math.ceil(ds.length / 2) : 0)) % ds.length];
  return { kind: 'inn-keep', label: d.label, to: { x: d.to.x + R(-0.6, 0.6), y: d.to.y + R(-0.4, 0.4) }, dur: d.pose ? 10 : 14, pose: d.pose || null, rest: !!d.rest,
    done: d.pose ? () => burst(a.x, a.y - 2, 3, ['#fff2a8', '#ffffff'], 6, 'spark') : null };
}
function innFest() { const H = S.town && S.town.hall; return !!(IN && IN.isFest({ market: MK && H && MK.isDay(H, S.day), harvest: FV && H && FV.isDay(H, S.day), lantern: FV && H && FV.hasLantern(H, S.day) })); }
function innFurnished() { const W = S.town && S.town.hall && S.town.hall.woodshop; return !!(W && ((W.used | 0) > 0 || (W.days | 0) > 0 || (W.made | 0) > 0)); }
function innStaffedNow() { return !!(CR && S.home && CR.innStaffed(S.home)); }
function innStarsNow() { return IN && S.inn ? IN.effectiveStars(S.inn, innStaffedNow(), innFurnished()) : 3; }
function innPay(id) {
  if (id === 'seafish') id = 'sardine';
  if (id === 'greens') return (IN && IN.UNIT && IN.UNIT.greens) || 20;
  if (id === 'fish') return (priceOfAny('bass') || (IN && IN.UNIT.fish) || 20);
  try { const v = priceOfAny(id); if (v) return v; } catch (e) {}
  return (IN && IN.UNIT && IN.UNIT[id]) || 1;
}
function innType(it) {
  const ty = typeof it === 'string' ? it : SU.itemType(it);
  if (!ty) return null;
  if (IN && IN.isSeaFish && IN.isSeaFish(ty)) return ty; // v5.10.8: sea fish feed the seafood stall, not the pond-fish 烤鱼
  if (IN && IN.UNIT[ty]) return ty;
  if (ty === 'fish' || /^(bass|carp|catfish|koi|goldfish|trout|crucian|grassc)/.test(ty)) return 'fish';
  return null;
}
function innCounts() {
  const c = {};
  const add = (ty, n) => { if (!ty) return; BK.addCount(c, ty, n); };
  if (!IN) return c;
  for (const a of actors()) for (const it of a.crops) add(innType(it), 1);
  if (S.works && S.works.works) for (const id of Object.keys(S.works.works)) { const w = S.works.works[id], def = PW.WORKS[id]; if (w && def) add(innType(def.out) || (IN.UNIT[def.out] ? def.out : null), w.ready | 0); }
  if (S.works && S.works.hives) for (const h of S.works.hives) if (h) add('honey', h.ready | 0);
  machCounts(add); // v5.11.0.29: the storehouse bin
  return c;
}
function innPullNeed(need) {
  const have = innCounts();
  if (!(need || []).every(x => (have[x.id] | 0) >= (x.n | 0))) return false;
  const left = {}; for (const x of need) left[x.id] = (left[x.id] | 0) + x.n;
  const takeTy = ty => {
    if (!ty) return false;
    if (left[ty] > 0) { left[ty]--; return true; }
    if (left.seafish > 0 && IN && IN.isSeaFish && IN.isSeaFish(ty)) { left.seafish--; return true; }
    return false;
  };
  const pull = arr => { for (let i = arr.length - 1; i >= 0; i--) { if (takeTy(innType(arr[i]))) arr.splice(i, 1); } };
  pull(FARMER.crops); for (const a of actors()) if (a !== FARMER) pull(a.crops);
  if (S.works && S.works.works) for (const id of Object.keys(S.works.works)) { const w = S.works.works[id], def = PW.WORKS[id]; if (!w || !def) continue; const ty = innType(def.out) || (IN.UNIT[def.out] ? def.out : null); if (!ty) continue;
    let n = 0; while (n < (w.ready | 0) && takeTy(ty)) n++; w.ready -= n; }
  if (S.works && S.works.hives) for (const h of S.works.hives) { if (!h || !(left.honey > 0)) continue; const n = Math.min(h.ready | 0, left.honey); h.ready -= n; left.honey -= n; }
  machPull(left); // v5.11.0.29
  return Object.keys(left).every(k => left[k] <= 0);
}
function innEarn(gold, src, x, y) {
  if (!(gold > 0)) return;
  S.coins += gold; S.earned += gold; S.todayEarn += gold;
  S.inn.earn.today = (S.inn.earn.today | 0) + gold;
  emit('income', { gold, source: src, who: 'inn' });
  if (x != null) popText(x, y, 16, '+' + gold, '#ffd76a');
}
function innRateCtx() {
  // v5.11.0.12: use the last service (guests leave in the morning, meals were at 11:30 yesterday),
  // never the lifetime diner.missed total (that kept writing 「今天的菜不够」 every day after one short day)
  const rev = IN && S.inn ? IN.mealReview(S.inn, S.day) : { missed: 0, short: [], dish: null };
  return {
    animals: S.animals.map(a => ({ h: a.h })),
    yard: yard.length, yardCap: (typeof YARD_CAP === 'number' ? YARD_CAP : 18),
    decor: (S.decor && S.decor.placed ? S.decor.placed.length : 0) + (S.homeyard && S.homeyard.put ? Object.keys(S.homeyard.put).length : 0),
    flowers: (S.homeyard && S.homeyard.put && (S.homeyard.put.flowerbed | 0)) || 0,
    missed: rev.missed, short: rev.short, diner: !!(S.inn && IN.dinerUp(S.inn)), servedDish: rev.dish,
    fireflies: !!(WX && WX.isSummer && WX.isSummer(S.day)),
    sunset: !!(S.inn && S.inn.resort && S.inn.resort.deck), furnish: innFurnished(),
  };
}
function innBuy(id) {
  if (!IN || !S.inn) return { ok: false, why: '还没有民宿' };
  const ctx = { plot: innPlot(), lv: townLv(), coins: S.coins, wood: FARMER.wood, coast: !!(S.eff && (S.eff.coast || (S.eff.regions || []).includes('coast'))), resort: IN.resortPlotOf(S.plots) };
  const why = IN.canStart(S.inn, id, ctx); if (why) return { ok: false, why, reason: 'locked' };
  const o = IN.offer(S.inn, id);
  S.coins -= o.cost; FARMER.wood -= o.wood; diary('out', null, o.cost); if (DY && S.diary) DY.bought(S.diary, S.day, 'inn:' + id);
  IN.start(S.inn, id, S.day);
  emit('purchase', { item: 'inn:' + id, gold: o.cost, wood: o.wood, who: 'player' });
  if (id === 'parasol') log(`家人把第 ${S.inn.resort.parasols} 把遮阳伞摆到了沙滩上（${o.cost} 金）`);
  else log(`开始盖${o.name}（${o.cost} 金${o.wood ? ' + ' + o.wood + ' 木材' : ''}），家人明天一早搭好`);
  popText(FARMER.x, FARMER.y, 22, '-' + o.cost, '#ffd76a');
  if (INN_ON) IA.sync(true); markNavDirty(); if (typeof saveNow === 'function') saveNow();
  return { ok: true, cost: o.cost, wood: o.wood };
}
function innRepaint() { if (IN && IN.AGRI && groundReady) buildGroundBase([IN.AGRI[0] - 4, IN.AGRI[1] - 4, IN.AGRI[2] + 4, IN.AGRI[3] + 4]); } // v5.11.0.5: the garden and tables appear with the restaurant
// v5.11.0.5: an old save's lodging on a zoned 民宿院 plot now stands in the 农家乐区 (counts kept); the plot is an empty yard, rezoned once for free
function innMigrate() {
  if (!IN || !IN.migrate || !S.inn || !S.plots) return null;
  const r = IN.migrate(S.inn, S.plots, S.day);
  if (r.notice) {
    const names = r.plots.map(id => (PL.plot(id) || {}).name || id).join('、');
    log(`民宿搬到镇门口的农家乐区了：小木屋、菜馆、客人和留言本都跟着搬过去。原来的「${names}」空出来了，可以在商店「地块」里免费改建一次`);
    noteLog('event', { type: 'innMoved', plots: r.plots, day: S.day });
  }
  return r;
}
function innSetMenu(v) {
  if (!IN || !S.inn) return { ok: false };
  IN.setMenu(S.inn, v, innStaffedNow());
  return { ok: true, menu: S.inn.diner.menu };
}
function innView() {
  if (!IN) return null;
  const I = S.inn || IN.empty(), plot = innPlot(), L = plot ? IN.layout(plot) : null;
  const freed = Object.keys(S.plots || {}).filter(id => S.plots[id].mod === 'inn' && S.plots[id].free).map(id => (PL.plot(id) || {}).name || id); // v5.11.0.5
  const ctx = { plot, lv: townLv(), coins: S.coins, wood: FARMER.wood, coast: !!(S.eff && (S.eff.coast || (S.eff.regions || []).includes('coast'))), resort: IN.resortPlotOf(S.plots) };
  const offers = ['cabin', 'diner', 'kitchen', 'inn2', 'hut', 'parasol', 'stall', 'pier', 'deck'].map(id => {
    const o = IN.offer(I, id), why = IN.canStart(I, id, ctx);
    const short = why && ((ctx.coins | 0) < (o.cost | 0) || (ctx.wood | 0) < (o.wood | 0));
    return Object.assign({}, o, { why: why || null, ok: !why, shortGold: Math.max(0, (o.cost | 0) - (ctx.coins | 0)), shortWood: Math.max(0, (o.wood | 0) - (ctx.wood | 0)), short: !!short });
  });
  const staffed = innStaffedNow(), stars = innStarsNow();
  const counts = innCounts();
  const stock = IN.stockWithGarden ? IN.stockWithGarden(I, counts) : counts;
  const menu = IN.listed(I, staffed);
  if (IN.GARDEN_DISH && IN.dinerUp(I) && !menu.some(d => d.id === IN.GARDEN_DISH.id)) menu.push(IN.GARDEN_DISH);
  const today = IN.todayMenu(I, stock, staffed, innPay);
  const book = IN.book(I);
  const rev = IN.mealReview ? IN.mealReview(I, S.day) : { missed: I.diner.missed | 0, served: 0, short: [], dish: null };
  const garden = IN.gardenYield ? IN.gardenYield(I) : {};
  return {
    open: !!(plot || ctx.resort || ctx.coast || (townLv() >= 2 && S.eff && S.eff.town)),
    plot, plotName: L ? L.name : null, town: townOpen(), moved: (I.moved | 0) || 0, freed, cabins: I.cabins | 0, inn2: I.inn2 | 0, diner: I.diner.lv | 0,
    coast: !!ctx.coast, resort: ctx.resort, resortName: ctx.resort && PL.plot(ctx.resort) ? PL.plot(ctx.resort).name : null,
    huts: (I.resort && I.resort.huts) | 0, parasols: (I.resort && I.resort.parasols) | 0,
    stall: !!(I.resort && I.resort.stall), pier: !!(I.resort && I.resort.pier), deck: !!(I.resort && I.resort.deck),
    job: I.job, stars, starAvg: (I.stars && I.stars.avg) || 3, starBoost: staffed ? IN.STAR_BOOST : 0, furnish: innFurnished() ? IN.FURNISH : 0,
    guests: IN.staying(I, S.day), people: IN.peopleOf(I, S.day),
    seats: IN.seatsOf(I), dishes: IN.dishSlots(I, staffed),
    menu: I.diner.menu, auto: I.diner.menu === 'auto' || !Array.isArray(I.diner.menu),
    listed: menu.map(d => ({ id: d.id, name: d.name, pay: IN.dishPay(d, innPay), need: d.need, special: !!d.special, garden: !!d.garden, can: IN.canMake(d, stock) })),
    today: today.map(d => d.id), book, offers,
    earn: { rooms: I.earn.rooms | 0, meals: I.earn.meals | 0, today: I.earn.today | 0 },
    served: I.diner.served | 0, missed: I.diner.missed | 0, staffed, fest: innFest(),
    walkins: I.walkins | 0,
    cookCap: IN.kitchenCap ? IN.kitchenCap(I) : 0, garden,
    lastMeal: { day: I.diner.last | 0, served: rev.served, missed: rev.missed, short: rev.short, shortNames: (rev.short || []).map(id => IN.itemName ? IN.itemName(id) : id), dish: rev.dish },
  };
}
function innPayRooms(gold, notes, groups) {
  const L = innLay();
  innEarn(gold, 'inn-rooms', L ? L.board.x : undefined, L ? L.board.y - 8 : undefined);
  if (gold) log(`民宿结账收入 ${gold} 金` + (notes.length ? '，客人留言：' + notes.map(n => n.note).filter(Boolean).slice(0, 2).join('、') : ''));
  for (const g of groups) for (const s of STAYS) if (s.gid === g.id) { s.leaving = true; s.inside = false; s.wait = 0; s.what = 'leave'; s.pts = innLeavePath(s); }
}
function innMorning() {
  if (!IN || !S.inn) return;
  if (S.inn._morn === S.day) return; S.inn._morn = S.day;
  const done = IN.finish(S.inn, S.day);
  if (done === 'cabin') log(`小木屋盖好了，现在有 ${S.inn.cabins} 间`);
  if (done === 'diner') log('农家菜馆开张了，客人可以在院子里吃饭');
  if (done === 'kitchen') log(`厨房升到了第 ${IN.kitchenLv(S.inn)} 级，能多做两道菜、多摆几张桌子，每天能做 ${IN.kitchenCap(S.inn)} 份`);
  if (done === 'inn2') log('小木屋都加盖了二层，每间可以再住一组客人');
  if (done === 'hut') log(`沙滩小屋盖好了，现在海边有 ${S.inn.resort.huts} 间`);
  if (done === 'stall') log('海鲜摊开张了，用家里钓的海鱼做海鱼烤和海鲜汤');
  if (done === 'pier') log('游客栈桥铺好了，客人可以在海上钓鱼，钓到的会放回去');
  if (done === 'deck') log('日落观景台修好了，傍晚可以坐着看海上的落日');
  if (done && INN_ON) { IA.sync(true); markNavDirty(); innRepaint(); }
  const out = IN.checkOut(S.inn, S.day, () => IN.rateStay(innRateCtx()));
  if (out.gold || out.groups.length) innPayRooms(out.gold, out.notes, out.groups);
  if ((S.inn.arrived | 0) !== S.day) {
    const add = IN.checkIn(S.inn, S.day, innStarsNow(), innFest());
    S.inn.arrived = S.day;
    const innN = add.filter(g => IN.stayOf(g) !== 'beach').length, beachN = add.length - innN;
    if (add.length) { diaryNote('guests:' + add.length); albumSnap('inn', null, null, { wait: 150, re: true }); }
    if (add.length) log(`今天预计来 ${add.length} 组客人` + (beachN && innN ? `（民宿 ${innN} 组，海边 ${beachN} 组）` : (beachN ? '住沙滩小屋' : '住民宿')));
  }
  S.inn.earn.today = 0;
  if (INN_ON) IA.sync();
}
function innServeMeals() {
  if (!IN || !S.inn || !IN.dinerUp(S.inn) || S.inn.diner.last === S.day) return;
  const fest = innFest();
  const wantGroups = IN.groupsWanted(innStarsNow(), S.day, fest);
  const overflow = Math.max(0, wantGroups - (S.inn.cabins | 0));
  const walk = IN.walkinsOf(fest, overflow, S.day);
  S.inn.walkins = walk;
  const want = IN.mealsWanted(S.inn, S.day, fest, walk);
  const counts = innCounts();
  const usedNeed = [];
  const r = IN.serve(S.inn, want, counts, innStaffedNow(), innPay);
  if (r.farmNeed && Object.keys(r.farmNeed).length) {
    usedNeed.push(...Object.keys(r.farmNeed).map(id => ({ id, n: r.farmNeed[id] })));
  } else {
    for (const id of r.used) { const d = IN.DISH[id]; if (d) usedNeed.push(...d.need.filter(x => x.id !== 'greens')); }
  }
  if (usedNeed.length) innPullNeed(usedNeed);
  S.inn.diner.last = S.day;
  const L = innLay();
  innEarn(r.gold, 'inn-meals', L ? L.diner.door.x : undefined, L ? L.diner.door.y - 8 : undefined);
  const lack = r.short && r.short.length ? '，缺' + r.short.map(id => IN.itemName(id)).join('、') : '';
  if (r.n) log(`菜馆做了 ${r.n} 份农家菜，收入 ${r.gold} 金` + (r.missed ? `，还有 ${r.missed} 份没料做` + lack : ''));
  else if (r.missed) log('菜馆今天仓库里的料不够，有客人没吃上' + lack);
}
function innServeStall() {
  if (!IN || !S.inn || !IN.stallUp(S.inn) || (S.inn.resort && S.inn.resort._meal === S.day)) return;
  const want = IN.stallMealsWanted(S.inn, S.day);
  if (!want) { if (S.inn.resort) S.inn.resort._meal = S.day; return; }
  const counts = innCounts();
  const usedNeed = [];
  const r = IN.serveStall(S.inn, want, counts, innPay);
  for (const id of r.used) { const d = IN.DISH[id]; if (d) usedNeed.push(...d.need); }
  if (usedNeed.length) innPullNeed(usedNeed);
  if (S.inn.resort) S.inn.resort._meal = S.day;
  const L = IN.resortLayout();
  innEarn(r.gold, 'inn-meals', L ? L.stall.stand.x : undefined, L ? L.stall.stand.y - 6 : undefined);
  if (r.n) log(`海鲜摊做了 ${r.n} 份海味，收入 ${r.gold} 金` + (r.missed ? `，还有 ${r.missed} 份没料做` : ''));
  else if (r.missed) log('海鲜摊今天海里的鱼不够，有客人没吃上');
}
function innEntry() { return IN.entryOf(S.plots, townOpen()); }
function innRoute(from, to) {
  if (!to) return [];
  const pts = routeVia(from, to) || [];
  return pts.concat([to]);
}
function innLeavePath(s) {
  const e = innEntry();
  const back = innRoute(s, e).concat([{ x: e.x + 16, y: e.y }]);
  return back;
}
function innSpots(s) {
  const L = innLay(), out = [];
  if (L) {
    if (IN.dinerUp(S.inn)) {
      const tb = L.tables[(s.room + (s.id.length | 0)) % Math.max(1, L.tables.length)];
      if (tb) out.push({ what: 'eat', x: tb.x, y: tb.y + 2, wait: 36, rest: true });
    }
    out.push({ what: 'yard', x: L.yard.x + ((s.room * 7) % 13) - 6, y: L.yard.y + 4, wait: 20 });
  }
  const fx = 80 + ((s.room * 17) % 48), fy = 64 + ((s.room * 11) % 28);
  out.push({ what: 'field', x: fx, y: fy, wait: 24 });
  if (S.animals.length) {
    const a = S.animals[s.room % S.animals.length], P = PENS[penOfKind(a.kind)];
    if (P) out.push({ what: 'pet', x: P.trough.x + 8, y: P.trough.y + 6, wait: 28 });
  }
  const pond = (FS && FS.POND_SPOT && FS.POND_SPOT.stand) || { x: 54, y: 94 };
  out.push({ what: 'fish', x: pond.x, y: pond.y, wait: 48, hook: POND ? { x: POND.x, y: POND.y } : null });
  for (const pid of Object.keys(S.plots || {})) if (S.plots[pid].mod === 'playground') {
    const r = PL.plot(pid).rect; out.push({ what: 'play', x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2, wait: 28 });
  }
  if (S.inn && S.inn.resort && S.inn.resort.deck && IN.isSunset(S.t)) {
    const RL = IN.resortLayout(), seat = RL && RL.deck.sit[(s.room | 0) % RL.deck.sit.length];
    if (seat) out.push({ what: 'sunset', x: seat.x, y: seat.y, wait: 50, rest: true });
  }
  return out;
}
function innBeachSpots(s) {
  const L = IN.resortLayout(), out = [], r = S.inn && S.inn.resort;
  if (!L || !r) return out;
  if ((r.parasols | 0) > 0) {
    const u = L.parasols[(s.room | 0) % Math.max(1, r.parasols | 0)];
    if (u) out.push({ what: 'lie', x: u.x + 2, y: u.y + 2, wait: 42, rest: true });
  }
  out.push({ what: 'walk', x: 250 + ((s.room * 13) % 50), y: 240 + ((s.room * 5) % 8), wait: 18 });
  if (r.pier) out.push({ what: 'fish', x: L.pier.stand.x, y: L.pier.stand.y, wait: 48, hook: L.pier.hook });
  if (r.stall) out.push({ what: 'eat', x: L.stall.stand.x, y: L.stall.stand.y, wait: 32, rest: true });
  if (r.deck && IN.isSunset(S.t)) {
    const seat = L.deck.sit[(s.room | 0) % L.deck.sit.length];
    if (seat) out.push({ what: 'sunset', x: seat.x, y: seat.y, wait: 50, rest: true });
  }
  return out;
}
function innDoorOf(g) {
  if (IN.stayOf(g) === 'beach') {
    const L = IN.resortLayout(), h = L && L.huts[g.room];
    return h ? h.door : null;
  }
  const L = innLay(); if (!L) return null;
  const c = L.cabins[IN.cabinOf(g, S.inn)];
  return c ? c.door : null;
}
function innSpawnGroup(g, atDoor) {
  const door = innDoorOf(g); if (!door) return;
  const beach = IN.stayOf(g) === 'beach';
  const e = beach ? (IN.COAST && IN.COAST.gate) || { x: 220, y: 212 } : innEntry();
  const looks = beach ? IN.BEACH_LOOKS : IN.LOOKS;
  const shown = Math.min(g.n | 0 || 1, Math.max(0, IN.ON_SCREEN - STAYS.filter(s => !s.leaving).length));
  const T = S.t % 1440, night = innBedtime(T);
  for (let i = 0; i < shown; i++) {
    const look = looks[(looks.indexOf(g.look) + i + looks.length) % looks.length];
    const dest = { x: door.x + (i - 1) * 3, y: door.y + 2 };
    const from = atDoor ? dest : { x: e.x + i * 3, y: e.y + (i % 2) };
    STAYS.push({
      id: g.id + '_' + i, gid: g.id, look, room: g.room, n: g.n, lead: i === 0, stay: beach ? 'beach' : 'inn',
      x: from.x, y: from.y, fx: atDoor ? 0 : (beach ? 0 : -1), fy: atDoor ? 1 : (beach ? 1 : 0),
      pts: atDoor ? [] : innRoute(from, dest), moving: !atDoor, leaving: false,
      inside: !!(atDoor && night), wait: 0, what: atDoor ? (night ? 'sleep' : 'idle') : 'arrive',
      until: g.until, fromDay: g.from, at: g.at, task: null,
    });
  }
}
function innEnsure() {
  if (!IN || !S.inn) return;
  if (!innPlot() && !IN.hutsUp(S.inn)) return;
  const T = ((S.t % 1440) + 1440) % 1440;
  for (const g of IN.staying(S.inn, S.day)) {
    if (STAYS.some(s => s.gid === g.id)) continue;
    if (g.from === S.day && T < g.at) continue;
    innSpawnGroup(g, g.from !== S.day || T >= g.at + 20);
  }
  for (const g of IN.staying(S.inn, S.day)) {
    if (g.from !== S.day || T < g.at) continue;
    if (STAYS.some(s => s.gid === g.id)) continue;
    innSpawnGroup(g, false);
  }
}
function innBedtime(T) { // with a sunset deck, guests stay out to watch the sun until 19:00
  const bed = (IN && S.inn && IN.deckUp(S.inn)) ? 19 * 60 : 18 * 60;
  return T >= bed || T < IN.LEAVE_MORNING;
}
function innTick(dm) {
  if (!IN || !S.inn) return;
  const T = ((S.t % 1440) + 1440) % 1440;
  innEnsure();
  if (IN.dinerUp(S.inn) && T >= 11 * 60 + 30 && S.inn.diner.last !== S.day) innServeMeals();
  if (IN.stallUp(S.inn) && T >= 11 * 60 + 30 && !(S.inn.resort && S.inn.resort._meal === S.day)) innServeStall();
  const night = innBedtime(T);
  const leavingHour = T >= 7 * 60 && T < IN.LEAVE_MORNING + 40;
  for (let i = STAYS.length - 1; i >= 0; i--) {
    const s = STAYS[i];
    if (s.leaving) {
      if (s.inside) { s.inside = false; s.pts = innLeavePath(s); }
      guestStep(s, dm);
      if (!s.pts.length) STAYS.splice(i, 1);
      continue;
    }
    if (s.until <= S.day && leavingHour) { s.leaving = true; s.inside = false; s.pts = innLeavePath(s); continue; }
    if (s.inside) {
      if (!night && T >= IN.LEAVE_MORNING) { s.inside = false; s.wait = 4; s.what = 'idle'; }
      continue;
    }
    if (s.pts.length) { guestStep(s, dm); continue; }
    s.moving = false;
    if (s.wait > 0) { s.wait -= dm; continue; }
    if (night) {
      const door = innDoorOf({ stay: s.stay, room: s.room, id: s.gid });
      if (door && Math.hypot(s.x - door.x, s.y - door.y) > 3) { s.pts = innRoute(s, door); s.what = 'sleep'; s.task = null; continue; }
      s.inside = true; s.what = 'sleep'; s.task = null; continue;
    }
    const spots = s.stay === 'beach' ? innBeachSpots(s) : innSpots(s);
    if (!spots.length) continue;
    const pick = spots[(S.day * 7 + (s.room | 0) * 3 + (s.wait | 0) + Math.floor(T / 20)) % spots.length];
    s.what = pick.what; s.wait = pick.wait; s.task = pick.what === 'fish' && pick.hook ? { kind: 'fish', hook: pick.hook } : (pick.rest ? { rest: 1 } : null);
    s.pts = innRoute(s, pick);
  }
  if (INN_ON) IA.sync();
}


// ---- the wedding: decided in the morning, held that evening at the party area (or in front of the new house), then they move ----
function homeMorning() {
  const st = S.home;
  for (const k of HM.KID_IDS) { const w = st.wed[k]; if (w && !w.moved && w.day < S.day) homeMoveIn(k, false); } // an evening that was missed (offline): they moved anyway
  careerMorning();
  if (IN) innMorning();
  homeTeenDay();
  if (weddingTonight()) { const w = weddingTonight(); if (CR && w && CR.pathOf(st, w.kid).implied) careerOffer(w.kid); return; }
  const lastWed = Math.max(0, ...HM.KID_IDS.map(k => (st.wed[k] && st.wed[k].day) || 0));
  for (const k of S.family.kids) {
    const hi = st.houses.findIndex(h => h.built && !h.kid && !HM.KID_IDS.some(id => st.wed[id] && !st.wed[id].moved && st.wed[id].house === st.houses.indexOf(h)));
    const mate = HM.wedReady(st, { kid: k, stage: FAM.kidStage(k, S.day), house: hi >= 0, rain: rainDay(), lastWed, day: S.day });
    if (!mate) continue;
    st.wed[k.id] = { mate, day: S.day, moved: 0, house: hi };
    const area = partyArea(); if (area) { S.decor.party.tonight = S.day; S.decor.party.guests = 2; partyBegun = 0; }
    albumSnap('wedding', null, null, { wait: Math.max(0, HM.WED.from + 40 - Math.floor(S.t % 1440)), re: true, follow: k.id });
    log(`${k.name}和${HM.mateName(mate)}走得很近了：今晚${area ? '在派对区' : '在新房子门前'}办婚礼，之后搬进新房子。早上先选一个去向：留家种地、去镇上上班，或在镇上开店`); hearts(DOOR.x, DOOR.y, 30);
    if (CR) careerOffer(k.id);
    return;
  }
}
function homeMoveIn(kid, now) {
  const w = S.home.wed[kid]; if (!w || w.moved) return; const h = S.home.houses[w.house] || S.home.houses.find(q => q.built && !q.kid); if (!h) return;
  w.moved = S.day; h.kid = kid; w.house = S.home.houses.indexOf(h); spouseSync();
  if (now) { for (const id of HM.NB_IDS) if (townOpen() || S.home.nb[id]) HM.clampAdd(S.home.nb, id, HM.NB.wedding);
    log(`${kidName(kid)}和${HM.mateName(w.mate)}住进了${HM.siteName(h.site)}的新房子，以后自己种那 6 格小田，偶尔回来帮忙`); noteProgress({ married: true });
    const hd = HM.layout(h).door; albumSnap('newhouse', hd.x, hd.y - 2, { wait: 20 }); }
}
function weddingSpot() { const area = partyArea(); if (area) return null; const w = weddingTonight(); if (!w) return null; const h = S.home.houses[w.w.house]; return h ? HM.layout(h).door : null; }
function weddingSeat(i) { const d = weddingSpot(); if (!d) return null; if (i < 0) return { x: d.x + (i === -1 ? -2 : 2), y: d.y + 2 };
  return { x: d.x - 9 + 4.5 * (i % 5), y: d.y + 7 + 4 * Math.floor(i / 5) }; }
function weddingTask() { // no party area: everyone gathers in front of the new house
  const T = S.t % 1440, w = weddingTonight(); if (!w || T < HM.WED.from || T >= HM.WED.to || F.away || F.sleeping || partyArea()) return null;
  const couple = F.id === w.kid || F._spouse === w.kid, seat = couple ? weddingSeat(F._spouse ? -2 : -1) : weddingSeat(partyIndex(F)); if (!seat) return null;
  return { kind: 'party', label: couple ? '在新房子门前办婚礼' : '在新房子门前参加婚礼', to: { x: seat.x + R(-0.4, 0.4), y: seat.y + R(-0.3, 0.3) }, dur: Math.max(5, Math.min(30, HM.WED.to - T)), rest: true };
}
// ---- the couple's own day: their six tiles and two hens, sleep in the new house, an hour on the main farm now and then ----
function homeJobs(h) { const out = [], rain = WX && WX.isRaining(S.weather, S.day, S.t), L = HM.layout(h);
  for (const t of h._tiles || []) { if (t._by && t._by !== F && S.t - (t._byT || 0) < 30) continue;
    if (t.crop && SIM.ripe(t.crop)) out.push({ k: 'harvest', t });
    else if (t.crop && !t.watered && !rain) out.push({ k: 'water', t });
    else if (!t.tilled) out.push({ k: 'till', t });
    else if (!t.crop) out.push({ k: 'plant', t }); }
  if (h.eggs !== S.day && S.t % 1440 >= 7 * 60 && h.hens > 0 && !(h._eggBy && h._eggBy !== F && S.t - (h._eggT || 0) < 30)) out.push({ k: 'eggs', at: L.eggs });
  return out; }
function homeEarn(h, g, x, y) { if (!(g > 0)) return; S.coins += g; S.earned += g; S.todayEarn += g; S.home.earn += g; h._today = (h._todayDay === S.day ? h._today | 0 : 0) + g; h._todayDay = S.day;
  noteLog('income', 'crops', g); popText(x, y, 14, '+' + g, '#ffd76a'); }
function homeJobTask(h, j) {
  const t = j.t, at = t ? { x: t.x, y: t.y + 5 } : { x: j.at.x, y: j.at.y }, who = F;
  if (t) { t._by = F; t._byT = S.t; } else { h._eggBy = F; h._eggT = S.t; }
  const fin = () => { if (t) t._by = null; else h._eggBy = null; };
  if (j.k === 'harvest') return { kind: 'hs-harvest', label: `在自家小田收${SIM.CROPS[t.crop.type].name}`, to: at, tile: t, dur: 3, fx: 'leaf', pose: 'pull', done: () => { fin(); if (!t.crop || !SIM.ripe(t.crop)) return;
    const ty = t.crop.type; t.crop = null; t.watered = false; diary('h', ty); homeEarn(h, CR && h.kid ? CR.earnOf(priceOfAny(ty), S.home, h.kid) : priceOfAny(ty), t.x, t.y); burst(t.x, t.y, 4, ['#ffd76a', '#fff2a8'], 6, 'coin'); } };
  if (j.k === 'water') return { kind: 'hs-water', label: '在自家小田浇水', to: at, tile: t, dur: 3, fx: 'water', pose: 'water', done: () => { fin(); if (t.crop) { t.watered = true; burst(t.x, t.y, 6, ['#8cc6dc', '#5b9cc4'], 8, 'drop'); } } };
  if (j.k === 'till') return { kind: 'hs-till', label: '在自家小田翻土', to: at, tile: t, dur: 4, fx: 'dirt', pose: 'hoe', done: () => { fin(); t.tilled = true; burst(t.x, t.y, 1, ['#8b5a35', '#a06c43'], 6, 'dirt'); } };
  if (j.k === 'plant') return { kind: 'hs-plant', label: '在自家小田播种', to: at, tile: t, dur: 3, fx: 'seed', pose: 'pull', done: () => { fin(); if (t.crop || !t.tilled) return;
    t.crop = { type: HM.GARDEN[t.i % HM.GARDEN.length], age: 0, n: 0, stage: 0, rot: hr() * 6.28 }; diary('p', t.crop.type); if (WX && WX.isRaining(S.weather, S.day, S.t)) t.watered = true; } };
  return { kind: 'hs-eggs', label: '在小鸡舍捡鸡蛋', to: at, dur: 3, pose: 'pull', done: () => { fin(); if (h.eggs === S.day) return; h.eggs = S.day; const n = h.hens; homeEarn(h, n * priceOfAny('egg'), at.x, at.y - 4); hearts(at.x, at.y - 2, 6); } };
}
const mainBacklog = () => { let n = 0; for (const t of tiles) if (t.open && t.crop && (SU.canHarvest(t.crop, SIM.ripe) || (SU.canGrow(t.crop, SIM.ripe) && !t.watered))) n++; return n; };
function homeChoose() { // null: not one of the couple (or helping on the main farm right now); else their next job
  const h = homeOfActor(F); if (!h) return null;
  const T = S.t % 1440, L = HM.layout(h), sp = !!F._spouse, kid = F._spouse || F.id;
  if (partyTonight() && DC.partyOn(T) && !F.sleeping) { if (!sp) return null; const seat = partySpot(F);
    if (seat) return { kind: 'party', label: '在派对区和大家聚会', to: { x: seat.x, y: seat.y }, dur: partyDur(T), rest: true }; }
  if (T >= sleepAt() || T < WAKE - 30) { if (!sp && ((F.crops.length && shopOpen(T)) || (F.gathered && T < sleepAt() + 60))) return null; const me = F;
    return { kind: 'home', label: '回新房子睡觉', to: L.door, dur: 5, done: () => { me.home = true; me.sleeping = true; } }; }
  { const win = helpWinNow(T); // v5.11.0.28: 6–8 and 17–19 the married ones come over for the main farm's harvest and collecting
    if (win && F._helpOff !== win && (F._helpWin === win || farmHands() >= HM.HELP.backlog)) { if (F._helpWin !== win) { F._helpWin = win; log(`${F.name}从新房子过来帮忙收菜捡蛋`); } return null; }
    if (F._helpWin && F._helpWin !== win) helpEnd(); }
  const path = CR ? CR.pathOf(S.home, kid) : null;
  const fest = !!(MK && S.town && S.town.hall && MK.isDay(S.town.hall, S.day));
  const work = !!(CR && CR.worksToday(S.home, kid, fest));
  const shop = !!(CR && CR.shopsToday(S.home, kid, S.day));
  const inn = !!(CR && IN && CR.innsToday(S.home, kid) && innStand()); // v5.11.0.19: the kid was missing here, so 经营民宿 / 菜馆 never left the bench
  const dest = work ? CR.standOf(path.at) : shop ? (CR.standOf(path.at) || CR.doorOf(path.at)) : inn ? innStand() : null;
  // v5.10.6: commute to a job (rain still goes; a festival is a day off) or keep their own shop 9:00–17:00 (the spouse comes too)
  // v5.10.7: 经营民宿 / 菜馆 walks to the inn yard (same hours as a shop)
  // v5.11.0.19: once in the 农家乐区 on shift they move between the restaurant, the cabins and the gate (innDuty)
  if (inn && CR.shouldLeave(T) && T < CR.SHOP_HOURS.to && inAgri(F)) { const d = innDuty(F, sp); if (d) return d; }
  if (dest && (work || shop || inn) && CR.shouldLeave(T)) {
    const onShift = work ? CR.workHours(T) : CR.shopHours(T);
    const at = Math.hypot(F.x - dest.x, F.y - dest.y) < 5;
    if (onShift && at) {
      const label = work ? (`在${CR.JOB[path.at] ? CR.JOB[path.at].name : '镇上'}帮工`) : shop ? (`在${CR.shopName(kidName(kid), path.kind)}守店`) : '在民宿和菜馆招呼客人';
      return { kind: work ? 'work' : shop ? 'shop-keep' : 'inn-keep', label, to: dest, dur: 16, rest: true };
    }
    if (T < (work ? CR.WORK.end : CR.SHOP_HOURS.to)) {
      const label = work ? (`去${CR.JOB[path.at] ? CR.JOB[path.at].name : '镇上'}上班`) : shop ? (`去${CR.shopName(kidName(kid), path.kind)}守店`) : '去民宿招呼客人';
      return { kind: work ? 'work-go' : shop ? 'shop-go' : 'inn-go', label, to: dest, via: careerVia(F, dest, false), keepVia: true, dur: 8 };
    }
  }
  if (dest && (work || shop || inn) && T >= (work ? CR.WORK.end : CR.SHOP_HOURS.to) && T < BEDTIME) {
    // v5.11.0.19: once home (by the door, the bench or their little field) they stay; it used to send them up to the road and
    // back every time they stepped off the doorstep, which looked like an evening of commuting
    if (F._backDay !== S.day && Math.hypot(F.x - L.door.x, F.y - L.door.y) < 40) F._backDay = S.day;
    if (F._backDay !== S.day) { const me = F; return { kind: 'work-back', label: inn ? '从民宿回家' : '下班回家', to: L.door, via: careerVia(F, L.door, true), keepVia: true, dur: 4, done: () => { me._backDay = S.day; } }; }
  }
  if (fest && path && path.way === 'shop' && CR.shopReady(path, S.day) && T >= 10 * 60 && T < 16 * 60) {
    const d = CR.doorOf(path.at); if (d) return { kind: 'shop-fest', label: '节日在店门口和家人聚', to: { x: d.x + (sp ? 2 : -2), y: d.y + 3 }, dur: 16, rest: true }; }
  const help = S.home.help[kid];
  if (!sp && help && help.day === S.day && T < help.until) return null;     // an hour on the main farm
  if (!sp && F.crops.length - worksKeepN(F) > 0 && shopOpen(T)) return sellTask(); // what they picked up there goes to market first
  if (!sp && F.gathered > 0) return storeTask();
  const jobs = homeJobs(h);
  // when they work or keep a shop, the spouse tends the little farm in the morning and evening; chickens are still kept
  const tendOk = !work && !shop && !inn || (sp && (T < 9 * 60 || T >= 17 * 60)) || (!sp && !work && !shop && !inn);
  if (tendOk && jobs.length) { let best = null, bd = 1e9; for (const j of jobs) { const q = j.t || j.at, d = Math.hypot(q.x - F.x, q.y - F.y) + (j.k === 'harvest' ? -20 : j.k === 'water' ? -10 : 0); if (d < bd) { bd = d; best = j; } }
    F.idleCount = 0; return homeJobTask(h, best); }
  if (!sp && !work && !shop && !inn && HM.helpNow(help, { T, own: 0, backlog: mainBacklog(), helpDay: homeDayRng(0x4E1 + kidSalt(kid))() < (CR ? CR.helpDayP(S.home, kid) : HM.HELP.dayP) }, S.day, hr)) { const n = help && help.day === S.day ? help.n + 1 : 1;
    S.home.help[kid] = { day: S.day, n, last: T, until: Math.min(1440, T + HM.HELP.minutes) }; log(`${F.name}从新房子过来帮一会儿忙`); return null; }
  F.idleCount = (F.idleCount || 0) + 1;
  if (F.idleCount % 3 === 0) { const tile = h._tiles && h._tiles[Math.floor(hr() * h._tiles.length)]; if (tile) return { kind: 'idle', label: '在自家小田边转转', to: { x: tile.x + (hr() - 0.5) * 6, y: tile.y + 6 }, dur: 10 }; }
  return { kind: 'idle', label: '坐在新房子门口歇一会儿', to: { x: L.bench.x + (sp ? 2 : -2), y: L.bench.y + 1 }, dur: 20, rest: true };
}
// ---- the spouses: actors of their own (not family members, not saved: rebuilt from S.home.wed) ----
function makeSpouse(kid, w) { const i = HM.mateIndex(w.mate), h = S.home.houses[w.house], d = h ? HM.layout(h).door : DOOR;
  return Object.assign(makeMember({ id: 'sp_' + kid, name: HM.mateName(w.mate), role: 'teen' }), { _spouse: kid, look: TN.MATES[i].look, x: d.x, y: d.y, home: true, sleeping: false }); }
function spouseSync() {
  for (let i = SPOUSES.length - 1; i >= 0; i--) { const sp = SPOUSES[i], w = S.home.wed[sp._spouse]; if (!w || !w.mate || TN.MATES[HM.mateIndex(w.mate)].look !== sp.look) SPOUSES.splice(i, 1); }
  for (const k of HM.KID_IDS) { const w = S.home.wed[k]; if (!w || !w.moved || SPOUSES.some(s => s._spouse === k)) continue; SPOUSES.push(makeSpouse(k, w)); }
}
let homeLogDay = 0, weddingFxT = 0, wedVowDay = 0;
function homeTick(dm) {
  if (!HM || !S.home) return; const T = S.t % 1440;
  homeParty(T); if (TN && S.family.kids.length) homeTeenVisit(T);
  wedGather(T); // v5.11.0.21
  if (WX && WX.isRaining(S.weather, S.day, S.t)) for (const t of HT) if (t.crop) t.watered = true;
  // the wedding evening: the other half walks over from town (or up the east road), the couple moves in when it ends
  const w = weddingTonight();
  if (w) { if (T >= HM.WED.from - 60 && !SPOUSES.some(s => s._spouse === w.kid) && T < HM.WED.to) { const sp = makeSpouse(w.kid, w.w), from = townOpen() ? TN.SCHOOL_DOOR : EAST_IN[0];
      Object.assign(sp, { x: from.x, y: from.y, home: false }); SPOUSES.push(sp); log(`${sp.name}从${townOpen() ? '镇上' : '东边的路上'}走过来了`); }
    if (T >= HM.WED.from && T < HM.WED.to && !w.w.began) { w.w.began = 1; log(`婚礼开始了：${kidName(w.kid)}和${HM.mateName(w.w.mate)}，一家人都来了`); }
    { const W = wedCer(); if (W && DC.wedPhase(T) === 2 && wedVowDay !== S.day) { wedVowDay = S.day; const c = { x: (W.couple[0].x + W.couple[1].x) / 2, y: (W.couple[0].y + W.couple[1].y) / 2 }; // v5.11.0.21: under the arch
      burst(c.x, c.y, 28, [Ac[3], Ac[0], '#fff2a8', Rf[3]], 22, 'spark'); hearts(c.x, c.y, 26); log(`${kidName(w.kid)}和${HM.mateName(w.w.mate)}走到了花拱门下，交换了戒指`); } }
    if (T >= HM.WED.from && T < HM.WED.to && realT - weddingFxT > 1.2) { weddingFxT = realT; const a = memberOf(w.kid); if (a && !a.home) { hearts(a.x, a.y, 14); if (hr() < 0.3) burst(a.x, a.y, 20, [Ac[3], Rf[3], '#fff2a8'], 10, 'spark'); } }
    if (T >= HM.WED.to || (T < HM.WED.from - 120 && w.w.began)) { if (CR) careerEnsure(w.kid); homeMoveIn(w.kid, true); } }
  // the spouses: wake with the morning, then their own little farm
  for (const sp of SPOUSES) { if (sp.sleeping && T >= WAKE && T < BEDTIME) { sp.sleeping = false; sp.home = true; } F = sp; stepActor(dm); }
  F = FARMER;
  if (T >= 17 * 60) careerDayPay();
  if (T >= 18 * 60 && homeLogDay !== S.day) { homeLogDay = S.day; for (const h of S.home.houses) if (h.kid && h._todayDay === S.day && h._today) log(`${kidName(h.kid)}家的小田和小鸡今天挣了 ${h._today} 金，算进家里的收入`); }
  if (HOME_ON) HA.sync();
}
function wedGather(T) { // the ceremony is about to start: whoever is only pottering about (idle, playing) comes over now, not after it
  const W = wedCer(); if (!W) return; const ph = DC.wedPhase(T), c = wedCouple() || [];
  const all = actors(); for (const a of all.concat(SPOUSES.filter(s => !all.includes(s)))) { const k = a.task; if (!k || a.away || a.sleeping) continue;
    const i = c.indexOf(a.id); if (i >= 0 && ph < 2 && Math.hypot(a.x - W.start[i].x, a.y - W.start[i].y) < 2) a._wedStart = S.day; // ready at the far end: the walk may start
    if (ph < 2 && (i >= 0 || T >= DC.PARTY.from) && /^(idle|play-)/.test(k.kind || '')) { if (partySpot(a)) a.task = null; continue; }
    if (k.kind === 'party' && k.to) { const p = partySpot(a); if (p && Math.hypot(p.x - k.to.x, p.y - k.to.y) > 1.5) a.task = null; } } // the places moved on (a new phase): go to the new one now
}
function homeNight() { // a little-farm crop grows one day overnight if it was watered
  for (const t of HT) { if (t.crop && t.watered && !SIM.ripe(t.crop)) { t.crop.age++; t.crop.stage = SIM.stageOf(t.crop); } t.watered = false; }
  for (const id of Object.keys(S.home.help)) if (S.home.help[id].day < S.day) delete S.home.help[id];
}
// hens pecking round their little coop
const HENS_VIEW = [];
function homeDraw(list) {
  for (const sp of SPOUSES) { if (sp.home) continue; const sh = famSheet(wedLook(sp) || sp.look, 3); if (!sh) continue; const d = Object.assign({ bb: 1, x: sp.x, y: sp.y, sheet: sh, cut: 3 }, carryFields(sp), farmerPose(sp)); partyLook(d, sp, sp.id); list.push(d); }
  const T = S.t % 1440, sp = ANIMAL_SPR.chicken; if (!sp || !sp.r || !(T >= WAKE && T < BEDTIME)) return;
  S.home.houses.forEach((h, hi) => { if (!h.built || !h.hens) return; const L = HM.layout(h);
    for (let i = 0; i < h.hens; i++) { const k = hi * 2 + i; let v = HENS_VIEW[k]; if (!v) v = HENS_VIEW[k] = { x: L.coop.x, y: L.coop.y + 6, tx: L.coop.x, ty: L.coop.y + 6, step: 0, flip: false, cd: 0 };
      if (Math.hypot(v.x - L.coop.x, v.y - L.coop.y) > 20) { v.x = v.tx = L.coop.x; v.y = v.ty = L.coop.y + 6; }
      const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
      if (d > 0.3) { v.x += dx / d * 0.05; v.y += dy / d * 0.05; v.step++; v.flip = dx < 0; } else if (--v.cd <= 0) { v.cd = 60 + Math.floor(Math.random() * 120); v.tx = L.coop.x + (Math.random() - 0.5) * 12; v.ty = L.coop.y + 5 + Math.random() * 5; }
      list.push({ spr: (v.flip ? sp.l : sp.r)[d > 0.3 ? Math.floor(v.step / 6) % 2 : 2], x: v.x, y: v.y, w: 1 }); } });
}
function homeRestore(s) {
  S.home = HM.valid(s.home); for (const h of S.home.houses) h._tiles = null; homeTilesSync(); SPOUSES.length = 0; spouseSync(); HENS_VIEW.length = 0; homeGateKey = '';
  for (const k of HM.KID_IDS) { const h = HM.isMarried(S.home, k) ? HM.houseOf(S.home, k) : null, m = memberOf(k); if (h && m) { const d = HM.layout(h).door; m.x = d.x; m.y = d.y; } }
  const night = FARMER.sleeping; for (const sp of SPOUSES) { sp.sleeping = night; sp.home = true; }
  homePartyNoted = 0; homeFriendDay = 0; if (HOME_ON) HA.sync(true);
}
// the panel lines: who each child is close to, and the neighbours the family knows
function homeStatus() {
  const kids = S.family.kids.map(k => ({ id: k.id, name: k.name, stage: FAM.kidStage(k, S.day), note: HM.kidNote(S.home, k.id, k.name), rel: HM.kidRel(S.home, k.id), married: HM.isMarried(S.home, k.id), wed: S.home.wed[k.id] || null, path: CR ? CR.pathOf(S.home, k.id) : null }));
  return { kids, nb: HM.nbRel(S.home), houses: S.home.houses.map(h => ({ site: h.site, name: HM.siteName(h.site), built: h.built, kid: h.kid })), earn: S.home.earn, wage: S.home.wage || 0, open: townOpen() };
}
function spouseTask() { // the other half before they have moved in (the wedding evening), or after (their own day)
  if (F.crops.length && !F._helpWin && shopOpen(S.t % 1440) && homeOfActor(F)) return Object.assign(sellTask(), { kind: 'sell' }); // v5.11.0.28: what they gathered on the main farm goes to market
  const own = homeChoose(); if (own) return own;
  if (F._helpWin) return null; // v5.11.0.28: helping on the main farm (chooseTask's board)
  const T = S.t % 1440;
  if (partyTonight() && T >= DC.PARTY.from - 60 && T < DC.PARTY.to) { const seat = partySpot(F);
    if (seat) return { kind: 'party', label: T >= DC.PARTY.from ? '在派对区参加婚礼' : '来参加婚礼', to: { x: seat.x, y: seat.y }, dur: T >= DC.PARTY.from ? partyDur(T) : 10, rest: true }; }
  const area = partyArea(), d = weddingSpot() || (area ? { x: area.x + 12, y: area.y + 8 } : DOOR);
  return { kind: 'idle', label: weddingTonight() ? '来参加婚礼' : '在附近等一会儿', to: { x: d.x + 3, y: d.y + 6 }, dur: 10, rest: true };
}
let decorSyncT = 0, partyFxT = 0;
function decorFrame() {
  if (!DECOR_ON) return; if (realT - decorSyncT > 0.2 || realT < decorSyncT) { decorSyncT = realT; DA.sync(); if (YARD_ON) YA.sync(false, clothesOut()); }
  const T = S.t % 1440;
  if (!S.decor.moon && dayLight(T) > 0.5 && (DA.litLamps().length || PWA.litLamps().length)) { S.decor.moon = 1; noteProgress({ litLamp: true }); log('天黑了，接上电的灯亮了起来'); }
  if (partyTonight() && DC.partyOn(T) && partyBegun === S.day && realT - partyFxT > 1.6) { partyFxT = realT; // now and then a heart over someone at the table
    const at = actors().filter(a => a.task && a.task.kind === 'party' && !a.moving).concat(GUESTS.filter(g => !g.moving)); if (at.length) { const a = at[Math.floor(Math.random() * at.length)]; hearts(a.x, a.y, 22); } }
}
function decorNight() { decorBookCheck(); }
// v5.10.11.1: decorations the family places on its own (bought in the shop, 「家人会找地方摆上」) used to wait at priority 40
// and could sit in the storehouse for days on a busy farm; overnight (and once on load) they go on their tidy slots.
// Only the family's own place orders: the player's own moves stay theirs. What has no free slot stays in the storehouse.
function decorCatchUp(pre) {
  const D = S.decor, names = [];
  for (let guard = 0; guard < 60; guard++) {
    let q = D.orders.find(o => !o.mine && o.op === 'place' && o.what === 'decor');
    if (!q) { if (D.orders.some(o => !o.mine)) break;
      const id = Object.keys(D.inv).find(k => (D.inv[k] | 0) - keptOf(k) > 0 && k !== 'party' && autoSpot(k)); if (!id) break;
      const sp = autoSpot(id), r = orderThing('place', 'decor', null, id, sp.x, sp.y, false); if (!r.ok) break; q = r.q; }
    const name = thingName(q); if (!settle(q)) break; names.push(name); }
  if (names.length) { dcSince = null; const c = {}; names.forEach(n => { c[n] = (c[n] || 0) + 1; });
    log(`${pre}${Object.keys(c).map(n => c[n] > 1 ? n + ' ' + c[n] + ' 件' : n).join('、')}摆好了`); }
  return names.length;
}
const decorBusy = id => { const r = PL.plot(id) && PL.plot(id).rect; return r && S.decor.placed.some(p => WD.inRect(p.x, p.y, r)) ? '地块上摆着装饰，先把它们挪走' : null; };
// ---- the toolbar: 「摆…」 places one from the storehouse, 「挪东西」 picks a thing and then its new spot ----
function movables() { const out = [];
  for (const p of S.decor.placed) out.push({ what: 'decor', ref: p.u, id: p.id, x: p.x, y: p.y, r: DC.CATALOG[p.id].big ? 14 : 6 });
  for (const id of PW.WORK_IDS) { const w = S.works.works[id]; if (w && w.at) { const p = PW.workPos(w); out.push({ what: 'work', ref: id, x: p.x, y: p.y, r: 10 }); } }
  PWA.hiveSpots().forEach((h, i) => { if (h) out.push({ what: 'hive', ref: i, x: h.x, y: h.y, r: 6 }); });
  S.works.sprinklers.forEach((s, i) => out.push({ what: 'spr', ref: i, x: s.x, y: s.y, r: 6 }));
  if (HM) S.home.houses.forEach((h, i) => out.push({ what: 'home', ref: i, x: h.x, y: h.y, r: 12 })); // v5.9.0
  return out; }
// v5.11.0.2: a touch shell (xhs) can ask for a smallest pick radius in CSS px (TOUCH.pickCss); 0 on the web, so the mouse picks exactly as before
function pickFloor() { if (!TOUCH.pickCss) return 0; const r = cv.getBoundingClientRect(); return r.width ? TOUCH.pickCss / (RS * r.width / W) : 0; }
function movableAt(x, y) { let best = null, bd = 1e9; const lo = pickFloor(); for (const m of movables()) { const d = Math.hypot(m.x - x, m.y - y); if (d < Math.max(m.r, lo) && d < bd) { bd = d; best = m; } } return best; }
const invFree = id => (S.decor.inv[id] | 0) - S.decor.orders.filter(q => q.op === 'place' && q.id === id).length;
function decorHover(w) {
  if (INPUT.mode === 'decor') { const r = placeOk(w.x, w.y, 'decor', INPUT.kind, null); return { dec: { box: r.box, ok: r.ok } }; }
  if (INPUT.mode === 'move') { const m = INPUT.mvPick; if (!m) return { dec: null };
    if (m.what === 'spr') { const r = sprinklerSpot(w.x, w.y, m.ref); return { dec: { box: [w.x - 2, w.y - 2, w.x + 2, w.y + 2], ok: r.ok } }; }
    if (m.what === 'home') { const r = homeMoveOk(w.x, w.y, m.ref); return { dec: { box: r.box, ok: r.ok } }; }
    const r = placeOk(w.x, w.y, m.what, m.id, { what: m.what, ref: m.ref }); return { dec: { box: r.box, ok: r.ok } }; }
  return null;
}
function decorClick(w) {
  if (INPUT.mode === 'decor') { const id = INPUT.kind; if (invFree(id) <= 0) return { ok: false, why: `仓库里没有${(DC.CATALOG[id] || {}).name || '这个'}了` };
    const r = placeOk(w.x, w.y, 'decor', id, null); if (!r.ok) return r;
    const o = orderThing('place', 'decor', null, id, r.x, r.y, true); if (!o.ok) return o;
    say(`标记好了，家人会把${DC.CATALOG[id].name}搬过去`); if (invFree(id) <= 0) setMode(null); return { ok: true }; }
  if (INPUT.mode === 'move') {
    if (!INPUT.mvPick) { const m = movableAt(w.x, w.y); if (!m) return { ok: false, why: '先点要挪的东西：装饰、加工坊、蜂箱、浇水器或新房子（老房子不能挪）' }; INPUT.mvPick = m; say(m.what === 'work' ? `选中了${thingName({ what: m.what, ref: m.ref, id: m.id })}，再点新位置：任何一块工坊院里的空地都行（绿框，每块最多 ${PW.YARD_SLOTS} 座），原料和成品跟着走` : m.what === 'home' ? '选中了新房子，再点新位置：买下的花甸、农田，或家里已买下的地（绿框，一块地一座）' : `选中了${thingName({ what: m.what, ref: m.ref, id: m.id })}，再点新位置`); return null; }
    const m = INPUT.mvPick; const again = movableAt(w.x, w.y); if (again && again.what === m.what && again.ref === m.ref) { INPUT.mvPick = null; say('取消选择'); return null; }
    const r = m.what === 'spr' ? sprinklerSpot(w.x, w.y, m.ref) : m.what === 'home' ? homeMoveOk(w.x, w.y, m.ref) : placeOk(w.x, w.y, m.what, m.id, { what: m.what, ref: m.ref }); if (!r.ok) return r;
    const o = orderThing('move', m.what, m.ref, m.what === 'decor' ? null : null, m.what === 'spr' ? w.x : r.x, m.what === 'spr' ? w.y : r.y, true); if (!o.ok) return o;
    INPUT.mvPick = null; say(`标记好了，家人会把${thingName({ what: m.what, ref: m.ref, id: m.id })}挪过去`); return { ok: true }; }
  return null;
}
// v5.10.12: with a workshop picked in 挪东西, every 工坊院 is outlined: green with room (any region), red when full
function workYardsDraw(ref) {
  const w = S.works.works[ref]; if (!w) return;
  for (const id of PW.ownedSorted(S.plots, 'workshop')) { const r = PL.plot(id).rect, n = PW.WORK_IDS.filter(k => k !== ref && S.works.works[k] && S.works.works[k].at === id).length;
    const ok = id === w.at || PW.slotIn(S.works.works, id, ref) >= 0, c = [proj(r[0], r[1]), proj(r[2], r[1]), proj(r[2], r[3]), proj(r[0], r[3])];
    ctx.save(); ctx.beginPath(); c.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = ok ? 'rgba(120, 220, 120, 0.16)' : 'rgba(230, 80, 70, 0.16)'; ctx.fill();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeStyle = ok ? 'rgba(150, 240, 140, 0.9)' : 'rgba(240, 110, 100, 0.9)'; ctx.stroke(); ctx.setLineDash([]);
    const m = proj((r[0] + r[2]) / 2, r[1] + 4), t = `${PL.plot(id).name} · ${id === w.at ? '现在在这里' : ok ? `能放（${n}/${PW.YARD_SLOTS}）` : `满了（${n}/${PW.YARD_SLOTS}）`}`;
    ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const tw = ctx.measureText(t).width + 10;
    ctx.fillStyle = 'rgba(30, 20, 12, 0.78)'; ctx.fillRect(Math.round(m[0] - tw / 2), Math.round(m[1] - 8), Math.round(tw), 16);
    ctx.fillStyle = ok ? '#c8f5b8' : '#ffc0b8'; ctx.fillText(t, Math.round(m[0]), Math.round(m[1])); ctx.restore(); }
}
// ---- v5.11.0.15: what people do at the party. The sim only has them standing at their place (partySpot); all of this is
// drawn from realT each frame (no state, nothing saved): bites and chewing at the table, a toast now and then, hops on the
// dance floor, little bubbles on the rug, and the children chasing a ball round their lawn. Plates, the barrel, the lantern
// poles and the boards / rug are only out on a party evening.
const PARTY_FX = []; let PARTY_FX_LAST = [], PARTY_DRAW_LAST = [];
const PLATE_FOOD = [pix(['.ryR.', 'cEcEc', '.ccc.']), pix(['.oyo.', 'cEcEc', '.ccc.']), pix(['.ppl.', 'cEcEc', '.ccc.'])];
const PLATE_LEFT = [pix(['..yR.', 'cEcEc', '.ccc.']), pix(['...o.', 'cEcEc', '.ccc.']), pix(['..p..', 'cEcEc', '.ccc.'])];
const PLATE_DONE = pix(['.....', 'cEyEc', '.ccc.']);
const PARTY_POLE = pix(['.yyy.', 'yAcAy', '.yyy.', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '.bbb.']);
const PARTY_BARREL = pix(['.c.c.c.', 'btttttb', 'bwwwwwb', 'btttttb', 'btttttb', 'bwwwwwb', 'btttttb', '.bbbbb.']);
const partyHash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
function facePose(fx, fy) { const sx = fx * CA - fy * SA, sy = fx * SA + fy * CA, side = Math.abs(sx) > Math.abs(sy) * 0.9;
  return side ? { row: 'idle_side', flip: sx < 0, side: 1 } : { row: sy > 0 ? 'idle_front' : 'idle_back', flip: false, side: 0 }; }
// ---- v5.11.0.21 婚礼 at the party area: the walk up the aisle and the ceremony poses (drawn only, from the clock; nothing saved) ----
// the couple's drawn place while they walk the aisle (17:45–18:00): slowly from the far end to the arch, side by side
function wedWalkAt(i, T) { const W = wedCer(); if (!W || DC.wedPhase(T) !== 1) return null;
  const u = Math.min(1, (T - DC.WEDDING.walk) / (DC.WEDDING.at - 2 - DC.WEDDING.walk)), s = W.start[i], e = W.couple[i];
  return { x: s.x + (e.x - s.x) * u, y: s.y + (e.y - s.y) * u, u, f: facePose(e.x - s.x, e.y - s.y) }; }
function wedWalk(d, a) {
  if (a.home || a.away || !a.task || a.task.kind !== 'party') return false; const c = wedCouple(), i = c ? c.indexOf(a.id) : -1; if (i < 0) return false;
  if (a._wedStart !== S.day) return false; const p = wedWalkAt(i, S.t % 1440); if (!p || p.u >= 1) return false;
  d.x = p.x; d.y = p.y; d.row = p.f.side ? 'walk_side' : p.f.row === 'idle_front' ? 'walk_front' : 'walk_back'; d.flip = p.f.flip; d.fr = Math.floor(realT * 3) % 4; d.z = 0; d.partyKey = c[i]; return true; }
function wedPose(d, a, P, h, ph, fx) {
  const W = wedCer(); if (!W) return; const T = S.t % 1440, wp = DC.wedPhase(T);
  if (P.act === 'wed-couple') {
    if (wp === 2) { const o = W.couple[1 - P.i], f = facePose(o.x - P.x, o.y - P.y); d.row = f.row; d.flip = f.flip; d.fr = 0; // face each other under the arch
      const t = realT / 2.6 + P.i * 0.5, u = t - Math.floor(t); d.z = u < 0.25 ? Math.floor(u * 16) % 2 : 0;
      if (P.i === 0) { const m = W.couple[1]; fx('wheart', { x: (P.x + m.x) / 2, y: (P.y + m.y) / 2, u: (realT / 2.6) % 1 }); } return; }
    const f = facePose(W.arch.x - P.x, W.arch.y - P.y); d.row = f.row; d.flip = f.flip; d.fr = 0; return; } // waiting at the far end, looking up the aisle
  // a guest: turned to the couple (wherever they are on the aisle), clapping now and then once they stand under the arch
  const c = wp === 1 ? [wedWalkAt(0, T), wedWalkAt(1, T)].filter(Boolean) : wp === 2 ? W.couple : W.couple, m = c.length ? { x: (c[0].x + c[c.length - 1].x) / 2, y: (c[0].y + c[c.length - 1].y) / 2 } : W.arch;
  const f = facePose(m.x - P.x, m.y - P.y); d.row = f.row; d.flip = f.flip; d.fr = 0;
  if (wp === 2) { const t = realT / 3.4 + ph, n = Math.floor(t), u = t - n; if (u < 0.3) d.z = Math.floor(u * 26) % 2; else if (u > 0.55 && u < 0.85 && (n + h) % 3 === 0) fx('say', { u: (u - 0.55) / 0.3, icon: 0 }); }
}
const ARCH_SPR = (() => { // a white arch wound with greenery, pink and cream roses (billboard, anchored at its foot)
  const w = 27, hh = 32, cx = 13, cy = 13, R0 = 13, R1 = 10, rows = [];
  const hsh = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
  for (let y = 0; y < hh; y++) { let r = '';
    for (let x = 0; x < w; x++) { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), k = hsh(x, y) % 11;
      const band = y <= cy ? d <= R0 && d >= R1 : (x <= 2 || x >= w - 3);
      if (!band) { r += '.'; continue; }
      if (y > cy && y >= hh - 2) { r += (x === 0 || x === w - 1) ? 'w' : 'b'; continue; }           // the feet
      if (y > cy + 6 && k > 5) { r += (x === 1 || x === w - 2) ? 'c' : 'E'; continue; }             // bare white posts lower down
      r += k === 0 || k === 5 ? 'p' : k === 3 ? 'c' : k === 8 ? 'y' : k % 2 ? 'g' : 'l'; }
    rows.push(r); }
  return pix(rows);
})();
const WED_CAKE = pix(['....p....', '...cpc...', '...ccc...', '..cEcEc..', '..ccccc..', '.pcpcpcp.', '.ccccccc.', '.cEcEcEc.', 'eeeeeeeee']);
function wedList(list) { // the arch (all evening) and the cake on the table (once the party is on)
  const L = partyLawnNow(), W = L.wed; if (!W || fogHid(W.arch.x, W.arch.y)) return; list.push({ spr: ARCH_SPR, x: W.arch.x, y: W.arch.y, w: 1 });
  const area = partyArea(); if (partyLive()) list.push({ spr: WED_CAKE, x: area.x, y: area.y, lift: 6, at: area });
}
function wedGround() { // the cream runner up the aisle, petals on it (flat, under everyone)
  const W = partyLawnNow().wed; if (!W || fogHid(W.arch.x, W.arch.y)) return; const [a, b] = W.runner, hw = 2;
  const x0 = Math.min(a.x, b.x) - (W.u[1] ? hw : 0), x1 = Math.max(a.x, b.x) + (W.u[1] ? hw : 0), y0 = Math.min(a.y, b.y) - (W.u[0] ? hw : 0), y1 = Math.max(a.y, b.y) + (W.u[0] ? hw : 0);
  const u0 = Math.round((x0 - GX0) * RS), v0 = Math.round((y0 - GY0) * RS), w = Math.round((x1 - x0) * RS), hh = Math.round((y1 - y0) * RS);
  ctx.fillStyle = St[2]; ctx.fillRect(u0 - 1, v0 - 1, w + 2, hh + 2); ctx.fillStyle = Ac[0]; ctx.fillRect(u0, v0, w, hh);
  ctx.fillStyle = St[3]; if (W.u[1]) { ctx.fillRect(u0, v0, 1, hh); ctx.fillRect(u0 + w - 1, v0, 1, hh); } else { ctx.fillRect(u0, v0, w, 1); ctx.fillRect(u0, v0 + hh - 1, w, 1); }
  for (let i = 0; i < 40; i++) { const hx = (i * 2654435761) >>> 0, px = u0 + 2 + (hx % Math.max(1, w - 4)), py = v0 + 2 + ((hx >> 8) % Math.max(1, hh - 4)); ctx.fillStyle = i % 3 ? Ac[3] : Rf[3]; ctx.fillRect(px, py, 1 + (i % 2), 1); }
}
function wedFxDraw() { // bunting from the arch to the area's near posts; falling petals and the rings' little hearts during the ceremony
  const W = partyLawnNow().wed; if (!W || fogHid(W.arch.x, W.arch.y)) return; const area = partyArea(), posts = DC.partyPosts(area), T = S.t % 1440;
  const vx = -W.u[1], vy = W.u[0], ends = [-1, 1].map(s => ({ x: W.arch.x + vx * 6 * s, y: W.arch.y + vy * 6 * s }));
  for (const e of ends) { const p = posts.slice().sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
    const [ax, ay] = proj(e.x, e.y), [bx, by] = proj(p.x, p.y), za = 26, zb = 20, n = Math.max(4, Math.round(Math.hypot(bx - ax, by - ay) / 4));
    for (let i = 0; i <= n; i++) { const t = i / n, x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t - (za + (zb - za) * t) + Math.sin(Math.PI * t) * 5);
      ctx.fillStyle = Wd[2]; ctx.fillRect(x, y, 1, 1); if (i % 2 || i === 0 || i === n) continue;
      ctx.fillStyle = (i >> 1) % 2 ? Ac[3] : Ac[0]; ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1); } }
  const wp = DC.wedOn(T) ? DC.wedPhase(T) : -1; if (wp !== 2 && !(T >= DC.WEDDING.end && T < DC.WEDDING.end + 15)) return;
  const fade = wp === 2 ? 1 : 1 - (T - DC.WEDDING.end) / 15, n = Math.round(22 * fade), c = { x: (W.couple[0].x + W.couple[1].x) / 2, y: (W.couple[0].y + W.couple[1].y) / 2 };
  for (let i = 0; i < n; i++) { const hx = (Math.imul(i + 1, 2654435761) >>> 0), per = 2.6 + (hx % 7) / 5, t = ((realT + (hx % 97) / 31) % per) / per;
    const wx = c.x + ((hx >> 4) % 25) - 12, wy = c.y + ((hx >> 10) % 11) - 5, [sx, sy] = proj(wx, wy), z = 38 * (1 - t);
    ctx.fillStyle = [Ac[3], Ac[0], Rf[3], Ac[1]][i % 4]; ctx.fillRect(Math.round(sx + Math.sin(t * 9 + i) * 3), Math.round(sy - z), 2 - (i % 2), 1); }
}
const partyLive = () => DECOR_ON && partyTonight() && DC.partyOn(S.t % 1440) && partyBegun === S.day;
const partyProps = () => { const T = S.t % 1440; return DECOR_ON && partyTonight() && T >= DC.PARTY.from - 20 && T < DC.PARTY.to; };
function partyLook(d, a, key) { // d: the draw entry (x, y, row, fr, flip, z), a: the actor or guest
  if (d && a && wedWalk(d, a)) return; // v5.11.0.21: the couple walking up the aisle
  if (!d || !a || a.moving || a.home || !partyLive()) return;
  if (!a.pts && !(a.task && a.task.kind === 'party')) return;
  const P = partyPlanNow()[key]; if (!P || Math.hypot(a.x - P.x, a.y - P.y) > 2.5) return;
  d.partyKey = key; const area = partyArea(), h = partyHash(key), ph = (h % 997) / 997 * 6.283, cut = d.cut || 0, fx = (k, o) => PARTY_FX.push(Object.assign({ k, x: d.x, y: d.y, cut }, o));
  if (P.act === 'wed-guest' || P.act === 'wed-couple') { wedPose(d, a, P, h, ph, fx); return; } // v5.11.0.21
  if (P.act === 'eat') {
    const f = facePose(0, area.y - P.y), col = P.seat % 3, per = 2.4, t = realT / per + col * 0.07, n = Math.floor(t), u = t - n;
    d.row = f.row; d.flip = f.flip; d.fr = 0;
    if (n % 4 === 3) { d.z = u > 0.15 && u < 0.85 ? 1 : 0; fx('cup', { u, back: f.row === 'idle_back', side: f.flip ? -1 : 1 }); } // both sides of the table raise a cup together
    else if (u < 0.3) { if (f.row !== 'idle_back') fx('bite', { u: u / 0.3, food: (P.seat + (h & 1)) % 3, down: P.y < area.y ? 1 : -1 }); }
    else if (u < 0.85) { d.z = Math.floor(u * 14) % 2; if (f.row !== 'idle_back' && u < 0.7) fx('crumb', { u: (u - 0.3) / 0.4, h }); }
    return; }
  if (P.act === 'dance') {
    const beat = Math.floor(realT * 2.4 + ph / 3); d.row = 'idle_side'; d.flip = beat % 2 === 1; d.fr = 0; d.z = Math.round(Math.abs(Math.sin(realT * 7.5 + ph)) * 3);
    const t = (realT * 0.6 + ph) % 1.6; if (t < 1) fx('note', { u: t, n: (beat >> 1) % 2 });
    return; }
  if (P.act === 'chat' || P.act === 'stand') {
    const L = partyLawnNow().lawn.find(l => l.kind === 'chat' && P.act === 'chat'), c = L ? L.barrel : area, f = facePose(c.x - P.x, c.y - P.y);
    d.row = f.row; d.flip = f.flip; d.fr = 0;
    const t = realT / 3.1 + ph, n = Math.floor(t), u = t - n; if (u < 0.42) { d.z = Math.floor(u * 20) % 2; fx('say', { u, icon: (n + h) % 4 }); }
    return; }
  if (P.act === 'play') { // pass the ball from fixed places: no children running through one another or the diners
    const L = partyLawnNow().lawn.find(l => l.kind === 'play'); if (!L) return;
    const f = facePose(L.x - P.x, L.y - P.y), beat = Math.sin(realT * 3 + ph);
    d.row = f.side ? 'walk_side' : f.row === 'idle_front' ? 'walk_front' : 'walk_back'; d.flip = f.flip;
    d.fr = Math.floor(realT * 4 + ph) % 4; d.z = Math.round(Math.max(0, beat) * 2); return;
  }
}
function partyList(list) { // plates under the diners, the barrel, the lantern poles, the ball
  if (!partyProps()) return; const area = partyArea(), L = partyLawnNow(), live = partyLive(), T = S.t % 1440;
  if (L.wed) wedList(list); // v5.11.0.21
  for (const l of L.lawn) { if (fogHid(l.x, l.y)) continue; list.push({ spr: PARTY_POLE, x: l.pole.x, y: l.pole.y, w: 1 }); if (l.barrel) list.push({ spr: PARTY_BARREL, x: l.barrel.x, y: l.barrel.y, w: 1 }); }
  if (!live) return;
  const plan = partyPlanNow(), u = (T - DC.phaseStart(T)) / (DC.phaseEnd(T) - DC.phaseStart(T)), here = k => { const a = k === 'farmer' ? FARMER : (memberOf(k) || GUESTS.find(g => g.id === k) || SPOUSES.find(s => s.id === k)); const P = plan[k]; return a && P && !a.moving && !a.home && Math.hypot(a.x - P.x, a.y - P.y) < 2.5; };
  for (const k of Object.keys(plan)) { const P = plan[k]; if (!P || P.act !== 'eat' || !here(k)) continue; const s = P.seat;
    list.push({ spr: u < 0.45 ? PLATE_FOOD[s % 3] : u < 0.85 ? PLATE_LEFT[s % 3] : PLATE_DONE, x: P.x, y: area.y + (P.y < area.y ? -1.2 : 1.2), lift: 5, at: area }); }
  const play = L.lawn.find(l => l.kind === 'play');
  if (play && Object.keys(plan).some(k => plan[k] && plan[k].act === 'play' && here(k))) { const u = (Math.sin(realT * 2.2) + 1) / 2, a = play.spots[0], b = play.spots[1]; PARTY_FX.push({ k: 'ball', x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: Math.abs(Math.sin(realT * 4.4)) * 6 }); }
}
function partyGround() { // the dance floor's boards and the picnic rug, flat on the grass under everyone
  if (!partyProps()) return; const L = partyLawnNow().lawn, wed = partyLawnNow().wed; if (!L.length && !wed) return;
  const [gx, gy] = proj(GX0, GY0); ctx.setTransform(CA, SA * K, -SA, CA * K, Math.round(gx), Math.round(gy));
  if (wed) wedGround(); // v5.11.0.21: the aisle
  for (const l of L) { if (fogHid(l.x, l.y) || !onScreen(l.x, l.y, 40)) continue; const b = l.box, u0 = Math.round((b[0] + 1.5 - GX0) * RS), v0 = Math.round((b[1] + 1.5 - GY0) * RS), w = Math.round((b[2] - b[0] - 3) * RS), hh = Math.round((b[3] - b[1] - 3) * RS);
    if (l.kind === 'dance') { ctx.fillStyle = Wd[1]; ctx.fillRect(u0 - 1, v0 - 1, w + 2, hh + 2); for (let i = 0; i < hh; i += 4) { ctx.fillStyle = (i >> 2) % 2 ? Wd[3] : Wd[4]; ctx.fillRect(u0, v0 + i, w, Math.min(3, hh - i)); } }
    if (l.kind === 'chat') { const u1 = u0 + 2, v1 = v0 + 2, w1 = w - 4, h1 = hh - 4; ctx.fillStyle = Rf[1]; ctx.fillRect(u1 - 1, v1 - 1, w1 + 2, h1 + 2);
      for (let y = 0; y < h1; y += 4) for (let x = 0; x < w1; x += 4) { ctx.fillStyle = ((x + y) >> 2) % 2 ? Ac[0] : Rf[2]; ctx.fillRect(u1 + x, v1 + y, Math.min(4, w1 - x), Math.min(4, h1 - y)); } } }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function partyFxDraw(night) { // after the objects: lantern strings out to the lawn, then cups, bites, crumbs, notes, bubbles, the ball
  if (partyProps()) { const area = partyArea(), posts = DC.partyPosts(area), lit = night > 0.15;
    for (const [i, l] of partyLawnNow().lawn.entries()) { if (fogHid(l.x, l.y)) continue; const p = posts.slice().sort((a, b) => Math.hypot(a.x - l.pole.x, a.y - l.pole.y) - Math.hypot(b.x - l.pole.x, b.y - l.pole.y))[0];
      DA.string(ctx, proj, p, l.pole, 20, 18, 12, lit, realT, 5 + i); }
    if (partyLawnNow().wed) wedFxDraw(); } // v5.11.0.21
  for (const o of PARTY_FX) { if (fogHid(o.x, o.y)) continue; const [sx0, sy0] = proj(o.x, o.y), x = Math.round(sx0), top = Math.round(sy0) - 22 + o.cut, mouth = top + 8;
    if (o.k === 'cup') { const lift = Math.round(Math.min(1, o.u * 4, (1 - o.u) * 4) * 5), cx = x + (o.back ? 0 : 5 * o.side) - 1, cy = mouth - lift;
      ctx.fillStyle = Ink[0]; ctx.fillRect(cx - 1, cy - 1, 5, 6); ctx.fillStyle = Ac[0]; ctx.fillRect(cx, cy, 3, 4); ctx.fillStyle = Ac[1]; ctx.fillRect(cx, cy, 3, 2); ctx.fillStyle = Ac[0]; ctx.fillRect(cx, cy - 1, 3, 1);
      if (o.u > 0.4 && o.u < 0.62) { ctx.fillStyle = '#fff4b8'; ctx.fillRect(cx + 1, cy - 4, 1, 2); ctx.fillRect(cx - 1, cy - 3, 1, 1); ctx.fillRect(cx + 3, cy - 3, 1, 1); } continue; }
    if (o.k === 'bite') { const y = Math.round(mouth + 7 - o.u * 7) , c = [Rf[3], Ac[2], Ac[3]][o.food]; ctx.fillStyle = Ink[0]; ctx.fillRect(x - 1, y - 1, 4, 4); ctx.fillStyle = c; ctx.fillRect(x, y, 2, 2); continue; }
    if (o.k === 'crumb') { for (let i = 0; i < 2; i++) { const dx = ((o.h >> i) & 3) - 1 + i * 2, y = Math.round(mouth + 2 + o.u * 7 + i * 2); ctx.fillStyle = i ? Ac[1] : Wd[4]; ctx.fillRect(x + dx, y, 1, 1); } continue; }
    if (o.k === 'note') { const y = Math.round(top - 4 - o.u * 9), xx = x + 3 + Math.round(Math.sin(o.u * 6) * 2); ctx.globalAlpha = Math.max(0, 1 - o.u * 0.9);
      ctx.fillStyle = Ink[0]; ctx.fillRect(xx - 1, y + 2, 4, 3); ctx.fillRect(xx + 1, y - 2, 3, 5); ctx.fillStyle = o.n ? Ac[3] : Ac[1]; ctx.fillRect(xx, y + 3, 2, 1); ctx.fillRect(xx + 2, y - 1, 1, 4); ctx.fillRect(xx + 2, y - 1, 2, 1); ctx.globalAlpha = 1; continue; }
    if (o.k === 'say') { const bx = x + 2, by = top - 12; ctx.fillStyle = Ink[0]; ctx.fillRect(bx - 1, by - 1, 11, 9); ctx.fillRect(bx + 1, by + 8, 2, 2); ctx.fillStyle = Ac[0]; ctx.fillRect(bx, by, 9, 7); ctx.fillRect(bx + 2, by + 7, 1, 1);
      ctx.fillStyle = [Ac[3], Ac[2], Ink[1], Wd[2]][o.icon];
      if (o.icon === 0) { ctx.fillRect(bx + 2, by + 2, 2, 1); ctx.fillRect(bx + 5, by + 2, 2, 1); ctx.fillRect(bx + 2, by + 3, 5, 1); ctx.fillRect(bx + 3, by + 4, 3, 1); ctx.fillRect(bx + 4, by + 5, 1, 1); }
      else if (o.icon === 1) { ctx.fillRect(bx + 3, by + 4, 2, 2); ctx.fillRect(bx + 5, by + 1, 1, 4); ctx.fillRect(bx + 5, by + 1, 2, 1); }
      else if (o.icon === 2) { const k = Math.floor(o.u * 9) % 4; for (let i = 0; i < 3; i++) if (i < k) ctx.fillRect(bx + 2 + i * 2, by + 3, 1, 1); }
      else { ctx.fillRect(bx + 2, by + 2, 1, 1); ctx.fillRect(bx + 6, by + 2, 1, 1); ctx.fillRect(bx + 2, by + 4, 5, 1); ctx.fillRect(bx + 3, by + 5, 3, 1); }
      continue; }
    if (o.k === 'wheart') { const [hx0, hy0] = proj(o.x, o.y), hx = Math.round(hx0), hy = Math.round(hy0) - 20 - Math.round(o.u * 10); ctx.globalAlpha = Math.max(0, 1 - o.u); // v5.11.0.21: the vows
      ctx.fillStyle = Ink[0]; ctx.fillRect(hx - 3, hy - 1, 7, 4); ctx.fillRect(hx - 2, hy + 3, 5, 1); ctx.fillRect(hx - 1, hy + 4, 3, 1);
      ctx.fillStyle = Ac[3]; ctx.fillRect(hx - 2, hy, 2, 1); ctx.fillRect(hx + 1, hy, 2, 1); ctx.fillRect(hx - 2, hy + 1, 5, 1); ctx.fillRect(hx - 1, hy + 2, 3, 1); ctx.fillRect(hx, hy + 3, 1, 1);
      if (o.u < 0.3) { ctx.fillStyle = '#fff4b8'; ctx.fillRect(hx - 5, hy + 6, 1, 1); ctx.fillRect(hx + 5, hy + 6, 1, 1); ctx.fillRect(hx, hy - 3, 1, 1); } ctx.globalAlpha = 1; continue; }
    if (o.k === 'ball') { const y = Math.round(sy0) - 2 - Math.round(o.z); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 2, Math.round(sy0) - 1, 5, 1);
      ctx.fillStyle = Ink[0]; ctx.fillRect(x - 2, y - 2, 5, 5); ctx.fillStyle = Ac[0]; ctx.fillRect(x - 1, y - 1, 3, 3); ctx.fillStyle = Rf[2]; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
  PARTY_FX_LAST = PARTY_FX.slice(); PARTY_FX.length = 0;
}
function decorDraw() {
  if (!DECOR_ON) return; const T = S.t % 1440, carriers = actors().filter(a => a._carry && !schoolWalk(a)).map(a => { const q = S.decor.orders.find(o => o.u === a._carry); return q ? { x: a.x, y: a.y, id: q.what === 'decor' ? (q.id || decorById(q.ref)) : q.what === 'hive' ? 'hive' : q.what === 'spr' ? 'sprinkler' : null } : null; }).filter(Boolean);
  const on = INPUT.mode === 'decor' || INPUT.mode === 'move', mode = { on, hover: on && INPUT.hover && INPUT.hover.dec, pick: INPUT.mode === 'move' ? INPUT.mvPick : null, items: INPUT.mode === 'move' ? movables() : [] };
  DA.draw(ctx, proj, onScreen, realT, T, dayLight(T), mode, carriers);
  partyFxDraw(dayLight(T)); // v5.11.0.15
  if (mode.pick && mode.pick.what === 'work') workYardsDraw(mode.pick.ref); // v5.10.12: where a workshop may go
  if (TOWN_ON && TA.draw) { const nt = fairNow() ? Math.min(dayLight(T), 0.58) : dayLight(T); TA.draw(ctx, proj, onScreen, realT, T, nt); } // v5.10.11: lantern strings over the streets
}
DA.mount({ S, buildModel, gableY, addProp, props, pix, stackCanvas, ASTEP, cam, manual: MANUAL, markNavDirty: () => markNavDirty(),
  lampModel: () => PWA.models().lamp, farIcon: () => PWA.icons().far, extra: () => ({ hive: PWA.models().hive, sprinkler: PWA.models().sprinkler }) });
DECOR_ON = true;
if (YA && YD) { YA.mount({ S, buildModel, addProp, props, stackCanvas, mailProp, mailModel, pens: () => yardPens(), markNavDirty: () => markNavDirty() }); YARD_ON = true; } // v5.10.3
if (TA) { TA.mount({ S, buildModel, gableY, addProp, props, models, treeDefs, addTree, lampModel: () => PWA.models().lamp, markNavDirty: () => markNavDirty(), xpModels: () => XP.models() }); TOWN_ON = true; } // v5.8.0
if (HA && HM) { HA.mount({ S, buildModel, gableY, addProp, props, markNavDirty: () => markNavDirty(), repaint: r => { if (groundReady) buildGroundBase(r); } }); HOME_ON = true; } // v5.9.0
if (IA && IN) { IA.mount({ S, buildModel, gableY, addProp, props, innLay: () => innLay() }); INN_ON = true; } // v5.10.7; v5.11.0.5 the 农家乐区 layout

// animal sprites face right; frames: [step A, step B, head down]. Same palette and outline as the rest of style A.
const lowerHead = (rows, col, dy) => rows.map((r, y) => r.slice(0, col) + (y - dy >= 0 ? rows[y - dy].slice(col) : '.'.repeat(r.length - col)));
const ANIMAL_ROWS = {
  chicken: [['....rr..', '...cccc.', '...ccico', '.c.cccc.', 'ccccccc.', 'cEccccc.', '.cEEcc..', '..o..o..'], ['....rr..', '...cccc.', '...ccico', '.c.cccc.', 'ccccccc.', 'cEccccc.', '.cEEcc..', '...oo...']],
  sheep: [['..cEcEcEc....', '.ccccccccc...', 'cEcccccccEcww', 'ccccccccccwEw', 'cEccccEcccwww', '.ccccccccc.w.', '..wcccccw....', '..w.w..w.w...'],
          ['..cEcEcEc....', '.ccccccccc...', 'cEcccccccEcww', 'ccccccccccwEw', 'cEccccEcccwww', '.ccccccccc.w.', '..wcccccw....', '...ww...ww...']],
  cow: [['..............k.k', '.bbccccccbbcccccc', 'wbbbcccccbbbcccic', '.cbcccbbcccccccpp', '.ccccbbbcccccc.pp', '.cccccbbccccccc..', '.ccccccccccbccc..', '..cccccpcccccc...', '..cc.cc...cc.cc..', '..cc.cc...cc.cc..', '..ww.ww...ww.ww..'],
        ['..............k.k', '.bbccccccbbcccccc', 'wbbbcccccbbbcccic', '.cbcccbbcccccccpp', '.ccccbbbcccccc.pp', '.cccccbbccccccc..', '.ccccccccccbccc..', '..cccccpcccccc...', '...cccc...cccc...', '...cccc...cccc...', '...wwww...wwww...']],
  pig: [['.........RR..', '..ppppppppRp.', '.pppppppppipp', 'Rppppppppppppp', '.ppppppppppRR.', '.pppppppppp...', '..pb.pb.pb.pb.', '..b..b..b..b..'],
        ['.........RR..', '..ppppppppRp.', '.pppppppppipp', 'Rppppppppppppp', '.ppppppppppRR.', '.pppppppppp...', '...pbpb..pbpb.', '...b.b...b.b..']],
};
const HEAD_COL = { chicken: 3, sheep: 10, cow: 13, pig: 9 }, HEAD_DY = { chicken: 2, sheep: 2, cow: 3, pig: 2 };
function flipCanvas(c) { const f = mkc(c.width, c.height), g = f.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return f; }
const ANIMAL_SPR = {};
for (const k in ANIMAL_ROWS) { const fr = [...ANIMAL_ROWS[k], lowerHead(ANIMAL_ROWS[k][0], HEAD_COL[k], HEAD_DY[k])].map(r => pix(r)); ANIMAL_SPR[k] = { r: fr, l: fr.map(flipCanvas) }; }
const EGG = pix(['.c.', 'ccc', 'cEc']);
// v5.3.1 pets, chibi (big head, readable at game zoom), facing right. Legend: X coat, Z coat shade, W light (muzzle, chest, belly),
// x stripes (cat) / saddle (dog), Q and V calico patches or collie blaze, F dog face, M dog muzzle, U dog ears, Y eye, N nose, P pink (inner ear, cat nose, tongue).
// Frames: walk A, walk B, sit, sleep (curled up), sit B (cat: tail flick + blink, dog: tail wag), happy (being patted).
const PET_ROWS = {
  cat: [
    ['.....X.....X.', '.XX..XP...PX.', '.X...XQQXXXX.', '.x...QQXXXXX.', '.X...XXYXXYX.', '.x...XXYXXYX.', '.XxXxWXWPWXW.', '..VVxXXWWWX..', '..XVWWWZWWZ..', '..X.X...X.X..'],
    ['.....X.....X.', '.XX..XP...PX.', '.X...XQQXXXX.', '.x...QQXXXXX.', '.X...XXYXXYX.', '.x...XXYXXYX.', '.XxXxWXWPWXW.', '..VVxXXWWWX..', '..XVWWWZWWZ..', '...XX....XX..'],
    ['..X.....X..', '..XP...PX..', '..XQQXXXX..', '..QQXXXXX..', '..XXYXXYX..', '..XXYXXYX..', '..WXWPWXW..', '...XWWWX...', '...xWWWX...', 'X..XWWWXX..', 'XV.xWWWXX..', '.XXVZXXZX..'],
    ['.........X...X', '...XXXXX.XP.PX', '..XxXxXxXQQXXX', '.XXXXXXXXQCXCX', 'X.XxXxXxXWWPWW', 'XZXXXXXXXXWWW.', '.XVVXXXXXXXX..'],
    ['..X.....X..', '..XP...PX..', '..XQQXXXX..', '..QQXXXXX..', '..XXXXXXX..', '..XXCXXCX..', '..WXWPWXW..', '...XWWWX...', '...xWWWX...', '...XWWWXX..', 'XXXxWWWXX..', '.XXVZXXZX..'],
    ['..X.....X..', '..XP...PX..', '..XQQXXXX..', '..QQXXXXX..', '..XXXXXXX..', '..XXCXXCX..', '..PWWPWWP..', '...XWWWX...', '...xWWWX...', 'X..XWWWXX..', 'XV.xWWWXX..', '.XXVZXXZX..']],
  dog: [ // round chibi face, big floppy ears hanging beside it (ears down = dog; cats' are up), nose dot, tail up
    ['.......XXXX...', '......XXXVXX..', '.X..UUXXXVXXUU', 'X...UUFYFFYFUU', 'X...UUFFFNFFUU', '.X...UMMMPMMU.', '.XXXXXXWWWWWX.', '.XxxxXXWWWWWX.', '.XXXXXXXWWWXX.', '..X.X....X.X..', '..W.W....W.W..'],
    ['.......XXXX...', '......XXXVXX..', 'X...UUXXXVXXUU', 'X...UUFYFFYFUU', '.X..UUFFFNFFUU', '.X...UMMMPMMU.', '.XXXXXXWWWWWX.', '.XxxxXXWWWWWX.', '.XXXXXXXWWWXX.', '...X.X..X.X...', '...W.W..W.W...'],
    ['....XXXX....', '...XXXVXX...', '.UUXXXVXXUU.', '.UUFYFFYFUU.', '.UUFFFNFFUU.', '..UMMMPMMU..', 'X..XWWWWX...', 'X..XWWWWX...', '.X.XWWWWXX..', '.XXXXWWXXX..', '.XXXXWWXXX..', '..XWW..WWX..'],
    ['.........XXX..', '........XXVXX.', '..XXXXXUXXVXXU', '.XXxxXUUFCFCFU', 'XXXXXXUUFFNFFU', 'X.XXXXXUMMMMU.', '.XXXXXXXWWWW..'],
    ['....XXXX....', '...XXXVXX...', '.UUXXXVXXUU.', '.UUFYFFYFUU.', '.UUFFFNFFUU.', '..UMMMPMMU..', '.X.XWWWWX...', '..XXWWWWX...', '...XWWWWXX..', 'XXXXXWWXXX..', '.XXXXWWXXX..', '..XWW..WWX..'],
    ['....XXXX....', '...XXXVXX...', '.UUXXXVXXUU.', '.UUFCFFCFUU.', '.UUFFFNFFUU.', '..UMMMPMMU..', 'X..XWWPWX...', 'X..XWWWWX...', '.X.XWWWWXX..', '.XXXXWWXXX..', '.XXXXWWXXX..', '..XWW..WWX..']],
};
const COATS = { // cat: ginger / black / calico; dog: shiba / border collie (black, white blaze, chest and paws) / brown
  ginger: { X: 'o', Z: 'r', W: 'c', x: 'r', Y: 'i', P: 'p' }, black: { X: 'j', Z: 'i', W: 'j', x: 'i', Y: 'y', C: 'k', P: 'p' },
  calico: { X: 'c', Z: 'k', W: 'c', Q: 'o', V: 'w', C: 'w', Y: 'i', P: 'p' },
  shiba: { X: 'o', Z: 'r', W: 'c', M: 'c', U: 'w', Y: 'i', P: 'p', N: 'i' }, collie: { X: 'j', Z: 'i', W: 'c', F: 'c', M: 'c', V: 'c', U: 'i', C: 'i', Y: 'i', P: 'p', N: 'i' },
  brown: { X: 't', Z: 'b', W: 's', M: 's', x: 'b', U: 'w', Y: 'i', P: 'p', N: 'i' } };
const coatRows = (rows, coat) => { const C = COATS[coat]; return rows.map(r => [...r].map(ch => ch === '.' ? ch : C[ch] || (ch === 'C' && C.Z) || C.X).join('')); };
const PET_SPR = {}; // kind:coat -> { r: frames, l: flipped frames }, built on first use (at most 6)
function petSprite(p) { const key = p.kind + ':' + p.coat; let s = PET_SPR[key]; if (s) return s;
  const fr = PET_ROWS[p.kind].map(r => pix(coatRows(r, p.coat))); s = PET_SPR[key] = { r: fr, l: fr.map(flipCanvas) }; return s; }
// wandering: walk to a random spot in the kind's patch, stop, graze, repeat; at night stand by the building. Own random stream.
const anRng = mulberry32(99173), ASPEED = { chicken: 1.6, sheep: 1.1, cow: 0.9, pig: 1.0 };
function animalView(a) { let v = AV.get(a.id); if (!v) { const R0 = PENS[homeOf(a)].roam; v = { x: R0[0] + anRng() * (R0[2] - R0[0]), y: R0[1] + anRng() * (R0[3] - R0[1]), tx: 0, ty: 0, wait: anRng() * 20, flip: anRng() < 0.5, graze: 0, step: 0, hold: 0, id: a.id, sim: a }; v.tx = v.x; v.ty = v.y; AV.set(a.id, v); } return v; }
function stepAnimals(dm) {
  stepPets(dm); stepPondFish(dm);
  if (!S.animals.length) return;
  const T = S.t % 1440, night = T >= BEDTIME - 30 || T < WAKE, raining = !!(WX && WX.isRaining(S.weather, S.day, S.t));
  for (const a of S.animals) { const v = animalView(a); v.sim = a;
    if (v.hold) { v.graze = 0; continue; }
    const P = PENS[homeOf(a)], GZ = XP.roamOf(a, T), RA = GZ || P.roam, roam = GZ ? { x0: Math.min(GZ[0], P.roam[0]), y0: Math.min(GZ[1], P.roam[1]), x1: Math.max(GZ[2], P.roam[2]), y1: Math.max(GZ[3], P.roam[3]), pad: 8 } : { x0: P.roam[0], y0: P.roam[1], x1: P.roam[2], y1: P.roam[3], pad: 8 }; // v5.5.0: sheep out on the meadow by day
    if (night || raining) { const home = a.kind === 'chicken' ? P.door : { x: P.door.x - 10 + (a.id.charCodeAt(a.id.length - 1) % 5) * 5, y: P.door.y - 4 }; setWalkTarget(v, home.x, home.y); v.wait = 0; }
    else if (a.kind === 'sheep') herdSheep(a, v, T); // v5.6.0: the collie's flock
    const hop = nextHop(v, { x: v.tx, y: v.ty }, roam), dx = hop.x - v.x, dy = hop.y - v.y, d = Math.hypot(dx, dy);
    if (d > 0.4) { const st = Math.min(d, (raining ? 0.45 : 1) * ASPEED[a.kind] * dm); v.x += dx / d * st; v.y += dy / d * st; v.step += st; v.graze = 0;
      const sx = dx * CA - dy * SA; if (Math.abs(sx) > 0.2) v.flip = sx < 0; continue; }
    if (night || raining) { v.graze = 0; continue; }
    v.wait -= dm; v.graze = v.wait > 0 && (Math.floor(v.wait / 6) % 2 === 0);
    if (v.wait <= 0) { const R0 = RA, far = GZ ? (v.x > GZ[2] + 4 || anRng() < 0.3) : anRng() < 0.3;
      let tx = Math.max(R0[0], Math.min(R0[2], far ? R0[0] + anRng() * (R0[2] - R0[0]) : v.x + (anRng() - 0.5) * 24));
      let ty = Math.max(R0[1], Math.min(R0[3], far ? R0[1] + anRng() * (R0[3] - R0[1]) : v.y + (anRng() - 0.5) * 14));
      const snap = NAV.nearestWalkable(ensureNav(), tx, ty, 12, null);
      if (snap) { tx = Math.max(R0[0] - 2, Math.min(R0[2] + 2, snap.x)); ty = Math.max(R0[1] - 2, Math.min(R0[3] + 2, snap.y)); }
      setWalkTarget(v, tx, ty);
      v.wait = 20 + anRng() * 50; }
  }
}
// ---------- v4.7 pets: cats nap on sunny spots; both sleep on the porch at night. v5.4.0: dogs wander on their own ----------
const petRng = mulberry32(4711);
function petView(p) { let v = PV.get(p.id);
  if (!v) { v = { x: DOOR.x + 6 + petRng() * 14, y: DOOR.y + 6 + petRng() * 8, tx: 0, ty: 0, flip: petRng() < 0.5, step: 0, pose: 2, wait: 5 + petRng() * 30, idle: 0, hold: 0, pet: p };
    v.tx = v.x; v.ty = v.y; PV.set(p.id, v); }
  return v; }
const napOpen = n => !n.area || S.eff.regions.includes(n.area);
const dry = (x, y) => groundAt(x, y)[1] !== 'water';
function dogTarget(kind, ctx) {
  const jitter = (x, y, s) => ({ x: x + (petRng() - 0.5) * s, y: y + (petRng() - 0.5) * s });
  const tryDry = (x, y, s = 6) => { for (let i = 0; i < 8; i++) { const q = jitter(x, y, s); if (dry(q.x, q.y)) return q; } return dry(x, y) ? { x, y } : { x: DOOR.x + 10, y: DOOR.y + 8 }; };
  if (kind === 'sun') { const spots = WD.NAP_SPOTS.filter(napOpen), n = spots[Math.floor(petRng() * spots.length)] || { x: 60, y: 40 }; return tryDry(n.x, n.y); }
  if (kind === 'well') return tryDry(WELL_SPOT.x + 6, WELL_SPOT.y + 2, 4);
  if (kind === 'fence') { const pts = [{ x: 20, y: 46 }, { x: 88, y: 30 }, { x: 140, y: 54 }, { x: 64, y: 92 }]; const n = pts[Math.floor(petRng() * pts.length)]; return tryDry(n.x, n.y); }
  if (kind === 'sniff' && ctx.cats && ctx.cats.length) { const c = ctx.cats[Math.floor(petRng() * ctx.cats.length)]; return tryDry(c.x + 6, c.y + 2, 3); }
  if (kind === 'check') return tryDry(FARMER.x + (petRng() < 0.5 ? 10 : -10), FARMER.y + 4, 4);
  if (kind === 'fold' && ctx.fold) return tryDry(PENS.fold.door.x + 8, PENS.fold.door.y + 6, 8);
  if (kind === 'door') return tryDry(DOOR.x + 10, DOOR.y + 6, 3);
  if (kind === 'dig') { const st = (S.trees || []).filter(q => q.stage === 'stump' || (q.kind === 'wild' && WD.areaAt(q.x, q.y) === 'home')); const q = st[Math.floor(petRng() * Math.max(1, st.length))]; return q ? tryDry(q.x + 6, q.y + 4, 3) : tryDry(80, 40); }
  if (kind === 'truffle') return tryDry((PENS.sty && PENS.sty.door.x) || 170, (PENS.sty && PENS.sty.door.y + 8) || 10, 10);
  const pts = [{ x: 50, y: 50 }, { x: 100, y: 40 }, { x: 130, y: 90 }, { x: 70, y: 100 }, { x: 40, y: 70 }, { x: 88, y: 70 }];
  const n = pts[Math.floor(petRng() * pts.length)]; return tryDry(n.x, n.y, 10);
}
function dogCtx() {
  return { cats: PETS_LIVE.filter(q => q.kind === 'cat').map(q => petView(q)), fold: !!(S.eff.fold || (S.eff.regions || []).includes('orchard')), evening: (S.t % 1440) >= 17 * 60 };
}
function planDogDay() {
  const n = PETS_LIVE.filter(p => p.kind === 'dog').length;
  if (!n) { S.dogPlan = null; return; }
  if (S.dogPlan && S.dogPlan.day === S.day) return;
  const kind = AN.rollDogSurprise({ didToday: S.streaks.dogDay === S.day, hasPigs: S.animals.some(a => a.kind === 'pig') }, petRng);
  S.dogPlan = kind ? { day: S.day, kind, at: 8 * 60 + Math.floor(petRng() * 9 * 60), done: false } : { day: S.day, done: true };
}
function beginDogSurprise(p, kind) {
  const v = petView(p), jobKind = kind === 'seed' ? 'dig' : kind === 'truffle' ? 'truffle' : 'door';
  const t = dogTarget(jobKind, dogCtx());
  v.job = { kind: jobKind, wait: kind === 'wait' ? 80 : 18, surprise: kind, x: t.x, y: t.y };
  setWalkTarget(v, t.x, t.y); v.wait = 0;
}
function finishDogSurprise(p, v) {
  const kind = v.job && v.job.surprise; if (!kind) return;
  const name = AN.PETS.dog.coats.find(c => c.id === p.coat).name;
  S.streaks.dogDay = S.day;
  if (kind === 'flower' || kind === 'stick') { S.doorGift = { kind, day: S.day }; log(`${name}衔回一${kind === 'flower' ? '束野花' : '根树枝'}，放在门口`); }
  else if (kind === 'seed') { S.store.carrot = (S.store.carrot || 0) + 1; log(`${name}在树桩边挖出一颗胡萝卜种子`); popText(v.x, v.y, 12, '+1种', '#e6c35c'); }
  else if (kind === 'truffle') { S.loose.push({ id: 'loose' + S.day, type: 'truffle', x: v.x, y: v.y }); log(`${name}对着地上叫了两声，好像发现了松露`); say('汪汪'); }
  else if (kind === 'wait') log(`${name}傍晚在门口等家人回来`);
  noteProgress({ dogSurprise: true });
}
function petBed(dog, k) { // v5.10.3: the k-th cat's bed / the k-th dog's house door, once set up
  const put = S.homeyard.put, id = dog ? 'doghouse' : 'catbed'; if (k >= (put[id] | 0)) return null;
  const p = YD.spotOf(id, k); return p ? (dog ? { x: p.x, y: p.y + 5 } : { x: p.x, y: p.y }) : null; }
function stepPets(dm) {
  if (!PETS_LIVE.length) return;
  const T = S.t % 1440, night = T >= BEDTIME - 30 || T < WAKE; let dogs = 0, cats = 0;
  if (!night && S.dogPlan && S.dogPlan.day === S.day && !S.dogPlan.done && T >= (S.dogPlan.at || 0)) {
    const pack = PETS_LIVE.filter(p => p.kind === 'dog');
    if (pack.length) { beginDogSurprise(pack[Math.floor(petRng() * pack.length)], S.dogPlan.kind); S.dogPlan.done = true; }
  }
  for (const p of PETS_LIVE) { const v = petView(p), dog = p.kind === 'dog', k = dog ? dogs++ : cats++;
    if (v.hold) { v.pose = 5; continue; } // happy face while being patted
    let speed = dog ? 4.2 : 2.4;
    if (night || (WX && WX.isRaining(S.weather, S.day, S.t)) || FARMER.home) { const bed = petBed(dog, k); // v5.10.3: a cat bed / dog house of its own
      if (bed) setWalkTarget(v, bed.x, bed.y); else setWalkTarget(v, DOOR.x + 12 + (dog ? k * 7 : -14 - k * 6), DOOR.y + 5 + (k % 2) * 3); v.wait = 0; v.job = null; }
    else if (dog && herdDog(p, v)) speed = 5.2; // v5.6.0: herding the sheep out / home
    else if (dog) {
      const arriving = Math.hypot((v.tx || 0) - v.x, (v.ty || 0) - v.y) < 0.6;
      if (v.job && arriving) { v.wait -= dm; if (v.wait <= 0) { if (v.job.surprise) finishDogSurprise(p, v); else noteProgress({ dogJob: true }); v.job = null; } }
      if (!v.job) {
        const ctx = dogCtx(), bed = petBed(true, k); v.job = AN.pickDogJob(p, ctx, petRng);
        if (bed && !v.job.surprise && petRng() < 0.3) v.job = { kind: 'house', wait: 60 + petRng() * 60 }; // v5.10.3: a dog with a house likes lying at its door
        const t = v.job.kind === 'house' ? bed : dogTarget(v.job.kind, ctx); v.job.x = t.x; v.job.y = t.y; setWalkTarget(v, t.x, t.y); v.wait = v.job.wait;
      } else if (!arriving) { setWalkTarget(v, v.job.x, v.job.y); const far = Math.hypot(v.job.x - v.x, v.job.y - v.y); if (far > 26) speed = WALK * S.eff.walk * 1.05; }
    }
    else { // cat: nap somewhere sunny, sometimes come and sit by the farmer
      const d0 = Math.hypot(v.tx - v.x, v.ty - v.y);
      if (d0 < 0.4) { v.wait -= dm; if (v.wait <= 0) { const spots = WD.NAP_SPOTS.filter(napOpen), near = petRng() < 0.25 && (WD.areaAt(FARMER.x, FARMER.y) === 'home' || S.eff.regions.includes(WD.areaAt(FARMER.x, FARMER.y)));
        const n = near && dry(FARMER.x + 8, FARMER.y + 4) ? { x: FARMER.x + 8, y: FARMER.y + 4 } : spots[Math.floor(petRng() * spots.length)]; setWalkTarget(v, n.x + (petRng() - 0.5) * 6 + k * 5, n.y + (petRng() - 0.5) * 4); v.wait = 60 + petRng() * 150; v.idle = 0; } } }
    const hop = nextHop(v, { x: v.tx, y: v.ty }), dx = hop.x - v.x, dy = hop.y - v.y, d = Math.hypot(dx, dy);
    if (d > 0.4) { const st = Math.min(d, speed * dm); v.x += dx / d * st; v.y += dy / d * st; v.step += st; v.idle = 0; v.pose = Math.floor(v.step / 2.5) % 2;
      const sx = dx * CA - dy * SA; if (Math.abs(sx) > 0.2) v.flip = sx < 0; continue; }
    v.idle += dm; v.pose = night || FARMER.home || (dog && v.job && v.job.kind === 'sun') || v.idle > (dog ? 20 : 12) ? 3 : 2;
  }
}
function petAtScreen(px, py) { let best = null, bd = 9; setCam();
  for (const p of PETS_LIVE) { const v = PV.get(p.id); if (!v) continue; const [sx, sy] = proj(v.x, v.y), d = Math.hypot(sx - px, sy - 6 - py); if (d < bd) { bd = d; best = p; } }
  return best; }
function petFrame(p, v) { if (v.pose !== 2) return v.pose; // sitting: dogs wag their tail, cats now and then flick theirs and blink
  const ph = (v.x * 0.37 + v.y * 0.11) % 1; return p.kind === 'dog' ? (Math.floor(realT * 3 + ph * 2) % 2 ? 4 : 2) : ((realT * 0.4 + ph) % 1 < 0.12 ? 4 : 2); }
function patPet(p) { const v = petView(p); hearts(v.x, v.y, 8); if (v.pose === 3) v.pose = 2; v.idle = 0; return AN.PETS[p.kind].coats.find(c => c.id === p.coat).name; }
// ---------- trees with a state (v4.3): forest trees to chop, stumps that grow back, transplanted saplings, fruit trees ----------
const FRUIT_COL = { apple: [Rf[2], Rf[3]], orange: [Ac[2], Ac[1]] };
const FISH_COL = Object.fromEntries(FS.ALL.map(f => [f.id, [f.col, f.col]]));
const WILD = [treeDefs.oak[0], treeDefs.oak[1], treeDefs.olive[0], treeDefs.birch[0], treeDefs.pine[0], treeDefs.oak[2], treeDefs.olive[1], treeDefs.birch[1]];
const FDEF = new Map();
function fruitDef(kind, v, ripe) { const key = kind + v + (ripe ? 'r' : ''); let d = FDEF.get(key); if (d) return d;
  const bare = FDEF.get(kind + v) || oakDef(301 + v * 19 + (kind === 'orange' ? 50 : 0), kind === 'orange' ? 'olive' : 'oak', 0.72); FDEF.set(kind + v, bare);
  d = ripe ? Object.assign({}, bare, { discs: bare.discs.map(p => p.inside ? p : Object.assign({}, p, { berries: kind })) }) : bare; FDEF.set(key, d); return d; }
const SAPLING = [pix(['..g.g..', '.gmgmg.', '..mgm..', '...w...', '...w...', '..www..']),
  pix(['...g.g...', '.gglgmg..', 'gmgmgmgg.', '.gmmgmmg.', '..mdwdm..', '....w....', '....w....', '....w....', '...www...'])];
const TV = new Map();
function setView(o, t) {
  if (o._ck && o._ck.c) o._ck.c.width = o._ck.c.height = 0; o._ck = null; o.tree = o.m = o.spr = undefined; o.sway = 0;
  if (t.stage === 'tree') { o.tree = t.kind === 'wild' ? WILD[t.v % WILD.length] : fruitDef(t.kind, t.v % 3, t.ripe); o.m = o.tree.union; }
  else if (t.stage === 'stump') { o.m = stumpModel; o.rot = (t.x * 7) % 6; }
  else { o.spr = t.age >= (t.kind === 'wild' ? WD.STUMP_TO_TREE - 1 : 3) ? SAPLING[1] : SAPLING[0]; o.sway = 0.6; }
}
function treeView(t) { let o = TV.get(t.id); if (!o) { o = { x: t.x, y: t.y, rot: 0, z: 0, lean: 0, leanV: 0, tick: (treeN++ % 6) / 6, sim: t }; TV.set(t.id, o); setView(o, t); } return o; }
function treeChanged(t) { const o = TV.get(t.id); if (o) { o.sim = t; setView(o, t); } markNavDirty(); }
function resetTreeViews() { for (const o of TV.values()) if (o._ck && o._ck.c) o._ck.c.width = o._ck.c.height = 0; TV.clear(); }
// ---- v5.0 house tiers: the house prop swaps to a bigger model (built once per tier); the woodpile moves out of the annex ----
const HOUSE_MODELS = { '0|0|0': models.house }; let houseTierShown = '0|0|0';
function setHouseTier(tier) { // v5.10.3: the model also follows the roof colour and the curtains (yard.js)
  const put = S.homeyard ? S.homeyard.put : {}, look = { roof: put.roof | 0, curt: put.curtains ? 1 : 0 }, key = `${tier}|${look.roof}|${look.curt}`;
  if (key === houseTierShown) return; houseTierShown = key;
  const m = HOUSE_MODELS[key] || (HOUSE_MODELS[key] = houseModel(tier, look)), at = housePlace(tier);
  Object.assign(houseProp, { m, x: at.x, y: at.y });
  if (tier >= 1) Object.assign(logsProp, { x: 74, y: 31 }); else Object.assign(logsProp, { x: 64, y: 22 });
}
// ---- v5.0 wooden fences round the sty, the sheepfold and the cow shed (the coop's yard already has one) ----
const penFence = [];
function syncFenceProps() {
  if (!S.eff.fence) return;
  for (const k of ['sty', 'fold', 'shed']) { if (!S.eff[k] || penFence.some(p => p.pen === k)) continue;
    const P = PENS[k], [x0, y0, x1, y1] = [P.roam[0] - 4, P.roam[1] - 4, P.roam[2] + 4, P.roam[3] + 4];
    const gap = (x, y) => nearRoute(x, y, 7) || Math.hypot(x - P.door.x, y - P.door.y) < 9 || Math.hypot(x - P.trough.x, y - P.trough.y) < 10 || Math.hypot(x - P.bld.x, (y - P.bld.y) * 1.3) < 18;
    for (let x = x0; x < x1; x += 8) for (const y of [y0, y1]) if (!gap(x + 4, y)) penFence.push(addProp(models.fence, x + 4, y, 0, { pen: k }));
    for (let y = y0; y < y1; y += 8) for (const x of [x0, x1]) if (!gap(x, y + 4)) penFence.push(addProp(models.fence, x, y + 4, Math.PI / 2, { pen: k }));
  }
}
// ---- v5.0 family sprites: palette swaps of the farmer sheet (style A colours only); children are a few rows shorter ----
// v5.3: 阿禾 and the children come prebuilt from assets/family_sprites.js (tools/build_family.py): the old whole-sheet swap also
// recoloured the farmer's mouth (same red as his shirt) and drew a cream bar across her chin in every side-facing frame.
// She has her own head there (headscarf, long auburn hair). The maps below are only the fallback when that file is missing.
const FAM_PRE = {}; if (window.PF_FAMILY_SPRITES) for (const k in window.PF_FAMILY_SPRITES) { const im = new Image(); im.src = window.PF_FAMILY_SPRITES[k]; FAM_PRE[k] = im; }
const FAM_LOOK = {
  partner: { '#4fa3cf': '#52af3a', '#2f6ea0': '#358a3c', '#1f3d68': '#24603a', '#a8432e': '#f6ecd0', '#7a2c24': '#ecc27c', '#8a5530': '#cf6a3c', '#5e3524': '#a8432e' }, // like her shop sprite
  kid0: { '#a8432e': '#f2cf55', '#7a2c24': '#d3984c' },
  father: { '#cf6a3c': '#9a9ea0', '#a8432e': '#666a73', '#7a2c24': '#3e3f4c', '#358a3c': '#8a5530', '#24603a': '#5e3524', '#e57fa0': '#f2c29a' }, // 阿禾's father: grey hair, brown apron (keeper rows)
  guestA: { '#4fa3cf': '#f2cf55', '#2f6ea0': '#d3984c', '#1f3d68': '#8a5530', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#5e3524', '#5e3524': '#3b2219' }, // v5.7.0 party guests from the next town
  guestB: { '#4fa3cf': '#e57fa0', '#2f6ea0': '#a8432e', '#1f3d68': '#7a2c24', '#a8432e': '#ecc27c', '#7a2c24': '#d3984c', '#8a5530': '#666a73', '#5e3524': '#3e3f4c' },
  mateA: { '#4fa3cf': '#e57fa0', '#2f6ea0': '#a8432e', '#1f3d68': '#7a2c24', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626' }, // v5.8.0 classmates
  mateB: { '#4fa3cf': '#f2cf55', '#2f6ea0': '#d3984c', '#1f3d68': '#8a5530', '#a8432e': '#358a3c', '#7a2c24': '#24603a' },
  mateC: { '#4fa3cf': '#9a9ea0', '#2f6ea0': '#666a73', '#1f3d68': '#3e3f4c', '#a8432e': '#cf6a3c', '#7a2c24': '#a8432e' },
  townC: { '#4fa3cf': '#ecc27c', '#2f6ea0': '#d3984c', '#1f3d68': '#8a5530', '#a8432e': '#666a73', '#7a2c24': '#3e3f4c', '#8a5530': '#a8432e', '#5e3524': '#7a2c24' }, // v5.8.0 周婶
  townD: { '#4fa3cf': '#358a3c', '#2f6ea0': '#24603a', '#1f3d68': '#1c1626', '#a8432e': '#1c1626', '#7a2c24': '#3e3f4c', '#8a5530': '#666a73', '#5e3524': '#3e3f4c' }, // v5.8.0 林老师
  townE: { '#4fa3cf': '#3e3f4c', '#2f6ea0': '#1c1626', '#1f3d68': '#1c1626', '#a8432e': '#9a9ea0', '#7a2c24': '#666a73', '#8a5530': '#3e3f4c', '#5e3524': '#1c1626' }, // v5.10.0 镇长老顾: dark coat, grey hair
  townF: { '#4fa3cf': '#cf6a3c', '#2f6ea0': '#a8432e', '#1f3d68': '#7a2c24', '#a8432e': '#1c1626', '#7a2c24': '#1c1626', '#8a5530': '#e57fa0', '#5e3524': '#a8432e' }, // 裁缝阿梅
  townG: { '#4fa3cf': '#2f6ea0', '#2f6ea0': '#1f3d68', '#1f3d68': '#1c1626', '#a8432e': '#5e3524', '#7a2c24': '#3b2219', '#8a5530': '#358a3c', '#5e3524': '#24603a' }, // 邮差阿川: postman's blue, green bag
  townH: { '#4fa3cf': '#f6ecd0', '#2f6ea0': '#ecc27c', '#1f3d68': '#d3984c', '#a8432e': '#666a73', '#7a2c24': '#3e3f4c', '#8a5530': '#52af3a', '#5e3524': '#358a3c' }, // 花匠秋姨: cream smock, green apron
  townI: { '#4fa3cf': '#3e3f4c', '#2f6ea0': '#1c1626', '#1f3d68': '#1c1626', '#a8432e': '#a8432e', '#7a2c24': '#4a1c1e', '#8a5530': '#5e3524', '#5e3524': '#3b2219' }, // v5.10.5 铁匠阿锤: sooty coat, leather apron, copper trim
  townJ: { '#4fa3cf': '#3a6ea8', '#2f6ea0': '#2a4e88', '#1f3d68': '#1a2e58', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#f6ecd0', '#5e3524': '#d4a04a' }, // v5.10.9 书屋阿宁: ink-blue coat, pale hair, gold trim
  townK: { '#4fa3cf': '#e8eef0', '#2f6ea0': '#c5d0d4', '#1f3d68': '#7a8a90', '#a8432e': '#2e6b4a', '#7a2c24': '#1c3d2e', '#8a5530': '#3c2a1c', '#5e3524': '#241890' }, // v5.10.10 苏大夫: white coat, dark hair, green bag
  innA: { '#4fa3cf': '#3aa88a', '#2f6ea0': '#2a7a64', '#1f3d68': '#1a4e44', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#d4a04a', '#5e3524': '#8a5530' }, // v5.10.7 guests: teal coat, dark cap (not a straw hat)
  innB: { '#4fa3cf': '#8b3a4a', '#2f6ea0': '#6a2834', '#1f3d68': '#3e1a22', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#f6ecd0', '#5e3524': '#ecc27c' },
  innC: { '#4fa3cf': '#d4a04a', '#2f6ea0': '#b07a2c', '#1f3d68': '#7a4e18', '#a8432e': '#2a3e68', '#7a2c24': '#1a2848', '#8a5530': '#3e3f4c', '#5e3524': '#1c1626' },
  innD: { '#4fa3cf': '#3a5a8c', '#2f6ea0': '#2a3e68', '#1f3d68': '#1a2848', '#a8432e': '#9a9ea0', '#7a2c24': '#666a73', '#8a5530': '#f6ecd0', '#5e3524': '#3e3f4c' },
  innE: { '#4fa3cf': '#c47a8a', '#2f6ea0': '#a05068', '#1f3d68': '#6e3048', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#ecc27c', '#5e3524': '#8a5530' },
  innF: { '#4fa3cf': '#6a7a3a', '#2f6ea0': '#4a5a28', '#1f3d68': '#2e3a18', '#a8432e': '#5e3524', '#7a2c24': '#3b2219', '#8a5530': '#cf6a3c', '#5e3524': '#a8432e' },
  beachA: { '#4fa3cf': '#f07a5a', '#2f6ea0': '#c4563a', '#1f3d68': '#8a3020', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#f6ecd0', '#5e3524': '#3e3f4c' }, // v5.10.8 resort guests: bright shirts, dark or pale caps (not a straw hat)
  beachB: { '#4fa3cf': '#4fa8d8', '#2f6ea0': '#2f7eae', '#1f3d68': '#1a4e78', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#f6ecd0', '#5e3524': '#666a73' },
  beachC: { '#4fa3cf': '#f6ecd0', '#2f6ea0': '#e8d8b0', '#1f3d68': '#c8b890', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#1c1626', '#5e3524': '#3e3f4c' },
  beachD: { '#4fa3cf': '#f2cf55', '#2f6ea0': '#d3a83a', '#1f3d68': '#8a6a18', '#a8432e': '#2a3e68', '#7a2c24': '#1a2848', '#8a5530': '#3e3f4c', '#5e3524': '#1c1626' },
  beachE: { '#4fa3cf': '#5ec8a8', '#2f6ea0': '#3aa888', '#1f3d68': '#1a7a64', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#ecc27c', '#5e3524': '#3e3f4c' },
  beachF: { '#4fa3cf': '#b08ad0', '#2f6ea0': '#8a62b0', '#1f3d68': '#5a3a80', '#a8432e': '#3e3f4c', '#7a2c24': '#1c1626', '#8a5530': '#f6ecd0', '#5e3524': '#666a73' },
  kid1: { '#4fa3cf': '#e06a2c', '#2f6ea0': '#a8432e', '#1f3d68': '#7a2c24', '#a8432e': '#52af3a', '#7a2c24': '#358a3c', '#8a5530': '#5e3524' },
};
// v5.11.0.21: a second bride or groom the same evening (two of the same) gets a recoloured copy: yellow flowers / a navy suit
const FAM_DERIVE = { bride2: ['bride', { '#e57fa0': '#f2cf55', '#f2cf55': '#e06a2c' }], groom2: ['groom', { '#3e3f4c': '#1f3d68', '#3a2b38': '#16294a' }] };
const FAM_SPR = new Map(); // look:cut -> { img, flip }; at most 8 (v5.8.1: the children's school look) (partner, father, two children x child / teen)
function famSheet(look, cut = 0) {
  const key = look + ':' + cut; let sh = FAM_SPR.get(key); if (sh || !SPR.ok) return sh || null;
  const der = FAM_DERIVE[look], pre = FAM_PRE[der ? der[0] : look]; if (pre && !(pre.complete && pre.naturalWidth)) return null; // still decoding: skip a frame
  const W0 = SPR.img.width, H0 = SPR.img.height, src = mkc(W0, H0), g = src.getContext('2d', { willReadFrequently: true }); g.drawImage(pre || SPR.img, 0, 0);
  if (!pre || der) { const id = g.getImageData(0, 0, W0, H0), d = id.data, map = der ? der[1] : FAM_LOOK[look], hex = (r, gg, b) => '#' + [r, gg, b].map(v => v.toString(16).padStart(2, '0')).join('');
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const to = map[hex(d[i], d[i + 1], d[i + 2])]; if (to) { d[i] = parseInt(to.slice(1, 3), 16); d[i + 1] = parseInt(to.slice(3, 5), 16); d[i + 2] = parseInt(to.slice(5, 7), 16); } }
    g.putImageData(id, 0, 0); }
  let img = src;
  if (cut) { img = mkc(W0, H0); const c = img.getContext('2d'), fh = SPR.fh, B = 18; // drop `cut` rows of the body, keep the feet on the anchor
    for (let y = 0; y < H0; y += fh) { c.drawImage(src, 0, y + B + cut, W0, fh - B - cut, 0, y + B + cut, W0, fh - B - cut); c.drawImage(src, 0, y, W0, B, 0, y + cut, W0, B); }
    src.width = src.height = 0; }
  const flip = mkc(W0, H0), fc = flip.getContext('2d'); fc.translate(W0, 0); fc.scale(-1, 1); fc.drawImage(img, 0, 0);
  sh = { img, flip }; FAM_SPR.set(key, sh); return sh;
}
const lookOf = m => { if (m.id === 'partner') return ['partner', 0]; const wl = wedLook(m); if (wl) return [wl, 3]; // v5.11.0.21: the wedding clothes
  const cut = (m.role === 'child' || m.role === 'play' || m.role === 'school') ? 6 : 3;
  return [schoolWalk(m) && FAM_PRE[m.id + '_school'] ? m.id + '_school' : m.id, cut]; }; // v5.8.1: on the school walk no straw hat, a school backpack
const CLOSED = pix(['..b.....b..', 'bbbbbbbbbbb', 'bkikkkkkikb', 'bkkiikiikkb', 'bkkkkikkkkb', 'bkkiikiikkb', 'bkikkkkkikb', 'bbbbbbbbbbb']); // a pale board hung on the counter: shut for the night
const CRADLE = pix(['t.........t', 't.kk......t', 'tkkkpppppct', 'tssssssssst', '.bbbbbbbbb.', 'b.........b']);
const schoolWalk = a => !!(a && a.task && /^(school-go|school-back|race|library-go|library)$/.test(a.task.kind)); // v5.8.1; v5.10.9: sports day and the 书屋 stop use the same school look
const workWalk = a => !!(a && a.task && /^work|^shop-|^inn-/.test(a.task.kind)); // v5.10.6: commuting or keeping a shop, no field tool; v5.10.7 inn too
function carryFields(actor) { // hide the hip basket while a giant crop is held overhead
  if (schoolWalk(actor) || workWalk(actor) || wedLook(actor)) return { basket: null, carry: null }; // v5.11.0.21: nothing at the hip with the gown or the suit // v5.8.1: nothing in hand on the walk to and from school; v5.10.6: same on the way to work
  const last = actor.crops.length ? actor.crops[actor.crops.length - 1] : null;
  const carry = actor.crops.slice().reverse().find(it => SU.itemOf(it).giant) || null;
  return { basket: carry ? null : last, carry };
}
function familyDraw(list, T) { // pushes the family into the depth-sorted list; returns the ones that get a ghost
  const out = [], fam = S.family;
  for (const m of S.members) { if (m.home || m.away) continue; const [look, cut] = lookOf(m), sh = famSheet(look, cut); if (!sh) continue;
    const d = Object.assign({ bb: 1, x: m.x, y: m.y, sheet: sh, member: m.id, cut }, carryFields(m), farmerPose(m)); partyLook(d, m, m.id); list.push(d); out.push(d); } // v5.8.1 cut: a child sheet is shorter, the basket sits lower
  for (const g of GUESTS) { const sh = famSheet(g.look, 0); if (!sh) continue; const d = Object.assign({ bb: 1, x: g.x, y: g.y, sheet: sh }, farmerPose(g)); if (!g.leaving) partyLook(d, g, g.id); list.push(d); } // v5.7.0 party guests
  partyList(list); // v5.11.0.15: plates, the barrel, lantern poles
  for (const g of STAYS) { if (g.inside) continue; const sh = famSheet(g.look, 0); if (sh) list.push(Object.assign({ bb: 1, x: g.x, y: g.y, sheet: sh }, farmerPose(g))); } // v5.10.7 inn guests
  if (TN) townDraw(list); // v5.8.0 classmates and neighbours
  if (HM) homeDraw(list); // v5.9.0 the married children's partners and their hens
  const babies = fam.kids.filter(k => FAM.kidStage(k, S.day) === 'baby');
  if (T >= WAKE && T < BEDTIME) babies.forEach((k, i) => list.push({ spr: CRADLE, x: DOOR.x + 11 + i * 7, y: DOOR.y - 3, w: 1 }));
  return out;
}
function syncRegionProps() { // open gates and take the signs down for bought regions
  for (const id in regionProps) { const open = regionOpen(id);
    for (const p of regionProps[id]) { const want = !(open && (p.gate || p.sign)), arr = p.sign ? billboards : props, i = arr.indexOf(p);
      if (want && i < 0) arr.push(p); else if (!want && i >= 0) arr.splice(i, 1); } }
}
const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000', Z: '111001010100111', '♥': '101111111010000' };
function pixText(s, x, y, col, sc = 1) {
  const w = s.length * 4 * sc - sc; x = Math.round(x - w / 2); y = Math.round(y);
  for (const pass of [0, 1]) { ctx.fillStyle = pass ? col : Ink[0];
    [...s].forEach((ch, i) => { const g = FONT[ch]; if (!g) return; for (let k = 0; k < 15; k++) if (g[k] === '1') { const gx = x + (i * 4 + k % 3) * sc, gy = y + Math.floor(k / 3) * sc;
      if (pass) ctx.fillRect(gx, gy, sc, sc); else for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(gx + ox, gy + oy, sc, sc); } }); }
}
function dayLight(T) { const h = T / 60; if (h >= 6.3 && h < 17.5) return 0; if (h >= 17.5 && h < 20.5) return (h - 17.5) / 3; if (h >= 20.5 || h < 4.5) return 1; return Math.max(0, 1 - (h - 4.5) / 1.8); }
function sunsetFade(T) { // v5.10.8: 0 at 17:00, full by 17:20, full until 18:40, 0 at 19:00 (smoothstep edges)
  const t = ((T % 1440) + 1440) % 1440, from = 17 * 60, to = 19 * 60, edge = 20;
  if (t < from || t >= to) return 0;
  if (t < from + edge) { const u = (t - from) / edge; return u * u * (3 - 2 * u); }
  if (t > to - edge) { const u = (to - t) / edge; return u * u * (3 - 2 * u); }
  return 1;
}
let SUN_WMASK = null, SUN_MW = 0, SUN_MH = 0, SUN_WCOLS = null;
function captureSunsetWater() { // after waterPass, before objects: sea + pond masks, plus palette-matched river
  if (!SUN_WCOLS) SUN_WCOLS = new Set([...Wt, ...(PAL.ramps.shallow || [])].map(u32));
  const m = new Uint8Array(W * H), img = ctx.getImageData(0, 0, W, H), px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < px.length; i++) if (SUN_WCOLS.has(px[i])) m[i] = 1;
  for (const key of ['sea', 'pond']) {
    const Gm = WG && WG[key]; if (!Gm || !Gm.n || !Gm.mask) continue;
    const { bx, by, bw, bh, mask } = Gm;
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      const x = bx + (i % bw), y = by + ((i / bw) | 0);
      if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1;
    }
  }
  SUN_WMASK = m; SUN_MW = W; SUN_MH = H;
}
function drawSunsetWash(ctx, T, realT) { // v5.10.8: full-viewport sky wash + a light sheen on all water (sea, river, pond), gold column
  const a = sunsetFade(T);
  if (a <= 0) return;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `rgba(255, 118, 48, ${0.36 * a})`);
  sky.addColorStop(0.3, `rgba(255, 150, 90, ${0.18 * a})`);
  sky.addColorStop(0.55, `rgba(255, 170, 130, ${0.08 * a})`);
  sky.addColorStop(0.78, `rgba(255, 140, 120, ${0.06 * a})`);
  sky.addColorStop(1, `rgba(255, 110, 105, ${0.04 * a})`);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  const m = (SUN_WMASK && SUN_MW === W && SUN_MH === H) ? SUN_WMASK : null;
  if (m) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data, top = new Int16Array(W).fill(32767), bot = new Int16Array(W).fill(-1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (y < top[x]) top[x] = y; if (y > bot[x]) bot[x] = y; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      const run = Math.max(8, bot[x] - top[x]), t01 = (y - top[x]) / run;
      // open sea runs off the bottom of the view: the horizon is that far edge. closed water (pond, river) reflects on the back (top) bank.
      const farAmt = (bot[x] >= H - 6)
        ? Math.max(0, Math.min(1, (t01 - 0.2) / 0.8))
        : Math.max(0, Math.min(1, 1 - t01 / 0.6));
      const k = a * (0.06 + 0.28 * farAmt), p = (y * W + x) * 4; // additive sheen: keep the blue/teal and the waves
      d[p] = Math.min(255, d[p] + k * 100); d[p + 1] = Math.min(255, d[p + 1] + k * 48); d[p + 2] = Math.min(255, d[p + 2] + k * 20);
    }
    ctx.putImageData(img, 0, 0);
  }
  // a column of gold glints down each painted body, brightest toward the horizon
  for (const key of ['sea', 'pond']) {
    const Gm = WG && WG[key]; if (!Gm || !Gm.n) continue;
    let pathX = Math.round(Gm.bx + Gm.cx);
    const y0 = Math.max(0, Gm.by), y1 = Math.min(H - 1, Gm.by + Gm.bh);
    if (m) { // snap the path onto water if the centroid landed on a pier or the sand
      let hit = false;
      for (const dx of [0, 2, -2, 5, -5, 9, -9, 14, -14]) {
        const xx = pathX + dx; if (xx < 0 || xx >= W) continue;
        for (let y = y0; y <= y1; y += 3) if (m[y * W + xx]) { pathX = xx; hit = true; break; }
        if (hit) break;
      }
    }
    const openFar = y1 >= H - 8;
    for (let i = 0; i < 56; i++) {
      const u = i / 55, y = openFar ? y0 + Math.round((0.25 + 0.75 * u) * (y1 - y0)) : y0 + Math.round(u * (y1 - y0));
      const x = pathX + Math.round(Math.sin(i * 1.7 + realT * 2.1) * (1.5 + u * 5));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (m && !m[y * W + x]) continue;
      const g = 0.9 * a * (openFar ? 0.45 + 0.55 * u : 1 - u * 0.4);
      ctx.fillStyle = `rgba(255, 220, 120, ${g})`;
      ctx.fillRect(x, y, 2, 1);
      if (i % 2 === 0) ctx.fillRect(x + 1, y - 1, 1, 1);
    }
  }
}
function warmth(T) { const h = T / 60; const a = Math.max(0, 1 - Math.abs(h - 18.3) / 1.6), b = Math.max(0, 1 - Math.abs(h - 6) / 1.2); return Math.max(a, b * 0.8); }

// ---------- billboards: the farmer and the keeper are flat 2D sprites standing upright at their feet ----------
const SEQ = { hoe: [1, 2, 3, 3, 2, 1], pull: [1, 2, 3, 3, 2], water: [1, 2, 3, 3, 2, 1] };
function farmerPose(P = F) {
  const sx = P.fx * CA - P.fy * SA, sy = P.fx * SA + P.fy * CA; // facing turned into screen space
  const side = Math.abs(sx) > Math.abs(sy) * 0.9, flip = sx < 0;
  const k = P.task;
  // fishing: always face the water (the pond stand is on the right bank, so at the default camera that is left)
  if (!P.moving && k && k.kind === 'fish' && k.hook) {
    const [px] = proj(P.x, P.y), [hx] = proj(k.hook.x, k.hook.y), face = hx < px;
    if (k.pose === 'pull' && k.work > 0) {
      const q = SEQ.pull, u = k.phase === 'reel' ? Math.min(1, Math.max(0, (k.work - FS.CAST - k.wait - FS.BITE) / FS.REEL)) : 0.35;
      const fr = u < 0.45 ? 3 : u < 0.8 ? 2 : 1;
      return { row: 'pull', fr: q.includes(fr) ? fr : q[Math.min(q.length - 1, fr)], flip: face };
    }
    return { row: 'idle_side', fr: 0, flip: face, dir: 'walk_side' };
  }
  if (!P.moving && k && k.pose && k.work > 0) { const q = SEQ[k.pose]; return { row: k.pose, fr: q[Math.floor(realT * 6) % q.length], flip: Math.abs(sx) < 0.05 ? false : flip }; }
  const dir = side ? 'walk_side' : sy > 0 ? 'walk_front' : 'walk_back';
  if (P.moving) return { row: dir, fr: Math.floor(realT * 8) % 4, flip: side && flip, dir };
  const idle = side ? 'idle_side' : sy > 0 ? 'idle_front' : 'idle_back';
  if (k && k.rest) return { row: 'idle_front', fr: 0, flip: false, dir: 'walk_front' };
  return { row: SPR.rows[idle] !== undefined ? idle : dir, fr: 0, flip: side && flip, dir };
}
function drawBillboard(c, o, alpha = 1) {
  const [sx, sy] = proj(o.x, o.y); const r = SPR.rows[o.row]; if (r === undefined || !SPR.ok) return;
  const sh = o.sheet || SPR, fw = SPR.fw, fh = SPR.fh, n = SPR.frames[o.row] || 4, fr = o.fr % n, src = o.flip ? sh.flip : sh.img, fx = o.flip ? SPR.img.width - (fr + 1) * fw : fr * fw;
  const dx = Math.round(sx) - (o.flip ? fw - 1 - SPR.ax : SPR.ax), dy = Math.round(sy) - SPR.ay - Math.round(o.z || 0);
  c.globalAlpha = alpha; c.drawImage(src, fx, r * fh, fw, fh, dx, dy, fw, fh);
  if (o.carry) drawCarry(c, Math.round(sx), dy, o);
  else if (o.basket && o.row !== 'walk_back') drawBasket(c, Math.round(sx), dy + SPR.ay, o);
  c.globalAlpha = 1;
}
function basketFill(it) {
  const o = SU.itemOf(it), ty = o.type;
  if (o.rare === 'gold') return '#ffd76a';
  if (o.rare === 'white') return Ac[0];
  if (o.glow) return '#fff2a8';
  if (ty === 'flower') return Ac[3];
  return CROPS[ty] ? CROPS[ty].top : (FRUIT_COL[ty] || PRODUCT_COL[ty] || FISH_COL[ty] || [Ac[0]])[0];
}
function drawBasket(c, fx, fy, o) { // little basket of the last crop, held at the hip (hidden from behind)
  const b = SPRITES.basket, bx = fx + (o.row === 'walk_front' ? 1 : o.flip ? -9 : 2), by = fy - 12 + (o.cut || 0) + ((o.cut || 0) >= 6 ? 2 : 0); // v5.8.1: a child's hip is lower
  c.fillStyle = basketFill(o.basket); c.fillRect(bx + 2, by - 1, 4, 2); c.fillStyle = Ink[0]; c.fillRect(bx + 1, by - 2, 6, 1);
  c.drawImage(b, bx, by);
}
function drawCarry(c, fx, fy, o) { // a giant crop held above the head, bouncing as he walks
  const img = cropAtlas(); if (!img) return;
  const ty = SU.itemType(o.carry), ci = CROP_IDS.indexOf(ty); if (ci < 0) return;
  const bob = Math.round(Math.abs(Math.sin(realT * 8)) * 3), u = ci * 16;
  const x = fx - 16, y = fy - 22 - bob + (o.cut || 0); // v5.8.1: held over a child's (shorter) head
  c.imageSmoothingEnabled = false;
  c.drawImage(img, u, 0, 16, 16, x, y, 32, 32);
  if (SU.itemOf(o.carry).glow) { c.fillStyle = '#fff2a8'; c.fillRect(x + 8, y + 2, 3, 1); c.fillRect(x + 9, y + 1, 1, 3); }
}
function bbShadow(c, o, wide = 1) { const [sx, sy] = proj(o.x, o.y); const x = Math.round(sx), y = Math.round(sy); c.fillStyle = '#000';
  c.fillRect(x - 4 * wide, y - 1, 9 * wide, 3); c.fillRect(x - 6 * wide, y, 13 * wide, 1); }
function drawSpr(c, o, poseT) { // small 2D sprite anchored at its bottom centre; optional wind sway of the top half
  const [sx, sy] = proj(o.x, o.y), s = o.spr, x = Math.round(sx) - (s.width >> 1), y = Math.round(sy) - s.height + 2 - (o.lift || 0); // lift: hung above its anchor
  if (!o.sway) { c.drawImage(s, x, y); return; }
  const [dx] = clumpPose(o.x, o.y, o.sway, 0, poseT), cut = s.height >> 1;
  c.drawImage(s, 0, 0, s.width, cut, x + dx, y, s.width, cut); c.drawImage(s, 0, cut, s.width, s.height - cut, x, y + cut, s.width, s.height - cut);
}
const CROP_SPR = [SPRITES.seed, SPRITES.sprout, SPRITES.young];
// ripe-crop atlas, 16x16 per crop in SIM.IDS order: the three SpriteCook crops, then hand-drawn strawberry and watermelon
const RIPE_EXTRA = {
  strawberry: pix(['....l...g.....', '...lgg.ggl....', '..gglgggmgg...', '.ggmgglggmgg..', '.gRrgmggrRmg..', 'ggrrmggmgrrgg.', 'gmRrgglgmgRmgg',
    '.mgmrRggmrrgg.', '.gmgrrmgmRmgm.', '..mmgmgrrgmm..', '...dmmgRrmd...', '....dmmmmd....', '......dd......', '..............']),
  watermelon: pix(['..........l...', '....ll..lgl...', '.....lggg.....', '..............', '...mmdmmdmm...', '..mdmmdmmdmm..', '.mdmhdmmdmmdm.',
    'mmdmhdmmdmmdmm', 'mmdmmdmmdmmdmm', 'mmdmmdmmdmmdmm', '.mdmmdmmdmmdm.', '..mdmmdmmdmd..', '...ddddddddd..', '..............']),
  wheat: pix(['...y....y.....', '..ysy..ysy..y.', '..yky..yky.ysy', '..ysy..ysy.yky', '..yky.yysy.ysy', '...s..ysky..s.', '...s..yysy..s.', '...s...ss..s..',  // v5.6.0: golden wheat for the mill
    '...ss..s..ss..', '....s..s.ss...', '....ss.sss....', '.....gsgs.....', '....mgmgm.....', '..............']),
};
const CROPX = { c: null };
function cropAtlas() { // built once the SpriteCook sheet has loaded
  if (CROPX.c || !CROPI.ok) return CROPX.c;
  const a = mkc(16 * CROP_IDS.length, 16), g = a.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(CROPI.img, 0, 0);
  CROP_IDS.forEach((k, i) => { if (RIPE_EXTRA[k]) g.drawImage(RIPE_EXTRA[k], i * 16, 0); });
  return CROPX.c = a;
}
function drawCrop(c, o, poseT) { // ripe crops are 16x16 billboards; the leafy top half sways with the trees' wind. Giants are 2×.
  const img = cropAtlas(); if (!img) return;
  const sc = o.giant ? 2 : 1;
  const [sx, sy] = proj(o.x, o.y), x = Math.round(sx) - 8 * sc, y = Math.round(sy) - 13 * sc, u = o.ci * 16;
  const [dx] = clumpPose(o.x, o.y, 0.45, 0, poseT);
  c.imageSmoothingEnabled = false;
  const top = (dx0, dy0, dw, dh, sy0, sh) => c.drawImage(img, u, sy0, 16, sh, dx0, dy0, dw, dh);
  if (o.flip) { c.save(); c.translate(x + 16 * sc, 0); c.scale(-1, 1); top(-dx * sc, y, 16 * sc, 9 * sc, 0, 9); top(0, y + 9 * sc, 16 * sc, 7 * sc, 9, 7); c.restore(); }
  else { top(x + dx * sc, y, 16 * sc, 9 * sc, 0, 9); top(x, y + 9 * sc, 16 * sc, 7 * sc, 9, 7); }
  if (o.glow) { // gold rim + blinking plus-sparks so the plant itself looks lit, even when ?nofx turns particles off
    c.fillStyle = '#fff2a8';
    c.fillRect(x + 3 * sc, y - sc, 10 * sc, sc); c.fillRect(x + 2 * sc, y, sc, 2 * sc); c.fillRect(x + 13 * sc, y, sc, 2 * sc);
    const ph = Math.abs(Math.floor((poseT || 0) * 5 + o.x + o.y)) % 6;
    c.fillStyle = ph % 2 ? '#ffffff' : '#ffd76a';
    c.fillRect(x + 2 * sc + (ph % 3) * sc, y + sc, sc, sc);
    c.fillRect(x + 10 * sc - (ph % 2) * sc, y + 3 * sc, sc, sc);
    c.fillRect(x + 6 * sc, y - 2 * sc, 5 * sc, sc); c.fillRect(x + 8 * sc, y - 3 * sc, sc, 5 * sc);
  }
}

// ---------- render ----------
// ---------- layered pond (after @asynkimo's "boring water" thread and SpriteCook's pond guide) ----------
// The ground draws the pond as one flat sentinel tone. Each frame, in screen space (so "near" and "far" follow the camera),
// every water pixel gets a tone index, layers overwrite tones, and tones become palette colours once at the end, so the water
// never blends into mush. Layers: 1 darker away from the shore, 2 sky light on the near half, 3 the trees behind the pond
// flipped, squashed to 55% and cut to 3 dark tones with each row shifted by whole pixels, 4 shallow edge, damp ground and
// lapping dashes, 5 the back bank mirrored dark with a creeping waterline, 6 drops, glints, floating leaves, bobbing pads.
// Everything runs on one 5 s loop with whole cycles, so it never jumps.
const WLOOP = 5, wph = (t, n) => 2 * Math.PI * n * t / WLOOP;
const WSENT = u32(Wt[2]);
const RIVC = [Wt[1], Wt[3], Wt[4], PAL.ramps.shallow[0]].map(u32); // the river's own tones on the ground (expansion.js)
const WTONE = [Wt[0], Wt[1], Wt[2], Wt[3], Wt[4], Wt[5], Ac[0], PAL.ramps.shallow[0], Wd[0], G[0]].map(u32);
const LUM = c => 0.3 * (c & 255) + 0.59 * (c >>> 8 & 255) + 0.11 * (c >>> 16 & 255);
const RTONE = new Map(); for (const c of [...PAL.colors, '#1c1626']) { const v = u32(c), l = LUM(v); RTONE.set(v, l < 70 ? 0 : l < 118 ? 1 : 2); }
let WG = { pond: null, sea: null };
function seaBox() { // southern ocean, clipped to the screen (a second pass so pond and sea do not share a midY); v5.11.0.20: from the river mouth (x 122) and out over the ground margin
  const pts = []; for (const [ux, uy] of [[122, 230], [WORLD.x1 + GM, 230], [122, WORLD.y1 + GM], [WORLD.x1 + GM, WORLD.y1 + GM]]) pts.push(proj(ux, uy));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0]))) - 4), x1 = Math.min(W, Math.ceil(Math.max(...pts.map(p => p[0]))) + 4);
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))) - 10), y1 = Math.min(H, Math.ceil(Math.max(...pts.map(p => p[1]))) + 4);
  return [x0, y0, x1 - x0, y1 - y0];
}
function waterBox() {
  const pts = []; for (const [ux, uy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(proj(POND.x + ux * POND.rx * 1.3, POND.y + uy * POND.ry * 1.3));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0]))) - 4), x1 = Math.min(W, Math.ceil(Math.max(...pts.map(p => p[0]))) + 4);
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))) - 10), y1 = Math.min(H, Math.ceil(Math.max(...pts.map(p => p[1]))) + 4);
  return [x0, y0, x1 - x0, y1 - y0];
}
// v5.11.0.3: the geometry is cached per camera *position* (CX, CY), not only per angle and box. The sea box is clipped to the
// screen, so once it filled the view the box stopped changing while the camera kept scrolling and the old shoreline (mud lip,
// foam, depth bands) stayed painted at its old screen rows: a second coastline in the open sea. The open sea also measures its
// depth bands in world units from the shore (the pond's bands are fractions of the visible water, which slid as the view moved),
// and the screen edges that clip it are open water, not a bank.
function waterGeom(d, bx, by, bw, bh, open) { // per camera view: mask, distance to the shore, far row per column, zones
  const OUT = open ? 1e4 : 1; // what lies outside the box: dry bank round the pond, more sea for the clipped ocean
  const N = bw * bh, mask = new Uint8Array(N), dist = new Float32Array(N); let n = 0, sx = 0, sy = 0, ys = [];
  for (let i = 0; i < N; i++) if (d[i] === WSENT) { mask[i] = 1; n++; sx += i % bw; sy += (i / bw) | 0; ys.push((i / bw) | 0); }
  if (!n) return { bx, by, bw, bh, n: 0, aq: AQ };
  // v5.11.0.20: river water next to the sea is not a bank: at the mouth the sea runs on into the river with no shore line
  const wet = open ? new Uint8Array(N) : mask; if (open) { const [r0, r1, r2, r3] = RIVC; for (let i = 0; i < N; i++) { const c = d[i]; wet[i] = mask[i] || c === r0 || c === r1 || c === r2 || c === r3 ? 1 : 0; } }
  for (let i = 0; i < N; i++) dist[i] = wet[i] ? 1e4 : 0; // two-pass chamfer distance (1, 1.414) to the nearest dry pixel
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x; if (!wet[i]) continue; let v = dist[i];
    v = Math.min(v, x > 0 ? dist[i - 1] + 1 : OUT, y > 0 ? dist[i - bw] + 1 : OUT, x > 0 && y > 0 ? dist[i - bw - 1] + 1.414 : OUT, x < bw - 1 && y > 0 ? dist[i - bw + 1] + 1.414 : OUT); dist[i] = v; }
  for (let y = bh - 1; y >= 0; y--) for (let x = bw - 1; x >= 0; x--) { const i = y * bw + x; if (!wet[i]) continue; let v = dist[i];
    v = Math.min(v, x < bw - 1 ? dist[i + 1] + 1 : OUT, y < bh - 1 ? dist[i + bw] + 1 : OUT, x < bw - 1 && y < bh - 1 ? dist[i + bw + 1] + 1.414 : OUT, x > 0 && y < bh - 1 ? dist[i + bw - 1] + 1.414 : OUT); dist[i] = v; }
  const far = new Int16Array(bw).fill(-1), near = new Int16Array(bw).fill(-1);
  for (let x = 0; x < bw; x++) for (let y = 0; y < bh; y++) if (mask[y * bw + x]) { if (far[x] < 0) far[x] = y; near[x] = y; }
  ys.sort((a, b) => a - b); const midY = ys[ys.length >> 1], top = ys[0], pondH = ys[ys.length - 1] - top + 1, cx = sx / n, cy = sy / n;
  const along = new Float32Array(N), sky = [], deep = [], damp = [], back = [];
  const SB = {}, band = open ? seaBands(mask, bx, by, bw, bh, SB) : null; // open sea: 0 near the shore, 1 and 2 further out (world units)
  for (let i = 0; i < N; i++) { const x = i % bw, y = (i / bw) | 0;
    if (mask[i]) { along[i] = Math.atan2((y - cy) * 2.2, x - cx) * 60; if ((band ? band[i] >= 1 : y - far[x] >= pondH * 0.3) && dist[i] >= 2) sky.push(i); if (dist[i] >= 4) deep.push(i); continue; }
    if (wet[i]) continue;
    if (open ? far[x] >= 0 && y >= far[x] : y > midY - 6) for (const o of [-1, 1, -bw, bw]) { const j = i + o; if (j >= 0 && j < N && mask[j]) { damp.push(i); break; } } }
  // no back bank (mud lip, mirrored shore) where the sea's top edge meets the river: that is open water running on, not a bank
  const riverBy = (x, f) => { for (let dx = -3; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) { const X = x + dx, Y = f - dy; if (X < 0 || X >= bw || Y < 0) continue; const j = Y * bw + X; if (wet[j] && !mask[j]) return true; } return false; };
  for (let x = 0; x < bw; x++) if (far[x] >= 2 && (open ? far[x] < bh - 4 && !riverBy(x, far[x]) : far[x] < midY)) back.push(x);
  return { bx, by, bw, bh, n, mask, dist, far, near, midY, pondH, cx, cy, along, sky, deep, damp, back, band, open: !!open, tone: new Uint8Array(N), ph: SB.ph, lp: SB.lp, pl: SB.pl, aq: AQ, cX: CX, cY: CY };
}
const SEA_B1 = 22, SEA_B2 = 50; // world units past the shoreline where the open sea turns a shade lighter, then lighter again
let SEA_BAND = null; // one byte per world unit over the sea, built once: the band each spot of open water belongs to
function seaBandMap() {
  if (SEA_BAND) return SEA_BAND; const x0 = 122, y0 = 225, w = WORLD.x1 + GM - x0, h = WORLD.y1 + GM - y0, m = new Uint8Array(w * h), ph = new Uint8Array(w * h), lp = new Uint8Array(w * h), pl = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const wx = x0 + i + 0.5, wy = y0 + j + 0.5, s = WD.seaShore(wx);
    const n = vnoise(wx / 14, wy / 9, 29) - 0.5, e = Math.min(wy - (250 + (s - 250) * 0.45), (wx - WD.seaWestEdge(wy)) * 0.9) + n * 10; // contours: softer than the shore, a little noise; v5.11.0.20: round the west coast too
    const k = j * w + i; m[k] = e >= SEA_B2 ? 2 : e >= SEA_B1 ? 1 : 0;
    // v5.11.0.20: swell crests run along the contours (one every 11 units, in broken dashes), the lapping edge has its own slow phase,
    // and the river's water fans out a little way into the sea at the mouth
    const c = WD.coastDist(wx, wy); ph[k] = c < 7 || vnoise(wx / 8, wy / 3.2, 37) < 0.4 ? 255 : Math.floor(((e / 11 + vnoise(wx / 40, wy / 30, 41) * 1.6) % 1 + 1) % 1 * 254);
    lp[k] = Math.floor(vnoise(wx / 26, wy / 26, 43) * 255);
    const a = wx - WD.MOUTH.x; if (a > -14 && a < 40) { const r = PL.riverNear(wx, wy); const f = Math.max(0, 1 - a / 40) * Math.max(0, 1 - r.d / (10 + Math.max(0, a) * 0.45)); pl[k] = f > 0.5 ? 16 : f > 0.38 ? 8 : 0; } }
  return (SEA_BAND = { x0, y0, w, h, m, ph, lp, pl });
}
function seaBands(mask, bx, by, bw, bh, G2) { // depth contours in world space, so they stay put on the map while the camera moves
  const N = bw * bh, band = new Uint8Array(N), B = seaBandMap(), ph = G2.ph = new Uint8Array(N).fill(255), lp = G2.lp = new Uint8Array(N), pl = G2.pl = new Uint8Array(N);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x; if (!mask[i]) continue;
    const rx = (bx + x + 0.5 - CX) / RS, ry = (by + y + 0.5 - CY) / (K * RS), wx = rx * CA + ry * SA, wy = -rx * SA + ry * CA;
    const u = Math.floor(wx - B.x0), v = Math.floor(wy - B.y0);
    if (u < 0 || v < 0 || u >= B.w) { band[i] = 0; continue; } if (v >= B.h) { band[i] = 2; continue; }
    const k = v * B.w + u; band[i] = B.m[k]; ph[i] = B.ph[k]; lp[i] = B.lp[k]; pl[i] = B.pl[k]; }
  return band;
}
function reflectInto(G2, tone, src, sw, sh, footRow, left, footY, t) { // flip about the foot row, squash to 55%, cut to 3 dark tones
  const { bx, by, bw, bh, mask } = G2;
  for (let r = 0; ; r++) { const sr = footRow - Math.floor(r / 0.55); if (sr < 0) break;
    const y = footY + r - by; if (y >= bh) break; if (y < 0) continue;
    const amp = r < 3 ? 0 : r < 30 ? 1 : 2, dx = Math.round(amp * Math.sin((footY + r) * 0.75 - wph(t, 2)));
    const row = sr * sw;
    for (let x = 0; x < sw; x++) { const p = src[row + x]; if (!(p >>> 24)) continue; const X = left + x + dx - bx; if (X < 0 || X >= bw) continue;
      const i = y * bw + X; if (!mask[i]) continue; const tn = RTONE.get(p >>> 0); if (tn !== undefined && tn < tone[i]) tone[i] = tn; } }
}
const pondLeaves = [], pondDecor = [];
const RIPPLE_F = [[1, 0], [2, 1], [3, 1], [5, 2], [6, 3]]; // the pond ripple: 5 frames x 0.2 s (rx, ry in screen px)
// v5.11.0.4 细雨: the river is part of the ground picture (no tone pass), so its rain hits draw the same ripple ring straight
// on the canvas, in the pond's ripple tones, no wider than the water around the hit (fmax, measured when the drop was aimed)
function drawRiverRipples() {
  if (!WX || !WX.rainHits) return; const H2 = WX.rainHits(); if (!H2.n) return;
  for (let i = 0; i < H2.n; i++) { const h = H2.a[i]; if (!h.river) continue; const f = Math.floor(h.age / 0.2); if (f < 0 || f > 4 || f > h.fmax) continue;
    const [sx, sy] = proj(h.x, h.y), cx = Math.round(sx), cy = Math.round(sy); if (cx < -8 || cy < -8 || cx > W + 8 || cy > H + 8) continue; const [rx, ry] = RIPPLE_F[f];
    ctx.fillStyle = f < 3 ? Ac[0] : Wt[5];
    for (let a = 0; a < 6.283; a += 0.1) { const dx = Math.round(Math.cos(a) * rx), dy = Math.round(Math.sin(a) * ry); if (f >= 3 && Math.abs(dy) < ry / 2) continue; ctx.fillRect(cx + dx, cy + dy, 1, 1); } }
}
// where the next drop lands: a random spot under the screen, inverted onto the ground. Not inside anything tall (it would fall
// through a roof or a canopy); water says which kind, so the hit becomes a pond / sea ripple or a river ring.
let rainFoot = null, rainFootAt = -9; const RF_CELL = 32;
function rainFeet() { // rotated footprints of the tall props (+ a trunk circle for trees) in a 32-unit grid, refreshed once a second
  if (rainFoot && realT - rainFootAt < 1 && realT >= rainFootAt) return rainFoot; rainFootAt = realT; rainFoot = new Map();
  const add = (x, y, hw, hd, c, s2) => { const r = hw + hd, e = [x, y, hw, hd, c, s2];
    for (let cx = Math.floor((x - r) / RF_CELL); cx <= Math.floor((x + r) / RF_CELL); cx++) for (let cy = Math.floor((y - r) / RF_CELL); cy <= Math.floor((y + r) / RF_CELL); cy++) {
      const k = cx * 4096 + cy; let l = rainFoot.get(k); if (!l) rainFoot.set(k, l = []); l.push(e); } };
  for (const p of props) { if (p.tree) { add(p.x, p.y, 4.5, 4.5, 1, 0); continue; } const m = p.m; if (!m || (m.h | 0) < 10) continue;
    const r = p.rot || 0; add(p.x + (m.cx || 0), p.y + (m.cy || 0), m.w / 2 / RS + 1, m.d / 2 / RS + 1, Math.cos(r), Math.sin(r)); }
  for (const t of S.trees) add(t.x, t.y, 4.5, 4.5, 1, 0);
  return rainFoot;
}
function rainUnder(x, y) { const l = rainFeet().get(Math.floor(x / RF_CELL) * 4096 + Math.floor(y / RF_CELL)); if (!l) return false;
  for (const [fx, fy, hw, hd, c, s2] of l) { const dx = x - fx, dy = y - fy, u = dx * c + dy * s2, v = -dx * s2 + dy * c; if (Math.abs(u) < hw && Math.abs(v) < hd) return true; } return false; }
const scr2w = (px, py) => { const rx = (px - CX) / RS, ry = (py - CY) / (K * RS); return [rx * CA + ry * SA, -rx * SA + ry * CA]; };
function rainPick() {
  const [x, y] = scr2w(Math.random() * W, Math.random() * (H + 6));
  if (x < WORLD.x0 || x > WORLD.x1 || y < WORLD.y0 || y > WORLD.y1) return null;
  if (rainUnder(x, y)) return null;
  if (groundAt(x, y)[1] !== 'water') return { x, y, water: 0 };
  const e = ((x - POND.x) / POND.rx) ** 2 + ((y - POND.y) / POND.ry) ** 2;
  if (e < 1.2 || WD.seaAt(x, y) === 'water') return { x, y, water: 1 };
  let fmax = -1; // river: the widest ring whose four ends are still water
  for (let f = 4; f >= 0 && fmax < 0; f--) { const [rx, ry] = RIPPLE_F[f], [sx, sy] = proj(x, y);
    if ([[rx, 0], [-rx, 0], [0, ry], [0, -ry]].every(([dx, dy]) => { const q = scr2w(sx + dx, sy + dy); return groundAt(q[0], q[1])[1] === 'water'; })) fmax = f; }
  return { x, y, water: 2, fmax };
}
function paintWater(t, box, key) {
  const [bx, by, bw, bh] = box; if (bw <= 0 || bh <= 0) return;
  const img = ctx.getImageData(bx, by, bw, bh), d = new Uint32Array(img.data.buffer);
  const g0 = WG[key]; if (!g0 || g0.aq !== AQ || g0.cX !== CX || g0.cY !== CY || g0.bx !== bx || g0.by !== by || g0.bw !== bw || g0.bh !== bh) WG[key] = waterGeom(d, bx, by, bw, bh, key === 'sea');
  const Gm = WG[key]; if (!Gm.n) return;
  const { mask, dist, far, midY, pondH, along, tone, band } = Gm, N = bw * bh, S1 = Math.round(pondH * 0.25), S2 = Math.round(pondH * 0.5);
  // 1 + 2: depth and sky
  for (let i = 0; i < N; i++) { if (!mask[i]) continue; const dd = dist[i], row = ((i / bw) | 0) - far[i % bw];
    let tn = dd > 7 ? 1 : 2; if (dd < 3) tn = 3; else if (band) { if (band[i] >= 1) tn = 3; if (band[i] >= 2) tn = 4; } else { if (row >= S1) tn = 3; if (row >= S2) tn = 4; } tone[i] = tn; }
  // v5.11.0.20: at the mouth the river's mid blue fans out into the sea and thins away (ordered dither, fixed on the map)
  if (Gm.open) { const pl = Gm.pl; for (let i = 0; i < N; i++) if (pl[i] && (pl[i] === 16 || (((i % bw) + ((i / bw) | 0)) & 1))) tone[i] = 3; } // solid, a checker fringe
  // 3: reflections of the trees and reeds behind the pond (their current wind pose)
  for (const o of props) { if (!o.tree) continue; const [sx, sy] = proj(o.x, o.y), X = Math.round(sx) - bx, Y = Math.round(sy);
    if (X < -40 || X > bw + 40 || Y < by - 70 || Y > by + bh) continue; const fx = clamp(X, 0, bw - 1); if (far[fx] < 0 || Y - by >= far[fx]) continue;
    const k = treeCache(o, treePoseT(o));
    reflectInto(Gm, tone, k.d32, k.c.width, k.c.height, k.oy, Math.round(sx) - k.ox, Y, t); }
  for (const b of billboards) { if (!b.reed) continue; const [sx, sy] = proj(b.x, b.y), X = Math.round(sx) - bx, Y = Math.round(sy); if (X < 0 || X >= bw || far[X] < 0 || Y - by >= far[X]) continue;
    const s = b.spr; spritePixels(s);
    reflectInto(Gm, tone, s.d32, s.width, s.height, s.height - 3, Math.round(sx) - (s.width >> 1), Y, t); }
  // 4: shallow edge on the near side, lapping dashes, foam where things stand in the water
  const ring = Math.sin(wph(t, 2)) > 0.35 ? 3 : 2;
  if (Gm.open) { // v5.11.0.20: the sea moves. The wash runs up the beach and back (a slow phase that wanders along the shore), its
    // front a broken line of foam; further out, low swell crests drift shoreward along the depth contours, one every 5 s loop
    const sh = Math.floor((t % WLOOP) / WLOOP * 256), LAPF = new Float32Array(256), ph = Gm.ph, lp = Gm.lp;
    for (let j = 0; j < 256; j++) LAPF[j] = 1.2 + 2.3 * (0.5 + 0.5 * Math.sin(j / 256 * 2 * Math.PI * 3 - wph(t, 1)));
    for (let i = 0; i < N; i++) { if (!mask[i]) continue; const dd = dist[i];
      if (dd < 4) { const F = LAPF[lp[i]]; if (dd <= F) tone[i] = dd > F - 1.2 ? (i * 7 % 5 ? 5 : 6) : 7; else if (dd < F + 1 && tone[i] > 3) tone[i] = 3; continue; }
      const q = ph[i]; if (q !== 255 && ((q + sh) & 255) < 18) tone[i] = Math.min(5, tone[i] + 1); } }
  else for (let i = 0; i < N; i++) { if (!mask[i]) continue; const y = (i / bw) | 0, dd = dist[i];
    if (dd < 1.5 && (Gm.open ? y > far[i % bw] + 2 : y > midY) && tone[i] >= 3) tone[i] = 7;
    if (Math.round(dd) === ring && tone[i] >= 2 && Math.sin(along[i] * 0.55 - wph(t, 2)) + 0.6 * Math.sin(along[i] * 0.23 + 1.3 - wph(t, 1)) > 0.55) tone[i] = 5; }
  for (const s of (key === 'sea' ? SEA_SOLIDS : POND_SOLIDS)) { const [sx, sy] = proj(s.x, s.y), cx = Math.round(sx) - bx, cy = Math.round(sy) - by;
    for (let a = 0; a < 6.283; a += 0.12) { const x = Math.round(cx + Math.cos(a) * (s.r + 1)), y = Math.round(cy + Math.sin(a) * (s.r * 0.5 + 1)); if (x < 0 || y < 0 || x >= bw || y >= bh || y < cy) continue;
      const i = y * bw + x; if (mask[i] && tone[i] >= 1 && Math.sin(x * 0.9 + y * 0.4 - wph(t, 2)) > 0.3) tone[i] = 5; } }
  // 5: the back bank: a mud lip on land, mirrored dark in the water, faint ripples, a waterline that creeps
  for (const x of Gm.back) { const f = far[x]; d[(f - 1) * bw + x] = u32(Wd[1]); if (f >= 2 && !mask[(f - 2) * bw + x]) d[(f - 2) * bw + x] = u32(Wd[2]); }
  for (const x of Gm.back) { const f = far[x]; tone[f * bw + x] = 0;
    for (const k of [1, 2, 3, 4, 6]) { const y = f + k; if (y >= bh || !mask[y * bw + x]) continue; const dx = k >= 4 ? Math.round(Math.sin((y + by) * 0.45 - wph(t, 2))) : 0;
      const sy = f - k, sx = clamp(x + dx, 0, bw - 1); if (sy < 0) continue; const c = d[sy * bw + sx]; if (mask[sy * bw + sx]) continue;
      const l = LUM(c), gr = (c >>> 8 & 255) > (c & 255) + 12; tone[y * bw + x] = l < 36 ? 0 : gr ? 9 : 8; }
    for (let k = 2; k <= 5; k++) { const y = f + k; if (y >= bh) break; const i = y * bw + x; if (!mask[i]) continue;
      const w = Math.sin((x + bx) * 0.6 - wph(t, 1) + k * 1.7) + 0.6 * Math.sin((x + bx) * 0.23 + k - wph(t, 1)); if (w > 0.95 && (tone[i] === 0 || tone[i] === 8 || tone[i] === 9)) tone[i] = tone[i] === 9 ? 0 : 1; } }
  // 6: drops, glints, floating leaves, lily pad shadows (new random spots every loop)
  const L = Math.floor(t / WLOOP), lt = t - L * WLOOP, rr = mulberry32(L * 7919 + 13), put = (x, y, tn, minT = 0) => { if (x < 0 || y < 0 || x >= bw || y >= bh) return; const i = y * bw + x; if (mask[i] && tone[i] >= minT) tone[i] = tn; };
  const ripple = (cx, cy, age) => { const f = Math.floor(age / 0.2); if (f < 0 || f > 4) return; const [rx, ry] = RIPPLE_F[f];
    for (let a = 0; a < 6.283; a += 0.1) { const dx = Math.round(Math.cos(a) * rx), dy = Math.round(Math.sin(a) * ry); if (f >= 3 && Math.abs(dy) < ry / 2) continue; put(cx + dx, cy + dy, f < 3 ? 6 : 5, 1); } };
  const at = arr => { const i = arr[Math.floor(rr() * arr.length)]; return [i % bw, (i / bw) | 0]; };
  if (Gm.sky.length) for (let g = 0; g < 20; g++) { const [x, y] = at(Gm.sky), s0 = rr() * (WLOOP - 0.6), a = (lt - s0) / 0.6; if (a < 0 || a >= 1) continue;
    const xs = a < 0.15 ? [0] : a < 0.3 ? [-1, 0, 1] : a < 0.65 ? [-2, -1, 0, 1, 2] : a < 0.85 ? [-2, -1, 1, 2] : [-2, 2];
    for (const dx of xs) put(x + dx, y, Math.abs(dx) <= (xs.length >= 5 ? 1 : 0) ? 6 : 5, 1); }
  if (Gm.deep.length) { const [x, y] = at(Gm.deep), s0 = rr() * (WLOOP - 1); ripple(x, y, lt - s0); }
  // v5.4.3: rain uses the pond's own ripples, just more of them. v5.11.0.4: one ripple where each drop actually lands (pond and sea)
  if (WX && WX.rainHits) { const H2 = WX.rainHits(); for (let i = 0; i < H2.n; i++) { const h = H2.a[i]; if (h.river) continue;
    const [sx, sy] = proj(h.x, h.y), cx = Math.round(sx) - bx, cy = Math.round(sy) - by; if (cx < 0 || cy < 0 || cx >= bw || cy >= bh || !mask[cy * bw + cx]) continue; ripple(cx, cy, h.age); } }
  // v4.4: asynkimo step 6 also has warm point glints (yellow/white pluses) and falling drips, not only dashes and leaves
  if (Gm.sky.length) for (let g = 0; g < 10; g++) { const [x, y] = at(Gm.sky), s0 = rr() * (WLOOP - 0.45), a = (lt - s0) / 0.45; if (a < 0 || a >= 1) continue;
    pondDecor.push([x + bx, y + by, g % 3 === 0 ? Ac[1] : Ac[0], a > 0.28 && a < 0.7 ? 1 : 0]); }
  if (Gm.deep.length) for (let g = 0; g < 3; g++) { const [x, y] = at(Gm.deep), s0 = rr() * (WLOOP - 0.4), a = (lt - s0) / 0.4; if (a < 0 || a >= 1) continue;
    pondDecor.push([x + bx, y + by, Ac[0], a > 0.35 && a < 0.65 ? 1 : 0]); }
  if (Gm.deep.length) { const [x, y] = at(Gm.deep), s0 = rr() * (WLOOP - 1.4), a = lt - s0;
    if (a >= 0 && a < 0.85) pondDecor.push([x + bx, y + by - Math.round((0.85 - a) * 18), Wt[5], 2]);
    else if (a >= 0.85 && a < 1.85) ripple(x, y, a - 0.85); }
  if (Gm.deep.length) for (let q = 0; q < 2; q++) { const [x, y] = at(Gm.deep), s0 = rr() * WLOOP, a = ((lt - s0) % WLOOP + WLOOP) % WLOOP, col = q ? Ac[1] : G[4];
    if (a < 1.2) pondLeaves.push([x + bx, y + by - Math.round((1.2 - a) * 16), col]);                 // falling
    else if (a < 4.2) { const fx = x + Math.round((a - 1.2) * 3); put(fx, y + 1, 0); put(fx - 1, y, 5, 1); pondLeaves.push([fx + bx, y + by, col]); ripple(x, y, a - 1.2); } // floating
    else if (a < 4.8) { const fx = x + 9; if (a < 4.5) pondLeaves.push([fx + bx, y + by, col, 1]); } }  // sinking
  if (key === 'pond') for (const dcl of decals) { if (dcl.lily === undefined) continue; const [sx, sy] = proj(dcl.x, dcl.y); dcl.bob = Math.sin(wph(t, 1) + 1.7 * dcl.lily) > 0.4 ? 1 : 0;
    const x0 = Math.round(sx) - (dcl.c.width >> 1) - bx, yb = Math.round(sy) + 1 + dcl.bob - by; for (let x = x0 + 2; x < x0 + dcl.c.width - 2; x++) put(x, yb, 0); }
  // damp ground on the near shore, the creeping waterline, then tones -> colours
  for (const i of Gm.damp) { const s = SHADE.get(d[i]); if (s) d[i] = s; }
  for (const x of Gm.back) { if (Math.sin((x + bx) * 0.35 - wph(t, 1)) + 0.5 * Math.sin((x + bx) * 0.13 + 1 - wph(t, 1)) > 0.6) d[(far[x] - 1) * bw + x] = WTONE[0]; }
  for (let i = 0; i < N; i++) if (mask[i]) d[i] = WTONE[tone[i]];
  ctx.putImageData(img, bx, by);
}
function waterPass(t) {
  pondDecor.length = 0; pondLeaves.length = 0;
  paintWater(t, waterBox(), 'pond');
  paintWater(t, seaBox(), 'sea');
}

// v5.11.0.20 河水在流: the river is baked into the ground picture, so the flow is a light layer of moving marks on top: pale
// streaks and darker ripples drifting downstream (faster mid-stream), glints that blink, now and then a leaf. They follow the
// centre line (plots.js riverAt), spread across the widening mouth and thin out in the sea. ~520 marks, culled to the screen,
// a few pixels each. At each water wheel: foam where the paddles enter and leave the water and a short wake downstream.
const FLOW = (() => { const r = mulberry32(90517), L = PL.RIVER_LEN[PL.RIVER_LEN.length - 1], out = [];
  for (let i = 0; i < 520; i++) { const u = (r() * 2 - 1) * 0.78, k = r(), kind = k < 0.58 ? 0 : k < 0.8 ? 3 : k < 0.985 ? 1 : 2;
    out.push({ s0: r() * L, u, kind, v: (4.2 + r() * 1.6) * (1 - 0.45 * u * u) * (kind === 2 ? 0.75 : 1), ph: r(), cut: r() }); }
  return { L, out }; })();
function drawRiverFlow(t) {
  const L = FLOW.L, M = WD.MOUTH, hx = XP.riverHalf;
  for (const q of FLOW.out) {
    const s = ((q.s0 + q.v * t) % L + L) % L, c = PL.riverAt(s); if (c.x - M.x > q.cut * 34) continue; // thins out in the sea
    const hw = hx(c.x, c.y) - 1.4, x = c.x - c.fy * q.u * hw, y = c.y + c.fx * q.u * hw, [sx, sy] = proj(x, y), X = Math.round(sx), Y = Math.round(sy);
    if (X < -4 || Y < -4 || X > W + 4 || Y > H + 4) continue;
    const [ex, ey] = proj(x + c.fx, y + c.fy), dl = Math.hypot(ex - sx, ey - sy) || 1, dx = (ex - sx) / dl, dy = (ey - sy) / dl;
    const life = ((t * 0.4 + q.ph) % 1); // each mark fades in and out on its own beat, so they never read as a conveyor belt
    if (q.kind === 0) { if (life > 0.75) continue; const n = life < 0.1 || life > 0.65 ? 2 : 4;
      ctx.fillStyle = Wt[4]; for (let k = 1; k < n; k++) ctx.fillRect(X - Math.round(dx * k), Y - Math.round(dy * k), 1, 1); ctx.fillStyle = Wt[5]; ctx.fillRect(X, Y, 1, 1); }
    else if (q.kind === 3) { if (life > 0.6) continue; ctx.fillStyle = Wt[1]; for (let k = 0; k < 3; k++) ctx.fillRect(X - Math.round(dx * k), Y - Math.round(dy * k) + 1, 1, 1); }
    else if (q.kind === 1) { if (life > 0.14) continue; ctx.fillStyle = Ac[0]; ctx.fillRect(X, Y, 1, 1); if (life > 0.04 && life < 0.1) { ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X, Y - 1, 1, 3); } }
    else { const turn = Math.floor(t * 1.6 + q.ph * 4) & 1; ctx.fillStyle = Wt[1]; ctx.fillRect(X, Y + 1, 2, 1); ctx.fillStyle = q.ph < 0.5 ? G[4] : Ac[1]; ctx.fillRect(X, Y, turn ? 2 : 1, turn ? 1 : 2); }
  }
  // the wheels: the bottom paddles go downstream with the current, so they dip in on the upstream side and lift out downstream
  const sites = XP.wheelSites(); if (!sites.length) return; const on = new Set(PW.wheelsOf(S.plots, (S.eff && S.eff.wheel) | 0).map(w => w.plot));
  for (const w of sites) { const [cx0, cy0] = proj(w.x, w.y); if (cx0 < -40 || cy0 < -40 || cx0 > W + 40 || cy0 > H + 40) continue; const turning = on.has(w.plot);
    for (const side of [-1, 1]) { const px = w.x + w.fx * 4.9 * side, py = w.y + w.fy * 4.9 * side, [sx, sy] = proj(px, py), X = Math.round(sx), Y = Math.round(sy);
      const fr = Math.floor(t * (turning ? 8 : 2) + (side > 0 ? 0 : 3)), n = turning ? 9 : 3;
      for (let k = 0; k < n; k++) { const h = ((fr * 7 + k * 13) % 11) / 11, ox = Math.round((h - 0.5) * 7), oy = Math.round((((fr + k * 5) % 7) / 7 - 0.5) * 4);
        ctx.fillStyle = k % 2 ? Wt[5] : Ac[0]; ctx.fillRect(X + ox, Y + oy, 1, 1); } }
    if (!turning) continue;
    for (let k = 0; k < 7; k++) { const a = ((t * 0.9 + k / 7) % 1), d = 5 + a * 9, sp = (k % 3 - 1) * (0.6 + a * 1.4), px = w.x + w.fx * d - w.fy * sp, py = w.y + w.fy * d + w.fx * sp; // the wake
      if (a > 0.8) continue; const [sx, sy] = proj(px, py); ctx.fillStyle = a < 0.35 ? Ac[0] : Wt[5]; ctx.fillRect(Math.round(sx), Math.round(sy), a < 0.3 ? 2 : 1, 1); } }
}
function drawPondLeaves() {
  for (const [x, y, c, sink] of pondLeaves) { ctx.fillStyle = c; ctx.fillRect(x, y, sink ? 1 : 2, 1); }
  for (const [x, y, c, sh] of pondDecor) { ctx.fillStyle = c; if (sh === 1) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); } else if (sh === 2) ctx.fillRect(x, y, 1, 2); else ctx.fillRect(x, y, 1, 1); }
}

function stepPondFish(dm) {
  for (const f of S.pondFish) {
    f.a = (f.a || 0) + Math.sin((realT * 0.8 + (f.day || 0)) * 1.1) * 0.5 * dm;
    const sp = (f.v || 0.45) * dm * 3;
    f.x += Math.cos(f.a) * sp; f.y += Math.sin(f.a) * sp;
    const dx = (f.x - POND.x) / (POND.rx * 0.7), dy = (f.y - POND.y) / (POND.ry * 0.7), h = dx * dx + dy * dy;
    if (h > 1) { const s = Math.sqrt(h) || 1; f.a += 2.2; f.x = POND.x + dx / s * POND.rx * 0.68; f.y = POND.y + dy / s * POND.ry * 0.68; }
  }
}
function drawPondFish() {
  for (const f of S.pondFish) {
    const col = (FS.ORN_BY[f.kind] || FS.fishOf(f.kind) || { col: '#e06a2c' }).col;
    const [sx, sy] = proj(f.x, f.y), x = Math.round(sx), y = Math.round(sy);
    const left = Math.cos(f.a || 0) < 0;
    ctx.fillStyle = col; ctx.fillRect(x - 2, y - 1, 5, 2); ctx.fillRect(x + (left ? -3 : 2), y - 1, 1, 1);
    ctx.fillStyle = '#fff6dc'; ctx.fillRect(x + (left ? -2 : 1), y - 1, 1, 1);
  }
  if (S.doorGift) {
    const [sx, sy] = proj(DOOR.x + 7, DOOR.y + 5), x = Math.round(sx), y = Math.round(sy);
    if (S.doorGift.kind === 'flower') { ctx.fillStyle = '#e57fa0'; ctx.fillRect(x, y - 3, 2, 2); ctx.fillStyle = '#5a9a3a'; ctx.fillRect(x, y - 1, 1, 3); }
    else { ctx.fillStyle = '#7a5230'; ctx.fillRect(x - 1, y, 5, 1); ctx.fillRect(x + 3, y - 1, 1, 2); }
  }
  for (const it of (S.loose || [])) {
    const [sx, sy] = proj(it.x, it.y); ctx.fillStyle = '#5e3524'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 2);
  }
}
// style A: a whole-pixel rod, line and bobber. The line is a Bresenham of 1px ink. Pose maths live in PFFish.pose:
// the rod points at the water (up and left at the pond's right bank), the bobber bobs, a bite dips it, and a catch
// arcs the fish out toward the fisher. Rare fish glow (same gold rim + plus-spark as a glowing crop) and a heart emote
// floats up from the head.
function linePx(x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let x = x0, y = y0, err = dx - dy;
  ctx.fillStyle = col;
  while (true) { ctx.fillRect(x, y, 1, 1); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x += sx; } if (e2 < dx) { err += dx; y += sy; } }
}
function drawRod(grip, tip, look) {
  const dx = tip.x - grip.x, dy = tip.y - grip.y, L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;
  linePx(grip.x + px, grip.y + py, tip.x + px, tip.y + py, look.ink);
  linePx(grip.x, grip.y, tip.x, tip.y, look.shaft);
  linePx(grip.x - px * 0.4, grip.y - py * 0.4, grip.x + dx * 0.35, grip.y + dy * 0.35, look.hi);
  const gx = Math.round(grip.x), gy = Math.round(grip.y);
  ctx.fillStyle = look.ink; ctx.fillRect(gx - 1, gy - 1, 3, 3);
  ctx.fillStyle = look.wrap; ctx.fillRect(gx - 1, gy, 3, 2);
  ctx.fillStyle = look.tip; ctx.fillRect(Math.round(tip.x), Math.round(tip.y) - 1, 1, 2);
}
function drawBobber(x, y) {
  const bx = Math.round(x), by = Math.round(y);
  ctx.fillStyle = Ink[0]; ctx.fillRect(bx - 1, by - 3, 3, 5);
  ctx.fillStyle = Rf[2]; ctx.fillRect(bx - 1, by - 2, 2, 2);
  ctx.fillStyle = Ac[0]; ctx.fillRect(bx - 1, by, 2, 1);
}
function drawTinyFish(x, y, col, dir, glow, t, id) {
  const bx = Math.round(x), by = Math.round(y), s = dir < 0 ? -1 : 1;
  const ICN = window.PFCodexIcons;
  if (id && ICN && ICN.has('fish', id)) {
    const img = ICN.paint('fish', id);
    if (glow) {
      const ph = Math.abs(Math.floor((t || 0) * 5 + bx + by)) % 6;
      ctx.fillStyle = ph % 2 ? '#ffffff' : '#ffd76a';
      ctx.fillRect(bx - 4 + (ph % 3), by - 10, 5, 1); ctx.fillRect(bx, by - 11, 1, 5);
      ctx.fillRect(bx + 10, by - 1 + (ph % 2), 1, 1);
      ctx.fillRect(bx - 12, by + 2, 1, 1);
    }
    ICN.blit(ctx, img, bx - (img.w >> 1), by - (img.h >> 1), { flip: s < 0, scale: 1 });
    return;
  }
  const pix = (ox, oy, c) => { ctx.fillStyle = c; ctx.fillRect(bx + ox * s - (s < 0 ? 1 : 0), by + oy, 1, 1); };
  const body = [[-3, 0], [-2, -1], [-2, 0], [-2, 1], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, 0], [2, -1], [2, 1], [3, 0]];
  if (glow) { // plus-sparks around the fish (same language as a glowing crop), then the body on top so it stays readable
    const ph = Math.abs(Math.floor((t || 0) * 5 + bx + by)) % 6;
    ctx.fillStyle = ph % 2 ? '#ffffff' : '#ffd76a';
    ctx.fillRect(bx - 2 + (ph % 3), by - 6, 5, 1); ctx.fillRect(bx, by - 7, 1, 5);
    ctx.fillRect(bx + 5, by - 1 + (ph % 2), 1, 1);
    ctx.fillRect(bx - 5, by + 2, 1, 1);
  }
  for (const [ox, oy] of body) { pix(ox - 1, oy, Ink[0]); pix(ox + 1, oy, Ink[0]); pix(ox, oy - 1, Ink[0]); pix(ox, oy + 1, Ink[0]); }
  for (const [ox, oy] of body) pix(ox, oy, col);
  pix(-1, 0, Ac[0]); pix(0, 1, Ac[0]);
  pix(-2, -1, Ink[0]);
}
function drawFishEmote(e) {
  const x = Math.round(e.x), y = Math.round(e.y);
  ctx.globalAlpha = Math.max(0, Math.min(1, e.a));
  ctx.fillStyle = Ink[0]; ctx.fillRect(x - 5, y - 6, 11, 9); ctx.fillRect(x - 1, y + 3, 3, 2);
  ctx.fillStyle = Ac[0]; ctx.fillRect(x - 4, y - 5, 9, 7);
  ctx.fillStyle = Ink[0]; ctx.fillRect(x, y + 2, 1, 2);
  // little heart
  ctx.fillStyle = Ac[3];
  ctx.fillRect(x - 2, y - 3, 2, 1); ctx.fillRect(x + 1, y - 3, 2, 1);
  ctx.fillRect(x - 2, y - 2, 5, 1); ctx.fillRect(x - 1, y - 1, 3, 1); ctx.fillRect(x, y, 1, 1);
  ctx.globalAlpha = 1;
}
function fishPhaseU(k) {
  if (k.phase === 'cast') return Math.min(1, k.work / FS.CAST);
  if (k.phase === 'wait') return 1;
  if (k.phase === 'bite') return Math.min(1, (k.work - FS.CAST - k.wait) / FS.BITE);
  if (k.phase === 'reel') return Math.min(1, (k.work - FS.CAST - k.wait - FS.BITE) / FS.REEL);
  if (k.phase === 'show') return Math.min(1, (k.work - FS.CAST - k.wait - FS.BITE - FS.REEL) / FS.SHOW);
  return 1;
}
function drawFishing() {
  for (const P of actors()) {
    const k = P.task; if (!k || k.kind !== 'fish' || P.moving || P.home || !k.hook) continue;
    const [fx, fy] = proj(P.x, P.y), [hx0, hy0] = proj(k.hook.x, k.hook.y);
    const look = FS.rodLook(S.eff.rod, k.water === 'sea' && S.eff.searod);
    const p = FS.pose(Math.round(fx), Math.round(fy), Math.round(hx0), Math.round(hy0), k.phase || 'wait', fishPhaseU(k), realT, k.result);
    drawRod(p.grip, p.tip, look);
    if (p.lineEnd) {
      if (p.bob.slack) {
        const mx = (p.tip.x + p.lineEnd.x) / 2, my = (p.tip.y + p.lineEnd.y) / 2 + p.bob.slack;
        linePx(p.tip.x, p.tip.y, mx, my, Ink[0]); linePx(mx, my, p.lineEnd.x, p.lineEnd.y - 2, Ink[0]);
      } else linePx(p.tip.x, p.tip.y, p.lineEnd.x, p.lineEnd.y - (p.fish ? 0 : 2), Ink[0]);
    }
    if (p.bob.show) drawBobber(p.bob.x, p.bob.y);
    if (p.fish) {
      const col = (k.result && k.result.col) || (k.result && FS.fishOf(k.result.fish) && FS.fishOf(k.result.fish).col) || '#cf6a3c';
      drawTinyFish(p.fish.x, p.fish.y, col, p.fish.dir, p.fish.glow, realT, k.result && k.result.fish);
      if (p.fish.glow && window.PF_FX) {
        const slot = Math.floor(realT / 0.45);
        if (k._glowSlot !== slot) { k._glowSlot = slot; PF_FX.play('glow', P.x + (k.hook.x - P.x) * (1 - p.fish.p), P.y + (k.hook.y - P.y) * (1 - p.fish.p), 8 + p.fish.p * 6); }
      }
    }
    if (p.emote) drawFishEmote(p.emote);
  }
}

let realT = 0;
const leaves = [], fireflies = [];
const SHADE = new Map(); for (const c of PAL.colors) SHADE.set(u32(c), u32(PAL.dark(c, 1)));
function applyShadows() { // shadow = the same ground colour one ramp step darker (stays on the palette)
  const m = new Uint32Array(sctx.getImageData(0, 0, W, H).data.buffer), img = ctx.getImageData(0, 0, W, H), d = new Uint32Array(img.data.buffer);
  for (let i = 0; i < d.length; i++) if (m[i] >>> 24) { const s = SHADE.get(d[i]); if (s) d[i] = s; }
  ctx.putImageData(img, 0, 0);
}
const PROF = Q.has('prof') ? (window.__prof = {}) : null; let _pt = 0; const tick = k => { if (!PROF) return; const t = performance.now(); PROF[k] = (PROF[k] || 0) + t - _pt; _pt = t; };
function render() {
  setCam(); if (PROF) _pt = performance.now();
  const T = S.t % 1440, night0 = dayLight(T), night = fairNow() ? Math.min(night0, 0.58) : night0, warm = warmth(T), poseT = Math.floor(realT * 10) / 10;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = G[1]; ctx.fillRect(0, 0, W, H);
  const [gx, gy] = proj(GX0, GY0);
  { // only the part of the (big) ground canvas under the screen: invert the four screen corners into ground pixels
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [px, py] of [[0, 0], [W, 0], [0, H], [W, H]]) { const rx = (px - CX) / RS, ry = (py - CY) / (K * RS), wx = rx * CA + ry * SA, wy = -rx * SA + ry * CA;
      const u = (wx - GX0) * RS, v = (wy - GY0) * RS; x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v); }
    x0 = clamp(Math.floor(x0) - 4, 0, GW); y0 = clamp(Math.floor(y0) - 4, 0, GH); x1 = clamp(Math.ceil(x1) + 4, 0, GW); y1 = clamp(Math.ceil(y1) + 4, 0, GH);
    ctx.setTransform(CA, SA * K, -SA, CA * K, Math.round(gx), Math.round(gy));
    if (x1 > x0 && y1 > y0) ctx.drawImage(groundBase, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); ctx.setTransform(1, 0, 0, 1, 0, 0); }
  tick('ground');
  waterPass(realT); drawRiverRipples(); tick('water');
  if (IN && S.inn && IN.deckUp(S.inn) && IN.isSunset(T)) captureSunsetWater();
  else { SUN_WMASK = null; }
  drawRiverFlow(realT); tick('flow'); // v5.11.0.20: after the sunset capture (it matches the river by colour)
  if (WX) WX.drawWet(ctx, proj, RS, { pathSegs, W, H, regionOpen });
  // flat things on the ground: tilled soil tiles (rotation-cached stacks), decals, seeds
  const allTiles = HT.length ? tiles.concat(HT) : tiles; // v5.9.0: the little farms' six tiles each
  for (const t of allTiles) if ((t.tilled || t.crop) && onScreen(t.x, t.y, 20)) drawStack(ctx, models.soil[t.watered ? 1 : 0], t.x, t.y, 0, 0);
  for (const d of decals) { const [sx, sy] = proj(d.x, d.y); if (sx < -8 || sx > W + 8 || sy < -4 || sy > H + 12) continue; const bob = d.bob || 0; ctx.drawImage(d.c, Math.round(sx) - (d.c.width >> 1), Math.round(sy) - d.c.height + 1 + bob); }
  partyGround(); // v5.11.0.15: the dance floor and the picnic rug
  if (WX && WX.drawRainGround) WX.drawRainGround(ctx, proj, W, H); // v5.11.0.4: splashes and wet spots, under everything standing
  tick('soil+decals');
  const list = [];
  if (WX && WX.eachDrop) WX.eachDrop(d => list.push({ rain: d, x: d.x, y: d.y, flat: 1 })); // falling drops sort with the objects
  for (const p of props) if (onScreen(p.x, p.y, p.tree ? 70 : 50)) list.push(p);
  for (const b of billboards) if (onScreen(b.x, b.y, 30)) list.push(b);
  for (const t of S.trees) if (onScreen(t.x, t.y, 70)) list.push(treeView(t));
  for (const t of allTiles) { if (!onScreen(t.x, t.y, 30)) continue;
    if (t.debris) list.push({ m: debrisModel(t.debris), x: t.x, y: t.y, rot: t.debris.rot, z: 0 });
    if (t.weed) list.push({ spr: weedSprite(t.weed), x: t.x, y: t.y, sway: 0.8, w: 1 });
    if (t.crop) { if (SU.isPart(t.crop)) continue;
      const glow = !!t.crop.glow, giant = !!t.crop.giant, cx = giant ? t.x + TILE / 2 : t.x, cy = giant ? t.y + TILE / 2 : t.y;
      if ((t.crop.stage === 3 || giant) && CROPI.ok) list.push({ ci: CROP_IDS.indexOf(t.crop.type), x: cx, y: cy, flip: t.crop.rot > 3.14, glow, giant: giant ? 1 : 0 });
      else list.push({ spr: CROP_SPR[Math.min(2, t.crop.stage)], x: t.x, y: t.y, sway: t.crop.stage === 2 ? 0.5 : 0, flat: t.crop.stage === 0, glow }); }
  }
  for (const c of yard) {
    if (c.type === 'weed') list.push({ spr: weedSprite(c), x: c.x, y: c.y, sway: 0.8, w: 1 });
    else list.push({ m: clutterModel(c), x: c.x, y: c.y, rot: c.rot, z: 0 });
  }
  if (S.animals.length) { troughLook();
    for (const a of S.animals) { const v = animalView(a); if (!onScreen(v.x, v.y, 30)) continue; const sp = ANIMAL_SPR[a.kind], moving = Math.hypot(v.tx - v.x, v.ty - v.y) > 0.4 && !v.hold;
      list.push({ spr: (v.flip ? sp.l : sp.r)[moving ? Math.floor(v.step / 3) % 2 : v.graze ? 2 : 0], x: v.x, y: v.y, w: 1 }); }
    const eggs = Math.min(4, S.animals.reduce((n, a) => n + (a.kind === 'chicken' ? a.ready : 0), 0));
    for (let i = 0; i < eggs; i++) list.push({ spr: EGG, x: PENS.coop.bld.x - 6 + i * 4, y: PENS.coop.bld.y + 15 + (i % 2), flat: 1 }); }
  for (const p of PETS_LIVE) { const v = petView(p); if (!onScreen(v.x, v.y, 20)) continue; const sp = petSprite(p); list.push({ spr: (v.flip ? sp.l : sp.r)[petFrame(p, v)], x: v.x, y: v.y, w: 1 }); }
  let farmerD = null;
  if (!F.home) { farmerD = Object.assign({ bb: 1, x: F.x, y: F.y }, carryFields(F), farmerPose()); partyLook(farmerD, F, 'farmer'); list.push(farmerD); }
  const familyD = familyDraw(list, T); // v5.0: 阿禾 (at her flower stall, or at home on the farm), the children, a cradle on the porch
  const selling = F.task && F.task.to === STALL_SPOT && !F.moving && !F.home;
  if (!shopOpen(T)) list.push({ spr: CLOSED, x: STALL.x, y: STALL_SPOT.y + 1, lift: 13 }); // v5.0: gone home; a little 'closed' board on the counter
  else list.push({ bb: 1, x: KEEPER.x, y: KEEPER.y, sheet: S.family.moved ? famSheet('father') || undefined : undefined, row: selling && SPR.rows.keeper_wave !== undefined ? 'keeper_wave' : 'keeper', fr: selling ? Math.floor(realT * 5) : (Math.floor(realT * 0.8) % 5 === 4 ? 1 : 0), flip: false });
  if (FOG.on && !FOG.empty && !FOG.peek) { let n = 0; for (const o of list) if (o.rain || !fogHid(o.x, o.y)) list[n++] = o; FOG.hidN = list.length - n; list.length = n; } else FOG.hidN = 0; // v5.11.0.13: nothing under the cloud is drawn
  for (const o of list) o.depth = o.at ? proj(o.at.x, o.at.y)[2] + 0.05 : proj(o.x, o.y + (o.dy || 0))[2] + (o.bb ? 0.3 : 0); // at: sorts just after that spot (v5.11.0.15: plates on the party table)
  list.sort((a, b) => a.depth - b.depth);
  // shadows: one mask, then the ground under it steps one palette shade darker
  sctx.clearRect(0, 0, W, H);
  const sun = clamp((T - 6 * 60) / (12 * 60), 0, 1), sdx = (sun - 0.5) * -1.2;
  for (const o of list) { if (o.flat || o.ci !== undefined) continue; if (o.bb) { bbShadow(sctx, o); continue; } if (o.spr) { if (o.w) bbShadow(sctx, o); continue; }
    const s = o.m.h / RS * 0.25; drawFoot(sctx, o.m, o.x + (o.m.cx || 0), o.y + (o.m.cy || 0), o.rot, sdx * s, 0.35 * s); }
  tick('list+shadowmask');
  if (night < 0.9) applyShadows();
  tick('applyShadows');
  for (const o of list) {
    if (o.rain) { WX.drawDrop(ctx, o.rain, proj); continue; }
    if (o.bb) { drawBillboard(ctx, o); continue; }
    if (o.tree) { drawTree(ctx, o); tick('o.tree'); continue; }
    if (o.ci !== undefined) { drawCrop(ctx, o, poseT); continue; }
    if (o.spr) { drawSpr(ctx, o, poseT); continue; }
    drawStack(ctx, o.m, o.x, o.y, o.z || 0, o.rot || 0); tick(o.m.w * o.m.d * o.m.h >= 3000 ? 'o.big' : 'o.small');
  }
  PARTY_DRAW_LAST = list.filter(o => o.partyKey);
  tick('objects');
  fogUpdate(); drawFog(); tick('fog');
  if (farmerD && !fogHid(farmerD.x, farmerD.y)) drawBillboard(ctx, farmerD, 0.35); // ghost, so he never disappears behind the barn or a tree
  for (const d of familyD) if (!fogHid(d.x, d.y)) drawBillboard(ctx, d, 0.35);
  drawMarks(); tick('marks');
  careerSigns();
  if (window.PF_FX) PF_FX.draw(ctx, proj, RS);
  for (const p of particles) { if (p.text || fogHid(p.x, p.y)) continue; const [sx, sy] = proj(p.x, p.y); if (p.spr) { const a = p.fade ? Math.max(0, Math.min(1, p.life / 0.4)) : 1; if (a < 1) ctx.globalAlpha = a; ctx.drawImage(p.spr, Math.round(sx) - (p.spr.width >> 1), Math.round(sy - p.z * RS) - p.spr.height); if (a < 1) ctx.globalAlpha = 1; continue; } ctx.fillStyle = p.c;
    if (p.kind === 'heart') { const hx = Math.round(sx), hy = Math.round(sy - p.z * RS); ctx.fillRect(hx - 2, hy, 2, 1); ctx.fillRect(hx + 1, hy, 2, 1); ctx.fillRect(hx - 2, hy + 1, 5, 1); ctx.fillRect(hx - 1, hy + 2, 3, 1); ctx.fillRect(hx, hy + 3, 1, 1); continue; } const s = p.kind === 'smoke' ? 3 : 2; ctx.fillRect(Math.round(sx), Math.round(sy - p.z * RS), s, s); }
  for (const l of leaves) { if (fogHid(l.x, l.y)) continue; const [sx, sy] = proj(l.x, l.y); ctx.fillStyle = l.c; ctx.fillRect(Math.round(sx + Math.sin(l.ph) * 3), Math.round(sy - l.z), 2, 1); }
  drawPondLeaves();
  drawPondFish();
  drawFishing();
  if (warm > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(255,${190 + 40 * (1 - warm)},${150 + 80 * (1 - warm)},${0.55 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (IN && S.inn && IN.deckUp(S.inn) && IN.isSunset(T)) drawSunsetWash(ctx, T, realT);
  if (WX) WX.drawSky(ctx, W, H);
  if (night > 0) lighting(night, T);
  if (INS) INS.draw(ctx, proj, RS);
  if (night > 0.5) for (const f of fireflies) { if (fogHid(f.x, f.y)) continue; const [sx, sy] = proj(f.x, f.y); if (Math.sin(realT * 3 + f.ph) > 0.2) { ctx.fillStyle = '#f6f29a'; ctx.fillRect(Math.round(sx), Math.round(sy - f.z * RS), 1, 1); } }
  for (const p of particles) if (p.text && !fogHid(p.x, p.y)) { const [sx, sy] = proj(p.x, p.y); const a = p.fade ? Math.max(0, Math.min(1, p.life / 0.4)) : 1; if (a < 1) ctx.globalAlpha = a; pixText(p.text, sx, sy - p.z * RS, p.c); if (a < 1) ctx.globalAlpha = 1; }
  tick('fx+light');
  if (F.sleeping || (F.home && night > 0.7)) {
    const [sx, sy] = proj(HOUSE.x + 8, HOUSE.y - 5);
    for (let i = 0; i < 3; i++) { const ph = (realT * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - ph; pixText('Z', sx + 6 + ph * 18 + Math.sin(ph * 6) * 3, sy - 80 - ph * 26, '#f4f0ff', ph > 0.5 ? 2 : 1); }
    ctx.globalAlpha = 1;
  }
  if (PATHDEBUG || dbgRoutes.length) drawPathOverlay();
}
function actorRoutes() {
  const out = [];
  for (const a of actors()) if (a.task && a.task.via && a.task.via.length) out.push({ points: [{ x: a.x, y: a.y }, ...a.task.via, a.task.to], color: a === FARMER ? '#ffe566' : '#b6f27a' });
  for (const v of AV.values()) if (v.via && v.via.length) out.push({ points: [{ x: v.x, y: v.y }, ...v.via, { x: v.tx, y: v.ty }], color: '#7ec8ff' });
  for (const v of PV.values()) if (v.via && v.via.length) out.push({ points: [{ x: v.x, y: v.y }, ...v.via, { x: v.tx, y: v.ty }], color: '#ff9ed1' });
  return out;
}
function drawPathOverlay() {
  const routes = dbgRoutes.length ? dbgRoutes : actorRoutes();
  NAV.draw(ctx, ensureNav(), (x, y) => proj(x, y), routes, { showDirt: !!PATHDEBUG && PATHDEBUG !== 'routes' });
}
// Trees are composed in plain pixel arrays (trunk stack + clump sprites + outline), then put once: no canvas read-back per pose,
// which matters with ~100 trees all re-posing at 10 Hz and every one re-laid while the camera turns.
// Trunks are fixed. Every clump on a tree shares one wind sample (the trunk position), scaled by weight, so the canopy
// sways as a whole instead of each tier jumping on its own phase. Pines also cap at 1 px and drop the vertical lift.
function onScreen(x, y, pad) { const [sx, sy] = proj(x, y); return sx > -pad && sx < W + pad && sy > -pad && sy < H + pad + 90; }
// order markers and region signs: an axe over trees marked for chopping, a flag where a sapling goes, the padlock and price
const AXE_MARK = pix(['..iii', '.iRRi', 'iRRRi', '.iRwi', '...w.', '..w..', '.w...']);
const FLAG = pix(['w.', 'wrr', 'wrrr', 'wrr', 'w', 'w', 'w']);
const HOVER = pix(['i...i', '.....', '.....', '.....', 'i...i'], false);
function markAt(t) { const o = TV.get(t.id); const h = o && o.tree ? o.tree.h - 6 : 14; const [sx, sy] = proj(t.x, t.y); return [Math.round(sx), Math.round(sy) - h]; }
function drawMarks() {
  const bob = Math.round(Math.sin(realT * 4)) ;
  for (const o of S.orders) {
    if (o.type === 'chop') { const t = S.trees.find(q => q.id === o.id); if (!t || !onScreen(t.x, t.y, 40)) continue; const [x, y] = markAt(t); ctx.drawImage(AXE_MARK, x - 3, y - 10 + bob); }
    else if (o.type === 'release') { const [sx, sy] = proj(FS.POND_SPOT.stand.x, FS.POND_SPOT.stand.y); ctx.drawImage(FLAG, Math.round(sx) + 2, Math.round(sy) - 9 + bob); }
    else if (onScreen(o.x, o.y, 20)) { const [sx, sy] = proj(o.x, o.y); ctx.globalAlpha = 0.55; ctx.drawImage(SAPLING[0], Math.round(sx) - 4, Math.round(sy) - 7); ctx.globalAlpha = 1; ctx.drawImage(FLAG, Math.round(sx) + 2, Math.round(sy) - 9 + bob); }
  }
  if (INPUT.hover) { const h = INPUT.hover; if (h.tree) { const [x, y] = markAt(h.tree); ctx.drawImage(AXE_MARK, x - 3, y - 12 + bob); }
    else if (h.release) { const [sx, sy] = proj(FS.POND_SPOT.stand.x, FS.POND_SPOT.stand.y); ctx.globalAlpha = h.ok ? 0.9 : 0.35; ctx.drawImage(FLAG, Math.round(sx) + 2, Math.round(sy) - 11 + bob); ctx.globalAlpha = 1; }
    else if (h.spot) { const [sx, sy] = proj(h.spot.x, h.spot.y); ctx.globalAlpha = h.ok ? 0.7 : 0.35; ctx.drawImage(SAPLING[0], Math.round(sx) - 4, Math.round(sy) - 7); ctx.globalAlpha = 1;
      if (!h.ok) { ctx.fillStyle = Rf[2]; ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 4, 7, 1); } } }
  for (const r of WD.REGIONS) if (!regionOpen(r.id) && onScreen(r.sign.x, r.sign.y, 30)) { const [sx, sy] = proj(r.sign.x, r.sign.y), x = Math.round(sx), y = Math.round(sy);
    ctx.drawImage(LOCK, x - 3, y - 22 + bob); }
  XP.drawLocks(ctx, proj, onScreen, bob); // v5.5.0
  if (WORKS_ON) { const T = S.t % 1440; PWA.draw(ctx, proj, onScreen, realT, T, dayLight(T), !!(WX && WX.isRaining(S.weather, S.day, S.t)), { on: INPUT.mode === 'sprinkler', pick: INPUT.sprPick, hover: INPUT.mode === 'sprinkler' && INPUT.hover && INPUT.hover.spr }); }
  decorDraw(); // v5.7.0
}
function spritePixels(c) { return c.d32 || (c.d32 = new Uint32Array(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.buffer)); }
function stackPixels(m, a) { const k = stackCanvas(m, a); if (!k.d32) k.d32 = new Uint32Array(k.c.getContext('2d').getImageData(0, 0, k.c.width, k.c.height).data.buffer); return k; }
function blit(dst, dw, dh, src, sw, sh, x0, y0, shiftOf) {
  for (let y = 0; y < sh; y++) { const Y = y0 + y; if (Y < 0 || Y >= dh) continue; const sx0 = x0 + (shiftOf ? shiftOf(y) : 0), so = y * sw, dO = Y * dw;
    for (let x = 0; x < sw; x++) { const p = src[so + x]; if (!(p >>> 24)) continue; const X = sx0 + x; if (X >= 0 && X < dw) dst[dO + X] = p; } }
}
let OBUF = new Uint32Array(0); // one shared scratch buffer for tree outlines
function outlineBuf(d, w, h) { if (OBUF.length < d.length) OBUF = new Uint32Array(d.length); const o = OBUF; o.fill(0, 0, d.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (d[i] >>> 24) continue;
    const n = (y < h - 1 && d[i + w] >>> 24) ? i + w : (x > 0 && d[i - 1] >>> 24) ? i - 1 : (x < w - 1 && d[i + 1] >>> 24) ? i + 1 : (y > 0 && d[i - w] >>> 24) ? i - w : -1;
    if (n >= 0) o[i] = OUTL.get(d[n] | 0xff000000) || INK0; }
  for (let i = 0; i < d.length; i++) if (o[i]) d[i] = o[i];
}
function treeCache(o, poseT) { // trunk stack + leaf clumps placed relative to the tree's whole-pixel origin, cached per pose
  const T = o.tree, items = [], unit = windPose(o.x, o.y, poseT);
  for (const p of T.discs) { const [dx, dz] = discSway(o, p, poseT, unit);
    items.push([p, dx, dz, p.inside ? -1e3 + p.cz * 0.01 : (p.ox * SA + p.oy * CA) * K + p.cz * 0.6]); }
  items.sort((a, b) => a[3] - b[3]); // inside layer first, then back to front and low to high
  const key = AQ + '|' + items.map(i => i[1] + ',' + i[2]).join(';');
  const k = o._ck || (o._ck = {});
  if (k.key !== key) {
    if (!T.R) { T.R = 8; for (const p of T.discs) T.R = Math.max(T.R, Math.hypot(p.ox, p.oy) + p.r + 2); T.R = Math.ceil(T.R) + 6; }
    if (!k.c) { k.c = mk(2 * T.R, Math.ceil(2 * T.R * K) + T.h + 14); k.g = k.c.getContext('2d'); const n = k.c.width * k.c.height;
      k.buf = new Uint32Array(n); k.img = new ImageData(new Uint8ClampedArray(k.buf.buffer), k.c.width, k.c.height); }
    const cw = k.c.width, ch = k.c.height, d = k.buf; k.ox = T.R; k.oy = Math.ceil(T.R * K) + T.h + 8; d.fill(0);
    for (const p of T.parts) { const s = stackPixels(p.m, AQ), bx = k.ox + Math.round(p.ox * CA - p.oy * SA) - s.ox, by = k.oy + Math.round((p.ox * SA + p.oy * CA) * K) - p.z - s.oy;
      blit(d, cw, ch, s.d32, s.c.width, s.c.height, bx, by, null); } // trunks never move
    for (const [p, dx, dz] of items) { const s = clumpSprite(p), px = spritePixels(s.c);
      blit(d, cw, ch, px, s.c.width, s.c.height, k.ox + Math.round(p.ox * CA - p.oy * SA) + dx - s.rx, k.oy + Math.round((p.ox * SA + p.oy * CA) * K) - Math.round(p.cz + dz) - s.ry); }
    outlineBuf(d, cw, ch); k.g.putImageData(k.img, 0, 0); k.key = key; k.d32 = d;
  }
  return k;
}
function treePoseT(o) { return Math.floor(realT * 10 + o.tick) / 10; } // 10 poses a second; trees tick on staggered frames
function treeOnScreen(o) { const [sx, sy] = proj(o.x, o.y), T = o.tree, R = (T.R || 40); return sx > -R && sx < W + R && sy - T.h - R < H && sy + R > 0; }
function drawTree(c, o) {
  if (!treeOnScreen(o)) return;
  const k = treeCache(o, treePoseT(o)), [sx, sy] = proj(o.x, o.y); c.drawImage(k.c, Math.round(sx) - k.ox, Math.round(sy) - k.oy);
}
function lighting(night, T) {
  const lights = [];
  const hz = (x, y, z, r, s = 1) => { if (fogHid(x, y)) return; /* v5.11.0.13: no window glows through the cloud */ const [sx, sy] = proj(x, y); lights.push([sx, sy - z, r, s]); };
  if (T >= 17 * 60 + 30 || T < WAKE + 30) { hz(HOUSE.x - 8.5, HOUSE.y + 10.5, 17, 46); hz(HOUSE.x + 8.5, HOUSE.y + 10.5, 17, 46); hz(HOUSE.x - 13, HOUSE.y, 17, 34); }
  hz(STALL.x, STALL.y, 30, 40, 0.8); hz(BARN_DOOR.x, BARN_DOOR.y, 16, 26, 0.6); hz(WELL.x, WELL.y, 14, 20, 0.5);
  if (!F.home) hz(F.x, F.y, 14, 40);
  if (WORKS_ON) PWA.lights(hz); // v5.6.0: lamps on the wheel's grid, busy workshops
  if (DECOR_ON) DA.lights(hz, T); // v5.7.0
  if (DECOR_ON && partyProps()) for (const l of partyLawnNow().lawn) hz(l.pole.x, l.pole.y, 18, 34, 0.7); // v5.11.0.15: the lawn's lantern poles
  if (YARD_ON) YA.lights(hz, T, HOUSE); // v5.10.3: the door lantern, the curtained windows
  if (HOME_ON) HA.lights(hz, T); // v5.9.0: the new house's windows once someone lives there
  if (INN_ON) IA.lights(hz, T); // v5.10.7: cabin windows and path lamps
  if (TOWN_ON && TA.lights) TA.lights(hz, T); // v5.9.1: the town's street lamps and lit windows
  // v5.9.1: lights snap to whole pixels, off-screen ones are dropped, and each light only touches its own box (a running max per
  // pixel instead of testing every light at every lit pixel); the layer is rebuilt only when the lights or the darkness change
  const vis = [];
  for (const [lx, ly, r, s] of lights) { const x = Math.round(lx), y = Math.round(ly); if (x + r < 0 || x - r >= W || y + r / 1.25 < 0 || y - r / 1.25 >= H) continue; vis.push([x, y, r, s]); }
  const nq = Math.round(night * 256) / 256, key = nq + '|' + vis.map(l => l.join(',')).join(';');
  if (key !== litKey) { litKey = key; litBuild(vis, nq); }
  ctx.drawImage(litC, 0, 0);
}
function litBuild(vis, night) {
  litBuilds++;
  const d = litImg.data, A = night * 0.7, d32 = new Uint32Array(d.buffer), L = litL;
  d32.fill(((Math.round(255 * A) << 24) | (52 << 16) | (18 << 8) | 14) >>> 0); // unlit night tint everywhere, then only the light boxes
  const box = ([lx, ly, r]) => [Math.max(0, Math.floor(lx - r)), Math.min(W - 1, Math.ceil(lx + r)), Math.max(0, Math.floor(ly - r / 1.25)), Math.min(H - 1, Math.ceil(ly + r / 1.25))];
  const boxes = vis.map(box);
  for (const [x0, x1, y0, y1] of boxes) for (let y = y0; y <= y1; y++) L.fill(0, y * W + x0, y * W + x1 + 1);
  vis.forEach(([lx, ly, r, s], i) => { const [x0, x1, y0, y1] = boxes[i], ir = 1 / r;
    for (let y = y0; y <= y1; y++) { const dy = (y - ly) * 1.25, dy2 = dy * dy, row = y * W;
      for (let x = x0; x <= x1; x++) { const dx = x - lx, q2 = dx * dx + dy2; if (q2 >= r * r) continue; const v = (1 - Math.sqrt(q2) * ir) * s; if (v > L[row + x]) L[row + x] = v; } } });
  for (const [x0, x1, y0, y1] of boxes) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = y * W + x, q = Math.min(1, Math.floor(L[p] * 4 + BAYER[(y & 3) * 4 + (x & 3)]) / 3), o = p * 4;
    d[o] = 14 + (255 - 14) * q; d[o + 1] = 18 + (180 - 18) * q; d[o + 2] = 52 + (90 - 52) * q; d[o + 3] = 255 * (A * (1 - q) + 0.18 * night * q);
  }
  lctx.putImageData(litImg, 0, 0);
}
function updateFx(dt) {
  if (window.PF_FX) PF_FX.update(dt);
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.kind === 'smoke' || p.kind === 'heart') continue; if (!p.text && p.kind !== 'icon') { p.vz -= 40 * dt; if (p.z < 0) { p.z = 0; p.vx *= 0.5; p.vy *= 0.5; p.vz = 0; } } else p.vz *= 0.97; }
  windT += dt;
  for (const o of [...props, ...TV.values()]) if (o.tree) { const T = o.tree, k = 2 * Math.PI / T.period, g = gustAt(o.x, o.y);
    o.leanV += (k * k * (T.push * g - o.lean) - 2 * T.damp * k * o.leanV) * dt; o.lean += o.leanV * dt;
    if (T.kind === 'oak' && Math.random() < dt * g * 0.6 && onScreen(o.x, o.y, 0)) leaves.push({ x: o.x + VR(-10, 10), y: o.y + VR(-10, 10), z: T.h - 14, ph: VR(0, 6), c: vpick([G[4], Ac[1], G[3]]) }); }
  for (let i = leaves.length - 1; i >= 0; i--) { const l = leaves[i]; l.z -= 9 * dt; l.ph += dt * 3; l.x += dt * (2 + 10 * gustAt(l.x, l.y)); if (l.z <= 0) leaves.splice(i, 1); }
  if (!fireflies.length) for (let i = 0; i < 18; i++) fireflies.push({ x: VR(10, 80), y: VR(80, 122), z: VR(2, 9), ph: VR(0, 6) });
  for (const f of fireflies) { f.x += Math.sin(realT * 0.7 + f.ph) * dt * 3; f.y += Math.cos(realT * 0.5 + f.ph) * dt * 2; }
  if (F.home && Math.random() < dt * 2.5) particles.push({ ...houseSmoke(S.eff.house || 0), vx: 2, vy: -1, vz: 5, c: vpick([St[3], Ac[0]]), life: 2.4, kind: 'smoke' });
  if (HOME_ON && HA.smoke) for (const c of HA.smoke()) if (Math.random() < dt * 1.5) particles.push({ x: c.x, y: c.y, z: c.z, vx: 2, vy: -1, vz: 5, c: vpick([St[3], Ac[0]]), life: 2.2, kind: 'smoke' }); // v5.9.x: the new house's chimney
  if (INN_ON && IA.smoke) for (const c of IA.smoke()) if (Math.random() < dt * 1.5) particles.push({ x: c.x, y: c.y, z: c.z, vx: 1, vy: -1, vz: 5, c: vpick([St[3], Ac[0]]), life: 2.0, kind: 'smoke' });
  if (TOWN_ON && TA && TA.smoke) for (const c of TA.smoke()) { // v5.10.5: the workshop and the forge
    if (Math.random() < dt * 1.8) particles.push({ x: c.x, y: c.y, z: c.z, vx: 2, vy: -1, vz: 5, c: vpick([St[3], Ac[0], c.forge ? Ac[2] : St[3]]), life: 2.3, kind: 'smoke' });
    if (c.forge && Math.random() < dt * 3) particles.push({ x: SM.LOT.x, y: SM.LOT.y + 3, z: 3, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 2, vz: 6 + Math.random() * 4, c: vpick([Ac[2], Ac[1], Rf[2]]), life: 0.8, kind: 'spark' }); }
}
let hudPrices = '';
function hud() {
  const T = S.t % 1440, hh = T / 60;
  const tod = hh < 5 ? '深夜' : hh < 8 ? '清晨' : hh < 11 ? '上午' : hh < 13 ? '中午' : hh < 17 ? '下午' : hh < 19.5 ? '傍晚' : '夜晚';
  document.getElementById('day').textContent = `第 ${S.day} 天 · ${tod}`;
  document.getElementById('clock').textContent = fmtT(S.t);
  document.getElementById('act').textContent = '当前：' + S.label;
  document.getElementById('coins').textContent = S.coins;
  const woodEl = document.getElementById('wood'); if (woodEl) woodEl.textContent = FARMER.wood;
  document.getElementById('seeds').textContent = seedCount(S.store);
  const arrow = m => m > 1.02 ? '↑' : m < 0.98 ? '↓' : '';
  const pr = S.eff.crops.map(k => `${SIM.CROPS[k].name} ${SIM.priceOf(k, S.prices)}${arrow(S.prices[k])}`).concat(AN.PRODUCT_IDS.filter(k => S.animals.some(a => AN.KINDS[a.kind].product === k)).map(k => `${AN.PRODUCTS[k].name} ${priceOfAny(k)}${arrow(S.prices[k])}`)).join(' · ');
  if (hudPrices !== pr) { hudPrices = pr; document.getElementById('prices').textContent = '今日行情：' + pr; }
  const love = loveStatus(), loveVal = document.getElementById('loveVal'), loveFill = document.getElementById('loveFill'), loveHud = document.getElementById('loveHud');
  if (loveVal) loveVal.textContent = love.label;
  if (document.getElementById('loveLab')) document.getElementById('loveLab').textContent = love.title;
  if (loveFill) loveFill.style.width = (love.moved ? 72 : Math.round(72 * love.love / love.max)) + 'px';
  if (loveHud) { loveHud.title = [love.todayText, love.hint].filter(Boolean).join(' · '); loveHud.classList.toggle('dim', !love.met && !love.moved); }
  // v5.11.0.10: the open heart tip belongs to ui.js (drawLoveTip: hint + each child's classmates + 镇上的人 + 民宿留言本). Rewriting it
  // here every frame with only the hint wiped the closeness rows a frame after ui.js drew them, so the hearts never stayed on screen.
  document.getElementById('log').innerHTML = S.log.map((s, i) => {
    if (i === 0 && lastCatch && lastCatch.line === s && lastCatch.url) return `<div><img class="log-bug" alt="" src="${lastCatch.url}">${s}</div>`;
    return `<div>${s}</div>`;
  }).join('');
  const box = document.getElementById('catches');
  if (box) {
    const today = S.catches.filter(c => c.day === S.day), recent = S.catches.slice(0, 8);
    if (!recent.length) box.hidden = true;
    else { box.hidden = false; box.innerHTML = `<div class="h">今日钓到 ${today.length} 条` + (S.fishGold ? ` · 累计卖出 ${S.fishGold} 金` : '') + `</div>` +
      recent.map(c => {
        const ICN = window.PFCodexIcons, BOOK = window.PFCodex;
        const url = ICN && ICN.fishURL && ICN.fishURL(c.id);
        const tier = BOOK && BOOK.rarityOf && BOOK.rarityOf({ group: 'fish', id: c.id });
        const ico = url ? `<i class="ico fish" style="width:24px;height:16px;background-image:url(${url});background-size:24px 16px"></i>` : '';
        const name = tier ? `<span class="r-${tier}">${c.name}</span>` : c.name;
        return `<div>${c.day === S.day ? '今' : '第' + c.day + '天'} · ${ico}${name} ${c.gold} 金${c.water === 'sea' ? ' · 海' : ''}</div>`;
      }).join(''); }
  }
  if (window.PFEventsUI && PFEventsUI.draw) PFEventsUI.draw();
}

// ---------- camera and pointer (v4.3) ----------
// Drag (or one finger) pans the big map; Shift+drag or right-drag turns it; W A S D pan, Q E / ← → turn, R goes home.
// The pan is in world units; the screen offset is still rounded once per frame (setCam), so panning moves the whole picture
// by whole pixels and nothing shimmers. In chop / plant mode a click marks a tree or a spot instead.
let keyRot = 0, drag = null;
const ROT_KEYS = { q: -1, Q: -1, ArrowLeft: -1, e: 1, E: 1, ArrowRight: 1 };
const PAN_KEYS = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], W: [0, -1], A: [-1, 0], S: [0, 1], D: [1, 0] };
const keyPan = new Set();
const typing = e => e.target && /^(TEXTAREA|INPUT|BUTTON)$/.test(e.target.tagName); // the save menu has text boxes
const INPUT = { mode: null, kind: 'apple', hover: null };
function clampCam() { cam.x = clamp(cam.x, WORLD.x0 + 70, WORLD.x1 - 70); cam.y = clamp(cam.y, WORLD.y0 + 40, WORLD.y1 - 30); }
function panScreen(dx, dy) { // move the picture by (dx, dy) framebuffer pixels
  const rx = dx / RS, ry = dy / (K * RS); cam.x -= rx * CA + ry * SA; cam.y -= -rx * SA + ry * CA; clampCam(); }
function panTo(x, y) { cam.x = x; cam.y = y; clampCam(); }
function toWorld(clientX, clientY) { const r = cv.getBoundingClientRect(), px = (clientX - r.left) * W / r.width, py = (clientY - r.top) * H / r.height;
  const rx = (px - CX) / RS, ry = (py - CY) / (K * RS); return { x: rx * CA + ry * SA, y: -rx * SA + ry * CA, px, py }; }
function treeAtScreen(px, py) { let best = null, bd = 1e9;
  for (const t of S.trees) { if (t.stage !== 'tree' || t.kind !== 'wild') continue; const [sx, sy] = proj(t.x, t.y), o = TV.get(t.id), h = o && o.tree ? o.tree.h : 60;
    if (Math.abs(px - sx) > 16 || py > sy + 6 || py < sy - h) continue; const d = Math.abs(px - sx) + Math.abs(py - (sy - h * 0.45)) * 0.5; if (d < bd) { bd = d; best = t; } }
  return best; }
function plantSpot(x, y) { // where a sapling may go: open ground in the farm or a bought region, clear of buildings, paths, fields and trees
  const a = WD.areaAt(x, y);
  if (!(a === 'home' || S.eff.regions.includes(a))) return { ok: false, why: '这里还没解锁' };
  if (groundAt(x, y)[1] !== 'grass') return { ok: false, why: '只能种在草地上' };
  if (tiles.some(t => (t.open || !PL.isPlotId(t.f)) && Math.abs(t.x - x) < 9 && Math.abs(t.y - y) < 9)) return { ok: false, why: '不能种在田里' };
  if (yard.some(c => Math.hypot(c.x - x, c.y - y) < 7)) return { ok: false, why: '这里有杂物，等农夫收拾完再种' };
  if ([[HOUSE, 28], [BARN, 28], [STALL, 22], [WELL, 12]].some(([b, d]) => Math.hypot(b.x - x, b.y - y) < d)) return { ok: false, why: '离房子太近' };
  if (AN.PEN_IDS.some(k => (!PENS[k].second || S.eff[k]) && Math.hypot(PENS[k].bld.x - x, PENS[k].bld.y - y) < 20 || Math.hypot(PENS[k].trough.x - x, PENS[k].trough.y - y) < 10)) return { ok: false, why: '这里留给动物的棚子' }; // kept free even before it is built
  if (props.some(p => !p.region && Math.hypot(p.x - x, p.y - y) < (p.tree ? 11 : 8)) || S.trees.some(t => Math.hypot(t.x - x, t.y - y) < 11) ||
      S.orders.some(o => o.type === 'plant' && Math.hypot(o.x - x, o.y - y) < 11)) return { ok: false, why: '离别的树太近' };
  return { ok: true };
}
// v5.9.1: is there any grass left for a sapling? Scanned at most once per day or when trees / orders / regions change; stops at the first spot
const PLANT_FULL = '没有能种树的空草地了：树之间要隔开一点，田里、路上、房子和棚子旁边都不能种。砍掉几棵野树或买下新的地块就有地方了';
let plantRoomC = { key: '', ok: true };
function plantRoom() {
  const key = [S.day, S.trees.length, S.orders.length, S.eff.regions.length, tiles.length].join(',');
  if (key === plantRoomC.key) return plantRoomC.ok;
  let ok = false;
  for (let y = WORLD.y0 + 6; y < WORLD.y1 && !ok; y += 6) for (let x = WORLD.x0 + 6; x < WORLD.x1; x += 6) if (plantSpot(x, y).ok) { ok = true; break; }
  plantRoomC = { key, ok }; return ok;
}
// v5.0 hook for logs and stats (e.g. playlog.js): window 'pf:farm' events, detail = { type, who, day, t, ... }.
// type: 'income' (gold, items), 'purchase' (item, gold, wood), 'task' (kind, done by who), 'family' (event). who: 'farmer' | 'partner' | 'kid0' | 'kid1'
// ---- v5.11.0.11 相册: the first time a story moment happens, a small polaroid of the scene (album.js rules, album-ui.js panel) ----
// Only metadata goes in the save (S.album); the picture is cut from the frame that was just drawn (or one extra render with the
// camera on the spot, then one more to put the view back, both inside the same animation frame, so nothing flickers), and kept
// in its own localStorage key. A photo whose picture is missing is re-staged from the metadata when the album asks for it.
const albumQ = []; let albumBusy = 0, albumMs = 0;
const ALBUM_MS = { open: 'open', animal: 'animal', fish: 'fish', met: 'met', moved: 'moved', manor: 'manor' };
const ALBUM_ACH = { kidwork: 'kidwork', school: 'school', firstrain: 'rain', truecatch: 'rarefish', firstbug: 'bug', firstpark: 'park' };
const ALBUM_WAIT = { moved: 90, kidwork: 150, open: 0 }; // game minutes to wait so the people are out of the door
const albumStore = () => { try { return (window.PFPlatform && typeof PFPlatform.albumStore === 'function' && PFPlatform.albumStore()) || window.localStorage; } catch (e) { return null; } }; // xhs 1.3.0: the container Storage, not localStorage
const albumFarm = () => S.createdAt || 0;
function albumPlace(at) { // a world spot for a moment's place (old saves, re-staging, moments with nobody out)
  const P2 = (x, y) => ({ x, y });
  try {
    if (at === 'home') return P2(HOUSE.x + 4, HOUSE.y + 24); if (at === 'door') return P2(DOOR.x + 6, DOOR.y + 8);
    if (at === 'house') return P2(HOUSE.x + 2, HOUSE.y + 14); if (at === 'porch') return P2(DOOR.x + 22, DOOR.y + 14);
    if (at === 'barn') return P2(BARN_DOOR.x, BARN_DOOR.y + 8); if (at === 'pond') return P2(POND.x + 6, POND.y + 4);
    if (at === 'stall') return P2(STALL_SPOT.x, STALL_SPOT.y); if (at === 'meadow' || at === 'park') return P2(BENCH_SPOT.x, BENCH_SPOT.y - 6);
    if (at === 'field') { const t = tiles.find(q => q.open && (q.crop || q.tilled)) || tiles.find(q => q.open); return t ? P2(t.x, t.y) : P2(HOME_CAM.x, HOME_CAM.y); }
    if (at === 'party') { const a = partyArea(); return a ? P2(a.x, a.y + 6) : P2(DOOR.x + 6, DOOR.y + 8); }
    if (at === 'gate' && TN) return P2(TN.GATE.x, TN.GATE.y + 6);
    if (at === 'school' && TN) return townOpen() ? P2(TN.SCHOOL_DOOR.x, TN.SCHOOL_DOOR.y + 8) : P2(TN.GATE.x - 10, TN.GATE.y + 6);
    if (at === 'plaza' && TN) return P2(TN.PLAZA.x, TN.PLAZA.y);
    if (at === 'track' && SC) return P2(SC.WATCH.x, SC.WATCH.y - 12);
    if (at === 'feast' && FV) return P2(FV.TABLE.x, FV.TABLE.y + 4);
    // v5.11.0.9 bigger diner / taller kid cottages: aim a little higher so the roofs fit in the 160×110 frame
    if (at === 'inn') { const L = innLay(); if (L && L.diner) return P2(L.diner.x, L.diner.y + 4); if (TN && TN.AGRI) return P2((TN.AGRI[0] + TN.AGRI[2]) / 2, 70); }
    if (at === 'wedding') { const s = weddingSpot(); if (s) return P2(s.x, s.y + 4); return albumPlace('party'); }
    if (at === 'newhouse' && HM) { const h = S.home.houses.find(q => q.built && q.kid) || S.home.houses.find(q => q.built); if (h) { const d = HM.layout(h).door; return P2(d.x, d.y - 2); } }
  } catch (e) {}
  return P2(DOOR.x + 6, DOOR.y + 8);
}
const albumId = a => (a === FARMER ? 'farmer' : a.id);
const albumOut = a => a && !a.home && !a.away && !a.sleeping;
// a live moment: the metadata now, the picture in a frame or two (o: { wait: game minutes, follow: actor id to centre on })
function albumSnap(id, x, y, o) {
  if (!ALB || !S.album || !ALB.BY[id]) return null; o = o || {};
  const old = ALB.get(S.album, id); if (old && old.t >= 0) return null; // taken already
  if (old) ALB.remove(S.album, id); // a re-staged (补拍) frame from the backfill: the real moment takes its place
  if (x == null) { const p = albumPlace(ALB.BY[id].at); x = p.x; y = p.y; }
  const e = ALB.add(S.album, { id, d: S.day, t: Math.floor(S.t % 1440), x, y, w: [] }); if (!e) return null;
  const at = Math.floor(S.t + (o.wait == null ? (ALBUM_WAIT[id] || 0) : o.wait));
  e.q = { at, f: o.follow || '', re: o.re ? 1 : 0 }; // saved with the album, so a reload before the photo is taken keeps it pending
  albumQ.push({ e, at, follow: o.follow || null, re: !!o.re });
  if (DY && S.diary) DY.note(S.diary, S.day, 'photo:' + id);
  return e;
}
// at the end of render(): take one due photo
function albumFlush() {
  const i = albumQ.findIndex(q => S.t >= q.at); if (i < 0) return;
  // v5.11.0.6 fog: while a district's cloud is rolling back (镇门打开 is due the moment the gate opens) wait the reveal (v5.11.0.13: 1.7 s) out, so the
  // photo shows it open and its cost never lands on a reveal frame; a lock that changed this frame starts its fade now (not up to 0.25 s later)
  if (FOG.on) { fogUpdate(true); if (FOG.fading) return; } const q = albumQ.splice(i, 1)[0], e = q.e;
  if (ALB.get(S.album, e.id) !== e) return; // a different farm was loaded meanwhile
  delete e.q;
  const f = q.follow && (q.follow === 'farmer' ? FARMER : S.members.find(m => m.id === q.follow));
  if (albumOut(f)) { e.x = Math.round(f.x); e.y = Math.round(f.y); } else if (q.re) { const p = albumPlace(ALB.BY[e.id].at); e.x = Math.round(p.x); e.y = Math.round(p.y); }
  e.t = Math.floor(S.t % 1440); e.d = S.day;
  e.w = actors().filter(a => albumOut(a) && Math.abs(a.x - e.x) < 44 && Math.abs(a.y - e.y) < 30).map(albumId).slice(0, 4);
  const t0 = performance.now(), url = albumShot(e.x, e.y, null); albumMs = performance.now() - t0;
  if (!url) return; ALB.putThumb(albumStore(), albumFarm(), e.id, url, 0);
  const c = ALB.caption(e, albumNames());
  window.dispatchEvent(new CustomEvent('pf:album', { detail: { id: e.id, title: c.title, line: c.line, url, ms: albumMs } }));
}
// the PW×PH picture around world (x, y). stage: { who, t } puts those people on the spot at that time of day (re-staged photos)
function albumShot(x, y, stage) {
  if (!ALB) return null; const PW = ALB.PW, PH = ALB.PH, c = mkc(PW, PH), g = c.getContext('2d');
  const box = () => { setCam(); const [sx, sy] = proj(x, y); return [Math.round(sx - PW / 2), Math.round(sy - PH * 0.6)]; };
  let [x0, y0] = box();
  // v5.11.0.13: a photo never shows the cloud bank (a still-locked district beside the spot): rendered with the cloud left off;
  // what stands under it is still not drawn, so the picture gives nothing away either
  const veil = FOG.on && !FOG.empty, veil0 = FOG.veil;
  if (!stage && !veil && x0 >= 0 && y0 >= 0 && x0 + PW <= W && y0 + PH <= H) g.drawImage(cv, x0, y0, PW, PH, 0, 0, PW, PH); // already on screen: just cut it out
  else {
    const keep = { x: cam.x, y: cam.y }, T0 = S.t, saved = [];
    if (stage) { const who = (stage.who || []).map(id => (id === 'farmer' ? FARMER : S.members.find(m => m.id === id))).filter(Boolean);
      who.forEach((a, i) => { saved.push([a, { x: a.x, y: a.y, home: a.home, away: a.away, sleeping: a.sleeping, fx: a.fx, fy: a.fy, moving: a.moving }]);
        Object.assign(a, { x: x + (i - (who.length - 1) / 2) * 9, y: y + 2 + (i % 2), home: false, away: null, sleeping: false, fx: 0, fy: 1, moving: false }); });
      if (stage.t != null) S.t = S.t - (S.t % 1440) + stage.t; }
    albumBusy = 1; const w0 = W, h0 = H, small = W < PW || H < PH; // v5.11.0.5.2: the framebuffer follows the window (and the zoom); a tiny one grows for this frame
    try { if (small) sizeBuffers(Math.max(W, PW), Math.max(H, PH)); cam.x = x; cam.y = y; if (veil) FOG.veil = true; render(); FOG.veil = veil0; [x0, y0] = box();
      x0 = clamp(x0, 0, Math.max(0, W - PW)); y0 = clamp(y0, 0, Math.max(0, H - PH)); g.drawImage(cv, x0, y0, PW, PH, 0, 0, PW, PH); }
    finally { FOG.veil = veil0; S.t = T0; for (const [a, v] of saved) Object.assign(a, v); cam.x = keep.x; cam.y = keep.y; if (small) sizeBuffers(w0, h0); render(); albumBusy = 0; }
  }
  try { return c.toDataURL('image/png'); } catch (err) { return null; }
}
const ALBUM_STAGE_T = { open: 6 * 60 + 40, moved: 9 * 60 + 30, born0: 17 * 60 + 30, born1: 8 * 60, kidwork: 10 * 60, manor: 15 * 60 + 30, party: 18 * 60 + 40, fest: 18 * 60 + 30, wedding: 18 * 60 + 30, rain: 9 * 60, met: 11 * 60, market: 11 * 60 + 30 };
function albumRestage(id) { // the album asked for a photo whose picture this device does not have
  const e = ALB && S.album && ALB.get(S.album, id); if (!e) return null;
  const m = ALB.BY[id], who = (e.w.length ? e.w : m.who).filter(w => w === 'farmer' || S.members.some(q => q.id === w));
  const url = albumShot(e.x, e.y, { who, t: e.t >= 0 ? e.t : (ALBUM_STAGE_T[id] || 10 * 60 + 30) }); if (url) ALB.putThumb(albumStore(), albumFarm(), id, url, 1);
  return url;
}
function albumNames() {
  const k = S.family.kids, w = HM && S.home && S.home.wed ? HM.KID_IDS.map(id => [id, S.home.wed[id]]).find(x => x[1]) : null;
  return { kid0: k[0] && k[0].name, kid1: k[1] && k[1].name, kid: w ? kidName(w[0]) : '', mate: w && HM.mateName ? HM.mateName(w[1].mate) : '' };
}
// what already happened, from the save (old saves before the album, and moments missed while away)
function albumFacts() {
  const m = l => Object.fromEntries((l || []).map(u => [u.id, u.day | 0])), H = S.town && S.town.hall, hm = S.home || {};
  const weds = HM && hm.wed ? HM.KID_IDS.map(k => hm.wed[k]).filter(Boolean) : [], moved = weds.filter(w => w.moved > 0);
  const giants = (BOOK.GIANT_CROPS || []).map(k => BOOK.entryOf(S.codex, BOOK.keyGiant(k))).filter(Boolean);
  const M = H && H.market; // what the family actually sold at the market (days, last day), not the square being built
  return { ms: m(S.milestones), ach: m(S.achievements), kids: S.family.kids, met: S.family.met | 0, moved: S.family.moved | 0, mate: (S.town && S.town.mate && S.town.mate.last) | 0,
    town: townOpen(), marketDays: (M && M.days) | 0, marketLast: (M && M.last) | 0, sports: (H && H.school && H.school.last) | 0, fest: (H && H.festival && H.festival.last) | 0,
    inn: !!(S.inn && ((S.inn.earn && S.inn.earn.rooms > 0) || (S.inn.guests || []).length)), wed: weds.length ? Math.min(...weds.map(w => w.day | 0)) : 0,
    movedIn: moved.length ? Math.min(...moved.map(w => w.moved)) : 0, giant: giants.length ? Math.min(...giants.map(e => e.firstDay | 0)) : null };
}
function albumBackfill() { // silent: re-staged frames for what already happened (no picture yet: the album re-stages it when opened)
  if (!ALB || !S.album) return 0; let n = 0;
  for (const f of ALB.due(albumFacts())) { if (ALB.has(S.album, f.id) || (f.d > 0 && f.d >= S.day)) continue; const m = ALB.BY[f.id], p = albumPlace(m.at); // f.d today: the live photo may still come
    if (ALB.add(S.album, { id: f.id, d: f.d, t: -1, x: p.x, y: p.y, w: m.who })) n++; }
  return n;
}
function albumProgress(a, m) { // noteProgress' fresh achievements / milestones that are album moments: the one who did it is in the picture
  if (!ALB || !S.album) return;
  const go = id => { const out = F && albumOut(F) ? F : null, e = albumSnap(id, out ? Math.round(out.x) : null, out ? Math.round(out.y) : null, { follow: id === 'moved' ? 'partner' : id === 'kidwork' ? 'kid0' : out ? albumId(out) : null }); return e; };
  for (const u of m) if (ALBUM_MS[u.id]) go(ALBUM_MS[u.id]);
  for (const u of a) if (ALBUM_ACH[u.id]) go(ALBUM_ACH[u.id]);
}
function albumTick() { if (albumQ.length && groundReady && SPR.ok) try { albumFlush(); } catch (e) { albumBusy = 0; } }
function albumView() { // -> what the album panel shows
  if (!ALB || !S.album) return null; const v = ALB.view(S.album, albumNames()), st = albumStore(), farm = albumFarm();
  for (const s of v.shots) { const t = ALB.thumb(st, farm, s.id); s.url = t ? t.url : null; s.restaged = s.restaged || !!(t && t.restaged); }
  return v;
}
// v5.10.13: the diary counts what the one doing the task (F) did today
function diary(act, id, n) { if (DY && S.diary) DY.add(S.diary, S.day, act, id, n, F === FARMER ? 'farmer' : F.id); }
function diaryNote(code) { if (DY && S.diary) DY.note(S.diary, S.day, code); }
function diaryEmit(type, d) {
  if (!DY || !S.diary || !d) return;
  if (type === 'purchase') { if (d.gold > 0) DY.add(S.diary, S.day, 'out', null, d.gold); if (d.item && d.item !== 'seeds' && d.item !== 'hay' && d.who) DY.bought(S.diary, S.day, String(d.item)); }
  else if (type === 'family' && d.event === 'born') { const k = S.family.kids[S.family.kids.length - 1]; diaryNote('born:' + ((k && k.name) || '')); }
  else if (type === 'family' && d.event === 'moved') diaryNote('moved');
}
function emit(type, d) { try { diaryEmit(type, d); } catch (e) {} if (window.PF_NO_EVENTS) return; window.dispatchEvent(new CustomEvent('pf:farm', { detail: Object.assign({ type, who: F === FARMER ? 'farmer' : F.id, day: S.day, t: Math.floor(S.t % 1440) }, d) })); }
const say = text => window.dispatchEvent(new CustomEvent('pf:say', { detail: text }));
function orderChop(id) {
  const t = S.trees.find(q => q.id === id); if (!t) return { ok: false };
  const i = S.orders.findIndex(o => o.type === 'chop' && o.id === id); if (i >= 0) { S.orders.splice(i, 1); return { ok: true, removed: true }; }
  if (!S.eff.axe) return { ok: false, why: '先在商店买斧头' };
  if (!WD.choppable(t, S.eff.regions)) return { ok: false, why: t.kind !== 'wild' ? '果树不砍' : t.stage !== 'tree' ? '这棵还没长大' : '这片区域还没买下' };
  if (S.orders.length >= WD.MAX_ORDERS) return { ok: false, why: '指令太多了，先等农夫做完一些' };
  S.orders.push({ type: 'chop', id }); noteLog('event', { type: 'chop', id, day: S.day, t: S.t }); return { ok: true };
}

function orderRelease(kind) {
  if (!FS.pondOk(kind)) return { ok: false, why: '海鱼不能放进淡水池塘' };
  if (S.pondFish.length >= FS.POND_CAP) return { ok: false, why: '池塘已经养满了' };
  if (!ornamentHeld(kind) || !takeOrnament(kind)) return { ok: false, why: '没有可以放养的' + ((FS.ORN_BY[kind] && FS.ORN_BY[kind].name) || kind) };
  const f = stockPond(kind); if (!f) return { ok: false, why: '池塘已经养满了' };
  S.orders = S.orders.filter(o => !(o.type === 'release' && o.kind === kind));
  noteProgress({ pondCount: S.pondFish.length }); return { ok: true };
}
function orderPlant(kind, x, y) {
  if (!WD.FRUIT[kind]) return { ok: false };
  const sp = plantSpot(x, y); if (!sp.ok) return plantRoom() ? sp : { ok: false, why: PLANT_FULL }; // v5.9.1
  const want = S.orders.filter(o => o.type === 'plant' && o.kind === kind).length;
  if (want >= FARMER.saplings[kind]) return { ok: false, why: `${WD.FRUIT[kind].name}树苗不够（有 ${FARMER.saplings[kind]} 棵）` };
  if (S.orders.length >= WD.MAX_ORDERS) return { ok: false, why: '指令太多了，先等农夫做完一些' };
  S.orders.push({ type: 'plant', kind, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }); noteLog('event', { type: 'plant', kind, x, y, day: S.day, t: S.t }); return { ok: true };
}
function setMode(mode, kind) { INPUT.mode = mode || null; INPUT.sprPick = null; INPUT.mvPick = null; if (kind) INPUT.kind = kind; INPUT.hover = null; cv.style.cursor = mode ? 'crosshair' : '';
  window.dispatchEvent(new CustomEvent('pf:mode', { detail: { mode: INPUT.mode, kind: INPUT.kind } })); }
function hoverAt(e) {
  if (FOG.on && fogHover(e)) { INPUT.hover = null; return; } // v5.11.0.13: over the cloud only its hint, no tool marker
  if (!INPUT.mode) { INPUT.hover = null; return; }
  if (cv.title) cv.title = '';
  const w = toWorld(e.clientX, e.clientY);
  if (INPUT.mode === 'chop') { const t = treeAtScreen(w.px, w.py); INPUT.hover = t ? { tree: t } : null; }
  else if (INPUT.mode === 'release') INPUT.hover = { release: 1, ok: inHomePond(w.x, w.y) };
  else if (INPUT.mode === 'decor' || INPUT.mode === 'move') INPUT.hover = decorHover(w); // v5.7.0
  else if (INPUT.mode === 'sprinkler') INPUT.hover = INPUT.sprPick != null && INPUT.sprPick >= 0 ? { spr: { x: w.x, y: w.y, ok: sprinklerSpot(w.x, w.y, INPUT.sprPick).ok } } : null;
  else INPUT.hover = { spot: w, ok: plantSpot(w.x, w.y).ok };
}
function clickAt(e) {
  const w = toWorld(e.clientX, e.clientY); let r = null;
  if (fogTap(w)) return { ok: false, fog: true }; // v5.11.0.13: nothing under the cloud can be picked, planted or moved
  if (INPUT.mode === 'chop') { const t = treeAtScreen(w.px, w.py); r = t ? orderChop(t.id) : { ok: false, why: '点一棵野树：家门口或已买区域里的都行（地图边上的森林是风景，不能砍）' }; if (r.ok) say(r.removed ? '取消了砍树' : '标记了要砍的树'); }
  else if (INPUT.mode === 'plant') { r = orderPlant(INPUT.kind, w.x, w.y); if (r.ok) say(`标记了种${WD.FRUIT[INPUT.kind].name}树苗的位置`); }
  else if (INPUT.mode === 'release') { r = inHomePond(w.x, w.y) ? orderRelease(INPUT.kind) : { ok: false, why: '点家门口的池塘，把观赏鱼放进去养着（海鱼不能放进淡水）' }; if (r.ok) say('标记了要放进池塘的' + ((FS.ORN_BY[INPUT.kind] && FS.ORN_BY[INPUT.kind].name) || '')); }
  else if (INPUT.mode === 'sprinkler') r = sprinklerClick(w); // v5.6.0
  else if (INPUT.mode === 'decor' || INPUT.mode === 'move') r = decorClick(w); // v5.7.0
  if (r && !r.ok && r.why) say(r.why);
  if (r && r.ok) saveNow();
  return r;
}
// v5.11.0.2 hooks for a touch shell (platforms/xhs touch.js): aim the current tool at a screen point (the crosshair) and commit there.
// The mouse path above is unchanged: pointermove → hoverAt, a click → clickAt. TOUCH.slop: the tap / drag threshold in CSS px (5 = the web's).
const TOUCH = { slop: 5, pickCss: 0, onTap: null }; // onTap(e, mode) → true: the shell handled the tap (e.g. pans that spot under its crosshair)
function aimAt(x, y) { // → { mode, ok (null: nothing to say yet), marked (砍树: already marked), pick (挪东西: the picked thing), what (挪东西: the thing under the point) }
  const e = { clientX: x, clientY: y }; hoverAt(e); const h = INPUT.hover, m = INPUT.mode, out = { mode: m, ok: null, marked: false, pick: INPUT.mvPick || null, what: null };
  if (!m) return out; const w = toWorld(x, y);
  if (m === 'chop') { out.ok = !!(h && h.tree); out.marked = !!(h && h.tree && S.orders.some(o => o.type === 'chop' && o.id === h.tree.id)); }
  else if (m === 'move' && !INPUT.mvPick) { const t = movableAt(w.x, w.y); out.what = t; out.ok = !!t; }
  else if (h) out.ok = h.dec ? !!h.dec.ok : h.spr ? !!h.spr.ok : 'ok' in h ? !!h.ok : null;
  return out; }
function commitAt(x, y) { // the same as a click at (x, y) in the current tool; → { r (null: a pick / unpick step), mode, pick }
  const r = clickAt({ clientX: x, clientY: y }); return { r: r || null, mode: INPUT.mode, pick: INPUT.mvPick || null }; }
function canStore(m) { return !!(m && m.what === 'decor' && DC.CATALOG[m.id] && m.id !== 'party'); }
function storeThing(m) { // 收回: a family member carries a placed decoration back to the storehouse; it stays there (S.decor.kept) until it is placed again by hand
  if (!canStore(m)) return { ok: false, why: m && m.what === 'decor' ? '派对区不能收回' : '只有装饰能收回仓库' };
  if (!S.decor.placed.some(p => p.u === m.ref)) return { ok: false, why: '找不到这件装饰了' };
  S.decor.orders.filter(q => q.what === 'decor' && q.ref === m.ref).forEach(dropOrder);
  const o = orderThing('store', 'decor', m.ref, m.id, BARN_DOOR.x, BARN_DOOR.y, true); if (!o.ok) return o;
  if (INPUT.mvPick && INPUT.mvPick.ref === m.ref) INPUT.mvPick = null; say(`标记好了，家人会把${DC.CATALOG[m.id].name}收回仓库`); saveNow(); return { ok: true }; }
addEventListener('keydown', e => { if (typing(e)) return; if (ROT_KEYS[e.key]) { keyRot = ROT_KEYS[e.key]; e.preventDefault(); }
  if (PAN_KEYS[e.key]) keyPan.add(e.key.toLowerCase());
  if (e.key === 'r' || e.key === 'R') { cam.ta = DEFAULT_A; panTo(HOME_CAM.x, HOME_CAM.y); }
  if (e.key === 'Escape' && INPUT.mode) setMode(null); });
addEventListener('keyup', e => { if (ROT_KEYS[e.key] === keyRot) keyRot = 0; if (PAN_KEYS[e.key]) keyPan.delete(e.key.toLowerCase()); });
addEventListener('blur', () => { keyPan.clear(); keyRot = 0; });
cv.style.touchAction = 'none';
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, rot: e.button === 2 || e.shiftKey, moved: false }; cv.setPointerCapture(e.pointerId); });
function cancelDrag() { drag = null; document.body.classList.remove('grab'); }
cv.addEventListener('pointermove', e => {
  if (window.PFPlatform && PFPlatform.gestureLock) { if (drag) cancelDrag(); return; }
  hoverAt(e); if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > TOUCH.slop) { drag.moved = true; document.body.classList.add('grab'); }
  if (drag.moved) { const r = cv.getBoundingClientRect(), k = W / r.width;
    if (drag.rot) cam.ta += (e.clientX - drag.x) * 0.008; else panScreen((e.clientX - drag.x) * k, (e.clientY - drag.y) * k); }
  drag.x = e.clientX; drag.y = e.clientY; });
function takeDoorGift() {
  const g = S.doorGift; if (!g) return;
  if (g.kind === 'flower') { if (FARMER.crops.length >= BASK()) { say('篮子满了，花还放在门口'); return; } FARMER.crops.push('flower'); log('捡起门口的野花'); }
  else log('把门口的树枝收起来了');
  S.doorGift = null;
}
const endDrag = e => { if (drag && !drag.moved && e.type === 'pointerup' && e.button === 0) { if (TOUCH.onTap && TOUCH.onTap(e, INPUT.mode)) { /* v5.11.0.2: the touch shell took this tap */ } else if (INPUT.mode) clickAt(e); else { const w = toWorld(e.clientX, e.clientY), p = fogZone(w.x, w.y) ? null : petAtScreen(w.px, w.py); if (fogTap(w)) { /* v5.11.0.13: a tap on the cloud only says how it opens */ } else if (p) say(`摸了摸${patPet(p)}`); else if (hallTap(w)) { if (window.__farm.openHall) window.__farm.openHall(); } else if (S.doorGift && (setCam(), Math.hypot(proj(DOOR.x + 7, DOOR.y + 5)[0] - w.px, proj(DOOR.x + 7, DOOR.y + 5)[1] - w.py) < 12)) takeDoorGift(); } } drag = null; document.body.classList.remove('grab'); };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
addEventListener('wheel', e => { if (e.target !== cv) return; zoom = clamp(zoom + (e.deltaY < 0 ? 1 : -1), 0, 3); fit(); }, { passive: true });
if (Q.has('cursor')) { // visible pointer for recordings
  const cur = document.createElement('div'); cur.id = 'fakecursor'; document.body.appendChild(cur);
  addEventListener('pointermove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
}

// ---------- main loop ----------
function advance(dt) {
  realT += dt;
  if (FOG.on) fogUpdate(); // v5.11.0.6
  if (keyRot) cam.ta += keyRot * dt * 1.8;
  if (keyPan.size) { let x = 0, y = 0; for (const k of keyPan) { x += PAN_KEYS[k][0]; y += PAN_KEYS[k][1]; } panScreen(-x * 170 * dt, -y * 170 * dt); }
  cam.a += (cam.ta - cam.a) * (1 - Math.exp(-dt * 14)); if (Math.abs(cam.ta - cam.a) < ASTEP / 4) cam.a = cam.ta;
  // web stays locked off the farmer so the picture does not shimmer; mobile can opt in via PFPlatform.followFarmer
  if (window.PFPlatform && PFPlatform.followFarmer && !drag) panTo(FARMER.x, FARMER.y);
  const mult = F.sleeping ? SIM.SLEEP_MULT : 1;
  let dm = dt * MIN_PER_SEC * SPEED * mult; // SPEED: the ?speed= test multiplier (local server only); v5.10.2: no bought 2x / 4x
  while (dm > 0) { const s = Math.min(dm, 1); stepSim(s); dm -= s; }
  glowTick(dt);
  worksFrame(); // v5.6.0
  decorFrame(); // v5.7.0
  updateFx(dt);
  tickWeather(dt);
}
function glowTick(dt) {
  for (const a of actors()) if (a.crops.some(it => SU.itemOf(it).giant) && a.moving && !a.home && Math.random() < dt * 0.7) hearts(a.x, a.y, 16);
  if (!window.PF_FX || !PF_FX.enabled() || PF_FX.count() > 140) return;
  for (const t of tiles) {
    if (!t.crop || !t.crop.glow || SU.isPart(t.crop) || !onScreen(t.x, t.y, 24)) continue;
    t._glowT = (t._glowT || 0) + dt;
    if (t._glowT > 0.7) { t._glowT = 0; PF_FX.play('glow', t.crop.giant ? t.x + TILE / 2 : t.x, t.crop.giant ? t.y + TILE / 2 : t.y, t.crop.giant ? 16 : 10); }
  }
}
let last = 0;
function frame() {
  // Use performance.now() (not the rAF timestamp): after a long game.js task the
  // rAF "now" can be an earlier vsync, which made dt negative, skipped stepSim,
  // and left the farmer hidden in the house until a later frame.
  const t = performance.now();
  let dt = last ? (t - last) / 1000 : 1 / 60;
  last = t;
  if (!(dt > 0)) dt = 1 / 60;
  else if (dt > 0.1) dt = 0.1;
  noteLog('sampleFps', 1 / dt);
  // v5.11.0.23: one actor or draw error must not black out the canvas or freeze the HUD at its HTML defaults
  try { advance(dt); } catch (e) { try { console.warn('[pixel-farm] advance', e); } catch (x) {} }
  try { render(); } catch (e) { try { console.warn('[pixel-farm] render', e); } catch (x) {} }
  try { albumTick(); hud(); } catch (e) { try { console.warn('[pixel-farm] hud', e); } catch (x) {} }
  requestAnimationFrame(frame);
}
window.__farm = { S, F, tiles, cam, advance: (sec, fps = 30) => { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) advance(1 / fps); render(); albumTick(); hud(); }, setSpeed: v => SPEED = v, render: () => { render(); albumTick(); hud(); }, spritesReady: () => SPR.ok, setAngle: a => { cam.a = cam.ta = a; }, setRealT: v => { realT = +v || 0; }, getRealT: () => realT, fishTask, fishSpot, proj: (x, y) => { setCam(); return proj(x, y); }, HOUSE, BARN, STALL, POND, playFx: (k, x, y, z, o) => { if (window.PF_FX) PF_FX.play(k, x, y, z, o); }, fxCount: () => window.PF_FX ? PF_FX.count() : 0, cropArt: v => { CROPI.on = v; } };
// Warm per-angle caches of the big buildings after the loop is already painting,
// in short wall-clock slices. Do not trust requestIdleCallback.timeRemaining()
// (some WebViews keep returning a large budget, and the setTimeout fallback
// always returns 8ms) — that used to precompute ~128 angles in one burst and
// freeze the farm for ~12s on a mid-range phone.
{ const big = props.filter(p => p.m && p.m.slices && p.m.slices.length && p.m.w * p.m.d * p.m.h >= 8000);
  let n = 1, side = 0, pi = 0, base = null;
  const SLICE_MS = 6;
  const work = () => {
    if (document.hidden) { setTimeout(work, 400); return; }
    const b = Math.round(cam.ta / ASTEP);
    if (b !== base) { base = b; n = 1; side = 0; pi = 0; }
    const t0 = performance.now();
    while (n <= 128 && (performance.now() - t0) < SLICE_MS && stkPx < STK_BUDGET * 0.8) {
      const p = big[pi];
      if (p) stackCanvas(p.m, (base + (side ? -n : n)) * ASTEP + p.rot);
      pi++;
      if (pi >= big.length) { pi = 0; side++; if (side > 1) { side = 0; n++; } }
    }
    setTimeout(work, (n > 128 || stkPx >= STK_BUDGET * 0.8) ? 400 : 50);
  };
  if (!MANUAL) {
    let c = 0;
    const kick = () => { c++; if (c >= 8) work(); else requestAnimationFrame(kick); };
    requestAnimationFrame(kick);
  }
}
// Watchdog: if the browser ever hands back a blanked canvas anyway (context lost / restored), throw away every cache and rebuild
// it from the voxel data, instead of drawing an empty farm until reload.
function cacheBlank() { // the ground is fully painted, and a weed sprite always has some opaque pixels
  if (groundBase.getContext('2d').getImageData(GW >> 1, GH >> 1, 1, 1).data[3] === 0) return true;
  const c = SPRITES.weed[0], d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; }
function rebuildCaches(why) {
  for (const [k, m] of STK) { m._ck.delete(k.a); } STK.clear(); stkPx = 0;
  for (const m of ALLM) { m._ck = null; m.secs = new Array(NSEC); m.slices = sliceSet(m, 0); }
  for (const p of props) if (p.tree) p._ck = null; for (const o of TV.values()) o._ck = null; discC.clear(); WG = { pond: null, sea: null }; buildGroundBase(); // v5.11.0.3: was null, which paintWater then indexed
  console.warn('[farm] caches rebuilt:', why); window.__farm.rebuilds = (window.__farm.rebuilds || 0) + 1;
  if (cacheBlank()) location.reload(); // hand-drawn sprites were lost too: start fresh
}
cv.addEventListener('contextlost', e => e.preventDefault());
cv.addEventListener('contextrestored', () => rebuildCaches('main canvas restored'));
setInterval(() => { if (!document.hidden && cacheBlank()) rebuildCaches('blank cache detected'); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && cacheBlank()) rebuildCaches('blank cache after tab was hidden'); });
window.__farm.mem = () => ({ stkPx, stk: STK.size, atlasPx: ALLM.reduce((t, m) => t + m.secs.reduce((u, x) => u + (x ? x.c.width * x.c.height : 0), 0), 0) });
window.__farm.debugBlank = () => { const g = groundBase.getContext('2d'); g.clearRect(0, 0, GW, GH); }; // test hook for the watchdog
let groundReady = false; // the first ground is built after the save is read (it shows which regions are open)

// ---------- save / load (rules in save.js, UI in ui.js) ----------
const GAME_VERSION = '5.11.0.29';
function logSnap() {
  return { day: S.day, t: S.t, coins: S.coins, createdAt: S.createdAt, gameVersion: GAME_VERSION, tiles: tiles.filter(t => t.open).length, regions: (S.eff.regions || []).length, animals: (S.animals || []).length, family: 1 + S.members.length, now: Date.now() };
}
function noteLog(fn, a, b, c) { const L = window.PFPlaylog; if (L && L[fn]) try { return L[fn](a, b, c); } catch (e) {} }
function cropNames() { return Object.fromEntries(CROP_IDS.map(k => [k, SIM.CROPS[k].name])); }
function progressCtx(extra) {
  return Object.assign({
    day: S.day, coins: S.coins, todayEarn: S.todayEarn, dayEarn: S.dayEarn, upgrades: S.up,
    family: S.family, stats: { totalSold: S.totalSold, earned: S.earned, todayEarn: S.todayEarn, dayEarn: S.dayEarn },
    catches: S.catches.length, pondCount: S.pondFish.length, streaks: S.streaks,
    achievements: S.achievements, milestones: S.milestones,
    sawRare: BOOK.has(S.codex, BOOK.keyRare('gold')) || BOOK.has(S.codex, BOOK.keyRare('white')),
    sawGiant: BOOK.has(S.codex, BOOK.keyGiant('pumpkin')) || BOOK.has(S.codex, BOOK.keyGiant('cabbage')) || BOOK.has(S.codex, BOOK.keyGiant('watermelon')),
    sawGiantPumpkin: BOOK.has(S.codex, BOOK.keyGiant('pumpkin')),
    caughtKoi: BOOK.has(S.codex, BOOK.keyFish('koi')),
    caughtSword: BOOK.has(S.codex, BOOK.keyFish('sword')),
    sawRain: !!(S.weather && S.weather.lastDay),
    sprinklerPlaced: S.works.sprinklers.length > 0, litLamp: !!S.decor.moon, partyHeld: S.decor.party.last > 0, // v5.7.0
    // a kid who is in (or already past) the school stage has been to school: old saves light it too
    wentSchool: !!(S.family && (S.family.kids || []).some(k => ['school', 'helper', 'teen'].includes(FAM.kidStage(k, S.day)))),
    caughtBug: !!(BOOK.has && BOOK.keyBug && Object.keys((S.codex && S.codex.entries) || {}).some(k => k.indexOf('bug:') === 0)),
  }, extra || {});
}
function noteProgress(extra) {
  const ctx = progressCtx(extra);
  const a = BOOK.unlock(S.achievements, BOOK.dueAchievements(ctx)); S.achievements = a.list;
  const m = BOOK.unlock(S.milestones, BOOK.dueMilestones(ctx)); S.milestones = m.list;
  for (const u of a.fresh) { const def = BOOK.ACH_BY[u.id]; log('成就：' + def.name); say('成就：' + def.name); }
  for (const u of m.fresh) { const def = BOOK.MS_BY[u.id]; log('里程碑：' + def.name); }
  try { albumProgress(a.fresh, m.fresh); } catch (e) {} // v5.11.0.11
  return a.fresh.length + m.fresh.length;
}
function noteShopOpened() { S.streaks = BOOK.noteShopOpen(S.streaks, S.day); }

const surpDay = { day: -1, m: {} }; // v5.9.1: today's surprises by kind (not saved): { n, line, ev } so repeats rewrite one log line
function surpriseNote(ev, x, y) {
  if (!ev) return;
  if (surpDay.day !== S.day) { surpDay.day = S.day; surpDay.m = {}; }
  const was = surpDay.m[ev.kind], n = was ? was.n + 1 : 1, msg = SU.mergedMsg ? SU.mergedMsg(ev, n) : ev.msg;
  if (was) { const i = S.log.indexOf(was.line); if (i >= 0) S.log.splice(i, 1); const j = S.events.lastIndexOf(was.ev); if (j >= 0) S.events.splice(j, 1); }
  else { say(ev.msg); emit('surprise', { kind: ev.kind }); } // the bubble and the jingle only for the first of a kind each day; v5.2: audio.js plays a jingle
  log(msg); surpDay.m[ev.kind] = { n, line: S.log[0], ev: S.events[S.events.length - 1] };
  noteLog('event', Object.assign({}, ev, { type: 'surprise', kind: ev.kind, day: S.day, t: S.t }));
  if (x != null) { popText(x, y, 18, '!', '#fff2a8'); burst(x, y, 12, ['#fff2a8', '#ffffff', '#ffd76a'], 10, 'spark'); }
}

function snapshot() {
  return {
    saveVersion: PFSave.CURRENT, gameVersion: GAME_VERSION, createdAt: S.createdAt, savedAt: Date.now(), rng: RNG.a,
    clock: { day: S.day, t: S.t }, coins: S.coins,
    stats: { totalSold: S.totalSold, cleared: S.cleared, earned: S.earned, soldToday: S.soldToday, todayEarn: S.todayEarn, dayEarn: S.dayEarn.slice() },
    prices: Object.assign({}, S.prices),
    inventory: { water: FARMER.water, waterMax: S.waterMax, store: Object.assign({}, S.store), bag: Object.assign({}, FARMER.bag), gathered: FARMER.gathered, basket: FARMER.crops.slice(), wood: FARMER.wood, saplings: Object.assign({}, FARMER.saplings), hay: S.hay, fishFood: S.fishFood, ornament: Object.assign({}, S.ornament) },
    farmer: { x: Math.round(FARMER.x * 100) / 100, y: Math.round(FARMER.y * 100) / 100, sleeping: FARMER.sleeping, home: FARMER.home },
    tiles: tiles.map(t => ({ f: t.f, c: t.c, r: t.r, open: t.open, tilled: t.tilled, watered: t.watered, debris: t.debris && Object.assign({}, t.debris), weed: t.weed && Object.assign({}, t.weed), crop: t.crop && SU.validCropExtras(t.crop, { type: t.crop.type, age: t.crop.age, n: t.crop.n || 0, rot: t.crop.rot }) })),
    upgrades: machStrip(Object.assign({}, S.up)), settings: { speed: 1, ...(S.decorLayout ? { decorLayout: S.decorLayout | 0 } : {}), speedRefund: S.speedRefund | 0, autoBuy: !!S.autoBuy, autoDay: S.autoDay | 0, autoN: S.autoN | 0 },
    offline: { win: (S.offlineWin || []).map(w => ({ at: w.at, days: w.days })) },
    yard: yard.map(c => ({ type: c.type, v: c.v, rot: c.rot, x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100 })),
    trees: S.trees.map(t => Object.assign({}, t)), orders: S.orders.map(o => Object.assign({}, o)),
    animals: S.animals.map(a => Object.assign({}, a)), troughs: Object.fromEntries(AN.PEN_IDS.map(k => [k, Object.assign({}, S.troughs[k])])),
    catches: S.catches.map(c => Object.assign({}, c)),
    pondFish: S.pondFish.map(f => Object.assign({}, f)),
    codex: { entries: Object.assign({}, (S.codex && S.codex.entries) || {}) },
    achievements: (S.achievements || []).map(u => Object.assign({}, u)),
    milestones: (S.milestones || []).map(u => Object.assign({}, u)),
    streaks: Object.assign({}, S.streaks),
    weather: Object.assign({}, S.weather || {}), bugNet: S.bugNet ? 1 : 0,
    family: (S.family.kidGrowth = 1, JSON.parse(JSON.stringify(S.family))), // v5.0; kidGrowth marks the v5.4.3 table
    members: S.members.map(m => ({ id: m.id, water: m.water, bag: Object.assign({}, m.bag), gathered: m.gathered, basket: m.crops.slice() })),
    log: S.log.slice(),
    plots: JSON.parse(JSON.stringify(S.plots || {})), // v5.5.0
    works: PW.valid(JSON.parse(JSON.stringify(S.works)), S.plots), // v5.6.0
    town: Object.assign(TN.valid(S.town), { hall: HL ? HL.valid(S.town.hall) : undefined }), // v5.8.0; v5.10.0: + hall
    home: HM ? homeSave() : undefined, // v5.9.0
    decor: DC.valid(JSON.parse(JSON.stringify(S.decor))), // v5.7.0 (a carry half-way is not saved: the thing stays where it was)
    ...(Object.keys(S.homeyard.put).length || S.homeyard.bday ? { homeyard: YD.valid(S.homeyard) } : {}), // v5.10.3 append-only
    ...(IN ? { inn: IN.valid(S.inn) } : {}), // v5.10.7 append-only
    ...(DY && S.diary ? { diary: DY.valid(S.diary) } : {}), // v5.10.13 append-only
    ...(ALB && S.album ? { album: ALB.pack(S.album) } : {}), // v5.11.0.11 append-only: a few bytes a photo
  };
}
function restore(s) { // s has been migrated and validated by PFSave
  fogReset(); // v5.11.0.6: a loaded save shows its districts as they are, no fade
  RNG.a = s.rng | 0; S.day = s.clock.day; S.t = s.clock.t; S.coins = s.coins; S.createdAt = s.createdAt;
  Object.assign(S, { totalSold: s.stats.totalSold, cleared: s.stats.cleared, earned: s.stats.earned, soldToday: s.stats.soldToday, todayEarn: s.stats.todayEarn, dayEarn: s.stats.dayEarn.slice() });
  S.prices = Object.assign(SIM.startPrices(), { egg: 1, wool: 1, milk: 1 }, s.prices); S.hay = s.inventory.hay || 0;
  S.fishFood = s.inventory.fishFood || 0; S.ornament = Object.assign({ koi: 0, goldfish: 0 }, s.inventory.ornament);
  S.animals = (s.animals || []).map(a => Object.assign({}, a)); S.troughs = Object.fromEntries(AN.PEN_IDS.map(k => [k, Object.assign({ feed: 0, water: 0 }, (s.troughs || {})[k])])); AV.clear(); PV.clear(); S.waterMax = s.inventory.waterMax; S.store = Object.assign(SIM.emptySeeds(), s.inventory.store);
  Object.assign(F, { water: Math.min(s.inventory.water, s.inventory.waterMax), bag: Object.assign(SIM.emptySeeds(), s.inventory.bag), gathered: s.inventory.gathered, crops: s.inventory.basket.slice(), task: null, moving: false,
    x: s.farmer.x, y: s.farmer.y, sleeping: s.farmer.sleeping, home: s.farmer.home || s.farmer.sleeping });
  const byPos = new Map(s.tiles.map(t => [(t.f || 'home') + ',' + t.c + ',' + t.r, t]));
  for (const t of tiles) { const o = byPos.get(t.f + ',' + t.c + ',' + t.r); if (!o) continue;
    Object.assign(t, { open: o.open, tilled: o.tilled, watered: o.watered, debris: o.debris, weed: o.weed, crop: o.crop && Object.assign({}, o.crop) });
    if (t.crop) t.crop.stage = SIM.stageOf(t.crop); }
  FARMER.wood = s.inventory.wood || 0; FARMER.saplings = Object.assign({ apple: 0, orange: 0 }, s.inventory.saplings);
  resetTreeViews(); S.trees = s.trees ? s.trees.map(t => Object.assign({}, t)) : WD.defaultTrees(); S.orders = (s.orders || []).map(o => Object.assign({}, o)); // a v2 save gets the default forest
  S.homeyard = YD.valid(s.homeyard); // v5.10.3 (before applyUpgrades: the house model follows the roof and the curtains)
  S.inn = IN ? IN.valid(s.inn) : null; STAYS.length = 0; if (S.inn && (S.inn.guests || []).some(g => g.from === S.day)) S.inn.arrived = S.day; // v5.10.7
  S.plots = PL.validPlots(s.plots); // v5.5.0 (before applyUpgrades: it opens plot fields and puts their modules down)
  innMigrate(); // v5.11.0.5
  S.works = PW.valid(s.works, S.plots); if (S.works.penHost) PW.applyPenLayout(PENS, S.works.penHost); SPR_COVER = null; // v5.6.0 (before applyUpgrades: the second pens' plot)
  S.up = Object.assign(SIM.emptyUpgrades(), s.upgrades); S.speedRefund = s.settings.speedRefund | 0; S.autoBuy = s.settings.autoBuy === true; S.autoDay = s.settings.autoDay | 0; S.autoN = s.settings.autoN | 0; S.decorLayout = s.settings.decorLayout | 0; // v5.10.1; v5.10.3/4 decorLayout
  machSyncUp(); // v5.11.0.29: the machines' shop levels come from works.mach
  S.offlineWin = (s.offline && Array.isArray(s.offline.win) ? s.offline.win : []).map(w => ({ at: w.at, days: w.days }));
  applyUpgrades(); // opens tiles a v1 save did not know about
  yard.length = 0;
  if (Array.isArray(s.yard)) s.yard.forEach(c => yard.push(Object.assign({}, c)));
  else fillYard(mulberry32((s.rng || 1) ^ 0xC0FFEE), YARD_START); // old saves get a yard to tidy, without touching the sim RNG
  S.catches = (s.catches || []).map(c => Object.assign({}, c)); S.fishGold = 0;
  S.pondFish = (s.pondFish || []).map(f => Object.assign({}, f)); S.pondFed = 0;
  S.diary = DY ? DY.valid(s.diary) : null; // v5.10.13
  S.album = ALB ? ALB.valid(s.album) : null; albumQ.length = 0; // v5.11.0.11 (old saves: backfilled after the load)
  if (S.album) for (const e of S.album.list) if (e.q) albumQ.push({ e, at: e.q.at, follow: e.q.f || null, re: !!e.q.re }); // photos still waiting when it was saved
  S.codex = BOOK.validCodex(s.codex); S.achievements = (s.achievements || []).map(u => Object.assign({}, u)); S.milestones = (s.milestones || []).map(u => Object.assign({}, u));
  S.streaks = BOOK.validStreaks(s.streaks); S.doorGift = null; S.loose = []; S.dogPlan = null; planDogDay();
  S.weather = WX && WX.validWeather ? WX.validWeather(s.weather) : (s.weather || { nextDay: 0, start: 0, dur: 0, lastDay: 0, rained: 0 }); S.weather = WX && WX.ensure ? WX.ensure(S.weather, S.day, s.createdAt | 0 || 1) : S.weather; S.bugNet = s.bugNet ? 1 : 0; if (INS && INS.reset) INS.reset();
  S.family = Object.assign(FAM.empty(), JSON.parse(JSON.stringify(s.family || {}))); if (window.PFKids) PFKids.migrateFamily(S.family, S.day, s.members || []); S.members.length = 0; syncFamily(); // v5.0: everyone wakes at the door
  for (const m of S.members) { const o = (s.members || []).find(q => q.id === m.id); m.sleeping = FARMER.sleeping;
    if (o) Object.assign(m, { water: o.water, bag: Object.assign(SIM.emptySeeds(), o.bag), gathered: o.gathered, crops: o.basket.slice() }); }
  S.town = Object.assign(TN.valid(s.town), { hall: HL ? HL.valid(s.town && s.town.hall) : undefined }); VISITORS.length = 0; NEIGH.length = 0; guestsOut = 0; // v5.8.0
  if (YARD_ON) { YA.sync(true, clothesOut()); if (groundReady) buildGroundBase([20, 30, 170, 66]); }
  S.decor = DC.valid(s.decor); for (const a of actors()) a._carry = null; GUESTS.length = 0; partyBegun = 0; partyReg = { day: -1, keys: [], kid: {} }; partyLawnC.key = ''; partyPlanC.key = ''; if (DECOR_ON) DA.sync(true); if (INN_ON) IA.sync(true); markNavDirty(); // v5.7.0; v5.10.7 inn
  if (HM) homeRestore(s); // v5.9.0 (after the family: a married child wakes at the new house)
  S.log = s.log.slice(); S.label = FARMER.sleeping ? '睡觉中 Zzz' : '继续干活'; groundDirty = true;
  refundSpeed();
}
// v5.10.2: the 2x / 4x speed is gone. A save that bought it gets the price back once (600, or 600 + 3000) and the level goes to 0.
function refundSpeed() {
  const lv = S.up.speed | 0; if (lv <= 0) { delete S.up.speed; return 0; }
  delete S.up.speed;
  if (S.speedRefund > 0) return 0; // already given back (an older backup still had the level)
  const gold = SIM.speedRefund(lv); if (!(gold > 0)) return 0;
  S.coins += gold; S.speedRefund = gold;
  log(`游戏倍速已取消，大家都按同一个速度过日子，退回 ${gold} 金`);
  noteLog('event', { type: 'speedRefund', level: lv, gold, day: S.day, t: S.t });
  return gold;
}
const SAVE = { at: 0, error: null, notes: [], off: false, offline: null };
function saveNow() {
  if (SAVE.off) return false;
  const r = PFSave.write(snapshot()); SAVE.error = r.ok ? null : r.error;
  if (r.ok) {
    SAVE.at = Date.now(); noteLog('flush'); noteLog('syncSoon', 'autosave');
    window.dispatchEvent(new CustomEvent('pf:saved', { detail: { earned: S.earned, day: S.day } }));
  } else window.dispatchEvent(new CustomEvent('pf:save-error', { detail: { error: r.error, bytes: r.bytes || 0 } }));
  return r.ok;
}

function weatherSeed() { return (S.createdAt | 0) || 1; }
function applyRainMorning(forced) {
  if (!WX) return false;
  if (!forced) S.weather = WX.beginDay(S.weather || WX.emptyWeather(), S.day, weatherSeed());
  if (!WX.isRainDay(S.weather, S.day)) return false;
  let n = 0;
  for (const tile of tiles) if (tile.crop && tile.open) { tile.watered = true; n++; }
  groundDirty = true;
  if (!forced) log('今天下着小雨，已经种下的田都湿了，不用浇水');
  noteProgress({ sawRain: true });
  return true;
}
// v5.11.0.5.3: tools/pine-shots.js renders one tree on its own (its cached sprite at the current angle) and reads its pixels
if (window.__farm) Object.assign(window.__farm, { treeDefs, treeImage: (def, x = 0, y = 0, poseT = 0, lean = 0) => { setCam(); const o = { tree: def, x, y, lean, tick: 0 }, k = treeCache(o, poseT);
  const trunk = new Set(), leaf = new Set(); for (const c of Wd) trunk.add(u32(c)); for (const c of G) { leaf.add(u32(c)); leaf.add(OUTL.get(u32(c))); } leaf.delete(INK0); // ink outlines count as neither
  for (const c of trunk) leaf.delete(c); const cls = Array.from(k.d32, v => !(v >>> 24) ? 0 : trunk.has(v) ? 2 : leaf.has(v) ? 1 : 3);
  return { w: k.c.width, h: k.c.height, ox: k.ox, oy: k.oy, cls, url: k.c.toDataURL() }; } });
if (window.__farm) Object.assign(window.__farm, { rainPick: () => rainPick(), rainUnder: (x, y) => rainUnder(x, y) }); // v5.11.0.4: for tools/rain-shots.js
function tickWeather(dt) {
  const raining = !!(WX && WX.isRaining(S.weather, S.day, S.t));
  const wet = WX ? WX.wetness(S.weather, S.day, S.t) : 0;
  const T = S.t % 1440, night = T >= 20 * 60 || T < WAKE;
  if (WX) WX.tickVisual(dt, { raining, wetness: wet, pond: POND, W, H, pathSegs, pick: rainPick });
  if (window.PFAudio && PFAudio.rain) PFAudio.rain(raining);
  if (INS) {
    const evs = INS.tick(dt, {
      day: S.day, t: S.t, raining, night, summer: !!(WX && WX.isSummer(S.day)),
      pond: POND, orchard: !!(S.eff.regions && S.eff.regions.includes('orchard')),
      hasNet: !!S.bugNet,
      // play / school / helper kids (not only role==='child'); skip anyone still off-map at school
      kids: (S.members || []).filter(m => m.id && /^kid/.test(m.id) && m.away !== 'school').map(m => ({ x: m.x, y: m.y, id: m.id })),
    });
    for (const ev of evs || []) {
      if (BOOK) BOOK.record(S.codex, ev.key, ev.day || S.day);
      noteProgress({ caughtBug: true });
      noteBugCatch(ev);
    }
  }
}

// v5.10.1: 「明天 07:40」 for the time the 24-hour offline window is full again (the player's own clock)
function clockText(at, now) {
  const d = new Date(at), n = new Date(now), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(d) - day(n)) / 86400000);
  return (diff <= 0 ? '今天 ' : diff === 1 ? '明天 ' : '') + hm;
}
// v5.11.0.8: when the used-up offline allowance comes back. The 24-hour window rolls, so the oldest record frees its days first.
function offBack(r) {
  return r.nextPartAt && r.nextPartAt < r.nextFullAt ? `${r.nextPartText} 起恢复 ${r.nextPartDays} 天` : `${r.nextText} 起恢复全部 3 天`;
}
function settleOffline(sec) { // decision: estimate at 50% of the online rate, at most 3 game days; gold, plus a little wood (v5.3.1)
  if (!Number.isFinite(sec)) return null; // xhs: a broken savedAt pays nothing
  // v5.10.1: and at most 3 days in any 24 real hours (S.offlineWin); a clock turned back pays nothing and keeps the window
  if (sec < -60) { log('电脑的时钟好像往回调过，这次不算离线收益'); noteLog('event', { type: 'clockBack', sec: Math.round(sec), day: S.day }); return null; }
  const now = Date.now(), r = SIM.offlineSettle(sec, S.dayEarn, S.offlineWin, now); if (!r) return null;
  S.offlineWin = r.win; r.nextText = clockText(r.nextFullAt, now); if (r.nextPartAt) r.nextPartText = clockText(r.nextPartAt, now); // v5.11.0.8: when the first part comes back
  const T = Math.floor(S.t % 1440); r.day = S.day; r.clock = String(Math.floor(T / 60)).padStart(2, '0') + ':' + String(T % 60).padStart(2, '0'); // v5.11.0.8: the clock stood still (还是第 N 天 HH:MM)
  if (r.limited && r.days <= 0) { // the window is used up: a log line only, no box
    log(`离开了 ${Math.round(sec / 60)} 分钟；过去 24 小时的 3 天离线收益已经领过，${offBack(r)}`); // v5.11.0.8: the window rolls (the old 「X 以后再算」 named the time it was full again)
    noteLog('offline', r, logSnap()); SAVE.offline = r; window.dispatchEvent(new CustomEvent('pf:offline', { detail: r })); saveNow(); return r;
  }
  S.coins += r.gold; S.earned += r.gold;
  if (r.gold > 0) log(`离线期间赚了 ${r.gold} 金` + (r.limited ? `（过去 24 小时已经结算过 ${r.used} 天，这次按 ${r.days} 天算）` : ''));
  offlineWood(r); // v5.3.1: the family also chopped a little in 林场
  if (WX && r.days > 0) {
    const off = WX.advanceDays(S.weather || WX.emptyWeather(), S.day, r.days, (S.createdAt | 0) || 1);
    S.weather = off.weather; r.wxDays = Math.floor(r.days); // v5.11.0.8: the weather walked these days although the calendar did not
    if (off.rainDays.length) {
      r.rain = true; r.rainDays = off.rainDays.slice();
      for (const tile of tiles) if (tile.crop && tile.open) tile.watered = true;
      groundDirty = true;
      log('这天下过小雨，田都湿了');
      noteProgress({ sawRain: true });
    }
  }
  noteLog('offline', r, logSnap());
  SAVE.offline = r; window.dispatchEvent(new CustomEvent('pf:offline', { detail: r })); saveNow(); return r;
}
onMorning = () => { noteLog('syncMorning', logSnap()); saveNow(); };
const boot = PFSave.read();
SAVE.notes = boot.notes;
if (boot.state) { restore(boot.state); log(`读取存档：第 ${S.day} 天，${S.coins} 金`); yardCatchUp('之前买好还没弄完的，家人补上了：'); sprCatchUp('之前买好的浇水器，家人补上了：'); decorCatchUp('之前买好还没摆的，家人补上了：'); pondCatchUp(); } // v5.10.11.1: paid pieces an older version left unbuilt
else { fillYard(yardRng(0xA5A5A5), YARD_START); log('早上好！农场里乱糟糟的，先收拾一下'); albumSnap('open', null, null, { wait: 30, follow: 'farmer' }); } // v5.11.0.11: the album's first photo
if (WX && WX.ensure) S.weather = WX.ensure(S.weather || WX.emptyWeather(), S.day, (S.createdAt | 0) || 1);
OPEN_REGIONS = S.eff.regions.slice(); syncRegionProps(); buildGroundBase(); groundReady = true;
if (!boot.blocked) saveNow();
noteLog('boot', logSnap(), { getSave: snapshot });
if (boot.state) try { albumBackfill(); } catch (e) {} // v5.11.0.11: an old save's story so far, as re-staged frames
if (boot.state) {
  const skew = Date.now() - boot.state.savedAt; // savedAt in the future: settleOffline logs it and pays nothing (v5.10.1)
  settleOffline(skew / 1000);
}
setInterval(saveNow, (window.PFPlatform && PFPlatform.saveEveryMs) || 15000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveNow(); noteLog('syncNow', 'hidden'); hiddenAt = Date.now(); } // the game pauses while hidden (no animation frames)
  else if (hiddenAt) { const sec = (Date.now() - hiddenAt) / 1000; hiddenAt = 0; settleOffline(sec); }
});
addEventListener('pagehide', () => { noteLog('endSession', logSnap()); saveNow(); noteLog('syncNow', 'pagehide'); });
Object.assign(window.__farm, { ALB, albumSnap: (id, x, y, o) => albumSnap(id, x, y, o), albumView: () => albumView(), albumRestage: id => albumRestage(id), albumBackfill: () => albumBackfill(), albumFacts: () => albumFacts(), albumPlace: at => albumPlace(at), albumShot: (x, y, st) => albumShot(x, y, st), albumQueue: () => albumQ.length, albumPending: () => albumQ.map(q => [q.e.id, q.at]), albumMs: () => albumMs }); // v5.11.0.11
Object.assign(window.__farm, { snapshot: () => snapshot(), YD, yardTodo: () => yardTodo(), yardWalk: (x, y) => yardWalk(x, y), yardNight: () => yardNight(), clothesOut: () => clothesOut(), petBed: (d, k) => petBed(d, k), yardSetup: id => { const q = yardSetupTask(id); q.done(); }, priceMult: () => YD.stallMult(S.homeyard.put) });
Object.assign(window.__farm, { offBack: r => offBack(r), slotHomes: () => slotHomes(), pathD: (x, y) => pathD(x, y), groundAt: (x, y) => groundAt(x, y), SLT, slotWhy: id => SLT.spotsFor(id, slotHomes()).map(s => [s.x, s.y, ownGround(s.x, s.y) ? placeOk(s.x, s.y, "decor", id, null, null, true).why : "not owned"]), decorRelayout: () => decorRelayout(), MK, marketView: () => marketView(), setMarketPick: (on, k) => setMarketPick(on, k), marketDay: () => marketDay(), marketCrowd: () => MKT.slice(), marketList: a => (marketH() ? marketList(a || FARMER) : []), BK, bakeryView: () => bakeryView(), setBakeryPick: (on, id) => setBakeryPick(on, id), bakeryCounts: () => bakeryCounts(), bakeryPull: need => bakeryPull(need), bakeryHeldReturn: need => bakeryHeldReturn(need), bakeryDeliver: () => bakeryTask(), applyUpgrades: () => applyUpgrades(), TA, WS, SM, woodshopView: () => woodshopView(), setWoodshopAuto: on => setWoodshopAuto(on), smithyView: () => smithyView(), smithyBuy: id => smithyBuy(id), autoBuyAtStall, setAutoBuy, clockText, HL, hallView: () => (HL && TN ? hallView() : null), hallStart: id => hallStart(id), hallGive: (id, u) => hallGive(id, u), hallTick: () => hallTick(), shopDepth, shopAfford, REVEAL_MAX, litBuilds: () => litBuilds, surpriseNote: (ev, x, y) => surpriseNote(ev, x, y), plantRoom, PLANT_FULL, plantSpot: (x, y) => plantSpot(x, y), woodAuto: () => ({ on: WA.canAuto(S.eff), target: woodTarget() }), waterTask: t => waterTask(t), shopOpen, SHOP_OPEN, SHOP_CLOSE, sellTask: () => sellTask(), FAM, FARMER, giftAtStall, syncFamily, familyMorning, popCap, woodCap, houseProp, penFence, famSheet, claimsFor, actors, PENS, PETS_LIVE, PV, petAtScreen, patPet, petArt: (k, coat) => petSprite({ kind: k, coat }).r[0], petFrames: p => petSprite(p), SAVE, snapshot, yard, AV, PASTURE, animalArt: k => ANIMAL_SPR[k].r[0], WORLD, panTo, setMode, orderChop, orderPlant, orderRelease, plantSpot, inHomePond, ornamentHeld, input: INPUT,
  BOOK, noteProgress, noteShopOpened, planDogDay, placePondFish, pondRoom: () => pondRoom(), pondCatchUp: () => pondCatchUp(), DY, diaryView: d => diaryView(d), diaryMorning: () => diaryMorning(), KIDS: window.PFKids, kidPickTask, kidPickPlay, DOOR, WX, INS,
  noteBugCatch, forceRain: (start, dur) => { if (!WX) return null; S.weather = WX.forceRain(S.weather, S.day, start != null ? start : Math.floor(S.t % 1440), dur); applyRainMorning(true); if (window.PFAudio && PFAudio.rain) PFAudio.rain(true); return S.weather; },
  forceCatch: (kind) => { if (!INS) return null; const ev = INS.forceCatch(kind || 'white', S.day, FARMER.x + 8, FARMER.y); if (ev && BOOK) { BOOK.record(S.codex, ev.key, S.day); noteProgress({ caughtBug: true }); log(`${ev.name}被捉进图鉴，看了一眼就放走了`); } return ev; },  treeScreen: id => { const t = S.trees.find(q => q.id === id); if (!t) return null; setCam(); const [sx, sy] = proj(t.x, t.y), o = TV.get(t.id); return { x: sx, y: sy - (o && o.tree ? o.tree.h * 0.45 : 6) }; },
  toClient: (x, y) => { setCam(); const [sx, sy] = proj(x, y), r = cv.getBoundingClientRect(); return { x: r.left + sx * r.width / W, y: r.top + sy * r.height / H }; }, buy: id => { const r = buy(id); if (r.ok) saveNow(); return r; }, board: () => board().map(j => ({ kind: j.kind, base: j.base, score: Math.round((j.base - travel(F, j.at) / 8) * 10) / 10 })),
  fit, panScreen, clampCam, setZoom: z => { zoom = z | 0; fit(); return zoom; }, getZoom: () => zoom, homeCam: () => { cam.ta = DEFAULT_A; panTo(HOME_CAM.x, HOME_CAM.y); }, cancelDrag,
  cropAtlasURL: () => { const a = cropAtlas(); return a ? a.toDataURL() : null; },
  cropFrame: k => { const a = cropAtlas(); if (!a) return null; const i = CROP_IDS.indexOf(k); if (i < 0) return null;
    const t = 16, c = document.createElement('canvas'); c.width = t; c.height = t; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(a, i * t, 0, t, t, 0, 0, t, t); return c; }, restore, saveNow, settleOffline, version: GAME_VERSION, playlog: window.PFPlaylog, surprise: SU, storehouse, priceOfAny, itemType: SU.itemType, loveStatus, spousesIn: () => spousesIn(), hud,
  reload: () => { SAVE.off = true; location.reload(); }, // used after import / reset so the old state is not saved again on the way out
  reset: () => { SAVE.off = true; PFSave.reset(); location.reload(); },
  importState: s => { SAVE.off = true; const r = PFSave.write(s); if (r.ok) location.reload(); else SAVE.off = false; return r; },
  NAV, pathTo, routeVia, travel, ensureNav, markNavDirty, actorRoutes, PL, XP, plotOffer: (id, mod) => PL.offer(S.plots, id, mod, S.coins, FARMER.wood, S.family), buyPlot: (id, mod) => XP.buyPlot(id, mod), rezonePlot: (id, mod) => XP.rezonePlot(id, mod), rezoneOffer: (id, mod) => PL.rezoneOffer(S.plots, id, mod, S.coins, FARMER.wood), groundAt: (x, y) => groundAt(x, y), stackStats: () => ({ n: STK.size, px: stkPx }),
  setPathDebug: routes => { dbgRoutes = routes || []; }, pathGrid: () => ensureNav() });
Object.assign(window.__farm, { HM, HA, HT, SPOUSES, props, homeMoveOk: (x, y, i) => homeMoveOk(x, y, i), homeMoveTo: (x, y, i) => { const r = homeMoveOk(x, y, i | 0); if (!r.ok) return r; const q = { what: 'home', ref: i | 0, x: r.x, y: r.y, op: 'move' }; return { ok: !!homeMoveDone(q), why: r.why, spot: r.spot, site: r.spot && r.spot.site }; }, homeStatus: () => homeStatus(), homeSpot: () => homeSpot(), homeGate: h => homeGate(h), homeMorning: () => homeMorning(), homeMoveIn: (k, n) => homeMoveIn(k, n), homeNight: () => homeNight(), homeTeenVisit: T => homeTeenVisit(T), weddingTonight: () => weddingTonight(), homeTilesSync: () => homeTilesSync(), homeSave: () => homeSave(), memberOf: id => memberOf(id), CR, careerPick: (k, way, at, kind) => careerPick(k, way, at, kind), careerChange: (k, way, at, kind) => careerChange(k, way, at, kind), careerView: (k, mode) => careerView(k, mode), careerOffer: k => careerOffer(k), careerEnsure: k => careerEnsure(k), careerPrompt: () => careerPrompt, careerDefault: k => careerDefault(k), workWalk: a => workWalk(a), townLv: () => townLv(), IN, IA, STAYS, innView: () => innView(), innStart: id => innBuy(id), innBuy: id => innBuy(id), setInnMenu: v => innSetMenu(v), innMorning: () => innMorning(), innTick: dm => innTick(dm), innCounts: () => innCounts(), dinerReserveNeed: () => dinerReserveNeed(), innServeMeals: () => innServeMeals(), innLayout: () => innLay(), innResortLayout: () => IN && IN.resortLayout(), innPlot: () => innPlot(), innRepaint: () => innRepaint(), innMigrate: () => innMigrate(), innFest: () => innFest(), innStaffed: () => innStaffedNow(), innStars: () => innStarsNow(), sunsetTask: () => sunsetTask(), sunsetFade: T => sunsetFade(T), SC, LB, CL, FV, sportsOpenNow: () => sportsOpenNow(), sportsTask: () => sportsTask(), feastTask: () => feastTask(), festNow: () => festNow(), fairNow: () => fairNow(), sleepAt: () => sleepAt(), libraryRead: a => libraryRead(a) }); // v5.9.0 test hooks; v5.10.6–v5.10.11
Object.assign(window.__farm, { DC, DA, placeOk: (x, y, what, id, skip) => placeOk(x, y, what, id, skip), decorClick: w => decorClick(w), decorHover: w => decorHover(w), decorGain: (id, how) => decorGain(id, how),
  autoSpot: id => autoSpot(id), movables: () => movables(), clearMoves: () => { for (const q of S.decor.orders.slice()) if (q.mine) dropOrder(q); }, orderThing: (...a) => orderThing(...a), settle: q => settle(q),
  carryFields: a => carryFields(a), schoolWalk: a => schoolWalk(a), lookOf: m => lookOf(m), famReady: k => !!(FAM_PRE[k] && FAM_PRE[k].complete && FAM_PRE[k].naturalWidth), // v5.8.1
  TN, TA, townOpen, VISITORS, NEIGH, priceOfAny: it => priceOfAny(it), schoolRoute: () => schoolRoute(), spawnMate: (a, ex) => spawnMate(a, ex), tradeTask: () => tradeTask(), tradeList: a => tradeList(a), townSkip: a => townSkip(a), townMateHome: (a, ex) => townMateHome(a, ex), // v5.8.0
  partyMorning: () => partyMorning(), partyTask: () => partyTask(), partyLawn: () => partyLawnNow(), partyPlan: () => partyPlanNow(), wedCer: () => wedCer(), wedLook: a => wedLook(a), famSheet: (l, c) => famSheet(l, c), wedCouple: () => wedCouple(), weddingTonight: () => wedNow(), homeTick: dm => homeTick(dm), homeMorning: () => homeMorning(), partyFx: () => PARTY_FX_LAST.slice(), partyDraw: () => PARTY_DRAW_LAST, partySpot: a => partySpot(a), partySprite: () => SPR, GUESTS, decorTick: dm => decorTick(dm), decorNight: () => decorNight(), decorBoard: (post, T) => decorBoard(post, T), decorDrop: (src, x, y) => decorDrop(src, x, y),
  decorKeepGiant: (t, x, y) => decorKeepGiant(t, x, y), partyArea: () => partyArea(), entrySpots: () => entrySpots() }); // v5.7.0 test hooks
Object.assign(window.__farm, { plotBusy: id => worksBusy(id), worksVacateNote: id => worksVacateNote(id), worksVacate: (id, mod) => worksVacate(id, mod), PW, PWA, worksTick: dm => worksTick(dm), worksNight: () => worksNight(), sprinklerNext: () => sprinklerNext(), installTask: sp => installTask(sp), sprinklerClick: w => sprinklerClick(w), herdOn: () => herdOn(), wheatHave: () => wheatHave(), demandWant: () => demandWant(), demandPick: bag => demandPick(bag), chooseTask: () => chooseTask(), restOk: k => restOk(k), helpWinNow: T => helpWinNow(T), farmHands: () => farmHands(), demandGrowing: () => demandGrowing(), demandShort: k => demandShort(k), seaQuota: () => seaQuota(), workPending: () => workPending(), board: () => board(), setF: a => { F = a; } }); // v5.6.0 test hooks
// ---------- minimap (HTML canvas beside the game; never part of the pixel-exact picture) ----------
// The ground canvas is already a top-down map of the world, so the minimap is that, shrunk, plus trees, locks, fields, the
// farmer and the part of the world on screen. Click it to look somewhere else.
const MM = { el: document.getElementById('minimap'), s: 0.5, base: null };
// coin from the HUD sprite sheet, drawn beside region prices (same icon as the shop)
const MM_HUD = new Image();
let mmCoin = null;
function mmCoinBadge() {
  if (mmCoin) return mmCoin;
  if (!MM_HUD.complete || !MM_HUD.naturalWidth) return null;
  const s = 10, c = document.createElement('canvas'); c.width = s; c.height = s;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(MM_HUD, 0, 0, 32, 32, 0, 0, s, s);
  return mmCoin = c;
}
function mmCoinReady() { mmCoin = null; MM.base = null; if (typeof minimapDraw === 'function') minimapDraw(); }
MM_HUD.onload = mmCoinReady;
MM_HUD.src = 'assets/hud_icons.png';
if (MM_HUD.complete && MM_HUD.naturalWidth) mmCoinReady();
function fillCoinPrice(g, n, cx, cy) {
  const label = String(n), badge = mmCoinBadge(), ih = 10, gap = 2;
  g.font = '600 10px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const tw = g.measureText(label).width, total = (badge ? ih + gap : 0) + tw, x = Math.round(cx - total / 2), y = Math.round(cy);
  if (badge) g.drawImage(badge, x, y - (ih >> 1));
  g.fillStyle = '#ffd76a'; g.fillText(label, x + (badge ? ih + gap : 0), y);
}
function minimapBase() {
  if (!MM.el) return; const w = Math.round((WORLD.x1 - WORLD.x0) * MM.s), h = Math.round((WORLD.y1 - WORLD.y0) * MM.s);
  MM.el.width = w; MM.el.height = h; const b = MM.base = MM.base || mkc(w, h), g = b.getContext('2d'); b.width = w; b.height = h;
  g.imageSmoothingEnabled = true; g.drawImage(groundBase, (WORLD.x0 - GX0) * RS, (WORLD.y0 - GY0) * RS, (WORLD.x1 - WORLD.x0) * RS, (WORLD.y1 - WORLD.y0) * RS, 0, 0, w, h);
  const P = (x, y) => [(x - WORLD.x0) * MM.s, (y - WORLD.y0) * MM.s];
  g.fillStyle = G[0]; for (const p of props) if (p.tree) { const [x, y] = P(p.x, p.y); g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
  for (const p of props) if (p.big) { const [x, y] = P(p.x, p.y), hw = p.town && p.m ? Math.max(3, p.m.w * MM.s / 4) : 5, hd = p.town && p.m ? Math.max(3, p.m.d * MM.s / 4) : 4; // v5.11.0: town roofs at their real size
    g.fillStyle = p.house ? Rf[2] : Wd[2]; g.fillRect(Math.round(x - hw), Math.round(y - hd), Math.round(2 * hw), Math.round(2 * hd)); }
  for (const r of WD.REGIONS) if (!regionOpen(r.id)) { const [x0, y0] = P(r.rect[0], r.rect[1]), [x1, y1] = P(r.rect[2], r.rect[3]);
    g.fillStyle = 'rgba(20,14,10,0.45)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#e8c78a'; g.setLineDash([3, 2]); g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1); g.setLineDash([]);
    g.font = '600 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff6dc'; g.fillText('未解锁 · ' + r.name, (x0 + x1) / 2, (y0 + y1) / 2 - 2);
    fillCoinPrice(g, SIM.shopItem(r.id).levels[0].cost, (x0 + x1) / 2, (y0 + y1) / 2 + 8); }
  XP.minimap(g, P, fillCoinPrice); // v5.5.0: the ring's plots
  if (FOG.on) fogRepaint(); { const fc = fogMinimap(); if (fc) { const B = FG.BOUNDS, [bx, by] = P(B[0], B[1]); g.imageSmoothingEnabled = true; g.drawImage(fc, bx, by, FG.GW * FG.CELL * MM.s, FG.GH * FG.CELL * MM.s); } } // v5.11.0.13: the same opaque bank
  if (TN && TN.AGRI) { const shutA = FOG.on && FOG.shut && FOG.shut.agri, shutT = FOG.on && FOG.shut && FOG.shut.town; /* v5.11.0.13: dark ink on the pale cloud */ g.font = '600 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; // v5.11.0: the town's name and the reserved 农家乐区
    const [ax0, ay0] = P(TN.AGRI[0], TN.AGRI[1]), [ax1, ay1] = P(TN.AGRI[2], TN.AGRI[3]); if (!shutA) { g.strokeStyle = 'rgba(255,246,220,0.55)'; g.setLineDash([3, 3]); g.strokeRect(ax0 + 0.5, ay0 + 0.5, ax1 - ax0 - 1, ay1 - ay0 - 1); g.setLineDash([]); }
    g.fillStyle = shutA ? 'rgba(62,63,76,0.85)' : 'rgba(255,246,220,0.8)'; g.fillText(FOG.shut && FOG.shut.agri ? '农家乐区 · 待解锁' : innPlot() ? '农家乐区' : '农家乐区 · 开镇门后可建', (ax0 + ax1) / 2, (ay0 + ay1) / 2);
    const [tx, ty] = P((TN.RECT[0] + TN.RECT[2]) / 2, TN.RECT[1] + 10); g.fillStyle = shutT ? 'rgba(62,63,76,0.85)' : '#fff6dc'; g.fillText(S.eff && S.eff.town ? '小镇' : '小镇 · 待解锁', tx, ty); }
}
function minimapDraw() {
  if (!MM.el || MM.el.offsetParent === null) return; if (FOG.mmDirty) { FOG.mmDirty = false; MM.base = null; } if (!MM.base) minimapBase(); const g = MM.el.getContext('2d');
  const P = (x, y) => [(x - WORLD.x0) * MM.s, (y - WORLD.y0) * MM.s];
  g.drawImage(MM.base, 0, 0);
  for (const t of tiles) if (t.open) { const [x, y] = P(t.x - 4, t.y - 4); g.fillStyle = t.crop ? (SIM.ripe(t.crop) ? '#ffd76a' : G[3]) : t.tilled ? Wd[1] : t.debris || t.weed ? G[2] : Wd[3]; g.fillRect(x, y, 4, 4); }
  for (const t of S.trees) { if (fogHid(t.x, t.y)) continue; const [x, y] = P(t.x, t.y); g.fillStyle = t.stage !== 'tree' ? Wd[3] : t.ripe ? (t.kind === 'apple' ? Rf[2] : Ac[2]) : t.kind === 'wild' ? G[1] : G[4]; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
  for (const o of S.orders) { const t = o.type === 'chop' ? S.trees.find(q => q.id === o.id) : o; if (!t) continue; const [x, y] = P(t.x, t.y); g.fillStyle = '#ff5a4a'; g.fillRect(Math.round(x) - 1, Math.round(y) - 4, 2, 3); }
  setCam(); g.strokeStyle = '#fff6dc'; g.lineWidth = 1; g.beginPath();
  [[0, 0], [W, 0], [W, H], [0, H]].forEach(([px, py], i) => { const rx = (px - CX) / RS, ry = (py - CY) / (K * RS), [x, y] = P(rx * CA + ry * SA, -rx * SA + ry * CA); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath(); g.stroke();
  for (const v of AV.values()) { if (fogHid(v.x, v.y)) continue; const [ax, ay] = P(v.x, v.y); g.fillStyle = Ac[0]; g.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 2, 2); }
  for (const v of PV.values()) { if (fogHid(v.x, v.y)) continue; const [ax, ay] = P(v.x, v.y); g.fillStyle = Ac[2]; g.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 2, 2); }
  const [fx, fy] = P(F.x, F.y); g.fillStyle = Ink[0]; g.fillRect(Math.round(fx) - 2, Math.round(fy) - 2, 5, 5); g.fillStyle = '#ffffff'; g.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
}
if (MM.el) { window.__farm.onGround = () => { MM.base = null; };
  MM.el.addEventListener('pointerdown', e => { const r = MM.el.getBoundingClientRect(); panTo(WORLD.x0 + (e.clientX - r.left) / r.width * (WORLD.x1 - WORLD.x0), WORLD.y0 + (e.clientY - r.top) / r.height * (WORLD.y1 - WORLD.y0)); minimapDraw(); });
  setInterval(minimapDraw, 250); }
window.__farm.minimapDraw = minimapDraw;
// v5.11.0: four jump buttons under the minimap — 家 / 农家乐 / 小镇 / 海边. 农家乐 goes to the 农家乐区 (v5.11.0.5: the lodging is
// built there); 海边 to the beach resort plot, else the sea shore (v5.11.2 moves it).
function jumpSpot(id) {
  if (id === 'home') return { x: HOME_CAM.x, y: HOME_CAM.y };
  if (id === 'town') return { x: (TN.RECT[0] + TN.RECT[2]) / 2 - 20, y: TN.AVENUE.y + 24 };
  if (id === 'agri') { const L = innLay(); if (L) return { x: (L.rect[0] + L.rect[2]) / 2, y: (L.rect[1] + L.rect[3]) / 2 };
    return { x: (TN.AGRI[0] + TN.AGRI[2]) / 2, y: (TN.AGRI[1] + TN.AGRI[3]) / 2 }; }
  if (id === 'beach') { const r = PL.plot(IN ? IN.RESORT_PLOT || 'eshore' : 'eshore').rect; return { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 + 20 }; }
  return null;
}
function jumpTo(id) { const p = jumpSpot(id); if (!p) return false; if (id === 'home') cam.ta = DEFAULT_A; panTo(p.x, p.y); return true; }
{ const jb = document.getElementById('mmJump'); if (jb) jb.addEventListener('click', e => { const b = e.target.closest('button[data-j]'); if (b) { jumpTo(b.dataset.j); if (b.classList.contains('locked')) { const h = fogHint(b.dataset.j); if (h) say(h); } } }); }
Object.assign(window.__farm, { jumpTo, jumpSpot, waterReset: () => { WG = { pond: null, sea: null }; }, waterGeomOf: k => WG[k] }); // v5.11.0.3: tools/coast-shots.js
Object.assign(window.__farm, { aimAt, commitAt, canStore, storeThing, movableAt: (x, y) => movableAt(x, y), keptOf: id => keptOf(id), setTouch: o => { if (o && typeof o.slop === 'number') TOUCH.slop = Math.max(1, o.slop); if (o && typeof o.pickCss === 'number') TOUCH.pickCss = Math.max(0, o.pickCss); if (o && 'onTap' in o) TOUCH.onTap = typeof o.onTap === 'function' ? o.onTap : null; return { slop: TOUCH.slop, pickCss: TOUCH.pickCss, onTap: !!TOUCH.onTap }; } }); // v5.11.0.2
window.__farm.art = { models, pasture: pastureModels, props, stackCanvas, SPR, ALLM }; // v5.11.0.9 test hook: tools/scale-audit.js renders every building beside a grown-up
Object.assign(window.__farm, { FG, fog: () => ({ on: FOG.on, init: FOG.init, shut: FOG.shut && Object.assign({}, FOG.shut), locked: FOG.L && Object.assign({}, FOG.L), road: FOG.road, fading: FOG.fading, empty: FOG.empty, lockA: Object.assign({}, FOG.lockA), key: FOG.key }), fogUpdate: f => fogUpdate(f), fogZone, fogHint, fogTap: (x, y) => fogTap({ x, y }), fogSet: on => { FOG.on = !!on && !!FG; fogReset(); MM.base = null; }, fogHid: (x, y) => fogHid(x, y), fogVeil: on => { FOG.veil = !!on; MM.base = null; }, fogPeek: on => { FOG.peek = !!on; FOG.scrKey = ''; }, fogClock: t => { FOG.clock = t == null ? null : +t; }, fogHidden: () => FOG.hidN | 0,
  fogScribble: () => { const g = groundBase.getContext('2d'), B = FG.BOUNDS; if (!FOG.unscr) FOG.unscr = g.getImageData(0, 0, GW, GH); g.save(); for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#ff00ff' : '#00ffff'; g.fillRect((B[0] - GX0) * RS + i * 30, (B[1] - GY0) * RS, 14, (B[3] - B[1]) * RS); } g.restore(); MM.base = null; }, fogUnscribble: () => { if (FOG.unscr) { groundBase.getContext('2d').putImageData(FOG.unscr, 0, 0); FOG.unscr = null; MM.base = null; } }, fogAlpha: (x, y) => { if (!FOG.A) return 0; const B = FG.BOUNDS, i = Math.min(FG.GW - 1, Math.floor((x - B[0]) / FG.CELL)), j = Math.max(0, Math.floor((y - B[1]) / FG.CELL)); return i < 0 || j >= FG.GH ? 0 : FOG.A[j * FG.GW + i] / 255; }, fogCell: (x, y) => { if (!FOG.F) return 0; const B = FG.BOUNDS, i = Math.floor((x - B[0]) / FG.CELL), j = Math.floor((y - B[1]) / FG.CELL); if (i < 0 || j >= FG.GH) return 0; return FOG.F[Math.max(j, 0) * FG.GW + Math.min(i, FG.GW - 1)]; } /* past the north / east edge the shade carries on, as drawn */ }); // v5.11.0.6 test hooks
if (MANUAL) { render(); hud(); } else requestAnimationFrame(frame);
})();
