# Consolidated findings and fix evidence

> Historical findings before authorization to edit dirty files. See [remediation](remediation/RUN.md) for their resolution and current evidence.

Starting SHA: `0e3d4771b6ae092c8c2dd74504d5e5b20abb1d5b20abb1d5b`. Local branch: `viber/2026-10-20`. No push or deployment.

| ID | Priority | Status | Finding / smallest next action |
|---|---|---|---|
| V9-01 | **P0** | **OPEN / blocked by pre-existing dirty server file** | A guest sends Socket.IO `create-room` with JSON `null`; the handler destructures it at `co-study-server.js:2218`, throws an unhandled TypeError and terminates the process. Reproduced on isolated Node 22: health 200 and valid create succeeded before the packet; connection disconnected and subsequent health returned ECONNREFUSED. Evidence: `evidence/socket-boundary.json`. Validate packet object shape and callback shape before every handler, catch rejected async handlers centrally, and test that malformed packets/storage failures never kill the server. No live exploit probe was sent. |
| V2-01 | P1 | FIXED locally; image build unverified | Docker `COPY . .` included local `.env`, account data, embedded SQL and review artifacts. `.dockerignore` now excludes these and retains runtime source/migrations/assets. Commit `3b6440f`. Source-rule before/after matrix in `evidence/docker-context-rules.json`. No image publication or prior credential compromise is asserted. |
| V2-02 | P1 release | OWNER | Most new platform source and matching entrypoint/package edits were uncommitted before this run. HEAD cannot reproduce the feature set. Prepare one reviewed release candidate including required imports/migrations/assets and excluding unrelated blog/image work; verify in a clean checkout. Do not selectively ship only the three review commits. |
| V3-01 | P2 | BLOCKED by pre-existing dirty file | Rejected profile PATCH changes displayName before later field validation fails. Local request returned 400 AVATAR_COLOR_INVALID; subsequent authenticated GET showed changed name. Validate every field into a candidate before changing the account. `auth-routes.js:143-170`; aliases TR-01/SW-01. |
| V3-02 | P2 | BLOCKED by pre-existing dirty file | Profile, legacy focus and stats import acknowledge success after a debounced write, while signup/logout/delete await durable flush. Await persistence consistently and return failure on rejected storage writes; preserve/recover state deliberately. This is source-traced, not a live-database outage reproduction. Aliases TR-02/SW-02. |
| V3-03 | P2 | BLOCKED by pre-existing dirty files | Account stats/room failures become zero/empty data; failed auth read becomes guest. Show unavailable/retry states without destroying signed-in state. `account.html:627-635`, `halastudy-core.js:163-165`; alias TR-03. |
| V3-04 | P2 | BLOCKED by pre-existing dirty files / product lifecycle | Deleting a circle owner leaves a private active circle with null owner and no member able to manage it. Choose explicit transfer or archive behavior during deletion, preserving remaining members' data/access policy. This is not public exposure; members can leave. Alias TR-04. |
| V3-05 | P2 | FIXED locally | Lobby omitted the shared feedback script and silently ignored rejected joins/publish failures. Loaded the existing UI helper, restore the name gate after join failure, disconnect the failed socket, show translated join/camera errors, and restore the camera control in finally. Commit `0c91440`; two final lobby browser tests pass. Before probe encountered absent HalaUI; source trace also confirmed ignored error branches. |
| V5-01 | P2 | FIXED locally | Public `?demo=N` invented participant tiles. Removed filler injection, preserving real presence and empty-state behavior. Commit `594ce74`. Regression failed before (12 participants instead of 1), passed after; local final lobby suite passes both cases. Scope is one visitor's rendered view, not server or global occupancy. Alias SW-03. |
| V6-01 | P1 release | OWNER | Live `/app`, `/plans`, `/supervisor`, `/api/platform/catalog` and `/api/platform/me` all return 404. This confirms the new implementation is local only. Deploy a verified candidate only after live-data migration/rollback preparation; then repeat real-domain acceptance. |
| V6-02 | P2 | OWNER | Live HTTPS root has no Strict-Transport-Security header. Root nginx.conf includes it, bootstrap Nginx template does not. Apply consistent HTTPS-edge configuration and verify the live header; no server configuration was changed here. |
| V7-01 | P2 candidate | UNVERIFIED / managed PostgreSQL | Pool connections have a 10s establishment timeout, but statements/transactions have no explicit deadline. Define and test interactive/maintenance limits against disposable PostgreSQL. No managed-DB outage was reproduced; not a confirmed exploit. Alias SW-05. |

## Critical blocker

**Do not release this state.** V9-01 is an unauthenticated process-crash condition, not just a UI error. The entrypoint has no process-level exception handler that keeps the app alive. A process manager restart would not remove the input that caused the crash. Existing ordinary tests did not cover this raw-null socket payload.

The proof includes a successful valid request as a positive control and the exact packet plus resulting error. `probe-socket-boundary.ps1` is the dedicated local reproducer. Since this was confirmed during phase 9, the skill says to record it and make the next step a fresh `viber` run after repair; it also affects a file already dirty at the start.

## Fix eligibility and scope

Viber's auto-fix bar says: “Does not touch a file that was dirty before the run — record it as blocked instead.” The socket blocker and four account/circle findings affect existing implementation work and were preserved. This is a skill-imposed boundary, not a request for approval or a claim that the issues are harmless.

The Docker/lobby files were clean at the start and qualified for small fixes. Commits used exact paths only and a per-command `Codex <codex@localhost>` author identity because the repository had no configured author. No global Git configuration changed.

Real payment processing remains deliberately unimplemented under the user's choice: one VIP tier, USD 4.99/month, local simulator until a provider is selected. This is a known release limitation, not a surprise billing defect. No payment/pricing logic was changed.

## Independent refutation

The read-only reviewers independently checked the consolidated issues. None of the four account/circle issues was defeated by an upstream guard. Four over-broad interpretations were removed: proven secret compromise, orphan-circle privacy exposure, global occupancy corruption and intentional passive viewer fallback as a failure. See SWEEP.md.

Timing-sensitive circle selection, attendance for already-connected early arrivals, retry-idempotency after schedule persistence failures and managed-database timeout behavior remain follow-up probes, not claimed verified vulnerabilities.

## Owner batch

1. Repair the socket input/async error boundary across all handlers, add crash-survival regressions, and run `viber` again. This P0 takes precedence over release work.
2. Resolve the four account/circle lifecycle and failure-state findings; review/package the entire current implementation while preserving unrelated blog/image edits, and verify a clean candidate.
3. Recover current live data, dry-run migration against a copy, prove backup restore and single-instance rollback, and verify external OAuth/video/TURN/R2 configuration.
4. Select and integrate the payment provider before offering real VIP purchases; keep the local simulator unavailable in production.
5. Apply the verified release and HTTPS-edge HSTS configuration, then verify the new routes and operating telemetry on the real domain.
