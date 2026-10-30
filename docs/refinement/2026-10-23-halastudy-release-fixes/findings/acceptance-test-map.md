# Acceptance-to-test map

Prepared 2026-10-23 from planning checkpoint `c4d6c50553f55704b4d4a788db28b05fa983047a`.
This is a **source inspection**, not a test run or a new PASS receipt. Existing tests
below were read; historical results are not carried forward. Application/tests were
not changed by this mapping. Old Viber evidence remains immutable.

Inputs: `docs/plans/2026-10-23-halastudy-fix-plan/{PLAN,ACCEPTANCE,COVERAGE}.md`,
`docs/viber/2026-10-23/evidence/coverage.json`, its `scripts/coverage.py`, existing
integration/smoke suites, and the cited route/guard implementations. Line references
are this checkpoint's source; refresh after implementation.

## What the historical count does and does not establish

The immutable denominator is 119 HTTP/auth/admin patterns plus 14 socket commands,
133 total. Historical 107/133 comprises 93 observed HTTP patterns and 14 observed
socket commands. Five HTTP patterns had denial/failure statuses only. The old
observer recorded mutable mounted paths, and `coverage.py:44` reconstructed several
mount projections and counted only unique matches. Its 26 missing patterns are
therefore a mixture of recording ambiguities and genuine absent handler controls.

The malformed-socket test sends **all fourteen names** with invalid payloads. Its
observation proves boundary validation, not successful handlers or correct relay.
The shared-board browser case does assert a successful drag reorder at the peer;
no direct successful camera-status/RTC recipient assertion was found.

Use these distinctions in the new receipt:

- **RECORD**: a meaningful existing full-app positive exists. Replay with canonical
  method/original path recording; add only missing assertion branches.
- **FIXTURE**: the handler has meaningful existing local router/service evidence,
  outside `co-study-server` observation. Keep that evidence separately or instrument
  the isolated router without counting a bare import as an executed route.
- **ADD-HTTP**: no exact existing successful HTTP action/assertion was found. A
  service positive or similarly named legacy route cannot substitute for this handler.
- **ADD-BRANCH**: a positive already exists, but specific planned states are absent.

There are four clear RECORD cases among the 26 historical missing HTTP patterns
(H009, H048, H063, H088), two Google FIXTURE cases (H040-H041), and twenty remaining
patterns needing a successful HTTP control. Three of the five denial-only patterns
(H093, H131, H132) already have browser positives that the new recorder should
resolve. These are source-derived classifications, not predicted passing results.

A `401` from the platform-wide `router.use(requireUser)` at `services/platform/routes.js:40`
occurs even for an unknown nested path. Such a denial must not prove a handler exists.
Record the exact positive/mutation effect and its matching negative control, not only
status. A disabled supported state needs an enabled fixture control as well.

## Exact existing test catalog

Table aliases below refer to these exact test titles and paths. `I-ST` subtests run
under `twenty study tools preserve ownership, trusted time, retries and lifecycle`
at `tests/integration/study-tools.integration.test.js:23`. These call services on a
real disposable SQL database; they are not HTTP route executions.

| Alias | Exact title and source |
| --- | --- |
| I-ST01 | `F01-F04 private CRUD, checklists, dates, priorities, version conflict and archive` — `tests/integration/study-tools.integration.test.js:55` |
| I-ST05 | `F05 recurrence skips Saudi weekend and duplicate completion cannot spawn twice` — same file `:114` |
| I-ST06 | `F06-F07 links attach only own active session once; actual effort comes from server ledger` — same file `:152` |
| I-ST08 | `F08 saved finite routines reject marathons and foreign updates` — same file `:186` |
| I-ST10 | `F10 distraction capture, resolve and concurrent conversion is exactly once` — same file `:208` |
| I-ST11 | `F11-F14 private reflections, opt-in targets, Riyadh rollover and searched history` — same file `:226` |
| I-ST15 | `F15 favorites persist, deduplicate and hide unavailable private room metadata` — same file `:314` |
| I-ST16 | `F16-F18 personal agenda, current-member RSVPs and valid multilingual calendar` — same file `:353` |
| I-ST19 | `F19 reminder preference is explicit, versioned and private` — same file `:391` |
| I-ST20 | `F20 resources enforce current membership, supervisor management and safe links` — same file `:404` |
| I-CAPS | `active task and distraction limits apply to reopen paths as well as new entries` — same file `:468` |
| I-CURSOR | `journal cursor handles timestamp ties without skipping; history window remains entitled` — same file `:523` |
| I-BACKUP | `v3 backup restores every new domain, accepts v1/v2, and account cascades private data` — same file `:555` |
| I-ROUTINE | `F09 routine is finite, pauses, survives serialization, requires deliberate transitions and never awards credit` — `tests/integration/study-routine.integration.test.js:6` |
| I-API | `platform HTTP and socket journeys use real database and scoped policies` — `tests/integration/platform-api.integration.test.js:8` |
| I-CIRCLES | `private circles require VIP to create; invites and supervision stay scoped` — `tests/integration/platform.integration.test.js:51`, under `platform transactions enforce subscriptions, scoped supervision, rewards and staff security` (`:12`) |
| I-MFA | `MFA codes resist replay and staff privileges require explicit grants` — same file `:104` |
| I-TIME | `two tabs share one session; forged time, replay and interruptions cannot inflate XP` — same file `:80` |
| I-MIDNIGHT | `Riyadh midnight splits rewards correctly and daily/session caps hold` — same file `:133` |
| I-STALE | `abandoned sessions and backward clocks never become reward credit` — same file `:163` |
| I-OFFER | `one fixed VIP offer; checkout is account bound and completion is idempotent` — same file `:29` |
| I-EXPIRY | `VIP expiry removes benefits without deleting study records` — same file `:178` |
| I-LIFECYCLE | `private scope survives failed snapshot, schedule retries deduplicate and deleted owners archive circles` — `tests/integration/circle-lifecycle.integration.test.js:8` (isolated router; scope/disconnect persistence failure) |
| I-GOOGLE | `OAuth verifies browser state, PKCE, explicit linking and purpose-bound reauthentication` — `tests/integration/google-security.integration.test.js:8` (isolated Express app, fake fetch) |
| I-DIGET | `DigetPay sandbox payment lifecycle and trust boundaries` — `tests/integration/digetpay.integration.test.js:14` (service/fake transport parent) |
| I-NOTIFY | `forged notifications cannot grant VIP; verified duplicate events grant exactly one month` — same file `:64` |
| I-NOTIFY-RESTART | `persistent webhook work survives a worker restart and retries upstream failures` — same file `:156` |
| I-DASHBOARD | `return dashboard excludes deleted/private rooms, removed members and other accounts; today splits midnight` — `tests/integration/ux-dashboard.integration.test.js:12` |
| I-DST | `named timezones preserve an instant on each side of the London DST boundary` — same file `:53` |
| B-PRIVATE | `F01-F14 private planning, lost response, routines, task-linked focus, reflection and journal work end to end` — `tests/smoke/study-tools.smoke.spec.js:132` |
| B-COMMUNITY | `F15-F20 favorite, RSVP, calendar, in-app reminder and private resource shelf work across members` — same file `:271` |
| B-REMINDER | `an opted-in reminder retries after a transient refresh failure without exposing stale details` — same file `:6` (intercepted synthetic agenda) |
| B-CLOSED | `a routine closed before another surface pauses keeps its remaining time on return` — same file `:59` |
| B-PLANNER | `planner supports Arabic/English, both themes, keyboard, narrow widths, zoom, drafts, history and recovery` — same file `:419` |
| B-IDENTITY | `task attachment, routine pause across tabs and stale-account drafts keep the right identity` — same file `:491` |
| B-JOURNAL | `a delayed background journal response cannot overwrite a newer search` — same file `:603` |
| B-PLATFORM | `member, VIP, supervisor and named staff journeys work in the browser` — `tests/smoke/platform.smoke.spec.js:8` |
| B-TZ | `schedule timezone: device inputs round-trip the same authoritative instant across DST` — `tests/smoke/ux-return.smoke.spec.js:118` |
| B-SHARED | `chat and shared board stay in sync across two participants` — `tests/smoke/app.smoke.spec.js:211` |
| B-CAMERA | `privacy blur sends a canvas track by default and tears the camera down cleanly` — same file `:318` |
| I-SOCKET | `malformed guest socket events cannot crash the server or mutate a room` — `tests/integration/socket-boundary.integration.test.js:30` |
| I-BOARD | `board cap rejects growth, permits deletion and preserves oversized restored boards` — `tests/integration/board-capacity.integration.test.js:7` |

