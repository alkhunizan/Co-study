# Viber production gate — 20 October 2026

Mode: full auto, all nine phases. Target: current local Halastudy implementation.
Repository: `E:\D-Backup\OS\Claude-Projects\body_doubling_live_cam\workspace\Co-study`.
Starting branch: `fix/identity-and-room-switch`; starting HEAD: `0e3d4771b6ae092c8c2dd74504d5e5b20abb1d5b20abb1d5b`.
Review branch: `viber/2026-10-20`. Initial dirty paths: [evidence/pre-existing-dirty.txt](evidence/pre-existing-dirty.txt).
All review outputs stay in this dedicated folder, following the user's instruction instead of the skill's home-directory default. No push, merge, deployment, live writes, real payment or metered provider calls.

## 1. Map

Halastudy provides bilingual live study rooms, member progress, private circles and supervision.
Guests, members, VIP members, circle supervisors and named MFA-protected staff use separate server-enforced capabilities.
It stores account/room/activity data in local PGlite or PostgreSQL, has legacy Supabase compatibility, Google OAuth and Cloudflare media/backups; VIP USD 4.99/month currently has local simulated checkout only.

Classification: web UI, HTTP API, Socket.IO realtime server, maintenance CLI and backup scheduler. No native mobile application or payment webhook implementation.

Trust boundaries: public pages -> signed account session -> account-specific SQL operations; staff operations additionally require short-lived MFA sessions and named permissions. Circle supervisor is a scoped membership role, not a global administrator. SQL is server-only; no public database key used by the new platform. Media tokens are issued by the server; browser media connects separately to peers/provider.

Critical flows: signup/login/Google linking and reauthentication; durable profile/logout/deletion; room create/join/password/capacity/media tokens; private circle invitation/membership/scheduling/attendance; server-timed focus/XP; fixed VIP entitlement and simulator; MFA/bootstrap/staff moderation; backup/restore.

Risk denominator: 10 groups, enumerated explicitly for the receipt: (1) signup/password sessions, (2) Google identity/reauthentication, (3) profile/deletion, (4) room/socket/media access, (5) circles/supervision/attendance, (6) focus/XP, (7) test billing/entitlements, (8) MFA/named staff, (9) backup/restore, (10) production release/external-provider operation. Per-file/endpoint inventory is recorded separately in TRACE.md. Coverage will be counted from actual runtime exercises, not code reads. The preceding prose groups some of these together; it is not an additional denominator.

Commands discovered: npm ci; npm run check/typecheck/lint/deadcode/audit:prod; npm run test:integration; npm run test:smoke. CI runs the same gates on Node 22. No frontend compilation/build exists: explicit HTML/static routes are the production artifact. Docker and PM2 are supported deployment paths.

Release evidence: dependency audit and formatting/lint commands exist; backup/restore and migration runbook exist. No verified managed-PostgreSQL deployment, live data parity or real payment integration. Existing implementation evidence is historical to this gate and will not be counted as a fresh run.

Backend target gate: local `.env` contains configured Cloudflare/R2 credentials; values never printed or copied. `server.js` does not load `.env`. Tests explicitly clear Supabase/Postgres, use isolated local files or memory databases, and stub OAuth/video providers. Review commands also clear cloud credentials and disable scheduled backups. No provider helper CLI will be run.

Repeat-trap checklist: sibling guards, visible failures, abuse/cost limits, follow-on defects, documentation enforcement, shipped/tracked parity, cross-user data/cache, secrets, malformed input, and release evidence are assigned to phases 3–7.

## Progress

1. Map complete.
2. Boot completed against isolated test runtimes; final affected checks rerun.
3. Trace complete: TRACE.md, including endpoint inventory.
4. HTTP/browser probes executed and final replay completed.
5. Sweep complete: SWEEP.md and independent refutation.
6. Visitor complete: 13 counted public GETs; SECURITY.md.
7. Secure complete: SECURITY.md.
8. Fix pass complete: three local commits; FINDINGS.md.
9. Complete: **NO-GO**, primarily because V9-01 is a reproduced unauthenticated process crash.

