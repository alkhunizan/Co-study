// npm run cloudflare:cost-check
// Read-only RealtimeKit cost and capacity monitor. It uses the same durable
// registry/webhook records as the server when they are available, and never
// calls Cloudflare or requires provider credentials.

const fs = require('node:fs');
const path = require('node:path');

const { loadDotEnv } = require('./realtimekit-common');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CONCURRENT = 20;
const DEFAULT_HOURS_PER_DAY = 4;
const DEFAULT_DAYS_PER_MONTH = 30;
const DEFAULT_RATE_PER_MINUTE_USD = 0.002;
const DEFAULT_MONTHLY_COST_CAP_USD = 500;
const MAX_REGISTRY_BYTES = 5 * 1024 * 1024;
const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;
const MAX_EVENT_LOG_BYTES = 32 * 1024 * 1024;
const OCCUPYING_STATES = new Set(['pending', 'active', 'ending']);

const ALERT_BANDS = Object.freeze([
    { threshold: 100, level: 'critical' },
    { threshold: 85, level: 'warning' },
    { threshold: 70, level: 'notice' }
]);

function parsePositiveNumber(value, name, fallback, options = {}) {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const parsed = Number(String(value).trim());
    const integerValid = !options.integer || Number.isInteger(parsed);
    const maximumValid = !Number.isFinite(options.maximum) || parsed <= options.maximum;
    if (!Number.isFinite(parsed) || parsed <= 0 || !integerValid || !maximumValid) {
        throw new Error(`${name} must be a positive${options.integer ? ' integer' : ''}${
            Number.isFinite(options.maximum) ? ` no greater than ${options.maximum}` : ''
        }.`);
    }
    return parsed;
}

function resolveMonitorConfig(env = process.env, repoRoot = REPO_ROOT) {
    const participantCap = parsePositiveNumber(
        env.MAX_GLOBAL_VIDEO_PARTICIPANTS,
        'MAX_GLOBAL_VIDEO_PARTICIPANTS',
        DEFAULT_CONCURRENT,
        { integer: true, maximum: 10_000 }
    );
    const hoursPerDay = parsePositiveNumber(
        env.REALTIMEKIT_EXPECTED_HOURS_PER_DAY,
        'REALTIMEKIT_EXPECTED_HOURS_PER_DAY',
        DEFAULT_HOURS_PER_DAY,
        { maximum: 24 }
    );
    const daysPerMonth = parsePositiveNumber(
        env.REALTIMEKIT_EXPECTED_DAYS_PER_MONTH,
        'REALTIMEKIT_EXPECTED_DAYS_PER_MONTH',
        DEFAULT_DAYS_PER_MONTH,
        { integer: true, maximum: 31 }
    );
    const ratePerMinuteUsd = parsePositiveNumber(
        env.REALTIMEKIT_RATE_PER_PARTICIPANT_MINUTE_USD,
        'REALTIMEKIT_RATE_PER_PARTICIPANT_MINUTE_USD',
        DEFAULT_RATE_PER_MINUTE_USD,
        { maximum: 100 }
    );
    const monthlyCostCapUsd = parsePositiveNumber(
        env.REALTIMEKIT_MONTHLY_COST_CAP_USD,
        'REALTIMEKIT_MONTHLY_COST_CAP_USD',
        DEFAULT_MONTHLY_COST_CAP_USD,
        { maximum: 1_000_000_000 }
    );
    const roomStateFile = path.resolve(env.ROOM_STATE_FILE || path.join(repoRoot, 'data', 'rooms.json'));

    return {
        participantCap,
        hoursPerDay,
        daysPerMonth,
        ratePerMinuteUsd,
        monthlyCostCapUsd,
        registryFile: path.resolve(env.VIDEO_SESSION_STATE_FILE || `${roomStateFile}.video-sessions.json`),
        webhookFile: path.resolve(env.REALTIMEKIT_WEBHOOK_STATE_FILE || `${roomStateFile}.realtimekit-webhooks.json`),
        eventLogCandidates: [
            env.VIDEO_SESSION_LOG_FILE,
            path.join(repoRoot, 'data', 'video-sessions.log'),
            path.join(repoRoot, 'logs', 'video-sessions.log')
        ].filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => path.resolve(entry))
    };
}

function projectMonthlyCost(config) {
    const participantMinutes = config.participantCap
        * config.hoursPerDay
        * 60
        * config.daysPerMonth;
    return {
        participantMinutes,
        costUsd: participantMinutes * config.ratePerMinuteUsd
    };
}

function classifyUtilization(percent) {
    if (!Number.isFinite(percent) || percent < 0) return { level: 'invalid', threshold: null };
    return ALERT_BANDS.find((band) => percent >= band.threshold) || { level: 'normal', threshold: null };
}

