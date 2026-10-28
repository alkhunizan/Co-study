# Halastudy full viber gate — 2026-10-23

Repo: `\\192.168.50.113\E\D-Backup\OS\Claude-Projects\body_doubling_live_cam\workspace\Co-study`.
Starting branch: `feat/2026-10-22-top-20`. Starting full SHA:
`a22b1558113f57b0904841c91704dd2e69e71594`.
Gate branch: `viber/2026-10-23`. Mode: full auto. No source changes before gate.
Seven pre-existing untracked folders are listed in `evidence/baseline-status.txt`;
the additional gate folder belongs to this run. No reset, stash, clean or external write.

## Phase 1 — Map

Halastudy provides bilingual guest study rooms, private account planning, circles and server-credited focus progress.
Saudi/GCC students use it as guests, members, private-circle owners, assigned supervisors and separately authorized staff.
It stores account and study data in PostgreSQL/PGlite; media, optional Google auth, compatibility Supabase, mail and sandbox billing cross server-controlled provider boundaries.

Classification: web UI, HTTP API and Socket.IO server. No mobile binary, compiled
frontend bundle, public uploads, queue worker or browser-facing database client.

Trust boundaries: HTTP/socket session identity → platform epoch revocation → scoped
private study and cohort access; named staff permissions + MFA are separate from VIP
entitlements and focus rewards. Server time owns focus/reward accounting. RealtimeKit
tokens are issued server-side; optional mesh remains available. Billing uses verified
provider status, never browser return parameters. RLS matters for the compatibility
Supabase path; primary SQL is server-only and every private query needs scope.

Critical flows: guest room create/join; invitation/password handoff; camera/blur and
departure; signup/login/logout; recovery/reauth/deletion; focus pause/resume/completion;
private task/routine/journal recovery; circle membership/invitation/resources/agenda;
supervisor scope; named-staff MFA/roles/moderation; sandbox checkout/reconciliation;
restart/migrate/backup/restore. Auth, money, private data and media dominate risk.

Public URL: `https://halastudy.com` (canonical metadata/deployment documentation).
Preview is a loopback candidate, not a hosted branch deployment. Production source
identity and provider/device acceptance are not established by local tests.

Commands discovered from current package.json and CI (not inherited historical counts):
`npm ci`; `npm run test:ci` (syntax, TypeScript, Biome formatting/lint, knip, production
audit, integration and browser); `scripts/test-postgres.ps1`; `npm run verify:seo`.
No build step. CI uses Node 22 and includes the same quality gates plus PostgreSQL 16.
PM2 is one instance; Nginx terminates HTTPS. Deployment remains an owner action.

Release evidence exists: lockfile, audit gate, format gate, four migrations, database
backup/restore and rollback instructions. Their existence alone is not fresh proof.
Disposable PostgreSQL recovery and actual snapshot restore will be rerun.

Risk denominator and complete route/file inventory are being enumerated in
`audit/surface-trace.md`. Execution/trace coverage will be counted against that list.

Plan: run all nine phases; reuse no old test counts. Stub all paid/provider actions,
use disposable local stores and two synthetic accounts for isolation probes. Real
camera devices, OAuth/mail delivery, provider dashboards, hosted migrations and live
rollback remain unverified owner acceptance. No production login or write allowed.
Repeat traps from the skill log are explicit checks in phases 3–7: guard twins, non-2xx
UI recovery, paid limits, fixes affecting neighbors, unenforced guarantees, shipped
parity, user scoping, secrets, malformed inputs and release evidence.

Dropped candidates: 0 at map (no application defect alleged).

## Phase 2 — Boot (in progress)

Fresh runtime comes from `git archive HEAD`, filtered to 290 application/runtime files.
No `.env`, credentials, workspace data, node_modules or old runtime was copied.
Archive and source normalize to identical tracked content; Git archive's platform line
endings differ in 205 files, recorded separately from actual mismatches (zero).
The initial parity failure is preserved in `evidence/initial-parity-line-endings.json`.
All command entries bind to the source manifest. Runtime is under the dedicated
`%LOCALAPPDATA%/Temp/halastudy-viber-2026-10-23/` folder.

