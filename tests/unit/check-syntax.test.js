const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { extractInlineScripts } = require('../../scripts/ci/check-syntax');

const checker = path.join(__dirname, '..', '..', 'scripts', 'ci', 'check-syntax.js');

function makeSite(t, files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-check-syntax-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
    return dir;
}

function runChecker(root) {
    return spawnSync(process.execPath, [checker], {
        encoding: 'utf8',
        env: { ...process.env, CHECK_SYNTAX_ROOT: root }
    });
}

test('inline scripts are extracted with their start line; external and empty scripts are ignored', () => {
    const html = '<html>\n<head>\n<script src="/a.js"></script>\n<script></script>\n</head>\n<body>\n<script>\nconst a = 1;\n</script>\n<script type="module">export {};</script>\n</body>\n</html>';
    const scripts = extractInlineScripts(html);
    assert.deepEqual(scripts.map((script) => [script.type, script.line]), [['', 7], ['module', 10]]);
});

test('a page whose inline scripts all parse passes, and non-JavaScript types are skipped', (t) => {
    const root = makeSite(t, {
        'good.html': '<script>\nwindow.ok = () => 1;\n</script>\n<script type="module">export const x = 1;</script>',
        'mock.html': '<script type="text/babel">const App = () => <div />;</script>',
        'data.html': '<script type="application/ld+json">{"@type": "Article"}</script>'
    });
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /inline scripts in 3 HTML pages/);
});

test('a syntax error in an inline script fails the check and names the page and line', (t) => {
    const root = makeSite(t, {
        'good.html': '<script>window.ok = 1;</script>',
        'broken.html': '<!doctype html>\n<p>intro</p>\n<script>\nconst a = 1;\nfunction broken( {\n</script>'
    });
    const result = runChecker(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /broken\.html inline script #1 \(line 3\)/);
    // "Unexpected end of input" is reported where the script ends.
    assert.match(result.stderr, /broken\.html:6/);
    assert.doesNotMatch(result.stderr, /good\.html/);
});

test('invalid JSON-LD fails the check', (t) => {
    const root = makeSite(t, {
        'article.html': '<script type="application/ld+json">{"@type": "Article",}</script>'
    });
    const result = runChecker(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /article\.html inline script #1 \(line 1\): invalid JSON-LD/);
});
