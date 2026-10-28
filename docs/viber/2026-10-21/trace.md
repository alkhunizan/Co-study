# Viber phase 3 trace — 2026-10-21

Scope: read-only static trace of the current UNC working tree, including pre-existing dirty DigetPay and deep-UX work. Baseline: `evidence/baseline-status.txt`. No app edits, processes, tests, provider requests, production requests, credentials, or secret values were used. This report is source evidence, not a runtime pass or a production decision.

## Surface denominator

There are 101 explicit HTTP GET/POST/PATCH/DELETE registration statements across seven routing files. One is the public-page loop, now expanding to 12 public pages, yielding 112 HTTP handler registrations (route arrays remain one registration; implicit Express HEAD is not double-counted). Of these, 90 are API/auth method-pattern registrations, plus one legacy admin HTML handler; 14 are public HTML/robots/sitemap handlers, six are application HTML route-array handlers, and one serves the manifest. The 14 named client socket events and one disconnect lifecycle listener are separately inventoried. These counts describe reachability, not 112 exercised routes.

Risky surface denominator: 90 API/auth registrations + 14 client socket event names = 104 boundary units for runtime probe planning. Static guards were checked by route group; per-route runtime coverage must come from parent phase 4, not inferred here. The appendix enumerates each registration and source line.

Public pages: `/`, `/en`, `/blog`, `/en/blog`, `/contact`, `/en/contact`, `/privacy`, `/en/privacy`, `/terms`, `/en/terms`, `/blog/best-online-group-study-rooms-saudi`, `/blog/study-with-me-online-arabic`; plus `/robots.txt`, `/sitemap.xml`. Public allowlist in `services/seo/public-pages.js:23` is authoritative. This is **12 pages**, superseding the earlier SEO run's 10-page inventory.

Application HTML aliases: `/open.html`, `/open`; `/app`, `/plans`, `/supervisor`; `/account.html`, `/account`; `/recover`, `/recovery.html`; `/index.html`, `/study`, `/workspace`, `/room`; `/lobby`, `/lobby.html`. Legacy admin HTML/API is conditional under configured admin path. Google routes are conditional on enabled OAuth configuration. Platform endpoints return 503 when disabled. No root static directory is exposed: explicit mounts are `/audio`, `/images`, `/videos`, `/js`, `/css`, CSS-only `/design-system`; `/videos/hero/source` is explicitly denied (`co-study-server.js:1753-1766`). Socket.IO's transport/client bundle is a framework surface additional to named application events.

## Findings / concrete probe candidates

1. **T1 — medium, static-confirmed resource bound missing: shared task board grows without a count ceiling.** `co-study-server.js:2698-2726` validates text length and per-session rate but unconditionally pushes another task, then clones/broadcasts the whole board and schedules persistence. `ensureRoomBoard` at `:541-552` normalizes every element without a count ceiling; persisted restore at `:1323` also accepts the entire array. Contrast: chat is capped at 80 and reports at 50. A joined guest can accumulate work and progressively amplify each board mutation/snapshot. This is not a claim of demonstrated outage. Probe: local bounded repeated additions through a real socket, verify an explicit limit/rejection and existing tasks survive; test restore of an over-limit board; add an appropriate limit consistently at mutation and deserialization boundaries.

2. **T2 — low, static-confirmed signout failure is hidden on legacy admin.** `admin.html:332-334` discards POST logout failure and reloads unconditionally. Startup probes the overview and can restore the still-authenticated shell. This is a silent failed action, **not** evidence that the server revoked no cookie on a successful logout, or that the UI stays falsely signed out. Probe: intercept logout with a local 503/offline failure; keep operator in context, show retryable error, and only reload once revocation is acknowledged. Handler authorization and cookie revocation at `services/admin/admin-routes.js:142` remain present.

3. **T3 — sandbox operational limitation, not a newly proven security defect:** ambiguous payment creation intentionally enters `unknown` (`services/platform/digetpay-billing.js:64-67`) and blocks new charge intents. The periodic scan only considers known-session pending/completed/review/expired rows (`:169-173`), so unknown creates without a stored session require independent provider evidence/manual support. Current staff subscriptions and operations routes expose subscriptions/alerts/media but no unknown-order resolution UI (`services/platform/routes.js:239-242`, `:293-300`). This is a safe charge-prevention posture with a recovery gap; do not enable real billing or promise self-service resolution. Probe/create-timeout scenario and document the operational recovery prerequisite; never add blind POST retries.

