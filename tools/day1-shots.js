// v5.11.0.31 前几天的节奏 browser checks: a fresh farm's day 1 (starter goal under the HUD, the first carrots ripening at
// 14:00, the first sale paying the goal reward once, the goal opening its shop tab), a reload in the middle of day 1 (no
// second ripening, no reward paid again), and old farms (no goal reward on load; a day-72 farm shows no goal).
//   node tools/day1-shots.js   writes $PF_SHOTS/day1_*.png (default /workspace/pf-shots); exits 1 on an error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
fs.mkdirSync(OUT, { recursive: true });
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  const check = (name, bad, r) => { console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); };
  const ready = p => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  async function page(save) { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e)));
    await p.addInitScript(() => { window.__goal = []; window.addEventListener('pf:farm', e => { if (e.detail.type === 'income' && e.detail.source === 'goal') window.__goal.push(e.detail.goal); }); });
    await p.goto(base + '/index.html?manual&seed=7'); await ready(p);
    await p.evaluate(s => { __farm.SAVE.off = true; localStorage.clear(); if (s) localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); }, save || null);
    await p.reload(); await ready(p); await p.evaluate(() => { __farm.SAVE.off = true; }); return p; }
  const st = () => { const S = __farm.S, g = document.getElementById('goal'); return { day: S.day, t: Math.floor(S.t % 1440), coins: S.coins, sold: S.totalSold, goal: g.hidden ? '' : g.innerText.replace(/\s+/g, ' '), paid: window.__goal.slice(),
    ripe: __farm.tiles.filter(t => t.open && t.crop && PFSim.ripe(t.crop)).length, log: S.events.filter(e => /头一茬/.test(e.msg)).length }; };
  const until = (p, fn, max = 400) => p.evaluate(([src, max]) => { const f = new Function('return ' + src)(); for (let i = 0; i < max && !f(); i++) __farm.advance(1, 3); }, [fn.toString(), max]);

  // 1. a fresh farm, day 1 morning: goal 1/5 under the HUD
  { const p = await page(null);
    await until(p, () => __farm.S.t % 1440 >= 9 * 60, 200); await p.evaluate(() => __farm.render());
    const a = await p.evaluate(st); check('day 1 morning: goal 1/5 shown', /目标 1\/5/.test(a.goal) ? '' : 'no goal', a);
    await p.screenshot({ path: path.join(OUT, 'day1_goal_morning.png') });
    // 2. 14:00: the carrots watered so far ripen at once
    await until(p, () => __farm.S.t % 1440 >= 14 * 60 + 2, 400); await p.evaluate(() => __farm.render());
    const b2 = await p.evaluate(st); check('day 1 14:00: first carrots ripen the same afternoon', b2.day === 1 && b2.ripe >= 8 && b2.log === 1 ? '' : 'not ripe', b2);
    await p.screenshot({ path: path.join(OUT, 'day1_first_ripen.png') });
    // 3. the first sale pays the goal reward once and moves the goal to the field
    await until(p, () => __farm.S.totalSold > 0, 600); await p.evaluate(() => __farm.advance(1, 3));
    const c = await p.evaluate(st); check('day 1: first sale, +20 once, goal 2/5 is the field', c.day === 1 && c.paid.join() === 'sell' && /目标 2\/5/.test(c.goal) ? '' : 'bad', c);
    await until(p, () => __farm.S.coins >= 60, 400); await p.evaluate(() => __farm.render());
    const c2 = await p.evaluate(st); check('day 1: field affordable the same day', c2.day === 1 && /够了/.test(c2.goal) ? '' : 'not affordable on day 1', c2);
    await p.click('#goal'); await p.waitForTimeout(200);
    const sh = await p.evaluate(() => ({ open: !document.getElementById('shop').hidden, tab: (document.querySelector('#shop [data-tab].on') || {}).textContent || '' }));
    check('clicking the goal opens the 地块 tab', sh.open && /地块/.test(sh.tab) ? '' : 'shop not on the land tab', sh);
    await p.screenshot({ path: path.join(OUT, 'day1_goal_shop.png') });
    await p.evaluate(() => { document.querySelector('#shop [data-a="close"]') && document.querySelector('#shop [data-a="close"]').click(); __farm.buy('field'); __farm.advance(2, 3); });
    const d = await p.evaluate(st); check('field bought: +30 once, goal 3/5 is the can', d.paid.join() === 'sell,field' && /目标 3\/5/.test(d.goal) ? '' : 'bad', d);
    // 4. reload in the middle of day 1 (after 14:00): nothing ripens again, nothing is paid again
    const snap = await p.evaluate(() => __farm.snapshot());
    const q = await page(snap); await q.evaluate(() => __farm.advance(120, 3)); const e = await q.evaluate(st);
    check('reload on day 1 afternoon: no second ripening, no reward again', e.paid.length === 0 && e.log === 0 && /目标 3\/5/.test(e.goal) ? '' : 'paid or ripened again', e);
    await q.evaluate(() => { __farm.S.coins += 100; __farm.buy('can'); __farm.advance(2, 3); }); const e2 = await q.evaluate(st);
    check('after the reload the next step still pays once', e2.paid.join() === 'can' ? '' : 'bad', e2);
    await p.close(); await q.close(); }
  // 5. old farms: no reward on load
  for (const [f, hidden] of [['save-v11-day4.json', null], ['save-v15-day72-cottage.json', true]]) {
    const p = await page(readSave(path.join(__dirname, 'fixtures', f))); await p.evaluate(() => __farm.advance(60, 3)); const r = await p.evaluate(st);
    check(f + ': no goal reward on load' + (hidden ? ', no goal shown' : ''), r.paid.length === 0 && (!hidden || !r.goal) ? '' : 'bad', r);
    if (f === 'save-v11-day4.json') await p.screenshot({ path: path.join(OUT, 'day1_old_day4.png') });
    await p.close(); }
  if (errs.length) fails.push('page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); server.close();
  if (fails.length) { console.log('FAILED\n' + fails.join('\n')); process.exit(1); } console.log('all day-1 checks passed');
})().catch(e => { console.error(e); process.exit(1); });
