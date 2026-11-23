// xhs 1.3.2: real 390px touch drags to southern riverbank tree/workshop sites, placements + reload, autonomous across-river farming. Synthetic saves only.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'xhs_riverbank_';
const VERSION = (fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8').match(/GAME_VERSION = '([^']+)'/) || [])[1];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('no platforms/xhs/dist: run bash platforms/xhs/pack.sh first'); process.exit(1); }
const server = http.createServer((req, res) => { const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res); });
const only = process.argv[2] || null;
fs.mkdirSync(OUT, { recursive: true });
const MOCK = seed => `(() => { const mem = Object.assign({}, ${JSON.stringify(seed || {})}); const ok = v => Promise.resolve(v); window.__buzz = 0;
  window.xhs = { launchOptions: { miniToolEnv: { buildVersion: 9533123 } }, miniTool: {
    getStorageInfo: () => ok({ keys: Object.keys(mem) }), getStorage: a => ok({ data: mem[a.key] }), setStorage: a => { mem[a.key] = typeof a.data === 'string' ? a.data : JSON.stringify(a.data); return ok({}); }, removeStorage: a => { delete mem[a.key]; return ok({}); },
    getWindowInfo: () => ok({ windowWidth: 390, windowHeight: 844, statusBarHeight: 47, safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 }, menuButtons: {} }),
    getLaunchOptions: () => ok({ miniToolEnv: { buildVersion: 9533123 } }), submitScore: () => ok({}), getRankList: () => ok({ data: [] }), getMyRank: () => ok({ rank: 1, score: 1, status: 'EXACT' }),
    getFollowStatus: () => ok({ follow_status: 0 }), followAuthor: () => ok({ follow_status: 1 }), share: () => ok({}), vibrateShort: () => { window.__buzz++; return ok({}); } } }; })();`;
const HELPERS = `const f=__farm,S=f.S,R=PFTouch.RET();
 const setup=()=>{ f.SAVE.off=true;S.family.met=1;S.family.moved=1;S.family.love=100;S.coins=800000;f.FARMER.wood=5000;
 for(const id of ['house','house','axe','forest','east','orchard','south','pasture','coast','can','can'])f.buy(id);f.syncFamily();f.buyPlot('bridge','bridge');
 const fb=document.getElementById('xhs-follow');if(fb&&fb.classList.contains('on'))fb.click(); };
 const center=(x,y)=>{for(let i=0;i<4;i++){const a=f.toClient(x,y);f.panScreen(8,0);const b=f.toClient(x,y),k=(b.x-a.x)/8;f.panScreen((R.x-b.x)/k,(R.y-b.y)/k);}};
 const quiet=()=>{for(const id of ['say','albumToast','offline','shop','store','diary','loveTip']){const e=document.getElementById(id);if(e)e.hidden=true;}};`;
