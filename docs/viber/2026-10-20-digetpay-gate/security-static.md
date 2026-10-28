# Static security follow-up and independent fix review

Read-only follow-up to `sweep.md`. No network requests, provider calls, source changes, or independent test executions were made. This report reviews the main agent's saved before/after evidence; live and runtime claims belong to the main run.

## Phase 8 independent review

**Accept the monitoring fix within its stated scope.**

- Full diff reviewed for `services/ops/alerts.js` and `tests/integration/operational-alerts.integration.test.js`: exactly 1 and 17 added lines respectively, zero removals.
- Both paths are absent from the initial dirty-file inventory in `RUN.md:13`; therefore neither overwrites initially dirty work.
- The implementation adds only the `payment_reconciliation_failed` event to the existing operational-alert rule table at `services/ops/alerts.js:20`. There is no change to billing, prices, provider requests, credentials, or payment reconciliation decisions.
- The regression at `tests/integration/operational-alerts.integration.test.js:12` passes the existing structured logger event into the alert observer, flushes the journal, asserts a pending payment incident exists, and checks injected transaction/email metadata is absent from the journal.
- `evidence/V5-01-before.txt` records the expected failure, zero persisted alerts versus one required. `evidence/V5-01-after.txt` records all five operational-alert tests passing.
- Sibling handling remains intact: existing cooldown, retry, explicit external-payload allowlist, bounded event-key map, startup replay, and shutdown flush apply to the new event without a new alternate implementation.
- Privacy claim is narrowly scoped to the alert journal and delivery allowlist. The general logger does not remove fields simply because they are named `email` or `transactionId`; the actual payment worker event emits neither field. The new regression does not establish global personal-data log redaction.
- The fix resolves worker-wide failure observability only. Per-order unknown/review/failed payment states and the absence of a staff order-review workflow remain as recorded in SW-03.

## Visitor static checks

| Check | Status | Evidence |
|---|---|---|
| Public text assets contain credential-shaped literals | CLEAR within scan | Scanned 31 local text assets from public/images/audio/videos, root HTML and served design-system CSS. Zero matches for long common API-key or JWT shapes. This is pattern detection, not proof that arbitrary secrets cannot exist. |
| Public source maps | CLEAR locally | Zero `.map` files in the scanned public asset trees. Current JS/HTML/CSS scan found no `sourceMappingURL` reference. Live parity is owned by the main phase 6 evidence. |
| Analytics/session recording | N/A in inspected current source | No references to Clarity, Hotjar, GA/gtag/GTM, Meta Pixel, PostHog, LogRocket, Mixpanel, Amplitude, Segment or Sentry in current source JS/HTML/CSS/JSON scan. This does not inspect a vendor dashboard or prove deployed parity. |
| Repository visibility | PUBLIC, confirmed saved evidence | `evidence/github-public-metadata.json` identifies `alkhunizan/Co-study`, `visibility: public`. No extra network request was made here. |
| History secret candidates | Dropped as credential exposure claims | See classification below: 16 existing blob revisions examined programmatically; zero matching credential shapes. Hits refer to `service_role` as a database role, grants, migration verification, test assertions, or server-only comments. |
| Deleted environment files | CLEAR within supplied history query | `evidence/history-deleted-env-paths.txt` is empty, zero bytes. This says only that the main agent's deletion query returned no paths. |
| Personal contact data | Intentional public contact details observed | Public email/phone/WhatsApp contact content has matching page and SEO siblings. No inference that intentionally published support contacts are secrets. Binary image/video metadata and historical document metadata were not scanned. |
| Supabase public-key/RLS exposure | UNVERIFIED if legacy Supabase storage is used | Current tree retains server-only Supabase compatibility client/store, but current `supabase/` migration directory is absent. Historical migration policy text is not proof of deployed RLS. Current platform DB migrations use server-mediated SQL. Do not claim live Supabase table privacy without the main target gate and count-only verification. |
| Hidden internal documentation | Static guard present | `co-study-server.js:1761-1766` only allows CSS under the design-system mount. Root repository files are not exposed by a generic static mount. Live checks are separate. |

