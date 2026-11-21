// 像素农场 · 游玩记录和本机文件夹同步（纯逻辑；浏览器里是 window.PFPlaylog，Node 里可以 require 做单元测试）
// Lives under its own localStorage key, never inside the save, so saveVersion does not change.
// Chrome can write two pretty JSON files into a user-picked folder (File System Access API).
'use strict';
(function (root) {
  const PREFIX = 'mouzhi/pixel-farm:';
  const KEY = PREFIX + 'playlog';
  const SCHEMA = 1;
  const MAX_DAYS = 365, MAX_EVENTS = 2000, MAX_SESSIONS = 60;
  const SYNC_MIN_MS = 60000;
  const IDB_NAME = 'mouzhi-pixel-farm', IDB_STORE = 'fs', IDB_KEY = 'dir';
  const SAVE_FILE = 'pixel-farm-save.json', LOG_FILE = 'pixel-farm-playlog.json';
  const INCOME = ['crops', 'fruit', 'animals', 'fish', 'wood', 'yard', 'offline'];

  let storage = null, data = emptyData(), cur = null, session = null;
  let dirHandle = null, perm = 'prompt', lastWrite = 0, lastError = null, syncTimer = null, syncQueued = null;
  let needsRepick = false, pickFn = null; // v5.11.0.20: a stale handle needs a fresh folder pick, not another silent requestPermission
  let fps = { sum: 0, n: 0, min: Infinity }, getSave = null;

  function emptyIncome() { const o = {}; for (const k of INCOME) o[k] = 0; return o; }
  function emptyIdle() { return { fish: 0, rest: 0, patrol: 0, other: 0 }; }
  function emptyData() { return { schema: SCHEMA, startedAt: null, lastSyncAt: null, syncDirName: null, sessions: [], days: [], events: [] }; }
  function emptyDay(snap) {
    return {
      day: snap.day, farm: snap.createdAt || null, realAt: snap.now || Date.now(),
      goldStart: snap.coins || 0, goldEnd: snap.coins || 0, open: true,
      income: emptyIncome(), spend: {}, purchases: [],
      tiles: snap.tiles || 0, regions: snap.regions || 0, animals: snap.animals || 0,
      busyMin: 0, idleMin: 0, sleepMin: 0, idle: emptyIdle(),
      fps: null, offline: [], // v5.10.2: no `speed` (one game speed); old logs may still carry it
      family: {} // v5.0: busy game minutes per family member (partner / kid0 / kid1), and the gold they brought in from the market
    };
  }
  function r1(n) { return Math.round((n || 0) * 10) / 10; }
  function nowOf(snap) { return (snap && snap.now) || Date.now(); }
  function realMin(snap) {
    const t0 = snap && snap.createdAt; if (!t0) return 0;
    return r1((nowOf(snap) - t0) / 60000);
  }

  function normalize(raw) {
    const d = emptyData();
    if (!raw || typeof raw !== 'object') return d;
    d.schema = SCHEMA;
    d.startedAt = raw.startedAt || null;
    d.lastSyncAt = raw.lastSyncAt || null;
    d.syncDirName = raw.syncDirName || null;
    d.sessions = Array.isArray(raw.sessions) ? raw.sessions.slice(-MAX_SESSIONS) : [];
    d.days = Array.isArray(raw.days) ? raw.days.map(normalizeDay).filter(Boolean).slice(-MAX_DAYS) : [];
    d.events = Array.isArray(raw.events) ? raw.events.slice(-MAX_EVENTS) : [];
    return d;
  }
  function normalizeDay(x) {
    if (!x || typeof x !== 'object') return null;
    const d = emptyDay({ day: x.day || 1, createdAt: x.farm, now: x.realAt, coins: x.goldStart, tiles: x.tiles, regions: x.regions, animals: x.animals });
    d.goldEnd = x.goldEnd != null ? x.goldEnd : d.goldStart;
    d.open = !!x.open;
    d.income = emptyIncome();
    for (const k of INCOME) d.income[k] = (x.income && +x.income[k]) || 0;
    d.spend = (x.spend && typeof x.spend === 'object') ? Object.assign({}, x.spend) : {};
    d.purchases = Array.isArray(x.purchases) ? x.purchases.slice() : [];
    d.busyMin = +x.busyMin || 0; d.idleMin = +x.idleMin || 0; d.sleepMin = +x.sleepMin || 0;
    d.idle = emptyIdle();
    if (x.idle && typeof x.idle === 'object') for (const k of Object.keys(d.idle)) d.idle[k] = +x.idle[k] || 0;
    d.fps = x.fps || null;
    d.offline = Array.isArray(x.offline) ? x.offline.slice() : [];
    d.realAt = x.realAt || d.realAt;
    if (x.family && typeof x.family === 'object') for (const k of Object.keys(x.family)) { const f = x.family[k] || {}; d.family[k] = { busyMin: +f.busyMin || 0, gold: +f.gold || 0 }; }
    return d;
  }
  function cap() {
    if (data.days.length > MAX_DAYS) data.days = data.days.slice(-MAX_DAYS);
    if (data.events.length > MAX_EVENTS) data.events = data.events.slice(-MAX_EVENTS);
    if (data.sessions.length > MAX_SESSIONS) data.sessions = data.sessions.slice(-MAX_SESSIONS);
  }

  function load(store) {
    storage = store || (typeof localStorage !== 'undefined' ? localStorage : storage);
    data = emptyData(); cur = null; session = null;
    if (!storage) return data;
    try {
      const raw = storage.getItem(KEY);
      if (raw) data = normalize(JSON.parse(raw));
    } catch (e) { data = emptyData(); }
    cur = data.days.length && data.days[data.days.length - 1].open ? data.days[data.days.length - 1] : null;
    return data;
  }
  function flush() {
    if (!storage) return false;
    try { cap(); storage.setItem(KEY, JSON.stringify(data)); return true; }
    catch (e) { lastError = String(e && e.message || e); return false; }
  }

  function boot(snap, opts) {
    load(opts && opts.store);
    if (!data.startedAt) data.startedAt = nowOf(snap);
    startSession(snap);
    openDay(snap);
    event({ type: 'session-start', day: snap.day, t: snap.t, coins: snap.coins, farm: snap.createdAt, gameVersion: snap.gameVersion });
    flush();
    if (opts && opts.getSave) getSave = opts.getSave;
    else if (!getSave && typeof window !== 'undefined' && window.__farm && window.__farm.snapshot) getSave = () => window.__farm.snapshot();
    hydrateDir();
    return data;
  }
  function startSession(snap) {
    session = { startedAt: nowOf(snap), endedAt: null, dayStart: snap.day, dayEnd: snap.day, coinsStart: snap.coins || 0, coinsEnd: snap.coins || 0, gameVersion: snap.gameVersion || null, farm: snap.createdAt || null };
    data.sessions.push(session);
    cap();
  }
  function endSession(snap) {
    if (!session) return;
    if (snap) { session.endedAt = nowOf(snap); session.dayEnd = snap.day; session.coinsEnd = snap.coins; }
    else session.endedAt = Date.now();
    event({ type: 'session-end', day: session.dayEnd, coins: session.coinsEnd, farm: session.farm, startedAt: session.startedAt, endedAt: session.endedAt });
    session = null;
    flush();
  }

  function openDay(snap) {
    if (cur && cur.open && cur.day === snap.day && (cur.farm == null || snap.createdAt == null || cur.farm === snap.createdAt)) {
      stamp(cur, snap); return cur;
    }
    if (cur && cur.open) closeDay(snap);
    cur = emptyDay(snap);
    data.days.push(cur); cap();
    return cur;
  }
  function closeDay(snap) {
    if (!cur || !cur.open) return cur;
    stamp(cur, snap);
    if (snap && snap.coins != null) cur.goldEnd = snap.coins;
    applyFps(cur);
    cur.busyMin = r1(cur.busyMin); cur.idleMin = r1(cur.idleMin); cur.sleepMin = r1(cur.sleepMin);
    for (const k of Object.keys(cur.idle)) cur.idle[k] = r1(cur.idle[k]);
    for (const k of INCOME) cur.income[k] = r1(cur.income[k]);
    cur.open = false;
    const done = cur;
    cur = null;
    flush();
    return done;
  }
  function stamp(d, snap) {
    if (!snap) return;
    if (snap.tiles != null) d.tiles = snap.tiles;
    if (snap.regions != null) d.regions = snap.regions;
    if (snap.animals != null) d.animals = snap.animals;
    if (snap.coins != null) d.goldEnd = snap.coins;
  }
  function applyFps(d) {
    if (!fps.n) return;
    d.fps = { avg: Math.round((fps.sum / fps.n) * 10) / 10, min: Math.round(fps.min * 10) / 10, n: fps.n };
  }
  function current() { return cur; }

  function income(source, gold) {
    if (!cur) return;
    const k = INCOME.indexOf(source) >= 0 ? source : 'crops';
    const g = +gold || 0; if (!g) return;
    cur.income[k] = (cur.income[k] || 0) + g;
    cur.goldEnd = (cur.goldEnd || 0) + g;
  }
  function spend(item, gold) {
    if (!cur) return;
    const g = +gold || 0; if (!g) return;
    const k = String(item || 'other');
    cur.spend[k] = (cur.spend[k] || 0) + g;
    cur.goldEnd = (cur.goldEnd || 0) - g;
  }
  function purchase(p) {
    if (!p) return;
    const rec = {
      id: p.id, name: p.name || p.id, label: p.label || p.name || p.id, cost: p.cost || 0,
      day: p.day, t: p.t, realMin: p.realMin != null ? p.realMin : realMin(p), at: nowOf(p)
    };
    if (cur) { cur.purchases.push(rec); spend(p.id, p.cost); }
    event(Object.assign({ type: p.region ? 'unlock' : 'purchase' }, rec, { farm: p.createdAt, region: !!p.region }));
  }

  function event(e) {
    if (!e || !e.type) return;
    const ev = Object.assign({ at: Date.now() }, e);
    data.events.push(ev); cap();
    return ev;
  }

  function classify(kind, label) {
    if (kind === 'sleep') return { bucket: 'sleep' };
    if (kind === 'fish') return { bucket: 'idle', idle: 'fish' };
    if (kind === 'idle') {
      if (label && String(label).indexOf('巡视') >= 0) return { bucket: 'idle', idle: 'patrol' };
      return { bucket: 'idle', idle: 'rest' };
    }
    if (!kind) return { bucket: 'idle', idle: 'other' };
    return { bucket: 'busy' };
  }
  function tick(dm, kind, label) {
    if (!cur || !(dm > 0)) return;
    const c = classify(kind, label);
    if (c.bucket === 'sleep') cur.sleepMin += dm;
    else if (c.bucket === 'idle') { cur.idleMin += dm; cur.idle[c.idle] = (cur.idle[c.idle] || 0) + dm; }
    else cur.busyMin += dm;
  }
  function work(who, dm, gold) { // v5.0: a family member's work (dm busy game minutes, or gold from a sale)
    if (!cur || !who) return; const fam = cur.family || (cur.family = {}), f = fam[who] || (fam[who] = { busyMin: 0, gold: 0 });
    if (dm > 0) f.busyMin += dm; if (gold > 0) f.gold += gold;
  }
  function sampleFps(fpsVal) {
    const v = +fpsVal; if (!(v > 0) || v > 1000) return;
    fps.sum += v; fps.n++; if (v < fps.min) fps.min = v;
    if (cur && fps.n % 60 === 0) applyFps(cur);
  }
  function offline(r, snap) {
    if (!r) return;
    const rec = { gold: r.gold || 0, days: r.days || 0, awaySec: r.awaySec || 0, capped: !!r.capped, avg: r.avg || 0, at: nowOf(snap) };
    if (cur) { cur.offline.push(rec); if (rec.gold) income('offline', rec.gold); }
    event(Object.assign({ type: 'offline', day: snap && snap.day, t: snap && snap.t, farm: snap && snap.createdAt }, rec));
  }

  function get() { return data; }
  function exportObject(gameVersion) {
    if (cur) applyFps(cur);
    cap();
    return {
      meta: { kind: 'pixel-farm-playlog', schema: SCHEMA, exportedAt: new Date().toISOString(), gameVersion: gameVersion || null, farmCreatedAt: data.days.length ? data.days[data.days.length - 1].farm : null },
      startedAt: data.startedAt, lastSyncAt: data.lastSyncAt, syncDirName: data.syncDirName,
      sessions: data.sessions, days: data.days, events: data.events
    };
  }
  function wrapSave(snap) {
    return {
      meta: { kind: 'pixel-farm-save', exportedAt: new Date().toISOString(), gameVersion: snap && snap.gameVersion || null, saveVersion: snap && snap.saveVersion || null },
      save: snap && root.PFSave && root.PFSave.compact ? root.PFSave.compact(snap) : snap // v5.11.0.8: the same compact form as the game's own save
    };
  }

  // ---- folder sync (Chrome File System Access API); writeToDir is also used with OPFS or a mock handle in tests ----
  function errText(e) {
    if (e == null) return 'error';
    if (typeof e === 'string') return e;
    const name = e.name || '', msg = e.message || String(e);
    return name && msg && String(msg).indexOf(name) !== 0 ? name + ': ' + msg : (msg || name || String(e));
  }
  function logErr(e) { lastError = errText(e); try { console.warn('[pixel-farm sync]', lastError, e); } catch (x) {} }
  function isStaleMsg(s) { return /NotFoundError|InvalidStateError/.test(String(s || '')); }
  function isStaleErr(e) { return isStaleMsg((e && e.name) || '') || isStaleMsg(errText(e)); }
  function setPicker(fn) { pickFn = fn; }
  function getPicker() { return pickFn || (typeof showDirectoryPicker === 'function' ? showDirectoryPicker : null); }
  function supported() { return typeof getPicker() === 'function'; }
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet() {
    try {
      const db = await idbOpen();
      return await new Promise((resolve, reject) => {
        const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
        r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
      });
    } catch (e) { return null; }
  }
  async function idbPut(handle) {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const r = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(handle, IDB_KEY);
      r.onsuccess = () => resolve(); r.onerror = () => reject(r.error);
    });
  }
  async function idbDel() {
    try {
      const db = await idbOpen();
      await new Promise((resolve, reject) => {
        const r = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(IDB_KEY);
        r.onsuccess = () => resolve(); r.onerror = () => reject(r.error);
      });
    } catch (e) {}
  }

  async function writeToDir(handle, files) {
    if (!handle || !handle.getFileHandle) throw new Error('no directory handle');
    for (const [name, obj] of Object.entries(files)) {
      const fh = await handle.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(obj, null, 2) + '\n');
      await w.close();
    }
  }
  async function readFromDir(handle, name) {
    const fh = await handle.getFileHandle(name);
    const f = await fh.getFile();
    return f.text();
  }

  async function queryPerm(h) {
    if (!h || typeof h.queryPermission !== 'function') return 'prompt';
    return await h.queryPermission({ mode: 'readwrite' });
  }
  async function requestPerm(h) {
    if (!h || typeof h.requestPermission !== 'function') return 'prompt';
    return await h.requestPermission({ mode: 'readwrite' });
  }
  // If queryPermission says 'prompt' but Chrome already granted the folder (the site-settings
  // bubble still lists it), a write often just works. Recover quietly; only keep the reauth
  // warning for a real NotAllowedError, and mark a broken handle so the next click re-picks.
  async function probeWrite() {
    if (!dirHandle) return;
    const r = await syncNow('boot-probe', dirHandle);
    if (r.ok) { perm = 'granted'; needsRepick = false; lastError = null; }
    else if (isStaleMsg(r.error)) needsRepick = true;
    else lastError = null;
  }
  async function hydrateDir() {
    if (!dirHandle) { const h = await idbGet(); if (!dirHandle) dirHandle = h; }
    if (!dirHandle) { perm = 'prompt'; needsRepick = false; return status(); }
    try { perm = await queryPerm(dirHandle); }
    catch (e) { logErr(e); perm = 'prompt'; needsRepick = true; }
    if (perm === 'granted') { needsRepick = false; syncSoon('boot'); }
    else await probeWrite();
    return status();
  }
  // Re-read the handle's permission (no gesture needed). Used on window focus so a grant that
  // landed in Chrome's site settings actually clears the "需要重新授权" warning.
  async function refreshPerm() {
    if (!dirHandle) { const h = await idbGet(); if (!dirHandle) dirHandle = h; }
    if (!dirHandle) { perm = 'prompt'; return status(); }
    try {
      const next = await queryPerm(dirHandle);
      if (next === 'granted') {
        const was = perm;
        perm = 'granted'; needsRepick = false;
        if (was !== 'granted') syncSoon('refresh');
      } else perm = next || 'prompt';
    } catch (e) { logErr(e); perm = 'prompt'; needsRepick = true; }
    return status();
  }
  async function pickDir() {
    const fn = getPicker();
    if (typeof fn !== 'function') throw new Error('unsupported');
    const h = await fn({ id: 'pixel-farm-sync', mode: 'readwrite', startIn: 'documents' });
    dirHandle = h; perm = 'granted';
    try { perm = await h.requestPermission({ mode: 'readwrite' }); } catch (e) { logErr(e); }
    try { await idbPut(h); } catch (e) { /* node / test handles may have no IndexedDB */ }
    data.syncDirName = h.name || null; flush();
    needsRepick = false;
    if (perm === 'granted') await syncNow('pick');
    return status();
  }
  // v5.11.0.20: requestPermission / showDirectoryPicker must be the first await inside the
  // click. Reading IndexedDB first drops Chrome's transient user activation, and the
  // permission call then fails silently — the button looks like it does nothing. If the
  // stored handle is stale or requestPermission does not grant, the next click opens the
  // folder picker so the player can re-choose.
  async function resumeDir() {
    if (needsRepick || !dirHandle) {
      try { return await pickDir(); }
      catch (e) {
        if (e && e.name === 'AbortError') return Object.assign(status(), { aborted: true });
        logErr(e);
        return status();
      }
    }
    try { perm = await requestPerm(dirHandle); }
    catch (e) {
      logErr(e);
      perm = 'prompt';
      needsRepick = true;
      return status();
    }
    if (perm === 'granted') {
      const w = await syncNow('resume');
      if (w.ok) { needsRepick = false; lastError = null; }
      else if (isStaleMsg(w.error)) needsRepick = true;
      return status();
    }
    needsRepick = true;
    // 'prompt' / 'denied' after the click: the next click re-picks. Don't paint a raw
    // "permission: prompt" over the panel (that's just "the prompt was dismissed or dropped").
    try { console.warn('[pixel-farm sync]', 'requestPermission →', perm); } catch (x) {}
    return status();
  }
  async function forgetDir() {
    dirHandle = null; perm = 'prompt'; needsRepick = false; lastError = null;
    data.syncDirName = null; flush();
    await idbDel();
    return status();
  }
  // Test hook: drop a mock (or real) directory handle into memory without IndexedDB.
  function installDir(handle, permission) {
    dirHandle = handle || null;
    perm = permission || 'prompt';
    needsRepick = false;
    lastError = null;
    if (handle && handle.name) data.syncDirName = handle.name;
    return status();
  }

  function filesForSync(snap) {
    const s = snap || (getSave && getSave());
    const files = {};
    files[LOG_FILE] = exportObject(s && s.gameVersion);
    if (s) files[SAVE_FILE] = wrapSave(s);
    return files;
  }
  async function syncNow(reason, handle, snap) {
    const h = handle || dirHandle;
    if (!h) return { ok: false, reason: 'no-handle' };
    if (handle !== h && perm !== 'granted' && !handle) return { ok: false, reason: 'no-permission' };
    try {
      const files = filesForSync(snap);
      await writeToDir(h, files);
      lastWrite = Date.now(); lastError = null;
      data.lastSyncAt = lastWrite; flush();
      return { ok: true, reason: reason || 'sync', at: lastWrite };
    } catch (e) {
      logErr(e);
      return { ok: false, reason: 'error', error: lastError };
    }
  }
  function syncSoon(reason) {
    if (!dirHandle || perm !== 'granted') return;
    const wait = Math.max(0, SYNC_MIN_MS - (Date.now() - lastWrite));
    if (wait === 0) { syncNow(reason); return; }
    syncQueued = reason;
    if (!syncTimer) syncTimer = setTimeout(() => { syncTimer = null; const r = syncQueued; syncQueued = null; if (r) syncNow(r); }, wait);
  }
  function syncMorning(snap) {
    if (snap) openDay(snap);
    flush();
    return syncNow('morning');
  }

  function status() {
    return {
      supported: supported(),
      hasHandle: !!dirHandle,
      granted: perm === 'granted',
      needGesture: (!!dirHandle && perm !== 'granted') || !!needsRepick,
      needsRepick: !!needsRepick,
      lastSyncAt: data.lastSyncAt || null,
      lastError: lastError,
      dirName: (dirHandle && dirHandle.name) || data.syncDirName || null
    };
  }

  function download(filename, text) {
    if (typeof document === 'undefined') return false;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename || LOG_FILE;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return true;
  }
  function downloadLog(gameVersion) {
    return download(LOG_FILE, JSON.stringify(exportObject(gameVersion), null, 2) + '\n');
  }

  function reset(store) {
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    data = emptyData(); cur = null; session = null; dirHandle = null; perm = 'prompt'; needsRepick = false;
    lastWrite = 0; lastError = null; fps = { sum: 0, n: 0, min: Infinity };
    if (store || storage) load(store || storage);
    return data;
  }

  function memoryDir(opts) {
    const files = {};
    const dir = {
      name: (opts && opts.name) || 'memory', files,
      permission: (opts && opts.permission) || 'granted',
      queryCalls: 0, requestCalls: 0,
      async queryPermission() {
        dir.queryCalls++;
        if (opts && opts.queryThrow) throw opts.queryThrow;
        return dir.permission;
      },
      async requestPermission() {
        dir.requestCalls++;
        if (opts && opts.requestThrow) throw opts.requestThrow;
        if (opts && opts.requestResult != null) dir.permission = opts.requestResult;
        return dir.permission;
      },
      async getFileHandle(name, o) {
        if (opts && opts.writeThrow) throw opts.writeThrow;
        if (!files[name] && !(o && o.create)) throw new Error('not found: ' + name);
        if (!files[name]) files[name] = { text: '' };
        const rec = files[name];
        return {
          async createWritable() {
            let buf = '';
            return { async write(s) { buf += typeof s === 'string' ? s : (s && s.byteLength != null ? new TextDecoder().decode(s) : String(s)); }, async close() { rec.text = buf; } };
          },
          async getFile() { return { async text() { return rec.text; }, text: async () => rec.text }; }
        };
      }
    };
    return dir;
  }

  const api = {
    KEY, SCHEMA, MAX_DAYS, MAX_EVENTS, SAVE_FILE, LOG_FILE, SYNC_MIN_MS,
    load, flush, boot, reset, get, current, exportObject, wrapSave,
    openDay, closeDay, startSession, endSession,
    income, spend, purchase, event, tick, work, sampleFps, offline, classify,
    supported, status, pickDir, resumeDir, forgetDir, hydrateDir, refreshPerm, installDir, setPicker,
    writeToDir, readFromDir, syncNow, syncSoon, syncMorning, filesForSync,
    download, downloadLog, memoryDir
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PFPlaylog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
