/* 排行榜适配：board 1 = 累计金币，board 2 = 农场天数。9.51+ 内测 API；未授权隐藏入口。 */
(function (root) {
  'use strict';
  var P = root.PFPlatform || (root.PFPlatform = {});
  var mini = root.xhs && root.xhs.miniTool;
  var hasApi = !!(mini && typeof mini.submitScore === 'function' && typeof mini.getRankList === 'function' && typeof mini.getMyRank === 'function');
  var isHost = !!(root.xhs && root.xhs.miniTool);
  var mock = !isHost; // 本地 / 模拟器没有容器 API，用预览数据
  var denied = false;
  var SUBMIT_MS = 60000;
  var CACHE_MS = 45000;
  var SCORE_MAX = 1000000;
  var lastSubmitAt = 0;
  var lastSent = { 1: null, 2: null };
  var cache = {}; // key -> { at, list, mine }

  function scores() {
    var S = root.__farm && __farm.S;
    var earned = S && isFinite(S.earned) ? Math.round(S.earned) : 0;
    var day = S && isFinite(S.day) ? Math.round(S.day) : 1;
    return {
      1: Math.max(0, Math.min(SCORE_MAX, earned)),
      2: Math.max(0, Math.min(SCORE_MAX, day))
    };
  }

  function errCode(e) {
    if (!e) return 0;
    if (typeof e.errCode === 'number') return e.errCode;
    if (e.detail && typeof e.detail.errCode === 'number') return e.detail.errCode;
    return 0;
  }

  function callApi(name, args) {
    return new Promise(function (resolve, reject) {
      if (!hasApi) { reject({ errCode: 0, errMsg: 'unsupported' }); return; }
      var fn = mini[name];
      try {
        Promise.resolve(fn.call(mini, args)).then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }

  function markDenied() {
    denied = true;
    var tab = document.getElementById('tabBoard');
    if (tab) tab.hidden = true;
    var sheet = document.getElementById('xhs-board');
    if (sheet) sheet.hidden = true;
  }

  function handleErr(e, loading) {
    var c = errCode(e);
    if (c === 1005 || c === 1006) { markDenied(); return '排行榜未授权，已隐藏入口'; }
    if (c === 2002) return '榜单正在准备，稍后再看';
    if (c === 2009) return '请求太频繁，稍后再试';
    if (c === 1004) return '分数超出榜单范围';
    if (!hasApi && isHost) return '当前客户端还不支持排行榜（需要 9.51 以上）';
    return loading || '暂时看不到排行榜';
  }

  var MOCK = {
    1: [
      { rank: 1, score: 28600, nickname: '南瓜摊主' },
      { rank: 2, score: 19240, nickname: '阿禾的邻居' },
      { rank: 3, score: 15120, nickname: '钓鱼人' },
      { rank: 4, score: 9800, nickname: '林间小屋' },
      { rank: 5, score: 6400, nickname: '早起的农夫' },
      { rank: 6, score: 2100, nickname: '新来的' }
    ],
    2: [
      { rank: 1, score: 128, nickname: '南瓜摊主' },
      { rank: 2, score: 96, nickname: '阿禾的邻居' },
      { rank: 3, score: 80, nickname: '钓鱼人' },
      { rank: 4, score: 54, nickname: '林间小屋' },
      { rank: 5, score: 31, nickname: '早起的农夫' },
      { rank: 6, score: 12, nickname: '新来的' }
    ]
  };

  function mockList(board) {
    var rows = MOCK[board].map(function (r) { return Object.assign({}, r); });
    var mine = scores()[board];
    var me = rows.find(function (r) { return r.nickname === '我'; });
    if (!me) {
      rows.push({ rank: rows.length + 1, score: mine, nickname: '我' });
    } else me.score = mine;
    rows.sort(function (a, b) { return b.score - a.score || a.rank - b.rank; });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    var my = rows.find(function (r) { return r.nickname === '我'; });
    return { list: rows, mine: { status: 'EXACT', rank: my.rank, score: my.score } };
  }

  function submitBoth() {
    if (denied) return;
    var now = Date.now();
    if (now - lastSubmitAt < SUBMIT_MS) return;
    var s = scores();
    if (s[1] === lastSent[1] && s[2] === lastSent[2]) return;
    lastSubmitAt = now;
    if (mock || !hasApi) { lastSent[1] = s[1]; lastSent[2] = s[2]; return; }
    function one(board, score) {
      if (score === lastSent[board]) return Promise.resolve();
      return callApi('submitScore', { board: board, score: score }).then(function () {
        lastSent[board] = score;
      }, function (e) {
        var c = errCode(e);
        if (c === 1005 || c === 1006) markDenied();
        // other errors: do not advance lastSent so a later save can retry
      });
    }
    one(1, s[1]).then(function () { return one(2, s[2]); });
  }

  function loadBoard(board, period) {
    period = period || 'all';
    var key = board + ':' + period;
    var hit = cache[key];
    if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit);
    if (mock || !hasApi) {
      var m = mockList(board);
      var out = { at: Date.now(), list: m.list, mine: m.mine, mock: true };
      cache[key] = out;
      return Promise.resolve(out);
    }
    return callApi('getRankList', { board: board, period: period }).then(function (res) {
      var list = (res && res.data) || [];
      return callApi('getMyRank', { board: board, period: period }).then(function (mine) {
        var out = { at: Date.now(), list: list, mine: mine || {}, mock: false };
        cache[key] = out;
        return out;
      }, function (e) {
        if (errCode(e) === 2002) throw e;
        var out = { at: Date.now(), list: list, mine: {}, mock: false };
        cache[key] = out;
        return out;
      });
    });
  }

  var COLORS = ['#c45c26', '#3d6b4f', '#7a4ea3', '#2b6aa3', '#a36b2b', '#6b3d3d'];
  function avatarHtml(row) {
    var src = row.avatar || row.avatarUrl || row.headUrl || '';
    if (src && (src.indexOf('data:') === 0 || src.indexOf('file') === 0 || src.charAt(0) === '/')) {
      return '<span class="xhs-av"><img alt="" src="' + escapeAttr(src) + '"></span>';
    }
    var name = row.nickname || '农';
    var ch = name.charAt(0);
    var col = COLORS[Math.abs(hash(name)) % COLORS.length];
    return '<span class="xhs-av" style="background:' + col + '">' + escapeHtml(ch) + '</span>';
  }
  function hash(s) {
    var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function mineLine(mine, board) {
    if (!mine) return '我的排名：还没有成绩';
    if (mine.status === 'OVER_LIMIT') return '我的排名：500 名以外' + (mine.score != null ? ' · ' + fmt(mine.score, board) : '');
    if (mine.status === 'NO_SCORE') return '我的排名：本期还没有成绩';
    if (mine.status === 'NOT_PARTICIPATING') return '我的排名：还没上榜';
    if (mine.status === 'EXACT' || mine.rank) return '我的排名：第 ' + mine.rank + ' 名 · ' + fmt(mine.score, board);
    return '我的排名：还没有成绩';
  }
  function fmt(n, board) {
    if (n == null || !isFinite(n)) return '—';
    n = Math.round(n);
    return board === 2 ? (n + ' 天') : (n + ' 金');
  }

  var sheet, currentBoard = 1, retryT = 0;

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'xhs-board';
    sheet.className = 'panel';
    sheet.hidden = true;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-b]') : null;
      var x = e.target.closest ? e.target.closest('[data-x]') : null;
      if (x) { close(); return; }
      if (b) { currentBoard = +b.getAttribute('data-b'); render(true); }
    });
    return sheet;
  }

  function close() {
    if (sheet) sheet.hidden = true;
    if (P._markTabs) P._markTabs();
  }

  function followBtnHtml() {
    return '<button type="button" class="xhs-ico xhs-ico-author" id="xhs-board-follow" title="关注作者" aria-label="关注作者"><i></i></button>';
  }

  function bindFollow(el) {
    var b = el && el.querySelector('#xhs-board-follow');
    if (!b) return;
    var host = typeof window !== 'undefined' && window.xhs && window.xhs.miniTool;
    if (host && !(P.creatorFollow && (typeof P.creatorFollow.available === 'function' ? P.creatorFollow.available() : P.creatorFollow.available))) {
      b.hidden = true;
      return;
    }
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (P.onFollowCreator) P.onFollowCreator();
    });
    if (typeof P.paintFollow === 'function' && typeof P._followStatus === 'number' && P._followStatus >= 0) {
      P.paintFollow(P._followStatus);
    }
  }

  function render(force) {
    if (denied) return;
    var el = ensureSheet();
    el.hidden = false;
    if (P._markTabs) P._markTabs();
    var unit = currentBoard === 2 ? '农场天数' : '累计金币';
    el.innerHTML = '<div class="xhs-board-hd"><b>排行榜</b><span>' + unit + '</span>' + followBtnHtml() + '<button type="button" class="pbtn" data-x="1">×</button></div>' +
      '<div class="xhs-board-tabs">' +
      '<button type="button" class="pbtn' + (currentBoard === 1 ? ' on' : '') + '" data-b="1">累计金币</button>' +
      '<button type="button" class="pbtn' + (currentBoard === 2 ? ' on' : '') + '" data-b="2">农场天数</button>' +
      '</div><div class="xhs-board-body">载入中…</div>';
    bindFollow(el);
    loadBoard(currentBoard, 'all').then(function (data) {
      var body = el.querySelector('.xhs-board-body');
      if (!body) return;
      var rows = (data.list || []).slice(0, 100);
      var html = '';
      if (data.mock) html += '<div class="note">预览数据（正式环境会显示真实玩家）</div>';
      if (!rows.length) html += '<div class="note">还没人上榜，去赚点金币吧。</div>';
      html += '<ol class="xhs-board-list">';
      rows.forEach(function (r) {
        var name = r.nickname || '小红薯';
        var me = name === '我' ? ' me' : '';
        html += '<li class="' + me + '"><i>' + r.rank + '</i>' + avatarHtml(r) + '<span class="n">' + escapeHtml(name) + '</span><span class="s">' + fmt(r.score, currentBoard) + '</span></li>';
      });
      html += '</ol><div class="xhs-board-me">' + mineLine(data.mine, currentBoard) + '</div>';
      body.innerHTML = html;
    }, function (e) {
      var body = el.querySelector('.xhs-board-body');
      var msg = handleErr(e, '榜单正在准备…');
      if (denied) return;
      if (body) body.innerHTML = '<div class="note">' + escapeHtml(msg) + '</div>';
      if (errCode(e) === 2002) {
        clearTimeout(retryT);
        retryT = setTimeout(function () { if (sheet && !sheet.hidden) render(true); }, 1000);
      }
    });
  }

  function open() {
    if (denied) return;
    if (isHost && !hasApi) {
      var el = ensureSheet();
      el.hidden = false;
      el.innerHTML = '<div class="xhs-board-hd"><b>排行榜</b>' + followBtnHtml() + '<button type="button" class="pbtn" data-x="1">×</button></div>' +
        '<div class="xhs-board-body"><div class="note">当前客户端还不支持排行榜，请升级到 9.51 以上。</div></div>';
      el.querySelector('[data-x]').addEventListener('click', close);
      bindFollow(el);
      if (P._markTabs) P._markTabs();
      return;
    }
    // close other sheets
    ['shop', 'store', 'menu'].forEach(function (id) {
      var n = document.getElementById(id); if (n) n.hidden = true;
    });
    submitBoth();
    render(true);
  }

  function onSaved() {
    if (denied) return;
    submitBoth();
  }

  root.addEventListener('pf:saved', onSaved);

  P.leaderboard = {
    hasApi: hasApi,
    mock: mock,
    open: open,
    close: close,
    submit: submitBoth,
    boards: { gold: 1, days: 2 }
  };

  if (denied) markDenied();
})(typeof window !== 'undefined' ? window : globalThis);
