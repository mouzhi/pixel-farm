/* 像素农场 · 平台适配层（网页 / 小红书小工具）
 * 小红书容器里存档链路：云存储（§3.16，9.51+ 内测，跨设备）→ 本地 Storage JS API（§3.6/3.7）→ localStorage。
 * 读取时比较 savedAt / 农场天数，永远用较新的那份，并回写到本地缓存。云写入节流。
 * 网页里只走 localStorage。同步 syncStore 给 save.js / playlog.js / ui.js 用。
 * 买断付费由宿主支付墙处理，工具内没有商品内购 API；赞赏走 rewardAuthor。
 */
(function (root) {
  'use strict';
  // 1.3.0 · Chrome 61 / Android 8.1: Array.prototype.flatMap is Chrome 69+ (ui.js codex focus uses it).
  if (typeof Array.prototype.flatMap !== 'function') {
    Object.defineProperty(Array.prototype, 'flatMap', { configurable: true, writable: true, value: function (fn, self) {
      var out = [];
      for (var i = 0; i < this.length; i++) { var v = fn.call(self, this[i], i, this); if (Array.isArray(v)) out.push.apply(out, v); else out.push(v); }
      return out;
    } });
  }
  // Chrome 61 / Android 8.1: Object.fromEntries is ES2019 (Chrome 73+).
  if (typeof Object.fromEntries !== 'function') {
    Object.fromEntries = function (iter) {
      var o = {}, i, e, a;
      if (iter && typeof iter.forEach === 'function') {
        iter.forEach(function (p) { if (p) o[p[0]] = p[1]; });
        return o;
      }
      a = iter ? (Array.from ? Array.from(iter) : []) : [];
      for (i = 0; i < a.length; i++) { e = a[i]; if (e) o[e[0]] = e[1]; }
      return o;
    };
  }
  var mini = root.xhs && root.xhs.miniTool;
  var isXhs = !!(mini && (typeof mini.setStorage === 'function' || typeof mini.getStorage === 'function'));

  // 1.1.1：端能力按「方法存在 + 客户端版本」双重判断。官方文档（§3.6、§3.19）：
  // SDK 方法存在不代表客户端已支持，旧客户端会静默忽略、调用一直等待，入口就成了点不动的死按钮。
  // buildVersion 去掉末三位编译序号后比较，例如 9530123 → 9530。
  var MIN_CLIENT = {
    saveImageToPhotosAlbum: 9420,
    getWindowInfo: 9490,
    followAuthor: 9510, getFollowStatus: 9510,
    submitScore: 9510, getRankList: 9510, getMyRank: 9510,
    addCloudStorage: 9510, updateCloudStorage: 9510, queryCloudStorage: 9510, removeCloudStorage: 9510,
    share: 9530,
    rewardAuthor: 9533, setCloseRetentionEnabled: 9533
  };
  // 赞赏（§3.19）是内测能力，入口展示前要先确认本工具的赞赏开关已开通；本包没有开通，入口不展示。
  var REWARD_ENABLED = false;
  var clientVer = 0;
  function getMini() {
    var m = root.xhs && root.xhs.miniTool;
    if (m && !mini) mini = m; // 容器晚注入时补上
    return m || mini || null;
  }
  function readBuild(lo) {
    var env = lo && lo.miniToolEnv;
    return Number(env && env.buildVersion) || 0;
  }
  function clientVersion() {
    if (!clientVer) {
      var b = readBuild(root.xhs && root.xhs.launchOptions);
      if (b) clientVer = Math.floor(b / 1000);
    }
    return clientVer;
  }
  function supports(name) {
    var m = getMini();
    if (!m || typeof m[name] !== 'function') return false;
    var need = MIN_CLIENT[name];
    if (!need) return true;
    return clientVersion() >= need;
  }
  function probeClientVersion() {
    if (clientVersion()) return Promise.resolve(clientVer);
    var m = getMini();
    if (!m || typeof m.getLaunchOptions !== 'function') return Promise.resolve(0);
    return withTimeout(callMini('getLaunchOptions'), 1500).then(function (r) {
      var b = readBuild(r && r.value);
      if (b && !clientVer) clientVer = Math.floor(b / 1000);
      if (clientVer && root.dispatchEvent) root.dispatchEvent(new CustomEvent('pf:caps'));
      return clientVer;
    });
  }
  // 用户点按触发的端能力：超时后 reject（errCode -2），按钮不会永远卡在「忙」。
  function callMiniTimed(name, args, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        reject({ errCode: -2, errMsg: name + ':fail timeout' });
      }, ms || 8000);
      callMini(name, args).then(function (r) {
        if (done) return;
        done = true; clearTimeout(t); resolve(r);
      }, function (e) {
        if (done) return;
        done = true; clearTimeout(t); reject(e);
      });
    });
  }
  var KEY_MAX = 1024 * 1024;      // official: 1 MB per key
  var TOTAL_MAX = 10 * 1024 * 1024; // official: 10 MB per tool
  function utf8Bytes(s) { return unescape(encodeURIComponent(String(s))).length; }
  function onStoreError(msg) {
    if (root.PFPlatform && typeof root.PFPlatform.toast === 'function') root.PFPlatform.toast(msg);
    if (root.dispatchEvent) root.dispatchEvent(new CustomEvent('pf:save-error', { detail: { error: msg } }));
  }

  function memoryStore(seed) {
    var map = {};
    if (seed) {
      for (var k in seed) {
        if (Object.prototype.hasOwnProperty.call(seed, k)) map[k] = String(seed[k]);
      }
    }
    function keys() { return Object.keys(map); }
    return {
      get length() { return keys().length; },
      key: function (i) { return keys()[i] || null; },
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
      },
      setItem: function (k, v) {
        var s = String(v), n = utf8Bytes(s);
        if (n > KEY_MAX) {
          var err = '单条存档超过 1MB（' + n + ' 字节）';
          onStoreError(err);
          throw new Error(err);
        }
        var prev = map[String(k)], total = n;
        for (var ok in map) {
          if (ok !== String(k) && Object.prototype.hasOwnProperty.call(map, ok)) total += utf8Bytes(map[ok]);
        }
        if (total > TOTAL_MAX) {
          var err2 = '本地缓存合计超过 10MB';
          onStoreError(err2);
          throw new Error(err2);
        }
        map[String(k)] = s;
      },
      removeItem: function (k) { delete map[k]; },
      clear: function () { map = {}; },
      _dump: function () { return map; }
    };
  }

  var syncStore = null;
  var flushTimer = null;
  var SAVE_KEY = 'mouzhi/pixel-farm:save';
  var CLOUD_ID_KEY = 'mouzhi/pixel-farm:cloud:id';
  var CLOUD_COLLECTION = 'farm';
  var CLOUD_MAX = 65536;            // official §3.16: 64KB per content
  var CLOUD_THROTTLE_MS = 3 * 60 * 1000;

  function errCodeOf(e) {
    if (!e) return 0;
    if (typeof e.errCode === 'number') return e.errCode;
    if (typeof e.code === 'number') return e.code;
    return 0;
  }
  function isUnauthorized(e) {
    var c = errCodeOf(e);
    return c === 1005 || c === 1006;
  }
  // Missing or unopened advanced abilities (关注 / 赞赏 / 云存储) should degrade quietly.
  // Do not treat follow/reward 10003 as this: on follow it means "confirm dialog already open".
  function isCapabilityDenied(e) {
    if (isUnauthorized(e)) return true;
    var msg = String((e && (e.errMsg || e.message)) || '');
    return /未开通|未授权|无权限|not\s*auth|denied|permission/i.test(msg);
  }
  function safeParse(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  // Normalize a getStorage payload into the raw string we keep in the memory store.
  function decodeStorageData(data) {
    if (data == null) return null;
    if (typeof data === 'object') {
      try { return JSON.stringify(data); } catch (e) { return null; }
    }
    var s = String(data);
    try {
      var parsed = JSON.parse(s);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object') return s;
      return s;
    } catch (e) { return s; }
  }
  function stampOf(rawOrObj) {
    var s = rawOrObj;
    if (typeof s === 'string') s = safeParse(s);
    if (!s || typeof s !== 'object') return { at: -1, day: -1, ok: false };
    var at = +s.savedAt;
    if (!isFinite(at) || at < 0) at = 0;
    var day = 0;
    if (s.clock && isFinite(+s.clock.day)) day = +s.clock.day;
    else if (isFinite(+s.day)) day = +s.day;
    return { at: at, day: day, ok: true };
  }
  // true if a is strictly newer than b. Missing/invalid b loses; missing a never wins.
  function isNewer(a, b) {
    var sa = (a && a.ok != null) ? a : stampOf(a);
    var sb = (b && b.ok != null) ? b : stampOf(b);
    if (!sa || !sa.ok) return false;
    if (!sb || !sb.ok) return true;
    if (sa.at !== sb.at) return sa.at > sb.at;
    return sa.day > sb.day;
  }

  function readLocalStorageAll() {
    var seed = {};
    try {
      var ls = root.localStorage;
      if (!ls) return seed;
      for (var i = 0, n = ls.length; i < n; i++) {
        var k = ls.key(i);
        if (k == null) continue;
        try { seed[k] = ls.getItem(k); } catch (e) {}
      }
    } catch (e) { /* private mode */ }
    return seed;
  }
  function writeLocalStorage(key, value) {
    try {
      if (root.localStorage) root.localStorage.setItem(key, value);
    } catch (e) { /* quota / private */ }
  }
  function writeThroughLocalCache(key, value) {
    writeLocalStorage(key, value);
  }

  function callMini(name, args) {
    return new Promise(function (resolve, reject) {
      try {
        var m = getMini();
        if (!m || typeof m[name] !== 'function') {
          reject({ errCode: 0, errMsg: 'unsupported:' + name });
          return;
        }
        Promise.resolve(m[name](args)).then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }

  var cloudOk = false;
  var cloudDirty = false;
  var cloudBusy = false;
  var cloudTimer = null;
  var lastCloudWriteAt = 0;
  var cloudDisabledReason = '';
  var oversizedToast = false;

  function cloudMethodsPresent() {
    return supports('addCloudStorage') && supports('updateCloudStorage') && supports('queryCloudStorage');
  }
  function probeCloud() {
    var out = {
      usable: false,
      present: false,
      reason: '云存储是 9.51+ 内测；本包把它当作跨设备主存档，本地 Storage / localStorage 做缓存和降级，不单独依赖云。单条 content ≤64KB。',
      methods: {},
      collection: CLOUD_COLLECTION,
      maxBytes: CLOUD_MAX,
      throttleMs: CLOUD_THROTTLE_MS
    };
    var names = ['addCloudStorage', 'updateCloudStorage', 'queryCloudStorage', 'removeCloudStorage'];
    names.forEach(function (m) { out.methods[m] = !!(mini && typeof mini[m] === 'function'); });
    out.present = names.slice(0, 3).every(function (m) { return out.methods[m]; });
    if (!mini) out.reason = '当前环境没有 window.xhs.miniTool';
    else if (!out.present) out.reason = '当前容器未注入云存储 API（或客户端低于 9.51）';
    if (cloudDisabledReason) out.reason = cloudDisabledReason;
    out.usable = !!(out.present && !cloudDisabledReason);
    return out;
  }
  function refreshCloudState() {
    var snap = probeCloud();
    snap.stamp = stampOf;
    snap.isNewer = isNewer;
    snap.flush = function () { return flushCloud(true); };
    if (root.PFPlatform) root.PFPlatform.cloud = snap;
    return snap;
  }
  function disableCloud(err) {
    var c = errCodeOf(err);
    cloudOk = false;
    cloudDirty = false;
    if (c === 1005 || c === 1006) cloudDisabledReason = '云存储未授权，已降级到本地缓存';
    else if (c === 10003) cloudDisabledReason = '云存储未被容器开通，已降级到本地缓存';
    else cloudDisabledReason = '云存储暂不可用，已降级到本地缓存';
    refreshCloudState();
  }

  function newestCloudItem(items) {
    var best = null;
    if (!items || !items.length) return null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.content == null) continue;
      if (!best || isNewer(stampOf(it.content), stampOf(best.content))) best = it;
    }
    return best;
  }
  function rememberCloudId(id) {
    if (!id || !syncStore) return;
    try { syncStore.setItem(CLOUD_ID_KEY, String(id)); } catch (e) {}
    writeThroughLocalCache(CLOUD_ID_KEY, String(id));
  }
  function rememberedCloudId() {
    if (syncStore) {
      try {
        var id = syncStore.getItem(CLOUD_ID_KEY);
        if (id) return id;
      } catch (e) {}
    }
    try { return root.localStorage ? root.localStorage.getItem(CLOUD_ID_KEY) : null; } catch (e) { return null; }
  }
  function queryCloud() {
    return callMini('queryCloudStorage', { collection: CLOUD_COLLECTION, limit: 20 }).then(function (page) {
      if (!page) return [];
      return page.items || [];
    });
  }

  function flushCloud(force) {
    if (!cloudOk || !syncStore) return Promise.resolve();
    if (cloudBusy) return Promise.resolve();
    if (!cloudDirty && !force) return Promise.resolve();
    var raw;
    try { raw = syncStore.getItem(SAVE_KEY); } catch (e) { return Promise.resolve(); }
    if (!raw) return Promise.resolve();
    var state = safeParse(raw);
    if (!state) return Promise.resolve();
    var bytes = utf8Bytes(JSON.stringify(state));
    if (bytes > CLOUD_MAX) {
      if (!oversizedToast) {
        oversizedToast = true;
        onStoreError('云存档超过 64KB，已只保存在本地');
      }
      cloudDirty = false;
      return Promise.resolve();
    }
    cloudBusy = true;
    return queryCloud().then(function (items) {
      var best = newestCloudItem(items);
      if (best && best.id) rememberCloudId(best.id);
      if (best && isNewer(stampOf(best.content), stampOf(state))) {
        // never overwrite a newer cloud save with an older local one
        cloudDirty = false;
        return;
      }
      var id = (best && best.id) || rememberedCloudId();
      var req = id
        ? callMini('updateCloudStorage', { collection: CLOUD_COLLECTION, items: [{ id: id, content: state }] })
        : callMini('addCloudStorage', { collection: CLOUD_COLLECTION, items: [{ content: state }] });
      return req.then(function (res) {
        var row = res && res.data && res.data[0];
        if (row && row.status === 'SUCCESS') {
          if (row.id) rememberCloudId(row.id);
          cloudDirty = false;
          lastCloudWriteAt = Date.now();
        } else if (row && row.status === 'UNKNOWN') {
          // docs: query to reconcile, do not resend
          return queryCloud().then(function (items2) {
            var it = newestCloudItem(items2);
            if (it && it.id) rememberCloudId(it.id);
            if (it && !isNewer(stampOf(state), stampOf(it.content))) cloudDirty = false;
          });
        }
        // FAILED: leave dirty for a later retry
      });
    }).then(function () { cloudBusy = false; }, function (err) {
      cloudBusy = false;
      var c = errCodeOf(err);
      if (isUnauthorized(err) || c === 10003) disableCloud(err);
      else if (c === 1003) {
        if (!oversizedToast) {
          oversizedToast = true;
          onStoreError('云存档超过 64KB，已只保存在本地');
        }
        cloudDirty = false;
      } else if (c === 2004) {
        // unknown result: reconcile, do not resend
        return queryCloud().then(function (items) {
          var it = newestCloudItem(items);
          if (it && it.id) rememberCloudId(it.id);
        }, function () {});
      } else if (c === 2009) {
        lastCloudWriteAt = Date.now(); // back off a full throttle window
      } else if (c === 2001 || c === 2999) {
        // leave dirty, retry later; one quiet toast at most
        if (!oversizedToast) { /* not size; stay silent, local cache is current */ }
      }
    });
  }

  function scheduleCloudFlush(soon) {
    if (!cloudOk) return;
    cloudDirty = true;
    if (cloudTimer) clearTimeout(cloudTimer);
    var wait = soon ? 1000 : Math.max(0, CLOUD_THROTTLE_MS - (Date.now() - lastCloudWriteAt));
    cloudTimer = setTimeout(function () { flushCloud(false); }, wait);
  }

  function flushLocalLayers() {
    if (!syncStore) return Promise.resolve();
    var dump;
    try { dump = syncStore._dump(); } catch (e) { return Promise.resolve(); }
    var keys = Object.keys(dump).filter(function (k) { return k.indexOf(ALBUM_PREFIX) !== 0; }).sort(function (a, b) {
      var ab = /:bak$/.test(a), bb = /:bak$/.test(b);
      if (ab !== bb) return ab ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    // always write-through to localStorage as last-resort cache
    for (var j = 0; j < keys.length; j++) {
      try { writeThroughLocalCache(keys[j], dump[keys[j]]); } catch (e) {}
    }
    if (!mini || typeof mini.setStorage !== 'function') return Promise.resolve();
    var i = 0;
    return new Promise(function (resolve) {
      function next() {
        if (i >= keys.length) { resolve(); return; }
        var key = keys[i++];
        var data = JSON.stringify(dump[key]);
        var n = utf8Bytes(data);
        if (n > KEY_MAX) { onStoreError('同步失败：' + key + ' 超过 1MB'); return next(); }
        callMini('setStorage', { key: key, data: data }).then(next, function (err) {
          onStoreError('本地缓存没写上');
          next();
        });
      }
      next();
    });
  }

  function flushNow(opts) {
    opts = opts || {};
    // Default (P.flush / pagehide) pushes a dirty cloud save immediately.
    // The short local debounce must not bypass the cloud throttle.
    var pushCloud = opts.cloud !== false;
    if (opts.fromTimer) flushTimer = null;
    var local = flushLocalLayers();
    var cloud = (pushCloud && cloudOk && cloudDirty) ? flushCloud(true) : Promise.resolve();
    return Promise.resolve(local).then(function () { return cloud; }, function () { return cloud; });
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { flushNow({ cloud: false, fromTimer: true }); }, 400);
  }

  // 1.3.0（网页版 v5.11.0.11 相册）：每张照片的小图（PNG data URL）按农场存一个 key。只进容器 Storage（官方 §3.6：
  // 正常业务统一读写容器存储），不写 localStorage，也不进云存档；不随存档的批量同步每次重写，只在拍下 / 补拍时写这一条。
  // 容器 Storage 不可用（网页预览）时才退回 localStorage。读：启动时 loadXhsSeed 已把所有 key 读进内存。
  var ALBUM_PREFIX = 'mouzhi/pixel-farm:album:';
  var albumStore = {
    getItem: function (k) {
      try { var d = syncStore && syncStore._dump && syncStore._dump(); if (d && d[k] != null) return d[k]; } catch (e) {}
      if (!isXhs) { try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; } }
      return null;
    },
    setItem: function (k, v) {
      k = String(k); v = String(v);
      if (k.indexOf(ALBUM_PREFIX) !== 0) throw new Error('album store: ' + k);
      if (!isXhs) { root.localStorage.setItem(k, v); return; }
      var data = JSON.stringify(v);
      if (utf8Bytes(data) > KEY_MAX) throw new Error('相册小图超过 1MB');
      try { var d = syncStore && syncStore._dump && syncStore._dump(); if (d) d[k] = v; } catch (e) {}
      callMini('setStorage', { key: k, data: data }).then(null, function () { onStoreError('相册照片没存上'); });
    }
  };

  function wrapStore(store) {
    return {
      get length() { return store.length; },
      key: function (i) { return store.key(i); },
      getItem: function (k) {
        try { return store.getItem(k); } catch (e) { return null; }
      },
      setItem: function (k, v) {
        try { store.setItem(k, v); }
        catch (e) { throw e; }
        try { writeThroughLocalCache(k, String(v)); } catch (err) {}
        scheduleFlush();
        if (String(k) === SAVE_KEY) scheduleCloudFlush(false);
      },
      removeItem: function (k) { store.removeItem(k); scheduleFlush(); },
      clear: function () { store.clear(); scheduleFlush(); },
      _dump: function () { return store._dump ? store._dump() : {}; }
    };
  }

  function loadXhsSeed() {
    if (!mini || typeof mini.getStorageInfo !== 'function') return Promise.resolve({});
    return callMini('getStorageInfo').then(function (info) {
      var keys = (info && info.keys) || [];
      var seed = {};
      var i = 0;
      function next() {
        if (i >= keys.length) return seed;
        var key = keys[i++];
        return callMini('getStorage', { key: key }).then(function (res) {
          var raw = decodeStorageData(res && res.data);
          if (raw != null) seed[key] = raw;
          return next();
        }, function () { return next(); });
      }
      return next();
    }, function () { return {}; });
  }

  function mergeSeeds(primary, secondary) {
    var out = {};
    var k;
    if (secondary) for (k in secondary) if (Object.prototype.hasOwnProperty.call(secondary, k)) out[k] = secondary[k];
    if (primary) for (k in primary) if (Object.prototype.hasOwnProperty.call(primary, k)) out[k] = primary[k];
    // For the game save key, pick the newer of the two layers.
    if (primary && secondary && primary[SAVE_KEY] && secondary[SAVE_KEY]) {
      out[SAVE_KEY] = isNewer(stampOf(primary[SAVE_KEY]), stampOf(secondary[SAVE_KEY]))
        ? primary[SAVE_KEY] : secondary[SAVE_KEY];
      var bak = SAVE_KEY + ':bak';
      // keep the older main as bak if bak is missing or older
      var older = out[SAVE_KEY] === primary[SAVE_KEY] ? secondary[SAVE_KEY] : primary[SAVE_KEY];
      if (older && (!out[bak] || isNewer(stampOf(older), stampOf(out[bak])))) out[bak] = older;
    }
    return out;
  }

  function adoptIntoLocal(json) {
    if (!syncStore || json == null) return;
    var raw = typeof json === 'string' ? json : JSON.stringify(json);
    // Mutate the memory dump directly so we don't mark the cloud copy dirty.
    try {
      var dump = syncStore._dump && syncStore._dump();
      if (dump) dump[SAVE_KEY] = raw;
    } catch (e) {}
    writeThroughLocalCache(SAVE_KEY, raw);
  }

  // Hydration must not stall the first frame: localStorage is sync, xhs Storage
  // is capped at SEED_WAIT_MS, and cloud merge always runs in the background.
  var SEED_WAIT_MS = 300;
  var bootSaveStamp = 0;
  var allowLateAdopt = true;
  var liveAdopted = false;
  function withTimeout(p, ms) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(tag, value) { if (!done) { done = true; resolve({ tag: tag, value: value }); } }
      if (p && typeof p.then === 'function') p.then(function (v) { finish('ok', v); }, function () { finish('ok', {}); });
      else finish('ok', p || {});
      setTimeout(function () { finish('timeout', null); }, ms);
    });
  }
  function stampFromStore() {
    try { return stampOf(syncStore && syncStore.getItem(SAVE_KEY)); } catch (e) { return 0; }
  }
  function wrapLocalStorage() {
    return wrapStore({
      get length() { return root.localStorage.length; },
      key: function (i) { return root.localStorage.key(i); },
      getItem: function (k) { return root.localStorage.getItem(k); },
      setItem: function (k, v) { root.localStorage.setItem(k, v); },
      removeItem: function (k) { root.localStorage.removeItem(k); },
      clear: function () { root.localStorage.clear(); },
      _dump: function () { return readLocalStorageAll(); }
    });
  }
  function installStore(xhsSeed, lsSeed) {
    if (syncStore) return;
    var seed = mergeSeeds(xhsSeed || {}, lsSeed || {});
    if (!Object.keys(seed).length && !isXhs) {
      try {
        if (root.localStorage) {
          syncStore = wrapLocalStorage();
          bootSaveStamp = stampFromStore();
          return;
        }
      } catch (e) { /* private mode */ }
    }
    syncStore = wrapStore(memoryStore(seed));
    bootSaveStamp = stampFromStore();
  }
  function applyLiveRestore(raw) {
    if (liveAdopted) return;
    if (!root.__farm || typeof root.__farm.restore !== 'function') return;
    if (!root.PFSave || typeof root.PFSave.read !== 'function') return;
    liveAdopted = true;
    try {
      var again = root.PFSave.read();
      if (again && again.state) {
        root.__farm.restore(again.state);
        if (typeof root.__farm.hud === 'function') root.__farm.hud();
        if (typeof root.__farm.render === 'function') root.__farm.render();
      }
    } catch (e) {}
  }
  function shouldAdoptIncoming(incoming, localRaw) {
    if (incoming == null) return false;
    if (!localRaw) return true;
    if (isNewer(stampOf(incoming), stampOf(localRaw))) return true;
    // boot saveNow may have stamped local as "now"; still take a save that was
    // newer than the pre-boot copy, while the late-adopt window is open.
    return !!(allowLateAdopt && isNewer(stampOf(incoming), bootSaveStamp));
  }
  function mergeLateSeed(xhsSeed) {
    if (!xhsSeed || !syncStore) return;
    var dump = syncStore._dump && syncStore._dump();
    if (!dump) return;
    var k, changedSave = false;
    for (k in xhsSeed) {
      if (!Object.prototype.hasOwnProperty.call(xhsSeed, k)) continue;
      var val = xhsSeed[k];
      var raw = typeof val === 'string' ? val : String(val);
      if (k === SAVE_KEY) {
        if (shouldAdoptIncoming(raw, dump[k])) {
          dump[k] = raw;
          writeThroughLocalCache(k, raw);
          changedSave = true;
        }
      } else if (dump[k] == null) {
        dump[k] = raw;
      }
    }
    if (changedSave) applyLiveRestore(dump[SAVE_KEY]);
  }
  function closeLateAdopt() { allowLateAdopt = false; }
  if (root.addEventListener) {
    setTimeout(function () {
      root.addEventListener('pointerdown', closeLateAdopt, true);
    }, 1000);
    setTimeout(closeLateAdopt, 8000);
  }

  function hydrate() {
    cloudOk = cloudMethodsPresent();
    refreshCloudState();
    var lsSeed = {};
    try { lsSeed = readLocalStorageAll(); } catch (e) { lsSeed = {}; }
    var xhsP = loadXhsSeed();
    function startCloud() {
      if (!cloudOk) return;
      mergeCloud().then(function () {}, function () {});
    }
    function afterSeed(xhsSeed, fromTimeout) {
      installStore(fromTimeout ? {} : (xhsSeed || {}), lsSeed);
      if (!syncStore) {
        var seed = {};
        try { seed = lsSeed; } catch (e) {}
        syncStore = wrapStore(memoryStore(seed));
        bootSaveStamp = stampFromStore();
      }
      if (fromTimeout) {
        xhsP.then(function (late) {
          mergeLateSeed(late);
          startCloud();
        }, function () { startCloud(); });
      } else {
        startCloud();
      }
    }
    return withTimeout(xhsP, SEED_WAIT_MS).then(function (r) {
      afterSeed(r && r.value, r && r.tag === 'timeout');
    }, function () {
      afterSeed({}, true);
    });
  }

  function mergeCloud() {
    return queryCloud().then(function (items) {
      var best = newestCloudItem(items);
      if (best && best.id) rememberCloudId(best.id);
      if (!best || best.content == null) {
        // empty cloud: if we have a local save, upload it (soon, not waiting the full throttle)
        try {
          if (syncStore && syncStore.getItem(SAVE_KEY)) scheduleCloudFlush(true);
        } catch (e) {}
        return;
      }
      var localRaw = null;
      try { localRaw = syncStore.getItem(SAVE_KEY); } catch (e) {}
      var cloudRaw = typeof best.content === 'string' ? best.content : JSON.stringify(best.content);
      if (shouldAdoptIncoming(cloudRaw, localRaw)) {
        adoptIntoLocal(cloudRaw);
        scheduleFlush(); // write-through to local caches; not a cloud dirty write
        applyLiveRestore(cloudRaw);
      } else if (isNewer(stampOf(localRaw), stampOf(best.content))) {
        scheduleCloudFlush(true);
      }
    }, function (err) {
      // query failure must NOT be treated as "no data"
      if (isUnauthorized(err) || errCodeOf(err) === 10003) disableCloud(err);
    });
  }

  probeClientVersion();
  var ready = hydrate().then(function () { refreshCloudState(); }, function () {
    if (!syncStore) syncStore = wrapStore(memoryStore());
    refreshCloudState();
  });

  // postNote（官方 §3.3）：唤起笔记发布页。无单独客户端版本门槛，以方法是否注入为准。
  // 字段：title≤20字，content≤1000字，pageType（photo_publish / video_publish / slides_edit 9.43+），
  // mediaInfo 必填，image_resources 1–18 张（url 为 data: 或 writeTempFile 路径）。
  // 文档没有话题/标签、也没有小工具卡片绑定字段；话题写入正文 #标签。
  // 成功只表示发布页被唤起且用户点了发布，不代表笔记过审。用户取消按失败静默处理。
  function postNoteAvailable() {
    return supports('postNote');
  }
  function writeTempFile(data) {
    if (!supports('writeTempFile') || !data) {
      return Promise.resolve(data);
    }
    return callMiniTimed('writeTempFile', { data: data }, 5000).then(function (r) {
      return (r && r.filePath) || data;
    }, function () { return data; });
  }
  function shareNote(opts) {
    opts = opts || {};
    if (!postNoteAvailable()) {
      return Promise.reject({ errCode: 0, errMsg: 'unsupported' });
    }
    var copy = root.PFNoteCopy || {};
    var title = opts.title != null ? String(opts.title) : String(copy.title || '');
    var content = opts.content != null ? String(opts.content) : String(copy.content || '');
    if (title.length > 20) title = title.slice(0, 20);
    if (content.length > 1000) content = content.slice(0, 1000);
    var media = opts.mediaInfo;
    var images = media && media.image_resources;
    var hasImg = images && images.length;
    var hasVid = media && media.video_resources;
    var hasLive = media && (media.live_photo_resources || media.live_photo_sources);
    if (!media || !(hasImg || hasVid || hasLive)) {
      return Promise.reject({ errCode: 0, errMsg: 'mediaInfo required' });
    }
    return callMiniTimed('postNote', {
      title: title,
      content: content,
      pageType: opts.pageType || copy.pageType || 'photo_publish',
      mediaInfo: media
    }, 15000);
  }

  var rewardDisabled = false;
  function rewardAvailable() {
    return REWARD_ENABLED && !rewardDisabled && supports('rewardAuthor');
  }
  function disableReward() {
    rewardDisabled = true;
    if (root.PFPlatform && root.PFPlatform.iap) root.PFPlatform.iap.tipsApi = false;
    if (root.dispatchEvent) root.dispatchEvent(new CustomEvent('pf:reward-unavailable'));
  }
  function tipAuthor() {
    if (!rewardAvailable()) {
      return Promise.reject({ errCode: 0, errMsg: 'unsupported' });
    }
    return callMiniTimed('rewardAuthor', undefined, 15000).then(function (r) { return r; }, function (err) {
      if (isCapabilityDenied(err)) disableReward();
      return Promise.reject(err);
    });
  }
  // share（官方 §3.18，9.53+，门槛 9530）：type=card 分享小工具卡片，身份由容器提供。
  // 仅全屏容器可用；成功只表示分享面板已拉起，不代表已经发出。无分享奖励。
  function shareAvailable() {
    return supports('share');
  }
  function shareCard() {
    if (!shareAvailable()) return Promise.reject({ errCode: 0, errMsg: 'unsupported' });
    return callMiniTimed('share', { type: 'card' }, 15000);
  }
  // saveImageToPhotosAlbum（官方 §3.4，9.42+，门槛 9420）：filePath 为 data: 或 writeTempFile 路径。
  function saveImageAvailable() {
    return supports('saveImageToPhotosAlbum');
  }
  function saveFarmImage(filePath) {
    if (!saveImageAvailable() || !filePath) {
      return Promise.reject({ errCode: 0, errMsg: 'unsupported' });
    }
    return callMiniTimed('saveImageToPhotosAlbum', { filePath: filePath }, 15000);
  }

  // 关注创作者：官方 3.15，客户端 9.51+（版本门槛 9510）。无业务参数，只能关注当前小工具作者。
  // follow_status: -1 失败 / 0 未关注（含未登录） / 1 已关注（含互关） / 2 作者本人。
  // followAuthor reject：20002 用户关闭确认或放弃登录；15404 当日确认次数达上限（10 次/账号/工具）；10003 已有确认框。
  // 业务失败以 follow_status -1 resolve，不是 reject。查询失败也当作 -1，不要把失败结果当最终状态缓存。
  var followDisabled = false;
  function creatorFollowAvailable() {
    return !followDisabled && supports('followAuthor') && supports('getFollowStatus');
  }
  function disableFollow() {
    followDisabled = true;
    if (root.dispatchEvent) root.dispatchEvent(new CustomEvent('pf:follow-unavailable'));
  }
  function getFollowStatus() {
    if (!creatorFollowAvailable()) return Promise.resolve(-1);
    return callMiniTimed('getFollowStatus', undefined, 5000).then(function (r) {
      return r && typeof r.follow_status === 'number' ? r.follow_status : -1;
    }, function (err) {
      if (isCapabilityDenied(err)) disableFollow();
      return -1;
    });
  }
  function followAuthor() {
    if (!creatorFollowAvailable()) {
      return Promise.reject({ errCode: 0, errMsg: 'unsupported' });
    }
    return callMiniTimed('followAuthor', undefined, 20000).then(function (r) {
      return r && typeof r.follow_status === 'number' ? r.follow_status : -1;
    }, function (err) {
      if (isCapabilityDenied(err)) disableFollow();
      return Promise.reject(err);
    });
  }

  var existing = root.PFPlatform || {};
  root.PFPlatform = {
    name: isXhs ? 'xhs' : 'web',
    isXhs: isXhs,
    ready: ready,
    store: function () { return syncStore; },
    albumStore: function () { return albumStore; },
    shareNote: shareNote,
    postNoteAvailable: postNoteAvailable,
    writeTempFile: writeTempFile,
    tipAuthor: tipAuthor,
    rewardAvailable: rewardAvailable,
    shareAvailable: shareAvailable,
    shareCard: shareCard,
    saveImageAvailable: saveImageAvailable,
    saveFarmImage: saveFarmImage,
    creatorFollow: {
      available: creatorFollowAvailable, // live; 方法缺失或运行时权限失败后为 false
      getStatus: getFollowStatus,
      follow: followAuthor
    },
    // 整包买断由小红书支付墙处理，进入工具即视为已解锁。道具级内购官方能力清单（2026-11-13）尚未公开。
    iap: { hostBuyout: true, itemApi: false, tipsApi: rewardAvailable() },
    supports: supports,
    clientVersion: clientVersion,
    probeClientVersion: probeClientVersion,
    callMiniTimed: callMiniTimed,
    flush: flushNow,
    keyMaxBytes: KEY_MAX,
    totalMaxBytes: TOTAL_MAX,
    cloud: refreshCloudState(),
    mobile: existing.mobile || false,
    framebuffer: existing.framebuffer,
    saveEveryMs: existing.saveEveryMs,
    followFarmer: existing.followFarmer,
    stageBox: existing.stageBox,
    toast: existing.toast,
    lifecycle: existing.lifecycle,
    chromeReady: existing.chromeReady,
    fbLocked: existing.fbLocked
  };
})(typeof window !== 'undefined' ? window : globalThis);
