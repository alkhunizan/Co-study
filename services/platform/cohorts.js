const crypto = require('node:crypto');
const { sanitizeUserText } = require('../auth');
const { requireCondition, audit, hash, lockUser } = require('./common');

function createCohorts(db, entitlements, now = Date.now) {
    async function membership(userId, cohortId, tx = db) {
        const row = (await tx.query(`SELECT c.*, m.role AS member_role FROM halastudy.cohorts c
            LEFT JOIN halastudy.cohort_members m ON m.cohort_id=c.id AND m.user_id=$1
            WHERE c.id=$2 AND c.archived=false`, [userId, cohortId])).rows[0];
        requireCondition(row && (row.owner_id === userId || row.member_role), 'COHORT_NOT_FOUND', 404);
        return { ...row, canManage: row.owner_id === userId, canSupervise: row.owner_id === userId || row.member_role === 'supervisor' };
    }
    async function list(userId) {
        return (await db.query(`SELECT c.*, m.role AS member_role,
            (SELECT COUNT(*) FROM halastudy.cohort_members cm WHERE cm.cohort_id=c.id) AS member_count
            FROM halastudy.cohorts c LEFT JOIN halastudy.cohort_members m ON m.cohort_id=c.id AND m.user_id=$1
            WHERE c.archived=false AND (c.owner_id=$1 OR m.user_id=$1) ORDER BY c.created_at DESC`, [userId])).rows;
    }
    async function create(userId, name) {
        const cleanName = sanitizeUserText(name, 60);
        requireCondition(cleanName.length >= 2, 'NAME_REQUIRED');
        return db.transaction(async (tx) => {
            await lockUser(tx, userId);
            const { features } = await entitlements.resolve(userId, tx);
            const count = Number((await tx.query('SELECT COUNT(*) AS count FROM halastudy.cohorts WHERE owner_id=$1 AND archived=false', [userId])).rows[0].count);
            requireCondition(count < features['circles.max_owned'], 'VIP_CIRCLE_LIMIT', 403);
            const id = crypto.randomUUID();
            await tx.query('INSERT INTO halastudy.cohorts(id,name,owner_id,created_at) VALUES($1,$2,$3,$4)', [id, cleanName, userId, now()]);
            await tx.query(`INSERT INTO halastudy.cohort_members(cohort_id,user_id,role,joined_at) VALUES($1,$2,'member',$3)`, [id, userId, now()]);
            await audit(tx, userId, 'cohort.created', id);
            return { id, name: cleanName };
        });
    }
    async function invite(userId, cohortId) {
        return db.transaction(async (tx) => {
            await tx.query('SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE', [cohortId]);
            const cohort = await membership(userId, cohortId, tx);
            requireCondition(cohort.canManage, 'FORBIDDEN', 403);
            const { plan } = await entitlements.resolve(userId, tx);
            requireCondition(plan.id === 'vip', 'VIP_REQUIRED', 403);
            const token = crypto.randomBytes(24).toString('base64url');
            await tx.query(`INSERT INTO halastudy.invitations(token_hash,cohort_id,created_by,expires_at)
                VALUES($1,$2,$3,$4)`, [hash(token), cohortId, userId, now() + 48 * 3600000]);
            await audit(tx, userId, 'cohort.invited', cohortId);
            return { token, expiresAt: now() + 48 * 3600000 };
        });
    }
    async function accept(userId, token) {
        return db.transaction(async (tx) => {
            const invitation = (await tx.query('SELECT * FROM halastudy.invitations WHERE token_hash=$1', [hash(token)])).rows[0];
            requireCondition(invitation && !invitation.accepted_at && Number(invitation.expires_at) > now(), 'INVITE_INVALID', 404);
            const cohort = (await tx.query('SELECT * FROM halastudy.cohorts WHERE id=$1 AND archived=false FOR UPDATE', [invitation.cohort_id])).rows[0];
            requireCondition(cohort, 'COHORT_NOT_FOUND', 404);
            const currentInvite = (await tx.query('SELECT accepted_at FROM halastudy.invitations WHERE token_hash=$1 FOR UPDATE', [hash(token)])).rows[0];
            requireCondition(!currentInvite.accepted_at, 'INVITE_USED', 409);
            const { features, plan } = await entitlements.resolve(cohort.owner_id, tx);
            requireCondition(plan.id === 'vip', 'INVITE_UNAVAILABLE', 409);
            const existing = await tx.query('SELECT user_id FROM halastudy.cohort_members WHERE cohort_id=$1 AND user_id=$2', [cohort.id, userId]);
            if (!existing.rows.length) {
                const count = Number((await tx.query('SELECT COUNT(*) AS count FROM halastudy.cohort_members WHERE cohort_id=$1', [cohort.id])).rows[0].count);
                requireCondition(count < features['circles.max_members'], 'COHORT_FULL', 409);
                await tx.query(`INSERT INTO halastudy.cohort_members(cohort_id,user_id,role,joined_at) VALUES($1,$2,'member',$3)`, [cohort.id, userId, now()]);
            }
            await tx.query('UPDATE halastudy.invitations SET accepted_by=$2,accepted_at=$3 WHERE token_hash=$1', [hash(token), userId, now()]);
            await audit(tx, userId, 'cohort.joined', cohort.id);
            return { id: cohort.id };
        });
    }
    async function members(userId, cohortId) {
        await membership(userId, cohortId);
        return (await db.query(`SELECT m.user_id,m.role,u.display_name FROM halastudy.cohort_members m
            JOIN halastudy.users u ON u.id=m.user_id WHERE m.cohort_id=$1 ORDER BY m.joined_at`, [cohortId])).rows;
    }
    async function setRole(actorId, cohortId, userId, role) {
        requireCondition(['member', 'supervisor', 'remove'].includes(role), 'ROLE_INVALID');
        return db.transaction(async (tx) => {
            await tx.query('SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE', [cohortId]);
            const cohort = await membership(actorId, cohortId, tx);
            requireCondition(cohort.canManage, 'FORBIDDEN', 403);
            requireCondition(userId !== cohort.owner_id, 'OWNER_PROTECTED', 409);
            if (role === 'supervisor') {
                requireCondition((await entitlements.resolve(cohort.owner_id, tx)).plan.id === 'vip', 'CIRCLE_VIP_REQUIRED', 403);
            }
            const result = role === 'remove'
                ? await tx.query('DELETE FROM halastudy.cohort_members WHERE cohort_id=$1 AND user_id=$2 RETURNING user_id', [cohortId, userId])
                : await tx.query('UPDATE halastudy.cohort_members SET role=$3 WHERE cohort_id=$1 AND user_id=$2 RETURNING user_id', [cohortId, userId, role]);
            requireCondition(result.rows.length === 1, 'MEMBER_NOT_FOUND', 404);
            await audit(tx, actorId, 'cohort.member.updated', cohortId, { userId, role });
        });
    }
    async function schedule(userId, cohortId, input) {
        return db.transaction(async (tx) => {
            await tx.query('SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE', [cohortId]);
            const cohort = await membership(userId, cohortId, tx);
            requireCondition(cohort.canSupervise, 'FORBIDDEN', 403);
            requireCondition((await entitlements.resolve(cohort.owner_id, tx)).plan.id === 'vip', 'CIRCLE_VIP_REQUIRED', 403);
            const room = (await tx.query('SELECT * FROM halastudy.rooms WHERE id=$1 FOR UPDATE', [input.roomId])).rows[0];
            requireCondition(room && (room.owner_id === userId || room.cohort_id === cohortId), 'ROOM_NOT_OWNED', 403);
            requireCondition(!room.cohort_id || room.cohort_id === cohortId, 'ROOM_SCOPE_CONFLICT', 409);
            const title = sanitizeUserText(input.title, 80);
            const startsAt = Number(input.startsAt);
            const duration = Number(input.durationMinutes);
            requireCondition(title && startsAt > now() && startsAt < now() + 366 * 86400000, 'SCHEDULE_INVALID');
            requireCondition(Number.isInteger(duration) && duration >= 5 && duration <= 240, 'DURATION_INVALID');
            await tx.query('UPDATE halastudy.rooms SET cohort_id=$2 WHERE id=$1', [input.roomId, cohortId]);
            const id = crypto.randomUUID();
            await tx.query(`INSERT INTO halastudy.scheduled_sessions(id,cohort_id,room_id,title,starts_at,duration_minutes,created_by)
                VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, cohortId, input.roomId, title, startsAt, duration, userId]);
            await audit(tx, userId, 'cohort.session.created', id);
            return { id };
        });
    }
    async function sessions(userId, cohortId) {
        await membership(userId, cohortId);
        return (await db.query('SELECT * FROM halastudy.scheduled_sessions WHERE cohort_id=$1 ORDER BY starts_at DESC LIMIT 100', [cohortId])).rows;
    }
    async function archive(userId, cohortId) {
        await db.transaction(async (tx) => {
            await tx.query('SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE', [cohortId]);
            const cohort = await membership(userId, cohortId, tx);
            requireCondition(cohort.canManage, 'FORBIDDEN', 403);
            await tx.query('UPDATE halastudy.cohorts SET archived=true WHERE id=$1', [cohortId]);
            await tx.query('DELETE FROM halastudy.invitations WHERE cohort_id=$1', [cohortId]);
            await audit(tx, userId, 'cohort.archived', cohortId);
        });
    }
    async function leave(userId, cohortId) {
        await db.transaction(async (tx) => {
            await tx.query('SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE', [cohortId]);
            const cohort = await membership(userId, cohortId, tx);
            requireCondition(!cohort.canManage, 'OWNER_PROTECTED', 409);
            await tx.query('DELETE FROM halastudy.cohort_members WHERE cohort_id=$1 AND user_id=$2', [cohortId, userId]);
            await audit(tx, userId, 'cohort.left', cohortId);
        });
    }
    async function cancelSession(userId, cohortId, sessionId) {
        await db.transaction(async (tx) => {
            await tx.query('SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE', [cohortId]);
            const cohort = await membership(userId, cohortId, tx);
            requireCondition(cohort.canSupervise, 'FORBIDDEN', 403);
            const result = await tx.query('DELETE FROM halastudy.scheduled_sessions WHERE id=$1 AND cohort_id=$2 AND starts_at>$3 RETURNING id', [sessionId, cohortId, now()]);
            requireCondition(result.rows.length, 'SESSION_NOT_CANCELABLE', 409);
            await audit(tx, userId, 'cohort.session.canceled', sessionId);
        });
    }
    async function attendance(userId, cohortId, sessionId) {
        const cohort = await membership(userId, cohortId);
        const session = (await db.query('SELECT * FROM halastudy.scheduled_sessions WHERE id=$1 AND cohort_id=$2', [sessionId, cohortId])).rows[0];
        requireCondition(session, 'SESSION_NOT_FOUND', 404);
        return (await db.query(`SELECT m.user_id,u.display_name,a.first_joined_at,a.last_seen_at,
            CASE WHEN a.first_joined_at IS NULL AND $6::bigint < $3::bigint THEN 'upcoming'
            WHEN a.first_joined_at IS NULL THEN 'absent'
            WHEN a.first_joined_at <= $3::bigint+300000 THEN 'on_time' ELSE 'late' END AS status
            FROM halastudy.cohort_members m JOIN halastudy.users u ON u.id=m.user_id
            LEFT JOIN halastudy.attendance a ON a.user_id=m.user_id AND a.session_id=$2
            WHERE m.cohort_id=$1 AND ($4::boolean OR m.user_id=$5)`,
        [cohortId, sessionId, session.starts_at, cohort.canSupervise, userId, now()])).rows;
    }
    return { membership, list, create, invite, accept, members, setRole, schedule, sessions, attendance, archive, leave, cancelSession };
}

module.exports = { createCohorts };
