# Halastudy full fix and release plan

Prepared 2026-10-23. Status: **planned; implementation has not started**.

This plan closes the remaining local defects and verification gaps, preserves the
six completed fixes and twenty study features, and carries the candidate through
controlled external acceptance, migration, release and rollback preparation.

## Starting point and evidence

- Checkout: `Co-study`, branch `viber/2026-10-23`.
- Planning HEAD: `75bdf965a9d097d85fb98a03f602ea162481b5ae`.
- Last tested application source: `50158269273d27330012dc116685d6898a49ca6b`;
  later commits contain evidence only. Current source matches that candidate.
- Seven unrelated untracked folders remain preserved. Record them again before
  execution; never reset, stash, clean or stage them with this work.
- The previous gate reported 169 integration and 83 browser cases passing,
  PostgreSQL recovery/restore, SEO and 33 boundary probes. These are **baseline
  results**, not verification of the future changes in this plan.
- The previous production checks were anonymous GET/HEAD only. They observed
  a different/older served artifact and missing HSTS. Those observations must be
  rechecked before release; this planning task made no new production requests.

Primary records: [findings](../../viber/2026-10-23/FINDINGS.md),
[run and receipt](../../viber/2026-10-23/RUN.md),
[before/after gallery](../../viber/2026-10-23/review.html),
[twenty features](../../features/2026-10-22-top-20/FEATURES.md).

## Completion conditions

1. V9-01 is fixed in source and all affected branding variants pass the same
   accessibility rule with real fonts. Account heading semantics are complete.
2. The all-font diagnostic passes with its existing assertions, genuine font
   responses, no unexpected blocked font requests and a complete request ledger.
3. Every one of the 133 risky boundary patterns has a disposition; critical auth,
   privacy, money and media controls have positive and negative evidence. Every
   previously unmeasured route and partially reviewed file is accounted for.
4. All twenty study features and the core guest/member/owner/supervisor/staff journeys
   meet [ACCEPTANCE.md](ACCEPTANCE.md). The six existing fixes remain effective.
5. Production recovery email has a real server-side delivery implementation and
   controlled acceptance evidence. A local outbox or enabled flag is insufficient.
6. The exact final source passes Node 22 quality, PostgreSQL, SEO, browser,
   accessibility and operational checks. No essential work is relabeled optional
   or omitted to make the gate green.
7. Hosted data preservation, migration, restore, real providers, active HTTPS/HSTS
   and rollback are accepted before production approval.
8. Publication is claimed only after approval, deployment and independent live
   verification. Local, staged, merged and production states remain separate.

There are two sign-offs: **local candidate qualified** and **production release
approved**. The first cannot substitute for the second.

## Scope and architecture decisions

Keep the existing vanilla frontend, shared design tokens/HalaCore helpers, Express,
Socket.IO and PostgreSQL/PGlite architecture. These findings do not justify a framework
migration, a new social surface, a paid tier change or horizontal scaling.

Preserve Arabic-first copy, the Latin Halastudy wordmark, logical RTL layout, optional
camera participation, free access and the existing USD 4.99 monthly VIP offer.
Planning, payment state and badges must never grant staff powers or reward credit.

For branding, prefer a native accessible name derived from the visible wordmark,
with a localized visually hidden home-action suffix if needed. Remove a conflicting
override rather than constructing names by concatenating arbitrary `textContent`
in a global script. Keep decorative glyphs hidden appropriately. The temporary DOM
change in the audit is a positive control, not a ready-to-copy final implementation.

For fonts, repair verification and caching first. Keep the product's font families
and required weights. Do not remove typography, suppress font errors or loosen the
diagnostic. Duplicate stylesheet declarations may be consolidated only after measuring
their requests and confirming identical typography and coverage.

For recovery, keep token generation, hashing, expiry, account queues and session
revocation in the existing auth service. Add a server-only delivery boundary with a
fake implementation for tests and an adapter for the owner's selected transactional
provider. Do not put provider credentials or recovery tokens in browser code/logs.
Use existing dependencies and platform persistence; any necessary dependency/schema
addition needs a concrete justification and complete migration/backup coverage.

