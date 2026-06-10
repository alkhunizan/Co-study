const { test, expect } = require('@playwright/test');

// Third-party font fetches are the only legitimate network-dependent
// resources on the landing page; don't let an offline runner turn them
// into failures.
const IGNORED_CONSOLE_PATTERNS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/];

function collectPageErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => {
        errors.push(`pageerror: ${error.message}`);
    });
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Failed resource loads report the URL via location(), not text() —
        // check both so the font-host filter actually works offline.
        const text = message.text();
        const sourceUrl = message.location()?.url || '';
        if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text) || pattern.test(sourceUrl))) return;
        errors.push(`console: ${text}`);
    });
    return errors;
}

test('landing page renders the hero and routes to the create form', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/');
    await expect(page.locator('.hero-title')).toBeVisible();
    await expect(page.locator('.live-pill')).toBeVisible();

    await page.locator('.hero-actions a.btn-primary').click();
    await expect(page).toHaveURL(/\/open\.html$/);
    await expect(page.locator('#create-form')).toBeVisible();

    expect(errors).toEqual([]);
});

test('coStudy storage keys migrate once and never clobber new values', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.addInitScript(() => {
            try {
                localStorage.setItem('coStudyLang', 'en');
                localStorage.setItem('coStudyName', 'OldName');
                // A value the user already has under the new key must win.
                localStorage.setItem('coStudyFocusStats', '{"old":true}');
                localStorage.setItem('halastudyFocusStats', '{"new":true}');
                sessionStorage.setItem('coStudyRoomCode', 'LEGACY');
            } catch (_error) {}
        });

        await page.goto('/');

        const migrated = await page.evaluate(() => ({
            lang: localStorage.getItem('halastudyLang'),
            name: localStorage.getItem('halastudyName'),
            stats: localStorage.getItem('halastudyFocusStats'),
            roomCode: sessionStorage.getItem('halastudyRoomCode'),
            sentinel: localStorage.getItem('halastudy:migratedFromCoStudy:v1')
        }));

        expect(migrated.lang).toBe('en');
        expect(migrated.name).toBe('OldName');
        expect(migrated.stats).toBe('{"new":true}');
        expect(migrated.roomCode).toBe('LEGACY');
        expect(migrated.sentinel).not.toBeNull();
    } finally {
        await context.close();
    }
});

test('theme and language survive the landing to open handoff', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto('/');
        await page.click('#theme-toggle');
        await page.click('.lang-switch button[data-lang-value="en"]');
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

        await page.goto('/open.html');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.locator('body')).toHaveAttribute('data-lang', 'en');
    } finally {
        await context.close();
    }
});

test('reduced motion keeps every hero clip on its poster frame', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
        await page.goto('/');
        await expect(page.locator('video.tile-photo').first()).toBeVisible();

        await expect.poll(async () => {
            return page.locator('video.tile-photo').evaluateAll((videos) => {
                return videos.every((video) => /** @type {HTMLVideoElement} */ (video).paused);
            });
        }, { timeout: 5000 }).toBe(true);
    } finally {
        await context.close();
    }
});
