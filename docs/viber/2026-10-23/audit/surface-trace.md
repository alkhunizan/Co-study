# Phase 3 surface trace ? Halastudy

2026-10-23, Asia/Riyadh. Source baseline: HEAD `a22b155`, branch `feat/2026-10-22-top-20`. This delegated pass read `references/03-trace.md` completely, then performed read-only source inspection. No app/test edits, runtime/database/provider probes, production calls or credentials. Only this report is written. Main agent owns probe execution, fixes and verdict. Suspicions below are probe candidates, not reproduced defects.

## Denominator and scope

Fresh static enumeration gives **150 explicit expanded GET/POST/PATCH/PUT/DELETE registrations**, including URL arrays and the four-kind study-router loop. Of these, **119 are API/auth/admin-API method/path patterns**. Together with **14 client socket commands**, the risky-boundary denominator is **133 patterns**. This counts each dynamic method/path pattern once; focus `:action` has four allowed actions and staff room `:action` has two. Do not mistake pattern count for behavior coverage. Implicit HEAD/OPTIONS, Socket.IO polling/websocket transport and middleware aliases/static mounts are separately listed, not double-counted.

The selected runtime/source denominator is **80 files**: 8 root runtime JS, 36 service JS, 17 browser JS, 15 root HTML templates and 4 schema files. The exact file IDs and inspection depth appear below. This is an inventory denominator; it is explicitly **not 80 fully reviewed files**. An additional 19 operator JS and 3 config/command files are listed separately. CSS/binary asset/third-party dependency verification belongs to the sweep/browser phases; no claims about those are made here.

## Page, route and exposure map

- Public rendered pages: `/`, `/en`, `/blog`, `/en/blog`, `/contact`, `/en/contact`, `/privacy`, `/en/privacy`, `/terms`, `/en/terms` and two Arabic article routes. Twelve pages are allowlisted in `services/seo/public-pages.js:23-45`; generated routes, robots and sitemap at `166-191`.
- Middleware aliases: `/landing.html` -> `/`, `/blog.html` -> `/blog`, `/privacy.html` -> `/privacy`, `/terms.html` -> `/terms`; lowercase/trailing slash and www canonicalization preserve query (`public-pages.js:170-178`).
- `/open` + `.html`: guest create/join, account-only legacy scheduled rooms, safe draft, calendar/WhatsApp. `/study`, `/workspace`, `/room`, `/index.html`: the in-room app. `/lobby` + `.html`: guest viewer/account publisher. `/account` + `.html`: auth/profile/history/deletion. `/recover` + `/recovery.html`: disabled-or-local recovery. `/app`, `/plans`, `/supervisor`: one platform shell; member views home/progress/circles/account/security/staff/planner. See `co-study-server.js:2219-2243` and `public/js/platform.js:464-519`.
- `<ADMIN>` is a configured path, mounted only if both valid admin path and hash are configured (`co-study-server.js:257-293,2246-2274`). Its HTML remains reachable when enabled; shared admin login/API is retired once named staff exists (`services/admin/admin-routes.js:77-81,118-121`). No configured secret path was read or printed.
- Static mounts: `/audio`, `/images`, `/videos`, `/js`, `/css`, `/design-system` (`co-study-server.js:1754-1767`). `/videos/hero/source` is blocked, and design-system serves CSS only. Root source, data, docs, backups, design previews and credentials have no generic static mount. Root `platform.html`/`admin.html` are templates, not direct public file routes. Unknown API gets JSON 404; unknown page gets 404 template (`2283-2303`).
- Framework transport: Socket.IO default `/socket.io/` uses polling GET/POST plus websocket upgrade; not a business REST API. No separate GraphQL/server-action framework or public worker endpoint found.
- Reachability qualifiers: Google auth returns 404 when unconfigured. Platform API returns 503 when disabled. Recovery routes exist but return honest disabled state/503 unless explicitly opted into a loopback local outbox in non-production. DigetPay real charges have no production-enabled path. Simulator is test/local billing mode. Reserved `raw-sfu-later` rejects at configuration rather than shipping a placeholder room (`server-config.js:73-75`). Operator CLIs and browser fixture providers are not HTTP features.

## Socket commands and emitted events

Client commands, all through `onClientEvent` (`services/socket-boundary.js:4-27`) and packet/session/scope checks (`co-study-server.js:2323-2344`):

| ID | Command | Handler |
| --- | --- | --- |
| S01 | create-room | co-study-server.js:2360 |
| S02 | join-room | co-study-server.js:2447 |
| S03 | send-message | co-study-server.js:2643 |
| S04 | board-set-goal | co-study-server.js:2677 |
| S05 | board-add-task | co-study-server.js:2698 |
| S06 | board-toggle-task | co-study-server.js:2730 |
| S07 | board-delete-task | co-study-server.js:2757 |
| S08 | board-reorder-tasks | co-study-server.js:2784 |
| S09 | camera-status | co-study-server.js:2832 |
| S10 | rtc-offer | co-study-server.js:2844 |
| S11 | rtc-answer | co-study-server.js:2853 |
| S12 | rtc-ice | co-study-server.js:2862 |
| S13 | user-status | co-study-server.js:2871 |
| S14 | report-user | co-study-server.js:2887 |

