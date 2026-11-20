// v5.11.0.15: the party spreads out (a longer table, a dance floor, a picnic rug, a ball lawn) and everyone does something.
//   node tools/party-shots.js [name-filter]   writes /workspace/pf-shots/party_*.png (PF_SHOTS to change)
//   PF_ROOT=<an old checkout> PF_BEFORE=1 node tools/party-shots.js   only party_before.png, from that checkout (no checks on new code)
//   exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT ? path.resolve(process.env.PF_ROOT) : path.join(__dirname, '..'), BEFORE = !!process.env.PF_BEFORE;
const VERSION = (fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1], OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [], net = [];
  async function page(q, vw = 1280, vh = 800) { const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('request', rq => { if (!rq.url().startsWith(base) && !rq.url().startsWith('data:')) net.push(rq.url()); });
    await p.goto(base + '/index.html' + q); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); return p; }
  // a farm well along: 阿禾 lives here, two children (one still little), the party area set up on the grass by the house,
  // and tonight a party with both guests from town
  const setup = `const f = __farm, S = f.S; f.SAVE.off = true;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    f.yard.length = 0; // a tidy yard (no rocks, logs or weeds lying about), like a farm that has been worked a while
    S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can','can','can']) f.buy(id);
    day(60); dry(); S.family.kids = [{ id: 'kid0', name: '小豆', born: 50 }, { id: 'kid1', name: '小米', born: 45 }]; f.syncFamily();
    at(8 * 60); const bought = f.buy('party'); until(() => !!f.partyArea() && !S.decor.orders.length, 900);
    const area = f.partyArea(); dry();
    if (area) { S.decor.party.at = S.day - 1; S.decor.party.last = S.day - 9; S.decor.party.tonight = S.day; S.decor.party.guests = 2; }
    const party = T => { at(16 * 60 + 50); dry(); S.decor.party.tonight = S.day; S.decor.party.guests = 2; until(() => S.t % 1440 >= T, 900); dry(); };
    const look = (x, y) => { f.setAngle(0.25); f.panTo(x, y); f.advance(0.4, 10); };
    const box = document.getElementById('offline'); if (box) box.hidden = true;`;
  const shot = async (name, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page('?manual'); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name + '.png') });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  if (BEFORE) { // the old code: everyone squeezed round the one small table
    await shot('party_before', `(() => { ${setup} if (!area) return { area: false }; party(18 * 60 + 10); look(area.x, area.y + 4);
      const who = f.actors().filter(a => a.task && a.task.kind === 'party').concat(f.GUESTS).map(a => [Math.round(a.x * 10) / 10, Math.round(a.y * 10) / 10]);
      return { ver: f.version, area: [area.x, area.y], who }; })()`, r => r.area === false ? 'no party area' : null);
  } else {
    // who is at the party, standing at their own place (not walking), and the smallest gap between two of them
    const people = `const people = () => { const plan = f.partyPlan(), out = [];
        for (const a of f.actors().concat(f.GUESTS, f.SPOUSES || [])) { const k = a === f.FARMER ? 'farmer' : a.id, P = plan[k]; if (!P || a.moving || a.home) continue; if (Math.hypot(a.x - P.x, a.y - P.y) < 1.5) out.push({ k, x: a.x, y: a.y, act: P.act }); }
        let gap = 1e9; for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) gap = Math.min(gap, Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y));
        return { n: out.length, gap: Math.round(gap * 10) / 10, acts: out.map(o => o.k + ':' + o.act) }; };`;
    // 1. 18:55, the second round: some at the long table, the rest on the dance floor, the rug and the ball lawn; nobody on top of anybody
    await shot('party_after', `(() => { ${setup} ${people} if (!area) return { area: false };
      party(18 * 60 + 55); const L = f.partyLawn(); look(area.x + 4, area.y + 6); const pp = people();
      const door = f.NAV.LAYOUT.DOOR, plan = f.partyPlan(), ends = (P, r) => { const w = r.waypoints || []; const e = w.length ? w[w.length - 1] : door; return r.reached || Math.hypot(e.x - P.x, e.y - P.y) < 4; };
      const cut = Object.keys(plan).filter(k => plan[k] && !ends(plan[k], f.pathTo(door, plan[k]))).concat(f.entrySpots().filter(p => !f.pathTo(door, p).reached).map(p => 'entry@' + p.x + ',' + p.y)), reach = !cut.length;
      const snap = f.snapshot(), size = JSON.stringify(snap).length, keys = Object.keys(snap.decor.party).join(',');
      return { ver: f.version, sv: snap.saveVersion, size, keys, bought: bought && bought.ok, area: [area.x, area.y], lawn: L.lawn.map(l => l.kind + (l.tall ? '|' : '') + '@' + l.x + ',' + l.y), extra: L.extra.length, why: L.why, reach, cut, ...pp }; })()`,
      r => r.area === false ? 'no party area' : r.ver !== VERSION ? 'ver ' + r.ver : r.sv !== 15 ? 'saveVersion ' + r.sv : r.keys !== 'last,at,tonight,guests' ? 'save keys ' + r.keys : r.size > 64 * 1024 ? 'save ' + r.size
        : r.lawn.length < 2 ? 'lawn ' + r.lawn : r.n < 6 ? 'only ' + r.n + ' at their places' : r.gap < 6 ? 'two people overlap (gap ' + r.gap + ')' : !r.reach ? 'a place cannot be reached' : null);
    // 2. the table up close: plates, a bite and crumbs, then everyone lifts a cup together
    await shot('party_eat', `(() => { ${setup} ${people} if (!area) return { area: false };
      party(18 * 60 + 30); look(area.x, area.y + 2); const seen = {};
      for (let i = 0; i < 40; i++) { f.setRealT(100 + i * 0.25); f.render(); for (const o of f.partyFx()) seen[o.k] = (seen[o.k] | 0) + 1; }
      f.setRealT(100 + 2.4 * 3 + 0.9); f.render(); const fx = f.partyFx().map(o => o.k), plates = Object.values(f.partyPlan()).filter(P => P && P.act === 'eat').length;
      return { seen, fx, plates, ...people() }; })()`,
      r => r.area === false ? 'no party area' : !r.seen.bite || !r.seen.crumb ? 'no bites ' + JSON.stringify(r.seen) : !r.seen.cup ? 'no toast' : r.plates < 3 ? 'diners ' + r.plates : r.gap < 6 ? 'overlap ' + r.gap : null);
    // 3. 19:55, the last round: the children chase the ball round their lawn, others dance or chat on the rug
    await shot('party_play', `(() => { ${setup} ${people} if (!area) return { area: false };
      party(19 * 60 + 55); const L = f.partyLawn(), pz = L.lawn.find(l => l.kind === 'play') || area; look((area.x + pz.x) / 2, (area.y + pz.y) / 2 + 4); const seen = {};
      for (let i = 0; i < 40; i++) { f.setRealT(200 + i * 0.2); f.render(); for (const o of f.partyFx()) seen[o.k] = (seen[o.k] | 0) + 1; }
      f.setRealT(203.3); f.render(); const pp = people(); return { seen, ...pp, t: S.t % 1440 }; })()`,
      r => r.area === false ? 'no party area' : !r.seen.ball ? 'no ball ' + JSON.stringify(r.seen) : !r.acts.some(a => /:play$/.test(a)) ? 'nobody playing' : !r.acts.some(a => /:(dance|chat)$/.test(a)) ? 'nobody dancing or chatting' : !r.seen.note && !r.seen.say ? 'no notes / bubbles' : r.gap < 6 ? 'overlap ' + r.gap : null);
  }
  if (net.length) fails.push('network: ' + net.slice(0, 3).join(' '));
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
