const { chromium } = require('playwright-core');
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto((process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html'); await p.waitForFunction(() => window.__farm && __farm.spritesReady()); await p.waitForTimeout(6000); // idle warm-up
  const count = () => p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / 3); }; requestAnimationFrame(f); }));
  console.log('idle fps', (await count()).toFixed(1));
  await p.keyboard.down('e'); console.log('rotating fps', (await count()).toFixed(1)); await p.keyboard.up('e');
  await b.close(); })();
