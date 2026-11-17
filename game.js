// 像素堆叠 · 放置农场 v2 —— all art is generated in code: voxel functions -> slices (sprite stacking),
// plus a hand-authored 2D billboard farmer (the usual hybrid in sprite-stacking games).
'use strict';
(() => {
// ---------- config ----------
const W = 426, H = 266;          // low-res framebuffer, integer upscaled (3x on 1280x800)
const RS = 5 / 3;                // screen px per world unit (world logic still uses 8-unit tiles)
const K = 0.75;                  // vertical squash (camera tilt)
const TILE = 8, COLS = 24, ROWS = 16, WW = COLS * TILE, WH = ROWS * TILE;
const M = 40;                    // ground margin around the world (world units)
const Q = new URLSearchParams(location.search);
let SPEED = +Q.get('speed') || 1;
const MANUAL = Q.has('manual');
const MIN_PER_SEC = 5, WALK = 7, WAKE = 6 * 60, BEDTIME = 20 * 60;

// ---------- rng / helpers ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rand = mulberry32(+Q.get('seed') || 20261116);
const R = (a, b) => a + rand() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1)), pick = a => a[Math.floor(rand() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hexc = {}; const hex = h => hexc[h] || (hexc[h] = (n => [n >> 16 & 255, n >> 8 & 255, n & 255])(parseInt(h.slice(1), 16)));
const hash3 = (x, y, z) => { let n = x * 374761393 + y * 668265263 + z * 2147483647; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
function pick2(r, a) { return a[Math.floor(r() * a.length)]; }
const ell = (x, y, z, cx, cy, cz, rx, ry, rz) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;

// ---------- voxel model -> slices ----------
function buildModel(w, d, h, fn) {
  w = Math.round(w); d = Math.round(d); h = Math.round(h);
  const vox = new Array(w * d * h).fill(null);
  const id = (x, y, z) => (z * d + y) * w + x;
  for (let z = 0; z < h; z++) for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) { const c = fn(x, y, z); if (c) vox[id(x, y, z)] = hex(c); }
  const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= w || y >= d || z >= h) ? null : vox[id(x, y, z)];
  const slices = [];
  const foot = document.createElement('canvas'); foot.width = w; foot.height = d;
  const fctx = foot.getContext('2d'); const fimg = fctx.createImageData(w, d);
  for (let z = 0; z < h; z++) {
    const c = document.createElement('canvas'); c.width = w; c.height = d;
    const cx = c.getContext('2d'); const img = cx.createImageData(w, d); let any = false;
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const v = get(x, y, z); if (!v) continue; any = true;
      let f;
      if (!get(x, y, z + 1)) f = 1.08;                       // top face: lit
      else { const edge = !get(x - 1, y, z) || !get(x + 1, y, z) || !get(x, y - 1, z) || !get(x, y + 1, z); f = edge ? 0.84 : 0.92; }
      f *= 0.86 + 0.14 * Math.min(1, (z + 1) / Math.max(4, h * 0.4)); // ambient occlusion near ground
      const p = (y * w + x) * 4;
      img.data[p] = clamp(v[0] * f, 0, 255); img.data[p + 1] = clamp(v[1] * f, 0, 255); img.data[p + 2] = clamp(v[2] * f, 0, 255); img.data[p + 3] = 255;
      fimg.data[p + 3] = 255;
    }
    cx.putImageData(img, 0, 0); slices.push(any ? c : null);
  }
  fctx.putImageData(fimg, 0, 0);
  return { w, d, h, slices, foot };
}

// ---------- palette ----------
const P = {
  grass: ['#7fb24a', '#86b94f', '#78a845', '#8fc257'], grassDark: '#5f8f37', flower: ['#f4e27a', '#f29bb5', '#ffffff', '#b9a2f0'],
  dirt: '#c9a46b', dirtD: '#b08a55', soil: '#8b5a35', soilF: '#6e452a', soilH: '#a06c43', wet: '#5c3a24', wetF: '#48301d', wetH: '#6e4a30',
  wood: '#a0703f', woodD: '#7a5230', woodDD: '#5c3d22', woodL: '#c9a36b', stone: '#9a9a92', stoneD: '#77776f', stoneL: '#b9b8ad',
  roof: '#c75a47', roofD: '#a8473a', roofL: '#d9705a', wall: '#ecd8ad', wallD: '#d9c08f', barn: '#b2453a', barnD: '#8f342c', white: '#f3ecd8',
  water: '#3f7fa8', waterM: '#5b9cc4', waterL: '#8cc6dc', glass: '#9fd3e6', glassL: '#d8f0f8',
};

