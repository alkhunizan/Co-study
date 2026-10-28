# Halastudy trust, progress and private circles sweep

Date: 2026-10-21 (Asia/Riyadh). Delegated read-only review. No application edits, runtime tests, production credentials, provider calls or external actions were performed. The parent implementation run owns reproduction, prioritization, fixes and final acceptance.

## Source and evidence boundary

The inspected checkout reported HEAD `5b186bd330fa459ca3787a413d374c62384d4435`. This is a shared working directory; line references describe the source read during this sweep, not a guarantee that later implementation has left it unchanged. Git inspection used a command-scoped `safe.directory`; no global Git configuration changed. Existing hardening and viber records were reconciled against current code rather than reused as current test results. No old test counts are asserted here.

Representative SHA-256 values at the end of source review:

| File | SHA-256 |
| --- | --- |
| services/platform/routes.js | cdcdf0e4019ee46fc830cdd9f7309126832c6a5fbaa0a98181f4dac45987aeeb |
| services/platform/index.js | 22744d06c5fe626f1d81edc756262c207a1d2c61964f869d89bb92d83edbf9c2 |
| services/platform/progress.js | 52c2fd1bac56a8efcce4814e70ed1d371003e71e98e463c8713992f66199330c |
| services/platform/cohorts.js | a3b943ab8bcfc8d55045ad4c2067db79cfd3ef0937a7504ef30fc2f5a3696fac |
| public/js/focus-client.js | 3c278cad1d7f51a7bd85f0a3b0c0f477a27f11e55378f6e1983a542dd9f785e3 |
| index.html | f5d7d3b6164516fddd9b363b8f56e85ce02749a1db0a3faf56571d46c200c149 |
| account.html | f46e27cdf6c1c7fb0b5e3cddca9c01383a6c733027126190f49804196aad2558 |

## Prioritized findings

### TS-01 — High-impact candidate: captured HTTP identity can outlive deletion or revocation

**Status:** source-supported race candidate; requires deterministic local reproduction before fixing or reporting as a confirmed exploit.

HTTP authentication resolves the cookie once and stores the account object on the request (`co-study-server.js:1022-1048`). Platform middleware then awaits `platform.ensureUser(req.user)` (`services/platform/routes.js:39-44`). That function INSERTs/UPSERTs `halastudy.users` from the captured object (`services/platform/index.js:40-47`). Neither this middleware nor the generic handler performs a fresh live-cookie/epoch check after the await. The established account mutation queue does perform identity/epoch checks (`services/auth/auth-routes.js:46-74`).

An already admitted platform request delayed before its ensureUser upsert could resume after deletion removes the account and SQL user row. It can recreate the SQL identity projection, and `/focus/start` can then find that new row through `lockUser` and create personal state for a deleted identity. Logout/reset/ban can similarly leave an in-flight request operating on a captured account whose token has since been invalidated. Subsequent independent requests still reject the old cookie; this concern is specifically the already-running request.

**Local reproduction:** use the real local server/router fixture and a controllable gate around one platform request's ensureUser, before its original upsert. Start `/api/platform/focus/start` with a valid synthetic account cookie; wait until gated. Complete deletion through the ordinary API, then release the gate. Assert the pending request is rejected and SQL `users`, `accounts`, `focus_sessions` remain absent. Repeat with logout/reset/ban and assert no post-revocation mutation. Do not log cookies. Include a normal allowed concurrent request as control.

**Acceptance:** request identity is revalidated at asynchronous boundaries, and compatibility projection hydration cannot resurrect a deleted identity. Review socket `ensureUser` callers as siblings, especially report processing at `co-study-server.js:2927-2931`; their captured user references can also survive intervening awaits.

### TS-02 — Medium: account and room progress still use a different, unlabeled accounting system

**Status:** confirmed source behavior; rendered browser impact should be recorded by the parent.

