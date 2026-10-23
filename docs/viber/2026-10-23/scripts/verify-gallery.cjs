const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
const AxeBuilder=require(path.join(process.cwd(),'node_modules/@axe-core/playwright')).default;
const root=path.resolve(process.env.REFINEMENT_OUTPUT);
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.png')?'image/png':'text/plain; charset=utf-8';
  fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':type});res.end(error?'Not found':data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome'}),rows=[];
 try{
  const context=await browser.newContext(),page=await context.newPage();
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto(`http://127.0.0.1:${server.address().port}/review.html`);
   assert.equal(await page.locator('article').count(),36);
   for(const [filter,count] of [['before',4],['recovery',12],['planner',20],['all',36]]){
    await page.locator(`[data-filter=${filter}]`).click();assert.equal(await page.locator('article:visible').count(),count);
   }
   const axe=await new AxeBuilder({page}).analyze();assert.deepEqual(axe.violations,[]);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   rows.push({width,cards:36,filters:true,axeViolations:0});
  }
  fs.writeFileSync(path.join(root,'evidence/gallery-review.json'),JSON.stringify(rows,null,2));
  console.log('Gallery verified at390/1440px:36 images, four filters, no axe violations/overflow.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
