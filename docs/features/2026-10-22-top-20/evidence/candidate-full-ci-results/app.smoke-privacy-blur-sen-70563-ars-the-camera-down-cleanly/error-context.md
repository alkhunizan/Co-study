# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.smoke.spec.js >> privacy blur sends a canvas track by default and tears the camera down cleanly
- Location: tests\smoke\app.smoke.spec.js:318:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "live"
Received: undefined

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Test source

```ts
  264 |         await expect.poll(() => taskTexts(peer.page)).toEqual(['Second shared task']);
  265 |     } finally {
  266 |         await owner.context.close();
  267 |         await peer.context.close();
  268 |     }
  269 | });
  270 | 
  271 | test('timer preset chips apply durations and session goal syncs to peers', async ({ browser }) => {
  272 |     const owner = await createSmokePage(browser);
  273 |     const peer = await createSmokePage(browser);
  274 | 
  275 |     try {
  276 |         const roomCode = await createRoomFromLanding(owner.page, {
  277 |             roomName: 'Preset Smoke Room'
  278 |         });
  279 | 
  280 |         await owner.page.click('#btn-enter-room');
  281 |         await joinRoom(owner.page, { name: 'Owner', roomCode });
  282 |         await expectJoined(owner.page);
  283 | 
  284 |         // Default 25/5 chip is active on load.
  285 |         await expect(owner.page.locator('.timer-preset-chip[data-focus="25"]')).toHaveClass(/active/);
  286 | 
  287 |         // Clicking 50/10 updates inputs + display and moves the active state.
  288 |         await owner.page.click('.timer-preset-chip[data-focus="50"]');
  289 |         await expect(owner.page.locator('#cfg-f')).toHaveValue('50');
  290 |         await expect(owner.page.locator('#cfg-b')).toHaveValue('10');
  291 |         await expect(owner.page.locator('#timer-disp')).toHaveText('50:00');
  292 |         await expect(owner.page.locator('.timer-preset-chip[data-focus="50"]')).toHaveClass(/active/);
  293 |         await expect(owner.page.locator('.timer-preset-chip[data-focus="25"]')).not.toHaveClass(/active/);
  294 | 
  295 |         // Manual edit clears the active chip.
  296 |         await owner.page.fill('#cfg-f', '42');
  297 |         await expect(owner.page.locator('.timer-preset-chip.active')).toHaveCount(0);
  298 | 
  299 |         // Chip click while the timer is running resets it to the preset.
  300 |         await owner.page.click('#btn-toggle');
  301 |         await owner.page.click('.timer-preset-chip[data-focus="90"]');
  302 |         await expect(owner.page.locator('#timer-disp')).toHaveText('90:00');
  303 |         await expect(owner.page.locator('#btn-toggle')).toHaveText('▶');
  304 | 
  305 |         // Session goal propagates to the peer's participant list.
  306 |         await peer.page.goto(`/index.html?room=${roomCode}`);
  307 |         await joinRoom(peer.page, { name: 'Peer', roomCode });
  308 |         await expectJoined(peer.page);
  309 | 
  310 |         await owner.page.fill('#status-goal', 'Solve 25 quant questions');
  311 |         await expect(peer.page.locator('#user-list .user-goal-text')).toContainText('Solve 25 quant questions');
  312 |     } finally {
  313 |         await owner.context.close();
  314 |         await peer.context.close();
  315 |     }
  316 | });
  317 | 
  318 | test('privacy blur sends a canvas track by default and tears the camera down cleanly', async ({ playwright }) => {
  319 |     // Boots its own server: the shared smoke app defaults to the RealtimeKit
  320 |     // video provider, and the blur pipeline is mesh-only. Also launches a
  321 |     // dedicated Chromium with a fake camera instead of the shared fixture
  322 |     // whose getUserMedia stub always throws.
  323 |     const server = await startServer({ env: { VIDEO_PROVIDER: 'mesh' } });
  324 |     const browser = await playwright.chromium.launch({
  325 |         args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  326 |     });
  327 |     const context = await browser.newContext({
  328 |         baseURL: server.baseUrl,
  329 |         permissions: ['camera']
  330 |     });
  331 |     const page = await context.newPage();
  332 |     const consoleErrors = [];
  333 |     page.on('console', (message) => {
  334 |         // Third-party font/CDN noise is irrelevant to the blur pipeline.
  335 |         if (message.type() === 'error' && !/fonts\.gstatic|net::ERR_FAILED/.test(message.text())) {
  336 |             consoleErrors.push(message.text());
  337 |         }
  338 |     });
  339 |     await page.addInitScript(() => {
  340 |         try { delete (/** @type {any} */ (window)).FaceDetector; } catch (_error) {}
  341 |         try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}
  342 |     });
  343 | 
  344 |     try {
  345 |         const roomCode = await createRoomFromLanding(page, { roomName: 'Blur Smoke Room' });
  346 |         await page.click('#btn-enter-room');
  347 |         await joinRoom(page, { name: 'Blurred', roomCode });
  348 |         await expectJoined(page);
  349 | 
  350 |         const videoCountBefore = await page.locator('video').count();
  351 | 
  352 |         const localTrackLabel = () => page.evaluate(() => {
  353 |             const video = /** @type {HTMLVideoElement} */ (document.getElementById('local-video'));
  354 |             const stream = /** @type {MediaStream|null} */ (video.srcObject);
  355 |             const track = stream?.getVideoTracks()[0];
  356 |             return track ? { label: track.label, state: track.readyState } : null;
  357 |         });
  358 | 
  359 |         // Enable camera: blur defaults ON, so the outgoing track is
  360 |         // canvas-sourced, not the fake capture device.
  361 |         await page.click('#camera-toggle');
  362 |         await expect(page.locator('#blur-toggle')).toBeVisible();
  363 |         await expect(page.locator('#blur-toggle')).toHaveText('Blur: on');
> 364 |         await expect.poll(async () => (await localTrackLabel())?.state).toBe('live');
      |         ^ Error: expect(received).toBe(expected) // Object.is equality
  365 |         const blurredTrack = await localTrackLabel();
  366 |         expect(blurredTrack.label).not.toMatch(/fake/i);
  367 |         // The pipeline adds its hidden raw <video> to the DOM.
  368 |         await expect(page.locator('video')).toHaveCount(videoCountBefore + 1);
  369 | 
  370 |         // Blur off mid-call: the raw fake-device track takes over.
  371 |         await page.click('#blur-toggle');
  372 |         await expect(page.locator('#blur-toggle')).toHaveText('Blur: off');
  373 |         await expect.poll(async () => (await localTrackLabel())?.label).toMatch(/fake/i);
  374 |         await expect(page.locator('video')).toHaveCount(videoCountBefore);
  375 | 
  376 |         // Blur back on: canvas track again, no errors accumulated.
  377 |         await page.click('#blur-toggle');
  378 |         await expect(page.locator('#blur-toggle')).toHaveText('Blur: on');
  379 |         await expect.poll(async () => (await localTrackLabel())?.label).not.toMatch(/fake/i);
  380 | 
  381 |         // Disable camera: preview cleared AND the hidden raw video is gone
  382 |         // (the raw tracks are stopped by the same teardown — a leak here
  383 |         // means the camera light stays on).
  384 |         await page.click('#camera-toggle');
  385 |         await expect.poll(() => page.evaluate(() => {
  386 |             const video = /** @type {HTMLVideoElement} */ (document.getElementById('local-video'));
  387 |             return video.srcObject === null;
  388 |         })).toBe(true);
  389 |         await expect(page.locator('video')).toHaveCount(videoCountBefore);
  390 | 
  391 |         expect(consoleErrors).toEqual([]);
  392 |     } finally {
  393 |         await context.close();
  394 |         await browser.close();
  395 |         await server.stop();
  396 |     }
  397 | });
  398 | 
  399 | test('scheduled rooms expose timer defaults and invite actions', async ({ browser }, testInfo) => {
  400 |     const owner = await createSmokePage(browser);
  401 | 
  402 |     try {
  403 |         await signupViaApi(owner.page, 'Owner');
  404 |         const schedule = buildFutureRiyadhSchedule();
  405 |         const roomCode = await createRoomFromLanding(owner.page, {
  406 |             roomName: 'Scheduled Smoke Room',
  407 |             schedule
  408 |         });
  409 | 
  410 |         await expect(owner.page.locator('#result-schedule')).toBeVisible();
  411 |         await expect(owner.page.locator('#result-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
  412 |         await expect(owner.page.locator('#result-calendar-btn')).toBeVisible();
  413 |         const calendarDownload = owner.page.waitForEvent('download');
  414 |         await owner.page.locator('#result-calendar-btn').click();
  415 |         const calendar = await calendarDownload;
  416 |         const calendarPath = testInfo.outputPath('room-schedule.ics');
  417 |         await calendar.saveAs(calendarPath);
  418 |         const exported = require('node:fs').readFileSync(calendarPath, 'utf8');
  419 |         const expectedUtc = new Date(`${schedule.startDate}T${schedule.startTime}:00+03:00`).toISOString().replace(/[-:]/g, '').replace('.000', '');
  420 |         expect(exported).toContain(`DTSTART:${expectedUtc}`);
  421 | 
  422 |         await owner.page.click('#btn-enter-room');
  423 |         await joinRoom(owner.page, {
  424 |             name: 'Owner',
  425 |             roomCode
  426 |         });
  427 |         await expectJoined(owner.page);
  428 | 
  429 |         await expect(owner.page.locator('#schedule-card')).toBeVisible();
  430 |         await expect(owner.page.locator('#schedule-meta')).toContainText(/timer/i);
  431 |         await expect(owner.page.locator('#cfg-f')).toHaveValue('50');
  432 |         await expect(owner.page.locator('#cfg-b')).toHaveValue('10');
  433 |         await expect(owner.page.locator('#room-goal')).toHaveValue('Ship the Saudi launch checklist');
  434 |         await expect(owner.page.locator('#schedule-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
  435 |     } finally {
  436 |         await owner.context.close();
  437 |     }
  438 | });
  439 | 
  440 | test('schedule helpers recalculate recurring sessions after stale snapshot data', async ({ browser }) => {
  441 |     const probe = await createSmokePage(browser);
  442 | 
  443 |     try {
  444 |         await probe.page.addInitScript(() => {
  445 |             const realNow = Date.now.bind(Date);
  446 |             let offsetMs = 0;
  447 |             Date.now = () => realNow() + offsetMs;
  448 |             (/** @type {any} */ (window)).__setTestNowOffset = (nextOffsetMs) => {
  449 |                 offsetMs = Number(nextOffsetMs) || 0;
  450 |             };
  451 |         });
  452 | 
  453 |         await signupViaApi(probe.page, 'Owner');
  454 |         const roomCode = await createRoomFromLanding(probe.page, {
  455 |             roomName: 'Scheduled Roll Forward Room',
  456 |             schedule: buildFutureRiyadhSchedule({
  457 |                 minutesFromNow: 20,
  458 |                 cadence: 'daily',
  459 |                 focusMinutes: 50,
  460 |                 breakMinutes: 10,
  461 |                 boardGoalTemplate: 'Keep the next session accurate'
  462 |             })
  463 |         });
  464 | 
```