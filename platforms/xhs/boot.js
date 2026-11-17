/* 等本地存档预热、竖屏壳量好 framebuffer 后再加载游戏脚本。
   不在首屏关键路径拉音频；game.js 跑起来、人物开始动之后再加载 audio / UI / 排行榜。 */
(function () {
  var CORE = [
    'assets/palette.js',
    'assets/sprites.js',
    'sim.js',
    'world.js',
    'path.js',
    'animals.js',
    'fish.js',
    'family.js',
    'surprise.js',
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
      s.onerror = function () { console.error('[farm] failed to load', s.src); next(); };
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
  function onCoreReady() {
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
