const assert = require('node:assert/strict');
const test = require('node:test');

const { createSupabaseClient } = require('../../services/supabase/client');
const { createSupabaseUserStore } = require('../../supabase-user-store');
const { applyFocusSession, createUser } = require('../../user-store');

function profileRow(index) {
    return {
        id: `user-${String(index).padStart(4, '0')}`,
        email: `student-${index}@example.com`,
        password_hash: '0123456789abcdef:0123456789abcdef',
        password_enabled: true,
        display_name: `Student ${index}`,
        auth_provider: 'password',
        created_at: '2026-07-15T00:00:00.000Z'
    };
}

function response(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() { return payload === null ? '' : JSON.stringify(payload); }
    };
}

test('Supabase hydration paginates beyond the PostgREST 1000-row default', async () => {
    const queries = [];
    const firstPage = Array.from({ length: 1000 }, (_, index) => profileRow(index));
    const client = {
        async select(table, query) {
            if (table === 'deletion_tombstones') return [];
            queries.push(query);
            return queries.length === 1 ? firstPage : [profileRow(1000)];
        }
    };
    const store = createSupabaseUserStore({ client, logger: { warn() {} } });

    const users = await store.hydrate();

    assert.equal(users.length, 1001);
    assert.match(queries[0], /limit=1000/);
    assert.match(queries[0], /offset=0/);
    assert.match(queries[1], /offset=1000/);
});

test('Supabase hydration rejects malformed response bodies', async () => {
    const store = createSupabaseUserStore({
        client: { async select() { return { not: 'an array' }; } },
        logger: { warn() {} }
    });

    await assert.rejects(store.hydrate(), /invalid profiles response/i);
});

test('Supabase hydration excludes profiles protected by deletion tombstones', async () => {
    const store = createSupabaseUserStore({
        client: {
            async select(table) {
                if (table === 'profiles') return [profileRow(1)];
                if (table === 'deletion_tombstones') {
                    return [{ user_id: profileRow(1).id, expires_at: '2026-08-14T00:00:00.000Z' }];
                }
                throw new Error(`Unexpected table ${table}`);
            }
        },
        logger: { warn() {} },
        now: () => Date.parse('2026-07-15T00:00:00.000Z')
    });

    assert.deepEqual(await store.hydrate(), []);
});

test('Supabase hydration ignores expired deletion tombstones', async () => {
    const store = createSupabaseUserStore({
        client: {
            async select(table) {
                if (table === 'profiles') return [profileRow(1)];
                if (table === 'deletion_tombstones') {
                    return [{ user_id: profileRow(1).id, expires_at: '2026-07-14T23:59:59.000Z' }];
                }
                throw new Error(`Unexpected table ${table}`);
            }
        },
        logger: { warn() {} },
        now: () => Date.parse('2026-07-15T00:00:00.000Z')
    });

    assert.equal((await store.hydrate()).length, 1);
});

test('a Supabase write queued during deletion cannot upsert the tombstoned profile', async () => {
    /** @type {() => void} */
    let releaseDeletion = () => {};
    /** @type {() => void} */
    let signalDeletionStarted = () => {};
    /** @type {Promise<void>} */
    const deletionGate = new Promise((resolve) => {
        releaseDeletion = resolve;
    });
    /** @type {Promise<void>} */
    const deletionStarted = new Promise((resolve) => {
        signalDeletionStarted = resolve;
    });
    const upserts = [];
    const client = {
        async select() { return []; },
        async rpc(functionName) {
            assert.equal(functionName, 'delete_profile_with_tombstone');
            signalDeletionStarted();
            await deletionGate;
        },
        async upsert(_table, rows) {
            upserts.push(rows);
        }
    };
    const store = createSupabaseUserStore({ client, logger: { warn() {} } });
    await store.hydrate();
    const user = createUser({
        email: 'supabase-delete-race@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Supabase Race'
    });

    const deletion = store.deleteUser(user);
    await deletionStarted;
    const staleSave = store.saveUser(user);
    releaseDeletion();

    await deletion;
    await assert.rejects(staleSave, /tombstoned/i);
    assert.deepEqual(upserts, []);
});

