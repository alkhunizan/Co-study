# Independent trust review of the twenty-feature candidate

2026-10-22 (Asia/Riyadh). Base HEAD `3091b0eefd0461163a15861d7fd67ddeb868e739`, branch `feat/2026-10-22-top-20`, uncommitted candidate. Read-only source/test inspection; no app edits, test/probe execution, credentials, production data, external actions or memory writes. The parent owns reproduction and final source verification. No critical/high defect was established by this review; tentative ownership/data-loss claims were checked against actual guards before being rejected below.

## Focused findings

### FT-01 — Medium: private agenda reminders can outlive revocation in an open tab

**Evidence:** `public/js/study-workspace.js:214-218` uses cached `owner`, preference and `agenda` values to display an in-app banner and call `new Notification` with a private session title. Agenda refresh occurs during `load` (`:201-205`) or platform-context events (`:224`); the one-second delivery loop (`:220-222`) performs no current-account/membership check. A separate tab's logout or an owner's circle removal can therefore leave this tab with a future notification still scheduled. Authenticated server agenda requests correctly exclude removed members; that server guard does not invalidate this existing client cache.

**Status:** code inference, not runtime reproduced. This is a new delivery after revocation concern, not a claim that already downloaded information can be remotely erased. Both browser permission and the reminder preference are opt-in, which limits impact.

**Concrete check/fix:** in two same-account tabs, enable a synthetic upcoming-session reminder and grant a test Notification stub; log out in one tab, advance the other's local clock into the reminder window, and require no notification containing the old private title. Repeat with circle membership removal while the user otherwise stays signed in. Revalidate account plus agenda immediately before delivery, or use a short freshness contract plus account-revocation invalidation; on 401/membership loss clear cached agenda/banner and stop reminder delivery. Do not turn provider/session failures into a fabricated empty agenda or record a reminder as delivered before validation succeeds.

### FT-02 — Medium: reopen operations bypass the limits enforced on creation

**Evidence:** task creation counts only unarchived, incomplete tasks (`services/platform/study-planner.js:71-72`). `completeTask(..., completed:false)` (`:104-112`) reopens a completed task without applying that count. For distractions, `update` can set resolved=false (`:81-99`), while its capacity check runs only on archived→unarchived transitions (`:92-94`). A user can complete/resolve items, create replacements up to the active limit, then reopen the old items to exceed 200 open tasks or 100 unresolved distractions. Overview returns at most 300 tasks or 150 distractions (`:180-182`), so continued use can hide actionable rows as well as defeat the intended bound.

**Status:** source-level transition gap, not runtime reproduced. It does not grant XP or cross account boundaries. Existing tests check creation/recurrence/retry/version conflicts but not these inactive→active quota transitions.

**Concrete check/fix:** seed one completed task plus 200 current open tasks under one synthetic owner; attempt to reopen it and require an explicit limit response with no state/version change. Repeat with one resolved distraction plus 100 unresolved ones. Apply the same serialized active-capacity rule to every transition into counted state, including unarchive and unresolve. Preserve a no-op same-state retry and allow safe cleanup/completion even at the cap.

### FT-03 — Medium: bookmark/schedule lock order can form a PostgreSQL wait cycle

**Evidence:** bookmark creation takes the account row with FOR UPDATE (`services/platform/study-community.js:25`, via `common.js:26`), then inserts a child referencing the room (`:31`; migration 004 `:58`). Circle scheduling takes the room FOR UPDATE (`services/platform/cohorts.js:112`) and subsequently inserts a scheduled session referencing the creator account (`:131`; migration 001 `:79`). The FK checks introduce user→room and room→user dependencies when the same owner bookmarks and schedules the same room concurrently. Merely using a transaction does not remove that ordering.

**Status:** PostgreSQL lock-semantics inference, not runtime reproduced. Severity is retry reliability; the transaction wrapper rolls failed writes back, so this is not evidence of silent data corruption. PGlite's serialized transactions and the existing generic PostgreSQL outage checks do not exercise this service interleaving.

**Concrete check/fix:** use two controlled local PostgreSQL transactions: hold the schedule's room lock before its insert; let bookmark hold the same owner's account lock and wait on room FK; release the schedule to attempt its creator FK. Assert both operations finish under an agreed order or return a deliberately retryable response without duplicate bookmark/session. Prefer a consistent order or an account FOR NO KEY UPDATE mutex where sufficient to serialize the bookmark quota while allowing FK key-share checks; verify the full existing account/focus semantics if changing the common helper.

