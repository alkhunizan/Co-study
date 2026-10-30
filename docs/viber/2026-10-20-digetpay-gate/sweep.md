# Phase 5 — source sweep

Scope: read-only review of the current working tree, with emphasis on DigetPay and its platform, persistence, browser, authorization, worker, monitoring, and release siblings. No source edits, tests, provider calls, or network requests were performed by this phase. Findings below distinguish static evidence from runtime proof; the main gate owns reproduction and final severity.

## Findings and candidates

| ID | file:line | pattern | reachable? | why it bites | fix | S/M/L |
|---|---|---|---|---|---|---|
| SW-01 | `services/platform/digetpay-billing.js:143-149`; `services/platform/routes.js:31-36`; `co-study-server.js:802` | 10 — durable queue growth | Configured sandbox, transaction lookup, known order UUID. Production blocked by `digetpay-client.js:17`. Static code path verified; runtime reproduction requested. | Each distinct untrusted transaction UUID creates a distinct durable outbox row. Per-IP 120/minute throttling and worker batches of 10 bound a burst and work batch, but do not bound total rows per order or retention. Sender can use their own order UUID; no cross-user disclosure is required. Provider validation prevents a false VIP grant but occurs after persistence and external verification work. | Bound outstanding hints per order; preserve valid retry handling; expire or prune processed work; add local fixture proof. | M |
| SW-02 | `services/platform/digetpay-billing.js:105-108`; `db/migrations/002-digetpay.sql:18-19` | 5/6 — recovery state conflicts with uniqueness guard | Configured sandbox only. Three-order late-payment timeline; runtime proof still required. | If orders A and B expire, C is pending, late A activates a subscription, then late B is approved, B must become `review`. C already occupies the unique open-order slot, so B's update conflicts and rolls back. The normal two-order timeline does not necessarily trigger this; the three-order preconditions matter. | Separate payment review state from the one-attempt-in-progress invariant, preserving checkout blocking while review exists. Reproduce before retaining as confirmed behavior. | M |
| SW-03 | `services/platform/digetpay-billing.js:63-66,105-108,163-165,187`; `services/ops/alerts.js:6-20,87-88`; `services/platform/routes.js:237-240` | 6/11 — payment recovery and monitoring siblings | Configured sandbox only. Static omission verified. | Unknown creates and overlaps need review; repeated notification failures become failed rows. These states do not emit an operational alert. The one worker-level event is absent from the alert allowlist, whose observer returns immediately for unknown events. Staff billing exposes subscriptions, not unresolved orders. Logs/DB inspection remain possible, so this is an operational gap rather than undetectable data loss. | Add a bounded unresolved-payment review surface and safe alert event with identifiers only before any real merchant pilot. | M |
| SW-04 | `services/platform/index.js:7-8`; `services/platform/database.js:98-104`; `scripts/check-platform.js:10-11` | 12 — candidate versus committed artifact | Current working tree only. `git ls-files` returned no entries for both DigetPay modules, migration 002, or three new fixture/test files. | New imports, required migration, and checker references depend on initially untracked files. HEAD contains the earlier implementation, so this is **not evidence that HEAD itself fails to boot**. A release must include the complete integration atomically and rerun artifact validation; the present working tree is not the current committed release. | Include the complete reviewed integration in a coherent commit; validate that exact artifact before publishing. Preserve unrelated dirty work. | S |

No live financial exploit is claimed: both DigetPay and the simulator reject checkout in production (`services/platform/index.js:16`, `services/platform/billing.js:16`, `services/platform/digetpay-client.js:17-20`). SW-01 and SW-02 are candidates for the main agent's controlled runtime probes, not completed reproductions.

## Twelve-pattern checklist

