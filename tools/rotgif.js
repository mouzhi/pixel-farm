// full camera turn at noon with wind on: frames of the raw canvas -> /tmp/rotA/f_###.png
const { chromium } = require('playwright-core'); const fs = require('fs');
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); fs.mkdirSync('/tmp/rotA', { recursive: true });
  await p.goto((process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  await p.evaluate(() => __farm.advance(75, 10)); const N = +(process.argv[2] || 144);
  for (let i = 0; i < N; i++) {
    const d = await p.evaluate(([i, N]) => { const t = i / N, e = t < 0.08 ? 0 : t > 0.92 ? 1 : (t - 0.08) / 0.84; __farm.setAngle(0.22 + (0.5 - 0.5 * Math.cos(Math.PI * e)) * 2 * Math.PI); __farm.advance(1 / 15, 15); return document.getElementById('game').toDataURL(); }, [i, N]);
    fs.writeFileSync(`/tmp/rotA/f_${String(i).padStart(3, '0')}.png`, Buffer.from(d.split(',')[1], 'base64')); }
  await b.close(); })();
