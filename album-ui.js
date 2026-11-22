// 像素农场 · 相册面板（v5.11.0.11）：「相册 L」按钮打开；日记本里也有「相册」页签（小红书版就从日记的书本图标进来，不加新按钮）。
// Rules and captions live in album.js; the game (__farm.albumView / albumRestage) hands over the photos. A photo whose picture is
// not on this device is re-staged one at a time while the album is open. Other hosts can call PFAlbumUI.renderInto(el, id).
'use strict';
(() => {
  const G = window.__farm, AL = window.PFAlbum; if (!G || !AL || !G.albumView) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = document.createElement('style');
  css.textContent = `#album{position:relative;width:min(392px,calc(100vw - 24px));max-height:calc(100vh - 200px);overflow:auto;padding:8px 10px;color:#3a2618;z-index:3;
    background:#f6e7c4;border-color:#8a5a34;box-shadow:inset 0 0 0 2px #e2c995,0 0 0 2px #3a2618}
  #album[hidden]{display:none}
  .alb .shead{display:flex;align-items:center;gap:8px;margin-bottom:6px}.alb .shead b{font-size:16px;color:#7a3e1c}.alb .shead .x{margin-left:auto;padding:0 7px}
  .alb .shead .cnt{font-size:12px;color:#7a5a34;font-weight:600}.alb .shead .tab{padding:1px 8px;font-size:12px}
  .alb .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px;justify-items:center}
  .alb .pol{width:168px;background:#fffaf0;border:none;box-shadow:0 0 0 2px #c9a46a,2px 3px 0 2px rgba(58,38,24,.35);padding:4px 4px 3px;cursor:pointer;text-align:left;font:inherit;color:#3a2618;position:relative}
  .alb .pol:nth-child(odd){transform:rotate(-1deg)}.alb .pol:nth-child(even){transform:rotate(1deg)}.alb .pol:hover{transform:none;box-shadow:0 0 0 2px #7a3e1c,2px 3px 0 2px rgba(58,38,24,.35)}
  .alb .pic{display:block;width:160px;height:110px;image-rendering:pixelated;background:#cdb88e}
  .alb .pic.wait{background:repeating-linear-gradient(45deg,#d9c59a 0 6px,#cdb88e 6px 12px)}
  .alb .cap{display:block;font-size:12px;line-height:16px;font-weight:700;color:#5a2e14;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .alb .when{display:block;font-size:10px;line-height:13px;color:#8a6a44;font-weight:600}
  .alb .tag{position:absolute;right:6px;top:6px;font-size:10px;line-height:13px;padding:0 4px;background:rgba(58,38,24,.75);color:#fff6dc}
  .alb .pol.lock{cursor:default;background:#efe0bd}.alb .pol.lock .pic{display:flex;align-items:center;justify-content:center;flex-direction:column;background:#d8c495;color:#8a6a44;font-size:22px;font-weight:800;letter-spacing:2px}
  .alb .pol.lock .pic small{font-size:11px;letter-spacing:0;font-weight:600;padding:0 8px;text-align:center;line-height:15px;margin-top:4px}
  .alb .big{display:flex;flex-direction:column;align-items:center;gap:6px}
  .alb .big .pol{width:auto;transform:none;cursor:default;padding:6px 6px 8px}.alb .big .pic{width:320px;height:220px}
  .alb .big .cap{font-size:15px;line-height:20px}.alb .big .when{font-size:12px}.alb .big p{margin:2px 0 0;font-size:13px;line-height:20px;max-width:320px;white-space:normal}
  .alb .big .row{display:flex;gap:8px}
  .alb .note{font-size:11px;color:#7a5a34;margin-top:8px}
  @media (max-width:720px){#album{position:fixed;left:12px;right:12px;top:72px;width:auto;max-height:calc(100vh - 120px);z-index:6}
    .alb .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.alb .pol{width:100%;max-width:168px}.alb .pic{width:100%;height:auto;aspect-ratio:160/110}
    .alb .big .pic{width:min(320px,calc(100vw - 72px));height:auto}.alb .pol .pbtn,.alb .big .pbtn{min-height:34px}}
  #albumToast{position:fixed;left:50%;top:88px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;background:#fffaf0;color:#5a2e14;
    font:700 13px "Noto Sans CJK SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 0 0 2px #8a5a34,3px 3px 0 2px rgba(0,0,0,.3);z-index:9;cursor:pointer;
    transition:opacity .4s,transform .4s;pointer-events:auto}
  #albumToast[hidden]{display:none}#albumToast.out{opacity:0;transform:translate(-50%,-6px)}
  html.xhs-mobile #albumBtn{display:none!important}html.xhs-mobile #albumToast{top:calc(var(--xhs-top-clear,0px) + 64px)}
  html.xhs-mobile .alb .shead .tab,html.xhs-mobile .alb .shead .x,html.xhs-mobile .alb .big .pbtn{min-width:44px;min-height:44px;font-size:15px}
  @media (min-width:721px){html.pf-alb-toast #say{top:calc(var(--pf-alb-toast-bottom,151px) + 6px)}}
  #albumToast img{width:80px;height:55px;image-rendering:pixelated;box-shadow:0 0 0 1px #c9a46a}#albumToast small{display:block;font-size:11px;color:#8a6a44;font-weight:600}`;
  document.head.appendChild(css);
  const dock = $('rightDock') || document.body;
  let el = $('album'); if (!el) { el = document.createElement('div'); el.id = 'album'; el.className = 'panel'; el.hidden = true; dock.appendChild(el); }
  el.classList.add('alb');
  const btn = $('albumBtn');
  // ---- rendering into a host: the #album panel, or the diary panel's 相册 tab ----
  function head(host, v) {
    const inDiary = host.id === 'diary';
    return `<div class="shead">${inDiary ? '<button class="pbtn tab" data-a="diary" title="回到日记">日记</button>' : ''}<b>相册</b><span class="cnt">${v.have}/${v.total}</span>` +
      `<button class="pbtn x" data-al="close" title="关闭（${inDiary ? 'K' : 'L'} / Esc）">✕</button></div>`;
  }
  const pic = s => (s.url ? `<img class="pic" alt="" src="${s.url}">` : `<i class="pic wait" title="正在补拍"></i>`);
  function html(host) {
    const v = G.albumView(); if (!v) return ''; const st = host._alb || (host._alb = {});
    let h = head(host, v);
    const s = st.focus && v.shots.find(x => x.id === st.focus);
    if (s) {
      const i = v.shots.indexOf(s), prev = v.shots[i - 1], next = v.shots[i + 1];
      h += `<div class="big"><div class="pol">${pic(s)}<span class="cap">${esc(s.title)}</span><span class="when">${esc(s.when)}${s.restaged ? ' · 补拍' : ''}</span><p>${esc(s.line)}</p></div>` +
        `<div class="row"><button class="pbtn" data-al="shot" data-id="${prev ? esc(prev.id) : ''}"${prev ? '' : ' disabled'}>◀</button>` +
        `<button class="pbtn" data-al="back">全部照片</button><button class="pbtn" data-al="shot" data-id="${next ? esc(next.id) : ''}"${next ? '' : ' disabled'}>▶</button></div>` +
        (s.restaged ? '<div class="note">这张是按存档补拍的：那天的场景已经过去了，家人在原地重新摆了个姿势。</div>' : '') + '</div>';
      return h;
    }
    h += '<div class="grid">';
    for (const x of v.shots) h += `<button class="pol" data-al="shot" data-id="${esc(x.id)}" title="${esc(x.line)}">${pic(x)}${x.restaged ? '<span class="tag">补拍</span>' : ''}<span class="cap">${esc(x.title)}</span><span class="when">${esc(x.when)}</span></button>`;
    for (const x of v.locked) h += `<div class="pol lock" title="还没发生"><span class="pic">???<small>${esc(x.hint)}</small></span><span class="cap">？？？</span><span class="when">还没发生</span></div>`;
    h += '</div><div class="note">第一次发生的大事会自动拍一张照片，挂机时错过了也能回来翻。</div>';
    return h;
  }
  function wire(host) {
    if (host._albWired) return; host._albWired = 1;
    host.addEventListener('click', e => { const b = e.target.closest('[data-al]'); if (!b || !host.contains(b) || !host._albOn) return;
      const st = host._alb || (host._alb = {}), a = b.dataset.al;
      if (a === 'close') { if (host === el) close(); else { host._albOn = 0; host.hidden = true; } return; }
      if (a === 'shot' && b.dataset.id) st.focus = b.dataset.id; if (a === 'back') st.focus = null; draw(host); });
  }
  function draw(host) { if (!host || host.hidden || !host._albOn) return; const top = host.scrollTop; host.innerHTML = html(host); host.scrollTop = top; restageSoon(host); }
  function renderInto(host, focus) { host.classList.add('alb'); host._albOn = 1; (host._alb || (host._alb = {})).focus = focus || null; wire(host); host.hidden = false; draw(host); }
  // pictures this device does not have: one re-staged photo per tick, so opening the album never stalls a frame for long
  let busy = 0;
  function restageSoon(host) {
    if (busy) return; const v = G.albumView(); const miss = v && v.shots.find(s => !s.url); if (!miss) return;
    busy = 1; setTimeout(() => { busy = 0; if (host.hidden || !host._albOn) return; try { G.albumRestage(miss.id); } catch (e) {} draw(host); }, 80);
  }
  // ---- the standalone panel (web: 「相册 L」) ----
  function open(id) { for (const k of ['shop', 'store', 'codex', 'menu', 'diary']) { const p = $(k); if (p) p.hidden = true; } renderInto(el, id); }
  function close() { el.hidden = true; el._albOn = 0; }
  const toggle = () => (el.hidden ? open() : close());
  if (btn) btn.addEventListener('click', toggle);
  addEventListener('keydown', e => { if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return; if (e.key === 'l' || e.key === 'L') toggle(); if (e.key === 'Escape') close(); });
  addEventListener('pointerdown', e => { if (el.hidden || el.contains(e.target) || (btn && btn.contains(e.target)) || (toast && toast.contains(e.target))) return; close(); });
  for (const id of ['shopBtn', 'storeBtn', 'codexBtn', 'menuBtn', 'diaryBtn']) { const b = $(id); if (b) b.addEventListener('click', close); }
  // ---- the little toast when a photo is taken ----
  let toast = null, toastT = 0;
  addEventListener('pf:album', e => { const d = e.detail || {};
    if (!toast) { toast = document.createElement('div'); toast.id = 'albumToast'; toast.hidden = true; document.body.appendChild(toast);
      toast.addEventListener('click', () => { const id = toast.dataset.id; toast.hidden = true; stack(false); if (window.PFDiaryUI && !isShown(btn)) PFDiaryUI.album(id); else open(id); }); }
    toast.dataset.id = d.id || ''; toast.innerHTML = `${d.url ? `<img alt="" src="${d.url}">` : ''}<span>📷 存进相册<small>${esc(d.title)}</small></span>`;
    toast.hidden = false; toast.classList.remove('out'); clearTimeout(toastT); stack(true);
    toastT = setTimeout(() => { toast.classList.add('out'); toastT = setTimeout(() => { toast.hidden = true; stack(false); }, 450); }, 4200);
    if (!el.hidden) draw(el); const dy = $('diary'); if (dy && !dy.hidden && dy._albOn) draw(dy); });
  const isShown = b => !!(b && b.offsetParent);
  // v5.11.0.16: other top-centre messages (the #say line: 「成就：…」, and the 小红书 #xhs-toast) stack below the photo toast instead of
  // being drawn over it. While it shows, <html> gets .pf-alb-toast and --pf-alb-toast-bottom (its bottom edge in CSS px); pf:toaststack tells hosts.
  function stack(on) { const R = document.documentElement;
    if (on && toast && !toast.hidden) { R.style.setProperty('--pf-alb-toast-bottom', Math.ceil(toast.getBoundingClientRect().bottom) + 'px'); R.classList.add('pf-alb-toast'); }
    else R.classList.remove('pf-alb-toast');
    dispatchEvent(new CustomEvent('pf:toaststack', { detail: { album: R.classList.contains('pf-alb-toast') } })); }
  addEventListener('resize', () => { if (toast && !toast.hidden) stack(true); });
  window.PFAlbumUI = { open, close, toggle, renderInto, draw, html, el };
})();
