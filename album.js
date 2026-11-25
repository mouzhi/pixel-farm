// 像素农场 · 相册（纯数据和纯函数；浏览器里是 window.PFAlbum，Node 里可以 require 做单元测试）
// v5.11.0.11: a player asked for 「相册：给关键画面留下影像……挂着挂着就错过了」. The first time a story moment happens (A-He moves in,
// a baby, the first school day, a classmate comes home, the first festival...) the game takes a small polaroid of the scene.
// Only a few bytes per photo go in the save (append-only `album`, save stays v15): one short string per moment,
//   "id|day|minute|x|y|who.who"   (minute -1: a re-staged photo, i.e. backfilled from an old save, no exact scene)
// The pictures themselves (160×110 PNG data URLs) live in their own localStorage key per farm, never in the (cloud) save.
// A missing picture (another device, cleared storage, old save) is re-staged from the metadata: the place, posed.
'use strict';
(function (root) {
  const PW = 160, PH = 110, MAX = 40, KEY = 'mouzhi/pixel-farm:album:';
  // id, title, the line under the photo, the hint on a locked frame, who is in it (for re-staging), where (game.js places it)
  const MOMENTS = [
    { id: 'open', t: '农场开张', line: '第一天，一块小小的田，一切从这里开始。', hint: '新的一天开始了', who: ['farmer'], at: 'field' },
    { id: 'animal', t: '第一只小动物', line: '棚子里有了动静，新成员住了进来。', hint: '买下第一只鸡、猪、羊或牛', who: ['farmer'], at: 'barn' },
    { id: 'fish', t: '钓到第一条鱼', line: '浮漂一沉，第一条鱼上钩了。', hint: '在池塘边或码头钓一次鱼', who: ['farmer'], at: 'pond' },
    { id: 'met', t: '认识了阿禾', line: '集市的小摊前，和店主阿禾聊了几句。', hint: '去集市逛逛', who: ['farmer'], at: 'stall' },
    { id: 'moved', t: '阿禾搬来一起住', line: '从今天起，两个人一起经营这座农场。', hint: '和阿禾越来越熟，房子也要够大', who: ['farmer', 'partner'], at: 'door' },
    { id: 'manor', t: '庄园落成', line: '房子升到了最高一档，院子也热闹起来。', hint: '把房子升到最高一档', who: ['farmer', 'partner'], at: 'house' },
    { id: 'born0', t: '第一个宝宝', line: '家里添了一个宝宝：{kid0}！', hint: '家里会添一个宝宝', who: ['farmer', 'partner'], at: 'door' },
    { id: 'born1', t: '第二个宝宝', line: '{kid1}也来到了这个家。', hint: '家里还会再添一个宝宝', who: ['farmer', 'partner', 'kid0'], at: 'porch' },
    { id: 'kidwork', t: '第一次帮家里干活', line: '{kid0}第一次出门干轻活，有模有样。', hint: '等孩子长大一点', who: ['kid0'], at: 'barn' },
    { id: 'school', t: '第一天上学', line: '背上小书包，第一次去学校。', hint: '孩子到了上学的年纪', who: ['kid0'], at: 'school' },
    { id: 'classmate', t: '第一次带同学回家', line: '放学路上多了一个小伙伴，一起回家玩。', hint: '孩子上学一阵子以后', who: ['kid0'], at: 'door' },
    { id: 'bug', t: '第一次捉到昆虫', line: '捕虫网一挥，看了一眼又放走了。', hint: '给孩子买一张捕虫网', who: ['kid0'], at: 'meadow' },
    { id: 'park', t: '第一次去乐园', line: '滑梯、沙坑、秋千，玩得满头大汗。', hint: '家门口摆上滑梯、沙坑或秋千', who: ['kid0'], at: 'park' },
    { id: 'rain', t: '第一场小雨', line: '细雨落在田里，地上留下一小块一小块湿印。', hint: '等一场雨', who: ['farmer'], at: 'field' },
    { id: 'giant', t: '第一个巨大作物', line: '田里长出了一个大得吓人的家伙。', hint: '种南瓜、卷心菜或西瓜，等一个惊喜', who: ['farmer'], at: 'field' },
    { id: 'rarefish', t: '钓到锦鲤或旗鱼', line: '难得一见的大家伙，被我们钓到了。', hint: '升级鱼竿，多钓几次', who: ['farmer'], at: 'pond' },
    { id: 'party', t: '第一次家庭聚会', line: '串灯亮起来，一家人在院子里聚在一起。', hint: '在院子里摆一张派对桌', who: ['farmer', 'partner', 'kid0', 'kid1'], at: 'party' },
    { id: 'towngate', t: '小镇大门打开了', line: '镇门推开，去镇上的路通了。', hint: '修好大道，开镇门', who: ['farmer'], at: 'gate' },
    { id: 'market', t: '第一次赶集', line: '广场上摆满了摊子，热热闹闹。', hint: '在镇公所建起集市广场', who: ['farmer'], at: 'plaza' },
    { id: 'sports', t: '第一次运动会', line: '操场上在赛跑，一家人在旁边加油。', hint: '在镇上建起学校操场', who: ['kid0', 'farmer'], at: 'track' },
    { id: 'fest', t: '第一次丰收节', line: '长桌宴摆好了，一家人围坐在广场上。', hint: '小镇繁荣起来，就会办丰收节', who: ['farmer', 'partner', 'kid0', 'kid1'], at: 'feast' },
    { id: 'inn', t: '民宿迎来第一组客人', line: '远道而来的客人住进了小木屋。', hint: '在农家乐区盖一间小木屋', who: ['farmer'], at: 'inn' },
    { id: 'wedding', t: '孩子的婚礼', line: '{kid}和{mate}走到了一起，今晚办婚礼。', hint: '孩子长大以后', who: ['farmer', 'partner'], at: 'wedding' },
    { id: 'newhouse', t: '搬进新房', line: '新房子的灯第一次亮了，小两口住了进去。', hint: '孩子成家以后', who: [], at: 'newhouse' },
    { id: 'xpphoto', t: '留影角的第一张合影', line: '游客站在稻草人和花架前比了个手势，咔嚓。', hint: '在农家乐搭一个留影角', who: [], at: 'photo' }, // v5.12.4
    { id: 'g3born', t: '第一个孙辈', line: '新房子里添了个小娃娃，农场有了第三代。', hint: '成家的孩子也会有孩子', who: [], at: 'newhouse' }, // v5.12.5
    { id: 'g3wed', t: '孙辈的婚礼', line: '第三代也在新房子门前成了家。', hint: '孙辈长大以后', who: [], at: 'newhouse' }, // v5.12.5
  ];
  const BY = Object.fromEntries(MOMENTS.map((m, i) => [m.id, Object.assign({ i }, m)]));
  const ID = /^[a-z][a-z0-9]{0,11}$/, WHO = /^[a-z][a-z0-9]{0,9}$/;
  const int = (v, lo, hi) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo; };
  const empty = () => ({ list: [] });
  const has = (A, id) => !!(A && A.list && A.list.some(e => e.id === id));
  const get = (A, id) => (A && A.list && A.list.find(e => e.id === id)) || null;
  // e: { id, d (day; 0 = long ago), t (minute of the day, -1 = re-staged), x, y (world spot the camera was on), w: [who ids] }
  function norm(e) {
    if (!e || !BY[e.id]) return null;
    const t = e.t == null || e.t < 0 ? -1 : int(e.t, 0, 1439);
    const w = (Array.isArray(e.w) ? e.w : []).filter(x => typeof x === 'string' && WHO.test(x)).slice(0, 4);
    const out = { id: e.id, d: int(e.d, 0, 1e6), t, x: int(e.x, -9999, 9999), y: int(e.y, -9999, 9999), w };
    // q: a photo still waiting to be taken (people walking out of the door): { at: absolute game minute, f: who to centre on, re: re-place }
    if (e.q && typeof e.q === 'object') out.q = { at: int(e.q.at, 0, 1e9), f: typeof e.q.f === 'string' && WHO.test(e.q.f) ? e.q.f : '', re: e.q.re ? 1 : 0 };
    return out;
  }
  const remove = (A, id) => { if (!A || !Array.isArray(A.list)) return false; const i = A.list.findIndex(e => e.id === id); if (i < 0) return false; A.list.splice(i, 1); return true; };
  function add(A, e) { if (!A || !Array.isArray(A.list)) return null; const n = norm(e); if (!n || has(A, n.id) || A.list.length >= MAX) return null; A.list.push(n); return n; }
  // the save form: one short string per moment
  const pack1 = e => [e.id, e.d, e.t, e.x, e.y, e.w.join('.')].concat(e.q ? [[e.q.at, e.q.f, e.q.re].join('.')] : []).join('|'); // 7th field only while a photo is pending
  function unpack1(s) {
    if (typeof s !== 'string' || s.length > 96) return null; const p = s.split('|'); if (p.length < 5 || !ID.test(p[0])) return null;
    const q = p[6] ? p[6].split('.') : null;
    return norm({ id: p[0], d: p[1], t: +p[2], x: p[3], y: p[4], w: p[5] ? p[5].split('.') : [], q: q && q.length === 3 ? { at: q[0], f: q[1], re: q[2] === '1' } : null });
  }
  const pack = A => (A && Array.isArray(A.list) ? A.list.map(norm).filter(Boolean).map(pack1) : []);
  function valid(raw) { // a save's `album` (array of strings) -> { list }; anything odd is dropped
    const out = empty(); if (!Array.isArray(raw)) return out;
    for (const s of raw.slice(0, MAX)) { const e = unpack1(s); if (e && !has(out, e.id)) out.list.push(e); }
    return out;
  }
  // facts (game.js builds them; old saves too): which moments already happened and on which day (0 = unknown)
  // Only what the save proves happened (a record of the event itself, never a building or an unlock that merely makes it possible):
  // f: { ms: {id: day}, ach: {id: day}, kids: [{born}], mate (last classmate visit day), town (the gate is open: that is the moment),
  //      marketDays / marketLast (days the family sold at the market, last such day), sports / fest (last day it was held),
  //      inn (rooms ever paid for), wed (first wedding day), movedIn (first move-in day), giant (first day a giant grew) }
  function due(f) {
    f = f || {}; const out = [], ms = f.ms || {}, ach = f.ach || {}, kids = f.kids || [];
    const want = (id, ok, d) => { if (ok) out.push({ id, d: int(d, 0, 1e6) }); };
    const day = (o, k) => (k in o ? o[k] : null);
    want('open', day(ms, 'open') != null, day(ms, 'open') || 1);
    want('animal', day(ms, 'animal') != null, day(ms, 'animal'));
    want('fish', day(ms, 'fish') != null, day(ms, 'fish'));
    want('met', day(ms, 'met') != null || f.met > 0, f.met || day(ms, 'met'));
    want('moved', day(ms, 'moved') != null || f.moved > 0, f.moved || day(ms, 'moved'));
    want('manor', day(ms, 'manor') != null, day(ms, 'manor'));
    want('born0', !!kids[0], kids[0] && kids[0].born);
    want('born1', !!kids[1], kids[1] && kids[1].born);
    want('kidwork', day(ach, 'kidwork') != null, day(ach, 'kidwork'));
    want('school', day(ach, 'school') != null, day(ach, 'school'));
    want('classmate', f.mate > 0, 0); // only the last visit is kept: the first one's day is unknown
    want('bug', day(ach, 'firstbug') != null, day(ach, 'firstbug'));
    want('park', day(ach, 'firstpark') != null, day(ach, 'firstpark'));
    want('rain', day(ach, 'firstrain') != null, day(ach, 'firstrain'));
    want('giant', f.giant != null, f.giant);
    want('rarefish', day(ach, 'truecatch') != null, day(ach, 'truecatch'));
    want('party', day(ach, 'party') != null, day(ach, 'party'));
    want('towngate', !!f.town, f.gateDay || 0);
    want('market', f.marketDays > 0, f.marketDays === 1 ? f.marketLast : 0); // sold there at least once (a built square alone is not a market trip)
    want('sports', f.sports > 0, f.sports);
    want('fest', f.fest > 0, f.fest);
    want('inn', !!f.inn, 0);
    want('wedding', f.wed > 0, f.wed);
    want('newhouse', f.movedIn > 0, f.movedIn);
    return out;
  }
  // names in the lines: L = { kid0, kid1, kid, mate }
  const fill = (s, L) => String(s).replace(/\{(\w+)\}/g, (_, k) => (L && L[k]) || (k === 'mate' ? '心上人' : k === 'kid' ? '孩子' : '孩子'));
  const dayText = e => (e.d > 0 ? `第${e.d}天` : '很早以前');
  const clock = t => (t >= 0 ? `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` : '');
  function caption(e, L) { const m = BY[e.id]; if (!m) return null;
    return { title: m.t, line: fill(m.line, L), when: dayText(e) + (e.t >= 0 ? ' ' + clock(e.t) : ''), restaged: e.t < 0 }; }
  // the album in moment order: taken ones first by day, then the locked frames (their hints are small goals)
  function view(A, L) {
    const got = (A && A.list ? A.list : []).slice().sort((a, b) => (a.d || 1e7) - (b.d || 1e7) || BY[a.id].i - BY[b.id].i);
    const shots = got.map(e => Object.assign({ id: e.id, e }, caption(e, L)));
    const locked = MOMENTS.filter(m => !has(A, m.id)).map(m => ({ id: m.id, title: '???', hint: m.hint, locked: true }));
    return { shots, locked, total: MOMENTS.length, have: shots.length };
  }
  const bytes = A => JSON.stringify(pack(A)).length;
  // ---- the pictures: their own localStorage key per farm (never the cloud save). { id: [dataURL, restaged 0/1] } ----
  const memo = {};
  function loadThumbs(store, farm) { const k = KEY + (farm || 0); if (memo[k]) return memo[k];
    let o = {}; try { const s = store && store.getItem(k); if (s) o = JSON.parse(s) || {}; } catch (e) { o = {}; }
    for (const id of Object.keys(o)) if (!BY[id] || !Array.isArray(o[id]) || typeof o[id][0] !== 'string' || o[id][0].indexOf('data:image/') !== 0) delete o[id];
    return (memo[k] = o); }
  function putThumb(store, farm, id, url, restaged) { const o = loadThumbs(store, farm); if (!BY[id] || typeof url !== 'string') return false; o[id] = [url, restaged ? 1 : 0];
    try { if (store) store.setItem(KEY + (farm || 0), JSON.stringify(o)); return true; } catch (e) { return false; } } // full storage: kept for this session only
  const thumb = (store, farm, id) => { const v = loadThumbs(store, farm)[id]; return v ? { url: v[0], restaged: !!v[1] } : null; };
  const forget = farm => { delete memo[KEY + (farm || 0)]; };
  const api = { PW, PH, MAX, KEY, MOMENTS, BY, empty, has, get, add, remove, norm, pack, valid, due, caption, view, bytes, fill, dayText, loadThumbs, putThumb, thumb, forget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFAlbum = api;
})(typeof window !== 'undefined' ? window : globalThis);
