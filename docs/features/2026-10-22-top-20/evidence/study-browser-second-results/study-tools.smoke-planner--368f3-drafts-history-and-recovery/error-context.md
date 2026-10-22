# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: study-tools.smoke.spec.js >> planner supports Arabic/English, both themes, keyboard, narrow widths, zoom, drafts, history and recovery
- Location: tests\smoke\study-tools.smoke.spec.js:115:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 40

- Array []
+ Array [
+   Object {
+     "description": "Ensure that elements labelled through their content must have their visible text as part of their accessible name",
+     "help": "Elements must have their visible text as part of their accessible name",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.14/label-content-name-mismatch?application=playwright",
+     "id": "label-content-name-mismatch",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": null,
+             "id": "label-content-name-mismatch",
+             "impact": "serious",
+             "message": "Text inside the element is not included in the accessible name",
+             "relatedNodes": Array [],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Text inside the element is not included in the accessible name",
+         "html": "<a class=\"brand\" href=\"/\" aria-label=\"Halastudy home\"><span lang=\"en\" dir=\"ltr\">Halastudy</span><span aria-hidden=\"true\">هلا</span></a>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".brand",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.semantics",
+       "wcag21a",
+       "wcag253",
+       "EN-301-549",
+       "EN-9.2.5.3",
+       "RGAAv4",
+       "RGAA-6.1.5",
+     ],
+   },
+ ]
```

# Test source

```ts
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
  52  |         await page.locator('#study-guide [data-lang=routinePause]').click();await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
  53  |         await page.reload();await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
  54  |         await expect(page.locator('#study-focus-task option:checked')).toHaveText('Read cells carefully');
  55  |         await page.locator('#study-guide [data-lang=routineResume]').click();
  56  |         await page.clock.install();await page.clock.fastForward(5*60000+1000);
  57  |         await expect(page.locator('#study-guide [data-lang=routineNext]')).toBeVisible();
  58  |         await page.locator('#study-guide [data-lang=routineNext]').click();await expect(page.locator('#study-guide')).toContainText('Short break');
  59  |         await page.locator('#study-guide [data-lang=routineStop]').click();await expect(page.locator('#focus-start')).toBeEnabled();
  60  |         const current=(await server.request('/api/platform/study/journal',{headers:{Cookie:account.cookie}})).body.sessions[0];
  61  |         expect(Number(current.credited_ms),'a fast client clock cannot create credited minutes').toBeLessThan(60000);
  62  |         await expect(page.locator('#study-reflection')).toBeVisible();await page.locator('#study-reflect-note').fill('Review the cell membrane');
  63  |         await page.locator('#study-reflect button[type=submit]').click();
  64  |         await page.goto(`${server.baseUrl}/app#planner`);await choose(page,'insightsTab');
  65  |         await page.locator('#study-targets-daily_target').fill('30');await page.locator('#study-targets-weekly_target').fill('120');await page.locator('#study-targets button[type=submit]').click();
  66  |         await page.locator('#study-journal-q').fill('membrane');await page.locator('#study-journal button[type=submit]').click();
  67  |         await expect(page.locator('#study-journal-list .row')).toHaveCount(1);await expect(page.locator('#study-journal-list')).toContainText('Review the cell membrane');
  68  |         await expect(page.locator('.study-day')).toHaveCount(28);
  69  |         await choose(page,'tasksTab');await page.locator('#study-task-list .row').filter({hasText:'Read cells carefully'}).locator('[data-lang=completeTask]').click();
  70  |         await page.locator('#study-filter-filter').selectOption('completed');await expect(page.locator('#study-task-list')).toContainText('Read cells carefully');
  71  |         const latest=(await server.request('/api/platform/study/overview',{headers:{Cookie:account.cookie}})).body;
  72  |         expect(latest.tasks.filter(t=>t.recurrence==='daily')).toHaveLength(2);
  73  |         const b=await signupUser(server);const hidden=await server.request('/api/platform/study/overview',{headers:{Cookie:b.cookie}});expect(hidden.body.tasks).toEqual([]);
  74  |         const denied=await server.request(`/api/platform/study/tasks/${latest.tasks[0].id}`,{method:'PATCH',headers:{Cookie:b.cookie},body:{title:'Stolen',version:latest.tasks[0].version}});expect(denied.status).toBe(404);
  75  |         await page.screenshot({path:info.outputPath('planner-with-tasks.png'),fullPage:true});expect(errors).toEqual([]);
  76  |     }finally{await context?.close();await server.stop();}
  77  | });
  78  | 
  79  | test('F15-F20 favorite, RSVP, calendar, in-app reminder and private resource shelf work across members',async({browser},info)=>{
  80  |     test.setTimeout(150000);const server=await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://',VIDEO_PROVIDER:'mesh'}});
  81  |     const contexts=[],sockets=[];
  82  |     try{
  83  |         const a=await fixture(browser,server,'Circle owner'),b=await fixture(browser,server,'Circle member');contexts.push(a.context,b.context);
  84  |         const request=(path,method='GET',body,account=a.account)=>server.request(`/api/platform${path}`,{method,body,headers:{Cookie:account.cookie}});
  85  |         const checkout=(await request('/billing/checkout','POST',{})).body;await request(`/billing/checkout/${checkout.id}/complete`,'POST',{token:checkout.token,outcome:'success'});
  86  |         const circle=(await request('/cohorts','POST',{name:'A quiet circle'})).body;
  87  |         const invitation=(await request(`/cohorts/${circle.id}/invitations`,'POST',{})).body;
  88  |         expect((await request('/cohorts/accept','POST',{token:invitation.token},b.account)).status).toBe(200);
  89  |         const socket=await connectSocket(server.baseUrl,{extraHeaders:{Cookie:a.account.cookie},clientId:'study-feature-owner'});sockets.push(socket);
  90  |         const room=await emitAck(socket,'create-room',{roomName:'The reading table'});expect(room.ok).toBe(true);const roomId=room.room.roomId;
  91  |         const session=(await request(`/cohorts/${circle.id}/sessions`,'POST',{roomId,title:'Read together soon',startsAt:Date.now()+4*60000,durationMinutes:25})).body;
  92  |         await b.page.reload();await expect(b.page.locator('#study-status')).toBeEmpty();
  93  |         await choose(b.page,'libraryTab');await b.page.locator('#study-bookmark-roomId').fill(roomId);await b.page.locator('#study-bookmark button[type=submit]').click();
  94  |         await expect(b.page.locator('#study-favorites')).toContainText('The reading table');
  95  |         await expect(b.page.locator('#study-favorites a')).toHaveAttribute('href',`/study?room=${roomId}`);
  96  |         await choose(b.page,'agendaTab');await expect(b.page.locator('#study-agenda')).toContainText('Read together soon');
  97  |         await b.page.locator('#study-agenda select').selectOption('going');await expect(b.page.locator('#study-agenda select')).toHaveValue('going');
  98  |         const calendar=await b.context.request.get(`${server.baseUrl}/api/platform/study/calendar.ics`);expect(calendar.ok()).toBe(true);expect(await calendar.text()).toContain(`UID:${session.id}@halastudy`);
  99  |         await b.page.locator('#study-reminders-reminders').check();await b.page.locator('#study-reminders button[type=submit]').click();
  100 |         await b.page.goto(`${server.baseUrl}/app#progress`);await expect(b.page.locator('#study-reminder-banner')).toContainText('Read together soon');
  101 |         await b.page.locator('#study-reminder-banner button').click();await b.page.reload();await expect(b.page.locator('#study-reminder-banner')).toBeHidden();
  102 |         await a.page.goto(`${server.baseUrl}/app#circles`);await a.page.locator('#circle-list button').click();await expect(a.page.locator('#study-resource')).toBeVisible();
  103 |         await a.page.locator('#study-resource-title').fill('Read chapter 3');await a.page.locator('#study-resource-url').fill('https://example.com/chapter-3');await a.page.locator('#study-resource-note').fill('Our shared reading');await a.page.locator('#study-resource button[type=submit]').click();
  104 |         await expect(a.page.locator('#study-resource-list')).toContainText('Read chapter 3');
  105 |         await b.page.goto(`${server.baseUrl}/app#circles`);await b.page.locator('#circle-list button').click();await expect(b.page.locator('#study-resource-list')).toContainText('Our shared reading');await expect(b.page.locator('#study-resource')).toHaveCount(0);
  106 |         await b.page.screenshot({path:info.outputPath('circle-resource-member.png'),fullPage:true});
  107 |         await request(`/cohorts/${circle.id}/members/${b.account.user.id}`,'PATCH',{role:'remove'});
  108 |         await b.page.goto(`${server.baseUrl}/app#planner`);await choose(b.page,'libraryTab');await expect(b.page.locator('#study-favorites')).toContainText('Room unavailable');await expect(b.page.locator('#study-favorites a')).toHaveCount(0);
  109 |         await choose(b.page,'agendaTab');await expect(b.page.locator('#study-agenda')).toContainText('No upcoming circle sessions');
  110 |         expect((await request(`/study/circles/${circle.id}/resources`,'GET',undefined,b.account)).status).toBe(404);
  111 |         expect(await (await b.context.request.get(`${server.baseUrl}/api/platform/study/calendar.ics`)).text()).not.toContain('BEGIN:VEVENT');
  112 |     }finally{for(const socket of sockets)await closeSocket(socket);for(const c of contexts)await c.close();await server.stop();}
  113 | });
  114 | 
  115 | test('planner supports Arabic/English, both themes, keyboard, narrow widths, zoom, drafts, history and recovery',async({browser},info)=>{
  116 |     test.setTimeout(150000);const server=await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://'}});let context;
  117 |     try{
  118 |         const f=await fixture(browser,server);context=f.context;const {page}=f;
  119 |         for(const lang of ['ar','en'])for(const theme of ['light','dark']){
  120 |             await page.evaluate(({lang,theme})=>{localStorage.setItem('halastudyLang',lang);localStorage.setItem('halastudyTheme',theme);},{lang,theme});await page.reload();
  121 |             await expect(page.locator('html')).toHaveAttribute('lang',lang);await expect(page.locator('html')).toHaveAttribute('dir',lang==='ar'?'rtl':'ltr');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  122 |             for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});for(const key of ['tasksTab','routinesTab','libraryTab','agendaTab','insightsTab']){await choose(page,key);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  123 |                 await page.screenshot({path:info.outputPath(`planner-${lang}-${theme}-${width}.png`),fullPage:true});}
> 124 |             expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
      |                                                                         ^ Error: expect(received).toEqual(expected) // deep equality
  125 |         }
  126 |         await choose(page,'tasksTab');await page.locator('#study-task-title').fill('Draft survives language');await page.locator('[data-lang-value=ar]').click();await expect(page.locator('#study-task-title')).toHaveValue('Draft survives language');
  127 |         await page.locator('#study-task-title').focus();await page.keyboard.press('Tab');await expect(page.locator('#study-task-details summary')).toBeFocused();
  128 |         await page.locator('[data-view=progress]').first().click();await page.goBack();await expect(page.locator('[data-panel=planner]')).toBeVisible();
  129 |         await page.setViewportSize({width:390,height:844});await page.addStyleTag({content:'html {font-size:200% !important}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  130 |         await page.route('**/api/platform/study/overview',route=>route.fulfill({status:503,json:{errorCode:'SERVICE_UNAVAILABLE'}}),{times:1});await page.reload();await expect(page.locator('#study-status')).not.toBeEmpty();await page.locator('[data-lang=studyRetry]').first().click();await expect(page.locator('#study-status')).toBeEmpty();
  131 |     }finally{await context?.close();await server.stop();}
  132 | });
  133 | 
```