# Architecture review validation

20 October 2026

## Environment and scope

- Workspace: `E:\D-Backup\OS\Claude-Projects\body_doubling_live_cam\workspace\Co-study`.
- Baseline commit: `0e3d477` (`fix(security): sign anon session cookie + clean up prior room on switch`).
- Runtime used for these checks: Node `v24.19.0`. The project declares Node `22.x`; passing locally on Node 24 is not a substitute for the configured Node 22 CI run.
- Existing unrelated changes: two blog HTML files and untracked `images/og/`; preserved.
- Changed deliverables: only this dedicated review folder.
- Integration tests used local test servers, synthetic state, and fake media providers. Supabase and real RealtimeKit credentials were cleared in the test process. `TEMP` and `TMP` pointed inside `evidence/tmp`.

## Executed checks

| Check | Result | Evidence |
|---|---|---|
| `npm run check` | PASS, exit 0 | [Syntax log](evidence/syntax.log) |
| `npm run typecheck` | PASS, exit 0 | [Type log](evidence/types.log) |
| `npm run test:integration` | PASS, 73 tests, 0 failures, 0 skipped; about 230 seconds | [Integration log](evidence/integration.log) |
| `node docs/architecture/2026-10-20-platform-review/evidence/probe.cjs` | PASS: all three current-defect assertions reproduced | [Probe code](evidence/probe.cjs) · [Results](evidence/probe-results.json) |

The probe's success means the reported defects were reproduced, not that the behavior is correct. It uses only synthetic users and an in-memory fake database client; it does not call a real database.

## Confirmed probe findings

| Finding | Observation |
|---|---|
| F04 | Seven 240-minute records at one timestamp produce 1,680 total minutes and a 1,440-minute daily bucket. Sanitization changes the aggregate to 1,440. |
| F07 | A simulated Supabase deletion throws, but the store's flush resolves after logging `user_persist_failed`. |
| F08 | The shared sanitizer drops `authProvider` and `googleSub`; this affects file-store identity persistence. |

The remaining findings are based on source inspection. In particular, the live database's schema, row limits, grants and policies were not inspected; the repository cannot establish them.

## Checks outside this review

No new application functionality was implemented. Browser smoke tests, a live UX/accessibility sweep, Node 22 rerun, dependency audit, real payment/media tests, production load testing, and production verification were not run in this architecture task. Historical readiness reports were treated as historical evidence only.

## Execution notes

Git initially rejected the mapped network checkout as dubious ownership. Read-only Git inspection succeeded with a command-scoped exception for this exact repository; global Git trust settings were not changed.

One Stripe documentation variant URL returned an internal fetch error. The normal documented page with `?dashboard-or-api=api` loaded successfully and was used as the entitlement reference.

The source review found no relevant memory-registry entry for this project. Findings are based on the current files and the sources linked in the review.
