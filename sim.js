// 像素农场 · 节奏与经济规则（纯函数，没有画面依赖；浏览器里是 window.PFSim，Node 里可以直接 require 做单元测试）
// Phase 1: day-based crops, one watering lasts the whole day, auto crop choice by profit, daily price drift, offline settlement.
'use strict';
(function (root) {
  const MIN_PER_SEC = 3;          // game minutes per real second at 1x (v3 was 5): a day is about 5.2 real minutes
  const SLEEP_MULT = 6;           // the night runs 6x faster while the farmer sleeps
  const WAKE = 6 * 60, BEDTIME = 20 * 60;
  const AWAKE_MIN = BEDTIME - WAKE;
  const DAY_REAL_SEC = AWAKE_MIN / MIN_PER_SEC + (1440 - AWAKE_MIN) / (MIN_PER_SEC * SLEEP_MULT); // 313 s
  const WATER_MAX0 = 4;           // watering can capacity at the start
  const BASKET = 10;              // crops carried before a market trip
  const OFFLINE_RATE = 0.5, OFFLINE_CAP_DAYS = 3, OFFLINE_MIN_SEC = 60;
  // seed: shop price, days: watered days to ripen, price: base sell price, seedSell: merchant buys seeds back (phase 2),
  // seedBack: chance a harvest returns one seed of the same kind
  const CROPS = {
    carrot: { name: '胡萝卜', seed: 3, days: 1, price: 8, seedSell: 1, seedBack: 0.35 },
    cabbage: { name: '卷心菜', seed: 10, days: 2, price: 30, seedSell: 4, seedBack: 0.2 },
    pumpkin: { name: '南瓜', seed: 25, days: 4, price: 85, seedSell: 10, seedBack: 0.15 },
  };
  const IDS = Object.keys(CROPS);
  const START_COLS = 4, START_ROWS = 3; // 12 of the 24 home-field tiles are open at the start
  const startOpen = (c, r) => c < START_COLS && r < START_ROWS;
  const emptySeeds = () => Object.fromEntries(IDS.map(k => [k, 0]));
  const startPrices = () => Object.fromEntries(IDS.map(k => [k, 1]));
  const ripe = crop => crop.age >= CROPS[crop.type].days;
  // 0 seed, 1 sprout, 2 young, 3 ripe: spread over the crop's days so a 4-day pumpkin visibly changes every morning
  function stageOf(crop) {
    const d = CROPS[crop.type].days;
    if (crop.age >= d) return 3;
    return Math.min(2, Math.floor((crop.age * 3 + d - 1) / d));
  }
  const priceOf = (type, prices) => Math.max(1, Math.round(CROPS[type].price * ((prices && prices[type]) || 1)));
  // net gold per tile per day; a free (weed / returned) seed costs nothing
  const netPerDay = (type, prices, free) => (priceOf(type, prices) - (free ? 0 : CROPS[type].seed)) / CROPS[type].days;
  // which seed in the bag to plant next: the best earner per tile-day at today's prices
  function pickFromBag(bag, prices) {
    let best = null, bv = -Infinity;
    for (const k of IDS) if ((bag[k] || 0) > 0) { const v = netPerDay(k, prices, true); if (v > bv) { bv = v; best = k; } }
    return best;
  }
  // seeds to buy at the stall for `need` empty tiles: premium seeds only while at least half of the purse stays,
  // free carrot seeds (weeds, returns) are used before buying carrot seeds
  function planSeeds(coins, prices, need, freeCarrots) {
    const buy = emptySeeds(); let cost = 0; const floor = coins * 0.5;
    const order = IDS.slice().sort((a, b) => netPerDay(b, prices, false) - netPerDay(a, prices, false));
    for (let i = 0; i < need; i++) {
      let done = false;
      for (const k of order) {
        if (k === 'carrot') {
          if (freeCarrots > 0) { freeCarrots--; done = true; break; }
          if (coins - cost >= CROPS.carrot.seed) { buy.carrot++; cost += CROPS.carrot.seed; done = true; break; }
        } else if (netPerDay(k, prices, false) > netPerDay('carrot', prices, freeCarrots > 0) && coins - cost - CROPS[k].seed >= floor) {
          buy[k]++; cost += CROPS[k].seed; done = true; break;
        }
      }
      if (!done) break;
    }
    return { buy, cost };
  }
  // merchant prices drift a little every morning: at most 5% a day, pulled back toward 1, kept in 0.8..1.2
  function driftPrices(prices, rnd) {
    const out = {};
    for (const k of IDS) { const m = (prices && prices[k]) || 1; out[k] = Math.round(Math.min(1.2, Math.max(0.8, m + 0.3 * (1 - m) + (rnd() * 2 - 1) * 0.05)) * 1000) / 1000; }
    return out;
  }
  // offline: away time -> game days at 50% of the online rate, at most 3 days, times the average income of the last 3 days
  function offlineSettle(awaySec, dayEarn) {
    if (!(awaySec >= OFFLINE_MIN_SEC)) return null;
    const days = Math.min(OFFLINE_CAP_DAYS, awaySec / DAY_REAL_SEC * OFFLINE_RATE);
    const recent = (dayEarn || []).slice(-3), avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    return { awaySec, days: Math.round(days * 100) / 100, capped: awaySec / DAY_REAL_SEC * OFFLINE_RATE > OFFLINE_CAP_DAYS, avg: Math.round(avg), gold: Math.floor(avg * days) };
  }
  const api = { MIN_PER_SEC, SLEEP_MULT, WAKE, BEDTIME, DAY_REAL_SEC, WATER_MAX0, BASKET, OFFLINE_RATE, OFFLINE_CAP_DAYS, OFFLINE_MIN_SEC,
    CROPS, IDS, START_COLS, START_ROWS, startOpen, emptySeeds, startPrices, ripe, stageOf, priceOf, netPerDay, pickFromBag, planSeeds, driftPrices, offlineSettle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
