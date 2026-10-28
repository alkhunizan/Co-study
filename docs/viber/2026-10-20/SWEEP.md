# Phase 5 — source sweep

Date: 2026-10-20. Read-only review of the working tree; no test execution, network calls, source edits, staging, commits or deployment by this reviewer. Findings below describe the inspected snapshot, before the main agent's fix pass.

Coverage: 160 first-party source/document/config files received text-pattern scans (JS, HTML, Markdown, JSON and YAML; dependencies, lockfile and generated evidence excluded). **28 files were read in full**, plus substantial relevant sections of `co-study-server.js`, `lobby.html` and `public/js/platform.js` (**31 contextual file reads**). Match excerpts from additional files are scan coverage, not full file reads. Reviewed all 12 platform modules, auth routes, schema, maintenance/backup/preview tooling, deployment scripts and implementation status/runbook.

## Findings

| ID | file:line | pattern | reachable? | why it bites | fix | S/M/L |
|---|---|---|---|---|---|---|
| SW-01 / P2 | `services/auth/auth-routes.js:153` | 5, 6, 11 — partial mutation before validation | Yes, authenticated `PATCH /api/me/profile` | A valid new display name is assigned before avatar/bio validation. Sending a new name plus invalid avatar or oversized bio returns 400 but changes the in-memory account. A later unrelated flush can persist the rejected change. This is directly established by statement order; not dynamically reproduced in this read-only phase. | Validate a complete candidate first, then apply the accepted mutation. Cover valid+invalid field combinations and unchanged state after rejection. | S |
| SW-02 / P2 | `services/auth/auth-routes.js:169`, `:182`, `:208`; `services/platform/record-store.js:88` | 4, 5, 6 — acknowledgement before durable write | Yes: profile save, legacy focus log and legacy history import | These siblings return success after `persistUsersSoon()`, whose SQL store write runs later and logs errors. Signup/logout/delete correctly await `flushUsers()`. A storage failure can therefore yield a successful user-visible save that is lost on restart. Legacy totals are distinct from validated platform XP, which uses awaited transactions. | Await persistence at these user-facing mutation boundaries, restore the appropriate candidate state on failure and return a retryable failure. Preserve existing serialized store writes and test failure behavior across all three siblings. | M |
| SW-03 / P1 | `lobby.html:344` | 3, 8 — production demo data | Yes, public `/lobby?demo=N` and presence updates | `setParticipants` appends invented names and marks some tiles `cameraOn`. Production route serves this same page. A shared URL can display invented room occupancy/live labels. The real participant path already exists. | Remove the production query-string filler; keep density fixtures inside browser tests. Check plain and query-string lobby views. | S |
| SW-04 / release gate | `platform.html:12`; `co-study-server.js:31`; `scripts/deploy/bootstrap.sh:36` | 12 — shipped versus tracked | Local imports work; Git-based release does not include current untracked files | Git status identifies `services/platform/`, `db/`, `platform.html`, new CSS/client scripts and new tests as untracked. `git ls-files` returned no entries for the checked platform import set. The deployment bootstrap clones/pulls `main`. Deploying the current repository commit cannot reproduce this working tree. This is a packaging state, not evidence that local files are absent. | The main agent must preserve unrelated dirty blog/image work and explicitly prepare/review the complete release file set. Do not call this implementation deployed or reproducible from HEAD yet. | M |
| SW-05 / P2 candidate | `services/platform/database.js:13`, `:26`, `:31` | 10, 11 — database timeout/recovery boundary | Conditional: managed PostgreSQL configured | Pool connection establishment has a 10-second timeout; normal queries and transaction statements have no configured statement/query deadline. A lock wait or stalled database query can retain HTTP requests and transaction clients indefinitely. This is a source-confirmed missing bound, not a measured live outage. Managed PostgreSQL was not exercised here. | Establish configurable statement/transaction limits appropriate to maintenance versus interactive traffic; verify rollback and user-facing retry errors against a disposable PostgreSQL instance. | M |

