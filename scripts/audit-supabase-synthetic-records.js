// Read-only containment audit for the fixed 2026-07-15 synthetic-test window.
// This executable exposes no mutation or deletion mode. It queries only a
// minimal column allowlist and writes a redacted candidate report for manual
// review; the report is evidence, never deletion authorization.
const crypto = require('node:crypto');
const path = require('node:path');

const { createSupabaseReadOnlyClient } = require('../services/supabase/client');
const { loadDotEnv } = require('./cloudflare/realtimekit-common');
const { defaultEvidencePath, writeJsonEvidence } = require('./evidence/report-writer');

const AUDIT_WINDOW_START = '2026-07-15T03:40:00.000Z';
const AUDIT_WINDOW_END = '2026-07-15T04:05:00.000Z';
const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 100_000;
const TABLE_SPECS = Object.freeze([
    {
        table: 'profiles',
        reportKey: 'profiles',
        timeColumn: 'created_at',
        columns: 'id,email,password_enabled,auth_provider,banned,created_at'
    },
    {
        table: 'focus_sessions',
        reportKey: 'focusSessions',
        timeColumn: 'created_at',
        columns: 'id,user_id,minutes,day_key,completion_id,created_at'
    },
    {
        table: 'room_events',
        reportKey: 'roomEvents',
        timeColumn: 'created_at',
        columns: 'id,room_code,user_id,owner_user_id,event_type,created_at'
    },
    {
        table: 'deletion_tombstones',
        reportKey: 'deletionTombstones',
        timeColumn: 'deleted_at',
        columns: 'user_id,deleted_at,expires_at,reason'
    }
]);

function parseArgs(argv) {
    const parsed = { dryRun: true, help: false, outputPath: null };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--dry-run') continue;
        if (argument === '--help' || argument === '-h') {
            parsed.help = true;
            continue;
        }
        if (argument === '--output') {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) throw new Error('--output requires a file path.');
            parsed.outputPath = value;
            index += 1;
            continue;
        }
        throw new Error(`Unsupported argument: ${argument}`);
    }
    return parsed;
}

function safeString(value, maxLength = 256) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
}

function inAuditWindow(value) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
        && timestamp >= Date.parse(AUDIT_WINDOW_START)
        && timestamp <= Date.parse(AUDIT_WINDOW_END);
}

function redactEmail(raw) {
    const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    const separator = normalized.lastIndexOf('@');
    if (separator < 1 || separator === normalized.length - 1) {
        return { emailHint: '[invalid]', emailSha256: crypto.createHash('sha256').update(normalized).digest('hex') };
    }
    return {
        emailHint: `${normalized[0]}***@${normalized.slice(separator + 1, separator + 129)}`,
        emailSha256: crypto.createHash('sha256').update(normalized).digest('hex')
    };
}

function projectRow(spec, row) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !inAuditWindow(row[spec.timeColumn])) {
        return null;
    }
    if (spec.table === 'profiles') {
        return {
            id: safeString(row.id),
            createdAt: row.created_at,
            ...redactEmail(row.email),
            passwordEnabled: row.password_enabled === true,
            authProvider: safeString(row.auth_provider, 32) || 'unknown',
            banned: row.banned === true
        };
    }
    if (spec.table === 'focus_sessions') {
        return {
            id: safeString(row.id),
            userId: safeString(row.user_id),
            minutes: Number.isFinite(Number(row.minutes)) ? Number(row.minutes) : null,
            dayKey: safeString(row.day_key, 10),
            completionId: safeString(row.completion_id, 128),
            createdAt: row.created_at
        };
    }
    if (spec.table === 'room_events') {
        return {
            id: safeString(row.id),
            roomCode: safeString(row.room_code, 12),
            userId: safeString(row.user_id),
            ownerUserId: safeString(row.owner_user_id),
            eventType: safeString(row.event_type, 40),
            createdAt: row.created_at
        };
    }
    return {
        userId: safeString(row.user_id),
        deletedAt: row.deleted_at,
        expiresAt: safeString(row.expires_at, 64),
        reason: safeString(row.reason, 40)
    };
}

function buildQuery(spec, offset) {
    const params = new URLSearchParams();
    params.set('select', spec.columns);
    params.append(spec.timeColumn, `gte.${AUDIT_WINDOW_START}`);
    params.append(spec.timeColumn, `lte.${AUDIT_WINDOW_END}`);
    params.set('order', `${spec.timeColumn}.asc`);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return params.toString();
}

