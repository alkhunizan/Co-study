# Endpoint coverage and independent refutation

This matrix is an evidence map, not a fresh test run by this reviewer. Existing test sources and the main-agent targeted, HTTP-payment, and socket probe outputs were read. A test name does not prove its latest execution passed; use the main RUN.md logs for suite outcomes. New actual receipts are `evidence/http-payment-probes.json` and `evidence/socket-probes.json`; the external payment provider alone is fake in the HTTP probe, not the application handlers.

## Independent refutation

**V4-01 remains P2, sandbox availability.** The 20 distinct transaction hints really produce 20 durable rows and 10 fake provider queries in one drain. The original queue reproduction used direct service calls; the follow-up HTTP probe now confirms 20 anonymous transaction hints are all accepted by the real route, below its 120/min per-IP guard. No per-order/global cap exists. An owner can learn their own UUID through checkout, so UUID secrecy does not remove reachability. Session mode's one-row positive control materially narrows the finding. Do not claim actual charges, production theft, 20 retry executions, or measured provider monetary cost: none were demonstrated. Production mode blocks the adapter.

**V4-02 remains P2, sandbox reconciliation availability.** A/B expiry and C creation use the actual checkout function and legal time progression, not manually corrupted order state. First delayed approval A succeeds, establishing positive control; B then collides with the one-open-order index and its whole transaction rolls back, leaving B unbound/expired and C pending. The fixture does not prove DigetPay permits payment after 48 hours, but that is unnecessary: an earlier approval with delayed/missed reconciliation reaches the same state. The worker excludes expired orders after local expiry; manual verification/notifications can still reach reconciliation. This is a lost review/retry path, not a demonstrated second entitlement or financial theft. Provider-specific delayed status behavior still needs merchant acceptance.

## Independent review of the two fixture corrections

Reviewed the exact current diff for `tests/integration/circle-lifecycle.integration.test.js:11` and `tests/integration/presence.integration.test.js:9`. Each changes only its createPlatform environment object, adding `NODE_ENV: 'test'` and `BILLING_PROVIDER: 'simulator'`. No assertion, test body, skip, expected status, or production source is changed.

The initial log `evidence/test-integration.txt:193–205` and `:435–447` shows both tests failed at their setup checkout with CHECKOUT_UNCONFIGURED, through digetpay-billing.js, before reaching their circle/presence assertions. `services/platform/index.js:15–28` now defaults to DigetPay when the passed env omits NODE_ENV; these tests pass their own explicit env object rather than inheriting the test runner environment. They intentionally purchase simulated VIP as setup for unrelated scope/presence tests. Declaring the simulator is the correct fixture repair; it does not weaken payment security checks or bypass the behavior these tests assert. `evidence/V2-01-after.txt` records both exact named tests passing, 2/2, no skips. Full-suite rerun was still in progress at review time and is not inferred from the focused result.

## Classification

- R = named real local HTTP/socket/browser scenario with a specific request or directly observed endpoint effect. It may be negative-only, expressly stated. Payment simulator and provider fixtures are identified.
- B = real HTTP boundary probe only. It does not cover authorized business behavior.
- I = real browser flow implies a request from inspected client code, without an endpoint-specific assertion; excluded from strict substantive coverage.
- M = app endpoint intercepted/mocked in the browser, or service-only evidence; not authenticated HTTP success coverage.
- U = no named route-specific runtime evidence found.
- Source trace F = route, enforcing service/guard and displayed failure traced in trace.md; P = only route/upstream boundary or parts traced. F does not mean all branches covered.
- Gate A = main targeted-probes.json recorded anonymous 401 for the exact platform registration. This is a current local boundary receipt, independent of named test classification.

Test references below are relative to tests/integration unless `.smoke.spec.js`, which is under tests/smoke. File:line refers to the request/assertion or enclosing named scenario; the accompanying phrase identifies the scenario. Dynamic `:action` is one registered endpoint; testing complete does not cover every action.

## Totals

HTTP/identity denominator: **89 registrations**. Classifications: **70 R**, **9 B**, **5 I**, **0 M**, **5 U**. Current targeted anonymous receipt: **42/89**, all protected platform registrations. Strict named substantive HTTP evidence: **70/89 (78.7%)**; this includes negative-only assertions as labeled and should not be described as full positive-path coverage.

