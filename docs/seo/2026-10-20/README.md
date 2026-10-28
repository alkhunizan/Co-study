# Halastudy SEO structure — 20 October 2026

Implementation is local on `feat/seo-structure-2026-10-20`. No deployment, Search Console submission,
indexing request or paid service was performed. The existing hardening release gates still apply.

## Live findings and fixes

| Live finding | Local fix |
|---|---|
| `/robots.txt` and `/sitemap.xml` return 404 | Crawl directives and an XML sitemap generated from the public-page catalog |
| Article social-image URLs return 404 | Both existing, visually checked 1200 × 630 covers are included in the release |
| `/blog.html`, `/blog/` and legal aliases serve duplicate pages | Permanent redirects to lowercase, extensionless canonical paths, preserving query strings |
| `http://halastudy.com/` already redirects to HTTPS, but `https://www.halastudy.com/` returns 200 | One-hop canonical-host redirects for known public pages, combined with path normalization |
| Several public pages lack canonical/social metadata | Consistent canonical, description, Open Graph, Twitter and language metadata |
| English content depends on browser JavaScript/preferences | `/en`, `/en/blog` and `/en/contact` contain English content in their initial HTML |
| Account, room and workspace URLs have no indexing header | `X-Robots-Tag: noindex, nofollow`; private workflows are absent from the sitemap |
| Contact number is a telephone link; WhatsApp is only a share button | Public bilingual contact pages and explicit WhatsApp support links; email remains `info@halastudy.com` |
| Public captions and some dark-mode controls fail contrast checks | Readable public-page ink colors and dark-mode button/link colors |
| Article comparison tables cannot receive keyboard focus | Named, focusable scroll regions with a visible focus indicator |

The published article slugs are already descriptive and readable, so they were retained:

- `/blog/best-online-group-study-rooms-saudi`
- `/blog/study-with-me-online-arabic`