## Ordered execution backlog

Effort labels describe scope, not promised delivery times: S = contained fix;
M = several boundaries or tests; L = integration/operations work.

| ID | Work | Dependency | Effort | Execution boundary |
| --- | --- | --- | --- | --- |
| T00 | Isolate source and establish execution baseline | None | S | Local |
| T01 | Correct branding names and account headings | T00 | S–M | Local |
| T02 | Complete real-font verification and request accounting | T00 | M | Local + bounded anonymous font GETs in a new run |
| T03 | Close coverage and source-review gaps | T00 | M | Local synthetic data |
| T04 | Protect the six existing corrections | T00 | S | Local synthetic data |
| T05 | Implement production recovery delivery | T00; provider contract for real adapter | L | Local code/fakes first; external delivery needs authorization |
| T06 | Walk the full feature and role acceptance matrix | T01–T05 as applicable | M | Local, then designated staging |
| T07 | Reconcile release configuration and operational runbook | T03, T05 | M | Local preparation; hosted inspection gated |
| T08 | Accept real media, OAuth, mail, billing and alerts | Validated local slices; test accounts/configuration | L | Authorized designated test systems only |
| T09 | Recover live parity and rehearse migration/rollback | T07; authorized host/data access | L | Authorized staging/host operations |
| T10 | Freeze and qualify the final candidate | T01–T09 evidence | M | Fresh full gate on exact source |
| T11 | Approve and perform release, then verify it | T10 + explicit release approval | M | Owner-controlled external action |
| T12 | Monitor the first operating week | T11 | M | Approved operations; synthetic probes where possible |

T01–T04 and the provider-independent part of T05 can proceed without waiting for
deployment access. External decisions must not halt unrelated local work.

### T00 — Establish a clean execution boundary

Create a new implementation branch from the reviewed planning state, for example
`fix/halastudy-release-gaps`. Keep the completed viber packet immutable. Record exact
HEAD, dirty paths, Node version, source manifest, local runtime and data targets.
Use a fresh dedicated runtime with production environment variables excluded.

Execution evidence belongs in a new folder such as
`docs/refinement/<execution-date>-halastudy-release-fixes/`, with `PLAN.md`,
`CHECKPOINT.md`, `findings/`, `evidence/`, `screenshots/` and `scripts/`.

Acceptance: correct source captured; unrelated work preserved; no remote backend in
the write-test environment; no credentials copied; one loopback app boots ready.

### T01 — Fix the actual accessibility issue and its siblings

Start at `account.html:150`. Inventory home links/wordmarks in the other HTML
templates, shared legal/marketing rendering and responsive variants. Include
`.brand`, the room `.logo` and footer home links; do not assume identical class names.

Use the recommended native-name markup and localized home suffix. Preserve the
visual wordmark, destination and hit area. Correct each confirmed sibling in small
reviewable commits. Do not stop after only the account page passes.

Give the active account view a meaningful level-one heading. Preserve existing
translation keys, form labels, feedback IDs and focus behavior; inactive sign-in,
sign-up and account panels must not expose competing visible headings.

Acceptance: pre-fix real-font desktop reproduction fails; patched source passes
`label-content-name-mismatch` without exclusions, changed thresholds or disabled
rules. Test AR/EN, light/dark, 320/390/768/1440px and enlarged text. Voice-control
names include the visible brand; keyboard Home navigation and Retry remain usable.
Run axe on every affected page family, including auth error states and public
canonical/locale aliases. Capture actual before/after renders.

### T02 — Make the font result complete and reproducible

The old run's 18 site requests plus 12 font GETs exhausted its cap. Its failure is a
verification limitation, not evidence that production typography is broken.

Copy the twelve successful font responses into the new run only after verifying
their URL, status, body hash and content type. Inventory the exact CSS queries,
families, weights, italics and Arabic/Latin subsets actually requested by landing,
account, open, study, planner and legal pages. Account and shared token CSS currently
declare different Google CSS queries; include both until any consolidation is proved.

