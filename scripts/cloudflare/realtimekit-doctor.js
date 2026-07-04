// npm run cloudflare:doctor  (alias: npm run cf:doctor)
// Read-only readiness gate. Verifies env, Cloudflare app/preset, local launch
// safety flags, backend secret exposure, and frontend CDN pinning. Degrades
// gracefully when credentials or the local server are absent. Never prints secrets.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
    loadCloudflareRealtimeKitEnv,
    cfFetch,
    getRealtimeKitBaseUrl
} = require('./realtimekit-common');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** @type {{ section: string, label: string, status: string, blocker: boolean, note: string }[]} */
const checks = [];
function record(section, label, status, options = {}) {
    checks.push({ section, label, status, blocker: !!options.blocker, note: options.note || '' });
}

function parseBool(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value === undefined || value === null ? '' : value).trim().toLowerCase());
}

function parseIntOrDefault(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function hasId(list, id) {
    return Array.isArray(list) && list.some((item) => item && [item.id, item.app_id, item.appId, item.uuid].includes(id));
}

function hasPreset(list, name) {
    return Array.isArray(list) && list.some((item) => item && (item.name === name || item.preset_name === name));
}

function git(args) {
    return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

async function checkRuntimeConfig(port) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
        const response = await fetch(`http://127.0.0.1:${port}/api/runtime-config`, { signal: controller.signal });
        if (!response.ok) return { running: true, safe: true, note: `runtime-config returned HTTP ${response.status}` };
        const raw = await response.text();
        const lower = raw.toLowerCase();
        const suspiciousKeys = ['apitoken', 'api_token', 'cloudflare', 'secret', 'authorization'].filter((needle) => lower.includes(needle));
        const token = String(process.env.CLOUDFLARE_REALTIMEKIT_API_TOKEN || '').trim();
        const appId = String(process.env.CLOUDFLARE_REALTIMEKIT_APP_ID || '').trim();
        const valueLeak = (token && raw.includes(token)) || (appId && raw.includes(appId));
        const safe = suspiciousKeys.length === 0 && !valueLeak;
        return { running: true, safe, note: safe ? '' : `exposes ${suspiciousKeys.join(', ') || 'a credential value'}` };
    } catch (_error) {
        return { running: false, safe: true, note: 'local server not running (skipped)' };
    } finally {
        clearTimeout(timer);
    }
}

