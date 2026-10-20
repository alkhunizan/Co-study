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
Three focused alert tests pass, including restart delivery, privacy, failed backup storage and
late media cleanup. Full candidate validation follows below.
