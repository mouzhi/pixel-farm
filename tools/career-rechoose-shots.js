// v5.11.0.36: 390px phone shots of 换个活法 and the new careers.
//   node tools/career-rechoose-shots.js [name-filter]
//   writes $PF_SHOTS (default /workspace/kids-career-shots); exits 1 on a page error or a failed check.
//   Does not load player or friend saves.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/kids-career-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  async function page() {
    const ctx = await b.newContext(PHONE); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
    return p;
  }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; };
    const until = (ok, n) => { for (let i = 0; i < (n || 600) && !ok(); i++) f.advance(1, 10); return ok(); };
    const dry = () => { if (S.weather) S.weather.rained = false; };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; };
    const nextMorning = () => { const d = S.day; until(() => S.day > d && S.t % 1440 >= 6 * 60 + 30, 3000); };
    const openTown = () => { f.buyPlot('eroad', 'road'); S.town.school.kid0 = Math.max(1, S.town.school.kid0 | 0); S.town.school.kid1 = Math.max(S.town.school.kid1 | 0, 3); return f.buy('town').ok; };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.3, 10); };
    const clearPop = () => { for (const id of ['say', 'albumToast', 'offline', 'goal']) { const el = document.getElementById(id); if (el) el.hidden = true; } };
    const hide = () => { clearPop(); const el = document.getElementById('leftBottom'); if (el) el.style.visibility = 'hidden'; };
    const kid = () => S.members.find(m => m.id === 'kid0');
    const house = () => S.home.houses[0], sp = () => f.SPOUSES[0];
    const prepHome = () => { f.buyPlot('glade', 'meadow'); const r = f.buy('cottage'); const h = house(); if (h) { h.built = S.day - 1; h._tiles = null; f.homeTilesSync(); if (f.HA && f.HA.sync) f.HA.sync(true); } return r.ok; };
    const optKey = el => [el.getAttribute('data-way'), el.getAttribute('data-at') || '', el.getAttribute('data-kind') || ''].join(':');`;
  const setup = `${helpers} f.SAVE.off = true; S.family.met = 1; S.family.moved = 1; S.family.love = 100; S.coins = 500000; f.FARMER.wood = 2000;
    for (const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','coop','chicken','fold','sheep','can','can']) f.buy(id);
    day(70); Object.assign(S.family, { kids: [{ id: 'kid0', name: '小豆', born: 15 }, { id: 'kid1', name: '小米', born: 40 }] }); f.syncFamily(); dry();`;
  const readyTown = `openTown(); at(9 * 60); for (const id of ['L5', 'L8', 'L11']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why); nextMorning(); at(9 * 60); }
    S.coins = Math.max(S.coins, 200000); f.FARMER.wood = 800;
    for (const id of ['market', 'bakery']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' wood=' + f.FARMER.wood); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 800); S.coins = Math.max(S.coins, 200000);
    for (const id of ['woodshop', 'smithy', 'school', 'library', 'clinic']) { const r = f.hallStart(id); if (!r.ok) throw new Error(id + ': ' + r.why + ' lv=' + f.townLv()); nextMorning(); at(9 * 60); }
    f.FARMER.wood = Math.max(f.FARMER.wood, 400); S.coins = Math.max(S.coins, 80000);`;
  const wedMorning = `prepHome(); S.home.rel.kid0 = { m0: 30, m1: 85, m2: 20 }; S.home.nb = Object.assign(S.home.nb || {}, { n3: 60, n2: 10, n8: 5, n1: 40, n9: 40, n10: 40 });
    day(S.day + 1); at(6 * 60 + 20); dry(); f.homeMorning();`;
  const marriedFarm = `${setup} ${readyTown} ${wedMorning}
    const pick = f.careerPick('kid0', 'farm'); if (!pick.ok) throw new Error('farm pick ' + (pick && pick.why));
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    delete S.home.path.kid0; nextMorning(); at(10 * 60); dry(); f.advance(1, 10); f.refreshUI();`;
  const shot = async (name, fn, check) => { if (only && !name.includes(only)) return;
    const p = await page(); let r;
    try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 500) }; }
    await p.evaluate(() => { for (const id of ['say', 'albumToast', 'offline']) { const el = document.getElementById(id); if (el) el.hidden = true; } });
    await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null;
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900));
    if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  await shot('career_phone_family.png', `(() => { ${marriedFarm}
    const hud = document.getElementById('loveHud'); if (hud) hud.click();
    const tip = document.getElementById('loveTip');
    const btn = tip && tip.querySelector('[data-cr="kid0"]');
    return { ver: f.version, tip: !!(tip && !tip.hidden), btn: !!(btn), txt: tip ? tip.innerText.replace(/\\s+/g, ' ').slice(0, 240) : '', w: innerWidth }; })()`,
    r => r.ver !== '5.11.0.39' ? 'ver ' + r.ver
      : r.w < 360 || r.w > 440 ? 'not phone width ' + r.w
      : !r.tip || !r.btn ? 'no family 换个活法'
      : !/换个活法/.test(r.txt || '') ? 'copy ' + r.txt
      : !/留家种地/.test(r.txt || '') ? 'path line ' + r.txt
      : null);

  await shot('career_phone_rechoose.png', `(() => { ${marriedFarm}
    const hud = document.getElementById('loveHud'); if (hud) hud.click();
    const tip = document.getElementById('loveTip');
    const btn = tip && tip.querySelector('[data-cr="kid0"]'); if (btn) btn.click();
    const box = document.getElementById('career');
    const opts = [...(box ? box.querySelectorAll('[data-way]') : [])].map(el => optKey(el) + (el.classList.contains('on') ? '*' : '') + (el.disabled ? '!' : ''));
    const titles = [...(box ? box.querySelectorAll('.copt b') : [])].map(el => el.textContent);
    return { ver: f.version, hidden: !box || box.hidden, title: box && box.querySelector('h3') && box.querySelector('h3').textContent,
      sub: box && box.querySelector('.csub') && box.querySelector('.csub').textContent, opts, titles, w: innerWidth, h: box && box.getBoundingClientRect().height }; })()`,
    r => r.ver !== '5.11.0.39' ? 'ver ' + r.ver
      : r.hidden ? 'modal hidden'
      : !/换个活法/.test(r.title || '') ? 'title ' + r.title
      : !r.opts.some(s => s.startsWith('farm:')) || !r.opts.some(s => s.startsWith('work:school')) || !r.opts.some(s => s.startsWith('work:fish')) || !r.opts.some(s => s.startsWith('work:art')) || !r.opts.some(s => s.startsWith('work:clinic')) || !r.opts.some(s => s.startsWith('work:library')) ? 'opts ' + JSON.stringify(r.opts)
      : !r.titles.includes('去学校当老师') || !r.titles.includes('去池塘当渔夫') || !r.titles.includes('去镇上写生旅行') ? 'titles ' + JSON.stringify(r.titles)
      : r.opts.some(s => s.startsWith('work:school') && s.endsWith('!')) || r.opts.some(s => s.startsWith('work:fish') && s.endsWith('!')) ? 'new jobs locked ' + JSON.stringify(r.opts)
      : null);

  await shot('career_phone_jobs.png', `(() => { ${marriedFarm}
    const hud = document.getElementById('loveHud'); if (hud) hud.click();
    const btn = document.querySelector('#loveTip [data-cr="kid0"]'); if (btn) btn.click();
    const box = document.getElementById('career'), list = box && box.querySelector('.clist');
    const school = box && [...box.querySelectorAll('[data-at="school"]')][0];
    if (school && list) school.scrollIntoView({ block: 'center' });
    if (school && !school.disabled) school.click();
    const on = box && box.querySelector('.copt.on b') && box.querySelector('.copt.on b').textContent;
    return { ver: f.version, on, hasList: !!(list), school: !!(school && !school.disabled),
      titles: [...(box ? box.querySelectorAll('.copt b') : [])].map(el => el.textContent) }; })()`,
    r => r.ver !== '5.11.0.39' ? 'ver ' + r.ver
      : !r.school ? 'school job missing or locked'
      : r.on !== '去学校当老师' ? 'selected ' + r.on
      : null);

  await shot('career_phone_teacher.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    const pick = f.careerPick('kid0', 'work', 'school'); if (!pick.ok) return { pick };
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(9 * 60); f.advance(0.5, 10);
    const stand = f.CR.standOf('school');
    until(() => { const k = kid(); return k && stand && Math.hypot(k.x - stand.x, k.y - stand.y) < 28; }, 2200);
    at(11 * 60); f.advance(2, 10);
    const k = kid(); look((k && k.x) || stand.x, ((k && k.y) || stand.y) + 6, 0); hide();
    return { pick, path: S.home.path.kid0, ver: f.version,
      k: k && { x: Math.round(k.x), y: Math.round(k.y), task: k.task && (k.task.label || k.task.kind) } }; })()`,
    r => !r.pick || !r.pick.ok ? 'pick ' + JSON.stringify(r.pick)
      : r.ver !== '5.11.0.39' ? 'ver ' + r.ver
      : !r.path || r.path.at !== 'school' ? 'path ' + JSON.stringify(r.path)
      : !r.k || Math.hypot(r.k.x - 698, r.k.y - 48) > 40 ? 'not at school ' + JSON.stringify(r.k)
      : null);

  await shot('career_phone_fisher.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    const pick = f.careerPick('kid0', 'work', 'fish'); if (!pick.ok) return { pick };
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(9 * 60); f.advance(0.5, 10);
    const stand = f.CR.standOf('fish');
    until(() => { const k = kid(); return k && stand && Math.hypot(k.x - stand.x, k.y - stand.y) < 20; }, 2200);
    at(11 * 60); f.advance(2, 10);
    const k = kid(); look((k && k.x) || stand.x, ((k && k.y) || stand.y) - 4, 0); hide();
    return { pick, path: S.home.path.kid0, ver: f.version,
      k: k && { x: Math.round(k.x), y: Math.round(k.y), task: k.task && (k.task.label || k.task.kind) } }; })()`,
    r => !r.pick || !r.pick.ok ? 'pick ' + JSON.stringify(r.pick)
      : r.ver !== '5.11.0.39' ? 'ver ' + r.ver
      : !r.path || r.path.at !== 'fish' ? 'path ' + JSON.stringify(r.path)
      : !r.k || Math.hypot(r.k.x - 54, r.k.y - 94) > 24 ? 'not at the pond ' + JSON.stringify(r.k)
      : null);

  await shot('career_phone_artist.png', `(() => { ${setup} ${readyTown} ${wedMorning}
    const pick = f.careerPick('kid0', 'work', 'art'); if (!pick.ok) return { pick };
    until(() => S.home.wed.kid0 && S.home.wed.kid0.moved, 2500);
    nextMorning(); dry(); at(9 * 60); f.advance(0.5, 10);
    const stand = f.CR.standOf('art');
    until(() => { const k = kid(); return k && stand && Math.hypot(k.x - stand.x, k.y - stand.y) < 28; }, 2600);
    at(11 * 60); f.advance(2, 10);
    const k = kid(); look((k && k.x) || stand.x, ((k && k.y) || stand.y) + 4, 0); hide();
    return { pick, path: S.home.path.kid0, ver: f.version,
      k: k && { x: Math.round(k.x), y: Math.round(k.y), task: k.task && (k.task.label || k.task.kind) } }; })()`,
    r => !r.pick || !r.pick.ok ? 'pick ' + JSON.stringify(r.pick)
      : r.ver !== '5.11.0.39' ? 'ver ' + r.ver
      : !r.path || r.path.at !== 'art' ? 'path ' + JSON.stringify(r.path)
      : !r.k || Math.hypot(r.k.x - 666, r.k.y - 134) > 40 ? 'not at the plaza ' + JSON.stringify(r.k)
      : null);

  console.log('errors', errs); console.log('fails', fails);
  if (errs.length || fails.length) process.exitCode = 1;
  await b.close(); server.close();
})();
