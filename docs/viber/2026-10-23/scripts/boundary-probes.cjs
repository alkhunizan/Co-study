const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { startServer } = require(path.join(process.cwd(), 'tests/helpers/server-control'));
const { signupUser } = require(path.join(process.cwd(), 'tests/helpers/auth-helpers'));
const output = process.env.REFINEMENT_OUTPUT;
(async () => {
 const server = await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://', VIDEO_PROVIDER:'mesh'}});
 const results=[];
 const probe=async(label,method,route,body,account,expected)=>{
  const r=await server.request(route,{method,body,headers:account?{Cookie:account.cookie}:{}});
  results.push({label,request:{method,path:route,body,identity:account?.user.displayName||'anonymous'},response:{status:r.status,error:r.body?.errorCode||r.body?.error,cacheControl:r.headers['cache-control'],vary:r.headers.vary}});
  fs.writeFileSync(path.join(output,'evidence/boundary-probes.json'),JSON.stringify({target:server.baseUrl,synthetic:true,results},null,2));
  if(expected==='4xx')assert.ok(r.status>=400&&r.status<500,`${label}: ${r.status}`);else assert.equal(r.status,expected,label);
  return r.body;
 };
 try {
  const a=await signupUser(server,{displayName:'Probe A'}), b=await signupUser(server,{displayName:'Probe B'});
  for(const route of ['/api/platform/me','/api/platform/progress','/api/platform/cohorts','/api/platform/study/overview','/api/platform/study/tasks','/api/platform/study/agenda','/api/platform/study/calendar.ics','/api/platform/staff'])await probe('protected anonymous','GET',route,undefined,null,401);
  for(const route of ['/api/platform/me','/api/platform/progress','/api/platform/dashboard','/api/platform/study/insights','/api/platform/study/journal','/api/platform/study/preferences','/api/platform/study/bookmarks'])await probe('member positive control','GET',route,undefined,a,200);
  await probe('ordinary member denied staff','GET','/api/platform/staff',undefined,a,403);
  const prefix='/api/platform/study', requestId=crypto.randomUUID();
  const data={title:'Synthetic private task',note:'Local probe only',priority:'normal',due_date:'',recurrence:'none',estimate_minutes:25,steps:[],requestId};
  const first=await probe('valid create','POST',prefix+'/tasks',data,a,200);
  const retry=await probe('duplicate create','POST',prefix+'/tasks',data,a,200);assert.equal(first.id,retry.id);
  const other=await probe('same idempotency key another user','POST',prefix+'/tasks',data,b,200);assert.notEqual(first.id,other.id);
  const own=await probe('own list positive control','GET',prefix+'/overview',undefined,a,200);
  assert.ok(own.tasks.every(item=>item.id!==other.id));
  await probe('cross account mutation','PATCH',`${prefix}/tasks/${first.id}`,{title:'Denied',version:1},b,404);
  for(const body of [null,{}, {title:{}},{...data,title:'x'.repeat(201),requestId:crypto.randomUUID()},{...data,priority:'injected',requestId:crypto.randomUUID()}])await probe('invalid task input','POST',prefix+'/tasks',body,a,'4xx');
  await probe('malformed identifier','PATCH',prefix+'/tasks/not-a-uuid',{title:'Denied',version:1},a,'4xx');
  const prefs={version:0,daily_target:30,weekly_target:150,reminders:false,reminder_minutes:5};
  await probe('valid preferences','PUT',prefix+'/preferences',prefs,a,200);
  await probe('preference retry','PUT',prefix+'/preferences',prefs,a,200);
  await probe('target beyond cap','PUT',prefix+'/preferences',{...prefs,version:1,daily_target:241},a,'4xx');
  for(let i=0;i<2;i++)await probe('signup limiter positive control','POST','/api/auth/signup',{email:`gate-control-${i}@example.invalid`,password:'synthetic-pass-123',displayName:'Fixture'},null,200);
  const burst=await Promise.all([0,1].map(i=>server.request('/api/auth/signup',{method:'POST',body:{email:`gate-burst-${i}@example.invalid`,password:'synthetic-pass-123',displayName:'Fixture'}})));
  assert.deepEqual(burst.map(r=>r.status).sort(),[200,429]);
  results.push({label:'concurrent signup at limit-1',request:{method:'POST',path:'/api/auth/signup',concurrency:2,priorSuccessful:4},response:{statuses:burst.map(r=>r.status)}});
  fs.writeFileSync(path.join(output,'evidence/boundary-probes.json'),JSON.stringify({target:server.baseUrl,synthetic:true,results},null,2));
  console.log(`${results.length} exact local boundary probes passed; cross-account, malformed, retry and concurrent limit controls.`);
 } finally {await server.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