test('the in-memory Supabase write barrier expires after the 30-day tombstone window', async () => {
    let now = Date.parse('2026-07-15T00:00:00.000Z');
    let upsertCount = 0;
    const client = {
        async rpc() {},
        async upsert() { upsertCount += 1; }
    };
    const store = createSupabaseUserStore({ client, logger: { warn() {} }, now: () => now });
    const user = createUser({
        email: 'tombstone-expiry@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Tombstone Expiry'
    });

    await store.deleteUser(user);
    await assert.rejects(store.saveUser(user), /tombstoned/i);
    now += (30 * 24 * 60 * 60 * 1000) + 1;
    await store.saveUser(user);

    assert.equal(upsertCount, 1);
});

test('an immediate Supabase row failure rejects without poisoning the next mutation', async () => {
    let attempts = 0;
    const client = {
        async upsert() {
            attempts += 1;
            if (attempts === 1) throw new Error('injected Supabase failure');
        }
    };
    const store = createSupabaseUserStore({ client, logger: { warn() {} } });
    const user = createUser({
        email: 'row@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Row'
    });

    await assert.rejects(store.saveUser(user), /injected Supabase failure/);
    await store.saveUser(user);
    assert.equal(attempts, 2);
});

test('Supabase room events are idempotent writes with lifecycle metadata', async () => {
    const writes = [];
    const client = {
        async upsert(table, rows, options) {
            writes.push({ table, rows, options });
        }
    };
    const store = createSupabaseUserStore({ client, logger: { warn() {} } });
    const event = {
        eventId: '11111111-1111-4111-8111-111111111111',
        roomCode: 'ABC123',
        userId: null,
        nickname: 'Student',
        eventType: 'join',
        roomSchemaVersion: 2,
        ownerUserId: null,
        roomExpiresAt: '2026-10-13T08:00:00.000Z',
        occurrenceId: '2026-07-15T07:00:00.000Z',
        lifecycleEpoch: 4,
        occurredAt: '2026-07-15T06:55:00.000Z'
    };

    await store.logRoomEvent(event);
    await store.logRoomEvent(event);

    assert.equal(writes.length, 2);
    for (const write of writes) {
        assert.equal(write.table, 'room_events');
        assert.deepEqual(write.options, { onConflict: 'event_id' });
        assert.deepEqual(write.rows, [{
            event_id: event.eventId,
            room_code: event.roomCode,
            user_id: event.userId,
            nickname: event.nickname,
            event_type: event.eventType,
            room_schema_version: event.roomSchemaVersion,
            owner_user_id: event.ownerUserId,
            room_expires_at: event.roomExpiresAt,
            occurrence_id: event.occurrenceId,
            lifecycle_epoch: event.lifecycleEpoch,
            occurred_at: event.occurredAt
        }]);
    }
});

test('Supabase room event failures reject and do not poison the next replay', async () => {
    let attempts = 0;
    const store = createSupabaseUserStore({
        client: {
            async upsert() {
                attempts += 1;
                if (attempts === 1) throw new Error('injected room event failure');
            }
        },
        logger: { warn() {} }
    });
    const event = {
        eventId: '22222222-2222-4222-8222-222222222222',
        roomCode: 'ABC123',
        eventType: 'create',
        roomSchemaVersion: 2,
        lifecycleEpoch: 0,
        occurredAt: '2026-07-15T06:55:00.000Z'
    };

    await assert.rejects(store.logRoomEvent(event), /injected room event failure/);
    await store.logRoomEvent(event);

    assert.equal(attempts, 2);
});

test('a queued room event drops deleted profile foreign keys without dropping lifecycle data', async () => {
    const user = createUser({
        email: 'deleted-room-event@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Deleted Event User'
    });
    const writes = [];
    const store = createSupabaseUserStore({
        client: {
            async select(table) {
                if (table === 'profiles') {
                    return [{
                        ...profileRow(1),
                        id: user.id,
                        email: user.email,
                        display_name: user.displayName
                    }];
                }
                if (table === 'deletion_tombstones') return [];
                throw new Error(`Unexpected table ${table}`);
            },
            async rpc() {},
            async upsert(table, rows) {
                writes.push({ table, rows });
            }
        },
        logger: { warn() {} }
    });
    await store.hydrate();
    await store.deleteUser(user);

    await store.logRoomEvent({
        eventId: '33333333-3333-4333-8333-333333333333',
        roomCode: 'ABC123',
        userId: user.id,
        eventType: 'leave',
        roomSchemaVersion: 2,
        ownerUserId: user.id,
        lifecycleEpoch: 1,
        occurredAt: '2026-07-15T06:55:00.000Z'
    });

    assert.equal(writes.length, 1);
    assert.equal(writes[0].table, 'room_events');
    assert.equal(writes[0].rows[0].user_id, null);
    assert.equal(writes[0].rows[0].owner_user_id, null);
    assert.equal(writes[0].rows[0].event_type, 'leave');
});

