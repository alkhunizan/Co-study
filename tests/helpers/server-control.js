const { spawn } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const { repoRoot, makeTempStateFile, resetStateFile } = require('./test-env');
const { cookieForMembershipToken } = require('./socket-client');

// Child processes get only operating-system plumbing that Node needs. In
// particular, service credentials from a developer shell must never cross the
// integration-test boundary implicitly.
const AMBIENT_ENV_ALLOWLIST = [
    'CI',
    'COMSPEC',
    'ComSpec',
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'TEMP',
    'TMP',
    'TZ',
    'WINDIR'
];
const SERVER_OVERRIDE_ALLOWLIST = new Set([
    'ADMIN_PASSWORD_HASH',
    'ADMIN_PATH',
    'ALLOWED_ORIGINS',
    'BACKUP_ENCRYPTION_KEY',
    'BACKUP_INTERVAL_MINUTES',
    'BACKUP_RETENTION_COUNT',
    'ENABLE_DEV_MESH',
    'HOST',
    'ICE_SERVERS_JSON',
    'MAX_GLOBAL_VIDEO_PARTICIPANTS',
    'MAX_ROOM_DURATION_MINUTES',
    'MAX_ROOM_VIDEO_PARTICIPANTS',
    'MESH_PARTICIPANT_LIMIT',
    'PUBLIC_API_BASE_URL',
    'RESTORE_WRITER_LOCK_FILE',
    'ROOM_STATE_BACKUP_DIR',
    'ROOM_STATE_FILE',
    'SFU_BASE_URL',
    'TRUST_PROXY',
    'USER_STATE_FILE',
    'VIDEO_CHAT_ENABLED',
    'VIDEO_DEFAULT_PRESET_NAME',
    'VIDEO_JOIN_DISABLED',
    'VIDEO_PROVIDER',
    'VIDEO_RECORDING_ENABLED',
    'VIDEO_SCREENSHARE_ENABLED',
    'VIDEO_VIEWER_PRESET_NAME'
]);

// Fixed so signed cookies stay valid across restart-persistence tests. These
// values are deliberately test-only and never inherited from the caller.
const TEST_SESSION_SECRET = 'halastudy-integration-test-secret-0123456789abcdef';
const TEST_ADMIN_SESSION_SECRET = 'halastudy-integration-admin-secret-fedcba9876543210';

function isLoopbackHostname(hostname) {
    const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (normalized === 'localhost' || normalized === '::1') return true;
    return /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function assertLoopbackProviderUrl(value, envName) {
    if (value === undefined || value === null || String(value).trim() === '') return;

    let parsed;
    try {
        parsed = new URL(String(value));
    } catch (_error) {
        throw new Error(`${envName} must be an absolute http(s) loopback URL in tests.`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || !isLoopbackHostname(parsed.hostname)) {
        throw new Error(`${envName} must use a loopback host in tests.`);
    }
}

/** @returns {NodeJS.ProcessEnv} */
function buildTestEnvironment({ ambientEnv = process.env, overrides = {} } = {}) {
    const env = /** @type {NodeJS.ProcessEnv} */ ({});
    for (const key of AMBIENT_ENV_ALLOWLIST) {
        if (ambientEnv[key] !== undefined) env[key] = ambientEnv[key];
    }

    for (const [key, value] of Object.entries(overrides || {})) {
        if (key === 'NODE_ENV') {
            if (value !== 'test') throw new Error('NODE_ENV is fixed to test for test server processes.');
            continue;
        }
        if (!SERVER_OVERRIDE_ALLOWLIST.has(key)) {
            throw new Error(`${key} is not allowed in a test server environment.`);
        }
        if (value !== undefined && value !== null) env[key] = String(value);
    }

    env.NODE_ENV = 'test';
    env.SESSION_SECRET = TEST_SESSION_SECRET;
    env.ADMIN_SESSION_SECRET = TEST_ADMIN_SESSION_SECRET;
    assertLoopbackProviderUrl(env.SFU_BASE_URL, 'SFU_BASE_URL');
    assertLoopbackProviderUrl(env.CLOUDFLARE_REALTIMEKIT_API_BASE_URL, 'CLOUDFLARE_REALTIMEKIT_API_BASE_URL');
    assertLoopbackProviderUrl(
        env.CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL,
        'CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL'
    );
    return env;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close((closeError) => {
                if (closeError) {
                    reject(closeError);
                    return;
                }
                resolve(/** @type {import('net').AddressInfo} */ (address).port);
            });
        });
        server.on('error', reject);
    });
}

