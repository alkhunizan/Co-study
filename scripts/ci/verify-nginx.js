const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const NGINX_IMAGE = 'nginx:1.27.5-alpine';

function isCommandMissing(error) {
    return /** @type {NodeJS.ErrnoException | undefined} */ (error)?.code === 'ENOENT';
}

function runDockerNginxValidation() {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-nginx-'));
    try {
        const site = fs.readFileSync(path.join(repoRoot, 'scripts', 'deploy', 'nginx-halastudy.conf'), 'utf8')
            .replaceAll('__DOMAIN__', 'ci.halastudy.invalid');
        fs.writeFileSync(path.join(temporaryDirectory, 'site.conf'), site, 'utf8');
        fs.writeFileSync(path.join(temporaryDirectory, 'nginx.conf'), [
            'pid /tmp/nginx.pid;',
            'error_log stderr notice;',
            'events {}',
            'http {',
            '    include /etc/nginx/mime.types;',
            '    include /validation/site.conf;',
            '}',
            ''
        ].join('\n'), 'utf8');

        const result = spawnSync('docker', [
            'run',
            '--rm',
            '--network',
            'none',
            '--volume',
            `${temporaryDirectory}:/validation:ro`,
            NGINX_IMAGE,
            'nginx',
            '-t',
            '-c',
            '/validation/nginx.conf'
        ], {
            cwd: repoRoot,
            stdio: 'inherit'
        });

        if (isCommandMissing(result.error)) {
            throw new Error('Docker is required for the isolated Nginx configuration check.');
        }
        if (result.error) throw result.error;
        return result.status || 0;
    } finally {
        fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    }
}

if (require.main === module) {
    try {
        process.exitCode = runDockerNginxValidation();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { runDockerNginxValidation };
