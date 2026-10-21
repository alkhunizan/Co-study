# Release and external acceptance - 21 October 2026

Local hardening and real-provider acceptance are separate. This run does not deploy, migrate a hosted database, contact recipients, change provider dashboards, or enable live payments. One VIP tier remains USD 4.99/month. DigetPay is an optional sandbox adapter, not a newly selected production provider.

## Repeat the local gate

Use Node 22, a clean checkout and `npm ci`, then run the repository check, typecheck, lint, deadcode, audit:prod, test:integration and test:smoke scripts. Run `scripts/test-postgres.ps1` for a disposable loopback PostgreSQL 16 cluster; it stops its own cluster afterward and retains evidence. CI has the equivalent PostgreSQL service job. Set `PLAYWRIGHT_OUTPUT_DIR` and `PLAYWRIGHT_HTML_OUTPUT_DIR` to this folder's ignored evidence directory. Do not copy the workspace .env into a verification checkout.

The local `run-check.ps1` runner scrubs service credentials, selects Node 22, writes evidence and blocks browser external requests. Pass `-Runtime <clean-folder>`; `-Install` is only for dependency installation before Playwright exists. `-Postgres` invokes the inspected disposable-cluster script. Focused evidence includes before/after failures rather than only passing runs.

## Operator acceptance still required

| Service | What local checks establish | Required owner-controlled acceptance |
|---|---|---|
| Camera / Cloudflare | Failure closes camera; session heartbeat, revocation, departure and reconnect work against fixtures. | Two test devices on a designated test app: view beyond three minutes, reconnect, upgrade viewer role, leave, revoke, and replay the revoked token. Verify remote pixels with blur failure. Record participant termination and absence of residual access. |
| Recovery mail | Local recovery/token/session tests cover single use, expiry, retries and revoked access. | Configure a test sender and recipient. Verify receipt, valid link origin, one-use token and expired/replayed link rejection. No real mail sent in this run. |
| Hosted database | Disposable PostgreSQL checks migration, locking, timeouts, lease loss, readiness, alert persistence and restore. | Back up the designated hosted test database, stop the app, apply migrations 001-003 via `npm run platform:migrate`, restore to a separate empty test database and verify counts/relationships. Keep one app process. Do not roll back to schema-2 code while review and pending orders coexist. |
| External alerts | Local failures create bounded/redacted alert records and fixture delivery tests cover retry behavior. | Configure a controlled receiver. Cause a bounded test outage; confirm receipt, redaction, deduplication and recovery. Retain timestamps and acknowledgement. |
| Payments | Fake-provider tests cover fixed price, binding, refunds, duplicates, cooldown, overlap, read-only staff and audited super-admin review. | Select provider, confirm USD support and status lookup contract, then use merchant sandbox credentials and test cards. Verify approved/declined/refunded transactions, missed/duplicate notifications and overlapping approvals. Automatic renewal and live charging stay disabled. |
| Release / SEO | Clean artifact suites check routes, links, locales, canonical URLs, sitemap and private-page indexing controls. | Deploy the reviewed commit through the normal process, configure HTTPS/HSTS at the serving edge, then run `npm run verify:seo -- https://halastudy.com` and independent public-route/contact checks. A passing local route is not evidence of publication. |

Record each acceptance as date, release commit, test environment, expected result, actual result and evidence path. Do not put credentials, recovery links or payment data in the report. An unavailable service remains unverified; it is not a pass.

## Migration and review operations

Migration 003 only changes the open-order uniqueness predicate. It retains paid review orders and allows them beside a newer pending attempt. The app refuses an unmigrated hosted schema. Take a backup and stop the single runtime before the explicit migration; local embedded test databases migrate at startup.

On `/app#staff`, MFA-verified billing operators can read the bounded payment queue. A verified super admin can submit a reasoned recheck and, for an overlapping paid order, request activation after investigation. The server verifies provider evidence again and refuses a second active membership. Unknown creation with no verifiable reference is intentionally retained; investigate it with the merchant before any separate maintenance repair. Callback retry exhaustion cannot be reset by sending another notification.
