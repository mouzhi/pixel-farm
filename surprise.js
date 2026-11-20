// 像素农场 · 田里的小惊喜（纯逻辑；浏览器里是 window.PFSurprise，Node 里可以 require 做单元测试）
// Optional crop / basket fields default off, so this does not bump saveVersion.
// Rates are tuned so a surprise shows up about every 1–3 days and the extra gold stays under ~10% of income.
'use strict';
(function (root) {
  const GIANT_TYPES = ['cabbage', 'pumpkin', 'watermelon'];
  const SHOP_SEEDS = ['strawberry', 'watermelon'];
  // per newly-ripe crop; 3× sell. ~12 daily harvests early on → about one glow every 4 days
  const GLOW_CHANCE = 0.02, GLOW_MULT = 3;
  // per ripe 2×2 of a chunky crop, each morning; 8× one crop ≈ 2× the four sold separately
  const GIANT_CHANCE = 0.10, GIANT_MULT = 6;
  // each carrot seed a cat would have left: chance to swap in a shop-only seed
  const CAT_RARE_CHANCE = 0.18;
  const EGG = { gold: { chance: 0.04, mult: 5, rare: 'gold', name: '金蛋' }, double: { chance: 0.03, mult: 2, rare: 'double', name: '双黄蛋' } }; // v5.9.1: double yolks halved (0.06 -> 0.03), they were a third of all surprises
  const TRUFFLE = { white: { chance: 0.05, mult: 4, rare: 'white', name: '白松露' }, big: { chance: 0.07, mult: 2, rare: 'big', name: '大松露' } };

  const isPart = crop => !!(crop && crop.giantOf);
  const isGiant = crop => !!(crop && crop.giant);
  const keyOf = t => t.f + ',' + t.c + ',' + t.r;
  const itemOf = it => (it && typeof it === 'object') ? it : { type: it };
  const itemType = it => itemOf(it).type;
  const compact = it => {
    const o = itemOf(it);
    if (o.glow || o.giant || o.rare) return o;
    return o.type;
  };

  function tileMap(tiles) {
    const m = new Map();
    for (const t of tiles) m.set(keyOf(t), t);
    return m;
  }
  function blocks2x2(tiles) {
    const m = tileMap(tiles), out = [];
    for (const t of tiles) {
      const a = t, b = m.get(t.f + ',' + (t.c + 1) + ',' + t.r), c = m.get(t.f + ',' + t.c + ',' + (t.r + 1)), d = m.get(t.f + ',' + (t.c + 1) + ',' + (t.r + 1));
      if (a && b && c && d) out.push([a, b, c, d]);
    }
    return out;
  }
  function originOf(t, tiles) {
    if (!t || !t.crop) return t;
    if (t.crop.giant) return t;
    if (!t.crop.giantOf) return t;
    const o = (tiles && tileMap(tiles).get(t.crop.giantOf.f + ',' + t.crop.giantOf.c + ',' + t.crop.giantOf.r)) || null;
    return o || t;
  }
  function partsOf(origin, tiles) {
    if (!origin || !origin.crop || !origin.crop.giant) return [origin];
    const m = tileMap(tiles), out = [];
    for (const dc of [0, 1]) for (const dr of [0, 1]) {
      const t = m.get(origin.f + ',' + (origin.c + dc) + ',' + (origin.r + dr));
      if (t) out.push(t);
    }
    return out;
  }

  function canHarvest(crop, ripeFn) {
    if (!crop) return false;
    if (isPart(crop)) return false;
    if (isGiant(crop)) return true;
    return ripeFn(crop);
  }
  function canGrow(crop, ripeFn) {
    if (!crop || isPart(crop) || isGiant(crop)) return false;
    return !ripeFn(crop);
  }

  function rollGlow(tiles, ripeFn, rnd) {
    const found = [];
    for (const t of tiles) {
      const c = t.crop; if (!c || isPart(c) || isGiant(c) || c.glow) continue;
      if (!ripeFn(c)) continue;
      if (rnd() < GLOW_CHANCE) { c.glow = 1; found.push(t); }
    }
    return found;
  }

  function eligibleBlock(group, ripeFn) {
    const ty = group[0].crop && group[0].crop.type;
    if (!GIANT_TYPES.includes(ty)) return false;
    return group.every(t => t.open !== false && t.crop && t.crop.type === ty && !isGiant(t.crop) && !isPart(t.crop) && ripeFn(t.crop));
  }
  function mergeBlock(group) {
    const [a, b, c, d] = group, ty = a.crop.type;
    const glow = group.some(t => t.crop && t.crop.glow) ? 1 : 0;
    const ref = { f: a.f, c: a.c, r: a.r };
    a.crop = { type: ty, age: a.crop.age, n: 0, rot: a.crop.rot || 0, giant: 1 };
    if (glow) a.crop.glow = 1;
    for (const t of [b, c, d]) {
      t.crop = { type: ty, age: t.crop.age, n: 0, rot: t.crop.rot || 0, giantOf: ref };
      t.watered = false;
    }
    a.watered = false;
    return a;
  }
  function rollGiant(tiles, ripeFn, rnd) {
    const found = [];
    const used = new Set();
    for (const g of blocks2x2(tiles)) {
      if (g.some(t => used.has(t))) continue;
      if (!eligibleBlock(g, ripeFn)) continue;
      if (rnd() >= GIANT_CHANCE) continue;
      const origin = mergeBlock(g);
      for (const t of g) used.add(t);
      found.push(origin);
    }
    return found;
  }
  function clearGiant(origin, tiles) {
    for (const t of partsOf(origin, tiles)) t.crop = null;
  }

  function harvestItem(crop) {
    if (!crop) return null;
    const it = { type: crop.type };
    if (crop.glow) it.glow = 1;
    if (crop.giant) it.giant = 1;
    return compact(it);
  }

  function priceMult(it) {
    const o = itemOf(it); let m = 1;
    if (o.glow) m *= GLOW_MULT;
    if (o.giant) m *= GIANT_MULT;
    if (o.type === 'egg' && o.rare === 'gold') m *= EGG.gold.mult;
    if (o.type === 'egg' && o.rare === 'double') m *= EGG.double.mult;
    if (o.type === 'truffle' && o.rare === 'white') m *= TRUFFLE.white.mult;
    if (o.type === 'truffle' && o.rare === 'big') m *= TRUFFLE.big.mult;
    return m;
  }
  function priceOf(it, base) { return Math.max(1, Math.round((base || 0) * priceMult(it))); }
  function isSurpriseItem(it) {
    const o = itemOf(it);
    return !!(o.glow || o.giant || o.rare);
  }
  function itemName(it, names) {
    const o = itemOf(it), base = (names && names[o.type]) || o.type;
    if (o.giant && o.glow) return '发光的巨大' + base;
    if (o.giant) return '巨大的' + base;
    if (o.glow) return '发光的' + base;
    if (o.type === 'egg' && o.rare === 'gold') return EGG.gold.name;
    if (o.type === 'egg' && o.rare === 'double') return EGG.double.name;
    if (o.type === 'truffle' && o.rare === 'white') return TRUFFLE.white.name;
    if (o.type === 'truffle' && o.rare === 'big') return TRUFFLE.big.name;
    return base;
  }

  function rollProduct(type, rnd) {
    if (type === 'egg') {
      if (rnd() < EGG.gold.chance) return compact({ type: 'egg', rare: 'gold' });
      if (rnd() < EGG.double.chance) return compact({ type: 'egg', rare: 'double' });
    }
    if (type === 'truffle') {
      if (rnd() < TRUFFLE.white.chance) return compact({ type: 'truffle', rare: 'white' });
      if (rnd() < TRUFFLE.big.chance) return compact({ type: 'truffle', rare: 'big' });
    }
    return type;
  }
  function productToast(it) {
    const o = itemOf(it);
    if (o.type === 'egg' && o.rare === 'gold') return { kind: 'gold-egg', msg: '捡到一颗金蛋！' };
    if (o.type === 'egg' && o.rare === 'double') return { kind: 'double-egg', msg: '一颗双黄蛋！' };
    if (o.type === 'truffle' && o.rare === 'white') return { kind: 'white-truffle', msg: '拱出一颗白松露！' };
    if (o.type === 'truffle' && o.rare === 'big') return { kind: 'big-truffle', msg: '拱出一颗好大的松露！' };
    return null;
  }

  // cats normally leave carrot seeds; each seed has a small chance to be a shop-only kind instead
  function catGifts(n, rnd) {
    const add = {}, rare = [];
    for (let i = 0; i < n; i++) {
      if (rnd() < CAT_RARE_CHANCE) {
        const k = SHOP_SEEDS[Math.floor(rnd() * SHOP_SEEDS.length)];
        add[k] = (add[k] || 0) + 1;
        rare.push(k);
      } else add.carrot = (add.carrot || 0) + 1;
    }
    return { add, rare };
  }

  // lightly prefer planting a 2×2 of a chunky crop when the bag allows it
  function neighborsOf(tile, tiles) {
    const m = tileMap(tiles), out = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = m.get(tile.f + ',' + (tile.c + dc) + ',' + (tile.r + dr));
      if (t && t.open !== false) out.push(t);
    }
    return out;
  }
  function pickSeed(tile, tiles, bag, pickBest) {
    const best = pickBest();
    if (!tile) return best;
    const beside = neighborsOf(tile, tiles).filter(t => t.crop && GIANT_TYPES.includes(t.crop.type) && !isPart(t.crop) && (bag[t.crop.type] || 0) > 0);
    if (beside.length) return beside[0].crop.type;
    return best;
  }
  function plantScore(tile, tiles, bag) {
    let s = 0;
    const beside = neighborsOf(tile, tiles);
    for (const n of beside) {
      if (n.crop && GIANT_TYPES.includes(n.crop.type) && !isPart(n.crop) && (bag[n.crop.type] || 0) > 0) s += 3;
      else if (!n.crop && n.tilled && GIANT_TYPES.some(k => (bag[k] || 0) > 0)) s += 1;
    }
    return s;
  }
  function pickPlantTile(empty, tiles, bag, rnd) {
    if (!empty.length) return null;
    const scored = empty.map(t => ({ t, s: plantScore(t, tiles, bag) }));
    const good = scored.filter(o => o.s > 0);
    // most of the time take a 2×2-friendly tile; sometimes just a random one so fields don't look too tidy
    if (good.length && rnd() < 0.7) {
      good.sort((a, b) => b.s - a.s);
      const top = good[0].s, best = good.filter(o => o.s === top);
      return best[Math.floor(rnd() * best.length)].t;
    }
    return empty[Math.floor(rnd() * empty.length)];
  }

  function cropLabel(type, names) { return (names && names[type]) || type; }
  // v5.9.1: the second and later surprise of a kind on one day rewrite one log line with the count instead of adding a line each
  const MERGED = {
    'gold-egg': n => `今天捡到 ${n} 颗金蛋！`, 'double-egg': n => `今天捡到 ${n} 颗双黄蛋`, 'white-truffle': n => `今天拱出 ${n} 颗白松露！`,
    'big-truffle': n => `今天拱出 ${n} 颗大松露`, glow: n => `今天有 ${n} 棵作物在发光`, giant: n => `今天长出 ${n} 个巨大的作物！`, 'cat-seed': n => `猫咪今天带来 ${n} 颗稀有种子`,
  };
  const mergedMsg = (ev, n) => (n > 1 && MERGED[ev.kind] ? MERGED[ev.kind](n) : ev.msg);
  function glowToast(t, names) { return { kind: 'glow', msg: `一棵${cropLabel(t.crop.type, names)}在发光！`, crop: t.crop.type }; }
  function giantToast(t, names) { return { kind: 'giant', msg: `四棵${cropLabel(t.crop.type, names)}长成了一个巨大的${cropLabel(t.crop.type, names)}！`, crop: t.crop.type }; }
  function catToast(kind, names) { return { kind: 'cat-seed', msg: `猫咪带来了惊喜：一颗${cropLabel(kind, names)}种子！`, seed: kind }; }

  function validCropExtras(src, crop) {
    if (!src || !crop) return crop;
    if (src.glow) crop.glow = 1;
    if (src.giant) crop.giant = 1;
    if (src.giantOf && typeof src.giantOf === 'object') {
      const f = src.giantOf.f, c = src.giantOf.c, r = src.giantOf.r;
      if ((f === 'home' || f === 'east' || f === 'south') && Number.isFinite(c) && Number.isFinite(r)) crop.giantOf = { f, c: c | 0, r: r | 0 };
    }
    return crop;
  }
  const RARE_OK = { egg: { gold: 1, double: 1 }, truffle: { white: 1, big: 1 } };
  function validBasketItem(k, allowed) {
    if (typeof k === 'string') return allowed(k) ? k : null;
    if (!k || typeof k !== 'object' || !allowed(k.type)) return null;
    const o = { type: k.type };
    if (k.glow) o.glow = 1;
    if (k.giant) o.giant = 1;
    if (k.rare && RARE_OK[k.type] && RARE_OK[k.type][k.rare]) o.rare = k.rare;
    return compact(o);
  }

  const api = { MERGED, mergedMsg,
    GIANT_TYPES, SHOP_SEEDS, GLOW_CHANCE, GLOW_MULT, GIANT_CHANCE, GIANT_MULT, CAT_RARE_CHANCE, EGG, TRUFFLE,
    isPart, isGiant, itemOf, itemType, compact, keyOf, tileMap, blocks2x2, originOf, partsOf,
    canHarvest, canGrow, rollGlow, eligibleBlock, mergeBlock, rollGiant, clearGiant, harvestItem,
    priceMult, priceOf, isSurpriseItem, itemName, rollProduct, productToast, catGifts,
    pickSeed, plantScore, pickPlantTile, neighborsOf,
    glowToast, giantToast, catToast, validCropExtras, validBasketItem
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PFSurprise = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
