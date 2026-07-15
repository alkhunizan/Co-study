const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { version } = require('../../package.json');
const { createEncryptedBackupArtifact } = require('../../services/ops/backup-artifact');
const { validateDeploymentUrl, verifyDeployment } = require('../../scripts/deploy-verifier');
const { loadVerificationEnvFile, parseArguments } = require('../../scripts/verify-deploy');
const {
    PRESET_KINDS,
    buildPresetBody
} = require('../../scripts/cloudflare/realtimekit-setup');

const FIXED_NOW = Date.parse('2026-07-15T04:00:00.000Z');
const BACKUP_KEY = Buffer.alloc(32, 9).toString('base64');

function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
}

async function startDeploymentFixture(overrides = {}) {
    const server = http.createServer((req, res) => {
        if (req.url === '/api/health') {
            sendJson(res, 200, {
                status: 'ok',
                mode: 'http',
                version: overrides.version || version
            }, overrides.healthHeaders);
            return;
        }
        if (req.url === '/api/ready') {
            const checks = overrides.readinessChecks || {
                roomStore: true,
                userStore: true,
                socket: true,
                config: true
            };
            sendJson(res, 200, { status: 'ready', checks });
            return;
        }
        if (req.url === '/api/metrics') {
            sendJson(res, 200, {
                status: 'ok',
                roomCount: 1,
                participantCount: 0,
                memoryRssMb: 32,
                realtimeKitProviderAvailable: overrides.realtimeKitProviderAvailable ?? true,
                realtimeKitWebhookDedupEntries: overrides.realtimeKitWebhookDedupEntries ?? 4
            });
            return;
        }
        if (req.url === '/api/runtime-config') {
            sendJson(res, 200, {
                videoProvider: overrides.videoProvider || 'realtimekit',
                videoPolicy: {},
                googleAuthEnabled: false
            });
            return;
        }
        if (req.url === '/api/webhooks/realtimekit' && req.method === 'POST') {
            sendJson(
                res,
                overrides.webhookStatus || 401,
                { errorCode: overrides.webhookErrorCode || 'WEBHOOK_SIGNATURE_INVALID' }
            );
            return;
        }
        if (req.url === '/manifest.webmanifest') {
            sendJson(res, 200, { name: 'Halastudy', start_url: '/' }, {
                'Content-Type': 'application/manifest+json'
            });
            return;
        }
        if (req.url?.startsWith('/socket.io/?')) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('0{"sid":"fixture-sid","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}');
            return;
        }
        res.writeHead(404);
        res.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        })
    };
}

async function startRealtimeKitFixture({ driftViewer = false } = {}) {
    const student = {
        id: 'preset-student',
        ...buildPresetBody(PRESET_KINDS.STUDENT, 'halastudy_student')
    };
    const viewer = {
        id: 'preset-viewer',
        ...buildPresetBody(PRESET_KINDS.VIEWER, 'halastudy_viewer')
    };
    if (driftViewer) viewer.permissions.media.video.can_produce = 'ALLOWED';
    const presets = [student, viewer];

    const server = http.createServer((req, res) => {
        if (req.headers.authorization !== 'Bearer provider-token') {
            sendJson(res, 401, { success: false, errors: [{ message: 'unauthorized' }] });
            return;
        }
        const requestUrl = new URL(req.url, 'http://127.0.0.1');
        const presetBase = '/client/v4/accounts/account-test/realtime/kit/app-test/presets';
        if (requestUrl.pathname === presetBase && req.method === 'GET') {
            sendJson(res, 200, {
                success: true,
                data: presets.map(({ id, name }) => ({ id, name })),
                paging: { start_offset: 1, end_offset: 2, total_count: 2 }
            });
            return;
        }
        const match = requestUrl.pathname.match(new RegExp(`^${presetBase}/([^/]+)$`));
        if (match && req.method === 'GET') {
            const preset = presets.find(({ id }) => id === decodeURIComponent(match[1]));
            if (preset) {
                sendJson(res, 200, { success: true, data: preset });
                return;
            }
        }
        sendJson(res, 404, { success: false, errors: [{ message: 'not found' }] });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    return {
        apiBaseUrl: `http://127.0.0.1:${address.port}/client/v4`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        })
    };
}

function createBackupFixture(timestamp = '2026-07-15T033000Z', artifactOverride = null) {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-deploy-backup-'));
    const fileName = `halastudy-${timestamp}-fixture.hsbackup`;
    const createdAt = new Date(timestamp.replace(
        /T(\d{2})(\d{2})(\d{2})Z$/,
        'T$1:$2:$3.000Z'
    ));
    const artifact = artifactOverride || createEncryptedBackupArtifact({
        datasets: {
            profiles: [],
            deletion_tombstones: [],
            focus_completion_claims: [],
            focus_sessions: [],
            room_events: [],
            rooms: [{ id: 'BACKUP-FIXTURE' }]
        },
        encryptionKey: BACKUP_KEY,
        createdAt,
        randomBytes: () => Buffer.alloc(12, 1)
    });
    fs.writeFileSync(path.join(backupDir, fileName), `${JSON.stringify(artifact)}\n`);
    return {
        backupDir,
        fileName,
        close() {
            fs.rmSync(backupDir, { recursive: true, force: true });
        }
    };
}

