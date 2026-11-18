/* 等本地存档预热、竖屏壳量好 framebuffer 后再加载游戏脚本。
   不在首屏关键路径拉音频；game.js 跑起来、人物开始动之后再加载 audio / UI / 排行榜。 */
(function () {
  var CORE = [
    'assets/palette.js',
    'assets/sprites.js',
    'assets/family_sprites.js',
    'sim.js',
    'world.js',
    'wood.js',
    'path.js',
    'animals.js',
    'fish.js',
    'kids.js',
    'family.js',
    'surprise.js',
    'weather.js',
    'insects.js',
    'codex.js',
    'codex_icons.js',
    'save.js',
    'playlog.js',
    'fx.js',
    'game.js'
  ];
  var AFTER = [
    'audio-config.js',
    'audio.js',
    'ui.js',
    'leaderboard.js'
  ];
  function loadList(list, done) {
    var i = 0;
    function next() {
      if (i >= list.length) {
        if (done) done();
        return;
      }
      var s = document.createElement('script');
      s.src = list[i++];
      s.onload = next;
      s.onerror = function () { console.error('[farm] failed to load', s.src); failed.push(s.src); next(); };
      document.head.appendChild(s);
    }
    next();
  }
  function after(p, fn) {
    if (p && typeof p.then === 'function') p.then(fn, fn);
    else fn();
  }
  function afterFirstFrames(fn) {
    var n = 0;
    function tick() {
      n++;
      if (n >= 2) fn();
      else if (window.requestAnimationFrame) requestAnimationFrame(tick);
      else setTimeout(fn, 0);
    }
    if (window.requestAnimationFrame) requestAnimationFrame(tick);
    else setTimeout(fn, 32);
  }
  // 1.1.1：游戏脚本没跑起来时（例如包内资源没取回来），不要留一排点不动的按钮，
  // 显示一条说明和「重新加载」按钮（官方 §2.7 要求为资源加载失败准备重试入口）。
  var failed = [];
  var failShown = false;
  function showBootFail() {
    if (failShown || window.__farm) return;
    failShown = true;
    var box = document.createElement('div');
    box.id = 'xhs-boot-fail';
    var msg = document.createElement('div');
    msg.textContent = '农场没有加载完整，可能是网络不稳。点下面重新加载。';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '重新加载';
    btn.addEventListener('click', function () { try { location.reload(); } catch (e) {} });
    box.appendChild(msg);
    box.appendChild(btn);
    (document.body || document.documentElement).appendChild(box);
  }
  setTimeout(function () { if (!window.__farm) showBootFail(); }, 20000);
  function onCoreReady() {
    if (!window.__farm) { showBootFail(); return; }
    var p = window.PFPlatform;
    if (p && typeof p.flush === 'function') {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) p.flush();
      });
    }
    afterFirstFrames(function () {
      loadList(AFTER, function () {
        var A = window.PFAudio;
        if (A && typeof A.warmWhenIdle === 'function') A.warmWhenIdle();
      });
    });
  }
  var plat = window.PFPlatform || {};
  after(plat.ready, function () { after(plat.chromeReady, function () { loadList(CORE, onCoreReady); }); });
})();
