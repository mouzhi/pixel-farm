// 像素农场 · 存档（纯逻辑，不碰游戏内部；浏览器里是 window.PFSave，Node 里可以 require 做单元测试）
// Rules (see CONTRIBUTING.md「存档兼容」):
//  - one JSON object in localStorage under KEY, with an integer saveVersion; the previous good save is kept under BAK
//  - MIGRATIONS[v] turns a v-1 save into a v save; the chain is append-only, published steps are never edited
//  - validate() fills every missing field with its default and clamps ranges, so an older save never throws
//  - a save from a newer build is never overwritten by an older page (blocked), a broken save is quarantined, not deleted
'use strict';
(function (root) {
  const PREFIX = 'mouzhi/pixel-farm:';            // GitHub Pages shares one origin (mouzhi.github.io) across projects
  const KEY = PREFIX + 'save', BAK = KEY + ':bak';
  const CURRENT = 5;
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
  };
  const CROP_IDS = ['carrot', 'cabbage', 'pumpkin', 'strawberry', 'watermelon'];
  const UPGRADE_IDS = ['field', 'can', 'shoe', 'hoe', 'basket', 'speed', 'strawberry', 'watermelon', 'axe', 'forest', 'east', 'orchard', 'south']; // levels; max levels live in sim.js
  const FRUIT_IDS = ['apple', 'orange'], FIELD_IDS = ['home', 'east', 'south'], TREE_KINDS = ['wild', 'apple', 'orange'], TREE_STAGES = ['tree', 'stump', 'sapling'];
  const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const int = (v, d, lo = 0, hi = 1e15) => Math.round(num(v, d, lo, hi));
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const seeds = v => { const o = obj(v), out = {}; for (const k of CROP_IDS) out[k] = int(o[k], 0, 0, 1e6); return out; };

  function validTile(t) {
    t = obj(t);
    const out = { f: FIELD_IDS.includes(t.f) ? t.f : 'home', c: int(t.c, 0, 0, 999), r: int(t.r, 0, 0, 999), open: t.open !== false, tilled: !!t.tilled, watered: !!t.watered, debris: null, weed: null, crop: null };
    if (t.debris && (t.debris.type === 'rock' || t.debris.type === 'branch')) out.debris = { type: t.debris.type, v: int(t.debris.v, 0, 0, 99), rot: num(t.debris.rot, 0) };
    if (t.weed) out.weed = { v: int(t.weed.v, 0, 0, 99), rot: num(t.weed.rot, 0) };
    if (t.crop && CROP_IDS.includes(t.crop.type)) out.crop = { type: t.crop.type, age: int(t.crop.age, 0, 0, 99), n: int(t.crop.n, 0, 0, 99), rot: num(t.crop.rot, 0) };
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
  function validOrder(o) {
    o = obj(o);
    if (o.type === 'chop' && typeof o.id === 'string' && o.id.length <= 40) return { type: 'chop', id: o.id };
    if (o.type === 'plant' && FRUIT_IDS.includes(o.kind) && typeof o.x === 'number' && typeof o.y === 'number') return { type: 'plant', kind: o.kind, x: num(o.x, 0, -400, 600), y: num(o.y, 0, -400, 600) };
    return null;
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
      prices: Object.fromEntries(CROP_IDS.map(k => [k, num(prices[k], 1, 0.8, 1.2)])),
      inventory: {
        water: int(inv.water, 0, 0, 999), waterMax: int(inv.waterMax, 4, 1, 999), store: seeds(inv.store), bag: seeds(inv.bag),
        gathered: int(inv.gathered, 0, 0, 1e6), basket: (Array.isArray(inv.basket) ? inv.basket : []).filter(k => CROP_IDS.includes(k) || FRUIT_IDS.includes(k)).slice(0, 200),
        wood: int(inv.wood, 0, 0, 1e6), saplings: Object.fromEntries(FRUIT_IDS.map(k => [k, int(obj(inv.saplings)[k], 0, 0, 999)])),
      },
      farmer: { x: num(f.x, 36, -100, 400), y: num(f.y, 40, -100, 400), sleeping: !!f.sleeping, home: f.home !== false },
      tiles: s.tiles.map(validTile),
      upgrades: Object.fromEntries(UPGRADE_IDS.map(k => [k, int(up[k], 0, 0, 9)])),
      settings: { speed: [1, 2, 4].includes(sp) ? sp : 1 },
      yard: Array.isArray(s.yard) ? s.yard.map(validYard).filter(Boolean).slice(0, 40) : undefined,
      trees: Array.isArray(s.trees) ? s.trees.map(validTree).filter(Boolean).slice(0, 600) : null, // null: the game builds its default forest
      orders: (Array.isArray(s.orders) ? s.orders : []).map(validOrder).filter(Boolean).slice(0, 24),
      log: (Array.isArray(s.log) ? s.log : []).filter(x => typeof x === 'string').slice(0, 4),
    };
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
    store = store || root.localStorage; const notes = [];
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
    store = store || root.localStorage;
    if (blocked) return { ok: false, error: 'blocked: a newer save exists' };
    try {
      const json = JSON.stringify(state), cur = store.getItem(KEY);
      if (cur && cur !== json) { try { migrate(JSON.parse(cur)); store.setItem(BAK, cur); } catch (e) { /* never let a broken save replace the good backup */ } }
      store.setItem(KEY, json); return { ok: true, bytes: json.length };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }
  function reset(store) { // keep the old save under :reset:<time> (one copy), then start fresh
    store = store || root.localStorage;
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
  const api = { PREFIX, KEY, BAK, CURRENT, MIGRATIONS, CROP_IDS, UPGRADE_IDS, FRUIT_IDS, FIELD_IDS, validate, migrate, read, write, reset, encode, decode, isBlocked: () => blocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFSave = api;
})(typeof window !== 'undefined' ? window : globalThis);
