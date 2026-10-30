const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const SHELLCHECK_IMAGE = 'koalaman/shellcheck:v0.10.0';

function collectShellScripts(directory) {
    const results = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectShellScripts(absolutePath));
        } else if (entry.isFile() && entry.name.endsWith('.sh')) {
            results.push(path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/'));
        }
    }
    return results.sort();
}

function run(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        ...options
    });
}

function isCommandMissing(error) {
    return /** @type {NodeJS.ErrnoException | undefined} */ (error)?.code === 'ENOENT';
}

function runShellcheck() {
    const shellScripts = collectShellScripts(path.join(repoRoot, 'scripts'));
    if (shellScripts.length === 0) throw new Error('No shell scripts were found for ShellCheck.');

    const binary = process.env.SHELLCHECK_BIN || 'shellcheck';
    const direct = run(binary, ['--external-sources', ...shellScripts]);
    if (!direct.error) return direct.status || 0;
    if (!isCommandMissing(direct.error)) throw direct.error;

    const docker = run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '--volume',
        `${repoRoot}:/workspace:ro`,
        '--workdir',
        '/workspace',
        SHELLCHECK_IMAGE,
        '--external-sources',
        ...shellScripts
    ]);
    if (isCommandMissing(docker.error)) {
        throw new Error('ShellCheck is unavailable. Install shellcheck or Docker, then rerun npm run lint:shell.');
    }
    if (docker.error) throw docker.error;
    return docker.status || 0;
}

if (require.main === module) {
    try {
        process.exitCode = runShellcheck();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { collectShellScripts, runShellcheck };
