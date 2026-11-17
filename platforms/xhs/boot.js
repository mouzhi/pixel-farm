/* 等平台存储预热、竖屏壳量好 framebuffer 后再按顺序加载游戏脚本 */
(function () {
  var scripts = [
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
    'game.js',
    'audio-config.js',
    'audio.js',
    'ui.js',
    'leaderboard.js',
    'assets/audio-data.js'
  ];
  function loadAll() {
    var i = 0;
    function next() {
      if (i >= scripts.length) {
        var p = window.PFPlatform;
        if (p && typeof p.flush === 'function') {
          document.addEventListener('visibilitychange', function () {
            if (document.hidden) p.flush();
          });
        }
        return;
      }
      var s = document.createElement('script');
      s.src = scripts[i++];
      s.onload = next;
      s.onerror = function () { console.error('[farm] failed to load', s.src); if (s.src.indexOf('audio-data') !== -1) next(); };
      document.head.appendChild(s);
    }
    next();
  }
  function after(p, fn) {
    if (p && typeof p.then === 'function') p.then(fn, fn);
    else fn();
  }
  var plat = window.PFPlatform || {};
  after(plat.ready, function () { after(plat.chromeReady, loadAll); });
})();
