const path = require('node:path');
const { paymentFixture } = require(path.join(process.cwd(), 'tests/helpers/digetpay-fixture'));
const fixture = paymentFixture();
global.fetch = async (url, options) => {
    if (new URL(url).origin !== 'https://fin-api.digetpay.com') throw new Error('AUDIT_EXTERNAL_NETWORK_BLOCKED');
    if (options.method === 'GET') {
        console.log(JSON.stringify({ audit: 'fake-payment-status-call' }));
        for (const payment of fixture.sessions.values()) {
            payment.transactionStatus = 'SUCCESS';
            payment.paymentStatus = 'APPROVED';
        }
    }
    return fixture.fetchImpl(url, options);
};