## Pattern checklist

| Pattern | Result | Evidence / limit |
|---|---|---|
| 1. Secret-shaped literals | CLEAR for scanned patterns | Zero matches for sufficiently long vendor key forms, credential-bearing PostgreSQL URLs and JWT-shaped tokens in the 160-file scan. Values were never printed. This is not an entropy scanner or a scan of ignored local secrets/history. |
| 2. Machine-specific values | UNVERIFIED overall | Broad scan returned 294 lines / 62 files; many were ordinary HTTPS URLs matched by the loose drive-path expression. Reviewed local preview addresses, deployment paths, example placeholders and fixed ports are intentional/configurable. Did not individually adjudicate every historical document/email match; no blanket redaction claim. |
| 3. Debug/temp code | FINDING | SW-03. Operational log statements and test fixtures were not treated as debug leakage. |
| 4. Swallowed errors | FINDING | SW-02. Auth deletion's secondary rollback failure is swallowed but the original request still returns an error; no false-success claim for that catch. |
| 5. Async/races/loading | FINDING | SW-01/SW-02. Platform mutations generally await transactions; client `work` disables submitting controls, catches errors and restores controls in `finally`. |
| 6. Sibling drift / overwritten filters | FINDING | Persistence sibling matrix below. No overwritten access filter found in reviewed spread sites. Platform client spreads override converted form fields intentionally; cohort spread adds computed authorization flags rather than dropping a query guard. |
| 7. TODO/placeholder/skips | CLEAR in scan | All 87 returned lines were false positives: the actual shared to-do feature, `applyLangToDom` substring matching, historical prose or TODO-document references. No production placeholder or skipped-test directive identified. |
| 8. Mocks/stubs/fallbacks | FINDING | SW-03. Billing simulator is deliberately server-gated off in production; it is not a live payment fallback. |
| 9. Client-only limits | CLEAR in reviewed platform | Price/currency constrained in SQL, live/test mode checked server-side, ownership and permission checks server-side, cohort capacity locked, focus time/XP server credited. |
| 10. DB failures/unbounded lists | FINDING / UNVERIFIED at scale | SW-05. `/me` cohort list, managed-room list and staff roster have no cursor/limit; cohort membership caps bound a single circle, not total joined circles. Marked scaling work, not a demonstrated outage. History, export, audit, cases and subscription lists are explicitly bounded. |
| 11. Validation/error/recovery | FINDING | SW-01/SW-02/SW-05. Platform unknown failures become generic 503 responses. Required live managed-database recovery verification remains outstanding. |
| 12. Shipped/tracked | FINDING | SW-04. New source assets exist locally but were untracked at inspection. No claim of a completed release artifact. |

## Sibling guard matrix

