const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { afterEach, test } = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STUDENT_NAME = 'halastudy_student';
const VIEWER_NAME = 'halastudy_viewer';

/** @type {Set<import('node:http').Server>} */
const openServers = new Set();

afterEach(async () => {
    await Promise.all([...openServers].map((server) => new Promise((resolve) => server.close(resolve))));
    openServers.clear();
});

function mergePreset(current, patch) {
    return {
        ...current,
        ...patch,
        config: patch.config || current.config,
        permissions: patch.permissions || current.permissions,
        updated_at: '2026-07-15T00:00:00.000Z'
    };
}

function createProviderFake(initialPresets = [], options = {}) {
    const state = {
        presets: initialPresets.map((preset) => structuredClone(preset)),
        requests: []
    };
    let nextId = initialPresets.length + 1;

    const server = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const body = rawBody ? JSON.parse(rawBody) : null;
        const url = new URL(req.url, 'http://127.0.0.1');
        state.requests.push({ method: req.method, pathname: url.pathname, search: url.search, body });

        const send = (status, data, extra = {}) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ success: status >= 200 && status < 300, data, ...extra }));
        };

        if (req.method === 'GET' && url.pathname.endsWith('/realtime/kit/apps')) {
            send(200, [{ id: 'app-test' }]);
            return;
        }

        const presetBase = '/client/v4/accounts/account-test/realtime/kit/app-test/presets';
        if (url.pathname === presetBase && req.method === 'GET') {
            const pageNo = Number.parseInt(url.searchParams.get('page_no') || '1', 10);
            const perPage = Number.parseInt(url.searchParams.get('per_page') || '100', 10);
            const startIndex = (pageNo - 1) * perPage;
            const page = state.presets.slice(startIndex, startIndex + perPage);
            send(
                200,
                page.map(({ id, name, created_at, updated_at }) => ({
                    id,
                    name,
                    created_at,
                    updated_at
                })),
                {
                    paging: {
                        start_offset: page.length ? startIndex + 1 : 0,
                        end_offset: page.length ? startIndex + page.length : 0,
                        total_count: state.presets.length
                    }
                }
            );
            return;
        }
        if (url.pathname === presetBase && req.method === 'POST') {
            const preset = {
                id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
                created_at: '2026-07-15T00:00:00.000Z',
                updated_at: '2026-07-15T00:00:00.000Z',
                ...body
            };
            state.presets.push(preset);
            send(200, preset);
            return;
        }

        const match = url.pathname.match(new RegExp(`^${presetBase}/([^/]+)$`));
        if (match) {
            const id = decodeURIComponent(match[1]);
            const index = state.presets.findIndex((preset) => preset.id === id);
            if (index === -1) {
                send(404, null);
                return;
            }
            if (req.method === 'GET') {
                const preset = options.malformedDetailName === state.presets[index].name
                    ? { id, name: state.presets[index].name }
                    : state.presets[index];
                send(200, preset);
                return;
            }
            if (req.method === 'PATCH') {
                state.presets[index] = mergePreset(state.presets[index], body);
                send(200, state.presets[index]);
                return;
            }
        }

        send(404, null);
    });

    return {
        state,
        async listen() {
            await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
            openServers.add(server);
            const address = server.address();
            assert.ok(address && typeof address === 'object');
            return `http://127.0.0.1:${address.port}/client/v4`;
        }
    };
}

function runScript(script, apiBaseUrl, extraEnv = {}) {
    const env = {
        NODE_ENV: 'test',
        CLOUDFLARE_ACCOUNT_ID: 'account-test',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'app-test',
        CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'test-provider-token',
        CLOUDFLARE_REALTIMEKIT_API_BASE_URL: apiBaseUrl,
        VIDEO_DEFAULT_PRESET_NAME: STUDENT_NAME,
        VIDEO_VIEWER_PRESET_NAME: VIEWER_NAME,
        VIDEO_RECORDING_ENABLED: 'false',
        VIDEO_SCREENSHARE_ENABLED: 'false',
        VIDEO_CHAT_ENABLED: 'false',
        MAX_GLOBAL_VIDEO_PARTICIPANTS: '20',
        MAX_ROOM_VIDEO_PARTICIPANTS: '20',
        PORT: '1',
        PATH: process.env.PATH || '',
        SystemRoot: process.env.SystemRoot || '',
        ...extraEnv
    };

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(REPO_ROOT, script)], {
            cwd: REPO_ROOT,
            env,
            windowsHide: true
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
}

function assertStudentPolicy(preset) {
    assert.equal(preset.permissions.media.video.can_produce, 'ALLOWED');
    assert.equal(preset.permissions.media.audio.can_produce, 'NOT_ALLOWED');
    assert.equal(preset.permissions.media.screenshare.can_produce, 'NOT_ALLOWED');
    assert.equal(preset.permissions.can_record, false);
    assert.equal(preset.permissions.can_livestream, false);
    assert.equal(preset.permissions.is_recorder, false);
    assert.equal(preset.permissions.recorder_type, 'NONE');
    assert.deepEqual(preset.permissions.chat, {
        private: { can_receive: false, can_send: false, files: false, text: false },
        public: { can_send: false, files: false, text: false }
    });
}

