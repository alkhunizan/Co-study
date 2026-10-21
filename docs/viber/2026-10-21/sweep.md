# Phase 5 sweep — 2026-10-21

Read-only delegated review of the current dirty working tree. No application edits, commits, execution tests, production calls, or external requests were made by this sweep agent. Findings below are source-confirmed candidates for the parent fix/probe phases, not claims of browser reproduction. Locations refer to the pre-fix tree and can move during remediation.

## Scope and evidence limits

- Read the phase-5 reference completely.
- Baseline: `evidence/baseline-status.txt`. Imported UX/payment work is already modified/untracked; this sweep does not attribute it to this gate.
- Regex scan: 262 text files selected from tracked plus nonignored untracked paths, excluding package lock, evidence directories, and old implementation baseline snapshots. The scan includes source, docs, tests, and browser source. It is not a Git-history secret scan, ignored-runtime scan, or full dependency audit.
- Fully read 25 repository files: `package.json`, `.gitignore`, `.dockerignore`, `Dockerfile`, `scripts/deploy/start.sh`, `services/platform/{digetpay-client,digetpay-billing,routes,dashboard,billing,index,catalog,database,maintenance,cohorts}.js`, `db/migrations/002-digetpay.sql`, `.github/workflows/ci.yml`, `public/js/{ux-insights,legal-shell,schedule-display,focus-client}.js`, `public/js/video/{video-client,realtimekit-client}.js`, `services/seo/public-pages.js`, and `services/video/video-session-registry.js`.
- Read targeted contexts, not complete files, in `index.html`, `lobby.html`, `co-study-server.js`, `public/js/platform.js`, `public/js/halastudy-core.js`, `services/auth/auth-routes.js`, and UX browser tests. Do not count these as full reads.
- No tests were run by this agent. Parent test/probe evidence determines whether fixes satisfy the gate.

## Findings and candidates

| ID | file:line | pattern | reachable? | why it bites | fix | S/M/L |
|---|---|---|---|---|---|---|
| SW-01 (P1 release) | `services/platform/index.js:7`, `services/platform/routes.js:6`, `services/platform/database.js:98` | Shipped versus tracked | Git-only release | Three required modules and migration 002 are untracked at baseline; a commit/archive containing tracked edits alone cannot boot. Browser assets are also untracked. Docker COPY can accidentally mask the difference when building the dirty checkout. | Include exact imported files in a provenance-preserving checkpoint, then validate the clean Git artifact. | S |
| SW-02 (P1 privacy) | `index.html:2300`, `index.html:4233` | Permissive fallback; sibling drift | Mesh camera start and blur toggle | Both catches select rawStream after the requested blur pipeline fails; blurEnabled remains true and outgoing tracks are attached/replaced. The unsupported-filter branch also chooses raw with the default blur preference on while hiding its control (`:2321`). | Fail closed when requested privacy processing fails; stop outgoing camera and explain recovery. For unsupported processing, disclose inability and require an explicit unblurred choice. Cover both startup and toggle paths. | M |
| SW-03 (P2 reliability) | `lobby.html:378`, `lobby.html:394`; `services/video/video-session-registry.js:1,94`; `co-study-server.js:1667` | Missing sibling lifecycle | Lobby RealtimeKit join | Lobby bypasses the shared video client and contains no video heartbeat or video-leave/pagehide lifecycle. Registry expires activity after 150 seconds; 60-second sweep ends it. Healthy lobby media can therefore expire approximately 150–210 seconds after mint. Role switches/reconnects also need ordered teardown. | Reuse a shared heartbeat/leave lifecycle for headless joins and serialize replacements. Probe beyond the expiry horizon. | M |
| SW-04 (P2 privacy/logging) | `index.html:1550`, `index.html:1650`, `index.html:4317`, `index.html:4594` | Debug output | Every mesh room page | DEBUG is unconditionally true. Full runtime ICE configuration and raw ICE candidates are printed to the browser console, unnecessarily including credential/network metadata in console exports. No secret values were reproduced in this report. | Default diagnostics off, and redact sensitive fields even for explicitly enabled diagnostics. | S |
| SW-05 (P2 resource cleanup) | `public/js/video/realtimekit-client.js:161`; `lobby.html:394,407` | Missing error cleanup in twin | Headless lobby join failure | join() cleans a partially initialized meeting on rejected join; joinHeadless() does not. Caller receives no meeting handle until success and nulls its state on failure, so cannot clean partial initialization. | Mirror guarded cleanup from join() in headless join, preserving the original error. | S |
| SW-06 (P2 recovery) | `public/js/video/video-client.js:10,38,48`; `lobby.html:378` | No deadline; swallowed heartbeat error | Video join/leave/heartbeat | Core requestJson uses a 15-second AbortController, but video POST helper and lobby token fetch have no deadline. Heartbeat errors are silently ignored and interval callbacks can overlap stalled requests. Camera CTA/join/cleanup can remain pending on a hung connection. | Apply bounded requests and at-most-one heartbeat in flight; surface or act on terminal membership/auth failures. | M |
| SW-07 (P3 capacity) | `services/platform/routes.js:201`; `services/platform/cohorts.js:17`; `services/platform/routes.js:154` | Unbounded list query | Authenticated staff/member | Staff assignments, joined circles, and managed rooms have no query limit/pagination, unlike audit/cases/subscriptions (100) and scheduled sessions (100). Owner/member caps bound one circle, not the number of circles a user may join. No load failure reproduced. | Add explicit bounded/cursor list contracts if these collections can grow materially; preserve discoverability of older records. | M |

