const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const root=process.cwd();
const {chromium}=require(path.join(root,'node_modules/playwright'));
const {startServer}=require(path.join(root,'tests/helpers/server-control'));
(async()=>{
 const server=await startServer({env:{VIDEO_PROVIDER:'mesh'}});
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
 try {
  const context=await browser.newContext({baseURL:server.baseUrl,permissions:['camera']});
  const page=await context.newPage();
  page.on('pageerror',error=>console.log('PAGEERROR',error.message));
  page.on('console',message=>{if(/CAMERA|BLUR|ERROR/.test(message.text()))console.log(message.text());});
  await page.addInitScript(()=>{localStorage.setItem('halastudyLang','en');delete window.FaceDetector;
   window.__auditTracks=[];const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async(options)=>{const s=await capture(options);window.__auditTracks.push(...s.getTracks());for(const t of s.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{console.log('CAMERA STOP',new Error().stack);stop();};}return s;};});
  await page.goto('/open'); await page.fill('#room-name','Synthetic privacy probe');
  await page.click('#create-form button[type=submit]'); await page.locator('#create-result').waitFor({state:'visible'});
  await page.click('#btn-enter-room'); await page.fill('#join-name','Synthetic');
  await page.click('#join-form button[type=submit]'); await page.waitForFunction(()=>!document.getElementById('chat-input').disabled);
  const track=()=>page.evaluate(()=>{const t=document.getElementById('local-video').srcObject?.getVideoTracks()[0];return {label:t?.label,state:t?.readyState,blur:document.getElementById('blur-toggle').textContent};});
  await page.click('#camera-toggle'); await page.waitForFunction(()=>document.getElementById('local-video').srcObject?.getVideoTracks()[0]?.readyState==='live');
  const control=await track(); assert.doesNotMatch(control.label,/fake/i);
  await page.click('#blur-toggle');
  console.log('NORMAL_BLUR_OFF',await track(),await page.evaluate(()=>window.__auditTracks.map(t=>({label:t.label,state:t.readyState}))));
  assert.match((await track()).label,/fake/i);
  await page.click('#blur-toggle');await page.waitForFunction(()=>{const t=document.getElementById('local-video').srcObject?.getVideoTracks()[0];return t?.readyState==='live'&&!t.label.includes('fake');});
  await page.click('#camera-toggle');
  await page.evaluate(()=>{HTMLCanvasElement.prototype.captureStream=function(){throw new DOMException('injected canvas capture failure','NotAllowedError');};});
  await page.click('#camera-toggle');
  const closed=process.env.EXPECT_BLUR_CLOSED==='1';
  await page.waitForFunction((closed)=>closed ? !document.getElementById('camera-help').hidden : document.getElementById('local-video').srcObject?.getVideoTracks()[0]?.readyState==='live',closed);
  const startupFailure=await track();
  if(closed) assert.equal(startupFailure.label,undefined); else assert.match(startupFailure.label,/fake/i);
  assert.match(startupFailure.blur,/on/);
  await page.click('#blur-toggle');
  if(closed){await page.click('#camera-toggle');await page.waitForFunction(()=>document.getElementById('local-video').srcObject?.getVideoTracks()[0]?.readyState==='live');assert.match((await track()).label,/fake/i);}
  await page.click('#blur-toggle');
  if(closed) await page.waitForFunction(()=>!document.getElementById('camera-help').hidden && document.getElementById('local-video').srcObject===null);
  const toggleFailure=await track();
  if(closed) assert.equal(toggleFailure.label,undefined); else assert.match(toggleFailure.label,/fake/i);
  assert.match(toggleFailure.blur,/on/);
  if(closed){assert.equal(await page.evaluate(()=>window.__auditTracks.every(t=>t.readyState==='ended')),true);assert.match(await page.locator('#camera-help-message').textContent(),/Privacy blur/);}
  let unsupported;
  if(closed){
   const other=await browser.newContext({permissions:['camera']});const p=await other.newPage();
   await p.addInitScript(()=>{localStorage.setItem('halastudyLang','en');HTMLCanvasElement.prototype.captureStream=undefined;});
   await p.goto(page.url());await p.fill('#join-name','No blur support');await p.click('#join-form button[type=submit]');
   await p.waitForFunction(()=>!document.getElementById('chat-input').disabled);
   await p.click('#camera-toggle');await p.locator('#camera-help').waitFor({state:'visible'});
   assert.equal(await p.evaluate(()=>document.getElementById('local-video').srcObject),null);
   await p.click('#blur-toggle');await p.click('#camera-toggle');
   await p.waitForFunction(()=>document.getElementById('local-video').srcObject?.getVideoTracks()[0]?.readyState==='live');
   unsupported={defaultBlocked:true,explicitUnblurredChoiceWorks:true};await other.close();
  }
  await page.screenshot({path:path.join(__dirname,'evidence',closed?'blur-proposal.png':'blur-failure.png')});
  const result={control,startupFailure,toggleFailure,unsupported,rawTracksStopped:closed,realCamera:false,externalProviderCalls:0};
  fs.writeFileSync(path.join(__dirname,'evidence',closed?'blur-proposal.json':'blur-failure.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
  await context.close();
 } finally {await browser.close();await server.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