Workspace env was inspected as names/target hostnames only, never loaded. Runtime
helpers clear inherited provider/database variables; preview explicitly uses loopback
PGlite, simulator billing, mesh, no Supabase/Google/provider keys. Offline browser
tests block non-loopback requests. Fresh `npm ci` is running before any write tests.

The source-review tasks are read-only and run in parallel under viber's explicit
parallelism instruction. Suspicions become findings only after main-agent verification.

## Run log policy

All run outputs stay in dedicated folders. The canonical skill checkpoint at
`~/viber-runs/co-study-2026-10-23.md` mirrors this report. Five closing log lines will
be saved inside this run rather than modifying global persistent memory without a
direct memory-update request. The supplied memory registry was used only for prior
local/provider acceptance boundaries; current source and probes decide this gate.

## Phases 3–5 — Trace, probe and sweep

`audit/surface-trace.md` enumerates 150 HTTP registrations and 14 socket commands;
119 API/auth/admin API patterns plus 14 socket commands form the risky denominator
of 133 boundary patterns. Runtime/source file denominator is 80, with read depth
explicitly marked. `audit/trust-sweep.md` records 409 tracked-text secret-shape scans,
72 asset references and an 11-row guard matrix. These are static counts, not tests.

The six verified concerns and exact before/after evidence are in `FINDINGS.md`.
Real stalled requests, raw provider errors, account save errors and reminder refresh
failure were reproduced with local synthetic fixtures. The failed first camera
selector and incorrect initial reminder PUT fixture were test-harness errors, not
application findings; corrected before drawing conclusions. No assertion was weakened.
The join retry positive-control wording was corrected to the existing product copy.

The complete study-tools browser suite passed alongside account AR/EN and RTC
recovery. The corrected Join test passed separately. Server deadline and privacy
regressions plus foundation tests passed. Syntax/type/lint passed before each final
slice was committed. Current final source is `5015826`; six concern-specific local
commits follow the baseline. Final complete CI is now running; it supersedes all
intermediate counts. Request observers record only methods/paths/statuses and socket
event names on disposable local test servers, never cookies/bodies/query tokens.

## Phase 6 — Visitor

`evidence/visitor.json` records 18 of 30 production requests, anonymous GET/HEAD only,
no redirects, browser session, authentication or writes. Eighteen matching local
requests were also executed. Both hosts return 404 for env/git/debug/seed doors.
The local private APIs deny anonymous users with 401; public shells carry no private
data and noindex. No browser-facing primary SQL/Supabase key is shipped.

Production is a different/older artifact: `/app`, `/api/platform/progress`,
study-workspace.js, robots and sitemap return 404. The attempted GET tasks path is
not used as drift evidence: candidate tasks have POST/PATCH routes, not a GET list.
Readiness is 200 but
does not expose the candidate's database readiness check. These responses prove
neither the reviewed candidate nor its migrations are deployed. Live HTTPS lacks
HSTS even though the checked-in Nginx template sets it. CSP, nosniff, frame and
referrer headers are present. Owner deployment/configuration is required; no live
provider/DB mutation was attempted. Twelve requests remain reserved; font requests
will be bounded and recorded if used. Private data counts/contents were never read.

## Phase 7 — Security and operations

