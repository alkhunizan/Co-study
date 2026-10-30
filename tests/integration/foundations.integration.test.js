const assert = require('node:assert/strict');
const test = require('node:test');
const { createUser, applyFocusSession, sanitizeUser } = require('../../user-store');
const { issueReauth, verifyReauth } = require('../../services/auth/reauth');


function syntheticUser() {
    return createUser({ email: 'foundation@example.invalid', passwordHash: 'test:hash', displayName: 'Foundation' });
}

test('daily caps and archived lifetime totals remain identical after reload', () => {
    const user = syntheticUser();
    const now = Date.parse('2026-10-20T09:00:00Z');
    for (let index = 0; index < 7; index += 1) applyFocusSession(user, { minutes: 240, now, completionId: `completion-cap-${index}` });
    assert.equal(user.focusStats.totalFocusMinutes, 1440);
    assert.equal(user.focusStats.totalSessions, 6);
    assert.deepEqual(sanitizeUser(user).focusStats, user.focusStats);
    for (let day = 1; day <= 371; day += 1) {
        applyFocusSession(user, { minutes: 25, now: now + day * 86400000, completionId: `completion-day-${day}` });
    }
    assert.equal(Object.keys(user.focusStats.days).length, 370);
    assert.equal(user.focusStats.totalFocusMinutes, 1440 + 371 * 25);
    assert.deepEqual(sanitizeUser(user).focusStats, user.focusStats);
});

test('both identity fields survive shared persistence sanitization', () => {
    const user = syntheticUser();
    // A Google-only account: no password method, provider identity attached.
    user.authProvider = 'google';
    user.passwordEnabled = false;
    user.googleSub = 'test-subject';
    const loaded = sanitizeUser(user);
    assert.equal(loaded.authProvider, 'google');
    assert.equal(loaded.googleSub, 'test-subject');
});


test('provider deletion proof is purpose, account, epoch, session and time bound', () => {
    const user = syntheticUser();
    const token = issueReauth(user, 'session-a', 'test-secret', 1000);
    assert.equal(verifyReauth(token, user, 'session-a', 'test-secret', 2000), true);
    assert.equal(verifyReauth(token, user, 'session-b', 'test-secret', 2000), false);
    assert.equal(verifyReauth(token, { ...user, tokenEpoch: 2 }, 'session-a', 'test-secret', 2000), false);
    assert.equal(verifyReauth(token, user, 'session-a', 'test-secret', 400000), false);
    assert.equal(verifyReauth(`${token}x`, user, 'session-a', 'test-secret', 2000), false);
});

