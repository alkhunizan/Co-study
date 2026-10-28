const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=process.cwd();
const {chromium}=require(path.join(root,'node_modules/playwright'));
const {startServer}=require(path.join(root,'tests/helpers/server-control'));
(async()=>{
 const server=await startServer({env:{VIDEO_PROVIDER:'mesh'}});
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const context=await browser.newContext({baseURL:server.baseUrl,permissions:['camera']});
  const page=await context.newPage();
  await page.addInitScript(()=>{
   localStorage.setItem('halastudyLang','en');delete window.FaceDetector;
   const play=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(){
    if(this.style.position==='fixed'&&this.srcObject){
     this.srcObject.getTracks().forEach(t=>{t.stop();t.dispatchEvent(new Event('ended'));});
     return Promise.resolve();
    }
    return play.call(this);
   };
  });
  await page.goto('/open');await page.fill('#room-name','Camera ended synthetic');
  await page.click('#create-form button[type=submit]');await page.locator('#create-result').waitFor({state:'visible'});
  await page.click('#btn-enter-room');await page.fill('#join-name','Synthetic');await page.click('#join-form button[type=submit]');
  await page.waitForFunction(()=>!document.getElementById('chat-input').disabled);
  await page.click('#camera-toggle');
  await page.waitForFunction(()=>!document.getElementById('camera-toggle').disabled);
  const result=await page.evaluate(()=>({previewCleared:document.getElementById('local-video').srcObject===null,helpVisible:!document.getElementById('camera-help').hidden,rawVideos:document.querySelectorAll('video[style*="position: fixed"]').length}));
  fs.writeFileSync(path.join(__dirname,'evidence',`camera-ended-${process.env.PROBE_LABEL||'after'}.json`),JSON.stringify(result,null,2));
  console.log(result);assert.equal(result.previewCleared,true);assert.equal(result.helpVisible,true);assert.equal(result.rawVideos,0);
 }finally{await browser.close();await server.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
