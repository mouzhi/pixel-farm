// 像素农场 · v5.12.3：繁荣度 6「旅游小镇」、R1 镇公园、镇上三家成家生子（纯数据和纯函数；浏览器里是 window.PFPark，Node 里可以 require 做单元测试）
// Plan「繁荣度 6 与镇民家庭」: level 6 needs level 5 first, the park built, and the tourists counted in (the resort's stars or the
// last 14 days' visitors: lodging + parking + beach). 阿梅、阿川、秋姨 (L5 / L8 / L11) settle down and have 1–2 children each;
// the children keep a simple day (school, then the park) and never join the family task board. At most 4 children + 2 pets in the park.
// Saved: only `hall.built.park` (a hall project) and `hall.lv6` (the day level 6 was reached). Everything below is a pure function
// of that day, today's day number and the clock: the families, their walks and the park pets are never stored.
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
  const hash = (a, b, c) => { let n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 1442695) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

  // ---------- the park: the reserved lot R1 next to the school playground ----------
  const RECT = [732, -88, 830, -26];
  const PROJECT = { id: 'park', name: '镇公园', desc: '在学校操场东边的空地上修公园：草坪、环形小路、长椅、沙坑、廊架和宠物角。放学后镇上的小孩会来玩，公园里养着一只小狗和一只小猫。繁荣度 6 必须先有公园', cost: 36000, wood: 200, lv: 5, kind: 'park' };
  const LOOP = { cx: 781, cy: -57, rx: 36, ry: 20, hw: 1.6 };   // the ring path
  const PLAZA = { x: 781, y: -57, r: 9 };                        // the middle: flagstones under the pergola
  const GATE = P(781, -26), IN = P(781, -36);                    // south gate on the back lane side
  const PETS_RECT = [810, -86, 828, -72];                        // 宠物角 (fenced, north-east corner, clear of the ring)
  const LINK = [P(781, -26), P(781, -14), P(838, -14)];          // gravel link from the gate to 东街's top end (t_east / t_lane meet there)
  // fixed slots (k: model; rot in radians). Nothing here moves or is saved.
  const PROPS = [
    { k: 'pergola', x: 781, y: -60 },
    { k: 'sandbox', x: 760, y: -56 },
    { k: 'kennel', x: 824, y: -82 },
    { k: 'bench', x: 752, y: -34, rot: 0 }, { k: 'bench', x: 810, y: -34, rot: 0 }, { k: 'bench', x: 800, y: -46, rot: 0 }, { k: 'bench', x: 762, y: -82, rot: 0 },
    { k: 'flowers', x: 743, y: -84 }, { k: 'flowers', x: 790, y: -84 }, { k: 'flowers', x: 766, y: -31 }, { k: 'flowers', x: 796, y: -31 },
    { k: 'lamp', x: 774, y: -29 }, { k: 'lamp', x: 788, y: -29 },
  ];
  const fenceOf = () => { const r = PETS_RECT, out = []; // short pickets round the pet corner, a gap on the south-west side to walk in
    for (let x = r[0] + 2; x < r[2]; x += 4) { out.push({ x, y: r[1], rot: 0 }); if (x > r[0] + 6) out.push({ x, y: r[3], rot: 0 }); }
    for (let y = r[1] + 2; y < r[3]; y += 4) { out.push({ x: r[0], y, rot: Math.PI / 2 }); out.push({ x: r[2], y, rot: Math.PI / 2 }); }
    return out; };
  const FENCE = fenceOf();
  const LIGHTS = [P(774, -29), P(788, -29)]; // two lamps by the gate (the night budget: no more)
  const LIT = [17 * 60 + 30, 22 * 60];
  const built = H => !!(H && H.built && H.built.park);
  const inPark = (x, y, pad = 0) => inRect(x, y, RECT, pad);
  function lightsAt(H, T) {
    const t = ((T % 1440) + 1440) % 1440; if (!built(H) || t < LIT[0] || t >= LIT[1]) return [];
    return LIGHTS.map(l => ({ x: l.x, y: l.y, z: 14, r: 20, s: 0.75 }));
  }

  // ---------- ground: lawn with mown stripes, a gravel ring, flagstones in the middle, packed earth in the pet corner ----------
  const loopD = (x, y) => Math.hypot((x - LOOP.cx) / LOOP.rx, (y - LOOP.cy) / LOOP.ry);
  const onLoop = (x, y, pad = 0) => Math.abs(loopD(x, y) - 1) * LOOP.ry < LOOP.hw + pad;
  const onLink = (x, y, pad = 0) => (Math.abs(x - GATE.x) < 1.6 + pad && y >= -37 && y <= -12) || (Math.abs(y - LINK[1].y) < 1.6 + pad && x >= GATE.x - 1.6 && x <= 838);
  // pal: { G, Wd, St, Ac } (palette ramps). -> [colour, kind] or null (not ours)
  function ground(x, y, pal) {
    const G = pal.G, Wd = pal.Wd, St = pal.St, Ac = pal.Ac, k = hash(Math.floor(x * 2), Math.floor(y * 2), 41);
    if (!inPark(x, y)) { if (onLink(x, y)) return [!onLink(x, y, -0.7) ? St[1] : (k > 0.6 ? St[2] : St[3]), 'dirt']; return null; } // the link in the same stone as the paved lane
    if (Math.hypot(x - PLAZA.x, y - PLAZA.y) < PLAZA.r) { const fx = Math.floor((x - PLAZA.x + 40) / 3), fy = Math.floor((y - PLAZA.y + 40) / 2);
      if (Math.hypot(x - PLAZA.x, y - PLAZA.y) > PLAZA.r - 0.8) return [St[1], 'dirt'];
      return [hash(fx, fy, 43) > 0.5 ? St[3] : St[2], 'dirt']; }
    if (onLoop(x, y) || onLink(x, y)) { const edge = !onLoop(x, y, -0.6) && !onLink(x, y, -0.6); return [edge ? Wd[3] : (k > 0.8 ? St[2] : Wd[4]), 'dirt']; }
    if (inRect(x, y, PETS_RECT)) return [k > 0.7 ? Wd[3] : Wd[4], 'dirt'];
    const r = RECT, rim = x < r[0] + 1.2 || x > r[2] - 1.2 || y < r[1] + 1.2 || (y > r[3] - 1.2 && Math.abs(x - GATE.x) > 2);
    if (rim) return [G[1], 'grass'];                                                   // a low clipped hedge line round the lawn
    if (k > 0.985) return [Ac[k > 0.993 ? 3 : 1], 'grass'];                            // a few daisies
    return [(Math.floor((x + y + 400) / 6) & 1) ? G[3] : G[2], 'grass'];               // mown stripes
  }

  // ---------- 繁荣度 6: the park, plus tourists ----------
  const TOUR = { stars: 4, visitors: 30, days: 14, perGroup: 2 };
  // lodging groups that checked out in the last 14 days (the resort's guestbook rows: { day, n }) + parking visitors (people / day)
  function visitors14(ctx) {
    const c = ctx || {}, day = c.day | 0, from = day - TOUR.days; let n = 0;
    for (const r of (c.rows || [])) if (r && (r.day | 0) > from && (r.day | 0) <= day) n += Math.max(1, r.n | 0) * TOUR.perGroup;
    if (typeof c.parking === 'function') for (let d = Math.max(1, from + 1); d <= day; d++) n += c.parking(d) | 0;
    return n;
  }
  // ctx: { lv (prosperity before 6), park, avenue, beach, stars, visitors } -> { ok, need: [what is missing] }
  function tourCheck(ctx) {
    const c = ctx || {}, need = [];
    if ((c.lv | 0) < 5) need.push('繁荣度先到 5');
    if (!c.park) need.push('建好镇公园');
    if (!c.avenue && !c.beach) need.push('买下东门大道或度假沙滩');
    if (!((+c.stars || 0) >= TOUR.stars) && !((c.visitors | 0) >= TOUR.visitors)) need.push(`度假村 ${TOUR.stars} 星，或近 ${TOUR.days} 天游客 ${TOUR.visitors} 人`);
    return { ok: !need.length, need };
  }

  // ---------- the three families ----------
  // wed / born: days after level 6 was reached. A newborn rides in a pram for BABY days, then walks to school and the park.
  const BABY = 7;
  const FAMILIES = [
    { id: 'f5', lot: 'L5', host: 'n5', hostName: '裁缝阿梅', door: P(930, -29), spouse: { id: 'ps5', name: '阿诚', look: 'parkS5', wed: 1 },
      kids: [{ id: 'pk5a', name: '小豆', look: 'parkK1', born: 5 }, { id: 'pk5b', name: '小禾', look: 'parkK2', born: 15 }] },
    { id: 'f8', lot: 'L8', host: 'n6', hostName: '邮差阿川', door: P(964, -29), spouse: { id: 'ps8', name: '小芸', look: 'parkS8', wed: 2 },
      kids: [{ id: 'pk8a', name: '阿乐', look: 'parkK3', born: 8 }] },
    { id: 'f11', lot: 'L11', host: 'n7', hostName: '花匠秋姨', door: P(964, 47), spouse: { id: 'ps11', name: '老贺', look: 'parkS11', wed: 3 },
      kids: [{ id: 'pk11a', name: '小葵', look: 'parkK4', born: 11 }] },
  ];
  const KIDS_MAX = 4, PETS_MAX = 2;
  const since = (lv6, day) => (lv6 | 0) > 0 ? (day | 0) - (lv6 | 0) : -1;
  // -> what each family is like today: { id, wed, babies: [kid], kids: [kid] (walking) }
  function familiesOn(lv6, day) {
    const d = since(lv6, day); if (d < 0) return [];
    return FAMILIES.filter(f => d >= f.spouse.wed).map(f => ({ f, babies: f.kids.filter(k => d >= k.born && d < k.born + BABY), kids: f.kids.filter(k => d >= k.born + BABY) }));
  }
  // the morning's log lines for today (one per event)
  function news(lv6, day) {
    const d = since(lv6, day), out = []; if (d < 0) return out;
    if (d === 0) out.push('镇子成了「旅游小镇」：公园里人多了，阿梅、阿川和秋姨家也要慢慢热闹起来');
    for (const f of FAMILIES) {
      if (d === f.spouse.wed) out.push(`${f.hostName}和${f.spouse.name}成家了，住在镇上的二层楼里`);
      for (const k of f.kids) { if (d === k.born) out.push(`${f.hostName}家添了个小娃娃，起名${k.name}；${f.spouse.name}上午推着婴儿车去公园`);
        if (d === k.born + BABY) out.push(`${k.name}会自己走了，每天放学后去镇公园玩`); }
    }
    return out;
  }
  // how many live in town because of this (for 镇上住着 n 位邻居)
  const extraPeople = (lv6, day) => familiesOn(lv6, day).reduce((a, q) => a + 1 + q.babies.length + q.kids.length, 0);

  // ---------- where they are: walks along fixed routes, then a stroll between spots in the park ----------
  const SPEED = 6;               // world units a game minute (a grown-up's walk is about 6)
  const SCHOOL_DOOR = P(642, 46);
  const toPark = from => {
    const a = [from];
    if (from.y > 0) { a.push(P(from.x, 66)); if (from.x !== 838) a.push(P(838, 66)); a.push(P(838, -14)); }
    else { a.push(P(from.x, -14)); a.push(P(838, -14)); }
    a.push(P(781, -14), GATE, IN); return a; };
  const lenOf = r => { let n = 0; for (let i = 1; i < r.length; i++) n += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y); return n; };
  function along(r, dist) { let w = Math.max(0, dist);
    for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (w <= d || i === r.length - 1) { const k = d ? Math.min(1, w / d) : 1; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, fx: d ? (b.x - a.x) / d : 0, fy: d ? (b.y - a.y) / d : 1 }; }
      w -= d; }
    const l = r[r.length - 1]; return { x: l.x, y: l.y, fx: 0, fy: 1 }; }
  const KID_SPOTS = [P(754, -52), P(766, -60), P(760, -64), P(778, -50), P(788, -52), P(800, -64), P(770, -72), P(806, -70), P(796, -40), P(766, -42)];
  const ADULT_SPOTS = [P(752, -37), P(810, -37), P(800, -49), P(762, -79), P(781, -48), P(818, -60)];
  const loopAt = u => P(LOOP.cx + Math.cos(u) * LOOP.rx, LOOP.cy + Math.sin(u) * LOOP.ry);
  // in the park from t0: hop between spots every `seg` minutes (walk the first 3), seeded by day + person
  function stroll(spots, seed, day, t0, t, seg) {
    const i = Math.floor((t - t0) / seg), at = (t - t0) - i * seg;
    const pick = j => j < 0 ? IN : spots[(hash(day, seed, j + 1) * spots.length) | 0];
    const a = pick(i - 1), b = pick(i), u = Math.min(1, at / 3), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * u, y: a.y + dy * u, fx: u < 1 ? dx / d : 0, fy: u < 1 ? dy / d : 1, moving: u < 1 && d > 1, phase: d * u };
  }
  // a slow lap of the ring with a pram
  function lap(seed, t0, t) { const u = Math.PI / 2 + (t - t0) / 9 + seed, p = loopAt(u), q = loopAt(u + 0.05), d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x, y: p.y, fx: (q.x - p.x) / d, fy: (q.y - p.y) / d, moving: true, phase: (t - t0) * SPEED * 0.6 }; }
  // a trip (route r, leaving at t0) or null when it is not under way at t
  function trip(r, t0, t) { const L = lenOf(r), dur = L / SPEED; if (t < t0 || t >= t0 + dur) return null; const q = along(r, (t - t0) * SPEED); return Object.assign(q, { moving: true, phase: (t - t0) * SPEED }); }
  // people on the same route or spot step a little aside (perpendicular to where they face) so they do not stack
  const side = (p, i) => { const o = ((i % 3) - 1) * 1.4; p.x += -p.fy * o || o * 0.7; p.y += p.fx * o; return p; };
  const HOURS = { am: [9 * 60, 11 * 60 + 30], kids: [15 * 60, 17 * 60 + 30], pm: [15 * 60 + 30, 17 * 60 + 30] };
  // -> [{ id, name, look, kid, pram, x, y, fx, fy, moving, phase, where }] (opts: { rain })
  function peopleAt(lv6, day, T, opts) {
    const out = [], t = ((T % 1440) + 1440) % 1440; if (opts && opts.rain) return out;
    const fams = familiesOn(lv6, day);
    let kidsIn = 0;
    fams.forEach((q, fi) => {
      const f = q.f, there = toPark(f.door), back = there.slice().reverse(), walkL = lenOf(there) / SPEED;
      // the children: out of school at 15:00, walk to the park, home at 17:30
      q.kids.forEach((k, ki) => {
        if (kidsIn >= KIDS_MAX) return;
        const go = toPark(SCHOOL_DOOR), gL = lenOf(go) / SPEED, t0 = HOURS.kids[0] + ki * 2 + fi;
        let p = trip(go, t0, t), where = 'walk';
        if (!p && t >= t0 + gL && t < HOURS.kids[1] + fi * 6 + ki * 2) { p = stroll(KID_SPOTS, 7 + fi * 3 + ki, day, t0 + gL, t, 14); where = 'park'; }
        if (!p) p = trip(back, HOURS.kids[1] + fi * 6 + ki * 2, t); // families go home a few minutes apart
        if (!p) return; kidsIn++;
        out.push(side(Object.assign({ id: k.id, name: k.name, look: k.look, kid: true, pram: false, where }, p), out.length));
      });
      // the spouse: a morning stroll (pushing the pram while there is a baby), and the afternoon in the park with the children
      const s = f.spouse, pram = q.babies.length > 0, seed = fi * 2.1;
      const amIn = HOURS.am[0] + fi * 7, amOut = HOURS.am[1] - fi * 5;
      let p = trip(there, amIn - walkL, t), where = 'walk';
      if (!p && t >= amIn && t < amOut) { p = pram ? lap(seed, amIn, t) : stroll(ADULT_SPOTS, 31 + fi, day, amIn, t, 25); where = 'park'; }
      if (!p) p = trip(back, amOut, t);
      if (!p && q.kids.length) { const pmIn = HOURS.pm[0] + fi * 4;
        p = trip(there, pmIn - walkL, t);
        if (!p && t >= pmIn && t < HOURS.pm[1] + fi * 6 + 1) { p = stroll(ADULT_SPOTS, 41 + fi, day, pmIn, t, 30); where = 'park'; }
        if (!p) p = trip(back, HOURS.pm[1] + fi * 6 + 1, t); }
      if (p) out.push(side(Object.assign({ id: s.id, name: s.name, look: s.look, kid: false, pram, where }, p), out.length));
    });
    return out;
  }
  // ---------- the park's dog and cat (pure, 宠物角 only) ----------
  const PETS = [{ id: 'parkdog', kind: 'dog', coat: 'brown', seed: 3 }, { id: 'parkcat', kind: 'cat', coat: 'ginger', seed: 5 }];
  const PET_DAY = [7 * 60, 19 * 60 + 30];
  function petsAt(H, day, T) {
    if (!built(H)) return []; const t = ((T % 1440) + 1440) % 1440, r = PETS_RECT, out = [];
    const spot = (seed, j) => P(r[0] + 2.5 + hash(day, seed, j) * (r[2] - r[0] - 5), r[1] + 2.5 + hash(day, seed + 11, j) * (r[3] - r[1] - 5));
    for (const p of PETS) {
      if (t < PET_DAY[0] || t >= PET_DAY[1]) { out.push({ id: p.id, kind: p.kind, coat: p.coat, x: 821 - p.seed, y: -80, flip: false, pose: 'sleep', moving: false }); continue; }
      const seg = p.kind === 'dog' ? 12 : 40, i = Math.floor((t - PET_DAY[0]) / seg), at = (t - PET_DAY[0]) - i * seg;
      const a = spot(p.seed, i), b = spot(p.seed, i + 1), u = Math.min(1, at / 2), walk = u < 1 && (p.kind === 'dog' || at < 2);
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
      out.push({ id: p.id, kind: p.kind, coat: p.coat, x, y, flip: b.x < a.x, pose: walk ? 'walk' : (p.kind === 'cat' && (i & 1) ? 'sleep' : 'sit'), moving: walk, phase: at });
    }
    return out;
  }

  const api = { RECT, PROJECT, LOOP, PLAZA, GATE, IN, LINK, PETS_RECT, PROPS, FENCE, LIGHTS, LIT, built, inPark, onLoop, onLink, lightsAt, ground,
    TOUR, visitors14, tourCheck, BABY, FAMILIES, KIDS_MAX, PETS_MAX, familiesOn, news, extraPeople, SPEED, SCHOOL_DOOR, toPark, lenOf, along, KID_SPOTS, ADULT_SPOTS,
    HOURS, peopleAt, PETS, PET_DAY, petsAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFPark = api;
})(typeof window !== 'undefined' ? window : globalThis);
