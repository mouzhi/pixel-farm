// 像素农场 · v5.12.0 小镇美术升级：街面摆设的固定槽位、斑马线、平时的路人（纯数据和纯函数；浏览器里是 window.PFTownLife，Node 里可以 require）。
// The art is town-art.js (models, ground), the walkers are game.js (townLife). Nothing here is saved: the slots are fixed,
// the walkers come and go with the clock. Rules: plan「小镇美术、操场与公园」— 店招、布招、遮阳篷、窗台花箱与货箱 in fixed slots
// in front of the buildings; 平时 4 人，繁荣度 5 时 6 人，集市日和节日 8 人；不写存档.
'use strict';
(function (root) {
  const P = (x, y) => ({ x, y });
  // ---------- street dressing: fixed slots (world units). need: a hall project that must be built (H.built[need]) ----------
  // kinds: planter 窗台花箱, aframe 立牌, blade 悬挂店招 (sign: what is painted on it), barrel 木桶, crates 货箱 (town-art's),
  // awning 布篷 (over a shop front; w in world units), cafe 小圆桌和遮阳伞, bench 长椅 (decor-art's)
  const DRESS = [
    // the north side of 主街 (building fronts at y 43; the kerb at 61)
    { k: 'planter', x: 628, y: 49 }, { k: 'planter', x: 656, y: 49 },                       // 学校门口两侧
    { k: 'aframe', x: 652, y: 54, sign: 'school' },                                          // 学校的立牌：今日课表
    { k: 'planter', x: 700, y: 49, need: 'school' },                                          // 新教室
    { k: 'blade', x: 735, y: 48, sign: 'book', need: 'library' },                            // 书屋的吊牌
    { k: 'planter', x: 778, y: 48 },                                                          // 镇公所
    { k: 'blade', x: 809, y: 47, sign: 'shop' }, { k: 'aframe', x: 812, y: 54, sign: 'sale' }, // 镇上小店：吊牌、今日特价立牌
    { k: 'planter', x: 871, y: 48 }, { k: 'barrel', x: 906, y: 50 }, { k: 'planter', x: 940, y: 48 }, // 周婶、阿松、小桃家门前
    { k: 'blade', x: 973, y: 48, sign: 'flower', need: 'L11' },                              // 花匠秋姨的花店
    // the south side of 主街
    { k: 'aframe', x: 689, y: 79, sign: 'market', need: 'market' },                          // 集市入口的立牌
    { k: 'crates', x: 860, y: 81 }, { k: 'barrel', x: 845, y: 82 },                          // 小店的后货
    { k: 'blade', x: 880, y: 97, sign: 'clinic', need: 'clinic' },                           // 诊所
    // 工坊街 (the shops face north onto y 176; fronts at y 185)
    { k: 'awning', x: 626, y: 184, w: 14, c: 0, need: 'bakery' }, { k: 'blade', x: 637, y: 182, sign: 'bread', need: 'bakery' },
    { k: 'awning', x: 664, y: 184, w: 14, c: 1, need: 'woodshop' }, { k: 'blade', x: 676, y: 182, sign: 'saw', need: 'woodshop' },
    { k: 'awning', x: 702, y: 184, w: 14, c: 2, need: 'smithy' }, { k: 'blade', x: 713, y: 182, sign: 'anvil', need: 'smithy' },
    // 节庆广场: café tables at the corners (clear of the feast sections and the lantern ring)
    { k: 'cafe', x: 727, y: 106 }, { k: 'cafe', x: 799, y: 106 }, { k: 'cafe', x: 727, y: 154 }, { k: 'cafe', x: 799, y: 154 },
    // the lane behind (林老师、镇长 and the new houses on y -40; fronts at -33)
    { k: 'planter', x: 872, y: -27 }, { k: 'barrel', x: 906, y: -26 }, { k: 'planter', x: 940, y: -27, need: 'L5' },
    // by the gate: a welcome planter
    { k: 'planter', x: 616, y: 55 },
  ];
  const active = (d, built) => !d.need || !!(built && built[d.need]);
  const dressFor = built => DRESS.filter(d => active(d, built));
  // a blade sign's little lantern is lit at dusk while the shop keeps its hours (counts against the night light budget)
  const SIGN_LIT = [17 * 60 + 30, 21 * 60];
  function signLights(built, T) {
    const t = ((T % 1440) + 1440) % 1440; if (t < SIGN_LIT[0] || t >= SIGN_LIT[1]) return [];
    return dressFor(built).filter(d => d.k === 'blade').map(d => ({ x: d.x, y: d.y, z: 12, r: 10, s: 0.45 }));
  }

  // ---------- 斑马线: where a side street crosses 主街 (y 61..71) ----------
  const CROSSINGS = [P(606, 66), P(696, 66), P(838, 66)];
  const CROSS = { hw: 5, bar: 1.5 }; // 10 units wide, stripes 1.5 units, running north-south (people cross that way)
  function crossAt(x, y) { // -> true on a light stripe
    for (const c of CROSSINGS) { const dx = x - c.x; if (Math.abs(dx) > CROSS.hw || Math.abs(y - c.y) > 3.6) continue;
      return (Math.floor((dx + CROSS.hw) / CROSS.bar) & 1) === 0; }
    return false;
  }

  // ---------- 路人: townsfolk and day visitors walking about (never saved) ----------
  const LIFE = { from: 7 * 60 + 30, to: 19 * 60 + 30 };
  // ctx: { T, lv (prosperity), market (market day), fest (festival day), rain } -> how many are out now
  function lifeCount(ctx) {
    const t = (((ctx && ctx.T) || 0) % 1440 + 1440) % 1440; if (t < LIFE.from || t >= LIFE.to) return 0;
    let n = (ctx.market || ctx.fest) ? 8 : ((ctx.lv | 0) >= 5 ? 6 : 4);
    if (ctx.rain) n = Math.ceil(n / 2);
    return n;
  }
  // where they stop a while (on a street edge or a square, facing what they look at: fy -1 = north)
  const STOPS = [
    { x: 818, y: 52, fy: -1, why: 'shop' }, { x: 759, y: 57, fy: -1, why: 'board' }, { x: 726, y: 52, fy: -1, why: 'library' },
    { x: 642, y: 54, fy: -1, why: 'school' }, { x: 650, y: 100, fy: 1, why: 'fountain' }, { x: 640, y: 160, fy: -1, why: 'plaza' },
    { x: 763, y: 100, fy: 1, why: 'square' }, { x: 763, y: 162, fy: -1, why: 'square' }, { x: 626, y: 179, fy: 1, why: 'bakery' },
    { x: 702, y: 179, fy: 1, why: 'smithy' }, { x: 870, y: 92, fy: 1, why: 'clinic' }, { x: 900, y: -18, fy: -1, why: 'lane' },
    { x: 740, y: 63, fy: -1, why: 'street' }, { x: 890, y: 69, fy: 1, why: 'street' }, { x: 960, y: 63, fy: -1, why: 'street' },
  ];
  const EDGES = [P(600, 66), P(978, 66), P(978, -14), P(978, 176)]; // the gate and the far ends of the streets: they come and go there
  const LOOKS = ['innA', 'innC', 'innB', 'innD', 'mateA', 'innE', 'innF', 'mateC'];
  const api = { DRESS, dressFor, active, SIGN_LIT, signLights, CROSSINGS, CROSS, crossAt, LIFE, lifeCount, STOPS, EDGES, LOOKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFTownLife = api;
})(typeof window !== 'undefined' ? window : globalThis);
