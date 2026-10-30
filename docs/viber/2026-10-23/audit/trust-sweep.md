# Phase 5 trust and reliability sweep

Date: 2026-10-23 (Asia/Riyadh). Inspected HEAD `a22b1558113f57b0904841c91704dd2e69e71594`. Read-only delegation; no app edits, runtime probes, production requests, credentials, pushes or deployments. The main agent owns reproduction, corrections and verdict. Historical findings were rechecked rather than inherited as open defects. Read `C:/Users/alkhu/.agents/skills/viber/references/05-sweep.md` in full.

## Current code-supported candidates

None below is claimed runtime reproduced. The source paths establish reachability and the missing guard; the local fixture plans establish what the main agent should verify.

| ID | file:line | pattern | reachable? | why it bites | fix | S/M/L |
| --- | --- | --- | --- | --- | --- | --- |
| SW-01, P2 | `services/supabase/client.js:43-57` | Deadline ends before body read; provider twin drift | Configured Supabase account backend; boot hydration, account flushes and analytics | Timer is cleared once fetch resolves headers; `res.text()` then has neither that deadline nor a byte bound. A provider that sends headers and stalls the body can hold hydration/persistence indefinitely. | Keep the deadline active through body consumption; bound response bytes; always clear/cancel in finally; retain structured failure handling. | S |
| SW-02, P2 privacy candidate | `services/supabase/client.js:59`; `supabase-user-store.js:85-87,124`; `services/logging/logger.js:12-24,35-51` | Provider error body enters logs | Same optional backend; failed provider SELECT/write | The thrown message includes a raw response excerpt. Store logging puts that message under the generic `error` field; logger redaction matches sensitive key names, not sensitive strings inside generic fields. Constraint/validation errors can contain private row data and reach stdout/recent-errors observers. | Log a stable event, operation and status; omit raw provider bodies and query values. Audit the provider-client twins below. | S |
| SW-03, P2 operations candidate | `Dockerfile:17-18`; `co-study-server.js:1625-1646,1842-1855` | Deployment health/readiness twin drift | Docker deployment path | Container health probes liveness `/api/health`. A database lease failure can leave liveness 200 while readiness is 503 and ordinary account requests reject. The healthy container indicator alone then misrepresents service availability. | Use `/api/ready` for the container health contract, or explicitly add a separate readiness contract in orchestration. Keep `/api/health` as liveness. | S |
| SW-04, P2/P3 recovery candidate | `public/js/study-workspace.js:1137-1142,1177-1181` | Unavailable state destroys retry candidates | Opted-in reminder when its freshness request fails | Catch clears cached agenda to `[]`; subsequent ticks require a candidate from that array before fetching again. One transient failure therefore stops autonomous reminder retry until another workspace refresh repopulates agenda. Non-auth feedback is written to the reminders settings status, which can be outside the current view. | Maintain a separate unavailable/freshness state and bounded retry schedule; never reveal stale private titles. Make retry/error useful in the active surface. | S |

### Main-agent reproduction plans and upstream checks

- **SW-01:** inject a local `fetchImpl` or loopback fixture into `createSupabaseClient({ timeoutMs: 50 })`. Respond with headers promptly, then stall the body. Require rejection within the deadline, not just header latency. A second fixture rapidly streams an oversized body; require bounded rejection. Existing hydration tests inject already-parsed client methods and therefore do not exercise this HTTP body boundary. Calls are awaited and store failures are surfaced; those upstream protections do not terminate a response body after the timer has been cleared.
- **SW-02:** return a local error body containing a unique synthetic private marker. Route the client failure through the actual store logger/error-buffer observers and assert the marker is absent. Status and a stable event should remain. Use no real row or credential. Current `sanitizeLogPayload` does recurse, but recursion does not redact a string under `error`/`message`. Billing already discards provider response bodies (`services/platform/digetpay-client.js:55-56`).
- **SW-03:** reuse the disposable PostgreSQL lease-loss fixture or a controlled readiness fixture. Show `/api/health` 200, `/api/ready` 503 and an ordinary protected operation rejected. Verify the Docker probe's chosen endpoint reflects readiness. This is bounded to container health; `scripts/verify-deploy.js:51-58` already checks both endpoints and deployment documentation tells operators to inspect readiness, so a claim that all release verification ignores readiness would be false.
- **SW-04:** use a synthetic opted-in session due shortly; make one reminder freshness GET fail, restore the fixture, and advance the local browser clock. Require a retry and exactly one valid reminder. Add membership removal/account change during recovery and require no private title. Current reminder code correctly refreshes agenda/preferences and sends an account header before delivery; the old stale-title-after-removal finding is fixed and is not this candidate.

## Twin and guard matrix

