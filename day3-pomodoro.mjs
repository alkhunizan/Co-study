// Day 3 spike: Pomodoro state syncs across two clients in an SFU room.
//
// "Pomodoro state" in this app = user-status broadcast carrying timerMode.
// Server contract (co-study-server.js:1469-1481): client emits
//   socket.emit('user-status', { status: { ...payload } })
// where payload is sanitized to:
//   { text, visible, manual, manualPreset, autoSync, ambientType, timerMode, updatedAt }
// Server then broadcasts to room as:
//   io.to(roomId).emit('status-update', { userId, status: safeStatus })
//
// This script proves: when Tab A flips its timerMode focus -> break, Tab B
// receives status-update events with the matching timerMode for A's userId.

import { chromium } from '@playwright/test';

const BASE = 'https://127.0.0.1:3443';

const browser = await chromium.launch({
  ignoreHTTPSErrors: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox',
    '--ignore-certificate-errors',
    '--autoplay-policy=no-user-gesture-required'
  ]
});

// Step 1: create a fresh SFU room (same approach as day2-twotab.mjs).
const setupCtx = await browser.newContext({ ignoreHTTPSErrors: true });
const setupPage = await setupCtx.newPage();
await setupPage.goto(BASE, { waitUntil: 'domcontentloaded' });
const roomCode = await setupPage.evaluate(() => new Promise((resolve, reject) => {
  const s = io({ transports: ['websocket'] });
  const t = setTimeout(() => reject('timeout'), 8000);
  s.on('connect', () => {
    s.emit('create-room', { roomName: 'Day3 Pomodoro', mediaMode: 'sfu' }, r => {
      clearTimeout(t);
      s.disconnect();
      r?.ok ? resolve(r.room.roomId) : reject(JSON.stringify(r));
    });
  });
  s.on('connect_error', e => reject(e.message));
}));
console.log('ROOM ->', roomCode);
await setupCtx.close();

async function joinAs(name) {
  const ctx = await browser.newContext({
    permissions: ['camera', 'microphone'],
    ignoreHTTPSErrors: true
  });
  await ctx.grantPermissions(['camera', 'microphone'], { origin: BASE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/study?room=${roomCode}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(500);
  await page.fill('#join-name', name);
  await page.fill('#join-room', roomCode);
  await page.locator('.join-submit').click();
  // Wait for the socket connection + room join to settle
  await page.waitForFunction(() => {
    const overlay = document.getElementById('join-overlay');
    return overlay && overlay.classList.contains('hidden');
  }, { timeout: 10000 });
  // Give the server's join-room ack + initial presence broadcast a beat to land
  await page.waitForTimeout(800);
  return { ctx, page };
}

const a = await joinAs('Aziz');
const b = await joinAs('Friend');

// Step 2: instrument Tab B to capture every status-update for A.
// The page already has a `socket` variable (index.html:3091).
await b.page.evaluate(() => {
  window.__statusUpdates = [];
  socket.on('status-update', (msg) => {
    window.__statusUpdates.push({ at: Date.now(), msg });
  });
});

// Capture A's socket id so we can filter B's received events.
const aSocketId = await a.page.evaluate(() => socket.id);
console.log('A socket id ->', aSocketId);

// Helper: from Tab A, emit a status payload that the real "Sync with timer"
// toggle would have produced. Awaits the server ack.
async function broadcastFromA(timerMode, label) {
  return a.page.evaluate(({ timerMode, label }) => new Promise((resolve) => {
    socket.emit('user-status', {
      status: {
        text: label,
        visible: true,
        manual: label,
        manualPreset: timerMode === 'focus' ? 'focus' : 'break',
        autoSync: true,
        ambientType: null,
        timerMode,
        updatedAt: Date.now()
      }
    }, (ack) => resolve(ack));
  }), { timerMode, label });
}

// Helper: wait for B to have received a status-update for A with the given timerMode.
async function awaitBSeesAStatus(timerMode, timeoutMs = 4000) {
  return b.page.waitForFunction((args) => {
    const list = window.__statusUpdates || [];
    return list.some(entry =>
      entry.msg && entry.msg.userId === args.aSocketId &&
      entry.msg.status && entry.msg.status.timerMode === args.timerMode
    );
  }, { aSocketId, timerMode }, { timeout: timeoutMs });
}

console.log('\n=== A starts focus mode + shares ===');
const ack1 = await broadcastFromA('focus', 'Focusing');
console.log('A ack ->', JSON.stringify(ack1));
await awaitBSeesAStatus('focus');
const focusSeen = await b.page.evaluate(() => window.__statusUpdates.slice(-1)[0]);
console.log('B received focus ->', JSON.stringify(focusSeen.msg, null, 2));

console.log('\n=== After ~3s, A switches to break ===');
await a.page.waitForTimeout(3000);
const ack2 = await broadcastFromA('break', 'On break');
console.log('A ack ->', JSON.stringify(ack2));
await awaitBSeesAStatus('break');
const breakSeen = await b.page.evaluate(() => window.__statusUpdates.slice(-1)[0]);
console.log('B received break ->', JSON.stringify(breakSeen.msg, null, 2));

console.log('\n=== Summary ===');
const all = await b.page.evaluate(() => window.__statusUpdates);
console.log(`B received ${all.length} status-update events total.`);
const aOnly = all.filter(e => e.msg.userId === aSocketId);
const modes = aOnly.map(e => e.msg.status?.timerMode);
console.log(`Of those, ${aOnly.length} were from A. Mode sequence:`, modes);
console.log(`PASS: ${modes.includes('focus') && modes.includes('break') ? 'YES' : 'NO'}`);

await browser.close();
