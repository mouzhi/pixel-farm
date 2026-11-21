// v5.11.0.22: screenshots of the stuck "需要重新授权" panel and the restored state.
//   node tools/sync-shots.js   writes $PF_SHOTS/sync_{before,after}.png
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + '/index.html?manual');
  await p.waitForFunction(() => window.__farm && __farm.spritesReady() && window.PFPlaylog, null, { timeout: 20000 });
  await p.evaluate(() => {
    const o = document.getElementById('offline'); if (o) o.hidden = true;
    __farm.SAVE.off = true; __farm.setAngle(0); __farm.panTo(96, 70); __farm.advance(0.2, 10);
    const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'granted' });
    window.__syncDir = dir;
    PFPlaylog.installDir(dir, 'prompt');
    const btn = document.getElementById('menuBtn'); if (document.getElementById('menu').hidden) btn.click();
  });
  await p.waitForFunction(() => {
    const h = document.getElementById('syncHint'), m = document.getElementById('menu');
    return h && !h.hidden && m && !m.hidden && /点此恢复本地同步/.test(m.innerText);
  }, null, { timeout: 3000 });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, 'sync_before.png') });

  await p.evaluate(() => { addEventListener('pf:say', e => { window.__syncSays = (window.__syncSays || []).concat(String(e.detail)); }); });
  await p.click('#menu button[data-a="syncresume"]');
  await p.waitForFunction(() => PFPlaylog.status().granted && document.getElementById('syncHint').hidden, null, { timeout: 5000 });
  await p.waitForFunction(() => {
    const s = document.getElementById('say');
    return (s && !s.hidden && s.textContent === '本地同步已恢复') || (window.__syncSays || []).includes('本地同步已恢复');
  }, null, { timeout: 3000 });
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, 'sync_after.png') });

  const r = await p.evaluate(() => ({
    ver: __farm.version, st: PFPlaylog.status(),
    hintHidden: document.getElementById('syncHint').hidden,
    menu: document.getElementById('menu').innerText,
    say: (document.getElementById('say') || {}).textContent,
    wrote: !!(window.__syncDir.files['pixel-farm-save.json'] && window.__syncDir.files['pixel-farm-save.json'].text)
  }));
  await b.close();
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  const bad = r.ver !== '5.11.0.23' ? 'ver ' + r.ver
    : !r.st.granted ? 'not granted'
    : !r.hintHidden ? 'hint still shown'
    : !/已同步到本机/.test(r.menu) ? 'menu ' + r.menu
    : !r.wrote ? 'no file written'
    : (errs.length ? 'errors ' + errs.join(' | ') : null);
  console.log(bad ? 'FAIL' : 'ok  ', 'sync-shots', JSON.stringify({ ver: r.ver, granted: r.st.granted, say: r.say }));
  if (bad) { console.error(bad); process.exit(1); }
  console.log('sync-shots ok');
})().catch(err => { console.error(err); process.exit(1); });
