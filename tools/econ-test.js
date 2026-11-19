// Unit tests for v5.9.2 (sim.js + save.js): the 24-hour offline window and 「家人帮忙添置」.   node tools/econ-test.js
// PF_REAL_SAVE=/path/to/export.txt also loads a real exported save (===SAVE=== ... ===LOG===); it is only read, never written.
const assert = require('assert'), fs = require('fs'), path = require('path');
const WD = require('../world.js'); globalThis.PFWorld = WD;
const SIM = require('../sim.js'), SAVE = require('../save.js'), WA = require('../wood.js');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };
const H = 3600e3, T0 = Date.UTC(2026, 10, 19, 8, 0, 0), DAY = SIM.DAY_REAL_SEC;
const earn = [900, 1000, 1100]; // avg 1000

ok('one visit: unchanged rule (50%, at most 3 days); without a window the old callers get the old numbers', () => {
  const r = SIM.offlineSettle(DAY * 2, earn); assert.strictEqual(r.days, 1); assert.strictEqual(r.gold, 1000); assert.strictEqual(r.limited, false); assert.strictEqual(r.win, undefined);
  const c = SIM.offlineSettle(DAY * 100, earn); assert.strictEqual(c.days, 3); assert(c.capped); assert.strictEqual(c.gold, 3000);
  assert.strictEqual(SIM.offlineSettle(30, earn), null, 'under a minute: nothing');
  assert.strictEqual(SIM.offlineSettle(-5000, earn, [], T0), null, 'clock turned back: nothing');
});
ok('window adds up: 3 days in any 24 hours, then 0 until the oldest settlement is 24 hours old', () => {
  let win = [];
  const a = SIM.offlineSettle(DAY * 4, earn, win, T0); assert.strictEqual(a.days, 2); assert.strictEqual(a.used, 0); win = a.win;
  const b = SIM.offlineSettle(DAY * 6, earn, win, T0 + 2 * H); assert.strictEqual(b.asked, 3); assert.strictEqual(b.used, 2); assert.strictEqual(b.days, 1); assert(b.limited); assert.strictEqual(b.gold, 1000); win = b.win;
  const c = SIM.offlineSettle(DAY * 6, earn, win, T0 + 5 * H); assert.strictEqual(c.days, 0); assert(c.limited); assert.strictEqual(c.gold, 0); assert.strictEqual(c.win.length, 2, 'a 0-day visit is not stored');
  assert.strictEqual(c.nextFullAt, T0 + 2 * H + 24 * H, 'full again 24 hours after the last settlement');
  const d = SIM.offlineSettle(DAY * 6, earn, c.win, T0 + 24 * H + 1); assert.strictEqual(d.used, 1, 'the first one left the window at hour 24'); assert.strictEqual(d.days, 2);
  const e = SIM.offlineSettle(DAY * 6, earn, d.win, T0 + 50 * H); assert.strictEqual(e.used, 0); assert.strictEqual(e.days, 3);
});
ok('a settlement exactly 24 hours old has left the window', () => {
  const w = [{ at: T0, days: 3 }];
  assert.strictEqual(SIM.offlineWindow(w, T0 + 24 * H - 1).length, 1); assert.strictEqual(SIM.offlineWindow(w, T0 + 24 * H).length, 0);
});
ok('anti clock-rollback: future settlements count as "now", so turning the clock back never frees the window early', () => {
  // clock set 5 days ahead, 3 days collected, clock set back: the window is still full for 24 real hours
  const fwd = SIM.offlineSettle(DAY * 9, earn, [], T0 + 5 * 24 * H); assert.strictEqual(fwd.days, 3);
  const back = SIM.offlineSettle(DAY * 9, earn, fwd.win, T0 + H); assert.strictEqual(back.used, 3); assert.strictEqual(back.days, 0);
  assert.strictEqual(back.win[0].at, T0 + H, 'clamped to now'); assert.strictEqual(back.nextFullAt, T0 + 25 * H);
  const later = SIM.offlineSettle(DAY * 9, earn, back.win, T0 + 25 * H + 1); assert.strictEqual(later.days, 3, 'a wrong clock costs at most one 24-hour window');
});
ok('window is kept short: at most 12 entries, junk dropped', () => {
  const w = Array.from({ length: 30 }, (_, i) => ({ at: T0 + i * 60e3, days: 0.05 })).concat([null, { at: 'x', days: 1 }, { at: T0, days: -1 }]);
  assert.strictEqual(SIM.offlineWindow(w, T0 + H).length, 12);
});
ok('wood and rain follow the capped days (offline wood is a function of r.days)', () => {
  const eff = SIM.effects(Object.assign(SIM.emptyUpgrades(), { axe: 2, forest: 1, lumber: 1, house: 3 }));
  const full = SIM.offlineSettle(DAY * 6, earn, [], T0), cut = SIM.offlineSettle(DAY * 6, earn, full.win, T0 + H);
  const w3 = WA.offline(full.days, eff, 20, 0, 400), w0 = WA.offline(cut.days, eff, 20, 0, 400);
  assert(w3 > 0, 'wood ' + w3); assert.strictEqual(cut.days, 0); assert.strictEqual(w0, 0, 'a used-up window brings no wood either');
});
ok('save: offline.win and settings.autoBuy are append-only; old saves get an empty window and autoBuy off', () => {
  const FIX = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
  for (const f of ['save-v10-day59-manor.json', 'save-v15-day72-cottage.json']) {
    if (!fs.existsSync(path.join(__dirname, 'fixtures', f))) { console.log('     (skip, no fixture)', f); continue; }
    const s = SAVE.migrate(FIX(f)); assert.strictEqual(s.saveVersion, 15, f);
    assert.deepStrictEqual(s.offline, { win: [] }, f); assert.strictEqual(s.settings.autoBuy, false, f); assert.strictEqual(s.settings.autoN, 0, f);
    s.settings.autoBuy = true; s.settings.autoDay = 60; s.settings.autoN = 4; s.offline.win = [{ at: T0, days: 1.25 }];
    const back = SAVE.validate(JSON.parse(JSON.stringify(s)));
    assert.deepStrictEqual(back.settings, { speed: s.settings.speed, autoBuy: true, autoDay: 60, autoN: 4 }, f); assert.deepStrictEqual(back.offline.win, [{ at: T0, days: 1.25 }], f);
  }
  const s = SAVE.migrate(FIX('save-v10-day59-manor.json')); s.settings.autoBuy = 'yes'; s.offline = { win: [{ at: 'x', days: 1 }, { at: T0, days: 9 }, 5] };
  const v = SAVE.validate(s); assert.strictEqual(v.settings.autoBuy, false, 'only a real true turns it on'); assert.deepStrictEqual(v.offline.win, [{ at: T0, days: 3 }]);
  const v2 = SAVE.validate(Object.assign({}, s, { offline: 'junk' })); assert.deepStrictEqual(v2.offline, { win: [] });
});
if (process.env.PF_REAL_SAVE && fs.existsSync(process.env.PF_REAL_SAVE)) ok('a real exported save (local only) loads with an empty window and autoBuy off', () => {
  const t = fs.readFileSync(process.env.PF_REAL_SAVE, 'utf8'), raw = JSON.parse(t.split('===LOG===')[0].replace('===SAVE===', '')), s = SAVE.migrate(raw.save || raw);
  assert.strictEqual(s.saveVersion, 15); assert.deepStrictEqual(s.offline, { win: [] }); assert.strictEqual(s.settings.autoBuy, false); assert(s.coins > 0);
});

