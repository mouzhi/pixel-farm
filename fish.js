// 像素农场 · 钓鱼规则（纯数据和纯函数；浏览器里是 window.PFFish，Node 里可以 require 做单元测试）
// The starter bamboo rod is always owned (shop level 0). Pond fishing is the lowest-priority idle job.
// A steel / carbon rod bites faster and shifts the table toward rarer fish. Sea fishing needs the seaside
// region and the sea rod, and uses a higher-value table. Catches go in the basket and are sold at the stall.
'use strict';
(function (root) {
  // w: relative weight at the bamboo rod. price: gold the merchant pays. col: billboard / pop-text colour.
  const POND = [
    { id: 'crucian', name: '鲫鱼', w: 0.52, price: 5, col: '#9a9ea0' },
    { id: 'carp', name: '鲤鱼', w: 0.26, price: 9, col: '#cf6a3c' },
    { id: 'grassc', name: '草鱼', w: 0.13, price: 13, col: '#52af3a' },
    { id: 'bass', name: '鲈鱼', w: 0.07, price: 20, col: '#666a73' },
    { id: 'koi', name: '锦鲤', w: 0.02, price: 36, col: '#e06a2c' },
  ];
  const SEA = [
    { id: 'sardine', name: '沙丁鱼', w: 0.40, price: 16, col: '#cfd0c6' },
    { id: 'seabass', name: '海鲈', w: 0.28, price: 28, col: '#4fa3cf' },
    { id: 'snapper', name: '鲷鱼', w: 0.16, price: 48, col: '#e57fa0' },
    { id: 'tuna', name: '金枪鱼', w: 0.10, price: 80, col: '#2f6ea0' },
    { id: 'sword', name: '旗鱼', w: 0.06, price: 140, col: '#1f3d68' },
  ];
  const ALL = POND.concat(SEA);
  const BY_ID = Object.fromEntries(ALL.map(f => [f.id, f]));
  const FISH_IDS = ALL.map(f => f.id);
  // shop levels of `rod` (0 = the free bamboo rod). wait is [min, max] game minutes on the hook.
  const RODS = [
    { id: 'bamboo', name: '竹竿', wait: [38, 54], miss: 0.16, rare: 1, bite: 1 },
    { id: 'steel', name: '钢竿', wait: [26, 40], miss: 0.09, rare: 1.55, bite: 1.15 },
    { id: 'carbon', name: '碳素竿', wait: [16, 28], miss: 0.05, rare: 2.2, bite: 1.3 },
  ];
  const CAST = 4, BITE = 3, REEL = 5; // game minutes: the ritual around the wait
  const rodOf = lv => RODS[Math.max(0, Math.min(RODS.length - 1, lv | 0))];
  const isFish = id => !!BY_ID[id];
  const fishOf = id => BY_ID[id] || null;
  const priceOf = id => (BY_ID[id] && BY_ID[id].price) || 0;
  // raise the tail of the table: a better rod makes rare fish more likely without deleting the commons
  function pickFrom(list, rare, rnd) {
    const w = list.map((f, i) => f.w * Math.pow(rare, list.length < 2 ? 0 : i / (list.length - 1)));
    let t = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { t -= w[i]; if (t <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function waitTime(lv, rnd) { const r = rodOf(lv), a = r.wait[0], b = r.wait[1]; return a + Math.floor(rnd() * (b - a + 1)); }
  // one hook: { miss } or { fish, gold }. `water` is 'pond' or 'sea'.
  function roll(water, lv, rnd) {
    const r = rodOf(lv), list = water === 'sea' ? SEA : POND;
    if (rnd() < r.miss) return { miss: true, water };
    const f = pickFrom(list, r.rare, rnd);
    return { miss: false, water, fish: f.id, name: f.name, gold: f.price, col: f.col };
  }
  // where the farmer stands and where the bobber sits (world units). The seaside pier tip is on PFWorld.
  const POND_SPOT = { water: 'pond', stand: { x: 54, y: 94 }, hook: { x: 40, y: 103 } };
  const api = { POND, SEA, ALL, BY_ID, FISH_IDS, RODS, CAST, BITE, REEL, POND_SPOT,
    rodOf, isFish, fishOf, priceOf, pickFrom, waitTime, roll };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFish = api;
})(typeof window !== 'undefined' ? window : globalThis);
