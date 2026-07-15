const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { repoRoot } = require('../helpers/test-env');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

test('npm CI scripts expose the complete code, infrastructure, and browser gates', () => {
    const pkg = JSON.parse(readRepoFile('package.json'));

    assert.match(pkg.scripts.lint, /--error-on-warnings/);
    for (const command of [
        'npm run check',
        'npm run supabase:migrations:check',
        'npm run typecheck',
        'npm run lint',
        'npm run deadcode',
        'npm run audit:prod',
        'npm run test:unit',
        'npm run test:integration'
    ]) {
        assert.match(pkg.scripts['test:ci:quality'], new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    for (const command of ['npm run lint:shell', 'npm run docker:verify', 'npm run nginx:verify']) {
        assert.match(pkg.scripts['test:ci:infra'], new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(pkg.scripts['test:ci'], /npm run test:ci:quality/);
    assert.match(pkg.scripts['test:ci'], /npm run test:ci:infra/);
    assert.match(pkg.scripts['test:ci'], /npm run test:smoke/);
});

test('GitHub Actions enforces every gate without production provider credentials', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml');

    assert.match(workflow, /NODE_ENV:\s*test/);
    assert.match(workflow, /npm run test:ci:quality/);
    assert.match(workflow, /npm run test:ci:infra/);
    assert.match(workflow, /npx playwright install --with-deps chromium webkit/);
    assert.match(workflow, /project:\s*\[chromium-desktop, chromium-mobile, webkit-desktop, webkit-mobile\]/);
    assert.match(workflow, /npm run test:smoke -- --project=\$\{\{ matrix\.project \}\}/);
    assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
    assert.doesNotMatch(workflow, /SUPABASE_(?:URL|SERVICE_ROLE_KEY):/);
    assert.doesNotMatch(workflow, /(?:GOOGLE_CLIENT_SECRET|CLOUDFLARE_REALTIMEKIT_API_TOKEN):/);
});

test('Playwright smoke coverage includes Chromium and WebKit on desktop and mobile', () => {
    const config = readRepoFile('playwright.config.js');

    assert.match(config, /devices/);
    for (const project of ['chromium-desktop', 'chromium-mobile', 'webkit-desktop', 'webkit-mobile']) {
        assert.match(config, new RegExp(`name:\\s*['"]${project}['"]`));
    }
    assert.match(config, /Desktop Chrome/);
    assert.match(config, /Pixel 7/);
    assert.match(config, /Desktop Safari/);
    assert.match(config, /iPhone 13/);
    assert.doesNotMatch(config, /browserName:\s*['"]chromium['"]/);
});

test('every browser smoke context installs the loopback-only network guard', () => {
    const smokeDirectory = path.join(repoRoot, 'tests', 'smoke');
    const specs = fs.readdirSync(smokeDirectory).filter((name) => name.endsWith('.spec.js'));

    assert.ok(specs.length > 0);
    for (const spec of specs) {
        const source = fs.readFileSync(path.join(smokeDirectory, spec), 'utf8');
        assert.match(source, /require\(['"]\.\.\/helpers\/playwright-test['"]\)/, `${spec} must import the guard`);
        assert.doesNotMatch(source, /browser\.newContext\(/, `${spec} must not bypass the guard`);
        assert.doesNotMatch(source, /\.goto\(/, `${spec} must use deterministic cross-browser navigation`);
        assert.doesNotMatch(source, /\.waitForURL\(/, `${spec} must use deterministic cross-browser URL waits`);
    }
});

test('CI infrastructure validators are syntax-checked and tracked by the test contract', () => {
    const pkg = JSON.parse(readRepoFile('package.json'));
    const check = pkg.scripts.check;

    for (const relativePath of [
        'scripts/ci/run-shellcheck.js',
        'scripts/ci/verify-docker-image.js',
        'scripts/ci/verify-nginx.js',
        'tests/helpers/playwright-test.js',
        'tests/integration/ci-pipeline.integration.test.js'
    ]) {
        assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `${relativePath} must exist`);
        assert.match(check, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});
