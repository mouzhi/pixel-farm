// 像素农场 · v5.10.3：院子小花销、阿禾的小摊、动物照护（纯数据和纯函数；浏览器里是 window.PFYard，Node 里可以 require 做单元测试）
// Early places for coins to go (docs/economy-rebalance.md 6.2): small, mostly good-looking things with a small effect each.
// They are shop items (sim.js tab 「院子」); each one bought is set up by the family on its own fixed spot (game.js posts the
// job, yard-art.js draws it). Nothing here is bought by 「家人帮忙添置」. Saved as `homeyard: { put: { id: n } }` (append-only).
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  // ---------- the catalogue (doc prices). kind: yard | stall | care. needs: another shop item first ----------
  const ITEMS = [
    { id: 'gravel', kind: 'yard', name: '石子小路', cost: 40, max: 20, desc: '家人从门口往田、谷仓和水井方向一段段铺石子；走在铺好的路上快 5%' },
    { id: 'mailbox', kind: 'yard', name: '信箱', cost: 120, max: 1, desc: '把门口的旧信箱换成新的：早上偶尔有一封信（阿禾的小纸条、镇上的消息）' },
    { id: 'clothesline', kind: 'yard', name: '晾衣绳', cost: 150, max: 1, desc: '屋后拉一根晾衣绳：晴天家人晾衣服，下雨就收' },
    { id: 'flowerbed', kind: 'yard', name: '门前花坛', cost: 200, max: 4, desc: '门口的花坛；有蜂箱以后蜜蜂会来，每个花坛让蜂箱多一罐蜜的机会 +2%' },
    { id: 'vegfence', kind: 'yard', name: '菜园小栅栏', cost: 30, wood: 1, max: 20, needs: 'axe', desc: '沿着家门口的田一段段围矮栅栏；围满以后田里夜里长杂物的机会减半' },
    { id: 'curtains', kind: 'yard', name: '窗花和窗帘', cost: 180, max: 1, desc: '窗上贴窗花、挂窗帘；晚上窗户透出暖光' },
    { id: 'lantern', kind: 'yard', name: '门口灯笼', cost: 260, max: 1, desc: '门口挂一盏油灯，不用接水车的电，天黑就亮一小圈' },
    { id: 'roof', kind: 'yard', name: '屋顶换色', cost: 300, costs: [300, 100, 100], max: 3, desc: '给房顶换个颜色（绿、蓝、青灰，买一次换一种；第一次 300，以后每次 100）' },
    { id: 'flag', kind: 'yard', name: '石板路', cost: 150, wood: 2, max: 20, needs: 'house', desc: '把小路一段段换成石板；走在石板路上快 10%' },
    { id: 'awning', kind: 'stall', name: '小摊遮阳棚', cost: 300, max: 1, desc: '阿禾的小摊加一块遮阳棚：小摊收购价 +2%，阿禾好感 +5（一次）' },
    { id: 'scale', kind: 'stall', name: '新秤', cost: 200, max: 1, desc: '小摊上换一杆新秤：小摊收购价 +2%' },
    { id: 'sign', kind: 'stall', name: '木招牌', cost: 400, wood: 10, max: 1, desc: '小摊边立一块木招牌：小摊收购价 +2%，路过的客人偶尔在摊前停一下' },
    { id: 'vase', kind: 'stall', name: '摊上花瓶', cost: 120, max: 1, desc: '摊子上多一束花：阿禾好感 +3（一次）' },
    { id: 'straw', kind: 'care', name: '鸡舍稻草垫', cost: 200, max: 1, needs: 'coop', desc: '鸡舍里铺稻草：鸡每晚心情 +3' },
    { id: 'catbed', kind: 'care', name: '猫窝', cost: 150, max: 3, needs: 'cat', desc: '屋檐下的猫窝，一只猫一个：猫晚上回窝里睡' },
    { id: 'doghouse', kind: 'care', name: '狗屋', cost: 250, max: 3, needs: 'dog', desc: '院子里的小狗屋，一只狗一个：狗晚上回狗屋，白天爱在门口趴着' },
    { id: 'brush', kind: 'care', name: '刷子', cost: 300, max: 1, needs: 'coop', desc: '家人每天给一只动物梳梳毛：它心情 +2' },
    { id: 'saltlick', kind: 'care', name: '盐砖', cost: 400, max: 3, needs: 'sty', desc: '猪圈、羊圈、牛棚各放一块（棚子盖好才摆得下）：那一棚每晚心情 +2' },
  ];
  const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
  const IDS = ITEMS.map(i => i.id);
  const costAt = (it, i) => (it.costs ? it.costs[Math.min(i, it.costs.length - 1)] : it.cost);
  // ---------- where things go (world units, the home yard) ----------
  // 20 pieces of path from the door outward: the door path, the yard road to the field, along the field, to the barn, to the well
  const PIECES = [[36, 40, 36, 48], [36, 48, 36, 54], [36, 54, 44, 54], [44, 54, 52, 54], [52, 54, 60, 54], [60, 54, 68, 54],
    [68, 54, 76, 54], [76, 54, 84, 54], [84, 54, 92, 54], [92, 54, 100, 54], [100, 54, 108, 54], [108, 54, 116, 54], [116, 54, 124, 54],
    [124, 54, 132, 54], [132, 54, 140, 54], [140, 54, 148, 54], [148, 54, 158, 54], [158, 54, 158, 47], [158, 47, 158, 41], [100, 54, 100, 38]];
  // the field's fence: 20 edges of the 6 x 4 home field (tiles 72..120 x 56..88): north, east, south, west
  const FENCE = [];
  for (let i = 0; i < 6; i++) FENCE.push({ x: 76 + i * 8, y: 55.2, rot: 0 });
  for (let i = 0; i < 4; i++) FENCE.push({ x: 120.8, y: 60 + i * 8, rot: Math.PI / 2 });
  for (let i = 0; i < 6; i++) FENCE.push({ x: 116 - i * 8, y: 88.8, rot: 0 });
  for (let i = 0; i < 4; i++) FENCE.push({ x: 71.2, y: 84 - i * 8, rot: Math.PI / 2 });
  const SPOTS = {
    mailbox: [P(16, 45)], clothesline: [P(40, 3)], lantern: [P(30.5, 40.5)], curtains: [P(36, 30)], roof: [P(36, 24)],
    flowerbed: [P(8, 42), P(24.5, 42), P(86, 38), P(94.5, 38)],
    awning: [P(160, 108.5)], scale: [P(144, 102)], sign: [P(150, 111)], vase: [P(163, 103)],
    straw: [P(27, 70)], catbed: [P(64, 37.5), P(69, 37.5), P(74, 37.5)], doghouse: [P(145, 71), P(167, 71), P(145, 82)],
    brush: [P(148, 44)], saltlick: [],
  };
  const LICK_PENS = ['sty', 'fold', 'shed'];
  // where piece n of a kind goes; pens: { sty: trough, ... } for the salt licks (only built pens)
  function spotOf(id, n, pens) {
    if (id === 'gravel' || id === 'flag') { const p = PIECES[n]; return p ? P((p[0] + p[2]) / 2, (p[1] + p[3]) / 2) : null; }
    if (id === 'vegfence') return FENCE[n] ? P(FENCE[n].x, FENCE[n].y) : null;
    if (id === 'saltlick') { const k = LICK_PENS.filter(q => pens && pens[q])[n]; return k ? P(pens[k].x + 7, pens[k].y + 1) : null; }
    const s = SPOTS[id]; return s && s[n] ? s[n] : null;
  }
  // how many of a kind can be set up now (a cat bed per cat, a dog house per dog, a salt lick per built pen)
  function room(id, ctx) {
    const it = ITEM[id]; if (!it) return 0;
    if (id === 'catbed') return Math.min(it.max, ctx.cats | 0);
    if (id === 'doghouse') return Math.min(it.max, ctx.dogs | 0);
    if (id === 'saltlick') return LICK_PENS.filter(k => ctx.pens && ctx.pens[k]).length;
    return it.max;
  }
  // ---------- effects (pure; put = how many of each are set up) ----------
  const n = (put, id) => Math.max(0, Math.min(ITEM[id].max, (put && put[id]) | 0));
  const stallMult = put => 1 + 0.02 * (n(put, 'awning') + n(put, 'scale') + n(put, 'sign'));
  // path piece under (x, y): 'flag' | 'gravel' | null (on a piece: within `w` of its line)
  function segD(px, py, s) { const dx = s[2] - s[0], dy = s[3] - s[1], l = dx * dx + dy * dy || 1; let t = ((px - s[0]) * dx + (py - s[1]) * dy) / l; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - s[0] - t * dx, py - s[1] - t * dy); }
  function paveAt(put, x, y, w) {
    const g = n(put, 'gravel'), f = n(put, 'flag'), m = Math.max(g, f); if (!m || x < 26 || x > 168 || y < 32 || y > 64) return null;
    for (let i = 0; i < m; i++) if (segD(x, y, PIECES[i]) < (w || 4.6)) return i < f ? 'flag' : 'gravel';
    return null;
  }
  const walkMult = pave => (pave === 'flag' ? 1.1 : pave === 'gravel' ? 1.05 : 1);
  // the field's clutter at night: fully fenced halves it, a part-built fence by its share
  const clutterMult = put => 1 - 0.5 * n(put, 'vegfence') / FENCE.length;
  // the pens' night: straw +3 for the coop; a salt lick +2 for each pen that has one (built pens in order sty, fold, shed)
  function penBonus(put, pens) {
    const out = {}; if (n(put, 'straw')) out.coop = 3;
    LICK_PENS.filter(k => pens && pens[k]).slice(0, n(put, 'saltlick')).forEach(k => { out[k] = 2; }); return out;
  }
  const honeyExtra = put => 0.02 * n(put, 'flowerbed');
  const ROOFS = [null, { name: '绿', base: '#5f8f4e', line: '#3f6a3a' }, { name: '蓝', base: '#4f7fa8', line: '#35597d' }, { name: '青灰', base: '#6f7a86', line: '#4c5560' }];
  const roofOf = up => ROOFS[Math.max(0, Math.min(3, (up && up.roof) | 0))];
  // the mailbox: on a morning now and then a letter (r: random 0..1; who: { moved, town })
  const LETTERS = {
    he: ['阿禾的小纸条：「今天的南瓜特别好，给你留了一个。」', '阿禾的小纸条：「小摊上的花开了，路过记得看看。」', '阿禾的小纸条：「天凉了，晚上早点歇。」'],
    town: ['镇上的消息：「周婶说，小店新进了一批针线。」', '镇上的消息：「林老师在找会做木工的家长帮学校修凳子。」', '镇上的消息：「东大道那边又开了一家小铺子。」'],
    home: ['家里的信：「爷爷奶奶问你们好，问院子里的花开没开。」', '一张明信片：「海边的风很大，鱼很好钓。」', '远方的朋友：「下回去你们农场看看。」'],
  };
  function letter(r, day, who) {
    if (r >= 0.3) return null;
    const pool = [].concat(who && !who.moved ? LETTERS.he : [], who && who.town ? LETTERS.town : [], LETTERS.home);
    return pool[(day * 7 + Math.floor(r * 1000)) % pool.length];
  }
  // ---------- state (append-only; old saves have nothing set up) ----------
  const empty = () => ({ put: {} });
  function valid(v) { const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}, out = empty(), put = o.put && typeof o.put === 'object' ? o.put : {};
    for (const it of ITEMS) { const k = put[it.id]; if (typeof k === 'number' && isFinite(k) && k > 0) out.put[it.id] = Math.min(it.max, Math.floor(k)); }
    if (typeof o.bday === 'number' && o.bday > 0 && isFinite(o.bday)) out.bday = Math.floor(o.bday); // the day the brush was last used
    return out; }
  const api = { ITEMS, ITEM, IDS, costAt, PIECES, FENCE, SPOTS, LICK_PENS, spotOf, room, stallMult, paveAt, walkMult, clutterMult, penBonus, honeyExtra, ROOFS, roofOf, LETTERS, letter, empty, valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFYard = api;
})(typeof window !== 'undefined' ? window : globalThis);