SW-01 through SW-06 were sent directly to the parent during review. SW-07 is a scale follow-up, not a demonstrated current outage.

## Exact imported paths required for artifact parity

Runtime and migration:

```
db/migrations/002-digetpay.sql
public/css/room-shell.css
public/js/legal-shell.js
public/js/schedule-display.js
public/js/ux-insights.js
services/platform/dashboard.js
services/platform/digetpay-billing.js
services/platform/digetpay-client.js
```

Corresponding imported checks/fixtures to retain with the candidate:

```
tests/helpers/digetpay-fixture.js
tests/integration/digetpay.integration.test.js
tests/integration/ux-dashboard.integration.test.js
tests/integration/ux-insights.integration.test.js
tests/smoke/digetpay.smoke.spec.js
tests/smoke/ux-journeys.smoke.spec.js
tests/smoke/ux-return.smoke.spec.js
```

Evidence for references: `index.html:598-601`, `landing.html:31`, `open.html:27-28`, `platform.html:13-14`, `services/seo/public-pages.js:88`, `scripts/check-platform.js:10-12`. Documentation directories are not runtime imports and should not be swept into an application checkpoint indiscriminately. `.dockerignore` excludes secrets, data, tests, and docs, while `.gitignore` protects evidence. Docker COPY . is not proof that Git-only release parity exists.

## Sibling matrix

| Contract / twin | Guard present | Result |
|---|---|---|
| Local simulator / DigetPay checkout price | Both fix amount=499, currency=USD server side; migration also constrains provider order | CLEAR; one paid tier preserved |
| Local simulator / DigetPay production gate | Simulator requires test mode; DigetPay enabled only outside production plus explicit sandbox/currency/status configuration | CLEAR; production paid checkout remains unavailable by design |
| Browser return / unsigned provider notification | Return and notification cannot directly grant; status query verifies server/provider evidence | CLEAR in inspected code |
| Checkout create / reconciliation | User transaction lock; unique open-order and transaction constraints; ambiguous creates marked unknown without automatic POST retry | CLEAR in inspected code |
| Payment provider HTTP / core browser HTTP / video HTTP / lobby token HTTP | Provider 8-second timeout + 64KiB body cap; core 15-second timeout; latter two absent | SW-06 |
| Main room / headless lobby media lifecycle | Main shared video client heartbeats; lobby direct join does not | SW-03 |
| RealtimeKit join / joinHeadless | Main join releases partial meeting on failure; headless does not | SW-05 |
| Camera startup / blur toggle / unsupported canvas | Both failure catches publish raw; unsupported hides control and uses raw | SW-02; fix all siblings |
| Dashboard recent room / next session / actual room access | Both suggestions await canJoin; dashboard route behind requireUser; actual entry still applies normal checks | CLEAR; no client-only access grant |
| Circle create / invite / accept / schedule / supervisor assignment | Server entitlements, membership and locks checked; removal/archive disconnect active sockets in routes | CLEAR in inspected code |
| Staff read / mutation routes | staff() performs session-bound MFA plus permission; mutations behind authenticated shared limiter; public webhook separately rate-limited | CLEAR in inspected code |
| Staff audit/cases/subscriptions / staff roles / circle list / room list | First three LIMIT100; latter three no bounded contract | SW-07 |
| Backup table inventory / migration 002 / restore format | digetpay_orders included; v2 snapshot; v1 explicit compatibility without provider orders | CLEAR |
| Voluntary usage counters / transport | Opt-in, finite expiry and schema-count allowlist; no network API in entire module | CLEAR |
| Public legal Arabic / English routes | Both emitted by same renderer, same legal-shell import, canonical/alternate pairing | CLEAR; retain untracked legal-shell |