Outbound room events include presence/chat-message/board-state/status-update/camera-status, RTC relays, video-capacity/video-session-ended, announcement/announcement-clear, kicked and room-closed. Disconnect is a server lifecycle handler (`2950`) rather than an additional client command. Ack contract is `{ok:true,...}` or `{ok:false,errorCode}`; malformed payload/async errors are caught by the common boundary, while no-ack middleware failure and client ack deadlines still need explicit interruption probes.

## Third parties, storage, background work and operator actions

| Boundary | Code / behavior / classification |
| --- | --- |
| Cloudflare RealtimeKit | Server meeting create, participant token, kick/delete/close (`services/video/realtimekit-provider.js:65-199`); browser pinned SDK/UI loader via jsDelivr (`public/js/video/realtimekit-client.js:4-6`). Server issues participant tokens only, never the API credential. Live provider acceptance remains unverified here. |
| Legacy mesh/SFU | Browser P2P with configured STUN/TURN; fallback Google STUN (`co-study-server.js:80`), optional operator-generated Cloudflare TURN (`scripts/cloudflare/turn-credentials.js:76`). Configured legacy `SFU_BASE_URL` iframe (`index.html:4179-4213`). Native camera/FaceDetector are browser capabilities, not an external face-service call. |
| Google identity | Browser accounts.google.com consent, server oauth2.googleapis.com token and Google userinfo (`google-routes.js:20-22,70,100`). Nonce/PKCE/purpose/return state, identity linking and reauth require separate fake-provider tests. |
| DigetPay | Server `https://fin-api.digetpay.com/v1` create/status with 8s deadline and 64KiB response bound (`digetpay-client.js:22-56`); browser checkout limited to two exact HTTPS origins and `/pay/checkout` (`63-74`). Webhook is an unauthenticated hint, never independent proof; durable lookup job reconciles provider records (`digetpay-billing.js:175-240`). |
| PostgreSQL/PGlite | Explicit pg URL with single-runtime advisory lease, deadlines and transactions; local PGlite directory lock otherwise (`database.js:12-105`). SQL migration 004 is required. Runtime account/room records use optimistic revisions, one-time legacy JSON import and per-store queue (`record-store.js:16-105`). No horizontal multi-instance promise. |
| Supabase compatibility | Configured REST profile/events/admin analytics adapter (`services/supabase/client.js`, `supabase-user-store.js`). Service-role key stays server-side; profile persistence/backup semantics differ from canonical SQL. Its failure/privacy contract is an independent probe target, not verified from current local fixtures. |
| Recovery outbox | Loopback-only local JSON mail directory, explicitly impossible in production (`auth/recovery.js:9-27`); response 202 deliberately precedes lookup/delivery to avoid enumeration. Queue max 100; delivery errors alert, not fake mail success (`40-74`). No SMTP/live email integration found. |
| R2 | Operator-only signed S3-style calls to configured R2 bucket, test object and backup upload (`scripts/cloudflare/r2-client.js:90-203`, `scripts/backup-r2.js:55-94`). Platform backup path refuses incomplete legacy Supabase coverage. CLI can create bucket and upload/delete marker: do not invoke under local audit authority. |
| Operational alerts | Private journal plus optional configured HTTPS webhook, bounded/retried delivery with bearer header if configured; 5s flush (`services/ops/alerts.js:39-46,113-138`). No payload/credential values inspected. |
| In-browser reminders/counters | Opt-in Notifications while page open, fresh agenda/preferences before title display (`study-workspace.js:1137-1184`); local consent counters stay on device (`ux-insights.js`). No service worker, public feed or unsolicited server messaging. |
| External navigation/assets | Google Fonts, WhatsApp `wa.me`, mailto/tel support, article source links; user-supplied circle resources are credentialless HTTPS links opened with `noopener noreferrer`, not fetched by server. |

Background jobs: configurable backup interval (>=5m or off) and retention (`ops/backup-scheduler.js:65-81`); 30s video grant revocation drain (`video/revocations.js:81`), stale-video sweep (`co-study-server.js:1668-1690`), 30s payment reconciliation (`digetpay-billing.js:243-251`), room-empty 30m cleanup (`co-study-server.js:50,1353`), delayed departure message timers (`2989`), 250ms record-store debounce (`record-store.js:89-105`), 15s client focus/media heartbeat and browser-only routine/reminder loops. SIGINT/SIGTERM drain/flush/close are at `co-study-server.js:1698-1727`. No repository cron daemon or external worker deployment was found; CLIs/deployment config are supplementary surfaces, not automatically running jobs.

## Bounded critical-flow/error matrix

Status: **WORKS (source)** means a concrete guard/path was found, not a passed runtime test. **UNVERIFIED** means the main must exercise the referenced suite/probe on the current candidate. No historical passing counts are reused.

