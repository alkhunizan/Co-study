// npm run cloudflare:cleanup
// Mark leftover "Halastudy Smoke Test" meetings INACTIVE. Only touches meetings
// whose title matches the smoke-test pattern — never real room meetings.

const {
    loadCloudflareRealtimeKitEnv,
    cfFetch,
    requireEnv,
    createReporter
} = require('./realtimekit-common');

const SMOKE_TITLE_PATTERN = /halastudy smoke test/i;

function extractMeetings(result, payload) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.meetings)) return result.meetings;
    if (payload && Array.isArray(payload.result)) return payload.result;
    return null;
}

async function main() {
    const env = loadCloudflareRealtimeKitEnv();
    const reporter = createReporter('Cloudflare RealtimeKit Cleanup');

    try {
        requireEnv('CLOUDFLARE_ACCOUNT_ID');
        requireEnv('CLOUDFLARE_REALTIMEKIT_API_TOKEN');
        requireEnv('CLOUDFLARE_REALTIMEKIT_APP_ID');
        reporter.check('Env', true);
    } catch (error) {
        reporter.check('Env', false, error.message);
        reporter.summary();
        process.exit(1);
    }
    const appId = env.appId;

    const list = await cfFetch(`/${encodeURIComponent(appId)}/meetings`);
    const meetings = list.ok ? extractMeetings(list.result, list.payload) : null;
    if (!list.ok || !Array.isArray(meetings)) {
        reporter.check('List meetings', false, list.ok ? 'list endpoint returned an unexpected shape' : `HTTP ${list.status}: ${list.error}`);
        reporter.info('Manual cleanup: Cloudflare dashboard → Realtime → RealtimeKit → Meetings → mark any "Halastudy Smoke Test" meeting INACTIVE.');
        reporter.summary();
        process.exit(1);
    }
    reporter.check('List meetings', true, `${meetings.length} total`);

    const smokeMeetings = meetings.filter((meeting) => meeting && typeof meeting.title === 'string' && SMOKE_TITLE_PATTERN.test(meeting.title));
    const active = smokeMeetings.filter((meeting) => String(meeting.status || '').toUpperCase() !== 'INACTIVE');

    let closed = 0;
    for (const meeting of active) {
        const id = meeting.id || meeting.meetingId || meeting.meeting_id || meeting.uuid;
        if (!id) continue;
        const result = await cfFetch(`/${encodeURIComponent(appId)}/meetings/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: { status: 'INACTIVE' }
        });
        if (result.ok) {
            closed += 1;
        } else {
            reporter.info(`Could not close meeting ${id}: HTTP ${result.status}: ${result.error}`);
        }
    }

    reporter.check('Smoke-test meetings closed', closed === active.length,
        `${closed}/${active.length} active smoke meetings marked INACTIVE (${smokeMeetings.length} matched by title, real rooms untouched)`);
    reporter.summary();
    process.exit(reporter.failed ? 1 : 0);
}

main().catch((error) => {
    console.error(`Cleanup failed: ${error.message}`);
    process.exit(1);
});
