# Coverage closure worklist

All rows are **PLANNED**. An uncounted pattern is a measurement gap, not a proven defect. The prior observer captured mutable mounted paths; replay existing suites with canonical originalUrl capture before writing new tests.

Baseline inventory: 119 API/auth/admin patterns + 14 socket commands = 133. Prior observation: 93 HTTP + 14 socket = 107 (80.45%). Of the 93 HTTP patterns, 88 had a positive response and five had only denial/failure responses. Do not alter the denominator to improve the percentage.

Source paths and line numbers refer to the planning baseline. Refresh them against
the implementation candidate before execution; retain stable boundary IDs for comparison.

## Twenty-six previously uncounted patterns

| ID | Method and canonical pattern | Current source | Verification to complete |
| --- | --- | --- | --- |
| H009 | `GET /api/rooms/:roomId` | `co-study-server.js:2189` | Existing room plus invalid/missing/full/password controls; bounded public metadata, no password/hash disclosure. Confirm canonical request capture before adding a new case. |
| H040 | `GET /auth/google` | `services/auth/google-routes.js:70` | Local Google fixture: enabled/disabled start, safe destination, state cookie and expected redirect. No actual Google login in local probes. |
| H041 | `GET /auth/google/callback` | `services/auth/google-routes.js:100` | Local provider fixture: valid callback, wrong/replayed state, provider denial, lookup failure and session/return behavior. |
| H046 | `GET <ADMIN>/api/dashboard` | `services/admin/admin-routes.js:183` | Synthetic shared admin before named-owner bootstrap; authorized dashboard, anonymous denial and explicit retirement after bootstrap. |
| H048 | `GET <ADMIN>/api/rooms/:roomId` | `services/admin/admin-routes.js:226` | Authorized room detail and missing-room control; no anonymous/member access to privileged fields; retired shared-admin state remains closed. |
| H053 | `GET <ADMIN>/api/video-kill-switch` | `services/admin/admin-routes.js:340` | Authorized read of configured video admission state; denial and post-bootstrap retirement controls. Do not alter a real provider. |
| H055 | `GET <ADMIN>/api/users` | `services/admin/admin-routes.js:362` | Authorized bounded user listing with intended fields only; anonymous/member denial and retirement after named-staff bootstrap. |
| H062 | `GET <ADMIN>/api/video-sessions` | `services/admin/admin-routes.js:457` | Synthetic video-session listing before bootstrap, empty state and unauthorized/retired access; no raw provider token in output. |
| H063 | `GET /api/platform/catalog` | `services/platform/routes.js:29` | Public catalog returns the fixed offer and actual availability; no provider credentials or accidental staff authority. |
| H070 | `GET /api/platform/progress/export` | `services/platform/routes.js:89` | VIP export with correct entitlement/history window, CSV escaping and own-user scope; free/anonymous/expired access controls. |
| H078 | `DELETE /api/platform/cohorts/:id/invitations` | `services/platform/routes.js:120` | Owner revokes invitation; previously issued token fails afterward, retry is safe and foreign/member mutation is denied. |
| H084 | `POST /api/platform/cohorts/:id/leave` | `services/platform/routes.js:144` | Member leaves circle; private HTTP/socket/RSVP/calendar/reminder access is revoked. Verify the distinct owner-leave rule. |
| H085 | `DELETE /api/platform/cohorts/:id/sessions/:sessionId` | `services/platform/routes.js:149` | Authorized manager cancels a scheduled session; agenda/calendar/RSVP/reminder state updates, foreign/member actions denied. |
| H088 | `GET /api/platform/rooms` | `services/platform/routes.js:171` | Own/assigned room list positive control; unrelated private room metadata absent; empty/unavailable states distinguished. |
| H098 | `PATCH /api/platform/staff/cases/:id` | `services/platform/routes.js:244` | Permission plus fresh MFA case update; missing ID/invalid input denied. Verify update+audit atomicity under injected failure without changing the already-correct tx.query block. |
| H102 | `GET /api/platform/staff/users` | `services/platform/routes.js:273` | Named staff with the required permission and fresh MFA can list intended user fields; ordinary/stale/revoked staff cannot. |
| H103 | `POST /api/platform/staff/users/:id/status` | `services/platform/routes.js:280` | Allowed moderation status update persists/audits and revokes affected sessions/sockets; preserve current self/owner protections and negative controls. |
| H105 | `POST /api/platform/staff/rooms/:id/:action` | `services/platform/routes.js:305` | Each allowed room action, invalid action, missing target and role/MFA denial; confirm only the intended synthetic participants are affected. |
| H108 | `POST /api/platform/staff/announcement` | `services/platform/routes.js:338` | Authorized announcement persists/audits and renders text safely; ordinary, stale-MFA and revoked staff cannot publish. |
| H109 | `DELETE /api/platform/staff/announcement` | `services/platform/routes.js:350` | Authorized removal and retry clear the announcement consistently; unauthorized removal cannot change state. |
| H110 | `POST /api/platform/staff/backup` | `services/platform/routes.js:358` | Named authorized staff with fresh MFA creates a complete snapshot; concurrent/failure/denial controls; no public backup URL or private content in review logs. |
| H124 | `PATCH /api/platform/study/projects/:id` | `services/platform/study-routes.js:97` | Own project edit/archive with optimistic versions and quotas; task/history preservation, retry and foreign-project controls. |
| H126 | `PATCH /api/platform/study/distractions/:id` | `services/platform/study-routes.js:97` | Own distraction edit/resolve/unresolve, caps and version conflict; foreign mutation denied and retries do not duplicate conversions. |
| H127 | `PATCH /api/platform/study/routines/:id` | `services/platform/study-routes.js:97` | Own routine edit/archive with bounds and version conflict; foreign edits denied; active guide snapshot remains coherent. |
| H130 | `DELETE /api/platform/study/bookmarks/:id` | `services/platform/study-routes.js:131` | Own favorite removed; retry/missing behavior matches the API contract and foreign deletion cannot remove another account favorite. |
| H136 | `DELETE /api/platform/study/circles/:id/resources/:resource` | `services/platform/study-routes.js:189` | Current authorized owner/supervisor archives resource; foreign/member/revoked permissions cannot mutate it and stale readers lose access. |