| Area | Evidence and disposition |
| --- | --- |
| Auth / authorization | Session+epoch middleware, staff MFA and scoped per-user/cohort queries; integration and multi-context browser suites exercise denial and positive controls. Final suite pending. |
| Injection / redirects | Parameterized SQL, HTTPS-only resource URLs, safe return helper, text rendering; current negative suites exercise malformed payloads and scope checks. |
| CSRF / CORS / cookies | Exact origin allowlist, same-origin mutation guards, HttpOnly/SameSite session cookies and secure transport when proxied; existing integration coverage rerun. |
| Cost and abuse | Existing per-IP/signup/login/socket/provider limits and fake provider fixtures. No real payment, AI, mail, SMS or Cloudflare API call. |
| Secrets and logs | Fresh runtime excludes env; provider credentials cleared. Provider-body log leak fixed, tested with a synthetic private marker; history scan is metadata only. |
| Sessions and privacy | Server revocation/reauth/deletion; task/history data stays per-account; reminder fresh access check retained after retry fix. |
| Uploads | No user file upload or executable storage feature; N/A. |
| Dependencies | Fresh frozen install green with zero advisories; production-only audit rerun by full CI. |
| Migrations / backups | Four versioned migrations; primary SQL server-only. Disposable PG16 outage, recovery, restore and lock tests queued; hosted restore is owner acceptance. |
| Runtime / health | Node22, one PM2 instance, local readiness executed. Docker liveness is intentionally distinct from readiness and verify-deploy checks readiness; no reproduced Docker failure retained. |
| Observability / resilience | Structured redacted logging, staff error buffer, retries and database readiness paths; no production account/log access was authorized. |
| Third parties | Provider simulation/outages tested locally. Real camera/blur on supported devices, provider revocation, OAuth/mail delivery and hosted integration remain external acceptance. |

## Phase 8 — Fix pass

All six fixes are at most three files/80 changed lines per concern, no dependency,
billing, price, auth-provider settings or access loosening. Tests caught pre-fix
behavior and preserve positive controls. `audit/fix-review.md` independently refutes
follow-on candidates and documents the earlier mistaken staff transaction suspicion:
the current code already uses tx.query and is not a defect. Scale pagination and
Docker readiness suggestions have no demonstrated current failure and are not open
critical issues. No pre-existing dirty file was touched.

## Phase 9 — Final verification

Source stayed frozen at full SHA `50158269273d27330012dc116685d6898a49ca6b`.
Final manifest SHA256: `7d93c85b6204d32e3330de9836de714ef70de443817f6ae1fa320bf63b11dce7`.
All294 source/runtime files match; separate fresh preview has identical bytes and no
workspace environment or data. Both fresh boot/readiness and final SEO passed.

- Frozen install:198 packages, zero vulnerabilities.
- `npm run test:ci`: syntax, types, formatting/lint, deadcode, production audit,
  **169 integration tests and83 browser cases pass**. One separately enabled font
  diagnostic was intentionally skipped in the offline composite, then attempted.
- PostgreSQL16: real disposable loopback outage/recovery, locks, migrations and
  snapshot restore suite passes; cluster stopped, evidence retained in its named
  synthetic temp directory. No hosted database touched.
- Boundary verifier:33 probes pass, including positive own-account access, 401/403,
  cross-account denial, malformed/null/oversized inputs, retries and concurrent signup
  at limit-1. Initial GET-list404 was a wrong harness route, corrected to overview.
- SEO:12 canonical pages,3 social images, aliases/noindex and actual404 pass.
- Rendered review:12 recovery states and20 populated planner/member states,
  AR/EN, both themes,320/390/768/1440px, an enlarged-text view. The populated review's
  14 axe states pass with zero violations. Recovery review has8 axe states; four
  desktop states expose the serious label mismatch V9-01 (same root cause), while
  eight account states also record the heading-outline best-practice observation.
  Keyboard retries work; no measured overflow or page exceptions in these32 views.
- The exact label-rule positive control confirms current source fails and a temporary
  browser-only accessible name including visible text passes. No source patch was made
  after entering final verification, as required by the invoked skill.
- Real-font all-face diagnostic was attempted without weakened assertions. It is
  UNVERIFIED because the cap was exhausted:18 counted site requests +12 counted public
  font GETs =30 total. Cached successful font responses were reused; additional font
  requests were blocked, causing the diagnostic's honest nonzero exit.

### Verdict and thoroughness receipt

