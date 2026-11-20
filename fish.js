// 像素农场 · 钓鱼规则（纯数据和纯函数；浏览器里是 window.PFFish，Node 里可以 require 做单元测试）
// The starter bamboo rod is always owned (shop level 0). Pond fishing is the lowest-priority idle job.
// A steel / carbon rod bites faster and shifts the table toward rarer fish. Sea fishing needs the seaside
// region and the sea rod, and uses a higher-value table. Catches go in the basket and are sold at the stall.
'use strict';
(function (root) {
  // w: relative weight at the bamboo rod. price: gold the merchant pays. col: billboard / pop-text colour.
  // rare: a precious catch — the fish glows on the way out, and the fisher shows a little happy emote.
  const POND = [
    { id: 'crucian', name: '鲫鱼', w: 0.52, price: 5, col: '#9a9ea0' },
    { id: 'carp', name: '鲤鱼', w: 0.26, price: 9, col: '#cf6a3c' },
    { id: 'grassc', name: '草鱼', w: 0.13, price: 13, col: '#52af3a' },
    { id: 'bass', name: '鲈鱼', w: 0.07, price: 20, col: '#666a73' },
    { id: 'koi', name: '锦鲤', w: 0.02, price: 36, col: '#e06a2c', rare: 1 },
  ];
  const SEA = [
    { id: 'sardine', name: '沙丁鱼', w: 0.40, price: 16, col: '#cfd0c6' },
    { id: 'seabass', name: '海鲈', w: 0.28, price: 28, col: '#4fa3cf' },
    { id: 'snapper', name: '鲷鱼', w: 0.16, price: 48, col: '#e57fa0', rare: 1 },
    { id: 'tuna', name: '金枪鱼', w: 0.10, price: 80, col: '#2f6ea0', rare: 1 },
    { id: 'sword', name: '旗鱼', w: 0.06, price: 140, col: '#1f3d68', rare: 1 },
  ];
  const ALL = POND.concat(SEA);
  const BY_ID = Object.fromEntries(ALL.map(f => [f.id, f]));
  const FISH_IDS = ALL.map(f => f.id);
  // v5.4.0: a pack of fish food from the shop. On a day the pond was fed, bass and koi are a bit more likely;
  // common fish never disappear, and a koi still stays rare even with the best rod.
  const FOOD = { id: 'fishfood', name: '鱼食', price: 8, stock: 30 };
  const FED_BOOST = { bass: 1.8, koi: 1.8 };
  const POND_CAP = 8;
  // ornamental fish that can live in the home pond (sea fish stay out of the freshwater). koi comes from a catch;
  // goldfish is sold at the stall. Both swim for looking at, and are not sold once they are in the pond.
  const ORNAMENTAL = [
    { id: 'koi', name: '锦鲤', source: 'catch', water: 'pond', col: '#e06a2c' },
    { id: 'goldfish', name: '金鱼', source: 'shop', water: 'pond', col: '#e8a02a', price: 80 },
  ];
  const ORN_BY = Object.fromEntries(ORNAMENTAL.map(o => [o.id, o]));
  const isOrnamental = id => !!ORN_BY[id];
  const pondOk = id => !!(ORN_BY[id] && ORN_BY[id].water === 'pond');
  // shop levels of `rod` (0 = the free bamboo rod). wait is [min, max] game minutes on the hook.
  const RODS = [
    { id: 'bamboo', name: '竹竿', wait: [38, 54], miss: 0.16, rare: 1, bite: 1 },
    { id: 'steel', name: '钢竿', wait: [26, 40], miss: 0.09, rare: 1.55, bite: 1.15 },
    { id: 'carbon', name: '碳素竿', wait: [16, 28], miss: 0.05, rare: 2.2, bite: 1.3 },
  ];
  const CAST = 4, BITE = 3, REEL = 5, SHOW = 4; // game minutes: the ritual around the wait (show = land and look)
  const shopRod = lv => RODS[Math.max(0, Math.min(RODS.length - 1, lv | 0))];
  // v5.10.5: the smithy can further shorten the wait, cut misses and lift rare fish (smith is { wait, miss, rare })
  function rodOf(lv, smith) {
    const r = shopRod(lv); if (!smith) return r;
    const wait0 = Math.max(8, r.wait[0] + (smith.wait || 0)), wait1 = Math.max(wait0 + 2, r.wait[1] + (smith.wait || 0));
    return { id: r.id, name: r.name, wait: [wait0, wait1], miss: Math.max(0.02, r.miss + (smith.miss || 0)), rare: r.rare * (smith.rare || 1), bite: r.bite };
  }
  const isFish = id => !!BY_ID[id];
  const fishOf = id => BY_ID[id] || null;
  const priceOf = id => (BY_ID[id] && BY_ID[id].price) || 0;
  const isRare = id => !!(BY_ID[id] && BY_ID[id].rare);
  // raise the tail of the table: a better rod makes rare fish more likely without deleting the commons
  function pickFrom(list, rare, rnd, boost) {
    const w = list.map((f, i) => f.w * Math.pow(rare, list.length < 2 ? 0 : i / (list.length - 1)) * ((boost && boost[f.id]) || 1));
    let t = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { t -= w[i]; if (t <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function waitTime(lv, rnd, smith) { const r = rodOf(lv, smith), a = r.wait[0], b = r.wait[1]; return a + Math.floor(rnd() * (b - a + 1)); }
  // one hook: { miss } or { fish, gold }. `water` is 'pond' or 'sea'. `fed` raises bass and koi when the home pond was fed today.
  function roll(water, lv, rnd, fed, smith) {
    const r = rodOf(lv, smith), list = water === 'sea' ? SEA : POND;
    if (rnd() < r.miss) return { miss: true, water };
    const f = pickFrom(list, r.rare, rnd, water === 'pond' && fed ? FED_BOOST : null);
    return { miss: false, water, fish: f.id, name: f.name, gold: f.price, col: f.col, rare: !!f.rare };
  }
  function chanceOf(list, rare, id, boost) {
    const w = list.map((f, i) => f.w * Math.pow(rare, list.length < 2 ? 0 : i / (list.length - 1)) * ((boost && boost[f.id]) || 1));
    const i = list.findIndex(f => f.id === id); if (i < 0) return 0;
    return w[i] / w.reduce((a, b) => a + b, 0);
  }
  // where the farmer stands and where the bobber sits (world units). The seaside pier tip is on PFWorld.
  const POND_SPOT = { water: 'pond', stand: { x: 54, y: 94 }, hook: { x: 40, y: 103 } };

  // style-A palette hexes. The sea rod is used only on the pier (and only once bought).
  const ROD_LOOK = {
    bamboo: { id: 'bamboo', shaft: '#d3984c', ink: '#5e3524', hi: '#ecc27c', wrap: '#8a5530', tip: '#f6ecd0' },
    steel:  { id: 'steel',  shaft: '#9a9ea0', ink: '#3e3f4c', hi: '#cfd0c6', wrap: '#666a73', tip: '#f6ecd0' },
    carbon: { id: 'carbon', shaft: '#3e3f4c', ink: '#1c1626', hi: '#666a73', wrap: '#2f6ea0', tip: '#4fa3cf' },
    searod: { id: 'searod', shaft: '#666a73', ink: '#3e3f4c', hi: '#cfd0c6', wrap: '#a8432e', tip: '#f6ecd0' },
  };
  function rodLook(lv, sea) { return sea ? ROD_LOOK.searod : (ROD_LOOK[rodOf(lv).id] || ROD_LOOK.bamboo); }

  // Screen-space pose of the rod, line, bobber and (on a catch) the fish.
  // The rod always points at the hook, not at the farmer's walk facing: the pond stand is on the water's
  // right, so at the default camera the tip goes up and left. If the camera turns, the tip follows the hook.
  // fx,fy = feet; hx,hy = hook rest; phase = cast|wait|bite|reel|show; u = 0..1 in that phase; t = seconds.
  function pose(fx, fy, hx, hy, phase, u, t, result) {
    u = Math.max(0, Math.min(1, u == null ? 1 : +u)); t = t || 0;
    const toward = hx < fx ? -1 : 1, faceLeft = toward < 0;
    const grip = { x: fx + toward * 3, y: fy - 11 };
    let ang, len = 16; // ang 0 = horizontal toward the water, negative = tip up
    if (phase === 'cast') { ang = -1.35 + u * 0.72; len = 15 + u; }
    else if (phase === 'wait') { ang = -0.66 + Math.sin(t * 1.4) * 0.04; }
    else if (phase === 'bite') { ang = -0.66 + 0.32 * Math.abs(Math.sin(t * 9)); }
    else if (phase === 'reel') {
      if (u < 0.55) { const p = u / 0.55; ang = -0.5 - p * 0.85; len = 16 - p; }
      else if (u < 0.85) { const p = (u - 0.55) / 0.3; ang = -1.35 + p * 0.35; len = 15; }
      else { const p = (u - 0.85) / 0.15; ang = -1.0 + p * 0.35; len = 15 - p * 3; }
    } else { // show: rod settles, then stows toward the shoulder
      ang = -0.85 + u * 0.25; len = 13 - u * 3;
    }
    const tip = { x: grip.x + Math.cos(ang) * toward * len, y: grip.y + Math.sin(ang) * len };
    const catchOk = result && !result.miss, rare = !!(catchOk && (result.rare || isRare(result.fish)));

    let bobx = hx, boby = hy, slack = 0, showBob = false;
    if (phase === 'cast') {
      bobx = tip.x + (hx - tip.x) * u;
      boby = tip.y + (hy - tip.y) * u - Math.sin(u * Math.PI) * 8;
      showBob = u > 0.18;
    } else if (phase === 'wait') {
      boby = hy + Math.sin(t * 2.2);
      slack = 2; showBob = true;
    } else if (phase === 'bite') {
      boby = hy + 1 + Math.abs(Math.sin(t * 11)) * 1.5;
      showBob = true;
    } else if (phase === 'reel') {
      const bu = Math.min(1, u / 0.22);
      bobx = hx + (fx - hx) * bu * 0.12;
      boby = hy + (1 - bu);
      showBob = u < 0.28 && !catchOk || (u < 0.16);
    }

    let fish = null;
    if (catchOk && (phase === 'reel' || phase === 'show') && (phase === 'show' || u > 0.08)) {
      const p = phase === 'show' ? 1 : Math.max(0, Math.min(1, (u - 0.08) / 0.7));
      const x0 = hx, y0 = hy - 2, x1 = fx + toward * 8, y1 = fy - 13;
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 16;
      const omt = 1 - p, x = omt * omt * x0 + 2 * omt * p * mx + p * p * x1, y = omt * omt * y0 + 2 * omt * p * my + p * p * y1;
      fish = { x, y, p, landed: p >= 0.95 || phase === 'show', glow: rare, dir: -toward };
    }

    let emote = null;
    if (rare && fish && ((phase === 'reel' && u > 0.4) || phase === 'show')) {
      const age = phase === 'show' ? u : (u - 0.4) / 0.6;
      const fade = age < 0.15 ? age / 0.15 : age > 0.75 ? Math.max(0, (1 - age) / 0.25) : 1;
      emote = { x: fx + toward * 2, y: fy - 32 - age * 10, a: fade, kind: 'heart' };
    }

    let lineEnd = null;
    if (phase === 'show') lineEnd = (u < 0.45 && fish) ? { x: fish.x, y: fish.y } : null;
    else if (fish && !fish.landed && fish.p < 0.85) lineEnd = { x: fish.x, y: fish.y };
    else if (showBob) lineEnd = { x: bobx, y: boby };
    else if (phase === 'cast' && u > 0.05) lineEnd = { x: bobx, y: boby };

    return { toward, faceLeft, grip, tip, bob: { x: bobx, y: boby, show: showBob, slack }, lineEnd, fish, emote, ang, len };
  }

  const api = { POND, SEA, ALL, BY_ID, FISH_IDS, FOOD, FED_BOOST, POND_CAP, ORNAMENTAL, ORN_BY,
    RODS, ROD_LOOK, CAST, BITE, REEL, SHOW, POND_SPOT,
    rodOf, isFish, fishOf, priceOf, isRare, isOrnamental, pondOk, pickFrom, waitTime, roll, chanceOf, rodLook, pose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFFish = api;
})(typeof window !== 'undefined' ? window : globalThis);
