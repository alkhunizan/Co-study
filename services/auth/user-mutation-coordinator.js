// Serializes mutations for one in-memory account identity. Every queued
// operation re-checks that the exact object is still the live account before
// it runs, so work captured by a stale request cannot recreate a deleted user.

function authRequiredError() {
    return Object.assign(new Error('The authenticated account is no longer active.'), {
        code: 'AUTH_REQUIRED'
    });
}

/**
 * @param {{ getUser: (userId: string) => any }} options
 */
function createUserMutationCoordinator({ getUser } = /** @type {any} */ ({})) {
    if (typeof getUser !== 'function') {
        throw new TypeError('createUserMutationCoordinator requires getUser.');
    }

    const tails = new Map();

    /**
     * @param {{ id: string }} user
     * @param {() => any | Promise<any>} operation
     */
    function run(user, operation) {
        if (!user || typeof user.id !== 'string' || typeof operation !== 'function') {
            return Promise.reject(authRequiredError());
        }

        const userId = user.id;
        const previous = tails.get(userId) || Promise.resolve();
        const attempt = previous.catch(() => {}).then(async () => {
            if (getUser(userId) !== user) throw authRequiredError();
            return operation();
        });
        tails.set(userId, attempt);

        return attempt.finally(() => {
            if (tails.get(userId) === attempt) tails.delete(userId);
        });
    }

    return { run };
}

function createKeyedMutationCoordinator() {
    const tails = new Map();

    /**
     * @param {string} key
     * @param {() => any | Promise<any>} operation
     */
    function run(key, operation) {
        if (typeof key !== 'string' || !key || typeof operation !== 'function') {
            return Promise.reject(new TypeError('A non-empty mutation key and operation are required.'));
        }
        const previous = tails.get(key) || Promise.resolve();
        const attempt = previous.catch(() => {}).then(operation);
        tails.set(key, attempt);
        return attempt.finally(() => {
            if (tails.get(key) === attempt) tails.delete(key);
        });
    }

    return { run };
}

module.exports = { createKeyedMutationCoordinator, createUserMutationCoordinator };
