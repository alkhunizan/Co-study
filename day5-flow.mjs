// Day 5 spike: room create → join → leave → re-join + RTL parity.
//
// Bar (PLAN.md §3 row 5): "Quiet mode + room create/join/leave flow works
// end-to-end on localhost." Existing smoke tests cover the easy paths; this
// script adds the gaps:
//   (a) quiet-mode chrome assertion (no audio toggle in mesh UI)
//   (b) leave detection (A closes; B's presence count drops)
//   (c) re-join after leave (A re-enters same room code)
//   (d) RTL parity smoke (Arabic default; create flow runs without console
//       errors or horizontal scroll)

import { chromium } from '@playwright/test';

const BASE = 'https://127.0.0.1:3443';

const browser = await chromium.launch({
  ignoreHTTPSErrors: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox',
    '--ignore-certificate-errors'
  ]
});

async function newCtx({ rtl = false } = {}) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.addInitScript((isRtl) => {
    try { localStorage.setItem('halastudyLang', isRtl ? 'ar' : 'en'); } catch (_e) {}
  }, rtl);
  const page = await ctx.newPage();
  return { ctx, page };
}

async function createRoomViaLanding(page, roomName) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  // Create card is the default "active" choice — no toggle needed.
  await page.fill('#room-name', roomName);
  await page.click('#create-form button[type="submit"]');
  await page.waitForSelector('#create-result:not([hidden])', { timeout: 8000 });
  const code = (await page.textContent('#result-code')).trim();
  return code;
}

