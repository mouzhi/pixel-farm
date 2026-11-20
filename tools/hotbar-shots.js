// Screenshots + browser checks for v5.11.0.7 (物品栏改版):  node tools/hotbar-shots.js [name-filter]
//   writes /workspace/pf-shots/hotbar_<tag>_*.png (PF_SHOTS to change; HOTBAR_TAG=before skips the checks, for a capture of the old bar)
//   exits 1 on a page error, a console error or a failed check
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.HOTBAR_TAG || 'after', CHECK = TAG !== 'before';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
const readSave = f => { const t = fs.readFileSync(f, 'utf8'), a = t.indexOf('===SAVE==='), z = t.indexOf('===LOG==='); const s = JSON.parse((a >= 0 ? t.slice(a + 10, z > a ? z : undefined) : t).trim()); return s.save || s; };
const LATE = readSave(path.join(__dirname, 'fixtures', 'save-v15-day72-cottage.json'));
fs.mkdirSync(OUT, { recursive: true });

(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(save, pref) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(base + '/index.html?manual'); const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await ready();
    await p.evaluate(([s, pref]) => { __farm.SAVE.off = true; localStorage.clear(); if (s) localStorage.setItem('mouzhi/pixel-farm:save', JSON.stringify(s)); if (pref) localStorage.setItem('mouzhi/pixel-farm:ui:inv', pref); }, [save, pref]);
    await p.reload(); await ready();
    await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; __farm.setAngle(0); __farm.panTo(96, 70); __farm.advance(0.2, 10); }); return p;
  }
  const check = (name, bad, r) => { if (!CHECK) { console.log('shot', name); return; } console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r)); if (bad) fails.push(name + ': ' + bad); };
  // the bar's own box, plus some room above it for the tooltip
  async function shot(p, name, above = 70) {
    const r = await p.evaluate(() => { const e = document.getElementById('inv'); const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; });
    const x = Math.max(0, r.x - 40), y = Math.max(0, r.y - above), w = Math.min(1280 - x, r.w + 80), h = Math.min(800 - y, r.h + above + 12);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, `hotbar_${TAG}_${name}.png`), clip: { x, y, width: w, height: h } });
    await p.screenshot({ path: path.join(OUT, `hotbar_${TAG}_${name}_full.png`) });
  }
  // what the bar shows: mode, slots, icons (a data: URL drawn per slot, never the whole crop sheet squashed into one), labels, tooltip
  const read = `(() => { const inv = document.getElementById('inv'), r = inv.getBoundingClientRect();
    const slots = [...inv.querySelectorAll('.slot')].map(s => { const i = s.querySelector('i'), cs = i ? getComputedStyle(i) : null, q = s.getBoundingClientRect(), k = s.querySelector('.k');
      return { name: s.dataset.name || (k && k.textContent) || '', n: (s.querySelector('.n') || {}).textContent || '', w: Math.round(q.width), h: Math.round(q.height), top: Math.round(q.top),
        ico: cs ? { w: i.offsetWidth, h: i.offsetHeight, bg: /data:image/.test(cs.backgroundImage), size: cs.backgroundSize, pos: cs.backgroundPosition } : null, label: !!(k && k.offsetWidth), meter: !!s.querySelector('.meter') }; });
    return { cls: inv.className, w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), vh: innerHeight, slots, tog: !!inv.querySelector('.invtog'), pref: localStorage.getItem('mouzhi/pixel-farm:ui:inv') }; })()`;
  // every icon is one picture drawn at an integer scale (32px for 16px art) and not a strip of the sprite sheet
  const icoBad = r => { for (const s of r.slots) { if (!s.ico) return 'no icon ' + s.name; if (!s.ico.bg) return 'blank icon ' + s.name; if (/px 0px|^-/.test(s.ico.pos) && !/^0px|50%/.test(s.ico.pos)) return 'sheet offset ' + s.name + ' ' + s.ico.pos; if (/\d+px \d+px/.test(s.ico.size) && parseInt(s.ico.size) > 48) return 'sheet size ' + s.name + ' ' + s.ico.size; } return null; };
  const run = async (name, fn) => { if (only && !name.includes(only)) return; try { await fn(); } catch (e) { fails.push(name + ': ' + e.message); console.log('FAIL', name, e.stack); } };

  // 1. a new player: every seed kind in the bag, labels under the icons, the can meter
  await run('early', async () => { const p = await page(null);
    await p.evaluate(() => { const f = __farm, S = f.S, F = f.FARMER; S.coins = 500; for (const id of ['strawberry', 'watermelon']) { if (S.eff.crops.indexOf(id) < 0) S.eff.crops.push(id); }
      F.bag.carrot = 7; F.bag.cabbage = 3; F.bag.pumpkin = 1; F.bag.strawberry = 2; F.bag.watermelon = 27; F.water = 24; S.waterMax = 40; F.crops = ['carrot', 'carrot', 'cabbage', 'crucian', 'egg', 'apple', 'carrot', 'carrot', 'pumpkin', 'cabbage']; f.refreshUI(); });
    const r = await p.evaluate(read); await shot(p, 'early');
    const seeds = r.slots.filter(s => /种$/.test(s.name));
    check('early', icoBad(r) || (seeds.length < 5 ? 'seed slots ' + seeds.length : null) || (!/full/.test(r.cls) ? 'mode ' + r.cls : null) || (seeds.some(s => !s.label) ? 'labels hidden early' : null) || (!r.slots[0].meter ? 'no can meter' : null) || (new Set(r.slots.map(s => s.top)).size !== 1 ? 'rows' : null), { cls: r.cls, w: r.w, h: r.h, slots: r.slots.map(s => s.name + ' ' + s.n + ' ' + s.ico.size) });
    // tooltip on hover: name + count + the long text
    const tipSlot = r.slots.findIndex(s => s.name === '胡萝卜种');
    if (CHECK) { const box = await p.locator('#inv .slot').nth(tipSlot).boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(250);
      const t = await p.evaluate(() => { const e = document.getElementById('invTip'); if (!e || e.hidden) return null; const q = e.getBoundingClientRect(), s = document.querySelector('#inv').getBoundingClientRect(); return { text: e.textContent, above: q.bottom <= s.top + 2, inView: q.left >= 0 && q.right <= innerWidth && q.top >= 0 }; });
      await shot(p, 'early_tooltip', 110);
      check('early_tooltip', !t ? 'no tooltip' : !/胡萝卜/.test(t.text) || !/天成熟/.test(t.text) ? 'text ' + t.text : !t.above ? 'not above the bar' : !t.inView ? 'off screen' : null, t);
      await p.mouse.move(640, 300); await p.waitForTimeout(100);
      const gone = await p.evaluate(() => { const e = document.getElementById('invTip'); return !e || e.hidden; }); check('tooltip hides', gone ? null : 'still shown', { gone }); }
    await p.context().close(); });

  // 2. late game with the family (day-72 cottage fixture): the default is the slim strip; expanding gives compact icon slots
  await run('late', async () => { const p = await page(LATE);
    await p.evaluate(() => { const F = __farm.FARMER; F.bag.carrot = 7; F.bag.strawberry = 2; F.bag.watermelon = 27; __farm.refreshUI(); });
    const r = await p.evaluate(read); await shot(p, 'late_default', 30);
    check('late_default (slim)', CHECK && !/slim/.test(r.cls) ? 'not slim ' + r.cls : r.h > 40 ? 'strip tall ' + r.h : !r.slots[0].meter ? 'no can meter in the strip' : !r.tog ? 'no expand toggle' : icoBad(r), { cls: r.cls, w: r.w, h: r.h, slots: r.slots.map(s => s.name + ' ' + s.n) });
    if (CHECK) {
      await p.click('#inv .invtog'); await p.waitForTimeout(100);
      const o = await p.evaluate(read); await shot(p, 'late_open');
      const fam = o.slots.filter(s => s.name === '家人'), kidSlots = o.slots.filter(s => /小豆|小米/.test(s.name));
      check('late_open (compact)', !/compact/.test(o.cls) ? 'mode ' + o.cls : o.pref !== 'open' ? 'pref ' + o.pref : o.slots.some(s => s.w > 48 || s.h > 48) ? 'slots big' : o.slots.some(s => s.label) ? 'labels shown' : fam.length !== 1 ? 'family slots ' + fam.length : kidSlots.length ? 'kid slots ' + kidSlots.length : !o.slots.some(s => s.name === '仓库') ? 'no storehouse slot' : !o.slots[0].meter ? 'no meter' : icoBad(o), { w: o.w, h: o.h, slots: o.slots.map(s => s.name + ' ' + s.n) });
      // hover the family slot: kids and jobs are in the tooltip
      const fi = o.slots.findIndex(s => s.name === '家人'); const box = await p.locator('#inv .slot').nth(fi).boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(250);
      const t = await p.evaluate(() => { const e = document.getElementById('invTip'); return e && !e.hidden ? e.textContent : ''; }); await shot(p, 'late_tooltip', 140);
      check('late_tooltip (family)', /小豆/.test(t) && /小米/.test(t) ? null : 'text ' + t, { t: t.slice(0, 120) });
      // the storehouse slot opens the storehouse
      const si = o.slots.findIndex(s => s.name === '仓库'); await p.locator('#inv .slot').nth(si).hover(); await p.waitForTimeout(200);
      const st = await p.evaluate(() => (document.getElementById('invTip') || {}).textContent || ''); await shot(p, 'late_store_tooltip', 140);
      await p.locator('#inv .slot').nth(si).click(); await p.waitForTimeout(100);
      const open = await p.evaluate(() => !document.getElementById('store').hidden);
      check('late_store', !open ? 'store did not open' : !/可卖/.test(st) ? 'tip ' + st : null, { open, st: st.slice(0, 120) });
      await p.keyboard.press('Escape');
      // collapse again: pref sticks across a reload
      await p.click('#inv .invtog'); await p.waitForTimeout(100); const c = await p.evaluate(read); await shot(p, 'late_collapsed', 30);
      await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 }); await p.evaluate(() => { __farm.SAVE.off = true; const o = document.getElementById('offline'); if (o) o.hidden = true; });
      const c2 = await p.evaluate(read);
      check('late_collapsed', !/slim/.test(c.cls) || c.pref !== 'slim' ? 'collapse ' + c.cls + ' ' + c.pref : !/slim/.test(c2.cls) ? 'pref lost on reload' : null, { cls: c.cls, pref: c.pref, after: c2.cls });
      // the snapshot does not change (no save field for this)
      const sv = await p.evaluate(() => { const s = __farm.snapshot(); return { v: s.saveVersion, inv: JSON.stringify(s).includes('ui:inv') }; });
      check('save untouched', sv.v !== 15 || sv.inv ? JSON.stringify(sv) : null, sv);
    }
    await p.context().close(); });

  // 3. an early player can collapse too, and a late player who chose open sees the compact bar at once
  await run('early_collapsed', async () => { const p = await page(null, 'slim'); const r = await p.evaluate(read); await shot(p, 'early_collapsed', 30);
    check('early_collapsed', CHECK && !/slim/.test(r.cls) ? 'mode ' + r.cls : null, { cls: r.cls, h: r.h, slots: r.slots.map(s => s.name + ' ' + s.n) }); await p.context().close(); });
  await run('late_busy', async () => { const p = await page(LATE, 'open');
    await p.evaluate(() => { const f = __farm, F = f.FARMER; F.saplings.apple = 3; F.saplings.orange = 2; F.crops = ['koi', 'crucian', 'sardine', { type: 'pumpkin', glow: 1 }, { type: 'pumpkin', giant: 1 }, { type: 'egg', rare: 'gold' }]; f.refreshUI(); });
    const r = await p.evaluate(read); await shot(p, 'late_busy');
    check('late_busy', icoBad(r) || (new Set(r.slots.map(s => s.top)).size !== 1 ? 'rows' : null), { w: r.w, slots: r.slots.map(s => s.name + ' ' + s.n + ' ' + s.ico.w + 'x' + s.ico.h) }); await p.context().close(); });

  await b.close(); server.close();
  if (errs.length) { console.log('page errors:', errs); fails.push('page errors ' + errs.length); }
  console.log(fails.length ? 'FAILED ' + fails.length + '\n' + fails.join('\n') : 'all hotbar checks ok');
  process.exit(fails.length ? 1 : 0);
})();
