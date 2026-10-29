const { test, expect } = require('@playwright/test');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

test('removing a circle member asks for confirmation and cancel keeps the member', async ({ browser }) => {
    test.setTimeout(120000);
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh' } });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
        const owner = await signupUser(server, { displayName: 'Circle owner' });
        await context.addCookies(owner.cookie.split(';').map((part) => {
            const [name, ...value] = part.trim().split('=');
            return { name, value: value.join('='), url: server.baseUrl };
        }));
        const page = await context.newPage();
        await page.addInitScript(() => { if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en'); });
        await page.goto(`${server.baseUrl}/plans`);
        await page.locator('#checkout-start').click();
        await page.locator('[data-checkout-outcome="success"]').click();
        await expect(page.locator('#billing-management')).toBeVisible();
        const token = await page.evaluate(async () => {
            const call = async (url, body) => (await fetch(url, { method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
            const circle = await call('/api/platform/cohorts', { name: 'Remove check' });
            return (await call(`/api/platform/cohorts/${circle.id}/invitations`, {})).token;
        });
        const member = await signupUser(server, { displayName: 'Removable member' });
        const accepted = await server.request('/api/platform/cohorts/accept', { method: 'POST', headers: { Cookie: member.cookie }, body: { token } });
        expect(accepted.status).toBe(200);

        await page.goto(`${server.baseUrl}/supervisor`);
        await page.locator('#circle-list button').click();
        const memberRow = page.locator('#circle-members .row').filter({ hasText: 'Removable member' });
        await expect(memberRow).toBeVisible();
        const dialogs = [];
        page.once('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
        await memberRow.getByRole('button', { name: 'Remove', exact: true }).click();
        await expect.poll(() => dialogs.length).toBe(1);
        expect(dialogs[0]).toContain('Removable member');
        await page.reload();
        await page.locator('#circle-list button').click();
        await expect(page.locator('#circle-members .row').filter({ hasText: 'Removable member' })).toBeVisible();

        page.once('dialog', (dialog) => void dialog.accept());
        await page.locator('#circle-members .row').filter({ hasText: 'Removable member' }).getByRole('button', { name: 'Remove', exact: true }).click();
        await expect(page.locator('#circle-members .row').filter({ hasText: 'Removable member' })).toHaveCount(0);
    } finally {
        await context.close();
        await server.stop();
    }
});
