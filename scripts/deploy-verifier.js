const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { version: DEFAULT_EXPECTED_VERSION } = require('../package.json');
const { decryptBackupArtifact, parseBackupEncryptionKey } = require('../services/ops/backup-artifact');
const {
    DEFAULT_VIEWER_PRESET_NAME,
    PRESET_KINDS,
    fetchPresetSummaries,
    inspectPresetPolicy
} = require('./cloudflare/realtimekit-setup');

const HSTS_MIN_MAX_AGE = 31_536_000;
const DEFAULT_CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_STUDENT_PRESET_NAME = 'halastudy_student';
const DEFAULT_MAX_BACKUP_AGE_HOURS = 36;
const MAX_HTTP_RESPONSE_BYTES = 1024 * 1024;
const MAX_BACKUP_ARTIFACT_BYTES = 128 * 1024 * 1024;
const BACKUP_ARTIFACT_PATTERN = /^halastudy-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z-[A-Za-z0-9-]+\.hsbackup$/;

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

function requestText(targetUrl, timeoutMs = 10_000, options = {}) {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const allowSelfSigned = url.protocol === 'https:' && isLoopbackHost(url.hostname);
    const body = options.body === undefined || options.body === null
        ? null
        : Buffer.isBuffer(options.body) ? options.body : Buffer.from(String(options.body), 'utf8');
    const maxResponseBytes = options.maxResponseBytes || MAX_HTTP_RESPONSE_BYTES;

    return new Promise((resolve, reject) => {
        const req = client.request(url, {
            method: options.method || 'GET',
            headers: {
                Accept: '*/*',
                ...(options.headers || {}),
                ...(body ? { 'Content-Length': body.length } : {})
            },
            rejectUnauthorized: !allowSelfSigned
        }, (res) => {
            let text = '';
            let responseBytes = 0;
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                responseBytes += Buffer.byteLength(chunk, 'utf8');
                if (responseBytes > maxResponseBytes) {
                    req.destroy(new Error(`Response exceeded ${maxResponseBytes} bytes from ${url.pathname}.`));
                    return;
                }
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
        if (body) req.write(body);
        req.end();
    });
}

async function requestJson(targetUrl, timeoutMs, options = {}) {
    const response = await requestText(targetUrl, timeoutMs, options);
    let body = null;
    try {
        body = response.text ? JSON.parse(response.text) : null;
    } catch (error) {
        throw new Error(`Invalid JSON from ${new URL(targetUrl).pathname}: ${error.message}`);
    }
    return { ...response, body };
}

function requiredConfig(env, name) {
    const value = String(env?.[name] || '').trim();
    if (!value || /^replace[_-]?me$/i.test(value)) {
        throw new Error(`RealtimeKit deployment verification requires ${name}.`);
    }
    return value;
}

function normalizeCloudflareApiBaseUrl(value, { allowLoopback = false } = {}) {
    let apiBaseUrl;
    try {
        apiBaseUrl = new URL(String(value || DEFAULT_CLOUDFLARE_API_BASE_URL).trim());
    } catch (_error) {
        throw new Error('CLOUDFLARE_REALTIMEKIT_API_BASE_URL is invalid.');
    }
    const normalizedPath = apiBaseUrl.pathname.replace(/\/+$/, '') || '/';
    const official = apiBaseUrl.protocol === 'https:'
        && apiBaseUrl.hostname.toLowerCase() === 'api.cloudflare.com'
        && !apiBaseUrl.port
        && !apiBaseUrl.username
        && !apiBaseUrl.password
        && !apiBaseUrl.search
        && !apiBaseUrl.hash
        && normalizedPath === '/client/v4';
    const loopback = ['http:', 'https:'].includes(apiBaseUrl.protocol)
        && isLoopbackHost(apiBaseUrl.hostname)
        && !apiBaseUrl.username
        && !apiBaseUrl.password
        && !apiBaseUrl.search
        && !apiBaseUrl.hash
        && normalizedPath === '/client/v4';
    if (!official && !(allowLoopback && loopback)) {
        throw new Error('RealtimeKit deployment verification requires the official Cloudflare API endpoint.');
    }
    return apiBaseUrl.toString().replace(/\/$/, '');
}

function parsePositiveHours(value, fallback = DEFAULT_MAX_BACKUP_AGE_HOURS) {
    const raw = value === undefined || value === null || value === '' ? fallback : value;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24 * 30) {
        throw new Error('DEPLOY_VERIFY_MAX_BACKUP_AGE_HOURS must be greater than 0 and at most 720.');
    }
    return parsed;
}

function resolveOperationalConfig(env, baseUrl) {
    const accountId = requiredConfig(env, 'CLOUDFLARE_ACCOUNT_ID');
    const appId = requiredConfig(env, 'CLOUDFLARE_REALTIMEKIT_APP_ID');
    const apiToken = requiredConfig(env, 'CLOUDFLARE_REALTIMEKIT_API_TOKEN');
    const allowLoopback = isLoopbackHost(baseUrl.hostname) && String(env?.NODE_ENV || '') === 'test';
    const apiBaseUrl = normalizeCloudflareApiBaseUrl(
        env?.CLOUDFLARE_REALTIMEKIT_API_BASE_URL,
        { allowLoopback }
    );
    const studentPresetName = String(env?.VIDEO_DEFAULT_PRESET_NAME || DEFAULT_STUDENT_PRESET_NAME).trim();
    const viewerPresetName = String(env?.VIDEO_VIEWER_PRESET_NAME || DEFAULT_VIEWER_PRESET_NAME).trim();
    if (!studentPresetName || !viewerPresetName || studentPresetName === viewerPresetName) {
        throw new Error('RealtimeKit deployment verification requires distinct student and viewer preset names.');
    }
    const backupDir = String(env?.ROOM_STATE_BACKUP_DIR || '').trim();
    if (!backupDir || !path.isAbsolute(backupDir)) {
        throw new Error('Deployment verification requires an absolute ROOM_STATE_BACKUP_DIR.');
    }
    const backupEncryptionKey = requiredConfig(env, 'BACKUP_ENCRYPTION_KEY');
    const validatedBackupKey = parseBackupEncryptionKey(backupEncryptionKey);
    validatedBackupKey.fill(0);
    return {
        accountId,
        appId,
        apiToken,
        apiBaseUrl,
        studentPresetName,
        viewerPresetName,
        backupDir: path.resolve(backupDir),
        backupEncryptionKey,
        maxBackupAgeHours: parsePositiveHours(env?.DEPLOY_VERIFY_MAX_BACKUP_AGE_HOURS)
    };
}

function providerErrorMessage(body, status) {
    const messages = Array.isArray(body?.errors)
        ? body.errors.map((entry) => entry?.message || entry?.code).filter(Boolean)
        : [];
    return messages.length
        ? Array.from(String(messages.join('; ')))
            .map((character) => {
                const codePoint = character.codePointAt(0);
                return codePoint < 32 || codePoint === 127 ? ' ' : character;
            })
            .join('')
            .slice(0, 300)
        : `HTTP ${status}`;
}

function createRealtimeKitVerificationRequest(config, timeoutMs) {
    const accountBase = `${config.apiBaseUrl}/accounts/${encodeURIComponent(config.accountId)}/realtime/kit`;
    return async (pathname) => {
        const response = await requestJson(`${accountBase}${pathname}`, timeoutMs, {
            headers: { Authorization: `Bearer ${config.apiToken}` },
            maxResponseBytes: 256 * 1024
        });
        const ok = response.status >= 200
            && response.status < 300
            && response.body?.success !== false;
        return {
            ok,
            status: response.status,
            payload: response.body,
            result: response.body?.data,
            error: ok ? null : providerErrorMessage(response.body, response.status)
        };
    };
}

async function verifyRealtimeKitPresets(config, timeoutMs) {
    const request = createRealtimeKitVerificationRequest(config, timeoutMs);
    const listed = await fetchPresetSummaries(request, config.appId);
    if (!listed.ok) {
        throw new Error(`RealtimeKit preset inventory check failed: ${listed.error}.`);
    }
    const targets = [
        { name: config.studentPresetName, kind: PRESET_KINDS.STUDENT },
        { name: config.viewerPresetName, kind: PRESET_KINDS.VIEWER }
    ];
    for (const target of targets) {
        const inspected = await inspectPresetPolicy({
            request,
            appId: config.appId,
            name: target.name,
            kind: target.kind,
            summaries: listed.presets
        });
        if (!inspected.ok) {
            throw new Error(`RealtimeKit preset ${target.name} failed its effective policy check: ${inspected.error}.`);
        }
    }
    return targets.map(({ name }) => name);
}

function parseCanonicalBase64(value, expectedBytes) {
    if (typeof value !== 'string' || !value) return false;
    const bytes = Buffer.from(value, 'base64');
    return bytes.length === expectedBytes && bytes.toString('base64') === value;
}

function isCanonicalBase64Text(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length % 4 === 0
        && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function assertCompletedBackupArtifact(filePath, stat, encryptionKey) {
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BACKUP_ARTIFACT_BYTES) {
        throw new Error('Last successful backup artifact has an invalid size.');
    }
    let artifact;
    try {
        artifact = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_error) {
        throw new Error('Last successful backup artifact is not valid JSON.');
    }
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)
        || artifact.format !== 'halastudy-encrypted-backup'
        || artifact.artifactVersion !== 1
        || artifact.encryption?.algorithm !== 'AES-256-GCM'
        || !parseCanonicalBase64(artifact.encryption?.iv, 12)
        || !parseCanonicalBase64(artifact.encryption?.authTag, 16)
        || !isCanonicalBase64Text(artifact.ciphertext)) {
        throw new Error('Last successful backup artifact is incomplete or unsupported.');
    }
    decryptBackupArtifact({ artifact, encryptionKey });
}