async function main() {
    const env = loadCloudflareRealtimeKitEnv();
    const { apiBaseUrl } = getRealtimeKitBaseUrl();

    // --- Env ---------------------------------------------------------------
    record('Env', 'Account ID present', env.accountId ? 'PASS' : 'FAIL', { blocker: !env.accountId });
    record('Env', 'App ID present', env.appId ? 'PASS' : 'FAIL', { blocker: !env.appId });
    record('Env', 'API token present (redacted)', env.apiToken ? 'PASS' : 'FAIL', { blocker: !env.apiToken });

    // --- Cloudflare --------------------------------------------------------
    const haveCreds = env.accountId && env.appId && env.apiToken;
    if (haveCreds) {
        const apps = await cfFetch('/apps');
        record('Cloudflare', `API reachable (${apiBaseUrl})`, apps.ok ? 'PASS' : 'FAIL', { blocker: !apps.ok, note: apps.ok ? '' : `HTTP ${apps.status}: ${apps.error}` });
        const appExists = apps.ok && hasId(apps.result, env.appId);
        record('Cloudflare', 'App exists', appExists ? 'PASS' : 'FAIL', { blocker: !appExists, note: appExists ? '' : 'configured app id not found' });
        if (appExists) {
            const presets = await cfFetch(`/${encodeURIComponent(env.appId)}/presets`);
            const presetOk = presets.ok && hasPreset(presets.result, env.presetName);
            record('Cloudflare', `Preset ${env.presetName} exists`, presetOk ? 'PASS' : 'FAIL', { blocker: !presetOk, note: presetOk ? '' : 'run cloudflare:setup or create it in the dashboard' });
        } else {
            record('Cloudflare', `Preset ${env.presetName} exists`, 'FAIL', { blocker: true, note: 'app not verified' });
        }
    } else {
        record('Cloudflare', 'API reachable', 'SKIP', { note: 'credentials missing' });
        record('Cloudflare', 'App exists', 'SKIP', { note: 'credentials missing' });
        record('Cloudflare', `Preset ${env.presetName} exists`, 'FAIL', { blocker: true, note: 'cannot verify without credentials' });
    }

    // --- Local safety ------------------------------------------------------
    const recording = parseBool(process.env.VIDEO_RECORDING_ENABLED);
    const screenshare = parseBool(process.env.VIDEO_SCREENSHARE_ENABLED);
    const chat = parseBool(process.env.VIDEO_CHAT_ENABLED);
    const maxGlobal = parseIntOrDefault(process.env.MAX_GLOBAL_VIDEO_PARTICIPANTS, 20);
    const maxRoom = parseIntOrDefault(process.env.MAX_ROOM_VIDEO_PARTICIPANTS, 20);
    const joinDisabled = parseBool(process.env.VIDEO_JOIN_DISABLED);

    record('Local safety', 'VIDEO_RECORDING_ENABLED is false', recording ? 'FAIL' : 'PASS', { blocker: recording, note: recording ? 'must stay false for MVP' : '' });
    record('Local safety', 'VIDEO_SCREENSHARE_ENABLED is false', screenshare ? 'FAIL' : 'PASS', { blocker: screenshare });
    record('Local safety', 'VIDEO_CHAT_ENABLED is false', chat ? 'FAIL' : 'PASS', { blocker: chat });
    record('Local safety', 'MAX_GLOBAL_VIDEO_PARTICIPANTS <= 20', maxGlobal <= 20 ? 'PASS' : 'FAIL', { blocker: maxGlobal > 20, note: `= ${maxGlobal}` });
    record('Local safety', 'MAX_ROOM_VIDEO_PARTICIPANTS <= 20', maxRoom <= 20 ? 'PASS' : 'FAIL', { blocker: maxRoom > 20, note: `= ${maxRoom}` });
    record('Local safety', 'VIDEO_JOIN_DISABLED is false', joinDisabled ? 'WARN' : 'PASS', { note: joinDisabled ? 'kill switch ACTIVE — expected only while testing' : '' });

    const runtime = await checkRuntimeConfig(process.env.PORT || '3000');
    record('Local safety', '/api/runtime-config hides Cloudflare credentials', runtime.running ? (runtime.safe ? 'PASS' : 'FAIL') : 'SKIP', { blocker: runtime.running && !runtime.safe, note: runtime.note });

    // package scripts wired
    let pkgScripts = {};
    try {
        pkgScripts = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).scripts || {};
    } catch (_error) {
        pkgScripts = {};
    }
    const requiredScripts = ['cloudflare:setup', 'cloudflare:smoke', 'cloudflare:doctor', 'cloudflare:cleanup', 'cloudflare:cost-check'];
    const missingScripts = requiredScripts.filter((name) => !pkgScripts[name]);
    record('Local safety', 'package.json cloudflare:* scripts exist', missingScripts.length ? 'FAIL' : 'PASS', { blocker: missingScripts.length > 0, note: missingScripts.join(', ') });

    // git hygiene
    const ignore = git(['check-ignore', '.env']);
    if (ignore.status === null) {
        record('Local safety', '.env is git-ignored', 'SKIP', { note: 'git unavailable' });
    } else {
        const ignored = ignore.status === 0 && String(ignore.stdout || '').trim().length > 0;
        record('Local safety', '.env is git-ignored', ignored ? 'PASS' : 'FAIL', { blocker: !ignored, note: ignored ? '' : 'add .env to .gitignore' });
        const tracked = git(['ls-files', '.env']);
        const isTracked = String(tracked.stdout || '').trim().length > 0;
        record('Local safety', '.env is not committed', isTracked ? 'FAIL' : 'PASS', { blocker: isTracked, note: isTracked ? '.env is tracked by git — remove it' : '' });
        const grep = git(['grep', '-I', '-l', '-E', 'cfat_[A-Za-z0-9]{20,}']);
        const committed = grep.status === 0 && String(grep.stdout || '').trim().length > 0;
        record('Local safety', 'no committed Cloudflare API token', committed ? 'FAIL' : 'PASS', { blocker: committed, note: committed ? 'a cfat_ token appears in a tracked file' : '' });
    }

    // --- Frontend ----------------------------------------------------------
    try {
        const clientSrc = fs.readFileSync(path.join(REPO_ROOT, 'public', 'js', 'video', 'realtimekit-client.js'), 'utf8');
        const usesLatest = /@cloudflare\/realtimekit(?:-ui)?@latest/.test(clientSrc);
        record('Frontend', 'RealtimeKit CDN versions pinned', usesLatest ? 'FAIL' : 'PASS', { blocker: usesLatest, note: usesLatest ? 'realtimekit-client.js uses @latest — pin exact versions before beta' : '' });
    } catch (_error) {
        record('Frontend', 'RealtimeKit CDN versions pinned', 'FAIL', { blocker: true, note: 'realtimekit-client.js not found' });
    }

    // --- Report ------------------------------------------------------------
    console.log('Halastudy Cloudflare Doctor');
    for (const section of ['Env', 'Cloudflare', 'Local safety', 'Frontend']) {
        const items = checks.filter((entry) => entry.section === section);
        if (!items.length) continue;
        console.log(`\n${section}:`);
        for (const item of items) {
            console.log(`- ${item.label}: ${item.status}${item.note ? ` (${item.note})` : ''}`);
        }
    }

    const blockers = checks.filter((entry) => entry.blocker && entry.status === 'FAIL');
    console.log(`\nOverall: ${blockers.length ? 'FAIL' : 'PASS'}`);
    if (blockers.length) {
        console.log('Blockers:');
        for (const blocker of blockers) {
            console.log(`- ${blocker.label}${blocker.note ? `: ${blocker.note}` : ''}`);
        }
    }
    process.exit(blockers.length ? 1 : 0);
}

main().catch((error) => {
    console.error(`Doctor failed: ${error.message}`);
    process.exit(1);
});
