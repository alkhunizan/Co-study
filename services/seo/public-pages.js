const fs = require('node:fs');
const path = require('node:path');
const copy = require('../../public/js/marketing-copy');

const ORIGIN = 'https://halastudy.com';
const IMAGE = '/videos/hero/01-nouf-abdulaziz-poster.jpg';
const POSTS = [
    { path: '/blog/best-online-group-study-rooms-saudi', file: 'blog-best-study-rooms.html' },
    { path: '/blog/study-with-me-online-arabic', file: 'blog-study-with-me.html' }
];
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const organization = {
    '@type': 'Organization', '@id': `${ORIGIN}/#organization`, name: 'Halastudy',
    alternateName: 'هلاستدي', url: `${ORIGIN}/`, email: 'info@halastudy.com',
    telephone: '+966599161315', logo: `${ORIGIN}/images/icons/favicon-512.png`,
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support',
        email: 'info@halastudy.com', telephone: '+966599161315', availableLanguage: ['ar', 'en'] }
};

// This allowlist is the routing, canonical and sitemap source of truth.
function createPublicPages(root) {
    const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
    /** @type {Array<{path: string, file: string, kind: string, lang: string, alternate?: string, title?: string, description?: string}>} */
    const pages = [
        { path: '/', file: 'landing.html', kind: 'home', lang: 'ar', alternate: '/en',
            title: copy.home.ar.pageTitle, description: 'غرف مذاكرة وتركيز أونلاين للطلاب في السعودية والخليج. ذاكر أو اشتغل مع غيرك في غرفة هادئة، واستخدم مؤقت التركيز وشارك رابط غرفتك.' },
        { path: '/en', file: 'landing.html', kind: 'home', lang: 'en', alternate: '/',
            title: copy.home.en.pageTitle, description: 'Study or work alongside others in quiet online focus rooms. Halastudy brings students in Saudi Arabia and the Gulf together with room links and focus timers.' },
        { path: '/blog', file: 'blog.html', kind: 'blog', lang: 'ar', alternate: '/en/blog',
            title: copy.blog.ar.pageTitle, description: 'أدلة عربية لاختيار غرف المذاكرة الأونلاين، بدء جلسات التركيز، وفهم المرافقة بالوجود. اقرأ مقارنات ونصائح عملية في مدونة هلاستدي.' },
        { path: '/en/blog', file: 'blog.html', kind: 'blog', lang: 'en', alternate: '/blog',
            title: copy.blog.en.pageTitle, description: 'Browse Halastudy’s Arabic guides to online study rooms, body doubling and focused study. English summaries help you choose what to read.' },
        { path: '/contact', file: 'contact.html', kind: 'contact', lang: 'ar', alternate: '/en/contact',
            title: 'تواصل معنا | هلاستدي', description: 'تواصل مع فريق هلاستدي عبر info@halastudy.com أو الهاتف أو واتساب. معلومات التواصل لخدمة غرف المذاكرة والتركيز في الرياض.' },
        { path: '/en/contact', file: 'contact.html', kind: 'contact', lang: 'en', alternate: '/contact',
            title: 'Contact Us | Halastudy', description: 'Contact Halastudy by email at info@halastudy.com, phone or WhatsApp. Support for our online study and focus rooms, based in Riyadh.' },
        ...['privacy', 'terms'].map((name) => ({
            path: `/${name}`, file: `${name}.html`, kind: 'legal', lang: 'ar'
        })),
        ...POSTS.map((post) => ({ ...post, kind: 'article', lang: 'ar' }))
    ];
    return pages.map((page) => {
        const html = read(page.file);
        return { ...page, title: page.title || html.match(/<title>([^<]+)<\/title>/)?.[1],
            description: page.description || html.match(/<meta name="description" content="([^"]+)"/)?.[1],
            image: html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || `${ORIGIN}${IMAGE}`,
            html };
    });
}