| Flow / relevant boundary | UI -> validation/auth -> logic/storage -> failure shown | Status; runnable suite targets |
| --- | --- | --- |
| Password signup/login/profile/logout/delete | `account.html:503-585,670-746`; `/api/auth/*` normalizes input, hashes, rechecks after await, flushes before auth acknowledgement (`auth-routes.js:84-181`). Profile uses per-account rollback queue (`46-80`). Delete reauth/epoch/socket revoke -> canonical purge -> cookie clear (`278-320`); SQL purge prevents last-owner deletion and cascades private records (`platform/index.js:94-114`, schemas 001/004). Shared content/backups follow separate policy. | Guards WORKS(source); failure rendering candidate P02 below. Targets auth/account-mutations/google-security/session-identity integration; account smoke. |
| Recovery/verification | `public/js/recovery.js` reads/scrubs fragment, honest config state, submit busy state and mapped disabled/expired/rate-limit/auth errors. Backend purpose/token/email/epoch/expiry checks are repeated inside shared mutation queue (`auth/recovery.js:76-111`). | WORKS(source), live mail MISSING by intentional boundary. Targets recovery integration/smoke, hash reload/retry probe. |
| OAuth/invitation continuation | Valid same-site return contract (`safe-return.js:3-12`), nonce-bound OAuth state and purpose-specific reauth. Circle fragment is retained in bounded session draft and only explicitly accepted; owner tokens hash/expire/revoke. | WORKS(source) seams; UNVERIFIED bad/expired state, linking mismatch, fragment-only navigation. Targets google-security, refinement-boundaries, circle-lifecycle, ux-journeys smoke. |
| Guest create/join / invitation | Open validates name/code/password/schedule; creation socket ack has 8s deadline (`open.html:1514-1545`); room lookup maps 404/429/non-2xx (`1269-1288`). Server scheduled-room account gate, password verify, resource scope, name/capacity rechecks and attendance failure cleanup (`co-study-server.js:2360-2641`). In-room join errors expose overlay and disable chat/board. | Core guards WORKS(source); P01 deadline probe; duplicate/lost ack/refresh UNVERIFIED. Targets server/presence/session-identity integration; open/create-timeout/app smoke. |
| Room chat/board/status/report | Common socket payload boundary + account epoch/scope check, per-concern limits, 100-task cap, server sanitization, private broadcasts. Rejected board draft retained; report persists case before ack (`co-study-server.js:2887-2947`). | WORKS(source) contracts; storage interruption/middleware no-ack UNVERIFIED. Targets socket-boundary/board-capacity/server integration; board-limit/resilience smoke. |
| Camera/media privacy | Verified join precedes token, publisher/viewer distinction and caps; mint lock, durable revocation intent and authority recheck after provider await (`co-study-server.js:1895-2125`). Browser shared lifecycle has deadlines/replacement generation; blur path requires processed stream (`index.html:2330-2391,4280-4318`). | Source guards WORKS; real-provider remote-observer acceptance UNVERIFIED. Targets video-client/video-session/media-revocation integration; camera-privacy/lobby/app smoke with fakes. |
| Verified focus/rewards | `focus-client.js` serializes action/heartbeat and pending completion retry. Server locks user/session, server clock/grace/single-open session, daily cap and deduplicated XP; reports completed sessions only (`progress.js:8-105`). Local countdown/imported history never independently awards XP. | WORKS(source) enforcement; runtime multiple tabs/clock/pause/restart UNVERIFIED. Targets platform/foundations/refinement-boundaries/ux-dashboard integration and platform/refinement smoke. |
| Planner/tasks/routines/reflections | Authenticated study subrouter has expected-account header (`study-routes.js:6-10`); server normalizers, resource ownership/version/capacity/idempotency, task-link immutable snapshot, canonical credited effort (`study-planner.js:78-136,178-240,243-475`). Mounted forms preserve drafts; routine guidance is local and authoritative focus is separate. | WORKS(source) seams; dirty draft/error/reload/multiple tabs UNVERIFIED. Targets study-tools/study-routine integration and study-tools smoke. |
| Favorites/agenda/RSVP/resources/reminders | Current-member joins and permissions, safe unavailable favorites, HTTPS resource validation, calendar escaping/folding, no false attendance from RSVP. Reminders refresh scope/opt-in before disclosure (`study-workspace.js:1144-1184`). | WORKS(source) guard map; removed-member, canceled session, failed GET, language and response-loss UNVERIFIED. Targets study-tools/circle-lifecycle integration and study-tools smoke. |
| Circle owner/supervisor/member | Membership/private scope is enforced server-side; archive/leave/remove disconnect existing members; scheduling commits scope then synchronously revokes listeners (`platform/routes.js:118-169`). Owners/supervisors schedule; ordinary attendance sees self. | WORKS(source) policy, runtime role/entitlement expiry/retry UNVERIFIED. Targets circle-lifecycle/platform-api/platform integration; platform/study-tools smoke. |
| Staff bootstrap/MFA/moderation | Password/provider proof -> TOTP/recovery -> 15m staff cookie bound to account session (`access.js:45-89`); roles and exact permissions separate from plan. Named-role changes clear staff sessions, disconnect target; legacy admin retired. Case update and audit use SAME tx (`routes.js:244-254`), refuting D01. | WORKS(source); each permission, expired MFA, audit/store failure UNVERIFIED. Targets platform-api/admin/account-mutations integration and platform/admin smoke. |
| Billing/test checkout/return/review | Catalog price fixed USD499 minor monthly. Simulator only local/test. DigetPay intent idempotency/provider origin+reference+amount checks; callback hints coalesced with fixed retries; reviewed payment activation needs named privileged staff and independently verified provider data. Frontend errors/retry/latest order differentiate unknown from success. | WORKS(source) boundaries; real merchant acceptance UNVERIFIED, production charges disabled. Targets digetpay/payment-reconciliation/platform-api integration; digetpay/payment-review smoke. |
| Persistence/backup/restart/readiness | SQL migrations/lease checks; canonical store CAS and deletion; v3 backup includes new study tables and accepts v1/v2 restore; restored account epoch changes (`maintenance.js:5-50`). Readiness/storage guard makes API unavailable rather than zero. | WORKS(source) structures; disposable PostgreSQL, backup/restore, lease loss/restart UNVERIFIED. Targets platform-storage/database-failure/study-tools integration; tests/postgres/outages.test.js; resilience smoke. |
| Public bilingual/SEO/navigation | Source allowlist server-translates approved routes; runtime noindex; no blanket repo static exposure; workspace Back/Forward/hash/focus and skip link are explicit (`platform.js:464-519`). | WORKS(source), rendered/readable/console/keyboard UNVERIFIED. Targets seo integration, SEO/landing/ux-journeys/ux-return/refinement smoke and verify:seo. |

