// 像素农场 · v5.10.0：镇公所、告示板、繁荣度和第一批二层房（纯数据和纯函数；浏览器里是 window.PFHall，Node 里可以 require 做单元测试）
// Once the town is open, 镇公所 stands next to the little shop with a notice board by its door. The board lists the town's
// building projects; the player picks one, pays for it, and the next morning the house stands (scaffolding in between, 木匠阿松
// on site). Every house brings a new family; three houses take the town from 繁荣度 1 to 2 (later versions add the next projects).
// Decorations the farm does not need can be given to the town (送给镇上): they go along the main street, lamps light at night.
// Once a week a few lines of 镇子小报 go into the log. The art is in town-art.js, the wiring game.js, the board ui.js.
'use strict';
(function (root) {
  const TN = (typeof require === 'function' && typeof document === 'undefined') ? require('./town.js') : root.PFTown;
  const SL = (typeof require === 'function' && typeof document === 'undefined') ? require('./slots.js') : root.PFSlots; // v5.10.3: gifts by kind
  const MK = (typeof require === 'function' && typeof document === 'undefined') ? require('./market.js') : root.PFMarket; // v5.10.3
  const BK = (typeof require === 'function' && typeof document === 'undefined') ? require('./bakery.js') : root.PFBakery; // v5.10.4
  const WS = (typeof require === 'function' && typeof document === 'undefined') ? require('./woodshop.js') : root.PFWoodshop; // v5.10.5
  const SM = (typeof require === 'function' && typeof document === 'undefined') ? require('./smithy.js') : root.PFSmithy; // v5.10.5
  const P = (x, y) => ({ x, y });
  const HALL = TN.BY_ID.hall;
  const BOARD = P(HALL.x - 9, HALL.y + HALL.hd + 12);       // the notice board: in front of the hall, beside its path
  // street things, first batch (model, x, y, rot): a post box by the hall, a hand cart by the shop, crates, a sun shade on the square
  const PROPS = [['mailbox', 529, 45, 0], ['cart', 480, 56, 0], ['crates', 506, 58, 0], ['parasol', 536, 146, 0]] /* v5.10.5: the sun shade moved south of L11 so 阿松's workshop can sit behind his house */;
  // ---------- the first batch of projects: three two-storey houses on lots that stood empty ----------
  // lot: centre, half size, door (where people stand), rot (Math.PI: door to the north, onto the street side), style (art)
  const LOTS = [
    { id: 'L5', x: 466, y: 91, hw: 8, hd: 7, door: P(466, 82), rot: Math.PI, style: 0 },
    { id: 'bakery', x: 483, y: 91, hw: 7, hd: 7, door: P(483, 82), rot: Math.PI, style: 3 }, // v5.10.4: lot L6, 小桃's shop (coords live in bakery.js too)
    { id: 'L8', x: 560, y: 87, hw: 8, hd: 7, door: P(560, 78), rot: Math.PI, style: 1 },
    { id: 'L11', x: 546, y: 131, hw: 8, hd: 7, door: P(546, 122), rot: Math.PI, style: 2 },
    { id: 'woodshop', x: 568, y: 130, hw: 7, hd: 7, door: P(568, 123), rot: Math.PI, style: 4 }, // v5.10.5: lot L10, 阿松's workshop (coords live in woodshop.js too)
    { id: 'smithy', x: 606, y: 134, hw: 7, hd: 7, door: P(606, 127), rot: Math.PI, style: 5 }, // v5.10.5: 铁匠阿锤's forge (coords live in smithy.js too)
  ];
  const LOT = Object.fromEntries(LOTS.map(l => [l.id, l]));
  const PROJECTS = [
    { id: 'L5', name: '木构二层小楼', desc: '带阳台和晾衣绳，裁缝阿梅一家搬进来', cost: 8000, wood: 120, who: 'n5' },
    { id: 'L8', name: '砖石二层房', desc: '有阁楼窗和烟囱，邮差阿川一家搬进来', cost: 8000, wood: 120, who: 'n6' },
    { id: 'L11', name: '下店上住的街边铺子', desc: '一楼是花店的橱窗，二楼住人，花匠秋姨开张', cost: 8000, wood: 120, who: 'n7' },
    // v5.10.3: the market square (market.js): the square grows, six stalls go up, every 7th day is market day
    { id: 'market', name: '集市广场', desc: '广场铺大一圈，搭起 6 个摊位；每 7 天一次集市日，家里的东西在集市上多卖两成', cost: 30000, wood: 200, lv: 2, kind: 'market' },
    // v5.10.4: 小桃's bakery (bakery.js): an order board, 2 orders a day, 50% over the stall
    { id: 'bakery', name: '小桃的面包房', desc: '小桃在南街开店。每天订单板上有 2 个订单，按单交货多付五成，家人跑腿送货', cost: 25000, wood: 150, lv: 2, kind: 'bakery' },
    // v5.10.5: 阿松's workshop (woodshop.js): storehouse cap +400, spare wood becomes benches
    { id: 'woodshop', name: '阿松的木工坊', desc: '阿松在自家南边开坊。仓库木材上限加 400；木头多的时候，他会做成街上的长椅', cost: 20000, wood: 300, lv: 3, kind: 'woodshop' },
    // v5.10.5: the blacksmith (smithy.js): 5 one-time / three-level upgrades at 8k–25k
    { id: 'smithy', name: '铁匠铺', desc: '铁匠阿锤在镇南开铺。一次性升级：浇水器范围、加工坊提速、斧头三级、鱼竿三级、集市手推车', cost: 35000, wood: 100, lv: 3, kind: 'smithy', who: 'n8' },
  ];
  const PROJ = Object.fromEntries(PROJECTS.map(p => [p.id, p]));
  const LEVELS = [0, 3, 5];                                 // projects built to reach 繁荣度 1, 2, 3 (v5.10.4: bakery is the 5th; v5.10.5 shops stay at 3 until later versions)
  const LV_NAME = ['', '小镇', '热闹的小镇', '繁华的小镇', '大镇子', '远近闻名'];
  const prosperity = st => { const n = Object.keys((st && st.built) || {}).length; let lv = 1; for (let i = 1; i < LEVELS.length; i++) if (n >= LEVELS[i]) lv = i + 1; return lv; };
  const nextLevelAt = st => { const n = Object.keys((st && st.built) || {}).length; const nx = LEVELS.find(t => t > n); return nx === undefined ? null : { need: nx - n }; };

  // ---------- the people: 镇长 from the day the town opens, one family per house from the morning after it is done ----------
  const SPOTS = { hall: P(HALL.door.x + 5, HALL.door.y + 4), board: P(BOARD.x + 3, BOARD.y + 5), plaza2: P(TN.PLAZA.x - 14, TN.PLAZA.y - 6),
    street2: P(600, 72), street3: P(478, 72), L11shop: P(LOT.L11.door.x + 6, LOT.L11.door.y - 2), square: P(TN.PLAZA.x + 4, TN.PLAZA.y + 17), bakery: BK ? BK.STAND : P(490, 79),
    woodshop: WS ? WS.STAND : P(573, 121), smithy: SM ? SM.STAND : P(611, 125) };
  const NEIGHBOURS = [
    { id: 'n4', name: '镇长老顾', look: 'townE', home: 'h5', plan: [[8 * 60 + 30, 12 * 60, 'hall'], [13 * 60, 17 * 60, 'hall'], [17 * 60 + 30, 19 * 60 + 30, 'square']] },
    { id: 'n5', name: '裁缝阿梅', look: 'townF', lot: 'L5', plan: [[8 * 60, 11 * 60, 'plaza2'], [14 * 60, 17 * 60, 'board'], [18 * 60 + 30, 20 * 60 + 30, 'plaza2']] },
    { id: 'n6', name: '邮差阿川', look: 'townG', lot: 'L8', plan: [[8 * 60, 10 * 60, 'street3'], [10 * 60, 12 * 60, 'street2'], [13 * 60, 17 * 60, 'street2']] },
    { id: 'n7', name: '花匠秋姨', look: 'townH', lot: 'L11', plan: [[8 * 60 + 30, 17 * 60 + 30, 'L11shop'], [18 * 60, 20 * 60, 'square']] },
    { id: 'n8', name: '铁匠阿锤', look: 'townI', lot: 'smithy', plan: [[8 * 60, 17 * 60, 'smithy'], [18 * 60, 20 * 60, 'square']] }, // v5.10.5
  ];
  const doorOf = n => (n.lot ? LOT[n.lot].door : TN.BY_ID[n.home].door);
  // who lives in town now (the mayor always; a family once its house is built)
  const residents = st => NEIGHBOURS.filter(n => !n.lot || !!((st && st.built) || {})[n.lot]);
  const spotAt = s => SPOTS[s] || TN.SPOTS[s];
  // v5.10.3: on market day the neighbours who keep a stall stand at it 8:00–15:30
  const MARKET_HOURS = [8 * 60, 15 * 60 + 30];
  function marketAt(st, n, day, T) {
    if (!MK || !MK.isDay(st, day)) return null; const t = ((T % 1440) + 1440) % 1440; if (t < MARKET_HOURS[0] || t >= MARKET_HOURS[1]) return null;
    const s = MK.STALLS.find(q => q.who === n.id); return s ? { at: MK.standAt(s), out: true, spot: 'stall:' + s.id } : null; }
  // v5.10.4: once the bakery is up, 小桃 works there 8:00–17:00 (a market-day stall still comes first)
  const BAKERY_HOURS = [8 * 60, 17 * 60];
  function bakeryAt(st, n, day, T) {
    if (!BK || !BK.built(st) || n.id !== 'n3') return null; const t = ((T % 1440) + 1440) % 1440;
    if (t < BAKERY_HOURS[0] || t >= BAKERY_HOURS[1]) return null;
    return { at: BK.STAND, out: true, spot: 'bakery' }; }
  // v5.10.5: once the workshop is up, 阿松 works there 8:00–17:00 (a house going up still comes first, see hallSite)
  const WOOD_HOURS = [8 * 60, 17 * 60];
  function woodshopAt(st, n, day, T) {
    if (!WS || !WS.built(st) || n.id !== 'n2') return null; const t = ((T % 1440) + 1440) % 1440;
    if (t < WOOD_HOURS[0] || t >= WOOD_HOURS[1]) return null;
    return { at: WS.STAND, out: true, spot: 'woodshop' }; }
  const SMITH_HOURS = [8 * 60, 17 * 60];
  function smithyAt(st, n, day, T) {
    if (!SM || !SM.built(st) || n.id !== 'n8') return null; const t = ((T % 1440) + 1440) % 1440;
    if (t < SMITH_HOURS[0] || t >= SMITH_HOURS[1]) return null;
    return { at: SM.STAND, out: true, spot: 'smithy' }; }
  function neighbourAt(n, T) {
    const t = ((T % 1440) + 1440) % 1440;
    for (const [a, b, s] of n.plan) if (t >= a && t < b) return { at: spotAt(s), out: true, spot: s };
    return { at: doorOf(n), out: false, spot: 'home' };
  }
  // 木匠阿松 works on the site while a house is going up (8:00–17:00)
  const BUILD_HOURS = [8 * 60, 17 * 60];
  const siteSpot = id => { const l = LOT[id]; return l ? P(l.x + l.hw + 3, l.y - l.hd + 2) : id === 'market' ? P(TN.PLAZA.x - 20, TN.PLAZA.y + 4) : null; };

  // ---------- the board: start a project, finish it the next morning ----------
  // ctx: { open (town bought), coins, wood } -> null or why not
  function canStart(st, id, ctx) {
    const p = PROJ[id]; if (!p) return '没有这个项目';
    if (!(ctx && ctx.open)) return '先把镇子买下来';
    if (st.built[id]) return '已经盖好了';
    if (st.job) return st.job.id === id ? '正在盖' : '一次只盖一座，等' + PROJ[st.job.id].name + '盖好';
    if (p.lv && prosperity(st) < p.lv) return `繁荣度到 ${p.lv} 才能盖（${p.lv <= 2 ? '先把三座二层房盖好' : '先把集市和面包房盖好'}）`;
    if ((ctx.coins | 0) < p.cost) return '金币不够';
    if ((ctx.wood | 0) < p.wood) return '木材不够';
    return null;
  }
  function start(st, id, day) { st.job = { id, day: day | 0 }; return st; }
  // the morning after it was started it is done -> the project id (or null)
  function finish(st, day) {
    const j = st.job; if (!j || (day | 0) <= j.day) return null;
    st.built[j.id] = day | 0; st.job = null; return j.id;
  }

  // ---------- 送给镇上: decorations along the main street ----------
  // v5.10.3: laid out by kind (slots.js): lamps along the street at even spacing, flower pots by the doors, the rest in nooks
  const GIFT_SPOTS = [].concat(SL.TOWN.lamp, SL.TOWN.pot, SL.TOWN.nook);
  const GIFT_OK = id => id !== 'party';                     // the party table stays at home: it is where the family meets
  const giftPos = st => SL.townLayout(st.gifts);            // where each gift stands (by index)
  const giftRoom = (st, id) => SL.townRoom(st.gifts, id);
  const giftSpot = (st, id) => (id ? (giftRoom(st, id) ? giftPos({ gifts: st.gifts.concat([id]) }).pop() : null) : (st.gifts.length < SL.TOWN_MAX ? true : null));
  function give(st, id) { if (!GIFT_OK(id) || !giftRoom(st, id)) return false; st.gifts.push(id); return true; }

  // ---------- 镇子小报: once a week a few lines in the log ----------
  const PAPER_EVERY = 7;
  // ctx: { day, built (ids this week), lv, gifts (this week), trade (extra gold at the town shop this week), people }
  function paperText(ctx) {
    const parts = [];
    if (ctx.built && ctx.built.length) parts.push(ctx.built.map(id => PROJ[id].name).join('、') + '盖好了');
    if (ctx.gifts) parts.push(`农场送来 ${ctx.gifts} 件装饰，摆在了主街上`);
    if (ctx.trade > 0) parts.push(`小店这周多付给农场 ${ctx.trade} 金`);
    if (!parts.length) parts.push(['镇上一切照常，广场傍晚依旧热闹', '学校的孩子们在操场上追来追去', '小店进了一批新货，周婶说鸡蛋卖得最快'][(ctx.day | 0) % 3]);
    return `镇子小报（第 ${ctx.day} 天）：${parts.join('；')}。现在镇上住着 ${ctx.people} 位邻居，繁荣度 ${ctx.lv}（${LV_NAME[ctx.lv] || ''}）`;
  }

  // ---------- lights at night: the new houses' windows while people are up, gift lamps along the street ----------
  // CAT: PFDecor.CATALOG (which gifts are lamps). -> [{ x, y, z, r, s }]
  function lightsAt(st, T, CAT) {
    const t = ((T % 1440) + 1440) % 1440, out = [], homes = t >= TN.LIT.homes[0] && t < TN.LIT.homes[1], lamps = t >= TN.LIT.lamps[0] || t < TN.LIT.lamps[1];
    if (homes) for (const l of LOTS) if (st.built[l.id]) out.push({ x: l.door.x, y: l.door.y + 1, z: 6, r: 16, s: 0.6 });
    if (homes) out.push({ x: HALL.door.x, y: HALL.door.y - 1, z: 7, r: 16, s: 0.5 });
    if (st.built.smithy && SM) { // v5.10.5: the forge stays warm; brighter after dark
      const glow = t >= 18 * 60 || t < 6 * 60; out.push({ x: SM.LOT.x, y: SM.LOT.y + 2, z: 4, r: glow ? 22 : 14, s: glow ? 0.95 : 0.55, col: '#e06a2c' }); }
    if (lamps && CAT) { const gp = giftPos(st); st.gifts.forEach((id, i) => { const c = CAT[id]; if (c && c.light && gp[i]) out.push({ x: gp[i].x, y: gp[i].y, z: 12, r: c.light, s: 0.85 }); }); }
    return out;
  }

  // ---------- nav: what people walk round ----------
  function blocks(st) {
    const out = [];
    for (const l of LOTS) if (st.built[l.id] || (st.job && st.job.id === l.id)) out.push([l.x - l.hw, l.y - l.hd, l.x + l.hw, l.y + l.hd]);
    out.push([BOARD.x - 3, BOARD.y - 1, BOARD.x + 3, BOARD.y + 1]);
    if (MK) out.push(...MK.blocks(st)); // v5.10.3: the market stalls
    return out;
  }

  // ---------- state (saved inside `town` as `hall`; append-only, old saves start with nothing built) ----------
  const empty = () => ({ built: {}, job: null, gifts: [], paper: 0, week: { built: [], gifts: 0, trade: 0 }, market: MK ? MK.empty() : {}, bakery: BK ? BK.empty() : {}, woodshop: WS ? WS.empty() : {}, smithy: SM ? SM.empty() : {} }); // v5.10.3–v5.10.5
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  const DECOR_ID = /^[a-z_]{2,24}$/;
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    const b = o.built && typeof o.built === 'object' ? o.built : {}; for (const id of Object.keys(b)) if (PROJ[id]) out.built[id] = int(b[id], 1, 1e6) || 1;
    if (o.job && typeof o.job === 'object' && PROJ[o.job.id] && !out.built[o.job.id]) out.job = { id: o.job.id, day: int(o.job.day, 0, 1e6) };
    if (Array.isArray(o.gifts)) { const g = []; for (const id of o.gifts) if (typeof id === 'string' && DECOR_ID.test(id) && GIFT_OK(id) && SL.townRoom(g, id)) g.push(id); out.gifts = g; }
    out.paper = int(o.paper, 0, 1e6);
    if (MK) out.market = MK.valid(o.market);
    if (BK) out.bakery = BK.valid(o.bakery);
    if (WS) out.woodshop = WS.valid(o.woodshop);
    if (SM) out.smithy = SM.valid(o.smithy);
    const w = o.week && typeof o.week === 'object' ? o.week : {};
    out.week = { built: Array.isArray(w.built) ? w.built.filter(id => PROJ[id]).slice(0, PROJECTS.length) : [], gifts: int(w.gifts, 0, 99), trade: int(w.trade, 0, 1e9) };
    return out;
  }

  const api = { HALL, BOARD, PROPS, lightsAt, LOTS, LOT, PROJECTS, PROJ, LEVELS, LV_NAME, prosperity, nextLevelAt, SPOTS, NEIGHBOURS, doorOf, residents, neighbourAt, marketAt, bakeryAt, MARKET_HOURS, BAKERY_HOURS, BUILD_HOURS, siteSpot,
    canStart, start, finish, GIFT_SPOTS, GIFT_OK, giftSpot, giftPos, giftRoom, give, PAPER_EVERY, paperText, blocks, empty, valid,
    woodshopAt, smithyAt, WOOD_HOURS, SMITH_HOURS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFHall = api;
})(typeof window !== 'undefined' ? window : globalThis);
