/* 抖音竖屏壳（v12）：照小红书版 platforms/xhs/mobile.js 的触屏界面改的。
   去掉了：分享、发笔记、关注作者、赞赏、排行榜、音乐/音效、保存农场图、帧缓冲选择（落地页自己管画布）。
   保留：底栏图标（背包 / 仓库 / 商店 / 日记 / 跟随农夫 / 图鉴）、面板互斥、HUD 精简、农场日志 → 提示条、
   双指缩放/旋转、商店「钱不够」也能点的提示、工具模式提示、跟随农夫在拖地图时暂停。 */
(function (root) {
  'use strict';
  var P = root.PFPlatform || (root.PFPlatform = {});
  P.mobile = true;
  P.saveEveryMs = 30000;
  P.followFarmer = false; // 抖音：默认不跟随（镜头一直跟着走会一直画新的地块，手机上掉帧）；底栏可以打开
  P.store = function () { return root.localStorage; };
  var doc = document;
  doc.documentElement.classList.add('xhs-mobile');
  doc.documentElement.classList.add('dy-mobile');
  if (doc.body) doc.body.classList.add('xhs-mobile');
  P.stageBox = function () { return { left: 0, top: 0, w: root.innerWidth, h: root.innerHeight }; };

  var toastEl = null, toastT = 0, lastToastSrc = '';
  function fillToast(el) {
    if (!el || el.querySelector('.xhs-toast-text')) return el;
    el.textContent = '';
    var back = doc.createElement('span'); back.className = 'xhs-toast-back';
    var text = doc.createElement('span'); text.className = 'xhs-toast-text';
    el.appendChild(back); el.appendChild(text);
    return el;
  }
  function ensureToast() {
    if (toastEl && toastEl.parentNode) return fillToast(toastEl);
    toastEl = doc.getElementById('xhs-toast');
    if (!toastEl) { toastEl = doc.createElement('div'); toastEl.id = 'xhs-toast'; doc.body.appendChild(toastEl); }
    return fillToast(toastEl);
  }
  function hudBottom() {
    var hud = doc.getElementById('hud'); if (!hud) return 0;
    var r = hud.getBoundingClientRect(); return r.height ? r.bottom : 0;
  }
  function placeToast() {
    var el = ensureToast(); if (!el) return;
    // 商店/仓库/背包盖住了 HUD 下方那行：提示改到底栏上方
    var over = ['shop', 'store', 'codex', 'xhs-inv-dock'].some(function (id) { var s = doc.getElementById(id); return s && !s.hidden; });
    el.classList.toggle('over-sheet', over);
    if (over) {
      var bar = doc.getElementById('xhs-bar'), br = bar && bar.getBoundingClientRect();
      var bottom = br && br.height ? br.top : ((root.innerHeight || 800) - 90);
      el.style.top = Math.max(0, Math.round(bottom - 64)) + 'px';
      return;
    }
    var top = hudBottom() + 14;
    var alb = doc.getElementById('albumToast');
    if (alb && !alb.hidden && doc.documentElement.classList.contains('pf-alb-toast')) top += 72;
    el.style.top = Math.round(top) + 'px';
  }
  root.addEventListener('pf:toaststack', function () { if (toastEl) placeToast(); });
  P.toast = function (msg) {
    if (!msg) return;
    var el = ensureToast(); el.hidden = false;
    var textEl = el.querySelector('.xhs-toast-text') || el;
    textEl.textContent = msg;
    placeToast();
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('show'); }, 3000);
  };
  var noticeUntil = 0;
  P.notice = function (msg) { noticeUntil = Date.now() + 2400; P.toast(msg); };
  function say(msg) { P.notice(msg); }
  function toastLog(raw) {
    var msg = String(raw || '').replace(/^\d{1,2}:\d{2}\s+/, '').trim();
    if (Date.now() < noticeUntil) return;
    if (!msg || msg === lastToastSrc) return;
    lastToastSrc = msg; P.toast(msg);
  }
  function wireLogToast() {
    if (P._logToast) return; P._logToast = true;
    var lastLine = '';
    root.addEventListener('pf:say', function (e) {
      if (P.touch && doc.documentElement.classList.contains('pt-mode')) return; // touch.js 写在操作条里
      if (e && e.detail) { lastToastSrc = String(e.detail); P.notice(String(e.detail)); }
    });
    function check() {
      var S = root.__farm && root.__farm.S, line = S && S.log && S.log[0];
      if (line && line !== lastLine) { lastLine = line; toastLog(line); }
    }
    setInterval(check, 400); check();
  }

  function ico(id, kind, title, fn) {
    var b = doc.createElement('button'); b.type = 'button'; b.id = id; b.className = 'xhs-ico xhs-ico-' + kind; b.title = title;
    b.setAttribute('aria-label', title);
    var i = doc.createElement('i'); b.appendChild(i);
    if (typeof fn === 'function') b.addEventListener('click', fn);
    return b;
  }
  function isOpen(el) { return !!(el && !el.hidden); }
  // 和小红书版一样：按下那一刻记住面板开没开（ui.js 在 window 的 pointerdown 里会先把面板收起）
  function remembering(b, getEl) {
    function remember() {
      if (b._wasOpen != null && Date.now() - (b._wasAt || 0) < 600) return;
      b._wasAt = Date.now(); b._wasOpen = isOpen(getEl());
      clearTimeout(b._wasT); b._wasT = setTimeout(function () { b._wasOpen = null; }, 1200);
    }
    b.addEventListener('pointerdown', remember);
    b.addEventListener('touchstart', remember);
  }
  function sheetIco(id, kind, title, sheetId, webBtnId) {
    var b = ico(id, kind, title, function () {
      var sheet = doc.getElementById(sheetId);
      var wasOpen = b._wasOpen != null ? b._wasOpen : isOpen(sheet); b._wasOpen = null;
      if (!sheet && !webBtnId) return;
      if (wasOpen) { closeSheets(null); if (sheet) sheet.hidden = true; markIcons(); return; }
      closeSheets(sheet);
      var web = webBtnId && doc.getElementById(webBtnId);
      if (sheet && !sheet.hidden) { markIcons(); return; }
      if (web) web.click();
      if (sheet && sheet.hidden) sheet.hidden = false;
      markIcons();
    });
    remembering(b, function () { return doc.getElementById(sheetId); });
    return b;
  }
  function diaryIco() {
    var b = ico('xhs-btn-diary', 'diary', '日记', function () {
      var el = doc.getElementById('diary'), wasOpen = b._wasOpen != null ? b._wasOpen : isOpen(el); b._wasOpen = null;
      var D = root.PFDiaryUI;
      if (!D) { say('日记还在加载，稍等一下'); return; }
      if (wasOpen) { D.close(); markIcons(); return; }
      closeSheets(D.el || el); D.open(); markIcons();
    });
    remembering(b, function () { return doc.getElementById('diary'); });
    return b;
  }
  // 图鉴：小红书版放在排行榜面板里；抖音没有排行榜，直接开网页版的图鉴面板（图鉴 / 成就 / 里程碑）
  function boardIco() {
    var b = ico('xhs-btn-board', 'board', '图鉴', function () {
      var el = doc.getElementById('codex'), wasOpen = b._wasOpen != null ? b._wasOpen : isOpen(el); b._wasOpen = null;
      if (wasOpen) { closeSheets(null); markIcons(); return; }
      closeSheets(el);
      var web = doc.getElementById('codexBtn');
      if (el && el.hidden && web) web.click();
      if (el && el.hidden) el.hidden = false;
      markIcons();
    });
    remembering(b, function () { return doc.getElementById('codex'); });
    return b;
  }
  function reparentSheets() {
    ['shop', 'store', 'codex', 'diary', 'album', 'menu', 'offline', 'loveTip'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el.parentNode !== doc.body) doc.body.appendChild(el);
    });
    ['tools', 'hud'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el && el.parentNode !== doc.body) doc.body.appendChild(el);
    });
  }
  function closeSheets(except) {
    ['shop', 'store', 'codex', 'diary', 'album', 'menu', 'loveTip'].forEach(function (id) {
      var el = doc.getElementById(id); if (el && el !== except) el.hidden = true;
    });
    var dock = doc.getElementById('xhs-inv-dock'); if (dock && except !== dock) dock.hidden = true;
    var sheet = doc.getElementById('pt-sheet'); if (sheet && except !== sheet && !sheet.hidden) { var box = doc.getElementById('pt-box'); if (box) box.click(); }
    markIcons();
  }
  P.closeSheets = closeSheets;
  function markIcons() {
    var pairs = [['xhs-btn-bag', 'xhs-inv-dock'], ['xhs-btn-store', 'store'], ['xhs-btn-shop', 'shop'], ['xhs-btn-board', 'codex'], ['xhs-btn-diary', 'diary']];
    pairs.forEach(function (p) { var b = doc.getElementById(p[0]), el = doc.getElementById(p[1]); if (b) b.classList.toggle('on', isOpen(el)); });
    var f = doc.getElementById('xhs-follow'); if (f) f.classList.toggle('on', !!P.followFarmer);
  }
  P._markTabs = markIcons;

  // v13: one round × (same wooden set as the bottom bar) for every open panel. The panels' own ✕ is a font glyph that the
  // phone font may lack, and a scrolled header takes it away anyway.
  var PANELS = ['shop', 'store', 'codex', 'diary', 'album', 'menu', 'offline', 'career', 'xhs-inv-dock', 'pt-sheet'];
  function anyPanelOpen() {
    for (var i = 0; i < PANELS.length; i++) if (isOpen(doc.getElementById(PANELS[i]))) return true;
    return false;
  }
  function closeAll() {
    root.dispatchEvent({ type: 'keydown', key: 'Escape' }); // ui.js: shop / store / codex / menu / career
    var D = root.PFDiaryUI; if (D && D.close) D.close();
    var off = doc.getElementById('offline');
    if (isOpen(off)) { var ob = off.querySelector('button'); if (ob) ob.click(); else off.hidden = true; }
    closeSheets(null);
    updateClose();
  }
  var closeBtn = null;
  function updateClose() {
    if (!closeBtn) {
      closeBtn = ico('dy-close', 'close', '关闭', null); closeBtn.className = ''; closeBtn.hidden = true; doc.body.appendChild(closeBtn);
      // close on the press itself: ui.js folds panels on any outside pointerdown, which would take the button away before a click lands
      closeBtn.addEventListener('pointerdown', closeAll); closeBtn.addEventListener('click', closeAll);
    }
    var on = anyPanelOpen();
    if (closeBtn.hidden === on) closeBtn.hidden = !on;
    if (on && doc.body.lastChild !== closeBtn) doc.body.appendChild(closeBtn);
  }
  setInterval(updateClose, 250);
  function setFollow(on) { P.followFarmer = !!on; markIcons(); }
  P.setFollow = setFollow; // touch.js 用工具时暂停跟随
  function compactHud() {
    var coins = doc.getElementById('coins');
    if (coins && coins.parentElement && !coins.parentElement.classList.contains('xhs-coins')) coins.parentElement.classList.add('xhs-coins');
    var wood = doc.getElementById('wood'), woodHud = doc.getElementById('woodHud') || (wood && wood.parentElement);
    if (woodHud && !woodHud.classList.contains('xhs-wood')) woodHud.classList.add('xhs-wood');
    var hud = doc.getElementById('hud'); if (hud && hud.style.fontSize) hud.style.fontSize = '';
  }
  function applyInsets() {
    var ins = root.__dyInsets || {}, rootEl = doc.documentElement;
    var top = Math.round(ins.top || 96), bottom = Math.round(ins.bottom || 8);
    rootEl.style.setProperty('--xhs-top-clear', top + 'px');
    rootEl.style.setProperty('--xhs-bottom-clear', Math.max(8, bottom) + 'px');
    rootEl.style.setProperty('--xhs-left-clear', '12px');
    rootEl.style.setProperty('--xhs-right-clear', '12px');
    rootEl.style.setProperty('--xhs-nav-bottom', top + 'px');
    rootEl.style.setProperty('--xhs-share-right', '8px');
    // HUD 估算高 64px（两行 + 好感一行）；面板从 HUD 下面开始
    rootEl.style.setProperty('--xhs-sheet-top', (top + 72) + 'px');
    rootEl.style.setProperty('--xhs-share-top', (top + 72) + 'px');
  }
  P.applyInsets = applyInsets;

  // v14：右侧一列（同小红书版位置）：音乐开关、音效开关、拍照存相册。音频由落地页的 PFAudio 播放
  var sideBtns = null;
  function paintSide() {
    if (!sideBtns) return;
    var A = root.PFAudio, st = A && A.settings ? A.settings() : { music: true, sfx: true };
    var m = !st.music, s = !st.sfx;
    if (sideBtns.music.classList.contains('off') !== m) sideBtns.music.classList.toggle('off', m);
    if (sideBtns.sfx.classList.contains('off') !== s) sideBtns.sfx.classList.toggle('off', s);
  }
  function buildSide() {
    var side = doc.getElementById('xhs-side');
    if (!side) { side = doc.createElement('div'); side.id = 'xhs-side'; doc.body.appendChild(side); }
    var music = ico('dy-music', 'dymusic', '音乐', function () {
      var A = root.PFAudio; if (!A) return; var on = !A.settings().music; A.setMusic(on); paintSide(); say(on ? '音乐已打开' : '音乐已关闭');
    });
    var sfx = ico('dy-sfx', 'dysfx', '音效', function () {
      var A = root.PFAudio; if (!A) return; var on = !A.settings().sfx; A.setSfx(on); paintSide(); say(on ? '音效已打开' : '音效已关闭');
    });
    var photo = ico('dy-photo', 'dyphoto', '拍照存相册', function () { if (typeof root.__dyPhoto === 'function') root.__dyPhoto(); });
    side.appendChild(music); side.appendChild(sfx); side.appendChild(photo);
    sideBtns = { music: music, sfx: sfx, photo: photo };
    paintSide();
  }

  function buildChrome() {
    if (doc.getElementById('xhs-bar')) return;
    var stage = doc.createElement('div'); stage.id = 'xhs-stage';
    var dockInv = doc.createElement('div'); dockInv.id = 'xhs-inv-dock'; dockInv.hidden = true;
    var bar = doc.createElement('div'); bar.id = 'xhs-bar';
    var wrap = doc.getElementById('wrap'), hud = doc.getElementById('hud'), inv = doc.getElementById('inv');
    if (wrap) { doc.body.insertBefore(stage, wrap); stage.appendChild(wrap); } else doc.body.appendChild(stage);
    if (hud && hud.parentNode !== doc.body) doc.body.appendChild(hud);
    if (inv) dockInv.appendChild(inv);
    doc.body.appendChild(dockInv);
    doc.body.appendChild(bar);
    ensureToast();
    reparentSheets();
    bar.appendChild(sheetIco('xhs-btn-bag', 'bag', '背包', 'xhs-inv-dock', null));
    bar.appendChild(sheetIco('xhs-btn-store', 'store', '仓库', 'store', 'storeBtn'));
    bar.appendChild(sheetIco('xhs-btn-shop', 'shop', '商店', 'shop', 'shopBtn'));
    bar.appendChild(diaryIco());
    var follow = ico('xhs-follow', 'follow', '跟随', function () { setFollow(!P.followFarmer); say(P.followFarmer ? '镜头跟着农夫走' : '镜头不再跟着农夫'); });
    bar.appendChild(follow);
    bar.appendChild(boardIco());
    buildSide();
    applyInsets();
    markIcons();
    if (root.__farm && root.__farm.fit) root.__farm.fit();
  }

  function wrapAngle(a) { if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; }
  // 双指：捏合缩放、转动旋转（同小红书版）；落地页把画布上的触摸转成 touchstart/move/end 发到 #game
  function wirePinch() {
    var stage = doc.getElementById('xhs-stage') || doc.getElementById('game');
    if (!stage || stage._xhsGest) return; stage._xhsGest = true;
    var pts = {}, mode = null, last = null, start = null, lastZoom = 0, rotUsed = 0;
    function pair() {
      var ids = Object.keys(pts); if (ids.length < 2) return null;
      var a = pts[ids[0]], b = pts[ids[1]];
      return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    function lockGame(on) {
      P.gestureLock = !!on;
      if (on) {
        try { doc.body.classList.remove('grab'); } catch (err) {}
        if (P.followFarmer) setFollow(false);
        var G = root.__farm; if (G && typeof G.cancelDrag === 'function') G.cancelDrag();
      }
    }
    function onStart(x, y, id) {
      pts[id] = { x: x, y: y };
      if (Object.keys(pts).length >= 2) {
        last = pair(); start = last; lastZoom = root.__farm && root.__farm.getZoom ? root.__farm.getZoom() : 0; rotUsed = 0; mode = null; lockGame(true);
      }
    }
    function onMove(x, y, id) {
      if (!pts[id]) return; pts[id] = { x: x, y: y };
      if (Object.keys(pts).length < 2 || !last) return;
      var now = pair();
      if (!now || now.dist < 10 || !isFinite(now.angle) || !isFinite(last.angle)) return;
      var dAng = wrapAngle(now.angle - last.angle), totScale = (start && start.dist > 8) ? now.dist / start.dist : 1;
      var totAng = start ? wrapAngle(now.angle - start.angle) : 0, dScale = last.dist > 8 ? now.dist / last.dist : 1;
      if (!mode) {
        var scaleDev = Math.abs(Math.log(totScale) || 0), angDev = Math.abs(totAng);
        if (scaleDev > 0.05 && scaleDev >= angDev * 0.65) mode = 'pinch';
        else if (angDev > (10 * Math.PI / 180) && angDev > scaleDev * 1.1) mode = 'rotate';
      }
      var G = root.__farm;
      var pinchLikely = !mode || mode === 'pinch' || Math.abs(Math.log(totScale) || 0) > 0.08;
      if (pinchLikely && G && G.setZoom && start && start.dist > 8) {
        var steps = Math.round(Math.log(totScale) / Math.log(1.18));
        if (steps) G.setZoom(lastZoom + steps);
      }
      var rotateLikely = mode === 'rotate' || (!mode && Math.abs(dAng) > 0.02 && Math.abs(dScale - 1) < 0.015);
      if (rotateLikely && G && G.cam) {
        var apply = dAng * 0.25, cap = 3.5 * Math.PI / 180;
        if (apply > cap) apply = cap; if (apply < -cap) apply = -cap;
        var remain = Math.max(0, 48 * Math.PI / 180 - Math.abs(rotUsed));
        if (Math.abs(apply) > remain) apply = remain * (apply < 0 ? -1 : 1);
        if (apply) { G.cam.ta += apply; rotUsed += apply; }
      }
      last = now;
    }
    function onEnd(id) {
      delete pts[id];
      if (Object.keys(pts).length < 2) { last = start = null; mode = null; rotUsed = 0; lockGame(false); }
    }
    stage.addEventListener('touchstart', function (e) { var l = e.changedTouches; for (var i = 0; i < l.length; i++) onStart(l[i].clientX, l[i].clientY, 't' + l[i].identifier); }, true);
    stage.addEventListener('touchmove', function (e) { var l = e.changedTouches; for (var i = 0; i < l.length; i++) onMove(l[i].clientX, l[i].clientY, 't' + l[i].identifier); }, true);
    function up(e) { var l = e.changedTouches; for (var i = 0; i < l.length; i++) onEnd('t' + l[i].identifier); }
    stage.addEventListener('touchend', up, true);
    stage.addEventListener('touchcancel', up, true);
  }

  // 新档金币不够时商店的购买按钮仍能点：说还差多少（同小红书版 1.1.1）
  function wireShopFeedback() {
    var shop = doc.getElementById('shop');
    if (!shop || shop._xhsShort) return; shop._xhsShort = true;
    var seen = null;
    function unlock() {
      if (shop.hidden) return;
      var first = shop.firstChild; if (first === seen && !shop.querySelector('button[data-buy][disabled]')) return; seen = first;
      var list = shop.querySelectorAll('button[data-buy][disabled]');
      for (var i = 0; i < list.length; i++) { list[i].removeAttribute('disabled'); list[i].classList.add('xhs-short'); list[i].setAttribute('aria-disabled', 'true'); }
    }
    setInterval(unlock, 300);
    shop.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button.xhs-short[data-buy]') : null;
      if (!b || !shop.contains(b)) return;
      e.stopPropagation(); e.preventDefault();
      var card = b.closest('.card') || b.parentNode, short = card && card.querySelector('.short');
      var txt = short ? short.textContent.replace(/\s+/g, ' ').trim() : '', lock = short && short.classList.contains('lock');
      var parts = [], chips = short ? short.querySelectorAll('.cost') : [];
      for (var i = 0; i < chips.length; i++) {
        var amt = chips[i].querySelector('.amt'), wood = chips[i].querySelector('.ico.wood');
        if (amt) parts.push(amt.textContent.trim() + (wood ? ' 木材' : ' 金币'));
      }
      if (lock) say(txt + '，再来解锁这一项');
      else if (parts.length) say('还差 ' + parts.join(' + ') + '，农夫卖菜会慢慢攒');
      else say('现在还买不了，农夫卖菜攒够钱再来');
      b.classList.remove('xhs-shake'); setTimeout(function () { b.classList.add('xhs-shake'); }, 30);
    }, true);
  }
  // 工具按钮（放养、种树…）的「接下来点哪里」写在 title 里：手机上弹出来（touch.js 接管时不弹）
  function wireToolHints() {
    var tools = doc.getElementById('tools');
    if (!tools || tools._xhsHints) return; tools._xhsHints = true;
    tools.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('button[data-m]') : null;
      if (!b || P.touch) return;
      var hint = String(b.title || '').replace(/[（(][^）)]*Esc[^）)]*[）)]/g, '').trim();
      setTimeout(function () { var G = root.__farm, m = G && G.input; if (m && m.mode === b.getAttribute('data-m') && hint) P.notice(hint); }, 0);
    });
  }
  function hookFollowPause() {
    var cv = doc.getElementById('game'); if (!cv || cv._xhsFollow) return; cv._xhsFollow = true;
    cv.addEventListener('pointermove', function () { if (doc.body.classList.contains('grab') && P.followFarmer) setFollow(false); });
  }
  function hookSaves() {
    function hideSave() { if (root.__farm && root.__farm.saveNow) root.__farm.saveNow(); }
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) hideSave(); });
    root.addEventListener('pf:save-error', function (e) { P.toast('存档没写上：' + ((e.detail && e.detail.error) || '存档失败')); });
  }

  function bootUi() {
    buildChrome(); wirePinch(); hookFollowPause(); wireShopFeedback(); wireToolHints(); compactHud();
    if (bootUi._wired) return; bootUi._wired = true;
    hookSaves(); wireLogToast();
    var mm = doc.getElementById('minimap'); if (mm) mm.hidden = true;
  }
  bootUi();
  // 面板被别的脚本挪走时挪回来；图标的开/关状态跟着面板
  setInterval(function () { compactHud(); reparentSheets(); markIcons(); }, 500);
})(typeof window !== 'undefined' ? window : globalThis);
