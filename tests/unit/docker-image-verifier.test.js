const assert = require('node:assert/strict');
const test = require('node:test');

const { isForbiddenImagePath } = require('../../scripts/ci/verify-docker-image');

test('Docker layer inspection rejects secrets and persisted state but permits empty state directories', () => {
    for (const forbidden of [
        'app/.env',
        './app/.env.production',
        'app/data/users.json',
        'app/data/backups/snapshot.json',
        'app/backups/rooms.json',
        'app/credentials/service-account.json',
        'app/runtime.log',
        'app/server.key'
    ]) {
        assert.equal(isForbiddenImagePath(forbidden), true, `${forbidden} must fail image inspection`);
    }

    for (const allowed of [
        'app/data/',
        'app/data/backups/',
        'app/services/',
        'app/services/config/secrets.js',
        'app/node_modules/example/fixtures/test.pem',
        'app/public/index.js'
    ]) {
        assert.equal(isForbiddenImagePath(allowed), false, `${allowed} should be permitted`);
    }
});
