// v5.11.0.11 相册: metadata, packing, hostile save data, backfill facts, size budget, v15 round trips
const assert = require('assert'), fs = require('fs'), path = require('path');
const A = require('../album.js'), Save = require('../save.js');
let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, e.stack); process.exitCode = 1; } };
const L = { kid0: '小豆', kid1: '小米', kid: '小豆', mate: '阿松' };
ok('20-25 moments, unique ids, every one has a title, line, hint and a place', () => {
  assert(A.MOMENTS.length >= 20 && A.MOMENTS.length <= 25, 'count ' + A.MOMENTS.length);
  assert.equal(new Set(A.MOMENTS.map(m => m.id)).size, A.MOMENTS.length);
  for (const m of A.MOMENTS) { assert(/^[a-z][a-z0-9]{0,11}$/.test(m.id), m.id); assert(m.t && m.line && m.hint && m.at, m.id); assert(Array.isArray(m.who)); }
  for (const id of ['moved', 'born0', 'school', 'classmate', 'party', 'market', 'sports', 'fest', 'wedding']) assert(A.BY[id], id);
});
ok('a moment is taken once; packing is one short string each and round-trips', () => {
  const a = A.empty(); assert(A.add(a, { id: 'classmate', d: 72, t: 16 * 60 + 5, x: 42.6, y: 48, w: ['kid0', 'farmer'] }));
  assert(!A.add(a, { id: 'classmate', d: 80, t: 1, x: 0, y: 0 }), 'second time'); assert(!A.add(a, { id: 'nope', d: 1 }));
  A.add(a, { id: 'moved', d: 41, t: -1, x: 42, y: 48, w: ['farmer', 'partner'] });
  const p = A.pack(a); assert.deepEqual(p, ['classmate|72|965|43|48|kid0.farmer', 'moved|41|-1|42|48|farmer.partner']);
  const b = A.valid(p); assert.deepEqual(b, a); assert.equal(A.get(b, 'moved').t, -1);
});
ok('size budget: every moment taken, with four people each, stays under 1.5 KB in the save', () => {
  const a = A.empty(); for (const m of A.MOMENTS) A.add(a, { id: m.id, d: 99999, t: 1439, x: -1234, y: 1234, w: ['farmer', 'partner', 'kid0', 'kid1'] });
  assert.equal(a.list.length, A.MOMENTS.length); const bytes = JSON.stringify({ album: A.pack(a) }).length;
  console.log('     all', A.MOMENTS.length, 'moments:', bytes, 'bytes'); assert(bytes < 1500, 'bytes ' + bytes);
});
ok('hostile save data is bounded and dropped', () => {
  const raw = [null, 7, 'x'.repeat(500), 'open|1|0|0|0', 'open|2|0|0|0', 'bad id|1|1|1|1', 'fest|1e30|99999|1e9|-1e9|a.b.c.d.e.f.<script>', 'party|x|y|z|w'];
  const a = A.valid(raw.concat(Array(100).fill('rain|1|1|1|1'))); assert.deepEqual(a.list.map(e => e.id), ['open', 'fest', 'party', 'rain']);
  const f = A.get(a, 'fest'); assert.equal(f.d, 1e6); assert.equal(f.t, 1439); assert.equal(f.x, 9999); assert.equal(f.y, -9999); assert.deepEqual(f.w, ['a', 'b', 'c', 'd']);
  assert.equal(A.get(a, 'open').d, 1); assert.deepEqual(A.valid(null), A.empty()); assert.deepEqual(A.valid({ list: [] }), A.empty());
});
ok('captions: names filled in, re-staged photos say so, unknown days read 很早以前', () => {
  const c = A.caption({ id: 'born0', d: 48, t: 7 * 60 + 5, w: [] }, L); assert.equal(c.title, '第一个宝宝'); assert(c.line.includes('小豆')); assert.equal(c.when, '第48天 07:05'); assert(!c.restaged);
  const r = A.caption({ id: 'classmate', d: 0, t: -1, w: [] }, L); assert.equal(r.when, '很早以前'); assert(r.restaged);
  assert(A.caption({ id: 'wedding', d: 90, t: 1100, w: [] }, {}).line.includes('心上人'));
});
ok('album view: taken by day, then locked frames with a hint (not the title)', () => {
  const a = A.empty(); A.add(a, { id: 'school', d: 66, t: 480 }); A.add(a, { id: 'moved', d: 41, t: 400 }); A.add(a, { id: 'classmate', d: 0, t: -1 });
  const v = A.view(a, L); assert.deepEqual(v.shots.map(s => s.id), ['moved', 'school', 'classmate']); assert.equal(v.have, 3); assert.equal(v.total, A.MOMENTS.length);
  assert.equal(v.locked.length, A.MOMENTS.length - 3); assert(v.locked.every(x => x.title === '???' && x.hint && x.locked));
});
ok('backfill facts from an old save: milestones, achievements, kids, town days', () => {
  const f = { ms: { open: 1, fish: 50, met: 30, moved: 41, manor: 55, animal: 0 }, ach: { kidwork: 53, school: 66, firstrain: 68, truecatch: 0, firstbug: 64, firstpark: 67, party: 71 },
    kids: [{ born: 48 }, { born: 58 }], met: 30, moved: 41, mate: 98, town: true, marketDays: 1, marketLast: 105, sports: 112, fest: 0, inn: false, wed: 0, movedIn: 0, giant: 54 };
  const due = A.due(f), ids = due.map(d => d.id), day = id => due.find(d => d.id === id).d;
  for (const id of ['open', 'animal', 'fish', 'met', 'moved', 'manor', 'born0', 'born1', 'kidwork', 'school', 'classmate', 'bug', 'park', 'rain', 'giant', 'rarefish', 'party', 'towngate', 'market', 'sports']) assert(ids.includes(id), id);
  for (const id of ['fest', 'inn', 'wedding', 'newhouse']) assert(!ids.includes(id), id);
  assert.equal(day('born1'), 58); assert.equal(day('school'), 66); assert.equal(day('classmate'), 0); assert.equal(day('market'), 105); assert.equal(day('sports'), 112); assert.equal(day('animal'), 0);
  assert.deepEqual(A.due({}), []);
});
ok('picture store: own key per farm, bad entries dropped, a full storage does not throw', () => {
  const mem = {}, store = { getItem: k => mem[k] || null, setItem: (k, v) => { mem[k] = v; } };
  assert(A.putThumb(store, 123, 'moved', 'data:image/png;base64,AAA', 0)); assert.deepEqual(A.thumb(store, 123, 'moved'), { url: 'data:image/png;base64,AAA', restaged: false });
  assert(Object.keys(mem)[0] === A.KEY + '123'); assert(!A.putThumb(store, 123, 'nope', 'data:image/png;base64,AAA'));
  mem[A.KEY + '9'] = JSON.stringify({ moved: ['javascript:alert(1)', 0], school: ['data:image/png;base64,B', 1], x: 1 }); A.forget(9);
  assert.equal(A.thumb(store, 9, 'moved'), null); assert.deepEqual(A.thumb(store, 9, 'school'), { url: 'data:image/png;base64,B', restaged: true });
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } }; assert.equal(A.putThumb(full, 5, 'open', 'data:image/png;base64,C', 0), false); assert(A.thumb(full, 5, 'open'), 'kept for the session');
});
ok('v10 / v15 fixtures load without an album; the v15 append-only album survives encode/decode; never inflates the save', () => {
  for (const file of ['save-v10-day59-manor.json', 'save-v15-day72-cottage.json']) {
    let s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file))); s = s.save || s;
    const old = Save.migrate(s); assert.equal(old.saveVersion, 15); assert(!('album' in old), 'old saves have no album field until the game backfills');
    const a = A.empty(); for (const m of A.MOMENTS) A.add(a, { id: m.id, d: 50, t: m.id === 'classmate' ? -1 : 600, x: 40, y: 48, w: ['farmer', 'kid0'] });
    const before = Save.encode(old).length; old.album = A.pack(a); const enc = Save.encode(old), r = Save.decode(enc);
    assert.equal(r.saveVersion, 15); assert.deepEqual(r.album, A.pack(a)); assert(enc.length - before < 1500, 'grew ' + (enc.length - before));
    assert(!/data:image/.test(enc), 'no pictures in the save');
  }
});
ok('review: a built market square / town buildings alone never backfill a moment; only records of the event do', () => {
  const ids = f => A.due(f).map(d => d.id);
  assert(!ids({ marketDays: 0, marketLast: 0 }).includes('market'), 'square built, nothing sold');
  assert.deepEqual(A.due({ marketDays: 3, marketLast: 21 }).filter(d => d.id === 'market'), [{ id: 'market', d: 0 }], 'several market days: first day unknown');
  assert(!ids({ sports: 0, fest: 0, inn: false, wed: 0, movedIn: 0, mate: 0, giant: null }).length);
});
ok('review: a photo still waiting to be taken is packed with the album (7th field) and comes back; taken photos stay 6 fields', () => {
  const a = A.empty(); A.add(a, { id: 'born0', d: 48, t: 400, x: 42, y: 48, w: [], q: { at: 69520, f: 'partner', re: 0 } }); A.add(a, { id: 'open', d: 1, t: 390, x: 82, y: 66, w: ['farmer'] });
  const p = A.pack(a); assert.deepEqual(p, ['born0|48|400|42|48||69520.partner.0', 'open|1|390|82|66|farmer']);
  const b = A.valid(p); assert.deepEqual(A.get(b, 'born0').q, { at: 69520, f: 'partner', re: 0 }); assert(!('q' in A.get(b, 'open')));
  assert.deepEqual(A.valid(['wedding|90|1100|1|2|kid0|99.<x>.1']).list[0].q, { at: 99, f: '', re: 1 });
  assert(A.remove(b, 'born0') && !A.has(b, 'born0') && !A.remove(b, 'born0'));
});
ok('v5.11.0.8 compact saves: a full album (every moment, pending 7th fields too) passes compact() unchanged, round-trips, and the day-72 save stays well under 48KB', () => {
  let s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'))); s = s.save || s;
  const v = Save.migrate(s), a = A.empty();
  for (const m of A.MOMENTS) A.add(a, { id: m.id, d: 999, t: m.id === 'classmate' ? -1 : 1439, x: 1023, y: 1007, w: ['farmer', 'partner', 'kid0', 'kid1'], q: m.id === 'wedding' ? { at: 1438560, f: 'partner', re: 1 } : undefined });
  v.album = A.pack(a); const c = Save.compact(v);
  assert.deepEqual(c.album, v.album, 'compact leaves the album strings alone');
  const back = Save.migrate(JSON.parse(JSON.stringify(c))); assert.deepEqual(back.album, v.album); assert.equal(JSON.stringify(Save.compact(back)), JSON.stringify(c));
  const ab = Buffer.byteLength(JSON.stringify(v.album)), cb = Buffer.byteLength(JSON.stringify(c)); console.log(`     album ${ab} B (24 moments, worst case), compact day-72 save ${cb} B`);
  assert(ab < 1500, String(ab)); assert(cb < 48 * 1024, String(cb));
});
console.log('album-test:', n, 'ok');
