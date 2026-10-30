# Phase 3 — Static trace

Date: 2026-10-20. Read-only trace of the current working tree. No application edits, network requests, tests or commits were performed by this phase. Findings describe the inspected pre-fix state; the main audit owns remediation and verification.

## Coverage

29 repository files had code/body passages directly read: 21 complete files and 8 partial files. Search-only route/metadata matches are not counted as complete reads. This is not a claim that every line of the site was reviewed.

Complete reads: `docs/implementation/2026-10-20-platform/STATUS.md`, `OPERATIONS.md` in that directory; `services/platform/{routes,cohorts,access,index,progress,billing,catalog,record-store,database,maintenance}.js`; `services/auth/{auth-routes,google-routes}.js`; `public/js/focus-client.js`; `db/migrations/001-platform.sql`; `services/ops/backup-scheduler.js`; `services/supabase/client.js`; `services/video/realtimekit-provider.js`; `nginx.conf`; `scripts/deploy/nginx-halastudy.conf`.

Partial reads: `co-study-server.js`, `services/admin/admin-routes.js`, `public/js/platform.js`, `public/js/halastudy-core.js`, `account.html`, `index.html`, `open.html`, `lobby.html`. Other UI/assets and integration entry points were searched for declarations/references, not fully read.

## Verified findings

| ID | Priority | Evidence and effect | Status / proposed probe |
|---|---|---|---|
| TR-01 | Medium | `services/auth/auth-routes.js:143-170` changes displayName before validating avatarColor and bio. A valid name plus invalid color returns 400 after the name already changed in memory; a later save can persist it. | BREAKS atomic validation. Probe rejected mixed-field patch and then GET/restart. Validate all fields before mutation. |
| TR-02 | Medium | Profile handler calls only persistUsersSoon at line 169 and replies success; `record-store.js:88-97` schedules writes later. `account.html:649` shows Profile saved. Storage failure or process exit can lose a reported save. Legacy focus/import similarly acknowledge debounced writes (`auth-routes.js:173-209`). | BREAKS durable-save promise. Inject storage failure and require failure/no success toast. Distinguish eventual chat storage from explicit account saves. |
| TR-03 | Medium | `account.html:627-635` swallows statistics failure into defaults and replaces failed room history with an empty list. `halastudy-core.js:163-165` maps failed auth/me to null. Unavailable data becomes zero/empty/guest. | BREAKS failure-to-screen contract. Intercept 503/offline separately for auth, stats, rooms and verify explicit retry UI. |
| TR-04 | Medium | Owner deletion sets cohorts.owner_id null (`001-platform.sql:48`); `platform/index.js:74-84` has no transfer/archive policy. Remaining membership survives, but nobody satisfies canManage (`cohorts.js:11`), and scheduling resolves null owner to free (`cohorts.js:96`, `catalog.js:12-17`). Active circle cannot invite, promote or archive. Rooms remain private: this is not a privacy exposure. | BREAKS owner lifecycle. Probe owner deletion with surviving supervisor/member; implement explicit archival or transfer. |
| TR-05 | Medium | `lobby.html:358-363` ignores failed join acknowledgments except ROOM_FULL; 387-406 hides provider failures and 451-460 silently falls back after camera failure. Name gate hides before join (`467-474`). | BREAKS failure-to-screen contract. Probe duplicate nickname, storage starting, unavailable video and camera denial. |
| TR-06 | Low | Shared requestJson checks HTTP status but has no request deadline (`halastudy-core.js:134-155`). Platform work finally re-enables controls (`platform.js:164-168`), but cannot run while a fetch never settles. | UNVERIFIED timing symptom. Simulate stalled request and verify bounded timeout/retry. |

## Additional probes, not proven runtime defects

