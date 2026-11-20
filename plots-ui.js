// 像素农场 · 外圈地块的界面（v5.5.0）：商店「地块」页里的地块列表、选模块 / 改建的详情页、地图上锁着的地块牌子。
// The shop panel (ui.js) hosts the list and the detail view, so they share its styles; rules come from plots.js via __farm.
'use strict';
(() => {
  const G = window.__farm, PL = window.PFPlots, PAL = window.PF_PALETTE;
  if (!G || !PL || !G.buyPlot) return;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const R = PAL.ramps, ink = R.ink[0], gr = R.green, wd = R.wood, st = R.stone, wt = R.water, rf = R.roof, ac = R.accent;
  function pixIcon(rows, cols) { const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (cols[ch]) { g.fillStyle = cols[ch]; g.fillRect(x, y, 1, 1); } })); return c.toDataURL(); }
  const pad = a => a.map(r => r.padEnd(16));
  // module icons (16x16, shown at 2x like the shop's)
  const ICON = {
    field: pixIcon(pad(['', '', '', '  kkkkkkkkkkkk', ' kdldldldldldk', ' kddddddddddddk', ' kgdgdgdgdgdgk', ' kddddddddddddk', ' kdgdgdgdgdgdk', ' kddddddddddddk', '  kkkkkkkkkkkk']), { k: ink, d: wd[2], l: wd[4], g: gr[4] }),
    pasture: pixIcon(pad(['', '', '', ' b  b  b  b  b', ' bbbbbbbbbbbbb', ' b  b  b  b  b', ' b  b  b  b  b', ' bbbbbbbbbbbbb', ' b  b  b  b  b', 'gggggggggggggggg', 'GgGgGgGgGgGgGgGg']), { b: wd[3], g: gr[3], G: gr[4] }),
    orchard: pixIcon(pad(['', '    kkk    kkk', '   kgggk  kgggk', '  kgrggk kggrgk', '  kgggggkgggggk', '   kgggk  kgggk', '    kbk    kbk', '    kbk    kbk', '   kkbkk  kkbkk', ' gggggggggggggg']), { k: ink, g: gr[3], r: rf[2], b: wd[2] }),
    meadow: pixIcon(pad(['', '', '   p     y    p', '  pyp   yky  pyp', '   p     y    p', '   g  w  g  y g', '   g wyw g yky', '  ggg w ggg y', ' gggggggggggggg', ' GgGgGgGgGgGgGg']), { p: ac[3], y: ac[1], k: ink, w: ac[0], g: gr[3], G: gr[4] }),
    woodland: pixIcon(pad(['     k', '    kgk    k', '   kgggk  kgk', '   kgggk kgggk', '  kgggggkkgggk', '  kgggggk kgggk', ' kgggggggkgggggk', '  kkkbkkk kkbkk', '     b      b', '  gggbggggggbgg']), { k: ink, g: gr[2], b: wd[2] }),
    workshop: pixIcon(pad(['', '', '      kkkk', '     kbbbbk', '    kbbbbbbk', '   kkkkkkkkkk', '   kwwwwwwwwk', '   kwddwwwwwk', '   kwddwwbbwk', '   kwddwwbbwk', '   kkkkkkkkkk', ' ssssssssssssss']), { k: ink, b: rf[2], w: wd[4], d: wd[1], s: wd[3] }),
    dam: pixIcon(pad(['', '    kkkkkk', '   k b  b k', '  k  b  b  k', '  kbbbbbbbbk', '  k  b  b  k', '  kbbbbbbbbk', '  k  b  b  k', '   k b  b k', '    kkkkkk', ' wwwwwwwwwwwwww', ' WwWwWwWwWwWwWw']), { k: ink, b: wd[3], w: wt[3], W: wt[4] }),
    road: pixIcon(pad(['', '', 'gggggggggggggggg', 'gggggggggggggggg', 'dddddddddddddddd', 'llddllddllddlldd', 'dddddddddddddddd', 'gggggggggggggggg', 'gggggggggggggggg']), { g: gr[3], d: wd[4], l: wd[5] }),
    playground: pixIcon(pad(['', '  r', '  rr', '  r r', '  r  bb', '  r   bb', '  r    bb', '  r     bb', '  r      bb', ' sssssssssssss', ' sSsSsSsSsSsSs']), { r: rf[2], b: wt[3], s: wd[4], S: wd[5] }),
    bridge: pixIcon(pad(['', '', '', ' k            k', ' kkkkkkkkkkkkkk', ' ssssssssssssss', ' ss  ssssss  ss', ' s    ssss    s', ' wwwwwwwwwwwwww', ' WwWwWwWwWwWwWw']), { k: wd[2], s: st[2], w: wt[3], W: wt[4] }),
    trail: pixIcon(pad(['        ss', '       sssss', '      sss d s', '     sss dd ss', '    sss dd  sss', '   sss  dd  ssss', '  sss    dd sssss', ' sss     dd ssss', 'gggggggggddggggg']), { s: st[1], d: wd[4], g: gr[3] }),
    inn: pixIcon(pad(['', '   rrrr    rrrr', '  rwwwwr  rwwwwr', '  rwbwwr  rwbwwr', '  rwwwwr  rwwwwr', '  rwwdwr  rwwdwr', '  rwwwwr  rwwwwr', ' sssssssssssssss']), { r: rf[2], w: wd[4], b: wt[4], d: wd[1], s: wd[3] }),
    resort: pixIcon(pad(['', ' u    u    u', ' uuu  uuu  uuu', '  s    s    s', '  s    s    s', 'ssssssssssssssss', ' s  ss  ss  ss', ' wwwwwwwwwwwwww', ' WwWwWwWwWwWwWw']), { u: ac[1], s: wd[4], w: wt[3], W: wt[4] }),
  };
  const icon = mod => `<i style="background:url(${ICON[mod] || ICON.field});background-size:32px;image-rendering:pixelated"></i>`;
  const nameOf = id => (PL.plot(id) || {}).name || id;
  // the land tab's list of the ring's plots (appended under the old regions)
  function listHtml(h) {
    const S = G.S, open = PL.gateOpen(S.family);
    let out = `<div class="sec">外圈新地块（${open ? '买下时选一种用途，以后可以花钱改建' : '阿禾搬来、家里有 2 个人干活以后开放'}）</div>`;
    for (const p of PL.PLOTS) { const own = S.plots[p.id], o = PL.offer(S.plots, p.id, null, S.coins, G.F.wood, S.family);
      const mods = p.mods.map(m => PL.MODULES[m].name).join(' / ');
      const state = own ? `<span class="lv">${esc(PL.MODULES[own.mod].name)}</span>` : `<span class="lv">${esc(PL.TERRAIN[p.terrain])}</span>`;
      const lock = !own && (o.reason === 'gate' ? '阿禾搬来后开放' : o.reason === 'needs' ? '先修' + nameOf(o.needs) : '');
      const btn = own ? (p.mods.length > 1 ? `<button class="pbtn" data-plot="${p.id}">改建…</button>` : '<span class="done">✓</span>')
        : `<button class="pbtn" data-plot="${p.id}">${h.priceChips(p.price, p.wood || 0)}</button>` + (lock ? `<span class="short lock">${esc(lock)}</span>` : '');
      out += `<div class="card${own ? ' max' : ''}" data-item="plot:${p.id}">${icon(own ? own.mod : p.mods[0])}<div class="ct"><div><b>${esc(p.name)}</b> ${state}</div><div class="d">${esc(p.desc)}。可做：${esc(mods)}</div>` +
        `<button class="pbtn look" data-plotlook="${p.id}">看看</button></div><div class="cb">${btn}</div></div>`; }
    return out;
  }
  // one plot: choose its module (or change it)
  function detailHtml(id, h) {
    const S = G.S, p = PL.plot(id); if (!p) return '';
    const own = S.plots[id], open = PL.gateOpen(S.family), [x0, y0, x1, y1] = p.rect, size = `${Math.round((x1 - x0) / 8)}×${Math.round((y1 - y0) / 8)} 格`;
    let out = `<div class="sec"><button class="pbtn look" data-a="back">‹ 返回</button> <b>${esc(p.name)}</b> · ${esc(PL.TERRAIN[p.terrain])} · ${size}</div><div class="d" style="margin:2px 0 6px">${esc(p.desc)}</div>`;
    if (!own) {
      if (!open) out += `<div class="d plotgate">🔒 要先有 2 个人一起干活：阿禾搬来以后，外圈的地才能买（现在 ${PL.workers(S.family)} 人）</div>`;
      else if (p.needs && !S.plots[p.needs]) out += `<div class="d plotgate">🔒 要先修好「${esc(nameOf(p.needs))}」才能过去</div>`;
      out += `<div class="sec">${p.mods.length > 1 ? '选一种用途（买下以后还能花钱改）' : '买下以后'}</div>`;
      for (const mod of p.mods) { const o = PL.offer(S.plots, id, mod, S.coins, G.F.wood, S.family), M = PL.MODULES[mod];
        const extra = o.setup && (o.setup.cost || o.setup.wood) ? `（含${M.name}设施 ${o.setup.cost} 金${o.setup.wood ? ' + ' + o.setup.wood + ' 木材' : ''}）` : p.bundle === mod ? '（价钱里已经含设施）' : '';
        const short = o.reason === 'short' ? `<span class="short"><span class="lab">还差</span><span class="price">${o.short ? h.costChip(o.short, 'coin') : ''}${o.shortWood ? h.costChip(o.shortWood, 'wood') : ''}</span></span>` : '';
        out += `<div class="card" data-item="mod:${mod}">${icon(mod)}<div class="ct"><div><b>${esc(M.name)}</b> <span class="lv">${esc(M.now)}</span></div><div class="d">${esc(M.desc)}${esc(extra)}</div></div>` +
          `<div class="cb"><button class="pbtn" data-pbuy="${id}:${mod}"${o.ok ? '' : ' disabled'}>${h.priceChips(o.cost, o.wood)}</button>${short}</div></div>`; }
      return out;
    }
    const cur = PL.MODULES[own.mod];
    out += `<div class="card max">${icon(own.mod)}<div class="ct"><div><b>现在：${esc(cur.name)}</b> <span class="lv">第 ${own.day} 天买下</span></div><div class="d">${esc(cur.desc)}</div></div><div class="cb"><span class="done">✓</span></div></div>`;
    if (p.mods.length < 2) return out + `<div class="d">这块地只有一种用途</div>`;
    const busy = G.plotBusy && G.plotBusy(id); if (busy) return out + `<div class="d">${esc(busy)}</div>`; // v5.6.0
    const crops = G.tiles.filter(t => t.f === id && t.crop).length, trees = G.S.trees.filter(t => t.id.startsWith('x' + id) && t.stage === 'tree').length;
    const wsNote = G.worksVacateNote && G.worksVacateNote(id); if (wsNote) out += `<div class="d ws-note">${esc(wsNote)}</div>`; // v5.10.12
    if (own.free) out += `<div class="d">民宿已经搬到镇门口的农家乐区，这块地空出来了：这次改建不要钱。</div>`; // v5.11.0.5
    out += own.free ? `<div class="sec">改建成别的（免费一次）</div>` : `<div class="sec">改建成别的（地价的四分之一 + 10 木材${own.mod === 'field' && crops ? `；地里 ${crops} 棵庄稼按现价卖掉，没熟的退种子钱` : ''}${own.mod === 'woodland' && trees ? `；${trees} 棵树砍成木材` : ''}）</div>`;
    for (const mod of p.mods) { if (mod === own.mod) continue; const o = PL.rezoneOffer(S.plots, id, mod, S.coins, G.F.wood), M = PL.MODULES[mod];
      const short = o.reason === 'short' ? `<span class="short"><span class="lab">还差</span><span class="price">${o.short ? h.costChip(o.short, 'coin') : ''}${o.shortWood ? h.costChip(o.shortWood, 'wood') : ''}</span></span>` : '';
      out += `<div class="card" data-item="mod:${mod}">${icon(mod)}<div class="ct"><div><b>改成${esc(M.name)}</b> <span class="lv">${esc(M.now)}</span></div><div class="d">${esc(M.desc)}</div></div>` +
        `<div class="cb"><button class="pbtn" data-pzone="${id}:${mod}"${o.ok ? '' : ' disabled'}>${o.free ? '免费' : h.priceChips(o.cost, o.wood)}</button>${short}</div></div>`; }
    return out;
  }
  // locked plots get a label over their sign, like the old regions; a click opens their page in the shop
  const box = document.getElementById('rlabs'), labs = {};
  if (box) for (const p of PL.PLOTS) { const d = document.createElement('div'); d.className = 'rlab panel'; d.hidden = true; d.title = p.desc;
    d.addEventListener('click', () => G.openPlot && G.openPlot(p.id)); box.appendChild(d); labs[p.id] = d; }
  // Every price sign on the map (the old regions' from ui.js, whose rAF runs first, and the ring's above) is laid out once per frame:
  // each keeps its anchor if it can, else steps up / down / sideways to the first spot that hits neither another sign nor the HUD
  // (panels, buttons, the title, the minimap and the strip where the achievement toast appears); with no free spot it hides.
  const HUD_IDS = ['hud', 'title', 'minimap', 'log', 'catches', 'inv', 'menuBtn', 'shopBtn', 'storeBtn', 'codexBtn', 'mapBtn', 'tools', 'loveTip', 'syncHint'];
  const SIZE = new WeakMap(); let hud = [], hudAt = 0;
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const STEPS = [[0, 0], [0, -1], [0, 1], [-0.55, 0], [0.55, 0], [-0.55, -1], [0.55, -1], [-0.55, 1], [0.55, 1], [0, -2], [0, 2]];
  function hudRects(now) {
    if (now - hudAt < 500 && hud.length) return hud; hudAt = now; hud = [];
    for (const id of HUD_IDS) { const e = document.getElementById(id); if (!e || e.hidden) continue; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) hud.push([r.left - 4, r.top - 4, r.right + 4, r.bottom + 4]); }
    const vw = innerWidth; hud.push([vw / 2 - 160, 70, vw / 2 + 160, 106]); // #say: the achievement toast (top 76px, centred), reserved so a toast never sits on a sign
    return hud;
  }
  function declutter() {
    const all = box ? box.children : [], vw = innerWidth, vh = innerHeight, H = hudRects(performance.now()), placed = [];
    for (const d of all) { if (d.hidden) continue;
      let sz = SIZE.get(d); if (!sz || sz.html !== d.innerHTML) { sz = { html: d.innerHTML, w: d.offsetWidth, h: d.offsetHeight }; SIZE.set(d, sz); }
      const ax = d._ax = parseFloat(d.style.left), ay = parseFloat(d.style.top), w = sz.w, h = sz.h; let ok = false;
      for (const [sx, sy] of STEPS) { const x = ax + sx * (w + 6), y = ay + sy * (h + 4), r = [x - w / 2, y - h, x + w / 2, y];
        if (r[0] < 2 || r[2] > vw - 2 || r[1] < 2 || r[3] > vh - 2) continue;
        if (H.some(b => hit(r, b)) || placed.some(b => hit(r, b))) continue;
        placed.push(r); if (sx || sy) { d.style.left = Math.round(x) + 'px'; d.style.top = Math.round(y) + 'px'; } ok = true; break; }
      if (!ok) d.hidden = true; }
  }
  G.signRects = () => [...(box ? box.children : [])].filter(d => !d.hidden).map(d => { const r = d.getBoundingClientRect(); return { text: d.textContent, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; });
  G.hudRects = () => hudRects(-1e9).map(r => r.slice());
  let labKey = '';
  (function place() { const S = G.S, vw = innerWidth, vh = innerHeight, open = PL.gateOpen(S.family), key = open + JSON.stringify(S.plots);
    if (key !== labKey) { labKey = key; for (const p of PL.PLOTS) { const needs = p.needs && !S.plots[p.needs];
      labs[p.id].innerHTML = !open ? `🔒 ${esc(p.name)}` : `未解锁 · ${esc(p.name)}<br>${needs ? '先修' + esc(nameOf(p.needs)) : `<span class="cost"><i class="ico coin"></i><span class="amt">${p.price}</span></span>${p.wood ? ` <span class="cost"><i class="ico wood"></i><span class="amt">${p.wood}</span></span>` : ''} · 选用途`}`; } }
    for (const p of PL.PLOTS) { const d = labs[p.id]; if (S.plots[p.id]) { d.hidden = true; continue; }
      const c = G.toClient(p.sign.x, p.sign.y), dy = open ? 52 : 40, on = c.x > 90 && c.x < vw - 90 && c.y - dy > 64 && c.y < vh - 64;
      d.hidden = !on; if (on) { d.style.left = Math.round(c.x) + 'px'; d.style.top = Math.round(c.y - dy) + 'px'; } }
    declutter();
    requestAnimationFrame(place); })();
  window.PFPlotsUI = { listHtml, detailHtml, icon, ICON };
})();
