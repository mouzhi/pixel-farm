// 像素堆叠 · 放置农场 v3 · 风格 A —— all art is generated in code: voxel functions -> slices (sprite stacking),
// plus a hand-authored 2D billboard farmer (the usual hybrid in sprite-stacking games).
'use strict';
(() => {
// ---------- config ----------
const W = 426, H = 266;          // low-res framebuffer, integer upscaled (3x on 1280x800)
const RS = 2;                    // screen px per world unit: one 8-unit tile = 16 px, the classic 16-bit tile
const K = 0.75;                  // vertical squash (camera tilt)
const TILE = 8, COLS = 24, ROWS = 16, WW = COLS * TILE, WH = ROWS * TILE;
const M = 40;                    // forest margin around the home farm (world units)
const AN = window.PFAnimals; // v4.5: animal care rules
const WD = window.PFWorld, WORLD = WD.WORLD; // v4.3: the big map (64 x 40 tiles); the farm keeps its 0..192 x 0..128 coordinates
const GM = 28, GX0 = WORLD.x0 - GM, GY0 = WORLD.y0 - GM; // the ground canvas covers the whole world plus a margin
const Q = new URLSearchParams(location.search);
let SPEED = +Q.get('speed') || 1;
const MANUAL = Q.has('manual');
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
const PIXK = { d: G[1], m: G[2], g: G[3], l: G[4], h: G[5], w: Wd[1], b: Wd[2], t: Wd[3], s: Wd[4], k: Wd[5], c: Ac[0], y: Ac[1], o: Ac[2], p: Ac[3], r: Rf[2], R: Rf[3], e: St[2], E: St[3], a: Wt[3], A: Wt[5], u: Wt[2], i: Ink[0] };
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
function win(u, v, u0, v0, s = 10) { // window on a wall: u along the wall, v = z
  const du = u - u0, dv = v - v0; if (du < 0 || du >= s || dv < 0 || dv >= s) return null;
  if (du <= 1 || du >= s - 2 || dv <= 1 || dv >= s - 2) return Ac[0];
  if (du === (s >> 1)) return Ac[0];
  return (du >= 2 && du <= 3 && dv >= s - 5) ? Wt[5] : Wt[3];
}
const HOUSE_DIM = { w: 70, d: 58, chim: [53, 20, 74] }; // chimney top (model px) for the smoke
function houseModel() {
  const { w, d } = HOUSE_DIM, X0 = 8, X1 = 61, Y0 = 8, Y1 = 49, ZW = 34;
  const roof = { z0: ZW + 1, pitch: 0.92, x0: 3, x1: 66, y0: 4, y1: 53, fy0: Y0, fy1: Y1, base: Rf[2], line: Rf[1], ridge: Rf[1], trim: Wd[2] };
  return buildModel(w, d, 76, (x, y, z) => {
    if (x >= 51 && x <= 56 && y >= 17 && y <= 23 && z >= 44 && z <= 74) return z >= 72 ? St[1] : (z % 6 === 0 ? St[1] : St[2]);   // chimney
    if (z <= 2 && x >= X0 - 1 && x <= X1 + 1 && y >= Y0 - 1 && y <= Y1 + 1) return (z === 2 || (x + 2 * Math.floor(z / 2)) % 7) ? St[2] : St[1];
    if (z <= 1 && y > Y1 + 1 && y <= Y1 + 4 && x >= 28 && x <= 41) return St[3];                                                    // step
    if (y >= Y1 + 1 && y <= Y1 + 2 && z >= 8 && z <= 11 && ((x >= 13 && x <= 24) || (x >= 45 && x <= 56)))                          // flower boxes
      return z === 11 ? ((x % 3 === 0) ? Ac[3] : (x % 3 === 1) ? G[3] : Ac[1]) : Wd[2];
    if (z >= 3 && z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y >= Y1 - 1, back = y <= Y0 + 1, sideL = x <= X0 + 1, sideR = x >= X1 - 1;
      if (!(front || back || sideL || sideR)) return Wd[4];
      if ((sideL || sideR) && (front || back)) return Wd[2];                                  // corner posts
      if (z >= ZW - 1) return Wd[2];                                                        // eave beam
      if (front) {
        if (x >= 29 && x <= 40 && z <= 24) { if (x <= 30 || x >= 39 || z >= 23) return Wd[1]; if (x === 37 && z === 13) return Ac[1]; return x === 34 || x === 35 ? Wd[1] : Wd[2]; }
        const wv = win(x, z, 13, 12) || win(x, z, 47, 12); if (wv) return wv;
      }
      if (sideL || sideR) { const wv = win(y, z, 24, 12); if (wv) return wv; }
      if (back) { const wv = win(x, z, 30, 12); if (wv) return wv; }
      return (z - 3) % 5 === 4 ? Wd[3] : Wd[4];                                              // plank courses
    }
    const r = gableY(x, y, z, roof);
    if (r === 'fill') { if (y >= Y1 - 1 || y <= Y0 + 1) { const wv = win(x, z, 30, 43); if (wv) return wv; } return (z - 3) % 5 === 4 ? Wd[3] : Wd[4]; }
    return r;
  });
}
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
function pineTier(r, ramp, seed) { // one branch tier: a wide, drooping triangle with a jagged, needly lower edge
  const key = 'P' + r + ramp + seed; let o = discC.get(key); if (o) return o;
  const Rm = TREE_RAMPS[ramp], ht = Math.round(r * 0.6), w = 2 * r + 1, h = ht + 6;
  const c = mkc(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = new Uint32Array(img.data.buffer);
  for (let x = -r; x <= r; x++) { const ax = Math.abs(x) / r, top = Math.round(ht * Math.pow(ax, 0.85)), ph = (x + seed + 99) % 3;
    const bot = ht + 1 + Math.round(ax * ax * 2) + (ph === 0 ? 2 : ph === 1 ? 1 : 0) - (ax > 0.92 ? 1 : 0);
    for (let y = top; y <= Math.min(h - 1, bot); y++) { const rel = (y - top) / Math.max(1, bot - top);
      let L = 0.78 - rel * 0.85 - (x / r) * 0.4;
      if (rel > 0.15 && ((Math.abs(x) + y) % 3 === 0)) L -= 0.2;      // needle streaks, sloping down and out
      let t = L > 0.55 ? 0 : L > 0.3 ? 1 : L > 0.02 ? 2 : 3;
      if (y >= bot - 0) t = Math.max(t, 3);
      if (y === top && x <= 0) t = Math.min(t, 1);
      d[y * w + x + r] = u32(Rm[t]); } }
  g.putImageData(img, 0, 0); o = { c, rx: r, ry: ht }; discC.set(key, o); return o;
}
function clumpSprite(p) { return p.tier ? pineTier(p.r, p.ramp, p.seed) : leafSprite(p.r, p.ramp, p.seed, p.inside, p.berries, p.sh || 0); }
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
function pineDef(seed, ramp = 'pine', sc = 1) {
  const r = mulberry32(seed), parts = [], discs = [], H = Math.round((62 + r() * 16) * sc), n = 5 + Math.floor(r() * 2), R0 = (16 + r() * 4) * sc;
  parts.push(part([-2, 2, -2, 2, 0, H - 6], (x, y, z) => Math.max(Math.abs(x + 0.5), Math.abs(y + 0.5)) <= 1.6 ? Wd[1] : null));
  const base = 10 * sc, step = (H - 8 - base) / n;
  for (let i = 0; i < n; i++) { const up = (i + 0.5) / n;
    discs.push({ ox: 0, oy: 0, cz: Math.round(base + i * step), r: Math.max(4, Math.round(R0 * (1 - i / (n + 0.6)) + 2)), ramp, seed: (seed + i) % 3, tier: 1, w: up > 0.62 ? 0.2 + 0.25 * up : 0 }); }
  discs.push({ ox: 0, oy: 0, cz: Math.round(base + n * step), r: 3, ramp, seed: 1, tier: 1, w: 0.4 });
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
const shMask = new Uint32Array(W * H);
const shC = mk(W, H), sctx = shC.getContext('2d');
const litC = mk(W, H), lctx = litC.getContext('2d'); const litImg = lctx.createImageData(W, H);
const GW = Math.ceil((WORLD.x1 - WORLD.x0 + 2 * GM) * RS), GH = Math.ceil((WORLD.y1 - WORLD.y0 + 2 * GM) * RS);
const groundBase = mk(GW, GH);
[ctx, sctx].forEach(c => c.imageSmoothingEnabled = false);
let zoom = 0; // extra integer zoom steps from the mouse wheel (CSS scale only, so pixels stay square)
function fit() { // largest whole multiple of the buffer in *device* pixels, placed on a whole device pixel (letterboxed)
  const dpr = window.devicePixelRatio || 1, vw = Math.floor(innerWidth * dpr), vh = Math.floor(innerHeight * dpr);
  const base = Math.max(1, Math.floor(Math.min(vw / W, vh / H))), s = base + zoom;
  const wrap = document.getElementById('wrap'), left = Math.floor((vw - W * s) / 2), top = Math.floor((vh - H * s) / 2);
  wrap.style.left = left / dpr + 'px'; wrap.style.top = top / dpr + 'px';
  cv.style.width = W * s / dpr + 'px'; cv.style.height = H * s / dpr + 'px';
  const css = base / dpr; document.getElementById('hud').style.fontSize = (css >= 4 ? 16 : css >= 3 ? 14 : 12) + 'px';
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
const FIELD = { c0: 9, r0: 7, cols: 6, rows: 4 }; // tiles x 72..120, y 56..88
const props = [];
const addProp = (m, x, y, rot = 0, o = {}) => { const p = Object.assign({ m, x, y, rot, z: 0 }, o); props.push(p); return p; };
const models = {
  house: houseModel(), barn: barnModel(), stallB: stallModel('back'), stallF: stallModel('front'), well: wellModel(), fence: fenceModel(),
  rocks: [1, 2, 3].map(s => rockModel(s * 31)), branches: [1, 2].map(s => branchModel(s * 17)), pebbles: [1, 2].map(s => pebbleModel(s * 43)), weeds: SPRITES.weed,
  soil: [soilModel(false), soilModel(true)],
};
addProp(models.house, HOUSE.x, HOUSE.y, 0, { big: 1 });
addProp(models.barn, BARN.x, BARN.y, 0, { big: 1 });
addProp(models.stallB, STALL.x, STALL.y, 0, { big: 1, dy: -4.5 });
addProp(models.stallF, STALL.x, STALL.y, 0, { big: 1, dy: 3.5 });
addProp(models.well, WELL.x, WELL.y, 0);
addProp(benchModel, BENCH.x, BENCH.y, 0);
addProp(hayModel, 182, 46, 0.3); addProp(crateModel, 134, 44, 0.2); addProp(logsModel, 64, 22, 0.15);
addProp(mailModel, 16, 45, 0); addProp(crateModel, 178, 110, 0.1); addProp(hayModel, 140, 118, 1.2);
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
addTree(treeDefs.oak[0], 22, 84); addTree(treeDefs.pine[1], 44, 82); addTree(treeDefs.birch[0], 8, 96); addTree(treeDefs.small[0], 6, 62); // by the pond
[[58, 40], [12, 44], [134, 66], [56, 80], [182, 52], [112, 114], [86, 116], [132, 103]].forEach(([x, y], i) => addTree(treeDefs.bush[i % 3], x, y));
POND_SOLIDS.push({ x: POND.x + 11, y: POND.y + 5, r: 6 });
addProp(mossRock, POND.x + 11, POND.y + 5, 0.6);
// ---------- field ----------
// Pacing, economy, shop and save rules live in sim.js and save.js (pure, unit-tested); this block is the farm's state machine.
const SIM = window.PFSim, CROP_IDS = SIM.IDS;
const tiles = [];
// fields: the home field plus one per farming region (v4.3); c / r are local to their field, f names the field
const FIELDS = [Object.assign({ id: 'home' }, FIELD), ...WD.REGIONS.filter(r => r.field).map(r => Object.assign({ id: r.id }, r.field))];
for (const fd of FIELDS) for (let r = 0; r < fd.rows; r++) for (let c = 0; c < fd.cols; c++) {
  tiles.push({ f: fd.id, c, r, x: (fd.c0 + c) * TILE + TILE / 2, y: (fd.r0 + r) * TILE + TILE / 2, open: fd.id === 'home' && SIM.isOpen(c, r, 0), debris: null, weed: null, tilled: false, crop: null, watered: false });
}
const tileOpen = (t, eff) => t.f === 'home' ? SIM.isOpen(t.c, t.r, eff.field) : eff.regions.includes(t.f);
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
tiles.forEach(t => spawnClutter(t, t.f === 'home' ? 0.34 : 0.5, t.f === 'home' ? 0.42 : 0.4)); // the new fields start overgrown
// yard clutter lives off the field (grass and dirt around the farm). It is saved as { type, v, rot, x, y }.
const YARD_CAP = 18, YARD_START = 26, YARD_TYPES = ['weed', 'weed', 'weed', 'rock', 'rock', 'branch', 'branch', 'pebble'];
const yard = [];
const clutterModel = d => { const a = d.type === 'rock' ? models.rocks : d.type === 'pebble' ? models.pebbles : models.branches; return a[d.v % a.length]; };
function yardSpotOk(x, y) {
  if (x < 10 || x > WW - 8 || y < 18 || y > WH + 6) return false;
  if (Math.max(-x, x - WW, -y, y - WH, 0) > 8) return false;
  if (groundAt(x, y)[1] === 'water') return false;
  if (pathD(x, y) < 5.2) return false;
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
const S = {
  day: 1, t: WAKE, coins: 0, soldToday: 0, totalSold: 0, cleared: 0, earned: 0, todayEarn: 0, dayEarn: [],
  store: Object.assign(SIM.emptySeeds(), { carrot: 2 }), prices: SIM.startPrices(), waterMax: SIM.WATER_MAX0, createdAt: Date.now(),
  up: SIM.emptyUpgrades(), eff: SIM.effects({}), speed: 1, // shop levels, what they add up to, chosen game speed (1 / 2 / 4)
  farmer: { x: DOOR.x, y: DOOR.y, fx: 0, fy: 1, home: true, sleeping: false, task: null, bag: SIM.emptySeeds(), gathered: 0, crops: [], water: 0, walkPhase: 0, idleCount: 0, act: 0, wood: 0, saplings: { apple: 0, orange: 0 } },
  log: [], events: [], label: '起床',
  flow: { weed: 0, harvest: 0, bought: 0, boughtGold: 0, sold: 0, soldGold: 0 }, // seed flow since the page opened (diagnostics, not saved)
  trees: WD.defaultTrees(), orders: [], // v4.3: forest / fruit trees with their state; the player's chop and transplant orders
  animals: [], trough: { feed: 0, water: 0 }, hay: 0, // v4.5: the pasture's animals, its trough, bales of hay in the barn
};
Object.assign(S.prices, { egg: 1, wool: 1, milk: 1 }); // animal products drift like crops
const PASTURE = WD.region('pasture'), TROUGH_SPOT = { x: PASTURE.trough.x - 9, y: PASTURE.trough.y + 2 }, COOP_DOOR = { x: PASTURE.coop.x + 1, y: PASTURE.coop.y + 14 };
const AV = new Map(); // animal id -> its view (position, walk target, pose); positions are not saved
const F = S.farmer;
const particles = [];
let groundDirty = true;
const fmtT = t => { const m = ((Math.floor(t) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function log(msg) { S.log.unshift(fmtT(S.t) + ' ' + msg); S.log.length = Math.min(S.log.length, 4); S.events.push({ day: S.day, t: Math.floor(S.t), msg }); if (S.events.length > 300) S.events.splice(0, S.events.length - 300); }
// routes: inside one area the farmer walks straight; between areas he follows the road through the region's gate
const areaOf = p => WD.areaAt(p.x, p.y) || 'home';
function routeVia(a, b) {
  const A = areaOf(a), B = areaOf(b); if (A === B) return [];
  const out = A !== 'home' && WD.ROUTES[A] ? WD.ROUTES[A].slice().reverse() : [];
  if (B !== 'home' && WD.ROUTES[B]) out.push(...WD.ROUTES[B]);
  return out.map(p => ({ x: p.x, y: p.y }));
}
function travel(a, b) { let d = 0, p = a; for (const q of routeVia(a, b)) { d += Math.hypot(q.x - p.x, q.y - p.y); p = q; } return d + Math.hypot(b.x - p.x, b.y - p.y); }
const rngNear = (list) => { let best = null, bd = 1e9; for (const t of list) { const d = travel(F, t) + Math.abs(t.y - F.y) * 0.01; if (d < bd) { bd = d; best = t; } } return best; };
const waterSpots = () => [WELL_SPOT, ...WD.REGIONS.filter(r => r.barrel && S.eff.regions.includes(r.id)).map(r => ({ x: r.barrel.x, y: r.barrel.y + 8 }))];
const standAt = t => ({ x: t.x - 7, y: t.y + 1 }); // stand beside the tile, so work poses show in profile
const seedCount = o => CROP_IDS.reduce((n, k) => n + (o[k] || 0), 0);
const seedText = o => CROP_IDS.filter(k => o[k] > 0).map(k => `${SIM.CROPS[k].name}×${o[k]}`).join('、');
let onMorning = () => {};
function syncAnimals() { // the shop says how many of each kind; new ones arrive at their building
  for (const k of AN.KIND_IDS) { const want = (S.eff.animals || {})[k] || 0; let have = S.animals.filter(a => a.kind === k);
    while (have.length > want) { const a = have.pop(); S.animals.splice(S.animals.indexOf(a), 1); AV.delete(a.id); }
    for (let i = have.length; i < want; i++) { let n = i; while (S.animals.some(a => a.id === k + n)) n++; S.animals.push(AN.animal(k + n, k)); } }
  if (typeof syncPastureProps === 'function') syncPastureProps();
}
function applyUpgrades() { // shop levels -> farm: capacity, speed, open tiles
  S.eff = SIM.effects(S.up); S.waterMax = S.eff.waterMax;
  for (const t of tiles) if (!t.open && tileOpen(t, S.eff)) t.open = true;
  if (S.speed > S.eff.speedMax) S.speed = S.eff.speedMax;
  syncAnimals();
  groundDirty = true;
  if (typeof syncRegionProps === 'function' && OPEN_REGIONS.join() !== S.eff.regions.join()) { OPEN_REGIONS = S.eff.regions.slice(); syncRegionProps(); if (groundReady) buildGroundBase(); }
}
function buy(id) { // the player's one action: spend gold on the next level of a shop item
  const o = SIM.offer(S.up, S.coins, id);
  if (!o || o.maxed) return { ok: false, reason: 'maxed' };
  if (o.locked) return { ok: false, reason: 'locked', needs: o.locked };
  if (!o.ok) return { ok: false, reason: 'short', short: o.short };
  S.coins -= o.cost; S.up[id] = o.have + 1; applyUpgrades();
  log(`买下了${o.item.name}：${o.level.label}（${o.cost} 金）`); popText(F.x, F.y, 22, '-' + o.cost, '#ffd76a'); burst(F.x, F.y, 14, ['#ffd76a', '#fff2a8'], 10, 'coin');
  if (id === 'field') log('新的田地开放了，农夫会去清理');
  if (o.item.region) log(`${o.item.name}的篱笆门打开了`);
  if (id === 'coop' || id === 'shed') log(`${o.item.name}盖好了`);
  if (AN.KINDS[id]) log(`一只${AN.KINDS[id].name}住进了牧场`);
  return { ok: true, offer: o };
}

// ---------- farmer AI: task board + scoring ----------
// Every system posts the jobs it has (with a target and a base priority) to a board; the farmer takes the job with the best
// score = base priority - walking distance / 8. Hard rules (night, a full basket) come first. Picking the nearest target per
// kind makes him work along a row instead of zigzagging. Later, helpers will read the same board and claim tiles.
function storeTask() { return { kind: 'store', label: '正在把种子放进仓库', to: BARN_DOOR, dur: 8, done: () => { log(`把 ${F.gathered} 颗胡萝卜种子放进仓库`); S.store.carrot += F.gathered; F.gathered = 0; } }; }
function homeTask() { return { kind: 'home', label: '回家睡觉', to: DOOR, dur: 5, done: () => { F.home = true; F.sleeping = true; log('回到家，躺下睡觉 Zzz'); } }; }
function board() {
  const T = S.t % 1440, E = S.eff, out = [];
  const post = (kind, base, at, make) => out.push({ kind, base, at, make });
  const open = tiles.filter(t => t.open);
  const ripe = open.filter(t => t.crop && SIM.ripe(t.crop));
  const dry = open.filter(t => t.crop && !SIM.ripe(t.crop) && !t.watered);
  const debris = open.filter(t => t.debris), weeds = open.filter(t => t.weed);
  const tilledEmpty = open.filter(t => t.tilled && !t.crop && !t.weed);
  const tillable = open.filter(t => !t.tilled && !t.crop && !t.debris && !t.weed);
  const bagN = seedCount(F.bag), storeN = seedCount(S.store), full = F.crops.length >= E.basket;
  if (ripe.length && !full) { const t = rngNear(ripe); post('harvest', 90, t, () => harvestTask(t)); }
  if (dry.length) { const late = T >= 15 * 60;
    if (F.water <= 0) { const w = rngNear(waterSpots()); post('refill', late ? 95 : 60, w, () => refillTask(w)); }
    else { const t = rngNear(dry); post('water', late ? 96 : 61, t, () => waterTask(t)); } }
  if (tilledEmpty.length && bagN > 0) { const t = rngNear(tilledEmpty); post('plant', 70, t, () => plantTask(t)); }
  else if (tilledEmpty.length && (storeN > 0 || F.gathered > 0)) post('fetch', 68, BARN_DOOR, () => fetchTask(tilledEmpty.length + tillable.length));
  else if (tilledEmpty.length && S.coins >= SIM.CROPS.carrot.seed && T < 17 * 60) post('buy', 55, STALL_SPOT, sellTask);
  if (weeds.length) { const t = rngNear(weeds); post('weed', 45, t, () => weedTask(t)); }
  if (debris.length) { const t = rngNear(debris); post('clear', 40, t, () => clearTask(t)); }
  if (yard.length) { const c = rngNear(yard); post('tidy', 18, c, () => yardTask(c)); }
  if (F.gathered > 0 && (F.gathered >= 12 || (weeds.length === 0 && (F.gathered >= 4 || T >= 18 * 60)))) post('store', 50, BARN_DOOR, storeTask);
  if (tillable.length && T < 17 * 60) { // the wide hoe aims at the tile whose 3x3 has the most soil to turn
    const t = E.till3 ? tillable.reduce((b, u) => { const v = tillable.filter(w => w.f === u.f && Math.abs(w.c - u.c) <= 1 && Math.abs(w.r - u.r) <= 1).length * 100 - Math.hypot(u.x - F.x, u.y - F.y); return v > b.v ? { t: u, v } : b; }, { t: null, v: -1e9 }).t : rngNear(tillable);
    post('till', 35, t, () => tillTask(t)); }
  // v4.3: fruit to pick, and the player's orders (chop a marked tree, transplant a sapling where he pointed)
  const ripeTrees = S.trees.filter(t => t.stage === 'tree' && t.ripe && WD.FRUIT[t.kind] && treeReachable(t));
  if (ripeTrees.length && F.crops.length + WD.FRUIT.apple.n <= E.basket) { const t = rngNear(ripeTrees); post('pick', 75, t, () => pickTask(t)); }
  const chop = S.orders.filter(o => o.type === 'chop').map(o => S.trees.find(t => t.id === o.id)).filter(t => t && E.axe && WD.choppable(t, E.regions));
  if (chop.length) { const t = rngNear(chop); post('chop', 64, t, () => chopTask(t)); }
  const plant = S.orders.filter(o => o.type === 'plant' && F.saplings[o.kind] > 0);
  if (plant.length) { const o = rngNear(plant); post('transplant', 64, o, () => transplantTask(o)); }
  // v4.5: the pasture. Hay into the trough in the morning, water, collect eggs / wool / milk, a pat for each animal
  if (S.animals.length) { const need = AN.need(S.animals), space = E.basket - F.crops.length;
    const late = T >= 14 * 60 ? 40 : 0; // a far pasture loses to field work all day on a big farm; by afternoon the night's feed and water win anyway
    if (S.trough.feed < need && S.hay > 0) post('feed', (T < 12 * 60 ? 82 : 66) + late, TROUGH_SPOT, feedTask);
    if (!S.trough.water) { if (F.water >= 2) post('trough', 70 + late, TROUGH_SPOT, troughTask);
      else { const w = rngNear(waterSpots()); post('refill', 62 + late, w, () => refillTask(w)); } }
    const ready = S.animals.filter(a => a.ready > 0);
    const eggs = ready.filter(a => a.kind === 'chicken').reduce((n, a) => n + a.ready, 0);
    if (eggs && space > 0) post('collect', 72, COOP_DOOR, () => eggTask());
    const big = ready.filter(a => a.kind !== 'chicken');
    if (big.length && space > 0) { const a = rngNear(big.map(animalSpot)); post('collect', 72, a, () => milkTask(a.an)); }
    const lonely = S.animals.filter(a => !a.pet);
    if (lonely.length && T < 18 * 60) { const a = rngNear(lonely.map(animalSpot)); post('pet', 26, a, () => petTask(a.an)); }
    const short = S.hay + S.trough.feed < need; // tonight's feed is not covered: buying hay beats almost everything
    if (S.hay < need * 2 && S.coins >= AN.HAY.price * need && (short || T < 17 * 60)) post('hay', short ? 80 + late : 54, STALL_SPOT, sellTask);
  }
  if (F.crops.length || F.wood) {
    const busy = ripe.length || dry.length || (tilledEmpty.length && bagN);
    const base = full ? 100 : T >= 17.5 * 60 ? 80 : F.crops.length >= E.basket * 0.6 || F.wood >= 20 ? 58 : !busy ? 30 : 0;
    if (base) post('sell', base, STALL_SPOT, sellTask);
  }
  return out;
}
function chooseTask() {
  const T = S.t % 1440;
  if (T >= BEDTIME || T < WAKE - 30) {
    if (F.crops.length && T < BEDTIME + 60) return sellTask();
    if (F.gathered > 0 && T < BEDTIME + 60) return storeTask();
    return homeTask();
  }
  let best = null, bs = -Infinity;
  for (const j of board()) { const s = j.base - travel(F, j.at) / 8; if (s > bs) { bs = s; best = j; } }
  if (best) { F.idleCount = 0; const k = best.make(); k.kind = best.kind; return k; }
  // nothing on the board: rest or stroll
  F.idleCount++;
  if (F.idleCount % 3 === 0) { const t = pick(tiles.filter(t => t.open)); return { kind: 'idle', label: '在田边巡视', to: { x: t.x + R(-6, 6), y: FIELD.r0 * TILE - 4 }, dur: 6 }; }
  return { kind: 'idle', label: '坐在池塘边休息', to: BENCH_SPOT, dur: 25, rest: true };
}
function harvestTask(t) {
  return { label: '正在收获', to: standAt(t), tile: t, dur: 4, fx: 'leaf', pose: 'pull', done: () => {
    if (!t.crop || !SIM.ripe(t.crop) || F.crops.length >= S.eff.basket) return;
    const ty = t.crop.type, c = SIM.CROPS[ty]; F.crops.push(ty); groundDirty = true;
    burst(t.x, t.y, 4, ['#f0a030', '#8fd35a', '#ffffff'], 8, 'harvest'); popText(t.x, t.y, 12, '+1', '#ffffff');
    if (c.regrow && (t.crop.n || 0) + 1 < c.harvests) { t.crop.n = (t.crop.n || 0) + 1; t.crop.age = c.days - c.regrow; t.crop.stage = SIM.stageOf(t.crop); log(`摘了一个${c.name}（第 ${t.crop.n} 次）`); return; }
    t.crop = null;
    const n = SIM.harvestSeeds(ty, rand); if (n) { F.bag[ty] += n; S.flow.harvest += n; popText(t.x + 3, t.y, 16, `+${n}种`, '#e6c35c'); }
    log(`收获了一个${c.name}` + (n ? `，留下 ${n} 颗种子` : ''));
  } };
}
function refillTask(w = WELL_SPOT) { const well = w === WELL_SPOT; return { label: well ? '正在井边打水' : '正在水桶边打水', to: w, dur: well ? 8 : 6, fx: 'water', done: () => { F.water = S.waterMax; log(`在${well ? '井边' : '水桶边'}装满了水壶（${S.waterMax} 格）`); } }; }
function waterTask(t) {
  return { label: '正在浇水', to: standAt(t), tile: t, dur: 3, fx: 'water', pose: 'water', done: () => { if (t.watered || F.water <= 0 || !t.crop) return; F.water--; t.watered = true; groundDirty = true; burst(t.x, t.y, 6, ['#8cc6dc', '#5b9cc4'], 10, 'drop'); } };
}
function plantTask(t) {
  const ty = SIM.pickFromBag(F.bag, S.prices);
  return { label: `正在播种${SIM.CROPS[ty].name}`, to: standAt(t), tile: t, dur: 3, fx: 'seed', pose: 'pull', done: () => { if (t.crop || !t.tilled || F.bag[ty] <= 0) return; F.bag[ty]--; t.crop = { type: ty, age: 0, n: 0, stage: 0, rot: R(0, 6.28) }; groundDirty = true; } };
}
function fetchTask(need) { // take the best seeds from the barn first
  return { label: '正在从仓库取种子', to: BARN_DOOR, dur: 5, done: () => {
    if (F.gathered > 0) { S.store.carrot += F.gathered; F.gathered = 0; }
    const order = CROP_IDS.slice().sort((a, b) => SIM.netPerDay(b, S.prices, true) - SIM.netPerDay(a, S.prices, true)), took = SIM.emptySeeds();
    let left = need; for (const k of order) { const m = Math.min(left, S.store[k]); S.store[k] -= m; F.bag[k] += m; took[k] = m; left -= m; if (left <= 0) break; }
    log(`从仓库取出种子：${seedText(took) || '没有了'}`);
  } };
}
function weedTask(t) {
  return { label: '正在拔草收集种子', to: standAt(t), tile: t, dur: 6, fx: 'leaf', pose: 'pull', done: () => { if (!t.weed) return; t.weed = null; const n = RI(2, 3); F.gathered += n; S.flow.weed += n; burst(t.x, t.y, 3, ['#5a9a3a', '#e6c35c', '#3f7a32'], 10, 'weed'); popText(t.x, t.y, 10, '+' + n, '#e6c35c'); if (S.eff.regions.includes('pasture') && S.hay < AN.HAY.stock) S.hay++; log(`拔掉杂草，收集到 ${n} 颗种子`); } };
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
    yard.splice(i, 1); S.cleared++;
    const yr = yardRng(S.cleared * 2654435761 + S.day * 374761393);
    if (c.type === 'weed' && yr() < 0.7) { F.gathered++; S.flow.weed++; popText(c.x, c.y, 10, '+1', '#e6c35c'); }
    else {
      // early-game gold comes from the yard (day 1 has no harvest). Rocks always pay, branches and pebbles often do;
      // a full first-day sweep is about 12–18 gold, later nightly spawns stay small so mid-game is barely affected.
      let g = 0;
      if (c.type === 'rock') g = yr() < 0.4 ? 2 : 1;
      else if (c.type === 'branch' && yr() < 0.7) g = 1;
      else if (c.type === 'pebble' && yr() < 0.4) g = 1;
      if (g) { S.coins += g; S.earned += g; S.todayEarn += g; popText(c.x, c.y, 12, '+' + g, '#ffd76a'); }
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
    const n = Math.min(WD.pickFruit(t), S.eff.basket - F.crops.length); if (!n) return;
    for (let i = 0; i < n; i++) F.crops.push(t.kind); treeChanged(t);
    burst(t.x, t.y, 20, t.kind === 'apple' ? [Rf[2], Rf[3]] : [Ac[2], Ac[1]], 8, 'harvest'); popText(t.x, t.y, 30, '+' + n, '#ffffff'); log(`摘了 ${n} 个${fr.name}`);
  } };
}
function chopTask(t) {
  return { label: '正在砍树', to: treeStand(t), tile: t, dur: 20, fx: 'wood', pose: 'hoe', done: () => {
    S.orders = S.orders.filter(o => !(o.type === 'chop' && o.id === t.id));
    if (t.stage !== 'tree' || t.kind !== 'wild') return;
    const y = WD.chopYield(rand); t.stage = 'stump'; t.age = 0; treeChanged(t);
    F.wood += y.wood; F.saplings[y.sapling]++;
    burst(t.x, t.y, 6, [Wd[3], Wd[4], G[3]], 16, 'wood'); popText(t.x, t.y, 20, '+' + y.wood, '#e0b880');
    log(`砍倒一棵树：木材 ${y.wood} 份，${WD.FRUIT[y.sapling].name}树苗 1 棵`);
  } };
}
function transplantTask(o) {
  return { label: `正在移植${WD.FRUIT[o.kind].name}树苗`, to: { x: o.x - 7, y: o.y + 1 }, tile: o, dur: 12, fx: 'dirt', pose: 'hoe', done: () => {
    if (F.saplings[o.kind] <= 0 || !S.orders.includes(o)) return;
    S.orders = S.orders.filter(q => q !== o); F.saplings[o.kind]--;
    const t = { id: 'p' + S.day + '_' + Math.floor(S.t % 1440) + '_' + S.trees.length, x: o.x, y: o.y, kind: o.kind, v: S.trees.length % 3, stage: 'sapling', age: 0, ripe: 0, cd: 0 };
    S.trees.push(t); treeChanged(t); burst(o.x, o.y, 6, ['#8cc6dc', '#5b9cc4'], 10, 'drop');
    log(`种下一棵${WD.FRUIT[o.kind].name}树苗，浇了第一次水（${WD.SAPLING_DAYS} 天后结果）`);
  } };
}
// ---- v4.5 pasture tasks ----
const animalSpot = a => { const v = AV.get(a.id); return { x: v ? v.x : PASTURE.center.x, y: v ? v.y : PASTURE.center.y, an: a }; };
function feedTask() {
  return { label: '正在往饲料槽里添干草', to: TROUGH_SPOT, tile: PASTURE.trough, dur: 6, fx: 'hay', pose: 'pull', done: () => {
    const n = Math.min(S.hay, AN.need(S.animals) - S.trough.feed); if (n <= 0) return;
    S.hay -= n; S.trough.feed += n; burst(PASTURE.trough.x, PASTURE.trough.y, 4, [Ac[1], Wd[4], Ac[2]], 8, 'leaf'); log(`往饲料槽添了 ${n} 份干草（仓库还剩 ${S.hay} 份）`); } };
}
function troughTask() {
  return { label: '正在给水槽加水', to: TROUGH_SPOT, tile: PASTURE.trough, dur: 5, fx: 'water', pose: 'water', done: () => {
    if (F.water < 2 || S.trough.water) return; F.water -= 2; S.trough.water = 1; burst(PASTURE.trough.x, PASTURE.trough.y, 4, ['#8cc6dc', '#5b9cc4'], 8, 'drop'); log('给牧场的水槽加满了水'); } };
}
function eggTask() {
  return { label: '正在鸡舍捡鸡蛋', to: COOP_DOOR, tile: PASTURE.coop, dur: 6, fx: 'seed', pose: 'pull', done: () => {
    let n = 0; for (const a of S.animals) if (a.kind === 'chicken') while (a.ready > 0 && F.crops.length < S.eff.basket) { a.ready--; F.crops.push('egg'); n++; }
    if (n) { popText(COOP_DOOR.x, COOP_DOOR.y, 16, '+' + n, '#ffffff'); burst(COOP_DOOR.x, COOP_DOOR.y, 6, [Ac[0], '#fff2a8'], 5, 'spark'); log(`在鸡舍捡了 ${n} 个鸡蛋`); } } };
}
function milkTask(a) {
  const v = AV.get(a.id), cow = a.kind === 'cow';
  if (v) v.hold = 1; // stand still while he works
  const at = v ? { x: v.x - 9 * (v.flip ? -1 : 1), y: v.y + 1 } : PASTURE.center;
  return { label: cow ? '正在挤牛奶' : '正在剪羊毛', to: at, tile: v || PASTURE.center, dur: cow ? 10 : 12, fx: cow ? 'milk' : 'wool', pose: 'pull', done: () => {
    if (v) v.hold = 0; let n = 0; const p = AN.KINDS[a.kind].product;
    while (a.ready > 0 && F.crops.length < S.eff.basket) { a.ready--; F.crops.push(p); n++; }
    if (n) { const pv = v || PASTURE.center; popText(pv.x, pv.y, 18, '+' + n, '#ffffff'); burst(pv.x, pv.y, 6, [Ac[0], St[3]], cow ? 8 : 10, cow ? 'drop' : 'leaf'); log(cow ? `挤了 ${n} 瓶牛奶` : `剪了 ${n} 份羊毛`); } } };
}
function petTask(a) {
  const v = AV.get(a.id); if (v) v.hold = 1;
  const at = v ? { x: v.x - 7, y: v.y + 1 } : PASTURE.center;
  return { label: `正在摸摸${AN.KINDS[a.kind].name}`, to: at, tile: v || PASTURE.center, dur: 4, pose: 'pull', done: () => {
    if (v) { v.hold = 0; hearts(v.x, v.y); } a.pet = 1; } };
}
function hearts(x, y) { for (let i = 0; i < 3; i++) particles.push({ x: x + VR(-3, 3), y, z: 10 + i * 3, vx: VR(-2, 2), vy: 0, vz: 6, c: Ac[3], life: 1.2, kind: 'heart' }); }
const PRODUCT_COL = { egg: [Ac[0], St[3]], wool: [Ac[0], St[3]], milk: [Ac[0], Wt[4]] };
const priceOfAny = ty => WD.FRUIT[ty] ? WD.FRUIT[ty].price : AN.PRODUCTS[ty] ? Math.max(1, Math.round(AN.PRODUCTS[ty].price * (S.prices[ty] || 1))) : SIM.priceOf(ty, S.prices);
// one stop at the stall: sell the whole basket at today's prices and any spare seeds, then buy seeds for the empty tiles
function sellTask() {
  return { label: F.crops.length ? '正在去市场卖菜' : S.animals.length && S.hay < AN.need(S.animals) * 2 ? '正在去市场买干草' : '正在去市场买种子', to: STALL_SPOT, via: Math.hypot(F.x - STALL_SPOT.x, F.y - STALL_SPOT.y) > 3 && F.y < STALL_SPOT.y - 2 ? [{ x: 140, y: Math.min(92, Math.max(F.y, 56)) }, { x: 140, y: STALL_SPOT.y }] : [], dur: 6, fx: 'coin', done: () => {
    const n = F.crops.length, open = tiles.filter(t => t.open);
    let sum = 0; for (const ty of F.crops) { const g = priceOfAny(ty); sum += g; if (WD.FRUIT[ty]) S.fruitGold = (S.fruitGold || 0) + g; if (AN.PRODUCTS[ty]) S.animalGold = (S.animalGold || 0) + g; } F.crops.length = 0;
    if (F.wood) { const g = F.wood * WD.WOOD.price; sum += g; S.woodGold = (S.woodGold || 0) + g; log(`卖出木材 ${F.wood} 份，得 ${g} 金`); F.wood = 0; }
    const sp = SIM.surplusSeeds(F.bag, S.store, open.length);
    if (sp.gold) { for (const k of CROP_IDS) F.bag[k] -= sp.sell[k]; sum += sp.gold; S.flow.sold += seedCount(sp.sell); S.flow.soldGold += sp.gold; log(`卖掉多余的种子：${seedText(sp.sell)}（${sp.gold} 金）`); }
    if (sum) { S.coins += sum; S.earned += sum; S.todayEarn += sum; S.soldToday += n; S.totalSold += n;
      popText(STALL.x + VR(-4, 4), STALL.y - 3, 26, '+' + sum, '#ffd76a'); burst(STALL_SPOT.x, STALL_SPOT.y - 6, 10, ['#ffd76a', '#fff2a8'], 6, 'coin');
      if (n) log(`卖出 ${n} 个作物和水果`); }
    if (S.animals.length) { const need = AN.need(S.animals), want = Math.min(AN.HAY.stock, need * 4) - S.hay, can = Math.floor(S.coins * 0.5 / AN.HAY.price), n = Math.max(0, Math.min(want, can));
      if (n > 0 && S.hay < need * 3) { S.coins -= n * AN.HAY.price; S.hay += n; S.hayGold = (S.hayGold || 0) + n * AN.HAY.price; log(`买了 ${n} 捆干草（${n * AN.HAY.price} 金），放进仓库`); } }
    const need = open.filter(t => !t.crop).length - seedCount(F.bag) - seedCount(S.store) + S.store.carrot;
    if (need > 0) { const p = SIM.planSeeds(S.coins, S.prices, need, S.store.carrot + F.gathered, S.eff.crops);
      if (p.cost > 0) { S.coins -= p.cost; for (const k of CROP_IDS) F.bag[k] += p.buy[k]; S.flow.bought += seedCount(p.buy); S.flow.boughtGold += p.cost; log(`买了种子：${seedText(p.buy)}（${p.cost} 金）`); } }
  } };
}

// ---------- simulation ----------
function overnight() {
  S.day++; S.dayEarn.push(S.todayEarn); if (S.dayEarn.length > 7) S.dayEarn.shift(); S.todayEarn = 0; S.soldToday = 0;
  let grew = 0;
  for (const t of tiles) { // a crop grows one day overnight, only if it was watered that day
    if (t.crop && t.watered && !SIM.ripe(t.crop)) { t.crop.age++; grew++; const st = SIM.stageOf(t.crop); if (st === 3 && t.crop.stage !== 3) burst(t.x, t.y, 6, ['#fff2a8', '#ffffff'], 6, 'spark'); t.crop.stage = st; }
    t.watered = false;
  }
  let n = 0; tiles.forEach(t => { if (t.open && !t.crop && spawnClutter(t, 0.1, 0.14)) n++; });
  const before = yard.length, add = 2 + Math.floor(yardRng(S.day * 668265263)() * 3); // 2..4, without consuming rand()
  if (yard.length < YARD_CAP) fillYard(yardRng(S.day * 2147483647), Math.min(YARD_CAP, yard.length + add));
  const yn = yard.length - before;
  for (const t of S.trees) { const before = t.stage + t.ripe; WD.treeOvernight(t); if (t.stage + t.ripe !== before) treeChanged(t); }
  S.prices = Object.assign(SIM.driftPrices(S.prices, rand), driftProducts(S.prices));
  if (S.animals.length) { const r = AN.overnight(S.animals, S.trough); S.trough = r.trough; const m = r.report.made, t = AN.PRODUCT_IDS.filter(k => m[k]).map(k => `${AN.PRODUCTS[k].name} ${m[k]}`).join('、');
    log((r.report.hungry ? `有 ${r.report.hungry} 只动物没吃饱，` : '') + (t ? `牧场夜里产了：${t}` : '牧场夜里没有新产出')); }
  groundDirty = true; log(`新的一天！${grew} 棵作物长大了，夜里长出 ${n} 处田里杂物` + (yn ? `，院子里又出现 ${yn} 处杂物` : ''));
  onMorning();
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
  if (Math.floor((S.t - WAKE) / 1440) !== prevDay) { // reached 6:00
    if (F.sleeping) { F.sleeping = false; F.home = true; }
    overnight(); log('起床啦，开始干活');
  }
  if (F.sleeping) { S.label = '睡觉中 Zzz'; return; }
  if (!F.task) { F.task = chooseTask(); F.task.work = 0; F.task.via = routeVia(F, F.task.to).concat(F.task.via || []); S.label = F.task.label; if (F.task.label !== '回家睡觉' || !F.home) F.home = false; }
  const k = F.task;
  while (k.via && k.via.length && Math.hypot(k.via[0].x - F.x, k.via[0].y - F.y) <= 0.5) k.via.shift();
  const tgt = (k.via && k.via.length) ? k.via[0] : k.to;
  const dx = tgt.x - F.x, dy = tgt.y - F.y, dist = Math.hypot(dx, dy);
  if (dist > 0.5) { const st = Math.min(dist, WALK * S.eff.walk * dm); F.x += dx / dist * st; F.y += dy / dist * st; F.fx = dx / dist; F.fy = dy / dist; F.walkPhase += st; F.act = 0; F.home = false; F.moving = true; }
  else {
    if (k.tile) { const ex = k.tile.x - F.x, ey = k.tile.y - F.y, el = Math.hypot(ex, ey) || 1; F.fx = ex / el; F.fy = ey / el; }
    k.work += dm; F.act += dm; F.moving = false;
    if (k.fx && Math.random() < dm * 0.5) fxTick(k);
    if (k.work >= k.dur) { k.done && k.done(); F.task = null; }
  }
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
const STK = new Map(), STK_BUDGET = 16e6; let stkPx = 0; // ~64 MB (CPU) of cached stacks at most, least recently used goes first
function stackCanvas(m, a) {
  const map = m._ck || (m._ck = new Map()); let k = map.get(a);
  if (k) { STK.delete(k); STK.set(k, m); return k; }
  k = { a }; map.set(a, k); k.done = () => { k.px = k.c.width * k.c.height; stkPx += k.px; STK.set(k, m);
    while ((stkPx > STK_BUDGET || STK.size > 6000) && STK.size > 1) { const [ok, om] = STK.entries().next().value; STK.delete(ok); om._ck.delete(ok.a); stkPx -= ok.px; ok.c.width = ok.c.height = 0; } };
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
const LANES = { forest: [[100, -38, 100, -60]], east: [[216, 66, 238, 66]], orchard: [[-40, 8, -70, -14]], south: [[68, 150, 68, 176], [68, 176, 78, 176]], pasture: [[216, -40, 263, -40], [263, -40, 263, -26], [248, -40, 248, -62], [263, -40, 300, -40], [300, -40, 300, -60]] };
for (const k in LANES) for (const l of LANES[k]) pathSegs.push(l.concat(k)); // tagged: only painted once the region is open
const routeSegs = []; for (const k in WD.ROUTES) { const r = WD.ROUTES[k]; for (let i = 0; i < r.length - 1; i++) routeSegs.push([r[i].x, r[i].y, r[i + 1].x, r[i + 1].y]); }
const nearRoute = (x, y, d) => routeSegs.some(s => segDist(x, y, s) < d) || Object.values(LANES).some(ls => ls.some(l => segDist(x, y, l) < d));
const pathD = (x, y) => { let pd = 99; for (const s of pathSegs) { if (s[4] && !regionOpen(s[4])) continue; if (Math.abs(x - (s[0] + s[2]) / 2) > Math.abs(s[2] - s[0]) / 2 + 12 || Math.abs(y - (s[1] + s[3]) / 2) > Math.abs(s[3] - s[1]) / 2 + 12) continue; pd = Math.min(pd, segDist(x, y, s)); } return pd; };
const rectOut = (x, y, [x0, y0, x1, y1]) => Math.max(x0 - x, x - x1, y0 - y, y - y1, 0);
let OPEN_REGIONS = []; const regionOpen = id => OPEN_REGIONS.includes(id); // copied from the shop state (S.eff.regions) before the ground is rebuilt
const fieldYard = r => r.field && [r.field.c0 * TILE - 6, r.field.r0 * TILE - 6, (r.field.c0 + r.field.cols) * TILE + 6, (r.field.r0 + r.field.rows) * TILE + 6];
const YARD = { x0: 68, x1: 124, y0: 52, y1: 92 }; // packed-dirt yard around the field (like the mock)
const inYard = (x, y, pad = 0) => x > YARD.x0 - pad && x < YARD.x1 + pad && y > YARD.y0 - pad && y < YARD.y1 + pad;
// ground: flat palette areas only (grass, dirt, water). All texture lives in decals that never rotate, so nothing crawls.
function groundAt(x, y) { // -> [palette colour, kind]
  const e = ((x - POND.x) / POND.rx) ** 2 + ((y - POND.y) / POND.ry) ** 2 + (vnoise(x / 4, y / 4, 11) - 0.5) * 0.34;
  if (e < 1) return [Wt[2], 'water'];           // one flat tone: the layered water is painted over it in screen space (waterPass)
  if (e < 1.3) return [G[3], 'shore'];
  const wob = (vnoise(x / 3, y / 3, 7) - 0.5) * 1.6;
  const pd = pathD(x, y), pw = 4.2 + wob;
  const yd = Math.max(YARD.x0 - x, x - YARD.x1, YARD.y0 - y, y - YARD.y1) + wob * 0.6;
  if (pd < pw || yd < 0) return [(pd > pw - 0.6 && yd > -0.6) ? Wd[3] : Wd[4], 'dirt'];
  // regions: an open region is farm grass (with a packed-dirt yard round its field); a locked one stays a wild meadow
  for (const r of WD.REGIONS) if (WD.inRect(x, y, r.rect)) {
    if (!regionOpen(r.id)) return [vnoise(x / 9, y / 9, 13) > 0.62 ? G[3] : G[2], 'wild'];
    const fy = fieldYard(r); if (fy && rectOut(x, y, fy) === 0) return [Wd[4], 'dirt'];
    return [G[3], 'grass'];
  }
  let out = Math.max(-x, x - WW, -y, y - WH, 0);
  for (const r of WD.REGIONS) out = Math.min(out, rectOut(x, y, r.rect) + 2);
  if (pd < pw + 8) out = Math.min(out, 4);                             // roads keep a strip of open grass beside them
  if (out > 22 + vnoise(x / 7, y / 7, 5) * 12) return [G[1], 'grass']; // forest floor under the tree line
  if (out > 6 + vnoise(x / 6, y / 6, 3) * 8) return [G[2], 'grass'];
  return [G[3], 'grass'];
}
function buildGroundBase() { // one ground pixel per screen pixel (world unit = RS px)
  const g = groundBase.getContext('2d'), img = g.createImageData(GW, GH), d = new Uint32Array(img.data.buffer);
  for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) d[py * GW + px] = u32(groundAt(px / RS + GX0, py / RS + GY0)[0]);
  g.putImageData(img, 0, 0);
  if (window.__farm && window.__farm.onGround) window.__farm.onGround(); // the minimap copies it
}
function buildGround() { groundDirty = false; }
// decals: grass tufts, flowers, pebbles; placed in the world but drawn upright, like billboards lying on the ground
const decals = [];
{ const r = mulberry32(777), blocked = (x, y) => { const k = groundAt(x, y)[1];
    return Math.hypot(x - HOUSE.x, (y - HOUSE.y) * 1.2) < 22 || Math.hypot(x - BARN.x, (y - BARN.y) * 1.2) < 20 || (x > 66 && x < 126 && y > 50 && y < 94 && k !== 'grass'); };
  for (let i = 0; i < 900 && decals.length < 330; i++) { const x = -M * 0.8 + r() * (WW + M * 1.6), y = -M * 0.8 + r() * (WH + M * 1.6); const k = groundAt(x, y)[1];
    if (blocked(x, y)) continue;
    if (k === 'grass') { const v = r(); decals.push({ x, y, c: v < 0.12 ? SPRITES.flowers[Math.floor(r() * 4)] : SPRITES.tufts[Math.floor(r() * 4)] }); }
    else if (k === 'dirt' && r() < 0.25) decals.push({ x, y, c: SPRITES.dirtTufts[Math.floor(r() * 2)] }); }
  [[-10, -3], [-4, 3], [3, -5], [8, 1], [-13, 4]].forEach(([dx, dy], i) => decals.push({ x: POND.x + dx, y: POND.y + dy, c: SPRITES.lily, lily: i, bob: 0 }));
  // v4.3: the rest of the big map (same density); locked meadows get extra flowers so they look worth buying
  const r2 = mulberry32(778), area = (WORLD.x1 - WORLD.x0) * (WORLD.y1 - WORLD.y0);
  for (let i = 0; i < area / 60; i++) { const x = WORLD.x0 + r2() * (WORLD.x1 - WORLD.x0), y = WORLD.y0 + r2() * (WORLD.y1 - WORLD.y0);
    if (x > -M * 0.8 && x < WW + M * 0.8 && y > -M * 0.8 && y < WH + M * 0.8) continue;
    const k = groundAt(x, y)[1], v = r2();
    if (k === 'wild') { if (v < 0.75) decals.push({ x, y, c: v < 0.3 ? SPRITES.flowers[Math.floor(r2() * 4)] : SPRITES.tufts[Math.floor(r2() * 4)] }); }
    else if (k === 'grass' && v < 0.35) decals.push({ x, y, c: v < 0.04 ? SPRITES.flowers[Math.floor(r2() * 4)] : SPRITES.tufts[Math.floor(r2() * 4)] });
    else if (k === 'dirt' && v < 0.1) decals.push({ x, y, c: SPRITES.dirtTufts[Math.floor(r2() * 2)] }); }
}
// ---------- the big map (v4.3): roads cut through the forest rim, wild forest between the clearings, fenced regions ----------
for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (!p.tree) continue;
  if (nearRoute(p.x, p.y, 14) || WD.REGIONS.some(r => WD.inRect(p.x, p.y, r.rect, 10))) props.splice(i, 1); }
{ const fr = mulberry32(5150), P = a => a[Math.floor(fr() * a.length)];
  const kinds = () => P([...treeDefs.dark, ...treeDefs.pine, ...treeDefs.oak, ...treeDefs.olive, ...treeDefs.dark, ...treeDefs.birch]);
  for (let y = WORLD.y0 - 8; y <= WORLD.y1 + 14; y += 17) for (let x = WORLD.x0 - 8; x <= WORLD.x1 + 10; x += 18) {
    const tx = x + (fr() - 0.5) * 9 + ((Math.round(y / 17) & 1) ? 9 : 0), ty = y + (fr() - 0.5) * 7;
    if (tx > -46 && tx < WW + 46 && ty > -46 && ty < WH + 46) continue;                    // the farm's own rim is already there
    if (WD.REGIONS.some(r => WD.inRect(tx, ty, r.rect, 12)) || nearRoute(tx, ty, 13)) continue;
    let d = 1e9; for (const r of WD.REGIONS) d = Math.min(d, rectOut(tx, ty, r.rect)); d = Math.min(d, Math.max(-tx, tx - WW, -ty, ty - WH, 0));
    if (fr() < (d < 50 ? 0.9 : 0.55)) addTree(kinds(), tx, ty);
  }
}
// region fences (gate segments open when the region is bought), a sign with a padlock at each gate, water barrels
const barrelModel = buildModel(10, 10, 12, Object.assign((x, y, z) => { const e = Math.hypot(x + 0.5 - 5, y + 0.5 - 5); if (e > 4.6) return null;
  if (z === 11) return e < 3.6 ? Wt[3] : Wd[3]; return (z === 2 || z === 8) ? St[1] : (e > 3.6 ? Wd[2] : null); }, {}));
const stumpModel = buildModel(10, 10, 6, Object.assign((x, y, z) => { const e = Math.hypot(x + 0.5 - 5, y + 0.5 - 5); if (e > 4.4 - (z === 0 ? -0.6 : 0)) return null;
  if (z === 5) return e < 1.4 ? Wd[3] : e < 3.2 ? Wd[4] : Wd[2]; return Wd[2]; }, {}));
const SIGN = pix(['.bbbbbbbbbbb.', 'bsssssssssssb', 'bsttsssttsssb', 'bsssssssssssb', 'bssttsssttssb', 'bsssssssssssb', '.bbbbbbbbbbb.', '......w......', '......w......', '......w......', '.....www.....']);
const LOCK = pix(['.eee.', 'e...e', 'e...e', 'yyyyy', 'yyiyy', 'yyiyy', 'yyyyy']);
const regionProps = {};
for (const r of WD.REGIONS) { const [x0, y0, x1, y1] = r.rect, list = regionProps[r.id] = [];
  const nearGate = (x, y) => Math.hypot(x - r.gate.x, y - r.gate.y) < 12;
  for (let x = x0; x < x1; x += 8) for (const y of [y0, y1]) { const p = addProp(models.fence, x + 4, y, 0, { region: r.id }); p.gate = nearGate(x + 4, y); list.push(p); }
  for (let y = y0; y < y1; y += 8) for (const x of [x0, x1]) { const p = addProp(models.fence, x, y + 4, Math.PI / 2, { region: r.id }); p.gate = nearGate(x, y + 4); list.push(p); }
  const sign = { spr: SIGN, x: r.sign.x, y: r.sign.y, region: r.id, sign: 1 }; billboards.push(sign); list.push(sign);
  if (r.barrel) addProp(barrelModel, r.barrel.x, r.barrel.y, 0);
}
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
const pastureModels = { coop: coopModel(), shed: shedModel(), trough: [0, 1, 2, 3].map(i => troughModel(i & 1, i & 2)) };
const pasture = { trough: addProp(pastureModels.trough[0], PASTURE.trough.x, PASTURE.trough.y, 0, { region: 'pasture' }), coop: null, shed: null, hay: null };
var PASTURE_READY = true;
function syncPastureProps() { // buildings appear once bought
  if (!PASTURE_READY) return;
  const want = (k, m, at, rot = 0) => { if (S.eff[k] && !pasture[k]) pasture[k] = addProp(m, at.x, at.y, rot, { big: 1 }); };
  want('coop', pastureModels.coop, PASTURE.coop); want('shed', pastureModels.shed, PASTURE.shed);
  if (S.eff.shed && !pasture.hay) pasture.hay = addProp(hayModel, PASTURE.hay.x, PASTURE.hay.y, 0.4);
}
function troughLook() { const m = pastureModels.trough[(S.trough.feed > 0 ? 1 : 0) | (S.trough.water ? 2 : 0)]; if (pasture.trough.m !== m) pasture.trough.m = m; }
// animal sprites face right; frames: [step A, step B, head down]. Same palette and outline as the rest of style A.
const lowerHead = (rows, col, dy) => rows.map((r, y) => r.slice(0, col) + (y - dy >= 0 ? rows[y - dy].slice(col) : '.'.repeat(r.length - col)));
const ANIMAL_ROWS = {
  chicken: [['....rr..', '...cccc.', '...ccico', '.c.cccc.', 'ccccccc.', 'cEccccc.', '.cEEcc..', '..o..o..'], ['....rr..', '...cccc.', '...ccico', '.c.cccc.', 'ccccccc.', 'cEccccc.', '.cEEcc..', '...oo...']],
  sheep: [['..cEcEcEc....', '.ccccccccc...', 'cEcccccccEcww', 'ccccccccccwEw', 'cEccccEcccwww', '.ccccccccc.w.', '..wcccccw....', '..w.w..w.w...'],
          ['..cEcEcEc....', '.ccccccccc...', 'cEcccccccEcww', 'ccccccccccwEw', 'cEccccEcccwww', '.ccccccccc.w.', '..wcccccw....', '...ww...ww...']],
  cow: [['..............k.k', '.bbccccccbbcccccc', 'wbbbcccccbbbcccic', '.cbcccbbcccccccpp', '.ccccbbbcccccc.pp', '.cccccbbccccccc..', '.ccccccccccbccc..', '..cccccpcccccc...', '..cc.cc...cc.cc..', '..cc.cc...cc.cc..', '..ww.ww...ww.ww..'],
        ['..............k.k', '.bbccccccbbcccccc', 'wbbbcccccbbbcccic', '.cbcccbbcccccccpp', '.ccccbbbcccccc.pp', '.cccccbbccccccc..', '.ccccccccccbccc..', '..cccccpcccccc...', '...cccc...cccc...', '...cccc...cccc...', '...wwww...wwww...']],
};
const HEAD_COL = { chicken: 3, sheep: 10, cow: 13 }, HEAD_DY = { chicken: 2, sheep: 2, cow: 3 };
function flipCanvas(c) { const f = mkc(c.width, c.height), g = f.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return f; }
const ANIMAL_SPR = {};
for (const k in ANIMAL_ROWS) { const fr = [...ANIMAL_ROWS[k], lowerHead(ANIMAL_ROWS[k][0], HEAD_COL[k], HEAD_DY[k])].map(r => pix(r)); ANIMAL_SPR[k] = { r: fr, l: fr.map(flipCanvas) }; }
const EGG = pix(['.c.', 'ccc', 'cEc']);
// wandering: walk to a random spot in the kind's patch, stop, graze, repeat; at night stand by the building. Own random stream.
const anRng = mulberry32(99173), ASPEED = { chicken: 1.6, sheep: 1.1, cow: 0.9 };
function animalView(a) { let v = AV.get(a.id); if (!v) { const R0 = PASTURE.roam[a.kind]; v = { x: R0[0] + anRng() * (R0[2] - R0[0]), y: R0[1] + anRng() * (R0[3] - R0[1]), tx: 0, ty: 0, wait: anRng() * 20, flip: anRng() < 0.5, graze: 0, step: 0, hold: 0, id: a.id, sim: a }; v.tx = v.x; v.ty = v.y; AV.set(a.id, v); } return v; }
function stepAnimals(dm) {
  if (!S.animals.length) return;
  const T = S.t % 1440, night = T >= BEDTIME - 30 || T < WAKE;
  for (const a of S.animals) { const v = animalView(a); v.sim = a;
    if (v.hold) { v.graze = 0; continue; }
    if (night) { const home = a.kind === 'chicken' ? COOP_DOOR : { x: PASTURE.shed.x - 10 + (a.id.charCodeAt(a.id.length - 1) % 5) * 5, y: PASTURE.shed.y + 8 }; v.tx = home.x; v.ty = home.y; v.wait = 0; }
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d > 0.4) { const st = Math.min(d, ASPEED[a.kind] * dm); v.x += dx / d * st; v.y += dy / d * st; v.step += st; v.graze = 0;
      const sx = dx * CA - dy * SA; if (Math.abs(sx) > 0.2) v.flip = sx < 0; continue; }
    if (night) { v.graze = 0; continue; }
    v.wait -= dm; v.graze = v.wait > 0 && (Math.floor(v.wait / 6) % 2 === 0);
    if (v.wait <= 0) { const R0 = PASTURE.roam[a.kind], far = anRng() < 0.3;
      v.tx = Math.max(R0[0], Math.min(R0[2], far ? R0[0] + anRng() * (R0[2] - R0[0]) : v.x + (anRng() - 0.5) * 24));
      v.ty = Math.max(R0[1], Math.min(R0[3], far ? R0[1] + anRng() * (R0[3] - R0[1]) : v.y + (anRng() - 0.5) * 14));
      v.wait = 20 + anRng() * 50; }
  }
}
// ---------- trees with a state (v4.3): forest trees to chop, stumps that grow back, transplanted saplings, fruit trees ----------
const FRUIT_COL = { apple: [Rf[2], Rf[3]], orange: [Ac[2], Ac[1]] };
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
  else { o.spr = t.age >= (t.kind === 'wild' ? 5 : 3) ? SAPLING[1] : SAPLING[0]; o.sway = 0.6; }
}
function treeView(t) { let o = TV.get(t.id); if (!o) { o = { x: t.x, y: t.y, rot: 0, z: 0, lean: 0, leanV: 0, tick: (treeN++ % 6) / 6, sim: t }; TV.set(t.id, o); setView(o, t); } return o; }
function treeChanged(t) { const o = TV.get(t.id); if (o) { o.sim = t; setView(o, t); } }
function resetTreeViews() { for (const o of TV.values()) if (o._ck && o._ck.c) o._ck.c.width = o._ck.c.height = 0; TV.clear(); }
function syncRegionProps() { // open gates and take the signs down for bought regions
  for (const id in regionProps) { const open = regionOpen(id);
    for (const p of regionProps[id]) { const want = !(open && (p.gate || p.sign)), arr = p.sign ? billboards : props, i = arr.indexOf(p);
      if (want && i < 0) arr.push(p); else if (!want && i >= 0) arr.splice(i, 1); } }
}
const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000', Z: '111001010100111' };
function pixText(s, x, y, col, sc = 1) {
  const w = s.length * 4 * sc - sc; x = Math.round(x - w / 2); y = Math.round(y);
  for (const pass of [0, 1]) { ctx.fillStyle = pass ? col : Ink[0];
    [...s].forEach((ch, i) => { const g = FONT[ch]; if (!g) return; for (let k = 0; k < 15; k++) if (g[k] === '1') { const gx = x + (i * 4 + k % 3) * sc, gy = y + Math.floor(k / 3) * sc;
      if (pass) ctx.fillRect(gx, gy, sc, sc); else for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(gx + ox, gy + oy, sc, sc); } }); }
}
function dayLight(T) { const h = T / 60; if (h >= 6.3 && h < 17.5) return 0; if (h >= 17.5 && h < 20.5) return (h - 17.5) / 3; if (h >= 20.5 || h < 4.5) return 1; return Math.max(0, 1 - (h - 4.5) / 1.8); }
function warmth(T) { const h = T / 60; const a = Math.max(0, 1 - Math.abs(h - 18.3) / 1.6), b = Math.max(0, 1 - Math.abs(h - 6) / 1.2); return Math.max(a, b * 0.8); }

// ---------- billboards: the farmer and the keeper are flat 2D sprites standing upright at their feet ----------
const SEQ = { hoe: [1, 2, 3, 3, 2, 1], pull: [1, 2, 3, 3, 2], water: [1, 2, 3, 3, 2, 1] };
function farmerPose() {
  const sx = F.fx * CA - F.fy * SA, sy = F.fx * SA + F.fy * CA; // facing turned into screen space
  const side = Math.abs(sx) > Math.abs(sy) * 0.9, flip = sx < 0;
  const k = F.task;
  if (!F.moving && k && k.pose && k.work > 0) { const q = SEQ[k.pose]; return { row: k.pose, fr: q[Math.floor(realT * 6) % q.length], flip: Math.abs(sx) < 0.05 ? false : flip }; }
  const dir = side ? 'walk_side' : sy > 0 ? 'walk_front' : 'walk_back';
  if (F.moving) return { row: dir, fr: Math.floor(realT * 8) % 4, flip: side && flip, dir };
  const idle = side ? 'idle_side' : sy > 0 ? 'idle_front' : 'idle_back';
  if (k && k.rest) return { row: 'idle_front', fr: 0, flip: false, dir: 'walk_front' };
  return { row: SPR.rows[idle] !== undefined ? idle : dir, fr: 0, flip: side && flip, dir };
}
function drawBillboard(c, o, alpha = 1) {
  const [sx, sy] = proj(o.x, o.y); const r = SPR.rows[o.row]; if (r === undefined || !SPR.ok) return;
  const fw = SPR.fw, fh = SPR.fh, n = SPR.frames[o.row] || 4, fr = o.fr % n, src = o.flip ? SPR.flip : SPR.img, fx = o.flip ? SPR.img.width - (fr + 1) * fw : fr * fw;
  const dx = Math.round(sx) - (o.flip ? fw - 1 - SPR.ax : SPR.ax), dy = Math.round(sy) - SPR.ay - Math.round(o.z || 0);
  c.globalAlpha = alpha; c.drawImage(src, fx, r * fh, fw, fh, dx, dy, fw, fh);
  if (o.basket && o.row !== 'walk_back') drawBasket(c, Math.round(sx), dy + SPR.ay, o);
  c.globalAlpha = 1;
}
function drawBasket(c, fx, fy, o) { // little basket of the last crop, held at the hip (hidden from behind)
  const b = SPRITES.basket, bx = fx + (o.row === 'walk_front' ? 1 : o.flip ? -9 : 2), by = fy - 12;
  c.fillStyle = CROPS[o.basket] ? CROPS[o.basket].top : (FRUIT_COL[o.basket] || PRODUCT_COL[o.basket])[0]; c.fillRect(bx + 2, by - 1, 4, 2); c.fillStyle = Ink[0]; c.fillRect(bx + 1, by - 2, 6, 1);
  c.drawImage(b, bx, by);
}
function bbShadow(c, o, wide = 1) { const [sx, sy] = proj(o.x, o.y); const x = Math.round(sx), y = Math.round(sy); c.fillStyle = '#000';
  c.fillRect(x - 4 * wide, y - 1, 9 * wide, 3); c.fillRect(x - 6 * wide, y, 13 * wide, 1); }
function drawSpr(c, o, poseT) { // small 2D sprite anchored at its bottom centre; optional wind sway of the top half
  const [sx, sy] = proj(o.x, o.y), s = o.spr, x = Math.round(sx) - (s.width >> 1), y = Math.round(sy) - s.height + 2;
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
};
const CROPX = { c: null };
function cropAtlas() { // built once the SpriteCook sheet has loaded
  if (CROPX.c || !CROPI.ok) return CROPX.c;
  const a = mkc(16 * CROP_IDS.length, 16), g = a.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(CROPI.img, 0, 0);
  CROP_IDS.forEach((k, i) => { if (RIPE_EXTRA[k]) g.drawImage(RIPE_EXTRA[k], i * 16, 0); });
  return CROPX.c = a;
}
function drawCrop(c, o, poseT) { // ripe crops are 16x16 billboards; the leafy top half sways with the trees' wind
  const img = cropAtlas(); if (!img) return;
  const [sx, sy] = proj(o.x, o.y), x = Math.round(sx) - 8, y = Math.round(sy) - 13, u = o.ci * 16;
  const [dx] = clumpPose(o.x, o.y, 0.45, 0, poseT);
  if (o.flip) { c.save(); c.translate(x + 16, 0); c.scale(-1, 1); c.drawImage(img, u, 0, 16, 9, -dx, y, 16, 9); c.drawImage(img, u, 9, 16, 7, 0, y + 9, 16, 7); c.restore(); return; }
  c.drawImage(img, u, 0, 16, 9, x + dx, y, 16, 9); c.drawImage(img, u, 9, 16, 7, x, y + 9, 16, 7);
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
const WTONE = [Wt[0], Wt[1], Wt[2], Wt[3], Wt[4], Wt[5], Ac[0], PAL.ramps.shallow[0], Wd[0], G[0]].map(u32);
const LUM = c => 0.3 * (c & 255) + 0.59 * (c >>> 8 & 255) + 0.11 * (c >>> 16 & 255);
const RTONE = new Map(); for (const c of [...PAL.colors, '#1c1626']) { const v = u32(c), l = LUM(v); RTONE.set(v, l < 70 ? 0 : l < 118 ? 1 : 2); }
let WG = null;
function waterBox() {
  const pts = []; for (const [ux, uy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(proj(POND.x + ux * POND.rx * 1.3, POND.y + uy * POND.ry * 1.3));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0]))) - 4), x1 = Math.min(W, Math.ceil(Math.max(...pts.map(p => p[0]))) + 4);
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))) - 10), y1 = Math.min(H, Math.ceil(Math.max(...pts.map(p => p[1]))) + 4);
  return [x0, y0, x1 - x0, y1 - y0];
}
function waterGeom(d, bx, by, bw, bh) { // per camera angle: mask, distance to the shore, far row per column, zones
  const N = bw * bh, mask = new Uint8Array(N), dist = new Float32Array(N); let n = 0, sx = 0, sy = 0, ys = [];
  for (let i = 0; i < N; i++) if (d[i] === WSENT) { mask[i] = 1; n++; sx += i % bw; sy += (i / bw) | 0; ys.push((i / bw) | 0); }
  if (!n) return { bx, by, bw, bh, n: 0, aq: AQ };
  for (let i = 0; i < N; i++) dist[i] = mask[i] ? 1e4 : 0; // two-pass chamfer distance (1, 1.414) to the nearest dry pixel
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x; if (!mask[i]) continue; let v = dist[i];
    v = Math.min(v, x > 0 ? dist[i - 1] + 1 : 1, y > 0 ? dist[i - bw] + 1 : 1, x > 0 && y > 0 ? dist[i - bw - 1] + 1.414 : 1.414, x < bw - 1 && y > 0 ? dist[i - bw + 1] + 1.414 : 1.414); dist[i] = v; }
  for (let y = bh - 1; y >= 0; y--) for (let x = bw - 1; x >= 0; x--) { const i = y * bw + x; if (!mask[i]) continue; let v = dist[i];
    v = Math.min(v, x < bw - 1 ? dist[i + 1] + 1 : 1, y < bh - 1 ? dist[i + bw] + 1 : 1, x < bw - 1 && y < bh - 1 ? dist[i + bw + 1] + 1.414 : 1.414, x > 0 && y < bh - 1 ? dist[i + bw - 1] + 1.414 : 1.414); dist[i] = v; }
  const far = new Int16Array(bw).fill(-1), near = new Int16Array(bw).fill(-1);
  for (let x = 0; x < bw; x++) for (let y = 0; y < bh; y++) if (mask[y * bw + x]) { if (far[x] < 0) far[x] = y; near[x] = y; }
  ys.sort((a, b) => a - b); const midY = ys[ys.length >> 1], top = ys[0], pondH = ys[ys.length - 1] - top + 1, cx = sx / n, cy = sy / n;
  const along = new Float32Array(N), sky = [], deep = [], damp = [], back = [];
  for (let i = 0; i < N; i++) { const x = i % bw, y = (i / bw) | 0;
    if (mask[i]) { along[i] = Math.atan2((y - cy) * 2.2, x - cx) * 60; if (y - far[x] >= pondH * 0.3 && dist[i] >= 2) sky.push(i); if (dist[i] >= 4) deep.push(i); continue; }
    if (y > midY - 6) for (const o of [-1, 1, -bw, bw]) { const j = i + o; if (j >= 0 && j < N && mask[j]) { damp.push(i); break; } } }
  for (let x = 0; x < bw; x++) if (far[x] >= 2 && far[x] < midY) back.push(x);
  return { bx, by, bw, bh, n, mask, dist, far, near, midY, pondH, cx, cy, along, sky, deep, damp, back, tone: new Uint8Array(N), aq: AQ };
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
function waterPass(t) {
  const [bx, by, bw, bh] = waterBox(); if (bw <= 0 || bh <= 0) return;
  const img = ctx.getImageData(bx, by, bw, bh), d = new Uint32Array(img.data.buffer);
  if (!WG || WG.aq !== AQ || WG.bx !== bx || WG.by !== by || WG.bw !== bw || WG.bh !== bh) WG = waterGeom(d, bx, by, bw, bh);
  const Gm = WG; if (!Gm.n) return;
  const { mask, dist, far, midY, pondH, along, tone } = Gm, N = bw * bh, S1 = Math.round(pondH * 0.25), S2 = Math.round(pondH * 0.5);
  // 1 + 2: depth and sky
  for (let i = 0; i < N; i++) { if (!mask[i]) continue; const dd = dist[i], row = ((i / bw) | 0) - far[i % bw];
    let tn = dd > 7 ? 1 : 2; if (dd < 3) tn = 3; else { if (row >= S1) tn = 3; if (row >= S2) tn = 4; } tone[i] = tn; }
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
  for (let i = 0; i < N; i++) { if (!mask[i]) continue; const y = (i / bw) | 0, dd = dist[i];
    if (dd < 1.5 && y > midY && tone[i] >= 3) tone[i] = 7;
    if (Math.round(dd) === ring && tone[i] >= 2 && Math.sin(along[i] * 0.55 - wph(t, 2)) + 0.6 * Math.sin(along[i] * 0.23 + 1.3 - wph(t, 1)) > 0.55) tone[i] = 5; }
  for (const s of POND_SOLIDS) { const [sx, sy] = proj(s.x, s.y), cx = Math.round(sx) - bx, cy = Math.round(sy) - by;
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
  const ripple = (cx, cy, age) => { const f = Math.floor(age / 0.2); if (f < 0 || f > 4) return; const [rx, ry] = [[1, 0], [2, 1], [3, 1], [5, 2], [6, 3]][f];
    for (let a = 0; a < 6.283; a += 0.1) { const dx = Math.round(Math.cos(a) * rx), dy = Math.round(Math.sin(a) * ry); if (f >= 3 && Math.abs(dy) < ry / 2) continue; put(cx + dx, cy + dy, f < 3 ? 6 : 5, 1); } };
  const at = arr => { const i = arr[Math.floor(rr() * arr.length)]; return [i % bw, (i / bw) | 0]; };
  if (Gm.sky.length) for (let g = 0; g < 20; g++) { const [x, y] = at(Gm.sky), s0 = rr() * (WLOOP - 0.6), a = (lt - s0) / 0.6; if (a < 0 || a >= 1) continue;
    const xs = a < 0.15 ? [0] : a < 0.3 ? [-1, 0, 1] : a < 0.65 ? [-2, -1, 0, 1, 2] : a < 0.85 ? [-2, -1, 1, 2] : [-2, 2];
    for (const dx of xs) put(x + dx, y, Math.abs(dx) <= (xs.length >= 5 ? 1 : 0) ? 6 : 5, 1); }
  if (Gm.deep.length) { const [x, y] = at(Gm.deep), s0 = rr() * (WLOOP - 1); ripple(x, y, lt - s0); }
  // v4.4: asynkimo step 6 also has warm point glints (yellow/white pluses) and falling drips, not only dashes and leaves
  pondDecor.length = 0;
  if (Gm.sky.length) for (let g = 0; g < 10; g++) { const [x, y] = at(Gm.sky), s0 = rr() * (WLOOP - 0.45), a = (lt - s0) / 0.45; if (a < 0 || a >= 1) continue;
    pondDecor.push([x + bx, y + by, g % 3 === 0 ? Ac[1] : Ac[0], a > 0.28 && a < 0.7 ? 1 : 0]); }
  if (Gm.deep.length) for (let g = 0; g < 3; g++) { const [x, y] = at(Gm.deep), s0 = rr() * (WLOOP - 0.4), a = (lt - s0) / 0.4; if (a < 0 || a >= 1) continue;
    pondDecor.push([x + bx, y + by, Ac[0], a > 0.35 && a < 0.65 ? 1 : 0]); }
  if (Gm.deep.length) { const [x, y] = at(Gm.deep), s0 = rr() * (WLOOP - 1.4), a = lt - s0;
    if (a >= 0 && a < 0.85) pondDecor.push([x + bx, y + by - Math.round((0.85 - a) * 18), Wt[5], 2]);
    else if (a >= 0.85 && a < 1.85) ripple(x, y, a - 0.85); }
  pondLeaves.length = 0;
  if (Gm.deep.length) for (let q = 0; q < 2; q++) { const [x, y] = at(Gm.deep), s0 = rr() * WLOOP, a = ((lt - s0) % WLOOP + WLOOP) % WLOOP, col = q ? Ac[1] : G[4];
    if (a < 1.2) pondLeaves.push([x + bx, y + by - Math.round((1.2 - a) * 16), col]);                 // falling
    else if (a < 4.2) { const fx = x + Math.round((a - 1.2) * 3); put(fx, y + 1, 0); put(fx - 1, y, 5, 1); pondLeaves.push([fx + bx, y + by, col]); ripple(x, y, a - 1.2); } // floating
    else if (a < 4.8) { const fx = x + 9; if (a < 4.5) pondLeaves.push([fx + bx, y + by, col, 1]); } }  // sinking
  for (const dcl of decals) { if (dcl.lily === undefined) continue; const [sx, sy] = proj(dcl.x, dcl.y); dcl.bob = Math.sin(wph(t, 1) + 1.7 * dcl.lily) > 0.4 ? 1 : 0;
    const x0 = Math.round(sx) - (dcl.c.width >> 1) - bx, yb = Math.round(sy) + 1 + dcl.bob - by; for (let x = x0 + 2; x < x0 + dcl.c.width - 2; x++) put(x, yb, 0); }
  // damp ground on the near shore, the creeping waterline, then tones -> colours
  for (const i of Gm.damp) { const s = SHADE.get(d[i]); if (s) d[i] = s; }
  for (const x of Gm.back) { if (Math.sin((x + bx) * 0.35 - wph(t, 1)) + 0.5 * Math.sin((x + bx) * 0.13 + 1 - wph(t, 1)) > 0.6) d[(far[x] - 1) * bw + x] = WTONE[0]; }
  for (let i = 0; i < N; i++) if (mask[i]) d[i] = WTONE[tone[i]];
  ctx.putImageData(img, bx, by);
}
function drawPondLeaves() {
  for (const [x, y, c, sink] of pondLeaves) { ctx.fillStyle = c; ctx.fillRect(x, y, sink ? 1 : 2, 1); }
  for (const [x, y, c, sh] of pondDecor) { ctx.fillStyle = c; if (sh === 1) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); } else if (sh === 2) ctx.fillRect(x, y, 1, 2); else ctx.fillRect(x, y, 1, 1); }
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
  const T = S.t % 1440, night = dayLight(T), warm = warmth(T), poseT = Math.floor(realT * 10) / 10;
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
  waterPass(realT); tick('water');
  // flat things on the ground: tilled soil tiles (rotation-cached stacks), decals, seeds
  for (const t of tiles) if ((t.tilled || t.crop) && onScreen(t.x, t.y, 20)) drawStack(ctx, models.soil[t.watered ? 1 : 0], t.x, t.y, 0, 0);
  for (const d of decals) { const [sx, sy] = proj(d.x, d.y); if (sx < -8 || sx > W + 8 || sy < -4 || sy > H + 12) continue; const bob = d.bob || 0; ctx.drawImage(d.c, Math.round(sx) - (d.c.width >> 1), Math.round(sy) - d.c.height + 1 + bob); }
  tick('soil+decals');
  const list = [];
  for (const p of props) if (onScreen(p.x, p.y, p.tree ? 70 : 50)) list.push(p);
  for (const b of billboards) if (onScreen(b.x, b.y, 30)) list.push(b);
  for (const t of S.trees) if (onScreen(t.x, t.y, 70)) list.push(treeView(t));
  for (const t of tiles) { if (!onScreen(t.x, t.y, 30)) continue;
    if (t.debris) list.push({ m: debrisModel(t.debris), x: t.x, y: t.y, rot: t.debris.rot, z: 0 });
    if (t.weed) list.push({ spr: weedSprite(t.weed), x: t.x, y: t.y, sway: 0.8, w: 1 });
    if (t.crop) { if (t.crop.stage === 3 && CROPI.ok) list.push({ ci: CROP_IDS.indexOf(t.crop.type), x: t.x, y: t.y, flip: t.crop.rot > 3.14 });
      else list.push({ spr: CROP_SPR[Math.min(2, t.crop.stage)], x: t.x, y: t.y, sway: t.crop.stage === 2 ? 0.5 : 0, flat: t.crop.stage === 0 }); }
  }
  for (const c of yard) {
    if (c.type === 'weed') list.push({ spr: weedSprite(c), x: c.x, y: c.y, sway: 0.8, w: 1 });
    else list.push({ m: clutterModel(c), x: c.x, y: c.y, rot: c.rot, z: 0 });
  }
  if (S.animals.length && onScreen(PASTURE.center.x, PASTURE.center.y, 260)) { troughLook();
    for (const a of S.animals) { const v = animalView(a); if (!onScreen(v.x, v.y, 30)) continue; const sp = ANIMAL_SPR[a.kind], moving = Math.hypot(v.tx - v.x, v.ty - v.y) > 0.4 && !v.hold;
      list.push({ spr: (v.flip ? sp.l : sp.r)[moving ? Math.floor(v.step / 3) % 2 : v.graze ? 2 : 0], x: v.x, y: v.y, w: 1 }); }
    const eggs = Math.min(4, S.animals.reduce((n, a) => n + (a.kind === 'chicken' ? a.ready : 0), 0));
    for (let i = 0; i < eggs; i++) list.push({ spr: EGG, x: PASTURE.coop.x - 6 + i * 4, y: PASTURE.coop.y + 15 + (i % 2), flat: 1 }); }
  else if (pasture.trough) troughLook();
  let farmerD = null;
  if (!F.home) { farmerD = Object.assign({ bb: 1, x: F.x, y: F.y, basket: F.crops.length ? F.crops[F.crops.length - 1] : null }, farmerPose()); list.push(farmerD); }
  const selling = F.task && F.task.to === STALL_SPOT && !F.moving && !F.home;
  list.push({ bb: 1, x: KEEPER.x, y: KEEPER.y, row: selling && SPR.rows.keeper_wave !== undefined ? 'keeper_wave' : 'keeper', fr: selling ? Math.floor(realT * 5) : (Math.floor(realT * 0.8) % 5 === 4 ? 1 : 0), flip: false });
  for (const o of list) o.depth = proj(o.x, o.y + (o.dy || 0))[2] + (o.bb ? 0.3 : 0);
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
    if (o.bb) { drawBillboard(ctx, o); continue; }
    if (o.tree) { drawTree(ctx, o); tick('o.tree'); continue; }
    if (o.ci !== undefined) { drawCrop(ctx, o, poseT); continue; }
    if (o.spr) { drawSpr(ctx, o, poseT); continue; }
    drawStack(ctx, o.m, o.x, o.y, o.z || 0, o.rot || 0); tick(o.m.w * o.m.d * o.m.h >= 3000 ? 'o.big' : 'o.small');
  }
  tick('objects');
  if (farmerD) drawBillboard(ctx, farmerD, 0.35); // ghost, so he never disappears behind the barn or a tree
  drawMarks(); tick('marks');
  if (window.PF_FX) PF_FX.draw(ctx, proj, RS);
  for (const p of particles) { if (p.text) continue; const [sx, sy] = proj(p.x, p.y); ctx.fillStyle = p.c;
    if (p.kind === 'heart') { const hx = Math.round(sx), hy = Math.round(sy - p.z * RS); ctx.fillRect(hx - 2, hy, 2, 1); ctx.fillRect(hx + 1, hy, 2, 1); ctx.fillRect(hx - 2, hy + 1, 5, 1); ctx.fillRect(hx - 1, hy + 2, 3, 1); ctx.fillRect(hx, hy + 3, 1, 1); continue; } const s = p.kind === 'smoke' ? 3 : 2; ctx.fillRect(Math.round(sx), Math.round(sy - p.z * RS), s, s); }
  for (const l of leaves) { const [sx, sy] = proj(l.x, l.y); ctx.fillStyle = l.c; ctx.fillRect(Math.round(sx + Math.sin(l.ph) * 3), Math.round(sy - l.z), 2, 1); }
  drawPondLeaves();
  if (warm > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(255,${190 + 40 * (1 - warm)},${150 + 80 * (1 - warm)},${0.55 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (night > 0) lighting(night, T);
  if (night > 0.5) for (const f of fireflies) { const [sx, sy] = proj(f.x, f.y); if (Math.sin(realT * 3 + f.ph) > 0.2) { ctx.fillStyle = '#f6f29a'; ctx.fillRect(Math.round(sx), Math.round(sy - f.z * RS), 1, 1); } }
  for (const p of particles) if (p.text) { const [sx, sy] = proj(p.x, p.y); pixText(p.text, sx, sy - p.z * RS, p.c); }
  tick('fx+light');
  if (F.sleeping || (F.home && night > 0.7)) {
    const [sx, sy] = proj(HOUSE.x + 8, HOUSE.y - 5);
    for (let i = 0; i < 3; i++) { const ph = (realT * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - ph; pixText('Z', sx + 6 + ph * 18 + Math.sin(ph * 6) * 3, sy - 80 - ph * 26, '#f4f0ff', ph > 0.5 ? 2 : 1); }
    ctx.globalAlpha = 1;
  }
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
    else if (onScreen(o.x, o.y, 20)) { const [sx, sy] = proj(o.x, o.y); ctx.globalAlpha = 0.55; ctx.drawImage(SAPLING[0], Math.round(sx) - 4, Math.round(sy) - 7); ctx.globalAlpha = 1; ctx.drawImage(FLAG, Math.round(sx) + 2, Math.round(sy) - 9 + bob); }
  }
  if (INPUT.hover) { const h = INPUT.hover; if (h.tree) { const [x, y] = markAt(h.tree); ctx.drawImage(AXE_MARK, x - 3, y - 12 + bob); }
    else if (h.spot) { const [sx, sy] = proj(h.spot.x, h.spot.y); ctx.globalAlpha = h.ok ? 0.7 : 0.35; ctx.drawImage(SAPLING[0], Math.round(sx) - 4, Math.round(sy) - 7); ctx.globalAlpha = 1;
      if (!h.ok) { ctx.fillStyle = Rf[2]; ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 4, 7, 1); } } }
  for (const r of WD.REGIONS) if (!regionOpen(r.id) && onScreen(r.sign.x, r.sign.y, 30)) { const [sx, sy] = proj(r.sign.x, r.sign.y), x = Math.round(sx), y = Math.round(sy);
    ctx.drawImage(LOCK, x - 3, y - 22 + bob); }
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
  const hz = (x, y, z, r, s = 1) => { const [sx, sy] = proj(x, y); lights.push([sx, sy - z, r, s]); };
  if (T >= 17 * 60 + 30 || T < WAKE + 30) { hz(HOUSE.x - 8.5, HOUSE.y + 10.5, 17, 46); hz(HOUSE.x + 8.5, HOUSE.y + 10.5, 17, 46); hz(HOUSE.x - 13, HOUSE.y, 17, 34); }
  hz(STALL.x, STALL.y, 30, 40, 0.8); hz(BARN_DOOR.x, BARN_DOOR.y, 16, 26, 0.6); hz(WELL.x, WELL.y, 14, 20, 0.5);
  if (!F.home) hz(F.x, F.y, 14, 40);
  const d = litImg.data, A = night * 0.7, d32 = new Uint32Array(d.buffer);
  d32.fill(((Math.round(255 * A) << 24) | (52 << 16) | (18 << 8) | 14) >>> 0); // unlit night tint everywhere, then only the light boxes
  for (const [lx, ly, r] of lights) { const x0 = Math.max(0, Math.floor(lx - r)), x1 = Math.min(W - 1, Math.ceil(lx + r)), y0 = Math.max(0, Math.floor(ly - r / 1.25)), y1 = Math.min(H - 1, Math.ceil(ly + r / 1.25));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let L = 0; for (const [lx2, ly2, r2, s2] of lights) { const dd = Math.hypot(x - lx2, (y - ly2) * 1.25) / r2; if (dd < 1) L = Math.max(L, (1 - dd) * s2); }
      const q = Math.min(1, Math.floor(L * 4 + BAYER[(y & 3) * 4 + (x & 3)]) / 3);
      const p = (y * W + x) * 4;
      d[p] = 14 + (255 - 14) * q; d[p + 1] = 18 + (180 - 18) * q; d[p + 2] = 52 + (90 - 52) * q; d[p + 3] = 255 * (A * (1 - q) + 0.18 * night * q);
    } }
  lctx.putImageData(litImg, 0, 0); ctx.drawImage(litC, 0, 0);
}
function updateFx(dt) {
  if (window.PF_FX) PF_FX.update(dt);
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.kind === 'smoke' || p.kind === 'heart') continue; if (!p.text) { p.vz -= 40 * dt; if (p.z < 0) { p.z = 0; p.vx *= 0.5; p.vy *= 0.5; p.vz = 0; } } else p.vz *= 0.97; }
  windT += dt;
  for (const o of [...props, ...TV.values()]) if (o.tree) { const T = o.tree, k = 2 * Math.PI / T.period, g = gustAt(o.x, o.y);
    o.leanV += (k * k * (T.push * g - o.lean) - 2 * T.damp * k * o.leanV) * dt; o.lean += o.leanV * dt;
    if (T.kind === 'oak' && Math.random() < dt * g * 0.6 && onScreen(o.x, o.y, 0)) leaves.push({ x: o.x + VR(-10, 10), y: o.y + VR(-10, 10), z: T.h - 14, ph: VR(0, 6), c: vpick([G[4], Ac[1], G[3]]) }); }
  for (let i = leaves.length - 1; i >= 0; i--) { const l = leaves[i]; l.z -= 9 * dt; l.ph += dt * 3; l.x += dt * (2 + 10 * gustAt(l.x, l.y)); if (l.z <= 0) leaves.splice(i, 1); }
  if (!fireflies.length) for (let i = 0; i < 18; i++) fireflies.push({ x: VR(10, 80), y: VR(80, 122), z: VR(2, 9), ph: VR(0, 6) });
  for (const f of fireflies) { f.x += Math.sin(realT * 0.7 + f.ph) * dt * 3; f.y += Math.cos(realT * 0.5 + f.ph) * dt * 2; }
  if (F.home && Math.random() < dt * 2.5) particles.push({ x: HOUSE.x + 9.25, y: HOUSE.y - 4.5, z: 38, vx: 2, vy: -1, vz: 5, c: vpick([St[3], Ac[0]]), life: 2.4, kind: 'smoke' });
}
let hudPrices = '';
function hud() {
  const T = S.t % 1440, hh = T / 60;
  const tod = hh < 5 ? '深夜' : hh < 8 ? '清晨' : hh < 11 ? '上午' : hh < 13 ? '中午' : hh < 17 ? '下午' : hh < 19.5 ? '傍晚' : '夜晚';
  document.getElementById('day').textContent = `第 ${S.day} 天 · ${tod}`;
  document.getElementById('clock').textContent = fmtT(S.t);
  document.getElementById('act').textContent = '当前：' + S.label;
  document.getElementById('coins').textContent = S.coins;
  document.getElementById('seeds').textContent = seedCount(S.store);
  const arrow = m => m > 1.02 ? '↑' : m < 0.98 ? '↓' : '';
  const pr = S.eff.crops.map(k => `${SIM.CROPS[k].name} ${SIM.priceOf(k, S.prices)}${arrow(S.prices[k])}`).concat(AN.PRODUCT_IDS.filter(k => S.animals.some(a => AN.KINDS[a.kind].product === k)).map(k => `${AN.PRODUCTS[k].name} ${priceOfAny(k)}${arrow(S.prices[k])}`)).join(' · ');
  if (hudPrices !== pr) { hudPrices = pr; document.getElementById('prices').textContent = '今日行情：' + pr; }
  document.getElementById('log').innerHTML = S.log.map(s => `<div>${s}</div>`).join('');
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
  if (tiles.some(t => Math.abs(t.x - x) < 9 && Math.abs(t.y - y) < 9)) return { ok: false, why: '不能种在田里' };
  if (yard.some(c => Math.hypot(c.x - x, c.y - y) < 7)) return { ok: false, why: '这里有杂物，等农夫收拾完再种' };
  if ([[HOUSE, 28], [BARN, 28], [STALL, 22], [WELL, 12]].some(([b, d]) => Math.hypot(b.x - x, b.y - y) < d)) return { ok: false, why: '离房子太近' };
  if (props.some(p => !p.region && Math.hypot(p.x - x, p.y - y) < (p.tree ? 11 : 8)) || S.trees.some(t => Math.hypot(t.x - x, t.y - y) < 11) ||
      S.orders.some(o => o.type === 'plant' && Math.hypot(o.x - x, o.y - y) < 11)) return { ok: false, why: '离别的树太近' };
  return { ok: true };
}
const say = text => window.dispatchEvent(new CustomEvent('pf:say', { detail: text }));
function orderChop(id) {
  const t = S.trees.find(q => q.id === id); if (!t) return { ok: false };
  const i = S.orders.findIndex(o => o.type === 'chop' && o.id === id); if (i >= 0) { S.orders.splice(i, 1); return { ok: true, removed: true }; }
  if (!S.eff.regions.includes('forest')) return { ok: false, why: '先在商店买下林场' };
  if (!S.eff.axe) return { ok: false, why: '先在商店买斧头' };
  if (!WD.choppable(t, S.eff.regions)) return { ok: false, why: '这棵树不能砍' };
  if (S.orders.length >= WD.MAX_ORDERS) return { ok: false, why: '指令太多了，先等农夫做完一些' };
  S.orders.push({ type: 'chop', id }); return { ok: true };
}
function orderPlant(kind, x, y) {
  if (!WD.FRUIT[kind]) return { ok: false };
  const sp = plantSpot(x, y); if (!sp.ok) return sp;
  const want = S.orders.filter(o => o.type === 'plant' && o.kind === kind).length;
  if (want >= F.saplings[kind]) return { ok: false, why: `${WD.FRUIT[kind].name}树苗不够（有 ${F.saplings[kind]} 棵）` };
  if (S.orders.length >= WD.MAX_ORDERS) return { ok: false, why: '指令太多了，先等农夫做完一些' };
  S.orders.push({ type: 'plant', kind, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }); return { ok: true };
}
function setMode(mode, kind) { INPUT.mode = mode || null; if (kind) INPUT.kind = kind; INPUT.hover = null; cv.style.cursor = mode ? 'crosshair' : '';
  window.dispatchEvent(new CustomEvent('pf:mode', { detail: { mode: INPUT.mode, kind: INPUT.kind } })); }