test('Supabase focus persistence reports a durable duplicate and its canonical aggregate', async () => {
    const user = createUser({
        email: 'focus-rpc@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Focus RPC'
    });
    const payload = applyFocusSession(user, {
        minutes: 25,
        completionId: 'completion_rpc_0001',
        now: Date.parse('2026-07-15T08:00:00.000Z')
    });
    let calledFunction;
    const client = {
        async rpc(functionName) {
            calledFunction = functionName;
            return [{
                duplicate: true,
                accepted_minutes: 20,
                completion_day: payload.dayKey,
                persisted_focus_stats: {
                    days: { [payload.dayKey]: { focusMinutes: 20, sessions: 1 } },
                    totalFocusMinutes: 20,
                    totalSessions: 1,
                    completions: [{
                        completionId: payload.completionId,
                        acceptedMinutes: 20,
                        dayKey: payload.dayKey,
                        completedAt: Date.parse('2026-07-15T08:00:00.000Z')
                    }]
                },
                persisted_current_streak: 1,
                persisted_best_streak: 1,
                persisted_last_active_day: payload.dayKey
            }];
        }
    };
    const store = createSupabaseUserStore({ client, logger: { warn() {} } });

    const result = await store.persistFocusCompletion(user, payload);

    assert.equal(calledFunction, 'record_focus_completion_v2');
    assert.equal(result.duplicate, true);
    assert.equal(result.acceptedMinutes, 20);
    assert.equal(result.focusStats.totalFocusMinutes, 20);
    assert.equal(result.streak.current, 1);
});

test('Supabase focus persistence rejects malformed canonical aggregates', async () => {
    const user = createUser({
        email: 'focus-malformed@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Focus Malformed'
    });
    const payload = applyFocusSession(user, {
        minutes: 5,
        completionId: 'completion_bad_0001'
    });
    const store = createSupabaseUserStore({
        client: {
            async rpc() {
                return [{
                    duplicate: true,
                    accepted_minutes: 5,
                    completion_day: payload.dayKey,
                    persisted_focus_stats: [],
                    persisted_current_streak: 0,
                    persisted_best_streak: 0,
                    persisted_last_active_day: null
                }];
            }
        },
        logger: { warn() {} }
    });

    await assert.rejects(store.persistFocusCompletion(user, payload), /invalid record_focus_completion_v2/i);
});

test('Supabase request deadline covers reading the full response body', async () => {
    const client = createSupabaseClient({
        url: 'http://127.0.0.1:9999',
        serviceKey: 'test-key',
        timeoutMs: 20,
        fetchImpl: /** @type {any} */ (async (_url, options) => ({
            ok: true,
            status: 200,
            text: () => new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
            })
        }))
    });

    await assert.rejects(
        Promise.race([
            client.select('profiles'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('test timeout')), 150))
        ]),
        /body aborted/
    );
});

test('Supabase retries idempotent reads but not non-idempotent inserts', async () => {
    let calls = 0;
    const client = createSupabaseClient({
        url: 'http://127.0.0.1:9999',
        serviceKey: 'test-key',
        timeoutMs: 100,
        fetchImpl: /** @type {any} */ (async () => {
            calls += 1;
            return calls === 1 ? response(503, { error: 'temporary' }) : response(200, []);
        })
    });

    assert.deepEqual(await client.select('profiles'), []);
    assert.equal(calls, 2);

    calls = 0;
    await assert.rejects(client.insert('focus_sessions', [{ user_id: 'u1' }]), /503/);
    assert.equal(calls, 1);
});
