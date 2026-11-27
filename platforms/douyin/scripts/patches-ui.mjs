// v12 (douyin): the web game's own DOM UI (ui.js & co.) now runs on the landing's mini-DOM and is drawn as Taro views.
// These patches only touch the UI / camera glue; game rules are unchanged.
export const UI_PATCHES = {
  'game.js': [
    // v16.5: pixText (the sleeping Zs, +gold numbers) was a fillRect per lit pixel, five per pixel with its outline. Each pass now marks its
    // pixels, merges them into row runs and equal-span vertical stacks, and fills one path. The rects of a pass do not overlap except the
    // outline's own neighbours, which a union fills once (only differs where the text is translucent and two outline rects overlapped)
    ["      if (pass) ctx.fillRect(gx, gy, sc, sc); else for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(gx + ox, gy + oy, sc, sc); } }); }\n}",
     "      if (pass) pxAdd(gx, gy); else { pxAdd(gx + 1, gy); pxAdd(gx - 1, gy); pxAdd(gx, gy + 1); pxAdd(gx, gy - 1); } } });\n    const ys = [...rows.keys()].sort((a, b) => a - b), open = new Map(), out = [];\n    for (const yy of ys) { const xs = rows.get(yy).sort((a, b) => a - b); let a = xs[0], b = a; for (let i = 1; i <= xs.length; i++) { const v = xs[i]; if (v === undefined || v > b + 1) { const key = a + ',' + b, o = open.get(key); if (o && o.y + o.h === yy) o.h++; else { const r = { x: a, y: yy, w: b - a + 1, h: 1 }; out.push(r); open.set(key, r); } a = v; b = v; } else if (v > b) b = v; } }\n    ctx.beginPath(); for (const r of out) ctx.rect(r.x, r.y, r.w, r.h); ctx.fill(); }\n}"],
    ["  for (const pass of [0, 1]) { ctx.fillStyle = pass ? col : Ink[0];\n    [...s].forEach((ch, i) => { const g = FONT[ch];",
     "  for (const pass of [0, 1]) { ctx.fillStyle = pass ? col : Ink[0]; const rows = new Map(), pxAdd = (px, py) => { for (let j = 0; j < sc; j++) { let r = rows.get(py + j); if (!r) rows.set(py + j, r = []); for (let k = 0; k < sc; k++) r.push(px + k); } };\n    [...s].forEach((ch, i) => { const g = FONT[ch];"],
    // v16.5 test probe: pixText old (per-pixel fillRect) vs new (path) on the live canvas, same task, returns the max channel difference
    ["function dayLight(T) {",
     "window.__pixTextProbe = (s, x, y, col, sc, alpha) => { const px0 = ctx.getImageData(0, 0, W, H), old = () => { const w = s.length * 4 * sc - sc, X = Math.round(x - w / 2), Y = Math.round(y); for (const pass of [0, 1]) { ctx.fillStyle = pass ? col : Ink[0]; [...s].forEach((ch, i) => { const g = FONT[ch]; if (!g) return; for (let k = 0; k < 15; k++) if (g[k] === '1') { const gx = X + (i * 4 + k % 3) * sc, gy = Y + Math.floor(k / 3) * sc; if (pass) ctx.fillRect(gx, gy, sc, sc); else for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(gx + ox, gy + oy, sc, sc); } }); } }; ctx.save(); ctx.globalAlpha = alpha; old(); ctx.restore(); const a = ctx.getImageData(0, 0, W, H); ctx.putImageData(px0, 0, 0); ctx.save(); ctx.globalAlpha = alpha; pixText(s, x, y, col, sc); ctx.restore(); const b = ctx.getImageData(0, 0, W, H); ctx.putImageData(px0, 0, 0); let m = 0, n = 0; for (let i = 0; i < a.data.length; i++) { const d = Math.abs(a.data[i] - b.data[i]); if (d > m) m = d; if (d) n++; } return { max: m, diffChannels: n }; };\nfunction dayLight(T) {"],
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
  // v16.5: insects (butterflies, dragonflies) were ~27 one-pixel fillRects each, every frame (outline + cells): ~137 canvas commands
  // per frame with a few insects out. Each (cells + colours) look is painted once into a small shared atlas canvas and drawn with one
  // drawImage at the same place (1:1, no smoothing: the same pixels)
  'insects.js': [
    ["  function stamp(ctx, ox, oy, cells) {\n    const filled",
     "  const ATL = { c: null, g: null, slots: new Map(), n: 0 }, ATS = 10, ATO = 4, ATN = 24;\n  function atlasSlot(key, cells) {\n    for (const [dx, dy] of cells) if (dx < -3 || dx > 4 || dy < -3 || dy > 4) return -1;\n    if (ATL.n >= ATN) return -1;\n    if (!ATL.c) { ATL.c = document.createElement('canvas'); ATL.c.width = ATS * ATN; ATL.c.height = ATS; ATL.g = ATL.c.getContext('2d'); }\n    const i = ATL.n++; stampPx(ATL.g, i * ATS + ATO, ATO, cells); ATL.slots.set(key, i); return i;\n  }\n  function stamp(ctx, ox, oy, cells) {\n    if (window.__insAtlas) {\n      let key = ''; for (const c of cells) key += c[0] + ',' + c[1] + ',' + c[2] + ';';\n      let sl = ATL.slots.get(key); if (sl === undefined) { sl = atlasSlot(key, cells); if (sl < 0) ATL.slots.set(key, -1); }\n      if (sl >= 0) { ctx.drawImage(ATL.c, sl * ATS, 0, ATS, ATS, ox - ATO, oy - ATO, ATS, ATS); return; }\n    }\n    stampPx(ctx, ox, oy, cells);\n  }\n  function stampPx(ctx, ox, oy, cells) {\n    const filled"],
  ],
  'weather.js': [
    // v16.4: the wet-path stamp (every path on the map stroked 4+ px wide with round caps onto a full-screen canvas) was redrawn
    // every frame while wet; it only changes when the view does, so keep it until the projection / size / paths change. Where canvas
    // multiply is wrong (Douyin), the grey multiply is the same as black at alpha a·(1 − 118/255) over source-over
    ["      sctx.clearRect(0, 0, W, H);\n      sctx.strokeStyle = 'rgb(120, 116, 122)';\n      strokeWetPaths(sctx, proj, RS, st, W, H);\n      ctx.globalAlpha = 0.4 * V.wet;\n      ctx.globalCompositeOperation = 'multiply';\n      ctx.drawImage(V.wetCv, 0, 0);",
     "      const mn = !window.__mulNative || window.__mulNative(), p0 = proj(0, 0), p1 = proj(64, 64), wk = [W, H, RS, mn ? 1 : 0, p0[0], p0[1], p1[0], p1[1], (st.pathSegs || []).length].join(',');\n      if (V.wetKey !== wk) { V.wetKey = wk;\n      sctx.clearRect(0, 0, W, H);\n      sctx.strokeStyle = mn ? 'rgb(120, 116, 122)' : '#000';\n      strokeWetPaths(sctx, proj, RS, st, W, H); }\n      ctx.globalAlpha = mn ? 0.4 * V.wet : 0.4 * V.wet * (1 - 118 / 255);\n      if (mn) ctx.globalCompositeOperation = 'multiply';\n      ctx.drawImage(V.wetCv, 0, 0);"],
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
