// v5.10.9 图书馆 / 书屋: a new neighbour, kids stop to read after school (上学日 +1),
// hints for uncollected 图鉴 entries, and a workshop recipe (苹果派: flour + apples) used on the bakery order board.
// Built from the board once the town is at 繁荣度 3 (hall.js project 'library', lot L12 east of 小桃家).
// Rules only (art in town-art.js, the walk in game.js / kids.js). Offline days never add the reading bonus.
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const COST = 25000, WOOD = 150, LV = 3, FAVOR = 1;
  const HOURS = { from: 14 * 60, to: 17 * 60 }; // after school, before supper
  // lot L12: east of 小桃家 (606, 112) and north-east of the smithy (606, 134), inside the town (RECT right edge 632)
  const LOT = { id: 'library', x: 726, y: 34, hw: 10, hd: 9, door: P(726, 46), rot: 0, style: 7 }; // v5.11.0: next to the school
  const STAND = P(LOT.door.x + 5, LOT.door.y + 1); // where 阿宁 stands / a child reads
  const BOARD = P(LOT.door.x - 7, LOT.door.y + 1); // a little hint board by the door
  const built = H => !!(H && H.built && H.built.library);
  const open = (H, T) => built(H) && T >= HOURS.from && T < HOURS.to;
  // 加工坊配方 unlocked with the bookshop; bakery.js adds these templates once the shop is up
  const RECIPES = [{ id: 'pie', name: '苹果派', need: [{ id: 'flour', n: 1 }, { id: 'apple', n: 2 }], out: 'apple_pie' }];
  const TEMPLATES = [
    [['apple_pie', 1, 3], ['honey', 1, 2]],
    [['apple_pie', 2, 4], ['milk', 1, 2]],
    [['flour', 2, 4], ['apple', 4, 8]],
  ];
  // two locked 图鉴 entries for the day, in a stable order (the same after a reload)
  function hints(got, day, catalog) {
    const have = got && typeof got === 'object' ? got : {}, d = day | 0;
    const missing = (catalog || []).filter(e => e && e.id && e.hint && !have[e.id] && !e.later);
    if (!missing.length) return [];
    const h = (Math.imul(d + 41, 0x9E3779B1) >>> 0) % missing.length, out = [];
    for (let k = 0; k < Math.min(2, missing.length); k++) {
      const e = missing[(h + k * (1 + ((h >>> 7) % Math.max(1, missing.length - 1)))) % missing.length];
      if (!out.some(q => q.id === e.id)) out.push({ id: e.id, name: e.name || e.id, hint: e.hint });
    }
    return out;
  }
  // ---------- state: inside town.hall as `library` (append-only; old saves start with nothing) ----------
  const empty = () => ({ days: 0, last: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.days = int(o.days, 0, 1e6); out.last = int(o.last, 0, 1e6); return out;
  }
  const api = { COST, WOOD, LV, FAVOR, HOURS, LOT, STAND, BOARD, built, open, RECIPES, TEMPLATES, hints, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFLibrary = api;
})(typeof window !== 'undefined' ? window : globalThis);
