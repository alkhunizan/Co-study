# Recovery delivery follow-up review

Prepared 2026-10-23. Read-only review of the new Resend recovery implementation while the parent implementation was changing. No probes, tests, real provider calls, app edits, or commits were performed by this reviewer. This report is source evidence, not provider or production acceptance.

The tracked base was `c4d6c50553f55704b4d4a788db28b05fa983047a`; recovery files were uncommitted. Findings refer to the specifically described snapshot below, so later parent fixes require a fresh disposition.

## Exact read coverage

| File | Completed source reads | Coverage |
| --- | --- | --- |
| `services/auth/recovery-delivery.js` | Initial 1-90; revised 1-116 | Both snapshots fully read. Revised version adds durable request intents, explicit deadlines and readiness. |
| `services/auth/recovery-queue.js` | Initial 1-65; revised 1-93 | Both snapshots fully read. Revised version consumes durable request intents before account delivery. |
| `services/auth/recovery.js` | Initial 1-121; revised 1-129 | Both snapshots fully read. Revised durable path awaits acceptance before 202. |
| `user-store.js` | Current 1-210, including changed recovery sanitizer at 199-205 | Scoped current read; the earlier server review read the previous full 1-364 file. Current file length was 366; do not promote the un-reread remainder. |
| `services/platform/maintenance.js` | Initial changed 1-59; revised 1-60 | Both snapshots fully read, including dropping restored recovery records and request intents. |
| `services/auth/auth-routes.js` | Current 45-80 | Scoped dependency: account mutation queue, durable flush, rollback and success callback ordering. |
| `co-study-server.js` | Current 1691-1706; 1768-1778 | Scoped dependency: queue shutdown before account/database close; platform/readiness passed to recovery factory; Supabase mode remains disabled. |
| `services/ops/alerts.js` | Current 1-95 | Scoped dependency: existing monitored recovery event and rule dispatch. |

These are bounded content reads. Searches were used only to locate enforcers and are not counted as full reads.

## Findings and minimal fixes

### RCR-01 — Acknowledgement durability: source-fixed during review

**Initial issue:** `recovery.js:67-80` originally returned 202 before `setImmediate()` created/persisted the account token and delivery job. A process exit or failed account flush could lose an acknowledged request silently.

**Current disposition:** resolved in source, pending the parent's fake-transport/persistence tests. Revised `recovery.js:67-72` awaits `mail.accept()` before 202. `recovery-delivery.js:37-51` commits an encrypted `recovery_request` outbox intent for known and unknown accounts before resolving. A failed admission returns the same generic 503. This closes the acknowledgement gap without using account existence to select a visibly different success response.

The subsequent intent-to-account transition is in separate commits, but replay has a concrete enforcer: `recovery-queue.js:26-37` stores the same intent ID/token and only deletes the intent after the account mutation success callback. Replaying an already-applied token does not create a new delivery job. A provider call occurs only after that account job and its attempt reservation have been durably saved.

**Required local evidence:** inject request-intent persistence failure and observe generic 503 with zero provider calls; restart immediately after an acknowledged known/unknown request and account for its durable intent; interrupt between account-job commit and intent deletion and verify replay retains the same provider idempotency key/body.

### RCR-02 — Complete transport deadline: source-fixed during review

**Initial issue:** aborting only the supplied fetch signal did not independently bound a fake/non-cooperating transport's header, body read or body-cancellation promise. The worker and queue shutdown could remain pending indefinitely.

**Current disposition:** resolved in source, pending fake-transport tests. Revised `recovery-delivery.js:84-111` races both `fetchImpl()` and every `reader.read()` against one rejecting deadline, keeps the existing 16 KiB response limit, does not await untrusted cancellation, and aborts/clears the timer in `finally`.

**Required local evidence:** independently stall headers, body reads and cancellation; use a short injected timeout and require bounded settlement of delivery and queue close. Oversized body, invalid JSON, missing/invalid receipt ID, 429, 5xx and permanent 4xx must remain sanitized and retain the intended retry classification. Never satisfy these tests with a live Resend request.

### RCR-03 — Combined pending-work cap uses a stale backlog snapshot

**Disposition:** open source concurrency candidate; P2; controlled local test required.

**Source:** revised `recovery.js:70`, `81-88`; `recovery-delivery.js:37-50`; `recovery-queue.js:14-37`.

`queue.size()` is passed as a number before an acceptance waits behind the global `accepting` promise. While that wait occurs, the worker can move existing outbox intents into per-account delivery jobs. The later SQL admission checks current outbox count plus the old account-job count, so the intended combined 100-item limit can be exceeded. The separate daily provider-attempt budget still limits external spend; this finding concerns bounded pending work and backpressure.

**Minimal fix:** pass a backlog getter, and evaluate it inside the serialized admission transaction after reading the current outbox count. Keep the SQL outbox count and the route's inexpensive early rejection. In the current single-process architecture, account job creation precedes intent deletion, so a late in-transaction getter can conservatively count transition overlap. Do not add a second independently writable queue or a schema migration just to fix the stale number.

**Local test:** defer an acceptance after its caller has captured the old backlog; move one or more earlier intents into account delivery slots; then resume admission with outbox count near the cap. Assert current outbox intents plus current delivery slots stay bounded. Include 100 concurrent admissions and a worker transition during admission, using fake transport only.

### RCR-04 — Decryption and worker failures can bypass recovery monitoring

**Disposition:** source-confirmed monitoring gap; P2.

**Source:** revised `recovery-queue.js:18`, `48`, `83`; `services/ops/alerts.js:6-21`, `90-95`.

