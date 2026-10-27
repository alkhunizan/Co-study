const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');const rq=createRequire('C:/Users/alkhu/.agents/skills/tester/scripts/package.json');
const {chromium,devices}=rq('playwright');const dir=path.resolve(__dirname,'../verification');
(async()=>{const browser=await chromium.launch();const data={};try{
const ctx=await browser.newContext({...devices['iPhone 14']});const p=await ctx.newPage();
const measure=()=>p.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,scrollX,items:[...document.querySelectorAll('.topbar,#nav-burger,#mobile-menu,.mobile-menu-cta,.hero-mosaic')].map(e=>{const r=e.getBoundingClientRect();return{id:e.id,className:e.className,x:r.x,y:r.y,width:r.width,right:r.right,display:getComputedStyle(e).display};})}));
await p.goto('https://halastudy.com/',{waitUntil:'load'});await p.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});data.ar=await measure();
await p.locator('#nav-burger').click();await p.locator('#lang-en').filter({visible:true}).click();await p.waitForTimeout(700);data.enMenu=await measure();
await p.screenshot({path:path.join(dir,'english-menu-mobile.png')});
data.hitTest=await p.evaluate(()=>{const e=document.querySelector('#nav-burger'),r=e.getBoundingClientRect();const points=[{x:r.x+r.width/2,y:r.y+r.height/2},{x:Math.min(document.documentElement.clientWidth-2,r.x+4),y:r.y+r.height/2}];return{button:e.outerHTML,targets:points.map(q=>{const h=document.elementFromPoint(q.x,q.y);return{...q,tag:h?.tagName,id:h?.id,className:typeof h?.className==='string'?h.className:'',html:h?.outerHTML.slice(0,240),buttonReceivesEvent:h===e||e.contains(h)};})};});
await p.locator('#nav-burger').click({timeout:5000}).catch(e=>{data.closeError=e.message;});await p.waitForTimeout(200);data.afterCloseAttempt=await measure();
await p.screenshot({path:path.join(dir,'english-after-close-attempt.png')});
}finally{await browser.close();fs.writeFileSync(path.join(dir,'english-layout.json'),JSON.stringify(data,null,2));}console.log(JSON.stringify(data,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