function readBoundedFile(filePath, maximumBytes) {
    let stats;
    try {
        stats = fs.statSync(filePath);
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
    if (!stats.isFile()) throw new Error('path is not a regular file');
    if (stats.size > maximumBytes) throw new Error(`file exceeds the ${maximumBytes}-byte safety limit`);
    return fs.readFileSync(filePath, 'utf8');
}

/** @param {any} [session] */
function uniqueProviderPeers(session = {}) {
    const peerIds = Array.isArray(session.providerPeerIds)
        ? session.providerPeerIds
        : session.providerPeerId
            ? [session.providerPeerId]
            : [];
    return new Set(peerIds.filter((peerId) => typeof peerId === 'string' && peerId.trim())).size;
}

/** @param {any} [session] */
function occupancyUnits(session = {}) {
    if (!session || typeof session !== 'object' || session.leftAt || !OCCUPYING_STATES.has(session.state)) return 0;
    const peerCount = uniqueProviderPeers(session);
    if (peerCount > 0) return peerCount;
    if (session.state === 'pending') return 1;
    if (session.cleanupPending || session.state === 'active') return 1;
    return 0;
}

/** @param {any} session */
function participantMinutesInProgress(session, monthStart, now) {
    const peerCount = uniqueProviderPeers(session);
    const activeUnits = peerCount || (
        session.state === 'active' && Number.isFinite(session.providerJoinedAt) ? 1 : 0
    );
    const startedAt = Number.isFinite(session.providerJoinedAt)
        ? session.providerJoinedAt
        : Number.isFinite(session.joinedAt)
            ? session.joinedAt
            : null;
    if (!activeUnits || startedAt === null || startedAt > now) return 0;
    return activeUnits * Math.max(0, now - Math.max(startedAt, monthStart)) / 60_000;
}

/** @param {any} session */
function validateRegistrySession(session) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
        throw new Error('session record is malformed');
    }
    for (const field of ['videoSessionId', 'roomId', 'providerMeetingId']) {
        if (typeof session[field] !== 'string' || !session[field].trim()) {
            throw new Error(`session ${field} is malformed`);
        }
    }
    if (!OCCUPYING_STATES.has(session.state)) throw new Error('session state is malformed');
    if (
        session.providerPeerIds !== undefined
        && (!Array.isArray(session.providerPeerIds) || session.providerPeerIds.some((peerId) => (
            typeof peerId !== 'string' || !peerId.trim()
        )))
    ) throw new Error('session providerPeerIds is malformed');
    for (const field of [
        'joinedAt',
        'lastSeenAt',
        'pendingExpiresAt',
        'providerJoinedAt',
        'providerEventAt',
        'participantDeletedAt',
        'leftAt'
    ]) {
        if (session[field] !== undefined && session[field] !== null && !Number.isFinite(session[field])) {
            throw new Error(`session ${field} is malformed`);
        }
    }
}

function readRegistryEvidence(filePath, now) {
    let raw;
    try {
        raw = readBoundedFile(filePath, MAX_REGISTRY_BYTES);
        if (raw === null) return { available: false, file: filePath };
        const state = JSON.parse(raw);
        if (state?.schemaVersion !== 1 || !Array.isArray(state.sessions)) {
            throw new Error('expected video session schemaVersion 1');
        }
        const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
        let occupancy = 0;
        let activeParticipantMinutes = 0;
        for (const session of state.sessions) {
            validateRegistrySession(session);
            occupancy += occupancyUnits(session);
            activeParticipantMinutes += participantMinutesInProgress(session, monthStart, now);
        }
        return {
            available: true,
            file: filePath,
            sessions: state.sessions.length,
            occupancy,
            activeParticipantMinutes
        };
    } catch (error) {
        return {
            available: true,
            file: filePath,
            error: String(error?.message || error).slice(0, 200)
        };
    }
}

function parseWebhookJournal(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
        const legacy = JSON.parse(trimmed);
        if (legacy?.schemaVersion === 1 && Array.isArray(legacy.entries)) {
            return legacy.entries.map((entry) => entry?.acceptedAt);
        }
    } catch (_error) {}

    const lines = raw.split(/\r?\n/);
    const hasTrailingNewline = /\r?\n$/.test(raw);
    const header = JSON.parse(lines.shift() || 'null');
    if (header?.schemaVersion !== 2 || header.type !== 'header') {
        throw new Error('expected webhook journal schemaVersion 2');
    }
    const accepted = [];
    lines.forEach((line, index) => {
        if (!line.trim()) return;
        let record;
        try {
            record = JSON.parse(line);
        } catch (error) {
            const isTrailingPartialRecord = !hasTrailingNewline && index === lines.length - 1;
            if (isTrailingPartialRecord) return;
            throw error;
        }
        if (record?.type !== 'accepted' || !Number.isFinite(record.acceptedAt)) {
            throw new Error('webhook acceptance record is malformed');
        }
        accepted.push(record.acceptedAt);
    });
    return accepted;
}

