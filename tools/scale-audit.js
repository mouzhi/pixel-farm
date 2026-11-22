// v5.11.0.9 房子比例: render every building model the way the game does (stackCanvas, camera angle 0, 1 voxel = 1 screen px)
// beside a grown-up farmer, measure it, and check it against the scale rule (docs/building-scale.md).
//   node tools/scale-audit.js [tag]     writes /workspace/pf-shots/scale_<tag>_sheet*.png and scale_<tag>.json (tag: after)
//   exits 1 on a page error or a building that breaks the rule
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const TAG = process.argv[2] || 'after';
const CHECK = !process.argv.includes('--no-check');
fs.mkdirSync(OUT, { recursive: true });
// [source.path, 名字, kind]. kind decides the rule (see RULE); 'animal' and 'stall' homes for animals / open counters
const LIST = [
  ['game.house', '农舍（老家）', 'home2'], ['game.barn', '谷仓', 'barn'], ['game.stallB', '农场小摊', 'stall'], ['game.well', '水井', 'prop'],
  ['home.cottages.0', '孩子成家的小木屋', 'home'], ['home.frame', '小木屋（施工）', 'frame'],
  ['inn.cabinDay', '农家乐小木屋', 'home'], ['inn.cabin2Day', '二层客栈', 'home2'], ['inn.frame', '小木屋（施工）', 'frame'],
  ['inn.diner0', '农家菜馆', 'public'], ['inn.diner2', '农家菜馆（满级）', 'public'], ['inn.dinerFrame', '菜馆（施工）', 'frame'],
  ['inn.hutDay', '海边小屋', 'hut'], ['inn.villaDay', '度假小别墅', 'home'], ['inn.stall', '海鲜摊', 'stall'],
  ['town.houses.0', '小镇平房', 'home'], ['town.twoHouse.0', '小镇二层（翻盖）', 'home2'], ['town.two.0', '镇公所地块二层', 'home2'],
  ['town.two.3', '面包房', 'public2'], ['town.two.4', '木工坊', 'public2'], ['town.two.5', '铁匠铺', 'public2'], ['town.two.6', '教室', 'public'],
  ['town.two.7', '书屋', 'public2'], ['town.two.8', '诊所', 'public2'], ['town.kidShops.flower', '孩子的小店', 'home'], ['town.shop', '小镇商店', 'public'],
  ['town.school', '学校', 'public'], ['town.hall', '镇公所', 'public2'], ['town.stalls.0', '集市摊位', 'stall'],
  ['works.mill', '磨坊', 'shed'], ['works.jam', '果酱铺', 'shed'], ['works.cheese', '奶酪坊', 'shed'],
  ['pasture.coop', '鸡舍', 'animal'], ['pasture.shed', '牛羊棚', 'animal'], ['pasture.sty', '猪圈', 'animal'], ['pasture.fold', '羊圈', 'animal'],
];
// door: how tall the door is, in screen px (1 voxel); a grown-up is 24 px with the hat. Read off the model code (v5.11.0.9 values;
// before: cottage 13, cabin 9, inn 9, restaurant 10, beach hut 8, mill 9, cheese 9)
const DOOR = {
  'game.house': 22, 'game.barn': 21, 'home.cottages.0': 22, 'inn.cabinDay': 22, 'inn.cabin2Day': 22, 'inn.diner0': 22, 'inn.diner2': 22, 'inn.hutDay': 19, 'inn.villaDay': 22,
  'town.houses.0': 22, 'town.twoHouse.0': 22, 'town.two.0': 22, 'town.two.3': 22, 'town.two.4': 22, 'town.two.5': 22, 'town.two.6': 22, 'town.two.7': 22, 'town.two.8': 22,
  'town.kidShops.flower': 22, 'town.shop': 22, 'town.school': 22, 'town.hall': 22, 'works.mill': 19, 'works.cheese': 19,
};
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [];
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + '/index.html?manual'); await p.waitForFunction(() => window.__farm && __farm.spritesReady() && __farm.art, null, { timeout: 30000 });
  const res = await p.evaluate(({ LIST, DOOR }) => {
    const A = __farm.art, SPR = A.SPR;
    const src = { game: A.models, home: PFHomeArt.models(), inn: PFInnArt.models(), town: PFTownArt.models(), works: PFWorksArt.models(), pasture: A.pasture || {} };
    const get = k => k.split('.').reduce((o, s) => (o ? o[s] : null), src);
    const rows = [], tiles = [];
    for (const [key, name, kind] of LIST) { const m = get(key); if (!m || !m.cells) { rows.push({ key, name, kind, missing: true }); continue; }
      const k = A.stackCanvas(m, 0), c = k.c, g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
      let top = c.height, bot = -1, l = c.width, r = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { if (y < top) top = y; if (y > bot) bot = y; if (x < l) l = x; if (x > r) r = x; }
      // the front wall foot: where the model's front edge meets the ground (the farmer stands there)
      const foot = Math.round(k.oy + (m.d / 2) * 0.75);
      const tall = foot - top; // px above the ground line at the front: what you see standing next to it
      const can = document.createElement('canvas'); can.width = c.width; can.height = c.height; can.getContext('2d').drawImage(c, 0, 0);
      rows.push({ key, name, kind, vox: [m.w, m.d, m.h], foot: [m.w / 2, m.d / 2], sil: bot - top + 1, wide: r - l + 1, tall, door: DOOR[key] || null });
      tiles.push({ key, url: can.toDataURL(), ox: k.ox, oy: k.oy, foot, top, bot, l, r, d: m.d });
    }
    // the farmer: idle_front frame 0
    const row = SPR.rows.idle_front | 0, fc = document.createElement('canvas'); fc.width = SPR.fw; fc.height = SPR.fh; fc.getContext('2d').drawImage(SPR.img, 0, row * SPR.fh, SPR.fw, SPR.fh, 0, 0, SPR.fw, SPR.fh);
    const fd = fc.getContext('2d').getImageData(0, 0, SPR.fw, SPR.fh).data; let ft = SPR.fh, fb = -1; for (let y = 0; y < SPR.fh; y++) for (let x = 0; x < SPR.fw; x++) if (fd[(y * SPR.fw + x) * 4 + 3] > 0) { ft = Math.min(ft, y); fb = Math.max(fb, y); }
    return { rows, tiles, farmer: { url: fc.toDataURL(), fw: SPR.fw, fh: SPR.fh, ax: SPR.ax, ay: SPR.ay, h: fb - ft + 1, bot: fb } };
  }, { LIST, DOOR });
  const P = res.farmer.h; // a grown-up, px
  // RULE (docs/building-scale.md): door >= 20 px (a grown-up walks in), a storey >= one person on the front; tall = px above the ground at the front wall
  const RULE = { home: { tall: 2.4 * P, door: 20 }, home2: { tall: 3.2 * P, door: 20 }, public: { tall: 2.2 * P, door: 20, area: 1.3 * 18 * 16 }, public2: { tall: 3.0 * P, door: 20, area: 1.3 * 18 * 16 },
    hut: { tall: 2.0 * P, door: 18 }, shed: { tall: 1.7 * P, door: 17 }, stall: { h: 28 }, barn: { tall: 2.4 * P, door: 20 } };
  const bad = [];
  for (const r of res.rows) { if (r.missing) { bad.push(r.key + ': missing'); continue; }
    r.person = +(r.tall / P).toFixed(2); r.area = r.foot[0] * r.foot[1];
    const u = RULE[r.kind]; r.ok = true; r.why = [];
    if (u) { if (u.h && r.vox[2] < u.h) r.why.push(`模型高 ${r.vox[2]}px < ${u.h}（遮阳棚要高过摊主的帽子）`); if (u.tall && r.tall < u.tall - 0.5) r.why.push(`高 ${r.tall}px < ${Math.round(u.tall)}`); if (u.door && r.door && r.door < u.door) r.why.push(`门 ${r.door}px < ${u.door}`); if (u.area && r.area < u.area) r.why.push(`占地 ${r.area} < ${u.area}`); }
    if (r.why.length) { r.ok = false; bad.push(`${r.key} ${r.name}: ${r.why.join(', ')}`); } }
  fs.writeFileSync(path.join(OUT, `scale_${TAG}.json`), JSON.stringify({ person: P, rows: res.rows }, null, 1));
  // contact sheet: each building at 2x beside the farmer, on grass, name + numbers underneath; 6 per row
  const sheet = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const html = `<html><body style="margin:0;background:#2b2b2b"><canvas id=c></canvas><script>
    const T = ${JSON.stringify(res.tiles)}, F = ${JSON.stringify(res.farmer)}, R = ${JSON.stringify(res.rows)};
    const S = 2, COLS = 6, CW = 250, CH = 250, c = document.getElementById('c'); c.width = COLS * CW; c.height = Math.ceil(T.length / COLS) * CH; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    (async () => { const fi = await load(F.url);
      for (let n = 0; n < T.length; n++) { const t = T[n], r = R.find(q => q.key === t.key), x0 = (n % COLS) * CW, y0 = Math.floor(n / COLS) * CH, img = await load(t.url);
        g.fillStyle = '#4f7a3a'; g.fillRect(x0 + 1, y0 + 1, CW - 2, CH - 2); g.fillStyle = r.ok === false ? '#6b2a2a' : '#22331a'; g.fillRect(x0 + 1, y0 + CH - 44, CW - 2, 43);
        const gy = y0 + CH - 52; // the ground line at the front of the building
        const bw = (t.r - t.l + 1) * S, bx = x0 + 12 + Math.max(0, (CW - 60 - bw) / 2) - t.l * S;
        g.drawImage(img, bx, gy - t.foot * S, img.width * S, img.height * S);
        g.drawImage(fi, x0 + CW - 14 - F.fw * S, gy - F.bot * S - S, F.fw * S, F.fh * S);
        g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText(r.name + '  ' + r.key, x0 + 6, y0 + CH - 28);
        g.font = '12px monospace'; g.fillText(r.foot[0] + '×' + r.foot[1] + 'u  高' + r.tall + 'px=' + r.person + '人' + (r.door ? '  门' + r.door : ''), x0 + 6, y0 + CH - 10); }
      document.title = 'done'; })();
  </script></body></html>`;
  await sheet.setContent(html); await sheet.waitForFunction(() => document.title === 'done');
  const dims = await sheet.evaluate(() => [document.getElementById('c').width, document.getElementById('c').height]);
  await sheet.setViewportSize({ width: dims[0], height: dims[1] }); await sheet.screenshot({ path: path.join(OUT, `scale_${TAG}_sheet.png`), clip: { x: 0, y: 0, width: dims[0], height: dims[1] } });
  console.log(`person ${P}px`); for (const r of res.rows) console.log((r.ok === false ? 'SMALL' : 'ok   ').padEnd(6), (r.key).padEnd(22), (r.name || '').padEnd(10), r.vox ? `${r.foot[0]}x${r.foot[1]}u tall ${r.tall}px ${r.person}p door ${r.door || '-'}` : 'missing', r.why && r.why.length ? r.why.join(', ') : '');
  await b.close(); server.close();
  if (errs.length) { console.log('page errors', errs); process.exit(1); }
  if (CHECK && bad.length) { console.log('FAIL', bad.length, 'buildings break the scale rule:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('ok'); })();
