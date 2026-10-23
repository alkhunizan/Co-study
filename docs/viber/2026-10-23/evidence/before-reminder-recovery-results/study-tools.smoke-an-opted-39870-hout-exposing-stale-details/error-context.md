# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: study-tools.smoke.spec.js >> an opted-in reminder retries after a transient refresh failure without exposing stale details
- Location: tests\smoke\study-tools.smoke.spec.js:6:1

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 2
Received:    1

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
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
  12  |         await server.request('/api/platform/study/preferences', {
  13  |             method: 'PATCH', headers: { Cookie: f.account.cookie }, body: { reminders: true, reminder_minutes: 5 }
  14  |         });
  15  |         let calls = 0;
  16  |         await f.page.route('**/api/platform/study/agenda', (route) => {
  17  |             calls++;
  18  |             return route.fulfill({ status: calls === 2 ? 503 : 200, contentType: 'application/json',
  19  |                 body: JSON.stringify(calls === 2 ? { error: 'PERSISTENCE_UNAVAILABLE' } : { sessions: [{
  20  |                     id: 'synthetic-session', title: 'Synthetic reminder recovery', cohort_name: 'Fixture circle',
  21  |                     room_id: 'ABC123', starts_at: Date.now() + 240000, duration_minutes: 25, status: 'going'
  22  |                 }] }) });
  23  |         });
  24  |         await f.page.reload();
> 25  |         await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
      |         ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  26  |         await expect(f.page.locator('#study-reminder-banner')).toBeHidden();
  27  |         await expect(f.page.locator('#study-reminder-banner')).toContainText('Synthetic reminder recovery', { timeout: 5000 });
  28  |         await expect(f.page.locator('#study-reminder-banner')).toBeVisible();
  29  |         expect(calls).toBeGreaterThanOrEqual(3);
  30  |     } finally {
  31  |         await context?.close();
  32  |         await server.stop();
  33  |     }
  34  | });
  35  | 
  36  | test('a routine closed before another surface pauses keeps its remaining time on return', async ({ browser }) => {
  37  |     test.setTimeout(60000);
  38  |     const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
  39  |     let context;
  40  |     try {
  41  |         const f = await fixture(browser, server);
  42  |         context = f.context;
  43  |         const { page, account } = f;
  44  |         await server.request('/api/platform/study/routines', {
  45  |             method: 'POST',
  46  |             headers: { Cookie: account.cookie },
  47  |             body: {
  48  |                 name: 'Return gently',
  49  |                 focus_minutes: 25,
  50  |                 break_minutes: 5,
  51  |                 long_break_minutes: 15,
  52  |                 cycles: 2,
  53  |                 long_every: 2,
  54  |                 requestId: require('node:crypto').randomUUID(),
  55  |             },
  56  |         });
  57  |         await page.reload();
  58  |         await choose(page, 'routinesTab');
  59  |         await page.locator('#study-routine-list [data-lang=useRoutine]').click();
  60  |         await page.locator('#study-guide [data-lang=routineBegin]').click();
  61  |         await expect(page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
  62  |         const current = (await server.request('/api/platform/progress', { headers: { Cookie: account.cookie } })).body
  63  |             .current;
  64  |         await page.close();
  65  |         await server.request(`/api/platform/focus/${current.id}/pause`, {
  66  |             method: 'POST',
  67  |             headers: { Cookie: account.cookie },
  68  |             body: {},
  69  |         });
  70  |         const returned = await context.newPage();
  71  |         await returned.clock.install({ time: new Date(Date.now() + 3600000) });
  72  |         await returned.goto(`${server.baseUrl}/app#progress`);
  73  |         await expect(returned.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
  74  |         await expect(returned.locator('#study-guide-clock')).not.toHaveText('00:00');
  75  |         expect(await returned.evaluate(() => /** @type {any} */ (window).HalaFocus.current().state)).toBe('paused');
  76  |     } finally {
  77  |         await context?.close();
  78  |         await server.stop();
  79  |     }
  80  | });
  81  | const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');
  82  | 
  83  | async function fixture(browser, server, name = 'Planner') {
  84  |     const account = await signupUser(server, { displayName: name });
  85  |     const context = await browser.newContext({
  86  |         viewport: { width: 1440, height: 1000 },
  87  |     });
  88  |     await context.addCookies(
  89  |         account.cookie.split(';').map((s) => {
  90  |             const [name, ...value] = s.trim().split('=');
  91  |             return { name, value: value.join('='), url: server.baseUrl };
  92  |         }),
  93  |     );
  94  |     await context.addInitScript(() => {
  95  |         if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en');
  96  |     });
  97  |     const page = await context.newPage();
  98  |     page.setDefaultTimeout(15000);
  99  |     await page.goto(`${server.baseUrl}/app#planner`);
  100 |     await expect(page.locator('#study-task')).toBeVisible();
  101 |     await expect(page.locator('#study-status')).toBeEmpty();
  102 |     return { account, context, page };
  103 | }
  104 | async function choose(page, key) {
  105 |     await page.locator(`.study-tabs [data-lang="${key}"]`).click();
  106 |     await expect(page.locator(`.study-tabs [data-lang="${key}"]`)).toBeEnabled();
  107 | }
  108 | 
  109 | test('F01-F14 private planning, lost response, routines, task-linked focus, reflection and journal work end to end', async ({
  110 |     browser,
  111 | }, info) => {
  112 |     test.setTimeout(180000);
  113 |     const server = await startServer({
  114 |         env: {
  115 |             PLATFORM_ENABLED: 'true',
  116 |             PLATFORM_DATA_DIR: 'memory://',
  117 |             VIDEO_PROVIDER: 'mesh',
  118 |         },
  119 |     });
  120 |     let context;
  121 |     const errors = [];
  122 |     try {
  123 |         const fixtureA = await fixture(browser, server);
  124 |         context = fixtureA.context;
  125 |         const { page, account } = fixtureA;
```