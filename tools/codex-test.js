// Unit checks for codex.js, fish food weights and dog surprises (v5.4.1): node tools/codex-test.js
'use strict';
const assert = require('assert');
const CX = require('../codex.js'), FS = require('../fish.js'), AN = require('../animals.js'), SAVE = require('../save.js'), ICN = require('../codex_icons.js');

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

ok('recording a first encounter then counting repeats', () => {
  const c = CX.emptyCodex();
  const a = CX.record(c, CX.keyFish('koi'), 4);
  assert.strictEqual(a.first, true); assert.strictEqual(a.entry.firstDay, 4); assert.strictEqual(a.entry.count, 1);
  const b = CX.record(c, CX.keyFish('koi'), 7);
  assert.strictEqual(b.first, false); assert.strictEqual(b.entry.firstDay, 4); assert.strictEqual(b.entry.count, 2);
  const earlier = CX.record(c, CX.keyFish('koi'), 2);
  assert.strictEqual(earlier.entry.firstDay, 2, 'a later record can still reveal an earlier first day');
  CX.record(c, CX.keyFish('koi'), 0);
  assert.strictEqual(c.entries[CX.keyFish('koi')].firstDay, 2, 'day 0 does not overwrite a known first day');
  const seeded = CX.seedFromSave({ catches: [{ id: 'sardine', day: 51 }, { id: 'sardine', day: 50 }], inventory: { basket: ['sardine'] }, clock: { day: 53 } });
  assert.strictEqual(seeded.codex.entries[CX.keyFish('sardine')].firstDay, 50);
  assert.strictEqual(seeded.codex.entries[CX.keyFish('sardine')].count, 3);
  assert.strictEqual(CX.has(c, CX.keyFish('sword')), false);
});

ok('itemKey maps basket rares, glow, giants and fish, and ignores a plain carrot', () => {
  assert.strictEqual(CX.itemKey('koi'), 'fish:koi');
  assert.strictEqual(CX.itemKey({ type: 'egg', rare: 'gold' }), 'rare:gold');
  assert.strictEqual(CX.itemKey({ type: 'pumpkin', glow: 1 }), 'glow:pumpkin');
  assert.strictEqual(CX.itemKey({ type: 'pumpkin', giant: 1 }), 'giant:pumpkin');
  assert.strictEqual(CX.itemKey('carrot'), null);
  assert.strictEqual(CX.itemKey({ type: 'truffle' }), null);
});

ok('seeding an old save keeps unseen cells empty and does not drop catch or rare-item evidence', () => {
  const s = { catches: [{ id: 'crucian', name: '鲫鱼', gold: 5, water: 'pond', day: 2 }, { id: 'koi', name: '锦鲤', gold: 36, water: 'pond', day: 5 }],
    inventory: { basket: [{ type: 'egg', rare: 'gold' }] }, coins: 80, stats: { earned: 90 }, upgrades: {}, family: {} };
  const seeded = CX.seedFromSave(s);
  assert(seeded.codex.entries['fish:crucian']); assert(seeded.codex.entries['fish:koi']); assert(seeded.codex.entries['rare:gold']);
  assert(!seeded.codex.entries['fish:sword']); assert(!seeded.codex.entries['giant:pumpkin']);
  assert(seeded.achievements.some(u => u.id === 'truecatch'));
  assert(seeded.achievements.some(u => u.id === 'rarefind'));
  assert(!seeded.achievements.some(u => u.id === 'idleweek'));
  assert(!seeded.achievements.some(u => u.id === 'ornamental'));
});

ok('all 18 achievements are listed; later-phase ones stay locked until those features exist', () => {
  assert.strictEqual(CX.ACHIEVEMENTS.length, 18);
  const later = CX.ACHIEVEMENTS.filter(a => a.later).map(a => a.id);
  assert.deepStrictEqual(later.sort(), ['herding', 'newhouse', 'nightlight', 'party', 'school', 'sprinkler'].sort());
  const due = CX.dueAchievements({ day: 40, coins: 10000, upgrades: {}, family: {}, achievements: [], streaks: CX.emptyStreaks() });
  assert(!due.some(u => later.includes(u.id)));
  assert(due.some(u => u.id === 'gold1000'));
});