Additional exact existing titles used once are written directly in the route/socket
rows. Test names are pointers only: the assertions actually read determine the
coverage. For example I-ST01's title says archive, but the task archive assertion
occurs in I-CAPS, and project archive in I-ST11; it is not all present in I-ST01.

## Twenty-six historically missing HTTP patterns

All platform routes inherit: enabled guard `routes.js:24`, account guard `:40`,
live user/epoch/banned rechecks `:41-59`, mutation rate limit `:55`. Every study route
also inherits account identity header check `study-routes.js:6-10`. Staff routes use
MFA tied to the account cookie plus explicit permission via `routes.js:63-67` and
`access.js:32-41,84-89`. These common guards supplement the per-row enforcers.

| ID and method/pattern | Route and specific guard source | Existing exact evidence / meaningful state | Disposition and concrete remaining recipe |
| --- | --- | --- | --- |
| H009 `GET /api/rooms/:roomId` | `co-study-server.js:2189`; normalize/existence/private-preview checks `:2196-2214` | `tests/integration/server.integration.test.js:1684` — `protected room GET exposes only a safe preview and leaks no private state`; `:1767` — `protected room stays locked on wrong password and unlocks full state only on the correct one`; `:1825` — `public room GET still returns the full snapshot (behavior unchanged)`; `:121` — `the Lobby is a reserved public room that exists on a fresh boot` includes lower-case alias and missing room; capacity positive/negative at `:1009` — `mesh rooms enforce participant caps while allowing same-identity reconnects at capacity`. | **RECORD.** Replay existing cases. Preserve no-board/messages/schedule/password-hash preview assertions and public positive. Lookup rate denial already in `:1102` — `rate limits protect room lookup, create, password attempts, chat, and board mutations`. |
| H040 `GET /auth/google` | `services/auth/google-routes.js:70`; enabled route mounting `:47-49`, safe return/state-cookie/PKCE `:70-97` | I-GOOGLE starts real HTTP requests in its isolated app (`:45`), fake provider only; checks safe destinations, browser state challenge, linking and security purpose. It never mounts the disabled config and does not assert cookie attributes explicitly. | **FIXTURE + ADD-BRANCH.** Observe the existing router fixture with canonical path. Add disabled config => start/callback 404; enabled => 302 to allowlisted Google authorize URL, proper state cookie/PKCE, safe destination retained, login rate deny without outbound exchange. No real Google request needed. |
| H041 `GET /auth/google/callback` | same file `:100`; matching cookie/nonce/state expiry `:114-124`; exchange/profile failures `:126-164`; link/epoch/commit checks `:177-238` | I-GOOGLE: valid callback, forged browser cookie, replay no extra exchange, explicit link only, revoked actor and failed durable signup. | **FIXTURE + ADD-BRANCH.** Retain all positives. Add provider `error=access_denied`, missing code, expired state, fake token/userinfo non-2xx/throw/malformed or unverified profile; assert no usable account/cookie and localized safe failure return. Export actual fixture outcomes rather than generic full-server 404. |
| H046 `GET <ADMIN>/api/dashboard` | `services/admin/admin-routes.js:183`; `requireAdmin:77-90`, named-staff retirement `:78-80`; no-backend `:184-187`, failure `:203-205` | No exact positive request in existing tests. `admin.integration.test.js:73` — `admin login gates the console: wrong password 401, lockout 429, success sets a scoped cookie` exercises `/overview`, not `/dashboard`. | **ADD-HTTP.** Pre-bootstrap legacy cookie => 200 `{available:false,source:'memory'}`. Isolated fake dashboard => supported available shape and rejected backend => 502 without private marker. Anonymous/member denied. After bootstrap, even previously valid legacy cookie => 403 `NAMED_STAFF_REQUIRED`. Unavailable is not zero. |
| H048 `GET <ADMIN>/api/rooms/:roomId` | same file `:226`; `requireAdmin:77-90`, missing `:228-230`, bounded metadata/participants `:232-253` | `tests/integration/admin.integration.test.js:193` — `kick removes a single participant and presence shrinks` requests room detail before/after kick and asserts participant count; browser `tests/smoke/admin.smoke.spec.js:91` — `force-close from the console requires typing the room code and kills the live room` clicks Inspect. | **RECORD + ADD-BRANCH.** Existing detail positive covers handler. Add unknown target 404; anonymous/member denial; retired old cookie denial; assert chat text/password/hash/full session IDs absent while permitted participant structure remains. |
| H053 `GET <ADMIN>/api/video-kill-switch` | same file `:340`; `requireAdmin:77-90`; flags `:343-345` | `admin.integration.test.js:121` — `video kill-switch toggles at runtime and is reflected in runtime-config and token issuance` tests POST and public runtime-config; never this GET. | **ADD-HTTP.** GET before/after local toggle returns correct `disabled`, `envDefault`, `overridden`; invalid/anonymous/member and retired legacy cookie denied. Use local video fake only. |
| H055 `GET <ADMIN>/api/users` | same file `:362`; `requireAdmin:77-90`; filter/page/explicit field projection `:363-381` | No existing exact positive request. `admin.integration.test.js:232` — `ban kills sessions via epoch bump; unban restores sign-in` does not list users. | **ADD-HTTP.** Synthetic users => search, offset and page bounded listing with intended legacy fields; no password/token/provider linkage. Anonymous/member denied; old valid cookie retired after named bootstrap. |
| H062 `GET <ADMIN>/api/video-sessions` | same file `:457`; `requireAdmin:77-90`; registry projection `:459-463` | No exact positive GET found. Video heartbeat/leave accounting is tested separately at `tests/integration/server.integration.test.js:942` — `RealtimeKit heartbeat, leave, and socket disconnect update active video counts`. | **ADD-HTTP.** Pre-bootstrap empty then synthetic provider-session registry => bounded active counts/session metadata; no raw token/private provider marker. Anonymous/member/retired old-cookie denied. |
| H063 `GET /api/platform/catalog` | `services/platform/routes.js:29`; enabled/readiness `:24-31`; `catalog.js:10-21` | B-PLATFORM visits `/plans`, asserts two plans, `US$4.99`, simulator notice and checkout behavior; frontend `public/js/platform.js:677` fetches `/catalog`. I-OFFER independently asserts exact plan IDs and 499 minor amount. | **RECORD.** Capture actual anonymous catalog 200; assert fixed free/VIP offer and configured availability only, no secrets/staff permissions. Add direct API assertion if browser logging cannot bind catalog response to the UI. |
| H070 `GET /api/platform/progress/export` | `routes.js:89`; entitlement `:90-91`; own/completed/history window/limit `:92-98` | No HTTP export invocation found. I-OFFER/I-EXPIRY cover entitlement service only. | **ADD-HTTP.** Free => 403, guest => 401; paid local user CSV content type/disposition and own completed rows within history window. Exclude other user's, active and old sessions. Expiry => 403. Output fields are ISO dates/integers, so test exact four-column CSV contract; do not invent user-text escaping input this route never exports. |
| H078 `DELETE /api/platform/cohorts/:id/invitations` | `routes.js:120`; `cohorts.js:75-80` owner membership/row lock and only unaccepted invite delete | I-CIRCLES invokes service revoke, member forbidden and unused token invalid afterward; no DELETE HTTP. | **ADD-HTTP.** Owner revokes unused invite, retry remains 200, previous token cannot be accepted. Accepted membership remains. Member => 403 and foreign => 404 without invalidating invite. |
| H084 `POST /api/platform/cohorts/:id/leave` | `routes.js:144`, socket disconnect `:146`; `cohorts.js:151-160`, owner rule `:155`, RSVP delete `:157` | I-ST20 calls supervisor `leave`, verifies agenda empty/resources 404/RSVP deleted; I-CIRCLES checks owner service refusal. HTTP removal exists in B-COMMUNITY, but leave handler is distinct. | **ADD-HTTP.** Connected member leaves => 200, loses existing socket and subsequent private HTTP/media/resources/calendar/reminders; RSVP removed. Owner => 409 `OWNER_PROTECTED`; outsider => 404. Document repeat leave currently 404 because membership is gone; do not demand fabricated 200. |
| H085 `DELETE /api/platform/cohorts/:id/sessions/:sessionId` | `routes.js:149`; `cohorts.js:162-170`, canSupervise and future/same-circle deletion | No `cancelSession` call or HTTP cancellation assertion found. | **ADD-HTTP.** Owner and supervisor cancel separate future sessions; removed event disappears from agenda/calendar/RSVP/reminder and FK state. Member forbidden, foreign circle 404, wrong/elapsed/already-canceled event => 409 `SESSION_NOT_CANCELABLE`; no unrelated event removed. |
| H088 `GET /api/platform/rooms` | `routes.js:171`; scoped owner/host/supervisor SQL `:172-176`, live existence `:178` | I-API `:39-41` creates owned room then `/rooms` returns its ID; B-PLATFORM uses owned-room selector for scheduling. | **RECORD + ADD-BRANCH.** Add unrelated private room excluded, room host included, supervisor assigned-circle result only; empty rooms `[]` distinguish unavailable 503; stale permission/removal cannot reveal unrelated title. |
| H098 `PATCH /api/platform/staff/cases/:id` | `routes.js:244`; `staff(cases.manage):245`, disposition `:246-248`; update and audit share tx `:249-254` | No exact HTTP mutation found. I-MFA verifies service permissions, not case handler. B-PLATFORM loads an empty case list but submits no case form. | **ADD-HTTP.** Synthetic report/case + named authorized fresh MFA => correct persisted disposition/assigned actor/audit. Invalid status/reason => 400, missing => 404. Wrong role/guest/stale/revoked MFA => denied/no mutation. Inject audit failure after update in isolated disposable fixture => rollback update and audit together. Preserve already-correct `tx.query`. |
| H102 `GET /api/platform/staff/users` | `routes.js:273`; `staff(cases.manage):274`; search bound/projection `:275-278` | B-PLATFORM visits staff, but `renderStaff()` only reveals the users form; `searchStaffUsers()` at `public/js/platform.js:303` is not invoked by that test. No exact successful GET/assertion found. | **ADD-HTTP.** Named moderator/admin with fresh MFA: exact ID/name/banned fields, <=50, query matches. Support/billing/ordinary, stale/revoked MFA => deny; no email/password/provider detail returned. |
| H103 `POST /api/platform/staff/users/:id/status` | `routes.js:280`; `cases.manage:281`; reason/boolean/not-self `:284`, protected super-admin `:285`, audit/epoch/disconnect/persist `:286-295` | No exact named-staff HTTP status mutation. Legacy ban test does not cover this handler. I-MFA tests service grants/revocation. | **ADD-HTTP.** Moderate target => persisted ban/unban, epoch change, old auth/session/socket/media grant revoked, expected audit. Self/super-admin/invalid/missing target denied. Wrong permission/stale/revoked MFA no effect. Inject `flushUsers` failure: public failure, banned field rolled back, previous sessions remain revoked. |
| H105 `POST /api/platform/staff/rooms/:id/:action` | `routes.js:305`; operations.manage `:306`; valid room/reason/action `:310`, Lobby protection `:311`, target member `:312`, disconnect/delete `:314-320` | No exact named-staff positive. Legacy close/kick integration tests are different handlers. | **ADD-HTTP.** Fresh permitted staff kick one synthetic socket then close separate room, assert target effects and audits. Missing participant => 404; invalid action/missing room/reason => 400; Lobby close => 403; denied/stale/revoked role no effect. |
| H108 `POST /api/platform/staff/announcement` | `routes.js:338`; operations.manage `:339`; text/duration `:340-343`; audit/in-memory broadcast `:344-347` | No exact named-staff positive. Legacy `tests/integration/admin.integration.test.js:262` — `broadcast reaches connected sockets and fresh joiners; clear stops it` is only adjacent evidence. | **ADD-HTTP.** Fresh permitted staff => public announcement endpoint + existing/late socket see sanitized text and audit; invalid bounds/empty body denied. Ordinary/stale/revoked staff cannot publish. Browser safe-text/XSS assertion belongs here too. Source stores announcement in memory; restart durability is not currently implemented or proven. |
| H109 `DELETE /api/platform/staff/announcement` | `routes.js:350`; operations.manage `:351`; audit + null + clear event `:352-355` | No exact named-staff delete. Legacy clear test is adjacent only. | **ADD-HTTP.** After H108, remove => public null, matching clear event, audit; repeat safe and consistent. Denied/stale/revoked staff cannot clear existing announcement. |
| H110 `POST /api/platform/staff/backup` | `routes.js:358`; backups.manage `:359`, audit `:360`, scheduler `:361` | No exact named-staff HTTP backup. Legacy `tests/integration/admin.integration.test.js:302` — `manual backup writes rooms and users snapshots with retention-friendly names`; I-BACKUP verifies SQL snapshot service directly. | **ADD-HTTP.** Fresh authorized named staff creates disposable complete backup, verify table manifest/count/checksum and no public fetch path; never log row contents. Parallel requests/failing scheduler yield documented status/no false success; permission/MFA negatives. A legacy room/users snapshot alone is not SQL recovery proof. |
| H124 `PATCH /api/platform/study/projects/:id` | `study-routes.js:97-103`; `study-planner.js:243-268` owner/version, `:270-280` reopen capacity, `:318-321` detach current tasks | I-ST11 calls service project archive and asserts task detached/history snapshot retained. I-ST01 rejects foreign project assignment. Browser B-PRIVATE creates project but never edits/archives it. | **ADD-HTTP + ADD-BRANCH.** Own rename/version retry/archive/unarchive; foreign PATCH 404 and stale edit 409; 20-project reopen cap. Task survives/detaches; old focus/project allocation preserved. |
| H126 `PATCH /api/platform/study/distractions/:id` | `study-routes.js:97-103`; planner owner/version `:243-268`, resolved-to-active capacity `:282-297` | I-ST10 converts service note exactly once; I-CAPS service unresolve at cap denied. No successful edit/resolve/unresolve HTTP found. | **ADD-HTTP.** Own edit/resolve/unresolve/reload, equal retry stable version and divergent stale 409; foreign 404; active/total caps on unresolve/unarchive; conversion remains one task after repeats/concurrent edit. |
| H127 `PATCH /api/platform/study/routines/:id` | `study-routes.js:97-103`; planner bounded normalize `:88-101`, owner/version `:243-268`, reopen capacity `:270-280` | I-ST08 calls foreign update denial and invalid marathon create; B-PRIVATE/B-IDENTITY create/use routines, never own PATCH. | **ADD-HTTP.** Own edit/archive/reopen/retry/version conflict, foreign 404; 20-routine archive/reopen cap; running guide retains original finite snapshot after routine changes. |
| H130 `DELETE /api/platform/study/bookmarks/:id` | `study-routes.js:131-136`; `study-community.js:84-88` own user WHERE | I-ST15 calls foreign service delete then proves owner's favorite still exists; no own successful HTTP delete. B-COMMUNITY adds and hides inaccessible favorite, never deletes. | **ADD-HTTP.** Own delete => 200 and empty list on reload; same/missing ID => 200 by contract. Foreign delete also returns 200 but cannot affect owner's favorite; assert state, not manufactured 404. |
| H136 `DELETE /api/platform/study/circles/:id/resources/:resource` | `study-routes.js:189-198`; `study-community.js:234-254` current canSupervise + same-circle UPDATE | I-ST20 calls owner service archive then checks list length; add/read/supervisor/left-member controls also present. No HTTP DELETE. | **ADD-HTTP.** Owner/supervisor archive, current member next read omits resource; nonmember/removed 404, ordinary member 403, wrong-circle resource 404; retry current archived resource stays 200 because UPDATE still matches. Assert unrelated resource untouched. |

