const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { request, delay } = require('./server-control');

// Real Express/Socket.IO/PGlite code with inspectable dependencies. Only the
// test's local module instance, process signals and timer lifetime are isolated.
async function controlledRuntime() {
    const root = path.resolve(__dirname, '../..'), filename = path.join(root, 'co-study-server.js');
    const localRequire = createRequire(filename), holder = { exports: {} }, timers = new Set();
    const parent = path.join(os.tmpdir(), 'halastudy-release-fixes-2026-10-23/controlled');
    fs.mkdirSync(parent, { recursive: true });
    const directory = fs.mkdtempSync(path.join(parent, 'runtime-'));
    /** @type {ReturnType<typeof import('../../services/platform').createPlatform>} */
    let platform;
    const ownProcess = Object.create(process); ownProcess.once = () => ownProcess;
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module: holder, exports: holder.exports, __dirname: root, Buffer, URL, URLSearchParams,
        TextEncoder, TextDecoder, AbortController, AbortSignal, fetch, console, process: ownProcess,
        structuredClone, queueMicrotask, setImmediate, clearImmediate, performance, crypto: require('node:crypto').webcrypto,
        setTimeout(fn, ms, ...args) { const timer = setTimeout(fn, ms, ...args); timers.add(timer); return timer; },
        clearTimeout, clearInterval,
        setInterval(fn, ms, ...args) { const timer = setInterval(fn, ms, ...args); timers.add(timer); return timer; },
        require(name) {
            const exported = localRequire(name);
            if (name === './services/platform') return { ...exported, createPlatform(options) { platform = exported.createPlatform(options); return platform; } };
            return exported;
        }
    }, { filename });
    const app = /** @type {any} */ (holder.exports).createCoStudyServer({ mode: 'http', createServer: handler => http.createServer(handler), env: {
        NODE_ENV: 'test', SESSION_SECRET: 'controlled-runtime-only-0123456789abcdef',
        PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', PLATFORM_DATABASE_URL: '',
        VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true', BILLING_MODE: 'test', BILLING_PROVIDER: 'simulator',
        ROOM_STATE_FILE: path.join(directory, 'rooms.json'), USER_STATE_FILE: path.join(directory, 'users.json'), BACKUP_INTERVAL_MINUTES: '0'
    } });
    if (!platform) throw new Error('CONTROLLED_PLATFORM_NOT_CAPTURED');
    // Hydration is explicit on main: the HTTP entry points await it before listening.
    await app.initialize();
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
    for (let attempt = 0; attempt < 200 && !app.evaluateReadiness().ready; attempt++) await delay(25);
    if (!app.evaluateReadiness().ready) throw new Error('CONTROLLED_RUNTIME_NOT_READY');
    return { app, platform, baseUrl, request: (route, options = {}) => request(baseUrl, route, options), async stop() {
        await new Promise(resolve => app.io.close(resolve));
        for (const timer of timers) { clearInterval(timer); clearTimeout(timer); }
        await Promise.all([app.userStore.flush(app.users), app.roomStore.flush(app.rooms)]);
        await platform.billing.close?.(); await platform.db.close();
    } };
}

module.exports = { controlledRuntime };