ok('shop-idle and happy-animal streaks, and a shop visit resets the idle count the next morning', () => {
  let st = CX.emptyStreaks();
  st = CX.tickStreaks(st, 2, []); assert.strictEqual(st.noShop, 1);
  for (let d = 3; d <= 8; d++) st = CX.tickStreaks(st, d, []);
  assert.strictEqual(st.noShop, 7);
  const due = CX.dueAchievements({ day: 8, coins: 0, upgrades: {}, family: {}, achievements: [], streaks: st });
  assert(due.some(u => u.id === 'idleweek'));
  st = CX.noteShopOpen(st, 8);
  st = CX.tickStreaks(st, 9, []); assert.strictEqual(st.noShop, 0);
  const animals = [{ h: 80 }, { h: 90 }, { h: 85 }];
  st = CX.emptyStreaks();
  for (let d = 2; d <= 6; d++) st = CX.tickStreaks(st, d, animals);
  assert.strictEqual(st.happy, 5);
  assert(CX.dueAchievements({ day: 6, coins: 0, upgrades: {}, family: {}, achievements: [], streaks: st, animals }).some(u => u.id === 'happypets'));
  st = CX.tickStreaks(st, 7, [{ h: 80 }, { h: 70 }]); assert.strictEqual(st.happy, 0);
});

ok('milestones unlock from ordinary farm progress, later names stay in the panel only', () => {
  const ctx = { day: 20, upgrades: { field: 1, forest: 1, axe: 1, chicken: 1, house: 3, east: 1, orchard: 1, south: 1, pasture: 1, coast: 1, cat: 1 },
    family: { met: 3, moved: 12, kids: [{ id: 'kid0', name: '小豆', born: 19 }] }, stats: { totalSold: 4, earned: 200 }, catches: 2, milestones: [] };
  const due = CX.dueMilestones(ctx).map(u => u.id);
  for (const id of ['open', 'sale', 'field', 'region', 'animal', 'axe', 'fish', 'pet', 'met', 'moved', 'house', 'born', 'manor', 'allland']) assert(due.includes(id), id);
});

ok('fed pond raises bass and koi without wiping commons, and never becomes mostly koi', () => {
  const bamboo = FS.rodOf(0), carbon = FS.rodOf(2);
  const pKoi0 = FS.chanceOf(FS.POND, bamboo.rare, 'koi');
  const pKoiF = FS.chanceOf(FS.POND, bamboo.rare, 'koi', FS.FED_BOOST);
  const pKoiC = FS.chanceOf(FS.POND, carbon.rare, 'koi', FS.FED_BOOST);
  const pCruF = FS.chanceOf(FS.POND, bamboo.rare, 'crucian', FS.FED_BOOST);
  assert(pKoiF > pKoi0, 'fed koi > unfed koi');
  assert(pKoiF < 0.08, 'bamboo + food still rarely lands a koi');
  assert(pKoiC < 0.16, 'even a carbon rod plus food is not mostly koi');
  assert(pCruF > 0.35, 'crucian still makes up a large share');
  // sea fish cannot go in the pond
  assert.strictEqual(FS.pondOk('koi'), true); assert.strictEqual(FS.pondOk('goldfish'), true); assert.strictEqual(FS.pondOk('sword'), false);
  assert.strictEqual(FS.FOOD.price, 8);
});

ok('dogs pick more than one kind of job, and a border collie prefers the sheepfold when it is there', () => {
  const rnd = () => Math.random();
  const kinds = new Set();
  for (let i = 0; i < 80; i++) kinds.add(AN.pickDogJob({ kind: 'dog', coat: 'shiba' }, { cats: [{ x: 1 }], fold: true, evening: false }, rnd).kind);
  assert(kinds.has('patrol') && kinds.has('sun') && (kinds.has('well') || kinds.has('fence') || kinds.has('check')), 'at least two idle jobs');
  assert(kinds.size >= 3);
  let fold = 0, n = 0;
  for (let i = 0; i < 200; i++) { n++; if (AN.pickDogJob({ kind: 'dog', coat: 'collie' }, { fold: true }, rnd).kind === 'fold') fold++; }
  const other = [];
  for (let i = 0; i < 200; i++) other.push(AN.pickDogJob({ kind: 'dog', coat: 'shiba' }, { fold: true }, rnd).kind);
  assert(fold > 20, 'the collie hangs around the fold often');
  assert(!other.includes('fold'), 'other dogs do not get the fold job');
  assert.strictEqual(AN.isCollie({ kind: 'dog', coat: 'collie' }), true);
  const surprises = new Set();
  for (let i = 0; i < 200; i++) { const s = AN.rollDogSurprise({ didToday: false, hasPigs: true }, rnd); if (s) surprises.add(s); }
  assert(surprises.size >= 3);
  assert.strictEqual(AN.rollDogSurprise({ didToday: true, hasPigs: true }, () => 0), null);
});

