const assert = require('node:assert/strict');
const test = require('node:test');
const { startServer } = require('../helpers/server-control');

test('public footers keep one support email even when the article contains it', async (t) => {
    const server = await startServer(); t.after(() => server.stop());
    for (const route of ['/', '/en', '/privacy', '/en/privacy', '/terms', '/en/terms', '/contact', '/en/contact', '/blog', '/en/blog']) {
        const response = await server.request(route);
        assert.equal(response.status, 200, route);
        const footer = response.text.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i)?.[0];
        assert.ok(footer, route);
        assert.equal([...footer.matchAll(/href="mailto:info@halastudy.com"/g)].length, 1, route);
        if (route.endsWith('/privacy')) assert.match(response.text.replace(footer, ''), /href="mailto:info@halastudy.com"/);
    }
});