| Twins / boundary | Guards present in current source | Difference / result |
| --- | --- | --- |
| Supabase / RealtimeKit / DigetPay / Google / R2 HTTP clients | RealtimeKit deadline wraps `response.text()` (`realtimekit-provider.js:71-125`); Google uses continuing AbortSignal timeouts for token/profile bodies (`google-routes.js:144-153`); R2 clears deadlines after body reads (`r2-client.js:97-113,189-200`); DigetPay continues deadline and limits body to 64 KiB (`digetpay-client.js:29-46`). | Supabase clears before body read: SW-01. RealtimeKit/Google/R2 response byte limits are not established here; do not assume their deadlines also bound bytes. |
| Provider failures / logger / recent-errors | DigetPay returns stable error codes and explicitly discards sensitive provider details. Ops webhooks send a narrow field allowlist (`ops/alerts.js:117-124`). Logger protects keys matching token/secret/password/credential/key. | Raw Supabase body is embedded under a generic key: SW-02. Sanitized Cloudflare messages remain bounded but are provider strings; a redacted synthetic marker test can include that twin. |
| Liveness / readiness / deployment verifier / Docker | Separate endpoints; readiness checks database lease/store/socket; release verifier checks readiness. | Docker alone probes liveness: SW-03. PM2 remains one instance, matching the exclusive database lease. |
| Create / reopen / unresolve / unarchive quotas | Current planner has total+active capacity checks (`study-planner.js:146-162`) and applies reopen/unresolve checks (`:284-297,347-356`). Test source covers reopening at `study-tools.integration.test.js:468`. | Historical active-quota bypass dropped. No current bypass identified in inspected transitions. |
| Private CRUD / focus link / reflections / journal | Owner IDs in parameterized SQL; same-owner composite FKs; optimistic version checks; stable retry keys; journal entitlement window and keyset cursor. | No client-only ownership or reward authority found. Mutating task state and routines do not write the reward ledger. |
| Circle resources / RSVP / agenda / calendar | Active membership; cohort locks for shared writes; same-circle row predicates; leave/remove deletes RSVP rows; calendar derives from authenticated scoped agenda. | No current server-side member-removal bypass found. Lists are bounded; calendar deliberately excludes declined sessions. |
| Room admission / bookmark create / bookmark list | Runtime existence plus canJoin; bookmark locks room key-share before account; current list hides unavailable room metadata. | Historical user→room bookmark lock cycle dropped. Exact PostgreSQL sibling source test exists (`tests/postgres/outages.test.js:86`). |
| OAuth linking / reauthentication / ordinary password login | Callback captures live actor/epoch, rechecks after provider exchange and after account flush (`google-routes.js:105-107,160,188-206`); recovery uses one-use, purpose/account/epoch-bound tokens. | Historical stale-linking race dropped. No cookie/provider subject is printed by this audit. |
| Snapshot format / schema migration / deletion | Version 4 migration registered (`database.js:98-105`); v3 snapshot includes new domains; v1/v2 lists remain separate; restore rotates account epoch (`maintenance.js:5-12,32-45`); private roots cascade from users. | Historical missing-table/old-format backup claims dropped. Shared resource author becomes null by explicit schema policy. |
| Workspace account cache / private study calls / reminders | Study requests carry X-Halastudy-Account, checked on server (`study-routes.js:6-10`); page focus rechecks identity (`platform.js:520-528`); reminder re-fetches current agenda/preferences (`study-workspace.js:1146-1154`). | Correct privacy fail-closed behavior; failed freshness recovery is SW-04. |
| JS query object spread / SQL ownership filters | This domain uses explicit SQL scope predicates. Normalization spreads row/input but emits a fixed field allowlist. | No ORM `{ ...visibility, OR: ... }` guard-overwrite hit retained. |

## Pattern checklist and safe scan ledger

The scan read 409 tracked text files up to 2 MiB and excluded binary/larger files; untracked work and production `.env` files were not read. Searches emitted only paths/categories/counts for secret or identifier shapes. No scanner was installed. One unbounded email regex scan was interrupted and replaced by a bounded regex with a 200 ms per-file deadline; the corrected scan completed with zero timeouts. Two local PowerShell pipeline syntax errors were corrected; neither produced a partial result used as evidence.

