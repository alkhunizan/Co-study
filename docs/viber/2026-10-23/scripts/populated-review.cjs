const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
const AxeBuilder=require(path.join(process.cwd(),'node_modules/@axe-core/playwright')).default;
const {connectSocket,emitAck,closeSocket}=require(path.join(process.cwd(),'tests/helpers/socket-client'));
const base='http://127.0.0.1:3522',output=process.env.REFINEMENT_OUTPUT;
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local review only');
(async()=>{
 const browser=await chromium.launch({channel:'chrome'}),context=await browser.newContext();
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  return ['localhost','127.0.0.1','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)?route.continue():route.abort();
 });
 const user=await require('./fixture-auth.cjs')(context,base);
 const request=async(method,route,data)=>{
  const r=await context.request.fetch(base+'/api/platform'+route,{method,...(data===undefined?{}:{data})});
  if(!r.ok())throw Error(`${method} ${route}: ${r.status()} ${await r.text()}`);return r.json();
 };
 const key=n=>`20261022-0000-4000-8000-${String(n).padStart(12,'0')}`;
 let overview=await request('GET','/study/overview');
 let project=overview.projects.find(p=>p.name==='مذاكرة الأحياء');
 if(!project)project=await request('POST','/study/projects',{name:'مذاكرة الأحياء',requestId:key(1)});
 let task=overview.tasks.find(t=>t.title==='مراجعة الخلية');
 if(!task)task=await request('POST','/study/tasks',{title:'مراجعة الخلية',project_id:project.id,note:'خطوة واحدة واضحة قبل البدء.',priority:'high',due_date:overview.today,recurrence:'none',estimate_minutes:25,steps:[{id:'1',text:'قراءة الفصل',done:true},{id:'2',text:'رسم ملخص',done:false}],requestId:key(2)});
 if(!overview.tasks.some(t=>t.title==='Review cell diagrams'))await request('POST','/study/tasks',{title:'Review cell diagrams',project_id:project.id,note:'A small next step.',priority:'normal',due_date:overview.today,recurrence:'daily',estimate_minutes:15,steps:[],requestId:key(3)});
 if(!overview.distractions.some(d=>d.text==='أراجع بريد الجامعة بعد الجلسة'))await request('POST','/study/distractions',{text:'أراجع بريد الجامعة بعد الجلسة',requestId:key(4)});
 let routine=overview.routines.find(r=>r.name==='إيقاع هادئ');
 if(!routine)routine=await request('POST','/study/routines',{name:'إيقاع هادئ',focus_minutes:25,break_minutes:5,long_break_minutes:15,cycles:4,long_every:2,requestId:key(5)});
 await request('PUT','/study/preferences',{...overview.preferences,daily_target:30,weekly_target:120,reminders:false});
 const priorFocus=(await request('GET','/progress')).current;
 if(priorFocus&&['active','paused'].includes(priorFocus.state))await request('POST',`/focus/${priorFocus.id}/complete`,{});
 let me=await request('GET','/me');
 if(me.benefits.plan.id!=='vip'){
  const checkout=await request('POST','/billing/checkout',{});
  await request('POST',`/billing/checkout/${checkout.id}/complete`,{token:checkout.token,outcome:'success'});
  me=await request('GET','/me');
 }
 let circle=me.cohorts.find(c=>c.name==='مجموعة تجريبية للمراجعة');
 if(!circle)circle=await request('POST','/cohorts',{name:'مجموعة تجريبية للمراجعة'});
 let bookmarks=await request('GET','/study/bookmarks'),room=bookmarks.bookmarks.find(b=>b.available);
 if(!room){
  const cookie=(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ');
  const socket=await connectSocket(base,{clientId:'top20-visual-fixture',extraHeaders:{Cookie:cookie}});
  try{const created=await emitAck(socket,'create-room',{roomName:'طاولة مراجعة تجريبية'});assert.ok(created.ok);room={roomId:created.room.roomId};}finally{await closeSocket(socket);}
  await request('POST','/study/bookmarks',{roomId:room.roomId});
 }
 let sessions=(await request('GET',`/cohorts/${circle.id}/sessions`)).sessions;
 if(!sessions.some(s=>s.title==='موعدنا للمراجعة'))await request('POST',`/cohorts/${circle.id}/sessions`,{roomId:room.roomId,title:'موعدنا للمراجعة',startsAt:Date.now()+86400000,durationMinutes:25});
 sessions=(await request('GET',`/cohorts/${circle.id}/sessions`)).sessions;
 await request('PUT',`/study/agenda/${sessions[0].id}/rsvp`,{status:'going'});
 const resources=await request('GET',`/study/circles/${circle.id}/resources`);
 if(!resources.resources.length)await request('POST',`/study/circles/${circle.id}/resources`,{title:'دليل مراجعة تجريبي',url:'https://example.com/study-guide',note:'مصدر تجريبي للمراجعة المحلية.',requestId:key(6)});
 const history=await request('GET','/study/journal');
 if(!history.sessions.length){const s=await request('POST','/focus/start',{});await request('PUT',`/study/focus/${s.id}/task`,{taskId:task.id});await request('POST',`/focus/${s.id}/complete`,{});await request('PUT',`/study/focus/${s.id}/reflection`,{outcome:'partial',note:'أكمل الملاحظات في الجلسة القادمة.',version:0});}
 const page=await context.newPage(),errors=[],failures=[],rows=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(new URL(r.url()).hostname==='127.0.0.1'&&r.status()>=400)failures.push({url:r.url(),status:r.status()});});
 const ready=async()=>{await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>document.getElementById('study-status')?.textContent==='');await page.evaluate(()=>document.fonts.ready);};
 const capture=async(label,width,lang,theme,tab=null,route='/app#planner',zoom=false,axe=false)=>{
  await page.setViewportSize({width,height:width<500?844:1000});await page.goto(base+route);await ready();
  await page.locator(`[data-lang-value=${lang}]`).click();await page.evaluate(theme=>/** @type {any} */(window).HalaCore.setTheme(theme),theme);await ready();
  if(tab){await page.locator(`.study-tabs [data-lang=${tab}]`).click();await ready();}
  if(route==='/app#circles'){await page.locator('#circle-list button').first().click();await page.locator('#study-resource-list').waitFor();}
  if(label==='guide'){await page.locator('#study-focus-task').selectOption(task.id);await page.locator('#study-focus-routine').selectOption(routine.id);await page.locator('#study-guide [data-lang=routineBegin]').click();await page.locator('#study-guide [data-lang=routinePause]').waitFor();await page.locator('#study-guide [data-lang=routinePause]').click();}
  let style;if(zoom)style=await page.addStyleTag({content:'html{font-size:200% !important}'});
  await page.evaluate(()=>document.fonts.ready);
  const actual=await page.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family),title:document.title}));
  assert.equal(actual.lang,lang);assert.equal(actual.theme,theme);assert.equal(actual.dir,lang==='ar'?'rtl':'ltr');assert.equal(actual.overflow,false);
  assert.ok(actual.fonts.some(f=>f.includes(lang==='ar'?'Tajawal':'Inter')),'Actual body font must be loaded');
  const file=`after/${label}-${width}-${lang}-${theme}${zoom?'-zoom':''}.png`;
  await page.screenshot({path:path.join(output,'screenshots',file),fullPage:true});
  let violations=[];if(axe){violations=(await new AxeBuilder({page}).options({preload:false}).analyze()).violations;assert.deepEqual(violations,[]);}
  rows.push({label,width,lang,theme,zoom,route,tab,file,...actual,axe:axe?{violations}:null});
  if(style)await style.evaluate(e=>e.remove());
 };
 for(const [label,tab]of [['tasks','tasksTab'],['routines','routinesTab'],['favorites','libraryTab'],['agenda','agendaTab'],['insights','insightsTab']]){
  await capture(label,390,'ar','light',tab,undefined,false,true);await capture(label,1440,'en','dark',tab,undefined,false,true);
 }
 await capture('tasks',320,'en','light','tasksTab');await capture('routines',768,'ar','dark','routinesTab');await capture('insights',768,'en','light','insightsTab');await capture('insights',390,'ar','dark','insightsTab');
 await capture('guide',1440,'ar','light',null,'/app#progress',false,true);
 await capture('progress',390,'en','dark',null,'/app#progress',false,true);
 await capture('resources',390,'ar','light',null,'/app#circles',false,true);await capture('resources',1440,'en','dark',null,'/app#circles',false,true);
 await capture('study',390,'ar','light',null,'/app#home');await capture('tasks',390,'ar','light','tasksTab',undefined,true);
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 const source=JSON.parse(fs.readFileSync(path.join(output,'evidence/candidate-source.json'),'utf8').replace(/^\uFEFF/,''));
 fs.writeFileSync(path.join(output,'evidence/final-browser-review.json'),JSON.stringify({base,browser:browser.version(),sourceHead:source.head,userId:user.id,synthetic:true,rows,errors,failures},null,2));
 console.log(`Captured ${rows.length} populated actual-font browser views; ${rows.filter(r=>r.axe).length} axe states; no overflow or local HTTP/page errors.`);
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});