## Five denial-only observations need intended-state controls

| ID | Boundary | Planned control |
| --- | --- | --- |
| H064 | DigetPay notification | Configured local provider fixture accepts only the supported notification path; server lookup verifies binding, unknown/forged/duplicate hints cannot grant access. Retain the production-disabled control. |
| H089 | Room edit | Real synthetic owned/assigned room edit; foreign or stale permission cannot alter it; verify the allowed role contract. |
| H093 | Staff roster | Correct named role plus fresh MFA succeeds; ordinary, stale and revoked roles fail. |
| H131 | Agenda | Current-member positive listing, timezone/empty state and removed-member exclusion. |
| H132 | Calendar | Authenticated entitled events export valid ICS; anonymous and removed-member controls expose no private event. |

## Remaining fifty-eight full-file reviews

Read each file fully in domain batches; follow its critical calls and guard twins. Current depth is historical: R = route/selected sections, S = search/context, I = inventory/import only. None is silently promoted to a completed full read.

| ID | File | Prior depth | Suggested review batch | Status |
| --- | --- | --- | --- | --- |
| F002 | `server-https.js` | I | Runtime, rooms and media privacy | PLANNED |
| F004 | `co-study-server.js` | R | Runtime, rooms and media privacy | PLANNED |
| F005 | `room-store.js` | I | Runtime, rooms and media privacy | PLANNED |
| F006 | `user-store.js` | I | Identity, recovery and privilege | PLANNED |
| F008 | `schedule-utils.js` | I | Accounting, community, persistence and operations | PLANNED |
| F009 | `services/admin/admin-routes.js` | R | Identity, recovery and privilege | PLANNED |
| F010 | `services/auth/auth-routes.js` | R | Identity, recovery and privilege | PLANNED |
| F011 | `services/auth/google-routes.js` | S | Identity, recovery and privilege | PLANNED |
| F012 | `services/auth/index.js` | I | Identity, recovery and privilege | PLANNED |
| F013 | `services/auth/password.js` | I | Identity, recovery and privilege | PLANNED |
| F014 | `services/auth/reauth.js` | I | Identity, recovery and privilege | PLANNED |
| F018 | `services/ops/backup-scheduler.js` | S | Accounting, community, persistence and operations | PLANNED |
| F019 | `services/ops/error-buffer.js` | I | Accounting, community, persistence and operations | PLANNED |
| F022 | `services/platform/catalog.js` | S | Accounting, community, persistence and operations | PLANNED |
| F023 | `services/platform/cohorts.js` | S | Accounting, community, persistence and operations | PLANNED |
| F025 | `services/platform/dashboard.js` | I | Accounting, community, persistence and operations | PLANNED |
| F027 | `services/platform/digetpay-billing.js` | R | Accounting, community, persistence and operations | PLANNED |
| F029 | `services/platform/index.js` | S | Accounting, community, persistence and operations | PLANNED |
| F031 | `services/platform/progress.js` | S | Accounting, community, persistence and operations | PLANNED |
| F033 | `services/platform/routes.js` | R | Accounting, community, persistence and operations | PLANNED |
| F035 | `services/platform/study-planner.js` | R | Accounting, community, persistence and operations | PLANNED |
| F037 | `services/seo/public-pages.js` | R | Presentation, translation, SEO and disclosure | PLANNED |
| F040 | `services/video/index.js` | I | Runtime, rooms and media privacy | PLANNED |
| F041 | `services/video/mesh-provider.js` | I | Runtime, rooms and media privacy | PLANNED |
| F044 | `services/video/video-session-registry.js` | S | Runtime, rooms and media privacy | PLANNED |
| F045 | `public/js/focus-client.js` | S | Accounting, community, persistence and operations | PLANNED |
| F047 | `public/js/legal-shell.js` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F048 | `public/js/marketing-copy.js` | S | Presentation, translation, SEO and disclosure | PLANNED |
| F049 | `public/js/platform-copy.js` | S | Presentation, translation, SEO and disclosure | PLANNED |
| F050 | `public/js/platform.js` | R | Accounting, community, persistence and operations | PLANNED |
| F052 | `public/js/room-focus.js` | S | Accounting, community, persistence and operations | PLANNED |
| F054 | `public/js/schedule-display.js` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F055 | `public/js/study-copy.js` | S | Presentation, translation, SEO and disclosure | PLANNED |
| F056 | `public/js/study-routine.js` | I | Accounting, community, persistence and operations | PLANNED |
| F057 | `public/js/study-workspace.js` | R | Accounting, community, persistence and operations | PLANNED |
| F058 | `public/js/ui.js` | S | Presentation, translation, SEO and disclosure | PLANNED |
| F059 | `public/js/ux-insights.js` | S | Presentation, translation, SEO and disclosure | PLANNED |
| F060 | `public/js/video/realtimekit-client.js` | S | Runtime, rooms and media privacy | PLANNED |
| F061 | `public/js/video/video-client.js` | S | Runtime, rooms and media privacy | PLANNED |
| F062 | `404.html` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F063 | `account.html` | R | Identity, recovery and privilege | PLANNED |
| F064 | `admin.html` | S | Identity, recovery and privilege | PLANNED |
| F065 | `blog-best-study-rooms.html` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F066 | `blog-study-with-me.html` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F067 | `blog.html` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F068 | `contact.html` | S | Presentation, translation, SEO and disclosure | PLANNED |
| F069 | `index.html` | R | Runtime, rooms and media privacy | PLANNED |
| F070 | `landing.html` | S | Presentation, translation, SEO and disclosure | PLANNED |
| F071 | `lobby.html` | S | Runtime, rooms and media privacy | PLANNED |
| F072 | `open.html` | R | Runtime, rooms and media privacy | PLANNED |
| F073 | `platform.html` | S | Accounting, community, persistence and operations | PLANNED |
| F074 | `privacy.html` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F075 | `recovery.html` | I | Identity, recovery and privilege | PLANNED |
| F076 | `terms.html` | I | Presentation, translation, SEO and disclosure | PLANNED |
| F077 | `db/migrations/001-platform.sql` | I | Accounting, community, persistence and operations | PLANNED |
| F078 | `db/migrations/002-digetpay.sql` | I | Accounting, community, persistence and operations | PLANNED |
| F079 | `db/migrations/003-payment-review.sql` | I | Accounting, community, persistence and operations | PLANNED |
| F080 | `db/migrations/004-study-tools.sql` | I | Accounting, community, persistence and operations | PLANNED |

## Evidence contract

For each review/probe record source SHA, exact canonical method/path, actor/configuration, actual status and effect, positive and denial control, test/evidence path, and finding disposition. Avoid cookies, request bodies, query tokens and real user records in observer logs.

Use 133/133 dispositions and at least 95% executed/proven N/A as the target; every critical trust boundary must be resolved. A route disabled by design needs source/config proof and an enabled local-fixture control when that state is supported. Import/load coverage and a generic auth denial do not establish a working handler.

All fourteen socket commands still require current regression results; their prior observed status is not reused as a fresh pass. Keep a complete sibling matrix for branding, timeouts, provider errors, identity, scoped membership, media revocation and backup/restore table sets.
