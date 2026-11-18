// 像素农场 · 存档（纯逻辑，不碰游戏内部；浏览器里是 window.PFSave，Node 里可以 require 做单元测试）
// Rules (see CONTRIBUTING.md「存档兼容」):
//  - one JSON object in localStorage under KEY, with an integer saveVersion; the previous good save is kept under BAK
//  - MIGRATIONS[v] turns a v-1 save into a v save; the chain is append-only, published steps are never edited
//  - validate() fills every missing field with its default and clamps ranges, so an older save never throws
//  - a save from a newer build is never overwritten by an older page (blocked), a broken save is quarantined, not deleted
'use strict';
(function (root) {
  const PREFIX = 'mouzhi/pixel-farm:';            // GitHub Pages shares one origin (mouzhi.github.io) across projects
  const SU = (typeof require === 'function' && typeof document === 'undefined') ? require('./surprise.js') : root.PFSurprise;
  const CX = (typeof require === 'function' && typeof document === 'undefined') ? require('./codex.js') : root.PFCodex;
  const WX = (typeof require === 'function' && typeof document === 'undefined') ? require('./weather.js') : root.PFWeather;
  const KEY = PREFIX + 'save', BAK = KEY + ':bak';
  const CURRENT = 10;
  const YARD_TYPES = ['rock', 'branch', 'weed', 'pebble'];
  const MIGRATIONS = {
    // v4.1 shop: every upgrade starts at level 0 (nothing bought), the game runs at 1x
    2: s => Object.assign({}, s, { upgrades: Object.assign({}, UPGRADE_IDS.reduce((o, k) => (o[k] = 0, o), {}), s.upgrades), settings: Object.assign({ speed: 1 }, s.settings) }),
    // v4.2 yard clutter: { type, v, rot, x, y } around the farm. A missing yard is left unset so the game can seed one
    // without touching the saved RNG. An empty array means the yard was fully cleared and must stay empty.
    3: s => Object.assign({}, s, { yard: Array.isArray(s.yard) ? s.yard : undefined }),
    // v4.3 big map: no region or axe bought, the default forest (trees: null), no orders, no wood or saplings; tiles are the home field
    4: s => Object.assign({}, s, { upgrades: Object.assign({ axe: 0, forest: 0, east: 0, orchard: 0, south: 0 }, s.upgrades), trees: null, orders: [],
      inventory: Object.assign({ wood: 0, saplings: { apple: 0, orange: 0 } }, s.inventory), tiles: (s.tiles || []).map(t => Object.assign({ f: 'home' }, t)) }),
    // v4.3.1 early field rungs: published v4 levels were 0→12, 1→18, 2→24; new levels are 0→12, 1→16, 2→20, 3→24.
    // Old field 1 (18 tiles) becomes 2 (20 tiles, never lose any); old field 2 stays fully open at 3.
    // If the save already has more home tiles open than the bought level would cover, raise the level to match.
    5: s => {
      const up = Object.assign({}, s.upgrades);
      const old = Math.max(0, up.field | 0);
      let lv = old >= 2 ? 3 : old >= 1 ? 2 : 0;
      const n = (s.tiles || []).filter(t => (t.f || 'home') === 'home' && t.open !== false).length;
      if (n >= 21) lv = Math.max(lv, 3); else if (n >= 17) lv = Math.max(lv, 2); else if (n >= 13) lv = Math.max(lv, 1);
      up.field = lv;
      return Object.assign({}, s, { upgrades: up });
    },
    // v4.5 animals (migration 6): no pasture, buildings or animals bought, an empty trough, no hay; egg / wool / milk start at the base price
    6: s => Object.assign({}, s, { upgrades: Object.assign({ pasture: 0, coop: 0, shed: 0, chicken: 0, sheep: 0, cow: 0 }, s.upgrades), animals: [], trough: { feed: 0, water: 0 },
      inventory: Object.assign({ hay: 0 }, s.inventory), prices: Object.assign({ egg: 1, wool: 1, milk: 1 }, s.prices) }),
    // v4.6 fishing: starter bamboo rod (rod level 0 is owned, not bought), no sea rod or coast, empty catch log
    7: s => Object.assign({}, s, { upgrades: Object.assign({ rod: 0, searod: 0, coast: 0 }, s.upgrades), catches: Array.isArray(s.catches) ? s.catches : [] }),
    // v4.7 animals spread out: the coop moves home (chickens keep their level), the shed is the cows' now, sheep get a fold on
    // the orchard slope (free for anyone who already had sheep, with the orchard too if it was not bought, so nobody loses an
    // animal), pigs and pets start at 0. One trough per building; the old pasture trough becomes the shed's (or the coop's).
    8: s => {
      const up = Object.assign({ sty: 0, fold: 0, pig: 0, cat: 0, dog: 0 }, s.upgrades);
      if ((up.sheep | 0) > 0) { up.fold = Math.max(up.fold | 0, 1); up.orchard = Math.max(up.orchard | 0, 1); }
      const t = s.trough && typeof s.trough === 'object' ? s.trough : {}, old = { feed: t.feed | 0, water: t.water ? 1 : 0 }, empty = () => ({ feed: 0, water: 0 });
      const troughs = { coop: empty(), sty: empty(), fold: empty(), shed: empty() }; troughs[(up.shed | 0) > 0 ? 'shed' : 'coop'] = old;
      const out = Object.assign({}, s, { upgrades: up, troughs, prices: Object.assign({ truffle: 1 }, s.prices) }); delete out.trough; return out;
    },
    // v5.0 phase 5: house and fence levels start at 0; nobody has met 阿禾 yet; no family members out working. Wild trees outside
    // the forest became trees you can chop: a save with its own tree list gets them appended (frozen copy of the v5.0 list).
    9: s => {
      const extra = [[22, 84, 0], [44, 82, 4], [8, 96, 3], [6, 62, 5], [8, 14, 2], [128, 6, 6], [186, 84, 1], [184, 118, 7], [334, 24, 0], [226, 104, 3], [338, 108, 5],
        [48, 196, 2], [178, 158, 6], [226, -92, 1], [338, -92, 4], [-144, -92, 7], [-60, -92, 0]].map(([x, y, v], i) => ({ id: 'h' + i, x, y, kind: 'wild', v, stage: 'tree', age: 0, ripe: 0, cd: 0 }));
      const trees = Array.isArray(s.trees) ? s.trees.concat(extra.filter(t => !s.trees.some(o => o && o.id === t.id))) : s.trees;
      return Object.assign({}, s, { upgrades: Object.assign({ house: 0, fence: 0 }, s.upgrades), trees, family: { love: 0, met: 0, chatDay: 0, gifts: 0, sales: 0, moved: 0, kids: [] }, members: [] });
    },
    // v5.4.0 phase 6: the collection book, achievements and milestones, fish food, ornamental pond fish.
    // Existing catch logs and basket rares seed the book; streaks start at 0 so a week of idling is not awarded on load.
    10: s => {
      const seeded = CX.seedFromSave(s);
      return Object.assign({}, s, {
        inventory: Object.assign({ fishFood: 0, ornament: {} }, s.inventory),
        pondFish: Array.isArray(s.pondFish) ? s.pondFish : [],
        codex: s.codex || seeded.codex,
        achievements: Array.isArray(s.achievements) ? s.achievements : seeded.achievements,
        milestones: Array.isArray(s.milestones) ? s.milestones : seeded.milestones,
        streaks: s.streaks || CX.emptyStreaks(),
      });
    },
  };
  const CROP_IDS = ['carrot', 'cabbage', 'pumpkin', 'strawberry', 'watermelon'];
  const UPGRADE_IDS = ['field', 'can', 'shoe', 'hoe', 'basket', 'speed', 'strawberry', 'watermelon', 'axe', 'forest', 'east', 'orchard', 'south', 'pasture', 'coop', 'chicken', 'sty', 'pig', 'fold', 'sheep', 'shed', 'cow', 'cat', 'dog', 'house', 'fence', 'rod', 'coast', 'searod', 'lumber']; // levels (shop order); max levels live in sim
  const ANIMAL_IDS = ['chicken', 'sheep', 'cow', 'pig'], PRODUCT_IDS = ['egg', 'wool', 'milk', 'truffle'], PEN_IDS = ['coop', 'sty', 'fold', 'shed'];
  const FISH_IDS = ['crucian', 'carp', 'grassc', 'bass', 'koi', 'sardine', 'seabass', 'snapper', 'tuna', 'sword'];
  const FRUIT_IDS = ['apple', 'orange'], FIELD_IDS = ['home', 'east', 'south'], TREE_KINDS = ['wild', 'apple', 'orange'], TREE_STAGES = ['tree', 'stump', 'sapling'];
  const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const int = (v, d, lo = 0, hi = 1e15) => Math.round(num(v, d, lo, hi));
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const seeds = v => { const o = obj(v), out = {}; for (const k of CROP_IDS) out[k] = int(o[k], 0, 0, 1e6); return out; };
  const itemOk = ty => CROP_IDS.includes(ty) || FRUIT_IDS.includes(ty) || PRODUCT_IDS.includes(ty) || FISH_IDS.includes(ty) || ty === 'flower';
  // v5.1: a basket slot can be a string (including a wildflower) or a surprise item {type, glow, giant, rare}
  function validBasket(list) {
    return (Array.isArray(list) ? list : []).map(k => {
      if (SU && SU.validBasketItem) return SU.validBasketItem(k, itemOk);
      return (typeof k === 'string' && itemOk(k)) ? k : null;
    }).filter(Boolean).slice(0, 200);
  }

  function validTile(t) {
    t = obj(t);
    const out = { f: FIELD_IDS.includes(t.f) ? t.f : 'home', c: int(t.c, 0, 0, 999), r: int(t.r, 0, 0, 999), open: t.open !== false, tilled: !!t.tilled, watered: !!t.watered, debris: null, weed: null, crop: null };
    if (t.debris && (t.debris.type === 'rock' || t.debris.type === 'branch')) out.debris = { type: t.debris.type, v: int(t.debris.v, 0, 0, 99), rot: num(t.debris.rot, 0) };
    if (t.weed) out.weed = { v: int(t.weed.v, 0, 0, 99), rot: num(t.weed.rot, 0) };
    if (t.crop && CROP_IDS.includes(t.crop.type)) {
      out.crop = { type: t.crop.type, age: int(t.crop.age, 0, 0, 99), n: int(t.crop.n, 0, 0, 99), rot: num(t.crop.rot, 0) };
      if (SU && SU.validCropExtras) SU.validCropExtras(t.crop, out.crop);
    }
    return out;
  }
  function validYard(c) {
    c = obj(c);
    if (!YARD_TYPES.includes(c.type)) return null;
    return { type: c.type, v: int(c.v, 0, 0, 99), rot: num(c.rot, 0), x: num(c.x, 0, -100, 400), y: num(c.y, 0, -100, 400) };
  }
  function validTree(t) {
    t = obj(t); if (typeof t.id !== 'string' || !t.id || t.id.length > 40 || !TREE_KINDS.includes(t.kind)) return null;
    return { id: t.id, x: num(t.x, 0, -400, 600), y: num(t.y, 0, -400, 600), kind: t.kind, v: int(t.v, 0, 0, 99), stage: TREE_STAGES.includes(t.stage) ? t.stage : 'tree',
      age: int(t.age, 0, 0, 999), ripe: t.ripe ? 1 : 0, cd: int(t.cd, 0, 0, 99) };
  }
  function validAnimal(a) {
    a = obj(a); if (typeof a.id !== 'string' || !a.id || a.id.length > 20 || !ANIMAL_IDS.includes(a.kind)) return null;
    return { id: a.id, kind: a.kind, h: int(a.h, 60, 0, 100), cd: int(a.cd, 1, 0, 9), ready: int(a.ready, 0, 0, 3), pet: a.pet ? 1 : 0 };
  }
  function validOrder(o) {
    o = obj(o);
    if (o.type === 'chop' && typeof o.id === 'string' && o.id.length <= 40) return { type: 'chop', id: o.id };
    if (o.type === 'plant' && FRUIT_IDS.includes(o.kind) && typeof o.x === 'number' && typeof o.y === 'number') return { type: 'plant', kind: o.kind, x: num(o.x, 0, -400, 600), y: num(o.y, 0, -400, 600) };
    if (o.type === 'release' && (o.kind === 'koi' || o.kind === 'goldfish')) return { type: 'release', kind: o.kind };
    return null;
  }
  function validCatch(c) {
    c = obj(c); if (!FISH_IDS.includes(c.id)) return null;
    return { id: c.id, name: typeof c.name === 'string' ? c.name.slice(0, 12) : c.id, gold: int(c.gold, 0, 0, 999), water: c.water === 'sea' ? 'sea' : 'pond', day: int(c.day, 1, 1, 1e6) };
  }
  // fills defaults for everything, so a v1 save written before a field existed still loads
  function validate(s) {
    const up = obj(s.upgrades), sp = obj(s.settings).speed;
    const clock = obj(s.clock), stats = obj(s.stats), inv = obj(s.inventory), f = obj(s.farmer), prices = obj(s.prices);
    if (!Array.isArray(s.tiles) || !s.tiles.length) throw new Error('save has no tiles');
    return {
      saveVersion: CURRENT,
      gameVersion: String(s.gameVersion || '?'),
      createdAt: int(s.createdAt, Date.now()),
      savedAt: int(s.savedAt, Date.now()),
      rng: int(s.rng, 20261116, -2147483648, 4294967295),
      clock: { day: int(clock.day, 1, 1), t: num(clock.t, 360, 0) },
      coins: int(s.coins, 0),
      stats: {
        totalSold: int(stats.totalSold, 0), cleared: int(stats.cleared, 0), earned: int(stats.earned, 0), soldToday: int(stats.soldToday, 0),
        todayEarn: int(stats.todayEarn, 0), dayEarn: (Array.isArray(stats.dayEarn) ? stats.dayEarn : []).slice(-7).map(v => int(v, 0)),
      },
      prices: Object.fromEntries([...CROP_IDS, ...PRODUCT_IDS].map(k => [k, num(prices[k], 1, 0.8, 1.2)])),
      inventory: {
        water: int(inv.water, 0, 0, 999), waterMax: int(inv.waterMax, 4, 1, 999), store: seeds(inv.store), bag: seeds(inv.bag),
        gathered: int(inv.gathered, 0, 0, 1e6), basket: validBasket(inv.basket),
        wood: int(inv.wood, 0, 0, 1e6), saplings: Object.fromEntries(FRUIT_IDS.map(k => [k, int(obj(inv.saplings)[k], 0, 0, 999)])), hay: int(inv.hay, 0, 0, 99),
        fishFood: int(inv.fishFood, 0, 0, 30), ornament: CX.validOrnament(inv.ornament),
      },
      farmer: { x: num(f.x, 36, -200, 400), y: num(f.y, 40, -150, 400), sleeping: !!f.sleeping, home: f.home !== false },
      tiles: s.tiles.map(validTile),
      upgrades: Object.fromEntries(UPGRADE_IDS.map(k => [k, int(up[k], 0, 0, 9)])),
      settings: { speed: [1, 2, 4].includes(sp) ? sp : 1 },
      yard: Array.isArray(s.yard) ? s.yard.map(validYard).filter(Boolean).slice(0, 40) : undefined,
      trees: Array.isArray(s.trees) ? s.trees.map(validTree).filter(Boolean).slice(0, 600) : null, // null: the game builds its default forest
      orders: (Array.isArray(s.orders) ? s.orders : []).map(validOrder).filter(Boolean).slice(0, 24),
      animals: (Array.isArray(s.animals) ? s.animals : []).map(validAnimal).filter(Boolean).slice(0, 20),
      troughs: Object.fromEntries(PEN_IDS.map(k => { const t = obj(obj(s.troughs)[k]); return [k, { feed: int(t.feed, 0, 0, 99), water: t.water ? 1 : 0 }]; })),
      catches: (Array.isArray(s.catches) ? s.catches : []).map(validCatch).filter(Boolean).slice(0, 12),
      pondFish: CX.validPondFish(s.pondFish),
      family: validFamily(obj(s.family)),
      members: (Array.isArray(s.members) ? s.members : []).map(validMember).filter(Boolean).slice(0, 3),
      codex: CX.validCodex(s.codex),
      achievements: CX.validUnlocks(s.achievements, CX.ACH_BY),
      milestones: CX.validUnlocks(s.milestones, CX.MS_BY),
      streaks: CX.validStreaks(s.streaks),
      weather: WX && WX.validWeather ? WX.validWeather(s.weather) : { nextDay: 0, start: 0, dur: 0, lastDay: 0, rained: 0, nextStart: 0, nextDur: 0 },
      bugNet: s.bugNet ? 1 : 0,
      log: (Array.isArray(s.log) ? s.log : []).filter(x => typeof x === 'string').slice(0, 4),
    };
  }
  // v5.0 family: love 0..100, the day they met / last chatted / she moved in (0 = not yet), up to two children
  function validFamily(f) {
    const kids = (Array.isArray(f.kids) ? f.kids : []).filter(k => k && /^kid[01]$/.test(k.id)).slice(0, 2)
      .map(k => {
        const out = { id: k.id, name: typeof k.name === 'string' ? k.name.slice(0, 8) : '孩子', born: int(k.born, 1, 1) };
        if (k.floor === 'helper' || k.floor === 'teen') out.floor = k.floor; // v5.4.3 append-only: old working kids do not regress
        return out;
      });
    const t = obj(f.today);
    const today = { day: int(t.day, 0, 0), chat: int(t.chat, 0, 0, 20), gift: int(t.gift, 0, 0, 50), giftName: typeof t.giftName === 'string' ? t.giftName.slice(0, 16) : '', sales: int(t.sales, 0, 0, 20) };
    const out = { love: int(f.love, 0, 0, 100), met: int(f.met, 0, 0), chatDay: int(f.chatDay, 0, 0), gifts: int(f.gifts, 0, 0), sales: int(f.sales, 0, 0, 9), moved: int(f.moved, 0, 0), kids, today };
    if (f.kidGrowth) out.kidGrowth = 1; // v5.4.3: set after the one-time growth floor, so mornings do not re-apply the old table
    return out;
  }
  // what a family member had on them when the game was saved (they keep working from the house door after loading)
  function validMember(m) {
    if (!m || typeof m.id !== 'string' || !/^(partner|kid[01])$/.test(m.id)) return null;
    return { id: m.id, water: int(m.water, 0, 0, 999), bag: seeds(m.bag), gathered: int(m.gathered, 0, 0, 1e6),
      basket: validBasket(m.basket) };
  }
  function migrate(s) {
    if (!s || typeof s !== 'object' || !Number.isInteger(s.saveVersion) || s.saveVersion < 1) throw new Error('not a pixel-farm save');
    if (s.saveVersion > CURRENT) { const e = new Error(`save v${s.saveVersion} is newer than this page (v${CURRENT})`); e.newer = true; throw e; }
    while (s.saveVersion < CURRENT) { const step = MIGRATIONS[s.saveVersion + 1]; if (!step) throw new Error('no migration to v' + (s.saveVersion + 1)); s = Object.assign({}, step(s), { saveVersion: s.saveVersion + 1 }); }
    return validate(s);
  }
  let blocked = false;
  function quarantine(store, raw, why) { // keep a broken save for inspection (at most 3), never just delete it
    try {
      const keys = []; for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k && k.startsWith(PREFIX + 'corrupt:')) keys.push(k); }
      if (keys.some(k => store.getItem(k) === raw)) return;
      keys.sort(); while (keys.length >= 3) store.removeItem(keys.shift());
      store.setItem(PREFIX + 'corrupt:' + Date.now(), raw);
    } catch (e) { /* storage full: nothing more we can do */ }
    if (root.console) console.warn('[farm] save quarantined:', why);
  }
  // -> { state, from: KEY | BAK, notes: [] } ; state null for a fresh game
  function read(store) {
    store = store || (root.PFPlatform && root.PFPlatform.store && root.PFPlatform.store()) || root.localStorage; const notes = [];
    for (const key of [KEY, BAK]) {
      let raw; try { raw = store.getItem(key); } catch (e) { notes.push('storage-unavailable'); return { state: null, notes }; }
      if (!raw) continue;
      try { const state = migrate(JSON.parse(raw)); if (key === BAK) notes.push('restored-from-backup'); return { state, from: key, notes }; }
      catch (e) {
        if (e.newer) { blocked = true; notes.push('newer-save'); return { state: null, blocked: true, notes }; }
        quarantine(store, raw, key + ': ' + e.message); notes.push(key === KEY ? 'main-corrupt' : 'backup-corrupt');
      }
    }
    return { state: null, notes };
  }
  function write(state, store) {
    store = store || (root.PFPlatform && root.PFPlatform.store && root.PFPlatform.store()) || root.localStorage;
    if (blocked) return { ok: false, error: 'blocked: a newer save exists' };
    try {
      const json = JSON.stringify(state), cur = store.getItem(KEY);
      if (cur && cur !== json) { try { migrate(JSON.parse(cur)); store.setItem(BAK, cur); } catch (e) { /* never let a broken save replace the good backup */ } }
      store.setItem(KEY, json); return { ok: true, bytes: json.length };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }
  function reset(store) { // keep the old save under :reset:<time> (one copy), then start fresh
    store = store || (root.PFPlatform && root.PFPlatform.store && root.PFPlatform.store()) || root.localStorage;
    try { const cur = store.getItem(KEY); for (let i = store.length - 1; i >= 0; i--) { const k = store.key(i); if (k && k.startsWith(PREFIX + 'reset:')) store.removeItem(k); }
      if (cur) store.setItem(PREFIX + 'reset:' + Date.now(), cur); store.removeItem(KEY); store.removeItem(BAK); blocked = false; return true; } catch (e) { return false; }
  }
  // export string: PF1.<base64 of the UTF-8 JSON>.<checksum>
  const b64e = s => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));
  const b64d = s => (typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'));
  const sum = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  function encode(state) { const b = b64e(JSON.stringify(state)); return `PF1.${b}.${sum(b)}`; }
  function decode(str) {
    const m = /^PF1\.([A-Za-z0-9+/=]+)\.([0-9a-z]+)$/.exec(String(str || '').replace(/\s+/g, ''));
    if (!m) throw new Error('不是像素农场的存档字符串');
    if (sum(m[1]) !== m[2]) throw new Error('存档字符串不完整或被改动过');
    return migrate(JSON.parse(b64d(m[1])));
  }
  const api = { PREFIX, KEY, BAK, CURRENT, MIGRATIONS, CROP_IDS, UPGRADE_IDS, FRUIT_IDS, FIELD_IDS, ANIMAL_IDS, PRODUCT_IDS, FISH_IDS, PEN_IDS, validate, migrate, read, write, reset, encode, decode, isBlocked: () => blocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFSave = api;
})(typeof window !== 'undefined' ? window : globalThis);
