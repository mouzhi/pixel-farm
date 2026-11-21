// v5.11.0.11 相册: screenshots + browser checks.  node tools/album-shots.js [name-filter]   writes $PF_SHOTS/album_*.png
// A player asked for an album 「给关键画面留下影像……挂着挂着就错过了」. Checks: a live moment takes a photo (the real boot and
// noteProgress hooks) with a toast and no hitch beyond two renders; the grid shows photos by day and locked '???' frames with
// hints; a photo opens large with its caption; an old save gets its story so far as re-staged frames whose pictures are made
// on this device when the album opens; pictures stay out of the save (metadata < 1.5 KB) and survive a reload in their own
// localStorage key; the diary links to the day's photo; on a phone (小红书) the album is a tab of the diary sheet.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = process.env.PF_ROOT || path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null, VER = '5.11.0.15';
const readSave = f => { const s = JSON.parse(fs.readFileSync(f, 'utf8')); return s.save || s; };
const FIX = n => path.join(__dirname, 'fixtures', n);
// a bigger, later farm for the grid: a local real save when one is around (never committed), else the day-72 fixture
const LOCAL = process.env.PF_USER_SAVE || '/workspace/user-save-1120/pixel-farm-save.json';
const OLD = fs.existsSync(LOCAL) && !process.env.CI ? LOCAL : FIX('save-v15-day72-cottage.json');
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.albumView && window.PFAlbumUI && window.PFDiaryUI, null, { timeout: 30000 });
  async function page(save, vp, keepStore) { const ctx = await b.newContext({ viewport: vp || { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await ready(p);
    if (save) { save = Object.assign({}, save, { savedAt: Date.now() });
      await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(p); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  const shot = async (name, vp, save, run, check) => { name = 'album_' + name; if (only && !name.includes(only)) return;
    const p = await page(save, vp); let r; try { r = await run(p); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check(r); console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const renderMs = p => p.evaluate(() => { const f = __farm; f.render(); const t0 = performance.now(); for (let i = 0; i < 12; i++) f.render(); return (performance.now() - t0) / 12; });

  // 1. a new farm: the boot hook takes 「农场开张」 half an hour in; the noteProgress hook takes 「第一只小动物」 where the farmer is.
  //    Toast shown; the capture costs at most a couple of renders; the main view is put back exactly (no flicker frame).
  await shot('toast.png', null, null, async p => {
    const r = await p.evaluate(() => { const f = __farm, S = f.S;
      const q0 = f.albumQueue(); for (let i = 0; i < 80 && f.albumQueue(); i++) f.advance(1, 10);
      const open = f.ALB.get(S.album, 'open'), v = f.albumView();
      return { ver: document.getElementById('titleS').textContent, q0, open: open && f.ALB.pack({ list: [open] })[0], url: !!(v.shots[0] && v.shots[0].url), ms: f.albumMs() }; });
    r.render = await renderMs(p);
    // the camera somewhere else: the photo is taken off screen and the view comes back pixel for pixel
    Object.assign(r, await p.evaluate(() => { const f = __farm, S = f.S; f.panTo(150, 60); f.render();
      const g = document.getElementById('game'), px = () => g.getContext('2d').getImageData(0, 0, g.width, g.height).data, a = px();
      f.S.up.chicken = 1; f.applyUpgrades(); f.FARMER.home = false; f.FARMER.x = 40; f.FARMER.y = 104; f.noteProgress(); f.render();
      const e = f.ALB.get(S.album, 'animal'), b2 = px(); let diff = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b2[i] || a[i + 1] !== b2[i + 1] || a[i + 2] !== b2[i + 2]) diff++;
      const t = document.getElementById('albumToast');
      return { animal: e && [e.x, e.y, e.t >= 0], ms2: f.albumMs(), diffPx: diff, toast: t && !t.hidden ? t.textContent : null, diary: (S.diary.days.slice(-1)[0] || {}).ev }; }));
    await p.waitForTimeout(150); return r; },
    r => r.ver.indexOf(VER) < 0 ? 'ver ' + r.ver : !r.q0 ? 'boot hook queued nothing' : !r.open || !/^open\|1\|\d+\|/.test(r.open) ? 'open ' + r.open : !r.url ? 'no picture'
      : !r.animal || !r.animal[2] ? 'animal ' + JSON.stringify(r.animal) : Math.abs(r.animal[0] - 40) > 1 ? 'not where the farmer is' : !/存进相册/.test(r.toast || '') || !/小动物/.test(r.toast) ? 'toast ' + r.toast
      : r.ms2 > Math.max(60, r.render * 4) ? `capture ${r.ms2.toFixed(1)}ms vs render ${r.render.toFixed(1)}ms` : r.diffPx > 1500 ? 'view not restored ' + r.diffPx : !(r.diary || []).includes('photo:animal') ? 'diary ' + r.diary : null);

  // 2. an old save from before the album: its story so far comes in as re-staged frames (silent, no toast), the album re-stages
  //    the pictures when opened; locked frames show '???' with a hint. The metadata is tiny; no picture goes in the save.
  await shot('grid.png', null, readSave(OLD), async p => {
    const r = await p.evaluate(() => { const f = __farm, S = f.S, snap = f.snapshot(); const t = document.getElementById('albumToast');
      return { day: S.day, sv: snap.saveVersion, n: S.album.list.length, re: S.album.list.every(e => e.t === -1), bytes: JSON.stringify(snap.album).length, img: /data:image/.test(JSON.stringify(snap)), toast: !!(t && !t.hidden) }; });
    await p.evaluate(() => { __farm.panTo(60, 60); __farm.render(); }); await p.click('#albumBtn');
    await p.waitForFunction(() => __farm.albumView().shots.every(s => s.url), null, { timeout: 30000 }); await p.waitForTimeout(200);
    Object.assign(r, await p.evaluate(() => { const el = document.getElementById('album'), rc = el.getBoundingClientRect();
      return { shown: !el.hidden, pics: el.querySelectorAll('.pol img.pic').length, locked: el.querySelectorAll('.pol.lock').length, tags: el.querySelectorAll('.tag').length, right: Math.round(rc.right), vw: innerWidth, head: el.querySelector('.shead').textContent }; }));
    return r; },
    r => r.sv !== 15 ? 'saveVersion ' + r.sv : r.n < 4 ? 'backfilled ' + r.n : !r.re ? 'backfill not marked re-staged' : r.bytes > 1500 ? 'album bytes ' + r.bytes : r.img ? 'picture in the save' : r.toast ? 'toast for a backfill'
      : !r.shown ? 'panel hidden' : r.pics !== r.n ? 'pictures ' + r.pics + '/' + r.n : !r.locked ? 'no locked frames' : r.right > r.vw ? 'off screen' : null);

  // 3. a live photo opened large: a classmate walks home with the child (the hook's call, on the day-72 farm, the child out)
  const save72 = readSave(FIX('save-v15-day72-cottage.json'));
  await shot('big.png', null, save72, async p => {
    const r = await p.evaluate(() => { const f = __farm, S = f.S; for (let i = 0; i < 400 && S.t % 1440 < 15 * 60 + 30; i++) f.advance(1, 10);
      const k = S.members.find(m => /^kid/.test(m.id)) || S.members[0]; if (!k) return { error: 'no kid' };
      Object.assign(k, { home: false, away: null, sleeping: false, x: 60, y: 60 }); f.panTo(300, 40); f.render();
      f.albumSnap('classmate', 60, 60, { wait: 0, follow: k.id }); f.render(); const e = f.ALB.get(S.album, 'classmate'); return { e: e && f.ALB.pack({ list: [e] })[0], kid: k.id }; });
    await p.evaluate(() => { __farm.panTo(60, 60); __farm.render(); }); await p.click('#albumBtn'); await p.waitForTimeout(200);
    await p.click('#album .pol[data-id="classmate"]'); await p.waitForTimeout(200);
    r.big = await p.evaluate(() => { const el = document.getElementById('album'), img = el.querySelector('.big img.pic'); return { text: el.querySelector('.big').textContent.slice(0, 120), w: img && img.getBoundingClientRect().width, nat: img && img.naturalWidth }; });
    return r; },
    r => !r.e || !/^classmate\|72\|\d+\|60\|60\|/.test(r.e) ? 'meta ' + r.e : !r.e.includes(r.kid) ? 'kid not in the picture list' : !/第一次带同学回家/.test(r.big.text) ? 'caption ' + r.big.text : r.big.nat !== 160 || r.big.w !== 320 ? 'size ' + r.big.w + '/' + r.big.nat : null);

  // 4. a re-staged photo opened large (the picture made on this device from the metadata; marked 补拍)
  await shot('restaged.png', null, readSave(OLD), async p => {
    const id = await p.evaluate(() => { const L = __farm.S.album.list; return (L.find(e => e.id === 'moved') || L.find(e => e.id === 'born0') || L[L.length - 1]).id; });
    await p.evaluate(() => { __farm.panTo(60, 60); __farm.render(); });
    await p.evaluate(id => PFAlbumUI.open(id), id); await p.waitForFunction(id => { const s = __farm.albumView().shots.find(x => x.id === id); return s && s.url; }, id, { timeout: 30000 });
    await p.evaluate(id => PFAlbumUI.open(id), id); await p.waitForTimeout(200);
    return p.evaluate(id => { const el = document.getElementById('album'); return { id, text: el.querySelector('.big').textContent.slice(0, 160), restaged: __farm.albumView().shots.find(x => x.id === id).restaged }; }, id); },
    r => !/补拍/.test(r.text) ? 'no 补拍 mark' : !r.restaged ? 'not re-staged' : null);

  // 5. reload: the pictures come back from their own localStorage key, the metadata from the save; nothing re-staged twice
  await shot('reload.png', null, null, async p => {
    await p.evaluate(() => { const f = __farm; for (let i = 0; i < 80 && f.albumQueue(); i++) f.advance(1, 10); f.SAVE.off = false; f.saveNow(); f.SAVE.off = true; });
    const before = await p.evaluate(() => { const f = __farm; return { meta: f.ALB.pack(f.S.album), url: f.albumView().shots[0].url, keys: Object.keys(localStorage).filter(k => /album/.test(k)), save: localStorage.getItem('mouzhi/pixel-farm:save').length }; });
    await p.reload(); await ready(p); await p.evaluate(() => { __farm.SAVE.off = true; });
    const after = await p.evaluate(() => { const f = __farm; return { meta: f.ALB.pack(f.S.album), url: f.albumView().shots[0].url, restaged: f.albumView().shots[0].restaged }; });
    await p.click('#albumBtn'); await p.waitForTimeout(200);
    return { before: before.meta, after: after.meta, same: before.url === after.url && !!after.url, restaged: after.restaged, keys: before.keys, saveImg: false }; },
    r => JSON.stringify(r.before) !== JSON.stringify(r.after) ? 'meta changed' : !r.same ? 'picture lost on reload' : r.restaged ? 'live photo marked re-staged' : r.keys.length !== 1 ? 'keys ' + r.keys : null);

  // 6. the diary links to the day's photo, and the link opens it in the album tab
  await shot('diary_link.png', null, null, async p => {
    await p.evaluate(() => { const f = __farm; for (let i = 0; i < 80 && f.albumQueue(); i++) f.advance(1, 10); f.panTo(60, 60); f.render(); });
    await p.click('#diaryBtn'); await p.waitForTimeout(200); const link = await p.evaluate(() => { const b = document.querySelector('#diary [data-photo]'); return b && b.textContent; });
    const shot1 = path.join(OUT, 'album_diary_link_before.png'); await p.screenshot({ path: shot1 });
    await p.click('#diary [data-photo]'); await p.waitForTimeout(250);
    return { link, big: await p.evaluate(() => { const el = document.getElementById('diary'), b = el.querySelector('.big'); return { shown: !el.hidden, text: b && b.textContent.slice(0, 80) }; }) }; },
    r => !/农场开张/.test(r.link || '') ? 'link ' + r.link : !r.big.shown || !/农场开张/.test(r.big.text || '') ? 'album tab ' + JSON.stringify(r.big) : null);

  // 7. a phone (the 小红书 version hides the web buttons): the album is a tab of the diary sheet, two columns, big touch targets
  await shot('xhs.png', { width: 390, height: 844 }, readSave(OLD), async p => {
    await p.evaluate(() => { document.documentElement.classList.add('xhs-mobile'); __farm.panTo(60, 60); __farm.render(); PFDiaryUI.open(); }); await p.waitForTimeout(150); // the 小红书 shell's class
    await p.click('#diary [data-a="album"]'); await p.waitForFunction(() => __farm.albumView().shots.every(s => s.url), null, { timeout: 30000 }); await p.waitForTimeout(250);
    return p.evaluate(() => { const el = document.getElementById('diary'), rc = el.getBoundingClientRect(), pols = [...el.querySelectorAll('.pol')].slice(0, 2).map(x => x.getBoundingClientRect());
      return { shown: !el.hidden, album: !!el.querySelector('.grid'), cols: pols.length === 2 && Math.abs(pols[0].top - pols[1].top) < 6 ? 2 : 1, w: Math.round(rc.width), right: Math.round(rc.right), vw: innerWidth, tab: !!el.querySelector('[data-a="diary"]'), webBtn: !!document.getElementById('albumBtn').offsetParent, tap: Math.round(pols[0] ? pols[0].height : 0) }; }); },
    r => !r.shown || !r.album ? 'no album in the diary sheet' : r.cols !== 2 ? 'columns ' + r.cols : r.right > r.vw ? 'off screen' : !r.tab ? 'no way back to the diary' : r.webBtn ? 'web 相册 button shown on the phone' : r.tap < 44 ? 'tap target ' + r.tap : null);

  // 8. review (1): a built market square is not a market trip. Day 66 the square is built, day 70 is a market day with nothing sold,
  //    day 72 reload: no 「第一次赶集」 may be backfilled. And a real sale replaces a re-staged (补拍) frame of the same moment.
  await shot('review_market.png', null, save72, async p => {
    const save = await p.evaluate(() => { const f = __farm, S = f.S, H = S.town.hall; S.up.town = 1; f.applyUpgrades();
      H.built = Object.assign({}, H.built, { market: S.day - 6 }); H.market = f.MK.empty(); f.ALB.remove && f.ALB.remove(S.album, 'market'); return f.snapshot(); });
    await p.evaluate(s => { localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(Object.assign(s, { savedAt: Date.now() }))); }, save); await p.reload(); await ready(p);
    const r = await p.evaluate(() => { const f = __farm, S = f.S; f.SAVE.off = true; const H = S.town.hall;
      return { day: S.day, open: f.ALB ? !!(S.eff && S.eff.town) : null, built: H.built.market, marketDay: f.MK.isDay(H, 70), sold: H.market.days, backfilled: f.ALB.pack({ list: S.album.list.filter(e => e.id === 'market') }) }; });
    Object.assign(r, await p.evaluate(() => { const f = __farm, S = f.S; // an older build's re-staged frame, then the real first sale (the hook's call)
      if (!f.ALB.has(S.album, 'market')) f.ALB.add(S.album, { id: 'market', d: 70, t: -1, x: 650, y: 120, w: ['farmer'] });
      f.panTo(650, 120); f.render(); const got = f.albumSnap('market', 650, 120, { wait: 0 }); f.render(); const e = f.ALB.get(S.album, 'market'), v = f.albumView().shots.find(x => x.id === 'market');
      return { replaced: !!got, after: e && [e.d, e.t >= 0], live: !!(v && v.url && !v.restaged) }; }));
    return r; },
    r => !r.open || r.built !== r.day - 6 || !r.marketDay || r.sold ? 'setup ' + JSON.stringify(r) : r.backfilled.length ? 'backfilled without a sale: ' + r.backfilled : !r.replaced || !r.after || r.after[0] !== r.day || !r.after[1] || !r.live ? 'real sale blocked ' + JSON.stringify(r) : null);

  // 9. review (2): save + reload while a photo is still waiting (people walking out of the door): it is still taken afterwards
  await shot('review_pending.png', null, null, async p => {
    const r = { before: await p.evaluate(() => { const f = __farm; f.SAVE.off = false; f.saveNow(); return { q: f.albumQueue(), meta: f.ALB.pack(f.S.album) }; }) };
    await p.reload(); await ready(p);
    r.reloaded = await p.evaluate(() => { const f = __farm; f.SAVE.off = true; return { q: f.albumQueue(), meta: f.ALB.pack(f.S.album) }; });
    r.after = await p.evaluate(() => { const f = __farm; for (let i = 0; i < 120 && f.albumQueue(); i++) f.advance(1, 10); const v = f.albumView().shots.find(x => x.id === 'open');
      return { q: f.albumQueue(), url: !!(v && v.url), restaged: !!(v && v.restaged), meta: f.ALB.pack(f.S.album) }; });
    return r; },
    r => !r.before.q ? 'nothing pending to begin with' : !r.reloaded.q ? 'pending capture lost on reload ' + JSON.stringify(r.reloaded) : r.after.q || !r.after.url ? 'not taken after reload' : r.after.restaged ? 'came back as 补拍' : /\|.*\|.*\|.*\|.*\|.*\|/.test(r.after.meta[0]) ? 'pending field left behind ' + r.after.meta : null);
  // ... and the same for a wedding announced in the morning and shot in the evening (re-placed at the spot when it fires)
  await shot('review_pending_wedding.png', null, save72, async p => {
    await p.evaluate(() => { const f = __farm; f.albumSnap('wedding', null, null, { wait: 40, re: true }); f.SAVE.off = false; f.saveNow(); });
    await p.reload(); await ready(p);
    return p.evaluate(() => { const f = __farm; f.SAVE.off = true; const q = f.albumQueue(); for (let i = 0; i < 120 && f.albumQueue(); i++) f.advance(1, 10);
      const v = f.albumView().shots.find(x => x.id === 'wedding'); return { q, left: f.albumQueue(), url: !!(v && v.url), restaged: !!(v && v.restaged) }; }); },
    r => !r.q ? 'pending capture lost on reload' : r.left || !r.url ? 'not taken' : r.restaged ? 'came back as 补拍' : null);

  // 10. canvas-fill (v5.11.0.5.2): a small, zoomed-in framebuffer still gives a full 160×110 photo
  await shot('small_view.png', { width: 520, height: 360 }, null, async p => {
    for (let i = 0; i < 3; i++) { await p.mouse.move(260, 200); await p.mouse.wheel(0, -100); await p.waitForTimeout(60); } // zoom in 3 steps: a 130×90 framebuffer
    return p.evaluate(async () => { const f = __farm; const W0 = document.getElementById('game').width, H0 = document.getElementById('game').height;
      f.panTo(400, 40); f.render(); const e = f.albumSnap('fish', 40, 104, { wait: 0 }); f.render(); const v = f.albumView().shots.find(x => x.id === 'fish');
      const img = new Image(); img.src = v.url; await img.decode(); const c = document.createElement('canvas'); c.width = 160; c.height = 110; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, 160, 110).data; let blank = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) blank++;
      return { fb: [W0, H0], after: [document.getElementById('game').width, document.getElementById('game').height], w: img.width, h: img.height, blank }; }); },
    r => r.fb[0] >= 160 && r.fb[1] >= 110 ? 'framebuffer not small ' + r.fb : r.w !== 160 || r.h !== 110 ? 'size' : r.blank > 0 ? 'blank pixels ' + r.blank : r.after[0] !== r.fb[0] || r.after[1] !== r.fb[1] ? 'framebuffer not restored' : null);

  // 11. v5.11.0.9 bigger buildings: every place's frame on the farm-stay save, as one contact sheet (album_frames.png). The
  //     diner and the kids' cottage got taller: their roofs must stay in the 160×110 frame (album_frames_sheet.png shows them all)
  const sheet = async (p, ids) => p.evaluate(async ids => { const f = __farm, c = document.createElement('canvas'); c.width = 6 * 164; c.height = Math.ceil(ids.length / 6) * 126;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.font = '11px sans-serif'; const out = {};
    for (let i = 0; i < ids.length; i++) { const P = f.albumPlace(ids[i]), u = f.albumShot(P.x, P.y, { who: ['farmer'], t: 630 }); if (!u) { out[ids[i]] = null; continue; }
      const im = new Image(); im.src = u; await im.decode(); const X = (i % 6) * 164 + 2, Y = ((i / 6) | 0) * 126 + 14; g.drawImage(im, X, Y); g.fillStyle = '#000'; g.fillText(ids[i] + ' ' + Math.round(P.x) + ',' + Math.round(P.y), X, Y - 3);
      const d = g.getImageData(X, Y, 160, 110).data; let lum = 0, sq = 0; for (let k = 0; k < d.length; k += 4) { const l = (d[k] + d[k + 1] + d[k + 2]) / 3; lum += l; sq += l * l; } const n = d.length / 4;
      out[ids[i]] = { lum: Math.round(lum / n), sd: Math.round(Math.sqrt(sq / n - (lum / n) ** 2)) }; }
    return { url: c.toDataURL(), out }; }, ids);
  await shot('frames.png', null, readSave(FIX('save-v15-inn-resort.json')), async p => {
    const r = await sheet(p, ['door', 'house', 'porch', 'barn', 'pond', 'stall', 'meadow', 'field', 'gate', 'school', 'plaza', 'track', 'feast', 'inn', 'newhouse']);
    fs.writeFileSync(path.join(OUT, 'album_frames_sheet.png'), Buffer.from(r.url.split(',')[1], 'base64'));
    // the diner's roof: the photo's top 12 rows over the diner hold roof / sky-line pixels, not only the plain grass of the frame below
    r.inn = await p.evaluate(async () => { const f = __farm, P = f.albumPlace('inn'), u = f.albumShot(P.x, P.y, { who: [], t: 630 }), im = new Image(); im.src = u; await im.decode();
      const c = document.createElement('canvas'); c.width = 160; c.height = 110; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const row = y => { const d = g.getImageData(40, y, 80, 1).data; let red = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > d[k + 1] + 30 && d[k] > 110) red++; return red; };
      let first = -1; for (let y = 0; y < 110; y++) if (row(y) > 6) { first = y; break; } return { P, roofTop: first }; });
    delete r.url; return r; },
    r => Object.entries(r.out).filter(([, v]) => !v || v.sd < 12).map(([k]) => k).join() ? 'flat / missing frames ' + JSON.stringify(r.out) : r.inn.roofTop <= 0 ? 'diner roof cut at the top (first roof row ' + r.inn.roofTop + ')' : null);

  // 12. fog (v5.11.0.6; v5.11.0.13 opaque cloud): 「镇门打开」 is due the moment the gate opens, while the town's cloud is still rolling
  //     back; the photo waits for the reveal (its cost never lands on a reveal frame) and shows the town open. No photo ever shows
  //     the cloud (the 农家乐区 beside the gate is still clouded): two shots under different cloud drift are identical.
  await shot('towngate_fog.png', null, save72, async p => p.evaluate(async () => { const f = __farm, S = f.S; S.coins = 1e8; f.FARMER.wood = 1e4;
    f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); f.render(); await new Promise(z => setTimeout(z, 2000)); f.render(); // the road's own reveal first
    f.ALB.remove(S.album, 'towngate'); f.panTo(f.albumPlace('gate').x, f.albumPlace('gate').y); f.render();
    const P = f.albumPlace('gate');
    const r = f.buy('town'); f.render(); const held = f.fog().fading && !f.albumView().shots.some(x => x.id === 'towngate' && x.url); // not under the reveal
    for (let i = 0; i < 40 && f.albumQueue(); i++) f.advance(0.1, 10); const v = f.albumView().shots.find(x => x.id === 'towngate'); if (!r.ok || !v || !v.url) return { error: 'buy ' + JSON.stringify(r) + ' photo ' + !!(v && v.url) };
    const fading = f.fog().fading, town = f.fogAlpha(P.x + 30, P.y), near = []; for (let dy = -30; dy <= 30; dy += 6) for (let dx = -60; dx <= 60; dx += 6) if (f.fogAlpha(P.x + dx, P.y + dy) >= 1) near.push([dx, dy]);
    f.fogClock(1); const a = f.albumShot(P.x, P.y, { who: ['farmer'], t: 630 }); f.fogClock(9.5); const b2 = f.albumShot(P.x, P.y, { who: ['farmer'], t: 630 }); f.fogClock(null);
    // and the cut-out path (the spot on screen): the same picture
    f.panTo(P.x, P.y); f.render(); f.fogClock(4); const c = f.albumShot(P.x, P.y, null); f.fogClock(8); f.render(); const c2 = f.albumShot(P.x, P.y, null); f.fogClock(null);
    return { held, fading, town, cloudNear: near.length, same: a === b2, cut: !!c && c === c2, shut: f.fog().shut }; }),
    r => !r.held ? 'photo taken while the cloud was still rolling back' : r.fading ? 'still revealing after the photo' : r.town ? 'the town is still clouded ' + r.town
      : !r.same ? 'the photo shows the drifting cloud' : !r.cut ? 'the on-screen photo shows the drifting cloud' : null);

  await b.close(); server.close();
  const real = errs.filter(e => !/favicon|404/.test(e)); if (real.length) { console.log('page errors:', real.slice(0, 5)); fails.push('page errors'); }
  if (fails.length) { console.log('FAILED:', fails.join(' | ')); process.exit(1); } console.log('album-shots: all ok');
})();
