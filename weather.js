// 像素农场 · 小雨天气（v5.4.3 第 7 阶段）：只做小雨，大约每 7–10 天下一场、持续 2–4 个游戏时；下雨那天已种的田算浇过。
// 纯函数可以在 Node 里直接 require 做单元测试；雨丝和湿路是便宜的画面钩子，由 game.js 挂上。下雨时池塘用原有的涟漪，只是更密一些，不再另画一套。
'use strict';
(function (root) {
  const GAP_MIN = 7, GAP_MAX = 10;
  const DUR_MIN = 2 * 60, DUR_MAX = 4 * 60; // game minutes
  const START_MIN = 8 * 60, START_SPAN = 6 * 60; // start between 8:00 and 13:59
  const SEASON_LEN = 30; // four seasons in a 120-day year; summer is the second block
  const WET_DECAY = 120; // minutes after the shower for paths to dry

  function emptyWeather() { return { nextDay: 0, start: 0, dur: 0, lastDay: 0, rained: 0, nextStart: 0, nextDur: 0 }; }
  function validWeather(w) {
    w = w && typeof w === 'object' ? w : {};
    const int = (v, d, lo, hi) => { v = Math.round(+v); if (!isFinite(v)) v = d; if (v < lo) v = lo; if (hi != null && v > hi) v = hi; return v; };
    return { nextDay: int(w.nextDay, 0, 0, 1e6), start: int(w.start, 0, 0, 1439), dur: int(w.dur, 0, 0, 8 * 60), lastDay: int(w.lastDay, 0, 0, 1e6), rained: w.rained ? 1 : 0, nextStart: int(w.nextStart, 0, 0, 1439), nextDur: int(w.nextDur, 0, 0, 8 * 60) };
  }
  function mulberry(a) {
    return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function rngFor(seed, day) { return mulberry(((seed | 0) ^ Math.imul((day | 0) + 1, 2654435761)) >>> 0); }

  function roll(fromDay, rng) {
    const gap = GAP_MIN + Math.floor(rng() * (GAP_MAX - GAP_MIN + 1));
    const start = START_MIN + Math.floor(rng() * START_SPAN);
    const hours = 2 + Math.floor(rng() * 3); // 2, 3 or 4
    return { nextDay: (fromDay | 0) + gap, start, dur: hours * 60 };
  }

  function ensure(w, day, seed) {
    w = validWeather(w);
    if (w.nextDay > 0) return w;
    return Object.assign(w, roll(Math.max(1, day | 0), rngFor(seed, day)), { rained: 0 });
  }

  // Dawn of `day` (the clock has already moved). If today is the scheduled rain day, mark it and pick the next
  // shower 7–10 days out. Today's start/dur stay put so isRaining still uses this shower's window; the next
  // window is stored in nextStart/nextDur and applied the morning after. Idempotent on the same day.
  function beginDay(w, day, seed) {
    w = ensure(w, day, seed);
    if ((w.lastDay | 0) === (day | 0)) return w;
    if (w.rained && (w.lastDay | 0) && (w.lastDay | 0) < (day | 0) && (w.nextStart | 0)) {
      w.start = w.nextStart; w.dur = w.nextDur; w.nextStart = 0; w.nextDur = 0;
    }
    w.rained = 0;
    if ((w.nextDay | 0) === (day | 0)) {
      w.rained = 1;
      w.lastDay = day | 0;
      const r = roll(day, rngFor(seed, (day | 0) + 17));
      w.nextDay = r.nextDay; w.nextStart = r.start; w.nextDur = r.dur;
    }
    return w;
  }

  // Walk each dawn from fromDay+1 through fromDay+floor(days). Used for offline catch-up.
  function advanceDays(w, fromDay, days, seed) {
    w = validWeather(w);
    const rains = [];
    const n = Math.max(0, Math.floor(+days || 0));
    for (let i = 0; i < n; i++) {
      const day = (fromDay | 0) + i + 1;
      const before = w.lastDay;
      w = beginDay(w, day, seed);
      if (w.rained && w.lastDay === day && before !== day) rains.push(day);
    }
    return { weather: w, rainDays: rains };
  }

  function isRainDay(w, day) { return !!(w && w.rained && (w.lastDay | 0) === (day | 0)); }
  function rainWindow(w) { w = w || {}; return { start: w.start | 0, end: (w.start | 0) + (w.dur | 0) }; }
  function isRaining(w, day, t) {
    if (!isRainDay(w, day)) return false;
    const tod = ((t % 1440) + 1440) % 1440, win = rainWindow(w);
    return tod >= win.start && tod < win.end;
  }
  function wetness(w, day, t) {
    if (!isRainDay(w, day)) return 0;
    const tod = ((t % 1440) + 1440) % 1440, win = rainWindow(w);
    if (tod < win.start) return 0;
    if (tod < win.end) return 1;
    const age = tod - win.end;
    if (age >= WET_DECAY) return 0;
    return Math.max(0, 1 - age / WET_DECAY);
  }
  function isSummer(day) { const d = (Math.max(1, day | 0) - 1) % (SEASON_LEN * 4); return d >= SEASON_LEN && d < SEASON_LEN * 2; }

  function forceRain(w, day, start, dur) {
    w = validWeather(w);
    return { nextDay: (day | 0) + GAP_MIN, start: start == null ? 10 * 60 : start, dur: dur == null ? 3 * 60 : dur, lastDay: day | 0, rained: 1, nextStart: 0, nextDur: 0 };
  }

  function simulate(days, seed) {
    let w = emptyWeather();
    const rains = [];
    for (let day = 1; day <= days; day++) {
      w = beginDay(w, day, seed == null ? 1 : seed);
      if (w.rained && w.lastDay === day) rains.push({ day, start: w.start, dur: w.dur });
    }
    return { weather: w, rains };
  }

  // ---- cheap visuals (browser). Rain is pooled world-space drops (v5.11.0.4); puddles are a fixed list along the paths. ----
  const V = { streaks: [], ripples: [], puddles: [], wet: 0, rain: 0, t: 0, pondT: 0, acc: 0 };

  function makePuddles(pathSegs, rng) {
    const out = [], segs = pathSegs || [];
    rng = rng || mulberry(0xA11CE);
    for (const s of segs) {
      const x0 = s[0], y0 = s[1], x1 = s[2], y1 = s[3], len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const n = Math.max(0, Math.round(len / 40));
      for (let i = 0; i < n; i++) {
        if (rng() > 0.5) continue;
        const u = (i + 0.25 + rng() * 0.5) / Math.max(1, n);
        out.push({
          x: x0 + (x1 - x0) * u + (rng() - 0.5) * 2,
          y: y0 + (y1 - y0) * u + (rng() - 0.5) * 1.2,
          rx: 1.6 + rng() * 1.7,
          ry: 0.8 + rng() * 0.65,
          wob: (rng() - 0.5) * 0.6,
        });
      }
    }
    return out.slice(0, 12);
  }
  function ensureVisual(pathSegs) { if (!V.puddles.length) V.puddles = makePuddles(pathSegs); }

  // ---- v5.11.0.4 细雨: world-space drops. Each drop has a ground target, falls a short way (a thin slanted 1-px streak, low alpha,
  // bluish grey), then lands: on ground a 3-frame pixel splash plus a small wet spot that fades in ~1.5 s; on water a hit that the
  // pond / sea / river paint with the existing ripple shape (game.js). Everything lives in fixed pools: no allocation while it rains.
  const RAIN = {
    RATE: 104,            // drops per second on the 426 x 266 framebuffer (scaled by screen area), ~28 in the air (the old rain had 44 streaks)
    FALL_MIN: 0.22, FALL_MAX: 0.34, // seconds a drop is visible
    H_MIN: 14, H_MAX: 24, // screen px above its target where a drop first shows
    SLANT: 0.3,          // screen px sideways per px of fall (the old streaks used 0.28)
    LEN_MIN: 4, LEN_MAX: 6,
    SPLASH: 0.06,        // seconds per splash frame (3 frames)
    WET_MIN: 1.1, WET_MAX: 1.9,
    RIPPLE: 1.0,         // seconds: the pond ripple's 5 frames x 0.2 s
    MAX_DROPS: 48, MAX_SPLASH: 40, MAX_WET: 160, MAX_HITS: 28,
  };
  function pool(n, mk) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = mk(); return { a, n: 0 }; }
  const P = {
    drops: pool(RAIN.MAX_DROPS, () => ({ x: 0, y: 0, t: 0, dur: 0, h: 0, len: 0, water: 0, fmax: 4, a: 0 })),
    splash: pool(RAIN.MAX_SPLASH, () => ({ x: 0, y: 0, age: 0 })),
    wet: pool(RAIN.MAX_WET, () => ({ x: 0, y: 0, age: 0, life: 0, w: 1 })),
    hits: pool(RAIN.MAX_HITS, () => ({ x: 0, y: 0, age: 0, fmax: 4, river: 0 })),
  };
  const take = q => (q.n < q.a.length ? q.a[q.n++] : null);
  const drop = (q, i) => { const o = q.a[i]; q.n--; q.a[i] = q.a[q.n]; q.a[q.n] = o; }; // swap-remove, the object stays in the pool
  function clearRain() { P.drops.n = P.splash.n = P.wet.n = P.hits.n = 0; V.acc = 0; }
  function land(d) {
    if (d.water) { const h = take(P.hits); if (h) { h.x = d.x; h.y = d.y; h.age = 0; h.fmax = d.fmax; h.river = d.water === 2 ? 1 : 0; } return; }
    const s = take(P.splash); if (s) { s.x = d.x; s.y = d.y; s.age = 0; }
    const w = take(P.wet); if (w) { w.x = d.x; w.y = d.y; w.age = 0; w.life = RAIN.WET_MIN + Math.random() * (RAIN.WET_MAX - RAIN.WET_MIN); w.w = Math.random() < 0.4 ? 2 : 1; }
  }
  // st.pick(): a world target { x, y, water: 0 | 1 (pond / sea) | 2 (river), fmax } under the screen, or null (a roof, off the map)
  function tickRain(dt, st, raining) {
    for (let i = P.drops.n - 1; i >= 0; i--) { const d = P.drops.a[i]; d.t += dt; if (d.t >= d.dur) { land(d); drop(P.drops, i); } }
    for (let i = P.splash.n - 1; i >= 0; i--) { const s = P.splash.a[i]; s.age += dt; if (s.age >= RAIN.SPLASH * 3) drop(P.splash, i); }
    for (let i = P.wet.n - 1; i >= 0; i--) { const w = P.wet.a[i]; w.age += dt; if (w.age >= w.life) drop(P.wet, i); }
    for (let i = P.hits.n - 1; i >= 0; i--) { const h = P.hits.a[i]; h.age += dt; if (h.age >= RAIN.RIPPLE) drop(P.hits, i); }
    if (!raining || typeof st.pick !== 'function') { V.acc = 0; return; }
    const area = ((st.W || 426) * (st.H || 266)) / (426 * 266);
    V.acc += dt * RAIN.RATE * area * V.rain;
    let tries = 0;
    while (V.acc >= 1 && tries++ < 64) {
      V.acc -= 1;
      if (P.drops.n >= RAIN.MAX_DROPS) { V.acc = 0; break; }
      const q = st.pick(); if (!q) continue;
      const d = take(P.drops);
      d.x = q.x; d.y = q.y; d.water = q.water | 0; d.fmax = q.fmax == null ? 4 : q.fmax; d.t = 0;
      d.dur = RAIN.FALL_MIN + Math.random() * (RAIN.FALL_MAX - RAIN.FALL_MIN);
      d.h = RAIN.H_MIN + Math.random() * (RAIN.H_MAX - RAIN.H_MIN);
      d.len = RAIN.LEN_MIN + ((Math.random() * (RAIN.LEN_MAX - RAIN.LEN_MIN + 1)) | 0);
      d.a = Math.min(1, 0.78 + Math.random() * 0.25); // v5.11.0.4 review: +25% (0.62-0.82 read too faint in shots)
    }
    if (V.acc > 4) V.acc = 4;
  }

  function tickVisual(dt, st) {
    st = st || {};
    V.t += dt;
    const raining = !!st.raining;
    V.rain += ((raining ? 1 : 0) - V.rain) * Math.min(1, dt * 2.5);
    const target = st.wetness != null ? st.wetness : (raining ? 1 : 0);
    V.wet += (target - V.wet) * Math.min(1, dt * 1.6);
    tickRain(dt, st, raining || V.rain > 0.05);
  }
  // the falling streak of one drop (drawn from the depth-sorted object list, so roofs and trees in front cover it)
  const DROP_COL = '#aec2d3';
  function drawDrop(ctx, d, proj) {
    const q = proj(d.x, d.y), z = d.h * (1 - d.t / d.dur);
    const hx = q[0] + z * RAIN.SLANT, hy = q[1] - z; // the head: up and to the right of the target, moving down-left
    ctx.globalAlpha = d.a * Math.min(1, V.rain * 1.4);
    ctx.fillStyle = DROP_COL;
    ctx.beginPath(); // 1-px wide, one row per pixel so the slant reads as a thin line; one fill per drop
    for (let k = 0; k < d.len; k++) { if (z + k < 1) continue; ctx.rect(Math.round(hx + k * RAIN.SLANT), Math.round(hy - k), 1, 1); }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function eachDrop(fn) { for (let i = 0; i < P.drops.n; i++) fn(P.drops.a[i]); }
  // splashes and wet spots lie on the ground: drawn after the soil, before the objects (which cover them)
  // batched: wet spots in 4 alpha steps and splash frames in 2, one path + one fill each (not a fillRect per pixel)
  const WET_STEPS = 4;
  function drawRainGround(ctx, proj, W, H) {
    if (!P.splash.n && !P.wet.n) return 0;
    ctx.save();
    ctx.fillStyle = '#1f2836';
    for (let k = 1; k <= WET_STEPS; k++) {
      ctx.beginPath(); let any = 0;
      for (let i = 0; i < P.wet.n; i++) { const w = P.wet.a[i], u = w.age / w.life, a = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92;
        if (Math.min(WET_STEPS, Math.ceil(a * WET_STEPS)) !== k) continue;
        const q = proj(w.x, w.y), x = Math.round(q[0]), y = Math.round(q[1]); if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
        ctx.rect(x - 1, y, w.w > 1 ? 3 : 2, 1); if (w.w > 1) ctx.rect(x, y - 1, 1, 1); any = 1; }
      if (any) { ctx.globalAlpha = 0.5 * k / WET_STEPS; ctx.fill(); }
    }
    ctx.fillStyle = '#cfdce6';
    for (let late = 0; late < 2; late++) {
      ctx.beginPath(); let any = 0;
      for (let i = 0; i < P.splash.n; i++) { const s = P.splash.a[i], f = Math.min(2, Math.floor(s.age / RAIN.SPLASH)); if ((f === 2) !== !!late) continue;
        const q = proj(s.x, s.y), x = Math.round(q[0]), y = Math.round(q[1]); if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
        if (f === 0) ctx.rect(x, y - 1, 1, 1);
        else if (f === 1) { ctx.rect(x - 1, y - 1, 1, 1); ctx.rect(x + 1, y - 2, 1, 1); }
        else { ctx.rect(x - 2, y, 1, 1); ctx.rect(x + 2, y - 1, 1, 1); } any = 1; }
      if (any) { ctx.globalAlpha = late ? 0.5 : 0.8; ctx.fill(); }
    }
    ctx.restore();
    return P.splash.n + P.wet.n;
  }
  function rainHits() { return P.hits; } // { a, n }: game.js turns each into the pond's own ripple (age 0..1 s)
  function rainStats() { return { drops: P.drops.n, splashes: P.splash.n, wet: P.wet.n, hits: P.hits.n, caps: { drops: RAIN.MAX_DROPS, splash: RAIN.MAX_SPLASH, wet: RAIN.MAX_WET, hits: RAIN.MAX_HITS } }; }

  function drawSky(ctx, W, H) {
    const a = V.rain * 0.18 + V.wet * 0.05;
    if (a <= 0.01) return 0;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(150, 165, 190, ${Math.min(0.28, a)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return 1;
  }
  function oval(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
    else { ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(rx, ry); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.restore(); }
  }
  // Stroke every path onto a scratch canvas first (opaque, source-over) so intersections
  // stay one layer of ink; then multiply that stamp once. Stroking each segment directly
  // on the game canvas made corners and crossings a darker square where two tints overlapped.
  function wetScratch(w, h) {
    if (typeof document === 'undefined' || !w || !h || w > 4096 || h > 4096) return null;
    let c = V.wetCv;
    if (!c || c.width !== w || c.height !== h) {
      c = document.createElement('canvas'); c.width = w; c.height = h;
      V.wetCv = c; V.wetCx = c.getContext('2d');
    }
    return V.wetCx;
  }
  function strokeWetPaths(ctx, proj, RS, st, W, H) {
    const scale = RS || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, 3.2 * scale);
    ctx.beginPath();
    for (const s of (st.pathSegs || [])) {
      if (s[4] && st.regionOpen && !st.regionOpen(s[4])) continue;
      const a = proj(s[0], s[1]), b = proj(s[2], s[3]);
      if ((a[0] < -20 && b[0] < -20) || (a[0] > W + 20 && b[0] > W + 20) || (a[1] < -20 && b[1] < -20) || (a[1] > H + 20 && b[1] > H + 20)) continue;
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
  }
  function drawWet(ctx, proj, RS, st) {
    if (V.wet < 0.04) return 0;
    st = st || {};
    ensureVisual(st.pathSegs);
    const W = (st.W || (ctx.canvas && ctx.canvas.width) || 0) | 0;
    const H = (st.H || (ctx.canvas && ctx.canvas.height) || 0) | 0;
    const scale = RS || 2;
    ctx.save();
    const sctx = wetScratch(W, H);
    if (sctx) {
      sctx.clearRect(0, 0, W, H);
      sctx.strokeStyle = 'rgb(120, 116, 122)';
      strokeWetPaths(sctx, proj, RS, st, W, H);
      ctx.globalAlpha = 0.4 * V.wet;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(V.wetCv, 0, 0);
      ctx.globalAlpha = 1;
    } else if (W && H) {
      // no document (tests): stroke once; still better than per-segment multiply overlap
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = `rgba(120, 116, 122, ${0.4 * V.wet})`;
      strokeWetPaths(ctx, proj, RS, st, W || 1e4, H || 1e4);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of V.puddles) {
      const q = proj(p.x, p.y), sx = q[0], sy = q[1];
      if (sx < -12 || sy < -12 || sx > W + 12 || sy > H + 12) continue;
      const rx = Math.max(3.2, p.rx * scale * 1.15), ry = Math.max(1.7, p.ry * scale * 1.15);
      ctx.globalAlpha = 0.52 * V.wet;
      ctx.fillStyle = '#2a3340';
      oval(ctx, sx, sy, rx, ry, p.wob || 0);
      ctx.fill();
      ctx.globalAlpha = 0.2 * V.wet;
      oval(ctx, sx + rx * 0.18, sy + ry * 0.12, rx * 0.62, ry * 0.7, 0.35);
      ctx.fill();
      ctx.globalAlpha = 0.48 * V.wet;
      ctx.fillStyle = '#d8eef4';
      oval(ctx, sx - rx * 0.28, sy - ry * 0.4, Math.max(1.1, rx * 0.36), Math.max(0.6, ry * 0.2), -0.4);
      ctx.fill();
    }
    ctx.restore();
    return V.puddles.length;
  }
  // Pond already paints its own ripples; rain just densifies those in game.js. Keep a stub so older hooks stay safe.
  function drawRipples(ctx, proj, RS) { return 0; }
  // v5.11.0.4: the old screen-wide streaks are gone (drops are drawn in the world); kept as a no-op for older hooks
  function drawRain() { return 0; }
  function resetVisual() { clearRain(); V.streaks.length = 0; V.ripples.length = 0; V.puddles.length = 0; V.wet = 0; V.rain = 0; V.t = 0; V.pondT = 0; }

  const api = {
    GAP_MIN, GAP_MAX, DUR_MIN, DUR_MAX, SEASON_LEN, WET_DECAY,
    emptyWeather, validWeather, ensure, beginDay, advanceDays,
    isRainDay, isRaining, rainWindow, wetness, isSummer, forceRain, simulate,
    tickVisual, drawSky, drawWet, drawRipples, drawRain, makePuddles, resetVisual, _visual: V,
    RAIN, drawDrop, eachDrop, drawRainGround, rainHits, rainStats, clearRain,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PFWeather = api;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
