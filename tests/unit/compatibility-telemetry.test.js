const assert = require('node:assert/strict');
const test = require('node:test');

const {
    COMPATIBILITY_SIGNALS,
    createCompatibilityTelemetry
} = require('../../services/compatibility/telemetry');

test('compatibility telemetry starts at zero, records only fixed signals, and logs no caller data', () => {
    const entries = [];
    let now = Date.parse('2026-07-15T10:00:00.000Z');
    const telemetry = createCompatibilityTelemetry({
        now: () => now,
        logger: { info(entry) { entries.push(entry); } }
    });

    const initial = telemetry.snapshot();
    assert.equal(initial.minimumZeroUseDays, 14);
    assert.equal(initial.totalUses, 0);
    assert.deepEqual(Object.keys(initial.signals).sort(), [...COMPATIBILITY_SIGNALS].sort());
    for (const signal of Object.values(initial.signals)) {
        assert.deepEqual(signal, { count: 0, lastUsedAt: null });
    }

    now += 1000;
    telemetry.record('video_heartbeat_legacy_shape');
    now += 1000;
    telemetry.record('video_heartbeat_legacy_shape');
    const snapshot = telemetry.snapshot();
    assert.equal(snapshot.totalUses, 2);
    assert.deepEqual(snapshot.signals.video_heartbeat_legacy_shape, {
        count: 2,
        lastUsedAt: '2026-07-15T10:00:02.000Z'
    });
    assert.deepEqual(entries, [
        { event: 'compatibility_path_used', signal: 'video_heartbeat_legacy_shape', count: 1 },
        { event: 'compatibility_path_used', signal: 'video_heartbeat_legacy_shape', count: 2 }
    ]);
    assert.throws(() => telemetry.record('caller-selected-signal'), /unsupported compatibility signal/i);
});
