const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(path.join(process.cwd(), 'node_modules/playwright'));
const AxeBuilder = require(path.join(process.cwd(), 'node_modules/@axe-core/playwright')).default;
(async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:3542/account');
        await page.evaluate(() => document.fonts.ready);
        const findings = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
        const result = { findings: findings.violations, fonts: await page.evaluate(() => [...document.fonts].map(font => ({ family: font.family, weight: font.weight, status: font.status }))) };
        fs.writeFileSync(path.join(process.env.REFINEMENT_OUTPUT, 'evidence/brand-before.json'), JSON.stringify(result, null, 2));
        await page.screenshot({ path: path.join(process.env.REFINEMENT_OUTPUT, 'screenshots/before/account-ar-light-1440.png'), fullPage: true });
        assert.ok(result.fonts.some(font => font.status === 'loaded'));
        assert.ok(!result.fonts.some(font => font.status === 'error'));
        assert.equal(findings.violations.length, 1);
        console.log('Real-font V9-01 reproduced in baseline source.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
