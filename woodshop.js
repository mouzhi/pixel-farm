// v5.10.5 木工坊 (阿松's workshop): rules only (art in town-art.js, the errand in game.js, the board in ui.js).
// Built from the board once the town is at 繁荣度 3 (hall.js project 'woodshop', lot L10, just south of 阿松's house).
// Raising the storehouse cap by 400 is the main effect (庄园 800 → 1,200). 阿松 also slowly turns spare wood
// into benches for the street (or the farm storehouse) when the pile is comfortably above a reserve; default
// automatic, 「先留着木材」 pauses it. Offline days do not craft. Timber at the door is only art.
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const CAP_BONUS = 400, KEEP = 400, COST = 40, ITEM = 'bench';
  // lot L10: south of 阿松's house (h3 at 568, 108), east of 秋姨 (L11), west of the smithy
  const LOT = { id: 'woodshop', x: 568, y: 130, hw: 7, hd: 7, door: P(568, 123), rot: Math.PI, style: 4 };
  const STAND = P(LOT.door.x + 5, LOT.door.y - 2); // where 阿松 stands
  const PILE = P(LOT.door.x - 7, LOT.door.y + 1);  // timber stacked by the door, kept off the path
  const HOURS = { from: 8 * 60, to: 17 * 60 };
  const built = H => !!(H && H.built && H.built.woodshop);
  const open = (H, T) => built(H) && T >= HOURS.from && T < HOURS.to;
  const capBonus = H => (built(H) ? CAP_BONUS : 0);
  const capOf = (base, H) => (base | 0) + capBonus(H);
  // ---------- state: inside town.hall as `woodshop` (append-only; old saves start automatic, nothing crafted) ----------
  const empty = () => ({ auto: 1, days: 0, used: 0, last: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.auto = o.auto === 0 || o.auto === false ? 0 : 1;
    out.days = int(o.days, 0, 1e6); out.used = int(o.used, 0, 1e9); out.last = int(o.last, 0, 1e6);
    return out;
  }
  const setAuto = (W, on) => { W.auto = on ? 1 : 0; return W; };
  // once a day, if auto is on and the pile is above the reserve, spend COST wood and make a bench.
  // -> { ok, wood, item } or { ok: false, why }
  function craft(W, day, wood) {
    if (W.last === (day | 0)) return { ok: false, why: 'today' };
    if (!W.auto) return { ok: false, why: 'paused' };
    if ((wood | 0) < KEEP + COST) return { ok: false, why: 'keep' };
    W.last = day | 0; W.days++; W.used += COST; return { ok: true, wood: COST, item: ITEM };
  }
  const api = { CAP_BONUS, KEEP, COST, ITEM, LOT, STAND, PILE, HOURS, built, open, capBonus, capOf, empty, valid, setAuto, craft };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFWoodshop = api;
})(typeof window !== 'undefined' ? window : globalThis);
