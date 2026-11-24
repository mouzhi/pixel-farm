// 像素农场 · v5.12.2：东门大道、停车场与单独购买的「度假沙滩」
// 纯数据和纯函数（浏览器里是 window.PFEast，Node 里可以 require 做单元测试）。
// 车辆和游客本身不写进存档；只通过商店升级 eastave / vacbeach（effects 里的开关）记住买下了没有。
// 观光大巴、沙滩加容和排球网留到 v5.12.6。
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
  const segDist = (x, y, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (l2 < 1e-6) return Math.hypot(x - a.x, y - a.y);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
  };

  // the map grew east once in this version (ground canvas is always the new size). Until 东门大道 is bought,
  // x > OLD_X1 stays wilderness under fog and is not walkable.
  const OLD_X1 = 1008, NEW_X1 = 1328;
  const WORLD = { x0: -256, y0: -208, x1: NEW_X1, y1: 384 };

  const AVENUE = { y: 66, hw: 5, x0: 984, x1: 1240, walk: 1.3 };
  const PARK = { x0: 1080, y0: 80, x1: 1260, y1: 200 };
  const PARK_GATE = P(1170, 66);          // turn off the avenue into the lot
  const PARK_SOUTH = P(1170, 200);        // south gate down to the east beach
  const PRICE_AVE = { cost: 25000, wood: 150 };
  const PRICE_BEACH = { cost: 20000, wood: 100 };

  // 度假沙滩: from just east of the old fishing pier (x≈360) along the water. Town south wall is y 212,
  // the shoreline is about y 250; the sand band is that strip, about 40–50 units deep. Without the avenue
  // the beach stops at the old map edge; with it, it runs to 1288 and meets the parking south gate.
  const BEACH = { x0: 360, mid: 560, east: 800, x1Open: 1008, x1Full: 1288, y0: 212, y1: 268, sand: 46 };
  const beachX1 = avenue => avenue ? BEACH.x1Full : BEACH.x1Open;
  const beachRect = avenue => [BEACH.x0, BEACH.y0, beachX1(avenue), BEACH.y1];

  const onAvenue = (x, y) => x >= AVENUE.x0 && x <= AVENUE.x1 && Math.abs(y - AVENUE.y) <= AVENUE.hw + 0.6;
  const inPark = (x, y, pad = 0) => inRect(x, y, [PARK.x0, PARK.y0, PARK.x1, PARK.y1], pad);
  const inBeach = (x, y, avenue) => inRect(x, y, beachRect(avenue));

  // widened sand: between the town / parking south edge and the waterline, only inside the bought beach's x range.
  // Does not run west of x 360 (the old fishing beach keeps its narrow strip) and does not eat into the town or the lot.
  function sandAt(x, y, opts) {
    const o = opts || {}, WD = o.world || (typeof root !== 'undefined' && root.PFWorld);
    if (!o.beach) return false;
    if (x < BEACH.x0 || x > beachX1(!!o.avenue)) return false;
    if (y < BEACH.y0) return false;
    if (o.avenue && inPark(x, y)) return false;
    const shore = WD && WD.seaShore ? WD.seaShore(x) : 250;
    if (y > shore + 2) return false; // still water
    return y >= shore - BEACH.sand;
  }

  const gateAve = ctx => {
    const c = ctx || {};
    if (!c.town) return '先打开镇门，再买东门大道';
    if ((c.lv | 0) < 5) return `繁荣度到 5 才能修东门大道（现在 ${c.lv | 0}）`;
    return null;
  };
  const gateBeach = ctx => {
    const c = ctx || {};
    if (!c.town) return '先打开镇门，再买度假沙滩';
    if (!c.coast) return '先在商店买下「海边」，再买度假沙滩';
    return null;
  };

  // parking: 8 regular bays (cars park here) and 2 reserved bus bays (painted, empty until v5.12.6)
  const CAR_SLOTS = [
    P(1104, 104), P(1136, 104), P(1168, 104), P(1200, 104),
    P(1104, 142), P(1136, 142), P(1168, 142), P(1200, 142)
  ];
  const BUS_SLOTS = [P(1124, 178), P(1210, 178)];
  const LANE_Y = 122; // east-west lane between the two car rows
  const ENTRY = [P(1170, 66), P(1170, 90), P(1170, LANE_Y)];

  // beach furniture (fixed slots). 8 umbrellas + 8 chairs, 1 tower, 2 sunset decks, a boardwalk. No volleyball net yet.
  const UMBRELLAS = [
    P(400, 236), P(448, 232), P(496, 238), P(544, 234),
    P(616, 236), P(664, 232), P(720, 238), P(768, 234)
  ];
  const CHAIRS = [
    P(412, 240), P(460, 236), P(508, 242), P(556, 238),
    P(628, 240), P(676, 236), P(732, 242), P(780, 238)
  ];
  const TOWER = P(680, 228);
  const SUNSETS = [
    { x: 500, y: 256, hw: 8, hd: 5, sit: [P(494, 256), P(500, 256), P(506, 256)] },
    { x: 740, y: 258, hw: 8, hd: 5, sit: [P(734, 258), P(740, 258), P(746, 258)] }
  ];
  const BOARDWALK_Y = 226;
  const boardwalk = avenue => ({ y: BOARDWALK_Y, x0: 372, x1: beachX1(avenue) - 8, hw: 3 });
  // short spurs from the boardwalk down toward the water (fixed, always inside the no-avenue stretch)
  const BOARD_SPURS = [P(420, 226), P(540, 226), P(660, 226), P(780, 226)];

  // joins: 东南滩 south fence down to the new sand; parking south gate down to the east sand (only if both are bought)
  const ESHORE_JOIN = { lot: P(400, 200), beach: P(400, 220), path: [P(400, 200), P(400, 220)] };
  const PARK_JOIN = { lot: P(1170, 200), beach: P(1170, 220), path: [P(1170, 200), P(1170, 220)] };

  const hideTree = (x, y, opts) => !!(opts && opts.beach && sandAt(x, y, opts));

  // overlap helper used by tests: no new lot may sit on an existing plot / the town / 农家乐 / 宅园
  const boxHit = (a, b, pad = 0) => a[0] < b[2] - pad && a[2] > b[0] + pad && a[1] < b[3] - pad && a[3] > b[1] + pad;

  // ----- cars and visitors: a pure function of day + clock + flags. Nothing is stored. -----
  const hash = (a, b, c) => { let n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 1442695) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const DRIVE = 50;           // seconds of game-time? we work in minutes: ~1.2 min to drive the avenue
  const DRIVE_MIN = 1.4;      // minutes to drive 984→1240 or into a stall
  const DAY_FROM = 8 * 60, DAY_TO = 19 * 60;
  const CAR_COLORS = 4;
  const LOOKS = ['townF', 'townD', 'townE', 'townG', 'mateA', 'mateB', 'guestA', 'guestB']; // must be FAM_LOOK / FAM_PRE keys
  const BEACH_LOOKS = ['beachA', 'beachB', 'beachC', 'beachD', 'beachE', 'beachF'];

  function dayPlan(day, opts) {
    const d = day | 0, beach = !!(opts && opts.beach), avenue = !!(opts && opts.avenue);
    if (!avenue) return { n: 0, cars: [], through: 0 };
    const n = 3 + (hash(d, 1) * 4) | 0; // 3–6 parking arrivals
    const cars = [];
    const used = new Set();
    for (let i = 0; i < n; i++) {
      let slot = (hash(d, i, 3) * CAR_SLOTS.length) | 0;
      for (let k = 0; k < CAR_SLOTS.length && used.has(slot); k++) slot = (slot + 1) % CAR_SLOTS.length;
      used.add(slot);
      const arrive = DAY_FROM + 20 + ((hash(d, i, 5) * (DAY_TO - DAY_FROM - 140)) | 0);
      const stay = 35 + ((hash(d, i, 7) * 70) | 0);
      const people = 1 + ((hash(d, i, 9) * 2) | 0);
      const dest = beach && hash(d, i, 11) < 0.55 ? 'beach' : (hash(d, i, 13) < 0.25 ? 'agri' : 'town');
      cars.push({ i, slot, arrive, leave: arrive + stay, people, dest, color: (hash(d, i, 15) * CAR_COLORS) | 0 });
    }
    cars.sort((a, b) => a.arrive - b.arrive);
    return { n, cars, through: 2 };
  }

  const aveX = u => AVENUE.x0 + (AVENUE.x1 - AVENUE.x0) * u;
  // approach from the east end to a stall (avenue x1 -> park gate -> stall)
  function pathToSlot(slot) {
    const s = CAR_SLOTS[slot] || CAR_SLOTS[0];
    return [P(AVENUE.x1, AVENUE.y), P(PARK_GATE.x, AVENUE.y), P(PARK_GATE.x, LANE_Y), P(s.x, LANE_Y), P(s.x, s.y)];
  }
  function pathFromSlot(slot) {
    return pathToSlot(slot).slice().reverse().concat([P(AVENUE.x1 + 20, AVENUE.y)]);
  }
  function along(path, t) { // t 0..1
    const u = Math.max(0, Math.min(1, t));
    let len = 0; const seg = [];
    for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); seg.push(d); len += d; }
    let w = u * Math.max(1, len);
    for (let i = 1; i < path.length; i++) {
      const d = seg[i - 1];
      if (w <= d || i === path.length - 1) {
        const k = d ? w / d : 1, a = path[i - 1], b = path[i];
        const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
        return { x, y, rot: Math.atan2(b.y - a.y, b.x - a.x) };
      }
      w -= d;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y, rot: 0 };
  }

  function trafficAt(day, T, opts) {
    const plan = dayPlan(day, opts), t = ((T % 1440) + 1440) % 1440;
    const moving = [], parked = [], visitors = [];
    if (!(opts && opts.avenue)) return { moving, parked, visitors, plan };
    // through cars: two shuttles on the avenue during the day, opposite phases, never enter the lot or the beach
    if (t >= DAY_FROM && t < DAY_TO) {
      const span = DAY_TO - DAY_FROM, u0 = ((t - DAY_FROM) / span) * 4, u1 = u0 + 1.15;
      const ping = u => { const c = u % 2; return c < 1 ? c : 2 - c; }; // 0..1..0
      const p0 = { x: aveX(ping(u0)), y: AVENUE.y, rot: (u0 % 2) < 1 ? 0 : Math.PI, color: 0, kind: 'through', id: 'th0' };
      const p1 = { x: aveX(ping(u1)), y: AVENUE.y, rot: (u1 % 2) < 1 ? 0 : Math.PI, color: 2, kind: 'through', id: 'th1' };
      moving.push(p0, p1);
    }
    // parking arrivals / departures share the 2-moving cap: if both through cars are out, a parking car
    // is shown only when a through slot is free… we drop through cars while a parking car is on the road.
    const road = [];
    for (const c of plan.cars) {
      const s = CAR_SLOTS[c.slot];
      if (t >= c.arrive && t < c.leave) {
        parked.push({ slot: c.slot, x: s.x, y: s.y, rot: Math.PI / 2, color: c.color, id: 'pk' + c.i, dest: c.dest, people: c.people });
        // visitors walk after a short alighting, stay most of the parked window, walk back 8 min before leave
        const walk = 4, back = 8;
        if (t >= c.arrive + walk && t < c.leave - 0.5) {
          for (let p = 0; p < c.people; p++) {
            const dest = visitorDest(c.dest, c.i, p, opts);
            const going = t < c.leave - back;
            const span = going ? Math.max(0.5, (c.leave - back) - (c.arrive + walk)) : back;
            const u = going ? Math.min(1, (t - (c.arrive + walk)) / Math.min(6, span)) : Math.min(1, (t - (c.leave - back)) / back);
            const from = P(s.x, s.y + 6), to = dest;
            const a = going ? from : to, b = going ? to : from;
            const settled = going && u >= 1;
            visitors.push({
              id: 'ev' + c.i + '_' + p, look: (c.dest === 'beach' ? BEACH_LOOKS : LOOKS)[(c.i + p) % (c.dest === 'beach' ? BEACH_LOOKS : LOOKS).length],
              x: settled ? b.x + (p * 3 - 1.5) : a.x + (b.x - a.x) * u,
              y: settled ? b.y + (p * 2) : a.y + (b.y - a.y) * u,
              fx: b.x >= a.x ? 1 : -1, fy: 0, dest: c.dest, slot: c.slot
            });
          }
        }
      } else if (t >= c.arrive - DRIVE_MIN && t < c.arrive) {
        const u = (t - (c.arrive - DRIVE_MIN)) / DRIVE_MIN;
        const pos = along(pathToSlot(c.slot), u);
        road.push(Object.assign({ color: c.color, kind: 'arrive', id: 'ar' + c.i }, pos));
      } else if (t >= c.leave && t < c.leave + DRIVE_MIN) {
        const u = (t - c.leave) / DRIVE_MIN;
        const pos = along(pathFromSlot(c.slot), u);
        road.push(Object.assign({ color: c.color, kind: 'leave', id: 'lv' + c.i }, pos));
      }
    }
    // cap moving cars at 2: parking cars on the road take priority, then through traffic
    const shown = road.slice(0, 2);
    const room = 2 - shown.length;
    if (room > 0) shown.push(...moving.slice(0, room));
    // beach same-screen cap 8 (no buses yet, so this is the hard cap)
    const beachFolk = visitors.filter(v => v.dest === 'beach');
    if (beachFolk.length > 8) {
      const drop = new Set(beachFolk.slice(8).map(v => v.id));
      for (let i = visitors.length - 1; i >= 0; i--) if (drop.has(visitors[i].id)) visitors.splice(i, 1);
    }
    return { moving: shown, parked, visitors, plan };
  }

  function visitorDest(kind, i, p, opts) {
    if (kind === 'beach' && opts && opts.beach) {
      const u = UMBRELLAS[(i + p) % UMBRELLAS.length];
      return P(u.x + 4, u.y + 6);
    }
    if (kind === 'agri') return P(520, 80);
    return P(792, 80); // town plaza-ish, just inside the east end
  }

  // night lights: only the two sunset decks and the lifeguard tower, never the whole shore
  function lightsAt(T, opts) {
    if (!(opts && opts.beach)) return [];
    const t = ((T % 1440) + 1440) % 1440;
    if (t < 18 * 60 && t >= 6 * 60) return [];
    const out = [{ x: TOWER.x, y: TOWER.y - 2, r: 16, z: 22, a: 0.7 }];
    for (const s of SUNSETS) out.push({ x: s.x, y: s.y, r: 14, z: 10, a: 0.55 });
    return out;
  }

  // nav: when the avenue is bought, paint the stone road and the parking lanes walkable;
  // when the beach is bought, paint the sand / boardwalk / join paths. Trees in the sand are not blocked.
  function navPaint(g, H, opts) {
    const o = opts || {};
    if (o.eastave) {
      H.paintBox(g, AVENUE.x0, AVENUE.y - AVENUE.hw, AVENUE.x1, AVENUE.y + AVENUE.hw, H.DIRT);
      H.paintBox(g, PARK.x0 + 6, PARK.y0 + 6, PARK.x1 - 6, PARK.y1 - 6, H.DIRT);
      H.paintSeg(g, ENTRY[0].x, ENTRY[0].y, ENTRY[2].x, ENTRY[2].y, 5, H.DIRT);
      if (o.vacbeach) {
        const j = PARK_JOIN;
        H.paintSeg(g, j.lot.x, j.lot.y, j.beach.x, j.beach.y, 4, H.DIRT);
        H.carveDisc(g, j.beach.x, j.beach.y, 5, H.DIRT);
      }
    }
    if (o.vacbeach) {
      const x1 = beachX1(!!o.eastave), bw = boardwalk(!!o.eastave);
      H.paintBox(g, BEACH.x0, BEACH.y0 + 2, x1, BEACH.y0 + 48, H.DIRT);
      H.paintBox(g, bw.x0, bw.y - bw.hw, bw.x1, bw.y + bw.hw, H.DIRT);
      const j = ESHORE_JOIN;
      H.paintSeg(g, j.lot.x, j.lot.y, j.beach.x, j.beach.y, 4, H.DIRT);
      H.carveDisc(g, j.beach.x, j.beach.y, 5, H.DIRT);
      for (const s of SUNSETS) H.paintBox(g, s.x - s.hw, s.y - s.hd, s.x + s.hw, s.y + s.hd, H.DIRT);
    }
  }
  function navCarve(g, H, opts) {
    const o = opts || {};
    if (o.eastave) {
      H.carveDisc(g, PARK_GATE.x, PARK_GATE.y, 6, H.DIRT);
      for (const s of CAR_SLOTS) H.carveDisc(g, s.x, s.y, 4, H.DIRT);
    }
    if (o.vacbeach) {
      H.carveDisc(g, ESHORE_JOIN.beach.x, ESHORE_JOIN.beach.y, 5, H.DIRT);
      if (o.eastave) H.carveDisc(g, PARK_JOIN.beach.x, PARK_JOIN.beach.y, 5, H.DIRT);
      for (const s of SUNSETS) H.carveDisc(g, s.x, s.y, 4, H.DIRT);
    }
  }

  // a wall at the old east edge so the unbought strip is not a shortcut around the fog
  function navBlockUnbought(g, H, opts) {
    if (opts && opts.eastave) return;
    H.paintBox(g, OLD_X1 - 1, WORLD.y0, OLD_X1 + 2, BEACH.y0 - 2, H.BLOCKED);
  }

  const api = {
    OLD_X1, NEW_X1, WORLD, AVENUE, PARK, PARK_GATE, PARK_SOUTH, PRICE_AVE, PRICE_BEACH,
    BEACH, beachX1, beachRect, onAvenue, inPark, inBeach, sandAt, inRect, boxHit,
    gateAve, gateBeach, CAR_SLOTS, BUS_SLOTS, LANE_Y, ENTRY, UMBRELLAS, CHAIRS, TOWER, SUNSETS,
    boardwalk, BOARD_SPURS, ESHORE_JOIN, PARK_JOIN, hideTree, dayPlan, trafficAt, lightsAt,
    navPaint, navCarve, navBlockUnbought, pathToSlot, LOOKS, BEACH_LOOKS, DAY_FROM, DAY_TO
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PFEast = api;
})(typeof window !== 'undefined' ? window : globalThis);
