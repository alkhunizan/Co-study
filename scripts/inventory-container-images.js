// Local-only, read-only container image evidence inventory. The executable
// invokes only `docker image ls`, `inspect`, and `history`; it never contacts a
// registry, builds, pushes, pulls, removes, rotates, or logs credential values.
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { defaultEvidencePath, writeJsonEvidence } = require('./evidence/report-writer');

const PROJECT_IMAGE_PATTERN = /(?:hala[-_.]?study|co[-_.]?study)/i;
const SAFE_IMAGE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,511}$/;
const SENSITIVE_NAME_PATTERN = /(?:^|_)(?:secret|token|password|passwd|api_?key|access_?key|private_?key|credential|cookie|authorization|session)(?:_|$)/i;
const SENSITIVE_ASSIGNMENT_PATTERN = /\b(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|COOKIE|AUTHORIZATION|SESSION)[A-Z0-9_]*)\s*=/gi;
const PLACEHOLDER_VALUES = new Set(['', 'replace_me', 'changeme', 'change_me', 'example', 'placeholder', 'redacted']);

function parseArgs(argv) {
    const parsed = {
        allLocal: false,
        dryRun: true,
        help: false,
        imageRefs: [],
        outputPath: null
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--dry-run') continue;
        if (argument === '--help' || argument === '-h') {
            parsed.help = true;
            continue;
        }
        if (argument === '--all-local') {
            parsed.allLocal = true;
            continue;
        }
        if (argument === '--image') {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) throw new Error('--image requires a local image reference.');
            if (!SAFE_IMAGE_REF_PATTERN.test(value)) throw new Error('Invalid local image reference.');
            parsed.imageRefs.push(value);
            index += 1;
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
    if (parsed.allLocal && parsed.imageRefs.length > 0) {
        throw new Error('--all-local cannot be combined with explicit --image references.');
    }
    return parsed;
}

function assertReadOnlyDockerCommand(args) {
    if (!Array.isArray(args) || args[0] !== 'image') throw new Error('Docker command is not allowlisted.');
    if (args[1] === 'ls') {
        const expected = ['image', 'ls', '--all', '--no-trunc', '--format', '{{json .}}'];
        if (JSON.stringify(args) !== JSON.stringify(expected)) throw new Error('Docker image listing command is not allowlisted.');
        return;
    }
    if (args[1] === 'inspect') {
        if (args.length < 3 || !args.slice(2).every((ref) => SAFE_IMAGE_REF_PATTERN.test(ref))) {
            throw new Error('Docker image inspection command is not allowlisted.');
        }
        return;
    }
    if (args[1] === 'history') {
        if (args.length !== 7 || args[2] !== '--no-trunc' || args[3] !== '--format'
            || args[4] !== '{{json .}}' || args[5] !== '--' || !SAFE_IMAGE_REF_PATTERN.test(args[6])) {
            throw new Error('Docker image history command is not allowlisted.');
        }
        return;
    }
    throw new Error('Docker command is not allowlisted.');
}

function defaultCommandRunner(args) {
    const result = spawnSync('docker', args, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        timeout: 30_000,
        windowsHide: true
    });
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error: result.error || null
    };
}

async function dockerRead(args, commandRunner) {
    assertReadOnlyDockerCommand(args);
    const result = await commandRunner(args);
    if (result?.error) throw new Error('Docker is unavailable; no inventory report was written.');
    if (result?.status !== 0) {
        throw new Error(`Read-only Docker ${args[1]} failed; no inventory report was written.`);
    }
    return typeof result.stdout === 'string' ? result.stdout : String(result.stdout || '');
}

function parseJsonLines(raw, label) {
    const rows = [];
    for (const line of String(raw).split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
            const parsed = JSON.parse(line);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
            rows.push(parsed);
        } catch {
            throw new Error(`Docker returned malformed ${label} metadata; no report was written.`);
        }
    }
    return rows;
}