`/app` reads server-validated focus progress. `account.html:648-653` instead reads `/api/me/stats` and presents generic focus hours/current/best streak (`account.html:233-246`). Room completion still posts client-provided minutes to `/api/me/focus-session` in addition to trusted completion (`index.html:3195-3203`). That legacy endpoint intentionally accepts bounded, client-asserted minutes (`services/auth/auth-routes.js:223-239`), while trusted rewards are computed independently. The legacy streak does not expire on read (`user-store.js:78-88`), and a copy is relayed to peers in presence (`co-study-server.js:2587-2588`).

This is **not** an XP inflation defect: the SQL reward ledger remains separate. It is a product trust issue because two ordinary screens can give different unlabeled answers to the same personal progress question. A long-resting member can retain a historical current streak on Account while Progress correctly reports zero. A room timer client can also add legacy hours that have no matching verified reward credit.

**Local reproduction:** seed a synthetic account with legacy/imported history and a trusted session with different minutes; load Account and Progress. Advance the injected service clock beyond the streak grace day and compare. Complete a short room timer with a known trusted credit amount and verify the two sources and their labels.

**Acceptance:** canonical progress surfaces use trusted totals consistently; preserved imported/manual/legacy history has an explicit label and never masquerades as verified reward eligibility. If a historical streak remains visible, label it accurately and derive a current streak from its day boundary. Keep data migration reversible.

### TS-03 — Medium: duplicate tabs share trusted accounting but not dependable client state

**Status:** source-confirmed missing synchronization; reproduce the exact UI consequences locally.

Each document has its own `current` session (`public/js/focus-client.js:3`). Only locally active sessions heartbeat (`:34-40`), and no storage/BroadcastChannel/visibility reconciliation exists. A local `start` also returns immediately when its cached session says active (`:25`). Therefore a paused tab stops reconciling indefinitely: resume/complete in another tab does not update its controls. A stale locally active room timer can call `start`, receive its old cached session without contacting the server, and later discover SESSION_CLOSED on heartbeat. The client clears it (`:29`) and emits `halafocuserror`, but the room has no listener for that event; the room timer continues without a current verified session. This can yield legitimate study with unconfirmed or missing reward credit rather than inflated credit.

The existing two-tabs integration case (`tests/integration/platform.integration.test.js:74-95`) proves SQL start deduplication and replay resistance, not two-document synchronization.

**Local reproduction:** open two pages in one authenticated browser context. Restore the same active session. Pause in A, wait until B receives paused, then resume/complete in A. B must reconcile. Separately, complete in B while A retains cached active state; invoke the room timer start in A before the next heartbeat, then observe verified session state after the heartbeat. Assert visible recovery and a deliberate resume/new-session path. Exercise reload and focus-return after a >45-second interruption.

**Acceptance:** treat cross-tab messages as invalidation hints and fetch authoritative server state; include focus/visibility reconciliation for missed events. Serialize reconciliation with mutations, prevent older reads overwriting newer actions, and surface room heartbeat failures. Keep the existing one-session SQL and daily caps.

### TS-04 — Medium: a leaked circle invitation cannot be individually revoked

**Status:** confirmed missing lifecycle operation in the current service/routes/UI.

Invites are hashed, single-use, owner-created, and expire after 48 hours (`services/platform/cohorts.js:34-45`). There is no list/revoke operation in the exported circle service (`:168`) or routes (`services/platform/routes.js:104-107`). The only early invalidation is archiving/deleting the owner's circle (`cohorts.js:132`; `services/platform/index.js:97-99`). Creating another invitation does not invalidate the previous one. An owner who shares a code to the wrong place must currently retire the whole circle or wait for expiry.

**Local reproduction:** create two single-use invitations, navigate away/reload, and confirm there is no owner action to retire either outstanding code. A synthetic outsider can still accept the first one. No production sharing is necessary.

**Acceptance:** expose bounded owner-only pending invitation metadata and revoke, without exposing bearer codes again or membership/activity publicly. Revoke-vs-accept must serialize on the same circle/invitation lock, produce one clear outcome, and remain available for safe cleanup after VIP expiry. A simpler explicit 'revoke all outstanding invitations' action is acceptable if explained accurately.