## 2. Boot and release artifact

Frozen `npm ci --ignore-scripts` against a dedicated copy of the manifest/lockfile succeeded (198 packages). It used shell Node 24 and printed the expected Node-22 engine warning. App tests and quality commands use Node 22. No production install scripts or provider helpers ran.

Initial syntax, types, lint, dead-code and audit passed; exact commands/exits/durations are in `evidence/quality-ledger.json`. There is no frontend build command. The documented server entrypoint boots through the existing isolated server-control fixture, which captures its printed URL and sends real HTTP requests.

Clean Git isolation was **not proven**: pre-existing uncommitted implementation spans new modules/migrations/assets plus modified entrypoint and manifests. An unchanged HEAD checkout would test the older application, not this feature set. V2-02 remains a release gate. Docker is not installed; image build/boot remains UNVERIFIED.

The initial integration/browser runs used a conservative `VIDEO_PROVIDER=mesh` override and network-drive temporary data. This override changes the CSP expected by a default-provider test, so that failure is a harness configuration issue, not a removed CSP guard. The runs also hit 45/60/120-second browser/startup/storage limits while suites ran concurrently. Original failures are retained. Affected checks are being replayed with their intended default provider and dedicated local-disk temporary folders; no assertion or timeout was weakened.

Local temporary execution folders: `%LOCALAPPDATA%\Temp\halastudy-viber-2026-10-20\...`. Durable audit outputs remain in this repository folder. Existing unrelated processes and the service on port 3000 were not stopped.

## 3–7. Trace, probe, sweep, visitor, security

Read-only phase 3 and 5 agents were used under the explicitly invoked skill's parallelism instruction. They edited only TRACE.md/SWEEP.md. Runtime probes, application fixes, local commits and the verdict remain on the main agent.

`evidence/local-probes-before.json` records actual requests/responses, including rejected profile mutation, safe malformed-input HTTP errors, unauthorized API access, cross-account denials, owner positive controls and a 20-request concurrent login burst. The first browser probe stopped when it discovered the lobby had never loaded HalaUI; its earlier HTTP results remain valid. The corrected final probe completed and replayed a saved pre-fix lobby negative control. HTTP handling and socket handling are distinct: the later socket probe exposed the P0 despite safe HTTP errors.

Explicit live probes: 12 GETs to halastudy.com plus one GitHub repository metadata GET, all individually counted; no redirect following or production-page browser loads. Root responds 200; workspace/plans/supervisor/platform endpoints are 404. Repository metadata says public. All saved response cookies were redacted. **Cap-accounting limitation:** existing local browser suites can load public font/CDN assets, and those requests were not instrumented. Therefore 13 is the deliberate probe count, not a verified count of every external asset request; compliance with the skill's aggregate 30-request cap is unverified. The additional local probe harness blocks HTTPS asset requests.

Full-history scanning encountered a broken `refs/codex/turn-diffs/checkpoints/...` object. No refs were repaired/deleted. A reachable-branch fallback scan was recorded but does not establish absence of historical secrets; pattern matches alone are not evidence of compromised credentials.

## 8. Fix pass

- `3b6440f` — V2-01, Docker context excludes secrets/runtime data/review artifacts.
- `594ce74` — V5-01, remove fabricated public lobby participants; before test fails, after passes.
- `0c91440` — V3-05, load shared UI and show recoverable bilingual join/camera errors; both lobby tests pass.

No pre-existing dirty application path was edited or committed by this gate. Four account/circle findings remain blocked under the skill's explicit dirty-file guard. No payment logic or external state changed. Detailed evidence, aliases, severity boundaries and owner batch: FINDINGS.md.

