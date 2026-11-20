// v5.10.3 集市 (the market square): rules only (art in town-art.js, the errand in game.js, the board in ui.js).
// Built from the board once the town is at 繁荣度 2 (hall.js project 'market'). From then on every 7th day is market day:
// 7:00–16:00 a grown-up loads the basket and sells it at the family's stall on the square, at 15% over the stall price,
// and the week's 抢手货 (one kind of goods, picked by the day) at 30%. Automatic by default; 「我来挑」 picks which kinds go.
// Offline days never count as market days (offline income keeps the v5.10.1 rules).
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const EVERY = 7, HOURS = { from: 7 * 60, to: 16 * 60 }, MIN = 3;
  const BONUS = 0.15, HOT = 0.3;
  const KINDS = [
    { id: 'crops', name: '蔬菜粮食' }, { id: 'fruit', name: '水果' }, { id: 'animals', name: '蛋奶羊毛' },
    { id: 'fish', name: '鱼' }, { id: 'goods', name: '加工品' },
  ];
  const KIND = Object.fromEntries(KINDS.map(k => [k.id, k]));
  // six stalls round the square (the square itself grows from r 15 to r 22 once the market is built)
  const PLAZA_R = 22;
  const STALLS = [
    { id: 's0', x: 500, y: 86, rot: 0, awn: 0, who: 'farm' },   // the family's stall: nearest the gate
    { id: 's1', x: 498, y: 106, rot: 0, awn: 1, who: 'n0' },    // 周婶
    { id: 's2', x: 500, y: 124, rot: 0, awn: 2, who: 'n3' },    // 面包师小桃
    { id: 's3', x: 549, y: 108, rot: 0, awn: 3, who: 'n7' },    // 花匠秋姨 (once L11 is up; else a pedlar)
    { id: 's4', x: 514, y: 130, rot: 0, awn: 4, who: 'n5' },    // 裁缝阿梅
    { id: 's5', x: 576, y: 96, rot: 0, awn: 0, who: 'v' },      // a pedlar from out of town
  ];
  const STALL = Object.fromEntries(STALLS.map(s => [s.id, s]));
  const HW = 5, HD = 3.5;
  const standAt = s => P(s.x, s.y + HD + 2);                   // where the seller stands (in front, facing the square)
  const FARM_SPOT = standAt(STALL.s0);
  const built = H => !!(H && H.built && H.built.market);
  // market day: every 7th day, starting the week after the square is built
  const isDay = (H, day) => built(H) && (day | 0) > (H.built.market | 0) && (day | 0) % EVERY === 0;
  const nextDay = (H, day) => { if (!built(H)) return null; let d = Math.max((day | 0), (H.built.market | 0) + 1); while (d % EVERY) d++; return d; };
  const open = (H, day, T) => isDay(H, day) && T >= HOURS.from && T < HOURS.to;
  // the 抢手货: one kind per market day, the same for everyone (by the day number)
  const hot = day => KINDS[(Math.imul((day | 0) + 11, 0x9E3779B1) >>> 0) % KINDS.length].id;
  // kind of an item type; f: { fish, fruit, animal, good } predicates from the game
  const kindOf = (ty, f) => (f.fish(ty) ? 'fish' : f.fruit(ty) ? 'fruit' : f.animal(ty) ? 'animals' : f.good(ty) ? 'goods' : 'crops');
  const takes = (M, kind) => !M || !M.pick || !!M.take[kind];
  const price = (base, kind, day) => Math.round(base * (1 + (kind === hot(day) ? HOT : BONUS)));
  // who stands at each stall on market day (neighbours who live here; the rest of the stalls get pedlars)
  function sellers(H) {
    const out = []; for (const s of STALLS) { if (s.who === 'farm') continue; out.push({ stall: s.id, who: s.who, at: standAt(s) }); } return out;
  }
  // ---------- nav: the stalls are solid ----------
  const blocks = H => (built(H) ? STALLS.map(s => [s.x - HW, s.y - HD, s.x + HW, s.y + HD]) : []);
  // ---------- state: inside town.hall as `market` (append-only; old saves start automatic) ----------
  const empty = () => ({ pick: 0, take: { crops: 1, fruit: 1, animals: 1, fish: 1, goods: 1 }, days: 0, gold: 0, extra: 0, last: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.pick = o.pick ? 1 : 0;
    if (o.take && typeof o.take === 'object') for (const k of KINDS) if (k.id in o.take) out.take[k.id] = o.take[k.id] ? 1 : 0;
    out.days = int(o.days, 0, 1e6); out.gold = int(o.gold, 0, 1e12); out.extra = int(o.extra, 0, 1e12); out.last = int(o.last, 0, 1e6);
    return out;
  }
  const api = { EVERY, HOURS, MIN, BONUS, HOT, KINDS, KIND, PLAZA_R, STALLS, STALL, HW, HD, standAt, FARM_SPOT, built, isDay, nextDay, open, hot, kindOf, takes, price, sellers, blocks, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFMarket = api;
})(typeof window !== 'undefined' ? window : globalThis);