function request(baseUrl, pathname, options = {}) {
    const { method = 'GET', headers = {}, body } = options;
    const url = new URL(pathname, baseUrl);

    return new Promise((resolve, reject) => {
        const client = url.protocol === 'https:' ? https : http;
        const requestOptions = {
            method,
            headers
        };
        if (url.protocol === 'https:') {
            requestOptions.rejectUnauthorized = false;
        }

        const req = client.request(url, requestOptions, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                let parsedBody = raw;
                const contentType = Array.isArray(res.headers['content-type'])
                    ? res.headers['content-type'].join(';')
                    : (res.headers['content-type'] || '');

                if (contentType.includes('application/json')) {
                    try {
                        parsedBody = raw ? JSON.parse(raw) : null;
                    } catch (error) {
                        reject(error);
                        return;
                    }
                }

                resolve({
                    status: res.statusCode || 0,
                    headers: res.headers,
                    body: parsedBody,
                    text: raw
                });
            });
        });

        req.on('error', reject);

        if (body !== undefined) {
            const payload = typeof body === 'string' ? body : JSON.stringify(body);
            if (!requestOptions.headers['Content-Type']) {
                req.setHeader('Content-Type', 'application/json');
            }
            // Node's http client does not chunk bodies on DELETE (and other
            // bodyless-by-default methods); without an explicit length the
            // server sees a malformed request and answers 400.
            req.setHeader('Content-Length', Buffer.byteLength(payload));
            req.write(payload);
        }

        req.end();
    });
}

async function waitForServer(baseUrl, timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await request(baseUrl, '/api/ready');
            if (response.status === 200) {
                return;
            }
        } catch (_error) {}

        await delay(250);
    }

    throw new Error(`Timed out waiting for ${baseUrl} to become ready.`);
}

async function waitForPath(baseUrl, pathname, timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await request(baseUrl, pathname);
            if (response.status >= 200 && response.status < 500) {
                return;
            }
        } catch (_error) {}

        await delay(250);
    }

    throw new Error(`Timed out waiting for ${new URL(pathname, baseUrl).toString()} to become ready.`);
}

async function stopChild(childProcess, timeoutMs = 10000) {
    if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
        return;
    }

    const exitPromise = new Promise((resolve) => {
        childProcess.once('exit', resolve);
    });

    childProcess.kill('SIGTERM');
    const timeoutPromise = delay(timeoutMs).then(() => {
        if (childProcess.exitCode === null) {
            childProcess.kill('SIGKILL');
        }
    });

    await Promise.race([exitPromise, timeoutPromise]);
    await exitPromise;
}

async function crashChild(childProcess) {
    if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) return;
    const exited = new Promise((resolve) => childProcess.once('exit', resolve));
    childProcess.kill('SIGKILL');
    await exited;
}

