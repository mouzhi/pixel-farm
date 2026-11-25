/** Real-engine synthetic-save regression: the two adults may claim the same marked tree;
 * board() must skip the unavailable chop candidate rather than travel(F, null).
 * Needs Chrome + playwright-core, Node >=23 (stripTypeScriptTypes). No player saves. */
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { chromium } = require('playwright-core');
const root = resolve(__dirname, '..');
const html = `<canvas id="c" width="282" height="570"></canvas><script type="module">
import boot from '/engine.js'; import {createFarmEnv} from '/env.js';import {DEMO_SAVE,DEMO_SAVE_KEY} from '/demo.js';
localStorage.clear();localStorage.setItem(DEMO_SAVE_KEY,DEMO_SAVE);
const env=createFarmEnv({mainCanvas:document.getElementById('c'),framebuffer:true,createOffscreenCanvas:(w,h)=>new OffscreenCanvas(w,h),createImage:()=>new Image(),requestFrame:cb=>requestAnimationFrame(cb),now:()=>performance.now(),storage:{get:k=>localStorage.getItem(k),set:(k,v)=>localStorage.setItem(k,v),remove:k=>localStorage.removeItem(k),keys:()=>Object.keys(localStorage)},viewport:()=>({width:375,height:760,dpr:3}),canvasRect:()=>({left:0,top:0,width:375,height:760}),nativeImageData:ImageData});
env.G.location.search='?manual&prof'; env.G.__noWarm=true; window.env=env;boot(env.G);window.ready=true;
</script>`;
const server=createServer((req,res)=>{let content; if(req.url==='/') content=html;
else {const files={'/engine.js':'src/game/farm-engine.js','/env.js':'src/game/farm-env.ts','/demo.js':'src/game/demo-save.ts'};const file=files[req.url];if(!file){res.writeHead(404);res.end();return;}content=readFileSync(resolve(root,file),'utf8');if(file.endsWith('.ts'))content=stripTypeScriptTypes(content);}
res.setHeader('Content-Type',req.url==='/'?'text/html':'text/javascript');res.end(content);});
(async()=>{let browser;try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>window.ready,null,{timeout:60000});
const result=await p.evaluate(()=>{const e=window.env,G=e.G,f=G.__farm;const caught=[];G.console.warn=(...a)=>caught.push(a.map(x=>x instanceof Error?x.stack:String(x)).join(' '));f.SAVE.off=true;const day=f.S.day;for(let i=0;i<24;i++)f.advance(10,10);return{fromDay:day,toDay:f.S.day,warnings:caught};});if(errors.length||result.warnings.some(x=>/chooseTask|stepActor|advance/.test(x)))throw new Error(JSON.stringify({errors,result}));console.log('PASS synthetic two-adult 240-second simulation',JSON.stringify(result));}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
