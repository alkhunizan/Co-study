const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createSupabaseUserStore } = require('../../supabase-user-store');
const { applyFocusSession, createUser, createUserStore, sanitizeUser } = require('../../user-store');

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
    const legacyReads = [];
    const user = sanitizeUser(baseRawUser({
        authProvider: 'google',
        googleSub: 'google-subject-1'
    }), {
        onLegacyAuthProvider(provider) {
            legacyReads.push(provider);
        }
    });

    assert.ok(user);
    assert.equal(user.passwordEnabled, false);
    assert.equal(user.passwordHash, null);
    assert.equal(user.googleSub, 'google-subject-1');
    assert.equal(user.authProvider, 'google');
    assert.deepEqual(legacyReads, ['google']);
});

test('Google-only users are valid without a password hash', () => {
    const legacyReads = [];
    const user = sanitizeUser(baseRawUser({
        passwordHash: null,
        passwordEnabled: false,
        authProvider: 'google',
        googleSub: 'google-subject-2'
    }), { onLegacyAuthProvider: () => legacyReads.push('unexpected') });
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
    assert.deepEqual(legacyReads, []);
});

test('Supabase adapter hydrates and writes passwordless Google accounts compatibly', async () => {
    const upserts = [];
    const legacyReads = [];
    const client = {
        async select(table) {
            if (table === 'deletion_tombstones') return [];
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
        logger: { warn() {} },
        onLegacyAuthProvider(provider) {
            legacyReads.push(provider);
        }
    });

    const [user] = await store.hydrate();
    assert.equal(user.passwordEnabled, false);
    assert.equal(user.passwordHash, null);
    assert.equal(user.googleSub, 'google-subject-4');
    assert.deepEqual(legacyReads, ['google']);

    await store.flush(new Map([[user.id, user]]));
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0][0].password_enabled, false);
    assert.equal(upserts[0][0].password_hash, null);
    assert.equal(upserts[0][0].google_sub, 'google-subject-4');
});

test('file persistence remembers every completion id beyond the former retention window', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'co-study-focus-replay-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const filePath = path.join(directory, 'users.json');
    const store = createUserStore({ filePath, logger: { warn() {} } });
    const user = createUser({
        email: 'focus-replay@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Focus Replay'
    });
    const now = Date.parse('2026-07-15T08:00:00.000Z');
    for (let index = 0; index < 1001; index += 1) {
        applyFocusSession(user, {
            minutes: 1,
            completionId: `completion_${String(index).padStart(8, '0')}`,
            now
        });
    }
    await store.flush(new Map([[user.id, user]]));

    const restarted = createUserStore({ filePath, logger: { warn() {} } });
    const [hydrated] = restarted.loadUsers({ strict: true });
    const totalBeforeReplay = hydrated.focusStats.totalFocusMinutes;
    const replay = applyFocusSession(hydrated, {
        minutes: 1,
        completionId: 'completion_00000000',
        now
    });

    assert.equal(hydrated.focusStats.completions.length, 1001);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.acceptedMinutes, 1);
    assert.equal(hydrated.focusStats.totalFocusMinutes, totalBeforeReplay);
});

test('a fully capped focus completion is remembered without advancing the streak', () => {
    const user = createUser({
        email: 'focus-cap@example.com',
        passwordHash: '0123456789abcdef:0123456789abcdef',
        displayName: 'Focus Cap'
    });
    const now = Date.parse('2026-07-15T08:00:00.000Z');
    user.focusStats.days['2026-07-15'] = { focusMinutes: 1440, sessions: 6 };
    user.focusStats.totalFocusMinutes = 1440;
    user.focusStats.totalSessions = 6;
    user.streak = { current: 4, best: 7, lastActiveDay: '2026-07-13' };

    const result = applyFocusSession(user, {
        minutes: 25,
        completionId: 'completion_capped_0001',
        now
    });

    assert.equal(result.acceptedMinutes, 0);
    assert.deepEqual(user.streak, { current: 4, best: 7, lastActiveDay: '2026-07-13' });
    assert.equal(user.focusStats.completions.at(-1).completionId, 'completion_capped_0001');
});
