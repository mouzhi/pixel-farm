// 像素农场 · 日记本面板（v5.10.13）：「日记 K」按钮打开，一页一天，左右翻页，下面一排最近几天的小页签。
// Rules and the text live in diary.js; the game (__farm.diaryView) hands over one day at a time. Other hosts (the
// 小红书 shell) can call PFDiaryUI.open() / .html() and put the page in their own sheet.
'use strict';
(() => {
  const G = window.__farm, DY = window.PFDiary; if (!G || !DY || !G.diaryView) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = document.createElement('style');
  css.textContent = `#diary{position:relative;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 200px);overflow:auto;padding:8px 10px;color:#3a2618;z-index:3;
    background:#f6e7c4;border-color:#8a5a34;box-shadow:inset 0 0 0 2px #e2c995,0 0 0 2px #3a2618}
  #diary[hidden]{display:none}
  #diary .shead{display:flex;align-items:center;gap:8px;margin-bottom:6px}#diary .shead .tab{padding:1px 8px;font-size:12px}#diary .shead b{font-size:16px;color:#7a3e1c}#diary .shead .x{margin-left:auto;padding:0 7px}
  #diary .page{background:repeating-linear-gradient(#f6e7c4 0 21px,#e6cf9e 21px 22px);border:2px solid #c9a46a;padding:6px 10px 8px;min-height:120px}
  #diary .ttl{display:flex;align-items:center;gap:6px;font-weight:700;color:#7a3e1c;margin-bottom:4px;font-size:14px;line-height:22px}
  #diary .ttl .nav{padding:0 7px;font-size:13px}#diary .ttl .nav[disabled]{opacity:.35}#diary .ttl span{flex:1;text-align:center}
  #diary p{margin:0;font-size:13px;line-height:22px;font-weight:500;color:#3a2618}
  #diary .days{display:flex;gap:3px;flex-wrap:wrap;margin-top:6px}
  #diary .days .pbtn{padding:1px 6px;font-size:11px;min-width:0}
  #diary .note{font-size:11px;color:#7a5a34;margin-top:6px}
  #diary .photos{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}#diary .photos .ph{font-size:12px;padding:1px 8px;background:#fff6dc}
  @media (max-width:720px){#diary{position:fixed;left:12px;right:12px;top:72px;width:auto;max-height:calc(100vh - 120px);z-index:6}}`;
  document.head.appendChild(css);
  let el = $('diary'); if (!el) { el = document.createElement('div'); el.id = 'diary'; el.className = 'panel'; el.hidden = true; ($('rightDock') || document.body).appendChild(el); }
  let day = 0, key = '';
  function html(d) {
    const v = G.diaryView(d); if (!v) return '';
    const i = v.days.indexOf(v.day), prev = i > 0 ? v.days[i - 1] : 0, next = i < v.days.length - 1 ? v.days[i + 1] : 0;
    let h = `<div class="shead"><b>日记</b>${window.PFAlbumUI ? '<button class="pbtn tab" data-a="album" title="相册：第一次发生的大事都拍成了照片">📷 相册</button>' : ''}<button class="pbtn x" data-a="close" title="关闭（K / Esc）">✕</button></div>`;
    h += `<div class="page"><div class="ttl"><button class="pbtn nav" data-day="${prev}"${prev ? '' : ' disabled'} title="前一天">◀</button><span>${esc(v.title)}</span>` +
      `<button class="pbtn nav" data-day="${next}"${next ? '' : ' disabled'} title="后一天">▶</button></div>`;
    h += v.lines.map(l => `<p>${esc(l)}</p>`).join('');
    if (v.photos && v.photos.length) h += `<div class="photos">${v.photos.map(p => `<button class="pbtn ph" data-photo="${esc(p.id)}" title="在相册里看这张照片">📷 ${esc(p.title)}</button>`).join('')}</div>`; // v5.11.0.11
    h += '</div>';
    const recent = v.days.slice(-7);
    h += `<div class="days">${recent.map(n => `<button class="pbtn${n === v.day ? ' on' : ''}" data-day="${n}">${n === G.S.day ? '今天' : '第' + n + '天'}</button>`).join('')}</div>`;
    h += `<div class="note">每天自动记下，最多留最近 ${DY.DAYS} 天。</div>`;
    return h;
  }
  function draw(force) { if (el.hidden || el._albOn) return; const v = G.diaryView(day), k = JSON.stringify(v); if (!force && k === key) return; key = k; el.innerHTML = html(day); }
  function open(d) { day = d || 0; el._albOn = 0; for (const id of ['shop', 'store', 'codex', 'menu', 'album']) { const p = $(id); if (p) p.hidden = true; } el.hidden = false; draw(true); }
  function close() { el.hidden = true; el._albOn = 0; }
  // v5.11.0.11: the album as a tab of the diary (the 小红书 version opens it from the diary's book icon; no new button there)
  function album(id) { if (!window.PFAlbumUI) return; if (el.hidden) open(); PFAlbumUI.renderInto(el, id || null); }
  const toggle = () => (el.hidden ? open() : close());
  el.addEventListener('click', e => { const b = e.target.closest('[data-a],[data-day],[data-photo]'); if (!b || !el.contains(b)) return;
    if (b.dataset.a === 'close') return close();
    if (b.dataset.photo) return album(b.dataset.photo);
    if (b.dataset.a === 'album') return album();
    if (b.dataset.a === 'diary') { el._albOn = 0; return draw(true); } const n = +b.dataset.day; if (n) { day = n === G.S.day ? 0 : n; draw(true); } });
  const btn = $('diaryBtn'); if (btn) btn.addEventListener('click', toggle);
  addEventListener('keydown', e => { if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return; if (e.key === 'k' || e.key === 'K') toggle(); if (e.key === 'Escape') close(); });
  addEventListener('pointerdown', e => { if (el.hidden || el.contains(e.target) || (btn && btn.contains(e.target))) return; close(); });
  for (const id of ['shopBtn', 'storeBtn', 'codexBtn', 'menuBtn', 'albumBtn']) { const b = $(id); if (b) b.addEventListener('click', close); }
  setInterval(() => draw(false), 1500);
  // the morning bubble: yesterday in one line (the log has it too)
  G.onDiaryMorning = text => dispatchEvent(new CustomEvent('pf:say', { detail: text }));
  window.PFDiaryUI = { open, close, toggle, html, el, album };
})();
