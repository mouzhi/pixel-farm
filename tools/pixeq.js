const { chromium } = require('playwright-core');
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const grab = async (port, a, t) => { const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(`http://127.0.0.1:${port}/index.html?manual&nowind`); await p.waitForFunction(() => window.__farm && __farm.spritesReady());
    const r = await p.evaluate(([a, t]) => { __farm.setAngle(a); __farm.advance(t); return Array.from(document.getElementById('game').getContext('2d').getImageData(0, 0, 426, 266).data); }, [a, t]);
    await p.close(); return r; };
  for (const [a, t] of [[0.22, 0], [0.9, 0], [1.3, 0], [2.9, 0], [4.4, 0], [5.8, 0]]) {
    const A = await grab(8767, a, t), B = await grab(8765, a, t); let diff = 0; for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) diff++;
    console.log('angle', a, 'sim s', t, 'differing px', diff, '/', A.length / 4); }
  await b.close(); })();