### TS-05 — Medium/low: invitation acceptance retries can falsely report failure after success

**Status:** confirmed service response behavior; network-loss UI reproduction still needed.

`services/platform/cohorts.js:51` rejects every already-accepted invitation before checking its accepting account. The client refreshes membership only after successful accept (`public/js/platform.js:758-760`). If acceptance commits but its response is lost, the ordinary retry reports INVITE_INVALID even though membership was added. Schedule retries already solve their corresponding lost-response case (`services/platform/cohorts.js:108-121`).

**Local reproduction:** accept a code through a local route whose first successful response is discarded after commit; retry using the same account. Verify membership remains exactly one row and the user gets a useful success/already-joined state. A different account using that code must still fail. Test an accepted account that has subsequently left or been removed so replay cannot silently rejoin it.

**Acceptance:** same-account retry with still-current membership returns the same circle result; foreign replay and replay after leave/removal remain rejected. Deduplicate join audit records.

## Responsibility and guard matrix

| Domain | Authority and current responsibility | Current guards / evidence | Boundary to preserve |
| --- | --- | --- | --- |
| Identity and session | Auth cookie verification plus live in-memory account; SQL record store is durable account authority | Epoch/ban/current-account checks in `co-study-server.js:1022-1029`; serialized field mutation rollback in `auth-routes.js:46-74`; optimistic account revisions and deletion cascade in `record-store.js:26-51` | Revalidate captured requests; no projection resurrection (TS-01). Keep personal records separate from permission claims. |
| Staff authorization | Named role assignments and explicit permission map | `access.js:6-12`, `:32-41`; staff session bound to account cookie and expires in 15 minutes (`:76-89`); role changes invalidate staff sessions (`:119`) | Payment, points, badges and circle supervisor roles do not grant staff permissions. |
| Entitlements | Catalog plus server-side active subscription | `catalog.js:1-8`, `:13-19`; VIP 499 USD minor units, expiry and feature lookup | Preserve USD 4.99 commercial terms. Free focus credit uses the same rule. Privilege never follows entitlement. |
| Billing | Server-selected adapter/mode, verified provider/simulator state | `platform/index.js:16-32`; test/live partition and active-subscription query in catalog | No live charges, credential use, dashboard/provider acceptance or commercial changes in this task. |
| Focus sessions and rewards | Server clock; per-account lock; SQL session/ledger | `progress.js:4-6`, `:28-76`; one-open partial unique index (`001-platform.sql:112-113`); session/day/rule ledger uniqueness (`:114-118`) | 15-second heartbeat; 45-second interruption grace; paused time excluded; 240-minute session ceiling; 240 XP/day; fixed Riyadh day split; repeated complete idempotent. Preserve trusted credit and separate legacy history. |
| Day grouping and streak | UTC event instants grouped with fixed Riyadh day | `common.js:15-16`; `progress.js:19-24`, `:87-98`; dashboard explicitly reports Asia/Riyadh | Fixed timezone prevents client timezone flipping to farm rewards. Name that timezone in UI. Changing schedule display timezone must not change rewards. |
| Private circles | Membership/owner/supervisor relations in SQL | `cohorts.js:6-12`, owner-only member roles `:76-94`, row locks around invite/schedule/remove; self-only attendance for ordinary members `:155-166` | Member list scoped to circle; supervision scoped to assigned circle; no global activity/feed. Add invitation cleanup (TS-04). |
| Room ownership and admission | Durable SQL room ownership/cohort scope; runtime rooms and sockets | `platform/index.js:50-68`; HTTP host check `routes.js:163-166`; per-event membership rechecks `co-study-server.js:2330-2342`; rechecked join seat `:2591-2606` | Room host is not platform staff. Password and circle membership remain independent gates. |
| Presence and attendance | Runtime sockets for present users; SQL attendance timestamps for scheduled windows | Quiet connected users swept via `co-study-server.js:1675-1687`; membership join in `platform/index.js:70-82` | Attendance is room presence, not proof of concentration. Early join can be recorded up to 15 minutes before start; avoid implying duration or learning. |
| Media lifecycle | Server video registry plus provider and durable revocation journal | `services/video/revocations.js` tracks identifiers before delivery, marks prior grants pending on restart, retries bounded batches; existing local fixture hardening tests retained | Real remote pixels and provider token revocation require designated-provider/device acceptance, as explicitly documented in `docs/hardening/2026-10-21/ACCEPTANCE.md:15`. Do not downgrade blur fail-closed behavior. |
| Data ownership and runtime concurrency | SQL account/room records plus process-local room/socket caches | Optimistic record revisions; PostgreSQL advisory runtime lease (`database.js:23-41`), PGlite exclusive local lock (`:75-80`) | Retain one runtime. Do not add replicas/jobs assuming shared live presence or atomic map operations. |
| Moderation data | Scoped staff cases plus persisted legacy room reports | Reports are not in public room snapshots; case permission map exists | The report warning currently includes targetName (`co-study-server.js:2940-2945`); reduce to IDs/reason for log minimization. Clarify retention of legacy report names/detail/client IDs versus SQL deletion scrubbing before any broad deletion claim. |

