// v5.11.0.23: loading a wedding-evening save with an already-married child's spouse used to throw
// `TypeError: Cannot set properties of null (setting 'work')` in stepActor (from homeTick), which
// killed requestAnimationFrame. The world canvas stayed black and the top-left HUD froze on its
// HTML defaults (第1天 06:00). This builds a save of that shape (kid1 already moved in, kid0's
// wedding tonight, party area, 17:48), reloads it, and also leaves the wedding plan with no guest
// seats — the cramped party area that triggered the live crash.
//   node tools/wedding-load-test.js
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  await p.goto(base + '/index.html?manual');
  await ready();

  const built = await p.evaluate(() => {
    const f = __farm, S = f.S;
    f.SAVE.off = true;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house', 'house', 'house', 'axe', 'forest', 'east', 'orchard', 'south', 'pasture', 'coast', 'can', 'can', 'can', 'can']) f.buy(id);
    day(80); dry();
    S.family.kids = [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 25 }];
    f.syncFamily();
    at(8 * 60);
    const partyBuy = f.buy('party');
    const spot = f.autoSpot('party');
    if (spot) {
      S.decor.placed = (S.decor.placed || []).filter(x => x.id !== 'party');
      S.decor.orders = (S.decor.orders || []).filter(q => q.id !== 'party');
      S.decor.placed.push({ u: 2, id: 'party', x: spot.x, y: spot.y, d: S.day - 2 });
    }
    const area = f.partyArea();
    if (area) { S.decor.party.at = S.day - 2; S.decor.party.last = S.day - 9; }
    f.buyPlot('glade', 'meadow');
    const c0 = f.buy('cottage');
    f.buyPlot('eslope', 'field');
    const c1 = f.buy('cottage');
    const houses = (S.home.houses || []).map((h, i) => {
      h.built = S.day - 3; h._tiles = null;
      return { i, site: h.site, ok: true };
    });
    f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true);
    // kid1 already moved in; kid0 marries tonight (the live-crash shape)
    if (S.home.houses[0]) S.home.houses[0].kid = 'kid1';
    if (S.home.houses[1]) S.home.houses[1].kid = null;
    S.home.wed = {
      kid1: { mate: 'm0', day: S.day - 3, moved: S.day - 3, house: 0 },
      kid0: { mate: 'm1', day: S.day, moved: 0, house: 1 }
    };
    S.home.rel.kid0 = { m0: 30, m1: 85, m2: 20 };
    S.home.rel.kid1 = { m0: 85, m1: 20, m2: 20 };
    at(17 * 60 + 48); dry();
    S.decor.party.tonight = S.day; S.decor.party.guests = 2;
    const snap = f.snapshot();
    return {
      ver: f.version, day: S.day, T: S.t % 1440, partyBuy: partyBuy && partyBuy.ok, spot,
      c0: c0 && c0.ok, c1: c1 && c1.ok,
      houses, wed: S.home.wed, area: area && { x: area.x, y: area.y }, snap
    };
  });
  if (!built.c0 || !built.c1 || built.houses.length < 2) {
    throw new Error('could not place two houses: ' + JSON.stringify({ c0: built.c0, c1: built.c1, houses: built.houses }));
  }
  assert.strictEqual(built.wed.kid0.moved, 0);
  assert.ok(built.wed.kid1.moved > 0);
  assert.ok(built.area, 'no party area');
  assert.ok(Math.abs(built.T - (17 * 60 + 48)) < 1, 't ' + built.T);

  await p.evaluate(s => {
    __farm.SAVE.off = true;
    localStorage.clear();
    localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s));
  }, built.snap);
  await p.reload();
  await ready();

  const r = await p.evaluate(() => {
    const f = __farm, S = f.S, out = { threw: null };
    f.SAVE.off = true;
    const box = document.getElementById('offline'); if (box) box.hidden = true;
    out.ver = f.version;
    out.day = S.day;
    out.T = S.t % 1440;
    out.wed = S.home && S.home.wed;
    out.tonight = !!(S.decor && S.decor.party && S.decor.party.tonight === S.day && f.partyArea());
    out.spousesBefore = (f.SPOUSES || []).map(s => s.id);
    // cramped ceremony: couple seats only, no guest places (the live farm's party area at the west edge)
    const DC = window.PFDecor;
    const orig = DC.weddingPlan;
    DC.weddingPlan = function (W, roster, coupleKeys, phase, extra) {
      const plan = orig(W, roster, coupleKeys, phase, extra) || {};
      for (const k of Object.keys(plan)) if (!(coupleKeys || []).includes(k)) plan[k] = null;
      return plan;
    };
    try {
      // register everyone so the plan is asked about the moved-in spouse
      for (const a of [f.FARMER, ...S.members, ...(f.SPOUSES || [])]) f.partySpot(a);
      out.plan = f.partyPlan && f.partyPlan();
      out.spots = {};
      for (const a of [f.FARMER, ...S.members, ...(f.SPOUSES || [])]) {
        const k = a === f.FARMER ? 'farmer' : a.id;
        const P = out.plan && out.plan[k];
        out.spots[k] = { plan: P ? { x: P.x, y: P.y } : P, spot: f.partySpot(a) };
      }
      f.advance(0.8, 30);
      out.dayAfter = S.day;
      out.TAfter = S.t % 1440;
      out.spousesAfter = (f.SPOUSES || []).map(s => ({
        id: s.id, kind: s.task && s.task.kind, label: s.task && s.task.label, hasTo: !!(s.task && s.task.to), work: s.task && s.task.work
      }));
      f.hud();
      out.hud = {
        day: document.getElementById('day') && document.getElementById('day').textContent,
        clock: document.getElementById('clock') && document.getElementById('clock').textContent,
        coins: document.getElementById('coins') && document.getElementById('coins').textContent
      };
      const c = document.querySelector('canvas'), g = c.getContext('2d');
      const d = g.getImageData(0, 0, Math.min(c.width, 160), Math.min(c.height, 160)).data;
      let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] | d[i + 1] | d[i + 2]) nz++;
      out.canvas = { w: c.width, h: c.height, nz };
      // a second tick must still run (the old frame loop died on the first throw)
      f.advance(0.2, 30);
      out.second = S.day;
    } catch (e) {
      out.threw = String(e && e.stack || e);
    }
    return out;
  });

  await p.screenshot({ path: path.join(OUT, 'wedding_load.png') });
  console.log(JSON.stringify(r, null, 2).slice(0, 4000));

  const workErr = errs.find(e => /Cannot set properties of null \(setting 'work'\)/.test(e));
  assert.ok(!r.threw, 'advance threw: ' + r.threw);
  assert.ok(!workErr, 'pageerror: ' + workErr);
  assert.strictEqual(r.ver, VERSION, 'ver ' + r.ver);
  assert.strictEqual(r.day, built.day, 'loaded day ' + r.day);
  assert.ok(r.tonight, 'party/wedding tonight not restored');
  assert.ok(r.spousesBefore.includes('sp_kid1'), 'moved-in spouse missing after load ' + r.spousesBefore);
  // the plan has no guest seat for the already-married spouse (the live crash)
  assert.ok(r.spots && r.spots.sp_kid1, 'no spot info for sp_kid1 ' + JSON.stringify(r.spots));
  assert.ok(!r.spots.sp_kid1.plan, 'expected no reserved plan seat for sp_kid1, got ' + JSON.stringify(r.spots.sp_kid1.plan));
  assert.ok(r.spots.sp_kid1.spot && r.spots.sp_kid1.spot.x != null, 'partySpot must still return a fallback place');
  assert.ok(r.spousesAfter.some(s => s.id === 'sp_kid1' && s.kind && s.hasTo), 'sp_kid1 has no task after advance ' + JSON.stringify(r.spousesAfter));
  assert.strictEqual(r.dayAfter, r.day, 'day changed during the tick');
  assert.ok(r.hud && r.hud.day && r.hud.day.includes(String(r.day)), 'HUD day ' + (r.hud && r.hud.day));
  assert.ok(r.hud && r.hud.clock && !/^0?6:00$/.test(r.hud.clock.trim()), 'HUD clock stuck at default ' + (r.hud && r.hud.clock));
  assert.ok(r.canvas && r.canvas.nz > 100, 'canvas looks blank ' + JSON.stringify(r.canvas));
  assert.strictEqual(r.second, r.day, 'second advance failed');
  const leftover = errs.filter(e => !/Failed to load|favicon/i.test(e));
  if (leftover.length) console.log('other errors', leftover.slice(0, 8));
  console.log('ok   wedding-load-test', r.day, r.hud.day, r.hud.clock, r.spousesAfter.map(s => s.id + ':' + s.kind).join(','));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
