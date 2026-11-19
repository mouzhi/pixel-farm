// 像素农场 · 第 10 阶段（v5.8.0）：上学、同学来农场、隔壁镇子（纯数据和纯函数；浏览器里是 window.PFTown，Node 里可以 require 做单元测试）
// The town is a real place east of the 东大道 plot (the map grows 24 tiles to the east for it, nothing old moves). Before it is
// bought the gate at the end of the road stays shut and children walk out through it to school; once it is bought (12,000
// gold + 60 wood, after the road is bought and a child has been to school) the gate opens: the school, a little shop that pays
// better for workshop goods, honey and fish, a few houses and neighbours who keep their own hours. Classmates now and then
// come home with a child in the afternoon; party guests walk over from the town. The art is town-art.js, the wiring game.js.
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  // ---------- the place ----------
  const RECT = [448, -16, 632, 150];                       // the town (inside the new east strip 448..640)
  const STRIP = [448, -208, 640, 384];                     // the strip the map grew by
  const GATE = P(440, 66);                                 // the gate at the end of 东大道 (the old one, now with a town behind it)
  // streets are routes: painted as dirt and walked like the farm lanes
  const STREETS = { t_main: [P(436, 66), P(626, 66)], t_north: [P(540, 66), P(540, 52)], t_south: [P(524, 66), P(524, 132)], t_school: [P(590, 66), P(590, 46)], t_shop: [P(492, 66), P(492, 52)], t_hall: [P(518, 66), P(518, 44)], t_bake: [P(483, 66), P(483, 82)], t_wood: [P(524, 132), P(568, 132), P(568, 123)], t_smith: [P(524, 132), P(606, 132), P(606, 127)] }; // t_hall: v5.10.0; t_bake: v5.10.4; t_wood / t_smith: v5.10.5
  // buildings: centre, half size (world units, 8 = one farm tile), door (where people stand), rot (0: door to the south)
  const BUILDINGS = [
    { id: 'shop', name: '镇上小店', kind: 'shop', x: 492, y: 36, hw: 13, hd: 8, door: P(492, 50), rot: 0 },
    { id: 'school', name: '学校', kind: 'school', x: 590, y: 28, hw: 17, hd: 10, door: P(590, 44), rot: 0 },
    { id: 'h1', name: '林老师家', kind: 'house', x: 540, y: 34, hw: 6, hd: 5, door: P(540, 44), rot: 0, roof: 1 },
    { id: 'h2', name: '周婶家', kind: 'house', x: 486, y: 106, hw: 6, hd: 5, door: P(486, 96), rot: Math.PI, roof: 0 },
    { id: 'h3', name: '阿松家', kind: 'house', x: 568, y: 108, hw: 6, hd: 5, door: P(568, 98), rot: Math.PI, roof: 2 },
    { id: 'h4', name: '小桃家', kind: 'house', x: 606, y: 112, hw: 6, hd: 5, door: P(606, 102), rot: Math.PI, roof: 0 },
    { id: 'h5', name: '镇长家', kind: 'house', x: 460, y: 20, hw: 6, hd: 5, door: P(460, 30), rot: 0, roof: 2 },
    { id: 'hall', name: '镇公所', kind: 'hall', x: 518, y: 28, hw: 10, hd: 8, door: P(518, 40), rot: 0 }, // v5.10.0: the notice board is by its door (hall.js)
  ];
  const BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
  const PLAZA = { x: 524, y: 98, r: 15 };                  // a cobbled square with a fountain where the south street meets
  const SCHOOLYARD = [572, 44, 608, 60];
  const SCHOOL_DOOR = BY_ID.school.door, SHOP_DOOR = BY_ID.shop.door;
  const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
  const inTown = (x, y, pad = 0) => inRect(x, y, RECT, pad);
  const inStrip = (x, y) => x >= STRIP[0];

  // ---------- buying it ----------
  const PRICE = { cost: 12000, wood: 60 };
  // ctx: { plots: S.plots, schoolDays: total school days of all children so far }
  function gate(ctx) {
    const p = ctx && ctx.plots && ctx.plots.eroad;
    if (!p || p.mod !== 'road') return '先把东大道买下来（选成「大道」）';
    if (!((ctx.schoolDays | 0) > 0)) return '等孩子上过一天学再开镇门';
    return null;
  }
  // nav: what people may not walk on in the strip. open: the town is bought
  function blocks(open) {
    if (!open) return [[GATE.x + 2, STRIP[1], STRIP[2], STRIP[3]]];
    const out = [[STRIP[0], STRIP[1], STRIP[2], RECT[1]], [STRIP[0], RECT[3], STRIP[2], STRIP[3]], [RECT[2], RECT[1], STRIP[2], RECT[3]],
      [STRIP[0] - 2, RECT[1], STRIP[0] + 2, GATE.y - 8], [STRIP[0] - 2, GATE.y + 8, STRIP[0] + 2, RECT[3]]];
    for (const b of BUILDINGS) out.push([b.x - b.hw, b.y - b.hd, b.x + b.hw, b.y + b.hd]);
    out.push([PLAZA.x - 4, PLAZA.y - 3, PLAZA.x + 4, PLAZA.y + 3]); // the fountain
    return out;
  }

  // ---------- school ----------
  // where the walk to school goes. ctx: { regions, plots, open (town bought) } -> { to, via, inTown }
  const FARM_VIA = [P(158, 54), P(176, 54), P(176, 66), P(216, 66)];
  function schoolRoute(ctx) {
    const regions = (ctx && ctx.regions) || [], plots = (ctx && ctx.plots) || {};
    if (!regions.includes('east')) return { to: P(224, 66), via: FARM_VIA.concat([P(224, 66)]), inTown: false };
    const road = plots.eroad && plots.eroad.mod === 'road';
    if (!road) return { to: P(356, 66), via: FARM_VIA.concat([P(280, 66), P(340, 66), P(356, 66)]), inTown: false };
    const along = FARM_VIA.concat([P(280, 66), P(352, 66), P(362, 66), P(400, 66), P(GATE.x - 2, 66)]);
    if (!(ctx && ctx.open)) return { to: P(GATE.x - 2, 66), via: along, inTown: false };
    return { to: SCHOOL_DOOR, via: along.concat([P(GATE.x + 10, 66), P(SCHOOL_DOOR.x, 66), SCHOOL_DOOR]), inTown: true };
  }
  // a day off now and then (never a punishment): a rainy day or a party evening at home
  const SKIP = { rain: 0.4, party: 0.3 };
  function skipSchool(ctx, r) { const p = (ctx && ctx.rain ? SKIP.rain : 0) || (ctx && ctx.party ? SKIP.party : 0); return p > 0 && r() < p; }

  // ---------- classmates ----------
  const MATES = [{ id: 'm0', name: '阿团', look: 'mateA' }, { id: 'm1', name: '朵朵', look: 'mateB' }, { id: 'm2', name: '石头', look: 'mateC' }];
  const MATE = { after: 6, gap: 3, p: 0.25, leave: 16 * 60 }; // leave at 16:00 so they are off the farm well before dusk
  // ctx: { day, schoolDays (this child), last (day of the last visit), rain, party } -> a classmate comes home with them today?
  function mateToday(ctx, r) {
    if ((ctx.schoolDays | 0) < MATE.after || ctx.rain || ctx.party) return false;
    if ((ctx.last | 0) > 0 && ctx.day - ctx.last < MATE.gap) return false;
    return r() < MATE.p;
  }
  const mateName = (i, open) => (open ? MATES[i % MATES.length].name : '同学');

  // ---------- neighbours (only once the town is open) ----------
  // each one: a home, and where they are by the clock; hidden indoors outside their hours
  const NEIGHBOURS = [
    // v5.9.1: 周婶 and 林老师 sit out on the square in the evening (not 阿松 or 小桃: on a party night they are the guests)
    { id: 'n0', name: '周婶', look: 'townC', home: 'h2', plan: [[7 * 60, 18 * 60, 'shop'], [18 * 60 + 30, 20 * 60 + 30, 'plaza']] },
    { id: 'n1', name: '林老师', look: 'townD', home: 'h1', plan: [[7 * 60 + 30, 14 * 60 + 30, 'schoolgate'], [15 * 60, 17 * 60 + 30, 'plaza'], [18 * 60, 20 * 60 + 30, 'bench']] },
    { id: 'n2', name: '木匠阿松', look: 'guestA', home: 'h3', plan: [[8 * 60, 11 * 60, 'plaza'], [11 * 60, 16 * 60, 'street'], [16 * 60, 17 * 60, 'shop']] }, // home by 17:00: the party guests are the same people
    { id: 'n3', name: '面包师小桃', look: 'guestB', home: 'h4', plan: [[9 * 60, 12 * 60, 'shop'], [13 * 60, 17 * 60, 'plaza']] },
  ];
  const SPOTS = { shop: P(SHOP_DOOR.x + 5, SHOP_DOOR.y + 3), schoolgate: P(SCHOOL_DOOR.x - 6, SCHOOL_DOOR.y + 4), plaza: P(PLAZA.x + 12, PLAZA.y + 10), street: P(560, 72), bench: P(PLAZA.x - 10, PLAZA.y + 18) }; // bench: by the square's bench (v5.9.1)
  // -> { at: {x, y}, out: true when they are out of the house }
  function neighbourAt(n, T) {
    const t = ((T % 1440) + 1440) % 1440, home = BY_ID[n.home].door;
    for (const [a, b, s] of n.plan) if (t >= a && t < b) return { at: SPOTS[s], out: true, spot: s };
    return { at: home, out: false, spot: 'home' };
  }

  // ---------- lights at night (v5.9.1): the street lamps, and windows while people are up ----------
  const LAMPS = [P(470, 72), P(516, 60), P(560, 72), P(612, 60), P(530, 120)];
  const LIT = { lamps: [17 * 60 + 30, 6 * 60 + 30], homes: [17 * 60 + 30, 22 * 60 + 30], shop: [17 * 60 + 30, 19 * 60] };
  // -> [{ x, y, z, r, s }] for game.js's lighting pass at time T (minutes)
  function lightsAt(T) {
    const t = ((T % 1440) + 1440) % 1440, out = [];
    if (t >= LIT.lamps[0] || t < LIT.lamps[1]) for (const l of LAMPS) out.push({ x: l.x, y: l.y, z: 14, r: 27, s: 0.9 });
    const homes = t >= LIT.homes[0] && t < LIT.homes[1], shop = t >= LIT.shop[0] && t < LIT.shop[1];
    for (const b of BUILDINGS) if ((b.kind === 'house' && homes) || (b.kind === 'shop' && shop)) out.push({ x: b.door.x, y: b.door.y + (b.rot ? 1 : -1), z: 6, r: b.kind === 'shop' ? 20 : 14, s: 0.55 });
    return out;
  }

  // ---------- the town shop ----------
  // workshop goods, honey and fish fetch a fifth more there; a grown-up takes them over when the basket holds a few
  // v5.9.1: eggs, wool, milk, truffles and orchard fruit too, and the trip goes once two are in the basket (was 3: it hardly ever went)
  const TRADE = { ids: ['flour', 'jam', 'cheese', 'honey', 'egg', 'wool', 'milk', 'truffle', 'apple', 'orange'], fish: true, bonus: 0.2, min: 2, from: 9 * 60, to: 16 * 60 };
  const tradeable = (type, isFish) => TRADE.ids.includes(type) || (TRADE.fish && !!isFish);
  const tradePrice = base => Math.round(base * (1 + TRADE.bonus));

  // ---------- state ----------
  // school: { kidId: days at school }, last: { kidId: day last at school }, skip: { kidId: day off }, mate: { last, day, kid, who }
  const empty = () => ({ school: {}, last: {}, skip: {}, mate: { last: 0, day: 0, kid: null, who: 0 }, trade: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  const KID_ID = /^kid\d$/;
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    for (const k of ['school', 'last', 'skip']) { const m = o[k] && typeof o[k] === 'object' ? o[k] : {}; for (const id of Object.keys(m)) if (KID_ID.test(id)) { const n = int(m[id], 0, 1e6); if (n) out[k][id] = n; } }
    const m = o.mate && typeof o.mate === 'object' ? o.mate : {};
    out.mate = { last: int(m.last, 0, 1e6), day: int(m.day, 0, 1e6), kid: typeof m.kid === 'string' && KID_ID.test(m.kid) ? m.kid : null, who: int(m.who, 0, MATES.length - 1) };
    out.trade = int(o.trade, 0, 1e9);
    return out;
  }
  const schoolDays = t => Object.values((t && t.school) || {}).reduce((a, b) => a + (b | 0), 0);

  // the streets join the farm's routes (ground paints them as dirt, the nav grid prefers them, no trees grow on them)
  if (root.PFWorld && root.PFWorld.ROUTES) for (const k in STREETS) if (!root.PFWorld.ROUTES[k]) root.PFWorld.ROUTES[k] = STREETS[k];
  const api = { RECT, STRIP, GATE, STREETS, BUILDINGS, BY_ID, PLAZA, SCHOOLYARD, SCHOOL_DOOR, SHOP_DOOR, inTown, inStrip, inRect, PRICE, gate, blocks,
    FARM_VIA, schoolRoute, SKIP, skipSchool, MATES, MATE, mateToday, mateName, NEIGHBOURS, SPOTS, neighbourAt, LAMPS, LIT, lightsAt, TRADE, tradeable, tradePrice, empty, valid, schoolDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFTown = api;
})(typeof window !== 'undefined' ? window : globalThis);
