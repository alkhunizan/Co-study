# Server boundary full-read review

Prepared 2026-10-23 for the Halastudy release-fixes run. This packet is a read-only source review, not a runtime acceptance result or release verdict.

- Source checkpoint: `c4d6c50553f55704b4d4a788db28b05fa983047a`.
- Checkout: `E:\D-Backup\OS\Claude-Projects\body_doubling_live_cam\workspace\Co-study`.
- Assigned coverage: **28/28 files fully read, 8,006 physical lines**. Full means every line appeared in a bounded source read; search hits were not counted as full reads.
- At the pre-report source check, `git diff --name-only` was empty. Subsequent parent work changed presentation files outside this assigned batch; this report's application references remain against the checkpoint above. Pre-existing untracked packets were preserved.
- No tests, runtime probes, provider calls, commits, deployment, database writes, or external writes were performed by this reviewer. Only this report was created.
- Findings below distinguish a source-confirmed failure path from a concurrency hypothesis that still requires the main agent's local probe. Actual HTTP/socket outcomes and effects are **not executed** in this packet.

## Completed assigned coverage

IDs retain the planning baseline from `docs/plans/2026-10-23-halastudy-fix-plan/COVERAGE.md`. Application line references below refer to the checkpoint above.

| ID | File | Completed read ranges | Depth / principal boundary |
| --- | --- | --- | --- |
| F002 | `server-https.js` | 1-58 | Full; local HTTPS certificate and startup |
| F004 | `co-study-server.js` | 1-300; 301-600; 601-900; 901-1200; 1201-1500; 1501-1800; 1801-2100; 2101-2400; 2401-2700; 2701-3000; 3001-3067 | Full; rooms, sockets, identity, media reservations, persistence, shutdown |
| F005 | `room-store.js` | 1-352 | Full; room normalization, hydration, queued/atomic file writes |
| F006 | `user-store.js` | 1-364 | Full; identity normalization, revocation epoch, history retention, queued/atomic file writes |
| F008 | `schedule-utils.js` | 1-260; 261-505 | Full; Riyadh dates, recurrence, attendance rollup |
| F009 | `services/admin/admin-routes.js` | 1-245; 246-471 | Full; bootstrap-era shared admin and operational mutations |
| F010 | `services/auth/auth-routes.js` | 1-261; 262-328 | Full; signup/login, account mutation queues, logout, history import, deletion |
| F011 | `services/auth/google-routes.js` | 1-244 | Full; OAuth state/PKCE, verified subject binding, persistence, reauthentication |
| F012 | `services/auth/index.js` | 1-127 | Full; account and anonymous HMAC tokens, input normalization |
| F013 | `services/auth/password.js` | 1-36 | Full; PBKDF2 and constant-time verification |
| F014 | `services/auth/reauth.js` | 1-36 | Full; purpose/session/epoch-bound reauthentication proof |
| F018 | `services/ops/backup-scheduler.js` | 1-89 | Full; single-flight backup, retention, shutdown wait |
| F019 | `services/ops/error-buffer.js` | 1-32 | Full; bounded recent-error ring |
| F022 | `services/platform/catalog.js` | 1-24 | Full; fixed plans and mode/time-bound subscription entitlement |
| F023 | `services/platform/cohorts.js` | 1-187 | Full; membership, owner/supervisor scope, invite/session transactions, removal |
| F025 | `services/platform/dashboard.js` | 1-34 | Full; current membership and own focus projection |
| F027 | `services/platform/digetpay-billing.js` | 1-257 | Full; sandbox order state, verified reconciliation, notification jobs, review and idempotency |
| F029 | `services/platform/index.js` | 1-119 | Full; database/service composition, account projection, room access, account purge |
| F031 | `services/platform/progress.js` | 1-110 | Full; server-time credit, user locking, XP ledger, repeat completion |
| F033 | `services/platform/routes.js` | 1-190; 191-367 | Full; user/MFA/permission middleware, staff operations, cohort receiver revocation |
| F035 | `services/platform/study-planner.js` | 1-250; 251-500; 501-759 | Full; scoped SQL, quotas, optimistic versions, idempotent creation/conversion/recurrence, journal and insights |
| F040 | `services/video/index.js` | 1-24 | Full; provider factory |
| F041 | `services/video/mesh-provider.js` | 1-32 | Full; mesh provider contract |
| F044 | `services/video/video-session-registry.js` | 1-129 | Full; admission counters, updates, stale/left session lifecycle |
| F077 | `db/migrations/001-platform.sql` | 1-147 | Full; initial schema, foreign keys, uniqueness and money constraints |
| F078 | `db/migrations/002-digetpay.sql` | 1-21 | Full; sandbox order constraints and unique money/provider identifiers |
| F079 | `db/migrations/003-payment-review.sql` | 1-10 | Full; version-gated open-order index adjustment |
| F080 | `db/migrations/004-study-tools.sql` | 1-75; 76-77 | Full; study ownership composite foreign keys, limits and mutation uniqueness |

