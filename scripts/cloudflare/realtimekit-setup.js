// npm run cloudflare:setup
// Idempotently provision both RealtimeKit presets and verify the effective
// permissions returned by Cloudflare. Never prints secrets.
//
// Cloudflare API contract:
// https://developers.cloudflare.com/api/resources/realtime_kit/subresources/presets/

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
const DEFAULT_VIEWER_PRESET_NAME = 'halastudy_viewer';
const PRESET_KINDS = Object.freeze({ STUDENT: 'student', VIEWER: 'viewer' });

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function findById(list, id) {
    if (!Array.isArray(list) || !id) return null;
    return list.find((item) => item && [item.id, item.app_id, item.appId, item.uuid].includes(id)) || null;
}

function buildPresetPermissions(kind) {
    if (!Object.values(PRESET_KINDS).includes(kind)) {
        throw new TypeError(`Unknown RealtimeKit preset kind: ${kind}`);
    }

    return {
        accept_stage_requests: false,
        accept_waiting_requests: false,
        can_accept_production_requests: false,
        can_change_participant_permissions: false,
        can_edit_display_name: true,
        can_livestream: false,
        can_record: false,
        can_spotlight: false,
        chat: {
            private: { can_receive: false, can_send: false, files: false, text: false },
            public: { can_send: false, files: false, text: false }
        },
        connected_meetings: {
            can_alter_connected_meetings: false,
            can_switch_connected_meetings: false,
            can_switch_to_parent_meeting: false
        },
        disable_participant_audio: false,
        disable_participant_screensharing: false,
        disable_participant_video: false,
        hidden_participant: false,
        is_recorder: false,
        kick_participant: false,
        media: {
            audio: { can_produce: 'NOT_ALLOWED' },
            video: { can_produce: kind === PRESET_KINDS.STUDENT ? 'ALLOWED' : 'NOT_ALLOWED' },
            screenshare: { can_produce: 'NOT_ALLOWED' }
        },
        pin_participant: false,
        plugins: {
            can_close: false,
            can_edit_config: false,
            can_start: false,
            config: {}
        },
        polls: {
            can_create: false,
            can_view: false,
            can_vote: false
        },
        recorder_type: 'NONE',
        show_participant_list: true,
        stage_access: 'NOT_ALLOWED',
        stage_enabled: false,
        transcription_enabled: false,
        waiting_room_type: 'SKIP'
    };
}

function buildPresetBody(kind, name) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) throw new TypeError('RealtimeKit preset name is required.');

    return {
        name: normalizedName,
        config: {
            max_screenshare_count: 0,
            max_video_streams: { desktop: 20, mobile: 6 },
            view_type: 'GROUP_CALL',
            media: {
                video: { frame_rate: 30, quality: 'hd', simulcast: true },
                screenshare: { frame_rate: 5, quality: 'hd' },
                audio: { enable_high_bitrate: false, enable_stereo: false }
            }
        },
        permissions: buildPresetPermissions(kind)
    };
}

function normalizePresetList(value) {
    if (!Array.isArray(value)) {
        return { ok: false, error: 'malformed preset list: data must be an array', presets: [] };
    }
    const presets = [];
    for (const [index, item] of value.entries()) {
        if (!isPlainObject(item)) {
            return { ok: false, error: `malformed preset list: item ${index} must be an object`, presets: [] };
        }
        if (typeof item.id !== 'string' || !item.id.trim()) {
            return { ok: false, error: `malformed preset list: item ${index} is missing id`, presets: [] };
        }
        if (typeof item.name !== 'string' || !item.name.trim()) {
            return { ok: false, error: `malformed preset list: item ${index} is missing name`, presets: [] };
        }
        presets.push({ id: item.id.trim(), name: item.name.trim() });
    }
    return { ok: true, error: '', presets };
}

