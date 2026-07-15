const http = require('node:http');
const https = require('node:https');
const { version: DEFAULT_EXPECTED_VERSION } = require('../package.json');

const HSTS_MIN_MAX_AGE = 31_536_000;

function isLoopbackHost(hostname) {
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(hostname).toLowerCase());
}

function validateDeploymentUrl(value) {
    const baseUrl = new URL(value);
    if (!['http:', 'https:'].includes(baseUrl.protocol)) {
        throw new Error('Deployment URL must use HTTP or HTTPS.');
    }
    if (baseUrl.protocol !== 'https:' && !isLoopbackHost(baseUrl.hostname)) {
        throw new Error('Production deployment verification requires HTTPS.');
    }
    return baseUrl;
}

function requestText(targetUrl, timeoutMs = 10_000) {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const allowSelfSigned = url.protocol === 'https:' && isLoopbackHost(url.hostname);

    return new Promise((resolve, reject) => {
        const req = client.request(url, {
            method: 'GET',
            headers: { Accept: '*/*' },
            rejectUnauthorized: !allowSelfSigned
        }, (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                text += chunk;
            });
            res.on('end', () => {
                resolve({
                    status: res.statusCode || 0,
                    headers: res.headers,
                    text
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

async function requestJson(targetUrl, timeoutMs) {
    const response = await requestText(targetUrl, timeoutMs);
    let body = null;
    try {
        body = response.text ? JSON.parse(response.text) : null;
    } catch (error) {
        throw new Error(`Invalid JSON from ${new URL(targetUrl).pathname}: ${error.message}`);
    }
    return { ...response, body };
}

function assertHsts(headers) {
    const value = String(headers['strict-transport-security'] || '');
    const maxAge = Number.parseInt(value.match(/(?:^|;)\s*max-age=(\d+)/i)?.[1] || '', 10);
    if (!Number.isInteger(maxAge) || maxAge < HSTS_MIN_MAX_AGE) {
        throw new Error(`HSTS header missing or too short (requires max-age >= ${HSTS_MIN_MAX_AGE}).`);
    }
}

async function verifyDeployment(baseUrlValue, options = {}) {
    const baseUrl = validateDeploymentUrl(baseUrlValue);
    const expectedVersion = options.expectedVersion || DEFAULT_EXPECTED_VERSION;
    const requireHsts = options.requireHsts ?? (baseUrl.protocol === 'https:' && !isLoopbackHost(baseUrl.hostname));
    const timeoutMs = options.timeoutMs || 10_000;

    const health = await requestJson(new URL('/api/health', baseUrl), timeoutMs);
    if (health.status !== 200 || health.body?.status !== 'ok') {
        throw new Error(`Health check failed with status ${health.status}.`);
    }
    if (health.body.version !== expectedVersion) {
        throw new Error(`Build version mismatch: expected ${expectedVersion}, received ${health.body.version || 'missing'}.`);
    }
    if (requireHsts) assertHsts(health.headers);

    const ready = await requestJson(new URL('/api/ready', baseUrl), timeoutMs);
    if (ready.status !== 200 || ready.body?.status !== 'ready') {
        throw new Error(`Readiness check failed with status ${ready.status}.`);
    }
    const readinessChecks = ready.body.checks && typeof ready.body.checks === 'object'
        ? ready.body.checks
        : {};
    const failedChecks = Object.entries(readinessChecks)
        .filter(([, passed]) => passed !== true)
        .map(([name]) => name);
    if (Object.keys(readinessChecks).length === 0 || failedChecks.length > 0) {
        throw new Error(`Readiness checks failed: ${failedChecks.join(', ') || 'missing checks'}.`);
    }

    const metrics = await requestJson(new URL('/api/metrics', baseUrl), timeoutMs);
    if (metrics.status !== 200 || typeof metrics.body?.roomCount !== 'number') {
        throw new Error(`Metrics check failed with status ${metrics.status}.`);
    }

    const runtime = await requestJson(new URL('/api/runtime-config', baseUrl), timeoutMs);
    if (runtime.status !== 200 || typeof runtime.body?.videoProvider !== 'string') {
        throw new Error(`Runtime config check failed with status ${runtime.status}.`);
    }
    for (const sensitiveKey of ['accountId', 'appId', 'apiToken', 'serviceKey', 'clientSecret']) {
        if (Object.hasOwn(runtime.body, sensitiveKey)) {
            throw new Error(`Runtime config exposed server-only field: ${sensitiveKey}.`);
        }
    }

    const manifest = await requestJson(new URL('/manifest.webmanifest', baseUrl), timeoutMs);
    const manifestType = String(manifest.headers['content-type'] || '');
    if (manifest.status !== 200 || !manifestType.includes('application/manifest+json') || !manifest.body?.name) {
        throw new Error(`Static manifest check failed with status ${manifest.status}.`);
    }

    const socketUrl = new URL(`/socket.io/?EIO=4&transport=polling&t=${Date.now()}`, baseUrl);
    const socketHandshake = await requestText(socketUrl, timeoutMs);
    let socketOpen = null;
    try {
        socketOpen = socketHandshake.text.startsWith('0')
            ? JSON.parse(socketHandshake.text.slice(1))
            : null;
    } catch (_error) {}
    if (socketHandshake.status !== 200 || typeof socketOpen?.sid !== 'string') {
        throw new Error(`Socket.IO polling handshake failed with status ${socketHandshake.status}.`);
    }

    return {
        version: health.body.version,
        mode: health.body.mode,
        readinessChecks: Object.keys(readinessChecks),
        roomCount: metrics.body.roomCount,
        participantCount: metrics.body.participantCount,
        memoryRssMb: metrics.body.memoryRssMb,
        videoProvider: runtime.body.videoProvider,
        socketTransport: 'polling'
    };
}

module.exports = {
    validateDeploymentUrl,
    verifyDeployment
};
