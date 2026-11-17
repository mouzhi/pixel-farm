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

  function ico(id, kind, title, fn, label) {
    var b = doc.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'xhs-ico xhs-ico-' + kind;
    b.title = title;
    b.setAttribute('aria-label', title);
    var i = doc.createElement('i');
    i.setAttribute('aria-hidden', 'true');
    b.appendChild(i);
    if (label) {
      var lab = doc.createElement('span');
      lab.className = 'xhs-ico-lab';
      lab.textContent = label;
      b.appendChild(lab);
    }
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
    var bar = doc.createElement('div'); bar.id = 'xhs-bar';
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
    doc.body.appendChild(bar);
    doc.body.appendChild(toast);
    toastEl = toast;
    reparentSheets();

    bar.appendChild(ico('xhs-btn-bag', 'bag', '背包', function () {
      toggleEl(doc.getElementById('xhs-inv-dock'));
    }, '包'));
    bar.appendChild(ico('xhs-btn-store', 'store', '仓库', function () {
      var btn = doc.getElementById('storeBtn');
      closeSheets(doc.getElementById('store'));
      if (btn) btn.click();
      else toggleEl(doc.getElementById('store'));
      markIcons();
    }, '仓'));
    bar.appendChild(ico('xhs-btn-shop', 'shop', '商店', function () {
      var btn = doc.getElementById('shopBtn');
      closeSheets(doc.getElementById('shop'));
      if (btn) btn.click();
      else toggleEl(doc.getElementById('shop'));
      markIcons();
    }, '店'));
    var follow = ico('xhs-follow', 'follow', '跟随农夫', function () {
      setFollow(!P.followFarmer);
    }, '随');
    follow.classList.add('on');
    bar.appendChild(follow);
    bar.appendChild(ico('xhs-btn-author', 'author', '关注作者', onFollowCreator, '关'));
    bar.appendChild(ico('xhs-btn-board', 'board', '排行榜', function () {
      if (P.leaderboard && typeof P.leaderboard.open === 'function') P.leaderboard.open();
      markIcons();
    }, '榜'));
    var speed = ico('xhs-btn-speed', 'speed', '倍速', cycleSpeed, '倍');
    speed.hidden = true;
    bar.appendChild(speed);

    var noteBtn = ico('xhs-btn-note', 'note', '发笔记', onPostNote);
    doc.body.appendChild(noteBtn);
    setupFollow();
    setupPostNote();
    applyWindowInsets();
    if (root.__farm && __farm.fit) __farm.fit();
  }

  function applyWindowInsets() {
    var mini = root.xhs && root.xhs.miniTool;
    if (!mini || typeof mini.getWindowInfo !== 'function') return;
    Promise.resolve(mini.getWindowInfo()).then(function (info) {
      if (!info) return;
      var w = info.windowWidth || (doc.documentElement && doc.documentElement.clientWidth) || root.innerWidth || 0;
      var safe = info.safeArea || {};
      var mb = info.menuButtons || {};
      var topClear = Math.max(safe.top || 0, info.statusBarHeight || 0, 20) + 12;
      var leftClear = Math.max(safe.left || 0, 8);
      var rightClear = Math.max(w - (safe.right || w), 8);
      var btns = [mb.back, mb.me, mb.share];
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (!b) continue;
        topClear = Math.max(topClear, (b.bottom || 0) + 12);
        var cx = ((b.left || 0) + (b.right || 0)) / 2;
        if (cx < w / 2) leftClear = Math.max(leftClear, (b.right || 0) + 12);
        else rightClear = Math.max(rightClear, w - (b.left || 0) + 12);
      }
      // keep generous minima so we never sit under the capsule / share even if a rect is late or null
      topClear = Math.max(topClear, 96);
      leftClear = Math.max(leftClear, 72);
      rightClear = Math.max(rightClear, 108);
      var cap = mb.back || mb.me;
      var shareTop, shareRight;
      if (cap) {
        shareTop = (cap.bottom || 0) + 8;
        shareRight = Math.max(8, w - (cap.right || w));
      }
      var rootEl = doc.documentElement;
      rootEl.style.setProperty('--xhs-top-clear', Math.round(topClear) + 'px');
      rootEl.style.setProperty('--xhs-left-clear', Math.round(leftClear) + 'px');
      rootEl.style.setProperty('--xhs-right-clear', Math.round(rightClear) + 'px');
      if (shareTop != null) rootEl.style.setProperty('--xhs-share-top', Math.round(shareTop) + 'px');
      if (shareRight != null) rootEl.style.setProperty('--xhs-share-right', Math.round(shareRight) + 'px');
    }, function () {});
  }
  P.applyWindowInsets = applyWindowInsets;

  function setupPostNote() {
    var btn = doc.getElementById('xhs-btn-note');
    var host = !!(root.xhs && root.xhs.miniTool);
    var ok = P.postNoteAvailable ? P.postNoteAvailable() : !!(root.xhs && root.xhs.miniTool && typeof root.xhs.miniTool.postNote === 'function');
    if (host && !ok && btn) btn.hidden = true;
  }

  function canvasToJpeg(cv, quality) {
    if (!cv) return null;
    try {
      if (typeof cv.toDataURL === 'function') {
        var url = cv.toDataURL('image/jpeg', quality || 0.82);
        if (url && url.indexOf('data:image') === 0 && url.length > 100) return url;
      }
    } catch (e) {}
    return null;
  }

  function loadImageJpeg(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var c = doc.createElement('canvas');
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          if (!c.width || !c.height) { resolve(null); return; }
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(canvasToJpeg(c, 0.85));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function toNoteUrl(data) {
    if (!data) return Promise.resolve(null);
    if (P.writeTempFile) {
      return P.writeTempFile(data).then(function (p) { return p || data; }, function () { return data; });
    }
    return Promise.resolve(data);
  }

  var noteBusy = false;
  function onPostNote() {
    if (noteBusy) return;
    if (P.postNoteAvailable && !P.postNoteAvailable()) return;
    if (!P.shareNote) return;
    noteBusy = true;
    var copy = root.PFNoteCopy || {};
    var bundled = copy.images || [];
    var live = canvasToJpeg(doc.getElementById('game'), 0.82);
    var loads = bundled.map(loadImageJpeg);
    Promise.all(loads).then(function (shots) {
      var raw = [];
      if (live) raw.push(live);
      for (var i = 0; i < shots.length; i++) if (shots[i]) raw.push(shots[i]);
      if (!raw.length) { noteBusy = false; return; }
      var i2 = 0, urls = [];
      function next() {
        if (i2 >= raw.length) {
          if (!urls.length) { noteBusy = false; return; }
          P.shareNote({ mediaInfo: { image_resources: urls.map(function (u) { return { url: u }; }) } })
            .then(function () { noteBusy = false; }, function () { noteBusy = false; });
          return;
        }
        toNoteUrl(raw[i2++]).then(function (u) {
          if (u) urls.push(u);
          next();
        }, function () { next(); });
      }
      next();
    }, function () { noteBusy = false; });
  }
  P.onPostNote = onPostNote;

  var followBusy = false;
  P._followStatus = -1;

  function paintFollow(status) {
    if (typeof status !== 'number' || status < 0) return;
    P._followStatus = status;
    var on = status === 1 || status === 2;
    var title = status === 2 ? '你就是作者' : (on ? '已关注作者' : '关注作者');
    ['xhs-btn-author', 'xhs-board-follow'].forEach(function (id) {
      var b = doc.getElementById(id);
      if (!b) return;
      b.classList.toggle('on', on);
      b.title = title;
      b.setAttribute('aria-label', title);
    });
  }
  P.paintFollow = paintFollow;

  function onFollowCreator() {
    var api = P.creatorFollow;
    if (!api || !api.available) return;
    if (followBusy) return;
    followBusy = true;
    api.follow().then(function (s) {
      followBusy = false;
      paintFollow(s);
    }, function (err) {
      followBusy = false;
      var c = err && (err.errCode || err.code);
      if (c === 20002 || c === 10003) return;
      if (c === 15404) P.toast('今天关注次数用完了');
    });
  }
  P.onFollowCreator = onFollowCreator;

  function setupFollow() {
    var api = P.creatorFollow;
    var host = !!(root.xhs && root.xhs.miniTool);
    var btn = doc.getElementById('xhs-btn-author');
    if (host && !(api && api.available)) {
      if (btn) btn.hidden = true;
      return;
    }
    if (api && api.available) {
      api.getStatus().then(paintFollow, function () {});
    }
  }

  function wrapAngle(a) {
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function wirePinch() {
    var stage = doc.getElementById('xhs-stage') || doc.getElementById('game');
    if (!stage || stage._xhsGest) return;
    stage._xhsGest = true;
    var pts = {};
    var mode = null; // 'pinch' | 'rotate' | null (undecided)
    var last = null, start = null, lastZoom = 0, rotUsed = 0;
    var hasTouch = 'ontouchstart' in root;

    function pair() {
      var ids = Object.keys(pts);
      if (ids.length < 2) return null;
      var a = pts[ids[0]], b = pts[ids[1]];
      return {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x)
      };
    }
    function lockGame(on) {
      P.gestureLock = !!on;
      if (on) {
        try { doc.body.classList.remove('grab'); } catch (err) {}
        if (P.followFarmer) setFollow(false);
        var G = root.__farm;
        if (G && typeof G.cancelDrag === 'function') G.cancelDrag();
      }
    }
    function onStart(x, y, id) {
      pts[id] = { x: x, y: y };
      if (Object.keys(pts).length >= 2) {
        last = pair();
        start = last;
        lastZoom = root.__farm && __farm.getZoom ? __farm.getZoom() : 0;
        rotUsed = 0;
        mode = null;
        lockGame(true);
      }
    }
    function onMove(x, y, id, ev) {
      if (!pts[id]) return;
      pts[id] = { x: x, y: y };
      if (Object.keys(pts).length < 2 || !last) return;
      if (ev) {
        if (ev.cancelable && ev.preventDefault) ev.preventDefault();
        if (ev.stopPropagation) ev.stopPropagation();
      }
      var now = pair();
      if (!now || now.dist < 10 || !isFinite(now.angle) || !isFinite(last.angle)) return;
      var dAng = wrapAngle(now.angle - last.angle);
      var totScale = (start && start.dist > 8) ? now.dist / start.dist : 1;
      var totAng = start ? wrapAngle(now.angle - start.angle) : 0;
      var dScale = last.dist > 8 ? now.dist / last.dist : 1;

      if (!mode) {
        var scaleDev = Math.abs(Math.log(totScale) || 0);
        var angDev = Math.abs(totAng);
        if (scaleDev > 0.05 && scaleDev >= angDev * 0.65) mode = 'pinch';
        else if (angDev > (10 * Math.PI / 180) && angDev > scaleDev * 1.1) mode = 'rotate';
      }

      var G = root.__farm;
      // Pinch is applied from the gesture start (absolute steps) so a steady spread reliably changes zoom.
      // Do not wait for mode lock if the fingers have clearly scaled (rotate must not swallow pinch).
      var pinchLikely = !mode || mode === 'pinch' || Math.abs(Math.log(totScale) || 0) > 0.08;
      if (pinchLikely && G && G.setZoom && start && start.dist > 8) {
        var steps = Math.round(Math.log(totScale) / Math.log(1.18));
        if (steps) G.setZoom(lastZoom + steps);
      }
      var rotateLikely = mode === 'rotate' || (!mode && Math.abs(dAng) > 0.02 && Math.abs(dScale - 1) < 0.015);
      if (rotateLikely && G && G.cam) {
        var apply = dAng * 0.25;
        var cap = 3.5 * Math.PI / 180;
        if (apply > cap) apply = cap;
        if (apply < -cap) apply = -cap;
        var remain = 48 * Math.PI / 180 - Math.abs(rotUsed);
        if (remain < 0) remain = 0;
        if (Math.abs(apply) > remain) apply = remain * (apply < 0 ? -1 : 1);
        if (apply) {
          G.cam.ta += apply;
          rotUsed += apply;
        }
      }
      last = now;
    }
    function onEnd(id) {
      delete pts[id];
      if (Object.keys(pts).length < 2) {
        last = start = null;
        mode = null;
        rotUsed = 0;
        lockGame(false);
      }
    }

    var touchOpts = { passive: false, capture: true };
    stage.addEventListener('touchstart', function (e) {
      var list = e.changedTouches;
      for (var i = 0; i < list.length; i++) {
        onStart(list[i].clientX, list[i].clientY, 't' + list[i].identifier);
      }
      if (Object.keys(pts).length >= 2 && e.cancelable) e.preventDefault();
    }, touchOpts);
    stage.addEventListener('touchmove', function (e) {
      if (Object.keys(pts).length >= 2 || (e.touches && e.touches.length >= 2)) {
        if (e.cancelable) e.preventDefault();
      }
      var list = e.changedTouches;
      for (var i = 0; i < list.length; i++) {
        onMove(list[i].clientX, list[i].clientY, 't' + list[i].identifier, e);
      }
    }, touchOpts);
    function touchUp(e) {
      var list = e.changedTouches;
      for (var i = 0; i < list.length; i++) onEnd('t' + list[i].identifier);
    }
    stage.addEventListener('touchend', touchUp, touchOpts);
    stage.addEventListener('touchcancel', touchUp, touchOpts);

    // Pointer path for mouse / emulator; skip touch pointers when native touch events also fire (avoid double-counting).
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' && hasTouch) return;
      onStart(e.clientX, e.clientY, 'p' + e.pointerId);
    }, true);
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' && hasTouch) return;
      if (!pts['p' + e.pointerId]) return;
      onMove(e.clientX, e.clientY, 'p' + e.pointerId, e);
    }, true);
    function pointerUp(e) {
      if (e.pointerType === 'touch' && hasTouch) return;
      onEnd('p' + e.pointerId);
    }
    stage.addEventListener('pointerup', pointerUp, true);
    stage.addEventListener('pointercancel', pointerUp, true);

    function killGesture(e) { if (e.cancelable) e.preventDefault(); }
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
      root.addEventListener(type, killGesture, { passive: false, capture: true });
      doc.addEventListener(type, killGesture, { passive: false, capture: true });
    });
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
        applyWindowInsets();
        if (root.__farm && __farm.fit) __farm.fit();
      });
    }
    root.addEventListener('resize', function () {
      applyWindowInsets();
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
