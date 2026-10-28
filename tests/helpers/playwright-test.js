const { test: base, expect } = require('@playwright/test');

function isLoopbackHostname(hostname) {
    const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return normalized === 'localhost'
        || normalized === '::1'
        || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function isExternalNetworkUrl(value) {
    let parsed;
    try {
        parsed = new URL(String(value));
    } catch (_error) {
        return false;
    }

    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return false;
    return !isLoopbackHostname(parsed.hostname);
}

async function installNetworkGuard(target) {
    await target.route('**/*', async (route) => {
        const request = route.request();
        if (isExternalNetworkUrl(request.url())) {
            const contentType = request.resourceType() === 'stylesheet'
                ? 'text/css; charset=utf-8'
                : 'text/plain; charset=utf-8';
            await route.fulfill({
                status: 204,
                headers: {
                    'Cache-Control': 'no-store',
                    'Content-Type': contentType
                }
            });
            return;
        }
        await route.continue();
    });
}

const test = base.extend({
    page: async ({ page }, use) => {
        await installNetworkGuard(page);
        await use(page);
    }
});

async function createTestContext(browser, options) {
    // Service-worker initiated requests bypass Playwright routing on some
    // engines. Block workers by default so the loopback-only guard and any
    // per-test API fakes remain authoritative. The dedicated service-worker
    // smoke test opts back in explicitly.
    const context = await browser.newContext({
        serviceWorkers: 'block',
        ...options
    });
    await installNetworkGuard(context);
    return context;
}

function gotoTestPage(page, url, options = {}) {
    return page.goto(url, {
        waitUntil: 'domcontentloaded',
        ...options
    });
}

function waitForTestUrl(page, url, options = {}) {
    return page.waitForURL(url, {
        waitUntil: 'domcontentloaded',
        ...options
    });
}

module.exports = {
    createTestContext,
    expect,
    gotoTestPage,
    installNetworkGuard,
    isExternalNetworkUrl,
    test,
    waitForTestUrl
};
