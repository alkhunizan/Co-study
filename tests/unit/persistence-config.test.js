const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveSupabaseConfig } = require('../../co-study-server');

test('production requires complete Supabase persistence configuration', () => {
    assert.throws(
        () => resolveSupabaseConfig({ NODE_ENV: 'production' }),
        /Supabase.*required in production/i
    );
    assert.throws(
        () => resolveSupabaseConfig({
            NODE_ENV: 'production',
            SUPABASE_URL: 'https://project.supabase.co'
        }),
        /SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*together/i
    );

    assert.deepEqual(resolveSupabaseConfig({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://project.supabase.co/',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
    }), {
        enabled: true,
        url: 'https://project.supabase.co',
        serviceKey: 'service-role-key'
    });
});

test('development allows no Supabase configuration but rejects partial configuration', () => {
    assert.deepEqual(resolveSupabaseConfig({ NODE_ENV: 'development' }), {
        enabled: false,
        url: '',
        serviceKey: ''
    });
    assert.throws(
        () => resolveSupabaseConfig({ SUPABASE_SERVICE_ROLE_KEY: 'orphan-key' }),
        /SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*together/i
    );
});