Independent refutation retained the findings but removed four over-broad impact claims. Sweep dropped 113 irrelevant pattern-hit lines (not 113 unique defects); see its exact accounting. Phase 1/2 had no dropped defect candidates; runtime malformed-input and cross-user probes refuted broader leakage/500 suspicions. Exact final counts are in the receipt below.

## Final verification checkpoint

All 28 browser tests pass across the original run, six targeted reruns and two new lobby regressions. Four fresh platform screenshots (1440 English home, 900 Arabic VIP, 390 Arabic circles, 390 English dark progress) were inspected. The four layouts also passed the existing axe assertions. This is bounded layout/accessibility evidence, not a site-wide certification.

The complete integration run exercised 89 tests: 85 passed, 3 failed, 1 timed out. The health/CSP/storage rerun passed all three affected checks with intended provider defaults and local-disk state. A later video-membership test encountered missing installed `dijkstrajs` files; the final dead-code scan likewise found missing Playwright transpiler files. These packages existed during earlier successful checks. The final video-membership rerun passed against the local candidate, making **89 unique existing integration checks passed across runs**. The separate crash-survival security check fails and is not included in that green corpus.

The final review confirmed **V9-01 P0: unauthenticated socket payload crashes the process**. An isolated server returned health 200 and successfully created a valid room, then terminated with TypeError at `co-study-server.js:2218` after `create-room` received `null`; health afterward returned ECONNREFUSED. See `evidence/socket-boundary.json` and `probe-socket-boundary.ps1`. No production malformed-packet probe was sent. Under the phase-9 rule, this new blocker is recorded for repair and a fresh viber run; the server file also falls under the pre-existing dirty-file guard.

Dependency-repair copy encountered missing source files too: the network-drive frozen-install dependency directory changed from a complete install to one remaining directory during verification. No cause was established and no unrelated process was stopped. A dedicated local-disk candidate was installed with the Node 22 executable explicitly invoking npm, then used for final checks. Its first typecheck lacked the original `types.d.ts` in the copied snapshot; copying that unchanged declaration resolved the harness omission. **151 copied source/config files match the checkout by SHA-256**, with zero mismatches (`candidate-source-parity.json`). This is a source snapshot, not an immutable Git release or complete media-asset package.

The stable candidate's locked dependencies were copied back without deletion or version changes; Robocopy exit 1 means successful copies. The repaired original checkout's dead-code scan then passed. No temporary app server remained in the final process inventory. Frozen-install/cache/test data remain in dedicated ignored/local execution folders; no real user data was created.

## 9. Verdict and thoroughness receipt

**NO-GO.** V9-01 is a verified P0 availability failure on the current source. It must be fixed before release even though ordinary tests pass. The source remains partly uncommitted, current production lacks the new routes, and external operating evidence is incomplete.

### Final verification ledger

| Check | Final result | Evidence / exact command |
|---|---|---|
| Frozen install, Node 22 | PASS | `node22 npm-cli.js ci --ignore-scripts --no-audit --no-fund`; `candidate-install-node22.log` |
| Syntax | PASS | `npm run check`; `candidate-check.log` |
| Types | PASS | `node22 node_modules/typescript/bin/tsc -p .`; `candidate-typecheck-final.log` (earlier snapshot omission retained in candidate ledger) |
| Lint / formatting | PASS | `npm run lint`; `candidate-lint.log` |
| Dead code | PASS | `npm run deadcode` in candidate, then `node22 node_modules/knip/bin/knip.js --no-progress` in repaired checkout; `deadcode-repaired.log` |
| Production dependencies | PASS, zero advisories | `npm run audit:prod`; `candidate-audit-prod.log` |
| Existing integration corpus | 89 unique passed across runs | Full `node --test --test-concurrency=2 "tests/integration/*.test.js"` plus name-filtered health/CSP/storage and video-membership reruns; original 85/3/1 outcome is preserved |
| Browser corpus | 28 unique passed across runs | Playwright full 26-test run, six affected reruns, two new lobby regressions; `browser.log`, `browser-rerun.log`, `lobby-final.log` |
| HTTP/boundary/visitor probes | Executed; findings retained | `probe-local.ps1`: 75 HTTP probe records (one represents a 20-call burst), 40 protected platform routes all 401 anonymously, authenticated positive controls; `local-probes.json` |
| Socket survival | **FAIL / P0** | `probe-socket-boundary.ps1`; valid create succeeds, raw-null event terminates server, health becomes ECONNREFUSED |
| Docker image | UNVERIFIED | Docker unavailable; source-level context exclusions checked only |
| Clean Git release / deployed new journeys | UNVERIFIED / absent live | Required feature files predate this run as dirty/untracked; new production routes return 404 |

