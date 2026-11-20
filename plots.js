// 像素农场 · 第 7 阶段外扩：外圈地形（河、桥、山、山道）和可选模块的新地块（纯数据和纯函数；浏览器里是 window.PFPlots，Node 里可以 require 做单元测试）
// The map grows by 12 tiles on every side (world.js WORLD, 88 x 74 tiles). Old coordinates never move: the farm, the seven shop
// regions and every saved position stay where they were. New land is a ring of small and medium plots. A plot is bought by
// choosing one module its terrain allows; it can be re-zoned later for a fee. Plots open once two people can work (阿禾 moved in).
// Also here: the sheep fold's grazing meadow (a fold upgrade bought in the shop, no expansion needed).
'use strict';
(function (root) {
  const WD = root.PFWorld || (typeof require === 'function' ? require('./world.js') : null);
  const TILE = 8;
  const inRect = (x, y, r, pad = 0) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;
  const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy || 1; let t = ((px - x1) * dx + (py - y1) * dy) / l; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); };
  const polyDist = (x, y, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)); return d; };
  const P = (x, y) => ({ x, y });

  // ---------- modules: what a plot can become ----------
  // cost / wood: a one-off setup on top of the plot price (only the playground's swings and slide cost extra, unless the plot bundles them)
  const MODULES = {
    field: { name: '农田', icon: 'field', desc: '新的耕地，家人会来开垦、播种、浇水', now: '24 格新田，带水桶' },
    pasture: { name: '牧场', icon: 'pasture', desc: '围栏草场，能盖第二套鸡舍、猪圈、羊圈、牛棚（商店「建筑」里买）', now: '先围好草场和小水槽' },
    orchard: { name: '果园', icon: 'orchard', desc: '能移植仓库里的果树苗（用「种树」工具点这块地）', now: '空出成排的移植位' },
    meadow: { name: '花甸', icon: 'flower', desc: '一片野花，能放 6 个蜂箱（商店「工坊」里买），以后还能摆装饰', now: '开满野花' },
    woodland: { name: '林地', icon: 'forest', desc: '种上一片会再生的树，砍了会长回来', now: '一片会长回来的树（最多 10 棵）' },
    workshop: { name: '工坊院', icon: 'workshop', desc: '平整的空院子，能盖三座加工坊：磨坊、果酱铺、奶酪坊（商店「工坊」里买）', now: '先铺好院子' },
    dam: { name: '动力坝', icon: 'dam', desc: '河边的水车。在商店「工坊」里修好以后转起来，给农场供电', now: '河边立起一架水车，修好以后转起来' },
    road: { name: '大道', icon: 'road', desc: '通向隔壁镇子的大路，孩子以后上学走这里', now: '路修通到镇口；镇门还关着，孩子上过一天学后在「地块」里开镇门' },
    playground: { name: '乐园', icon: 'playground', desc: '滑梯、沙坑（能堆沙堡）和秋千，孩子会自己来玩', now: '滑梯、沙坑和秋千', cost: 800, wood: 40 },
    bridge: { name: '石桥', icon: 'bridge', desc: '修好以后家人、羊群和上学的孩子都从桥上过河', now: '桥修好了' },
    trail: { name: '山道', icon: 'trail', desc: '一条弯弯的上山小路，通向山顶的两块地', now: '路障拆掉，能上山了' },
    inn: { name: '民宿院', icon: 'inn', desc: '能盖最多 4 间小木屋和一座农家菜馆，游客会沿东大道来住（商店「农家乐」里买，要繁荣度 3）', now: '先铺好院子和石子路' },
    resort: { name: '度假村', icon: 'resort', desc: '东南滩改成度假村后，海边能盖沙滩小屋、遮阳伞、海鲜摊、游客栈桥和日落观景台（商店「农家乐」里买，要先买下海边，繁荣度 3）', now: '一条通向沙滩的小路' },
  };
  const MODULE_IDS = Object.keys(MODULES);
  const TERRAIN = { flat: '平地', river: '河边地', slope: '山脚缓坡', high: '山顶高地', across: '河对岸', special: '特殊地块' };

  // ---------- terrain: the river, the mountains and the mountain trail ----------
  // The river comes down from the north-west mountains, runs south along the west edge, then east under the farm's south
  // forest and into the sea. Half width ~7 world units (almost 2 tiles).
  const RIVER = [P(-232, -214), P(-228, -150), P(-224, -90), P(-228, -30), P(-224, 30), P(-218, 100), P(-208, 170), P(-186, 230),
    P(-150, 272), P(-100, 300), P(-40, 312), P(20, 316), P(80, 320), P(130, 314), P(170, 302), P(205, 298)];
  const RIVER_HW = 7, BANK = 4;
  const riverHW = (x, y) => RIVER_HW + Math.sin(x * 0.11 + y * 0.07) * 1.2;
  const riverDist = (x, y) => polyDist(x, y, RIVER);
  // the one bridge, north-south over the river south of the farm
  const BRIDGE = { x: 24, y0: 302, y1: 330, hw: 5 };
  // The ridge: a cliff edge running along the north of the map, bending down at the west and east corners. North of it is
  // the high plateau, reached only by the mountain trail.
  function ridgeY(x) { return -158 + Math.sin(x * 0.045) * 4 + Math.sin(x * 0.013 + 1) * 3 + Math.max(0, -170 - x) * 1.1 + Math.max(0, Math.min(x, 470) - 352) * 0.45; } // v5.8.0: level off past the old map edge (the town strip)
  const CLIFF = 5; // world units of rock face below the ridge line
  // the trail (dirt, bought as its own special plot): up the gap between 林场 and 北牧场, through the cliff, along the plateau
  const TRAIL = [P(204, -108), P(190, -126), P(214, -144), P(196, -166), P(196, -184)];
  const TRAIL_TOP = [P(196, -184), P(180, -184)];      // to 山顶 (west)
  const TRAIL_EAST = [P(196, -184), P(228, -184)];     // to 高山牧场 (east)
  const onTrail = (x, y, d = 5) => polyDist(x, y, TRAIL) < d || polyDist(x, y, TRAIL_TOP) < d || polyDist(x, y, TRAIL_EAST) < d;

  // ---------- plots ----------
  // rect: [x0, y0, x1, y1]; gate: where the road enters (on the fence); sign: the board with the lock; mods: allowed modules
  // (first one is the suggestion); needs: another plot that has to be bought first (the bridge or the trail).
  // field: the tile block a 农田 gets (world tiles); barrel: its water; wheel: where a 动力坝 puts the water wheel.
  const PLOTS = [
    { id: 'play', name: '屋西空地', terrain: 'flat', rect: [-76, 64, -24, 124], gate: P(-48, 64), sign: P(-60, 60), price: 2200, wood: 40, bundle: 'playground',
      mods: ['playground', 'meadow'], desc: '紧挨着家的一块平地，几乎只适合做乐园（价钱里已经含滑梯、沙坑和秋千）' },
    { id: 'glade', name: '林间空地', terrain: 'flat', rect: [-120, 136, -30, 186], gate: P(-30, 160), sign: P(-26, 150), price: 2400,
      mods: ['field', 'orchard', 'meadow', 'playground', 'inn'], field: { cols: 8, rows: 3 }, desc: '南边林子里的一块平地' },
    { id: 'swbank', name: '西南河湾', terrain: 'river', rect: [-136, 200, -80, 256], gate: P(-80, 228), sign: P(-76, 218), price: 3200,
      mods: ['field', 'meadow', 'workshop', 'dam'], field: { cols: 5, rows: 4 }, wheel: P(-146, 256), desc: '靠河的一小块地，河边能修水车' },
    { id: 'wbank', name: '西河湾', terrain: 'river', rect: [-200, 40, -156, 140], gate: P(-176, 40), sign: P(-166, 36), price: 3400,
      mods: ['field', 'workshop', 'dam'], field: { cols: 4, rows: 7 }, wheel: P(-208, 120), desc: '西边河岸上的长条地' },
    { id: 'sbank', name: '南河湾', terrain: 'river', rect: [40, 222, 140, 296], gate: P(40, 250), sign: P(36, 240), price: 3800,
      mods: ['field', 'workshop', 'dam', 'inn'], field: { cols: 8, rows: 3 }, wheel: P(110, 306), desc: '南边河湾，土厚，也能修水车' },
    { id: 'bridge', name: '石桥', terrain: 'special', special: 'bridge', rect: [12, 300, 36, 332], gate: P(24, 300), sign: P(38, 296), price: 5500, wood: 30,
      mods: ['bridge'], desc: '河上唯一的桥，修好才能去河对岸' },
    { id: 'swacross', name: '河对岸·西', terrain: 'across', rect: [-110, 330, 10, 378], gate: P(10, 350), sign: P(14, 342), price: 3600, needs: 'bridge',
      mods: ['field', 'pasture', 'orchard', 'meadow', 'workshop', 'inn'], field: { cols: 8, rows: 3 }, desc: '过了桥往西的一大片平地' },
    { id: 'seacross', name: '河对岸·东', terrain: 'across', rect: [34, 332, 140, 380], gate: P(34, 350), sign: P(30, 342), price: 4000, needs: 'bridge',
      mods: ['field', 'pasture', 'meadow', 'workshop', 'dam', 'inn'], field: { cols: 8, rows: 3 }, wheel: P(100, 324), desc: '过了桥往东，挨着河' },
    { id: 'eslope', name: '东坡', terrain: 'slope', rect: [362, -100, 440, -12], gate: P(362, -20), sign: P(358, -30), price: 3500,
      mods: ['pasture', 'field', 'orchard', 'meadow', 'inn'], field: { cols: 6, rows: 4 }, desc: '北牧场东边的缓坡' },
    { id: 'eroad', name: '东大道', terrain: 'special', special: 'road', rect: [362, 40, 448, 92], gate: P(362, 66), sign: P(358, 56), price: 6500, wood: 30,
      mods: ['road'], desc: '通向隔壁镇子的路，能看见镇子的屋顶' },
    { id: 'eshore', name: '东南滩', terrain: 'flat', rect: [362, 112, 440, 200], gate: P(362, 150), sign: P(358, 140), price: 3000,
      mods: ['field', 'meadow', 'workshop', 'resort'], field: { cols: 6, rows: 4 }, desc: '海边上面的一块向阳平地，也可改建成度假村' },
    { id: 'nwslope', name: '北坡·西', terrain: 'slope', rect: [-130, -150, -30, -112], gate: P(-30, -130), sign: P(-26, -140), price: 2800,
      mods: ['woodland', 'orchard', 'pasture'], desc: '山脚下的坡地' },
    { id: 'neslope', name: '北坡·东', terrain: 'slope', rect: [228, -150, 340, -112], gate: P(240, -112), sign: P(252, -108), price: 3000,
      mods: ['woodland', 'orchard', 'pasture'], desc: '北牧场后面的山脚' },
    { id: 'trail', name: '山道', terrain: 'special', special: 'trail', rect: [180, -170, 222, -110], gate: P(204, -110), sign: P(214, -106), price: 5000, wood: 20,
      mods: ['trail'], desc: '一条上山的小路，通向山顶的两块地' },
    { id: 'summit', name: '山顶', terrain: 'high', rect: [40, -202, 180, -168], gate: P(180, -184), sign: P(172, -168), price: 4000, needs: 'trail',
      mods: ['orchard', 'woodland'], desc: '山顶上的高地，风大，只适合果园或林地' },
    { id: 'alp', name: '高山牧场', terrain: 'high', rect: [228, -202, 350, -168], gate: P(228, -184), sign: P(236, -168), price: 3600, needs: 'trail',
      mods: ['pasture', 'meadow', 'woodland'], desc: '山上的一片缓坡草地' },
  ];
  // a 农田 gets a tile block centred in the plot, and a water barrel in the corner farthest from its gate
  for (const p of PLOTS) if (p.field) { const [x0, y0, x1, y1] = p.rect, f = p.field;
    f.c0 = Math.round((x0 + x1) / 2 / TILE - f.cols / 2); f.r0 = Math.round((y0 + y1) / 2 / TILE - f.rows / 2);
    const corners = [P(x0 + 7, y0 + 8), P(x1 - 7, y0 + 8), P(x0 + 7, y1 - 6), P(x1 - 7, y1 - 6)];
    const fx0 = f.c0 * TILE - 5, fy0 = f.r0 * TILE - 5, fx1 = (f.c0 + f.cols) * TILE + 5, fy1 = (f.r0 + f.rows) * TILE + 5;
    const ok = corners.filter(c => !(c.x > fx0 && c.x < fx1 && c.y > fy0 && c.y < fy1) && Math.hypot(c.x - p.gate.x, c.y - p.gate.y) >= 14);
    p.barrel = (ok.length ? ok : corners).sort((a, b) => Math.hypot(a.x - p.gate.x, a.y - p.gate.y) - Math.hypot(b.x - p.gate.x, b.y - p.gate.y))[0]; }
  const PLOT_IDS = PLOTS.map(p => p.id);
  const BY_ID = Object.fromEntries(PLOTS.map(p => [p.id, p]));
  const plot = id => BY_ID[id] || null;
  const FIELD_PLOT_IDS = PLOTS.filter(p => p.field).map(p => p.id);
  const isPlotId = id => !!BY_ID[id];
  // roads from the old lanes to every plot gate; always painted (a road you can see, to a gate you cannot open yet)
  const ROUTES = {
    x_play: [P(-20, 22), P(-48, 44), P(-48, 64)],
    x_west: [P(-20, 22), P(-46, 30), P(-176, 30), P(-176, 40)],
    x_south: [P(68, 136), P(24, 136), P(24, 300)],
    x_glade: [P(24, 160), P(-30, 160)],
    x_swbank: [P(24, 228), P(-80, 228)],
    x_sbank: [P(24, 250), P(40, 250)],
    x_across: [P(24, 330), P(24, 350), P(10, 350)],
    x_acrossE: [P(24, 350), P(34, 350)],
    x_east: [P(200, 4), P(352, 4), P(352, 150), P(362, 150)],
    x_eslope: [P(352, 4), P(352, -20), P(362, -20)],
    x_eroad: [P(352, 66), P(362, 66)],
    x_north: [P(-20, 22), P(-20, -130), P(-30, -130)],
    x_trail0: [P(200, -40), P(204, -110)],
    x_neslope: [P(204, -106), P(240, -106), P(240, -112)],
  };
  // inside a bought road plot the road runs on to the town gate at the map edge
  const TOWN = { gate: P(440, 66), lane: [P(362, 66), P(440, 66)], roofs: [] }; // v5.8.0: the town is real now (town.js / town-art.js); no far-off roofs
  if (WD) for (const k in ROUTES) if (!WD.ROUTES[k]) WD.ROUTES[k] = ROUTES[k];

  // ---------- the grazing meadow behind the sheep fold (a fold upgrade, not a plot) ----------
  // West of 果园坡, between its fence and the river. The orchard's west fence opens beside the fold once it is bought.
  const GRAZE = { rect: [-206, -64, -150, 14], gap: [-150, -22, -150, -2], sign: P(-176, -68), day: [8 * 60, 17 * 60], name: '放牧草地' };
  const grazeHours = T => T >= GRAZE.day[0] && T < GRAZE.day[1];

  // ---------- where things are ----------
  function plotAt(x, y) { for (const p of PLOTS) if (inRect(x, y, p.rect)) return p; return null; }
  // what an x, y on the outer map is: river / bank / cliff / high / null (ordinary ground handled by the old rules)
  function terrainAt(x, y) {
    const rd = riverDist(x, y), hw = riverHW(x, y);
    if (rd < hw) return (inRect(x, y, [BRIDGE.x - BRIDGE.hw, BRIDGE.y0, BRIDGE.x + BRIDGE.hw, BRIDGE.y1])) ? 'river' : 'river';
    if (rd < hw + BANK) return 'bank';
    const ry = ridgeY(x);
    if (y < ry - CLIFF) return 'high';
    if (y < ry) return 'cliff';
    return null;
  }
  // the decorative forest and other props stay off plots, the river, the cliff and the trail
  function clearAt(x, y, pad = 0) {
    for (const p of PLOTS) if (!p.special && inRect(x, y, p.rect, pad)) return true;
    if (inRect(x, y, GRAZE.rect, pad)) return true;
    if (riverDist(x, y) < RIVER_HW + BANK + pad * 0.6) return true;
    const ry = ridgeY(x); if (y < ry + 2 + pad * 0.3 && y > ry - CLIFF - 3) return true;
    if (onTrail(x, y, 7 + pad * 0.5)) return true;
    if (inRect(x, y, [TOWN.gate.x - 10, 40, 460, 92])) return true;
    return false;
  }
  // a world point that is outside the old 64 x 50 map
  const OLD = { x0: -160, y0: -112, x1: 352, y1: 288 };
  const outer = (x, y) => x < OLD.x0 || x > OLD.x1 || y < OLD.y0 || y > OLD.y1;

  // ---------- rules ----------
  const gateOpen = family => !!(family && family.moved > 0);                     // 2 working people: the farmer + 阿禾
  const workers = family => 1 + (gateOpen(family) ? 1 : 0);
  const round50 = v => Math.round(v / 50) * 50;
  const setupOf = (p, mod) => { const m = MODULES[mod]; if (!m || p.bundle === mod) return { cost: 0, wood: 0 }; return { cost: m.cost || 0, wood: m.wood || 0 }; };
  // what buying plot `id` as module `mod` costs right now. plots: { id: { mod, day } }
  function offer(plots, id, mod, coins, wood, family) {
    const p = plot(id); if (!p) return null;
    plots = plots || {};
    mod = mod || p.mods[0];
    if (plots[id]) return { id, plot: p, owned: true, mod: plots[id].mod };
    if (!p.mods.includes(mod)) return { id, plot: p, mod, ok: false, reason: 'module' };
    const s = setupOf(p, mod), cost = p.price + s.cost, w = (p.wood || 0) + s.wood;
    const out = { id, plot: p, mod, cost, wood: w, setup: s, short: Math.max(0, cost - (coins | 0)), shortWood: Math.max(0, w - (wood | 0)) };
    if (!gateOpen(family)) return Object.assign(out, { ok: false, reason: 'gate' });
    if (p.needs && !plots[p.needs]) return Object.assign(out, { ok: false, reason: 'needs', needs: p.needs });
    out.ok = !out.short && !out.shortWood; if (!out.ok) out.reason = 'short';
    return out;
  }
  // changing a bought plot to another module its terrain allows: about a quarter of the plot price plus a little wood
  function rezoneOffer(plots, id, mod, coins, wood) {
    const p = plot(id), cur = plots && plots[id]; if (!p || !cur) return null;
    if (p.special || p.mods.length < 2) return { id, plot: p, mod, ok: false, reason: 'fixed' };
    if (!p.mods.includes(mod)) return { id, plot: p, mod, ok: false, reason: 'module' };
    if (cur.mod === mod) return { id, plot: p, mod, ok: false, reason: 'same' };
    const s = setupOf(p, mod), cost = round50(p.price * 0.25) + s.cost, w = 10 + s.wood;
    const out = { id, plot: p, mod, from: cur.mod, cost, wood: w, short: Math.max(0, cost - (coins | 0)), shortWood: Math.max(0, w - (wood | 0)) };
    out.ok = !out.short && !out.shortWood; if (!out.ok) out.reason = 'short';
    return out;
  }
  const emptyPlots = () => ({});
  function validPlots(v) {
    const out = {}; if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    for (const id of PLOT_IDS) { const o = v[id]; if (!o || typeof o !== 'object') continue; const p = BY_ID[id];
      const mod = p.mods.includes(o.mod) ? o.mod : p.mods[0]; out[id] = { mod, day: Math.max(1, Math.round(+o.day) || 1) }; }
    for (const id of Object.keys(out)) { const p = BY_ID[id]; if (p.needs && !out[p.needs]) delete out[id]; } // never across a river without the bridge
    return out;
  }
  const modsText = p => p.mods.map(m => MODULES[m].name).join(' / ');
  const plotsOfMod = (plots, mod) => Object.keys(plots || {}).filter(id => plots[id].mod === mod);
  // a woodland module plants this fixed set of wild trees (sim trees, saved; they regrow like 林场)
  function woodlandTrees(id) {
    const p = plot(id); if (!p) return []; const [x0, y0, x1, y1] = p.rect, out = []; let s = 0;
    for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) | 0;
    const rnd = () => ((s = (s * 1103515245 + 12345) | 0) >>> 8 & 0xffff) / 0x10000;
    const cols = Math.max(2, Math.floor((x1 - x0 - 16) / 16)), rows = Math.max(2, Math.floor((y1 - y0 - 10) / 14));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (out.length >= 10) break;
      const x = x0 + 12 + (c + 0.5) * (x1 - x0 - 24) / cols + (rnd() - 0.5) * 6, y = y0 + 10 + (r + 0.5) * (y1 - y0 - 20) / rows + (rnd() - 0.5) * 5;
      if (Math.hypot(x - p.gate.x, y - p.gate.y) < 16) continue;
      out.push({ id: 'x' + id + out.length, x: Math.round(x), y: Math.round(y), kind: 'wild', v: Math.floor(rnd() * 8), stage: 'tree', age: 0, ripe: 0, cd: 0 }); }
    return out;
  }
  const woodlandOf = (plots, x, y) => { const p = plotAt(x, y); return !!(p && plots && plots[p.id] && plots[p.id].mod === 'woodland'); };
  // the playground's things, in world units (for drawing, and for the children to walk to)
  function playSpots(plots) {
    const out = [];
    for (const id of plotsOfMod(plots, 'playground')) { const [x0, y0, x1, y1] = plot(id).rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      out.push({ plot: id, kind: 'slide', x: cx - 14, y: cy - 8, stand: P(cx - 14, cy + 6) }, { plot: id, kind: 'sandbox', x: cx + 12, y: cy + 12, stand: P(cx + 3, cy + 14) },
        { plot: id, kind: 'swing', x: cx + 12, y: cy - 14, stand: P(cx + 12, cy - 6) }); }
    return out;
  }

  // ---------- phase 11 hook (stub): a married child's homestead ----------
  // Not playable yet: marriage needs the new house (placeables, phase 8/9) and a partner from the party / town (phases 9-10).
  // What phase 7 fixes now is WHERE such a household can go: a bought flat plot left as 花甸 or 农田 next to the farm, where the new
  // house plus 6-8 field tiles fit. The rules below are the roadmap's draft numbers so phase 11 can build on them unchanged.
  const HOMESTEAD = { tiles: 6, helpPerDay: 2, helpMinutes: 60, mods: ['meadow', 'field'], terrains: ['flat', 'across', 'slope'] };
  function homesteadSites(plots) {
    return Object.keys(plots || {}).filter(id => { const p = plot(id), q = plots[id];
      return !!(p && q && !p.special && HOMESTEAD.mods.includes(q.mod) && HOMESTEAD.terrains.includes(p.terrain)); });
  }

  // ---------- navigation: paints on a path.js grid (H: the grid helpers, so this file does not depend on path.js) ----------
  // opts.regions: open areas (old regions + bought plots), opts.graze: the fold's meadow is bought
  const NAVMASK = new Map(); // static river / cliff cells per grid shape
  function staticMask(g, H) {
    const key = g.x0 + ',' + g.y0 + ',' + g.w + ',' + g.h + ',' + g.cell; let m = NAVMASK.get(key); if (m) return m;
    m = new Uint8Array(g.w * g.h);
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { const [x, y] = H.worldOf(g, i, j);
      if (riverDist(x, y) < riverHW(x, y) + 0.5) m[j * g.w + i] = 1;
      else { const ry = ridgeY(x); if (y < ry + 1 && y > ry - CLIFF - 1) m[j * g.w + i] = 2; else if (y <= ry - CLIFF - 1) m[j * g.w + i] = 3; } }
    NAVMASK.set(key, m); return m;
  }
  function fenceRect(g, H, r, openings, open) {
    const [x0, y0, x1, y1] = r, near = (x, y) => open && openings.some(p => Math.hypot(x - p.x, y - p.y) < 12);
    for (let x = x0; x < x1; x += 8) for (const y of [y0, y1]) if (!near(x + 4, y)) H.paintSeg(g, x, y, Math.min(x + 8, x1), y, H.FENCE_HW, H.BLOCKED);
    for (let y = y0; y < y1; y += 8) for (const x of [x0, x1]) if (!near(x, y + 4)) H.paintSeg(g, x, y, x, Math.min(y + 8, y1), H.FENCE_HW, H.BLOCKED);
  }
  function navPaint(g, H, opts) {
    const o = opts || {}, open = o.regions || [], m = staticMask(g, H);
    for (let k = 0; k < m.length; k++) if (m[k]) g.cost[k] = H.BLOCKED; // the river, the cliff, and the plateau (only the trail goes up)
    for (const p of PLOTS) if (!p.special) fenceRect(g, H, p.rect, [p.gate], open.includes(p.id));
    if (o.graze && open.includes('orchard')) { const r = GRAZE.rect;
      fenceRect(g, H, [r[0], r[1], r[2] - 0.01, r[3]], [], false);
      H.paintBox(g, r[2] - 3, r[1] + 2, r[2] + 3, r[3] - 2, H.GRASS); // the meadow's own east side is the orchard fence...
      fenceRect(g, H, [r[2] - 0.01, r[1], r[2], r[3]], [], false);
      H.paintBox(g, GRAZE.gap[0] - 3, GRAZE.gap[1], GRAZE.gap[2] + 3, GRAZE.gap[3], H.GRASS); } // ...which opens beside the fold
  }
  function navCarve(g, H, opts) {
    const o = opts || {}, open = o.regions || [];
    for (const p of PLOTS) if (!p.special && open.includes(p.id)) H.carveDisc(g, p.gate.x, p.gate.y, 4.5, H.DIRT);
    if (open.includes('bridge')) H.paintBox(g, BRIDGE.x - 3.5, BRIDGE.y0 - 4, BRIDGE.x + 3.5, BRIDGE.y1 + 4, H.DIRT);
    if (open.includes('trail')) for (const line of [TRAIL, TRAIL_TOP, TRAIL_EAST]) for (let i = 0; i < line.length - 1; i++) H.paintSeg(g, line[i].x, line[i].y, line[i + 1].x, line[i + 1].y, 3, H.DIRT);
    if (open.includes('summit') || open.includes('alp')) { /* plateau plots are walkable inside their fence */ }
    for (const id of ['summit', 'alp']) if (open.includes(id)) { const r = plot(id).rect; H.paintBox(g, r[0] + 2, r[1] + 2, r[2] - 2, r[3] - 2, H.GRASS); H.carveDisc(g, plot(id).gate.x, plot(id).gate.y, 4.5, H.DIRT); }
  }

  const api = { MODULES, MODULE_IDS, TERRAIN, RIVER, RIVER_HW, BANK, BRIDGE, TRAIL, TRAIL_TOP, TRAIL_EAST, TOWN, GRAZE, PLOTS, PLOT_IDS, FIELD_PLOT_IDS, ROUTES, OLD, CLIFF,
    plot, isPlotId, plotAt, terrainAt, clearAt, outer, riverDist, riverHW, ridgeY, onTrail, polyDist, grazeHours,
    gateOpen, workers, offer, rezoneOffer, setupOf, emptyPlots, validPlots, modsText, plotsOfMod, woodlandTrees, woodlandOf, playSpots, HOMESTEAD, homesteadSites, navPaint, navCarve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFPlots = api;
})(typeof window !== 'undefined' ? window : globalThis);
