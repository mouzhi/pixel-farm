// v5.10.7 农家乐 I：民宿 + 农家菜馆. v5.10.8 农家乐 II：海边度假村 + 二层客栈.
// Rules only (art in inn-art.js, walking and guests in game.js, the shop / guestbook / 「我来挑」 in ui.js).
// v5.11.0.5: the lodging moved off the farm plots into the 农家乐区 by the town gate (SITE / AGRI / agriLayout / migrate below);
// the per-plot layout and INN_PLOTS stay only for old code paths and tests.
// A bought flat-ish plot can be zoned 「民宿院」. Up to 4 cabins and one 农家菜馆 go up on it (family builds in a day).
// v5.10.8: the yard can become a two-storey inn (each cabin hosts one extra group). 东南滩 zones as 「度假村」; the existing
// beach holds huts, umbrellas, a seafood stall, a guest pier and a sunset deck. Resort guests stay only on the beach.
// Guests arrive along the east avenue 10:00–16:00, stay 1–2 nights, wander the farm by day and go back to a lit cabin at night.
// Room fee 300 × star coefficient, settled at checkout. The kitchen serves home-grown dishes at 1.6× the stall. The seafood
// stall uses the farm's sea fish; its takings go into earn.meals. Save stays at v15: append-only top-level `inn`. Missing
// fields mean nothing is built.
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
  const BEACH_LOOKS = ['beachA', 'beachB', 'beachC', 'beachD', 'beachE', 'beachF'];
  const RESORT_PLOT = 'eshore';
  const MAX_HUTS = 4, MAX_PARASOLS = 8;
  const HUT = { cost: 15000, wood: 200 };
  const PARASOL = { cost: 2000, wood: 0 };
  const SEA_STALL = { cost: 30000, wood: 250 };
  const GUEST_PIER = { cost: 25000, wood: 300 };
  const DECK = { cost: 20000, wood: 200 };
  const INN2 = { cost: 60000, wood: 600 };
  const SUNSET = { from: 17 * 60, to: 19 * 60 };
  // the existing 海边 (world.js coast). Layout slots stay on this beach; 东南滩 only has to be zoned 度假村.
  const COAST = { rect: [200, 212, 344, 256], gate: P(220, 212), pier: P(280, 256), water: [200, 248, 352, 288],
    fish: { stand: P(280, 268), hook: P(280, 278) }, center: P(272, 236) };
  const SEA_FISH = ['sardine', 'seabass', 'snapper', 'tuna', 'sword'];
  const RESORT_JOBS = /^(hut|stall|pier|deck)$/;
  const INN_JOBS = /^(cabin|diner|kitchen|inn2)$/;
  const ALL_JOBS = /^(cabin|diner|kitchen|inn2|hut|stall|pier|deck)$/;

  // ---------- dishes: eat what the farm grows. price = 1.6 × stall of the ingredients ----------
  const UNIT = {
    cabbage: 30, pumpkin: 85, carrot: 8, strawberry: 30, wheat: 14, apple: 12, orange: 15,
    egg: 10, milk: 35, wool: 60, flour: 60, jam: 80, cheese: 130, honey: 40, fish: 20,
    sardine: 16, seabass: 28, snapper: 48, tuna: 80, sword: 140, seafish: 16,
  };
  const DISHES = [
    { id: 'cabbage_egg', name: '卷心菜炒蛋', need: [{ id: 'egg', n: 1 }, { id: 'cabbage', n: 1 }] },
    { id: 'pumpkin_pie', name: '南瓜饼', need: [{ id: 'pumpkin', n: 1 }, { id: 'flour', n: 1 }] },
    { id: 'jam_muffin', name: '果酱松饼', need: [{ id: 'flour', n: 1 }, { id: 'jam', n: 1 }, { id: 'milk', n: 1 }] },
    { id: 'grill_fish', name: '烤鱼', need: [{ id: 'fish', n: 1 }] },
    { id: 'cheese_toast', name: '奶酪烤面包', need: [{ id: 'flour', n: 1 }, { id: 'cheese', n: 1 }] },
    { id: 'honey_cake', name: '蜂蜜蛋糕', need: [{ id: 'flour', n: 1 }, { id: 'honey', n: 1 }, { id: 'egg', n: 1 }] },
    { id: 'house_special', name: '拿手菜', need: [{ id: 'egg', n: 1 }, { id: 'cabbage', n: 1 }, { id: 'carrot', n: 1 }], special: 1 },
    { id: 'grill_sea', name: '海鱼烤', need: [{ id: 'seafish', n: 1 }], stall: 1 },
    { id: 'seafood_soup', name: '海鲜汤', need: [{ id: 'seafish', n: 2 }], stall: 1 },
  ];
  const DISH = Object.fromEntries(DISHES.map(d => [d.id, d]));
  const isSeaFish = id => SEA_FISH.includes(id);
  const seaCount = counts => SEA_FISH.reduce((s, id) => s + (counts[id] | 0), 0);
  const unitOf = (id, priceOf) => Math.max(1, (priceOf ? priceOf(id === 'seafish' ? 'sardine' : id) : UNIT[id === 'seafish' ? 'sardine' : id]) | 0);
  const dishBase = (d, priceOf) => d.need.reduce((s, x) => s + x.n * unitOf(x.id, priceOf), 0);
  const dishPay = (d, priceOf) => Math.round(dishBase(d, priceOf) * MEAL_MARK);
  const haveOf = (id, counts) => id === 'seafish' ? seaCount(counts) : (counts[id] | 0);
  const canMake = (d, counts) => d.need.every(x => haveOf(x.id, counts) >= x.n);
  function pullSea(counts, n) {
    let left = n | 0; const used = [];
    const order = SEA_FISH.slice().sort((a, b) => (counts[b] | 0) - (counts[a] | 0) || (UNIT[a] - UNIT[b]) || a.localeCompare(b));
    for (const id of order) {
      const take = Math.min(counts[id] | 0, left); if (!take) continue;
      counts[id] = (counts[id] | 0) - take; left -= take; for (let i = 0; i < take; i++) used.push(id);
      if (!left) break;
    }
    return left === 0 ? used : null;
  }
  const pullDish = (d, counts) => {
    if (!canMake(d, counts)) return false;
    for (const x of d.need) {
      if (x.id === 'seafish') { if (!pullSea(counts, x.n)) return false; }
      else counts[x.id] = (counts[x.id] | 0) - x.n;
    }
    return true;
  };

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
  // ---------- v5.11.0.5: the 农家乐区 (docs/town-scale-plan.md 2.4) ----------
  // Its own ground by the town gate (town.js AGRI), the east road through the middle. Cabins (and the two-storey inn) stand in
  // a row on the north half, the restaurant with its kitchen, tables, a kitchen garden and a little guest square on the south
  // half. No farm plot is zoned for it any more: once the town gate is open the district is there to build on.
  const SITE = 'agri';
  const AGRI = [456, -40, 584, 200];
  // where the lodging stands. townOpen: the town gate is open (the district is reachable); a save that already has buildings
  // keeps them even if that flag is somehow off.
  const anyInn = I => !!(I && ((I.cabins | 0) > 0 || (I.inn2 | 0) > 0 || (I.diner && I.diner.lv | 0) > 0 || (I.job && INN_JOBS.test(I.job.id))));
  const siteOf = (townOpen, I) => (townOpen || anyInn(I)) ? SITE : null;
  function agriLayout() {
    const [x0, y0, x1, y1] = AGRI, roadY = 66;
    // v5.11.0.9 (房子比例): cabins 18 x 13 and the restaurant 28 x 16 world units (they were 14 x 10 and 20 x 12), the same size
    // class as the v5.11.0 town houses; the cabins spread out so the lane up the middle (x 520) stays clear
    const cw = 18, cd = 13;
    const cabins = [476, 500, 540, 564].map((x, i) => ({ i, x, y: 8, hw: cw / 2, hd: cd / 2, door: P(x, 8 + cd / 2), rot: 0 }));
    const diner = { x: 520, y: 104, hw: 14, hd: 8, door: P(520, 112), rot: 0 };
    const tables = [];
    for (let i = 0; i < 6; i++) { const col = i % 3, row = (i / 3) | 0; tables.push({ i, x: 508 + col * 12, y: 123 + row * 10, seats: 2 }); }
    diner.tables = tables;
    diner.stand = P(diner.door.x + 7, diner.door.y + 2);
    // lanes: road -> cabin lane (north), road -> restaurant door (south), restaurant -> guest square
    const paths = [
      [P(520, roadY - 5), P(520, 20)], [P(476, 20), P(564, 20)],
      [P(544, roadY + 5), P(544, 116), P(523, 116)],
      [P(544, 116), P(552, 150)],
    ];
    const lamps = [P(514, 52), P(526, 30), P(550, 84), P(548, 100)];
    const pots = [];
    for (const c of cabins) { pots.push({ x: c.door.x - 5, y: c.door.y + 3 }); pots.push({ x: c.door.x + 5, y: c.door.y + 3 }); lamps.push(P(c.x + c.hw + 2, c.y)); }
    lamps.push(P(diner.x - diner.hw - 2, diner.y)); lamps.push(P(diner.x + diner.hw + 2, diner.y));
    const garden = [470, 146, 512, 182];   // 菜园: rows of greens, once the restaurant is up
    const square = [532, 140, 574, 178];   // 游客小广场
    return { plot: SITE, site: SITE, rect: AGRI.slice(), gate: P(520, roadY), diner, cabins, tables, path: paths[0], paths, lamps, pots,
      board: P(508, 56), yard: P(553, 160), garden, square, name: '农家乐区' };
  }
  // a packed-dirt yard with a south-facing restaurant, up to 4 cabins, tables, lamps, pots and a guestbook board
  function layout(plotId) {
    if (plotId === SITE) return agriLayout();
    const p = PL && PL.plot ? PL.plot(plotId) : null; if (!p) return null;
    const [x0, y0, x1, y1] = p.rect, gate = p.gate;
    const pad = 8, ix0 = x0 + pad, iy0 = y0 + pad, ix1 = x1 - pad, iy1 = y1 - pad;
    const nearEast = Math.abs(gate.x - x1) <= Math.abs(gate.x - x0);
    const gateSouth = gate.y >= (y0 + y1) / 2;
    const dinerW = 28, dinerD = 16, cw = 18, cd = 13, tDepth = 14; // v5.11.0.9: the bigger cabins and restaurant
    // tables always sit on the south side of the restaurant (the default camera). The restaurant itself
    // stays near the gate; cabins take the opposite side so a tall roof does not sit on a cabin.
    let dinerY = gateSouth ? (iy1 - tDepth - dinerD / 2) : (iy0 + dinerD / 2 + 2);
    dinerY = clamp(dinerY, iy0 + dinerD / 2, iy1 - tDepth - dinerD / 2);
    const dinerX = nearEast
      ? clamp(Math.max(gate.x - dinerW / 2 - 2, ix1 - dinerW / 2 - 2), ix0 + dinerW / 2, ix1 - dinerW / 2)
      : clamp(Math.min(gate.x + dinerW / 2 + 2, ix0 + dinerW / 2 + 2), ix0 + dinerW / 2, ix1 - dinerW / 2);
    const diner = { x: Math.round(dinerX), y: Math.round(dinerY), hw: dinerW / 2, hd: dinerD / 2,
      door: P(Math.round(dinerX), Math.round(dinerY + dinerD / 2)), rot: 0 };
    const tables = [];
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = (i / 3) | 0;
      tables.push({ i, x: Math.round(diner.x - 8 + col * 8), y: Math.round(diner.door.y + 8 + row * 8), seats: 2 });
    }
    diner.tables = tables;
    diner.stand = P(diner.door.x + 6, diner.door.y + 2);
    // cabins: a row in the half opposite the restaurant, 4 in a line when the yard is wide enough, otherwise 2×2
    const cabins = [];
    const cabinBand = gateSouth ? (iy0 + cd / 2) : (iy1 - tDepth - cd / 2);
    let cabinY = clamp(cabinBand, iy0 + cd / 2, iy1 - cd / 2);
    // keep a gap from the restaurant body (the voxel model is a little deeper than this box)
    if (Math.abs(cabinY - diner.y) < dinerD / 2 + cd / 2 + 10) {
      cabinY = diner.y + (gateSouth ? -1 : 1) * (dinerD / 2 + cd / 2 + 14);
      cabinY = clamp(cabinY, iy0 + cd / 2, iy1 - cd / 2);
    }
    // cabins stay out of the restaurant's x-band so a south camera does not stack them
    const gapX = dinerW / 2 + cw / 2 + 6;
    let left = ix0 + cw / 2, right = ix1 - cw / 2;
    if (diner.x - left < gapX) left = Math.min(right, diner.x + gapX);
    if (right - diner.x < gapX) right = Math.max(left, diner.x - gapX);
    if (left > right) { left = ix0 + cw / 2; right = ix1 - cw / 2; }
    const wideRow = (right - left) >= cw * 3;
    if (wideRow) {
      const span = right - left;
      const n = MAX_CABINS;
      for (let i = 0; i < n; i++) {
        const x = Math.round(left + (n === 1 ? 0 : span * i / (n - 1)));
        const y = Math.round(cabinY);
        cabins.push({ i, x, y, hw: cw / 2, hd: cd / 2, door: P(x, y + cd / 2), rot: 0 });
      }
    } else {
      const xs = [left, right];
      const ys = [cabinY, cabinY + (gateSouth ? cd + 8 : -(cd + 8))];
      let k = 0;
      for (const y of ys) for (const x of xs) {
        if (k >= MAX_CABINS) break;
        let xx = x, yy = clamp(y, iy0 + cd / 2, iy1 - cd / 2);
        // slide a cabin sideways if it would sit on the restaurant
        if (Math.abs(xx - diner.x) < dinerW / 2 + cw / 2 + 2 && Math.abs(yy - diner.y) < dinerD / 2 + cd / 2 + 2) {
          xx = diner.x + (xx < diner.x ? -1 : 1) * (dinerW / 2 + cw / 2 + 4);
          xx = clamp(xx, left, right);
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

  // ---------- resort layout: tidy fixed slots on the existing 海边 beach (never scatter) ----------
  // Huts sit in two pairs north of the sand, leaving the path from the gate (220,212) to the old pier (280,256).
  // Umbrellas stand in two rows closer to the water, skipping the pier column. The stall is at the east end, the
  // sunset deck at the west waterline, and the guest pier east of the fishing pier.
  function resortPlotOf(plots) {
    const ids = PL && PL.plotsOfMod ? PL.plotsOfMod(plots, 'resort') : Object.keys(plots || {}).filter(id => plots[id] && plots[id].mod === 'resort');
    return ids[0] || null;
  }
  function resortLayout() {
    const hw = 7, hd = 5; // v5.11.0.9: the huts are a size up (walls 12 x 9)
    const huts = [
      { i: 0, x: 214, y: 228, hw, hd, door: P(214, 233), rot: 0 },
      { i: 1, x: 236, y: 228, hw, hd, door: P(236, 233), rot: 0 },
      { i: 2, x: 310, y: 228, hw, hd, door: P(310, 233), rot: 0 },
      { i: 3, x: 332, y: 228, hw, hd, door: P(332, 233), rot: 0 },
    ];
    const parasols = [
      P(218, 238), P(240, 238), P(262, 238), P(304, 238),
      P(218, 246), P(240, 246), P(262, 246), P(304, 246),
    ].map((p, i) => ({ i, x: p.x, y: p.y }));
    const stall = { x: 328, y: 242, hw: 6, hd: 4, door: P(328, 246), stand: P(324, 246) };
    const pier = { x: 318, y: 262, hw: 4, hd: 14, stand: P(318, 270), hook: P(318, 278), from: P(318, 250) };
    const deck = { x: 210, y: 250, hw: 8, hd: 5, sit: [P(206, 250), P(210, 250), P(214, 250), P(218, 250)] };
    const path = [COAST.gate, P(250, 228), P(272, 236), COAST.pier];
    return { plot: RESORT_PLOT, coast: COAST, huts, parasols, stall, pier, deck, path, gate: COAST.gate };
  }
  const isSunset = t => { const T = ((t % 1440) + 1440) % 1440; return T >= SUNSET.from && T < SUNSET.to; };

  // ---------- save (append-only; missing = nothing built) ----------
  const emptyResort = () => ({ huts: 0, parasols: 0, stall: 0, pier: 0, deck: 0 });
  const emptyDiner = () => ({ lv: 0, menu: 'auto', served: 0, missed: 0, last: 0 });
  const emptyStars = () => ({ avg: 3, last: [] });
  const emptyEarn = () => ({ rooms: 0, meals: 0 });
  const empty = () => ({ cabins: 0, inn2: 0, guests: [], diner: emptyDiner(), resort: emptyResort(), stars: emptyStars(), earn: emptyEarn(), job: null, walkins: 0, arrived: 0 });
  const stayOf = g => (g && g.stay === 'beach') ? 'beach' : 'inn';
  const innRoomsOf = I => cabinsUp(I) * (I && I.inn2 ? 2 : 1);
  const hutsUp = I => (I && I.resort && I.resort.huts) | 0;
  const parasolsUp = I => (I && I.resort && I.resort.parasols) | 0;
  const stallUp = I => !!(I && I.resort && I.resort.stall);
  const pierUp = I => !!(I && I.resort && I.resort.pier);
  const deckUp = I => !!(I && I.resort && I.resort.deck);
  function validGuest(g, i, I) {
    if (!g || typeof g !== 'object') return null;
    const stay = stayOf(g);
    const cap = stay === 'beach' ? hutsUp(I) : innRoomsOf(I);
    if (cap <= 0) return null;
    const id = typeof g.id === 'string' && /^g[0-9A-Za-z]{1,12}$/.test(g.id) ? g.id : 'g' + i;
    const looks = stay === 'beach' ? BEACH_LOOKS : LOOKS;
    const look = looks.includes(g.look) ? g.look : looks[i % looks.length];
    const n = int(g.n, GROUP.min, GROUP.max) || 1;
    const room = int(g.room, 0, Math.max(0, cap - 1));
    const from = int(g.from, 1, 1e6);
    const until = Math.max(from + STAY.min, int(g.until, 1, 1e6));
    return { id, look, n, room, from, until, at: int(g.at, ARRIVE.from, ARRIVE.to) || ARRIVE.from, stay };
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
    const r = obj(o.resort);
    out.resort = { huts: int(r.huts, 0, 4), parasols: int(r.parasols, 0, 8), stall: r.stall ? 1 : 0, pier: r.pier ? 1 : 0, deck: r.deck ? 1 : 0 };
    const cap = innRoomsOf(out) + hutsUp(out);
    out.guests = (Array.isArray(o.guests) ? o.guests : []).map((g, i) => validGuest(g, i, out)).filter(Boolean).slice(0, Math.max(0, cap));
    const rooms = new Set();
    out.guests = out.guests.filter(g => {
      const key = stayOf(g) + ':' + g.room;
      const max = stayOf(g) === 'beach' ? hutsUp(out) : innRoomsOf(out);
      if (rooms.has(key) || g.room >= max) return false; rooms.add(key); return true;
    });
    const d = obj(o.diner);
    out.diner = { lv: int(d.lv, 0, 1 + KITCHEN.max), menu: validMenu(d.menu, dishSlots({ diner: { lv: int(d.lv, 0, 1 + KITCHEN.max) } }, false)),
      served: int(d.served, 0, 1e9), missed: int(d.missed, 0, 1e9), last: int(d.last, 0, 1e6) };
    const st = obj(o.stars);
    const last = (Array.isArray(st.last) ? st.last : []).map(validStar).filter(Boolean).slice(-STARS_MAX);
    out.stars = { avg: last.length ? avgOf(last) : 3, last };
    const e = obj(o.earn);
    out.earn = { rooms: int(e.rooms, 0, 1e12), meals: int(e.meals, 0, 1e12) };
    if (o.job && typeof o.job === 'object' && ALL_JOBS.test(o.job.id)) out.job = { id: o.job.id, day: int(o.job.day, 0, 1e6) };
    out.walkins = int(o.walkins, 0, 99);
    out.arrived = int(o.arrived, 0, 1e6);
    if (o.where === SITE) out.where = SITE;      // v5.11.0.5: the lodging moved from a plot to the 农家乐区 …
    if (int(o.moved, 1, 1e6)) out.moved = int(o.moved, 1, 1e6); // … on this day (the notice is shown once)
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
    const list = DISHES.filter(d => !d.special && !d.stall).slice(0, n);
    if (staffed) list.push(DISHES.find(d => d.special));
    return list.filter(Boolean);
  };
  function cabinCost(n) { return (n | 0) <= 0 ? Object.assign({}, FIRST) : Object.assign({}, NEXT); }
  function offer(I, id) {
    if (id === 'cabin') {
      const n = cabinsUp(I);
      if (n >= MAX_CABINS) return { id, name: '小木屋', ok: false, reason: 'full', why: '小木屋最多 4 间' };
      const c = cabinCost(n);
      return { id, name: n ? '再盖一间小木屋' : '第一间小木屋', cost: c.cost, wood: c.wood, ok: true };
    }
    if (id === 'diner') {
      if (dinerUp(I)) return { id, name: '农家菜馆', ok: false, reason: 'done', why: '农家菜馆已经盖好了' };
      return { id, name: '农家菜馆', cost: DINER.cost, wood: DINER.wood, ok: true };
    }
    if (id === 'kitchen') {
      if (!dinerUp(I)) return { id, name: '厨房升级', cost: KITCHEN.cost, wood: KITCHEN.wood, ok: false, reason: 'need', why: '先盖农家菜馆' };
      const lv = kitchenLv(I);
      if (lv >= KITCHEN.max) return { id, name: '厨房', ok: false, reason: 'done', why: '厨房已经升到 2 级' };
      return { id, name: '厨房第 ' + (lv + 1) + ' 级', cost: KITCHEN.cost, wood: KITCHEN.wood, ok: true, lv: lv + 1 };
    }
    if (id === 'inn2') {
      if (I.inn2) return { id, name: '二层客栈', ok: false, reason: 'done', why: '已经是二层客栈了' };
      if (cabinsUp(I) < 1) return { id, name: '二层客栈', cost: INN2.cost, wood: INN2.wood, ok: false, reason: 'need', why: '先盖至少一间小木屋' };
      return { id, name: '二层客栈', cost: INN2.cost, wood: INN2.wood, ok: true };
    }
    if (id === 'hut') {
      const n = hutsUp(I);
      if (n >= MAX_HUTS) return { id, ok: false, reason: 'full', why: '沙滩小屋最多 4 间', name: '沙滩小屋' };
      return { id, name: n ? '再盖一间沙滩小屋' : '第一间沙滩小屋', cost: HUT.cost, wood: HUT.wood, ok: true };
    }
    if (id === 'parasol') {
      const n = parasolsUp(I);
      if (n >= MAX_PARASOLS) return { id, ok: false, reason: 'full', why: '遮阳伞最多 8 把', name: '遮阳伞' };
      return { id, name: '遮阳伞', cost: PARASOL.cost, wood: PARASOL.wood, ok: true, instant: 1 };
    }
    if (id === 'stall') {
      if (stallUp(I)) return { id, ok: false, reason: 'done', why: '海鲜摊已经盖好了', name: '海鲜摊' };
      return { id, name: '海鲜摊', cost: SEA_STALL.cost, wood: SEA_STALL.wood, ok: true };
    }
    if (id === 'pier') {
      if (pierUp(I)) return { id, ok: false, reason: 'done', why: '游客栈桥已经盖好了', name: '游客栈桥' };
      return { id, name: '游客栈桥', cost: GUEST_PIER.cost, wood: GUEST_PIER.wood, ok: true };
    }
    if (id === 'deck') {
      if (deckUp(I)) return { id, ok: false, reason: 'done', why: '日落观景台已经盖好了', name: '日落观景台' };
      return { id, name: '日落观景台', cost: DECK.cost, wood: DECK.wood, ok: true };
    }
    return { id, ok: false, reason: 'unknown', why: '没有这个项目' };
  }
  function canStart(I, id, ctx) {
    const o = offer(I, id); if (!o.ok) return o.why;
    const resort = /^(hut|parasol|stall|pier|deck)$/.test(id);
    if (resort) {
      if (!(ctx && ctx.coast)) return '先买下海边';
      if (!(ctx && ctx.resort)) return '先把东南滩改建成度假村';
    } else {
      if (!(ctx && (ctx.site || ctx.plot))) return '先开镇门：农家乐区就在镇门口东大道两边，不用改建地块';
    }
    if ((ctx.lv | 0) < PROSPERITY) return '繁荣度到 3 才能建（先把集市和面包房盖好）';
    if (id !== 'parasol' && I.job) return I.job.id === id ? '正在盖' : '一次只盖一样，等家人先把这一样搭好';
    if ((ctx.coins | 0) < o.cost) return '金币不够';
    if ((ctx.wood | 0) < o.wood) return '木材不够';
    return null;
  }
  function start(I, id, day) {
    if (id === 'parasol') {
      if (parasolsUp(I) < MAX_PARASOLS) I.resort.parasols = parasolsUp(I) + 1;
      return I;
    }
    I.job = { id, day: day | 0 }; return I;
  }
  function finish(I, day) {
    if (!I.job) return null;
    if ((day | 0) <= (I.job.day | 0)) return null;
    const id = I.job.id; I.job = null;
    if (id === 'cabin' && I.cabins < MAX_CABINS) I.cabins = (I.cabins | 0) + 1;
    if (id === 'diner' && !dinerUp(I)) I.diner.lv = 1;
    if (id === 'kitchen' && dinerUp(I) && kitchenLv(I) < KITCHEN.max) I.diner.lv = (I.diner.lv | 0) + 1;
    if (id === 'inn2') I.inn2 = 1;
    if (!I.resort) I.resort = emptyResort();
    if (id === 'hut' && hutsUp(I) < MAX_HUTS) I.resort.huts = hutsUp(I) + 1;
    if (id === 'stall') I.resort.stall = 1;
    if (id === 'pier') I.resort.pier = 1;
    if (id === 'deck') I.resort.deck = 1;
    return id;
  }
  const plotBusy = (plotId, plots, I) => {
    if (!plotId || !plots || !plots[plotId]) return null;
    // v5.11.0.5: the lodging moved to the 农家乐区, so an old 民宿院 plot is an empty yard and never busy
    if (plots[plotId].mod === 'resort') {
      const r = I && I.resort;
      if ((r && (r.huts || r.parasols || r.stall || r.pier || r.deck)) || (I && I.job && RESORT_JOBS.test(I.job.id))) return '这块地上有度假村，不能改建';
    }
    return null;
  };

  // ---------- v5.11.0.5 migration: a save whose lodging stood on a zoned 民宿院 plot ----------
  // Everything (cabins, inn, restaurant + kitchen, a build in progress, guests and their rooms, stars, guestbook, takings) is
  // kept by count and index, so it simply stands in the 农家乐区 now. The old plot stays an empty yard that can be rezoned once
  // for free (plots[id].free = 1). Idempotent: run on every load; `moved` (the day) is set once so the notice shows once.
  // -> { plots: [ids freed now], notice: true when this load is the move }
  function migrate(I, plots, day) {
    const out = { plots: [], notice: false };
    if (!I || !plots) return out;
    for (const id of Object.keys(plots)) {
      const p = plots[id];
      if (!p || p.mod !== 'inn' || p.free) continue;
      p.free = 1; out.plots.push(id);
    }
    if (out.plots.length && !(I.moved | 0)) { I.moved = Math.max(1, day | 0); I.where = SITE; out.notice = true; }
    return out;
  }

  // ---------- guests ----------
  const hash = (day, k) => (Math.imul((day | 0) * 33 + (k | 0) + 19, 0x9E3779B1) >>> 0);
  const freeRooms = I => {
    const used = new Set((I.guests || []).filter(g => stayOf(g) === 'inn').map(g => g.room));
    const out = []; for (let i = 0; i < innRoomsOf(I); i++) if (!used.has(i)) out.push(i);
    return out;
  };
  const freeHuts = I => {
    const used = new Set((I.guests || []).filter(g => stayOf(g) === 'beach').map(g => g.room));
    const out = []; for (let i = 0; i < hutsUp(I); i++) if (!used.has(i)) out.push(i);
    return out;
  };
  const staying = (I, day) => (I.guests || []).filter(g => (g.from | 0) <= (day | 0) && (g.until | 0) > (day | 0));
  const leaving = (I, day) => (I.guests || []).filter(g => (g.until | 0) <= (day | 0));
  const stayingStay = (I, day, stay) => staying(I, day).filter(g => stayOf(g) === stay);
  const peopleStay = (I, day, stay) => stayingStay(I, day, stay).reduce((s, g) => s + (g.n | 0), 0);
  const peopleOf = (I, day) => staying(I, day).reduce((s, g) => s + (g.n | 0), 0);
  const cabinOf = (g, I) => stayOf(g) === 'inn' ? ((g.room | 0) % Math.max(1, cabinsUp(I))) : -1;
  const effectiveStars = (I, staffed, furnished) => clamp((I.stars && I.stars.avg || 3) + (staffed ? STAR_BOOST : 0) + (furnished ? FURNISH : 0), 1, 5);
  function planGroup(day, k, room, stay, salt) {
    const h = hash(day, k + (salt | 0));
    const n = GROUP.min + (h % (GROUP.max - GROUP.min + 1));
    const nights = STAY.min + ((h >>> 4) % (STAY.max - STAY.min + 1));
    const span = ARRIVE.to - ARRIVE.from;
    const at = ARRIVE.from + ((h >>> 8) % Math.max(1, span));
    const looks = stay === 'beach' ? BEACH_LOOKS : LOOKS;
    const look = looks[(h >>> 16) % looks.length];
    const prefix = stay === 'beach' ? 'b' : 'g';
    return { id: prefix + day + k, look, n, room, from: day | 0, until: (day | 0) + nights, at, stay };
  }
  function planArrivals(I, day, stars, fest) {
    const rooms = freeRooms(I); if (!rooms.length) return [];
    const want = groupsWanted(stars, day, fest);
    const out = [];
    for (let k = 0; k < want && k < rooms.length; k++) out.push(planGroup(day, k, rooms[k], 'inn', 0));
    return out;
  }
  function planBeachArrivals(I, day, stars, fest) {
    const rooms = freeHuts(I); if (!rooms.length) return [];
    const want = groupsWanted(stars, day, fest);
    const out = [];
    for (let k = 0; k < want && k < rooms.length; k++) out.push(planGroup(day, k, rooms[k], 'beach', 41));
    return out;
  }
  function checkIn(I, day, stars, fest) {
    const add = planArrivals(I, day, stars, fest).concat(planBeachArrivals(I, day, stars, fest));
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
    const ppl = peopleStay(I, day, 'inn');
    const extra = (walkins | 0) + (fest ? Math.max(4, ppl) : 0);
    return ppl * MEALS_EACH + extra;
  }
  function stallMealsWanted(I, day) {
    return peopleStay(I, day, 'beach') * MEALS_EACH;
  }
  const STALL_DISHES = DISHES.filter(d => d.stall);
  function stallMenu(counts, priceOf) {
    return STALL_DISHES.filter(d => canMake(d, counts)).sort((a, b) => dishPay(b, priceOf) - dishPay(a, priceOf) || a.id.localeCompare(b.id));
  }
  // seafood stall: 海鱼烤 / 海鲜汤 from the farm's sea fish; takings go into earn.meals
  function serveStall(I, want, counts, priceOf) {
    if (!stallUp(I)) return { gold: 0, n: 0, missed: want | 0, used: [] };
    let left = want | 0, gold = 0, n = 0; const used = [];
    while (left > 0) {
      const menu = stallMenu(counts, priceOf);
      if (!menu.length) break;
      const d = menu[0];
      const before = {}; for (const id of SEA_FISH) before[id] = counts[id] | 0;
      if (!pullDish(d, counts)) break;
      let base = 0;
      for (const id of SEA_FISH) {
        const took = (before[id] | 0) - (counts[id] | 0);
        if (took) base += took * unitOf(id, priceOf);
      }
      const pay = Math.round(base * MEAL_MARK);
      gold += pay; n++; left--; used.push(d.id);
    }
    I.diner.served = (I.diner.served | 0) + n;
    I.diner.missed = (I.diner.missed | 0) + left;
    I.earn.meals = (I.earn.meals | 0) + gold;
    return { gold, n, missed: left, used };
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
    if (townOpen) return P(596, 66); // v5.11.0: the town gate moved east (town.js GATE)
    if (plots && plots.eroad) return P(362, 66);
    return P(352, 66);
  }

  const api = {
    INN_PLOTS, RESORT_PLOT, PROSPERITY, MAX_CABINS, MAX_HUTS, MAX_PARASOLS, ROOM, FIRST, NEXT, DINER, KITCHEN,
    HUT, PARASOL, SEA_STALL, GUEST_PIER, DECK, INN2, MEAL_MARK, MEALS_EACH, SUNSET, COAST, SEA_FISH,
    STAY, GROUP, ARRIVE, LEAVE_MORNING, ON_SCREEN, STAR_BOOST, FURNISH, BOOK_MAX, STARS_MAX, LOOKS, BEACH_LOOKS,
    UNIT, DISHES, DISH, STALL_DISHES, unitOf, dishBase, dishPay, canMake, pullDish, isSeaFish, seaCount, pullSea,
    starCoef, roomFee, groupsWanted, effectiveStars,
    innPlotOf, resortPlotOf, plotOk, layout, SITE, AGRI, siteOf, anyInn, agriLayout, migrate, resortLayout, isSunset,
    empty, emptyDiner, emptyStars, emptyEarn, emptyResort, valid, validMenu, avgOf,
    cabinsUp, dinerUp, kitchenLv, seatsOf, dishSlots, unlocked, cabinCost, offer, canStart, start, finish, plotBusy,
    innRoomsOf, hutsUp, parasolsUp, stallUp, pierUp, deckUp, stayOf, cabinOf,
    hash, freeRooms, freeHuts, staying, stayingStay, leaving, peopleOf, peopleStay, planArrivals, planBeachArrivals, checkIn, checkOut,
    listed, autoMenu, todayMenu, setMenu, serve, serveStall, stallMenu, mealsWanted, stallMealsWanted, walkinsOf,
    NOTES, rateStay, book, isFest, entryOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFInn = api;
})(typeof window !== 'undefined' ? window : globalThis);
