# Resilience operations

These changes are locally validated. They do not provision services or deploy the site.
Free membership and the single USD 4.99/month VIP test tier are unchanged.

## Media cleanup

Keep `<ROOM_STATE_FILE>.video-grants.json` on persistent private storage alongside room state.
It contains provider identifiers, not bearer tokens. Grants and ambiguous issuance attempts are
recorded before token delivery. Disconnect, departure, room deletion and shutdown queue cleanup.
Restart retries all saved grants before allowing new issuance. Failures remain queued and block
new video grants; retries run every 30 seconds in bounded fair batches.

An ambiguous provider response can close the entire meeting to prevent an orphaned participant.
This can interrupt other attendees. Before rollout, reconcile provider sessions/tokens issued by
older releases that predate this journal. Do not remove the journal to bypass a failing provider.
Verify kick, token reuse rejection, camera/audio termination and reconnect behavior against actual
Cloudflare staging accounts before declaring live media revocation proven.

## Recovery

For local testing only, set `AUTH_MAIL_MODE=local` and `AUTH_PUBLIC_ORIGIN` to the loopback server
origin including its port. Local messages are private JSON files under `<USER_STATE_FILE>.mail/`.
Open the URL from a synthetic account's message to exercise `/recover`. These files contain
short-lived bearer links; restrict access, exclude from source control and remove expired test
messages according to local retention policy. Tokens in account storage are hashed, purpose-bound,
single-use and expire after 30 minutes. Reset revokes existing sessions and does not bypass MFA.

No real messages are sent. Production disables this local adapter. The legacy Supabase profile
adapter also disables recovery because it does not yet persist the required fields. Before enabling
real recovery, implement and verify transactional delivery, canonical public origin, bounce/failure
handling and storage support. Never point `AUTH_MAIL_MODE=local` at a production mail destination.

## Database and restore

Use Node 22. One process owns the platform database; a second runtime is rejected.
Loss of the database ownership connection makes readiness fail and rejects API/socket mutations.
The process remains available for liveness checks. Restore ownership by restarting the affected
runtime after database connectivity is healthy. Transactions are not blindly replayed after an
uncertain commit outcome.

`scripts/test-postgres.ps1` creates a dedicated synthetic PostgreSQL 16 cluster in the selected WSL
distribution (default `Claude-SSH`), runs the real outage suite and stops only that cluster.
It requires existing PostgreSQL binaries and does not install packages or alter the system service.
Its printed `/tmp/halastudy-hardening-*` directory retains diagnostic logs.
CI runs the same tests against a PostgreSQL 16 service.

The suite checks lock/statement timeouts, rollback, borrowed-connection termination, exclusive
ownership loss, fresh-database restore and application rejection/alerting during an outage.
It does not replace a restore rehearsal of actual production data, hosted-provider failover,
network partitions or documented recovery-time/recovery-point targets.

## Operational alerts

Named authorized staff can inspect recent incidents under Operations. The persistent private file
is `<USER_STATE_FILE>.alerts.json`. Without a webhook, incidents are local only.
Configure `OPS_ALERT_WEBHOOK_URL` to an approved HTTPS endpoint and optionally
`OPS_ALERT_WEBHOOK_TOKEN` for bearer authentication. Redirects are refused. No destination was
configured or contacted during this work; tests used loopback receivers only.

Payloads contain incident ID, fixed event/severity/action, count and first/last-seen times.
They exclude raw logs, user identifiers, addresses and provider responses. Delivery is at least
once: deduplicate by incident ID. Failed delivery retries after 30 seconds with exponential
backoff capped at 15 minutes, surviving restart. Repeated incidents have a 15-minute notification
cooldown. Warning thresholds use five-minute windows (20 rejected sign-ins, or three repeated
database/socket/attendance/provider failures). Critical storage, revocation, ownership and backup
failures alert immediately. A successful backup resolves recorded failed/overdue backup incidents.
Other entries remain recent incident history, not a claim that a fault is still active.

Alert flushes run every five seconds, including without external delivery. Shutdown flushes alerts
after other components finish cleanup. Journal failure is surfaced in staff status and structured
console logs; protect and monitor the storage volume independently.

An external process/uptime monitor must probe `/api/ready` and inspect structured startup logs.
`/api/health` is liveness, not readiness. Failed startup, stopped processes, alert-journal failure
and network loss cannot reliably notify through the same application. Alert journals wait for
exclusive platform ownership, so a rejected second runtime cannot overwrite the active journal.
Set an on-call destination and test receipt/escalation before launch.

## Release gates

- Review real Cloudflare cleanup and pre-journal sessions.
- Integrate real recovery mail and its production storage support.
- Configure and verify an actual alert receiver plus independent readiness monitoring.
- Rehearse production-data backup/restore and hosted database outage handling.
- Review HTTPS/proxy configuration, live-data parity and normal deployment acceptance.
- Choose a payment provider before enabling real VIP charges; local checkout remains test-only.
