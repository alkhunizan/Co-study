# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: study-tools.smoke.spec.js >> an opted-in reminder retries after a transient refresh failure without exposing stale details
- Location: tests\smoke\study-tools.smoke.spec.js:6:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#study-reminder-banner')
Expected substring: "Synthetic reminder recovery"
Received string:    ""
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#study-reminder-banner')
    9 × locator resolved to <div hidden="" role="status" class="study-alert" id="study-reminder-banner"></div>
      - unexpected value ""

```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | const AxeBuilder = require('@axe-core/playwright').default;
  3   | const { startServer } = require('../helpers/server-control');
  4   | const { signupUser } = require('../helpers/auth-helpers');
  5   | 
  6   | test('an opted-in reminder retries after a transient refresh failure without exposing stale details', async ({ browser }) => {
  7   |     const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
  8   |     let context;
  9   |     try {
  10  |         const f = await fixture(browser, server);
  11  |         context = f.context;
  12  |         const prefs = await server.request('/api/platform/study/preferences', {
  13  |             method: 'PUT', headers: { Cookie: f.account.cookie },
  14  |             body: { version: 0, daily_target: 30, weekly_target: 150, reminders: true, reminder_minutes: 5 }
  15  |         });
  16  |         expect(prefs.status).toBe(200);
  17  |         let calls = 0;
  18  |         await f.page.route('**/api/platform/study/agenda', (route) => {
  19  |             calls++;
  20  |             return route.fulfill({ status: calls === 2 ? 503 : 200, contentType: 'application/json',
  21  |                 body: JSON.stringify(calls === 2 ? { error: 'PERSISTENCE_UNAVAILABLE' } : { sessions: [{
  22  |                     id: 'synthetic-session', title: 'Synthetic reminder recovery', cohort_name: 'Fixture circle',
  23  |                     room_id: 'ABC123', starts_at: Date.now() + 240000, duration_minutes: 25, status: 'going'
  24  |                 }] }) });
  25  |         });
  26  |         await f.page.reload();
  27  |         await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
  28  |         await expect(f.page.locator('#study-reminder-banner')).toBeHidden();
> 29  |         await expect(f.page.locator('#study-reminder-banner')).toContainText('Synthetic reminder recovery', { timeout: 5000 });
      |                                                                ^ Error: expect(locator).toContainText(expected) failed
  30  |         await expect(f.page.locator('#study-reminder-banner')).toBeVisible();
  31  |         expect(calls).toBeGreaterThanOrEqual(3);
  32  |     } finally {
  33  |         await context?.close();
  34  |         await server.stop();
  35  |     }
  36  | });
  37  | 
  38  | test('a routine closed before another surface pauses keeps its remaining time on return', async ({ browser }) => {
  39  |     test.setTimeout(60000);
  40  |     const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
  41  |     let context;
  42  |     try {
  43  |         const f = await fixture(browser, server);
  44  |         context = f.context;
  45  |         const { page, account } = f;
  46  |         await server.request('/api/platform/study/routines', {
  47  |             method: 'POST',
  48  |             headers: { Cookie: account.cookie },
  49  |             body: {
  50  |                 name: 'Return gently',
  51  |                 focus_minutes: 25,
  52  |                 break_minutes: 5,
  53  |                 long_break_minutes: 15,
  54  |                 cycles: 2,
  55  |                 long_every: 2,
  56  |                 requestId: require('node:crypto').randomUUID(),
  57  |             },
  58  |         });
  59  |         await page.reload();
  60  |         await choose(page, 'routinesTab');
  61  |         await page.locator('#study-routine-list [data-lang=useRoutine]').click();
  62  |         await page.locator('#study-guide [data-lang=routineBegin]').click();
  63  |         await expect(page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
  64  |         const current = (await server.request('/api/platform/progress', { headers: { Cookie: account.cookie } })).body
  65  |             .current;
  66  |         await page.close();
  67  |         await server.request(`/api/platform/focus/${current.id}/pause`, {
  68  |             method: 'POST',
  69  |             headers: { Cookie: account.cookie },
  70  |             body: {},
  71  |         });
  72  |         const returned = await context.newPage();
  73  |         await returned.clock.install({ time: new Date(Date.now() + 3600000) });
  74  |         await returned.goto(`${server.baseUrl}/app#progress`);
  75  |         await expect(returned.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
  76  |         await expect(returned.locator('#study-guide-clock')).not.toHaveText('00:00');
  77  |         expect(await returned.evaluate(() => /** @type {any} */ (window).HalaFocus.current().state)).toBe('paused');
  78  |     } finally {
  79  |         await context?.close();
  80  |         await server.stop();
  81  |     }
  82  | });
  83  | const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');
  84  | 
  85  | async function fixture(browser, server, name = 'Planner') {
  86  |     const account = await signupUser(server, { displayName: name });
  87  |     const context = await browser.newContext({
  88  |         viewport: { width: 1440, height: 1000 },
  89  |     });
  90  |     await context.addCookies(
  91  |         account.cookie.split(';').map((s) => {
  92  |             const [name, ...value] = s.trim().split('=');
  93  |             return { name, value: value.join('='), url: server.baseUrl };
  94  |         }),
  95  |     );
  96  |     await context.addInitScript(() => {
  97  |         if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en');
  98  |     });
  99  |     const page = await context.newPage();
  100 |     page.setDefaultTimeout(15000);
  101 |     await page.goto(`${server.baseUrl}/app#planner`);
  102 |     await expect(page.locator('#study-task')).toBeVisible();
  103 |     await expect(page.locator('#study-status')).toBeEmpty();
  104 |     return { account, context, page };
  105 | }
  106 | async function choose(page, key) {
  107 |     await page.locator(`.study-tabs [data-lang="${key}"]`).click();
  108 |     await expect(page.locator(`.study-tabs [data-lang="${key}"]`)).toBeEnabled();
  109 | }
  110 | 
  111 | test('F01-F14 private planning, lost response, routines, task-linked focus, reflection and journal work end to end', async ({
  112 |     browser,
  113 | }, info) => {
  114 |     test.setTimeout(180000);
  115 |     const server = await startServer({
  116 |         env: {
  117 |             PLATFORM_ENABLED: 'true',
  118 |             PLATFORM_DATA_DIR: 'memory://',
  119 |             VIDEO_PROVIDER: 'mesh',
  120 |         },
  121 |     });
  122 |     let context;
  123 |     const errors = [];
  124 |     try {
  125 |         const fixtureA = await fixture(browser, server);
  126 |         context = fixtureA.context;
  127 |         const { page, account } = fixtureA;
  128 |         page.on('pageerror', (e) => errors.push(e.message));
  129 |         await page.locator('#study-project-name').fill('Biology');
```