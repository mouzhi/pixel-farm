// 像素农场 · 第 8 阶段：田边浇水器、加工坊和小麦、水车和电网、养蜂、第二套棚舍、边牧赶羊（纯数据和纯函数；浏览器里是 window.PFWorks，Node 里可以 require 做单元测试）
// Everything here is "buy it once, then it runs by itself": the family installs and tends it, the player only decides what to build.
// The art (models, lamps, bees, sprinkler spray) is works-art.js; the game wiring (tasks, nights, saving) is in game.js.
'use strict';
(function (root) {
  const PL = root.PFPlots || (typeof require === 'function' ? require('./plots.js') : null);
  const WD = root.PFWorld || (typeof require === 'function' ? require('./world.js') : null);
  const AN = root.PFAnimals || (typeof require === 'function' ? require('./animals.js') : null);
  const TILE = 8;
  const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
  const P = (x, y) => ({ x, y });
  const ownedSorted = (plots, mod) => Object.keys(plots || {}).filter(id => plots[id].mod === mod && PL.plot(id))
    .sort((a, b) => (plots[a].day - plots[b].day) || (PL.PLOT_IDS.indexOf(a) - PL.PLOT_IDS.indexOf(b)));

  // ---------- 田边浇水器 ----------
  // A sprinkler stands just outside a field and waters every tile whose centre is within `reach` (both axes): on a field
  // edge between two columns that is 4 columns x 2 rows, "一排 8 格". It needs no power, no winding and never breaks.
  const SPRINKLER = { max: 16, reach: 16, off: 3, cost: 800, wood: 20 };
  const reachOf = r => (r > 0 ? r : SPRINKLER.reach);
  const covers = (s, t, reach) => { const d = reachOf(reach); return Math.abs(t.x - s.x) <= d && Math.abs(t.y - s.y) <= d; };
  // where a family member may set one down: the edge of a field (between two columns or two rows, 3 units out)
  function edgeSpots(fd) {
    const out = [], x0 = fd.c0 * TILE, y0 = fd.r0 * TILE, x1 = (fd.c0 + fd.cols) * TILE, y1 = (fd.r0 + fd.rows) * TILE, o = SPRINKLER.off;
    for (let k = 1; k < fd.cols; k++) out.push(P(x0 + k * TILE, y0 - o), P(x0 + k * TILE, y1 + o));
    for (let k = 1; k < fd.rows; k++) out.push(P(x0 - o, y0 + k * TILE), P(x1 + o, y0 + k * TILE));
    for (const s of out) s.f = fd.id;
    return out;
  }
  // tiles: [{ x, y, f, open }] (tile centres), fields: [{ id, c0, r0, cols, rows }] in priority order (home first),
  // placed: [{ x, y }]. -> the next spot that waters the most open tiles nothing waters yet, or null when all are covered
  function nextSpot(fields, tiles, placed, reach) {
    const open = tiles.filter(t => t.open && !placed.some(s => covers(s, t, reach)));
    if (!open.length) return null;
    // field by field in priority order (home first, so the field the player watches is done first), the spot that waters most
    for (const fd of fields) { const mine = open.filter(t => t.f === fd.id); if (!mine.length) continue;
      let best = null, bs = 0;
      for (const s of edgeSpots(fd)) { if (placed.some(q => Math.hypot(q.x - s.x, q.y - s.y) < 6)) continue;
        const n = mine.filter(t => covers(s, t, reach)).length, sc = n * 100 - (s.y * 0.001 + s.x * 0.0001);
        if (n > 0 && sc > bs) { bs = sc; best = s; } }
      if (best) return { x: best.x, y: best.y, f: best.f }; }
    return null;
  }
  // the player moves one: anywhere beside a field (not on a tile), as long as it reaches at least one tile
  function spotOk(x, y, tiles, reach) {
    if (tiles.some(t => Math.abs(t.x - x) < 5 && Math.abs(t.y - y) < 5)) return { ok: false, why: '浇水器要放在田边，不能压在田里' };
    if (!tiles.some(t => t.open && covers({ x, y }, t, reach))) return { ok: false, why: '离田太远了，浇不到' };
    return { ok: true };
  }
  const coveredBy = (sprinklers, tiles, reach) => sprinklers.map(s => tiles.filter(t => covers(s, t, reach)));
  // shop gate: the sprinkler can (花洒水壶) is bought, or three people work (farmer + 阿禾 + a child who helps)
  const sprinklerGate = (up, workers) => ((up && up.can) | 0) >= 4 || workers >= 3;

  // ---------- 加工坊和小麦 ----------
  // A family member carries raw goods in; the shop works through them by itself; someone takes the products to the stall.
  // need: inputs per batch, mins: game minutes per batch, inCap / outCap: what the shop holds (short queues on purpose).
  const WORKS = {
    mill: { name: '磨坊', inputs: ['wheat'], need: 2, out: 'flour', mins: 120, inCap: 8, outCap: 6, feed: 2, cost: 5000, wood: 120 },
    jam: { name: '果酱铺', inputs: ['strawberry', 'apple', 'orange'], need: 2, out: 'jam', mins: 180, inCap: 8, outCap: 6, cost: 3500, wood: 80 },
    cheese: { name: '奶酪坊', inputs: ['milk'], need: 2, out: 'cheese', mins: 240, inCap: 6, outCap: 4, cost: 4500, wood: 100 },
    pie: { name: '苹果派坊', inputs: ['flour', 'apple'], need: 3, out: 'apple_pie', mins: 180, inCap: 8, outCap: 4, cost: 4000, wood: 80, recipe: [{ id: 'flour', n: 1 }, { id: 'apple', n: 2 }], lib: 1 }, // v5.10.9: unlocked at the 书屋
  };
  const WORK_IDS = Object.keys(WORKS);
  // products (fixed prices; the stall buys them like vegetables)
  const PRODUCTS = { flour: { name: '面粉', price: 60 }, jam: { name: '果酱', price: 80 }, cheese: { name: '奶酪', price: 130 }, honey: { name: '蜂蜜', price: 40 }, apple_pie: { name: '苹果派', price: 140 } };
  const PRODUCT_IDS = Object.keys(PRODUCTS);
  const WHEAT_WANT = 10; // the mill's appetite: growing + carried + waiting wheat below this, and the family plants wheat
  // one step of a shop: a batch finishes, the next starts. -> 1 when a batch finished in this step
  function workStep(w, def, dm, speed) {
    let made = 0; const rate = (speed > 0 ? speed : 1);
    if (w.left > 0) { w.left -= dm * rate; if (w.left <= 0) { w.left = 0; w.ready = Math.min(def.outCap, w.ready + 1); made = 1; } }
    if (!(w.left > 0) && w.inp >= def.need && w.ready < def.outCap) { w.inp -= def.need; w.left = def.mins; }
    return made;
  }
  // workshop yards: every plot set to 工坊院 has three building slots (a row, or a column on a tall narrow plot)
  const YARD_SLOTS = 3;
  function slotPos(id, i) {
    const r = PL.plot(id).rect, w = r[2] - r[0], h = r[3] - r[1];
    return w >= h ? P(Math.round(r[0] + w * (i + 0.5) / YARD_SLOTS), Math.round(r[1] + h * 0.5 + 2)) : P(Math.round((r[0] + r[2]) / 2 + 2 + (w >= 40 ? (i % 2 ? 9 : -9) : 0)), Math.round(r[1] + 10 + (h - 14) * (i + 0.5) / YARD_SLOTS)); // v5.11.0.9: the taller workshops zigzag in a column so a roof never hides the door behind it
  }
  // v5.7.0: a workshop the player moved keeps its yard and slot (they still count as taken) and stands at its own x, y
  const workPos = w => (typeof w.x === 'number' && typeof w.y === 'number' ? P(w.x, w.y) : slotPos(w.at, w.slot));
  // works: { id: { at, slot, ... } } -> the first free slot, or null
  function freeSlot(plots, works) {
    for (const id of ownedSorted(plots, 'workshop')) for (let i = 0; i < YARD_SLOTS; i++)
      if (!Object.values(works || {}).some(w => w && w.at === id && w.slot === i)) return { at: id, slot: i };
    return null;
  }
  // v5.10.12: workshops move between 工坊院 plots and a 工坊院 can be re-zoned.
  // the first free slot in one yard (skip: the workshop being moved does not take its own slot), or -1
  function slotIn(works, at, skip) {
    for (let i = 0; i < YARD_SLOTS; i++) if (!WORK_IDS.some(k => k !== skip && works && works[k] && works[k].at === at && works[k].slot === i)) return i;
    return -1;
  }
  // a 工坊院 is re-zoned: where each of its workshops goes -> [{ id, to, slot }] (to null: into the storehouse until a yard is
  // free). Only other yards (bought order); production state stays with the workshop (the caller keeps inp / left / ready).
  function evacuate(plots, works, from) {
    const out = [], tmp = {}; for (const k of WORK_IDS) if (works && works[k]) tmp[k] = Object.assign({}, works[k]);
    for (const k of WORK_IDS) { const w = tmp[k]; if (!w || w.at !== from) continue; w.at = null; let to = null, slot = -1;
      for (const id of ownedSorted(plots, 'workshop')) { if (id === from) continue; const i = slotIn(tmp, id, k); if (i >= 0) { to = id; slot = i; break; } }
      if (to) { w.at = to; w.slot = slot; } out.push({ id: k, to, slot: to ? slot : 0 }); }
    return out;
  }
  // workshops waiting in the storehouse (at: null) go back up in the first free yard slots -> [{ id, to, slot }]
  function restock(plots, works) {
    const out = [], tmp = {}; for (const k of WORK_IDS) if (works && works[k]) tmp[k] = Object.assign({}, works[k]);
    for (const k of WORK_IDS) { const w = tmp[k]; if (!w || w.at) continue; const sl = freeSlot(plots, tmp); if (!sl) break; w.at = sl.at; w.slot = sl.slot; out.push({ id: k, to: sl.at, slot: sl.slot }); }
    return out;
  }
  const hasOrchard = (plots, regions) => (regions || []).includes('orchard') || ownedSorted(plots, 'orchard').length > 0;
  // why a workshop cannot be built yet (null: it can). ctx: { plots, regions, works, cows, fruit }
  function workGate(id, ctx) {
    if (id === 'pie' && !ctx.library) return '先在镇上盖好书屋，才能学到苹果派的配方';
    if (!freeSlot(ctx.plots, ctx.works)) return ownedSorted(ctx.plots, 'workshop').length ? '工坊院已经盖满了，再把一块新地选成「工坊院」' : '先把一块新地选成「工坊院」';
    if (id === 'jam' && !(hasOrchard(ctx.plots, ctx.regions) && ctx.fruit)) return '先有果园，种过草莓或摘过水果';
    if (id === 'cheese' && !(ctx.cows > 0)) return '先养至少 1 头牛';
    return null;
  }

  // ---------- 水车和电网 ----------
  // A repaired wheel on a 动力坝 plot powers everything within POWER.range: no wires, no load. Wheels are repaired in the
  // order their plots were bought. Lamps go up once the first wheel turns; a lamp out of range stays dark.
  const POWER = { range: 400 };
  const damSites = plots => ownedSorted(plots, 'dam').filter(id => PL.plot(id).wheel);
  const wheelsOf = (plots, n) => damSites(plots).slice(0, n | 0).map(id => Object.assign({ plot: id }, PL.plot(id).wheel));
  const powered = (x, y, wheels) => wheels.some(w => Math.hypot(w.x - x, w.y - y) <= POWER.range);
  const wheelGate = (plots, have) => damSites(plots).length > (have | 0) ? null : (have ? '再把一块河边地选成「动力坝」' : '先把一块河边地选成「动力坝」');
  // lamps: the home yard and the old orchard, a lamp by each bought plot's gate, one in front of each workshop
  const HOME_LAMPS = [P(58, 48), P(140, 46), P(146, 104), P(92, 98), P(-70, -46)];
  function lampSpots(plots, works) {
    const out = HOME_LAMPS.map((p, i) => ({ id: 'h' + i, x: p.x, y: p.y }));
    for (const id of Object.keys(plots || {})) { const p = PL.plot(id); if (!p || p.special) continue;
      const r = p.rect, g = p.gate, inX = g.x <= r[0] + 1 ? 6 : g.x >= r[2] - 1 ? -6 : 0, inY = g.y <= r[1] + 1 ? 6 : g.y >= r[3] - 1 ? -6 : 0;
      out.push({ id: 'p' + id, x: g.x + inX + (inY ? 9 : 0), y: g.y + inY + (inX ? 9 : 0) }); }
    for (const wid of WORK_IDS) { const w = works && works[wid]; if (!w || !w.at) continue; const s = workPos(w); out.push({ id: 'w' + wid, x: s.x + 12, y: s.y + 10 }); }
    return out;
  }
  const LAMP_R = 36, LAMP_FRUIT = 0.35; // fruit trees this close to a lit lamp ripen a little sooner (35% chance a night of one extra day)

  // ---------- 养蜂 ----------
  const HIVE = { max: 6, orchardMax: 2, every: 2, readyCap: 2, extra: 0.35, cost: 800, wood: 20 };
  const ORCHARD_HIVES = [P(-62, -64), P(-50, -64)];
  // slots: the first 花甸 plot holds six in two rows; the old orchard holds two. A hive keeps its slot ({ at, s }) once set down.
  function hiveSlots(plots, regions) {
    const out = [];
    for (const id of ownedSorted(plots, 'meadow')) { const r = PL.plot(id).rect, w = r[2] - r[0], h = r[3] - r[1];
      for (let i = 0; i < 6; i++) out.push({ at: id, s: i, x: Math.round(r[0] + w * (0.2 + 0.3 * (i % 3))), y: Math.round(r[1] + h * (i < 3 ? 0.35 : 0.68)) });
      break; }
    if ((regions || []).includes('orchard')) ORCHARD_HIVES.forEach((p, i) => out.push({ at: 'orchard', s: i, x: p.x, y: p.y }));
    return out;
  }
  // where hive h stands now (null: its plot was re-zoned, so it waits in the shed until a slot is free again)
  // v5.7.0: a hive the player moved keeps its slot (so the count stays right) and stands at its own x, y
  const hivePos = (h, plots, regions) => { const q = hiveSlots(plots, regions).find(q => q.at === h.at && q.s === h.s); if (!q) return null;
    return typeof h.x === 'number' && typeof h.y === 'number' ? Object.assign({}, q, { x: h.x, y: h.y }) : q; };
  // the next free slot for a new (or homeless) hive: the meadow first, then the orchard
  const hiveFree = (plots, regions, hives) => hiveSlots(plots, regions).find(q => !(hives || []).some(h => h.at === q.at && h.s === q.s)) || null;
  // total: six with a 花甸, two in the orchard without one ("每块花甸 4–6 箱，或老果园 2 箱")
  const hiveCap = (plots, regions) => ownedSorted(plots, 'meadow').length ? HIVE.max : (regions || []).includes('orchard') ? HIVE.orchardMax : 0;
  const hiveGate = (plots, regions, have, hives) => { const cap = hiveCap(plots, regions); if (!cap) return '先有花甸（新地选「花甸」）或果园坡';
    if ((have | 0) >= cap || (hives && !hiveFree(plots, regions, hives))) return cap === HIVE.max ? '蜂箱放满了' : '果园坡最多放 2 箱，再要就把一块新地选成「花甸」'; return null; };
  // one night: every hive counts down; a full hive waits (no spoiling). rnd: the farm's stream. -> honey jars made
  function hiveNight(hives, rnd) {
    let made = 0;
    for (const h of hives) { h.cd = (h.cd | 0) - 1; if (h.cd > 0) continue; h.cd = HIVE.every;
      const n = Math.min(HIVE.readyCap - (h.ready | 0), 1 + (rnd() < HIVE.extra ? 1 : 0)); if (n > 0) { h.ready = (h.ready | 0) + n; made += n; } }
    return made;
  }

  // ---------- 第二套鸡舍、猪圈、羊圈、牛棚 ----------
  // Built on a plot set to 牧场 (the first one bought hosts all four, in its own quarters). Same capacity as the first ones;
  // animals 7-12 / 4-6 move in there. Bought in the shop like the first ones.
  const PEN2 = {
    coop2: { base: 'coop', kind: 'chicken', name: '第二鸡舍', cost: 600, wood: 40 },
    sty2: { base: 'sty', kind: 'pig', name: '第二猪圈', cost: 900, wood: 50 },
    fold2: { base: 'fold', kind: 'sheep', name: '第二羊圈', cost: 1500, wood: 60 },
    shed2: { base: 'shed', kind: 'cow', name: '第二牛棚', cost: 2500, wood: 80 },
  };
  const PEN2_IDS = Object.keys(PEN2);
  const CAP = { chicken: 6, pig: 3, sheep: 3, cow: 3 };
  const PEN2_OF = Object.fromEntries(PEN2_IDS.map(k => [PEN2[k].kind, k]));
  const DEFAULT_HOST = 'eslope';
  const pastureHost = (plots, saved) => (saved && plots && plots[saved] && plots[saved].mod === 'pasture') ? saved : (ownedSorted(plots, 'pasture')[0] || null);
  // the four quarters of a pasture plot: a row of four on a wide flat plot, else two by two
  function penLayout(id) {
    const r = PL.plot(id).rect, w = r[2] - r[0], h = r[3] - r[1], row = w > h * 1.8, out = {};
    PEN2_IDS.forEach((k, i) => { const cw = row ? w / 4 : w / 2, ch = row ? h : h / 2, cx0 = r[0] + (row ? i : i % 2) * cw, cy0 = r[1] + (row ? 0 : (i >> 1)) * ch;
      const cx1 = cx0 + cw, cy1 = cy0 + ch, big = k === 'shed2', bx = Math.round(cx0 + Math.min(cw / 2, big ? 16 : 13)), by = Math.round(cy0 + (big ? 11 : 10));
      out[k] = { name: PEN2[k].name, needs: null, base: PEN2[k].base, second: 1, bld: P(bx, by), door: P(bx + 1, by + (big ? 17 : 13)),
        trough: P(Math.round(Math.min(cx1 - 9, bx + (big ? 22 : 18))), Math.round(cy1 - 7)), roam: [Math.round(cx0 + 5), Math.round(cy0 + 8), Math.round(cx1 - 5), Math.round(cy1 - 4)], water: PEN2[k].kind === 'chicken' ? 1 : 2, host: id }; });
    return out;
  }
  // move the second pens' geometry onto a plot, in place (WD.PENS objects are shared with path.js and game.js)
  function applyPenLayout(PENS, id) { const lay = penLayout(id || DEFAULT_HOST); for (const k of PEN2_IDS) { if (!PENS[k]) PENS[k] = {}; const o = PENS[k]; for (const key of Object.keys(o)) delete o[key]; Object.assign(o, lay[k]); } return lay; }
  const pen2Gate = (k, plots, saved) => pastureHost(plots, saved) ? null : '先把一块新地选成「牧场」';
  const homeOf = a => (a && a.pen) || (AN && AN.KINDS[a.kind] ? AN.KINDS[a.kind].home : null);
  // which animals live in the second pen: the ones past the first building's capacity (kept in the order they were bought)
  function assignPens(animals, eff) {
    const seen = {};
    for (const a of animals) { const i = seen[a.kind] = (seen[a.kind] || 0) + 1, k2 = PEN2_OF[a.kind];
      if (i > (CAP[a.kind] || 99) && k2 && eff && eff[k2]) a.pen = k2; else delete a.pen; }
    return animals;
  }
  // the shop's animal ladders go on past the first building: those levels need the second one
  const animalGate = (kind, have, eff) => { const k2 = PEN2_OF[kind]; if (!k2 || (have | 0) < CAP[kind]) return null; return eff && eff[k2] ? null : '先盖' + PEN2[k2].name; };

  // ---------- 边境牧羊犬赶羊 ----------
  // With the border collie and the fold's meadow: out at 8:00, watch over the flock, back in from 16:40.
  const HERD = { out: [8 * 60, 8 * 60 + 45], back: [16 * 60 + 40, 17 * 60 + 30], noon: 12 * 60, bonus: 3 };
  const herdPhase = T => T >= HERD.out[0] && T < HERD.out[1] ? 'out' : T >= HERD.out[1] && T < HERD.back[0] ? 'graze' : T >= HERD.back[0] && T < HERD.back[1] ? 'back' : null;

  // ---------- v5.11.1 自动化机械（第一批）: auto feeder + waterer, egg chute, milker, honey tray ----------
  // Bought in the shop's 「工坊」 tab (never by 家人帮忙添置), fitted onto what is already there: the pens' troughs, the coops,
  // the cow sheds, the meadow's hives. Saved as works.mach = { f, e, m, h, eg, mk, hn } (small ints; zero keys left out):
  // f: a bit per pen with a feeder (MACH_PENS order), e / m / h: chute / milker / tray, eg / mk / hn: goods waiting in the
  // storehouse bin. Products go straight into the bin; nobody carries them. The bin feeds orders and meals like a workshop's
  // finished goods, and what is above `keep` goes out with the night's produce cart at the stall's price.
  const MACH = {
    feeder: { name: '自动饲喂槽', cost: 2500, wood: 30 },
    feedset: { name: '自动饲喂槽整套', cost: 12000, wood: 0, min: 5 },
    chute: { name: '集蛋滑道', cost: 5000, wood: 0 },
    milker: { name: '挤奶机', cost: 6000, wood: 0 },
    tray: { name: '蜂蜜收集槽', cost: 1500, wood: 0 },
  };
  const MACH_IDS = Object.keys(MACH);
  const MACH_PENS = ['coop', 'sty', 'fold', 'shed', 'coop2', 'sty2', 'fold2', 'shed2'];
  const BIN = { egg: { key: 'eg', cap: 48, keep: 8 }, milk: { key: 'mk', cap: 24, keep: 6 }, honey: { key: 'hn', cap: 24, keep: 6 } };
  const BIN_IDS = Object.keys(BIN);
  const bitOf = pen => { const i = MACH_PENS.indexOf(pen); return i < 0 ? 0 : 1 << i; };
  const fitted = (m, pen) => !!(m && ((m.f | 0) & bitOf(pen)));
  const fitCount = m => { let n = 0, f = (m && m.f) | 0; while (f) { n += f & 1; f >>= 1; } return n; };
  // built: pens that stand now -> the ones still without a feeder, in MACH_PENS order
  const unfitted = (m, built) => MACH_PENS.filter(k => (built || []).includes(k) && !fitted(m, k));
  // why a machine cannot be bought yet (null: it can). ctx: { wheel, smithy, built: [pen ids], coop2, shed2, hives, meadow }
  function machGate(id, m, ctx) {
    ctx = ctx || {};
    if (id === 'feeder' || id === 'feedset') {
      if (!(ctx.wheel > 0) || !ctx.smithy) return !(ctx.wheel > 0) && !ctx.smithy ? '先修好水车，再在镇上盖好铁匠铺' : !(ctx.wheel > 0) ? '先修好水车（自来水要靠水车抽）' : '先在镇上盖好铁匠铺（饲喂槽要阿锤来打）';
      const left = unfitted(m, ctx.built);
      if (!left.length) return (ctx.built || []).length ? '每个盖好的棚子都装上了' : '先盖一个鸡舍、猪圈、羊圈或牛棚';
      if (id === 'feedset' && left.length < MACH.feedset.min) return `只剩 ${left.length} 个棚子没装，单个装更划算`;
      return null;
    }
    if (id === 'chute') return m && m.e ? null : ctx.coop2 ? null : '先盖第二鸡舍';
    if (id === 'milker') return m && m.m ? null : ctx.shed2 ? null : '先盖第二牛棚';
    if (id === 'tray') return m && m.h ? null : !ctx.meadow ? '先有花甸（新地选「花甸」）' : (ctx.hives | 0) < HIVE.max ? `花甸里放满 ${HIVE.max} 个蜂箱（现在 ${ctx.hives | 0} 个）` : null;
    return null;
  }
  // the shop's level count for each machine, read from works.mach (the shop keeps S.up in step with it)
  function machLevels(m, built) {
    return { feeder: fitCount(m), feedset: fitCount(m) && !unfitted(m, built).length ? 1 : 0, chute: m && m.e ? 1 : 0, milker: m && m.m ? 1 : 0, tray: m && m.h ? 1 : 0 };
  }
  // a purchase: fit the machine in place (feeder: the first pen without one; set: every pen without one) -> pens fitted now
  function machBuy(m, id, built) {
    if (id === 'feeder') { const k = unfitted(m, built)[0]; if (!k) return []; m.f = (m.f | 0) | bitOf(k); return [k]; }
    if (id === 'feedset') { const ks = unfitted(m, built); for (const k of ks) m.f = (m.f | 0) | bitOf(k); return ks; }
    if (id === 'chute') m.e = 1; if (id === 'milker') m.m = 1; if (id === 'tray') m.h = 1;
    return [];
  }
  // fitted pens keep their trough full of hay (from the storehouse) and water. -> hay used
  function machFill(m, troughs, need, hay) {
    let used = 0;
    for (const k of MACH_PENS) { if (!fitted(m, k)) continue; const n = need(k) | 0; if (!n) continue; const t = troughs[k] || (troughs[k] = { feed: 0, water: 0 });
      const add = Math.max(0, Math.min(n - (t.feed | 0), (hay | 0) - used)); t.feed = (t.feed | 0) + add; used += add; t.water = 1; }
    return used;
  }
  const binHas = (m, id) => (m && BIN[id] ? m[BIN[id].key] | 0 : 0);
  const binRoom = (m, id) => BIN[id].cap - binHas(m, id);
  function binAdd(m, id, n) { const k = Math.max(0, Math.min(n | 0, binRoom(m, id))); if (k) m[BIN[id].key] = binHas(m, id) + k; return k; }
  function binTake(m, id, n) { const k = Math.max(0, Math.min(n | 0, binHas(m, id))); if (k) m[BIN[id].key] = binHas(m, id) - k; return k; }
  // the night's produce cart: everything above `keep` -> { egg, milk, honey } taken out of the bin
  function binShip(m) { const out = {}; for (const id of BIN_IDS) { const n = Math.max(0, binHas(m, id) - BIN[id].keep); if (n) out[id] = binTake(m, id, n); } return out; }
  // the save: small non-negative ints, zero keys dropped; null when nothing is bought and the bin is empty
  function machValid(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null; const out = {};
    const f = Math.round(num(o.f, 0, 0, (1 << MACH_PENS.length) - 1)); if (f) out.f = f;
    for (const k of ['e', 'm', 'h']) if (o[k]) out[k] = 1;
    for (const id of BIN_IDS) { const b = BIN[id], n = Math.round(num(o[b.key], 0, 0, b.cap)); if (n) out[b.key] = n; }
    return Object.keys(out).length ? out : null;
  }

  // ---------- rules that span things ----------
  // a plot that has phase-8 buildings on it cannot be re-zoned (nothing would know where to go): returns why, or null
  function plotBusy(id, st) {
    if (!st) return null;
    if (!st.worksMove && Object.values(st.works || {}).some(w => w && w.at === id)) return '院子里有加工坊，暂时不能改建'; // v5.10.12: the game moves them (worksMove)
    if ((st.hives || []).some(h => h && h.at === id)) return '花甸里有蜂箱，暂时不能改建';
    if (st.penHost === id && st.pens2) return '草场上有第二套棚舍，暂时不能改建';
    return null;
  }

  // ---------- save (v12) ----------
  const empty = () => ({ sprinklers: [], works: {}, hives: [], penHost: null });
  const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  function valid(v, plots) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.sprinklers = (Array.isArray(o.sprinklers) ? o.sprinklers : []).filter(s => s && typeof s.x === 'number' && typeof s.y === 'number')
      .slice(0, SPRINKLER.max).map(s => ({ x: num(s.x, 0, -260, 452), y: num(s.y, 0, -212, 388) }));
    const w = o.works && typeof o.works === 'object' ? o.works : {};
    for (const id of WORK_IDS) { const q = w[id]; if (!q || typeof q !== 'object') continue; const def = WORKS[id];
      const at = typeof q.at === 'string' && plots && plots[q.at] && plots[q.at].mod === 'workshop' ? q.at : null;
      out.works[id] = { at, slot: Math.round(num(q.slot, 0, 0, YARD_SLOTS - 1)), inp: Math.round(num(q.inp, 0, 0, def.inCap)), left: num(q.left, 0, 0, def.mins), ready: Math.round(num(q.ready, 0, 0, def.outCap)) };
      if (typeof q.x === 'number' && typeof q.y === 'number') { out.works[id].x = num(q.x, 0, -260, 452); out.works[id].y = num(q.y, 0, -212, 388); } } // v5.7.0 moved
    out.hives = (Array.isArray(o.hives) ? o.hives : []).slice(0, HIVE.max).filter(h => h && typeof h === 'object').map(h => ({ at: h.at === 'orchard' || PL.isPlotId(h.at) ? h.at : null, s: Math.round(num(h.s, 0, 0, 5)), cd: Math.round(num(h.cd, HIVE.every, 0, 9)), ready: Math.round(num(h.ready, 0, 0, HIVE.readyCap)), ...(typeof h.x === 'number' && typeof h.y === 'number' ? { x: num(h.x, 0, -260, 452), y: num(h.y, 0, -212, 388) } : {}) })); // v5.7.0: x, y once moved
    out.penHost = typeof o.penHost === 'string' && PL.isPlotId(o.penHost) ? o.penHost : null;
    const mach = machValid(o.mach); if (mach) out.mach = mach; // v5.11.1 append-only (v15): only once a machine is bought
    return out;
  }

  // the second pens join the world's pen list (geometry first on the default plot; game.js moves them onto the host)
  if (WD && WD.PENS && !WD.PENS.coop2) { applyPenLayout(WD.PENS, DEFAULT_HOST); for (const k of PEN2_IDS) if (!WD.PEN_IDS.includes(k)) WD.PEN_IDS.push(k); }
  if (AN && AN.PEN_IDS) for (const k of PEN2_IDS) if (!AN.PEN_IDS.includes(k)) AN.PEN_IDS.push(k);

  const api = { TILE, SPRINKLER, reachOf, covers, edgeSpots, nextSpot, spotOk, coveredBy, sprinklerGate,
    WORKS, WORK_IDS, PRODUCTS, PRODUCT_IDS, WHEAT_WANT, workStep, YARD_SLOTS, slotPos, workPos, freeSlot, slotIn, evacuate, restock, workGate, hasOrchard,
    POWER, damSites, wheelsOf, powered, wheelGate, HOME_LAMPS, lampSpots, LAMP_R, LAMP_FRUIT,
    HIVE, ORCHARD_HIVES, hiveSlots, hivePos, hiveFree, hiveCap, hiveGate, hiveNight,
    PEN2, PEN2_IDS, CAP, PEN2_OF, DEFAULT_HOST, pastureHost, penLayout, applyPenLayout, pen2Gate, homeOf, assignPens, animalGate,
    HERD, herdPhase, plotBusy, empty, valid, ownedSorted,
    MACH, MACH_IDS, MACH_PENS, BIN, BIN_IDS, fitted, fitCount, unfitted, machGate, machLevels, machBuy, machFill, binHas, binRoom, binAdd, binTake, binShip, machValid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFWorks = api;
})(typeof window !== 'undefined' ? window : globalThis);