| # | Pattern | Result | Evidence and limits |
|---|---|---|---|
| 1 | Secret-shaped literals | CLEAR within scan | Tracked JS/MJS/JSON/HTML/CSS/Markdown/YAML/TOML/SQL/PowerShell/text and `.env.example` scanned for common API-key, JWT, and credential-bearing DB-URL shapes. One hit: explicitly synthetic loopback Postgres CI fixture. New untracked DigetPay source/tests also scanned with no key/JWT hits. Actual `.env` was not opened; this is not exhaustive secret detection. No secret values printed. |
| 2 | Machine-specific values | CLEAR for inspected runtime | Loopback health check and test/recovery restrictions are intentional. Host/config values are environment-controlled. Public support phone is an intentional contact link with matching SEO/page sibling, not an inferred secret. Documentary historical local paths are not runtime dependencies. |
| 3 | Debug/test production code | CLEAR for inspected paths | Console messages are startup/shutdown diagnostics or reviewed historical probe scripts. Public files use explicit routes/static directories; repository-root probe scripts are not served by a catch-all static mount. |
| 4 | Swallowed errors | FINDING / bounded | SW-03 monitoring omission. Other reviewed catches either fail closed, sanitize provider errors, handle cleanup, tolerate browser storage, or preserve retry journals. The platform shutdown catch also suppresses cleanup exceptions; flag for shutdown phase rather than claim demonstrated lost data. |
| 5 | Async/races | UNVERIFIED candidate | SW-02. Payment creation intent persists before external POST; ambiguous outcomes are not retried. Per-order in-flight coalescing, user row locks, unique provider IDs, stopped worker flag, and worker shutdown waits are present. |
| 6 | Sibling drift | FINDING | SW-03. Guard matrix below. Reviewed object spreads do not overwrite a SQL/ORM visibility filter; payment transaction-ID replacement is deliberate and subsequently verified. |
| 7 | TODO/skipped placeholders | CLEAR within scan | No production TODO/FIXME/HACK/lorem/coming-soon or skipped test hit retained from targeted source/test scan. |
| 8 | Production mocks/fallbacks | CLEAR | Simulator requires mode `test`; production forces `live`; DigetPay additionally rejects production. UI simulator branches use the server-selected provider and cannot bypass server enforcement. |
| 9 | Client-only enforcement | CLEAR for reviewed platform paths | Price/currency fixed server-side and constrained in migration; ownership checked for verification/latest; cohorts check membership, role, capacity and entitlement transactionally; staff checks permission plus MFA. |
| 10 | Failure handling/unbounded work | FINDING | SW-01. Provider calls have timeout and 64KB response limit; requests surface safe errors; list limits exist for progress, sessions, audit, subscriptions, cases, and staff-user results. Some privileged/in-memory dataset queries load whole account/role collections by design; scale risk noted without asserting current failure. |
| 11 | Missing recovery states | FINDING | SW-03. Browser checkout has loading/error/pending/unknown/review/expired/refunded states and retry verification; ambiguous states require manual investigation but no operator workflow exists yet. |
| 12 | Shipped versus tracked | FINDING | SW-04. Docker excludes `.env*` except example, runtime data, test output, tests and docs. No build pipeline in this vanilla JS app; validate source release parity rather than a nonexistent generated bundle. |

## Sibling guard matrix

| Siblings | Guard | Left | Right | Result |
|---|---|---|---|---|
| Simulator / DigetPay | Production charges blocked | Mode must be test | Explicit production rejection | Present in both |
| Billing service / provider client | Saudi phone validation | Same accepted-number regex | Same regex and normalization | Present in both |
| Provider client / browser redirect | HTTPS origin and checkout path | Allowlist, credentials/hash/session-ID checks | Same origin/path allowlist; trusts server-persisted session binding | No demonstrated guard gap |
| Latest / verify order | User ownership | `WHERE user_id=$1` | `WHERE id=$1 AND user_id=$2` | Present in both |
| Session / transaction verification | Provider binding | Stored session; supplied order/currency checked | Requires returned order/currency and canonical transaction match | Deliberate contract-dependent distinction; real provider contract remains unverified |
| Return URL / unsigned notification | Never grant from browser/body outcome | Calls server verifier | Queues identifiers, calls provider verifier | Present in both |
| Concurrent create / duplicate approval | Idempotency | User lock + one open order + persisted intent | User lock + transaction uniqueness + completed check | Present; SW-02 concerns late-review state |
| Session / transaction notification queue | Coalescing | One key per order | One key per supplied transaction UUID | SW-01 |
| Migration / backup / restore | New payment persistence | Migration 002 required | v2 includes orders; v1 compatibility explicit | Present |
| Video failure / payment failure operations | Staff alerts and durable status | Journal state and alert rules | Outbox exists; payment alert rule and review view absent | SW-03 |
| English / Arabic checkout | Sandbox/no-auto-renewal states | Provider-specific text | Corresponding provider-specific text | Present by source inspection; visual review separate |
| Working tree / Git release | Integration files included | Present on disk | Six integration files untracked at scan time | SW-04 |

## Dropped candidates and limits

Twelve candidate groups dropped or downgraded after context review:

1. Synthetic CI database credentials: isolated loopback test container, not a production secret.
2. Public support phone: intentional published contact information and matching page sibling.
3. Loopback strings: health checks, fixtures, and explicit nonproduction restrictions.
4. Root-level historical browser probe scripts: no public repository-root static mount.
5. LocalStorage catches: optional preference persistence, not security enforcement.
6. Reader cancellation catch: cleanup after bounded provider-body processing.
7. Private-room membership catch: denies access instead of granting it.
8. Revocation worker catch: durable retry state plus safe error/health handling upstream.
9. Simulator strings: production checkout rejection enforced server-side.
10. Unsigned webhook: cannot itself grant access; actual concern narrowed to queue growth.
11. Repeated completed-order polling: required for refund discovery; retained as scale/retention design question, not a demonstrated false grant.
12. Untracked files: candidate release discrepancy, not proof of a broken committed HEAD.

Security candidates passed to phase 7: SW-01 resource amplification; SW-02 integrity/recovery conflict (requires runtime proof); SW-03 payment incident visibility. No source fixes performed by this read-only phase.
