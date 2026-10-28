const { createTestContext, gotoTestPage, test, expect, waitForTestUrl } = require('../helpers/playwright-test');

// Third-party font fetches are the only legitimate network-dependent
// resources on the landing page; don't let an offline runner turn them
// into failures.
const IGNORED_CONSOLE_PATTERNS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/];

function collectPageErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => {
        // Mobile WebKit rejects a pending muted autoplay promise when the
        // test leaves the hero page. The navigation succeeds and no provider
        // request escapes the guarded context, so this exact cancellation is
        // not an application failure.
        if ((error.name === 'AbortError' && error.message === 'The operation was aborted.')
            || error.message === 'AbortError: The operation was aborted.') return;
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

    await gotoTestPage(page, '/');
    await expect(page.locator('.hero-title')).toBeVisible();
    await expect(page.locator('.live-pill')).toBeVisible();

    await page.locator('.hero-actions a.btn-primary').click();
    await expect(page).toHaveURL(/\/open\.html$/);
    await expect(page.locator('#create-form')).toBeVisible();

    expect(errors).toEqual([]);
});

test('coStudy storage keys migrate once and never clobber new values', async ({ browser }) => {
    const context = await createTestContext(browser);
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

        await gotoTestPage(page, '/');

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
    const context = await createTestContext(browser);
    const page = await context.newPage();

    try {
        await gotoTestPage(page, '/');
        if (!await page.locator('#theme-toggle').isVisible()) {
            await page.click('#nav-burger');
            await expect(page.locator('#mobile-menu')).toBeVisible();
        }
        await page.click('#theme-toggle');
        await page.click('.lang-switch button[data-lang-value="en"]');
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

        await gotoTestPage(page, '/open.html');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.locator('body')).toHaveAttribute('data-lang', 'en');
    } finally {
        await context.close();
    }
});

test('reduced motion keeps every hero clip on its poster frame', async ({ browser }) => {
    const context = await createTestContext(browser, { reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
        await gotoTestPage(page, '/');
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

test('the landing footer leads to a bilingual contact page', async ({ page }) => {
    await gotoTestPage(page, '/');
    await page.locator('footer a[href="/contact"]').click();
    await waitForTestUrl(page, '**/contact');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('h1')).toHaveText('تواصل مع هلاستدي');
    await expect(page.locator('.contact-option[href^="mailto:"]')).toBeVisible();
    await expect(page.locator('.lang-switch')).toHaveAttribute('aria-label', 'اللغة');

    await page.locator('.lang-switch button[data-lang-value="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('h1')).toHaveText('Get in touch with Halastudy');
    await expect(page.locator('footer a[href="/contact"]')).toHaveText('Contact');
    await expect(page).toHaveTitle('Halastudy | Contact');
    await expect(page.locator('.lang-switch')).toHaveAttribute('aria-label', 'Language');
});

test('keyboard focus on the legal pages uses the accent glow, not the browser outline', async ({ page, browserName }) => {
    // Safari (and Playwright's WebKit) skips links on Tab unless the OS
    // "Press Tab to highlight each item" setting is on, so drive it in Chromium.
    test.skip(browserName === 'webkit', 'WebKit does not Tab to links by default.');
    await gotoTestPage(page, '/privacy');
    const contactLink = page.locator('.legal-footer a[href="/contact"]');
    await contactLink.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(contactLink).toBeFocused();
    const style = await contactLink.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { outline: cs.outlineStyle, shadow: cs.boxShadow };
    });
    expect(style.outline).toBe('none');
    expect(style.shadow).not.toBe('none');
});
