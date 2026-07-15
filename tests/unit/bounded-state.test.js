const assert = require('node:assert/strict');
const test = require('node:test');

const { SlidingWindowRateLimiter } = require('../../services/security/bounded-rate-limiter');
const { createVideoSessionRegistry } = require('../../services/video/video-session-registry');

test('rate limiter evicts expired and least-recently-used keys at its hard bound', () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 100, maxEntries: 3 });

    limiter.consume('old', 0);
    limiter.consume('recent-a', 50);
    limiter.consume('recent-b', 50);
    limiter.check('recent-a', 75);
    limiter.consume('recent-c', 75);

    assert.equal(limiter.entries.size, 3);
    assert.equal(limiter.entries.has('old'), false);
    assert.equal(limiter.entries.has('recent-a'), true);
    assert.equal(limiter.entries.has('recent-b'), true);
    assert.equal(limiter.entries.has('recent-c'), true);

    limiter.consume('after-expiry', 200);
    assert.equal(limiter.entries.size, 1);
    assert.equal(limiter.entries.has('after-expiry'), true);
});

test('video registry retains at most the configured ended-session diagnostics', () => {
    let now = 1_000;
    const registry = createVideoSessionRegistry({ now: () => now, endedCapacity: 2 });

    for (const suffix of ['a', 'b', 'c']) {
        const session = registry.registerVideoSession({
            roomId: 'ROOM01',
            userId: `user-${suffix}`,
            videoSessionId: `${suffix.repeat(32)}`,
            joinedAt: now
        });
        now += 1_000;
        registry.markVideoSessionLeft({ videoSessionId: session.videoSessionId }, 'test');
    }

    assert.equal(registry.listActive().length, 0);
    assert.equal(registry.sessions.size, 2);
    assert.equal(registry.sessions.has('ROOM01:user-a:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
});
