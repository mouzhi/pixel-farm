// 像素农场 · v5.12.4：农场体验（果园采摘、摸动物圈、农场游览车、手作坊、留影角）
// 纯数据和纯函数（浏览器里是 window.PFFarmXp，Node 里可以 require 做单元测试）。
// Plan「农场体验项目」: five shop items. Tourists who already stay at the 民宿 / 度假村 or drive in on 东门大道 come by and pay
// per visit; nothing touches the farm's own crops or fruit, and nothing is built on the beach.
// Saved: only the five shop levels (upgrades xppick / xppet / xptour / xpcraft / xpphoto, append-only). Who comes, when, where they
// stand, the tour truck and the pen animals are pure functions of the day number, the clock and today's guests: never stored.
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
  const hash = (a, b, c) => { let n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 1442695) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const H = h => h * 60;

  // ---------- the five items (shop order). fee: gold per visitor; cap: visitors a day at most; share: of today's tourists ----------
  const ITEMS = [
    { id: 'xppick', name: '果园采摘', cost: 8000, wood: 40, fee: 40, cap: 8, share: 0.5, stay: 70, win: [H(10) + 30, H(15)],
      desc: '在果园坡门口摆上采摘篮和指示牌。游客挎着篮子到果树下摘几个果子带走，按人收费；摘的是游客那份，不动家里的收成' },
    { id: 'xppet', name: '摸动物圈', cost: 10000, wood: 60, fee: 30, cap: 8, share: 0.5, stay: 25, win: [H(9) + 30, H(16) + 30],
      desc: '在农家乐东边围一个小圈，养两只小鸡和一只小羊。游客进圈喂一喂、摸一摸，按人收费' },
    { id: 'xptour', name: '农场游览车', cost: 15000, wood: 120, fee: 60, cap: 8, share: 0.4, runs: [H(10) + 30, H(14) + 30], seats: 4,
      desc: '农家乐西边搭售票小棚，停一辆小货车。每天 10:30 和 14:30 各开一趟，载着游客沿家门口、林场边转一圈再回来，每趟最多 4 人' },
    { id: 'xpcraft', name: '手作坊', cost: 12000, wood: 80, fee: 60, cap: 6, share: 0.4, stay: 45, win: [H(10), H(15) + 30],
      desc: '菜馆西边支起凉棚和长桌。游客坐下来做果酱、南瓜饼，做好的带走，按人收费' },
    { id: 'xpphoto', name: '留影角', cost: 6000, wood: 30, fee: 20, cap: 10, share: 0.7, stay: 8, win: [H(9) + 30, H(17)],
      desc: '稻草人和花架搭成的拍照背景。游客站在花架下拍一张，按人收费；第一张合影也会进相册' },
  ];
  const IDS = ITEMS.map(i => i.id);
  const BY = Object.fromEntries(ITEMS.map(i => [i.id, i]));
  const MAX_DAY = ITEMS.reduce((a, i) => a + i.fee * i.cap, 0); // 1600: the plan's 500–2,000 a day when everything is built and busy

  // ---------- gates (game.js passes the facts) ----------
  // ctx: { inn: a 民宿 cabin is up, orchard: 果园坡 bought, coop / fold: 鸡舍 / 羊圈 built, avenue: 东门大道 bought,
  //        diner: 农家菜馆 open, any: another experience bought }
  function gate(id, ctx) {
    const c = ctx || {};
    if (!BY[id]) return null;
    if (!c.inn) return '先在农家乐区盖好民宿，有了住客才有人来玩';
    if (id === 'xppick' && !c.orchard) return '先买下「果园坡」';
    if (id === 'xppet' && !(c.coop || c.fold)) return '先盖鸡舍或羊圈';
    if (id === 'xptour' && !c.avenue) return '先买下「东门大道」';
    if (id === 'xpcraft' && !c.diner) return '先让农家菜馆开张';
    if (id === 'xpphoto' && !c.any) return '先建一个别的农场体验项目';
    return null;
  }

  // ---------- where things stand (fixed tidy slots in the 农家乐区's two empty corners and at the 果园坡 gate) ----------
  // 农家乐区 is [456, -40, 584, 200]: cabins along y 8, the road at y 66, the restaurant at (520, 104) with tables to its south,
  // the vegetable garden [470, 146, 512, 182], the guest square [532, 140, 574, 178]. The corners west of the restaurant
  // (456..500, 74..142) and east of the lane (556..584, 76..136) were empty grass.
  const ENTRY = P(520, 74);                 // just inside the 农家乐区 gate, south of the road
  const ROAD_Y = 66;
  const TOUR = { stand: P(487, 84), booth: P(465, 82), queue: [P(460, 93), P(465, 93), P(470, 93), P(475, 93)],
    stops: [P(100, 48), P(100, -28)], speed: 18, wait: 5 }; // stops: in front of the house by the well; 林场 gate
  const CRAFT = { x: 478, y: 108, hw: 16, hd: 8, seats: [P(466, 114), P(474, 114), P(482, 114), P(490, 114)] }; // table north, visitors stand at its south side
  const PHOTO = { arch: P(568, 79), crow: P(581, 81), pose: [P(565, 87), P(571, 87)], rect: [554, 74, 586, 91] };
  const PEN = { rect: [558, 96, 582, 130], gate: P(558, 114), spots: [P(565, 105), P(575, 107), P(566, 122), P(576, 123)] };
  const PICK = { gate: P(-40, 8), stand: P(-50, 2), sign: P(-32, 0), rect: [-150, -100, -40, 16],
    spots: [P(-62, -18), P(-84, -30), P(-104, -14), P(-76, -54)] };
  const STAND_RECT = [476, 77, 499, 91];
  const CRAFT_RECT = [CRAFT.x - CRAFT.hw - 3, CRAFT.y - CRAFT.hd - 1, CRAFT.x + CRAFT.hw + 3, CRAFT.y + CRAFT.hd + 2];
  const SPEED = 7;                          // a stroll, world units a game minute (the farm's WALK)
  const LOOKS = ['innA', 'innB', 'innC', 'innD', 'innE', 'innF', 'townF', 'townD', 'guestA', 'guestB'];

  // pick spots: under the 果园坡's own fruit trees when it has some (the visitor faces the tree), else the fixed spots
  function pickSpots(trees) {
    const t = (trees || []).filter(q => q && inRect(q.x, q.y, PICK.rect, -4)).sort((a, b) => Math.hypot(a.x - PICK.gate.x, a.y - PICK.gate.y) - Math.hypot(b.x - PICK.gate.x, b.y - PICK.gate.y));
    const out = t.slice(0, 4).map(q => ({ x: q.x + 6, y: q.y + 4, tree: true }));
    for (const s of PICK.spots) { if (out.length >= 4) break; if (!out.some(o => Math.hypot(o.x - s.x, o.y - s.y) < 10)) out.push({ x: s.x, y: s.y, tree: false }); }
    return out;
  }
  const spotsOf = (k, o) => k === 'xppick' ? pickSpots(o && o.trees) : k === 'xppet' ? PEN.spots : k === 'xpcraft' ? CRAFT.seats : k === 'xpphoto' ? PHOTO.pose : [];

  // ---------- today's tourists: guests who stayed last night and stay tonight (stable all day), plus 东门大道 visitors ----------
  // ctx: { stay: people staying through the day, parkAgri: parked visitors heading to 农家乐, parkOther: the rest }
  const pool = ctx => { const c = ctx || {}; return Math.max(0, (c.stay | 0) + (c.parkAgri | 0) + ((c.parkOther | 0) >> 1)); };
  // visitors per bought item today: min(cap, round(pool × share)), a little day-to-day wobble (±1)
  function counts(day, ctx, built) {
    const n = pool(ctx), out = {};
    for (const it of ITEMS) {
      if (!(built && built[it.id])) continue;
      let k = Math.round(n * it.share); if (k > 0) k += Math.round((hash(day | 0, IDS.indexOf(it.id), 31) - 0.5) * 2);
      out[it.id] = Math.max(0, Math.min(it.cap, k));
    }
    return out;
  }
  const earnOf = c => Object.keys(c || {}).reduce((a, k) => a + (BY[k] ? BY[k].fee * (c[k] | 0) : 0), 0);

  // the visits of the day (all but the tour): evenly spread over the item's window, slot = i % spots, so one slot never
  // holds two people. at: minute they reach the spot; stay: minutes there.
  function visits(day, cnt, o) {
    const out = [];
    for (const it of ITEMS) {
      if (it.id === 'xptour') continue;
      const n = (cnt && cnt[it.id]) | 0, sp = spotsOf(it.id, o); if (!n || !sp.length) continue;
      const span = it.win[1] - it.win[0], gap = n > 1 ? span / (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const j = n > 1 ? Math.round((hash(day | 0, i, 41 + IDS.indexOf(it.id)) - 0.5) * gap * 0.3) : 0;
        const slot = i % sp.length, at = Math.round(it.win[0] + gap * i + j);
        out.push({ id: it.id + ':' + i, k: it.id, i, slot, spot: sp[slot], at, stay: it.stay, end: at + it.stay,
          look: LOOKS[(hash(day | 0, i, 53 + IDS.indexOf(it.id)) * LOOKS.length) | 0] });
      }
    }
    return out;
  }
  // the tour: riders split over the two runs (at most 4 a run); they walk to the booth 12 minutes before the run
  function tours(day, n, dur) {
    const it = BY.xptour, r = Math.min(it.cap, n | 0), a = Math.min(it.seats, Math.ceil(r / 2)), b = Math.min(it.seats, r - a);
    return it.runs.map((t0, i) => ({ i, t0, t1: t0 + (dur || 0), riders: i ? b : a,
      looks: Array.from({ length: i ? b : a }, (_, q) => LOOKS[(hash(day | 0, i * 4 + q, 61) * LOOKS.length) | 0]) })).filter(x => x.riders > 0);
  }

  // ---------- paths ----------
  const lenOf = r => { let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y); return L; };
  function along(r, d) {
    if (!r || !r.length) return null; if (r.length === 1) return { x: r[0].x, y: r[0].y, fx: 0, fy: 1 };
    let w = Math.max(0, d);
    for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], s = Math.hypot(b.x - a.x, b.y - a.y);
      if (w <= s || i === r.length - 1) { const k = s ? Math.min(1, w / s) : 1; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, fx: s ? (b.x - a.x) / s : 0, fy: s ? (b.y - a.y) / s : 1 }; }
      w -= s; }
    return null;
  }
  // a visitor on a route entry -> spot: walks in, stays, walks back out. null when not out at T. route[0] is the entry.
  function stroll(route, at, stay, T, speed) {
    const L = lenOf(route), w = L / (speed || SPEED), t = T;
    if (t < at - w || t >= at + stay + w) return null;
    if (t < at) { const q = along(route, (t - (at - w)) * (speed || SPEED)); return Object.assign(q, { moving: true, state: 'go', phase: (t - at + w) * (speed || SPEED) * 0.6 }); }
    if (t < at + stay) { const e = route[route.length - 1]; return { x: e.x, y: e.y, fx: 0, fy: 1, moving: false, state: 'at', phase: 0 }; }
    const back = route.slice().reverse(), q = along(back, (t - at - stay) * (speed || SPEED));
    return Object.assign(q, { moving: true, state: 'back', phase: (t - at - stay) * (speed || SPEED) * 0.6 });
  }
  // the truck: legs [stand -> stop0, stop0 -> stop1, stop1 -> stand], a short wait at each stop. -> {x, y, rot} or null (parked)
  function truckDur(legs) { return legs.reduce((a, l) => a + lenOf(l) / TOUR.speed, 0) + TOUR.wait * Math.max(0, legs.length - 1); }
  function truckAt(legs, t0, T) {
    let t = T - t0; if (!legs || !legs.length || t < 0) return null;
    for (let i = 0; i < legs.length; i++) {
      const d = lenOf(legs[i]) / TOUR.speed;
      if (t < d) { const q = along(legs[i], t * TOUR.speed); return { x: q.x, y: q.y, rot: Math.atan2(q.fy, q.fx), leg: i, moving: true }; }
      t -= d;
      if (i < legs.length - 1) { if (t < TOUR.wait) { const e = legs[i][legs[i].length - 1], p = legs[i][Math.max(0, legs[i].length - 2)]; return { x: e.x, y: e.y, rot: Math.atan2(e.y - p.y, e.x - p.x), leg: i, moving: false }; } t -= TOUR.wait; }
    }
    return null;
  }

  // ---------- the pen's animals (two chicks and a lamb, or whatever the farm keeps): wander inside the fence by day ----------
  function penAnimals(day, T, kinds) {
    const r = PEN.rect, t = ((T % 1440) + 1440) % 1440, ks = (kinds && kinds.length ? kinds : ['chicken']), out = [];
    const list = ks.includes('sheep') && ks.includes('chicken') ? ['chicken', 'chicken', 'sheep'] : ks.includes('sheep') ? ['sheep', 'sheep'] : ['chicken', 'chicken', 'chicken'];
    const spot = (s, j) => P(r[0] + 4 + hash(day | 0, s, j) * (r[2] - r[0] - 8), r[1] + 4 + hash(day | 0, s + 7, j) * (r[3] - r[1] - 8));
    list.forEach((kind, s) => {
      const seg = kind === 'sheep' ? 18 : 9, i = Math.floor(t / seg), at = t - i * seg, a = spot(s + 1, i), b = spot(s + 1, i + 1), u = Math.min(1, at / 3);
      const night = t < H(6) + 30 || t >= H(19);
      out.push(night ? { id: 'pen' + s, kind, x: r[0] + 6 + s * 6, y: r[1] + 6, flip: false, moving: false, graze: false }
        : { id: 'pen' + s, kind, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, flip: b.x < a.x, moving: u < 1, graze: u >= 1 && (i & 1) === 0 });
    });
    return out;
  }

  // ---------- ground (game.js paints these when the item is bought) ----------
  function ground(x, y, built) {
    const b = built || {};
    if (b.xppet && inRect(x, y, PEN.rect)) return 'pen';
    if (b.xptour && inRect(x, y, STAND_RECT)) return 'stand';
    if (b.xpphoto && inRect(x, y, PHOTO.rect) && Math.hypot((x - PHOTO.arch.x) / 14, (y - PHOTO.arch.y - 4) / 8) < 1) return 'photo';
    if (b.xpcraft && inRect(x, y, CRAFT_RECT)) return 'craft';
    return null;
  }
  const RECTS = { xppet: PEN.rect, xptour: [STAND_RECT[0] - 14, STAND_RECT[1], STAND_RECT[2], STAND_RECT[3] + 4], xpphoto: PHOTO.rect, xpcraft: CRAFT_RECT, xppick: [PICK.stand.x - 8, PICK.stand.y - 8, PICK.sign.x + 6, PICK.sign.y + 8] };

  const api = { ITEMS, IDS, BY, MAX_DAY, gate, ENTRY, ROAD_Y, TOUR, CRAFT, PHOTO, PEN, PICK, STAND_RECT, RECTS, SPEED, LOOKS, pickSpots, spotsOf,
    pool, counts, earnOf, visits, tours, lenOf, along, stroll, truckDur, truckAt, penAnimals, ground, hash, inRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFarmXp = api;
})(typeof window !== 'undefined' ? window : globalThis);
