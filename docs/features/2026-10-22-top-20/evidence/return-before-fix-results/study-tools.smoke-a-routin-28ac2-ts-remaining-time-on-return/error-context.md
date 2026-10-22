# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: study-tools.smoke.spec.js >> a routine closed before another surface pauses keeps its remaining time on return
- Location: tests\smoke\study-tools.smoke.spec.js:6:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#study-guide [data-lang=routineResume]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('#study-guide [data-lang=routineResume]')

```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | const AxeBuilder = require('@axe-core/playwright').default;
  3   | const { startServer } = require('../helpers/server-control');
  4   | const { signupUser } = require('../helpers/auth-helpers');
  5   | 
  6   | test('a routine closed before another surface pauses keeps its remaining time on return', async ({browser}) => {
  7   |     test.setTimeout(60000);
  8   |     const server=await startServer({env:{PLATFORM_ENABLED:'true',PLATFORM_DATA_DIR:'memory://'}});let context;
  9   |     try {
  10  |         const f=await fixture(browser,server);context=f.context;const {page,account}=f;
  11  |         await server.request('/api/platform/study/routines',{method:'POST',headers:{Cookie:account.cookie},body:{name:'Return gently',focus_minutes:25,break_minutes:5,long_break_minutes:15,cycles:2,long_every:2,requestId:require('node:crypto').randomUUID()}});
  12  |         await page.reload();await choose(page,'routinesTab');await page.locator('#study-routine-list [data-lang=useRoutine]').click();await page.locator('#study-guide [data-lang=routineBegin]').click();await expect(page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
  13  |         const current=(await server.request('/api/platform/progress',{headers:{Cookie:account.cookie}})).body.current;
  14  |         await page.close();
  15  |         await server.request(`/api/platform/focus/${current.id}/pause`,{method:'POST',headers:{Cookie:account.cookie},body:{}});
  16  |         const returned=await context.newPage();await returned.clock.install({time:new Date(Date.now()+3600000)});await returned.goto(`${server.baseUrl}/app#progress`);
> 17  |         await expect(returned.locator('#study-guide [data-lang=routineResume]')).toBeVisible();await expect(returned.locator('#study-guide-clock')).not.toHaveText('00:00');
      |                                                                                  ^ Error: expect(locator).toBeVisible() failed
  18  |         expect(await returned.evaluate(()=>/** @type {any} */(window).HalaFocus.current().state)).toBe('paused');
  19  |     } finally {await context?.close();await server.stop();}
  20  | });
  21  | const {
  22  | 	connectSocket,
  23  | 	emitAck,
  24  | 	closeSocket,
  25  | } = require('../helpers/socket-client');
  26  | 
  27  | async function fixture(browser, server, name = 'Planner') {
  28  | 	const account = await signupUser(server, { displayName: name });
  29  | 	const context = await browser.newContext({
  30  | 		viewport: { width: 1440, height: 1000 },
  31  | 	});
  32  | 	await context.addCookies(
  33  | 		account.cookie.split(';').map((s) => {
  34  | 			const [name, ...value] = s.trim().split('=');
  35  | 			return { name, value: value.join('='), url: server.baseUrl };
  36  | 		}),
  37  | 	);
  38  | 	await context.addInitScript(() => {
  39  | 		if (!localStorage.getItem('halastudyLang'))
  40  | 			localStorage.setItem('halastudyLang', 'en');
  41  | 	});
  42  | 	const page = await context.newPage();
  43  | 	page.setDefaultTimeout(15000);
  44  | 	await page.goto(`${server.baseUrl}/app#planner`);
  45  | 	await expect(page.locator('#study-task')).toBeVisible();
  46  | 	await expect(page.locator('#study-status')).toBeEmpty();
  47  | 	return { account, context, page };
  48  | }
  49  | async function choose(page, key) {
  50  | 	await page.locator(`.study-tabs [data-lang="${key}"]`).click();
  51  | }
  52  | 
  53  | test('F01-F14 private planning, lost response, routines, task-linked focus, reflection and journal work end to end', async ({
  54  | 	browser,
  55  | }, info) => {
  56  | 	test.setTimeout(180000);
  57  | 	const server = await startServer({
  58  | 		env: {
  59  | 			PLATFORM_ENABLED: 'true',
  60  | 			PLATFORM_DATA_DIR: 'memory://',
  61  | 			VIDEO_PROVIDER: 'mesh',
  62  | 		},
  63  | 	});
  64  | 	let context;
  65  | 	const errors = [];
  66  | 	try {
  67  | 		const fixtureA = await fixture(browser, server);
  68  | 		context = fixtureA.context;
  69  | 		const { page, account } = fixtureA;
  70  | 		page.on('pageerror', (e) => errors.push(e.message));
  71  | 		await page.locator('#study-project-name').fill('Biology');
  72  | 		await page.locator('#study-project button[type=submit]').click();
  73  | 		await expect(page.locator('#study-task-project_id option')).toHaveCount(2);
  74  | 		await expect(page.locator('#study-task-estimate_minutes')).toHaveValue(
  75  | 			'25',
  76  | 		);
  77  | 		await page.locator('#study-task-title').fill('Read cell biology');
  78  | 		await page.locator('#study-task-details summary').click();
  79  | 		await page
  80  | 			.locator('#study-task-project_id')
  81  | 			.selectOption({ label: 'Biology' });
  82  | 		await page.locator('#study-task-priority').selectOption('high');
  83  | 		const overview = await server.request('/api/platform/study/overview', {
  84  | 			headers: { Cookie: account.cookie },
  85  | 		});
  86  | 		await page.locator('#study-task-due_date').fill(overview.body.today);
  87  | 		await page.locator('#study-task-recurrence').selectOption('daily');
  88  | 		await page.locator('#study-task-steps').fill('Read chapter\nWrite summary');
  89  | 		await page.locator('#study-task-note').fill('Private learning note');
  90  | 		await page.route(
  91  | 			'**/api/platform/study/tasks',
  92  | 			async (route) => {
  93  | 				await route.fetch();
  94  | 				await route.abort('failed');
  95  | 			},
  96  | 			{ times: 1 },
  97  | 		);
  98  | 		await page.locator('#study-task button[type=submit]').click();
  99  | 		await expect(page.locator('#study-status')).toContainText(
  100 | 			'draft is still here',
  101 | 		);
  102 | 		await expect(page.locator('#study-task-title')).toHaveValue(
  103 | 			'Read cell biology',
  104 | 		);
  105 | 		await page.locator('#study-task button[type=submit]').click();
  106 | 		await expect(page.locator('#study-task-list .row')).toHaveCount(1);
  107 | 		await page.locator('#study-task-list input[type=checkbox]').first().check();
  108 | 		await expect(
  109 | 			page.locator('#study-task-list input[type=checkbox]').first(),
  110 | 		).toBeChecked();
  111 | 		await page.locator('#study-filter-filter').selectOption('today');
  112 | 		await expect(page.locator('#study-task-list')).toContainText(
  113 | 			'Read cell biology',
  114 | 		);
  115 | 		await page.locator('#study-task-list [data-lang=editItem]').click();
  116 | 		await page.locator('#study-task-title').fill('Read cells carefully');
  117 | 		await page.locator('#study-task button[type=submit]').click();
```