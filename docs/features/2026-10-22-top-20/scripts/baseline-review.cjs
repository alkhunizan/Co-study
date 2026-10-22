const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.cwd(), 'node_modules/playwright'));
const output = process.env.REFINEMENT_OUTPUT;
const phase = process.env.REVIEW_PHASE || 'before';
const base = 'http://127.0.0.1:3495';
async function main() {
    const browser = await chromium.launch({channel:'chrome'});
    const context = await browser.newContext();
    // Local application only; fonts use the installed fallback for this baseline.
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1','localhost'].includes(url.hostname) || !['http:','https:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const observations = [];
    page.on('pageerror', e => observations.push({type:'pageerror',message:e.message}));
    const snapshot = async (route, label, width=1440, lang='ar', theme='light') => {
        await page.setViewportSize({width,height:width<500?844:1000});
        await page.goto(base+route);
        await page.evaluate(({lang,theme})=>{localStorage.setItem('halastudyLang',lang);localStorage.setItem('coStudyLang',lang);localStorage.setItem('halastudyTheme',theme);}, {lang,theme});
        await page.reload();
        await page.waitForTimeout(700);
        if (route.startsWith('/study') && await page.locator('#join-overlay').isVisible()) {
            await page.locator('#join-name').fill(user.displayName);
            await page.locator('#join-form button[type=submit]').click();
            await page.locator('#join-overlay').waitFor({state:'hidden'});
        }
        const file=`${phase}/${label}-${width}-${lang}-${theme}.png`;
        await page.screenshot({path:path.join(output,'screenshots',file),fullPage:true});
        observations.push({route,label,width,lang,theme,file, ...(await page.evaluate(()=>({title:document.title,heading:document.querySelector('main h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth}))) });
    };
    for(const [route,label] of [['/','landing'],['/open','open'],['/account','account'],['/lobby','lobby']]) await snapshot(route,label,390);
    const user=await require('./fixture-auth.cjs')(context,base);
    for(const [route,label] of [['/app','study'],['/app#progress','progress'],['/app#circles','circles'],['/app#account','workspace-account']]) {
        await snapshot(route,label);
        await snapshot(route,label,390);
    }
    await snapshot('/app#progress','progress',768,'en','dark');
    await page.goto(base+'/open');
    const room = await page.evaluate(async()=>{
        const socket=io(); await new Promise(r=>socket.on('connect',r));
        const result=await new Promise(r=>socket.emit('create-room',{roomName:'جلسة هادئة',mediaMode:'mesh'},r));
        socket.disconnect(); return result;
    });
    if(room.ok){
        observations.push({type:'created-room',roomId:room.room?.roomId||room.roomId});
        const id=room.room?.roomId||room.roomId;
        await snapshot(`/study?room=${id}`,'room',1440);
        await snapshot(`/study?room=${id}`,'room',390);
    } else observations.push({type:'room-creation',result:room});
    fs.writeFileSync(path.join(output,`evidence/${phase}-browser.json`),JSON.stringify(observations,null,2));
    await browser.close();
    console.log(`Captured ${observations.filter(o=>o.file).length} real browser views (${phase}).`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

