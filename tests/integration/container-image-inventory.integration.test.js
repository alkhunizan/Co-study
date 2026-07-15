const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    parseArgs,
    runContainerImageInventory
} = require('../../scripts/inventory-container-images');

function tempReportPath(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-image-inventory-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return path.join(directory, 'image-report.json');
}

test('container image inventory records pushed metadata and fingerprints secret-risk evidence without exposing values', async (t) => {
    const secretValue = 'real-secret-value-that-must-not-leak';
    const commands = [];
    const commandRunner = async (args) => {
        commands.push(args);
        if (args[1] === 'ls') {
            return {
                status: 0,
                stdout: [
                    JSON.stringify({
                        Repository: 'ghcr.io/example/co-study',
                        Tag: 'production',
                        ID: 'sha256:halastudy',
                        Digest: 'sha256:published',
                        CreatedAt: '2026-07-14 20:00:00 +0000 UTC',
                        Size: '180MB'
                    }),
                    JSON.stringify({
                        Repository: 'unrelated/database',
                        Tag: 'latest',
                        ID: 'sha256:unrelated',
                        Digest: '<none>'
                    })
                ].join('\n'),
                stderr: ''
            };
        }
        if (args[1] === 'inspect') {
            return {
                status: 0,
                stdout: JSON.stringify([{
                    Id: 'sha256:halastudy',
                    RepoTags: ['ghcr.io/example/co-study:production'],
                    RepoDigests: ['ghcr.io/example/co-study@sha256:published'],
                    Created: '2026-07-14T20:00:00.000Z',
                    Size: 188743680,
                    Architecture: 'amd64',
                    Os: 'linux',
                    RootFS: { Layers: ['sha256:layer-1', 'sha256:layer-2'] },
                    Config: {
                        Env: [
                            'NODE_ENV=production',
                            `SESSION_SECRET=${secretValue}`
                        ],
                        Labels: {
                            'org.opencontainers.image.source': 'https://example.invalid/repository',
                            deployment_token: secretValue
                        }
                    }
                }]),
                stderr: ''
            };
        }
        if (args[1] === 'history') {
            return {
                status: 0,
                stdout: [
                    JSON.stringify({ ID: 'sha256:layer-2', CreatedBy: `RUN SESSION_SECRET=${secretValue} npm start` }),
                    JSON.stringify({ ID: 'sha256:layer-1', CreatedBy: 'COPY . . # buildkit' })
                ].join('\n'),
                stderr: ''
            };
        }
        throw new Error(`Unexpected Docker command: ${args.join(' ')}`);
    };
    const outputPath = tempReportPath(t);

    const result = await runContainerImageInventory({
        commandRunner,
        options: parseArgs(['--dry-run']),
        outputPath,
        now: new Date('2026-07-15T06:00:00.000Z')
    });

    assert.equal(result.report.dryRun, true);
    assert.equal(result.report.remoteRegistryContacted, false);
    assert.equal(result.report.mutationsPerformed, false);
    assert.equal(result.report.credentialRotationPerformed, false);
    assert.equal(result.report.images.length, 1);
    const [image] = result.report.images;
    assert.equal(image.id, 'sha256:halastudy');
    assert.equal(image.pushedEvidence, true);
    assert.deepEqual(image.repoDigests, ['ghcr.io/example/co-study@sha256:published']);
    assert.equal(image.layerCount, 2);
    assert.ok(image.findings.some((finding) => finding.code === 'sensitive_config_env'));
    assert.ok(image.findings.some((finding) => finding.code === 'sensitive_label'));
    assert.ok(image.findings.some((finding) => finding.code === 'sensitive_history_command'));
    assert.ok(image.findings.some((finding) => finding.code === 'broad_copy_history'));
    assert.ok(image.findings.every((finding) => !('value' in finding) && !('command' in finding)));

    const serialized = fs.readFileSync(outputPath, 'utf8');
    assert.doesNotMatch(serialized, new RegExp(secretValue));
    assert.match(serialized, /valueSha256|commandSha256/);
    assert.deepEqual(commands.map((args) => args.slice(0, 2)), [
        ['image', 'ls'],
        ['image', 'inspect'],
        ['image', 'history']
    ]);
    assert.equal(commands[1].includes('sha256:unrelated'), false);
});

test('container image inventory accepts explicit safe refs and rejects destructive or injectable CLI input', () => {
    assert.deepEqual(parseArgs([
        '--dry-run',
        '--image', 'ghcr.io/example/co-study@sha256:abc123',
        '--output', 'report.json'
    ]), {
        allLocal: false,
        dryRun: true,
        help: false,
        imageRefs: ['ghcr.io/example/co-study@sha256:abc123'],
        outputPath: 'report.json'
    });

    for (const args of [
        ['--delete'],
        ['--apply'],
        ['--push'],
        ['--pull'],
        ['--image', 'safe; docker image rm victim'],
        ['--image', '--all-local']
    ]) {
        assert.throws(() => parseArgs(args), /unsupported|requires|invalid/i);
    }
});

test('container image inventory source allows only local read commands and never shells out', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'scripts', 'inventory-container-images.js'),
        'utf8'
    );
    assert.doesNotMatch(source, /execSync|shell\s*:\s*true/);
    assert.doesNotMatch(source, /['"](?:push|pull|rm|rmi|prune|build|login|logout)['"]/);
    assert.match(source, /spawnSync\s*\(\s*['"]docker['"]/);
});
