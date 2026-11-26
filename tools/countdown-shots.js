// Screenshots + browser checks for v5.11.0.1 (活动倒计时):  node tools/countdown-shots.js [name-filter]
//   writes /workspace/pf-shots/countdown_*.png (PF_SHOTS to change); exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const FIX = path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json');
fs.mkdirSync(OUT, { recursive: true });

(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save, viewport) {
    const ctx = await b.newContext({ viewport: viewport || { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await ready();
    if (save) { await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save); await p.reload(); await ready(); }
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; }); return p;
  }
  const helpers = `const f = __farm, S = f.S;
    const at = T => { S.t = Math.floor(S.t / 1440) * 1440 + T; f.hud(); if (window.PFEventsUI) PFEventsUI.draw(true); };
    const day = d => { S.t = d * 1440 + (S.t % 1440); S.day = d; f.hud(); if (window.PFEventsUI) PFEventsUI.draw(true); };
    const look = (x, y, a) => { f.setAngle(a || 0); f.panTo(x, y); f.advance(0.2, 10); };
    const stampHall = (builtDay) => {
      if (!S.town) S.town = {};
      if (!S.town.hall) S.town.hall = (f.HL && f.HL.empty) ? f.HL.empty() : { built: {} };
      const H = S.town.hall; H.built = H.built || {};
      const ids = ['L5', 'L8', 'L11', 'market', 'bakery', 'woodshop', 'smithy', 'school', 'library', 'clinic', 'h1', 'h2', 'h3', 'h4', 'h5'];
      const end = builtDay | 0;
      ids.forEach((id, i) => { H.built[id] = end - (ids.length - 1) + i; });
      if (S.upgrades) S.upgrades.town = 1;
      return H;
    };
    const cd = () => {
      const el = document.getElementById('countdown');
      const v = window.PFEvents && PFEvents.view({ hall: S.town && S.town.hall, day: S.day, t: ((S.t % 1440) + 1440) % 1440, save: S });
      return { hidden: !el || el.hidden, text: el ? el.innerText.replace(/\\s+/g, ' ').trim() : '', line: v && v.line, ids: v ? v.items.map(i => i.id) : [], open: !!(window.PFEventsUI && PFEventsUI.isOpen()), ver: f.version, sv: f.snapshot().saveVersion, day: S.day, T: S.t % 1440 };
    };
    const overlaps = () => {
      // log / catches sit in the same left column as the HUD (a gap, not a collision).
      // the expanded list is a popover under the HUD, so only the head must stay inside it.
      // diaryBtn lives inside navBtns, so checking navBtns covers the 日记 button.
      const ids = ['hud', 'title', 'titleS', 'minimap', 'mmJump', 'inv', 'navBtns', 'mapBtn'];
      const box = id => { const el = document.getElementById(id); if (!el || el.hidden || el.style.display === 'none') return null; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none') return null; return { id, x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const boxes = ids.map(box).filter(Boolean);
      const hit = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        const ov = !(a.r <= c.x + 1 || c.r <= a.x + 1 || a.b <= c.y + 1 || c.b <= a.y + 1);
        if (ov) hit.push(a.id + '/' + c.id);
      }
      const list = document.querySelector('#countdown .cd-list');
      if (list) {
        const lr = list.getBoundingClientRect();
        for (const id of ['title', 'titleS', 'minimap', 'mmJump', 'inv', 'navBtns', 'mapBtn']) {
          const b = box(id); if (!b) continue;
          const ov = !(lr.right <= b.x + 1 || b.r <= lr.left + 1 || lr.bottom <= b.y + 1 || b.b <= lr.top + 1);
          if (ov) hit.push('list/' + id);
        }
      }
      const say = box('say');
      if (say) {
        for (const id of ['hud', 'title', 'titleS', 'minimap', 'mmJump', 'inv', 'navBtns', 'mapBtn']) {
          const b = box(id); if (!b) continue;
          const ov = !(say.r <= b.x + 1 || b.r <= say.x + 1 || say.b <= b.y + 1 || b.b <= say.y + 1);
          if (ov) hit.push('say/' + id);
        }
        if (list) {
          const lr = list.getBoundingClientRect();
          const ov = !(say.r <= lr.left + 1 || lr.right <= say.x + 1 || say.b <= lr.top + 1 || lr.bottom <= say.y + 1);
          if (ov) hit.push('say/list');
        }
      }
      const head = document.querySelector('#countdown .cd-head'), hud = document.getElementById('hud');
      let inside = true;
      if (head && hud) {
        const c = head.getBoundingClientRect(), h = hud.getBoundingClientRect();
        inside = c.left >= h.left - 1 && c.right <= h.right + 1 && c.top >= h.top - 1 && c.bottom <= h.bottom + 1;
      }
      const diaryBtn = document.getElementById('diaryBtn');
      const jumps = [...document.querySelectorAll('#mmJump button')];
      const jumpWrap = jumps.filter(e => e.getBoundingClientRect().height > 30).length;
      const jumpOff = jumps.filter(e => { const q = e.getBoundingClientRect(); return q.right > innerWidth + 1 || q.left < -1; }).length;
      return { hit, inside, vw: innerWidth, vh: innerHeight, diaryBtn: !!(diaryBtn && diaryBtn.getBoundingClientRect().width > 0), say: say ? say.w : 0, jumpWrap, jumpOff, jumps: jumps.length };
    };`;
  const shot = async (name, fn, check, save, viewport) => { if (only && !name.includes(only)) return;
    const p = await page(save, viewport); let r; try { r = await p.evaluate(fn); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, name) });
    const bad = r && r.error ? r.error : check ? check(r) : null; console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 800)); if (bad) fails.push(name + ': ' + bad); await p.context().close(); };

  const save = readSave(FIX);

  // 1. the day-72 cottage fixture has no town projects: the chip stays hidden; save stays v15
  await shot('countdown_fixture.png', `(() => { ${helpers} look(96, 60, 0); f.advance(0.3, 10);
    const s = f.snapshot(); return Object.assign(cd(), { fxDay: s.clock.day, ov: overlaps() }); })()`,
    r => r.fxDay !== save.clock.day ? 'day ' + r.fxDay : r.sv !== 15 ? 'saveVersion ' + r.sv : r.ver !== '5.12.7' ? 'ver ' + r.ver : !r.hidden ? 'chip shown on a hall-less save: ' + r.text : r.ids.length ? 'items ' + r.ids : r.ov.hit.length ? 'overlap ' + r.ov.hit : null,
    save);

  // 2. desktop, 3 days before a harvest festival (also a market + sports day): 「🏮丰收节 还有3天」
  await shot('countdown_desktop.png', `(() => { ${helpers} stampHall(40); day(53); at(10 * 60); look(96, 60, 0); f.advance(0.3, 10);
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => r.ver !== '5.12.7' ? 'ver ' + r.ver : !r.ov.diaryBtn ? 'no 日记 button' : r.hidden ? 'chip hidden' : r.line !== '🏮丰收节 还有3天' ? 'line ' + r.line : r.ids.join() !== 'festival,market,sports' && r.ids.join() !== 'market,sports,festival' ? 'ids ' + r.ids : r.ov.hit.length ? 'overlap ' + r.ov.hit : !r.ov.inside ? 'chip outside hud' : null,
    save);

  // 3. expanded list on desktop, staggered upcoming days
  await shot('countdown_expanded.png', `(() => { ${helpers} stampHall(40); day(58); at(10 * 60); look(96, 60, 0); f.advance(0.3, 10);
    if (window.PFEventsUI) PFEventsUI.toggle(true);
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => r.hidden ? 'hidden' : !r.open ? 'not expanded' : r.line !== '🧺集市 还有5天' ? 'line ' + r.line : !/运动会/.test(r.text) || !/丰收节/.test(r.text) || !/集市/.test(r.text) ? 'list ' + r.text : r.ov.hit.length ? 'overlap ' + r.ov.hit : !r.ov.inside ? 'chip outside hud' : null,
    save);

  // 4. event day, morning: 「🏮丰收节 今晚18点」
  await shot('countdown_today.png', `(() => { ${helpers} stampHall(40); day(56); at(6 * 60 + 30); look(96, 60, 0); f.advance(0.3, 10);
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => r.line !== '🏮丰收节 今晚18点' ? 'line ' + r.line : r.hidden ? 'hidden' : r.ov.hit.length ? 'overlap ' + r.ov.hit : null,
    save);

  // 5. during the feast: 「🏮丰收节 进行中」
  await shot('countdown_live.png', `(() => { ${helpers} stampHall(40); day(56); at(20 * 60); look((f.FV && f.FV.TABLE) ? f.FV.TABLE.x : 763, (f.FV && f.FV.TABLE) ? f.FV.TABLE.y : 130, -0.1); f.advance(0.3, 10);
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => r.line !== '🏮丰收节 进行中' ? 'line ' + r.line : r.hidden ? 'hidden' : r.ov.hit.length ? 'overlap ' + r.ov.hit : null,
    save);

  // 6. mobile 390x844, collapsed
  await shot('countdown_mobile.png', `(() => { ${helpers} stampHall(40); day(53); at(10 * 60); look(96, 60, 0); f.advance(0.3, 10);
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => !r.ov.diaryBtn ? 'no 日记 button' : r.line !== '🏮丰收节 还有3天' ? 'line ' + r.line : r.hidden ? 'hidden' : r.ov.hit.length ? 'overlap ' + r.ov.hit : !r.ov.inside ? 'chip outside hud' : r.ov.jumpWrap ? 'jump wrap' : r.ov.jumpOff ? 'jump off screen' : r.ov.jumps !== 6 ? 'jump n ' + r.ov.jumps : r.ov.vw !== 390 || r.ov.vh !== 844 ? 'viewport ' + r.ov.vw + 'x' + r.ov.vh : null,
    save, { width: 390, height: 844 });

  // 7. mobile expanded: the list stays inside the HUD and does not cover the right-side buttons
  await shot('countdown_mobile_expanded.png', `(() => { ${helpers} stampHall(40); day(58); at(10 * 60); look(96, 60, 0); f.advance(0.3, 10);
    if (window.PFEventsUI) PFEventsUI.toggle(true);
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => !r.open ? 'not expanded' : !/运动会/.test(r.text) || !/丰收节/.test(r.text) ? 'list ' + r.text : r.ov.hit.length ? 'overlap ' + r.ov.hit : !r.ov.inside ? 'chip outside hud' : r.ov.jumpWrap ? 'jump wrap' : r.ov.jumpOff ? 'jump off screen' : null,
    save, { width: 390, height: 844 });

  // 8. morning diary toast must not cover the countdown or the 日记 button
  await shot('countdown_toast_desktop.png', `(() => { ${helpers} stampHall(40); day(53); at(10 * 60); look(96, 60, 0); f.advance(0.3, 10);
    window.dispatchEvent(new CustomEvent('pf:say', { detail: '昨天（第52天）种了南瓜，收了6个，钓到2条鱼。日记里写着呢' }));
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => !r.ov.diaryBtn ? 'no 日记 button' : r.line !== '🏮丰收节 还有3天' ? 'line ' + r.line : !r.ov.say ? 'no toast' : r.ov.hit.length ? 'overlap ' + r.ov.hit : !r.ov.inside ? 'chip outside hud' : null,
    save);

  await shot('countdown_toast_mobile.png', `(() => { ${helpers} stampHall(40); day(53); at(10 * 60); look(96, 60, 0); f.advance(0.3, 10);
    window.dispatchEvent(new CustomEvent('pf:say', { detail: '昨天（第52天）种了南瓜，收了6个，钓到2条鱼。日记里写着呢' }));
    return Object.assign(cd(), { ov: overlaps() }); })()`,
    r => !r.ov.diaryBtn ? 'no 日记 button' : r.line !== '🏮丰收节 还有3天' ? 'line ' + r.line : !r.ov.say ? 'no toast' : r.ov.hit.length ? 'overlap ' + r.ov.hit : !r.ov.inside ? 'chip outside hud' : r.ov.jumpWrap ? 'jump wrap' : r.ov.jumpOff ? 'jump off screen' : r.ov.vw !== 390 ? 'viewport' : null,
    save, { width: 390, height: 844 });

  console.log('errors', errs); console.log('fails', fails); if (errs.length || fails.length) process.exitCode = 1; await b.close(); server.close(); })();
