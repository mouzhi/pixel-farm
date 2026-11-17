// Browser test for sound (used by CI):  node tools/audio-smoke.js
// Checks: nothing plays before a user gesture; the first tap starts the generator at once, then the time-of-day track
// (assets/audio/) crossfades in; the farm clock switches tracks; a missing file falls back to the generator; game events play SFX;
// the music / SFX icons toggle, persist across a reload and do not overlap the other HUD buttons; no page errors.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(p).size, m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''), type = TYPES[path.extname(p)] || 'application/octet-stream';
  if (m) { const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1; res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1 }); return fs.createReadStream(p, { start: a, end: b }).pipe(res); }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size }); fs.createReadStream(p).pipe(res); // ranges let <audio> seek, as on GitHub Pages
});
let failed = 0;
async function test(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', String(e.message).split('\n')[0].slice(0, 300)); } }
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  const ctx = await b.newContext(); const p = await ctx.newPage({ viewport: { width: 1280, height: 800 } }), errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ready = () => p.waitForFunction(() => window.__farm && __farm.spritesReady() && window.PFAudio, null, { timeout: 15000 });
  await p.goto(`${base}/index.html?manual`); await ready();
  await test('silent until the first gesture, icons shown', async () => {
    const s = await p.evaluate(() => PFAudio.state()); assert.strictEqual(s.ctx, 'none'); assert.strictEqual(s.generating, false);
    assert.ok(await p.isVisible('#musicBtn')); assert.ok(await p.isVisible('#sfxBtn'));
    assert.strictEqual(await p.evaluate(() => PFAudio.play('coin')), false);
  });
  await test('icons do not overlap other HUD buttons', async () => {
    const hit = await p.evaluate(() => { const r = e => e.getBoundingClientRect(), a = r(document.getElementById('audioBar'));
      return [...document.querySelectorAll('#wrap > button, #wrap > div.panel, #minimap, #tools, #speed, #log')].filter(e => e.offsetParent && e.id !== 'audioBar')
        .filter(e => { const q = r(e); return q.width && !(q.right <= a.left || q.left >= a.right || q.bottom <= a.top || q.top >= a.bottom); }).map(e => e.id); });
    assert.deepStrictEqual(hit, []);
  });
  await test('first tap unlocks generative music', async () => {
    await p.mouse.click(640, 300);
    await p.waitForFunction(() => PFAudio.state().unlocked && PFAudio.state().generating, null, { timeout: 5000 });
    await p.waitForTimeout(1500); const s = await p.evaluate(() => PFAudio.state()); assert.strictEqual(s.ctx, 'running'); assert.ok(s.song && s.song.bpm >= 60);
  });
  await test('recorded track for the time of day crossfades in, then the generator stops', async () => {
    await p.waitForFunction(() => { const s = PFAudio.state(); return s.mode === 'files' && s.track && s.trackPlays >= 1; }, null, { timeout: 15000 });
    const s = await p.evaluate(() => PFAudio.state()); assert.ok(s.track.indexOf('assets/audio/' + s.slot + '.mp3') >= 0, s.track + ' / ' + s.slot);
    await p.waitForFunction(() => !PFAudio.state().generating, null, { timeout: 10000 });
  });
  await test('evening on the farm clock switches to the evening track', async () => {
    await p.evaluate(() => { const S = __farm.S; S.t = Math.floor(S.t / 1440) * 1440 + 17 * 60 + 30; });
    await p.waitForFunction(() => /evening\.mp3$/.test(PFAudio.state().track || ''), null, { timeout: 15000 });
  });
  await test('the track loops with a crossfade at its end', async () => {
    const n = await p.evaluate(() => { PFAudio._seekEnd(); return PFAudio.state().trackPlays; });
    await p.waitForFunction(n => PFAudio.state().trackPlays > n && /evening\.mp3$/.test(PFAudio.state().track), n, { timeout: 10000 });
    await p.waitForTimeout(1000); assert.strictEqual(await p.evaluate(() => PFAudio.state().generating), false);
  });
  await test('a missing file falls back to the generator', async () => {
    await p.evaluate(() => PFAudio.setTracks({ morning: 'assets/audio/missing.mp3', afternoon: 'assets/audio/missing.mp3', evening: 'assets/audio/missing.mp3', night: 'assets/audio/missing.mp3' }));
    await p.waitForFunction(() => { const s = PFAudio.state(); return s.generating && s.failed.length === 1; }, null, { timeout: 10000 });
    await p.evaluate(() => PFAudio.setTracks({ morning: 'assets/audio/morning.mp3', afternoon: 'assets/audio/afternoon.mp3', evening: 'assets/audio/evening.mp3', night: 'assets/audio/night.mp3' }));
    errs.length = 0; // the 404 above is expected
  });
  await test('game events play sounds', async () => {
    const n = await p.evaluate(async () => { const before = PFAudio.state().plays, ev = d => dispatchEvent(new CustomEvent('pf:farm', { detail: d })), w = () => new Promise(r => setTimeout(r, 300));
      for (const d of [{ type: 'task', kind: 'till', who: 'farmer' }, { type: 'task', kind: 'petpet', an: 'cat' }, { type: 'income', source: 'market', gold: 9 }, { type: 'purchase', who: 'player' }, { type: 'surprise', kind: 'giant' }]) { ev(d); await w(); }
      return PFAudio.state().plays - before; });
    assert.strictEqual(n, 5);
    for (const k of await p.evaluate(() => PFAudio.names())) assert.ok(await p.evaluate(async k => { await new Promise(r => setTimeout(r, 300)); return PFAudio.play(k); }, k), k);
  });
  await test('toggles persist across reload', async () => {
    await p.click('#musicBtn'); await p.click('#sfxBtn');
    assert.deepStrictEqual(await p.evaluate(() => { const s = PFAudio.settings(); return [s.music, s.sfx]; }), [false, false]);
    await p.waitForTimeout(1800); assert.deepStrictEqual(await p.evaluate(() => [PFAudio.state().generating, PFAudio.state().mode]), [false, 'off']);
    await p.reload(); await ready();
    assert.ok(await p.evaluate(() => document.getElementById('musicBtn').classList.contains('off') && document.getElementById('sfxBtn').classList.contains('off')));
    await p.mouse.click(640, 300); await p.waitForTimeout(600);
    const s = await p.evaluate(() => PFAudio.state()); assert.strictEqual(s.mode, 'off'); assert.strictEqual(await p.evaluate(() => PFAudio.play('coin')), false);
    await p.click('#musicBtn'); await p.waitForFunction(() => PFAudio.state().generating || PFAudio.state().mode === 'files', null, { timeout: 3000 });
  });
  await test('a fast farm day with sound on has no errors', async () => {
    await p.evaluate(() => { PFAudio.setSfx(true); __farm.setGameSpeed && __farm.setGameSpeed(4); });
    await p.waitForTimeout(6000); assert.deepStrictEqual(errs, []);
  });
  await b.close(); server.close();
  if (failed) { console.log(failed + ' failed'); process.exit(1); } console.log('audio smoke ok');
})().catch(e => { console.error(e); process.exit(1); });
