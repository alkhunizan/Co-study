const { createTestContext, gotoTestPage, test, expect, waitForTestUrl } = require('../helpers/playwright-test');

let accountIpCounter = 120;

async function createAccountPage(browser) {
    const forwardedIp = `203.0.113.${accountIpCounter}`;
    accountIpCounter += 1;
    const context = await createTestContext(browser, {
        permissions: [],
        extraHTTPHeaders: {
            'x-forwarded-for': forwardedIp
        }
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
        try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}
    });
    return { context, page };
}

function uniqueEmail(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

async function signupThroughUi(page, options = /** @type {{ name?: string, email: string, password?: string }} */ ({})) {
    const { name = 'Smokey', email, password = 'smoke-pass-123' } = options;
    await gotoTestPage(page, '/account.html');
    await page.click('#tab-signup');
    await page.fill('#signup-nickname', name);
    await page.fill('#signup-email', email);
    await page.fill('#signup-password', password);
    await page.click('#signup-form button[type="submit"]');
}

test('signup through the UI lands signed in: avatar chip replaces the topbar link on /open.html', async ({ browser }) => {
    const visitor = await createAccountPage(browser);
    try {
        const email = uniqueEmail('chip');
        await signupThroughUi(visitor.page, { email });
        await waitForTestUrl(visitor.page, '**/open.html**');

        // The quiet sign-in link is swapped for the avatar chip.
        await expect(visitor.page.locator('.hala-chip__avatar')).toBeVisible();
        await expect(visitor.page.locator('.hala-chip__avatar')).toHaveText('S');
        await expect(visitor.page.locator('#auth-entry')).toHaveCount(0);
    } finally {
        await visitor.context.close();
    }
});

test('wrong sign-in password shows inline bilingual feedback, not a redirect', async ({ browser }) => {
    const visitor = await createAccountPage(browser);
    try {
        const email = uniqueEmail('wrongpw');
        await signupThroughUi(visitor.page, { email });
        await waitForTestUrl(visitor.page, '**/open.html**');

        // Sign out, then fail a sign-in.
        await gotoTestPage(visitor.page, '/account.html');
        await visitor.page.click('#btn-signout');
        await waitForTestUrl(visitor.page, '**/');
        await gotoTestPage(visitor.page, '/account.html');
        await visitor.page.fill('#signin-email', email);
        await visitor.page.fill('#signin-password', 'not-the-password');
        await visitor.page.click('#signin-form button[type="submit"]');
        await expect(visitor.page.locator('#signin-feedback')).toHaveText('Wrong email or password.');
        await expect(visitor.page).toHaveURL(/account\.html/);
    } finally {
        await visitor.context.close();
    }
});

test('schedule gate blocks guests and unlocks after sign-in; My Rooms lists created rooms', async ({ browser }) => {
    const guest = await createAccountPage(browser);
    try {
        await gotoTestPage(guest.page, '/open.html');
        await guest.page.check('#enable-schedule');
        await expect(guest.page.locator('#schedule-signin-gate')).toBeVisible();
        await expect(guest.page.locator('#schedule-fields-inner')).toBeHidden();

        // Sign up, come back via the gate's deep link semantics.
        const email = uniqueEmail('gate');
        await signupThroughUi(guest.page, { name: 'Gated', email });
        await waitForTestUrl(guest.page, '**/open.html**');
        await gotoTestPage(guest.page, '/open.html?schedule=1');
        await expect(guest.page.locator('#schedule-fields-inner')).toBeVisible();
        await expect(guest.page.locator('#schedule-signin-gate')).toBeHidden();
        await expect(guest.page.locator('#enable-schedule')).toBeChecked();

        // Create an instant room; it must show up in My Rooms on return.
        await guest.page.fill('#room-name', 'My Rooms Smoke');
        await guest.page.uncheck('#enable-schedule');
        await guest.page.click('#create-form button[type="submit"]');
        await expect(guest.page.locator('#create-result')).toBeVisible();
        const roomCode = (await guest.page.locator('#result-code').textContent()).trim();

        await gotoTestPage(guest.page, '/open.html');
        await expect(guest.page.locator('#my-rooms-card')).toBeVisible();
        await expect(guest.page.locator('.my-room-code').first()).toHaveText(roomCode);

        // One-click rejoin lands in the room with the reserved nickname prefilled.
        await guest.page.click('.my-room-row .btn');
        await waitForTestUrl(guest.page, '**/study**');
        await expect(guest.page.locator('#join-name')).toHaveValue('Gated');
        await expect(guest.page.locator('#join-name-reserved')).toBeVisible();
    } finally {
        await guest.context.close();
    }
});

test('delete-my-data flow: typed confirmation, then the account is really gone', async ({ browser }) => {
    const visitor = await createAccountPage(browser);
    try {
        const email = uniqueEmail('delete');
        const password = 'delete-me-123';
        await signupThroughUi(visitor.page, { name: 'Deleter', email, password });
        await waitForTestUrl(visitor.page, '**/open.html**');

        await gotoTestPage(visitor.page, '/account.html');
        await expect(visitor.page.locator('#account-view')).toBeVisible();
        await visitor.page.fill('#delete-password', password);
        await visitor.page.click('#btn-delete');

        // Typed confirmation: the confirm button stays disabled until the
        // nickname is typed exactly.
        const dialog = visitor.page.locator('dialog.hala-modal');
        await expect(dialog).toBeVisible();
        const confirmBtn = dialog.locator('.hala-modal__btn--danger');
        await expect(confirmBtn).toBeDisabled();
        await dialog.locator('input').fill('Deleter');
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();
        await waitForTestUrl(visitor.page, '**/');

        // Signing in with the deleted credentials fails.
        await gotoTestPage(visitor.page, '/account.html');
        await visitor.page.fill('#signin-email', email);
        await visitor.page.fill('#signin-password', password);
        await visitor.page.click('#signin-form button[type="submit"]');
        await expect(visitor.page.locator('#signin-feedback')).toHaveText('Wrong email or password.');
    } finally {
        await visitor.context.close();
    }
});

test('Google-only account can reauthenticate and finish deletion without a password', async ({ browser }) => {
    const visitor = await createAccountPage(browser);
    let deletionRequests = 0;
    try {
        await visitor.page.route('**/api/runtime-config', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ googleAuthEnabled: true })
            });
        });
        await visitor.page.route('**/api/auth/me', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    user: {
                        id: 'google-only-user',
                        email: 'google-only@example.com',
                        displayName: 'Google User',
                        avatarColor: 'amber',
                        bio: '',
                        authMethods: { password: false, google: true },
                        streak: { current: 0, best: 0 }
                    }
                })
            });
        });
        await visitor.page.route('**/api/me', async (route) => {
            if (route.request().method() !== 'DELETE') return route.continue();
            deletionRequests += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true })
            });
        });

        await gotoTestPage(visitor.page, '/account');
        await expect(visitor.page.locator('#account-view')).toBeVisible();
        await expect(visitor.page.locator('#delete-password-group')).toBeHidden();
        await expect(visitor.page.locator('#btn-delete')).toBeHidden();
        await expect(visitor.page.locator('#btn-delete-google')).toBeVisible();

        await visitor.page.click('#btn-delete-google');
        const dialog = visitor.page.locator('dialog.hala-modal');
        await dialog.locator('input').fill('Google User');
        await dialog.locator('.hala-modal__btn--danger').click();
        await waitForTestUrl(visitor.page, /\/auth\/google\?intent=reauth_delete/);

        // Simulate the verified provider callback. The session-scoped pending
        // marker causes exactly one credential-less DELETE; the HttpOnly grant
        // itself is exercised by the server integration tests.
        await gotoTestPage(visitor.page, '/account?auth=delete_granted');
        await expect.poll(() => deletionRequests).toBe(1);
    } finally {
        await visitor.context.close();
    }
});

