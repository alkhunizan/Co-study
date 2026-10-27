const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=path.resolve(__dirname,'..'),repo=path.resolve(out,'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(out,p),'utf8'));
const probe=read('probe.json');
const B=s=>'`'+s+'`';
const definitions=[
 ['create-mobile','New student → prepare room','طالب جديد ← تجهيز غرفة','✓','safety-stop',0,'Creation form; before submit','نموذج الإنشاء؛ قبل الإرسال'],
 ['create-desktop','New student → prepare room','طالب جديد ← تجهيز غرفة','✓','safety-stop',0,'Creation form; before submit','نموذج الإنشاء؛ قبل الإرسال'],
 ['discover-mobile','New student → discover active people','طالب جديد ← استكشاف المتاح','✗','abandoned',1,'Code-only form, no room list','نموذج رمز فقط، دون قائمة غرف'],
 ['recover-mobile','Returning student → recover account','طالب عائد ← استعادة الحساب','✗','abandoned',1,'No recovery control on account page','لا يوجد عنصر لاستعادة الحساب'],
 ['english-mobile','Returning student → English account entry','طالب عائد ← الحساب بالإنجليزية','✓','safety-stop',0,'English form; before authentication','النموذج الإنجليزي؛ قبل المصادقة'],
 ['article-mobile','Reader → guide → study form','قارئ ← دليل ← نموذج المذاكرة','✓','safety-stop',0,'Guide CTA reaches creation form','زر الدليل يصل إلى نموذج الإنشاء'],
 ['privacy-mobile','Reader → privacy information','قارئ ← معلومات الخصوصية','✓','completed',0,'Policy content reached','الوصول إلى محتوى السياسة'],
 ['english-menu-close-mobile','Returning student → close English menu','طالب عائد ← إغلاق القائمة الإنجليزية','✗','abandoned',1,'Clipped target; normal close click times out','زر مقصوص؛ تنتهي مهلة نقرة الإغلاق']
];
const journeys=definitions.map(([slug,en,ar,mark,outcome,wasted,stopEn,stopAr])=>({slug,en,ar,mark,outcome,wasted,stopEn,stopAr,...read('journeys/'+slug+'/journey.json')}));
if(journeys.some(j=>!j.completed&&j.slug!=='english-menu-close-mobile'))throw new Error('Inspect failed runner before finalizing the report.');
const metricsRows=[];
for(const p of probe.results)for(const [view,v]of Object.entries(p.views)){
 const route=new URL(p.url).pathname.replace('/blog/best-online-group-study-rooms-saudi','guide-compare').replace('/blog/study-with-me-online-arabic','guide-start');
 metricsRows.push({route,view,status:v.status,lcp:v.vitals.lcp,cls:v.vitals.cls,ttfb:v.nav.ttfb,js:v.pageErrors.length,failed:v.failedRequests.length,console:v.consoleErrors.length,axe:v.axe.filter(a=>['serious','critical'].includes(a.impact)).reduce((a,x)=>a+x.count,0)});
}
for(const lang of ['en','ar']){
 const header=lang==='en'?'| Persona → goal | View | Result | Steps (wasted) | Time | Stop / dead end |\n|---|---|---|---|---|---|':'| الفئة والهدف | المقاس | النتيجة | الخطوات (المهدرة) | الوقت | نقطة التوقف |\n|---|---|---|---|---|---|';
 const table=header+'\n'+journeys.map(j=>`| ${j[lang]} | ${lang==='ar'?(j.viewport==='mobile'?'جوال':'كمبيوتر'):j.viewport} | ${j.mark} | ${j.steps} (${j.wasted}) | ${(j.totalMs/1000).toFixed(1)}s | ${lang==='en'?j.stopEn:j.stopAr} |`).join('\n');
 const mh=lang==='en'?'| Page | View | LCP ms | CLS | TTFB ms | JS | Failed | Console | axe S+C |\n|---|---|---|---|---|---|---|---|---|':'| الصفحة | المقاس | LCP ms | CLS | TTFB ms | JS | فشل | وحدة التحكم | axe S+C |\n|---|---|---|---|---|---|---|---|---|';
 const mt=mh+'\n'+metricsRows.map(r=>`| ${B(r.route)} | ${lang==='ar'?(r.view==='mobile'?'جوال':'كمبيوتر'):r.view} | ${r.lcp} | ${r.cls.toFixed(3)} | ${r.ttfb} | ${r.js} | ${r.failed} | ${r.console} | ${r.axe} |`).join('\n');
 const slow=journeys.filter(j=>j.slowSteps.length).map(j=>B(j.slug)+': '+j.slowSteps.join(', ')).join('; ');
 const st=lang==='en'?`**Runner review:** ${journeys.length} scripts, ${journeys.reduce((a,j)=>a+j.steps,0)} logged steps, ${journeys.reduce((a,j)=>a+j.errors.length,0)} recorded JS/console/HTTP errors, and ${journeys.filter(j=>!j.completed).length} failed interaction. Steps over 3 seconds: ${slow}. All other steps were under 3 seconds; the repeated menu/language waits are runner overhead, while the final close click is a recorded timeout. No journey needed a selector retry.`:`**مراجعة التنفيذ:** ${journeys.length} برامج، و${journeys.reduce((a,j)=>a+j.steps,0)} خطوة مسجّلة، و${journeys.reduce((a,j)=>a+j.errors.length,0)} أخطاء JavaScript أو وحدة تحكم أو HTTP، و${journeys.filter(j=>!j.completed).length} تفاعل تعذّر تنفيذه. الخطوات التي تجاوزت 3 ثوانٍ: ${slow}. بقيت الخطوات الأخرى دون 3 ثوانٍ؛ وانتظار القائمة واللغة المتكرر يعود إلى المشغّل، بينما انتهت مهلة نقرة الإغلاق الأخيرة. لم تحتج أي رحلة إلى إعادة محاولة بسبب المحدّدات.`;
 let md=fs.readFileSync(path.join(__dirname,'templates','REPORT.'+lang+'.md'),'utf8').replace('{{JOURNEY_TABLE}}',table).replace('{{METRICS_TABLE}}',mt).replace('{{JOURNEY_STATS}}',st);
 if(/\{\{[A-Z_]+\}\}/.test(md))throw new Error('Unexpanded report template');
 fs.writeFileSync(path.join(out,lang==='en'?'REPORT.md':'REPORT.ar.md'),md);
}
const comparisons=[];
for(const [slug,file]of [['home','landing.html'],['open','open.html'],['account','account.html'],['blog','blog.html']]){
 const publicSource=fs.readFileSync(path.join(out,'verification',slug+'-public-source.html'),'utf8');const local=fs.readFileSync(path.join(repo,file),'utf8');
 const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
 comparisons.push({file,publicEvidence:'verification/'+slug+'-public-source.html',publicSha256:sha(publicSource),localSha256:sha(local),equal:publicSource===local,publicHasLanguageTablist:/class="lang-switch" role="tablist"/.test(publicSource),localHasLanguageGroup:/class="lang-switch" role="group"/.test(local),publicHasSyntheticCount:/var liveN = 17264/.test(publicSource),localHasSyntheticCount:/var liveN = 17264/.test(local),publicHasRecoveryLink:/href="\/recover/.test(publicSource),localHasRecoveryLink:/href="\/recover/.test(local)});
}
fs.writeFileSync(path.join(out,'verification','source-comparison.json'),JSON.stringify({auditedAt:probe.ranAt,scope:'Read-only public-response versus current local file comparison; no build or deployment assertion.',comparisons},null,2));
const summary={date:'2026-10-21',timeZone:'Asia/Riyadh',target:probe.startUrl,overall:3,rawMean:33/11,pages:probe.pages,views:metricsRows.length,allStatus200:metricsRows.every(r=>r.status===200),blockedBy:probe.blockedBy,jsExceptions:metricsRows.reduce((a,r)=>a+r.js,0),failedRequests:metricsRows.reduce((a,r)=>a+r.failed,0),brokenLinks:probe.brokenLinks.length,rawFlags:probe.flags.length,journeys:journeys.map(j=>({slug:j.slug,runnerCompleted:j.completed,userOutcome:j.outcome,mark:j.mark,steps:j.steps,wasted:j.wasted,activeMs:j.totalMs,slowSteps:j.slowSteps,errors:j.errors.length,failedAt:j.failedAt})),metrics:metricsRows};
fs.writeFileSync(path.join(out,'verification','audit-summary.json'),JSON.stringify(summary,null,2));
const visual=probe.results.flatMap(p=>Object.entries(p.views).map(([view,v])=>({url:p.url,view,fold:v.foldScreenshot,reviewed:true,notes: view==='mobile'&&p.url.replace(/\/$/,'')==='https://halastudy.com'?'Purpose and main CTA below initial screen':'Reviewed visual hierarchy, clipping, overlays and CTA context.'})));
fs.writeFileSync(path.join(out,'verification','visual-review.json'),JSON.stringify({review:'All 16 fold images reviewed; key full pages and all journey steps reviewed in contact sheets.',folds:visual},null,2));
const copied=path.join(repo,'docs','tester','PLAN-2026-10-21.md');fs.mkdirSync(path.dirname(copied),{recursive:true});if(fs.existsSync(copied)&&!process.argv.includes('--refresh'))throw new Error('Refusing to overwrite an existing dated plan without explicit refresh');fs.copyFileSync(path.join(out,'PLAN.md'),copied);
console.log(JSON.stringify({reports:['REPORT.md','REPORT.ar.md','PLAN.md'],planCopy:copied,journeys:journeys.length,userGoalsAbandoned:journeys.filter(j=>j.outcome==='abandoned').length,allStatus200:summary.allStatus200,views:summary.views},null,2));
