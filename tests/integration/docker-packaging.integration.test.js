const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { repoRoot } = require('../helpers/test-env');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Docker build context is deny-by-default and explicitly excludes secrets and state', () => {
    const dockerignore = readRepoFile('.dockerignore');
    const rules = dockerignore
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));

    assert.equal(rules[0], '**');
    for (const exclusion of ['.env', '.env.*', 'data/', '*.log', 'backups/', 'credentials/']) {
        assert.ok(rules.includes(exclusion), `.dockerignore must explicitly exclude ${exclusion}`);
    }
    assert.ok(rules.includes('!services/**'));
    assert.ok(rules.includes('!public/**'));
});

test('Docker image copies only runtime paths and drops root before startup', () => {
    const dockerfile = readRepoFile('Dockerfile');

    assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./);
    assert.match(dockerfile, /COPY --chown=node:node package\.json package-lock\.json/);
    assert.match(dockerfile, /COPY --chown=node:node services \.\/services/);
    assert.match(dockerfile, /RUN mkdir -p \/app\/data\/backups/);
    assert.match(dockerfile, /ENV HOST=0\.0\.0\.0/);
    assert.match(dockerfile, /\nUSER node\s*\n/);
    assert.match(dockerfile, /HEALTHCHECK[\s\S]*\/api\/health/);
});

test('Docker Compose is explicitly local development with mesh media', () => {
    const compose = readRepoFile('docker-compose.yml');

    assert.match(compose, /NODE_ENV:\s*development/);
    assert.match(compose, /VIDEO_PROVIDER:\s*mesh/);
    assert.match(compose, /ENABLE_DEV_MESH:\s*["']?true["']?/);
    assert.match(compose, /HOST:\s*["']?0\.0\.0\.0["']?/);
    assert.doesNotMatch(compose, /NODE_ENV[=:]-?production/);
});
