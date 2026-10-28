const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
(async()=>{
    const browser=await chromium.launch({channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await require('./fixture-auth.cjs')(context,'http://127.0.0.1:3510');
    await page.goto('http://127.0.0.1:3510/app#planner');
    await page.waitForTimeout(1500);
    await page.screenshot({path:path.join(process.env.REFINEMENT_OUTPUT,'screenshots/initial-planner.png'),fullPage:true});
    fs.writeFileSync(path.join(process.env.REFINEMENT_OUTPUT,'evidence/initial-browser.json'),JSON.stringify({errors,status:await page.locator('#study-status').textContent(),taskForms:await page.locator('#study-task').count(),visible:await page.locator('#study-task').isVisible()},null,2));
    console.log(JSON.stringify({errors,status:await page.locator('#study-status').textContent()}));
    await browser.close();if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
