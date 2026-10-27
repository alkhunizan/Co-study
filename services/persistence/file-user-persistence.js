// Whole-store persistence fallback for user stores that only expose flush(map)
// (the local users.json store). Per-user mutation locks do not serialize
// different accounts, and flush() serializes its snapshot when it is queued,
// so every snapshot must exclude accounts whose deletion is in flight;
// otherwise a concurrent save of another account is queued behind the
// deletion write and restores the deleted account on disk.

/** @param {{ userStore: any, users: Map<string, any> }} options */
function createFileUserPersistence({ userStore, users }) {
    /** @type {Set<string>} */
    const deletingUserIds = new Set();

    function snapshot() {
        if (deletingUserIds.size === 0) return users;
        const remainingUsers = new Map(users);
        for (const userId of deletingUserIds) {
            // The caller drops a deleted account from the live map once its
            // deletion resolves; after that it no longer needs filtering.
            if (!users.has(userId)) deletingUserIds.delete(userId);
            remainingUsers.delete(userId);
        }
        return remainingUsers;
    }

    return {
        // The whole store is written, so the changed user needs no special handling.
        persistUser(_user) {
            return userStore.flush(snapshot());
        },
        async deleteUser(user) {
            deletingUserIds.add(user.id);
            try {
                await userStore.flush(snapshot());
            } catch (error) {
                // The account stays live, so later snapshots must include it again.
                deletingUserIds.delete(user.id);
                throw error;
            }
        }
    };
}

module.exports = { createFileUserPersistence };
