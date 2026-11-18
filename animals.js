// 像素农场 · 动物规则（第 4 阶段 v4.5；v4.7 分散到各区域、加了猪和猫狗）：纯函数，浏览器里是 window.PFAnimals，Node 里 require('./animals.js')。
// An animal eats hay from the pasture trough every night, drinks from it, likes being petted, and leaves a product
// (egg, wool, milk) that the farmer collects and sells. Happiness (0..100) is the one care number: it decides how much it gives.
(function (root) {
  const KINDS = {
    chicken: { name: '鸡', home: 'coop', eats: 1, product: 'egg', every: 1, n: 1 },
    sheep: { name: '羊', home: 'fold', eats: 2, product: 'wool', every: 3, n: 1 },
    cow: { name: '牛', home: 'shed', eats: 3, product: 'milk', every: 1, n: 1 },
    pig: { name: '猪', home: 'sty', eats: 2, product: 'truffle', every: 2, n: 1 },   // v4.7: roots for truffles under the forest's oaks
  };
  // v4.7 companions: they cost no hay and give no product. A dog walks with the farmer (a little faster), a cat brings a seed
  // to the door every morning. Coats follow the order they are bought in.
  const PETS = {
    cat: { name: '猫', coats: [{ id: 'ginger', name: '橘猫' }, { id: 'black', name: '黑猫' }, { id: 'calico', name: '三花猫' }] },
    dog: { name: '狗', coats: [{ id: 'shiba', name: '柴犬' }, { id: 'collie', name: '边境牧羊犬' }, { id: 'brown', name: '棕色小狗' }] },
  };
  const PET_IDS = Object.keys(PETS);
  const pet = (kind, i) => ({ id: kind + i, kind, coat: PETS[kind].coats[i % PETS[kind].coats.length].id });
  const DOG_WALK = 0.03, CAT_SEEDS = 1;  // per dog: walking +3%; per cat: 1 carrot seed each morning
  // v5.4.0: dogs spend most of the day on their own (patrol, sun, sniff a cat, sit by a fence, drink at the well,
  // glance at the farmer, the border collie hangs near the sheepfold). A light surprise at most once a day.
  const DOG_JOBS = ['patrol', 'sun', 'sniff', 'fence', 'well', 'check', 'fold', 'door'];
  const DOG_SURPRISES = ['flower', 'stick', 'seed', 'truffle', 'wait'];
  const DOG_SURPRISE_CHANCE = 0.28;
  const isCollie = p => p && p.kind === 'dog' && p.coat === 'collie';
  function pickDogJob(p, ctx, rnd) {
    const jobs = ['patrol', 'sun', 'fence', 'well', 'check'];
    if (ctx && ctx.cats && ctx.cats.length) jobs.push('sniff');
    if (isCollie(p) && ctx && ctx.fold) jobs.push('fold', 'fold');
    if (ctx && ctx.evening) jobs.push('door');
    const kind = jobs[Math.floor(rnd() * jobs.length)];
    const wait = kind === 'sun' ? 80 + rnd() * 140 : kind === 'check' ? 16 + rnd() * 24 : 36 + rnd() * 70;
    return { kind, wait };
  }
  function rollDogSurprise(ctx, rnd) {
    if (ctx && ctx.didToday) return null;
    if (rnd() >= DOG_SURPRISE_CHANCE) return null;
    const opts = ['flower', 'stick', 'seed', 'wait'];
    if (ctx && ctx.hasPigs) opts.push('truffle');
    return opts[Math.floor(rnd() * opts.length)];
  }
  const KIND_IDS = Object.keys(KINDS);
  // base prices; the merchant's multiplier drifts every morning like the crops' (0.8..1.2)
  const PRODUCTS = { egg: { name: '鸡蛋', price: 10 }, wool: { name: '羊毛', price: 60 }, milk: { name: '牛奶', price: 35 }, truffle: { name: '松露', price: 45 } };
  const PRODUCT_IDS = Object.keys(PRODUCTS);
  const HAY = { price: 3, stock: 99 };     // a bale of hay at the stall; the barn keeps at most 99
  const START_H = 60, HAPPY = 80, SULKY = 30, MAX_READY = 3;
  const CARE = { fed: 8, hungry: -25, watered: 4, thirsty: -15, petted: 8, lonely: -6, fence: 4 };
  const animal = (id, kind) => ({ id, kind, h: START_H, cd: KINDS[kind].every, ready: 0, pet: 0 });
  const need = animals => animals.reduce((n, a) => n + KINDS[a.kind].eats, 0);
  // what an animal gives on a morning, from how it feels: sulky gives nothing, happy gives one extra
  const yieldOf = h => h < SULKY ? 0 : h >= HAPPY ? 2 : 1;
  const mood = h => h >= HAPPY ? '开心' : h >= 50 ? '还行' : h >= SULKY ? '不太高兴' : '闷闷不乐';
  // one night for the whole pasture: animals eat in order from the trough; the trough's water is used up
  function overnight(animals, trough, bonus = 0) { // bonus: v5.0 fences (+CARE.fence a night)
    let feed = trough.feed | 0; const out = { fed: 0, hungry: 0, made: {} };
    for (const a of animals) {
      const k = KINDS[a.kind], fed = feed >= k.eats; if (fed) feed -= k.eats;
      a.h += (fed ? CARE.fed : CARE.hungry) + (trough.water ? CARE.watered : CARE.thirsty) + (a.pet ? CARE.petted : CARE.lonely) + bonus;
      a.h = Math.max(0, Math.min(100, a.h)); a.pet = 0;
      if (fed) { out.fed++; a.cd--; if (a.cd <= 0) { a.cd = k.every; const n = Math.min(MAX_READY - a.ready, yieldOf(a.h) * k.n); if (n > 0) { a.ready += n; out.made[k.product] = (out.made[k.product] || 0) + n; } } }
      else out.hungry++;
    }
    return { trough: { feed, water: 0 }, report: out };
  }
  // v4.7: every building has its own trough; one night for all of them (a pen with no animals keeps its trough as it is)
  const PEN_IDS = ['coop', 'sty', 'fold', 'shed'];
  // v5.6.0: an animal past the first building's room lives in the second one (a.pen, set by works.js assignPens)
  const homeOf = a => a.pen || KINDS[a.kind].home;
  function overnightPens(animals, troughs, bonus = 0) {
    const out = { troughs: {}, report: { fed: 0, hungry: 0, made: {} } };
    for (const pen of PEN_IDS) { const t = (troughs && troughs[pen]) || { feed: 0, water: 0 }, list = animals.filter(a => homeOf(a) === pen);
      if (!list.length) { out.troughs[pen] = { feed: t.feed | 0, water: t.water ? 1 : 0 }; continue; }
      const r = overnight(list, t, bonus); out.troughs[pen] = r.trough; out.report.fed += r.report.fed; out.report.hungry += r.report.hungry;
      for (const k in r.report.made) out.report.made[k] = (out.report.made[k] || 0) + r.report.made[k]; }
    return out;
  }
  const penNeed = (animals, pen) => need(animals.filter(a => homeOf(a) === pen));
  const api = { PEN_IDS, overnightPens, penNeed, homeOf, KINDS, KIND_IDS, PETS, PET_IDS, pet, DOG_WALK, CAT_SEEDS, DOG_JOBS, DOG_SURPRISES, DOG_SURPRISE_CHANCE, isCollie, pickDogJob, rollDogSurprise, PRODUCTS, PRODUCT_IDS, HAY, START_H, HAPPY, SULKY, MAX_READY, CARE, animal, need, yieldOf, mood, overnight };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFAnimals = api;
})(typeof window !== 'undefined' ? window : globalThis);
