// Node unit tests for playlog aggregation and folder-file writing (no browser).
'use strict';
const assert = require('assert');
const LOG = require('../playlog.js');

function mem() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, raw: m };
}
function snap(o) { return Object.assign({ day: 1, t: 360, coins: 0, createdAt: 1_000_000, gameVersion: '4.7.1', tiles: 12, regions: 0, animals: 0, now: 1_000_000 }, o); }

let n = 0;
function test(name, fn) { fn(); n++; }

test('boot opens day 1 and a session, isolated from the save key', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ coins: 0 }), { store: s });
  const d = LOG.get();
  assert.strictEqual(d.schema, 1);
  assert.strictEqual(d.days.length, 1);
  assert.strictEqual(d.days[0].day, 1);
  assert.strictEqual(d.days[0].goldStart, 0);
  assert.strictEqual(d.days[0].open, true);
  assert.strictEqual(d.sessions.length, 1);
  assert.strictEqual(d.events[0].type, 'session-start');
  assert.ok(s.raw[LOG.KEY]);
  assert.strictEqual(Object.keys(s.raw).length, 1);
});

test('income by source, spend by item, closeDay sets goldEnd and counts', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ coins: 4 }), { store: s });
  LOG.income('yard', 5);
  LOG.income('crops', 8);
  LOG.income('fruit', 3);
  LOG.income('animals', 6);
  LOG.income('fish', 2);
  LOG.income('wood', 4);
  LOG.spend('seeds', 3);
  LOG.spend('hay', 2);
  const ended = LOG.closeDay(snap({ day: 1, coins: 27, tiles: 16, regions: 1, animals: 2, now: 1_000_000 + 300000 }));
  assert.strictEqual(ended.open, false);
  assert.strictEqual(ended.goldStart, 4);
  assert.strictEqual(ended.goldEnd, 27);
  assert.deepStrictEqual(ended.income, { crops: 8, fruit: 3, animals: 6, fish: 2, wood: 4, yard: 5, offline: 0 });
  assert.strictEqual(ended.spend.seeds, 3);
  assert.strictEqual(ended.spend.hay, 2);
  assert.strictEqual(ended.tiles, 16);
  assert.strictEqual(ended.regions, 1);
  assert.strictEqual(ended.animals, 2);
  assert(!('speed' in ended), 'v5.10.2: one game speed, nothing to log');
  assert.strictEqual(LOG.current(), null);
});

test('purchase records day, game time, real minutes since farm start, and a purchase event', () => {
  const s = mem();
  LOG.reset(s);
  const createdAt = 1_000_000, now = createdAt + 7.5 * 60000;
  LOG.boot(snap({ day: 2, t: 8 * 60, coins: 80, createdAt, now: createdAt }), { store: s });
  LOG.purchase({ id: 'field', name: '田地', label: '开垦 4 格', cost: 60, day: 2, t: 8 * 60, createdAt, now, region: false });
  const day = LOG.current();
  assert.strictEqual(day.purchases.length, 1);
  assert.strictEqual(day.purchases[0].id, 'field');
  assert.strictEqual(day.purchases[0].cost, 60);
  assert.strictEqual(day.purchases[0].day, 2);
  assert.strictEqual(day.purchases[0].t, 480);
  assert.strictEqual(day.purchases[0].realMin, 7.5);
  assert.strictEqual(day.spend.field, 60);
  const ev = LOG.get().events.filter(e => e.type === 'purchase');
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].realMin, 7.5);
});

test('region buy is an unlock event', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ day: 5, t: 600, coins: 200 }), { store: s });
  LOG.purchase({ id: 'forest', name: '林场', label: '打开林场', cost: 80, day: 5, t: 600, createdAt: 1_000_000, now: 1_000_000, region: true });
  const ev = LOG.get().events.filter(e => e.type === 'unlock');
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].id, 'forest');
});

