const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const files = [
    ...fs.readdirSync('services/platform').filter((name) => name.endsWith('.js')).map((name) => path.join('services/platform', name)),
    'services/auth/reauth.js', 'services/auth/recovery.js', 'services/video/revocations.js',
    'services/ops/alerts.js',
    'services/seo/public-pages.js', 'public/js/marketing-copy.js',
    'public/js/recovery.js', 'public/js/platform.js', 'public/js/focus-client.js', 'scripts/platform-maintenance.js', 'scripts/preview-platform.js',
    'public/js/ux-insights.js', 'public/js/schedule-display.js', 'public/js/legal-shell.js',
    ...fs.readdirSync('tests/integration').filter((name) => /^(platform|foundations|digetpay|ux-)/.test(name)).map((name) => path.join('tests/integration', name)),
    'tests/helpers/digetpay-fixture.js', 'tests/smoke/platform.smoke.spec.js', 'tests/smoke/digetpay.smoke.spec.js',
    'tests/smoke/ux-journeys.smoke.spec.js', 'tests/smoke/ux-return.smoke.spec.js'
];
for (const file of files) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
let scripts = 0;
for (const file of ['index.html', 'open.html', 'account.html', 'landing.html', 'platform.html']) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc=|\btype=["'](?:application\/ld\+json|importmap|module)/i.test(match[1])) continue;
        new vm.Script(match[2], { filename: `${file}#script-${scripts++}` });
    }
}
console.log(`Platform syntax: ${files.length} JavaScript files and ${scripts} inline scripts passed.`);
