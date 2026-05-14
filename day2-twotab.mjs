import { chromium } from '@playwright/test';

const BASE = 'https://127.0.0.1:3443';
const SFU = 'https://127.0.0.1:3010';

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

// Use one context to create the room via the page's own socket.io
const setupCtx = await browser.newContext({ ignoreHTTPSErrors: true });
const setupPage = await setupCtx.newPage();
await setupPage.goto(BASE, { waitUntil: 'domcontentloaded' });
const roomCode = await setupPage.evaluate(() => new Promise((resolve, reject) => {
  const s = io({ transports: ['websocket'] });
  const t = setTimeout(() => reject('timeout'), 8000);
  s.on('connect', () => {
    s.emit('create-room', { roomName: 'D2 TT HTTPS', mediaMode: 'sfu' }, r => {
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
  await ctx.grantPermissions(['camera', 'microphone'], { origin: SFU });
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', e => log.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', r => {
    const u = r.url();
    if (!u.includes('design-system') && !u.includes('translate.googleapis') && !u.includes('mirotalk.com'))
      log.push(`[${name}] reqfail ${r.failure()?.errorText} ${u.slice(0, 100)}`);
  });
  await page.goto(`${BASE}/study?room=${roomCode}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(800);
  await page.fill('#join-name', name);
  await page.fill('#join-room', roomCode);
  await page.locator('.join-submit').click();
  return { ctx, page, log };
}

const a = await joinAs('Aziz');
const b = await joinAs('Friend');
console.log('Waiting 25s for mediasoup negotiation + frame flow...');
await Promise.all([a.page.waitForTimeout(25000), b.page.waitForTimeout(25000)]);

async function probe(label, { page, log }) {
  const top = await page.evaluate(() => {
    const f = document.getElementById('sfu-frame');
    return { src: f?.src, sfuMode: !!document.querySelector('.video-box.sfu-mode') };
  });
  const sfuFrame = page.frames().find(f => f.url().startsWith(SFU));
  if (!sfuFrame) {
    console.log(`[${label}] NO SFU FRAME — frames seen:`, page.frames().map(f => f.url()));
    if (log.length) { console.log(`[${label}] errors:`); log.slice(-8).forEach(l => console.log('  ', l)); }
    return;
  }
  const stats = await sfuFrame.evaluate(async () => {
    const vids = Array.from(document.querySelectorAll('video'));
    // Coerce paused remote videos, but cap wait at 1.5s each
    for (const v of vids) {
      if (v.paused && v.srcObject) {
        try {
          await Promise.race([
            v.play(),
            new Promise(r => setTimeout(r, 1500))
          ]);
        } catch (_e) { /* swallow */ }
      }
    }
    await new Promise(r => setTimeout(r, 1500));
    return {
      videoCount: vids.length,
      videos: vids.slice(0, 8).map(v => {
        const tracks = v.srcObject ? v.srcObject.getVideoTracks().map(t => ({
          id: t.id.slice(0, 8),
          kind: t.kind,
          label: t.label.slice(0, 30),
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        })) : [];
        return {
          id: v.id, cls: (v.className || '').slice(0, 40),
          paused: v.paused, w: v.videoWidth, h: v.videoHeight,
          hasSrcObject: !!v.srcObject, readyState: v.readyState,
          tracks
        };
      })
    };
  });
  console.log(`[${label}] top ->`, JSON.stringify(top));
  console.log(`[${label}] frame ->`, JSON.stringify(stats, null, 2));
  if (log.length) { console.log(`[${label}] errors (last 5):`); log.slice(-5).forEach(l => console.log('  ', l)); }
}

await probe('A', a);
await probe('B', b);

await browser.close();