An undecryptable persisted intent or account job is discarded without a log event. A different encryption key after restart can therefore cause already-accepted work to disappear silently. Unexpected worker failures emit `account_recovery_queue_failed`, but the existing operational rule only recognizes `account_recovery_delivery_failed`. Per-delivery HTTP failures are monitored; these earlier pipeline failures are not.

**Minimal fix:** emit the existing sanitized `account_recovery_delivery_failed` event when rejecting undecryptable intent/job data, and either use that monitored event for unexpected worker failures or add a specific queue-failure rule. Preserve fail-closed removal and keep email, token, job payload, key, URL and raw provider error text out of logs.

**Local test:** restart a fixture with a different fake encryption key; confirm no provider call or usable recovery link, accepted work is explicitly disposed, and a sanitized monitored event is emitted. Inject `nextRequest`, budget and account-save failures and verify the monitoring event and retained/retryable work state.

### RCR-05 — Test mode can select the real Resend transport by default

**Disposition:** source-confirmed missing test-safety guard; P1 for this run's explicit no-real-call test constraint.

**Source:** revised `recovery-delivery.js:12`, `16-19`, `88-90`; `recovery.js:11-12`.

Resend can be enabled under `NODE_ENV=test`, and the default transport is global `fetch` to `https://api.resend.com/emails`. A fixture that omits injection can contact the real provider; if owner credentials are later present, that can also send a real email. Direct tests may inject a fake correctly, but the module has no enforcer protecting the omitted-injection path.

**Minimal fix:** when Resend is otherwise enabled in test mode, require an explicitly supplied fake transport and reject/disable the default network path. Thread an optional `fetchImpl` through the recovery factory if integration fixtures need it. Keep ordinary production configuration unchanged.

**Local test:** construct test-mode Resend configuration with syntactically valid fixture secrets but no transport; it must fail closed without invoking global fetch. Explicit fake transport must remain usable. The test itself must not call the actual endpoint, even with an invalid API key.

## Reviewed controls with no new defect found

| Area | Source enforcer and limitation |
| --- | --- |
| Server-only provider access | Fixed HTTPS Resend endpoint; server-held API key; redirects rejected; no key or token copied to a browser or provider error log (`recovery-delivery.js:88-111`). Actual sender/domain/provider acceptance remains external. |
| Encryption and payload bound | AES-256-GCM uses a random nonce and authenticates the job ID as AAD; the account delivery sanitizer limits encoded payload size to 8,192 characters and attempts to 0-5 (`recovery-delivery.js:3-8`, `21-32`; `user-store.js:199-205`). Standard generated email/token fields are bounded elsewhere. |
| Token invalidation | Queue checks current object identity, ban, expiry, epoch, email, purpose and token digest before attempt; it rechecks after the durable attempt reservation (`recovery-queue.js:9-12`, `49-67`). Deletion/new token/epoch change prevents a pending job from gaining authority. An already in-flight email can arrive with an invalid link; that does not revive the token. |
| Provider idempotency | The stable delivery job ID becomes `Idempotency-Key: recovery/<id>`. The encrypted stored message preserves the exact body across attempts/restarts. Attempts/next-run metadata do not alter the message (`recovery-delivery.js:58-69`, `88-90`). This is source behavior; the provider's documented contract was not independently browsed in this review. |
| Attempt before side effect | The worker durably increments attempts and next-run time before delivery, then deletes only the matching completed/permanently rejected job (`recovery-queue.js:58-77`). A crash in the last reserved-attempt window can consume that attempt without a network call; this is a bounded-attempt policy, not a guarantee of five external calls. |
| Daily spend/attempt cap | A SQL conditional update of one per-day `store_metadata` key is transactional and survives ordinary restart. Every external attempt must reserve it (`recovery-delivery.js:71-79`, `recovery-queue.js:58`). The configured day is UTC. Restoring an older same-day database snapshot can rewind this counter; retain an owner-approved provider limit/release procedure for disaster recovery rather than claiming the database counter spans rollback. |
| Persistence failure | The shared account mutation helper only invokes its success callback after flush and current identity/epoch checks, and compensates failed writes (`auth-routes.js:51-79`). Therefore a failed attempt reservation does not proceed to the provider, and a failed post-send cleanup can retry the same idempotency key. |
| Startup ordering | `mail.isReady()` prevents intent consumption against an unhydrated users map; the server supplies the user-store readiness flag (`recovery-queue.js:41-43`, `co-study-server.js:1770-1773`). |
| Shutdown | One active drain runs at a time. Queue close stops the timer and awaits active work; server shutdown invokes it before final account flush/database close (`recovery-queue.js:81-89`, `co-study-server.js:1692-1704`). The complete transport deadline is necessary for this wait to stay bounded. |
| Restore | Restore increments account token epochs, clears all recovery records and skips `recovery_request` outbox intents (`maintenance.js:43-48`), preventing a backup from mailing old recovery links or reviving old token authority. Snapshot table coverage already includes outbox and store metadata. |
| Supabase compatibility | Server construction still forces mail disabled for that alternate account backend (`co-study-server.js:1770-1773`). Do not claim the new SQL account-job durability applies to that disabled mode. |
| Email copy encoding | A UTF-8 read of the revised delivery file showed actual Arabic text, not corrupted source. The earlier Windows default-encoding display was not treated as an application defect. |

## Handoff

Resolve and probe RCR-03/RCR-04/RCR-05, then attach the parent's fake-transport tests to RCR-01/RCR-02. No current source observation substitutes for controlled real sender verification, delivery to an owner-controlled mailbox, external failure monitoring acceptance, or a release decision. No real provider action was attempted here.
