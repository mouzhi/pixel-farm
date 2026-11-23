// 像素农场 · 木材自动化（v5.3.1；v5.3.2 接上分工：只有农夫去）：纯函数，浏览器里是 window.PFWood，Node 里可以直接 require 做单元测试。
// Wood used to come only from trees the player marked. Now, once there is an axe and the 林场, the farmer (the family
// roles give him the wood) walks to the forest by himself when he is free and chops grown trees while the storehouse holds less than the next wood purchase needs (v5.4.5: with nothing
// left to build, until the storehouse is full, as spare-time work).
// Only the regrowing 林场 trees are ever chopped this way: trees at home or in other regions stay unless the player marks
// them, and fruit trees are never cut. Axe upgrades and the 伐木小屋 add wood per tree; the hut also replants each
// forest stump that night from the stored saplings, so the forest grows back in 3 days instead of 5.
'use strict';
(function (root) {
  const WD = (typeof require === 'function' && typeof document === 'undefined') ? require('./world.js') : root.PFWorld;
  const AXE_BONUS = [0, 0, 2, 4];             // extra wood per tree by axe level (level 1 = the first axe)
  const AXE_DUR = [20, 20, 15, 11];           // game minutes to fell one tree
  const HUT_BONUS = 2;                        // extra wood per 林场 tree with the lumber hut
  const HUT_REGROW = 3;                       // nights from stump to grown tree with the hut (5 without)
  const KEEP = 3;                             // grown 林场 trees left standing, so the forest never looks clear-cut
  const AUTO_BASE = 34;                       // task-board priority while a purchase needs wood: below tilling (35), above tidying (18) and fishing (8–12)
  const SPARE_BASE = 16;                      // v5.4.5: with nothing left to build he fills the storehouse in spare time: below tidying (18),
                                              // a pet's pat (20) and every farm chore, above fishing (8–12) and resting
  const AUTO_END = 18 * 60;                   // no new trips to the forest after 18:00
  const OFFLINE_SHARE = 0.5;                  // offline: half of what the forest could give in that time (on top of the 50% day rate)
  const HUT = { x: 170, y: -61 }, HUT_LOGS = { x: 152, y: -49 }; // the hut stands in the forest's empty south strip, east of the gate
  const HUT_FOOT = [11, 7];
  // wood from one tree. forest: the tree is in 林场 (the hut only helps there)
  function perTree(eff, forest) { eff = eff || {}; return WD.WOOD.perChop + (AXE_BONUS[eff.axeLv | 0] || 0) + (eff.smithAxe | 0) + (forest && eff.lumber ? HUT_BONUS : 0); }
  const chopMinutes = eff => Math.max(6, (AXE_DUR[(eff && eff.axeLv) | 0] || AXE_DUR[0]) - ((eff && eff.smithAxeCut) | 0));
  const regrowNights = eff => (eff && eff.lumber) ? HUT_REGROW : WD.STUMP_TO_TREE;
  // how much wood to keep in the storehouse: what the next wood-costing level in the shop needs (the biggest one, so the
  // manor's 400 drives it), never more than the storehouse holds. v5.4.5: when nothing left needs wood the target is the
  // whole storehouse (it used to be a 40-wood reserve, so after the manor he never went to 林场 again)
  function need(shop, up) {
    let n = 0;
    for (const it of shop) { const have = (up && up[it.id]) | 0, L = it.levels[have]; if (!L || !L.wood || it.p8 || it.p9 || it.p10 || it.p11 || it.yard) continue; // v5.6.0: the phase-8 builds (≤120 wood) don't steer chopping; the storehouse fill covers them (v5.9.0: the new house too)
      if (it.needs && !((up && up[it.needs]) > 0)) continue; n = Math.max(n, L.wood); }
    return n;
  }
  const target = (shop, up, cap) => Math.min(cap, need(shop, up) || cap);
  // task-board priority of the trip: a purchase waiting for wood beats tidying; filling the storehouse is spare-time work
  const autoBase = (shop, up) => need(shop, up) ? AUTO_BASE : SPARE_BASE;
  const canAuto = eff => !!(eff && eff.axe && (eff.regions || []).includes('forest'));
  // the 林场 trees that may be chopped automatically right now (KEEP of them always stay)
  function autoTrees(trees, eff) {
    if (!canAuto(eff)) return [];
    const grown = trees.filter(t => t.kind === 'wild' && t.stage === 'tree' && WD.regrows(t));
    return grown.length > KEEP ? grown : [];
  }
  const wants = (eff, wood, tgt) => canAuto(eff) && wood < tgt;
  // the lumber hut's night: every 林场 stump is replanted from a stored sapling (any kind; the forest grows it as a wild
  // tree). Returns the replanted trees. Runs before world.js treeOvernight, which then ages the saplings.
  function replant(trees, saplings, eff, reserved) {
    const out = []; if (!(eff && eff.lumber)) return out;
    for (const t of trees) { if (t.kind !== 'wild' || t.stage !== 'stump' || !WD.regrows(t)) continue;
      const k = WD.FRUIT_IDS.slice().sort((a, b) => ((saplings[b] || 0) - ((reserved && reserved[b]) || 0)) - ((saplings[a] || 0) - ((reserved && reserved[a]) || 0)))[0]; if (!k || !(saplings[k] > ((reserved && reserved[k]) || 0))) break;
      saplings[k]--; t.stage = 'sapling'; t.age = Math.max(t.age, WD.STUMP_TO_TREE - HUT_REGROW); out.push(t); }
    return out;
  }
  // offline wood: `days` already counts at the offline rate; the forest's steady output times OFFLINE_SHARE, filling at most
  // up to the target. forestN: how many 林场 wild trees there are (grown or not)
  function offline(days, eff, forestN, wood, tgt) {
    if (!canAuto(eff) || !(days > 0) || wood >= tgt) return 0;
    const perDay = Math.max(0, forestN - KEEP) * perTree(eff, true) / regrowNights(eff);
    return Math.max(0, Math.min(tgt - wood, Math.floor(perDay * days * OFFLINE_SHARE)));
  }
  // walk-blocking footprint for path.js ([x0, y0, x1, y1] boxes)
  const blocks = eff => (eff && eff.lumber) ? [[HUT.x - HUT_FOOT[0], HUT.y - HUT_FOOT[1], HUT.x + HUT_FOOT[0], HUT.y + HUT_FOOT[1]]] : [];
  const api = { AXE_BONUS, AXE_DUR, HUT_BONUS, HUT_REGROW, KEEP, AUTO_BASE, SPARE_BASE, AUTO_END, OFFLINE_SHARE, HUT, HUT_LOGS, HUT_FOOT,
    perTree, chopMinutes, regrowNights, need, target, autoBase, canAuto, autoTrees, wants, replant, offline, blocks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PFWood = api;
})(typeof window !== 'undefined' ? window : globalThis);