## Five historical denial-only patterns

| ID and method/pattern | Guard/enforcer | Existing intended state and remaining control |
| --- | --- | --- |
| H064 `POST /api/platform/billing/digetpay/webhook` | `routes.js:33-38`: limiter/readiness/configured `billing.notify`; `services/platform/digetpay-billing.js` durable notify/verified lookup; provider binding is a service responsibility, not the POST body | **ADD-HTTP.** Historical 503 unconfigured is intentional but insufficient. I-NOTIFY and I-NOTIFY-RESTART give real SQL/fake provider service positives. Mount configured local fake through actual router: POST accepted JSON, forged/unknown hints grant no VIP, successful server lookup yields one subscription, duplicate/restart unchanged. Keep unconfigured 503 and no real paid call. |
| H089 `PATCH /api/platform/rooms/:id` | `routes.js:181-192`: owner OR explicit room host SQL (`:182-184`), live room, sanitized name, audit then persistence | **ADD-HTTP.** I-API only tests unrelated Bob 404. Add owner and explicit host rename with audit/live room/reload effect; supervisor without host is intentionally not authorized to rename even if they may supervise. Empty name, missing room, unrelated account and revoked host => no mutation. |
| H093 `GET /api/platform/staff` | `routes.js:217-220`, `staff.read` + fresh account-bound MFA | **RECORD + ADD-BRANCH.** B-PLATFORM asserts `#staff-roles` contains Super admin after bootstrap; `public/js/platform.js:383-385` fetches roster. Add direct status/shape and ordinary/billing/expired-MFA/revoked-role controls. I-MFA tests permission/revocation directly but not roster response. |
| H131 `GET /api/platform/study/agenda` | `study-routes.js:138-145`; current-member/current-unarchived-circle query `study-community.js:90-100` | **RECORD + ADD-BRANCH.** B-COMMUNITY sees actual scheduled title then removed-member empty agenda; I-ST16 tests member positive/outsider empty; B-REMINDER uses an intercepted fake response and is not a server agenda execution. Add canceled event, offline refresh retry/device-timezone agenda rendering; B-TZ/I-DST support schedule instants but do not fully assert agenda display. |
| H132 `GET /api/platform/study/calendar.ics` | `study-routes.js:147-157`; same scoped agenda; UTF-8 fold/escape/stable UID `study-community.js:270-325` | **RECORD + ADD-BRANCH.** B-COMMUNITY authenticated HTTP export asserts actual session UID then removal excludes all events. I-ST16 verifies UTC, escaped semicolon, <=75-byte lines, no token/room ID and declined exclusion. Add guest 401, multiple events parsed/unfolded independently, stable UIDs across exports, canceled exclusions and explicit download UI. |

