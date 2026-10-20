// Read-only acceptance check; usable against a local candidate or deployed site.
const assert = require('node:assert/strict');
const CANONICAL_ORIGIN = 'https://halastudy.com';

async function main() {
    assert.ok(process.argv[2], 'Usage: npm run verify:seo -- <base-url>');
    const base = new URL(process.argv[2]);
    assert.ok(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)),
        'Use HTTPS, or HTTP on loopback for local verification.');
    const read = async (pathname) => {
        assert.ok(pathname.startsWith('/') && !pathname.startsWith('//'));
        const response = await fetch(new URL(pathname, base.origin), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        const body = await response.text();
        return { response, body };
    };
    const robots = await read('/robots.txt');
    assert.equal(robots.response.status, 200, 'robots.txt');
    assert.match(robots.body, /Sitemap: https:\/\/halastudy.com\/sitemap.xml/);
    const sitemap = await read('/sitemap.xml');
    assert.equal(sitemap.response.status, 200, 'sitemap.xml');
    const locations = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.ok(locations.length > 0 && locations.length <= 100, 'Expected a bounded public-page sitemap');
    assert.equal(new Set(locations).size, locations.length, 'Duplicate sitemap entries');
    const images = new Set();
    for (const location of locations) {
        const canonical = new URL(location);
        assert.equal(canonical.origin, CANONICAL_ORIGIN, 'Unexpected sitemap origin');
        const { response, body } = await read(canonical.pathname);
        assert.equal(response.status, 200, canonical.pathname);
        assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/i);
        assert.ok(body.includes(`rel="canonical" href="${location}"`), `Canonical mismatch: ${canonical.pathname}`);
        assert.equal([...body.matchAll(/rel="canonical"/g)].length, 1);
        assert.match(body, /<meta name="description" content="[^"]+"/);
        assert.match(body, /<h1\b/);
        const schemas = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
        assert.ok(schemas.length, `Missing schema: ${canonical.pathname}`);
        for (const schema of schemas) JSON.parse(schema[1]);
        const image = body.match(/property="og:image" content="([^"]+)"/)?.[1];
        assert.ok(image, `Missing social image: ${canonical.pathname}`);
        images.add(image);
    }
    for (const location of images) {
        const image = new URL(location);
        assert.equal(image.origin, CANONICAL_ORIGIN, 'Unexpected image origin');
        const response = await fetch(new URL(image.pathname, base.origin), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        await response.body?.cancel();
        assert.equal(response.status, 200, image.pathname);
        assert.match(response.headers.get('content-type'), /^image\//);
    }
    for (const [from, to] of [['/blog.html', '/blog'], ['/privacy.html', '/privacy'], ['/terms/', '/terms'], ['/EN/', '/en']]) {
        const { response } = await read(from);
        assert.equal(response.status, 301, from);
        assert.equal(response.headers.get('location'), to);
    }
    for (const route of ['/account', '/open', '/study', '/app', '/recover']) {
        const { response } = await read(route);
        assert.equal(response.status, 200, route);
        assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
    }
    assert.equal((await read('/blog/seo-check-not-a-real-post')).response.status, 404);
    console.log(`SEO verified: ${locations.length} canonical public pages, ${images.size} social images, redirects, noindex and real 404.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
