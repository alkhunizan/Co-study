const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { evaluateCostMonitor } = require('../../scripts/cloudflare/realtimekit-cost-check');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'cloudflare', 'realtimekit-cost-check.js');

function runCostCheck(env = {}) {
    return spawnSync(process.execPath, [SCRIPT], {
        cwd: REPO_ROOT,
        env: {
            SystemRoot: process.env.SystemRoot,
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            ...env
        },
        encoding: 'utf8'
    });
}

function writeRegistry(filePath, occupancy, now) {
    const sessions = Array.from({ length: occupancy }, (_unused, index) => ({
        videoSessionId: `video-session-${String(index).padStart(32, '0')}`,
        roomId: 'ROOM01',
        userId: `user-${index}`,
        providerMeetingId: 'meeting-1',
        providerPeerIds: [],
        state: 'pending',
        joinedAt: now - 60_000,
        pendingExpiresAt: now + 30_000
    }));
    fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 1, sessions }), 'utf8');
}

test('cost monitor emits distinct 70, 85, and 100 percent occupancy alerts from durable registry state', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-cost-thresholds-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const registryFile = path.join(directory, 'video-sessions.json');
    const now = Date.now();

    const cases = [
        { occupancy: 14, expected: 'NOTICE (70% threshold)', exitCode: 2 },
        { occupancy: 17, expected: 'WARNING (85% threshold)', exitCode: 2 },
        { occupancy: 20, expected: 'CRITICAL (100% threshold)', exitCode: 1 }
    ];
    for (const { occupancy, expected, exitCode } of cases) {
        writeRegistry(registryFile, occupancy, now);
        const result = runCostCheck({
            VIDEO_SESSION_STATE_FILE: registryFile,
            MAX_GLOBAL_VIDEO_PARTICIPANTS: '20',
            REALTIMEKIT_MONTHLY_COST_CAP_USD: '500'
        });
        assert.match(result.stdout, new RegExp(`Registry occupancy: ${occupancy}/20`));
        assert.match(result.stdout, new RegExp(expected.replace(/[()]/g, '\\$&')));
        assert.equal(result.status, exitCode);
    }
});

test('projected cost uses the configured monthly cap for the same alert bands', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-cost-projection-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    const cases = [
        { cap: '400', level: 'notice', threshold: 70 },
        { cap: '330', level: 'warning', threshold: 85 },
        { cap: '288', level: 'critical', threshold: 100 }
    ];
    for (const expected of cases) {
        const result = evaluateCostMonitor({
            repoRoot: directory,
            env: { REALTIMEKIT_MONTHLY_COST_CAP_USD: expected.cap }
        });
        assert.equal(result.alerts[0].metric, 'Projected monthly cost');
        assert.equal(result.alerts[0].level, expected.level);
        assert.equal(result.alerts[0].threshold, expected.threshold);
    }
});

test('cost monitor reads registry durationSeconds logs and webhook acceptance evidence without provider credentials', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-cost-evidence-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const registryFile = path.join(directory, 'video-sessions.json');
    const logFile = path.join(directory, 'video-events.jsonl');
    const webhookFile = path.join(directory, 'realtimekit-webhooks.json');
    const now = Date.now();
    writeRegistry(registryFile, 1, now);
    fs.writeFileSync(logFile, [
        JSON.stringify({
            event: 'video_session_ended',
            timestamp: new Date(now - 60_000).toISOString(),
            videoSessionId: 'ended-session-1',
            durationSeconds: 600
        }),
        JSON.stringify({ event: 'unrelated', durationSeconds: 9999 })
    ].join('\n'), 'utf8');
    fs.writeFileSync(webhookFile, `${[
        JSON.stringify({ schemaVersion: 2, type: 'header' }),
        JSON.stringify({ type: 'accepted', deliveryId: 'delivery-1', acceptedAt: now - 1_000 })
    ].join('\n')}\n`, 'utf8');

    const result = runCostCheck({
        VIDEO_SESSION_STATE_FILE: registryFile,
        VIDEO_SESSION_LOG_FILE: logFile,
        REALTIMEKIT_WEBHOOK_STATE_FILE: webhookFile,
        MAX_GLOBAL_VIDEO_PARTICIPANTS: '20',
        REALTIMEKIT_MONTHLY_COST_CAP_USD: '500'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Completed usage this UTC month: 10\.0 participant-minutes/);
    assert.match(result.stdout, /Webhook evidence: 1 accepted deliveries/);
    assert.doesNotMatch(result.stdout + result.stderr, /missing.*token/i);
});

test('cost monitor fails closed when an explicitly configured durable evidence file is malformed', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-cost-invalid-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const registryFile = path.join(directory, 'video-sessions.json');
    fs.writeFileSync(registryFile, '{"schemaVersion":999,"sessions":[]}', 'utf8');

    const result = runCostCheck({
        VIDEO_SESSION_STATE_FILE: registryFile,
        REALTIMEKIT_MONTHLY_COST_CAP_USD: '500'
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Durable registry evidence: FAIL/);

    fs.writeFileSync(registryFile, JSON.stringify({
        schemaVersion: 1,
        sessions: [{
            videoSessionId: 'video-session-invalid-peer',
            roomId: 'ROOM01',
            providerMeetingId: 'meeting-1',
            state: 'active',
            providerPeerIds: [42]
        }]
    }), 'utf8');
    const malformedRecord = runCostCheck({
        VIDEO_SESSION_STATE_FILE: registryFile,
        REALTIMEKIT_MONTHLY_COST_CAP_USD: '500'
    });
    assert.equal(malformedRecord.status, 1);
    assert.match(malformedRecord.stdout, /Durable registry evidence: FAIL/);
});

test('cost monitor remains projection-only and successful when no local evidence or credentials exist', () => {
    const result = runCostCheck({
        ROOM_STATE_FILE: path.join(os.tmpdir(), `missing-cost-state-${Date.now()}.json`),
        REALTIMEKIT_MONTHLY_COST_CAP_USD: '500'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Durable registry evidence: unavailable/);
    assert.match(result.stdout, /Overall: PASS/);
});