// ---- 家人帮忙添置 ----
const up0 = () => SIM.emptyUpgrades();
ok('the list: 18 steps, basics only, no wood, about 6,210 gold in all', () => {
  assert.strictEqual(SIM.AUTO_BUY.length, 18); let gold = 0, wood = 0; const have = {};
  for (const id of SIM.AUTO_BUY) { const it = SIM.shopItem(id), L = it.levels[have[id] | 0]; have[id] = (have[id] | 0) + 1; gold += L.cost; wood += L.wood || 0;
    assert(!it.deco && !it.pet && !it.region && !it.home && !it.works && id !== 'speed', id); }
  assert.strictEqual(wood, 0); assert.strictEqual(gold, 6210);
});
ok('order: the k-th field is field level k; bought steps are skipped', () => {
  assert.deepStrictEqual(SIM.autoNext(up0()), { id: 'field', level: 1 });
  assert.deepStrictEqual(SIM.autoNext(Object.assign(up0(), { field: 3 })), { id: 'can', level: 1 });
  assert.deepStrictEqual(SIM.autoNext(Object.assign(up0(), { field: 3, can: 2, shoe: 1, hoe: 1, basket: 1, coop: 1, chicken: 6 })), { id: 'shoe', level: 2 });
  const all = Object.assign(up0(), { field: 3, can: 2, shoe: 2, hoe: 1, basket: 2, coop: 1, chicken: 6, strawberry: 1 });
  assert.strictEqual(SIM.autoNext(all), null); assert.strictEqual(SIM.autoPick(all, 1e6, 0, earn).why, 'done');
  // a player who bought ahead of the list: the step whose level is already past waits; the family never buys out of order
  assert.deepStrictEqual(SIM.autoNext(Object.assign(up0(), { field: 3, can: 3 })), { id: 'shoe', level: 1 });
});
ok('purse: 3x the price in hand and max(300, 2x recent average) left over', () => {
  assert.strictEqual(SIM.autoPick(up0(), 179, 0, []).id, null, '3 x 60 = 180');
  assert.strictEqual(SIM.autoPick(up0(), 359, 0, []).id, null, '360 - 60 = 300 must stay');
  assert.strictEqual(SIM.autoPick(up0(), 360, 0, []).id, 'field');
  assert.strictEqual(SIM.autoPick(up0(), 2059, 0, earn).id, null, 'keep 2 x 1000');
  assert.strictEqual(SIM.autoPick(up0(), 2060, 0, earn).id, 'field');
});
ok('locked and hidden steps wait; chickens need the coop', () => {
  const u = Object.assign(up0(), { field: 3, can: 1, shoe: 1, hoe: 1, basket: 1 });
  assert.strictEqual(SIM.autoPick(u, 5000, 0, earn).id, 'coop');
  assert.strictEqual(SIM.autoPick(u, 5000, 0, earn, id => id !== 'coop').why, 'hidden', 'respects the progressive shop');
  const noCoop = Object.assign({}, u, { coop: 0 }); // what if the list ever reached a chicken without a coop
  const p = SIM.autoPick(Object.assign(noCoop, { coop: 0 }), 5000, 0, earn); assert.strictEqual(p.id, 'coop');
});
console.log(`\n${n} passed`);
