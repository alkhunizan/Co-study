const VIP = Object.freeze({
    id: 'vip', version: 1, name: 'VIP', amountMinor: 499, currency: 'USD', interval: 'month',
    features: { 'progress.export': true, 'progress.history_days': 365, 'circles.max_owned': 3, 'circles.max_members': 12 }
});
const FREE = Object.freeze({
    id: 'free', version: 1, name: 'Free', amountMinor: 0, currency: 'USD', interval: null,
    features: { 'progress.export': false, 'progress.history_days': 30, 'circles.max_owned': 0, 'circles.max_members': 12 }
});

function createEntitlements(db, mode, now = Date.now) {
    async function resolve(userId, tx = db) {
        const result = await tx.query(`SELECT * FROM halastudy.subscriptions
            WHERE user_id=$1 AND mode=$2 AND status='active' AND period_end>$3 ORDER BY created_at DESC LIMIT 1`,
        [userId, mode, now()]);
        const subscription = result.rows[0] || null;
        const plan = subscription ? VIP : FREE;
        return { plan, subscription, features: { ...plan.features } };
    }
    return { resolve, catalog: () => ({ plans: [FREE, VIP], mode, checkoutAvailable: mode === 'test' }) };
}

module.exports = { createEntitlements };
