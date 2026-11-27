// Perf + pixel compare of two builds of the game in the browser harness (v5.12.8 perf port).
//   node tools/perf-compare.js <baseRoot> [outDir]       # compares <baseRoot> (e.g. a worktree of origin/main) with this repo
// Env: PF_SAVE=path to a save file (the demo save; default: fresh game), CHROME=/path/to/chrome
// Both builds run in ?manual mode with a seeded Math.random and a frozen Date.now, so the same save + the same steps give the same picture.
// Reports canvas calls per frame (every 2D context, drawImage included) and ms per frame for: dawn (sleeping Zs), dry day, rain; and the
// pixel difference of the canvas after each scenario (python3 + PIL + numpy for the diff, plus compare images side by side).
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const NEW = path.resolve(__dirname, '..'), BASE = path.resolve(process.argv[2] || ''), OUT = path.resolve(process.argv[3] || '/tmp/pf-perf-compare');
const SAVE = process.env.PF_SAVE ? fs.readFileSync(process.env.PF_SAVE, 'utf8') : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const serve = root => new Promise(res => { const s = http.createServer((req, rsp) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); } rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rsp); }); s.listen(0, '127.0.0.1', () => res(s)); });
async function run(root, tag) {
  const srv = await serve(root), b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }), errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(([save]) => {
    let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const T = save ? JSON.parse(save).savedAt + 3600e3 * 2 : 1.8e12; Date.now = () => T;
    if (save && !localStorage.getItem('mouzhi/pixel-farm:save')) localStorage.setItem('mouzhi/pixel-farm:save', save);
    const calls = window.__calls = { on: false, n: {} };
    for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) if (C) for (const m of ['drawImage', 'fillRect', 'clearRect', 'fill', 'stroke', 'save', 'restore', 'setTransform', 'translate', 'scale', 'rotate', 'clip', 'beginPath', 'rect', 'arc', 'ellipse', 'moveTo', 'lineTo', 'getImageData', 'putImageData', 'createImageData', 'fillText', 'strokeRect', 'createLinearGradient', 'createRadialGradient']) {
      const o = C.prototype[m]; C.prototype[m] = function (...x) { if (calls.on) calls.n[m] = (calls.n[m] || 0) + 1; return o.apply(this, x); }; }
  }, [SAVE]);
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?manual`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.refreshUI, null, { timeout: 30000 });
  const res = {}; fs.mkdirSync(OUT, { recursive: true });
  const scen = async (name, setup) => {
    await p.evaluate(setup);
    const r = await p.evaluate(() => { const f = __farm, S = f.S, WX = f.WX; for (let i = 0; i < 30; i++) f.advance(1 / 30, 30);
      window.__calls.n = {}; window.__calls.on = true; const t0 = performance.now(), N = 90; for (let i = 0; i < N; i++) f.advance(1 / 30, 30); const ms = (performance.now() - t0) / N; window.__calls.on = false;
      const n = window.__calls.n; let tot = 0; for (const k in n) { tot += n[k]; n[k] = +(n[k] / N).toFixed(1); }
      const raining = !!(WX && WX.isRaining(S.weather, S.day, S.t));
      return { total: +(tot / N).toFixed(1), msPerFrame: +ms.toFixed(2), raining, t: Math.round(S.t), day: S.day, by: n, live: f.INS ? f.INS.live.length : 0, png: document.getElementById('c') ? document.getElementById('c').toDataURL() : document.querySelector('canvas').toDataURL() }; });
    fs.writeFileSync(`${OUT}/${tag}-${name}.png`, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; res[name] = r;
  };
  await scen('dawn', () => {});                                                  // the save's own start: the farmer is asleep (Zs)
  await scen('dry', () => { const S = __farm.S; S.t = 12 * 60; });               // midday
  await scen('rain', () => { const f = __farm; f.S.t = 12 * 60; f.forceRain(12 * 60 - 5, 600); for (let i = 0; i < 40; i++) f.advance(1, 30); });
  res.errors = errs; await b.close(); srv.close(); return res;
}
(async () => {
  const a = await run(BASE, 'base'), n = await run(NEW, 'new'), rows = [];
  for (const k of ['dawn', 'dry', 'rain']) {
    const d = JSON.parse(execFileSync('python3', ['-c', `
import sys,json
from PIL import Image, ImageChops
import numpy as np
a=Image.open('${OUT}/base-${k}.png').convert('RGB'); b=Image.open('${OUT}/new-${k}.png').convert('RGB')
x=np.asarray(a).astype(int); y=np.asarray(b).astype(int); d=np.abs(x-y)
cmp=Image.new('RGB',(a.width*2+10,a.height),(255,255,255)); cmp.paste(a,(0,0)); cmp.paste(b,(a.width+10,0)); cmp.save('${OUT}/compare-${k}.png')
print(json.dumps({'maxDiff':int(d.max()),'diffPixels':int((d.max(axis=2)>0).sum()),'pixels':int(d.shape[0]*d.shape[1])}))`], { encoding: 'utf8' }));
    rows.push({ scenario: k, base: { calls: a[k].total, ms: a[k].msPerFrame, raining: a[k].raining, insects: a[k].live }, new: { calls: n[k].total, ms: n[k].msPerFrame, raining: n[k].raining, insects: n[k].live }, ...d });
  }
  console.log(JSON.stringify(rows, null, 1)); fs.writeFileSync(`${OUT}/result.json`, JSON.stringify({ base: a, new: n, rows }, null, 1));
  if (a.errors.length || n.errors.length) console.log('page errors', a.errors.slice(0, 3), n.errors.slice(0, 3));
})();
