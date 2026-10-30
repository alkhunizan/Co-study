/* Read-only public UX evidence. Never submits a form, logs in, or joins a room. */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const testerRequire = createRequire('C:/Users/alkhu/.agents/skills/tester/scripts/package.json');
const { chromium, devices } = testerRequire('playwright');
const AxeBuilder = testerRequire('@axe-core/playwright').default;
const out = path.resolve(__dirname, '..');
const dir = path.join(out, 'verification');
fs.mkdirSync(dir, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));

async function inventory(page) {
  return page.evaluate(() => {
    const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
    const item = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return { tag: e.tagName, id: e.id, type: e.type, text: (e.getAttribute('aria-label') || e.innerText || e.placeholder || '').trim().replace(/\s+/g,' ').slice(0,180), href: e.getAttribute('href'), x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1), fontSize: s.fontSize, color:s.color, background:s.backgroundColor }; };
    return {
      url:location.href, title:document.title, lang:document.documentElement.lang, dir:document.documentElement.dir,
      width:innerWidth, height:innerHeight, clientWidth:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight,
      headings:[...document.querySelectorAll('h1,h2,h3')].filter(visible).map(item),
      controls:[...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary')].filter(visible).map(item),
      body:document.body.innerText,
      images:[...document.images].map(e=>({src:e.currentSrc||e.src,complete:e.complete,width:e.naturalWidth,alt:e.alt,visible:visible(e)})),
      videos:[...document.querySelectorAll('video')].map(e=>({src:e.currentSrc,preload:e.preload,autoplay:e.autoplay,muted:e.muted,paused:e.paused,readyState:e.readyState})),
      resources:performance.getEntriesByType('resource').filter(r=>/\/videos\/|\.woff/.test(r.name)).map(r=>({url:r.name,transfer:r.transferSize,encoded:r.encodedBodySize,duration:Math.round(r.duration)})),
      recoveryLinks:[...document.querySelectorAll('a[href],button')].filter(visible).filter(e=>/recover|forgot|reset|نسيت|استعاد|تعيين/.test((e.innerText||'')+' '+(e.getAttribute('href')||''))).map(item),
    };
  });
}

(async()=>{
  const browser = await chromium.launch();
  const saved = path.join(dir,'observations.json');
  const results = fs.existsSync(saved) ? JSON.parse(fs.readFileSync(saved,'utf8')) : [];
  try {
    for (const [slug, route] of [['home','/'],['open','/open.html'],['account','/account.html'],['blog','/blog']]) {
      if(results.some(r=>r.slug===slug)) continue;
      const ctx = await browser.newContext({...devices['iPhone 14'],locale:'ar-SA'});
      const page = await ctx.newPage();
      const mutations=[];
      // Prevent accidental mutating HTTP requests; public room creation also requires an explicit UI submit, never used here.
      await page.route('**/*', async r=>{const q=r.request();if(['POST','PUT','PATCH','DELETE'].includes(q.method())) {mutations.push({method:q.method(),url:q.url()});await r.abort();}else await r.continue();});
      const response=await page.goto('https://halastudy.com'+route,{waitUntil:'load',timeout:45000});
      await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
      await page.waitForTimeout(700);
      fs.writeFileSync(path.join(dir,slug+'-public-source.html'),await response.text());
      const entry={slug,status:response.status(),initial:await inventory(page)};
      fs.writeFileSync(path.join(dir,slug+'-inventory.json'),JSON.stringify(entry,null,2));
      await page.screenshot({path:path.join(dir,slug+'-mobile.png'),fullPage:false});
      if(slug==='home') {
        await page.waitForTimeout(4000);
        entry.after4s=await inventory(page);
        await page.getByRole('button',{name:'القائمة',exact:true}).click();
        entry.menu=await inventory(page);
        await page.screenshot({path:path.join(dir,'home-menu-mobile.png')});
      }
      if(slug==='open') {
        entry.axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze().then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})));
      }
      if(slug==='account') {
        await page.locator('#tab-signup').click();
        entry.signup=await inventory(page);
        await page.screenshot({path:path.join(dir,'account-signup-mobile.png')});
      }
      entry.blockedMutatingRequests=mutations;
      results.push(entry);
      console.log(JSON.stringify({slug,status:entry.status,headings:entry.initial.headings.map(h=>h.text),controls:entry.initial.controls.map(c=>({text:c.text,id:c.id,type:c.type,href:c.href})),menu:entry.menu?.controls.map(c=>({text:c.text,id:c.id,href:c.href})),recover:entry.initial.recoveryLinks,scrollWidth:entry.initial.scrollWidth,clientWidth:entry.initial.clientWidth,blockedMutations:mutations.length}));
      await ctx.close();
      await pause(2500);
    }
  } finally {await browser.close();fs.writeFileSync(path.join(dir,'observations.json'),JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
