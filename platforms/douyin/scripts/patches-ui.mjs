// v12 (douyin): the web game's own DOM UI (ui.js & co.) now runs on the landing's mini-DOM and is drawn as Taro views.
// These patches only touch the UI / camera glue; game rules are unchanged.
export const UI_PATCHES = {
  'game.js': [
    // follow the farmer (xhs: PFPlatform.followFarmer; the douyin shell starts with it off) and the two-finger gesture lock
    ['  cam.a += (cam.ta - cam.a) * (1 - Math.exp(-dt * 14)); if (Math.abs(cam.ta - cam.a) < ASTEP / 4) cam.a = cam.ta;',
     '  cam.a += (cam.ta - cam.a) * (1 - Math.exp(-dt * 14)); if (Math.abs(cam.ta - cam.a) < ASTEP / 4) cam.a = cam.ta;\n  if (window.PFPlatform && PFPlatform.followFarmer && !drag) panTo(FARMER.x, FARMER.y); // douyin v12: same as xhs'],
    ["cv.addEventListener('pointermove', e => { hoverAt(e); if (!drag) return;",
     "function cancelDrag() { drag = null; document.body.classList.remove('grab'); }\ncv.addEventListener('pointermove', e => { if (window.PFPlatform && PFPlatform.gestureLock) { if (drag) cancelDrag(); return; } hoverAt(e); if (!drag) return;"],
    ['window.__trialHooks = { FOG, cam, zoomBy: d => { zoom = clamp(zoom + d, 0, 3); fit(); }, fit };',
     'window.__trialHooks = { FOG, cam, zoomBy: d => { zoom = clamp(zoom + d, 0, 3); fit(); }, fit };\nObject.assign(window.__farm, { fit, cancelDrag, setZoom: z => { zoom = clamp(z | 0, 0, 3); fit(); return zoom; }, getZoom: () => zoom, cam }); // douyin v12: pinch zoom (xhs hooks)'],
  ],
  'ui.js': [
    // no minimap on the phone (douyin env returns null for it)
    ["  const mm = $('minimap'); if (", "  const mm = $('minimap') || document.createElement('div'); if ("],
    // icons straight from the character art (no canvas per icon: every canvas is a GL canvas on Douyin)
    ['  function pixIcon(rows, cols) {\n', '  function pixIcon(rows, cols) {\n    if (window.__pixURL) return window.__pixURL(rows, cols);\n'],
    // region signs over the map are not shown on Douyin (the throttled overlay would trail the map); stop their per-frame loop
    ['    requestAnimationFrame(place); })();', '    if (!window.__noSigns) requestAnimationFrame(place); })();'],
  ],
  'plots-ui.js': [
    ['  function pixIcon(rows, cols) { ', '  function pixIcon(rows, cols) { if (window.__pixURL) return window.__pixURL(rows, cols); '],
    ['    requestAnimationFrame(place); })();', '    if (!window.__noSigns) requestAnimationFrame(place); })();'],
  ],
  'codex_icons.js': [
    ['  function urlOf(img) {\n', '  function urlOf(img) {\n    if (window.__pngURL) return window.__pngURL(img.w, img.h, img.px);\n'],
  ],
  'touch.js': [
    // a 10 Hz tick instead of a frame callback (the bar and crosshair state do not need 60 Hz)
    ['    root.requestAnimationFrame(tick);\n  }\n  root.requestAnimationFrame(tick);', '    setTimeout(tick, 100);\n  }\n  setTimeout(tick, 100);'],
  ],
};