Replace separate hardcoded allowances with one ledger for the entire new audit:
maximum 30 external production-host requests, including every font GET/redirect and
site request. Record real requests, cache hits and cap-blocked requests separately.
Reserve eight requests for essential live artifact/HTTPS checks; use at most the
remaining 22 for missing font assets. Unused font allowance can fund further necessary
anonymous checks. Use a verified offline server export for remaining parity work if
the approved public-request allowance cannot cover it. Never reset the counter within
a run or repeatedly start a new run merely to evade it.

Populate/validate fonts before the final diagnostic, reuse genuine cached responses,
and block all unapproved hosts and methods. Run the original font diagnostic unchanged
with `CO_STUDY_OFFLINE=0`. Record CLS/LCP under the test's stated lab conditions;
these are not field-performance or retention measurements. Separately verify a font
network outage leaves readable fallbacks and reachable controls; that failure-state
test does not count as a successful real-font diagnostic.

Acceptance: all requested faces in the diagnostic have no error state; font/CSP logs
and unexpected network failures are empty; all original layout/performance assertions
pass. If the cap prevents completion, retain the missing-resource list and UNVERIFIED
status. No green result may be manufactured from fallback fonts.

### T03 — Close measurement gaps and complete the trust review

Use [COVERAGE.md](COVERAGE.md) as the worklist. Previous counts were 107/133 observed
patterns, 22/80 fully read files and 26 patterns excluded from runtime matching.
Those 26 are not automatically broken features: mounted `req.url` ambiguity caused
some exclusions.

Capture canonical `originalUrl`/method/status before response-finish mutation,
redact query strings, and test the observer using positive controls for root,
nested, denied, error and alias routes. Match against the unchanged method/path
inventory. A generic 401 for an unknown path is not proof that a route exists.

Run the missing route controls against synthetic users, private circles and named
staff with MFA. Cover legacy-admin-enabled and post-bootstrap-retired configurations
separately. Every auth/privacy/money route needs its intended positive state or
documented intentional unavailability, plus denial cases. Add focused regressions
only where existing suites do not actually exercise the behavior.

Read all 58 remaining runtime/schema files in bounded domain batches. Record full
reads versus scoped reads honestly. Trace SQL scope, role checks, revocation,
idempotency, error handling and provider boundaries to their enforcers. Reproduce
new defects before patching; retain refuted candidates in the ledger.

Acceptance: 133/133 patterns have a disposition; target at least 95% executed or
proven N/A, with no unresolved critical trust boundary. All 80 runtime/schema files
have completed review records. Do not shrink the denominator or count imports as
flow execution. Explicitly retain any unmet target as a gate gap.

### T04 — Preserve completed fixes

Re-run the six concern-specific before/after controls listed in ACCEPTANCE.md.
In particular: timeouts must cover streamed bodies; errors must omit provider data
and query secrets; reminder retries must recheck membership/preferences; Google
discovery must not reveal a disabled provider or discard form drafts.

Acceptance: every relevant regression passes on the new source, original assertions
remain intact, and none of these actions changes time credit, XP, staff authority,
pricing or free access.

### T05 — Complete recovery email as an implementation

`services/auth/recovery.js:createRecoveryMail` currently supports only disabled or
non-production loopback outbox delivery. Define the adapter against the owner's
existing approved transactional service; do not create/purchase an account or choose
one silently. Before adapter coding, verify its current official API/SDK contract.

Keep disabled/local modes. Add a production-capable server transport with bounded
request/body deadlines, rate/cost controls, provider idempotency and redacted errors.
Use a canonical configured HTTPS recovery origin, never a request-supplied host.
Provide complete Arabic/English reset and verification messages. Link tokens remain
high entropy, hashed in account records, expiring and single-use; reset revokes
sessions and sockets. Preserve Google-only account behavior and the absence of a
new signup verification wall.

Recommended delivery design: persist a bounded delivery job with an encrypted,
short-lived token payload and a purpose-specific key before asynchronous delivery;
retry only while the matching user/email/epoch/token remains valid. Cap attempts,
backoff and queue size; cancel obsolete jobs after reset, ban, deletion or expiry.
This avoids silently losing an accepted recovery request on restart. If a new SQL
migration is needed, number it after 004 and extend backup/restore, old snapshot
compatibility and readiness checks. Keep unsupported compatibility-storage modes
explicitly disabled until their delivery/backup contract is proven.

