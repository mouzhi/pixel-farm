// v12 (douyin): the web game's own DOM UI (ui.js & co.) now runs on the landing's mini-DOM and is drawn as Taro views.
// These patches only touch the UI / camera glue; game rules are unchanged.
export const UI_PATCHES = {
  'game.js': [
    ["  if (warm > 0) { ctx.globalCompositeOperation = 'multiply';", "  if (warm > 0 && window.__mulFill) window.__mulFill(ctx, 255, 190 + 40 * (1 - warm), 150 + 80 * (1 - warm), 0.55 * warm, W, H);\n  else if (warm > 0) { ctx.globalCompositeOperation = 'multiply';"],
    // follow the farmer (xhs: PFPlatform.followFarmer; the douyin shell starts with it off) and the two-finger gesture lock
    ['  cam.a += (cam.ta - cam.a) * (1 - Math.exp(-dt * 14)); if (Math.abs(cam.ta - cam.a) < ASTEP / 4) cam.a = cam.ta;',
     '  cam.a += (cam.ta - cam.a) * (1 - Math.exp(-dt * 14)); if (Math.abs(cam.ta - cam.a) < ASTEP / 4) cam.a = cam.ta;\n  if (window.PFPlatform && PFPlatform.followFarmer && !drag) panTo(FARMER.x, FARMER.y); // douyin v12: same as xhs'],
    ["cv.addEventListener('pointermove', e => { hoverAt(e); if (!drag) return;",
     "function cancelDrag() { drag = null; document.body.classList.remove('grab'); }\ncv.addEventListener('pointermove', e => { if (window.PFPlatform && PFPlatform.gestureLock) { if (drag) cancelDrag(); return; } hoverAt(e); if (!drag) return;"],
    ['window.__trialHooks = { FOG, cam, zoomBy: d => { zoom = clamp(zoom + d, 0, 3); fit(); }, fit };',
     'window.__trialHooks = { FOG, cam, zoomBy: d => { zoom = clamp(zoom + d, 0, 3); fit(); }, fit };\nObject.assign(window.__farm, { fit, cancelDrag, setZoom: z => { zoom = clamp(z | 0, 0, 3); fit(); return zoom; }, getZoom: () => zoom, cam }); // douyin v12: pinch zoom (xhs hooks)'],
  ],
  // v15: the dusk / dawn warm tint and the rain wash use canvas 'multiply'. On the phone that blend came out grey, so they go through a
  // hook (farm-env __mulFill): native multiply where the canvas does it right, an equivalent source-over fill where not
  'weather.js': [
    ["    ctx.save();\n    ctx.globalCompositeOperation = 'multiply';\n    ctx.fillStyle = `rgba(150, 165, 190, ${Math.min(0.28, a)})`;\n    ctx.fillRect(0, 0, W, H);\n    ctx.restore();\n    return 1;",
     "    if (window.__mulFill) { window.__mulFill(ctx, 150, 165, 190, Math.min(0.28, a), W, H); return 1; }\n    ctx.save();\n    ctx.globalCompositeOperation = 'multiply';\n    ctx.fillStyle = `rgba(150, 165, 190, ${Math.min(0.28, a)})`;\n    ctx.fillRect(0, 0, W, H);\n    ctx.restore();\n    return 1;"],
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
    // v13: the toolbox button is a picture from the same atlas as the bottom bar (no glyph), 48px like the bar buttons
    ["mk('button', 'pt-box', '', '<span class=\"g\">⚒</span>')", "mk('button', 'pt-box', '', '<i class=\"g\"></i>')"],
    ["box.style.top = Math.round(top - 66) + 'px';", "box.style.top = Math.round(top - 58) + 'px';"],
    ['<h4><span>⚒ 工具</span>', '<h4><span>工具</span>'],
    ['    root.requestAnimationFrame(tick);\n  }\n  root.requestAnimationFrame(tick);', '    setTimeout(tick, 100);\n  }\n  setTimeout(tick, 100);'],
  ],
};
