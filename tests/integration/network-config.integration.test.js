const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveListenHost } = require('../../services/config/network');

test('production listens on IPv4 loopback by default', () => {
    assert.equal(resolveListenHost({ NODE_ENV: 'production' }), '127.0.0.1');
});

test('non-production retains an all-interface development default', () => {
    assert.equal(resolveListenHost({ NODE_ENV: 'development' }), '0.0.0.0');
    assert.equal(resolveListenHost({ NODE_ENV: 'test' }), '0.0.0.0');
});

test('listen host accepts explicit bind addresses and rejects hostnames', () => {
    assert.equal(resolveListenHost({ NODE_ENV: 'production', HOST: '0.0.0.0' }), '0.0.0.0');
    assert.equal(resolveListenHost({ NODE_ENV: 'production', HOST: '::1' }), '::1');
    assert.throws(
        () => resolveListenHost({ NODE_ENV: 'production', HOST: 'example.com' }),
        /HOST must be an explicit loopback or wildcard IP address/
    );
});
