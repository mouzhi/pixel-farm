// 像素农场 · 第 11 阶段（v5.9.0）：好感、成家分户与新房子（纯数据和纯函数；浏览器里是 window.PFHome，Node 里可以 require 做单元测试）
// Children slowly get close to their classmates (school days, a classmate coming home, parties); the family gets to know the
// town's neighbours (the teacher, the shopkeeper, the party guests). Nobody gives gifts or picks anything: it only grows.
// A grown child who is close to someone, once a new house stands on a bought 花甸 / 农田 plot, a 宅园 pad (v5.12.1), or (once moved) a bought first-ring field such as 东田, marries on a fine evening and
// moves out. The couple farms the six tiles and keeps the two hens beside their house by themselves, and now and then the
// child comes back for an hour to help on the main farm (at most twice a day). Art: home-art.js; wiring: game.js.
'use strict';
(function (root) {
  // the page loads this before plots.js (sim.js reads the house's price); plots.js is looked up when it is first needed
  const NODE = typeof require === 'function' && typeof document === 'undefined';
  const PLm = NODE ? require('./plots.js') : null, plots = () => PLm || root.PFPlots;
  const PL = new Proxy({}, { get: (_, k) => plots()[k] });
  const WDm = NODE ? require('./world.js') : null, world = () => WDm || root.PFWorld;
  const WD = new Proxy({}, { get: (_, k) => world()[k] });
  const NAVm = NODE ? require('./path.js') : null, pathApi = () => NAVm || root.PFPath;
  const NAV = new Proxy({}, { get: (_, k) => pathApi()[k] });
  const TN = root.PFTown || (NODE ? require('./town.js') : null);
  const careers = () => root.PFCareers || (NODE ? require('./careers.js') : null);
  const hallNb = () => (root.PFHall || (NODE ? require('./hall.js') : null) || {}).NEIGHBOURS || [];
  const HS = { tiles: 6, helpPerDay: 2, helpMinutes: 60 }; // = PL.HOMESTEAD (the phase 7 stub; tools/home-test.js checks they agree)
  const MATES = TN.MATES, NEIGHBOURS = TN.NEIGHBOURS;
  const MATE_IDS = MATES.map(m => m.id);
  const NB_IDS = Array.from(new Set(NEIGHBOURS.map(n => n.id).concat(hallNb().map(n => n.id)))); // v5.10.6: 铁匠阿锤 and the new houses
  const KID_IDS = ['kid0', 'kid1'];

  // ---------- 好感 ----------
  // per child, per classmate 0..100; per neighbour (the whole family) 0..100
  const REL = {
    max: 100,
    school: 1,     // every school day: +1 with each classmate...
    desk: 2,       // ...and +2 more with that day's 同桌 (one of the three, picked each day)
    visit: 5,      // a classmate comes home with them
    teen: 1,       // a teen who no longer goes to school still sees their closest friend: +1 a day
    party: 4,      // a teen's closest friend comes to a party
    close: 80,     // 走得很近: ready to marry
    friend: 40,    // a teen's friend is asked to parties from here
  };
  const NB = { teacher: 1, shop: 2, party: 3, wedding: 2 }; // 林老师 per school day, 周婶 per town-shop trip, guests per party, everyone at a wedding
  const LEVELS = [[80, '走得很近'], [50, '要好'], [20, '熟悉'], [1, '认识'], [0, '还不熟']];
  const levelOf = v => { for (const [n, s] of LEVELS) if ((v | 0) >= n) return s; return LEVELS[LEVELS.length - 1][1]; };
  const clampAdd = (o, k, n) => { o[k] = Math.min(REL.max, Math.max(0, (o[k] | 0) + n)); return o[k]; };
  const relOf = (st, kid) => (st.rel[kid] || (st.rel[kid] = {}));
  // a school day: everyone in class a little, the day's 同桌 a little more. r: random -> returns the 同桌's id
  function schoolDay(st, kid, r, open, mul) {
    const m = mul > 0 ? mul : 1;
    const o = relOf(st, kid); for (const id of MATE_IDS) clampAdd(o, id, REL.school * m);
    const desk = MATE_IDS[Math.floor(r() * MATE_IDS.length) % MATE_IDS.length]; clampAdd(o, desk, REL.desk * m);
    if (open) clampAdd(st.nb, 'n1', NB.teacher * m); // 林老师 teaches them once they go to the school in town; v5.10.9: doubled after the school expansion
    return desk;
  }
  const visit = (st, kid, mate) => clampAdd(relOf(st, kid), mate, REL.visit);
  // a married classmate is nobody else's; ties go to the one each child happened to sit with first (a fixed order per child)
  const PREF = { kid0: ['m1', 'm0', 'm2'], kid1: ['m0', 'm2', 'm1'] };
  function taken(st, kid) { const out = new Set(); for (const k of Object.keys(st.wed)) if (k !== kid && st.wed[k] && st.wed[k].mate) out.add(st.wed[k].mate); return out; }
  // -> { id, v } the closest classmate who is still free (null if none)
  function best(st, kid) {
    const o = st.rel[kid] || {}, no = taken(st, kid), order = PREF[kid] || MATE_IDS; let b = null;
    for (const id of order) { if (no.has(id)) continue; const v = o[id] | 0; if (!b || v > b.v) b = { id, v }; }
    return b;
  }
  const mateIndex = id => Math.max(0, MATE_IDS.indexOf(id));
  const mateName = id => MATES[mateIndex(id)].name;
  const nbName = id => ((NEIGHBOURS.find(n => n.id === id) || hallNb().find(n => n.id === id)) || { name: id }).name;

  // ---------- the new house ----------
  // the shop still sells up to two (one for each child); the second costs a little more ("按人口再加一档").
  // v5.12.1: a save can hold up to 6 houses (the two gen-2 cottages plus 4 pads on 宅园·度假村北). The shop does not
  // sell the extra four yet (that waits on the third generation); moving and loading already allow them.
  const HOUSE = { levels: [{ cost: 5000, wood: 200 }, { cost: 6500, wood: 240 }], max: 6, hw: 10, hd: 7, build: 40 }; // walls 20 x 14 (2.5 x 1.75 tiles)
  // the layout round the anchor (the house's centre, door to the south): the house, six tiles to one side (mirror: the other),
  // a little hen house on the far side of the house, a bench by the door. World units, 8 = one farm tile.
  const TILE_AT = [[17, -4], [25, -4], [33, -4], [17, 4], [25, 4], [33, 4]]; // v5.9.x: one unit further out for the bigger house
  const GARDEN = ['cabbage', 'pumpkin', 'carrot', 'pumpkin', 'cabbage', 'carrot']; // what each tile grows (their own seeds)
  const HENS = 2;
  const sx = (h, dx) => h.x + (h.m ? -dx : dx);
  function layout(h) {
    const tiles = TILE_AT.map(([dx, dy], i) => ({ i, x: sx(h, dx), y: h.y + dy }));
    const coop = { x: sx(h, -17), y: h.y - 1 }, door = { x: h.x, y: h.y + HOUSE.hd + 3 }, bench = { x: sx(h, 9), y: h.y + HOUSE.hd + 4 };
    const x0 = Math.min(sx(h, -22), sx(h, 37)), x1 = Math.max(sx(h, -22), sx(h, 37));
    return { tiles, coop, door, bench, foot: [x0, h.y - 9, x1, h.y + 13],
      block: [h.x - HOUSE.hw, h.y - HOUSE.hd, h.x + HOUSE.hw, h.y + HOUSE.hd - 0.5],
      coopBlock: [coop.x - 4.5, coop.y - 3, coop.x + 4.5, coop.y + 2.5],
      eggs: { x: coop.x, y: coop.y + 6 } };
  }
  const boxHit = (a, b, pad = 0) => a[0] - pad < b[2] && a[2] + pad > b[0] && a[1] - pad < b[3] && a[3] + pad > b[1];
  const inBox = (p, b, pad = 0) => p.x > b[0] - pad && p.x < b[2] + pad && p.y > b[1] - pad && p.y < b[3] + pad;
  // a house site: an outer 花甸 / 农田 plot, or the original farm / a bought first-ring region (林场, 东田, …)
  const HOME_FIELD = { c0: 9, r0: 7, cols: 6, rows: 4 }; // = game.js FIELD
  const isRegionId = id => !!(WD.REGION_IDS && WD.REGION_IDS.includes(id));
  const isPadId = id => !!(PL.isPadId && PL.isPadId(id));
  const padPlot = id => (PL.padPlot && PL.padPlot(id)) || id;
  const isHomeSite = id => id === 'home' || isRegionId(id) || isPadId(id) || (PL.isPlotId(id) && id !== (PL.HOMESTEAD && PL.HOMESTEAD.plot));
  function siteOf(id) {
    if (id === 'home') {
      const H = WD.HOME, L = NAV.LAYOUT || {};
      return { id: 'home', name: '家里', kind: 'home', rect: [H.x0, H.y0, H.x1, H.y1], gate: L.DOOR, barrel: L.WELL, field: HOME_FIELD };
    }
    if (isPadId(id)) {
      const pad = PL.padOf(id), p = PL.plot('nhome'); if (!pad || !p) return null;
      return { id: pad.id, name: p.name + '（' + pad.name + '）', kind: 'pad', rect: p.rect, gate: p.gate, pad, plot: 'nhome' };
    }
    const p = PL.plot(id); if (p) return { id: p.id, name: p.name, kind: 'plot', rect: p.rect, gate: p.gate, barrel: p.barrel, field: p.field, wheel: p.wheel };
    const r = WD.region && WD.region(id);
    return r ? { id: r.id, name: r.name, kind: 'region', rect: r.rect, gate: r.gate, barrel: r.barrel, field: r.field || null } : null;
  }
  const siteName = id => { const s = siteOf(id); return s ? s.name : '这块地'; };
  const siteRect = id => { const s = siteOf(id); return s ? s.rect : null; };
  function nearestPad(x, y) {
    const pads = PL.HOME_PADS || []; let best = null, bd = 1e9;
    for (const pad of pads) { const d = Math.hypot(pad.x - x, pad.y - y); if (d < bd) { bd = d; best = pad; } }
    return best;
  }
  function siteAt(x, y) {
    const H = WD.HOME; if (H && WD.inRect(x, y, [H.x0, H.y0, H.x1, H.y1])) return 'home';
    const p = PL.plotAt(x, y);
    if (p && p.id === 'nhome') { const pad = nearestPad(x, y); return pad ? pad.id : p.id; }
    if (p) return p.id;
    if (WD.REGIONS) for (const r of WD.REGIONS) if (WD.inRect(x, y, r.rect)) return r.id;
    return null;
  }
  const siteOwned = (id, plots, regions) => {
    if (id === 'home') return true;
    if (isRegionId(id)) return (regions || []).includes(id);
    const pid = padPlot(id);
    return !!(plots && plots[pid]);
  };
  function siteAllowsHouse(id, plots) {
    if (id === 'home' || isRegionId(id)) return true;
    if (isPadId(id)) { const q = plots && plots.nhome; return !!(q && q.mod === 'homestead'); }
    const p = PL.plot(id), q = plots && plots[id];
    return !!(p && q && !p.special && PL.HOMESTEAD.mods.includes(q.mod) && PL.HOMESTEAD.terrains.includes(p.terrain));
  }
  function fieldBox(id, mod) {
    const s = siteOf(id); if (!s || !s.field) return null;
    if (s.kind === 'plot' && mod !== 'field') return null;
    const f = s.field; return [f.c0 * 8 - 1, f.r0 * 8 - 1, (f.c0 + f.cols) * 8 + 1, (f.r0 + f.rows) * 8 + 1];
  }
  // fixed things on the original farm and first-ring regions (the manor, warehouse, well, pond, pens). Only boxes that
  // actually sit near this site are returned, so an outer plot is unchanged.
  function staticBlocks(id) {
    const s = siteOf(id); if (!s || !s.rect || s.kind === 'plot') return []; // plots keep the old spotsIn rules (gate / field / barrel)
    const out = [], r = s.rect, add = b => { if (b && b.length === 4 && boxHit(b, r, 8)) out.push(b); };
    const L = NAV.LAYOUT; if (L) {
      const hb = NAV.houseBox && NAV.houseBox(3);
      if (hb) add([hb.x0, hb.y0, hb.x1, hb.y1]);
      add([L.BARN.x - 14.5, L.BARN.y - 11.5, L.BARN.x + 14.5, L.BARN.y + 11.5]);
      add([L.WELL.x - 6, L.WELL.y - 6, L.WELL.x + 6, L.WELL.y + 6]);
      add([L.STALL.x - 11, L.STALL.y - 6.5, L.STALL.x + 11, L.STALL.y + 6.5]);
      add([L.BENCH.x - 5, L.BENCH.y - 3, L.BENCH.x + 5, L.BENCH.y + 3]);
      if (L.POND) add([L.POND.x - L.POND.rx, L.POND.y - L.POND.ry, L.POND.x + L.POND.rx, L.POND.y + L.POND.ry]);
    }
    // only the original four pens (works.js also parks second-pen geometry on a default plot)
    for (const k of ['coop', 'sty', 'fold', 'shed']) { const P = WD.PENS && WD.PENS[k]; if (!P || !P.bld) continue;
      add([P.bld.x - 9, P.bld.y - 7, P.bld.x + 9, P.bld.y + 7]);
      if (P.roam) add(P.roam); }
    return out;
  }
  function wetAt(x, y) {
    if (WD.seaAt && WD.seaAt(x, y) === 'water') return 'water';
    if (PL.terrainAt && PL.terrainAt(x, y) === 'river') return 'river';
    return null;
  }
  function outsideWhy(x, y) {
    const w = wetAt(x, y); if (w === 'water') return '这里是水，不能放房子'; if (w === 'river') return '这里是河，不能放房子';
    const p = PL.plotAt(x, y); if (p && p.special === 'road') return '这里是路，不能放房子';
    if (NAV.pathDist && NAV.pathDist(x, y, null) < 6) return '这里是路，不能放房子';
    return '新房子只能挪到买下的花甸、农田、宅园房基，或家里已买下的地里（一块地一座，宅园可以放 4 座）';
  }
  function blockWhy(x, y, id, mod, avoid) {
    const foot = layout({ x, y, m: 0 }).foot, field = fieldBox(id, mod), s = siteOf(id);
    if (field && (boxHit(foot, field) || (s && WD.inRect && WD.inRect(x, y, field)))) return '会压到农田，换一块空草地';
    if (s && s.gate && inBox(s.gate, foot, 12)) return '会挡住大门';
    if (s && s.barrel && inBox(s.barrel, foot, 6)) return '会压到水桶';
    const L = NAV.LAYOUT;
    if (L && L.WELL && inBox(L.WELL, foot, 8)) return '会压到水井';
    if (L && L.BARN && inBox(L.BARN, foot, 16)) return '会压到仓库';
    const w = wetAt(x, y); if (w === 'water') return '这里是水，不能放房子'; if (w === 'river') return '这里是河，不能放房子';
    if (NAV.pathDist && NAV.pathDist(x, y, null) < 8) return '放在这里会把路堵住';
    if ((avoid || []).some(b => boxHit(foot, b, 1))) return '这里有树或别的东西占着，放不下新房子和它的小田';
    if (s && s.rect && (foot[0] < s.rect[0] + 4 || foot[2] > s.rect[2] - 4 || foot[1] < s.rect[1] + 3 || foot[3] > s.rect[3] - 3))
      return '这块地太窄，放不下新房子和它的小田';
    return '这里放不下新房子和它的小田';
  }
  // where a house can go in site `id` (a plot bought as `mod`, or a first-ring region / 家里): inside the fence,
  // clear of its gate, its 农田 block, its water barrel and anything in `avoid` (boxes). Nearest the middle first.
  function spotsIn(id, mod, avoid) {
    if (isPadId(id)) {
      const pad = PL.padOf(id); if (!pad) return [];
      const L = layout(pad), f = L.foot;
      if ((avoid || []).some(b => boxHit(f, b, 1))) return [];
      if (wetAt(pad.x, pad.y)) return [];
      return [{ x: pad.x, y: pad.y, m: pad.m, d: 0 }];
    }
    const s = siteOf(id); if (!s || !s.rect) return [];
    const [X0, Y0, X1, Y1] = s.rect, out = [], cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    const field = fieldBox(id, mod), extra = staticBlocks(id);
    for (let y = Math.ceil((Y0 + 10) / 4) * 4; y <= Y1 - 14; y += 4) for (let x = Math.ceil((X0 + 6) / 4) * 4; x <= X1 - 6; x += 4) for (const m of [0, 1]) {
      const L = layout({ x, y, m }), f = L.foot;
      if (f[0] < X0 + 4 || f[2] > X1 - 4 || f[1] < Y0 + 3 || f[3] > Y1 - 3) continue;
      if (s.gate && inBox(s.gate, f, 12)) continue;
      if (field && boxHit(f, field)) continue;
      if (s.barrel && inBox(s.barrel, f, 5)) continue;
      if (s.wheel && inBox(s.wheel, f, 10)) continue;
      if (extra.some(b => boxHit(f, b, 1))) continue;
      if ((avoid || []).some(b => boxHit(f, b, 1))) continue;
      if (wetAt(x, y) || wetAt(f[0], f[1]) || wetAt(f[2], f[3])) continue;
      out.push({ x, y, m, d: Math.hypot(x + (m ? -7 : 7) - cx, y + 2 - cy) });
    }
    return out.sort((a, b) => a.d - b.d || a.m - b.m);
  }
  // click (x, y) while moving house `h`. ctx: { plots, regions, houses (the others), avoid }
  // the shop still only *buys* onto 花甸 / 农田 plots; this is what 挪东西 accepts.
  function moveOk(x, y, h, ctx) {
    ctx = ctx || {};
    const res = (ok, why, s) => ({ ok, why, x: s ? s.x : x, y: s ? s.y : y, box: s ? layout(Object.assign({}, h, s)).foot : [x - 22, y - 9, x + 37, y + 13], spot: s || null });
    if (!h) return res(false, '没有这座新房子');
    const id = siteAt(x, y);
    if (!id) return res(false, outsideWhy(x, y));
    if (!siteOwned(id, ctx.plots, ctx.regions)) return res(false, `还没买下${siteName(id)}，不能在这里放房子`);
    if (!siteAllowsHouse(id, ctx.plots)) {
      const pid = padPlot(id), p = PL.plot(pid), q = ctx.plots && ctx.plots[pid];
      if (p && p.special === 'road') return res(false, '这里是路，不能放房子');
      if (p && q && q.mod && PL.MODULES[q.mod]) return res(false, `${siteName(id)}现在是${PL.MODULES[q.mod].name}，新房子要花甸、农田或宅园的房基`);
      return res(false, '新房子只能挪到买下的花甸、农田、宅园房基，或家里已买下的地里（一块地一座，宅园可以放 4 座）');
    }
    if ((ctx.houses || []).some(q => q.site === id)) return res(false, `${siteName(id)}已经有一座新房子了（${isPadId(id) ? '这个房基' : '一块地'}一座）`);
    const s0 = siteOf(id), pid = padPlot(id), mod = (ctx.plots && ctx.plots[pid] && ctx.plots[pid].mod) || (s0 && s0.field ? 'field' : 'meadow');
    const avoid = ctx.avoid || [];
    let best = null, bd = 16;
    for (const s of spotsIn(id, mod, avoid)) { const d = Math.hypot(s.x - x, s.y - y) + s.m * 0.01; if (d < bd) { bd = d; best = s; } }
    if (!best) return res(false, blockWhy(x, y, id, mod, avoid.concat(staticBlocks(id))));
    return res(true, null, { site: id, x: best.x, y: best.y, m: best.m });
  }
  // plots that can take a house now: bought 花甸 / 农田 on flat ground (phase 7 hook) without a house already
  const freeSites = (plots, houses) => PL.homesteadSites(plots).filter(id => !(houses || []).some(h => h.site === id))
    .sort((a, b) => (isPadId(b) - isPadId(a)) || PL.PLOT_IDS.indexOf(padPlot(a)) - PL.PLOT_IDS.indexOf(padPlot(b)) || String(a).localeCompare(b));
  const SITE_HINT = '先买下「宅园·度假村北」，或在外圈买一块平地选成「花甸」或「农田」，新房子盖在那里';
  // shop gate: have = houses already bought (the shop still sells two)
  function houseGate(ctx) {
    if (!(ctx.moved > 0)) return '阿禾搬来以后才盖新房子';
    if ((ctx.have | 0) >= HOUSE.levels.length) return null;
    if (!(ctx.sites | 0)) return SITE_HINT;
    if (!(ctx.room | 0)) return '花甸、农田或宅园里放不下新房子了（要一块空一点的地，或一个空房基）';
    return null;
  }

  // ---------- getting married ----------
  // ctx: { kid: { id, stage }, married (already), house (a free built house exists), rain, lastWed (day of the last wedding), day }
  const WED = { gap: 3, from: 17 * 60 + 30, to: 20 * 60 + 30 };
  function wedReady(st, ctx) {
    const k = ctx.kid; if (!k || ctx.stage !== 'teen' || (st.wed[k.id] && st.wed[k.id].mate)) return null;
    if (!ctx.house || ctx.rain) return null;
    if ((ctx.lastWed | 0) > 0 && ctx.day - ctx.lastWed < WED.gap) return null;
    const b = best(st, k.id); return b && b.v >= REL.close ? b.id : null;
  }
  // v5.11.0.21 the wedding clothes: who wears the gown and who the suit. 小米 and 朵朵 are girls, 小豆 and 石头 boys; 阿团 is
  // whichever the other one is not. Two girls are two brides, two boys two grooms (the second one's colours differ a little).
  const WED_LOOK = { kid0: 'groom', kid1: 'bride', m1: 'bride', m2: 'groom' };
  function wedLooks(kid, mate) {
    const k = WED_LOOK[kid] || 'groom', m = WED_LOOK[mate] || (k === 'bride' ? 'groom' : 'bride');
    return { kid: k, mate: m === k ? m + '2' : m };
  }
  const isMarried = (st, kid) => !!(st.wed[kid] && st.wed[kid].moved > 0);
  const houseOf = (st, kid) => st.houses.find(h => h.kid === kid) || null;
  // a teen's friend drops by now and then (no more school to meet at): ctx { day, last, rain, party }
  const TEEN = { p: 0.3, gap: 3, from: 14 * 60 };
  function teenVisit(ctx, r) { if (ctx.rain || ctx.party) return false; if ((ctx.last | 0) > 0 && ctx.day - ctx.last < TEEN.gap) return false; return r() < TEEN.p; }

  // ---------- their little farm ----------
  // about every other day (dayP, rolled once a morning) they come over for an hour; a second hour that day only when the main
  // farm is behind (backlog: ripe + dry tiles there), never while their own tiles need them
  const HELP = { perDay: HS.helpPerDay, minutes: HS.helpMinutes, from: 9 * 60, to: 16 * 60, gap: 120, backlog: 6, p: 0.25, dayP: 0.5 };
  // ctx: { T, backlog, own (jobs waiting at home), helpDay (today's roll < dayP) }, h: { day, n, last }, day
  function helpNow(h, ctx, day, r) {
    if (!ctx.helpDay || ctx.own > 0 || ctx.T < HELP.from || ctx.T >= HELP.to) return false;
    const n = h && h.day === day ? h.n | 0 : 0; if (n >= HELP.perDay) return false;
    if (n && ctx.T - (h.last | 0) < HELP.gap) return false;
    return n ? ctx.backlog >= HELP.backlog : ctx.backlog >= HELP.backlog || r() < HELP.p;
  }

  // ---------- state ----------
  // houses: [{ site, x, y, m (mirrored), d (day bought), built (day built, 0 = being built), kid (who lives there), tiles: [{ t, w, c }], eggs (day), hens }]
  // rel: { kid0: { m0: 12, ... } }, nb: { n0: 3, ... }, wed: { kid0: { mate, day (the wedding), moved (day they moved out), house } }
  // help: { kid0: { day, n, last, until } }, teen: { kid0: day of the last visit }, earn: what the little farms made, n: weddings
  const emptyTile = () => ({ t: 0, w: 0, c: null });
  const empty = () => ({ houses: [], rel: {}, nb: {}, wed: {}, help: {}, teen: {}, earn: 0, path: {}, wage: 0 }); // v5.10.6: path + wage
  const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const CROPS = ['carrot', 'cabbage', 'pumpkin', 'strawberry', 'watermelon', 'wheat'];
  function validTile(t) { t = obj(t); const out = { t: t.t ? 1 : 0, w: t.w ? 1 : 0, c: null };
    if (t.c && CROPS.includes(t.c.type)) out.c = { type: t.c.type, age: int(t.c.age, 0, 0, 99), n: 0, stage: int(t.c.stage, 0, 0, 3), rot: num(t.c.rot, 0, 0, 7) };
    if (out.c) out.t = 1; return out; }
  function valid(v) {
    const o = obj(v), out = empty();
    const sites = new Set();
    out.houses = (Array.isArray(o.houses) ? o.houses : []).filter(h => h && isHomeSite(h.site) && typeof h.x === 'number' && typeof h.y === 'number')
      .filter(h => !sites.has(h.site) && sites.add(h.site)).slice(0, HOUSE.max).map(h => {
        const r = siteRect(h.site);
        const tiles = (Array.isArray(h.tiles) ? h.tiles : []).slice(0, HS.tiles).map(validTile); while (tiles.length < HS.tiles) tiles.push(emptyTile());
        return { site: h.site, x: num(h.x, (r[0] + r[2]) / 2, r[0], r[2]), y: num(h.y, (r[1] + r[3]) / 2, r[1], r[3]), m: h.m ? 1 : 0, d: int(h.d, 1, 1, 1e6), built: int(h.built, 0, 0, 1e6),
          kid: KID_IDS.includes(h.kid) ? h.kid : null, tiles, eggs: int(h.eggs, 0, 0, 1e6), hens: int(h.hens, HENS, 0, HENS) }; });
    const rel = obj(o.rel); for (const k of KID_IDS) { const m = obj(rel[k]), r = {}; for (const id of MATE_IDS) { const n = int(m[id], 0, 0, REL.max); if (n) r[id] = n; } if (Object.keys(r).length) out.rel[k] = r; }
    const nb = obj(o.nb); for (const id of NB_IDS) { const n = int(nb[id], 0, 0, REL.max); if (n) out.nb[id] = n; }
    const wed = obj(o.wed); for (const k of KID_IDS) { const w = obj(wed[k]); if (!MATE_IDS.includes(w.mate)) continue;
      const hi = int(w.house, 0, 0, out.houses.length - 1);
      out.wed[k] = { mate: w.mate, day: int(w.day, 1, 1, 1e6), moved: int(w.moved, 0, 0, 1e6), house: out.houses[hi] ? hi : 0 }; }
    // two children never marry the same classmate; a wedding needs its house
    const seen = new Set(); for (const k of KID_IDS) { const w = out.wed[k]; if (!w) continue; if (seen.has(w.mate) || !out.houses.length) { delete out.wed[k]; continue; } seen.add(w.mate); }
    for (const h of out.houses) if (h.kid && !(out.wed[h.kid] && out.wed[h.kid].moved)) h.kid = null;
    for (const k of KID_IDS) { const w = out.wed[k]; if (w && w.moved && !out.houses.some(h => h.kid === k)) { const h = out.houses[w.house]; if (h && !h.kid) h.kid = k; else w.moved = 0; } }
    const help = obj(o.help); for (const k of KID_IDS) { const h = obj(help[k]); if (h.day) out.help[k] = { day: int(h.day, 0, 0, 1e6), n: int(h.n, 0, 0, HELP.perDay), last: int(h.last, 0, 0, 1440), until: int(h.until, 0, 0, 1440) }; }
    const teen = obj(o.teen); for (const k of KID_IDS) { const n = int(teen[k], 0, 0, 1e6); if (n) out.teen[k] = n; }
    out.earn = int(o.earn, 0, 0, 1e12);
    const CR = careers();
    if (CR) { const c = CR.valid({ path: o.path, wage: o.wage }); out.path = c.path; out.wage = c.wage; }
    return out;
  }

  // ---------- what the panels say ----------
  // -> [{ who, name, v, level }] for one child (classmates, closest first), and the neighbours the family knows
  function kidRel(st, kid) { const o = st.rel[kid] || {}; return MATE_IDS.map(id => ({ id, name: mateName(id), v: o[id] | 0, level: levelOf(o[id] | 0) })).sort((a, b) => b.v - a.v); }
  const nbRel = st => NB_IDS.filter(id => (st.nb[id] | 0) > 0).map(id => ({ id, name: nbName(id), v: st.nb[id] | 0, level: levelOf(st.nb[id] | 0) })).sort((a, b) => b.v - a.v);
  function kidNote(st, kid, name) { // 「小豆和朵朵走得很近」, 「小豆和朵朵成家了，住在新房子」
    const w = st.wed[kid];
    if (w && w.moved) {
      let s = `${name}和${mateName(w.mate)}成家了，住在新房子`;
      const CR = careers(), p = CR && CR.pathOf(st, kid);
      if (p && CR.pathLine) { const line = CR.pathLine(p, name); if (line && line !== '留家种地') s += '，' + line; }
      else if (p && p.way === 'work' && p.at && CR.JOB[p.at]) s += `，在${CR.JOB[p.at].name}上班`;
      else if (p && p.way === 'shop' && p.kind) s += `，在镇上开了${CR.shopName(name, p.kind)}`;
      else if (p && p.way === 'inn') s += '，经营民宿 / 菜馆';
      return s;
    }
    if (w && w.mate) return `${name}今晚和${mateName(w.mate)}办婚礼`;
    const b = best(st, kid); if (!b || b.v <= 0) return ''; return `${name}和${mateName(b.id)}${levelOf(b.v)}（${b.v}）`;
  }

  const api = { HS, REL, NB, LEVELS, levelOf, MATE_IDS, NB_IDS, KID_IDS, PREF, schoolDay, visit, best, taken, mateIndex, mateName, nbName, clampAdd,
    HOUSE, TILE_AT, GARDEN, HENS, layout, boxHit, inBox, spotsIn, freeSites, SITE_HINT, houseGate, WED, WED_LOOK, wedLooks, wedReady, isMarried, houseOf, TEEN, teenVisit,
    HELP, helpNow, empty, emptyTile, valid, kidRel, nbRel, kidNote,
    HOME_FIELD, isHomeSite, isRegionId, isPadId, padPlot, siteOf, siteName, siteRect, siteAt, siteOwned, siteAllowsHouse, fieldBox, staticBlocks, moveOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFHome = api;
})(typeof window !== 'undefined' ? window : globalThis);
