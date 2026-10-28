# Sequential resilience hardening

Scope authorized: media revocation, account recovery, database/outage tests, operational alerts, in that order.
Baseline: branch `viber/2026-10-20`, runtime `6319399`, documentation HEAD `ebc6ba7`.
Preserve unrelated modifications to both blog pages and `images/og/`.
All synthetic data, execution copies and generated evidence belong under dedicated evidence/temp directories.
No production writes, real mail/video calls, payment changes, push or deployment.

## 1. Media

Before: provider adapter can mint tokens and close meetings, but cannot kick/revoke individuals.
Disconnect only retires the in-memory registry. Concurrent and late mint responses can orphan tokens.
Commit `aac08ca`: persistent grants/issuance intents, retryable fair revocation queue, post-await
authorization checks, mint exclusion, signed-session ownership and capacity recheck.
39 relevant integration tests passed. Source-review follow-ups corrected early journal startup,
retry starvation and identity binding. Initial failures retained in evidence; final run is fully green.
Actual Cloudflare was not called. Previously issued pre-journal tokens still require operator reconciliation.

## 2. Recovery

Implemented local-only recovery mail, 30-minute hashed single-use purpose-bound tokens,
shared account mutation serialization, reset session invalidation, verification and bilingual UI.
Local outbox cannot operate in production and is excluded from Git. Supabase compatibility accounts
explicitly disable recovery until that storage schema supports the new fields.
23 related integration tests and the recovery browser journey passed. Browser first exposed hash-only
navigation not reopening the form; fixed with hash-change handling. Password reset/deletion race fixed.
Real email delivery remains a provider integration gate.

## 3. Database/outages

Commit `448e288`: database connection/lease cleanup, borrowed-client error handling and
failure-safe transactions. Real isolated PostgreSQL 16 tests cover timeouts, rollback, connection
termination, lease loss and backup/restore. The first run exposed an uncaught connection error;
the corrected run passed. A dedicated CI job now runs the same PostgreSQL scenario.
The local WSL test cluster was stopped; its diagnostic directory is retained.

## 4. Alerts

Persistent incident journal, optional restricted HTTPS webhook, bounded retry/cooldown and
staff incident UI. Payloads use an explicit privacy allowlist. Backup-directory errors now record
failed backups. Database ownership loss rejects requests/socket mutations and raises an incident.
Shutdown saves alerts after media/storage cleanup; startup failure requires independent monitoring.
Four focused alert tests pass, including restart delivery, privacy, failed backup storage,
late media cleanup and awaiting an in-flight backup during shutdown.

## Fix groups and provenance

| ID | Before | After | Commit |
|---|---|---|---|
| V3-10 | Provider grants could survive local departure or a late mint response | Durable revocation and issuance journal, retry fairness, socket/session binding and post-await checks | `aac08ca` |
| V3-11 | No password recovery/verification lifecycle | Local test delivery, expiring hashed single-use tokens, durable mutations, session revocation and accessible bilingual forms | `f409990` |
| V4-10 | PostgreSQL borrowed-client disconnect could crash the runtime; resilience checks used mocks | Observed connection failures, rollback/lease protection and real PostgreSQL 16 outage/restore CI | `448e288` |
| V7-10 | Operational failures stayed in logs; backup-directory errors escaped failure reporting | Persistent private incidents, retrying optional webhook, staff UI and late-shutdown incident flush | `b511b77`, `32947ab` |

Runtime candidate is `32947ab`, assembled with `git archive` and unchanged frozen dependencies.
`evidence/release-manifest-32947ab.json` records the full commit, archive/lockfile hashes and execution path.
The network workspace's unrelated dirty blog/image content was excluded from this candidate.
Documentation-only follow-up commits do not change the tested runtime.

## Validation receipt

| Gate | Result | Evidence |
|---|---|---|
| Syntax | Pass | `evidence/release-check.txt` |
| Types | Pass | `evidence/release-typecheck.txt` |
| Lint | Pass, 101 files | `evidence/release-lint.txt` |
| Dead code | Pass | `evidence/release-deadcode.txt` |
| Production dependency audit | Zero reported vulnerabilities | `evidence/final-audit-prod.txt` |
| Full integration suite | 110 passed; no failed, skipped or cancelled tests; 137.6 seconds | `evidence/release-integration.txt` |
| Real PostgreSQL 16 scenario, including HTTP/socket outage and alert persistence | Pass; dedicated cluster stopped | `evidence/release-postgres.txt` |
| Focused staff browser journey, Arabic mobile dark layout and accessibility | Pass | `evidence/alerts-browser.txt` and `evidence/alerts-browser/` |
| Full browser suite | 33 passed, 3.2 minutes | `evidence/release-browser.txt` and `evidence/release-browser/` |

This is a focused continuation of the original nine-phase viber review, using its existing surface
map and risk inventory. All four authorized hardening areas were traced and exercised against
running local instances. Independent read-only reviews covered media, recovery and alerts;
their confirmed race/lifecycle findings were corrected and tested. New full-file-read and
discarded-candidate counts were not recorded, so no exhaustive new repository sweep is claimed.
Visual review covered recovery in Arabic/light and English/dark, and the Arabic mobile staff panel.

Initial failing attempts remain in the evidence directory. They exposed signed-session fixture
assumptions, recovery fragment navigation, database connection errors and an outage middleware
parameter typo; final passing runs follow the fixes rather than combining partial runs.
The earlier `b511b77` candidate also passed 109 integration and 33 browser tests. Independent final
review then found an in-flight backup could outlive the alert flush. `32947ab` fixes that ordering,
adds a regression and passes fresh complete integration/browser runs plus the real PostgreSQL test.
The result counts above belong to individual complete runs of the final candidate.
The static/dependency gates and integration suite use Node 22.23.3. The dependency audit applies
to the unchanged lockfile across both final runtime commits. Browser execution uses
installed Chrome with external DNS restricted; provider/mail/webhook tests are synthetic/loopback.
No push, merge, deployment, live data change, real charge or external notification was performed.

## Production decision and handoff

**NO-GO for production release; local hardening is implemented.** Actual provider media termination
and replay rejection remain unproven, and production recovery delivery/monitoring are not configured.
The concrete configuration, recovery procedures and remaining release checks are in
[OPERATIONS.md](OPERATIONS.md).

Owner/service handoff:

1. Supply the recovery email provider and alert destination; verify real receipt and escalation.
2. Reconcile old provider sessions and verify real Cloudflare revocation on two devices.
3. Choose hosting/database, rehearse live-copy migration and restore, configure independent readiness monitoring and verify HTTPS/proxy behavior before deployment.
4. Select a payment provider before enabling charges; VIP remains exactly USD 4.99/month and local checkout remains test-only.

Week-one risks: failed video cleanup (watch pending grants); storage/ownership loss (watch readiness
and database incidents); failed recovery/notification delivery (watch delivery incidents, receiver
health and independent monitoring).

Manual acceptance before real users, at most five:

1. Two-device camera removal, token reuse rejection and reconnect after restart.
2. Real password-reset/verification delivery, expiry, single use and old-session rejection.
3. Hosted database outage followed by restart and verified live-copy restore.
4. Actual alert receipt, duplicate suppression and independent stopped-process detection.
5. HTTPS/domain, named staff/MFA access boundaries and disabled production test checkout.
