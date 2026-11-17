/* 竖屏手机壳：在 game.js 之前运行，打开 mobile 旗标，并在 DOM 上排版。网页版不加载本文件。 */
(function (root) {
  'use strict';
  var P = root.PFPlatform || (root.PFPlatform = {});
  P.mobile = true;
  P.framebuffer = { w: 240, h: 426 }; // ~9:16 low-res buffer, integer-upscaled
  P.saveEveryMs = 30000;
  P.followFarmer = true;

  var doc = document;
  doc.documentElement.classList.add('xhs-mobile');
  if (doc.body) doc.body.classList.add('xhs-mobile');

  function cssPx(el, prop) {
    if (!el) return 0;
    return parseFloat(root.getComputedStyle(el)[prop]) || 0;
  }

  P.stageBox = function () {
    var stage = doc.getElementById('xhs-stage');
    if (!stage) return { left: 0, top: 0, w: innerWidth, h: innerHeight };
    var r = stage.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  };

  var toastEl = null, toastT = 0;
  P.toast = function (msg) {
    if (!toastEl) {
      toastEl = doc.getElementById('xhs-toast');
      if (!toastEl) {
        toastEl = doc.createElement('div');
        toastEl.id = 'xhs-toast';
        doc.body.appendChild(toastEl);
      }
    }
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.hidden = true; }, 2800);
  };

  function measureChrome() {
    var top = doc.getElementById('xhs-top');
    var tabs = doc.getElementById('xhs-tabs');
    var th = top ? Math.ceil(top.getBoundingClientRect().height) : 56;
    var bh = tabs ? Math.ceil(tabs.getBoundingClientRect().height) : 64;
    doc.documentElement.style.setProperty('--xhs-top-h', th + 'px');
    doc.documentElement.style.setProperty('--xhs-tab-h', bh + 'px');
  }

  function reparentSheets() {
    ['shop', 'store', 'menu', 'offline', 'loveTip', 'speed'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el.parentNode !== doc.body) doc.body.appendChild(el);
    });
  }

  function buildChrome() {
    if (doc.getElementById('xhs-top')) return;
    var top = doc.createElement('div'); top.id = 'xhs-top';
    var stage = doc.createElement('div'); stage.id = 'xhs-stage';
    var tabs = doc.createElement('div'); tabs.id = 'xhs-tabs';
    var fab = doc.createElement('div'); fab.id = 'xhs-fab';
    var toast = doc.createElement('div'); toast.id = 'xhs-toast'; toast.hidden = true;
    var hud = doc.getElementById('hud');
    var wrap = doc.getElementById('wrap');
    doc.body.insertBefore(top, wrap);
    if (hud) top.appendChild(hud);
    doc.body.insertBefore(stage, wrap);
    if (wrap) stage.appendChild(wrap);
    doc.body.appendChild(tabs);
    doc.body.appendChild(fab);
    doc.body.appendChild(toast);
    toastEl = toast;
    reparentSheets();

    function tab(id, label, fn) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.id = id;
      b.textContent = label;
      b.addEventListener('click', fn);
      tabs.appendChild(b);
      return b;
    }
    var shop = doc.getElementById('shop');
    var store = doc.getElementById('store');
    var menu = doc.getElementById('menu');
    var speed = doc.getElementById('speed');
    function closeSheets(except) {
      [shop, store, menu].forEach(function (el) {
        if (el && el !== except) el.hidden = true;
      });
      markTabs();
    }
    function toggle(el) {
      if (!el) return;
      var open = el.hidden;
      closeSheets(open ? el : null);
      el.hidden = !open;
      markTabs();
    }
    tab('tabShop', '商店', function () {
      var btn = doc.getElementById('shopBtn');
      if (btn) btn.click();
      else toggle(shop);
      markTabs();
    });
    tab('tabStore', '仓库', function () {
      var btn = doc.getElementById('storeBtn');
      if (btn) btn.click();
      else toggle(store);
      markTabs();
    });
    tab('tabSave', '存档', function () {
      var btn = doc.getElementById('menuBtn');
      if (btn) btn.click();
      else toggle(menu);
      markTabs();
    });
    var tabSpeed = tab('tabSpeed', '倍速', function () {
      if (speed && speed.hidden) { P.toast && P.toast('商店买了加速之后才能用'); return; }
      if (speed) {
        // reveal the existing speed buttons as a small sheet above the tabs
        speed.style.display = speed.style.display === 'flex' ? 'none' : 'flex';
        speed.style.position = 'fixed';
        speed.style.left = '8px';
        speed.style.right = '8px';
        speed.style.bottom = 'calc(var(--xhs-tab-h, 64px) + 8px)';
        speed.style.zIndex = '23';
        speed.style.gap = '8px';
        speed.style.justifyContent = 'center';
      }
    });
    tab('tabMenu', '菜单', function () {
      var mapBtn = doc.getElementById('mapBtn');
      if (mapBtn) mapBtn.click();
      else {
        var mm = doc.getElementById('minimap');
        if (mm) mm.hidden = !mm.hidden;
      }
      markTabs();
    });

    function markTabs() {
      var map = [
        ['tabShop', shop],
        ['tabStore', store],
        ['tabSave', menu]
      ];
      map.forEach(function (pair) {
        var b = doc.getElementById(pair[0]);
        if (b) b.classList.toggle('on', pair[1] && !pair[1].hidden);
      });
      var menuTab = doc.getElementById('tabMenu');
      var mm = doc.getElementById('minimap');
      if (menuTab) menuTab.classList.toggle('on', !!(mm && !mm.hidden));
      var fab = doc.getElementById('xhs-fab');
      var sheetOpen = (shop && !shop.hidden) || (store && !store.hidden) || (menu && !menu.hidden);
      if (fab) fab.hidden = !!sheetOpen;
    }
    P._markTabs = markTabs;

    function fabBtn(label, fn) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'pbtn';
      b.textContent = label;
      b.addEventListener('click', fn);
      fab.appendChild(b);
      return b;
    }
    var followBtn = fabBtn('跟随', function () {
      P.followFarmer = !P.followFarmer;
      followBtn.classList.toggle('on', !!P.followFarmer);
      followBtn.textContent = P.followFarmer ? '跟随中' : '跟随';
    });
    followBtn.classList.add('on');
    followBtn.textContent = '跟随中';
    fabBtn('回家', function () {
      P.followFarmer = false;
      followBtn.classList.remove('on');
      followBtn.textContent = '跟随';
      if (root.__farm && __farm.homeCam) __farm.homeCam();
    });
    fabBtn('左转', function () {
      if (root.__farm && __farm.cam) __farm.cam.ta -= Math.PI / 2;
    });
    fabBtn('右转', function () {
      if (root.__farm && __farm.cam) __farm.cam.ta += Math.PI / 2;
    });

    measureChrome();
    if (root.__farm && __farm.fit) __farm.fit();
  }

  function wirePinch() {
    var cv = doc.getElementById('game');
    if (!cv || cv._xhsPinch) return;
    cv._xhsPinch = true;
    var pointers = {};
    function count() { return Object.keys(pointers).length; }
    function pair() {
      var ids = Object.keys(pointers);
      if (ids.length < 2) return null;
      var a = pointers[ids[0]], b = pointers[ids[1]];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
    var last = null, lastZoom = 0;
    cv.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() >= 2) {
        last = pair();
        lastZoom = root.__farm && __farm.getZoom ? __farm.getZoom() : 0;
        P.followFarmer = false;
        var fb = doc.querySelector('#xhs-fab button');
        if (fb) { fb.classList.remove('on'); fb.textContent = '跟随'; }
      }
    }, true);
    cv.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() >= 2 && last && root.__farm && __farm.setZoom) {
        var now = pair();
        if (now && last.dist > 8) {
          var steps = Math.round(Math.log(now.dist / last.dist) / Math.log(1.25));
          if (steps) __farm.setZoom(lastZoom + steps);
        }
      }
    }, true);
    function up(e) { delete pointers[e.pointerId]; if (count() < 2) last = null; }
    cv.addEventListener('pointerup', up, true);
    cv.addEventListener('pointercancel', up, true);
    // panning already exists; a one-finger drag should stop follow
    cv.addEventListener('pointerdown', function () {
      /* follow is paused only after the existing drag marks itself moved — hooked below */
    });
  }

  function hookFollowPause() {
    var cv = doc.getElementById('game');
    if (!cv || cv._xhsFollow) return;
    cv._xhsFollow = true;
    cv.addEventListener('pointermove', function (e) {
      if (e.buttons || (e.pointerType === 'touch')) {
        // if the game set body.grab, the player is panning
        if (doc.body.classList.contains('grab') && P.followFarmer) {
          P.followFarmer = false;
          var btns = doc.querySelectorAll('#xhs-fab button');
          if (btns[0]) { btns[0].classList.remove('on'); btns[0].textContent = '跟随'; }
        }
      }
    });
  }

  function hookSaves() {
    function hideSave() {
      if (root.__farm && __farm.saveNow) __farm.saveNow();
      if (P.flush) P.flush();
    }
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) hideSave(); });
    root.addEventListener('pagehide', hideSave);
    root.addEventListener('freeze', hideSave);
    // official capability list (2026-11-13) has no onHide/onShow lifecycle hook; probe anyway
    var mini = root.xhs && root.xhs.miniTool;
    P.lifecycle = { onHide: !!(mini && (mini.onHide || mini.onAppHide || mini.onUnload)) };
    if (mini && typeof mini.onHide === 'function') {
      try { mini.onHide(hideSave); } catch (e) {}
    }
    root.addEventListener('pf:save-error', function (e) {
      var err = (e.detail && e.detail.error) || '存档失败';
      P.toast('存档没写上：' + err);
    });
  }

  function bootUi() {
    if (!doc.body) return;
    doc.body.classList.add('xhs-mobile');
    buildChrome();
    wirePinch();
    hookFollowPause();
    hookSaves();
    measureChrome();
    if (root.__farm && __farm.fit) __farm.fit();
    if (root.visualViewport) {
      visualViewport.addEventListener('resize', function () {
        measureChrome();
        if (root.__farm && __farm.fit) __farm.fit();
      });
    }
    root.addEventListener('resize', function () {
      measureChrome();
      if (root.__farm && __farm.fit) __farm.fit();
    });
    root.addEventListener('orientationchange', function () {
      setTimeout(function () {
        measureChrome();
        if (root.__farm && __farm.fit) __farm.fit();
      }, 80);
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bootUi);
  else bootUi();
  // game.js loads later via boot.js; retry chrome wiring after it appears
  var n = 0;
  var iv = setInterval(function () {
    n++;
    if (doc.getElementById('hud') && !doc.getElementById('xhs-top')) bootUi();
    if (doc.getElementById('game')) { wirePinch(); hookFollowPause(); hookSaves(); }
    reparentSheets();
    var mm = doc.getElementById('minimap');
    if (mm && !mm._xhsDefaulted) {
      mm._xhsDefaulted = true;
      var pref = null;
      try { pref = P.store && P.store() && P.store().getItem('mouzhi/pixel-farm:ui:map'); } catch (e) {}
      if (pref !== '1') mm.hidden = true;
    }
    if ((root.__farm && root.__farm.fit) || n > 80) {
      bootUi();
      if (root.__farm && __farm.fit) __farm.fit();
      if (n > 80) clearInterval(iv);
    }
  }, 50);
})(typeof window !== 'undefined' ? window : globalThis);
