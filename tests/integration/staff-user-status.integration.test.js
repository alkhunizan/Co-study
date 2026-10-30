const assert = require('node:assert/strict');
const test = require('node:test');
const OTPAuth = require('otpauth');
const { startServer } = require('../helpers/server-control');
const { extractCookies } = require('../helpers/auth-helpers');
const { resetStateFile } = require('../helpers/test-env');

const ADMIN_PATH = '/ops-integration-1234';
const ADMIN_PASSWORD = 'test-password-123';
// Same precomputed `npm run admin:hash -- "test-password-123"` as admin.integration.
const ADMIN_PASSWORD_HASH = 'cad5e43589f0e2215e75e00ba86cc550:0914de952c39f2c4ac8f9dc10ab4e10edfa2e1db0523de0afeae4cd7fcd581cac7c9c2e8789c41cfd4ed2e53ea2230c680191057c7d85557ee6aeff9d6fc51dc';

test('staff can only change the status of accounts ranked strictly below them (A-05)', { timeout: 120000 }, async (t) => {
    const server = await startServer({
        env: {
            PLATFORM_ENABLED: 'true', PLATFORM_DATABASE_URL: '', PLATFORM_DATA_DIR: 'memory://', BILLING_MODE: 'test',
            VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true', ADMIN_PATH, ADMIN_PASSWORD_HASH,
            // Six accounts exceed the per-IP signup limit; give each its own client IP.
            TRUST_PROXY: '1'
        }
    });
    t.after(async () => {
        await server.stop();
        resetStateFile(server.roomStateFile);
        resetStateFile(server.userStateFile);
    });
    const request = (cookie, route, method = 'GET', body = undefined) =>
        server.request(`/api/platform${route}`, { method, headers: { Cookie: cookie }, body });
    let clientIp = 10;
    async function signup(name) {
        const credentials = { email: `${name}@staff-rank.test`, password: 'hunter2hunter2', displayName: name };
        clientIp += 1;
        const response = await server.request('/api/auth/signup', {
            method: 'POST', headers: { 'X-Forwarded-For': `198.51.100.${clientIp}` }, body: credentials
        });
        assert.equal(response.status, 200);
        return { user: response.body.user, credentials, cookie: extractCookies(response.headers['set-cookie']) };
    }
    async function staffUser(name) {
        const account = await signup(name);
        const enrolled = await request(account.cookie, '/security/mfa/enroll', 'POST', { password: account.credentials.password });
        assert.equal(enrolled.status, 200);
        const result = { ...account, secret: enrolled.body.secret, accountCookie: account.cookie };
        await stepUp(result, 0, true);
        return result;
    }
    // Granting a role revokes staff sessions, so the actor re-verifies with the
    // next TOTP step (a code from an already used step is rejected as replay).
    async function stepUp(account, step, activate = false) {
        const code = new OTPAuth.TOTP({ secret: account.secret, digits: 6, period: 30, algorithm: 'SHA1' })
            .generate({ timestamp: Date.now() + step * 30000 });
        const verified = await request(account.accountCookie, '/security/mfa/verify', 'POST', { code, activate });
        assert.equal(verified.status, 200);
        const staffCookie = [].concat(verified.headers['set-cookie']).map((value) => value.split(';')[0]).find((value) => value.startsWith('coStudyStaff='));
        account.cookie = `${account.accountCookie}; ${staffCookie}`;
    }
    const owner = await staffUser('owner');
    const moderator = await staffUser('moderator');
    const peer = await staffUser('peer');
    const admin = await staffUser('admin');
    const billing = await staffUser('billing');
    const student = await signup('student');
    assert.equal((await request(owner.cookie, '/staff/bootstrap', 'POST', { password: ADMIN_PASSWORD })).status, 200);
    for (const { target, role } of [
        { target: moderator, role: 'moderator' }, { target: peer, role: 'moderator' },
        { target: admin, role: 'admin' }, { target: billing, role: 'billing_operator' }
    ]) {
        assert.equal((await request(owner.cookie, '/staff/roles', 'POST', { userId: target.user.id, role })).status, 200);
    }
    await stepUp(moderator, 1);
    const ban = (actor, target) => request(actor.cookie, `/staff/users/${target.user.id}/status`, 'POST', { banned: true, reason: 'rank test' });

    for (const target of [admin, billing, peer]) {
        const denied = await ban(moderator, target);
        assert.equal(denied.status, 403, `moderator must not ban ${target.credentials.displayName}`);
        assert.equal(denied.body.errorCode, 'ROLE_PROTECTED');
        assert.equal((await request(target.cookie, '/me')).status, 200, 'protected staff session stays valid');
    }
    const superDenied = await ban(moderator, owner);
    assert.equal(superDenied.status, 403);
    assert.equal(superDenied.body.errorCode, 'SUPER_ADMIN_PROTECTED');
    assert.equal((await ban(moderator, student)).status, 200);
    assert.equal((await ban(owner, admin)).status, 200);
});
