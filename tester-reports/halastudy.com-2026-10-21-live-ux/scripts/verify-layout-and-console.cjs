const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const rq=createRequire('C:/Users/alkhu/.agents/skills/tester/scripts/package.json');
const {chromium,devices}=rq('playwright');
const AxeBuilder=rq('@axe-core/playwright').default;
const dir=path.resolve(__dirname,'../verification');
const target=process.argv[2]||'https://halastudy.com';
(async()=>{
 const browser=await chromium.launch();const data={target,checks:[]};
 try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(()=>{
   window.__auditShifts=[];
   new PerformanceObserver(l=>{for(const e of l.getEntries())window.__auditShifts.push({value:e.value,recent:e.hadRecentInput,time:e.startTime,sources:(e.sources||[]).map(x=>({node:x.node?.tagName,id:x.node?.id,className:typeof x.node?.className==='string'?x.node.className:undefined,before:x.previousRect,after:x.currentRect}))});}).observe({type:'layout-shift',buffered:true});
  });
  const p=await ctx.newPage();let phase='load';const errors=[];
  p.on('console',m=>{if(m.type()==='error')errors.push({phase,text:m.text()});});p.on('pageerror',e=>errors.push({phase,pageerror:String(e)}));
  await p.goto(target,{waitUntil:'load'});await p.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
  await p.screenshot({path:path.join(dir,'home-desktop-idle-start.png')});
  await p.waitForTimeout(10000);
  data.homeIdle={shifts:await p.evaluate(()=>window.__auditShifts),errors:[...errors]};
  await p.screenshot({path:path.join(dir,'home-desktop-idle-10s.png')});
  phase='probe-scroll';
  await p.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight){scrollTo(0,y);await new Promise(r=>setTimeout(r,150));}scrollTo(0,0);});
  await p.waitForTimeout(600);
  data.homeAfterScroll={shifts:await p.evaluate(()=>window.__auditShifts),errors:[...errors]};
  phase='axe';
  data.homeAxe=await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze().then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})));
  data.homeAfterAxe={errors:[...errors]};
  await ctx.close();await new Promise(r=>setTimeout(r,2500));
  const mobile=await browser.newContext({...devices['iPhone 14']});const article=await mobile.newPage();
  await article.goto(target+'/blog/best-online-group-study-rooms-saudi',{waitUntil:'load'});
  await article.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
  data.tables=await article.locator('.table-wrap').evaluateAll(es=>es.map(e=>({tabIndex:e.tabIndex,role:e.getAttribute('role'),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,text:e.innerText.slice(0,150)})));
  await article.locator('.table-wrap').first().scrollIntoViewIfNeeded();
  await article.screenshot({path:path.join(dir,'article-table-mobile.png')});
  await mobile.close();
  console.log(JSON.stringify({idleCLS:data.homeIdle.shifts.filter(x=>!x.recent).reduce((a,x)=>a+x.value,0),scrollCLS:data.homeAfterScroll.shifts.filter(x=>!x.recent).reduce((a,x)=>a+x.value,0),beforeAxeErrors:data.homeIdle.errors.length,afterAxeErrors:data.homeAfterAxe.errors.length,tables:data.tables},null,2));
 }finally{await browser.close();fs.writeFileSync(path.join(dir,'layout-and-console.json'),JSON.stringify(data,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
