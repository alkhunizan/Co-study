const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..', '..');

test('rollout runbook locks the additive order, durable evidence window, and safe rollback', () => {
    const runbook = fs.readFileSync(path.join(repoRoot, 'docs', 'ROLLOUT-COMPATIBILITY.md'), 'utf8');

    assert.match(runbook, /0e3d477/);
    assert.match(runbook, /clientSessionId.*role.*student/s);
    assert.match(runbook, /video-heartbeat[\s\S]*displayName[\s\S]*clientSessionId/);
    assert.match(runbook, /X-Halastudy-Membership/);
    assert.match(runbook, /never authorize, select, evict,[\s\S]*replace/i);
    assert.match(runbook, /in-memory and reset on every process restart/i);
    assert.match(runbook, /compatibility_path_used/);
    assert.match(runbook, /Fourteen consecutive 24-hour periods/i);
    assert.match(runbook, /Apply the additive Supabase migrations[\s\S]*Deploy the dual-read build/i);
    assert.match(runbook, /VIDEO_JOIN_DISABLED=true/);
    assert.match(runbook, /migration:rooms -- --apply --writer-stopped/);
    assert.match(runbook, /First 24 hours/);
    assert.match(runbook, /Rollback sequence/);
    assert.match(runbook, /previous known-good \*\*dual-read\*\*\s+build/);
    assert.match(runbook, /never roll back to a build that authorizes with caller IDs/i);
    assert.match(runbook, /does not remove\s+additive Supabase columns/i);
});