## Ranked probe candidates

**P01 ? stalled entry/config requests.** `open.html:1271-1273` performs raw lookup fetch without signal/deadline. Join disables at `1597` and reenables only after it settles (`1617-1619`); a connected-but-stalled response has no code-enforced timeout. Runtime config raw fetches at `open.html:1256`, `index.html:1674` similarly bypass `HalaCore` 15s deadline, and media can await configuration. Main probe: intercept valid room lookup/config and hold beyond shared deadline; verify bounded failure, preserved code/password, enabled retry and camera-off continuation. This is a code-supported risk; no hung browser was reproduced by this subagent.

**P02 ? account unmapped backend errors.** `account.html:495-496` constructs `err${code}`; its `t()` falls back to the literal key. AR/EN dictionaries at `361-369,422-430` do not include `PERSISTENCE_UNAVAILABLE`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `STORAGE_STARTING`, or `LAST_SUPER_ADMIN`. Backend emits persistence failure at `auth-routes.js:69,124,315`; SQL deletion protection emits `LAST_SUPER_ADMIN` (`platform/index.js:99`). Main probe: synthetic profile/signup/deletion errors and last-owner rejection; verify natural localized cause/next action, preserved draft and no success toast. No runtime defect claim made yet.

**P03 ? socket middleware interruption.** Payload-handler exceptions are acknowledged, but packet middleware has paths calling only `next(new Error(...))` (`co-study-server.js:2324,2332,2338,2341`). Current join/chat/board clients differ in acknowledgement deadlines. Probe after valid join: revoke account/scope or inject transient `canJoin` failure while sending chat/board; require useful recovery, no leaked receiver access and no indefinite operation. Do not classify deliberate disconnect as failure merely because an ack is absent.

Broader safety probes are bounded by the matrix rather than speculative expansion: foreign IDs/wrong types, repeated completions/callbacks, expired invite/MFA, loading failure versus empty, response loss after commit, provider timeout/revoke retry, restore parity and shutdown. Use synthetic/local providers; no production action is required by any probe here.

## Dropped candidates ? 10

1. **Staff case transaction defect: retracted.** Initial review misread `routes.js:250`. Fresh `git show HEAD:services/platform/routes.js` AND current file both have `tx.query` and `audit(tx)`; no source diff. No fix is justified by that suspicion.
2. **Unsafe account backslash return:** shared safe-return rejects backslash/control/encoded control/protocol-relative and normalized double-slash paths (`safe-return.js:3-12`). Keep hostile-target regression, do not reopen the older bug from history.
3. **Manual/imported focus grants XP:** account history is explicitly distinct; canonical progress alone owns XP. No client-import-to-ledger path found in the inspected routers.
4. **Routine generic pause/reload drift:** authoritative matching-session pause/resume reconciliation now exists, including `last_seen_at` restore (`study-workspace.js:503-551`). Runtime still needs suite verification.
5. **Mismatched routine cannot stop:** guard explicitly excludes stop (`571-583`), and only matching active session is paused (`607-611`).
6. **Active unlinked task selector permanently disabled:** event handler keys to actual session/link and permits active-unlinked attach (`1228-1233`).
7. **Language switch destroys resource draft:** same-circle/account values and request key are captured/restored (`1042-1106`).
8. **Journal stale-response overwrite:** request/account generation guard and cursor reset exist (`833-849`).
9. **Same-context new-account study write:** study requests send expected account header (`study-workspace.js:6-9`); router rejects mismatch (`study-routes.js:6-10`); client hides/reloads on mismatch and platform refreshes auth on focus (`platform.js:520-528`).
10. **Backups omit new study data:** v3 inventory includes ten study tables and retains old snapshot import (`maintenance.js:5-50`), schema readiness requires migration4 (`database.js:97-105`).

Fixes by this delegated pass: **none**. Probe results, final screenshots, corrected-source manifests and gate receipts must come from the main pass.

