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
  // v5.11.0: 节庆广场 (town.js SQUARE [706, 86, 820, 172]) is the feast's own square: a 78-unit long table of three
  // sections in the middle, 10 seats on each side, a ring of lantern posts round the square and strings along the main street
  const SQUARE = [706, 86, 820, 172];
  const TABLE = P(763, 130);
  const SECTIONS = [P(737, 130), P(763, 130), P(789, 130)]; // three 26-unit table sections (art in town-art.js)
  const SEATS = [];
  for (const y of [124, 136]) for (let i = 0; i < 10; i++) SEATS.push(P(730 + i * 7.4, y));
  // wooden posts that hold the lantern strings: along the main street, then round the square
  const STREET_POSTS = [610, 650, 690, 730, 770, 810, 850, 890, 930, 970].map(x => P(x, 61));
  const RING = [P(709, 89), P(744, 89), P(782, 89), P(817, 89), P(817, 129), P(817, 169), P(782, 169), P(744, 169), P(709, 169), P(709, 129)];
  const POSTS = STREET_POSTS.concat(RING);
  const STRINGS = [];
  for (let i = 0; i < STREET_POSTS.length - 1; i++) STRINGS.push([STREET_POSTS[i], STREET_POSTS[i + 1]]);
  for (let i = 0; i < RING.length; i++) STRINGS.push([RING[i], RING[(i + 1) % RING.length]]);
  STRINGS.push([RING[1], RING[7]], [RING[2], RING[6]], [STREET_POSTS[3], RING[1]], [STREET_POSTS[5], RING[2]]); // over the table, and from the street
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
    for (const t of SECTIONS) out.push({ x: t.x, y: t.y, z: 10, r: 28, s: 0.9 });
    out.push({ x: 650, y: 120, z: 8, r: 26, s: 0.8 }); // the fountain (town.js PLAZA)
    // the market stalls stay warm during the fair (market.js STALLS)
    for (const [x, y] of [[632, 100], [668, 100], [622, 122], [678, 122], [636, 142], [664, 142]]) out.push({ x, y, z: 10, r: 18, s: 0.75 });
    return out;
  }
  const blocks = () => [[TABLE.x - 39, TABLE.y - 3, TABLE.x + 39, TABLE.y + 3]];
  const api = { EVERY, GIFT, FEAST, FAIR, SQUARE, TABLE, SECTIONS, SEATS, POSTS, RING, STREET_POSTS, STRINGS, ready, readyDay, hasShops, isDay, nextDay,
    hasLantern, feastOpen, fairOpen, bedtime, seatAt, grant, lights, blocks, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFestival = api;
})(typeof window !== 'undefined' ? window : globalThis);