function translate(html, dict) {
    if (!dict) return html;
    // Only trusted, explicitly marked text-only template nodes are translated.
    return html.replace(/<([a-z][a-z0-9-]*)\b([^>]*\bdata-(?:i18n|lang)="([^"]+)"[^>]*)>[\s\S]*?<\/\1>/gi,
        (whole, tag, attrs, key) => typeof dict[key] === 'string'
            ? `<${tag}${attrs}>${escapeHtml(dict[key])}</${tag}>` : whole)
        .replace(/<([a-z][a-z0-9-]*)\b([^>]*\bdata-(?:tile|preview)-name="(\d+)"[^>]*)>[^<]*<\/\1>/gi,
            (whole, tag, attrs, index) => {
                const names = attrs.includes('data-tile-name') ? dict.tileNames : dict.previewNames;
                return names?.[index] ? `<${tag}${attrs}>${escapeHtml(names[index])}</${tag}>` : whole;
            });
}

function renderPage(page, pages) {
    const url = ORIGIN + page.path;
    const english = page.lang === 'en';
    const home = english ? '/en' : '/';
    const blog = english ? '/en/blog' : '/blog';
    const contact = english ? '/en/contact' : '/contact';
    let html = translate(page.html, copy[page.kind]?.[page.lang]);
    html = html.replace(/<html\b[^>]*>/, `<html lang="${page.lang}" dir="${english ? 'ltr' : 'rtl'}" data-theme="light" data-route-lang="${page.lang}">`);
    html = html.replace(/<title>[\s\S]*?<\/title>|<meta\b[^>]*(?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>|<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>/gi, '');
    const alternates = page.alternate ? [
        `<link rel="alternate" hreflang="ar" href="${ORIGIN}${english ? page.alternate : page.path}">`,
        `<link rel="alternate" hreflang="en" href="${ORIGIN}${english ? page.path : page.alternate}">`,
        `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${english ? page.alternate : page.path}">`
    ].join('\n') : '';
    const metadata = `<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
${alternates}
<meta property="og:type" content="${page.kind === 'article' ? 'article' : 'website'}">
<meta property="og:site_name" content="Halastudy">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${english ? 'en_US' : 'ar_SA'}">
<meta property="og:image" content="${page.image}">
${page.image.includes('/images/og/') ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ''}
<meta property="og:image:alt" content="${escapeHtml(page.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(page.title)}">
<meta name="twitter:description" content="${escapeHtml(page.description)}">
<meta name="twitter:image" content="${page.image}">`;
    html = html.replace('</head>', `${metadata}\n</head>`);
    html = html.replace(/href="\/(?:blog|contact)?"/g, (match) =>
        match === 'href="/blog"' ? `href="${blog}"` : match === 'href="/contact"' ? `href="${contact}"` : `href="${home}"`);
    if (page.alternate) {
        html = html.replace(/<button([^>]*data-lang-value="(ar|en)"[^>]*)>([\s\S]*?)<\/button>/g,
            (_whole, attrs, lang, label) => `<a${attrs.replace(/type="button"|\sclass="is-on"/g, '')} href="${lang === page.lang ? page.path : page.alternate}" lang="${lang}" hreflang="${lang}"${lang === page.lang ? ' class="is-on" aria-current="page"' : ''}>${label}</a>`);
        html = html.replace('role="tablist"', 'role="navigation"');
    }
    html = html.replace(/href="\/(open|account|lobby)\.html/g, 'href="/$1');
    const contactLinks = `<a href="${contact}">${english ? 'Contact us' : 'تواصل معنا'}</a>
<a href="https://wa.me/966599161315" target="_blank" rel="noopener">${english ? 'WhatsApp support' : 'تواصل عبر واتساب'}</a>`;
    html = html.replace('</footer>', `${contactLinks}\n</footer>`);
    if (page.kind === 'article') {
        html = html.replace(/<div class="table-wrap">/g,
            '<div class="table-wrap" tabindex="0" role="region" aria-label="جدول المقارنة">');
        // Google retired FAQ rich results in May 2026. Keep visible answers,
        // and retain the useful Article and BreadcrumbList structured data.
        html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, json) =>
            JSON.parse(json)['@type'] === 'FAQPage' ? '' : whole);
        const sources = page.path === POSTS[0].path ? `<section aria-labelledby="sources-heading">
<h2 id="sources-heading">روابط المصادر</h2>
<ul>
<li><a href="https://www.studytogether.com/">Study Together: إعلان الانضمام إلى StudyStream وأرقام المجتمع المنشورة</a></li>
<li><a href="https://www.studystream.live/">StudyStream: غرف التركيز والموقع الرسمي</a></li>
<li><a href="https://www.focusmate.com/">Focusmate: الجلسات الفردية وكيف تعمل الخدمة</a></li>
</ul>
<p>هذه المقارنة منشورة على موقع هلاستدي وتشمل خدمتنا. الاختيار الأنسب يعتمد على احتياجك، وقد تتغير خصائص الخدمات الأخرى.</p>
</section>` : '';
        html = html.replace('</article>', `${sources}<p>الناشر: <a href="/contact">هلاستدي</a> · <a href="mailto:info@halastudy.com">للاستفسار أو طلب تصحيح</a></p>\n</article>`);
    }
    if (page.kind !== 'article') {
        const webPage = {
            '@type': page.kind === 'blog' ? 'CollectionPage' : page.kind === 'contact' ? 'ContactPage' : 'WebPage',
            '@id': `${url}#webpage`, url, name: page.title, description: page.description, inLanguage: page.lang,
            isPartOf: { '@id': `${ORIGIN}/#website` }, publisher: { '@id': organization['@id'] }
        };
        const graph = [organization, { '@type': 'WebSite', '@id': `${ORIGIN}/#website`,
            url: `${ORIGIN}/`, name: 'Halastudy', alternateName: 'هلاستدي', publisher: { '@id': organization['@id'] } }, webPage];
        if (page.kind === 'blog') graph.push(/** @type {any} */ ({
            '@type': 'ItemList', itemListElement: pages.filter((item) => item.kind === 'article').map((item, index) => ({
                '@type': 'ListItem', position: index + 1, url: ORIGIN + item.path, name: item.title
            }))
        }));
        html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify({
            '@context': 'https://schema.org', '@graph': graph
        }).replace(/</g, '\\u003c')}</script>\n</head>`);
    }
    return html;
}

function registerPublicPages(app, root) {
    const pages = createPublicPages(root);
    const byPath = new Map(pages.map((page) => [page.path, page]));
    const rendered = new Map(pages.map((page) => [page.path, renderPage(page, pages)]));
    const aliases = { '/landing.html': '/', '/blog.html': '/blog', '/privacy.html': '/privacy', '/terms.html': '/terms' };
    app.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) return next();
        const normalized = req.path.toLowerCase().replace(/\/+$/, '') || '/';
        const destination = aliases[normalized] || (byPath.has(normalized) ? normalized : null);
        const canonicalHost = req.hostname?.toLowerCase() === 'www.halastudy.com';
        if (destination && (req.path !== destination || canonicalHost)) {
            const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
            return res.redirect(301, (canonicalHost ? ORIGIN : '') + destination + query);
        }
        next();
    });
    app.get('/robots.txt', (_req, res) => res.type('text/plain').send(
        `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nDisallow: /socket.io/\nSitemap: ${ORIGIN}/sitemap.xml\n`));
    app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((page) =>
            `  <url><loc>${ORIGIN}${page.path}</loc></url>`).join('\n')}\n</urlset>`));
    for (const page of pages) app.get(page.path, (_req, res) => {
        res.setHeader('Content-Language', page.lang);
        // The shared session middleware may set a cookie on first visit.
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
        res.type('html').send(rendered.get(page.path));
    });
}

module.exports = { registerPublicPages };