## F01-F20 acceptance, with the remaining exact assertions

Every feature below has some existing positive and negative evidence. None can be
marked complete merely because the parent smoke title contains its feature ID.
Route tests N1-N7 below can cover the missing HTTP wiring while preserving service
tests. Add browser assertions only for meaningful actions/recovery not already
performed. Compare persisted server state to rendered state after reload.

| Feature / principal methods | Enforcer / source | Existing positive and meaningful isolation/failure | Concrete acceptance gap recipe |
| --- | --- | --- | --- |
| F01 Tasks: POST/PATCH tasks, POST tasks/:id/complete | `study-routes.js:76-82,90-104`; planner normalize `:103-138`, retry create `:178-241`, owner/version `:243-268`, complete/reopen `:326-397` | I-ST01 own create/edit/same request ID/same edit retry; foreign user mutation and assignment denied; type/date/enum/21 steps invalid. I-CAPS active task create/reopen limits and task archive. B-PRIVATE lost committed create response retains draft and one task, edit/complete/reload-independent overview, foreign HTTP 404. | Add meaningful browser reopen/archive/reload. Test null/nonobject body, title/note length exact boundaries, 300 total plus 200 active quota; no task side effect on XP. Do not duplicate existing lost response path. |
| F02 Projects: POST/PATCH projects; task project_id | planner `:80,165-175,243-324`, focus snapshot `:439-496`, insight allocation `:700-744` | I-ST01 creates/assigns project and rejects foreign project assignment. I-ST11 archives and proves task detaches and historical journal search keeps original project. B-PRIVATE project assignment via UI. | N4 project HTTP PATCH; browser edit/archive with retained task and archived-project focus history; foreign project PATCH denial; cap/reopen. Existing history search is positive but explicit post-archive insight allocation should also be asserted. |
| F03 Checklists: task steps via POST/PATCH | planner `:108-121` <=20, stable generated indices and unique IDs; retry hash `:178-196` | I-ST01 checks one step, rejects 21 steps; B-PRIVATE creates two steps and checks one before task edit. | Exactly 20 succeeds; duplicate IDs and >120-character text rejected; omitted IDs retained through lost-create retry; check/uncheck multiple steps, edit then reload verify IDs/state. |
| F04 Planner: overview + client task filters | planner `:599-633` server today; `public/js/study-workspace.js:283-284,339-351` filters | B-PRIVATE explicitly selects today, open and completed; I-ST01 invalid calendar date/priority. B-PLANNER navigation/back, draft, loading failure/retry and responsive axes. | Seed overdue/today/upcoming/completed at Riyadh 23:59 then 00:01; assert each filter and empty state, priority/date, filter persistence across Back/Forward/reload as required. Existing navigation test does not assert filter value persistence. |
| F05 Recurrence: POST tasks/:id/complete | planner `:360-397` successor mutation key, next workday | I-ST05 daily/weekly/workdays; Thursday workday successor skips Fri/Sat to Sunday; duplicate complete and reopen/recomplete create one successor. B-PRIVATE actual daily successor length two. | Add Friday/Saturday starting-date and week-boundary controls, successor retains intended stable fresh checklist IDs/content and reset done bits; reward snapshot unchanged by recurrence. Existing core exactly-once service test should remain. |
| F06 Effort: completed focus credit aggregated in overview | planner `:607-609`; progress heartbeat/caps in `services/platform/progress.js`; focus links `:439-496` | I-ST06 120000 ms actual from heartbeat-backed completed focus, I-TIME/I-STALE/I-MIDNIGHT forged/abandoned/backward/caps; B-PRIVATE fast client clock yields <60000 server credit. | Link an abandoned/uncredited session to a task and import/manual compatibility stats; assert actual_ms and XP still derive only from completed trusted ledger. Browser compare estimate vs validated effort, not only stored estimate default. |
| F07 Focus link: PUT focus/:id/task | `study-routes.js:62-69`; planner `:439-496` matching user/session/task and immutable old link | I-ST06 own attach idempotent, foreign actor denied, conflicting task denied; B-PRIVATE before-start routine attachment/reload; B-IDENTITY active unlinked attach/reload and account-change 401. | Add own-session with foreign task, foreign session with own task, completed/abandoned unlinked session and stale/mismatched guide explicit negatives; preserve existing active attach positive. |
| F08 Saved routines: POST/PATCH routines | planner `:88-101` bounds and <=240 focus minutes; owner/version/cap `:243-280` | I-ST08 create/foreign update/marathon denied; B-PRIVATE save/use; B-IDENTITY creates routine. | N4 own PATCH/archive/reopen/quota with reload, stale version; browser named routine draft survives language change (B-PLANNER currently checks task draft only); active guide retains source routine snapshot. |
| F09 Guided rounds: client transitions + server focus | `public/js/study-routine.js:3-59`; workspace guide `:479-662`, expiry pause `:1190-1208` | I-ROUTINE focus/short/long, finite end, serializable pause, deliberate next, no XP fields. B-PRIVATE short break and stop; B-CLOSED closed-page pause; B-IDENTITY cross-tab pause and mismatched Stop leaves replacement focus intact. | Browser complete finite guide through long break/end, assert server session/credit at each deliberate boundary; expired guide must pause only its matching active server session. Unit final-state fixture is not full browser end journey. |
| F10 Distractions: POST/PATCH distractions, POST convert | planner `:81-86,243-324,399-437` row lock + deterministic mutation key, cap reopens | I-ST10 foreign conversion denied, simultaneous conversion returns same task and resolves note; I-CAPS unresolve at active cap denied; B-PRIVATE captures/converts. | N4 edit/resolve/unresolve positive HTTP, foreign PATCH and stale conflict; browser park/resolve/unresolve/reload; conversion request lost after commit retries to same task (service concurrent coverage already exists). |
| F11 Reflection: PUT focus/:id/reflection | `study-routes.js:70-75`; planner `:556-597` own completed session + optimistic version/retry | I-ST11 foreign denied, save/equal retry stable, divergent version conflict; B-PRIVATE saves private note and journal search finds it. | Active session denied, browser edit and lost committed save retry without duplicate/version corruption; independently assert no new reward ledger/XP. |
| F12 Targets: PUT/GET preferences | planner `:498-554` bounded types/version; insights `:700-744` Riyadh day/Sunday week | I-ST11 initial opt-out 0, save positive and 241-minute daily bound denial, Sunday weekStart; B-PRIVATE daily/weekly save UI. I-ST19 preference privacy. | Opt back out (zeros), all exact min/max/weekly/type bounds, stale/equal retry controls and browser draft/lost response; setting and missing target do not award/penalize XP. Assert both sides of Sunday rollover, not just a single weekStart value. |
| F13 Insights: GET insights | planner `:700-744` completed XP-ledger day keys, original project snapshot, own-user WHERE | I-ST11 28 days, last/previous seven days, project minutes; I-DASHBOARD midnight scope/recent-room; B-PRIVATE 28 rendered days and user B private overview empty. | Two-day trusted focus straddling Riyadh midnight in **study insights**, original project after archive, other-account insights totals, unavailable server yields retry/unavailable not rendered zeros. Dashboard evidence is supporting, not the same response. |
| F14 Journal: GET journal | planner `:636-698` own scope, entitled cutoff, date/state/project filters, tuple cursor | I-ST11 search/project/state and foreign empty; I-CURSOR tied timestamp pagination, 30/365-day windows and invalid cursor/date; B-JOURNAL stale background response cannot replace newer search; B-PRIVATE search note. | Browser filter/date/state/project/pagination; exact free/VIP HTTP entitlement window (service passes historyDays directly); reverse-order date ranges and account switch with pending response. Reuse existing cursor tie and stale response tests. |
| F15 Favorites: POST/GET/DELETE bookmarks | community `:15-88` per-account key, live `canJoin`, 50 cap, scoped delete | I-ST15 dedup, accessible title, inaccessible projection `{id,available:false}`, foreign add denied and foreign delete harmless. B-COMMUNITY real href then removed-member title/action hidden. | N4 own delete/retry/missing API. Browser search/return action, deleted-room and circle-archive hide title/code/action, account switching cannot reuse favorite cache; 50 bound. Existing task identity test does not explicitly assert favorite cache. |
| F16 Agenda: GET agenda | community `:90-100` current membership/unarchived circle, time range/order | I-ST16 member/outsider; I-ST20 leave => empty; B-COMMUNITY title/current membership then removed empty; B-TZ/I-DST correct instants in schedule helper flow. | N2 cancellation and HTTP leave controls; agenda rendering in device zone on DST boundary, offline refresh and retry do not show stale private event after revoke. Do not count intercepted B-REMINDER as agenda handler positive. |
| F17 RSVP: PUT agenda/:id/rsvp | community `:102-136` enum/session/member/future interval, upsert; cohort leave/remove deletes at `cohorts.js:102,157` | I-ST16 going twice => count1, outsider denied, declined export excluded; I-ST20 leaves and no RSVP rows; B-COMMUNITY going selection persists then remove. | Browser maybe/declined/reload, invalid enum/expired/canceled event/foreign response; cancellation removes or excludes RSVP and going count ignores departed users. Assert RSVP does not create attendance or credit/XP. |
| F18 Calendar: GET calendar.ics | community `:270-325` UTC stamps, CRLF escape, UTF-8 octet fold, stable UID, declined exclusion | I-ST16 UTC/semicolon/75-byte lines/no token or saved-room/decline; B-COMMUNITY actual authenticated calendar response/session UID and removal exclusion. | N2 canceled event; guest denial; two or more events, independent parser/unfolding/escaping assertions, same UID on repeated exports, explicit browser download/import artifact and no bearer query/file content. Device calendar app import remains manual acceptance if unavailable. |
| F19 Reminders: preferences + fresh agenda/identity; browser notifications | workspace `:735-772` opt-in/permission, `:1119-1185` fresh recheck/dismissal, account reset hooks | I-ST19 default false/own true/other false; B-COMMUNITY opt-in/due/dismiss/reload then removed-member no banner/Notification; B-REMINDER transient 503 recovery hides stale details before successful refresh. | During failed-refresh/backoff, revoke membership AND separately turn opt-in off; assert no title/banner/notification at recovery. Also canceled event, logout/account switch and permission-denied/request-rejected control; UI accurately states open-page limitation. Successful opt-in-state-after-retry and actual external browser notification receipt are distinct. |
| F20 Resources: GET/POST/DELETE circles/:id/resources | community `:138-254` current membership, supervisor management, HTTPS no userinfo, mutation hash/retry and 50 cap | I-ST20 owner add/dedup, member write denied, unsafe JS/userinfo URL denied, supervisor add, left-member read denied, archive service. B-COMMUNITY owner/member independent contexts, owner draft survives language toggle, removed reader 404. | N4 DELETE HTTP plus foreign/member/revoked archive denies. Lost-response resource add retry, same mutation ID with different payload conflict, cap/bounds and cross-circle draft isolation. After archive a previously loaded member refresh must remove resource/action. |

