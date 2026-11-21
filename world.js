// 像素农场 · 大地图、区域、树木与果树的规则（纯数据和纯函数；浏览器里是 window.PFWorld，Node 里可以 require 做单元测试）
// Phase 3: the world grows from the 24x16-tile farm to 64x40 tiles. The farm keeps its coordinates (0..192 x 0..128 world
// units, 8 units a tile); fenced regions around it are bought in the shop. Trees in the forest can be chopped (player order,
// needs the axe) for wood and a fruit sapling; saplings are transplanted where the player points and bear fruit after 5 days.
'use strict';
(function (root) {
  const TILE = 8;
  const WORLD = { x0: -256, y0: -208, x1: 1008, y1: 384 };           // v5.11.0: +46 tiles east (158 x 74): the town moved east and grew (town.js)
  const WORLD58 = { x0: -256, y0: -208, x1: 640, y1: 384 };           // v5.8.0: +24 tiles east for the town (town.js); everything west of 448 is unchanged
  const WORLD55 = { x0: -256, y0: -208, x1: 448, y1: 384 };         // the v5.5.0 map: its scattered decals and forest keep their old random layout
            // v5.5.0: 88 x 74 tiles (was 64 x 50, -160..352 x -112..288); old coordinates did not move, the ring is plots.js
  const HOME = { x0: 0, y0: 0, x1: 192, y1: 128 };                  // the original farm
  // rect: the fenced clearing; field: a tile block (c0/r0 in world tiles); gate: where the path enters; barrel: local water
  const REGIONS = [
    { id: 'forest', name: '林场', rect: [0, -104, 192, -38], gate: { x: 100, y: -38 }, sign: { x: 110, y: -34 }, center: { x: 96, y: -72 },
      desc: '十几棵能砍的树，砍完会慢慢长回来' },
    { id: 'east', name: '东田', rect: [216, 16, 344, 116], gate: { x: 216, y: 66 }, sign: { x: 212, y: 56 }, center: { x: 280, y: 66 },
      field: { c0: 30, r0: 7, cols: 8, rows: 3 }, barrel: { x: 232, y: 46 }, desc: '24 格大田，满地杂物' },
    { id: 'orchard', name: '果园坡', rect: [-150, -100, -40, 16], gate: { x: -40, y: 8 }, sign: { x: -36, y: 18 }, center: { x: -95, y: -42 },
      apples: [[-120, -70], [-84, -78], [-104, -40]], barrel: { x: -56, y: -10 }, desc: '3 棵苹果树，还有地方移植树苗' },
    { id: 'south', name: '南坡梯田', rect: [40, 150, 184, 204], gate: { x: 68, y: 150 }, sign: { x: 58, y: 148 }, center: { x: 112, y: 178 },
      field: { c0: 10, r0: 21, cols: 8, rows: 3 }, barrel: { x: 160, y: 164 }, desc: '24 格向阳坡地，适合草莓和西瓜' },
    // Phase 4: the pasture. coop / shed are where the buildings go once bought; roam: where each kind wanders
    { id: 'pasture', name: '北牧场', rect: [216, -100, 344, -8], gate: { x: 216, y: -40 }, sign: { x: 212, y: -50 }, center: { x: 280, y: -54 },
      barrel: { x: 232, y: -22 }, desc: '一片草场，盖了牛棚就能养牛' },
    // v4.6 seaside: a fenced beach south-east of the south terrace; the pier and open sea sit in `water` (still area 'coast')
    { id: 'coast', name: '海边', rect: [200, 212, 344, 256], gate: { x: 220, y: 212 }, sign: { x: 208, y: 208 }, center: { x: 272, y: 236 },
      pier: { x: 280, y: 256 }, water: [200, 248, 352, 288],
      fish: { stand: { x: 280, y: 268 }, hook: { x: 280, y: 278 } }, desc: '沙滩和码头，有海竿就能海钓' },
  ];
  // v4.7: where each building, its trough and its animals' patch are. needs: the region that has to be bought first (the home
  // coop needs none). bld: building centre; door: where eggs are laid / animals sleep; trough: its own trough; roam: x0,y0,x1,y1.
  const PENS = {
    coop: { name: '鸡舍', needs: null, bld: { x: 18, y: 64 }, door: { x: 19, y: 78 }, trough: { x: 46, y: 62 }, roam: [8, 60, 56, 86], water: 1 }, // inside the fenced yard west of the house
    sty: { name: '猪圈', needs: 'forest', bld: { x: 76, y: -24 }, door: { x: 76, y: -11 }, trough: { x: 62, y: -6 }, roam: [58, -34, 94, -2], water: 2 }, // the clearing behind the house, west of the forest path
    fold: { name: '羊圈', needs: 'orchard', bld: { x: -128, y: -14 }, door: { x: -126, y: 0 }, trough: { x: -96, y: -2 }, roam: [-144, -34, -60, 8], water: 2 },
    shed: { name: '牛棚', needs: 'pasture', bld: { x: 312, y: -76 }, door: { x: 312, y: -58 }, trough: { x: 272, y: -24 }, roam: [244, -56, 336, -14], water: 2, hay: { x: 336, y: -46 } },
  };
  const PEN_IDS = Object.keys(PENS);
  // pets: cats nap on these sunny spots (home ones always, region ones once bought); dogs follow the farmer
  const NAP_SPOTS = [{ x: 60, y: 40 }, { x: 64, y: 104 }, { x: 128, y: 36 }, { x: 88, y: 30 }, { x: 140, y: 104 }, { x: 20, y: 46 },
    { x: 120, y: -50, area: 'forest' }, { x: -90, y: -60, area: 'orchard' }, { x: 260, y: 40, area: 'east' }, { x: 120, y: 170, area: 'south' }, { x: 240, y: -30, area: 'pasture' }, { x: 252, y: 226, area: 'coast' }];
  const REGION_IDS = REGIONS.map(r => r.id);
  const region = id => REGIONS.find(r => r.id === id);
  const inRect = (x, y, [x0, y0, x1, y1], pad = 0) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
  // which area a point belongs to: 'home', a region id, or null (wild forest)
  function areaAt(x, y) {
    if (inRect(x, y, [HOME.x0 - 4, HOME.y0 - 4, HOME.x1 + 4, HOME.y1 + 4])) return 'home';
    for (const r of REGIONS) if (inRect(x, y, r.rect) || (r.water && inRect(x, y, r.water))) return r.id;
    return null;
  }
  // shoreline of the southern sea (world units). Deterministic, no game RNG.
  function seaShore(x) { return 250 + Math.sin(x * 0.07) * 8 + Math.sin(x * 0.19 + 1.3) * 5; }
  // 'water' / 'sand' / null. The ocean is south of the shore and east of x≈155, so it never touches the south terrace.
  function seaAt(x, y) {
    if (x < 155) return null;
    const s = seaShore(x);
    if (y > s + 2) return 'water';
    if (y > s - 9) return 'sand';
    return null;
  }
  // v5.11.0.20 河口: what the *picture* shows there. seaAt (paths, rain, props, fishing, fog) keeps the straight x 155 edge; the
  // ground paints an irregular sandy west coast over it that never comes west of x 155 (so no plot or fence is ever in water),
  // bends in round the river mouth, and rounds the corner into the southern beach.
  const MOUTH = { x: 156, y: 304 };
  function seaWestEdge(y) {
    const e = 163.5 + Math.sin(y * 0.083 + 0.7) * 3.2 + Math.sin(y * 0.21 + 2.1) * 1.6 + Math.sin(y * 0.037 + 4) * 2.4;
    const bay = 7 * Math.exp(-(((y - MOUTH.y) / 15) ** 2)); // the coast bends in to meet the widening river
    return Math.max(155.5, e - bay);
  }
  const COAST_SAND = 10;
  function seaLook(x, y) { // 'water' / 'sand' / null, like seaAt
    if (x < 155 - COAST_SAND - 2) return null; const s = seaShore(x);
    if (x < 155 && y < s - 12) return null;
    const ex = seaWestEdge(y), dS = s + 2 - y, dW = ex - x; // > 0: on the land side of the south / west waterline
    if (dS < 0 && dW < 0) return 'water';
    const d = dS < 0 ? dW : dW < 0 ? dS : Math.min(dS, dW) < 6 ? Math.min(dS, dW) : Math.hypot(dS, dW); // the corner is rounded
    return d < COAST_SAND + 1 ? 'sand' : null;
  }
  // how far out to sea a point is (world units past the nearer waterline; negative on land): the depth bands follow it (game.js seaBandMap)
  function coastDist(x, y) { return Math.min(y - (seaShore(x) + 2), x - seaWestEdge(y)); }
  // paths from the farm to each gate (world units, poly-lines); the farmer walks them and the ground paints them as dirt
  const ROUTES = {
    forest: [{ x: 100, y: 24 }, { x: 100, y: -38 }],
    east: [{ x: 158, y: 54 }, { x: 176, y: 54 }, { x: 176, y: 66 }, { x: 216, y: 66 }],
    orchard: [{ x: 36, y: 42 }, { x: 24, y: 42 }, { x: 10, y: 34 }, { x: -20, y: 22 }, { x: -40, y: 8 }],
    south: [{ x: 68, y: 112 }, { x: 68, y: 150 }],
    pasture: [{ x: 158, y: 54 }, { x: 176, y: 54 }, { x: 200, y: 54 }, { x: 200, y: -40 }, { x: 216, y: -40 }],
    coast: [{ x: 176, y: 66 }, { x: 176, y: 190 }, { x: 220, y: 212 }],
  };
  // fruit trees: fruit per picking, days between pickings, sell price each
  const FRUIT = {
    apple: { name: '苹果', n: 5, every: 3, price: 12 },
    orange: { name: '橘子', n: 4, every: 2, price: 15 },
  };
  const FRUIT_IDS = Object.keys(FRUIT);
  const WOOD = { perChop: 8, price: 4 };   // v5.3.1: 5 → 8 per tree (axe levels and the lumber hut add more, wood.js)
  const SAPLING_DAYS = 5;                   // a transplanted sapling bears fruit 5 days later
  const STUMP_TO_SAPLING = 2, STUMP_TO_TREE = 5; // a chopped forest tree grows back (v5.3.1: 7 → 5 nights; the lumber hut makes it 3)
  const MAX_ORDERS = 24;
  // one sim tree: { id, x, y, kind: 'wild' | 'apple' | 'orange', v: art variant, stage: 'tree' | 'stump' | 'sapling', age, ripe, cd }
  function fruitTree(id, x, y, kind, v) { return { id, x, y, kind, v, stage: 'tree', age: 0, ripe: 1, cd: FRUIT[kind].every }; }
  // a fixed layout (independent of the game's random stream), so a save without trees rebuilds the same forest
  function defaultTrees() {
    const out = []; let s = 7331; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const F = region('forest').rect;
    for (let y = F[1] + 12; y <= F[3] - 10; y += 15) for (let x = F[0] + 14; x <= F[2] - 12; x += 22) {
      const jx = x + (rnd() - 0.5) * 9 + ((y / 15) & 1) * 9, jy = y + (rnd() - 0.5) * 6;
      if (Math.abs(jx - 100) < 10 && jy > F[3] - 30) continue; // keep the gate clear
      if (rnd() < 0.78) out.push({ id: 'w' + out.length, x: Math.round(jx), y: Math.round(jy), kind: 'wild', v: Math.floor(rnd() * 8), stage: 'tree', age: 0, ripe: 0, cd: 0 });
    }
    region('orchard').apples.forEach(([x, y], i) => out.push(fruitTree('a' + i, x, y, 'apple', i)));
    EXTRA_TREES.forEach(t => out.push(Object.assign({}, t)));
    return out;
  }
  // one night for one tree
  function treeOvernight(t) {
    if (t.stage === 'stump') { t.age++; if (t.age >= STUMP_TO_SAPLING) { t.stage = 'sapling'; } return t; }
    if (t.stage === 'sapling') { t.age++;
      if (t.kind === 'wild' ? t.age >= STUMP_TO_TREE : t.age >= SAPLING_DAYS) { t.stage = 'tree'; t.age = 0; if (FRUIT[t.kind]) { t.ripe = 1; t.cd = FRUIT[t.kind].every; } }
      return t; }
    if (FRUIT[t.kind] && !t.ripe) { t.cd--; if (t.cd <= 0) { t.ripe = 1; t.cd = FRUIT[t.kind].every; } }
    return t;
  }
  function pickFruit(t) { if (!t.ripe || !FRUIT[t.kind] || t.stage !== 'tree') return 0; t.ripe = 0; t.cd = FRUIT[t.kind].every; return FRUIT[t.kind].n; }
  // chopping a grown forest tree: wood plus one fruit sapling (apple 60% / orange 40%)
  // v5.0: chopping any grown wild tree: wood plus one fruit sapling (apple 60% / orange 40%), and sometimes a little extra
  // (DROPS, rolled in order on one number). Only trees inside 林场 grow back; anywhere else the stump is cleared overnight.
  const DROPS = [
    { id: 'fruit', p: 0.25, name: '果子' },        // 2 apples or oranges into the basket
    { id: 'flower', p: 0.15, name: '野花' },       // a wildflower: a gift for her (or 5 gold at the market)
    { id: 'seed', p: 0.08, name: '稀有种子' },     // 1 strawberry or watermelon seed into the barn, even before the unlock
    { id: 'coins', p: 0.08, name: '几枚铜钱' },    // 10–30 gold dropped in the roots
    { id: 'nest', p: 0.04, name: '鸟窝' },         // an egg in an old nest
  ];
  function chopYield(rnd) {
    const out = { wood: WOOD.perChop, sapling: rnd() < 0.6 ? 'apple' : 'orange', drop: null };
    let r = rnd(), acc = 0; for (const d of DROPS) { acc += d.p; if (r < acc) { out.drop = d.id; break; } }
    if (out.drop === 'fruit') { out.fruit = rnd() < 0.6 ? 'apple' : 'orange'; out.n = 2; }
    if (out.drop === 'seed') out.seed = rnd() < 0.6 ? 'strawberry' : 'watermelon';
    if (out.drop === 'coins') out.gold = 10 + Math.floor(rnd() * 21);
    return out;
  }
  // which trees can be marked: wild (never fruit) grown trees inside the farm or a bought region. The rim forest that frames
  // the map lies outside every area, so it can never be cleared.
  const choppable = (t, regions) => t.kind === 'wild' && t.stage === 'tree' && (() => { const a = areaAt(t.x, t.y); return a === 'home' || (a && regions.includes(a)); })();
  const regrows = t => areaAt(t.x, t.y) === 'forest';
  // v5.0: wild trees outside the forest (the four by the pond, a few at the farm's corners, two or three per region)
  const EXTRA_TREES = [[22, 84, 0], [44, 82, 4], [8, 96, 3], [6, 62, 5], [8, 14, 2], [128, 6, 6], [186, 84, 1], [184, 118, 7],
    [334, 24, 0], [226, 104, 3], [338, 108, 5], [48, 196, 2], [178, 158, 6], [226, -92, 1], [338, -92, 4], [-144, -92, 7], [-60, -92, 0]]
    .map(([x, y, v], i) => ({ id: 'h' + i, x, y, kind: 'wild', v, stage: 'tree', age: 0, ripe: 0, cd: 0 }));
  // v5.0 house: tiers after the starting cabin; each adds a room (pop = people who can live there). Wood + gold.
  const HOUSE_TIERS = [{ name: '小木屋', pop: 1, woodCap: 100 }, { name: '大木屋', pop: 2, woodCap: 200 }, { name: '二层农舍', pop: 3, woodCap: 400 }, { name: '庄园', pop: 4, woodCap: 800 }];
  const api = { PENS, PEN_IDS, NAP_SPOTS, TILE, WORLD, WORLD55, HOME, REGIONS, REGION_IDS, region, inRect, areaAt, seaShore, seaAt, seaLook, seaWestEdge, coastDist, MOUTH, ROUTES, FRUIT, FRUIT_IDS, WOOD, SAPLING_DAYS, STUMP_TO_SAPLING, STUMP_TO_TREE,
    MAX_ORDERS, fruitTree, defaultTrees, treeOvernight, pickFruit, chopYield, choppable, regrows, DROPS, EXTRA_TREES, HOUSE_TIERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