**NO-GO for production.** The local functional composite passes, but final review
found a new accessibility defect (V9-01), the all-font diagnostic is incomplete, and
production is not this candidate. Viber phase9 says: "No new fixes here. If
verification finds a new or regressed blocker ... the verdict is NO-GO and the next
step is 'run viber again'." This is why the newly found issue is recorded for the
next gate instead of silently changing the verified source. No universal/perfect
feature guarantee is made.

```text
COVERAGE
- Risk boundaries executed:107/133 (80.45%):93 HTTP patterns +all14 socket commands.
- Of93 HTTP patterns,88 include a positive response and5 have denial/failure only.
- Runtime/schema files fully read:22/80; remaining58 had scoped reads/scans/test
  evidence, not full-file claims. Exact names/reasons/depth: evidence/coverage.json.
- Critical flows traced locally:14/14; real provider/device/hosted acceptance unverified.
- Production requests:18 site +12 public font GETs =30/30; no login/write/paid call.
- Command ledger:21 zero exits,16 nonzero exits. Nonzero entries include deliberate
  pre-fix regressions, harness mistakes, final accessibility finding and capped font
  diagnostic; they are retained, not overwritten or counted as all-green checks.
- Dropped candidate families:36 (trace10, sweep19, independent fix refutation7).
FIXES
- Six concerns committed locally on viber/2026-10-23; all targeted after-checks pass.
- Open:V9-01; owner:live artifact/configuration, real integrations, HSTS.
- Final source/preview parity:294files, zero mismatches, no env copied.
CONFIDENCE
- Medium: substantial fresh functional/runtime evidence, but not every branch or file
  fully reviewed, and external production/provider acceptance remains unavailable.
- Most likely review limitation: mount-path ambiguity excludes26 API patterns from
  runtime inventory matching; many are exercised by suites but are not counted here.
- Other limits: synthetic media/providers; no multi-instance/load proof; no real-user
  retention/field-performance measurement; no Docker image build or hosted rollback.
```

The request observer initially captured Express's mutable mounted req.url. Coverage
therefore uses only unambiguous actual mount projections, excluding ambiguous
observations rather than inventing counts. Later boundary probes record originalUrl.
No source-only trace is added to the executed numerator. Risk patterns with only
denial responses and all uncounted paths are listed explicitly in coverage.json.

### Owner hand-over and next action

1. Next local gate: correct the logo accessible name (including its shared twins),
   re-run that rule and the affected browser suite; complete font checks with a new
   bounded request plan. This candidate remains for review, not release approval.
2. Owner: verify real camera/blur, remote observer and revoked provider tokens on
   supported devices; verify Google configuration and a transactional-mail delivery
   integration. Recovery currently supports disabled/local test delivery, not a
   production transactional sender; do not describe test outbox success as live email.
3. Owner: after the gate clears, approve the exact replacement release SHA, hosted
   migration +backup/restore/rollback rehearsal, and deployment. No push/merge/deploy
   happened here. Reconcile active TLS proxy/HSTS and verify live routes afterward.

Week-one watches: provider camera/permission and token failures; account recovery and
provider discovery during outages; single-instance database lease/readiness, backups
and private reminder retry. Watch error rates and explicit unavailable states, never
infer zero activity from unavailable data.

Manual acceptance before real users (four checks): camera/blur with another device;
Google and actual recovery email end to end; sandbox hosted checkout/reconciliation;
staging restore/restart/revocation and exact production-source/HTTPS validation.

Local preview: `http://127.0.0.1:3522/app#planner`. Synthetic seeded reviewer details
and exact launch command are in README.md. Merged:no. Pushed:no. Deployed:no.

Delivery gallery:36 verified screenshot links (four before,12 recovery,20 populated).
Gallery itself was rendered at390/1440px; all four filters, image counts and axe checks
pass. `evidence/delivery-verification.json` records final link/image/archive checks;
`evidence/artifact-manifest.json` contains reproducible file hashes.
