const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2]);
const runtime = path.resolve(__dirname, '../repository');
const requireProject = createRequire(path.join(runtime, 'package.json'));
const { chromium } = requireProject('playwright');
const AxeBuilder = requireProject('@axe-core/playwright').default;
const source = path.join(root, 'review.html');
const html = fs.readFileSync(source, 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]);
const missing = refs.filter(ref => {
    if (ref.startsWith('#')) return !html.includes(`id="${ref.slice(1)}"`);
    if (/^[a-z]+:/i.test(ref)) return false;
    return !fs.existsSync(path.resolve(root, decodeURIComponent(ref.split('#')[0])));
});
if (missing.length) throw new Error('Missing local review links: '+missing.join(', '));
const markdownLinks = ['HANDOFF.md', 'VERIFICATION.md', 'RUN.md'].flatMap(name => {
    const body = fs.readFileSync(path.join(root, name), 'utf8');
    return [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => ({ from: name, target: match[1] }));
});
const missingMarkdown = markdownLinks.filter(({ target }) => !/^[a-z]+:/i.test(target) && !target.startsWith('#') && !fs.existsSync(path.resolve(root, decodeURIComponent(target.split('#')[0]))));
if (missingMarkdown.length) throw new Error('Missing handoff links: '+JSON.stringify(missingMarkdown));
const out = path.join(root, 'review-check');
fs.mkdirSync(out, { recursive: true });
(async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    const records = [];
    try {
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 960 } });
            const external = [];
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (['file:', 'data:'].includes(url.protocol)) return route.continue();
                external.push(url.hostname);
                return route.abort();
            });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(pathToFileURL(source).href);
            await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
            await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
            const geometry = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                sections: document.querySelectorAll('main section').length,
                images: document.images.length,
                missingAlt: [...document.images].filter(image => !image.alt.trim()).length,
            }));
            const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
            const violations = audit.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
            await page.screenshot({ path: path.join(out, `review-${width}.png`), fullPage: false });
            const record = { width, ...geometry, external, errors, violations };
            records.push(record);
            await context.close();
            if (geometry.overflow || geometry.sections !== 8 || geometry.missingAlt || external.length || errors.length || violations.length) throw new Error('Review failed at '+width+': '+JSON.stringify(record));
        }
    } finally {
        await browser.close();
        fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ at: new Date().toISOString(), htmlSha256: crypto.createHash('sha256').update(html).digest('hex'), checkedLinks: refs.length, checkedMarkdownLinks: markdownLinks.length, missing, missingMarkdown, records }, null, 2));
    }
    console.log(JSON.stringify({ checkedLinks: refs.length, checkedMarkdownLinks: markdownLinks.length, records }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
