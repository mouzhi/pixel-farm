// xhs 1.3.2 (web v5.11.0.35) 果园自动种树 on a 390px phone, on the packed build: saplings in the storehouse -> a family member walks
// to the empty 果园坡 by themselves (no mark) -> saplings planted -> reload keeps them. Synthetic saves only.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const DIST = path.resolve(__dirname, '../platforms/xhs/dist'), OUT = process.env.PF_SHOTS || '/workspace/pf-shots', TAG = process.env.PF_TAG || 'xhs_orchard_';
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
    const p = await ctx.newPage(); p.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());}); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
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


  const dragAim=async(p,pos,tol)=>{for(let n=0;n<22;n++){
    const a=await p.evaluate(q=>{const c=__farm.toClient(q.x,q.y),r=PFTouch.RET();return{dx:r.x-c.x,dy:r.y-c.y,x:c.x,y:c.y};},pos);
    if(Math.hypot(a.dx,a.dy)<(tol||1))return;
    if(Math.hypot(a.dx,a.dy)<12){await touch(p,[[a.x,a.y]]);continue;}
    const k=Math.min(1,105/Math.max(Math.abs(a.dx),Math.abs(a.dy))),x=195,y=610;
    await touch(p,[[x,y],[x+a.dx*k/2,y+a.dy*k/2],[x+a.dx*k,y+a.dy*k]]); }
    throw new Error('drag could not bring target under reticle '+JSON.stringify({pos,state:await p.evaluate(q=>({cam:__farm.cam,target:__farm.toClient(q.x,q.y),ret:PFTouch.RET(),state:PFTouch.state(),mode:__farm.input.mode,pick:__farm.input.mvPick}),pos)})); };
  const tool=async(p,text)=>{await p.waitForTimeout(700);await p.locator('#pt-box').tap();await p.waitForTimeout(150);const i=await p.evaluate(t=>[...document.querySelectorAll('#pt-sheet .grid button')].findIndex(b=>b.textContent.includes(t)),text);if(i<0){await p.screenshot({path:OUT+'/missing-tool.png'});throw new Error('missing tool '+text+' '+await p.locator('#pt-sheet').innerText()+' tools='+await p.locator('#tools').innerText());}await tapEl(p,`#pt-sheet .grid button:nth-child(${i+1})`);};
  const ORCH = { x: -95, y: -42 }; // 果园坡 centre
  const young = `S.trees.filter(t=>t.stage==='sapling'&&t.kind!=='wild'&&t.x>-150&&t.x<-40&&t.y>-100&&t.y<16)`;
  let save;
  { const p = await page();
    await p.evaluate(`(()=>{${HELPERS}setup();S.t=Math.floor(S.t/1440)*1440+7*60;f.FARMER.saplings.apple=2;f.FARMER.saplings.orange=1;
      for(const t of S.trees)if(t.kind!=='wild')t.ripe=0; // nothing to pick: the screenshots follow the orchard errand
      PFPlatform.setFollow(false);quiet();f.refreshUI();})()`);
    await tapEl(p, '#xhs-btn-store'); await p.waitForTimeout(400);
    await step(p, 'storage.png', () => p.evaluate(`(()=>{${HELPERS}const st=document.getElementById('store');return{open:!!st&&!st.hidden,text:st?st.innerText.slice(0,400):'',sap:Object.assign({},f.FARMER.saplings),young:${young}.length,marks:S.orders.length};})()`),
      r => !r.open || !/苹果树苗/.test(r.text) || !/空着的果园/.test(r.text) || r.sap.apple !== 2 || r.young || r.marks ? 'storage / empty orchard wrong' : null);
    await tapEl(p, '#xhs-btn-store'); await p.waitForTimeout(300);
    await step(p, 'walking.png', () => p.evaluate(`(()=>{${HELPERS}quiet();let a=null;
      for(let i=0;i<3000&&!a;i++){f.advance(1,3);a=f.actors().find(q=>q.task&&q.task.kind==='orchardplant'&&Math.hypot(q.x-q.task.to.x,q.task.to.y-q.y)<34&&Math.hypot(q.x-q.task.to.x,q.y-q.task.to.y)>8);}
      if(!a)return{error:'nobody walked to the orchard'};PFPlatform.setFollow(false);f.setZoom(1);center((a.x+a.task.to.x)/2,(a.y+a.task.to.y)/2);quiet();f.render();
      return{who:a.id||'farmer',label:a.task.label,to:a.task.to,young:${young}.length,marks:S.orders.length};})()`),
      r => !/果园/.test(r.label) || r.marks ? 'not an orchard errand' : null);
    const planted = await step(p, 'planted.png', () => p.evaluate(`(()=>{${HELPERS}for(let i=0;i<4000&&${young}.length<3;i++)f.advance(1,3);
      const y=${young};PFPlatform.setFollow(false);f.setZoom(1);const cx=y.reduce((n,t)=>n+t.x,0)/Math.max(1,y.length),cy=y.reduce((n,t)=>n+t.y,0)/Math.max(1,y.length);center(cx,cy);quiet();f.render();
      return{young:y.length,kinds:y.map(t=>t.kind),at:y.map(t=>[t.x,t.y]),sap:Object.assign({},f.FARMER.saplings),c:[cx,cy],log:S.events.filter(e=>/果园种了/.test(e.msg)).length};})()`),
      r => r.young < 3 || r.sap.apple || r.sap.orange || !r.log ? 'saplings not planted' : null);
    save = await p.evaluate(() => Object.assign(__farm.snapshot(), { savedAt: Date.now() })); await p.context().close();
    const q = await page({ 'mouzhi/pixel-farm:save': JSON.stringify(save) });
    await step(q, 'reload.png', () => q.evaluate(`(()=>{${HELPERS}quiet();PFPlatform.setFollow(false);f.setZoom(1);center(${planted && planted.c ? planted.c[0] : ORCH.x},${planted && planted.c ? planted.c[1] : ORCH.y});f.render();
      return{young:${young}.length,sap:Object.assign({},f.FARMER.saplings),sv:f.snapshot().saveVersion,bytes:new Blob([JSON.stringify(PFSave.compact(f.snapshot()))]).size};})()`),
      r => r.young < 3 || r.sap.apple || r.sv !== 15 || r.bytes >= 65536 ? 'orchard lost after reload' : null);
    await q.context().close(); }
  // v5.11.0.35 砍果树 on the phone: ⚒ → 砍树 → aim at an apple tree → ✔ asks to confirm → ✔ again marks it → the family fells it,
  // 1 apple sapling lands in the storehouse with the log line.
  { const p = await page();
    await p.evaluate(`(()=>{${HELPERS}setup();S.t=Math.floor(S.t/1440)*1440+7*60;f.FARMER.saplings.apple=0;f.FARMER.saplings.orange=0;PFPlatform.setFollow(false);
      const t=S.trees.find(q=>q.id==='a2');center(t.x,t.y);quiet();f.refreshUI();})()`);
    const tree = await p.evaluate(() => { const t = __farm.S.trees.find(q => q.id === 'a2'); return { x: t.x, y: t.y }; });
    await tool(p, '砍树'); await dragAim(p, tree, 6); await p.waitForTimeout(200);
    await tapEl(p, '#pt-bar .ok'); await p.waitForTimeout(250);
    await step(p, 'chop_confirm.png', () => p.evaluate(() => { const S = __farm.S, say = document.getElementById('say'); return { say: say && !say.hidden ? say.innerText : '', queued: S.orders.some(o => o.type === 'chop' && o.id === 'a2'), hint: (document.getElementById('pt-bar') || {}).innerText || '' }; }),
      r => !/再点一次确认/.test(r.say) || r.queued ? 'no confirmation before marking a fruit tree' : null);
    await tapEl(p, '#pt-bar .ok'); await p.waitForTimeout(250);
    await step(p, 'chop_marked.png', () => p.evaluate(() => { const S = __farm.S, say = document.getElementById('say'); return { say: say && !say.hidden ? say.innerText : '', queued: S.orders.some(o => o.type === 'chop' && o.id === 'a2'), hint: (document.getElementById('pt-bar') || {}).innerText || '' }; }),
      r => !r.queued || /再点一次确认/.test(r.hint) ? 'fruit tree not marked / stale confirmation' : null);
    await p.evaluate(() => __farm.setMode(null)); await p.waitForTimeout(200);
    await p.evaluate(`(()=>{${HELPERS}const t=S.trees.find(q=>q.id==='a2');for(let i=0;i<3000&&S.trees.includes(t);i++)f.advance(1,3);quiet();})()`);
    await step(p, 'chop_log.png', () => p.evaluate(`(()=>{${HELPERS}PFPlatform.setFollow(false);center(-104,-40);f.render();const say=document.getElementById('say');
      return{gone:!S.trees.some(q=>q.id==='a2'),toast:say&&!say.hidden?say.innerText:'',log:S.log.find(m=>/砍倒一棵苹果树/.test(m))||''};})()`),
      r => !r.gone || !/砍倒一棵苹果树/.test(r.log) ? 'no chop log' : null);
    await p.evaluate(() => { const e = document.getElementById('say'); if (e) e.hidden = true; });
    await tapEl(p, '#xhs-btn-store'); await p.waitForTimeout(400);
    await p.evaluate(() => { for (const e of document.querySelectorAll('body *')) if (!e.closest('#store') && e.children.length === 0 && /^\d\d:\d\d 砍倒一棵|^砍倒一棵/.test(e.textContent || '')) { const box = e.closest('[id]') || e; box.style.visibility = 'hidden'; window.__hid = box.id || box.className; } });
    await step(p, 'chop_sapling.png', () => p.evaluate(`(()=>{${HELPERS}const st=document.getElementById('store');return{gone:!S.trees.some(q=>q.id==='a2'),sap:f.FARMER.saplings.apple,store:st&&!st.hidden?/苹果树苗/.test(st.innerText):false,log:S.log.find(m=>/砍倒一棵苹果树/.test(m))||''};})()`),
      r => !r.gone || r.sap !== 1 || !r.store || !r.log ? 'no sapling after the fruit chop' : null);
    await p.context().close(); }
  server.close(); await b.close(); if (errs.length) fails.push(errs.join('\n')); if (fails.length) { console.error(fails.join('\n')); process.exit(1); } console.log('xhs-orchard-shots passed', VERSION);
})().catch(e => { console.error(e); process.exit(1); });
