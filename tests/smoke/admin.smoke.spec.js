const { createTestContext, gotoTestPage, test, expect, waitForTestUrl } = require('../helpers/playwright-test');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');

const ADMIN_PATH = '/ops-smoke-test-1234';
const ADMIN_PASSWORD = 'smoke-admin-password';

let adminIpCounter = 180;

async function createAdminPage(browser) {
    const forwardedIp = `203.0.113.${adminIpCounter}`;
    adminIpCounter += 1;
    const context = await createTestContext(browser, {
        permissions: [],
        extraHTTPHeaders: {
            'x-forwarded-for': forwardedIp
        }
    });
    const page = await context.newPage();
    return { context, page };
}

test('random ops-like paths 404 while the configured portal serves the login card', async ({ browser }) => {
    const operator = await createAdminPage(browser);
    try {
        const wrong = await gotoTestPage(operator.page, '/ops-not-the-real-path');
        expect(wrong.status()).toBe(404);

        const real = await gotoTestPage(operator.page, ADMIN_PATH);
        expect(real.status()).toBe(200);
        await expect(operator.page.locator('#login-view')).toBeVisible();
        await expect(operator.page.locator('#ops-shell')).toBeHidden();
    } finally {
        await operator.context.close();
    }
});

test('admin login rejects a wrong password, then unlocks the overview tiles', async ({ browser }) => {
    const operator = await createAdminPage(browser);
    try {
        await gotoTestPage(operator.page, ADMIN_PATH);

        await operator.page.fill('#admin-password', 'wrong-password');
        await operator.page.click('#login-form button[type="submit"]');
        await expect(operator.page.locator('#login-feedback')).toHaveText('Wrong password.');

        await operator.page.fill('#admin-password', ADMIN_PASSWORD);
        await operator.page.click('#login-form button[type="submit"]');
        await expect(operator.page.locator('#ops-shell')).toBeVisible();
        await expect(operator.page.locator('#overview-tiles .tile')).toHaveCount(6);
        await expect(operator.page.locator('#uptime-chip')).toContainText('up');
    } finally {
        await operator.context.close();
    }
});

test('admin refresh reloads the active panel immediately', async ({ browser }) => {
    const operator = await createAdminPage(browser);
    try {
        const { page } = operator;
        await gotoTestPage(page, ADMIN_PATH);
        await page.fill('#admin-password', ADMIN_PASSWORD);
        await page.click('#login-form button[type="submit"]');
        await expect(page.locator('#ops-shell')).toBeVisible();
        await expect(page.locator('#overview-tiles .tile')).toHaveCount(6);

        const refreshRequest = page.waitForRequest((request) => {
            return request.method() === 'GET'
                && new URL(request.url()).pathname === `${ADMIN_PATH}/api/overview`;
        }, { timeout: 2000 });

        await page.click('#btn-refresh');
        await refreshRequest;
        await expect(page.locator('#btn-refresh')).toBeEnabled();
    } finally {
        await operator.context.close();
    }
});

test('force-close from the console requires typing the room code and kills the live room', async ({ browser, isMobile }) => {
    test.skip(isMobile, 'The dense operations table is intentionally desktop-only.');
    const student = await createAdminPage(browser);
    const operator = await createAdminPage(browser);
    try {
        // A student opens and joins a room.
        await student.page.addInitScript(() => {
            try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}
        });
        await gotoTestPage(student.page, '/open.html');
        await student.page.fill('#room-name', 'Admin Close Target');
        await student.page.click('#create-form button[type="submit"]');
        await expect(student.page.locator('#create-result')).toBeVisible();
        const roomCode = (await student.page.locator('#result-code').textContent()).trim();
        await student.page.click('#btn-enter-room');
        await waitForTestUrl(student.page, '**/index.html**');
        await student.page.fill('#join-name', 'Student');
        await student.page.click('#join-form button[type="submit"]');
        // The overlay animates out via a class, not display:none — assert the class.
        await expect.poll(async () => student.page.locator('#join-overlay').evaluate(
            (element) => element.classList.contains('hidden')
        )).toBe(true);

        // The operator signs in and force-closes it.
        await gotoTestPage(operator.page, ADMIN_PATH);
        await operator.page.fill('#admin-password', ADMIN_PASSWORD);
        await operator.page.click('#login-form button[type="submit"]');
        await expect(operator.page.locator('#ops-shell')).toBeVisible();

        await operator.page.click('#ops-nav a[data-section="rooms"]');
        const row = operator.page.locator('#rooms-tbody tr', { hasText: roomCode });
        await expect(row).toBeVisible();
        await row.locator('button', { hasText: 'Inspect' }).click();
        await expect(operator.page.locator('#room-inspect')).toBeVisible();

        await operator.page.click('#inspect-force-close');
        const dialog = operator.page.locator('#confirm-dialog');
        await expect(dialog).toBeVisible();
        const confirmBtn = dialog.locator('#confirm-yes');
        await expect(confirmBtn).toBeDisabled();
        await dialog.locator('#confirm-input').fill(roomCode);
        // The typed code alone is not enough: a reason is required too.
        await expect(confirmBtn).toBeDisabled();
        await dialog.locator('#confirm-reason').fill('Smoke test cleanup');
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();

        // The student is told and bounced; the room is gone from the API.
        await expect(student.page.locator('.hala-toast')).toContainText('closed by a moderator');
        const lookup = await operator.page.request.get(`/api/rooms/${roomCode}`);
        expect(lookup.status()).toBe(404);
    } finally {
        await student.context.close();
        await operator.context.close();
    }
});

