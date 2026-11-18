/* 排行榜适配：board 1 = 累计金币，board 2 = 农场天数。9.51+ 内测 API；未授权隐藏入口。 */
(function (root) {
  'use strict';
  var P = root.PFPlatform || (root.PFPlatform = {});
  // 1.1.1：排行榜是 9.51+ 内测能力。只有「方法已注入 + 客户端版本够 + 没被拒绝」时奖杯面板才出现「排行榜」页签；
  // 1.1.0 在旧客户端上一直停在「载入中…」，被拒绝（1005）时也停在「载入中…」，现在都不会了。
  // 没有容器时不再展示假的预览榜单。
  function hasApiNow() {
    if (P.supports) return P.supports('submitScore') && P.supports('getRankList') && P.supports('getMyRank');
    return false;
  }
  var hasApi = hasApiNow();
  var mock = false;
  var denied = false;
  function rankUsable() { return !denied && hasApiNow(); }
  var RANK_TIMEOUT_MS = 6000;
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
      if (!hasApiNow() || !P.callMiniTimed) { reject({ errCode: 0, errMsg: 'unsupported' }); return; }
      P.callMiniTimed(name, args, RANK_TIMEOUT_MS).then(resolve, reject);
    });
  }

  function markDenied() {
    // 排行榜未授权时只关掉榜单数据，图鉴 / 成就仍从奖杯入口打开。
    denied = true;
  }

  function handleErr(e, loading) {
    var c = errCode(e);
    if (c === 1005 || c === 1006 || c === 10003) { markDenied(); return '排行榜暂未开放'; }
    if (c === -2) return '排行榜没有响应，稍后再试';
    if (c === 2002) return '榜单正在准备，稍后再看';
    if (c === 2009) return '请求太频繁，稍后再试';
    if (c === 1004) return '分数超出榜单范围';
    if (!hasApiNow()) return '当前小红书版本还看不了排行榜';
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
    if (!rankUsable()) { lastSent[1] = s[1]; lastSent[2] = s[2]; return; }
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
    if (mock) {
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

  var sheet, currentBoard = 1, section = 'book', retryT = 0, retryN = 0;

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'xhs-board';
    sheet.className = 'panel';
    sheet.hidden = true;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) {
      var sec = e.target.closest ? e.target.closest('[data-sec]') : null;
      var b = e.target.closest ? e.target.closest('[data-b]') : null;
      var x = e.target.closest ? e.target.closest('[data-x]') : null;
      if (x) { close(); return; }
      var retry = e.target.closest ? e.target.closest('[data-retry]') : null;
      if (sec) { section = sec.getAttribute('data-sec'); if (section === 'rank') submitBoth(); render(true); return; }
      if (b) { currentBoard = +b.getAttribute('data-b'); render(true); return; }
      if (retry) { cache = {}; retryN = 0; render(true); }
    });
    return sheet;
  }

  function parkCodex() {
    var c = document.getElementById('codex');
    if (!c) return;
    if (c.parentNode !== document.body) document.body.appendChild(c);
    c.removeAttribute('data-hosted');
    c.hidden = true;
  }

  function close() {
    parkCodex();
    if (sheet) sheet.hidden = true;
    if (P._markTabs) P._markTabs();
  }

  function sectionTabsHtml() {
    var tabs = [
      { id: 'rank', name: '排行榜' },
      { id: 'book', name: '图鉴' },
      { id: 'ach', name: '成就' },
      { id: 'ms', name: '里程碑' }
    ].filter(function (t) { return t.id !== 'rank' || rankUsable(); });
    return '<div class="xhs-board-sections">' + tabs.map(function (t) {
      return '<button type="button" class="pbtn' + (section === t.id ? ' on' : '') + '" data-sec="' + t.id + '">' + t.name + '</button>';
    }).join('') + '</div>';
  }

  function paintChrome(el, subtitle) {
    var titles = { rank: '排行榜', book: '图鉴', ach: '成就', ms: '里程碑' };
    var extra = (section === 'rank' && subtitle) ? '<span>' + subtitle + '</span>' : '';
    el.innerHTML = '<div class="xhs-board-hd"><b>' + (titles[section] || '图鉴') + '</b>' + extra + followBtnHtml() + '<button type="button" class="pbtn" data-x="1">×</button></div>' +
      sectionTabsHtml() +
      (section === 'rank' ? ('<div class="xhs-board-tabs">' +
        '<button type="button" class="pbtn' + (currentBoard === 1 ? ' on' : '') + '" data-b="1">累计金币</button>' +
        '<button type="button" class="pbtn' + (currentBoard === 2 ? ' on' : '') + '" data-b="2">农场天数</button>' +
        '</div>') : '') +
      '<div class="xhs-board-body"></div>';
    bindFollow(el);
  }

  function showCodex(tab) {
    var el = ensureSheet();
    var body = el.querySelector('.xhs-board-body');
    var c = document.getElementById('codex');
    if (!body) return;
    if (!c) { body.innerHTML = '<div class="note">图鉴还没准备好。</div>'; return; }
    body.innerHTML = '';
    body.appendChild(c);
    c.setAttribute('data-hosted', '1');
    c.hidden = false;
    if (root.__farm && typeof root.__farm.openCodexTab === 'function') root.__farm.openCodexTab(tab, { hosted: true });
  }

  function followBtnHtml() {
    return '<button type="button" class="xhs-ico xhs-ico-author" id="xhs-board-follow" title="关注作者" aria-label="关注作者"><i></i></button>';
  }

  function bindFollow(el) {
    var b = el && el.querySelector('#xhs-board-follow');
    if (!b) return;
    if (!(P.creatorFollow && (typeof P.creatorFollow.available === 'function' ? P.creatorFollow.available() : P.creatorFollow.available))) {
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
    var el = ensureSheet();
    el.hidden = false;
    if (P._markTabs) P._markTabs();
    if (section === 'rank' && !rankUsable()) section = 'book';
    if (section !== 'rank') {
      parkCodex();
      paintChrome(el);
      showCodex(section);
      return;
    }
    parkCodex();
    var unit = currentBoard === 2 ? '农场天数' : '累计金币';
    paintChrome(el, unit);
    var body0 = el.querySelector('.xhs-board-body');

    if (body0) body0.innerHTML = '载入中…';
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
      if (denied) {
        // 未开通：去掉排行榜页签，回到图鉴，并告诉玩家一声
        if (P.notice) P.notice(msg);
        section = 'book';
        if (sheet && !sheet.hidden) render(true);
        return;
      }
      var again = errCode(e) === 2002 && retryN < 4;
      if (body) body.innerHTML = '<div class="note">' + escapeHtml(msg) + '</div>' +
        (again ? '' : '<button type="button" class="pbtn" data-retry="1">再试一次</button>');
      if (again) {
        clearTimeout(retryT);
        var wait = 500 * Math.pow(2, retryN++);
        retryT = setTimeout(function () { if (sheet && !sheet.hidden && section === 'rank') render(true); }, wait);
      } else retryN = 0;
    });
  }

  function open() {
    // close other sheets (图鉴嵌在本面板里，奖杯入口始终可开)
    ['shop', 'store', 'menu'].forEach(function (id) {
      var n = document.getElementById(id); if (n) n.hidden = true;
    });
    var dock = document.getElementById('xhs-inv-dock');
    if (dock) dock.hidden = true;
    if (section === 'rank' && rankUsable()) submitBoth();
    render(true);
  }

  function onSaved() {
    if (denied) return;
    submitBoth();
  }

  root.addEventListener('pf:saved', onSaved);

  P.leaderboard = {
    hasApi: hasApi,
    usable: rankUsable,
    mock: mock,
    open: open,
    close: close,
    submit: submitBoth,
    boards: { gold: 1, days: 2 }
  };

  if (denied) markDenied();
})(typeof window !== 'undefined' ? window : globalThis);
