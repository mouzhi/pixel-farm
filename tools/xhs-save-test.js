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

console.log('passed', n, 'xhs-save tests; late-game bytes', globalThis.__LATE_GAME_SAVE_BYTES);
