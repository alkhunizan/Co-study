const assert = require('node:assert/strict');
const test = require('node:test');

const { createSupabaseUserStore } = require('../../supabase-user-store');
const { createUser, sanitizeUser } = require('../../user-store');

function baseRawUser(overrides = {}) {
    return {
        id: 'user-1',
        email: 'student@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Student',
        ...overrides
    };
}

test('legacy password users default to an enabled password method', () => {
    const user = sanitizeUser(baseRawUser());

    assert.ok(user);
    assert.equal(user.passwordEnabled, true);
    assert.equal(user.passwordHash, '0123456789abcdef:0123456789abcdef');
    assert.equal(user.googleSub, null);
});

test('legacy Google-only users discard synthetic passwords during sanitization', () => {
    const user = sanitizeUser(baseRawUser({
        authProvider: 'google',
        googleSub: 'google-subject-1'
    }));

    assert.ok(user);
    assert.equal(user.passwordEnabled, false);
    assert.equal(user.passwordHash, null);
    assert.equal(user.googleSub, 'google-subject-1');
    assert.equal(user.authProvider, 'google');
});

test('Google-only users are valid without a password hash', () => {
    const user = sanitizeUser(baseRawUser({
        passwordHash: null,
        passwordEnabled: false,
        authProvider: 'google',
        googleSub: 'google-subject-2'
    }));
    const created = createUser({
        email: 'created@example.com',
        passwordHash: null,
        passwordEnabled: false,
        googleSub: 'google-subject-3',
        displayName: 'Created'
    });

    assert.ok(user);
    assert.equal(user.passwordHash, null);
    assert.equal(created.passwordHash, null);
    assert.equal(created.passwordEnabled, false);
    assert.equal(created.googleSub, 'google-subject-3');
});

test('Supabase adapter hydrates and writes passwordless Google accounts compatibly', async () => {
    const upserts = [];
    const client = {
        async select() {
            return [{
                id: 'google-user',
                email: 'google@example.com',
                password_hash: 'legacy-salt:legacy-synthetic-key',
                display_name: 'Google User',
                auth_provider: 'google',
                google_sub: 'google-subject-4',
                created_at: '2026-07-15T00:00:00.000Z'
            }];
        },
        async upsert(_table, rows) {
            upserts.push(rows);
        },
        async remove() {}
    };
    const store = createSupabaseUserStore({
        client,
        logger: { warn() {} }
    });

    const [user] = await store.hydrate();
    assert.equal(user.passwordEnabled, false);
    assert.equal(user.passwordHash, null);
    assert.equal(user.googleSub, 'google-subject-4');

    await store.flush(new Map([[user.id, user]]));
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0][0].password_enabled, false);
    assert.equal(upserts[0][0].password_hash, null);
    assert.equal(upserts[0][0].google_sub, 'google-subject-4');
});