| Phase 5 pattern | Status | Evidence / limits |
| --- | --- | --- |
| 1. Secret literals | CLEAR for matched high-entropy classes; URI literal classification limited to context | No OpenAI/AWS/GitHub/JWT/private-key shape matched. Four database-URI-shaped locations: `.env.example:147` (commented configuration example), `.github/workflows/ci.yml:34`, `scripts/test-postgres.ps1:23`, `tests/integration/database-failure.integration.test.js:34` (test/fixture paths). Values never emitted. This is not a full secret-history or entropy audit. |
| 2. Machine-specific and personal data | CLEAR for inspected reachable paths; manual personal-name review limited | Loopback ports/paths belong to local runners, CI, deployment templates or explicit defaults. Bounded non-example-email scan found only three shapes in `tests/integration/platform-api.integration.test.js`; no personal value emitted. Public branding/contact content was not classified as a secret. Raw machine-pattern count: 1,264 in 170 files, not all individual hits manually reviewed. |
| 3. Debug/temp surfaces | CLEAR in inspected server mount surface | Static routes allow published asset roots; no repository-wide static mount. Private docs/services/env paths do not receive a static handler. Public metrics are coarse. No reachable debug route retained. |
| 4. Swallowed errors | FINDING | SW-04; optional storage/audio/SDK teardown catches are best-effort, while revocation/alert workers log or persist retry work internally. Raw empty-catch matches: 65 in 20 files; empty promise catches: 36 in 21 files. These are search counts, not 101 asserted defects. |
| 5. Async/loading/errors | FINDING | SW-01 and SW-04. Socket boundary wraps rejected async handlers (`services/socket-boundary.js`); queues recover previous rejected promises deliberately. |
| 6. Sibling drift / overwrite | FINDING | HTTP-client and health-probe matrix above; no SQL scope overwrite found. |
| 7. TODO/stub/skip | CLEAR for production source searched | No TODO/FIXME/HACK/lorem/coming-soon match in the searched reachable source. Broad tracked-text scan had 118 hits in 20 files, largely records. One test.skip is an explicit offline-only external-font diagnostic (`ux-return.smoke.spec.js:205`), not disabled product coverage. |
| 8. Mock/permissive fallbacks | CLEAR in inspected production boundaries | Simulator checkout requires test mode; production disables it. Local recovery mail is explicitly disabled in production. Dev session-secret fallback throws in production. Raw mock/fixture/simulator text: 237 matches in 81 files. |
| 9. Client-only authority | CLEAR in inspected domains | Server owns focus credit, role permissions, entitlement resolution, planner/resource capacity, row ownership and circle membership. |
| 10. Calls/bounds | FINDING; scale follow-up | SW-01. Most private lists are bounded/paginated. Staff role assignments, circle membership lists and managed-room lists lack a complete pagination contract; no current load failure demonstrated, so held as scale follow-up rather than an outage claim. |
| 11. Failure/recovery states | FINDING | SW-04; existing unavailable states distinguish data failure from zero. |
| 12. Shipped versus tracked | CLEAR for checked references | 72 local script/stylesheet references inspected. Three filesystem misses are `/socket.io/socket.io.js` on index/lobby/open, supplied dynamically by configured Socket.IO. All remaining checked JS/CSS references exist and are tracked. No frontend compilation build is assumed. |

### Explicit dropped count

**19 contextualized candidate entries/families dropped**, not a claim that every raw regex match was individually reviewed:

- Four URI literal locations classified as commented example/isolated CI or tests; three non-example-email shapes in the integration fixture.
- Three dynamic Socket.IO script references; one conditional offline-font test skip.
- Three historical defect families now guarded: active-item reopen quota, bookmark lock order, reminder stale private-title delivery.
- Five additional families: production payment-simulator exposure, production dev-secret fallback, public internal static files, best-effort preference/media cleanup catches, durable retry-worker terminal catches.

The retained candidates are four source findings above. No critical/high exploit is asserted. SW-02 is forwarded to the main phase-7 privacy review; SW-01 to provider failure/recovery probes; SW-03 to deployment readiness; SW-04 to browser failure recovery.

## Read inventory and source identity

Fully read 23 files during this delegated sweep: `package.json`, `Dockerfile`, `.dockerignore`, `ecosystem.config.js`, `scripts/deploy/start.sh`, `.github/workflows/ci.yml`, `services/platform/{common,study-community,study-routes,database,maintenance,billing,digetpay-client}.js`, `services/socket-boundary.js`, `services/video/{revocations,realtimekit-provider}.js`, `services/ops/alerts.js`, `services/supabase/client.js`, `services/logging/logger.js`, `services/auth/recovery.js`, `nginx.conf`, `server.js`, `playwright.config.js`. Additional source/test files were context-read or scanned; those reads are not counted as full-file reviews.

Representative SHA-256 fingerprints before main-agent corrections:

| File | SHA-256 |
| --- | --- |
| services/supabase/client.js | 8d13885256caabcf7527ac12d7416c0aadb82c51acb698bc2089efced5a8529e |
| services/platform/study-planner.js | 185edcc66514811b52a8455431a7dd3af2b94fc4714fa54a532c74a0438de5ac |
| services/platform/study-community.js | c807d18037f5ac36c6f3249fddbd5008fdac54cd4e6d095e7e9614b9265adb50 |
| services/platform/study-routes.js | a190f4ac03f088c988513d8d8a119697888540b96f4fecf9c6f304a836d094ac |
| public/js/study-workspace.js | 5cf28d3775c2985a58c656c43ce03b812c3be554ff91f2c66ee618719de446ec |
| Dockerfile | bee943a41398f247bed32d6fa887bbc1ca2190a0d448fef4ae6551ee2a1ea83b |

No fixes made by this delegate. These are read-only sweep findings, not the final gate verdict or production acceptance.
