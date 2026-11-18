// 像素农场 · 孩子成长与玩耍（v5.4.3，第 7 阶段）：纯函数，浏览器里是 window.PFKids，Node 里可以直接 require 做单元测试。
// Growth is slower than v5.0: baby → play (farm only) → school (08:00–14:00 off the east road) → helper (today's child chores,
// still school in the morning) → teen. Old saves never lose work a child already does: a working child is floored at helper
// (or teen). Play / after-school kids wander to pets, pens and the pond; butterflies go through window.__insects when another
// branch adds them, and the kid just skips around the yard if none are there yet.
'use strict';
(function (root) {
  const BABY_DAYS = 5, PLAY_DAYS = 12, SCHOOL_DAYS = 12, HELPER_DAYS = 14;
  const PLAY_START = BABY_DAYS;                                 // age 5
  const SCHOOL_START = PLAY_START + PLAY_DAYS;                  // age 17
  const HELPER_START = SCHOOL_START + SCHOOL_DAYS;              // age 29
  const TEEN_START = HELPER_START + HELPER_DAYS;                // age 43
  const SCHOOL_LEAVE = 8 * 60, SCHOOL_RETURN = 14 * 60;         // leave around 08:00, back around 14:00
  const SCHOOL_JITTER = 8;                                      // a few minutes so two children do not walk in lockstep
  const IDLE_LIMIT = 8;                                         // game minutes: a play kid should not stand idle longer than this
  const STAGE_ORDER = ['baby', 'play', 'school', 'helper', 'teen'];
  const STAGE_LABEL = { baby: '宝宝', play: '玩耍', school: '上学', helper: '帮工', teen: '少年' };
  const STAGE_HINT = { baby: '在家', play: '只在农场玩', school: '上学，放学后玩，偶尔喂动物', helper: '干轻活，上午仍可上学', teen: '田里的活都能干' };
  const SCHOOL_FEED = ['feed', 'trough'];                       // after school, before helper: feed animals, no field work
  // how many days into the current stage (1-based) and how long the stage lasts (teen has no end)
  const STAGE_SPAN = {
    baby: { start: 0, days: BABY_DAYS },
    play: { start: PLAY_START, days: PLAY_DAYS },
    school: { start: SCHOOL_START, days: SCHOOL_DAYS },
    helper: { start: HELPER_START, days: HELPER_DAYS },
    teen: { start: TEEN_START, days: 0 }
  };
  const ageOf = (kid, day) => (day | 0) - (kid.born | 0);
  function rawStage(age) {
    if (age < PLAY_START) return 'baby';
    if (age < SCHOOL_START) return 'play';
    if (age < HELPER_START) return 'school';
    if (age < TEEN_START) return 'helper';
    return 'teen';
  }
  const later = (a, b) => STAGE_ORDER.indexOf(a) >= STAGE_ORDER.indexOf(b) ? a : b;
  // append-only floor on the kid object (v10-safe). teen stays teen; a child who already worked stays at least helper.
  function applyFloor(kid, day, ev) {
    if (!kid || kid.floor) return kid;
    const age = ageOf(kid, day);
    const old = age < 5 ? 'baby' : age < 14 ? 'child' : 'teen'; // v5.0 table, used only to read an old save
    if (old === 'teen') kid.floor = 'teen';
    else if (old === 'child' && ev && ev.worked) kid.floor = 'helper';
    return kid;
  }
  function stageOf(kid, day) {
    const raw = rawStage(ageOf(kid, day));
    return kid && kid.floor && STAGE_ORDER.includes(kid.floor) ? later(raw, kid.floor) : raw;
  }
  function memberWorked(m) {
    if (!m) return false;
    if ((m.gathered | 0) > 0) return true;
    const basket = m.crops || m.basket;
    if (basket && basket.length) return true;
    const bag = m.bag;
    if (bag && typeof bag === 'object') for (const k in bag) if ((bag[k] | 0) > 0) return true;
    return false;
  }
  function migrateFamily(fam, day, members) {
    if (!fam || !Array.isArray(fam.kids)) return fam;
    if (fam.kidGrowth) return fam; // already on the v5.4.3 table; do not re-read the old ages
    const list = members || [];
    for (const k of fam.kids) {
      const m = list.find(q => q && q.id === k.id);
      applyFloor(k, day, { worked: memberWorked(m) });
    }
    fam.kidGrowth = 1;
    return fam;
  }
  // role used by the task board / sprites / speeds: helper keeps today's 'child' role so existing chore lists stay put
  function workRole(stage) {
    if (stage === 'helper') return 'child';
    if (stage === 'teen' || stage === 'play' || stage === 'school') return stage;
    return null;
  }
  function workers(fam, day, workerFn) {
    if (typeof workerFn === 'function') return workerFn(fam, day);
    const out = [];
    if (fam && fam.moved) out.push({ id: 'partner', name: '阿禾', role: 'partner' });
    if (fam && fam.kids) for (const k of fam.kids) {
      const st = stageOf(k, day), role = workRole(st);
      if (role) out.push({ id: k.id, name: k.name, role });
    }
    return out;
  }
  const goesToSchool = stage => stage === 'school' || stage === 'helper';
  // a stable few-minutes offset per child, so siblings do not leave or come back in the same minute
  function schoolOffset(kid) {
    const n = (kid && kid.id === 'kid1') ? 1 : 0;
    return n * SCHOOL_JITTER - Math.floor(SCHOOL_JITTER / 2);
  }
  const leaveAt = kid => SCHOOL_LEAVE + schoolOffset(kid);
  const returnAt = kid => SCHOOL_RETURN + schoolOffset(kid);
  function atSchool(kid, stage, T) {
    if (!goesToSchool(stage)) return false;
    const t = ((T % 1440) + 1440) % 1440;
    return t >= leaveAt(kid) && t < returnAt(kid);
  }
  function panelText(kid, day) {
    const st = stageOf(kid, day), age = Math.max(0, ageOf(kid, day)), span = STAGE_SPAN[st];
    const label = STAGE_LABEL[st] || st;
    // a floored old-save child may be in helper/teen earlier than the new table; don't pretend they are on day 1 of 14
    if (age < span.start) return `${label} · 出生第 ${age} 天`;
    if (st === 'teen') return `${label} · 第 ${age - span.start + 1} 天`;
    const dayIn = Math.min(span.days, Math.max(1, age - span.start + 1));
    return `${label} · 第 ${dayIn}/${span.days} 天`;
  }
  function panelShort(kid, day) {
    const st = stageOf(kid, day), age = Math.max(0, ageOf(kid, day)), span = STAGE_SPAN[st];
    const label = STAGE_LABEL[st] || st;
    if (age < span.start || st === 'teen') return label;
    return `${label} ${Math.min(span.days, Math.max(1, age - span.start + 1))}/${span.days}`;
  }
  function stageChangeLog(name, st) {
    if (st === 'play') return `${name}会走路了，可以在院子里玩了`;
    if (st === 'school') return `${name}到了上学的年纪，每天早上出门读书`;
    if (st === 'helper') return `${name}开始帮忙干活了，能喂鸡、摸摸动物、摘果子`;
    if (st === 'teen') return `${name}长成了少年，田里的活都能干了`;
    return '';
  }
  // ---------- insects: another branch adds the real ones; we only look them up ----------
  function insectsApi() {
    const g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    return (g && (g.__insects || g.PFInsects)) || null;
  }
  function nearbyInsect(x, y, kind) {
    const api = insectsApi();
    if (!api) return null;
    try {
      if (typeof api.nearest === 'function') return api.nearest(x, y, kind || 'butterfly') || null;
      if (typeof api.nearby === 'function') return api.nearby(x, y, kind || 'butterfly') || null;
      const list = Array.isArray(api) ? api : (api.list || api.bugs || api.items);
      if (!list || !list.length) return null;
      let best = null, bd = 56;
      for (const b of list) {
        if (!b) continue;
        if (kind && b.kind && b.kind !== kind && b.type && b.type !== kind) continue;
        const d = Math.hypot((b.x || 0) - x, (b.y || 0) - y);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    } catch (e) { return null; }
  }
  function inPlayBounds(x, y, ctx) {
    if (!ctx || !ctx.areaAt) return true;
    const a = ctx.areaAt(x, y);
    if (a === 'home') return true;
    const open = ctx.regions || [];
    return !!(a && open.includes(a));
  }
  function pickAway(list, lastKind, rng) {
    if (!list.length) return null;
    const r = rng || Math.random;
    const fresh = lastKind ? list.filter(t => t.kind !== lastKind) : list;
    const pool = fresh.length ? fresh : list;
    return pool[Math.floor(r() * pool.length)];
  }
  // ctx: { actor, day, t, kid, pets, animals, pens, pond, pondFish, regions, areaAt, rng, lastKind }
  // pets: [{ kind, name, x, y }], animals grouped by pen via pens: [{ id, name, door, kinds: ['chicken'|...] }]
  // pond: { x, y, rx, ry }, door: { x, y }
  function playTargets(ctx) {
    const out = [], A = ctx.actor || { x: 0, y: 0 }, door = ctx.door || { x: 36, y: 40 };
    const pond = ctx.pond || { x: 34, y: 100, rx: 19, ry: 12 };
    if (ctx.pets) for (const p of ctx.pets) {
      if (p == null || p.x == null) continue;
      if (!inPlayBounds(p.x, p.y, ctx)) continue;
      const name = p.name || (p.kind === 'dog' ? '小狗' : '小猫');
      out.push({ kind: 'play-pet', label: `正在摸摸${name}`, at: { x: p.x - 6, y: p.y + 2 }, pet: p, dur: 5, pose: 'pull' });
    }
    if (ctx.pens) for (const pen of ctx.pens) {
      if (!pen || !pen.door) continue;
      if (!inPlayBounds(pen.door.x, pen.door.y, ctx)) continue;
      const who = (pen.kinds && pen.kinds[0]) ? ({ chicken: '小鸡', sheep: '小羊', cow: '牛', pig: '小猪' }[pen.kinds[0]] || '动物') : '动物';
      out.push({ kind: 'play-watch', label: `在${pen.name || '棚子'}边上看${who}`, at: { x: pen.door.x + 8, y: pen.door.y + 6 }, dur: 14, rest: true });
    }
    const pondAt = { x: pond.x + (pond.rx || 19) + 4, y: pond.y + 2 };
    if (!ctx.areaAt || inPlayBounds(pondAt.x, pondAt.y, ctx)) {
      const watching = ctx.pondFish > 0;
      out.push({ kind: 'play-pond', label: watching ? '蹲在池塘边看鱼' : '在池塘边玩', at: pondAt, dur: watching ? 16 : 12, pose: 'pull' });
    }
    const bug = nearbyInsect(A.x, A.y, 'butterfly') || nearbyInsect(A.x, A.y);
    if (bug && bug.x != null && inPlayBounds(bug.x, bug.y, ctx)) {
      out.push({ kind: 'play-chase', label: '追蝴蝶', at: { x: bug.x, y: bug.y }, dur: 8, insect: bug });
    } else {
      const skip = { x: door.x + 18 + (ctx.rng ? (ctx.rng() * 24 - 8) : 10), y: door.y + 16 + (ctx.rng ? (ctx.rng() * 16 - 4) : 8) };
      out.push({ kind: 'play-skip', label: '在院子里跑来跑去', at: skip, dur: 7 });
    }
    // v5.5.0: a playground plot (滑梯 / 沙坑 / 秋千) — ctx.playSpots: [{ kind, x, y, stand: { x, y } }]
    const PLAY_AT = { slide: ['play-slide', '在乐园滑滑梯', 10, null], sandbox: ['play-sandbox', '在沙坑里堆沙堡', 16, 'pull'], swing: ['play-swing', '在乐园荡秋千', 12, null] };
    if (ctx.playSpots) for (const sp of ctx.playSpots) { const d = PLAY_AT[sp.kind]; if (!d || !sp.stand) continue;
      if (!inPlayBounds(sp.stand.x, sp.stand.y, ctx)) continue;
      out.push({ kind: d[0], label: d[1], at: { x: sp.stand.x, y: sp.stand.y }, dur: d[2], pose: d[3] || undefined, spot: sp }); }
    out.push({ kind: 'play-yard', label: '在房子旁边玩', at: { x: door.x + 14, y: door.y + 10 }, dur: 12 });
    return out.filter(t => t.at && (t.kind === 'play-yard' || t.kind === 'play-skip' || t.kind === 'play-pond' || inPlayBounds(t.at.x, t.at.y, ctx)));
  }
  function pickPlay(ctx) {
    const t = pickAway(playTargets(ctx), ctx && ctx.lastKind, ctx && ctx.rng);
    if (!t) return null;
    return {
      kind: t.kind, label: t.label, to: t.at, dur: t.dur, pose: t.pose, rest: t.rest, pet: t.pet, insect: t.insect, play: true
    };
  }
  // east-road school walk: follow the existing east route, then step off the current map's east edge (phase 7 has no town yet)
  function schoolExit(ctx) {
    if (ctx && ctx.school) return ctx.school; // v5.8.0: the game passes town.js's route (the road, the town gate, the school)
    const world = ctx.world || { x1: 352 };
    const gate = { x: 216, y: 66 };
    const edge = { x: (world.x1 != null ? world.x1 : 352) + 12, y: 66 };
    const eastOpen = ctx.regions && ctx.regions.includes('east');
    const to = eastOpen ? edge : { x: gate.x + 8, y: gate.y };
    const via = [
      { x: 158, y: 54 }, { x: 176, y: 54 }, { x: 176, y: 66 }, { x: 216, y: 66 }
    ];
    if (eastOpen) via.push({ x: 280, y: 66 }, { x: Math.min(to.x, 340), y: 66 }, to);
    else via.push(to);
    return { to, via };
  }
  // returns a task, or null to let the regular board run (helper / teen work, or a school kid trying a feed job)
  function pickTask(ctx) {
    if (!ctx || !ctx.kid || !ctx.actor) return null;
    const st = stageOf(ctx.kid, ctx.day), T = ((ctx.t % 1440) + 1440) % 1440, A = ctx.actor;
    if (st === 'baby') return { kind: 'home', label: '在家', to: ctx.door || { x: A.x, y: A.y }, dur: 30, stayHome: true };
    // already off the map at school: stay put until it is time to walk back
    if (A.away === 'school') {
      if (T >= returnAt(ctx.kid) || T < leaveAt(ctx.kid) - 30) {
        const ex = schoolExit(ctx);
        return { kind: 'school-back', label: '放学回家', to: ctx.door ? { x: ctx.door.x + 14, y: ctx.door.y + 10 } : ex.to, via: ex.via.slice().reverse(), keepVia: true, dur: 4, comeBack: true };
      }
      return { kind: 'school', label: '在学校上课', to: { x: A.x, y: A.y }, dur: Math.max(2, returnAt(ctx.kid) - T), away: true };
    }
    if (goesToSchool(st) && atSchool(ctx.kid, st, T)) {
      const ex = schoolExit(ctx);
      return { kind: 'school-go', label: '去上学', to: ex.to, via: ex.via, keepVia: true, dur: 3, leave: true };
    }
    if (st === 'play') return pickPlay(ctx);
    if (st === 'school') {
      // after school (or before 8): mostly play; sometimes fall through so the board can post a feed job
      const r = ctx.rng ? ctx.rng() : Math.random();
      if (r < 0.18 && ctx.allowFeed !== false) return null;
      return pickPlay(ctx);
    }
    // helper / teen: live work takes priority; the game's idle hook may call pickPlay later
    return null;
  }
  const api = {
    BABY_DAYS, PLAY_DAYS, SCHOOL_DAYS, HELPER_DAYS, PLAY_START, SCHOOL_START, HELPER_START, TEEN_START,
    SCHOOL_LEAVE, SCHOOL_RETURN, IDLE_LIMIT, STAGE_ORDER, STAGE_LABEL, STAGE_HINT, SCHOOL_FEED, STAGE_SPAN,
    ageOf, rawStage, stageOf, applyFloor, memberWorked, migrateFamily, workRole, workers,
    goesToSchool, schoolOffset, leaveAt, returnAt, atSchool, panelText, panelShort, stageChangeLog,
    insectsApi, nearbyInsect, inPlayBounds, playTargets, pickPlay, pickTask, schoolExit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFKids = api;
})(typeof window !== 'undefined' ? window : globalThis);
