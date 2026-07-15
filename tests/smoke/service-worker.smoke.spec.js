const { createTestContext, gotoTestPage, test, expect } = require('../helpers/playwright-test');

test('service worker installs versioned assets and replays compressed ambient audio offline', async ({
    browser,
    browserName
}) => {
    const context = await createTestContext(browser, { serviceWorkers: 'allow' });
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

        const webkitHttpDuration = browserName === 'webkit'
            ? await page.evaluate(() => new Promise((resolve, reject) => {
                // The Windows Playwright WebKit build decodes MP3 over HTTP
                // but not from blob URLs. Prove codec compatibility online;
                // the cache-byte assertions below remain offline-ready.
                const audioElement = document.createElement('audio');
                audioElement.preload = 'metadata';
                audioElement.addEventListener('loadedmetadata', () => resolve(audioElement.duration), { once: true });
                audioElement.addEventListener('error', () => reject(new Error('WebKit could not decode HTTP audio')), {
                    once: true
                });
                audioElement.src = '/audio/cafe.wav';
                audioElement.load();
            }))
            : null;

        // Playwright WebKit rejects requests before a controlling worker sees
        // them when its context-level offline emulation is enabled. Chromium
        // covers the full intercepted-fetch path; WebKit verifies the same
        // persisted bodies directly through Cache Storage below.
        const supportsWorkerOfflineEmulation = browserName !== 'webkit';
        if (supportsWorkerOfflineEmulation) await context.setOffline(true);
        const offline = await page.evaluate(async (readCacheDirectly) => {
            let privacy;
            let audio;
            if (readCacheDirectly) {
                // Playwright WebKit's offline emulation rejects requests before
                // dispatching them to a controlling service worker. Exercise
                // the exact persisted responses through Cache Storage there;
                // Chromium still covers end-to-end offline fetch interception.
                const cacheNames = await caches.keys();
                const staticCacheName = cacheNames.find((name) => name.startsWith('halastudy-static-'));
                const audioCacheName = cacheNames.find((name) => name.startsWith('halastudy-ambient-v'));
                const staticCache = staticCacheName ? await caches.open(staticCacheName) : null;
                const audioCache = audioCacheName ? await caches.open(audioCacheName) : null;
                privacy = staticCache ? await staticCache.match('/privacy') : null;
                audio = audioCache ? await audioCache.match('/audio/cafe.wav') : null;
                if (!privacy || !audio) throw new Error('Offline cache entry missing.');
            } else {
                [privacy, audio] = await Promise.all([
                    fetch('/privacy'),
                    fetch('/audio/cafe.wav')
                ]);
            }

            const audioBody = await audio.clone().arrayBuffer();
            if (readCacheDirectly) {
                return {
                    privacy: await privacy.text(),
                    audioBytes: audioBody.byteLength,
                    audioType: audio.headers.get('content-type'),
                    duration: null
                };
            }

            const audioElement = document.createElement('audio');
            audioElement.preload = 'metadata';
            const durationPromise = new Promise((resolve, reject) => {
                audioElement.addEventListener('loadedmetadata', () => resolve(audioElement.duration), { once: true });
                audioElement.addEventListener('error', () => reject(new Error('Browser could not decode cached audio')), {
                    once: true
                });
            });
            audioElement.src = '/audio/cafe.wav';
            audioElement.load();
            const duration = await durationPromise;
            audioElement.removeAttribute('src');
            audioElement.load();
            return {
                privacy: await privacy.text(),
                audioBytes: audioBody.byteLength,
                audioType: audio.headers.get('content-type'),
                duration
            };
        }, browserName === 'webkit');

        expect(offline.privacy).toContain('Privacy Policy');
        expect(offline.audioBytes).toBe(online.bodyBytes);
        expect(offline.audioType).toMatch(/^audio\/mpeg/);
        expect(offline.duration ?? webkitHttpDuration).toBeGreaterThan(130);
    } finally {
        if (browserName !== 'webkit') await context.setOffline(false);
        await context.close();
    }
});
