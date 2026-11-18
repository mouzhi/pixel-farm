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

  var toastEl = null, toastT = 0, toastFadeT = 0, lastToastSrc = '';
  function fillToast(el) {
    if (!el || el.querySelector('.xhs-toast-text')) return el;
    el.textContent = '';
    var back = doc.createElement('span');
    back.className = 'xhs-toast-back';
    back.setAttribute('aria-hidden', 'true');
    var text = doc.createElement('span');
    text.className = 'xhs-toast-text';
    el.appendChild(back);
    el.appendChild(text);
    return el;
  }
  function ensureToast() {
    if (toastEl && toastEl.parentNode) return fillToast(toastEl);
    toastEl = doc.getElementById('xhs-toast');
    if (!toastEl) {
      toastEl = doc.createElement('div');
      toastEl.id = 'xhs-toast';
      (doc.body || doc.documentElement).appendChild(toastEl);
    }
    return fillToast(toastEl);
  }
  function placeToast() {
    var el = ensureToast();
    var hud = doc.getElementById('hud');
    if (!el || !hud) return;
    var r = hud.getBoundingClientRect();
    if (r.height) el.style.top = Math.round(r.bottom + 14) + 'px';
  }
  P.toast = function (msg) {
    if (!msg) return;
    var el = ensureToast();
    el.hidden = false;
    var textEl = el.querySelector('.xhs-toast-text') || el;
    textEl.textContent = msg;
    placeToast();
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastT);
    clearTimeout(toastFadeT);
    toastT = setTimeout(function () { el.classList.remove('show'); }, 3000);
  };
  // 点按反馈（「正在打开分享…」「金币还差 80」）优先于农场日志，2.4 秒内不被日志顶掉。
  var noticeUntil = 0;
  P.notice = function (msg) {
    noticeUntil = Date.now() + 2400;
    P.toast(msg);
  };
  function toastLog(raw) {
    var msg = String(raw || '').replace(/^\d{1,2}:\d{2}\s+/, '').trim();
    if (Date.now() < noticeUntil) return;
    if (!msg || msg === lastToastSrc) return;
    lastToastSrc = msg;
    P.toast(msg);
  }
  function wireLogToast() {
    if (P._logToast) return;
    P._logToast = true;
    var lastLine = '';
    root.addEventListener('pf:say', function (e) {
      if (e && e.detail) toastLog(e.detail);
    });
    function check() {
      var S = root.__farm && __farm.S;
      var line = S && S.log && S.log[0];
      if (line && line !== lastLine) {
        lastLine = line;
        toastLog(line);
      }
      placeToast();
    }
    setInterval(check, 400);
    check();
  }

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
    if (typeof fn === 'function') b.addEventListener('click', fn);
    return b;
  }

  function isOpen(el) { return !!(el && !el.hidden); }
  // 1.1.1：底栏「仓库」第二次点按关不上。ui.js 在 window 的 pointerdown 里先把仓库收起，
  // 随后的 click 又把它切回打开，看起来就是按钮没反应。这里在按钮自己的 pointerdown/touchstart
  // （早于 window 冒泡）记下按下那一刻面板是否开着，click 时按这个状态决定开还是关。
  function sheetIco(id, kind, title, sheetId, webBtnId) {
    var b = ico(id, kind, title, function () {
      var sheet = doc.getElementById(sheetId);
      var wasOpen = b._wasOpen != null ? b._wasOpen : isOpen(sheet);
      b._wasOpen = null;
      if (!sheet && !webBtnId) return;
      if (wasOpen) {
        closeSheets(null);
        if (sheet) sheet.hidden = true;
        markIcons();
        return;
      }
      closeSheets(sheet);
      var web = webBtnId && doc.getElementById(webBtnId);
      if (sheet && !sheet.hidden) { markIcons(); return; }
      if (web) web.click();
      if (sheet && sheet.hidden) sheet.hidden = false;
      markIcons();
    });
    function remember() {
      // pointerdown 先到，touchstart 后到（那时 ui.js 已经把面板收起）；只认同一次按下的第一个事件
      if (b._wasOpen != null && Date.now() - (b._wasAt || 0) < 600) return;
      b._wasAt = Date.now();
      b._wasOpen = isOpen(doc.getElementById(sheetId));
      clearTimeout(b._wasT);
      b._wasT = setTimeout(function () { b._wasOpen = null; }, 1200);
    }
    b.addEventListener('pointerdown', remember);
    b.addEventListener('touchstart', remember, { passive: true });
    return b;
  }

  function reparentSheets() {
    ['shop', 'store', 'codex', 'menu', 'offline', 'loveTip', 'speed'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (!el || el.parentNode === doc.body) return;
      if (id === 'codex' && el.closest && el.closest('#xhs-board')) return;
      doc.body.appendChild(el);
    });
    ['log', 'catches', 'minimap', 'tools', 'say', 'rlabs', 'hud'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el.parentNode !== doc.body) doc.body.appendChild(el);
    });
  }

  function closeSheets(except) {
    var board = doc.getElementById('xhs-board');
    if (board && board !== except && P.leaderboard && typeof P.leaderboard.close === 'function') {
      P.leaderboard.close();
    }
    ['shop', 'store', 'codex', 'menu', 'xhs-board'].forEach(function (id) {
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
    var wood = doc.getElementById('wood');
    var woodHud = doc.getElementById('woodHud') || (wood && wood.parentElement);
    if (woodHud && !woodHud.classList.contains('xhs-wood')) woodHud.classList.add('xhs-wood');
    placeSheets();
  }

  function parsePx(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function placeSheets() {
    var hud = doc.getElementById('hud');
    if (!hud) return;
    var r = hud.getBoundingClientRect();
    if (!(r.height > 0)) return;
    var rootEl = doc.documentElement;
    rootEl.style.setProperty('--xhs-sheet-top', Math.round(r.bottom + 8) + 'px');
    var navBottom = parsePx(rootEl.style.getPropertyValue('--xhs-nav-bottom'));
    var sideTop = Math.max(r.bottom + 8, navBottom || 0);
    rootEl.style.setProperty('--xhs-share-top', Math.round(sideTop) + 'px');
  }

  function buildChrome() {
    if (doc.getElementById('xhs-stage')) return;
    var stage = doc.createElement('div'); stage.id = 'xhs-stage';
    var dockInv = doc.createElement('div'); dockInv.id = 'xhs-inv-dock'; dockInv.hidden = true;
    var bar = doc.createElement('div'); bar.id = 'xhs-bar';
    var toast = doc.createElement('div'); toast.id = 'xhs-toast';
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

    bar.appendChild(sheetIco('xhs-btn-bag', 'bag', '背包', 'xhs-inv-dock', null));
    bar.appendChild(sheetIco('xhs-btn-store', 'store', '仓库', 'store', 'storeBtn'));
    bar.appendChild(sheetIco('xhs-btn-shop', 'shop', '商店', 'shop', 'shopBtn'));
    var follow = ico('xhs-follow', 'follow', '跟随农夫', function () {
      setFollow(!P.followFarmer);
    });
    follow.classList.add('on');
    bar.appendChild(follow);
    bar.appendChild(ico('xhs-btn-author', 'author', '关注作者', onFollowCreator));
    bar.appendChild(ico('xhs-btn-board', 'board', '图鉴', function () {
      var board = doc.getElementById('xhs-board');
      if (board && !board.hidden && P.leaderboard && typeof P.leaderboard.close === 'function') P.leaderboard.close();
      else if (P.leaderboard && typeof P.leaderboard.open === 'function') P.leaderboard.open();
      markIcons();
    }));

    var side = doc.createElement('div'); side.id = 'xhs-side';
    side.appendChild(ico('xhs-btn-note', 'note', '发笔记', onPostNote));
    var speed = ico('xhs-btn-speed', 'speed', '倍速', cycleSpeed);
    speed.hidden = true;
    side.appendChild(speed);
    var music = ico('xhs-btn-music', 'music', '音乐', toggleMusic);
    var sfx = ico('xhs-btn-sfx', 'sfx', '音效', toggleSfx);
    music.classList.add('off');
    sfx.classList.add('off');
    side.appendChild(music);
    side.appendChild(sfx);
    var moreWrap = doc.createElement('div'); moreWrap.id = 'xhs-more-wrap';
    var moreMenu = doc.createElement('div'); moreMenu.id = 'xhs-more-menu'; moreMenu.hidden = true;
    moreMenu.appendChild(ico('xhs-btn-share', 'share', '分享小工具', onShareCard));
    moreMenu.appendChild(ico('xhs-btn-save', 'save', '保存农场图', onSaveFarm));
    moreMenu.appendChild(ico('xhs-btn-tip', 'tip', '赞赏作者', onTipAuthor));
    moreWrap.appendChild(moreMenu);
    moreWrap.appendChild(ico('xhs-btn-more', 'more', '更多', toggleMore));
    side.appendChild(moreWrap);
    doc.body.appendChild(side);
    setupFollow();
    // 容器可能晚于脚本注入 window.xhs，或客户端版本要异步拿到：稍后再核对一次入口。
    setTimeout(refreshEntries, 1500);
    setTimeout(refreshEntries, 4000);
    paintAudioToggles();
    applyWindowInsets();
    if (root.__farm && __farm.fit) __farm.fit();
  }

  function readSafeInsets() {
    var out = { top: 0, right: 0, bottom: 0, left: 0 };
    if (!doc.documentElement) return out;
    var el = doc.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    doc.documentElement.appendChild(el);
    try {
      var cs = root.getComputedStyle(el);
      out.top = parsePx(cs.paddingTop);
      out.right = parsePx(cs.paddingRight);
      out.bottom = parsePx(cs.paddingBottom);
      out.left = parsePx(cs.paddingLeft);
    } catch (e) {}
    if (el.parentNode) el.parentNode.removeChild(el);
    return out;
  }
  function btnRect(b) {
    if (!b) return null;
    var left = b.left != null ? b.left : 0;
    var top = b.top != null ? b.top : 0;
    var width = b.width != null ? b.width : 0;
    var height = b.height != null ? b.height : 0;
    var right = b.right != null ? b.right : (left + width);
    var bottom = b.bottom != null ? b.bottom : (top + height);
    if (!right && !bottom && !width && !height) return null;
    return { left: left, top: top, right: right, bottom: bottom };
  }
  function applyWindowInsets() {
    var w = (doc.documentElement && doc.documentElement.clientWidth) || root.innerWidth || 0;
    function applyInfo(info) {
      info = info || {};
      w = info.windowWidth || w;
      var cssSafe = readSafeInsets();
      var safe = info.safeArea || {};
      var sb = info.statusBarHeight != null ? info.statusBarHeight : (safe.top || cssSafe.top || 0);
      // 44px nav row under the status bar, plus an 8px gap
      var topClear = Math.max(sb, safe.top || 0, cssSafe.top, 0) + 44 + 8;
      var leftClear = Math.max(safe.left || 0, cssSafe.left, 8);
      var rightClear = Math.max((w && safe.right != null) ? (w - safe.right) : 0, cssSafe.right, 8);
      var mb = info.menuButtons || {};
      var names = ['back', 'me', 'share', 'close', 'more', 'home'];
      var rightBtn = null;
      var i, b, r, cx;
      for (i = 0; i < names.length; i++) {
        r = btnRect(mb[names[i]]);
        if (!r) continue;
        topClear = Math.max(topClear, r.bottom + 8);
        cx = (r.left + r.right) / 2;
        if (w && cx >= w / 2) rightBtn = r;
      }
      // HUD sits fully below the nav row, so side insets stay modest
      var shareRight = Math.max(8, rightClear);
      if (rightBtn) shareRight = Math.max(8, w - rightBtn.right, cssSafe.right);
      var rootEl = doc.documentElement;
      rootEl.style.setProperty('--xhs-top-clear', Math.round(topClear) + 'px');
      rootEl.style.setProperty('--xhs-left-clear', Math.round(leftClear) + 'px');
      rootEl.style.setProperty('--xhs-right-clear', Math.round(rightClear) + 'px');
      rootEl.style.setProperty('--xhs-nav-bottom', Math.round(topClear) + 'px');
      rootEl.style.setProperty('--xhs-share-right', Math.round(shareRight) + 'px');
      rootEl.style.setProperty('--xhs-share-top', Math.round(topClear + 56) + 'px');
      if (root.requestAnimationFrame) requestAnimationFrame(function () { placeSheets(); });
      else placeSheets();
    }
    var mini = root.xhs && root.xhs.miniTool;
    if (mini && typeof mini.getWindowInfo === 'function') {
      Promise.resolve(mini.getWindowInfo()).then(applyInfo, function () { applyInfo(null); });
    } else {
      applyInfo(null);
    }
  }
  P.applyWindowInsets = applyWindowInsets;

  // 1.1.1：平台入口只在当前客户端真能用时出现（方法已注入 + 客户端版本够 + 未被拒绝）。
  // 1.1.0 只看方法在不在：SDK 方法在、客户端不支持时调用一直等待，按钮点了没反应。
  // 没有容器（普通浏览器）时这些入口一律隐藏，不再「先露出来再说」。
  function setupPostNote() {
    var btn = doc.getElementById('xhs-btn-note');
    var ok = !!(P.postNoteAvailable && P.postNoteAvailable());
    if (btn) btn.hidden = !ok;
  }
  function followUsable() {
    var api = P.creatorFollow;
    return !!(api && (typeof api.available === 'function' ? api.available() : api.available));
  }
  function refreshEntries() {
    setupPostNote();
    var fo = followUsable();
    ['xhs-btn-author', 'xhs-board-follow'].forEach(function (id) {
      var b = doc.getElementById(id);
      if (b) b.hidden = !fo;
    });
    if (fo && !refreshEntries._followAsked) {
      refreshEntries._followAsked = true;
      P.creatorFollow.getStatus().then(paintFollow, function () {});
    }
    setupExtraApis();
  }
  P.refreshEntries = refreshEntries;
  root.addEventListener('pf:caps', refreshEntries);
  function hideFollowEntries() {
    ['xhs-btn-author', 'xhs-board-follow'].forEach(function (id) {
      var b = doc.getElementById(id);
      if (b) b.hidden = true;
    });
  }
  function hideRewardEntry() {
    var tip = doc.getElementById('xhs-btn-tip');
    if (tip) tip.hidden = true;
    var share = doc.getElementById('xhs-btn-share');
    var save = doc.getElementById('xhs-btn-save');
    var more = doc.getElementById('xhs-btn-more');
    var any = [share, save, tip].some(function (b) { return b && !b.hidden; });
    if (more && !any) more.hidden = true;
    closeMore();
  }
  function setupExtraApis() {
    var share = doc.getElementById('xhs-btn-share');
    var save = doc.getElementById('xhs-btn-save');
    var tip = doc.getElementById('xhs-btn-tip');
    var more = doc.getElementById('xhs-btn-more');
    if (share) share.hidden = !(P.shareAvailable && P.shareAvailable());
    if (save) save.hidden = !(P.saveImageAvailable && P.saveImageAvailable());
    if (tip) tip.hidden = !(P.rewardAvailable && P.rewardAvailable());
    var any = [share, save, tip].some(function (b) { return b && !b.hidden; });
    if (more) more.hidden = !any;
    if (!any) closeMore();
  }
  root.addEventListener('pf:follow-unavailable', hideFollowEntries);
  root.addEventListener('pf:reward-unavailable', hideRewardEntry);
  function toggleMore(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var menu = doc.getElementById('xhs-more-menu');
    if (!menu) return;
    menu.hidden = !menu.hidden;
  }
  function closeMore() {
    var menu = doc.getElementById('xhs-more-menu');
    if (menu) menu.hidden = true;
  }
  doc.addEventListener('click', function (e) {
    var wrap = doc.getElementById('xhs-more-wrap');
    if (wrap && e.target && wrap.contains(e.target)) return;
    closeMore();
  }, true);

  function paintAudioToggles() {
    var A = root.PFAudio;
    var set = A && A.settings ? A.settings() : { music: false, sfx: false };
    var m = doc.getElementById('xhs-btn-music'), s = doc.getElementById('xhs-btn-sfx');
    if (m) { m.classList.toggle('off', !set.music); m.setAttribute('aria-pressed', String(!!set.music)); }
    if (s) { s.classList.toggle('off', !set.sfx); s.setAttribute('aria-pressed', String(!!set.sfx)); }
  }
  function toggleSound(kind) {
    var A = root.PFAudio;
    var btn = doc.getElementById(kind === 'music' ? 'xhs-btn-music' : 'xhs-btn-sfx');
    if (!A) {
      // audio.js 在首帧后才加载；先记下这次点按，加载好立刻生效，不让按钮白点一下。
      pendingSound[kind] = !pendingSound[kind];
      if (btn) {
        btn.classList.toggle('loading', !!pendingSound[kind]);
        btn.classList.toggle('off', !pendingSound[kind]);
      }
      say(pendingSound[kind] ? (kind === 'music' ? '音乐加载中…' : '音效加载中…') : (kind === 'music' ? '音乐已关' : '音效已关'));
      waitAudio();
      return;
    }
    if (A.unlock) A.unlock();
    var cur = A.settings();
    var want = kind === 'music' ? !cur.music : !cur.sfx;
    if (!want) {
      if (kind === 'music') A.setMusic(false); else A.setSfx(false);
      if (btn) btn.classList.remove('loading');
      paintAudioToggles();
      return;
    }
    if (btn) btn.classList.add('loading');
    if (kind === 'music') A.setMusic(true); else A.setSfx(true);
    paintAudioToggles();
    var done = function () {
      if (btn) btn.classList.remove('loading');
      paintAudioToggles();
    };
    if (A.whenReady) A.whenReady(kind, done);
    else done();
  }
  var pendingSound = {};
  var audioWait = 0;
  function waitAudio() {
    if (audioWait) return;
    audioWait = setInterval(function () {
      var A = root.PFAudio;
      if (!A || !A.settings) return;
      clearInterval(audioWait); audioWait = 0;
      var cur = A.settings();
      ['music', 'sfx'].forEach(function (k) {
        if (pendingSound[k] && !cur[k]) toggleSound(k);
        pendingSound[k] = false;
      });
      paintAudioToggles();
    }, 150);
  }
  function toggleMusic() { toggleSound('music'); }
  function toggleSfx() { toggleSound('sfx'); }
  function codeOf(e) { return e && (typeof e.errCode === 'number' ? e.errCode : (typeof e.code === 'number' ? e.code : 0)); }
  function say(msg) { if (P.notice) P.notice(msg); else if (P.toast) P.toast(msg); }
  // 忙碌标记最多保持 ms，端上没回调也不会把按钮永久锁死。
  function busyFor(btn, ms) {
    var until = Date.now() + (ms || 8000);
    if (btn) btn.classList.add('busy');
    return {
      active: function () { return Date.now() < until; },
      done: function () { until = 0; if (btn) btn.classList.remove('busy'); }
    };
  }
  var shareBusy = null;
  function onShareCard() {
    closeMore();
    if (!(P.shareAvailable && P.shareAvailable())) { setupExtraApis(); say('当前小红书版本还不能分享，升级后再试'); return; }
    if (shareBusy && shareBusy.active()) { say('分享面板正在打开…'); return; }
    shareBusy = busyFor(doc.getElementById('xhs-btn-more'), 16000);
    say('正在打开分享…');
    P.shareCard().then(function () { shareBusy.done(); }, function (e) {
      shareBusy.done();
      var c = codeOf(e);
      if (c === 15503) say('今天的分享次数用完了，明天再来');
      else if (c === 15502) say('现在打不开分享面板，稍后再试');
      else if (c === -2) say('分享没有响应，稍后再试');
      else if (c === 0) { setupExtraApis(); say('当前小红书版本还不能分享'); }
      else say('没能打开分享');
    });
  }
  var saveBusy = null;
  function onSaveFarm() {
    closeMore();
    if (!(P.saveImageAvailable && P.saveImageAvailable()) || !P.saveFarmImage) { setupExtraApis(); say('当前小红书版本还不能保存图片'); return; }
    if (saveBusy && saveBusy.active()) { say('正在保存，稍等一下'); return; }
    var live = canvasToJpeg(doc.getElementById('game'), 0.9);
    if (!live) { say('没截到画面，稍后再试'); return; }
    saveBusy = busyFor(doc.getElementById('xhs-btn-more'), 16000);
    say('正在保存农场图…');
    toNoteUrl(live).then(function (path) {
      return P.saveFarmImage(path || live);
    }).then(function () {
      saveBusy.done();
      say('已保存到相册');
    }, function (e) {
      saveBusy.done();
      say(codeOf(e) === -2 ? '保存没有响应，稍后再试' : '没能保存到相册，请检查相册权限');
    });
  }
  function onTipAuthor() {
    closeMore();
    if (!(P.rewardAvailable && P.rewardAvailable()) || !P.tipAuthor) { hideRewardEntry(); say('赞赏暂未开放'); return; }
    say('正在打开赞赏…');
    P.tipAuthor().then(function () {}, function (e) {
      if (codeOf(e) === -2) say('赞赏没有响应，稍后再试');
      else say('赞赏暂时打不开');
    });
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

  var noteBusyGuard = null;
  var noteBusy = false;
  function onPostNote() {
    if (!(P.postNoteAvailable && P.postNoteAvailable()) || !P.shareNote) { setupPostNote(); say('当前小红书版本还不能发笔记'); return; }
    if (noteBusy && noteBusyGuard && noteBusyGuard.active()) { say('发笔记页正在打开…'); return; }
    noteBusyGuard = busyFor(doc.getElementById('xhs-btn-note'), 20000);
    noteBusy = true;
    say('正在打开发笔记…');
    var copy = root.PFNoteCopy || {};
    var bundled = copy.images || [];
    var live = canvasToJpeg(doc.getElementById('game'), 0.82);
    var loads = bundled.map(loadImageJpeg);
    Promise.all(loads).then(function (shots) {
      var raw = [];
      if (live) raw.push(live);
      for (var i = 0; i < shots.length; i++) if (shots[i]) raw.push(shots[i]);
      if (!raw.length) { noteBusy = false; noteBusyGuard.done(); say('没截到画面，稍后再试'); return; }
      var i2 = 0, urls = [];
      function next() {
        if (i2 >= raw.length) {
          if (!urls.length) { noteBusy = false; noteBusyGuard.done(); say('没截到画面，稍后再试'); return; }
          P.shareNote({ mediaInfo: { image_resources: urls.map(function (u) { return { url: u }; }) } })
            .then(function () { noteBusy = false; noteBusyGuard.done(); }, function (e) {
              noteBusy = false; noteBusyGuard.done();
              if (codeOf(e) === -2) say('发笔记页没有响应，稍后再试');
            });
          return;
        }
        toNoteUrl(raw[i2++]).then(function (u) {
          if (u) urls.push(u);
          next();
        }, function () { next(); });
      }
      next();
    }, function () { noteBusy = false; noteBusyGuard.done(); say('没截到画面，稍后再试'); });
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

  var followGuard = null;
  function onFollowCreator() {
    var api = P.creatorFollow;
    if (!followUsable()) { hideFollowEntries(); say('当前小红书版本还不能关注作者'); return; }
    if (P._followStatus === 1) { say('已经关注作者啦，谢谢'); return; }
    if (P._followStatus === 2) { say('你就是作者本人'); return; }
    if (followBusy && followGuard && followGuard.active()) { say('关注确认框正在打开…'); return; }
    followBusy = true;
    followGuard = busyFor(doc.getElementById('xhs-btn-author'), 20000);
    say('正在打开关注…');
    api.follow().then(function (s) {
      followBusy = false; followGuard.done();
      paintFollow(s);
      if (s === 1) say('已关注作者，谢谢');
      else if (s === 2) say('你就是作者本人');
      else if (s !== 0) say('关注没有成功，稍后再试');
    }, function (err) {
      followBusy = false; followGuard.done();
      var c = codeOf(err);
      if (c === 20002 || c === 10003) return; // 用户自己关掉了确认框 / 确认框已在显示
      if (c === 15404) say('今天关注次数用完了');
      else if (c === -2) say('关注没有响应，稍后再试');
      else if (!followUsable()) { hideFollowEntries(); say('当前小红书版本还不能关注作者'); }
      else say('关注没有成功，稍后再试');
    });
  }
  P.onFollowCreator = onFollowCreator;

  function setupFollow() {
    refreshEntries();
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

  // 1.1.1：新档 0 金币时商店里每个购买按钮都是 disabled，点了毫无反应（审核看到的就是一屏点不动的按钮）。
  // 改成看起来仍是灰的，但能点：点了提示还差多少金币 / 先买什么，并轻轻抖一下。
  function wireShopFeedback() {
    var shop = doc.getElementById('shop');
    if (!shop || shop._xhsShort) return;
    shop._xhsShort = true;
    function unlock() {
      var list = shop.querySelectorAll('button[data-buy][disabled]');
      for (var i = 0; i < list.length; i++) {
        list[i].removeAttribute('disabled');
        list[i].classList.add('xhs-short');
        list[i].setAttribute('aria-disabled', 'true');
      }
    }
    unlock();
    if (root.MutationObserver) new MutationObserver(unlock).observe(shop, { childList: true, subtree: true });
    else setInterval(unlock, 300);
    shop.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button.xhs-short[data-buy]') : null;
      if (!b || !shop.contains(b)) return;
      e.stopPropagation();
      e.preventDefault();
      var card = b.closest('.card') || b.parentNode;
      var short = card && card.querySelector('.short');
      var txt = short ? short.textContent.replace(/\s+/g, ' ').trim() : '';
      var lock = short && short.classList.contains('lock');
      var parts = [];
      var chips = short ? short.querySelectorAll('.cost') : [];
      for (var i = 0; i < chips.length; i++) {
        var amt = chips[i].querySelector('.amt');
        var wood = chips[i].querySelector('.ico.wood');
        if (amt) parts.push(amt.textContent.trim() + (wood ? ' 木材' : ' 金币'));
      }
      if (lock) say(txt + '，再来解锁这一项');
      else if (parts.length) say('还差 ' + parts.join(' + ') + '，农夫卖菜会慢慢攒');
      else say('现在还买不了，农夫卖菜攒够钱再来');
      b.classList.remove('xhs-shake');
      void b.offsetWidth;
      b.classList.add('xhs-shake');
    }, true);
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
    if (hookSaves._done) return;
    hookSaves._done = true;
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
    wireShopFeedback();
    // 1.1.0 的轮询会把 bootUi 调几十次，下面的监听每次都多挂一份；只挂一次。
    if (bootUi._wired) {
      if (!P.fbLocked) chooseFramebuffer();
      if (root.__farm && __farm.fit) __farm.fit();
      compactHud();
      syncSpeedBtn();
      return;
    }
    bootUi._wired = true;
    hookSaves();
    if (!P.fbLocked) chooseFramebuffer();
    if (root.__farm && __farm.fit) __farm.fit();
    compactHud();
    syncSpeedBtn();
    wireLogToast();
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
    if (doc.getElementById('game')) { wirePinch(); hookFollowPause(); }
    wireShopFeedback();
    reparentSheets();
    compactHud();
    syncSpeedBtn();
    paintAudioToggles();
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
