const crypto = require('node:crypto');

function failure(code, status = 400) {
    return Object.assign(new Error(code), { errorCode: code, status });
}

function requireCondition(condition, code, status = 400) {
    if (!condition) throw failure(code, status);
}

function hash(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function dayKey(now) {
    return new Date(now + 3 * 3600000).toISOString().slice(0, 10);
}

async function audit(tx, actorId, action, resourceId, detail = {}, now = Date.now()) {
    await tx.query(`INSERT INTO halastudy.audit_events(id, actor_id, action, resource_id, outcome, detail, created_at)
        VALUES($1,$2,$3,$4,'success',$5,$6)`,
    [crypto.randomUUID(), actorId, action, resourceId, JSON.stringify(detail), now]);
}

async function lockUser(tx, userId) {
    const result = await tx.query('SELECT id FROM halastudy.users WHERE id=$1 FOR UPDATE', [userId]);
    requireCondition(result.rows.length === 1, 'AUTH_REQUIRED', 401);
}

module.exports = { requireCondition, hash, dayKey, audit, lockUser };
