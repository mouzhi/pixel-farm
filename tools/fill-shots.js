// v5.11.0.4.1: the game canvas covers the whole window at every size and DPR (no letterbox), with whole-number pixel scale.
//   node tools/fill-shots.js [outdir]     (default $PF_SHOTS or /workspace/pf-shots; shots fill_<w>x<h>@<dpr>.png; exits 1 on any failure)
// Env: CHROME=/path/to/chrome (default /usr/bin/google-chrome)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.argv[2] || process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const SIZES = [[1024, 546, 1], [1366, 657, 1], [1920, 969, 1], [1280, 800, 1], [1536, 730, 1.25], [1280, 619, 1.5], [1440, 900, 2], [2560, 1300, 1]];
const fail = [];
const measure = () => { const c = document.getElementById('game'), r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, W: c.width, H: c.height, scale: r.width * dpr / c.width, scaleY: r.height * dpr / c.height }; };
const check = (tag, m) => {
  const bad = [];
  if (m.l > 0.01 || m.t > 0.01 || m.r < m.vw - 0.01 || m.b < m.vh - 0.01) bad.push(`gap ${JSON.stringify([m.l, m.t, m.r, m.b])} vs ${m.vw}x${m.vh}`);
  if (Math.abs(m.scale - Math.round(m.scale)) > 1e-6 || Math.abs(m.scaleY - m.scale) > 1e-6) bad.push('non-integer scale ' + m.scale + '/' + m.scaleY);
  // overhang is under one framebuffer pixel on each axis (cropping stays tiny)
  const px = m.scale / (m.dpr || 1);
  if (m.r - m.l - m.vw > px + 0.01 || m.b - m.t - m.vh > px + 0.01) bad.push(`overhang ${m.r - m.l - m.vw}x${m.b - m.t - m.vh} > ${px}`);
  console.log((bad.length ? 'FAIL ' : 'ok   ') + tag, JSON.stringify(m), bad.join('; '));
  if (bad.length) fail.push(tag + ': ' + bad.join('; '));
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [w, h, dpr] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(base + '/index.html'); await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 20000 });
    await p.waitForTimeout(300);
    const tag = `${w}x${h}@${dpr}`;
    check(tag, { ...(await p.evaluate(measure)), dpr });
    await p.screenshot({ path: path.join(OUT, `fill_${tag}.png`) });
    await p.reload(); await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 20000 }); await p.waitForTimeout(300); // after a reload (saved game, camera)
    check(tag + ' reload', { ...(await p.evaluate(measure)), dpr });
    if (w === 1024) { // wheel zoom in and back out, then a window resize: still covering
      await p.mouse.move(w / 2, h / 2); for (let i = 0; i < 2; i++) { await p.mouse.wheel(0, -100); await p.waitForTimeout(60); }
      check(tag + ' zoom+2', { ...(await p.evaluate(measure)), dpr });
      await p.screenshot({ path: path.join(OUT, `fill_${tag}_zoom2.png`) });
      for (let i = 0; i < 2; i++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(60); }
      await p.setViewportSize({ width: 1180, height: 610 }); await p.waitForTimeout(200);
      check('resize 1024x546 -> 1180x610', { ...(await p.evaluate(measure)), dpr });
    }
    if (errs.length) fail.push(tag + ' page errors: ' + errs.join(' | '));
    await ctx.close();
  }
  // ?view=WxH (wide screenshots) keeps its fixed framebuffer
  { const p = await b.newPage({ viewport: { width: 1600, height: 1000 } }); await p.goto(base + '/index.html?view=800x500'); await p.waitForFunction(() => window.__farm && __farm.spritesReady(), null, { timeout: 20000 });
    const m = await p.evaluate(measure); if (m.W !== 800 || m.H !== 500) fail.push('view=800x500 got ' + m.W + 'x' + m.H); else console.log('ok   view=800x500 fixed'); await p.close(); }
  await b.close(); server.close();
  if (fail.length) { console.error('FAILED\n' + fail.join('\n')); process.exit(1); }
  console.log('fill-shots: all ok ->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
