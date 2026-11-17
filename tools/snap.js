// usage: node snap.js "<query>" seconds out.png [canvasOnly]
const { chromium } = require('playwright-core');
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto((process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html?manual&' + (process.argv[2] || '')); await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const t0 = Date.now(); await p.evaluate(s => __farm.advance(s, 30), +(process.argv[3] || 0)); const ms = Date.now() - t0;
  await p.screenshot({ path: process.argv[4] || '/tmp/snap.png' });
  if (process.argv[5]) { const d = await p.evaluate(() => document.getElementById('game').toDataURL()); require('fs').writeFileSync(process.argv[5], Buffer.from(d.split(',')[1], 'base64')); }
  console.log(JSON.stringify(await p.evaluate(() => ({ day: __farm.S.day, t: __farm.S.t, label: __farm.S.label, coins: __farm.S.coins }))), 'advance ms', ms, errs); await b.close(); })();