Test with a fake transport first: success, timeout before/after headers, non-2xx,
malformed responses, replay, expiry, parallel reset, resend, queue pressure, restart,
account removal, rollback and secret masking. Unknown/known addresses retain the
same public response shape; provider detail must not identify account existence.

Acceptance: transport and durable recovery tests pass locally; controlled staging
receives the real message and completes the reset. Without a chosen/configured
provider, the real adapter/receipt remains blocked and production stays NO-GO.

### T06 — Verify complete journeys and all twenty features

Execute ACCEPTANCE.md with independent browser contexts and server assertions.
Keep four primary destinations and existing URLs/deep links. Cover guest, member,
circle owner, supervisor, moderator/support/billing/admin/super-admin boundaries.

Walk loading, empty, invalid, denied, expired, duplicate, interrupted and recovered
states. Include Back/Forward, reload, two tabs, lost responses, membership removal,
account switching, Riyadh rollover and device-timezone calendar behavior. Test
camera-off study and server-owned rewards independently of media.

Acceptance: every feature has a positive journey, meaningful failure/isolation
control and evidence on the final candidate. No simulated people/attendance and no
unsupported capability claim. Unavailable data remains distinct from zero.

### T07 — Prepare an accurate release and rollback runbook

Create a current runbook; retain old audit records as history. Reconcile stale
statements about migrations 001–003/schema3 with the current four migrations/schema4
and v3 snapshot format. Account for any T05 migration as well. Document credentials
as variable names and approved hosts only.

Record one Node 22 process, actual data paths outside the checkout, schema readiness,
stable SESSION_SECRET/MFA handling, backup retention, alerting and stop/start order.
Keep liveness separate from readiness; admission/release must depend on readiness.
Inspect the active edge configuration before changing HSTS; the checked-in Nginx
template already sets it. Do not change a provider dashboard as a local code fix.

Acceptance: a new operator can follow exact tested commands for a disposable
rehearsal. No rollback instructs `PLATFORM_ENABLED=false`, stale JSON revival,
schema downgrade or deletion of an unknown/live runtime lock.

### T08 — Controlled real-provider acceptance

After relevant local checks pass, use owner-authorized test accounts and a designated
test environment. No production authenticated writes or messages occur within a
Viber anonymous-production pass.

Test real camera/blur/reconnect/token revocation with another observing device,
including Android Chrome, iOS Safari and desktop Chrome where supported. Test
Google callback/state/denial/logout and actual reset/verification email. Test the
existing DigetPay adapter only in an explicitly approved merchant sandbox: approved,
declined, canceled, refunded, duplicate and missed notifications. Confirm its current
USD/status-binding contract before using it; never relax binding for a green test.
Test alert delivery to a controlled receiver with redaction/dedup/recovery.

Acceptance: record source, environment, device/browser, expected/actual result and
sanitized evidence. Fixtures do not count as real-provider acceptance. Production
charging and automatic renewal remain disabled unless separately approved later.

### T09 — Recover live parity and rehearse hosted operations

With explicit host/data authorization, identify the actual live revision, storage
backend, schema, process, public content and configuration. Compare public articles,
assets, branding/contact links and routes against the candidate; preserve live work
missing from the checkout. Do not assume the current live backend is already SQL.

Take a protected canonical backup plus any independent compatibility-account backup.
Rehearse import/migrations against an authorized sanitized copy, not the original.
Apply all required migrations explicitly with the single app stopped. Restore to a
separate empty target, verify counts/relationships, authentication revocation and all
new study tables. Validate a rollback target that can read the resulting schema.

CLI contracts are verified in `scripts/platform-maintenance.js`: credentials come
from the environment; `PLATFORM_DATABASE_URL` selects managed PostgreSQL, while
`--directory` selects embedded storage. Never set both accidentally: the URL takes
precedence. A restore needs an empty, correctly prepared target. Follow the current
schema checks, not an old sample command copied without validation.

