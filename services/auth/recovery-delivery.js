const crypto = require('node:crypto');

function sanitizeDelivery(job) {
    if (!job || !/^[a-f0-9-]{36}$/.test(job.id) || !/^[A-Za-z0-9_-]{16,8192}$/.test(job.payload)
        || !Number.isSafeInteger(job.attempts) || job.attempts < 0 || job.attempts > 5
        || !Number.isSafeInteger(job.nextAt)) return undefined;
    return { id: job.id, payload: job.payload, attempts: job.attempts, nextAt: job.nextAt };
}

// Resend's HTTPS API and 24-hour idempotency contract were checked against the
// official reference. Recovery jobs expire after 30 minutes, within that window.
function createResendMail({ env, platform, fetchImpl = undefined, timeoutMs = 10000, isReady = () => true }) {
    let origin;
    try { origin = new URL(env.AUTH_PUBLIC_ORIGIN); } catch { /* disabled below */ }
    const key = Buffer.from(env.AUTH_MAIL_ENCRYPTION_KEY || '', 'base64');
    const transport = fetchImpl || fetch;
    const enabled = env.AUTH_MAIL_MODE === 'resend' && !!platform?.enabled
        && (env.NODE_ENV === 'production' || !!fetchImpl)
        && !!env.RESEND_API_KEY && /^Halastudy <info@halastudy\.com>$/.test(env.AUTH_MAIL_FROM || '')
        && origin?.protocol === 'https:' && !origin.username && !origin.password
        && origin.pathname === '/' && !origin.search && !origin.hash && key.length === 32;
    const dailyLimit = Math.max(1, Math.min(500, Math.trunc(Number(env.AUTH_MAIL_DAILY_LIMIT)) || 100));
    function open(job) {
        const bytes = Buffer.from(job.payload, 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(job.id));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    }
    function seal(value, id = crypto.randomUUID()) {
        const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(Buffer.from(id));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
        return { id, payload: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url'), attempts: 0, nextAt: Date.now() };
    }
    let accepting = Promise.resolve();
    return {
        enabled, durable: true, mode: 'resend', open, isReady,
        async accept(user, email, purpose, backlog = /** @type {number | (() => number)} */ (0)) {
            if (!enabled) throw new Error('MAIL_UNAVAILABLE');
            await platform.ready;
            // Persist an identically shaped encrypted intent for known/unknown
            // accounts before 202. Restart cannot silently lose an accepted job.
            const token = `${user?.id || crypto.randomUUID()}.${crypto.randomBytes(32).toString('base64url')}`;
            const job = seal({ userId: user?.id || null, epoch: user?.tokenEpoch || null,
                email, purpose, token, expiresAt: Date.now() + 30 * 60000 });
            accepting = accepting.catch(() => {}).then(() => platform.db.transaction(async tx => {
                const count = await tx.query("SELECT count(*)::integer AS count FROM halastudy.outbox WHERE kind='recovery_request'");
                if (count.rows[0].count + (typeof backlog === 'function' ? backlog() : backlog) >= 100) throw new Error('MAIL_QUEUE_FULL');
                await tx.query(`INSERT INTO halastudy.outbox(id,kind,payload,available_at,created_at)
                    VALUES($1,'recovery_request',$2,$3,$3)`, [job.id, JSON.stringify(job), Date.now()]);
            }));
            await accepting;
        },
        async nextRequest() {
            await platform.ready;
            return (await platform.db.query("SELECT id,payload,created_at FROM halastudy.outbox WHERE kind='recovery_request' AND available_at<=$1 ORDER BY created_at,id LIMIT 1", [Date.now()])).rows[0];
        },
        async deferRequest(id) { await platform.db.query("UPDATE halastudy.outbox SET available_at=$2 WHERE id=$1 AND kind='recovery_request'", [id, Date.now() + 60000]); },
        async finishRequest(id) { await platform.db.query("DELETE FROM halastudy.outbox WHERE id=$1 AND kind='recovery_request'", [id]); },
        prepare({ email, purpose, token, id = crypto.randomUUID() }) {
            if (!enabled) throw new Error('MAIL_UNAVAILABLE');
            const url = new URL('/recover', origin);
            url.hash = new URLSearchParams({ purpose, token }).toString();
            const reset = purpose === 'reset';
            const arabic = reset ? 'إعادة تعيين كلمة المرور' : 'تأكيد بريدك الإلكتروني';
            const english = reset ? 'Reset your password' : 'Verify your email';
            const text = `هلاستدي — ${arabic}\n${url.href}\nينتهي الرابط خلال 30 دقيقة ويُستخدم مرة واحدة. إذا لم تطلبه فتجاهل هذه الرسالة.\n\nHalastudy — ${english}\n${url.href}\nThis link expires in 30 minutes and works once. If you did not request it, ignore this message.`;
            const message = { from: env.AUTH_MAIL_FROM, to: [email], reply_to: 'info@halastudy.com',
                subject: `Halastudy — ${arabic} / ${english}`, text,
                html: `<div lang="ar" dir="rtl"><h1>${arabic}</h1><p><a href="${url.href.replaceAll('&', '&amp;')}">${arabic}</a></p><p>ينتهي الرابط خلال 30 دقيقة ويُستخدم مرة واحدة. إذا لم تطلبه فتجاهل هذه الرسالة.</p></div><div lang="en" dir="ltr"><h1>${english}</h1><p><a href="${url.href.replaceAll('&', '&amp;')}">${english}</a></p><p>This link expires in 30 minutes and works once. If you did not request it, ignore this message.</p></div>` };
            return seal({ email, purpose, token, message }, id);
        },
        async reserveBudget() {
            await platform.ready;
            const budgetKey = `recovery_mail_budget:${new Date().toISOString().slice(0, 10)}`;
            return platform.db.transaction(async tx => {
                await tx.query('INSERT INTO halastudy.store_metadata(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING', [budgetKey, '0']);
                const result = await tx.query(`UPDATE halastudy.store_metadata SET value=((value::integer)+1)::text
                    WHERE key=$1 AND value::integer<$2 RETURNING key`, [budgetKey, dailyLimit]);
                return result.rows.length === 1;
            });
        },
        async deliver(job) {
            if (!enabled) throw new Error('MAIL_UNAVAILABLE');
            const { message } = open(job);
            const controller = new AbortController();
            let timer;
            const deadline = /** @type {Promise<never>} */ (new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('MAIL_DEADLINE')); }, timeoutMs); }));
            try {
                const response = await Promise.race([transport('https://api.resend.com/emails', { method: 'POST', redirect: 'error',
                    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `recovery/${job.id}` },
                    body: JSON.stringify(message), signal: controller.signal }), deadline]);
                // Read the body inside the same deadline and bound its size.
                const reader = response.body?.getReader();
                const chunks = []; let size = 0;
                if (reader) for (;;) {
                    const part = await Promise.race([reader.read(), deadline]);
                    if (part.done) break;
                    size += part.value.length;
                    if (size > 16384) { void reader.cancel().catch(() => {}); throw new Error('MAIL_RESPONSE_INVALID'); }
                    chunks.push(Buffer.from(part.value));
                }
                if (!response.ok) {
                    const error = Object.assign(new Error('MAIL_PROVIDER_REJECTED'), { retryable: response.status === 429 || response.status >= 500 });
                    throw error;
                }
                let receipt;
                try { receipt = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('MAIL_RESPONSE_INVALID'); }
                if (typeof receipt?.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(receipt.id)) throw new Error('MAIL_RESPONSE_INVALID');
            } catch (error) {
                // No URL, request, response body, email, key or token crosses this boundary.
                throw Object.assign(new Error('MAIL_DELIVERY_FAILED'), { retryable: error.retryable !== false });
            } finally { clearTimeout(timer); controller.abort(); }
        }
    };
}

module.exports = { createResendMail, sanitizeDelivery };
