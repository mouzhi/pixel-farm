// v5.10.5 铁匠铺: rules only (art in town-art.js, buying in game.js / ui.js).
// Built from the board once the town is at 繁荣度 3 (hall.js project 'smithy', south of 小桃's house).
// A new neighbour, 铁匠阿锤, lives and works here. The shop sells 5 one-time (or 3-level) upgrades at 8k–25k,
// a late-game gold sink: longer sprinkler reach, faster workshops, three axe sharpenings, three rod fittings,
// and a market cart that carries more on market day. 「家人帮忙添置」 never buys these.
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  // south of 小桃's house (h4 at 606, 112), east of the woodshop, inside the town fence
  const LOT = { id: 'smithy', x: 606, y: 134, hw: 7, hd: 7, door: P(606, 127), rot: Math.PI, style: 5 };
  const STAND = P(LOT.door.x + 5, LOT.door.y - 2);
  const ANVIL = P(LOT.door.x - 6, LOT.door.y + 1);
  const HOURS = { from: 8 * 60, to: 17 * 60 };
  const SPR_REACH = 16, SPR_REACH_UP = 24, WORK_SPEED = 1.5, CART_EXTRA = 20;
  const AXE_BONUS = [0, 2, 4, 6], AXE_CUT = [0, 2, 3, 5];
  const ROD = [
    { wait: 0, miss: 0, rare: 1 },
    { wait: -4, miss: -0.02, rare: 1.15 },
    { wait: -7, miss: -0.03, rare: 1.3 },
    { wait: -10, miss: -0.04, rare: 1.5 },
  ];
  const UPGRADES = [
    { id: 'water', name: '浇水器加长', desc: '每台田边浇水器浇到的范围更大（大约 1.5 倍），家里的田更快浇透', cost: 12000, max: 1 },
    { id: 'works', name: '加工坊提速', desc: '磨坊、果酱铺和奶酪坊做一批只要原来的三分之二时间', cost: 15000, max: 1 },
    { id: 'axe', name: '斧头开刃', desc: '把家里的斧头拿来开刃：每棵树多 2 份木材，也砍得快一些', cost: [8000, 14000, 22000], max: 3,
      labels: ['开刃斧', '精钢斧', '大师斧'],
      descs: ['每棵树多 2 份木材，砍一棵少 2 分钟', '再多 2 份木材，再快一点', '一共每棵树多 6 份，砍一棵少 5 分钟'] },
    { id: 'rod', name: '鱼竿加固', desc: '把钓竿拿到铺子里加固：咬钩更快，少见的鱼更容易上钩', cost: [8000, 16000, 24000], max: 3,
      labels: ['加固竿', '精工竿', '名匠竿'],
      descs: ['等鱼的时间短一些，少见的鱼稍多一点', '再快一些，锦鲤更常见', '咬钩很快，少见的鱼明显多一些'] },
    { id: 'cart', name: '集市手推车', desc: '集市日能多带 20 件货去广场（家里的篮子容量不变）', cost: 10000, max: 1 },
  ];
  const BY = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
  const built = H => !!(H && H.built && H.built.smithy);
  const open = (H, T) => built(H) && T >= HOURS.from && T < HOURS.to;
  const emptyUp = () => ({ water: 0, works: 0, axe: 0, rod: 0, cart: 0 });
  const empty = () => ({ up: emptyUp() });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  function validUp(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = emptyUp();
    for (const u of UPGRADES) out[u.id] = int(o[u.id], 0, u.max);
    return out;
  }
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    return { up: validUp(o.up || o) };
  }
  const lv = (S, id) => ((S && S.up && S.up[id]) | 0);
  const costOf = (u, have) => { const c = u.cost; return Array.isArray(c) ? c[Math.min(have, c.length - 1)] : c; };
  const labelOf = (u, have) => (u.labels && u.labels[have]) || u.name;
  const descOf = (u, have) => (u.descs && u.descs[have]) || u.desc;
  // why the player cannot buy `id` now (null: ok). ctx: { open, coins, built }
  function canBuy(S, id, ctx) {
    const u = BY[id]; if (!u) return '没有这个升级';
    if (!(ctx && ctx.built)) return '先把铁匠铺盖好';
    const have = lv(S, id); if (have >= u.max) return '已经满级';
    const cost = costOf(u, have);
    if ((ctx.coins | 0) < cost) return '金币不够';
    return null;
  }
  // pay and bump one level. -> { ok, id, cost, have } or { ok: false, why }
  function buy(S, id, ctx) {
    const why = canBuy(S, id, ctx); if (why) return { ok: false, why };
    const u = BY[id], have = lv(S, id), cost = costOf(u, have);
    S.up[id] = have + 1; return { ok: true, id, cost, have: S.up[id], name: labelOf(u, have) };
  }
  function effects(up) {
    const u = validUp(up);
    return {
      sprReach: u.water ? SPR_REACH_UP : SPR_REACH,
      workSpeed: u.works ? WORK_SPEED : 1,
      axeBonus: AXE_BONUS[u.axe] || 0,
      axeCut: AXE_CUT[u.axe] || 0,
      rod: ROD[u.rod] || ROD[0],
      rodLv: u.rod,
      cartExtra: u.cart ? CART_EXTRA : 0,
    };
  }
  const api = { LOT, STAND, ANVIL, HOURS, SPR_REACH, SPR_REACH_UP, WORK_SPEED, CART_EXTRA, AXE_BONUS, AXE_CUT, ROD, UPGRADES, BY,
    built, open, emptyUp, empty, validUp, valid, lv, costOf, labelOf, descOf, canBuy, buy, effects };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFSmithy = api;
})(typeof window !== 'undefined' ? window : globalThis);
