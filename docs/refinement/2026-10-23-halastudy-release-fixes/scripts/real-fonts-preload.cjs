// One persistent budget for this execution, shared by font and live checks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.REFINEMENT_OUTPUT || path.resolve(__dirname, '..');
const cache = path.join(root, 'evidence/font-cache');
const ledger = path.join(root, 'evidence/external-requests.ndjson');
const hits = path.join(root, 'evidence/cache-events.ndjson');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const append = (file, data) => fs.appendFileSync(file, JSON.stringify(data) + '\n');
const entries = () => fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
fs.mkdirSync(cache, { recursive: true });
const allowed = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'halastudy.com', 'www.halastudy.com']);
const imported = path.join(root, 'evidence/font-cache-import.json');
if (!fs.existsSync(imported)) {
    const previous = path.resolve(root, '../../viber/2026-10-23/evidence/font-cache');
    const records = [];
    for (const name of fs.existsSync(previous) ? fs.readdirSync(previous).filter(name => name.endsWith('.json')) : []) {
        const meta = JSON.parse(fs.readFileSync(path.join(previous, name), 'utf8'));
        const url = new URL(meta.url);
        const key = sha(meta.url);
        const bytes = fs.readFileSync(path.join(previous, name.replace('.json', '.bin')));
        const type = meta.headers['content-type'] || '';
        if (name !== key + '.json' || meta.status !== 200 || !allowed.has(url.hostname)
            || !/text\/css|font\/|application\/.*font/.test(type) || !bytes.length) throw new Error('INVALID_FONT_CACHE');
        const item = { ...meta, sha256: sha(bytes), bytes: bytes.length, provenance: 'previous counted anonymous GET' };
        fs.writeFileSync(path.join(cache, key + '.bin'), bytes);
        fs.writeFileSync(path.join(cache, key + '.json'), JSON.stringify(item));
        records.push({ url: meta.url, status: 200, contentType: type, sha256: item.sha256, bytes: bytes.length });
    }
    fs.writeFileSync(imported, JSON.stringify(records, null, 2));
}
const inFlight = new Map();
async function resource(url, kind, requestHeaders = {}, redirects = 0) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !allowed.has(parsed.hostname) || parsed.username || parsed.password) throw new Error('UNAPPROVED_EXTERNAL_URL');
    const key = sha(url), metaFile = path.join(cache, key + '.json'), bodyFile = path.join(cache, key + '.bin');
    if (kind === 'font' && fs.existsSync(metaFile)) {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')), body = fs.readFileSync(bodyFile);
        if (meta.url !== url || meta.status !== 200 || meta.sha256 !== sha(body)) throw new Error('FONT_CACHE_CORRUPT');
        append(hits, { event: 'cache-hit', url, sha256: meta.sha256 });
        return { status: meta.status, headers: meta.headers, body };
    }
    if (inFlight.has(url)) return inFlight.get(url);
    const pending = (async () => {
        const requests = entries().filter(item => item.event === 'request');
        if (requests.length >= 30 || (kind === 'font' && requests.filter(item => item.kind === 'font').length >= 22)) {
            append(hits, { event: 'cap-blocked', kind, url });
            throw new Error('EXTERNAL_REQUEST_CAP');
        }
        const number = requests.length + 1;
        append(ledger, { event: 'request', number, kind, method: 'GET', url, at: new Date().toISOString() });
        try {
            const headers = {};
            for (const name of ['user-agent', 'accept', 'accept-language']) if (requestHeaders[name]) headers[name] = requestHeaders[name];
            const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(20000) });
            const body = Buffer.from(await response.arrayBuffer());
            const publicHeaders = Object.fromEntries(response.headers);
            append(ledger, { event: 'response', number, status: response.status, bytes: body.length, sha256: sha(body), contentType: publicHeaders['content-type'] });
            if (response.status >= 300 && response.status < 400) {
                if (redirects >= 3 || !response.headers.get('location')) throw new Error('EXTERNAL_REDIRECT_LIMIT');
                return resource(new URL(response.headers.get('location'), url).href, kind, requestHeaders, redirects + 1);
            }
            if (kind === 'font') {
                if (response.status !== 200 || !/text\/css|font\/|application\/.*font/.test(publicHeaders['content-type'] || '') || !body.length) throw new Error('FONT_RESPONSE_INVALID');
                fs.writeFileSync(bodyFile, body);
                fs.writeFileSync(metaFile, JSON.stringify({ url, status: response.status, headers: publicHeaders, sha256: sha(body), bytes: body.length }));
            }
            return { status: response.status, headers: publicHeaders, body };
        } catch (error) {
            append(ledger, { event: 'failure', number, error: error.name });
            throw error;
        }
    })();
    inFlight.set(url, pending);
    try { return await pending; } finally { inFlight.delete(url); }
}
const { chromium } = require(path.join(process.cwd(), 'node_modules/playwright'));
const launch = chromium.launch.bind(chromium);
chromium.launch = async options => {
    const browser = await launch(options), newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
        const context = await newContext(...args);
        await context.route('**/*', async route => {
            const req = route.request(), url = new URL(req.url());
            if (!['http:', 'https:'].includes(url.protocol) || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.continue();
            if (req.method() !== 'GET' || !['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
                append(hits, { event: 'unapproved-blocked', method: req.method(), host: url.hostname });
                return route.abort();
            }
            try {
                const response = await resource(url.href, 'font', req.headers());
                const headers = { ...response.headers };
                delete headers['content-encoding']; delete headers['content-length'];
                return route.fulfill({ ...response, headers });
            } catch { return route.abort(); }
        });
        return context;
    };
    return browser;
};
module.exports = { resource };