(async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [], fails = [];
  async function page(seed) { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 discover/9.53.3 XHS' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(MOCK(seed || {})); await p.goto(base + '/index.html');
    await p.waitForFunction(() => window.__farm && __farm.spritesReady() && document.getElementById('xhs-bar') && window.PFTouch, null, { timeout: 30000 });
    await p.waitForTimeout(800);
    p.cdp = await ctx.newCDPSession(p); return p; }
  const touch = async (p, pts, hold) => { await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] }); if (hold) await p.waitForTimeout(hold);
    for (const q of pts.slice(1)) await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] });
    await p.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(150); };
  const tapEl = async (p, sel) => { const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel);
    if (!r) throw new Error('no ' + sel); await touch(p, [[r.x, r.y]]); return r; };
  const step = async (p, name, fn, check) => { name = TAG + name; if (only && !name.includes(only)) return null; let r; try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 400) }; }
    await p.waitForTimeout(250); if (!(r && r._shot === false)) await p.screenshot({ path: path.join(OUT, name) }); if (r) delete r._shot; const bad = r && r.error ? r.error : check(r);
    console.log(bad ? 'FAIL' : 'ok  ', name, JSON.stringify(r).slice(0, 900)); if (bad) fails.push(name + ': ' + bad); return r; };


  const dragAim=async(p,pos)=>{for(let n=0;n<22;n++){
    const a=await p.evaluate(q=>{const c=__farm.toClient(q.x,q.y),r=PFTouch.RET();return{dx:r.x-c.x,dy:r.y-c.y};},pos);
    if(Math.hypot(a.dx,a.dy)<1)return;
    const k=Math.min(1,105/Math.max(Math.abs(a.dx),Math.abs(a.dy))),x=195,y=610;
    await touch(p,[[x,y],[x+a.dx*k/2,y+a.dy*k/2],[x+a.dx*k,y+a.dy*k]]); }
    throw new Error('drag could not bring target under reticle '+JSON.stringify(pos)); };
  const tool=async(p,text)=>{await p.waitForTimeout(700);await p.locator('#pt-box').tap();await p.waitForTimeout(150);const i=await p.evaluate(t=>[...document.querySelectorAll('#pt-sheet .grid button')].findIndex(b=>b.textContent.includes(t)),text);if(i<0){await p.screenshot({path:OUT+'/missing-tool.png'});throw new Error('missing tool '+text+' '+await p.locator('#pt-sheet').innerText()+' tools='+await p.locator('#tools').innerText());}await tapEl(p,`#pt-sheet .grid button:nth-child(${i+1})`);};
  let treeSave;
  { const p=await page();await p.evaluate(`(()=>{${HELPERS}setup();f.buyPlot('seacross','dam');f.FARMER.saplings.apple=3;quiet();f.refreshUI();})()`);
    await tool(p,'种苹果');const pos={x:118,y:366};await dragAim(p,pos);await p.waitForTimeout(200);
    await step(p,'tree_aim.png',()=>p.evaluate(q=>{const f=__farm,c=f.toClient(q.x,q.y),r=PFTouch.RET();return{ret:document.getElementById('pt-ret').className,delta:Math.hypot(c.x-r.x,c.y-r.y),spot:f.plantSpot(q.x,q.y)};},pos),r=>r.ret!=='ok'||r.delta>1||!r.spot.ok?'tree reticle failed':null);
    await tapEl(p,'#pt-bar .ok');
    const planted=await step(p,'tree_planted.png',()=>p.evaluate(`(()=>{${HELPERS} const pos=${JSON.stringify(pos)},order=S.orders.find(o=>o.type==='plant');f.setMode(null);
      for(let i=0;i<1000&&!S.trees.some(t=>t.kind==='apple'&&Math.hypot(t.x-pos.x,t.y-pos.y)<1);i++)f.advance(1,3);
      f.setMode('plant','apple');center(pos.x,pos.y);quiet();f.render();const t=S.trees.find(t=>t.kind==='apple'&&Math.hypot(t.x-pos.x,t.y-pos.y)<1);
      return {hadOrder:!!order,tree:!!t,sap:f.FARMER.saplings.apple};})()`),r=>!r.hadOrder||!r.tree||r.sap!==2?'tree missing or sapling count wrong':null);
    treeSave=await p.evaluate(()=>Object.assign(__farm.snapshot(),{savedAt:Date.now()}));await p.context().close(); }
  {const p=await page({'mouzhi/pixel-farm:save':JSON.stringify(treeSave)});await step(p,'tree_reload.png',()=>p.evaluate(`(()=>{${HELPERS}quiet();f.setMode('plant','apple');center(118,366);f.render();return{tree:S.trees.some(t=>t.kind==='apple'&&Math.hypot(t.x-118,t.y-366)<1),sap:f.FARMER.saplings.apple};})()`),r=>!r.tree||r.sap!==2?'tree lost after reload':null);await p.context().close();}
  {const p=await page();const setup=await p.evaluate(`(()=>{${HELPERS}setup();f.buyPlot('swbank','workshop');f.buyPlot('seacross','workshop');const mill=f.buy('mill');const w=f.PW.workPos(S.works.works.mill);center(w.x,w.y);quiet();f.render();return{mill:mill.ok,w};})()`);
    await tool(p,'挪东西');const c=await p.evaluate(w=>__farm.toClient(w.x,w.y),setup.w);await touch(p,[[c.x,c.y]]);await p.waitForTimeout(200);await tapEl(p,'#pt-float [data-a="move"]');
    const pos={x:100,y:356};await dragAim(p,pos);await p.waitForTimeout(200);
    await step(p,'workshop_aim.png',()=>p.evaluate(q=>{const f=__farm,c=f.toClient(q.x,q.y),r=PFTouch.RET();return{ret:document.getElementById('pt-ret').className,delta:Math.hypot(c.x-r.x,c.y-r.y),from:f.S.works.works.mill.at};},pos),r=>r.ret!=='ok'||r.delta>1?'workshop reticle failed':null);
    await tapEl(p,'#pt-bar .ok');
    await step(p,'workshop_moved.png',()=>p.evaluate(`(()=>{${HELPERS}const q=S.decor.orders.find(o=>o.what==='work'),settled=q&&f.settle(q);quiet();f.setMode('move');center(100,356);f.render();return{settled,to:S.works.works.mill.at,x:S.works.works.mill.x,y:S.works.works.mill.y};})()`),r=>!r.settled||r.to!=='seacross'?'workshop did not move':null);
    const saved=await p.evaluate(()=>Object.assign(__farm.snapshot(),{savedAt:Date.now()}));await p.context().close();const q=await page({'mouzhi/pixel-farm:save':JSON.stringify(saved)});
    await step(q,'workshop_reload.png',()=>q.evaluate(`(()=>{${HELPERS}quiet();f.setMode('move');center(100,356);f.render();return{at:S.works.works.mill.at,sv:f.snapshot().saveVersion,bytes:new Blob([JSON.stringify(PFSave.compact(f.snapshot()))]).size};})()`),r=>r.at!=='seacross'||r.sv!==15||r.bytes>=65536?'workshop lost after reload':null);await q.context().close();}
  {const p=await page();await step(p,'autofarm.png',()=>p.evaluate(`(()=>{${HELPERS}setup();f.buyPlot('swacross','field');f.buyPlot('seacross','field');const start=S.day;
    for(let i=0;i<7500&&S.day<start+10;i++){if(f.tiles.some(t=>t.f==='swacross'&&t.crop)&&f.tiles.some(t=>t.f==='seacross'&&t.crop))break;f.advance(1,3);}
    PFPlatform.followFarmer=false;f.panTo(24,330);quiet();f.render();return{days:S.day-start,sw:f.tiles.filter(t=>t.f==='swacross'&&t.crop).length,se:f.tiles.filter(t=>t.f==='seacross'&&t.crop).length};})()`),r=>!r.sw||!r.se?'no crops within ten days':null);await p.context().close();}
  server.close();await b.close();if(errs.length)fails.push(errs.join('\n'));if(fails.length){console.error(fails.join('\n'));process.exit(1);}console.log('xhs-riverbank-shots passed',VERSION);
})().catch(e=>{console.error(e);process.exit(1);});
