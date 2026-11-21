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
  const SAVE_FILE = 'pixel-farm-save.json', LOG_FILE = 'pixel-farm-playlog.json', PROBE_FILE = 'pixel-farm-sync-probe';
  const SNAP_DIR = 'saves'; // daily snapshots live here, never mixed with the live latest files
  const INCOME = ['crops', 'fruit', 'animals', 'fish', 'wood', 'yard', 'offline'];

  let storage = null, data = emptyData(), cur = null, session = null;
  let dirHandle = null, perm = 'prompt', lastWrite = 0, lastError = null, syncTimer = null, syncQueued = null;
  let needsRepick = false, pickFn = null; // v5.11.0.22: a stale handle needs a fresh folder pick, not another silent requestPermission
  let folderChecked = false; // first write has already preserved any pre-existing folder save
  let folderBlocked = false; // existing latest is unreadable; do not write over it
  const FOLDER_UNREADABLE = '文件夹里的存档读不出来，先没有写入，以免覆盖。';
  let fps = { sum: 0, n: 0, min: Infinity }, getSave = null;

  function emptyIncome() { const o = {}; for (const k of INCOME) o[k] = 0; return o; }
  function emptyIdle() { return { fish: 0, rest: 0, patrol: 0, other: 0 }; }
  function emptyData() { return { schema: SCHEMA, startedAt: null, lastSyncAt: null, syncDirName: null, timeline: 'a', sessions: [], days: [], events: [] }; }
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
    d.timeline = raw.timeline || 'a';
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
  function wrapSave(snap, extraMeta) {
    return {
      meta: Object.assign({
        kind: 'pixel-farm-save', exportedAt: new Date().toISOString(),
        gameVersion: snap && snap.gameVersion || null, saveVersion: snap && snap.saveVersion || null,
        timeline: (data && data.timeline) || 'a'
      }, extraMeta || {}),
      save: snap && root.PFSave && root.PFSave.compact ? root.PFSave.compact(snap) : snap // v5.11.0.8: the same compact form as the game's own save
    };
  }
  function currentTimeline() { return (data && data.timeline) || 'a'; }
  function padDay(d) { return String(Math.max(0, Math.round(+d || 0))).padStart(3, '0'); }
  function daySnapName(day, timeline) {
    const tl = timeline || currentTimeline();
    return 'pixel-farm-save-day' + padDay(day) + (tl && tl !== 'a' ? '-' + tl : '') + '.json';
  }
  function nextTimeline() {
    const cur = currentTimeline() || 'a';
    const m = cur.match(/^([a-z]+)(\d*)$/);
    const letter = (m && m[1]) || 'a', seq = (m && m[2]) ? parseInt(m[2], 10) : 0;
    if (letter === 'z' || letter.length !== 1) return 't' + Date.now().toString(36).slice(-4);
    const next = String.fromCharCode(letter.charCodeAt(0) + 1);
    return seq ? next + seq : next;
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
  function peekSave(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const s = obj.save && typeof obj.save === 'object' ? obj.save : obj;
    const clock = (s && s.clock) || {};
    const day = clock.day != null ? clock.day : (s.day != null ? s.day : null);
    const t = clock.t != null ? clock.t : (s.t != null ? s.t : null);
    if (day == null && t == null && (s.coins == null) && (s.savedAt == null)) return null;
    return {
      day, t,
      savedAt: s.savedAt || null,
      coins: s.coins,
      createdAt: s.createdAt || null,
      gameVersion: s.gameVersion || (obj.meta && obj.meta.gameVersion) || null
    };
  }
  function peekEqual(a, b) {
    if (!a || !b) return false;
    const rt = v => v == null ? v : Math.round(v);
    return a.day === b.day && rt(a.t) === rt(b.t) && a.coins === b.coins && a.createdAt === b.createdAt;
  }
  function peekClock(p) {
    if (!p || p.t == null) return '';
    const t = Math.max(0, Math.round(Number(p.t) || 0));
    const h = Math.floor(t / 60) % 24, m = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function emitSync() {
    if (typeof dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
    try { dispatchEvent(new CustomEvent('pf:sync', { detail: status() })); } catch (e) {}
  }
  async function readFolderText(handle, name) {
    try { return await readFromDir(handle, name); }
    catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }
  async function writeRaw(handle, name, text) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(typeof text === 'string' ? text : JSON.stringify(text, null, 2) + '\n');
    await w.close();
  }
  async function existsName(handle, name) {
    try { await handle.getFileHandle(name); return true; }
    catch (e) {
      if (isNotFound(e)) return false;
      throw e;
    }
  }
  async function uniqueName(handle, base) {
    if (!(await existsName(handle, base))) return base;
    const dot = base.lastIndexOf('.'), stem = dot >= 0 ? base.slice(0, dot) : base, ext = dot >= 0 ? base.slice(dot) : '';
    for (let n = 2; n < 50; n++) {
      const name = stem + '-' + n + ext;
      if (!(await existsName(handle, name))) return name;
    }
    return stem + '-' + Date.now() + ext;
  }
  function snapBase(name) { return String(name || '').split('/').pop(); }
  async function getSavesDir(handle, create) {
    if (!handle || typeof handle.getDirectoryHandle !== 'function') {
      if (!create) return null;
      throw new Error('no directory handle');
    }
    try { return await handle.getDirectoryHandle(SNAP_DIR, { create: !!create }); }
    catch (e) {
      if (!create && /not found|NotFoundError/i.test(errText(e))) return null;
      throw e;
    }
  }
  function parseMaybe(x) {
    if (x == null) return null;
    if (typeof x === 'object') return x;
    try { return JSON.parse(x); } catch (e) { return null; }
  }
  // Compare the actual farm save. Export-only meta (exportedAt / syncedAt, and the
  // wrapper's meta object) is ignored; peek fields like day/clock/coins/createdAt
  // are for display, not for "is this the same save?".
  function saveBody(obj) {
    const o = parseMaybe(obj);
    if (!o || typeof o !== 'object') return o;
    if (o.save && typeof o.save === 'object') return o.save;
    const body = Object.assign({}, o);
    delete body.exportedAt;
    delete body.syncedAt;
    if (body.meta && typeof body.meta === 'object') {
      const m = Object.assign({}, body.meta);
      delete m.exportedAt;
      delete m.syncedAt;
      body.meta = m;
    }
    return body;
  }
  function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    if (typeof a === 'object') {
      if (typeof b !== 'object' || Array.isArray(b)) return false;
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (const k of ka) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
      }
      return true;
    }
    return false;
  }
  function sameSaveContent(a, b) {
    if (a == null || b == null) return false;
    if (a === b || (typeof a === 'string' && typeof b === 'string' && a.trim() === b.trim())) return true;
    const sa = saveBody(a), sb = saveBody(b);
    if (sa == null || sb == null) return false;
    return deepEqual(sa, sb);
  }
  function sameFarm(existingText, snap) {
    const peek = peekSave(snap);
    if (!peek) return false;
    try {
      const ep = peekSave(parseMaybe(existingText));
      return !!(ep && peek.createdAt != null && ep.createdAt === peek.createdAt);
    } catch (e) { return false; }
  }
  function isNotFound(e) { return /not found|NotFoundError/i.test(errText(e)); }
  function nextLetter(tl) {
    const cur = tl || 'a';
    if (cur === 'z' || !/^[a-z]$/.test(cur)) return 't' + Date.now().toString(36).slice(-4);
    return String.fromCharCode(cur.charCodeAt(0) + 1);
  }
  async function nextFreeDayName(saves, day, startTl) {
    let tl = startTl || 'a';
    for (let i = 0; i < 24; i++) {
      const name = daySnapName(day, tl);
      if (!(await existsName(saves, name))) return { name, timeline: tl };
      tl = nextLetter(tl);
    }
    const tl2 = 't' + Date.now().toString(36).slice(-4);
    return { name: daySnapName(day, tl2), timeline: tl2 };
  }
  // Before the first write of the live latest files, copy the folder's existing
  // pixel-farm-save.json into saves/ under that farm's own day number. Bytes stay
  // identical. If that day file already exists with different content, add a
  // timeline suffix. The folder is write-only after this; the browser save is
  // the one that continues.
  // If the latest file exists but cannot be read or parsed, do not write anything.
  // Only a confirmed absence (NotFoundError) means the folder is empty.
  async function preserveExistingSave(handle) {
    // Only a confirmed NotFoundError means "no file, safe to write". A stale
    // handle or other getFileHandle failure is a sync error, not a parse pause.
    // Once the file is known to exist, a read/parse failure pauses writing.
    let fh;
    try { fh = await handle.getFileHandle(SAVE_FILE); }
    catch (e) {
      if (isNotFound(e)) return { missing: true };
      throw e;
    }
    let text;
    try {
      const f = await fh.getFile();
      text = await f.text();
    } catch (e) { return { blocked: true, error: errText(e) }; }
    if (text == null || !String(text).trim()) return { blocked: true, error: 'empty' };
    let obj = null, peek = null;
    try { obj = JSON.parse(text); peek = peekSave(obj); }
    catch (e) { return { blocked: true, error: 'parse' }; }
    if (!peek) return { blocked: true, error: 'invalid' };
    const day = peek.day != null ? peek.day : 0;
    const saves = await getSavesDir(handle, true);
    let name = daySnapName(day, 'a');
    if (await existsName(saves, name)) {
      const existing = await readFolderText(saves, name);
      if (sameSaveContent(existing, text)) return { name, dir: SNAP_DIR };
      const free = await nextFreeDayName(saves, day, 'b');
      name = free.name;
    }
    await writeRaw(saves, name, text);
    return { name, dir: SNAP_DIR };
  }
  // Permission probe must NEVER write pixel-farm-save.json or the playlog. A tiny
  // throwaway file is enough to see whether Chrome will actually let us write.
  async function probePerm() {
    if (!dirHandle) return;
    try {
      const fh = await dirHandle.getFileHandle(PROBE_FILE, { create: true });
      const w = await fh.createWritable();
      await w.write('ok\n');
      await w.close();
      if (typeof dirHandle.removeEntry === 'function') {
        try { await dirHandle.removeEntry(PROBE_FILE); } catch (e) {}
      }
      perm = 'granted'; needsRepick = false; lastError = null;
    } catch (e) {
      if (isStaleErr(e)) { logErr(e); needsRepick = true; }
      else lastError = null;
    }
  }
  async function hydrateDir() {
    if (!dirHandle) { const h = await idbGet(); if (!dirHandle) dirHandle = h; }
    if (!dirHandle) { perm = 'prompt'; needsRepick = false; return status(); }
    try { perm = await queryPerm(dirHandle); }
    catch (e) { logErr(e); perm = 'prompt'; needsRepick = true; }
    if (perm !== 'granted') await probePerm();
    if (perm === 'granted') { needsRepick = false; await syncNow('boot'); }
    emitSync();
    return status();
  }
  async function refreshPerm() {
    if (!dirHandle) { const h = await idbGet(); if (!dirHandle) dirHandle = h; }
    if (!dirHandle) { perm = 'prompt'; return status(); }
    try {
      const next = await queryPerm(dirHandle);
      if (next === 'granted') {
        const was = perm;
        perm = 'granted'; needsRepick = false;
        if (was !== 'granted') await syncNow('refresh');
      } else perm = next || 'prompt';
    } catch (e) { logErr(e); perm = 'prompt'; needsRepick = true; }
    emitSync();
    return status();
  }
  async function pickDir(opts) {
    const fn = getPicker();
    if (typeof fn !== 'function') throw new Error('unsupported');
    // Prefer the stored handle so the picker opens on the folder already chosen.
    const start = (opts && Object.prototype.hasOwnProperty.call(opts, 'startIn')) ? opts.startIn : (dirHandle || 'documents');
    const arg = s => ({ id: 'pixel-farm-sync', mode: 'readwrite', startIn: s || 'documents' });
    let h;
    try { h = await fn(arg(start || 'documents')); }
    catch (e) {
      if (e && e.name === 'AbortError') throw e;
      // Activation is already gone; a retry will not bring the picker back.
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
      // A stale startIn handle can make the picker throw; try again from documents.
      if (start && start !== 'documents') h = await fn(arg('documents'));
      else throw e;
    }
    dirHandle = h; perm = 'granted';
    try { perm = await h.requestPermission({ mode: 'readwrite' }); } catch (e) { logErr(e); }
    try { await idbPut(h); } catch (e) { /* node / test handles may have no IndexedDB */ }
    data.syncDirName = h.name || null; flush();
    needsRepick = false;
    folderChecked = false; folderBlocked = false;
    if (perm === 'granted') await syncNow('pick');
    emitSync();
    return status();
  }
  // v5.11.0.24: requestPermission / showDirectoryPicker must be the first await inside the
  // click. Reading IndexedDB first drops Chrome's transient user activation, and the
  // permission call then fails silently — the button looks like it does nothing.
  // After reload, queryPermission is often 'prompt' even if the site still lists the folder.
  // requestPermission may also return 'prompt' with no UI. If it does not grant (prompt,
  // denied, or a throw), or the handle is missing/stale, open showDirectoryPicker in this
  // same click (startIn: the stored handle when we have one). Never fail the click silently.
  function isActivationLost(e) {
    return !!(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError'));
  }
  const PICKER_AGAIN = '没能打开文件夹选择框，请再点一次「重新选择同步文件夹」。';
  function failPick(e, aborted) {
    if (aborted) {
      needsRepick = true;
      emitSync();
      return Object.assign(status(), { aborted: true });
    }
    if (isActivationLost(e)) lastError = PICKER_AGAIN;
    else if (!lastError) logErr(e);
    else try { console.warn('[pixel-farm sync]', errText(e), e); } catch (x) {}
    needsRepick = true;
    emitSync();
    return status();
  }
  async function pickAfterRequest(startIn) {
    try { return await pickDir({ startIn: startIn || dirHandle || 'documents' }); }
    catch (e) {
      return failPick(e, e && e.name === 'AbortError');
    }
  }
  async function resumeDir() {
    if (needsRepick || !dirHandle) {
      try { return await pickDir({ startIn: dirHandle || 'documents' }); }
      catch (e) {
        return failPick(e, e && e.name === 'AbortError');
      }
    }
    // The handle is in memory: requestPermission is the first await (keeps the user gesture).
    let next;
    try { next = await requestPerm(dirHandle); perm = next; }
    catch (e) {
      logErr(e);
      perm = 'prompt';
      next = null;
    }
    if (next === 'granted') {
      folderChecked = false;
      const w = await syncNow('resume');
      if (w.ok) { needsRepick = false; lastError = null; emitSync(); return status(); }
      if (!isStaleMsg(w.error)) { emitSync(); return status(); }
      return await pickAfterRequest(dirHandle);
    }
    if (!lastError) lastError = next === 'denied' ? '浏览器没有允许写入这个文件夹。' : '文件夹权限还没有恢复。';
    try { console.warn('[pixel-farm sync]', 'requestPermission →', next); } catch (x) {}
    return await pickAfterRequest(dirHandle);
  }
  async function forgetDir() {
    dirHandle = null; perm = 'prompt'; needsRepick = false; lastError = null;
    folderChecked = false; folderBlocked = false;
    data.syncDirName = null; flush();
    await idbDel();
    emitSync();
    return status();
  }
  function installDir(handle, permission) {
    dirHandle = handle || null;
    perm = permission || 'prompt';
    needsRepick = false;
    lastError = null;
    folderChecked = false; folderBlocked = false;
    if (handle && handle.name) data.syncDirName = handle.name;
    return status();
  }
  async function listNames(handle) {
    if (handle && handle.files && typeof handle.files === 'object' && typeof handle.values !== 'function') return Object.keys(handle.files);
    const names = [];
    if (handle && typeof handle.values === 'function') {
      for await (const entry of handle.values()) if (entry && entry.name) names.push(entry.name);
    } else if (handle && typeof handle.keys === 'function') {
      for await (const name of handle.keys()) names.push(name);
    }
    return names;
  }
  async function writeDaySnap(handle, snap, opts) {
    const s = snap || (getSave && getSave());
    if (!s) return null;
    const peek = peekSave(s);
    if (!peek || peek.day == null) return null;
    const saves = await getSavesDir(handle, true);
    let name = daySnapName(peek.day, currentTimeline());
    if (await existsName(saves, name)) {
      const existing = await readFolderText(saves, name);
      const incoming = JSON.stringify(wrapSave(s), null, 2) + '\n';
      // First write after preserving the folder's latest: never clobber a snapshot
      // whose actual save content differs, even if day/clock/coins/createdAt match.
      // Later writes on the same farm may update that day's current-timeline file.
      if (existing != null && !sameSaveContent(existing, incoming)) {
        const protect = opts && opts.protectExisting;
        if (protect || !sameFarm(existing, s)) {
          const free = await nextFreeDayName(saves, peek.day, nextLetter(currentTimeline()));
          data.timeline = free.timeline;
          flush();
          name = free.name;
        }
      }
    }
    await writeRaw(saves, name, JSON.stringify(wrapSave(s), null, 2) + '\n');
    return name;
  }
  async function snapshotPresent(handle, snap) {
    const s = snap || (getSave && getSave());
    const dayName = s ? await writeDaySnap(handle, s) : null;
    const saves = await getSavesDir(handle, true);
    const dest = await uniqueName(saves, 'pixel-farm-save-before-rewind.json');
    if (s) await writeRaw(saves, dest, JSON.stringify(wrapSave(s, { role: 'before-rewind' }), null, 2) + '\n');
    return { day: dayName, before: dest };
  }
  function parseSnapName(name) {
    const dayM = String(name || '').match(/^pixel-farm-save-day(\d{3})(?:-([a-z0-9]+))?\.json$/i);
    if (dayM) return { role: 'day', day: parseInt(dayM[1], 10), timeline: dayM[2] || 'a', name };
    const preM = String(name || '').match(/^pixel-farm-save-before-rewind(?:-(\d+|[a-z0-9]+))?\.json$/i);
    if (preM) return { role: 'before-rewind', timeline: 'a', name };
    return null;
  }
  async function collectSnapItems(handle, names, items, seen) {
    for (const name of names) {
      const base = snapBase(name);
      const parsed = parseSnapName(base);
      if (!parsed || seen[base]) continue;
      let obj = null, peek = null;
      try {
        const text = await readFromDir(handle, base);
        obj = JSON.parse(text);
        peek = peekSave(obj);
      } catch (e) { continue; }
      if (!peek) continue;
      seen[base] = true;
      items.push({
        name: base,
        role: parsed.role,
        timeline: (obj.meta && obj.meta.timeline) || parsed.timeline || 'a',
        day: peek.day,
        t: peek.t,
        clock: peekClock(peek),
        savedAt: peek.savedAt,
        coins: peek.coins,
        label: parsed.role === 'before-rewind' ? '回溯前的进度' : null
      });
    }
  }
  async function listRewind(handle) {
    const h = handle || dirHandle;
    if (!h) return [];
    const items = [], seen = {};
    const saves = await getSavesDir(h, false);
    if (saves) await collectSnapItems(saves, await listNames(saves), items, seen);
    // Also accept leftover root-level day files from earlier builds.
    await collectSnapItems(h, await listNames(h), items, seen);
    items.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'before-rewind' ? -1 : 1;
      if (a.role === 'before-rewind') return (b.savedAt || 0) - (a.savedAt || 0);
      if (a.day !== b.day) return (b.day || 0) - (a.day || 0);
      if (a.timeline !== b.timeline) return String(a.timeline).localeCompare(String(b.timeline));
      return (b.savedAt || 0) - (a.savedAt || 0);
    });
    return items;
  }
  // Must be called from a click: requestPermission is the first await when the handle is in memory.
  async function openRewind() {
    if (!dirHandle) {
      try { await pickDir(); }
      catch (e) {
        if (e && e.name === 'AbortError') return Object.assign(status(), { aborted: true, entries: [] });
        logErr(e);
        return Object.assign(status(), { entries: [] });
      }
    } else if (perm !== 'granted') {
      try { perm = await requestPerm(dirHandle); }
      catch (e) { logErr(e); perm = 'prompt'; needsRepick = true; return Object.assign(status(), { entries: [] }); }
      if (perm !== 'granted') { needsRepick = true; return Object.assign(status(), { entries: [] }); }
      needsRepick = false;
    }
    const entries = await listRewind();
    return Object.assign(status(), { entries });
  }
  // Explicit user action only. Auto-sync never reads a day snapshot back into the browser.
  // Before loading, the current browser state is written as a day snapshot + 「回溯前的进度」.
  // A new timeline suffix is started so later syncs won't overwrite earlier days of the old line.
  async function rewindTo(name, snap) {
    const h = dirHandle;
    if (!h) return Object.assign(status(), { ok: false, reason: 'no-handle' });
    if (perm !== 'granted') return Object.assign(status(), { ok: false, reason: 'no-permission' });
    const base = snapBase(name);
    let text = null, obj;
    try {
      const saves = await getSavesDir(h, false);
      if (saves) text = await readFolderText(saves, base);
      if (text == null) text = await readFolderText(h, base);
      if (text == null) throw new Error('not found: ' + base);
      obj = JSON.parse(text);
    } catch (e) { logErr(e); return Object.assign(status(), { ok: false, reason: 'error', error: lastError }); }
    const save = obj && obj.save && typeof obj.save === 'object' ? obj.save : obj;
    const present = await snapshotPresent(h, snap || (getSave && getSave()));
    data.timeline = nextTimeline();
    flush();
    folderChecked = true;
    lastError = null;
    // Live latest follows the chosen day. Per-day files of the previous timeline stay put.
    await writeRaw(h, SAVE_FILE, typeof text === 'string' ? text : JSON.stringify(obj, null, 2) + '\n');
    emitSync();
    return Object.assign(status(), { ok: true, save, present, timeline: currentTimeline(), from: name });
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
    if (!folderChecked) {
      try {
        const p = await preserveExistingSave(h);
        if (p && p.blocked) {
          folderBlocked = true;
          lastError = FOLDER_UNREADABLE;
          emitSync();
          return { ok: false, reason: 'unreadable', error: lastError, folderBlocked: true };
        }
      } catch (e) {
        logErr(e);
        return { ok: false, reason: 'error', error: lastError };
      }
    }
    try {
      const files = filesForSync(snap);
      await writeToDir(h, files);
      try { await writeDaySnap(h, snap, { protectExisting: !folderChecked }); } catch (e) { try { console.warn('[pixel-farm sync] day snapshot', e); } catch (x) {} }
      folderChecked = true;
      folderBlocked = false;
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
      dirName: (dirHandle && dirHandle.name) || data.syncDirName || null,
      folderBlocked: !!folderBlocked
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
    data = emptyData(); cur = null; session = null; dirHandle = null; perm = 'prompt'; needsRepick = false; folderChecked = false; folderBlocked = false;
    lastWrite = 0; lastError = null; fps = { sum: 0, n: 0, min: Infinity };
    if (store || storage) load(store || storage);
    return data;
  }

  function memoryDir(opts) {
    const files = {};
    const dirs = {};
    const dir = {
      name: (opts && opts.name) || 'memory', files, dirs,
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
      async removeEntry(name) {
        if (files[name]) { delete files[name]; return; }
        if (dirs[name]) { delete dirs[name]; return; }
        const e = new Error('not found: ' + name); e.name = 'NotFoundError'; throw e;
      },
      async *values() {
        for (const name of Object.keys(files)) yield { name, kind: 'file' };
        for (const name of Object.keys(dirs)) yield { name, kind: 'directory' };
      },
      async *keys() {
        for (const name of Object.keys(files)) yield name;
        for (const name of Object.keys(dirs)) yield name;
      },
      async getDirectoryHandle(name, o) {
        if (!dirs[name]) {
          if (!(o && o.create)) { const e = new Error('not found: ' + name); e.name = 'NotFoundError'; throw e; }
          dirs[name] = memoryDir({ name, writeThrow: opts && opts.writeThrow });
        }
        return dirs[name];
      },
      async getFileHandle(name, o) {
        if (opts && opts.writeThrow) throw opts.writeThrow;
        if (!files[name] && !(o && o.create)) { const e = new Error('not found: ' + name); e.name = 'NotFoundError'; throw e; }
        if (!files[name]) files[name] = { text: '' };
        const rec = files[name];
        return {
          async createWritable() {
            let buf = '';
            return { async write(s) { buf += typeof s === 'string' ? s : (s && s.byteLength != null ? new TextDecoder().decode(s) : String(s)); }, async close() { rec.text = buf; } };
          },
          async getFile() {
            if (rec.readThrow) throw rec.readThrow;
            return { async text() { if (rec.readThrow) throw rec.readThrow; return rec.text; }, text: async () => { if (rec.readThrow) throw rec.readThrow; return rec.text; } };
          }
        };
      }
    };
    return dir;
  }

  const api = {
    KEY, SCHEMA, MAX_DAYS, MAX_EVENTS, SAVE_FILE, LOG_FILE, PROBE_FILE, SNAP_DIR, SYNC_MIN_MS,
    load, flush, boot, reset, get, current, exportObject, wrapSave,
    openDay, closeDay, startSession, endSession,
    income, spend, purchase, event, tick, work, sampleFps, offline, classify,
    supported, status, pickDir, resumeDir, forgetDir, hydrateDir, refreshPerm, installDir, setPicker, peekSave, sameSaveContent,
    listRewind, openRewind, rewindTo, daySnapName, currentTimeline,
    writeToDir, readFromDir, syncNow, syncSoon, syncMorning, filesForSync,
    download, downloadLog, memoryDir
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PFPlaylog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
