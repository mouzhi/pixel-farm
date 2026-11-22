// v5.10.14 活动倒计时: periodic town events (集市 / 运动会 / 丰收节) in one registry.
// nextOccurrence is a pure function; a new event is one register() call (e.g. a planned 海边节
// every 28 days, offset 14). Only unlocked events are listed. Rules only (the HUD chip is events-ui.js).
// Offline days are not special-cased here: the same weekday rule as market.js / school.js / festival.js.
(function (root) {
  'use strict';
  const MK = (typeof require === 'function' && typeof document === 'undefined') ? require('./market.js') : root.PFMarket;
  const SC = (typeof require === 'function' && typeof document === 'undefined') ? require('./school.js') : root.PFSchool;
  const FS = (typeof require === 'function' && typeof document === 'undefined') ? require('./festival.js') : root.PFFestival;

  const EVENTS = [];

  // first day d >= `day` such that d > after and d % every === offset
  // (the unlock day itself never counts; same rule as market / school / festival nextDay)
  function nextOccurrence(day, every, offset, after) {
    every = every | 0;
    if (every <= 0) return null;
    const off = ((offset | 0) % every + every) % every;
    const from = after | 0;
    let d = Math.max(day | 0, from + 1);
    while ((d % every) !== off) d++;
    return d;
  }

  function clock(mins) {
    const t = ((mins | 0) % 1440 + 1440) % 1440;
    return { h: Math.floor(t / 60), m: t % 60, t };
  }

  // 「今晚18点」 for an evening start, 「今天7点」 in the morning
  function hourText(mins) {
    const h = clock(mins).h;
    return (h >= 17 ? '今晚' : '今天') + h + '点';
  }

  function whenText(it) {
    if (!it) return '';
    if (it.open) return '进行中';
    if (it.laterToday) return hourText(it.hours.from);
    const n = it.days | 0;
    if (n <= 0) return hourText(it.hours.from);
    return '还有' + n + '天';
  }

  function lineOf(it) { return it ? (it.icon || '') + it.name + ' ' + whenText(it) : ''; }

  function register(ev) {
    if (!ev || !ev.id) return null;
    const i = EVENTS.findIndex(e => e.id === ev.id);
    if (i >= 0) EVENTS[i] = ev; else EVENTS.push(ev);
    return ev;
  }

  function unregister(id) {
    const i = EVENTS.findIndex(e => e.id === id);
    if (i >= 0) EVENTS.splice(i, 1);
    return i >= 0;
  }

  function list() { return EVENTS.slice(); }

  function unlocked(ev, ctx) {
    if (!ev) return false;
    if (typeof ev.unlock === 'function') return !!ev.unlock(ctx || {});
    return ev.unlock !== false;
  }

  function afterOf(ev, ctx) {
    if (typeof ev.after === 'function') return ev.after(ctx || {}) | 0;
    return ev.after | 0;
  }

  function itemOf(ev, ctx) {
    const day = (ctx && ctx.day) | 0, T = ((ctx && ctx.t) | 0);
    const every = ev.every | 0, offset = ev.offset | 0, after = afterOf(ev, ctx);
    const hours = ev.hours || { from: 0, to: 1440 };
    let next = nextOccurrence(day, every, offset, after);
    if (next == null) return null;
    const today = next === day;
    const open = today && T >= hours.from && T < hours.to;
    const laterToday = today && T < hours.from;
    const doneToday = today && T >= hours.to;
    if (doneToday) next = nextOccurrence(day + 1, every, offset, after);
    if (next == null) return null;
    const it = {
      id: ev.id, name: ev.name, icon: ev.icon || '', every: every, offset: offset,
      hours: { from: hours.from | 0, to: hours.to | 0 },
      priority: ev.priority | 0, day: next, days: next - day,
      open: !!open, laterToday: !!laterToday, today: today && !doneToday,
    };
    it.text = whenText(it);
    it.line = lineOf(it);
    return it;
  }

  function sortItems(a, b) {
    return (a.day - b.day) || (a.hours.from - b.hours.from) || ((b.priority | 0) - (a.priority | 0));
  }

  // among events still happening or later today, prefer the more special one (丰收节 > 运动会 > 集市),
  // so a festival morning shows 「🏮丰收节 今晚18点」 rather than the weekly market already in progress.
  // the same tie-break applies when several events share the next upcoming day.
  function pickHead(items) {
    if (!items || !items.length) return null;
    const today = items.filter(it => it.open || it.laterToday);
    const pool = today.length ? today : items.filter(it => it.day === items[0].day);
    pool.sort((a, b) => ((b.priority | 0) - (a.priority | 0)) || (a.hours.from - b.hours.from));
    return pool[0];
  }

  // ctx: { hall, day, t, save }. list: optional override (tests / a one-off event)
  function view(ctx, list) {
    ctx = ctx || {};
    const items = [];
    for (const ev of (list || EVENTS)) {
      if (!unlocked(ev, ctx)) continue;
      const it = itemOf(ev, ctx);
      if (it) items.push(it);
    }
    items.sort(sortItems);
    const head = pickHead(items);
    return { items, head, line: head ? head.line : '', empty: !items.length };
  }

  // ---------- built-in events (only shown once their town project is up) ----------
  register({
    id: 'market', name: '集市', icon: '🧺', every: (MK && MK.EVERY) || 7, offset: 0, priority: 1,
    hours: (MK && MK.HOURS) || { from: 7 * 60, to: 16 * 60 },
    unlock: ctx => !!(MK && MK.built(ctx && ctx.hall)),
    after: ctx => ((ctx && ctx.hall && ctx.hall.built && ctx.hall.built.market) | 0),
  });
  register({
    id: 'sports', name: '运动会', icon: '🏅', every: (SC && SC.EVERY) || 14, offset: 0, priority: 2,
    hours: (SC && SC.HOURS) || { from: 9 * 60, to: 15 * 60 },
    unlock: ctx => !!(SC && SC.built(ctx && ctx.hall)),
    after: ctx => ((ctx && ctx.hall && ctx.hall.built && ctx.hall.built.school) | 0),
  });
  register({
    // 灯会 is the evening of the same 丰收节, not a second chip
    id: 'festival', name: '丰收节', icon: '🏮', every: (FS && FS.EVERY) || 28, offset: 0, priority: 3,
    hours: { from: (FS && FS.FEAST && FS.FEAST.from) || 18 * 60, to: (FS && FS.FAIR && FS.FAIR.to) || 22 * 60 },
    unlock: ctx => !!(FS && FS.ready(ctx && ctx.hall)),
    after: ctx => ((FS && FS.readyDay(ctx && ctx.hall)) || 0),
  });
  // Planned v5.11.2 海边节: every 28 days, offset 14 (halfway between harvest festivals), once the resort is up:
  //   register({ id: 'beach', name: '海边节', icon: '🌊', every: 28, offset: 14, priority: 3,
  //     hours: { from: 16 * 60, to: 21 * 60 },
  //     unlock: ctx => !!(ctx.save && ctx.save.inn && ctx.save.inn.resort),
  //     after: ctx => ((ctx.save && ctx.save.inn && ctx.save.inn.resort) | 0) });

  const api = { EVENTS, register, unregister, list, nextOccurrence, hourText, whenText, lineOf,
    itemOf, view, pickHead, unlocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFEvents = api;
})(typeof window !== 'undefined' ? window : globalThis);