// ---------- buildings (authored at screen resolution) ----------
function gableRoof(x, y, z, o) { // ridge along x; returns colour, 'fill' for gable interior, or null
  const k = z - o.z0; if (k < 0) return null;
  const a = o.y0 + k, b = o.y1 - k; if (a > b || x < o.x0 || x > o.x1 || y < a || y > b) return null;
  const shell = y <= a + 1 || y >= b - 1;
  if (!shell) return (x >= o.fx0 && x <= o.fx1) ? 'fill' : null;
  if (a + 2 >= b) return o.ridge;                           // ridge cap
  if (x <= o.x0 + 1 || x >= o.x1 - 1) return o.trim;       // barge boards
  const row = Math.floor(k / 2), col = Math.floor((x + (row % 2) * 2) / 4);
  if (k % 2 === 1) return o.dark;                           // shadow line under each course
  return (col + row) % 5 === 0 ? o.alt : o.base;
}
function houseModel() {
  const w = 56, d = 46, h = 52, X0 = 4, X1 = 51, Y0 = 6, Y1 = 39, ZW = 24;
  const roof = { z0: ZW + 1, x0: 1, x1: 54, y0: 3, y1: 42, fx0: X0, fx1: X1, base: P.roof, alt: P.roofL, dark: P.roofD, ridge: '#7e342b', trim: '#6b3a2a' };
  const win = (u, v, u0, v0) => { const du = u - u0, dv = v - v0; if (du < 0 || du > 8 || dv < 0 || dv > 8) return null; if (du === 0 || du === 8 || dv === 0 || dv === 8) return P.woodDD; if (du === 4 || dv === 4) return P.woodD; return (du + dv < 6 && du < 3) ? P.glassL : P.glass; };
  return buildModel(w, d, h, (x, y, z) => {
    if (z === 0 && x >= X0 - 1 && x <= X1 + 1 && y >= Y0 - 1 && y <= Y1 + 1) return (x + y) % 5 ? P.stoneD : P.stone;
    if (x >= 40 && x <= 44 && y >= 13 && y <= 17 && z >= 28 && z <= 50) { if (z >= 49) return '#4a2e26'; return ((z % 3 === 0) || ((x + (Math.floor(z / 3) % 2) * 2) % 4 === 0)) ? '#c8b8a0' : '#8e4a3a'; }
    // front step + flower boxes
    if (y >= Y1 + 1 && y <= Y1 + 3 && x >= 22 && x <= 33 && z <= 1) return z === 1 ? P.stoneL : P.stone;
    if (y === Y1 + 1 && z >= 7 && z <= 9 && ((x >= 8 && x <= 18) || (x >= 37 && x <= 47))) return z === 9 ? ['#f29bb5', '#f4e27a', '#ffffff', '#e0574a'][(x * 7) % 4] : P.woodD;
    if (y === Y1 + 1 && z === 10 && ((x >= 8 && x <= 18) || (x >= 37 && x <= 47)) && x % 2) return '#5ea444';
    if (z >= 1 && z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y === Y1, back = y === Y0, sideL = x === X0, sideR = x === X1;
      if (!(front || back || sideL || sideR)) return P.wall;
      if ((x <= X0 + 1 || x >= X1 - 1) && (y <= Y0 + 1 || y >= Y1 - 1)) return P.woodDD;   // corner posts
      if (z === 12 || z === ZW || z === 1) return P.woodD;                                   // beams
      if (front) {
        if (x >= 23 && x <= 32 && z <= 20) { if (x === 23 || x === 32 || z === 20) return P.woodDD; if (x === 30 && z === 10) return '#f0d060'; return (x % 2) ? '#7a4a2a' : '#6b4226'; }
        const wv = win(x, z, 9, 9) || win(x, z, 38, 9); if (wv) return wv;
      }
      if (back) { const wv = win(x, z, 12, 9) || win(x, z, 35, 9); if (wv) return wv; }
      if (sideL || sideR) { const wv = win(y, z, 18, 9); if (wv) return wv; }
      if ((front || back) && (x === 21 || x === 34) && z > 12) return P.woodD;               // braces
      return z < 12 ? P.wall : P.wallD;
    }
    const r = gableRoof(x, y, z, roof); if (r === 'fill') return (x === X0 || x === X1) ? ((z - ZW) % 6 === 0 ? P.woodD : P.wall) : P.wall; return r;
  });
}
function barnModel() {
  const w = 50, d = 42, h = 48, X0 = 4, X1 = 45, Y0 = 5, Y1 = 36, ZW = 22;
  const roof = { z0: ZW + 1, x0: 1, x1: 48, y0: 2, y1: 39, fx0: X0, fx1: X1, base: '#6d5e52', alt: '#7c6c5e', dark: '#54473e', ridge: '#40362f', trim: '#e8e0cc' };
  return buildModel(w, d, h, (x, y, z) => {
    if (z === 0 && x >= X0 - 1 && x <= X1 + 1 && y >= Y0 - 1 && y <= Y1 + 1) return P.stoneD;
    if (z <= 1 && y >= Y1 + 1 && y <= Y1 + 4 && x >= 15 && x <= 34) return (y % 2) ? P.woodL : P.wood; // ramp
    if (z >= 1 && z <= ZW && x >= X0 && x <= X1 && y >= Y0 && y <= Y1) {
      const front = y === Y1, edge = front || y === Y0 || x === X0 || x === X1;
      if (!edge) return P.barn;
      if ((x <= X0 + 1 || x >= X1 - 1) && (y <= Y0 + 1 || y >= Y1 - 1)) return P.white;
      if (z === ZW) return P.white;
      if (front && x >= 16 && x <= 33 && z <= 18) {
        const u = x - 16, v = z - 1, half = u <= 8 ? u : u - 9;
        if (u === 0 || u === 17 || u === 8 || u === 9 || v === 17 || v === 0) return P.white;
        if (Math.abs(half - v * 8 / 17) < 0.9 || Math.abs(8 - half - v * 8 / 17) < 0.9) return P.white;
        return (x % 2) ? '#8f342c' : '#7e2e27';
      }
      if (!front && y !== Y0 && z >= 8 && z <= 13 && ((y >= 14 && y <= 18) || (y >= 23 && y <= 27))) return (z === 8 || z === 13) ? P.white : '#3a2a22';
      return (x + y) % 3 === 0 ? P.barnD : P.barn;
    }
    if (y === Y1 && x >= 20 && x <= 29 && z >= 26 && z <= 32) { if (x === 20 || x === 29 || z === 26 || z === 32) return P.white; return z <= 28 ? '#e8c878' : '#3a2a22'; } // loft with hay
    const r = gableRoof(x, y, z, roof); if (r === 'fill') return (x % 3 === 0) ? P.barnD : P.barn; return r;
  });
}
function stallModel(part) { // part 'back' (shelf, back posts, awning) or 'front' (counter, front posts): the keeper stands between them
  const w = 40, d = 22, h = 42, keep = y => part === 'back' ? y <= 9 : y >= 10;
  return buildModel(w, d, h, (x, y, z) => {
    if (!keep(y)) return null;
    const post = (x <= 2 || x >= 37) && (y <= 2 || (y >= 17 && y <= 19));
    if (post && x >= 1 && x <= 38 && z <= 35) return (x + z) % 4 ? P.woodD : P.woodDD;
    if (x >= 2 && x <= 37 && y >= 13 && y <= 20 && z <= 11) { if (z === 11) return P.woodL; if (y === 20 && z === 10) return P.woodD; return (x % 5 === 0) ? P.woodD : P.wood; }
    for (const [x0, col, col2] of [[5, '#f08a2a', '#4f9a3a'], [15, '#9fd36a', '#6aae3e'], [25, '#e0574a', '#f29bb5']]) {
      if (x >= x0 && x <= x0 + 8 && y >= 14 && y <= 20) { if (z === 12 || ((x === x0 || x === x0 + 8 || y === 14 || y === 20) && z <= 14)) return P.woodL; if (z >= 13 && z <= 15 && ((x + y * 3 + z) % 3)) return z === 15 && (x + y) % 4 === 0 ? col2 : col; }
    }
    if (y >= 1 && y <= 3 && x >= 4 && x <= 35 && z <= 18 && z >= 15 && x % 8 !== 3) return (z === 18) ? '#f0a030' : '#c9a36b'; // back shelf
    if (y >= 1 && y <= 3 && x >= 4 && x <= 35 && z === 14) return P.woodD;
    if (z >= 35 && z <= 40) { const yb = (40 - z) * 4; if (y >= yb - 1 && y <= yb + 4 && x >= 0 && x <= 39) { const scallop = z === 35 && y >= 19 && (x % 4 === 3); if (scallop) return null; return (Math.floor(x / 4) % 2) ? '#d2474a' : '#f2e6c8'; } }
    return null;
  });
}
function wellModel() {
  return buildModel(20, 20, 30, (x, y, z) => {
    const dd = Math.hypot(x - 9.5, y - 9.5);
    if (z <= 6 && dd >= 5.2 && dd <= 8.2) { const course = Math.floor(z / 2); return ((Math.floor(Math.atan2(y - 9.5, x - 9.5) * 4 + course * 0.5) + course) % 2) ? P.stone : (z % 2 ? P.stoneD : P.stoneL); }
    if (z === 3 && dd < 5.2) return dd < 2.5 ? '#2f6a90' : P.water;
    if ((x <= 2 || x >= 17) && y >= 9 && y <= 10 && z >= 7 && z <= 22) return P.woodD;
    if (z === 19 && y >= 9 && y <= 10 && x >= 1 && x <= 18) return P.wood;
    if (x === 10 && y === 10 && z >= 13 && z <= 18) return '#d8c8a0';
    if (x >= 8 && x <= 12 && y >= 8 && y <= 12 && z >= 9 && z <= 12) return (z === 12) ? '#5b86a2' : '#7aa6c2';
    const r = gableRoof(x, y, z, { z0: 22, x0: 0, x1: 19, y0: 2, y1: 17, fx0: 99, fx1: -1, base: P.roof, alt: P.roofL, dark: P.roofD, ridge: '#7e342b', trim: '#6b3a2a' });
    return r === 'fill' ? null : r;
  });
}
function fenceModel() { return buildModel(13, 2, 10, (x, y, z) => (x <= 1 || x >= 11) ? (z < 10 ? (z === 9 ? P.woodL : P.wood) : null) : ((z === 4 || z === 7) && y === 1) ? (x % 4 ? P.woodL : P.wood) : null); }
// small props, continuous shapes
const benchModel = buildModel(15, 6, 8, (x, y, z) => (z === 4 && y <= 3) ? (x % 3 ? P.woodL : P.wood) : ((x === 1 || x === 13) && z < 4 && y <= 3) ? P.woodD : (y === 0 && z >= 5 && z <= 7 && x >= 1 && x <= 13) ? (z === 6 ? P.woodD : P.wood) : null);
const hayModel = buildModel(15, 12, 10, (x, y, z) => ell(x, y, z, 7, 5.5, 0.5, 7.2, 5.6, 9) < 1 ? (((x + z * 2) % 4 === 0) ? '#cfa850' : (z > 6 ? '#f0d890' : '#e8c878')) : null);
const crateModel = buildModel(8, 8, 8, (x, y, z) => (x === 0 || x === 7 || y === 0 || y === 7 || z === 7 || z === 0) ? (((x === 0 || x === 7) && (y === 0 || y === 7)) || z === 7 && (x + y) % 3 === 0 ? P.woodD : P.wood) : null);
const logsModel = buildModel(13, 8, 7, (x, y, z) => { for (const [cy, cz] of [[1.5, 1.5], [4.5, 1.5], [3, 4.2], [6.5, 1.5]]) if (Math.hypot(y - cy, z - cz) < 1.7) return (x === 0 || x === 12) ? (Math.hypot(y - cy, z - cz) < 0.8 ? '#a07a48' : '#d9b47a') : (z > cz ? P.woodD : P.woodDD); return null; });
const mailModel = buildModel(5, 7, 13, (x, y, z) => (x === 2 && y === 3 && z < 8) ? P.woodD : (z >= 8 && z <= 11 && x >= 1 && x <= 3) ? (x === 3 && y === 6 && z === 11 ? '#e0574a' : z === 11 ? '#6b97d6' : '#4f7fbf') : (x === 4 && y === 2 && z >= 10 && z <= 12) ? '#e0574a' : null);
const cattailModel = buildModel(5, 5, 12, (x, y, z) => ((x === 1 && y === 2) || (x === 3 && y === 1)) && z < 10 ? (z >= 7 && x === 1 ? '#7a5230' : '#5ea444') : (x === 2 && y === 3 && z < 6 ? '#4f8f3a' : null));
const lilyModel = buildModel(6, 6, 1, (x, y) => (Math.hypot(x - 2.5, y - 2.5) < 2.9 && !(x >= 3 && y <= 1)) ? ((x === 2 && y === 3) ? '#f29bb5' : '#5ea444') : null);
// field clutter
function rockModel(seed) {
  const r = mulberry32(seed), w = 10, d = 8, h = 6, cx = 4.5 + r(), cy = 3.5;
  return buildModel(w, d, h, (x, y, z) => { const e = ell(x, y, z, cx, cy, 0.3, 4.6, 3.6, 5.2) + (hash3(x >> 1, y >> 1, z >> 1 + seed) - 0.5) * 0.35; if (e > 1) return null;
    if (z >= 4 && hash3(x, y, seed) < 0.35) return '#7d9a4a'; const n = (cx - x) * 0.2 + (cy - y) * 0.2 + z * 0.3; return n > 1 ? P.stoneL : n > 0 ? P.stone : P.stoneD; });
}
function branchModel(seed) {
  const r = mulberry32(seed), ang = 0.18;
  return buildModel(15, 6, 3, (x, y, z) => {
    const cy = 2.5 + (x - 7) * ang; if (Math.abs(y - cy) < 1 && z <= 1) return z ? P.wood : P.woodD;
    if (x >= 9 && x <= 12 && Math.abs(y - (cy + 1 + (x - 9))) < 0.7 && z === 0) return P.wood;
    if (x >= 3 && x <= 5 && Math.abs(y - (cy - 1 - (x - 3) * 0.8)) < 0.7 && z === 0) return P.woodD;
    if ((x === 13 && Math.abs(y - (cy + 4)) < 1) || (x === 1 && Math.abs(y - cy) < 1.2)) return z <= 1 ? '#5ea444' : null;
    return null;
  });
}
function weedModel(seed) {
  const r = mulberry32(seed); const blades = [];
  for (let i = 0; i < 11; i++) { const a = r() * 6.28, rr = r() * 3; blades.push([4 + Math.cos(a) * rr, 4 + Math.sin(a) * rr, 3 + Math.floor(r() * 6), Math.cos(a) * 0.25, Math.sin(a) * 0.25, r() < 0.45]); }
  return buildModel(9, 9, 9, (x, y, z) => {
    for (const [bx, by, bh, lx, ly, seedHead] of blades) if (Math.round(bx + lx * z) === x && Math.round(by + ly * z) === y && z < bh) return (seedHead && z >= bh - 2) ? '#e6c35c' : (z < 2 ? '#3f7a32' : z < 5 ? '#5a9a3a' : '#7fbf4a');
    if (z === 0 && ell(x, y, 0, 4, 4, 0, 3.6, 3.6, 1) < 1) return '#4f8f3a';
    return null;
  });
}
const CROPS = {
  carrot: { name: '胡萝卜', price: 9, top: '#f08a2a' },
  cabbage: { name: '卷心菜', price: 13, top: '#a5d96a' },
  pumpkin: { name: '南瓜', price: 21, top: '#f0a030' },
};
function leafy(x, y, z, cx, cy, n, hgt, spread, c1, c2) { // n leaves fanning out from a centre, rising with z
  for (let i = 0; i < n; i++) { const a = i / n * 6.28 + 0.4, t = z / hgt; if (t > 1) continue; const rr = spread * Math.sin(t * Math.PI * 0.85);
    if (Math.hypot(x - (cx + Math.cos(a) * rr), y - (cy + Math.sin(a) * rr)) < 0.9 + t * 0.6) return z > hgt * 0.65 ? c2 : c1; }
  return null;
}
function cropModels(type) {
  const s0 = buildModel(7, 7, 2, (x, y, z) => { const dd = Math.hypot(x - 3, y - 3); if (z === 0 && dd < 2.6) return '#6e452a'; if (z === 1 && dd < 1.6) return (x === 3 && y === 3) ? '#e8d9a0' : '#7a5030'; return null; });
  const s1 = buildModel(5, 5, 5, (x, y, z) => { if (x === 2 && y === 2 && z < 4) return '#6aae3e'; if (z >= 3 && ((x === 1 && y === 2) || (x === 3 && y === 2) || (x === 2 && z === 4 && y !== 2))) return '#8fd35a'; return null; });
  const s2 = buildModel(9, 9, 8, (x, y, z) => leafy(x, y, z, 4, 4, 5, 8, 3.4, '#4f9a3a', '#8fd35a') || (x === 4 && y === 4 && z < 5 ? '#4f9a3a' : null));
  let s3;
  if (type === 'carrot') s3 = buildModel(10, 10, 12, (x, y, z) => {
    if (z <= 2 && ell(x, y, z, 4.5, 4.5, -0.5, 2.6, 2.6, 3.4) < 1) return z === 2 ? '#f6a040' : '#f08a2a';
    return leafy(x, y, z - 2, 4.5, 4.5, 6, 10, 3.6, '#3f8a34', '#8fd35a');
  });
  else if (type === 'cabbage') s3 = buildModel(12, 12, 9, (x, y, z) => { const e = ell(x, y, z, 5.5, 5.5, 3, 5.6, 5.6, 5.2); if (e < 0.4) return '#d4f09a'; if (e < 0.62) return '#b5e07a';
    if (e < 1) { const a = Math.atan2(y - 5.5, x - 5.5); return (Math.floor(a * 3 + z * 0.3) % 2) ? '#7fc24a' : '#5ea444'; } return null; });
  else s3 = buildModel(13, 12, 10, (x, y, z) => {
    if (x >= 6 && x <= 6 && y >= 5 && y <= 6 && z >= 7 && z <= 9) return z === 9 ? '#5ea444' : '#7a5230';
    if (z <= 1 && ell(x, y, 0, 11, 9.5, 0, 2.2, 2.2, 1) < 1) return '#4f9a3a';
    const e = ell(x, y, z, 6, 5.5, 3.2, 5.8, 5.2, 4.2); if (e < 1) { const a = Math.atan2(y - 5.5, x - 6); return (Math.floor((a + 3.2) * 2.2) % 2) ? '#f0a030' : '#d9822a'; } return null;
  });
  return [s0, s1, s2, s3];
}

