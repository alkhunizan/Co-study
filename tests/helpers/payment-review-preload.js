// Dedicated child-process fixture: never imported by the application.
if (process.env.NODE_ENV === 'test' && process.env.PAYMENT_REVIEW_FIXTURE === '1') {
    const fixture = require('./digetpay-fixture').paymentFixture();
    let first = true;
    global.fetch = async (url, options) => {
        if (new URL(String(url)).origin !== 'https://fin-api.digetpay.com') throw new Error('TEST_EXTERNAL_REQUEST_BLOCKED');
        if (options.method === 'GET') {
            if (first) { first = false; return new Response('unavailable', { status: 503 }); }
            for (const remote of fixture.sessions.values()) Object.assign(remote, { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
        }
        return fixture.fetchImpl(url, options);
    };
}
