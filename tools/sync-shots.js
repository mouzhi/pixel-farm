// v5.11.0.25: screenshots of the stuck "需要重新授权" panel, a hanging
// requestPermission that still opens the folder picker in the same click,
// a clear status when the picker cannot open, and a clean cancel when it is closed.
//   node tools/sync-shots.js   writes $PF_SHOTS/sync_{before,after,reauth_prompt,reauth_fallback,reauth_fail,reauth_cancel}.png
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
    const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    dir.requestPermission = () => new Promise(() => {}); // live Chrome hang
    window.__syncDir = dir;
    window.__picked = 0;
    const fresh = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    window.__freshDir = fresh;
    PFPlaylog.installDir(dir, 'prompt');
    PFPlaylog.setPicker(async (opts) => {
      window.__picked++;
      window.__startInSame = !!(opts && opts.startIn === dir);
      return fresh;
    });
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
    picked: window.__picked,
    startInSame: window.__startInSame,
    wrote: !!(window.__freshDir.files['pixel-farm-save.json'] && window.__freshDir.files['pixel-farm-save.json'].text)
  }));

  // Silent 'prompt' (no permission UI): same click must open the folder picker.
  const p2 = await ctx.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(String(e))); p2.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
  await p2.goto(base + '/index.html?manual');
  await p2.waitForFunction(() => window.__farm && __farm.spritesReady() && window.PFPlaylog, null, { timeout: 20000 });
  await p2.evaluate(() => {
    const o = document.getElementById('offline'); if (o) o.hidden = true;
    __farm.SAVE.off = true; __farm.setAngle(0); __farm.panTo(96, 70); __farm.advance(0.2, 10);
    const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'prompt' });
    dir.requestPermission = () => new Promise(() => {});
    window.__syncDir = dir;
    window.__picked = 0;
    window.__startInSame = false;
    PFPlaylog.installDir(dir, 'prompt');
    const fresh = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'granted' });
    window.__freshDir = fresh;
    PFPlaylog.setPicker(async (opts) => {
      window.__picked++;
      window.__startInSame = !!(opts && opts.startIn === dir);
      return fresh;
    });
    const btn = document.getElementById('menuBtn'); if (document.getElementById('menu').hidden) btn.click();
  });
  await p2.waitForFunction(() => {
    const h = document.getElementById('syncHint'), m = document.getElementById('menu');
    return h && !h.hidden && m && !m.hidden && /点此恢复本地同步/.test(m.innerText);
  }, null, { timeout: 3000 });
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: path.join(OUT, 'sync_reauth_prompt.png') });
  await p2.evaluate(() => { addEventListener('pf:say', e => { window.__syncSays = (window.__syncSays || []).concat(String(e.detail)); }); });
  await p2.click('#menu button[data-a="syncresume"]');
  await p2.waitForFunction(() => PFPlaylog.status().granted && document.getElementById('syncHint').hidden, null, { timeout: 5000 });
  await p2.waitForFunction(() => {
    const s = document.getElementById('say');
    return (s && !s.hidden && s.textContent === '本地同步已恢复') || (window.__syncSays || []).includes('本地同步已恢复');
  }, null, { timeout: 3000 });
  await p2.waitForTimeout(200);
  await p2.screenshot({ path: path.join(OUT, 'sync_reauth_fallback.png') });
  const r2 = await p2.evaluate(() => ({
    st: PFPlaylog.status(),
    hintHidden: document.getElementById('syncHint').hidden,
    picked: window.__picked,
    startInSame: window.__startInSame,
    wroteFresh: !!(window.__freshDir.files['pixel-farm-save.json'] && window.__freshDir.files['pixel-farm-save.json'].text),
    requestCalls: window.__syncDir.requestCalls,
    say: (document.getElementById('say') || {}).textContent
  }));

  // Same silent prompt, but the picker cannot open (activation lost): show a clear status.
  const p3 = await ctx.newPage();
  const errs3 = [];
  p3.on('pageerror', e => errs3.push(String(e))); p3.on('console', m => { if (m.type() === 'error') errs3.push(m.text()); });
  await p3.goto(base + '/index.html?manual');
  await p3.waitForFunction(() => window.__farm && __farm.spritesReady() && window.PFPlaylog, null, { timeout: 20000 });
  await p3.evaluate(() => {
    const o = document.getElementById('offline'); if (o) o.hidden = true;
    __farm.SAVE.off = true; __farm.setAngle(0); __farm.panTo(96, 70); __farm.advance(0.2, 10);
    const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt', requestResult: 'prompt' });
    PFPlaylog.installDir(dir, 'prompt');
    PFPlaylog.setPicker(async () => { const e = new Error('no gesture'); e.name = 'NotAllowedError'; throw e; });
    const btn = document.getElementById('menuBtn'); if (document.getElementById('menu').hidden) btn.click();
  });
  await p3.waitForFunction(() => {
    const h = document.getElementById('syncHint'), m = document.getElementById('menu');
    return h && !h.hidden && m && !m.hidden && /点此恢复本地同步/.test(m.innerText);
  }, null, { timeout: 3000 });
  await p3.click('#menu button[data-a="syncresume"]');
  await p3.waitForFunction(() => {
    const st = PFPlaylog.status(), m = document.getElementById('menu');
    return st.needsRepick && st.lastError && m && /重新选择同步文件夹/.test(m.innerText) && /原因：/.test(m.innerText);
  }, null, { timeout: 5000 });
  await p3.waitForTimeout(200);
  await p3.screenshot({ path: path.join(OUT, 'sync_reauth_fail.png') });
  const r3 = await p3.evaluate(() => ({
    st: PFPlaylog.status(),
    menu: document.getElementById('menu').innerText,
    hint: (document.getElementById('syncHint') || {}).textContent
  }));

  // Closing the picker is a cancel, not a failure.
  const p4 = await ctx.newPage();
  const errs4 = [];
  p4.on('pageerror', e => errs4.push(String(e))); p4.on('console', m => { if (m.type() === 'error') errs4.push(m.text()); });
  await p4.goto(base + '/index.html?manual');
  await p4.waitForFunction(() => window.__farm && __farm.spritesReady() && window.PFPlaylog, null, { timeout: 20000 });
  await p4.evaluate(() => {
    const o = document.getElementById('offline'); if (o) o.hidden = true;
    __farm.SAVE.off = true; __farm.setAngle(0); __farm.panTo(96, 70); __farm.advance(0.2, 10);
    const dir = PFPlaylog.memoryDir({ name: 'pixelfarm', permission: 'prompt' });
    dir.requestPermission = () => new Promise(() => {});
    PFPlaylog.installDir(dir, 'prompt');
    PFPlaylog.setPicker(async () => { const e = new Error('The picker was closed.'); e.name = 'AbortError'; throw e; });
    const btn = document.getElementById('menuBtn'); if (document.getElementById('menu').hidden) btn.click();
  });
  await p4.waitForFunction(() => {
    const h = document.getElementById('syncHint'), m = document.getElementById('menu');
    return h && !h.hidden && m && !m.hidden && /点此恢复本地同步/.test(m.innerText);
  }, null, { timeout: 3000 });
  await p4.click('#menu button[data-a="syncresume"]');
  await p4.waitForFunction(() => {
    const st = PFPlaylog.status(), m = document.getElementById('menu');
    return st.needsRepick && !st.lastError && m && /重新选择同步文件夹/.test(m.innerText) && !/原因：/.test(m.innerText);
  }, null, { timeout: 5000 });
  await p4.waitForTimeout(200);
  await p4.screenshot({ path: path.join(OUT, 'sync_reauth_cancel.png') });
  const r4 = await p4.evaluate(() => ({
    st: PFPlaylog.status(),
    menu: document.getElementById('menu').innerText,
    sayHidden: !document.getElementById('say') || document.getElementById('say').hidden
      || !/没能恢复/.test(document.getElementById('say').textContent || '')
  }));

  await b.close();
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  const allErrs = errs.concat(errs2, errs3, errs4);
  const bad = r.ver !== '5.11.0.26' ? 'ver ' + r.ver
    : r.picked !== 1 ? 'hang path did not open picker'
    : !r.startInSame ? 'hang path startIn was not the stored handle'
    : !r.st.granted ? 'not granted'
    : !r.hintHidden ? 'hint still shown'
    : !/已同步到本机/.test(r.menu) ? 'menu ' + r.menu
    : !r.wrote ? 'no file written'
    : r2.picked !== 1 ? 'prompt path did not open picker'
    : !r2.startInSame ? 'picker startIn was not the stored handle'
    : r2.requestCalls !== 0 ? 'stored handle requestPermission was awaited: ' + r2.requestCalls
    : !r2.st.granted ? 'prompt fallback not granted'
    : !r2.hintHidden ? 'prompt fallback hint still shown'
    : !r2.wroteFresh ? 'prompt fallback wrote no file'
    : !r3.st.needsRepick ? 'fail path did not set needsRepick'
    : !/重新选择同步文件夹/.test(r3.st.lastError || '') ? 'fail lastError ' + r3.st.lastError
    : !/原因：/.test(r3.menu) ? 'fail menu missing reason ' + r3.menu
    : !r4.st.needsRepick ? 'cancel path did not set needsRepick'
    : r4.st.lastError ? 'cancel should not set lastError: ' + r4.st.lastError
    : !/重新选择同步文件夹/.test(r4.menu) ? 'cancel menu ' + r4.menu
    : /原因：/.test(r4.menu) ? 'cancel should not show a failure reason'
    : (allErrs.length ? 'errors ' + allErrs.join(' | ') : null);
  console.log(bad ? 'FAIL' : 'ok  ', 'sync-shots', JSON.stringify({ ver: r.ver, granted: r.st.granted, say: r.say, hang: { picked: r.picked }, fallback: r2, fail: { lastError: r3.st.lastError }, cancel: { needsRepick: r4.st.needsRepick, lastError: r4.st.lastError } }));
  if (bad) { console.error(bad); process.exit(1); }
  console.log('sync-shots ok');
})().catch(err => { console.error(err); process.exit(1); });