Socket denominator: **14 commands**: **14 R, 0 B**. All 14 have a named malformed-input boundary test and an explicit substantive case; the four signaling/camera gaps were closed by the actual socket receipt. Combined strict substantive mapped surface evidence: **84/103 (81.6%)**. This combines named tests with recorded current probes; it is not a claim that every branch or provider integration has passed.

The largest remaining positive-path gaps are staff mutations, circle leave/session cancellation, and legacy admin logout/dashboard/users/video sessions. The configured DigetPay application HTTP path is now exercised with a fake external provider; actual merchant/provider behavior remains unverified.

## HTTP matrix

| Method and endpoint | Registration | Source trace | Test class | Gate | Named evidence / limitation |
|---|---|---|---|---|---|
| GET `/api/health` | co-study-server.js:1841 | P | R | — | server.integration.test.js:103 — health and readiness report healthy HTTP app |
| GET `/api/ready` | co-study-server.js:1850 | P | R | — | server.integration.test.js:104 — health and readiness report healthy HTTP app |
| GET `/api/metrics` | co-study-server.js:1860 | P | R | — | admin.integration.test.js:415 — errors/metrics/API 404 |
| GET `/api/runtime-config` | co-study-server.js:1877 | P | R | — | server.integration.test.js:188 — default ICE servers/runtime config |
| POST `/api/rooms/:roomId/video-token` | co-study-server.js:1894 | P | R | — | server.integration.test.js:511 — joined video lifecycle; provider stub |
| POST `/api/rooms/:roomId/video-heartbeat` | co-study-server.js:2128 | P | R | — | server.integration.test.js:975 — joined video lifecycle; provider stub |
| POST `/api/rooms/:roomId/video-leave` | co-study-server.js:2162 | P | R | — | server.integration.test.js:985 — joined video lifecycle; provider stub |
| GET `/api/rooms/:roomId` | co-study-server.js:2188 | P | R | — | server.integration.test.js:1723 — protected GET safe preview; no private state |
| GET `/api/announcement` | co-study-server.js:2277 | P | R | — | admin.integration.test.js:293 — broadcast reaches sockets; clear stops it |
| POST `/api/auth/signup` | services/auth/auth-routes.js:84 | F | R | — | auth.integration.test.js:31 — signup cookie/profile; invalid input and duplicate tests |
| POST `/api/auth/login` | services/auth/auth-routes.js:131 | F | R | — | auth.integration.test.js:111 — login correctness/no enumeration |
| POST `/api/auth/logout` | services/auth/auth-routes.js:172 | F | R | — | auth.integration.test.js:167 — logout clears cookie; replay becomes guest |
| GET `/api/auth/me` | services/auth/auth-routes.js:186 | F | R | — | auth.integration.test.js:174 — guest after logout |
| PATCH `/api/me/profile` | services/auth/auth-routes.js:190 | F | R | — | auth.integration.test.js:184 — profile type/bounds and unauthenticated guard |
| POST `/api/me/focus-session` | services/auth/auth-routes.js:223 | F | R | — | auth.integration.test.js:220 — focus accumulation/invalid minutes |
| POST `/api/me/stats/import` | services/auth/auth-routes.js:246 | F | R | — | auth.integration.test.js:261 — max-per-day/idempotent import |
| GET `/api/me/stats` | services/auth/auth-routes.js:266 | F | R | — | auth.integration.test.js:245 — focus totals returned |
| GET `/api/me/rooms` | services/auth/auth-routes.js:270 | F | R | — | auth.integration.test.js:392 — created/joined room history |
| DELETE `/api/me` | services/auth/auth-routes.js:278 | F | R | — | auth.integration.test.js:314 — reauth, durable removal, session killed |
| GET `/api/auth/recovery/config` | services/auth/recovery.js:36 | F | R | — | http-payment-probe.cjs:46 — real HTTP returns exact disabled config; local enabled flow separately covered |
| POST `/api/auth/recovery/request` | services/auth/recovery.js:61 | F | R | — | recovery.integration.test.js:28 — known/unknown response parity; local mail only |
| POST `/api/me/email-verification` | services/auth/recovery.js:69 | F | R | — | recovery.integration.test.js:93 — verification preserves password/session; local mail only |
| POST `/api/auth/recovery/complete` | services/auth/recovery.js:76 | F | R | — | recovery.integration.test.js:45 — single-use concurrent reset; local mail only |
| GET `/auth/google` | services/auth/google-routes.js:69 | F | R | — | google-security.integration.test.js:41 — state/PKCE/linking/reauth; fake Google |
| GET `/auth/google/callback` | services/auth/google-routes.js:98 | F | R | — | google-security.integration.test.js:45 — state/PKCE/linking/reauth; fake Google |
| GET `/api/platform/catalog` | services/platform/routes.js:27 | F | R | — | evidence/targeted-probes.json — catalog 200, checkout unavailable |
| POST `/api/platform/billing/digetpay/webhook` | services/platform/routes.js:31 | F | R | — | http-payment-probe.cjs:54 — 20 anonymous transaction hints all accepted HTTP 200; no entitlement claim |
| GET `/api/platform/me` | services/platform/routes.js:53 | F | R | A | platform-api.integration.test.js:23 — free benefits and revoked account 401 |
| GET `/api/platform/progress` | services/platform/routes.js:67 | F | R | A | platform.smoke.spec.js:108 — completed focus history; real local server |
| POST `/api/platform/focus/start` | services/platform/routes.js:71 | F | R | A | platform-api.integration.test.js:61 — start 200 |
| POST `/api/platform/focus/:id/:action` | services/platform/routes.js:72 | F | R | A | platform-api.integration.test.js:63 — foreign complete 404, own complete returns zero XP |
| GET `/api/platform/progress/export` | services/platform/routes.js:73 | F | R | A | http-payment-probe.cjs:41–45 — owner VIP 200 CSV header; free account 403 |
| POST `/api/platform/billing/checkout` | services/platform/routes.js:86 | F | R | A | http-payment-probe.cjs:20 — configured real HTTP 200; fixed price, invalid input, duplicate order reuse; fake external provider |
| GET `/api/platform/billing/latest` | services/platform/routes.js:89 | F | R | A | http-payment-probe.cjs:37 — owner order matches, other account returns null |
| POST `/api/platform/billing/checkout/:id/verify` | services/platform/routes.js:92 | F | R | A | http-payment-probe.cjs:26–35 — other account 404; owner completed twice, owner VIP/other free; fake external provider |
| POST `/api/platform/billing/checkout/:id/complete` | services/platform/routes.js:96 | F | R | A | platform-api.integration.test.js:29 — simulator approved; DigetPay method rejects at service layer |
| POST `/api/platform/billing/cancellation` | services/platform/routes.js:98 | F | R | A | platform.smoke.spec.js:55 — cancel and restore renewal simulator; real local server |
| POST `/api/platform/cohorts` | services/platform/routes.js:102 | F | R | A | platform-api.integration.test.js:31 — VIP creates circle |
| POST `/api/platform/cohorts/accept` | services/platform/routes.js:103 | F | R | A | platform-api.integration.test.js:35 — invite accepted |
| POST `/api/platform/cohorts/:id/invitations` | services/platform/routes.js:104 | F | R | A | platform-api.integration.test.js:34 — owner gets invite |
| GET `/api/platform/cohorts/:id/members` | services/platform/routes.js:105 | F | R | A | platform-api.integration.test.js:33 — other account 404; browser positive member list |
| PATCH `/api/platform/cohorts/:id/members/:userId` | services/platform/routes.js:106 | F | R | A | platform.smoke.spec.js:75 — assign supervisor observed; real local server |
| GET `/api/platform/cohorts/:id/sessions` | services/platform/routes.js:113 | F | R | A | platform.smoke.spec.js:94 — scheduled session shown; real local server |
| POST `/api/platform/cohorts/:id/archive` | services/platform/routes.js:114 | F | R | A | resilience.smoke.spec.js:134–136 — exact archive target and disappearance asserted; earlier held GETs continued/unrouted |
| POST `/api/platform/cohorts/:id/leave` | services/platform/routes.js:124 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| DELETE `/api/platform/cohorts/:id/sessions/:sessionId` | services/platform/routes.js:129 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| POST `/api/platform/cohorts/:id/sessions` | services/platform/routes.js:133 | F | R | A | platform-api.integration.test.js:46 — owned room schedule; circle-lifecycle:55 retry after failure |
| GET `/api/platform/cohorts/:id/sessions/:sessionId/attendance` | services/platform/routes.js:149 | F | R | A | platform-api.integration.test.js:58 — on-time attendance |
| GET `/api/platform/rooms` | services/platform/routes.js:151 | F | R | A | platform-api.integration.test.js:43 — owned room present |
| PATCH `/api/platform/rooms/:id` | services/platform/routes.js:161 | F | R | A | platform-api.integration.test.js:45 — foreign rename 404; owner success unverified |
| POST `/api/platform/security/mfa/enroll` | services/platform/routes.js:174 | F | R | A | platform.smoke.spec.js:111 — secret displayed after enroll; real local server |
| POST `/api/platform/security/mfa/verify` | services/platform/routes.js:183 | F | R | A | platform.smoke.spec.js:116 — recovery codes displayed after activate; real local server |
| POST `/api/platform/staff/bootstrap` | services/platform/routes.js:190 | F | R | A | platform.smoke.spec.js:119 — staff nav appears; real local server |
| GET `/api/platform/staff` | services/platform/routes.js:197 | F | R | A | platform.smoke.spec.js:122 — Super admin role rendered; real local server |
| POST `/api/platform/staff/roles` | services/platform/routes.js:202 | F | R | A | platform.smoke.spec.js:138 — last-super-admin removal denied, not grant success; real local server |
| GET `/api/platform/staff/audit` | services/platform/routes.js:211 | F | I | A | platform.smoke.spec.js:121 renders staff; public/js/platform.js:519 request, no endpoint-specific response assertion |
| GET `/api/platform/staff/overview` | services/platform/routes.js:215 | F | I | A | platform.smoke.spec.js:121 renders staff; public/js/platform.js:454 request, no endpoint-specific response assertion |
| GET `/api/platform/staff/cases` | services/platform/routes.js:220 | F | I | A | platform.smoke.spec.js:121 renders staff; public/js/platform.js:491 request, no endpoint-specific response assertion |
| PATCH `/api/platform/staff/cases/:id` | services/platform/routes.js:224 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| GET `/api/platform/staff/subscriptions` | services/platform/routes.js:237 | F | I | A | platform.smoke.spec.js:121 renders staff; public/js/platform.js:514 request, no endpoint-specific response assertion |
| GET `/api/platform/staff/users` | services/platform/routes.js:241 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| POST `/api/platform/staff/users/:id/status` | services/platform/routes.js:248 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| GET `/api/platform/staff/rooms` | services/platform/routes.js:267 | F | I | A | platform.smoke.spec.js:121 renders staff; public/js/platform.js:467 request, no endpoint-specific response assertion |
| POST `/api/platform/staff/rooms/:id/:action` | services/platform/routes.js:273 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| GET `/api/platform/staff/operations` | services/platform/routes.js:291 | F | R | A | platform.smoke.spec.js:123 — empty then raised alerts shown; real local server |
| POST `/api/platform/staff/video` | services/platform/routes.js:299 | F | R | A | platform.smoke.spec.js:135 — toggle observed; real local server |
| POST `/api/platform/staff/announcement` | services/platform/routes.js:306 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| DELETE `/api/platform/staff/announcement` | services/platform/routes.js:318 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| POST `/api/platform/staff/backup` | services/platform/routes.js:326 | F | B | A | Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified. |
| POST `<ADMIN_PATH>/api/login` | services/admin/admin-routes.js:118 | P | R | — | admin.integration.test.js:81 — wrong password, lockout and valid cookie |
| POST `<ADMIN_PATH>/api/logout` | services/admin/admin-routes.js:142 | P | U | — | No exact route-specific assertion found. |
| GET `<ADMIN_PATH>/api/overview` | services/admin/admin-routes.js:149 | P | R | — | admin.integration.test.js:95 — overview fields asserted |
| GET `<ADMIN_PATH>/api/dashboard` | services/admin/admin-routes.js:183 | P | U | — | No exact route-specific assertion found. |
| GET `<ADMIN_PATH>/api/rooms` | services/admin/admin-routes.js:210 | P | R | — | admin.smoke.spec.js:83 — real console room row shown |
| GET `<ADMIN_PATH>/api/rooms/:roomId` | services/admin/admin-routes.js:226 | P | R | — | admin.integration.test.js:210 — inspect participant count |
| POST `<ADMIN_PATH>/api/rooms/:roomId/close` | services/admin/admin-routes.js:257 | P | R | — | admin.integration.test.js:181 — close disconnects/deletes room |
| POST `<ADMIN_PATH>/api/rooms/:roomId/kick` | services/admin/admin-routes.js:275 | P | R | — | admin.integration.test.js:218 — kick reduces participants |
| GET `<ADMIN_PATH>/api/reports` | services/admin/admin-routes.js:301 | P | R | — | admin.integration.test.js:368 — report listing/restart |
| POST `<ADMIN_PATH>/api/rooms/:roomId/reports/:reportId/resolve` | services/admin/admin-routes.js:318 | P | R | — | admin.integration.test.js:383 — resolve persists |
| GET `<ADMIN_PATH>/api/video-kill-switch` | services/admin/admin-routes.js:340 | P | U | — | No exact route-specific assertion found. |
| POST `<ADMIN_PATH>/api/video-kill-switch` | services/admin/admin-routes.js:349 | P | R | — | admin.integration.test.js:136 — video disabled then enabled |
| GET `<ADMIN_PATH>/api/users` | services/admin/admin-routes.js:362 | P | U | — | No exact route-specific assertion found. |
| POST `<ADMIN_PATH>/api/users/:userId/ban` | services/admin/admin-routes.js:404 | P | R | — | admin.integration.test.js:239 — ban kills session |
| POST `<ADMIN_PATH>/api/users/:userId/unban` | services/admin/admin-routes.js:405 | P | R | — | admin.integration.test.js:253 — unban restores signin |
| POST `<ADMIN_PATH>/api/broadcast` | services/admin/admin-routes.js:409 | P | R | — | admin.integration.test.js:275 — publish reaches sockets |
| DELETE `<ADMIN_PATH>/api/broadcast` | services/admin/admin-routes.js:433 | P | R | — | admin.integration.test.js:296 — clear announcement |
| POST `<ADMIN_PATH>/api/backup` | services/admin/admin-routes.js:444 | P | R | — | admin.integration.test.js:324 — snapshot files asserted |
| GET `<ADMIN_PATH>/api/errors` | services/admin/admin-routes.js:453 | P | R | — | admin.integration.test.js:410 — redacted warnings |
| GET `<ADMIN_PATH>/api/video-sessions` | services/admin/admin-routes.js:457 | P | U | — | No exact route-specific assertion found. |