Acceptance: live-content parity matrix, protected backup reference/checksum, schema
manifest, restore evidence and explicit rollback triggers are ready. No real row
contents, secrets, reset links or payment details enter the review packet.

### T10 — Final freeze and qualification

Resolve all locally actionable critical/high findings, then freeze the exact source
manifest. Run the complete quality gate on that source, with real-font validation
scheduled early enough to leave budget for its dependent checks. Do not launch
additional visual browsers concurrently with camera smoke cases.

Run a fresh full Viber gate using the prepared evidence and its safety rules. Preserve
failed attempts and their corrections. New final-pass findings must be recorded and
the verdict kept NO-GO; fix them in a new implementation slice and requalify affected
evidence. The old final-pass freeze is not a permanent ban on future fixes.

Acceptance: all required local results pass; no open P0/P1 in auth, privacy, money
or paid APIs; no known shipping accessibility failure; exact source/preview/commit
match. Production qualification additionally requires applicable operations/providers
accepted. An external blocker stays UNVERIFIED and keeps production NO-GO. Report
coverage and untested devices/configurations without claiming perfection.

### T11–T12 — Release, independent confirmation and operating watch

Prepare one owner approval packet: exact SHA, completed matrix, schema/config changes,
backup/restore proof, expected interruption, rollback command/trigger and residual
conditions. Obtain explicit approval for push/merge/deploy/hosted writes. Current
planning authority does not grant those actions.

Release only the approved artifact, one process, with verified persistent storage,
explicit migrations and the intended edge configuration. Afterward independently
verify readiness including database state, source fingerprint, critical public and
protected-route behavior, robots/sitemap/canonical pages and actual HTTPS/HSTS.
Keep production checks anonymous GET/HEAD within the audit cap; authenticated smoke
checks belong to an explicitly authorized acceptance operation, not an implicit
exception to Viber's production rule.

Pause admission/release if the database is unready, identity/permission checks fail,
private scope leaks, backup fails or approved content is missing. Roll back only
through the rehearsed compatible code/data path; preserve evidence and new user data.

For the first operating week, watch provider permission/revocation errors, recovery
delivery/failures, database lease/readiness and backup/restore health, reminder retry,
429 spikes and billing reconciliation. Define thresholds from the accepted synthetic
baseline and operator capacity; do not invent a production SLO or retention uplift.

## Verification commands and execution safety

Run from a credential-free disposable Node 22 copy; inject test-only targets through
the process environment. App startup does not automatically load `.env`.

```powershell
npm ci
npm run test:ci
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-postgres.ps1
npm run verify:seo -- http://127.0.0.1:<review-port>
```

The app has no frontend build step. The final font diagnostic also needs its prepared
real-font/cache harness and explicit enabled mode; a bare default smoke run skips it
in offline mode. Discover exact per-suite arguments from package.json and the new
run helpers. Record command, exit, duration, source hash, environment and evidence.

Do not run provider setup/smoke, R2 upload, migration or restore commands merely
because they exist in package.json. Review their side effects and target first.
Local synthetic writes are authorized in the future implementation; live charges,
provider settings, actual mail/alerts, hosted writes, publishing and release remain
separate external actions. No action in this plan has been executed by writing it.

## Owner inputs, requested only when they block execution

| Input | Why needed | Independent work that continues |
| --- | --- | --- |
| Existing approved transactional provider, sender/domain and test recipient | T05 real adapter contract and controlled receipt | Branding, fonts, coverage, fake transport and recovery security |
| Designated test OAuth/video/payment/alert environments and operator authorization | T08 real-provider acceptance | All local tests and review packet preparation |
| Canonical host/storage access and migration/restore approval | T09 real parity and hosted rehearsal | Disposable database rehearsal and runbook |
| Exact release approval | T11 push/merge/deploy and any production writes | Complete local/staging evidence and reviewable release packet |

No permission question is needed to review this plan. Before any later approval
request, finish the independent local work and present the concrete result to approve.
