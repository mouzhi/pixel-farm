// v5.10.4 面包房 + 订单板: rules only (art in town-art.js, the errand in game.js, the board in ui.js).
// Built from the board once the town is at 繁荣度 2 (hall.js project 'bakery', lot L6). From then on 小桃 works in the shop,
// and every day the order board posts 2 orders (for example「6 份面粉 + 4 个鸡蛋」). Automatic by default: the family
// accepts the most profitable one they can fill and a grown-up walks it over, paid 50% over the stall, plus 好感 with 小桃.
// 「我来挑」 lets the player pick one; if they do not, it still auto-accepts. Skipping a day has no penalty.
// Offline days never fill orders (offline income keeps the v5.10.1 rules).
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const BONUS = 0.5, FAVOR = 3, HOURS = { from: 8 * 60, to: 16 * 60 };
  // lot L6: between L5 (466, 91) and the market square, door north onto the main street
  const LOT = { id: 'bakery', x: 626, y: 194, hw: 10, hd: 9, door: P(626, 182), rot: Math.PI, style: 3 }; // v5.11.0: 工坊街
  const STAND = P(LOT.door.x + 5, LOT.door.y - 3); // where 小桃 stands / the family hands the basket over
  const BOARD = P(LOT.door.x - 6, LOT.door.y + 1); // a little order board by the door, kept clear of L5
  const UNIT = { flour: 60, jam: 80, cheese: 130, honey: 40, egg: 10, wool: 60, milk: 35, truffle: 45, apple: 12, orange: 15, strawberry: 30, wheat: 14, apple_pie: 140 };
  const WORD = {
    flour: ['份', '面粉'], jam: ['罐', '果酱'], cheese: ['块', '奶酪'], honey: ['罐', '蜂蜜'],
    egg: ['个', '鸡蛋'], wool: ['团', '羊毛'], milk: ['瓶', '牛奶'], truffle: ['个', '松露'],
    apple: ['个', '苹果'], orange: ['个', '橘子'], strawberry: ['篮', '草莓'], wheat: ['把', '小麦'],
    apple_pie: ['个', '苹果派'],
  };
  const NAME = Object.fromEntries(Object.keys(WORD).map(id => [id, WORD[id][1]]));
  // each template is [item, min qty, max qty] pairs (two kinds, like the example)
  const TEMPLATES = [
    [['flour', 4, 8], ['egg', 3, 6]],
    [['flour', 3, 6], ['milk', 2, 4]],
    [['flour', 4, 7], ['honey', 2, 4]],
    [['flour', 3, 5], ['strawberry', 4, 8]],
    [['jam', 2, 4], ['apple', 3, 6]],
    [['jam', 2, 4], ['orange', 3, 6]],
    [['cheese', 1, 3], ['milk', 2, 4]],
    [['honey', 3, 6], ['apple', 3, 6]],
    [['wool', 1, 3], ['egg', 4, 8]],
    [['wheat', 6, 12], ['egg', 3, 6]],
    [['flour', 2, 4], ['cheese', 1, 2]],
    [['milk', 3, 6], ['honey', 2, 4]],
  ];
  const built = H => !!(H && H.built && H.built.bakery);
  const open = (H, T) => built(H) && T >= HOURS.from && T < HOURS.to;
  const unit = (id, priceOf) => Math.max(1, (priceOf ? priceOf(id) : UNIT[id]) | 0);
  const baseOf = (need, priceOf) => need.reduce((s, x) => s + x.n * unit(x.id, priceOf), 0);
  const payOf = (need, priceOf) => Math.round(baseOf(need, priceOf) * (1 + BONUS));
  const needText = need => need.map(x => { const w = WORD[x.id] || ['', x.id]; return `${x.n} ${w[0]}${w[1]}`; }).join(' + ');
  const have = (need, counts) => need.every(x => (counts[x.id] | 0) >= x.n);
  const shortOf = (need, counts) => (need || []).map(x => ({ id: x.id, n: Math.max(0, (x.n | 0) - (counts[x.id] | 0)) })).filter(x => x.n > 0);
  // n || 1 would count a workshop/hive with ready 0 as 1 item
  const addCount = (c, ty, n) => { if (!ty) return c; c[ty] = (c[ty] | 0) + (n == null ? 1 : n); return c; };
  const cropId = (it, typeOf) => typeof it === 'string' ? it : (typeOf ? typeOf(it) : (it && it.type));
  // mark basket slots for a taken order (call this before workshop / stall keeps)
  function reserve(crops, need, keep, typeOf) {
    const left = {};
    for (const x of need || []) left[x.id] = (left[x.id] | 0) + x.n;
    (crops || []).forEach((it, i) => {
      const ty = cropId(it, typeOf);
      if (ty && left[ty] > 0 && !keep[i]) { keep[i] = true; left[ty]--; }
    });
    return left;
  }
  // two different templates for the day, quantities from the day number (the same after a reload)
  function offers(day, extra, more) {
    const templates = TEMPLATES.concat(Array.isArray(more) && more.length ? more : []);
    const d = day | 0, h = (Math.imul(d + 19, 0x9E3779B1) >>> 0), n = 2 + Math.max(0, extra | 0), idx = [];
    let i = h % templates.length;
    for (let k = 0; k < n; k++) { idx.push(i); i = (i + 1 + ((h >>> (8 + k * 3)) % Math.max(1, templates.length - 1))) % templates.length; }
    return idx.map((ti, k) => {
      const bits = h >>> (k * 10);
      const need = templates[ti].map((row, j) => { const lo = row[1], hi = row[2]; return { id: row[0], n: lo + ((bits >>> (j * 3)) % (hi - lo + 1)) }; });
      return { id: 'o' + k, need, text: needText(need), base: baseOf(need), pay: payOf(need) };
    });
  }
  // the most profitable offer the farm can fill (null: none yet)
  function best(list, counts, priceOf) {
    let b = null;
    for (const o of list || []) if (have(o.need, counts)) {
      const pay = payOf(o.need, priceOf);
      if (!b || pay > b.pay || (pay === b.pay && o.id < b.id)) b = { id: o.id, pay, need: o.need };
    }
    return b;
  }
  // ---------- state: inside town.hall as `bakery` (append-only; old saves start automatic, nothing posted) ----------
  const empty = () => ({ pick: 0, days: 0, gold: 0, extra: 0, last: 0, offer: [], take: null, done: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  const cleanNeed = arr => (Array.isArray(arr) ? arr : []).filter(x => x && WORD[x.id] && int(x.n, 1, 99) > 0).slice(0, 4)
    .map(x => ({ id: x.id, n: int(x.n, 1, 99) }));
  function validOffer(o, i) {
    if (!o || typeof o !== 'object') return null;
    const need = cleanNeed(o.need); if (!need.length) return null;
    return { id: (typeof o.id === 'string' && /^o[0-9]$/.test(o.id)) ? o.id : 'o' + i, need, text: needText(need), base: baseOf(need), pay: payOf(need) };
  }
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.pick = o.pick ? 1 : 0;
    out.days = int(o.days, 0, 1e6); out.gold = int(o.gold, 0, 1e12); out.extra = int(o.extra, 0, 1e12); out.last = int(o.last, 0, 1e6);
    out.offer = (Array.isArray(o.offer) ? o.offer : []).map(validOffer).filter(Boolean).slice(0, 3);
    out.take = typeof o.take === 'string' && out.offer.some(q => q.id === o.take) ? o.take : null;
    out.done = o.done ? 1 : 0;
    const short = (Array.isArray(o.short) ? o.short : []).filter(id => typeof id === 'string' && WORD[id]).slice(0, 8);
    if (short.length) out.short = short;
    if (o.skip) out.skip = 1;
    // v5.11.0.27: cargo already pulled for a walk in progress (append-only; omitted when empty)
    const held = cleanNeed(o.held);
    if (held.length) out.held = held;
    return out;
  }
  // a new day: post 2 orders, clear yesterday's pick; auto-accept is applied later once we know the stock
  // the game must bakeryHeldReturn any B.held before calling roll (otherwise the cargo would vanish)
  function roll(B, day, extra, more) {
    const d = day | 0; if (B.last === d) return B;
    B.last = d; B.offer = offers(d, extra, more); B.take = null; B.done = 0; delete B.short; delete B.skip; delete B.held; return B;
  }
  // pick mode: the player chose `id` (null clears it so auto can run). ignored once today's order is delivered.
  function setTake(B, id) {
    if (B.done) return B; B.take = (id && B.offer.some(q => q.id === id)) ? id : null; delete B.skip; return B;
  }
  // if nothing is chosen yet, accept the best fulfillable one (auto, and 「我来挑」 when the player has not clicked)
  function autoTake(B, counts, priceOf) {
    if (B.done || B.skip || B.take) return B; const b = best(B.offer, counts, priceOf); if (b) B.take = b.id; return B;
  }
  const taken = B => (B && B.take && !B.skip ? B.offer.find(q => q.id === B.take) : null);
  const api = { BONUS, FAVOR, HOURS, LOT, STAND, BOARD, UNIT, WORD, NAME, TEMPLATES, built, open, unit, baseOf, payOf, needText, have, shortOf, addCount, cropId, reserve, offers, best, empty, valid, roll, setTake, autoTake, taken };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFBakery = api;
})(typeof window !== 'undefined' ? window : globalThis);
