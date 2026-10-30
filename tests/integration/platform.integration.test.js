const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const OTPAuth = require('otpauth');
const { createDatabase } = require('../../services/platform/database');
const { createEntitlements } = require('../../services/platform/catalog');
const { createBilling } = require('../../services/platform/billing');
const { createProgress } = require('../../services/platform/progress');
const { createAccess } = require('../../services/platform/access');
const { createCohorts } = require('../../services/platform/cohorts');

test('platform transactions enforce subscriptions, scoped supervision, rewards and staff security', { timeout: 120000 }, async (t) => {
    const db = await createDatabase();
    t.after(() => db.close());
    let timestamp = Date.parse('2026-10-20T10:00:00Z');
    const now = () => timestamp;
    const alice = crypto.randomUUID();
    const bob = crypto.randomUUID();
    const eve = crypto.randomUUID();
    for (const [id, name] of [[alice, 'Alice'], [bob, 'Bob'], [eve, 'Eve']]) {
        await db.query('INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)', [id, name, now()]);
    }
    const entitlements = createEntitlements(db, 'test', now);
    const billing = createBilling(db, 'test', now);
    const progress = createProgress(db, now);
    const access = createAccess(db, 'test-only-mfa-encryption-secret', now);
    const cohorts = createCohorts(db, entitlements, now);

    await t.test('one fixed VIP offer; checkout is account bound and completion is idempotent', async () => {
        assert.deepEqual(entitlements.catalog().plans.map((plan) => plan.id), ['free', 'vip']);
        assert.equal(entitlements.catalog().plans[1].amountMinor, 499);
        const checkout = await billing.checkout(alice);
        await assert.rejects(billing.complete(bob, checkout.id, checkout.token, 'success'), /CHECKOUT_NOT_FOUND/);
        await assert.rejects(billing.complete(alice, checkout.id, 'forged', 'success'), /CHECKOUT_NOT_FOUND/);
        const first = await billing.complete(alice, checkout.id, checkout.token, 'success');
        const duplicate = await billing.complete(alice, checkout.id, checkout.token, 'success');
        assert.equal(first.subscriptionId, duplicate.subscriptionId);
        assert.equal((await entitlements.resolve(alice)).plan.id, 'vip');
        assert.equal((await entitlements.resolve(bob)).plan.id, 'free');
        await assert.rejects(billing.checkout(alice), /ALREADY_SUBSCRIBED/);
        await billing.cancel(alice, true);
        assert.equal((await entitlements.resolve(alice)).plan.id, 'vip');
        await billing.cancel(alice, false);
        const declined = await billing.checkout(bob);
        await billing.complete(bob, declined.id, declined.token, 'declined');
        assert.equal((await entitlements.resolve(bob)).plan.id, 'free');
        const liveBilling = createBilling(db, 'live', now);
        await assert.rejects(liveBilling.checkout(bob), /CHECKOUT_UNCONFIGURED/);
    });

    await t.test('private circles require VIP to create; invites and supervision stay scoped', async () => {
        await assert.rejects(cohorts.create(bob, 'Free circle'), /VIP_CIRCLE_LIMIT/);
        const circle = await cohorts.create(alice, 'Quiet circle');
        await assert.rejects(cohorts.members(eve, circle.id), /COHORT_NOT_FOUND/);
        const invitation = await cohorts.invite(alice, circle.id);
        await cohorts.accept(bob, invitation.token);
        assert.deepEqual(await cohorts.accept(bob, invitation.token), { id: circle.id }, 'lost-response retry belongs to the same current member');
        const unused = await cohorts.invite(alice, circle.id);
        await assert.rejects(cohorts.revokeInvites(bob, circle.id), /FORBIDDEN/);
        await cohorts.revokeInvites(alice, circle.id);
        await assert.rejects(cohorts.accept(eve, unused.token), /INVITE_INVALID/);
        await assert.rejects(cohorts.accept(eve, invitation.token), /INVITE_INVALID|INVITE_USED/);
        await assert.rejects(cohorts.setRole(bob, circle.id, bob, 'supervisor'), /FORBIDDEN/);
        await cohorts.setRole(alice, circle.id, bob, 'supervisor');
        assert.equal((await cohorts.membership(bob, circle.id)).canSupervise, true);
        assert.deepEqual(await access.roles(bob), []);
        await cohorts.setRole(alice, circle.id, bob, 'remove');
        await assert.rejects(cohorts.accept(bob, invitation.token), /INVITE_USED/);
        await assert.rejects(cohorts.members(bob, circle.id), /COHORT_NOT_FOUND/);
        const secondCircle = await cohorts.create(alice, 'Second circle');
        await cohorts.create(alice, 'Third circle');
        await assert.rejects(cohorts.create(alice, 'Fourth circle'), /VIP_CIRCLE_LIMIT/);
        await assert.rejects(cohorts.archive(bob, secondCircle.id), /COHORT_NOT_FOUND/);
        await assert.rejects(cohorts.leave(alice, secondCircle.id), /OWNER_PROTECTED/);
        await cohorts.archive(alice, secondCircle.id);
        await assert.rejects(cohorts.members(alice, secondCircle.id), /COHORT_NOT_FOUND/);
        await cohorts.create(alice, 'Replacement circle');
    });

    await t.test('two tabs share one session; forged time, replay and interruptions cannot inflate XP', async () => {
        const [first, second] = await Promise.all([progress.start(alice), progress.start(alice)]);
        assert.equal(first.id, second.id);
        await assert.rejects(progress.update(bob, first.id, 'heartbeat'), /SESSION_NOT_FOUND/);
        timestamp += 15000;
        await progress.update(alice, first.id, 'heartbeat');
        await progress.update(alice, first.id, 'heartbeat');
        timestamp += 15000;
        await progress.update(alice, first.id, 'heartbeat');
        timestamp += 600000;
        await progress.update(alice, first.id, 'heartbeat');
        timestamp += 15000;
        await progress.update(alice, first.id, 'pause');
        timestamp += 600000;
        await progress.update(alice, first.id, 'resume');
        timestamp += 15000;
        const result = await progress.update(alice, first.id, 'complete');
        assert.equal(Number(result.credited_ms), 60000);
        assert.equal(result.xp, 1);
        assert.equal((await progress.update(alice, first.id, 'complete')).xp, 1);
        assert.equal((await progress.summary(alice)).totals.xp, 1);
        assert.equal((await progress.summary(alice)).achievements[0].achievement_key, 'first_session');
    });

    await t.test('MFA codes resist replay and staff privileges require explicit grants', async () => {
        const setup = await access.enroll({ id: alice, email: 'alice@example.invalid' });
        const otp = new OTPAuth.TOTP({ secret: setup.secret, digits: 6, period: 30, algorithm: 'SHA1' });
        const code = otp.generate({ timestamp });
        await assert.rejects(access.verify(alice, 'invalid', 'alice-session', true), /MFA_INVALID/);
        const verified = await access.verify(alice, code, 'alice-session', true);
        assert.equal(verified.recoveryCodes.length, 8);
        assert.equal(await access.verifyStaff(alice, verified.session, 'alice-session'), true);
        assert.equal(await access.verifyStaff(alice, verified.session, 'forged-session'), false);
        await assert.rejects(access.verify(alice, code, 'alice-session'), /MFA_INVALID/);
        await access.bootstrap(alice);
        await assert.rejects(access.bootstrap(eve), /BOOTSTRAP_CLOSED/);
        await assert.rejects(access.assign(eve, eve, 'super_admin'), /FORBIDDEN/);
        await assert.rejects(access.assign(alice, alice, 'super_admin', true), /LAST_SUPER_ADMIN/);
        await assert.rejects(access.assign(alice, bob, 'moderator'), /TARGET_MFA_REQUIRED/);
        const bobSetup = await access.enroll({ id: bob, email: 'bob@example.invalid' });
        const bobCode = new OTPAuth.TOTP({ secret: bobSetup.secret }).generate({ timestamp });
        const bobSession = await access.verify(bob, bobCode, 'bob-session', true);
        await access.assign(alice, bob, 'moderator');
        assert.equal(await access.verifyStaff(bob, bobSession.session, 'bob-session'), false);
        await access.requirePermission(bob, 'cases.manage');
        await assert.rejects(access.requirePermission(bob, 'staff.manage'), /FORBIDDEN/);
        await access.assign(alice, bob, 'moderator', true);
        await assert.rejects(access.requirePermission(bob, 'cases.manage'), /FORBIDDEN/);
        const recovery = verified.recoveryCodes[0];
        await access.verify(alice, recovery, 'alice-session');
        await assert.rejects(access.verify(alice, recovery, 'alice-session'), /MFA_INVALID/);
    });

    await t.test('Riyadh midnight splits rewards correctly and daily/session caps hold', async () => {
        const savedTime = timestamp;
        timestamp = Date.parse('2026-10-20T20:59:00Z');
        const midnight = await progress.start(bob);
        for (let index = 0; index < 4; index++) {
            timestamp += 30000;
            await progress.update(bob, midnight.id, 'heartbeat');
        }
        assert.equal((await progress.update(bob, midnight.id, 'complete')).xp, 2);
        const days = (await db.query('SELECT day_key,xp FROM halastudy.xp_ledger WHERE user_id=$1 ORDER BY day_key', [bob])).rows;
        assert.deepEqual(days, [{ day_key: '2026-10-20', xp: 1 }, { day_key: '2026-10-21', xp: 1 }]);
        const week = (await progress.summary(bob)).activity;
        assert.equal(week.length, 7);
        assert.deepEqual(week.slice(-2), [{ day: '2026-10-20', xp: 1 }, { day: '2026-10-21', xp: 1 }]);
        timestamp = Date.parse('2026-10-22T06:00:00Z');
        const capped = await progress.start(bob);
        for (let index = 0; index < 322; index++) {
            timestamp += 45000;
            await progress.update(bob, capped.id, 'heartbeat');
        }
        const completed = await progress.update(bob, capped.id, 'complete');
        assert.equal(Number(completed.credited_ms), 240 * 60000);
        assert.equal(completed.xp, 240);
        const next = await progress.start(bob);
        timestamp += 30000; await progress.update(bob, next.id, 'heartbeat');
        timestamp += 30000;
        assert.equal((await progress.update(bob, next.id, 'complete')).xp, 0);
        timestamp = savedTime;
    });

    await t.test('abandoned sessions and backward clocks never become reward credit', async () => {
        const savedTime = timestamp;
        const stale = await progress.start(alice);
        timestamp += 13 * 3600000;
        assert.equal((await progress.summary(alice)).current, null);
        await assert.rejects(progress.update(alice, stale.id, 'complete'), /SESSION_EXPIRED/);
        const fresh = await progress.start(alice);
        assert.notEqual(fresh.id, stale.id);
        assert.equal((await db.query('SELECT state FROM halastudy.focus_sessions WHERE id=$1', [stale.id])).rows[0].state, 'abandoned');
        timestamp -= 10000;
        assert.equal(Number((await progress.update(alice, fresh.id, 'heartbeat')).credited_ms), 0);
        assert.equal((await progress.update(alice, fresh.id, 'complete')).xp, 0);
        timestamp = savedTime;
    });

    await t.test('VIP expiry removes benefits without deleting study records', async () => {
        timestamp += 32 * 86400000;
        assert.equal((await entitlements.resolve(alice)).plan.id, 'free');
        assert.equal((await progress.summary(alice)).totals.xp, 1);
        const remainingCircles = await cohorts.list(alice);
        assert.equal(remainingCircles.length, 3);
        await assert.rejects(cohorts.schedule(alice, remainingCircles[0].id, {}), /CIRCLE_VIP_REQUIRED/);
        await assert.rejects(cohorts.invite(alice, remainingCircles[0].id), /VIP_REQUIRED/);
    });
});
