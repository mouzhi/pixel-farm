// 像素农场 · 图鉴、成就和里程碑（v5.4.0 第 6 阶段）：纯函数，浏览器里是 window.PFCodex，Node 里可以直接 require 做单元测试。
// The collection records fish, rare eggs and truffles, glowing and giant crops, and later decorations. Achievements are
// named badges (no follow / share / tip reward). Milestones are a quiet timeline of the farm growing up. Unseen entries
// stay as a silhouette. Seeding from an old save fills only what the catch log and the current basket can prove.
'use strict';
(function (root) {
  const SIM = (typeof require === 'function' && typeof document === 'undefined') ? require('./sim.js') : root.PFSim;
  const AN = (typeof require === 'function' && typeof document === 'undefined') ? require('./animals.js') : root.PFAnimals;
  const FS = (typeof require === 'function' && typeof document === 'undefined') ? require('./fish.js') : root.PFFish;
  const INS = (typeof require === 'function' && typeof document === 'undefined') ? require('./insects.js') : root.PFInsects;

  const REGIONS7 = ['forest', 'east', 'orchard', 'south', 'pasture', 'coast']; // plus the home yard: seven buyable areas on the current map
  // later-phase achievements stay listed so the names are already in the panel; they cannot be earned until those features exist
  const ACHIEVEMENTS = [
    { id: 'gold1000', name: '这也太会过日子了', hint: '手里第一次攒到 1,000 金' },
    { id: 'rarefind', name: '我直接好家伙', hint: '第一次收获巨大作物，或拿到金蛋 / 白松露' },
    { id: 'pumpkin', name: '你这瓜保熟吗', hint: '收获第一个巨大南瓜' },
    { id: 'truecatch', name: '这波是真的', hint: '第一次钓到锦鲤或旗鱼' },
    { id: 'ornamental', name: '锦鲤附体', hint: '把一条观赏鱼放进家里的池塘' },
    { id: 'idleweek', name: '躺平即正义', hint: '连续 7 个游戏日没有打开商店，只是看着农场运转' },
    { id: 'allland', name: '遥遥领先', hint: '把现有 7 块区域全部买下' },
    { id: 'movedin', name: '安排上了', hint: '阿禾搬来的那天早上' },
    { id: 'kidwork', name: '村里来了个神童', hint: '小豆第一次出门干轻活' },
    { id: 'school', name: '小镇做题家', hint: '孩子第一次去上学' },
    { id: 'sprinkler', name: '懒人福音', hint: '家人第一次自动在田边摆好浇水器', later: 1 },
    { id: 'nightlight', name: '今晚月色真美', hint: '电网接通后，夜里第一次点亮一座夜灯', later: 1 },
    { id: 'dogjob', name: '旺旺队出动', hint: '狗第一次没有跟着农夫，自己去办成一件小事' },
    { id: 'herding', name: '专业对口', hint: '第一次看见边境牧羊犬把羊赶到草地上', later: 1 },
    { id: 'party', name: '我家大门常打开', hint: '第一次办成一场派对，家里或镇上来了客人', later: 1 },
    { id: 'newhouse', name: '新房入伙', hint: '孩子成家，搬进新盖的房子', later: 1 },
    { id: 'happypets', name: '精神状态良好', hint: '所有动物心情连续 5 天不低于 80' },
    { id: 'richday', name: '芜湖起飞', hint: '单日收入第一次超过 2,000 金' },
    { id: 'firstrain', name: '这场雨我允许了', hint: '第一次遇上小雨' },
    { id: 'firstbug', name: '先入图鉴为敬', hint: '孩子第一次用捕虫网捉到昆虫，看一眼再放走' },
    { id: 'firstpark', name: '童年 DNA 动了', hint: '孩子第一次在乐园玩滑梯、沙坑或秋千' },
  ];
  const MILESTONES = [
    { id: 'open', name: '农场开张', hint: '新的一天开始了' },
    { id: 'sale', name: '第一次卖出收获', hint: '篮子里的东西换成了金币' },
    { id: 'tool', name: '买了第一件工具', hint: '水壶、鞋子、锄头、篮子或斧头' },
    { id: 'field', name: '家门口的田变大了', hint: '买下第一次扩田' },
    { id: 'region', name: '买下第一块地', hint: '篱笆门外是新的区域' },
    { id: 'animal', name: '迎来第一只动物', hint: '鸡、猪、羊或牛住进棚子' },
    { id: 'axe', name: '有了斧头', hint: '可以砍树，也是木材自动化的起点' },
    { id: 'fish', name: '钓到第一条鱼', hint: '池塘边或码头上' },
    { id: 'pet', name: '和小动物做伴', hint: '家里来了猫或狗' },
    { id: 'met', name: '认识了阿禾', hint: '第一次去集市碰到店主' },
    { id: 'moved', name: '阿禾搬来一起住', hint: '从今天起一起经营农场' },
    { id: 'house', name: '房子升级了', hint: '小屋向外长出新的房间' },
    { id: 'born', name: '小豆出生了', hint: '家里添了一个宝宝' },
    { id: 'manor', name: '庄园落成', hint: '房子升到最高一档' },
    { id: 'allland', name: '七块地都是自己的', hint: '现有的区域全部买下' },
  ];
  const RARE_ITEMS = [
    { id: 'gold', type: 'egg', rare: 'gold', name: '金蛋' },
    { id: 'double', type: 'egg', rare: 'double', name: '双黄蛋' },
    { id: 'white', type: 'truffle', rare: 'white', name: '白松露' },
    { id: 'big', type: 'truffle', rare: 'big', name: '大松露' },
  ];
  const GLOW_CROPS = ['carrot', 'cabbage', 'pumpkin', 'strawberry', 'watermelon'];
  const GIANT_CROPS = ['cabbage', 'pumpkin', 'watermelon'];
  const ACH_BY = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
  const MS_BY = Object.fromEntries(MILESTONES.map(m => [m.id, m]));

  const keyFish = id => 'fish:' + id;
  const keyRare = id => 'rare:' + id;
  const keyGlow = id => 'glow:' + id;
  const keyGiant = id => 'giant:' + id;
  const keyDecor = id => 'decor:' + id;
  const keyBug = id => 'bug:' + id;

  function emptyCodex() { return { entries: {} }; }
  function emptyList() { return []; }
  function emptyStreaks() { return { noShop: 0, shopDay: 0, happy: 0, dogDay: 0 }; }

  function record(codex, key, day, n = 1) {
    if (!codex || !key) return null;
    const entries = codex.entries || (codex.entries = {});
    const cur = entries[key];
    if (!cur) { entries[key] = { firstDay: day | 0, count: Math.max(1, n | 0) }; return { first: true, entry: entries[key] }; }
    cur.count += Math.max(1, n | 0);
    const d = day | 0;
    if (d > 0 && (cur.firstDay === 0 || d < cur.firstDay)) cur.firstDay = d;
    return { first: false, entry: cur };
  }
  const has = (codex, key) => !!(codex && codex.entries && codex.entries[key]);
  const entryOf = (codex, key) => (codex && codex.entries && codex.entries[key]) || null;

  function itemKey(it) {
    const o = it && typeof it === 'object' ? it : { type: it };
    if (!o || !o.type) return null;
    if (FS && FS.isFish && FS.isFish(o.type)) return keyFish(o.type);
    if (o.rare) {
      const r = RARE_ITEMS.find(x => x.type === o.type && x.rare === o.rare);
      if (r) return keyRare(r.id);
    }
    if (o.glow && GLOW_CROPS.includes(o.type)) return keyGlow(o.type);
    if (o.giant && GIANT_CROPS.includes(o.type)) return keyGiant(o.type);
    return null;
  }

  // name colours in the book: common = green, uncommon = blue, very rare = orange
  const TIER_EPIC = new Set(['koi', 'tuna', 'sword', 'gold', 'white']);
  const TIER_RARE = new Set(['bass', 'seabass', 'snapper', 'goldfish', 'double', 'big']);
  function rarityOf(it) {
    if (!it) return 'common';
    if (it.group === 'bug' && it.rarity) return it.rarity;
    if (it.group === 'glow' || it.group === 'giant') return 'epic';
    if (TIER_EPIC.has(it.id)) return 'epic';
    if (TIER_RARE.has(it.id)) return 'rare';
    return 'common';
  }
  function withRarity(it) { it.rarity = rarityOf(it); return it; }

  function catalog() {
    const fish = (FS && FS.ALL ? FS.ALL : []).map(f => withRarity({ key: keyFish(f.id), id: f.id, name: f.name, col: f.col, rare: !!f.rare, group: 'fish', water: (FS.POND || []).some(p => p.id === f.id) ? 'pond' : 'sea' }));
    const gf = FS && FS.ORN_BY && FS.ORN_BY.goldfish;
    if (gf && !fish.some(f => f.id === 'goldfish')) {
      const i = fish.findIndex(f => f.id === 'koi');
      fish.splice(i < 0 ? fish.length : i + 1, 0, withRarity({ key: keyFish('goldfish'), id: 'goldfish', name: gf.name, col: gf.col, group: 'fish', water: 'pond', shop: 1 }));
    }
    const rares = RARE_ITEMS.map(r => withRarity({ key: keyRare(r.id), id: r.id, name: r.name, group: 'rare', type: r.type, rare: r.rare }));
    const glow = GLOW_CROPS.map(id => withRarity({ key: keyGlow(id), id, name: '发光的' + ((SIM && SIM.CROPS[id] && SIM.CROPS[id].name) || id), group: 'glow', type: id }));
    const giant = GIANT_CROPS.map(id => withRarity({ key: keyGiant(id), id, name: '巨大的' + ((SIM && SIM.CROPS[id] && SIM.CROPS[id].name) || id), group: 'giant', type: id }));
    const bugs = (INS && INS.catalog) ? INS.catalog() : [];
    return { fish, rare: rares, glow, giant, bug: bugs, decor: [] };
  }

  function groups() {
    return [
      { id: 'fish', name: '鱼', items: catalog().fish },
      { id: 'rare', name: '珍品', items: catalog().rare },
      { id: 'glow', name: '发光作物', items: catalog().glow },
      { id: 'giant', name: '巨大作物', items: catalog().giant },
      { id: 'bug', name: '昆虫', items: catalog().bug },
      { id: 'decor', name: '装饰', items: catalog().decor, later: 1 },
    ];
  }

  function validEntry(e) {
    e = e && typeof e === 'object' ? e : null; if (!e) return null;
    const firstDay = Math.max(0, Math.round(+e.firstDay || 0));
    const count = Math.max(1, Math.round(+e.count || 1));
    return { firstDay, count };
  }
  function validCodex(c) {
    const src = (c && c.entries && typeof c.entries === 'object') ? c.entries : (c && typeof c === 'object' && !Array.isArray(c) ? c : {});
    const entries = {};
    for (const k of Object.keys(src)) {
      if (!/^(fish|rare|glow|giant|decor|bug):[a-z0-9_]+$/i.test(k) || k.length > 40) continue;
      const e = validEntry(src[k]); if (e) entries[k] = e;
    }
    return { entries };
  }
  function validUnlocks(list, known) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map(u => {
      u = u && typeof u === 'object' ? u : null; if (!u || !known[u.id] || seen.has(u.id)) return null;
      seen.add(u.id); return { id: u.id, day: Math.max(0, Math.round(+u.day || 0)) };
    }).filter(Boolean).slice(0, 40);
  }
  function validStreaks(s) {
    s = s && typeof s === 'object' ? s : {};
    return { noShop: Math.max(0, Math.round(+s.noShop || 0)), shopDay: Math.max(0, Math.round(+s.shopDay || 0)),
      happy: Math.max(0, Math.round(+s.happy || 0)), dogDay: Math.max(0, Math.round(+s.dogDay || 0)) };
  }
  function validPondFish(list) {
    const ids = new Set((FS && FS.ORNAMENTAL ? FS.ORNAMENTAL : [{ id: 'koi' }, { id: 'goldfish' }]).map(o => o.id));
    const out = [], seen = new Set();
    for (const f of (Array.isArray(list) ? list : [])) {
      if (!f || !ids.has(f.kind) || typeof f.id !== 'string' || !f.id || f.id.length > 24 || seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ id: f.id, kind: f.kind, day: Math.max(0, Math.round(+f.day || 0)),
        x: (typeof f.x === 'number' && isFinite(f.x)) ? f.x : undefined,
        y: (typeof f.y === 'number' && isFinite(f.y)) ? f.y : undefined });
      if (out.length >= 8) break;
    }
    return out;
  }
  function validOrnament(o) {
    o = o && typeof o === 'object' ? o : {};
    const out = {};
    for (const k of ['koi', 'goldfish']) out[k] = Math.max(0, Math.min(99, Math.round(+o[k] || 0)));
    return out;
  }

  // fill the book from evidence already on the save: the recent catch log and whatever is sitting in a basket
  function seedFromSave(s) {
    const codex = emptyCodex();
    const dayOf = d => Math.max(0, d | 0);
    for (const c of (s && s.catches) || []) if (c && c.id) record(codex, keyFish(c.id), dayOf(c.day));
    const bags = [];
    if (s && s.inventory && s.inventory.basket) bags.push(s.inventory.basket);
    for (const m of (s && s.members) || []) if (m && m.basket) bags.push(m.basket);
    for (const bag of bags) for (const it of bag) { const k = itemKey(it); if (k) record(codex, k, 0); }
    if (s && s.pondFish) for (const f of s.pondFish) if (f && f.kind) record(codex, keyFish(f.kind) === 'fish:' + f.kind ? keyFish(f.kind) : keyFish(f.kind), dayOf(f.day));
    return { codex, achievements: inferAchievements(s, codex), milestones: inferMilestones(s) };
  }

  function regionsBought(up) {
    up = up || {};
    return REGIONS7.filter(id => (up[id] | 0) > 0).length;
  }
  const allRegions = up => regionsBought(up) >= REGIONS7.length;

  function inferAchievements(s, codex) {
    const out = [], day = (s && s.clock && s.clock.day) || 0;
    const mark = (id, d) => { if (!out.some(u => u.id === id)) out.push({ id, day: d | 0 }); };
    const coins = (s && s.coins) | 0, earned = (s && s.stats && s.stats.earned) | 0;
    if (coins >= 1000 || earned >= 1000) mark('gold1000', 0);
    const hasGiant = has(codex, keyGiant('pumpkin')) || has(codex, keyGiant('cabbage')) || has(codex, keyGiant('watermelon'));
    const hasGold = has(codex, keyRare('gold')), hasWhite = has(codex, keyRare('white'));
    if (hasGiant || hasGold || hasWhite) mark('rarefind', 0);
    if (has(codex, keyGiant('pumpkin'))) mark('pumpkin', 0);
    if (has(codex, keyFish('koi')) || has(codex, keyFish('sword'))) mark('truecatch', 0);
    if (s && s.pondFish && s.pondFish.length) mark('ornamental', 0);
    if (s && allRegions(s.upgrades)) mark('allland', 0);
    if (s && s.family && s.family.moved) mark('movedin', s.family.moved | 0);
    const kid0 = s && s.family && (s.family.kids || []).find(k => k && k.id === 'kid0');
    if (kid0 && day - (kid0.born | 0) >= 5) mark('kidwork', (kid0.born | 0) + 5);
    const peak = Math.max(coins, earned, ...(((s && s.stats && s.stats.dayEarn) || []).concat((s && s.stats && s.stats.todayEarn) || 0)));
    if (((s && s.stats && s.stats.todayEarn) | 0) >= 2000 || ((s && s.stats && s.stats.dayEarn) || []).some(v => v >= 2000)) mark('richday', 0);
    if (s && s.weather && (s.weather.lastDay | 0) > 0) mark('firstrain', s.weather.lastDay | 0);
    if (s && s.codex && s.codex.entries && Object.keys(s.codex.entries).some(k => k.indexOf('bug:') === 0)) mark('firstbug', 0);
    void peak;
    return out;
  }

  function inferMilestones(s) {
    const out = [], up = (s && s.upgrades) || {}, fam = (s && s.family) || {}, stats = (s && s.stats) || {};
    const mark = (id, d) => { if (!out.some(u => u.id === id)) out.push({ id, day: d | 0 }); };
    mark('open', 1);
    if ((stats.totalSold | 0) > 0 || (stats.earned | 0) > 0) mark('sale', 0);
    if (['can', 'shoe', 'hoe', 'basket', 'axe'].some(k => (up[k] | 0) > 0)) mark('tool', 0);
    if ((up.field | 0) > 0) mark('field', 0);
    if (regionsBought(up) > 0) mark('region', 0);
    if (['chicken', 'pig', 'sheep', 'cow'].some(k => (up[k] | 0) > 0)) mark('animal', 0);
    if ((up.axe | 0) > 0) mark('axe', 0);
    if (s && s.catches && s.catches.length) mark('fish', (s.catches[s.catches.length - 1].day) | 0);
    if ((up.cat | 0) > 0 || (up.dog | 0) > 0) mark('pet', 0);
    if (fam.met) mark('met', fam.met | 0);
    if (fam.moved) mark('moved', fam.moved | 0);
    if ((up.house | 0) > 0) mark('house', 0);
    if (fam.kids && fam.kids.length) mark('born', (fam.kids[0].born) | 0);
    if ((up.house | 0) >= 3) mark('manor', 0);
    if (allRegions(up)) mark('allland', 0);
    return out;
  }

  // ticks that run at dawn after the clock has already moved to the new day
  function tickStreaks(streaks, day, animals) {
    const st = validStreaks(streaks);
    if (st.shopDay === day - 1) st.noShop = 0; else st.noShop += 1;
    if (animals && animals.length) {
      if (animals.every(a => (a.h | 0) >= 80)) st.happy += 1; else st.happy = 0;
    }
    return st;
  }
  const noteShopOpen = (streaks, day) => { const st = validStreaks(streaks); st.shopDay = day | 0; return st; };

  function dueAchievements(ctx) {
    const have = new Set((ctx.achievements || []).map(u => u.id));
    const day = ctx.day | 0, due = [];
    const want = (id, ok) => { if (ok && !have.has(id) && ACH_BY[id] && !ACH_BY[id].later) due.push({ id, day }); };
    want('gold1000', (ctx.coins | 0) >= 1000);
    want('rarefind', ctx.sawRare || ctx.sawGiant);
    want('pumpkin', ctx.sawGiantPumpkin);
    want('truecatch', ctx.caughtKoi || ctx.caughtSword);
    want('ornamental', (ctx.pondCount | 0) > 0);
    want('idleweek', (ctx.streaks && ctx.streaks.noShop | 0) >= 7);
    want('allland', allRegions(ctx.upgrades));
    want('movedin', !!(ctx.family && ctx.family.moved && ctx.family.moved === day));
    // also if they just crossed into working age this morning
    want('kidwork', !!ctx.kidStarted);
    want('dogjob', !!(ctx.dogSurprise || ctx.dogJob));
    want('happypets', (ctx.streaks && ctx.streaks.happy | 0) >= 5);
    want('richday', (ctx.todayEarn | 0) >= 2000 || ((ctx.dayEarn || []).some && (ctx.dayEarn || []).some(v => v >= 2000)));
    want('firstrain', !!ctx.sawRain);
    want('firstbug', !!ctx.caughtBug);
    want('firstpark', !!ctx.playedPark);
    want('school', !!ctx.wentSchool); // v5.5.0: the school stage exists since v5.4.3
    return due;
  }

  function dueMilestones(ctx) {
    const have = new Set((ctx.milestones || []).map(u => u.id));
    const day = ctx.day | 0, due = [], up = ctx.upgrades || {}, fam = ctx.family || {}, stats = ctx.stats || {};
    const want = (id, ok) => { if (ok && !have.has(id)) due.push({ id, day }); };
    want('open', day >= 1);
    want('sale', (stats.totalSold | 0) > 0 || (stats.earned | 0) > 0);
    want('tool', ['can', 'shoe', 'hoe', 'basket', 'axe'].some(k => (up[k] | 0) > 0));
    want('field', (up.field | 0) > 0);
    want('region', regionsBought(up) > 0);
    want('animal', ['chicken', 'pig', 'sheep', 'cow'].some(k => (up[k] | 0) > 0));
    want('axe', (up.axe | 0) > 0);
    want('fish', (ctx.catches | 0) > 0);
    want('pet', (up.cat | 0) > 0 || (up.dog | 0) > 0);
    want('met', !!fam.met);
    want('moved', !!fam.moved);
    want('house', (up.house | 0) > 0);
    want('born', !!(fam.kids && fam.kids.length));
    want('manor', (up.house | 0) >= 3);
    want('allland', allRegions(up));
    return due;
  }

  function unlock(list, additions) {
    const out = (list || []).slice(), have = new Set(out.map(u => u.id));
    const fresh = [];
    for (const u of additions || []) {
      if (!u || have.has(u.id)) continue;
      have.add(u.id); out.push({ id: u.id, day: u.day | 0 }); fresh.push(out[out.length - 1]);
    }
    return { list: out, fresh };
  }

  const dayLabel = d => (d | 0) <= 0 ? '迁档时已达成' : '第 ' + (d | 0) + ' 天';

  const api = {
    REGIONS7, ACHIEVEMENTS, MILESTONES, RARE_ITEMS, GLOW_CROPS, GIANT_CROPS, ACH_BY, MS_BY,
    keyFish, keyRare, keyGlow, keyGiant, keyDecor, keyBug, itemKey,
    emptyCodex, emptyList, emptyStreaks, record, has, entryOf, catalog, groups, rarityOf,
    validEntry, validCodex, validUnlocks, validStreaks, validPondFish, validOrnament,
    seedFromSave, inferAchievements, inferMilestones, regionsBought, allRegions,
    tickStreaks, noteShopOpen, dueAchievements, dueMilestones, unlock, dayLabel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFCodex = api;
})(typeof window !== 'undefined' ? window : globalThis);