## Refuted / dropped candidates (6)

- Unsigned DigetPay webhook granting membership: refuted. It enqueues identifiers only; server-to-server status lookup binds amount/order/transaction before DB grant (`digetpay-billing.js:137-149`, `digetpay-client.js:80-110`). Session lookup permits omitted provider currency/reference only against the exact stored session; transaction lookup requires both. Real provider contract remains unverified, not exploitable by merely posting success fields.
- Live checkout accidentally available: refuted. Client enable requires non-production + explicit sandbox/USD/lookup/key/origin configuration (`digetpay-client.js:17-21`); production platform mode is live while order rows are constrained to test. No live charge code path.
- Changing client focus duration can award arbitrary XP: refuted. Server computes elapsed heartbeat credit, grace/max duration and daily cap under account transaction/lock (`progress.js:6-69`); displaySeconds is visual only (`focus-client.js:43-46`).
- Removed circle member retains access just because their socket was already joined: refuted by synchronous disconnection after mutation (`routes.js:108-113`), leave disconnection (`:126-129`), and per-packet account/cohort checks (`co-study-server.js:2321-2342`). Provider-side effectiveness still requires runtime/external validation.
- Returning dashboard bypasses password or private cohort checks: refuted. It uses `platform.canJoin` for suggestions (`dashboard.js:9,25`) and returns a passwordProtected hint; entry still uses the full join authorization/password path.
- Optional UX insights secretly transmitting telemetry: refuted by complete `public/js/ux-insights.js` read. Opt-in, seven-day bounded localStorage counters with allowlisted buckets; no network transport, raw IDs, URLs, or persisted transition identifiers. Its existence must not be confused with server analytics.

Dropped/refuted: **6**. Active static code findings: **2** (T1,T2). Documented sandbox capability limitation: **1** (T3). App fixes made by this trace agent: **0**.

## Critical flow map and failure-to-screen trace

`WORKS (static)` below means matching source contracts and reachable failure UI were found; it is not a runtime success claim.