// ---------- layered trees (trunk + dark inside + leaf clumps / pine tiers), authored at screen resolution ----------
// A tree is several small stacks sharing one origin, so leaf clumps can move by whole pixels while the trunk stays still.
const LEAF = { dark: '#2e5e2c', mid: '#4a8a36', light: '#6cb446', hi: '#a6d86a', inside: '#22401f' };
function part(box, fn) { const [x0, x1, y0, y1, z0, z1] = box; const m = buildModel(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1, (x, y, z) => fn(x + x0, y + y0, z + z0));
  return { m, ox: x0 + m.w / 2, oy: y0 + m.d / 2, z: z0 }; }
function clumpFn(cx, cy, cz, r, rz, rr, fruit) { // one ball of leaves lit from up-left; 2x2 bright tufts, a dark rim underneath
  return (x, y, z) => { const e = ell(x + 0.5, y + 0.5, z + 0.5, cx, cy, cz, r, r, rz); if (e > 1 - rr() * 0.1) return null;
    const n = ((cx - x - 0.5) * 0.45 + (cy - y - 0.5) * 0.45 + (z + 0.5 - cz) * 0.85) / r;
    if (fruit && n > -0.1 && n < 0.35 && hash3(x >> 1, y >> 1, z >> 1) < 0.045) return '#d9473c';
    const tuft = ((x >> 1) + (y >> 1) * 2 + (z >> 1)) % 5;
    if (n > 0.55) return tuft < 2 ? LEAF.hi : LEAF.light;
    if (n > 0.18) return tuft === 0 ? LEAF.light : LEAF.mid;
    if (n > -0.25) return tuft === 0 ? LEAF.dark : LEAF.mid;
    return LEAF.dark; };
}
function oakDef(seed) {
  const r = mulberry32(seed), parts = [], clumps = [];
  const H = 17 + Math.floor(r() * 3), CR = 12.5 + r() * 1.7, fruit = r() < 0.5;
  parts.push(part([-6, 5, -6, 5, 0, H + 3], (x, y, z) => {
    const inTrunk = x >= -2 && x <= 1 && y >= -2 && y <= 1 && z <= H;
    const root = z <= 1 && Math.abs(x + 0.5) + Math.abs(y + 0.5) <= 4.5 - z * 1.5;
    const limbA = z >= H - 6 && Math.abs(x - (z - (H - 7)) * 0.8) < 1 && y >= -1 && y <= 0;
    const limbB = z >= H - 4 && Math.abs(-x - 1 - (z - (H - 5)) * 0.8) < 1 && y >= -2 && y <= -1;
    if (inTrunk || root || limbA || limbB) { if (x < -1 && y < 0) return '#5c3d22'; if ((z + (x & 1)) % 5 === 0) return '#5c3d22'; return x >= 1 ? '#9a6a3e' : '#7a5230'; }
    return null; }));
  const cz = H + 8.5;
  const inside = part([-16, 15, -16, 15, H - 2, H + 17], (x, y, z) => ell(x + 0.5, y + 0.5, z + 0.5, 0, 0, cz - 0.5, CR - 2.3, CR - 2.3, 8.7) < 1 ? LEAF.inside : null);
  const spots = [[1, -1, cz + 6.5, 6.0 + r()], [-3, 2, cz + 5, 5.4 + r()]];
  const ring = (n, rad, z, size) => { const a0 = r() * 6.28; for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.28 + (r() - 0.5) * 0.4; spots.push([Math.cos(a) * rad, Math.sin(a) * rad, z + (r() - 0.5) * 2.2, size + r() * 1.1]); } };
  ring(7, CR - 5, cz + 1.1, 5.3); ring(6, CR - 3.8, cz - 4.2, 5.0);
  for (const [x, y, z, rad] of spots) {
    const b = [Math.floor(x - rad), Math.ceil(x + rad), Math.floor(y - rad), Math.ceil(y + rad), Math.max(0, Math.floor(z - rad * 0.85)), Math.ceil(z + rad * 0.85)];
    const p = part(b, clumpFn(x, y, z, rad, rad * 0.85, r, fruit));
    p.w = 0.35 + 0.65 * Math.min(1, Math.hypot(x, y, (z - cz) * 0.7) / (CR - 2.8)); clumps.push(p);
  }
  return { kind: 'oak', parts, inside, clumps, push: 3.0, period: 2.2, damp: 0.35, h: H + 23, union: unionModel([...parts, inside, ...clumps]) };
}
function pineDef(seed) {
  const r = mulberry32(seed), tiers = [];
  const trunk = part([-1, 0, -1, 0, 0, 12], (x) => x === 0 ? '#7a5230' : '#5c3d22');
  const N = 5; let base = 5;
  for (let i = 0; i < N; i++) {
    const R0 = 11 - i * 1.9, th = i === N - 1 ? 12 : 9;
    const p = part([-12, 11, -12, 11, base, base + th - 1], (x, y, z) => { const t = (z - base) / th, rad = R0 * (1 - t * 0.74); const dd = Math.hypot(x + 0.5, y + 0.5);
      const a = Math.atan2(y + 0.5, x + 0.5), jag = 0.9 * Math.max(0, Math.sin(a * 7 + i * 1.3)); // branch tips
      if (dd > rad + jag - r() * 0.5) return null;
      const n = ((-x - 0.5) * 0.5 + (-y - 0.5) * 0.5) / Math.max(1, rad) + t * 0.9;
      if (z <= base + 1 && dd > rad - 2.2) return '#1f4630';
      if (n > 0.8 && ((x + z) & 1)) return '#6aa874';
      return n > 0.62 ? '#4f9460' : n > 0.15 ? '#2f6b45' : '#24553a'; });
    p.up = (base + th / 2) / 44; tiers.push(p); base += th - 2;
  }
  return { kind: 'pine', parts: [trunk], tiers, push: 4.5, period: 2.8, damp: 0.22, h: base + 2, union: unionModel([trunk, ...tiers]) };
}
function bushDef(seed) {
  const r = mulberry32(seed), clumps = [];
  const inside = part([-8, 7, -8, 7, 0, 8], (x, y, z) => ell(x + 0.5, y + 0.5, z + 0.5, 0, 0, 3, 6.5, 6.5, 5) < 1 ? LEAF.inside : null);
  const spots = [[0, 0, 6, 4.6]]; for (let i = 0; i < 4; i++) { const a = r() * 1.2 + i * 1.57; spots.push([Math.cos(a) * 3.6, Math.sin(a) * 3.6, 3.8, 4.0 + r() * 0.6]); }
  for (const [x, y, z, rad] of spots) { const p = part([Math.floor(x - rad), Math.ceil(x + rad), Math.floor(y - rad), Math.ceil(y + rad), Math.max(0, Math.floor(z - rad)), Math.ceil(z + rad)], (xx, yy, zz) => {
      const c = clumpFn(x, y, z, rad, rad, r, false)(xx, yy, zz); if (c && c !== LEAF.dark && hash3(xx, yy, zz + seed) < 0.03) return pick2(r, ['#f4e27a', '#f29bb5', '#ffffff']); return c; });
    p.w = 0.35 + 0.65 * Math.min(1, Math.hypot(x, y) / 3.6); clumps.push(p); }
  return { kind: 'bush', parts: [], inside, clumps, push: 1.7, period: 1.0, damp: 0.35, h: 11, union: unionModel([inside, ...clumps]) };
}
function unionModel(ps) { // combined footprint, used only for the shadow (screen px, centred at cx, cy)
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, h = 0; for (const p of ps) { x0 = Math.min(x0, p.ox - p.m.w / 2); x1 = Math.max(x1, p.ox + p.m.w / 2); y0 = Math.min(y0, p.oy - p.m.d / 2); y1 = Math.max(y1, p.oy + p.m.d / 2); h = Math.max(h, p.z + p.m.h); }
  const w = Math.ceil(x1 - x0), d = Math.ceil(y1 - y0); const foot = document.createElement('canvas'); foot.width = w; foot.height = d; const c = foot.getContext('2d');
  for (const p of ps) c.drawImage(p.m.foot, Math.round(p.ox - p.m.w / 2 - x0), Math.round(p.oy - p.m.d / 2 - y0));
  return { w, d, h, foot, slices: [], cx: (x0 + x1) / 2 / RS, cy: (y0 + y1) / 2 / RS };
}