| Family / twin | Authentication / scope | Durable failure observed by caller? | Other matched guard |
|---|---|---|---|
| Signup | Signup rate limit; duplicate email recheck after hashing | Yes, awaits flush and rejects | No cookie until persistence succeeds |
| Logout | Current account cookie when valid; retry still flushes | Yes | Revokes account epoch and sockets |
| Account deletion | Auth + password/provider-purpose reauthentication | Yes | Last-super-admin protection through platform purge |
| Profile PATCH | Auth + rate limit | **No: debounced save** | **Whole payload not validated before mutation** |
| Legacy focus log | Auth + rate limit + bounded minutes | **No: debounced save** | Separate personal stats; cannot award platform XP |
| Legacy stats import | Auth + rate limit + sanitized/max merge | **No: debounced save** | Cannot award platform XP |
| Platform focus start/update | Auth + account-owned row + user lock | Yes, awaited transaction | One open session; capped server time; idempotent completion |
| Test checkout create/complete/cancel | Auth + server test-mode check on all three | Yes | Account binding, fixed SQL price/currency, serialized account lock |
| Circle create/invite/accept | Auth + owner/membership/invite checks | Yes | Server VIP checks; locked owned/member caps |
| Circle schedule/promote supervisor | Auth + owner/supervisor scope | Yes | Owner must still hold VIP for new privileges/schedules |
| Circle remove/demote/leave/archive/cancel | Auth + appropriate owner/supervisor scope | Yes for SQL | Intentionally remains available after VIP expiry for cleanup |
| Staff read/write endpoints | Account + bound staff MFA + specific permission | Yes for SQL writes; operational effects may be runtime-only | Bootstrap substitutes operator password + MFA before first role; no permissionless post-bootstrap path identified |
| Staff role grant/revoke | Staff MFA + `staff.manage`, rechecked in transaction | Yes | Target MFA on grant; last super admin protected; target staff session invalidated |
| Progress list/export | Account owner filter | Read errors surfaced | Entitlement period; export permission server-side; explicit 100 / 10,000 bounds |
| OAuth normal login / security / deletion | Browser state + PKCE; subject-based identity | Login awaits account persistence | Purpose-bound reauthentication for sensitive operations; external fetch timeout present |

## False positives and security handoff

**113 hit-lines dropped after contextual review:** all 87 TODO/placeholder-search hits, plus 26 of the 31 debug/mock-search hits. Those 26 comprise historical/design prose and isolated test media fixtures; the remaining five lines are the single SW-03 demo block. Machine-pattern hits are explicitly not included in this dropped count because the full set was not individually adjudicated. Zero secret-shape hits require no redaction or dropped-hit count.

Passed to the main reviewer for phase 7/fix coordination: SW-01 rejected-request mutation, SW-02 false persistence acknowledgements, SW-03 visitor-visible synthetic presence. SW-05 is availability/recovery hardening with live-provider verification still needed. No credential values or user content copied into this report.

No fixes were made by this read-only subagent. The main agent's final fix/test evidence supersedes the initial source snapshot above; it should recheck the sibling matrix on every touched family.

## Phase 8 — independent refutation pass

Re-read the current Docker inputs and targeted source paths at the main agent's request. This pass attempted to disprove the consolidated findings by looking for upstream guards, intentional behavior or narrower effects. No application edits or tests were performed. Findings below use the main report's identifiers.

| Main ID | Refutation result | Scope / severity correction |
|---|---|---|
| V2-01 Docker context exposure | Original omission survives refutation; present `.dockerignore` change addresses the identified root-context paths. The previous rules excluded rooms JSON and backups but not users JSON or environment files; `COPY . .` supplied no other exclusion. | This establishes an image-build exposure path, **not proof that secrets existed, an affected image was built, or credentials were exfiltrated**. Root's fix excludes `.env*` except `.env.example`, all `data`, `docs` and `.gstack`. Image-build verification remains separate. |
| V3-01 rejected profile partially mutates | Retained. No later validator or middleware rolls back the already assigned display name when avatar/bio validation returns 400. | P2 account-state correctness. Main agent reports runtime confirmation; this reviewer independently confirms source ordering only. |
| V3-02 profile/legacy save acknowledges early | Retained. `persistUsersSoon` returns the store scheduling result; these handlers do not await it, and the store executes the pending SQL write on a later timer. | P2 durability. Do not extend this finding to platform XP, signup, logout or deletion: their critical transactions/flushes are awaited. Shutdown flush reduces normal-exit loss but cannot repair a failed save, crash or already-issued false acknowledgement. |
| V3-03 masked read outages | Retained. Shared auth cache converts rejected `/api/auth/me` into a cached null. Account stats catch leaves default values; room-history catch renders an empty list. No upstream retry/error state replaces them in these paths. | P2 misleading availability state. This is not authorization bypass: server auth remains enforced. A deliberate 200 guest response is valid; the defect is treating HTTP/network failure as that response. |
| V3-04 deleted owner leaves unmanaged circle | Retained. Purge deletes the user; the schema sets owner to null and retains the cohort. Membership does not appoint a successor. Remaining members cannot satisfy `canManage`; schedule resolves the null owner as free. | **P2 lifecycle, not privacy exposure.** Remaining membership still enforces private entry, and nonowners can leave. Supervisors can retain applicable attendance/cancellation capabilities. Avoid claiming all surviving functions are blocked. Owner transfer or explicit archival is needed for a coherent lifecycle. |
| V3-05 silent lobby failures | Retained with narrower description. Lobby includes core, Socket.IO and RealtimeKit client, but no `/js/ui.js`; core only consumes an existing `HalaUI`, and the RealtimeKit loaders do not provide it. Thus even the guarded ROOM_FULL toast has no local provider. Other failed joins return silently. | P2 error/recovery. **Passive viewer degradation to presence-only is explicitly intended** and alone is not a blocker. The stronger defect is failed join or user-initiated publishing with no actionable failure and the name gate already hidden. Do not claim media failure always means the entire lobby failed. |
| V5-01 synthetic lobby participants | Retained. Production serves the same HTML; `demo` has no environment guard. Actual presence runs through the filler function. | Narrow earlier SW-03 severity to **P2 trust/UI correctness**: the query affects that requesting browser, not stored membership, server quotas, other visitors or provider participants. It remains inappropriate production filler and is straightforward to remove. |

