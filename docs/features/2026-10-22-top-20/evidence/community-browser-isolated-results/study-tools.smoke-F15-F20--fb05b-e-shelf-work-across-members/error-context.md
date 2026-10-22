# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: study-tools.smoke.spec.js >> F15-F20 favorite, RSVP, calendar, in-app reminder and private resource shelf work across members
- Location: tests\smoke\study-tools.smoke.spec.js:80:1

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('#circle-list button')

```

# Test source

```ts
  3   | const {startServer}=require('../helpers/server-control');
  4   | const {signupUser}=require('../helpers/auth-helpers');
  5   | const {connectSocket,emitAck,closeSocket}=require('../helpers/socket-client');
  6   | 
  7   | async function fixture(browser,server,name='Planner'){
  8   |     const account=await signupUser(server,{displayName:name});
  9   |     const context=await browser.newContext({viewport:{width:1440,height:1000}});
  10  |     await context.addCookies(account.cookie.split(';').map(s=>{const [name,...value]=s.trim().split('=');return{name,value:value.join('='),url:server.baseUrl};}));
  11  |     await context.addInitScript(()=>{if(!localStorage.getItem('halastudyLang'))localStorage.setItem('halastudyLang','en');});
  12  |     const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(`${server.baseUrl}/app#planner`);
  13  |     await expect(page.locator('#study-task')).toBeVisible();await expect(page.locator('#study-status')).toBeEmpty();
  14  |     return {account,context,page};
  15  | }
  16  | async function choose(page,key){await page.locator(`.study-tabs [data-lang="${key}"]`).click();}
  17  | 
  18  | test('F01-F14 private planning, lost response, routines, task-linked focus, reflection and journal work end to end',async({browser},info)=>{
  19  |     test.setTimeout(180000);
  20  |     const server=await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://',VIDEO_PROVIDER:'mesh'}});
  21  |     let context;const errors=[];
  22  |     try{
  23  |         const fixtureA=await fixture(browser,server);context=fixtureA.context;const {page,account}=fixtureA;page.on('pageerror',e=>errors.push(e.message));
  24  |         await page.locator('#study-project-name').fill('Biology');await page.locator('#study-project button[type=submit]').click();
  25  |         await expect(page.locator('#study-task-project_id option')).toHaveCount(2);
  26  |         await expect(page.locator('#study-task-estimate_minutes')).toHaveValue('25');
  27  |         await page.locator('#study-task-title').fill('Read cell biology');await page.locator('#study-task-details summary').click();
  28  |         await page.locator('#study-task-project_id').selectOption({label:'Biology'});
  29  |         await page.locator('#study-task-priority').selectOption('high');
  30  |         const overview=await server.request('/api/platform/study/overview',{headers:{Cookie:account.cookie}});
  31  |         await page.locator('#study-task-due_date').fill(overview.body.today);await page.locator('#study-task-recurrence').selectOption('daily');
  32  |         await page.locator('#study-task-steps').fill('Read chapter\nWrite summary');await page.locator('#study-task-note').fill('Private learning note');
  33  |         await page.route('**/api/platform/study/tasks',async route=>{await route.fetch();await route.abort('failed');},{times:1});
  34  |         await page.locator('#study-task button[type=submit]').click();
  35  |         await expect(page.locator('#study-status')).toContainText('draft is still here');
  36  |         await expect(page.locator('#study-task-title')).toHaveValue('Read cell biology');
  37  |         await page.locator('#study-task button[type=submit]').click();await expect(page.locator('#study-task-list .row')).toHaveCount(1);
  38  |         await page.locator('#study-task-list input[type=checkbox]').first().check();
  39  |         await expect(page.locator('#study-task-list input[type=checkbox]').first()).toBeChecked();
  40  |         await page.locator('#study-filter-filter').selectOption('today');await expect(page.locator('#study-task-list')).toContainText('Read cell biology');
  41  |         await page.locator('#study-task-list [data-lang=editItem]').click();await page.locator('#study-task-title').fill('Read cells carefully');
  42  |         await page.locator('#study-task button[type=submit]').click();await expect(page.locator('#study-task-list')).toContainText('Read cells carefully');
  43  |         await page.locator('#study-thought-text').fill('Ask tutor about cells');await page.locator('#study-thought button[type=submit]').click();
  44  |         await page.locator('#study-thought-list [data-lang=toTask]').click();await page.locator('#study-filter-filter').selectOption('open');
  45  |         await expect(page.locator('#study-task-list .row')).toHaveCount(2);
  46  |         await choose(page,'routinesTab');await page.locator('#study-routine-name').fill('A gentle pair');
  47  |         await page.locator('#study-routine-focus_minutes').fill('5');await page.locator('#study-routine-cycles').fill('2');
  48  |         await page.locator('#study-routine button[type=submit]').click();await expect(page.locator('#study-routine-list')).toContainText('A gentle pair');
  49  |         await page.locator('#study-routine-list [data-lang=useRoutine]').click();await expect(page).toHaveURL(/#progress$/);
  50  |         await page.locator('#study-focus-task').selectOption({label:'Read cells carefully'});
  51  |         await page.locator('#study-guide [data-lang=routineBegin]').click();await expect(page.locator('#study-guide-clock')).toHaveText('05:00');
  52  |         await page.locator('#focus-pause').click();await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
  53  |         await page.clock.install();await page.reload();await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
  54  |         await expect(page.locator('#study-focus-task option:checked')).toHaveText('Read cells carefully');
  55  |         await page.locator('#study-guide [data-lang=routineResume]').click();
  56  |         await expect(page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
  57  |         await page.clock.fastForward(5*60000+1000);
  58  |         await expect(page.locator('#study-guide [data-lang=routineNext]')).toBeVisible();
  59  |         await page.locator('#study-guide [data-lang=routineNext]').click();await expect(page.locator('#study-guide')).toContainText('Short break');
  60  |         await page.locator('#study-guide [data-lang=routineStop]').click();await expect(page.locator('#focus-start')).toBeEnabled();
  61  |         const current=(await server.request('/api/platform/study/journal',{headers:{Cookie:account.cookie}})).body.sessions[0];
  62  |         expect(Number(current.credited_ms),'a fast client clock cannot create credited minutes').toBeLessThan(60000);
  63  |         await expect(page.locator('#study-reflection')).toBeVisible();await page.locator('#study-reflect-note').fill('Review the cell membrane');
  64  |         await page.locator('#study-reflect button[type=submit]').click();
  65  |         await page.goto(`${server.baseUrl}/app#planner`);await choose(page,'insightsTab');
  66  |         await page.locator('#study-targets-daily_target').fill('30');await page.locator('#study-targets-weekly_target').fill('120');await page.locator('#study-targets button[type=submit]').click();
  67  |         await page.locator('#study-journal-q').fill('membrane');await page.locator('#study-journal button[type=submit]').click();
  68  |         await expect(page.locator('#study-journal-list .row')).toHaveCount(1);await expect(page.locator('#study-journal-list')).toContainText('Review the cell membrane');
  69  |         await expect(page.locator('.study-day')).toHaveCount(28);
  70  |         await choose(page,'tasksTab');await page.locator('#study-task-list .row').filter({hasText:'Read cells carefully'}).locator('[data-lang=completeTask]').click();
  71  |         await page.locator('#study-filter-filter').selectOption('completed');await expect(page.locator('#study-task-list')).toContainText('Read cells carefully');
  72  |         const latest=(await server.request('/api/platform/study/overview',{headers:{Cookie:account.cookie}})).body;
  73  |         expect(latest.tasks.filter(t=>t.recurrence==='daily')).toHaveLength(2);
  74  |         const b=await signupUser(server);const hidden=await server.request('/api/platform/study/overview',{headers:{Cookie:b.cookie}});expect(hidden.body.tasks).toEqual([]);
  75  |         const denied=await server.request(`/api/platform/study/tasks/${latest.tasks[0].id}`,{method:'PATCH',headers:{Cookie:b.cookie},body:{title:'Stolen',version:latest.tasks[0].version}});expect(denied.status).toBe(404);
  76  |         await page.screenshot({path:info.outputPath('planner-with-tasks.png'),fullPage:true});expect(errors).toEqual([]);
  77  |     }finally{await context?.close();await server.stop();}
  78  | });
  79  | 
  80  | test('F15-F20 favorite, RSVP, calendar, in-app reminder and private resource shelf work across members',async({browser},info)=>{
  81  |     test.setTimeout(150000);const server=await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://',VIDEO_PROVIDER:'mesh'}});
  82  |     const contexts=[],sockets=[];let stage='setup';
  83  |     try{
  84  |         const a=await fixture(browser,server,'Circle owner'),b=await fixture(browser,server,'Circle member');contexts.push(a.context,b.context);
  85  |         const request=(path,method='GET',body,account=a.account)=>server.request(`/api/platform${path}`,{method,body,headers:{Cookie:account.cookie}});
  86  |         const checkout=(await request('/billing/checkout','POST',{})).body;await request(`/billing/checkout/${checkout.id}/complete`,'POST',{token:checkout.token,outcome:'success'});
  87  |         const circle=(await request('/cohorts','POST',{name:'A quiet circle'})).body;
  88  |         const invitation=(await request(`/cohorts/${circle.id}/invitations`,'POST',{})).body;
  89  |         expect((await request('/cohorts/accept','POST',{token:invitation.token},b.account)).status).toBe(200);
  90  |         const socket=await connectSocket(server.baseUrl,{extraHeaders:{Cookie:a.account.cookie},clientId:'study-feature-owner'});sockets.push(socket);
  91  |         const room=await emitAck(socket,'create-room',{roomName:'The reading table'});expect(room.ok).toBe(true);const roomId=room.room.roomId;
  92  |         const session=(await request(`/cohorts/${circle.id}/sessions`,'POST',{roomId,title:'Read together soon',startsAt:Date.now()+4*60000,durationMinutes:25})).body;
  93  |         await b.page.reload();await expect(b.page.locator('#study-status')).toBeEmpty();
  94  |         stage='favorite';await choose(b.page,'libraryTab');await b.page.locator('#study-bookmark-roomId').fill(roomId);await b.page.locator('#study-bookmark button[type=submit]').click();
  95  |         await expect(b.page.locator('#study-favorites')).toContainText('The reading table');
  96  |         await expect(b.page.locator('#study-favorites a')).toHaveAttribute('href',`/study?room=${roomId}`);
  97  |         stage='agenda';await choose(b.page,'agendaTab');await expect(b.page.locator('#study-agenda')).toContainText('Read together soon');
  98  |         await b.page.locator('#study-agenda select').selectOption('going');await expect(b.page.locator('#study-agenda select')).toHaveValue('going');
  99  |         const calendar=await b.context.request.get(`${server.baseUrl}/api/platform/study/calendar.ics`);expect(calendar.ok()).toBe(true);expect(await calendar.text()).toContain(`UID:${session.id}@halastudy`);
  100 |         stage='reminders';await b.page.locator('#study-reminders-reminders').check();await b.page.locator('#study-reminders button[type=submit]').click();
  101 |         await b.page.goto(`${server.baseUrl}/app#progress`);await expect(b.page.locator('#study-reminder-banner')).toContainText('Read together soon');
  102 |         await b.page.locator('#study-reminder-banner button').click();await b.page.reload();await expect(b.page.locator('#study-reminder-banner')).toBeHidden();
> 103 |         stage='owner resources';await a.page.goto(`${server.baseUrl}/app#circles`);await a.page.locator('#circle-list button').click();await expect(a.page.locator('#study-resource')).toBeVisible();
      |                                                                                                                                ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  104 |         await a.page.locator('#study-resource-title').fill('Read chapter 3');await a.page.locator('#study-resource-url').fill('https://example.com/chapter-3');await a.page.locator('#study-resource-note').fill('Our shared reading');
  105 |         await a.page.locator('[data-lang-value=ar]').click();await expect(a.page.locator('#study-resource-title')).toHaveValue('Read chapter 3');await expect(a.page.locator('#study-resource-url')).toHaveValue('https://example.com/chapter-3');
  106 |         await a.page.locator('#study-resource button[type=submit]').click();
  107 |         await expect(a.page.locator('#study-resource-list')).toContainText('Read chapter 3');
  108 |         stage='member resources';await b.page.goto(`${server.baseUrl}/app#circles`);await b.page.locator('#circle-list button').click();await expect(b.page.locator('#study-resource-list')).toContainText('Our shared reading');await expect(b.page.locator('#study-resource')).toHaveCount(0);
  109 |         await b.page.screenshot({path:info.outputPath('circle-resource-member.png'),fullPage:true});
  110 |         stage='membership removal';await request(`/cohorts/${circle.id}/members/${b.account.user.id}`,'PATCH',{role:'remove'});
  111 |         await b.page.goto(`${server.baseUrl}/app#planner`);await choose(b.page,'libraryTab');await expect(b.page.locator('#study-favorites')).toContainText('Room unavailable');await expect(b.page.locator('#study-favorites a')).toHaveCount(0);
  112 |         await choose(b.page,'agendaTab');await expect(b.page.locator('#study-agenda')).toContainText('No upcoming circle sessions');
  113 |         expect((await request(`/study/circles/${circle.id}/resources`,'GET',undefined,b.account)).status).toBe(404);
  114 |         expect(await (await b.context.request.get(`${server.baseUrl}/api/platform/study/calendar.ics`)).text()).not.toContain('BEGIN:VEVENT');
  115 |     }catch(error){await info.attach('feature-stage',{body:stage,contentType:'text/plain'});throw error;}
  116 |     finally{for(const socket of sockets)await closeSocket(socket);for(const c of contexts)await c.close().catch(()=>{});await server.stop();}
  117 | });
  118 | 
  119 | test('planner supports Arabic/English, both themes, keyboard, narrow widths, zoom, drafts, history and recovery',async({browser},info)=>{
  120 |     test.setTimeout(150000);const server=await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://'}});let context;
  121 |     try{
  122 |         const f=await fixture(browser,server);context=f.context;const {page}=f;
  123 |         for(const lang of ['ar','en'])for(const theme of ['light','dark']){
  124 |             await page.evaluate(({lang,theme})=>{localStorage.setItem('halastudyLang',lang);localStorage.setItem('halastudyTheme',theme);},{lang,theme});await page.reload();
  125 |             await expect(page.locator('html')).toHaveAttribute('lang',lang);await expect(page.locator('html')).toHaveAttribute('dir',lang==='ar'?'rtl':'ltr');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  126 |             for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});for(const key of ['tasksTab','routinesTab','libraryTab','agendaTab','insightsTab']){await choose(page,key);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  127 |                 await page.screenshot({path:info.outputPath(`planner-${lang}-${theme}-${width}.png`),fullPage:true});}
  128 |             expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  129 |         }
  130 |         await choose(page,'tasksTab');await page.locator('#study-task-title').fill('Draft survives language');await page.locator('[data-lang-value=ar]').click();await expect(page.locator('#study-task-title')).toHaveValue('Draft survives language');
  131 |         await page.locator('#study-task-title').focus();await page.keyboard.press('Tab');await expect(page.locator('#study-task-details summary')).toBeFocused();
  132 |         await page.locator('[data-view=progress]').first().click();await page.goBack();await expect(page.locator('[data-panel=planner]')).toBeVisible();
  133 |         await page.setViewportSize({width:390,height:844});await page.addStyleTag({content:'html {font-size:200% !important}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  134 |         await page.route('**/api/platform/study/overview',route=>route.fulfill({status:503,json:{errorCode:'SERVICE_UNAVAILABLE'}}),{times:1});await page.reload();await expect(page.locator('#study-status')).not.toBeEmpty();await page.locator('[data-lang=studyRetry]').first().click();await expect(page.locator('#study-status')).toBeEmpty();
  135 |     }finally{await context?.close();await server.stop();}
  136 | });
  137 | 
```