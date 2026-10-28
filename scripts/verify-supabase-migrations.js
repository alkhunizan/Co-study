const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_TABLES = [
    'deletion_tombstones',
    'focus_completion_claims',
    'focus_sessions',
    'profiles',
    'room_events'
];
const PROTECTED_VIEWS = ['admin_overview', 'daily_active', 'user_stats'];
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/;

function stripComments(sql) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\r\n]*/g, ' ');
}

function requirePattern(sql, pattern, message) {
    if (!pattern.test(sql)) throw new Error(`Supabase migration contract failed: ${message}.`);
}

function verifySupabaseMigrations({ repoRoot = path.resolve(__dirname, '..') } = {}) {
    const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        throw new Error(`Supabase migrations directory is missing: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
    if (files.length === 0) throw new Error('Supabase migrations directory contains no SQL migrations.');

    const timestamps = new Set();
    const documents = files.map((name) => {
        if (!MIGRATION_NAME_PATTERN.test(name)) {
            throw new Error(`Invalid Supabase migration filename: ${name}`);
        }
        const timestamp = name.slice(0, 14);
        if (timestamps.has(timestamp)) throw new Error(`Duplicate Supabase migration timestamp: ${timestamp}`);
        timestamps.add(timestamp);
        return {
            name,
            sql: fs.readFileSync(path.join(migrationsDir, name), 'utf8').replace(/\r\n/g, '\n')
        };
    });

    const combined = documents.map(({ name, sql }) => `-- ${name}\n${sql}`).join('\n');
    const executableSql = stripComments(combined);
    const destructiveScanSql = executableSql.replace(
        /delete\s+from\s+public\.profiles\s+where\s+id\s*=\s*p_user_id\s*;/i,
        ''
    );
    const destructivePatterns = [
        /\bdrop\s+(?:table|schema|column)\b/i,
        /\btruncate\b/i,
        /\bdelete\s+from\b/i,
        /\bdisable\s+row\s+level\s+security\b/i
    ];
    if (destructivePatterns.some((pattern) => pattern.test(destructiveScanSql))) {
        throw new Error('Supabase migration dry-run rejected destructive SQL.');
    }
    if (/\bcreate\s+policy\b/i.test(executableSql)) {
        throw new Error('Supabase migration dry-run rejected a public-table RLS policy.');
    }
    if (/\bgrant\s+[^;]+\s+to\s+(?:anon|authenticated)\b/i.test(executableSql)) {
        throw new Error('Supabase migration dry-run rejected a direct anon/authenticated grant.');
    }

    for (const { name, sql } of documents) {
        const body = stripComments(sql);
        requirePattern(body, /^\s*begin\s*;/i, `${name} must start with BEGIN`);
        requirePattern(body, /commit\s*;\s*$/i, `${name} must end with COMMIT`);
    }

    for (const table of REQUIRED_TABLES) {
        requirePattern(
            executableSql,
            new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, 'i'),
            `public.${table} baseline table is missing`
        );
        requirePattern(
            executableSql,
            new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
            `public.${table} must enable RLS`
        );
        requirePattern(
            executableSql,
            new RegExp(`alter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security`, 'i'),
            `public.${table} must force RLS`
        );
        requirePattern(
            executableSql,
            new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'i'),
            `public.${table} must revoke public client roles`
        );
        requirePattern(
            executableSql,
            new RegExp(`grant\\s+select\\s*,\\s*insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+service_role`, 'i'),
            `public.${table} must retain server service-role access`
        );
    }

    for (const view of PROTECTED_VIEWS) {
        requirePattern(
            executableSql,
            new RegExp(`to_regclass\\(\\s*'public\\.${view}'\\s*\\)`, 'i'),
            `public.${view} must be handled conditionally`
        );
        requirePattern(
            executableSql,
            new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${view}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'i'),
            `public.${view} must revoke public client roles`
        );
        requirePattern(
            executableSql,
            new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${view}\\s+to\\s+service_role`, 'i'),
            `public.${view} must retain service-role reads`
        );
    }

    const schemaContracts = [
        [/alter\s+table\s+public\.profiles\s+alter\s+column\s+password_hash\s+drop\s+not\s+null/i, 'password_hash must be nullable'],
        [/add\s+column\s+if\s+not\s+exists\s+password_enabled\s+boolean/i, 'password_enabled is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+google_sub\s+text/i, 'google_sub is missing'],
        [/create\s+unique\s+index\s+if\s+not\s+exists\s+profiles_google_sub_uidx[\s\S]+where\s+google_sub\s+is\s+not\s+null/i, 'nullable google_sub uniqueness is missing'],
        [/create\s+unique\s+index\s+if\s+not\s+exists\s+profiles_normalized_email_uidx[\s\S]+lower\s*\(\s*btrim\s*\(\s*email\s*\)\s*\)/i, 'normalized email uniqueness is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+completion_id\s+text/i, 'focus completion_id is missing'],
        [/create\s+unique\s+index\s+if\s+not\s+exists\s+focus_sessions_completion_uidx[\s\S]+user_id\s*,\s*completion_id[\s\S]+where\s+completion_id\s+is\s+not\s+null/i, 'focus completion idempotency index is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+room_schema_version\s+smallint/i, 'room schema version is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+owner_user_id\s+uuid/i, 'room owner identity is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+room_expires_at\s+timestamptz/i, 'room expiry is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+event_id\s+uuid/i, 'room event idempotency key is missing'],
        [/create\s+unique\s+index\s+if\s+not\s+exists\s+room_events_event_id_uidx[\s\S]+event_id/i, 'room event idempotency index is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+occurrence_id\s+text/i, 'room event occurrence identity is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+lifecycle_epoch\s+bigint/i, 'room event lifecycle epoch is missing'],
        [/add\s+column\s+if\s+not\s+exists\s+occurred_at\s+timestamptz/i, 'room event occurrence timestamp is missing'],
        [/expires_at\s+timestamptz\s+not\s+null\s+default\s*\(\s*now\s*\(\s*\)\s*\+\s*interval\s+'30 days'\s*\)/i, '30-day deletion tombstone expiry is missing'],
        [/create\s+or\s+replace\s+function\s+public\.record_focus_completion/i, 'atomic focus completion function is missing'],
        [/create\s+or\s+replace\s+function\s+public\.delete_profile_with_tombstone/i, 'durable account deletion function is missing']
    ];
    for (const [pattern, message] of schemaContracts) requirePattern(executableSql, pattern, message);

    return {
        files,
        tables: [...REQUIRED_TABLES],
        protectedViews: [...PROTECTED_VIEWS],
        bytes: Buffer.byteLength(combined),
        sha256: crypto.createHash('sha256').update(combined).digest('hex')
    };
}

if (require.main === module) {
    try {
        const report = verifySupabaseMigrations();
        process.stdout.write(`${JSON.stringify({ ok: true, ...report }, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { verifySupabaseMigrations };