The cross-feature invariant must be asserted against server state: capture completed
focus/XP/role assignments before planning/routine/target/reflection/RSVP/resource
mutations, perform them, then show no extra time/XP/staff role is granted. Existing
server-owned focus tests are strong but do not explicitly compare these snapshots
for every mutation family.

## All fourteen socket commands

All commands share current account/epoch and membership guards in
`co-study-server.js:2323-2344`, and payload/ack/error containment in
`services/socket-boundary.js`. I-SOCKET sends invalid payloads to all commands at
`:35-47`; this is the same shared negative reference for every row, not fourteen
successful operations. Denied media raw-pixel processing is tested by B-CAMERA and
`tests/smoke/camera-privacy.smoke.spec.js:54` — dynamic title
`privacy processing ${mode}: stop every raw track and retain explicit recovery`;
those tests do not establish a correct RTC recipient boundary.

| ID / command / handler | Exact existing positive and specific negative controls | Remaining meaningful recipe |
| --- | --- | --- |
| S01 `create-room` `co-study-server.js:2360` | `tests/integration/server.integration.test.js:212` — `persisted room state survives restart and protected join still validates passwords`; `:333` — `scheduled rooms validate create payloads and expose schedule summaries`; I-API creates owned room; I-SOCKET malformed; server `:1084` — `large-room creation is rejected when SFU support is not configured`. | **RECORD.** Current source/rerun evidence required. Include guest instant positive and guest scheduled denial, rate/cap/invalid media config already in same suite. |
| S02 `join-room` `:2447` | same `:212` valid/wrong password, `:1009` mesh capacity/reconnect; I-API guest private denied/current owner allowed; `tests/integration/session-identity.integration.test.js:115` — `joining a second room removes the socket from the first room`. | **RECORD + ADD-BRANCH.** Membership removal/leave should terminate receiving as well as reject outgoing commands/media. Bind new N2 leave/cancel cases to socket state. |
| S03 `send-message` `:2643` | server `:212` stored/reloaded message, `:1102` chat limiter; B-SHARED two participants synced; I-SOCKET positive and malformed. | **RECORD.** Ensure revoked account/private member sends no message and recipient after removal gets no private broadcast; supporting I-LIFECYCLE demonstrates immediate disconnect on privatization. |
| S04 `board-set-goal` `:2677` | server `:212` persistence, `:1102` board limiter, `:1314` — `sanitizers strip invisible characters and reject non-string payloads`; B-SHARED. | **RECORD.** Existing persistence/rate/sanitization suffices for core; membership denial inherited still needs current positive/negative trace. |
| S05 `board-add-task` `:2698` | I-BOARD cap/no growth/delete allows add; server `:212` persists task; B-SHARED; I-SOCKET malformed/positive. | **RECORD.** Check current cap result unchanged; no new duplicate cap suite needed. |
| S06 `board-toggle-task` `:2730` | I-BOARD `:39` toggles fixture task while oversized restored board stays usable; B-SHARED checks peer completion. | **ADD-BRANCH.** Missing ID and foreign-room task ID => `BOARD_TASK_NOT_FOUND`, unchanged board; current-member positive already exists. |
| S07 `board-delete-task` `:2757` | I-BOARD `:40` delete plus add-after-delete; B-SHARED deletes via UI. | **ADD-BRANCH.** Missing/foreign task ID no mutation; existing delete positive does not assert arbitrary cross-room IDs. |
| S08 `board-reorder-tasks` `:2784` | B-SHARED drags Second task before First and asserts peer order (`app.smoke.spec.js:250-252`). I-SOCKET malformed negative. | **RECORD + ADD-BRANCH.** Preserve browser happy path. Add reload/persisted order and wrong length, duplicate, missing and foreign-room IDs => `BOARD_REORDER_INVALID`, unchanged order. Unjoined/revoked denied. |
| S09 `camera-status` `:2832` | I-SOCKET malformed only directly. B-CAMERA verifies processed outgoing track and local teardown; no asserted same-room `camera-status` server broadcast. | **ADD.** Same-room member receives true/false for sender; unrelated room receives nothing; nonmesh camera-status cannot modify registry/presence; unjoined/removed sender has no effect. Keep real device privacy/provider acceptance separate. |
| S10 `rtc-offer` `:2844` | I-SOCKET malformed only; browser video may emit incidentally but there is no positive relay/isolation assertion. Handler guards room/target/sdp + mesh + target membership `:2847-2849`. | **ADD.** Same-room mesh peer receives exact synthetic SDP and server-owned `from`; cross-room target, missing payload, nonmesh or removed sender produce no recipient event. |
| S11 `rtc-answer` `:2853` | I-SOCKET malformed only; guard twin `:2856-2858`. | **ADD.** Same positive relay + cross-room/unjoined/nonmesh/removal negatives as offer. Assert no target spoofing or fanout. |
| S12 `rtc-ice` `:2862` | I-SOCKET malformed only; guard twin `:2865-2867`. | **ADD.** Same-room candidate positive and exact sender; outsider/unjoined/nonmesh/removal negatives; never include actual IP/ICE secrets in evidence logs. |
| S13 `user-status` `:2871` | server `:1535` — `per-user session goal rides on user-status: sanitized, broadcast, and hidden with status` checks sanitization, structured status, invalid object; I-SOCKET malformed. | **RECORD + ADD-BRANCH.** Unjoined/no current user and removed-member status cannot affect room. Check privacy false excludes goal, as existing test already asserts. |
| S14 `report-user` `:2887` | server `:1613` — `report-user validates targets, rate limits, persists sanitized, and never leaks to clients`; unjoined/unknown/self/rate + valid silent report. Admin report suite `tests/integration/admin.integration.test.js:333` — `reports surface in the admin console, resolve, and survive a restart`. | **RECORD.** Preserve no client report broadcast, sanitized persistence, no raw detail in public snapshot. Named case mutation needs separate H098 test. |

