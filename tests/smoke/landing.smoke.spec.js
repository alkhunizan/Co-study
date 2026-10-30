const { createTestContext, gotoTestPage, test, expect, waitForTestUrl } = require('../helpers/playwright-test');

// Third-party font fetches are the only legitimate network-dependent
// resources on the landing page; don't let an offline runner turn them
// into failures.
const IGNORED_CONSOLE_PATTERNS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/];

test('English landing fits a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
    await gotoTestPage(page, '/');
    // The guarded fixture supplies no external font faces. Windows WebKit can
    // leave ready pending for an empty, already-loaded set; still await every
    // actual face when present, and require loaded status on every engine.
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
    await page.evaluate(async () => {
        if (document.fonts.size) await document.fonts.ready;
    });
    const dimensions = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: innerWidth
    }));
    expect(dimensions.viewport).toBeLessThanOrEqual(391);
    expect(dimensions.content).toBeLessThanOrEqual(391);
});

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

test('tile names remain separate from timers at narrow widths', async ({ page }) => {
    await gotoTestPage(page, '/');
    for (const lang of ['en', 'ar']) {
        await page.evaluate(value => { localStorage.setItem('halastudyLang', value); }, lang);
        await page.reload({ waitUntil: 'domcontentloaded' });
        for (const width of [360, 390, 768, 1024]) {
            await page.setViewportSize({ width, height: 844 });
            const collisions = await page.locator('.tile-name').evaluateAll(names => names.flatMap(name => {
                const timer = name.parentElement.querySelector('.tile-timer');
                if (!timer) return [];
                const b = timer.getBoundingClientRect();
                return [...name.children].filter(child => {
                    const a = child.getBoundingClientRect();
                    return a.width && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
                }).map(() => name.textContent);
            }));
            expect(collisions, `${lang} at ${width}px`).toEqual([]);
        }
    }
});

test('landing page renders the hero and routes to the create form', async ({ page }) => {
    const errors = collectPageErrors(page);

    await gotoTestPage(page, '/');
    await expect(page.locator('.hero-title')).toBeVisible();
    await expect(page.locator('.quiet-pill')).toBeVisible();

    await page.locator('.hero-actions a.btn-primary').click();
    await expect(page).toHaveURL(/\/open(?:\.html)?$/);
    await expect(page.locator('#create-form')).toBeVisible();

    expect(errors).toEqual([]);
});

test('landing distinguishes previews from activity and explains entry in both languages', async ({ page }) => {
    await gotoTestPage(page, '/');
    for (const lang of ['en', 'ar']) {
        await page.evaluate(value => localStorage.setItem('halastudyLang', value), lang);
        await gotoTestPage(page, '/');
        const phrase = lang === 'en' ? 'A quiet room, ready when you are' : 'غرفة هادئة، جاهزة وقت ما تحتاجها';
        await expect(page.locator('.quiet-pill')).toHaveText(phrase);
        await expect(page.locator('#live-count, #stat-live, .community-stats, .live-dot')).toHaveCount(0);
        await expect(page.getByText('LIVE', { exact: true })).toHaveCount(0);
        const labels = page.locator('.tile-chip');
        expect(await labels.count()).toBeGreaterThan(0);
        for (const label of await labels.all()) {
            await expect(label).toHaveText(lang === 'en' ? 'Room preview' : 'معاينة الغرفة');
        }
        await expect(page.locator('.hero-foot')).toContainText(lang === 'en' ? 'guest' : 'ضيف');
        await expect(page.locator('.hero-foot')).toContainText(lang === 'en' ? 'account' : 'حساب');
        await expect(page.locator('.hero-foot')).toContainText(lang === 'en' ? 'mic off by default' : 'المايك مقفول افتراضيًا');
        await expect(page.locator('.hero-actions .btn-primary')).toHaveCount(1);
        await page.locator('.hero-actions .btn-secondary').click();
        await expect(page).toHaveURL(/\/lobby(?:\.html)?$/);
    }
});

for (const slug of ['best-online-group-study-rooms-saudi', 'study-with-me-online-arabic']) {
    test(`article ${slug} has accurate sharing metadata and usable study links`, async ({ page }) => {
        const errors = collectPageErrors(page);
        await gotoTestPage(page, '/blog');
        await page.locator(`a.post-card[href="/blog/${slug}"]`).click();
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://halastudy.com/blog/${slug}`);
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `https://halastudy.com/blog/${slug}`);
        const og = await page.locator('meta[property="og:image"]').getAttribute('content');
        const dimensions = await page.evaluate(async url => {
            const img = new Image();
            img.src = new URL(url).pathname;
            await img.decode();
            return [img.naturalWidth, img.naturalHeight];
        }, og);
        expect(dimensions).toEqual([1200, 630]);
        const faq = await page.locator('.faq details').evaluateAll(items => items.map(item => ({
            question: item.querySelector('summary').textContent,
            answer: item.querySelector('p').textContent
        })));
        const structured = await page.locator('script[type="application/ld+json"]').evaluateAll(items => items.map(item => JSON.parse(item.textContent)));
        // FAQ rich results were retired by Google (May 2026); the SEO renderer drops
        // the FAQPage block and keeps the visible answers.
        expect(structured.find(item => item['@type'] === 'FAQPage')).toBeUndefined();
        expect(faq.length).toBeGreaterThan(0);
        await expect(page.locator('article')).not.toContainText(/خلفية افتراضية|الخلفية الافتراضية|تمويه/);
        await expect(page.locator('.entry-note')).toContainText('كضيف');
        await expect(page.locator('.entry-note')).toContainText('حساب');
        for (const width of [1440, 360]) {
            await page.setViewportSize({ width, height: 900 });
            const dimensions = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
            expect(dimensions.every(value => value <= width + 1), `${slug} at ${width}px`).toBe(true);
            const smallTargets = await page.locator('.brand, .back-link, .footer a, .faq summary').evaluateAll(items => items.filter(item => {
                const box = item.getBoundingClientRect();
                return box.width < 44 || box.height < 44;
            }).map(item => item.textContent));
            expect(smallTargets).toEqual([]);
        }
        const firstQuestion = page.locator('.faq summary').first();
        await firstQuestion.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.faq details').first()).toHaveAttribute('open', '');
        await expect(page.locator('.faq details p').first()).toBeVisible();
        await page.locator('.readnext').click();
        await expect(page).toHaveURL(new RegExp(`/blog/${slug === 'best-online-group-study-rooms-saudi' ? 'study-with-me-online-arabic' : 'best-online-group-study-rooms-saudi'}$`));
        await page.goBack();
        await page.locator('.article-end .btn-primary').click();
        await expect(page).toHaveURL(/\/open(?:\.html)?$/);
        await expect(page.locator('#create-form')).toBeVisible();
        expect(errors).toEqual([]);
    });
}

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

    // On phones the shared shell moves the language switch into the menu.
    const burger = page.locator('#nav-burger');
    if (await burger.isVisible()) await burger.click();
    await page.locator('.lang-switch button[data-lang-value="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('h1')).toHaveText('Contact Halastudy');
    await expect(page.locator('footer a[href="/contact"]')).toHaveText('Contact');
    await expect(page).toHaveTitle('Contact Us | Halastudy');
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