function hoverAt(e) {
  if (!INPUT.mode) { INPUT.hover = null; return; }
  const w = toWorld(e.clientX, e.clientY);
  if (INPUT.mode === 'chop') { const t = treeAtScreen(w.px, w.py); INPUT.hover = t ? { tree: t } : null; }
  else INPUT.hover = { spot: w, ok: plantSpot(w.x, w.y).ok };
}
function clickAt(e) {
  const w = toWorld(e.clientX, e.clientY); let r = null;
  if (INPUT.mode === 'chop') { const t = treeAtScreen(w.px, w.py); r = t ? orderChop(t.id) : { ok: false, why: '点一棵林场里的树' }; if (r.ok) say(r.removed ? '取消了砍树' : '标记了要砍的树'); }
  else if (INPUT.mode === 'plant') { r = orderPlant(INPUT.kind, w.x, w.y); if (r.ok) say(`标记了种${WD.FRUIT[INPUT.kind].name}树苗的位置`); }
  if (r && !r.ok && r.why) say(r.why);
  if (r && r.ok) saveNow();
}
addEventListener('keydown', e => { if (typing(e)) return; if (ROT_KEYS[e.key]) { keyRot = ROT_KEYS[e.key]; e.preventDefault(); }
  if (PAN_KEYS[e.key]) keyPan.add(e.key.toLowerCase());
  if (e.key === 'r' || e.key === 'R') { cam.ta = DEFAULT_A; panTo(HOME_CAM.x, HOME_CAM.y); }
  if (e.key === 'Escape' && INPUT.mode) setMode(null); });
