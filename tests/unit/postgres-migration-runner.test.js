const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    MIGRATION_PASSES,
    POSTGRES_IMAGE,
    REQUIRED_SUPABASE_ROLES,
    createSupabaseRoleSql,
    listMigrationFiles,
    verifyPostgresMigrationsApply
} = require('../../scripts/ci/verify-postgres-migrations');

test('PostgreSQL migration validation uses a pinned Postgres 16 Alpine image and Supabase roles', () => {
    assert.equal(POSTGRES_IMAGE, 'postgres:16.4-alpine3.20');
    assert.equal(MIGRATION_PASSES, 2);
    assert.deepEqual(REQUIRED_SUPABASE_ROLES, ['anon', 'authenticated', 'service_role']);

    const roleSql = createSupabaseRoleSql();
    for (const role of REQUIRED_SUPABASE_ROLES) {
        assert.match(roleSql, new RegExp(`create role ${role}\\b`, 'i'));
    }
    assert.match(roleSql, /alter role service_role bypassrls/i);
});

test('migration discovery is lexical, SQL-only, and rejects an empty directory', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-migration-list-'));
    const migrationsDirectory = path.join(temporaryRoot, 'supabase', 'migrations');
    fs.mkdirSync(migrationsDirectory, { recursive: true });

    try {
        fs.writeFileSync(path.join(migrationsDirectory, '20260715000002_second.sql'), 'select 2;\n');
        fs.writeFileSync(path.join(migrationsDirectory, 'README.md'), 'ignored\n');
        fs.writeFileSync(path.join(migrationsDirectory, '20260715000001_first.sql'), 'select 1;\n');

        assert.deepEqual(
            listMigrationFiles(temporaryRoot).map((file) => path.basename(file)),
            ['20260715000001_first.sql', '20260715000002_second.sql']
        );

        fs.rmSync(path.join(migrationsDirectory, '20260715000001_first.sql'));
        fs.rmSync(path.join(migrationsDirectory, '20260715000002_second.sql'));
        assert.throws(() => listMigrationFiles(temporaryRoot), /contains no SQL migrations/i);
    } finally {
        fs.rmSync(temporaryRoot, { force: true, recursive: true });
    }
});

test('migration validation applies every file twice with ON_ERROR_STOP and cleans up after failure', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-migration-run-'));
    const migrationsDirectory = path.join(temporaryRoot, 'supabase', 'migrations');
    fs.mkdirSync(migrationsDirectory, { recursive: true });
    fs.writeFileSync(path.join(migrationsDirectory, '20260715000001_first.sql'), 'select 1;\n');
    fs.writeFileSync(path.join(migrationsDirectory, '20260715000002_second.sql'), 'select 2;\n');

    const calls = [];
    const containerName = 'halastudy-postgres-unit';
    const executeDocker = (args, options = {}) => {
        calls.push({ args, input: options.input?.toString('utf8') || '' });
        if (options.input?.toString('utf8').includes('select 2;')) {
            throw new Error('synthetic migration apply failure');
        }
        return { status: 0, stderr: '', stdout: '' };
    };

    try {
        assert.throws(
            () => verifyPostgresMigrationsApply({ containerName, executeDocker, repoRoot: temporaryRoot, wait: () => {} }),
            /synthetic migration apply failure/
        );

        const runCall = calls.find(({ args }) => args[0] === 'run');
        assert.ok(runCall);
        assert.ok(runCall.args.includes('--network'));
        assert.ok(runCall.args.includes('none'));
        assert.equal(runCall.args.at(-1), POSTGRES_IMAGE);

        const applyCalls = calls.filter(({ args, input }) => args.includes('psql') && /select [12];/.test(input));
        assert.equal(applyCalls.length, 2);
        assert.deepEqual(applyCalls.map(({ input }) => input.trim()), ['select 1;', 'select 2;']);
        for (const { args } of applyCalls) {
            assert.ok(args.includes('ON_ERROR_STOP=1'));
            assert.ok(args.includes('--file'));
            assert.ok(args.includes('-'));
        }

        assert.deepEqual(calls.at(-1).args, ['container', 'rm', '--force', containerName]);
    } finally {
        fs.rmSync(temporaryRoot, { force: true, recursive: true });
    }
});

test('successful migration validation makes two ordered passes', () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-migration-twice-'));
    const migrationsDirectory = path.join(temporaryRoot, 'supabase', 'migrations');
    fs.mkdirSync(migrationsDirectory, { recursive: true });
    fs.writeFileSync(path.join(migrationsDirectory, '20260715000002_second.sql'), 'select 2;\n');
    fs.writeFileSync(path.join(migrationsDirectory, '20260715000001_first.sql'), 'select 1;\n');

    const applied = [];
    let readinessProbes = 0;
    const executeDocker = (args, options = {}) => {
        const input = options.input?.toString('utf8') || '';
        if (args.includes('pg_isready')) readinessProbes += 1;
        if (/select [12];/.test(input)) applied.push(input.trim());
        return { status: 0, stderr: '', stdout: '' };
    };

    try {
        const report = verifyPostgresMigrationsApply({
            containerName: 'halastudy-postgres-success',
            executeDocker,
            repoRoot: temporaryRoot,
            wait: () => {}
        });

        assert.deepEqual(applied, ['select 1;', 'select 2;', 'select 1;', 'select 2;']);
        assert.ok(readinessProbes >= 2, 'PostgreSQL readiness must be stable across multiple probes');
        assert.equal(report.files, 2);
        assert.equal(report.passes, 2);
    } finally {
        fs.rmSync(temporaryRoot, { force: true, recursive: true });
    }
});
