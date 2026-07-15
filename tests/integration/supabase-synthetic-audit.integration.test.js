const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createSupabaseReadOnlyClient } = require('../../services/supabase/client');
const {
    AUDIT_WINDOW_END,
    AUDIT_WINDOW_START,
    parseArgs,
    runSupabaseSyntheticAudit
} = require('../../scripts/audit-supabase-synthetic-records');

function tempReportPath(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-supabase-audit-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return path.join(directory, 'candidate-report.json');
}

test('Supabase synthetic audit is locked to the approved UTC window and writes a redacted candidate report', async (t) => {
    const calls = [];
    const rowsByTable = {
        profiles: [{
            id: '00000000-0000-4000-8000-000000000001',
            email: 'synthetic.student@example.com',
            password_enabled: true,
            auth_provider: 'password',
            banned: false,
            created_at: '2026-07-15T03:45:00.000Z',
            password_hash: 'must-never-enter-the-report',
            google_sub: 'must-never-enter-the-report'
        }],
        focus_sessions: [{
            id: '00000000-0000-4000-8000-000000000002',
            user_id: '00000000-0000-4000-8000-000000000001',
            minutes: 25,
            day_key: '2026-07-15',
            completion_id: 'synthetic-completion-1',
            created_at: '2026-07-15T03:50:00.000Z'
        }],
        room_events: [{
            id: '00000000-0000-4000-8000-000000000003',
            room_code: 'TEST01',
            user_id: '00000000-0000-4000-8000-000000000001',
            owner_user_id: null,
            event_type: 'join',
            created_at: '2026-07-15T04:00:00.000Z',
            nickname: 'must-never-enter-the-report'
        }],
        deletion_tombstones: [{
            user_id: '00000000-0000-4000-8000-000000000004',
            deleted_at: '2026-07-15T04:05:00.000Z',
            expires_at: '2026-08-14T04:05:00.000Z',
            reason: 'user_request'
        }]
    };
    const client = Object.freeze({
        async select(table, query) {
            calls.push({ table, query });
            return rowsByTable[table] || [];
        }
    });
    const outputPath = tempReportPath(t);

    const result = await runSupabaseSyntheticAudit({
        client,
        outputPath,
        now: new Date('2026-07-15T05:00:00.000Z')
    });

    assert.equal(result.outputPath, outputPath);
    assert.equal(result.report.readOnly, true);
    assert.equal(result.report.window.start, AUDIT_WINDOW_START);
    assert.equal(result.report.window.end, AUDIT_WINDOW_END);
    assert.equal(result.report.totalCandidateRows, 4);
    assert.equal(result.report.candidates.profiles[0].emailHint, 's***@example.com');
    assert.match(result.report.candidates.profiles[0].emailSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.report.candidates.deletionTombstones[0].deletedAt, AUDIT_WINDOW_END);

    const serialized = fs.readFileSync(outputPath, 'utf8');
    assert.doesNotMatch(serialized, /synthetic\.student@example\.com/);
    assert.doesNotMatch(serialized, /must-never-enter-the-report/);
    assert.doesNotMatch(serialized, /password_hash|google_sub|nickname/);

    assert.deepEqual(calls.map((call) => call.table), [
        'profiles',
        'focus_sessions',
        'room_events',
        'deletion_tombstones'
    ]);
    for (const { query } of calls) {
        const params = new URLSearchParams(query);
        const timeColumn = params.has('deleted_at') ? 'deleted_at' : 'created_at';
        assert.deepEqual(params.getAll(timeColumn), [
            `gte.${AUDIT_WINDOW_START}`,
            `lte.${AUDIT_WINDOW_END}`
        ]);
        assert.equal(params.get('limit'), '1000');
        assert.equal(params.get('offset'), '0');
        assert.doesNotMatch(params.get('select'), /password_hash|google_sub|nickname/);
    }
});

test('Supabase synthetic audit excludes provider rows outside the locked window and refuses report overwrite', async (t) => {
    const outputPath = tempReportPath(t);
    const client = {
        async select(table) {
            if (table !== 'profiles') return [];
            return [{
                id: 'outside-window',
                email: 'outside@example.com',
                password_enabled: true,
                auth_provider: 'password',
                banned: false,
                created_at: '2026-07-15T04:05:00.001Z'
            }];
        }
    };

    const first = await runSupabaseSyntheticAudit({ client, outputPath });
    assert.equal(first.report.totalCandidateRows, 0);
    assert.equal(first.report.rejectedProviderRows, 1);
    await assert.rejects(
        runSupabaseSyntheticAudit({ client, outputPath }),
        /already exists/i
    );
});

test('Supabase synthetic audit CLI has no destructive or window-override mode', () => {
    assert.deepEqual(parseArgs(['--dry-run', '--output', 'report.json']), {
        dryRun: true,
        help: false,
        outputPath: 'report.json'
    });
    for (const args of [
        ['--delete'],
        ['--apply'],
        ['--from', '2026-01-01T00:00:00Z'],
        ['--to', '2026-12-31T00:00:00Z']
    ]) {
        assert.throws(() => parseArgs(args), /unsupported argument/i);
    }

    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'scripts', 'audit-supabase-synthetic-records.js'),
        'utf8'
    );
    assert.doesNotMatch(source, /\.remove\s*\(|\.insert\s*\(|\.upsert\s*\(|\.rpc\s*\(/);
    assert.doesNotMatch(source, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
});

test('Supabase audit runtime client exposes only frozen GET selection', async () => {
    const requests = [];
    const client = createSupabaseReadOnlyClient({
        url: 'https://audit-project.supabase.invalid',
        serviceKey: 'test-service-key',
        fetchImpl: async (url, options) => {
            requests.push({ url, method: options.method });
            return { ok: true, status: 200, text: async () => '[]' };
        }
    });

    assert.equal(Object.isFrozen(client), true);
    assert.deepEqual(Object.keys(client), ['select']);
    assert.equal('remove' in client, false);
    assert.equal('insert' in client, false);
    assert.equal('upsert' in client, false);
    await client.select('profiles', 'select=id');
    assert.deepEqual(requests.map((request) => request.method), ['GET']);
});