addEventListener('keyup', e => { if (ROT_KEYS[e.key] === keyRot) keyRot = 0; if (PAN_KEYS[e.key]) keyPan.delete(e.key.toLowerCase()); });
addEventListener('blur', () => { keyPan.clear(); keyRot = 0; });
cv.style.touchAction = 'none';
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, rot: e.button === 2 || e.shiftKey, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { hoverAt(e); if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) { drag.moved = true; document.body.classList.add('grab'); }
  if (drag.moved) { const r = cv.getBoundingClientRect(), k = W / r.width;
    if (drag.rot) cam.ta += (e.clientX - drag.x) * 0.008; else panScreen((e.clientX - drag.x) * k, (e.clientY - drag.y) * k); }
  drag.x = e.clientX; drag.y = e.clientY; });
const endDrag = e => { if (drag && !drag.moved && e.type === 'pointerup' && e.button === 0 && INPUT.mode) clickAt(e); drag = null; document.body.classList.remove('grab'); };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
addEventListener('wheel', e => { if (e.target !== cv) return; zoom = clamp(zoom + (e.deltaY < 0 ? 1 : -1), 0, 3); fit(); }, { passive: true });
if (Q.has('cursor')) { // visible pointer for recordings
  const cur = document.createElement('div'); cur.id = 'fakecursor'; document.body.appendChild(cur);
  addEventListener('pointermove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
}

// ---------- main loop ----------
function advance(dt) {
  realT += dt;
  if (keyRot) cam.ta += keyRot * dt * 1.8;
  if (keyPan.size) { let x = 0, y = 0; for (const k of keyPan) { x += PAN_KEYS[k][0]; y += PAN_KEYS[k][1]; } panScreen(-x * 170 * dt, -y * 170 * dt); }
  cam.a += (cam.ta - cam.a) * (1 - Math.exp(-dt * 14)); if (Math.abs(cam.ta - cam.a) < ASTEP / 4) cam.a = cam.ta;
  // (no camera follow: a drifting camera shifted the whole map by a pixel every few frames)
  const mult = F.sleeping ? SIM.SLEEP_MULT : 1;
  let dm = dt * MIN_PER_SEC * SPEED * (S.speed || 1) * mult; // SPEED: ?speed= debug multiplier; S.speed: the bought 1x / 2x / 4x
  while (dm > 0) { const s = Math.min(dm, 1); stepSim(s); dm -= s; }
  updateFx(dt);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(); hud(); requestAnimationFrame(frame);
}
window.__farm = { S, F, tiles, cam, advance: (sec, fps = 30) => { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) advance(1 / fps); render(); hud(); }, setSpeed: v => SPEED = v, render: () => { render(); hud(); }, spritesReady: () => SPR.ok, setAngle: a => { cam.a = cam.ta = a; }, proj: (x, y) => { setCam(); return proj(x, y); }, HOUSE, BARN, STALL, POND, playFx: (k, x, y, z, o) => { if (window.PF_FX) PF_FX.play(k, x, y, z, o); }, fxCount: () => window.PF_FX ? PF_FX.count() : 0, cropArt: v => { CROPI.on = v; } };
// warm the per-angle cache of the big buildings in idle time, nearest angles first, so manual rotation stays smooth
{ const big = props.filter(p => p.m && p.m.slices && p.m.slices.length && p.m.w * p.m.d * p.m.h >= 8000); let n = 1, base = null;
  const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 8 }), 30));
  const work = dl => { const b = Math.round(cam.ta / ASTEP); if (b !== base) { base = b; n = 1; }
    while (n <= 128 && dl.timeRemaining() > 4 && stkPx < STK_BUDGET * 0.8) { for (const s of [n, -n]) for (const p of big) stackCanvas(p.m, (base + s) * ASTEP + p.rot); n++; }
    setTimeout(() => idle(work), n > 128 || stkPx >= STK_BUDGET * 0.8 ? 400 : 0); }; // keep watching: after a manual turn, warm around the new angle
  if (!MANUAL) idle(work); }