ok('unlock helper is idempotent and keeps the first date', () => {
  const a = CX.unlock([], [{ id: 'gold1000', day: 8 }]);
  const b = CX.unlock(a.list, [{ id: 'gold1000', day: 9 }, { id: 'allland', day: 12 }]);
  assert.strictEqual(a.fresh.length, 1); assert.strictEqual(b.fresh.length, 1);
  assert.deepStrictEqual(b.list, [{ id: 'gold1000', day: 8 }, { id: 'allland', day: 12 }]);
});

ok('every catalog fish and rare item has a pixel sprite, goldfish is in the book, silhouettes keep the same shape', () => {
  const cat = CX.catalog();
  assert(cat.fish.some(f => f.id === 'goldfish'), 'shop goldfish appears in the 图鉴');
  for (const f of cat.fish) assert(ICN.has('fish', f.id), 'missing fish sprite ' + f.id);
  for (const r of cat.rare) assert(ICN.has('rare', r.id), 'missing rare sprite ' + r.id);
  const koi = ICN.paint('fish', 'koi');
  assert.strictEqual(koi.w, 24); assert.strictEqual(koi.h, 16);
  const opaque = [];
  for (let i = 3; i < koi.px.length; i += 4) if (koi.px[i] > 0) opaque.push((i - 3) / 4);
  assert(opaque.length > 40, 'koi has a body');
  const sil = ICN.silhouette(koi);
  assert.strictEqual(sil.w, 24);
  let same = 0, dark = 0;
  for (let i = 3; i < koi.px.length; i += 4) {
    if ((koi.px[i] > 0) === (sil.px[i] > 0)) same++;
    if (sil.px[i] > 0) {
      // silhouette should not stay in the bright body colours
      const bright = sil.px[i - 3] > 140 || sil.px[i - 2] > 140;
      if (!bright) dark++;
    }
  }
  assert.strictEqual(same, koi.w * koi.h, 'silhouette uses the same pixels');
  assert(dark > 40);
  const sword = ICN.paint('fish', 'sword'), sardine = ICN.paint('fish', 'sardine');
  let diff = 0;
  for (let i = 3; i < sword.px.length; i += 4) if ((sword.px[i] > 0) !== (sardine.px[i] > 0)) diff++;
  assert(diff > 20, 'sword and sardine silhouettes must be distinct');
});

ok('book names use green / blue / orange rarity tiers', () => {
  const cat = CX.catalog();
  const of = (id) => (cat.fish.find(f => f.id === id) || cat.rare.find(r => r.id === id)).rarity;
  assert.strictEqual(of('crucian'), 'common');
  assert.strictEqual(of('carp'), 'common');
  assert.strictEqual(of('grassc'), 'common');
  assert.strictEqual(of('sardine'), 'common');
  assert.strictEqual(of('bass'), 'rare');
  assert.strictEqual(of('seabass'), 'rare');
  assert.strictEqual(of('snapper'), 'rare');
  assert.strictEqual(of('goldfish'), 'rare');
  assert.strictEqual(of('double'), 'rare');
  assert.strictEqual(of('koi'), 'epic');
  assert.strictEqual(of('tuna'), 'epic');
  assert.strictEqual(of('sword'), 'epic');
  assert.strictEqual(of('gold'), 'epic');
  assert.strictEqual(of('white'), 'epic');
  assert.strictEqual(CX.rarityOf({ group: 'glow', type: 'pumpkin' }), 'epic');
  assert.strictEqual(CX.rarityOf({ group: 'giant', type: 'cabbage' }), 'epic');
});

console.log('codex-test: ' + n + ' ok');