## Socket matrix

| Event | Source trace | Test class | Named evidence / limitation |
|---|---|---|---|
| `create-room` | P | R | server.integration.test.js:239 + platform-api:38 — valid/invalid/capacity/private-room scenarios; malformed boundary included for every command. |
| `join-room` | P | R | server.integration.test.js:305/314 — wrong vs correct protected password; platform-api:53 private membership; malformed boundary included for every command. |
| `send-message` | P | R | server.integration.test.js:263/1180/1249 — message persistence/rate/bounds; malformed boundary included for every command. |
| `board-set-goal` | P | R | server.integration.test.js:269/1194 — goal persistence/rate; malformed boundary included for every command. |
| `board-add-task` | P | R | server.integration.test.js:274; socket-boundary:56 — task positive control; malformed boundary included for every command. |
| `board-toggle-task` | P | R | app.smoke.spec.js:208 — shared-board completed checkbox sync; malformed boundary included for every command. |
| `board-delete-task` | P | R | app.smoke.spec.js:257 — shared-board deletion observed by peer; malformed boundary included for every command. |
| `board-reorder-tasks` | P | R | app.smoke.spec.js:245 — drag reorder observed by peer; malformed boundary included for every command. |
| `camera-status` | P | R | socket-probe.cjs:20–39 / evidence/socket-probes.json — joined peer exact payload, outsider receives zero; malformed boundary included for every command. |
| `rtc-offer` | P | R | socket-probe.cjs:20–39 / evidence/socket-probes.json — exact sender/payload relay, outsider target receives zero; malformed boundary included for every command. |
| `rtc-answer` | P | R | socket-probe.cjs:20–39 / evidence/socket-probes.json — exact sender/payload relay, outsider target receives zero; malformed boundary included for every command. |
| `rtc-ice` | P | R | socket-probe.cjs:20–39 / evidence/socket-probes.json — exact sender/payload relay, outsider target receives zero; malformed boundary included for every command. |
| `user-status` | P | R | server.integration.test.js:1555/1580 — sanitized goal/status broadcast; malformed boundary included for every command. |
| `report-user` | P | R | server.integration.test.js:1625–1662 — target validity/rate/privacy/persistence; malformed boundary included for every command. |
