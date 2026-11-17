/* 竖屏壳：全屏画面 + 像素图标叠加。网页版不加载。 */
(function (root) {
  'use strict';
  var P = root.PFPlatform || (root.PFPlatform = {});
  P.mobile = true;
  P.saveEveryMs = 30000;
  P.followFarmer = true;

  function chooseFramebuffer() {
    if (P.fbLocked) return P.framebuffer;
    var dpr = root.devicePixelRatio || 1;
    var cssW = root.innerWidth || 360;
    var cssH = root.innerHeight || 640;
    var vw = Math.max(1, Math.floor(cssW * dpr));
    var vh = Math.max(1, Math.floor(cssH * dpr));
    var scale = Math.max(1, Math.floor(vw / 220));
    var W = Math.max(160, Math.floor(vw / scale));
    var H = Math.max(160, Math.floor(vh / scale));
    P.framebuffer = { w: W, h: H, scale: scale };
    return P.framebuffer;
  }
  P.framebuffer = chooseFramebuffer();
  var settleChrome;
  P.chromeReady = new Promise(function (resolve) { settleChrome = resolve; });
  function lockFramebuffer() {
    chooseFramebuffer();
    P.fbLocked = true;
    if (settleChrome) { settleChrome(); settleChrome = null; }
  }

  var doc = document;
  doc.documentElement.classList.add('xhs-mobile');
  if (doc.body) doc.body.classList.add('xhs-mobile');

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

  function ico(id, kind, title, fn) {
    var b = doc.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'xhs-ico xhs-ico-' + kind;
    b.title = title;
    b.setAttribute('aria-label', title);
    var i = doc.createElement('i');
    i.setAttribute('aria-hidden', 'true');
    b.appendChild(i);
    b.addEventListener('click', fn);
    return b;
  }

  function reparentSheets() {
    ['shop', 'store', 'menu', 'offline', 'loveTip', 'speed'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el.parentNode !== doc.body) doc.body.appendChild(el);
    });
    ['log', 'catches', 'minimap', 'tools', 'say', 'rlabs', 'hud'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el.parentNode !== doc.body) doc.body.appendChild(el);
    });
  }

  function closeSheets(except) {
    ['shop', 'store', 'menu', 'xhs-board'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el !== except) el.hidden = true;
    });
    var dock = doc.getElementById('xhs-inv-dock');
    if (dock && except !== dock) dock.hidden = true;
    markIcons();
  }

  function markIcons() {
    var bag = doc.getElementById('xhs-btn-bag');
    var storeB = doc.getElementById('xhs-btn-store');
    var shopB = doc.getElementById('xhs-btn-shop');
    var boardB = doc.getElementById('xhs-btn-board');
    var followB = doc.getElementById('xhs-follow');
    var dock = doc.getElementById('xhs-inv-dock');
    var shop = doc.getElementById('shop');
    var store = doc.getElementById('store');
    var board = doc.getElementById('xhs-board');
    if (bag) bag.classList.toggle('on', !!(dock && !dock.hidden));
    if (storeB) storeB.classList.toggle('on', !!(store && !store.hidden));
    if (shopB) shopB.classList.toggle('on', !!(shop && !shop.hidden));
    if (boardB) boardB.classList.toggle('on', !!(board && !board.hidden));
    if (followB) followB.classList.toggle('on', !!P.followFarmer);
  }
  P._markTabs = markIcons;

  function toggleEl(el) {
    if (!el) return;
    var open = el.hidden;
    closeSheets(open ? el : null);
    el.hidden = !open;
    markIcons();
  }

  function setFollow(on) {
    P.followFarmer = !!on;
    markIcons();
  }

  function syncSpeedBtn() {
    var btn = doc.getElementById('xhs-btn-speed');
    if (!btn) return;
    var S = root.__farm && __farm.S;
    var max = S && S.eff ? S.eff.speedMax : 1;
    btn.hidden = !(max > 1);
    var cur = (S && S.speed) || 1;
    var em = btn.querySelector('em');
    if (!em) { em = doc.createElement('em'); btn.appendChild(em); }
    em.textContent = cur + '×';
    btn.classList.toggle('on', cur > 1);
  }

  function cycleSpeed() {
    var G = root.__farm;
    if (!G || !G.setGameSpeed || !G.S) return;
    var max = G.S.eff.speedMax || 1;
    var opts = [1, 2, 4].filter(function (v) { return v <= max; });
    if (!opts.length) return;
    var i = opts.indexOf(G.S.speed || 1);
    G.setGameSpeed(opts[(i + 1) % opts.length]);
    syncSpeedBtn();
  }

  function compactHud() {
    var day = doc.getElementById('day');
    if (day) {
      var t = day.textContent || '';
      var i = t.indexOf(' · ');
      if (i > 0) day.textContent = t.slice(0, i);
    }
    var coins = doc.getElementById('coins');
    if (coins && coins.parentElement && !coins.parentElement.classList.contains('xhs-coins')) {
      coins.parentElement.classList.add('xhs-coins');
    }
  }

  function buildChrome() {
    if (doc.getElementById('xhs-stage')) return;
    var stage = doc.createElement('div'); stage.id = 'xhs-stage';
    var dockInv = doc.createElement('div'); dockInv.id = 'xhs-inv-dock'; dockInv.hidden = true;
    var dock = doc.createElement('div'); dock.id = 'xhs-dock';
    var corner = doc.createElement('div'); corner.id = 'xhs-corner';
    var toast = doc.createElement('div'); toast.id = 'xhs-toast'; toast.hidden = true;
    var wrap = doc.getElementById('wrap');
    var hud = doc.getElementById('hud');
    var inv = doc.getElementById('inv');
    if (wrap) {
      doc.body.insertBefore(stage, wrap);
      stage.appendChild(wrap);
    } else doc.body.appendChild(stage);
    if (hud && hud.parentNode !== doc.body) doc.body.appendChild(hud);
    if (inv) dockInv.appendChild(inv);
    doc.body.appendChild(dockInv);
    doc.body.appendChild(dock);
    doc.body.appendChild(corner);
    doc.body.appendChild(toast);
    toastEl = toast;
    reparentSheets();

    dock.appendChild(ico('xhs-btn-bag', 'bag', '背包', function () {
      toggleEl(doc.getElementById('xhs-inv-dock'));
    }));
    dock.appendChild(ico('xhs-btn-store', 'store', '仓库', function () {
      var btn = doc.getElementById('storeBtn');
      closeSheets(doc.getElementById('store'));
      if (btn) btn.click();
      else toggleEl(doc.getElementById('store'));
      markIcons();
    }));
    dock.appendChild(ico('xhs-btn-shop', 'shop', '商店', function () {
      var btn = doc.getElementById('shopBtn');
      closeSheets(doc.getElementById('shop'));
      if (btn) btn.click();
      else toggleEl(doc.getElementById('shop'));
      markIcons();
    }));

    var follow = ico('xhs-follow', 'follow', '跟随农夫', function () {
      setFollow(!P.followFarmer);
    });
    follow.classList.add('on');
    doc.body.appendChild(follow);

    corner.appendChild(ico('xhs-btn-board', 'board', '排行榜', function () {
      if (P.leaderboard && typeof P.leaderboard.open === 'function') P.leaderboard.open();
      markIcons();
    }));
    var speed = ico('xhs-btn-speed', 'speed', '倍速', cycleSpeed);
    speed.hidden = true;
    corner.appendChild(speed);

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
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2
      };
    }
    var last = null, lastZoom = 0;
    function cancelFollow() { if (P.followFarmer) setFollow(false); }
    cv.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() >= 2) {
        last = pair();
        lastZoom = root.__farm && __farm.getZoom ? __farm.getZoom() : 0;
        cancelFollow();
        // stop the game's one-finger drag from fighting the pinch/twist
        if (root.__farm) try { doc.body.classList.remove('grab'); } catch (err) {}
      }
    }, true);
    cv.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() < 2 || !last) return;
      e.stopPropagation();
      var now = pair();
      if (!now || now.dist < 8) return;
      var G = root.__farm;
      if (G && G.cam && isFinite(now.angle) && isFinite(last.angle)) {
        var dAng = now.angle - last.angle;
        if (dAng > Math.PI) dAng -= Math.PI * 2;
        if (dAng < -Math.PI) dAng += Math.PI * 2;
        G.cam.ta += dAng;
      }
      if (G && G.setZoom && last.dist > 8) {
        var dz = Math.round(Math.log(now.dist / last.dist) / Math.log(1.25));
        if (dz) G.setZoom(lastZoom + dz);
      }
    }, true);
    function up(e) {
      delete pointers[e.pointerId];
      if (count() < 2) last = null;
    }
    cv.addEventListener('pointerup', up, true);
    cv.addEventListener('pointercancel', up, true);
  }

  function hookFollowPause() {
    var cv = doc.getElementById('game');
    if (!cv || cv._xhsFollow) return;
    cv._xhsFollow = true;
    cv.addEventListener('pointermove', function () {
      if (doc.body.classList.contains('grab') && P.followFarmer) setFollow(false);
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
    if (!P.fbLocked) chooseFramebuffer();
    if (root.__farm && __farm.fit) __farm.fit();
    compactHud();
    syncSpeedBtn();
    if (root.visualViewport) {
      visualViewport.addEventListener('resize', function () {
        if (root.__farm && __farm.fit) __farm.fit();
      });
    }
    root.addEventListener('resize', function () {
      if (root.__farm && __farm.fit) __farm.fit();
    });
    root.addEventListener('orientationchange', function () {
      setTimeout(function () { if (root.__farm && __farm.fit) __farm.fit(); }, 80);
    });
  }

  function afterLayout(fn) {
    if (root.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(fn); });
    else setTimeout(fn, 0);
  }
  function startChrome() {
    bootUi();
    afterLayout(function () { if (!P.fbLocked) lockFramebuffer(); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', startChrome);
  else startChrome();

  var n = 0;
  var iv = setInterval(function () {
    n++;
    if (doc.getElementById('hud') && !doc.getElementById('xhs-stage')) bootUi();
    if (doc.getElementById('game')) { wirePinch(); hookFollowPause(); hookSaves(); }
    reparentSheets();
    compactHud();
    syncSpeedBtn();
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
      compactHud();
      syncSpeedBtn();
      if (n > 80) clearInterval(iv);
    }
  }, 50);
  setTimeout(function () { if (!P.fbLocked) lockFramebuffer(); }, 400);
})(typeof window !== 'undefined' ? window : globalThis);