1. **Circle selection race:** `platform.js:255-257` sets shared selectedCircle before concurrent loads; old response can render after newer selection. Invite/archive/schedule use shared selection at 501-515. Delay A behind B, then check mutation destination matches visible circle. Backend authorization still applies.
2. **Schedule commit/failure:** `routes.js:116-127` commits scheduled session and SQL scope before snapshot flush. A flush failure returns 503 after durable creation; retry can create another schedule. Probe idempotency. Canonical SQL scope is rechecked on sockets, limiting access leakage.
3. **Revocation during awaits:** auth is resolved before awaits. Join repeats checks (`server:2450-2479`), other requests rely on entry checks. Probe deletion/ban during slow write/OAuth exchange.
4. **Malformed bodies/double submits:** arrays/null/oversized strings on invite, scope, schedule, OTP and checkout. Known typed errors or generic safe 503 are caught by `routes.js:12-19`.
5. **MFA refresh/expiry:** refresh during enrollment loses frontend enrolling state; enrollment can restart. Expired staff session leaves visible tools until next failed request. API still requires fresh MFA.
6. **Attendance semantics:** recordAttendance runs on room join only (`server:2474`; `platform/index.js:56-65`). Joining more than 15 minutes before a later session and staying connected may not register that scheduled session. last_seen_at means last qualifying join, not continuous presence. Probe and define intended semantics.
7. **Export failure:** direct anchor (`platform.html:68`) can navigate to JSON after auth/entitlement expiry rather than show in-app recovery.
8. **Metadata:** aliases have uneven canonical metadata; no robots/sitemap handlers appear in inspected declarations. Platform routes deliberately noindex. Verify deployed edge rules before adding routes. Unrelated dirty blog files were not edited.

## Critical flow map

WORKS means a static enforcing path exists, not that this phase executed it. External behavior stays UNVERIFIED.

| Flow | UI → backend → side effect → failure display |
|---|---|
| Signup | `account.html:520-550` catches errors → `auth-routes.js:45-89` validation/rate/duplicate recheck after hash → awaited flush, map rollback, cookie after commit → form error. WORKS static. |
| Login/logout | Password/ban/rates; logout increments token epoch, disconnects and awaits flush even on retry (`auth-routes.js:92-137`) → account/core catches logout failures. WORKS static. Auth GET failure is TR-03. |
| Google | Purpose-bound pending state + PKCE → callback state comparison, 10s timeouts, verified subject/email, signed-in linking → awaited flush before cookie, separate purpose-bound delete/MFA proof → account failure redirect (`google-routes.js:69-221`). WORKS static; real provider UNVERIFIED. Email recovery MISSING. |
| Profile | `account.html:638-654` → patch validation/mutation → debounce → success toast. BREAKS TR-01/02. |
| Delete | Typed confirmation/password or Google reauth (`account:665-695`) → epoch revocation/map deletion/flush/platform purge with restoration on error (`auth-routes:224-261`) → redirect only on success. SQL cascade removes personal memberships/progress; case/audit redaction (`platform/index:74-84`). Shared room content retained per policy. TR-04 owner dead end; live Supabase cross-store atomicity UNVERIFIED. |
| Create/join | `open:1458-1498` 8s socket timeout, lookup handles 404/429/non-OK (`1224-1245`) → server rate/name/media/password/scheduled-account checks → durable metadata, runtime room, debounced snapshot → ack/error. Join rechecks scope/name/capacity after await, then attendance before snapshot (`server:2304-2499`). WORKS static; room snapshot create durability eventual. |
| Chat/board/report | UI maps failed ack (`index:3365-3425,3778-3884`) → per-event auth/scope (`server:2187-2206`) → input/rate checks, memory/debounce; report additionally awaits case (`2744-2804`) → ack. WORKS static; no-ack behavior needs probe. |
| VIP | Form + helper rejects non-OK → test-only, user lock, account-bound hashed token, expiry, transaction/audit (`billing:15-77`) → refresh/no-charge notice. Completed checkout idempotent. Live checkout deliberately disabled; SQL/catalog enforce VIP 499 USD only. WORKS test; real billing MISSING by user decision. |
| Focus | Serialized client actions/heartbeat → row lock, unique open session, server elapsed ≤45s, 240min/session, 240XP/day, idempotent completion (`progress:9-87`) → stats/error feedback. Room timer continues on sync error (`index:3148-3155`). WORKS static; browser throttling/restart probes remain. |
| Circles | Forms → auth/mutation limit → scoped membership, owner-only invite/roles, supervisor scheduling, owner VIP, serialized caps, scoped attendance (`cohorts.js`) → notices. WORKS static except lifecycle; race probes above. |
| Staff | Reauthenticated enrollment + OTP/recovery → encrypted secret, counter replay control, single-use hashes, 15min account-bound cookie → per-route permissions (`access.js`, `routes:39-43`) → gated controls/MFA_REQUIRED. Last-admin protection and invalidation explicit. WORKS static. |
| Legacy admin | Configured mount → password/cookie/rates → hasStaff closes login/API after bootstrap (`admin-routes:77-92,118-125`). Page remains reachable but actions closed. WORKS static. |
| Backup | Staff permission/offline CLI → critical flush + repeatable-read allowlisted snapshot → checksum/atomic rename/coalesced scheduler. Restore refuses nonempty DB, resets account epochs, omits staff sessions (`maintenance.js`). WORKS static; live PostgreSQL/R2/restore UNVERIFIED. |

