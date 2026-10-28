const fs=require('node:fs');const path=require('node:path');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
async function main(){
    const browser=await chromium.launch({channel:'chrome'});const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>{const url=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)?route.continue():route.abort();});
    const page=await context.newPage();const base='http://127.0.0.1:3495';const rows=[];
    await require('./fixture-auth.cjs')(context,base);
    await page.goto(base+'/open');
    const code=await page.evaluate(async()=>{const socket=io();await new Promise(r=>socket.on('connect',r));const result=await new Promise(r=>socket.emit('create-room',{roomName:'Zoom review'},r));socket.disconnect();return result.room.roomId;});
    for(const lang of ['ar','en'])for(const [route,selector]of [['/app','.study-start a.primary'],['/open','#create-form button[type=submit]'],[`/study?room=${code}`,'#btn-toggle']]){
        await page.evaluate(lang=>localStorage.setItem('halastudyLang',lang),lang);await page.goto(base+route);
        if(route==='/app')await page.locator('[data-panel=home]').waitFor({state:'visible'});
        if(route.startsWith('/study')){
            if(await page.locator('#join-overlay').isVisible()){await page.locator('#join-name').fill('Zoom reviewer');await page.locator('#join-form button[type=submit]').click();}
            await page.waitForFunction(()=>!document.getElementById('chat-input').disabled);
        }
        await page.locator(selector).waitFor({state:'visible'});
        await page.evaluate(()=>{const entries=[...document.querySelectorAll('body *')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||['INPUT','TEXTAREA','SELECT'].includes(el.tagName)).map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);for(const [el,size]of entries)el.style.fontSize=`${size*2}px`;});
        await page.locator(selector).scrollIntoViewIfNeeded();
        const result=await page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {unobstructed:element===top||element.contains(top),withinViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
        rows.push({route,lang,...result});
    }
    fs.writeFileSync(path.join(process.env.REFINEMENT_OUTPUT,'evidence/zoom-actions.json'),JSON.stringify({browser:browser.version(),rows},null,2));await browser.close();
    const failures=rows.filter(r=>!r.unobstructed||!r.withinViewport||r.overflow);console.log(`${rows.length} enlarged-text primary actions; ${failures.length} obstructed or overflowing.`);if(failures.length){console.log(JSON.stringify(failures));process.exitCode=1;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
