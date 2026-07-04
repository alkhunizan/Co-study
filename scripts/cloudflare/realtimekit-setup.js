// npm run cloudflare:setup
// Verify (and, only when explicitly opted in, create) the Cloudflare RealtimeKit
// app and the halastudy_student preset. Fails loud with exact dashboard
// instructions rather than guessing. Never prints secrets.

const fs = require('node:fs');
const path = require('node:path');

const {
    loadCloudflareRealtimeKitEnv,
    cfFetch,
    requireEnv,
    redact,
    createReporter
} = require('./realtimekit-common');

const REPORTS_DIR = path.resolve(__dirname, '..', '..', 'docs', 'reports');
const PRESET_SHAPE_DIAGNOSTIC = path.join(REPORTS_DIR, 'cloudflare-preset-shape-diagnostic.md');

function findById(list, id) {
    if (!Array.isArray(list) || !id) return null;
    return list.find((item) => item && [item.id, item.app_id, item.appId, item.uuid].includes(id)) || null;
}

function findByName(list, name) {
    if (!Array.isArray(list) || !name) return null;
    return list.find((item) => item && (item.name === name || item.preset_name === name)) || null;
}

function writePresetShapeDiagnostic(shapeSource) {
    try {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        const body = [
            '# Cloudflare Preset Shape Diagnostic',
            '',
            'Cloudflare rejected the automated `halastudy_student` preset payload.',
            'Below is a REDACTED snapshot of the presets Cloudflare currently returns',
            'for this app, so the accepted field shape can be mirrored. Safest path:',
            'create the preset manually in the dashboard.',
            '',
            '```json',
            JSON.stringify(redact(shapeSource), null, 2),
            '```',
            ''
        ].join('\n');
        fs.writeFileSync(PRESET_SHAPE_DIAGNOSTIC, body, 'utf8');
        return PRESET_SHAPE_DIAGNOSTIC;
    } catch (_error) {
        return null;
    }
}

async function main() {
    const env = loadCloudflareRealtimeKitEnv();
    const reporter = createReporter('Cloudflare RealtimeKit Setup');

    // 1. Env (account id + token are required for any API call).
    try {
        requireEnv('CLOUDFLARE_ACCOUNT_ID');
        requireEnv('CLOUDFLARE_REALTIMEKIT_API_TOKEN');
        reporter.check('Env', true);
    } catch (error) {
        reporter.check('Env', false, error.message);
        reporter.summary();
        process.exit(1);
    }

    // 2. Apps API reachable.
    const apps = await cfFetch('/apps');
    if (!reporter.check('Apps API', apps.ok, apps.ok ? '' : `HTTP ${apps.status}: ${apps.error}`)) {
        reporter.summary();
        process.exit(1);
    }

    // 3. Configured app exists (create only when explicitly opted in).
    const appId = env.appId;
    const appExists = !!appId && !!findById(apps.result, appId);
    if (!appExists) {
        if (!appId && env.createApp) {
            reporter.info('CLOUDFLARE_REALTIMEKIT_APP_ID is unset and CLOUDFLARE_REALTIMEKIT_CREATE_APP=true → creating "Halastudy Staging".');
            const created = await cfFetch('/apps', { method: 'POST', body: { name: 'Halastudy Staging' } });
            if (created.ok) {
                const newId = created.result?.id || created.result?.app_id || created.result?.uuid || '(see dashboard)';
                reporter.info(`Created app. Set CLOUDFLARE_REALTIMEKIT_APP_ID=${newId} in .env, then re-run cloudflare:setup.`);
            } else {
                reporter.info(`App creation failed: HTTP ${created.status}: ${created.error}`);
            }
        }
        reporter.check('Configured app exists', false, appId
            ? 'CLOUDFLARE_REALTIMEKIT_APP_ID does not match any app on this account'
            : 'set CLOUDFLARE_REALTIMEKIT_APP_ID (or set CLOUDFLARE_REALTIMEKIT_CREATE_APP=true to create one)');
        reporter.summary();
        process.exit(1);
    }
    reporter.check('Configured app exists', true);

    // 4. Presets API reachable.
    const presets = await cfFetch(`/${encodeURIComponent(appId)}/presets`);
    if (!reporter.check('Presets API', presets.ok, presets.ok ? '' : `HTTP ${presets.status}: ${presets.error}`)) {
        reporter.summary();
        process.exit(1);
    }

    // 5. halastudy_student preset exists (create only when explicitly opted in).
    let presetExists = !!findByName(presets.result, env.presetName);
    if (!presetExists && env.createPreset) {
        reporter.info(`Preset ${env.presetName} missing and CLOUDFLARE_REALTIMEKIT_CREATE_PRESET=true → attempting create.`);
        const created = await cfFetch(`/${encodeURIComponent(appId)}/presets`, {
            method: 'POST',
            body: { name: env.presetName }
        });
        if (created.ok) {
            presetExists = true;
        } else {
            reporter.info(`Preset creation rejected: HTTP ${created.status}: ${created.error}`);
            const diagnosticPath = writePresetShapeDiagnostic(presets.result);
            if (diagnosticPath) {
                reporter.info(`Saved redacted preset-shape diagnostic to ${path.relative(process.cwd(), diagnosticPath)}`);
            }
        }
    }

    if (!presetExists) {
        reporter.check(`Preset ${env.presetName} exists`, false,
            'create it in the Cloudflare dashboard (Realtime → RealtimeKit → Presets), named exactly "halastudy_student"');
        reporter.summary();
        process.exit(1);
    }
    reporter.check(`Preset ${env.presetName} exists`, true);

    reporter.summary();
    process.exit(reporter.failed ? 1 : 0);
}

main().catch((error) => {
    console.error(`Setup failed: ${error.message}`);
    process.exit(1);
});