// ---------- wind: gust patches crossing the map + a breeze around them (world units) ----------
const GUSTS = [];
{ const gr = mulberry32(4242); for (let i = 0; i < 6; i++) GUSTS.push({ t0: i * 20 / 6 + (i === 3 ? -2.0 : 0), speed: 18 + gr() * 6, cy: gr() * WH, hh: i % 3 === 0 ? 0 : 16 + gr() * 8, len: 10 + gr() * 7, str: 0.5 + gr() * 0.75 }); }
let windT = 0;
const WAVE_T = 1.54, WAVE_L = 26;
const wrap = (v, lo, hi) => { const L = hi - lo; return ((v - lo) % L + L) % L + lo; };
function windField(x, y, spread) { let s = 0; const al = x + 0.25 * y;
  for (const g of GUSTS) { const path = g.speed * 20; const d = wrap(al - g.speed * (windT - g.t0), -path / 2, path / 2);
    let a = g.str * Math.exp(-((d / (g.len * spread)) ** 2)); if (g.hh > 0) a *= Math.exp(-(((y - g.cy) / (g.hh * (spread > 1 ? 1.6 : 1))) ** 2)); s += a; } return s; }
if (Q.has('nowind')) GUSTS.forEach(g => g.str = 0);
const gustAt = (x, y) => windField(x, y, 1), breezeAt = (x, y) => Math.min(1.6 * windField(x, y, 2.2), 1);
const phaseAt = (x, y, t) => 2 * Math.PI * (t / WAVE_T - (x + 0.25 * y) / WAVE_L);
const TS = 1.9; // tree art scale vs v1: motion amplitudes grow with it, still whole pixels
function clumpPose(x, y, w, lean, t) { // screen-px downwind offset and lift
  const b = breezeAt(x, y), g = gustAt(x, y), a = phaseAt(x, y, t);
  return [Math.round(lean * w + TS * w * (0.9 * b + 1.3 * g) * (0.5 - 0.5 * Math.cos(a))), Math.round(TS * w * (0.75 * b + 0.5 * g) * Math.max(Math.sin(a), 0))];
}

// ---------- canvas ----------
const cv = document.getElementById('game'), ctx = cv.getContext('2d', { willReadFrequently: true });
cv.width = W; cv.height = H;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const objC = mk(W, H), octx = objC.getContext('2d', { willReadFrequently: true });
const shC = mk(W, H), sctx = shC.getContext('2d');
const litC = mk(W, H), lctx = litC.getContext('2d'); const litImg = lctx.createImageData(W, H);
const GW = Math.ceil((WW + 2 * M) * RS), GH = Math.ceil((WH + 2 * M) * RS);
const groundBase = mk(GW, GH), ground = mk(GW, GH);
[ctx, octx, sctx].forEach(c => c.imageSmoothingEnabled = false);
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
const ART_Q = Q.get('art') || '';
const SPR = { ok: false, img: new Image(), rows: {} };
if (window.PF_SPRITES) { const s = window.PF_SPRITES; s.rows.forEach((n, i) => SPR.rows[n.replace('anim_', '')] = i); SPR.fw = s.fw; SPR.fh = s.fh; SPR.img.onload = () => { SPR.ok = true; SPR.flip = mk(SPR.img.width, SPR.img.height); const c = SPR.flip.getContext('2d'); c.translate(SPR.img.width, 0); c.scale(-1, 1); c.drawImage(SPR.img, 0, 0); }; SPR.img.src = s.src; }

const CROPI = { ok: false, img: new Image() }; // SpriteCook crop billboards: sprout, ripe carrot / cabbage / pumpkin (16x16); ?art=vox keeps voxel crops
if (window.PF_CROPS && ART_Q !== 'vox') { CROPI.img.onload = () => CROPI.ok = true; CROPI.img.src = window.PF_CROPS.src; }

// ---------- world layout (world units; 1 tile = 8) ----------
const HOUSE = { x: 36, y: 25 }, BARN = { x: 156, y: 25 }, WELL = { x: 98, y: 20 }, STALL = { x: 160, y: 100 }, POND = { x: 34, y: 98, rx: 17, ry: 11 }, BENCH = { x: 62, y: 106 };
const DOOR = { x: 36, y: 41 }, BARN_DOOR = { x: 156, y: 41 }, WELL_SPOT = { x: 98, y: 29 }, STALL_SPOT = { x: 160, y: 111 }, BENCH_SPOT = { x: 62, y: 110 };
const KEEPER = { x: 160, y: 97.6 };
const FIELD = { c0: 9, r0: 7, cols: 6, rows: 4 }; // tiles x 72..120, y 56..88
const props = [];
const addProp = (m, x, y, rot = 0, o = {}) => { const p = Object.assign({ m, x, y, rot, z: 0 }, o); props.push(p); return p; };
const models = {
  house: houseModel(), barn: barnModel(), stallB: stallModel('back'), stallF: stallModel('front'), well: wellModel(), fence: fenceModel(),
  rocks: [1, 2, 3, 4].map(s => rockModel(s * 31)), branches: [1, 2].map(s => branchModel(s * 17)), weeds: [1, 2, 3, 4].map(s => weedModel(s * 53)),
  crops: { carrot: cropModels('carrot'), cabbage: cropModels('cabbage'), pumpkin: cropModels('pumpkin') },
};
// ?art=sc swaps in the SpriteCook four-view house carved into voxels (v1 experiment; it reads worse, so it is opt-in)
const PFA = window.PF_ASSETS || {}; const ART = Q.get('art') || '';
function assetModel(a, sc) { const f = sc || 1; return buildModel(a.w * f, a.d * f, a.h * f, (x, y, z) => { const v = a.vox[(Math.floor(z / f) * a.d + Math.floor(y / f)) * a.w + Math.floor(x / f)]; return v ? a.pal[v - 1] : null; }); }
if (PFA.house && ART === 'sc') models.house = assetModel(PFA.house, 2);
addProp(models.house, HOUSE.x, HOUSE.y, 0, { big: 1 });
addProp(models.barn, BARN.x, BARN.y, 0, { big: 1 });
addProp(models.stallB, STALL.x, STALL.y, 0, { big: 1, dy: -4.5 });
addProp(models.stallF, STALL.x, STALL.y, 0, { big: 1, dy: 3.5 });
addProp(models.well, WELL.x, WELL.y, 0);
addProp(benchModel, BENCH.x, BENCH.y, 0);
addProp(hayModel, 182, 44, 0.3); addProp(crateModel, 134, 40, 0.2); addProp(crateModel, 137, 45, -0.4); addProp(logsModel, 62, 22, Math.PI / 2);
addProp(mailModel, 20, 46, 0); addProp(crateModel, 178, 108, 0.1); addProp(hayModel, 138, 116, 1.2);
for (let i = 0; i < 6; i++) addProp(cattailModel, POND.x + Math.cos(i * 1.1 + 2) * (POND.rx + 1), POND.y + Math.sin(i * 1.1 + 2) * (POND.ry + 1), i);
for (let x = 4; x < 66; x += 8) addProp(models.fence, x + 4, 50, 0);
for (let x = 76; x < 130; x += 8) addProp(models.fence, x + 4, 124, 0);
for (let y = 56; y < 120; y += 8) addProp(models.fence, 2, y + 4, Math.PI / 2);
const treeSpots = [[6, 8], [16, 2], [72, 4], [124, 4], [186, 8], [190, 72], [188, 94], [6, 72], [10, 126], [52, 128], [140, 128], [186, 130], [204, 36], [-8, 40], [100, 138], [-8, 104], [204, 116], [62, 146], [150, -8], [40, -10]];
const treeDefs = { oak: [1, 2, 3, 4, 5].map(s => oakDef(s * 77)), pine: [1, 2, 3].map(s => pineDef(s * 91)), bush: [1, 2, 3].map(s => bushDef(s * 13)) };
const addTree = (def, x, y) => props.push({ tree: def, m: def.union, x, y, rot: 0, z: 0, lean: 0, leanV: 0 });
treeSpots.forEach(([x, y], i) => addTree(i % 3 === 2 ? treeDefs.pine[i % 3] : treeDefs.oak[i % 5], x, y));
[[58, 66], [128, 62], [132, 94], [12, 30], [172, 62], [110, 114], [88, 114], [192, 50]].forEach(([x, y], i) => addTree(treeDefs.bush[i % 3], x, y));
const lilies = [0, 1, 2, 3].map(i => addProp(lilyModel, POND.x - 9 + i * 6, POND.y - 3 + (i % 2) * 6, i, { lily: i }));
// ---------- field ----------
const tiles = [];
for (let r = 0; r < FIELD.rows; r++) for (let c = 0; c < FIELD.cols; c++) {
  tiles.push({ c, r, x: (FIELD.c0 + c) * TILE + TILE / 2, y: (FIELD.r0 + r) * TILE + TILE / 2, debris: null, weed: null, tilled: false, crop: null, wetUntil: -1 });
}
function spawnClutter(t, pDebris, pWeed) {
  if (t.crop || t.debris || t.weed) return false;
  const v = rand();
  if (v < pDebris) { const rock = rand() < 0.5; t.debris = { type: rock ? 'rock' : 'branch', m: pick(rock ? models.rocks : models.branches), rot: R(0, 6.28) }; t.tilled = false; return true; }
  if (v < pDebris + pWeed) { t.weed = { m: pick(models.weeds), rot: R(0, 6.28) }; t.tilled = false; return true; }
  return false;
}
tiles.forEach(t => spawnClutter(t, 0.34, 0.42));

