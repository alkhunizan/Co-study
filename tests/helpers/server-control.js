const { spawn } = require('node:child_process');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const { repoRoot, makeTempStateFile, resetStateFile } = require('./test-env');

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
            req.write(payload);
        }

        req.end();
    });
}

async function waitForServer(baseUrl, timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await request(baseUrl, '/api/runtime-config');
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
    if (!childProcess || childProcess.exitCode !== null) {
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

async function startFakeSfu(options = {}) {
    const port = options.port || await getFreePort();
    const stdout = [];
    const stderr = [];
    const child = spawn(process.execPath, ['tests/helpers/fake-sfu-fixture.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
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

async function startServer(options = {}) {
    const port = options.port || await getFreePort();
    const roomStateFile = options.roomStateFile || makeTempStateFile('co-study-integration');
    const shouldResetStateFile = options.resetStateFileOnStart !== false;
    if (shouldResetStateFile) {
        resetStateFile(roomStateFile);
    }

    const externalSfuBaseUrl = options.env?.SFU_BASE_URL;
    const fakeSfu = options.withFakeSfu && !externalSfuBaseUrl
        ? await startFakeSfu(options.fakeSfuOptions || {})
        : null;

    const stdout = [];
    const stderr = [];
    const child = spawn(process.execPath, ['server.js'], {
        cwd: repoRoot,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(port),
            ROOM_STATE_FILE: roomStateFile,
            SFU_BASE_URL: fakeSfu ? fakeSfu.baseUrl : '',
            ...options.env
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
        await stopChild(child);
        const combinedLogs = `${stdout.join('')}\n${stderr.join('')}`.trim();
        throw new Error(`Failed to start test server: ${error.message}\n${combinedLogs}`);
    }

    return {
        pid: child.pid,
        port,
        baseUrl,
        roomStateFile,
        sfuBaseUrl: fakeSfu ? fakeSfu.baseUrl : (options.env?.SFU_BASE_URL) || '',
        fakeSfuPid: fakeSfu ? fakeSfu.pid : null,
        async stop() {
            await stopChild(child);
            if (fakeSfu) {
                await fakeSfu.stop();
            }
        },
        logs() {
            return {
                stdout: stdout.join(''),
                stderr: stderr.join(''),
                fakeSfu: fakeSfu ? fakeSfu.logs() : null
            };
        },
        async request(pathname, requestOptions) {
            return request(baseUrl, pathname, requestOptions);
        }
    };
}

module.exports = {
    delay,
    startServer
};
