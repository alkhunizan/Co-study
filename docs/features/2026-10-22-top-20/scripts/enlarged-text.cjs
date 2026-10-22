const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.cwd(),'node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({channel:'chrome'}),context=await browser.newContext({viewport:{width:390,height:844}}),base='http://127.0.0.1:3510',output=process.env.REFINEMENT_OUTPUT;
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['localhost','127.0.0.1','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)?route.continue():route.abort();});
 await require('./fixture-auth.cjs')(context,base);const page=await context.newPage(),rows=[];
 for(const lang of ['ar','en'])for(const [label,tab,selector]of [['tasks','tasksTab','#study-task button[type=submit]'],['routines','routinesTab','#study-routine button[type=submit]'],['favorites','libraryTab','#study-bookmark button[type=submit]'],['agenda','agendaTab','#study-reminders button[type=submit]'],['insights','insightsTab','#study-journal button[type=submit]']]){
  await page.goto(base+'/app#planner');await page.reload();await page.locator('#loading').waitFor({state:'hidden'});await page.locator(`[data-lang-value=${lang}]`).click();await page.locator(`.study-tabs [data-lang=${tab}]`).click();await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{const entries=[...document.querySelectorAll('body *')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||['INPUT','TEXTAREA','SELECT'].includes(el.tagName)).map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);for(const [el,size]of entries)el.style.fontSize=`${size*2}px`;});
  await page.locator(selector).scrollIntoViewIfNeeded();
  const result=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {overflow:document.documentElement.scrollWidth>innerWidth,unobstructed:hit===el||el.contains(hit),withinViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};});
  const file=`after/${label}-390-${lang}-enlarged-text.png`;await page.screenshot({path:path.join(output,'screenshots',file),fullPage:true});rows.push({lang,label,file,...result});
 }
 // Matched before/after progress comparison, without a changed viewport/theme.
 await page.goto(base+'/app#progress');await page.reload();await page.locator('#loading').waitFor({state:'hidden'});await page.locator('[data-lang-value=ar]').click();await page.evaluate(()=>/** @type {any} */(window).HalaCore.setTheme('light'));await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(output,'screenshots/after/progress-390-ar-light.png'),fullPage:true});
 fs.writeFileSync(path.join(output,'evidence/enlarged-text.json'),JSON.stringify({method:'Computed text and control fonts doubled individually at a 390px viewport; current actual web fonts.',rows},null,2));
 await browser.close();const failed=rows.filter(r=>r.overflow||!r.unobstructed||!r.withinViewport);console.log(`${rows.length} enlarged-text states, ${failed.length} failures.`);assert.deepEqual(failed,[]);
})().catch(e=>{console.error(e);process.exitCode=1;});