function assertViewerPolicy(preset) {
    assert.equal(preset.permissions.media.video.can_produce, 'NOT_ALLOWED');
    assert.equal(preset.permissions.media.audio.can_produce, 'NOT_ALLOWED');
    assert.equal(preset.permissions.media.screenshare.can_produce, 'NOT_ALLOWED');
    for (const key of [
        'accept_stage_requests',
        'accept_waiting_requests',
        'can_accept_production_requests',
        'can_change_participant_permissions',
        'can_spotlight',
        'disable_participant_audio',
        'disable_participant_screensharing',
        'disable_participant_video',
        'kick_participant',
        'pin_participant'
    ]) {
        assert.equal(preset.permissions[key], false, `${key} must be disabled`);
    }
    assert.equal(preset.permissions.can_record, false);
    assert.equal(preset.permissions.can_livestream, false);
    assert.equal(preset.permissions.is_recorder, false);
    assert.equal(preset.permissions.recorder_type, 'NONE');
    assert.deepEqual(preset.permissions.plugins, {
        can_close: false,
        can_edit_config: false,
        can_start: false,
        config: {}
    });
}

test('cloudflare setup provisions and verifies complete student and viewer policies', async () => {
    const provider = createProviderFake();
    const apiBaseUrl = await provider.listen();

    const result = await runScript('scripts/cloudflare/realtimekit-setup.js', apiBaseUrl);

    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.equal(provider.state.presets.length, 2);
    const student = provider.state.presets.find((preset) => preset.name === STUDENT_NAME);
    const viewer = provider.state.presets.find((preset) => preset.name === VIEWER_NAME);
    assertStudentPolicy(student);
    assertViewerPolicy(viewer);
    assert.ok(provider.state.requests.some((request) => request.method === 'GET'
        && request.pathname.endsWith(`/presets/${student.id}`)));
    assert.ok(provider.state.requests.some((request) => request.method === 'GET'
        && request.pathname.endsWith(`/presets/${viewer.id}`)));
});

test('viewer preset command provisions and verifies only the locked watch-only policy', async () => {
    const provider = createProviderFake();
    const apiBaseUrl = await provider.listen();

    const result = await runScript('scripts/cloudflare/create-viewer-preset.js', apiBaseUrl);

    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.equal(provider.state.presets.length, 1);
    assert.equal(provider.state.presets[0].name, VIEWER_NAME);
    assertViewerPolicy(provider.state.presets[0]);
    assert.match(result.stdout, /effective policy: PASS/);
});

test('cloudflare setup patches a drifted viewer preset and verifies the returned effective policy', async () => {
    const provider = createProviderFake([{
        id: '00000000-0000-4000-8000-000000000001',
        name: VIEWER_NAME,
        permissions: {
            media: {
                audio: { can_produce: 'NOT_ALLOWED' },
                video: { can_produce: 'ALLOWED' },
                screenshare: { can_produce: 'NOT_ALLOWED' }
            }
        }
    }]);
    const apiBaseUrl = await provider.listen();

    const result = await runScript('scripts/cloudflare/realtimekit-setup.js', apiBaseUrl);

    assert.equal(result.code, 0, result.stdout + result.stderr);
    const viewer = provider.state.presets.find((preset) => preset.name === VIEWER_NAME);
    assertViewerPolicy(viewer);
    assert.ok(provider.state.requests.some((request) => request.method === 'PATCH'
        && request.pathname.endsWith(`/presets/${viewer.id}`)));
});

test('cloudflare doctor blocks release when a returned effective preset policy is elevated', async () => {
    const provider = createProviderFake();
    const apiBaseUrl = await provider.listen();
    const setup = await runScript('scripts/cloudflare/realtimekit-setup.js', apiBaseUrl);
    assert.equal(setup.code, 0, setup.stdout + setup.stderr);
    const viewer = provider.state.presets.find((preset) => preset.name === VIEWER_NAME);
    viewer.permissions.media.video.can_produce = 'ALLOWED';

    const result = await runScript('scripts/cloudflare/realtimekit-doctor.js', apiBaseUrl);

    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Preset halastudy_viewer effective policy: FAIL/);
    assert.match(result.stdout, /permissions\.media\.video\.can_produce/);
});

test('cloudflare setup fails closed when preset details omit effective permissions', async () => {
    const provider = createProviderFake([{
        id: '00000000-0000-4000-8000-000000000001',
        name: VIEWER_NAME,
        permissions: {}
    }], { malformedDetailName: VIEWER_NAME });
    const apiBaseUrl = await provider.listen();

    const result = await runScript('scripts/cloudflare/realtimekit-setup.js', apiBaseUrl);

    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /effective policy|malformed/i);
});

test('cloudflare setup paginates the official preset summary shape before deciding to create', async () => {
    const provider = createProviderFake();
    const apiBaseUrl = await provider.listen();
    const first = await runScript('scripts/cloudflare/realtimekit-setup.js', apiBaseUrl);
    assert.equal(first.code, 0, first.stdout + first.stderr);

    const fillers = Array.from({ length: 100 }, (_unused, index) => ({
        id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        name: `unrelated-${index}`,
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:00:00.000Z'
    }));
    provider.state.presets.unshift(...fillers);
    provider.state.requests.length = 0;

    const second = await runScript('scripts/cloudflare/realtimekit-setup.js', apiBaseUrl);

    assert.equal(second.code, 0, second.stdout + second.stderr);
    assert.ok(provider.state.requests.some((request) => request.method === 'GET'
        && request.pathname.endsWith('/presets') && request.search.includes('page_no=2')));
    assert.equal(provider.state.requests.filter((request) => request.method === 'POST').length, 0);
    assert.equal(provider.state.requests.filter((request) => request.method === 'PATCH').length, 0);
    assert.equal(provider.state.presets.filter((preset) => preset.name === STUDENT_NAME).length, 1);
    assert.equal(provider.state.presets.filter((preset) => preset.name === VIEWER_NAME).length, 1);
});