Socket relay absence tests should subscribe before emission and use short bounded
negative observation windows with a delivered same-room positive control; a test
that simply times out with no working recipient is not isolation proof. Do not wait
for acknowledgements from valid fire-and-forget camera/RTC handlers.

## Implementation-ready additions, consolidated to avoid duplicate tests

1. **N1 legacy read matrix** in a focused new integration file: all five legacy GET
   patterns (including existing room detail), pre-bootstrap cookie success,
   anonymous/member denials and post-bootstrap old-cookie retirement; local fake
   dashboard/video fixture and private output assertions.
2. **N2 platform scope/lifecycle HTTP**: catalog direct assertion, VIP CSV export,
   revoke invite/retry, leave plus disconnect/owner refusal, future cancellation
   and member/foreign/elapsed/retry controls, owner/host room rename, room listing
   scope. Use dedicated synthetic owners/members/outsiders and current SQL state.
3. **N3 named staff actions**: reuse actual password signup/MFA/bootstrap pattern
   from B-PLATFORM; every missing named handler positive with an allowed role,
   role-specific denied control, stale/revoked MFA. Cover case transaction rollback,
   status revoke/persistence failure, kick/close, announcement publish/clear and
   backup manifest/failure. A super-admin positive alone does not establish role
   restrictions for moderator/support/billing/admin.
