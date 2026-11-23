// v5.10.10 诊所 + 老房翻盖: 诊所（30,000 金，繁荣度 4），原有 5 座民居翻成二层（每座 12,000 金 + 150 木材，可分批、一次一座）。
// 动物和猫狗心情有更高的下限；每月一次体检，开心值 +。不做生病。全部翻完并盖好诊所后繁荣度 4→5，路面铺石板。
// Rules only (art in town-art.js, the board in hall.js, the walk in game.js). Offline days never count as checkup days.
(function (root) {
  'use strict';
  const P = (x, y) => ({ x, y });
  const COST = 30000, WOOD = 0, LV = 4;
  const REBUILD_COST = 12000, REBUILD_WOOD = 150;
  const HOURS = { from: 8 * 60, to: 17 * 60 };
  const FLOOR = 40, CHECK = 10, CHECK_EVERY = 30;
  // lot L9: east of L8 (560, 87) and south of the main street, clear of stall s5 and 小桃家
  const LOT = { id: 'clinic', x: 870, y: 110, hw: 11, hd: 9, door: P(870, 98), rot: Math.PI, style: 8 }; // v5.11.0: south of the main street
  const STAND = P(LOT.door.x + 6, LOT.door.y - 2);
  // the original five one-storey houses (town.js), rebuilt one at a time into the three two-storey styles
  const HOUSES = [
    { id: 'h1', name: '翻盖林老师家', desc: '把林老师家的一层小楼翻成木构二层，带阳台和晾衣绳。先搭脚手架，第二天变新房', style: 0, who: '林老师' },
    { id: 'h2', name: '翻盖周婶家', desc: '把周婶家翻成砖石二层，带阁楼窗和烟囱。先搭脚手架，第二天变新房', style: 1, who: '周婶' },
    { id: 'h3', name: '翻盖阿松家', desc: '把阿松家翻成下店上住的二层，一楼橱窗，二楼住人。先搭脚手架，第二天变新房', style: 2, who: '阿松' },
    { id: 'h4', name: '翻盖小桃家', desc: '把小桃家翻成木构二层，带阳台和晾衣绳。先搭脚手架，第二天变新房', style: 0, who: '小桃' },
    { id: 'h5', name: '翻盖镇长家', desc: '把镇长家翻成砖石二层，带阁楼窗和烟囱。先搭脚手架，第二天变新房', style: 1, who: '镇长老顾' },
  ];
  const HOUSE = Object.fromEntries(HOUSES.map(h => [h.id, h]));
  const REBUILDS = HOUSES.map(h => ({ id: h.id, name: h.name, desc: h.desc, cost: REBUILD_COST, wood: REBUILD_WOOD, lv: LV, kind: 'rebuild' }));
  const built = H => !!(H && H.built && H.built.clinic);
  const rebuilt = (H, id) => !!(H && H.built && H.built[id]);
  const allRebuilt = H => HOUSES.every(h => rebuilt(H, h.id));
  const paved = H => built(H) && allRebuilt(H); // 繁荣度 5: the streets are laid in stone
  const open = (H, T) => built(H) && T >= HOURS.from && T < HOURS.to;
  const floor = H => (built(H) ? FLOOR : 0);
  const isCheck = (H, day) => built(H) && (day | 0) > (H.built.clinic | 0) && (day | 0) % CHECK_EVERY === 0;
  const nextCheck = (H, day) => { if (!built(H)) return null; let d = Math.max((day | 0) + 1, (H.built.clinic | 0) + 1); while (d % CHECK_EVERY) d++; return d; };
  function checkup(st, animals, day, extra) {
    if (!isCheck(st, day) || ((st.clinic && st.clinic.last) | 0) === (day | 0)) return 0;
    if (!st.clinic) st.clinic = empty();
    st.clinic.last = day | 0;
    const add = CHECK + (extra | 0);
    let n = 0;
    for (const a of animals || []) { a.h = Math.min(100, (a.h | 0) + add); n++; }
    return n;
  }
  const empty = () => ({ last: 0 });
  const int = (v, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0);
  function valid(v) {
    const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty();
    out.last = int(o.last, 0, 1e6); return out;
  }
  const api = { COST, WOOD, LV, REBUILD_COST, REBUILD_WOOD, HOURS, FLOOR, CHECK, CHECK_EVERY, LOT, STAND, HOUSES, HOUSE, REBUILDS,
    built, rebuilt, allRebuilt, paved, open, floor, isCheck, nextCheck, checkup, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFClinic = api;
})(typeof window !== 'undefined' ? window : globalThis);
