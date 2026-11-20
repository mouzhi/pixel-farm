// Node tests for mobile/xhs storage: quota, corrupt recovery, late-game size.
// Usage: node tools/xhs-save-test.js
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const SAVE = require('../save.js');
const SIM = require('../sim.js');
const FIX = path.join(__dirname, 'fixtures');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

class Mem {
  constructor(o = {}, opts = {}) {
    this.m = new Map(Object.entries(o));
    this.keyMax = opts.keyMax || 1024 * 1024;
    this.totalMax = opts.totalMax || 10 * 1024 * 1024;
    this.writes = [];
  }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i]; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  bytes(s) { return Buffer.byteLength(String(s), 'utf8'); }
  setItem(k, v) {
    const s = String(v);
    if (this.bytes(s) > this.keyMax) throw new Error('单条存档超过 1MB（' + this.bytes(s) + ' 字节）');
    let total = this.bytes(s);
    for (const [ok, ov] of this.m) if (ok !== k) total += this.bytes(ov);
    if (total > this.totalMax) throw new Error('本地缓存合计超过 10MB');
    this.m.set(k, s);
    this.writes.push(k);
  }
  removeItem(k) { this.m.delete(k); }
}

function lateGame() {
  const base = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v9-day4.json'), 'utf8')));
  base.clock = { day: 80, t: 10 * 60 };
  base.coins = 80000;
  base.stats = Object.assign({}, base.stats, { earned: 200000, todayEarn: 2000, dayEarn: Array.from({ length: 80 }, (_, i) => 400 + i) });
  base.inventory = Object.assign({}, base.inventory, {
    waterMax: 40, wood: 400, hay: 80,
    store: { carrot: 80, cabbage: 80, pumpkin: 80, strawberry: 40, watermelon: 40 },
    saplings: { apple: 12, orange: 12 },
    basket: Array.from({ length: 16 }, () => ({ type: 'pumpkin', n: 1 }))
  });
  // open every home tile and sprinkle crops
  base.tiles = (base.tiles || []).map((t, i) => Object.assign({}, t, {
    open: true, tilled: true, watered: i % 2 === 0,
    crop: { type: ['carrot', 'cabbage', 'pumpkin', 'strawberry', 'watermelon'][i % 5], age: 4, n: 1, rot: 0 }
  }));
  // pad tiles if the fixture is small
  while (base.tiles.length < 200) {
    const i = base.tiles.length;
    base.tiles.push({ f: 'home', c: i % 20, r: Math.floor(i / 20), open: true, tilled: true, watered: false,
      crop: { type: 'pumpkin', age: 3, n: 1, rot: 0 } });
  }
  base.trees = Array.from({ length: 80 }, (_, i) => ({ id: 't' + i, kind: 'wild', stage: 'tree', x: 20 + (i % 16) * 8, y: 20 + Math.floor(i / 16) * 10 }));
  base.animals = [
    { id: 'c1', kind: 'chicken' }, { id: 'c2', kind: 'chicken' },
    { id: 'p1', kind: 'pig' }, { id: 's1', kind: 'sheep' }, { id: 'w1', kind: 'cow' }
  ];
  base.catches = Array.from({ length: 40 }, (_, i) => ({ id: 'f' + i, kind: 'carp', gold: 3 }));
  base.yard = [];
  base.family = Object.assign({}, base.family, { love: 100, movedIn: true, kids: 2 });
  base.log = ['08:00 卖掉了南瓜', '08:12 浇了水', '09:00 阿禾搬来了', '10:00 孩子帮着收菜'];
  base.events = undefined;
  return SAVE.migrate(base);
}

ok('published xhs v1.0.0 (save v9) migrates cleanly to the current save version', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, 'save-v9-day4.json'), 'utf8'));
  assert.strictEqual(raw.saveVersion, 9);
  const s = SAVE.migrate(raw);
  assert.strictEqual(s.saveVersion, SAVE.CURRENT);
  assert(s.codex && typeof s.codex === 'object');
  assert(Array.isArray(s.achievements));
  assert(Array.isArray(s.milestones));
  assert(s.streaks && typeof s.streaks === 'object');
  assert.strictEqual((s.inventory && s.inventory.fishFood) | 0, 0);
  assert(Array.isArray(s.pondFish));
});

