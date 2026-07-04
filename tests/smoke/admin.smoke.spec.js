const { test, expect } = require('@playwright/test');

const ADMIN_PATH = '/ops-smoke-test-1234';
const ADMIN_PASSWORD = 'smoke-admin-password';

let adminIpCounter = 180;

async function createAdminPage(browser) {
    const forwardedIp = `203.0.113.${adminIpCounter}`;
    adminIpCounter += 1;
    const context = await browser.newContext({
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
        const wrong = await operator.page.goto('/ops-not-the-real-path');
        expect(wrong.status()).toBe(404);

        const real = await operator.page.goto(ADMIN_PATH);
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
        await operator.page.goto(ADMIN_PATH);

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

test('force-close from the console requires typing the room code and kills the live room', async ({ browser }) => {
    const student = await createAdminPage(browser);
    const operator = await createAdminPage(browser);
    try {
        // A student opens and joins a room.
        await student.page.addInitScript(() => {
            try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}
        });
        await student.page.goto('/open.html');
        await student.page.fill('#room-name', 'Admin Close Target');
        await student.page.click('#create-form button[type="submit"]');
        await expect(student.page.locator('#create-result')).toBeVisible();
        const roomCode = (await student.page.locator('#result-code').textContent()).trim();
        await student.page.click('#btn-enter-room');
        await student.page.waitForURL('**/index.html**');
        await student.page.fill('#join-name', 'Student');
        await student.page.click('#join-form button[type="submit"]');
        // The overlay animates out via a class, not display:none — assert the class.
        await expect.poll(async () => student.page.locator('#join-overlay').evaluate(
            (element) => element.classList.contains('hidden')
        )).toBe(true);

        // The operator signs in and force-closes it.
        await operator.page.goto(ADMIN_PATH);
        await operator.page.fill('#admin-password', ADMIN_PASSWORD);
        await operator.page.click('#login-form button[type="submit"]');
        await expect(operator.page.locator('#ops-shell')).toBeVisible();

        await operator.page.click('#tabs button[data-panel="rooms"]');
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
