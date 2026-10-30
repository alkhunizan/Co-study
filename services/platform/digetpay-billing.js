const crypto = require('node:crypto');
const { audit, hash, requireCondition, lockUser } = require('./common');
const { nextMonth } = require('./billing');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMBIGUOUS_CREATE_TTL = 10 * 60000;
const EXPIRED_RECHECK_WINDOW = 24 * 3600000;

function createDigetPayBilling(db, client, now = Date.now, logger = console) {
    let timer;
    let draining = null;
    let stopped = false;
    const inFlight = new Map();
    const describe = () => ({
        provider: 'digetpay', environment: 'sandbox', checkoutAvailable: client.enabled,
        automaticRenewal: false
    });
    function present(order) {
        return {
            id: order.id, status: order.status, provider: 'digetpay', mode: 'test',
            amountMinor: order.amount_minor, currency: order.currency, interval: 'month',
            ...(order.status === 'pending' && Number(order.expires_at) > now() ? { redirectUrl: order.redirect_url } : {})
        };
    }
    async function checkout(userId, customer) {
        requireCondition(client.enabled, 'CHECKOUT_UNCONFIGURED', 503);
        requireCondition(typeof customer?.phone === 'string'
            && /^(?:0?5\d{8}|\+9665\d{8}|9665\d{8})$/.test(customer.phone), 'PAYMENT_PHONE_INVALID');
        const intent = await db.transaction(async (tx) => {
            await lockUser(tx, userId);
            await tx.query(`UPDATE halastudy.subscriptions SET status='expired'
                WHERE user_id=$1 AND mode='test' AND period_end<=$2 AND status IN ('active','past_due','pending')`, [userId, now()]);
            requireCondition(!(await tx.query(`SELECT id FROM halastudy.subscriptions WHERE user_id=$1
                AND mode='test' AND status IN ('active','past_due','pending')`, [userId])).rows.length, 'ALREADY_SUBSCRIBED', 409);
            // A known session expires at its deadline. An ambiguous create
            // ('creating' after a crash, 'unknown' after a failed/invalid
            // response) never handed the customer a payment URL, so after a
            // short window it cannot be paid and must not block the account.
            // The drain keeps re-checking any stored session after expiry.
            await tx.query(`UPDATE halastudy.digetpay_orders SET status='expired',
                last_error=CASE WHEN status='pending' THEN last_error ELSE COALESCE(last_error,'PAYMENT_CREATE_ABANDONED') END
                WHERE user_id=$1 AND ((status='pending' AND expires_at<=$2)
                    OR (status IN ('creating','unknown') AND created_at<=$3))`, [userId, now(), now() - AMBIGUOUS_CREATE_TTL]);
            const existing = (await tx.query(`SELECT * FROM halastudy.digetpay_orders
                WHERE user_id=$1 AND status IN ('creating','pending','unknown','review')
                ORDER BY CASE WHEN status IN ('unknown','review') THEN 0 ELSE 1 END,created_at`, [userId])).rows[0];
            if (existing) {
                requireCondition(existing.status === 'pending', 'PAYMENT_REVIEW_REQUIRED', 409);
                return { order: existing, created: false };
            }
            const order = {
                id: crypto.randomUUID(), user_id: userId, amount_minor: 499, currency: 'USD',
                created_at: now(), expires_at: now() + 48 * 3600000
            };
            await tx.query(`INSERT INTO halastudy.digetpay_orders
                (id,user_id,mode,status,amount_minor,currency,created_at,expires_at,next_check_at)
                VALUES($1,$2,'test','creating',499,'USD',$3,$4,$3)`,
            [order.id, userId, order.created_at, order.expires_at]);
            await audit(tx, userId, 'checkout.digetpay.created', order.id);
            return { order, created: true };
        });
        if (!intent.created) return present(intent.order);
        try {
            const result = await client.create(intent.order, customer);
            const saved = await db.query(`UPDATE halastudy.digetpay_orders
                SET session_id=$2,redirect_url=$3,status='pending',next_check_at=$4 WHERE id=$1 AND status='creating' RETURNING *`,
            [intent.order.id, result.sessionId, result.redirectUrl, now() + 30000]);
            requireCondition(saved.rows.length === 1, 'PAYMENT_REVIEW_REQUIRED', 409);
            return present(saved.rows[0]);
        } catch (error) {
            // Keep a provider-issued session id (e.g. untrusted redirect) so the
            // drain and staff recheck can verify it instead of failing forever.
            const sessionId = UUID.test(error.providerSessionId || '') ? error.providerSessionId : null;
            await db.query(`UPDATE halastudy.digetpay_orders SET status='unknown',last_error=$2,
                session_id=COALESCE(session_id,$3),next_check_at=$4 WHERE id=$1 AND status='creating'`,
            [intent.order.id, error.errorCode || 'PAYMENT_PROVIDER_UNAVAILABLE', sessionId, now() + 30000]);
            // No automatic POST retry: the provider may already have created it.
            requireCondition(false, 'PAYMENT_REVIEW_REQUIRED', 409);
        }
    }
    async function reconcile(orderId, transactionHint = null, allowReviewActivation = false) {
        requireCondition(client.enabled, 'CHECKOUT_UNCONFIGURED', 503);
        if (inFlight.has(orderId)) return inFlight.get(orderId);
        const operation = (async () => {
            const order = (await db.query('SELECT * FROM halastudy.digetpay_orders WHERE id=$1', [orderId])).rows[0];
            requireCondition(order, 'CHECKOUT_NOT_FOUND', 404);
            if (order.status === 'refunded') return present(order);
            const verified = await client.status({
                ...order, transaction_id: order.transaction_id || (client.lookup === 'transaction' ? transactionHint : null)
            });
            return db.transaction(async (tx) => {
                await lockUser(tx, order.user_id);
                const current = (await tx.query('SELECT * FROM halastudy.digetpay_orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
                requireCondition(current, 'CHECKOUT_NOT_FOUND', 404);
                if (current.status === 'refunded') return present(current);
                requireCondition(!current.transaction_id || current.transaction_id === verified.transactionId, 'PAYMENT_MISMATCH', 409);
                const used = await tx.query('SELECT id FROM halastudy.digetpay_orders WHERE transaction_id=$1 AND id<>$2',
                    [verified.transactionId, orderId]);
                requireCondition(!used.rows.length, 'PAYMENT_MISMATCH', 409);
                // A declined attempt may be retried in the same checkout and
                // receive a new transaction ID. Bind only approved/refunded money.
                await tx.query(`UPDATE halastudy.digetpay_orders SET transaction_id=$2,checked_at=$3,
                    next_check_at=$4,last_error=NULL WHERE id=$1`,
                [orderId, verified.approved || verified.refunded ? verified.transactionId : current.transaction_id, now(), now() + 300000]);
                if (verified.refunded) {
                    if (current.subscription_id) await tx.query(`UPDATE halastudy.subscriptions
                        SET status='canceled' WHERE id=$1 AND provider='digetpay'`, [current.subscription_id]);
                    await tx.query(`UPDATE halastudy.digetpay_orders SET status='refunded' WHERE id=$1`, [orderId]);
                    await audit(tx, current.user_id, 'payment.digetpay.refunded', orderId);
                    return { ...present(current), status: 'refunded', redirectUrl: undefined };
                }
                if (!verified.approved || current.status === 'completed') return present(current);
                if (current.status === 'review' && !allowReviewActivation) return present(current);
                await tx.query(`UPDATE halastudy.subscriptions SET status='expired' WHERE user_id=$1 AND mode='test'
                    AND period_end<=$2 AND status IN ('active','past_due','pending')`, [current.user_id, now()]);
                const active = await tx.query(`SELECT id FROM halastudy.subscriptions WHERE user_id=$1 AND mode='test'
                    AND status IN ('active','past_due','pending')`, [current.user_id]);
                if (active.rows.length) {
                    // Never silently discard or double-grant a late payment.
                    await tx.query(`UPDATE halastudy.digetpay_orders SET status='review',last_error='PAYMENT_OVERLAP' WHERE id=$1`, [orderId]);
                    return { ...present(current), status: 'review', redirectUrl: undefined };
                }
                const subscriptionId = crypto.randomUUID();
                await tx.query(`INSERT INTO halastudy.subscriptions
                    (id,user_id,plan,mode,provider,provider_reference,status,amount_minor,currency,period_start,period_end,cancel_at_period_end,created_at)
                    VALUES($1,$2,'vip','test','digetpay',$3,'active',499,'USD',$4,$5,true,$4)`,
                [subscriptionId, current.user_id, `digetpay:test:${verified.transactionId}`, now(), nextMonth(now())]);
                await tx.query(`UPDATE halastudy.digetpay_orders SET status='completed',subscription_id=$2 WHERE id=$1`, [orderId, subscriptionId]);
                await audit(tx, current.user_id, 'subscription.digetpay.test.activated', orderId);
                return { ...present(current), status: 'completed', redirectUrl: undefined };
            });
        })();
        inFlight.set(orderId, operation);
        try { return await operation; } finally { inFlight.delete(orderId); }
    }
    async function status(userId, orderId) {
        requireCondition(UUID.test(orderId), 'CHECKOUT_NOT_FOUND', 404);
        const order = (await db.query('SELECT * FROM halastudy.digetpay_orders WHERE id=$1 AND user_id=$2', [orderId, userId])).rows[0];
        requireCondition(order, 'CHECKOUT_NOT_FOUND', 404);
        try { return await reconcile(orderId); } catch (error) {
            if (!error.errorCode) throw error;
            await db.query('UPDATE halastudy.digetpay_orders SET last_error=$2 WHERE id=$1', [orderId, error.errorCode]);
            return { ...present(order), verificationPending: true };
        }
    }
    async function latest(userId) {
        const order = (await db.query('SELECT * FROM halastudy.digetpay_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [userId])).rows[0];
        return order ? present(order) : null;
    }
    async function listReview(cursor) {
        const parts = cursor ? String(cursor).split(':') : [];
        requireCondition(!cursor || (parts.length === 2 && /^\d{1,16}$/.test(parts[0])
            && Number.isSafeInteger(Number(parts[0])) && UUID.test(parts[1])), 'CURSOR_INVALID');
        const result = await db.query(`SELECT id,user_id,status,amount_minor,currency,created_at,checked_at,last_error
            FROM halastudy.digetpay_orders WHERE (status IN ('unknown','review') OR last_error IS NOT NULL
                OR (status='creating' AND created_at<$1))
                AND ($2::bigint IS NULL OR (created_at,id)<($2::bigint,$3::text))
            ORDER BY created_at DESC,id DESC LIMIT 51`, [now() - 900000, cursor ? Number(parts[0]) : null, cursor ? parts[1] : null]);
        const orders = result.rows.slice(0, 50);
        const last = orders[orders.length - 1];
        return { orders, lookup: client.lookup, nextCursor: result.rows.length > 50 ? `${last.created_at}:${last.id}` : null };
    }
    async function review(actorId, orderId, options) {
        requireCondition(UUID.test(orderId), 'CHECKOUT_NOT_FOUND', 404);
        requireCondition(typeof options?.reason === 'string' && options.reason.trim().length >= 3
            && options.reason.length <= 250 && typeof options.activateReview === 'boolean', 'ACTION_INVALID');
        requireCondition(!options.transactionId || (typeof options.transactionId === 'string'
            && UUID.test(options.transactionId)), 'PAYMENT_NOTIFICATION_INVALID');
        requireCondition((await db.query('SELECT id FROM halastudy.digetpay_orders WHERE id=$1', [orderId])).rows.length,
            'CHECKOUT_NOT_FOUND', 404);
        // The authenticated route restricts this operation to MFA-verified super admins.
        // Review never edits price, payment state or provider binding by hand.
        await audit(db, actorId, 'payment.review.requested', orderId,
            { reason: options.reason.trim(), activateReview: options.activateReview }, now());
        try {
            const result = await reconcile(orderId, options.transactionId || null, options.activateReview);
            await audit(db, actorId, 'payment.review.checked', orderId, { status: result.status }, now());
            return result;
        } catch (error) {
            const code = error.errorCode || 'PAYMENT_VERIFY_FAILED';
            await db.query('UPDATE halastudy.digetpay_orders SET last_error=$2 WHERE id=$1', [orderId, code]);
            await audit(db, actorId, 'payment.review.failed', orderId, { errorCode: code }, now());
            throw error;
        }
    }
    async function notify(payload) {
        requireCondition(client.enabled, 'CHECKOUT_UNCONFIGURED', 503);
        requireCondition(typeof payload?.orderId === 'string' && typeof payload?.transactionId === 'string'
            && UUID.test(payload.orderId) && UUID.test(payload.transactionId), 'PAYMENT_NOTIFICATION_INVALID');
        const order = (await db.query('SELECT id,user_id FROM halastudy.digetpay_orders WHERE id=$1', [payload.orderId])).rows[0];
        if (!order) return; // Do not disclose whether an order exists.
        const id = `digetpay:${hash(payload.orderId)}`;
        // One durable job per order. Hints are replaceable, never payment proof.
        // Neither retry budget nor a worker cooldown can be reset by a callback.
        await db.transaction(async (tx) => {
            await lockUser(tx, order.user_id);
            const legacy = (await tx.query(`SELECT MAX(attempts) AS attempts,MAX(available_at) AS available_at
                FROM halastudy.outbox WHERE kind='digetpay.verify' AND payload->>'orderId'=$1 AND id<>$2`, [order.id, id])).rows[0];
            await tx.query(`UPDATE halastudy.outbox SET status='completed',last_error='COALESCED'
                WHERE kind='digetpay.verify' AND payload->>'orderId'=$1 AND id<>$2 AND status='pending'`, [order.id, id]);
            await tx.query(`INSERT INTO halastudy.outbox(id,kind,payload,status,available_at,created_at,attempts)
                VALUES($1,'digetpay.verify',$2,CASE WHEN $5>=20 THEN 'failed' ELSE 'pending' END,$3,$4,$5)
                ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,
                    status=CASE WHEN halastudy.outbox.attempts>=20 THEN 'failed' ELSE 'pending' END,
                    available_at=GREATEST(halastudy.outbox.available_at,EXCLUDED.available_at)`,
            [id, JSON.stringify({ orderId: payload.orderId, transactionId: payload.transactionId }),
                Math.max(now(), Number(legacy.available_at || 0)), now(), Number(legacy.attempts || 0)]);
        });
    }
    async function drain() {
        if (stopped || !client.enabled) return;
        if (draining) return draining;
        draining = (async () => {
            const notifications = await db.query(`SELECT * FROM halastudy.outbox WHERE kind='digetpay.verify'
                AND status='pending' AND available_at<=$1 ORDER BY available_at LIMIT 10`, [now()]);
            for (const event of notifications.rows) {
                if (stopped) break;
                if (event.id !== `digetpay:${hash(event.payload.orderId)}`) {
                    await notify(event.payload); // Preserve/coalesce work written by earlier releases.
                    continue;
                }
                const expected = JSON.stringify(event.payload);
                const cooldown = now() + 300000;
                await db.query('UPDATE halastudy.outbox SET available_at=$2 WHERE id=$1', [event.id, cooldown]);
                await db.query('UPDATE halastudy.digetpay_orders SET next_check_at=$2 WHERE id=$1', [event.payload.orderId, cooldown]);
                try {
                    await reconcile(event.payload.orderId, event.payload.transactionId);
                    // A newer hint arriving during the lookup must remain pending.
                    await db.query(`UPDATE halastudy.outbox SET status='completed',last_error=NULL WHERE id=$1 AND payload=$2::jsonb`, [event.id, expected]);
                } catch (error) {
                    await db.query(`UPDATE halastudy.outbox SET attempts=attempts+1,available_at=GREATEST(available_at,$2),last_error=$3,
                        status=CASE WHEN attempts>=19 THEN 'failed' ELSE 'pending' END WHERE id=$1`,
                    [event.id, now() + Math.min(3600000, 30000 * 2 ** Math.min(event.attempts, 7)), error.errorCode || 'PAYMENT_VERIFY_FAILED']);
                    await db.query('UPDATE halastudy.digetpay_orders SET last_error=$2 WHERE id=$1', [event.payload.orderId, error.errorCode || 'PAYMENT_VERIFY_FAILED']);
                }
            }
            // Session queries recover missed notifications without trusting a
            // transaction ID supplied by a browser. Transaction mode needs a hint.
            // Recently expired orders stay eligible: a payment approved just
            // before the deadline whose webhook was lost must still activate.
            const orders = await db.query(`SELECT id FROM halastudy.digetpay_orders WHERE next_check_at<=$1
                AND status IN ('pending','completed','review','expired','unknown') AND session_id IS NOT NULL
                AND (status='completed' OR expires_at>$3)
                AND ($2::boolean OR transaction_id IS NOT NULL) ORDER BY next_check_at LIMIT 10`,
            [now(), client.lookup === 'session', now() - EXPIRED_RECHECK_WINDOW]);
            for (const order of orders.rows) {
                if (stopped) break;
                await db.query('UPDATE halastudy.digetpay_orders SET next_check_at=$2 WHERE id=$1', [order.id, now() + 300000]);
                try { await reconcile(order.id); } catch (error) {
                    await db.query('UPDATE halastudy.digetpay_orders SET last_error=$2 WHERE id=$1', [order.id, error.errorCode || 'PAYMENT_VERIFY_FAILED']);
                }
            }
        })();
        try { await draining; } finally { draining = null; }
    }
    function start() {
        if (!client.enabled || timer || stopped) return;
        timer = setInterval(() => { void drain().catch(() => logger.error({ event: 'payment_reconciliation_failed' })); }, 30000);
        timer.unref();
    }
    async function close() {
        stopped = true;
        clearInterval(timer);
        await Promise.allSettled([draining, ...inFlight.values()]);
    }
    async function unsupported(..._args) { requireCondition(false, 'BILLING_RENEWAL_UNAVAILABLE', 503); }
    return { describe, checkout, status, latest, listReview, review, notify, drain, start, close, complete: unsupported, cancel: unsupported };
}

module.exports = { createDigetPayBilling };