function createLegacyV1BackupArtifact() {
    const datasets = {
        profiles: [],
        deletion_tombstones: [],
        focus_completion_claims: [],
        focus_sessions: [],
        room_events: [],
        rooms: []
    };
    const sources = Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, {
        rowCount: rows.length,
        sha256: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')
    }]));
    const iv = Buffer.alloc(12, 6);
    const key = Buffer.from(BACKUP_KEY, 'base64');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('halastudy-encrypted-backup:1'));
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify({
            manifest: {
                schemaVersion: 1,
                createdAt: '2026-07-15T03:30:00.000Z',
                sources,
                failedSources: []
            },
            datasets
        })),
        cipher.final()
    ]);
    key.fill(0);
    return {
        format: 'halastudy-encrypted-backup',
        artifactVersion: 1,
        encryption: {
            algorithm: 'AES-256-GCM',
            iv: iv.toString('base64'),
            authTag: cipher.getAuthTag().toString('base64')
        },
        ciphertext: ciphertext.toString('base64')
    };
}

function operationalEnv(realtimeKit, backup) {
    return {
        NODE_ENV: 'test',
        CLOUDFLARE_ACCOUNT_ID: 'account-test',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-test',
        CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'provider-token',
        CLOUDFLARE_REALTIMEKIT_API_BASE_URL: realtimeKit.apiBaseUrl,
        VIDEO_DEFAULT_PRESET_NAME: 'halastudy_student',
        VIDEO_VIEWER_PRESET_NAME: 'halastudy_viewer',
        ROOM_STATE_BACKUP_DIR: backup.backupDir,
        BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
        DEPLOY_VERIFY_MAX_BACKUP_AGE_HOURS: '2'
    };
}

test('deployment verification covers version, readiness, runtime config, static assets, and Socket.IO', async (t) => {
    const fixture = await startDeploymentFixture();
    t.after(fixture.close);

    const result = await verifyDeployment(fixture.baseUrl);
    assert.equal(result.version, version);
    assert.equal(result.videoProvider, 'realtimekit');
    assert.equal(result.socketTransport, 'polling');
});

test('deployment verification fails when any readiness check is false', async (t) => {
    const fixture = await startDeploymentFixture({
        readinessChecks: { roomStore: true, userStore: false, socket: true, config: true }
    });
    t.after(fixture.close);

    await assert.rejects(() => verifyDeployment(fixture.baseUrl), /Readiness checks failed: userStore/);
});

test('deployment verification rejects a stale build version', async (t) => {
    const fixture = await startDeploymentFixture({ version: '0.0.0-stale' });
    t.after(fixture.close);

    await assert.rejects(() => verifyDeployment(fixture.baseUrl), /Build version mismatch/);
});

test('deployment verification requires HSTS for the production TLS path', async (t) => {
    const fixture = await startDeploymentFixture();
    t.after(fixture.close);

    await assert.rejects(
        () => verifyDeployment(fixture.baseUrl, { requireHsts: true }),
        /HSTS header missing or too short/
    );
});

test('deployment verification accepts a one-year HSTS policy', async (t) => {
    const fixture = await startDeploymentFixture({
        healthHeaders: {
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        }
    });
    t.after(fixture.close);

    const result = await verifyDeployment(fixture.baseUrl, { requireHsts: true });
    assert.equal(result.version, version);
});

test('deployment verification rejects cleartext non-loopback targets before making requests', () => {
    assert.throws(
        () => validateDeploymentUrl('http://deploy.example.com'),
        /Production deployment verification requires HTTPS/
    );
});

test('deployment verification checks locked RealtimeKit presets, webhook signature enforcement, and backup freshness', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture();
    const backup = createBackupFixture();
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    const result = await verifyDeployment(deployment.baseUrl, {
        requireOperationalChecks: true,
        env: operationalEnv(realtimeKit, backup),
        now: () => FIXED_NOW
    });

    assert.deepEqual(result.realtimeKit.presets, ['halastudy_student', 'halastudy_viewer']);
    assert.equal(result.realtimeKit.webhook, 'signature_enforced');
    assert.equal(result.realtimeKit.webhookDedupEntries, 4);
    assert.equal(result.backup.fileName, backup.fileName);
    assert.equal(result.backup.ageHours, 0.5);
});

test('deployment verification fails closed when RealtimeKit verification credentials are absent', async (t) => {
    const deployment = await startDeploymentFixture();
    t.after(deployment.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: { NODE_ENV: 'test' }
        }),
        /RealtimeKit deployment verification requires CLOUDFLARE_ACCOUNT_ID/
    );
});

test('deployment verification rejects a drifted RealtimeKit preset policy', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture({ driftViewer: true });
    const backup = createBackupFixture();
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /RealtimeKit preset halastudy_viewer failed its effective policy check/
    );
});

