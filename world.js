// 像素农场 · 大地图、区域、树木与果树的规则（纯数据和纯函数；浏览器里是 window.PFWorld，Node 里可以 require 做单元测试）
// Phase 3: the world grows from the 24x16-tile farm to 64x40 tiles. The farm keeps its coordinates (0..192 x 0..128 world
// units, 8 units a tile); fenced regions around it are bought in the shop. Trees in the forest can be chopped (player order,
// needs the axe) for wood and a fruit sapling; saplings are transplanted where the player points and bear fruit after 5 days.
'use strict';
(function (root) {
  const TILE = 8;
  const WORLD = { x0: -160, y0: -112, x1: 352, y1: 208 };           // 64 x 40 tiles
  const HOME = { x0: 0, y0: 0, x1: 192, y1: 128 };                  // the original farm
  // rect: the fenced clearing; field: a tile block (c0/r0 in world tiles); gate: where the path enters; barrel: local water
  const REGIONS = [
    { id: 'forest', name: '林场', rect: [0, -104, 192, -38], gate: { x: 100, y: -38 }, sign: { x: 110, y: -34 }, center: { x: 96, y: -72 },
      desc: '十几棵能砍的树，砍完会慢慢长回来' },
    { id: 'east', name: '东田', rect: [216, 16, 344, 116], gate: { x: 216, y: 66 }, sign: { x: 212, y: 56 }, center: { x: 280, y: 66 },
      field: { c0: 30, r0: 7, cols: 8, rows: 3 }, barrel: { x: 232, y: 46 }, desc: '24 格大田，满地杂物' },
    { id: 'orchard', name: '果园坡', rect: [-150, -100, -40, 16], gate: { x: -40, y: 8 }, sign: { x: -36, y: 18 }, center: { x: -95, y: -42 },
      apples: [[-120, -70], [-84, -78], [-104, -40]], desc: '3 棵苹果树，还有地方移植树苗' },
    { id: 'south', name: '南坡梯田', rect: [40, 150, 184, 204], gate: { x: 68, y: 150 }, sign: { x: 58, y: 148 }, center: { x: 112, y: 178 },
      field: { c0: 10, r0: 21, cols: 8, rows: 3 }, barrel: { x: 160, y: 164 }, desc: '24 格向阳坡地，适合草莓和西瓜' },
    // Phase 4: the pasture. coop / shed are where the buildings go once bought; roam: where each kind wanders
    { id: 'pasture', name: '北牧场', rect: [216, -100, 344, -8], gate: { x: 216, y: -40 }, sign: { x: 212, y: -50 }, center: { x: 280, y: -54 },
      barrel: { x: 232, y: -22 }, trough: { x: 272, y: -24 }, coop: { x: 248, y: -78 }, shed: { x: 312, y: -76 }, hay: { x: 336, y: -46 },
      roam: { chicken: [226, -62, 296, -14], sheep: [262, -56, 336, -14], cow: [262, -56, 336, -14] }, desc: '一片草场，能养鸡、羊和牛' },
  ];
  const REGION_IDS = REGIONS.map(r => r.id);
  const region = id => REGIONS.find(r => r.id === id);
  const inRect = (x, y, [x0, y0, x1, y1], pad = 0) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
  // which area a point belongs to: 'home', a region id, or null (wild forest)
  function areaAt(x, y) {
    if (inRect(x, y, [HOME.x0 - 4, HOME.y0 - 4, HOME.x1 + 4, HOME.y1 + 4])) return 'home';
    for (const r of REGIONS) if (inRect(x, y, r.rect)) return r.id;
    return null;
  }
  // paths from the farm to each gate (world units, poly-lines); the farmer walks them and the ground paints them as dirt
  const ROUTES = {
    forest: [{ x: 100, y: 24 }, { x: 100, y: -38 }],
    east: [{ x: 158, y: 54 }, { x: 176, y: 54 }, { x: 176, y: 66 }, { x: 216, y: 66 }],
    orchard: [{ x: 36, y: 42 }, { x: 24, y: 42 }, { x: 10, y: 34 }, { x: -20, y: 22 }, { x: -40, y: 8 }],
    south: [{ x: 68, y: 112 }, { x: 68, y: 150 }],
    pasture: [{ x: 158, y: 54 }, { x: 176, y: 54 }, { x: 200, y: 54 }, { x: 200, y: -40 }, { x: 216, y: -40 }],
  };
  // fruit trees: fruit per picking, days between pickings, sell price each
  const FRUIT = {
    apple: { name: '苹果', n: 5, every: 3, price: 12 },
    orange: { name: '橘子', n: 4, every: 2, price: 15 },
  };
  const FRUIT_IDS = Object.keys(FRUIT);
  const WOOD = { perChop: 5, price: 4 };
  const SAPLING_DAYS = 5;                   // a transplanted sapling bears fruit 5 days later
  const STUMP_TO_SAPLING = 3, STUMP_TO_TREE = 7; // a chopped forest tree grows back
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
  function chopYield(rnd) { return { wood: WOOD.perChop, sapling: rnd() < 0.6 ? 'apple' : 'orange' }; }
  const choppable = (t, regions) => t.kind === 'wild' && t.stage === 'tree' && regions.includes('forest');
  const api = { TILE, WORLD, HOME, REGIONS, REGION_IDS, region, inRect, areaAt, ROUTES, FRUIT, FRUIT_IDS, WOOD, SAPLING_DAYS, STUMP_TO_SAPLING, STUMP_TO_TREE,
    MAX_ORDERS, fruitTree, defaultTrees, treeOvernight, pickFruit, chopYield, choppable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