test('guest focus-sync nudge appears after a focus session and dismissal sticks across reloads', async ({ browser }) => {
    const guest = await createAccountPage(browser);
    try {
        await gotoTestPage(guest.page, '/study');
        // The full-screen join overlay would intercept clicks on the hint;
        // this smoke tests the nudge mechanics, not the join flow.
        await guest.page.evaluate(() => {
            document.getElementById('join-overlay').classList.add('hidden');
        });
        // Drive the completion hook directly — waiting out a real Pomodoro
        // is not smoke-test material.
        await guest.page.evaluate(() => {
            // @ts-expect-error page-scope function
            onFocusSessionComplete(25);
        });
        await expect(guest.page.locator('#focus-sync-hint')).toBeVisible();
        await expect(guest.page.locator('#focus-sync-link')).toHaveAttribute('href', /account\.html\?signup=1&next=/);

        await guest.page.click('#focus-sync-dismiss');
        await expect(guest.page.locator('#focus-sync-hint')).toBeHidden();

        await guest.page.reload();
        await guest.page.evaluate(() => {
            // @ts-expect-error page-scope function
            onFocusSessionComplete(25);
        });
        await expect(guest.page.locator('#focus-sync-hint')).toBeHidden();
    } finally {
        await guest.context.close();
    }
});

