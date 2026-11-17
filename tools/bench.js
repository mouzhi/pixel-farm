const { chromium } = require('playwright-core');
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const t0 = Date.now(); await p.goto((process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady()); const load = Date.now() - t0;
  const r = await p.evaluate(() => { const out = {}; const st = 2 * Math.PI / 256; __farm.advance(1, 30);
    const run = (n, a0) => { const ts = []; for (let i = 0; i < n; i++) { __farm.setAngle(a0 + i * st); const t = performance.now(); __farm.render(); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return { avg: +(ts.reduce((a, b) => a + b) / n).toFixed(1), p50: +ts[n >> 1].toFixed(1), max: +ts[n - 1].toFixed(1) }; };
    out.static = (() => { const ts = []; for (let i = 0; i < 30; i++) { const t = performance.now(); __farm.render(); ts.push(performance.now() - t); } return +(ts.reduce((a, b) => a + b) / 30).toFixed(1); })();
    out.coldRotate = run(60, 0.22); out.warmRotate = run(60, 0.22); return out; });
  console.log('load ms', load, JSON.stringify(r), errs); await b.close(); })();
