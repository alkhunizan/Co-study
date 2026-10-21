const { test, expect } = require('@playwright/test');
const { startServer } = require('../helpers/server-control');

let app;
test.beforeAll(async () => { app = await startServer({ env: { VIDEO_PROVIDER: 'mesh' } }); });
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
    await page.goto(app.baseUrl + '/open');
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