async function readCandidateRows(client, spec) {
    const candidates = [];
    let rejectedProviderRows = 0;
    for (let offset = 0; offset < MAX_ROWS_PER_TABLE; offset += PAGE_SIZE) {
        const page = await client.select(spec.table, buildQuery(spec, offset));
        if (!Array.isArray(page)) throw new Error(`Supabase audit expected an array from ${spec.table}.`);
        for (const row of page) {
            const projected = projectRow(spec, row);
            if (projected) candidates.push(projected);
            else rejectedProviderRows += 1;
        }
        if (page.length < PAGE_SIZE) return { candidates, rejectedProviderRows };
    }
    throw new Error(`Supabase audit exceeded ${MAX_ROWS_PER_TABLE} rows for ${spec.table}; report not written.`);
}

function sourceHost(rawUrl) {
    try {
        return new URL(rawUrl).host;
    } catch {
        return 'injected-read-only-client';
    }
}

function safeSourceError(spec, error) {
    const status = Number(error?.status);
    const providerCode = typeof error?.providerCode === 'string'
        && /^[A-Z0-9_]{1,40}$/i.test(error.providerCode)
        ? error.providerCode
        : null;
    return {
        table: spec.table,
        status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
        providerCode
    };
}

async function runSupabaseSyntheticAudit({
    client,
    outputPath,
    now = new Date(),
    env = process.env
} = /** @type {any} */ ({})) {
    const readOnlyClient = client || createSupabaseReadOnlyClient({
        url: env.SUPABASE_URL,
        serviceKey: env.SUPABASE_SERVICE_ROLE_KEY
    });
    if (!readOnlyClient || typeof readOnlyClient.select !== 'function') {
        throw new Error('Supabase synthetic audit requires a read-only select client.');
    }
    const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
    const candidates = {};
    const sourceErrors = [];
    let rejectedProviderRows = 0;
    for (const spec of TABLE_SPECS) {
        try {
            const result = await readCandidateRows(readOnlyClient, spec);
            candidates[spec.reportKey] = result.candidates;
            rejectedProviderRows += result.rejectedProviderRows;
        } catch (error) {
            candidates[spec.reportKey] = [];
            sourceErrors.push(safeSourceError(spec, error));
        }
    }
    const auditComplete = sourceErrors.length === 0;
    const totalCandidateRows = Object.values(candidates)
        .reduce((total, rows) => total + rows.length, 0);
    const evidenceSha256 = crypto.createHash('sha256')
        .update(JSON.stringify({ auditComplete, candidates, rejectedProviderRows, sourceErrors }))
        .digest('hex');
    const report = {
        schemaVersion: 1,
        kind: 'halastudy-supabase-synthetic-candidate-audit',
        generatedAt,
        readOnly: true,
        auditComplete,
        deletionAuthorized: false,
        sourceHost: sourceHost(env.SUPABASE_URL),
        window: { start: AUDIT_WINDOW_START, end: AUDIT_WINDOW_END, inclusive: true },
        totalCandidateRows,
        rejectedProviderRows,
        sourceErrors,
        candidates,
        evidenceSha256,
        operatorNotice: auditComplete
            ? 'Candidates require separate human approval. This tool cannot delete or modify rows.'
            : 'INCOMPLETE: one or more sources could not be read. This report cannot support a zero-candidate conclusion or authorize deletion.'
    };
    const resolvedOutput = outputPath
        ? path.resolve(outputPath)
        : defaultEvidencePath('supabase-synthetic-candidates', { now });
    return { outputPath: writeJsonEvidence(resolvedOutput, report), report };
}

function printHelp() {
    console.log('Usage: npm run audit:supabase-synthetic -- [--dry-run] [--output <new-file.json>]');
    console.log(`Locked inclusive window: ${AUDIT_WINDOW_START} through ${AUDIT_WINDOW_END}`);
    console.log('Read-only: there is no delete/apply mode. Existing reports are never overwritten.');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }
    loadDotEnv();
    const result = await runSupabaseSyntheticAudit({ outputPath: args.outputPath });
    console.log(`Read-only candidate audit wrote ${result.report.totalCandidateRows} row(s) to ${result.outputPath}`);
    if (!result.report.auditComplete) {
        console.error(`Audit incomplete: ${result.report.sourceErrors.length} source(s) could not be read.`);
        process.exitCode = 2;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    AUDIT_WINDOW_END,
    AUDIT_WINDOW_START,
    parseArgs,
    runSupabaseSyntheticAudit
};