## Surface inventory

R = mounted runtime; C = configuration dependent; T = developer/test only; D = reserved/not publicly mounted. Appendix lists every route declaration in all runtime route owners, including middleware mounts.

### Pages/static

- R: `/`; `/open`, `/open.html`; `/index.html`, `/study`, `/workspace`, `/room`; `/account`, `/account.html`; `/lobby`, `/lobby.html`; `/blog`, `/blog.html`; two explicit article slugs; `/privacy`, `/privacy.html`; `/terms`, `/terms.html`; `/app`, `/plans`, `/supervisor`; fallback 404 (`server:2065-2154`).
- C: admin page at config.admin.path (`server:2111`, `admin-routes:114`). API gate is security, not hidden path.
- R: `/audio`, `/images`, `/videos`, `/js`, `/css`, CSS-only `/design-system`, manifest (`server:1685-1699,1751`). `/videos/hero/source` blocked. Socket.IO script/transport served by library. Every file under these static mounts is potential asset surface.
- D: raw design HTML, React UI kit and previews not routed. No static root mount serving docs/database/data/source/node_modules.

### Sockets

R: create-room, join-room, send-message, board-set-goal, board-add-task, board-toggle-task, board-delete-task, board-reorder-tasks, camera-status, rtc-offer, rtc-answer, rtc-ice, user-status, report-user, disconnect. Anchors in appendix. Outbound presence/chat/board/status/camera/RTC, announcement/clear, kicked/room-closed scoped by handlers; global announcements intentionally broadcast.

### Background/storage/external

- R: 30min empty unscheduled/non-circle/non-lobby room cleanup (`server:45,1320-1323`), delayed leave (`2846`), video sweep (`1635`), shutdown flush (`1643-1663`), debounced writes (`record-store:88`), browser focus heartbeat (`focus-client:31`), video heartbeat (`public/js/video/video-client.js:53`).
- C: backup interval (`backup-scheduler:63-68`), R2 upload CLI (`scripts/backup-r2.js`, `cloudflare/r2-client:100,192`), offline migrate/backup/restore CLI (`scripts/platform-maintenance.js`). No payment webhook or active transactional worker found; outbox D reserved schema.
- R/C: SQL halastudy tables in `001-platform.sql`, embedded PGlite or PostgreSQL pool with exclusive runtime lock (`database:12-42,47-72`); accounts/room_records cache bridges with optimistic revisions and one-time JSON import (`record-store:59-78`). SQL rooms/cohorts distinct from room snapshots. Legacy file store only when platform disabled.
- C Supabase: profiles, focus_sessions, room_events, admin_overview/user_stats/daily_active views (`supabase-user-store:96-199`); service-role REST client (`supabase/client:1-105`). Server authorization required because service-role bypasses RLS; deployed schema not inspected.
- C Google: accounts.google.com auth, oauth2.googleapis.com token, www.googleapis.com userinfo (`google-routes:19-21`).
- C RealtimeKit: Cloudflare meetings/participant-token/meeting-close (`realtimekit-provider:126-185`); jsDelivr SDK/UI (`public/js/video/realtimekit-client:5-6`). Mesh uses runtime ICE; TURN CLI rtc.live.cloudflare.com (`scripts/cloudflare/turn-credentials:24-38`).
- Public font Google APIs/gstatic permitted by CSP (`server:701-702`); browser network evidence needed for exact loads.
- T: fake SFU/RealtimeKit helpers, integration/smoke tests, local isolated preview, day2/day3/day5 probes. Not application routes.
- D/future: organization/org-members/outbox schema and room_hosts assignments lack complete product management flows; not finished organization billing/workers.