The ledgers retain unsuccessful attempts; they are not rewritten to imply one all-green run. Final five quality commands and the Node-22 frozen install pass. Integration/browser coverage is the union of named runs, not the sum of repeated tests. The probe runner exiting 0 means it collected evidence; it does **not** make the socket survival condition pass.

### Coverage

- Risky-surface groups exercised locally: **9 of 10 (90%)**. External production/provider operation is partial/read-only and remains unverified. Coverage measures examination, not correctness; a covered group contains the P0.
- End-to-end local flow traces: 9 of 9 application groups; external production operation is not fully traced. Detailed UI-to-storage/failure chains and endpoint/socket inventory: TRACE.md.
- Full source/body reads: 46 of the initial 160 scanned first-party files, plus the new lobby regression file. Remaining files received partial/search coverage or were not opened fully. Highest-risk partial reads include the large server, account/open/room/lobby HTML, shared auth UI and platform client; full-file review is not claimed. Exact reviewer read lists are in TRACE.md/SWEEP.md.
- Runtime: nine local groups; one production/external group read-only/partial. The final HTTP file has 83 evidence records, including 75 HTTP probe records and browser/control summaries; the socket crash has a separate controlled target.
- Explicit public probes: 13 (12 site GETs + GitHub metadata). Additional font/CDN requests from existing local browser tests were not counted; aggregate external-request-cap compliance is unverified.
- Verification groups: six final install/quality gates pass; two ordinary test corpora pass across reruns; socket-survival fails; Docker and immutable/deployed release remain unverified. Raw shell/tool discovery commands were not all timed, so no fabricated all-command total is claimed.
- Dropped candidates: 113 irrelevant pattern-hit lines in phase 5; four exaggerated impact interpretations narrowed in refutation. Zero whole verified findings dropped. No P0 was dismissed as a harmless test failure.

### Fixes and remaining work

- **3 fixes committed locally**, on `viber/2026-10-20`: V2-01, V5-01, V3-05. Diff from starting HEAD changes only `.dockerignore`, `lobby.html` and the new lobby test. Existing feature/blog/image changes were preserved.
- **8 confirmed open findings**: V9-01, V2-02, V3-01/02/03/04, V6-01/02. V7-01 is an additional unverified managed-PostgreSQL candidate, not a reproduced exploit.
- Owner batch: five prioritized actions in FINDINGS.md. No push, merge, deployment, live data write, provider transaction or credential rotation occurred.
- The required project journal was appended. Cross-project memory was not updated because no direct memory-update request was made.

### Confidence

**Medium overall; high in the reproduced crash and targeted local fixes.** The most likely omission is another malformed socket/async-failure sibling in the large server, whose complete hostile-input matrix was not exercised. Managed PostgreSQL, external provider settings, production data/migration/restore, immutable release packaging and Docker were not verified. Network-drive dependency instability complicated the first runs; final checks used and verified a stable local source snapshot.

Next step: repair the socket boundary, add surviving-server regressions across every event family, resolve the existing dirty-file findings, and run `viber` again before release. First-week risks and five manual acceptance checks are in README.md.
