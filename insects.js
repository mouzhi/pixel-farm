// 像素农场 · 昆虫和图鉴「昆虫」页（v5.4.3 第 7 阶段）：晴天的蝴蝶、水边的蜻蜓、夏天夜里的萤火虫；买了捕虫网后孩子偶尔捉到，看一眼就放走。
// 浏览器里是 window.PFInsects，并挂上 window.__insects.nearest(x, y) 给并行的孩子玩耍分支用。Node 里可以直接 require。
'use strict';
(function (root) {
  const NET_PRICE = 150;
  const SPECIES = [
    { id: 'white', name: '白粉蝶', group: 'butterfly', rarity: 'common', w: 1 },
    { id: 'yellow', name: '黄蛱蝶', group: 'butterfly', rarity: 'common', w: 0.9 },
    { id: 'swallow', name: '凤蝶', group: 'butterfly', rarity: 'epic', w: 0.2 },
    { id: 'grey', name: '小灰蝶', group: 'butterfly', rarity: 'rare', w: 0.45 },
    { id: 'dragon', name: '蜻蜓', group: 'dragonfly', rarity: 'common', w: 1 },
    { id: 'reddragon', name: '红蜻蜓', group: 'dragonfly', rarity: 'rare', w: 0.35 },
    { id: 'damsel', name: '豆娘', group: 'dragonfly', rarity: 'common', w: 0.7 },
    { id: 'firefly', name: '萤火虫', group: 'firefly', rarity: 'epic', w: 1 },
  ];
  const BY = Object.fromEntries(SPECIES.map(s => [s.id, s]));
  const keyBug = id => 'bug:' + id;

  const PIX = {
    white: ['                ', '                ', '   ww      ww   ', '  wkw      wkw  ', '  www kkkk www  ', '   wwkkkkkkww   ', '    k kyyk k    ', '      kyyk      ', '       kk       '],
    yellow: ['                ', '                ', '   yy      yy   ', '  yky      yky  ', '  yyy kkkk yyy  ', '   yykkkkkkyy   ', '    k kyyk k    ', '      kyyk      ', '       kk       '],
    swallow: ['                ', '  yy        yy  ', ' ykyy      yyky ', ' yyyy kkkk yyyy ', '  yy kkkkkk yy  ', '   k  kyyk  k   ', '  k    kk    k  ', ' k      k     k ', '                '],
    grey: ['                ', '                ', '   ss      ss   ', '  sks      sks  ', '  sss kkkk sss  ', '   sskkkkksss   ', '    k kssk k    ', '      kssk      ', '       kk       '],
    dragon: ['                ', '  ww        ww  ', '   ww kkkk ww   ', '    wktuuukw    ', '   ww ktuuk ww  ', '  ww   kuu   ww ', '        ku      ', '        ku      ', '         k      '],
    reddragon: ['                ', '  ww        ww  ', '   ww kkkk ww   ', '    wkrrrrkw    ', '   ww krrrkw w  ', '  ww   krr   ww ', '        kr      ', '        kr      ', '         k      '],
    damsel: ['                ', '                ', '  ww        ww  ', '   ww kkkk ww   ', '    wktuutkw    ', '     k tuuk     ', '        tu      ', '        tu      ', '         k      '],
    firefly: ['                ', '                ', '      kk        ', '     kyyk       ', '    kyAAyk      ', '     kyyk       ', '      kk        ', '      k         ', '                '],
  };
  const COL = { k: '#2a1d16', w: '#fff6dc', y: '#ffd76a', A: '#fff2a8', s: '#9aa4b0', t: '#8cc6dc', u: '#4fa3cf', r: '#e06a2c' };

  function raster(rows, cols) {
    const h = rows.length, w = Math.max.apply(null, rows.map(r => r.length));
    const img = { w, h, data: new Array(w * h).fill(null) };
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = cols[row[x]]; if (c) img.data[y * w + x] = c; } });
    // dark outline around opaque pixels
    const out = img.data.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (img.data[y * w + x]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && img.data[yy * w + xx]) n++;
      }
      if (n) out[y * w + x] = '#2a1d16';
    }
    img.data = out; return img;
  }
  function silhouette(img, fill, edge) {
    fill = fill || '#3a2a22'; edge = edge || '#1c1626';
    const out = { w: img.w, h: img.h, data: img.data.map(c => c ? (c === '#2a1d16' || c === '#1c1626' ? edge : fill) : null) };
    return out;
  }
  const cache = {};
  function imageOf(id, seen) {
    const key = id + (seen ? ':on' : ':off');
    if (cache[key]) return cache[key];
    const rows = PIX[id]; if (!rows) return null;
    const img = raster(rows.map(r => r.padEnd(16)), COL);
    return cache[key] = seen ? img : silhouette(img);
  }
  function canvasOf(img) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
    const g = c.getContext('2d');
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const col = img.data[y * img.w + x]; if (!col) continue;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  function urlOf(img) { const c = canvasOf(img); return c ? c.toDataURL() : ''; }
  function bugURL(id, seen) { const im = imageOf(id, seen !== false); return im ? urlOf(im) : ''; }
  function silURL(id) { return bugURL(id, false); }

  function catalog() {
    return SPECIES.map(s => ({ key: keyBug(s.id), id: s.id, name: s.name, group: 'bug', rarity: s.rarity, kind: s.group }));
  }

  // ---- live insects in the yard ----
  const live = [];
  let seq = 1, catchCool = 0, pending = [];

  function pickWeighted(list, rng) {
    let t = 0; for (const s of list) t += s.w; let u = rng() * t;
    for (const s of list) { u -= s.w; if (u <= 0) return s; }
    return list[list.length - 1];
  }
  function jitter(x, y, r, rng) { return { x: x + (rng() - 0.5) * r, y: y + (rng() - 0.5) * r * 0.7 }; }

  function homeSpots(st) {
    const spots = [{ x: 80, y: 70 }, { x: 50, y: 88 }, { x: 110, y: 64 }, { x: 96, y: 100 }, { x: 70, y: 48 }];
    if (st && st.orchard) spots.push({ x: -90, y: 20 }, { x: -60, y: 8 });
    if (st && st.field) spots.push({ x: st.field.x, y: st.field.y });
    return spots;
  }
  function pondSpot(st, rng) {
    const p = (st && st.pond) || { x: 34, y: 100, rx: 19, ry: 12 };
    const a = rng() * Math.PI * 2, r = 0.9 + rng() * 0.5;
    return { x: p.x + Math.cos(a) * p.rx * r, y: p.y + Math.sin(a) * p.ry * r };
  }

  function spawnOne(kind, st, rng) {
    const pool = SPECIES.filter(s => s.group === kind);
    if (!pool.length) return null;
    const s = pickWeighted(pool, rng);
    const at = kind === 'dragonfly' || kind === 'firefly' ? pondSpot(st, rng) : jitter((homeSpots(st)[Math.floor(rng() * homeSpots(st).length)] || { x: 80, y: 70 }).x, (homeSpots(st)[0] || { x: 80, y: 70 }).y, 24, rng);
    if (kind === 'butterfly') {
      const sp = homeSpots(st)[Math.floor(rng() * homeSpots(st).length)];
      const j = jitter(sp.x, sp.y, 28, rng); at.x = j.x; at.y = j.y;
    }
    const b = { id: 'i' + (seq++), kind: s.id, group: s.group, name: s.name, x: at.x, y: at.y, tx: at.x, ty: at.y, ph: rng() * 6, wait: rng() * 2, z: s.group === 'firefly' ? 4 + rng() * 5 : 2 + rng() * 3, alive: 1 };
    live.push(b); return b;
  }

  function retarget(b, st, rng) {
    if (b.group === 'dragonfly' || b.group === 'firefly') { const p = pondSpot(st, rng); b.tx = p.x; b.ty = p.y; }
    else { const sp = homeSpots(st)[Math.floor(rng() * homeSpots(st).length)]; const j = jitter(sp.x, sp.y, 30, rng); b.tx = j.x; b.ty = j.y; }
    b.wait = 1.2 + rng() * 2.5;
  }

  let dayCounts = { day: -1, raining: 0, night: 0, summer: 0, butterfly: 0, dragonfly: 0, firefly: 0 };
  function desiredCounts(st) {
    const sunny = !st.raining && !st.night;
    const key = st.day | 0;
    if (dayCounts.day !== key || dayCounts.raining !== !!st.raining || dayCounts.night !== !!st.night || dayCounts.summer !== !!st.summer) {
      const rng = st.rng || Math.random;
      dayCounts = {
        day: key, raining: !!st.raining, night: !!st.night, summer: !!st.summer,
        butterfly: sunny ? 2 + Math.floor(rng() * 4) : 0,
        dragonfly: sunny ? 1 + Math.floor(rng() * 3) : 0,
        firefly: (st.night && st.summer) ? 3 + Math.floor(rng() * 3) : 0,
      };
    }
    return {
      butterfly: st.butterflies != null ? (sunny ? st.butterflies : 0) : dayCounts.butterfly,
      dragonfly: st.dragonflies != null ? (sunny ? st.dragonflies : 0) : dayCounts.dragonfly,
      firefly: st.fireflies != null ? ((st.night && st.summer) ? st.fireflies : 0) : dayCounts.firefly,
    };
  }

  function syncPopulation(st, rng) {
    const want = desiredCounts(st);
    const have = { butterfly: 0, dragonfly: 0, firefly: 0 };
    for (const b of live) if (b.alive) have[b.group] = (have[b.group] || 0) + 1;
    for (const g of Object.keys(want)) {
      while ((have[g] || 0) < want[g]) { spawnOne(g, st, rng); have[g] = (have[g] || 0) + 1; }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      if (!b.alive) { live.splice(i, 1); continue; }
      if ((have[b.group] || 0) > want[b.group]) { live.splice(i, 1); have[b.group]--; }
    }
  }

  // st: { day, t, raining, night, summer, pond, orchard, field, hasNet, kids:[{x,y,id}], rng, dt }
  function tick(dt, st) {
    st = st || {};
    const rng = st.rng || Math.random;
    if (catchCool > 0) catchCool -= dt;
    syncPopulation(st, rng);
    for (const b of live) {
      b.ph += dt * (b.group === 'dragonfly' ? 10 : b.group === 'firefly' ? 3 : 8);
      const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
      const spd = (b.group === 'dragonfly' ? 18 : b.group === 'firefly' ? 6 : 11) * dt;
      if (d > 0.6) { b.x += dx / d * Math.min(d, spd); b.y += dy / d * Math.min(d, spd); }
      else { b.wait -= dt; if (b.wait <= 0) retarget(b, st, rng); }
      if (b.group === 'butterfly') b.z = 3 + Math.abs(Math.sin(b.ph)) * 3;
      if (b.group === 'firefly') b.glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(b.ph * 1.4));
    }
    if (st.hasNet && st.kids && st.kids.length && catchCool <= 0) {
      for (const k of st.kids) {
        const n = nearest(k.x, k.y);
        if (n && n.dist < 14 && (st.rng ? st.rng() : Math.random()) < dt * 0.12) {
          const ev = catchBug(n.id, st.day | 0);
          if (ev) { catchCool = 45 + (st.rng ? st.rng() : Math.random()) * 40; break; }
        }
      }
    }
    const ev = pending.slice(); pending.length = 0;
    return ev;
  }

  function nearest(x, y) {
    let best = null, bestD = 1e9;
    for (const b of live) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bestD) { bestD = d; best = { id: b.id, kind: b.kind, name: b.name, group: b.group, x: b.x, y: b.y, z: b.z, dist: d }; }
    }
    return best;
  }
  function list() { return live.filter(b => b.alive).map(b => ({ id: b.id, kind: b.kind, name: b.name, group: b.group, x: b.x, y: b.y, z: b.z, glow: b.glow, ph: b.ph })); }

  function catchBug(id, day) {
    const b = live.find(o => o.id === id && o.alive);
    if (!b) return null;
    b.alive = 0;
    const ev = { id: b.id, kind: b.kind, name: b.name, key: keyBug(b.kind), day: day | 0, x: b.x, y: b.y };
    pending.push(ev);
    return ev;
  }
  function forceCatch(kind, day, x, y) {
    const s = BY[kind] || SPECIES[0];
    const b = { id: 'i' + (seq++), kind: s.id, group: s.group, name: s.name, x: x || 80, y: y || 70, tx: x || 80, ty: y || 70, ph: 0, wait: 0, z: 3, alive: 1 };
    live.push(b);
    return catchBug(b.id, day);
  }
  function reset() { live.length = 0; pending.length = 0; seq = 1; catchCool = 0; dayCounts.day = -1; Object.keys(cache).forEach(k => { delete cache[k]; }); }

  function draw(ctx, proj, RS) {
    if (!live.length) return 0;
    let n = 0;
    for (const b of live) {
      if (!b.alive) continue;
      const p = proj(b.x, b.y), sx = Math.round(p[0]), sy = Math.round(p[1] - (b.z || 0) * (RS ? RS * 0.15 : 0.3));
      const img = imageOf(b.kind, true); if (!img) continue;
      const c = canvasOf(img); if (!c) continue;
      const flip = b.tx < b.x;
      ctx.save();
      if (b.group === 'firefly') {
        const g = b.glow == null ? 1 : b.glow;
        ctx.globalAlpha = 0.35 + 0.65 * g;
        ctx.fillStyle = '#fff2a8';
        ctx.fillRect(sx - 1, sy - 1, 3, 3);
        ctx.fillStyle = '#ffd76a';
        ctx.fillRect(sx, sy, 1, 1);
      } else {
        ctx.imageSmoothingEnabled = false;
        if (flip) { ctx.translate(sx, sy); ctx.scale(-1, 1); ctx.drawImage(c, -(c.width >> 1), -c.height + 2); }
        else ctx.drawImage(c, sx - (c.width >> 1), sy - c.height + 2);
      }
      ctx.restore();
      n++;
    }
    return n;
  }

  const api = {
    NET_PRICE, SPECIES, BY, keyBug, catalog,
    imageOf, canvasOf, urlOf, bugURL, silURL, silhouette, raster,
    tick, nearest, list, catch: catchBug, catchBug, forceCatch, reset, draw, live,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PFInsects = api;
    root.__insects = { nearest, list, catch: catchBug, species: SPECIES, catalog, reset, forceCatch };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
