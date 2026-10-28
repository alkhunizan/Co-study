const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
const {expect}=require(path.join(process.cwd(),'node_modules/@playwright/test'));
const AxeBuilder=require(path.join(process.cwd(),'node_modules/@axe-core/playwright')).default;
(async()=>{
 const output=process.env.REFINEMENT_OUTPUT,browser=await chromium.launch({channel:'chrome'});
 try{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(pathToFileURL(path.join(output,'review.html')).href);
 await expect(page.locator('article')).toHaveCount(46);
 for(const [label,count]of [['Before',15],['After',31],['Arabic',31],['English',15],['All',46]]){
  await page.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('article:not([hidden])')).toHaveCount(count);
 }
 const rows=[];
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
  const violations=(await new AxeBuilder({page}).options({preload:false}).analyze()).violations;expect(violations).toEqual([]);
  const file=`screenshots/review-${width}.png`;await page.screenshot({path:path.join(output,file)});rows.push({width,overflow,violations,file});
 }
 fs.writeFileSync(path.join(output,'evidence/review-artifact.json'),JSON.stringify({browser:browser.version(),cards:46,filters:true,rows},null,2));
 console.log('Review rendered at 390/1440px; all 46 cards, filters and axe checks passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