## Followed enforcers and guard twins

These are additional reads, not replacements for any assigned row.

| Dependency | Read coverage | Purpose |
| --- | --- | --- |
| `services/socket-boundary.js` | Full 1-30 | Confirm argument validation, rejection containment and whether async events are serialized |
| `services/platform/digetpay-client.js` | Full 1-28; 29-110 | Verify provider enablement, deadlines/body cap, order/currency/amount/transaction binding |
| `services/platform/maintenance.js` | Full 1-56 | Verify snapshot table set, repeatable-read snapshot, restore transaction and account epoch invalidation |
| `services/platform/access.js` | Scoped 45-126 | Follow MFA enrollment/verification, staff sessions, bootstrap and role-assignment enforcers |
| `services/platform/record-store.js` | Scoped 80-115 | Distinguish a debounced save from an awaited durable flush |
| `supabase-user-store.js` | Scoped 1-85 | Follow authoritative profile fields for the supported alternate account backend |
| `services/video/realtimekit-provider.js` | Scoped 187-205 | Check whether idle-meeting cleanup throws or handles provider failure |

## Actionable findings and probe candidates

All reproduction steps below are for disposable local state and fake providers only. Preserve the resulting evidence in this release-fixes packet and record the final source SHA, actor/configuration, canonical boundary, actual response/effect, and both positive and denial controls. Provisional severity is for probe prioritization.

### SR-01 — Concurrent joins on one socket can leave two room memberships

**Disposition:** concrete concurrency candidate; P1 provisional; runtime reproduction required.

**Source:** `co-study-server.js:2507-2513`, `2592-2612`, `2956-2968`; `services/socket-boundary.js:17-19`.

`join-room` captures and removes `socket.data.roomId` before its final awaited membership check. Two overlapping joins can both observe the same previous room, then independently reserve a seat and call `socket.join()` for different destinations. The final check protects destination capacity/name uniqueness, but does not re-read/remove the current previous room. The wrapper invokes async listeners without a serializer. Disconnect cleanup removes the seat from only the last `socket.data.roomId`, leaving a phantom participant in the other room map.

**Local reproduction:** use one guest socket and two disposable open instant rooms; emit both `join-room` commands without awaiting either acknowledgement. If timing needs control, defer the final local authorization lookup for both requests until both have passed the previous-room block. Inspect both `room.users` maps and the server socket's `rooms` set, then disconnect and inspect both maps again. A control uses sequential A-then-B joins and must leave only B occupied. Also test a failed destination join: leaving the previous room currently happens before some destination denial checks.

**Required invariant:** one socket has one application room, and every successful switch/disconnect removes its previous seat and receiver membership. Do not serialize all unrelated users globally.

### SR-02 — A denied join cancels an empty room's cleanup timer

**Disposition:** source-confirmed lifecycle failure path; P2; runtime effect still unexecuted here.

**Source:** `co-study-server.js:1350-1354`, `2472-2501`.

The handler clears the empty-room TTL timer immediately after the first membership lookup, before password validation and several later denial paths. A wrong or missing password returns without reserving a seat or restoring that timer. An empty instant room can therefore survive indefinitely after a single unsuccessful join.

**Local reproduction:** create an empty password-protected instant room and record that `cleanupTimer` exists. Attempt `join-room` with a wrong password. Record the denial, zero participants, and `cleanupTimer === null`. A successful join must clear the timer; its later disconnect must schedule one again. No 30-minute sleep is necessary to verify the lost timer.

