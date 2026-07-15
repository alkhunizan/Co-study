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

function createPostMigrationAssertionSql() {
    return `
do $assertions$
declare
    first_completion record;
    replayed_completion record;
    blocked boolean := false;
    protected_table_count integer;
begin
    select count(*) into protected_table_count
    from pg_catalog.pg_class
    where oid in (
        'public.profiles'::regclass,
        'public.focus_sessions'::regclass,
        'public.focus_completion_claims'::regclass,
        'public.room_events'::regclass,
        'public.deletion_tombstones'::regclass
    ) and relrowsecurity and relforcerowsecurity;
    if protected_table_count <> 5 then
        raise exception 'expected five FORCE RLS tables, found %', protected_table_count;
    end if;
    if has_table_privilege('anon', 'public.profiles', 'select')
       or has_table_privilege('authenticated', 'public.profiles', 'select') then
        raise exception 'public API roles retained direct profile access';
    end if;
    if not has_table_privilege('service_role', 'public.profiles', 'select,insert,update,delete') then
        raise exception 'service_role profile access is missing';
    end if;
    if to_regprocedure(
        'public.record_focus_completion_v2(uuid,jsonb,integer,integer,date,text,integer,date)'
    ) is null or to_regprocedure(
        'public.delete_profile_with_tombstone(uuid,timestamp with time zone)'
    ) is null then
        raise exception 'required durable RPCs are missing';
    end if;

    insert into public.profiles (
        id, email, password_hash, password_enabled, display_name
    ) values (
        '00000000-0000-4000-8000-000000000001',
        'migration-gate@example.invalid',
        'test-only:hash',
        true,
        'Migration Gate'
    );

    select * into first_completion
    from public.record_focus_completion_v2(
        '00000000-0000-4000-8000-000000000001',
        '{"days":{},"totalFocusMinutes":0,"totalSessions":0,"completions":[]}'::jsonb,
        0,
        0,
        null,
        'migration-zero-claim',
        0,
        current_date
    );
    select * into replayed_completion
    from public.record_focus_completion_v2(
        '00000000-0000-4000-8000-000000000001',
        '{"days":{},"totalFocusMinutes":999,"totalSessions":999,"completions":[]}'::jsonb,
        99,
        99,
        current_date,
        'migration-zero-claim',
        200,
        current_date
    );
    if first_completion.duplicate or first_completion.accepted_minutes <> 0
       or not replayed_completion.duplicate or replayed_completion.accepted_minutes <> 0 then
        raise exception 'focus completion claim/replay contract failed';
    end if;

    perform public.delete_profile_with_tombstone(
        '00000000-0000-4000-8000-000000000001',
        now()
    );
    if exists (
        select 1 from public.profiles
        where id = '00000000-0000-4000-8000-000000000001'
    ) then
        raise exception 'durable deletion left the profile live';
    end if;
    begin
        insert into public.profiles (
            id, email, password_hash, password_enabled, display_name
        ) values (
            '00000000-0000-4000-8000-000000000001',
            'migration-gate@example.invalid',
            'test-only:hash',
            true,
            'Migration Gate'
        );
    exception when others then
        blocked := true;
    end;
    if not blocked then
        raise exception 'current tombstone allowed profile resurrection';
    end if;

    update public.deletion_tombstones
    set deleted_at = now() - interval '31 days',
        expires_at = now() - interval '1 day'
    where user_id = '00000000-0000-4000-8000-000000000001';
    insert into public.profiles (
        id, email, password_hash, password_enabled, display_name
    ) values (
        '00000000-0000-4000-8000-000000000001',
        'migration-gate@example.invalid',
        'test-only:hash',
        true,
        'Migration Gate'
    );
end
$assertions$;
`;
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

        executeDocker(psqlArguments(containerName), {
            input: Buffer.from(createPostMigrationAssertionSql(), 'utf8')
        });

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
    createPostMigrationAssertionSql,
    executeDockerCommand,
    listMigrationFiles,
    verifyPostgresMigrationsApply
};
