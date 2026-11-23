// 小红书小工具 · 手机触屏工具模式（xhs 下一版；网页版不加载，网页版用鼠标）。
// 选工具 → 底部操作条（✖ / 提示 / ✔）+ 屏幕中间固定准星 → 拖地图让准星对准 → ✔ 确认。
// #tools 那一排按钮收进右下角 ⚒ 工具箱；挪东西选中后浮出「移动 / 收回 / ✖」；长按可挪的东西直接选中；
// 用工具时暂停跟随农夫；点按阈值 10px、最小选取半径 22px；「撤销全部」先确认。
// 游戏逻辑全走 game.js 的钩子（v5.11.0.2）：aimAt / commitAt / setTouch / storeThing / canStore；
// 工具按钮的逻辑仍在 ui.js（工具箱里每一格点的是原来的按钮）。
(function (root) {
  'use strict';
  var P = root.PFPlatform || {}, doc = root.document;
  var q = root.location && root.location.search || '';
  if (!P.mobile && !/[?&]touch\b/.test(q)) return; // 只在小红书外壳（或 ?touch 开发开关）里启用
  var G = root.__farm;
  if (!G || !G.aimAt || !G.commitAt || !G.setTouch) return; // 旧的 game.js 没有钩子：保持原来的 #tools
  P.touch = true;
  var $ = function (id) { return doc.getElementById(id); };
  var html = doc.documentElement; html.classList.add('pf-touch');
  G.setTouch({ slop: 10, pickCss: 22 });

  var ICON = { chop: '🪓', apple: '🍎', orange: '🍊', release: '🐟', decor: '🪑', move: '✋', sprinkler: '💧' };
  var HINT = {
    chop: '准星对准野树或果树，点 ✔ 标记要砍（果树要点两次确认，砍下必得树苗）；对准已标记的再点一次是取消。也可以直接点树',
    plant: '拖动地图，让准星落在空草地上，圈变绿就点 ✔',
    release: '把准星对准家门口的池塘，点 ✔ 放进去',
    decor: '拖动地图找位置，框变绿就点 ✔ 放这里',
    move: '把准星对准要挪的东西点 ✔，或者直接点它',
    menu: '选一个：移动到别处，或者收回仓库',
    moving: '拖动地图，让绿框落到新位置，点 ✔ 放下',
    sprinkler: '把准星对准新位置，点 ✔'
  };

  // ---------- DOM ----------
  function mk(tag, id, cls, inner) { var e = doc.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (inner != null) e.innerHTML = inner; doc.body.appendChild(e); return e; }
  var box = mk('button', 'pt-box', '', '<span class="g">⚒</span>'), sheet = mk('div', 'pt-sheet'), ret = mk('div', 'pt-ret', '', '<i></i>');
  var bar = mk('div', 'pt-bar', '', '<button class="x" aria-label="取消">✖</button><div class="t"><b></b><span></span></div><button class="ok" aria-label="确定">✔</button>');
  var flt = mk('div', 'pt-float');
  box.setAttribute('aria-label', '工具'); box.title = '工具';
  sheet.hidden = ret.hidden = bar.hidden = flt.hidden = true;
  var barT = bar.querySelector('.t b'), barS = bar.querySelector('.t span'), okB = bar.querySelector('.ok'), xB = bar.querySelector('.x');

  function haptic(kind) {
    try {
      var mt = root.xhs && root.xhs.miniTool;
      if (mt && typeof mt.vibrateShort === 'function') mt.vibrateShort({ type: kind === 'bad' ? 'medium' : 'light' });
      else if (root.navigator && typeof root.navigator.vibrate === 'function') root.navigator.vibrate(kind === 'bad' ? [10, 40, 10] : 8);
    } catch (e) { /* 没有震动就算了 */ }
  }
  function RET() { return { x: Math.round(root.innerWidth / 2), y: Math.round(root.innerHeight * 0.46) }; } // 拇指在下半屏拖，准星不被挡、不压 HUD
  // 把世界坐标 at 平移到屏幕 (tx, ty)（panScreen 吃帧缓冲像素：先推 8px 量比例）
  function centerOn(at, tx, ty) {
    if (!G.toClient || !G.panScreen) return;
    for (var i = 0; i < 3; i++) {
      var c0 = G.toClient(at.x, at.y); G.panScreen(8, 0); var c1 = G.toClient(at.x, at.y), k = (c1.x - c0.x) / 8;
      if (!isFinite(k) || Math.abs(k) < 0.01) return; G.panScreen((tx - c1.x) / k, (ty - c1.y) / k);
    }
  }
  function screenToCrosshair(x, y) { // 点了屏幕 (x, y)：把那里移到准星下
    var r = RET(); if (!G.panScreen || !G.toClient) return;
    var a = G.toClient(0, 0); G.panScreen(8, 0); var b = G.toClient(0, 0), k = (b.x - a.x) / 8; G.panScreen(-8, 0);
    if (!isFinite(k) || Math.abs(k) < 0.01) return; G.panScreen((r.x - x) / k, (r.y - y) / k);
  }

  // ---------- tools: read ui.js's #tools buttons ----------
  function tools() {
    var t = $('tools'); if (!t) return [];
    return Array.prototype.map.call(t.querySelectorAll('button[data-m]'), function (b) {
      var txt = (b.textContent || '').trim(), m = txt.match(/^(\D+?)\s*(\d+)?(（.*）)?\s*✕?$/);
      return { b: b, m: b.getAttribute('data-m'), k: b.getAttribute('data-k') || '', text: txt, name: m ? m[1] : txt, n: m && m[2] ? +m[2] : 0, full: b.classList.contains('full'), title: b.title || '' };
    });
  }
  var subDecor = false, confirming = null;
  function tile(t, i, attr) {
    var ic = t.m === 'plant' ? (ICON[t.k] || '🌳') : (ICON[t.m] || '•');
    return '<button ' + attr + '="' + i + '"' + (t.full ? ' class="full"' : '') + '><span class="i">' + ic + '</span><span class="nm">' + t.name.replace(/^摆/, '') + '</span><span class="c">' + (t.n ? '×' + t.n : '&nbsp;') + '</span></button>';
  }
  // 1.3.0：网页 v5.11.0 小地图下的「家 / 农家乐 / 小镇 / 海边」跳转在手机上藏着（会压住右上角），搬进工具箱的一行；
  // 还在云里的区域照样能点：镜头过去，再说一句怎么开（和网页一样）。
  function jumps() { var j = $('mmJump'); return j ? Array.prototype.slice.call(j.querySelectorAll('button[data-j]')) : []; }
  function jumpRow() {
    var J = jumps(); if (!J.length) return '';
    return '<div class="row2 go"><span>去</span>' + J.map(function (b, i) { return '<button data-g="' + i + '"' + (b.classList.contains('locked') ? ' class="locked"' : '') + '>' + (b.classList.contains('locked') ? '☁ ' : '') + b.textContent + '</button>'; }).join('') + '</div>';
  }
  function drawSheet() {
    var L = tools(), main = L.filter(function (t) { return !/^clear/.test(t.m); }), clr = L.filter(function (t) { return /^clear/.test(t.m); });
    var deco = main.filter(function (t) { return t.m === 'decor'; }), rest = main.filter(function (t) { return t.m !== 'decor'; });
    var h;
    if (confirming) {
      h = '<h4><span>撤销确认</span></h4><div class="cf">' + confirming.ask + '</div><div class="row2"><button data-a="no">算了</button><button data-a="yes" class="warn">撤销</button></div>';
    } else if (subDecor && deco.length) {
      h = '<h4><button class="back" data-a="back">‹</button><span>摆装饰</span><small>选一件，再拖地图找位置</small></h4><div class="grid">' + deco.map(function (t, i) { return tile(t, i, 'data-d'); }).join('') + '</div>';
    } else {
      subDecor = false;
      var cells = rest.map(function (t, i) { return tile(t, i, 'data-i'); });
      if (deco.length) { var mv = rest.map(function (t) { return t.m; }).indexOf('move');
        cells.splice(mv >= 0 ? mv : cells.length, 0, '<button data-a="deco"><span class="i">' + ICON.decor + '</span><span class="nm">摆装饰</span><span class="c">×' + deco.reduce(function (s, t) { return s + t.n; }, 0) + '</span></button>'); }
      h = '<h4><span>⚒ 工具</span><small>点一个工具，再拖地图对准</small></h4><div class="grid">' + cells.join('') + '</div>' +
        jumpRow() + (clr.length ? '<div class="row2">' + clr.map(function (t, i) { return '<button data-c="' + i + '">撤销' + (t.m === 'clear' ? '指令' : '要搬的') + ' ' + (t.n || '') + '</button>'; }).join('') + '</div>' : '');
    }
    sheet.innerHTML = h;
    sheet.onclick = function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return; var a = b.getAttribute('data-a');
      if (b.hasAttribute('data-g')) { var jb = jumps()[+b.getAttribute('data-g')]; closeSheet(); if (jb) { if (P.setFollow) P.setFollow(false); jb.click(); haptic(); } return; }
      if (a === 'deco') { subDecor = true; drawSheet(); return; }
      if (a === 'back') { subDecor = false; drawSheet(); return; }
      if (a === 'no') { confirming = null; drawSheet(); return; }
      if (a === 'yes') { var c = confirming; confirming = null; closeSheet(); if (c) c.b.click(); haptic(); return; }
      var t = b.hasAttribute('data-i') ? rest[+b.getAttribute('data-i')] : b.hasAttribute('data-d') ? deco[+b.getAttribute('data-d')] : null;
      if (b.hasAttribute('data-c')) { var ct = clr[+b.getAttribute('data-c')]; confirming = { b: ct.b, ask: ct.m === 'clear' ? '撤销全部 ' + (ct.n || '') + ' 个砍树、种树和放养指令？' : '撤销还没搬完的 ' + (ct.n || '') + ' 件摆放和挪动？' }; drawSheet(); return; }
      if (!t) return; closeSheet();
      if (t.m === 'plant' && t.full) { t.b.click(); return; } // 没地方了：ui.js 会说
      t.b.click(); haptic();
    };
  }
  function closeSheet() { sheet.hidden = true; subDecor = false; confirming = null; box.classList.remove('on'); }
  box.addEventListener('click', function () {
    if (!sheet.hidden) { closeSheet(); return; }
    ['shop', 'store', 'codex', 'menu', 'xhs-board', 'diary'].forEach(function (id) { var el = $(id); if (el) el.hidden = true; });
    var dock = $('xhs-inv-dock'); if (dock) dock.hidden = true;
    drawSheet(); sheet.hidden = false; box.classList.add('on'); haptic();
  });

  // ---------- tool mode ----------
  var why = '', whyT = 0, fingers = 0, follow0 = null, lastMode = null, stage = null; // stage: 挪东西 'menu' | 'moving'
  root.addEventListener('pf:say', function (e) {
    if (!G.input || !G.input.mode) return; var s = String(e.detail || '');
    if (/^(选中|标记|取消|游进|已经)/.test(s)) { why = ''; clearTimeout(whyT); return; } // 成功的回话不占操作条，也清掉上一条提示（比如砍果树的确认）
    why = s; clearTimeout(whyT); whyT = setTimeout(function () { why = ''; }, 2400); haptic('bad');
  });
  root.addEventListener('touchstart', function (e) { fingers = e.touches.length; }, true);
  root.addEventListener('touchend', function (e) { fingers = e.touches.length; }, true);
  root.addEventListener('touchcancel', function () { fingers = 0; }, true);
  function setFollow(on) { if (P.setFollow) P.setFollow(on); else P.followFarmer = !!on; }
  function enterMode(m) {
    closeSheet(); stage = null; why = '';
    if (follow0 === null) { follow0 = holdFollow || !!P.followFarmer; holdFollow = false; setFollow(false); }
    if (m === 'release' && G.POND) { var r = RET(); centerOn(G.POND, r.x, r.y); }
  }
  function leaveMode() { stage = null; why = ''; flt.hidden = true; if (follow0 !== null) { setFollow(follow0); follow0 = null; } }
  xB.addEventListener('click', function () {
    if (G.input.mode === 'move' && G.input.mvPick) { if (stage === 'moving') stage = 'menu'; else { G.input.mvPick = null; stage = null; } }
    else G.setMode(null);
    haptic();
  });
  okB.addEventListener('click', function () {
    if (okB.disabled) return; var r = RET(), m = G.input.mode;
    var res = G.commitAt(r.x, r.y);
    if (m === 'move') { if (res.pick && !res.r) stage = 'menu'; else if (res.r && res.r.ok) stage = null; }
    haptic(res.r && res.r.ok === false ? 'bad' : null);
  });
  function floatButtons(pk) {
    var key = pk.what + ':' + pk.ref + ':' + stage; if (flt._k === key) return; flt._k = key;
    var store = G.canStore && G.canStore(pk);
    flt.innerHTML = '<button class="p" data-a="move">✋ 移动</button>' + (store ? '<button data-a="store">📦 收回</button>' : '') + '<button data-a="x">✖</button>';
  }
  flt.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null; if (!b) return; var a = b.getAttribute('data-a'), pk = G.input.mvPick; if (!pk) return;
    if (a === 'x') { G.input.mvPick = null; stage = null; }
    else if (a === 'store') { var r = G.storeThing(pk); if (!r.ok && r.why) { why = r.why; haptic('bad'); } else { stage = null; G.setMode(null); } }
    else if (a === 'move') { stage = 'moving'; var c = RET(); centerOn(pk, c.x, c.y); }
    haptic();
  });

  // taps on the map while a tool is on: chop / pick hit directly, anything else pans that spot under the crosshair
  var swallow = false, lp = null, holdFollow = false, dragged = false; // holdFollow: following paused while a finger rests (the map must not slide away under a long-press)
  G.setTouch({ onTap: function (e, mode) {
    if (swallow) { swallow = false; return true; } // the tap that ends a long-press
    if (!mode) return false;
    var a = G.aimAt(e.clientX, e.clientY);
    if (mode === 'chop' && a.ok) return false;                         // 直接点树：照旧标记 / 取消
    if (mode === 'move' && !G.input.mvPick && a.what) { setTimeout(function () { if (G.input.mvPick) { stage = 'menu'; haptic(); } }, 0); return false; } // 直接点要挪的东西
    screenToCrosshair(e.clientX, e.clientY); return true;              // 其它：把那一点移到准星下，再按 ✔
  } });
  // long-press a movable thing with no tool on → 挪东西 with it picked
  function cv() { return doc.querySelector('#wrap canvas') || doc.querySelector('canvas'); }
  var c0 = cv();
  if (c0) {
    c0.addEventListener('pointerdown', function (e) {
      if (G.input.mode || e.pointerType === 'mouse' || fingers > 1) return; var x = e.clientX, y = e.clientY;
      dragged = false; if (P.followFarmer) { holdFollow = true; P.followFarmer = false; }
      clearTimeout(lp); lp = setTimeout(function () {
        lp = null; if (fingers > 1 || G.input.mode || doc.body.classList.contains('grab')) return;
        G.setMode('move'); var r = G.commitAt(x, y);
        if (r.pick) { swallow = true; stage = 'menu'; haptic(); } else G.setMode(null);
      }, 480);
    });
    var stop = function () { clearTimeout(lp); lp = null; };
    var release = function () { stop(); if (holdFollow && !G.input.mode) { holdFollow = false; if (!dragged) P.followFarmer = true; } }; // a drag turned following off for good (mobile.js)
    c0.addEventListener('pointerup', function () { release(); setTimeout(function () { swallow = false; }, 0); });
    c0.addEventListener('pointercancel', release);
    c0.addEventListener('pointermove', function () { if (doc.body.classList.contains('grab')) { dragged = true; stop(); } });
  }

  function place() {
    var b = $('xhs-bar'), top = b && b.getClientRects().length ? b.getBoundingClientRect().top : root.innerHeight - 8;
    box.style.top = Math.round(top - 66) + 'px';
    sheet.style.bottom = Math.round(root.innerHeight - top + 8) + 'px';
  }
  function tick() {
    place();
    var m = G.input && G.input.mode, L = tools().filter(function (t) { return !/^clear/.test(t.m); });
    if (m !== lastMode) { if (m) enterMode(m); else leaveMode(); lastMode = m; }
    // 1.3.0：背包（v5.11.0.7 物品栏）、日记 / 相册、商店等面板打开时 ⚒ 让开，不压在面板和物品栏上
    var covered = ['shop', 'store', 'diary', 'xhs-board', 'xhs-inv-dock', 'menu', 'career', 'loveTip', 'offline'].some(function (id) { var e = $(id); return e && !e.hidden && e.getClientRects().length > 0; });
    box.hidden = !L.length || !!m || covered; if (box.hidden && !m) closeSheet();
    html.classList.toggle('pt-mode', !!m); ret.hidden = bar.hidden = !m;
    if (m) {
      var r = RET(); ret.style.left = r.x + 'px'; ret.style.top = r.y + 'px';
      var pk = m === 'move' ? G.input.mvPick : null; if (!pk && stage) stage = null; if (pk && !stage) stage = 'menu';
      var a = fingers ? null : G.aimAt(r.x, r.y); // 手指在拖的时候不抢 hover
      if (a) ret.className = a.ok === null ? '' : a.ok ? 'ok' : 'bad';
      var name = m === 'move' ? (pk ? (stage === 'moving' ? '挪动中' : '选中了') : '挪东西') : ((tools().filter(function (t) { return t.m === m && (!t.k || t.k === G.input.kind); })[0] || {}).name || ICON[m] || '');
      var hint = m === 'move' ? (pk ? HINT[stage] : (a && a.what ? '准星对准了一件东西，点 ✔ 选中' : HINT.move)) : (m === 'chop' && a && a.marked ? '这棵已经标记了，点 ✔ 取消标记' : HINT[m] || '');
      barT.textContent = name; barS.textContent = why || hint; barS.className = why ? 'why' : '';
      okB.disabled = m === 'move' && stage === 'menu'; okB.textContent = m === 'chop' && a && a.marked ? '↺' : '✔';
      flt.hidden = !(pk && stage === 'menu');
      if (!flt.hidden) { floatButtons(pk); var c = G.toClient(pk.x, pk.y); flt.style.left = Math.round(Math.max(110, Math.min(root.innerWidth - 110, c.x))) + 'px'; flt.style.top = Math.round(Math.max(150, c.y - 40)) + 'px'; }
    } else flt.hidden = true;
    root.requestAnimationFrame(tick);
  }
  root.requestAnimationFrame(tick);
  root.PFTouch = { RET: RET, open: function () { if (sheet.hidden) box.click(); }, state: function () { return { stage: stage, follow0: follow0, sheet: !sheet.hidden, confirming: !!confirming, sub: subDecor }; } };
})(typeof window !== 'undefined' ? window : this);
