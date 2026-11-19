// 像素农场 · 节奏、经济与商店规则（纯函数，没有画面依赖；浏览器里是 window.PFSim，Node 里可以直接 require 做单元测试）
// Phase 1: day-based crops, one watering lasts the whole day, auto crop choice by profit, daily price drift, offline settlement.
// Phase 2: shop (tools, basket, speed, field, seed unlocks), seeds from harvests, seed surplus sold back to the merchant.
// Phase 3: the axe and four regions on the big map (geometry and tree rules live in world.js).
// Phase 4: the north pasture, a coop and a shed, chickens / sheep / cows (care rules live in animals.js).
// Phase 5 (v5.0): house tiers and pen fences cost wood as well as gold; family rules live in family.js.
'use strict';
(function (root) {
  const TN = root.PFTown || (typeof require === 'function' ? require('./town.js') : null); // v5.8.0 phase 10: the town
  const HM = root.PFHome || (typeof require === 'function' ? require('./home.js') : null); // v5.9.0 phase 11: the new house
  const DC = root.PFDecor || (typeof require === 'function' ? require('./decor.js') : null); // v5.7.0 phase 9: the decoration shop
  const MIN_PER_SEC = 3;          // game minutes per real second at 1x (v3 was 5): a day is about 5.2 real minutes
  const SLEEP_MULT = 6;           // the night runs 6x faster while the farmer sleeps
  const WAKE = 6 * 60, BEDTIME = 20 * 60;
  const AWAKE_MIN = BEDTIME - WAKE;
  const DAY_REAL_SEC = AWAKE_MIN / MIN_PER_SEC + (1440 - AWAKE_MIN) / (MIN_PER_SEC * SLEEP_MULT); // 313 s
  const WATER_MAX0 = 4;           // watering can capacity at the start
  const BASKET = 10;              // crops carried before a market trip (start)
  const OFFLINE_RATE = 0.5, OFFLINE_CAP_DAYS = 3, OFFLINE_MIN_SEC = 60;
  // seed: shop price, days: watered days to the first harvest, price: base sell price, seedSell: what the merchant pays
  // for a spare seed, drop: [chance of >= 1 seed, chance of a 2nd] from a harvest (expected < 1, so the merchant still
  // matters), regrow / harvests: berry bushes keep fruiting every `regrow` days for `harvests` pickings
  const CROPS = {
    carrot: { name: '胡萝卜', seed: 3, days: 1, price: 8, seedSell: 1, drop: [0.7, 0.1] },
    cabbage: { name: '卷心菜', seed: 10, days: 2, price: 30, seedSell: 4, drop: [0.65, 0.1] },
    pumpkin: { name: '南瓜', seed: 25, days: 4, price: 85, seedSell: 10, drop: [0.6, 0.1] },
    strawberry: { name: '草莓', seed: 80, days: 4, price: 30, seedSell: 30, drop: [0.6, 0], regrow: 1, harvests: 10, unlock: 'strawberry' },
    watermelon: { name: '西瓜', seed: 60, days: 6, price: 220, seedSell: 20, drop: [0.55, 0.05], unlock: 'watermelon' },
    // v5.6.0: wheat comes with the mill and is planted for it on demand (game.js), never chosen for profit (it earns little raw)
    wheat: { name: '小麦', seed: 4, days: 2, price: 14, seedSell: 2, drop: [0.9, 0.4], unlock: 'mill' },
  };
  const IDS = Object.keys(CROPS);
  // ---- shop: every item is a ladder of levels; upgrades[id] = how many levels are bought ----
  const SHOP = [
    { id: 'field', name: '家门口的田', icon: 'field', levels: [
      { cost: 60, label: '开垦 4 格', desc: '田地 12 → 16 格' },
      { cost: 130, label: '再开 4 格', desc: '田地 16 → 20 格' },
      { cost: 250, label: '开垦最后 4 格', desc: '田地 20 → 24 格' },
    ] },
    { id: 'can', name: '水壶', icon: 'can', levels: [{ cost: 80, label: '铜水壶', desc: '装 8 格水' }, { cost: 600, label: '银水壶', desc: '装 16 格水' }, { cost: 2000, label: '金水壶', desc: '装 30 格水' }, { cost: 4500, label: '花洒水壶', desc: '装 40 格水；一次浇一片 3×3（每格还是用 1 格水）' }] },
    { id: 'shoe', name: '鞋子', icon: 'shoe', levels: [{ cost: 200, label: '布鞋', desc: '走路 ×1.25' }, { cost: 800, label: '皮靴', desc: '走路 ×1.5' }, { cost: 2500, label: '风行靴', desc: '走路 ×1.8' }] },
    { id: 'hoe', name: '锄头', icon: 'hoe', levels: [{ cost: 250, label: '钢锄头', desc: '开垦快一倍' }, { cost: 3000, label: '宽锄头', desc: '一锄翻 3×3' }] },
    { id: 'basket', name: '篮子', icon: 'basket', levels: [{ cost: 300, label: '大篮子', desc: '一次装 20 个' }, { cost: 1200, label: '手推车', desc: '一次装 40 个' }] },
    { id: 'speed', name: '游戏倍速', icon: 'speed', levels: [{ cost: 600, label: '2× 速度', desc: '解锁 2× 按钮' }, { cost: 3000, label: '4× 速度', desc: '解锁 4× 按钮' }] },
    { id: 'strawberry', name: '草莓种子', icon: 'strawberry', levels: [{ cost: 800, label: '草莓', desc: '4 天结果，之后每天摘一次，共 10 次' }] },
    { id: 'watermelon', name: '西瓜种子', icon: 'watermelon', levels: [{ cost: 2500, label: '西瓜', desc: '6 天成熟，卖 220' }] },
    { id: 'axe', name: '斧头', icon: 'axe', levels: [
      { cost: 500, label: '斧头', desc: '能砍家门口和已买区域里的野树（果树不砍）：每棵木材 8 份 + 果树苗 1 棵，偶尔掉点小东西；买了林场以后，木材不够时农夫会自己去林场砍树（林场的树会长回来）' },
      { cost: 1500, label: '钢斧', desc: '每棵树多 2 份木材，砍得快一些' },
      { cost: 4000, label: '伐木大斧', desc: '每棵树再多 2 份木材（共 12 份），砍一棵只要一半时间' },
    ] },
    // regions (Phase 3): one level each; buying opens the fence
    { id: 'forest', name: '林场', icon: 'forest', region: 1, levels: [{ cost: 800, label: '林场', desc: '北边的树林，能砍树（要斧头），树会长回来' }] },
    { id: 'east', name: '东田', icon: 'east', region: 1, levels: [{ cost: 1200, label: '东田', desc: '东边 24 格大田，满地杂物，带水桶' }] },
    { id: 'orchard', name: '果园坡', icon: 'orchard', region: 1, levels: [{ cost: 1500, label: '果园坡', desc: '3 棵苹果树（每 3 天 5 个），可以移植树苗' }] },
    { id: 'south', name: '南坡梯田', icon: 'south', region: 1, levels: [{ cost: 2500, label: '南坡梯田', desc: '南边 24 格坡地，带水桶' }] },
    { id: 'pasture', name: '北牧场', icon: 'pasture', region: 1, levels: [{ cost: 2000, label: '北牧场', desc: '东北边的草场，带饲料槽和水桶，可以盖牛棚养牛' }] },
    // animals (v4.7): each kind has a building in its own place; the building needs its region, one level = one more animal.
    // Home coop (no region) is the early one; then pigs at the forest edge, sheep on the orchard slope, cows in the north pasture.
    { id: 'coop', name: '鸡舍', icon: 'coop', farm: 1, levels: [{ cost: 300, label: '鸡舍', desc: '盖在家门口西边，能养 6 只鸡，带小水槽' }] },
    { id: 'chicken', name: '鸡', icon: 'chicken', farm: 1, needs: 'coop', levels: [100, 130, 170, 220, 280, 340, 360, 380, 400, 420, 440, 460].map((cost, i) => ({ cost, label: `第 ${i + 1} 只鸡`, desc: '每天吃 1 份干草，下 1 个蛋（开心时 2 个）' + (i >= 6 ? '；住进第二鸡舍' : '') })) },
    { id: 'sty', name: '猪圈', icon: 'sty', farm: 1, needs: 'forest', levels: [{ cost: 500, label: '猪圈', desc: '林场路边的猪圈，能养 3 头猪' }] },
    { id: 'pig', name: '猪', icon: 'pig', farm: 1, needs: 'sty', levels: [400, 480, 560, 600, 640, 680].map((cost, i) => ({ cost, label: `第 ${i + 1} 头猪`, desc: '每天吃 2 份干草，每 2 天在树下拱出 1 颗松露（开心时 2 颗）' + (i >= 3 ? '；住进第二猪圈' : '') })) },
    { id: 'fold', name: '羊圈', icon: 'fold', farm: 1, needs: 'orchard', levels: [{ cost: 900, label: '羊圈', desc: '果园坡上的羊圈，能养 3 只羊' }] },
    // v5.5.0: the fold's meadow behind the orchard (no plot needed); sheep go out to graze by day
    { id: 'graze', name: '放牧草地', icon: 'graze', farm: 1, needs: 'fold', levels: [{ cost: 600, wood: 30, label: '放牧草地', desc: '在羊圈后面（果园西边）围出一块草地，白天 8–17 点羊会出去吃草' }] },
    { id: 'sheep', name: '羊', icon: 'sheep', farm: 1, needs: 'fold', levels: [700, 800, 900, 950, 1000, 1050].map((cost, i) => ({ cost, label: `第 ${i + 1} 只羊`, desc: '每天吃 2 份干草，每 3 天剪 1 份羊毛（开心时 2 份）' + (i >= 3 ? '；住进第二羊圈' : '') })) },
    { id: 'shed', name: '牛棚', icon: 'shed', farm: 1, needs: 'pasture', levels: [{ cost: 1500, label: '牛棚', desc: '北牧场的牛棚，能养 3 头牛，旁边堆干草' }] },
    { id: 'cow', name: '牛', icon: 'cow', farm: 1, needs: 'shed', levels: [1400, 1600, 1900, 2000, 2100, 2200].map((cost, i) => ({ cost, label: `第 ${i + 1} 头牛`, desc: '每天吃 3 份干草，挤 1 瓶奶（开心时 2 瓶）' + (i >= 3 ? '；住进第二牛棚' : '') })) },
    // companions (v4.6): no hay, no product, a small bonus each
    { id: 'cat', name: '猫', icon: 'cat', pet: 1, levels: [{ cost: 120, label: '橘猫' }, { cost: 180, label: '黑猫' }, { cost: 260, label: '三花猫' }].map(l => Object.assign(l, { desc: '在农场里晒太阳、跟着散步；每天早上叼来 1 颗胡萝卜种子' })) },
    { id: 'dog', name: '狗', icon: 'dog', pet: 1, levels: [
      { cost: 160, label: '柴犬', desc: '大部分时间自己在院子里转，偶尔过来看一眼；农夫走路快 3%' },
      { cost: 240, label: '边境牧羊犬', desc: '黑白边牧：自己溜达，爱在羊圈附近转；以后羊圈升级出草地时会赶羊。农夫走路快 3%' },
      { cost: 320, label: '棕色小狗', desc: '大部分时间自己在院子里转，偶尔过来看一眼；农夫走路快 3%' },
    ] },
    // v5.0 phase 5: the house grows with wood + gold; each tier is one more room (people who can live and work here)
    { id: 'house', name: '房子', icon: 'house', home: 1, levels: [
      { cost: 800, wood: 40, label: '大木屋', desc: '加一间屋，人口上限 2：阿禾可以搬来一起住；仓库能放 200 份木材' },
      { cost: 3000, wood: 150, label: '二层农舍', desc: '加盖二楼，人口上限 3：可以有第一个孩子；仓库 400 份木材' },
      { cost: 8000, wood: 400, label: '庄园', desc: '两边加厢房，人口上限 4：可以有第二个孩子；仓库 800 份木材' },
    ] },
    { id: 'fence', name: '木篱笆', icon: 'fence', home: 1, levels: [{ cost: 200, wood: 60, label: '棚子的木篱笆', desc: '给盖好的（和以后盖的）每个棚子围上篱笆，动物每晚心情 +4' }] },
    { id: 'rod', name: '钓竿', icon: 'rod', fish: 1, levels: [{ cost: 400, label: '钢竿', desc: '咬钩更快，更容易钓到少见的鱼' }, { cost: 1600, label: '碳素竿', desc: '再快一些，锦鲤更常见' }] },
    { id: 'coast', name: '海边', icon: 'coast', region: 1, fish: 1, levels: [{ cost: 3500, label: '海边', desc: '东南边的沙滩和码头，看得见海' }] },
    { id: 'searod', name: '海竿', icon: 'searod', fish: 1, needs: 'coast', levels: [{ cost: 2000, label: '大海竿', desc: '能在码头上钓海鱼' }] },
    // v5.3.1 wood automation (rules in wood.js): the hut in the forest adds wood per tree and replants stumps from stored saplings
    { id: 'lumber', name: '伐木小屋', icon: 'lumber', lumber: 1, needs: 'forest', levels: [{ cost: 2400, wood: 30, label: '伐木小屋', desc: '盖在林场里：林场的树每棵多 2 份木材；树桩当晚就用仓库里的树苗补种，3 天长回来（原来 5 天）' }] },
    // v5.6.0 phase 8 (rules in works.js): bought once, then the family installs, tends and empties them by themselves
    { id: 'sprinkler', name: '田边浇水器', icon: 'sprinkler', works: 1, p8: 1, levels: Array.from({ length: 16 }, (_, i) => ({ cost: 800, wood: 20, label: `第 ${i + 1} 台`, desc: '家人自己摆到田边，每天把旁边 8 格左右的田浇透；不用电、不会坏。全部田都有浇水器时，浇水就不再是家人的活' })) },
    { id: 'mill', name: '磨坊', icon: 'mill', works: 1, p8: 1, levels: [{ cost: 5000, wood: 120, label: '磨坊', desc: '盖在工坊院里，同时解锁小麦（家人按需要自己种）。2 份小麦磨成 1 袋面粉（卖 60），磨下的麸皮做成 2 捆饲料放进仓库' }] },
    { id: 'jam', name: '果酱铺', icon: 'jam', works: 1, p8: 1, levels: [{ cost: 3500, wood: 80, label: '果酱铺', desc: '盖在工坊院里。家人把草莓、苹果、橘子送进去，2 个熬成 1 罐果酱（卖 80）' }] },
    { id: 'cheese', name: '奶酪坊', icon: 'cheese', works: 1, p8: 1, levels: [{ cost: 4500, wood: 100, label: '奶酪坊', desc: '盖在工坊院里。2 瓶牛奶做成 1 块奶酪（卖 130）' }] },
    { id: 'wheel', name: '水车', icon: 'wheel', works: 1, p8: 1, levels: [{ cost: 1500, wood: 60, label: '修好水车', desc: '动力坝上的水车转起来给农场供电：家人在院子、新地门口和加工坊前立起电灯，离水车不太远的灯夜里会亮，灯下的果树结果快一点' }, { cost: 2500, wood: 80, label: '第二架水车', desc: '再修一架（要第二块动力坝），远处的灯也能亮' }] },
    { id: 'hive', name: '蜂箱', icon: 'hive', works: 1, p8: 1, levels: Array.from({ length: 6 }, (_, i) => ({ cost: 800, wood: 20, label: `第 ${i + 1} 箱`, desc: '放在花甸里（没有花甸时果园坡最多放 2 箱）。家人自己照看，每 2 天收 1 瓶蜂蜜（卖 40），花多时偶尔多一瓶' })) },
    { id: 'coop2', p8: 1, name: '第二鸡舍', icon: 'coop', farm: 1, needs: 'coop', levels: [{ cost: 600, wood: 40, label: '第二鸡舍', desc: '盖在选成「牧场」的新地上，再养 6 只鸡' }] },
    { id: 'sty2', p8: 1, name: '第二猪圈', icon: 'sty', farm: 1, needs: 'sty', levels: [{ cost: 900, wood: 50, label: '第二猪圈', desc: '盖在选成「牧场」的新地上，再养 3 头猪' }] },
    { id: 'fold2', p8: 1, name: '第二羊圈', icon: 'fold', farm: 1, needs: 'fold', levels: [{ cost: 1500, wood: 60, label: '第二羊圈', desc: '盖在选成「牧场」的新地上，再养 3 只羊' }] },
    { id: 'shed2', p8: 1, name: '第二牛棚', icon: 'shed', farm: 1, needs: 'shed', levels: [{ cost: 2500, wood: 80, label: '第二牛棚', desc: '盖在选成「牧场」的新地上，再养 3 头牛' }] },
    // v5.7.0 phase 9 (rules in decor.js): decorations at a flat price; each one bought goes to the storehouse and the family sets it down
    ...(DC ? DC.SHOP_IDS.map(id => { const c = DC.CATALOG[id]; return { id, name: c.name, icon: id, deco: 1, p9: 1, flat: 1,
      levels: Array.from({ length: c.shop.max }, (_, i) => ({ cost: c.shop.cost, wood: c.shop.wood, label: c.shop.max > 1 ? `第 ${i + 1} 个` : c.name, desc: c.desc })) }; }) : []),
    // v5.8.0 phase 10 (rules in town.js): the town east of 东大道; its gate opens once the road is bought and a child has been to school
    ...(TN ? [{ id: 'town', p10: 1, name: '隔壁镇子', icon: 'town', levels: [{ cost: TN.PRICE.cost, wood: TN.PRICE.wood, label: '打开镇门', desc: '东大道尽头的镇子：学校、小店（工坊货、蜂蜜和鱼多卖两成）、几户人家；孩子改去镇上的学校' }] }] : []),
    // v5.9.0 phase 11 (rules in home.js): a smaller house on a bought 花甸 / 农田 plot, for a grown child who marries
    ...(HM ? [{ id: 'cottage', p11: 1, name: '新房子', icon: 'cottage', levels: HM.HOUSE.levels.map((l, i) => ({ cost: l.cost, wood: l.wood, label: i ? '第二座新房子' : '新房子',
      desc: (i ? '给第二个孩子成家用。' : '') + '家人在花甸或农田里盖一座小一号的房子，旁边带 6 格小田和两只母鸡。孩子长成少年、和同学走得很近以后，会在这里成家' })) }] : []),
  ];
  const SHOP_IDS = SHOP.map(s => s.id);
  // shop UI tabs: every item lives in exactly one category; the panel remembers the last tab
  const SHOP_TABS = [
    { id: 'tools', name: '工具', ids: ['can', 'shoe', 'hoe', 'basket', 'axe', 'speed', 'rod', 'searod'] },
    { id: 'seeds', name: '种子', ids: ['strawberry', 'watermelon'] },
    { id: 'land', name: '地块', title: '地块与区域', ids: ['field', 'forest', 'east', 'orchard', 'south', 'pasture', 'coast', ...(TN ? ['town'] : [])] },
    { id: 'build', name: '建筑', ids: ['house', 'fence', ...(HM ? ['cottage'] : []), 'lumber', 'coop', 'sty', 'fold', 'graze', 'shed', 'coop2', 'sty2', 'fold2', 'shed2'] },
    { id: 'works', name: '工坊', title: '浇水器、加工坊、水车和蜂箱', ids: ['sprinkler', 'mill', 'jam', 'cheese', 'wheel', 'hive'] }, // v5.6.0
    { id: 'animals', name: '动物', ids: ['chicken', 'pig', 'sheep', 'cow', 'cat', 'dog'] },
    ...(DC ? [{ id: 'decor', name: '装饰', title: '装饰、夜灯和派对区', ids: DC.SHOP_IDS.slice() }] : []), // v5.7.0
  ];
  const emptyUpgrades = () => Object.fromEntries(SHOP_IDS.map(k => [k, 0]));
  const shopItem = id => SHOP.find(s => s.id === id);
  function effects(up) {
    up = up || {};
    const lv = id => Math.min(shopItem(id).levels.length, Math.max(0, up[id] | 0));
    return {
      field: lv('field'),
      waterMax: [WATER_MAX0, 8, 16, 30, 40][lv('can')], water3: lv('can') >= 4, // v5.0: the sprinkler can waters a 3x3 patch
      walk: Math.round([1, 1.25, 1.5, 1.8][lv('shoe')] * (1 + 0.03 * lv('dog')) * 1000) / 1000, // v4.7: each dog +3%
      tillDur: lv('hoe') >= 1 ? 2 : 4, till3: lv('hoe') >= 2,
      basket: [BASKET, 20, 40][lv('basket')],
      speedMax: [1, 2, 4][lv('speed')],
      crops: IDS.filter(k => !CROPS[k].unlock || lv(CROPS[k].unlock) > 0),
      axe: lv('axe') > 0, axeLv: lv('axe'), lumber: lv('lumber') > 0, // v5.3.1: axe levels and the lumber hut (wood.js)
      regions: SHOP.filter(s => s.region && lv(s.id) > 0).map(s => s.id),
      coop: lv('coop') > 0, sty: lv('sty') > 0, fold: lv('fold') > 0, shed: lv('shed') > 0, graze: lv('graze') > 0, // v5.5.0
      animals: { chicken: lv('chicken'), sheep: lv('sheep'), cow: lv('cow'), pig: lv('pig') },
      pets: { cat: lv('cat'), dog: lv('dog') },
      rod: lv('rod'), searod: lv('searod') > 0,
      house: lv('house'), fence: lv('fence') > 0,
      sprinkler: lv('sprinkler'), mill: lv('mill') > 0, jam: lv('jam') > 0, cheese: lv('cheese') > 0, wheel: lv('wheel'), hive: lv('hive'), // v5.6.0
      town: TN ? lv('town') > 0 : false, // v5.8.0
      cottage: HM ? lv('cottage') : 0, // v5.9.0
      coop2: lv('coop2') > 0, sty2: lv('sty2') > 0, fold2: lv('fold2') > 0, shed2: lv('shed2') > 0,
    };
  }
  // what the next level of an item costs and whether it can be bought now
  function offer(up, coins, id, woodHave = 0) {
    const it = shopItem(id); if (!it) return null;
    const have = Math.max(0, (up && up[id]) | 0);
    if (have >= it.levels.length) return { id, maxed: true, have, item: it };
    const L = it.levels[have];
    const wood = L.wood || 0, shortWood = Math.max(0, wood - (woodHave | 0)); // v5.0: some levels also cost wood from the barn
    if (it.needs && !((up && up[it.needs]) > 0)) return { id, item: it, have, level: L, cost: L.cost, wood, ok: false, locked: it.needs, short: 0, shortWood: 0 };
    const why = api.gate ? api.gate(id, have) : null; // v5.6.0: conditions outside the shop (a 工坊院 plot, a cow, a second pen ...), set by game.js
    if (why) return { id, item: it, have, level: L, cost: L.cost, wood, ok: false, locked: id, lockText: why, short: 0, shortWood: 0 };
    return { id, item: it, have, level: L, cost: L.cost, wood, ok: coins >= L.cost && !shortWood, short: Math.max(0, L.cost - coins), shortWood };
  }
  // 12 of the 24 home tiles are open at the start; each field upgrade opens 4 more tiles (12 → 16 → 20 → 24)
  // field 0: west 4 cols × first 3 rows. field 1: + east 2 cols of the first 2 rows.
  // field 2: + the rest of row 2 and the west 2 of row 3. field 3: the last 4 of row 3.
  const START_COLS = 4, START_ROWS = 3;
  const HOME_COLS = 6, HOME_ROWS = 4;
  function isOpen(c, r, field) {
    field = field | 0;
    if (field >= 3) return true;
    if (field >= 2) return r < 3 || (r === 3 && c < 2);
    if (field >= 1) return r < 2 || (r === 2 && c < START_COLS);
    return c < START_COLS && r < START_ROWS;
  }
  function homeOpenCount(field) {
    let n = 0; for (let r = 0; r < HOME_ROWS; r++) for (let c = 0; c < HOME_COLS; c++) if (isOpen(c, r, field)) n++; return n;
  }
  // lowest field level whose isOpen covers at least `n` already-open home tiles (never shrink a save)
  function fieldLevelForOpen(n) { n = n | 0; return n >= 21 ? 3 : n >= 17 ? 2 : n >= 13 ? 1 : 0; }
  const startOpen = (c, r) => isOpen(c, r, 0);
  const emptySeeds = () => Object.fromEntries(IDS.map(k => [k, 0]));
  const startPrices = () => Object.fromEntries(IDS.map(k => [k, 1]));
  const ripe = crop => crop.age >= CROPS[crop.type].days;
  // 0 seed, 1 sprout, 2 young, 3 ripe: spread over the crop's days so a 4-day pumpkin visibly changes every morning
  function stageOf(crop) {
    const d = CROPS[crop.type].days;
    if (crop.age >= d) return 3;
    if (crop.n > 0) return 2; // a picked berry bush stays leafy while the next fruit comes
    return Math.min(2, Math.floor((crop.age * 3 + d - 1) / d));
  }
  const priceOf = (type, prices) => Math.max(1, Math.round(CROPS[type].price * ((prices && prices[type]) || 1)));
  // net gold per tile per day; a free (weed / harvested) seed costs nothing; a berry bush spreads its seed over all pickings
  function netPerDay(type, prices, free) {
    const c = CROPS[type], seed = free ? 0 : c.seed;
    if (c.regrow) return (priceOf(type, prices) * c.harvests - seed) / (c.days + c.regrow * (c.harvests - 1));
    return (priceOf(type, prices) - seed) / c.days;
  }
  // which seed in the bag to plant next: the best earner per tile-day at today's prices
  function pickFromBag(bag, prices) {
    let best = null, bv = -Infinity;
    for (const k of IDS) if ((bag[k] || 0) > 0) { const v = netPerDay(k, prices, true); if (v > bv) { bv = v; best = k; } }
    return best;
  }
  // seeds a harvest gives back (the last picking of a berry bush, or any single-harvest crop)
  function harvestSeeds(type, rnd) { const d = CROPS[type].drop; let n = 0; if (rnd() < d[0]) n++; if (n && rnd() < d[1]) n++; return n; }
  // seeds to buy at the stall for `need` empty tiles: premium seeds only while at least half of the purse stays,
  // free carrot seeds (weeds) are used before buying carrot seeds
  function planSeeds(coins, prices, need, freeCarrots, crops) {
    crops = crops || IDS.filter(k => !CROPS[k].unlock);
    const buy = emptySeeds(); let cost = 0; const floor = coins * 0.5;
    const order = crops.slice().sort((a, b) => netPerDay(b, prices, false) - netPerDay(a, prices, false));
    for (let i = 0; i < need; i++) {
      let done = false;
      for (const k of order) {
        if (k === 'carrot') {
          if (freeCarrots > 0) { freeCarrots--; done = true; break; }
          if (coins - cost >= CROPS.carrot.seed) { buy.carrot++; cost += CROPS.carrot.seed; done = true; break; }
        } else if (netPerDay(k, prices, false) > netPerDay('carrot', prices, freeCarrots > 0) && coins - cost - CROPS[k].seed >= floor) {
          buy[k]++; cost += CROPS[k].seed; done = true; break;
        }
      }
      if (!done) break;
    }
    return { buy, cost };
  }
  // seeds beyond what one full replanting needs are sold back (only what the farmer carries)
  function surplusSeeds(bag, store, openTiles) {
    const sell = emptySeeds(); let gold = 0; const cap = Math.max(6, openTiles);
    for (const k of IDS) { const extra = Math.min(bag[k] || 0, (bag[k] || 0) + (store[k] || 0) - cap); if (extra > 0) { sell[k] = extra; gold += extra * CROPS[k].seedSell; } }
    return { sell, gold };
  }
  // merchant prices drift a little every morning: at most 5% a day, pulled back toward 1, kept in 0.8..1.2
  function driftPrices(prices, rnd) {
    const out = {};
    for (const k of IDS) { const m = (prices && prices[k]) || 1; out[k] = Math.round(Math.min(1.2, Math.max(0.8, m + 0.3 * (1 - m) + (rnd() * 2 - 1) * 0.05)) * 1000) / 1000; }
    return out;
  }
  // offline: away time -> game days at 50% of the online rate (always 1x speed), at most 3 days, times the recent daily income.
  // v5.9.2: and at most 3 days in any 24 real hours. `win` is the save's list of past settlements [{ at: ms, days }]; without it
  // (old callers, unit tests of the per-visit rule) there is no 24-hour window.
  const OFFLINE_WIN_MS = 24 * 3600 * 1000, OFFLINE_WIN_MAX = 12;
  // the settlements still inside the 24-hour window. A time in the future (the clock was set forward, then back) counts as
  // "just now", so turning the clock back never frees the window early; it frees 24 real hours later.
  function offlineWindow(win, now) {
    return (Array.isArray(win) ? win : []).filter(w => w && isFinite(w.at) && w.days > 0)
      .map(w => ({ at: Math.min(w.at, now), days: Math.min(OFFLINE_CAP_DAYS, w.days) }))
      .filter(w => w.at > now - OFFLINE_WIN_MS).slice(-OFFLINE_WIN_MAX);
  }
  function offlineSettle(awaySec, dayEarn, win, now) {
    if (!(awaySec >= OFFLINE_MIN_SEC)) return null;
    const raw = awaySec / DAY_REAL_SEC * OFFLINE_RATE, asked = Math.round(Math.min(OFFLINE_CAP_DAYS, raw) * 100) / 100;
    const recent = (dayEarn || []).slice(-3), avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const out = { awaySec, asked, days: asked, capped: raw > OFFLINE_CAP_DAYS, avg: Math.round(avg), used: 0, limited: false };
    if (win !== undefined) {
      now = +now || Date.now();
      const w = offlineWindow(win, now), used = Math.round(w.reduce((a, x) => a + x.days, 0) * 100) / 100;
      out.used = used; out.days = Math.max(0, Math.round(Math.min(asked, OFFLINE_CAP_DAYS - used) * 100) / 100); out.limited = out.days < asked;
      if (out.days > 0) w.push({ at: now, days: out.days });
      out.win = w.slice(-OFFLINE_WIN_MAX);
      out.nextFullAt = out.win.length ? Math.max(...out.win.map(x => x.at)) + OFFLINE_WIN_MS : now; // all of today's days are free again
    }
    out.gold = Math.floor(avg * out.days);
    return out;
  }
  // v5.9.2 「家人帮忙添置」 (off by default): the only things the family ever buys for the player, in this order. No wood, no
  // decorations, pets, speed, land, buildings, workshops or town things: those are the player's own choices.
  const AUTO_BUY = ['field', 'field', 'field', 'can', 'shoe', 'hoe', 'basket', 'coop', 'chicken', 'chicken', 'chicken', 'chicken', 'chicken', 'chicken',
    'can', 'shoe', 'strawberry', 'basket'];
  const AUTO_MULT = 3, AUTO_FLOOR = 300; // buy only with 3x the price in hand, and keep max(300, 2x the recent daily average) after it
  // the next AUTO_BUY step not bought yet (the list repeats an id once per level: the k-th 'field' is field level k)
  function autoNext(up) {
    const seen = {};
    for (const id of AUTO_BUY) { seen[id] = (seen[id] || 0) + 1; if ((up && up[id] | 0) < seen[id]) return { id, level: seen[id] }; }
    return null;
  }
  // what the family would buy now: { id, cost } or { id: null, why }. shown(id): the shop's progressive reveal (game.js)
  function autoPick(up, coins, wood, dayEarn, shown) {
    const next = autoNext(up); if (!next) return { id: null, why: 'done' };
    const o = offer(up, coins, next.id, wood);
    if (!o || o.maxed || o.have + 1 !== next.level) return { id: null, why: 'order' };
    if (o.locked) return { id: null, why: 'locked', next: next.id };
    if (shown && !shown(next.id)) return { id: null, why: 'hidden', next: next.id };
    const recent = (dayEarn || []).slice(-3), avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const keep = Math.max(AUTO_FLOOR, Math.round(2 * avg));
    if (!o.ok || coins < o.cost * AUTO_MULT || coins - o.cost < keep) return { id: null, why: 'purse', next: next.id, cost: o.cost, keep };
    return { id: next.id, cost: o.cost, keep };
  }
  const api = { MIN_PER_SEC, SLEEP_MULT, WAKE, BEDTIME, DAY_REAL_SEC, WATER_MAX0, BASKET, OFFLINE_RATE, OFFLINE_CAP_DAYS, OFFLINE_MIN_SEC,
    CROPS, IDS, SHOP, SHOP_IDS, SHOP_TABS, emptyUpgrades, shopItem, effects, offer, START_COLS, START_ROWS, HOME_COLS, HOME_ROWS, isOpen, homeOpenCount, fieldLevelForOpen, startOpen, emptySeeds, startPrices,
    ripe, stageOf, priceOf, netPerDay, pickFromBag, harvestSeeds, planSeeds, surplusSeeds, driftPrices, offlineSettle, offlineWindow, OFFLINE_WIN_MS, OFFLINE_WIN_MAX, AUTO_BUY, AUTO_MULT, AUTO_FLOOR, autoNext, autoPick, gate: null };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