function parseBackupTimestamp(match) {
    const timestamp = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.000Z`;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === timestamp
        ? { timestamp, parsed }
        : null;
}

/** @param {any} config @param {number | (() => number)} [nowValue] */
function verifyLastSuccessfulBackup(config, nowValue = Date.now) {
    let entries;
    try {
        entries = fs.readdirSync(config.backupDir, { withFileTypes: true });
    } catch (_error) {
        throw new Error(`Backup directory is unavailable: ${config.backupDir}.`);
    }
    const candidates = entries
        .filter((entry) => entry.isFile())
        .map((entry) => ({ entry, match: entry.name.match(BACKUP_ARTIFACT_PATTERN) }))
        .filter(({ match }) => match)
        .map(({ entry, match }) => ({ entry, ...parseBackupTimestamp(match) }))
        .filter((candidate) => Number.isFinite(candidate.parsed))
        .sort((left, right) => right.parsed - left.parsed);
    if (candidates.length === 0) {
        throw new Error('No successful encrypted backup artifact was found.');
    }
    const latest = candidates[0];
    const filePath = path.join(config.backupDir, latest.entry.name);
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (_error) {
        throw new Error('Last successful backup artifact is unavailable.');
    }
    assertCompletedBackupArtifact(filePath, stat, config.backupEncryptionKey);
    const now = typeof nowValue === 'function' ? Number(nowValue()) : Number(nowValue);
    if (!Number.isFinite(now)) throw new Error('Deployment verification clock is invalid.');
    const ageMs = now - latest.parsed;
    if (ageMs < -5 * 60 * 1000) {
        throw new Error('Last successful backup timestamp is unexpectedly in the future.');
    }
    const ageHours = Math.max(0, ageMs / (60 * 60 * 1000));
    if (ageHours > config.maxBackupAgeHours) {
        throw new Error(
            `Last successful backup is stale (${ageHours.toFixed(2)}h; maximum ${config.maxBackupAgeHours}h).`
        );
    }
    return {
        fileName: latest.entry.name,
        createdAt: latest.timestamp,
        ageHours: Number(ageHours.toFixed(2)),
        maxAgeHours: config.maxBackupAgeHours,
        sizeBytes: stat.size
    };
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
    const productionTarget = !isLoopbackHost(baseUrl.hostname);
    const requireOperationalChecks = productionTarget || options.requireOperationalChecks === true;

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

    let realtimeKit = null;
    let backup = null;
    if (requireOperationalChecks) {
        if (runtime.body.videoProvider !== 'realtimekit') {
            throw new Error('Production deployment verification requires VIDEO_PROVIDER=realtimekit.');
        }
        if (metrics.body.realtimeKitProviderAvailable !== true
            || !Number.isSafeInteger(metrics.body.realtimeKitWebhookDedupEntries)
            || metrics.body.realtimeKitWebhookDedupEntries < 0) {
            throw new Error('RealtimeKit runtime health metrics are unavailable or unhealthy.');
        }
        const operationalConfig = resolveOperationalConfig(options.env || process.env, baseUrl);
        const presets = await verifyRealtimeKitPresets(operationalConfig, timeoutMs);
        const webhook = await requestJson(new URL('/api/webhooks/realtimekit', baseUrl), timeoutMs, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
        if (webhook.status !== 401 || webhook.body?.errorCode !== 'WEBHOOK_SIGNATURE_INVALID') {
            throw new Error(
                `RealtimeKit webhook health check failed with status ${webhook.status} (${webhook.body?.errorCode || 'missing error code'}).`
            );
        }
        realtimeKit = {
            presets,
            webhook: 'signature_enforced',
            webhookDedupEntries: metrics.body.realtimeKitWebhookDedupEntries,
            providerAvailable: true
        };
        backup = verifyLastSuccessfulBackup(operationalConfig, options.now || Date.now);
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
        socketTransport: 'polling',
        realtimeKit,
        backup
    };
}

module.exports = {
    resolveOperationalConfig,
    validateDeploymentUrl,
    verifyDeployment,
    verifyLastSuccessfulBackup,
    verifyRealtimeKitPresets
};