- **Account/signup/login/profile/delete — WORKS (static), production mail MISSING.** `account.html:545-570,675-721` uses shared JSON helper; `halastudy-core.js:144-174` checks response shape/non-2xx and throws structured codes, with 15-second abort; buttons restore state in client handlers. `auth-routes.js:84-170` validates/rate-limits/hashes and persists before cookie; `:45-80` serializes mutations and rolls back affected fields on failed persistence. Logout flushes revocations before success (`:172-183`). Delete reauth/epoch/persistence path at `:278-325`; platform purge prevents last-super-admin removal, archives owned circles, scrubs cases/audit identity and cascades user rows (`platform/index.js:87-108`; migration FKs). Probe storage-failure rollback and old-cookie rejection; do not infer from this trace that a live PDPL request is complete across backups/external services.
- **OAuth — WORKS (static), external identity UNVERIFIED.** `google-routes.js:69-95` generates browser-bound state + PKCE, bounds pending requests; `:98-214` validates state, single-use pending flow, verified email+subject, and refuses email-only linking without an existing account session. Token/userinfo non-2xx redirect with visible auth failure query. OAuth rate-limit returns JSON, not a styled account error; low-priority failure-page UX probe. No external Google calls were made.
- **Recovery — WORKS local (static), production service MISSING by design.** `auth/recovery.js:12` disallows local mail in production; request always 202 for eligible-looking requests, hashed token/epoch/email/expiry checked again inside mutation queue at `:76-115`. UI removes token from URL, clears password fields, displays expired/used/rate-limit/unavailable states (`public/js/recovery.js:5-9,102-123`). Probe used link, invalid purpose, refresh, resend, persisted failure, non-enumeration. Expired-link screen says request a new link but retaining old form should be checked for a clear recovery action.
- **Create/join room — WORKS guards (static), durability/async failure UNVERIFIED.** `open.html:1256-1287` checks runtime/room fetch status; socket create/join responses map to user messages. Server `:2359-2443` validates room/schedule/media, authorizes scheduled creation, registers platform room, then snapshots; room metadata/history persistence remains debounced. Join `:2446-2638` performs membership/password/name/capacity checks, rechecks after awaits, and disconnects/removes reserved seat if attendance write fails. Probe double submit, stale socket switch/full destination, lost ack, guest scheduled create and restart after acknowledged create. Do not silently promise durable room state from the ack alone.
- **Shared room controls/chat/report/media — WORKS boundary (static), T1 applies.** `services/socket-boundary.js:4-27` validates object payloads and catches async rejected handlers. Chat/report limits and private report storage observed. RTC forwarding requires same-room target membership; media issue endpoints recheck current socket/room authorization and durable revocation backlog (`co-study-server.js:1894-2125`). Revocation journal records before delivery, revokes persisted grants after restart and retries capped batches (`services/video/revocations.js:5-87`). External provider revoke semantics are UNVERIFIED here.
- **Focus/gamification — WORKS (static).** Workspace controls serialize operations; failed completion displays unconfirmed status instead of success (`platform.js:686-700`). `focus-client.js:16-35` serializes heartbeat actions and clears known-invalid current sessions; server `progress.js` awards only completed validated credit, caps daily XP, idempotently handles repeated complete, and enforces account/session ownership. Probe concurrent start/complete, response lost after commit, 45s interruption, 12h stale current and day boundary.
- **Circles/supervisors/schedules — WORKS (static).** Owner/supervisor permissions differ in `cohorts.js:6-12`; invites hashed/single-use/expiry and acceptance under locks (`:41-78`); VIP checked for create/invite/supervisor/schedule. Scheduling validates owned/same-circle room and idempotent identical retries (`:107-140`). Route commits scope, disconnects outsiders before fallible room flush (`routes.js:135-149`). UI binds forms with disabled button + try/finally error notice (`platform.js:267-280`) and local request-version checks suppress stale circle panels. Probe archive/removal, outsider attendance, scheduled timezone, and lost schedule response retry.
- **VIP test billing — WORKS (static), real provider UNVERIFIED, T3 applies.** Exactly 499 cents USD, one VIP tier (`catalog.js:1-8`). `/plans` gets identity/catalog; test simulator and provider sandbox copy are distinct. Owner-scoped status lookup (`digetpay-billing.js:122-133`), row locks/unique transaction prevent double grants; refunds cancel linked subscription; webhook never trusts money fields. Browser validates redirect allowlist, can fetch latest attempt after create error, shows pending/review/refunded/expired messages rather than false success (`platform.js:433-458,746-768,812-821`). Provider failed/declined payment can remain pending so same checkout can retry; test terminal UI semantics with fixture, not real card.
- **Staff/admin — WORKS guards (static), T2 applies.** Platform staff routes call session-bound MFA and permission checks (`routes.js:48-52,176-334`); `access.js:64-103` blocks OTP replay and binds short session to account cookie; role mutations invalidate staff sessions. Legacy admin is separately configured/password-protected and rate limited. Every destructive staff operation needs its own permission; no public API exposes raw credentials in inspected code. Probe ordinary user, expired MFA, wrong role, last super admin, stale role cookie, and failed logout.
- **SEO/legal/navigation — WORKS structure (static).** Twelve allowlisted public pages; real locale alternates; raw app routes noindex; known aliases/www canonical redirects; localized legal bodies and direct contact/WhatsApp links. Public HTML translations are trusted template transforms, not user HTML interpolation. Probe no-JS locale links, 404/noindex, contact links and legal footer on both locales. Actual production routes not checked by this agent.

## Jobs, stores, external calls, and non-public tooling

