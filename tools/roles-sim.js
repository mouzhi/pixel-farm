// v5.3 family roles: plays the real game headless and measures how the family splits the work.
//   node tools/roles-sim.js [days=5] [save.json]
// With a save (an exported pixel-farm save, { meta, save } or the bare state) it continues that farm; without one it builds
// a farm with every region, pen and animal, the manor, 阿禾 living here and (PF_KIDS=1) two children.
// Prints, over waking hours (6:30-19:00): the share of time any two people out of the house stand within 3 / 6 tiles of each
// other or do the same kind of job at once, and each
// person's task mix (% of their working time per task kind, idle and fishing included).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), DAYS = +process.argv[2] || 5, SAVE = process.argv[3] || process.env.PF_SAVE || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await browser.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  if (SAVE) { const j = JSON.parse(fs.readFileSync(SAVE, 'utf8')), st = j.save || j; st.savedAt = Date.now(); // no offline catch-up
    await p.addInitScript(s => { if (!sessionStorage.getItem('pfsim')) { sessionStorage.setItem('pfsim', 1); localStorage.setItem('mouzhi/pixel-farm:save', s); } }, JSON.stringify(st)); }
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  const out = await p.evaluate(({ DAYS, SAVE, KIDS }) => {
    const f = __farm, S = f.S; f.SAVE.off = true;
    if (!SAVE) { S.coins = 1e7; f.FARMER.wood = 5000;
      for (const id of ['axe', 'field', 'field', 'field', 'field', 'field', 'can', 'can', 'shoe', 'shoe', 'basket', 'basket', 'coop', 'forest', 'orchard', 'east', 'south', 'pasture', 'sty', 'fold', 'shed', ...Array(6).fill('chicken'), ...Array(3).fill('pig'), ...Array(3).fill('sheep'), ...Array(3).fill('cow'), 'cat', 'dog', 'house', 'house', 'house', 'fence']) f.buy(id);
      S.day = Math.max(S.day, 40); Object.assign(S.family, { love: 100, met: 3, moved: S.day - 30, kids: KIDS ? [{ id: 'kid0', name: '小豆', born: S.day - 20 }, { id: 'kid1', name: '小米', born: S.day - 8 }] : [] }); f.syncFamily(); }
    const end = S.day + DAYS, TILE = 8, near = 3 * TILE;
    const who = a => a === f.FARMER ? 'farmer' : a.id;
    const mix = {}, pairs = {}; let samples = 0, lastT = S.t;
    while (S.day < end) {
      f.advance(0.25, 8); const dm = S.t - lastT; lastT = S.t; if (dm <= 0) continue;
      const T = S.t % 1440; if (T < 6 * 60 + 30 || T >= 19 * 60) continue; // waking working hours
      const out = f.actors().filter(a => !a.home && !a.sleeping);
      for (const a of out) { const k = (a.task && a.task.kind) || 'none', m = mix[who(a)] = mix[who(a)] || {}; m[k] = (m[k] || 0) + dm; }
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) { const key = who(out[i]) + '+' + who(out[j]), q = pairs[key] = pairs[key] || { both: 0, near: 0, near6: 0, same: 0, work: 0, workNear: 0 };
        q.both += dm; const dd = Math.hypot(out[i].x - out[j].x, out[i].y - out[j].y); if (dd <= near) q.near += dm; if (dd <= 2 * near) q.near6 += dm;
        const ki = out[i].task && out[i].task.kind, kj = out[j].task && out[j].task.kind; if (ki && ki === kj && ki !== 'idle') q.same += dm;
        const busy = k => k && !['idle', 'fish', 'home'].includes(k); if (busy(ki) && busy(kj)) { q.work += dm; if (dd <= near) q.workNear += dm; } }
      samples++;
    }
    return { mix, pairs, day: S.day, version: f.version, members: S.members.map(m => m.id + ':' + m.role) };
  }, { DAYS, SAVE, KIDS: !!process.env.PF_KIDS });
  console.log(`v${out.version}  ended day ${out.day}  members ${out.members.join(' ')}`);
  for (const [k, q] of Object.entries(out.pairs)) console.log(`${k.padEnd(16)} within 3 tiles ${(q.near / q.both * 100).toFixed(1)}%  within 6 tiles ${(q.near6 / q.both * 100).toFixed(1)}%  same task kind ${(q.same / q.both * 100).toFixed(1)}%  both working: within 3 tiles ${(q.workNear / Math.max(1, q.work) * 100).toFixed(1)}% of ${Math.round(q.work)} min  (${Math.round(q.both)} min both out)`);
  for (const [w, m] of Object.entries(out.mix)) { const tot = Object.values(m).reduce((a, b) => a + b, 0);
    console.log(`${w.padEnd(8)} ` + Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / tot * 100).toFixed(0)}%`).join('  ')); }
  if (errs.length) console.log('ERRORS', errs);
  await browser.close(); server.close();
})();
