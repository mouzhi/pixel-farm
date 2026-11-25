// 像素农场 · v5.12.5 第三代：孙辈出生、长大、上学、去公园、搬进宅园、好感结婚（纯数据和纯函数；浏览器里是 window.PFGen3，Node 里可以 require 做单元测试）
// Plan「农场宅地与第三代」: each married child (小豆 / 小米) has two children, the first 7 days after the couple moved into their new
// house and the second three weeks later; both families have a daughter. The grandchildren grow on the same table as the
// children (PFKids: 宝宝 5, 玩耍 12, 上学 12, 帮工 14, then 少年). They live in their parents' new house, walk to school,
// go to the 镇公园 after school when it is built, and as teens help on their parents' six tiles. Ten days into 少年 they move
// into a free new house (a 宅园 pad first); they get close to the four new classmates the way their parents did (0–100,
// only grows, nobody picks) and at 80 marry on a fine evening in front of their house. The couple then keeps that house's six
// tiles and two hens themselves. They never join the family task board: where they are is a pure function of the day and clock.
// Saved (append-only inside `home`, save stays v15): home.g3 = { s (first day this version saw a married child), d (last day
// counted), k: { g0: { b (born), r: { c0.. } (closeness), h (house index), mv (moved), w (mate), wd (wedding day) } } } and
// a house's `g` (the grandchild who lives there). Everything else (walks, the park, the school run) is recomputed.
'use strict';
(function (root) {
  const NODE = typeof require === 'function' && typeof document === 'undefined';
  const KD = () => root.PFKids || (NODE ? require('./kids.js') : null);
  const P = (x, y) => ({ x, y });
  const hash = (a, b, c) => { let n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 1442695) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const tod = T => ((T % 1440) + 1440) % 1440;

  // ---------- who ----------
  // after: days after the later of (the couple moved in, the day this version first saw them married)
  const KIDS = [
    { id: 'g0', p: 'kid0', name: '小满', girl: 1, look: 'g3girl', after: 7, n: 0 },
    { id: 'g1', p: 'kid1', name: '乐乐', girl: 0, look: 'g3boy', after: 7, n: 1 },
    { id: 'g2', p: 'kid0', name: '小树', girl: 0, look: 'g3boy2', after: 28, n: 2 },
    { id: 'g3', p: 'kid1', name: '小芽', girl: 1, look: 'g3girl2', after: 28, n: 3 },
  ];
  const IDS = KIDS.map(k => k.id), BY = Object.fromEntries(KIDS.map(k => [k.id, k]));
  const MAX = KIDS.length; // 4 grandchildren at most (2 + 2)
  // the new classmates at the town school (the parents' classmates 阿团 / 朵朵 / 石头 are grown up and married by now)
  const MATES = [
    { id: 'c0', name: '阿朗', girl: 0, look: 'g3m0' },
    { id: 'c1', name: '小晴', girl: 1, look: 'g3m1' },
    { id: 'c2', name: '安安', girl: 1, look: 'g3m2' },
    { id: 'c3', name: '阿杰', girl: 0, look: 'g3m3' },
  ];
  const MATE_IDS = MATES.map(m => m.id), MATE = Object.fromEntries(MATES.map(m => [m.id, m]));
  const mateName = id => (MATE[id] || { name: '同学' }).name;
  // ties go to a fixed order per grandchild (a classmate of the other sex first, like their parents' 同桌 order)
  const PREF = { g0: ['c0', 'c3', 'c1', 'c2'], g1: ['c1', 'c2', 'c0', 'c3'], g2: ['c2', 'c1', 'c3', 'c0'], g3: ['c3', 'c0', 'c2', 'c1'] };
  const REL = { max: 100, school: 1, desk: 2, teen: 1, park: 1, close: 80 };
  const MOVE_AFTER = 10;                       // days into 少年 before they move out (needs a free new house)
  const WED = { gap: 3, from: 17 * 60 + 30, to: 20 * 60 + 30 };
  const CATCHUP = 400;                         // at most this many days are counted at once (a long time offline)
  const LEVELS = [[80, '走得很近'], [50, '要好'], [20, '熟悉'], [1, '认识'], [0, '还不熟']];
  const levelOf = v => { for (const [n, s] of LEVELS) if ((v | 0) >= n) return s; return '还不熟'; };

  // ---------- state ----------
  const empty = () => ({ s: 0, d: 0, k: {} });
  const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  // nHouses: how many houses the save has (a house index past the end is dropped)
  function valid(v, nHouses) {
    const o = obj(v), out = empty(); out.s = num(o.s, 0, 0, 1e6); out.d = num(o.d, 0, 0, 1e6);
    const k = obj(o.k), seenMate = new Set(), seenHouse = new Set();
    for (const id of IDS) {
      const q = obj(k[id]); if (!(num(q.b, 0, 0, 1e6) > 0)) continue;
      const g = { b: num(q.b, 1, 1, 1e6) }, r = {}, rr = obj(q.r);
      for (const m of MATE_IDS) { const n = num(rr[m], 0, 0, REL.max); if (n) r[m] = n; }
      if (Object.keys(r).length) g.r = r;
      const h = num(q.h, -1, -1, 99), mv = num(q.mv, 0, 0, 1e6);
      if (mv > 0 && h >= 0 && h < (nHouses | 0) && !seenHouse.has(h)) { g.h = h; g.mv = mv; seenHouse.add(h); }
      if (g.mv && MATE_IDS.includes(q.w) && !seenMate.has(q.w)) { g.w = q.w; g.wd = num(q.wd, 1, 1, 1e6); seenMate.add(q.w); }
      out.k[id] = g;
    }
    return out;
  }
  const kidsOf = st => (st && st.k) ? IDS.filter(id => st.k[id]).map(id => Object.assign({ id, born: st.k[id].b }, BY[id], st.k[id])) : [];
  const ageOf = (g, day) => (day | 0) - (g.b | 0);
  const stageOf = (g, day) => { const K = KD(); return K ? K.stageOf({ born: g.b }, day) : 'teen'; };
  const married = (g, day, T) => !!(g && g.w && g.wd && ((day | 0) > g.wd || ((day | 0) === g.wd && tod(T) >= WED.to)));
  const wedTonight = (st, day) => { for (const id of IDS) { const g = st && st.k[id]; if (g && g.w && g.wd === (day | 0)) return id; } return null; };

  // the closest classmate still free (two grandchildren never marry the same one)
  function best(st, id) {
    const g = st.k[id]; if (!g) return null; const r = g.r || {}, no = new Set();
    for (const o of IDS) if (o !== id && st.k[o] && st.k[o].w) no.add(st.k[o].w);
    let b = null; for (const m of PREF[id] || MATE_IDS) { if (no.has(m)) continue; const v = r[m] | 0; if (!b || v > b.v) b = { id: m, v }; }
    return b;
  }
  const add = (g, m, n) => { if (!g.r) g.r = {}; g.r[m] = Math.min(REL.max, Math.max(0, (g.r[m] | 0) + n)); };
  const due = (st, def, moved) => (moved | 0) > 0 ? Math.max(moved | 0, st.s | 0) + def.after : 0;

  // one day: births, then school / teen closeness. ctx: { moved: { kid0: day, kid1: day }, mul (school favour multiplier), park }
  function step(st, day, ctx) {
    const out = [], mv = (ctx && ctx.moved) || {};
    for (const def of KIDS) { if (st.k[def.id]) continue; const d0 = due(st, def, mv[def.p]); if (d0 && day >= d0) { st.k[def.id] = { b: d0 }; out.push({ ev: 'born', id: def.id, day: d0 }); } }
    for (const id of IDS) {
      const g = st.k[id]; if (!g || g.w || ageOf(g, day) < 1) continue; const s = stageOf(g, day), m = ctx && ctx.mul > 0 ? ctx.mul : 1;
      if (s === 'school' || s === 'helper') { for (const c of MATE_IDS) add(g, c, REL.school * m); add(g, MATE_IDS[Math.floor(hash(day, 17, BY[id].n) * MATE_IDS.length) % MATE_IDS.length], REL.desk * m); }
      else if (s === 'teen') { const b = best(st, id); if (b) { add(g, b.id, REL.teen); if (ctx && ctx.park) add(g, b.id, REL.park); } }
    }
    return out;
  }
  // count every day from the last one counted up to `day` (offline days included); the first call only stamps s / d
  function catchUp(st, day, ctx) {
    const mv = (ctx && ctx.moved) || {}, any = Object.values(mv).some(v => (v | 0) > 0);
    if (!any) { st.d = day; return []; }
    if (!st.s) { st.s = day; st.d = day; return []; } // an old save meets this version: the first grandchild comes 7 days from now
    const out = []; let d = Math.max(st.d | 0, day - CATCHUP);
    while (d < day) { d++; out.push(...step(st, d, ctx)); }
    st.d = day; return out;
  }
  // ready to move out today? (the game finds the house)
  const wantsHouse = (g, day) => !g.mv && stageOf(g, day) === 'teen' && ageOf(g, day) >= KD().TEEN_START + MOVE_AFTER;
  // ready to marry tonight? ctx: { rain, busy (another wedding tonight), lastWed }
  function wedReady(st, id, day, ctx) {
    const g = st.k[id]; if (!g || g.w || !g.mv || ctx.rain || ctx.busy) return null;
    if ((ctx.lastWed | 0) > 0 && day - ctx.lastWed < WED.gap) return null;
    const b = best(st, id); return b && b.v >= REL.close ? b.id : null;
  }
  const lastWed = st => Math.max(0, ...IDS.map(id => (st.k[id] && st.k[id].wd) || 0));
  // how many more houses the grandchildren will soon need (old enough to help = about two weeks before moving out)
  const houseWant = (st, day) => kidsOf(st).filter(g => !g.mv && ageOf(g, day) >= KD().HELPER_START).length;
  // the parent's spouse name is the game's; this is the panel line for one grandchild
  function note(st, id, day, T, parentName) {
    const g = st.k[id], def = BY[id]; if (!g) return '';
    const who = `${parentName || ''}的${def.girl ? '女儿' : '儿子'}`;
    if (married(g, day, T)) return `${who}，和${mateName(g.w)}成家了，住在自己的新房子`;
    if (g.w && g.wd === day) return `${who}，今晚和${mateName(g.w)}办婚礼`;
    if (g.mv) { const b = best(st, id); return `${who}，搬进了自己的新房子` + (b && b.v > 0 ? `，和${mateName(b.id)}${levelOf(b.v)}（${b.v}）` : ''); }
    const b = best(st, id), s = stageOf(g, day);
    return who + ((s === 'school' || s === 'helper' || s === 'teen') && b && b.v > 0 ? `，和${mateName(b.id)}${levelOf(b.v)}（${b.v}）` : '');
  }
  function bornLine(id, parentName, spouseName) { const d = BY[id]; return `${parentName}和${spouseName || '爱人'}家添了个${d.girl ? '女儿' : '儿子'}，起名${d.name}：农场有了第三代`; }

  // ---------- where they are (pure): ctx gives the places ----------
  // ctx: { day, T, rain, park (built), parent: { door, tiles: [{x,y}], bench, coop } (their parents' house), own: same for their
  //        house (once moved), toSchool: [points door->school] (parent house), toPark: [points school door->park gate], parkSpots,
  //        parkIn (bool: today one of the park's kid slots is theirs), partner (married: the spouse comes along) }
  const SPEED = 6, WAKE = 7 * 60, IN_AT = 19 * 60 + 30;
  const SCHOOL = { leave: 8 * 60, back: 14 * 60, park: [15 * 60, 17 * 60 + 20] };
  const lenOf = r => { let n = 0; for (let i = 1; i < r.length; i++) n += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y); return n; };
  function along(r, dist) { let w = Math.max(0, dist);
    for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (w <= d || i === r.length - 1) { const k = d ? Math.min(1, w / d) : 1; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, fx: d ? (b.x - a.x) / d : 0, fy: d ? (b.y - a.y) / d : 1 }; }
      w -= d; }
    const l = r[r.length - 1] || P(0, 0); return { x: l.x, y: l.y, fx: 0, fy: 1 }; }
  // a walk along r taking dur minutes from t0 (null when not under way)
  function walk(r, t0, dur, t) { if (!r || r.length < 2 || t < t0 || t >= t0 + dur) return null; const L = lenOf(r), q = along(r, (t - t0) / dur * L); return Object.assign(q, { moving: true, phase: (t - t0) * SPEED }); }
  const walkDur = r => Math.max(4, Math.min(60, lenOf(r || []) / SPEED)); // a long way is walked a little faster (never more than an hour)
  // hop between spots every seg minutes (walking the first 2), seeded by day + who; work: the pose while standing there
  function potter(spots, seed, day, t0, t, seg, work) {
    if (!spots || !spots.length) return null;
    const i = Math.floor((t - t0) / seg), at = (t - t0) - i * seg, pick = j => spots[(hash(day, seed, j + 3) * spots.length) | 0];
    const a = pick(i - 1), b = pick(i), u = Math.min(1, at / 2), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, mov = u < 1 && d > 1;
    const pose = !mov && work ? work[(hash(day, seed, i + 7) * work.length) | 0] : null;
    return { x: a.x + dx * u, y: a.y + dy * u, fx: mov ? dx / d : (b.fx || 0), fy: mov ? dy / d : (b.fy != null ? b.fy : 1), moving: mov, phase: d * u, pose };
  }
  const yardSpots = H => H ? [P(H.door.x + 10, H.door.y + 2), P(H.door.x - 8, H.door.y + 4), H.bench ? P(H.bench.x, H.bench.y + 2) : P(H.door.x + 4, H.door.y + 8), H.coop ? P(H.coop.x, H.coop.y + 7) : P(H.door.x - 12, H.door.y), P(H.door.x + 2, H.door.y + 10)] : [];
  const tileSpots = H => H && H.tiles ? H.tiles.map(t => ({ x: t.x, y: t.y + 5, fx: 0, fy: -1 })) : [];
  // -> null (inside / away) or { x, y, fx, fy, moving, phase, pose, where, cut, cradle }
  function placeOf(g, ctx) {
    const t = tod(ctx.T), day = ctx.day, s = stageOf(g, day), seed = 11 + BY[g.id].n * 5, P0 = ctx.parent, OWN = ctx.own;
    const done = r => r ? Object.assign(r, { cut: (s === 'teen' ? 3 : 6) }) : null;
    if (g.mv && OWN) { // grown up, living in their own house
      if (g.w && g.wd === day && t >= WED.from - 30 && t < WED.to) return done({ x: OWN.door.x + (ctx.partner ? 2 : -2), y: OWN.door.y + 3, fx: 0, fy: 1, moving: false, phase: 0, where: 'wed', wed: true });
      if (t < WAKE || t >= IN_AT) return null;
      if (ctx.rain) return t >= 9 * 60 && t < 9 * 60 + 20 ? done({ x: OWN.door.x + 4, y: OWN.door.y + 2, fx: 0, fy: 1, moving: false, phase: 0, where: 'yard' }) : null;
      if (t < 17 * 60 + 30) return done(Object.assign(potter(tileSpots(OWN), seed + (ctx.partner ? 2 : 0), day, WAKE, t, 9, ['water', 'pull']), { where: 'tiles' }));
      return done(Object.assign(potter(yardSpots(OWN), seed + (ctx.partner ? 2 : 0), day, 17 * 60 + 30, t, 14), { where: 'yard' }));
    }
    if (!P0) return null;
    if (s === 'baby') { const side = P0.bench ? (Math.sign(P0.bench.x - P0.door.x) || 1) : 1; // the cradle on the other side of the door from the bench
      return t >= WAKE && t < 18 * 60 + 30 && !ctx.rain ? done({ x: P0.door.x - side * (8 + (BY[g.id].n > 1 ? 6 : 0)), y: P0.door.y + 1, fx: 0, fy: 1, moving: false, phase: 0, where: 'cradle', cradle: true }) : null; }
    if (s === 'play') { if (t < WAKE + 30 || t >= 18 * 60 + 30 || ctx.rain) return null; return done(Object.assign(potter(yardSpots(P0), seed, day, WAKE, t, 10), { where: 'yard' })); }
    if (s === 'school' || s === 'helper') {
      const r = ctx.toSchool, dur = walkDur(r), off = BY[g.id].n * 2, go0 = SCHOOL.leave - dur + off;
      if (t < WAKE || t >= IN_AT) return null;
      let p = walk(r, go0, dur, t); if (p) return done(Object.assign(p, { where: 'school-go', school: true }));
      if (t >= go0 && t < SCHOOL.back + off) return null; // in class
      const pr = ctx.toPark, parkIn = !!(ctx.park && ctx.parkIn && !ctx.rain && pr && pr.length > 1);
      if (parkIn) {
        const pd = walkDur(pr), p0 = SCHOOL.back + off + 40; // a snack at the school gate first, then the park
        if (t < p0) return null;
        p = walk(pr, p0, pd, t); if (p) return done(Object.assign(p, { where: 'park-go', school: true }));
        const pIn = p0 + pd, pOut = SCHOOL.park[1] + off;
        if (t < pOut) { const q = potter(ctx.parkSpots, seed + 3, day, pIn, t, 12); if (q) { q.x += (BY[g.id].n % 2 ? 2.5 : -2.5); q.y += BY[g.id].n > 1 ? 2 : 0; } return done(Object.assign(q, { where: 'park' })); } // two never stand on one spot
        const back = pr.slice().reverse().concat(r.slice().reverse().slice(1)), bd = walkDur(back);
        p = walk(back, pOut, bd, t); if (p) return done(Object.assign(p, { where: 'home-walk', school: true }));
        if (t < pOut + bd) return null;
        return t < 18 * 60 + 30 ? done(Object.assign(potter(yardSpots(P0), seed, day, pOut + bd, t, 10), { where: 'yard' })) : null;
      }
      const back = r.slice().reverse(); p = walk(back, SCHOOL.back + off, dur, t); if (p) return done(Object.assign(p, { where: 'home-walk', school: true }));
      if (t < SCHOOL.back + off + dur) return null;
      if (s === 'helper' && t < 17 * 60) return done(Object.assign(potter(tileSpots(P0), seed, day, SCHOOL.back + off + dur, t, 10, ['pull', 'water']), { where: 'tiles' }));
      return t < 18 * 60 + 30 && !ctx.rain ? done(Object.assign(potter(yardSpots(P0), seed, day, SCHOOL.back, t, 10), { where: 'yard' })) : null;
    }
    // a teen still at home: helps on the parents' six tiles, then the yard
    if (t < WAKE + 30 || t >= IN_AT || ctx.rain) return null;
    if (t < 17 * 60 + 30) return done(Object.assign(potter(tileSpots(P0), seed, day, WAKE + 30, t, 9, ['water', 'pull']), { where: 'tiles' }));
    return done(Object.assign(potter(yardSpots(P0), seed, day, 17 * 60 + 30, t, 12), { where: 'yard' }));
  }
  // which grandchildren take a park slot today (school age, fine weather): at most `slots`, a different order each day
  function parkKids(st, day, slots, rain) {
    if (rain || !(slots > 0)) return [];
    const list = kidsOf(st).filter(g => !g.mv && (stageOf(g, day) === 'school' || stageOf(g, day) === 'helper') && hash(day, 29, g.n) < 0.7);
    return list.sort((a, b) => hash(day, 31, a.n) - hash(day, 31, b.n)).slice(0, slots).map(g => g.id);
  }

  const api = { KIDS, IDS, BY, MAX, MATES, MATE_IDS, MATE, PREF, REL, MOVE_AFTER, WED, CATCHUP, LEVELS, levelOf, mateName, empty, valid, kidsOf, ageOf, stageOf,
    married, wedTonight, best, step, catchUp, wantsHouse, wedReady, lastWed, houseWant, note, bornLine, SCHOOL, SPEED, lenOf, along, walk, walkDur, potter,
    yardSpots, tileSpots, placeOf, parkKids, due };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFGen3 = api;
})(typeof window !== 'undefined' ? window : globalThis);