## Exact HTTP registration IDs

Every row is statically enumerated from the current source; `<ADMIN>` denotes configured base path. Includes reachable and configuration-gated routes. No runtime pass implied.

| ID | Method/path | Registration |
| --- | --- | --- |
| H001 | `GET /manifest.webmanifest` | `co-study-server.js:1837` |
| H002 | `GET /api/health` | `co-study-server.js:1842` |
| H003 | `GET /api/ready` | `co-study-server.js:1851` |
| H004 | `GET /api/metrics` | `co-study-server.js:1861` |
| H005 | `GET /api/runtime-config` | `co-study-server.js:1878` |
| H006 | `POST /api/rooms/:roomId/video-token` | `co-study-server.js:1895` |
| H007 | `POST /api/rooms/:roomId/video-heartbeat` | `co-study-server.js:2129` |
| H008 | `POST /api/rooms/:roomId/video-leave` | `co-study-server.js:2163` |
| H009 | `GET /api/rooms/:roomId` | `co-study-server.js:2189` |
| H010 | `GET /open.html` | `co-study-server.js:2219` |
| H011 | `GET /open` | `co-study-server.js:2219` |
| H012 | `GET /app` | `co-study-server.js:2223` |
| H013 | `GET /plans` | `co-study-server.js:2223` |
| H014 | `GET /supervisor` | `co-study-server.js:2223` |
| H015 | `GET /account.html` | `co-study-server.js:2228` |
| H016 | `GET /account` | `co-study-server.js:2228` |
| H017 | `GET /recover` | `co-study-server.js:2231` |
| H018 | `GET /recovery.html` | `co-study-server.js:2231` |
| H019 | `GET /index.html` | `co-study-server.js:2238` |
| H020 | `GET /study` | `co-study-server.js:2238` |
| H021 | `GET /workspace` | `co-study-server.js:2238` |
| H022 | `GET /room` | `co-study-server.js:2238` |
| H023 | `GET /lobby` | `co-study-server.js:2242` |
| H024 | `GET /lobby.html` | `co-study-server.js:2242` |
| H025 | `GET /api/announcement` | `co-study-server.js:2278` |
| H026 | `POST /api/auth/signup` | `services/auth/auth-routes.js:84` |
| H027 | `POST /api/auth/login` | `services/auth/auth-routes.js:131` |
| H028 | `POST /api/auth/logout` | `services/auth/auth-routes.js:172` |
| H029 | `GET /api/auth/me` | `services/auth/auth-routes.js:186` |
| H030 | `PATCH /api/me/profile` | `services/auth/auth-routes.js:190` |
| H031 | `POST /api/me/focus-session` | `services/auth/auth-routes.js:223` |
| H032 | `POST /api/me/stats/import` | `services/auth/auth-routes.js:246` |
| H033 | `GET /api/me/stats` | `services/auth/auth-routes.js:266` |
| H034 | `GET /api/me/rooms` | `services/auth/auth-routes.js:270` |
| H035 | `DELETE /api/me` | `services/auth/auth-routes.js:278` |
| H036 | `GET /api/auth/recovery/config` | `services/auth/recovery.js:36` |
| H037 | `POST /api/auth/recovery/request` | `services/auth/recovery.js:61` |
| H038 | `POST /api/me/email-verification` | `services/auth/recovery.js:69` |
| H039 | `POST /api/auth/recovery/complete` | `services/auth/recovery.js:76` |
| H040 | `GET /auth/google` | `services/auth/google-routes.js:70` |
| H041 | `GET /auth/google/callback` | `services/auth/google-routes.js:100` |
| H042 | `GET <ADMIN>/` | `services/admin/admin-routes.js:114` |
| H043 | `POST <ADMIN>/api/login` | `services/admin/admin-routes.js:118` |
| H044 | `POST <ADMIN>/api/logout` | `services/admin/admin-routes.js:142` |
| H045 | `GET <ADMIN>/api/overview` | `services/admin/admin-routes.js:149` |
| H046 | `GET <ADMIN>/api/dashboard` | `services/admin/admin-routes.js:183` |
| H047 | `GET <ADMIN>/api/rooms` | `services/admin/admin-routes.js:210` |
| H048 | `GET <ADMIN>/api/rooms/:roomId` | `services/admin/admin-routes.js:226` |
| H049 | `POST <ADMIN>/api/rooms/:roomId/close` | `services/admin/admin-routes.js:257` |
| H050 | `POST <ADMIN>/api/rooms/:roomId/kick` | `services/admin/admin-routes.js:275` |
| H051 | `GET <ADMIN>/api/reports` | `services/admin/admin-routes.js:301` |
| H052 | `POST <ADMIN>/api/rooms/:roomId/reports/:reportId/resolve` | `services/admin/admin-routes.js:318` |
| H053 | `GET <ADMIN>/api/video-kill-switch` | `services/admin/admin-routes.js:340` |
| H054 | `POST <ADMIN>/api/video-kill-switch` | `services/admin/admin-routes.js:349` |
| H055 | `GET <ADMIN>/api/users` | `services/admin/admin-routes.js:362` |
| H056 | `POST <ADMIN>/api/users/:userId/ban` | `services/admin/admin-routes.js:404` |
| H057 | `POST <ADMIN>/api/users/:userId/unban` | `services/admin/admin-routes.js:405` |
| H058 | `POST <ADMIN>/api/broadcast` | `services/admin/admin-routes.js:409` |
| H059 | `DELETE <ADMIN>/api/broadcast` | `services/admin/admin-routes.js:433` |
| H060 | `POST <ADMIN>/api/backup` | `services/admin/admin-routes.js:444` |
| H061 | `GET <ADMIN>/api/errors` | `services/admin/admin-routes.js:453` |
| H062 | `GET <ADMIN>/api/video-sessions` | `services/admin/admin-routes.js:457` |
| H063 | `GET /api/platform/catalog` | `services/platform/routes.js:29` |
| H064 | `POST /api/platform/billing/digetpay/webhook` | `services/platform/routes.js:33` |
| H065 | `GET /api/platform/me` | `services/platform/routes.js:68` |
| H066 | `GET /api/platform/progress` | `services/platform/routes.js:82` |
| H067 | `GET /api/platform/dashboard` | `services/platform/routes.js:86` |
| H068 | `POST /api/platform/focus/start` | `services/platform/routes.js:87` |
| H069 | `POST /api/platform/focus/:id/:action` | `services/platform/routes.js:88` |
| H070 | `GET /api/platform/progress/export` | `services/platform/routes.js:89` |
| H071 | `POST /api/platform/billing/checkout` | `services/platform/routes.js:102` |
| H072 | `GET /api/platform/billing/latest` | `services/platform/routes.js:105` |
| H073 | `POST /api/platform/billing/checkout/:id/verify` | `services/platform/routes.js:108` |
| H074 | `POST /api/platform/billing/checkout/:id/complete` | `services/platform/routes.js:112` |
| H075 | `POST /api/platform/billing/cancellation` | `services/platform/routes.js:114` |
| H076 | `POST /api/platform/cohorts` | `services/platform/routes.js:118` |
| H077 | `POST /api/platform/cohorts/accept` | `services/platform/routes.js:119` |
| H078 | `DELETE /api/platform/cohorts/:id/invitations` | `services/platform/routes.js:120` |
| H079 | `POST /api/platform/cohorts/:id/invitations` | `services/platform/routes.js:124` |
| H080 | `GET /api/platform/cohorts/:id/members` | `services/platform/routes.js:125` |
| H081 | `PATCH /api/platform/cohorts/:id/members/:userId` | `services/platform/routes.js:126` |
| H082 | `GET /api/platform/cohorts/:id/sessions` | `services/platform/routes.js:133` |
| H083 | `POST /api/platform/cohorts/:id/archive` | `services/platform/routes.js:134` |
| H084 | `POST /api/platform/cohorts/:id/leave` | `services/platform/routes.js:144` |
| H085 | `DELETE /api/platform/cohorts/:id/sessions/:sessionId` | `services/platform/routes.js:149` |
| H086 | `POST /api/platform/cohorts/:id/sessions` | `services/platform/routes.js:153` |
| H087 | `GET /api/platform/cohorts/:id/sessions/:sessionId/attendance` | `services/platform/routes.js:169` |
| H088 | `GET /api/platform/rooms` | `services/platform/routes.js:171` |
| H089 | `PATCH /api/platform/rooms/:id` | `services/platform/routes.js:181` |
| H090 | `POST /api/platform/security/mfa/enroll` | `services/platform/routes.js:194` |
| H091 | `POST /api/platform/security/mfa/verify` | `services/platform/routes.js:203` |
| H092 | `POST /api/platform/staff/bootstrap` | `services/platform/routes.js:210` |
| H093 | `GET /api/platform/staff` | `services/platform/routes.js:217` |
| H094 | `POST /api/platform/staff/roles` | `services/platform/routes.js:222` |
| H095 | `GET /api/platform/staff/audit` | `services/platform/routes.js:231` |
| H096 | `GET /api/platform/staff/overview` | `services/platform/routes.js:235` |
| H097 | `GET /api/platform/staff/cases` | `services/platform/routes.js:240` |
| H098 | `PATCH /api/platform/staff/cases/:id` | `services/platform/routes.js:244` |
| H099 | `GET /api/platform/staff/subscriptions` | `services/platform/routes.js:257` |
| H100 | `GET /api/platform/staff/payment-orders` | `services/platform/routes.js:261` |
| H101 | `POST /api/platform/staff/payment-orders/:id/recheck` | `services/platform/routes.js:265` |
| H102 | `GET /api/platform/staff/users` | `services/platform/routes.js:273` |
| H103 | `POST /api/platform/staff/users/:id/status` | `services/platform/routes.js:280` |
| H104 | `GET /api/platform/staff/rooms` | `services/platform/routes.js:299` |
| H105 | `POST /api/platform/staff/rooms/:id/:action` | `services/platform/routes.js:305` |
| H106 | `GET /api/platform/staff/operations` | `services/platform/routes.js:323` |
| H107 | `POST /api/platform/staff/video` | `services/platform/routes.js:331` |
| H108 | `POST /api/platform/staff/announcement` | `services/platform/routes.js:338` |
| H109 | `DELETE /api/platform/staff/announcement` | `services/platform/routes.js:350` |
| H110 | `POST /api/platform/staff/backup` | `services/platform/routes.js:358` |
| H111 | `GET /api/platform/study/overview` | `services/platform/study-routes.js:25` |
| H112 | `GET /api/platform/study/insights` | `services/platform/study-routes.js:31` |
| H113 | `GET /api/platform/study/journal` | `services/platform/study-routes.js:37` |
| H114 | `PUT /api/platform/study/preferences` | `services/platform/study-routes.js:50` |
| H115 | `GET /api/platform/study/preferences` | `services/platform/study-routes.js:56` |
| H116 | `PUT /api/platform/study/focus/:id/task` | `services/platform/study-routes.js:62` |
| H117 | `PUT /api/platform/study/focus/:id/reflection` | `services/platform/study-routes.js:70` |
| H118 | `POST /api/platform/study/tasks/:id/complete` | `services/platform/study-routes.js:76` |
| H119 | `POST /api/platform/study/distractions/:id/convert` | `services/platform/study-routes.js:84` |
| H120 | `POST /api/platform/study/projects` | `services/platform/study-routes.js:91` |
| H121 | `POST /api/platform/study/tasks` | `services/platform/study-routes.js:91` |
| H122 | `POST /api/platform/study/distractions` | `services/platform/study-routes.js:91` |
| H123 | `POST /api/platform/study/routines` | `services/platform/study-routes.js:91` |
| H124 | `PATCH /api/platform/study/projects/:id` | `services/platform/study-routes.js:97` |
| H125 | `PATCH /api/platform/study/tasks/:id` | `services/platform/study-routes.js:97` |
| H126 | `PATCH /api/platform/study/distractions/:id` | `services/platform/study-routes.js:97` |
| H127 | `PATCH /api/platform/study/routines/:id` | `services/platform/study-routes.js:97` |
| H128 | `GET /api/platform/study/bookmarks` | `services/platform/study-routes.js:106` |
| H129 | `POST /api/platform/study/bookmarks` | `services/platform/study-routes.js:118` |
| H130 | `DELETE /api/platform/study/bookmarks/:id` | `services/platform/study-routes.js:131` |
| H131 | `GET /api/platform/study/agenda` | `services/platform/study-routes.js:138` |
| H132 | `GET /api/platform/study/calendar.ics` | `services/platform/study-routes.js:147` |
| H133 | `PUT /api/platform/study/agenda/:id/rsvp` | `services/platform/study-routes.js:159` |
| H134 | `GET /api/platform/study/circles/:id/resources` | `services/platform/study-routes.js:171` |
| H135 | `POST /api/platform/study/circles/:id/resources` | `services/platform/study-routes.js:177` |
| H136 | `DELETE /api/platform/study/circles/:id/resources/:resource` | `services/platform/study-routes.js:189` |
| H137 | `GET /` | `services/seo/public-pages.js:187` |
| H138 | `GET /en` | `services/seo/public-pages.js:187` |
| H139 | `GET /blog` | `services/seo/public-pages.js:187` |
| H140 | `GET /en/blog` | `services/seo/public-pages.js:187` |
| H141 | `GET /contact` | `services/seo/public-pages.js:187` |
| H142 | `GET /en/contact` | `services/seo/public-pages.js:187` |
| H143 | `GET /privacy` | `services/seo/public-pages.js:187` |
| H144 | `GET /en/privacy` | `services/seo/public-pages.js:187` |
| H145 | `GET /terms` | `services/seo/public-pages.js:187` |
| H146 | `GET /en/terms` | `services/seo/public-pages.js:187` |
| H147 | `GET /blog/best-online-group-study-rooms-saudi` | `services/seo/public-pages.js:187` |
| H148 | `GET /blog/study-with-me-online-arabic` | `services/seo/public-pages.js:187` |
| H149 | `GET /robots.txt` | `services/seo/public-pages.js:182` |
| H150 | `GET /sitemap.xml` | `services/seo/public-pages.js:184` |

