# Changelog

All notable Halastudy changes, newest first.
Versions follow `MAJOR.MINOR.PATCH.MICRO`; dates are `YYYY-MM-DD`.

## [1.1.0.0] - 2026-06-10

### Added
- Editorial landing page at `/` — six looping cam clips in a hero mosaic, steps, room preview, community row, and a city marquee, fully bilingual (AR default, EN toggle) with RTL parity.
- `/open.html` (also `/open`) — the room create/join page, carrying the full create, password, schedule, and join flows out of the old landing.
- An honest "Illustrative preview / عرض توضيحي" label on the animated live counter and community stats.
- DST-correct city clocks driven by IANA time zones.
- HSTS in the production Nginx config.
- 18 integration tests and 12 browser smoke tests, including the protected-room password handoff, deep-link joins, storage migration, theme/language persistence, and reduced-motion behavior.

### Changed
- Security headers now allow-list the SFU origin from `SFU_BASE_URL`, so camera and microphone delegation works inside cross-origin SFU rooms; CSP `connect-src`/`frame-src` no longer allow arbitrary hosts.
- Nickname and chat sanitizers strip control, zero-width, and bidi-override characters and truncate by code points, so invisible names, RTL spoofing, and split emoji can't reach other participants or disk.
- Media mounts send cache headers; the design-system mount serves stylesheets only (internal docs are no longer publicly fetchable); raw hero source footage is never served.
- Hero clips pause while offscreen and page tickers idle in hidden tabs, cutting battery and CPU cost on mobile.
- The topbar is solid paper with a hairline divider (design-contract §10) instead of glass blur.

### Fixed
- Creating or joining a password-protected room from `/open.html` now hands the password to the workspace — previously every creator was re-prompted because the pages disagreed on storage keys.
- Saved nicknames restore again in the workspace (legacy storage-key read).
- Mouse-wheel and keyboard scrolling work on `/open.html` — leftover full-page-scroller code was swallowing wheel, Space, and arrow keys.
- Room codes render left-to-right in the Arabic UI on `/open.html`.
- The closing lamp glow and footer hairline center correctly in RTL.
- Arabic copy uses Western digits for clocks, durations, and counts per the numeral contract; brand transliteration unified to «هلاستدي».

### Removed
- Dead full-page pager machinery, 52 orphaned translation entries, scatter-era CSS, an unused Enter-key hint, and a stale landing backup file.
