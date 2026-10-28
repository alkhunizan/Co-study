const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const MAX_COMMAND_OUTPUT_BYTES = 128 * 1024 * 1024;

function isCommandMissing(error) {
    return /** @type {NodeJS.ErrnoException | undefined} */ (error)?.code === 'ENOENT';
}

function run(command, args, { capture = false } = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: capture ? 'utf8' : undefined,
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
        stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    if (isCommandMissing(result.error)) throw new Error(`${command} is required for Docker image verification.`);
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = capture ? `\n${String(result.stderr || result.stdout).trim()}` : '';
        throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}.${detail}`);
    }
    return capture ? String(result.stdout) : '';
}

function normalizeArchivePath(value) {
    return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function isForbiddenImagePath(value) {
    const archivePath = normalizeArchivePath(value);
    const isDirectory = archivePath.endsWith('/');
    if (/^app\/\.env(?:\.|$)/i.test(archivePath)) return true;
    if (/^app\/(?:credentials|backups)(?:\/|$)/i.test(archivePath)) return !isDirectory;
    if (/^app\/data\//i.test(archivePath)) return !isDirectory;
    if (/^app\/[^/]+\.(?:log|pem|key)$/i.test(archivePath)) return true;
    return false;
}

function listArchive(archivePath) {
    return run('tar', ['-tf', archivePath], { capture: true })
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function assertArchiveIsClean(archivePath, canary, label) {
    const forbiddenPaths = listArchive(archivePath).filter(isForbiddenImagePath);
    if (forbiddenPaths.length > 0) {
        throw new Error(`${label} contains forbidden runtime state: ${forbiddenPaths.slice(0, 10).join(', ')}`);
    }

    const archive = fs.readFileSync(archivePath);
    if (archive.includes(Buffer.from(canary))) {
        throw new Error(`${label} contains a build-context secret canary.`);
    }
}

function createContextCanaries(canary) {
    const candidates = [
        ['.env.ci-secret-canary', `CI_SECRET=${canary}\n`],
        ['data/ci-user-state-canary.json', JSON.stringify({ canary })],
        ['ci-secret-canary.log', `${canary}\n`],
        ['backups/ci-backup-canary.json', JSON.stringify({ canary })],
        ['credentials/ci-credential-canary.txt', `${canary}\n`]
    ];
    const createdFiles = [];

    for (const [relativePath, contents] of candidates) {
        const absolutePath = path.join(repoRoot, relativePath);
        if (fs.existsSync(absolutePath)) throw new Error(`Refusing to overwrite existing CI canary path: ${relativePath}`);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        createdFiles.push(absolutePath);
    }
    return createdFiles;
}

function verifyImageConfig(imageTag) {
    const inspected = JSON.parse(run('docker', ['image', 'inspect', imageTag], { capture: true }));
    const config = inspected[0]?.Config;
    if (!config) throw new Error('Docker image inspect returned no image configuration.');
    if (config.User !== 'node') throw new Error(`Docker image must run as node, received ${config.User || '<root>'}.`);

    const environment = new Set(config.Env || []);
    for (const expected of ['NODE_ENV=production', 'HOST=0.0.0.0']) {
        if (!environment.has(expected)) throw new Error(`Docker image is missing ${expected}.`);
    }
    const healthcheck = JSON.stringify(config.Healthcheck || {});
    if (!healthcheck.includes('/api/health')) throw new Error('Docker image healthcheck must call /api/health.');
}

function verifyDockerImage() {
    run('docker', ['version'], { capture: true });

    const canary = `HALASTUDY_CI_CONTEXT_CANARY_${crypto.randomBytes(16).toString('hex')}`;
    const imageTag = process.env.CI_DOCKER_IMAGE_TAG || `halastudy-ci:${process.pid}`;
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-image-'));
    let containerId = '';
    let createdFiles = [];

    try {
        createdFiles = createContextCanaries(canary);
        run('docker', ['build', '--tag', imageTag, '--file', path.join(repoRoot, 'Dockerfile'), repoRoot]);
        verifyImageConfig(imageTag);

        const history = run('docker', ['history', '--no-trunc', '--format', '{{json .CreatedBy}}', imageTag], { capture: true });
        if (history.includes(canary)) throw new Error('Docker history contains a build-context secret canary.');
        if (/(?:SESSION_SECRET|ADMIN_SESSION_SECRET|GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY)=/i.test(history)) {
            throw new Error('Docker history contains a credential-shaped environment assignment.');
        }

        const savedImage = path.join(temporaryDirectory, 'image.tar');
        const extractedImage = path.join(temporaryDirectory, 'saved');
        fs.mkdirSync(extractedImage);
        run('docker', ['image', 'save', '--output', savedImage, imageTag]);
        run('tar', ['-xf', savedImage, '-C', extractedImage]);

        const manifest = JSON.parse(fs.readFileSync(path.join(extractedImage, 'manifest.json'), 'utf8'));
        const layers = manifest[0]?.Layers || [];
        if (layers.length === 0) throw new Error('Docker image archive contains no layers.');
        for (const relativeLayerPath of layers) {
            assertArchiveIsClean(path.join(extractedImage, relativeLayerPath), canary, `Docker layer ${relativeLayerPath}`);
        }

        containerId = run('docker', ['create', imageTag], { capture: true }).trim();
        if (!containerId) throw new Error('Docker did not return a container ID for final-filesystem inspection.');
        const exportedContainer = path.join(temporaryDirectory, 'container.tar');
        run('docker', ['export', '--output', exportedContainer, containerId]);
        assertArchiveIsClean(exportedContainer, canary, 'Final Docker filesystem');

        process.stdout.write(`${JSON.stringify({
            ok: true,
            image: imageTag,
            layers: layers.length,
            contextCanariesExcluded: createdFiles.length
        })}\n`);
    } finally {
        if (containerId) spawnSync('docker', ['container', 'rm', '--force', containerId], { cwd: repoRoot, stdio: 'ignore' });
        spawnSync('docker', ['image', 'rm', '--force', imageTag], { cwd: repoRoot, stdio: 'ignore' });
        for (const filePath of createdFiles) fs.rmSync(filePath, { force: true });
        fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    }
}

if (require.main === module) {
    try {
        verifyDockerImage();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    isForbiddenImagePath,
    normalizeArchivePath,
    verifyDockerImage
};