function normalizePresetDetails(value) {
    if (!isPlainObject(value)) {
        return { ok: false, error: 'malformed preset details: data must be an object', preset: null };
    }
    if (typeof value.id !== 'string' || !value.id.trim()) {
        return { ok: false, error: 'malformed preset details: id is required', preset: null };
    }
    if (typeof value.name !== 'string' || !value.name.trim()) {
        return { ok: false, error: 'malformed preset details: name is required', preset: null };
    }
    if (!isPlainObject(value.config)) {
        return { ok: false, error: 'malformed preset details: config must be an object', preset: null };
    }
    if (!isPlainObject(value.permissions)) {
        return { ok: false, error: 'malformed preset details: permissions must be an object', preset: null };
    }
    return {
        ok: true,
        error: '',
        preset: {
            id: value.id.trim(),
            name: value.name.trim(),
            config: value.config,
            permissions: value.permissions
        }
    };
}

function getPath(value, segments) {
    let current = value;
    for (const segment of segments) {
        if (!isPlainObject(current) || !Object.hasOwn(current, segment)) return undefined;
        current = current[segment];
    }
    return current;
}

function collectLeafRequirements(value, prefix = [], output = []) {
    for (const [key, child] of Object.entries(value)) {
        const pathSegments = [...prefix, key];
        if (isPlainObject(child)) {
            if (Object.keys(child).length === 0) {
                output.push({ path: pathSegments, expected: child });
            } else {
                collectLeafRequirements(child, pathSegments, output);
            }
        } else {
            output.push({ path: pathSegments, expected: child });
        }
    }
    return output;
}

function comparePresetPolicy(preset, kind, expectedName) {
    const normalized = normalizePresetDetails(preset);
    if (!normalized.ok) {
        return [{ path: 'preset', expected: 'valid effective policy', actual: normalized.error }];
    }

    const expected = buildPresetBody(kind, expectedName);
    const requirements = [
        { path: ['name'], expected: expected.name },
        ...collectLeafRequirements(expected.config, ['config']),
        ...collectLeafRequirements(expected.permissions, ['permissions'])
    ];
    const mismatches = [];
    for (const requirement of requirements) {
        const actual = getPath(normalized.preset, requirement.path);
        const matches = isPlainObject(requirement.expected)
            ? isPlainObject(actual) && Object.keys(actual).length === 0
            : actual === requirement.expected;
        if (!matches) {
            mismatches.push({
                path: requirement.path.join('.'),
                expected: requirement.expected,
                actual: actual === undefined ? '[missing]' : actual
            });
        }
    }
    return mismatches;
}

function summarizeMismatches(mismatches) {
    if (!Array.isArray(mismatches) || mismatches.length === 0) return '';
    const shown = mismatches.slice(0, 4).map((mismatch) => `${mismatch.path} does not match the locked value`);
    if (mismatches.length > shown.length) shown.push(`and ${mismatches.length - shown.length} more`);
    return shown.join('; ');
}