**Required change:** tie timer cancellation to a successful seat reservation, or restore empty-room cleanup on every unsuccessful path.

### SR-03 — Legacy shared-admin ban acknowledges before durable revocation

**Disposition:** source-confirmed missing durability wait; P1 auth provisional; failure/restart probe required.

**Boundary/configuration:** `POST <ADMIN>/api/users/:userId/ban` and `/unban`, with configured shared admin before named staff bootstrap.

**Source:** `services/admin/admin-routes.js:383-405`; `co-study-server.js:940-942`; `user-store.js:296-326`; `services/platform/record-store.js:88-105`.

The route mutates `banned`/`tokenEpoch`, calls `persistUsersSoon()`, disconnects banned sockets, and returns success immediately. Both file and SQL-backed save helpers debounce the new snapshot and return the previous write promise. Persistence failure or process exit before the delayed write can therefore lose an acknowledged ban. The named-staff sibling explicitly awaits `flushUsers()` at `services/platform/routes.js:280-298`; the legacy branch lacks that enforcer.

**Local reproduction:** establish a disposable target and legacy admin session; inject failure in only the account persistence boundary. POST ban and record whether success was acknowledged despite the failed write. Restart/re-hydrate disposable state and test target login and the pre-ban cookie. Controls: successful persistence survives restart; retired shared-admin access after bootstrap cannot mutate the target; failed revocation is not acknowledged as durable.

### SR-04 — Video re-mint capacity subtracts a stale active-session snapshot

**Disposition:** concrete concurrency candidate; P1 provisional; fake-provider probe required.

**Boundary:** `POST /api/rooms/:roomId/video-token`, paired with `/video-leave`.

**Source:** `co-study-server.js:1964-1968`, `1992-2018`, `2163-2186`; `services/video/video-session-registry.js:46-57`.

The endpoint captures `existingActive`, awaits revocation draining and meeting refresh, then subtracts one from current admission counts based solely on the old object's truthiness. If that session ends during the wait, the subsequent count no longer contains the supposedly replaced slot. A second participant can fill the slot, after which the re-mint's second check still subtracts one and can admit beyond the room/global cap. The per-mint lock does not cover a different participant's reservation. A video leave does not leave the application room, so final socket/member checks need not reject this scenario.

**Local reproduction:** with a fake provider and a small cap, establish session A. Hold a re-mint of A at a controlled local drain/refresh barrier, issue A's `video-leave`, fill the freed capacity using B, then resume A. Record actual statuses, returned grants, and both active counters. Controls: ordinary replacement at full capacity succeeds without increasing the active count; a new participant at full capacity is denied; provider failures release reservations.

**Required invariant:** compute the replacement discount from a session that is still active at the atomic reservation step.

### SR-05 — Legacy history import can drop lifetime minutes at retention rollover

**Disposition:** source-confirmed accounting path; P2; local functional probe required.

**Boundary:** `POST /api/me/stats/import`.

**Source:** `services/auth/auth-routes.js:249-261`; `user-store.js:42-71`, `125-131`.

Import merges retained day maps, then calls `sanitizeFocusStats()`, which slices to the latest 370 keys without moving omitted days into archived lifetime totals. In contrast, ordinary session rollover explicitly archives evicted days. Importing a new day into an existing 370-day history can keep total minutes flat or reduce them despite adding activity. This concerns the legacy personal-history store; it does not grant platform XP or authority.

**Local reproduction:** seed a disposable account with version-2 stats containing 370 consecutive retained days, each with 60 minutes, and zero archived totals. Import a later day with 60 minutes. Expected retained days: 370; archived minutes: 60; lifetime minutes: 22,260. The current path calculates 22,200 with zero archived minutes. Include repeated-import and existing-day max-merge controls, and verify persistence after restart.

### SR-06 — Ended video registry entries have no retention bound

**Disposition:** source-confirmed retention omission; P2 operational follow-up; runtime sizing unexecuted.

**Source:** `services/video/video-session-registry.js:11`, `17-30`, `46-57`, `94-110`.

