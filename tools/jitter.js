// diff consecutive frames: node jitter.js "<query>" [w h dpr]
const { chromium } = require('playwright-core');
(async () => { const [q, w = 1280, h = 800, dpr = 1] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
  await p.goto((process.env.PF_URL || 'http://127.0.0.1:8765') + '/index.html?manual&' + q); await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const r = await p.evaluate(() => { const f = __farm, c = document.getElementById('game'), g = c.getContext('2d');
    f.advance(+(new URLSearchParams(location.search).get("pre") || 3), 30); let prev = g.getImageData(0, 0, c.width, c.height).data, tot = 0, maxd = 0; const boxes = [];
    for (let i = 0; i < 60; i++) { f.advance(1 / 30, 30); const cur = g.getImageData(0, 0, c.width, c.height).data; let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let k = 0; k < cur.length; k += 4) if (cur[k] !== prev[k] || cur[k + 1] !== prev[k + 1] || cur[k + 2] !== prev[k + 2]) { n++; const px = (k / 4) % c.width, py = Math.floor(k / 4 / c.width); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
      tot += n; maxd = Math.max(maxd, n); if (n) boxes.push([x0, y0, x1, y1]); prev = cur; }
    const r = c.getBoundingClientRect(); return { avgChanged: Math.round(tot / 60), maxChanged: maxd, sampleBoxes: boxes.slice(0, 4), css: [r.left, r.top, r.width, r.height], dpr: devicePixelRatio, devPxPerBufPx: r.width * devicePixelRatio / c.width }; });
  console.log(JSON.stringify(r)); await b.close(); })();