function validateOfficialEnvelope(response, expectedDataType) {
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}: ${response.error}` };
    if (!isPlainObject(response.payload) || response.payload.success !== true
        || !Object.hasOwn(response.payload, 'data')) {
        return { ok: false, error: 'malformed Cloudflare response envelope' };
    }
    const data = response.payload.data;
    if (expectedDataType === 'array' && !Array.isArray(data)) {
        return { ok: false, error: 'malformed Cloudflare response: data must be an array' };
    }
    if (expectedDataType === 'object' && !isPlainObject(data)) {
        return { ok: false, error: 'malformed Cloudflare response: data must be an object' };
    }
    return { ok: true, error: '', data };
}

function normalizePaging(value, pageLength, accumulated) {
    if (!isPlainObject(value)) return { ok: false, error: 'malformed preset paging metadata' };
    for (const field of ['start_offset', 'end_offset', 'total_count']) {
        if (!Number.isInteger(value[field]) || value[field] < 0) {
            return { ok: false, error: `malformed preset paging metadata: ${field}` };
        }
    }
    if (value.total_count > 0 && value.end_offset < value.start_offset) {
        return { ok: false, error: 'malformed preset paging metadata: invalid offset range' };
    }
    if (value.total_count < accumulated + pageLength) {
        return { ok: false, error: 'malformed preset paging metadata: total_count is too small' };
    }
    if (pageLength > 0
        && (value.start_offset !== accumulated + 1 || value.end_offset !== accumulated + pageLength)) {
        return { ok: false, error: 'malformed preset paging metadata: offsets do not match data' };
    }
    return { ok: true, error: '', paging: value };
}

async function fetchPresetSummaries(request, appId) {
    const presets = [];
    const ids = new Set();
    const names = new Set();
    const perPage = 100;
    for (let pageNo = 1; pageNo <= 100; pageNo += 1) {
        const response = await request(
            `/${encodeURIComponent(appId)}/presets?page_no=${pageNo}&per_page=${perPage}`
        );
        const envelope = validateOfficialEnvelope(response, 'array');
        if (!envelope.ok) return { ok: false, error: envelope.error, presets: [] };
        const normalized = normalizePresetList(envelope.data);
        if (!normalized.ok) return { ok: false, error: normalized.error, presets: [] };
        if (normalized.presets.length > perPage) {
            return { ok: false, error: 'malformed preset list: page exceeds requested size', presets: [] };
        }
        const paging = normalizePaging(response.payload.paging, normalized.presets.length, presets.length);
        if (!paging.ok) return { ok: false, error: paging.error, presets: [] };

        for (const preset of normalized.presets) {
            if (ids.has(preset.id) || names.has(preset.name)) {
                return { ok: false, error: 'malformed preset list: duplicate id or name', presets: [] };
            }
            ids.add(preset.id);
            names.add(preset.name);
            presets.push(preset);
        }

        if (presets.length === paging.paging.total_count) {
            return { ok: true, error: '', presets };
        }
        if (presets.length > paging.paging.total_count || normalized.presets.length === 0) {
            return { ok: false, error: 'malformed preset paging metadata: truncated or inconsistent list', presets: [] };
        }
    }
    return { ok: false, error: 'preset pagination exceeded the 100-page safety limit', presets: [] };
}

async function inspectPresetPolicy({ request = cfFetch, appId, name, kind, summaries = null }) {
    const listed = summaries
        ? { ok: true, error: '', presets: summaries }
        : await fetchPresetSummaries(request, appId);
    if (!listed.ok) return { ok: false, error: listed.error, mismatches: [] };

    const summary = listed.presets.find((preset) => preset.name === name);
    if (!summary) return { ok: false, error: `preset ${name} is missing`, mismatches: [] };

    const response = await request(`/${encodeURIComponent(appId)}/presets/${encodeURIComponent(summary.id)}`);
    const envelope = validateOfficialEnvelope(response, 'object');
    if (!envelope.ok) return { ok: false, error: envelope.error, mismatches: [] };
    const normalized = normalizePresetDetails(envelope.data);
    if (!normalized.ok) return { ok: false, error: normalized.error, mismatches: [] };
    if (normalized.preset.id !== summary.id || normalized.preset.name !== name) {
        return { ok: false, error: 'malformed preset details: id/name do not match the requested preset', mismatches: [] };
    }

    const mismatches = comparePresetPolicy(normalized.preset, kind, name);
    return {
        ok: mismatches.length === 0,
        error: mismatches.length ? summarizeMismatches(mismatches) : '',
        mismatches,
        preset: normalized.preset
    };
}

async function provisionPreset({ request = cfFetch, appId, name, kind, reporter }) {
    let listed = await fetchPresetSummaries(request, appId);
    if (!listed.ok) return { ok: false, error: listed.error };
    let summary = listed.presets.find((preset) => preset.name === name);
    let action = 'verified';

    if (!summary) {
        reporter?.info(`Preset ${name} missing → creating the locked ${kind} policy.`);
        const created = await request(`/${encodeURIComponent(appId)}/presets`, {
            method: 'POST',
            body: buildPresetBody(kind, name)
        });
        const createdEnvelope = validateOfficialEnvelope(created, 'object');
        if (!createdEnvelope.ok) return { ok: false, error: `create failed: ${createdEnvelope.error}` };
        const createdPolicy = comparePresetPolicy(createdEnvelope.data, kind, name);
        if (createdPolicy.length) {
            return { ok: false, error: `create returned a drifted policy: ${summarizeMismatches(createdPolicy)}` };
        }
        action = 'created';
        listed = await fetchPresetSummaries(request, appId);
        if (!listed.ok) return { ok: false, error: `created but re-list failed: ${listed.error}` };
        summary = listed.presets.find((preset) => preset.name === name);
        if (!summary) return { ok: false, error: 'created but preset was absent from the provider re-list' };
    } else {
        const current = await inspectPresetPolicy({ request, appId, name, kind, summaries: listed.presets });
        if (!current.ok) {
            reporter?.info(`Preset ${name} drifted (${current.error}) → applying the locked ${kind} policy.`);
            const updated = await request(
                `/${encodeURIComponent(appId)}/presets/${encodeURIComponent(summary.id)}`,
                { method: 'PATCH', body: buildPresetBody(kind, name) }
            );
            const updatedEnvelope = validateOfficialEnvelope(updated, 'object');
            if (!updatedEnvelope.ok) return { ok: false, error: `update failed: ${updatedEnvelope.error}` };
            const updatedPolicy = comparePresetPolicy(updatedEnvelope.data, kind, name);
            if (updatedPolicy.length || updatedEnvelope.data.id !== summary.id) {
                return {
                    ok: false,
                    error: updatedPolicy.length
                        ? `update returned a drifted policy: ${summarizeMismatches(updatedPolicy)}`
                        : 'update returned a different preset id'
                };
            }
            action = 'updated';
        }
    }

    const verified = await inspectPresetPolicy({ request, appId, name, kind });
    return verified.ok
        ? { ok: true, error: '', action, preset: verified.preset }
        : { ok: false, error: `effective policy verification failed: ${verified.error}`, action };
}

function writePresetShapeDiagnostic(shapeSource) {
    if (process.env.NODE_ENV === 'test') return null;
    try {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        const body = [
            '# Cloudflare Preset Shape Diagnostic',
            '',
            'Cloudflare rejected or returned an invalid RealtimeKit preset policy.',
            'Below is a REDACTED snapshot of the provider response for diagnosis.',
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

    try {
        requireEnv('CLOUDFLARE_ACCOUNT_ID');
        requireEnv('CLOUDFLARE_REALTIMEKIT_API_TOKEN');
        reporter.check('Env', true);
    } catch (error) {
        reporter.check('Env', false, error.message);
        reporter.summary();
        return 1;
    }

    const apps = await cfFetch('/apps');
    if (!reporter.check('Apps API', apps.ok, apps.ok ? '' : `HTTP ${apps.status}: ${apps.error}`)) {
        reporter.summary();
        return 1;
    }

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
            : 'set CLOUDFLARE_REALTIMEKIT_APP_ID (or opt in to app creation)');
        reporter.summary();
        return 1;
    }
    reporter.check('Configured app exists', true);

    const viewerName = String(process.env.VIDEO_VIEWER_PRESET_NAME || DEFAULT_VIEWER_PRESET_NAME).trim()
        || DEFAULT_VIEWER_PRESET_NAME;
    if (viewerName === env.presetName) {
        reporter.check('Preset names are distinct', false, 'student and viewer presets cannot share a name');
        reporter.summary();
        return 1;
    }
    reporter.check('Preset names are distinct', true);

    for (const target of [
        { name: env.presetName, kind: PRESET_KINDS.STUDENT },
        { name: viewerName, kind: PRESET_KINDS.VIEWER }
    ]) {
        const result = await provisionPreset({
            request: cfFetch,
            appId,
            name: target.name,
            kind: target.kind,
            reporter
        });
        reporter.check(
            `Preset ${target.name} effective policy`,
            result.ok,
            result.ok ? result.action : result.error
        );
        if (!result.ok) {
            const diagnosticPath = writePresetShapeDiagnostic({ name: target.name, error: result.error });
            if (diagnosticPath) {
                reporter.info(`Saved redacted preset diagnostic to ${path.relative(process.cwd(), diagnosticPath)}`);
            }
        }
    }

    reporter.summary();
    return reporter.failed ? 1 : 0;
}

if (require.main === module) {
    main()
        .then((code) => { process.exitCode = code; })
        .catch((error) => {
            console.error(`Setup failed: ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = {
    DEFAULT_VIEWER_PRESET_NAME,
    PRESET_KINDS,
    buildPresetBody,
    comparePresetPolicy,
    fetchPresetSummaries,
    inspectPresetPolicy,
    normalizePresetDetails,
    normalizePresetList,
    provisionPreset,
    summarizeMismatches,
    main
};
