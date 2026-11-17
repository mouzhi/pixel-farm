// 像素农场 · 动物规则（第 4 阶段，v4.5）：纯函数，浏览器里是 window.PFAnimals，Node 里 require('./animals.js')。
// An animal eats hay from the pasture trough every night, drinks from it, likes being petted, and leaves a product
// (egg, wool, milk) that the farmer collects and sells. Happiness (0..100) is the one care number: it decides how much it gives.
(function (root) {
  const KINDS = {
    chicken: { name: '鸡', home: 'coop', eats: 1, product: 'egg', every: 1, n: 1 },
    sheep: { name: '羊', home: 'shed', eats: 2, product: 'wool', every: 3, n: 1 },
    cow: { name: '牛', home: 'shed', eats: 3, product: 'milk', every: 1, n: 1 },
  };
  const KIND_IDS = Object.keys(KINDS);
  // base prices; the merchant's multiplier drifts every morning like the crops' (0.8..1.2)
  const PRODUCTS = { egg: { name: '鸡蛋', price: 10 }, wool: { name: '羊毛', price: 60 }, milk: { name: '牛奶', price: 35 } };
  const PRODUCT_IDS = Object.keys(PRODUCTS);
  const HAY = { price: 3, stock: 99 };     // a bale of hay at the stall; the barn keeps at most 99
  const START_H = 60, HAPPY = 80, SULKY = 30, MAX_READY = 3;
  const CARE = { fed: 8, hungry: -25, watered: 4, thirsty: -15, petted: 8, lonely: -6 };
  const animal = (id, kind) => ({ id, kind, h: START_H, cd: KINDS[kind].every, ready: 0, pet: 0 });
  const need = animals => animals.reduce((n, a) => n + KINDS[a.kind].eats, 0);
  // what an animal gives on a morning, from how it feels: sulky gives nothing, happy gives one extra
  const yieldOf = h => h < SULKY ? 0 : h >= HAPPY ? 2 : 1;
  const mood = h => h >= HAPPY ? '开心' : h >= 50 ? '还行' : h >= SULKY ? '不太高兴' : '闷闷不乐';
  // one night for the whole pasture: animals eat in order from the trough; the trough's water is used up
  function overnight(animals, trough) {
    let feed = trough.feed | 0; const out = { fed: 0, hungry: 0, made: {} };
    for (const a of animals) {
      const k = KINDS[a.kind], fed = feed >= k.eats; if (fed) feed -= k.eats;
      a.h += (fed ? CARE.fed : CARE.hungry) + (trough.water ? CARE.watered : CARE.thirsty) + (a.pet ? CARE.petted : CARE.lonely);
      a.h = Math.max(0, Math.min(100, a.h)); a.pet = 0;
      if (fed) { out.fed++; a.cd--; if (a.cd <= 0) { a.cd = k.every; const n = Math.min(MAX_READY - a.ready, yieldOf(a.h) * k.n); if (n > 0) { a.ready += n; out.made[k.product] = (out.made[k.product] || 0) + n; } } }
      else out.hungry++;
    }
    return { trough: { feed, water: 0 }, report: out };
  }
  const api = { KINDS, KIND_IDS, PRODUCTS, PRODUCT_IDS, HAY, START_H, HAPPY, SULKY, MAX_READY, CARE, animal, need, yieldOf, mood, overnight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFAnimals = api;
})(typeof window !== 'undefined' ? window : globalThis);
