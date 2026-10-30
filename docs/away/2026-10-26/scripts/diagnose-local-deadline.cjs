// Diagnostic only: no production requests, no test-assertion or timeout changes.
const fs = require('node:fs');
const http = require('node:http');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const runtime = process.argv[2];
const output = process.argv[3];
const { createSupabaseClient } = require(path.join(runtime, 'services/supabase/client'));
const events = [];
const started = performance.now();
const stamp = () => Math.round((performance.now() - started) * 100) / 100;
const server = http.createServer((req, res) => {
    events.push({ event: 'local-request-arrived', path: req.url.split('?')[0], atMs: stamp() });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.includes('/stalled?')) { res.flushHeaders(); res.write('['); }
    else res.end('[{"id":"synthetic"}]');
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const client = createSupabaseClient({
        url: `http://127.0.0.1:${server.address().port}`,
        serviceKey: 'local-fixture-only', timeoutMs: 100,
    });
    const results = [];
    try {
        for (const table of ['cold-control', 'warm-control', 'stalled']) {
            const start = performance.now();
            const timer = setTimeout(() => events.push({ event: '100ms-probe-fired', table, atMs: stamp() }), 100);
            try {
                const rows = await client.select(table);
                results.push({ table, outcome: 'success', elapsedMs: performance.now() - start, rows });
            } catch (error) {
                results.push({ table, outcome: error.name, elapsedMs: performance.now() - start });
            } finally { clearTimeout(timer); }
        }
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
    const report = { at: new Date().toISOString(), node: process.version, timeoutMs: 100,
        scope: 'diagnostic only; existing client, loopback HTTP, unchanged test and application', results, events };
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
