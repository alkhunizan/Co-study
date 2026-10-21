const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

test('room diagnostics default off and redact ICE details even when explicitly enabled', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    const source = html.slice(html.indexOf('    const DEBUG ='), html.indexOf('    function getStoredLanguage()'));
    const calls = [];
    const context = { console: { log: (...args) => calls.push(args) } };
    vm.runInNewContext(source + "debugLog('RTC-CONFIG', 'configuration', { credential: 'synthetic-secret' });", context);
    assert.equal(calls.length, 0);
    vm.runInNewContext(source.replace('const DEBUG = false', 'const DEBUG = true')
        + "debugLog('RTC-CONFIG', 'configuration', { credential: 'synthetic-secret', count: 2 }); debugLog('ICE', 'candidate', '192.0.2.10 synthetic-secret');", { ...context });
    assert.equal(calls.length, 2);
    assert.doesNotMatch(JSON.stringify(calls), /synthetic-secret|192\.0\.2\.10/);
    assert.match(JSON.stringify(calls), /count/);
});
