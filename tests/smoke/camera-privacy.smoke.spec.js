const { test, expect, gotoTestPage } = require('../helpers/playwright-test');
const { startServer } = require('../helpers/server-control');

let app;
test.beforeAll(async () => { app = await startServer({ env: { VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } }); });
test.afterAll(async () => { await app?.stop(); });

async function enter(page, mode) {
    await page.addInitScript((failureMode) => {
        const w = /** @type {any} */ (window);
        localStorage.setItem('halastudyLang', 'en');
        delete w.FaceDetector;
        // A real browser MediaStream, generated locally: no camera/device dependency.
        const capture = HTMLCanvasElement.prototype.captureStream;
        w.__rawTracks = [];
        navigator.mediaDevices.getUserMedia = async () => {
            const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
            const ctx = canvas.getContext('2d');
            const stream = capture.call(canvas, 30);
            const paint = setInterval(() => { ctx.fillStyle = '#aaa'; ctx.fillRect(0, 0, 64, 48); }, 30);
            stream.getTracks().forEach(track => {
                w.__rawTracks.push(track);
                const stop = track.stop.bind(track);
                track.stop = () => { clearInterval(paint); stop(); };
            });
            return stream;
        };
        if (failureMode === 'unsupported') HTMLCanvasElement.prototype.captureStream = undefined;
        if (failureMode === 'capture' || failureMode === 'toggle') {
            HTMLCanvasElement.prototype.captureStream = () => { throw new DOMException('Synthetic failure', 'NotAllowedError'); };
        }
        if (failureMode === 'toggle') localStorage.setItem('halastudyBlurPref', 'off');
        if (failureMode === 'ended') {
            const play = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.play = function () {
                if (this.style.position === 'fixed' && this.srcObject instanceof MediaStream) {
                    this.srcObject.getTracks().forEach(t => { t.stop(); t.dispatchEvent(new Event('ended')); });
                    return Promise.resolve();
                }
                return play.call(this);
            };
        }
    }, mode);
    await gotoTestPage(page, `${app.baseUrl}/open`);
    await page.fill('#room-name', 'Privacy regression');
    await page.click('#create-form button[type=submit]');
    await page.locator('#create-result').waitFor({ state: 'visible' });
    await page.click('#btn-enter-room'); await page.fill('#join-name', 'Synthetic');
    await page.click('#join-form button[type=submit]');
    await page.waitForFunction(() => !(/** @type {HTMLInputElement} */ (document.getElementById('chat-input'))).disabled);
}

for (const mode of ['capture', 'unsupported', 'ended', 'toggle']) {
    test(`privacy processing ${mode}: stop every raw track and retain explicit recovery`, async ({ page }) => {
        await enter(page, mode);
        if (mode === 'toggle') {
            // Explicit choice first; no implicit raw-camera fallback.
            await expect(page.locator('#blur-toggle')).toHaveText('Blur: off');
        }
        await page.click('#camera-toggle');
        if (mode === 'toggle') {
            await page.waitForFunction(() => !!(/** @type {HTMLVideoElement} */ (document.getElementById('local-video'))).srcObject);
            await page.click('#blur-toggle');
        }
        await expect(page.locator('#camera-help')).toBeVisible();
        await expect(page.locator('#camera-help-message')).toContainText('Privacy blur');
        await expect(page.locator('#camera-toggle')).toBeEnabled();
        expect(await page.evaluate(() => (/** @type {HTMLVideoElement} */ (document.getElementById('local-video'))).srcObject === null)).toBe(true);
        expect(await page.evaluate(() => /** @type {any} */ (window).__rawTracks.every(t => t.readyState === 'ended'))).toBe(true);
        expect(await page.locator('video[style*="position: fixed"]').count()).toBe(0);
        await page.click('#blur-toggle'); await page.click('#camera-toggle');
        await page.waitForFunction(() => (/** @type {MediaStream} */ ((/** @type {HTMLVideoElement} */ (document.getElementById('local-video'))).srcObject))?.getVideoTracks()[0]?.readyState === 'live');
        await expect(page.locator('#blur-toggle')).toHaveText('Blur: off');
    });
}

for (const language of ['en', 'ar']) {
    test(`an interrupted camera offers recovery and ignores old track events (${language})`, async ({ page }) => {
        await page.setViewportSize({ width: language === 'ar' ? 390 : 1440, height: 900 });
        await enter(page, 'healthy');
        await page.locator(`[data-lang-value=${language}]`).filter({ visible: true }).click();
        await page.click('#camera-toggle');
        const livePreview = () => page.evaluate(() => {
            const video = /** @type {HTMLVideoElement} */ (document.getElementById('local-video'));
            return /** @type {MediaStream|null} */ (video.srcObject)?.getVideoTracks()[0]?.readyState === 'live';
        });
        await expect.poll(livePreview).toBe(true);
        await page.evaluate(() => {
            const w = /** @type {any} */ (window);
            w.__firstPreview = /** @type {MediaStream} */ ((/** @type {HTMLVideoElement} */ (document.getElementById('local-video'))).srcObject).getVideoTracks()[0];
            const raw = w.__rawTracks[0];
            raw.stop(); raw.dispatchEvent(new Event('ended'));
        });
        await expect(page.locator('#camera-help')).toBeVisible();
        await expect(page.locator('#camera-help-message')).toHaveText(language === 'en'
            ? 'The camera stopped. Reconnect it and try again, or continue studying without it.'
            : 'توقفت الكاميرا. أعد توصيلها وحاول مرة أخرى، أو أكمل المذاكرة بدونها.');
        expect(await livePreview()).toBe(false);
        expect(await page.evaluate(() => (/** @type {any} */ (window)).__firstPreview.readyState)).toBe('ended');
        await expect(page.locator('video[style*="position: fixed"]')).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath(`camera-interrupted-${language}.png`) });
        await page.click('#camera-retry');
        await expect.poll(livePreview).toBe(true);
        await expect(page.locator('#camera-help')).toBeHidden();
        await expect(page.locator('#blur-toggle')).toHaveAttribute('aria-pressed', 'true');
        // A delayed event from the replaced capture must not stop the new camera.
        await page.evaluate(() => (/** @type {any} */ (window)).__rawTracks[0].dispatchEvent(new Event('ended')));
        expect(await livePreview()).toBe(true);
        await expect(page.locator('#camera-help')).toBeHidden();
        await page.click('#camera-toggle');
        expect(await page.evaluate(() => (/** @type {any} */ (window)).__rawTracks.every(t => t.readyState === 'ended'))).toBe(true);
    });
}
