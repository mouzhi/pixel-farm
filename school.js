// v5.10.9 学校扩建: 操场、第二间教室、每 14 天一次运动会（孩子们赛跑，家人去看，派对区同款的热闹）。
// 上学日的好感翻倍。Built from the board once the town is at 繁荣度 3 (hall.js project 'school', lot L4 east of the school).
// Rules only (art in town-art.js, the walk and the race in game.js / kids.js). Offline days never count as sports days.
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const COST = 40000, WOOD = 200, LV = 3, EVERY = 14;
  const HOURS = { from: 9 * 60, to: 15 * 60 };
  // second classroom: east of the existing school (590, 28, hw 17), still inside the town (RECT right edge 632)
  const LOT = { id: 'school', x: 618, y: 26, hw: 8, hd: 8, door: P(618, 36), rot: 0, style: 6 };
  // the dirt yard grows east once the project is up (the old yard is town.js SCHOOLYARD [572, 44, 608, 60])
  const YARD = [572, 38, 628, 64];
  const TRACK = { cx: 600, cy: 52, rx: 22, ry: 8 }; // a running oval across the yard, in front of both classrooms
  const BENCHES = [P(586, 42), P(592, 42), P(582, 46)];
  const WATCH = P(588, 44); // where the family stands to watch
  const FLAG = P(618, 44);
  const built = H => !!(H && H.built && H.built.school);
  const isDay = (H, day) => built(H) && (day | 0) > (H.built.school | 0) && (day | 0) % EVERY === 0;
  const nextDay = (H, day) => { if (!built(H)) return null; let d = Math.max((day | 0), (H.built.school | 0) + 1); while (d % EVERY) d++; return d; };
  const open = (H, day, T) => isDay(H, day) && T >= HOURS.from && T < HOURS.to;
  const favorMul = H => (built(H) ? 2 : 1); // 上学日的好感翻倍 once the expansion is up
  const inYard = (x, y, pad = 0) => x >= YARD[0] - pad && x <= YARD[2] + pad && y >= YARD[1] - pad && y <= YARD[3] + pad;
  // a point on the oval: u is 0..1 around the track, wobble keeps runners from stacking
  function raceAt(i, realT, n) {
    const u = (((realT * 0.045) + i * (1 / Math.max(2, n | 0))) % 1 + 1) % 1, a = u * Math.PI * 2;
    const wob = ((i * 13) % 5) - 2;
    return P(TRACK.cx + Math.cos(a) * (TRACK.rx + wob * 0.15), TRACK.cy + Math.sin(a) * (TRACK.ry + (i % 2 ? 0.4 : -0.2)));
  }
  const onTrack = (x, y) => {
    const dx = (x - TRACK.cx) / TRACK.rx, dy = (y - TRACK.cy) / TRACK.ry, d = dx * dx + dy * dy;
    return d > 0.55 && d < 1.25;
  };
  // ---------- state: inside town.hall as `school` (append-only; old saves start with nothing) ----------
  const empty = () => ({ last: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.last = int(o.last, 0, 1e6); return out;
  }
  const api = { COST, WOOD, LV, EVERY, HOURS, LOT, YARD, TRACK, BENCHES, WATCH, FLAG, built, isDay, nextDay, open, favorMul, inYard, raceAt, onTrack, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFSchool = api;
})(typeof window !== 'undefined' ? window : globalThis);
