/* 像素农场 · 平台适配层（网页 / 小红书小工具）
 * 网页里走 localStorage；小红书容器里优先用 window.xhs.miniTool 的 Storage API，
 * 并提供一份同步的 syncStore，给现有的 save.js / playlog.js / ui.js 用。
 * 买断付费由宿主支付墙处理，工具内没有商品内购 API；赞赏走 rewardAuthor。
 */
(function (root) {
  'use strict';
  var mini = root.xhs && root.xhs.miniTool;
  var isXhs = !!(mini && (typeof mini.setStorage === 'function' || typeof mini.getStorage === 'function'));

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
      setItem: function (k, v) { map[String(k)] = String(v); },
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
    var keys = Object.keys(dump);
    var i = 0;
    function next() {
      if (i >= keys.length) return;
      var key = keys[i++];
      var data = JSON.stringify(dump[key]);
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

  root.PFPlatform = {
    name: isXhs ? 'xhs' : 'web',
    isXhs: isXhs,
    ready: ready,
    store: function () { return syncStore; },
    shareNote: shareNote,
    tipAuthor: tipAuthor,
    // 整包买断由小红书支付墙处理，进入工具即视为已解锁。道具级内购官方能力清单（2026-11-13）尚未公开。
    iap: { hostBuyout: true, itemApi: false, tipsApi: !!(mini && mini.rewardAuthor) },
    flush: flushNow
  };
})(typeof window !== 'undefined' ? window : globalThis);
