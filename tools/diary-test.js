// v5.10.13 diary: counts, wording, 30-day cap, hostile save data, v15 round trips
const assert = require('assert'), fs = require('fs'), path = require('path');
const D = require('../diary.js'), Save = require('../save.js');
let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, e.stack); process.exitCode = 1; } };
const L = { who: w => ({ farmer: '农夫', partner: '阿禾', kid0: '小满' })[w] || '家人', item: id => ({ carrot: '胡萝卜', cabbage: '卷心菜', crucian: '鲫鱼', koi: '锦鲤', egg: '鸡蛋', milk: '牛奶', wool: '羊毛' })[id] || id, buy: id => ({ goldfish: '金鱼', axe: '斧头' })[id] || '' };
ok('counts per person, by item; one day is accumulated rather than appended per task', () => {
  const d = D.empty(); D.add(d, 12, 'p', 'carrot', 8, 'partner'); D.add(d, 12, 'h', 'cabbage', 12, 'kid0'); D.add(d, 12, 'f', 'crucian', 2, 'farmer');
  D.add(d, 12, 'pr', 'egg', 3); D.add(d, 12, 'pr', 'milk', 2); D.add(d, 12, 'pr', 'wool', 1); D.add(d, 12, 'wd', null, 6);
  D.add(d, 12, 'in', null, 340); D.add(d, 12, 'out', null, 80); D.bought(d, 12, 'goldfish'); D.note(d, 12, 'rare:koi');
  assert.equal(d.days.length, 1); const e = d.days[0], text = D.lines(e, L, false).join('');
  assert(text.includes('阿禾种了8棵胡萝卜')); assert(text.includes('小满收了12个卷心菜')); assert(text.includes('农夫钓到2条鲫鱼'));
  assert(text.includes('3个鸡蛋') && text.includes('2瓶牛奶') && text.includes('1份羊毛')); assert(text.includes('赚了 340 金') && text.includes('花了 80 金')); assert(text.includes('难得的锦鲤'));
  assert(D.brief(e, L).includes('昨天（第12天）')); assert(D.title(e, L, false).includes('晴'));
  D.note(d, 12, 'rain'); assert(D.title(e, L, true).includes('小雨')); assert(D.title(e, L, true).includes('今天'));
});
ok('days capped at 30, entries bounded; notes de-duplicated; old day never erases current', () => {
  const d = D.empty(); for (let day = 1; day <= 40; day++) { D.add(d, day, 'p', 'carrot', 1); for (let i = 0; i < 40; i++) { D.bought(d, day, 'item' + i); D.note(d, day, 'event:' + i); } }
  assert.equal(d.days.length, 30); assert.equal(d.days[0].d, 11); assert.equal(d.days[29].d, 40);
  assert(d.days.every(e => e.buy.length <= 8 && e.ev.length <= 8)); assert(JSON.stringify(d).length < 16000);
  D.add(d, 39, 'p', 'carrot', 2); assert.equal(d.days[28].a.farmer.p.carrot, 3); assert.equal(d.days[29].d, 40);
});
ok('empty day and day in progress use honest wording', () => {
  const e = D.blank(1); assert(D.isEmpty(e)); assert.equal(D.brief(e, L), ''); assert(D.lines(e, L, true)[0].includes('才刚开始')); assert(D.lines(e, L, false)[0].includes('什么也没记下'));
});
ok('malformed save fields are bounded and invalid days dropped', () => {
  const raw = { days: [null, 'hi', { d: 3, a: { farmer: { p: { carrot: 1e30, bad: -5 } } }, in: Infinity, out: 'bad', ev: Array(90).fill('x'.repeat(200)), buy: Array(40).fill('axe') }, { d: 3 }, { d: -1 }] };
  const d = D.valid(raw); assert.equal(d.days.length, 1); const e = d.days[0]; assert.equal(e.a.farmer.p.carrot, 99999); assert(!e.a.farmer.p.bad); assert.equal(e.in, 0); assert.equal(e.out, 0); assert.equal(e.ev.length, 8); assert.equal(e.ev[0].length, 24); assert.equal(e.buy.length, 8);
  assert.deepEqual(D.valid({ days: null }), D.empty()); assert.deepEqual(D.valid(null), D.empty());
});
ok('v10 and v15 fixtures still load, v15 append-only diary survives save round trip', () => {
  for (const file of ['save-v10-day59-manor.json', 'save-v15-day72-cottage.json']) {
    let s = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file))); s = s.save || s;
    const old = Save.migrate(s); assert.equal(old.saveVersion, 15); assert(!old.diary, 'old saves do not invent a history');
    const d = D.empty(); D.add(d, old.clock.day, 'p', 'carrot', 8, 'partner'); D.note(d, old.clock.day, 'born:小满');
    old.diary = d; const r = Save.decode(Save.encode(old)); assert.equal(r.saveVersion, 15); assert.deepEqual(r.diary, d);
  }
});
console.log('diary-test:', n, 'ok');
