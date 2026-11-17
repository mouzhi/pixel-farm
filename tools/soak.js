// Soak (PF_ANIMALS=1 to soak a full pasture): real-time rAF mode, fast time, periodic rotation sweeps; samples canvas count/pixels, heap, arrays, frame time.
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
  // PF_ANIMALS=1: buy the pasture, both buildings and every animal, and watch the pen (Phase 4 load)
  if (process.env.PF_ANIMALS) await p.evaluate(() => { const f = __farm; f.S.coins = 1e6; for (const id of ['pasture', 'coop', 'shed', ...Array(6).fill('chicken'), ...Array(3).fill('sheep'), ...Array(2).fill('cow')]) f.buy(id); f.panTo(280, -54); });
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