Changing them solely for cosmetic reasons would introduce a migration without a clear user benefit.
Google recommends readable, logically organized URLs and consistent canonical signals.
[URL guidance](https://developers.google.com/search/docs/crawling-indexing/url-structure) ·
[Canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

## Public URL structure

| Purpose | Arabic / existing URL | English URL |
|---|---|---|
| Home | `/` | `/en` |
| Blog index | `/blog` | `/en/blog` |
| Contact | `/contact` | `/en/contact` |
| Privacy | `/privacy` — bilingual document | Same document |
| Terms | `/terms` — bilingual document | Same document |
| Comparison guide | `/blog/best-online-group-study-rooms-saudi` | No translation claimed |
| Getting-started guide | `/blog/study-with-me-online-arabic` | No translation claimed |

Ten public URLs are included in the sitemap. True language pairs have self-canonicals and reciprocal
`ar`, `en` and `x-default` alternates. Language switches are ordinary links and work without JavaScript.
The URL controls the marketing-page language; browser storage still carries preferences into the
application. No language/IP detection redirects were introduced. Article text remains Arabic, and
the English blog index explicitly describes its links as Arabic articles.
[Google multilingual guidance](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)

`/open`, `/account`, `/study`, `/room`, `/workspace`, `/lobby`, `/app`, `/plans`, `/supervisor` and recovery
remain functional application routes, excluded from search. Their existing utility aliases remain
functional to preserve room links and authentication flows. Robots rules allow crawlers to read the
HTML noindex headers; API/auth/socket endpoints are disallowed. Indexing controls are not access control.

## Implementation

- `services/seo/public-pages.js`: explicit routing/catalog, redirects, sitemap/robots, server rendering,
  canonical/social metadata, Organization/WebSite/WebPage/CollectionPage/ContactPage structured data.
- `public/js/marketing-copy.js`: shared server/browser dictionaries for marketing copy.
- `contact.html`: email, telephone, WhatsApp and the existing public operator identity.
- Article and BreadcrumbList data remain available. Visible FAQ sections remain, while FAQPage markup
  is omitted from the served HTML: Google retired FAQ rich results on May 7, 2026.
  [Google changelog](https://developers.google.com/search/updates#may-2026)
- Comparison pages link to verified official Study Together, StudyStream and Focusmate sources,
  disclose that Halastudy is included in its own comparison, and provide a publisher/correction contact.
- No fabricated reviews, ratings, prices, author credentials or search functionality were added.
  Existing article dates were retained; sitemap `lastmod` is omitted rather than invented.
- Templates are read and rendered once per server start. New content requires a normal application
  restart. Responses revalidate privately because existing session middleware can set cookies.
- Canonical origin is explicitly `https://halastudy.com`; request Host headers cannot poison metadata.

Both article files were already modified before this task. Their exact initial contents and covers
were saved under `evidence/baseline/` and retained in checkpoint `e4ab7c4`; this task did not overwrite
their source text. The rendered pages add SEO/accessibility/source details through the public renderer.
Live-content comparison found no removed paragraph blocks in the comparison article; three paragraphs
in the getting-started article had already been condensed into the existing duration cards. These
pre-existing revisions were preserved rather than replacing them with an older Git version.

Implementation commits: `e4ab7c4` (existing article/cover checkpoint), `976532c` (SEO structure),
`685e636` (canonical host). Final runtime candidate: `685e636`.

## Verification

Evidence is local and excluded from Git under `evidence/`.

- `live-before.json`: live statuses, canonicals and indexing headers.
- `live-hosts.json`: HTTP and www behavior before deployment.
- `blog-live-parity.json`: live/local article hashes and content comparison.
- `seo-final.txt`: canonical pages, JSON-LD, image formats/dimensions, redirects, language pairing,
  application noindex, real 404s and the reusable SEO verification command.
- `browser-focused-final/`: seven desktop/tablet/mobile views, light/dark themes, Arabic/English,
  JavaScript-disabled journeys and WCAG A/AA checks. Viewport images were visually reviewed.
- Earlier failing logs/screenshots remain as evidence. They led to corrected URL assertions,
  caption/button contrast and keyboard-scroll fixes.
- Final runtime was tested from a clean `git archive` of `685e636`, with the unchanged, frozen
  dependency tree and Node 22.23.3. Archive and lockfile hashes are in `release-manifest.json`.
- Syntax, TypeScript checking, ESLint and dead-code checks passed (`release-*.txt`).
- The complete integration suite passed: **113 tests, zero failures, cancellations or skips**.
- The first final browser run hit an intermittent failure in the existing camera-blur test:
  the preview track disappeared after camera startup. Its trace confirms successful camera
  capture and blur initialization, but does not establish why the track was subsequently cleared.
  The same test passed in the preceding full run and passed immediately when rerun alone
  (`release-camera-rerun.txt`). No camera code or assertion timeout was changed for this SEO work.
  The failed trace and screenshot remain under `release-browser/`.
- A complete rerun against the same unchanged archive passed **all 34 browser tests** in 3.3 minutes
  (`release-browser-rerun.txt`), including camera teardown and the new SEO/accessibility journey.
  The intermittent camera failure remains documented for monitoring; a passing rerun does not
  establish its root cause.

## Publishing and ongoing workflow

1. Deploy this candidate through the normal release process, retaining both article cover files.
2. Run `npm run verify:seo -- https://halastudy.com`. This is a read-only check of sitemap pages,
   canonical/social metadata, image responses, redirect behavior, noindex and a genuine 404.
3. Confirm that the hosting/CDN forwards the new routes to Node, and verify www public-page redirects
   plus reciprocal language links on the actual domain.
4. Submit `https://halastudy.com/sitemap.xml` in the verified Google Search Console property, then inspect
   the canonical homepage, language variants and both articles. No submission was made while the
   live sitemap still returns 404.
5. Monitor indexing, search queries and field Core Web Vitals after release. Search Console access,
   indexed URL counts, ranking changes and field performance were not available in this local audit.

For each future article: choose one stable descriptive slug, add it to `POSTS`, supply a real title/
description and approved image, add visible blog-index cards and English summaries, retain genuine
publication/update dates, and link relevant existing guides. Add language alternates only after a
complete translated page exists. Run integration/browser checks and `verify:seo` before publication.

No new dependencies were added; the dependency lockfile is unchanged. Free membership, the one
USD 4.99/month VIP tier and test-only checkout were not changed.
