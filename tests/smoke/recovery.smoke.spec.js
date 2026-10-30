const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

test('recovery journey works in Arabic and English, clears the token URL and announces errors', async ({ browser }, testInfo) => {
    const server = await startServer({ env: { AUTH_MAIL_MODE: 'local' } });
    const context = await createTestContext(browser, { viewport: { width: 390, height: 844 } });
    await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
        const owner = await signupUser(server);
        await gotoTestPage(page, `${server.baseUrl}/recover`);
        await expect(page.locator('#recovery-form')).toBeVisible();
        await page.locator('#recovery-email').fill(owner.user.email);
        await page.locator('#recovery-submit').click();
        await expect(page.locator('#recovery-status')).toContainText('إذا كان الحساب');
        const folder = `${server.userStateFile}.mail`;
        await expect.poll(async () => (await fs.readdir(folder).catch(() => [])).length).toBe(1);
        const [name] = await fs.readdir(folder);
        const mail = JSON.parse(await fs.readFile(path.join(folder, name), 'utf8'));
        await gotoTestPage(page, `${server.baseUrl}/recover${new URL(mail.url).hash}`);
        await expect(page.locator('#password-field')).toBeVisible();
        expect(new URL(page.url()).hash).toBe('');
        await page.screenshot({ path: testInfo.outputPath('recovery-ar-mobile.png'), fullPage: true });
        await page.locator('[data-lang-value="en"]').click();
        await page.locator('#recovery-password').fill('browser-recovery-123');
        await page.locator('#recovery-confirm').fill('different-password');
        await page.locator('#recovery-submit').click();
        await expect(page.locator('#recovery-status')).toContainText('do not match');
        await page.locator('#recovery-confirm').fill('browser-recovery-123');
        const accessibility = await new AxeBuilder({ page }).analyze();
        expect(accessibility.violations).toEqual([]);
        await page.locator('#theme-toggle').click();
        await page.waitForTimeout(500);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath('recovery-en-dark-mobile.png'), fullPage: true });
        await page.locator('#recovery-submit').click();
        await expect(page.locator('#recovery-status')).toContainText('Updated');
        expect(errors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});
