const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const files = [
    ...fs.readdirSync('services/platform').filter((name) => name.endsWith('.js')).map((name) => path.join('services/platform', name)),
    'services/auth/reauth.js', 'services/auth/recovery.js', 'services/video/revocations.js',
    'services/ops/alerts.js',
    'services/seo/public-pages.js', 'public/js/marketing-copy.js',
    'public/js/recovery.js', 'public/js/platform.js', 'public/js/focus-client.js', 'scripts/platform-maintenance.js', 'scripts/preview-platform.js',
    ...fs.readdirSync('tests/integration').filter((name) => name.startsWith('platform') || name.startsWith('foundations')).map((name) => path.join('tests/integration', name)),
    'tests/smoke/platform.smoke.spec.js'
];
for (const file of files) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
let scripts = 0;
for (const file of ['index.html', 'account.html', 'landing.html', 'platform.html']) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/\bsrc=|\btype=["'](?:application\/ld\+json|importmap|module)/i.test(match[1])) continue;
        new vm.Script(match[2], { filename: `${file}#script-${scripts++}` });
    }
}
console.log(`Platform syntax: ${files.length} JavaScript files and ${scripts} inline scripts passed.`);
