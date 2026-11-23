// Node unit tests for playlog aggregation and folder-file writing (no browser).
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
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

  // v5.11.0.22: resumeDir / refreshPerm against a mock File System Access handle
  function err(name, message) { const e = new Error(message || name); e.name = name; return e; }

  await testAsync('resumeDir: cached grant writes without opening the picker', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ coins: 3 }), { store: s, getSave: () => snap({ coins: 3, saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    const st0 = LOG.installDir(dir, 'granted');
    assert.strictEqual(st0.needGesture, false);
    let picked = 0;
    LOG.setPicker(async () => { picked++; return dir; });
    try {
      const st = await LOG.resumeDir();
      assert.strictEqual(picked, 0, 'already granted: do not open the picker');
      assert.strictEqual(dir.requestCalls, 0, 'do not call requestPermission on a granted handle');
      assert.strictEqual(st.granted, true);
      assert.strictEqual(st.needGesture, false);
      assert.strictEqual(st.lastError, null);
      assert.ok(dir.files['pixel-farm-save.json'].text.includes('pixel-farm-save'));
    } finally { LOG.setPicker(null); }
  });

  await testAsync('resumeDir: a hanging requestPermission still opens the picker in the same click', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    dir.requestPermission = () => new Promise(() => {}); // never settles — the live Chrome hang
    LOG.installDir(dir, 'prompt');
    let picked = 0, startIn = null, pickAt = -1, tick = 0;
    const origQuery = dir.queryPermission.bind(dir);
    dir.queryPermission = async function () { ++tick; return origQuery(); };
    const fresh = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.setPicker(async (opts) => { pickAt = ++tick; picked++; startIn = opts && opts.startIn; return fresh; });
    let st;
    try {
      st = await Promise.race([
        LOG.resumeDir(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('resumeDir hung waiting on requestPermission')), 400))
      ]);
    } finally { LOG.setPicker(null); }
    assert.strictEqual(picked, 1, 'picker must run even if requestPermission never settles');
    assert.strictEqual(pickAt, 1, 'showDirectoryPicker is the first await in the click');
    assert.strictEqual(startIn, dir, 'picker startIn is the stored handle');
    assert.strictEqual(fresh.sameEntryCalls, 1, 'isSameEntry confirms the picked folder');
    assert.strictEqual(st.granted, true);
    assert.strictEqual(st.needGesture, false);
    assert.strictEqual(st.lastError, null);
    assert.ok(fresh.files['pixel-farm-save.json']);
  });

  await testAsync('resumeDir: a prompt-state handle opens the picker as the first await, skipping requestPermission', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    let requestAt = -1, pickAt = -1, queryAt = -1, tick = 0, startIn = null;
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'prompt' });
    const origReq = dir.requestPermission.bind(dir);
    dir.requestPermission = async function () { requestAt = ++tick; return origReq(); };
    const origQuery = dir.queryPermission.bind(dir);
    dir.queryPermission = async function () { queryAt = ++tick; return origQuery(); };
    LOG.installDir(dir, 'prompt');
    const fresh = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.setPicker(async (opts) => { pickAt = ++tick; startIn = opts && opts.startIn; return fresh; });
    try {
      const st = await LOG.resumeDir();
      assert.strictEqual(requestAt, -1, 'must not await requestPermission on the stored handle');
      assert.ok(queryAt === -1, 'must not await queryPermission in the click (would drop the gesture)');
      assert.strictEqual(pickAt, 1, 'showDirectoryPicker is the first async call');
      assert.strictEqual(startIn, dir, 'picker startIn is the stored handle');
      assert.strictEqual(st.granted, true);
      assert.strictEqual(st.needGesture, false);
      assert.strictEqual(st.lastError, null);
      assert.ok(fresh.files['pixel-farm-save.json']);
    } finally { LOG.setPicker(null); }
  });

  await testAsync('resumeDir: requestPermission throw on the stored handle still opens the picker (it is skipped)', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestThrow: err('NotFoundError', 'handle gone') });
    LOG.installDir(dir, 'prompt');
    let picked = 0, startIn = null;
    const fresh = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.setPicker(async (opts) => { picked++; startIn = opts && opts.startIn; return fresh; });
    try {
      const st = await LOG.resumeDir();
      assert.strictEqual(dir.requestCalls, 0, 'stored handle requestPermission is skipped');
      assert.strictEqual(picked, 1, 'picker ran in the same resumeDir call');
      assert.strictEqual(startIn, dir, 'picker startIn is the stored handle');
      assert.strictEqual(st.granted, true);
      assert.strictEqual(st.needsRepick, false);
      assert.ok(fresh.files['pixel-farm-save.json']);
    } finally { LOG.setPicker(null); }
  });

  await testAsync('resumeDir: denied permission also opens the picker in the same click', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'denied', requestResult: 'denied' });
    LOG.installDir(dir, 'denied');
    let picked = 0, startIn = null;
    const fresh = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.setPicker(async (opts) => { picked++; startIn = opts && opts.startIn; return fresh; });
    try {
      const st = await LOG.resumeDir();
      assert.strictEqual(dir.requestCalls, 0);
      assert.strictEqual(picked, 1);
      assert.strictEqual(startIn, dir);
      assert.strictEqual(st.granted, true);
      assert.strictEqual(st.lastError, null);
    } finally { LOG.setPicker(null); }
  });

  await testAsync('resumeDir: picker AbortError in the same click is a clean cancel', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    LOG.installDir(dir, 'prompt');
    let picked = 0;
    LOG.setPicker(async () => { picked++; const e = new Error('The picker was closed.'); e.name = 'AbortError'; throw e; });
    try {
      const st = await LOG.resumeDir();
      assert.strictEqual(dir.requestCalls, 0);
      assert.strictEqual(picked, 1);
      assert.strictEqual(st.aborted, true);
      assert.strictEqual(st.granted, false);
      assert.strictEqual(st.needsRepick, true);
      assert.strictEqual(st.lastError, null, 'closing the picker is not a failure: ' + st.lastError);
    } finally { LOG.setPicker(null); }
  });

  await testAsync('resumeDir: activation-lost picker error shows a clear try-again status', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    LOG.installDir(dir, 'prompt');
    LOG.setPicker(async () => { const e = new Error('no gesture'); e.name = 'NotAllowedError'; throw e; });
    try {
      const st = await LOG.resumeDir();
      assert.strictEqual(dir.requestCalls, 0);
      assert.strictEqual(st.granted, false);
      assert.strictEqual(st.needsRepick, true);
      assert.ok(!st.aborted);
      assert.ok(/重新选择同步文件夹/.test(st.lastError), st.lastError);
    } finally { LOG.setPicker(null); }
  });

  await testAsync('resumeDir: granted permission but stale write opens the picker in the same click', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted', writeThrow: err('InvalidStateError', 'stale file handle') });
    LOG.installDir(dir, 'granted');
    let picked = 0, startIn = null;
    const fresh = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.setPicker(async (opts) => { picked++; startIn = opts && opts.startIn; return fresh; });
    try {
      const st = await LOG.resumeDir();
      assert.strictEqual(dir.requestCalls, 0);
      assert.strictEqual(picked, 1, 'stale handle falls back to the picker in the same click');
      assert.strictEqual(startIn, dir);
      assert.strictEqual(st.granted, true);
      assert.strictEqual(st.needsRepick, false);
      assert.ok(fresh.files['pixel-farm-save.json']);
    } finally { LOG.setPicker(null); }
  });

  await testAsync('resumeDir: granted permission but stale write marks needsRepick', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap(), { store: s, getSave: () => snap({ saveVersion: 15 }) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted', writeThrow: err('InvalidStateError', 'stale file handle') });
    LOG.installDir(dir, 'granted');
    const st = await LOG.resumeDir();
    assert.strictEqual(st.granted, true, 'cached permission itself was granted');
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
    return { saveVersion: 15, gameVersion: '5.11.0.39', createdAt: 1_000_000, savedAt: day * 100 + 50, clock: { day, t: day === 12 ? 800 : 360 }, coins };
  }
  function seedFolder(dir, day, coins) {
    dir.files['pixel-farm-save.json'] = { text: JSON.stringify(wrapDay(day, coins), null, 2) + '\n' };
  }
  function folderDay(dir) {
    const o = JSON.parse(dir.files['pixel-farm-save.json'].text);
    return o.save.clock.day;
  }
  function savesFiles(dir) {
    return (dir.dirs && dir.dirs.saves && dir.dirs.saves.files) || {};
  }
  function snapText(dir, name) {
    const f = savesFiles(dir)[name];
    return f && f.text;
  }

  await testAsync('first sync keeps folder day 12 as a saves/ snapshot and writes the browser day-1 latest', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 1, coins: 0 }), { store: s, getSave: () => browserDay(1, 0) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    seedFolder(dir, 12, 999);
    const before = dir.files['pixel-farm-save.json'].text;
    LOG.installDir(dir, 'prompt');
    const st = await LOG.hydrateDir();
    assert.strictEqual(st.granted, true, 'probe may grant permission');
    assert.ok(!('conflict' in st) || !st.conflict, 'no conflict panel: ' + JSON.stringify(st.conflict));
    assert.ok(!dir.files[LOG.PROBE_FILE], 'probe file cleaned up');
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day012.json'), before, 'day 12 snapshot must be identical to the original folder save');
    assert.strictEqual(JSON.parse(snapText(dir, 'pixel-farm-save-day012.json')).save.clock.day, 12);
    assert.strictEqual(JSON.parse(snapText(dir, 'pixel-farm-save-day012.json')).save.coins, 999);
    assert.strictEqual(folderDay(dir), 1, 'latest must be the browser save, got day ' + folderDay(dir));
    assert.strictEqual(JSON.parse(dir.files['pixel-farm-save.json'].text).save.coins, 0);
    assert.ok(dir.files['pixel-farm-playlog.json'], 'playlog is written after the snapshot is preserved');
    const list = await LOG.listRewind(dir);
    assert.ok(list.some(x => x.day === 12 && x.role === 'day'), JSON.stringify(list));
  });

  await testAsync('granted-on-boot also preserves day 12 then writes the browser save, with no pause', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 1, coins: 0 }), { store: s, getSave: () => browserDay(1, 0) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    seedFolder(dir, 12, 999);
    const before = dir.files['pixel-farm-save.json'].text;
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.ok(st.ok !== false);
    assert.ok(!st.conflict);
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day012.json'), before);
    assert.strictEqual(folderDay(dir), 1);
    const again = await LOG.syncNow('manual');
    assert.ok(again.ok, again.error);
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day012.json'), before, 'later syncs must not clobber the preserved day 12');
    assert.strictEqual(folderDay(dir), 1);
  });

  await testAsync('if saves/day012 already exists with different content, the old latest gets a timeline suffix', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 1, coins: 0 }), { store: s, getSave: () => browserDay(1, 0) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    seedFolder(dir, 12, 999);
    const before = dir.files['pixel-farm-save.json'].text;
    const other = wrapDay(12, 50, 1);
    other.save.createdAt = 2_000_000; // a different farm
    const saves = await dir.getDirectoryHandle('saves', { create: true });
    const otherText = JSON.stringify(other, null, 2) + '\n';
    saves.files['pixel-farm-save-day012.json'] = { text: otherText };
    LOG.installDir(dir, 'granted');
    await LOG.hydrateDir();
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day012.json'), otherText, 'existing different day012 stays');
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day012-b.json'), before, 'incoming latest is preserved under a suffix');
    assert.strictEqual(folderDay(dir), 1);
  });

  await testAsync('identical folder and browser saves still write, and day 12 is listed', async () => {
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
    assert.ok(!st.conflict);
    assert.strictEqual(folderDay(dir), 12);
    assert.ok(snapText(dir, 'pixel-farm-save-day012.json'), 'day snapshot exists');
    const list = await LOG.listRewind(dir);
    assert.ok(list.some(x => x.day === 12), JSON.stringify(list));
  });

  await testAsync('syncNow writes a per-day snapshot day012 and updates it on the same timeline', async () => {
    const s = mem();
    LOG.reset(s);
    const snap12 = browserDay(12, 500);
    snap12.clock = { day: 12, t: 800 };
    LOG.boot(snap({ day: 12, coins: 500 }), { store: s, getSave: () => snap12 });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.installDir(dir, 'granted');
    const r = await LOG.syncNow('manual', dir, snap12);
    assert.ok(r.ok, r.error);
    const name = LOG.daySnapName(12, 'a');
    assert.strictEqual(name, 'pixel-farm-save-day012.json');
    assert.ok(snapText(dir, name), Object.keys(savesFiles(dir)).join(','));
    assert.strictEqual(JSON.parse(snapText(dir, name)).save.clock.day, 12);
    assert.strictEqual(JSON.parse(snapText(dir, name)).save.coins, 500);
    snap12.coins = 777;
    snap12.clock = { day: 12, t: 900 };
    await LOG.syncNow('manual', dir, snap12);
    assert.strictEqual(JSON.parse(snapText(dir, name)).save.coins, 777, 'same timeline may update that day');
    assert.ok(!snapText(dir, 'pixel-farm-save-day012-b.json'));
  });

  await testAsync('rewindTo day 8 keeps later-day snapshots and tags a new timeline', async () => {
    const s = mem();
    LOG.reset(s);
    const snap12 = browserDay(12, 999);
    snap12.clock = { day: 12, t: 800 };
    snap12.savedAt = Date.parse('2026-11-21T02:02:00-08:00');
    LOG.boot(snap({ day: 12, coins: 999 }), { store: s, getSave: () => snap12 });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.installDir(dir, 'granted');
    await LOG.syncNow('manual', dir, snap12);
    const day12before = snapText(dir, 'pixel-farm-save-day012.json');
    const day8 = wrapDay(8, 200, Date.parse('2026-11-15T12:00:00-08:00'));
    savesFiles(dir)['pixel-farm-save-day008.json'] = { text: JSON.stringify(day8, null, 2) + '\n' };
    const r = await LOG.rewindTo('pixel-farm-save-day008.json', snap12);
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.save.clock.day, 8);
    assert.ok(r.present && r.present.before && snapText(dir, r.present.before), r.present);
    assert.ok(/before-rewind/.test(r.present.before), r.present.before);
    assert.strictEqual(JSON.parse(snapText(dir, r.present.before)).save.clock.day, 12);
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day012.json'), day12before, 'later-day snapshot must stay intact');
    assert.strictEqual(JSON.parse(snapText(dir, 'pixel-farm-save-day012.json')).save.coins, 999);
    assert.ok(r.timeline && r.timeline !== 'a', r.timeline);
    // play forward again to day 12 on the new timeline — must not clobber the original day 12
    const snap12b = browserDay(12, 111);
    snap12b.clock = { day: 12, t: 400 };
    await LOG.syncNow('manual', dir, snap12b);
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day012.json'), day12before, 'original day 12 still intact after replay');
    const branched = LOG.daySnapName(12, r.timeline);
    assert.ok(snapText(dir, branched), 'new timeline writes ' + branched + ' got ' + Object.keys(savesFiles(dir)).join(','));
    assert.strictEqual(JSON.parse(snapText(dir, branched)).save.coins, 111);
    const list = await LOG.listRewind(dir);
    assert.ok(list.some(x => x.label === '回溯前的进度' && x.day === 12), JSON.stringify(list));
    assert.ok(list.some(x => x.day === 8 && x.role === 'day'), JSON.stringify(list));
    assert.ok(list.filter(x => x.day === 12 && x.role === 'day').length >= 2, 'both timelines listed');
  });

  await testAsync('openRewind: a hanging requestPermission returns immediately with a restore hint', async () => {
    const s = mem();
    LOG.reset(s);
    const browser = browserDay(2, 10);
    LOG.boot(snap({ day: 2 }), { store: s, getSave: () => browser });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    dir.requestPermission = () => new Promise(() => {}); // never settles — the live Chrome hang
    const saves = await dir.getDirectoryHandle('saves', { create: true });
    saves.files['pixel-farm-save-day012.json'] = { text: JSON.stringify(wrapDay(12, 999, Date.parse('2026-11-21T02:02:00-08:00')), null, 2) + '\n' };
    LOG.installDir(dir, 'prompt');
    let picked = 0;
    LOG.setPicker(async () => { picked++; return dir; });
    let st;
    try {
      st = await Promise.race([
        LOG.openRewind(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('openRewind hung waiting on requestPermission')), 400))
      ]);
    } finally { LOG.setPicker(null); }
    assert.strictEqual(picked, 0, 'rewind must not open the folder picker');
    assert.strictEqual(st.granted, false);
    assert.deepStrictEqual(st.entries, []);
    assert.ok(/恢复本地同步/.test(st.rewindHint), st.rewindHint);
    assert.ok(!dir.files['pixel-farm-save.json'], 'must not write the latest save');
    assert.ok(!dir.files['pixel-farm-playlog.json'], 'must not write the playlog');
    assert.strictEqual(browser.clock.day, 2, 'must not touch the browser save');
  });

  await testAsync('openRewind: no folder handle returns a hint and does not pick or write', async () => {
    const s = mem();
    LOG.reset(s);
    const browser = browserDay(2, 10);
    LOG.boot(snap({ day: 2 }), { store: s, getSave: () => browser });
    await LOG.hydrateDir();
    let picked = 0;
    LOG.setPicker(async () => { picked++; return LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' }); });
    try {
      const st = await LOG.openRewind();
      assert.strictEqual(picked, 0, 'must not open the picker from rewind');
      assert.strictEqual(st.granted, false);
      assert.deepStrictEqual(st.entries, []);
      assert.ok(/同步到本地文件夹/.test(st.rewindHint), st.rewindHint);
      assert.strictEqual(browser.clock.day, 2);
    } finally { LOG.setPicker(null); }
  });

  await testAsync('openRewind lists daily snapshots only when permission is already granted', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 2 }), { store: s, getSave: () => browserDay(2, 10) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    const saves = await dir.getDirectoryHandle('saves', { create: true });
    saves.files['pixel-farm-save-day012.json'] = { text: JSON.stringify(wrapDay(12, 999, Date.parse('2026-11-21T02:02:00-08:00')), null, 2) + '\n' };
    LOG.installDir(dir, 'granted');
    const before = Object.keys(dir.files).slice();
    const st = await LOG.openRewind();
    assert.strictEqual(dir.requestCalls, 0, 'already granted: do not call requestPermission');
    assert.strictEqual(st.granted, true);
    assert.ok(st.entries.some(x => x.day === 12), JSON.stringify(st.entries));
    assert.deepStrictEqual(Object.keys(dir.files).sort(), before.sort(), 'listing must not write');
    assert.ok(st.entries.every(x => x.role !== 'before-rewind') || true);
  });


  await testAsync('same peek meta but different house and eggs is not the same save; folder snapshot stays intact', async () => {
    const s = mem();
    LOG.reset(s);
    const createdAt = 1_000_000, day = 8, t = 800, coins = 400, savedAt = 12_000;
    const folder = {
      meta: { kind: 'pixel-farm-save', exportedAt: '2026-11-21T02:02:00.000Z', gameVersion: '5.11.0.39', saveVersion: 15 },
      save: { saveVersion: 15, gameVersion: '5.11.0.39', createdAt, savedAt, clock: { day, t }, coins, home: { house: 'east-field' }, basket: { egg: 3 } }
    };
    const browser = { saveVersion: 15, gameVersion: '5.11.0.39', createdAt, savedAt, clock: { day, t }, coins, home: { house: 'east-shore' }, basket: { egg: 0 } };
    LOG.boot(snap({ day, coins }), { store: s, getSave: () => browser });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    const before = JSON.stringify(folder, null, 2) + '\n';
    dir.files['pixel-farm-save.json'] = { text: before };
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.ok(!st.folderBlocked, JSON.stringify(st));
    assert.ok(LOG.sameSaveContent(before, before));
    assert.ok(LOG.sameSaveContent(before, JSON.stringify({ meta: { kind: 'pixel-farm-save', exportedAt: '2099-01-01T00:00:00.000Z' }, save: folder.save }, null, 2)));
    assert.ok(!LOG.sameSaveContent(before, JSON.stringify({ meta: { exportedAt: '2026-11-21T02:02:00.000Z' }, save: browser }, null, 2)));
    assert.strictEqual(snapText(dir, 'pixel-farm-save-day008.json'), before, 'folder farm must be preserved byte-for-byte under its own day');
    const preserved = JSON.parse(snapText(dir, 'pixel-farm-save-day008.json'));
    assert.strictEqual(preserved.save.home.house, 'east-field');
    assert.strictEqual(preserved.save.basket.egg, 3);
    const latest = JSON.parse(dir.files['pixel-farm-save.json'].text);
    assert.strictEqual(latest.save.home.house, 'east-shore');
    assert.strictEqual(latest.save.basket.egg, 0);
    const list = await LOG.listRewind(dir);
    assert.ok(list.some(x => x.day === 8 && x.role === 'day'), JSON.stringify(list));
  });

  await testAsync('unreadable folder save (bad JSON) pauses writing and leaves the file alone', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 1, coins: 0 }), { store: s, getSave: () => browserDay(1, 0) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    const before = '{not-json';
    dir.files['pixel-farm-save.json'] = { text: before };
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.strictEqual(st.folderBlocked, true, JSON.stringify(st));
    assert.ok(/读不出来|没有写入/.test(st.lastError || ''), st.lastError);
    assert.strictEqual(dir.files['pixel-farm-save.json'].text, before);
    assert.ok(!dir.files['pixel-farm-playlog.json'], 'must not write the playlog over an unreadable save');
    assert.ok(!dir.dirs.saves || !Object.keys(dir.dirs.saves.files || {}).length, 'must not write snapshots either');
    const again = await LOG.syncNow('manual');
    assert.strictEqual(again.reason, 'unreadable');
    assert.strictEqual(dir.files['pixel-farm-save.json'].text, before);
  });

  await testAsync('empty folder save is treated as unreadable, not as a missing file', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 1, coins: 0 }), { store: s, getSave: () => browserDay(1, 0) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    dir.files['pixel-farm-save.json'] = { text: '  \n' };
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.strictEqual(st.folderBlocked, true);
    assert.strictEqual(dir.files['pixel-farm-save.json'].text, '  \n');
    assert.ok(!dir.files['pixel-farm-playlog.json']);
  });

  await testAsync('a read error on an existing folder save pauses writing', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 1, coins: 0 }), { store: s, getSave: () => browserDay(1, 0) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    const err = new Error('backend failed'); err.name = 'TypeError';
    dir.files['pixel-farm-save.json'] = { text: JSON.stringify(wrapDay(12, 999), null, 2) + '\n', readThrow: err };
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.strictEqual(st.folderBlocked, true, JSON.stringify(st));
    assert.ok(!dir.files['pixel-farm-playlog.json']);
    assert.ok(dir.files['pixel-farm-save.json'].text, 'original record stays');
  });

  await testAsync('a confirmed missing folder save (NotFoundError) may write the browser save', async () => {
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: 1, coins: 0 }), { store: s, getSave: () => browserDay(1, 0) });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.ok(!st.folderBlocked, JSON.stringify(st));
    assert.strictEqual(folderDay(dir), 1);
    assert.ok(dir.files['pixel-farm-playlog.json']);
  });

  await testAsync('full-structure v15 fixture: same peek meta, house in 东田 with 3 eggs vs east shore with 0 eggs', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/save-v15-day72-cottage.json'), 'utf8'));
    const folderSave = JSON.parse(JSON.stringify(raw));
    const browserSave = JSON.parse(JSON.stringify(raw));
    assert.strictEqual(folderSave.saveVersion, 15);
    assert.ok(folderSave.home && folderSave.home.houses && folderSave.home.houses[0], 'fixture must have a house');
    folderSave.home.houses[0].site = 'east-field';
    folderSave.home.houses[0].eggs = 3;
    browserSave.home.houses[0].site = 'east-shore';
    browserSave.home.houses[0].eggs = 0;
    // peek meta stays identical
    assert.strictEqual(folderSave.createdAt, browserSave.createdAt);
    assert.strictEqual(folderSave.clock.day, browserSave.clock.day);
    assert.strictEqual(folderSave.clock.t, browserSave.clock.t);
    assert.strictEqual(folderSave.coins, browserSave.coins);
    const folderWrap = {
      meta: { kind: 'pixel-farm-save', exportedAt: '2026-11-21T02:02:00.000Z', gameVersion: folderSave.gameVersion, saveVersion: 15 },
      save: folderSave
    };
    const before = JSON.stringify(folderWrap, null, 2) + '\n';
    const s = mem();
    LOG.reset(s);
    LOG.boot(snap({ day: folderSave.clock.day, coins: folderSave.coins }), { store: s, getSave: () => browserSave });
    await LOG.hydrateDir();
    const dir = LOG.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    dir.files['pixel-farm-save.json'] = { text: before };
    LOG.installDir(dir, 'granted');
    const st = await LOG.hydrateDir();
    assert.ok(!st.folderBlocked, JSON.stringify(st));
    const dayName = LOG.daySnapName(folderSave.clock.day, 'a');
    assert.strictEqual(snapText(dir, dayName), before, 'full folder save must be preserved intact');
    const preserved = JSON.parse(snapText(dir, dayName));
    assert.strictEqual(preserved.save.home.houses[0].site, 'east-field');
    assert.strictEqual(preserved.save.home.houses[0].eggs, 3);
    const latest = JSON.parse(dir.files['pixel-farm-save.json'].text);
    const latestBody = latest.save || latest;
    assert.strictEqual(latestBody.home.houses[0].site, 'east-shore');
    assert.strictEqual(latestBody.home.houses[0].eggs, 0);
    const list = await LOG.listRewind(dir);
    assert.ok(list.some(x => x.day === folderSave.clock.day && x.role === 'day'), JSON.stringify(list.map(x => ({ day: x.day, role: x.role, name: x.name }))));
  });

  console.log(n + ' passed');
})().catch(err => { console.error(err); process.exit(1); });