function safeMetadataString(value, maxLength = 1024) {
    if (typeof value !== 'string') return null;
    const withoutControls = Array.from(value)
        .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
        .join('')
        .trim();
    return withoutControls ? withoutControls.slice(0, maxLength) : null;
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function secretFinding(code, source, key, value) {
    const normalizedValue = String(value || '');
    return {
        code,
        severity: PLACEHOLDER_VALUES.has(normalizedValue.trim().toLowerCase()) ? 'medium' : 'high',
        source,
        key: safeMetadataString(key, 160),
        valueLength: normalizedValue.length,
        valueSha256: fingerprint(normalizedValue),
        placeholderLike: PLACEHOLDER_VALUES.has(normalizedValue.trim().toLowerCase())
    };
}

function analyzeConfig(config) {
    const findings = [];
    for (const entry of Array.isArray(config?.Env) ? config.Env : []) {
        if (typeof entry !== 'string') continue;
        const separator = entry.indexOf('=');
        const key = separator >= 0 ? entry.slice(0, separator) : entry;
        const value = separator >= 0 ? entry.slice(separator + 1) : '';
        if (SENSITIVE_NAME_PATTERN.test(key)) {
            findings.push(secretFinding('sensitive_config_env', 'config_env', key, value));
        }
    }
    const labels = config?.Labels && typeof config.Labels === 'object' && !Array.isArray(config.Labels)
        ? config.Labels
        : {};
    for (const [key, value] of Object.entries(labels)) {
        if (SENSITIVE_NAME_PATTERN.test(key)) {
            findings.push(secretFinding('sensitive_label', 'config_label', key, value));
        }
    }
    return findings;
}

function analyzeHistory(historyRows) {
    const findings = [];
    for (const row of historyRows) {
        const command = typeof row.CreatedBy === 'string' ? row.CreatedBy : '';
        if (!command) continue;
        const commandSha256 = fingerprint(command);
        const sensitiveNames = [...command.matchAll(SENSITIVE_ASSIGNMENT_PATTERN)]
            .map((match) => match[1] || match[0].split('=')[0].trim())
            .map((name) => safeMetadataString(name, 160))
            .filter(Boolean);
        if (sensitiveNames.length > 0) {
            findings.push({
                code: 'sensitive_history_command',
                severity: 'high',
                source: 'image_history',
                indicators: [...new Set(sensitiveNames)],
                commandSha256
            });
        }
        if (/\b(?:COPY|ADD)\s+\.\s+\.(?:\s|$)/i.test(command)) {
            findings.push({
                code: 'broad_copy_history',
                severity: 'high',
                source: 'image_history',
                commandSha256
            });
        }
        if (/(?:^|[\\/])(?:\.env(?:\.|$)|users\.json|rooms\.json|credentials?(?:[\\/]|$)|data[\\/])/i.test(command)) {
            findings.push({
                code: 'state_or_credential_path_history',
                severity: 'high',
                source: 'image_history',
                commandSha256
            });
        }
    }
    return findings;
}

function selectLocalImageRefs(listRows, { allLocal, imageRefs }) {
    if (imageRefs.length > 0) return [...new Set(imageRefs)];
    const refs = [];
    for (const row of listRows) {
        const repository = safeMetadataString(row.Repository, 512) || '';
        const tag = safeMetadataString(row.Tag, 128) || '';
        if (!allLocal && !PROJECT_IMAGE_PATTERN.test(`${repository}:${tag}`)) continue;
        const id = safeMetadataString(row.ID, 512);
        if (id && SAFE_IMAGE_REF_PATTERN.test(id)) refs.push(id);
    }
    return [...new Set(refs)];
}

function projectImage(inspected, historyRows) {
    const repoTags = Array.isArray(inspected.RepoTags)
        ? inspected.RepoTags.map((value) => safeMetadataString(value, 512)).filter(Boolean)
        : [];
    const repoDigests = Array.isArray(inspected.RepoDigests)
        ? inspected.RepoDigests.map((value) => safeMetadataString(value, 512)).filter(Boolean)
        : [];
    const findings = [...analyzeConfig(inspected.Config), ...analyzeHistory(historyRows)];
    return {
        id: safeMetadataString(inspected.Id, 512),
        repoTags,
        repoDigests,
        pushedEvidence: repoDigests.length > 0,
        createdAt: safeMetadataString(inspected.Created, 64),
        sizeBytes: Number.isSafeInteger(inspected.Size) && inspected.Size >= 0 ? inspected.Size : null,
        architecture: safeMetadataString(inspected.Architecture, 32),
        os: safeMetadataString(inspected.Os, 32),
        layerCount: Array.isArray(inspected.RootFS?.Layers) ? inspected.RootFS.Layers.length : 0,
        historyEntryCount: historyRows.length,
        findings
    };
}

async function runContainerImageInventory({
    commandRunner = defaultCommandRunner,
    options = parseArgs([]),
    outputPath,
    now = new Date()
} = /** @type {any} */ ({})) {
    let listRows = [];
    if (options.imageRefs.length === 0) {
        const listOutput = await dockerRead(
            ['image', 'ls', '--all', '--no-trunc', '--format', '{{json .}}'],
            commandRunner
        );
        listRows = parseJsonLines(listOutput, 'image-list');
    }
    const refs = selectLocalImageRefs(listRows, options);
    let inspectedRows = [];
    if (refs.length > 0) {
        const inspectOutput = await dockerRead(['image', 'inspect', ...refs], commandRunner);
        try {
            inspectedRows = JSON.parse(inspectOutput);
        } catch {
            throw new Error('Docker returned malformed image inspection metadata; no report was written.');
        }
        if (!Array.isArray(inspectedRows) || inspectedRows.length !== refs.length) {
            throw new Error('Docker image inspection was incomplete; no report was written.');
        }
    }

    const images = [];
    for (const inspected of inspectedRows) {
        const id = safeMetadataString(inspected?.Id, 512);
        if (!id || !SAFE_IMAGE_REF_PATTERN.test(id)) {
            throw new Error('Docker returned an invalid image id; no report was written.');
        }
        const historyOutput = await dockerRead(
            ['image', 'history', '--no-trunc', '--format', '{{json .}}', '--', id],
            commandRunner
        );
        images.push(projectImage(inspected, parseJsonLines(historyOutput, 'image-history')));
    }
    const findings = images.flatMap((image) => image.findings);
    const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
    const evidenceSha256 = fingerprint(JSON.stringify({ images }));
    const report = {
        schemaVersion: 1,
        kind: 'halastudy-local-container-image-risk-inventory',
        generatedAt,
        dryRun: true,
        source: 'local-docker-daemon',
        selectionMode: options.imageRefs.length > 0
            ? 'explicit-local-refs'
            : options.allLocal ? 'all-local-images' : 'halastudy-tag-filter',
        remoteRegistryContacted: false,
        mutationsPerformed: false,
        credentialRotationPerformed: false,
        images,
        summary: {
            imageCount: images.length,
            imagesWithRepoDigests: images.filter((image) => image.pushedEvidence).length,
            findingCount: findings.length,
            highFindingCount: findings.filter((finding) => finding.severity === 'high').length,
            mediumFindingCount: findings.filter((finding) => finding.severity === 'medium').length
        },
        evidenceSha256,
        operatorNotice: 'Metadata findings are evidence only. This tool cannot pull, push, remove, or rotate credentials.'
    };
    const resolvedOutput = outputPath
        ? path.resolve(outputPath)
        : defaultEvidencePath('container-image-risk-inventory', { now });
    return { outputPath: writeJsonEvidence(resolvedOutput, report), report };
}

function printHelp() {
    console.log('Usage: npm run inventory:images -- [--dry-run] [--image <local-ref> ... | --all-local] [--output <new-file.json>]');
    console.log('Default selection: local image tags containing Halastudy or Co-Study. No registry is contacted.');
    console.log('Read-only: only local image list/inspect/history commands are allowed.');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    const result = await runContainerImageInventory({ options, outputPath: options.outputPath });
    console.log(`Dry-run image inventory wrote ${result.report.images.length} image(s) to ${result.outputPath}`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { parseArgs, runContainerImageInventory };