- Storage: platform PostgreSQL or on-disk PGlite (`services/platform/database.js:6-110`), migrations 001 and 002; account/room record stores; legacy JSON user/room files when configured; optional Supabase REST account store. SQL tables are enumerated in appendix. Runtime uses a single-process ownership lease/lock; losing PostgreSQL lease marks health false and rejects boundary work. PGlite/PG migration and backup parity need parent tests.
- Journals: media revocations, operational alerts, local-only recovery mail directory. These are not static-mounted. Platform backup includes DigetPay orders, excludes active staff sessions; restore increments account epochs (`maintenance.js:5-61`). Existing backups are operator artifacts, not user-facing download endpoints.
- Scheduled jobs: room cleanup timers; debounced user/room/record-store writes; pending-leave grace timers; video/attendance/staleness sweep (`co-study-server.js:1667`); revocation retry 30s; DigetPay reconcile 30s with notification and known-order scans; alerts persist/delivery retry 5s; configured backup interval; browser focus heartbeat15s. No application cron daemon or separate queue worker discovered. Shell deployment/backup scripts are operator-only, not HTTP handlers.
- External calls: Google OAuth authorize/token/userinfo; Cloudflare RealtimeKit API and browser SDK/media service; configured TURN/STUN; optional Supabase REST; DigetPay fixed `fin-api.digetpay.com/v1` sandbox-gated payment create/status and allowlisted hosted-checkout redirects; configured HTTPS alert webhook; operator-only Cloudflare R2 backup CLI with configured bucket. WhatsApp/mailto/tel and blog source links are browser navigation, not server dispatch. No production call or bucket ACL check executed here. Local fixture providers in tests are test-only; day2/day3/day5 scripts are manual test utilities, not registered runtime endpoints. Design-system React previews are non-runtime source; only CSS is mounted.
- Unenforced production promises to keep explicit: no deliverable production recovery email in current mail implementation; no live/recurring payment implementation; external media revocation and actual offsite backup restore not demonstrated by a static trace. Existing gates should remain, not be bypassed to make UI look functional.

## Ranked phase 4 probes

1. T1 board growth/resource cap, persisted over-limit board, all mutation paths.
2. DigetPay ambiguous create, forged notification/status mismatch, cross-account verify, duplicate approved/refund/late overlap, restart and unknown-order UX; fixtures only.
3. Cross-account/cohort permissions and staff role/MFA/account-session invalidation after removal/reset/logout; real sockets for receiving access.
4. DB outage/storage flush failures for join/attendance, rename, schedule and archive; verify no success screen if side effects are unconfirmed.
5. T2 admin logout network error and retry; no secret logging.
6. Recovery invalid/used token, missing mail, password mismatch, refresh and resend paths.
7. Focus repeated completion, interrupted heartbeat and lost response; today totals/day boundary and stale restore.
8. No-JS public language switching, 12-entry sitemap, canonical aliases and API/utility noindex; responsive return/join/payment legal links.

## Appendix — exact current HTTP registration statements

### co-study-server.js