test('kicking from the reports tab asks for a reason and disconnects the reported participant', async ({ browser, isMobile, baseURL }) => {
    test.skip(isMobile, 'The dense operations table is intentionally desktop-only.');
    const reporter = await connectSocket(baseURL, { clientId: 'smoke-reporter' });
    const target = await connectSocket(baseURL, { clientId: 'smoke-reported' });
    const operator = await createAdminPage(browser);
    try {
        const created = await emitAck(reporter, 'create-room', { roomName: 'Report Kick Room' });
        const roomId = created.room.roomId;
        await emitAck(reporter, 'join-room', { roomId, username: 'Reporter', clientId: 'smoke-reporter' });
        await emitAck(target, 'join-room', { roomId, username: 'Reported Person', clientId: 'smoke-reported' });
        const report = await emitAck(reporter, 'report-user', { targetId: target.id, reason: 'harassment', detail: 'smoke' });
        expect(report.ok).toBe(true);
        const kicked = new Promise((resolve) => { target.once('kicked', resolve); });

        await gotoTestPage(operator.page, ADMIN_PATH);
        await operator.page.fill('#admin-password', ADMIN_PASSWORD);
        await operator.page.click('#login-form button[type="submit"]');
        await expect(operator.page.locator('#ops-shell')).toBeVisible();
        await operator.page.click('#ops-nav a[data-section="reports"]');
        const row = operator.page.locator('#reports-tbody tr', { hasText: 'Reported Person' });
        await row.locator('button', { hasText: 'Kick' }).click();

        const dialog = operator.page.locator('#confirm-dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('#confirm-body')).toContainText('harassment');
        const confirmBtn = dialog.locator('#confirm-yes');
        await expect(confirmBtn).toBeDisabled();
        await dialog.locator('#confirm-reason').fill('Confirmed harassment report');
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();

        await expect(kicked).resolves.toBeTruthy();
    } finally {
        await closeSocket(reporter);
        await closeSocket(target);
        await operator.context.close();
    }
});

async function signInOperator(page) {
    await page.fill('#admin-password', ADMIN_PASSWORD);
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#ops-shell')).toBeVisible();
}

test('the Ops shell deep-links sections and keeps the heading, nav and title in step', async ({ browser, isMobile }) => {
    const operator = await createAdminPage(browser);
    try {
        const { page } = operator;
        await gotoTestPage(page, `${ADMIN_PATH}#users`);
        await signInOperator(page);
        await expect(page.locator('#ops-title')).toHaveText('Users');
        await expect(page.locator('#panel-users')).toBeVisible();
        await expect(page.locator('#panel-overview')).toBeHidden();
        await expect(page).toHaveTitle('Users — Halastudy Ops');

        if (isMobile) {
            await expect(page.locator('#ops-nav')).toBeHidden();
            await page.selectOption('#ops-section-select', 'system');
        } else {
            await expect(page.locator('#ops-nav a[aria-current="page"]')).toHaveText('Users');
            await page.click('#ops-nav a[data-section="system"]');
        }
        await expect(page).toHaveURL(/#system$/);
        await expect(page.locator('#ops-title')).toHaveText('System');
        // Video and announcements now live inside System.
        await expect(page.locator('#kill-switch-toggle')).toBeVisible();
        await expect(page.locator('#announce-publish')).toBeVisible();
        await expect(page.locator('#ops-title')).toBeFocused();
    } finally {
        await operator.context.close();
    }
});

test('the Ops shell switches to Arabic right-to-left and remembers it after a reload', async ({ browser }) => {
    const operator = await createAdminPage(browser);
    try {
        const { page } = operator;
        await gotoTestPage(page, ADMIN_PATH);
        await page.locator('#login-view [data-lang-switch] button[data-lang="ar"]').click();
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.locator('#login-view [data-i18n="signIn"]')).toHaveText('تسجيل الدخول');
        await signInOperator(page);
        await expect(page.locator('#ops-title')).toHaveText('نظرة عامة');
        await expect(page.locator('#ops-section-select option[value="reports"]')).toHaveText('البلاغات والدعم');

        await page.reload();
        await expect(page.locator('#ops-shell')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
        await expect(page.locator('#ops-title')).toHaveText('نظرة عامة');
        // The brand stays Latin and the sidebar sits on the inline-start (right) side.
        await expect(page.locator('.brand [lang="en"]')).toHaveText('Halastudy');
        const sidebar = await page.locator('.ops-sidebar').boundingBox();
        const main = await page.locator('#main').boundingBox();
        const viewport = page.viewportSize();
        if (sidebar && main && viewport && viewport.width > 850) {
            expect(sidebar.x).toBeGreaterThan(main.x);
        }

        await page.locator('#ops-shell [data-lang-switch] button[data-lang="en"]').click();
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
        await expect(page.locator('#ops-title')).toHaveText('Overview');
    } finally {
        await operator.context.close();
    }
});

test('the skip link focuses the content without leaving the current section', async ({ browser }) => {
    const operator = await createAdminPage(browser);
    try {
        const { page } = operator;
        await gotoTestPage(page, `${ADMIN_PATH}#rooms`);
        await signInOperator(page);
        await expect(page.locator('#ops-title')).toHaveText('Rooms');
        await page.locator('.skip-link').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#main')).toBeFocused();
        await expect(page.locator('#ops-title')).toHaveText('Rooms');
        await expect(page.locator('#panel-rooms')).toBeVisible();
        await expect(page).toHaveURL(/#rooms$/);
        // A stray non-section fragment does not reset the section either.
        await page.evaluate(() => { window.location.hash = 'main'; });
        await expect(page.locator('#panel-rooms')).toBeVisible();
        await expect(page.locator('#ops-title')).toHaveText('Rooms');
    } finally {
        await operator.context.close();
    }
});