test('signed-in focus completions send a distinct UUID for each completed timer', async ({ browser }) => {
    const member = await createAccountPage(browser);
    const completionRequests = [];

    try {
        await signupThroughUi(member.page, {
            name: 'Focused',
            email: uniqueEmail('focus-completion')
        });
        await waitForTestUrl(member.page, '**/open.html**');
        await member.page.route('**/api/me/focus-session', async (route) => {
            completionRequests.push(route.request().postDataJSON());
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, streak: { current: 1 } })
            });
        });

        await gotoTestPage(member.page, '/study');
        await expect(member.page.locator('#join-name-reserved')).toBeVisible();
        await member.page.evaluate(() => {
            const completeFocusSession = (/** @type {any} */ (window)).onFocusSessionComplete;
            completeFocusSession(25);
            completeFocusSession(50);
        });
        await expect.poll(() => completionRequests.length).toBe(2);

        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(completionRequests.map((request) => request.minutes)).toEqual([25, 50]);
        expect(completionRequests[0].completionId).toMatch(uuidPattern);
        expect(completionRequests[1].completionId).toMatch(uuidPattern);
        expect(completionRequests[0].completionId).not.toBe(completionRequests[1].completionId);
    } finally {
        await member.context.close();
    }
});

test('404 page is bilingual and the language toggle works', async ({ browser }) => {
    const visitor = await createAccountPage(browser);
    try {
        const response = await gotoTestPage(visitor.page, '/no-such-page-anywhere');
        expect(response.status()).toBe(404);
        await expect(visitor.page.locator('h1')).toHaveText('Page not found');
        await visitor.page.click('[data-lang-value="ar"]');
        await expect(visitor.page.locator('h1')).toHaveText('الصفحة غير موجودة');
        await expect(visitor.page.locator('html')).toHaveAttribute('dir', 'rtl');
    } finally {
        await visitor.context.close();
    }
});

test('toast is announced politely and auto-dismisses', async ({ browser }) => {
    const visitor = await createAccountPage(browser);
    try {
        await gotoTestPage(visitor.page, '/open.html');
        await visitor.page.evaluate(() => {
            (/** @type {any} */ (window)).HalaUI.toast('Smoke toast', { duration: 1500 });
        });
        const toast = visitor.page.locator('.hala-toast');
        await expect(toast).toBeVisible();
        await expect(toast).toHaveAttribute('role', 'status');
        await expect(toast).toHaveAttribute('aria-live', 'polite');
        await expect(toast).toHaveCount(0, { timeout: 4000 });
    } finally {
        await visitor.context.close();
    }
});