Docker fix compatibility review: `db/migrations/001-platform.sql`, application entry points, `services`, `public`, `design-system`, `images`, `audio` and `videos` are not removed by the new patterns. Dockerfile explicitly recreates `/app/data` and `/app/data/backups`. Account/room loaders accept missing legacy files as an empty initial state, and the embedded database creates its configured directory. Current runtime source reads environment variables rather than requiring a baked `.env`; reviewed page/script/runtime references do not require `docs` or `.gstack`. Therefore **no source-level missing-runtime-file blocker was found in this fix**. Existing persisted data still needs its intended volume/database at deployment; excluding it from an image is not a data-migration procedure. Docker build/boot was not executed by this reviewer.

False positives removed from the consolidated list: **0 entire findings**. Claims narrowed: inferred secret compromise, orphan-circle privacy exposure, global/server corruption from demo tiles, and intentional passive presence fallback. No new blocker beyond the retained defects and outstanding artifact/runtime verification was established.

## Initial sweep receipt — exact read paths

The 28 fully read files counted in the initial phase 5 denominator:

1. `docs/implementation/2026-10-20-platform/STATUS.md`
2. `docs/implementation/2026-10-20-platform/OPERATIONS.md`
3. `services/platform/billing.js`
4. `services/platform/index.js`
5. `services/platform/record-store.js`
6. `services/platform/access.js`
7. `services/platform/database.js`
8. `services/platform/catalog.js`
9. `services/platform/common.js`
10. `services/platform/cohorts.js`
11. `services/platform/progress.js`
12. `services/platform/maintenance.js`
13. `services/platform/routes.js`
14. `db/migrations/001-platform.sql`
15. `services/auth/auth-routes.js`
16. `public/js/focus-client.js`
17. `services/auth/google-routes.js`
18. `scripts/deploy/start.sh`
19. `scripts/deploy/bootstrap.sh`
20. `.github/workflows/ci.yml`
21. `package.json`
22. `services/ops/backup-scheduler.js`
23. `scripts/preview-platform.js`
24. `scripts/platform-maintenance.js`
25. `.gitignore`
26. `ecosystem.config.js`
27. `services/auth/reauth.js`
28. `scripts/backup-r2.js`

The three substantial partial reads counted separately:

1. `co-study-server.js`
2. `lobby.html`
3. `public/js/platform.js`

Skill instructions, scan-only matches and later phase 8 refutation reads are excluded from this initial 28 + 3 denominator.