## Promises

One paid tier is catalog plus SQL-enforced; test/live entitlement records separated. Circle entry is SQL-scoped on preview/join/events. Archive preserves privacy; owner deletion has lifecycle gap. Member attendance query returns only self (`cohorts:145-158`). Last super-admin removal/deletion guarded under role table lock. Restore is allowlisted/checksummed and revokes sessions; checksum is not authenticity protection, as runbook states.

Profile saved is not backed by awaited persistence (TR-02); failed reads conflate no data (TR-03). Attendance is join-based, not continuous duration. Retention, legal region, live providers, and production content parity remain external evidence gaps; no certification made.

## Ranked probe plan

1. Invalid mixed profile patch / failed persistence, then reread/restart.
2. Auth/stats/rooms unavailable and stalled requests: explicit failure/retry.
3. Owner deletion with surviving circle members: safe lifecycle/private entry.
4. Lobby duplicate-name/server/video failure: recover without silent empty state.
5. Concurrent delayed circle selection then invitation/archive/schedule.
6. Schedule commit then snapshot failure/retry: duplicate and scope check.
7. Already-connected attendance, expiry, member revoke, archive/cancel.
8. Cross-account checkout/focus/export, duplicate payment success, role denial, OTP replay/recovery reuse, last-admin protections, async socket revocation.

Dropped findings: 0. Fixes by this phase: 0 (read-only delegation). Prior test results were not rerun or counted here.

## Route declaration appendix

Auth router prefix `/api`; platform `/api/platform`; Google `/`; admin configured ADMIN_PATH. Middleware included for guard context.

