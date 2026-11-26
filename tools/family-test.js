// v5.12.8 family count: the HUD / 家人 slot include spouses and grandchildren; the manor cap for
// the original children is unchanged.   node tools/family-test.js
'use strict';
const assert = require('assert');
const FAM = require('../family.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

ok('manor only: farmer + 阿禾 fill a 大木屋 (2/2); a baby who is not yet a member is still counted', () => {
  const a = FAM.census({ members: 1, babies: 0, inlaws: 0, grand: 0, mates: 0, manorPop: 2 });
  assert.deepStrictEqual(a, { people: 2, pop: 2, manor: 2, manorPop: 2, extra: 0 });
  const b = FAM.census({ members: 1, babies: 1, inlaws: 0, grand: 0, mates: 0, manorPop: 3 });
  assert.deepStrictEqual(b, { people: 3, pop: 3, manor: 3, manorPop: 3, extra: 0 });
});

ok('two grown children fill a 庄园 (4/4); spouses add one person and one room each (4/4 → 6/6)', () => {
  const manor = FAM.census({ members: 3, babies: 0, inlaws: 0, grand: 0, mates: 0, manorPop: 4 });
  assert.deepStrictEqual(manor, { people: 4, pop: 4, manor: 4, manorPop: 4, extra: 0 });
  const wed = FAM.census({ members: 3, babies: 0, inlaws: 2, grand: 0, mates: 0, manorPop: 4 });
  assert.deepStrictEqual(wed, { people: 6, pop: 6, manor: 4, manorPop: 4, extra: 2 });
});

ok('the reported bug: two baby grandchildren were listed but omitted from 家人 6/6; they make it 8/8', () => {
  // 农夫, 阿禾, 小豆, 小米, 石头, 朵朵, 小满, 乐乐 — spouses live in the new houses, so do the grandchildren
  const c = FAM.census({ members: 3, babies: 0, inlaws: 2, grand: 2, mates: 0, manorPop: 4 });
  assert.strictEqual(c.people, 8);
  assert.strictEqual(c.pop, 8);
  assert.strictEqual(c.manor, 4, '庄园 itself is still 4');
  assert.strictEqual(c.extra, 4);
});

ok('a grandchild\'s husband or wife, once married, is counted the same way (8/8 → 9/9)', () => {
  const c = FAM.census({ members: 3, babies: 0, inlaws: 2, grand: 2, mates: 1, manorPop: 4 });
  assert.deepStrictEqual({ people: c.people, pop: c.pop, extra: c.extra }, { people: 9, pop: 9, extra: 5 });
});

ok('empty / missing fields are zero; kidCap and nextKid still use the manor\'s rooms, not the inflated total', () => {
  assert.deepStrictEqual(FAM.census({}), { people: 1, pop: 0, manor: 1, manorPop: 0, extra: 0 });
  assert.strictEqual(FAM.kidCap(4), 2);
  assert.strictEqual(FAM.kidCap(8), 6, 'passing the HUD total would be wrong — callers must keep using manorPop');
  const fam = { moved: 1, kids: [{ id: 'kid0', name: '小豆', born: 1 }, { id: 'kid1', name: '小米', born: 3 }] };
  assert.strictEqual(FAM.nextKid(fam, 50, 4), null, 'both children are already here; manor pop 4 is enough');
});

console.log('family-test: ' + n + ' ok');
