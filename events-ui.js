// v5.10.14 活动倒计时芯片：贴在 HUD 日期/时钟下面。收起时一行最近的活动，点开列出已解锁的接下来几次。
// Rules live in events.js (window.PFEvents). No save fields.
(function () {
  'use strict';
  const G = window.__farm, EV = window.PFEvents;
  if (!G || !EV) return;

  const $ = id => document.getElementById(id);
  let open = false, key = '';

  function ensure() {
    let el = $('countdown');
    if (el) return el;
    const hud = $('hud'); if (!hud) return null;
    el = document.createElement('div');
    el.id = 'countdown';
    el.hidden = true;
    const row = hud.querySelector('.row');
    if (row && row.nextSibling) hud.insertBefore(el, row.nextSibling);
    else hud.appendChild(el);
    return el;
  }

  function ctx() {
    const S = G.S; if (!S) return null;
    return { hall: S.town && S.town.hall, day: S.day | 0, t: ((S.t % 1440) + 1440) % 1440, save: S };
  }

  function html(v) {
    const head = v.head;
    const caret = open ? '▴' : '▾';
    const on = head && (head.open || head.laterToday) ? ' on' : '';
    let h = `<div class="cd-head" title="点开看看接下来的活动" role="button" tabindex="0"><span class="cd-line${on}">${esc(head ? head.line : '')}</span><span class="cd-caret">${caret}</span></div>`;
    if (open && v.items.length) {
      h += '<div class="cd-list">';
      for (const it of v.items) {
        const cls = it.open || it.laterToday ? ' on' : '';
        h += `<div class="cd-item${cls}"><span class="nm">${esc((it.icon || '') + it.name)}</span><span class="when">${esc(it.text)}</span></div>`;
      }
      h += '</div>';
    }
    return h;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function draw(force) {
    const el = ensure(); if (!el) return;
    const c = ctx();
    const v = c ? EV.view(c) : { items: [], head: null, line: '', empty: true };
    if (v.empty) { if (!el.hidden) { el.hidden = true; el.innerHTML = ''; } key = ''; open = false; return; }
    const k = (open ? '1|' : '0|') + v.line + '|' + v.items.map(it => it.id + ':' + it.day + ':' + it.text).join(',');
    if (!force && k === key && !el.hidden) return;
    key = k; el.hidden = false; el.innerHTML = html(v);
  }

  function toggle(on) {
    open = on == null ? !open : !!on;
    key = '';
    draw(true);
  }

  const elClick = ev => {
    const el = $('countdown'); if (!el || el.hidden) return;
    if (el.contains(ev.target)) { ev.preventDefault(); toggle(); }
  };
  const docDown = ev => {
    const el = $('countdown');
    if (!open || !el || el.contains(ev.target)) return;
    toggle(false);
  };
  const keydown = ev => {
    const el = $('countdown');
    if (ev.key === 'Escape' && open) { toggle(false); return; }
    if (el && ev.target && el.contains(ev.target) && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); toggle(); }
  };

  function bind() {
    const el = ensure(); if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', elClick);
    document.addEventListener('pointerdown', docDown);
    document.addEventListener('keydown', keydown);
  }

  bind();
  draw();
  const api = { draw, toggle, isOpen: () => open };
  window.PFEventsUI = api;
})();
