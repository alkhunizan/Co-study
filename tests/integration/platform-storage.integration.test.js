const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPlatform } = require('../../services/platform');
const { createDatabase } = require('../../services/platform/database');
const { createRecordStore } = require('../../services/platform/record-store');
const { backupDatabase, restoreDatabase } = require('../../services/platform/maintenance');
const { createUser, sanitizeUser } = require('../../user-store');

test('durable account storage survives reopen, prevents reimport and restores validated snapshots', { timeout: 120000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'halastudy-storage-'));
    const user = createUser({ email: 'durable@example.invalid', displayName: 'Durable', passwordHash: 'test:hash' });
    const legacyStore = { filePath: path.join(directory, 'users.json'), loadUsers: () => [user] };
    const logger = { error() {} };
    const create = () => createPlatform({ userStateFile: legacyStore.filePath, secret: 'storage-test-secret',
        env: { NODE_ENV: 'test', PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: path.join(directory, 'db') }, logger });
    let platform = create();
    await platform.ready;
    let store = createRecordStore({ platform, kind: 'accounts', legacyStore, sanitize: sanitizeUser, logger });
    assert.equal((await store.hydrate()).length, 1);
    await assert.rejects(createDatabase({ directory: path.join(directory, 'db') }), /PLATFORM_LOCKED/);
    const users = new Map([[user.id, user]]);
    user.displayName = 'Updated';
    await store.flush(users);
    const checkout = await platform.billing.checkout(user.id);
    await platform.billing.complete(user.id, checkout.id, checkout.token, 'success');
    const backupPath = path.join(directory, 'backups', 'platform.json');
    await backupDatabase(platform.db, backupPath);
    await platform.db.close();
    platform = create();
    await platform.ready;
    store = createRecordStore({ platform, kind: 'accounts', legacyStore, sanitize: sanitizeUser, logger });
    const reloaded = await store.hydrate();
    assert.equal(reloaded[0].displayName, 'Updated');
    assert.equal((await platform.entitlements.resolve(user.id)).plan.id, 'vip');
    await store.flush(new Map());
    await platform.db.close();
    platform = create();
    await platform.ready;
    store = createRecordStore({ platform, kind: 'accounts', legacyStore, sanitize: sanitizeUser, logger });
    assert.deepEqual(await store.hydrate(), [], 'legacy JSON must not resurrect a deleted account');
    await platform.db.close();
    const restored = await createDatabase();
    try {
        const snapshot = JSON.parse(await fs.readFile(backupPath, 'utf8'));
        const corrupted = structuredClone(snapshot);
        corrupted.tables.accounts[0].email = 'tampered@example.invalid';
        await assert.rejects(restoreDatabase(restored, corrupted), /BACKUP_INVALID/);
        await restoreDatabase(restored, snapshot);
        const account = (await restored.query('SELECT payload FROM halastudy.accounts WHERE id=$1', [user.id])).rows[0].payload;
        assert.equal(account.displayName, 'Updated');
        assert.equal(account.tokenEpoch, user.tokenEpoch + 1, 'restore must revoke old account cookies');
        assert.equal((await restored.query('SELECT * FROM halastudy.staff_sessions')).rows.length, 0);
        await assert.rejects(restoreDatabase(restored, snapshot), /RESTORE_REQUIRES_EMPTY_DATABASE/);
    } finally {
        await restored.close();
    }
});
