// 小红书小工具 1.3.0（同步网页版 v5.11.0.29）：手机截图 + 检查，跑在打好的包上（390×844 @3x，真触摸事件）。
//   bash platforms/xhs/pack.sh && node tools/xhs130-shots.js [name-filter]   writes /workspace/pf-shots/xhs130_*.png (PF_SHOTS / PF_TAG)
// Checks the v5.11 features on the phone layout: 活动倒计时 in the HUD (tap opens the list), the hotbar in the 背包 dock, 相册 as a tab of the
// diary (no new bottom-bar button; the photo toast opens it), the restaurant panel, the opaque cloud over locked districts, the party spread,
// the codex still in the trophy sheet, no web 存档 button anywhere, ⚒ toolbox, version 5.11.0.29 / save v15, and the compact save under 64KB (also on a heavy late-game farm: every plot and shop level, machines, bakery.held).
// Never loads a real player's save (fixtures only).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'xhs130_';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('no platforms/xhs/dist: run bash platforms/xhs/pack.sh first'); process.exit(1); }
const server = http.createServer((req, res) => { const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const VER = (fs.readFileSync(path.join(DIST, 'game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const APPV = JSON.parse(fs.readFileSync(path.join(__dirname, '../platforms/xhs/project.json'), 'utf8')).version;
const fix = n => (s => s.save || s)(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8')));
const FIX = fix('save-v15-day72-cottage.json'), RESORT = fix('save-v15-inn-resort.json');
fs.mkdirSync(OUT, { recursive: true });
const MOCK = seed => `(() => { const mem = Object.assign({}, ${JSON.stringify(seed)}); const ok = v => Promise.resolve(v);
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: {
    getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); }, removeStorage: a => { delete mem[a.key]; return ok({}); },
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }),
    getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }), submitScore: () => ok({}), getRankList: () => ok({ data: [] }), getMyRank: () => ok({ rank: 1, score: 1, status: 'EXACT' }),
    getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({ follow_status: 1 }), share: () => ok({}), vibrateShort: () => ok({}) } }; })();`;
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save, query) { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 discover/9.53.3 XHS' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(MOCK(save ? { 'mouzhi/pixel-farm:save': JSON.stringify(Object.assign({}, save, { savedAt: Date.now() })) } : {})); await p.goto(base + '/index.html' + (query || ''));
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && document.getElementById('xhs-bar'), null, { timeout: 30000 });
    await p.waitForTimeout(800);
    await p.evaluate(() => { const f = __farm; f.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; if (f.S.weather) f.S.weather.rained = false; });
    p.cdp = await ctx.newCDPSession(p); return p; }
  const touch = async (p, pts, hold) => { await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] }); if (hold) await p.waitForTimeout(hold);
    for (const q of pts.slice(1)) await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(200); };
  const tapEl = async (p, sel) => { const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel);
    if (!r) throw new Error('no ' + sel); await touch(p, [[r.x, r.y]]); return r; };
  const H = `const f = __farm, S = f.S; const vis = e => { e = typeof e === 'string' ? document.querySelector(e) : e; if (!e || e.hidden) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; };
    const box = e => { e = typeof e === 'string' ? document.querySelector(e) : e; const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom].map(Math.round); };
    const inside = e => { const q = box(e); return q[0] >= -1 && q[1] >= -1 && q[2] <= innerWidth + 1 && q[3] <= innerHeight + 1; };
    const saveBtns = () => [...document.querySelectorAll('button, .pbtn')].filter(e => vis(e) && /存档|保存进度|导出|导入/.test(e.textContent + ' ' + (e.title || ''))).map(e => e.id || e.textContent.trim());
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; }; const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };`;
  // the album photo toast and the #xhs-toast line (achievements, log) both sit under the HUD: their text boxes (plus the toast's glow) never intersect
  const TOASTS = `(() => { const vis = e => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
    const a = document.getElementById('albumToast'), t = document.getElementById('xhs-toast'), tx = t && t.querySelector('.xhs-toast-text');
    const photo = vis(a) && !a.classList.contains('out'), msg = vis(t) && t.classList.contains('show') && !!(tx && tx.textContent);
    const A = photo ? a.getBoundingClientRect() : null, T = msg ? tx.getBoundingClientRect() : null;
    const overlap = !!(A && T && A.left < T.right && T.left < A.right && A.top < T.bottom + 8 && T.top - 8 < A.bottom);
    return { photo, msg, text: msg ? tx.textContent : '', gap: A && T ? Math.round(T.top - A.bottom) : null, overlap, inside: !T || T.bottom < innerHeight }; })()`;
  const toastBad = r => r.overlap ? 'toasts overlap: ' + JSON.stringify(r) : !r.inside ? 'toast off screen' : null;
  const step = async (p, name, fn, check) => { name = TAG + name; if (only && !name.includes(only)) return null; let r; try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300); if (!(r && r._shot === false)) await p.screenshot({ path: path.join(OUT, name) }); if (r) delete r._shot; const bad = r && r.error ? r.error : check(r);
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700)); if (bad) fails.push(name + ': ' + bad); return r; };

  // A. day-72 fixture: home, countdown, hotbar, diary → 相册, photo toast, trophy codex, toolbox, fog
  { const p = await page(FIX);
    await step(p, 'home.png', () => p.evaluate(`(() => { ${H} f.setAngle(0); f.panTo(f.HOUSE.x + 30, f.HOUSE.y + 50); f.render();
      const snap = f.snapshot(), json = JSON.stringify(window.PFSave.compact(snap));
      return { ver: f.version, sv: snap.saveVersion, bytes: new Blob([json]).size, bar: vis('#xhs-bar'), hud: vis('#hud'), cd: vis('#countdown'), cdText: (document.getElementById('countdown') || {}).textContent,
        web: ['navBtns', 'menuBtn', 'albumBtn', 'diaryBtn', 'codexBtn', 'mmJump', 'mapBtn', 'title', 'titleS'].filter(id => vis('#' + id)), saveBtns: saveBtns(), hudIn: inside('#hud') }; })()`),
      r => r.ver !== '5.11.0.29' ? 'game version ' + r.ver : r.sv !== 15 ? 'save v' + r.sv : r.bytes >= 65536 ? 'compact save ' + r.bytes + ' >= 64KB' : !r.bar || !r.hud || !r.hudIn ? 'chrome missing' : r.web.length ? 'web chrome showing: ' + r.web : r.saveBtns.length ? 'a save button: ' + r.saveBtns : null);
    await step(p, 'hotbar.png', async () => { await touch(p, [[200, 500]]); await tapEl(p, '#xhs-btn-bag'); await p.waitForTimeout(300);
      return p.evaluate(`(() => { ${H} const s = [...document.querySelectorAll('#inv .slot')].filter(vis); return { dock: vis('#xhs-inv-dock'), slots: s.length, min: Math.min(...s.map(e => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))), off: s.filter(e => !inside(e)).length, inv: inside('#inv') }; })()`); },
      r => !r.dock || !r.slots ? 'bag dock empty' : r.min < 40 ? 'slots ' + r.min + 'px' : r.off || !r.inv ? r.off + ' slots off screen' : null);
    await step(p, 'album.png', async () => { await tapEl(p, '#xhs-btn-bag'); await tapEl(p, '#xhs-btn-diary'); await p.waitForTimeout(300); await tapEl(p, '#diary [data-a="album"]');
      await p.waitForFunction(() => { const d = document.getElementById('diary'); return d && d.querySelector('.alb .grid, .grid') && !d.querySelector('.pic.wait'); }, null, { timeout: 15000 }).catch(() => {});
      return p.evaluate(`(() => { ${H} const d = document.getElementById('diary'), pols = [...d.querySelectorAll('.pol')]; return { open: vis(d), album: d.classList.contains('alb') && !!d.querySelector('.grid'), photos: d.querySelectorAll('.pol[data-id]').length, imgs: d.querySelectorAll('img.pic').length,
        locked: d.querySelectorAll('.pol.lock').length, inside: inside(d), wide: Math.max(0, ...pols.map(e => box(e)[2])) <= innerWidth, barOk: box(d)[3] <= box('#xhs-bar')[1] + 1, bottomIcons: document.querySelectorAll('#xhs-bar .xhs-ico').length }; })()`); },
      r => !r.open || !r.album ? 'album tab did not open in the diary' : !r.photos || r.imgs < r.photos ? 'photos ' + r.imgs + '/' + r.photos : !r.locked ? 'no locked frames' : !r.inside || !r.wide || !r.barOk ? 'album off screen' : r.bottomIcons !== 7 ? 'bottom bar has ' + r.bottomIcons + ' icons (album must not add one)' : null);
    await step(p, 'album_photo.png', async () => { await tapEl(p, '#diary .pol[data-id]'); await p.waitForTimeout(300);
      return p.evaluate(`(() => { ${H} const d = document.getElementById('diary'), big = d.querySelector('.big'); return { big: !!big && vis(big), img: !!d.querySelector('.big img.pic'), cap: big ? big.querySelector('.cap').textContent : '', inside: big ? inside(big) : false, btn: Math.min(...[...d.querySelectorAll('.big .pbtn')].map(e => e.getBoundingClientRect().height)) }; })()`); },
      r => !r.big || !r.img ? 'no big photo' : !r.inside ? 'photo off screen' : r.btn < 34 ? 'small buttons ' + r.btn : null);
    await step(p, 'album_toast.png', async () => { await tapEl(p, '#xhs-btn-diary'); await p.waitForTimeout(200);
      await p.evaluate(() => { const v = __farm.albumView(), s = v.shots[0]; dispatchEvent(new CustomEvent('pf:album', { detail: { id: s.id, title: s.title, url: s.url } })); }); await p.waitForTimeout(400);
      const t = await p.evaluate(`(() => { ${H} const t = document.getElementById('albumToast'); return { shown: vis(t), inside: inside(t), belowHud: box(t)[1] >= box('#hud')[3] - 2 || box(t)[3] <= box('#hud')[1] }; })()`);
      await p.screenshot({ path: path.join(OUT, TAG + 'album_toast.png') }); await tapEl(p, '#albumToast'); await p.waitForTimeout(300);
      t.opened = await p.evaluate(() => { const d = document.getElementById('diary'); return !d.hidden && !!d.querySelector('.big'); }); t._shot = false; return t; },
      r => !r.shown ? 'no toast' : !r.inside || !r.belowHud ? 'toast covers the HUD / off screen' : !r.opened ? 'tapping the toast did not open the photo' : null);
    await step(p, 'trophy_codex.png', async () => { await tapEl(p, '#xhs-btn-diary'); await tapEl(p, '#xhs-btn-board'); await p.waitForTimeout(300); await tapEl(p, '#xhs-board [data-sec="book"]'); await p.waitForTimeout(300);
      return p.evaluate(`(() => { ${H} const c = document.getElementById('codex'); return { board: vis('#xhs-board'), hosted: !!(c && c.closest('#xhs-board')) && vis(c), tabs: [...document.querySelectorAll('#xhs-board .xhs-board-sections .pbtn')].map(e => e.textContent), saveBtns: saveBtns() }; })()`); },
      r => !r.board || !r.hosted ? 'codex not inside the trophy sheet' : !r.tabs.includes('图鉴') ? 'tabs ' + r.tabs : r.saveBtns.length ? 'a save button: ' + r.saveBtns : null);
    await step(p, 'toolbox.png', async () => { await tapEl(p, '#xhs-btn-board'); await p.waitForTimeout(200); await tapEl(p, '#pt-box'); await p.waitForTimeout(300);
      return p.evaluate(`(() => { ${H} return { sheet: vis('#pt-sheet'), tiles: [...document.querySelectorAll('#pt-sheet .grid button')].map(e => e.textContent.replace(/\\s+/g, ' ').trim()), inside: inside('#pt-sheet') }; })()`); },
      r => !r.sheet || !r.tiles.length || !r.inside ? 'toolbox ' + JSON.stringify(r) : null);
    await step(p, 'jump_town.png', async () => { await tapEl(p, '#pt-sheet .go [data-g="2"]'); await p.waitForTimeout(300);
      return p.evaluate(`(() => { ${H} return { sheet: vis('#pt-sheet'), follow: !!PFPlatform.followFarmer, cloud: f.fog().locked.town, bar: vis('#xhs-bar') }; })()`); },
      r => r.sheet ? 'jump did not close the sheet' : r.follow ? 'jump still following the farmer' : !r.cloud || !r.bar ? 'no cloud or bar' : null);
    await step(p, 'fog.png', async () => { await p.waitForTimeout(200);
      return p.evaluate(`(() => { ${H} PFPlatform.setFollow && PFPlatform.setFollow(false); const z = f.FG && f.FG.ZONES.find(z => f.fogAlpha(z.label.x, z.label.y + 14) >= 1 || f.fogAlpha(z.label.x, z.label.y) > 0.5); if (!z) return { zone: null, fog: f.fog() };
        f.setAngle(0); f.panTo(z.label.x, z.label.y + 10); f.advance(0.3, 10); f.render(); return { zone: z.id || z.name || true, a: f.fogAlpha(z.label.x, z.label.y + 14), fog: f.fog() }; })()`); },
      r => !r.zone ? 'no locked district under cloud on the day-72 farm ' + JSON.stringify(r.fog).slice(0, 200) : null);
    await p.context().close(); }

  // C. the inn + resort fixture (town hall open, so events are on the calendar): 活动倒计时 in the HUD; tap opens the list
  { const p = await page(RESORT);
    await step(p, 'countdown.png', async () => { const shown = await p.evaluate(`(() => { ${H} at(10 * 60); f.advance(1, 10); f.refreshUI(); return vis('#countdown'); })()`); if (!shown) return { shown, _shot: false }; await tapEl(p, '#countdown');
      return p.evaluate(`(() => { ${H} const el = document.getElementById('countdown'), l = el.querySelector('.cd-list'); return { shown: true, list: !!l && vis(l), items: l ? l.children.length : 0, inside: inside(el), text: el.textContent.replace(/\\s+/g, ' ').slice(0, 120), barBelow: box(el)[3] < box('#xhs-bar')[1] }; })()`); },
      r => !r.shown ? 'no countdown in the HUD' : !r.list || !r.items ? 'tap did not open the list' : !r.inside || !r.barBelow ? 'countdown off screen / under the bar' : null);
    await p.context().close(); }

  // B. a fresh farm (?manual): the restaurant panel and the party spread, set up like restaurant-shots / party-shots
  { const p = await page(null, '?manual');
    await step(p, 'restaurant.png', () => p.evaluate(`(() => { ${H} S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 4000;
      for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coop','chicken','can','can']) f.buy(id); f.buyPlot('eroad', 'road'); f.buy('town');
      day(118); at(12 * 60); Object.assign(S.inn, { cabins: 4, inn2: 1, job: null, arrived: 117, _morn: 117, walkins: 0 }); S.inn.diner.lv = 3; S.inn.diner.menu = 'auto'; S.inn.diner.served = 200;
      S.inn.diner.last = 118; S.inn.diner.missedLast = 0; S.inn.diner.servedLast = 32; S.inn.diner.dishLast = 'cabbage_egg'; S.inn.stars.last = [{ day: 117, s: 5, note: '南瓜饼好吃', n: 3 }, { day: 118, s: 5, note: '卷心菜炒蛋很香', n: 3 }]; S.inn.stars.avg = 5;
      const L = f.innLayout(); if (L) { f.setAngle(0.2); f.panTo(L.diner.x, L.diner.y + 6); f.advance(0.3, 10); } f.openInn && f.openInn(); f.refreshUI();
      const shop = document.getElementById('shop'), sec = shop && [...shop.querySelectorAll('.sec, .more')].find(e => /菜馆菜单|留言本/.test(e.textContent)); if (sec) sec.scrollIntoView({ block: 'start' });
      return { shop: vis(shop), inside: shop ? inside(shop) : false, menu: !!sec, text: shop ? shop.innerText.replace(/\\s+/g, ' ').slice(0, 200) : '', barOk: shop ? box(shop)[3] <= box('#xhs-bar')[1] + 1 : false }; })()`),
      r => !r.shop || !r.menu ? 'no restaurant panel' : !r.inside || !r.barOk ? 'panel off screen' : null);
    await p.evaluate(() => { const s = document.getElementById('shop'); if (s) s.hidden = true; });
    await step(p, 'party.png', () => p.evaluate(`(() => { ${H} f.yard.length = 0; day(60); S.family.kids = [{ id: 'kid0', name: '小豆', born: 50 }, { id: 'kid1', name: '小米', born: 45 }]; f.syncFamily();
      at(8 * 60); f.buy('party'); until(() => !!f.partyArea() && !S.decor.orders.length, 900); const area = f.partyArea(); if (!area) return { area: false };
      S.decor.party.at = S.day - 1; S.decor.party.last = S.day - 9; at(16 * 60 + 50); S.decor.party.tonight = S.day; S.decor.party.guests = 2; until(() => S.t % 1440 >= 18 * 60 + 30, 900);
      for (let i = 0; i < 240; i++) { at(18 * 60 + 30); f.advance(1, 10); const plan = f.partyPlan ? f.partyPlan() : {}; if (f.actors().concat(f.GUESTS).every(a => { const q = plan[a === f.FARMER ? 'farmer' : a.id]; return q && !a.moving && !a.home && Math.hypot(a.x - q.x, a.y - q.y) < 1.2; })) break; }
      at(18 * 60 + 30); if (S.weather) S.weather.rained = false; PFPlatform.setFollow && PFPlatform.setFollow(false); f.setAngle(0.25); f.panTo(area.x, area.y + 4); f.advance(0.4, 10); f.render();
      const plan = f.partyPlan ? f.partyPlan() : {}; return { area: true, people: f.actors().concat(f.GUESTS).length, placed: Object.keys(plan).length, sv: f.snapshot().saveVersion }; })()`).then(async r => {
        await p.waitForTimeout(500); return Object.assign(r, await p.evaluate(TOASTS)); }),
      r => !r.area ? 'no party area' : r.placed < 4 ? 'party plan ' + r.placed : r.sv !== 15 ? 'save v' + r.sv : toastBad(r));
    // both arrival orders on purpose (the party above may only raise one of them on a given run)
    for (const first of ['photo', 'achievement']) await step(p, 'toast_stack_' + first + '.png', async () => {
      await p.evaluate(first => { const v = __farm.albumView(), s = v.shots[0] || { id: 'party', title: '第一次家庭聚会', url: '' };
        const photo = () => dispatchEvent(new CustomEvent('pf:album', { detail: { id: s.id, title: s.title, url: s.url } })), ach = () => dispatchEvent(new CustomEvent('pf:say', { detail: '成就：我家大门常打开' }));
        if (first === 'photo') { photo(); ach(); } else { ach(); photo(); } }, first);
      await p.waitForTimeout(500); return p.evaluate(TOASTS); },
      r => !r.photo || !r.msg ? 'both toasts should show ' + JSON.stringify(r) : toastBad(r));
    await p.context().close(); }

  // C. v5.11.0.29 heavy late game on the phone build: the inn/resort fixture, then every plot, every shop level, the smithy, all five machines
  // (feeder bits + full bins), bakery.held mid-walk, a full album, and a few more days of play. The compact save (what the cloud gets) must stay < 64KB.
  { const p = await page(RESORT);
    await step(p, 'heavy_save.png', () => p.evaluate(`(() => { ${H} const SIM = window.PFSim, AL = window.PFAlbum; S.family.met = 1; S.family.moved = 1; S.family.love = 100;
      const rich = () => { S.coins = 9e6; f.FARMER.wood = 9000; }; rich(); if (S.town && S.town.hall) { S.town.hall.built = S.town.hall.built || {}; S.town.hall.built.smithy = S.town.hall.built.smithy || S.day; }
      const pref = ['field', 'workshop', 'dam', 'pasture', 'meadow', 'orchard', 'woodland', 'resort', 'playground', 'bridge', 'road', 'trail'];
      for (let pass = 0; pass < 3; pass++) {
        for (const pl of f.PL.PLOTS || []) { if (S.plots && S.plots[pl.id] && S.plots[pl.id].mod) continue; for (const m of pref) if ((pl.mods || []).includes(m)) { rich(); try { if (f.buyPlot(pl.id, m)) break; } catch (e) {} } }
        for (const it of SIM.SHOP) for (let i = 0; i < 12; i++) { rich(); let ok = false; try { ok = f.buy(it.id); } catch (e) {} if (!ok) break; }
        f.applyUpgrades && f.applyUpgrades(); }
      for (let d = 0; d < 3; d++) { const d0 = S.day; rich(); for (let i = 0; i < 4000 && S.day === d0; i++) f.advance(1, 10); }
      const W = S.works || {}; W.mach = Object.assign({ f: 255, e: 1, m: 1, h: 1 }, W.mach || {}, { eg: 48, mk: 24, hn: 24 });
      const B = S.town && S.town.hall && S.town.hall.bakery; if (B) B.held = [{ id: 'milk', n: 3 }, { id: 'honey', n: 3 }, { id: 'apple_pie', n: 2 }, { id: 'cheese', n: 2 }];
      const snap = f.snapshot(); const A = AL.valid(snap.album || []); AL.MOMENTS.forEach((m, i) => AL.add(A, { id: m.id, d: 300 + i, t: 600, x: 100.5, y: 80.25, w: ['farmer', 'partner', 'kid0', 'kid1'] })); snap.album = AL.pack(A);
      const c = window.PFSave.compact(snap), json = JSON.stringify(c), bytes = new Blob([json]).size, raw = new Blob([JSON.stringify(snap)]).size; // PFSave.compact = what save.js writes (and the cloud gets)
      const top = Object.keys(c).map(k => [k, new Blob([JSON.stringify(c[k]) || '']).size]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x.join(':')).join(' ');
      const plots = Object.keys(S.plots || {}).filter(k => S.plots[k] && S.plots[k].mod).length, ups = Object.values(S.up || {}).reduce((a, b) => a + (b | 0), 0);
      return { bytes, kb: +(bytes / 1024).toFixed(1), headroom: 65536 - bytes, raw, rt: (m => JSON.stringify(window.PFSave.compact(m)).length <= json.length && JSON.stringify(m.works.mach) === JSON.stringify(c.works.mach) && JSON.stringify(m.town.hall.bakery.held) === JSON.stringify(c.town.hall.bakery.held))(window.PFSave.migrate(JSON.parse(json))), sv: snap.saveVersion, day: S.day, plots, ups, tiles: f.tiles ? f.tiles.length : null, mach: JSON.stringify(c.works && c.works.mach), held: JSON.stringify(c.town && c.town.hall && c.town.hall.bakery && c.town.hall.bakery.held), album: A.list.length, top }; })()`),
      r => r.sv !== 15 ? 'save v' + r.sv : !r.rt ? 'machines / bakery.held lost on reload, or the reloaded save grew' : !r.mach || !/"f":255/.test(r.mach) ? 'machines missing ' + r.mach : !r.held || r.held === 'undefined' ? 'bakery.held missing' : r.bytes >= 65536 ? 'heavy compact save ' + r.bytes + ' >= 64KB' : null);
    await p.context().close(); }

  console.log('app', APPV, 'game', VER); console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