test('busy / idle / sleep minutes and idle breakdown', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap(), { store: s });
  LOG.tick(30, 'tidy');
  LOG.tick(20, 'fish', '正在池塘边钓鱼');
  LOG.tick(10, 'idle', '坐在池塘边休息');
  LOG.tick(15, 'idle', '在田边巡视');
  LOG.tick(40, 'sleep');
  LOG.tick(5, null);
  const d = LOG.closeDay(snap({ coins: 0 }));
  assert.strictEqual(d.busyMin, 30);
  assert.strictEqual(d.idleMin, 50);
  assert.strictEqual(d.sleepMin, 40);
  assert.strictEqual(d.idle.fish, 20);
  assert.strictEqual(d.idle.rest, 10);
  assert.strictEqual(d.idle.patrol, 15);
  assert.strictEqual(d.idle.other, 5);
});

test('offline settlement is recorded on the day and as an event', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ coins: 10, day: 4 }), { store: s });
  LOG.offline({ gold: 12, days: 1, awaySec: 600, capped: false, avg: 24 }, snap({ day: 4, t: 400, coins: 22, now: 2_000_000 }));
  const d = LOG.current();
  assert.strictEqual(d.income.offline, 12);
  assert.strictEqual(d.offline.length, 1);
  assert.strictEqual(d.offline[0].gold, 12);
  assert.strictEqual(LOG.get().events.filter(e => e.type === 'offline').length, 1);
});

test('rollover closes yesterday and opens today', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ day: 1, coins: 0 }), { store: s });
  LOG.income('yard', 8);
  const ended = LOG.closeDay(snap({ day: 1, coins: 8, now: 1_300_000 }));
  const next = LOG.openDay(snap({ day: 2, coins: 8, now: 1_300_000 }));
  assert.strictEqual(ended.day, 1);
  assert.strictEqual(ended.open, false);
  assert.strictEqual(ended.income.yard, 8);
  assert.strictEqual(next.day, 2);
  assert.strictEqual(next.open, true);
  assert.strictEqual(next.goldStart, 8);
  assert.strictEqual(LOG.get().days.length, 2);
});

test('reload resumes the open day without duplicating it', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ day: 3, coins: 10, now: 1_000_000 }), { store: s });
  LOG.income('crops', 4);
  LOG.flush();
  LOG.reset(s);
  LOG.boot(snap({ day: 3, coins: 14, now: 1_100_000 }), { store: s });
  assert.strictEqual(LOG.get().days.length, 1);
  assert.strictEqual(LOG.current().day, 3);
  assert.strictEqual(LOG.current().income.crops, 4);
  LOG.income('crops', 1);
  assert.strictEqual(LOG.current().income.crops, 5);
});

test('caps last 365 day summaries and last 2000 events', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ day: 1, coins: 0 }), { store: s });
  for (let i = 1; i <= 400; i++) {
    LOG.closeDay(snap({ day: i, coins: i }));
    LOG.openDay(snap({ day: i + 1, coins: i }));
  }
  for (let i = 0; i < 2500; i++) LOG.event({ type: 'chop', id: i, day: 1, t: 0 });
  LOG.flush();
  const d = LOG.get();
  assert.strictEqual(d.days.length, 365);
  assert.strictEqual(d.days[0].day, 401 - 364);
  assert.strictEqual(d.days[d.days.length - 1].day, 401);
  assert.strictEqual(d.events.length, 2000);
  assert.strictEqual(d.events[0].id, 2500 - 2000);
});

test('persist survives JSON round-trip of a dirty store', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap({ coins: 1 }), { store: s });
  LOG.income('yard', 2);
  LOG.flush();
  const copy = mem();
  copy.setItem(LOG.KEY, s.getItem(LOG.KEY));
  LOG.reset(copy);
  const d = LOG.load(copy);
  assert.strictEqual(d.days[0].income.yard, 2);
});

