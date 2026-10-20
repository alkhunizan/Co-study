const path = require('node:path');
const crypto = require('node:crypto');
const { createDatabase } = require('./database');
const { createEntitlements } = require('./catalog');
const { createAccess } = require('./access');
const { createBilling } = require('./billing');
const { createProgress } = require('./progress');
const { createCohorts } = require('./cohorts');
const { requireCondition, audit } = require('./common');

/** @param {{userStateFile: string, secret: string, env?: any, logger?: any}} options */
function createPlatform({ userStateFile, secret, env = process.env, logger = console }) {
    const enabled = env.PLATFORM_ENABLED !== 'false' && (env.NODE_ENV !== 'test' || env.PLATFORM_ENABLED === 'true');
    const mode = env.NODE_ENV === 'production' ? 'live' : env.BILLING_MODE === 'disabled' ? 'disabled' : 'test';
    const platform = { enabled, ready: null, db: null, access: null, entitlements: null, billing: null, progress: null, cohorts: null, mode };
    platform.ready = enabled ? (async () => {
        platform.db = await createDatabase({
            url: env.PLATFORM_DATABASE_URL || '',
            directory: env.PLATFORM_DATA_DIR || path.join(path.dirname(userStateFile), `${path.basename(userStateFile)}.platform`)
        });
        platform.access = createAccess(platform.db, secret);
        platform.entitlements = createEntitlements(platform.db, mode);
        platform.billing = createBilling(platform.db, mode);
        platform.progress = createProgress(platform.db);
        platform.cohorts = createCohorts(platform.db, platform.entitlements);
    })() : Promise.resolve();
    void platform.ready.catch(() => logger.error({ event: 'platform_start_failed' }));

    async function ensureUser(user) {
        if (!enabled || !user) return;
        await platform.ready;
        await platform.db.query(`INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)
            ON CONFLICT(id) DO UPDATE SET display_name=$2 WHERE halastudy.users.display_name IS DISTINCT FROM $2`,
        [user.id, user.displayName, user.createdAt]);
    }
    async function registerRoom(roomId, owner) {
        if (!enabled) return;
        await platform.ready;
        await ensureUser(owner);
        await platform.db.query(`INSERT INTO halastudy.rooms(id,owner_id,created_at) VALUES($1,$2,$3)`,
            [roomId, owner?.id || null, Date.now()]);
    }
    async function canJoin(roomId, user) {
        if (!enabled) return true;
        await platform.ready;
        const room = (await platform.db.query('SELECT cohort_id FROM halastudy.rooms WHERE id=$1', [roomId])).rows[0];
        if (!room?.cohort_id) return true;
        if (!user) return false;
        try {
            await platform.cohorts.membership(user.id, room.cohort_id);
            return true;
        } catch {
            return false;
        }
    }
    async function recordAttendance(roomId, user) {
        if (!enabled || !user) return;
        await platform.ready;
        const timestamp = Date.now();
        await platform.db.query(`INSERT INTO halastudy.attendance(session_id,user_id,first_joined_at,last_seen_at)
            SELECT s.id,$2,$3,$3 FROM halastudy.scheduled_sessions s
            JOIN halastudy.cohort_members m ON m.cohort_id=s.cohort_id AND m.user_id=$2
            JOIN halastudy.cohorts c ON c.id=s.cohort_id AND c.archived=false
            WHERE s.room_id=$1 AND s.starts_at<=$3::bigint+900000
                AND s.starts_at+s.duration_minutes::bigint*60000>=$3
            ON CONFLICT(session_id,user_id) DO UPDATE SET last_seen_at=$3`, [roomId, user.id, timestamp]);
    }
    async function recordCase(roomId, report, reporterId, targetId) {
        if (!enabled) return;
        await platform.ready;
        await platform.db.query(`INSERT INTO halastudy.cases(id,room_id,reporter_id,target_id,reason,detail,status,created_at)
            VALUES($1,$2,$3,$4,$5,$6,'open',$7) ON CONFLICT DO NOTHING`,
        [report.id, roomId, reporterId || null, targetId || null, report.reason, report.detail || '', report.createdAt]);
    }
    async function purgeUser(tx, userId) {
            await tx.query('LOCK TABLE halastudy.role_assignments IN EXCLUSIVE MODE');
            const roles = await platform.access.roles(userId, tx);
            if (roles.includes('super_admin')) {
                const others = await tx.query(`SELECT id FROM halastudy.role_assignments WHERE role='super_admin' AND user_id<>$1`, [userId]);
                requireCondition(others.rows.length > 0, 'LAST_SUPER_ADMIN', 409);
            }
            // Keep shared history and private room scope, but retire circles
            // whose only manager is being deleted. Do this in the same commit.
            await tx.query('UPDATE halastudy.cohorts SET archived=true WHERE owner_id=$1', [userId]);
            await tx.query(`DELETE FROM halastudy.invitations WHERE cohort_id IN
                (SELECT id FROM halastudy.cohorts WHERE owner_id=$1)`, [userId]);
            await tx.query(`UPDATE halastudy.cases SET detail='[account deleted]' WHERE reporter_id=$1 OR target_id=$1`, [userId]);
            await tx.query('UPDATE halastudy.audit_events SET actor_id=NULL, detail=$2 WHERE actor_id=$1', [userId, '{}']);
            await tx.query('DELETE FROM halastudy.users WHERE id=$1', [userId]);
            await audit(tx, null, 'account.deleted', crypto.randomUUID());
    }
    async function removeUser(userId) {
        if (!enabled) return;
        await platform.ready;
        await platform.db.transaction((tx) => purgeUser(tx, userId));
    }
    return Object.assign(platform, { ensureUser, registerRoom, canJoin, recordAttendance, recordCase, removeUser, purgeUser });
}

module.exports = { createPlatform };
