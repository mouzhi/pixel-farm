// v5.10.11 丰收节 + 灯会: 繁荣度 5 以后每 28 天一次丰收节。镇上摆长桌，家里所有人去吃宴；
// 当天收入按集市日结算（丰收节也是集市日，因为 28 能被 7 整除）。晚上办灯会（要木工坊和铁匠铺都已建好）：
// 石板路和广场上挂灯笼，摊子亮着，全镇暖光。不用新家务，也没有关注 / 分享 / 打赏一类的条件。
// 灯会 22:00 结束，之后才回家睡觉（夜里 6 倍速照常，从这一刻开始）。离线的日子不算节日。
// Rules only (art in town-art.js, the walk and the lights in game.js, the board in ui.js).
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const EVERY = 28, GIFT = 400;
  const FEAST = { from: 18 * 60, to: 22 * 60 };
  const FAIR = { from: 19 * 60, to: 22 * 60 };
  // east of the fountain, south of the main street, clear of the market stalls and L11
  const TABLE = P(520, 112);
  const SEATS = [
    P(508, 117), P(516, 117), P(524, 117), P(532, 117),
    P(508, 107), P(516, 107), P(524, 107), P(532, 107),
  ];
  // wooden posts that hold the lantern strings over the paved main street and the plaza
  const POSTS = [
    P(452, 66), P(484, 66), P(516, 66), P(548, 66), P(580, 66), P(612, 66),
    P(510, 88), P(538, 88), P(508, 106), P(532, 106),
  ];
  const STRINGS = [
    [POSTS[0], POSTS[1]], [POSTS[1], POSTS[2]], [POSTS[2], POSTS[3]], [POSTS[3], POSTS[4]], [POSTS[4], POSTS[5]],
    [POSTS[2], POSTS[6]], [POSTS[6], POSTS[7]], [POSTS[7], POSTS[3]],
    [POSTS[6], POSTS[8]], [POSTS[8], POSTS[9]], [POSTS[7], POSTS[9]],
  ];
  const ready = H => {
    const CL = root.PFClinic || (typeof require === 'function' && typeof document === 'undefined' ? require('./clinic.js') : null);
    return !!(CL && CL.paved(H));
  };
  const readyDay = H => {
    if (!ready(H) || !H.built) return null;
    let d = 0; for (const k of Object.keys(H.built)) d = Math.max(d, H.built[k] | 0); return d || null;
  };
  const hasShops = H => !!(H && H.built && H.built.woodshop && H.built.smithy);
  const isDay = (H, day) => {
    const from = readyDay(H); if (!from) return false;
    return (day | 0) > from && (day | 0) % EVERY === 0;
  };
  const nextDay = (H, day) => {
    if (!ready(H)) return null;
    const from = readyDay(H) || 0;
    let d = Math.max(day | 0, from + 1);
    while (d % EVERY || d <= from) d++;
    return d;
  };
  const hasLantern = (H, day) => isDay(H, day) && hasShops(H);
  const feastOpen = (H, day, T) => isDay(H, day) && T >= FEAST.from && T < FEAST.to;
  const fairOpen = (H, day, T) => hasLantern(H, day) && T >= FAIR.from && T < FAIR.to;
  const bedtime = (H, day) => (hasLantern(H, day) ? FAIR.to : null);
  const seatAt = i => SEATS[((i % SEATS.length) + SEATS.length) % SEATS.length];
  const empty = () => ({ last: 0, gift: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.last = int(o.last, 0, 1e6); out.gift = int(o.gift, 0, 1e6); return out;
  }
  // a modest automatic red packet, once per festival, never tied to follow / share / tip
  function grant(st, day) {
    if (!st) return 0;
    if (!st.festival) st.festival = empty();
    if ((st.festival.gift | 0) === (day | 0)) return 0;
    st.festival.gift = day | 0; st.festival.last = day | 0;
    return GIFT;
  }
  function lights() {
    const out = [];
    for (const p of POSTS) out.push({ x: p.x, y: p.y, z: 14, r: 26, s: 0.95 });
    out.push({ x: TABLE.x, y: TABLE.y, z: 10, r: 28, s: 0.9 });
    out.push({ x: 524, y: 98, z: 8, r: 24, s: 0.8 }); // the fountain
    // the market stalls stay warm during the fair
    out.push({ x: 500, y: 86, z: 10, r: 18, s: 0.75 }, { x: 498, y: 106, z: 10, r: 18, s: 0.75 },
      { x: 500, y: 124, z: 10, r: 18, s: 0.75 }, { x: 549, y: 108, z: 10, r: 18, s: 0.75 },
      { x: 514, y: 130, z: 10, r: 18, s: 0.75 }, { x: 576, y: 96, z: 10, r: 18, s: 0.75 });
    return out;
  }
  const blocks = () => [[TABLE.x - 10, TABLE.y - 5, TABLE.x + 10, TABLE.y + 5]];
  const api = { EVERY, GIFT, FEAST, FAIR, TABLE, SEATS, POSTS, STRINGS, ready, readyDay, hasShops, isDay, nextDay,
    hasLantern, feastOpen, fairOpen, bedtime, seatAt, grant, lights, blocks, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFestival = api;
})(typeof window !== 'undefined' ? window : globalThis);
