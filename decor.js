// 像素农场 · 第 9 阶段（v5.7.0）：装饰、夜灯、派对区和「挪东西」的规则（纯数据和纯函数；浏览器里是 window.PFDecor，Node 里可以 require 做单元测试）
// Decorations are only for looking at: none of them is needed to progress. They come from the shop, or now and then from
// chopping, fishing, a giant crop, a full page of the collection book. The family sets each one down on free grass by
// themselves; the player can point at a new spot and someone carries it over. The art is decor-art.js, the wiring game.js.
'use strict';
(function (root) {
  // foot: half-extents kept clear when it is set down (world units, 8 = one farm tile); block: the part people walk round
  // light: radius of its glow at night when the water wheel's grid reaches it (lamps), shop: { cost, wood, max }
  const CATALOG = {
    bench: { name: '长椅', foot: [6, 3.5], block: [4.5, 1.5], shop: { cost: 300, wood: 10, max: 6 }, desc: '一条木头长椅，家人歇脚时会坐一会儿' },
    flowerpot: { name: '花盆', foot: [3, 3], block: null, shop: { cost: 150, wood: 0, max: 10 }, desc: '一盆开着的花' },
    scarecrow: { name: '稻草人', foot: [4, 4], block: [1.5, 1.5], shop: { cost: 250, wood: 5, max: 3 }, desc: '戴草帽的稻草人，站在田边' },
    birdbath: { name: '石头水盆', foot: [4.5, 4.5], block: [3, 3], shop: { cost: 450, wood: 0, max: 3 }, desc: '一个盛着水的石盆，偶尔有小鸟落下' },
    lamppost: { name: '路灯', foot: [3, 3], block: [1, 1], light: 26, shop: { cost: 600, wood: 5, max: 8 }, desc: '接上水车的电，天一黑就亮' },
    stonelamp: { name: '石灯', foot: [3.5, 3.5], block: [2, 2], light: 18, shop: { cost: 800, wood: 0, max: 6 }, desc: '矮矮的石灯笼，接上电后夜里透出暖光' },
    stringlights: { name: '串灯', foot: [7, 3], block: null, light: 22, shop: { cost: 700, wood: 10, max: 4 }, desc: '两根木杆之间挂一串小灯泡，接上电后夜里亮' },
    party: { name: '派对区', foot: [12, 8.5], block: [5.5, 2.5], light: 26, big: 1, shop: { cost: 2000, wood: 40, max: 1 }, desc: '长桌、两条长凳和一圈串灯。不定期的晚上一家人会聚在这里，有时镇上的人也来做客' },
    carving: { name: '木雕小熊', foot: [3.5, 3.5], block: [2, 2], src: '砍树时偶尔从木头里刻出来' },
    shell: { name: '贝壳堆', foot: [3.5, 3], block: null, src: '海钓时偶尔捞上来' },
    bottle: { name: '漂流瓶', foot: [3, 3], block: null, src: '钓鱼时偶尔钓上来' },
    giant_pumpkin: { name: '巨大南瓜纪念', foot: [5, 5], block: [4, 4], src: '第一次收获巨大南瓜' },
    giant_cabbage: { name: '巨大卷心菜纪念', foot: [5, 5], block: [4, 4], src: '第一次收获巨大卷心菜' },
    giant_watermelon: { name: '巨大西瓜纪念', foot: [5, 5], block: [4, 4], src: '第一次收获巨大西瓜' },
    koistatue: { name: '锦鲤石雕', foot: [5, 5], block: [4, 4], src: '图鉴「鱼」页集满' },
    chime: { name: '风铃架', foot: [3.5, 3.5], block: [1.5, 1.5], src: '图鉴「昆虫」页集满' },
  };
  const IDS = Object.keys(CATALOG);
  const SHOP_IDS = IDS.filter(id => CATALOG[id].shop);
  const LAMP_IDS = IDS.filter(id => CATALOG[id].light);
  const INV_MAX = 20, PLACED_MAX = 80, ORDERS_MAX = 8;

  // ---------- where things come from (each roll on its own random stream, so the farm's other events stay put) ----------
  const DROPS = { chop: [['carving', 0.04], ['stonelamp', 0.015]], sea: [['shell', 0.06], ['bottle', 0.025]], pond: [['bottle', 0.015]] };
  function rollDrop(src, r) { let u = r(); for (const [id, p] of DROPS[src] || []) { if (u < p) return id; u -= p; } return null; }
  const GIANT_KEEP = { pumpkin: 'giant_pumpkin', cabbage: 'giant_cabbage', watermelon: 'giant_watermelon' };
  // a full page of the collection book unlocks one piece (once): keys = the page's item keys, has(key) -> seen
  const SET_UNLOCK = [{ id: 'koistatue', group: 'fish' }, { id: 'chime', group: 'bug' }];
  const pageDone = (keys, has) => keys.length > 0 && keys.every(k => has(k));

  // ---------- 派对 ----------
  // An evening now and then (not every day): 17:30 the family drifts over, guests from the next town come up the east road,
  // everyone stays until 20:30 and then goes home. Nobody has to confirm anything.
  const PARTY = { from: 17 * 60 + 30, to: 20 * 60 + 30, gap: 4, p: 0.12, pSpecial: 0.45, guests: 0.65 };
  // a day worth celebrating: a child's 28-day birthday, or 28 days since 阿禾 moved in
  function special(day, fam) {
    fam = fam || {}; const ann = d => d > 0 && day > d && (day - d) % 28 === 0;
    return ann(fam.moved | 0) || (fam.kids || []).some(k => ann(k.born | 0));
  }
  // ctx: { day, placedDay (the area's day, 0 = none), last (day of the last party), special }, r: random -> a party tonight?
  function partyTonight(ctx, r) {
    if (!(ctx.placedDay > 0) || ctx.day <= ctx.placedDay) return false;  // the first evening after it is set up at the earliest
    if (!(ctx.last > 0)) return true;                                     // the first one is not left to chance
    if (ctx.day - ctx.last < PARTY.gap) return false;
    return r() < (ctx.special ? PARTY.pSpecial : PARTY.p);
  }
  const guestCount = r => (r() < PARTY.guests ? 1 + (r() < 0.5 ? 1 : 0) : 0);
  const partyOn = T => T >= PARTY.from && T < PARTY.to;
  // where people stand round the table (10 places along the benches and at the ends); the table is at c
  const SEATS = [[-4, -4.6], [-1.3, -4.6], [1.3, -4.6], [4, -4.6], [-4, 4.6], [-1.3, 4.6], [1.3, 4.6], [4, 4.6], [-7.2, 0], [7.2, 0]];
  const partySeats = c => SEATS.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }));
  const POSTS = [[-10.75, -7.25], [10.75, -7.25], [10.75, 7.25], [-10.75, 7.25]]; // the string-light posts
  const partyPosts = c => POSTS.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }));

  // ---------- placement on the nav grid (path.js) ----------
  // g: { x0, y0, cell, w, h, cost } with cost 0 = blocked, `dirt` = paths and door fronts, anything else = grass
  const boxOf = (x, y, half) => [x - half[0], y - half[1], x + half[0], y + half[1]];
  function cellsOf(g, b) { const out = [];
    const i0 = Math.floor((b[0] - g.x0) / g.cell), j0 = Math.floor((b[1] - g.y0) / g.cell), i1 = Math.floor((b[2] - g.x0 - 1e-6) / g.cell), j1 = Math.floor((b[3] - g.y0 - 1e-6) / g.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
    return out; }
  // every cell under the box is plain grass (not a path, not a door front, not a fence, water, tree or building)
  function onGrass(g, b, grass) { for (const [i, j] of cellsOf(g, b)) { if (i < 0 || j < 0 || i >= g.w || j >= g.h || g.cost[j * g.w + i] !== grass) return false; } return true; }
  // cells reachable from `from` (4-neighbour flood over walkable cells, `extra` boxes counted as blocked)
  function reach(g, from, extra) {
    const blk = new Uint8Array(g.w * g.h); for (const b of extra || []) for (const [i, j] of cellsOf(g, b)) if (i >= 0 && j >= 0 && i < g.w && j < g.h) blk[j * g.w + i] = 1;
    const seen = new Uint8Array(g.w * g.h), si = Math.floor((from.x - g.x0) / g.cell), sj = Math.floor((from.y - g.y0) / g.cell);
    if (si < 0 || sj < 0 || si >= g.w || sj >= g.h) return seen;
    const q = new Int32Array(g.w * g.h); let h = 0, t = 0; q[t++] = sj * g.w + si; seen[sj * g.w + si] = 1;
    while (h < t) { const k = q[h++], i = k % g.w, j = (k - i) / g.w;
      if (i > 0) { const n = k - 1; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } }
      if (i < g.w - 1) { const n = k + 1; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } }
      if (j > 0) { const n = k - g.w; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } }
      if (j < g.h - 1) { const n = k + g.w; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } } }
    return seen;
  }
  // a new blocked box must not cut anyone off: every spot reachable from `from` before stays reachable after
  function keepsPaths(g, box, spots, from) {
    const before = reach(g, from, []), after = reach(g, from, [box]);
    for (const s of spots) { const i = Math.floor((s.x - g.x0) / g.cell), j = Math.floor((s.y - g.y0) / g.cell); if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
      const k = j * g.w + i; if (before[k] && !after[k]) return false; }
    return true;
  }
  // candidate spots for the family to set something down by themselves: rings round `c`, nearest first, on a 6-unit lattice
  function ringSpots(c, rMax, step) { const out = []; step = step || 6;
    for (let y = -rMax; y <= rMax; y += step) for (let x = -rMax; x <= rMax; x += step) { const d = Math.hypot(x, y); if (d <= rMax) out.push({ x: c.x + x, y: c.y + y, d }); }
    return out.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x); }

  // ---------- state ----------
  // inv: { id: n } waiting in the storehouse; placed: [{ u, id, x, y, d }]; orders: [{ u, op, what, ref, id, x, y }]
  // (op 'place' | 'move'; what 'decor' | 'work' | 'hive' | 'spr'); party: { last, at (day it was set up), tonight, guests }
  // got: { id: 1 } pieces granted once (book pages, giant keepsakes); n: the next uid
  const empty = () => ({ inv: {}, placed: [], orders: [], party: { last: 0, at: 0, tonight: 0, guests: 0 }, got: {}, n: 1, moon: 0 });
  const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
  const XY = { x: [-260, 452], y: [-212, 388] };
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    const inv = o.inv && typeof o.inv === 'object' ? o.inv : {};
    for (const id of IDS) { const n = int(inv[id], 0, 0, INV_MAX); if (n) out.inv[id] = n; }
    let n = int(o.n, 1, 1, 1e6);
    out.placed = (Array.isArray(o.placed) ? o.placed : []).filter(p => p && CATALOG[p.id] && typeof p.x === 'number' && typeof p.y === 'number').slice(0, PLACED_MAX)
      .map(p => ({ u: int(p.u, 0, 0, 1e6), id: p.id, x: num(p.x, 0, XY.x[0], XY.x[1]), y: num(p.y, 0, XY.y[0], XY.y[1]), d: int(p.d, 0, 0, 1e6) }));
    const seen = new Set(); for (const p of out.placed) { if (!p.u || seen.has(p.u)) p.u = n++; seen.add(p.u); n = Math.max(n, p.u + 1); }
    if (out.placed.filter(p => p.id === 'party').length > 1) { let k = 0; out.placed = out.placed.filter(p => p.id !== 'party' || k++ === 0); }
    // orders: a carry in progress is not saved half-way (the thing goes back where it was); targets are checked again before use
    out.orders = (Array.isArray(o.orders) ? o.orders : []).filter(q => q && (q.op === 'place' || q.op === 'move') && ['decor', 'work', 'hive', 'spr'].includes(q.what) && typeof q.x === 'number' && typeof q.y === 'number')
      .slice(0, ORDERS_MAX).map(q => ({ u: n++, op: q.op, what: q.what, ref: typeof q.ref === 'string' || typeof q.ref === 'number' ? q.ref : null, id: CATALOG[q.id] ? q.id : null, x: num(q.x, 0, XY.x[0], XY.x[1]), y: num(q.y, 0, XY.y[0], XY.y[1]), mine: q.mine ? 1 : 0 }))
      .filter(q => q.op === 'move' ? q.ref !== null : !!q.id);
    out.n = n;
    const pa = o.party && typeof o.party === 'object' ? o.party : {};
    out.party = { last: int(pa.last, 0, 0, 1e6), at: int(pa.at, 0, 0, 1e6), tonight: int(pa.tonight, 0, 0, 1e6), guests: int(pa.guests, 0, 0, 2) };
    const got = o.got && typeof o.got === 'object' ? o.got : {}; for (const id of IDS) if (got[id]) out.got[id] = 1;
    out.moon = o.moon ? 1 : 0;
    return out;
  }

  const api = { CATALOG, IDS, SHOP_IDS, LAMP_IDS, INV_MAX, PLACED_MAX, ORDERS_MAX, DROPS, rollDrop, GIANT_KEEP, SET_UNLOCK, pageDone,
    PARTY, special, partyTonight, guestCount, partyOn, partySeats, partyPosts, boxOf, cellsOf, onGrass, reach, keepsPaths, ringSpots, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFDecor = api;
})(typeof window !== 'undefined' ? window : globalThis);
