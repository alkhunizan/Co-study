const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const POSTGRES_IMAGE = 'postgres:16.4-alpine3.20';
const MIGRATION_PASSES = 2;
const REQUIRED_SUPABASE_ROLES = Object.freeze(['anon', 'authenticated', 'service_role']);
const MAX_COMMAND_OUTPUT_BYTES = 16 * 1024 * 1024;
const POSTGRES_READY_ATTEMPTS = 60;
const POSTGRES_READY_INTERVAL_MS = 500;
const POSTGRES_STABLE_READY_PROBES = 3;

function isCommandMissing(error) {
    return /** @type {NodeJS.ErrnoException | undefined} */ (error)?.code === 'ENOENT';
}

/**
 * @param {string[]} args
 * @param {{ allowFailure?: boolean, capture?: boolean, input?: string | Buffer }} [options]
 */
function executeDockerCommand(args, { allowFailure = false, capture = false, input } = {}) {
    const hasInput = input !== undefined;
    const result = spawnSync('docker', args, {
        cwd: repoRoot,
        encoding: capture ? 'utf8' : undefined,
        input,
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
        shell: false,
        stdio: capture
            ? [hasInput ? 'pipe' : 'ignore', 'pipe', 'pipe']
            : [hasInput ? 'pipe' : 'inherit', 'inherit', 'inherit']
    });

    if (isCommandMissing(result.error)) {
        throw new Error('Docker is required for disposable PostgreSQL migration validation.');
    }
    if (result.error) throw result.error;

    const status = result.status ?? 1;
    const stdout = capture ? String(result.stdout || '') : '';
    const stderr = capture ? String(result.stderr || '') : '';
    if (!allowFailure && status !== 0) {
        const detail = String(stderr || stdout).trim();
        throw new Error(`docker ${args.join(' ')} failed with status ${status}${detail ? `: ${detail}` : ''}`);
    }

    return { status, stderr, stdout };
}

function listMigrationFiles(root = repoRoot) {
    const migrationsDirectory = path.join(root, 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDirectory)) {
        throw new Error(`Supabase migrations directory is missing: ${migrationsDirectory}`);
    }

    const files = fs.readdirSync(migrationsDirectory)
        .filter((name) => name.endsWith('.sql'))
        .sort()
        .map((name) => path.join(migrationsDirectory, name));
    if (files.length === 0) {
        throw new Error(`Supabase migrations directory contains no SQL migrations: ${migrationsDirectory}`);
    }
    return files;
}

function createSupabaseRoleSql() {
    return [
        'do $roles$',
        'begin',
        "    if not exists (select 1 from pg_roles where rolname = 'anon') then",
        '        create role anon nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;',
        '    end if;',
        "    if not exists (select 1 from pg_roles where rolname = 'authenticated') then",
        '        create role authenticated nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;',
        '    end if;',
        "    if not exists (select 1 from pg_roles where rolname = 'service_role') then",
        '        create role service_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;',
        '    end if;',
        '    alter role service_role bypassrls;',
        'end',
        '$roles$;',
        ''
    ].join('\n');
}

function psqlArguments(containerName) {
    return [
        'exec',
        '--interactive',
        containerName,
        'psql',
        '--username',
        'postgres',
        '--dbname',
        'postgres',
        '--no-psqlrc',
        '--set',
        'ON_ERROR_STOP=1',
        '--file',
        '-'
    ];
}

function blockingWait(milliseconds) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function waitForPostgres(containerName, executeDocker, wait) {
    let consecutiveReadyProbes = 0;
    for (let attempt = 1; attempt <= POSTGRES_READY_ATTEMPTS; attempt += 1) {
        const result = executeDocker([
            'exec',
            containerName,
            'pg_isready',
            '--username',
            'postgres',
            '--dbname',
            'postgres'
        ], { allowFailure: true, capture: true });
        consecutiveReadyProbes = result.status === 0 ? consecutiveReadyProbes + 1 : 0;
        if (consecutiveReadyProbes >= POSTGRES_STABLE_READY_PROBES) return;
        if (attempt < POSTGRES_READY_ATTEMPTS) wait(POSTGRES_READY_INTERVAL_MS);
    }
    throw new Error(`Disposable PostgreSQL container ${containerName} did not become ready.`);
}

function verifyPostgresMigrationsApply({
    containerName = `halastudy-postgres-migrations-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
    executeDocker = executeDockerCommand,
    repoRoot: validationRoot = repoRoot,
    wait = blockingWait
} = {}) {
    const migrations = listMigrationFiles(validationRoot);
    let containerAttempted = false;

    try {
        executeDocker(['version'], { capture: true });
        containerAttempted = true;
        executeDocker([
            'run',
            '--detach',
            '--name',
            containerName,
            '--network',
            'none',
            '--env',
            'POSTGRES_HOST_AUTH_METHOD=trust',
            '--tmpfs',
            '/var/lib/postgresql/data:rw,noexec,nosuid,size=256m',
            POSTGRES_IMAGE
        ]);
        waitForPostgres(containerName, executeDocker, wait);

        executeDocker(psqlArguments(containerName), {
            input: Buffer.from(createSupabaseRoleSql(), 'utf8')
        });

        for (let pass = 1; pass <= MIGRATION_PASSES; pass += 1) {
            for (const migrationPath of migrations) {
                try {
                    executeDocker(psqlArguments(containerName), {
                        input: fs.readFileSync(migrationPath)
                    });
                } catch (error) {
                    throw new Error(
                        `Migration ${path.basename(migrationPath)} failed on pass ${pass}: ${error.message}`
                    );
                }
            }
        }

        const report = {
            files: migrations.length,
            image: POSTGRES_IMAGE,
            passes: MIGRATION_PASSES
        };
        process.stdout.write(`${JSON.stringify({ ok: true, ...report })}\n`);
        return report;
    } finally {
        if (containerAttempted) {
            executeDocker(['container', 'rm', '--force', containerName], {
                allowFailure: true,
                capture: true
            });
        }
    }
}

if (require.main === module) {
    try {
        verifyPostgresMigrationsApply();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    MIGRATION_PASSES,
    POSTGRES_IMAGE,
    REQUIRED_SUPABASE_ROLES,
    createSupabaseRoleSql,
    executeDockerCommand,
    listMigrationFiles,
    verifyPostgresMigrationsApply
};
