const { chromium } = require('playwright-core');
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const q of ['', '?art=sc']) { const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html') + q); await p.waitForTimeout(3000);
  console.log(q || 'default', await p.evaluate(() => window.__farm.S.label), errs); await p.close(); }
  await b.close(); })();
