// v12 (douyin): the web game's own DOM UI (ui.js & co.) now runs on the landing's mini-DOM and is drawn as Taro views.
// These patches only touch the UI / camera glue; game rules are unchanged.
export const UI_PATCHES = {
  'game.js': [
    // v16.3: hud() runs every frame and rebuilt the event log and the fishing box strings each time (~19 KB with fish icon data URLs,
    // ~1 MB/s of throwaway strings at 60 fps); the mini-DOM then dropped them as unchanged. Rebuild only when their inputs change.
    ["  document.getElementById('log').innerHTML = S.log.map((s, i) => {",
     "  const logEl = document.getElementById('log'), logKey = S.log.length + '|' + S.log[0] + '|' + S.log[1] + '|' + (lastCatch ? lastCatch.line + (lastCatch.url ? 1 : 0) : '');\n  if (logEl.__k !== logKey) logEl.__k = logKey, logEl.innerHTML = S.log.map((s, i) => {"],
    ["  const box = document.getElementById('catches');\n  if (box) {",
     "  const box = document.getElementById('catches'), c0 = S.catches[0], boxKey = S.day + '|' + S.fishGold + '|' + S.catches.length + '|' + (c0 ? c0.day + c0.id + c0.gold + c0.name : '');\n  if (box && (box.__k !== boxKey || box.__c0 !== c0)) { box.__k = boxKey; box.__c0 = c0;"],
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
    // v16: glowing / giant crop icons in the item bar were redrawn on every bar refresh (new canvases + a pixel read-back each time);
    // they only depend on (crop, kind, seen, size), so draw each once and keep its tag, and free the scratch canvases at once
    ['  function decorateCrop(type, mode, seen, fit) {\n    const src = G.cropFrame && G.cropFrame(type);',
     "  const dcCache = {};\n  function decorateCrop(type, mode, seen, fit) {\n    const k = type + '|' + mode + '|' + (seen ? 1 : 0) + '|' + (fit || 0);\n    if (dcCache[k]) return dcCache[k];\n    const out = decorateCrop0(type, mode, seen, fit);\n    if (out.indexOf('ico crop') >= 0) dcCache[k] = out;\n    return out;\n  }\n  function decorateCrop0(type, mode, seen, fit) {\n    const src = G.cropFrame && G.cropFrame(type);"],
    ['    const url = ICN ? ICN.urlOf(img) : c.toDataURL();\n', '    const url = ICN ? ICN.urlOf(img) : c.toDataURL();\n    c.width = c.height = 0; src.width = src.height = 0;\n'],
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
