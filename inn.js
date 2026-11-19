// v5.10.7 农家乐 I：民宿 + 农家菜馆
// Rules only (art in inn-art.js, walking and guests in game.js, the shop / guestbook / 「我来挑」 in ui.js).
// A bought flat-ish plot can be zoned 「民宿院」. Up to 4 cabins and one 农家菜馆 go up on it (family builds in a day).
// Guests arrive along the east avenue 10:00–16:00, stay 1–2 nights, wander the farm by day and go back to a lit cabin at night.
// Room fee 300 × star coefficient, settled at checkout. The kitchen serves home-grown dishes at 1.6× the stall. Save stays at
// v15: append-only top-level `inn`. Missing fields mean nothing is built.
(function (root) {
  'use strict';
  const NODE = typeof require === 'function' && typeof document === 'undefined';
  const PL = NODE ? require('./plots.js') : root.PFPlots;
  const P = (x, y) => ({ x, y });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 林间空地、南岸（南河湾）、河对岸、东坡 — the examples in the town plan. 东南滩 is kept for the v5.10.8 度假村.
  const INN_PLOTS = ['glade', 'sbank', 'swacross', 'seacross', 'eslope'];
  const PROSPERITY = 3, MAX_CABINS = 4, ROOM = 300;
  const FIRST = { cost: 20000, wood: 300 }, NEXT = { cost: 25000, wood: 250 };
  const DINER = { cost: 35000, wood: 400 }, KITCHEN = { cost: 20000, wood: 200, max: 2 };
  const MEAL_MARK = 1.6, MEALS_EACH = 2, SEATS0 = 4, SEATS_STEP = 4, DISHES0 = 2, DISHES_STEP = 2;
  const STAY = { min: 1, max: 2 }, GROUP = { min: 1, max: 3 };
  const ARRIVE = { from: 10 * 60, to: 16 * 60 };
  const LEAVE_MORNING = 9 * 60; // they leave in the morning; windows stay dark after that
  const ON_SCREEN = 8;
  const STAR_BOOST = 0.3; // 经营民宿 / 菜馆
  const FURNISH = 0.15;   // woodshop furniture in the cabins / diner
  const BOOK_MAX = 10, STARS_MAX = 20;
  const LOOKS = ['innA', 'innB', 'innC', 'innD', 'innE', 'innF'];

  // ---------- dishes: eat what the farm grows. price = 1.6 × stall of the ingredients ----------
  const UNIT = {
    cabbage: 30, pumpkin: 85, carrot: 8, strawberry: 30, wheat: 14, apple: 12, orange: 15,
    egg: 10, milk: 35, wool: 60, flour: 60, jam: 80, cheese: 130, honey: 40, fish: 20,
  };
  const DISHES = [
    { id: 'cabbage_egg', name: '卷心菜炒蛋', need: [{ id: 'egg', n: 1 }, { id: 'cabbage', n: 1 }] },
    { id: 'pumpkin_pie', name: '南瓜饼', need: [{ id: 'pumpkin', n: 1 }, { id: 'flour', n: 1 }] },
    { id: 'jam_muffin', name: '果酱松饼', need: [{ id: 'flour', n: 1 }, { id: 'jam', n: 1 }, { id: 'milk', n: 1 }] },
    { id: 'grill_fish', name: '烤鱼', need: [{ id: 'fish', n: 1 }] },
    { id: 'cheese_toast', name: '奶酪烤面包', need: [{ id: 'flour', n: 1 }, { id: 'cheese', n: 1 }] },
    { id: 'honey_cake', name: '蜂蜜蛋糕', need: [{ id: 'flour', n: 1 }, { id: 'honey', n: 1 }, { id: 'egg', n: 1 }] },
    { id: 'house_special', name: '拿手菜', need: [{ id: 'egg', n: 1 }, { id: 'cabbage', n: 1 }, { id: 'carrot', n: 1 }], special: 1 },
  ];
  const DISH = Object.fromEntries(DISHES.map(d => [d.id, d]));
  const unitOf = (id, priceOf) => Math.max(1, (priceOf ? priceOf(id) : UNIT[id]) | 0);
  const dishBase = (d, priceOf) => d.need.reduce((s, x) => s + x.n * unitOf(x.id, priceOf), 0);
  const dishPay = (d, priceOf) => Math.round(dishBase(d, priceOf) * MEAL_MARK);
  const canMake = (d, counts) => d.need.every(x => (counts[x.id] | 0) >= x.n);
  const pullDish = (d, counts) => { if (!canMake(d, counts)) return false; for (const x of d.need) counts[x.id] = (counts[x.id] | 0) - x.n; return true; };

  // ---------- star coefficient and daily arrivals ----------
  // 1 star 0.8 … 5 star 1.3, linear. An empty guestbook starts at 3 stars (one group a day).
  const starCoef = s => { const v = clamp(+s || 3, 1, 5); return Math.round((0.8 + (v - 1) * 0.125) * 1000) / 1000; };
  const roomFee = (nights, stars) => Math.round(ROOM * (nights | 0) * starCoef(stars));
  // 3 stars → 1 group / day, 5 stars → 3. Below 3 a day may be skipped (deterministic on the day number).
  function groupsWanted(stars, day, fest) {
    const s = clamp(+stars || 3, 1, 5);
    let n;
    if (s >= 3) n = Math.round(1 + (s - 3));
    else {
      const h = (Math.imul((day | 0) + 17, 0x9E3779B1) >>> 0) / 0x100000000;
      n = h < s / 3 ? 1 : 0;
    }
    if (fest) n *= 2;
    return clamp(n, 0, 6);
  }

  // ---------- plots / layout (tidy fixed slots, no scatter) ----------
  const innPlotOf = plots => {
    const ids = PL && PL.plotsOfMod ? PL.plotsOfMod(plots, 'inn') : Object.keys(plots || {}).filter(id => plots[id] && plots[id].mod === 'inn');
    return ids[0] || null;
  };
  const plotOk = id => INN_PLOTS.includes(id);
  // a packed-dirt yard with a south-facing restaurant, up to 4 cabins, tables, lamps, pots and a guestbook board
  function layout(plotId) {
    const p = PL && PL.plot ? PL.plot(plotId) : null; if (!p) return null;
    const [x0, y0, x1, y1] = p.rect, gate = p.gate;
    const pad = 8, ix0 = x0 + pad, iy0 = y0 + pad, ix1 = x1 - pad, iy1 = y1 - pad;
    const nearEast = Math.abs(gate.x - x1) <= Math.abs(gate.x - x0);
    const gateSouth = gate.y >= (y0 + y1) / 2;
    const dinerW = 20, dinerD = 12, cw = 14, cd = 10, tDepth = 10;
    // tables always sit on the south side of the restaurant (the default camera). The restaurant itself
    // stays near the gate when the gate is on the south, otherwise it sits behind the cabins.
    let dinerY = gateSouth ? (iy1 - tDepth - dinerD / 2) : (iy0 + dinerD / 2 + 2);
    dinerY = clamp(dinerY, iy0 + dinerD / 2, iy1 - tDepth - dinerD / 2);
    const dinerX = nearEast
      ? clamp(gate.x - dinerW / 2 - 2, ix0 + dinerW / 2, ix1 - dinerW / 2)
      : clamp(gate.x + dinerW / 2 + 2, ix0 + dinerW / 2, ix1 - dinerW / 2);
    const diner = { x: Math.round(dinerX), y: Math.round(dinerY), hw: dinerW / 2, hd: dinerD / 2,
      door: P(Math.round(dinerX), Math.round(dinerY + dinerD / 2)), rot: 0 };
    const tables = [];
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = (i / 3) | 0;
      tables.push({ i, x: Math.round(diner.x - 8 + col * 8), y: Math.round(diner.door.y + 6 + row * 7), seats: 2 });
    }
    diner.tables = tables;
    diner.stand = P(diner.door.x + 6, diner.door.y + 2);
    // cabins: a row in the half opposite the restaurant, 4 in a line when the yard is wide enough, otherwise 2×2
    const cabins = [];
    const cabinBand = gateSouth ? (iy0 + cd / 2) : (iy1 - tDepth - cd / 2);
    let cabinY = clamp(cabinBand, iy0 + cd / 2, iy1 - cd / 2);
    // keep a gap from the restaurant body
    if (Math.abs(cabinY - diner.y) < dinerD / 2 + cd / 2 + 4) {
      cabinY = diner.y + (gateSouth ? -1 : 1) * (dinerD / 2 + cd / 2 + 6);
      cabinY = clamp(cabinY, iy0 + cd / 2, iy1 - cd / 2);
    }
    const wideRow = (ix1 - ix0) >= cw * 4 + 8;
    if (wideRow) {
      const left = ix0 + cw / 2, right = ix1 - cw / 2, span = right - left;
      for (let i = 0; i < MAX_CABINS; i++) {
        const x = Math.round(left + span * i / (MAX_CABINS - 1));
        const y = Math.round(cabinY);
        cabins.push({ i, x, y, hw: cw / 2, hd: cd / 2, door: P(x, y + cd / 2), rot: 0 });
      }
    } else {
      const xs = [ix0 + cw / 2, ix1 - cw / 2];
      const ys = [cabinY, cabinY + (gateSouth ? cd + 8 : -(cd + 8))];
      let k = 0;
      for (const y of ys) for (const x of xs) {
        if (k >= MAX_CABINS) break;
        let xx = x, yy = clamp(y, iy0 + cd / 2, iy1 - cd / 2);
        // slide a cabin sideways if it would sit on the restaurant
        if (Math.abs(xx - diner.x) < dinerW / 2 + cw / 2 + 2 && Math.abs(yy - diner.y) < dinerD / 2 + cd / 2 + 2) {
          xx = diner.x + (xx < diner.x ? -1 : 1) * (dinerW / 2 + cw / 2 + 4);
          xx = clamp(xx, ix0 + cw / 2, ix1 - cw / 2);
        }
        cabins.push({ i: k, x: Math.round(xx), y: Math.round(yy), hw: cw / 2, hd: cd / 2, door: P(Math.round(xx), Math.round(yy + cd / 2)), rot: 0 });
        k++;
      }
    }
    const path = [P(gate.x, gate.y), P(Math.round((gate.x + diner.door.x) / 2), Math.round((gate.y + diner.door.y + 4) / 2)), P(diner.door.x, diner.door.y + 4)];
    const lamps = [], pots = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      lamps.push({ x: Math.round((a.x + b.x) / 2 + (i % 2 ? 4 : -4)), y: Math.round((a.y + b.y) / 2) });
    }
    for (const c of cabins) {
      pots.push({ x: c.door.x - 5, y: c.door.y + 3 });
      pots.push({ x: c.door.x + 5, y: c.door.y + 3 });
      lamps.push({ x: Math.round(c.x + c.hw + 2), y: c.y });
    }
    lamps.push({ x: Math.round(diner.x - diner.hw - 2), y: diner.y });
    lamps.push({ x: Math.round(diner.x + diner.hw + 2), y: diner.y });
    const board = P(Math.round(gate.x + (nearEast ? -8 : 8)), Math.round(gate.y + (gateSouth ? -6 : 6)));
    const yard = P(Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2));
    return { plot: plotId, rect: p.rect.slice(), gate: P(gate.x, gate.y), diner, cabins, tables, path, lamps, pots, board, yard, name: p.name };
  }

  // ---------- save (append-only; missing = nothing built) ----------
  const emptyResort = () => ({ huts: 0, parasols: 0, stall: 0, pier: 0, deck: 0 });
  const emptyDiner = () => ({ lv: 0, menu: 'auto', served: 0, missed: 0, last: 0 });
  const emptyStars = () => ({ avg: 3, last: [] });
  const emptyEarn = () => ({ rooms: 0, meals: 0 });
  const empty = () => ({ cabins: 0, inn2: 0, guests: [], diner: emptyDiner(), resort: emptyResort(), stars: emptyStars(), earn: emptyEarn(), job: null, walkins: 0 });
  function validGuest(g, i, cabins) {
    if (!g || typeof g !== 'object') return null;
    const id = typeof g.id === 'string' && /^g[0-9A-Za-z]{1,12}$/.test(g.id) ? g.id : 'g' + i;
    const look = LOOKS.includes(g.look) ? g.look : LOOKS[i % LOOKS.length];
    const n = int(g.n, GROUP.min, GROUP.max) || 1;
    const room = int(g.room, 0, Math.max(0, (cabins | 0) - 1));
    const from = int(g.from, 1, 1e6);
    const until = Math.max(from + STAY.min, int(g.until, 1, 1e6));
    return { id, look, n, room, from, until, at: int(g.at, ARRIVE.from, ARRIVE.to) || ARRIVE.from };
  }
  function validMenu(v, max) {
    if (v === 'auto' || v == null) return 'auto';
    const ids = (Array.isArray(v) ? v : []).map(id => DISH[id] ? id : null).filter(Boolean);
    const seen = new Set(), out = [];
    for (const id of ids) { if (seen.has(id)) continue; seen.add(id); out.push(id); if (out.length >= max) break; }
    return out.length ? out : 'auto';
  }
  function validStar(x) {
    if (!x || typeof x !== 'object') return null;
    const s = int(x.s, 1, 5) || 1, day = int(x.day, 1, 1e6);
    const note = typeof x.note === 'string' ? x.note.slice(0, 24) : '';
    return { day, s, note };
  }
  function avgOf(last) {
    if (!last || !last.length) return 3;
    const s = last.reduce((a, x) => a + x.s, 0) / last.length;
    return Math.round(s * 10) / 10;
  }
  function valid(v) {
    const o = obj(v), out = empty();
    out.cabins = int(o.cabins, 0, MAX_CABINS);
    out.inn2 = o.inn2 ? 1 : 0;
    out.guests = (Array.isArray(o.guests) ? o.guests : []).map((g, i) => validGuest(g, i, out.cabins)).filter(Boolean).slice(0, MAX_CABINS);
    const rooms = new Set();
    out.guests = out.guests.filter(g => { if (rooms.has(g.room) || g.room >= out.cabins) return false; rooms.add(g.room); return true; });
    const d = obj(o.diner);
    out.diner = { lv: int(d.lv, 0, 1 + KITCHEN.max), menu: validMenu(d.menu, dishSlots({ diner: { lv: int(d.lv, 0, 1 + KITCHEN.max) } }, false)),
      served: int(d.served, 0, 1e9), missed: int(d.missed, 0, 1e9), last: int(d.last, 0, 1e6) };
    const r = obj(o.resort);
    out.resort = { huts: int(r.huts, 0, 4), parasols: int(r.parasols, 0, 8), stall: r.stall ? 1 : 0, pier: r.pier ? 1 : 0, deck: r.deck ? 1 : 0 };
    const st = obj(o.stars);
    const last = (Array.isArray(st.last) ? st.last : []).map(validStar).filter(Boolean).slice(-STARS_MAX);
    out.stars = { avg: last.length ? avgOf(last) : 3, last };
    const e = obj(o.earn);
    out.earn = { rooms: int(e.rooms, 0, 1e12), meals: int(e.meals, 0, 1e12) };
    if (o.job && typeof o.job === 'object' && /^(cabin|diner|kitchen)$/.test(o.job.id)) out.job = { id: o.job.id, day: int(o.job.day, 0, 1e6) };
    out.walkins = int(o.walkins, 0, 99);
    return out;
  }

  // ---------- building (pay now, family puts it up in a day, stands the next morning) ----------
  const cabinsUp = I => I.cabins | 0;
  const dinerUp = I => (I.diner && I.diner.lv | 0) > 0;
  const kitchenLv = I => Math.max(0, (I.diner && I.diner.lv | 0) - 1);
  const seatsOf = I => dinerUp(I) ? SEATS0 + SEATS_STEP * kitchenLv(I) : 0;
  const dishSlots = (I, staffed) => {
    if (!dinerUp(I)) return 0;
    return DISHES0 + DISHES_STEP * kitchenLv(I) + (staffed ? 1 : 0);
  };
  const unlocked = (I, staffed) => {
    const n = dishSlots(I, false);
    const list = DISHES.filter(d => !d.special).slice(0, n);
    if (staffed) list.push(DISHES.find(d => d.special));
    return list.filter(Boolean);
  };
  function cabinCost(n) { return (n | 0) <= 0 ? Object.assign({}, FIRST) : Object.assign({}, NEXT); }
  function offer(I, id) {
    if (id === 'cabin') {
      const n = cabinsUp(I);
      if (n >= MAX_CABINS) return { id, ok: false, reason: 'full', why: '小木屋最多 4 间' };
      const c = cabinCost(n);
      return { id, name: n ? '再盖一间小木屋' : '第一间小木屋', cost: c.cost, wood: c.wood, ok: true };
    }
    if (id === 'diner') {
      if (dinerUp(I)) return { id, ok: false, reason: 'done', why: '农家菜馆已经盖好了' };
      return { id, name: '农家菜馆', cost: DINER.cost, wood: DINER.wood, ok: true };
    }
    if (id === 'kitchen') {
      if (!dinerUp(I)) return { id, ok: false, reason: 'need', why: '先盖农家菜馆' };
      const lv = kitchenLv(I);
      if (lv >= KITCHEN.max) return { id, ok: false, reason: 'done', why: '厨房已经升到 2 级' };
      return { id, name: '厨房第 ' + (lv + 1) + ' 级', cost: KITCHEN.cost, wood: KITCHEN.wood, ok: true, lv: lv + 1 };
    }
    return { id, ok: false, reason: 'unknown', why: '没有这个项目' };
  }
  function canStart(I, id, ctx) {
    const o = offer(I, id); if (!o.ok) return o.why;
    if (!(ctx && ctx.plot)) return '先把一块地改建成民宿院（林间空地、南河湾、河对岸或东坡）';
    if ((ctx.lv | 0) < PROSPERITY) return '繁荣度到 3 才能建（先把集市和面包房盖好）';
    if (I.job) return I.job.id === id ? '正在盖' : '一次只盖一样，等家人先把这一样搭好';
    if ((ctx.coins | 0) < o.cost) return '金币不够';
    if ((ctx.wood | 0) < o.wood) return '木材不够';
    return null;
  }
  function start(I, id, day) { I.job = { id, day: day | 0 }; return I; }
  function finish(I, day) {
    if (!I.job) return null;
    if ((day | 0) <= (I.job.day | 0)) return null;
    const id = I.job.id; I.job = null;
    if (id === 'cabin' && I.cabins < MAX_CABINS) I.cabins = (I.cabins | 0) + 1;
    if (id === 'diner' && !dinerUp(I)) I.diner.lv = 1;
    if (id === 'kitchen' && dinerUp(I) && kitchenLv(I) < KITCHEN.max) I.diner.lv = (I.diner.lv | 0) + 1;
    return id;
  }
  const plotBusy = (plotId, plots, I) => {
    if (!plotId || !plots || !plots[plotId] || plots[plotId].mod !== 'inn') return null;
    if ((I && I.cabins | 0) > 0 || dinerUp(I) || (I && I.job)) return '这块地上有民宿，不能改建';
    return null;
  };

  // ---------- guests ----------
  const hash = (day, k) => (Math.imul((day | 0) * 33 + (k | 0) + 19, 0x9E3779B1) >>> 0);
  const freeRooms = I => {
    const used = new Set((I.guests || []).map(g => g.room));
    const out = []; for (let i = 0; i < cabinsUp(I); i++) if (!used.has(i)) out.push(i);
    return out;
  };
  const staying = (I, day) => (I.guests || []).filter(g => (g.from | 0) <= (day | 0) && (g.until | 0) > (day | 0));
  const leaving = (I, day) => (I.guests || []).filter(g => (g.until | 0) <= (day | 0));
  const peopleOf = (I, day) => staying(I, day).reduce((s, g) => s + (g.n | 0), 0);
  const effectiveStars = (I, staffed, furnished) => clamp((I.stars && I.stars.avg || 3) + (staffed ? STAR_BOOST : 0) + (furnished ? FURNISH : 0), 1, 5);
  function planArrivals(I, day, stars, fest) {
    const rooms = freeRooms(I); if (!rooms.length) return [];
    const want = groupsWanted(stars, day, fest);
    const out = [];
    for (let k = 0; k < want && k < rooms.length; k++) {
      const h = hash(day, k);
      const n = GROUP.min + (h % (GROUP.max - GROUP.min + 1));
      const nights = STAY.min + ((h >>> 4) % (STAY.max - STAY.min + 1));
      const span = ARRIVE.to - ARRIVE.from;
      const at = ARRIVE.from + ((h >>> 8) % Math.max(1, span));
      const look = LOOKS[(h >>> 16) % LOOKS.length];
      out.push({ id: 'g' + day + k, look, n, room: rooms[k], from: day | 0, until: (day | 0) + nights, at });
    }
    return out;
  }
  function checkIn(I, day, stars, fest) {
    const add = planArrivals(I, day, stars, fest);
    I.guests = (I.guests || []).concat(add);
    return add;
  }
  function checkOut(I, day, rate) {
    const gone = leaving(I, day); if (!gone.length) return { groups: [], gold: 0, notes: [] };
    const stars = (I.stars && I.stars.avg) || 3;
    let gold = 0; const notes = [];
    for (const g of gone) {
      const nights = Math.max(STAY.min, (g.until | 0) - (g.from | 0));
      const pay = roomFee(nights, stars);
      gold += pay; I.earn.rooms = (I.earn.rooms | 0) + pay;
      const rated = rate ? rate(g, nights) : { s: 3, note: '' };
      const rec = { day: day | 0, s: int(rated.s, 1, 5) || 3, note: String(rated.note || '').slice(0, 24) };
      I.stars.last = (I.stars.last || []).concat([rec]).slice(-STARS_MAX);
      notes.push(rec);
    }
    I.stars.avg = avgOf(I.stars.last);
    I.guests = (I.guests || []).filter(g => (g.until | 0) > (day | 0));
    return { groups: gone, gold, notes };
  }

  // ---------- menu / meals ----------
  function listed(I, staffed) {
    const open = unlocked(I, staffed);
    if (I.diner.menu === 'auto' || !Array.isArray(I.diner.menu)) return open;
    const allow = new Set(open.map(d => d.id));
    const picked = I.diner.menu.map(id => DISH[id]).filter(d => d && allow.has(d.id));
    return picked.length ? picked : open;
  }
  // auto: the dishes whose ingredients the warehouse has most of (skip any we cannot make)
  function autoMenu(I, counts, staffed, priceOf) {
    const open = unlocked(I, staffed);
    const ranked = open.map(d => {
      const have = d.need.reduce((s, x) => s + ((counts[x.id] | 0) / x.n), 0);
      return { d, have, can: canMake(d, counts), pay: dishPay(d, priceOf) };
    }).sort((a, b) => (b.can - a.can) || b.have - a.have || b.pay - a.pay || a.d.id.localeCompare(b.d.id));
    return ranked.filter(x => x.can).map(x => x.d);
  }
  const todayMenu = (I, counts, staffed, priceOf) => {
    const list = I.diner.menu === 'auto' || !Array.isArray(I.diner.menu) ? autoMenu(I, counts, staffed, priceOf) : listed(I, staffed).filter(d => canMake(d, counts));
    return list;
  };
  function setMenu(I, v, staffed) {
    I.diner.menu = v === 'auto' || v == null ? 'auto' : validMenu(v, dishSlots(I, staffed));
    return I;
  }
  // serve up to `want` portions; dishes that run out of stock drop off. returns { gold, n, missed, used }
  function serve(I, want, counts, staffed, priceOf) {
    if (!dinerUp(I)) return { gold: 0, n: 0, missed: want | 0, used: [] };
    let left = want | 0, gold = 0, n = 0; const used = [];
    while (left > 0) {
      const menu = todayMenu(I, counts, staffed, priceOf);
      if (!menu.length) break;
      const d = menu[0];
      if (!pullDish(d, counts)) break;
      const pay = dishPay(d, priceOf);
      gold += pay; n++; left--; used.push(d.id);
    }
    I.diner.served = (I.diner.served | 0) + n;
    I.diner.missed = (I.diner.missed | 0) + left;
    I.earn.meals = (I.earn.meals | 0) + gold;
    return { gold, n, missed: left, used };
  }
  function mealsWanted(I, day, fest, walkins) {
    const ppl = peopleOf(I, day);
    const extra = (walkins | 0) + (fest ? Math.max(4, ppl) : 0);
    return ppl * MEALS_EACH + extra;
  }
  // walk-in diners on a festival / market day (and leftover groups that could not get a cabin)
  function walkinsOf(fest, overflow, day) {
    if (!fest && !(overflow > 0)) return 0;
    const h = hash(day, 9);
    const base = fest ? 4 + (h % 5) : 0; // 4–8 walk-ins on a festive day
    return base + Math.max(0, overflow | 0);
  }

  // ---------- star sources (existing farm state only; the player does not have to tend the guests) ----------
  // ctx: { animals: [{h}], yard: n, yardCap, decor, flowers, missed, fireflies, sunset, servedDish }
  const NOTES = {
    animals: ['羊好软', '小鸡很亲近', '牛也来看我们了'],
    yard: ['院子收拾得很干净'],
    clutter: ['院子里有点乱'],
    decor: ['花开得真好', '灯很亮堂'],
    dish: ['南瓜饼好吃', '卷心菜炒蛋很香', '果酱松饼松软'],
    miss: ['今天的菜不够'],
    firefly: ['晚上有萤火虫'],
    sunset: ['看到了海上的落日'],
    stay: ['住得很安静'],
    furnish: ['屋子很舒服'],
  };
  function rateStay(ctx) {
    const c = ctx || {};
    const animals = Array.isArray(c.animals) && c.animals.length ? c.animals.reduce((s, a) => s + (a.h | 0), 0) / c.animals.length / 100 : 0.5;
    const cap = Math.max(1, c.yardCap | 0 || 18);
    const tidy = 1 - clamp((c.yard | 0) / cap, 0, 1);
    const decor = clamp(((c.decor | 0) + (c.flowers | 0)) / 16, 0, 1);
    const food = c.missed > 0 ? 0.25 : (c.diner ? 1 : 0.6);
    const magic = (c.fireflies ? 0.15 : 0) + (c.sunset ? 0.15 : 0);
    const furnish = c.furnish ? 0.1 : 0;
    const raw = clamp(0.15 + 0.25 * animals + 0.15 * tidy + 0.15 * decor + 0.2 * food + magic + furnish, 0, 1);
    const s = clamp(Math.round(1 + raw * 4), 1, 5);
    let note = NOTES.stay[0];
    if (c.sunset) note = NOTES.sunset[0];
    else if (c.fireflies) note = NOTES.firefly[0];
    else if (c.missed > 0) note = '今天的菜不够';
    else if (food >= 1 && c.servedDish) {
      const d = DISH[c.servedDish]; note = d && /南瓜/.test(d.name) ? '南瓜饼好吃' : (d && /果酱/.test(d.name) ? '果酱松饼松软' : (d && /炒蛋/.test(d.name) ? '卷心菜炒蛋很香' : (d ? d.name + '好吃' : note)));
    } else if (animals >= 0.8) note = NOTES.animals[0];
    else if (decor >= 0.6) note = NOTES.decor[0];
    else if (tidy >= 0.8) note = NOTES.yard[0];
    else if (tidy < 0.4) note = NOTES.clutter[0];
    else if (c.furnish) note = NOTES.furnish[0];
    return { s, note, parts: { animals, tidy, decor, food, magic, furnish } };
  }
  const book = I => (I.stars && I.stars.last || []).slice(-BOOK_MAX).slice().reverse();

  // ---------- festive days: market day, and later 运动会 / 丰收节 / 灯会 if those flags are set ----------
  const isFest = ctx => !!(ctx && (ctx.market || ctx.sports || ctx.harvest || ctx.lantern || ctx.fest));

  // ---------- entry from the east avenue ----------
  // town open: the town gate at the end of the east road; otherwise the east-road plot's gate (or the lane at x 362, y 66).
  function entryOf(plots, townOpen) {
    if (townOpen) return P(440, 66);
    if (plots && plots.eroad) return P(362, 66);
    return P(352, 66);
  }

  const api = {
    INN_PLOTS, PROSPERITY, MAX_CABINS, ROOM, FIRST, NEXT, DINER, KITCHEN, MEAL_MARK, MEALS_EACH,
    STAY, GROUP, ARRIVE, LEAVE_MORNING, ON_SCREEN, STAR_BOOST, FURNISH, BOOK_MAX, STARS_MAX, LOOKS,
    UNIT, DISHES, DISH, unitOf, dishBase, dishPay, canMake, pullDish,
    starCoef, roomFee, groupsWanted, effectiveStars,
    innPlotOf, plotOk, layout,
    empty, emptyDiner, emptyStars, emptyEarn, emptyResort, valid, validMenu, avgOf,
    cabinsUp, dinerUp, kitchenLv, seatsOf, dishSlots, unlocked, cabinCost, offer, canStart, start, finish, plotBusy,
    hash, freeRooms, staying, leaving, peopleOf, planArrivals, checkIn, checkOut,
    listed, autoMenu, todayMenu, setMenu, serve, mealsWanted, walkinsOf,
    NOTES, rateStay, book, isFest, entryOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFInn = api;
})(typeof window !== 'undefined' ? window : globalThis);
