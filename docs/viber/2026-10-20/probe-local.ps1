$env:BACKUP_INTERVAL_MINUTES = '0'
$env:VIDEO_PROVIDER = 'mesh'
$env:PLATFORM_DATABASE_URL = ''
$env:SUPABASE_URL = ''
$env:SUPABASE_SERVICE_ROLE_KEY = ''
$env:TEMP = (New-Item -ItemType Directory -Force "$env:LOCALAPPDATA/Temp/halastudy-viber-2026-10-20/probe").FullName
$env:TMP = $env:TEMP
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'node_modules/.cache/ms-playwright'
@'
const fs = require('fs');
const { startServer } = require('./tests/helpers/server-control');
const { signupUser } = require('./tests/helpers/auth-helpers');
const { chromium } = require('@playwright/test');
const output = 'docs/viber/2026-10-20/evidence/local-probes.json';
const rows = [];
async function main() {
  const server = await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://',VIDEO_PROVIDER:'mesh'}});
  let browser;
  async function probe(path, options={}, label=path) {
    const r = await server.request(path, options);
    rows.push({label,request:{method:options.method||'GET',path,body:options.body,authenticated:!!options.headers?.Cookie},
      response:{status:r.status,body:typeof r.body==='string'?{html:true,length:r.body.length,noindex:/noindex/i.test(r.body)}:r.body,
        cache:r.headers['cache-control'],csp:!!r.headers['content-security-policy'],nosniff:r.headers['x-content-type-options']}});
    return r;
  }
  try {
    rows.push({target:server.baseUrl,data:'isolated local memory SQL and synthetic local files; providers disabled'});
    for(const path of ['/','/app','/plans','/supervisor','/.env','/.git/HEAD','/co-study-server.js','/data/users.json','/docs/viber/2026-10-20/RUN.md','/api/debug','/js/platform.js.map','/viber-missing','/api/platform/catalog','/api/platform/me','/api/platform/progress','/api/platform/staff/audit','/api/me/stats'])
      await probe(path);
    for(const match of fs.readFileSync('services/platform/routes.js','utf8').matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)) {
      if(match[2]==='/catalog') continue;
      const route='/api/platform'+match[2].replace(/:[A-Za-z]+/g,'synthetic-id');
      await probe(route,{method:match[1].toUpperCase(),...(match[1]==='get'?{}:{body:{}})},'anonymous protected platform route');
    }
    for(const body of [null,{}, {email:[],password:{},displayName:[]}])
      await probe('/api/auth/signup',{method:'POST',body},'signup malformed');
    const alice = await signupUser(server,{displayName:'Alice'});
    const bob = await signupUser(server,{displayName:'Bob'});
    const headers={Cookie:alice.cookie};
    await probe('/api/me/profile',{method:'PATCH',headers,body:{displayName:'ChangedByRejectedRequest',avatarColor:'bad'}},'rejected profile update');
    const after = await probe('/api/auth/me',{headers},'profile after rejected update');
    rows.push({finding:'V3-01',reproduced:after.body.user.displayName!=='Alice'});
    for(const [method,path,body]of [
      ['POST','/api/platform/cohorts',null],
      ['POST','/api/platform/cohorts/accept',{token:{}}],
      ['POST','/api/platform/billing/checkout/not-an-id/complete',{token:null,outcome:'success'}],
      ['POST','/api/platform/focus/not-an-id/heartbeat',{}],
      ['GET','/api/platform/cohorts/not-an-id/members'],
      ['PATCH','/api/platform/rooms/not-an-id',{name:'test'}],
      ['POST','/api/platform/security/mfa/verify',{code:123}],
      ['POST','/api/platform/staff/bootstrap',{password:'invalid'}]
    ]) await probe(path,{method,headers,body},'malformed/unauthorized');
    const focus=await probe('/api/platform/focus/start',{method:'POST',headers,body:{}},'valid focus control');
    const focusId=focus.body.session?.id||focus.body.id;
    if(focusId) {
      await probe(`/api/platform/focus/${focusId}/complete`,{method:'POST',headers:{Cookie:bob.cookie},body:{}},'cross-account focus completion');
      await probe(`/api/platform/focus/${focusId}/complete`,{method:'POST',headers,body:{}},'owner focus completion');
    }
    const checkout=await server.request('/api/platform/billing/checkout',{method:'POST',headers,body:{}});
    rows.push({label:'checkout control',response:{status:checkout.status,keys:Object.keys(checkout.body)}});
    if(checkout.body.id) await probe(`/api/platform/billing/checkout/${checkout.body.id}/complete`,{method:'POST',headers:{Cookie:bob.cookie},body:{token:'invalid',outcome:'success'}},'cross-account checkout');
    const attempts=await Promise.all(Array.from({length:20},()=>server.request('/api/auth/login',{method:'POST',body:{email:alice.credentials.email,password:'wrong-password'}})));
    rows.push({label:'concurrent login rate-limit burst',request:{method:'POST',path:'/api/auth/login',count:20,password:'invalid synthetic'},statuses:attempts.map(r=>r.status)});
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const consoleErrors=[];
    page.on('pageerror',e=>consoleErrors.push(e.message));
    await page.route('https://**/*',route=>route.abort());
    await page.goto(server.baseUrl+'/lobby?demo=12');
    await page.evaluate(()=>setParticipants([]));
    rows.push({label:'public lobby demo query',request:'GET /lobby?demo=12; empty server participants',response:{tiles:await page.locator('.lobby-tile').count(),participantCount:await page.evaluate(()=>state.participants.length)}});
    rows.push({label:'lobby shared feedback loaded',response:{available:await page.evaluate(()=>!!window.HalaUI)}});
    await page.evaluate(()=>{window.HalaUI={toast:(message)=>{window.__viberToast=message}};window.io=()=>({on(event,handler){if(event==='connect')queueMicrotask(handler)},emit(event,payload,handler){handler({ok:false,errorCode:'SESSION_EXPIRED'})},disconnect(){}});joinLobby('Synthetic');});
    rows.push({label:'lobby rejected join feedback',response:{toast:await page.evaluate(()=>window.__viberToast||null)}});
    rows.push({label:'browser errors',errors:consoleErrors});
    await page.screenshot({path:'docs/viber/2026-10-20/evidence/lobby-probe.png',fullPage:true});
    const baseline=fs.readFileSync('docs/viber/2026-10-20/evidence/lobby-before.html','utf8');
    await page.route(server.baseUrl+'/lobby',route=>route.fulfill({status:200,contentType:'text/html',body:baseline}));
    await page.goto(server.baseUrl+'/lobby');
    await page.evaluate(()=>{document.documentElement.lang='en';el('name-gate').hidden=true;el('lobby-view').hidden=false;
      window.io=()=>({on(event,handler){if(event==='connect')queueMicrotask(handler)},emit(event,payload,handler){handler({ok:false,errorCode:'SESSION_EXPIRED'})},disconnect(){}});
      joinLobby('Synthetic');
    });
    rows.push({label:'pre-fix lobby negative control',response:{
      feedbackLibrary:await page.evaluate(()=>!!window.HalaUI),
      toastCount:await page.locator('.hala-toast__msg').count(),
      retryGateVisible:await page.locator('#name-gate').isVisible()
    }});
  } finally {
    if(browser) await browser.close();
    await server.stop();
    fs.writeFileSync(output,JSON.stringify(rows,null,2));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
'@ | & 'C:\Users\alkhu\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
exit $LASTEXITCODE