// ---------- state ----------
const S = {
  day: 1, t: WAKE, coins: 0, storage: 2, soldToday: 0, totalSold: 0, cleared: 0,
  farmer: { x: DOOR.x, y: DOOR.y, fx: 0, fy: 1, home: true, sleeping: false, task: null, seeds: 0, gathered: 0, crops: [], water: 0, walkPhase: 0, idleCount: 0, selling: false, act: 0 },
  log: [], events: [], label: '起床',
};
const F = S.farmer;
const particles = [];
let groundDirty = true;
const fmtT = t => { const m = ((Math.floor(t) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function log(msg) { S.log.unshift(fmtT(S.t) + ' ' + msg); S.log.length = Math.min(S.log.length, 4); S.events.push({ day: S.day, t: Math.floor(S.t), msg }); }
const rngNear = (list) => { let best = null, bd = 1e9; for (const t of list) { const d = Math.hypot(t.x - F.x, t.y - F.y + 6); if (d < bd) { bd = d; best = t; } } return best; };
const standAt = t => ({ x: t.x - 7, y: t.y + 1 }); // stand beside the tile, so work poses show in profile

// ---------- farmer AI ----------
function chooseTask() {
  const T = S.t % 1440;
  const ripe = tiles.filter(t => t.crop && t.crop.stage === 3);
  const growing = tiles.filter(t => t.crop && t.crop.stage < 3);
  const dry = growing.filter(t => t.wetUntil < S.t);
  const debris = tiles.filter(t => t.debris), weeds = tiles.filter(t => t.weed);
  const tilledEmpty = tiles.filter(t => t.tilled && !t.crop);
  const tillable = tiles.filter(t => !t.tilled && !t.crop && !t.debris && !t.weed);
  const seedsAvail = S.storage + F.seeds + F.gathered;

  if (T >= BEDTIME || T < WAKE - 30) {
    if (F.crops.length && T < BEDTIME + 60) return sellTask();
    if (F.gathered > 0 && T < BEDTIME + 60) return { label: '正在把种子放进仓库', to: BARN_DOOR, dur: 8, done: () => { log(`把 ${F.gathered} 颗种子放进仓库`); S.storage += F.gathered; F.gathered = 0; } };
    return { label: '回家睡觉', to: DOOR, dur: 5, done: () => { F.home = true; F.sleeping = true; log('回到家，躺下睡觉 Zzz'); } };
  }
  if (F.selling && F.crops.length) return sellTask();
  F.selling = false;
  if (F.crops.length >= 10) return sellTask();
  if (debris.length) { const t = rngNear(debris); const rock = t.debris.type === 'rock';
    return { label: '正在清理杂物', to: standAt(t), tile: t, dur: rock ? 8 : 6, fx: rock ? 'rock' : 'wood', pose: 'pull', done: () => { t.debris = null; S.cleared++; burst(t.x, t.y, 2, rock ? ['#9a9a92', '#b9b8ad', '#77776f'] : ['#a0703f', '#7a5230'], 10); log(rock ? '搬走了一块石头' : '清走了一根树枝'); groundDirty = true; } }; }
  if (weeds.length) { const t = rngNear(weeds);
    return { label: '正在拔草收集种子', to: standAt(t), tile: t, dur: 6, fx: 'leaf', pose: 'pull', done: () => { t.weed = null; const n = RI(2, 3); F.gathered += n; burst(t.x, t.y, 3, ['#5a9a3a', '#e6c35c', '#3f7a32'], 10); popText(t.x, t.y, 10, '+' + n, '#e6c35c'); log(`拔掉杂草，收集到 ${n} 颗种子`); } }; }
  if (F.gathered > 0 && (F.gathered >= 12 || (weeds.length === 0 && (F.gathered >= 4 || S.t % 1440 >= 18 * 60)))) {
    return { label: '正在把种子放进仓库', to: BARN_DOOR, dur: 8, done: () => { log(`把 ${F.gathered} 颗种子放进仓库`); S.storage += F.gathered; F.gathered = 0; } };
  }
  if (ripe.length) { const t = rngNear(ripe);
    return { label: '正在收获', to: standAt(t), tile: t, dur: 4, fx: 'leaf', pose: 'pull', done: () => { const ty = t.crop.type; F.crops.push(ty); t.crop = null; t.tilled = false; groundDirty = true; burst(t.x, t.y, 4, ['#f0a030', '#8fd35a', '#ffffff'], 8); popText(t.x, t.y, 12, '+1', '#ffffff'); if (rand() < 0.35) { F.gathered++; } log(`收获了一个${CROPS[ty].name}`); } }; }
  if (dry.length) {
    if (F.water <= 0) return { label: '正在井边打水', to: WELL_SPOT, dur: 8, fx: 'water', done: () => { F.water = 8; log('在井边装满了水壶'); } };
    const t = rngNear(dry);
    return { label: '正在浇水', to: standAt(t), tile: t, dur: 3, fx: 'water', pose: 'water', done: () => { F.water--; t.wetUntil = S.t + 210; groundDirty = true; burst(t.x, t.y, 6, ['#8cc6dc', '#5b9cc4'], 10, 'drop'); } };
  }
  if (tilledEmpty.length && (F.seeds > 0 || S.storage > 0 || F.gathered > 0)) {
    if (F.seeds <= 0) { if (F.gathered > 0 && S.storage === 0) { F.seeds = F.gathered; F.gathered = 0; } }
    if (F.seeds <= 0) { const n = Math.min(S.storage, tilledEmpty.length + tillable.length); return { label: '正在从仓库取种子', to: BARN_DOOR, dur: 5, done: () => { S.storage -= n; F.seeds += n; log(`从仓库取出 ${n} 颗种子`); } }; }
    const t = rngNear(tilledEmpty);
    return { label: '正在播种', to: standAt(t), tile: t, dur: 3, fx: 'seed', pose: 'pull', done: () => { F.seeds--; const r = rand(); t.crop = { type: r < 0.45 ? 'carrot' : r < 0.8 ? 'cabbage' : 'pumpkin', growth: 0, stage: 0, rot: R(0, 6.28) }; groundDirty = true; } };
  }
  if (tillable.length && seedsAvail > tilledEmpty.length && T < 17 * 60) { const t = rngNear(tillable);
    return { label: '正在开垦土地', to: standAt(t), tile: t, dur: 4, fx: 'dirt', pose: 'hoe', done: () => { t.tilled = true; groundDirty = true; burst(t.x, t.y, 1, ['#8b5a35', '#a06c43', '#6e452a'], 8); } }; }
  if (F.crops.length && (growing.length === 0 || T >= 17 * 60 + 30 || F.crops.length >= 6)) return sellTask();
  // nothing urgent: rest or stroll
  F.idleCount++;
  if (F.idleCount % 3 === 0) { const t = pick(tiles); return { label: '在田边巡视', to: { x: t.x + R(-6, 6), y: FIELD.r0 * TILE - 4 }, dur: 6 }; }
  return { label: '坐在池塘边休息', to: BENCH_SPOT, dur: 25, rest: true };
}
function sellTask() {
  return { label: F.selling ? '正在卖出作物' : '正在去市场卖菜', to: STALL_SPOT, via: Math.hypot(F.x - STALL_SPOT.x, F.y - STALL_SPOT.y) > 3 && F.y < STALL_SPOT.y - 2 ? [{ x: 140, y: Math.min(92, Math.max(F.y, 56)) }, { x: 140, y: STALL_SPOT.y }] : [], dur: 3, fx: 'coin', done: () => {
    F.selling = true; const ty = F.crops.shift(); if (!ty) return; const p = CROPS[ty].price;
    S.coins += p; S.soldToday++; S.totalSold++; popText(STALL.x + R(-4, 4), STALL.y - 3, 26, '+' + p, '#ffd76a'); burst(STALL_SPOT.x, STALL_SPOT.y - 6, 10, ['#ffd76a', '#fff2a8'], 6, 'spark');
    if (!F.crops.length) { log(`卖菜完成，今天共卖出 ${S.soldToday} 个`); F.selling = false; } } };
}

// ---------- simulation ----------
function overnight() {
  S.day++; S.soldToday = 0;
  let n = 0; tiles.forEach(t => { if (!t.crop && spawnClutter(t, 0.16, 0.24)) n++; });
  tiles.forEach(t => { if (t.tilled && !t.crop && rand() < 0.4) t.tilled = false; });
  groundDirty = true; log(`新的一天！夜里长出了 ${n} 处杂草杂物`);
}
function stepSim(dm) {
  const prevDay = Math.floor((S.t - WAKE) / 1440);
  S.t += dm;
  const T = S.t % 1440;
  if (Math.floor((S.t - WAKE) / 1440) !== prevDay) { // reached 6:00
    overnight(); if (F.sleeping) { F.sleeping = false; F.home = true; log('起床啦，开始干活'); }
  }
  // crops grow while wet
  for (const t of tiles) if (t.crop && t.crop.stage < 3) {
    if (t.wetUntil >= S.t) { t.crop.growth += dm; const st = Math.min(3, Math.floor(t.crop.growth / 75)); if (st !== t.crop.stage) { t.crop.stage = st; if (st === 3) burst(t.x, t.y, 6, ['#fff2a8', '#ffffff'], 6, 'spark'); } }
    if (t.wetUntil < S.t && t.wetUntil > S.t - dm - 0.001) groundDirty = true;
  }
  if (F.sleeping) { S.label = '睡觉中 Zzz'; return; }
  if (!F.task) { F.task = chooseTask(); F.task.work = 0; S.label = F.task.label; if (F.task.label !== '回家睡觉' || !F.home) F.home = false; }
  const k = F.task;
  while (k.via && k.via.length && Math.hypot(k.via[0].x - F.x, k.via[0].y - F.y) <= 0.5) k.via.shift();
  const tgt = (k.via && k.via.length) ? k.via[0] : k.to;
  const dx = tgt.x - F.x, dy = tgt.y - F.y, dist = Math.hypot(dx, dy);
  if (dist > 0.5) { const st = Math.min(dist, WALK * dm); F.x += dx / dist * st; F.y += dy / dist * st; F.fx = dx / dist; F.fy = dy / dist; F.walkPhase += st; F.act = 0; F.home = false; F.moving = true; }
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
const DEFAULT_A = Q.has('angle') ? +Q.get('angle') : 0.42;
const cam = { x: WW / 2, y: WH / 2 + 2, a: DEFAULT_A, ta: DEFAULT_A };
let CA = Math.cos(cam.a), SA = Math.sin(cam.a);
// The camera never drifts: it is fixed on the farm centre, and its screen offset is snapped to whole pixels once per frame.
// Every object then keeps the same sub-pixel phase between frames, so nothing re-rounds and shimmers (v2's soft follow did).
let CX = 0, CY = 0;
function setCam() { CA = Math.cos(cam.a); SA = Math.sin(cam.a); CX = Math.round(W / 2 - (cam.x * CA - cam.y * SA) * RS); CY = Math.round(H / 2 + 10 - (cam.x * SA + cam.y * CA) * K * RS); }
function proj(x, y) { const rx = x * CA - y * SA, ry = x * SA + y * CA; return [CX + rx * RS, CY + ry * K * RS, ry]; }
function stackCanvas(m, a) { // a static stack drawn once per camera angle (translation-invariant: everything snaps to whole pixels)
  const map = m._ck || (m._ck = new Map()); let k = map.get(a); if (k) return k;
  if (map.size > 40) map.clear(); k = {}; map.set(a, k);
  const ca = Math.cos(a), sa = Math.sin(a), r = Math.ceil(Math.hypot(m.w, m.d) / 2) + 1;
  if (!k.c) { k.c = mk(2 * r, Math.ceil(2 * r * K) + m.h + 2); k.g = k.c.getContext('2d'); k.g.imageSmoothingEnabled = false; }
  k.ox = r; k.oy = Math.ceil(r * K) + m.h; k.g.setTransform(1, 0, 0, 1, 0, 0); k.g.clearRect(0, 0, k.c.width, k.c.height);
  for (let i = 0; i < m.h; i++) { const sl = m.slices[i]; if (!sl) continue; k.g.setTransform(ca, sa * K, -sa, ca * K, k.ox, k.oy - i); k.g.drawImage(sl, -m.w / 2, -m.d / 2); }
  k.g.setTransform(1, 0, 0, 1, 0, 0); return k;
}
function drawStack(c, m, x, y, z, rot, sway) { // z and sway in screen px
  const [sx, sy] = proj(x, y); const a = cam.a + rot, ca = Math.cos(a), sa = Math.sin(a);
  const bx = Math.round(sx), by = Math.round(sy);
  if (!sway && m.h >= 6 && !m.noCache) { const k = stackCanvas(m, a); c.drawImage(k.c, bx - k.ox, by - Math.round(z) - k.oy); return; }
  for (let i = 0; i < m.h; i++) {
    const sl = m.slices[i]; if (!sl) continue;
    let ox = 0; if (sway) ox = Math.round(sway * (i / m.h) ** 2);
    c.setTransform(ca, sa * K, -sa, ca * K, bx + ox, by - Math.round(z) - i);
    c.drawImage(sl, -m.w / 2, -m.d / 2);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}
function drawFoot(c, m, x, y, rot, ox, oy) {
  const [sx, sy] = proj(x + ox, y + oy); const a = cam.a + rot, ca = Math.cos(a), sa = Math.sin(a);
  c.setTransform(ca, sa * K, -sa, ca * K, Math.round(sx), Math.round(sy)); c.drawImage(m.foot, -m.w / 2, -m.d / 2); c.setTransform(1, 0, 0, 1, 0, 0);
}
function vnoise(x, y, s) { const h = (i, j) => { let n = i * 374761393 + j * 668265263 + s * 1442695; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);
const pathSegs = [[DOOR.x, DOOR.y, DOOR.x, 54], [DOOR.x, 54, 68, 54], [68, 54, 124, 54], [124, 54, 124, 92], [68, 54, 68, 92], [68, 92, 124, 92], [124, 54, 156, 54], [156, 54, BARN_DOOR.x, BARN_DOOR.y], [98, 54, WELL_SPOT.x, WELL_SPOT.y], [124, 92, 140, 92], [140, 92, 140, STALL_SPOT.y], [140, STALL_SPOT.y, STALL_SPOT.x + 6, STALL_SPOT.y], [68, 92, 68, BENCH_SPOT.y], [68, BENCH_SPOT.y, BENCH_SPOT.x, BENCH_SPOT.y]];
function segDist(px, py, [x1, y1, x2, y2]) { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / l; t = clamp(t, 0, 1); return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); }
function buildGroundBase() { // one ground pixel per screen pixel (world unit = RS px)
  const g = groundBase.getContext('2d'), img = g.createImageData(GW, GH), d = img.data;
  for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) {
    const x = px / RS - M, y = py / RS - M; let col;
    const n = vnoise(x / 9, y / 9, 1) * 0.7 + vnoise(x / 3, y / 3, 2) * 0.3;
    col = P.grass[n < 0.35 ? 2 : n < 0.55 ? 0 : n < 0.72 ? 1 : 3];
    const blade = hash3(px >> 1, py, 7) ; // little 1x2 grass tufts
    if (blade > 0.93 && hash3(px >> 1, py + 1, 7) <= 0.93) col = P.grassDark; else if (blade > 0.985) col = '#a6d06a';
    if (vnoise(x / 14, y / 14, 11) > 0.66 && hash3(px >> 1, py >> 1, 5) < 0.035) col = P.flower[Math.floor(vnoise(x / 14, y / 14, 12) * 4)];
    let pd = 99; for (const s of pathSegs) pd = Math.min(pd, segDist(x, y, s));
    const pw = 3.4 + vnoise(x / 4, y / 4, 7) * 1.2;
    if (pd < pw) col = (pd > pw - 0.7) ? P.dirtD : (hash3(px >> 1, py >> 1, 9) > 0.9 ? '#d8b98a' : hash3(px, py, 4) > 0.85 ? P.dirtD : P.dirt);
    const e = ((x - POND.x) / POND.rx) ** 2 + ((y - POND.y) / POND.ry) ** 2;
    if (e < 1) col = e < 0.35 ? P.water : e < 0.72 ? P.waterM : (e < 0.86 ? P.waterL : P.waterM); else if (e < 1.22) col = e < 1.1 ? '#b9a77a' : '#5f8a3a';
    const out = Math.max(-x, x - WW, -y, y - WH, 0);
    let c = hex(col); if (out > 0) { const f = Math.max(0.55, 1 - out / 60); c = c.map(v => v * f); }
    const p = (py * GW + px) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function buildGround() {
  const g = ground.getContext('2d', { willReadFrequently: true }); g.drawImage(groundBase, 0, 0);
  const img = g.getImageData(0, 0, GW, GH), d = img.data;
  const put = (px, py, col) => { const c = hex(col), p = (py * GW + px) * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; };
  for (const t of tiles) {
    const X0 = Math.round((t.x - 4 + M) * RS), X1 = Math.round((t.x + 4 + M) * RS) - 1, Y0 = Math.round((t.y - 4 + M) * RS), Y1 = Math.round((t.y + 4 + M) * RS) - 1, wet = t.wetUntil >= S.t;
    for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
      const lx = px - X0, ly = py - Y0, edgeX = px === X0 || px === X1, edgeY = py === Y0 || py === Y1;
      if (t.tilled || t.crop) { if (edgeX && edgeY) continue; const f = ly % 4; // ridges and furrows
        const c = f === 0 ? (wet ? P.wetH : P.soilH) : f === 3 ? (wet ? P.wetF : P.soilF) : (wet ? P.wet : P.soil);
        put(px, py, (edgeX || edgeY) ? (wet ? P.wetF : P.soilF) : (f !== 3 && hash3(px, py, 3) > 0.92 ? (wet ? P.wetF : P.soilF) : c)); }
      else { const n = vnoise(px * 0.5, py * 0.5, 3); if (edgeX && edgeY) continue; put(px, py, n > 0.64 ? '#a99a5c' : n > 0.4 ? '#93a84f' : '#86a347'); }
    }
  }
  g.putImageData(img, 0, 0); groundDirty = false;
}
const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000', Z: '111001010100111' };
function pixText(s, x, y, col, sc = 1) {
  const w = s.length * 4 * sc - sc; x = Math.round(x - w / 2); y = Math.round(y);
  for (const pass of [0, 1]) { ctx.fillStyle = pass ? col : '#2a1e1a';
    [...s].forEach((ch, i) => { const g = FONT[ch]; if (!g) return; for (let k = 0; k < 15; k++) if (g[k] === '1') { const gx = x + (i * 4 + k % 3) * sc, gy = y + Math.floor(k / 3) * sc;
      if (pass) ctx.fillRect(gx, gy, sc, sc); else for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(gx + ox, gy + oy, sc, sc); } }); }
}
function dayLight(T) { const h = T / 60; if (h >= 6.3 && h < 17.5) return 0; if (h >= 17.5 && h < 20.5) return (h - 17.5) / 3; if (h >= 20.5 || h < 4.5) return 1; return Math.max(0, 1 - (h - 4.5) / 1.8); }
function warmth(T) { const h = T / 60; const a = Math.max(0, 1 - Math.abs(h - 18.3) / 1.6), b = Math.max(0, 1 - Math.abs(h - 6) / 1.2); return Math.max(a, b * 0.8); }

// ---------- billboards: the farmer and the keeper are flat 2D sprites standing upright at their feet ----------
const SEQ = { hoe: [0, 1, 1, 2, 3, 3], pull: [1, 2, 3, 3, 2], water: [1, 2, 3, 3, 3, 2] };
function farmerPose() {
  const sx = F.fx * CA - F.fy * SA, sy = F.fx * SA + F.fy * CA; // facing turned into screen space
  const side = Math.abs(sx) > Math.abs(sy) * 0.9, flip = sx < 0;
  const k = F.task;
  if (!F.moving && k && k.pose && k.work > 0) { const q = SEQ[k.pose]; return { row: k.pose, fr: q[Math.floor(realT * 6) % q.length], flip: Math.abs(sx) < 0.05 ? false : flip }; }
  const dir = side ? 'walk_side' : sy > 0 ? 'walk_front' : 'walk_back';
  if (F.moving) return { row: (side && F.crops.length) ? 'carry' : dir, fr: Math.floor(realT * 8) % 4, flip: side && flip, dir };
  if (k && k.rest) return { row: 'walk_front', fr: 0, flip: false, dir: 'walk_front' };
  return { row: dir, fr: 0, flip: side && flip, dir };
}
function drawBillboard(c, o, alpha = 1) {
  const [sx, sy] = proj(o.x, o.y); const r = SPR.rows[o.row]; if (r === undefined || !SPR.ok) return;
  const fw = SPR.fw, fh = SPR.fh, src = o.flip ? SPR.flip : SPR.img, fx = o.flip ? SPR.img.width - (o.fr + 1) * fw : o.fr * fw;
  const dx = Math.round(sx) - 18, dy = Math.round(sy) - 35 - Math.round(o.z || 0);
  c.globalAlpha = alpha; c.drawImage(src, fx, r * fh, fw, fh, dx, dy, fw, fh);
  if (o.basket) drawBasket(c, dx, dy, o);
  c.globalAlpha = 1;
}
function drawBasket(c, dx, dy, o) { // little wicker basket of the last crop, held in front (hidden from behind)
  if (o.row === 'walk_back') return;
  const bx = dx + (o.row === 'walk_front' ? 13 : o.flip ? 7 : 19), by = dy + 21, top = CROPS[o.basket].top;
  c.fillStyle = '#2a1e1a'; c.fillRect(bx - 1, by, 12, 7); c.fillRect(bx, by - 2, 10, 2);
  c.fillStyle = top; c.fillRect(bx + 1, by - 2, 8, 3); c.fillStyle = '#ffffff'; c.globalAlpha *= 0.6; c.fillRect(bx + 2, by - 2, 2, 1); c.globalAlpha = 1;
  c.fillStyle = '#c9a36b'; c.fillRect(bx, by + 1, 10, 5); c.fillStyle = '#a0703f'; for (let i = 0; i < 10; i += 2) c.fillRect(bx + i, by + 2 + (i % 4 ? 1 : 0), 1, 2);
  c.fillStyle = '#7a5230'; c.fillRect(bx, by + 5, 10, 1);
}
function bbShadow(c, o) { const [sx, sy] = proj(o.x, o.y); const x = Math.round(sx), y = Math.round(sy); c.fillStyle = '#000';
  c.fillRect(x - 5, y - 2, 11, 4); c.fillRect(x - 7, y - 1, 15, 2); }

// ---------- render ----------
let realT = 0;
const leaves = [], fireflies = [];
let layerDirty = false;
function flush() { if (!layerDirty) return; outlineLayer(); ctx.drawImage(objC, 0, 0); octx.clearRect(0, 0, W, H); layerDirty = false; }
function render() {
  setCam();
  if (groundDirty) buildGround();
  const T = S.t % 1440, night = dayLight(T), warm = warmth(T);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#1b2a24'; ctx.fillRect(0, 0, W, H);
  const [gx, gy] = proj(-M, -M);
  ctx.setTransform(CA, SA * K, -SA, CA * K, Math.round(gx), Math.round(gy)); ctx.drawImage(ground, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const list = [];
  for (const p of props) list.push(p);
  for (const t of tiles) {
    if (t.debris) list.push({ m: t.debris.m, x: t.x, y: t.y, rot: t.debris.rot, z: 0 });
    if (t.weed) list.push({ m: t.weed.m, x: t.x, y: t.y, rot: t.weed.rot, z: 0, sway: 1 });
    if (t.crop) { if (CROPI.ok && CROPI.on !== false && t.crop.stage === 3) list.push({ cbb: 1 + ['carrot', 'cabbage', 'pumpkin'].indexOf(t.crop.type), x: t.x, y: t.y, flip: t.crop.rot > 3.14 });
      else list.push({ m: models.crops[t.crop.type][t.crop.stage], x: t.x, y: t.y, rot: t.crop.rot, z: 0, sway: t.crop.stage >= 2 ? 0.8 : 0 }); }
  }
  let farmerD = null;
  if (!F.home) { farmerD = Object.assign({ bb: 1, x: F.x, y: F.y, basket: F.crops.length ? F.crops[F.crops.length - 1] : null }, farmerPose()); list.push(farmerD); }
  const selling = F.task && F.task.to === STALL_SPOT && !F.moving && !F.home;
  list.push({ bb: 1, x: KEEPER.x, y: KEEPER.y, row: 'keeper', fr: selling ? Math.floor(realT * 5) % 4 : (Math.floor(realT * 0.8) % 5 === 4 ? 1 : 0), flip: false });
  lilies.forEach(l => { l.z = Math.sin(realT * 1.5 + l.lily) > 0.6 ? 1 : 0; });
  for (const o of list) o.depth = proj(o.x, o.y + (o.dy || 0))[2] + (o.bb ? 0.3 : 0);
  list.sort((a, b) => a.depth - b.depth);
  // shadows (one layer, so they never double-darken)
  sctx.clearRect(0, 0, W, H);
  const sun = clamp((T - 6 * 60) / (12 * 60), 0, 1), sdx = (sun - 0.5) * -1.2, shA = 0.3 * (1 - night * 0.8);
  for (const o of list) { if (o.lily || o.cbb !== undefined) continue; if (o.bb) { bbShadow(sctx, o); continue; } const s = o.m.h / RS * 0.25; drawFoot(sctx, o.m, o.x + (o.m.cx || 0), o.y + (o.m.cy || 0), o.rot, sdx * s, 0.35 * s); }
  ctx.globalAlpha = shA; ctx.drawImage(shC, 0, 0); ctx.globalAlpha = 1;
  // stacks go into a layer that gets one outline pass; a billboard (already outlined) flushes the layer first, so depth order still holds
  const poseT = Math.floor(realT * 10) / 10;
  for (const o of list) {
    if (o.bb) { flush(); drawBillboard(ctx, o); continue; }
    layerDirty = true;
    if (o.tree) { drawTree(octx, o, poseT); continue; }
    if (o.cbb !== undefined) { drawCrop(octx, o, poseT); continue; }
    let sway = 0; if (o.sway) { const [dx] = clumpPose(o.x, o.y, o.sway, 0, poseT); sway = dx * CA; }
    drawStack(octx, o.m, o.x, o.y, o.z || 0, o.rot || 0, sway);
  }
  flush();
  if (farmerD) drawBillboard(ctx, farmerD, 0.35); // ghost, so he never disappears behind the barn or a tree
  for (const p of particles) { if (p.text) continue; const [sx, sy] = proj(p.x, p.y); ctx.fillStyle = p.c; const s = p.kind === 'smoke' ? 3 : 2; ctx.fillRect(Math.round(sx), Math.round(sy - p.z * RS), p.kind === 'drop' ? 1 : s, p.kind === 'drop' ? 3 : s); }
  for (const l of leaves) { const [sx, sy] = proj(l.x, l.y); ctx.fillStyle = l.c; ctx.fillRect(Math.round(sx + Math.sin(l.ph) * 3), Math.round(sy - l.z), 2, 1); }
  for (let i = 0; i < 6; i++) { const a = i * 1.3 + Math.floor(realT * 0.8 + i) * 2.1; const gx2 = POND.x + Math.cos(a) * POND.rx * 0.6, gy2 = POND.y + Math.sin(a * 1.7) * POND.ry * 0.6; if ((Math.floor(realT * 3 + i * 1.7)) % 4 === 0) { const [sx, sy] = proj(gx2, gy2); ctx.fillStyle = '#e8f6ff'; ctx.fillRect(Math.round(sx), Math.round(sy), 3, 1); } }
  if (warm > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgba(255,${190 + 40 * (1 - warm)},${150 + 80 * (1 - warm)},${0.55 * warm})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (night > 0) lighting(night, T);
  if (night > 0.5) for (const f of fireflies) { const [sx, sy] = proj(f.x, f.y); if (Math.sin(realT * 3 + f.ph) > 0.2) { ctx.fillStyle = '#f6f29a'; ctx.fillRect(Math.round(sx), Math.round(sy - f.z * RS), 1, 1); } }
  for (const p of particles) if (p.text) { const [sx, sy] = proj(p.x, p.y); pixText(p.text, sx, sy - p.z * RS, p.c); }
  if (F.sleeping || (F.home && night > 0.7)) {
    const [sx, sy] = proj(HOUSE.x + 8, HOUSE.y - 5);
    for (let i = 0; i < 3; i++) { const ph = (realT * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - ph; pixText('Z', sx + 6 + ph * 18 + Math.sin(ph * 6) * 3, sy - 58 - ph * 26, '#f4f0ff', ph > 0.5 ? 2 : 1); }
    ctx.globalAlpha = 1;
  }
}
function drawCrop(c, o, poseT) { // flat billboard; the leafy top half sways with the same wind as the trees
  const [sx, sy] = proj(o.x, o.y), x = Math.round(sx) - 8, y = Math.round(sy) - 12, u = o.cbb * 16;
  const [dx] = clumpPose(o.x, o.y, 0.45, 0, poseT);
  if (o.flip) { c.save(); c.translate(x + 16, 0); c.scale(-1, 1); c.drawImage(CROPI.img, u, 0, 16, 9, 0 - dx, y, 16, 9); c.drawImage(CROPI.img, u, 9, 16, 7, 0, y + 9, 16, 7); c.restore(); return; }
  c.drawImage(CROPI.img, u, 0, 16, 9, x + dx, y, 16, 9); c.drawImage(CROPI.img, u, 9, 16, 7, x, y + 9, 16, 7);
}
function drawTree(c, o, poseT) { // parts placed relative to the tree's whole-pixel origin, so the result can be cached per pose
  const T = o.tree, items = [];
  const rel = p => [Math.round(p.ox * CA - p.oy * SA), Math.round((p.ox * SA + p.oy * CA) * K), p.ox * SA + p.oy * CA];
  if (T.inside) items.push([T.inside, 0, 0]);
  for (const p of T.parts) items.push([p, 0, 0]);
  if (T.clumps) { const cl = T.clumps.map(p => [p, rel(p)[2]]).sort((a, b) => a[1] - b[1]);
    for (const [p] of cl) { const [dx, dz] = clumpPose(o.x + p.ox / RS, o.y + p.oy / RS, p.w, o.lean, poseT); items.push([p, dx, dz]); } }
  if (T.tiers) for (const p of T.tiers) { const bend = Math.round(o.lean * p.up * p.up * 1.6); const [dx, dz] = clumpPose(o.x, o.y, 0.35 + 0.65 * p.up, 0, poseT); items.push([p, bend + dx, Math.min(dz, 2)]); }
  const key = cam.a + '|' + items.map(i => i[1] + ',' + i[2]).join(';');
  const k = o._ck || (o._ck = {});
  if (k.key !== key) {
    if (!T.R) { T.R = 0; for (const p of [...T.parts, ...(T.clumps || []), ...(T.tiers || []), ...(T.inside ? [T.inside] : [])]) T.R = Math.max(T.R, Math.hypot(p.ox, p.oy) + Math.hypot(p.m.w, p.m.d) / 2); T.R = Math.ceil(T.R) + 10; }
    if (!k.c) { k.c = mk(2 * T.R, Math.ceil(2 * T.R * K) + T.h + 12); k.g = k.c.getContext('2d'); k.g.imageSmoothingEnabled = false; }
    const g = k.g; k.ox = T.R; k.oy = Math.ceil(T.R * K) + T.h + 8; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, k.c.width, k.c.height);
    for (const [p, dxw, dz] of items) { const [rx, ry] = rel(p); const m = p.m;
      const bx = k.ox + rx + Math.round(dxw * CA), by = k.oy + ry + Math.round(dxw * SA * K) - Math.round(p.z + dz);
      for (let i = 0; i < m.h; i++) { const sl = m.slices[i]; if (!sl) continue; g.setTransform(CA, SA * K, -SA, CA * K, bx, by - i); g.drawImage(sl, -m.w / 2, -m.d / 2); } }
    g.setTransform(1, 0, 0, 1, 0, 0); k.key = key;
  }
  const [sx, sy] = proj(o.x, o.y); c.drawImage(k.c, Math.round(sx) - k.ox, Math.round(sy) - k.oy);
}
function outlineLayer() { // transparent pixels next to the finished layer turn into a dark outline
  const img = octx.getImageData(0, 0, W, H), d = img.data, out = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (d[i * 4 + 3]) continue;
    if (d[(i - 1) * 4 + 3] || d[(i + 1) * 4 + 3] || d[(i - W) * 4 + 3] || d[(i + W) * 4 + 3]) out[i] = 1;
  }
  for (let i = 0; i < W * H; i++) if (out[i]) { d[i * 4] = 42; d[i * 4 + 1] = 30; d[i * 4 + 2] = 26; d[i * 4 + 3] = 210; }
  octx.putImageData(img, 0, 0);
}
function lighting(night, T) {
  const lights = [];
  const hz = (x, y, z, r, s = 1) => { const [sx, sy] = proj(x, y); lights.push([sx, sy - z, r, s]); };
  if (T >= 17 * 60 + 30 || T < WAKE + 30) { hz(HOUSE.x - 9, HOUSE.y + 10, 13, 42); hz(HOUSE.x + 8.4, HOUSE.y + 10, 13, 42); hz(HOUSE.x, HOUSE.y - 10, 13, 30); }
  hz(STALL.x, STALL.y, 24, 36, 0.8); hz(BARN_DOOR.x, BARN_DOOR.y, 16, 26, 0.6); hz(WELL.x, WELL.y, 14, 20, 0.5);
  if (!F.home) hz(F.x, F.y, 14, 40);
  const d = litImg.data, A = night * 0.7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let L = 0; for (const [lx, ly, r, s] of lights) { const dd = Math.hypot(x - lx, (y - ly) * 1.25) / r; if (dd < 1) L = Math.max(L, (1 - dd) * s); }
    const q = Math.min(1, Math.floor(L * 4 + BAYER[(y & 3) * 4 + (x & 3)]) / 3);
    const p = (y * W + x) * 4;
    d[p] = 14 + (255 - 14) * q; d[p + 1] = 18 + (180 - 18) * q; d[p + 2] = 52 + (90 - 52) * q; d[p + 3] = 255 * (A * (1 - q) + 0.18 * night * q);
  }
  lctx.putImageData(litImg, 0, 0); ctx.drawImage(litC, 0, 0);
}
function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.kind === 'smoke') continue; if (!p.text) { p.vz -= 40 * dt; if (p.z < 0) { p.z = 0; p.vx *= 0.5; p.vy *= 0.5; p.vz = 0; } } else p.vz *= 0.97; }
  windT += dt;
  for (const o of props) if (o.tree) { const T = o.tree, k = 2 * Math.PI / T.period, g = gustAt(o.x, o.y);
    o.leanV += (k * k * (T.push * g - o.lean) - 2 * T.damp * k * o.leanV) * dt; o.lean += o.leanV * dt;
    if (T.kind === 'oak' && Math.random() < dt * g * 0.6) leaves.push({ x: o.x + R(-6, 6), y: o.y + R(-6, 6), z: T.h - 8, ph: R(0, 6), c: pick(['#6cb446', '#c9a336', '#a6d86a']) }); }
  for (let i = leaves.length - 1; i >= 0; i--) { const l = leaves[i]; l.z -= 9 * dt; l.ph += dt * 3; l.x += dt * (2 + 10 * gustAt(l.x, l.y)); if (l.z <= 0) leaves.splice(i, 1); }
  if (!fireflies.length) for (let i = 0; i < 18; i++) fireflies.push({ x: R(10, 80), y: R(80, 122), z: R(2, 9), ph: R(0, 6) });
  for (const f of fireflies) { f.x += Math.sin(realT * 0.7 + f.ph) * dt * 3; f.y += Math.cos(realT * 0.5 + f.ph) * dt * 2; }
  if (F.home && Math.random() < dt * 2.5) particles.push({ x: HOUSE.x + 8.4, y: HOUSE.y - 4.8, z: 31, vx: 2, vy: -1, vz: 5, c: pick(['#d8d4cc', '#c4c0b8']), life: 2.4, kind: 'smoke' });
}
function hud() {
  const T = S.t % 1440, hh = T / 60;
  const tod = hh < 5 ? '深夜' : hh < 8 ? '清晨' : hh < 11 ? '上午' : hh < 13 ? '中午' : hh < 17 ? '下午' : hh < 19.5 ? '傍晚' : '夜晚';
  document.getElementById('day').textContent = `第 ${S.day} 天 · ${tod}`;
  document.getElementById('clock').textContent = fmtT(S.t);
  document.getElementById('act').textContent = '当前：' + S.label;
  document.getElementById('coins').textContent = S.coins;
  document.getElementById('seeds').textContent = S.storage;
  const bag = []; if (F.seeds + F.gathered) bag.push(`种子 ${F.seeds + F.gathered}`); if (F.crops.length) bag.push(`作物 ${F.crops.length}`); if (F.water > 0) bag.push(`水壶 ${F.water}/8`);
  document.getElementById('bag').textContent = '背包：' + (bag.join(' · ') || '空');
  document.getElementById('log').innerHTML = S.log.map(s => `<div>${s}</div>`).join('');
}

// ---------- camera: manual only (no auto-rotation). drag / swipe, Q E, ← →, R resets; wheel = integer zoom ----------
let keyRot = 0, drag = null;
const ROT_KEYS = { q: -1, Q: -1, ArrowLeft: -1, e: 1, E: 1, ArrowRight: 1 };
addEventListener('keydown', e => { if (ROT_KEYS[e.key]) { keyRot = ROT_KEYS[e.key]; e.preventDefault(); } if (e.key === 'r' || e.key === 'R') cam.ta = DEFAULT_A; });
addEventListener('keyup', e => { if (ROT_KEYS[e.key] === keyRot) keyRot = 0; });
cv.style.touchAction = 'none';
cv.addEventListener('pointerdown', e => { drag = e.clientX; cv.setPointerCapture(e.pointerId); document.body.classList.add('grab'); });
cv.addEventListener('pointermove', e => { if (drag === null) return; cam.ta += (e.clientX - drag) * 0.008; drag = e.clientX; });
const endDrag = () => { drag = null; document.body.classList.remove('grab'); };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
addEventListener('wheel', e => { zoom = clamp(zoom + (e.deltaY < 0 ? 1 : -1), 0, 3); fit(); }, { passive: true });
if (Q.has('cursor')) { // visible pointer for recordings
  const cur = document.createElement('div'); cur.id = 'fakecursor'; document.body.appendChild(cur);
  addEventListener('pointermove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
}

// ---------- main loop ----------
function advance(dt) {
  realT += dt;
  if (keyRot) cam.ta += keyRot * dt * 1.8;
  cam.a += (cam.ta - cam.a) * (1 - Math.exp(-dt * 14));
  // (no camera follow: a drifting camera shifted the whole map by a pixel every few frames)
  const mult = F.sleeping ? 6 : 1;
  let dm = dt * MIN_PER_SEC * SPEED * mult;
  while (dm > 0) { const s = Math.min(dm, 1); stepSim(s); dm -= s; }
  updateFx(dt);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  advance(dt); render(); hud(); requestAnimationFrame(frame);
}
window.__farm = { S, F, tiles, cam, advance: (sec, fps = 30) => { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) advance(1 / fps); render(); hud(); }, setSpeed: v => SPEED = v, render: () => { render(); hud(); }, spritesReady: () => SPR.ok, setAngle: a => { cam.a = cam.ta = a; }, proj: (x, y) => { setCam(); return proj(x, y); }, HOUSE, BARN, STALL, cropArt: v => { CROPI.on = v; } };
buildGroundBase();
log('早上好！农场里乱糟糟的，先收拾一下');
if (MANUAL) { render(); hud(); } else requestAnimationFrame(frame);
})();
