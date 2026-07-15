const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { verifySupabaseMigrations } = require('../../scripts/verify-supabase-migrations');

const repoRoot = path.resolve(__dirname, '..', '..');

test('Supabase migrations satisfy the additive schema and deny-public-access contract', () => {
    const report = verifySupabaseMigrations({ repoRoot });

    assert.ok(report.files.includes('20260715000000_secure_baseline.sql'));
    assert.deepEqual(report.tables, [
        'deletion_tombstones',
        'focus_sessions',
        'profiles',
        'room_events'
    ]);
    assert.deepEqual(report.protectedViews, ['admin_overview', 'daily_active', 'user_stats']);
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
    assert.ok(report.bytes > 0);
});

test('migration verification rejects destructive SQL before any database is contacted', (t) => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'co-study-migration-contract-'));
    t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

    const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.writeFileSync(
        path.join(migrationsDir, '20260715000000_destructive.sql'),
        'drop table public.profiles;\n',
        'utf8'
    );

    assert.throws(
        () => verifySupabaseMigrations({ repoRoot }),
        /destructive SQL/i
    );
});
