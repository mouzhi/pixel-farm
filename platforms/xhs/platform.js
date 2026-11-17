/* 像素农场 · 平台适配层（网页 / 小红书小工具）
 * 网页里走 localStorage；小红书容器里优先用 window.xhs.miniTool 的 Storage API，
 * 并提供一份同步的 syncStore，给现有的 save.js / playlog.js / ui.js 用。
 * 买断付费由宿主支付墙处理，工具内没有商品内购 API；赞赏走 rewardAuthor。
 */
(function (root) {
  'use strict';
  var mini = root.xhs && root.xhs.miniTool;
  var isXhs = !!(mini && (typeof mini.setStorage === 'function' || typeof mini.getStorage === 'function'));
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

  function flushNow() {
    flushTimer = null;
    if (!mini || typeof mini.setStorage !== 'function' || !syncStore) return;
    var dump = syncStore._dump();
    var keys = Object.keys(dump).sort(function (a, b) {
      var ab = /:bak$/.test(a), bb = /:bak$/.test(b);
      if (ab !== bb) return ab ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    var i = 0;
    function next() {
      if (i >= keys.length) return;
      var key = keys[i++];
      var data = JSON.stringify(dump[key]);
      if (utf8Bytes(data) > KEY_MAX) { onStoreError('同步失败：' + key + ' 超过 1MB'); return next(); }
      var req = mini.setStorage({ key: key, data: data });
      if (req && typeof req.then === 'function') req.then(next, next);
      else next();
    }
    next();
  }

  function scheduleFlush() {
    if (!isXhs) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushNow, 400);
  }

  function wrapStore(store) {
    return {
      get length() { return store.length; },
      key: function (i) { return store.key(i); },
      getItem: function (k) { return store.getItem(k); },
      setItem: function (k, v) { store.setItem(k, v); scheduleFlush(); },
      removeItem: function (k) { store.removeItem(k); scheduleFlush(); },
      clear: function () { store.clear(); scheduleFlush(); },
      _dump: function () { return store._dump ? store._dump() : {}; }
    };
  }

  function hydrate() {
    if (!isXhs || typeof mini.getStorageInfo !== 'function') {
      syncStore = wrapStore(memoryStore());
      // 网页或旧客户端：直接用 localStorage，并在内存里留一份空壳以免调用方判空
      try {
        if (root.localStorage) {
          syncStore = wrapStore({
            get length() { return root.localStorage.length; },
            key: function (i) { return root.localStorage.key(i); },
            getItem: function (k) { return root.localStorage.getItem(k); },
            setItem: function (k, v) { root.localStorage.setItem(k, v); },
            removeItem: function (k) { root.localStorage.removeItem(k); },
            clear: function () { root.localStorage.clear(); },
            _dump: function () { return {}; }
          });
        }
      } catch (e) { /* private mode */ }
      return Promise.resolve();
    }
    return mini.getStorageInfo().then(function (info) {
      var keys = (info && info.keys) || [];
      var seed = {};
      var i = 0;
      function next() {
        if (i >= keys.length) {
          syncStore = wrapStore(memoryStore(seed));
          return;
        }
        var key = keys[i++];
        return mini.getStorage({ key: key }).then(function (res) {
          if (res && typeof res.data === 'string') {
            try { seed[key] = JSON.parse(res.data); }
            catch (e) { seed[key] = res.data; }
          }
          return next();
        }, function () { return next(); });
      }
      return next();
    }, function () {
      syncStore = wrapStore(memoryStore());
    });
  }

  var ready = hydrate();

  function shareNote(opts) {
    opts = opts || {};
    if (!mini || typeof mini.postNote !== 'function') {
      return Promise.reject(new Error('当前环境不能发笔记'));
    }
    return mini.postNote({
      title: opts.title || '像素农场',
      content: opts.content || '',
      pageType: 'photo_publish',
      mediaInfo: opts.mediaInfo || { image_resources: opts.images || [] }
    });
  }

  function tipAuthor() {
    if (!mini || typeof mini.rewardAuthor !== 'function') {
      return Promise.reject(new Error('当前环境暂不支持赞赏'));
    }
    return mini.rewardAuthor();
  }

  function probeCloud() {
    var out = {
      usable: false,
      reason: '云存储是 9.51+ 内测，官方写明不要作为存档唯一依赖；单条 content 上限 64KB，完整后期存档可能超限，本游戏不以它为源。'
    };
    if (!mini) { out.reason = '当前环境没有 window.xhs.miniTool'; return out; }
    var methods = ['addCloudStorage', 'updateCloudStorage', 'queryCloudStorage', 'removeCloudStorage'];
    out.methods = {};
    methods.forEach(function (m) { out.methods[m] = typeof mini[m] === 'function'; });
    out.present = methods.some(function (m) { return out.methods[m]; });
    if (!out.present) out.reason = '当前容器未注入云存储 API（或客户端低于 9.51）';
    return out;
  }

  var existing = root.PFPlatform || {};
  root.PFPlatform = {
    name: isXhs ? 'xhs' : 'web',
    isXhs: isXhs,
    ready: ready,
    store: function () { return syncStore; },
    shareNote: shareNote,
    tipAuthor: tipAuthor,
    // 整包买断由小红书支付墙处理，进入工具即视为已解锁。道具级内购官方能力清单（2026-11-13）尚未公开。
    iap: { hostBuyout: true, itemApi: false, tipsApi: !!(mini && mini.rewardAuthor) },
    flush: flushNow,
    keyMaxBytes: KEY_MAX,
    totalMaxBytes: TOTAL_MAX,
    cloud: probeCloud(),
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
