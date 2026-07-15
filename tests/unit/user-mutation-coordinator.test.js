const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    createKeyedMutationCoordinator,
    createUserMutationCoordinator
} = require('../../services/auth/user-mutation-coordinator');
const { createUser, createUserStore } = require('../../user-store');

function deferred() {
    /** @type {() => void} */
    let resolve = () => {};
    /** @type {Promise<void>} */
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

test('a queued file-backed mutation cannot recreate a durably deleted user', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'co-study-user-delete-race-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const filePath = path.join(directory, 'users.json');
    const store = createUserStore({ filePath, logger: { warn() {} } });
    const user = createUser({
        email: 'delete-race@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Delete Race'
    });
    /** @type {Map<string, any>} */
    const users = new Map([[user.id, user]]);
    await store.flush(users);

    const coordinator = createUserMutationCoordinator({
        getUser: (userId) => users.get(userId) || null
    });
    const deletionStarted = deferred();
    const releaseDeletion = deferred();

    const deletion = coordinator.run(user, async () => {
        deletionStarted.resolve();
        await releaseDeletion.promise;
        const remainingUsers = new Map(users);
        remainingUsers.delete(user.id);
        await store.flush(remainingUsers);
        users.delete(user.id);
    });
    await deletionStarted.promise;

    const staleMutation = coordinator.run(user, async () => {
        user.bio = 'resurrected';
        await store.flush(users);
    });
    releaseDeletion.resolve();

    await deletion;
    await assert.rejects(
        staleMutation,
        (error) => /** @type {any} */ (error)?.code === 'AUTH_REQUIRED'
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), []);
});

test('keyed mutations serialize competing identity reservations', async () => {
    const coordinator = createKeyedMutationCoordinator();
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const order = [];

    const first = coordinator.run('google-subject', async () => {
        order.push('first-start');
        firstStarted.resolve();
        await releaseFirst.promise;
        order.push('first-end');
    });
    await firstStarted.promise;
    const second = coordinator.run('google-subject', () => {
        order.push('second');
    });
    releaseFirst.resolve();
    await Promise.all([first, second]);

    assert.deepEqual(order, ['first-start', 'first-end', 'second']);
});
