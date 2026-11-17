// 像素堆叠 · 放置农场 v3 · 风格 A —— all art is generated in code: voxel functions -> slices (sprite stacking),
// plus a hand-authored 2D billboard farmer (the usual hybrid in sprite-stacking games).
'use strict';
(() => {
// ---------- config ----------
const W = 426, H = 266;          // low-res framebuffer, integer upscaled (3x on 1280x800)
const RS = 2;                    // screen px per world unit: one 8-unit tile = 16 px, the classic 16-bit tile
const K = 0.75;                  // vertical squash (camera tilt)
const TILE = 8, COLS = 24, ROWS = 16, WW = COLS * TILE, WH = ROWS * TILE;
const M = 40;                    // ground margin around the world (world units)
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
    let col = Rm[t]; if (berries && t <= 2 && hash3(i, j, r + seed) < 0.06) col = Ac[3];
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
const GW = Math.ceil((WW + 2 * M) * RS), GH = Math.ceil((WH + 2 * M) * RS);
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
for (let r = 0; r < FIELD.rows; r++) for (let c = 0; c < FIELD.cols; c++) {
  tiles.push({ c, r, x: (FIELD.c0 + c) * TILE + TILE / 2, y: (FIELD.r0 + r) * TILE + TILE / 2, open: SIM.isOpen(c, r, 0), debris: null, weed: null, tilled: false, crop: null, watered: false });
}
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
tiles.forEach(t => spawnClutter(t, 0.34, 0.42));
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
  farmer: { x: DOOR.x, y: DOOR.y, fx: 0, fy: 1, home: true, sleeping: false, task: null, bag: SIM.emptySeeds(), gathered: 0, crops: [], water: 0, walkPhase: 0, idleCount: 0, act: 0 },
  log: [], events: [], label: '起床',
  flow: { weed: 0, harvest: 0, bought: 0, boughtGold: 0, sold: 0, soldGold: 0 }, // seed flow since the page opened (diagnostics, not saved)
};
const F = S.farmer;
const particles = [];
let groundDirty = true;
const fmtT = t => { const m = ((Math.floor(t) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function log(msg) { S.log.unshift(fmtT(S.t) + ' ' + msg); S.log.length = Math.min(S.log.length, 4); S.events.push({ day: S.day, t: Math.floor(S.t), msg }); if (S.events.length > 300) S.events.splice(0, S.events.length - 300); }
const rngNear = (list) => { let best = null, bd = 1e9; for (const t of list) { const d = Math.hypot(t.x - F.x, t.y - F.y + 6); if (d < bd) { bd = d; best = t; } } return best; };
const standAt = t => ({ x: t.x - 7, y: t.y + 1 }); // stand beside the tile, so work poses show in profile
const seedCount = o => CROP_IDS.reduce((n, k) => n + (o[k] || 0), 0);
const seedText = o => CROP_IDS.filter(k => o[k] > 0).map(k => `${SIM.CROPS[k].name}×${o[k]}`).join('、');
let onMorning = () => {};
function applyUpgrades() { // shop levels -> farm: capacity, speed, open tiles
  S.eff = SIM.effects(S.up); S.waterMax = S.eff.waterMax;
  for (const t of tiles) if (!t.open && SIM.isOpen(t.c, t.r, S.eff.field)) t.open = true;
  if (S.speed > S.eff.speedMax) S.speed = S.eff.speedMax;
  groundDirty = true;
}
function buy(id) { // the player's one action: spend gold on the next level of a shop item
  const o = SIM.offer(S.up, S.coins, id);
  if (!o || o.maxed) return { ok: false, reason: 'maxed' };
  if (!o.ok) return { ok: false, reason: 'short', short: o.short };
  S.coins -= o.cost; S.up[id] = o.have + 1; applyUpgrades();
  log(`买下了${o.item.name}：${o.level.label}（${o.cost} 金）`); popText(F.x, F.y, 22, '-' + o.cost, '#ffd76a'); burst(F.x, F.y, 14, ['#ffd76a', '#fff2a8'], 10, 'spark');
  if (id === 'field') log('新的田地开放了，农夫会去清理');
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
    if (F.water <= 0) post('refill', late ? 95 : 60, WELL_SPOT, refillTask);
    else { const t = rngNear(dry); post('water', late ? 96 : 61, t, () => waterTask(t)); } }
  if (tilledEmpty.length && bagN > 0) { const t = rngNear(tilledEmpty); post('plant', 70, t, () => plantTask(t)); }
  else if (tilledEmpty.length && (storeN > 0 || F.gathered > 0)) post('fetch', 68, BARN_DOOR, () => fetchTask(tilledEmpty.length + tillable.length));
  else if (tilledEmpty.length && S.coins >= SIM.CROPS.carrot.seed && T < 17 * 60) post('buy', 55, STALL_SPOT, sellTask);
  if (weeds.length) { const t = rngNear(weeds); post('weed', 45, t, () => weedTask(t)); }
  if (debris.length) { const t = rngNear(debris); post('clear', 40, t, () => clearTask(t)); }
  if (yard.length) { const c = rngNear(yard); post('tidy', 18, c, () => yardTask(c)); }
  if (F.gathered > 0 && (F.gathered >= 12 || (weeds.length === 0 && (F.gathered >= 4 || T >= 18 * 60)))) post('store', 50, BARN_DOOR, storeTask);
  if (tillable.length && T < 17 * 60) { // the wide hoe aims at the tile whose 3x3 has the most soil to turn
    const t = E.till3 ? tillable.reduce((b, u) => { const v = tillable.filter(w => Math.abs(w.c - u.c) <= 1 && Math.abs(w.r - u.r) <= 1).length * 100 - Math.hypot(u.x - F.x, u.y - F.y); return v > b.v ? { t: u, v } : b; }, { t: null, v: -1e9 }).t : rngNear(tillable);
    post('till', 35, t, () => tillTask(t)); }
  if (F.crops.length) {
    const busy = ripe.length || dry.length || (tilledEmpty.length && bagN);
    const base = full ? 100 : T >= 17.5 * 60 ? 80 : F.crops.length >= E.basket * 0.6 ? 58 : !busy ? 30 : 0;
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
  for (const j of board()) { const s = j.base - Math.hypot(j.at.x - F.x, j.at.y - F.y) / 8; if (s > bs) { bs = s; best = j; } }
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
    burst(t.x, t.y, 4, ['#f0a030', '#8fd35a', '#ffffff'], 8); popText(t.x, t.y, 12, '+1', '#ffffff');
    if (c.regrow && (t.crop.n || 0) + 1 < c.harvests) { t.crop.n = (t.crop.n || 0) + 1; t.crop.age = c.days - c.regrow; t.crop.stage = SIM.stageOf(t.crop); log(`摘了一个${c.name}（第 ${t.crop.n} 次）`); return; }
    t.crop = null;
    const n = SIM.harvestSeeds(ty, rand); if (n) { F.bag[ty] += n; S.flow.harvest += n; popText(t.x + 3, t.y, 16, `+${n}种`, '#e6c35c'); }
    log(`收获了一个${c.name}` + (n ? `，留下 ${n} 颗种子` : ''));
  } };
}
function refillTask() { return { label: '正在井边打水', to: WELL_SPOT, dur: 8, fx: 'water', done: () => { F.water = S.waterMax; log(`在井边装满了水壶（${S.waterMax} 格）`); } }; }
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
  return { label: '正在拔草收集种子', to: standAt(t), tile: t, dur: 6, fx: 'leaf', pose: 'pull', done: () => { if (!t.weed) return; t.weed = null; const n = RI(2, 3); F.gathered += n; S.flow.weed += n; burst(t.x, t.y, 3, ['#5a9a3a', '#e6c35c', '#3f7a32'], 10); popText(t.x, t.y, 10, '+' + n, '#e6c35c'); log(`拔掉杂草，收集到 ${n} 颗种子`); } };
}
function clearTask(t) {
  const rock = t.debris.type === 'rock';
  return { label: '正在清理杂物', to: standAt(t), tile: t, dur: rock ? 8 : 6, fx: rock ? 'rock' : 'wood', pose: 'pull', done: () => { if (!t.debris) return; t.debris = null; S.cleared++; burst(t.x, t.y, 2, rock ? ['#9a9a92', '#b9b8ad', '#77776f'] : ['#a0703f', '#7a5230'], 10); log(rock ? '搬走了一块石头' : '清走了一根树枝'); groundDirty = true; } };
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
    else if ((c.type === 'rock' || c.type === 'branch') && yr() < 0.3) { S.coins++; S.earned++; S.todayEarn++; popText(c.x, c.y, 12, '+1', '#ffd76a'); }
    const col = c.type === 'weed' ? ['#5a9a3a', '#3f7a32'] : c.type === 'branch' ? ['#a0703f', '#7a5230'] : ['#9a9a92', '#b9b8ad', '#77776f'];
    burst(c.x, c.y, 2, col, 10);
    log(c.type === 'weed' ? '拔掉了院子里的杂草' : c.type === 'rock' ? '搬走了院子里的一块石头' : c.type === 'branch' ? '捡走了院子里的枯枝' : '清走了一颗小石子');
  } };
}
function tillTask(t) { // tilled soil is permanent; the wide hoe turns the 3x3 around the target in one go
  const wide = S.eff.till3;
  return { label: wide ? '正在用宽锄头开垦' : '正在开垦土地', to: standAt(t), tile: t, dur: wide ? 5 : S.eff.tillDur, fx: 'dirt', pose: 'hoe', done: () => {
    const area = wide ? tiles.filter(u => Math.abs(u.c - t.c) <= 1 && Math.abs(u.r - t.r) <= 1) : [t];
    for (const u of area) if (u.open && !u.tilled && !u.crop && !u.debris && !u.weed) { u.tilled = true; burst(u.x, u.y, 1, ['#8b5a35', '#a06c43', '#6e452a'], 8); }
    groundDirty = true;
  } };
}
// one stop at the stall: sell the whole basket at today's prices and any spare seeds, then buy seeds for the empty tiles
function sellTask() {
  return { label: F.crops.length ? '正在去市场卖菜' : '正在去市场买种子', to: STALL_SPOT, via: Math.hypot(F.x - STALL_SPOT.x, F.y - STALL_SPOT.y) > 3 && F.y < STALL_SPOT.y - 2 ? [{ x: 140, y: Math.min(92, Math.max(F.y, 56)) }, { x: 140, y: STALL_SPOT.y }] : [], dur: 6, fx: 'coin', done: () => {
    const n = F.crops.length, open = tiles.filter(t => t.open);
    let sum = 0; for (const ty of F.crops) sum += SIM.priceOf(ty, S.prices); F.crops.length = 0;
    const sp = SIM.surplusSeeds(F.bag, S.store, open.length);
    if (sp.gold) { for (const k of CROP_IDS) F.bag[k] -= sp.sell[k]; sum += sp.gold; S.flow.sold += seedCount(sp.sell); S.flow.soldGold += sp.gold; log(`卖掉多余的种子：${seedText(sp.sell)}（${sp.gold} 金）`); }
    if (sum) { S.coins += sum; S.earned += sum; S.todayEarn += sum; S.soldToday += n; S.totalSold += n;
      popText(STALL.x + R(-4, 4), STALL.y - 3, 26, '+' + sum, '#ffd76a'); burst(STALL_SPOT.x, STALL_SPOT.y - 6, 10, ['#ffd76a', '#fff2a8'], 6, 'spark');
      if (n) log(`卖出 ${n} 个作物，得 ${sum - sp.gold} 金`); }
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
  S.prices = SIM.driftPrices(S.prices, rand);
  groundDirty = true; log(`新的一天！${grew} 棵作物长大了，夜里长出 ${n} 处田里杂物` + (yn ? `，院子里又出现 ${yn} 处杂物` : ''));
  onMorning();
}
function stepSim(dm) {
  const prevDay = Math.floor((S.t - WAKE) / 1440);
  S.t += dm;
  if (Math.floor((S.t - WAKE) / 1440) !== prevDay) { // reached 6:00
    if (F.sleeping) { F.sleeping = false; F.home = true; }
    overnight(); log('起床啦，开始干活');
  }
  if (F.sleeping) { S.label = '睡觉中 Zzz'; return; }
  if (!F.task) { F.task = chooseTask(); F.task.work = 0; S.label = F.task.label; if (F.task.label !== '回家睡觉' || !F.home) F.home = false; }
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
  else if (k.fx === 'dirt') burst(t.x, t.y, 1, ['#8b5a35', '#a06c43'], 2);
  else if (k.fx === 'leaf') burst(t.x, t.y, 2, ['#5a9a3a', '#8fd35a'], 2);
  else if (k.fx === 'rock') burst(t.x, t.y, 2, ['#b9b8ad', '#9a9a92'], 2);
  else if (k.fx === 'wood') burst(t.x, t.y, 2, ['#a0703f'], 2);
  else if (k.fx === 'seed') burst(t.x, t.y, 4, ['#e8d9a0'], 1);
}
function burst(x, y, z, cols, n, kind) {
  for (let i = 0; i < n; i++) particles.push({ x, y, z, vx: R(-6, 6), vy: R(-6, 6), vz: kind === 'drop' ? R(-4, 2) : R(6, 16), c: pick(cols), life: R(0.5, 1.1), kind });
}
function popText(x, y, z, s, c) { particles.push({ x, y, z, vx: 0, vy: 0, vz: 10, c, life: 1.6, text: s }); }


// ---------- rendering helpers ----------
const DEFAULT_A = Q.has('angle') ? +Q.get('angle') : 0.22;
const cam = { x: WW / 2, y: WH / 2 + 2, a: DEFAULT_A, ta: DEFAULT_A };
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
const pathD = (x, y) => { let pd = 99; for (const s of pathSegs) pd = Math.min(pd, segDist(x, y, s)); return pd; };
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
  const out = Math.max(-x, x - WW, -y, y - WH, 0);
  if (out > 22 + vnoise(x / 7, y / 7, 5) * 12) return [G[1], 'grass']; // forest floor under the tree line
  if (out > 6 + vnoise(x / 6, y / 6, 3) * 8) return [G[2], 'grass'];
  return [G[3], 'grass'];
}
function buildGroundBase() { // one ground pixel per screen pixel (world unit = RS px)
  const g = groundBase.getContext('2d'), img = g.createImageData(GW, GH), d = new Uint32Array(img.data.buffer);
  for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) d[py * GW + px] = u32(groundAt(px / RS - M, py / RS - M)[0]);
  g.putImageData(img, 0, 0);
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
  c.fillStyle = CROPS[o.basket].top; c.fillRect(bx + 2, by - 1, 4, 2); c.fillStyle = Ink[0]; c.fillRect(bx + 1, by - 2, 6, 1);
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
const pondLeaves = [];
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
function drawPondLeaves() { for (const [x, y, c, sink] of pondLeaves) { ctx.fillStyle = c; ctx.fillRect(x, y, sink ? 1 : 2, 1); } }

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
  const [gx, gy] = proj(-M, -M);
  ctx.setTransform(CA, SA * K, -SA, CA * K, Math.round(gx), Math.round(gy)); ctx.drawImage(groundBase, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
  tick('ground');
  waterPass(realT); tick('water');
  // flat things on the ground: tilled soil tiles (rotation-cached stacks), decals, seeds
  for (const t of tiles) if (t.tilled || t.crop) drawStack(ctx, models.soil[t.watered ? 1 : 0], t.x, t.y, 0, 0);
  for (const d of decals) { const [sx, sy] = proj(d.x, d.y); const bob = d.bob || 0; ctx.drawImage(d.c, Math.round(sx) - (d.c.width >> 1), Math.round(sy) - d.c.height + 1 + bob); }
  tick('soil+decals');
  const list = [];
  for (const p of props) list.push(p);
  for (const b of billboards) list.push(b);
  for (const t of tiles) {
    if (t.debris) list.push({ m: debrisModel(t.debris), x: t.x, y: t.y, rot: t.debris.rot, z: 0 });
    if (t.weed) list.push({ spr: weedSprite(t.weed), x: t.x, y: t.y, sway: 0.8, w: 1 });
    if (t.crop) { if (t.crop.stage === 3 && CROPI.ok) list.push({ ci: CROP_IDS.indexOf(t.crop.type), x: t.x, y: t.y, flip: t.crop.rot > 3.14 });
      else list.push({ spr: CROP_SPR[Math.min(2, t.crop.stage)], x: t.x, y: t.y, sway: t.crop.stage === 2 ? 0.5 : 0, flat: t.crop.stage === 0 }); }
  }
  for (const c of yard) {
    if (c.type === 'weed') list.push({ spr: weedSprite(c), x: c.x, y: c.y, sway: 0.8, w: 1 });
    else list.push({ m: clutterModel(c), x: c.x, y: c.y, rot: c.rot, z: 0 });
  }
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
  for (const p of particles) { if (p.text) continue; const [sx, sy] = proj(p.x, p.y); ctx.fillStyle = p.c; const s = p.kind === 'smoke' ? 3 : 2; ctx.fillRect(Math.round(sx), Math.round(sy - p.z * RS), p.kind === 'drop' ? 1 : s, p.kind === 'drop' ? 3 : s); }
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
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.kind === 'smoke') continue; if (!p.text) { p.vz -= 40 * dt; if (p.z < 0) { p.z = 0; p.vx *= 0.5; p.vy *= 0.5; p.vz = 0; } } else p.vz *= 0.97; }
  windT += dt;
  for (const o of props) if (o.tree) { const T = o.tree, k = 2 * Math.PI / T.period, g = gustAt(o.x, o.y);
    o.leanV += (k * k * (T.push * g - o.lean) - 2 * T.damp * k * o.leanV) * dt; o.lean += o.leanV * dt;
    if (T.kind === 'oak' && Math.random() < dt * g * 0.6) leaves.push({ x: o.x + R(-10, 10), y: o.y + R(-10, 10), z: T.h - 14, ph: R(0, 6), c: pick([G[4], Ac[1], G[3]]) }); }
  for (let i = leaves.length - 1; i >= 0; i--) { const l = leaves[i]; l.z -= 9 * dt; l.ph += dt * 3; l.x += dt * (2 + 10 * gustAt(l.x, l.y)); if (l.z <= 0) leaves.splice(i, 1); }
  if (!fireflies.length) for (let i = 0; i < 18; i++) fireflies.push({ x: R(10, 80), y: R(80, 122), z: R(2, 9), ph: R(0, 6) });
  for (const f of fireflies) { f.x += Math.sin(realT * 0.7 + f.ph) * dt * 3; f.y += Math.cos(realT * 0.5 + f.ph) * dt * 2; }
  if (F.home && Math.random() < dt * 2.5) particles.push({ x: HOUSE.x + 9.25, y: HOUSE.y - 4.5, z: 38, vx: 2, vy: -1, vz: 5, c: pick([St[3], Ac[0]]), life: 2.4, kind: 'smoke' });
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
  const pr = S.eff.crops.map(k => { const m = S.prices[k]; return `${SIM.CROPS[k].name} ${SIM.priceOf(k, S.prices)}${m > 1.02 ? '↑' : m < 0.98 ? '↓' : ''}`; }).join(' · ');
  if (hudPrices !== pr) { hudPrices = pr; document.getElementById('prices').textContent = '今日行情：' + pr; }
  document.getElementById('log').innerHTML = S.log.map(s => `<div>${s}</div>`).join('');
}

