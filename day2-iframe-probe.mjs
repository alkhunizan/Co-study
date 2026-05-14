import { chromium } from '@playwright/test';
import { io as ioc } from 'socket.io-client';

const roomCode = await new Promise((resolve, reject) => {
  const sock = ioc('http://127.0.0.1:3050', { transports: ['websocket'] });
  sock.on('connect', () => {
    sock.emit('create-room', { roomName: 'IframeProbe2', mediaMode: 'sfu' }, r => {
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
await page.goto(`http://127.0.0.1:3050/study?room=${roomCode}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.fill('#join-name', 'Probe');
await page.fill('#join-room', roomCode);
await page.locator('.join-submit').click();

console.log('Waiting 10s for MiroTalk to settle...');
await page.waitForTimeout(10000);

const frameUrls = page.frames().map(f => f.url());
console.log('FRAMES SEEN ->', JSON.stringify(frameUrls, null, 2));

const sfuFrame = page.frames().find(f => f.url().startsWith('http://127.0.0.1:3010'));
if (!sfuFrame) {
  console.log('NO SFU FRAME FOUND — abort');
  await browser.close();
  process.exit(1);
}

const snap = await sfuFrame.evaluate(() => {
  return {
    title: document.title,
    readyState: document.readyState,
    videoCount: document.querySelectorAll('video').length,
    videos: Array.from(document.querySelectorAll('video')).slice(0, 6).map(v => ({
      id: v.id, cls: (v.className || '').slice(0, 60),
      paused: v.paused, readyState: v.readyState,
      w: v.videoWidth, h: v.videoHeight,
      hasSrcObject: !!v.srcObject
    })),
    swal: document.querySelector('.swal2-popup')?.textContent?.trim().slice(0, 300) || null,
    modals: Array.from(document.querySelectorAll('[class*="modal"], [class*="overlay"], dialog'))
      .filter(n => n.offsetParent !== null).slice(0, 6)
      .map(n => ({ cls: (n.className || '').slice(0, 60), txt: (n.textContent || '').trim().slice(0, 100) })),
    bodyKids: Array.from(document.body.children).slice(0, 15).map(n => ({
      tag: n.tagName, id: n.id, cls: (n.className || '').slice(0, 60),
      visible: n.offsetParent !== null
    }))
  };
});
console.log('SFU FRAME SNAPSHOT ->', JSON.stringify(snap, null, 2));

await browser.close();
