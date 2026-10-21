const crypto = require('node:crypto');
const { requireCondition, lockUser, dayKey } = require('./common');

const HEARTBEAT_GRACE_MS = 45000;
const SESSION_MAX_MS = 240 * 60000;
const XP_DAILY_CAP = 240;

function createProgress(db, now = Date.now) {
    function credit(row, timestamp) {
        const previous = Number(row.last_seen_at);
        const elapsed = timestamp - previous;
        const days = { ...row.daily_ms };
        let accepted = 0;
        if (row.state === 'active' && elapsed > 0 && elapsed <= HEARTBEAT_GRACE_MS) {
            accepted = Math.min(elapsed, Math.max(0, SESSION_MAX_MS - Number(row.credited_ms)));
            let start = previous;
            const end = previous + accepted;
            while (start < end) {
                const day = dayKey(start);
                const boundary = Date.parse(`${day}T00:00:00Z`) - 3 * 3600000 + 86400000;
                const part = Math.min(end, boundary) - start;
                days[day] = (days[day] || 0) + part;
                start += part;
            }
        }
        return { days, creditedMs: Number(row.credited_ms) + accepted };
    }
    async function start(userId) {
        return db.transaction(async (tx) => {
            await lockUser(tx, userId);
            await tx.query(`UPDATE halastudy.focus_sessions SET state='abandoned'
                WHERE user_id=$1 AND state IN ('active','paused') AND last_seen_at<$2`, [userId, now() - 12 * 3600000]);
            const existing = (await tx.query(`SELECT * FROM halastudy.focus_sessions WHERE user_id=$1 AND state IN ('active','paused')`, [userId])).rows[0];
            if (existing) return existing;
            const id = crypto.randomUUID();
            return (await tx.query(`INSERT INTO halastudy.focus_sessions(id,user_id,state,started_at,last_seen_at)
                VALUES($1,$2,'active',$3,$3) RETURNING *`, [id, userId, now()])).rows[0];
        });
    }
    async function update(userId, sessionId, action) {
        requireCondition(['heartbeat', 'pause', 'resume', 'complete'].includes(action), 'ACTION_INVALID');
        return db.transaction(async (tx) => {
            await lockUser(tx, userId);
            const row = (await tx.query('SELECT * FROM halastudy.focus_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [sessionId, userId])).rows[0];
            requireCondition(row, 'SESSION_NOT_FOUND', 404);
            if (row.state === 'completed' && action === 'complete') return row;
            requireCondition(['active', 'paused'].includes(row.state), 'SESSION_CLOSED', 409);
            requireCondition(now() - Number(row.last_seen_at) <= 12 * 3600000, 'SESSION_EXPIRED', 409);
            const { days, creditedMs } = credit(row, now());
            const state = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : action === 'complete' ? 'completed' : row.state;
            let xp = 0;
            if (action === 'complete') {
                for (const [day, milliseconds] of Object.entries(days)) {
                    const used = Number((await tx.query('SELECT COALESCE(SUM(xp),0) AS total FROM halastudy.xp_ledger WHERE user_id=$1 AND day_key=$2', [userId, day])).rows[0].total);
                    const award = Math.min(Math.floor(Number(milliseconds) / 60000), Math.max(0, XP_DAILY_CAP - used));
                    if (!award) continue;
                    await tx.query(`INSERT INTO halastudy.xp_ledger(id,user_id,session_id,day_key,rule_version,xp,created_at)
                        VALUES($1,$2,$3,$4,1,$5,$6) ON CONFLICT(session_id,day_key,rule_version) DO NOTHING`,
                    [crypto.randomUUID(), userId, sessionId, day, award, now()]);
                    xp += award;
                }
                const totalXp = Number((await tx.query('SELECT COALESCE(SUM(xp),0) AS total FROM halastudy.xp_ledger WHERE user_id=$1', [userId])).rows[0].total);
                const earned = [];
                if (totalXp >= 1) earned.push('first_session');
                if (totalXp >= 100) earned.push('focus_100');
                if (totalXp >= 1000) earned.push('focus_1000');
                for (const achievement of earned) {
                    await tx.query(`INSERT INTO halastudy.achievements(user_id,achievement_key,awarded_at)
                        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [userId, achievement, now()]);
                }
            }
            return (await tx.query(`UPDATE halastudy.focus_sessions
                SET state=$3,last_seen_at=$4,credited_ms=$5,daily_ms=$6,xp=$7,completed_at=$8
                WHERE id=$1 AND user_id=$2 RETURNING *`,
            [sessionId, userId, state, now(), creditedMs, JSON.stringify(days), xp, action === 'complete' ? now() : null])).rows[0];
        });
    }
    async function summary(userId, historyDays = 30) {
        const [totals, sessions, achievements, current, days] = await Promise.all([
            db.query(`SELECT COALESCE(SUM(credited_ms),0) AS milliseconds, COUNT(*) AS sessions,
                COALESCE(SUM(xp),0) AS xp FROM halastudy.focus_sessions WHERE user_id=$1 AND state='completed'`, [userId]),
            db.query(`SELECT id,state,started_at,completed_at,credited_ms,xp FROM halastudy.focus_sessions
                WHERE user_id=$1 AND started_at>=$2 ORDER BY started_at DESC LIMIT 100`,
            [userId, now() - historyDays * 86400000]),
            db.query('SELECT achievement_key,awarded_at FROM halastudy.achievements WHERE user_id=$1 ORDER BY awarded_at', [userId]),
            db.query(`SELECT * FROM halastudy.focus_sessions WHERE user_id=$1 AND state IN ('active','paused') AND last_seen_at >= $2`, [userId, now() - 12 * 3600000]),
            db.query('SELECT day_key,SUM(xp) AS xp FROM halastudy.xp_ledger WHERE user_id=$1 AND xp>0 GROUP BY day_key ORDER BY day_key DESC', [userId])
        ]);
        const activeDays = new Set(days.rows.map((row) => row.day_key));
        let cursor = now();
        if (!activeDays.has(dayKey(cursor))) cursor -= 86400000;
        let streak = 0;
        while (activeDays.has(dayKey(cursor))) {
            streak += 1;
            cursor -= 86400000;
        }
        return {
            totals: { minutes: Math.floor(Number(totals.rows[0].milliseconds) / 60000), sessions: Number(totals.rows[0].sessions), xp: Number(totals.rows[0].xp), streak },
            sessions: sessions.rows, achievements: achievements.rows, current: current.rows[0] || null,
            activity: Array.from({ length: 7 }, (_, index) => {
                const day = dayKey(now() - (6 - index) * 86400000);
                return { day, xp: Number(days.rows.find((row) => row.day_key === day)?.xp || 0) };
            }),
            rules: { heartbeatSeconds: 15, interruptionGraceSeconds: 45, dailyXpCap: XP_DAILY_CAP, cameraRequired: false }
        };
    }
    return { start, update, summary };
}

module.exports = { createProgress };