```text
co-study-server.js:1674:    app.use(securityHeaders);
co-study-server.js:1675:    app.use(originGuard);
co-study-server.js:1676:    app.use(express.json());
co-study-server.js:1677:    app.use(sessionMiddleware);
co-study-server.js:1678:    app.use(attachUser);
co-study-server.js:1679:    app.use(['/api', '/auth/google'], (_req, res, next) => {
co-study-server.js:1685:    app.use('/audio', express.static(path.join(__dirname, 'audio'), { maxAge: '7d' }));
co-study-server.js:1686:    app.use('/images', express.static(path.join(__dirname, 'images'), { maxAge: '1d' }));
co-study-server.js:1689:    app.use('/videos/hero/source', (_req, res) => res.status(404).end());
co-study-server.js:1690:    app.use('/videos', express.static(path.join(__dirname, 'videos'), { maxAge: '1d' }));
co-study-server.js:1691:    app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: '1h' }));
co-study-server.js:1692:    app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { maxAge: '1h' }));
co-study-server.js:1695:    app.use('/design-system', (req, res, next) => {
co-study-server.js:1700:    app.use('/api', createAuthRouter({
co-study-server.js:1726:    app.use('/api/platform', createPlatformRouter({
co-study-server.js:1735:    app.use('/', createGoogleAuthRouter({
co-study-server.js:1751:    app.get('/manifest.webmanifest', (_req, res) => {
co-study-server.js:1756:    app.get('/api/health', (_req, res) => {
co-study-server.js:1765:    app.get('/api/ready', (_req, res) => {
co-study-server.js:1775:    app.get('/api/metrics', (req, res) => {
co-study-server.js:1792:    app.get('/api/runtime-config', (_req, res) => {
co-study-server.js:1809:    app.post('/api/rooms/:roomId/video-token', async (req, res) => {
co-study-server.js:1979:    app.post('/api/rooms/:roomId/video-heartbeat', (req, res) => {
co-study-server.js:2012:    app.post('/api/rooms/:roomId/video-leave', (req, res) => {
co-study-server.js:2037:    app.get('/api/rooms/:roomId', async (req, res) => {
co-study-server.js:2065:    app.get('/', (_req, res) => {
co-study-server.js:2069:    app.get(['/open.html', '/open'], (_req, res) => {
co-study-server.js:2073:    app.get(['/privacy.html', '/privacy'], (_req, res) => {
co-study-server.js:2077:    app.get(['/terms.html', '/terms'], (_req, res) => {
co-study-server.js:2081:    app.get(['/blog.html', '/blog'], (_req, res) => {
co-study-server.js:2087:    app.get('/blog/best-online-group-study-rooms-saudi', (_req, res) => {
co-study-server.js:2090:    app.get('/blog/study-with-me-online-arabic', (_req, res) => {
co-study-server.js:2094:    app.get(['/app', '/plans', '/supervisor'], (_req, res) => {
co-study-server.js:2099:    app.get(['/account.html', '/account'], (_req, res) => {
co-study-server.js:2103:    app.get(['/index.html', '/study', '/workspace', '/room'], (_req, res) => {
co-study-server.js:2107:    app.get(['/lobby', '/lobby.html'], (_req, res) => {
co-study-server.js:2112:        app.use(config.admin.path, createAdminRouter({
co-study-server.js:2143:    app.get('/api/announcement', (_req, res) => {
co-study-server.js:2148:    app.use((req, res) => {
co-study-server.js:2157:    app.use((err, req, res, _next) => {
co-study-server.js:2170:    io.on('connection', (socket) => {
co-study-server.js:2217:        socket.on('create-room', async (payload = {}, ack = () => {}) => {
co-study-server.js:2304:        socket.on('join-room', async (payload = {}, ack = () => {}) => {
co-study-server.js:2501:        socket.on('send-message', (payload = {}, ack = () => {}) => {
co-study-server.js:2535:        socket.on('board-set-goal', (payload = {}, ack = () => {}) => {
co-study-server.js:2556:        socket.on('board-add-task', (payload = {}, ack = () => {}) => {
co-study-server.js:2587:        socket.on('board-toggle-task', (payload = {}, ack = () => {}) => {
co-study-server.js:2614:        socket.on('board-delete-task', (payload = {}, ack = () => {}) => {
co-study-server.js:2641:        socket.on('board-reorder-tasks', (payload = {}, ack = () => {}) => {
co-study-server.js:2689:        socket.on('camera-status', (payload = {}) => {
co-study-server.js:2701:        socket.on('rtc-offer', (payload = {}) => {
co-study-server.js:2710:        socket.on('rtc-answer', (payload = {}) => {
co-study-server.js:2719:        socket.on('rtc-ice', (payload = {}) => {
co-study-server.js:2728:        socket.on('user-status', (payload = {}, ack = () => {}) => {
co-study-server.js:2744:        socket.on('report-user', async (payload = {}, ack = () => {}) => {
co-study-server.js:2807:        socket.on('disconnect', () => {
services/platform/routes.js:21:    router.use((_req, res, next) => {
services/platform/routes.js:26:    router.get('/catalog', handle(async (_req, res) => {
services/platform/routes.js:30:    router.use(requireUser);
services/platform/routes.js:31:    router.use(async (req, res, next) => {
services/platform/routes.js:45:    router.get('/me', handle(async (req, res) => {
services/platform/routes.js:59:    router.get('/progress', handle(async (req, res) => {
services/platform/routes.js:63:    router.post('/focus/start', handle(async (req, res) => res.json(await platform.progress.start(req.user.id))));
services/platform/routes.js:64:    router.post('/focus/:id/:action', handle(async (req, res) => res.json(await platform.progress.update(req.user.id, req.params.id, req.params.action))));
services/platform/routes.js:65:    router.get('/progress/export', handle(async (req, res) => {
services/platform/routes.js:78:    router.post('/billing/checkout', handle(async (req, res) => res.json(await platform.billing.checkout(req.user.id))));
services/platform/routes.js:79:    router.post('/billing/checkout/:id/complete', handle(async (req, res) =>
services/platform/routes.js:81:    router.post('/billing/cancellation', handle(async (req, res) => {
services/platform/routes.js:85:    router.post('/cohorts', handle(async (req, res) => res.json(await platform.cohorts.create(req.user.id, req.body?.name))));
services/platform/routes.js:86:    router.post('/cohorts/accept', handle(async (req, res) => res.json(await platform.cohorts.accept(req.user.id, req.body?.token))));
services/platform/routes.js:87:    router.post('/cohorts/:id/invitations', handle(async (req, res) => res.json(await platform.cohorts.invite(req.user.id, req.params.id))));
services/platform/routes.js:88:    router.get('/cohorts/:id/members', handle(async (req, res) => res.json({ members: await platform.cohorts.members(req.user.id, req.params.id) })));
services/platform/routes.js:89:    router.patch('/cohorts/:id/members/:userId', handle(async (req, res) => {
services/platform/routes.js:96:    router.get('/cohorts/:id/sessions', handle(async (req, res) => res.json({ sessions: await platform.cohorts.sessions(req.user.id, req.params.id) })));
services/platform/routes.js:97:    router.post('/cohorts/:id/archive', handle(async (req, res) => {
services/platform/routes.js:107:    router.post('/cohorts/:id/leave', handle(async (req, res) => {
services/platform/routes.js:112:    router.delete('/cohorts/:id/sessions/:sessionId', handle(async (req, res) => {
services/platform/routes.js:116:    router.post('/cohorts/:id/sessions', handle(async (req, res) => {
services/platform/routes.js:129:    router.get('/cohorts/:id/sessions/:sessionId/attendance', handle(async (req, res) =>
services/platform/routes.js:131:    router.get('/rooms', handle(async (req, res) => {
services/platform/routes.js:141:    router.patch('/rooms/:id', handle(async (req, res) => {
services/platform/routes.js:154:    router.post('/security/mfa/enroll', handle(async (req, res) => {
services/platform/routes.js:163:    router.post('/security/mfa/verify', handle(async (req, res) => {
services/platform/routes.js:170:    router.post('/staff/bootstrap', handle(async (req, res) => {
services/platform/routes.js:177:    router.get('/staff', handle(async (req, res) => {
services/platform/routes.js:182:    router.post('/staff/roles', handle(async (req, res) => {
services/platform/routes.js:191:    router.get('/staff/audit', handle(async (req, res) => {
services/platform/routes.js:195:    router.get('/staff/overview', handle(async (req, res) => {
services/platform/routes.js:200:    router.get('/staff/cases', handle(async (req, res) => {
services/platform/routes.js:204:    router.patch('/staff/cases/:id', handle(async (req, res) => {
services/platform/routes.js:217:    router.get('/staff/subscriptions', handle(async (req, res) => {
services/platform/routes.js:221:    router.get('/staff/users', handle(async (req, res) => {
services/platform/routes.js:228:    router.post('/staff/users/:id/status', handle(async (req, res) => {
services/platform/routes.js:247:    router.get('/staff/rooms', handle(async (req, res) => {
services/platform/routes.js:253:    router.post('/staff/rooms/:id/:action', handle(async (req, res) => {
services/platform/routes.js:271:    router.get('/staff/operations', handle(async (req, res) => {
services/platform/routes.js:275:    router.post('/staff/video', handle(async (req, res) => {
services/platform/routes.js:282:    router.post('/staff/announcement', handle(async (req, res) => {
services/platform/routes.js:294:    router.delete('/staff/announcement', handle(async (req, res) => {
services/platform/routes.js:302:    router.post('/staff/backup', handle(async (req, res) => {
services/auth\auth-routes.js:43:    router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
services/auth\auth-routes.js:45:    router.post('/auth/signup', async (req, res) => {
services/auth\auth-routes.js:92:    router.post('/auth/login', async (req, res) => {
services/auth\auth-routes.js:125:    router.post('/auth/logout', async (req, res) => {
services/auth\auth-routes.js:139:    router.get('/auth/me', (req, res) => {
services/auth\auth-routes.js:143:    router.patch('/me/profile', requireUser, (req, res) => {
services/auth\auth-routes.js:173:    router.post('/me/focus-session', requireUser, (req, res) => {
services/auth\auth-routes.js:193:    router.post('/me/stats/import', requireUser, (req, res) => {
services/auth\auth-routes.js:212:    router.get('/me/stats', requireUser, (req, res) => {
services/auth\auth-routes.js:216:    router.get('/me/rooms', requireUser, (req, res) => {
services/auth\auth-routes.js:224:    router.delete('/me', requireUser, async (req, res) => {
services/admin\admin-routes.js:114:    router.get('/', (_req, res) => {
services/admin\admin-routes.js:118:    router.post('/api/login', async (req, res) => {
services/admin\admin-routes.js:142:    router.post('/api/logout', requireAdmin, (_req, res) => {
services/admin\admin-routes.js:149:    router.get('/api/overview', requireAdmin, (_req, res) => {
services/admin\admin-routes.js:183:    router.get('/api/dashboard', requireAdmin, async (_req, res) => {
services/admin\admin-routes.js:210:    router.get('/api/rooms', requireAdmin, (_req, res) => {
services/admin\admin-routes.js:226:    router.get('/api/rooms/:roomId', requireAdmin, (req, res) => {
services/admin\admin-routes.js:257:    router.post('/api/rooms/:roomId/close', requireAdmin, (req, res) => {
services/admin\admin-routes.js:275:    router.post('/api/rooms/:roomId/kick', requireAdmin, (req, res) => {
services/admin\admin-routes.js:301:    router.get('/api/reports', requireAdmin, (_req, res) => {
services/admin\admin-routes.js:318:    router.post('/api/rooms/:roomId/reports/:reportId/resolve', requireAdmin, (req, res) => {
services/admin\admin-routes.js:340:    router.get('/api/video-kill-switch', requireAdmin, (_req, res) => {
services/admin\admin-routes.js:349:    router.post('/api/video-kill-switch', requireAdmin, (req, res) => {
services/admin\admin-routes.js:362:    router.get('/api/users', requireAdmin, (req, res) => {
services/admin\admin-routes.js:404:    router.post('/api/users/:userId/ban', requireAdmin, (req, res) => setBanned(req, res, true));
services/admin\admin-routes.js:405:    router.post('/api/users/:userId/unban', requireAdmin, (req, res) => setBanned(req, res, false));
services/admin\admin-routes.js:409:    router.post('/api/broadcast', requireAdmin, (req, res) => {
services/admin\admin-routes.js:433:    router.delete('/api/broadcast', requireAdmin, (_req, res) => {
services/admin\admin-routes.js:444:    router.post('/api/backup', requireAdmin, async (_req, res) => {
services/admin\admin-routes.js:453:    router.get('/api/errors', requireAdmin, (_req, res) => {
services/admin\admin-routes.js:457:    router.get('/api/video-sessions', requireAdmin, (_req, res) => {
services/auth\google-routes.js:69:    router.get('/auth/google', (req, res) => {
services/auth\google-routes.js:98:    router.get('/auth/google/callback', async (req, res) => {
```