Each distinct room/user/client-session key remains in `sessions` after leave or stale sweeping. Sweeps mark old records left but never remove them, and every active listing/capacity calculation scans the accumulated map. The public API does not expose ended history; long-running reconnect/room churn grows both retained memory and admission scan work.

**Local reproduction:** instantiate the pure registry with a fake clock, register/leave many distinct keys, advance beyond stale age, and sweep. Compare `sessions.size` with active count. Preserve all active entries and the existing replacement/leave behavior when introducing a bounded ended-record retention policy.

## Supported-mode acceptance boundaries requiring explicit disposition

### SB-01 — Supabase-mode scheduler snapshot excludes authoritative profiles

**Disposition:** supported-mode backup gap/acceptance boundary; configuration-dependent, not a claim that production currently uses this mode.

**Source:** `co-study-server.js:903-915`, `917-933`; `supabase-user-store.js:17-68`; `services/platform/maintenance.js:5-28`.

Supabase owns account profiles when configured, and the server deliberately bypasses the SQL accounts wrapper and the users-file backup target. The SQL platform snapshot can contain projected users and study data, but cannot reconstruct Supabase password hashes, token epochs, Google linkage and full account profiles. The scheduler can still report a successful backup. Do not describe that output as a complete account-and-platform recovery snapshot unless a separate accepted provider backup/export supplies the missing authority.

**Local fixture/acceptance:** use an isolated fake Supabase backend, create an account, run the backup through the supported path, and inspect only the fixture's snapshot table/field inventory. Demonstrate how the authoritative profile is restored and old sessions invalidated, or document the separate provider backup/restore acceptance required before release. Never dump real profile contents into evidence.

### SB-02 — MFA enrollment needs an in-flight revocation control

**Disposition:** scoped security hypothesis requiring a controlled race probe; no exploit claim.

**Source:** `services/platform/routes.js:194-201`; `services/platform/access.js:46-56`; compare account login's epoch/hash recheck at `services/auth/auth-routes.js:151-155`.

Enrollment verifies the password asynchronously and then enrolls using the earlier `req.user`. Its SQL helper locks the user row but does not check the account token epoch/hash or current in-memory identity. Upstream middleware checks identity before entering the handler. A revocation/reset while the password or enrollment transaction is waiting therefore needs an explicit negative control; the source does not show the corresponding late check.

**Local reproduction:** defer enrollment's SQL lock/write in a disposable account after password verification, revoke/reset/logout the account using local test controls, resume enrollment, and record whether a new secret/QR is returned or persisted. Pair with ordinary fresh enrollment and stale-cookie denial. If an upstream guarantee refutes the race, record the exact enforcer and observed evidence.

## Refuted or bounded candidates

These were investigated so the main gate does not spend fixes on already-enforced behavior. Source conclusions still require current positive/negative runtime coverage where the plan requests it.

