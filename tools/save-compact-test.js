// v5.11.0.8 compact saves (still saveVersion 15):  node tools/save-compact-test.js
//   PF_REAL_SAVE=<exported JSON> also checks a real save (local only, never committed) and prints its sizes.
// The compact form leaves out what validate() fills back in, rounds floats (rot to 2 decimals, others to 3), and an
// unchanged validate() (the one older pages run) reads it, so old verbose saves and new compact ones both load.
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const SAVE = require('../save.js'), FIX = path.join(__dirname, 'fixtures');
const bytes = x => Buffer.byteLength(typeof x === 'string' ? x : JSON.stringify(x));
const rounded = s => JSON.parse(JSON.stringify(s), (k, v) => (typeof v === 'number' && !Number.isInteger(v) && isFinite(v) ? (k === 'rot' ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000) : v));
class Mem { constructor() { this.m = {}; } get length() { return Object.keys(this.m).length; } key(i) { return Object.keys(this.m)[i] || null; } getItem(k) { return k in this.m ? this.m[k] : null; } setItem(k, v) { this.m[k] = String(v); } removeItem(k) { delete this.m[k]; } }
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const read = f => { const t = JSON.parse(fs.readFileSync(f, 'utf8')); return t.save || t; };
const files = fs.readdirSync(FIX).filter(f => /^save-.*\.json$/.test(f)).map(f => path.join(FIX, f));
if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) files.push(process.env.PF_REAL_SAVE);
for (const f of files) {
  const name = path.basename(f), raw = read(f), v = SAVE.migrate(JSON.parse(JSON.stringify(raw))), c = SAVE.compact(v);
  ok(`${name}: compact reads back as the same state (floats rounded only)`, () => assert.deepStrictEqual(SAVE.migrate(JSON.parse(JSON.stringify(c))), SAVE.migrate(rounded(v))));
  ok(`${name}: load -> save -> load is identical`, () => {
    const a = SAVE.migrate(JSON.parse(JSON.stringify(c))), c2 = SAVE.compact(a), b = SAVE.migrate(JSON.parse(JSON.stringify(c2)));
    assert.strictEqual(JSON.stringify(c2), JSON.stringify(c)); assert.deepStrictEqual(b, a);
  });
  const stamp = x => Object.assign({}, x, raw.createdAt ? {} : { createdAt: 0 }, raw.savedAt ? {} : { savedAt: 0 }); // a fixture without them gets Date.now()
  ok(`${name}: the verbose save still loads unchanged (no rounding on read)`, () => assert.deepStrictEqual(stamp(SAVE.migrate(JSON.parse(JSON.stringify(raw)))), stamp(v)));
  const vb = bytes(v), cb = bytes(c); console.log(`     ${name}: verbose ${vb} B -> compact ${cb} B (${Math.round(100 - cb / vb * 100)}% smaller)`);
  if (v.clock.day >= 50) ok(`${name}: at least 30% smaller and under 48KB (xhs cloud content max 64KB)`, () => { assert(cb < vb * 0.7, cb + ' vs ' + vb); assert(cb < 48 * 1024, String(cb)); });
}
ok('write() stores the compact form; read() gives the full state; encode/decode too', () => {
  const v = SAVE.migrate(read(path.join(FIX, 'save-v15-day72-cottage.json'))), m = new Mem();
  assert(SAVE.write(v, m).ok); const stored = m.getItem(SAVE.KEY);
  assert.strictEqual(stored, JSON.stringify(SAVE.compact(v))); assert(bytes(stored) < bytes(v) * 0.7);
  const back = SAVE.read(m).state; assert.deepStrictEqual(back, SAVE.migrate(rounded(v)));
  assert.strictEqual(JSON.parse(stored).savedAt, v.savedAt); assert.strictEqual(JSON.parse(stored).clock.day, v.clock.day); // xhs platform.js stampOf
  assert.deepStrictEqual(SAVE.decode(SAVE.encode(back)), back);
});
ok('defaults dropped are exactly what validate() fills (tiles, trees, animals, little farms, levels)', () => {
  const t = SAVE.migrate({ saveVersion: 15, tiles: [{}], trees: [{ id: 'w0', kind: 'wild' }], animals: [{ id: 'c0', kind: 'chicken', h: 50 }] });
  assert.deepStrictEqual(t.tiles[0], { f: 'home', c: 0, r: 0, open: true, tilled: false, watered: false, debris: null, weed: null, crop: null });
  assert.deepStrictEqual(t.trees[0], { id: 'w0', x: 0, y: 0, kind: 'wild', v: 0, stage: 'tree', age: 0, ripe: 0, cd: 0 });
  assert.deepStrictEqual(t.animals[0], { id: 'c0', kind: 'chicken', h: 50, cd: 1, ready: 0, pet: 0 });
  const c = SAVE.compact(t); assert.deepStrictEqual(c.tiles[0], {}); assert.deepStrictEqual(c.trees[0], { id: 'w0', x: 0, y: 0, kind: 'wild' });
  assert.deepStrictEqual(c.animals[0], { id: 'c0', kind: 'chicken', h: 50 }); assert.deepStrictEqual(c.upgrades, {});
  const closed = SAVE.compact(Object.assign({}, t, { tiles: [Object.assign({}, t.tiles[0], { open: false, tilled: true })] }));
  assert.deepStrictEqual(closed.tiles[0], { open: false, tilled: 1 }); assert.strictEqual(SAVE.migrate(closed).tiles[0].open, false); assert.strictEqual(SAVE.migrate(closed).tiles[0].tilled, true);
});
console.log(`all ${n} passed`);
