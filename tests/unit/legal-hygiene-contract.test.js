const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.join(__dirname, '..', '..');

function readRepoFile(filePath) {
    return fs.readFileSync(path.join(REPO_ROOT, filePath), 'utf8');
}

function languageSection(html, language) {
    const match = html.match(new RegExp(`<section lang="${language}"[^>]*>([\\s\\S]*?)<\\/section>`));
    assert.ok(match, `${language} policy section is missing`);
    return match[1];
}

function ignoreEntries(filePath) {
    return new Set(readRepoFile(filePath)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')));
}

test('privacy policy discloses managed media and every active external processor in both languages', () => {
    const privacy = readRepoFile('privacy.html');
    const english = languageSection(privacy, 'en');
    const arabic = languageSection(privacy, 'ar');

    for (const section of [english, arabic]) {
        for (const provider of ['Cloudflare RealtimeKit', 'Google', 'Supabase', 'Cloudflare', 'jsDelivr']) {
            assert.match(section, new RegExp(provider), `${provider} disclosure is missing`);
        }
    }

    assert.match(english, /managed SFU/i);
    assert.match(arabic, /SFU/);
    assert.doesNotMatch(english, /video and audio travel directly between participants \(peer-to-peer\)/i);
    assert.doesNotMatch(arabic, /الفيديو والصوت ينتقلان مباشرة بين المشاركين/);
});

test('privacy policy distinguishes scheduled-room retention, live deletion, and seven-day backup aging', () => {
    const privacy = readRepoFile('privacy.html');
    const english = languageSection(privacy, 'en');
    const arabic = languageSection(privacy, 'ar');

    assert.match(english, /Scheduled rooms[\s\S]*verified deletion request/i);
    assert.match(english, /live production systems[\s\S]*immediately/i);
    assert.match(english, /encrypted backups[\s\S]*seven days/i);

    assert.match(arabic, /الغرف المجدولة[\s\S]*طلب حذف موثّق/);
    assert.match(arabic, /أنظمة الإنتاج الحية[\s\S]*فوراً/);
    assert.match(arabic, /النسخ الاحتياطية المشفّرة[\s\S]*سبعة أيام/);
});

test('terms disclose Cloudflare-managed media and the third-party service boundary', () => {
    const terms = readRepoFile('terms.html');

    for (const language of ['en', 'ar']) {
        const section = languageSection(terms, language);
        assert.match(section, /Cloudflare RealtimeKit/);
        for (const provider of ['Google', 'Supabase', 'Cloudflare', 'jsDelivr']) {
            assert.match(section, new RegExp(provider), `${provider} terms disclosure is missing`);
        }
    }
});

test('selfsigned remains available for local HTTPS without entering the production dependency set', () => {
    const manifest = JSON.parse(readRepoFile('package.json'));
    const lockfile = JSON.parse(readRepoFile('package-lock.json'));

    assert.equal(manifest.dependencies.selfsigned, undefined);
    assert.equal(manifest.devDependencies.selfsigned, '^5.5.0');
    assert.equal(lockfile.packages[''].dependencies.selfsigned, undefined);
    assert.equal(lockfile.packages[''].devDependencies.selfsigned, '^5.5.0');
    assert.equal(lockfile.packages['node_modules/selfsigned'].dev, true);
});

test('git and container contexts exclude runtime, diagnostic, backup, and credential state', () => {
    const gitIgnore = ignoreEntries('.gitignore');
    const dockerIgnore = ignoreEntries('.dockerignore');
    const requiredExclusions = [
        '.env.*',
        'data/',
        'runtime/',
        '*.pid',
        '*.sock',
        'diagnostics/',
        'docs/reports/*-diagnostic.*',
        '*.trace',
        'backups/',
        '*.backup.*',
        '*.bak',
        'credentials/',
        '*.credentials.*',
        '*.pem',
        '*.key',
        '*.p12',
        '*.pfx'
    ];

    for (const exclusion of requiredExclusions) {
        assert.ok(gitIgnore.has(exclusion), `.gitignore must exclude ${exclusion}`);
        assert.ok(dockerIgnore.has(exclusion), `.dockerignore must exclude ${exclusion}`);
    }
    assert.ok(gitIgnore.has('!.env.example'), '.env.example must remain committable');
});
