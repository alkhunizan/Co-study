const { createTestContext, gotoTestPage, test, expect } = require('../helpers/playwright-test');

test('service worker installs versioned assets and replays compressed ambient audio offline', async ({ browser }) => {
    const context = await createTestContext(browser);
    const page = await context.newPage();

    try {
        await gotoTestPage(page, '/');
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
        await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
            .toBe(true);

        const online = await page.evaluate(async () => {
            const response = await fetch('/audio/cafe.wav');
            const body = await response.arrayBuffer();
            const cacheNames = await caches.keys();
            const staticCacheName = cacheNames.find((name) => name.startsWith('halastudy-static-'));
            const audioCacheName = cacheNames.find((name) => name.startsWith('halastudy-ambient-v'));
            const staticCache = staticCacheName ? await caches.open(staticCacheName) : null;
            const audioCache = audioCacheName ? await caches.open(audioCacheName) : null;
            const cachedPrivacy = staticCache ? await staticCache.match('/privacy') : null;
            const cachedAudio = audioCache ? await audioCache.match('/audio/cafe.wav') : null;
            return {
                bodyBytes: body.byteLength,
                contentType: response.headers.get('content-type'),
                hasCachedPrivacy: Boolean(cachedPrivacy),
                cachedAudioBytes: cachedAudio ? (await cachedAudio.arrayBuffer()).byteLength : 0,
                staticCacheName
            };
        });

        expect(online.staticCacheName).toMatch(/^halastudy-static-/);
        expect(online.hasCachedPrivacy).toBe(true);
        expect(online.contentType).toMatch(/^audio\/mpeg/);
        expect(online.bodyBytes).toBeLessThan(2 * 1024 * 1024);
        expect(online.cachedAudioBytes).toBe(online.bodyBytes);

        await context.setOffline(true);
        const offline = await page.evaluate(async () => {
            const audioElement = document.createElement('audio');
            audioElement.preload = 'metadata';
            audioElement.src = '/audio/cafe.wav';
            const durationPromise = new Promise((resolve, reject) => {
                audioElement.addEventListener('loadedmetadata', () => resolve(audioElement.duration), { once: true });
                audioElement.addEventListener('error', () => reject(new Error('Chromium could not decode cached audio')), {
                    once: true
                });
            });
            const [privacy, audio, duration] = await Promise.all([
                fetch('/privacy'),
                fetch('/audio/cafe.wav'),
                durationPromise
            ]);
            audioElement.removeAttribute('src');
            audioElement.load();
            return {
                privacy: await privacy.text(),
                audioBytes: (await audio.arrayBuffer()).byteLength,
                audioType: audio.headers.get('content-type'),
                duration
            };
        });

        expect(offline.privacy).toContain('Privacy Policy');
        expect(offline.audioBytes).toBe(online.bodyBytes);
        expect(offline.audioType).toMatch(/^audio\/mpeg/);
        expect(offline.duration).toBeGreaterThan(130);
    } finally {
        await context.setOffline(false);
        await context.close();
    }
});