function readWebhookEvidence(filePath, now) {
    try {
        const raw = readBoundedFile(filePath, MAX_WEBHOOK_BYTES);
        if (raw === null) return { available: false, file: filePath };
        const accepted = parseWebhookJournal(raw);
        const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
        if (accepted.some((acceptedAt) => !Number.isFinite(acceptedAt))) {
            throw new Error('webhook acceptance timestamp is malformed');
        }
        return {
            available: true,
            file: filePath,
            acceptedDeliveries: accepted.length,
            acceptedThisMonth: accepted.filter((acceptedAt) => acceptedAt >= monthStart && acceptedAt <= now).length,
            lastAcceptedAt: accepted.length ? Math.max(...accepted) : null
        };
    } catch (error) {
        return {
            available: true,
            file: filePath,
            error: String(error?.message || error).slice(0, 200)
        };
    }
}

function eventTimestamp(entry) {
    for (const value of [entry.timestamp, entry.leftAt, entry.endedAt, entry.lastSeenAt]) {
        if (Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) {
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return null;
}

function eventDurationMs(entry) {
    if (Number.isFinite(entry.durationMs)) return Math.max(0, Number(entry.durationMs));
    if (entry.event === 'video_session_ended' && Number.isFinite(entry.durationSeconds)) {
        return Math.max(0, Number(entry.durationSeconds) * 1_000);
    }
    const start = Number(entry.joinedAt);
    const end = Number(entry.leftAt ?? entry.lastSeenAt ?? entry.endedAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return end - start;
    return null;
}

function readEventLogEvidence(candidates, now) {
    for (const filePath of candidates) {
        let raw;
        try {
            raw = readBoundedFile(filePath, MAX_EVENT_LOG_BYTES);
        } catch (error) {
            return {
                available: true,
                file: filePath,
                error: String(error?.message || error).slice(0, 200)
            };
        }
        if (raw === null) continue;
        const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
        const seenSessions = new Set();
        let completedParticipantMinutes = 0;
        let completedSessions = 0;
        let malformedLines = 0;
        raw.split(/\r?\n/).forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed[0] !== '{') return;
            let entry;
            try {
                entry = JSON.parse(trimmed);
            } catch (_error) {
                malformedLines += 1;
                return;
            }
            if (entry.event && entry.event !== 'video_session_ended') return;
            const durationMs = eventDurationMs(entry);
            const endedAt = eventTimestamp(entry);
            if (durationMs === null || endedAt === null || endedAt < monthStart || endedAt > now) return;
            const identity = typeof entry.videoSessionId === 'string' && entry.videoSessionId
                ? entry.videoSessionId
                : `line:${index}`;
            if (seenSessions.has(identity)) return;
            seenSessions.add(identity);
            completedParticipantMinutes += durationMs / 60_000;
            completedSessions += 1;
        });
        return {
            available: true,
            file: filePath,
            completedParticipantMinutes,
            completedSessions,
            malformedLines
        };
    }
    return { available: false, file: candidates[0] || null };
}

function utilization(value, cap) {
    return cap > 0 ? value / cap * 100 : Number.NaN;
}

function buildAlert(metric, value, cap, unit) {
    const utilizationPercent = utilization(value, cap);
    const classification = classifyUtilization(utilizationPercent);
    return {
        metric,
        value,
        cap,
        unit,
        utilizationPercent,
        ...classification
    };
}

function evaluateCostMonitor(options = {}) {
    const env = options.env || process.env;
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const config = resolveMonitorConfig(env, options.repoRoot || REPO_ROOT);
    const projection = projectMonthlyCost(config);
    const registry = readRegistryEvidence(config.registryFile, now);
    const webhook = readWebhookEvidence(config.webhookFile, now);
    const eventLog = readEventLogEvidence(config.eventLogCandidates, now);
    const completedMinutes = eventLog.completedParticipantMinutes || 0;
    const activeMinutes = registry.activeParticipantMinutes || 0;
    const observedParticipantMinutes = completedMinutes + activeMinutes;
    const observedCostUsd = observedParticipantMinutes * config.ratePerMinuteUsd;
    const alerts = [
        buildAlert('Projected monthly cost', projection.costUsd, config.monthlyCostCapUsd, 'USD')
    ];
    if (registry.available && !registry.error) {
        alerts.push(buildAlert('Registry occupancy', registry.occupancy, config.participantCap, 'participants'));
    }
    if ((registry.available && !registry.error) || (eventLog.available && !eventLog.error)) {
        alerts.push(buildAlert('Observed UTC-month cost', observedCostUsd, config.monthlyCostCapUsd, 'USD'));
    }

    const evidenceFailed = [registry, webhook, eventLog].some((evidence) => !!evidence.error);
    const highestAlert = alerts.reduce((highest, alert) => {
        const order = { normal: 0, notice: 1, warning: 2, critical: 3, invalid: 4 };
        return order[alert.level] > order[highest] ? alert.level : highest;
    }, 'normal');
    const exitCode = evidenceFailed || ['critical', 'invalid'].includes(highestAlert)
        ? 1
        : ['notice', 'warning'].includes(highestAlert)
            ? 2
            : 0;

    return {
        config,
        projection,
        registry,
        webhook,
        eventLog,
        observedParticipantMinutes,
        observedCostUsd,
        alerts,
        highestAlert,
        evidenceFailed,
        exitCode
    };
}

