// Local verification only. Also contains browsers launched directly by tests.
const path = require('node:path');
const fs = require('node:fs');
// Count real local requests without recording cookies, bodies or URL query tokens.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
    const exported = originalLoad.call(this, name, parent, isMain);
    if (/co-study-server(?:\.js)?$/.test(name) && exported.createCoStudyServer && !exported.viberObserved) {
        exported.viberObserved = true;
        const factory = exported.createCoStudyServer;
        exported.createCoStudyServer = function (...args) {
            const instance = factory.apply(this, args);
            const record = (file, entry) => {
                if (process.env.VIBER_EVIDENCE) fs.appendFileSync(path.join(process.env.VIBER_EVIDENCE, file), JSON.stringify(entry) + '\n');
            };
            instance.server.prependListener('request', (req, res) => {
                const method = req.method;
                const canonicalPath = new URL(req.url, 'http://127.0.0.1').pathname;
                res.once('finish', () => record('local-http.ndjson', {
                    method, path: canonicalPath, status: res.statusCode
                }));
            });
            instance.io.on('connection', socket => socket.onAny(event => record('local-socket.ndjson', {event})));
            return instance;
        };
    }
    return exported;
};
const { chromium } = require(path.join(process.cwd(), 'node_modules/playwright'));
const launch = chromium.launch.bind(chromium);
chromium.launch = async (options = {}) => {
    const browser = await launch({ ...options, args: [...(options.args || []),
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
        const context = await newContext(...args);
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (!['http:', 'https:'].includes(url.protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue();
            if (process.env.VIBER_EVIDENCE) fs.appendFileSync(path.join(process.env.VIBER_EVIDENCE, 'blocked-browser-hosts.ndjson'),
                JSON.stringify({ pid: process.pid, hostname: url.hostname }) + '\n');
            return route.abort();
        });
        return context;
    };
    return browser;
};