test('garbage in localStorage is ignored', () => {
  const s = mem();
  s.setItem(LOG.KEY, '{nope');
  const d = LOG.load(s);
  assert.strictEqual(d.days.length, 0);
  assert.strictEqual(d.schema, 1);
});

test('fps sample is stored on the day', () => {
  const s = mem();
  LOG.reset(s);
  LOG.boot(snap(), { store: s });
  LOG.sampleFps(60); LOG.sampleFps(50); LOG.sampleFps(40);
  const d = LOG.closeDay(snap());
  assert.strictEqual(d.fps.n, 3);
  assert.strictEqual(d.fps.avg, 50);
  assert.strictEqual(d.fps.min, 40);
});

async function testAsync(name, fn) { await fn(); n++; }

(async () => {
  await testAsync('writeToDir writes pretty JSON save + playlog files on a mock handle', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ coins: 11, gameVersion: '4.7.1' }), { store: s });
    LOG.income('yard', 5);
    const dir = LOG.memoryDir();
    const farm = { saveVersion: 8, gameVersion: '4.7.1', clock: { day: 1, t: 400 }, coins: 16 };
    const r = await LOG.syncNow('test', dir, farm);
    assert.ok(r.ok, r.error);
    const play = JSON.parse(await LOG.readFromDir(dir, 'pixel-farm-playlog.json'));
    const save = JSON.parse(await LOG.readFromDir(dir, 'pixel-farm-save.json'));
    assert.strictEqual(play.meta.kind, 'pixel-farm-playlog');
    assert.strictEqual(play.meta.schema, 1);
    assert.strictEqual(play.days[0].income.yard, 5);
    assert.ok(play.events.some(e => e.type === 'session-start'));
    assert.strictEqual(save.meta.kind, 'pixel-farm-save');
    assert.strictEqual(save.meta.saveVersion, 8);
    assert.strictEqual(save.save.coins, 16);
    assert.strictEqual(save.save.saveVersion, 8);
    const pretty = dir.files['pixel-farm-playlog.json'].text;
    assert.ok(pretty.includes('\n  '), 'pretty-printed');
  });

  // v5.11.0.20: resumeDir / refreshPerm against a mock File System Access handle
  function err(name, message) { const e = new Error(message || name); e.name = name; return e; }

  await testAsync('resumeDir: requestPermission granted clears needGesture and writes', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ coins: 3 }), { store: s, getSave: () => snap({ coins: 3, saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'granted' });
    const st0 = LOG.installDir(dir, 'prompt');
    assert.strictEqual(st0.needGesture, true);
    assert.strictEqual(st0.granted, false);
    const st = await LOG.resumeDir();
    assert.strictEqual(dir.requestCalls, 1, 'requestPermission called');
    assert.strictEqual(st.granted, true);
    assert.strictEqual(st.needGesture, false);
    assert.strictEqual(st.lastError, null);
    assert.ok(dir.files['pixel-farm-save.json'].text.includes('pixel-farm-save'));
  });

  await testAsync('resumeDir calls requestPermission before any other await when the handle is in memory', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    let requestAt = -1, queryAt = -1, tick = 0;
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'granted' });
    const origReq = dir.requestPermission.bind(dir);
    dir.requestPermission = async function () { requestAt = ++tick; return origReq(); };
    const origQuery = dir.queryPermission.bind(dir);
    dir.queryPermission = async function () { queryAt = ++tick; return origQuery(); };
    LOG.installDir(dir, 'prompt');
    await LOG.resumeDir();
    assert.strictEqual(requestAt, 1, 'requestPermission is the first async call in the click');
    assert.ok(queryAt === -1 || queryAt > requestAt, 'queryPermission must not precede requestPermission');
  });

  await testAsync('resumeDir: requestPermission throw is logged and next click falls back to the picker', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestThrow: err('NotFoundError', 'handle gone') });
    LOG.installDir(dir, 'prompt');
    const st = await LOG.resumeDir();
    assert.strictEqual(st.granted, false);
    assert.strictEqual(st.needGesture, true);
    assert.strictEqual(st.needsRepick, true);
    assert.ok(/NotFoundError/.test(st.lastError), st.lastError);
    let picked = 0;
    const fresh = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.setPicker(async () => { picked++; return fresh; });
    const st2 = await LOG.resumeDir();
    LOG.setPicker(null);
    assert.strictEqual(picked, 1);
    assert.strictEqual(st2.granted, true);
    assert.strictEqual(st2.needsRepick, false);
    assert.ok(fresh.files['pixel-farm-save.json']);
  });

  await testAsync('resumeDir: granted permission but stale write marks needsRepick', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'granted', writeThrow: err('InvalidStateError', 'stale file handle') });
    LOG.installDir(dir, 'prompt');
    const st = await LOG.resumeDir();
    assert.strictEqual(st.granted, true, 'permission itself was granted');
    assert.strictEqual(st.needsRepick, true);
    assert.ok(/InvalidStateError/.test(st.lastError), st.lastError);
  });

  await testAsync('refreshPerm: queryPermission granted clears a stuck needGesture flag', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    LOG.installDir(dir, 'prompt');
    assert.strictEqual(LOG.status().needGesture, true);
    dir.permission = 'granted';
    const st = await LOG.refreshPerm();
    assert.strictEqual(st.granted, true);
    assert.strictEqual(st.needGesture, false);
    assert.strictEqual(dir.queryCalls, 1);
    assert.strictEqual(dir.requestCalls, 0, 'refresh must not call requestPermission (no gesture)');
  });

  await testAsync('hydrateDir: queryPermission prompt but a probe write succeeds recovers without a click', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    LOG.installDir(dir, 'prompt');
    // installDir does not probe; hydrateDir should
    const st = await LOG.hydrateDir();
    assert.strictEqual(st.granted, true, 'probe write recovered a handle whose queryPermission said prompt');
    assert.strictEqual(st.needGesture, false);
    assert.ok(!dir.files[LOG.PROBE_FILE], 'probe file must be removed');
    assert.ok(dir.files['pixel-farm-save.json'], 'empty folder: first real sync may write the save');
  });

  await testAsync('hydrateDir: NotFoundError from queryPermission is recorded and asks for a re-pick', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt', queryThrow: err('NotFoundError', 'no such file'), writeThrow: err('NotFoundError', 'no such file') });
    LOG.installDir(dir, 'prompt');
    const st = await LOG.hydrateDir();
    assert.strictEqual(st.granted, false);
    assert.strictEqual(st.needsRepick, true);
    assert.ok(/NotFoundError/.test(st.lastError), st.lastError);
  });

  function wrapDay(day, coins, savedAt, extra) {
    return { meta: { kind: 'pixel-farm-save', exportedAt: '2026-11-21T10:02:00.000Z', gameVersion: '5.11.0.16', saveVersion: 15 },
      save: Object.assign({ saveVersion: 15, gameVersion: '5.11.0.16', createdAt: 1_000_000, savedAt: savedAt || (day * 1000), clock: { day, t: day === 12 ? 800 : 360 }, coins }, extra) };
  }
  function browserDay(day, coins) {
    return { saveVersion: 15, gameVersion: '5.11.0.20', createdAt: 1_000_000, savedAt: day * 100 + 50, clock: { day, t: day === 12 ? 800 : 360 }, coins };
  }
  function seedFolder(dir, day, coins) {
    dir.files['pixel-farm-save.json'] = { text: JSON.stringify(wrapDay(day, coins), null, 2) + '\n' };
  }
  function folderDay(dir) {
    const o = JSON.parse(dir.files['pixel-farm-save.json'].text);
    return o.save.clock.day;
  }

  await testAsync('boot does not overwrite folder day 12 with browser day 2 (no clicks)', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 2, coins: 10 }), { store: s, getSave: () => browserDay(2, 10) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    seedFolder(dir, 12, 999);
    const before = dir.files['pixel-farm-save.json'].text;
    LOG.installDir(dir, 'prompt');
    const st = await LOG.hydrateDir();
    assert.strictEqual(folderDay(dir), 12, 'folder day 12 must stay, got ' + folderDay(dir));
    assert.strictEqual(dir.files['pixel-farm-save.json'].text, before, 'pixel-farm-save.json bytes must be unchanged');
    assert.ok(!dir.files['pixel-farm-playlog.json'], 'must not write the playlog either');
    assert.ok(!dir.files[LOG.PROBE_FILE], 'probe file cleaned up');
    assert.strictEqual(st.granted, true, 'probe may grant permission');
    assert.ok(st.conflict && st.conflict.paused, JSON.stringify(st.conflict));
    assert.strictEqual(st.conflict.folder.day, 12);
    assert.strictEqual(st.conflict.browser.day, 2);
  });

  await testAsync('granted-on-boot also pauses when folder and browser days differ', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 2, coins: 10 }), { store: s, getSave: () => browserDay(2, 10) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    seedFolder(dir, 12, 999);
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.strictEqual(folderDay(dir), 12);
    assert.ok(st.conflict && st.conflict.folder.day === 12 && st.conflict.browser.day === 2);
    const again = await LOG.syncNow('manual');
    assert.strictEqual(again.reason, 'conflict');
    assert.strictEqual(folderDay(dir), 12, 'a later syncNow must not overwrite while paused');
  });

  await testAsync('resolveConflict(browser) backs up day 12 then writes the browser save', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 2, coins: 10 }), { store: s, getSave: () => browserDay(2, 10) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    seedFolder(dir, 12, 999);
    LOG.installDir(dir, 'granted');
    await LOG.hydrateDir();
    const r = await LOG.resolveConflict('browser');
    assert.ok(r.ok, r.error);
    assert.strictEqual(folderDay(dir), 2);
    assert.ok(r.backup && dir.files[r.backup], r.backup);
    assert.strictEqual(JSON.parse(dir.files[r.backup].text).save.clock.day, 12);
    assert.strictEqual(LOG.status().conflict, null);
  });

  await testAsync('resolveConflict(folder) leaves day 12 intact and backs up the browser save', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 2, coins: 10 }), { store: s, getSave: () => browserDay(2, 10) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    seedFolder(dir, 12, 999);
    const before = dir.files['pixel-farm-save.json'].text;
    LOG.installDir(dir, 'granted');
    await LOG.hydrateDir();
    const r = await LOG.resolveConflict('folder');
    assert.ok(r.ok);
    assert.strictEqual(dir.files['pixel-farm-save.json'].text, before, 'folder day 12 file must be untouched');
    assert.strictEqual(folderDay(dir), 12);
    assert.strictEqual(r.save && r.save.clock.day, 12);
    assert.ok(r.backup && dir.files[r.backup], r.backup);
    assert.strictEqual(JSON.parse(dir.files[r.backup].text).save.clock.day, 2);
    assert.strictEqual(LOG.status().conflict, null);
  });

  await testAsync('identical folder and browser saves do not pause, first sync may write', async () => {
    const s = mem();
    LOG.reset(s);
    const same = browserDay(12, 999);
    same.savedAt = 12000;
    same.clock = { day: 12, t: 800 };
    LOG.boot(snap({ day: 12, coins: 999 }), { store: s, getSave: () => same });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    seedFolder(dir, 12, 999); // wrapDay uses t=800, coins=999, createdAt=1_000_000 — matches
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.strictEqual(st.conflict, null, JSON.stringify(st.conflict));
    assert.strictEqual(folderDay(dir), 12);
  });

  console.log(n + ' passed');
})().catch(err => { console.error(err); process.exit(1); });