## Existing protections retained; not new defects

- Server-timed, camera-independent focus credit, pause exclusion, no duplicate active session, repeated completion, foreign session rejection, midnight splitting and daily/session caps are implemented. Their test source is `tests/integration/platform.integration.test.js:74-95,127-150`; the parent must rerun relevant tests on its final source.
- Circle removal disconnects the removed account, leaving disconnects self, and archive closes private runtime rooms (`routes.js:108-129`). Each packet rechecks account and circle access (`co-study-server.js:2330-2342`). These are not the old missing-revocation defect.
- Room schedule retry deduplication and private-scope enforcement before a fallible room flush exist; `tests/integration/circle-lifecycle.integration.test.js` specifically covers failed snapshot and owner-deletion archival.
- Private-circle scope is retained after owner deletion/archival. Entitlement expiry blocks additions but preserves cleanup and stored study records. Do not erase these working boundaries to simplify UI.
- Named staff permissions and fresh staff MFA are separate from subscriptions and rewards. No payment-to-staff or achievement-to-staff path was found in reviewed files.

## Bounded product recommendations

1. **One trustworthy personal recap.** Use completed verified minutes/points, a brief pause/interruption explanation, and a small next-session action. Preserve legacy/imported data as a separately named record. Explain that camera use is optional, points accrue for completed verified whole minutes, and the cap is per Riyadh day. Keep zero-credit short sessions honest and encouraging.
2. **Make existing quiet presence useful.** Extend the current visible status/shared intention only inside the joined room, using explicit visibility. Zero people: a real empty invitation state; one person: welcoming solo start; many: real count, short intentions and camera-off acceptance. No synthetic members or activity.
3. **Complete invitation control before adding social surfaces.** Single-use, expiry, bounded pending metadata, revoke and retry recovery create more practical safety than a feed. Owners must be able to close outstanding invitations without destroying their circle.
4. **Use personal milestones without punitive copy.** Show the existing first-session/100/1000 achievements as durable private milestones and use a forgiving return message after rest. Optional short personal goals fit better than public rankings. Defer circle competition until real community demand and explicit opt-in exist; no new challenge engine is essential to this refinement.
5. **Describe attendance narrowly.** Current timestamps establish room presence around a schedule, not study quality. Consider distinguishing early arrival from presence after session start, and keep 'No attendance recorded' neutral. Do not derive rewards, sanctions or supposed focus scores from attendance/camera state.

## Suggested final local verification slice

The parent can combine TS-01 gated identity lifecycle tests, two-page focus state/recovery checks, and invitation lost-response/revoke cases with existing progress midnight/cap tests. Use disposable data and a synthetic clock. Browser checks should compare the Account/Progress/room surfaces in Arabic and English, with camera off, at 390px and desktop. Existing real-provider media acceptance remains separate; this sweep adds no claims of live verification.
