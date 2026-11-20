// 小红书小工具 phone screenshots + layout checks on the packed zip tree:
//   bash platforms/xhs/pack.sh && node tools/xhs-shots.js [name-filter]
// Serves platforms/xhs/dist (what goes into the zip) in a 390×844 @3x touch phone with a mocked
// window.xhs.miniTool (storage, window info, ranking, follow; client 9.53.3), and writes
// /workspace/pf-shots/xhs_1120_*.png (PF_SHOTS / PF_TAG to change). Exits 1 on a page error, a failed
// check, or a panel / tab / toast that runs off the phone screen. PF_FRIEND_SAVE adds a real late farm (local only).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'xhs_1120_';
// the web version this tree carries (index.html cache-buster on game.js)
const WEB_VER = (fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8').match(/game\.js\?v=([\d.]+)/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('no platforms/xhs/dist: run bash platforms/xhs/pack.sh first'); process.exit(1); }
const server = http.createServer((req, res) => { const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const FRIEND = process.env.PF_FRIEND_SAVE || '/workspace/pf-saves/friend/pixel-farm-save.json';
const FIXTURE = path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json');
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
fs.mkdirSync(OUT, { recursive: true });
// the container: storage (seeded with a save), window info with a notch, ranking and follow; no cloud storage
const MOCK = seed => `(() => { const mem = Object.assign({}, ${JSON.stringify(seed || {})});
  const ok = v => Promise.resolve(v);
  const rows = [['阿禾的田', 98000], ['小麦先生', 76500], ['南河湾', 52100], ['像素农夫', 31200], ['海边民宿', 18800]].map((r, i) => ({ rank: i + 1, nickname: r[0], score: r[1] }));
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: {
    getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); },
    removeStorage: a => { delete mem[a.key]; return ok({}); },
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }),
    getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }),
    submitScore: () => ok({}), getRankList: () => ok({ data: rows }), getMyRank: () => ok({ rank: 12, score: 9800, status: 'EXACT' }),
    getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({ follow_status: 1 }),
    share: () => ok({}), saveImageToPhotosAlbum: () => ok({}), writeTempFile: () => ok({ filePath: '/tmp/x.png' }), postNote: () => ok({}) } };
  window.__xhsMem = mem; })();`;
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 discover/9.53.3 XHS' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const seed = save ? { 'mouzhi/pixel-farm:save': JSON.stringify(Object.assign({}, save, { savedAt: Date.now() })) } : {};
    await p.addInitScript(MOCK(seed)); await p.goto(base + '/index.html');
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI && document.getElementById('xhs-bar'), null, { timeout: 30000 });
    await p.waitForTimeout(1200); await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p; }
  // everything visible must sit inside the phone screen; long rows may scroll sideways inside their own box
  const FIT = `(() => { const W = innerWidth, H = innerHeight, bad = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push('page scrolls sideways ' + document.documentElement.scrollWidth);
    const vis = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && el.getClientRects().length; };
    const scroller = el => { for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll)/.test(s.overflowX) && a.scrollWidth > a.clientWidth) return a; } return null; };
    const PANELS = ['shop', 'store', 'xhs-board', 'career', 'offline', 'loveTip', 'menu']; // children must stay inside these sideways
    for (const id of PANELS.concat(['codex', 'xhs-toast', 'xhs-bar', 'xhs-side', 'hud', 'xhs-inv-dock', 'say', 'tools'])) { const el = document.getElementById(id); if (!el || el.hidden || !vis(el)) continue;
      const r = el.getBoundingClientRect(), inBoard = el.closest('#xhs-board') && id !== 'xhs-board';
      if (r.left < -1 || r.right > W + 1 || (!inBoard && (r.top < -1 || r.bottom > H + 1))) bad.push('#' + id + ' off screen ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
      const lim = PANELS.includes(id) ? r : { left: 0, right: W };
      for (const c of el.querySelectorAll('*')) { if (!vis(c)) continue; const q = c.getBoundingClientRect(); if (q.width < 1) continue; if (scroller(c)) continue;
        if (q.right > Math.min(W, lim.right) + 2 || q.left < Math.max(0, lim.left) - 2) { bad.push('#' + id + ' > ' + c.tagName.toLowerCase() + (c.className ? '.' + String(c.className).split(' ')[0] : '') + ' "' + (c.textContent || '').trim().slice(0, 16) + '" ' + Math.round(q.left) + '..' + Math.round(q.right)); if (bad.length > 12) break; } } }
    // the top corners belong to the host (back on the left, share on the right): nothing of ours up there
    for (const el of document.querySelectorAll('body *')) { if (!vis(el) || el.closest('#xhs-stage') || el.id === 'xhs-stage') continue; const q = el.getBoundingClientRect(); if (q.width < 1 || q.height < 1 || q.width > W * 0.6) continue;
      if (el.children.length && !/^(BUTTON|IMG|CANVAS)$/.test(el.tagName) && !(el.textContent || '').trim()) continue;
      if (q.top < 44 && q.bottom > 0 && (q.left < 64 || q.right > W - 64) && !['HTML', 'BODY'].includes(el.tagName)) { bad.push('top corner: ' + (el.id || el.className || el.tagName) + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round)); break; } }
    return bad; })()`;
  const shot = async (name, fn, check, save) => { name = TAG + name; if (only && !name.includes(only)) return;
    const p = await page(save); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(500); const fit = await p.evaluate(FIT); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : (check && check(r)) || (fit.length ? 'layout: ' + fit.join(' | ') : null);
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 700), bad ? '\n     -> ' + String(bad).slice(0, 900) : ''); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };
  const helpers = `const f = __farm, S = f.S, $ = id => document.getElementById(id);
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const unfollow = () => { const b = $('xhs-follow'); if (b && b.classList.contains('on')) b.click(); };
    const tap = sel => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) throw new Error('no ' + sel); el.click(); return el; };
    const start = id => { f.FARMER.wood = Math.max(f.FARMER.wood, 3000); S.coins = Math.max(S.coins, 600000); const r = f.hallStart(id); if (!r.ok) throw new Error(id + ' ' + (r.why || JSON.stringify(r))); nextMorning(); at(9 * 60); return r; };
    const ui = () => ({ speed: !!$('xhs-btn-speed') || !!$('speed') && getComputedStyle($('speed')).display !== 'none', save: [...document.querySelectorAll('#xhs-bar button, #xhs-side button')].filter(e => !e.hidden && /存档|^档$/.test(e.getAttribute('aria-label') || e.title || e.textContent)).length,
      bar: [...document.querySelectorAll('#xhs-bar > *')].filter(e => !e.hidden).map(e => e.getAttribute('aria-label') || e.title || e.id) });`;
  // a grown farm with the town, market, bakery, woodshop, smithy, school, library, clinic and the beach resort
  const rich = `${helpers} S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 900000; f.FARMER.wood = 5000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can','searod']) f.buy(id);
    day(80); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();
    f.buyPlot('eroad', 'road'); S.town.school.kid0 = 1; S.town.school.kid1 = 3; f.buy('town'); at(9 * 60);
    for (const id of ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5']) start(id);
    f.buyPlot('eshore', 'resort'); if (S.inn) { S.inn.resort = { huts: 4, parasols: 8, stall: 1, pier: 1, deck: 1 }; S.inn.job = null; } if (f.IA && f.IA.sync) f.IA.sync(true); f.markNavDirty && f.markNavDirty();
    f.buyPlot('wbank', 'workshop'); f.buy('mill'); dry(); at(10 * 60); f.advance(2, 10); return f.snapshot();`;
  // build the grown farm once (slow), then every shot loads it through the mocked xhs storage
  let RICH = null; { const p = await page(); try { RICH = await p.evaluate(`(() => { ${rich} })()`); } catch (e) { fails.push('rich farm: ' + String(e).slice(0, 300)); } await p.context().close(); }
  const grown = `${helpers} dry(); at(10 * 60); f.advance(1, 10);`;

  // 1. first screen: fresh farm, bottom bar (bag / store / shop / follow farmer / follow author / trophy), no speed, no save button
  await shot('start.png', `(() => { ${helpers} f.advance(1, 10); return ui(); })()`, r => r.speed ? 'speed control shown' : r.save ? 'save button shown' : r.bar.length < 4 ? 'bar ' + r.bar : null);
  // 2. the grown farm, following the farmer
  await shot('farm.png', `(() => { ${grown} const raw = (window.PFPlatform && PFPlatform.store && PFPlatform.store().getItem('mouzhi/pixel-farm:save')) || JSON.stringify(f.snapshot()); return Object.assign(ui(), { day: S.day, town: !!S.town, version: f.version, saveBytes: unescape(encodeURIComponent(raw)).length, snapBytes: unescape(encodeURIComponent(JSON.stringify(f.snapshot()))).length }); })()`, r => r.version !== WEB_VER ? 'version ' + r.version : !r.town ? 'no town' : r.snapBytes > 65536 ? 'grown farm save is over the 64KB cloud cap: ' + r.snapBytes : null, RICH);
  // 3. the town with the new buildings (market, bakery, smithy, school, library, clinic)
  await shot('town.png', `(() => { ${grown} unfollow(); const c = { x: 520, y: 80 }; look(c.x, c.y, 0);
    return { hall: S.town.hall && Object.keys(S.town.hall).length, center: c }; })()`, null, RICH);
  // 4. shop: every tab (incl. 镇公所 and 农家乐) fits the phone
  const tabsOf = `(() => { ${grown} tap('#xhs-btn-shop'); f.refreshUI(); return [...document.querySelectorAll('#shop .tabs [data-tab]')].map(b => b.dataset.tab); })()`;
  let tabs = [];
  if (!only || 'shop'.includes(only) || only.includes('shop')) { const p = await page(RICH); try { tabs = await p.evaluate(tabsOf); } catch (e) { fails.push('shop tabs: ' + e); } await p.context().close(); }
  console.log('shop tabs', tabs);
  for (const t of tabs) await shot(`shop_${t}.png`, `(() => { ${grown} tap('#xhs-btn-shop'); f.refreshUI(); tap('#shop .tabs [data-tab="${t}"]'); f.refreshUI();
    return { tab: '${t}', on: (document.querySelector('#shop .tabs .on') || {}).dataset.tab, cards: document.querySelectorAll('#shop .card').length }; })()`, r => r.on !== r.tab ? 'tab not on' : null, RICH);
  // 5. the trophy: ranking and codex tabs in one panel
  await shot('trophy_rank.png', `(() => { ${grown} tap('#xhs-btn-board'); const rb = [...document.querySelectorAll('.xhs-board-sections button')].find(x => /排行/.test(x.textContent)); if (rb) rb.click(); return new Promise(res => setTimeout(() => res({ open: !$('xhs-board').hidden, tabs: [...document.querySelectorAll('.xhs-board-sections [data-sec], .xhs-board-sections button')].map(b => b.textContent.trim()), rows: document.querySelectorAll('#xhs-board .xhs-av').length }), 600)); })()`,
    r => !r.open ? 'board closed' : !r.tabs.some(t => /排行/.test(t)) || !r.tabs.some(t => /图鉴/.test(t)) ? 'tabs ' + r.tabs : !r.rows ? 'no ranking rows' : null, RICH);
  await shot('trophy_codex.png', `(() => { ${grown} tap('#xhs-btn-board'); return new Promise(res => setTimeout(() => { const b = [...document.querySelectorAll('.xhs-board-sections button')].find(x => /图鉴/.test(x.textContent)); if (b) b.click();
    setTimeout(() => res({ open: !$('xhs-board').hidden, codex: !!document.querySelector('#xhs-board #codex'), items: document.querySelectorAll('#xhs-board #codex .it, #xhs-board #codex [data-key]').length }), 500); }, 500)); })()`,
    r => !r.open || !r.codex ? 'codex not inside the trophy panel' : null, RICH);
  // v5.10.13 日记本: web 「日记 K」 hidden, book icon in the bottom bar opens the diary sheet between HUD and bar
  await shot('diary.png', `(() => { ${grown} nextMorning(); at(10 * 60); f.advance(1, 10); tap('#xhs-btn-diary'); f.advance(0.5, 10);
    const d = $('diary'), web = $('diaryBtn'); return { open: !!d && !d.hidden, lines: d ? d.querySelectorAll('p').length : 0, webBtn: !!web && getComputedStyle(web).display !== 'none', icon: $('xhs-btn-diary').classList.contains('on') }; })()`,
    r => !r.open ? 'diary closed' : !r.lines ? 'empty diary' : r.webBtn ? 'web 日记 K button shown' : !r.icon ? 'icon not marked on' : null, RICH);
  // v5.10.13: buying a goldfish in the shop puts it straight into the pond (no 放养 tap; the 1.1.1 player comment)
  await shot('goldfish_auto.png', `(() => { ${grown} const n0 = S.pondFish.length; tap('#xhs-btn-shop'); f.refreshUI(); const t = [...document.querySelectorAll('#shop .tabs [data-tab]')].find(b => { b.click(); f.refreshUI(); return document.querySelector('#shop [data-buy="goldfish"]'); });
    tap('#shop [data-buy="goldfish"]'); tap('#xhs-btn-shop'); unfollow(); look(34, 100, 0); f.advance(1, 10);
    return { before: n0, after: S.pondFish.length, held: (S.ornament && S.ornament.goldfish) || 0, release: !!document.querySelector('#tools [data-m="release"][data-k="goldfish"]') }; })()`,
    r => r.after !== r.before + 1 ? 'pond ' + r.before + ' -> ' + r.after : r.held ? 'goldfish left in the storehouse' : r.release ? '放养金鱼 button still shown' : null, RICH);
  // 6. the beach resort, and the harvest festival evening in town
  await shot('resort.png', `(() => { ${grown} unfollow(); const L = f.innResortLayout && f.innResortLayout(); look(L && L.coast && L.coast.center ? L.coast.center.x : 272, L && L.coast && L.coast.center ? L.coast.center.y : 236, 0); return { resort: S.inn && S.inn.resort }; })()`, null, RICH);
  await shot('festival.png', `(() => { ${grown}
    const fd = f.FV && f.FV.nextDay ? f.FV.nextDay(S.town.hall, S.day) : null; if (fd == null) throw new Error('no festival day');
    day(fd); at(18 * 60 + 20); dry(); f.advance(3, 10); unfollow(); const t = f.FV.TABLE; look(t.x, t.y, 0); return { fd, day: S.day }; })()`, null, RICH);
  // 7. a toast while the shop is open sits above the bar and inside the screen
  await shot('toast.png', `(() => { ${grown} tap('#xhs-btn-shop'); f.refreshUI(); const b = document.querySelector('#shop button[data-buy]'); if (b) b.click(); f.log && f.log('镇上的面包房今天出了新面包，家人带了两个回来'); f.advance(0.3, 10);
    const t = $('xhs-toast'); return { toast: t && t.textContent.slice(0, 40) }; })()`, null, RICH);
  // 8. careers panel / workshop move on the phone
  await shot('family_tip.png', `(() => { ${grown} const kids = (S.family.kids || []); kids.forEach(k => { k.born = Math.min(k.born, S.day - 40); }); f.syncFamily && f.syncFamily();
    tap('#loveHud'); f.refreshUI(); const b = document.querySelector('#loveTip [data-cr]'); if (b) b.click();
    const lt = $('loveTip').getBoundingClientRect(); return { tip: !$('loveTip').hidden, h: Math.round(lt.height), cs: (() => { const c = getComputedStyle($('loveTip')); return [c.position, c.top, c.bottom, c.height, c.display].join(' '); })(), cr: !!b, shown: !$('career').hidden, text: ($('career').textContent || '').slice(0, 40) }; })()`, r => !r.tip ? 'family tip did not open' : null, RICH);
  // 9. saves: the fixture and (local only) the friend's late farm load through xhs storage
  for (const [tag, file] of [['fixture72', FIXTURE], ['friendsave', FRIEND]]) { if (!fs.existsSync(file)) continue; const save = readSave(file);
    await shot(`load_${tag}.png`, `(() => { ${helpers} return { day: S.day, ver: f.version, sv: f.snapshot().saveVersion, coins: Math.round(S.coins) }; })()`, r => r.day < save.clock.day ? 'day ' + r.day : r.sv !== 15 ? 'sv ' + r.sv : null, save); }
  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
