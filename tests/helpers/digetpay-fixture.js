const crypto = require('node:crypto');

const sandboxEnv = {
    NODE_ENV: 'test', BILLING_PROVIDER: 'digetpay', BILLING_MODE: 'test',
    DIGETPAY_ENVIRONMENT: 'sandbox', DIGETPAY_API_KEY: 'test-only-digetpay-key-not-real',
    DIGETPAY_USD_ENABLED: 'true', DIGETPAY_PUBLIC_ORIGIN: 'https://halastudy.example',
    DIGETPAY_STATUS_LOOKUP: 'session'
};

function paymentFixture() {
    const sessions = new Map();
    const calls = [];
    const controls = { failCreate: false, failStatus: false, badRedirect: false };
    const fetchImpl = async (url, options) => {
        const parsed = new URL(url);
        calls.push({ url, ...options });
        if (parsed.pathname.endsWith('/intiate')) {
            if (controls.failCreate) throw new Error('network interrupted after submission');
            const body = JSON.parse(options.body);
            const id = crypto.randomUUID();
            sessions.set(id, {
                orderId: body.merchantOrderId, currency: body.currency, transactionId: crypto.randomUUID(),
                amount: body.amount.toFixed(2), transactionStatus: 'PENDING', paymentStatus: 'PENDING',
                refundStatus: 'NONE', totalRefundAmount: '0.00'
            });
            return new Response(JSON.stringify({
                id, redirectUrl: `${controls.badRedirect ? 'https://evil.example' : 'https://pay-staging.digetpay.com'}/pay/checkout?sessionId=${id}`
            }), { status: 201 });
        }
        if (controls.failStatus) return new Response('unavailable', { status: 503 });
        const id = parsed.searchParams.get('id');
        const payment = sessions.get(id) || [...sessions.values()].find((item) => item.transactionId === id);
        return new Response(JSON.stringify({ code: 200, data: { content: payment ? [payment] : [] } }));
    };
    return { sessions, calls, controls, fetchImpl };
}

module.exports = { sandboxEnv, paymentFixture };
