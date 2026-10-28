const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { repoRoot } = require('../helpers/test-env');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('PM2 runs exactly one loopback production process with a 20 second drain window', () => {
    const configPath = path.join(repoRoot, 'ecosystem.config.js');
    delete require.cache[require.resolve(configPath)];
    const ecosystem = require(configPath);
    assert.equal(ecosystem.apps.length, 1);

    const app = ecosystem.apps[0];
    assert.equal(app.name, 'co-study');
    assert.equal(app.cwd, '/opt/halastudy');
    assert.equal(app.instances, 1);
    assert.equal(app.exec_mode, 'fork');
    assert.equal(app.kill_timeout, 20_000);
    assert.equal(app.env.NODE_ENV, 'production');
    assert.equal(app.env.HOST, '127.0.0.1');
    assert.equal(app.env.TRUST_PROXY, '1');
});

test('PM2 startup requires the dedicated service user and protected explicit env file', () => {
    const startScript = readRepoFile('scripts/deploy/start.sh');

    assert.match(startScript, /SERVICE_USER="halastudy"/);
    assert.match(startScript, /ENV_FILE="\/var\/lib\/halastudy\/\.env"/);
    assert.match(startScript, /PM2_HOME="\/var\/lib\/halastudy\/\.pm2"/);
    assert.match(startScript, /umask 077/);
    assert.match(startScript, /id -un/);
    assert.match(startScript, /stat -c ['"]%[aU]['"]/);
    assert.match(startScript, /source "\$\{ENV_FILE\}"/);
    assert.doesNotMatch(startScript, /pm2 startup/);
    assert.doesNotMatch(startScript, /\|\| true/);
});

test('bootstrap creates and consistently uses the halastudy service account', () => {
    const bootstrap = readRepoFile('scripts/deploy/bootstrap.sh');

    assert.match(bootstrap, /SERVICE_USER="halastudy"/);
    assert.match(bootstrap, /useradd --system/);
    assert.match(bootstrap, /install -d -m 0700 -o "\$\{SERVICE_USER\}"/);
    assert.match(bootstrap, /sudo -u "\$\{SERVICE_USER\}"/);
    assert.match(bootstrap, /pm2 startup systemd -u "\$\{SERVICE_USER\}"/);
    assert.match(bootstrap, /nginx -t && systemctl reload nginx/);
    assert.match(bootstrap, /ufw --force enable/);
    assert.match(bootstrap, /ufw status verbose/);
    assert.doesNotMatch(bootstrap, /ufw[^\n]*\|\| true/);
    assert.doesNotMatch(bootstrap, /RUN_USER=/);
});
