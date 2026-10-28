// Supplement the offline matrix with the actual published font families.
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
const AxeBuilder=require(path.join(process.cwd(),'node_modules/@axe-core/playwright')).default;
async function main(){
    const base='http://127.0.0.1:3495';
    const directory=path.join(process.env.REFINEMENT_OUTPUT,'screenshots/after/online');
    fs.mkdirSync(directory,{recursive:true});
    const browser=await chromium.launch({channel:'chrome'});
    const context=await browser.newContext();
    // No synthetic forwarded headers or credentials are sent to font hosts.
    await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        return ['127.0.0.1','localhost','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)
            ||!['http:','https:'].includes(url.protocol)?route.continue():route.abort();
    });
    const user=await require('./fixture-auth.cjs')(context,base);
    const page=await context.newPage();const rows=[];const errors=[];let phase='app';let state='setup';let index=0;
    // axe CSSOM preloading uses XHR for cross-origin stylesheets. The app's
    // connect-src deliberately rejects that tool request; normal stylesheet
    // and font loads remain subject to the strict failure check below.
    const isToolRequest=error=>typeof error==='object'&&error.phase==='axe'&&error.type==='xhr'
        &&new URL(error.url).hostname==='fonts.googleapis.com'&&error.error==='csp';
    const isNavigationCancellation=error=>typeof error==='object'&&error.phase==='navigation'&&error.type==='font'
        &&new URL(error.url).hostname==='fonts.gstatic.com'&&error.error==='net::ERR_ABORTED';
    const isExpectedRequest=error=>isToolRequest(error)||isNavigationCancellation(error);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>{if(new URL(request.url()).hostname.startsWith('fonts.'))errors.push({phase,state,page:page.url(),url:request.url(),type:request.resourceType(),error:request.failure()?.errorText});});
    await page.goto(base+'/open');
    await page.evaluate(()=>document.fonts.ready);
    const code=await page.evaluate(async()=>{const socket=io();await new Promise(resolve=>socket.on('connect',resolve));const result=await new Promise(resolve=>socket.emit('create-room',{roomName:'Actual font review'},resolve));socket.disconnect();return result.room.roomId;});
    const states=[
        ['/app','study',390,'ar','light'],['/app#progress','progress',768,'en','dark'],
        ['/app#circles','groups',390,'en','light'],['/account','account',390,'ar','dark'],
        ['/open','open',320,'ar','light'],['/lobby','lobby',390,'en','dark'],
        [`/study?room=${code}`,'room',390,'ar','dark'],[`/study?room=${code}`,'room',1440,'en','light'],
        ['/app','study',390,'ar','light',true],[`/study?room=${code}`,'room',390,'ar','light',true]
    ];
    try{
        for(const [route,label,width,lang,theme,enlarged]of states.slice(0,Number(process.env.FONT_REVIEW_LIMIT)||states.length)){
            phase='app';
            state=`${label}/${width}/${lang}/${theme}/${enlarged?200:100}`;
            await page.evaluate(({lang,theme})=>{localStorage.setItem('halastudyLang',lang);localStorage.setItem('coStudyLang',lang);localStorage.setItem('halastudyTheme',theme);},{lang,theme});
            const destination=new URL(base+route);destination.searchParams.set('localReview',String(index++));
            await page.setViewportSize({width,height:width<500?844:1000});
            phase='navigation';await page.goto(destination.href);phase='app';
            await page.waitForFunction(({lang,theme})=>document.documentElement.lang===lang&&document.documentElement.dataset.theme===theme,{lang,theme});
            if(route.startsWith('/app'))await page.locator(`[data-panel=${route.includes('#')?route.split('#')[1]:'home'}]`).waitFor({state:'visible'});
            if(route.startsWith('/study')){
                if(await page.locator('#join-overlay').isVisible()){await page.locator('#join-name').fill(user.displayName);await page.locator('#join-form button[type=submit]').click();}
                await page.waitForFunction(()=>!document.getElementById('chat-input').disabled);
            }
            await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fonts did not settle')),15000))]));
            if(enlarged)await page.evaluate(()=>{
                const entries=[...document.querySelectorAll('body *')].filter(el=>[...el.childNodes].some(node=>node.nodeType===3&&node.textContent.trim())||['INPUT','TEXTAREA','SELECT'].includes(el.tagName)).map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);
                for(const [el,size]of entries)el.style.fontSize=`${size*2}px`;
            });
            await page.evaluate(()=>{document.body.getBoundingClientRect();return document.fonts.ready;});
            const rendering=await page.evaluate(()=>({actualLang:document.documentElement.lang,actualTheme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,
                loaded:[...new Set([...document.fonts].filter(font=>font.status==='loaded').map(font=>font.family))],
                fontErrors:[...document.fonts].filter(font=>font.status==='error').map(font=>font.family)}));
            phase='axe';
            const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
            phase='app';
            await page.evaluate(()=>document.fonts.ready);
            const serious=axe.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>item.id);
            let primary;
            if(enlarged){
                const selector=label==='study'?'.study-start a.primary':'#btn-toggle';
                await page.locator(selector).scrollIntoViewIfNeeded();
                primary=await page.locator(selector).evaluate(element=>{const r=element.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return element===top||element.contains(top);});
            }
            const file=`${label}-${width}-${lang}-${theme}${enlarged?'-200':''}.png`;
            await page.screenshot({path:path.join(directory,file),fullPage:true});
            rows.push({label,width,lang,theme,textZoom:enlarged?200:100,file,...rendering,serious,primary});
        }
    }finally{
        fs.writeFileSync(path.join(process.env.REFINEMENT_OUTPUT,'evidence/online-visual.json'),JSON.stringify({browser:browser.version(),rows,errors:errors.filter(error=>!isExpectedRequest(error)),toolRequests:errors.filter(isToolRequest),navigationCancellations:errors.filter(isNavigationCancellation)},null,2));
        await browser.close();
    }
    const failures=rows.filter(row=>row.overflow||row.serious.length||row.fontErrors.length||!row.loaded.length||row.primary===false);
    const appErrors=errors.filter(error=>!isExpectedRequest(error));
    console.log(`${rows.length} actual-font visual states; ${failures.length} failures; ${appErrors.length} page/font errors; ${errors.filter(isToolRequest).length} recorded axe CSSOM requests rejected by CSP; ${errors.filter(isNavigationCancellation).length} recorded font cancellations during intentional navigation.`);
    if(failures.length||appErrors.length){console.log(JSON.stringify(failures));process.exitCode=1;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