// Watchdog: if the browser ever hands back a blanked canvas anyway (context lost / restored), throw away every cache and rebuild
// it from the voxel data, instead of drawing an empty farm until reload.
function cacheBlank() { // the ground is fully painted, and a weed sprite always has some opaque pixels
  if (groundBase.getContext('2d').getImageData(GW >> 1, GH >> 1, 1, 1).data[3] === 0) return true;
  const c = SPRITES.weed[0], d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) return false; return true; }
function rebuildCaches(why) {
  for (const [k, m] of STK) { m._ck.delete(k.a); } STK.clear(); stkPx = 0;
  for (const m of ALLM) { m._ck = null; m.secs = new Array(NSEC); m.slices = sliceSet(m, 0); }
  for (const p of props) if (p.tree) p._ck = null; for (const o of TV.values()) o._ck = null; discC.clear(); WG = null; buildGroundBase();
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
const GAME_VERSION = '4.5';
function snapshot() {
  return {
    saveVersion: PFSave.CURRENT, gameVersion: GAME_VERSION, createdAt: S.createdAt, savedAt: Date.now(), rng: RNG.a,
    clock: { day: S.day, t: S.t }, coins: S.coins,
    stats: { totalSold: S.totalSold, cleared: S.cleared, earned: S.earned, soldToday: S.soldToday, todayEarn: S.todayEarn, dayEarn: S.dayEarn.slice() },
    prices: Object.assign({}, S.prices),
    inventory: { water: F.water, waterMax: S.waterMax, store: Object.assign({}, S.store), bag: Object.assign({}, F.bag), gathered: F.gathered, basket: F.crops.slice(), wood: F.wood, saplings: Object.assign({}, F.saplings), hay: S.hay },
    farmer: { x: Math.round(F.x * 100) / 100, y: Math.round(F.y * 100) / 100, sleeping: F.sleeping, home: F.home },
    tiles: tiles.map(t => ({ f: t.f, c: t.c, r: t.r, open: t.open, tilled: t.tilled, watered: t.watered, debris: t.debris && Object.assign({}, t.debris), weed: t.weed && Object.assign({}, t.weed), crop: t.crop && { type: t.crop.type, age: t.crop.age, n: t.crop.n || 0, rot: t.crop.rot } })),
    upgrades: Object.assign({}, S.up), settings: { speed: S.speed },
    yard: yard.map(c => ({ type: c.type, v: c.v, rot: c.rot, x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100 })),
    trees: S.trees.map(t => Object.assign({}, t)), orders: S.orders.map(o => Object.assign({}, o)),
    animals: S.animals.map(a => Object.assign({}, a)), trough: Object.assign({}, S.trough),
    log: S.log.slice(),
  };
}
function restore(s) { // s has been migrated and validated by PFSave
  RNG.a = s.rng | 0; S.day = s.clock.day; S.t = s.clock.t; S.coins = s.coins; S.createdAt = s.createdAt;
  Object.assign(S, { totalSold: s.stats.totalSold, cleared: s.stats.cleared, earned: s.stats.earned, soldToday: s.stats.soldToday, todayEarn: s.stats.todayEarn, dayEarn: s.stats.dayEarn.slice() });
  S.prices = Object.assign(SIM.startPrices(), { egg: 1, wool: 1, milk: 1 }, s.prices); S.hay = s.inventory.hay || 0;
  S.animals = (s.animals || []).map(a => Object.assign({}, a)); S.trough = Object.assign({ feed: 0, water: 0 }, s.trough); AV.clear(); S.waterMax = s.inventory.waterMax; S.store = Object.assign(SIM.emptySeeds(), s.inventory.store);
  Object.assign(F, { water: Math.min(s.inventory.water, s.inventory.waterMax), bag: Object.assign(SIM.emptySeeds(), s.inventory.bag), gathered: s.inventory.gathered, crops: s.inventory.basket.slice(), task: null, moving: false,
    x: s.farmer.x, y: s.farmer.y, sleeping: s.farmer.sleeping, home: s.farmer.home || s.farmer.sleeping });
  const byPos = new Map(s.tiles.map(t => [(t.f || 'home') + ',' + t.c + ',' + t.r, t]));
  for (const t of tiles) { const o = byPos.get(t.f + ',' + t.c + ',' + t.r); if (!o) continue;
    Object.assign(t, { open: o.open, tilled: o.tilled, watered: o.watered, debris: o.debris, weed: o.weed, crop: o.crop && Object.assign({}, o.crop) });
    if (t.crop) t.crop.stage = SIM.stageOf(t.crop); }
  F.wood = s.inventory.wood || 0; F.saplings = Object.assign({ apple: 0, orange: 0 }, s.inventory.saplings);
  resetTreeViews(); S.trees = s.trees ? s.trees.map(t => Object.assign({}, t)) : WD.defaultTrees(); S.orders = (s.orders || []).map(o => Object.assign({}, o)); // a v2 save gets the default forest
  S.up = Object.assign(SIM.emptyUpgrades(), s.upgrades); S.speed = s.settings.speed; applyUpgrades(); // opens tiles a v1 save did not know about
  yard.length = 0;
  if (Array.isArray(s.yard)) s.yard.forEach(c => yard.push(Object.assign({}, c)));
  else fillYard(mulberry32((s.rng || 1) ^ 0xC0FFEE), YARD_START); // old saves get a yard to tidy, without touching the sim RNG
  S.log = s.log.slice(); S.label = F.sleeping ? '睡觉中 Zzz' : '继续干活'; groundDirty = true;
}
const SAVE = { at: 0, error: null, notes: [], off: false, offline: null };
function saveNow() {
  if (SAVE.off) return false;
  const r = PFSave.write(snapshot()); SAVE.error = r.ok ? null : r.error; if (r.ok) SAVE.at = Date.now(); return r.ok;
}
function settleOffline(sec) { // decision: estimate at 50% of the online rate, at most 3 game days; only gold changes
  const r = SIM.offlineSettle(sec, S.dayEarn); if (!r) return null;
  S.coins += r.gold; S.earned += r.gold; if (r.gold > 0) log(`离线期间赚了 ${r.gold} 金`);
  SAVE.offline = r; window.dispatchEvent(new CustomEvent('pf:offline', { detail: r })); saveNow(); return r;
}
onMorning = saveNow;
const boot = PFSave.read();
SAVE.notes = boot.notes;
if (boot.state) { restore(boot.state); log(`读取存档：第 ${S.day} 天，${S.coins} 金`); settleOffline((Date.now() - boot.state.savedAt) / 1000); }
else { fillYard(yardRng(0xA5A5A5), YARD_START); log('早上好！农场里乱糟糟的，先收拾一下'); }
OPEN_REGIONS = S.eff.regions.slice(); syncRegionProps(); buildGroundBase(); groundReady = true;
if (!boot.blocked) saveNow();
setInterval(saveNow, 15000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveNow(); hiddenAt = Date.now(); } // the game pauses while hidden (no animation frames)
  else if (hiddenAt) { const sec = (Date.now() - hiddenAt) / 1000; hiddenAt = 0; settleOffline(sec); }
});
addEventListener('pagehide', saveNow);
Object.assign(window.__farm, { SAVE, snapshot, yard, AV, PASTURE, animalArt: k => ANIMAL_SPR[k].r[0], WORLD, panTo, setMode, orderChop, orderPlant, plantSpot, input: INPUT,
  treeScreen: id => { const t = S.trees.find(q => q.id === id); if (!t) return null; setCam(); const [sx, sy] = proj(t.x, t.y), o = TV.get(t.id); return { x: sx, y: sy - (o && o.tree ? o.tree.h * 0.45 : 6) }; },
  toClient: (x, y) => { setCam(); const [sx, sy] = proj(x, y), r = cv.getBoundingClientRect(); return { x: r.left + sx * r.width / W, y: r.top + sy * r.height / H }; }, buy: id => { const r = buy(id); if (r.ok) saveNow(); return r; }, board: () => board().map(j => ({ kind: j.kind, base: j.base, score: Math.round((j.base - travel(F, j.at) / 8) * 10) / 10 })),
  setGameSpeed: v => { if ([1, 2, 4].includes(v) && v <= S.eff.speedMax) { S.speed = v; saveNow(); return true; } return false; },
  cropAtlasURL: () => { const a = cropAtlas(); return a ? a.toDataURL() : null; }, restore, saveNow, settleOffline, version: GAME_VERSION,
  reload: () => { SAVE.off = true; location.reload(); }, // used after import / reset so the old state is not saved again on the way out
  reset: () => { SAVE.off = true; PFSave.reset(); location.reload(); },
  importState: s => { SAVE.off = true; const r = PFSave.write(s); if (r.ok) location.reload(); else SAVE.off = false; return r; } });
