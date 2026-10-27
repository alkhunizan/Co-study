const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogger } = require('../../services/logging/logger');
const { startServer } = require('../helpers/server-control');

test('malformed JSON cannot copy submitted text into request logs', async (t) => {
    const server = await startServer(); t.after(() => server.stop());
    const response = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '"VPRIV"bad'
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { errorCode: 'BAD_REQUEST' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const logs = JSON.stringify(server.logs());
    assert.ok(logs.includes('unhandled_request_error'));
    assert.ok(!logs.includes('VPRIV'));
});

test('JSON log sanitization preserves operational errors and structured redaction', (t) => {
    const entries = []; t.mock.method(console, 'error', () => {});
    const logger = createLogger({}, { onEntry: (entry) => entries.push(entry) });
    for (const text of ['"VPRIV"bad', '{"VPRIV":}']) {
        try { JSON.parse(text); } catch (error) { logger.error({ event: 'parse_failed', message: error.message }); }
    }
    logger.error({ event: 'storage_failed', message: 'Disk unavailable', token: 'synthetic-only' });
    assert.ok(!JSON.stringify(entries).includes('VPRIV'));
    assert.equal(entries[2].message, 'Disk unavailable');
    assert.equal(entries[2].token, '[redacted]');
});