async function startFakeSfu(options = {}) {
    const port = options.port || await getFreePort();
    const stdout = [];
    const stderr = [];
    const child = spawn(process.execPath, ['tests/helpers/fake-sfu-fixture.js'], {
        cwd: repoRoot,
        env: {
            ...buildTestEnvironment(),
            PORT: String(port)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => {
        stdout.push(chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
        stderr.push(chunk.toString());
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const exitedEarly = new Promise((_, reject) => {
        child.once('exit', (code, signal) => {
            reject(new Error(`Fake SFU exited before becoming ready (code=${code}, signal=${signal || 'none'}).`));
        });
    });

    try {
        await Promise.race([waitForPath(baseUrl, '/health'), exitedEarly]);
    } catch (error) {
        await stopChild(child);
        const combinedLogs = `${stdout.join('')}\n${stderr.join('')}`.trim();
        throw new Error(`Failed to start fake SFU server: ${error.message}\n${combinedLogs}`);
    }

    return {
        pid: child.pid,
        port,
        baseUrl,
        async stop() {
            await stopChild(child);
        },
        logs() {
            return {
                stdout: stdout.join(''),
                stderr: stderr.join('')
            };
        }
    };
}

async function startFakeRealtimeKit(options = {}) {
    const port = options.port || await getFreePort();
    const stdout = [];
    const stderr = [];
    const child = spawn(process.execPath, ['tests/helpers/fake-realtimekit-fixture.js'], {
        cwd: repoRoot,
        env: {
            ...buildTestEnvironment(),
            PORT: String(port),
            REALTIMEKIT_FAIL_PARTICIPANT: options.failParticipants ? '1' : '0',
            REALTIMEKIT_FAIL_RECONCILIATION: options.failReconciliation ? '1' : '0',
            REALTIMEKIT_FAIL_CLOSE: options.failClose ? '1' : '0',
            REALTIMEKIT_MEETING_DELAY_MS: String(options.meetingDelayMs || 0),
            REALTIMEKIT_PARTICIPANT_DELAY_MS: String(options.participantDelayMs || 0),
            REALTIMEKIT_CLOSE_DELAY_MS: String(options.closeDelayMs || 0),
            REALTIMEKIT_INITIAL_ACTIVE_SESSIONS_JSON: JSON.stringify(options.activeSessions || {})
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => {
        stdout.push(chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
        stderr.push(chunk.toString());
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const exitedEarly = new Promise((_, reject) => {
        child.once('exit', (code, signal) => {
            reject(new Error(`Fake RealtimeKit exited before becoming ready (code=${code}, signal=${signal || 'none'}).`));
        });
    });

    try {
        await Promise.race([waitForPath(baseUrl, '/health'), exitedEarly]);
    } catch (error) {
        await stopChild(child);
        const combinedLogs = `${stdout.join('')}\n${stderr.join('')}`.trim();
        throw new Error(`Failed to start fake RealtimeKit server: ${error.message}\n${combinedLogs}`);
    }

    return {
        pid: child.pid,
        port,
        baseUrl,
        async state() {
            const response = await request(baseUrl, '/__state');
            return response.body;
        },
        async sign(event, uuid) {
            const raw = JSON.stringify(event);
            const response = await request(baseUrl, '/__sign', {
                method: 'POST',
                body: { raw, uuid }
            });
            if (response.status !== 200) throw new Error('Fake RealtimeKit could not sign a webhook.');
            return { raw, signature: response.body.signature, uuid: response.body.uuid };
        },
        async stop() {
            await stopChild(child);
        },
        logs() {
            return {
                stdout: stdout.join(''),
                stderr: stderr.join('')
            };
        }
    };
}

async function startServer(options = {}) {
    const port = options.port || await getFreePort();
    const requestedEnv = buildTestEnvironment({ overrides: options.env || {} });
    const roomStateFile = options.roomStateFile || requestedEnv.ROOM_STATE_FILE || makeTempStateFile('co-study-integration');
    const userStateFile = options.userStateFile || requestedEnv.USER_STATE_FILE || makeTempStateFile('co-study-users');
    const shouldResetStateFile = options.resetStateFileOnStart !== false;
    if (shouldResetStateFile) {
        resetStateFile(roomStateFile);
        resetStateFile(userStateFile);
    }

    const externalSfuBaseUrl = requestedEnv.SFU_BASE_URL;
    const fakeSfu = options.withFakeSfu && !externalSfuBaseUrl
        ? await startFakeSfu(options.fakeSfuOptions || {})
        : null;
    const fakeRealtimeKit = options.withFakeRealtimeKit
        ? await startFakeRealtimeKit(options.fakeRealtimeKitOptions || {})
        : null;

    const stdout = [];
    const stderr = [];
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repoRoot,
        env: {
            ...requestedEnv,
            PORT: String(port),
            ROOM_STATE_FILE: roomStateFile,
            USER_STATE_FILE: userStateFile,
            SESSION_SECRET: TEST_SESSION_SECRET,
            ADMIN_SESSION_SECRET: TEST_ADMIN_SESSION_SECRET,
            SFU_BASE_URL: fakeSfu ? fakeSfu.baseUrl : (requestedEnv.SFU_BASE_URL || ''),
            ...(fakeRealtimeKit ? {
                VIDEO_PROVIDER: 'realtimekit',
                CLOUDFLARE_ACCOUNT_ID: 'fake-account',
                CLOUDFLARE_REALTIMEKIT_APP_ID: 'fake-app',
                CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'fake-secret-token',
                CLOUDFLARE_REALTIMEKIT_API_BASE_URL: fakeRealtimeKit.baseUrl,
                CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: `${fakeRealtimeKit.baseUrl}/.well-known/webhooks.json`
            } : {})
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => {
        stdout.push(chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
        stderr.push(chunk.toString());
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const exitedEarly = new Promise((_, reject) => {
        child.once('exit', (code, signal) => {
            reject(new Error(`Server exited before becoming ready (code=${code}, signal=${signal || 'none'}).`));
        });
    });

    try {
        await Promise.race([waitForServer(baseUrl), exitedEarly]);
    } catch (error) {
        if (fakeSfu) {
            await fakeSfu.stop();
        }
        if (fakeRealtimeKit) {
            await fakeRealtimeKit.stop();
        }
        await stopChild(child);
        const combinedLogs = `${stdout.join('')}\n${stderr.join('')}`.trim();
        throw new Error(`Failed to start test server: ${error.message}\n${combinedLogs}`);
    }

    return {
        pid: child.pid,
        port,
        baseUrl,
        roomStateFile,
        userStateFile,
        sfuBaseUrl: fakeSfu ? fakeSfu.baseUrl : (options.env?.SFU_BASE_URL) || '',
        fakeSfuPid: fakeSfu ? fakeSfu.pid : null,
        realtimeKitBaseUrl: fakeRealtimeKit ? fakeRealtimeKit.baseUrl : '',
        fakeRealtimeKitPid: fakeRealtimeKit ? fakeRealtimeKit.pid : null,
        async stop() {
            await stopChild(child);
            if (fakeSfu) {
                await fakeSfu.stop();
            }
            if (fakeRealtimeKit) {
                await fakeRealtimeKit.stop();
            }
        },
        async crash() {
            await crashChild(child);
            if (fakeSfu) await fakeSfu.stop();
            if (fakeRealtimeKit) await fakeRealtimeKit.stop();
        },
        logs() {
            return {
                stdout: stdout.join(''),
                stderr: stderr.join(''),
                fakeSfu: fakeSfu ? fakeSfu.logs() : null,
                fakeRealtimeKit: fakeRealtimeKit ? fakeRealtimeKit.logs() : null
            };
        },
        async realtimeKitState() {
            return fakeRealtimeKit ? fakeRealtimeKit.state() : null;
        },
        async signRealtimeKitWebhook(event, uuid) {
            if (!fakeRealtimeKit) throw new Error('Fake RealtimeKit is not enabled.');
            return fakeRealtimeKit.sign(event, uuid);
        },
        async request(pathname, requestOptions) {
            const normalizedOptions = { ...(requestOptions || {}) };
            const headers = { ...(normalizedOptions.headers || {}) };
            const membershipHeader = Object.entries(headers).find(
                ([name]) => name.toLowerCase() === 'x-halastudy-membership'
            );
            const hasCookie = Object.keys(headers).some((name) => name.toLowerCase() === 'cookie');
            const membershipCookie = membershipHeader
                ? cookieForMembershipToken(Array.isArray(membershipHeader[1])
                    ? membershipHeader[1][0]
                    : membershipHeader[1])
                : '';
            if (!hasCookie && membershipCookie) headers.Cookie = membershipCookie;
            normalizedOptions.headers = headers;
            return request(baseUrl, pathname, normalizedOptions);
        }
    };
}

module.exports = {
    buildTestEnvironment,
    delay,
    startServer,
    waitForServer
};
