// Audit-only containment: includes browsers launched directly by individual tests.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.join(__dirname, 'candidate/node_modules/playwright'));
const launch = chromium.launch.bind(chromium);
chromium.launch = async (options = {}) => {
    const browser = await launch({ ...options, args: [...(options.args || []),
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
        const context = await newContext(...args);
        await context.route('**/*', (route) => {
            const url = new URL(route.request().url());
            if (!['http:', 'https:'].includes(url.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
                return route.continue();
            }
            if (process.env.VIBER_EVIDENCE) fs.appendFileSync(path.join(process.env.VIBER_EVIDENCE, 'blocked-browser-hosts.ndjson'),
                JSON.stringify({ pid: process.pid, hostname: url.hostname }) + '\n');
            return route.abort();
        });
        return context;
    };
    return browser;
};
