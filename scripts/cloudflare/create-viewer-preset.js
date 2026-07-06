// node scripts/cloudflare/create-viewer-preset.js
// Provision the watch-only "halastudy_viewer" RealtimeKit preset (camera / mic /
// screenshare production disabled) used by Lobby guests. Idempotent: if the
// preset already exists it reports PASS and makes no change. Never prints secrets.
//
// Requires real Cloudflare creds in the environment / .env:
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_REALTIMEKIT_APP_ID, CLOUDFLARE_REALTIMEKIT_API_TOKEN
// Reads VIDEO_VIEWER_PRESET_NAME (default: halastudy_viewer).

const {
    loadCloudflareRealtimeKitEnv,
    cfFetch,
    requireEnv,
    createReporter
} = require('./realtimekit-common');

const DEFAULT_VIEWER_PRESET_NAME = 'halastudy_viewer';

function findByName(list, name) {
    if (!Array.isArray(list) || !name) return null;
    return list.find((item) => item && (item.name === name || item.preset_name === name)) || null;
}

// Watch-only: can consume everyone's media, can produce nothing. Mirrors the
// Cloudflare "Create A Preset" schema (permissions.media.*.can_produce).
function viewerPresetBody(name) {
    return {
        name,
        config: {
            max_screenshare_count: 0,
            max_video_streams: { desktop: 30, mobile: 6 },
            view_type: 'GROUP_CALL',
            media: {
                video: { frame_rate: 30, quality: 'hd' },
                screenshare: { frame_rate: 5, quality: 'hd' },
                audio: { enable_stereo: false }
            }
        },
        permissions: {
            media: {
                audio: { can_produce: 'NOT_ALLOWED' },
                video: { can_produce: 'NOT_ALLOWED' },
                screenshare: { can_produce: 'NOT_ALLOWED' }
            },
            show_participant_list: true,
            hidden_participant: false
        }
    };
}

async function main() {
    const env = loadCloudflareRealtimeKitEnv();
    const reporter = createReporter('Cloudflare RealtimeKit — viewer preset');
    const viewerName = String(process.env.VIDEO_VIEWER_PRESET_NAME || DEFAULT_VIEWER_PRESET_NAME).trim() || DEFAULT_VIEWER_PRESET_NAME;

    try {
        requireEnv('CLOUDFLARE_ACCOUNT_ID');
        requireEnv('CLOUDFLARE_REALTIMEKIT_APP_ID');
        requireEnv('CLOUDFLARE_REALTIMEKIT_API_TOKEN');
        reporter.check('Env', true);
    } catch (error) {
        reporter.check('Env', false, error.message);
        reporter.summary();
        process.exit(1);
    }

    const appId = env.appId;
    const presets = await cfFetch(`/${encodeURIComponent(appId)}/presets`);
    if (!reporter.check('Presets API', presets.ok, presets.ok ? '' : `HTTP ${presets.status}: ${presets.error}`)) {
        reporter.summary();
        process.exit(1);
    }

    if (findByName(presets.result, viewerName)) {
        reporter.check(`Preset ${viewerName} exists`, true, 'already provisioned — no change');
        reporter.summary();
        process.exit(0);
    }

    reporter.info(`Preset ${viewerName} missing → creating (produce disabled for audio/video/screenshare).`);
    const created = await cfFetch(`/${encodeURIComponent(appId)}/presets`, {
        method: 'POST',
        body: viewerPresetBody(viewerName)
    });
    if (!created.ok) {
        reporter.check(`Create ${viewerName}`, false, `HTTP ${created.status}: ${created.error}`);
        reporter.info('If Cloudflare rejects the payload shape, create the preset in the dashboard '
            + '(Realtime → RealtimeKit → Presets) named exactly "' + viewerName + '" with camera, mic, '
            + 'and screenshare production set to "Not allowed".');
        reporter.summary();
        process.exit(1);
    }

    // Verify it now lists.
    const after = await cfFetch(`/${encodeURIComponent(appId)}/presets`);
    const ok = after.ok && !!findByName(after.result, viewerName);
    reporter.check(`Preset ${viewerName} created`, ok, ok ? '' : 'created but not found on re-list');
    reporter.summary();
    process.exit(reporter.failed ? 1 : 0);
}

main().catch((error) => {
    console.error(`Viewer preset provisioning failed: ${error.message}`);
    process.exit(1);
});
