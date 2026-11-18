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

  // ---- cheap visuals (browser). Rain is a handful of short streaks; puddles are a fixed list along the paths. ----
  const V = { streaks: [], ripples: [], puddles: [], wet: 0, rain: 0, t: 0, pondT: 0 };

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

  function tickVisual(dt, st) {
    st = st || {};
    V.t += dt;
    const raining = !!st.raining;
    V.rain += ((raining ? 1 : 0) - V.rain) * Math.min(1, dt * 2.5);
    const target = st.wetness != null ? st.wetness : (raining ? 1 : 0);
    V.wet += (target - V.wet) * Math.min(1, dt * 1.6);
    const W = st.W || 640, H = st.H || 360;
    const want = (raining || V.rain > 0.05) ? 44 : 0;
    while (V.streaks.length < want) V.streaks.push({ x: Math.random() * W, y: Math.random() * H - 20, len: 7 + Math.random() * 9, spd: 280 + Math.random() * 160, a: 0.32 + Math.random() * 0.22 });
    if (V.streaks.length > want) V.streaks.length = want;
    for (const s of V.streaks) {
      s.y += s.spd * dt; s.x += s.spd * 0.28 * dt;
      if (s.y > H + 8 || s.x > W + 8) { s.y = -12; s.x = Math.random() * W; s.len = 7 + Math.random() * 9; }
    }
  }

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
  function drawWet(ctx, proj, RS, st) {
    if (V.wet < 0.04) return 0;
    st = st || {};
    ensureVisual(st.pathSegs);
    const W = st.W || 1e4, H = st.H || 1e4, scale = RS || 2;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = `rgba(120, 116, 122, ${0.4 * V.wet})`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, 3.2 * scale);
    for (const s of (st.pathSegs || [])) {
      if (s[4] && st.regionOpen && !st.regionOpen(s[4])) continue;
      const a = proj(s[0], s[1]), b = proj(s[2], s[3]);
      if ((a[0] < -20 && b[0] < -20) || (a[0] > W + 20 && b[0] > W + 20) || (a[1] < -20 && b[1] < -20) || (a[1] > H + 20 && b[1] > H + 20)) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
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
  function drawRain(ctx, W, H) {
    if (!V.streaks.length || V.rain < 0.04) return 0;
    ctx.save();
    ctx.fillStyle = '#e8f4fa';
    for (const s of V.streaks) {
      ctx.globalAlpha = s.a * V.rain;
      const dy = Math.round(s.len);
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, dy);
      ctx.fillRect(Math.round(s.x - 1), Math.round(s.y + 2), 1, Math.max(1, dy - 2));
    }
    ctx.restore();
    return V.streaks.length;
  }
  function resetVisual() { V.streaks.length = 0; V.ripples.length = 0; V.puddles.length = 0; V.wet = 0; V.rain = 0; V.t = 0; V.pondT = 0; }

  const api = {
    GAP_MIN, GAP_MAX, DUR_MIN, DUR_MAX, SEASON_LEN, WET_DECAY,
    emptyWeather, validWeather, ensure, beginDay, advanceDays,
    isRainDay, isRaining, rainWindow, wetness, isSummer, forceRain, simulate,
    tickVisual, drawSky, drawWet, drawRipples, drawRain, makePuddles, resetVisual, _visual: V,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PFWeather = api;
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