## History classification details

The supplied `history-secret-paths.txt` lists nine hit commits and paths. For each listed path, both that commit and its first parent were examined where the path existed. Sixteen existing file revisions were scanned; absent prior paths were skipped. Metadata-only evidence is saved in `evidence/history-secret-classification.json`.

The inspected paths were:

- `scripts/ci/verify-postgres-migrations.js`
- `tests/unit/postgres-migration-runner.test.js`
- `supabase/migrations/20260715010000_account_resurrection_focus_idempotency.sql`
- `supabase/migrations/20260715000000_secure_baseline.sql`
- `scripts/verify-supabase-migrations.js`
- `services/supabase/client.js`
- `supabase-user-store.js`

Credential-pattern matches: **0**. `service_role` is a legitimate PostgreSQL/Supabase role identifier, not itself a bearer credential. The migration verifier explicitly creates/checks that role and its table privileges. The retained client reads its secret from an environment variable. These scan hits alone do not justify claiming a leaked key or asking for credential rotation. This targeted scan does not certify every historical blob against every possible secret format.

## Security and operations remainder

| Category | Static disposition |
|---|---|
| Authentication / authorization | Platform router mounts account middleware before protected handlers; staff handlers additionally call MFA/permission checks. ID-bearing payment status selects by both order and user. Other route and cross-user runtime coverage remains in the main phase 3/4 evidence. |
| Injection / redirects | Inspected payment SQL uses parameter placeholders; hosted checkout redirect uses a fixed HTTPS origin/path allowlist; browser platform text uses `textContent`. No payment URL fetch is derived directly from webhook body. Full repository injection coverage is not claimed. |
| Browser controls / sessions | Static auth scans show signed session tokens, token epochs, expiry checks, timing-safe signatures, and purpose-bound reauthentication. Main runtime evidence determines effective cookies/origin/CSRF and logout behavior. |
| Abuse / cost | SW-01 remains a queue-bound concern in configured sandbox transaction mode. This review made no external cost or capacity assumptions and performed no traffic. |
| Secrets / logs | No credential-shaped literal found in the targeted public/history scan. Structured logger redacts secret-like field names recursively; raw error strings in the optional Supabase compatibility client/store may include provider-body snippets (`services/supabase/client.js:59`, `supabase-user-store.js:86`). Their sensitive-content impact is UNVERIFIED and configuration-dependent. |
| Uploads | No upload handler identified in the reviewed platform/auth paths. Not a whole-repository upload audit. |
| Supply chain | Refer to main phase 2 audit output; no scanner install or package upgrade performed here. |
| Migrations / backup | DigetPay migration/backup/restore siblings reviewed in `sweep.md`; main tests establish runtime validity. No live migration applied. |
| Deploy configuration | Current payment code fails closed in production; runtime pin, candidate parity and actual deployed state remain in main report. |
| Observability | Worker-wide failure rule fixed and independently accepted above. Order-level review workflow still incomplete. No production telemetry access in this subtask. |
| Resilience / third parties | Provider timeout, response-size limit, fixed origin, idempotency and verification paths reviewed earlier. Real merchant contract, refund timing, and transaction/session lookup semantics remain unverified with DigetPay. |

## Read counts and limits

For this follow-up, exactly **five current source/test files were fully read**: operational alerts, operational-alert tests, structured logger, Supabase client, and Supabase user store. Both changed-file diffs were fully reviewed. Sixteen historical file revisions were scanned programmatically; they are not counted as full human source reads. Thirty-one public text assets were scanned programmatically; they are not counted as full source reads. Repository-wide distinct full-read count across all phases/agents is **unknown** and must not be inferred from search hits or line counts.

No new confirmed security exploit was found in this follow-up. Two scan-candidate groups were dropped: `service_role` history mentions as exposed credentials, and intentional public support contact details as leaked personal data. Remaining owner items are actual merchant contract validation, optional Supabase deployed-policy verification if enabled, external alert delivery acceptance, and a payment review workflow before a real merchant pilot.