## Tentative critical/high claims refuted against source

| Candidate claim | Why it was not reported as a defect |
| --- | --- |
| A task can reference another account's project/session. | `study-planner.js:62-63,85,143-146,169` scope lookups by user; migration 004 `:16-25,54` adds matching composite owner FKs. The private endpoints are mounted after current-identity middleware (`routes.js:39-61`). |
| Task completion or routine clock manipulation can create XP. | The new private/community services do not write focus credit or the reward ledger. Link attribution reads the own active/paused session, and actual effort reads server-credited completed focus rows (`study-planner.js:137-146,180-184`). Guided timer code explicitly remains local guidance; existing authoritative progress accounting is retained. |
| Archiving a project deletes its tasks or verified history. | Archive updates project state and detaches task project IDs (`study-planner.js:100`); it does not physically delete the project. History snapshots in focus links remain. Child→parent FK direction cannot delete the authoritative focus session or XP. The integration source explicitly asserts preservation at `tests/integration/study-tools.integration.test.js:97-99`. |
| Lost create/conversion/completion responses always duplicate rows. | Creates use owner-scoped mutation keys plus normalized request hashes (`study-planner.js:65-79`); conversion uses a stable source-derived key (`:125-134`); task complete's same-state retry returns the stored row before recurrence generation (`:110-119`). Resource creation uses a circle-scoped mutation key and content hash (`study-community.js:76-79`). |
| Removed members retain server access to resources/RSVP/calendar. | Resource operations lock the circle and check active membership (`study-community.js:57-86`); RSVP rechecks the session after its circle lock (`:47-53`). Agenda joins current membership and unarchived circle (`:36-41`). Leave/remove now delete the member's circle RSVP rows (`cohorts.js:102,157`). Calendar is an authenticated download of that scoped agenda, not a public feed. FT-01 concerns the separate client cache. |
| New domains are omitted from backups, old formats rejected, or restore order violates FKs. | `maintenance.js:5-12` preserves V2_TABLES separately and appends all ten new tables after dependencies; `:19,32-36` adds v3 while retaining exact v1/v2 sets. Migration004 is registered and runtime version checked at `database.js:98-105`. Account epoch rotation remains in restore. The backup test source round-trips v3 and synthesized v1/v2 snapshots (`study-tools.integration.test.js:144-155`). |
| Account deletion strands new private rows. | Migration004's private roots reference users ON DELETE CASCADE; child owner FKs cascade. Shared resource author reference deliberately becomes null (`:69`). Existing account deletion removes the SQL user in its established transaction. Test source checks private cascades (`study-tools.integration.test.js:157-158`), although this review did not execute it. |
| Resource URLs or ICS text inject executable client content/calendar records. | Resource URLs require credential-free HTTPS (`study-community.js:68-70`); UI uses textContent and links set noopener/noreferrer (`study-workspace.js:210`). Calendar TEXT escapes backslash/newline/semicolon/comma, folds UTF-8 lines, and emits only title/circle metadata with server-generated IDs (`study-community.js:93-101`). No bearer invites, passwords or peer emails are exported. |

## Test evidence boundary and candidate fingerprints

Reviewed tests cover own/foreign CRUD, retry conflicts, project scope, recurrence, focus attribution, reflections, scoped resources/RSVP, ICS and backup compatibility. These are test-source observations, not passing-run claims. The parent should add focused evidence for FT-01/02/03 or explicitly disposition each with a reason before the final release verdict. No external acceptance step is introduced by this audit.

| Inspected file | SHA-256 |
| --- | --- |
| services/platform/study-planner.js | 18c72ba24dabb1aef884423dab88f21cd57fe85eb436fcc6c18ea9fe76ca1d70 |
| services/platform/study-community.js | 479f5b997b4b953db00bdaefb7b4d2edb5928aa582c76edd6d1a0aab73dc9694 |
| services/platform/study-routes.js | 243afeb048c17e6b0d8317ac9646f61056a02482c743e29a66b8248d337bd32f |
| db/migrations/004-study-tools.sql | 2c4b5d3e0637f5da7a6be954f17b66dec0b44849acab50abd37a71547db5435a |
| services/platform/maintenance.js | e36e1457416d61b82f0c5e7821dc50bc762a2e86c73a8a506b07e031df00d4a0 |
| public/js/study-workspace.js | 45bf2b45d28dea803bcbc2c082da00486fb22e02d9b61066446602294ae5bd99 |