test('deployment verification rejects an unavailable or incorrectly wired webhook route', async (t) => {
    const deployment = await startDeploymentFixture({
        webhookStatus: 503,
        webhookErrorCode: 'WEBHOOK_UNAVAILABLE'
    });
    const realtimeKit = await startRealtimeKitFixture();
    const backup = createBackupFixture();
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /RealtimeKit webhook health check failed/
    );
});

test('deployment verification rejects an unhealthy RealtimeKit runtime before provider checks', async (t) => {
    const deployment = await startDeploymentFixture({ realtimeKitProviderAvailable: false });
    const realtimeKit = await startRealtimeKitFixture();
    const backup = createBackupFixture();
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /RealtimeKit runtime health metrics are unavailable or unhealthy/
    );
});

test('deployment verification rejects a stale last successful backup', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture();
    const backup = createBackupFixture('2026-07-14T000000Z');
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /Last successful backup is stale/
    );
});

test('deployment verification rejects an incomplete encrypted backup artifact', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture();
    const backup = createBackupFixture('2026-07-15T033000Z', {
        format: 'halastudy-encrypted-backup',
        artifactVersion: 1
    });
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /Last successful backup artifact is incomplete or unsupported/
    );
});

test('deployment verification rejects an authenticated but partial production backup', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture();
    const partialArtifact = createEncryptedBackupArtifact({
        datasets: { rooms: [] },
        failedSources: [
            'profiles',
            'deletion_tombstones',
            'focus_completion_claims',
            'focus_sessions',
            'room_events'
        ],
        encryptionKey: BACKUP_KEY,
        createdAt: new Date(FIXED_NOW - 30 * 60 * 1000),
        randomBytes: () => Buffer.alloc(12, 7)
    });
    const backup = createBackupFixture('2026-07-15T033000Z', partialArtifact);
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /backup artifact is missing required sources/i
    );
});

test('deployment verification requires a fresh complete schema-v2 artifact even though restore supports v1', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture();
    const backup = createBackupFixture('2026-07-15T033000Z', createLegacyV1BackupArtifact());
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /schema-v2 backup artifact/i
    );
});

test('deployment verification uses the authenticated manifest time instead of a renamed fresh filename', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture();
    const oldArtifact = createEncryptedBackupArtifact({
        datasets: {
            profiles: [],
            deletion_tombstones: [],
            focus_completion_claims: [],
            focus_sessions: [],
            room_events: [],
            rooms: []
        },
        encryptionKey: BACKUP_KEY,
        createdAt: new Date('2026-07-13T03:30:00.000Z'),
        randomBytes: () => Buffer.alloc(12, 8)
    });
    const backup = createBackupFixture('2026-07-15T033000Z', oldArtifact);
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /authenticated manifest timestamp|Last successful backup is stale/i
    );
});

test('deployment verification authenticates and checksum-validates the newest backup', async (t) => {
    const deployment = await startDeploymentFixture();
    const realtimeKit = await startRealtimeKitFixture();
    const backup = createBackupFixture();
    const artifactPath = path.join(backup.backupDir, backup.fileName);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    artifact.ciphertext = `${artifact.ciphertext[0] === 'A' ? 'B' : 'A'}${artifact.ciphertext.slice(1)}`;
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact)}\n`);
    t.after(deployment.close);
    t.after(realtimeKit.close);
    t.after(backup.close);

    await assert.rejects(
        () => verifyDeployment(deployment.baseUrl, {
            requireOperationalChecks: true,
            env: operationalEnv(realtimeKit, backup),
            now: () => FIXED_NOW
        }),
        /Backup authentication failed|checksum mismatch/i
    );
});

test('deployment verifier CLI uses an explicit env file without importing unrelated secrets', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-deploy-env-'));
    const envFile = path.join(directory, 'service.env');
    fs.writeFileSync(envFile, [
        'CLOUDFLARE_ACCOUNT_ID=account-from-file',
        'CLOUDFLARE_REALTIMEKIT_API_TOKEN=token-from-file',
        'ROOM_STATE_BACKUP_DIR="/var/lib/halastudy/backups"',
        `BACKUP_ENCRYPTION_KEY=${BACKUP_KEY}`,
        'SESSION_SECRET=must-not-be-imported'
    ].join('\n'));
    try {
        const args = parseArguments([
            'https://deploy.example.com',
            '--env-file', envFile,
            '--max-backup-age-hours=48'
        ]);
        const loaded = loadVerificationEnvFile(args.envFile, {
            CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'shell-token'
        });

        assert.equal(args.baseUrl, 'https://deploy.example.com');
        assert.equal(args.maxBackupAgeHours, '48');
        assert.equal(loaded.CLOUDFLARE_ACCOUNT_ID, 'account-from-file');
        assert.equal(loaded.CLOUDFLARE_REALTIMEKIT_API_TOKEN, 'shell-token');
        assert.equal(loaded.ROOM_STATE_BACKUP_DIR, '/var/lib/halastudy/backups');
        assert.equal(loaded.BACKUP_ENCRYPTION_KEY, BACKUP_KEY);
        assert.equal(loaded.SESSION_SECRET, undefined);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