function formatAlert(alert) {
    if (alert.level === 'normal') return 'within thresholds';
    return `${alert.level.toUpperCase()} (${alert.threshold}% threshold)`;
}

function relativePath(filePath) {
    return filePath ? path.relative(process.cwd(), filePath) || path.basename(filePath) : 'not configured';
}

function renderEvidence(label, evidence) {
    if (!evidence.available) {
        console.log(`${label}: unavailable (${relativePath(evidence.file)})`);
        return;
    }
    if (evidence.error) {
        console.log(`${label}: FAIL — ${evidence.error}`);
    }
}

function renderResult(result) {
    const { config, projection, registry, webhook, eventLog } = result;
    console.log('Cloudflare RealtimeKit Cost Check');
    console.log('');
    console.log('Configured caps:');
    console.log(`  Participant capacity: ${config.participantCap}`);
    console.log(`  Monthly RealtimeKit cost: $${config.monthlyCostCapUsd.toFixed(2)}`);
    console.log('');
    console.log('Launch projection:');
    console.log(`  ${config.participantCap} × ${config.hoursPerDay} hours/day × ${config.daysPerMonth} days/month`);
    console.log(`  ${projection.participantMinutes.toLocaleString('en-US')} participant-minutes × $${config.ratePerMinuteUsd}`);
    console.log(`  Projected monthly cost: $${projection.costUsd.toFixed(2)} (${utilization(
        projection.costUsd,
        config.monthlyCostCapUsd
    ).toFixed(1)}% of cap) — ${formatAlert(result.alerts[0])}`);
    console.log('');

    renderEvidence('Durable registry evidence', registry);
    if (registry.available && !registry.error) {
        const occupancyAlert = result.alerts.find((alert) => alert.metric === 'Registry occupancy');
        console.log(`Registry occupancy: ${registry.occupancy}/${config.participantCap} (${occupancyAlert.utilizationPercent.toFixed(
            1
        )}%) — ${formatAlert(occupancyAlert)}`);
        console.log(`  In-progress usage this UTC month: ${registry.activeParticipantMinutes.toFixed(1)} participant-minutes`);
    }

    renderEvidence('Video session event log', eventLog);
    if (eventLog.available && !eventLog.error) {
        console.log(`Completed usage this UTC month: ${eventLog.completedParticipantMinutes.toFixed(1)} participant-minutes`);
        console.log(`  ${eventLog.completedSessions} unique completed sessions from ${relativePath(eventLog.file)}`);
    }

    renderEvidence('Webhook evidence', webhook);
    if (webhook.available && !webhook.error) {
        console.log(`Webhook evidence: ${webhook.acceptedDeliveries} accepted deliveries (${webhook.acceptedThisMonth} this UTC month)`);
        if (webhook.lastAcceptedAt) console.log(`  Last accepted delivery: ${new Date(webhook.lastAcceptedAt).toISOString()}`);
    }

    if (!registry.available && !eventLog.available && !webhook.available) {
        console.log('Local usage evidence is unavailable; projection-only mode does not require provider credentials.');
    }
    console.log('');
    console.log(`Observed estimated cost this UTC month: $${result.observedCostUsd.toFixed(2)}`);
    console.log('Guardrails: recording/export/RTMP/HLS/transcription/AI must stay OFF.');
    console.log('');
    console.log(`Overall: ${result.exitCode === 0 ? 'PASS' : result.exitCode === 2 ? 'ALERT' : 'FAIL'}`);
}

function main() {
    loadDotEnv();
    try {
        const result = evaluateCostMonitor();
        renderResult(result);
        process.exitCode = result.exitCode;
    } catch (error) {
        console.log('Cloudflare RealtimeKit Cost Check');
        console.log(`Configuration: FAIL — ${String(error?.message || error).slice(0, 200)}`);
        console.log('Overall: FAIL');
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    classifyUtilization,
    evaluateCostMonitor,
    occupancyUnits,
    parseWebhookJournal,
    projectMonthlyCost,
    readEventLogEvidence,
    readRegistryEvidence,
    readWebhookEvidence,
    resolveMonitorConfig
};
