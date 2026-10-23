const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
const AxeBuilder=require(path.join(process.cwd(),'node_modules/@axe-core/playwright')).default;
const root=process.env.REFINEMENT_OUTPUT,base='http://127.0.0.1:3522';
(async()=>{
 const browser=await chromium.launch({channel:'chrome'}),rows=[];let axeFailed=false;
 try{
  const context=await browser.newContext();
  for(const width of [390,1440])for(const lang of ['ar','en'])for(const theme of ['light','dark']){
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:1000});
   await page.addInitScript(({lang,theme})=>{localStorage.setItem('halastudyLang',lang);localStorage.setItem('halastudyTheme',theme);},{lang,theme});
   await page.route('**/api/runtime-config',route=>route.fulfill({status:503,contentType:'application/json',body:'{"errorCode":"SERVICE_UNAVAILABLE"}'}));
   await page.goto(base+'/account');
   await page.locator('#provider-unavailable button').waitFor();
   await page.evaluate(()=>document.fonts.ready);
   const fonts=await page.evaluate(()=>({tajawal:document.fonts.check('16px Tajawal'),amiri:document.fonts.check('16px Amiri')}));
   const file=`screenshots/${lang}-${theme}-${width}-account-retry.png`;
   await page.screenshot({path:path.join(root,file),fullPage:true});
   const axe=await new AxeBuilder({page}).analyze();
   const serious=axe.violations.filter(v=>['serious','critical'].includes(v.impact));
   if(serious.length){axeFailed=true;fs.writeFileSync(path.join(root,`evidence/axe-${lang}-${theme}-${width}.json`),JSON.stringify(serious,null,2));}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.deepEqual(errors,[]);
   await page.unroute('**/api/runtime-config');
   await page.locator('#provider-unavailable button').focus();
   await page.keyboard.press('Enter');
   await page.locator('#provider-unavailable').waitFor({state:'hidden'});
   rows.push({lang,theme,width,state:'account provider retry',file,fonts,axeViolations:axe.violations.map(v=>v.id),pageErrors:errors,keyboardRetry:true});
   if(width===390){
    await page.route('**/api/rooms/ABC123',route=>route.fulfill({status:503,contentType:'application/json',body:'{"errorCode":"SERVICE_UNAVAILABLE"}'}));
    await page.goto(base+'/open#join');
    await page.fill('#join-code','ABC123');await page.locator('#join-form button[type=submit]').click();
    await page.locator('#join-feedback.error').waitFor();
    const file=`screenshots/${lang}-${theme}-390-join-retry.png`;
    await page.screenshot({path:path.join(root,file),fullPage:true});
    assert.equal(await page.locator('#join-form button[type=submit]').isEnabled(),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    rows.push({lang,theme,width,state:'join lookup error',file,buttonEnabled:true});
   }
   await page.close();
  }
  fs.writeFileSync(path.join(root,'evidence/visual-review.json'),JSON.stringify({base,rows},null,2));
  fs.writeFileSync(path.join(root,'review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Halastudy gate review</title><style>body{background:#f4efe7;color:#30251e;font:16px system-ui;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}img{max-width:100%;height:auto}article{padding:16px;background:#fffaf2;border:1px solid #d6cabd;border-radius:20px}a{color:#754827}</style><h1>Halastudy gate: actual recovery states</h1><p>Final candidate 5015826. Public fonts, synthetic local failures, Arabic/English and both themes.</p><main>${rows.map(r=>`<article><h2>${r.lang} · ${r.theme} · ${r.width}px</h2><p>${r.state}</p><a href="${r.file}"><img src="${r.file}" alt="${r.state} ${r.lang} ${r.theme}"></a></article>`).join('')}</main></html>`);
  console.log(`${rows.length} rendered recovery states; 8 axe checks, keyboard retries, no overflow/page exceptions. Axe serious findings: ${axeFailed}.`);
  if(axeFailed)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