// ---------- camera: manual only (no auto-rotation). drag / swipe, Q E, ← →, R resets; wheel = integer zoom ----------
let keyRot = 0, drag = null;
const ROT_KEYS = { q: -1, Q: -1, ArrowLeft: -1, e: 1, E: 1, ArrowRight: 1 };
const typing = e => e.target && /^(TEXTAREA|INPUT|BUTTON)$/.test(e.target.tagName); // the save menu has text boxes
addEventListener('keydown', e => { if (typing(e)) return; if (ROT_KEYS[e.key]) { keyRot = ROT_KEYS[e.key]; e.preventDefault(); } if (e.key === 'r' || e.key === 'R') cam.ta = DEFAULT_A; });
addEventListener('keyup', e => { if (ROT_KEYS[e.key] === keyRot) keyRot = 0; });
cv.style.touchAction = 'none';
cv.addEventListener('pointerdown', e => { drag = e.clientX; cv.setPointerCapture(e.pointerId); document.body.classList.add('grab'); });
cv.addEventListener('pointermove', e => { if (drag === null) return; cam.ta += (e.clientX - drag) * 0.008; drag = e.clientX; });
const endDrag = () => { drag = null; document.body.classList.remove('grab'); };
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
window.__farm = { S, F, tiles, cam, advance: (sec, fps = 30) => { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) advance(1 / fps); render(); hud(); }, setSpeed: v => SPEED = v, render: () => { render(); hud(); }, spritesReady: () => SPR.ok, setAngle: a => { cam.a = cam.ta = a; }, proj: (x, y) => { setCam(); return proj(x, y); }, HOUSE, BARN, STALL, cropArt: v => { CROPI.on = v; } };
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
  for (const p of props) if (p.tree) p._ck = null; discC.clear(); WG = null; buildGroundBase();
  console.warn('[farm] caches rebuilt:', why); window.__farm.rebuilds = (window.__farm.rebuilds || 0) + 1;
  if (cacheBlank()) location.reload(); // hand-drawn sprites were lost too: start fresh
}
cv.addEventListener('contextlost', e => e.preventDefault());
cv.addEventListener('contextrestored', () => rebuildCaches('main canvas restored'));
setInterval(() => { if (!document.hidden && cacheBlank()) rebuildCaches('blank cache detected'); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && cacheBlank()) rebuildCaches('blank cache after tab was hidden'); });
window.__farm.mem = () => ({ stkPx, stk: STK.size, atlasPx: ALLM.reduce((t, m) => t + m.secs.reduce((u, x) => u + (x ? x.c.width * x.c.height : 0), 0), 0) });
window.__farm.debugBlank = () => { const g = groundBase.getContext('2d'); g.clearRect(0, 0, GW, GH); }; // test hook for the watchdog
buildGroundBase();

