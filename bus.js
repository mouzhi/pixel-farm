// 像素农场 · v5.12.6：旅游大巴（东门停车场的两个大巴位终于有车了）
// 纯数据和纯函数（浏览器里是 window.PFBus，Node 里可以 require 做单元测试）。
// Once 东门大道 is bought and a 民宿 cabin is up, a tour bus comes every day: it drives in from the east end of the avenue,
// parks in a reserved bay, a group gets off and walks (in pairs) to the town square, the 镇公园, the 农家乐区 or the east beach,
// then walks back, boards and the bus leaves before 17:00. At 繁荣度 6「旅游小镇」 a second, fuller bus comes: the level's first
// gameplay effect. Who comes, when and where they stand is a pure function of the day, the clock and the flags: never stored.
// Saved (append-only, hall.bus): how many tourists the buses have brought in all, for the notice board. Nothing else.
'use strict';
(function (root) {
  const EA = root.PFEast || (typeof require === 'function' ? require('./east.js') : null);
  const P = (x, y) => ({ x, y });
  const hash = (a, b, c) => { let n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 1442695) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const H = h => h * 60;

  // ---------- the buses ----------
  const BAYS = EA ? EA.BUS_SLOTS : [P(1124, 178), P(1210, 178)];
  // bus A every day; bus B only at 繁荣度 6. arrive: base minute (±15 a day), stay: minutes parked, seats: tourists who get off
  const RUNS = [
    { id: 'A', bay: 0, at: H(10), stay: 300, seats: 6, seats6: 8, color: 0 },
    { id: 'B', bay: 1, at: H(11), stay: 320, seats: 0, seats6: 8, color: 1 }
  ];
  const MAX_DAY = RUNS.reduce((a, r) => a + r.seats6, 0); // 16 tourists a day at most
  const FEE = 100;              // 停车费 per bus, paid when it leaves (at most 200 a day)
  const DRIVE = 3;              // minutes from the map edge to the bay (and out again)
  const BACK = 0.3;             // of the time out: reversing out of the bay
  const SPEED = 7;              // tourists stroll at the farm's walk (world units a game minute)
  const STEP = 1.2;             // minutes between two people stepping off (about 8 units apart on the walk)
  const BOARD = 6;              // everybody is back this long before the bus leaves
  const LAST = H(17);           // no bus is still in the lot after 17:00
  const LAMP_ON = [H(17) + 30, H(22)];

  // ---------- the lot: lanes the bus keeps to (clear of the 8 car bays) ----------
  const AVE_Y = EA ? EA.AVENUE.y : 66, GATE = EA ? EA.PARK_GATE : P(1170, 66);
  const EDGE_X = EA ? EA.NEW_X1 + 12 : 1340;
  const NORTH_Y = 88;           // a strip between the lot's north kerb (80) and the first car row (96..112)
  const AISLE = [1089, 1240];   // west aisle (left of the car rows) / east aisle (right of them)
  const busPath = bay => { const s = BAYS[bay], ax = AISLE[bay];
    return [P(EDGE_X, AVE_Y), P(GATE.x, AVE_Y), P(GATE.x, NORTH_Y), P(ax, NORTH_Y), P(ax, s.y), P(s.x, s.y)]; };
  // out: reverse out of the bay to the aisle (nose still in the bay), then forward up the aisle, along the north strip and off east
  const busOut = bay => { const s = BAYS[bay], ax = AISLE[bay];
    return { back: [P(s.x, s.y), P(ax, s.y)], fwd: [P(ax, s.y), P(ax, NORTH_Y), P(GATE.x, NORTH_Y), P(GATE.x, AVE_Y), P(EDGE_X, AVE_Y)] }; };
  const BAY_ROT = [0, Math.PI]; // bay 0 is entered from the west (nose east), bay 1 from the east (nose west)

  // ---------- walking: fixed routes (like the park's), pairs share a destination ----------
  const DOOR = bay => P(BAYS[bay].x + (bay ? -10 : 10), BAYS[bay].y - 8);   // the front door, on the lot side
  const WALK_X = 1184, LANE2 = 159, SIDE_Y = 70;                         // the gap between car bays 1168 / 1200; the lane above the bus row; the avenue's south kerb
  const toGate = bay => { const d = DOOR(bay); return [d, P(d.x, LANE2), P(WALK_X, LANE2), P(WALK_X, NORTH_Y), P(GATE.x, NORTH_Y - 6), P(GATE.x, SIDE_Y)]; };
  const TOWN_E = 838;
  const DEST = {
    town: { name: '镇上节庆广场', via: [P(TOWN_E, SIDE_Y), P(TOWN_E, 128), P(812, 128)],
      spots: [P(744, 104), P(770, 98), P(796, 106), P(732, 132), P(760, 140), P(790, 150), P(806, 128), P(748, 160)] },
    park: { name: '镇公园', via: [P(TOWN_E, SIDE_Y), P(TOWN_E, -14), P(781, -14), P(781, -26), P(781, -36)],
      spots: [P(758, -44), P(804, -44), P(812, -70), P(756, -72), P(790, -80), P(770, -40)] },
    agri: { name: '农家乐区', via: [P(596, SIDE_Y), P(520, SIDE_Y), P(520, 76)], spots: [P(520, 76)], inside: 1 },
    beach: { name: '东段沙滩', from: 'south', via: [P(1170, 200), P(1170, 220), P(1170, 226)],
      spots: [P(1128, 238), P(1096, 242), P(1060, 238), P(1024, 242), P(988, 238), P(952, 242), P(916, 238), P(880, 242)] }
  };
  const lenOf = r => { let n = 0; for (let i = 1; i < r.length; i++) n += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y); return n; };
  function along(r, dist) { let w = Math.max(0, dist);
    for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (w <= d || i === r.length - 1) { const k = d ? Math.min(1, w / d) : 1; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, fx: d ? (b.x - a.x) / d : 0, fy: d ? (b.y - a.y) / d : 1, rot: Math.atan2(b.y - a.y, b.x - a.x) }; }
      w -= d; }
    const l = r[r.length - 1]; return { x: l.x, y: l.y, fx: 0, fy: 1, rot: 0 }; }
  // bay door -> a spot of `dest` (the beach goes out of the lot's south gate, everything else up to the avenue and west)
  function route(bay, dest, spot) {
    const D = DEST[dest], d = DOOR(bay); let r;
    if (D.from === 'south') r = [d, P(d.x, LANE2), P(WALK_X, LANE2), P(WALK_X, 192), P(1170, 192)].concat(D.via);
    else r = toGate(bay).concat(D.via);
    const last = r[r.length - 1];
    if (!D.inside) { if (D.from === 'south') r.push(P(spot.x, last.y)); r.push(P(spot.x, spot.y)); }
    return r;
  }

  // ---------- gate and plan ----------
  // ctx: { avenue: 东门大道 bought, inn: a 民宿 cabin is up, lv: 繁荣度 (6 = 旅游小镇) }
  function gate(ctx) {
    const c = ctx || {};
    if (!c.avenue) return '先买下「东门大道」，大巴才有地方停';
    if (!c.inn) return '先在农家乐区盖好民宿，旅行社才会把团带来';
    return null;
  }
  const LOOKS = ['innA', 'innB', 'innC', 'innD', 'innE', 'innF', 'guestA', 'guestB', 'beachA', 'beachC', 'townF', 'townE'];
  // ctx as gate() plus { park: 镇公园 built, beach: 度假沙滩 bought }. -> [{ id, bay, arrive, leave, color, people: [...] }]
  function dayPlan(day, ctx) {
    const c = ctx || {}, d = day | 0, out = [];
    if (gate(c)) return out;
    const six = (c.lv | 0) >= 6;
    const dests = ['town', 'agri'].concat(c.park ? ['park'] : [], c.beach ? ['beach'] : []);
    for (const R of RUNS) {
      const n = six ? R.seats6 : R.seats; if (!n) continue;
      const arrive = R.at + Math.round((hash(d, R.bay, 3) - 0.5) * 30), leave = Math.min(LAST - DRIVE, arrive + R.stay);
      const people = [];
      for (let i = 0; i < n; i++) {
        const pair = i >> 1;
        // the first pair of every bus goes to the 农家乐区 (that is what the agency sells); the rest pick by the day
        const dest = pair === 0 ? 'agri' : dests[(hash(d, R.bay * 8 + pair, 7) * dests.length) | 0];
        const sp = DEST[dest].spots, spot = sp[(pair * 2 + (i & 1) + R.bay * 3 + ((hash(d, pair, 9) * sp.length) | 0)) % sp.length];
        const r = route(R.bay, dest, spot), walk = lenOf(r) / SPEED;
        const off = arrive + 1 + i * STEP, back = leave - BOARD - walk - (n - 1 - i) * STEP * 0.5;
        people.push({ id: 'bus' + R.id + i, i, dest, spot, route: r, walk, off, there: off + walk, back, on: back + walk,
          look: LOOKS[(hash(d, R.bay * 16 + i, 11) * LOOKS.length) | 0] });
      }
      out.push({ id: 'bus' + R.id, run: R.id, bay: R.bay, arrive, leave, color: R.color, people, n });
    }
    return out;
  }
  const count = plan => (plan || []).reduce((a, b) => a + b.n, 0);
  // for the 农家乐 experiences' pool (farmxp.js): the same split the parked cars use
  function poolOf(plan) { let agri = 0, other = 0; for (const b of plan || []) for (const q of b.people) { if (q.dest === 'agri') agri++; else other++; } return { agri, other }; }

  // ---------- where everything is at minute T ----------
  // opts: { rain }. -> { buses: [{ id, x, y, rot, state: 'arrive'|'parked'|'leave', color, bay }], people: [{ id, look, x, y, fx, fy, moving, phase, dest, state }] }
  function at(plan, T, opts) {
    const t = ((T % 1440) + 1440) % 1440, rain = !!(opts && opts.rain), buses = [], people = [];
    for (const b of plan || []) {
      const s = BAYS[b.bay];
      if (t >= b.arrive - DRIVE && t < b.arrive) { const p = busPath(b.bay), L = lenOf(p), u = (t - (b.arrive - DRIVE)) / DRIVE, q = along(p, L * u);
        buses.push({ id: b.id, bay: b.bay, x: q.x, y: q.y, rot: q.rot, state: 'arrive', color: b.color }); }
      else if (t >= b.arrive && t < b.leave) buses.push({ id: b.id, bay: b.bay, x: s.x, y: s.y, rot: BAY_ROT[b.bay], state: 'parked', color: b.color });
      else if (t >= b.leave && t < b.leave + DRIVE) {
        const o = busOut(b.bay), lb = lenOf(o.back), lf = lenOf(o.fwd), u = (t - b.leave) / DRIVE;
        // reversing is slow: the first BACK of the time backs out of the bay (nose kept), the rest drives off
        const q = u < BACK ? along(o.back, lb * u / BACK) : along(o.fwd, lf * (u - BACK) / (1 - BACK));
        buses.push({ id: b.id, bay: b.bay, x: q.x, y: q.y, rot: u < BACK ? BAY_ROT[b.bay] : q.rot, state: 'leave', color: b.color }); }
      if (t < b.arrive || t >= b.leave) continue;
      for (const q of b.people) {
        let p = null, state = '';
        if (t >= q.off && t < q.there) { p = along(q.route, (t - q.off) * SPEED); state = 'go'; p.moving = true; p.phase = (t - q.off) * SPEED; }
        else if (t >= q.there && t < q.back) {
          if (DEST[q.dest].inside || rain) continue; // in the 农家乐区 they are the experiences' visitors; in the rain they wait it out under a roof
          // hop to another spot of the same place every 30 minutes (a 3-minute stroll), the pair side by side
          const sp = DEST[q.dest].spots, k = Math.floor((t - q.there) / 30), w = (t - q.there) - k * 30, j0 = sp.indexOf(q.spot);
          const pick = m => m <= 0 ? q.spot : sp[(j0 + m * 3 + (q.i >> 1)) % sp.length], a = pick(k - 1), c = pick(k);
          const u = k ? Math.min(1, w / 3) : 1, dx = c.x - a.x, dy = c.y - a.y, dd = Math.hypot(dx, dy) || 1, mv = u < 1 && dd > 1;
          p = { x: a.x + dx * u + ((q.i & 1) ? 2.2 : -2.2), y: a.y + dy * u + 1, fx: mv ? dx / dd : 0, fy: mv ? dy / dd : 1, moving: mv, phase: dd * u }; state = 'there';
        } else if (t >= q.back && t < q.on) { const r = q.route.slice().reverse(); p = along(r, (t - q.back) * SPEED); state = 'back'; p.moving = true; p.phase = (t - q.back) * SPEED; }
        else if (t >= q.on && t < b.leave - 0.5 && t < q.on + 1.5) { const d = DOOR(b.bay); p = { x: d.x + ((q.i % 3) - 1) * 2, y: d.y - 2, fx: 0, fy: 1, moving: false, phase: 0 }; state = 'queue'; }
        else if (t >= b.arrive && t < q.off) continue; // still on board
        if (!p) continue;
        if (state === 'go' || state === 'back') { const o = (q.i & 1) ? 1.3 : -1.3; p.x += -p.fy * o; p.y += p.fx * o; } // a pair walks side by side
        people.push({ id: q.id, look: q.look, x: p.x, y: p.y, fx: p.fx, fy: p.fy, moving: !!p.moving, phase: p.phase || 0, dest: q.dest, state });
      }
    }
    return { buses, people };
  }
  // the lot's bus-stop lamps (one per bay), 17:30–22:00
  const lightsAt = (T, on) => { if (!on) return []; const t = ((T % 1440) + 1440) % 1440; if (t < LAMP_ON[0] || t >= LAMP_ON[1]) return [];
    return BAYS.map(s => ({ x: s.x + 20, y: s.y - 8, r: 14, z: 14, a: 0.6 })); };
  const LAMPS = BAYS.map(s => P(s.x + 20, s.y - 10));

  // ---------- save: hall.bus = tourists brought in all (append-only, absent = 0) ----------
  const validCount = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(1e7, Math.floor(v)) : 0);

  const api = { BAYS, RUNS, MAX_DAY, FEE, DRIVE, SPEED, BOARD, LAST, LAMP_ON, LAMPS, DEST, DOOR, WALK_X, NORTH_Y, AISLE, BAY_ROT, LOOKS,
    busPath, busOut, route, lenOf, along, gate, dayPlan, count, poolOf, at, lightsAt, validCount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PFBus = api;
})(typeof window !== 'undefined' ? window : globalThis);
