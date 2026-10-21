const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const { startServer } = require('../helpers/server-control');

test('sitemap exposes only canonical public pages with real HTML, valid schema and reachable images', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const robots = await server.request('/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.body, /Sitemap: https:\/\/halastudy.com\/sitemap.xml/);
    assert.doesNotMatch(robots.body, /Disallow: \/(?:account|study|js|css)/);
    const sitemap = await server.request('/sitemap.xml');
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers['content-type'], /xml/);
    const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.equal(urls.length, 12);
    assert.ok(urls.includes('https://halastudy.com/en/privacy'));
    assert.ok(urls.includes('https://halastudy.com/en/terms'));
    assert.equal(new Set(urls).size, urls.length);
    assert.doesNotMatch(sitemap.body, /<lastmod>|<priority>|\/(?:account|study|plans)<\/loc>|\.html/);
    for (const url of urls) {
        const route = new URL(url).pathname;
        const response = await server.request(route, { headers: { Host: 'untrusted.example' } });
        assert.equal(response.status, 200, route);
        const html = response.body;
        assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1, route);
        assert.ok(html.includes(`rel="canonical" href="${url}"`), route);
        assert.match(html, /<meta name="description" content="[^"]{40,}"/);
        assert.match(html, /<h1\b/);
        assert.doesNotMatch(html, /untrusted\.example/);
        assert.doesNotMatch(response.headers['x-robots-tag'] || '', /noindex/);
        const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
        assert.ok(schemas.length, route);
        for (const match of schemas) assert.ok(JSON.parse(match[1])['@context']);
        const imageUrl = html.match(/property="og:image" content="([^"]+)"/)[1];
        const imageResponse = await fetch(server.baseUrl + new URL(imageUrl).pathname);
        assert.equal(imageResponse.status, 200, imageUrl);
        assert.match(imageResponse.headers.get('content-type'), /^image\//);
        if (imageUrl.endsWith('.png')) {
            const bytes = Buffer.from(await imageResponse.arrayBuffer());
            assert.equal(bytes.readUInt32BE(16), 1200);
            assert.equal(bytes.readUInt32BE(20), 630);
        } else await imageResponse.body.cancel();
    }
    const cli = await promisify(execFile)(process.execPath,
        [path.join(__dirname, '../../scripts/verify-seo.js'), server.baseUrl], { timeout: 30000 });
    assert.match(cli.stdout, /SEO verified: 12 canonical public pages/);
});

test('public aliases redirect once while session URLs stay functional and excluded from indexing', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    for (const [from, to] of [
        ['/blog.html?utm_source=test', '/blog?utm_source=test'], ['/BLOG/', '/blog'],
        ['/privacy.html', '/privacy'], ['/terms/', '/terms'], ['/landing.html', '/'],
        ['/EN/BLOG/', '/en/blog'], ['/blog/study-with-me-online-arabic/', '/blog/study-with-me-online-arabic']
    ]) {
        const response = await server.request(from);
        assert.equal(response.status, 301, from);
        assert.equal(response.headers.location, to, from);
        assert.equal((await server.request(to)).status, 200);
    }
    for (const route of ['/account', '/account.html', '/open?room=ABC123', '/index.html', '/study', '/workspace', '/room', '/lobby', '/app', '/plans', '/supervisor', '/recover']) {
        const response = await server.request(route);
        assert.equal(response.status, 200, route);
        assert.match(response.headers['x-robots-tag'], /noindex/);
    }
    const missing = await server.request('/blog/not-a-published-post');
    assert.equal(missing.status, 404);
    assert.match(missing.headers['x-robots-tag'], /noindex/);
    assert.equal((await server.request('/en/blog/study-with-me-online-arabic')).status, 404, 'no fake translated article');
    const www = await server.request('/EN/BLOG/?utm_source=share', { headers: { Host: 'www.halastudy.com' } });
    assert.equal(www.status, 301);
    assert.equal(www.headers.location, 'https://halastudy.com/en/blog?utm_source=share');
});

test('locale pages render translated content and reciprocal alternatives before JavaScript runs', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    for (const [arabic, english] of [['/', '/en'], ['/blog', '/en/blog'], ['/contact', '/en/contact'], ['/privacy', '/en/privacy'], ['/terms', '/en/terms']]) {
        const ar = (await server.request(arabic)).body;
        const en = (await server.request(english)).body;
        assert.match(ar, /<html lang="ar" dir="rtl"/);
        assert.match(en, /<html lang="en" dir="ltr"/);
        for (const html of [ar, en]) {
            assert.ok(html.includes(`hreflang="ar" href="https://halastudy.com${arabic}"`));
            assert.ok(html.includes(`hreflang="en" href="https://halastudy.com${english}"`));
            assert.ok(html.includes(`href="${arabic}" lang="ar"`));
            assert.ok(html.includes(`href="${english}" lang="en"`));
        }
    }
    const englishHome = (await server.request('/en')).body;
    assert.match(englishHome, /data-i18n="heroTitle1">A quiet session\.</);
    assert.match((await server.request('/en/blog')).body, /<h1 data-lang="blogTitle">From the Halastudy desk<\/h1>/);
    assert.match((await server.request('/en/contact')).body, /<h1 data-lang="heading">Contact Halastudy<\/h1>/);
    assert.match((await server.request('/contact')).body, /href="https:\/\/wa.me\/966599161315"/);
    const article = (await server.request('/blog/study-with-me-online-arabic')).body;
    assert.doesNotMatch(article, /hreflang=/, 'Arabic-only articles do not claim an English translation');
    assert.doesNotMatch(article, /"@type": "FAQPage"/);
    assert.match(article, /<details>/, 'visible FAQ content remains');
    assert.match((await server.request('/blog/best-online-group-study-rooms-saudi')).body, /id="sources-heading"/);
    for (const name of ['privacy', 'terms']) {
        const approved = fs.readFileSync(path.resolve(__dirname, `../../${name}.html`), 'utf8');
        const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        for (const language of ['ar', 'en']) {
            const section = new RegExp(`<section lang="${language}"[^>]*>([\\s\\S]*?)<\\/section>`);
            const served = (await server.request(`${language === 'en' ? '/en' : ''}/${name}`)).body;
            assert.equal(plain(served.match(section)[1]), plain(approved.match(section)[1]), `${name} ${language}: approved text preserved`);
        }
    }
});
