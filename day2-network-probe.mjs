import { chromium } from '@playwright/test';
import { io as ioc } from 'socket.io-client';

const roomCode = await new Promise((resolve, reject) => {
  const sock = ioc('http://127.0.0.1:3050', { transports: ['websocket'] });
  sock.on('connect', () => {
    sock.emit('create-room', { roomName: 'NetProbe', mediaMode: 'sfu' }, r => {
      sock.disconnect();
      r?.ok ? resolve(r.room.roomId) : reject(new Error(JSON.stringify(r)));
    });
  });
});
console.log('ROOM ->', roomCode);

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox', '--autoplay-policy=no-user-gesture-required']
});
const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
await ctx.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:3050' });
await ctx.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:3010' });

const page = await ctx.newPage();
const failed = [];
page.on('requestfailed', r => {
  failed.push({ url: r.url().slice(0, 120), err: r.failure()?.errorText });
});
page.on('response', async r => {
  const u = r.url();
  if (u.includes('127.0.0.1:3010') || u.includes('mirotalk.com')) {
    console.log(`[net] ${r.status()} ${u.slice(0, 120)}`);
  }
});

await page.goto(`http://127.0.0.1:3050/study?room=${roomCode}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.fill('#join-name', 'NetProbe');
await page.fill('#join-room', roomCode);
await page.locator('.join-submit').click();
await page.waitForTimeout(8000);

console.log('\nFAILED REQUESTS (last 20):');
failed.slice(-20).forEach(f => console.log('  ', f.err, '->', f.url));

console.log('\nFRAMES:', page.frames().map(f => f.url()));

await browser.close();
