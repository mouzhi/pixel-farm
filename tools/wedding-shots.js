// v5.11.0.21 婚礼: a child's wedding is its own scene, not just another party evening. A player's photo 「孩子的婚礼」 showed the
// couple in work clothes and straw hats at the ordinary table: 「婚礼我觉得还是蛮重要的一个场景，女孩子要有婚纱」.
//   node tools/wedding-shots.js [name-filter]   writes $PF_SHOTS/wedding_*.png (default /workspace/pf-shots)
//   PF_ROOT=<an old checkout> PF_BEFORE=1 node tools/wedding-shots.js   only wedding_before.png, from that checkout (no checks on new code)
// Checks: the bride wears the gown and the groom the suit only on the wedding evening (everyday clothes the next morning); the
// arch, the aisle and the cake are out; the couple wait at the far end, walk the aisle (drawn slowly) and stand under the arch;
// the guests have their own places facing them (actual sprite pixels never overlap at five camera angles); petals and hearts
// during the vows; the party (eating at the table first) follows; the album's 「孩子的婚礼」 photo is the couple under the arch;
// two of the same (two brides) get told apart; the save stays v15 with no new fields and well under 64 KB.
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
  // a farm well along (day 70): 阿禾, 小豆 (a teen, close to 朵朵) and 小米, a new house on a bought 花甸, the party area by the
  // house; that morning 小豆 and 朵朵 decide to marry tonight (the real homeMorning path, which also queues the album photo)
  const setup = `const f = __farm, S = f.S; f.SAVE.off = true;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const tod = () => S.t % 1440, dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    f.yard.length = 0; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','house','axe','forest','east','orchard','south','pasture','coast','can','can','can','can']) f.buy(id);
    day(70); dry(); S.family.kids = [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 45 }]; f.syncFamily();
    at(8 * 60); f.buy('party'); until(() => !!f.partyArea() && !S.decor.orders.length, 900); const area = f.partyArea();
    if (area) { S.decor.party.at = S.day - 1; S.decor.party.last = S.day - 9; }
    f.buyPlot('glade', 'meadow'); f.buy('cottage'); const h = S.home.houses[0]; if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); f.HA.sync(true); }
    const MATE = window.PF_MATE || 'm1'; S.home.rel.kid0 = { m0: 30, m1: 20, m2: 20 }; S.home.rel.kid0[MATE] = 85;
    day(S.day + 1); at(6 * 60); dry(); f.homeMorning(); dry(); dispatchEvent(new CustomEvent('pf:career-done')); // the path dialog (picked later by default)
    const photos = []; addEventListener('pf:album', e => photos.push(e.detail));
    const kid = () => S.members.find(m => m.id === 'kid0'), sp = () => f.SPOUSES.find(s => s._spouse === 'kid0');
    const goTo = T => { until(() => tod() >= T - 1, 1500); dry(); for (let i = 0; i < 400 && tod() < T; i++) f.advance(0.05, 10); dry(); };
    const look = (x, y) => { f.setAngle(0.25); f.panTo(x, y); f.advance(0.05, 10); };
    const box = document.getElementById('offline'); if (box) box.hidden = true;`;
  const shot = async (name, fn, check, opt) => { if (only && !name.includes(only)) return;
    const p = await page('?manual'); if (opt && opt.mate) await p.evaluate(m => { window.PF_MATE = m; }, opt.mate);
    let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    if (!(opt && opt.noZoom)) await p.evaluate(() => { const c = document.querySelector('canvas'); for (let i = 0; i < 2; i++) c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true })); __farm.render(); });
    if (opt && opt.after && !(r && r.error)) { try { Object.assign(r, await opt.after(p)); } catch (e) { r.error = String(e).slice(0, 400); } }
    await p.waitForTimeout(300); if (!(opt && opt.noShot)) await p.screenshot({ path: path.join(OUT, name + '.png') });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 1500)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  if (BEFORE) { // the old code: the same evening at 18:10 was an ordinary party
    await shot('wedding_before', `(() => { ${setup} if (!area) return { area: false }; goTo(18 * 60 + 10); look(area.x, area.y + 8);
      return { ver: f.version, wed: JSON.stringify(S.home.wed), area: [area.x, area.y] }; })()`, r => r.area === false ? 'no party area' : null);
  } else {
    // who stands at their place and what they are doing; the smallest gap between two of them
    const people = `const people = () => { const plan = f.partyPlan(), out = [];
        for (const a of f.actors().concat(f.GUESTS, f.SPOUSES || [])) { const k = a === f.FARMER ? 'farmer' : a.id, P = plan[k]; if (!P || a.moving || a.home) continue; if (Math.hypot(a.x - P.x, a.y - P.y) < 1.5) out.push({ k, x: a.x, y: a.y, act: P.act }); }
        let gap = 1e9; for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { if (/wed-couple/.test(out[i].act) && /wed-couple/.test(out[j].act)) continue; gap = Math.min(gap, Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y)); }
        return { n: out.length, gap: Math.round(gap * 10) / 10, acts: out.map(o => o.k + ':' + o.act) }; };
      const looks = () => ({ kid: f.wedLook(kid()), mate: sp() ? f.wedLook(sp()) : null, kid1: f.wedLook(S.members.find(m => m.id === 'kid1')), lookOf: f.lookOf(kid()).join(':') });`;
    // 1. 18:10 under the arch: the bride in her gown and veil, the groom in his suit, petals falling, the guests in rows facing them
    await shot('wedding_ceremony', `(() => { ${setup} ${people} if (!area) return { area: false }; goTo(18 * 60 + 10); const W = f.wedCer(); if (!W) return { W: null, wed: S.home.wed };
      look((W.arch.x + area.x) / 2 + 4, (W.couple[0].y + W.arch.y) / 2 + 8); const seen = {};
      for (let i = 0; i < 30; i++) { f.setRealT(100 + i * 0.3); f.render(); for (const o of f.partyFx()) seen[o.k] = (seen[o.k] | 0) + 1; }
      f.setRealT(101.1); f.render(); const k = kid(), s = sp(), atArch = [k, s].map((a, i) => a && Math.hypot(a.x - W.couple[i].x, a.y - W.couple[i].y) < 1.5);
      const drawn = f.partyDraw().map(o => ({ k: o.partyKey, sheet: o.sheet === f.famSheet(f.wedLook(k) || 'x', 3) ? 'wed' : '' }));
      return { ver: f.version, T: tod(), arch: [W.arch.x, W.arch.y], u: W.u, guests: W.guests.length, atArch, seen, ...looks(), ...people(), drawn }; })()`,
      r => r.area === false ? 'no party area' : r.W === null ? 'no ceremony layout ' + JSON.stringify(r.wed) : r.ver !== VERSION ? 'ver ' + r.ver
        : r.kid !== 'groom' || r.mate !== 'bride' ? 'outfits ' + r.kid + '/' + r.mate : r.kid1 ? 'a guest in wedding clothes' : !r.atArch.every(Boolean) ? 'couple not under the arch ' + r.atArch
        : !r.seen.wheart ? 'no vows hearts ' + JSON.stringify(r.seen) : r.acts.filter(a => /wed-guest/.test(a)).length < 3 ? 'guests ' + r.acts : r.gap < 6 ? 'guests overlap ' + r.gap : null);
    // 2. the walk up the aisle (drawn): the couple wait at the far end from 17:05, walk from 17:50 and stand under the arch by 18:02; side by side half way
    await shot('wedding_walk', `(() => { ${setup} if (!area) return { area: false }; goTo(17 * 60 + 49); const W = f.wedCer(); if (!W) return { W: null };
      const k = kid(), s = sp(), wait = [k, s].map((a, i) => a && Math.round(Math.hypot(a.x - W.start[i].x, a.y - W.start[i].y) * 10) / 10);
      goTo(17 * 60 + 56); f.render(); const d = f.partyDraw().filter(o => o.partyKey === 'kid0' || o.partyKey === 'sp_kid0').map(o => ({ k: o.partyKey, x: Math.round(o.x * 10) / 10, y: Math.round(o.y * 10) / 10, row: o.row }));
      const mid = d.map(o => { const i = o.k === 'kid0' ? 0 : 1, a = W.start[i], e = W.couple[i], L = Math.hypot(e.x - a.x, e.y - a.y); return Math.round(Math.hypot(o.x - a.x, o.y - a.y) / L * 100) / 100; });
      look(W.arch.x, (W.arch.y + W.start[0].y) / 2 + 6); return { wait, d, mid, len: Math.round(Math.hypot(W.start[0].x - W.couple[0].x, W.start[0].y - W.couple[0].y)) }; })()`,
      r => r.area === false ? 'no party area' : r.W === null ? 'no layout' : !r.wait.every(v => v != null && v < 1.5) ? 'couple not waiting at the far end ' + r.wait
        : r.d.length !== 2 ? 'couple not drawn ' + JSON.stringify(r.d) : !r.mid.every(m => m > 0.3 && m < 0.7) ? 'not half way at 17:56 ' + r.mid : !r.d.every(o => /^walk_/.test(o.row)) ? 'not walking ' + JSON.stringify(r.d) : null);
    // 3. 18:35 the party: the couple at the table (the cake between them), the others round the lawn; the arch stays up
    await shot('wedding_party', `(() => { ${setup} ${people} if (!area) return { area: false }; goTo(18 * 60 + 35); const W = f.partyLawn().wed;
      look(area.x + 2, area.y + 8); f.setRealT(140); f.render(); const plan = f.partyPlan();
      return { couple: ['kid0', 'sp_kid0'].map(k => plan[k] && plan[k].act + ':' + plan[k].seat), cer: !!f.wedCer(), arch: !!W, ...looks(), ...people() }; })()`,
      r => r.area === false ? 'no party area' : r.cer ? 'ceremony still on' : !r.arch ? 'no arch' : r.couple.join() !== 'eat:0,eat:1' ? 'couple not at the table ' + r.couple
        : r.kid !== 'groom' || r.mate !== 'bride' ? 'outfits off during the party' : r.gap < 6 ? 'overlap ' + r.gap : null);
    // 4. the album: 「孩子的婚礼」 is taken at 18:10, centred on the couple under the arch (opened large); the next morning they wear their own clothes
    await shot('wedding_album', `(() => { ${setup} if (!area) return { area: false }; const q = f.albumQueue && f.albumQueue(); goTo(18 * 60 + 12); for (let i = 0; i < 4; i++) f.render();
      const e = f.ALB.get(S.album, 'wedding'), W = f.wedCer(), ph = photos.find(p => p.id === 'wedding');
      const save = f.snapshot(), size = JSON.stringify(save).length, home = Object.keys(save.home).join(','), party = Object.keys(save.decor.party).join(',');
      return { q, e: e && [e.d, e.t, e.x, e.y, e.w.join('+')], arch: W && [W.couple[0].x, W.couple[0].y], photo: !!(ph && ph.url), title: ph && ph.title, sv: save.saveVersion, size, home, party }; })()`,
      r => r.area === false ? 'no party area' : !r.photo ? 'no photo ' + JSON.stringify(r.e) : r.e[1] < 18 * 60 + 2 || r.e[1] > 18 * 60 + 21 ? 'photo not during the vows ' + r.e[1]
        : !r.arch || Math.hypot(r.e[2] - r.arch[0], r.e[3] - r.arch[1]) > 3 ? 'photo not on the couple ' + r.e + ' / ' + r.arch : r.sv !== 15 ? 'saveVersion ' + r.sv : r.size > 64 * 1024 ? 'save ' + r.size
        : r.home !== 'houses,rel,nb,wed,help,teen,earn,path,wage' ? 'home keys ' + r.home : r.party !== 'last,at,tonight,guests' ? 'party keys ' + r.party : r.next ? r.next : null,
      { noZoom: true, after: async p => { await p.evaluate(() => PFAlbumUI.open('wedding')); await p.waitForTimeout(300);
        const big = await p.evaluate(() => { const el = document.getElementById('album'), im = el && el.querySelector('.big img'); return { text: el ? el.querySelector('.big') && el.querySelector('.big').textContent.slice(0, 80) : '', nat: im && im.naturalWidth }; });
        await p.screenshot({ path: path.join(OUT, 'wedding_album.png') });
        const next = await p.evaluate(() => { const f = __farm, S = f.S, d = S.day; PFAlbumUI.close && PFAlbumUI.close();
          for (let i = 0; i < 2000 && !(S.day === d + 1 && S.t % 1440 >= 8 * 60); i++) f.advance(1, 10);
          const k = S.members.find(m => m.id === 'kid0'), s = f.SPOUSES.find(x => x._spouse === 'kid0');
          return { moved: S.home.wed.kid0 && S.home.wed.kid0.moved, kid: f.wedLook(k), mate: s ? f.wedLook(s) : null, look: f.lookOf(k).join(':'), lawnWed: !!f.partyLawn().wed }; });
        return { big, nextDay: next, next: !/孩子的婚礼/.test(big.text) ? 'caption ' + big.text : !next.moved ? 'never moved in' : next.kid || next.mate ? 'still in wedding clothes ' + JSON.stringify(next) : next.lawnWed ? 'arch still up' : null }; }, noShot: true });
    // 5. two of the same: 小豆 marries 石头 (two grooms) - each in a suit, the second a different colour; nobody overlaps
    await shot('wedding_pair', `(() => { ${setup} ${people} if (!area) return { area: false }; goTo(18 * 60 + 10); const W = f.wedCer(); if (W) look(W.arch.x, W.arch.y + 6);
      return { ...looks(), sheets: [f.famSheet('groom', 3), f.famSheet('groom2', 3)].map(s => !!s), same: f.famSheet('groom', 3) === f.famSheet('groom2', 3), ...people() }; })()`,
      r => r.area === false ? 'no party area' : r.kid !== 'groom' || r.mate !== 'groom2' ? 'pair looks ' + r.kid + '/' + r.mate : !r.sheets.every(Boolean) || r.same ? 'groom2 sheet' : null, { mate: 'm2', noShot: !process.env.PF_ALL });
    // 6. opaque sprite pixels: the couple and up to 8 guests through the vows at five camera angles never cover one another
    //    (the couple stand close together on purpose and are counted as one)
    await shot('wedding_crowd', `(() => { ${setup} if (!area) return { area: false }; goTo(17 * 60 + 31);
      for (let i = 0; i < 4; i++) { const g = { id: 'stress' + i, look: i % 2 ? 'guestA' : 'guestB', x: area.x, y: area.y, pts: [], moving: false }; f.GUESTS.push(g); f.partySpot(g); }
      goTo(18 * 60 + 5); const W = f.wedCer(); if (!W) return { W: null }; const plan = f.partyPlan(), SPR = f.partySprite();
      const crowd = f.actors().concat(f.GUESTS, f.SPOUSES).filter(a => { const P = plan[a === f.FARMER ? 'farmer' : a.id]; return !!P; });
      for (const a of crowd) { const P = plan[a === f.FARMER ? 'farmer' : a.id]; Object.assign(a, { x: P.x, y: P.y, home: false, away: false, sleeping: false, moving: false, task: { kind: 'party', rest: true, to: P } }); if (a.pts) a.pts = []; }
      const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true }), masks = new Map();
      const mask = o => { const sh = o.sheet || SPR, fr = o.fr % (SPR.frames[o.row] || 4), src = o.flip ? sh.flip : sh.img, fx = o.flip ? SPR.img.width - (fr + 1) * SPR.fw : fr * SPR.fw, key = [src === sh.flip, fx, SPR.rows[o.row], sh === SPR ? 'base' : String(o.sheet && o.sheet.img && o.sheet.img.width) + o.partyKey].join(':');
        if (masks.has(key)) return masks.get(key); cv.width = SPR.fw; cv.height = SPR.fh; g.clearRect(0, 0, SPR.fw, SPR.fh); g.drawImage(src, fx, SPR.rows[o.row] * SPR.fh, SPR.fw, SPR.fh, 0, 0, SPR.fw, SPR.fh);
        const d = g.getImageData(0, 0, SPR.fw, SPR.fh).data, out = []; for (let y = 0; y < SPR.fh; y++) for (let x = 0; x < SPR.fw; x++) if (d[(y * SPR.fw + x) * 4 + 3] > 0) out.push([x, y]); masks.set(key, out); return out; };
      let overlap = 0, frames = 0, minDrawn = 99; const bad = [], who = k => (k === 'kid0' || k === 'sp_kid0') ? 'couple' : k;
      for (const angle of [-0.6, 0, 0.22, 0.25, 0.6]) { f.setAngle(angle);
        for (let i = 0; i < 24; i++) { f.setRealT(300 + i * 0.37); f.render(); frames++; const ds = f.partyDraw(); minDrawn = Math.min(minDrawn, ds.length); const occ = new Map();
          for (const o of ds) { const p = f.proj(o.x, o.y), x0 = Math.round(p[0]) - (o.flip ? SPR.fw - 1 - SPR.ax : SPR.ax), y0 = Math.round(p[1]) - SPR.ay - Math.round(o.z || 0);
            for (const [x, y] of mask(o)) { const k = (x0 + x) + ',' + (y0 + y), prev = occ.get(k); if (prev && prev !== who(o.partyKey)) { overlap++; if (bad.length < 8) bad.push([angle, i, prev, o.partyKey]); } else occ.set(k, who(o.partyKey)); } } } }
      f.setAngle(0.25); f.panTo(W.arch.x, W.arch.y + 12); f.setRealT(301); f.render();
      return { total: crowd.length, frames, minDrawn, overlap, bad, guests: W.guests.length }; })()`,
      r => r.area === false ? 'no party area' : r.W === null ? 'no layout' : r.minDrawn < Math.min(r.total, 8) ? 'skipped crowd ' + r.minDrawn + '/' + r.total : r.overlap ? 'opaque body overlap ' + JSON.stringify(r.bad) : null, { noShot: !process.env.PF_ALL });
  }
  if (net.length) fails.push('network: ' + net.slice(0, 3).join(' '));
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
