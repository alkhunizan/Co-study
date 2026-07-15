const assert = require('node:assert/strict');
const test = require('node:test');

const { createSupabaseClient } = require('../../services/supabase/client');
const { createSupabaseUserStore } = require('../../supabase-user-store');
const { createUser } = require('../../user-store');

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
        async select(_table, query) {
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
