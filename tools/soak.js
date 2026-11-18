// Soak (PF_ANIMALS=1 to soak a full pasture; PF_FAMILY=1 adds the manor, 阿禾 and two children, 4 people working; PF_WOOD=1 adds the axes, 林场 and the lumber hut with an empty storehouse; PF_CODEX=1 opens the 图鉴 panel with a few ornamental fish): real-time rAF mode, fast time, periodic rotation sweeps; samples canvas count/pixels, heap, arrays, frame time.
const { chromium } = require('playwright-core');
const URL = process.argv[2] || (process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html?speed=12';
const SECS = +process.argv[3] || 180;
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-precise-memory-info'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => {
    const st = window.__cv = { made: 0, alive: 0, px: 0, maxAlive: 0, maxPx: 0 };
    const reg = new FinalizationRegistry(a => { st.alive--; st.px -= a; });
    const ce = Document.prototype.createElement;
    Document.prototype.createElement = function (t, ...r) { const el = ce.call(this, t, ...r);
      if (String(t).toLowerCase() === 'canvas') { st.made++; st.alive++; let area = 0;
        const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width'), desch = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
        const upd = () => { const a = el.width * el.height; st.px += a - area; area = a; el.__a = a; st.maxPx = Math.max(st.maxPx, st.px); };
        Object.defineProperty(el, 'width', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); upd(); } });
        Object.defineProperty(el, 'height', { get() { return desch.get.call(this); }, set(v) { desch.set.call(this, v); upd(); } });
        upd(); const box = { a: 0 }; reg.register(el, 0); el.__box = box; st.maxAlive = Math.max(st.maxAlive, st.alive); }
      return el; };
    // frame-time probe
    window.__ft = []; let last = 0; const f = t => { if (last) window.__ft.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
  });
  await p.goto(URL); await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  // PF_ANIMALS=1: buy every pen, every animal and all six pets (v4.6 load); the rotation sweeps pass all of them
  if (process.env.PF_ANIMALS) await p.evaluate(() => { const f = __farm; f.S.coins = 1e6; for (const id of ['forest', 'orchard', 'pasture', 'coop', 'sty', 'fold', 'shed', ...Array(6).fill('chicken'), ...Array(3).fill('pig'), ...Array(3).fill('sheep'), ...Array(3).fill('cow'), ...Array(3).fill('cat'), ...Array(3).fill('dog')]) f.buy(id); f.panTo(280, -54); });
  // PF_FAMILY=1 (v5.0): the 庄园, a fence, 阿禾 living here and two children (one teen, one helper) — four people on the board
  if (process.env.PF_FAMILY) await p.evaluate(() => { const f = __farm, S = f.S; S.coins = Math.max(S.coins, 1e6); f.FARMER.wood = 2000;
    for (const id of ['axe', 'field', 'field', 'field', 'coop', 'chicken', 'chicken', 'house', 'house', 'house', 'fence']) f.buy(id);
    S.day = Math.max(S.day, 50); Object.assign(S.family, { love: 100, met: 3, moved: S.day - 48, kids: [{ id: 'kid0', name: '小豆', born: S.day - 45 }, { id: 'kid1', name: '小米', born: S.day - 32 }] }); f.syncFamily(); f.panTo(70, 60); });
  // PF_WOOD=1 (v5.3.1): the axe upgrades, 林场 and the lumber hut, wood at 0, so the farmer keeps walking to the forest to chop
  if (process.env.PF_WOOD) await p.evaluate(() => { const f = __farm; f.S.coins = Math.max(f.S.coins, 1e6); f.FARMER.wood = Math.max(f.FARMER.wood, 100); for (const id of ['axe', 'axe', 'axe', 'forest', 'lumber', 'house', 'house', 'house']) f.buy(id); f.FARMER.wood = 0; }); // after PF_FAMILY, which fills the storehouse
  // PF_CODEX=1 (v5.4.0): a few ornamental fish, a full-ish book, the 图鉴 panel open
  if (process.env.PF_CODEX) await p.evaluate(() => { const f = __farm, S = f.S, CX = f.BOOK || window.PFCodex;
    S.coins = Math.max(S.coins, 1e6); f.buy('fishfood'); f.buy('goldfish');
    f.placePondFish('goldfish'); f.placePondFish('koi');
    ['crucian','carp','koi','bass','sardine'].forEach((id, i) => CX.record(S.codex, CX.keyFish(id), 3 + i));
    f.noteProgress({ pondCount: S.pondFish.length, caughtKoi: true });
    const b = document.getElementById('codexBtn'); if (b) b.click(); f.panTo(40, 90); });
  const cdp = await p.context().newCDPSession(p); await cdp.send('Performance.enable');
  const t0 = Date.now(); let i = 0;
  while ((Date.now() - t0) / 1000 < SECS) {
    // rotate for ~2 s every other sample
    if (i % 2 === 0) { const k = i % 4 === 0 ? 'e' : 'q'; await p.keyboard.down(k); await p.waitForTimeout(2500); await p.keyboard.up(k); }
    await p.waitForTimeout(7500);
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const m = await cdp.send('Performance.getMetrics'); const g = n => (m.metrics.find(x => x.name === n) || {}).value;
    const s = await p.evaluate(() => { const ft = window.__ft.splice(0); ft.sort((a, b) => a - b);
      return { day: __farm.S.day, t: Math.floor(__farm.S.t), ev: __farm.S.events.length, cv: Object.assign({}, window.__cv), fps: ft.length / 10, p95: ft[Math.floor(ft.length * 0.95)] | 0 }; });
    console.log(`${Math.round((Date.now() - t0) / 1000)}s day${s.day} ${Math.floor(s.t / 60)}:${String(s.t % 60).padStart(2, '0')} heap=${(g('JSHeapUsedSize') / 1e6).toFixed(1)}MB nodes=${g('Nodes')} canvases made=${s.cv.made} alive=${s.cv.alive} px=${(s.cv.px / 1e6).toFixed(2)}M (${(s.cv.px * 4 / 1e6).toFixed(0)}MB) events=${s.ev} fps=${s.fps.toFixed(0)} p95=${s.p95}ms`);
    i++;
  }
  await p.screenshot({ path: process.argv[4] || '/tmp/soak_end.png' });
  console.log('errors', errs); await b.close();
})();
