// npm run cloudflare:smoke
// End-to-end proof that the RealtimeKit path works: create a temporary meeting,
// add a participant with the halastudy_student preset, confirm a participant
// token comes back (NEVER printed), then mark the meeting inactive.

const {
    loadCloudflareRealtimeKitEnv,
    cfFetch,
    requireEnv,
    assertNoSecretsInText,
    createReporter
} = require('./realtimekit-common');

function hasId(list, id) {
    return Array.isArray(list) && list.some((item) => item && [item.id, item.app_id, item.appId, item.uuid].includes(id));
}

function hasPreset(list, name) {
    return Array.isArray(list) && list.some((item) => item && (item.name === name || item.preset_name === name));
}

function extractMeetingId(result) {
    if (!result || typeof result !== 'object') return null;
    return result.id || result.meetingId || result.meeting_id || result.uuid || null;
}

// Token can arrive under result/data, nested under participant, as token or authToken.
function extractParticipantToken(payload, result) {
    const candidates = [
        result?.token,
        result?.authToken,
        result?.participant?.token,
        result?.participant?.authToken,
        payload?.data?.token,
        payload?.data?.authToken,
        payload?.result?.token,
        payload?.result?.authToken
    ];
    return candidates.find((value) => typeof value === 'string' && value.length > 0) || null;
}

async function markInactive(appId, meetingId) {
    return cfFetch(`/${encodeURIComponent(appId)}/meetings/${encodeURIComponent(meetingId)}`, {
        method: 'PATCH',
        body: { status: 'INACTIVE' }
    });
}

async function main() {
    const env = loadCloudflareRealtimeKitEnv();
    const reporter = createReporter('Cloudflare RealtimeKit Smoke Test');

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

    const apps = await cfFetch('/apps');
    if (!reporter.check('App exists', apps.ok && hasId(apps.result, appId), apps.ok ? '' : `HTTP ${apps.status}: ${apps.error}`)) {
        reporter.summary();
        process.exit(1);
    }

    const presets = await cfFetch(`/${encodeURIComponent(appId)}/presets`);
    if (!reporter.check('Preset exists', presets.ok && hasPreset(presets.result, env.presetName), presets.ok ? '' : `HTTP ${presets.status}: ${presets.error}`)) {
        reporter.summary();
        process.exit(1);
    }

    const meeting = await cfFetch(`/${encodeURIComponent(appId)}/meetings`, {
        method: 'POST',
        body: {
            title: 'Halastudy Smoke Test',
            record_on_start: false,
            live_stream_on_start: false,
            persist_chat: false,
            transcribe_on_end: false,
            summarize_on_end: false,
            session_keep_alive_time_in_secs: 60
        }
    });
    const meetingId = meeting.ok ? extractMeetingId(meeting.result) : null;
    if (!reporter.check('Temporary meeting created', !!meetingId, meetingId ? '' : `HTTP ${meeting.status}: ${meeting.error}`)) {
        reporter.summary();
        process.exit(1);
    }

    const participant = await cfFetch(`/${encodeURIComponent(appId)}/meetings/${encodeURIComponent(meetingId)}/participants`, {
        method: 'POST',
        body: {
            name: 'Halastudy Smoke Test',
            preset_name: env.presetName,
            custom_participant_id: `halastudy-smoke-${Date.now()}`
        }
    });
    if (!reporter.check('Temporary participant created', participant.ok, participant.ok ? '' : `HTTP ${participant.status}: ${participant.error}`)) {
        await markInactive(appId, meetingId);
        reporter.summary();
        process.exit(1);
    }

    const token = extractParticipantToken(participant.payload, participant.result);
    reporter.check('Participant token returned (redacted)', !!token, token ? '' : 'no token/authToken field found in participant response');

    const cleanup = await markInactive(appId, meetingId);
    reporter.check('Temporary meeting marked inactive', cleanup.ok, cleanup.ok ? '' : `HTTP ${cleanup.status}: ${cleanup.error}`);

    if (!token) {
        reporter.summary();
        process.exit(1);
    }
    if (!cleanup.ok) {
        // Token was created but cleanup failed — surface the meeting id (never the token).
        console.log(`PARTIAL PASS: participant token created, but meeting ${meetingId} could not be marked inactive. Mark it inactive in the dashboard.`);
        process.exit(1);
    }

    // Defensive: our own output must never contain a secret.
    assertNoSecretsInText(`Halastudy smoke test complete for meeting ${meetingId}.`);
    reporter.summary();
    process.exit(reporter.failed ? 1 : 0);
}

main().catch((error) => {
    console.error(`Smoke test failed: ${error.message}`);
    process.exit(1);
});
