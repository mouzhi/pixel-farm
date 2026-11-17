// capture the raw 426x266 frame (noon, default angle + one rotated angle) for before/after
const { chromium } = require('playwright-core');
const [port, out] = [process.argv[2], process.argv[3]];
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${port}/index.html?manual`); await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  for (const [name, a, tt] of [['noon', 0.22, 12 * 60], ['rot', 2.4, 12 * 60 + 5]]) {
    const url = await p.evaluate(([a, tt]) => { __farm.setAngle(a); while (__farm.S.t % 1440 < tt) __farm.advance(1); __farm.render(); return document.getElementById('game').toDataURL(); }, [a, tt]);
    require('fs').writeFileSync(`${out}_${name}.png`, Buffer.from(url.split(',')[1], 'base64')); }
  console.log('errors', errs); await b.close(); })();
