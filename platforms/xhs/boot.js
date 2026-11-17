/* 等平台存储预热后再按顺序加载游戏脚本（避免 PFSave.read 读到空存储） */
(function () {
  var scripts = [
    'assets/palette.js',
    'assets/sprites.js',
    'sim.js',
    'world.js',
    'animals.js',
    'fish.js',
    'family.js',
    'surprise.js',
    'save.js',
    'playlog.js',
    'fx.js',
    'game.js',
    'ui.js'
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
      s.onerror = function () { console.error('[farm] failed to load', s.src); };
      document.head.appendChild(s);
    }
    next();
  }
  var ready = window.PFPlatform && window.PFPlatform.ready;
  if (ready && typeof ready.then === 'function') ready.then(loadAll, loadAll);
  else loadAll();
})();
