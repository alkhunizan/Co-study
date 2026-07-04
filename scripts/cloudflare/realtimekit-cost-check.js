// npm run cloudflare:cost-check
// Print the launch cost model and (if local video-session logs exist) an
// observed usage estimate. Never calls Cloudflare billing APIs.

const fs = require('node:fs');
const path = require('node:path');

const { loadCloudflareRealtimeKitEnv, createReporter } = require('./realtimekit-common');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Launch model constants.
const CONCURRENT = 20;
const HOURS_PER_DAY = 4;
const DAYS_PER_MONTH = 30;
const RATE_PER_MINUTE = 0.002; // RealtimeKit GA audio/video participant-minute price.
const MONTHLY_BUDGET = 500;

function parseIntOrDefault(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function projectMonthlyCost(concurrent) {
    const participantMinutes = concurrent * HOURS_PER_DAY * 60 * DAYS_PER_MONTH;
    return { participantMinutes, cost: participantMinutes * RATE_PER_MINUTE };
}

// Best-effort: sum participant-minutes from a JSON-lines session log if one exists.
function estimateFromLogs() {
    const candidates = [
        process.env.VIDEO_SESSION_LOG_FILE,
        path.join(REPO_ROOT, 'data', 'video-sessions.log'),
        path.join(REPO_ROOT, 'logs', 'video-sessions.log')
    ].filter((entry) => typeof entry === 'string' && entry.length > 0);

    for (const file of candidates) {
        let raw;
        try {
            raw = fs.readFileSync(file, 'utf8');
        } catch (_error) {
            continue;
        }
        let totalMs = 0;
        let sessions = 0;
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed[0] !== '{') continue;
            let entry;
            try {
                entry = JSON.parse(trimmed);
            } catch (_error) {
                continue;
            }
            const start = Number(entry.joinedAt);
            const end = Number(entry.leftAt ?? entry.lastSeenAt ?? entry.endedAt);
            if (Number.isFinite(entry.durationMs)) {
                totalMs += Math.max(0, Number(entry.durationMs));
                sessions += 1;
            } else if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
                totalMs += end - start;
                sessions += 1;
            }
        }
        if (sessions > 0) {
            return { file, sessions, participantMinutes: totalMs / 60000 };
        }
    }
    return null;
}

function main() {
    loadCloudflareRealtimeKitEnv();
    const reporter = createReporter('Cloudflare RealtimeKit Cost Check');

    const baseline = projectMonthlyCost(CONCURRENT);
    reporter.info('');
    reporter.info('Launch cap:');
    reporter.info(`  ${CONCURRENT} concurrent users`);
    reporter.info(`  ${HOURS_PER_DAY} hours/day`);
    reporter.info(`  ${DAYS_PER_MONTH} days/month`);
    reporter.info('');
    reporter.info('Participant-minutes:');
    reporter.info(`  ${CONCURRENT} × ${HOURS_PER_DAY} × 60 × ${DAYS_PER_MONTH} = ${baseline.participantMinutes.toLocaleString('en-US')}`);
    reporter.info('');
    reporter.info('RealtimeKit GA estimate:');
    reporter.info(`  ${baseline.participantMinutes.toLocaleString('en-US')} × $${RATE_PER_MINUTE} = $${baseline.cost.toFixed(0)}/month`);
    reporter.info('');
    reporter.info(`Budget: $${MONTHLY_BUDGET}/month`);
    reporter.info(`Remaining estimated room: $${(MONTHLY_BUDGET - baseline.cost).toFixed(0)}/month before other infra`);

    // Warn against silently exceeding the cap.
    const configuredCap = parseIntOrDefault(process.env.MAX_GLOBAL_VIDEO_PARTICIPANTS, CONCURRENT);
    reporter.info('');
    reporter.info('Guardrails:');
    reporter.info('  Do not raise MAX_GLOBAL_VIDEO_PARTICIPANTS above 20 without recalculating cost.');
    reporter.info('  Recording/export/RTMP/HLS/transcription/AI must stay OFF.');
    if (configuredCap > CONCURRENT) {
        const scaled = projectMonthlyCost(configuredCap);
        reporter.info('');
        reporter.info(`WARNING: MAX_GLOBAL_VIDEO_PARTICIPANTS is ${configuredCap} (> ${CONCURRENT}).`);
        reporter.info(`  Projected at ${configuredCap} users: $${scaled.cost.toFixed(0)}/month (budget $${MONTHLY_BUDGET}).`);
    }

    // Observed usage, if a local session log exists.
    const observed = estimateFromLogs();
    reporter.info('');
    if (observed) {
        const minutes = observed.participantMinutes;
        const monthlyProjection = (minutes) * RATE_PER_MINUTE;
        reporter.info(`Observed (from ${path.relative(process.cwd(), observed.file)}):`);
        reporter.info(`  ${observed.sessions} sessions, ~${minutes.toFixed(1)} participant-minutes`);
        reporter.info(`  Cost of observed usage: $${monthlyProjection.toFixed(2)}`);
        reporter.info(`  Budget remaining vs observed: $${(MONTHLY_BUDGET - monthlyProjection).toFixed(2)}`);
    } else {
        reporter.info('Observed usage: no local video-session log found (projection only).');
        reporter.info('  Set VIDEO_SESSION_LOG_FILE to a JSON-lines log to enable observed estimates.');
    }

    const overBudget = baseline.cost > MONTHLY_BUDGET || (configuredCap > CONCURRENT && projectMonthlyCost(configuredCap).cost > MONTHLY_BUDGET);
    reporter.info('');
    console.log(`Overall: ${overBudget ? 'FAIL (projected cost exceeds budget)' : 'PASS'}`);
    process.exit(overBudget ? 1 : 0);
}

main();
