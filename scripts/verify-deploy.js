const http = require('http');
const https = require('https');

function requestJson(targetUrl, timeoutMs = 10000) {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const allowSelfSigned = url.protocol === 'https:' && ['127.0.0.1', 'localhost'].includes(url.hostname);

    return new Promise((resolve, reject) => {
        const req = client.request(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            rejectUnauthorized: !allowSelfSigned
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                let body = null;
                try {
                    body = raw ? JSON.parse(raw) : null;
                } catch (error) {
                    reject(new Error(`Invalid JSON from ${url.pathname}: ${error.message}`));
                    return;
                }

                resolve({
                    status: res.statusCode || 0,
                    body
                });
            });
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Timed out fetching ${targetUrl}`));
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    const baseUrlArg = process.argv[2];
    if (!baseUrlArg) {
        throw new Error('Usage: npm run verify:deploy -- <baseUrl>');
    }

    const baseUrl = new URL(baseUrlArg);
    const health = await requestJson(new URL('/api/health', baseUrl));
    if (health.status !== 200 || !health.body || health.body.status !== 'ok') {
        throw new Error(`Health check failed with status ${health.status}.`);
    }

    const ready = await requestJson(new URL('/api/ready', baseUrl));
    if (ready.status !== 200 || !ready.body || ready.body.status !== 'ready') {
        throw new Error(`Readiness check failed with status ${ready.status}.`);
    }

    console.log(`Health OK: ${health.body.mode}`);
    console.log(`Readiness OK: ${baseUrl.origin}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