4. **N4 study HTTP mutations**: own project/distraction/routine PATCH, bookmark
   DELETE and resource DELETE with foreign/version/retry/cap states. Keep existing
   service tests and assertions; avoid duplicating full browser happy paths merely
   to raise the route count.
5. **N5 configured webhook router fixture**: reuse DigetPay fake/SQL fixture so
   actual accepted HTTP path, duplicate hints and lookup-based binding have
   evidence. Existing service safety assertions remain intact. Production stays
   disabled; this is not real-provider acceptance.
6. **N6 Google router branches/observation**: instrument current isolated test or
   explicitly export its outcomes, adding disabled/denial/expiry/provider failure
   controls. Do not call Google or count disabled full-app 404 as enabled success.
7. **N7 socket behavior**: preserve existing browser reorder positive; add mesh
   camera/offer/answer/ICE recipient tests, cross-room/unjoined/nonmesh/revoked
   negatives, invalid reorder and wrong board IDs.
8. **N8 missing feature edges/browser actions**: feature table's exact remaining
   acceptance states, grouped by private planner, guide, and community; positive
   persisted assertions plus reward/role invariant. Add meaningful tests only;
   titles and imports are not branch coverage.

After these additions the main gate must rerun exact current source and report
actual canonical statuses/effects. Local source coverage can become complete while
real camera/second-device, OAuth receipt, mail delivery, merchant sandbox, alerts,
hosted parity/migration/restore/HSTS and approved deployment remain UNVERIFIED.
Those external checks require their designated environment and cannot be closed by
any mapping, browser interception or service fake.