ok('late-game compact JSON stays under the 1MB key cap', () => {
  const s = lateGame();
  const json = JSON.stringify(s);
  const bytes = Buffer.byteLength(json, 'utf8');
  console.log('late-game save bytes:', bytes);
  assert(bytes < 1024 * 1024, 'late-game save must fit in one setStorage key');
  globalThis.__LATE_GAME_SAVE_BYTES = bytes;
});

ok('write copies the previous good save to :bak before replacing the main key', () => {
  const m = new Mem(), a = lateGame();
  const r1 = SAVE.write(Object.assign({}, a, { coins: 1 }), m);
  assert(r1.ok);
  const r2 = SAVE.write(Object.assign({}, a, { coins: 2 }), m);
  assert(r2.ok);
  assert.strictEqual(JSON.parse(m.getItem(SAVE.KEY)).coins, 2);
  assert.strictEqual(JSON.parse(m.getItem(SAVE.BAK)).coins, 1);
  const bakAt = m.writes.lastIndexOf(SAVE.BAK);
  const mainAt = m.writes.lastIndexOf(SAVE.KEY);
  assert(bakAt >= 0 && bakAt < mainAt, 'bak must be written before main');
});

ok('corrupt main falls back to :bak and does not clobber bak on the next write of that restored state', () => {
  const good = JSON.stringify(lateGame());
  const m = new Mem({ [SAVE.KEY]: '{"saveVersion":9,"tiles":', [SAVE.BAK]: good });
  const r = SAVE.read(m);
  assert(r.state); assert.strictEqual(r.from, SAVE.BAK);
  assert(r.notes.includes('restored-from-backup'));
  assert([...m.m.keys()].some(k => k.startsWith(SAVE.PREFIX + 'corrupt:')));
  const beforeBak = m.getItem(SAVE.BAK);
  SAVE.write(r.state, m);
  assert.strictEqual(m.getItem(SAVE.BAK), beforeBak, 'broken main must not replace bak');
});

ok('a write over the 1MB key cap fails without destroying the previous save', () => {
  const m = new Mem({}, { keyMax: 200 });
  const tiny = SAVE.migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'save-v1-minimal.json'), 'utf8')));
  // first write with a generous cap
  const wide = new Mem();
  assert(SAVE.write(tiny, wide).ok);
  const prev = wide.getItem(SAVE.KEY);
  const tight = new Mem({ [SAVE.KEY]: prev }, { keyMax: 80 });
  const fat = Object.assign({}, tiny, { log: ['x'.repeat(200)] });
  const r = SAVE.write(fat, tight);
  assert.strictEqual(r.ok, false, 'oversize write should fail');
  assert.strictEqual(tight.getItem(SAVE.KEY), prev, 'previous main save remains');
});

ok('clock-skew: negative away time is ignored by the same rule as settleOffline', () => {
  const r = SIM.offlineSettle(-30, [100, 120]);
  assert.strictEqual(r, null);
  const future = SIM.offlineSettle(-3600, [100]);
  assert.strictEqual(future, null);
  const okSettle = SIM.offlineSettle(3600, [100, 100, 100]);
  assert(okSettle && okSettle.gold >= 0);
});

ok('late-game compact JSON also stays under the 64KB cloud content cap', () => {
  const bytes = globalThis.__LATE_GAME_SAVE_BYTES;
  assert(bytes < 65536, 'late-game save must fit in one cloud content object');
});

const PLATFORM = fs.readFileSync(path.join(__dirname, '../platforms/xhs/platform.js'), 'utf8');

function lsMock(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] || null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); },
    _map: m
  };
}

