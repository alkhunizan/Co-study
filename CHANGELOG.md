# Changelog

All notable Halastudy changes, newest first.
Versions follow `MAJOR.MINOR.PATCH.MICRO`; dates are `YYYY-MM-DD`.

## [1.2.0.0] - 2026-07-04

### Added
- **Optional accounts** — email + password sign-up at `/account.html` (bilingual, RTL-first). Guests keep full instant create/join; signing in unlocks: server-synced focus minutes + Riyadh-day streaks (with one-time import of the device's local stats), a My Rooms list with one-click rejoin, a reserved nickname prefilled everywhere, and profile perks (6 muted avatar accents shown as tile rings + chat dots, short bio, streak badge). Scheduled-room creation now requires an account so attendance and streaks attach to a real identity; a quiet gate panel in the create form explains why.
- **Local user store** (`user-store.js`, `data/users.json`) mirroring the rooms pattern: debounced atomic writes, strict fail-fast load, full re-sanitization at the trust boundary. Auth is dependency-free: PBKDF2-SHA512 passwords, stateless HMAC-signed cookies with per-user epoch revocation, login lockout keyed `ip:email` with no account enumeration.
- **Hidden admin ops console** at the env-secret `ADMIN_PATH` (requires `ADMIN_PASSWORD_HASH`; both unset → the path 404s like any other). Live overview, room inspect/force-close/kick, runtime video kill-switch, user ban/unban (kills live sessions instantly), bilingual site-wide broadcast banner, backup-now, recent-errors view. `npm run admin:hash` generates the password hash.
- **Pro-level plumbing** — `GET /api/metrics` for uptime monitors; automated rooms+users backups with retention (`BACKUP_INTERVAL_MINUTES`); a redacted in-memory error ring buffer; a bilingual 404 page (JSON for `/api/*`); a PWA manifest + icon set; shared `halastudy-core.js` (storage migration, pre-paint theme, lang engine, auth cache) and `ui.js` (toasts, accessible `<dialog>` confirms with typed confirmation, avatar chip) replacing per-page boilerplate.
- 24 new integration tests (auth + admin suites) and hardened harness (per-server temp user state, cookie jar, fixed test `SESSION_SECRET`).

### Changed
- `SESSION_SECRET` is now required in production (startup fails without it).
- The privacy page documents optional accounts and the self-serve, immediate delete-my-data flow (`/account.html#delete`).
- The in-room theme toggle now persists across visits (was per-session).
- The join-overlay book emoji is a Lucide line icon (design contract §10).

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
