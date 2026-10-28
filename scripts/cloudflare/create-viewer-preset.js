// npm run cloudflare:viewer-preset
// Idempotently create/update the watch-only RealtimeKit preset and verify the
// effective policy returned by Cloudflare. Never prints secrets.

const {
    loadCloudflareRealtimeKitEnv,
    cfFetch,
    requireEnv,
    createReporter
} = require('./realtimekit-common');
const {
    DEFAULT_VIEWER_PRESET_NAME,
    PRESET_KINDS,
    buildPresetBody,
    provisionPreset
} = require('./realtimekit-setup');

function viewerPresetBody(name) {
    return buildPresetBody(PRESET_KINDS.VIEWER, name);
}

async function main() {
    const env = loadCloudflareRealtimeKitEnv();
    const reporter = createReporter('Cloudflare RealtimeKit — viewer preset');
    const viewerName = String(process.env.VIDEO_VIEWER_PRESET_NAME || DEFAULT_VIEWER_PRESET_NAME).trim()
        || DEFAULT_VIEWER_PRESET_NAME;

    try {
        requireEnv('CLOUDFLARE_ACCOUNT_ID');
        requireEnv('CLOUDFLARE_REALTIMEKIT_APP_ID');
        requireEnv('CLOUDFLARE_REALTIMEKIT_API_TOKEN');
        reporter.check('Env', true);
    } catch (error) {
        reporter.check('Env', false, error.message);
        reporter.summary();
        return 1;
    }

    const result = await provisionPreset({
        request: cfFetch,
        appId: env.appId,
        name: viewerName,
        kind: PRESET_KINDS.VIEWER,
        reporter
    });
    reporter.check(
        `Preset ${viewerName} effective policy`,
        result.ok,
        result.ok ? result.action : result.error
    );
    reporter.summary();
    return reporter.failed ? 1 : 0;
}

if (require.main === module) {
    main()
        .then((code) => { process.exitCode = code; })
        .catch((error) => {
            console.error(`Viewer preset provisioning failed: ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = {
    viewerPresetBody,
    main
};