async function joinViaStudy(page, { name, roomCode }) {
  await page.goto(`${BASE}/study?room=${roomCode}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('#join-form', { timeout: 8000 });
  await page.fill('#join-name', name);
  // #join-room is pre-filled from the URL; ensure it's correct.
  await page.evaluate((code) => { document.getElementById('join-room').value = code; }, roomCode);
  await page.locator('.join-submit').click();
  await page.waitForFunction(() => {
    const overlay = document.getElementById('join-overlay');
    return overlay && overlay.classList.contains('hidden');
  }, { timeout: 10000 });
}

async function presenceCount(page) {
  return await page.evaluate(() => {
    const list = document.querySelector('#user-list');
    return list ? list.querySelectorAll('.user-item').length : 0;
  });
}

function bind(page, label, errors) {
  page.on('pageerror', e => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`[${label}] console.error: ${m.text().slice(0, 200)}`);
  });
}

// =========================================================================
// Test 1: quiet-mode chrome + leave + re-join (mesh)
// =========================================================================
const errors = [];

const aCreator = await newCtx();
bind(aCreator.page, 'A-create', errors);
const roomCode = await createRoomViaLanding(aCreator.page, `Day5 Flow ${Date.now()}`);
console.log('ROOM ->', roomCode);
await aCreator.ctx.close();

const a = await newCtx();
bind(a.page, 'A', errors);
await joinViaStudy(a.page, { name: 'Aziz', roomCode });

// (a) quiet-mode chrome: mesh exposes camera toggle, never audio toggle.
const aChrome = await a.page.evaluate(() => ({
  cameraToggle: !!document.getElementById('camera-toggle'),
  audioToggle: !!document.querySelector('[id*="audio"][id*="toggle"], [data-audio-toggle]')
}));
console.log('A chrome ->', JSON.stringify(aChrome));
if (!aChrome.cameraToggle) errors.push('[A] camera toggle missing — mesh UI broken');
if (aChrome.audioToggle) errors.push('[A] audio toggle present — violates quiet-mode wedge');

// (b) bring B in
const b = await newCtx();
bind(b.page, 'B', errors);
await joinViaStudy(b.page, { name: 'Friend', roomCode });

await a.page.waitForFunction(() => {
  const list = document.querySelector('#user-list');
  return list && list.querySelectorAll('.user-item').length >= 2;
}, { timeout: 8000 }).catch(() => null);
const beforeLeave = { a: await presenceCount(a.page), b: await presenceCount(b.page) };
console.log('Both joined ->', JSON.stringify(beforeLeave));

// (c) A leaves — close the entire context (simulates tab close)
await a.ctx.close();

// (d) B should see presence drop to 1
await b.page.waitForFunction(() => {
  const list = document.querySelector('#user-list');
  return list && list.querySelectorAll('.user-item').length === 1;
}, { timeout: 10000 }).catch(() => null);
const afterLeave = await presenceCount(b.page);
console.log(`After A leaves, B sees ${afterLeave} participant(s).`);
if (afterLeave !== 1) errors.push(`[B] presence after leave expected 1, got ${afterLeave}`);

// (e) A re-joins same room code (new context, new socket)
const a2 = await newCtx();
bind(a2.page, 'A2', errors);
await joinViaStudy(a2.page, { name: 'Aziz Reconnect', roomCode });

await b.page.waitForFunction(() => {
  const list = document.querySelector('#user-list');
  return list && list.querySelectorAll('.user-item').length === 2;
}, { timeout: 10000 }).catch(() => null);
const afterRejoin = await presenceCount(b.page);
console.log(`After A re-joins, B sees ${afterRejoin} participant(s).`);
if (afterRejoin !== 2) errors.push(`[B] presence after re-join expected 2, got ${afterRejoin}`);

await a2.ctx.close();
await b.ctx.close();

// =========================================================================
// Test 2: RTL parity — Arabic default loads + create flow runs cleanly
// =========================================================================
console.log('\n=== RTL parity check ===');
const rtl = await newCtx({ rtl: true });
const rtlErrors = [];
rtl.page.on('pageerror', e => rtlErrors.push(`pageerror: ${e.message}`));
rtl.page.on('console', m => {
  if (m.type() === 'error') rtlErrors.push(`console.error: ${m.text().slice(0, 200)}`);
});

await rtl.page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await rtl.page.waitForTimeout(800);

const rtlState = await rtl.page.evaluate(() => ({
  dir: document.documentElement.dir,
  lang: document.documentElement.lang,
  hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  bodyWidth: document.body.scrollWidth,
  clientWidth: document.documentElement.clientWidth
}));
console.log('RTL ->', JSON.stringify(rtlState));
if (rtlState.dir !== 'rtl') rtlErrors.push(`expected dir="rtl", got "${rtlState.dir}"`);
if (rtlState.lang !== 'ar') rtlErrors.push(`expected lang="ar", got "${rtlState.lang}"`);
if (rtlState.hasHorizontalScroll) rtlErrors.push(`horizontal scroll detected — RTL layout broken (${rtlState.bodyWidth} > ${rtlState.clientWidth})`);

// Drive create flow in Arabic to ensure the form still works.
await rtl.page.fill('#room-name', 'غرفة دراسة ١');
await rtl.page.click('#create-form button[type="submit"]');
await rtl.page.waitForSelector('#create-result:not([hidden])', { timeout: 8000 }).catch(() => null);
const rtlRoom = await rtl.page.textContent('#result-code').catch(() => null);
console.log('RTL create-room result ->', rtlRoom?.trim() || 'FAILED');
if (!rtlRoom) rtlErrors.push('RTL create-room flow did not produce a room code');

await rtl.ctx.close();

// =========================================================================
// Summary
// =========================================================================
console.log('\n=== Summary ===');
console.log(`Test 1 errors: ${errors.length}`); errors.forEach(e => console.log('  -', e));
console.log(`Test 2 (RTL) errors: ${rtlErrors.length}`); rtlErrors.forEach(e => console.log('  -', e));
const total = errors.length + rtlErrors.length;
console.log(`\nPASS: ${total === 0 ? 'YES' : 'NO'}`);

await browser.close();
process.exit(total === 0 ? 0 : 1);
