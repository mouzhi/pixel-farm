// PROTOTYPE (feat/mobile-touch, not for merge): phone tool mode for the map tools.
// On a coarse pointer (or ?touch / PFPlatform.mobile): the #tools row folds into one ⚒ button; a tool shows a crosshair at a fixed
// spot on screen, the map pans under it, the green/red preview follows the crosshair, and a bottom bar says what to do with ✖ / ✔.
// In 挪东西 the picked thing gets floating buttons. Drives the existing modes through ui.js buttons and synthetic pointer events
// on the canvas, so game.js is untouched (a real version would call hoverAt / clickAt hooks instead).
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const on = q.has('touch') || (window.PFPlatform && PFPlatform.mobile) || matchMedia('(pointer: coarse)').matches;
  if (!on) return;
  const G = window.__farm, $ = id => document.getElementById(id), doc = document;
  doc.documentElement.classList.add('pf-touch');
  const ICON = { chop: '🪓', plant: { apple: '🍎', orange: '🍊' }, release: '🐟', decor: '🪑', move: '✋', clear: '🧹', clearmove: '🧹', sprinkler: '💧' };
  const NAME = { chop: '砍树', plant: '种树', release: '放养', decor: '摆装饰', move: '挪东西', sprinkler: '浇水器' };
  const HINT = {
    chop: '把准星对准一棵野树，点 ✔ 标记要砍（再对准一次可取消）',
    plant: '拖动地图，让准星落在空草地上，绿色就能种',
    release: '把准星移到池塘上，点 ✔ 放进去',
    decor: '拖动地图找位置，框变绿就能放',
    move: '把准星对准要挪的东西，点 ✔ 选中',
    move2: '拖动地图，让绿框落到新位置，点 ✔ 放下'
  };
  const css = doc.createElement('style');
  css.textContent = `
  html.pf-touch #tools { display: none !important; }
  #pt-box[hidden], #pt-sheet[hidden], #pt-ret[hidden], #pt-bar[hidden], #pt-float[hidden] { display: none !important; }
  #pt-box { position: fixed; right: 12px; z-index: 30; width: 58px; height: 58px; border-radius: 50%; border: 3px solid #5b3a1e; background: #f3d9a4;
    box-shadow: 0 3px 0 #5b3a1e, 0 4px 10px rgba(0,0,0,.35); font-size: 28px; line-height: 50px; text-align: center; }
  #pt-box .n { position: absolute; right: -4px; top: -4px; min-width: 20px; height: 20px; border-radius: 10px; background: #d9483b; color: #fff; font: 700 12px/20px sans-serif; }
  #pt-sheet { position: fixed; left: 8px; right: 8px; z-index: 31; background: #fbecc8; border: 3px solid #5b3a1e; border-radius: 14px; padding: 10px 10px 12px; box-shadow: 0 6px 18px rgba(0,0,0,.4); }
  #pt-sheet h4 { margin: 0 4px 8px; font: 700 15px sans-serif; color: #4a2e14; display: flex; justify-content: space-between; }
  #pt-sheet .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  #pt-sheet button { height: 76px; border-radius: 10px; border: 2px solid #8a5a2c; background: #fff6df; color: #4a2e14; font: 600 13px sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 0; }
  #pt-sheet button .i { font-size: 26px; line-height: 30px; } #pt-sheet button .c { font-size: 11px; color: #8a5a2c; }
  #pt-sheet button.full { opacity: .5; } #pt-sheet .row2 { margin-top: 8px; display: flex; gap: 8px; } #pt-sheet .row2 button { height: 40px; flex: 1; flex-direction: row; }
  #pt-ret { position: fixed; z-index: 25; width: 56px; height: 56px; margin: -28px 0 0 -28px; pointer-events: none; }
  #pt-ret:before, #pt-ret:after { content: ''; position: absolute; background: #fff; box-shadow: 0 0 0 1.5px rgba(40,25,10,.8); }
  #pt-ret:before { left: 27px; top: 0; width: 2px; height: 56px; } #pt-ret:after { top: 27px; left: 0; height: 2px; width: 56px; }
  #pt-ret i { position: absolute; left: 18px; top: 18px; width: 16px; height: 16px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1.5px rgba(40,25,10,.8); }
  #pt-ret.ok i { border-color: #8cf07a; } #pt-ret.bad i { border-color: #ff7b6b; }
  #pt-bar { position: fixed; left: 8px; right: 8px; z-index: 30; background: rgba(40,26,14,.92); border: 2px solid #c79a5a; border-radius: 14px; padding: 8px; display: flex; align-items: center; gap: 8px; color: #fff3d6; }
  #pt-bar .t { flex: 1; font: 600 13px/1.35 sans-serif; } #pt-bar .t b { color: #ffd76a; display: block; font-size: 14px; } #pt-bar .t .why { color: #ffb0a4; }
  #pt-bar button { width: 56px; height: 56px; border-radius: 12px; font: 700 24px sans-serif; border: 2px solid #000; flex: none; }
  #pt-bar .x { background: #e8d6b8; color: #6b3a1a; } #pt-bar .ok { background: #7ccf5a; color: #fff; } #pt-bar .ok[disabled] { background: #6a6a5a; color: #bbb; }
  #pt-float { position: fixed; z-index: 29; display: flex; gap: 6px; transform: translate(-50%, -100%); }
  #pt-float button { white-space: nowrap; min-width: 64px; padding: 0 12px; height: 44px; border-radius: 22px; border: 2px solid #5b3a1e; background: #fff6df; font: 700 14px sans-serif; color: #4a2e14; box-shadow: 0 2px 0 #5b3a1e; }
  #pt-float button.p { background: #7ccf5a; color: #fff; }
  html.pf-touch.pt-mode #xhs-bar, html.pf-touch.pt-mode #pt-box, html.pf-touch.pt-mode #xhs-toast, html.pf-touch.pt-mode #say { visibility: hidden; }`;
  doc.head.appendChild(css);
  const mk = (tag, id, html) => { const e = doc.createElement(tag); if (id) e.id = id; if (html != null) e.innerHTML = html; doc.body.appendChild(e); return e; };
  const box = mk('button', 'pt-box', '⚒<span class="n" hidden></span>'), sheet = mk('div', 'pt-sheet'), ret = mk('div', 'pt-ret', '<i></i>'), bar = mk('div', 'pt-bar'), flt = mk('div', 'pt-float');
  sheet.hidden = ret.hidden = bar.hidden = flt.hidden = true;
  const barTop = () => { const b = $('xhs-bar'); return b && b.getClientRects().length ? b.getBoundingClientRect().top : innerHeight - 8; };
  const place = () => { const t = barTop(); box.style.top = (t - 70) + 'px'; sheet.style.bottom = (innerHeight - t + 8) + 'px'; bar.style.bottom = (innerHeight - Math.max(t + 54, innerHeight - 8)) + 'px'; };
  const RET = () => ({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight * 0.46) }); // fixed crosshair: above the thumb, clear of the HUD
  const cv = () => doc.querySelector('#wrap canvas') || doc.querySelector('canvas');
  const fire = (type, x, y) => cv().dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  let fingers = 0; addEventListener('touchstart', e => { fingers = e.touches.length; }, true); addEventListener('touchend', e => { fingers = e.touches.length; }, true); addEventListener('touchcancel', () => { fingers = 0; }, true);
  function toolsList() { return [...($('tools') ? $('tools').querySelectorAll('button[data-m]') : [])].map(b => ({ b, m: b.dataset.m, k: b.dataset.k || '', text: b.textContent.trim(), full: b.classList.contains('full') })); }
  function drawSheet() {
    const L = toolsList(), main = L.filter(t => !/^clear/.test(t.m)), clr = L.filter(t => /^clear/.test(t.m));
    sheet.innerHTML = `<h4><span>⚒ 工具</span><span style="font-weight:400;font-size:12px;color:#8a5a2c">点一个工具，再拖地图对准</span></h4><div class="grid">` +
      main.map((t, i) => { const ic = typeof ICON[t.m] === 'object' ? ICON[t.m][t.k] || '🌳' : ICON[t.m] || '•'; const m = t.text.match(/^(\D+?)\s*(\d+)?(（.*）)?$/) || [, t.text];
        return `<button data-i="${i}" class="${t.full ? 'full' : ''}"><span class="i">${ic}</span>${m[1]}<span class="c">${m[2] ? '×' + m[2] : '&nbsp;'}</span></button>`; }).join('') + '</div>' +
      (clr.length ? '<div class="row2">' + clr.map((t, i) => `<button data-c="${i}">🧹 ${t.text.replace(' ✕', '')} 撤销</button>`).join('') + '</div>' : '');
    sheet.onclick = e => { const b = e.target.closest('button'); if (!b) return; const t = b.dataset.i != null ? main[+b.dataset.i] : clr[+b.dataset.c]; sheet.hidden = true; if (t) t.b.click(); haptic(); };
  }
  box.onclick = () => { sheet.hidden = !sheet.hidden; if (!sheet.hidden) drawSheet(); haptic(); };
  function haptic() { try { if (window.xhs && xhs.vibrateShort) xhs.vibrateShort({ type: 'light' }); else if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  let why = '';
  addEventListener('pf:say', e => { why = String(e.detail || ''); if (/^(选中|标记|取消|游进)/.test(why)) why = ''; setTimeout(() => { why = ''; }, 2400); });
  bar.innerHTML = '<button class="x">✖</button><div class="t"></div><button class="ok">✔</button>';
  bar.querySelector('.x').onclick = () => { if (G.input.mode === 'move' && G.input.mvPick) { G.input.mvPick = null; } else G.setMode(null); haptic(); };
  bar.querySelector('.ok').onclick = () => { const r = RET(); fire('pointerdown', r.x, r.y); fire('pointerup', r.x, r.y); haptic(); };
  function kindName() { const t = toolsList().find(t => t.m === G.input.mode && (!t.k || t.k === G.input.kind)); return t ? t.text.replace(/\s*\d+.*$/, '') : NAME[G.input.mode] || ''; }
  function tick() {
    place(); const m = G.input && G.input.mode, n = toolsList().filter(t => !/^clear/.test(t.m)).length;
    box.hidden = !n; box.querySelector('.n').hidden = true;
    doc.documentElement.classList.toggle('pt-mode', !!m); ret.hidden = bar.hidden = !m; if (m) sheet.hidden = true;
    if (m) { const r = RET(); ret.style.left = r.x + 'px'; ret.style.top = r.y + 'px';
      if (!fingers) fire('pointermove', r.x, r.y); // keep the preview under the crosshair (never while a finger is panning)
      const h = G.input.hover, ok = h ? (h.dec ? h.dec.ok : h.tree ? true : h.ok) : null; ret.className = ok == null ? '' : ok ? 'ok' : 'bad';
      const pick = m === 'move' && G.input.mvPick, hint = pick ? HINT.move2 : HINT[m] || '';
      bar.querySelector('.t').innerHTML = `<b>${pick ? '挪动中' : kindName()}</b>${why ? `<span class="why">${why}</span>` : hint}`;
      const okB = bar.querySelector('.ok'); okB.textContent = '✔'; }
    // floating buttons over the picked thing in 挪东西
    const pk = m === 'move' && G.input.mvPick; flt.hidden = !pk;
    if (pk) { const c = G.toClient(pk.x, pk.y); flt.style.left = c.x + 'px'; flt.style.top = (c.y - 46) + 'px';
      if (!flt._k || flt._k !== pk.what + pk.ref) { flt._k = pk.what + pk.ref; flt.innerHTML = '<button class="p" data-a="move">✋ 移动</button><button data-a="store">📦 收回</button><button data-a="x">✖</button>';
        flt.onclick = e => { const a = e.target.dataset.a; if (a === 'x') G.input.mvPick = null; else if (a === 'store') dispatchEvent(new CustomEvent('pf:say', { detail: '（原型）收回仓库还没做' })); else flt.hidden = true; haptic(); }; } }
    requestAnimationFrame(tick);
  }
  // long-press a movable thing (no tool picked) → 挪东西 with it picked
  let lp = null;
  cv().addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || G.input.mode) return; const x = e.clientX, y = e.clientY;
    lp = setTimeout(() => { lp = null; const mv = toolsList().find(t => t.m === 'move'); if (!mv) return; mv.b.click(); fire('pointerdown', x, y); fire('pointerup', x, y); if (G.input.mvPick) haptic(); else G.setMode(null); }, 480); });
  ['pointerup', 'pointercancel'].forEach(t => cv().addEventListener(t, () => { if (lp) clearTimeout(lp); lp = null; }));
  cv().addEventListener('pointermove', e => { if (lp && e.pointerType === 'touch' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) { clearTimeout(lp); lp = null; } });
  requestAnimationFrame(tick);
  window.PFTouch = { RET, drawSheet, open: () => box.onclick() };
})();
