const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { verifySupabaseMigrations } = require('../../scripts/verify-supabase-migrations');

const repoRoot = path.resolve(__dirname, '..', '..');

test('Supabase migrations satisfy the additive schema and deny-public-access contract', () => {
    const report = verifySupabaseMigrations({ repoRoot });

    assert.deepEqual(report.files, [
        '20260715000000_secure_baseline.sql',
        '20260715010000_account_resurrection_focus_idempotency.sql',
        '20260715020000_room_event_idempotency.sql'
    ]);
    assert.deepEqual(report.tables, [
        'deletion_tombstones',
        'focus_completion_claims',
        'focus_sessions',
        'profiles',
        'room_events'
    ]);
    assert.deepEqual(report.protectedViews, ['admin_overview', 'daily_active', 'user_stats']);
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
    assert.ok(report.bytes > 0);
});

test('room event migration adds stable replay and lifecycle columns', () => {
    const migration = fs.readFileSync(
        path.join(
            repoRoot,
            'supabase',
            'migrations',
            '20260715020000_room_event_idempotency.sql'
        ),
        'utf8'
    );

    assert.match(migration, /add column if not exists event_id uuid/i);
    assert.match(migration, /create unique index if not exists room_events_event_id_uidx[\s\S]+event_id/i);
    assert.match(migration, /add column if not exists occurrence_id text/i);
    assert.match(migration, /add column if not exists lifecycle_epoch bigint/i);
    assert.match(migration, /add column if not exists occurred_at timestamptz/i);
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

test('the additive migration blocks profile resurrection and claims focus ids before aggregates', () => {
    const migration = fs.readFileSync(
        path.join(
            repoRoot,
            'supabase',
            'migrations',
            '20260715010000_account_resurrection_focus_idempotency.sql'
        ),
        'utf8'
    );
    assert.match(migration, /create or replace function public\.reject_tombstoned_profile_write/i);
    assert.match(migration, /before insert or update on public\.profiles/i);
    assert.match(migration, /create or replace function public\.lock_account_mutation/i);
    assert.match(migration, /before insert or update on public\.deletion_tombstones/i);
    assert.match(migration, /pg_advisory_xact_lock/i);
    assert.match(migration, /create table if not exists public\.focus_completion_claims/i);

    const v2Start = migration.indexOf('create or replace function public.record_focus_completion_v2');
    assert.notEqual(v2Start, -1);
    const v2Body = migration.slice(v2Start, migration.indexOf('$function$;', v2Start));
    assert.ok(
        v2Body.indexOf('insert into public.focus_completion_claims')
            < v2Body.indexOf('update public.profiles'),
        'every focus completion id must be claimed before updating the profile aggregate'
    );
    assert.ok(
        v2Body.indexOf('insert into public.focus_sessions') < v2Body.indexOf('update public.profiles'),
        'focus completion id must be claimed before updating the profile aggregate'
    );
    assert.match(v2Body, /get diagnostics inserted_rows = row_count/i);
});
