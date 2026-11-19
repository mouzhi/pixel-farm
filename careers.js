// v5.10.6 成家后的出路: rules only (the wedding prompt and the family panel in ui.js, walking and the shop in game.js, art in town-art.js).
// On the wedding morning the player picks one path (or the child's default is used): stay and farm, take a job in town, or
// open a shop on an empty lot (L2 / L3). After that it runs itself. A later change is 2,000 gold, next morning; closing a
// shop refunds half the fit-out. Children already married before this version default to farming, and their first change is free.
// Save stays at v15: append-only `home.path`, `home.wage`, and `town.lots`. Missing fields mean「留家种地」and no lots.
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const WAYS = ['farm', 'work', 'shop'];
  const JOBS = [
    { at: 'bakery', nb: 'n3', name: '面包房', perk: '订单每天多 1 个' },
    { at: 'wood', nb: 'n2', name: '木工坊', perk: '木材换家具快一倍' },
    { at: 'smith', nb: 'n8', name: '铁匠铺', perk: '升级打九折' },
  ];
  const JOB = Object.fromEntries(JOBS.map(j => [j.at, j]));
  // 朵朵 → flower, 阿团 → sweet, 石头 → tackle
  const KINDS = {
    flower: { id: 'flower', mate: 'm1', name: '花店', goods: ['flower', 'apple', 'orange', 'strawberry', 'watermelon', 'honey'] },
    sweet: { id: 'sweet', mate: 'm0', name: '甜品铺', goods: ['flour', 'jam', 'egg', 'milk', 'strawberry'] },
    tackle: { id: 'tackle', mate: 'm2', name: '渔具店', goods: ['fish', 'fishFood'] },
  };
  const KIND_OF_MATE = { m1: 'flower', m0: 'sweet', m2: 'tackle' };
  const SHOP = { cost: 15000, wood: 150, lv: 3, wait: 1, refund: 0.5, over: 0.30, take: 10 };
  const MARKET_BONUS = 0.15; // 「比集市多卖 30%」is 30% over the regular market price (15% over the stall)
  const CHANGE = { cost: 2000 };
  const WAGE = 300;
  const WORK = { leave: 8 * 60, start: 9 * 60, end: 16 * 60, homeBy: 17 * 60 };
  const SHOP_HOURS = { from: 9 * 60, to: 17 * 60 };
  const HELP_P = { farm: 0.5, away: 0.25 }; // about every other day at home, about every four days once they work or keep a shop
  const YIELD = { farm: 1, away: 0.5 };
  const KID_IDS = ['kid0', 'kid1'];
  // empty lots from the town plan (L2 between the little shop and 镇长's garden, L3 between 林老师 and the school).
  // L4 / L9 / L12 stay reserved for the school yard, the clinic and the library.
  const LOTS = [
    { id: 'L2', x: 468, y: 53, hw: 6, hd: 6, door: P(468, 59), rot: 0, style: 6 },
    { id: 'L3', x: 560, y: 36, hw: 7, hd: 7, door: P(560, 43), rot: 0, style: 7 },
  ];
  const LOT = Object.fromEntries(LOTS.map(l => [l.id, l]));
  const STREETS = {
    t_L2: [P(468, 66), P(468, 59)],
    t_L3: [P(560, 66), P(560, 43)],
  };

  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const kindOfMate = mate => KIND_OF_MATE[mate] || null;
  const kindOf = id => KINDS[id] || null;
  const jobOf = at => JOB[at] || null;
  const shopName = (name, kind) => `${name}的${(KINDS[kind] || { name: '小店' }).name}`;
  const jobBuilt = (hall, at) => !!(hall && hall.built && hall.built[at === 'wood' ? 'woodshop' : at === 'smith' ? 'smithy' : 'bakery']);
  const anyJob = hall => JOBS.some(j => jobBuilt(hall, j.at));
  const prosperity = hall => {
    const HL = (typeof require === 'function' && typeof document === 'undefined') ? require('./hall.js') : root.PFHall;
    return HL && HL.prosperity ? HL.prosperity(hall) : 1;
  };

  // ---------- lots ----------
  const lotIds = () => LOTS.map(l => l.id);
  const usedLots = lots => obj(lots);
  const kidLot = (lots, kid) => { const o = usedLots(lots); for (const id of lotIds()) if (o[id] === kid) return id; return null; };
  const freeLots = lots => lotIds().filter(id => !usedLots(lots)[id]);
  const assignLot = (lots, kid) => { const id = freeLots(lots)[0]; if (!id) return null; lots[id] = kid; return id; };
  const releaseLot = (lots, kid) => { const o = usedLots(lots); for (const id of Object.keys(o)) if (o[id] === kid) delete lots[id]; };
  const shopReady = (p, day) => !!(p && p.way === 'shop' && p.at && (p.ready | 0) > 0 && (p.ready | 0) <= (day | 0));
  const lvBonus = (lots, path, day) => {
    const o = usedLots(lots); if (!Object.keys(o).length) return 0;
    if (!path) return 1;
    for (const id of Object.keys(o)) { const p = path[o[id]]; if (shopReady(p, day == null ? (p && p.ready) || 1 : day)) return 1; }
    return 0;
  };
  const townLv = (hall, lots, path, day) => prosperity(hall) + lvBonus(lots, path, day);

  // ---------- path records ----------
  // { way, at, kind, day, ready, pending, free }
  // pending: { way, at, kind, day } to apply next morning. free: 1 = first 换个活法 is free (already married before v5.10.6).
  function cleanPath(v, kid) {
    const o = obj(v); const way = WAYS.includes(o.way) ? o.way : 'farm';
    const out = { way, at: null, kind: null, day: int(o.day, 1, 1e6) || 0, ready: 0, pending: null, free: o.free ? 1 : 0 };
    if (way === 'work' && JOB[o.at]) out.at = o.at;
    if (way === 'shop') {
      out.at = LOT[o.at] ? o.at : null;
      out.kind = KINDS[o.kind] ? o.kind : null;
      out.ready = int(o.ready, 0, 1e6);
    }
    const p = obj(o.pending);
    if (WAYS.includes(p.way)) {
      const pend = { way: p.way, at: null, kind: null, day: int(p.day, 1, 1e6) };
      if (p.way === 'work' && JOB[p.at]) pend.at = p.at;
      if (p.way === 'shop') { pend.at = LOT[p.at] ? p.at : null; pend.kind = KINDS[p.kind] ? p.kind : null; }
      out.pending = pend;
    }
    return out;
  }
  const empty = () => ({ path: {}, wage: 0 });
  function valid(v) {
    const o = obj(v), out = empty();
    const path = obj(o.path);
    for (const k of KID_IDS) if (path[k]) out.path[k] = cleanPath(path[k], k);
    out.wage = int(o.wage, 0, 1e12);
    return out;
  }
  function validLots(v) {
    const o = obj(v), out = {};
    const seen = new Set();
    for (const id of lotIds()) {
      const kid = o[id]; if (!KID_IDS.includes(kid) || seen.has(kid)) continue;
      out[id] = kid; seen.add(kid);
    }
    return out;
  }
  // a married child with no record is farming, and their first change is free
  function pathOf(st, kid) {
    const p = st && st.path && st.path[kid];
    if (!p) return { way: 'farm', at: null, kind: null, day: 0, ready: 0, pending: null, free: 1, implied: 1 };
    return p;
  }
  const isAway = (st, kid, day) => { const p = pathOf(st, kid); return p.way === 'work' || shopReady(p, day == null ? 1e9 : day) || (p.way === 'shop' && !shopReady(p, day == null ? 0 : day) && p.at); };
  // yield and main-farm help: while they work or keep a shop (including the build day) the little farm is halved and help is rarer
  const awayForFarm = (st, kid) => { const p = pathOf(st, kid); return p.way === 'work' || p.way === 'shop'; };
  const yieldMul = (st, kid) => awayForFarm(st, kid) ? YIELD.away : YIELD.farm;
  const helpDayP = (st, kid) => awayForFarm(st, kid) ? HELP_P.away : HELP_P.farm;
  const earnOf = (g, st, kid) => Math.round((g | 0) * yieldMul(st, kid));

  // ---------- tendency and options ----------
  function bestJob(ctx) {
    const hall = ctx && ctx.hall, nb = obj(ctx && ctx.nb);
    let b = null;
    for (const j of JOBS) {
      if (!jobBuilt(hall, j.at)) continue;
      const v = nb[j.nb] | 0;
      if (!b || v > b.v || (v === b.v && JOBS.indexOf(j) < JOBS.indexOf(JOB[b.at]))) b = { at: j.at, v };
    }
    return b;
  }
  // the child's default: (1) the job whose owner they like most, if ≥ 50 and that shop is up;
  // (2) open the spouse's kind of shop if they can; (3) stay and farm.
  function prefer(st, kid, ctx) {
    const job = bestJob(ctx);
    if (job && job.v >= 50) return { way: 'work', at: job.at, kind: null };
    const kind = kindOfMate(ctx && ctx.mate);
    if (kind && canTake(st, kid, { way: 'shop', kind }, ctx) == null) return { way: 'shop', at: null, kind };
    return { way: 'farm', at: null, kind: null };
  }
  function canTake(st, kid, choice, ctx) {
    const way = choice && choice.way;
    if (!WAYS.includes(way)) return '没有这条路';
    if (way === 'farm') return null;
    if (way === 'work') {
      if (!anyJob(ctx && ctx.hall)) return '先盖好面包房、木工坊或铁匠铺，再去镇上上班';
      const at = choice.at || (bestJob(ctx) && bestJob(ctx).at);
      if (!at || !JOB[at]) return '先盖好面包房、木工坊或铁匠铺，再去镇上上班';
      if (!jobBuilt(ctx && ctx.hall, at)) return JOB[at].name + '还没盖好';
      return null;
    }
    // shop
    const hall = ctx && ctx.hall;
    if (prosperity(hall) < SHOP.lv) return '繁荣度到 3 才能开店（先把集市和面包房盖好）';
    const cur = pathOf(st, kid);
    const keep = cur.way === 'shop' && shopReady(cur, ctx && ctx.day) ? cur.at : null;
    const free = freeLots(ctx && ctx.lots);
    if (!keep && !free.length) return '镇上没有空地块了';
    const kind = choice.kind || kindOfMate(ctx && ctx.mate);
    if (!KINDS[kind]) return '开店要先成家';
    const reopen = cur.way === 'shop' && keep;
    if (!reopen) {
      if ((ctx.coins | 0) < SHOP.cost) return '金币不够（开店要 15,000 金）';
      if ((ctx.wood | 0) < SHOP.wood) return '木材不够（开店要 150 份）';
    }
    return null;
  }
  function fillChoice(choice, ctx, st, kid) {
    const way = choice && choice.way;
    if (way === 'work') {
      const at = choice.at || (bestJob(ctx) && bestJob(ctx).at) || null;
      return { way: 'work', at, kind: null };
    }
    if (way === 'shop') {
      const kind = choice.kind || kindOfMate(ctx && ctx.mate) || null;
      const cur = pathOf(st, kid);
      const at = (choice.at && LOT[choice.at] && (!(usedLots(ctx && ctx.lots)[choice.at]) || usedLots(ctx && ctx.lots)[choice.at] === kid))
        ? choice.at
        : (cur.way === 'shop' && cur.at) || freeLots(ctx && ctx.lots)[0] || null;
      return { way: 'shop', at, kind };
    }
    return { way: 'farm', at: null, kind: null };
  }
  function optionView(way, ctx, st, kid, selected) {
    if (way === 'farm') return { way: 'farm', at: null, kind: null, title: '留家种地', desc: '照看小田和鸡，偶尔回主农场帮忙', cost: 0, wood: 0, ok: true, why: null, selected: !!selected };
    if (way === 'work') {
      const job = bestJob(ctx), at = job && job.at, why = canTake(st, kid, { way: 'work', at }, ctx);
      const j = at && JOB[at];
      return { way: 'work', at: at || null, kind: null, title: '去镇上上班',
        desc: j ? `去${j.name}帮工，每天工钱 ${WAGE} 金；${j.perk}` : '在面包房、木工坊或铁匠铺帮工，每天工钱 300 金',
        cost: 0, wood: 0, ok: !why, why, selected: !!selected };
    }
    const kind = kindOfMate(ctx && ctx.mate), k = KINDS[kind];
    const why = canTake(st, kid, { way: 'shop', kind }, ctx);
    return { way: 'shop', at: null, kind: kind || null, title: '在镇上开店',
      desc: k ? `开「${(ctx && ctx.kidName) || '孩子'}的${k.name}」，从仓库拿货，比集市多卖 30%` : '在空地块上开一家挂着孩子名字的店',
      cost: SHOP.cost, wood: SHOP.wood, ok: !why, why, selected: !!selected };
  }
  function options(st, kid, ctx) {
    const pref = prefer(st, kid, ctx);
    return WAYS.map(w => optionView(w, ctx, st, kid, pref.way === w));
  }

  // ---------- take a path / change later ----------
  function writePath(st, kid, rec) {
    st.path = st.path || {};
    const cur = st.path[kid] || {};
    st.path[kid] = Object.assign({ free: 0, pending: null }, rec);
    if (cur.free && rec.free == null) st.path[kid].free = cur.free;
    return st.path[kid];
  }
  // apply now (the wedding morning, or a pending change). pays the shop fit-out, assigns a lot, refunds a closed shop.
  function take(st, lots, kid, choice, ctx, day) {
    const filled = fillChoice(choice, ctx, st, kid);
    const why = canTake(st, kid, filled, ctx); if (why) return { ok: false, why };
    const cur = pathOf(st, kid);
    let refund = 0, paid = 0, wood = 0;
    const closing = cur.way === 'shop' && cur.at && filled.way !== 'shop';
    const reopen = cur.way === 'shop' && filled.way === 'shop';
    if (closing || (reopen && filled.at !== cur.at)) {
      const built = shopReady(cur, day) || (cur.ready | 0) > 0;
      if (built && shopReady(cur, day)) refund = Math.round(SHOP.cost * SHOP.refund);
      else { refund = SHOP.cost; wood = -SHOP.wood; } // still scaffolding: give the fit-out back
      releaseLot(lots, kid);
    }
    if (filled.way === 'shop' && !(reopen && filled.at && kidLot(lots, kid) === filled.at && shopReady(cur, day))) {
      paid = SHOP.cost; wood += SHOP.wood;
      const id = filled.at && !usedLots(lots)[filled.at] ? (lots[filled.at] = kid, filled.at) : assignLot(lots, kid);
      if (!id) return { ok: false, why: '镇上没有空地块了' };
      filled.at = id;
      writePath(st, kid, { way: 'shop', at: id, kind: filled.kind, day: day | 0, ready: (day | 0) + SHOP.wait, pending: null, free: 0 });
    } else if (filled.way === 'shop') {
      writePath(st, kid, { way: 'shop', at: cur.at, kind: filled.kind || cur.kind, day: day | 0, ready: cur.ready, pending: null, free: 0 });
    } else if (filled.way === 'work') {
      writePath(st, kid, { way: 'work', at: filled.at, kind: null, day: day | 0, ready: 0, pending: null, free: 0 });
    } else {
      writePath(st, kid, { way: 'farm', at: null, kind: null, day: day | 0, ready: 0, pending: null, free: 0 });
    }
    st.wage = int(st.wage, 0, 1e12);
    return { ok: true, way: filled.way, at: st.path[kid].at, kind: st.path[kid].kind, paid, wood, refund, ready: st.path[kid].ready };
  }
  // 换个活法: 2,000 (free the first time if they were already married). Takes effect next morning.
  function planChange(st, kid, choice, ctx, day) {
    const cur = pathOf(st, kid);
    if (cur.pending) return { ok: false, why: '已经约好明天换了' };
    const filled = fillChoice(choice, ctx, st, kid);
    if (filled.way === cur.way && filled.at === cur.at && (filled.kind || null) === (cur.kind || null)) return { ok: false, why: '已经是这条路了' };
    const fee = cur.free || cur.implied ? 0 : CHANGE.cost;
    if (fee && (ctx.coins | 0) < fee) return { ok: false, why: '金币不够（换个活法要 2,000 金）' };
    const paid = Object.assign({}, ctx, { coins: (ctx.coins | 0) - fee });
    const why = canTake(st, kid, filled, paid); if (why) return { ok: false, why };
    if (filled.way === 'shop' && !(cur.way === 'shop' && shopReady(cur, day))) {
      if ((ctx.coins | 0) < fee + SHOP.cost) return { ok: false, why: '金币不够（开店还要 15,000 金）' };
      if ((ctx.wood | 0) < SHOP.wood) return { ok: false, why: '木材不够（开店要 150 份）' };
    }
    if (!st.path) st.path = {};
    if (!st.path[kid] || cur.implied) writePath(st, kid, { way: 'farm', at: null, kind: null, day: cur.day || 0, ready: 0, pending: null, free: 1 });
    st.path[kid].pending = { way: filled.way, at: filled.at, kind: filled.kind, day: day | 0 };
    return { ok: true, fee, pending: st.path[kid].pending, free: fee === 0 };
  }
  function applyPending(st, lots, kid, ctx, day) {
    const p = pathOf(st, kid); if (!p.pending) return null;
    const choice = p.pending; p.pending = null;
    const r = take(st, lots, kid, choice, ctx, day);
    if (st.path && st.path[kid]) st.path[kid].free = 0;
    return r;
  }

  // ---------- daily pay ----------
  const worksToday = (st, kid, fest) => pathOf(st, kid).way === 'work' && !fest;
  const shopsToday = (st, kid, day) => shopReady(pathOf(st, kid), day);
  function payWage(st) { st.wage = (st.wage | 0) + WAGE; return WAGE; }
  // goods: [{ id, n }] or a counts map. fish items use id 'fish' or a fish type; fish food is 'fishFood'.
  function goodsOf(kind) { return (KINDS[kind] && KINDS[kind].goods) || []; }
  function matches(kind, id, isFish) {
    const g = goodsOf(kind); if (!g.length) return false;
    if (g.includes(id)) return true;
    if (g.includes('fish') && (id === 'fish' || isFish)) return true;
    return false;
  }
  // shop price: 30% over the regular market price (which itself is 15% over the stall)
  const marketPrice = base => Math.round((base | 0) * (1 + MARKET_BONUS));
  const shopPrice = base => Math.round(marketPrice(base) * (1 + SHOP.over));
  // take up to 10 matching pieces, dearest first. counts: { id: n }. priceOf(id) is the stall price.
  function sell(kind, counts, priceOf, isFish) {
    const pool = [];
    for (const id of Object.keys(counts || {})) {
      const n = counts[id] | 0; if (n <= 0) continue;
      if (!matches(kind, id, isFish && isFish(id))) continue;
      const unit = shopPrice(priceOf ? priceOf(id) : 0); if (!(unit > 0)) continue;
      pool.push({ id, n, unit, base: marketPrice(priceOf ? priceOf(id) : 0) });
    }
    pool.sort((a, b) => b.unit - a.unit || a.id.localeCompare(b.id));
    let left = SHOP.take, gold = 0, stall = 0, take = [];
    for (const p of pool) {
      const n = Math.min(p.n, left); if (!n) continue;
      take.push({ id: p.id, n }); gold += n * p.unit; stall += n * p.base; left -= n;
      if (left <= 0) break;
    }
    return { take, gold, market: stall, extra: gold - stall, n: SHOP.take - left };
  }
  function payShop(st, gold) { const g = gold | 0; st.wage = (st.wage | 0) + g; return g; }

  // ---------- work perks ----------
  const workerAt = (st, at) => KID_IDS.some(k => { const p = pathOf(st, k); return p.way === 'work' && p.at === at; });
  const extraOrders = st => (workerAt(st, 'bakery') ? 1 : 0);
  const craftTimes = st => (workerAt(st, 'wood') ? 2 : 1);
  const smithOff = st => (workerAt(st, 'smith') ? 0.1 : 0);

  // ---------- hours / places ----------
  const workHours = T => { const t = ((T % 1440) + 1440) % 1440; return t >= WORK.start && t < WORK.end; };
  const shopHours = T => { const t = ((T % 1440) + 1440) % 1440; return t >= SHOP_HOURS.from && t < SHOP_HOURS.to; };
  const shouldLeave = T => { const t = ((T % 1440) + 1440) % 1440; return t >= WORK.leave && t < WORK.homeBy; };
  function standOf(at) {
    const BK = root.PFBakery, WS = root.PFWoodshop, SM = root.PFSmithy;
    if (at === 'bakery') return (BK && BK.STAND) || P(490, 79);
    if (at === 'wood') return (WS && WS.STAND) || P(576, 139);
    if (at === 'smith') return (SM && SM.STAND) || P(608, 139);
    const l = LOT[at]; return l ? P(l.door.x, l.door.y + (l.rot ? 1 : -1)) : null;
  }
  const doorOf = at => { const l = LOT[at]; return l ? l.door : standOf(at); };
  function blocks(lots, path, day) {
    const out = [], o = usedLots(lots);
    for (const id of Object.keys(o)) {
      const l = LOT[id], p = path && path[o[id]]; if (!l) continue;
      const up = p && p.way === 'shop' && p.at === id;
      if (!up) continue;
      out.push([l.x - l.hw, l.y - l.hd, l.x + l.hw, l.y + l.hd]);
    }
    return out;
  }
  function lightsAt(lots, path, T, day) {
    const t = ((T % 1440) + 1440) % 1440, out = [];
    if (!(t >= 17 * 60 + 30 && t < 22 * 60 + 30)) return out;
    const o = usedLots(lots);
    for (const id of Object.keys(o)) {
      const l = LOT[id], p = path && path[o[id]]; if (!l || !shopReady(p, day)) continue;
      out.push({ x: l.door.x, y: l.door.y + (l.rot ? 1 : -1), z: 6, r: 16, s: 0.6 });
    }
    return out;
  }

  const api = {
    WAYS, JOBS, JOB, KINDS, KIND_OF_MATE, SHOP, MARKET_BONUS, CHANGE, WAGE, WORK, SHOP_HOURS, HELP_P, YIELD, KID_IDS, LOTS, LOT, STREETS,
    kindOfMate, kindOf, jobOf, shopName, jobBuilt, anyJob, townLv, lvBonus,
    lotIds, kidLot, freeLots, assignLot, releaseLot, shopReady,
    empty, valid, validLots, cleanPath, pathOf, isAway, awayForFarm, yieldMul, helpDayP, earnOf,
    bestJob, prefer, canTake, fillChoice, options, take, planChange, applyPending,
    worksToday, shopsToday, payWage, goodsOf, matches, marketPrice, shopPrice, sell, payShop,
    workerAt, extraOrders, craftTimes, smithOff,
    workHours, shopHours, shouldLeave, standOf, doorOf, blocks, lightsAt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFCareers = api;
})(typeof window !== 'undefined' ? window : globalThis);
