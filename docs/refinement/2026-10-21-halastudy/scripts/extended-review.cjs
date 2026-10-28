const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.cwd(),'node_modules/playwright'));
const AxeBuilder = require(path.join(process.cwd(),'node_modules/@axe-core/playwright')).default;
const output=process.env.REFINEMENT_OUTPUT;
const base='http://127.0.0.1:3495';
async function main(){
    const browser=await chromium.launch({channel:'chrome'});
    const context=await browser.newContext();
    const rows=[];
    await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        return ['localhost','127.0.0.1'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)?route.continue():route.abort();
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const user=await require('./fixture-auth.cjs')(context,base);
    await page.goto(base+'/open');
    const code=await page.evaluate(async()=>{
        const socket=io();await new Promise(r=>socket.on('connect',r));
        const result=await new Promise(r=>socket.emit('create-room',{roomName:'جلسة للمراجعة المحلية'},r));
        socket.disconnect();return result.room.roomId;
    });
    const routes=[['/','landing'],['/open','open'],['/lobby','lobby'],['/account','account'],[`/study?room=${code}`,'room']];
    const directory=path.join(output,'screenshots/after/extended');fs.mkdirSync(directory,{recursive:true});
    let navigation=0;
    const visit=async(route,lang,theme,width)=>{
        await page.setViewportSize({width,height:width<500?844:1000});
        await page.evaluate(({lang,theme})=>{localStorage.setItem('halastudyLang',lang);localStorage.setItem('coStudyLang',lang);localStorage.setItem('halastudyTheme',theme);},{lang,theme});
        const destination=new URL(route==='/'&&lang==='en'?'/en':route,base);
        destination.searchParams.set('localReview',String(navigation++));
        await page.goto(destination.href);
        await page.waitForFunction(({lang,theme})=>document.documentElement.lang===lang&&document.documentElement.dataset.theme===theme,{lang,theme});
        if(route.startsWith('/study')&&await page.locator('#join-overlay').isVisible()){
            await page.locator('#join-name').fill(user.displayName);await page.locator('#join-form button[type=submit]').click();
            await page.locator('#join-overlay').waitFor({state:'hidden'});
        }
        if(route.startsWith('/study')) await page.waitForFunction(()=>!document.getElementById('chat-input').disabled);
        await page.waitForTimeout(200);
    };
    try{
        for(const width of [320,390,768,1440])for(const lang of ['ar','en'])for(const theme of ['light','dark'])for(const [route,label]of routes){
            await visit(route,lang,theme,width);
            const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
            const serious=axe.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));
            const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
            const file=`${label}-${width}-${lang}-${theme}.png`;
            await page.screenshot({path:path.join(directory,file),fullPage:true});
            const actual=await page.evaluate(()=>({actualLang:document.documentElement.lang,actualTheme:document.documentElement.dataset.theme}));
            rows.push({label,route,width,lang,theme,...actual,file,overflow,serious});
        }
        for(const [route,label]of [['/app','study'],['/open','open'],[`/study?room=${code}`,'room']])for(const lang of ['ar','en']){
            await visit(route,lang,'light',390);
            // Text-only enlargement: scale computed text once, preserving layout viewport.
            await page.evaluate(()=>{
                const entries=[...document.querySelectorAll('body *')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||['INPUT','TEXTAREA','SELECT'].includes(el.tagName))
                    .map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);
                for(const [el,size]of entries)el.style.fontSize=`${size*2}px`;
            });
            const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
            const file=`zoom-200-${label}-${lang}.png`;await page.screenshot({path:path.join(directory,file),fullPage:true});
            rows.push({label,lang,width:390,textZoom:200,file,overflow});
        }
    }finally{
        fs.writeFileSync(path.join(output,'evidence/extended-browser.json'),JSON.stringify({rows,errors},null,2));
        await browser.close();
    }
    const failures=rows.filter(r=>r.overflow||r.serious?.length);
    console.log(`${rows.length} visual states; ${failures.length} states need correction; ${errors.length} page exceptions.`);
    if(failures.length||errors.length){console.log(JSON.stringify(failures.map(r=>({label:r.label,width:r.width,lang:r.lang,theme:r.theme,textZoom:r.textZoom,overflow:r.overflow,serious:r.serious})),null,2));process.exitCode=1;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
