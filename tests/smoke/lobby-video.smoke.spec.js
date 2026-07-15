const { test, expect } = require('@playwright/test');

const { startServer } = require('../helpers/server-control');

test('Lobby uses the shared video lifecycle and releases its session on navigation', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    const videoRequests = [];
    const browserErrors = [];

    try {
        await page.addInitScript(() => {
            try {
                localStorage.setItem('halastudyLang', 'en');
                localStorage.setItem('halastudyDisplayName', 'Lobby Smoke');
                localStorage.setItem('halastudyClientId', 'lobby-smoke-client');
            } catch (_error) {}
        });
        await page.route('**/js/video/realtimekit-client.js', async (route) => {
            await route.fulfill({
                contentType: 'application/javascript',
                body: `
                    window.__fakeLobbyMedia = { joins: 0, leaves: 0 };
                    window.HalastudyRealtimeKitClient = {
                        joinHeadless: async () => {
                            window.__fakeLobbyMedia.joins += 1;
                            const meeting = {
                                self: {
                                    videoEnabled: false,
                                    on() {},
                                    async disableAudio() {},
                                    async enableVideo() { this.videoEnabled = true; },
                                    async disableVideo() { this.videoEnabled = false; }
                                },
                                participants: {
                                    joined: { toArray: () => [], on() {} },
                                    on() {},
                                    async setViewMode() {},
                                    setPage() {}
                                }
                            };
                            return {
                                meeting,
                                leave: async () => { window.__fakeLobbyMedia.leaves += 1; }
                            };
                        }
                    };
                `
            });
        });
        page.on('request', (request) => {
            if (/\/api\/rooms\/LOBBY\/video-(token|heartbeat|leave)$/.test(new URL(request.url()).pathname)) {
                videoRequests.push({
                    pathname: new URL(request.url()).pathname,
                    body: request.postDataJSON()
                });
            }
        });
        page.on('pageerror', (error) => browserErrors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') browserErrors.push(message.text());
        });

        await page.goto(`${server.baseUrl}/lobby`);
        await expect.poll(() => page.evaluate(
            () => (/** @type {any} */ (window)).__fakeLobbyMedia?.joins || 0
        )).toBe(1);
        await expect.poll(() => page.evaluate(
            () => !!(/** @type {any} */ (window)).HalastudyVideoClient
        )).toBe(true);

        const tokenRequest = videoRequests.find((request) => request.pathname.endsWith('/video-token'));
        expect(tokenRequest?.body).toMatchObject({
            displayName: 'Lobby Smoke',
            clientSessionId: 'lobby-smoke-client',
            role: 'viewer'
        });

        await page.goto('about:blank');
        await expect.poll(
            () => videoRequests.filter((request) => request.pathname.endsWith('/video-leave')).length
        ).toBe(1);
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});
