const { defineConfig } = require('@playwright/test');

const { resetStateFile, SMOKE_PORT, SMOKE_ROOM_STATE_FILE } = require('./tests/helpers/test-env');

resetStateFile(SMOKE_ROOM_STATE_FILE);

module.exports = defineConfig({
    testDir: './tests/smoke',
    fullyParallel: false,
    globalSetup: require.resolve('./tests/helpers/playwright-global-setup'),
    globalTeardown: require.resolve('./tests/helpers/playwright-global-teardown'),
    workers: 1,
    timeout: 45000,
    expect: {
        timeout: 10000
    },
    reporter: process.env.CI
        ? [
            ['list'],
            ['html', { open: 'never', outputFolder: 'playwright-report' }]
        ]
        : [['list']],
    outputDir: 'test-results',
    use: {
        baseURL: `http://127.0.0.1:${SMOKE_PORT}`,
        browserName: 'chromium',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'retain-on-failure'
    }
});