## Exact runtime file IDs and inspection depth

Depth: **F** full file text read in this pass; **R** relevant blocks read/traced (not full file); **S** search/registration hits only; **I** inventory only. These labels prevent an enumerated denominator from being presented as a complete manual review. Previous-session reads are not counted as current full reads.

| ID | File | Depth |
| --- | --- | --- |
| F001 | `server.js` | I |
| F002 | `server-https.js` | I |
| F003 | `server-config.js` | F |
| F004 | `co-study-server.js` | R |
| F005 | `room-store.js` | I |
| F006 | `user-store.js` | I |
| F007 | `supabase-user-store.js` | S |
| F008 | `schedule-utils.js` | I |
| F009 | `services/admin/admin-routes.js` | R |
| F010 | `services/auth/auth-routes.js` | R |
| F011 | `services/auth/google-routes.js` | S |
| F012 | `services/auth/index.js` | I |
| F013 | `services/auth/password.js` | I |
| F014 | `services/auth/reauth.js` | I |
| F015 | `services/auth/recovery.js` | F |
| F016 | `services/logging/logger.js` | S |
| F017 | `services/ops/alerts.js` | S |
| F018 | `services/ops/backup-scheduler.js` | S |
| F019 | `services/ops/error-buffer.js` | I |
| F020 | `services/platform/access.js` | F |
| F021 | `services/platform/billing.js` | I |
| F022 | `services/platform/catalog.js` | S |
| F023 | `services/platform/cohorts.js` | S |
| F024 | `services/platform/common.js` | I |
| F025 | `services/platform/dashboard.js` | I |
| F026 | `services/platform/database.js` | F |
| F027 | `services/platform/digetpay-billing.js` | R |
| F028 | `services/platform/digetpay-client.js` | F |
| F029 | `services/platform/index.js` | S |
| F030 | `services/platform/maintenance.js` | F |
| F031 | `services/platform/progress.js` | S |
| F032 | `services/platform/record-store.js` | F |
| F033 | `services/platform/routes.js` | R |
| F034 | `services/platform/study-community.js` | S |
| F035 | `services/platform/study-planner.js` | R |
| F036 | `services/platform/study-routes.js` | F |
| F037 | `services/seo/public-pages.js` | R |
| F038 | `services/socket-boundary.js` | F |
| F039 | `services/supabase/client.js` | S |
| F040 | `services/video/index.js` | I |
| F041 | `services/video/mesh-provider.js` | I |
| F042 | `services/video/realtimekit-provider.js` | S |
| F043 | `services/video/revocations.js` | F |
| F044 | `services/video/video-session-registry.js` | S |
| F045 | `public/js/focus-client.js` | S |
| F046 | `public/js/halastudy-core.js` | R |
| F047 | `public/js/legal-shell.js` | I |
| F048 | `public/js/marketing-copy.js` | S |
| F049 | `public/js/platform-copy.js` | S |
| F050 | `public/js/platform.js` | R |
| F051 | `public/js/recovery.js` | F |
| F052 | `public/js/room-focus.js` | S |
| F053 | `public/js/safe-return.js` | F |
| F054 | `public/js/schedule-display.js` | I |
| F055 | `public/js/study-copy.js` | S |
| F056 | `public/js/study-routine.js` | I |
| F057 | `public/js/study-workspace.js` | R |
| F058 | `public/js/ui.js` | S |
| F059 | `public/js/ux-insights.js` | S |
| F060 | `public/js/video/realtimekit-client.js` | S |
| F061 | `public/js/video/video-client.js` | S |
| F062 | `404.html` | I |
| F063 | `account.html` | R |
| F064 | `admin.html` | S |
| F065 | `blog-best-study-rooms.html` | I |
| F066 | `blog-study-with-me.html` | I |
| F067 | `blog.html` | I |
| F068 | `contact.html` | S |
| F069 | `index.html` | R |
| F070 | `landing.html` | S |
| F071 | `lobby.html` | S |
| F072 | `open.html` | R |
| F073 | `platform.html` | S |
| F074 | `privacy.html` | I |
| F075 | `recovery.html` | I |
| F076 | `terms.html` | I |
| F077 | `db/migrations/001-platform.sql` | I |
| F078 | `db/migrations/002-digetpay.sql` | I |
| F079 | `db/migrations/003-payment-review.sql` | I |
| F080 | `db/migrations/004-study-tools.sql` | I |

