const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto((process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html?manual=1&speed=12&cursor=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const fps = 15, N = 330; let mx = 900, my = 420; await p.mouse.move(mx, my);
  // scripted manual camera: drag right, hold, drag back left past the start, then Q key turn, then R reset
  const drags = [[45, 95, 1100, 380, 640, 400], [150, 215, 420, 430, 1000, 420]];
  for (let i = 0; i < N; i++) {
    for (const [f0, f1, x0, y0, x1, y1] of drags) {
      if (i === f0) { mx = x0; my = y0; await p.mouse.move(mx, my); await p.mouse.down(); }
      if (i > f0 && i <= f1) { const t = (i - f0) / (f1 - f0), e = t * t * (3 - 2 * t); mx = x0 + (x1 - x0) * e; my = y0 + (y1 - y0) * e + Math.sin(t * 3) * 8; await p.mouse.move(mx, my); }
      if (i === f1) await p.mouse.up();
    }
    if (i === 240) await p.keyboard.down('e'); if (i === 262) await p.keyboard.up('e');
    if (i === 285) await p.keyboard.press('r');
    await p.evaluate(fps => window.__farm.advance(1 / fps, fps), fps);
    await p.screenshot({ path: `/tmp/pf-frames/f${String(i).padStart(4, '0')}.png` });
  }
  console.log('frames', N, 'state', await p.evaluate(() => [__farm.S.day, Math.floor(__farm.S.t % 1440 / 60), __farm.S.coins]), 'errs', errs); await b.close();
})();
