const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createUserStore, createUser } = require('../../user-store');
const { createFileUserPersistence } = require('../../services/persistence/file-user-persistence');

function setup(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-file-users-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const userStore = createUserStore({ filePath: path.join(dir, 'users.json'), logger: { warn() {} } });
    const users = new Map();
    const deleted = createUser({ email: 'deleted@example.com', passwordHash: 'salt:hash', displayName: 'Deleted' });
    const other = createUser({ email: 'other@example.com', passwordHash: 'salt:hash', displayName: 'Other' });
    users.set(deleted.id, deleted);
    users.set(other.id, other);
    return { userStore, users, deleted, other };
}

function persistedUsers(userStore) {
    return JSON.parse(fs.readFileSync(userStore.filePath, 'utf8'));
}

function persistedIds(userStore) {
    return persistedUsers(userStore).map((user) => user.id).sort();
}

test('a concurrent save of another account cannot restore an account whose deletion is in flight', async (t) => {
    const { userStore, users, deleted, other } = setup(t);
    const persistence = createFileUserPersistence({ userStore, users });
    await persistence.persistUser(other);

    const deletion = persistence.deleteUser(deleted);
    other.displayName = 'Other renamed';
    const save = persistence.persistUser(other);
    await Promise.all([deletion, save]);
    users.delete(deleted.id);

    assert.deepEqual(persistedIds(userStore), [other.id]);
    assert.equal(persistedUsers(userStore)[0].displayName, 'Other renamed');
});

test('a failed deletion keeps the account in later snapshots', async (t) => {
    const { userStore, users, deleted, other } = setup(t);
    const failingStore = {
        flush(source) {
            if (!source.has(deleted.id)) return Promise.reject(new Error('injected deletion write failure'));
            return userStore.flush(source);
        }
    };
    const persistence = createFileUserPersistence({ userStore: failingStore, users });

    await assert.rejects(persistence.deleteUser(deleted), /injected deletion write failure/);
    await persistence.persistUser(other);

    assert.deepEqual(persistedIds(userStore), [deleted.id, other.id].sort());
});
