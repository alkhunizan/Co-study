const { requireCondition } = require('./common');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKOUT_ORIGINS = new Set(['https://pay-staging.digetpay.com', 'https://fin-admin.digetpay.com']);

// Live payments deliberately have no code path until the merchant-specific
// recurring, currency and status contracts have been demonstrated in sandbox.
function createDigetPayClient(env, fetchImpl = fetch) {
    let publicOrigin = '';
    try {
        const url = new URL(env.DIGETPAY_PUBLIC_ORIGIN);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if ((url.protocol === 'https:' || (local && url.protocol === 'http:'))
            && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) publicOrigin = url.origin;
    } catch { /* Missing/invalid configuration leaves checkout unavailable. */ }
    const lookup = env.DIGETPAY_STATUS_LOOKUP;
    const enabled = env.NODE_ENV !== 'production' && env.BILLING_MODE !== 'disabled'
        && env.DIGETPAY_ENVIRONMENT === 'sandbox' && env.DIGETPAY_USD_ENABLED === 'true'
        && ['session', 'transaction'].includes(lookup)
        && typeof env.DIGETPAY_API_KEY === 'string' && env.DIGETPAY_API_KEY.length >= 16 && !!publicOrigin;

    async function request(path, body = undefined) {
        requireCondition(enabled, 'CHECKOUT_UNCONFIGURED', 503);
        try {
            const response = await fetchImpl(`https://fin-api.digetpay.com/v1${path}`, {
                method: body ? 'POST' : 'GET',
                headers: { 'x-api-key': env.DIGETPAY_API_KEY, 'Content-Type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {}),
                signal: AbortSignal.timeout(8000), redirect: 'error'
            });
            requireCondition(response.ok, 'PAYMENT_PROVIDER_UNAVAILABLE', 503);
            requireCondition(response.body, 'PAYMENT_PROVIDER_INVALID', 503);
            const reader = response.body.getReader();
            let text = '';
            let size = 0;
            const decoder = new TextDecoder();
            try {
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    requireCondition(size <= 65536, 'PAYMENT_PROVIDER_INVALID', 503);
                    text += decoder.decode(value, { stream: true });
                }
                text += decoder.decode();
            } finally { await reader.cancel().catch(() => {}); }
            const result = JSON.parse(text);
            // Docs include both the wire response and an example wrapper.
            requireCondition(!result.failed && !result.errorCode, 'PAYMENT_PROVIDER_INVALID', 503);
            const payload = result.success?.body || result;
            requireCondition(!payload.errorCode && (payload.code === undefined || payload.code === 200),
                'PAYMENT_PROVIDER_INVALID', 503);
            return payload;
        } catch (error) {
            // Never leak provider bodies, credentials, phone numbers or URLs.
            requireCondition(false, error.errorCode || 'PAYMENT_PROVIDER_UNAVAILABLE', 503);
        }
    }
    async function create(order, customer) {
        requireCondition(typeof customer.phone === 'string' && /^(?:0?5\d{8}|\+9665\d{8}|9665\d{8})$/.test(customer.phone), 'PAYMENT_PHONE_INVALID');
        const phone = customer.phone.replace(/^\+?966/, '').replace(/^0/, '');
        const returnUrl = `${publicOrigin}/plans?checkout=${encodeURIComponent(order.id)}`;
        const result = await request('/payment/checkout/intiate', {
            merchantOrderId: order.id, amount: order.amount_minor / 100, currency: order.currency,
            customerPhone: phone, customerName: customer.name,
            ...(customer.email ? { customerEmail: customer.email } : {}),
            successUrl: returnUrl, failureUrl: returnUrl
        });
        let redirect;
        try { redirect = new URL(result.redirectUrl); } catch { /* Validate below. */ }
        requireCondition(UUID.test(result.id) && redirect && CHECKOUT_ORIGINS.has(redirect.origin)
            && redirect.pathname === '/pay/checkout' && !redirect.username && !redirect.password && !redirect.hash
            && redirect.searchParams.get('sessionId') === result.id, 'PAYMENT_PROVIDER_INVALID', 503);
        return { sessionId: result.id, redirectUrl: redirect.href };
    }
    async function status(order) {
        const id = lookup === 'session' ? order.session_id : order.transaction_id;
        requireCondition(UUID.test(id || ''), 'PAYMENT_AWAITING_NOTIFICATION', 409);
        const result = await request(`/payment/checkout/status?id=${encodeURIComponent(id)}`);
        const rows = result.data?.content;
        requireCondition(Array.isArray(rows) && rows.length === 1 && UUID.test(rows[0].transactionId || ''),
            'PAYMENT_VERIFICATION_INCOMPLETE', 409);
        const payment = rows[0];
        const reference = payment.orderId ?? payment.merchantOrderId;
        const currency = payment.currency ?? payment.currencyCode;
        const normalizedCurrency = currency === '840' || currency === 840 ? 'USD' : currency;
        // A notification cannot bind someone else's payment to an order.
        // Transaction lookups MUST independently return order + currency.
        requireCondition(lookup === 'session' || (reference === order.id && normalizedCurrency === order.currency),
            'PAYMENT_VERIFICATION_INCOMPLETE', 409);
        requireCondition((reference === undefined || reference === order.id)
            && (normalizedCurrency === undefined || normalizedCurrency === order.currency)
            && (!order.transaction_id || order.transaction_id === payment.transactionId),
            'PAYMENT_MISMATCH', 409);
        const amount = String(payment.amount ?? '');
        requireCondition(/^\d+(?:\.\d{1,2})?$/.test(amount)
            && Math.round(Number(amount) * 100) === order.amount_minor, 'PAYMENT_MISMATCH', 409);
        requireCondition(['NONE', 'PARTIAL', 'FULL'].includes(payment.refundStatus), 'PAYMENT_VERIFICATION_INCOMPLETE', 409);
        const refund = String(payment.totalRefundAmount ?? '');
        requireCondition(/^\d+(?:\.\d{1,2})?$/.test(refund), 'PAYMENT_VERIFICATION_INCOMPLETE', 409);
        return {
            transactionId: payment.transactionId,
            approved: payment.transactionStatus === 'SUCCESS' && payment.paymentStatus === 'APPROVED',
            refunded: payment.refundStatus !== 'NONE' || Number(refund) > 0
        };
    }
    return { enabled: !!enabled, lookup, create, status };
}

module.exports = { createDigetPayClient };