function loadPlatform(opts) {
  opts = opts || {};
  const xhsMem = new Map();
  if (opts.xhs) {
    for (const [k, v] of Object.entries(opts.xhs)) {
      // container stores JSON.stringify(string)
      xhsMem.set(k, typeof v === 'string' && v.startsWith('"') ? v : JSON.stringify(v));
    }
  }
  const cloudItems = (opts.cloudItems || []).map(it => Object.assign({}, it));
  const calls = { add: 0, update: 0, query: 0, setStorage: 0, getStorage: 0 };
  let fail = opts.cloudFail || null;
  const mini = {
    setStorage({ key, data }) { calls.setStorage++; xhsMem.set(key, data); return Promise.resolve(); },
    getStorage({ key }) { calls.getStorage++; return Promise.resolve({ data: xhsMem.has(key) ? xhsMem.get(key) : undefined }); },
    getStorageInfo() { return Promise.resolve({ keys: [...xhsMem.keys()] }); }
  };
  if (!opts.noCloud) {
    mini.addCloudStorage = ({ collection, items }) => {
      calls.add++;
      if (fail) return Promise.reject(typeof fail === 'function' ? fail('add') : fail);
      const id = (items[0] && items[0].id) || 'cccccccccccccccccccccccc';
      cloudItems.push({ id, collection, content: items[0].content });
      return Promise.resolve({ data: [{ id, status: 'SUCCESS' }] });
    };
    mini.updateCloudStorage = ({ items }) => {
      calls.update++;
      if (fail) return Promise.reject(typeof fail === 'function' ? fail('update') : fail);
      const it = cloudItems.find(x => x.id === items[0].id);
      if (it) it.content = items[0].content;
      else cloudItems.push({ id: items[0].id, collection: 'farm', content: items[0].content });
      return Promise.resolve({ data: [{ id: items[0].id, status: 'SUCCESS' }] });
    };
    mini.queryCloudStorage = () => {
      calls.query++;
      if (fail && opts.failOnQuery !== false) {
        const e = typeof fail === 'function' ? fail('query') : fail;
        if (e) return Promise.reject(e);
      }
      return Promise.resolve({ items: cloudItems });
    };
    mini.removeCloudStorage = () => Promise.resolve({ data: [] });
  }
  const local = lsMock(opts.local || {});
  const sandbox = {
    console,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    unescape, encodeURIComponent, JSON, Date, Math, Object, String, Number, Array, Promise, Error,
    setTimeout, clearTimeout
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  // 1.1.1 gates cloud storage on client 9.51+ (buildVersion); the mock is a 9.53.3 client unless opts.build says otherwise
  sandbox.window.xhs = { miniTool: mini, launchOptions: { miniToolEnv: { buildVersion: opts.build != null ? opts.build : 9533123 } } };
  sandbox.window.localStorage = local;
  sandbox.window.dispatchEvent = function () {};
  vm.createContext(sandbox);
  vm.runInContext(PLATFORM, sandbox);
  return { P: sandbox.PFPlatform, calls, cloudItems, local, xhsMem, sandbox };
}

function saveObj(at, day, extra) {
  return Object.assign({ savedAt: at, clock: { day: day, t: 360 }, coins: day, saveVersion: 10, tiles: [{ f: 'home', c: 0, r: 0 }] }, extra || {});
}

function waitReady(P) {
  return Promise.resolve(P.ready);
}
// Cloud merge is intentionally backgrounded so the first frame is not blocked.
function waitCloud(P) {
  return waitReady(P).then(function () { return new Promise(function (r) { setTimeout(r, 120); }); });
}

ok('cloud stamp / isNewer: later savedAt wins; equal time uses larger day', () => {
  // load a platform just for the helpers
  const { P } = loadPlatform({ noCloud: true, local: {} });
  const { stamp, isNewer } = P.cloud;
  const a = stamp(saveObj(200, 1));
  const b = stamp(saveObj(100, 9));
  assert(isNewer(a, b), 'later savedAt should win even if day is smaller');
  assert(!isNewer(b, a));
  const c = stamp(saveObj(200, 8));
  const d = stamp(saveObj(200, 3));
  assert(isNewer(c, d), 'same savedAt, larger day wins');
  assert(!isNewer(d, c));
  assert(isNewer(a, null), 'valid beats missing');
  assert(!isNewer(null, a), 'missing never beats valid');
});

function cloudCases() {
  const KEY = SAVE.KEY;
  return Promise.resolve()
    .then(() => {
      const { P, calls } = loadPlatform({ noCloud: true, local: { [KEY]: JSON.stringify(saveObj(50, 2)) } });
      return waitReady(P).then(() => {
        assert.strictEqual(P.cloud.present, false);
        assert.strictEqual(P.cloud.usable, false);
        const raw = P.store().getItem(KEY);
        assert.strictEqual(JSON.parse(raw).clock.day, 2);
        P.store().setItem(KEY, JSON.stringify(saveObj(60, 3)));
        return new Promise(r => setTimeout(r, 50)).then(() => {
          assert.strictEqual(calls.add, 0);
          assert.strictEqual(calls.update, 0);
          assert.strictEqual(calls.query, 0);
          console.log('ok   cloud-missing: falls back to local, never calls cloud APIs');
          n++;
        });
      });
    })
    .then(() => {
      const localSave = saveObj(80, 4);
      const { P, calls } = loadPlatform({
        cloudFail: { errCode: 2001, errMsg: '存储读写失败' },
        local: { [KEY]: JSON.stringify(localSave) }
      });
      return waitReady(P).then(() => {
        assert.strictEqual(P.cloud.present, true, 'methods are present even when calls fail');
        const raw = P.store().getItem(KEY);
        assert(raw, 'query failure must not be treated as empty');
        assert.strictEqual(JSON.parse(raw).clock.day, 4);
        assert.strictEqual(JSON.parse(raw).savedAt, 80);
        P.store().setItem(KEY, JSON.stringify(saveObj(90, 5)));
        return P.cloud.flush().then(() => {
          // flush may retry and fail; local cache must still hold the new save
          assert.strictEqual(JSON.parse(P.store().getItem(KEY)).clock.day, 5);
          assert(calls.query >= 1);
          console.log('ok   cloud-fail: keeps local, does not wipe on query/write error');
          n++;
        });
      });
    })
    .then(() => {
      const localSave = saveObj(100, 3);
      const cloudSave = saveObj(200, 9, { coins: 999 });
      const { P } = loadPlatform({
        local: { [KEY]: JSON.stringify(localSave) },
        cloudItems: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', collection: 'farm', content: cloudSave }]
      });
      return waitCloud(P).then(() => {
        const got = JSON.parse(P.store().getItem(KEY));
        assert.strictEqual(got.savedAt, 200, 'cloud-newer must be adopted');
        assert.strictEqual(got.clock.day, 9);
        assert.strictEqual(got.coins, 999);
        // write-through cache
        // (localStorage mock is the sandbox one; P.store already has it)
        console.log('ok   cloud-newer: load picks the cloud save and caches it locally');
        n++;
      });
    })
    .then(() => {
      const localSave = saveObj(300, 12, { coins: 77 });
      const cloudSave = saveObj(150, 6, { coins: 1 });
      const { P, cloudItems, calls } = loadPlatform({
        local: { [KEY]: JSON.stringify(localSave) },
        cloudItems: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', collection: 'farm', content: cloudSave }],
        failOnQuery: false
      });
      return waitCloud(P).then(() => {
        const got = JSON.parse(P.store().getItem(KEY));
        assert.strictEqual(got.savedAt, 300, 'local-newer must be kept');
        assert.strictEqual(got.clock.day, 12);
        assert.strictEqual(got.coins, 77);
        return P.cloud.flush().then(() => {
          assert(calls.update >= 1 || calls.add >= 1, 'newer local should be written through to cloud');
          const onCloud = cloudItems[cloudItems.length - 1].content;
          assert.strictEqual(onCloud.savedAt, 300);
          assert.strictEqual(onCloud.clock.day, 12);
          console.log('ok   local-newer: keeps local and write-through to cloud');
          n++;
        });
      });
    })
    .then(() => {
      console.log('passed', n, 'xhs-save tests; late-game bytes', globalThis.__LATE_GAME_SAVE_BYTES);
    });
}

cloudCases().catch(err => { console.error(err); process.exit(1); });