// ---------- minimap (HTML canvas beside the game; never part of the pixel-exact picture) ----------
// The ground canvas is already a top-down map of the world, so the minimap is that, shrunk, plus trees, locks, fields, the
// farmer and the part of the world on screen. Click it to look somewhere else.
const MM = { el: document.getElementById('minimap'), s: 0.5, base: null };
function minimapBase() {
  if (!MM.el) return; const w = Math.round((WORLD.x1 - WORLD.x0) * MM.s), h = Math.round((WORLD.y1 - WORLD.y0) * MM.s);
  MM.el.width = w; MM.el.height = h; const b = MM.base = MM.base || mkc(w, h), g = b.getContext('2d'); b.width = w; b.height = h;
  g.imageSmoothingEnabled = true; g.drawImage(groundBase, (WORLD.x0 - GX0) * RS, (WORLD.y0 - GY0) * RS, (WORLD.x1 - WORLD.x0) * RS, (WORLD.y1 - WORLD.y0) * RS, 0, 0, w, h);
  const P = (x, y) => [(x - WORLD.x0) * MM.s, (y - WORLD.y0) * MM.s];
  g.fillStyle = G[0]; for (const p of props) if (p.tree) { const [x, y] = P(p.x, p.y); g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
  for (const p of props) if (p.big) { const [x, y] = P(p.x, p.y); g.fillStyle = p.m === models.house ? Rf[2] : Wd[2]; g.fillRect(Math.round(x) - 5, Math.round(y) - 4, 10, 8); }
  for (const r of WD.REGIONS) if (!regionOpen(r.id)) { const [x0, y0] = P(r.rect[0], r.rect[1]), [x1, y1] = P(r.rect[2], r.rect[3]);
    g.fillStyle = 'rgba(20,14,10,0.45)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#e8c78a'; g.setLineDash([3, 2]); g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1); g.setLineDash([]);
    g.font = '600 10px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff6dc'; g.fillText('未解锁 · ' + r.name, (x0 + x1) / 2, (y0 + y1) / 2 - 2);
    g.fillStyle = '#ffd76a'; g.fillText(SIM.shopItem(r.id).levels[0].cost + ' 金', (x0 + x1) / 2, (y0 + y1) / 2 + 10); }
}
function minimapDraw() {
  if (!MM.el || MM.el.offsetParent === null) return; if (!MM.base) minimapBase(); const g = MM.el.getContext('2d');
  const P = (x, y) => [(x - WORLD.x0) * MM.s, (y - WORLD.y0) * MM.s];
  g.drawImage(MM.base, 0, 0);
  for (const t of tiles) if (t.open) { const [x, y] = P(t.x - 4, t.y - 4); g.fillStyle = t.crop ? (SIM.ripe(t.crop) ? '#ffd76a' : G[3]) : t.tilled ? Wd[1] : t.debris || t.weed ? G[2] : Wd[3]; g.fillRect(x, y, 4, 4); }
  for (const t of S.trees) { const [x, y] = P(t.x, t.y); g.fillStyle = t.stage !== 'tree' ? Wd[3] : t.ripe ? (t.kind === 'apple' ? Rf[2] : Ac[2]) : t.kind === 'wild' ? G[1] : G[4]; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
  for (const o of S.orders) { const t = o.type === 'chop' ? S.trees.find(q => q.id === o.id) : o; if (!t) continue; const [x, y] = P(t.x, t.y); g.fillStyle = '#ff5a4a'; g.fillRect(Math.round(x) - 1, Math.round(y) - 4, 2, 3); }
  setCam(); g.strokeStyle = '#fff6dc'; g.lineWidth = 1; g.beginPath();
  [[0, 0], [W, 0], [W, H], [0, H]].forEach(([px, py], i) => { const rx = (px - CX) / RS, ry = (py - CY) / (K * RS), [x, y] = P(rx * CA + ry * SA, -rx * SA + ry * CA); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath(); g.stroke();
  for (const v of AV.values()) { const [ax, ay] = P(v.x, v.y); g.fillStyle = Ac[0]; g.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 2, 2); }
  const [fx, fy] = P(F.x, F.y); g.fillStyle = Ink[0]; g.fillRect(Math.round(fx) - 2, Math.round(fy) - 2, 5, 5); g.fillStyle = '#ffffff'; g.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
}
if (MM.el) { window.__farm.onGround = () => { MM.base = null; };
  MM.el.addEventListener('pointerdown', e => { const r = MM.el.getBoundingClientRect(); panTo(WORLD.x0 + (e.clientX - r.left) / r.width * (WORLD.x1 - WORLD.x0), WORLD.y0 + (e.clientY - r.top) / r.height * (WORLD.y1 - WORLD.y0)); minimapDraw(); });
  setInterval(minimapDraw, 250); }
window.__farm.minimapDraw = minimapDraw;
if (MANUAL) { render(); hud(); } else requestAnimationFrame(frame);
})();