Spread/key-overwrite review: all spread occurrences in platform/auth/admin modules were inspected as query/authorization candidates. No spread-then-OR object erasing a visibility guard was found. Provider `transaction_id` fallback and presentation overrides are intentional and were read in context. This is a bounded source search, not a whole-language AST proof.

## Pattern checklist

| Phase pattern | Status | Evidence / limitation |
|---|---|---|
| 1. Secret-shaped literals | CLEAR for scanned files | One candidate: `.github/workflows/ci.yml:34`, an explicit disposable local CI database credential. Reviewed service definition and dropped; no secret values printed. Ignored runtime configuration, history, dependencies and old evidence excluded. |
| 2. Machine-specific values | UNVERIFIED whole set | 196 matched lines. Reviewed provider loopback rule, CI service, Docker loopback healthcheck and fixed documented deployment defaults as intentional; not all 196 contexts classified. Public support contacts in SEO are intentional user-requested business contacts; no private contacts copied here. |
| 3. Debug/temp paths | FINDING | SW-04. Inspected server static mounts expose explicit public directories rather than repo root. Docker excludes docs and secrets. No debug API claim made from regex absence alone. |
| 4. Swallowed errors | FINDING | 69 empty-catch matched lines. Reviewed meaningful video/lobby branches; SW-05/06. Storage preference catches, best-effort cleanup preserving original exceptions and optional counters are intentional examples. Remaining occurrences not all deeply reviewed. |
| 5. Async races/loading | FINDING | SW-03/05/06. Platform mutation work() disables initiating controls and restores them in finally; checkout failures reread latest intent; unknown payment creates do not retry charge. |
| 6. Sibling drift | FINDING | Matrix above. Camera fallback appears in two twins, shared video lifecycle missing in lobby. |
| 7. TODO/placeholders/skips | CLEAR bounded scan | 92 matching lines: 75 are task-list feature naming/use in index/core/browser tests; 16 documentation/backlog mentions; one deliberate external-font diagnostic skip when offline. No skipped critical flow found in inspected matches. |
| 8. Mock/demo/permissive fallback | FINDING | SW-02. Local payment simulation is explicit and production-disabled, not fake live payment. Real external sandbox contract remains a separate gate. |
| 9. Client-only enforcement | CLEAR inspected paths | Server-fixed price, entitlements, membership, MFA/permissions, DB constraints and scoped order ownership inspected. No whole-app security proof implied. |
| 10. External/DB failure and lists | FINDING | Provider bounded/time-limited, DB request handlers return errors, transactions rollback. SW-07 unbounded collections and SW-06 browser HTTP. |
| 11. User boundary recovery | FINDING | Core requests and platform work() provide bounded/errors. Media twins need consistent failure handling. |
| 12. Shipped vs tracked | FINDING | SW-01 exact imports above. Git artifact must be checked after checkpoint/fixes. |

## False-positive and coverage accounting

- Secret scan: 1 matched line, 1 reviewed and dropped as disposable local CI credential; 0 confirmed hardcoded deployment credentials in this bounded scan.
- TODO/placeholder scan: 92 lines; 75 task-list implementation/test references + 16 docs/backlog references dropped as product-placeholder false positives. The remaining 1 is an intentional offline-only external-font diagnostic skip, retained as a validation limitation rather than called a defect.
- Minimum explicitly categorized drops: 92 (1 credential-shaped CI example + 91 placeholder/doc matches). Machine and catch matches are **not** bulk-counted as false positives; their complete context sets were not fully reviewed.
- Empty-catch 69 and machine-value 196 counts describe scan hits, not defects or full-read coverage.
- Full-file reads: 25 repository files, as named above. Source search over 262 files does not mean 262 full reads.

## Security handoff / remediation ownership

- Phase 7 should assess SW-02 privacy fallback and SW-04 diagnostic exposure; no actual credential values were retained here.
- Phase 7 should independently confirm public webhook cannot activate entitlements, authenticated order ownership, origin/CSRF protection, and provider adapter restrictions. This sweep read those boundaries but did not send hostile requests.
- Parent owns fixes and all runtime tests. This agent made zero application fixes, so the sibling matrix must be revisited for every parent-changed file. Test both blur twins, both RealtimeKit join modes, and shared lifecycle use from both room and lobby.
- After any fix, archive from Git and prove required new imports/migration/browser files exist before calling the release candidate green.
