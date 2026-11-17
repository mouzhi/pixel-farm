// Pixel-farm action VFX (v4.4). Short, whole-pixel, palette-limited bursts for tilling, watering,
// harvest, weeds, rocks, chopping and selling. The recipes follow the visual grammar of pixelfx
// (https://github.com/patch-gg/pixelfx, MIT: Patch and Hugo Duprez) — grit fans, droplet tails
// that plink a tiny crown, blinking plus-sparkles, a spinning coin — but this file is a small
// plain-JS reimplementation: no ESM, no offscreen canvases, a fixed particle pool, no per-frame
// allocations past the cap. Toggle with ?nofx.
'use strict';
(() => {
  const Q = new URLSearchParams(location.search);
  let enabled = !Q.has('nofx');
  const PAL = window.PF_PALETTE;
  const G = PAL.ramps.green, Wd = PAL.ramps.wood, St = PAL.ramps.stone, Wt = PAL.ramps.water, Ac = PAL.ramps.accent;
  const WHITE = '#ffffff', CREAM = Ac[0], GOLD = Ac[1];
  const MAX = 180, live = [], pool = [];
  const R = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];

  function alloc() { if (live.length >= MAX) pool.push(live.shift()); return pool.pop() || {}; }
  function spawn(p) {
    const o = alloc();
    o.x = p.x; o.y = p.y; o.z = p.z || 0;
    o.vx = p.vx || 0; o.vy = p.vy || 0; o.vz = p.vz || 0;
    o.life = p.life; o.max = p.life;
    o.c = p.c; o.c2 = p.c2 || p.c;
    o.sh = p.sh || 'px';
    o.s = p.s || 1;
    o.ph = p.ph || 0;
    o.spin = p.spin || 0;
    o.g = p.g === undefined ? 40 : p.g;
    o.bounce = p.bounce || 0;
    o.landed = 0;
    o.blink = p.blink || 0;
    live.push(o);
    return o;
  }

  function play(kind, x, y, z, opt) {
    if (!enabled) return;
    const o = opt || {}, cols = o.cols; z = z || 2;
    if (kind === 'dirt') {
      const C = cols || [Wd[1], Wd[2], Wd[3], '#6e452a'], n = o.n || 10;
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1, a = -Math.PI / 2 + side * R(0.15, 0.7), sp = R(5, 12);
        spawn({ x: x + R(-1, 1), y: y + R(-1, 1), z, vx: Math.cos(a) * sp * 0.35, vy: Math.sin(a) * 0.2, vz: R(6, 14), life: R(0.35, 0.7), c: pick(C), sh: 'px', s: Math.random() < 0.4 ? 2 : 1 });
      }
      for (let i = 0; i < 3; i++) spawn({ x: x + R(-2, 2), y: y + R(-1, 1), z: z + R(0, 2), vx: R(-2, 2), vy: R(-1, 1), vz: R(3, 7), life: R(0.4, 0.8), c: pick(C), c2: Wd[1], sh: 'puff', s: 2, g: 18 });
    } else if (kind === 'splash') {
      const C = cols || [Wt[3], Wt[4], Wt[5], '#9fdcec', '#ffffff'], n = o.n || 10;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + R(-1.1, 1.1);
        spawn({ x: x + R(-2, 2), y: y + R(-1, 1), z: z + 1, vx: Math.cos(a) * R(4, 11) * 0.45, vy: Math.sin(a) * 0.2, vz: R(10, 18), life: R(0.35, 0.7), c: pick(C), sh: 'drop', s: Math.random() < 0.45 ? 3 : 2, g: 55 });
      }
      for (let i = 0; i < 4; i++) spawn({ x: x + R(-2, 2), y, z: z + 2, vx: R(-4, 4), vy: R(-1, 1), vz: R(5, 10), life: 0.28, c: WHITE, sh: 'px', s: 1, g: 22 });
    } else if (kind === 'water' || kind === 'drop') {
      const C = cols || [Wt[3], Wt[4], Wt[5], '#9fdcec'], n = o.n || 8;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + R(-0.9, 0.9);
        spawn({ x: x + R(-1, 1), y, z: z + 2, vx: Math.cos(a) * R(3, 9) * 0.4, vy: Math.sin(a) * 0.15, vz: R(8, 16), life: R(0.4, 0.85), c: pick(C), sh: 'drop', s: Math.random() < 0.4 ? 3 : 2, g: 50 });
      }
      for (let i = 0; i < 3; i++) spawn({ x, y, z: z + 3, vx: R(-3, 3), vy: R(-1, 1), vz: R(4, 8), life: 0.25, c: WHITE, sh: 'px', s: 1, g: 20 });
    } else if (kind === 'harvest') {
      const C = cols || [G[3], G[4], Ac[2], WHITE];
      for (let i = 0; i < 6; i++) {
        const a = R(0, 6.28), sp = R(3, 9);
        spawn({ x, y, z: z + 2, vx: Math.cos(a) * sp * 0.4, vy: Math.sin(a) * 0.3, vz: R(8, 16), life: R(0.45, 0.8), c: pick(C), sh: 'chip', s: 2, ph: R(0, 6), spin: R(-8, 8) });
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.28 + R(-0.2, 0.2);
        spawn({ x: x + Math.cos(a), y: y + Math.sin(a), z: z + 4, vx: Math.cos(a) * R(2, 5), vy: Math.sin(a) * 0.2, vz: R(4, 10), life: R(0.3, 0.55), c: pick([WHITE, CREAM, GOLD]), sh: 'spark', s: 1, blink: 1, g: 12 });
      }
      spawn({ x, y, z: z + 5, vx: 0, vy: 0, vz: 2, life: 0.12, c: WHITE, sh: 'star', s: 2, g: 0 });
    } else if (kind === 'leaf' || kind === 'weed') {
      const C = cols || [G[2], G[3], G[4], G[5]], n = o.n || 7;
      for (let i = 0; i < n; i++) spawn({ x: x + R(-1, 1), y: y + R(-1, 1), z: z + 2, vx: R(-6, 6), vy: R(-3, 3), vz: R(8, 15), life: R(0.45, 0.9), c: pick(C), sh: 'chip', s: 2, ph: R(0, 6), spin: R(-10, 10) });
      for (let i = 0; i < 2; i++) spawn({ x, y, z: z + 3, vx: R(-4, 4), vy: R(-2, 2), vz: R(6, 12), life: 0.7, c: GOLD, sh: 'px', s: 1 });
    } else if (kind === 'rock') {
      const C = cols || [St[1], St[2], St[3], '#77776f'], n = o.n || 8;
      for (let i = 0; i < n; i++) spawn({ x, y, z: z + 1, vx: R(-7, 7), vy: R(-4, 4), vz: R(8, 16), life: R(0.5, 0.9), c: pick(C), sh: 'chip', s: Math.random() < 0.5 ? 2 : 1, ph: R(0, 6), spin: R(-12, 12), bounce: 0.35, g: 48 });
      for (let i = 0; i < 4; i++) spawn({ x, y, z, vx: R(-5, 5), vy: R(-3, 3), vz: R(4, 9), life: 0.4, c: pick(C), sh: 'px', s: 1 });
    } else if (kind === 'wood') {
      const C = cols || [Wd[2], Wd[3], Wd[4], G[3]], n = o.n || 10;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + R(-1, 1);
        spawn({ x: x + R(-2, 2), y: y + R(-1, 1), z: z + R(2, 8), vx: Math.cos(a) * R(3, 8) * 0.4, vy: R(-2, 2), vz: R(6, 16), life: R(0.5, 1), c: pick(C), sh: 'chip', s: 2, ph: R(0, 6), spin: R(-10, 10), bounce: 0.2 });
      }
      for (let i = 0; i < 3; i++) spawn({ x, y, z: z + 10, vx: R(-5, 5), vy: R(-2, 2), vz: R(4, 10), life: 0.8, c: pick([G[3], G[4]]), sh: 'chip', s: 2, ph: R(0, 6), spin: R(-8, 8), g: 22 });
    } else if (kind === 'coin' || kind === 'spark') {
      if (kind === 'coin') {
        const nCoins = Math.max(1, Math.min(3, o.n ? Math.round(o.n / 4) : 2));
        for (let i = 0; i < nCoins; i++) spawn({ x: x + R(-2, 2), y: y + R(-1, 1), z: z + 4, vx: R(-3, 3), vy: R(-1, 1), vz: R(14, 20), life: R(0.8, 1.15), c: GOLD, c2: Wd[3], sh: 'coin', s: 2, ph: R(0, 6), spin: R(8, 14) * (Math.random() < 0.5 ? -1 : 1), g: 28 });
      }
      const ns = kind === 'coin' ? 6 : (o.n || 5);
      for (let i = 0; i < ns; i++) {
        const a = (i / ns) * 6.28 + R(-0.2, 0.2);
        spawn({ x, y, z: z + 5, vx: Math.cos(a) * R(3, 7), vy: Math.sin(a) * 0.25, vz: R(6, 12), life: R(0.3, 0.55), c: pick([WHITE, CREAM, GOLD]), sh: 'spark', s: 1, blink: 1, g: 10 });
      }
      spawn({ x, y, z: z + 6, vx: 0, vy: 0, vz: 1, life: 0.1, c: WHITE, sh: 'star', s: 2, g: 0 });
    } else if (kind === 'seed') {
      const C = cols || [Wd[4], Ac[0], '#e8d9a0'];
      for (let i = 0; i < (o.n || 4); i++) spawn({ x, y, z, vx: R(-3, 3), vy: R(-2, 2), vz: R(4, 9), life: 0.4, c: pick(C), sh: 'px', s: 1, g: 30 });
    } else {
      const C = cols || [Wd[3], G[3], WHITE], n = o.n || 6;
      for (let i = 0; i < n; i++) spawn({ x, y, z, vx: R(-6, 6), vy: R(-6, 6), vz: R(6, 14), life: R(0.4, 0.8), c: pick(C), sh: 'px', s: 1 });
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) { pool.push(live.splice(i, 1)[0]); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= p.g * dt;
      p.ph += (p.spin || 0) * dt;
      if (p.sh === 'puff') p.s = 1 + Math.round(2 * (1 - p.life / p.max));
      if (p.z > 0) continue;
      p.z = 0;
      if (p.sh === 'drop' && !p.landed) {
        p.landed = 1;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.57 + 0.4;
          spawn({ x: p.x, y: p.y, z: 0.2, vx: Math.cos(a) * 2, vy: Math.sin(a) * 1, vz: R(3, 6), life: 0.18, c: p.c, sh: 'px', s: 1, g: 25 });
        }
        p.life = 0.08; p.sh = 'px'; p.s = 1; p.vx = p.vy = p.vz = 0;
      } else if (p.bounce && p.vz < -2) { p.vz *= -p.bounce; p.vx *= 0.6; p.vy *= 0.6; }
      else { p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
    }
  }

  function drawCoin(ctx, x, y, w, face, shade, hi) {
    const rx = w, ry = 2;
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      const u = dx / (rx + 0.01), v = dy / (ry + 0.01);
      if (u * u + v * v > 1.05) continue;
      let col = face;
      if (rx <= 1) col = dy < 0 ? hi : shade;
      else if (dx <= -rx + (rx > 2 ? 0 : -1)) col = shade;
      else if (dy === -ry) col = hi;
      else if (dx === 0 && Math.abs(dy) <= 1 && rx >= 2) col = shade;
      else if (dx === 1 && Math.abs(dy) <= 1 && rx >= 2) col = hi;
      else if (dy > 0) col = shade;
      ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }

  function draw(ctx, proj, RS) {
    for (const p of live) {
      const [sx, sy] = proj(p.x, p.y), x = Math.round(sx), y = Math.round(sy - p.z * RS);
      if (p.blink && ((p.life * 16) | 0) % 2 === 0 && p.life / p.max < 0.7) continue;
      const c = (p.sh === 'puff' && p.life / p.max < 0.4) ? (p.c2 || p.c) : p.c;
      if (p.sh === 'drop') {
        ctx.fillStyle = c; ctx.fillRect(x, y, 1, p.s || 2);
        if (p.vz > 2) { ctx.fillStyle = WHITE; ctx.fillRect(x, y, 1, 1); }
      } else if (p.sh === 'chip') {
        ctx.fillStyle = c;
        if (Math.abs(Math.cos(p.ph)) > 0.5) ctx.fillRect(x, y, p.s + 1, 1); else ctx.fillRect(x, y, 1, p.s + 1);
      } else if (p.sh === 'puff') {
        const s = p.s | 0; ctx.fillStyle = c; ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
      } else if (p.sh === 'spark') {
        ctx.fillStyle = c; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
      } else if (p.sh === 'star') {
        const r = p.s || 2; ctx.fillStyle = c;
        ctx.fillRect(x - r, y, 2 * r + 1, 1); ctx.fillRect(x, y - r, 1, 2 * r + 1); ctx.fillRect(x - 1, y - 1, 3, 3);
      } else if (p.sh === 'coin') {
        const w = Math.max(1, Math.round(1 + 2 * Math.abs(Math.sin(p.ph))));
        drawCoin(ctx, x, y, w, p.life / p.max > 0.92 ? WHITE : c, p.c2 || Wd[3], CREAM);
      } else { ctx.fillStyle = c; const s = p.s || 1; ctx.fillRect(x, y, s, s); }
    }
  }

  window.PF_FX = {
    play, update, draw,
    clear() { while (live.length) pool.push(live.pop()); },
    count: () => live.length,
    setEnabled(v) { enabled = !!v; if (!enabled) window.PF_FX.clear(); },
    enabled: () => enabled,
  };
})();