- `co-study-server.js:1836` app.get('/manifest.webmanifest', (_req, res) => {
- `co-study-server.js:1841` app.get('/api/health', (_req, res) => {
- `co-study-server.js:1850` app.get('/api/ready', (_req, res) => {
- `co-study-server.js:1860` app.get('/api/metrics', (req, res) => {
- `co-study-server.js:1877` app.get('/api/runtime-config', (_req, res) => {
- `co-study-server.js:1894` app.post('/api/rooms/:roomId/video-token', async (req, res) => {
- `co-study-server.js:2128` app.post('/api/rooms/:roomId/video-heartbeat', (req, res) => {
- `co-study-server.js:2162` app.post('/api/rooms/:roomId/video-leave', (req, res) => {
- `co-study-server.js:2188` app.get('/api/rooms/:roomId', async (req, res) => {
- `co-study-server.js:2218` app.get(['/open.html', '/open'], (_req, res) => {
- `co-study-server.js:2222` app.get(['/app', '/plans', '/supervisor'], (_req, res) => {
- `co-study-server.js:2227` app.get(['/account.html', '/account'], (_req, res) => {
- `co-study-server.js:2230` app.get(['/recover', '/recovery.html'], (_req, res) => {
- `co-study-server.js:2237` app.get(['/index.html', '/study', '/workspace', '/room'], (_req, res) => {
- `co-study-server.js:2241` app.get(['/lobby', '/lobby.html'], (_req, res) => {
- `co-study-server.js:2277` app.get('/api/announcement', (_req, res) => {

### services/auth/auth-routes.js

- `services/auth/auth-routes.js:84` router.post('/auth/signup', async (req, res) => {
- `services/auth/auth-routes.js:131` router.post('/auth/login', async (req, res) => {
- `services/auth/auth-routes.js:172` router.post('/auth/logout', async (req, res) => {
- `services/auth/auth-routes.js:186` router.get('/auth/me', (req, res) => {
- `services/auth/auth-routes.js:190` router.patch('/me/profile', requireUser, (req, res) => {
- `services/auth/auth-routes.js:223` router.post('/me/focus-session', requireUser, (req, res) => {
- `services/auth/auth-routes.js:246` router.post('/me/stats/import', requireUser, (req, res) => {
- `services/auth/auth-routes.js:266` router.get('/me/stats', requireUser, (req, res) => {
- `services/auth/auth-routes.js:270` router.get('/me/rooms', requireUser, (req, res) => {
- `services/auth/auth-routes.js:278` router.delete('/me', requireUser, async (req, res) => {

### services/auth/recovery.js

- `services/auth/recovery.js:36` router.get('/auth/recovery/config', (_req, res) => res.json({ enabled: available, mode: available ? 'local' : 'disabled' }));
- `services/auth/recovery.js:61` router.post('/auth/recovery/request', (req, res) => {
- `services/auth/recovery.js:69` router.post('/me/email-verification', requireUser, (req, res) => {
- `services/auth/recovery.js:76` router.post('/auth/recovery/complete', async (req, res) => {

### services/auth/google-routes.js

- `services/auth/google-routes.js:69` router.get('/auth/google', (req, res) => {
- `services/auth/google-routes.js:98` router.get('/auth/google/callback', async (req, res) => {

### services/platform/routes.js

- `services/platform/routes.js:28` router.get('/catalog', handle(async (_req, res) => {
- `services/platform/routes.js:32` router.post('/billing/digetpay/webhook', handle(async (req, res) => {
- `services/platform/routes.js:54` router.get('/me', handle(async (req, res) => {
- `services/platform/routes.js:68` router.get('/progress', handle(async (req, res) => {
- `services/platform/routes.js:72` router.get('/dashboard', handle(async (req, res) => res.json(await dashboard(platform, rooms, req.user))));
- `services/platform/routes.js:73` router.post('/focus/start', handle(async (req, res) => res.json(await platform.progress.start(req.user.id))));
- `services/platform/routes.js:74` router.post('/focus/:id/:action', handle(async (req, res) => res.json(await platform.progress.update(req.user.id, req.params.id, req.params.action))));
- `services/platform/routes.js:75` router.get('/progress/export', handle(async (req, res) => {
- `services/platform/routes.js:88` router.post('/billing/checkout', handle(async (req, res) => res.json(await platform.billing.checkout(req.user.id, {
- `services/platform/routes.js:91` router.get('/billing/latest', handle(async (req, res) => res.json({
- `services/platform/routes.js:94` router.post('/billing/checkout/:id/verify', handle(async (req, res) => {
- `services/platform/routes.js:98` router.post('/billing/checkout/:id/complete', handle(async (req, res) =>
- `services/platform/routes.js:100` router.post('/billing/cancellation', handle(async (req, res) => {
- `services/platform/routes.js:104` router.post('/cohorts', handle(async (req, res) => res.json(await platform.cohorts.create(req.user.id, req.body?.name))));
- `services/platform/routes.js:105` router.post('/cohorts/accept', handle(async (req, res) => res.json(await platform.cohorts.accept(req.user.id, req.body?.token))));
- `services/platform/routes.js:106` router.post('/cohorts/:id/invitations', handle(async (req, res) => res.json(await platform.cohorts.invite(req.user.id, req.params.id))));
- `services/platform/routes.js:107` router.get('/cohorts/:id/members', handle(async (req, res) => res.json({ members: await platform.cohorts.members(req.user.id, req.params.id) })));
- `services/platform/routes.js:108` router.patch('/cohorts/:id/members/:userId', handle(async (req, res) => {
- `services/platform/routes.js:115` router.get('/cohorts/:id/sessions', handle(async (req, res) => res.json({ sessions: await platform.cohorts.sessions(req.user.id, req.params.id) })));
- `services/platform/routes.js:116` router.post('/cohorts/:id/archive', handle(async (req, res) => {
- `services/platform/routes.js:126` router.post('/cohorts/:id/leave', handle(async (req, res) => {
- `services/platform/routes.js:131` router.delete('/cohorts/:id/sessions/:sessionId', handle(async (req, res) => {
- `services/platform/routes.js:135` router.post('/cohorts/:id/sessions', handle(async (req, res) => {
- `services/platform/routes.js:151` router.get('/cohorts/:id/sessions/:sessionId/attendance', handle(async (req, res) =>
- `services/platform/routes.js:153` router.get('/rooms', handle(async (req, res) => {
- `services/platform/routes.js:163` router.patch('/rooms/:id', handle(async (req, res) => {
- `services/platform/routes.js:176` router.post('/security/mfa/enroll', handle(async (req, res) => {
- `services/platform/routes.js:185` router.post('/security/mfa/verify', handle(async (req, res) => {
- `services/platform/routes.js:192` router.post('/staff/bootstrap', handle(async (req, res) => {
- `services/platform/routes.js:199` router.get('/staff', handle(async (req, res) => {
- `services/platform/routes.js:204` router.post('/staff/roles', handle(async (req, res) => {
- `services/platform/routes.js:213` router.get('/staff/audit', handle(async (req, res) => {
- `services/platform/routes.js:217` router.get('/staff/overview', handle(async (req, res) => {
- `services/platform/routes.js:222` router.get('/staff/cases', handle(async (req, res) => {
- `services/platform/routes.js:226` router.patch('/staff/cases/:id', handle(async (req, res) => {
- `services/platform/routes.js:239` router.get('/staff/subscriptions', handle(async (req, res) => {
- `services/platform/routes.js:243` router.get('/staff/users', handle(async (req, res) => {
- `services/platform/routes.js:250` router.post('/staff/users/:id/status', handle(async (req, res) => {
- `services/platform/routes.js:269` router.get('/staff/rooms', handle(async (req, res) => {
- `services/platform/routes.js:275` router.post('/staff/rooms/:id/:action', handle(async (req, res) => {
- `services/platform/routes.js:293` router.get('/staff/operations', handle(async (req, res) => {
- `services/platform/routes.js:301` router.post('/staff/video', handle(async (req, res) => {
- `services/platform/routes.js:308` router.post('/staff/announcement', handle(async (req, res) => {
- `services/platform/routes.js:320` router.delete('/staff/announcement', handle(async (req, res) => {
- `services/platform/routes.js:328` router.post('/staff/backup', handle(async (req, res) => {

### services/admin/admin-routes.js

- `services/admin/admin-routes.js:114` router.get('/', (_req, res) => {
- `services/admin/admin-routes.js:118` router.post('/api/login', async (req, res) => {
- `services/admin/admin-routes.js:142` router.post('/api/logout', requireAdmin, (_req, res) => {
- `services/admin/admin-routes.js:149` router.get('/api/overview', requireAdmin, (_req, res) => {
- `services/admin/admin-routes.js:183` router.get('/api/dashboard', requireAdmin, async (_req, res) => {
- `services/admin/admin-routes.js:210` router.get('/api/rooms', requireAdmin, (_req, res) => {
- `services/admin/admin-routes.js:226` router.get('/api/rooms/:roomId', requireAdmin, (req, res) => {
- `services/admin/admin-routes.js:257` router.post('/api/rooms/:roomId/close', requireAdmin, (req, res) => {
- `services/admin/admin-routes.js:275` router.post('/api/rooms/:roomId/kick', requireAdmin, (req, res) => {
- `services/admin/admin-routes.js:301` router.get('/api/reports', requireAdmin, (_req, res) => {
- `services/admin/admin-routes.js:318` router.post('/api/rooms/:roomId/reports/:reportId/resolve', requireAdmin, (req, res) => {
- `services/admin/admin-routes.js:340` router.get('/api/video-kill-switch', requireAdmin, (_req, res) => {
- `services/admin/admin-routes.js:349` router.post('/api/video-kill-switch', requireAdmin, (req, res) => {
- `services/admin/admin-routes.js:362` router.get('/api/users', requireAdmin, (req, res) => {
- `services/admin/admin-routes.js:404` router.post('/api/users/:userId/ban', requireAdmin, (req, res) => setBanned(req, res, true));
- `services/admin/admin-routes.js:405` router.post('/api/users/:userId/unban', requireAdmin, (req, res) => setBanned(req, res, false));
- `services/admin/admin-routes.js:409` router.post('/api/broadcast', requireAdmin, (req, res) => {
- `services/admin/admin-routes.js:433` router.delete('/api/broadcast', requireAdmin, (_req, res) => {
- `services/admin/admin-routes.js:444` router.post('/api/backup', requireAdmin, async (_req, res) => {
- `services/admin/admin-routes.js:453` router.get('/api/errors', requireAdmin, (_req, res) => {
- `services/admin/admin-routes.js:457` router.get('/api/video-sessions', requireAdmin, (_req, res) => {

### services/seo/public-pages.js

- `services/seo/public-pages.js:182` app.get('/robots.txt', (_req, res) => res.type('text/plain').send(
- `services/seo/public-pages.js:184` app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(
- `services/seo/public-pages.js:187` for (const page of pages) app.get(page.path, (_req, res) => {

## Appendix — named client socket events and lifecycle

- `co-study-server.js:2359` onEvent('create-room', async (payload = {}, ack) => {
- `co-study-server.js:2446` onEvent('join-room', async (payload = {}, ack) => {
- `co-study-server.js:2643` onEvent('send-message', (payload = {}, ack) => {
- `co-study-server.js:2677` onEvent('board-set-goal', (payload = {}, ack) => {
- `co-study-server.js:2698` onEvent('board-add-task', (payload = {}, ack) => {
- `co-study-server.js:2729` onEvent('board-toggle-task', (payload = {}, ack) => {
- `co-study-server.js:2756` onEvent('board-delete-task', (payload = {}, ack) => {
- `co-study-server.js:2783` onEvent('board-reorder-tasks', (payload = {}, ack) => {
- `co-study-server.js:2831` onEvent('camera-status', (payload = {}) => {
- `co-study-server.js:2843` onEvent('rtc-offer', (payload = {}) => {
- `co-study-server.js:2852` onEvent('rtc-answer', (payload = {}) => {
- `co-study-server.js:2861` onEvent('rtc-ice', (payload = {}) => {
- `co-study-server.js:2870` onEvent('user-status', (payload = {}, ack) => {
- `co-study-server.js:2886` onEvent('report-user', async (payload = {}, ack) => {
- `co-study-server.js:2949` socket.on('disconnect', () => {

## Appendix — SQL table inventory

- `001-platform.sql:4` CREATE TABLE IF NOT EXISTS halastudy.migrations (
- `001-platform.sql:7` CREATE TABLE IF NOT EXISTS halastudy.users (
- `001-platform.sql:10` CREATE TABLE IF NOT EXISTS halastudy.store_metadata (
- `001-platform.sql:13` CREATE TABLE IF NOT EXISTS halastudy.accounts (
- `001-platform.sql:18` CREATE TABLE IF NOT EXISTS halastudy.room_records (
- `001-platform.sql:21` CREATE TABLE IF NOT EXISTS halastudy.mfa (
- `001-platform.sql:26` CREATE TABLE IF NOT EXISTS halastudy.staff_sessions (
- `001-platform.sql:30` CREATE TABLE IF NOT EXISTS halastudy.organizations (
- `001-platform.sql:34` CREATE TABLE IF NOT EXISTS halastudy.organization_members (
- `001-platform.sql:40` CREATE TABLE IF NOT EXISTS halastudy.role_assignments (
- `001-platform.sql:46` CREATE TABLE IF NOT EXISTS halastudy.cohorts (
- `001-platform.sql:53` CREATE TABLE IF NOT EXISTS halastudy.cohort_members (
- `001-platform.sql:59` CREATE TABLE IF NOT EXISTS halastudy.invitations (
- `001-platform.sql:65` CREATE TABLE IF NOT EXISTS halastudy.rooms (
- `001-platform.sql:70` CREATE TABLE IF NOT EXISTS halastudy.room_hosts (
- `001-platform.sql:75` CREATE TABLE IF NOT EXISTS halastudy.scheduled_sessions (
- `001-platform.sql:81` CREATE TABLE IF NOT EXISTS halastudy.attendance (
- `001-platform.sql:87` CREATE TABLE IF NOT EXISTS halastudy.subscriptions (
- `001-platform.sql:99` CREATE TABLE IF NOT EXISTS halastudy.checkout_sessions (
- `001-platform.sql:105` CREATE TABLE IF NOT EXISTS halastudy.focus_sessions (
- `001-platform.sql:114` CREATE TABLE IF NOT EXISTS halastudy.xp_ledger (
- `001-platform.sql:120` CREATE TABLE IF NOT EXISTS halastudy.achievements (
- `001-platform.sql:125` CREATE TABLE IF NOT EXISTS halastudy.cases (
- `001-platform.sql:132` CREATE TABLE IF NOT EXISTS halastudy.audit_events (
- `001-platform.sql:136` CREATE TABLE IF NOT EXISTS halastudy.outbox (
- `002-digetpay.sql:1` CREATE TABLE IF NOT EXISTS halastudy.digetpay_orders (