// ---------- save / load (rules in save.js, UI in ui.js) ----------
const GAME_VERSION = '4.2';
function snapshot() {
  return {
    saveVersion: PFSave.CURRENT, gameVersion: GAME_VERSION, createdAt: S.createdAt, savedAt: Date.now(), rng: RNG.a,
    clock: { day: S.day, t: S.t }, coins: S.coins,
    stats: { totalSold: S.totalSold, cleared: S.cleared, earned: S.earned, soldToday: S.soldToday, todayEarn: S.todayEarn, dayEarn: S.dayEarn.slice() },
    prices: Object.assign({}, S.prices),
    inventory: { water: F.water, waterMax: S.waterMax, store: Object.assign({}, S.store), bag: Object.assign({}, F.bag), gathered: F.gathered, basket: F.crops.slice() },
    farmer: { x: Math.round(F.x * 100) / 100, y: Math.round(F.y * 100) / 100, sleeping: F.sleeping, home: F.home },
    tiles: tiles.map(t => ({ c: t.c, r: t.r, open: t.open, tilled: t.tilled, watered: t.watered, debris: t.debris && Object.assign({}, t.debris), weed: t.weed && Object.assign({}, t.weed), crop: t.crop && { type: t.crop.type, age: t.crop.age, n: t.crop.n || 0, rot: t.crop.rot } })),
    upgrades: Object.assign({}, S.up), settings: { speed: S.speed },
    yard: yard.map(c => ({ type: c.type, v: c.v, rot: c.rot, x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100 })),
    log: S.log.slice(),
  };
}
function restore(s) { // s has been migrated and validated by PFSave
  RNG.a = s.rng | 0; S.day = s.clock.day; S.t = s.clock.t; S.coins = s.coins; S.createdAt = s.createdAt;
  Object.assign(S, { totalSold: s.stats.totalSold, cleared: s.stats.cleared, earned: s.stats.earned, soldToday: s.stats.soldToday, todayEarn: s.stats.todayEarn, dayEarn: s.stats.dayEarn.slice() });
  S.prices = Object.assign(SIM.startPrices(), s.prices); S.waterMax = s.inventory.waterMax; S.store = Object.assign(SIM.emptySeeds(), s.inventory.store);
  Object.assign(F, { water: Math.min(s.inventory.water, s.inventory.waterMax), bag: Object.assign(SIM.emptySeeds(), s.inventory.bag), gathered: s.inventory.gathered, crops: s.inventory.basket.slice(), task: null, moving: false,
    x: s.farmer.x, y: s.farmer.y, sleeping: s.farmer.sleeping, home: s.farmer.home || s.farmer.sleeping });
  const byPos = new Map(s.tiles.map(t => [t.c + ',' + t.r, t]));
  for (const t of tiles) { const o = byPos.get(t.c + ',' + t.r); if (!o) continue;
    Object.assign(t, { open: o.open, tilled: o.tilled, watered: o.watered, debris: o.debris, weed: o.weed, crop: o.crop && Object.assign({}, o.crop) });
    if (t.crop) t.crop.stage = SIM.stageOf(t.crop); }
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
if (!boot.blocked) saveNow();
setInterval(saveNow, 15000);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveNow(); hiddenAt = Date.now(); } // the game pauses while hidden (no animation frames)
  else if (hiddenAt) { const sec = (Date.now() - hiddenAt) / 1000; hiddenAt = 0; settleOffline(sec); }
});
addEventListener('pagehide', saveNow);
Object.assign(window.__farm, { SAVE, snapshot, yard, buy: id => { const r = buy(id); if (r.ok) saveNow(); return r; }, board: () => board().map(j => ({ kind: j.kind, base: j.base, score: Math.round((j.base - Math.hypot(j.at.x - F.x, j.at.y - F.y) / 8) * 10) / 10 })),
  setGameSpeed: v => { if ([1, 2, 4].includes(v) && v <= S.eff.speedMax) { S.speed = v; saveNow(); return true; } return false; },
  cropAtlasURL: () => { const a = cropAtlas(); return a ? a.toDataURL() : null; }, restore, saveNow, settleOffline, version: GAME_VERSION,
  reload: () => { SAVE.off = true; location.reload(); }, // used after import / reset so the old state is not saved again on the way out
  reset: () => { SAVE.off = true; PFSave.reset(); location.reload(); },
  importState: s => { SAVE.off = true; const r = PFSave.write(s); if (r.ok) location.reload(); else SAVE.off = false; return r; } });
if (MANUAL) { render(); hud(); } else requestAnimationFrame(frame);
})();
