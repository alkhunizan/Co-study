const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
const AxeBuilder=require(path.join(process.cwd(),'node_modules/@axe-core/playwright')).default;
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  await page.addInitScript(()=>localStorage.setItem('halastudyLang','ar'));
  await page.goto('http://127.0.0.1:3522/account');await page.evaluate(()=>document.fonts.ready);
  const before=await new AxeBuilder({page}).withRules(['label-content-name-mismatch']).analyze();
  const name=await page.locator('.brand').evaluate(el=>({visible:el.textContent.trim(),label:el.getAttribute('aria-label')}));
  await page.locator('.brand').evaluate(el=>el.setAttribute('aria-label',el.textContent.trim()+' home'));
  const after=await new AxeBuilder({page}).withRules(['label-content-name-mismatch']).analyze();
  const result={sourceUnchanged:true,temporaryDOMOnly:true,name,before:before.violations,after:after.violations};
  fs.writeFileSync(path.join(process.env.REFINEMENT_OUTPUT,'evidence/label-control.json'),JSON.stringify(result,null,2));
  assert.equal(before.violations.length,1);assert.equal(after.violations.length,0);
  console.log('Confirmed V9-01: current brand label fails; temporary browser-only visible-name control passes. No source patch applied.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
