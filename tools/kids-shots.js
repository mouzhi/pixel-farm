// v5.4.3: close-ups of a child playing with pets, watching the pond, and walking to school,
// plus a short live check that a play-stage kid does not stand idle too long.
//   node tools/kids-shots.js [tag]   writes /workspace/pf-shots/v543_kid_*.png and docs/img/v543_kid_*.png (PF_SHOTS to change)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const DOCS = path.join(ROOT, 'docs/img');
const TAG = process.argv[2] ? '_' + process.argv[2] : '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
function writeShot(name, buf) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DOCS, { recursive: true });
  const a = path.join(OUT, name), b = path.join(DOCS, name);
  fs.writeFileSync(a, buf);
  fs.writeFileSync(b, buf);
  return a;
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html?manual&seed=7`);
  await p.waitForFunction(() => window.__farm && __farm.spritesReady());
  await p.evaluate(() => {
    const f = __farm, S = f.S; f.SAVE.off = true; S.coins = 1e7; f.FARMER.wood = 5000;
    for (const id of ['axe', 'field', 'field', 'coop', 'chicken', 'chicken', 'chicken', 'forest', 'orchard', 'east', 'pasture', 'sty', 'fold', 'shed', 'pig', 'sheep', 'sheep', 'cow', 'cat', 'dog', 'house', 'house', 'house', 'fence', 'goldfish', 'goldfish']) f.buy(id);
    if (f.placePondFish) { f.placePondFish('goldfish'); f.placePondFish('goldfish'); }
    S.day = 30;
    Object.assign(S.family, { love: 100, met: 3, moved: 10, kids: [{ id: 'kid0', name: '小豆', born: 22 }] }); // age 8: play
    f.syncFamily();
    S.t = 30 * 1440 + 10 * 60; f.FARMER.home = true; f.FARMER.task = { kind: 'idle', to: { x: 120, y: 40 }, dur: 1e9, work: 0 };
    f.FARMER.x = 120; f.FARMER.y = 40;
  });
  await p.waitForTimeout(200);
  const idle = await p.evaluate(() => {
    const f = __farm, S = f.S, k = S.members.find(m => m.id === 'kid0');
    if (!k) return { ok: false, why: 'no kid' };
    k.home = false; k.sleeping = false; k.away = null; k.task = null;
    k.x = f.DOOR.x + 10; k.y = f.DOOR.y + 12;
    const IDLE = (window.PFKids && PFKids.IDLE_LIMIT) || 8;
    let stand = 0, maxStand = 0, lastX = k.x, lastY = k.y, kinds = {}, samples = 0;
    const t0 = S.t; let lastT = S.t;
    for (let i = 0; i < 4000 && S.t - t0 < 180; i++) {
      f.advance(0.25, 8);
      const dt = S.t - lastT; lastT = S.t; if (dt <= 0) continue;
      if (k.home || k.sleeping || k.away) { stand = 0; continue; }
      const T = S.t % 1440; if (T < 6 * 60 + 30 || T >= 19 * 60) { stand = 0; continue; }
      const kind = (k.task && k.task.kind) || 'none';
      kinds[kind] = (kinds[kind] || 0) + dt;
      const moved = Math.hypot(k.x - lastX, k.y - lastY) > 0.4;
      const playing = kind.startsWith('play') || kind === 'school-go' || kind === 'school-back';
      // idle = standing still without a play/school activity
      if (!moved && !playing) stand += dt; else stand = 0;
      if (stand > maxStand) maxStand = stand;
      lastX = k.x; lastY = k.y; samples++;
    }
    return { ok: maxStand < IDLE + 2, maxStand: Math.round(maxStand * 10) / 10, limit: IDLE, kinds, samples, role: k.role, stage: f.FAM.kidStage(S.family.kids[0], S.day), x: Math.round(k.x), y: Math.round(k.y) };
  });
  console.log('idle-check', JSON.stringify(idle));
  if (!idle.ok) throw new Error('play kid stood idle ' + idle.maxStand + ' min (limit ' + idle.limit + ')');

  const shoot = async (name, setup, crop) => {
    const data = await p.evaluate(({ setup, crop }) => {
      const f = __farm, S = f.S;
      // keep 阿禾 and the farmer out of the frame
      const partner = S.members.find(m => m.id === 'partner');
      if (partner) { partner.home = true; partner.task = null; partner.x = -200; partner.y = -200; }
      f.FARMER.home = true; f.FARMER.sleeping = false; f.FARMER.x = -200; f.FARMER.y = -200; f.FARMER.task = { kind: 'idle', to: { x: -200, y: -200 }, dur: 1e9, work: 0 };
      (new Function('f', 'S', setup))(f, S);
      f.render(); f.render();
      if (!crop) return null;
      const [sx, sy] = f.proj(crop.x, crop.y);
      const cv = document.getElementById('game');
      const w = crop.w, h = crop.h, sc = crop.sc || 3;
      const out = document.createElement('canvas'); out.width = w * sc; out.height = h * sc;
      const o = out.getContext('2d'); o.imageSmoothingEnabled = false;
      o.drawImage(cv, Math.round(sx - w / 2), Math.round(sy - h + crop.foot), w, h, 0, 0, w * sc, h * sc);
      return out.toDataURL();
    }, { setup, crop });
    await p.waitForTimeout(60);
    const full = await p.screenshot();
    console.log(name + '-wide', writeShot(`v543_kid_${name}_wide${TAG}.png`, full));
    if (data) {
      const buf = Buffer.from(data.split(',')[1], 'base64');
      console.log(name, writeShot(`v543_kid_${name}${TAG}.png`, buf));
    } else {
      console.log(name, writeShot(`v543_kid_${name}${TAG}.png`, full));
    }
  };

  await shoot('pets', `
    const k = S.members.find(m => m.id === 'kid0');
    const dog = f.PETS_LIVE.find(q => q.kind === 'dog') || f.PETS_LIVE[0];
    const cat = f.PETS_LIVE.find(q => q.kind === 'cat');
    const v = f.PV.get(dog.id);
    v.x = 84; v.y = 88; v.tx = 84; v.ty = 88; v.pose = 5; v.hold = 1;
    if (cat) { const c = f.PV.get(cat.id); c.x = 70; c.y = 92; c.tx = 70; c.ty = 92; c.pose = 2; }
    k.home = false; k.away = null; k.sleeping = false;
    k.x = 76; k.y = 90; k.fx = 1; k.fy = 0; k.moving = false;
    k.task = { kind: 'play-pet', label: '正在摸摸柴犬', to: { x: 76, y: 90 }, dur: 1e9, work: 2, pose: 'pull' };
    f.setAngle(0.12); f.panTo(80, 86); f.setRealT(0.28);
    if (f.playFx) { f.playFx('heart', v.x, v.y, 10); f.playFx('heart', v.x + 2, v.y, 14); }
  `, { x: 80, y: 90, w: 90, h: 70, foot: 8, sc: 4 });

  await shoot('pond', `
    const k = S.members.find(m => m.id === 'kid0');
    k.x = 54; k.y = 102; k.fx = -1; k.fy = 0; k.moving = false; k.home = false; k.away = null;
    k.task = { kind: 'play-pond', label: '蹲在池塘边看鱼', to: { x: 54, y: 102 }, dur: 1e9, work: 2, pose: 'pull' };
    f.setAngle(0.2); f.panTo(40, 100); f.setRealT(0.35);
  `, { x: 44, y: 104, w: 110, h: 80, foot: 10, sc: 4 });

  await shoot('school', `
    S.family.kids[0].born = S.day - 18;
    f.syncFamily();
    const k = S.members.find(m => m.id === 'kid0');
    S.t = S.day * 1440 + 8 * 60 + 12;
    k.home = false; k.away = null; k.sleeping = false;
    k.role = 'school';
    k.x = 236; k.y = 66; k.fx = 1; k.fy = 0; k.moving = true;
    k.task = { kind: 'school-go', label: '去上学', to: { x: 360, y: 66 }, dur: 3, work: 0, keepVia: true, via: [{ x: 280, y: 66 }, { x: 340, y: 66 }, { x: 364, y: 66 }] };
    f.setAngle(0.1); f.panTo(250, 66); f.setRealT(0.1);
  `, { x: 250, y: 70, w: 130, h: 80, foot: 12, sc: 3 });

  // family panel with stage text (open the 家人 hover by rendering hud; also a close-up of the love/family tip if present)
  const panel = await p.evaluate(() => {
    const f = __farm, S = f.S;
    return { line: f.FAM.kidLine(S.family.kids[0], S.day), role: S.members.find(m => m.id === 'kid0').role, version: f.version };
  });
  console.log('panel', JSON.stringify(panel));
  if (errs.length) { console.log('ERRORS', errs); throw new Error(errs[0]); }
  if (panel.version !== '5.4.3') throw new Error('version ' + panel.version);
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
