const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createSupabaseClient } = require('../../services/supabase/client');

test('Supabase errors retain status without copying provider response bodies into logs', async () => {
    const client = createSupabaseClient({
        url: 'http://127.0.0.1:1',
        serviceKey: 'local-fixture-only',
        fetchImpl: async () => new Response('{"detail":"PRIVATE_ROW_MARKER@example.invalid"}', { status: 400 }),
    });
    await assert.rejects(client.select('users'), (error) => {
        assert.equal(/** @type {Error & {status: number}} */ (error).status, 400);
        assert.doesNotMatch((/** @type {Error} */ (error)).message, /PRIVATE_ROW_MARKER|example\.invalid/);
        return true;
    });
});