| Candidate | Source disposition / enforcing locations |
| --- | --- |
| Shared admin remains usable after named bootstrap | Refuted for normal subsequent requests: both `requireAdmin` and shared login check `platform.access.hasStaff()` before proceeding (`services/admin/admin-routes.js:77-91`, `118-122`). Routes mount only with valid admin configuration (`co-study-server.js:2246-2275`). Keep the planned retirement probes. |
| Password-account takeover through Google email equality | Refuted: state is browser-bound, expiring and single-use; PKCE is exchanged server-side; verified email and subject are required; linking an existing password account requires that account's live signed-in session (`services/auth/google-routes.js:114-164`, `175-207`). Both provider exchanges carry 10-second abort signals (`133-150`). |
| Signup/login cookie issued before durable account creation or after changed password | Refuted in the ordinary paths: duplicate email is rechecked after hashing, signup flushes before issuing the cookie (`services/auth/auth-routes.js:108-128`); login rechecks object identity, epoch and hash after password verification (`151-168`). |
| A forged normal cookie supplies authority | Refuted: token HMAC verification is timing-safe; expiry and future issue time are checked; server resolution rejects banned/current-epoch mismatch (`services/auth/index.js:66-83`, `co-study-server.js:1023-1032`); socket event middleware re-resolves the original account cookie (`2323-2345`). Anonymous signed cookies are separate and do not grant named-user roles. |
| Reauthentication proof can be reused for another account/session/purpose | Refuted: HMAC, user ID, token epoch, hashed account session, purpose and bounded expiry are all checked (`services/auth/reauth.js:19-33`). |
| VIP/subscription state grants staff permission | Refuted: entitlement selection is mode/status/time scoped (`services/platform/catalog.js:14-19`); staff routes require staff-session MFA plus named permissions (`services/platform/routes.js:63-67`). Fixed USD 4.99/month remains separate from authority. |
| Forged DigetPay notification directly activates VIP | Refuted: notification validates identifiers and queues a bounded retry job; reconciliation performs server status lookup, transaction uniqueness and active-subscription checks (`services/platform/digetpay-billing.js:70-120`, `175-237`). Client status verifies order/currency bindings, exact USD minor amount and refund contract (`services/platform/digetpay-client.js:76-105`). Live provider activation is disabled in production (`17-20`); actual provider acceptance remains external. |
| Replayed successful focus completion duplicates XP | Refuted: per-user SQL locking, completed-state repeat return, a unique open focus session, and unique session/day/rule ledger keys enforce idempotency (`services/platform/progress.js:28-75`, `db/migrations/001-platform.sql:112-118`). Legacy imported minutes do not write this ledger. |
| Study mutation ID or dynamic table name can cross user boundaries | Refuted in the fully read planner: table names come from the own-property allowlist (`142-145`); reads/updates carry `user_id`; user-row locks serialize quotas and optimistic versions; task/project/focus ownership has composite foreign keys (`004-study-tools.sql:16-25`, `50-54`). Creation retries are scoped by user plus mutation key and request hash (`study-planner.js:178-242`). |
| Foreign/member cohort mutations or remove/leave retains ordinary future access | Refuted for ordinary completed requests: membership and manager/supervisor checks are scoped to the cohort; mutation transactions lock that cohort; removed members' RSVPs are deleted (`cohorts.js:6-11`, `88-169`). HTTP role removal and leave disconnect account sockets (`routes.js:126-131`, `144-147`); schedule privatization disconnects excluded receivers synchronously before its next fallible await (`153-167`). Keep the stale-race controls. |
| Case state change and audit use separate commits | Refuted: case update and audit use the same `tx` (`services/platform/routes.js:244-254`). Preserve that transaction and test rollback via injected failure. |
| Protected-room public lookup returns messages, board, password hash or provider tokens | Refuted: protected/password/membership-ineligible lookup uses the bounded preview (`co-study-server.js:1199-1212`, `2189-2215`); full private state is sent through the guarded join path. Registry rows store provider participant IDs, not raw `authToken` (`2018-2029`, `2071-2099`), so the admin active-session listing is not a raw-token leak. |
| Idle meeting cleanup necessarily creates an unhandled rejected promise | Refuted for the actual provider: `closeRoomMeeting` catches provider errors and returns `{ ok: false }` (`services/video/realtimekit-provider.js:187-205`). Its failed-result retry semantics remain an operations acceptance concern rather than a process-crash claim. |
| New study tables are absent from the SQL backup/restore path | Refuted: the v3 table set includes all ten study tables; snapshots use repeatable read; restore is transactional into an empty DB, validates table inventory/checksum and bumps restored account epochs (`services/platform/maintenance.js:5-53`). This does not substitute for the Supabase-mode account backup boundary above. |
| Concurrent manual/automatic backups interleave freely or close drops active work | Refuted within one scheduler instance: `running` coalesces backups and `stop()` waits for the active operation (`services/ops/backup-scheduler.js:59-81`). Separate hosted restore/rollback verification is still required. |

## Handoff

Prioritize SR-01/SR-03/SR-04 and SB-02 for controlled probes before changing code; confirm SR-02/SR-05 with small functional checks. Record explicit dispositions for SR-06/SB-01. Source reading closes the assigned **F** rows only; it does not mark any of the 133 HTTP/socket boundary patterns executed or green. Current positive/denial evidence, PostgreSQL rollback/restore, provider acceptance, release approval and production verification remain the main gate's responsibility.
