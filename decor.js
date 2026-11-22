// 像素农场 · 第 9 阶段（v5.7.0）：装饰、夜灯、派对区和「挪东西」的规则（纯数据和纯函数；浏览器里是 window.PFDecor，Node 里可以 require 做单元测试）
// Decorations are only for looking at: none of them is needed to progress. They come from the shop, or now and then from
// chopping, fishing, a giant crop, a full page of the collection book. The family sets each one down on free grass by
// themselves; the player can point at a new spot and someone carries it over. The art is decor-art.js, the wiring game.js.
'use strict';
(function (root) {
  // foot: half-extents kept clear when it is set down (world units, 8 = one farm tile); block: the part people walk round
  // light: radius of its glow at night when the water wheel's grid reaches it (lamps), shop: { cost, wood, max }
  const CATALOG = {
    bench: { name: '长椅', foot: [6, 3.5], block: [4.5, 1.5], shop: { cost: 300, wood: 10, max: 6 }, desc: '一条木头长椅，家人歇脚时会坐一会儿' },
    flowerpot: { name: '花盆', foot: [3, 3], block: null, shop: { cost: 150, wood: 0, max: 10 }, desc: '一盆开着的花' },
    scarecrow: { name: '稻草人', foot: [4, 4], block: [1.5, 1.5], shop: { cost: 250, wood: 5, max: 3 }, desc: '戴草帽的稻草人，站在田边' },
    birdbath: { name: '石头水盆', foot: [4.5, 4.5], block: [3, 3], shop: { cost: 450, wood: 0, max: 3 }, desc: '一个盛着水的石盆，偶尔有小鸟落下' },
    lamppost: { name: '路灯', foot: [3, 3], block: [1, 1], light: 26, shop: { cost: 600, wood: 5, max: 8 }, desc: '接上水车的电，天一黑就亮' },
    stonelamp: { name: '石灯', foot: [3.5, 3.5], block: [2, 2], light: 18, shop: { cost: 800, wood: 0, max: 6 }, desc: '矮矮的石灯笼，接上电后夜里透出暖光' },
    stringlights: { name: '串灯', foot: [7, 3], block: null, light: 22, shop: { cost: 700, wood: 10, max: 4 }, desc: '两根木杆之间挂一串小灯泡，接上电后夜里亮' },
    party: { name: '派对区', foot: [12, 8.5], block: [9.5, 2.5], light: 26, big: 1, shop: { cost: 2000, wood: 40, max: 1 }, desc: '长桌、两条长凳和一圈串灯。不定期的晚上一家人会聚在这里，有时镇上的人也来做客' },
    carving: { name: '木雕小熊', foot: [3.5, 3.5], block: [2, 2], src: '砍树时偶尔从木头里刻出来' },
    shell: { name: '贝壳堆', foot: [3.5, 3], block: null, src: '海钓时偶尔捞上来' },
    bottle: { name: '漂流瓶', foot: [3, 3], block: null, src: '钓鱼时偶尔钓上来' },
    giant_pumpkin: { name: '巨大南瓜纪念', foot: [5, 5], block: [4, 4], src: '第一次收获巨大南瓜' },
    giant_cabbage: { name: '巨大卷心菜纪念', foot: [5, 5], block: [4, 4], src: '第一次收获巨大卷心菜' },
    giant_watermelon: { name: '巨大西瓜纪念', foot: [5, 5], block: [4, 4], src: '第一次收获巨大西瓜' },
    koistatue: { name: '锦鲤石雕', foot: [5, 5], block: [4, 4], src: '图鉴「鱼」页集满' },
    chime: { name: '风铃架', foot: [3.5, 3.5], block: [1.5, 1.5], src: '图鉴「昆虫」页集满' },
  };
  const IDS = Object.keys(CATALOG);
  const SHOP_IDS = IDS.filter(id => CATALOG[id].shop);
  const LAMP_IDS = IDS.filter(id => CATALOG[id].light);
  const INV_MAX = 80, PLACED_MAX = 80, ORDERS_MAX = 8; // v5.10.3: the storehouse holds whatever the tidy yard has no spot for (was 20)

  // ---------- where things come from (each roll on its own random stream, so the farm's other events stay put) ----------
  const DROPS = { chop: [['carving', 0.04], ['stonelamp', 0.015]], sea: [['shell', 0.06], ['bottle', 0.025]], pond: [['bottle', 0.015]] };
  function rollDrop(src, r) { let u = r(); for (const [id, p] of DROPS[src] || []) { if (u < p) return id; u -= p; } return null; }
  const GIANT_KEEP = { pumpkin: 'giant_pumpkin', cabbage: 'giant_cabbage', watermelon: 'giant_watermelon' };
  // a full page of the collection book unlocks one piece (once): keys = the page's item keys, has(key) -> seen
  const SET_UNLOCK = [{ id: 'koistatue', group: 'fish' }, { id: 'chime', group: 'bug' }];
  const pageDone = (keys, has) => keys.length > 0 && keys.every(k => has(k));

  // ---------- 派对 ----------
  // An evening now and then (not every day): 17:30 the family drifts over, guests from the next town come up the east road,
  // everyone stays until 20:30 and then goes home. Nobody has to confirm anything.
  const PARTY = { from: 17 * 60 + 30, to: 20 * 60 + 30, gap: 4, p: 0.12, pSpecial: 0.45, guests: 0.65 };
  // a day worth celebrating: a child's 28-day birthday, or 28 days since 阿禾 moved in
  function special(day, fam) {
    fam = fam || {}; const ann = d => d > 0 && day > d && (day - d) % 28 === 0;
    return ann(fam.moved | 0) || (fam.kids || []).some(k => ann(k.born | 0));
  }
  // ctx: { day, placedDay (the area's day, 0 = none), last (day of the last party), special }, r: random -> a party tonight?
  function partyTonight(ctx, r) {
    if (!(ctx.placedDay > 0) || ctx.day <= ctx.placedDay) return false;  // the first evening after it is set up at the earliest
    if (!(ctx.last > 0)) return true;                                     // the first one is not left to chance
    if (ctx.day - ctx.last < PARTY.gap) return false;
    return r() < (ctx.special ? PARTY.pSpecial : PARTY.p);
  }
  const guestCount = r => (r() < PARTY.guests ? 1 + (r() < 0.5 ? 1 : 0) : 0);
  const partyOn = T => T >= PARTY.from && T < PARTY.to;
  // One dining row: opposing benches overlapped because sprites are taller than the projected table depth.
  // Two full-width places stay readable at the normal camera and quarter-turn views; everyone else rotates through the lawn.
  const SEATS = [[-6.5, -5.5], [6.5, -5.5]];
  const partySeats = c => SEATS.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }));
  // Conservative adult silhouette (20 x 26 framebuffer pixels), tested at the normal and nearby camera angles.
  function partyClear(a, b) { const dx = a.x - b.x, dy = a.y - b.y;
    return [-0.6, 0, 0.22, 0.25, 0.6].every(t => Math.abs(2 * (dx * Math.cos(t) - dy * Math.sin(t))) >= 20 || Math.abs(1.5 * (dx * Math.sin(t) + dy * Math.cos(t))) >= 26); }
  const POSTS = [[-10.75, -7.25], [10.75, -7.25], [10.75, 7.25], [-10.75, 7.25]]; // the string-light posts
  const partyPosts = c => POSTS.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }));

  // ---------- v5.11.0.15: the party spills onto the grass round the table ----------
  // A crowd used to stand in the 10 places round one small table, a few px apart (everyone on top of everyone). On a party
  // evening the family now also lays out three corners on free grass next to the area: a plank dance floor, a picnic rug with
  // a drinks barrel for chatting, and a ball lawn for the children. Each has its own fixed places; a lantern pole on its far side
  // carries the string lights out from the area's posts, so the whole party is lit. Nothing is saved: it is rebuilt from the
  // grass every evening (same farm -> same spots), and a corner that does not fit anywhere is simply left out.
  // box: [x0, y0, x1, y1] relative to the corner's centre; spots: where people stand; pole: the lantern pole
  const LAWN = [
    { kind: 'dance', box: [-12, -4, 12, 4], spots: [[-8, 0], [0, 0], [8, 0]], pole: [11, -3],
      tall: { box: [-5, -13, 5, 13], spots: [[-2, -9], [2, 0], [-2, 9]], pole: [3.5, -11.5] } },
    { kind: 'chat', box: [-9, -4.5, 9, 4.5], spots: [[-6, 0.5], [6, 0.5], [0, 3.5]], pole: [-8, -3.5], barrel: [0, -1.5],
      tall: { box: [-5, -10, 5, 10], spots: [[-2.5, -6.5], [2.5, 6.5], [2.5, -1]], pole: [-3.5, -9], barrel: [-1.5, 1.5] } },
    { kind: 'play', box: [-10, -5, 10, 5], spots: [[-7, 0], [7, 0]], pole: [9, -4], // the children run round it (game.js)
      tall: { box: [-5.5, -10, 5.5, 10], spots: [[-2, -8], [2, 8]], pole: [-4.5, -9] } },
  ];
  // the corners' centres round the area (c): beside it first, then a ring further out; never under the area itself
  const LAWN_AT = [[0, 14], [-11, 25], [11, 25], [24, 0], [-24, 0], [0, -14], [24, 14], [-24, 14], [24, -14], [-24, -14], [0, 26], [36, 0], [-36, 0], [0, -26]];
  // then, for a crowded farm, any spot on a 4-unit grid out to about 36, nearest first (the same farm always gets the same spots)
  const LAWN_GRID = []; for (let y = -32; y <= 32; y += 4) for (let x = -36; x <= 36; x += 4) if (Math.hypot(x, y * 1.15) <= 37 && !LAWN_AT.some(([ax, ay]) => ax === x && ay === y)) LAWN_GRID.push([x, y]);
  LAWN_GRID.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || a[1] - b[1] || a[0] - b[0]);
  const ptInBox = (p, b) => p.x > b[0] && p.x < b[2] && p.y > b[1] && p.y < b[3];
  const boxHit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  // free(box, centre) -> the whole box is plain grass, a short walk from the table; returns [{ kind, x, y, box, spots: [{x, y}], pole: {x, y}, barrel }]
  function partyLawn(c, free) {
    const out = [], taken = [[c.x - 15, c.y - 20, c.x + 15, c.y + 20]];
    // each corner lies along x; on a narrow strip it may stand on end instead (`tall`: a short staggered column)
    const turn = L => Object.assign({ kind: L.kind, turned: 1 }, L.tall);
    // order of tries: the tidy spots lying flat, then standing on end, then the grid the same way
    for (const L0 of LAWN) { const tries = [];
      for (const at of [LAWN_AT, LAWN_GRID]) for (const L of [L0, turn(L0)]) for (const a of at) tries.push([L, a]);
      for (const [L, [ax, ay]] of tries) {
        const x = c.x + ax, y = c.y + ay, box = [x + L.box[0], y + L.box[1], x + L.box[2], y + L.box[3]];
        const spots = L.spots.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
        if (spots.some(p => partySeats(c).some(q => !partyClear(p, q)))) continue;
        if (taken.some(t => boxHit(t, [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1])) || !free(box, { x, y })) continue;
        taken.push(box);
        out.push({ kind: L.kind, x, y, box, tall: L.turned ? 1 : 0, spots: L.spots.map(([dx, dy]) => ({ x: x + dx, y: y + dy })), pole: { x: x + L.pole[0], y: y + L.pole[1] }, barrel: L.barrel ? { x: x + L.barrel[0], y: y + L.barrel[1] } : null });
        break; } }
    return out;
  }
  // three rounds: until 18:40 everyone sits down to eat (most arrive by about 18:15), then two rounds of about an hour in
  // which people swap round (table, dance floor, rug); the children keep to the ball lawn and come to the table in round 1
  const PHASES = [PARTY.from, PARTY.from + 70, PARTY.from + 125, PARTY.to];
  const partyPhase = T => (T >= PHASES[2] ? 2 : T >= PHASES[1] ? 1 : 0);
  const phaseEnd = T => PHASES[partyPhase(T) + 1];
  const phaseStart = T => PHASES[partyPhase(T)];
  // c: the area; lawn: partyLawn(); roster: [{ key, kid }] in the order people arrived; extra: spare grass spots for a crowd
  // -> { key: { x, y, act ('eat' | 'dance' | 'chat' | 'play' | 'stand'), seat (table index or -1) } }; no two people share a spot
  function partyPlan(c, lawn, roster, phase, extra) {
    const seats = partySeats(c).map((p, i) => ({ x: p.x, y: p.y, act: 'eat', seat: i })), tableOrder = seats;
    const of = k => { const z = lawn.find(l => l.kind === k); return z ? z.spots.map(p => ({ x: p.x, y: p.y, act: k, seat: -1 })) : []; };
    const dance = of('dance'), chat = of('chat'), play = of('play'), spare = (extra || []).map(p => ({ x: p.x, y: p.y, act: 'stand', seat: -1 }));
    // the grown-ups' round: 17:30 everyone sits down to eat; after that they go two by two, each pair to the next corner
    // (table, dance floor, rug) every hour, so each corner keeps a few people and nobody stays put all evening
    const lists = { eat: tableOrder, dance, chat }, SEQ = ['eat', 'dance', 'chat'];
    const used = new Set(), occupied = [], out = {};
    const take = (key, list) => { for (const p of list) if (!used.has(p) && occupied.every(q => partyClear(p, q))) { used.add(p); occupied.push(p); out[key] = { x: p.x, y: p.y, act: p.act, seat: p.seat }; return true; } return false; };
    const kids = roster.filter(r => r.kid), grown = roster.filter(r => !r.kid);
    for (const r of kids) if (!take(r.key, (phase === 1 ? tableOrder.slice().reverse() : []).concat(play, dance, tableOrder, chat, spare))) out[r.key] = null;
    grown.forEach((r, i) => { const a = phase === 0 ? 'eat' : SEQ[((i >> 1) + phase) % 3], rest = SEQ.filter(k => k !== a).map(k => lists[k]);
      if (!take(r.key, lists[a].concat(...rest, spare))) out[r.key] = null; });
    return out;
  }

  // ---------- v5.11.0.21: a wedding evening at the party area ----------
  // The same 17:30–20:30 evening, but it opens with a short ceremony on the grass beside the table: a flower arch, a cream runner
  // strewn with petals (the aisle) and the guests in two tidy rows facing it. 17:30 everyone takes their place (the couple at the
  // far end of the aisle), 17:45 the couple walk up the aisle (drawn slowly, it is not a race), 18:02 they stand under the arch
  // (hearts, petals; the album photo is taken at 18:10), 18:22 the party carries on as usual with the couple at the table.
  // Nothing is saved: the layout is rebuilt from the grass like the lawn corners.
  const WEDDING = { gather: PARTY.from - 25, walk: PARTY.from + 20, at: PARTY.from + 34, end: PARTY.from + 54 };
  const wedOn = T => T >= WEDDING.gather && T < WEDDING.end;
  const wedPhase = T => (T >= WEDDING.at ? 2 : T >= WEDDING.walk ? 1 : 0); // 0 taking places, 1 the walk, 2 under the arch
  const wedPhaseEnd = T => [WEDDING.walk, WEDDING.at, WEDDING.end][wedPhase(T)];
  // Places are { a: along the aisle from the arch, b: across }. The aisle always runs from the arch towards the camera's side
  // (u = +y) or sideways (u = ±x), so the couple stand in front of the arch, not behind it: south of the table the arch is by
  // the table and the aisle leads away; north of it the arch is at the far end and the aisle leads back towards the table.
  const WED_ROWS = [[2.5, -15.5], [2.5, 15.5], [22, -6.5], [22, 6.5], [2.5, -28], [2.5, 28], [22, -19], [22, 19]]; // front row beside the couple, then the row behind
  const WED_AISLE = [41.5, 24, 14]; // the long aisle (both rows), else a shorter one (front row only)
  function wedCands(c) { const out = [];
    for (const len of WED_AISLE) {
      for (const off of [11, 15]) for (const sx of [0, -8, 8]) out.push({ u: [0, 1], arch: { x: c.x + sx, y: c.y + off }, len });
      for (const sx of [0, -8, 8]) out.push({ u: [0, 1], arch: { x: c.x + sx, y: c.y - 12.5 - len }, len });
      out.push({ u: [1, 0], arch: { x: c.x + 16.5, y: c.y }, len }, { u: [-1, 0], arch: { x: c.x - 16.5, y: c.y }, len }); }
    return out; }
  // c: the area; free(box, centre?) -> plain grass a short walk away (game.js lawnAt); lawn: partyLawn() (keep off its poles and barrels)
  // -> { arch, u, couple: [2], start: [2], runner: [from, to], guests: [...], boxes } or null when no side of the area has room
  function weddingLayout(c, free, lawn) {
    lawn = lawn || []; let best = null;
    const stuff = lawn.flatMap(l => [l.pole].concat(l.barrel ? [l.barrel] : []));
    const bbox = (p, q, m) => [Math.min(p.x, q.x) - m, Math.min(p.y, q.y) - m, Math.max(p.x, q.x) + m, Math.max(p.y, q.y) + m];
    const near = boxOf(c.x, c.y, [13, 9.5]), spot = p => !ptInBox(p, near) && free([p.x - 2, p.y - 2, p.x + 2, p.y + 2], p) && !stuff.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 4);
    for (const { u: [ux, uy], arch, len } of wedCands(c)) {
      const vx = -uy, vy = ux, P = (a, b) => ({ x: arch.x + ux * a + vx * b, y: arch.y + uy * a + vy * b });
      const couple = [P(2.5, -3), P(2.5, 3)], start = [P(len, -3), P(len, 3)], archBox = bbox(P(-1, -6.5), P(1, 6.5), 0), runBox = bbox(P(2.5, -2), P(len, 2), 0);
      if (boxHit(archBox, near) || boxHit(runBox, near) || !free(archBox) || !free(runBox)) continue;
      if (lawn.some(l => boxHit(l.box, bbox(P(-1, -6.5), P(len, 6.5), 0)))) continue;
      if (!couple.concat(start).every(spot)) continue;
      const fixed = couple.concat(start), guests = [];
      for (const [a, b] of WED_ROWS) { if (a > 2.5 && len < WED_AISLE[0]) continue;
        const p = P(a, b); if (!spot(p) || !fixed.concat(guests).every(q => partyClear(p, q))) continue; guests.push(p); }
      const boxes = [archBox, runBox].concat(fixed, guests).map(p => (Array.isArray(p) ? p : [p.x - 3, p.y - 3, p.x + 3, p.y + 3]));
      if (!best || guests.length > best.guests.length) best = { arch, u: [ux, uy], couple, start, runner: [P(2, 0), P(len + 1, 0)], guests, boxes };
      if (guests.length >= 8) return best;
    }
    return best;
  }
  // the evening's places while the ceremony lasts: the couple (coupleKeys, in that order) at the far end, then under the arch;
  // everyone else in the rows, then on the spare grass (extra) clear of the rows -> { key: { x, y, act ('wed-couple' | 'wed-guest'), i } }
  function weddingPlan(W, roster, coupleKeys, phase, extra) {
    const out = {}, used = [];
    coupleKeys.forEach((k, i) => { if (!k) return; const p = (phase === 0 ? W.start : W.couple)[i]; out[k] = { x: p.x, y: p.y, act: 'wed-couple', i, seat: -1 }; });
    const fixed = W.couple.concat(W.start), spare = (extra || []).filter(p => fixed.concat(W.guests).every(q => partyClear(p, q)));
    const list = W.guests.concat(spare);
    for (const r of roster) { if (coupleKeys.includes(r.key)) continue;
      const p = list.find(q => !used.includes(q) && used.every(u => partyClear(q, u)));
      if (!p) { out[r.key] = null; continue; } used.push(p); out[r.key] = { x: p.x, y: p.y, act: 'wed-guest', i: -1, seat: -1 }; }
    return out;
  }

  // ---------- placement on the nav grid (path.js) ----------
  // g: { x0, y0, cell, w, h, cost } with cost 0 = blocked, `dirt` = paths and door fronts, anything else = grass
  const boxOf = (x, y, half) => [x - half[0], y - half[1], x + half[0], y + half[1]];
  function cellsOf(g, b) { const out = [];
    const i0 = Math.floor((b[0] - g.x0) / g.cell), j0 = Math.floor((b[1] - g.y0) / g.cell), i1 = Math.floor((b[2] - g.x0 - 1e-6) / g.cell), j1 = Math.floor((b[3] - g.y0 - 1e-6) / g.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push([i, j]);
    return out; }
  // every cell under the box is plain grass (not a path, not a door front, not a fence, water, tree or building)
  // `own`: the box the thing being moved blocks right now (its own cells count as grass, so it can shift a little)
  function onGrass(g, b, grass, own) { const mine = new Set(own ? cellsOf(g, own).map(([i, j]) => j * g.w + i) : []);
    for (const [i, j] of cellsOf(g, b)) { if (i < 0 || j < 0 || i >= g.w || j >= g.h) return false; const k = j * g.w + i; if (g.cost[k] !== grass && !mine.has(k)) return false; } return true; }
  // cells reachable from `from` (4-neighbour flood over walkable cells, `extra` boxes counted as blocked)
  function reach(g, from, extra) {
    const blk = new Uint8Array(g.w * g.h); for (const b of extra || []) for (const [i, j] of cellsOf(g, b)) if (i >= 0 && j >= 0 && i < g.w && j < g.h) blk[j * g.w + i] = 1;
    const seen = new Uint8Array(g.w * g.h), si = Math.floor((from.x - g.x0) / g.cell), sj = Math.floor((from.y - g.y0) / g.cell);
    if (si < 0 || sj < 0 || si >= g.w || sj >= g.h) return seen;
    const q = new Int32Array(g.w * g.h); let h = 0, t = 0; q[t++] = sj * g.w + si; seen[sj * g.w + si] = 1;
    while (h < t) { const k = q[h++], i = k % g.w, j = (k - i) / g.w;
      if (i > 0) { const n = k - 1; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } }
      if (i < g.w - 1) { const n = k + 1; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } }
      if (j > 0) { const n = k - g.w; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } }
      if (j < g.h - 1) { const n = k + g.w; if (!seen[n] && g.cost[n] && !blk[n]) { seen[n] = 1; q[t++] = n; } } }
    return seen;
  }
  // a new blocked box must not cut anyone off: every spot reachable from `from` before stays reachable after
  function keepsPaths(g, box, spots, from) {
    const before = reach(g, from, []), after = reach(g, from, [box]);
    for (const s of spots) { const i = Math.floor((s.x - g.x0) / g.cell), j = Math.floor((s.y - g.y0) / g.cell); if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
      const k = j * g.w + i; if (before[k] && !after[k]) return false; }
    return true;
  }
  // candidate spots for the family to set something down by themselves: rings round `c`, nearest first, on a 6-unit lattice
  function ringSpots(c, rMax, step) { const out = []; step = step || 6;
    for (let y = -rMax; y <= rMax; y += step) for (let x = -rMax; x <= rMax; x += step) { const d = Math.hypot(x, y); if (d <= rMax) out.push({ x: c.x + x, y: c.y + y, d }); }
    return out.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x); }

  // ---------- state ----------
  // inv: { id: n } waiting in the storehouse; placed: [{ u, id, x, y, d }]; orders: [{ u, op, what, ref, id, x, y }]
  // (op 'place' | 'move' | 'store' (v5.11.0.2, decor only: back to the storehouse); what 'decor' | 'work' | 'hive' | 'spr' | 'home' (v5.9.0: a new house)); party: { last, at (day it was set up), tonight, guests }
  // got: { id: 1 } pieces granted once (book pages, giant keepsakes); n: the next uid
  const empty = () => ({ inv: {}, placed: [], orders: [], party: { last: 0, at: 0, tonight: 0, guests: 0 }, got: {}, n: 1, moon: 0 });
  const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
  const XY = { x: [-260, 452], y: [-212, 388] };
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    const inv = o.inv && typeof o.inv === 'object' ? o.inv : {};
    for (const id of IDS) { const n = int(inv[id], 0, 0, INV_MAX); if (n) out.inv[id] = n; }
    let n = int(o.n, 1, 1, 1e6);
    out.placed = (Array.isArray(o.placed) ? o.placed : []).filter(p => p && CATALOG[p.id] && typeof p.x === 'number' && typeof p.y === 'number').slice(0, PLACED_MAX)
      .map(p => ({ u: int(p.u, 0, 0, 1e6), id: p.id, x: num(p.x, 0, XY.x[0], XY.x[1]), y: num(p.y, 0, XY.y[0], XY.y[1]), d: int(p.d, 0, 0, 1e6) }));
    const seen = new Set(); for (const p of out.placed) { if (!p.u || seen.has(p.u)) p.u = n++; seen.add(p.u); n = Math.max(n, p.u + 1); }
    if (out.placed.filter(p => p.id === 'party').length > 1) { let k = 0; out.placed = out.placed.filter(p => p.id !== 'party' || k++ === 0); }
    // orders: a carry in progress is not saved half-way (the thing goes back where it was); targets are checked again before use
    out.orders = (Array.isArray(o.orders) ? o.orders : []).filter(q => q && (q.op === 'place' || q.op === 'move' || (q.op === 'store' && q.what === 'decor')) && ['decor', 'work', 'hive', 'spr', 'home'].includes(q.what) && typeof q.x === 'number' && typeof q.y === 'number')
      .slice(0, ORDERS_MAX).map(q => ({ u: n++, op: q.op, what: q.what, ref: typeof q.ref === 'string' || typeof q.ref === 'number' ? q.ref : null, id: CATALOG[q.id] ? q.id : null, x: num(q.x, 0, XY.x[0], XY.x[1]), y: num(q.y, 0, XY.y[0], XY.y[1]), mine: q.mine ? 1 : 0 }))
      .filter(q => q.op === 'move' || q.op === 'store' ? q.ref !== null : !!q.id);
    out.n = n;
    const pa = o.party && typeof o.party === 'object' ? o.party : {};
    out.party = { last: int(pa.last, 0, 0, 1e6), at: int(pa.at, 0, 0, 1e6), tonight: int(pa.tonight, 0, 0, 1e6), guests: int(pa.guests, 0, 0, 2) };
    const got = o.got && typeof o.got === 'object' ? o.got : {}; for (const id of IDS) if (got[id]) out.got[id] = 1;
    out.moon = o.moon ? 1 : 0;
    // v5.11.0.2: kept { id: n } — pieces 收回 by hand (xhs touch shell); they stay in the storehouse until placed again. Only saved when used
    const kept = o.kept && typeof o.kept === 'object' ? o.kept : {}; for (const id of IDS) { const k = Math.min(int(kept[id], 0, 0, INV_MAX), out.inv[id] | 0); if (k) (out.kept || (out.kept = {}))[id] = k; }
    return out;
  }

  const api = { CATALOG, IDS, SHOP_IDS, LAMP_IDS, INV_MAX, PLACED_MAX, ORDERS_MAX, DROPS, rollDrop, GIANT_KEEP, SET_UNLOCK, pageDone,
    PARTY, special, partyTonight, guestCount, partyOn, WEDDING, wedOn, wedPhase, wedPhaseEnd, weddingLayout, weddingPlan, partySeats, partyPosts, partyClear, LAWN, LAWN_AT, partyLawn, PHASES, partyPhase, phaseEnd, phaseStart, partyPlan, boxOf, cellsOf, onGrass, reach, keepsPaths, ringSpots, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFDecor = api;
})(typeof window !== 'undefined' ? window : globalThis);
