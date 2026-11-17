// frames for the wind + water GIF: manual clock, 12 fps, crop around the pond and the forest edge
const { chromium } = require('playwright-core'); const fs = require('fs');
const [port, dir, N, crop] = [process.argv[2] || 8765, process.argv[3] || '/tmp/twgif', +(process.argv[4] || 120), (process.argv[5] || '0,30,260,236').split(',').map(Number)];
(async () => { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${port}/index.html?manual`); await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  await p.evaluate(() => { __farm.setSpeed(0.05); while (__farm.S.t % 1440 < 11 * 60) __farm.advance(1); __farm.advance(6, 30); });
  for (let i = 0; i < N; i++) { const url = await p.evaluate(([x, y, w, h]) => { __farm.advance(1 / 12, 12); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(document.getElementById('game'), x, y, w, h, 0, 0, w, h); return c.toDataURL(); }, crop);
    fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, Buffer.from(url.split(',')[1], 'base64')); }
  console.log('errors', errs); await b.close(); })();
