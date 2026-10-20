const crypto = require('node:crypto');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const { audit, hash, requireCondition, lockUser } = require('./common');

const PERMISSIONS = Object.freeze({
    super_admin: ['staff.read', 'staff.manage', 'operations.read', 'operations.manage', 'backups.manage', 'cases.read', 'cases.manage', 'billing.read', 'audit.read'],
    admin: ['staff.read', 'operations.read', 'operations.manage'],
    moderator: ['cases.read', 'cases.manage'],
    support: ['operations.read'],
    billing_operator: ['billing.read']
});
const STAFF_TTL = 15 * 60 * 1000;

function createAccess(db, secret, now = Date.now) {
    const key = crypto.createHash('sha256').update(`halastudy-mfa:${secret}`).digest();
    function encrypt(value) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
    }
    function decrypt(value) {
        const data = Buffer.from(value, 'base64url');
        const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
        cipher.setAuthTag(data.subarray(12, 28));
        return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString();
    }
    function totp(value, label) {
        return new OTPAuth.TOTP({ issuer: 'Halastudy', label, algorithm: 'SHA1', digits: 6, period: 30, secret: value });
    }
    async function roles(userId, tx = db) {
        const result = await tx.query(`SELECT role FROM halastudy.role_assignments
            WHERE user_id=$1 AND (expires_at IS NULL OR expires_at>$2)`, [userId, now()]);
        return result.rows.map((entry) => entry.role);
    }
    async function permissions(userId, tx = db) {
        return [...new Set((await roles(userId, tx)).flatMap((role) => PERMISSIONS[role] || []))];
    }
    async function requirePermission(userId, permission, tx = db) {
        requireCondition((await permissions(userId, tx)).includes(permission), 'FORBIDDEN', 403);
    }
    async function hasStaff() {
        return (await db.query('SELECT id FROM halastudy.role_assignments LIMIT 1')).rows.length > 0;
    }
    async function enroll(user) {
        const token = new OTPAuth.Secret({ size: 20 }).base32;
        await db.transaction(async (tx) => {
            await lockUser(tx, user.id);
            const existing = (await tx.query('SELECT enabled FROM halastudy.mfa WHERE user_id=$1', [user.id])).rows[0];
            requireCondition(!existing?.enabled, 'MFA_ALREADY_ENABLED', 409);
            await tx.query(`INSERT INTO halastudy.mfa(user_id, encrypted_secret) VALUES($1,$2)
                ON CONFLICT(user_id) DO UPDATE SET encrypted_secret=$2, last_counter=-1`, [user.id, encrypt(token)]);
        });
        const uri = totp(token, user.email).toString();
        return { secret: token, qr: await QRCode.toDataURL(uri, { margin: 2, width: 240 }) };
    }
    async function verify(userId, code, accountSession, activate = false) {
        return db.transaction(async (tx) => {
            await lockUser(tx, userId);
            const row = (await tx.query('SELECT * FROM halastudy.mfa WHERE user_id=$1 FOR UPDATE', [userId])).rows[0];
            requireCondition(row && (row.enabled || activate), 'MFA_SETUP_REQUIRED', 403);
            let recovery = false;
            const recoveryHashes = row.recovery_hashes || [];
            const otp = totp(decrypt(row.encrypted_secret), userId);
            const offset = otp.validate({ token: String(code || ''), timestamp: now(), window: 1 });
            const counter = offset === null ? -1 : Math.floor(now() / 30000) + offset;
            if (counter < 0 && row.enabled && recoveryHashes.includes(hash(code))) recovery = true;
            requireCondition(recovery || counter > Number(row.last_counter), 'MFA_INVALID', 401);
            const recoveryCodes = activate && !row.enabled
                ? Array.from({ length: 8 }, () => crypto.randomBytes(10).toString('hex')) : [];
            const nextHashes = recoveryCodes.length ? recoveryCodes.map(hash)
                : recoveryHashes.filter((value) => !recovery || value !== hash(code));
            await tx.query(`UPDATE halastudy.mfa SET enabled=true, last_counter=$2, recovery_hashes=$3 WHERE user_id=$1`,
                [userId, recovery ? row.last_counter : counter, JSON.stringify(nextHashes)]);
            const session = crypto.randomBytes(32).toString('base64url');
            await tx.query('DELETE FROM halastudy.staff_sessions WHERE user_id=$1 OR expires_at<=$2', [userId, now()]);
            await tx.query(`INSERT INTO halastudy.staff_sessions(token_hash,user_id,account_session_hash,expires_at)
                VALUES($1,$2,$3,$4)`, [hash(session), userId, hash(accountSession), now() + STAFF_TTL]);
            await audit(tx, userId, activate ? 'mfa.enabled' : 'mfa.verified', userId);
            return { session, recoveryCodes, expiresAt: now() + STAFF_TTL };
        });
    }
    async function verifyStaff(userId, session, accountSession) {
        if (!session || !accountSession) return false;
        const result = await db.query(`SELECT user_id FROM halastudy.staff_sessions
            WHERE token_hash=$1 AND user_id=$2 AND account_session_hash=$3 AND expires_at>$4`,
        [hash(session), userId, hash(accountSession), now()]);
        return result.rows.length === 1;
    }
    async function bootstrap(userId) {
        return db.transaction(async (tx) => {
            await tx.query('LOCK TABLE halastudy.role_assignments IN EXCLUSIVE MODE');
            requireCondition(!(await tx.query('SELECT id FROM halastudy.role_assignments LIMIT 1')).rows.length, 'BOOTSTRAP_CLOSED', 409);
            await tx.query(`INSERT INTO halastudy.role_assignments(id,user_id,role,granted_by,created_at)
                VALUES($1,$2,'super_admin',$2,$3)`, [crypto.randomUUID(), userId, now()]);
            await audit(tx, userId, 'staff.bootstrap', userId);
        });
    }
    async function assign(actorId, userId, role, remove = false) {
        requireCondition(Object.hasOwn(PERMISSIONS, role), 'ROLE_INVALID');
        return db.transaction(async (tx) => {
            await tx.query('LOCK TABLE halastudy.role_assignments IN EXCLUSIVE MODE');
            await requirePermission(actorId, 'staff.manage', tx);
            await lockUser(tx, userId);
            if (remove) {
                if (role === 'super_admin') {
                    const count = await tx.query(`SELECT user_id FROM halastudy.role_assignments WHERE role='super_admin' AND user_id<>$1`, [userId]);
                    requireCondition(count.rows.length > 0, 'LAST_SUPER_ADMIN', 409);
                }
                await tx.query('DELETE FROM halastudy.role_assignments WHERE user_id=$1 AND role=$2', [userId, role]);
            } else {
                const mfa = (await tx.query('SELECT enabled FROM halastudy.mfa WHERE user_id=$1', [userId])).rows[0];
                requireCondition(mfa?.enabled, 'TARGET_MFA_REQUIRED', 409);
                await tx.query(`INSERT INTO halastudy.role_assignments(id,user_id,role,granted_by,created_at)
                    VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,role) DO NOTHING`,
                [crypto.randomUUID(), userId, role, actorId, now()]);
            }
            await tx.query('DELETE FROM halastudy.staff_sessions WHERE user_id=$1', [userId]);
            await audit(tx, actorId, remove ? 'staff.revoked' : 'staff.granted', userId, { role });
        });
    }
    return { roles, permissions, requirePermission, hasStaff, enroll, verify, verifyStaff, bootstrap, assign };
}

module.exports = { createAccess };
