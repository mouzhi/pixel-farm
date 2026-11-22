// 像素农场 · 每日日记（纯数据和纯函数；浏览器里是 window.PFDiary，Node 里可以 require 做单元测试）
// v5.10.13: a player asked "有没有日记功能，打开可以看到小人这一天种了多少菜钓了多少鱼". The game counts what each
// family member did per in-game day and keeps the last DAYS days in the save (append-only `diary` field, save stays v15).
// One entry: { d: day, w: 1 if it rained, a: { who: { p: {crop: n}, h: {item: n}, f: {fish: n} } }, pr: {product: n},
// wd: wood chopped, in: gold earned, out: gold spent, buy: [item ids], ev: [short event codes] }.
'use strict';
(function (root) {
  const DAYS = 30, MAX_WHO = 8, MAX_KEYS = 16, MAX_BUY = 8, MAX_EV = 8, MAX_N = 99999;
  const ACTS = ['p', 'h', 'f'];
  const ID = /^[a-z][a-z0-9_:-]{0,23}$/i;
  const int = (v, lo, hi) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const empty = () => ({ days: [] });
  const blank = d => ({ d, w: 0, a: {}, pr: {}, wd: 0, in: 0, out: 0, buy: [], ev: [] });
  // the entry for `day` (created on first use; older days beyond DAYS are dropped)
  function entry(D, day) {
    if (!D || !Array.isArray(D.days)) return null;
    let e = D.days[D.days.length - 1];
    if (!e || e.d !== day) { if (e && e.d > day) { e = D.days.find(x => x.d === day); if (e) return e; }
      e = blank(day); D.days.push(e); D.days.sort((a, b) => a.d - b.d); if (D.days.length > DAYS) D.days.splice(0, D.days.length - DAYS); }
    return e;
  }
  const bump = (o, k, n) => { if (!(k in o) && Object.keys(o).length >= MAX_KEYS) return; o[k] = Math.min(MAX_N, (o[k] || 0) + n); };
  // act: 'p' planted, 'h' harvested / picked, 'f' fish caught (by `who`); 'pr' product collected; 'wd' wood; 'in' / 'out' gold
  function add(D, day, act, id, n, who) {
    n = n == null ? 1 : +n; if (!(n > 0)) return false; const e = entry(D, day); if (!e) return false;
    if (ACTS.includes(act)) { if (!id || !ID.test(id)) return false; who = who && ID.test(who) ? who : 'farmer';
      if (!e.a[who]) { if (Object.keys(e.a).length >= MAX_WHO) return false; e.a[who] = {}; }
      const m = e.a[who]; bump(m[act] || (m[act] = {}), id, n); return true; }
    if (act === 'pr') { if (!id || !ID.test(id)) return false; bump(e.pr, id, n); return true; }
    if (act === 'wd' || act === 'in' || act === 'out') { e[act] = Math.min(1e9, (e[act] || 0) + Math.round(n)); return true; }
    return false;
  }
  function bought(D, day, id) { const e = entry(D, day); if (!e || !id || !ID.test(id)) return false; if (e.buy.length < MAX_BUY && !e.buy.includes(id)) e.buy.push(id); return true; }
  // ev codes: 'rain', 'fest', 'sports', 'born:<name>', 'moved', 'rare:<fish>', 'guests:<n>', 'giant:<crop>', 'pond:<fish>'
  function note(D, day, code) { const e = entry(D, day); if (!e || typeof code !== 'string' || !code) return false; code = code.slice(0, 24);
    if (code === 'rain') { e.w = 1; return true; }
    if (!e.ev.includes(code) && e.ev.length < MAX_EV) e.ev.push(code); return true; }
  function valid(raw) {
    const out = empty(); if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) return out;
    const cnt = o => { const r = {}; if (o && typeof o === 'object') for (const k of Object.keys(o).slice(0, MAX_KEYS)) if (ID.test(k)) { const n = int(o[k], 0, MAX_N); if (n) r[k] = n; } return r; };
    const seen = new Set();
    for (const e of raw.days.slice(-DAYS)) {
      if (!e || typeof e !== 'object') continue; const d = int(e.d, 0, 1e7); if (!d || seen.has(d)) continue; seen.add(d);
      const a = {}; if (e.a && typeof e.a === 'object') for (const w of Object.keys(e.a).slice(0, MAX_WHO)) if (ID.test(w)) { const m = {}; for (const k of ACTS) { const c = cnt(e.a[w] && e.a[w][k]); if (Object.keys(c).length) m[k] = c; } a[w] = m; }
      out.days.push({ d, w: e.w ? 1 : 0, a, pr: cnt(e.pr), wd: int(e.wd, 0, 1e9), in: int(e.in, 0, 1e9), out: int(e.out, 0, 1e9),
        buy: (Array.isArray(e.buy) ? e.buy : []).filter(x => typeof x === 'string' && ID.test(x)).slice(0, MAX_BUY),
        ev: (Array.isArray(e.ev) ? e.ev : []).filter(x => typeof x === 'string' && x).map(x => x.slice(0, 24)).slice(0, MAX_EV) });
    }
    out.days.sort((x, y) => x.d - y.d); return out;
  }
  const UNIT = { egg: '个', milk: '瓶', wool: '份', truffle: '颗', honey: '罐' };
  // v5.11.0.29 自动化机械: the day one is fitted
  const MACH_LINE = { feeder: '棚子装上了自动饲喂槽和自来水槽，以后不用人去添草加水了。', chute: '鸡舍装上了集蛋滑道，鸡蛋自己滚进仓库。', milker: '牛棚装上了挤奶机，牛奶直接灌进奶酪坊和仓库。', tray: '蜂箱接上了蜂蜜收集槽，蜂蜜自己流进仓库。' };
  const total = o => Object.values(o || {}).reduce((s, n) => s + n, 0);
  const isEmpty = e => !e || (!Object.keys(e.a).some(w => ACTS.some(k => total(e.a[w][k]))) && !total(e.pr) && !e.wd && !e.in && !e.out && !e.buy.length && !e.ev.length);
  // L: { who(id) -> name, item(id) -> name, buy(id) -> name, weather(entry) -> '晴' }
  function list(o, L, unit, max) {
    const ks = Object.keys(o || {}).filter(k => o[k] > 0).sort((a, b) => o[b] - o[a]); if (!ks.length) return '';
    const parts = ks.slice(0, max || 3).map(k => `${o[k]}${typeof unit === 'function' ? unit(k) : unit}${L.item(k)}`);
    return parts.join('、') + (ks.length > (max || 3) ? '等' : '');
  }
  // the day as a few warm short sentences; `today` marks a day that is not over yet
  function lines(e, L, today) {
    const out = [], who = Object.keys(e.a);
    const order = w => (w === 'farmer' ? 0 : w === 'partner' ? 1 : /^kid/.test(w) ? 2 : 3);
    who.sort((x, y) => order(x) - order(y));
    for (const w of who) { const m = e.a[w], bits = [];
      const p = list(m.p, L, '棵'), h = list(m.h, L, '个'), f = list(m.f, L, '条');
      if (p) bits.push('种了' + p); if (h) bits.push('收了' + h); if (f) bits.push('钓到' + f);
      if (bits.length) out.push(L.who(w) + bits.join('，') + '。'); }
    const pr = list(e.pr, L, k => UNIT[k] || '份', 4); if (pr) out.push('家里收了' + pr + '。');
    if (e.wd) out.push(`砍了 ${e.wd} 份木材。`);
    for (const c of e.ev) { const [k, v] = c.split(':');
      if (k === 'fest') out.push('镇上过丰收节，一家人去吃了长桌宴。');
      else if (k === 'sports') out.push('学校开运动会，孩子们在跑道上比赛。');
      else if (k === 'born') out.push(`家里添了一个宝宝${v ? '：' + v : ''}！`);
      else if (k === 'moved') out.push('阿禾搬进来了，从今天起一起过日子。');
      else if (k === 'rare') out.push(`钓到了难得的${L.item(v)}！`);
      else if (k === 'giant') out.push(`田里长出了一个巨大的${L.item(v)}。`);
      else if (k === 'guests') out.push(`民宿来了 ${v} 组客人。`);
      else if (k === 'pond') out.push(`池塘里多了一条${L.item(v)}。`)
      else if (k === 'mach' && MACH_LINE[v]) out.push(MACH_LINE[v]); }
    const money = [];
    if (e.in) money.push(`赚了 ${e.in} 金`); if (e.out) money.push(`花了 ${e.out} 金`);
    const buys = e.buy.map(L.buy).filter(Boolean); if (buys.length) money.push('添置了' + buys.slice(0, 4).join('、') + (buys.length > 4 ? '等' : ''));
    if (money.length) out.push((today ? '今天' : '这天') + money.join('，') + '。');
    if (!out.length) out.push(today ? '一天才刚开始，大家正准备干活。' : '大家歇了一天，什么也没记下。');
    return out;
  }
  function title(e, L, today) { return `第${e.d}天 ${e.w ? '小雨' : (L.weather ? L.weather(e) : '晴')}${today ? '（今天）' : ''}`; }
  // one line for the morning bubble: yesterday in brief (nothing for an empty day)
  function brief(e, L) {
    if (isEmpty(e)) return '';
    const h = {}, f = {}; let p = 0;
    for (const w of Object.keys(e.a)) { const m = e.a[w]; p += total(m.p); for (const k in m.h) h[k] = (h[k] || 0) + m.h[k]; for (const k in m.f) f[k] = (f[k] || 0) + m.f[k]; }
    const bits = []; if (p) bits.push(`种了 ${p} 棵`); if (total(h)) bits.push(`收了 ${total(h)} 个`); if (total(f)) bits.push(`钓到 ${total(f)} 条鱼`); if (e.in) bits.push(`赚了 ${e.in} 金`);
    return bits.length ? `昨天（第${e.d}天）${bits.join('，')}。日记里写着呢` : '';
  }
  const api = { DAYS, empty, blank, entry, add, bought, note, valid, lines, title, brief, isEmpty, total };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFDiary = api;
})(typeof window !== 'undefined' ? window : globalThis);