## Supplementary operator/config inventory ? 22 files

These are not public endpoint handlers. Listing is not authorization to execute them; setup/cleanup/backup/provider CLIs can mutate external state.

- O01: `scripts/backup-r2.js`
- O02: `scripts/backup-rooms.js`
- O03: `scripts/check-platform.js`
- O04: `scripts/cloudflare/create-viewer-preset.js`
- O05: `scripts/cloudflare/r2-client.js`
- O06: `scripts/cloudflare/realtimekit-cleanup.js`
- O07: `scripts/cloudflare/realtimekit-common.js`
- O08: `scripts/cloudflare/realtimekit-cost-check.js`
- O09: `scripts/cloudflare/realtimekit-doctor.js`
- O10: `scripts/cloudflare/realtimekit-setup.js`
- O11: `scripts/cloudflare/realtimekit-smoke.js`
- O12: `scripts/cloudflare/turn-credentials.js`
- O13: `scripts/hash-admin-password.js`
- O14: `scripts/platform-maintenance.js`
- O15: `scripts/preview-platform.js`
- O16: `scripts/restore-rooms.js`
- O17: `scripts/room-state-utils.js`
- O18: `scripts/verify-deploy.js`
- O19: `scripts/verify-seo.js`
- O20: `ecosystem.config.js`
- O21: `docker-compose.yml`
- O22: `package.json`

Operator categories: local preview/hash/check/verification; canonical platform migrate/backup/restore; legacy room backup/restore; provider setup/preset creation, smoke/doctor/cost inspection, cleanup, TURN credential creation; R2 upload/round-trip. Deploy config declares the existing single-instance app. Data filenames `data/rooms.json` and `data/users.json` are runtime inputs, not public pages; contents were not read. Internal design-system HTML previews/assets are blocked by its CSS-only middleware; docs/tester artifacts have no application route. Test fixture files and temporary test servers are test-only and not added to the public-route count.
