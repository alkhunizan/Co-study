import { chromium } from '@playwright/test';
import { io as ioc } from 'socket.io-client';

// Step 1: create a fresh SFU room via socket.io so we know it's alive
const roomCode = await new Promise((resolve, reject) => {
  const sock = ioc('http://127.0.0.1:3050', { transports: ['websocket'] });
  const t = setTimeout(() => reject(new Error('socket timeout')), 8000);
  sock.on('connect', () => {
    sock.emit('create-room', { roomName: 'Day2 Smoke', mediaMode: 'sfu' }, (resp) => {
      clearTimeout(t);
      sock.disconnect();
      if (resp && resp.ok) resolve(resp.room.roomId);
      else reject(new Error('create-room failed: ' + JSON.stringify(resp)));
    });
  });
  sock.on('connect_error', e => reject(e));
});
console.log('CREATED ROOM ->', roomCode);

// Step 2: drive the join flow in a fake-media browser
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox'
  ]
});

const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
await ctx.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:3050' });
await ctx.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:3010' });

const page = await ctx.newPage();
const consoleLog = [];
page.on('pageerror', e => consoleLog.push(`pageerror: ${e.message}`));
page.on('console', m => consoleLog.push(`${m.type()}: ${m.text().slice(0, 220)}`));

await page.goto(`http://127.0.0.1:3050/study?room=${roomCode}`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(1200);

await page.fill('#join-name', 'AzizSpike');
await page.fill('#join-room', roomCode);
await page.locator('.join-submit').click();

// Wait for the SFU iframe to mount
await page.waitForTimeout(5000);

const probe = await page.evaluate(() => {
  const f = document.getElementById('sfu-frame');
  const box = document.getElementById('media-state-text');
  return {
    joinOverlayHidden: document.getElementById('join-overlay')?.classList.contains('hidden'),
    iframeSrc: f ? f.src : null,
    iframeAllow: f ? f.getAttribute('allow') : null,
    iframeDisplay: f ? getComputedStyle(f).display : null,
    sfuModeClass: !!document.querySelector('.video-box.sfu-mode'),
    mediaStateText: box ? box.textContent.trim() : null
  };
});
console.log('PROBE_AFTER_JOIN ->', JSON.stringify(probe, null, 2));

// Pull iframe content via the page (cross-origin to MiroTalk — limited, but title may surface)
const frameTitle = await page.evaluate(() => {
  const f = document.getElementById('sfu-frame');
  try { return f && f.contentDocument ? f.contentDocument.title : 'cross-origin (expected)'; }
  catch (_e) { return 'cross-origin (expected)'; }
});
console.log('FRAME_TITLE ->', frameTitle);

console.log('CONSOLE_LOG (last 40):');
consoleLog.slice(-40).forEach(l => console.log('  ', l));

await browser.close();
